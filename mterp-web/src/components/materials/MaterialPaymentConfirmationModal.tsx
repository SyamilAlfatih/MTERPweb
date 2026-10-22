import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  Wallet,
  Receipt,
  FileCheck,
} from 'lucide-react';
import { MaterialRequest } from '../../types';
import { SignaturePad } from '../shared';
import { confirmMaterialPayment } from '../../api/scm.api';
import { formatRupiah } from '../../utils/currency';
import { formatDate } from '../../utils/date';

export interface MaterialPaymentConfirmationModalProps {
  order: MaterialRequest | null;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export function MaterialPaymentConfirmationModal({
  order,
  onClose,
  onSuccess,
}: MaterialPaymentConfirmationModalProps) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentType, setPaymentType] = useState('Full Payment (Lunas)');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [sourceAccount, setSourceAccount] = useState('');
  const [targetAccount, setTargetAccount] = useState('');
  const [targetAccountName, setTargetAccountName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [payerSignature, setPayerSignature] = useState<string | null>(null);

  // Evidence files
  const [bonFile, setBonFile] = useState<File | null>(null);
  const [bonPreview, setBonPreview] = useState<string | null>(null);
  const [transferFile, setTransferFile] = useState<File | null>(null);
  const [transferPreview, setTransferPreview] = useState<string | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isPaylater = Boolean(
    order?.selectedSupplier?.schemeType === 'PAYLATER' ||
    order?.selectedSupplier?.isPaylater
  );

  useEffect(() => {
    if (order) {
      const defaultTotal = order.poTotalAmount || order.totalEstimatedBudget || 0;
      setAmountPaid(defaultTotal);
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentType(isPaylater ? 'Pelunasan Paylater (Bunga 0%)' : 'Full Payment (Lunas)');
      setPaymentMethod('Bank Transfer');
      setSourceAccount('BCA Operasional PT MTE');
      setTargetAccount('');
      setTargetAccountName(order.selectedSupplier?.supplierName || '');
      setReferenceNumber('');
      setNotes('');
      setPayerSignature(null);
      setBonFile(null);
      setBonPreview(null);
      setTransferFile(null);
      setTransferPreview(null);
      setInvoiceFile(null);
      setInvoicePreview(null);
      setErrorMessage(null);
    }
  }, [order, isPaylater]);

  if (!order) return null;

  const totalPoAmount = order.poTotalAmount || order.totalEstimatedBudget || 0;
  const projectName = typeof order.projectId === 'object' ? order.projectId?.nama : 'Proyek Umum';
  const supplierName = order.selectedSupplier?.supplierName || 'Supplier';

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: React.Dispatch<React.SetStateAction<File | null>>,
    setPreview: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFile(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPreview(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!bonFile && !order.paymentConfirmation?.bonPembayaranUrl) {
      setErrorMessage('Foto bukti bon pembayaran / kuitansi fisik asli wajib diunggah.');
      return;
    }

    if (paymentMethod === 'Bank Transfer' && !transferFile && !order.paymentConfirmation?.transferReceiptUrl) {
      setErrorMessage('Bukti transfer bank / struk transaksi wajib diunggah untuk metode Bank Transfer.');
      return;
    }

    if (!amountPaid || amountPaid <= 0) {
      setErrorMessage('Nominal pembayaran harus lebih besar dari Rp 0.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('paymentDate', paymentDate);
      formData.append('paymentType', paymentType);
      formData.append('paymentMethod', paymentMethod);
      formData.append('amountPaid', String(amountPaid));
      formData.append('sourceAccount', sourceAccount);
      formData.append('targetAccount', targetAccount);
      formData.append('targetAccountName', targetAccountName);
      formData.append('referenceNumber', referenceNumber);
      formData.append('notes', notes);
      formData.append('schemeApplied', isPaylater ? 'PAYLATER' : 'STANDARD');

      if (bonFile) formData.append('bonPembayaran', bonFile);
      if (transferFile) formData.append('transferReceipt', transferFile);
      if (invoiceFile) formData.append('invoiceDoc', invoiceFile);
      if (payerSignature) formData.append('payerSignature', payerSignature);

      await confirmMaterialPayment(order._id || order.id!, formData);
      onClose();
      await onSuccess();
    } catch (err: any) {
      console.error('Payment confirmation error:', err);
      setErrorMessage(err.response?.data?.msg || 'Gagal menyimpan konfirmasi pembayaran.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-3xl p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto animate-dropdown-enter">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-border-light">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold shadow-xs">
              <Receipt size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-text-primary m-0">
                Konfirmasi & Pelunasan Pembayaran Pengadaan
              </h3>
              <p className="text-xs text-text-muted m-0 mt-0.5">
                PO: <b className="text-slate-900">{order.poNumber || order.prNumber}</b> • Proyek:{' '}
                <span className="font-semibold">{projectName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-border/40 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs font-semibold text-rose-800 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Paylater Banner */}
        {isPaylater && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 border-2 border-emerald-400 text-xs text-emerald-950 flex items-start gap-2.5">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-700 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-black text-emerald-900 flex items-center gap-2">
                <span>SKEMA PAYLATER (AMBIL DULU BAYAR NANTI)</span>
                <span className="bg-emerald-200 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded-full">
                  0% Bunga
                </span>
              </div>
              <p className="text-emerald-800 leading-relaxed m-0 text-[11px]">
                Material telah diverifikasi di lapangan via GRN. Transaksi ini diselesaikan secara penuh sebesar nilai pokok tanpa dikenakan biaya bunga atau beban denda tempo (Bunga: Rp 0).
              </p>
            </div>
          </div>
        )}

        {/* Order & GRN Recap */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Supplier / Toko</span>
            <span className="font-black text-slate-900 text-xs truncate block">{supplierName}</span>
            <span className="text-[10px] text-slate-500">{order.selectedSupplier?.location || 'Lokal'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Status Penerimaan (GRN)</span>
            <span className="inline-flex items-center gap-1 font-bold text-teal-800">
              <FileCheck size={12} />
              <span>Diterima di Proyek</span>
            </span>
            <span className="text-[10px] text-slate-500 block">
              {order.deliveryProof?.receivedAt ? formatDate(order.deliveryProof.receivedAt) : 'Terverifikasi'}
            </span>
          </div>
          <div className="sm:text-right">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Nilai Tagihan PO</span>
            <span className="text-sm font-black font-mono text-emerald-700 block">
              {formatRupiah(totalPoAmount)}
            </span>
            <span className="text-[10px] text-slate-500">
              {isPaylater ? 'Pokok murni (Bunga 0%)' : order.selectedSupplier?.paymentTerms || 'Tempo'}
            </span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">
                Tanggal Pembayaran <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white focus:outline-hidden focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">
                Tipe Pembayaran <span className="text-rose-500">*</span>
              </label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium"
              >
                {isPaylater && (
                  <option value="Pelunasan Paylater (Bunga 0%)">Pelunasan Paylater (Bunga 0%)</option>
                )}
                <option value="Full Payment (Lunas)">Full Payment (Lunas)</option>
                <option value="Pelunasan Akhir">Pelunasan Akhir</option>
                <option value="Down Payment (DP)">Down Payment (DP)</option>
                <option value="Termin Proyek">Termin Proyek</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-text-primary block">
                  Nominal Dibayarkan (Rp) <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setAmountPaid(totalPoAmount)}
                  className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
                >
                  Bayar Penuh Sesuai PO
                </button>
              </div>
              <input
                type="number"
                min="1"
                required
                value={amountPaid || ''}
                onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-mono font-bold text-emerald-800 text-right"
              />
              <span className="text-[10px] font-mono text-text-muted mt-0.5 block text-right">
                {formatRupiah(amountPaid || 0)}
              </span>
            </div>

            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">
                Metode Pembayaran <span className="text-rose-500">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium"
              >
                <option value="Bank Transfer">Bank Transfer (BCA / Mandiri / BNI / BRI)</option>
                <option value="Kas Tunai Proyek">Kas Tunai Proyek (Cash)</option>
                <option value="Giro / Cek">Giro / Cek</option>
                <option value="Kasbon Settlement">Kasbon Settlement</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">
                Rekening Sumber (Pengirim)
              </label>
              <input
                type="text"
                value={sourceAccount}
                onChange={(e) => setSourceAccount(e.target.value)}
                placeholder="BCA PT MTE (123-xxx)..."
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">
                Rekening Tujuan (Supplier)
              </label>
              <input
                type="text"
                value={targetAccount}
                onChange={(e) => setTargetAccount(e.target.value)}
                placeholder="Mandiri (456-xxx)..."
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">
                No. Bukti Kas / Referensi Bank
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="TRX-12345 / BKK-001..."
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white"
              />
            </div>
          </div>

          {/* Evidence Uploads */}
          <div className="pt-2 border-t border-border-light">
            <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider mb-2">
              Unggah Bukti Pembayaran & Arsip
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Evidence 1: Bon Pembayaran */}
              <div className="p-3 rounded-xl border-2 border-dashed border-border-light bg-slate-50/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Receipt size={14} className="text-primary" />
                      <span>Bon Pembayaran / Kuitansi</span>
                    </span>
                    <span className="text-[10px] font-black bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
                      Wajib
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mb-2">
                    Foto fisik nota / bon pembelian dari toko atau supplier asli.
                  </p>
                </div>

                <div>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => handleFileChange(e, setBonFile, setBonPreview)}
                    className="w-full text-xs text-text-muted file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary file:text-white hover:file:bg-primary/90 file:cursor-pointer"
                  />
                  {bonPreview && (
                    <div className="mt-2 relative w-full h-24 rounded-lg overflow-hidden border border-slate-200">
                      <img src={bonPreview} alt="Preview Bon" className="w-full h-full object-cover" />
                    </div>
                  )}
                  {bonFile && !bonPreview && (
                    <div className="mt-1 text-[11px] font-semibold text-slate-700 truncate">
                      📄 {bonFile.name}
                    </div>
                  )}
                </div>
              </div>

              {/* Evidence 2: Bukti Transfer Bank */}
              <div className="p-3 rounded-xl border-2 border-dashed border-border-light bg-slate-50/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <CreditCard size={14} className="text-emerald-600" />
                      <span>Bukti Transfer Bank / EDC</span>
                    </span>
                    <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
                      Transfer
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mb-2">
                    Tangkapan layar m-banking / bukti slip transfer / mutasi rekening.
                  </p>
                </div>

                <div>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => handleFileChange(e, setTransferFile, setTransferPreview)}
                    className="w-full text-xs text-text-muted file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 file:cursor-pointer"
                  />
                  {transferPreview && (
                    <div className="mt-2 relative w-full h-24 rounded-lg overflow-hidden border border-slate-200">
                      <img src={transferPreview} alt="Preview Transfer" className="w-full h-full object-cover" />
                    </div>
                  )}
                  {transferFile && !transferPreview && (
                    <div className="mt-1 text-[11px] font-semibold text-slate-700 truncate">
                      💳 {transferFile.name}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Evidence 3: Faktur Pajak / Invoice (Opsional) */}
            <div className="mt-2.5 p-2.5 rounded-xl border border-border-light bg-bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <FileText size={13} className="text-slate-500" />
                  <span>Faktur Pajak / Invoice Supplier (Opsional)</span>
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Opsional</span>
              </div>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => handleFileChange(e, setInvoiceFile, setInvoicePreview)}
                className="w-full text-xs text-text-muted file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-slate-200 file:text-slate-800 hover:file:bg-slate-300 file:cursor-pointer"
              />
              {invoiceFile && (
                <div className="mt-1 text-[11px] text-slate-600 font-mono truncate">
                  📑 {invoiceFile.name}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">
              Catatan Rekonsiliasi & Keuangan
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan mengenai pelunasan, sisa pembayaran, atau verifikasi kasir..."
              className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white"
            />
          </div>

          {/* Signature Sign-off */}
          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">
              Tanda Tangan Digital Pejabat Keuangan / Kasir
            </label>
            <SignaturePad
              label="Goreskan tanda tangan digital di bawah untuk mengesahkan bukti kas:"
              onSave={(sig) => setPayerSignature(sig)}
              onClear={() => setPayerSignature(null)}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-light">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-text-secondary hover:bg-border/40 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <span>Menyimpan Konfirmasi...</span>
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  <span>Sahkan Pembayaran & Tandai Lunas</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
