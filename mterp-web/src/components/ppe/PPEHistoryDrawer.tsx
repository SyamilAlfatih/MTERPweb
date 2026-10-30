import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  History,
  HardHat,
  ShieldCheck,
  CheckCircle2,
  Clock,
  MapPin,
  User,
  Building2,
  ExternalLink,
  Camera,
  AlertTriangle,
  FileText,
  Shield,
  Layers,
  Sparkles,
  Flame,
  ArrowDownCircle,
  Info,
} from 'lucide-react';
import { PhotoView } from 'react-photo-view';
import {
  PPEUsageRecord,
  PPEHistoryItem,
  getPPEUsageHistory,
  type PPETypeKey,
} from '../../api/ppe.api';
import { getImageUrl } from '../../utils/image';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface PPEHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  usage: PPEUsageRecord | null;
}

const PPE_ICONS: Record<PPETypeKey, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  safety_helmet: { label: 'Safety Helmets', icon: HardHat, color: '#D97706', bg: '#FEF3C7' },
  safety_boots: { label: 'Safety Boots', icon: ShieldCheck, color: '#2563EB', bg: '#DBEAFE' },
  full_body_harness: { label: 'Full Body Harness', icon: Shield, color: '#DC2626', bg: '#FEE2E2' },
  safety_web: { label: 'Safety Webs', icon: Layers, color: '#059669', bg: '#D1FAE5' },
  fall_arrester: { label: 'Fall Arrester', icon: ArrowDownCircle, color: '#7C3AED', bg: '#EDE9FE' },
  welding_helmet: { label: 'Welding Helmet', icon: Flame, color: '#EA580C', bg: '#FFEDD5' },
  leather_gloves: { label: 'Leather Gloves', icon: Sparkles, color: '#0891B2', bg: '#CFFAFE' },
};

const ACTION_BADGES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  check_out: {
    label: 'Check-out / Peminjaman APD',
    bg: 'bg-blue-500/15',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/30',
  },
  return: {
    label: 'Return / Pengembalian APD',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
  },
  condition_check: {
    label: 'Inspeksi Kondisi Fisik',
    bg: 'bg-amber-500/15',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/30',
  },
  note_added: {
    label: 'Catatan HSE Tambahan',
    bg: 'bg-slate-500/15',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-500/30',
  },
};

