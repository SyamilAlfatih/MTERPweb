import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  Upload,
  Camera,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Scale,
  Package,
  HardHat,
  Layers,
  Sparkles,
  Info,
  Building2,
} from 'lucide-react';
import { Warehouse } from '../../types';
import {
  PPEItem,
  PPERegulationTemplate,
  createPPEItem,
  updatePPEItem,
  type PPECategoryKey,
} from '../../api/ppe.api';
import { getImageUrl } from '../../utils/image';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface PPEItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (item: PPEItem, message: string) => void;
  itemToEdit: PPEItem | null;
  repoTemplates: PPERegulationTemplate[];
  warehouses: Warehouse[];
}

const CATEGORIES: { key: PPECategoryKey; label: string }[] = [
  { key: 'head_protection', label: 'Pelindung Kepala (Head Protection)' },
  { key: 'foot_leg_protection', label: 'Pelindung Kaki (Foot & Leg Protection)' },
  { key: 'fall_protection', label: 'Perlindungan Ketinggian (Fall Protection)' },
  { key: 'eye_face_protection', label: 'Pelindung Mata & Muka (Eye & Face)' },
  { key: 'hand_arm_protection', label: 'Pelindung Tangan & Lengan (Hand & Arm)' },
  { key: 'respiratory_protection', label: 'Pelindung Pernapasan (Respiratory)' },
  { key: 'hearing_protection', label: 'Pelindung Pendengaran (Hearing)' },
  { key: 'body_protective_clothing', label: 'Pakaian Pelindung Tubuh (Body/Vest)' },
  { key: 'other', label: 'Alat Pelindung Lainnya (Other)' },
];

