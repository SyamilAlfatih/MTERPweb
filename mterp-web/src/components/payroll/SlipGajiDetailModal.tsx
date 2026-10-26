import React, { useRef } from 'react';
import {
    FileText,
    X,
    Briefcase,
    Calendar,
    CreditCard,
    CheckCircle2,
    Shield,
    Unlock,
    Lock,
    Download,
    FileCheck2,
    ExternalLink,
    Eye,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { exportSlipToPdf } from '../../utils/exportSlipPdf';
import { formatRupiah as formatRp } from '../../utils/currency';
import { formatDate as formatWIBDate } from '../../utils/date';
import { getRoleBadge } from '../../utils/roleClassifier';
import { resolveImageUrl } from '../../utils/image';
import { Worker } from '../../types';

export interface SlipPaymentProof {
    fileUrl: string;
    fileName?: string;
    uploadedAt?: string;
    uploadedBy?: { _id?: string; fullName?: string; role?: string };
    notes?: string;
    amountPaid?: number;
    paymentDate?: string;
}

export interface SlipData {
    _id: string;
    slipNumber: string;
    workerId: Worker;
    projectId?: {
        _id: string;
        nama: string;
        lokasi?: string;
        payrollConfig?: { cutoffStartDay?: number; cutoffEndDay?: number };
    };
    projectName?: string;
    projectLocation?: string;
    period: { startDate: string; endDate: string };
    attendanceSummary: {
        totalDays: number;
        presentDays: number;
        lateDays: number;
        absentDays: number;
        permitDays: number;
        totalHours: number;
        totalOvertimeHours: number;
    };
    earnings: {
        dailyRate: number;
        totalDailyWage: number;
        totalOvertime: number;
        bonus: number;
        deductions: number;
        kasbonDeduction: number;
        netPay: number;
    };
    workerPaymentInfo: { bankAccount: string; bankPlatform: string; accountName: string };
    authorization: {
        directorName: string;
        directorSignedAt: string;
        ownerName: string;
        ownerSignedAt: string;
        directorPassphrase: string;
        ownerPassphrase: string;
    };
    status: 'draft' | 'authorized' | 'issued' | 'paid';
    paymentProof?: SlipPaymentProof;
    paidAt?: string;
    paidBy?: { _id?: string; fullName?: string; role?: string };
    createdBy?: { fullName: string };
    notes: string;
    createdAt: string;
}

export const STATUS_BADGE: Record<string, { color: string; bg: string; labelKey: string }> = {
    draft: { color: '#D97706', bg: '#FEF3C7', labelKey: 'draft' },
    authorized: { color: '#0D9488', bg: '#CCFBF1', labelKey: 'authorized' },
    issued: { color: '#6366F1', bg: '#EEF2FF', labelKey: 'issued' },
    paid: { color: '#059669', bg: '#D1FAE5', labelKey: 'paid' },
};

export async function exportSlipPdfHelper(slip: SlipData): Promise<void> {
    const roleLabel = slip.workerId?.position
        ? `${slip.workerId.position} (${slip.workerId.role})`
        : (slip.workerId?.role || '');
    await exportSlipToPdf({
        slipNumber: slip.slipNumber,
        workerName: slip.workerId?.fullName || 'Pegawai',
        workerRole: roleLabel,
        projectName: slip.projectName || slip.projectId?.nama,
        projectLocation: slip.projectLocation || slip.projectId?.lokasi,
        periodStart: slip.period.startDate,
        periodEnd: slip.period.endDate,
        attendance: {
            ...slip.attendanceSummary,
            totalOvertimeHours: slip.attendanceSummary.totalOvertimeHours || 0,
        },
        earnings: slip.earnings,
        paymentInfo: slip.workerPaymentInfo,
        authorization: {
            directorSigned: !!slip.authorization.directorPassphrase,
            directorName: slip.authorization.directorName,
            directorSignedAt: slip.authorization.directorSignedAt || undefined,
            ownerSigned: !!slip.authorization.ownerPassphrase,
            ownerName: slip.authorization.ownerName,
            ownerSignedAt: slip.authorization.ownerSignedAt || undefined,
        },
        status: slip.status,
        paidAt: slip.paidAt,
        notes: slip.notes,
    });
}

const formatDateShort = (iso: string) => formatWIBDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });
const formatDateRange = (s: string, e: string) => `${formatDateShort(s)} — ${formatDateShort(e)}`;

