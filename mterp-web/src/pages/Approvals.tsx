import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Check,
  X,
  Inbox,
  AlertCircle,
  Search,
  Package,
  ArrowLeft,
  Clock,
  Calendar,
  User,
  Briefcase,
  ChevronRight,
  Lock,
  KeyRound,
  RefreshCw,
  FileText,
  DollarSign,
  CheckSquare,
  Square,
  History,
  Info,
} from 'lucide-react';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Badge, Button, EmptyState, AriaLiveRegion } from '../components/shared';
import { formatDate as formatWIBDate } from '../utils/date';
import {
  ApprovalModule,
  UnifiedApprovalRecord,
  buildKasbonPipeline,
  buildProcurementPipeline,
  buildSpklPipeline,
  canUserActOnKasbon,
  canUserActOnProcurement,
  canUserActOnSpkl,
  executeApprovalAction,
  executeRejectionAction,
  getProcurementStageLabel,
  getSpklStageLabel,
  normalizeLegacyRequestStatus,
} from '../utils/approvalWorkflow';
import { ApprovalPipelineStepper } from '../components/approvals/ApprovalPipelineStepper';
import {
  ApproveConfirmModal,
  RejectReasonModal,
} from '../components/approvals/ApprovalActionModals';

type QueueTab = 'mine' | 'all_pending' | 'history';
type ModuleFilter = 'all' | ApprovalModule;

const SESSION_UNLOCK_MS = 10 * 60 * 1000;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount || 0);
}

