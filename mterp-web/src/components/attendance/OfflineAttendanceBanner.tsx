import React, { useState, useEffect } from 'react';
import {
  WifiOff,
  Wifi,
  CloudUpload,
  RefreshCw,
  List,
  X,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Clock,
  UserCheck,
  UserX,
  Users,
  FileText,
} from 'lucide-react';
import {
  syncPendingAttendance,
  getPendingAttendanceCount,
  getAllOfflineAttendanceRecords,
  deleteOfflineAttendanceRecord,
  retryOfflineAttendanceRecord,
} from '../../services/attendanceSyncEngine';
import { OfflineAttendanceRecord, OfflineAttendanceType } from '../../services/attendanceOfflineDb';

interface OfflineAttendanceBannerProps {
  onSyncComplete?: () => void;
  className?: string;
}

export const OfflineAttendanceBanner: React.FC<OfflineAttendanceBannerProps> = ({
  onSyncComplete,
  className = '',
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showQueueModal, setShowQueueModal] = useState<boolean>(false);
  const [queueRecords, setQueueRecords] = useState<OfflineAttendanceRecord[]>([]);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const refreshCounts = async () => {
    const count = await getPendingAttendanceCount();
    setPendingCount(count);
  };

  const loadQueue = async () => {
    const records = await getAllOfflineAttendanceRecords();
    setQueueRecords(records);
  };

  useEffect(() => {
    refreshCounts();

    const handleOnline = () => {
      setIsOnline(true);
      refreshCounts();
    };

    const handleOffline = () => {
      setIsOnline(false);
      refreshCounts();
    };

    const handleQueueUpdated = () => {
      refreshCounts();
      if (showQueueModal) loadQueue();
    };

    const handleSyncCompleted = (e: any) => {
      setIsSyncing(false);
      refreshCounts();
      if (showQueueModal) loadQueue();
      if (e.detail?.synced > 0) {
        setSyncFeedback(`Berhasil menyinkronkan ${e.detail.synced} data presensi.`);
        setTimeout(() => setSyncFeedback(null), 4000);
      }
      if (onSyncComplete) {
        onSyncComplete();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('attendance:queue-updated', handleQueueUpdated);
    window.addEventListener('attendance:sync-completed', handleSyncCompleted);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('attendance:queue-updated', handleQueueUpdated);
      window.removeEventListener('attendance:sync-completed', handleSyncCompleted);
    };
  }, [showQueueModal, onSyncComplete]);

  const handleManualSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await syncPendingAttendance();
      if (res.synced > 0) {
        setSyncFeedback(`Berhasil menyinkronkan ${res.synced} data presensi!`);
        setTimeout(() => setSyncFeedback(null), 4000);
      } else if (res.failed > 0) {
        setSyncFeedback(`Gagal menyinkronkan ${res.failed} data. Cek daftar antrean.`);
      }
      await refreshCounts();
      if (showQueueModal) await loadQueue();
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenQueue = async () => {
    await loadQueue();
    setShowQueueModal(true);
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (confirm('Hapus data antrean offline ini?')) {
      await deleteOfflineAttendanceRecord(id);
      await loadQueue();
      await refreshCounts();
    }
  };

  const handleRetry = async (id?: number) => {
    if (!id) return;
    await retryOfflineAttendanceRecord(id);
    await loadQueue();
    await refreshCounts();
  };

  const getTypeLabel = (type: OfflineAttendanceType) => {
    switch (type) {
      case 'SELF_CHECKIN':
        return { label: 'Check-In Mandiri', icon: UserCheck, color: 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/60' };
      case 'SELF_CHECKOUT':
        return { label: 'Check-Out Mandiri', icon: UserX, color: 'text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-950/60' };
      case 'GROUP_SESSION':
        return { label: 'Sesi Absen Grup', icon: Users, color: 'text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-950/60' };
      case 'SESSION_LATE_ADD':
        return { label: 'Pekerja Susulan', icon: Clock, color: 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-950/60' };
      case 'SESSION_LEAVE_HOUR':
        return { label: 'Pulang Awal', icon: Clock, color: 'text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-950/60' };
      case 'SESSION_CLOSE':
        return { label: 'Tutup Sesi', icon: CheckCircle2, color: 'text-zinc-700 bg-zinc-200 dark:text-zinc-300 dark:bg-zinc-800' };
      case 'PERMIT':
        return { label: 'Izin / Sakit', icon: FileText, color: 'text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-950/60' };
      default:
        return { label: type, icon: Clock, color: 'text-gray-700 bg-gray-100' };
    }
  };

  // If online and no pending records and no feedback, don't show the banner
  if (isOnline && pendingCount === 0 && !syncFeedback) {
    return null;
  }

  return (
    <>
      <div
        className={`mb-4 p-3.5 rounded-xl border transition-all duration-200 shadow-sm ${
          !isOnline
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
            : pendingCount > 0
            ? 'bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-200'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
        } ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                !isOnline
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                  : pendingCount > 0
                  ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                  : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {!isOnline ? (
                <WifiOff className="w-5 h-5 animate-pulse" />
              ) : isSyncing ? (
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
              ) : pendingCount > 0 ? (
                <CloudUpload className="w-5 h-5" />
              ) : (
                <Wifi className="w-5 h-5" />
              )}
            </div>

            <div className="text-xs sm:text-sm">
              <div className="font-semibold flex items-center gap-2">
                <span>
                  {!isOnline
                    ? 'Mode Offline Aktif'
                    : isSyncing
                    ? 'Menyinkronkan Presensi...'
                    : syncFeedback
                    ? 'Sinkronisasi Selesai'
                    : 'Presensi Tersimpan di Perangkat'}
                </span>
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    {pendingCount} Antrean
                  </span>
                )}
              </div>
              <p className="opacity-80 text-[11px] sm:text-xs mt-0.5">
                {!isOnline
                  ? 'Koneksi terputus. Anda tetap dapat check-in, check-out, atau absen grup. Data akan otomatis disinkronkan saat tersambung internet.'
                  : syncFeedback
                  ? syncFeedback
                  : `${pendingCount} rekaman presensi menunggu sinkronisasi ke server.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={handleOpenQueue}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-current/20 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1.5 cursor-pointer"
              >
                <List className="w-3.5 h-3.5" />
                <span>Lihat Antrean</span>
              </button>
            )}

            {isOnline && pendingCount > 0 && (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary-hover active:scale-95 disabled:opacity-50 transition shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Sinkron...' : 'Sinkronkan'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Queue Modal */}
      {showQueueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-bg-white dark:bg-bg-surface border border-border rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <CloudUpload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-text-primary">
                    Antrean Presensi Offline
                  </h3>
                  <p className="text-xs text-text-muted">
                    Total {queueRecords.length} rekaman tersimpan lokal di perangkat ini
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQueueModal(false)}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-subtle transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {queueRecords.length === 0 ? (
                <div className="py-12 text-center text-text-muted">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2 opacity-80" />
                  <p className="text-sm font-medium">Semua data presensi telah tersinkron!</p>
                  <p className="text-xs opacity-75">Tidak ada antrean tertunda.</p>
                </div>
              ) : (
                queueRecords.map(record => {
                  const info = getTypeLabel(record.type);
                  const Icon = info.icon;
                  const isPending = record.syncStatus === 'PENDING';
                  const isSyncingRecord = record.syncStatus === 'SYNCING';
                  const isError = record.syncStatus === 'ERROR';
                  const isSynced = record.syncStatus === 'SYNCED';

                  return (
                    <div
                      key={record.id || record.localUuid}
                      className="p-3 rounded-xl border border-border bg-bg-surface hover:border-border-focus transition-all flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold flex items-center gap-1 ${info.color}`}>
                            <Icon className="w-3 h-3" />
                            {info.label}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              isSynced
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : isError
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : isSyncingRecord
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 animate-pulse'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {record.syncStatus}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {isError && (
                            <button
                              type="button"
                              onClick={() => handleRetry(record.id)}
                              title="Coba sinkronkan lagi"
                              className="p-1 rounded text-primary hover:bg-primary/10 transition cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(record.id)}
                            title="Hapus rekaman ini"
                            className="p-1 rounded text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="text-xs text-text-secondary space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-text-muted">Waktu Pencatatan:</span>
                          <span className="font-mono text-text-primary">
                            {new Date(record.recordedAt).toLocaleString('id-ID', {
                              dateStyle: 'short',
                              timeStyle: 'medium',
                            })} WIB
                          </span>
                        </div>
                        {record.projectName && (
                          <div className="flex justify-between">
                            <span className="text-text-muted">Proyek:</span>
                            <span className="font-medium text-text-primary">{record.projectName}</span>
                          </div>
                        )}
                        {record.workerNames && record.workerNames.length > 0 && (
                          <div className="flex justify-between">
                            <span className="text-text-muted">Pekerja:</span>
                            <span className="text-text-primary">
                              {record.workerNames.slice(0, 3).join(', ')}
                              {record.workerNames.length > 3 && ` +${record.workerNames.length - 3} lainnya`}
                            </span>
                          </div>
                        )}
                        {record.reason && (
                          <div className="flex justify-between">
                            <span className="text-text-muted">Alasan / Catatan:</span>
                            <span className="italic text-text-primary">{record.reason}</span>
                          </div>
                        )}
                        {record.photoBase64 && (
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            ✓ Foto tersimpan di perangkat
                          </div>
                        )}
                      </div>

                      {isError && record.errorMessage && (
                        <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{record.errorMessage}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-border bg-bg-surface flex items-center justify-between">
              <span className="text-xs text-text-muted">
                {isOnline ? 'Online (Siap Sinkron)' : 'Offline (Tersimpan Lokal)'}
              </span>
              <div className="flex items-center gap-2">
                {isOnline && pendingCount > 0 && (
                  <button
                    type="button"
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary-hover transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Sinkron...' : 'Sinkronkan Semua'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowQueueModal(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-bg-subtle transition cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OfflineAttendanceBanner;
