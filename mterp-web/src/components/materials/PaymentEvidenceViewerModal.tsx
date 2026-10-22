import React, { useState } from 'react';
import {
  X,
  Receipt,
  CreditCard,
  FileText,
  Download,
  ExternalLink,
  CheckCircle2,
  Calendar,
  Building,
  UserCheck,
} from 'lucide-react';
import { MaterialRequest } from '../../types';
import { formatRupiah } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { getImageUrl } from '../../utils/image';

export interface PaymentEvidenceViewerModalProps {
  order: MaterialRequest | null;
  onClose: () => void;
}

export function PaymentEvidenceViewerModal({
  order,
  onClose,
}: PaymentEvidenceViewerModalProps) {
  const [activeTab, setActiveTab] = useState<'bon' | 'transfer' | 'invoice'>('bon');

  if (!order || !order.paymentConfirmation) return null;

  const pc = order.paymentConfirmation;
  const isPaylater = pc.schemeApplied === 'PAYLATER' || order.selectedSupplier?.schemeType === 'PAYLATER';
  const bonUrl = pc.bonPembayaranUrl ? getImageUrl(pc.bonPembayaranUrl) : null;
  const transferUrl = pc.transferReceiptUrl ? getImageUrl(pc.transferReceiptUrl) : null;
  const invoiceUrl = pc.invoiceDocUrl ? getImageUrl(pc.invoiceDocUrl) : null;

  const currentImg =
    activeTab === 'bon' ? bonUrl : activeTab === 'transfer' ? transferUrl : invoiceUrl;

  const projectName = typeof order.projectId === 'object' ? order.projectId?.nama : 'Proyek Umum';
  const confirmerName = typeof pc.confirmedBy === 'object' ? pc.confirmedBy?.fullName : 'Kasir / Keuangan';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-4xl p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto animate-dropdown-enter">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-border-light">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
              <Receipt size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-text-primary m-0">
                  Bukti Pembayaran & Rekonsiliasi Kas
                </h3>
                {isPaylater && (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300">
                    Skema Paylater (0% Bunga)
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted m-0 mt-0.5">
                PO: <b className="text-slate-900">{order.poNumber || order.prNumber}</b> • Proyek: {projectName}
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

        {/* Top Summary Info Card */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Terbayar</span>
            <span className="text-sm font-black font-mono text-emerald-700 block">
              {formatRupiah(pc.amountPaid || 0)}
            </span>
            <span className="text-[10px] text-slate-500">{pc.paymentType}</span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Metode & Akun</span>
            <span className="font-bold text-slate-900 block truncate">{pc.paymentMethod}</span>
            <span className="text-[10px] text-slate-500 block truncate">{pc.sourceAccount || '-'}</span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Tanggal Pelunasan</span>
            <span className="font-bold text-slate-900 block">
              {formatDate(pc.paymentDate || pc.confirmedAt || '')}
            </span>
            <span className="text-[10px] text-slate-500 block">Ref: {pc.referenceNumber || '-'}</span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Dikonfirmasi Oleh</span>
            <span className="font-bold text-slate-900 block truncate">{confirmerName}</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-teal-700 font-semibold">
              <CheckCircle2 size={10} />
              <span>Terverifikasi Sah</span>
            </span>
          </div>
        </div>

        {pc.notes && (
          <div className="mt-2.5 p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-950">
            <span className="font-bold">Catatan Keuangan:</span> {pc.notes}
          </div>
        )}

        {/* Evidence Navigation Tabs */}
        <div className="mt-4 flex items-center justify-between border-b border-border-light pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('bon')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'bon'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Receipt size={13} />
              <span>1. Bon Pembayaran Asli</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('transfer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'transfer'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <CreditCard size={13} />
              <span>2. Bukti Transfer Bank</span>
            </button>

            {invoiceUrl && (
              <button
                type="button"
                onClick={() => setActiveTab('invoice')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'invoice'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <FileText size={13} />
                <span>3. Faktur Pajak / Invoice</span>
              </button>
            )}
          </div>

          {currentImg && (
            <a
              href={currentImg}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
            >
              <ExternalLink size={13} />
              <span>Buka Resolusi Penuh</span>
            </a>
          )}
        </div>

        {/* Image Preview Canvas */}
        <div className="mt-3 bg-slate-900 rounded-xl min-h-[300px] max-h-[52vh] flex items-center justify-center p-2 overflow-hidden border border-slate-700">
          {currentImg ? (
            currentImg.endsWith('.pdf') ? (
              <iframe src={currentImg} title="Document Preview" className="w-full h-[48vh] rounded-lg bg-white" />
            ) : (
              <img
                src={currentImg}
                alt="Bukti Dokumen"
                className="max-w-full max-h-[48vh] object-contain rounded-lg shadow-lg"
              />
            )
          ) : (
            <div className="text-center text-slate-400 py-12">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-xs">Dokumen bukti untuk bagian ini belum diunggah.</p>
            </div>
          )}
        </div>

        {/* Payer Signature Box (if present) */}
        {pc.payerSignature && (
          <div className="mt-3 flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <UserCheck size={14} className="text-teal-600" />
              <span>Tanda Tangan Pengesahan Kasir:</span>
            </span>
            <img
              src={pc.payerSignature}
              alt="Tanda Tangan Kasir"
              className="h-10 object-contain bg-white px-2 py-0.5 rounded border border-slate-200"
            />
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-end border-t border-border-light pt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