export default function PPEHistoryDrawer({
  isOpen,
  onClose,
  usage,
}: PPEHistoryDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(drawerRef, { isActive: isOpen, onEscape: onClose });

  const [historyItems, setHistoryItems] = useState<PPEHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !usage) {
      setHistoryItems([]);
      return;
    }

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getPPEUsageHistory(usage._id);
        if (res && res.history && res.history.length > 0) {
          setHistoryItems(res.history);
        } else if (usage.history && usage.history.length > 0) {
          setHistoryItems(usage.history);
        } else {
          // Construct fallback synthetic history from current usage document
          const fallback: PPEHistoryItem[] = [
            {
              action: 'check_out',
              actionLabel: 'Peminjaman / Check-out APD',
              timestamp: usage.borrowedAt,
              byUserName: usage.inspectorName || 'HSE Manager',
              location: usage.projectName || usage.location || 'Site Proyek',
              condition: usage.conditionBefore || 'Baik & Layak Pakai',
              notes: usage.notes || '',
              evidence: usage.evidence,
            },
          ];

          if (usage.status === 'returned' && usage.returnedAt) {
            fallback.push({
              action: 'return',
              actionLabel: 'Pengembalian / Return APD Terverifikasi',
              timestamp: usage.returnedAt,
              byUserName: usage.inspectorName || 'HSE Manager',
              location: usage.projectName || usage.location || 'Site Proyek',
              condition: usage.conditionAfter || 'Baik & Bersih',
              notes: usage.returnNotes || '',
              evidence: usage.returnEvidence,
            });
          }
          setHistoryItems(fallback);
        }
      } catch (err: any) {
        console.error('Error fetching PPE history:', err);
        // Fallback to usage embedded history or synthetic
        if (usage.history && usage.history.length > 0) {
          setHistoryItems(usage.history);
        } else {
          setError('Gagal memuat log audit terbaru dari server');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [isOpen, usage]);

  if (!isOpen || !usage) return null;

  const isInUse = usage.status === 'in_use';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm transition-opacity">
      <div className="absolute inset-0" onClick={onClose} />

      <div
        ref={drawerRef}
        className="fixed inset-y-0 right-0 max-w-full flex pl-10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ppe-history-drawer-title"
      >
        <div className="w-screen max-w-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <History className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2
                    id="ppe-history-drawer-title"
                    className="text-lg font-bold text-slate-900 dark:text-white"
                  >
                    Riwayat Audit & Bukti APD
                  </h2>
                  {isInUse ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300/40">
                      Sedang Dipakai
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/40">
                      Telah Dikembalikan
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {usage.workerName}
                  </span>
                  <span>•</span>
                  <span>{usage.projectName || 'Proyek Lapangan'}</span>
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Tutup riwayat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Summary Card */}
          <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/30 dark:bg-slate-800/20">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Item APD Digunakan:
            </div>
            <div className="flex flex-wrap gap-2">
              {usage.ppeItems.map((k) => {
                const conf = PPE_ICONS[k];
                if (!conf) return null;
                const Icon = conf.icon;
                return (
                  <span
                    key={k}
                    style={{ color: conf.color, backgroundColor: conf.bg }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border border-current/20 shadow-xs"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {conf.label}
                  </span>
                );
              })}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 text-xs">
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                <span className="text-slate-400 block text-[10px]">Aktivitas:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200 line-clamp-1">
                  {usage.activityType}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                <span className="text-slate-400 block text-[10px]">Lokasi / Zona:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200 line-clamp-1">
                  {usage.location || usage.projectName || '-'}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700/60 col-span-2 sm:col-span-1">
                <span className="text-slate-400 block text-[10px]">Inspektur K3:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200 line-clamp-1">
                  {usage.inspectorName || 'HSE Officer'}
                </span>
              </div>
            </div>
          </div>

          {/* Timeline Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            {loading ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm">Memuat linimasa audit APD...</p>
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : historyItems.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm font-semibold">Belum ada catatan aktivitas audit</p>
              </div>
            ) : (
              <div className="relative pl-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-[2px] before:bg-slate-200 dark:before:bg-slate-800">
                {historyItems.map((item, idx) => {
                  const badge = ACTION_BADGES[item.action] || {
                    label: item.actionLabel || item.action,
                    bg: 'bg-slate-500/15',
                    text: 'text-slate-600',
                    border: 'border-slate-500/30',
                  };

                  const isCheckOut = item.action === 'check_out';
                  const isReturn = item.action === 'return';

                  const dateObj = new Date(item.timestamp);
                  const formattedDate = dateObj.toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });
                  const formattedTime = dateObj.toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  const evidence = item.evidence;
                  const hasPhoto = Boolean(evidence && evidence.photo);
                  const isPurged = Boolean(evidence && evidence.photoPurged);

                  return (
                    <div key={item._id || idx} className="relative mb-8 last:mb-2">
                      {/* Timeline Dot */}
                      <div
                        className={`absolute -left-[30px] top-1 w-5 h-5 rounded-full border-2 bg-white dark:bg-slate-900 flex items-center justify-center ${
                          isReturn
                            ? 'border-emerald-500 text-emerald-500'
                            : isCheckOut
                            ? 'border-blue-500 text-blue-500'
                            : 'border-amber-500 text-amber-500'
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            isReturn
                              ? 'bg-emerald-500'
                              : isCheckOut
                              ? 'bg-blue-500'
                              : 'bg-amber-500'
                          }`}
                        />
                      </div>

                      {/* Event Card */}
                      <div className="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700/70 p-4 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                        {/* Event Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                          >
                            {isReturn ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <HardHat className="w-3.5 h-3.5" />
                            )}
                            {badge.label}
                          </span>

                          <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formattedDate}, {formattedTime} WIB
                          </span>
                        </div>

                        {/* Inspector & Location */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 mb-3 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0" />
                            <span className="text-slate-400">Verifikator:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                              {item.byUserName || usage.inspectorName || 'HSE Officer'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                            <span className="text-slate-400">Lokasi:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                              {item.location || usage.location || usage.projectName || 'Site Proyek'}
                            </span>
                          </div>
                        </div>

                        {/* Condition & Notes */}
                        {item.condition && (
                          <div className="text-xs mb-2">
                            <span className="text-slate-400">Status Kondisi Fisik: </span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {item.condition}
                            </span>
                          </div>
                        )}

                        {item.notes && (
                          <div className="text-xs text-slate-600 dark:text-slate-400 bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-xl mb-3">
                            <span className="font-semibold text-amber-700 dark:text-amber-300">
                              Catatan Inspeksi:
                            </span>{' '}
                            {item.notes}
                          </div>
                        )}

                        {/* Photo Evidence with Watermark Rules */}
                        {hasPhoto && !isPurged && (
                          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Camera className="w-3.5 h-3.5 text-amber-600" />
                                Bukti Foto Fisik (Watermark GPS)
                              </span>
                              {evidence?.lat && evidence?.lng && (
                                <a
                                  href={`https://maps.google.com/?q=${evidence.lat},${evidence.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                                >
                                  Buka di Google Maps
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 items-start">
                              <div className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 w-36 h-28 shrink-0 cursor-pointer shadow-sm">
                                <PhotoView src={getImageUrl(evidence?.photo)}>
                                  <img
                                    src={getImageUrl(evidence?.photo)}
                                    alt="Bukti Pemakaian APD"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                </PhotoView>
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none text-white text-xs font-semibold gap-1">
                                  <Camera className="w-3.5 h-3.5" />
                                  Perbesar
                                </div>
                              </div>

                              <div className="text-xs space-y-1.5 flex-1">
                                {evidence?.lat && evidence?.lng ? (
                                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                    <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                    <span>
                                      GPS: <code className="font-mono bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded">{evidence.lat.toFixed(6)}, {evidence.lng.toFixed(6)}</code>
                                    </span>
                                    {evidence?.accuracy && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold">
                                        ±{Math.round(evidence.accuracy)}m
                                      </span>
                                    )}
                                  </div>
                                ) : evidence?.isManualGpsOverride ? (
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                                    <AlertTriangle className="w-3 h-3" />
                                    GPS Manual Override Disahkan
                                  </div>
                                ) : (
                                  <span className="text-slate-400">Koordinat GPS tidak terekam</span>
                                )}

                                {evidence?.capturedAt && (
                                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Waktu Kamera:{' '}
                                    {new Date(evidence.capturedAt).toLocaleTimeString('id-ID', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Storage rule note if purged */}
                        {isPurged && (
                          <div className="mt-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-900/60 text-slate-500 text-[11px] flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>
                              Foto fisik telah diarsip/dihapus otomatis sesuai kebijakan efisiensi penyimpanan server. Metadata koordinat tetap terjaga.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
