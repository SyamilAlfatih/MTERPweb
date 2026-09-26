import Dexie, { Table } from 'dexie';

export interface OfflinePurchaseRecord {
  id?: number;
  localUuid: string;
  projectId: string;
  rabItemId: string;
  voucherNumber: string;
  purchaserName: string;
  supplierName: string;
  supplierContact?: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  receiptPhotoBase64?: string;
  geotagLocation?: { lat: number; lng: number };
  notes?: string;
  syncStatus: 'PENDING' | 'SYNCED' | 'ERROR';
  errorMessage?: string;
  createdAt: string;
}

export class SwakelolaOfflineDB extends Dexie {
  offlinePurchases!: Table<OfflinePurchaseRecord>;

  constructor() {
    super('SwakelolaOfflineDB');
    this.version(1).stores({
      offlinePurchases: '++id, localUuid, projectId, syncStatus, createdAt',
    });
  }
}

export const offlineDb = new SwakelolaOfflineDB();
