import { useState, useEffect, useId, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Receipt,
  Layers,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MapPin,
  Camera,
  Search,
  ArrowLeft,
  Wifi,
  WifiOff,
  Eye,
  X,
  TrendingUp,
  FileCheck,
  Building2,
  Wallet,
  Clock,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSwakelola } from '../contexts/SwakelolaContext';
import { getImageUrl } from '../utils/image';
import { formatDate } from '../utils/date';
import { offlineDb, OfflinePurchaseRecord } from '../services/offlineDb';
import { syncPendingPurchases } from '../services/syncEngine';
import LocalPurchaseForm from '../components/swakelola/LocalPurchaseForm';
import { RABItem, LocalPurchase, ProjectData } from '../types';
import api, { createProjectRABItem } from '../api/api';

export default function ProjectSwakelola() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    rabItems,
    rabSummary,
    localPurchases,
    purchaseSummary,
    isLoading,
    error,
    setProjectId,
    refreshRAB,
    refreshPurchases,
    verifyPurchase,
  } = useSwakelola();

  // Active Project & Projects List
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(id || '');

  // Tabs & Views
  const [activeTab, setActiveTab] = useState<'purchases' | 'rab' | 'offline'>('purchases');
  const [purchaseFilter, setPurchaseFilter] = useState<'ALL' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddPurchaseModal, setShowAddPurchaseModal] = useState(false);
  const [showAddRABModal, setShowAddRABModal] = useState(false);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const [rejectingPurchaseId, setRejectingPurchaseId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Offline Sync State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineRecords, setOfflineRecords] = useState<OfflinePurchaseRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // New RAB Item Form State
  const [rabFormData, setRabFormData] = useState({
    wbsCode: '',
    description: '',
    category: 'material' as const,
    unitOfMeasure: 'Pcs',
    budgetedQuantity: '',
    unitRate: '',
  });
  const [rabSubmitting, setRabSubmitting] = useState(false);
  const [rabError, setRabError] = useState<string | null>(null);

  const formId = useId();

  // Monitor Network Connectivity
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleSyncEvent = (e: any) => {
      setSyncMessage(`Berhasil menyinkronkan ${e.detail.synced} data pembelian offline.`);
      loadOfflineRecords();
      if (selectedProjectId) {
        refreshRAB(selectedProjectId);
        refreshPurchases(selectedProjectId);
      }
      setTimeout(() => setSyncMessage(null), 4000);
    };

    window.addEventListener('swakelola:sync-completed', handleSyncEvent);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('swakelola:sync-completed', handleSyncEvent);
    };
  }, [selectedProjectId, refreshRAB, refreshPurchases]);

  // Load Offline Records from Dexie
  const loadOfflineRecords = useCallback(async () => {
    try {
      const records = await offlineDb.offlinePurchases.toArray();
      setOfflineRecords(records);
    } catch (e) {
      console.error('Failed to load offline records', e);
    }
  }, []);

  useEffect(() => {
    loadOfflineRecords();
  }, [loadOfflineRecords]);

  // Load Projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await api.get('/projects');
        const list = res.data.projects || res.data || [];
        setProjects(list);

        if (!selectedProjectId && list.length > 0) {
          setSelectedProjectId(list[0]._id);
        }
      } catch (err) {
        console.error('Failed to fetch projects', err);
      }
    };
    fetchProjects();
  }, [selectedProjectId]);

  // Sync Selected Project with Context
  useEffect(() => {
    if (selectedProjectId) {
      setProjectId(selectedProjectId);
      refreshRAB(selectedProjectId);
      refreshPurchases(selectedProjectId);

      const found = projects.find((p) => p._id === selectedProjectId);
      if (found) setActiveProject(found);
    }
  }, [selectedProjectId, projects, setProjectId, refreshRAB, refreshPurchases]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await syncPendingPurchases();
      await loadOfflineRecords();
      if (selectedProjectId) {
        await refreshRAB(selectedProjectId);
        await refreshPurchases(selectedProjectId);
      }
      setSyncMessage(
        `Sinkronisasi selesai: ${res.synced} berhasil, ${res.failed} gagal.`
      );
    } catch (e: any) {
      setSyncMessage(`Gagal melakukan sinkronisasi: ${e.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleVerify = async (purchaseId: string) => {
    try {
      await verifyPurchase(purchaseId, 'VERIFIED');
    } catch (err: any) {
      alert(err.response?.data?.msg || err.message || 'Gagal memverifikasi pembelian');
    }
  };

  const handleReject = async () => {
    if (!rejectingPurchaseId) return;
    try {
      await verifyPurchase(rejectingPurchaseId, 'REJECTED', rejectionReason);
      setRejectingPurchaseId(null);
      setRejectionReason('');
    } catch (err: any) {
      alert(err.response?.data?.msg || err.message || 'Gagal menolak pembelian');
    }
  };

  const handleAddRABSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRabError(null);

    const bQty = parseFloat(rabFormData.budgetedQuantity);
    const uRate = parseFloat(rabFormData.unitRate);

    if (!rabFormData.wbsCode || !rabFormData.description || isNaN(bQty) || isNaN(uRate)) {
      setRabError('Mohon isi kode WBS, deskripsi, kuantitas plafon, dan tarif satuan dengan benar.');
      return;
    }

    setRabSubmitting(true);
    try {
      await createProjectRABItem(selectedProjectId, {
        wbsCode: rabFormData.wbsCode.trim(),
        description: rabFormData.description.trim(),
        category: rabFormData.category,
        unitOfMeasure: rabFormData.unitOfMeasure.trim(),
        budgetedQuantity: bQty,
        unitRate: uRate,
      });

      setShowAddRABModal(false);
      setRabFormData({
        wbsCode: '',
        description: '',
        category: 'material',
        unitOfMeasure: 'Pcs',
        budgetedQuantity: '',
        unitRate: '',
      });
      await refreshRAB(selectedProjectId);
    } catch (err: any) {
      setRabError(err.response?.data?.msg || err.message || 'Gagal menambahkan mata anggaran RAB');
    } finally {
      setRabSubmitting(false);
    }
  };

  const canVerify = ['owner', 'director', 'operational_director', 'project_manager', 'site_manager'].includes(
    user?.role || ''
  );

  const filteredPurchases = localPurchases.filter((p) => {
    if (purchaseFilter !== 'ALL' && p.status !== purchaseFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const vNo = p.voucherNumber?.toLowerCase() || '';
      const desc = p.itemDescription?.toLowerCase() || '';
      const supp = p.supplierName?.toLowerCase() || '';
      const buyer = p.purchaserName?.toLowerCase() || '';
      return vNo.includes(q) || desc.includes(q) || supp.includes(q) || buyer.includes(q);
    }
    return true;
  });

  const pendingOfflineCount = offlineRecords.filter((r) => r.syncStatus === 'PENDING').length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Network Offline Status Banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-white px-4 py-2.5 rounded-lg flex items-center justify-between text-sm shadow-sm">
          <div className="flex items-center gap-2 font-medium">
            <WifiOff size={18} />
            <span>Mode Offline Aktif. Anda tetap dapat mencatat kuitansi pembelian UMK. Data tersimpan di memori perangkat.</span>
          </div>
          <span className="text-xs bg-amber-600 px-2.5 py-1 rounded-full font-mono">
            {pendingOfflineCount} Antrean
          </span>
        </div>
      )}

      {syncMessage && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg flex items-center justify-between text-sm shadow-sm">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={18} />
            <span>{syncMessage}</span>
          </div>
          <button onClick={() => setSyncMessage(null)} className="text-white hover:opacity-80">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-light pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <Link to="/projects" className="hover:underline flex items-center gap-1">
              <Building2 size={13} /> Proyek
            </Link>
            <span>/</span>
            {id ? (
              <Link to={`/project/${id}`} className="hover:underline">
                {activeProject?.nama || 'Detail Proyek'}
              </Link>
            ) : (
              <span>Swakelola SCM</span>
            )}
            <span>/</span>
            <span className="font-semibold text-text-primary">Manajemen Plafon & Pembelian Langsung</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => (id ? navigate(`/project/${id}`) : navigate('/projects'))}
              className="p-1.5 rounded-lg bg-bg-secondary hover:bg-border-light text-text-secondary transition-colors"
              title="Kembali"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
                <span>Supply Chain Swakelola (RAB Hard-Cap & UMK)</span>
                {isOnline ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600">
                    <Wifi size={12} /> Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600">
                    <WifiOff size={12} /> Offline
                  </span>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-text-muted mt-0.5">
                Pengawasan pagu anggaran statuter WBS, validasi transaksi belanja langsung, dan audit kuitansi digital
              </p>
            </div>
          </div>
        </div>

        {/* Project Selector & Action */}
        <div className="flex items-center gap-3">
          <div className="min-w-[200px]">
            <select
              aria-label="Pilih Proyek"
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                if (id) navigate(`/project-swakelola/${e.target.value}`);
              }}
              className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs sm:text-sm text-text-primary font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.nama || p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowAddPurchaseModal(true)}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs sm:text-sm font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all whitespace-nowrap"
          >
            <Plus size={16} />
            <span>Catat Pembelian UMK</span>
          </button>
        </div>
      </div>

      {/* Bento Grid KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Plafon RAB */}
        <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Pagu RAB</span>
            <Wallet size={18} className="text-primary" />
          </div>
          <div className="text-lg sm:text-2xl font-mono font-bold text-text-primary tabular-nums">
            Rp {(rabSummary?.totalBudget || 0).toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-text-muted mt-1 flex items-center gap-1">
            <span>{rabSummary?.itemCount || 0} Mata Anggaran WBS</span>
          </div>
        </div>

        {/* Realisasi Belanja */}
        <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Realisasi Pengeluaran</span>
            <TrendingUp size={18} className="text-emerald-600" />
          </div>
          <div className="text-lg sm:text-2xl font-mono font-bold text-emerald-600 tabular-nums">
            Rp {(rabSummary?.totalRealized || 0).toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-text-muted mt-1 flex items-center justify-between">
            <span>Tingkat Serapan:</span>
            <span className="font-bold text-emerald-700 font-mono">
              {rabSummary?.realizationPercent || 0}%
            </span>
          </div>
        </div>

        {/* Sisa Anggaran */}
        <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Sisa Pagu Bebas</span>
            <Receipt size={18} className="text-blue-600" />
          </div>
          <div className="text-lg sm:text-2xl font-mono font-bold text-blue-600 tabular-nums">
            Rp {Math.max(0, (rabSummary?.totalBudget || 0) - (rabSummary?.totalRealized || 0)).toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-text-muted mt-1">
            <span>Saldo aman dari over-budget</span>
          </div>
        </div>

        {/* Antrean Verifikasi & Offline */}
        <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Audit & Sinkronisasi</span>
            <Clock size={18} className="text-amber-500" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-base sm:text-lg font-bold text-amber-600">
                {purchaseSummary?.totalPendingVerification || 0 > 0
                  ? `Rp ${(purchaseSummary?.totalPendingVerification || 0).toLocaleString('id-ID')}`
                  : '0 Pending'}
              </span>
              <p className="text-[11px] text-text-muted mt-0.5">Menunggu Verifikasi PM</p>
            </div>
            {pendingOfflineCount > 0 && (
              <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-[11px] font-bold">
                {pendingOfflineCount} Offline
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-border-light">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('purchases')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'purchases'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Receipt size={16} />
            <span>Buku Pembelian UMK ({localPurchases.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('rab')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'rab'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Layers size={16} />
            <span>Matriks Plafon RAB ({rabItems.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('offline')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'offline'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <WifiOff size={16} />
            <span>Antrean Offline ({offlineRecords.length})</span>
            {pendingOfflineCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                {pendingOfflineCount}
              </span>
            )}
          </button>
        </div>

        <button
          onClick={() => {
            if (selectedProjectId) {
              refreshRAB(selectedProjectId);
              refreshPurchases(selectedProjectId);
              loadOfflineRecords();
            }
          }}
          disabled={isLoading}
          className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-secondary transition-colors"
          title="Perbarui Data"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* TAB CONTENT 1: Buku Pembelian Langsung (UMK) */}
      {activeTab === 'purchases' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-bg-secondary/40 p-3 rounded-lg border border-border-light">
            <div className="flex items-center gap-2">
              {(['ALL', 'SUBMITTED', 'VERIFIED', 'REJECTED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setPurchaseFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    purchaseFilter === st
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-bg-white text-text-secondary hover:bg-bg-secondary border border-border-light'
                  }`}
                >
                  {st === 'ALL' && 'Semua'}
                  {st === 'SUBMITTED' && 'Menunggu Verifikasi'}
                  {st === 'VERIFIED' && 'Terverifikasi'}
                  {st === 'REJECTED' && 'Ditolak'}
                </button>
              ))}
            </div>

            <div className="relative min-w-[240px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Cari voucher, toko, barang..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg-white border border-border-light rounded-lg pl-9 pr-3.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Purchases Table (SAP Fiori Density) */}
          <div className="bg-bg-white border border-border-light rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-bg-secondary/60 border-b border-border-light text-text-muted uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3.5 text-left">No. Voucher</th>
                    <th className="py-3 px-3.5 text-left">Mata Anggaran (WBS)</th>
                    <th className="py-3 px-3.5 text-left">Toko / Supplier</th>
                    <th className="py-3 px-3.5 text-left">Uraian Spesifikasi</th>
                    <th className="py-3 px-3.5 text-right">Volume</th>
                    <th className="py-3 px-3.5 text-right">Harga Satuan</th>
                    <th className="py-3 px-3.5 text-right">Total Riil</th>
                    <th className="py-3 px-3.5 text-center">GPS</th>
                    <th className="py-3 px-3.5 text-center">Nota</th>
                    <th className="py-3 px-3.5 text-center">Status</th>
                    {canVerify && <th className="py-3 px-3.5 text-center">Aksi Verifikasi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light/60">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canVerify ? 11 : 10}
                        className="py-12 text-center text-text-muted text-sm"
                      >
                        Belum ada data pembelian langsung tercatat untuk filter ini.
                      </td>
                    </tr>
                  ) : (
                    filteredPurchases.map((purchase) => {
                      const rabObj = typeof purchase.rabItemId === 'object' ? purchase.rabItemId : null;
                      return (
                        <tr key={purchase._id} className="hover:bg-bg-secondary/30 transition-colors">
                          <td className="py-3 px-3.5 font-mono font-bold text-text-primary whitespace-nowrap">
                            {purchase.voucherNumber}
                          </td>
                          <td className="py-3 px-3.5">
                            <span className="font-mono font-semibold text-primary">
                              {rabObj?.wbsCode || '-'}
                            </span>
                            <p className="text-[11px] text-text-muted truncate max-w-[150px]">
                              {rabObj?.description || '-'}
                            </p>
                          </td>
                          <td className="py-3 px-3.5 font-medium text-text-primary">
                            <div>{purchase.supplierName}</div>
                            <div className="text-[11px] text-text-muted">Oleh: {purchase.purchaserName}</div>
                          </td>
                          <td className="py-3 px-3.5 max-w-[200px]">
                            <p className="text-text-primary font-medium truncate" title={purchase.itemDescription}>
                              {purchase.itemDescription}
                            </p>
                            {purchase.notes && (
                              <p className="text-[11px] text-text-muted italic truncate" title={purchase.notes}>
                                Ket: {purchase.notes}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-medium text-text-primary whitespace-nowrap tabular-nums">
                            {purchase.quantity.toLocaleString('id-ID')} {rabObj?.unitOfMeasure || ''}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-text-secondary whitespace-nowrap tabular-nums">
                            Rp {purchase.unitPrice.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-primary whitespace-nowrap tabular-nums">
                            Rp {purchase.totalPrice.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            {purchase.geotagLocation?.lat && purchase.geotagLocation?.lng ? (
                              <a
                                href={`https://www.google.com/maps?q=${purchase.geotagLocation.lat},${purchase.geotagLocation.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 hover:underline bg-emerald-50 px-2 py-0.5 rounded"
                                title="Lihat Lokasi GPS Toko"
                              >
                                <MapPin size={12} />
                                <span>Peta</span>
                              </a>
                            ) : (
                              <span className="text-[11px] text-text-muted">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            {purchase.receiptPhotoUrl ? (
                              <button
                                onClick={() => setPreviewPhotoUrl(getImageUrl(purchase.receiptPhotoUrl))}
                                className="p-1 rounded bg-bg-secondary hover:bg-border-light text-primary transition-colors"
                                title="Lihat Foto Nota Belanja"
                              >
                                <Camera size={16} />
                              </button>
                            ) : (
                              <span className="text-text-muted text-[11px]">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            {purchase.status === 'VERIFIED' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600">
                                <CheckCircle2 size={12} /> Terverifikasi
                              </span>
                            )}
                            {purchase.status === 'SUBMITTED' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600">
                                <Clock size={12} /> Menunggu Verifikasi
                              </span>
                            )}
                            {purchase.status === 'REJECTED' && (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-600"
                                title={purchase.rejectionReason}
                              >
                                <XCircle size={12} /> Ditolak
                              </span>
                            )}
                            {purchase.status === 'DRAFT' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-500/10 text-gray-600">
                                Draft Offline
                              </span>
                            )}
                          </td>
                          {canVerify && (
                            <td className="py-3 px-3.5 text-center whitespace-nowrap">
                              {purchase.status === 'SUBMITTED' ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleVerify(purchase._id)}
                                    className="p-1.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                    title="Setujui Bukti Belanja"
                                  >
                                    <CheckCircle2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => setRejectingPurchaseId(purchase._id)}
                                    className="p-1.5 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                                    title="Tolak Bukti Belanja"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-text-muted">Selesai</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: Matriks Plafon RAB (Hard-Cap) */}
      {activeTab === 'rab' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-text-primary">Struktur WBS & Plafon Anggaran Statuter</h3>
              <p className="text-xs text-text-muted">
                Batas pengeluaran maksimum per mata anggaran. Transaksi tidak dapat melampaui kuota ini.
              </p>
            </div>
            {['owner', 'director', 'project_manager'].includes(user?.role || '') && (
              <button
                onClick={() => setShowAddRABModal(true)}
                className="px-3.5 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all"
              >
                <Plus size={15} />
                <span>Tambah Mata Anggaran</span>
              </button>
            )}
          </div>

          <div className="bg-bg-white border border-border-light rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-bg-secondary/60 border-b border-border-light text-text-muted uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3.5 text-left">Kode WBS</th>
                    <th className="py-3 px-3.5 text-left">Uraian Pekerjaan / Bahan</th>
                    <th className="py-3 px-3.5 text-left">Kategori</th>
                    <th className="py-3 px-3.5 text-center">Satuan</th>
                    <th className="py-3 px-3.5 text-right">Plafon Volume</th>
                    <th className="py-3 px-3.5 text-right">Tarif Satuan (Rp)</th>
                    <th className="py-3 px-3.5 text-right">Total Plafon Anggaran</th>
                    <th className="py-3 px-3.5 text-right">Volume Realisasi</th>
                    <th className="py-3 px-3.5 text-right">Biaya Realisasi</th>
                    <th className="py-3 px-3.5 text-right">Sisa Kuota Fisik</th>
                    <th className="py-3 px-3.5 text-center min-w-[120px]">Serapan Kuota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light/60">
                  {rabItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-text-muted text-sm">
                        Belum ada item anggaran RAB untuk proyek ini. Silakan tambahkan mata anggaran baru.
                      </td>
                    </tr>
                  ) : (
                    rabItems.map((item) => {
                      const realizedQty = item.realizedQuantity || 0;
                      const budgetedQty = item.budgetedQuantity || 0;
                      const remainingQty = Math.max(0, budgetedQty - realizedQty);
                      const percent = budgetedQty > 0 ? Math.min(100, Math.round((realizedQty / budgetedQty) * 100)) : 0;
                      const isOver = realizedQty > budgetedQty;

                      return (
                        <tr key={item._id} className="hover:bg-bg-secondary/30 transition-colors">
                          <td className="py-3 px-3.5 font-mono font-bold text-primary whitespace-nowrap">
                            {item.wbsCode}
                          </td>
                          <td className="py-3 px-3.5 font-medium text-text-primary max-w-[220px]">
                            {item.description}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span className="capitalize px-2 py-0.5 rounded text-[11px] font-semibold bg-bg-secondary text-text-secondary border border-border-light">
                              {item.category}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-center font-medium text-text-muted whitespace-nowrap">
                            {item.unitOfMeasure}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-semibold text-text-primary whitespace-nowrap tabular-nums">
                            {budgetedQty.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-text-secondary whitespace-nowrap tabular-nums">
                            Rp {(item.unitRate || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-text-primary whitespace-nowrap tabular-nums">
                            Rp {(item.totalBudget || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-600 whitespace-nowrap tabular-nums">
                            {realizedQty.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-600 whitespace-nowrap tabular-nums">
                            Rp {(item.realizedAmount || 0).toLocaleString('id-ID')}
                          </td>
                          <td
                            className={`py-3 px-3.5 text-right font-mono font-bold whitespace-nowrap tabular-nums ${
                              isOver ? 'text-semantic-danger' : 'text-blue-600'
                            }`}
                          >
                            {remainingQty.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-bg-secondary rounded-full overflow-hidden border border-border-light">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isOver ? 'bg-semantic-danger' : percent > 85 ? 'bg-amber-500' : 'bg-primary'
                                  }`}
                                  style={{ width: `${Math.min(100, percent)}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-mono font-bold text-text-muted w-8 text-right">
                                {percent}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: Antrean Sinkronisasi Offline (Dexie.js) */}
      {activeTab === 'offline' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-bg-white p-4 rounded-xl border border-border-light">
            <div>
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <WifiOff size={18} className="text-amber-500" />
                <span>Penyimpanan Offline Lapangan (IndexedDB)</span>
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Voucher pembelian yang dibuat saat sinyal hilang akan disimpan di sini dan dikirim otomatis saat tersambung internet.
              </p>
            </div>

            <button
              onClick={handleManualSync}
              disabled={isSyncing || !isOnline || pendingOfflineCount === 0}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs sm:text-sm font-bold rounded-lg shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSyncing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Sedang Menyinkronkan...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  <span>Sinkronkan Sekarang ({pendingOfflineCount})</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-bg-white border border-border-light rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-bg-secondary/60 border-b border-border-light text-text-muted uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3.5 text-left">Waktu Simpan</th>
                    <th className="py-3 px-3.5 text-left">No. Voucher</th>
                    <th className="py-3 px-3.5 text-left">Supplier / Toko</th>
                    <th className="py-3 px-3.5 text-left">Uraian Barang</th>
                    <th className="py-3 px-3.5 text-right">Total Biaya</th>
                    <th className="py-3 px-3.5 text-center">Status Sync</th>
                    <th className="py-3 px-3.5 text-left">Keterangan / Kesalahan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light/60">
                  {offlineRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-text-muted text-sm">
                        Tidak ada catatan pembelian offline yang tersimpan di browser ini.
                      </td>
                    </tr>
                  ) : (
                    offlineRecords.map((rec) => (
                      <tr key={rec.localUuid} className="hover:bg-bg-secondary/30 transition-colors">
                        <td className="py-3 px-3.5 font-mono text-text-muted whitespace-nowrap">
                          {formatDate(rec.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-3.5 font-mono font-bold text-text-primary whitespace-nowrap">
                          {rec.voucherNumber}
                        </td>
                        <td className="py-3 px-3.5 font-medium text-text-primary">{rec.supplierName}</td>
                        <td className="py-3 px-3.5 text-text-secondary">{rec.itemDescription}</td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-primary whitespace-nowrap tabular-nums">
                          Rp {rec.totalPrice.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          {rec.syncStatus === 'PENDING' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-600">
                              PENDING
                            </span>
                          )}
                          {rec.syncStatus === 'SYNCED' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-600">
                              SYNCED
                            </span>
                          )}
                          {rec.syncStatus === 'ERROR' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-600">
                              ERROR
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-xs text-semantic-danger font-medium">
                          {rec.errorMessage || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Tambah Pembelian Langsung UMK */}
      {showAddPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl my-8">
            <LocalPurchaseForm
              projectId={selectedProjectId}
              rabItems={rabItems}
              onSuccess={() => {
                setShowAddPurchaseModal(false);
                refreshPurchases(selectedProjectId);
                refreshRAB(selectedProjectId);
                loadOfflineRecords();
              }}
              onCancel={() => setShowAddPurchaseModal(false)}
            />
          </div>
        </div>
      )}

      {/* MODAL: Tambah Mata Anggaran RAB Baru */}
      {showAddRABModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-bg-white border border-border-light rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between border-b border-border-light pb-3 mb-4">
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Layers size={18} className="text-primary" />
                <span>Tambah Mata Anggaran RAB Baru</span>
              </h3>
              <button
                onClick={() => setShowAddRABModal(false)}
                className="text-text-muted hover:text-text-primary p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {rabError && (
              <div className="mb-4 p-3 rounded-lg bg-semantic-danger/10 border border-semantic-danger/30 text-semantic-danger text-xs flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0" />
                <span>{rabError}</span>
              </div>
            )}

            <form onSubmit={handleAddRABSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor={`${formId}-wbsCode`}
                  className="block text-xs font-bold text-text-muted uppercase mb-1"
                >
                  Kode WBS / Akun Anggaran <span className="text-semantic-danger">*</span>
                </label>
                <input
                  id={`${formId}-wbsCode`}
                  type="text"
                  placeholder="Contoh: 1.1.01 atau MAT-01"
                  value={rabFormData.wbsCode}
                  onChange={(e) => setRabFormData({ ...rabFormData, wbsCode: e.target.value })}
                  className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor={`${formId}-description`}
                  className="block text-xs font-bold text-text-muted uppercase mb-1"
                >
                  Uraian Pekerjaan / Material <span className="text-semantic-danger">*</span>
                </label>
                <input
                  id={`${formId}-description`}
                  type="text"
                  placeholder="Contoh: Pengadaan Semen Portland 40kg"
                  value={rabFormData.description}
                  onChange={(e) => setRabFormData({ ...rabFormData, description: e.target.value })}
                  className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${formId}-category`}
                    className="block text-xs font-bold text-text-muted uppercase mb-1"
                  >
                    Kategori
                  </label>
                  <select
                    id={`${formId}-category`}
                    value={rabFormData.category}
                    onChange={(e) => setRabFormData({ ...rabFormData, category: e.target.value as any })}
                    className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="material">Material / Bahan</option>
                    <option value="labor">Upah HOK / Tenaga</option>
                    <option value="equipment">Peralatan</option>
                    <option value="subcontractor">Subkontraktor</option>
                    <option value="overhead">Overhead / Umum</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`${formId}-unitOfMeasure`}
                    className="block text-xs font-bold text-text-muted uppercase mb-1"
                  >
                    Satuan Ukur <span className="text-semantic-danger">*</span>
                  </label>
                  <input
                    id={`${formId}-unitOfMeasure`}
                    type="text"
                    placeholder="Contoh: Zak, m3, HOK, Kg"
                    value={rabFormData.unitOfMeasure}
                    onChange={(e) => setRabFormData({ ...rabFormData, unitOfMeasure: e.target.value })}
                    className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${formId}-budgetedQuantity`}
                    className="block text-xs font-bold text-text-muted uppercase mb-1"
                  >
                    Plafon Kuantitas <span className="text-semantic-danger">*</span>
                  </label>
                  <input
                    id={`${formId}-budgetedQuantity`}
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="0.00"
                    value={rabFormData.budgetedQuantity}
                    onChange={(e) => setRabFormData({ ...rabFormData, budgetedQuantity: e.target.value })}
                    className="w-full font-mono text-right bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${formId}-unitRate`}
                    className="block text-xs font-bold text-text-muted uppercase mb-1"
                  >
                    Tarif Satuan (Rp) <span className="text-semantic-danger">*</span>
                  </label>
                  <input
                    id={`${formId}-unitRate`}
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={rabFormData.unitRate}
                    onChange={(e) => setRabFormData({ ...rabFormData, unitRate: e.target.value })}
                    className="w-full font-mono text-right bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>

              {/* Total Plafon Kalkulasi */}
              <div className="p-3 rounded-lg bg-bg-secondary/60 border border-border-light flex justify-between items-center text-xs">
                <span className="text-text-muted font-medium">Total Plafon Anggaran:</span>
                <span className="font-mono font-bold text-primary text-sm">
                  Rp{' '}
                  {(
                    (parseFloat(rabFormData.budgetedQuantity) || 0) *
                    (parseFloat(rabFormData.unitRate) || 0)
                  ).toLocaleString('id-ID')}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-light">
                <button
                  type="button"
                  onClick={() => setShowAddRABModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-bg-secondary rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={rabSubmitting}
                  className="px-5 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-60"
                >
                  {rabSubmitting ? <Loader2 size={14} className="animate-spin" /> : <FileCheck size={14} />}
                  <span>Simpan Mata Anggaran</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Foto Bukti Kuitansi Lightbox */}
      {previewPhotoUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="relative max-w-3xl w-full flex flex-col items-center">
            <button
              onClick={() => setPreviewPhotoUrl(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 p-2"
              title="Tutup Preview"
            >
              <X size={24} />
            </button>
            <img
              src={previewPhotoUrl}
              alt="Bukti Nota Belanja"
              className="max-h-[85vh] rounded-lg shadow-2xl object-contain border border-white/20"
            />
          </div>
        </div>
      )}

      {/* MODAL: Alasan Penolakan Pembelian */}
      {rejectingPurchaseId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-bg-white border border-border-light rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-text-primary mb-2 flex items-center gap-2">
              <XCircle size={18} className="text-rose-600" />
              <span>Tolak Bukti Pembelian UMK</span>
            </h3>
            <p className="text-xs text-text-muted mb-4">
              Berikan alasan penolakan agar personil lapangan dapat memperbaiki atau mengganti bukti nota belanja.
            </p>
            <textarea
              rows={3}
              placeholder="Contoh: Nota tidak terbaca jelas, stempel toko tidak ada, atau barang tidak sesuai spesifikasi..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full bg-bg-white border border-border-light rounded-lg p-3 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingPurchaseId(null)}
                className="px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-bg-secondary rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors"
              >
                Konfirmasi Penolakan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
