import React, { useState, useRef, ChangeEvent, DragEvent } from 'react';
import {
    X,
    UploadCloud,
    FileCheck2,
    CreditCard,
    Copy,
    Check,
    DollarSign,
    ShieldCheck,
    Loader2,
    Calendar,
    Briefcase,
    AlertCircle,
    FileText,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { SlipData } from './SlipGajiDetailModal';
import { formatRupiah as formatRp } from '../../utils/currency';
import { formatDate as formatWIBDate } from '../../utils/date';
import { getRoleBadge } from '../../utils/roleClassifier';
import { finalizeSlipGajiPayment } from '../../api/hcm.api';

interface FinalizePaymentModalProps {
    isOpen: boolean;
    slip: SlipData | null;
    onClose: () => void;
    onSuccess: (updatedSlip: SlipData) => void;
}

export const FinalizePaymentModal: React.FC<FinalizePaymentModalProps> = ({
    isOpen,
    slip,
    onClose,
    onSuccess,
}) => {
    const { t } = useTranslation();
    const modalRef = useRef<HTMLDivElement>(null);
    useFocusTrap(modalRef, { isActive: isOpen, onEscape: onClose });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [copiedAccount, setCopiedAccount] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Reset when modal closes or slip changes
    React.useEffect(() => {
        if (!isOpen) {
            setSelectedFile(null);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
            setNotes('');
            setSubmitting(false);
            setErrorMessage('');
            setCopiedAccount(false);
        }
    }, [isOpen]);

    if (!isOpen || !slip) return null;

    const handleFile = (file: File) => {
        if (!file) return;
        setErrorMessage('');

        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
        if (!validTypes.includes(file.type)) {
            setErrorMessage('Tipe file tidak didukung. Harap unggah gambar (JPG, PNG, WEBP) atau PDF.');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setErrorMessage('Ukuran file terlalu besar. Maksimal 10MB.');
            return;
        }

        setSelectedFile(file);
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        } else {
            setPreviewUrl(null);
        }
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleCopyAccount = () => {
        const acc = slip.workerPaymentInfo?.bankAccount || slip.workerId?.paymentInfo?.bankAccount;
        if (acc) {
            navigator.clipboard.writeText(acc);
            setCopiedAccount(true);
            setTimeout(() => setCopiedAccount(false), 2000);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile) {
            setErrorMessage('Bukti transfer pembayaran (screenshot bank transfer) wajib diunggah.');
            return;
        }

        setSubmitting(true);
        setErrorMessage('');

        try {
            const formData = new FormData();
            formData.append('paymentProof', selectedFile);
            if (notes.trim()) {
                formData.append('notes', notes.trim());
            }

            const updated = await finalizeSlipGajiPayment(slip._id, formData);
            onSuccess(updated);
            onClose();
        } catch (err: any) {
            console.error('Finalize payment error:', err);
            const msg = err?.response?.data?.msg || err?.message || 'Gagal memfinalisasi pembayaran';
            setErrorMessage(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const rBadge = getRoleBadge(slip.workerId?.role);
    const bankPlatform = slip.workerPaymentInfo?.bankPlatform || slip.workerId?.paymentInfo?.bankPlatform;
    const bankAccount = slip.workerPaymentInfo?.bankAccount || slip.workerId?.paymentInfo?.bankAccount;
    const accountName = slip.workerPaymentInfo?.accountName || slip.workerId?.paymentInfo?.accountName;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-finalize-title"
                className="bg-bg-white rounded-2xl w-[92%] max-w-[560px] max-h-[92vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-border-light"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-6 pt-6 pb-2 border-b border-border-light">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <FileCheck2 size={22} />
                    </div>
                    <div>
                        <h3 id="modal-finalize-title" className="text-lg font-bold text-text-primary m-0">
                            {t('slipGaji.modals.finalize.title', 'Finalisasi Pembayaran')}
                        </h3>
                        <p className="text-xs text-text-muted m-0">
                            {slip.slipNumber} · {slip.workerId?.fullName}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="ml-auto w-8 h-8 border-none bg-bg-secondary rounded-full cursor-pointer flex items-center justify-center text-text-muted transition-colors hover:bg-border"
                        onClick={onClose}
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                    {/* Error Banner */}
                    {errorMessage && (
                        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs animate-in fade-in">
                            <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
                            <span className="font-medium">{errorMessage}</span>
                        </div>
                    )}

                    {/* Summary Info Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Net Pay Card */}
                        <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-50/80 to-teal-50/40 border border-emerald-200/80">
                            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block mb-1">
                                Jumlah Transfer (Gaji Bersih)
                            </span>
                            <div className="text-xl font-black text-emerald-900 font-mono tabular-nums">
                                {formatRp(slip.earnings.netPay)}
                            </div>
                            <span className="text-[11px] text-emerald-700 block mt-0.5">
                                {slip.attendanceSummary.presentDays} hari kerja
                                {(slip.attendanceSummary.totalOvertimeHours || 0) > 0 && ` + ${slip.attendanceSummary.totalOvertimeHours.toFixed(1)}h OT`}
                            </span>
                        </div>

                        {/* Worker Role & Project */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
                            <div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                    Penerima
                                </span>
                                <div className="text-sm font-bold text-text-primary truncate">
                                    {slip.workerId?.fullName}
                                </div>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${rBadge.bg} ${rBadge.text} ${rBadge.border}`}>
                                        {rBadge.label}
                                    </span>
                                </div>
                            </div>
                            <div className="text-[11px] text-text-muted truncate mt-1">
                                🏗️ {slip.projectName || slip.projectId?.nama || 'Kantor / Non-Proyek'}
                            </div>
                        </div>
                    </div>

                    {/* Target Bank Account Card */}
                    <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5 text-blue-900 font-bold uppercase tracking-wider text-[10px]">
                                <CreditCard size={13} className="text-blue-700" />
                                <span>Rekening Tujuan Transfer</span>
                            </div>
                            {bankAccount && (
                                <button
                                    type="button"
                                    onClick={handleCopyAccount}
                                    className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 cursor-pointer transition-colors"
                                    title="Salin Nomor Rekening"
                                >
                                    {copiedAccount ? (
                                        <>
                                            <Check size={12} className="text-emerald-600" />
                                            <span className="text-emerald-600">Disalin!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy size={12} />
                                            <span>Salin No. Rek</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                        {bankPlatform || bankAccount ? (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-slate-800">
                                <span className="font-bold font-mono text-sm tracking-wide">
                                    {bankPlatform ? `${bankPlatform.toUpperCase()} — ` : ''}{bankAccount || 'Nomor rekening belum diatur'}
                                </span>
                                {accountName && (
                                    <span className="text-slate-600 text-xs">
                                        a/n <strong>{accountName}</strong>
                                    </span>
                                )}
                            </div>
                        ) : (
                            <span className="text-text-muted italic text-xs">
                                Informasi rekening karyawan belum dilengkapi di profil.
                            </span>
                        )}
                    </div>

                    {/* Dropzone Upload Bukti Transfer */}
                    <div>
                        <label className="block text-xs font-bold text-text-primary uppercase tracking-wider mb-1.5">
                            Bukti Transfer Bank (Screenshot / Foto) <span className="text-red-500">*</span>
                        </label>
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                                isDragging
                                    ? 'border-emerald-500 bg-emerald-50/60'
                                    : selectedFile
                                    ? 'border-emerald-400 bg-emerald-50/20'
                                    : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50'
                            }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/jpg,application/pdf"
                                className="hidden"
                                onChange={handleFileChange}
                            />

                            {previewUrl ? (
                                <div className="flex flex-col items-center gap-2 w-full">
                                    <div className="relative group max-h-48 rounded-lg overflow-hidden border border-emerald-200 shadow-xs">
                                        <img
                                            src={previewUrl}
                                            alt="Preview Bukti Transfer"
                                            className="max-h-48 w-auto object-contain mx-auto"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                                            Klik untuk ganti file
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                                        <span className="font-semibold text-text-primary truncate max-w-xs">{selectedFile?.name}</span>
                                        <span className="text-text-muted">({(selectedFile?.size ? (selectedFile.size / 1024).toFixed(0) : 0)} KB)</span>
                                    </div>
                                </div>
                            ) : selectedFile ? (
                                <div className="flex flex-col items-center gap-1.5 py-2">
                                    <FileText size={36} className="text-emerald-600" />
                                    <span className="font-semibold text-xs text-text-primary">{selectedFile.name}</span>
                                    <span className="text-[11px] text-text-muted">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                                    <span className="text-[11px] text-emerald-600 font-semibold mt-1">Klik untuk mengganti</span>
                                </div>
                            ) : (
                                <>
                                    <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                        <UploadCloud size={24} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-text-primary m-0">
                                            {t('slipGaji.modals.finalize.uploadPrompt', 'Pilih atau seret screenshot bukti transfer bank')}
                                        </p>
                                        <p className="text-[11px] text-text-muted m-0 mt-0.5">
                                            {t('slipGaji.modals.finalize.uploadHint', 'Format file: JPG, PNG, WEBP, atau PDF (maks. 10MB)')}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Notes / Reference input */}
                    <div>
                        <label className="block text-xs font-bold text-text-primary uppercase tracking-wider mb-1">
                            {t('slipGaji.modals.finalize.notesLabel', 'Catatan Transfer / No. Referensi')}
                        </label>
                        <input
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder={t('slipGaji.modals.finalize.notesPlaceholder', 'Contoh: Transfer via BCA Mobile No. Ref 88291039')}
                            className="w-full px-3.5 py-2.5 border border-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                    </div>

                    {/* SSOT Guarantee Banner */}
                    <div className="p-3 rounded-xl bg-slate-900 text-white flex items-start gap-2.5">
                        <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                        <div className="text-[11px] leading-relaxed">
                            <strong className="text-emerald-300 block mb-0.5">Single Source of Truth (SSOT)</strong>
                            {t(
                                'slipGaji.modals.finalize.ssotNotice',
                                'Status LUNAS akan menjadi Single Source of Truth (SSOT). Status kehadiran pekerja pada periode ini akan otomatis diperbarui menjadi "Paid".'
                            )}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2.5 pt-2 border-t border-border-light">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-4 py-2.5 border border-border bg-bg-white rounded-lg text-xs font-semibold text-text-secondary cursor-pointer hover:bg-bg-secondary transition-colors disabled:opacity-60"
                        >
                            {t('slipGaji.modals.finalize.btnCancel', 'Batal')}
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !selectedFile}
                            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold cursor-pointer shadow-md shadow-emerald-600/20 transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>{t('slipGaji.modals.finalize.btnSubmitting', 'Memproses...')}</span>
                                </>
                            ) : (
                                <>
                                    <FileCheck2 size={14} />
                                    <span>{t('slipGaji.modals.finalize.btnSubmit', 'Finalisasi & Tandai Lunas')}</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
