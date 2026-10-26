import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  MapPin,
  User,
  Building2,
  Layers,
  Database,
  ShieldCheck,
  RefreshCw,
  Wrench,
  Package,
} from 'lucide-react';
import { Tool, Warehouse, WarehouseZone, WarehouseRack, WarehouseBin } from '../../types';
import { recordToolMovement } from '../../api/api';
import { useAuth } from '../../contexts/AuthContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import CaptureWatermarkModal from './CaptureWatermarkModal';

export type MovementAction =
  | 'check_out'
  | 'return'
  | 'hand_over'
  | 'transfer'
  | 'relocation'
  | 'maintenance_in'
  | 'maintenance_out'
  | 'condition_change';

const ACTION_CONFIG: Record<
  MovementAction,
  { label: string; desc: string; color: string; badgeBg: string }
> = {
  check_out: {
    label: 'Check-out (Serahkan ke Teknisi / Proyek)',
    desc: 'Alat diserahkan ke penanggung jawab teknisi atau ditugaskan ke lokasi proyek',
    color: '#3B82F6',
    badgeBg: '#DBEAFE',
  },
  return: {
    label: 'Pengembalian ke Gudang (Return)',
    desc: 'Alat dikembalikan ke gudang penyimpanan dan bin rak yang ditentukan',
    color: '#10B981',
    badgeBg: '#D1FAE5',
  },
  hand_over: {
    label: 'Oper Alih Lapangan (Hand-Over)',
    desc: 'Pengalihan penanggung jawab alat antar teknisi secara langsung di lapangan',
    color: '#8B5CF6',
    badgeBg: '#EDE9FE',
  },
  transfer: {
    label: 'Transfer Antar Gudang / Site',
    desc: 'Perpindahan fisik alat dari satu fasilitas/gudang ke fasilitas lain',
    color: '#06B6D4',
    badgeBg: '#CFFAFE',
  },
  relocation: {
    label: 'Relokasi Bin / Rak Internal',
    desc: 'Memindahkan posisi penataan alat ke zona, rak, atau bin baru di gudang yang sama',
    color: '#F59E0B',
    badgeBg: '#FEF3C7',
  },
  maintenance_in: {
    label: 'Kirim Service / Perbaikan',
    desc: 'Alat dikirim ke workshop atau vendor perbaikan pihak ketiga',
    color: '#EF4444',
    badgeBg: '#FEE2E2',
  },
  maintenance_out: {
    label: 'Selesai Service (Siap Pakai)',
    desc: 'Alat telah selesai diperbaiki dan siap disimpan kembali di gudang',
    color: '#10B981',
    badgeBg: '#D1FAE5',
  },
  condition_change: {
    label: 'Update Status Kondisi Fisik',
    desc: 'Pembaruan catatan kondisi fisik alat (Baik, Butuh Perbaikan, atau Rusak)',
    color: '#64748B',
    badgeBg: '#F1F5F9',
  },
};

interface ToolMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  tool: Tool | null;
  warehouses: Warehouse[];
  users: Array<{ _id: string; fullName: string; role?: string }>;
  projects: Array<{ _id: string; nama: string; code?: string }>;
  onSuccess: (updatedTool: Tool, message: string) => void;
  defaultAction?: MovementAction;
}

