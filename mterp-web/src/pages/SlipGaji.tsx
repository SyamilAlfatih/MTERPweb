import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Receipt,
    UserCheck,
    Calendar,
    Plus,
    Lock,
    Unlock,
    Trash2,
    Eye,
    X,
    ChevronDown,
    Shield,
    CreditCard,
    Loader2,
    CheckCircle2,
    AlertCircle,
    FileText,
    DollarSign,
    Clock,
    Briefcase,
    Search,
    Download,
} from 'lucide-react';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Alert, Button } from '../components/shared';
import { useTranslation } from 'react-i18next';
import { exportSlipToPdf } from '../utils/exportSlipPdf';
import './SlipGaji.css';

/* ---- helpers ---- */
/** Get Monday→Saturday of the current week */
const getWeekRange = (refDate = new Date()) => {
    const d = new Date(refDate);
    const day = d.getDay(); // 0=Sun
    const diffToMon = day === 0 ? 6 : day - 1;
    const monday = new Date(d);
    monday.setDate(d.getDate() - diffToMon);
    monday.setHours(0, 0, 0, 0);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    saturday.setHours(23, 59, 59, 999);
    return { startDate: monday, endDate: saturday };
};

const toInputDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
};

const formatDateShort = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const formatDateRange = (s: string, e: string) => `${formatDateShort(s)} — ${formatDateShort(e)}`;
const formatRp = (v: number) => `Rp ${new Intl.NumberFormat('id-ID').format(v || 0)}`;

/* ---- types ---- */
interface Worker {
    _id: string;
    fullName: string;
    role: string;
    paymentInfo?: { bankAccount: string; bankPlatform: string; accountName: string };
}

interface SlipData {
    _id: string;
    slipNumber: string;
    workerId: Worker;
    period: { startDate: string; endDate: string };
    attendanceSummary: {
        totalDays: number;
        presentDays: number;
        lateDays: number;
        absentDays: number;
        permitDays: number;
        totalHours: number;
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
    status: 'draft' | 'authorized' | 'issued';
    createdBy?: { fullName: string };
    notes: string;
    createdAt: string;
}

const STATUS_BADGE: Record<string, { color: string; bg: string; labelKey: string }> = {
    draft: { color: '#D97706', bg: '#FEF3C7', labelKey: 'draft' },
    authorized: { color: '#059669', bg: '#D1FAE5', labelKey: 'authorized' },
    issued: { color: '#6366F1', bg: '#EEF2FF', labelKey: 'issued' },
};

export default function SlipGaji() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const role = user?.role?.toLowerCase() || '';

    // Access guard
    if (!['owner', 'director', 'supervisor', 'asset_admin'].includes(role)) {
        navigate('/home');
        return null;
    }

