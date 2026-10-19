import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Layers,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  UserCheck,
  DollarSign,
  SlidersHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  IProcurementItem,
  ProjectData,
  ProcurementAuthorizersResponse,
  ProcurementConfigResponse,
} from '../../types';
import api, { createMaterialRequest } from '../../api/api';
import { formatRupiah } from '../../utils/currency';

export const EMPTY_LINE_ITEM: IProcurementItem = {
  isRabBased: false,
  item: '',
  specifications: '',
  qty: 1,
  unit: 'Pcs',
  budgetUnitRate: 0,
  totalBudget: 0,
};

export interface MaterialRequestCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectData[];
  authorizers: ProcurementAuthorizersResponse;
  procurementConfig: ProcurementConfigResponse | null;
  isOwner: boolean;
  onSuccess: () => Promise<void> | void;
}

export function MaterialRequestCreateModal({
  isOpen,
  onClose,
  projects,
  authorizers,
  procurementConfig,
  isOwner,
  onSuccess,
}: MaterialRequestCreateModalProps) {
  const [prMode, setPrMode] = useState<'RAB' | 'NON_RAB'>('RAB');
  const [loadingRab, setLoadingRab] = useState(false);
  const [prProjectId, setPrProjectId] = useState('');
  const [prDateNeeded, setPrDateNeeded] = useState('');
  const [prUrgency, setPrUrgency] = useState<'Low' | 'Normal' | 'High' | 'Urgent'>('Normal');
  const [prPurpose, setPrPurpose] = useState('');
  const [prReviewerId, setPrReviewerId] = useState('');
  const [prOpsApproverId, setPrOpsApproverId] = useState('');
  const [prFinanceApproverId, setPrFinanceApproverId] = useState('');
  const [prItems, setPrItems] = useState<IProcurementItem[]>([{ ...EMPTY_LINE_ITEM, isRabBased: true }]);
  const [projectRabItems, setProjectRabItems] = useState<any[]>([]);
  const [showOwnerOverridePrApprovers, setShowOwnerOverridePrApprovers] = useState(false);
  const [submittingPr, setSubmittingPr] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPrMode('RAB');
      setPrProjectId('');
      setProjectRabItems([]);
      setPrPurpose('');
      setPrDateNeeded('');
      setPrUrgency('Normal');
      setPrItems([{ ...EMPTY_LINE_ITEM, isRabBased: true }]);
      setShowOwnerOverridePrApprovers(false);

      const revId =
        typeof procurementConfig?.defaultReviewerId === 'object'
          ? procurementConfig.defaultReviewerId?._id
          : procurementConfig?.defaultReviewerId || (authorizers.reviewers[0]?._id || '');
      const opsId =
        typeof procurementConfig?.defaultOpsApproverId === 'object'
          ? procurementConfig.defaultOpsApproverId?._id
          : procurementConfig?.defaultOpsApproverId || (authorizers.opsApprovers[0]?._id || '');
      const finId =
        typeof procurementConfig?.defaultFinanceApproverId === 'object'
          ? procurementConfig.defaultFinanceApproverId?._id
          : procurementConfig?.defaultFinanceApproverId || (authorizers.financeApprovers[0]?._id || '');

      setPrReviewerId(revId || '');
      setPrOpsApproverId(opsId || '');
      setPrFinanceApproverId(finId || '');
    }
  }, [isOpen, procurementConfig, authorizers]);

  const handlePrModeChange = (newMode: 'RAB' | 'NON_RAB') => {
    setPrMode(newMode);
    if (newMode === 'NON_RAB') {
      setPrItems((prev) =>
        prev.map((itm) => ({
          ...itm,
          isRabBased: false,
          rabItemId: undefined,
          wbsCode: '',
        }))
      );
    } else {
      setPrItems((prev) =>
        prev.map((itm) => ({
          ...itm,
          isRabBased: true,
        }))
      );
      if (prProjectId && projectRabItems.length === 0) {
        handleSelectPrProject(prProjectId);
      }
    }
  };

  const handleSelectPrProject = async (projId: string) => {
    setPrProjectId(projId);
    if (!projId) {
      setProjectRabItems([]);
      return;
    }
    setLoadingRab(true);
    try {
      const res = await api.get(`/projects/${projId}/rab`);
      const raw = Array.isArray(res.data?.rabItems)
        ? res.data.rabItems
        : Array.isArray(res.data)
        ? res.data
        : [];
      const leaves = raw.filter((r: any) => !r.isSummary);
      setProjectRabItems(leaves.length > 0 ? leaves : raw);
    } catch (err) {
      console.error('Failed to fetch project RAB', err);
      setProjectRabItems([]);
    } finally {
      setLoadingRab(false);
    }
  };

  const handleAddPrItem = () => {
    setPrItems((prev) => [
      ...prev,
      {
        ...EMPTY_LINE_ITEM,
        isRabBased: prMode === 'RAB',
      },
    ]);
  };

  const handleRemovePrItem = (idx: number) => {
    if (prItems.length <= 1) return;
    setPrItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdatePrItem = (idx: number, patch: Partial<IProcurementItem>) => {
    setPrItems((prev) => {
      const copy = [...prev];
      const updated = { ...copy[idx], ...patch };
      const q = Number(updated.qty) || 0;
      const rate = Number(updated.budgetUnitRate) || 0;
      updated.totalBudget = q * rate;
      copy[idx] = updated;
      return copy;
    });
  };

  const handleToggleItemRabType = (idx: number, makeRab: boolean) => {
    if (makeRab) {
      handleUpdatePrItem(idx, {
        isRabBased: true,
      });
    } else {
      handleUpdatePrItem(idx, {
        isRabBased: false,
        rabItemId: undefined,
        wbsCode: '',
      });
    }
  };

  const handleSelectRabItem = (idx: number, rabItemId: string) => {
    const rab = projectRabItems.find((r) => r._id === rabItemId);
    if (!rab) {
      handleUpdatePrItem(idx, { isRabBased: false, rabItemId: undefined, wbsCode: '' });
      return;
    }
    const currentQty = Number(prItems[idx]?.qty) || 1;
    const unitRate = Number(rab.unitRate) || 0;
    handleUpdatePrItem(idx, {
      isRabBased: true,
      rabItemId: rab._id,
      wbsCode: rab.wbsCode,
      item: rab.description,
      unit: rab.unitOfMeasure || 'Pcs',
      budgetUnitRate: unitRate,
      totalBudget: currentQty * unitRate,
    });
  };

  const prTotalEstimatedBudget = useMemo(() => {
    return prItems.reduce((acc, itm) => acc + (Number(itm.totalBudget) || 0), 0);
  }, [prItems]);

  const handleCreatePrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prMode === 'RAB' && !prProjectId) {
      alert('Mohon pilih proyek tujuan untuk Purchase Request berbasis RAB');
      return;
    }
    if (!prDateNeeded) {
      alert('Mohon tentukan tanggal kebutuhan');
      return;
    }
    const validItems = prItems.filter((i) => i.item.trim().length > 0 && Number(i.qty) > 0);
    if (validItems.length === 0) {
      alert('Mohon lengkapi minimal 1 baris material dengan nama dan kuantitas valid');
      return;
    }

    if (prMode === 'RAB' && projectRabItems.length > 0) {
      const anyRabLinked = validItems.some((i) => i.isRabBased && i.rabItemId);
      if (!anyRabLinked) {
        const proceed = window.confirm(
          'Anda memilih mode Berbasis RAB namun belum memilih mata anggaran RAB pada baris material. Apakah Anda ingin tetap melanjutkan?'
        );
        if (!proceed) return;
      }
    }

    setSubmittingPr(true);
    try {
      await createMaterialRequest({
        projectId: prProjectId || undefined,
        dateNeeded: prDateNeeded,
        urgency: prUrgency,
        purpose: prPurpose,
        items: validItems,
        assignedReviewerId: prReviewerId || undefined,
        assignedOpsApproverId: prOpsApproverId || undefined,
        assignedFinanceApproverId: prFinanceApproverId || undefined,
      });
      onClose();
      await onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal mengajukan Purchase Request');
    } finally {
      setSubmittingPr(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-xl animate-dropdown-enter">
        <div className="flex items-center justify-between pb-4 border-b border-border-light">
          <div>
            <h2 className="text-lg font-black text-text-primary m-0">Pengajuan Purchase Request (PR) Baru</h2>
            <p className="text-xs text-text-muted m-0 mt-0.5">
              Tentukan jenis pengadaan: Berbasis RAB Proyek atau Non-RAB (Kustom / Operasional)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-bg-secondary"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleCreatePrSubmit} className="space-y-5 mt-4">
          {/* PR Mode Decision Cards (RAB Based vs Non-RAB) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handlePrModeChange('RAB')}
              className={`flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                prMode === 'RAB'
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs'
                  : 'border-border-light bg-bg-white hover:border-slate-300'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  prMode === 'RAB' ? 'bg-primary text-white shadow-2xs' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Layers size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-black text-text-primary">Berbasis RAB (RAB-Based)</span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      prMode === 'RAB' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    Terkontrol Anggaran
                  </span>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
                  Material ditautkan ke mata anggaran WBS proyek. Memastikan harga dan kuantitas sesuai plafon RAB.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handlePrModeChange('NON_RAB')}
              className={`flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                prMode === 'NON_RAB'
                  ? 'border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/20 shadow-xs'
                  : 'border-border-light bg-bg-white hover:border-slate-300'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  prMode === 'NON_RAB' ? 'bg-amber-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Package size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-black text-text-primary">Non-RAB (Kustom / Operasional)</span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      prMode === 'NON_RAB' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    Bebas / Fleksibel
                  </span>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
                  Pengadaan bebas untuk kebutuhan darurat, operasional umum kantor/workshop, atau material tak terduga.
                </p>
              </div>
            </button>
          </div>

          {/* Basic Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-text-muted uppercase block">
                  {prMode === 'RAB' ? 'Proyek Tujuan *' : 'Proyek / Alokasi'}
                </label>
                {prMode === 'NON_RAB' && (
                  <span className="text-[10px] text-text-muted italic">(Opsional)</span>
                )}
              </div>
              <select
                value={prProjectId}
                onChange={(e) => handleSelectPrProject(e.target.value)}
                required={prMode === 'RAB'}
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium"
              >
                <option value="">
                  {prMode === 'RAB' ? '-- Pilih Proyek (Wajib untuk RAB) --' : 'Non-Proyek / Umum (Operasional Kantor & Workshop)'}
                </option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.nama}
                  </option>
                ))}
              </select>
              {prMode === 'RAB' && prProjectId && (
                <div className="mt-1.5 text-[11px]">
                  {loadingRab ? (
                    <span className="text-text-muted flex items-center gap-1">
                      <Clock size={11} className="animate-spin text-primary" /> Memuat data anggaran RAB...
                    </span>
                  ) : projectRabItems.length > 0 ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 size={12} /> {projectRabItems.length} mata anggaran RAB aktif ditemukan
                    </span>
                  ) : (
                    <span className="text-amber-700 font-bold flex items-center gap-1">
                      <AlertTriangle size={12} /> Belum ada RAB pada proyek ini (bisa beralih ke mode Non-RAB)
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Tgl. Dibutuhkan *</label>
              <input
                type="date"
                value={prDateNeeded}
                onChange={(e) => setPrDateNeeded(e.target.value)}
                required
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Tingkat Urgensi</label>
              <select
                value={prUrgency}
                onChange={(e) => setPrUrgency(e.target.value as any)}
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium"
              >
                <option value="Low">Low (Rendah)</option>
                <option value="Normal">Normal</option>
                <option value="High">High (Tinggi)</option>
                <option value="Urgent">Urgent (Kritis)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Keperluan / Catatan Paket Kerja</label>
            <input
              type="text"
              value={prPurpose}
              onChange={(e) => setPrPurpose(e.target.value)}
              placeholder="Contoh: Pekerjaan Balok & Plat Lantai 2 Zona A"
              className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white"
            />
          </div>

          {/* Alur Persetujuan Otomatis (Company-Wide Auto-Routing) */}
          <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-black text-blue-900 uppercase tracking-wide">
                <ShieldCheck size={15} className="text-blue-600" />
                <span>Alur Persetujuan Otomatis (Kebijakan Perusahaan)</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                Auto-Routing Aktif
              </span>
            </div>
            <p className="text-[11px] text-text-muted m-0">
              PR ini akan langsung didistribusikan secara otomatis ke personil berwenang tanpa perlu penugasan manual satu per satu:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
              <div className="p-2 rounded-lg bg-white border border-blue-100 flex items-center gap-2">
                <UserCheck size={14} className="text-blue-600 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[9px] font-bold text-text-muted uppercase block">1. Tinjau QC / SPV</span>
                  <span className="font-bold text-text-primary text-[11px] truncate block">
                    {authorizers.reviewers.find((u) => u._id === prReviewerId)?.fullName ||
                      (typeof procurementConfig?.defaultReviewerId === 'object' && procurementConfig.defaultReviewerId?.fullName) ||
                      'Reviewer QC / SPV'}
                  </span>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-white border border-blue-100 flex items-center gap-2">
                <ShieldCheck size={14} className="text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[9px] font-bold text-text-muted uppercase block">2. Approval Ops</span>
                  <span className="font-bold text-text-primary text-[11px] truncate block">
                    {authorizers.opsApprovers.find((u) => u._id === prOpsApproverId)?.fullName ||
                      (typeof procurementConfig?.defaultOpsApproverId === 'object' && procurementConfig.defaultOpsApproverId?.fullName) ||
                      'Direktur Operasional'}
                  </span>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-white border border-blue-100 flex items-center gap-2">
                <DollarSign size={14} className="text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[9px] font-bold text-text-muted uppercase block">3. Approval Keuangan</span>
                  <span className="font-bold text-text-primary text-[11px] truncate block">
                    {authorizers.financeApprovers.find((u) => u._id === prFinanceApproverId)?.fullName ||
                      (typeof procurementConfig?.defaultFinanceApproverId === 'object' && procurementConfig.defaultFinanceApproverId?.fullName) ||
                      'Direktur Keuangan'}
                  </span>
                </div>
              </div>
            </div>

            {isOwner && (
              <div className="pt-1 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowOwnerOverridePrApprovers((prev) => !prev)}
                  className="text-[11px] font-bold text-primary hover:underline cursor-pointer flex items-center gap-1"
                >
                  <SlidersHorizontal size={12} />
                  <span>{showOwnerOverridePrApprovers ? 'Tutup Penyesuaian Manual' : 'Sesuaikan Personil Khusus (Owner Override)'}</span>
                </button>
              </div>
            )}

            {isOwner && showOwnerOverridePrApprovers && (
              <div className="p-3 mt-2 rounded-lg bg-white border border-border-light grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-text-muted uppercase mb-1 block">Override QC / SPV</label>
                  <select
                    value={prReviewerId}
                    onChange={(e) => setPrReviewerId(e.target.value)}
                    className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white font-medium"
                  >
                    <option value="">-- Bebas (Semua QC/SPV) --</option>
                    {authorizers.reviewers.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.fullName} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] font-bold text-text-muted uppercase mb-1 block">Override Ops Director</label>
                  <select
                    value={prOpsApproverId}
                    onChange={(e) => setPrOpsApproverId(e.target.value)}
                    className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white font-medium"
                  >
                    <option value="">-- Bebas (Semua Direktur Ops) --</option>
                    {authorizers.opsApprovers.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.fullName} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] font-bold text-text-muted uppercase mb-1 block">Override Finance Director</label>
                  <select
                    value={prFinanceApproverId}
                    onChange={(e) => setPrFinanceApproverId(e.target.value)}
                    className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white font-medium"
                  >
                    <option value="">-- Bebas (Semua Direktur Keuangan) --</option>
                    {authorizers.financeApprovers.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.fullName} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Dynamic Line-Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-text-primary tracking-wide">
                  Daftar Material ({prItems.length} Baris)
                </span>
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                    prMode === 'RAB'
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  Mode: {prMode === 'RAB' ? 'Berbasis RAB' : 'Non-RAB / Bebas'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddPrItem}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold text-xs hover:bg-primary/20 transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>Tambah Baris Material</span>
              </button>
            </div>

            <div className="border border-border-light rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-border-light text-[11px] font-black text-text-muted uppercase">
                    <th className="py-2.5 px-2 w-8 text-center">No</th>
                    <th className="py-2.5 px-2 w-48">Tipe / Sumber</th>
                    <th className="py-2.5 px-2 min-w-[160px]">Nama Material *</th>
                    <th className="py-2.5 px-2 min-w-[130px] text-primary">Spesifikasi / Spec</th>
                    <th className="py-2.5 px-2 w-20 text-center">Qty *</th>
                    <th className="py-2.5 px-2 w-20 text-center">Satuan</th>
                    <th className="py-2.5 px-2 w-28 text-right">Tarif Est.</th>
                    <th className="py-2.5 px-2 w-28 text-right">Subtotal</th>
                    <th className="py-2.5 px-2 w-8 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {prItems.map((itm, idx) => {
                    const isRabRow = Boolean(itm.isRabBased);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-2 text-center text-text-muted font-bold">{idx + 1}</td>

                        {/* Tipe / Sumber Column */}
                        <td className="py-2 px-2">
                          {prMode === 'RAB' ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleToggleItemRabType(idx, true)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                                    isRabRow
                                      ? 'bg-primary text-white shadow-2xs'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  RAB
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleItemRabType(idx, false)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                                    !isRabRow
                                      ? 'bg-amber-600 text-white shadow-2xs'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  Non-RAB
                                </button>
                              </div>

                              {isRabRow ? (
                                prProjectId && projectRabItems.length > 0 ? (
                                  <select
                                    value={itm.rabItemId || ''}
                                    onChange={(e) => handleSelectRabItem(idx, e.target.value)}
                                    className="w-full p-1 text-[11px] rounded border border-border-light bg-bg-white font-medium"
                                  >
                                    <option value="">-- Pilih Mata Anggaran RAB --</option>
                                    {projectRabItems.map((rab) => (
                                      <option key={rab._id} value={rab._id}>
                                        [{rab.wbsCode}] {rab.description} ({formatRupiah(rab.unitRate)}/{rab.unitOfMeasure || 'pcs'})
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-[10px] text-amber-600 italic block">
                                    {prProjectId ? 'RAB tidak ditemukan' : 'Pilih proyek dahulu'}
                                  </span>
                                )
                              ) : (
                                <span className="text-[10px] text-amber-700 font-bold block">
                                  Kustom (Non-RAB)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Package size={10} />
                              <span>Non-RAB</span>
                            </span>
                          )}
                        </td>

                        {/* Nama Material */}
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={itm.item}
                            onChange={(e) => handleUpdatePrItem(idx, { item: e.target.value })}
                            placeholder={isRabRow ? 'Pilih RAB atau isi nama barang...' : 'Nama barang / material...'}
                            required
                            className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white font-bold text-text-primary"
                          />
                          {itm.wbsCode && (
                            <span className="inline-block mt-0.5 text-[9px] font-mono px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                              WBS: {itm.wbsCode}
                            </span>
                          )}
                        </td>

                        {/* Spesifikasi */}
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={itm.specifications || ''}
                            onChange={(e) => handleUpdatePrItem(idx, { specifications: e.target.value })}
                            placeholder="Merk, ukuran, standar..."
                            className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white"
                          />
                        </td>

                        {/* Qty */}
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={itm.qty}
                            onChange={(e) => handleUpdatePrItem(idx, { qty: parseFloat(e.target.value) || 0 })}
                            required
                            className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white text-center font-bold"
                          />
                        </td>

                        {/* Satuan */}
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={itm.unit}
                            onChange={(e) => handleUpdatePrItem(idx, { unit: e.target.value })}
                            className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white text-center font-medium"
                          />
                        </td>

                        {/* Tarif Est. */}
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            min="0"
                            value={itm.budgetUnitRate || ''}
                            onChange={(e) => handleUpdatePrItem(idx, { budgetUnitRate: parseFloat(e.target.value) || 0 })}
                            placeholder="0"
                            className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white text-right font-mono font-medium"
                          />
                        </td>

                        {/* Subtotal */}
                        <td className="py-2 px-2 text-right font-bold font-mono text-text-primary">
                          {formatRupiah(itm.totalBudget)}
                        </td>

                        {/* Remove Row Button */}
                        <td className="py-2 px-2 text-center">
                          {prItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemovePrItem(idx)}
                              className="text-red-400 hover:text-red-600 p-1 cursor-pointer transition-colors"
                              title="Hapus baris"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 text-xs font-bold text-text-primary">
              <span>Total Estimasi Anggaran PR: </span>
              <span className="ml-2 font-mono text-sm text-primary">{formatRupiah(prTotalEstimatedBudget)}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-light">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted hover:bg-bg-secondary cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submittingPr}
              className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {submittingPr ? 'Menyimpan...' : 'Ajukan Purchase Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