export default function PPEItemModal({
  isOpen,
  onClose,
  onSuccess,
  itemToEdit,
  repoTemplates,
  warehouses,
}: PPEItemModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, { isActive: isOpen, onEscape: onClose });

  const isEditing = Boolean(itemToEdit);

  // Form states
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PPECategoryKey>('head_protection');
  const [brand, setBrand] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [totalQty, setTotalQty] = useState<number>(1);
  const [unit, setUnit] = useState('Unit');
  const [condition, setCondition] = useState<'Baik' | 'Cukup Baik' | 'Perlu Servis' | 'Rusak / Afkir'>('Baik');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [binRef, setBinRef] = useState<string>('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  // Regulatory standards
  const [indonesianRegulation, setIndonesianRegulation] = useState('');
  const [internationalRegulation, setInternationalRegulation] = useState('');
  const [riskLevel, setRiskLevel] = useState('Kritis');
  const [colorCode, setColorCode] = useState('');
  const [mandatoryZones, setMandatoryZones] = useState('');

  // SOP Guide customized
  const [description, setDescription] = useState('');
  const [preUseInspection, setPreUseInspection] = useState<string[]>([]);
  const [wearingSteps, setWearingSteps] = useState<string[]>([]);
  const [maintenance, setMaintenance] = useState<string[]>([]);
  const [dos, setDos] = useState<string[]>([]);
  const [donts, setDonts] = useState<string[]>([]);
  const [expiryYears, setExpiryYears] = useState<number>(5);

  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'general' | 'regulations' | 'sop'>('general');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Populate from template
  const applyTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const tpl = repoTemplates.find((t) => t.templateId === tplId);
    if (!tpl) return;

    if (!isEditing) {
      if (!name) setName(tpl.name);
    }
    setCategory(tpl.category);
    setUnit(tpl.unit || 'Unit');
    setIndonesianRegulation(tpl.standardRegulation.indonesian);
    setInternationalRegulation(tpl.standardRegulation.international);
    setRiskLevel(tpl.standardRegulation.riskLevel);
    setColorCode(tpl.colorCode || '');
    setMandatoryZones(tpl.mandatoryZones || '');
    setDescription(tpl.guide.description || '');
    setPreUseInspection([...tpl.guide.preUseInspection]);
    setWearingSteps([...tpl.guide.wearingSteps]);
    setMaintenance([...tpl.guide.maintenance]);
    setDos([...(tpl.guide.dosAndDonts?.dos || [])]);
    setDonts([...(tpl.guide.dosAndDonts?.donts || [])]);
    setExpiryYears(tpl.expiryYears || 5);
  };

  useEffect(() => {
    if (!isOpen) return;

    if (itemToEdit) {
      setCode(itemToEdit.code || '');
      setName(itemToEdit.name || '');
      setCategory(itemToEdit.category || 'head_protection');
      setBrand(itemToEdit.brand || '');
      setModelNumber(itemToEdit.modelNumber || '');
      setTotalQty(itemToEdit.totalQty || 1);
      setUnit(itemToEdit.unit || 'Unit');
      setCondition(itemToEdit.condition || 'Baik');
      const resolvedWhId = typeof itemToEdit.warehouseId === 'object'
        ? itemToEdit.warehouseId?._id
        : itemToEdit.warehouseId || '';
      const matchedWh = warehouses.find((w) => w._id === resolvedWhId);
      setWarehouseId(resolvedWhId || warehouses.find((w) => w.isDefault)?._id || warehouses[0]?._id || '');
      setBinRef(itemToEdit.binRef || '');
      setLocation(itemToEdit.location || matchedWh?.name || warehouses[0]?.name || 'Head Office PT Mega Tama Enerco');
      setNotes(itemToEdit.notes || '');

      setIndonesianRegulation(itemToEdit.standardRegulation?.indonesian || '');
      setInternationalRegulation(itemToEdit.standardRegulation?.international || '');
      setRiskLevel(itemToEdit.standardRegulation?.riskLevel || 'Kritis');
      setColorCode(itemToEdit.standardRegulation?.colorCode || '');
      setMandatoryZones(itemToEdit.standardRegulation?.mandatoryZones || '');

      setDescription(itemToEdit.guide?.description || '');
      setPreUseInspection(itemToEdit.guide?.preUseInspection || []);
      setWearingSteps(itemToEdit.guide?.wearingSteps || []);
      setMaintenance(itemToEdit.guide?.maintenance || []);
      setDos(itemToEdit.guide?.dosAndDonts?.dos || []);
      setDonts(itemToEdit.guide?.dosAndDonts?.donts || []);
      setExpiryYears(itemToEdit.guide?.expiryYears || 5);

      setPhotoPreview(itemToEdit.photo ? getImageUrl(itemToEdit.photo) : null);
      setSelectedTemplateId(itemToEdit.templateId || '');
    } else {
      // Default to first repo template (Safety Helmet)
      if (repoTemplates.length > 0) {
        applyTemplate(repoTemplates[0].templateId);
      }
      const defaultWh = warehouses.find((w) => w.isDefault) || warehouses[0];
      setCode('');
      setBrand('');
      setModelNumber('');
      setTotalQty(10);
      setCondition('Baik');
      setWarehouseId(defaultWh?._id || '');
      setBinRef('');
      setLocation(defaultWh?.name || 'Head Office PT Mega Tama Enerco');
      setNotes('');
      setPhotoFile(null);
      setPhotoPreview(null);
    }
    setErrorMsg(null);
    setActiveTab('general');
  }, [isOpen, itemToEdit, repoTemplates, warehouses]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleAddListItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => [...prev, '']);
  };

  const handleUpdateListItem = (
    index: number,
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleRemoveListItem = (
    index: number,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Nama APD wajib diisi');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      if (code) formData.append('code', code.trim().toUpperCase());
      formData.append('name', name.trim());
      formData.append('category', category);
      formData.append('categoryLabel', CATEGORIES.find((c) => c.key === category)?.label || 'APD');
      if (brand) formData.append('brand', brand);
      if (modelNumber) formData.append('modelNumber', modelNumber);
      formData.append('totalQty', String(totalQty));
      formData.append('availableQty', String(totalQty));
      formData.append('unit', unit);
      formData.append('condition', condition);
      if (warehouseId) formData.append('warehouseId', warehouseId);
      if (binRef) formData.append('binRef', binRef);
      formData.append('location', location);
      if (notes) formData.append('notes', notes);
      if (selectedTemplateId) formData.append('templateId', selectedTemplateId);

      // Regulations
      formData.append(
        'standardRegulation',
        JSON.stringify({
          indonesian: indonesianRegulation,
          international: internationalRegulation,
          riskLevel,
          colorCode,
          mandatoryZones,
        })
      );

      // SOP Guide
      formData.append(
        'guide',
        JSON.stringify({
          description,
          preUseInspection: preUseInspection.filter((s) => s.trim().length > 0),
          wearingSteps: wearingSteps.filter((s) => s.trim().length > 0),
          maintenance: maintenance.filter((s) => s.trim().length > 0),
          dosAndDonts: {
            dos: dos.filter((s) => s.trim().length > 0),
            donts: donts.filter((s) => s.trim().length > 0),
          },
          expiryYears,
        })
      );

      if (photoFile) {
        formData.append('photo', photoFile);
      }

      let res;
      if (isEditing && itemToEdit) {
        res = await updatePPEItem(itemToEdit._id, formData);
        onSuccess(res.data, `Item APD "${res.data.name}" berhasil diperbarui`);
      } else {
        res = await createPPEItem(formData);
        onSuccess(res.data, `Item APD "${res.data.name}" (${res.data.code}) berhasil ditambahkan`);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to save PPE item:', err);
      setErrorMsg(err.response?.data?.msg || 'Gagal menyimpan item APD');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ppe-modal-title"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h2 id="ppe-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
                {isEditing ? 'Ubah Data APD & Kustomisasi SOP' : 'Tambah Master Item APD Baru'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pilih standar regulasi nasional & internasional, atur stok fisik, dan kustomisasi panduan K3
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 bg-slate-50/30 dark:bg-slate-900/30">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'general'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>1. Data Teknis & Stok</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('regulations')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'regulations'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>2. Regulasi SNI & Internasional</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sop')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'sop'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>3. Kustomisasi SOP Panduan K3</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="m-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* ======================================================== */}
          {/* TAB 1: GENERAL & STOCK                                   */}
          {/* ======================================================== */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Template Picker */}
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                <label className="block text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  Pilih dari Repositori Standar Regulasi K3 (Template Acuan):
                </label>
                <select
                  id="modal-ppe-template-select"
                  value={selectedTemplateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-amber-200 dark:border-amber-700/60 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- Template Standar Regulasi --</option>
                  {repoTemplates.map((tpl) => (
                    <option key={tpl.templateId} value={tpl.templateId}>
                      {tpl.name} ({tpl.categoryLabel})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-amber-700 dark:text-amber-300/80 mt-1.5">
                  Memilih template otomatis mengisi pasal Permenakertrans 8/2010, standar SNI, OSHA, checklist inspeksi, dan SOP pemakaian.
                </p>
              </div>

              {/* Code, Name & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Kode APD
                  </label>
                  <input
                    id="modal-ppe-code"
                    type="text"
                    placeholder="Auto (APD-HLM-001)"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Nama Item APD <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="modal-ppe-name"
                    type="text"
                    required
                    placeholder="Contoh: Safety Helmet Delta Plus Quartz IV"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Kategori Perlindungan
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as PPECategoryKey)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Merk / Manufaktur
                  </label>
                  <input
                    id="modal-ppe-brand"
                    type="text"
                    placeholder="Contoh: Delta Plus, Petzl, 3M"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Model / Tipe Seri
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Quartz IV Rotor"
                    value={modelNumber}
                    onChange={(e) => setModelNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Stock and Condition */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Jumlah Total Stok
                  </label>
                  <input
                    id="modal-ppe-totalQty"
                    type="number"
                    min="0"
                    value={totalQty}
                    onChange={(e) => setTotalQty(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Satuan
                  </label>
                  <input
                    type="text"
                    placeholder="Unit / Pasang / Set"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Kondisi Fisik
                  </label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Baik">Baik & Layak</option>
                    <option value="Cukup Baik">Cukup Baik</option>
                    <option value="Perlu Servis">Perlu Servis / Kalibrasi</option>
                    <option value="Rusak / Afkir">Rusak / Afkir</option>
                  </select>
                </div>
              </div>

              {/* Registered Warehouse & Rack/Bin Storage Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/60">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Gudang Penyimpanan Terdaftar</span> <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="modal-ppe-warehouse"
                    required
                    value={warehouseId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setWarehouseId(selectedId);
                      const wh = warehouses.find((w) => w._id === selectedId);
                      if (wh) {
                        setLocation(wh.name);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="">-- Pilih Fasilitas Gudang Resmi --</option>
                    {warehouses.map((w) => (
                      <option key={w._id} value={w._id}>
                        {w.name} {w.isDefault ? '(Pusat / Head Office)' : `[${w.code}]`}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Lokasi APD wajib terdaftar resmi di sistem pergudangan MTERP.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Zona / Rak / Bin Spesifik (Opsional)</span>
                  </label>
                  <input
                    id="modal-ppe-binRef"
                    type="text"
                    placeholder="Contoh: Zona C > Rak Safety > C-01"
                    value={binRef}
                    onChange={(e) => setBinRef(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nomor rak atau bin penyimpanan di dalam gudang terpilih.
                  </p>
                </div>
              </div>

              {/* Photo Upload */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Foto Fisik Item APD
                </label>
                <div className="flex items-center gap-4">
                  {photoPreview ? (
                    <div className="relative group w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 shadow-sm shrink-0">
                      <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoFile(null);
                          setPhotoPreview(null);
                        }}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold transition-opacity cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 shrink-0">
                      <Camera className="w-6 h-6 mb-1" />
                      <span className="text-[10px]">No Photo</span>
                    </div>
                  )}

                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      id="ppe-photo-upload"
                      className="hidden"
                    />
                    <label
                      htmlFor="ppe-photo-upload"
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shadow-xs"
                    >
                      <Upload className="w-4 h-4 text-slate-500" />
                      Unggah Foto APD
                    </label>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Mendukung format JPG, PNG, atau WebP (Maksimal 10MB).
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Catatan Internal Inventaris
                </label>
                <input
                  type="text"
                  placeholder="Catatan batch pengadaan, vendor supplier, nomor garansi..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: REGULATIONS                                       */}
          {/* ======================================================== */}
          {activeTab === 'regulations' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
                <Scale className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                <span>
                  Sesuai ketentuan UU No. 1/1970 Pasal 14 dan Permenakertrans RI No. PER.08/MEN/VII/2010 Pasal 2, setiap APD yang disediakan wajib memenuhi Standar Nasional Indonesia (SNI) atau standar keselamatan internasional yang setara.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Standar Regulasi Nasional Indonesia (SNI & Permenaker)
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Permenakertrans No. PER.08/MEN/VII/2010; UU No. 1/1970; SNI ISO 3873:2012"
                  value={indonesianRegulation}
                  onChange={(e) => setIndonesianRegulation(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Standar Regulasi Internasional (OSHA / ANSI / EN ISO)
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: ANSI/ISEA Z89.1 Type 1 Class E; OSHA 29 CFR 1926.100; EN 397:2012"
                  value={internationalRegulation}
                  onChange={(e) => setInternationalRegulation(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Tingkat Risiko Bahaya Kerja
                  </label>
                  <select
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Rendah">Rendah (Low Risk)</option>
                    <option value="Sedang">Sedang (Moderate Risk)</option>
                    <option value="Tinggi">Tinggi (High Risk)</option>
                    <option value="Kritis">Kritis (Critical - Wajib Seluruh Zona)</option>
                    <option value="Sangat Kritis">Sangat Kritis (Pekerjaan Ketinggian / Confined Space)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Kode Warna K3 Lapangan
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Putih (Manajer), Kuning (Pekerja), Merah (HSE)"
                    value={colorCode}
                    onChange={(e) => setColorCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Area / Zona Wajib Pemakaian (Mandatory Zones)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Seluruh area perimeter konstruksi, galian, dan radius putar alat berat"
                  value={mandatoryZones}
                  onChange={(e) => setMandatoryZones(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Masa Kadaluarsa Manufaktur (Tahun)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={expiryYears}
                  onChange={(e) => setExpiryYears(parseInt(e.target.value, 10) || 5)}
                  className="w-32 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: CUSTOMIZE SOP                                     */}
          {/* ======================================================== */}
          {activeTab === 'sop' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Deskripsi Fungsi & Perlindungan Utama
                </label>
                <textarea
                  rows={2}
                  placeholder="Deskripsi cara kerja perlindungan APD..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Wearing steps */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Langkah-Langkah Pemakaian yang Benar (SOP):
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAddListItem(setWearingSteps)}
                    className="text-xs text-amber-600 font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Langkah
                  </button>
                </div>
                <div className="space-y-2">
                  {wearingSteps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-5 text-xs font-bold text-slate-400 text-center">{idx + 1}.</span>
                      <input
                        type="text"
                        value={step}
                        onChange={(e) => handleUpdateListItem(idx, e.target.value, setWearingSteps)}
                        className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveListItem(idx, setWearingSteps)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pre-use inspection checklist */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Checklist Pemeriksaan Sebelum Pakai (Pre-Use Inspection):
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAddListItem(setPreUseInspection)}
                    className="text-xs text-amber-600 font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Poin Inspeksi
                  </button>
                </div>
                <div className="space-y-2">
                  {preUseInspection.map((check, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-5 text-xs font-bold text-slate-400 text-center">•</span>
                      <input
                        type="text"
                        value={check}
                        onChange={(e) => handleUpdateListItem(idx, e.target.value, setPreUseInspection)}
                        className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveListItem(idx, setPreUseInspection)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Maintenance */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Perawatan & Penyimpanan (Maintenance & Storage):
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAddListItem(setMaintenance)}
                    className="text-xs text-amber-600 font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Aturan Perawatan
                  </button>
                </div>
                <div className="space-y-2">
                  {maintenance.map((m, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-5 text-xs font-bold text-slate-400 text-center">•</span>
                      <input
                        type="text"
                        value={m}
                        onChange={(e) => handleUpdateListItem(idx, e.target.value, setMaintenance)}
                        className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveListItem(idx, setMaintenance)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* DOs & DONTs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                      Hal yang Wajib Dilakukan (DOs):
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAddListItem(setDos)}
                      className="text-[11px] text-emerald-600 font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Tambah
                    </button>
                  </div>
                  <div className="space-y-2">
                    {dos.map((d, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={d}
                          onChange={(e) => handleUpdateListItem(idx, e.target.value, setDos)}
                          className="flex-1 px-2.5 py-1.5 text-xs rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 text-slate-900 dark:text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveListItem(idx, setDos)}
                          className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                      Larangan Keras (DON&apos;Ts):
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAddListItem(setDonts)}
                      className="text-[11px] text-rose-600 font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Tambah
                    </button>
                  </div>
                  <div className="space-y-2">
                    {donts.map((d, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={d}
                          onChange={(e) => handleUpdateListItem(idx, e.target.value, setDonts)}
                          className="flex-1 px-2.5 py-1.5 text-xs rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20 text-slate-900 dark:text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveListItem(idx, setDonts)}
                          className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40 -mx-6 -mb-6">
            <div className="flex gap-2">
              {activeTab !== 'general' && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === 'sop') setActiveTab('regulations');
                    else if (activeTab === 'regulations') setActiveTab('general');
                  }}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Sebelumnya
                </button>
              )}
              {activeTab !== 'sop' && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === 'general') setActiveTab('regulations');
                    else if (activeTab === 'regulations') setActiveTab('sop');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Selanjutnya
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Batal
              </button>
              <button
                id="modal-ppe-submit-btn"
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/20 disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Menyimpan...' : isEditing ? 'Simpan Perubahan' : 'Tambah ke Master APD'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
