import { offlineDb, OfflinePurchaseRecord } from './offlineDb';
import { createLocalPurchase } from '../api/api';

/**
 * Converts a Base64 data URL to a standard browser File object for multipart upload.
 */
function base64ToFile(base64Data: string, fileName: string): File {
  const parts = base64Data.split(';base64,');
  const contentType = parts[0].replace('data:', '') || 'image/jpeg';
  const byteString = atob(parts[1] || parts[0]);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }

  return new File([uint8Array], fileName, { type: contentType });
}

export interface SyncResult {
  synced: number;
  failed: number;
  errors: Array<{ voucherNumber: string; error: string }>;
}

let isSyncing = false;

/**
 * Iterates through pending offline purchase vouchers and syncs them to the backend server.
 */
export async function syncPendingPurchases(): Promise<SyncResult> {
  if (isSyncing || !navigator.onLine) {
    return { synced: 0, failed: 0, errors: [] };
  }

  isSyncing = true;
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  try {
    const pendingPurchases = await offlineDb.offlinePurchases
      .where('syncStatus')
      .equals('PENDING')
      .toArray();

    if (pendingPurchases.length === 0) {
      isSyncing = false;
      return result;
    }

    console.log(`[SwakelolaSync] Found ${pendingPurchases.length} pending offline purchases to synchronize.`);

    for (const record of pendingPurchases) {
      try {
        const formData = new FormData();
        formData.append('rabItemId', record.rabItemId);
        formData.append('voucherNumber', record.voucherNumber);
        formData.append('purchaserName', record.purchaserName);
        formData.append('supplierName', record.supplierName);
        if (record.supplierContact) formData.append('supplierContact', record.supplierContact);
        formData.append('itemDescription', record.itemDescription);
        formData.append('quantity', String(record.quantity));
        formData.append('unitPrice', String(record.unitPrice));
        if (record.notes) formData.append('notes', record.notes);

        if (record.geotagLocation) {
          formData.append('geotagLocation', JSON.stringify(record.geotagLocation));
        }

        if (record.receiptPhotoBase64) {
          const file = base64ToFile(
            record.receiptPhotoBase64,
            `receipt_${record.voucherNumber.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`
          );
          formData.append('receiptPhoto', file);
        }

        await createLocalPurchase(record.projectId, formData);

        // Mark as SYNCED
        if (record.id) {
          await offlineDb.offlinePurchases.update(record.id, {
            syncStatus: 'SYNCED',
            errorMessage: undefined,
          });
        }
        result.synced += 1;
      } catch (err: any) {
        console.error(`[SwakelolaSync] Error syncing voucher ${record.voucherNumber}:`, err);
        const errorText = err.response?.data?.msg || err.message || 'Sync failed';
        if (record.id) {
          await offlineDb.offlinePurchases.update(record.id, {
            syncStatus: 'ERROR',
            errorMessage: errorText,
          });
        }
        result.failed += 1;
        result.errors.push({
          voucherNumber: record.voucherNumber,
          error: errorText,
        });
      }
    }

    if (result.synced > 0) {
      window.dispatchEvent(
        new CustomEvent('swakelola:sync-completed', {
          detail: { synced: result.synced, failed: result.failed },
        })
      );
    }
  } catch (error) {
    console.error('[SwakelolaSync] Sync process encountered fatal error:', error);
  } finally {
    isSyncing = false;
  }

  return result;
}

/**
 * Initializes automatic background synchronization on network reconnect.
 */
export function initOfflineSyncListeners(): () => void {
  const handleOnline = () => {
    console.log('[SwakelolaSync] Network connection restored. Initiating automatic background sync...');
    syncPendingPurchases();
  };

  window.addEventListener('online', handleOnline);

  // Attempt sync on initial boot if online
  if (navigator.onLine) {
    syncPendingPurchases();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
  };
}
