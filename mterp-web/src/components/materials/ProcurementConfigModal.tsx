import React, { useState, useEffect } from 'react';
import {
  Users,
  X,
  SlidersHorizontal,
  UserCheck,
  ShieldCheck,
  DollarSign,
  Save,
} from 'lucide-react';
import {
  ProcurementAuthorizersResponse,
  ProcurementConfigResponse,
  MaterialRequest,
} from '../../types';
import { updateProcurementConfig, assignProcurementAuthorizers } from '../../api/api';

export interface ProcurementConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorizers: ProcurementAuthorizersResponse;
  procurementConfig: ProcurementConfigResponse | null;
  onConfigUpdated: () => Promise<void> | void;
}

export function ProcurementConfigModal({
  isOpen,
  onClose,
  authorizers,
  procurementConfig,
  onConfigUpdated,
}: ProcurementConfigModalProps) {
  const [globalReviewerId, setGlobalReviewerId] = useState('');
  const [globalOpsApproverId, setGlobalOpsApproverId] = useState('');
  const [globalFinanceApproverId, setGlobalFinanceApproverId] = useState('');
  const [globalAutoAssign, setGlobalAutoAssign] = useState(true);
  const [savingGlobalConfig, setSavingGlobalConfig] = useState(false);

  useEffect(() => {
    if (procurementConfig) {
      const revId =
        typeof procurementConfig.defaultReviewerId === 'object'
          ? procurementConfig.defaultReviewerId?._id
          : procurementConfig.defaultReviewerId;
      const opsId =
        typeof procurementConfig.defaultOpsApproverId === 'object'
          ? procurementConfig.defaultOpsApproverId?._id
          : procurementConfig.defaultOpsApproverId;
      const finId =
        typeof procurementConfig.defaultFinanceApproverId === 'object'
          ? procurementConfig.defaultFinanceApproverId?._id
          : procurementConfig.defaultFinanceApproverId;

      setGlobalReviewerId(revId || '');
      setGlobalOpsApproverId(opsId || '');
      setGlobalFinanceApproverId(finId || '');
      setGlobalAutoAssign(procurementConfig.autoAssignEnabled !== false);
    }
  }, [procurementConfig]);

  if (!isOpen) return null;

  const handleSaveGlobalConfig = async () => {
    setSavingGlobalConfig(true);
    try {
      await updateProcurementConfig({
        defaultReviewerId: globalReviewerId || undefined,
        defaultOpsApproverId: globalOpsApproverId || undefined,
        defaultFinanceApproverId: globalFinanceApproverId || undefined,
        autoAssignEnabled: globalAutoAssign,
      });
      await onConfigUpdated();
      alert('Kebijakan approver global berhasil disimpan');
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal menyimpan kebijakan approver');
    } finally {
      setSavingGlobalConfig(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-dropdown-enter">
        <div className="flex items-center justify-between pb-4 border-b border-border-light">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Users size={18} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-text-primary m-0">
                Alur Otorisasi & Direktori Personel Approver
              </h3>
              <p className="text-xs text-text-muted m-0 mt-0.5">
                Panduan 7 tahap alur pengadaan & daftar personil yang berwenang melakukan review dan approval
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Kebijakan Alur Otorisasi Global untuk Seluruh PR */}
        <div className="mt-5 p-4 sm:p-5 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <SlidersHorizontal size={17} />
              </div>
              <div>
                <h4 className="text-sm font-black text-indigo-950 m-0">
                  Kebijakan Alur Approver Global (Untuk Seluruh PR)
                </h4>
                <p className="text-[11px] text-text-muted m-0">
                  Konfigurasi personil approver perusahaan. Seluruh PR yang diajukan akan otomatis dialirkan ke sini tanpa perlu dipilih manual.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-bold text-text-primary cursor-pointer select-none px-3 py-1.5 rounded-lg bg-white border border-indigo-200">
                <input
                  type="checkbox"
                  checked={globalAutoAssign}
                  onChange={(e) => setGlobalAutoAssign(e.target.checked)}
                  className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
                <span>Auto-Assign Otomatis Aktif</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="text-[11px] font-bold text-blue-900 uppercase mb-1 block flex items-center gap-1">
                <UserCheck size={13} className="text-blue-600" />
                <span>1. Default Reviewer QC / SPV</span>
              </label>
              <select
                value={globalReviewerId}
                onChange={(e) => setGlobalReviewerId(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium focus:ring-2 focus:ring-primary/20"
              >
                <option value="">-- Bebas (Semua Reviewer QC / SPV) --</option>
                {authorizers.reviewers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName} ({u.role}) - {u.email || ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-indigo-900 uppercase mb-1 block flex items-center gap-1">
                <ShieldCheck size={13} className="text-indigo-600" />
                <span>2. Default Penyetuju Ops (Direktur Ops)</span>
              </label>
              <select
                value={globalOpsApproverId}
                onChange={(e) => setGlobalOpsApproverId(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium focus:ring-2 focus:ring-primary/20"
              >
                <option value="">-- Bebas (Semua Direktur Operasional) --</option>
                {authorizers.opsApprovers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName} ({u.role}) - {u.email || ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-emerald-900 uppercase mb-1 block flex items-center gap-1">
                <DollarSign size={13} className="text-emerald-600" />
                <span>3. Default Penyetuju Keuangan (Direktur Keuangan)</span>
              </label>
              <select
                value={globalFinanceApproverId}
                onChange={(e) => setGlobalFinanceApproverId(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium focus:ring-2 focus:ring-primary/20"
              >
                <option value="">-- Bebas (Semua Direktur Keuangan) --</option>
                {authorizers.financeApprovers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName} ({u.role}) - {u.email || ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleSaveGlobalConfig}
              disabled={savingGlobalConfig}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Save size={14} />
              <span>{savingGlobalConfig ? 'Menyimpan...' : 'Simpan Kebijakan Global untuk Seluruh PR'}</span>
            </button>
          </div>
        </div>

        {/* Visual Workflow Steps */}
        <div className="mt-5 space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-border-light">
            <span className="text-xs font-black uppercase tracking-wide text-text-primary block mb-3">
              7 Tahap Alur Standar Procurement & Purchase Order
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-white border border-border-light space-y-1">
                <span className="text-[10px] font-black text-slate-500 uppercase block">Tahap 1</span>
                <span className="font-bold text-text-primary block">Pengajuan PR Baru</span>
                <p className="text-[11px] text-text-muted m-0">Berdasarkan RAB Proyek atau item kustom, multi-item material.</p>
              </div>

              <div className="p-3 rounded-lg bg-white border border-blue-200 bg-blue-50/20 space-y-1">
                <span className="text-[10px] font-black text-blue-600 uppercase block">Tahap 2</span>
                <span className="font-bold text-blue-900 block">Reviu QC / SPV</span>
                <p className="text-[11px] text-text-muted m-0">Supervisor atau Quality Control memverifikasi spesifikasi & qty.</p>
              </div>

              <div className="p-3 rounded-lg bg-white border border-indigo-200 bg-indigo-50/20 space-y-1">
                <span className="text-[10px] font-black text-indigo-600 uppercase block">Tahap 3</span>
                <span className="font-bold text-indigo-900 block">Persetujuan Ops Director</span>
                <p className="text-[11px] text-text-muted m-0">Otorisasi PR resmi dengan passphrase tanda tangan digital.</p>
              </div>

              <div className="p-3 rounded-lg bg-white border border-purple-200 bg-purple-50/20 space-y-1">
                <span className="text-[10px] font-black text-purple-600 uppercase block">Tahap 4</span>
                <span className="font-bold text-purple-900 block">Komparasi Supplier Multi-Item</span>
                <p className="text-[11px] text-text-muted m-0">Membandingkan tarif per item vendor, ongkir, dan landed cost.</p>
              </div>

              <div className="p-3 rounded-lg bg-white border border-emerald-200 bg-emerald-50/20 space-y-1">
                <span className="text-[10px] font-black text-emerald-600 uppercase block">Tahap 5</span>
                <span className="font-bold text-emerald-900 block">Persetujuan Finance Director</span>
                <p className="text-[11px] text-text-muted m-0">Approval anggaran PO mengikat, ditandai sebagai Siap Beli (Must Purchase).</p>
              </div>

              <div className="p-3 rounded-lg bg-white border border-sky-200 bg-sky-50/20 space-y-1">
                <span className="text-[10px] font-black text-sky-600 uppercase block">Tahap 6</span>
                <span className="font-bold text-sky-900 block">Pengiriman (On The Way)</span>
                <p className="text-[11px] text-text-muted m-0">Input no. polisi, nama supir, dan foto Surat Jalan supplier.</p>
              </div>

              <div className="p-3 rounded-lg bg-white border border-teal-200 bg-teal-50/20 space-y-1 col-span-1 sm:col-span-2">
                <span className="text-[10px] font-black text-teal-600 uppercase block">Tahap 7</span>
                <span className="font-bold text-teal-900 block">Penerimaan Fisik di Proyek (Goods Receipt)</span>
                <p className="text-[11px] text-text-muted m-0">Wajib unggah foto fisik material tiba di lokasi proyek & ceklist kuantitas per baris sebelum masuk inventaris stok.</p>
              </div>
            </div>
          </div>

          {/* Authorizers Directory Groups */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Reviewers */}
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-blue-900 flex items-center gap-1.5">
                  <UserCheck size={14} className="text-blue-600" />
                  <span>Reviewer QC / SPV</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                  {authorizers.reviewers.length} Personel
                </span>
              </div>
              <div className="divide-y divide-blue-100 max-h-48 overflow-y-auto">
                {authorizers.reviewers.map((u) => (
                  <div key={u._id} className="py-2 text-xs">
                    <div className="font-bold text-text-primary">{u.fullName}</div>
                    <div className="text-[11px] text-text-muted flex items-center justify-between">
                      <span>{u.role}</span>
                      <span className="italic">{u.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Ops Approvers */}
            <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-indigo-900 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-indigo-600" />
                  <span>Ops Director Approver</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                  {authorizers.opsApprovers.length} Personel
                </span>
              </div>
              <div className="divide-y divide-indigo-100 max-h-48 overflow-y-auto">
                {authorizers.opsApprovers.map((u) => (
                  <div key={u._id} className="py-2 text-xs">
                    <div className="font-bold text-text-primary">{u.fullName}</div>
                    <div className="text-[11px] text-text-muted flex items-center justify-between">
                      <span>{u.role}</span>
                      <span className="italic">{u.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Finance Approvers */}
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-emerald-900 flex items-center gap-1.5">
                  <DollarSign size={14} className="text-emerald-600" />
                  <span>Finance Director Approver</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  {authorizers.financeApprovers.length} Personel
                </span>
              </div>
              <div className="divide-y divide-emerald-100 max-h-48 overflow-y-auto">
                {authorizers.financeApprovers.map((u) => (
                  <div key={u._id} className="py-2 text-xs">
                    <div className="font-bold text-text-primary">{u.fullName}</div>
                    <div className="text-[11px] text-text-muted flex items-center justify-between">
                      <span>{u.role}</span>
                      <span className="italic">{u.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 mt-5 border-t border-border-light">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer shadow-xs"
          >
            Tutup Direktori
          </button>
        </div>
      </div>
    </div>
  );
}

export interface OrderAuthorizerAssignModalProps {
  order: MaterialRequest | null;
  onClose: () => void;
  authorizers: ProcurementAuthorizersResponse;
  onSuccess: () => Promise<void> | void;
}

export function OrderAuthorizerAssignModal({
  order,
  onClose,
  authorizers,
  onSuccess,
}: OrderAuthorizerAssignModalProps) {
  const [assignReviewerId, setAssignReviewerId] = useState('');
  const [assignOpsApproverId, setAssignOpsApproverId] = useState('');
  const [assignFinanceApproverId, setAssignFinanceApproverId] = useState('');
  const [savingAssignment, setSavingAssignment] = useState(false);

  useEffect(() => {
    if (order) {
      const revId =
        typeof order.assignedReviewerId === 'object'
          ? order.assignedReviewerId?._id
          : order.assignedReviewerId;
      const opsId =
        typeof order.assignedOpsApproverId === 'object'
          ? order.assignedOpsApproverId?._id
          : order.assignedOpsApproverId;
      const finId =
        typeof order.assignedFinanceApproverId === 'object'
          ? order.assignedFinanceApproverId?._id
          : order.assignedFinanceApproverId;

      setAssignReviewerId(revId || authorizers.reviewers[0]?._id || '');
      setAssignOpsApproverId(opsId || authorizers.opsApprovers[0]?._id || '');
      setAssignFinanceApproverId(finId || authorizers.financeApprovers[0]?._id || '');
    }
  }, [order, authorizers]);

  if (!order) return null;

  const handleSaveAssignAuthorizers = async () => {
    setSavingAssignment(true);
    try {
      await assignProcurementAuthorizers(order._id!, {
        assignedReviewerId: assignReviewerId || undefined,
        assignedOpsApproverId: assignOpsApproverId || undefined,
        assignedFinanceApproverId: assignFinanceApproverId || undefined,
      });
      onClose();
      await onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal memperbarui penugasan approver');
    } finally {
      setSavingAssignment(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-xl animate-dropdown-enter">
        <div className="flex items-center justify-between pb-3 border-b border-border-light">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <SlidersHorizontal size={16} />
            </div>
            <div>
              <h3 className="text-base font-black text-text-primary m-0">Atur Penugasan Approver PR & PO</h3>
              <p className="text-xs text-text-muted m-0 mt-0.5">
                PR: <b>{order.prNumber}</b>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 mt-4">
          <p className="text-xs text-text-muted">
            Tentukan personel spesifik yang bertanggung jawab meninjau teknis, menyetujui PR operasional, dan menyetujui anggaran PO untuk transaksi ini.
          </p>

          <div>
            <label className="text-xs font-bold text-text-muted uppercase mb-1 block flex items-center gap-1.5">
              <UserCheck size={14} className="text-blue-600" />
              <span>1. Peninjau Teknis / QC (Supervisor / QA)</span>
            </label>
            <select
              value={assignReviewerId}
              onChange={(e) => setAssignReviewerId(e.target.value)}
              className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium"
            >
              <option value="">-- Bebas (Semua QC/SPV Berhak Reviu) --</option>
              {authorizers.reviewers.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.fullName} ({u.role}) - {u.email || ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-text-muted uppercase mb-1 block flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-indigo-600" />
              <span>2. Penyetuju PR (Direktur Operasional)</span>
            </label>
            <select
              value={assignOpsApproverId}
              onChange={(e) => setAssignOpsApproverId(e.target.value)}
              className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium"
            >
              <option value="">-- Bebas (Semua Direktur Ops Berhak Setujui) --</option>
              {authorizers.opsApprovers.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.fullName} ({u.role}) - {u.email || ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-text-muted uppercase mb-1 block flex items-center gap-1.5">
              <DollarSign size={14} className="text-emerald-600" />
              <span>3. Penyetuju PO & Budget (Direktur Keuangan)</span>
            </label>
            <select
              value={assignFinanceApproverId}
              onChange={(e) => setAssignFinanceApproverId(e.target.value)}
              className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium"
            >
              <option value="">-- Bebas (Semua Direktur Keuangan Berhak Setujui) --</option>
              {authorizers.financeApprovers.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.fullName} ({u.role}) - {u.email || ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5 pt-3 border-t border-border-light">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted hover:bg-slate-100"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSaveAssignAuthorizers}
            disabled={savingAssignment}
            className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark cursor-pointer shadow-xs disabled:opacity-50"
          >
            {savingAssignment ? 'Menyimpan...' : 'Simpan Penugasan Approver'}
          </button>
        </div>
      </div>
    </div>
  );
}
