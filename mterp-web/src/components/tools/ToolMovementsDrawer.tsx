import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  History,
  MapPin,
  User,
  Calendar,
  Building2,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Settings,
  ArrowRight,
  Database,
  Camera,
  Layers,
} from 'lucide-react';
import { PhotoView } from 'react-photo-view';
import { Tool, ToolMovement } from '../../types';
import { getToolMovements } from '../../api/api';
import { getImageUrl } from '../../utils/image';
import { formatDateTime } from '../../utils/date';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ToolMovementsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tool: Tool | null;
}

const ACTION_BADGES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  check_out: {
    label: 'Check-out',
    bg: 'bg-blue-500/15',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/30',
  },
  return: {
    label: 'Return / Kembali',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
  },
  hand_over: {
    label: 'Hand-over',
    bg: 'bg-purple-500/15',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/30',
  },
  transfer: {
    label: 'Transfer Site/Gudang',
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-500/30',
  },
  relocation: {
    label: 'Relokasi Bin/Rak',
    bg: 'bg-amber-500/15',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/30',
  },
  maintenance_in: {
    label: 'Kirim Service',
    bg: 'bg-rose-500/15',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-500/30',
  },
  maintenance_out: {
    label: 'Selesai Service',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
  },
  condition_change: {
    label: 'Ubah Kondisi',
    bg: 'bg-slate-500/15',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-500/30',
  },
  initial_register: {
    label: 'Pendaftaran Baru',
    bg: 'bg-teal-500/15',
    text: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-500/30',
  },
};

export default function ToolMovementsDrawer({
  isOpen,
  onClose,
  tool,
}: ToolMovementsDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(drawerRef, { isActive: isOpen, onEscape: onClose });

  const [movements, setMovements] = useState<ToolMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !tool) return;

    fetchMovements();
  }, [isOpen, tool]);

  const fetchMovements = async () => {
    if (!tool) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getToolMovements(tool._id);
      setMovements(data || []);
    } catch (err: any) {
      console.error('Fetch movements error:', err);
      setError('Gagal memuat riwayat pergerakan alat');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !tool) return null;

  return (
    <div className="fixed inset-0 z-[1200] overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-[fade-in_0.2s_ease_both]">
      <div
        ref={drawerRef}
        className="w-full max-w-xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-[slide-in-right_0.25s_ease-out_both]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold">
              <History size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Riwayat Pergerakan & Bukti Audit
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[280px]">
                {tool.nama}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
              <div className="w-8 h-8 border-3 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
              <span className="text-xs">Memuat jejak audit pergerakan alat...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-500 font-semibold text-center">
              {error}
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
              <History size={40} className="text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Belum Ada Riwayat Pergerakan</p>
              <p className="text-xs text-slate-400 max-w-xs">
                Pergerakan baru akan tercatat saat alat dipinjam, dikembalikan, atau dipindahkan.
              </p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {movements.map((m, idx) => {
                const badge = ACTION_BADGES[m.action] || {
                  label: m.action,
                  bg: 'bg-slate-500/15',
                  text: 'text-slate-600',
                  border: 'border-slate-500/30',
                };

                const hasPhoto = !!m.evidence?.photo && !m.evidence?.photoPurged;
                const isPurged = m.evidence?.photoPurged === true;
                const hasGps = m.evidence?.lat !== null && m.evidence?.lat !== undefined;

                return (
                  <div key={m._id || idx} className="relative group">
                    {/* Timeline Node Dot */}
                    <div
                      className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 shadow-xs ${
                        idx === 0 ? 'bg-cyan-500 ring-4 ring-cyan-500/20' : 'bg-slate-400 dark:bg-slate-600'
                      }`}
                    />

                    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5 space-y-2.5 hover:border-cyan-500/40 transition-colors">
                      {/* Top bar: Action tag & timestamp */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {badge.label}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                          <Calendar size={12} />
                          <span>{formatDateTime(m.createdAt || m.evidence?.serverTime || new Date())}</span>
                        </div>
                      </div>

                      {/* Origin -> Destination */}
                      {(m.fromLokasi || m.toLokasi) && (
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200 dark:border-slate-750">
                          <span className="text-slate-500 truncate max-w-[150px]">
                            {m.fromLokasi || 'Awal'}
                          </span>
                          <ArrowRight size={13} className="text-cyan-500 shrink-0" />
                          <span className="text-cyan-600 dark:text-cyan-400 font-bold truncate max-w-[180px]">
                            {m.toLokasi || 'Tujuan'}
                          </span>
                        </div>
                      )}

                      {/* Personnel details */}
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Operator:</span>
                          <span className="font-semibold text-slate-800 dark:text-white">
                            {m.byUserId?.fullName || 'Petugas'}
                          </span>
                        </div>
                        {m.assignedTo && (
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Penerima / Pemegang:</span>
                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                              {m.assignedTo.fullName}
                            </span>
                          </div>
                        )}
                        {m.projectId && (
                          <div className="col-span-2">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Proyek:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {m.projectId.nama}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* GPS & Evidence */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-700/60 text-[11px] flex-wrap">
                        {hasGps ? (
                          <a
                            href={`https://maps.google.com/?q=${m.evidence.lat},${m.evidence.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline font-mono font-semibold"
                          >
                            <MapPin size={12} />
                            <span>
                              {m.evidence.lat?.toFixed(5)}, {m.evidence.lng?.toFixed(5)}
                            </span>
                            <ExternalLink size={10} />
                          </a>
                        ) : m.evidence?.isManualGpsOverride ? (
                          <span className="text-amber-500 font-semibold text-[10px]">
                            Override Manual GPS (Asset Admin)
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">GPS N/A</span>
                        )}

                        {m.qty > 1 && (
                          <span className="text-slate-500 dark:text-slate-400 font-bold">
                            Qty: {m.qty} unit
                          </span>
                        )}
                      </div>

                      {/* Notes */}
                      {m.evidence?.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 italic bg-slate-100/60 dark:bg-slate-900/40 p-2 rounded-lg">
                          "{m.evidence.notes}"
                        </p>
                      )}

                      {/* Photo / Storage Purged Notice */}
                      {hasPhoto && m.evidence.photo ? (
                        <div className="pt-1 flex items-center gap-2">
                          <PhotoView src={getImageUrl(m.evidence.photo)}>
                            <img
                              src={getImageUrl(m.evidence.photo)}
                              alt="Bukti Fisik Watermark"
                              className="w-20 h-20 rounded-lg object-cover border border-slate-300 dark:border-slate-700 shadow-sm cursor-zoom-in hover:opacity-90 transition-opacity"
                            />
                          </PhotoView>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Klik untuk memperbesar bukti watermark
                          </span>
                        </div>
                      ) : isPurged ? (
                        <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-slate-200/50 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 text-[10px] text-slate-500 dark:text-slate-400">
                          <Database size={13} className="text-cyan-500 shrink-0" />
                          <span>
                            Foto fisik telah dibersihkan otomatis dari disk (Storage Optimized). Metadata audit GPS & waktu tetap permanen.
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