export default function ToolMovementModal({
  isOpen,
  onClose,
  tool,
  warehouses,
  users,
  projects,
  onSuccess,
  defaultAction = 'check_out',
}: ToolMovementModalProps) {
  const { user } = useAuth();
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, { isActive: isOpen, onEscape: onClose });

  const [action, setAction] = useState<MovementAction>(defaultAction);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [selectedRack, setSelectedRack] = useState<string>('');
  const [selectedBin, setSelectedBin] = useState<string>('');
  const [customBinInput, setCustomBinInput] = useState<string>('');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [condition, setCondition] = useState<string>('Baik');
  const [qty, setQty] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');

  // Photo & GPS capture state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<{
    file: File;
    previewUrl: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    capturedAt: string;
    isManualGpsOverride: boolean;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize defaults when modal opens or tool changes
  useEffect(() => {
    if (!isOpen || !tool) return;

    setAction(defaultAction);
    setCondition(tool.kondisi || 'Baik');
    setQty(1);
    setNotes('');
    setCapturedPhoto(null);
    setErrorMsg(null);

    // Default warehouse: current tool warehouse or default warehouse
    const currentWhId =
      typeof tool.warehouseId === 'object' && tool.warehouseId
        ? tool.warehouseId._id
        : typeof tool.warehouseId === 'string'
        ? tool.warehouseId
        : warehouses.find((w) => w.isDefault)?._id || (warehouses[0] ? warehouses[0]._id : '');

    setSelectedWarehouseId(currentWhId);
    setCustomBinInput(tool.binRef || '');
    setAssignedTo(tool.assignedTo?._id || '');
    setProjectId(tool.projectId?._id || '');
  }, [isOpen, tool, defaultAction, warehouses]);

  // Selected warehouse object for cascading zones
  const activeWarehouse = warehouses.find((w) => w._id === selectedWarehouseId);
  const availableZones: WarehouseZone[] = activeWarehouse?.zones || [];
  const activeZoneObj = availableZones.find((z) => z.name === selectedZone);
  const availableRacks: WarehouseRack[] = activeZoneObj?.racks || [];
  const activeRackObj = availableRacks.find((r) => r.name === selectedRack);
  const availableBins: WarehouseBin[] = activeRackObj?.bins || [];

  const handleZoneChange = (zoneName: string) => {
    setSelectedZone(zoneName);
    setSelectedRack('');
    setSelectedBin('');
  };

  const handleRackChange = (rackName: string) => {
    setSelectedRack(rackName);
    setSelectedBin('');
  };

  const getComputedBinString = () => {
    if (selectedBin) {
      const parts = [];
      if (selectedZone) parts.push(selectedZone.split(' - ')[0]);
      if (selectedRack) parts.push(selectedRack);
      parts.push(selectedBin);
      return parts.join(' / ');
    }
    return customBinInput.trim();
  };

  const getLocationLabel = () => {
    if (action === 'check_out') {
      const proj = projects.find((p) => p._id === projectId);
      return proj ? `Site: ${proj.nama}` : 'In Use / Lapangan';
    }
    if (action === 'maintenance_in') {
      return 'Workshop / Bengkel Service';
    }
    const wh = warehouses.find((w) => w._id === selectedWarehouseId);
    const binStr = getComputedBinString();
    return wh ? `${wh.name}${binStr ? ` (${binStr})` : ''}` : 'Warehouse';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tool) return;
    setErrorMsg(null);

    // Validation
    if (action === 'check_out' && !assignedTo && !projectId) {
      setErrorMsg('Pilih minimal Teknisi Penerima atau Proyek Terkait');
      return;
    }

    if (action === 'hand_over' && !assignedTo) {
      setErrorMsg('Pilih teknisi baru yang akan menerima alat');
      return;
    }

    if (!capturedPhoto) {
      setErrorMsg('Foto bukti fisik dengan watermark GPS wajib diambil sebelum menyimpan');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('toolId', tool._id);
      formData.append('action', action);
      formData.append('qty', String(qty || 1));
      formData.append('condition', condition);

      if (notes) formData.append('notes', notes);

      // Location & Warehouse
      const computedBin = getComputedBinString();
      if (selectedWarehouseId) formData.append('toWarehouseId', selectedWarehouseId);
      if (computedBin) formData.append('toBin', computedBin);

      if (assignedTo) formData.append('assignedTo', assignedTo);
      if (projectId) formData.append('projectId', projectId);

      // Watermark GPS Evidence
      if (capturedPhoto.lat !== null && capturedPhoto.lng !== null) {
        formData.append('lat', String(capturedPhoto.lat));
        formData.append('lng', String(capturedPhoto.lng));
      }
      if (capturedPhoto.accuracy !== null) {
        formData.append('accuracy', String(capturedPhoto.accuracy));
      }
      formData.append('capturedAt', capturedPhoto.capturedAt);
      formData.append('isManualGpsOverride', String(capturedPhoto.isManualGpsOverride));
      formData.append('photo', capturedPhoto.file);

      const result = await recordToolMovement(formData);

      let successText = `Aksi ${ACTION_CONFIG[action].label.split('(')[0].trim()} berhasil dicatat!`;
      if (result.purgedCount > 0) {
        successText += ` (${result.purgedCount} foto pergerakan lama dibersihkan dari server disk)`;
      }

      onSuccess(result.tool, successText);
      onClose();
    } catch (err: any) {
      console.error('Movement submit error:', err);
      setErrorMsg(err.response?.data?.msg || 'Gagal mencatat perpindahan alat');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !tool) return null;

  return (
    <>
      <div className="fixed inset-0 z-[1150] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-[fade-in_0.2s_ease_both]">
        <div
          ref={modalRef}
          className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md"
                style={{ backgroundColor: ACTION_CONFIG[action].color }}
              >
                <Wrench size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  Pergerakan Alat: {tool.nama}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Stok: <span className="font-bold">{tool.stok} {tool.satuan}</span> • Lokasi saat ini: <span className="font-semibold">{tool.lokasi || 'Warehouse'}</span>
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

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-xs text-rose-600 dark:text-rose-400 font-semibold animate-shake">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Action Type Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Jenis Tindakan / Pergerakan Alat <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(ACTION_CONFIG) as MovementAction[]).map((actKey) => {
                  const cfg = ACTION_CONFIG[actKey];
                  const isSelected = action === actKey;
                  return (
                    <button
                      key={actKey}
                      type="button"
                      onClick={() => setAction(actKey)}
                      className={`flex flex-col items-start text-left p-2.5 rounded-xl border transition-all text-xs cursor-pointer ${
                        isSelected
                          ? 'border-cyan-500 bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 shadow-sm font-bold ring-2 ring-cyan-500/30'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate w-full">{cfg.label.split('(')[0]}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 italic">
                {ACTION_CONFIG[action].desc}
              </p>
            </div>

            {/* Recipient User (Check-Out / Hand-Over) */}
            {(action === 'check_out' || action === 'hand_over') && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Teknisi / Penanggung Jawab Penerima <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500 font-medium"
                  >
                    <option value="">-- Pilih Anggota Tim / Teknisi --</option>
                    {users.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.fullName} ({u.role || 'Staff'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Project Site (Check-Out / Transfer) */}
            {(action === 'check_out' || action === 'transfer') && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Proyek Terkait (Opsional)
                </label>
                <div className="relative">
                  <Building2 size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500 font-medium"
                  >
                    <option value="">-- Tidak Terkait Proyek Spesifik --</option>
                    {projects.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.nama} {p.code ? `(${p.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Warehouse & Bin Placement (Return, Transfer, Relocation, Service Out) */}
            {(action === 'return' ||
              action === 'transfer' ||
              action === 'relocation' ||
              action === 'maintenance_out') && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <MapPin size={15} className="text-cyan-500" />
                  <span>Lokasi Penempatan Gudang & Rak</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Fasilitas Gudang
                    </label>
                    <select
                      value={selectedWarehouseId}
                      onChange={(e) => {
                        setSelectedWarehouseId(e.target.value);
                        setSelectedZone('');
                        setSelectedRack('');
                        setSelectedBin('');
                      }}
                      className="w-full py-1.5 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    >
                      {warehouses.map((w) => (
                        <option key={w._id} value={w._id}>
                          {w.name} {w.isDefault ? '(Head Office)' : `[${w.code}]`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {availableZones.length > 0 ? (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Zona Gudang
                      </label>
                      <select
                        value={selectedZone}
                        onChange={(e) => handleZoneChange(e.target.value)}
                        className="w-full py-1.5 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                      >
                        <option value="">-- Pilih Zona --</option>
                        {availableZones.map((z) => (
                          <option key={z.name} value={z.name}>
                            {z.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Label / Rak / Bin Lokasi
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Rak Besi 02 / B-04"
                        value={customBinInput}
                        onChange={(e) => setCustomBinInput(e.target.value)}
                        className="w-full py-1.5 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Cascading Rack & Bin if zone selected */}
                {availableRacks.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Rak
                      </label>
                      <select
                        value={selectedRack}
                        onChange={(e) => handleRackChange(e.target.value)}
                        className="w-full py-1.5 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                      >
                        <option value="">-- Pilih Rak --</option>
                        {availableRacks.map((r) => (
                          <option key={r.name} value={r.name}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Bin / Kotak
                      </label>
                      {availableBins.length > 0 ? (
                        <select
                          value={selectedBin}
                          onChange={(e) => setSelectedBin(e.target.value)}
                          className="w-full py-1.5 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                        >
                          <option value="">-- Pilih Bin --</option>
                          {availableBins.map((b) => (
                            <option key={b.label} value={b.label}>
                              {b.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="Nomor Bin / Slot"
                          value={customBinInput}
                          onChange={(e) => setCustomBinInput(e.target.value)}
                          className="w-full py-1.5 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Condition & Quantity */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Kondisi Alat
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold"
                >
                  <option value="Baik">Baik (Siap Pakai)</option>
                  <option value="Maintenance">Maintenance (Butuh Perbaikan)</option>
                  <option value="Rusak">Rusak</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Jumlah Satuan ({tool.satuan || 'unit'})
                </label>
                <input
                  type="number"
                  min="1"
                  max={tool.stok > 0 ? tool.stok : 9999}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Catatan Pemeriksaan / Berita Acara
              </label>
              <textarea
                rows={2}
                placeholder="Misal: Diterima dalam keadaan lengkap, mata bor tajam, kabel aman..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
              />
            </div>

            {/* Storage Purge Rule Badge */}
            <div className="p-3 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
              <Database size={16} className="text-cyan-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-800 dark:text-white">
                  Kebijakan Optimasi Penyimpanan Server (Disk Storage Saving):
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Foto pergerakan sebelumnya akan secara otomatis dihapus dari harddisk server untuk menghemat kuota, sementara jejak audit & koordinat GPS tetap tersimpan permanen.
                </p>
              </div>
            </div>

            {/* Photo Capture Section */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Bukti Foto Fisik & Watermark GPS <span className="text-rose-500">*</span>
              </label>

              {capturedPhoto ? (
                <div className="relative p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-emerald-500/40 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={capturedPhoto.previewUrl}
                      alt="Watermarked Preview"
                      className="w-16 h-16 rounded-lg object-cover border border-slate-300 dark:border-slate-700 shadow-sm"
                    />
                    <div className="text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                        <ShieldCheck size={14} />
                        <span>Foto & Watermark Siap</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        {capturedPhoto.lat !== null
                          ? `GPS: ${capturedPhoto.lat.toFixed(5)}, ${capturedPhoto.lng?.toFixed(5)}`
                          : 'GPS: Override Manual'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-xs font-bold text-slate-800 dark:text-white transition-all cursor-pointer"
                  >
                    <RefreshCw size={13} />
                    <span>Ambil Ulang</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl border-2 border-dashed border-cyan-500/60 hover:border-cyan-500 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold text-xs transition-all shadow-xs cursor-pointer"
                >
                  <Camera size={18} />
                  <span>Nyalakan Kamera & Ambil Foto Bukti Watermark</span>
                </button>
              )}
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-5 py-3.5 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="py-2 px-4 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white text-xs font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !capturedPhoto}
              className="flex items-center gap-2 py-2.5 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-cyan-600/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Simpan Pergerakan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Camera Watermark Modal */}
      <CaptureWatermarkModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        toolName={tool.nama}
        actionLabel={ACTION_CONFIG[action].label.split('(')[0].trim()}
        locationName={getLocationLabel()}
        onPhotoCaptured={(capturedData) => {
          setCapturedPhoto(capturedData);
          setIsCameraOpen(false);
        }}
      />
    </>
  );
}