    /* ---- state ---- */
    const [slips, setSlips] = useState<SlipData[]>([]);
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [loading, setLoading] = useState(true);
    const [alertData, setAlertData] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string }>({
        visible: false, type: 'success', title: '', message: '',
    });

    // Filter by date range (default: current week Mon→Sat)
    const weekRange = getWeekRange();
    const [filterStart, setFilterStart] = useState(toInputDate(weekRange.startDate));
    const [filterEnd, setFilterEnd] = useState(toInputDate(weekRange.endDate));

    // Generate modal
    const [genModal, setGenModal] = useState(false);
    const [genWorker, setGenWorker] = useState('');
    const [genStart, setGenStart] = useState(toInputDate(weekRange.startDate));
    const [genEnd, setGenEnd] = useState(toInputDate(weekRange.endDate));
    const [genBonus, setGenBonus] = useState(0);
    const [genDeductions, setGenDeductions] = useState(0);
    const [genNotes, setGenNotes] = useState('');
    const [generating, setGenerating] = useState(false);

    // Detail modal
    const [detailModal, setDetailModal] = useState(false);
    const [selectedSlip, setSelectedSlip] = useState<SlipData | null>(null);

    // Auth modal
    const [authModal, setAuthModal] = useState(false);
    const [authSlipId, setAuthSlipId] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [authorizing, setAuthorizing] = useState(false);

    /* ---- data loading ---- */
    const fetchSlips = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/slipgaji', { params: { startDate: filterStart, endDate: filterEnd } });
            setSlips(res.data);
        } catch { /* empty */ }
        setLoading(false);
    }, [filterStart, filterEnd]);

    const fetchWorkers = useCallback(async () => {
        try {
            const res = await api.get('/slipgaji/workers');
            setWorkers(res.data);
        } catch { /* empty */ }
    }, []);

    useEffect(() => { fetchSlips(); }, [fetchSlips]);
    useEffect(() => { fetchWorkers(); }, [fetchWorkers]);

    /* ---- quick week navigation ---- */
    const shiftWeek = (dir: number) => {
        const s = new Date(filterStart);
        s.setDate(s.getDate() + dir * 7);
        const range = getWeekRange(s);
        setFilterStart(toInputDate(range.startDate));
        setFilterEnd(toInputDate(range.endDate));
    };

    /* ---- actions ---- */
    const handleGenerate = async () => {
        if (!genWorker) return;
        setGenerating(true);
        try {
            await api.post('/slipgaji/generate', {
                workerId: genWorker,
                startDate: genStart,
                endDate: genEnd,
                bonus: genBonus,
                deductions: genDeductions,
                notes: genNotes,
            });
            setGenModal(false);
            setGenWorker('');
            setGenBonus(0);
            setGenDeductions(0);
            setGenNotes('');
            setAlertData({ visible: true, type: 'success', title: t('slipGaji.messages.genSuccess'), message: t('slipGaji.messages.genSuccessDesc') });
            fetchSlips();
        } catch (err: any) {
            setAlertData({ visible: true, type: 'error', title: t('slipGaji.messages.genError'), message: err?.response?.data?.msg || t('slipGaji.messages.genErrorDesc') });
        }
        setGenerating(false);
    };

    const handleAuthorize = async () => {
        if (!passphrase || passphrase.length < 4) return;
        setAuthorizing(true);
        try {
            const res = await api.post(`/slipgaji/${authSlipId}/authorize`, { passphrase });
            setAuthModal(false);
            setPassphrase('');
            setAlertData({ visible: true, type: 'success', title: t('slipGaji.messages.authSuccess'), message: t('slipGaji.messages.authSuccessDesc', { name: user?.fullName }) });
            if (selectedSlip?._id === authSlipId) setSelectedSlip(res.data);
            fetchSlips();
        } catch (err: any) {
            setAlertData({ visible: true, type: 'error', title: t('slipGaji.messages.authError'), message: err?.response?.data?.msg || t('slipGaji.messages.authErrorDesc') });
        }
        setAuthorizing(false);
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/slipgaji/${id}`);
            setAlertData({ visible: true, type: 'success', title: t('slipGaji.messages.delSuccess'), message: t('slipGaji.messages.delSuccessDesc') });
            fetchSlips();
            if (selectedSlip?._id === id) { setDetailModal(false); setSelectedSlip(null); }
        } catch (err: any) {
            setAlertData({ visible: true, type: 'error', title: t('slipGaji.messages.delError'), message: err?.response?.data?.msg || t('slipGaji.messages.delErrorDesc') });
        }
    };

    const openDetail = (slip: SlipData) => { setSelectedSlip(slip); setDetailModal(true); };
    const openAuth = (slipId: string) => { setAuthSlipId(slipId); setPassphrase(''); setAuthModal(true); };
    const canSign = (slip: SlipData) => {
        if (role === 'director' && !slip.authorization.directorPassphrase) return true;
        if (role === 'owner' && !slip.authorization.ownerPassphrase) return true;
        return false;
    };

    const handleExportPdf = (slip: SlipData) => {
        exportSlipToPdf({
            slipNumber: slip.slipNumber,
            workerName: slip.workerId?.fullName || 'Worker',
            workerRole: slip.workerId?.role || '',
            periodStart: slip.period.startDate,
            periodEnd: slip.period.endDate,
            attendance: slip.attendanceSummary,
            earnings: slip.earnings,
            paymentInfo: slip.workerPaymentInfo,
            authorization: {
                directorName: slip.authorization.directorName || undefined,
                directorSignedAt: slip.authorization.directorSignedAt || undefined,
                ownerName: slip.authorization.ownerName || undefined,
                ownerSignedAt: slip.authorization.ownerSignedAt || undefined,
            },
            notes: slip.notes,
        });
    };

    return (
        <div className="sg-container">
            <Alert
                visible={alertData.visible}
                type={alertData.type}
                title={alertData.title}
                message={alertData.message}
                onClose={() => setAlertData({ ...alertData, visible: false })}
            />

            {/* Header */}
            <div className="sg-header">
                <button className="sg-back-btn" onClick={() => navigate(-1)}>
                    <ArrowLeft size={20} />
                </button>
                <div className="sg-header-icon">
                    <Receipt size={22} color="white" />
                </div>
                <div>
                    <h1 className="sg-title">{t('slipGaji.title')}</h1>
                    <p className="sg-subtitle">{t('slipGaji.subtitle')}</p>
                </div>
            </div>

            {/* Action Bar — Date Range Filter */}
            <div className="sg-action-bar">
                <div className="sg-filters">
                    <button className="sg-week-btn" onClick={() => shiftWeek(-1)}>◀</button>
                    <div className="sg-date-range">
                        <Calendar size={14} />
                        <input type="date" className="sg-date-input" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
                        <span className="sg-date-sep">—</span>
                        <input type="date" className="sg-date-input" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
                    </div>
                    <button className="sg-week-btn" onClick={() => shiftWeek(1)}>▶</button>
                </div>
                <button className="sg-generate-btn" onClick={() => setGenModal(true)}>
                    <Plus size={18} />
                    <span>{t('slipGaji.actions.generate')}</span>
                </button>
            </div>

            {/* Slips List */}
            {loading ? (
                <div className="sg-loading">
                    <Loader2 size={32} className="sg-spinner" />
                    <span>{t('slipGaji.loading')}</span>
                </div>
            ) : slips.length === 0 ? (
                <Card className="sg-empty">
                    <FileText size={48} color="var(--text-muted)" />
                    <p>{t('slipGaji.empty.title')}</p>
                    <button className="sg-generate-btn" onClick={() => setGenModal(true)}>
                        <Plus size={18} />
                        <span>{t('slipGaji.empty.btnGenerate')}</span>
                    </button>
                </Card>
            ) : (
                <div className="sg-slips-list">
                    {slips.map((slip) => {
                        const badge = STATUS_BADGE[slip.status] || STATUS_BADGE.draft;
                        return (
                            <Card key={slip._id} className="sg-slip-card" onClick={() => openDetail(slip)}>
                                <div className="sg-slip-top">
                                    <div className="sg-slip-worker">
                                        <div className="sg-slip-avatar" style={{ background: badge.bg, color: badge.color }}>
                                            {slip.workerId?.fullName?.[0]?.toUpperCase() || 'W'}
                                        </div>
                                        <div>
                                            <span className="sg-slip-name">{slip.workerId?.fullName || t('slipGaji.card.worker')}</span>
                                            <span className="sg-slip-number">{slip.slipNumber}</span>
                                        </div>
                                    </div>
                                    <span className="sg-slip-badge" style={{ color: badge.color, background: badge.bg }}>
                                        {t(`slipGaji.status.${badge.labelKey}`)}
                                    </span>
                                </div>

                                <div className="sg-slip-period-row">
                                    <Calendar size={11} />
                                    <span>{formatDateRange(slip.period.startDate, slip.period.endDate)}</span>
                                </div>

                                <div className="sg-slip-middle">
                                    <div className="sg-slip-stat">
                                        <Clock size={12} />
                                        <span>{slip.attendanceSummary.presentDays} {t('slipGaji.card.days')}</span>
                                    </div>
                                    <div className="sg-slip-stat">
                                        <Briefcase size={12} />
                                        <span>{formatRp(slip.earnings.totalDailyWage)}</span>
                                    </div>
                                    <div className="sg-slip-stat sg-net-pay">
                                        <DollarSign size={12} />
                                        <span>{formatRp(slip.earnings.netPay)}</span>
                                    </div>
                                </div>

                                <div className="sg-slip-bottom">
                                    <div className="sg-slip-sigs">
                                        <div className={`sg-sig-dot ${slip.authorization.directorPassphrase ? 'signed' : ''}`}>
                                            <Shield size={10} />
                                            <span>{t('slipGaji.modals.detail.digitalAuth.director')}</span>
                                        </div>
                                        <div className={`sg-sig-dot ${slip.authorization.ownerPassphrase ? 'signed' : ''}`}>
                                            <Shield size={10} />
                                            <span>{t('slipGaji.modals.detail.digitalAuth.owner')}</span>
                                        </div>
                                    </div>
                                    <div className="sg-slip-actions" onClick={(e) => e.stopPropagation()}>
                                        {canSign(slip) && (
                                            <button className="sg-action-btn sg-sign-btn" onClick={() => openAuth(slip._id)} title="Sign">
                                                <Lock size={14} />
                                            </button>
                                        )}
                                        {slip.status === 'draft' && (
                                            <button className="sg-action-btn sg-delete-btn" onClick={() => handleDelete(slip._id)} title="Delete">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* ===== Generate Modal ===== */}
            {genModal && (
                <div className="modal-overlay" onClick={() => setGenModal(false)}>
                    <div className="sg-modal sg-modal-gen" onClick={(e) => e.stopPropagation()}>
                        <div className="sg-modal-header">
                            <div className="sg-modal-icon" style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)' }}>
                                <Receipt size={20} color="white" />
                            </div>
                            <div>
                                <h3 className="sg-modal-title">{t('slipGaji.modals.generate.title')}</h3>
                                <p className="sg-modal-desc">{t('slipGaji.modals.generate.desc')}</p>
                            </div>
                            <button className="sg-modal-close" onClick={() => setGenModal(false)}><X size={18} /></button>
                        </div>

                        <div className="sg-modal-body">
                            <div className="sg-form-group">
                                <label className="sg-label"><UserCheck size={14} /> {t('slipGaji.modals.generate.worker')}</label>
                                <div className="sg-select-group sg-full">
                                    <Search size={14} className="sg-select-icon" />
                                    <select className="sg-select" value={genWorker} onChange={(e) => setGenWorker(e.target.value)}>
                                        <option value="">{t('slipGaji.modals.generate.workerPlaceholder')}</option>
                                        {workers.map(w => <option key={w._id} value={w._id}>{w.fullName}</option>)}
                                    </select>
                                    <ChevronDown size={14} className="sg-select-arrow" />
                                </div>
                            </div>

                            <div className="sg-form-row">
                                <div className="sg-form-group">
                                    <label className="sg-label"><Calendar size={14} /> {t('slipGaji.modals.generate.startDate')}</label>
                                    <input type="date" className="sg-input" value={genStart} onChange={(e) => setGenStart(e.target.value)} />
                                </div>
                                <div className="sg-form-group">
                                    <label className="sg-label">{t('slipGaji.modals.generate.endDate')}</label>
                                    <input type="date" className="sg-input" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} />
                                </div>
                            </div>

                            <div className="sg-form-row">
                                <div className="sg-form-group">
                                    <label className="sg-label"><DollarSign size={14} /> {t('slipGaji.modals.generate.bonus')}</label>
                                    <input type="number" className="sg-input" value={genBonus || ''} onChange={(e) => setGenBonus(Number(e.target.value))} placeholder="0" />
                                </div>
                                <div className="sg-form-group">
                                    <label className="sg-label">{t('slipGaji.modals.generate.deductions')}</label>
                                    <input type="number" className="sg-input" value={genDeductions || ''} onChange={(e) => setGenDeductions(Number(e.target.value))} placeholder="0" />
                                </div>
                            </div>

                            <div className="sg-form-group">
                                <label className="sg-label"><FileText size={14} /> {t('slipGaji.modals.generate.notes')}</label>
                                <textarea className="sg-textarea" value={genNotes} onChange={(e) => setGenNotes(e.target.value)} placeholder={t('slipGaji.modals.generate.notesPlaceholder')} rows={2} />
                            </div>
                        </div>

                        <div className="sg-modal-footer">
                            <button className="sg-btn-cancel" onClick={() => setGenModal(false)}>{t('slipGaji.modals.generate.btnCancel')}</button>
                            <button className="sg-btn-primary" onClick={handleGenerate} disabled={!genWorker || generating}>
                                {generating ? <><Loader2 size={16} className="sg-spinner" /> {t('slipGaji.modals.generate.btnGenerating')}</> : <><Receipt size={16} /> {t('slipGaji.modals.generate.btnGenerate')}</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Detail Modal ===== */}
            {detailModal && selectedSlip && (
                <div className="modal-overlay" onClick={() => setDetailModal(false)}>
                    <div className="sg-modal sg-modal-detail" onClick={(e) => e.stopPropagation()}>
                        <div className="sg-modal-header">
                            <div className="sg-modal-icon" style={{ background: 'linear-gradient(135deg, #059669, #34D399)' }}>
                                <FileText size={20} color="white" />
                            </div>
                            <div>
                                <h3 className="sg-modal-title">{t('slipGaji.modals.detail.title')}</h3>
                                <p className="sg-modal-desc">{selectedSlip.slipNumber}</p>
                            </div>
                            <button className="sg-modal-close" onClick={() => setDetailModal(false)}><X size={18} /></button>
                        </div>

                        <div className="sg-modal-body sg-slip-detail">
                            {/* Worker Info */}
                            <div className="sg-detail-section">
                                <div className="sg-detail-worker">
                                    <div className="sg-detail-avatar">
                                        {selectedSlip.workerId?.fullName?.[0]?.toUpperCase() || 'W'}
                                    </div>
                                    <div>
                                        <span className="sg-detail-name">{selectedSlip.workerId?.fullName}</span>
                                        <span className="sg-detail-role">{selectedSlip.workerId?.role}</span>
                                    </div>
                                    <span className="sg-slip-badge" style={{
                                        color: STATUS_BADGE[selectedSlip.status]?.color,
                                        background: STATUS_BADGE[selectedSlip.status]?.bg,
                                    }}>
                                        {t(`slipGaji.status.${STATUS_BADGE[selectedSlip.status]?.labelKey}`)}
                                    </span>
                                </div>
                            </div>

                            {/* Period */}
                            <div className="sg-detail-period">
                                <Calendar size={14} />
                                <span>{t('slipGaji.modals.detail.period')} {formatDateRange(selectedSlip.period.startDate, selectedSlip.period.endDate)}</span>
                            </div>

                            {/* Payment Info */}
                            {selectedSlip.workerPaymentInfo?.bankPlatform && (
                                <div className="sg-detail-payment">
                                    <CreditCard size={14} />
                                    <span>{selectedSlip.workerPaymentInfo.bankPlatform} — {selectedSlip.workerPaymentInfo.bankAccount}</span>
                                    <span className="sg-detail-accname">a/n {selectedSlip.workerPaymentInfo.accountName}</span>
                                </div>
                            )}

                            {/* Attendance Summary */}
                            <div className="sg-detail-grid">
                                <div className="sg-detail-stat">
                                    <span className="sg-detail-stat-val">{selectedSlip.attendanceSummary.totalDays}</span>
                                    <span className="sg-detail-stat-label">{t('slipGaji.modals.detail.totalDays')}</span>
                                </div>
                                <div className="sg-detail-stat">
                                    <span className="sg-detail-stat-val sg-green">{selectedSlip.attendanceSummary.presentDays}</span>
                                    <span className="sg-detail-stat-label">{t('slipGaji.modals.detail.present')}</span>
                                </div>
                                <div className="sg-detail-stat">
                                    <span className="sg-detail-stat-val sg-amber">{selectedSlip.attendanceSummary.lateDays}</span>
                                    <span className="sg-detail-stat-label">{t('slipGaji.modals.detail.late')}</span>
                                </div>
                                <div className="sg-detail-stat">
                                    <span className="sg-detail-stat-val sg-red">{selectedSlip.attendanceSummary.absentDays}</span>
                                    <span className="sg-detail-stat-label">{t('slipGaji.modals.detail.absent')}</span>
                                </div>
                                <div className="sg-detail-stat">
                                    <span className="sg-detail-stat-val sg-purple">{selectedSlip.attendanceSummary.permitDays}</span>
                                    <span className="sg-detail-stat-label">{t('slipGaji.modals.detail.permit')}</span>
                                </div>
                                <div className="sg-detail-stat">
                                    <span className="sg-detail-stat-val">{selectedSlip.attendanceSummary.totalHours}h</span>
                                    <span className="sg-detail-stat-label">{t('slipGaji.modals.detail.totalHours')}</span>
                                </div>
                            </div>

                            {/* Earnings Table */}
                            <div className="sg-detail-table">
                                <h4 className="sg-detail-table-title">{t('slipGaji.modals.detail.earnings.title')}</h4>
                                <div className="sg-table-row">
                                    <span>{t('slipGaji.modals.detail.earnings.dailyRate')}</span>
                                    <span>{formatRp(selectedSlip.earnings.dailyRate)}</span>
                                </div>
                                <div className="sg-table-row">
                                    <span>{t('slipGaji.modals.detail.earnings.totalDailyWages', { days: selectedSlip.attendanceSummary.presentDays + selectedSlip.attendanceSummary.lateDays })}</span>
                                    <span>{formatRp(selectedSlip.earnings.totalDailyWage)}</span>
                                </div>
                                <div className="sg-table-row">
                                    <span>{t('slipGaji.modals.detail.earnings.overtime')}</span>
                                    <span className="sg-green">{formatRp(selectedSlip.earnings.totalOvertime)}</span>
                                </div>
                                {selectedSlip.earnings.bonus > 0 && (
                                    <div className="sg-table-row">
                                        <span>{t('slipGaji.modals.detail.earnings.bonus')}</span>
                                        <span className="sg-green">{formatRp(selectedSlip.earnings.bonus)}</span>
                                    </div>
                                )}
                                <div className="sg-table-divider" />
                                {selectedSlip.earnings.deductions > 0 && (
                                    <div className="sg-table-row">
                                        <span>{t('slipGaji.modals.detail.earnings.deductions')}</span>
                                        <span className="sg-red">-{formatRp(selectedSlip.earnings.deductions)}</span>
                                    </div>
                                )}
                                {selectedSlip.earnings.kasbonDeduction > 0 && (
                                    <div className="sg-table-row">
                                        <span>{t('slipGaji.modals.detail.earnings.kasbon')}</span>
                                        <span className="sg-red">-{formatRp(selectedSlip.earnings.kasbonDeduction)}</span>
                                    </div>
                                )}
                                <div className="sg-table-total">
                                    <span>{t('slipGaji.modals.detail.earnings.netPay')}</span>
                                    <span>{formatRp(selectedSlip.earnings.netPay)}</span>
                                </div>
                            </div>

                            {/* Authorization */}
                            <div className="sg-auth-section">
                                <h4 className="sg-detail-table-title">{t('slipGaji.modals.detail.digitalAuth.title')}</h4>
                                <div className="sg-auth-grid">
                                    <div className={`sg-auth-card ${selectedSlip.authorization.directorPassphrase ? 'signed' : 'pending'}`}>
                                        <div className="sg-auth-icon">
                                            {selectedSlip.authorization.directorPassphrase ? <Unlock size={20} /> : <Lock size={20} />}
                                        </div>
                                        <span className="sg-auth-role">{t('slipGaji.modals.detail.digitalAuth.director')}</span>
                                        {selectedSlip.authorization.directorPassphrase ? (
                                            <>
                                                <span className="sg-auth-name">{selectedSlip.authorization.directorName}</span>
                                                <span className="sg-auth-date">
                                                    {new Date(selectedSlip.authorization.directorSignedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                <CheckCircle2 size={14} className="sg-auth-check" />
                                            </>
                                        ) : (
                                            <>
                                                <span className="sg-auth-pending">{t('slipGaji.modals.detail.digitalAuth.awaiting')}</span>
                                                {role === 'director' && (
                                                    <button className="sg-auth-sign-btn" onClick={() => openAuth(selectedSlip._id)}>
                                                        <Shield size={12} /> {t('slipGaji.modals.detail.digitalAuth.btnSign')}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    <div className={`sg-auth-card ${selectedSlip.authorization.ownerPassphrase ? 'signed' : 'pending'}`}>
                                        <div className="sg-auth-icon">
                                            {selectedSlip.authorization.ownerPassphrase ? <Unlock size={20} /> : <Lock size={20} />}
                                        </div>
                                        <span className="sg-auth-role">{t('slipGaji.modals.detail.digitalAuth.owner')}</span>
                                        {selectedSlip.authorization.ownerPassphrase ? (
                                            <>
                                                <span className="sg-auth-name">{selectedSlip.authorization.ownerName}</span>
                                                <span className="sg-auth-date">
                                                    {new Date(selectedSlip.authorization.ownerSignedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                <CheckCircle2 size={14} className="sg-auth-check" />
                                            </>
                                        ) : (
                                            <>
                                                <span className="sg-auth-pending">{t('slipGaji.modals.detail.digitalAuth.awaiting')}</span>
                                                {role === 'owner' && (
                                                    <button className="sg-auth-sign-btn" onClick={() => openAuth(selectedSlip._id)}>
                                                        <Shield size={12} /> {t('slipGaji.modals.detail.digitalAuth.btnSign')}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {selectedSlip.notes && (
                                <div className="sg-detail-notes">
                                    <strong>{t('slipGaji.modals.detail.notes')}</strong> {selectedSlip.notes}
                                </div>
                            )}
                        </div>

                        <div className="sg-modal-footer">
                            <button className="sg-btn-cancel" onClick={() => setDetailModal(false)}>{t('slipGaji.modals.detail.btnClose')}</button>
                            <button className="sg-btn-export" onClick={() => handleExportPdf(selectedSlip)}>
                                <Download size={16} /> {t('slipGaji.modals.detail.btnExport')}
                            </button>
                            {canSign(selectedSlip) && (
                                <button className="sg-btn-primary" onClick={() => openAuth(selectedSlip._id)}>
                                    <Lock size={16} /> {t('slipGaji.modals.detail.btnAuthorize')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Authorization Modal ===== */}
            {authModal && (
                <div className="modal-overlay" onClick={() => setAuthModal(false)}>
                    <div className="sg-modal sg-modal-auth" onClick={(e) => e.stopPropagation()}>
                        <div className="sg-auth-modal-body">
                            <div className="sg-auth-lock-icon">
                                <Lock size={32} />
                            </div>
                            <h3 className="sg-auth-modal-title">{t('slipGaji.modals.auth.title')}</h3>
                            <p className="sg-auth-modal-desc">
                                {t('slipGaji.modals.auth.desc')} <strong>{role}</strong>
                            </p>
                            <div className="sg-auth-input-wrap">
                                <Shield size={16} className="sg-auth-input-icon" />
                                <input
                                    type="password"
                                    className="sg-auth-input"
                                    value={passphrase}
                                    onChange={(e) => setPassphrase(e.target.value)}
                                    placeholder={t('slipGaji.modals.auth.placeholder')}
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && handleAuthorize()}
                                />
                            </div>
                            <div className="sg-auth-modal-actions">
                                <button className="sg-btn-cancel" onClick={() => setAuthModal(false)}>{t('slipGaji.modals.auth.btnCancel')}</button>
                                <button
                                    className="sg-btn-authorize"
                                    onClick={handleAuthorize}
                                    disabled={passphrase.length < 4 || authorizing}
                                >
                                    {authorizing ? (
                                        <><Loader2 size={16} className="sg-spinner" /> {t('slipGaji.modals.auth.btnAuthorizing')}</>
                                    ) : (
                                        <><Unlock size={16} /> {t('slipGaji.modals.auth.btnAuthorize')}</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