function getModuleMeta(module: ApprovalModule): {
  label: string;
  icon: React.ElementType;
  pillClass: string;
} {
  switch (module) {
    case 'request':
      return {
        label: 'Procurement',
        icon: Package,
        pillClass: 'bg-blue-50 text-blue-700 border-blue-200',
      };
    case 'spkl':
      return {
        label: 'SPKL Lembur',
        icon: Clock,
        pillClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'kasbon':
      return {
        label: 'Kasbon',
        icon: DollarSign,
        pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
  }
}

export default function Approvals() {
  const { user } = useAuth();
  const [records, setRecords] = useState<UnifiedApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Workbench filters & selection
  const [activeTab, setActiveTab] = useState<QueueTab>('mine');
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [checkedUids, setCheckedUids] = useState<Set<string>>(new Set());
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // In-memory short-lived passphrase unlock (never stored on disk)
  const [sessionPassphrase, setSessionPassphrase] = useState<string>('');
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number>(0);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Modals
  const [approveModal, setApproveModal] = useState<{
    open: boolean;
    items: UnifiedApprovalRecord[];
  }>({ open: false, items: [] });
  const [rejectModal, setRejectModal] = useState<{
    open: boolean;
    item: UnifiedApprovalRecord | null;
  }>({ open: false, item: null });
  const [actionError, setActionError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isDirectorOrOwner = user?.role === 'director' || user?.role === 'owner';
  const sessionUnlocked = Boolean(sessionPassphrase && sessionExpiresAt > nowTick);

  // Tick timer while session is unlocked
  useEffect(() => {
    if (!sessionPassphrase) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (sessionExpiresAt <= now) {
        setSessionPassphrase('');
        setSessionExpiresAt(0);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [sessionPassphrase, sessionExpiresAt]);

  const lockSession = () => {
    setSessionPassphrase('');
    setSessionExpiresAt(0);
  };

  const formatRemainingSession = () => {
    const secs = Math.max(0, Math.floor((sessionExpiresAt - nowTick) / 1000));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const fetchAllApprovals = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [reqRes, spklRes, kasbonRes] = await Promise.allSettled([
        api.get('/requests'),
        api.get('/spkl?limit=100'),
        isDirectorOrOwner ? api.get('/kasbon') : Promise.resolve({ data: [] }),
      ]);

      const unified: UnifiedApprovalRecord[] = [];

      // 1. Map Procurement Requests (normalizing any legacy status strings safely)
      if (reqRes.status === 'fulfilled' && Array.isArray(reqRes.value.data)) {
        for (const r of reqRes.value.data) {
          const normalizedStatus = normalizeLegacyRequestStatus(r.status);
          const hasMultiple = Array.isArray(r.items) && r.items.length > 1;
          const mainItemName = hasMultiple
            ? `${r.items[0]?.item} (+${r.items.length - 1} item lainnya)`
            : r.item || r.items?.[0]?.item || 'Material';

          const isPending = ['PR_PENDING', 'PR_REVIEWED', 'PO_PENDING_FINANCE'].includes(normalizedStatus);
          const isHistory = ['PR_APPROVED', 'MUST_PURCHASE', 'ON_THE_WAY', 'DELIVERED', 'PAID', 'PR_REJECTED'].includes(
            normalizedStatus
          );

          unified.push({
            uid: `request:${r._id}`,
            id: r._id,
            module: 'request',
            title: r.prNumber ? `${r.prNumber} — ${mainItemName}` : mainItemName,
            subtitle: r.purpose || `${r.items?.length || 1} baris item`,
            requester: r.requestedBy?.fullName || r.requestedBy || 'Staff',
            requesterRole: r.requestedBy?.role || 'Staff',
            projectName: r.projectId?.nama || 'General',
            dateLabel: r.dateNeeded
              ? formatWIBDate(r.dateNeeded, { day: 'numeric', month: 'short', year: 'numeric' })
              : formatWIBDate(r.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }),
            createdAt: r.createdAt || '',
            amount: r.totalEstimatedBudget || r.poTotalAmount || r.costEstimate || 0,
            urgency: r.urgency || 'Normal',
            normalizedStatus,
            stageLabel: getProcurementStageLabel(normalizedStatus),
            isPending,
            isHistory,
            canAct: isPending && canUserActOnProcurement(normalizedStatus, user?.role),
            requiresPassphraseOnReject: true,
            rejectionReason: r.rejectionReason,
            pipeline: buildProcurementPipeline(r, normalizedStatus),
            raw: r,
          });
        }
      }

      // 2. Map SPKL Overtime
      if (spklRes.status === 'fulfilled') {
        const spklList = Array.isArray(spklRes.value.data?.data)
          ? spklRes.value.data.data
          : Array.isArray(spklRes.value.data)
            ? spklRes.value.data
            : [];

        for (const s of spklList) {
          const wf = s.workflowStatus || 'submitted';
          const isPending = ['submitted', 'supervisor_verified', 'pm_approved'].includes(wf);
          const isHistory = ['finance_verified', 'rejected'].includes(wf);
          const workerCount = Array.isArray(s.workers) ? s.workers.length : s.workerName ? 1 : 0;

          unified.push({
            uid: `spkl:${s._id}`,
            id: s._id,
            module: 'spkl',
            title: s.spklNumber
              ? `${s.spklNumber} — ${s.workDescription || 'Lembur Proyek'}`
              : s.workDescription || `Lembur ${workerCount || 1} Pekerja`,
            subtitle: `${workerCount || 1} pekerja • ${s.totalOvertimeHours || s.overtimeHours || 0} jam`,
            requester: s.requestedBy?.fullName || s.createdBy?.fullName || s.supervisorName || 'Pengawas',
            requesterRole: s.requestedBy?.role || 'Supervisor',
            projectName: s.projectId?.nama || s.projectName || 'Proyek',
            dateLabel: formatWIBDate(s.date || s.createdAt, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }),
            createdAt: s.createdAt || s.date || '',
            amount: s.totalOvertimeCost || s.estimatedCost || 0,
            urgency: 'Normal',
            normalizedStatus: wf,
            stageLabel: getSpklStageLabel(wf),
            isPending,
            isHistory,
            canAct: isPending && canUserActOnSpkl(wf, user?.role, user?._id, s),
            requiresPassphraseOnReject: false,
            rejectionReason: s.rejectionReason,
            pipeline: buildSpklPipeline(s),
            raw: s,
          });
        }
      }

      // 3. Map Kasbon (Director/Owner)
      if (isDirectorOrOwner && kasbonRes.status === 'fulfilled' && Array.isArray(kasbonRes.value.data)) {
        for (const k of kasbonRes.value.data) {
          const status = k.status || 'Pending';
          const isPending = status === 'Pending';
          const isHistory = ['Approved', 'Rejected', 'Paid'].includes(status);

          unified.push({
            uid: `kasbon:${k._id}`,
            id: k._id,
            module: 'kasbon',
            title: `Kasbon ${formatCurrency(k.amount)}`,
            subtitle: k.reason || 'Pengajuan kasbon',
            requester: k.userId?.fullName || 'Karyawan',
            requesterRole: k.userId?.role || 'Staff',
            projectName: k.projectId?.nama || 'Personal / Operasional',
            dateLabel: formatWIBDate(k.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }),
            createdAt: k.createdAt || '',
            amount: k.amount || 0,
            urgency: 'Normal',
            normalizedStatus: status,
            stageLabel:
              status === 'Pending'
                ? 'Menunggu Direksi'
                : status === 'Approved'
                  ? 'Disetujui'
                  : status === 'Paid'
                    ? 'Sudah Cair'
                    : 'Ditolak',
            isPending,
            isHistory,
            canAct: isPending && canUserActOnKasbon(status, user?.role),
            requiresPassphraseOnReject: false,
            rejectionReason: k.rejectionReason,
            pipeline: buildKasbonPipeline(k),
            raw: k,
          });
        }
      }

      // Sort newest first
      unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRecords(unified);
      setCheckedUids(new Set());
    } catch (err: any) {
      console.error('Failed to load approvals:', err);
      setError(err?.response?.data?.msg || 'Gagal memuat daftar persetujuan');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDirectorOrOwner, user?._id, user?.role]);

  useEffect(() => {
    void fetchAllApprovals(false);
  }, [fetchAllApprovals]);

  const counts = useMemo(() => {
    return {
      mine: records.filter((r) => r.isPending && r.canAct).length,
      allPending: records.filter((r) => r.isPending).length,
      history: records.filter((r) => r.isHistory).length,
    };
  }, [records]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((item) => {
      if (activeTab === 'mine' && !(item.isPending && item.canAct)) return false;
      if (activeTab === 'all_pending' && !item.isPending) return false;
      if (activeTab === 'history' && !item.isHistory) return false;
      if (moduleFilter !== 'all' && item.module !== moduleFilter) return false;

      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.requester.toLowerCase().includes(q) ||
        item.projectName.toLowerCase().includes(q) ||
        item.stageLabel.toLowerCase().includes(q)
      );
    });
  }, [records, activeTab, moduleFilter, searchQuery]);

  // Keep selectedUid valid
  useEffect(() => {
    if (filteredItems.length === 0) {
      setSelectedUid(null);
      return;
    }
    if (!selectedUid || !filteredItems.some((it) => it.uid === selectedUid)) {
      setSelectedUid(filteredItems[0].uid);
    }
  }, [filteredItems, selectedUid]);

  const selectedItem = useMemo(
    () => filteredItems.find((it) => it.uid === selectedUid) || null,
    [filteredItems, selectedUid]
  );

  const actionableCheckedItems = useMemo(
    () => filteredItems.filter((it) => checkedUids.has(it.uid) && it.canAct),
    [filteredItems, checkedUids]
  );

  const liveMessage = useMemo(() => {
    if (!selectedItem) return `Menampilkan ${filteredItems.length} pengajuan.`;
    return `Menampilkan ${filteredItems.length} pengajuan. Terpilih: ${selectedItem.title} oleh ${selectedItem.requester}.`;
  }, [filteredItems.length, selectedItem]);

  const openApproveModal = useCallback(
    (items: UnifiedApprovalRecord[]) => {
      const actionable = items.filter((it) => it.isPending && it.canAct);
      if (actionable.length === 0) return;
      setActionError('');
      setApproveModal({ open: true, items: actionable });
    },
    []
  );

  const openRejectModal = useCallback((item: UnifiedApprovalRecord) => {
    if (!item.isPending || !item.canAct) return;
    setActionError('');
    setRejectModal({ open: true, item });
  }, []);

  // Keyboard shortcuts: ArrowUp, ArrowDown, A (Approve), R (Reject)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (approveModal.open || rejectModal.open) return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = filteredItems.findIndex((it) => it.uid === selectedUid);
        if (idx < filteredItems.length - 1) {
          setSelectedUid(filteredItems[idx + 1].uid);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filteredItems.findIndex((it) => it.uid === selectedUid);
        if (idx > 0) {
          setSelectedUid(filteredItems[idx - 1].uid);
        }
      } else if (e.key.toLowerCase() === 'a' && selectedItem?.canAct) {
        e.preventDefault();
        openApproveModal([selectedItem]);
      } else if (e.key.toLowerCase() === 'r' && selectedItem?.canAct) {
        e.preventDefault();
        openRejectModal(selectedItem);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    approveModal.open,
    rejectModal.open,
    filteredItems,
    selectedUid,
    selectedItem,
    openApproveModal,
    openRejectModal,
  ]);

  const handleConfirmApprove = async ({
    passphrase,
    notes,
    unlockSession,
  }: {
    passphrase: string;
    notes: string;
    unlockSession: boolean;
  }) => {
    const effectivePassphrase = sessionUnlocked ? sessionPassphrase : passphrase;
    if (!effectivePassphrase || effectivePassphrase.length < 4) {
      setActionError('Passphrase minimal 4 karakter');
      return;
    }

    setSubmitting(true);
    setActionError('');

    const failures: string[] = [];
    for (const item of approveModal.items) {
      try {
        await executeApprovalAction(item, effectivePassphrase, notes);
      } catch (err: any) {
        const msg = err?.response?.data?.msg || err?.message || 'Gagal memproses';
        failures.push(`${item.title}: ${msg}`);
        if (msg.toLowerCase().includes('passphrase') || msg.toLowerCase().includes('sandi')) {
          lockSession();
          break;
        }
      }
    }

    if (failures.length === 0) {
      if (unlockSession && !sessionUnlocked) {
        setSessionPassphrase(effectivePassphrase);
        setSessionExpiresAt(Date.now() + SESSION_UNLOCK_MS);
        setNowTick(Date.now());
      }
      setApproveModal({ open: false, items: [] });
      await fetchAllApprovals(true);
    } else {
      setActionError(failures[0]);
      await fetchAllApprovals(true);
    }

    setSubmitting(false);
  };

  const handleConfirmReject = async ({
    reason,
    passphrase,
  }: {
    reason: string;
    passphrase: string;
  }) => {
    if (!rejectModal.item) return;
    const effectivePassphrase = sessionUnlocked ? sessionPassphrase : passphrase;
    setSubmitting(true);
    setActionError('');

    try {
      await executeRejectionAction(rejectModal.item, reason, effectivePassphrase);
      setRejectModal({ open: false, item: null });
      await fetchAllApprovals(true);
    } catch (err: any) {
      const msg = err?.response?.data?.msg || err?.message || 'Gagal menolak pengajuan';
      if (msg.toLowerCase().includes('passphrase') || msg.toLowerCase().includes('sandi')) {
        lockSession();
      }
      setActionError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleChecked = (uid: string) => {
    setCheckedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const actionableUids = filteredItems.filter((i) => i.canAct).map((i) => i.uid);
    if (actionableUids.length === 0) return;
    const allSelected = actionableUids.every((uid) => checkedUids.has(uid));
    if (allSelected) {
      setCheckedUids(new Set());
    } else {
      setCheckedUids(new Set(actionableUids));
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-slate-50">
      <AriaLiveRegion message={liveMessage} />

      {/* Top Workbench Bar */}
      <header className="border-b border-slate-200 bg-white px-4 py-3.5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Pusat Persetujuan Terpadu
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Otorisasi Procurement bertingkat, SPKL Lembur, dan Kasbon dalam satu alur kerja.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {sessionUnlocked ? (
              <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                <KeyRound className="h-3.5 w-3.5" />
                <span>Sesi Aktif ({formatRemainingSession()})</span>
                <button
                  type="button"
                  onClick={lockSession}
                  className="ml-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-900 border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                >
                  Kunci
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                Otorisasi Kata Sandi Aktif
              </span>
            )}

            <button
              type="button"
              disabled={refreshing}
              onClick={() => void fetchAllApprovals(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Muat Ulang
            </button>
          </div>
        </div>

        {/* Scope Tabs & Module Filter Row */}
        <div className="mt-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'mine', label: 'Menunggu Saya', count: counts.mine },
                { id: 'all_pending', label: 'Semua Aktif', count: counts.allPending },
                { id: 'history', label: 'Riwayat Keputusan', count: counts.history },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setCheckedUids(new Set());
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.id === 'history' && <History className="h-3.5 w-3.5" />}
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    activeTab === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-white text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'request', label: 'Procurement' },
                  { id: 'spkl', label: 'SPKL' },
                  ...(isDirectorOrOwner ? [{ id: 'kasbon', label: 'Kasbon' }] : []),
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModuleFilter(m.id as ModuleFilter)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    moduleFilter === m.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari item, proyek, pemohon..."
                className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 sm:mx-6">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Master-Detail Split */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Queue Pane */}
        <aside
          className={`flex w-full flex-col border-r border-slate-200 bg-white lg:w-[400px] xl:w-[440px] ${
            mobileDetailOpen ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Batch Toolbar */}
          {activeTab !== 'history' && filteredItems.some((i) => i.canAct) && (
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-2 text-xs">
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
              >
                {filteredItems.filter((i) => i.canAct).every((i) => checkedUids.has(i.uid)) ? (
                  <CheckSquare className="h-4 w-4 text-blue-600" />
                ) : (
                  <Square className="h-4 w-4 text-slate-400" />
                )}
                <span>Pilih Semua yang Dapat Disetujui</span>
              </button>

              {actionableCheckedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => openApproveModal(actionableCheckedItems)}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  Setujui ({actionableCheckedItems.length})
                </button>
              )}
            </div>
          )}

          {/* Queue List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-20 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={Inbox}
                  title="Antrean Bersih"
                  description={
                    activeTab === 'mine'
                      ? 'Tidak ada pengajuan yang menunggu otorisasi Anda saat ini.'
                      : 'Tidak ada data pengajuan yang sesuai dengan filter.'
                  }
                />
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = item.uid === selectedUid;
                const isChecked = checkedUids.has(item.uid);
                const mod = getModuleMeta(item.module);
                const ModIcon = mod.icon;

                return (
                  <div
                    key={item.uid}
                    onClick={() => {
                      setSelectedUid(item.uid);
                      setMobileDetailOpen(true);
                    }}
                    className={`flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    {item.canAct && activeTab !== 'history' && (
                      <button
                        type="button"
                        aria-label={`Pilih ${item.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleChecked(item.uid);
                        }}
                        className="mt-1 shrink-0 text-slate-400 hover:text-blue-600 cursor-pointer"
                      >
                        {isChecked ? (
                          <CheckSquare className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${mod.pillClass}`}
                        >
                          <ModIcon className="h-3 w-3" />
                          {mod.label}
                        </span>
                        <span className="text-[11px] text-slate-400">{item.dateLabel}</span>
                      </div>

                      <p className="mt-1.5 truncate text-sm font-bold text-slate-900">
                        {item.title}
                      </p>

                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="truncate">
                          {item.requester} • {item.projectName}
                        </span>
                        {item.amount > 0 && (
                          <span className="shrink-0 font-semibold text-slate-800">
                            {formatCurrency(item.amount)}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
                            item.normalizedStatus === 'PR_REJECTED' || item.normalizedStatus === 'rejected' || item.normalizedStatus === 'Rejected'
                              ? 'bg-red-50 text-red-700'
                              : item.isHistory
                                ? 'bg-emerald-50 text-emerald-700'
                                : item.canAct
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {item.stageLabel}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-300 lg:hidden" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Inspector Pane */}
        <main
          className={`flex-1 flex-col bg-slate-50 overflow-y-auto ${
            mobileDetailOpen ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!selectedItem ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div className="max-w-sm space-y-2">
                <Inbox className="mx-auto h-10 w-10 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">
                  Pilih Pengajuan untuk Melihat Detail
                </p>
                <p className="text-xs text-slate-500">
                  Gunakan tombol panah ↑/↓ untuk navigasi cepat, A untuk setujui, dan R untuk tolak.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-full flex-col">
              {/* Mobile Back Button */}
              <div className="border-b border-slate-200 bg-white px-4 py-2.5 lg:hidden">
                <button
                  type="button"
                  onClick={() => setMobileDetailOpen(false)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Kembali ke Daftar
                </button>
              </div>

              <div className="flex-1 space-y-5 p-4 sm:p-6">
                {/* Inspector Header Card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          label={getModuleMeta(selectedItem.module).label}
                          variant="primary"
                        />
                        <Badge
                          label={selectedItem.stageLabel}
                          variant={
                            selectedItem.normalizedStatus.includes('REJECT') ||
                            selectedItem.normalizedStatus === 'rejected'
                              ? 'danger'
                              : selectedItem.isHistory
                                ? 'success'
                                : 'warning'
                          }
                        />
                      </div>
                      <h2 className="text-lg font-bold text-slate-900">{selectedItem.title}</h2>
                      <p className="text-xs text-slate-500">{selectedItem.subtitle}</p>
                    </div>

                    {selectedItem.amount > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-left sm:text-right shrink-0">
                        <span className="block text-[11px] font-medium text-slate-500">
                          Total Estimasi / Nominal
                        </span>
                        <span className="text-lg font-bold text-slate-900">
                          {formatCurrency(selectedItem.amount)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Key Metadata */}
                  <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 text-xs sm:grid-cols-3">
                    <div className="flex items-center gap-2 text-slate-600">
                      <User className="h-4 w-4 text-slate-400 shrink-0" />
                      <div>
                        <span className="block text-[10px] uppercase text-slate-400">Pemohon</span>
                        <span className="font-semibold text-slate-800">
                          {selectedItem.requester} ({selectedItem.requesterRole})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-slate-600">
                      <Briefcase className="h-4 w-4 text-slate-400 shrink-0" />
                      <div>
                        <span className="block text-[10px] uppercase text-slate-400">Proyek</span>
                        <span className="font-semibold text-slate-800">{selectedItem.projectName}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-slate-600">
                      <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                      <div>
                        <span className="block text-[10px] uppercase text-slate-400">Tanggal</span>
                        <span className="font-semibold text-slate-800">{selectedItem.dateLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Multi-Stage Pipeline Stepper */}
                <ApprovalPipelineStepper steps={selectedItem.pipeline} />

                {/* Rejection Banner if rejected */}
                {selectedItem.rejectionReason && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                    <p className="font-bold">Alasan Penolakan:</p>
                    <p className="mt-1">{selectedItem.rejectionReason}</p>
                  </div>
                )}

                {/* Module-Specific Details */}
                {selectedItem.module === 'request' && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <FileText className="h-4 w-4 text-slate-400" />
                      Rincian Item Pengadaan
                    </div>

                    {Array.isArray(selectedItem.raw?.items) && selectedItem.raw.items.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500">
                              <th className="py-2 pr-3 font-semibold">Item / Material</th>
                              <th className="py-2 px-3 font-semibold">Qty</th>
                              <th className="py-2 px-3 font-semibold text-right">Estimasi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedItem.raw.items.map((itm: any, idx: number) => (
                              <tr key={idx}>
                                <td className="py-2.5 pr-3">
                                  <p className="font-semibold text-slate-900">{itm.item}</p>
                                  {itm.specifications && (
                                    <p className="text-[11px] text-slate-500">{itm.specifications}</p>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-slate-700">
                                  {itm.qty} {itm.unit || 'unit'}
                                </td>
                                <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                                  {formatCurrency(itm.poTotalAmount || itm.totalBudget || 0)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600">
                        {selectedItem.raw?.item || selectedItem.title} — {selectedItem.raw?.qty || 1}{' '}
                        {selectedItem.raw?.unit || 'unit'}
                      </p>
                    )}

                    {selectedItem.raw?.selectedSupplier?.supplierName && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
                        <span className="font-semibold">Vendor Terpilih: </span>
                        {selectedItem.raw.selectedSupplier.supplierName}
                      </div>
                    )}
                  </div>
                )}

                {selectedItem.module === 'spkl' && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <Clock className="h-4 w-4 text-slate-400" />
                      Detail Pekerja & Lembur (SPKL)
                    </div>
                    <p className="text-xs text-slate-700">
                      {selectedItem.raw?.workDescription || selectedItem.subtitle}
                    </p>
                    {Array.isArray(selectedItem.raw?.workers) && selectedItem.raw.workers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {selectedItem.raw.workers.map((w: any, idx: number) => (
                          <span
                            key={idx}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                          >
                            {w.workerName || w.nama || w.userId?.fullName || 'Pekerja'} (
                            {w.overtimeHours || selectedItem.raw?.overtimeHours || 0} jam)
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedItem.module === 'kasbon' && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <DollarSign className="h-4 w-4 text-slate-400" />
                      Alasan Pengajuan Kasbon
                    </div>
                    <p className="text-sm text-slate-700">
                      {selectedItem.raw?.reason || selectedItem.subtitle}
                    </p>
                  </div>
                )}
              </div>

              {/* Sticky Bottom Action Bar */}
              <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-3.5 sm:px-6">
                {selectedItem.isPending && selectedItem.canAct ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">
                      Pintasan keyboard: <kbd className="rounded border px-1.5 py-0.5 text-[10px]">A</kbd> Setujui •{' '}
                      <kbd className="rounded border px-1.5 py-0.5 text-[10px]">R</kbd> Tolak
                    </p>
                    <div className="flex items-center gap-2.5">
                      <Button
                        type="button"
                        variant="danger"
                        title="Tolak"
                        icon={X}
                        onClick={() => openRejectModal(selectedItem)}
                      />
                      <Button
                        type="button"
                        variant="primary"
                        title="Setujui Tahap Ini"
                        icon={Check}
                        onClick={() => openApproveModal([selectedItem])}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Info className="h-4 w-4 text-slate-400 shrink-0" />
                    <span>
                      {selectedItem.isHistory
                        ? 'Pengajuan ini sudah selesai diproses dan tersimpan dalam riwayat.'
                        : `Tahap "${selectedItem.stageLabel}" menunggu otorisasi dari peran yang berwenang.`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Action Modals */}
      <ApproveConfirmModal
        open={approveModal.open}
        items={approveModal.items}
        sessionUnlocked={sessionUnlocked}
        onClose={() => setApproveModal({ open: false, items: [] })}
        onSubmit={handleConfirmApprove}
        errorMsg={actionError}
        submitting={submitting}
      />

      <RejectReasonModal
        open={rejectModal.open}
        item={rejectModal.item}
        sessionUnlocked={sessionUnlocked}
        onClose={() => setRejectModal({ open: false, item: null })}
        onSubmit={handleConfirmReject}
        errorMsg={actionError}
        submitting={submitting}
      />
    </div>
  );
}
