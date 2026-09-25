import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Check,
  X,
  Inbox,
  AlertCircle,
  DollarSign,
  Shield,
  Lock,
  Search,
  Package,
  ArrowLeft,
  Clock,
  Calendar,
  User,
  Briefcase,
  AlertTriangle,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, Button, EmptyState, AriaLiveRegion } from '../components/shared';
import { ApprovalItem, KasbonItem } from '../types';
import { formatDate as formatWIBDate } from '../utils/date';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface DetailedApprovalItem extends ApprovalItem {
  purpose?: string;
  unit?: string;
  estimatedCost?: number;
}

type UnifiedApprovalItem =
  | { type: 'request'; data: DetailedApprovalItem }
  | { type: 'kasbon'; data: KasbonItem };

export default function Approvals() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<DetailedApprovalItem[]>([]);
  const [kasbons, setKasbons] = useState<KasbonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  // Master-Detail selection & filtering
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'request' | 'kasbon'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // Passphrase confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    type: 'request' | 'kasbon';
    id: string;
  }>({ open: false, type: 'request', id: '' });
  const [passphrase, setPassphrase] = useState('');
  const [passphraseError, setPassphraseError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const confirmModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(confirmModalRef, {
    isActive: confirmModal.open,
    onEscape: () => closeConfirmModal(),
  });

  const isDirectorOrOwner = user?.role === 'director' || user?.role === 'owner';

  useEffect(() => {
    fetchApprovals();
  }, []);

  const fetchApprovals = async () => {
    try {
      setError(null);
      const [requestsRes, ...kasbonRes] = await Promise.all([
        api.get('/requests?status=Pending'),
        ...(isDirectorOrOwner ? [api.get('/kasbon?status=Pending')] : []),
      ]);

      // Map material requests with extra details for inspector pane
      const mapped: DetailedApprovalItem[] = requestsRes.data.map((r: any) => ({
        id: r._id,
        requester: r.requestedBy?.fullName || r.requestedBy || 'Unknown',
        role: r.requestedBy?.role || 'Staff',
        item: r.item,
        qty: r.qty,
        unit: r.unit || 'unit',
        urgency: r.urgency || 'Normal',
        date: r.dateNeeded
          ? formatWIBDate(r.dateNeeded, { day: 'numeric', month: 'short', year: 'numeric' })
          : '-',
        project: r.projectId?.nama || 'General',
        purpose: r.purpose || '',
        estimatedCost: r.estimatedCost || 0,
      }));
      setApprovals(mapped);

      // Map kasbon requests (director/owner only)
      if (isDirectorOrOwner && kasbonRes[0]) {
        const kasbonMapped: KasbonItem[] = kasbonRes[0].data.map((k: any) => ({
          id: k._id,
          requester: k.userId?.fullName || 'Unknown',
          role: k.userId?.role || 'Staff',
          amount: k.amount,
          reason: k.reason || '-',
          date: formatWIBDate(k.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }),
        }));
        setKasbons(kasbonMapped);
      }
    } catch (err: any) {
      console.error('Failed to fetch approvals', err);
      setError(err.response?.data?.msg || t('approvals.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Combine approvals and kasbons into unified list
  const unifiedItems: UnifiedApprovalItem[] = useMemo(() => {
    const list: UnifiedApprovalItem[] = [
      ...approvals.map((a) => ({ type: 'request' as const, data: a })),
      ...kasbons.map((k) => ({ type: 'kasbon' as const, data: k })),
    ];
    return list;
  }, [approvals, kasbons]);

  // Filtered items based on filterType and searchQuery
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return unifiedItems.filter((item) => {
      if (filterType !== 'all' && item.type !== filterType) return false;
      if (!query) return true;
      const name = item.data.requester.toLowerCase();
      const roleName = item.data.role.toLowerCase();
      if (item.type === 'request') {
        return (
          name.includes(query) ||
          roleName.includes(query) ||
          item.data.item.toLowerCase().includes(query) ||
          item.data.project.toLowerCase().includes(query)
        );
      } else {
        return name.includes(query) || roleName.includes(query) || item.data.reason.toLowerCase().includes(query);
      }
    });
  }, [unifiedItems, filterType, searchQuery]);

  // Keep selectedId valid
  useEffect(() => {
    if (filteredItems.length > 0) {
      if (!selectedId || !filteredItems.some((it) => it.data.id === selectedId)) {
        setSelectedId(filteredItems[0].data.id);
      }
    } else {
      setSelectedId(null);
    }
  }, [filteredItems, selectedId]);

  const selectedItem = useMemo(() => {
    return filteredItems.find((it) => it.data.id === selectedId) || null;
  }, [filteredItems, selectedId]);

  const liveMessage = useMemo(() => {
    let msg = `Menampilkan ${filteredItems.length} pengajuan.`;
    if (selectedItem) {
      const name = selectedItem.data.requester;
      const desc = selectedItem.type === 'request' ? selectedItem.data.item : 'Kasbon';
      msg += ` Terpilih: ${desc} oleh ${name}.`;
    }
    return msg;
  }, [filteredItems.length, selectedItem]);

  // Keyboard navigation across items: ArrowUp, ArrowDown, A (Approve), R (Reject)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (confirmModal.open) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = filteredItems.findIndex((it) => it.data.id === selectedId);
        if (idx < filteredItems.length - 1) {
          setSelectedId(filteredItems[idx + 1].data.id);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filteredItems.findIndex((it) => it.data.id === selectedId);
        if (idx > 0) {
          setSelectedId(filteredItems[idx - 1].data.id);
        }
      } else if (e.key.toLowerCase() === 'a' && selectedItem) {
        e.preventDefault();
        openConfirmApprove(selectedItem.data.id, selectedItem.type);
      } else if (e.key.toLowerCase() === 'r' && selectedItem) {
        e.preventDefault();
        handleReject(selectedItem.data.id, selectedItem.type);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmModal.open, filteredItems, selectedId, selectedItem]);

  // Open confirmation modal for approvals
  const openConfirmApprove = (id: string, type: 'request' | 'kasbon') => {
    setConfirmModal({ open: true, type, id });
    setPassphrase('');
    setPassphraseError('');
  };

  const closeConfirmModal = () => {
    setConfirmModal({ open: false, type: 'request', id: '' });
    setPassphrase('');
    setPassphraseError('');
  };

  // Confirm approval with passphrase
  const handleConfirmApprove = async () => {
    if (passphrase.length < 4) return;
    setConfirming(true);
    setPassphraseError('');
    try {
      const { type, id } = confirmModal;
      if (type === 'request') {
        await api.put(`/requests/${id}`, {
          status: 'Approved',
          passphrase,
        });
        setApprovals((prev) => prev.filter((a) => a.id !== id));
      } else {
        await api.put(`/kasbon/${id}`, {
          status: 'Approved',
          passphrase,
        });
        setKasbons((prev) => prev.filter((k) => k.id !== id));
      }
      closeConfirmModal();
    } catch (err: any) {
      const msg = err?.response?.data?.msg || t('approvals.messages.approveFailed');
      setPassphraseError(msg);
    } finally {
      setConfirming(false);
    }
  };

  // Reject without passphrase
  const handleReject = async (id: string, type: 'request' | 'kasbon') => {
    if (!window.confirm('Apakah Anda yakin ingin menolak pengajuan ini?')) return;
    setProcessing(id);
    try {
      if (type === 'request') {
        await api.put(`/requests/${id}`, { status: 'Rejected' });
        setApprovals((prev) => prev.filter((a) => a.id !== id));
      } else {
        await api.put(`/kasbon/${id}`, { status: 'Rejected' });
        setKasbons((prev) => prev.filter((k) => k.id !== id));
      }
    } catch (err) {
      console.error('Failed to reject', err);
    } finally {
      setProcessing(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'High':
        return <Badge label={t('approvals.materialRequests.urgency.urgent')} variant="danger" />;
      case 'Low':
        return <Badge label={t('approvals.materialRequests.urgency.low')} variant="neutral" />;
      default:
        return <Badge label={t('approvals.materialRequests.urgency.normal')} variant="primary" />;
    }
  };

  const totalItems = approvals.length + kasbons.length;

  return (
    <div className="p-6 max-w-7xl mx-auto max-lg:p-4 max-sm:p-3 min-h-[calc(100vh-100px)] flex flex-col">
      <AriaLiveRegion message={liveMessage} />

      {/* Header */}
      <div className="flex justify-between items-center mb-5 max-sm:flex-col max-sm:items-start max-sm:gap-2">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0 max-sm:text-xl flex items-center gap-2">
            <span>{t('approvals.title')}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              {totalItems} Menunggu
            </span>
          </h1>
          <p className="text-xs text-text-muted mt-1 m-0">
            Workstation persetujuan cepat dengan pratinjau instan tanpa bolak-balik modal.
          </p>
        </div>

        {/* Keyboard shortcut legend banner */}
        <div className="hidden md:flex items-center gap-2 text-xs text-text-muted bg-slate-50 border border-border-light px-3 py-1.5 rounded-lg">
          <Sparkles size={13} className="text-primary" />
          <span>Pintasan Cepat:</span>
          <kbd className="px-1.5 py-0.5 bg-white border border-border rounded font-mono text-[10px] font-bold text-text-primary">↑ / ↓</kbd>
          <span>Pilih</span>
          <kbd className="px-1.5 py-0.5 bg-white border border-border rounded font-mono text-[10px] font-bold text-emerald-700">A</kbd>
          <span>Setujui</span>
          <kbd className="px-1.5 py-0.5 bg-white border border-border rounded font-mono text-[10px] font-bold text-rose-700">R</kbd>
          <span>Tolak</span>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-16 gap-3 text-text-muted">
          <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <span className="text-sm font-medium">{t('approvals.loading')}</span>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <EmptyState
          icon={AlertCircle}
          title={t('approvals.errorLoading')}
          description={error}
        />
      )}

      {/* Empty State */}
      {!loading && !error && totalItems === 0 && (
        <EmptyState
          icon={Inbox}
          title={t('approvals.empty.title')}
          description={t('approvals.empty.desc')}
        />
      )}

      {/* Master-Detail Split Workspace */}
      {!loading && !error && totalItems > 0 && (
        <div className="grid grid-cols-12 gap-5 flex-1 items-start">
          {/* ──────────────── Left Pane: Approval Worklist (35% width, 4/12 cols) ──────────────── */}
          <div
            className={`col-span-12 lg:col-span-5 xl:col-span-4 flex flex-col gap-3 ${
              mobileDetailOpen ? 'max-lg:hidden' : 'block'
            }`}
          >
            {/* Filter Tabs & Search */}
            <div className="bg-bg-white rounded-xl border border-border-light p-3 shadow-sm flex flex-col gap-2.5">
              {/* Type Switcher */}
              <div className="grid grid-cols-3 gap-1 bg-bg-secondary p-1 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`py-1.5 rounded-md transition-all ${
                    filterType === 'all'
                      ? 'bg-bg-white text-primary shadow-sm font-bold'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Semua ({totalItems})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('request')}
                  className={`py-1.5 rounded-md transition-all ${
                    filterType === 'request'
                      ? 'bg-bg-white text-primary shadow-sm font-bold'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Barang ({approvals.length})
                </button>
                {isDirectorOrOwner && (
                  <button
                    type="button"
                    onClick={() => setFilterType('kasbon')}
                    className={`py-1.5 rounded-md transition-all ${
                      filterType === 'kasbon'
                        ? 'bg-bg-white text-warning shadow-sm font-bold'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    Kasbon ({kasbons.length})
                  </button>
                )}
              </div>

              {/* Search input */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari pemohon, barang, atau proyek..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-border-light rounded-lg bg-bg-secondary focus:bg-bg-white outline-none focus:border-primary transition-all placeholder:text-text-muted"
                />
              </div>
            </div>

            {/* Worklist Items */}
            <div className="flex flex-col gap-2 max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
              {filteredItems.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-xs bg-bg-white rounded-xl border border-dashed border-border-light">
                  Tidak ada pengajuan yang cocok.
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedId === item.data.id;
                  const isRequest = item.type === 'request';
                  const reqData = isRequest ? (item.data as DetailedApprovalItem) : null;
                  const kasbonData = !isRequest ? (item.data as KasbonItem) : null;

                  return (
                    <div
                      key={item.data.id}
                      onClick={() => {
                        setSelectedId(item.data.id);
                        setMobileDetailOpen(true);
                      }}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-150 flex flex-col gap-2 relative ${
                        isSelected
                          ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary'
                          : 'bg-bg-white border-border-light hover:border-primary/40 hover:bg-slate-50/70'
                      }`}
                    >
                      {/* Top Row: Type & Urgency & Date */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {isRequest ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <Package size={11} />
                              Barang
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <DollarSign size={11} />
                              Kasbon
                            </span>
                          )}
                          {isRequest && reqData?.urgency === 'High' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-50 text-rose-700 border border-rose-200 uppercase">
                              <AlertTriangle size={10} />
                              Urgent
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-text-muted font-medium flex items-center gap-1">
                          <Clock size={10} />
                          {item.data.date}
                        </span>
                      </div>

                      {/* Middle: Title & Requester */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-text-primary m-0 truncate">
                            {isRequest ? reqData?.item : `Kasbon ${formatCurrency(kasbonData?.amount || 0)}`}
                          </h4>
                          <p className="text-xs text-text-secondary m-0 mt-0.5 truncate">
                            {item.data.requester} • <span className="text-text-muted">{item.data.role}</span>
                          </p>
                        </div>
                        <ChevronRight size={16} className={`shrink-0 transition-transform ${isSelected ? 'text-primary translate-x-0.5' : 'text-text-muted'}`} />
                      </div>

                      {/* Bottom contextual detail */}
                      <div className="text-[11px] text-text-muted pt-1 border-t border-border-light/60 flex items-center justify-between">
                        {isRequest ? (
                          <>
                            <span className="truncate max-w-[180px]">Proyek: {reqData?.project}</span>
                            <span className="font-semibold text-text-primary">{reqData?.qty} {reqData?.unit}</span>
                          </>
                        ) : (
                          <>
                            <span className="truncate max-w-[200px]" title={kasbonData?.reason}>Alasan: {kasbonData?.reason}</span>
                            <span className="font-mono font-bold text-amber-700">{formatCurrency(kasbonData?.amount || 0)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ──────────────── Right Pane: Inspector Pane (65% width, 7-8/12 cols) ──────────────── */}
          <div
            className={`col-span-12 lg:col-span-7 xl:col-span-8 flex flex-col gap-4 ${
              mobileDetailOpen ? 'block' : 'max-lg:hidden'
            }`}
          >
            {/* Mobile Back Button */}
            <button
              onClick={() => setMobileDetailOpen(false)}
              className="lg:hidden flex items-center gap-1.5 text-xs font-semibold text-primary mb-2 self-start"
            >
              <ArrowLeft size={16} />
              <span>Kembali ke Daftar Antrean</span>
            </button>

            {selectedItem ? (
              <Card className="p-6 border border-border-light shadow-sm flex flex-col gap-6">
                {/* Header Profile & Quick Badges */}
                <div className="flex items-start justify-between gap-4 pb-5 border-b border-border-light flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-primary/25 border border-primary/20 flex items-center justify-center font-bold text-base text-primary shrink-0">
                      {selectedItem.data.requester?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-text-primary m-0">
                          {selectedItem.data.requester}
                        </h2>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                          {selectedItem.data.role}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted m-0 mt-1 flex items-center gap-1">
                        <Calendar size={12} />
                        Diajukan pada {selectedItem.data.date}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedItem.type === 'request' ? (
                      getUrgencyBadge((selectedItem.data as DetailedApprovalItem).urgency)
                    ) : (
                      <Badge label="Pengajuan Kasbon" variant="warning" />
                    )}
                  </div>
                </div>

                {/* Main Spec Sheet Grid */}
                {selectedItem.type === 'request' ? (
                  (() => {
                    const req = selectedItem.data as DetailedApprovalItem;
                    return (
                      <div className="flex flex-col gap-5">
                        <div>
                          <span className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1">
                            Nama Barang Yang Diajukan
                          </span>
                          <div className="text-2xl font-black text-text-primary tracking-tight">
                            {req.item}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-bg-secondary border border-border-light">
                          <div>
                            <span className="text-xs text-text-muted font-medium block">Jumlah & Satuan</span>
                            <span className="text-base font-bold text-text-primary font-mono tabular-nums">
                              {req.qty} <span className="font-sans text-xs font-normal text-text-muted">{req.unit || 'unit'}</span>
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-text-muted font-medium block">Proyek Tujuan</span>
                            <span className="text-base font-bold text-primary truncate block" title={req.project}>
                              {req.project}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-text-muted font-medium block">Tenggat Butuh</span>
                            <span className="text-base font-bold text-text-primary">
                              {req.date}
                            </span>
                          </div>
                        </div>

                        {req.estimatedCost ? (
                          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex justify-between items-center">
                            <span className="text-sm font-semibold text-primary">Estimasi Total Biaya</span>
                            <span className="text-lg font-black font-mono tabular-nums text-primary">
                              {formatCurrency(req.estimatedCost)}
                            </span>
                          </div>
                        ) : null}

                        {req.purpose && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                              Alasan / Keperluan Lapangan
                            </span>
                            <div className="p-4 rounded-xl bg-slate-50 border border-border-light text-sm text-text-secondary leading-relaxed">
                              {req.purpose}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  (() => {
                    const kasbon = selectedItem.data as KasbonItem;
                    return (
                      <div className="flex flex-col gap-5">
                        <div className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-400/30 flex items-baseline justify-between flex-wrap gap-2">
                          <div>
                            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block">
                              Jumlah Pinjaman Kasbon
                            </span>
                            <span className="text-3xl font-black text-amber-900 font-mono tabular-nums tracking-tight">
                              {formatCurrency(kasbon.amount)}
                            </span>
                          </div>
                          <span className="text-xs px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-300">
                            Potong Gaji Bulanan
                          </span>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                            Alasan Pengajuan Kasbon
                          </span>
                          <div className="p-4 rounded-xl bg-slate-50 border border-border-light text-sm text-text-secondary leading-relaxed font-medium">
                            {kasbon.reason || 'Tidak ada catatan tambahan'}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}

                {/* Action Bar with Keyboard Prompts */}
                <div className="pt-5 border-t border-border-light flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs text-text-muted flex items-center gap-1.5">
                    <Shield size={14} className="text-emerald-600" />
                    <span>Otorisasi membutuhkan passphrase keamanan manajemen.</span>
                  </div>

                  <div className="flex items-center gap-3 ml-auto">
                    <button
                      type="button"
                      onClick={() => handleReject(selectedItem.data.id, selectedItem.type)}
                      disabled={processing === selectedItem.data.id}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-400 text-sm font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      <X size={16} />
                      <span>Tolak Pengajuan</span>
                      <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 bg-rose-200/60 rounded text-[10px] font-mono">R</kbd>
                    </button>

                    <button
                      type="button"
                      onClick={() => openConfirmApprove(selectedItem.data.id, selectedItem.type)}
                      disabled={processing === selectedItem.data.id}
                      className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-bold shadow-md shadow-emerald-600/20 hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <Check size={16} />
                      <span>Setujui (Approve)</span>
                      <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 bg-emerald-800/60 rounded text-[10px] font-mono text-white">A</kbd>
                    </button>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="h-full flex items-center justify-center p-12 text-center text-text-muted bg-bg-white rounded-2xl border border-dashed border-border-light">
                <div>
                  <Inbox size={40} className="mx-auto mb-2 text-text-muted/60" />
                  <p className="text-sm font-semibold">Pilih item pengajuan di sebelah kiri untuk melihat rincian.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Passphrase Confirmation Modal */}
      {confirmModal.open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[1000] p-5" onClick={closeConfirmModal}>
          <div
            ref={confirmModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            className="bg-bg-white rounded-2xl max-w-[420px] w-full shadow-[0_20px_60px_rgba(0,0,0,0.18)] animate-[fade-in-up_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-8 px-6 text-center flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#312E59] to-indigo-600 text-white flex items-center justify-center shadow-[0_6px_20px_rgba(49,46,89,0.3)] mb-1">
                <Lock size={28} />
              </div>
              <h3 id="confirm-modal-title" className="text-[1.15rem] font-bold text-text-primary m-0">
                {t('approvals.confirmModal.title')}
              </h3>
              <p className="text-[0.85rem] text-text-muted m-0 leading-relaxed max-w-[280px]">
                {t('approvals.confirmModal.desc')}
              </p>

              <div className="relative w-full mt-1">
                <Shield size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="password"
                  className={`w-full py-3.5 pl-10 pr-3.5 border-2 border-border rounded-xl text-base text-center text-text-primary bg-bg-secondary outline-none transition-colors tracking-[3px] focus:border-[#312E59] focus:bg-white ${
                    passphraseError ? '!border-red-500 !shadow-[0_0_0_3px_rgba(239,68,68,0.1)]' : ''
                  }`}
                  value={passphrase}
                  onChange={(e) => {
                    setPassphrase(e.target.value);
                    setPassphraseError('');
                  }}
                  placeholder={t('approvals.confirmModal.placeholder')}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && passphrase.length >= 4) handleConfirmApprove();
                  }}
                />
              </div>
              {passphraseError && <p className="text-red-500 text-[0.8rem] m-0 font-medium">{passphraseError}</p>}

              <div className="flex gap-3 w-full mt-1">
                <button
                  type="button"
                  className="flex-1 p-3 border border-border bg-bg-white rounded-lg text-[0.9rem] font-semibold text-text-secondary cursor-pointer transition-colors hover:bg-bg-secondary"
                  onClick={closeConfirmModal}
                >
                  {t('approvals.confirmModal.btnCancel')}
                </button>
                <button
                  type="button"
                  className="flex-1 flex items-center justify-center gap-1.5 p-3 border-none rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-400 text-white text-[0.9rem] font-bold cursor-pointer shadow-[0_3px_12px_rgba(5,150,105,0.3)] transition-all hover:-translate-y-[1px] hover:shadow-[0_5px_16px_rgba(5,150,105,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleConfirmApprove}
                  disabled={passphrase.length < 4 || confirming}
                >
                  {confirming ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>{' '}
                      {t('approvals.confirmModal.btnApproving')}
                    </>
                  ) : (
                    <>
                      <Check size={16} /> {t('approvals.confirmModal.btnApprove')}
                    </>
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
