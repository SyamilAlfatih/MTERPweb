import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
  UserCheck,
  ShieldCheck,
  DollarSign,
  Loader2,
  X,
  Layers,
} from 'lucide-react';
import { MaterialRequest } from '../../types';
import {
  reviewMaterialRequest,
  opsApproveMaterialRequest,
  financeApproveMaterialRequest,
} from '../../api/api';
import { formatRupiah } from '../../utils/currency';
import { formatDate } from '../../utils/date';

export type BulkActionType = 'review' | 'ops' | 'finance';

export interface MaterialBulkActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionType: BulkActionType;
  orders: MaterialRequest[];
  onComplete: () => Promise<void> | void;
}

interface ItemResult {
  orderId: string;
  prNumber: string;
  success: boolean;
  error?: string;
}

export function MaterialBulkActionModal({
  isOpen,
  onClose,
  actionType,
  orders,
  onComplete,
}: MaterialBulkActionModalProps) {
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [notes, setNotes] = useState('');
  const [reviewDecision, setReviewDecision] = useState<'approve' | 'reject'>('approve');
  const [processing, setProcessing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [results, setResults] = useState<ItemResult[] | null>(null);

  if (!isOpen) return null;

  const totalAmount = orders.reduce((sum, ord) => {
    if (ord.poTotalAmount) return sum + ord.poTotalAmount;
    if (ord.costEstimate) return sum + Number(ord.costEstimate);
    if (Array.isArray(ord.items)) {
      return (
        sum +
        ord.items.reduce(
          (sub, i) => sub + (i.totalBudget || (Number(i.qty) || 0) * (Number(i.budgetUnitRate) || 0)),
          0
        )
      );
    }
    return sum;
  }, 0);

  const getActionConfig = () => {
    switch (actionType) {
      case 'review':
        return {
          title: 'Verifikasi & Review QC Massal',
          subtitle: `Pemeriksaan teknis dan approval QC untuk ${orders.length} Purchase Request`,
          icon: UserCheck,
          accentColor: 'blue',
          buttonLabel: reviewDecision === 'approve' ? 'Setujui Semua Terpilih' : 'Tolak Semua Terpilih',
          confirmMsg:
            reviewDecision === 'approve'
              ? 'Pastikan seluruh spesifikasi dan kebutuhan material telah diverifikasi.'
              : 'Seluruh PR terpilih akan dikembalikan dengan status Ditolak.',
        };
      case 'ops':
        return {
          title: 'Otorisasi Ops Director Massal',
          subtitle: `Tier 2 PR Approval untuk ${orders.length} Purchase Request yang telah lolos QC`,
          icon: ShieldCheck,
          accentColor: 'indigo',
          buttonLabel: 'Otorisasi & Setujui PR',
          confirmMsg: 'Dengan menandatangani digital, status transaksi akan diteruskan ke tahap Sourcing PO.',
        };
      case 'finance':
        return {
          title: 'Otorisasi Anggaran Finance Director Massal',
          subtitle: `Tier 3 PO Approval untuk ${orders.length} Purchase Order siap terbit`,
          icon: DollarSign,
          accentColor: 'emerald',
          buttonLabel: 'Otorisasi & Terbitkan PO',
          confirmMsg: 'Anggaran PO akan disahkan dan vendor terpilih akan dikonfirmasi untuk pengadaan.',
        };
    }
  };

  const config = getActionConfig();
  const IconComponent = config.icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase || passphrase.length < 4) {
      alert('Passphrase akun Anda wajib diisi (minimal 4 karakter) untuk otorisasi digital.');
      return;
    }
    if (actionType === 'review' && reviewDecision === 'reject' && !notes.trim()) {
      alert('Mohon cantumkan alasan penolakan pada kolom catatan.');
      return;
    }

    setProcessing(true);
    setCurrentProgress(0);
    const itemResults: ItemResult[] = [];

    for (let i = 0; i < orders.length; i++) {
      const ord = orders[i];
      const prNo = ord.prNumber || `DRAFT-${ord._id?.slice(-4)}`;
      try {
        if (actionType === 'review') {
          await reviewMaterialRequest(ord._id!, {
            action: reviewDecision,
            notes: notes.trim(),
            rejectionReason: notes.trim(),
            passphrase,
          });
        } else if (actionType === 'ops') {
          await opsApproveMaterialRequest(ord._id!, {
            passphrase,
            notes: notes.trim(),
          });
        } else if (actionType === 'finance') {
          await financeApproveMaterialRequest(ord._id!, {
            passphrase,
            notes: notes.trim(),
          });
        }
        itemResults.push({ orderId: ord._id!, prNumber: prNo, success: true });
      } catch (err: any) {
        const errMsg =
          err.response?.data?.msg || err.message || 'Gagal memproses otorisasi transaksi';
        itemResults.push({
          orderId: ord._id!,
          prNumber: prNo,
          success: false,
          error: errMsg,
        });
      }
      setCurrentProgress(i + 1);
    }

    setProcessing(false);
    setResults(itemResults);
    await onComplete();
  };

  const handleModalClose = () => {
    if (processing) return;
    setPassphrase('');
    setNotes('');
    setResults(null);
    setCurrentProgress(0);
    onClose();
  };

  const successCount = results ? results.filter((r) => r.success).length : 0;
  const failureCount = results ? results.filter((r) => !r.success).length : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-action-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
              <IconComponent size={20} className="text-amber-400" />
            </div>
            <div>
              <h3 id="bulk-action-title" className="text-base font-black tracking-tight text-white">
                {config.title}
              </h3>
              <p className="text-xs text-slate-300 font-medium mt-0.5">{config.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            disabled={processing}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {results ? (
          /* Execution Results Summary View */
          <div className="p-6 space-y-5">
            <div
              className={`p-4 rounded-xl border flex items-center gap-3 ${
                failureCount === 0
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              {failureCount === 0 ? (
                <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle size={24} className="text-amber-600 shrink-0" />
              )}
              <div>
                <p className="font-black text-sm">
                  {failureCount === 0
                    ? `Sukses! Seluruh ${successCount} pengadaan berhasil diproses.`
                    : `${successCount} berhasil diproses, ${failureCount} transaksi gagal.`}
                </p>
                <p className="text-xs opacity-80 mt-0.5">
                  Daftar transaksi di bawah ini telah diperbarui sesuai status terbarunya.
                </p>
              </div>
            </div>

            {/* Item Results List */}
            <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
              {results.map((res) => (
                <div
                  key={res.orderId}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200 text-xs"
                >
                  <div className="flex items-center gap-2">
                    {res.success ? (
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle size={16} className="text-rose-600 shrink-0" />
                    )}
                    <span className="font-mono font-bold text-slate-900">{res.prNumber}</span>
                  </div>
                  <div>
                    {res.success ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                        Berhasil
                      </span>
                    ) : (
                      <span
                        className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300"
                        title={res.error}
                      >
                        {res.error || 'Gagal'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleModalClose}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-black text-xs hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
              >
                Selesai & Tutup
              </button>
            </div>
          </div>
        ) : (
          /* Execution Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Decision selector for Review tab */}
            {actionType === 'review' && (
              <div className="flex items-center gap-3 p-1.5 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setReviewDecision('approve')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    reviewDecision === 'approve'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <CheckCircle2 size={14} />
                  <span>Setujui (Approve)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReviewDecision('reject')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    reviewDecision === 'reject'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <XCircle size={14} />
                  <span>Tolak (Reject)</span>
                </button>
              </div>
            )}

            {/* Selected Orders Summary Banner */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Layers size={13} className="text-primary" />
                  <span>Dokumen Pengadaan Terpilih:</span>
                </span>
                <span className="font-black text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  {orders.length} Dokumen
                </span>
              </div>

              {/* Scrollable Mini List */}
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {orders.map((ord) => {
                  const projName =
                    typeof ord.projectId === 'object' && ord.projectId?.nama
                      ? ord.projectId.nama
                      : 'Non-Proyek / Umum';
                  const estAmt = ord.poTotalAmount || Number(ord.costEstimate) || 0;
                  return (
                    <div
                      key={ord._id}
                      className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-white border border-slate-200/80"
                    >
                      <div className="flex items-center gap-2 truncate max-w-[65%]">
                        <span className="font-mono font-bold text-slate-900">
                          {ord.prNumber || 'DRAFT-PR'}
                        </span>
                        <span className="text-slate-500 truncate" title={projName}>
                          • {projName}
                        </span>
                      </div>
                      <div className="font-mono font-bold text-slate-900 shrink-0">
                        {formatRupiah(estAmt)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Aggregated Total */}
              <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Total Akumulasi Nilai:</span>
                <span className="font-black font-mono text-slate-950 text-sm">
                  {formatRupiah(totalAmount)}
                </span>
              </div>
            </div>

            {/* Passphrase Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="bulk-passphrase"
                className="block text-xs font-black uppercase tracking-wider text-slate-800"
              >
                Passphrase Akun (Tanda Tangan Otorisasi Digital) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="bulk-passphrase"
                  type={showPassphrase ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Masukkan passphrase akun Anda..."
                  disabled={processing}
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:bg-slate-100"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassphrase ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <Lock size={12} className="shrink-0 text-slate-400" />
                <span>Otorisasi massal akan ditandatangani secara digital atas nama akun Anda.</span>
              </p>
            </div>

            {/* Notes / Remarks */}
            <div className="space-y-1.5">
              <label
                htmlFor="bulk-notes"
                className="block text-xs font-black uppercase tracking-wider text-slate-800"
              >
                {actionType === 'review' && reviewDecision === 'reject'
                  ? 'Alasan Penolakan (Wajib Diisi)'
                  : 'Catatan Otorisasi (Opsional)'}
                {actionType === 'review' && reviewDecision === 'reject' && (
                  <span className="text-rose-500"> *</span>
                )}
              </label>
              <textarea
                id="bulk-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  actionType === 'review' && reviewDecision === 'reject'
                    ? 'Tuliskan alasan penolakan secara spesifik...'
                    : 'Catatan pertimbangan persetujuan (opsional)...'
                }
                disabled={processing}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:bg-slate-100"
              />
            </div>

            {/* Progress indicator during execution */}
            {processing && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-blue-950">
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={14} className="animate-spin text-blue-600" />
                    <span>Memproses otorisasi digital...</span>
                  </span>
                  <span>
                    {currentProgress} dari {orders.length}
                  </span>
                </div>
                <div className="w-full bg-blue-200/60 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((currentProgress / orders.length) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Actions footer */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleModalClose}
                disabled={processing}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={processing || !passphrase || passphrase.length < 4}
                className={`px-5 py-2.5 rounded-xl font-black text-xs text-white shadow-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  actionType === 'review' && reviewDecision === 'reject'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-primary hover:bg-primary-hover'
                }`}
              >
                {processing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>{config.buttonLabel}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