export interface SlipGajiDetailModalProps {
    isOpen: boolean;
    slip: SlipData | null;
    onClose: () => void;
    canSign?: (slip: SlipData) => boolean;
    onOpenAuth?: (slipId: string) => void;
    canFinalize?: (slip: SlipData) => boolean;
    onOpenFinalize?: (slip: SlipData) => void;
    userRole?: string;
}

export const SlipGajiDetailModal: React.FC<SlipGajiDetailModalProps> = ({
    isOpen,
    slip,
    onClose,
    canSign,
    onOpenAuth,
    canFinalize,
    onOpenFinalize,
    userRole = '',
}) => {
    const { t } = useTranslation();
    const modalRef = useRef<HTMLDivElement>(null);
    useFocusTrap(modalRef, { isActive: isOpen, onEscape: onClose });

    if (!isOpen || !slip) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div 
                ref={modalRef} 
                role="dialog" 
                aria-modal="true" 
                aria-labelledby="modal-detail-title" 
                className="bg-bg-white rounded-xl w-[90%] max-w-[600px] max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 px-5 pt-5 pb-0">
                    <div className="w-[42px] h-[42px] rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #059669, #34D399)' }}>
                        <FileText size={20} color="white" />
                    </div>
                    <div>
                        <h3 id="modal-detail-title" className="text-lg font-bold text-text-primary m-0">{t('slipGaji.modals.detail.title')}</h3>
                        <p className="text-xs text-text-muted m-0">{slip.slipNumber}</p>
                    </div>
                    <button className="ml-auto w-8 h-8 border-none bg-bg-secondary rounded-full cursor-pointer flex items-center justify-center text-text-muted transition-colors hover:bg-border" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 flex flex-col gap-4">
                    {/* Worker / Employee Info */}
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="w-[42px] h-[42px] rounded-full bg-gradient-to-br from-indigo-500 to-indigo-400 text-white flex items-center justify-center font-bold text-base shrink-0 shadow-xs">
                                {slip.workerId?.fullName?.[0]?.toUpperCase() || 'U'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <span className="block font-bold text-base text-text-primary truncate">{slip.workerId?.fullName}</span>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {(() => {
                                        const rBadge = getRoleBadge(slip.workerId?.role);
                                        return (
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${rBadge.bg} ${rBadge.text} ${rBadge.border}`}>
                                                {rBadge.label}
                                            </span>
                                        );
                                    })()}
                                    {slip.workerId?.position && (
                                        <span className="text-xs text-text-secondary truncate">{slip.workerId.position}</span>
                                    )}
                                </div>
                            </div>
                            <span className="text-[9px] font-bold px-2.5 py-[3px] rounded-full uppercase tracking-[0.3px] whitespace-nowrap shrink-0" style={{
                                color: STATUS_BADGE[slip.status]?.color,
                                background: STATUS_BADGE[slip.status]?.bg,
                            }}>
                                {t(`slipGaji.status.${STATUS_BADGE[slip.status]?.labelKey}`)}
                            </span>
                        </div>
                    </div>

                    {/* Period & Project Banner */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 rounded-lg font-semibold">
                            <Briefcase size={16} className="text-emerald-700 shrink-0" />
                            <span>Proyek: {slip.projectName || slip.projectId?.nama || 'Kantor / Non-Proyek (Umum)'}</span>
                            {(slip.projectLocation || slip.projectId?.lokasi) && (
                                <span className="text-xs text-emerald-700 font-normal">({slip.projectLocation || slip.projectId?.lokasi})</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-text-secondary bg-bg-secondary px-3.5 py-2 rounded-md">
                            <Calendar size={14} />
                            <span>{t('slipGaji.modals.detail.period')} {formatDateRange(slip.period.startDate, slip.period.endDate)}</span>
                        </div>
                    </div>

                    {/* Payment Info */}
                    {slip.workerPaymentInfo?.bankPlatform && (
                        <div className="flex items-center gap-1.5 text-sm text-text-secondary bg-[#F0F9FF] px-3.5 py-2 rounded-md">
                            <CreditCard size={14} />
                            <span>{slip.workerPaymentInfo.bankPlatform} — {slip.workerPaymentInfo.bankAccount}</span>
                            <span className="ml-auto italic text-text-muted">a/n {slip.workerPaymentInfo.accountName}</span>
                        </div>
                    )}

                    {/* Attendance Summary */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-3 bg-bg-secondary rounded-md">
                            <span className="block text-lg font-bold font-mono tabular-nums text-text-primary">{slip.attendanceSummary.totalDays}</span>
                            <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.totalDays')}</span>
                        </div>
                        <div className="text-center p-3 bg-bg-secondary rounded-md">
                            <span className="block text-lg font-bold font-mono tabular-nums text-[#059669]">{slip.attendanceSummary.presentDays}</span>
                            <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.present')}</span>
                        </div>
                        <div className="text-center p-3 bg-bg-secondary rounded-md">
                            <span className="block text-lg font-bold font-mono tabular-nums text-[#D97706]">{slip.attendanceSummary.lateDays}</span>
                            <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.late')}</span>
                        </div>
                        <div className="text-center p-3 bg-bg-secondary rounded-md">
                            <span className="block text-lg font-bold font-mono tabular-nums text-[#DC2626]">{slip.attendanceSummary.absentDays}</span>
                            <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.absent')}</span>
                        </div>
                        <div className="text-center p-3 bg-bg-secondary rounded-md">
                            <span className="block text-lg font-bold font-mono tabular-nums text-[#7C3AED]">{slip.attendanceSummary.permitDays}</span>
                            <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.permit')}</span>
                        </div>
                        <div className="text-center p-3 bg-bg-secondary rounded-md">
                            <span className="block text-lg font-bold font-mono tabular-nums text-text-primary">{slip.attendanceSummary.totalHours}h</span>
                            <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.totalHours')}</span>
                        </div>
                        {(slip.attendanceSummary.totalOvertimeHours || 0) > 0 && (
                            <div className="text-center p-3 bg-amber-50 rounded-md col-span-3 border border-amber-100">
                                <span className="block text-lg font-bold font-mono tabular-nums text-amber-600">{slip.attendanceSummary.totalOvertimeHours.toFixed(1)}h</span>
                                <span className="text-[9px] font-semibold text-amber-500 uppercase tracking-[0.3px]">Jam Lembur</span>
                            </div>
                        )}
                    </div>

                    {/* Earnings Table */}
                    <div className="bg-bg-secondary rounded-md p-4">
                        <h4 className="text-xs font-bold text-text-primary uppercase tracking-[0.5px] m-0 mb-3">{t('slipGaji.modals.detail.earnings.title')}</h4>
                        <div className="flex justify-between items-center py-1.5 text-sm text-text-secondary">
                            <span>{t('slipGaji.modals.detail.earnings.dailyRate')}</span>
                            <span className="font-mono tabular-nums text-right">{formatRp(slip.earnings.dailyRate)}</span>
                        </div>
                        <div className="flex justify-between items-center py-1.5 text-sm text-text-secondary">
                            <span>{t('slipGaji.modals.detail.earnings.totalDailyWages', { days: slip.attendanceSummary.presentDays + slip.attendanceSummary.lateDays })}</span>
                            <span className="font-mono tabular-nums text-right">{formatRp(slip.earnings.totalDailyWage)}</span>
                        </div>
                        <div className="flex justify-between items-center py-1.5 text-sm text-text-secondary">
                            <span>{t('slipGaji.modals.detail.earnings.overtime')}</span>
                            <span className="text-[#059669] font-mono tabular-nums text-right">+{formatRp(slip.earnings.totalOvertime)}</span>
                        </div>
                        {slip.earnings.bonus > 0 && (
                            <div className="flex justify-between items-center py-1.5 text-sm text-text-secondary">
                                <span>{t('slipGaji.modals.detail.earnings.bonus')}</span>
                                <span className="text-[#059669] font-mono tabular-nums text-right">+{formatRp(slip.earnings.bonus)}</span>
                            </div>
                        )}
                        <div className="border-t border-dashed border-border my-1.5" />
                        {slip.earnings.deductions > 0 && (
                            <div className="flex justify-between items-center py-1.5 text-sm text-text-secondary">
                                <span>{t('slipGaji.modals.detail.earnings.deductions')}</span>
                                <span className="text-[#DC2626] font-mono tabular-nums text-right">-{formatRp(slip.earnings.deductions)}</span>
                            </div>
                        )}
                        {slip.earnings.kasbonDeduction > 0 && (
                            <div className="flex justify-between items-center py-1.5 text-sm text-text-secondary">
                                <span>{t('slipGaji.modals.detail.earnings.kasbon')}</span>
                                <span className="text-[#DC2626] font-mono tabular-nums text-right">-{formatRp(slip.earnings.kasbonDeduction)}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center pt-2.5 border-t-2 border-text-primary text-base font-extrabold text-text-primary">
                            <span>{t('slipGaji.modals.detail.earnings.netPay')}</span>
                            <span className="font-mono tabular-nums text-right">{formatRp(slip.earnings.netPay)}</span>
                        </div>
                    </div>

                    {/* Authorization */}
                    <div className="pt-2">
                        <h4 className="text-xs font-bold text-text-primary uppercase tracking-[0.5px] m-0 mb-3">{t('slipGaji.modals.detail.digitalAuth.title')}</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div className={`border border-border rounded-md p-4 text-center flex flex-col items-center gap-1.5 transition-all relative ${slip.authorization.directorPassphrase ? 'border-[#D1FAE5] bg-[#F0FDF4]' : 'border-dashed border-border-light bg-bg-secondary'}`}>
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${slip.authorization.directorPassphrase ? 'bg-[#D1FAE5] text-[#059669]' : 'bg-border-light text-text-muted'}`}>
                                    {slip.authorization.directorPassphrase ? <Unlock size={20} /> : <Lock size={20} />}
                                </div>
                                <span className="text-xs font-bold text-text-primary uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.digitalAuth.director')}</span>
                                {slip.authorization.directorPassphrase ? (
                                    <>
                                        <span className="text-sm font-semibold text-text-primary">{slip.authorization.directorName}</span>
                                        <span className="text-[10px] text-text-muted">
                                            {formatWIBDate(slip.authorization.directorSignedAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </span>
                                        <CheckCircle2 size={14} className="text-[#059669]" />
                                    </>
                                ) : (
                                    <>
                                        <span className="text-[10px] text-text-muted italic">{t('slipGaji.modals.detail.digitalAuth.awaiting')}</span>
                                        {userRole === 'director' && onOpenAuth && (
                                            <button className="flex items-center gap-1 mt-1 text-xs px-2.5 py-1 rounded bg-[#0D9488] text-white transition-colors hover:bg-[#0F766E] cursor-pointer" onClick={() => onOpenAuth(slip._id)}>
                                                <Shield size={12} /> {t('slipGaji.modals.detail.digitalAuth.btnSign')}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className={`border border-border rounded-md p-4 text-center flex flex-col items-center gap-1.5 transition-all relative ${slip.authorization.ownerPassphrase ? 'border-[#D1FAE5] bg-[#F0FDF4]' : 'border-dashed border-border-light bg-bg-secondary'}`}>
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${slip.authorization.ownerPassphrase ? 'bg-[#D1FAE5] text-[#059669]' : 'bg-border-light text-text-muted'}`}>
                                    {slip.authorization.ownerPassphrase ? <Unlock size={20} /> : <Lock size={20} />}
                                </div>
                                <span className="text-xs font-bold text-text-primary uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.digitalAuth.owner')}</span>
                                {slip.authorization.ownerPassphrase ? (
                                    <>
                                        <span className="text-sm font-semibold text-text-primary">{slip.authorization.ownerName}</span>
                                        <span className="text-[10px] text-text-muted">
                                            {formatWIBDate(slip.authorization.ownerSignedAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </span>
                                        <CheckCircle2 size={14} className="text-[#059669]" />
                                    </>
                                ) : (
                                    <>
                                        <span className="text-[10px] text-text-muted italic">{t('slipGaji.modals.detail.digitalAuth.awaiting')}</span>
                                        {userRole === 'owner' && onOpenAuth && (
                                            <button className="flex items-center gap-1 mt-1 text-xs px-2.5 py-1 rounded bg-[#0D9488] text-white transition-colors hover:bg-[#0F766E] cursor-pointer" onClick={() => onOpenAuth(slip._id)}>
                                                <Shield size={12} /> {t('slipGaji.modals.detail.digitalAuth.btnSign')}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Paid Payment Proof (SSOT) */}
                    {slip.status === 'paid' && (
                        <div className="p-4 bg-emerald-50/80 rounded-xl border border-emerald-200">
                            <div className="flex items-center justify-between mb-2.5">
                                <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wider">
                                    <FileCheck2 size={16} className="text-emerald-700" />
                                    <span>Bukti Pembayaran (Transfer Bank)</span>
                                </div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1">
                                    <CheckCircle2 size={11} /> LUNAS (SSOT)
                                </span>
                            </div>

                            <div className="text-xs text-text-secondary flex flex-col gap-1 mb-3">
                                {(slip.paidAt || slip.paymentProof?.uploadedAt) && (
                                    <div>
                                        <span className="text-text-muted">Waktu Pembayaran: </span>
                                        <strong className="text-text-primary">
                                            {formatWIBDate((slip.paidAt || slip.paymentProof?.uploadedAt) as string, {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </strong>
                                    </div>
                                )}
                                {slip.paymentProof?.uploadedBy?.fullName && (
                                    <div>
                                        <span className="text-text-muted">Diproses Oleh: </span>
                                        <strong className="text-text-primary">{slip.paymentProof.uploadedBy.fullName}</strong>
                                    </div>
                                )}
                                {slip.paymentProof?.notes && (
                                    <div className="italic text-text-secondary bg-white/80 p-2.5 rounded-lg border border-emerald-100 mt-1">
                                        "{slip.paymentProof.notes}"
                                    </div>
                                )}
                            </div>

                            {slip.paymentProof?.fileUrl && (
                                <a
                                    href={resolveImageUrl(slip.paymentProof.fileUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group relative block rounded-xl overflow-hidden border border-emerald-200 bg-white shadow-xs hover:border-emerald-500 hover:shadow-md transition-all text-center"
                                >
                                    {slip.paymentProof.fileUrl.toLowerCase().endsWith('.pdf') ? (
                                        <div className="p-6 flex flex-col items-center justify-center gap-2 text-emerald-700 group-hover:text-emerald-800">
                                            <FileText size={36} />
                                            <span className="text-xs font-bold">Lihat Dokumen PDF Bukti Transfer</span>
                                            <span className="text-[10px] text-text-muted flex items-center gap-1">
                                                Klik untuk membuka di tab baru <ExternalLink size={11} />
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <img
                                                src={resolveImageUrl(slip.paymentProof.fileUrl)}
                                                alt="Bukti Transfer Bank"
                                                className="w-full max-h-60 object-contain bg-slate-50 py-2"
                                            />
                                            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold backdrop-blur-[1px]">
                                                <Eye size={15} /> Buka Ukuran Penuh <ExternalLink size={13} />
                                            </div>
                                        </div>
                                    )}
                                </a>
                            )}
                        </div>
                    )}

                    {/* Ready to Finalize Payment Banner */}
                    {(slip.status === 'authorized' || slip.status === 'issued') && onOpenFinalize && (
                        <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                                    <FileCheck2 size={16} className="text-emerald-700" />
                                    <span>Slip Siap Ditransfer & Difinalisasi</span>
                                </div>
                                <p className="text-[11px] text-emerald-700 m-0 mt-0.5">
                                    Otorisasi lengkap. Unggah screenshot bukti transfer untuk menandai slip LUNAS dan sinkronisasi SSOT kehadiran.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => onOpenFinalize(slip)}
                                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer shadow-sm transition-all hover:shadow-md"
                            >
                                <FileCheck2 size={14} /> Finalisasi Pembayaran
                            </button>
                        </div>
                    )}

                    {slip.notes && (
                        <div className="p-3 bg-bg-secondary rounded-xl text-sm text-text-secondary border border-border mt-1">
                            <strong className="text-text-primary mr-1">{t('slipGaji.modals.detail.notes')}</strong> {slip.notes}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 px-5 pb-5 pt-0 flex-wrap">
                    <button className="px-5 py-2.5 border border-border bg-bg-white rounded-md text-sm font-semibold text-text-secondary cursor-pointer transition-colors hover:bg-bg-secondary" onClick={onClose}>
                        {t('slipGaji.modals.detail.btnClose')}
                    </button>
                    <button className="flex items-center gap-1.5 px-6 py-2.5 border-none rounded-md bg-gradient-to-br from-[#10B981] to-[#34D399] text-white text-sm font-semibold cursor-pointer shadow-[0_3px_12px_rgba(16,185,129,0.3)] transition-all hover:-translate-y-[1px] hover:shadow-[0_5px_18px_rgba(16,185,129,0.35)] disabled:opacity-60 disabled:cursor-not-allowed" onClick={() => exportSlipPdfHelper(slip)}>
                        <Download size={16} /> {t('slipGaji.modals.detail.btnExport')}
                    </button>
                    {canSign && canSign(slip) && onOpenAuth && (
                        <button className="flex items-center gap-1.5 px-6 py-2.5 border-none rounded-md bg-gradient-to-br from-indigo-500 to-indigo-400 text-white text-sm font-semibold cursor-pointer shadow-[0_3px_12px_rgba(99,102,241,0.3)] transition-all hover:-translate-y-[1px] hover:shadow-[0_5px_18px_rgba(99,102,241,0.35)] disabled:opacity-60 disabled:cursor-not-allowed" onClick={() => onOpenAuth(slip._id)}>
                            <Lock size={16} /> {t('slipGaji.modals.detail.btnAuthorize')}
                        </button>
                    )}
                    {(slip.status === 'authorized' || slip.status === 'issued') && onOpenFinalize && (
                        <button
                            type="button"
                            className="flex items-center gap-1.5 px-6 py-2.5 border-none rounded-md bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold cursor-pointer shadow-[0_3px_12px_rgba(5,150,105,0.3)] transition-all hover:-translate-y-[1px] hover:shadow-[0_5px_18px_rgba(5,150,105,0.35)]"
                            onClick={() => onOpenFinalize(slip)}
                        >
                            <FileCheck2 size={16} /> Finalisasi Pembayaran
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
