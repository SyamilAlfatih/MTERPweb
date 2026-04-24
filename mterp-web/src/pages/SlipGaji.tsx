import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Receipt,
    UserCheck,
    AlertTriangle,
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
import { formatDate as formatWIBDate, todayWIB, wibDate } from '../utils/date';

/* ---- helpers ---- */
const getWeekRange = (refDateStr = todayWIB()) => {
    const [y, m, d] = refDateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const day = date.getUTCDay(); // 0=Sun
    const sunday = new Date(date);
    sunday.setUTCDate(date.getUTCDate() - day);
    const saturday = new Date(sunday);
    saturday.setUTCDate(sunday.getUTCDate() + 6);
    return { startDate: sunday, endDate: saturday };
};

const toInputDate = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
};

const formatDateShort = (iso: string) => formatWIBDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });
const formatDateRange = (s: string, e: string) => `${formatDateShort(s)} — ${formatDateShort(e)}`;
const formatRp = (v: number) => `Rp ${new Intl.NumberFormat('id-ID').format(v || 0)}`;
const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

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
    useEffect(() => {
        if (!['owner', 'director', 'supervisor', 'asset_admin'].includes(role)) {
            navigate('/home');
        }
    }, [role, navigate]);

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
    const [searchQuery, setSearchQuery] = useState('');

    // Generate modal
    const [genModal, setGenModal] = useState(false);
    const [genWorker, setGenWorker] = useState('');
    const [genStart, setGenStart] = useState(toInputDate(weekRange.startDate));
    const [genEnd, setGenEnd] = useState(toInputDate(weekRange.endDate));
    const [genBonus, setGenBonus] = useState(0);
    const [genDeductions, setGenDeductions] = useState(0);
    const [genNotes, setGenNotes] = useState('');
    const [generating, setGenerating] = useState(false);

    // Kasbon preview for generate modal
    interface KasbonPreview { _id: string; amount: number; reason?: string; createdAt: string; }
    const [kasbonPreview, setKasbonPreview] = useState<KasbonPreview[]>([]);

    // Pre-generation attendance + earnings preview
    interface PreviewData {
        attendanceSummary: {
            totalDays: number;
            presentDays: number;
            lateDays: number;
            absentDays: number;
            totalHours: number;
            totalOvertimeHours: number;
        };
        earnings: {
            dailyRate: number;
            totalDailyWage: number;
            totalOvertime: number;
        };
    }
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Detail modal
    const [detailModal, setDetailModal] = useState(false);
    const [selectedSlip, setSelectedSlip] = useState<SlipData | null>(null);

    // Auth modal
    const [authModal, setAuthModal] = useState(false);
    const [authSlipId, setAuthSlipId] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [authorizing, setAuthorizing] = useState(false);
    const [passphraseError, setPassphraseError] = useState('');

    /* ---- data loading ---- */
    const fetchSlips = useCallback(async () => {
        if (!isValidDate(filterStart) || !isValidDate(filterEnd)) return;
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

    // Body scroll lock while any modal is open
    useEffect(() => {
        document.body.style.overflow = (genModal || detailModal || authModal) ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [genModal, detailModal, authModal]);

    // Escape key closes modals (priority: auth > detail > generate)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (authModal) setAuthModal(false);
            else if (detailModal) setDetailModal(false);
            else if (genModal) setGenModal(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [authModal, detailModal, genModal]);

    // Fetch preview data when worker/dates change in generate modal
    useEffect(() => {
        if (!genWorker || !genStart || !genEnd || !genModal || !isValidDate(genStart) || !isValidDate(genEnd)) {
            setPreviewData(null);
            setKasbonPreview([]);
            return;
        }
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setPreviewLoading(true);
            try {
                // Single endpoint — uses same date logic as generate (no mismatch)
                const res = await api.get('/slipgaji/preview', {
                    params: { workerId: genWorker, startDate: genStart, endDate: genEnd },
                    signal: controller.signal,
                });
                if (controller.signal.aborted) return;

                const { attendanceSummary, earnings, kasbons } = res.data;
                setPreviewData({ attendanceSummary, earnings });
                setKasbonPreview(kasbons || []);
            } catch (err: any) {
                if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
                    setPreviewData(null);
                    setKasbonPreview([]);
                }
            }
            if (!controller.signal.aborted) setPreviewLoading(false);
        }, 300);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [genWorker, genStart, genEnd, genModal]);

    /* ---- quick week navigation ---- */
    const shiftWeek = (dir: number) => {
        const [y, m, d] = filterStart.split('-').map(Number);
        const s = new Date(Date.UTC(y, m - 1, d));
        s.setUTCDate(s.getUTCDate() + dir * 7);
        const range = getWeekRange(toInputDate(s));
        setFilterStart(toInputDate(range.startDate));
        setFilterEnd(toInputDate(range.endDate));
    };

    /* ---- actions ---- */
    const isGeneratingRef = useRef(false);
    const handleGenerate = async () => {
        if (!genWorker || isGeneratingRef.current) return;
        isGeneratingRef.current = true;
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
        } finally {
            isGeneratingRef.current = false;
            setGenerating(false);
        }
    };

    const handleAuthorize = async () => {
        if (!passphrase || passphrase.length < 4) return;
        setAuthorizing(true);
        setPassphraseError('');
        try {
            const res = await api.post(`/slipgaji/${authSlipId}/authorize`, { passphrase });
            setAuthModal(false);
            setPassphrase('');
            setPassphraseError('');
            setAlertData({ visible: true, type: 'success', title: t('slipGaji.messages.authSuccess'), message: t('slipGaji.messages.authSuccessDesc', { name: user?.fullName }) });
            if (selectedSlip?._id === authSlipId) setSelectedSlip(res.data);
            fetchSlips();
        } catch (err: any) {
            const msg = err?.response?.data?.msg || t('slipGaji.messages.authErrorDesc');
            setPassphraseError(msg);
        }
        setAuthorizing(false);
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/slipgaji/${id}`);
            // Immediately remove from local state so the UI updates without waiting for re-fetch
            setSlips(prev => prev.filter(s => s._id !== id));
            setAlertData({ visible: true, type: 'success', title: t('slipGaji.messages.delSuccess'), message: t('slipGaji.messages.delSuccessDesc') });
            if (selectedSlip?._id === id) { setDetailModal(false); setSelectedSlip(null); }
            // Re-fetch in background to sync with server
            fetchSlips();
        } catch (err: any) {
            setAlertData({ visible: true, type: 'error', title: t('slipGaji.messages.delError'), message: err?.response?.data?.msg || t('slipGaji.messages.delErrorDesc') });
        }
    };

    const openDetail = (slip: SlipData) => { setSelectedSlip(slip); setDetailModal(true); };
    const openAuth = (slipId: string) => { setAuthSlipId(slipId); setPassphrase(''); setPassphraseError(''); setAuthModal(true); };
    const canSign = (slip: SlipData) => {
        if (role === 'director' && !slip.authorization.directorPassphrase) return true;
        if (role === 'owner' && !slip.authorization.ownerPassphrase) return true;
        return false;
    };

    const handleExportPdf = async (slip: SlipData) => {
        await exportSlipToPdf({
            slipNumber: slip.slipNumber,
            workerName: slip.workerId?.fullName || 'Worker',
            workerRole: slip.workerId?.role || '',
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
            notes: slip.notes,
        });
    };

    return (
        <div className="p-6 max-w-[1100px] mx-auto">
            <Alert
                visible={alertData.visible}
                type={alertData.type}
                title={alertData.title}
                message={alertData.message}
                onClose={() => setAlertData({ ...alertData, visible: false })}
            />

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button className="w-9 h-9 border border-border bg-bg-white rounded-md flex items-center justify-center text-text-primary transition-all hover:bg-bg-secondary hover:border-primary hover:text-primary shrink-0" onClick={() => navigate(-1)}>
                    <ArrowLeft size={20} />
                </button>
                <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-teal-600 to-teal-400 flex items-center justify-center shadow-[0_4px_14px_rgba(13,148,136,0.35)] shrink-0">
                    <Receipt size={22} color="white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-text-primary m-0">{t('slipGaji.title')}</h1>
                    <p className="text-xs text-text-muted m-0">{t('slipGaji.subtitle')}</p>
                </div>
            </div>

            {/* Action Bar — Date Range Filter */}
            <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
                <div className="flex items-center gap-2">
                    <button className="w-8 h-8 border border-border rounded-md bg-bg-white text-[0.8em] font-bold text-text-secondary flex items-center justify-center transition-all hover:bg-bg-secondary hover:border-primary hover:text-primary shrink-0" onClick={() => shiftWeek(-1)}>◀</button>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-md bg-bg-white">
                        <Calendar size={14} />
                        <input type="date" className="border-none bg-transparent text-[0.8em] font-medium text-text-primary outline-none w-[120px] cursor-pointer" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
                        <span className="text-text-muted text-[0.85em]">—</span>
                        <input type="date" className="border-none bg-transparent text-[0.8em] font-medium text-text-primary outline-none w-[120px] cursor-pointer" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
                    </div>
                    <button className="w-8 h-8 border border-border rounded-md bg-bg-white text-[0.8em] font-bold text-text-secondary flex items-center justify-center transition-all hover:bg-bg-secondary hover:border-primary hover:text-primary shrink-0" onClick={() => shiftWeek(1)}>▶</button>
                </div>
                <button className="flex items-center gap-1.5 px-5 py-2.5 border-none rounded-md bg-gradient-to-br from-teal-600 to-teal-400 text-white text-sm font-semibold cursor-pointer shadow-[0_3px_12px_rgba(13,148,136,0.3)] transition-all hover:-translate-y-[1px] hover:shadow-[0_6px_18px_rgba(13,148,136,0.35)]" onClick={() => setGenModal(true)}>
                    <Plus size={18} />
                    <span>{t('slipGaji.actions.generate')}</span>
                </button>
            </div>

            {/* Search Bar */}
            <div className="relative mb-4">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Cari nama pekerja..."
                    className="w-full pl-9 pr-9 py-2 border border-border rounded-lg bg-bg-white text-sm text-text-primary outline-none transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(30,58,138,0.1)] placeholder:text-text-muted"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-border-light text-text-muted hover:bg-border hover:text-text-primary transition-colors"
                        title="Hapus pencarian"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {/* Slips List — Two Column Layout */}
            {loading ? (
                <div className="flex flex-col items-center justify-center p-10 gap-3 text-text-muted">
                    <Loader2 size={32} className="animate-spin" />
                    <span>{t('slipGaji.loading')}</span>
                </div>
            ) : slips.length === 0 ? (
                <Card className="flex flex-col items-center gap-4 !p-10 text-center text-text-muted">
                    <FileText size={48} color="var(--text-muted)" />
                    <p>{t('slipGaji.empty.title')}</p>
                    <button className="flex items-center gap-1.5 px-5 py-2.5 border-none rounded-md bg-gradient-to-br from-teal-600 to-teal-400 text-white text-sm font-semibold cursor-pointer shadow-[0_3px_12px_rgba(13,148,136,0.3)] transition-all hover:-translate-y-[1px] hover:shadow-[0_6px_18px_rgba(13,148,136,0.35)]" onClick={() => setGenModal(true)}>
                        <Plus size={18} />
                        <span>{t('slipGaji.empty.btnGenerate')}</span>
                    </button>
                </Card>
            ) : (() => {
                const q = searchQuery.trim().toLowerCase();
                const matchesSearch = (s: SlipData) =>
                    !q || (s.workerId?.fullName || '').toLowerCase().includes(q);

                const draftSlips = slips.filter(s => s.status === 'draft' && matchesSearch(s));
                const approvedSlips = slips.filter(s => (s.status === 'authorized' || s.status === 'issued') && matchesSearch(s));

                const SlipCard = ({ slip }: { slip: SlipData }) => {
                    const badge = STATUS_BADGE[slip.status] || STATUS_BADGE.draft;
                    return (
                        <Card key={slip._id} className="!p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md" onClick={() => openDetail(slip)}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ background: badge.bg, color: badge.color }}>
                                        {slip.workerId?.fullName?.[0]?.toUpperCase() || 'W'}
                                    </div>
                                    <div>
                                        <span className="block text-sm font-semibold text-text-primary">{slip.workerId?.fullName || t('slipGaji.card.worker')}</span>
                                        <span className="block text-[10px] text-text-muted font-mono">{slip.slipNumber}</span>
                                    </div>
                                </div>
                                <span className="text-[9px] font-bold px-2.5 py-[3px] rounded-full uppercase tracking-[0.3px] whitespace-nowrap" style={{ color: badge.color, background: badge.bg }}>
                                    {t(`slipGaji.status.${badge.labelKey}`)}
                                </span>
                            </div>

                            <div className="flex items-center gap-1.5 text-[0.72em] text-text-secondary pt-1 pb-0.5">
                                <Calendar size={11} />
                                <span>{formatDateRange(slip.period.startDate, slip.period.endDate)}</span>
                            </div>

                            <div className="flex items-center gap-4 pb-3 border-b border-border-light mb-3">
                                <div className="flex items-center gap-1 text-xs text-text-secondary">
                                    <Clock size={12} />
                                    <span>{slip.attendanceSummary.presentDays} {t('slipGaji.card.days')}</span>
                                </div>
                                {(slip.attendanceSummary.totalOvertimeHours || 0) > 0 && (
                                    <div className="flex items-center gap-1 text-xs text-amber-600 font-semibold">
                                        <Clock size={12} />
                                        <span>{slip.attendanceSummary.totalOvertimeHours.toFixed(1)}h OT</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-1 text-xs text-text-secondary">
                                    <Briefcase size={12} />
                                    <span>{formatRp(slip.earnings.totalDailyWage)}</span>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-text-secondary ml-auto font-bold !text-primary !text-sm">
                                    <DollarSign size={12} />
                                    <span>{formatRp(slip.earnings.netPay)}</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex gap-3">
                                    <div className={`flex items-center gap-1 text-[10px] text-text-muted ${slip.authorization.directorPassphrase ? 'text-[#059669] [&_svg]:text-[#059669]' : ''}`}>
                                        <Shield size={10} />
                                        <span>{t('slipGaji.modals.detail.digitalAuth.director')}</span>
                                    </div>
                                    <div className={`flex items-center gap-1 text-[10px] text-text-muted ${slip.authorization.ownerPassphrase ? 'text-[#059669] [&_svg]:text-[#059669]' : ''}`}>
                                        <Shield size={10} />
                                        <span>{t('slipGaji.modals.detail.digitalAuth.owner')}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                    {canSign(slip) && (
                                        <button className="w-7 h-7 border border-border bg-bg-white rounded-sm flex items-center justify-center cursor-pointer transition-all text-[#0D9488] hover:bg-[#CCFBF1] hover:border-[#0D9488]" onClick={() => openAuth(slip._id)} title="Sign">
                                            <Lock size={14} />
                                        </button>
                                    )}
                                    {slip.status === 'draft' && (
                                        <button className="w-7 h-7 border border-border bg-bg-white rounded-sm flex items-center justify-center cursor-pointer transition-all text-danger hover:bg-[#FEE2E2] hover:border-danger" onClick={() => handleDelete(slip._id)} title="Delete">
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    );
                };

                return (
                    <div className="grid grid-cols-2 gap-5 items-start">
                        {/* Draft Column */}
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 pb-2 border-b-2 border-dashed border-[#D97706]">
                                <div className="w-7 h-7 rounded-md bg-[#FEF3C7] flex items-center justify-center shrink-0">
                                    <FileText size={14} color="#D97706" />
                                </div>
                                <span className="text-xs font-bold text-[#D97706] uppercase tracking-[0.4px]">
                                    {t('slipGaji.columns.draft', 'Draft')}
                                </span>
                                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#D97706]">
                                    {draftSlips.length}
                                </span>
                            </div>
                            {draftSlips.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-8 text-text-muted text-center border border-dashed border-border-light rounded-lg bg-bg-secondary">
                                    <FileText size={28} color="var(--text-muted)" />
                                    <span className="text-xs">
                                        {searchQuery ? `Tidak ada hasil untuk "${searchQuery}"` : t('slipGaji.columns.noDraft', 'No draft slips')}
                                    </span>
                                </div>
                            ) : (
                                draftSlips.map(slip => <SlipCard key={slip._id} slip={slip} />)
                            )}
                        </div>

                        {/* Approved (Signed) Column */}
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 pb-2 border-b-2 border-dashed border-[#059669]">
                                <div className="w-7 h-7 rounded-md bg-[#D1FAE5] flex items-center justify-center shrink-0">
                                    <CheckCircle2 size={14} color="#059669" />
                                </div>
                                <span className="text-xs font-bold text-[#059669] uppercase tracking-[0.4px]">
                                    {t('slipGaji.columns.approved', 'Approved (Signed)')}
                                </span>
                                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D1FAE5] text-[#059669]">
                                    {approvedSlips.length}
                                </span>
                            </div>
                            {approvedSlips.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-8 text-text-muted text-center border border-dashed border-border-light rounded-lg bg-bg-secondary">
                                    <CheckCircle2 size={28} color="var(--text-muted)" />
                                    <span className="text-xs">
                                        {searchQuery ? `Tidak ada hasil untuk "${searchQuery}"` : t('slipGaji.columns.noApproved', 'No approved slips')}
                                    </span>
                                </div>
                            ) : (
                                approvedSlips.map(slip => <SlipCard key={slip._id} slip={slip} />)
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* ===== Generate Modal ===== */}
            {genModal && (
                <div className="modal-overlay" onClick={() => setGenModal(false)}>
                    <div className="bg-bg-white rounded-xl w-[90%] max-w-[520px] max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 px-5 pt-5 pb-0">
                            <div className="w-[42px] h-[42px] rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)' }}>
                                <Receipt size={20} color="white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-text-primary m-0">{t('slipGaji.modals.generate.title')}</h3>
                                <p className="text-xs text-text-muted m-0">{t('slipGaji.modals.generate.desc')}</p>
                            </div>
                            <button className="ml-auto w-8 h-8 border-none bg-bg-secondary rounded-full cursor-pointer flex items-center justify-center text-text-muted transition-colors hover:bg-border" onClick={() => setGenModal(false)}><X size={18} /></button>
                        </div>

                        <div className="p-5">
                            <div className="mb-4 flex-1">
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-[0.3px]"><UserCheck size={14} /> {t('slipGaji.modals.generate.worker')}</label>
                                <div className="w-full relative flex items-center">
                                    <Search size={14} className="absolute left-2.5 text-text-muted pointer-events-none z-10" />
                                    <select className="w-full py-2 pr-7 pl-8 border border-border rounded-md text-sm font-medium text-text-primary bg-bg-white appearance-none cursor-pointer outline-none transition-colors focus:border-primary" value={genWorker} onChange={(e) => setGenWorker(e.target.value)}>
                                        <option value="">{t('slipGaji.modals.generate.workerPlaceholder')}</option>
                                        {workers.map(w => <option key={w._id} value={w._id}>{w.fullName}</option>)}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-2.5 text-text-muted pointer-events-none" />
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <div className="mb-4 flex-1">
                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-[0.3px]"><Calendar size={14} /> {t('slipGaji.modals.generate.startDate')}</label>
                                    <input type="date" className="w-full px-3.5 py-2.5 border border-border rounded-md text-sm text-text-primary bg-bg-white outline-none transition-colors focus:border-primary box-border" value={genStart} onChange={(e) => setGenStart(e.target.value)} />
                                </div>
                                <div className="mb-4 flex-1">
                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-[0.3px]">{t('slipGaji.modals.generate.endDate')}</label>
                                    <input type="date" className="w-full px-3.5 py-2.5 border border-border rounded-md text-sm text-text-primary bg-bg-white outline-none transition-colors focus:border-primary box-border" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} />
                                </div>
                            </div>

                            {/* ── Pre-Generation Preview Panel ─────────────────────── */}
                            {genWorker && (
                                <div className="mb-4 rounded-xl border border-border-light bg-bg-secondary overflow-hidden">
                                    {/* Panel header */}
                                    <div className="flex items-center gap-2 px-3.5 py-2.5 bg-primary/5 border-b border-border-light">
                                        <UserCheck size={14} className="text-primary" />
                                        <span className="text-xs font-bold uppercase tracking-[0.3px] text-primary">Pratinjau Data Pekerja</span>
                                        {previewLoading && <Loader2 size={12} className="animate-spin text-text-muted ml-auto" />}
                                    </div>

                                    {/* Skeleton while loading */}
                                    {previewLoading && !previewData && (
                                        <div className="p-3 flex flex-col gap-2">
                                            {[1,2,3].map(i => (
                                                <div key={i} className="h-4 rounded bg-border-light animate-pulse" style={{ width: `${60 + i * 10}%` }} />
                                            ))}
                                        </div>
                                    )}

                                    {/* Attendance stat grid */}
                                    {previewData && (
                                        <div className="p-3 flex flex-col gap-3">
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { label: 'Hadir', value: previewData.attendanceSummary.presentDays, color: '#059669' },
                                                    { label: 'Terlambat', value: previewData.attendanceSummary.lateDays, color: '#D97706' },
                                                    { label: 'Absen', value: previewData.attendanceSummary.absentDays, color: '#DC2626' },
                                                    { label: 'Total Hari', value: previewData.attendanceSummary.totalDays, color: '#1e3a8a' },
                                                    { label: 'Total Jam', value: `${previewData.attendanceSummary.totalHours.toFixed(1)}h`, color: '#475569' },
                                                    { label: 'Lembur', value: `${previewData.attendanceSummary.totalOvertimeHours.toFixed(1)}h`, color: '#7C3AED' },
                                                ].map(stat => (
                                                    <div key={stat.label} className="text-center py-2 px-1 bg-bg-white rounded-lg border border-border-light">
                                                        <span className="block text-base font-extrabold" style={{ color: stat.color }}>{stat.value}</span>
                                                        <span className="block text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px] mt-0.5">{stat.label}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Earnings breakdown */}
                                            <div className="bg-bg-white rounded-lg border border-border-light p-3 flex flex-col gap-1">
                                                <div className="flex justify-between items-center text-xs text-text-secondary py-0.5">
                                                    <span>Upah Harian ({previewData.attendanceSummary.presentDays + previewData.attendanceSummary.lateDays} hari × {formatRp(previewData.earnings.dailyRate)})</span>
                                                    <span className="font-semibold">{formatRp(previewData.earnings.totalDailyWage)}</span>
                                                </div>
                                                {previewData.earnings.totalOvertime > 0 && (
                                                    <div className="flex justify-between items-center text-xs text-text-secondary py-0.5">
                                                        <span>Lembur</span>
                                                        <span className="font-semibold text-[#059669]">+{formatRp(previewData.earnings.totalOvertime)}</span>
                                                    </div>
                                                )}
                                                {genBonus > 0 && (
                                                    <div className="flex justify-between items-center text-xs text-text-secondary py-0.5">
                                                        <span>Bonus</span>
                                                        <span className="font-semibold text-[#059669]">+{formatRp(genBonus)}</span>
                                                    </div>
                                                )}
                                                <div className="border-t border-dashed border-border-light my-1" />
                                                {genDeductions > 0 && (
                                                    <div className="flex justify-between items-center text-xs text-text-secondary py-0.5">
                                                        <span>Potongan</span>
                                                        <span className="font-semibold text-[#DC2626]">-{formatRp(genDeductions)}</span>
                                                    </div>
                                                )}
                                                {kasbonPreview.length > 0 && (
                                                    <div className="flex justify-between items-center text-xs text-text-secondary py-0.5">
                                                        <span>Kasbon ({kasbonPreview.length} item)</span>
                                                        <span className="font-semibold text-[#DC2626]">-{formatRp(kasbonPreview.reduce((s, k) => s + k.amount, 0))}</span>
                                                    </div>
                                                )}
                                                {/* Live net pay */}
                                                <div className="flex justify-between items-center pt-2 border-t-2 border-text-primary mt-1">
                                                    <span className="text-sm font-bold text-text-primary uppercase tracking-[0.3px]">Estimasi Gaji Bersih</span>
                                                    <span className="text-base font-extrabold text-primary">
                                                        {formatRp(Math.max(0,
                                                            previewData.earnings.totalDailyWage +
                                                            previewData.earnings.totalOvertime +
                                                            genBonus - genDeductions -
                                                            kasbonPreview.reduce((s, k) => s + k.amount, 0)
                                                        ))}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Kasbon detail (if any) */}
                                            {kasbonPreview.length > 0 && (
                                                <div className="rounded-lg border-2 border-amber-300 bg-amber-50 overflow-hidden">
                                                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-100/60">
                                                        <AlertTriangle size={13} className="text-amber-600" />
                                                        <span className="text-xs font-bold uppercase tracking-[0.3px] text-amber-700">Kasbon Aktif</span>
                                                    </div>
                                                    <div className="px-3 pb-2 pt-1">
                                                        {kasbonPreview.map(k => (
                                                            <div key={k._id} className="flex items-center justify-between py-1 border-b border-amber-200/50 last:border-0">
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs font-semibold text-amber-800">{k.reason || 'Kasbon'}</span>
                                                                    <span className="text-[10px] text-amber-600">{formatWIBDate(k.createdAt, { day: 'numeric', month: 'short' })}</span>
                                                                </div>
                                                                <span className="text-sm font-bold text-red-600">-{formatRp(k.amount)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* No kasbon message */}
                                            {!previewLoading && kasbonPreview.length === 0 && (
                                                <p className="text-xs text-text-muted text-center py-1">Tidak ada kasbon aktif untuk periode ini</p>
                                            )}
                                        </div>
                                    )}

                                    {/* No data yet hint */}
                                    {!previewLoading && !previewData && (
                                        <p className="text-xs text-text-muted text-center py-3">Data akan muncul setelah pekerja & tanggal dipilih</p>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-3">
                                <div className="mb-4 flex-1">
                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-[0.3px]"><DollarSign size={14} /> {t('slipGaji.modals.generate.bonus')}</label>
                                    <input type="number" className="w-full px-3.5 py-2.5 border border-border rounded-md text-sm text-text-primary bg-bg-white outline-none transition-colors focus:border-primary box-border" value={genBonus || ''} onChange={(e) => setGenBonus(Number(e.target.value))} placeholder="0" />
                                </div>
                                <div className="mb-4 flex-1">
                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-[0.3px]">{t('slipGaji.modals.generate.deductions')}</label>
                                    <input type="number" className="w-full px-3.5 py-2.5 border border-border rounded-md text-sm text-text-primary bg-bg-white outline-none transition-colors focus:border-primary box-border" value={genDeductions || ''} onChange={(e) => setGenDeductions(Number(e.target.value))} placeholder="0" />
                                </div>
                            </div>

                            <div className="mb-4 flex-1">
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-[0.3px]"><FileText size={14} /> {t('slipGaji.modals.generate.notes')}</label>
                                <textarea className="w-full px-3.5 py-2.5 border border-border rounded-md text-sm text-text-primary bg-bg-white outline-none transition-colors focus:border-primary box-border resize-y font-inherit" value={genNotes} onChange={(e) => setGenNotes(e.target.value)} placeholder={t('slipGaji.modals.generate.notesPlaceholder')} rows={2} />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 px-5 pb-5 pt-0">
                            <button className="px-5 py-2.5 border border-border bg-bg-white rounded-md text-sm font-semibold text-text-secondary cursor-pointer transition-colors hover:bg-bg-secondary" onClick={() => setGenModal(false)}>{t('slipGaji.modals.generate.btnCancel')}</button>
                            <button className="flex items-center gap-1.5 px-6 py-2.5 border-none rounded-md bg-gradient-to-br from-indigo-500 to-indigo-400 text-white text-sm font-semibold cursor-pointer shadow-[0_3px_12px_rgba(99,102,241,0.3)] transition-all hover:-translate-y-[1px] hover:shadow-[0_5px_18px_rgba(99,102,241,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[0_3px_12px_rgba(99,102,241,0.3)]" onClick={handleGenerate} disabled={!genWorker || generating}>
                                {generating ? <><Loader2 size={16} className="animate-spin" /> {t('slipGaji.modals.generate.btnGenerating')}</> : <><Receipt size={16} /> {t('slipGaji.modals.generate.btnGenerate')}</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Detail Modal ===== */}
            {detailModal && selectedSlip && (
                <div className="modal-overlay" onClick={() => setDetailModal(false)}>
                    <div className="bg-bg-white rounded-xl w-[90%] max-w-[600px] max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 px-5 pt-5 pb-0">
                            <div className="w-[42px] h-[42px] rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #059669, #34D399)' }}>
                                <FileText size={20} color="white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-text-primary m-0">{t('slipGaji.modals.detail.title')}</h3>
                                <p className="text-xs text-text-muted m-0">{selectedSlip.slipNumber}</p>
                            </div>
                            <button className="ml-auto w-8 h-8 border-none bg-bg-secondary rounded-full cursor-pointer flex items-center justify-center text-text-muted transition-colors hover:bg-border" onClick={() => setDetailModal(false)}><X size={18} /></button>
                        </div>

                        <div className="p-5 flex flex-col gap-4">
                            {/* Worker Info */}
                            <div>
                                <div className="flex items-center gap-3">
                                    <div className="w-[42px] h-[42px] rounded-full bg-gradient-to-br from-indigo-500 to-indigo-400 text-white flex items-center justify-center font-bold text-base shrink-0">
                                        {selectedSlip.workerId?.fullName?.[0]?.toUpperCase() || 'W'}
                                    </div>
                                    <div>
                                        <span className="block font-bold text-base text-text-primary">{selectedSlip.workerId?.fullName}</span>
                                        <span className="block text-xs text-text-muted capitalize">{selectedSlip.workerId?.role}</span>
                                    </div>
                                    <span className="text-[9px] font-bold px-2.5 py-[3px] rounded-full uppercase tracking-[0.3px] whitespace-nowrap" style={{
                                        color: STATUS_BADGE[selectedSlip.status]?.color,
                                        background: STATUS_BADGE[selectedSlip.status]?.bg,
                                    }}>
                                        {t(`slipGaji.status.${STATUS_BADGE[selectedSlip.status]?.labelKey}`)}
                                    </span>
                                </div>
                            </div>

                            {/* Period */}
                            <div className="flex items-center gap-1.5 text-sm text-text-secondary bg-bg-secondary px-3.5 py-2 rounded-md">
                                <Calendar size={14} />
                                <span>{t('slipGaji.modals.detail.period')} {formatDateRange(selectedSlip.period.startDate, selectedSlip.period.endDate)}</span>
                            </div>

                            {/* Payment Info */}
                            {selectedSlip.workerPaymentInfo?.bankPlatform && (
                                <div className="flex items-center gap-1.5 text-sm text-text-secondary bg-[#F0F9FF] px-3.5 py-2 rounded-md">
                                    <CreditCard size={14} />
                                    <span>{selectedSlip.workerPaymentInfo.bankPlatform} — {selectedSlip.workerPaymentInfo.bankAccount}</span>
                                    <span className="ml-auto italic text-text-muted">a/n {selectedSlip.workerPaymentInfo.accountName}</span>
                                </div>
                            )}

                            {/* Attendance Summary */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="text-center p-3 bg-bg-secondary rounded-md">
                                    <span className="block text-lg font-bold text-text-primary">{selectedSlip.attendanceSummary.totalDays}</span>
                                    <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.totalDays')}</span>
                                </div>
                                <div className="text-center p-3 bg-bg-secondary rounded-md">
                                    <span className="block text-lg font-bold text-[#059669]">{selectedSlip.attendanceSummary.presentDays}</span>
                                    <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.present')}</span>
                                </div>
                                <div className="text-center p-3 bg-bg-secondary rounded-md">
                                    <span className="block text-lg font-bold text-[#D97706]">{selectedSlip.attendanceSummary.lateDays}</span>
                                    <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.late')}</span>
                                </div>
                                <div className="text-center p-3 bg-bg-secondary rounded-md">
                                    <span className="block text-lg font-bold text-[#DC2626]">{selectedSlip.attendanceSummary.absentDays}</span>
                                    <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.absent')}</span>
                                </div>
                                <div className="text-center p-3 bg-bg-secondary rounded-md">
                                    <span className="block text-lg font-bold text-[#7C3AED]">{selectedSlip.attendanceSummary.permitDays}</span>
                                    <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.permit')}</span>
                                </div>
                                <div className="text-center p-3 bg-bg-secondary rounded-md">
                                    <span className="block text-lg font-bold text-text-primary">{selectedSlip.attendanceSummary.totalHours}h</span>
                                    <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.totalHours')}</span>
                                </div>
                                {(selectedSlip.attendanceSummary.totalOvertimeHours || 0) > 0 && (
                                    <div className="text-center p-3 bg-amber-50 rounded-md col-span-3 border border-amber-100">
                                        <span className="block text-lg font-bold text-amber-600">{selectedSlip.attendanceSummary.totalOvertimeHours.toFixed(1)}h</span>
                                        <span className="text-[9px] font-semibold text-amber-500 uppercase tracking-[0.3px]">Jam Lembur</span>
                                    </div>
                                )}
                            </div>

                            {/* Earnings Table */}
                            <div className="bg-bg-secondary rounded-md p-4">
                                <h4 className="text-xs font-bold text-text-primary uppercase tracking-[0.5px] m-0 mb-3">{t('slipGaji.modals.detail.earnings.title')}</h4>
                                <div className="flex justify-between items-center py-1.5 text-sm text-text-secondary">
                                    <span>{t('slipGaji.modals.detail.earnings.dailyRate')}</span>
                                    <span>{formatRp(selectedSlip.earnings.dailyRate)}</span>
                                </div>
                                <div className="flex justify-between items-center py-1.5 text-sm text-text-secondary">
                                    <span>{t('slipGaji.modals.detail.earnings.totalDailyWages', { days: selectedSlip.attendanceSummary.presentDays + selectedSlip.attendanceSummary.lateDays })}</span>
                                    <span>{formatRp(selectedSlip.earnings.totalDailyWage)}</span>
                                </div>
                                <div className="flex justify-between items-center py-1.5 text-sm text-text-secondary">
                                    <span>{t('slipGaji.modals.detail.earnings.overtime')}</span>
                                    <span className="text-[#059669]">{formatRp(selectedSlip.earnings.totalOvertime)}</span>
                                </div>
                                {selectedSlip.earnings.bonus > 0 && (
                                    <div className="flex justify-between items-center py-1.5 text-sm text-text-secondary">
                                        <span>{t('slipGaji.modals.detail.earnings.bonus')}</span>
                                        <span className="text-[#059669]">{formatRp(selectedSlip.earnings.bonus)}</span>
                                    </div>
                                )}
                                <div className="border-t border-dashed border-border my-1.5" />
                                {selectedSlip.earnings.deductions > 0 && (
                                    <div className="flex justify-between items-center py-1.5 text-sm text-text-secondary">
                                        <span>{t('slipGaji.modals.detail.earnings.deductions')}</span>
                                        <span className="text-[#DC2626]">-{formatRp(selectedSlip.earnings.deductions)}</span>
                                    </div>
                                )}
                                {selectedSlip.earnings.kasbonDeduction > 0 && (
                                    <div className="flex justify-between items-center py-1.5 text-sm text-text-secondary">
                                        <span>{t('slipGaji.modals.detail.earnings.kasbon')}</span>
                                        <span className="text-[#DC2626]">-{formatRp(selectedSlip.earnings.kasbonDeduction)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pt-2.5 border-t-2 border-text-primary text-base font-extrabold text-text-primary">
                                    <span>{t('slipGaji.modals.detail.earnings.netPay')}</span>
                                    <span>{formatRp(selectedSlip.earnings.netPay)}</span>
                                </div>
                            </div>

                            {/* Authorization */}
                            <div className="pt-2">
                                <h4 className="text-xs font-bold text-text-primary uppercase tracking-[0.5px] m-0 mb-3">{t('slipGaji.modals.detail.digitalAuth.title')}</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className={`border border-border rounded-md p-4 text-center flex flex-col items-center gap-1.5 transition-all relative ${selectedSlip.authorization.directorPassphrase ? 'border-[#D1FAE5] bg-[#F0FDF4]' : 'border-dashed border-border-light bg-bg-secondary'}`}>
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${selectedSlip.authorization.directorPassphrase ? 'bg-[#D1FAE5] text-[#059669]' : 'bg-border-light text-text-muted'}`}>
                                            {selectedSlip.authorization.directorPassphrase ? <Unlock size={20} /> : <Lock size={20} />}
                                        </div>
                                        <span className="text-xs font-bold text-text-primary uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.digitalAuth.director')}</span>
                                        {selectedSlip.authorization.directorPassphrase ? (
                                            <>
                                                <span className="text-sm font-semibold text-text-primary">{selectedSlip.authorization.directorName}</span>
                                                <span className="text-[10px] text-text-muted">
                                                    {formatWIBDate(selectedSlip.authorization.directorSignedAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                <CheckCircle2 size={14} className="text-[#059669]" />
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-[10px] text-text-muted italic">{t('slipGaji.modals.detail.digitalAuth.awaiting')}</span>
                                                {role === 'director' && (
                                                    <button className="flex items-center gap-1 mt-1 text-xs px-2.5 py-1 rounded bg-[#0D9488] text-white transition-colors hover:bg-[#0F766E]" onClick={() => openAuth(selectedSlip._id)}>
                                                        <Shield size={12} /> {t('slipGaji.modals.detail.digitalAuth.btnSign')}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    <div className={`border border-border rounded-md p-4 text-center flex flex-col items-center gap-1.5 transition-all relative ${selectedSlip.authorization.ownerPassphrase ? 'border-[#D1FAE5] bg-[#F0FDF4]' : 'border-dashed border-border-light bg-bg-secondary'}`}>
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${selectedSlip.authorization.ownerPassphrase ? 'bg-[#D1FAE5] text-[#059669]' : 'bg-border-light text-text-muted'}`}>
                                            {selectedSlip.authorization.ownerPassphrase ? <Unlock size={20} /> : <Lock size={20} />}
                                        </div>
                                        <span className="text-xs font-bold text-text-primary uppercase tracking-[0.3px]">{t('slipGaji.modals.detail.digitalAuth.owner')}</span>
                                        {selectedSlip.authorization.ownerPassphrase ? (
                                            <>
                                                <span className="text-sm font-semibold text-text-primary">{selectedSlip.authorization.ownerName}</span>
                                                <span className="text-[10px] text-text-muted">
                                                    {formatWIBDate(selectedSlip.authorization.ownerSignedAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                <CheckCircle2 size={14} className="text-[#059669]" />
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-[10px] text-text-muted italic">{t('slipGaji.modals.detail.digitalAuth.awaiting')}</span>
                                                {role === 'owner' && (
                                                    <button className="flex items-center gap-1 mt-1 text-xs px-2.5 py-1 rounded bg-[#0D9488] text-white transition-colors hover:bg-[#0F766E]" onClick={() => openAuth(selectedSlip._id)}>
                                                        <Shield size={12} /> {t('slipGaji.modals.detail.digitalAuth.btnSign')}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {selectedSlip.notes && (
                                <div className="p-3 bg-bg-secondary rounded-xl text-sm text-text-secondary border border-border mt-1">
                                    <strong className="text-text-primary mr-1">{t('slipGaji.modals.detail.notes')}</strong> {selectedSlip.notes}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 px-5 pb-5 pt-0">
                            <button className="px-5 py-2.5 border border-border bg-bg-white rounded-md text-sm font-semibold text-text-secondary cursor-pointer transition-colors hover:bg-bg-secondary" onClick={() => setDetailModal(false)}>{t('slipGaji.modals.detail.btnClose')}</button>
                            <button className="flex items-center gap-1.5 px-6 py-2.5 border-none rounded-md bg-gradient-to-br from-[#10B981] to-[#34D399] text-white text-sm font-semibold cursor-pointer shadow-[0_3px_12px_rgba(16,185,129,0.3)] transition-all hover:-translate-y-[1px] hover:shadow-[0_5px_18px_rgba(16,185,129,0.35)] disabled:opacity-60 disabled:cursor-not-allowed" onClick={() => handleExportPdf(selectedSlip)}>
                                <Download size={16} /> {t('slipGaji.modals.detail.btnExport')}
                            </button>
                            {canSign(selectedSlip) && (
                                <button className="flex items-center gap-1.5 px-6 py-2.5 border-none rounded-md bg-gradient-to-br from-indigo-500 to-indigo-400 text-white text-sm font-semibold cursor-pointer shadow-[0_3px_12px_rgba(99,102,241,0.3)] transition-all hover:-translate-y-[1px] hover:shadow-[0_5px_18px_rgba(99,102,241,0.35)] disabled:opacity-60 disabled:cursor-not-allowed" onClick={() => openAuth(selectedSlip._id)}>
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
                    <div className="bg-bg-white rounded-xl w-[90%] max-w-[420px] shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="p-8 flex flex-col items-center text-center">
                            <div className="w-[60px] h-[60px] rounded-full bg-[#EEF2FF] text-primary flex items-center justify-center mb-5 shrink-0">
                                <Lock size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-text-primary mb-2 mt-0">{t('slipGaji.modals.auth.title')}</h3>
                            <p className="text-sm text-text-muted mt-0 mb-6 leading-[1.6]">
                                {t('slipGaji.modals.auth.desc')} <strong className="text-text-primary uppercase tracking-[0.5px]">{role}</strong>
                            </p>
                            <div className="w-full relative flex items-center mb-4">
                                <Shield size={16} className="absolute left-3.5 text-text-muted" />
                                <input
                                    type="password"
                                    className={`w-full py-3.5 pr-4 pl-10 border border-border rounded-lg text-base text-text-primary bg-bg-secondary outline-none transition-all placeholder:text-text-muted focus:bg-bg-white focus:border-primary focus:shadow-[0_0_0_4px_rgba(99,102,241,0.15)] ${passphraseError ? '!border-danger focus:!shadow-[0_0_0_4px_rgba(220,38,38,0.15)] bg-[#FEF2F2]' : ''}`}
                                    value={passphrase}
                                    onChange={(e) => { setPassphrase(e.target.value); setPassphraseError(''); }}
                                    placeholder={t('slipGaji.modals.auth.placeholder')}
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && handleAuthorize()}
                                />
                            </div>
                            {passphraseError && <p className="text-sm font-medium text-danger mt-[-8px] mb-4 text-left w-full pl-2 animate-in slide-in-from-top-1">{passphraseError}</p>}
                            <div className="flex w-full gap-3 mt-2">
                                <button className="flex-[0.8] py-3 border border-border bg-bg-white rounded-lg text-sm font-semibold text-text-secondary cursor-pointer transition-colors hover:bg-bg-secondary" onClick={() => { setAuthModal(false); setPassphraseError(''); }}>{t('slipGaji.modals.auth.btnCancel')}</button>
                                <button
                                    className="flex-[1.2] flex items-center justify-center gap-2 py-3 border-none rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-400 text-white text-sm font-semibold cursor-pointer shadow-[0_4px_14px_rgba(99,102,241,0.35)] transition-all hover:shadow-[0_6px_20px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
                                    onClick={handleAuthorize}
                                    disabled={passphrase.length < 4 || authorizing}
                                >
                                    {authorizing ? (
                                        <><Loader2 size={16} className="animate-spin" /> {t('slipGaji.modals.auth.btnAuthorizing')}</>
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
