import React, { useState, useRef } from 'react';
import {
  X,
  Warehouse as WarehouseIcon,
  Plus,
  Trash2,
  Edit3,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Building,
  Save,
  Compass,
} from 'lucide-react';
import { Warehouse, WarehouseZone } from '../../types';
import { createWarehouse, updateWarehouse, deleteWarehouse } from '../../api/api';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface WarehouseManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouses: Warehouse[];
  onRefresh: () => void;
}

const EMPTY_WAREHOUSE: Partial<Warehouse> = {
  name: '',
  code: '',
  type: 'central_warehouse',
  address: '',
  geo: { lat: -7.175077420272807, lng: 107.57089981757514, radiusMeters: 150 },
  zones: [],
  isDefault: false,
  isActive: true,
};

export default function WarehouseManagementModal({
  isOpen,
  onClose,
  warehouses,
  onRefresh,
}: WarehouseManagementModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, { isActive: isOpen, onEscape: onClose });

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Warehouse>>(EMPTY_WAREHOUSE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Zone builder temporary inputs
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneCode, setNewZoneCode] = useState('');

  const openCreate = () => {
    setFormData(EMPTY_WAREHOUSE);
    setEditingId(null);
    setIsEditing(true);
    setErrorMsg(null);
  };

  const openEdit = (wh: Warehouse) => {
    setFormData({
      ...wh,
      zones: wh.zones ? JSON.parse(JSON.stringify(wh.zones)) : [],
    });
    setEditingId(wh._id);
    setIsEditing(true);
    setErrorMsg(null);
  };

  const handleUseCurrentGps = () => {
    if (!('geolocation' in navigator)) {
      setErrorMsg('Browser tidak mendukung pendeteksian GPS');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({
          ...prev,
          geo: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            radiusMeters: prev.geo?.radiusMeters || 150,
          },
        }));
      },
      (err) => {
        setErrorMsg('Gagal mengambil koordinat GPS perangkat.');
      },
      { enableHighAccuracy: true }
    );
  };

  const handleAddZone = () => {
    if (!newZoneName.trim()) return;
    const zone: WarehouseZone = {
      name: newZoneName.trim(),
      code: newZoneCode.trim().toUpperCase() || undefined,
      racks: [
        {
          name: 'Rak 1',
          bins: [{ label: 'B-01', capacity: 10 }],
        },
      ],
    };
    setFormData((prev) => ({
      ...prev,
      zones: [...(prev.zones || []), zone],
    }));
    setNewZoneName('');
    setNewZoneCode('');
  };

  const handleRemoveZone = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      zones: (prev.zones || []).filter((_, idx) => idx !== index),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.name?.trim() || !formData.code?.trim()) {
      setErrorMsg('Nama dan kode gudang wajib diisi');
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        await updateWarehouse(editingId, formData);
        setSuccessMsg('Gudang berhasil diperbarui');
      } else {
        await createWarehouse(formData);
        setSuccessMsg('Gudang baru berhasil ditambahkan');
      }
      setIsEditing(false);
      onRefresh();
    } catch (err: any) {
      console.error('Save warehouse error:', err);
      setErrorMsg(err.response?.data?.msg || 'Gagal menyimpan data gudang');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (wh: Warehouse) => {
    if (wh.isDefault) {
      alert('Gudang default Head Office tidak dapat dihapus');
      return;
    }
    if ((wh.toolsCount || 0) > 0) {
      alert(`Gudang masih memiliki ${wh.toolsCount} alat. Pindahkan alat terlebih dahulu.`);
      return;
    }
    if (!window.confirm(`Yakin ingin menghapus gudang "${wh.name}"?`)) return;

    try {
      await deleteWarehouse(wh._id);
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal menghapus gudang');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1150] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-[fade-in_0.2s_ease_both]">
      <div
        ref={modalRef}
        className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold">
              <WarehouseIcon size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Master Data Fasilitas Gudang & Lokasi Bin
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Penyusunan hierarki fisik gudang, zona, rak, dan koordinat GPS
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
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-500 font-semibold flex items-center gap-2">
              <AlertTriangle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-500 font-semibold flex items-center gap-2">
              <CheckCircle2 size={15} />
              <span>{successMsg}</span>
            </div>
          )}

          {isEditing ? (
            /* Editing / Creating Warehouse Form */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Nama Fasilitas Gudang <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Central Warehouse Karawang"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Kode Gudang <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Misal: WH-KRW"
                    value={formData.code || ''}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Tipe Fasilitas
                  </label>
                  <select
                    value={formData.type || 'central_warehouse'}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  >
                    <option value="head_office">Head Office</option>
                    <option value="central_warehouse">Central Warehouse</option>
                    <option value="project_site">Project Site / Lapangan</option>
                    <option value="workshop">Workshop / Bengkel</option>
                    <option value="transit">Transit Hub</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Alamat Lengkap
                  </label>
                  <input
                    type="text"
                    placeholder="Alamat fisik gudang..."
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* GPS Coordinates */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <MapPin size={15} className="text-cyan-500" />
                    <span>Koordinat Geografis (Peta & Geofence)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleUseCurrentGps}
                    className="flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400 hover:underline font-bold"
                  >
                    <Compass size={13} />
                    <span>Gunakan GPS Saat Ini</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
                      Latitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.geo?.lat ?? -7.17508}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          geo: {
                            lat: parseFloat(e.target.value) || 0,
                            lng: formData.geo?.lng || 0,
                            radiusMeters: formData.geo?.radiusMeters || 150,
                          },
                        })
                      }
                      className="w-full py-1.5 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">
                      Longitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.geo?.lng ?? 107.5709}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          geo: {
                            lat: formData.geo?.lat || 0,
                            lng: parseFloat(e.target.value) || 0,
                            radiusMeters: formData.geo?.radiusMeters || 150,
                          },
                        })
                      }
                      className="w-full py-1.5 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Zones & Bins Hierarchy */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Layers size={15} className="text-cyan-500" />
                    <span>Zona & Hierarki Penyimpanan Rak/Bin</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {formData.zones?.length || 0} Zona terkonfigurasi
                  </span>
                </div>

                {formData.zones && formData.zones.length > 0 && (
                  <div className="space-y-2">
                    {formData.zones.map((z, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-800 dark:text-white">
                            {z.name}
                          </span>
                          {z.code && (
                            <span className="ml-2 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-cyan-600 dark:text-cyan-400 rounded">
                              {z.code}
                            </span>
                          )}
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {z.racks?.length || 0} Rak terdaftar
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveZone(idx)}
                          className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Nama Zona baru (misal: Zona Fast-Moving)"
                    value={newZoneName}
                    onChange={(e) => setNewZoneName(e.target.value)}
                    className="flex-1 py-1.5 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Kode (Z-D)"
                    value={newZoneCode}
                    onChange={(e) => setNewZoneCode(e.target.value)}
                    className="w-24 py-1.5 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleAddZone}
                    className="flex items-center gap-1 py-1.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold"
                  >
                    <Plus size={14} />
                    <span>Tambah</span>
                  </button>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="py-2 px-4 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 py-2 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md cursor-pointer"
                >
                  <Save size={15} />
                  <span>{submitting ? 'Menyimpan...' : 'Simpan Gudang'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* Warehouses List View */
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Daftar Fasilitas ({warehouses.length})
                </span>
                <button
                  type="button"
                  onClick={openCreate}
                  className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Tambah Gudang Baru</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {warehouses.map((wh) => (
                  <div
                    key={wh._id}
                    className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl flex items-center justify-between gap-4 hover:border-cyan-500/40 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          {wh.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {wh.code}
                        </span>
                        {wh.isDefault && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            Head Office (Default)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                        {wh.address && <span>{wh.address}</span>}
                        {wh.geo && (
                          <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400">
                            {wh.geo.lat.toFixed(4)}, {wh.geo.lng.toFixed(4)}
                          </span>
                        )}
                        <span>•</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {wh.toolsCount || 0} Jenis Alat ({wh.toolsUnits || 0} Unit)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(wh)}
                        className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        title="Edit Fasilitas"
                      >
                        <Edit3 size={15} />
                      </button>
                      {!wh.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleDelete(wh)}
                          className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                          title="Hapus Gudang"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
