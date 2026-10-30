import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  HardHat,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Filter,
  BookOpen,
  ClipboardList,
  RotateCcw,
  Check,
  X,
  ChevronRight,
  Info,
  Flame,
  ArrowDownCircle,
  Sparkles,
  Layers,
  Activity,
  FileCheck2,
  Calendar,
  Building2,
  User,
  Shield,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  FileSpreadsheet,
  Camera,
  History,
  MapPin,
  ExternalLink,
  Package,
  Edit2,
  Trash2,
  Scale,
  Boxes,
  FileBadge,
  Globe,
  Sliders,
} from 'lucide-react';
import { PhotoView } from 'react-photo-view';
import { getImageUrl } from '../utils/image';
import CaptureWatermarkModal from '../components/tools/CaptureWatermarkModal';
import PPEHistoryDrawer from '../components/ppe/PPEHistoryDrawer';
import PPEItemModal from '../components/ppe/PPEItemModal';
import { useAuth } from '../contexts/AuthContext';
import {
  getPPEUsages,
  getPPEStats,
  getPPEGuides,
  createPPEUsage,
  returnPPEUsage,
  deletePPEUsage,
  exportPPEUsagesExcel,
  getPPEItems,
  getPPERepoTemplates,
  deletePPEItem,
  type PPEUsageRecord,
  type PPEGuide,
  type PPETypeKey,
  type PPEStats,
  type PPEItem,
  type PPERegulationTemplate,
  type PPECategoryKey,
} from '../api/ppe.api';
import { api } from '../api/client';
import { getUsers } from '../api/iam.api';
import { getWarehouses } from '../api/scm.api';
import { Warehouse } from '../types';

// Visual definition for the 7 standard PPEs
export const PPE_DEFINITIONS: Record<
  PPETypeKey,
  { label: string; shortName: string; icon: React.ElementType; color: string; bg: string; borderColor: string }
> = {
  safety_helmet: {
    label: 'Safety Helmets (Helm Keselamatan)',
    shortName: 'Safety Helmet',
    icon: HardHat,
    color: '#D97706',
    bg: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  safety_boots: {
    label: 'Safety Boots (Sepatu Keselamatan)',
    shortName: 'Safety Boots',
    icon: ShieldCheck,
    color: '#2563EB',
    bg: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  full_body_harness: {
    label: 'Full Body Harness (Sabuk Pengaman Tubuh)',
    shortName: 'Full Body Harness',
    icon: Shield,
    color: '#DC2626',
    bg: '#FEE2E2',
    borderColor: '#FECACA',
  },
  safety_web: {
    label: 'Safety Webs (Jaring Pengaman / Safety Nets)',
    shortName: 'Safety Webs',
    icon: Layers,
    color: '#059669',
    bg: '#D1FAE5',
    borderColor: '#A7F3D0',
  },
  fall_arrester: {
    label: 'Fall Arrester (Penahan Jatuh Otomatis)',
    shortName: 'Fall Arrester',
    icon: ArrowDownCircle,
    color: '#7C3AED',
    bg: '#EDE9FE',
    borderColor: '#DDD6FE',
  },
  welding_helmet: {
    label: 'Welding Protection Helmet (Kedok Las K3)',
    shortName: 'Welding Helmet',
    icon: Flame,
    color: '#EA580C',
    bg: '#FFEDD5',
    borderColor: '#FED7AA',
  },
  leather_gloves: {
    label: 'Leather Gloves (Sarung Tangan Kulit)',
    shortName: 'Leather Gloves',
    icon: Sparkles,
    color: '#0891B2',
    bg: '#CFFAFE',
    borderColor: '#A5F3FC',
  },
};

export default function PPEUsages() {
  const { user } = useAuth();

  // Active view: 'records' | 'catalog' | 'guide'
  const [activeTab, setActiveTab] = useState<'records' | 'catalog' | 'guide'>('records');

  // Data states
  const [usages, setUsages] = useState<PPEUsageRecord[]>([]);
  const [stats, setStats] = useState<PPEStats | null>(null);
  const [guides, setGuides] = useState<PPEGuide[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Master PPE Catalog & Inventory states
  const [ppeItemsList, setPpeItemsList] = useState<PPEItem[]>([]);
  const [repoTemplates, setRepoTemplates] = useState<PPERegulationTemplate[]>([]);
  const [warehousesList, setWarehousesList] = useState<Warehouse[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<string>('all');
  const [catalogCondition, setCatalogCondition] = useState<string>('all');
  const [showPPEItemModal, setShowPPEItemModal] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<PPEItem | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ppeFilter, setPpeFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Selected guide in Guide Tab
  const [selectedGuideType, setSelectedGuideType] = useState<'template' | 'custom'>('template');
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('safety_helmet');
  const [selectedCustomItemId, setSelectedCustomItemId] = useState<string>('');
  const [selectedGuideId, setSelectedGuideId] = useState<PPETypeKey>('safety_helmet');

  // Modals & Drawers
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PPEUsageRecord | null>(null);

  // Watermark Camera Modal states
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [captureTarget, setCaptureTarget] = useState<'create' | 'return'>('create');
  const [capturedCreatePhoto, setCapturedCreatePhoto] = useState<{
    file: File;
    previewUrl: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    capturedAt: string;
    isManualGpsOverride: boolean;
  } | null>(null);

  const [capturedReturnPhoto, setCapturedReturnPhoto] = useState<{
    file: File;
    previewUrl: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    capturedAt: string;
    isManualGpsOverride: boolean;
  } | null>(null);

  // Form states for Create Usage
  const [formWorkerId, setFormWorkerId] = useState('');
  const [formProjectId, setFormProjectId] = useState('');
  const [formPpeItems, setFormPpeItems] = useState<PPETypeKey[]>(['safety_helmet', 'safety_boots']);
  const [formActivityType, setFormActivityType] = useState('Pemasangan Struktur & Pengecoran Lapangan');
  const [formLocation, setFormLocation] = useState('');
  const [formConditionBefore, setFormConditionBefore] = useState('Baik & Layak Pakai');
  const [formNotes, setFormNotes] = useState('');
  const [checklistFit, setChecklistFit] = useState(true);
  const [checklistStraps, setChecklistStraps] = useState(true);
  const [checklistLocks, setChecklistLocks] = useState(true);
  const [checklistStandard, setChecklistStandard] = useState(true);

  // Form state for Return Usage
  const [returnCondition, setReturnCondition] = useState('Baik & Bersih');
  const [returnNotes, setReturnNotes] = useState('');

  // Initial data loading
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [usagesRes, statsRes, guidesRes, usersRes, projectsRes, itemsRes, repoRes, whRes] = await Promise.all([
        getPPEUsages({
          status: statusFilter,
          ppeType: ppeFilter,
          projectId: projectFilter,
          search: searchTerm,
          page: currentPage,
          limit: 15,
        }),
        getPPEStats(),
        getPPEGuides(),
        getUsers({ limit: 100 } as any),
        api.get('/projects').then((r) => r.data).catch(() => []),
        getPPEItems({ all: true }).catch(() => ({ success: false, data: [] })),
        getPPERepoTemplates().catch(() => []),
        getWarehouses({ active: true }).catch(() => []),
      ]);

      setUsages(usagesRes.data || []);
      setTotalPages(usagesRes.pagination?.totalPages || 1);
      setStats(statsRes);
      setGuides(guidesRes || []);
      setUsersList(usersRes.data || usersRes || []);
      setProjectsList(projectsRes.data || projectsRes || []);
      setPpeItemsList(itemsRes.data || []);
      setRepoTemplates(repoRes || []);
      setWarehousesList(whRes || []);
    } catch (error) {
      console.error('Error loading PPE data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, ppeFilter, projectFilter, currentPage]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadData();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPpeFilter('all');
    setProjectFilter('all');
    setCurrentPage(1);
  };

  // Toggle PPE item selection in creation form
  const togglePpeSelection = (key: PPETypeKey) => {
    if (formPpeItems.includes(key)) {
      if (formPpeItems.length > 1) {
        setFormPpeItems(formPpeItems.filter((i) => i !== key));
      }
    } else {
      setFormPpeItems([...formPpeItems, key]);
    }
  };

  // Create usage submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formWorkerId) {
      alert('Pilih pekerja yang menggunakan APD');
      return;
    }
    if (formPpeItems.length === 0) {
      alert('Pilih minimal 1 item APD');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('workerId', formWorkerId);
      if (formProjectId) formData.append('projectId', formProjectId);
      formData.append('ppeItems', JSON.stringify(formPpeItems));
      formData.append('activityType', formActivityType);
      formData.append('conditionBefore', formConditionBefore);
      if (formLocation) formData.append('location', formLocation);
      if (formNotes) formData.append('notes', formNotes);
      formData.append(
        'inspectionChecklist',
        JSON.stringify({
          fitCheck: checklistFit,
          shellStrapsIntact: checklistStraps,
          latchLockSecure: checklistLocks,
          certifiedStandardChecked: checklistStandard,
        })
      );

      if (capturedCreatePhoto) {
        formData.append('photo', capturedCreatePhoto.file);
        if (capturedCreatePhoto.lat !== null && capturedCreatePhoto.lng !== null) {
          formData.append('lat', String(capturedCreatePhoto.lat));
          formData.append('lng', String(capturedCreatePhoto.lng));
        }
        if (capturedCreatePhoto.accuracy !== null) {
          formData.append('accuracy', String(capturedCreatePhoto.accuracy));
        }
        formData.append('capturedAt', capturedCreatePhoto.capturedAt);
        formData.append('isManualGpsOverride', String(capturedCreatePhoto.isManualGpsOverride));
      }

      await createPPEUsage(formData);

      setShowCreateModal(false);
      // Reset form
      setFormWorkerId('');
      setFormProjectId('');
      setFormPpeItems(['safety_helmet', 'safety_boots']);
      setFormNotes('');
      setCapturedCreatePhoto(null);
      await loadData();
    } catch (err: any) {
      console.error('Failed to create PPE usage:', err);
      alert(err.response?.data?.msg || 'Gagal menyimpan catatan penggunaan APD');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Return usage submit
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('conditionAfter', returnCondition);
      if (returnNotes) formData.append('returnNotes', returnNotes);
      formData.append('returnedAt', new Date().toISOString());

      if (capturedReturnPhoto) {
        formData.append('photo', capturedReturnPhoto.file);
        if (capturedReturnPhoto.lat !== null && capturedReturnPhoto.lng !== null) {
          formData.append('lat', String(capturedReturnPhoto.lat));
          formData.append('lng', String(capturedReturnPhoto.lng));
        }
        if (capturedReturnPhoto.accuracy !== null) {
          formData.append('accuracy', String(capturedReturnPhoto.accuracy));
        }
        formData.append('capturedAt', capturedReturnPhoto.capturedAt);
        formData.append('isManualGpsOverride', String(capturedReturnPhoto.isManualGpsOverride));
      }

      await returnPPEUsage(selectedRecord._id, formData);

      setShowReturnModal(false);
      setSelectedRecord(null);
      setReturnNotes('');
      setCapturedReturnPhoto(null);
      await loadData();
    } catch (err: any) {
      console.error('Failed to return PPE:', err);
      alert(err.response?.data?.msg || 'Gagal memverifikasi pengembalian');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete usage
  const handleDelete = async (id: string) => {
    if (!window.confirm('Hapus catatan pemakaian APD ini?')) return;
    try {
      await deletePPEUsage(id);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal menghapus');
    }
  };

  // Delete master PPE item
  const handleDeletePPEItem = async (item: PPEItem) => {
    if (!window.confirm(`Hapus item APD "${item.name}" (${item.code}) dari Master Catalog?`)) return;
    try {
      await deletePPEItem(item._id);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal menghapus item APD');
    }
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportPPEUsagesExcel({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        ppeType: ppeFilter !== 'all' ? ppeFilter : undefined,
        projectId: projectFilter !== 'all' ? projectFilter : undefined,
        search: searchTerm || undefined,
      });
    } catch (err: any) {
      console.error('Failed to export PPE to Excel:', err);
      alert('Gagal mengekspor data APD ke Excel.');
    } finally {
      setIsExporting(false);
    }
  };

  // Filtered PPE items for catalog tab
  const filteredCatalogItems = useMemo(() => {
    return ppeItemsList.filter((item) => {
      const matchSearch =
        !catalogSearch ||
        item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        item.code.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        (item.brand || '').toLowerCase().includes(catalogSearch.toLowerCase());
      const matchCategory = catalogCategory === 'all' || item.category === catalogCategory;
      const matchCondition = catalogCondition === 'all' || item.condition === catalogCondition;
      return matchSearch && matchCategory && matchCondition;
    });
  }, [ppeItemsList, catalogSearch, catalogCategory, catalogCondition]);

  // Active guide selection logic
  const activeSOPItem = useMemo(() => {
    if (selectedGuideType === 'custom') {
      return ppeItemsList.find((i) => i._id === selectedCustomItemId) || null;
    }
    return repoTemplates.find((r) => r.templateId === selectedTemplateKey) || repoTemplates[0] || null;
  }, [selectedGuideType, selectedCustomItemId, selectedTemplateKey, ppeItemsList, repoTemplates]);

  return (
    <div className="flex-1 min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-sm">
              <HardHat className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Alat Pelindung Diri (APD / PPE)
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/40">
                  K3 & HSE
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Manajemen pencatatan pemakaian APD lapangan & Standar Operasional Prosedur (SOP) keselamatan kerja
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              loadData();
            }}
            title="Refresh Data"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 text-slate-700 dark:text-slate-200 font-semibold text-sm shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <FileSpreadsheet className={`w-4 h-4 text-emerald-600 dark:text-emerald-400 ${isExporting ? 'animate-bounce' : ''}`} />
            <span>{isExporting ? 'Mengekspor...' : 'Ekspor Excel (.xlsx)'}</span>
          </button>

          {activeTab === 'catalog' ? (
            <button
              id="btn-add-master-ppe"
              onClick={() => {
                setItemToEdit(null);
                setShowPPEItemModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm shadow-md hover:shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Tambah Item APD
            </button>
          ) : activeTab === 'guide' ? (
            <button
              onClick={() => {
                setItemToEdit(null);
                setShowPPEItemModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm shadow-md hover:shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Kustomisasi SOP APD
            </button>
          ) : (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold text-sm shadow-md hover:shadow-lg shadow-amber-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Catat Pemakaian APD
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 gap-2">
        <button
          id="tab-ppe-records"
          onClick={() => setActiveTab('records')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'records'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Catatan & Riwayat Pemakaian</span>
          {stats && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {stats.totalRecords}
            </span>
          )}
        </button>

        <button
          id="tab-ppe-catalog"
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'catalog'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Katalog & Stok Master APD</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300/30">
            {ppeItemsList.length} Item
          </span>
        </button>

        <button
          id="tab-ppe-guide"
          onClick={() => setActiveTab('guide')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'guide'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Repositori Regulasi & SOP APD</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300/30">
            SNI & OSHA
          </span>
        </button>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-800/80 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Sedang Dipakai
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats?.activeInUse ?? '-'}
            </span>
            <span className="text-xs text-emerald-600 font-semibold">Aktif di Shift</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Personel aktif mengenakan APD di lapangan</p>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Telah Dikembalikan
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats?.returnedCount ?? '-'}
            </span>
            <span className="text-xs text-blue-600 font-semibold">Tuntas Diverifikasi</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Selesai shift & disimpan di lemari APD</p>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Pekerjaan Risiko Tinggi
            </span>
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats?.highRiskCount ?? '-'}
            </span>
            <span className="text-xs text-rose-600 font-semibold">Ketinggian & Las</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Harness, Fall Arrester, & Helm Las</p>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Tingkat Inspeksi K3
            </span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">100%</span>
            <span className="text-xs text-amber-600 font-semibold">Tersertifikasi</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Diperiksa oleh HSE Officer & Manajer K3</p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CATATAN & RIWAYAT PEMAKAIAN APD                                    */}
      {/* ========================================================================= */}
      {activeTab === 'records' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="bg-white dark:bg-slate-800/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
            <form onSubmit={handleSearchSubmit} className="flex flex-col lg:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama pekerja, proyek, lokasi, aktivitas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex flex-wrap sm:flex-nowrap gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="all">Semua Status</option>
                  <option value="in_use">Sedang Dipakai</option>
                  <option value="returned">Telah Dikembalikan</option>
                </select>

                <select
                  value={ppeFilter}
                  onChange={(e) => setPpeFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="all">Semua Jenis APD (7 Item)</option>
                  <option value="safety_helmet">Safety Helmets</option>
                  <option value="safety_boots">Safety Boots</option>
                  <option value="full_body_harness">Full Body Harness</option>
                  <option value="safety_web">Safety Webs</option>
                  <option value="fall_arrester">Fall Arrester</option>
                  <option value="welding_helmet">Welding Helmet</option>
                  <option value="leather_gloves">Leather Gloves</option>
                </select>

                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="all">Semua Proyek</option>
                  {projectsList.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.nama}
                    </option>
                  ))}
                </select>

                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Filter
                </button>

                {(searchTerm || statusFilter !== 'all' || ppeFilter !== 'all' || projectFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                    title="Reset Filter"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Table of Usages */}
          <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-3.5 px-4">Pekerja</th>
                    <th className="py-3.5 px-4">Foto Bukti</th>
                    <th className="py-3.5 px-4">APD Digunakan</th>
                    <th className="py-3.5 px-4">Aktivitas & Proyek</th>
                    <th className="py-3.5 px-4">Waktu Pemakaian</th>
                    <th className="py-3.5 px-4">Status & Kondisi</th>
                    <th className="py-3.5 px-4">Inspektur K3</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                  {usages.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <HardHat className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                        <p className="font-semibold text-slate-600 dark:text-slate-300">Tidak ada catatan pemakaian APD</p>
                        <p className="text-xs text-slate-400 mt-1">Gunakan tombol &apos;Catat Pemakaian APD&apos; di atas untuk membuat catatan baru.</p>
                      </td>
                    </tr>
                  ) : (
                    usages.map((u) => {
                      const isInUse = u.status === 'in_use';
                      const borrowedDate = new Date(u.borrowedAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <tr
                          key={u._id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <span>{u.workerName}</span>
                              {u.workerRole && (
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                  {u.workerRole}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              {typeof u.workerId === 'object' && u.workerId?.position
                                ? u.workerId.position
                                : 'Tenaga Kerja Lapangan'}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {u.photo || u.evidence?.photo ? (
                              <div className="relative group w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 shadow-xs cursor-pointer">
                                <PhotoView src={getImageUrl(u.photo || u.evidence?.photo)}>
                                  <img
                                    src={getImageUrl(u.photo || u.evidence?.photo)}
                                    alt={`Bukti APD ${u.workerName}`}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                  />
                                </PhotoView>
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none text-white text-[10px]">
                                  <Camera className="w-3.5 h-3.5" />
                                </div>
                                {u.evidence?.lat && u.evidence?.lng && (
                                  <div
                                    className="absolute bottom-0 right-0 bg-rose-600 text-white p-0.5 rounded-tl text-[8px]"
                                    title="GPS Coordinates Recorded"
                                  >
                                    <MapPin className="w-2.5 h-2.5" />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 bg-slate-50 dark:bg-slate-900/40">
                                <Camera className="w-4 h-4" />
                                <span className="text-[9px] mt-0.5 font-medium">N/A</span>
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1.5 max-w-xs">
                              {u.ppeItems.map((item) => {
                                const def = PPE_DEFINITIONS[item];
                                if (!def) return null;
                                const Icon = def.icon;
                                return (
                                  <span
                                    key={item}
                                    style={{ color: def.color, backgroundColor: def.bg, borderColor: def.borderColor }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border"
                                  >
                                    <Icon className="w-3 h-3" />
                                    {def.shortName}
                                  </span>
                                );
                              })}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-medium text-slate-800 dark:text-slate-200 line-clamp-1">
                              {u.activityType}
                            </div>
                            <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <Building2 className="w-3 h-3" />
                              <span className="line-clamp-1">{u.projectName || 'Proyek Lapangan'}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {borrowedDate}
                            </div>
                            {u.returnedAt && (
                              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                                Kembali: {new Date(u.returnedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <div>
                              {isInUse ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300/40 animate-pulse">
                                  <Activity className="w-3 h-3" />
                                  Sedang Dipakai
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  Dikembalikan
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                              Kondisi: <span className="font-medium text-slate-700 dark:text-slate-300">{isInUse ? u.conditionBefore : u.conditionAfter}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-xs">
                            <div className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                              <span className="line-clamp-1">{u.inspectorName || 'HSE Manager'}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Checklist K3 Terverifikasi
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isInUse && (
                                <button
                                  onClick={() => {
                                    setSelectedRecord(u);
                                    setShowReturnModal(true);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                                >
                                  Verifikasi Kembali
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setSelectedRecord(u);
                                  setShowHistoryDrawer(true);
                                }}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
                                title="Lihat Riwayat & Log Bukti"
                              >
                                <History className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedRecord(u);
                                  setShowDetailModal(true);
                                }}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                                title="Lihat Rincian"
                              >
                                <Info className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleDelete(u._id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                title="Hapus Catatan"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40"
                  >
                    Sebelumnya
                  </button>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PANDUAN & CARA PENGGUNAAN (SOP 7 APD)                               */}
      {/* ========================================================================= */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Catalog Filter & Action Bar */}
          <div className="bg-white dark:bg-slate-800/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
              <div className="flex-1 flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    id="input-catalog-search"
                    placeholder="Cari kode (HLM-001), nama, atau merek APD..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:w-56">
                  <select
                    value={catalogCategory}
                    onChange={(e) => setCatalogCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="all">Semua Kategori APD</option>
                    <option value="head_protection">Pelindung Kepala</option>
                    <option value="foot_leg_protection">Pelindung Kaki</option>
                    <option value="fall_protection">Perlindungan Ketinggian</option>
                    <option value="eye_face_protection">Pelindung Mata & Muka</option>
                    <option value="hand_arm_protection">Pelindung Tangan</option>
                    <option value="respiratory_protection">Pelindung Pernapasan</option>
                    <option value="hearing_protection">Pelindung Pendengaran</option>
                    <option value="body_protective_clothing">Pelindung Tubuh</option>
                  </select>
                </div>

                <div className="sm:w-48">
                  <select
                    value={catalogCondition}
                    onChange={(e) => setCatalogCondition(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="all">Semua Kondisi</option>
                    <option value="Baik">Baik & Layak Pakai</option>
                    <option value="Cukup Baik">Cukup Baik</option>
                    <option value="Perlu Servis">Perlu Servis / Cek</option>
                    <option value="Rusak / Afkir">Rusak / Afkir</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end lg:self-center">
                {(catalogSearch || catalogCategory !== 'all' || catalogCondition !== 'all') && (
                  <button
                    onClick={() => {
                      setCatalogSearch('');
                      setCatalogCategory('all');
                      setCatalogCondition('all');
                    }}
                    className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Filter
                  </button>
                )}
                <button
                  id="btn-add-item-in-tab"
                  onClick={() => {
                    setItemToEdit(null);
                    setShowPPEItemModal(true);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  Tambah Item
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Menampilkan {filteredCatalogItems.length} dari total {ppeItemsList.length} inventaris APD master</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                Stok Siap Pakai: {ppeItemsList.reduce((acc, curr) => acc + (curr.availableQty || 0), 0)} unit
              </span>
            </div>
          </div>

          {/* Catalog Items Grid */}
          {filteredCatalogItems.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 p-12 rounded-2xl border border-slate-200/80 dark:border-slate-700 text-center">
              <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">Tidak ada item APD ditemukan</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Silakan sesuaikan kata kunci pencarian, ubah filter kategori/kondisi, atau klik tombol Tambah Item APD di atas.
              </p>
              <button
                onClick={() => {
                  setItemToEdit(null);
                  setShowPPEItemModal(true);
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Master APD Baru
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredCatalogItems.map((item) => {
                const isOutOfStock = item.availableQty <= 0;
                return (
                  <div
                    key={item._id}
                    className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
                  >
                    <div>
                      {/* Card Top: Photo & Badges */}
                      <div className="relative h-44 bg-slate-100 dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center overflow-hidden">
                        {item.photo ? (
                          <PhotoView src={getImageUrl(item.photo)}>
                            <img
                              src={getImageUrl(item.photo)}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                            />
                          </PhotoView>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-400 gap-1.5 p-4 text-center">
                            <HardHat className="w-12 h-12 stroke-[1.2] text-slate-300 dark:text-slate-600" />
                            <span className="text-[11px] font-medium">Belum ada foto</span>
                          </div>
                        )}

                        {/* Badges Over Image */}
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-black/75 backdrop-blur-md text-amber-300 border border-white/10 shadow-sm">
                            {item.code}
                          </span>
                        </div>

                        <div className="absolute top-2.5 right-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold shadow-xs ${
                              item.status === 'active'
                                ? 'bg-emerald-500/90 text-white'
                                : 'bg-slate-500/90 text-white'
                            }`}
                          >
                            {item.status === 'active' ? 'Aktif' : 'Non-aktif'}
                          </span>
                        </div>

                        {/* Condition Badge */}
                        <div className="absolute bottom-2.5 left-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold backdrop-blur-md border shadow-xs ${
                              item.condition === 'Baik'
                                ? 'bg-emerald-500/90 text-white border-emerald-400/40'
                                : item.condition === 'Cukup Baik'
                                ? 'bg-blue-500/90 text-white border-blue-400/40'
                                : item.condition === 'Perlu Servis'
                                ? 'bg-amber-500/90 text-white border-amber-400/40'
                                : 'bg-rose-500/90 text-white border-rose-400/40'
                            }`}
                          >
                            {item.condition}
                          </span>
                        </div>
                      </div>

                      {/* Card Content */}
                      <div className="p-4 space-y-3">
                        <div>
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 mb-0.5">
                            <Layers className="w-3 h-3" />
                            <span>{item.categoryLabel || item.category}</span>
                          </div>
                          <h4 className="font-extrabold text-base text-slate-900 dark:text-white leading-tight">
                            {item.name}
                          </h4>
                          {(item.brand || item.modelNumber) && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {item.brand} {item.modelNumber ? `• Mod. ${item.modelNumber}` : ''}
                            </p>
                          )}
                        </div>

                        {/* Stock breakdown pill bar */}
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/50">
                          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                            <span className="text-slate-600 dark:text-slate-300">Stok Inventaris:</span>
                            <span className={isOutOfStock ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}>
                              {item.availableQty} {item.unit} Tersedia
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                            <div className="bg-emerald-100/70 dark:bg-emerald-950/40 p-1 rounded border border-emerald-300/30">
                              <span className="block text-emerald-700 dark:text-emerald-300 font-bold">{item.availableQty}</span>
                              <span className="text-slate-500">Tersedia</span>
                            </div>
                            <div className="bg-amber-100/70 dark:bg-amber-950/40 p-1 rounded border border-amber-300/30">
                              <span className="block text-amber-700 dark:text-amber-300 font-bold">{item.inUseQty}</span>
                              <span className="text-slate-500">Dipakai</span>
                            </div>
                            <div className="bg-rose-100/70 dark:bg-rose-950/40 p-1 rounded border border-rose-300/30">
                              <span className="block text-rose-700 dark:text-rose-300 font-bold">{item.damagedQty || 0}</span>
                              <span className="text-slate-500">Rusak</span>
                            </div>
                            <div className="bg-slate-200/70 dark:bg-slate-800 p-1 rounded border border-slate-300/40">
                              <span className="block text-slate-800 dark:text-slate-200 font-bold">{item.totalQty}</span>
                              <span className="text-slate-500">Total</span>
                            </div>
                          </div>
                        </div>

                        {/* Standards / Regulations Tag */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                            <Scale className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                            <span className="font-semibold text-slate-500">Regulasi:</span>
                            <span className="font-mono text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200/40 truncate">
                              {item.standardRegulation?.indonesian || 'SNI / Permenaker 08/2010'}
                            </span>
                          </div>
                          {item.standardRegulation?.international && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                              <Globe className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                              <span className="font-semibold text-slate-500">Internasional:</span>
                              <span className="font-mono text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-200/40 truncate">
                                {item.standardRegulation.international}
                              </span>
                            </div>
                          )}
                        </div>

                        {(item.warehouseId || item.location) && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <Building2 className="w-3 h-3 text-blue-500 shrink-0" />
                            <span className="truncate">
                              Gudang:{' '}
                              {typeof item.warehouseId === 'object' && item.warehouseId?.name
                                ? `${item.warehouseId.name}${item.binRef ? ` (${item.binRef})` : ''}`
                                : item.location}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="p-3 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2">
                      <button
                        onClick={() => {
                          setSelectedGuideType('custom');
                          setSelectedCustomItemId(item._id);
                          setActiveTab('guide');
                        }}
                        className="px-2.5 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Lihat SOP</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setItemToEdit(item);
                            setShowPPEItemModal(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Edit APD"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePPEItem(item)}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Hapus APD"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: REPOSITORI REGULASI & SOP CARA PENGGUNAAN APD                     */}
      {/* ========================================================================= */}
      {activeTab === 'guide' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Navigation: Segmented Switcher for Standard Repo vs Custom Master PPE */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm space-y-3">
              {/* Segmented Switcher */}
              <div className="flex rounded-xl bg-slate-100 dark:bg-slate-900 p-1">
                <button
                  type="button"
                  id="tab-guide-standard"
                  onClick={() => setSelectedGuideType('template')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    selectedGuideType === 'template'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  10 Standar Regulasi
                </button>
                <button
                  type="button"
                  id="tab-guide-custom"
                  onClick={() => {
                    setSelectedGuideType('custom');
                    if (!selectedCustomItemId && ppeItemsList.length > 0) {
                      setSelectedCustomItemId(ppeItemsList[0]._id);
                    }
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    selectedGuideType === 'custom'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Master APD ({ppeItemsList.length})
                </button>
              </div>

              {/* List of items depending on selected segment */}
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
                {selectedGuideType === 'template' ? (
                  repoTemplates.length > 0 ? (
                    repoTemplates.map((tmpl) => {
                      const isSelected = selectedTemplateKey === tmpl.templateId;
                      return (
                        <button
                          key={tmpl.templateId}
                          onClick={() => setSelectedTemplateKey(tmpl.templateId)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50 dark:bg-indigo-950/40 border-2 border-indigo-500 text-indigo-900 dark:text-indigo-200 shadow-sm'
                              : 'border border-slate-200/70 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                              <ShieldCheck className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="font-semibold text-sm leading-tight">{tmpl.name}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5">{tmpl.categoryLabel}</div>
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                  {tmpl.standardRegulation?.indonesian ? tmpl.standardRegulation.indonesian.split(';')[0] : 'SNI K3'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <ChevronRight
                            className={`w-4 h-4 transition-transform ${isSelected ? 'text-indigo-600 translate-x-1' : 'text-slate-400'}`}
                          />
                        </button>
                      );
                    })
                  ) : (
                    // Fallback to static 7 definitions if templates loading
                    (Object.keys(PPE_DEFINITIONS) as PPETypeKey[]).map((key) => {
                      const def = PPE_DEFINITIONS[key];
                      const Icon = def.icon;
                      const isSelected = selectedGuideId === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedGuideId(key)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500 text-amber-900 dark:text-amber-200 shadow-sm'
                              : 'border border-slate-200/70 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div style={{ color: def.color, backgroundColor: def.bg }} className="p-2 rounded-lg border border-black/5">
                              <Icon className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="font-semibold text-sm leading-tight">{def.shortName}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{def.label}</div>
                            </div>
                          </div>
                          <ChevronRight
                            className={`w-4 h-4 transition-transform ${isSelected ? 'text-amber-600 translate-x-1' : 'text-slate-400'}`}
                          />
                        </button>
                      );
                    })
                  )
                ) : (
                  ppeItemsList.length > 0 ? (
                    ppeItemsList.map((item) => {
                      const isSelected = selectedCustomItemId === item._id;
                      return (
                        <button
                          key={item._id}
                          onClick={() => setSelectedCustomItemId(item._id)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-500 text-blue-900 dark:text-blue-200 shadow-sm'
                              : 'border border-slate-200/70 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              <Package className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">{item.code}</span>
                                <span className="font-semibold text-sm leading-tight">{item.name}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">{item.categoryLabel || item.category}</div>
                              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                                Tersedia: {item.availableQty} {item.unit}
                              </div>
                            </div>
                          </div>
                          <ChevronRight
                            className={`w-4 h-4 transition-transform ${isSelected ? 'text-blue-600 translate-x-1' : 'text-slate-400'}`}
                          />
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Belum ada APD terdaftar di Master Catalog. Tambahkan melalui tab Katalog.
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Quick Safety Hotline Box */}
            <div className="bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent p-5 rounded-2xl border border-indigo-500/20 text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-sm">
                <ShieldCheck className="w-4 h-4" />
                <span>Pusat Regulasi K3 & HSE MTERP</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                Seluruh APD wajib memenuhi standar regulasi Permenakertrans RI No. PER.08/MEN/VII/2010 dan standar teknis SNI / OSHA 29 CFR 1926.
              </p>
              <div className="mt-3 text-xs font-semibold text-slate-800 dark:text-slate-200">
                Pengawasan: Tim HSE & Ahli K3 Konstruksi
              </div>
            </div>
          </div>

          {/* Right Content: Comprehensive How-To Guide & Regulations */}
          <div className="lg:col-span-8">
            {activeSOPItem ? (
              <div className="bg-white dark:bg-slate-800/80 p-6 sm:p-8 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm space-y-8">
                {/* Guide Header */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300/40">
                        {activeSOPItem.standardRegulation?.indonesian ? activeSOPItem.standardRegulation.indonesian.split(';')[0] : 'SNI Bersertifikat'}
                      </span>
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/40">
                        {activeSOPItem.standardRegulation?.international ? activeSOPItem.standardRegulation.international.split(';')[0] : 'OSHA / ANSI'}
                      </span>
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300/40">
                        Tingkat Risiko: {activeSOPItem.standardRegulation?.riskLevel || 'Tinggi'}
                      </span>
                    </div>

                    {selectedGuideType === 'custom' && (
                      <button
                        onClick={() => {
                          setItemToEdit(activeSOPItem as PPEItem);
                          setShowPPEItemModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 text-xs font-semibold cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Edit SOP & Detail APD
                      </button>
                    )}
                  </div>

                  <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                    {(activeSOPItem as any).code ? `[${(activeSOPItem as any).code}] ` : ''}
                    {activeSOPItem.name}
                  </h2>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
                    Kategori: {activeSOPItem.categoryLabel || activeSOPItem.category}
                    {(activeSOPItem as any).brand && ` • Brand: ${(activeSOPItem as any).brand}`}
                  </p>

                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-3 leading-relaxed bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200/60 dark:border-slate-700/40">
                    {activeSOPItem.guide?.description || 'Alat Pelindung Diri standar keselamatan kerja lapangan.'}
                  </p>
                </div>

                {/* Box: Landasan Regulasi K3 (Hukum Indonesia & Standar Internasional) */}
                <div className="bg-gradient-to-br from-blue-50/50 via-slate-50 to-indigo-50/30 dark:from-blue-950/20 dark:via-slate-900/40 dark:to-indigo-950/20 p-5 rounded-2xl border border-blue-200/60 dark:border-blue-900/40 space-y-4">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-sm border-b border-blue-200/60 dark:border-blue-900/40 pb-2">
                    <Scale className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Dasar Hukum Regulasi APD (Indonesia & Internasional)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Indonesian Regulation */}
                    <div className="space-y-2">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <FileBadge className="w-3.5 h-3.5 text-rose-500" />
                        <span>Regulasi Republik Indonesia</span>
                      </div>
                      <div className="space-y-1">
                        {activeSOPItem.standardRegulation?.indonesian?.split(';').map((law: string, i: number) => (
                          <div key={i} className="text-slate-700 dark:text-slate-300 flex items-start gap-1.5">
                            <span className="text-blue-500 font-bold">•</span>
                            <span>{law.trim()}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 italic bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200/40 dark:border-slate-800">
                        Wajib memenuhi ketentuan Permenakertrans RI No. PER.08/MEN/VII/2010 dan sertifikasi SNI resmi.
                      </p>
                    </div>

                    {/* International Regulation */}
                    <div className="space-y-2">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-blue-500" />
                        <span>Standar Internasional (OSHA / ANSI / EN)</span>
                      </div>
                      <div className="space-y-1">
                        {activeSOPItem.standardRegulation?.international?.split(';').map((law: string, i: number) => (
                          <div key={i} className="text-slate-700 dark:text-slate-300 flex items-start gap-1.5">
                            <span className="text-indigo-500 font-bold">•</span>
                            <span>{law.trim()}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 italic bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200/40 dark:border-slate-800">
                        Memenuhi kriteria teknis keselamatan global OSHA 29 CFR 1926 dan standar ANSI/ISEA.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Section 1: Cara Memakai / Wearing Steps */}
                <div>
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-base mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <span>Langkah & Tata Cara Pemakaian yang Benar (SOP)</span>
                  </div>
                  <div className="space-y-3">
                    {activeSOPItem.guide?.wearingSteps?.map((step: string, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/40"
                      >
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 2: Pre-Use Inspection Checklist */}
                <div>
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-base mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">
                    <FileCheck2 className="w-5 h-5 text-blue-500" />
                    <span>Pemeriksaan Fisik Sebelum Dipakai (Pre-Use Inspection Checklist)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeSOPItem.guide?.preUseInspection?.map((check: string, idx: number) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2.5"
                      >
                        <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{check}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 3: Do's and Don'ts */}
                <div>
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-base mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">
                    <Shield className="w-5 h-5 text-amber-500" />
                    <span>Hal yang Wajib (DO&apos;S) & Dilarang (DON&apos;TS)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* DOs */}
                    <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
                      <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs uppercase tracking-wider mb-2.5">
                        <ThumbsUp className="w-4 h-4" />
                        <span>Wajib Dilakukan (DO)</span>
                      </div>
                      <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                        {activeSOPItem.guide?.dosAndDonts?.dos?.map((item: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-emerald-500 font-black">✓</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* DONTs */}
                    <div className="p-4 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
                      <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-bold text-xs uppercase tracking-wider mb-2.5">
                        <ThumbsDown className="w-4 h-4" />
                        <span>Dilarang Keras (DON&apos;T)</span>
                      </div>
                      <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                        {activeSOPItem.guide?.dosAndDonts?.donts?.map((item: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-rose-500 font-black">✗</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Section 4: Maintenance & Cleaning */}
                <div>
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-base mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">
                    <Sparkles className="w-5 h-5 text-indigo-500" />
                    <span>Perawatan, Pembersihan, & Penyimpanan Standar</span>
                  </div>
                  <div className="space-y-2">
                    {activeSOPItem.guide?.maintenance?.map((m: string, idx: number) => (
                      <div
                        key={idx}
                        className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5 bg-slate-50 dark:bg-slate-900/40 p-3 rounded-lg border border-slate-200/50 dark:border-slate-700/40"
                      >
                        <span className="text-indigo-500">•</span>
                        <span>{m}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl text-center text-slate-400">
                Pilih panduan APD dari menu sebelah kiri untuk melihat rincian regulasi & SOP.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: RECORD NEW PPE USAGE                                               */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-2xl w-full p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
                  <HardHat className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">
                    Catat Pemakaian APD Baru
                  </h3>
                  <p className="text-xs text-slate-500">Pemberian wewenang pemakaian APD kepada tenaga kerja</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Worker Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Pilih Pekerja / Tenaga Kerja <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={formWorkerId}
                  onChange={(e) => setFormWorkerId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- Pilih Pekerja --</option>
                  {usersList.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.fullName} ({u.role || 'worker'}) {u.position ? `- ${u.position}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Project Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Proyek Terkait
                </label>
                <select
                  value={formProjectId}
                  onChange={(e) => setFormProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- Pilih Proyek (Opsional) --</option>
                  {projectsList.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.nama}
                    </option>
                  ))}
                </select>
              </div>

              {/* PPE Items Checklist (Dynamic from Master Catalog or 7 Standard) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Item APD yang Digunakan <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {ppeItemsList.length > 0 ? `${ppeItemsList.length} Master APD Terdaftar` : '7 Standar APD'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {ppeItemsList.length > 0 ? (
                    ppeItemsList.map((item) => {
                      const itemKey = (item.templateId || item.code) as PPETypeKey;
                      const isChecked = formPpeItems.includes(itemKey) || formPpeItems.includes(item.code as any);
                      const isOutOfStock = item.availableQty <= 0;

                      return (
                        <div
                          key={item._id}
                          onClick={() => {
                            const keyToToggle = item.code as any;
                            if (formPpeItems.includes(keyToToggle)) {
                              if (formPpeItems.length > 1) {
                                setFormPpeItems(formPpeItems.filter((i) => i !== keyToToggle));
                              }
                            } else {
                              setFormPpeItems([...formPpeItems, keyToToggle]);
                            }
                          }}
                          className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer select-none transition-colors ${
                            isChecked
                              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-900 dark:text-amber-200 shadow-xs'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 ${
                                isChecked
                                  ? 'bg-amber-500 border-amber-500 text-white'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <div className="truncate">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400">{item.code}</span>
                                <span className="text-xs font-semibold truncate">{item.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 block truncate">{item.categoryLabel || item.category}</span>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                              isOutOfStock
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            }`}
                          >
                            {isOutOfStock ? 'Habis' : `${item.availableQty} ${item.unit}`}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    (Object.keys(PPE_DEFINITIONS) as PPETypeKey[]).map((key) => {
                      const def = PPE_DEFINITIONS[key];
                      const isChecked = formPpeItems.includes(key);
                      const Icon = def.icon;

                      return (
                        <div
                          key={key}
                          onClick={() => togglePpeSelection(key)}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-colors ${
                            isChecked
                              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-900 dark:text-amber-200'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border ${
                              isChecked
                                ? 'bg-amber-500 border-amber-500 text-white'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <Icon className="w-4 h-4 text-slate-500" />
                          <span className="text-xs font-semibold">{def.shortName}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Activity & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Jenis Aktivitas Kerja <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Pekerjaan di Ketinggian, Pengelasan"
                    value={formActivityType}
                    onChange={(e) => setFormActivityType(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Lokasi / Elevasi Kerja
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Zona Rafter Elevasi +14m"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Inspection Checklist Verification */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Checklist Verifikasi K3 Sebelum Pakai:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklistFit}
                      onChange={(e) => setChecklistFit(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span>Ukuran & Fitting Pas di Tubuh</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklistStraps}
                      onChange={(e) => setChecklistStraps(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span>Cangkang & Tali Utuh (Tanpa Robek)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklistLocks}
                      onChange={(e) => setChecklistLocks(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span>Pengunci & Buckle Klik Mengunci</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklistStandard}
                      onChange={(e) => setChecklistStandard(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span>Sertifikasi Standar Masih Berlaku</span>
                  </label>
                </div>
              </div>

              {/* Condition & Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Catatan Inspeksi
                </label>
                <input
                  type="text"
                  placeholder="Catatan kondisi awal atau instruksi khusus..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Photo Evidence with Watermark Camera */}
              <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-amber-600" />
                    Foto Bukti Fisik APD (Watermark GPS)
                  </span>
                  {capturedCreatePhoto && (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Foto Siap
                    </span>
                  )}
                </div>

                {capturedCreatePhoto ? (
                  <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="w-16 h-14 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0">
                      <img
                        src={capturedCreatePhoto.previewUrl}
                        alt="Preview APD"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 text-xs space-y-0.5">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-500" />
                        {capturedCreatePhoto.lat && capturedCreatePhoto.lng
                          ? `${capturedCreatePhoto.lat.toFixed(5)}, ${capturedCreatePhoto.lng.toFixed(5)}`
                          : 'GPS Override Disahkan'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(capturedCreatePhoto.capturedAt).toLocaleTimeString('id-ID')} WIB
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCaptureTarget('create');
                          setShowCaptureModal(true);
                        }}
                        className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
                      >
                        Foto Ulang
                      </button>
                      <button
                        type="button"
                        onClick={() => setCapturedCreatePhoto(null)}
                        className="px-2.5 py-1 text-xs rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-medium cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCaptureTarget('create');
                      setShowCaptureModal(true);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 text-amber-900 dark:text-amber-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    Ambil Foto Bukti APD (Watermark GPS)
                  </button>
                )}
                <p className="text-[11px] text-slate-400 leading-tight">
                  Sistem otomatis menyematkan timestamp, nama APD, dan koordinat GPS anti-fraud ke dalam foto.
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Catatan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VERIFY RETURN OF PPE                                               */}
      {/* ========================================================================= */}
      {showReturnModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
              <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">
                Verifikasi Pengembalian APD
              </h3>
              <button
                onClick={() => setShowReturnModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReturnSubmit} className="space-y-4">
              <div className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700">
                <div>
                  Pekerja: <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRecord.workerName}</span>
                </div>
                <div className="mt-1">
                  Aktivitas: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedRecord.activityType}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedRecord.ppeItems.map((item) => (
                    <span key={item} className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-bold">
                      {PPE_DEFINITIONS[item]?.shortName || item}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Kondisi Pasca Pemakaian
                </label>
                <select
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Baik & Bersih">Baik & Bersih</option>
                  <option value="Perlu Pembersihan">Perlu Pembersihan (Lumpur/Debu)</option>
                  <option value="Perlu Servis/Kalibrasi">Perlu Servis / Kalibrasi</option>
                  <option value="Rusak / Afkir">Rusak / Afkir (Tarik dari Peredaran)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Catatan Pengembalian
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Dibersihkan dari spatter las dan disimpan di rak K3..."
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Return Photo Evidence with Watermark Camera */}
              <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-emerald-600" />
                    Foto Bukti Pengembalian (Watermark GPS)
                  </span>
                  {capturedReturnPhoto && (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Foto Siap
                    </span>
                  )}
                </div>

                {capturedReturnPhoto ? (
                  <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="w-16 h-14 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0">
                      <img
                        src={capturedReturnPhoto.previewUrl}
                        alt="Preview Pengembalian APD"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 text-xs space-y-0.5">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-500" />
                        {capturedReturnPhoto.lat && capturedReturnPhoto.lng
                          ? `${capturedReturnPhoto.lat.toFixed(5)}, ${capturedReturnPhoto.lng.toFixed(5)}`
                          : 'GPS Override Disahkan'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(capturedReturnPhoto.capturedAt).toLocaleTimeString('id-ID')} WIB
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCaptureTarget('return');
                          setShowCaptureModal(true);
                        }}
                        className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
                      >
                        Foto Ulang
                      </button>
                      <button
                        type="button"
                        onClick={() => setCapturedReturnPhoto(null)}
                        className="px-2.5 py-1 text-xs rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-medium cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCaptureTarget('return');
                      setShowCaptureModal(true);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Ambil Foto Bukti Pengembalian
                  </button>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Memproses...' : 'Konfirmasi Pengembalian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DETAIL MODAL                                                       */}
      {/* ========================================================================= */}
      {showDetailModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
              <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">
                Rincian Catatan APD
              </h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-700/50 pb-2">
                <span className="text-slate-400">Pekerja:</span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedRecord.workerName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-700/50 pb-2">
                <span className="text-slate-400">Proyek:</span>
                <span className="font-semibold">{selectedRecord.projectName || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-700/50 pb-2">
                <span className="text-slate-400">Lokasi / Elevasi:</span>
                <span>{selectedRecord.location || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-700/50 pb-2">
                <span className="text-slate-400">Aktivitas Kerja:</span>
                <span className="font-semibold">{selectedRecord.activityType}</span>
              </div>
              <div className="border-b border-slate-100 dark:border-slate-700/50 pb-2">
                <span className="text-slate-400 block mb-1">Item APD:</span>
                <div className="flex flex-wrap gap-1">
                  {selectedRecord.ppeItems.map((item) => (
                    <span
                      key={item}
                      className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                    >
                      {PPE_DEFINITIONS[item]?.label || item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-700/50 pb-2">
                <span className="text-slate-400">Inspektur K3:</span>
                <span>{selectedRecord.inspectorName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-700/50 pb-2">
                <span className="text-slate-400">Waktu Pinjam:</span>
                <span>{new Date(selectedRecord.borrowedAt).toLocaleString('id-ID')}</span>
              </div>
              {selectedRecord.returnedAt && (
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-700/50 pb-2">
                  <span className="text-slate-400">Waktu Kembali:</span>
                  <span>{new Date(selectedRecord.returnedAt).toLocaleString('id-ID')}</span>
                </div>
              )}
              {selectedRecord.notes && (
                <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                  <span className="text-slate-400 block mb-0.5">Catatan Awal:</span>
                  <span>{selectedRecord.notes}</span>
                </div>
              )}
              {selectedRecord.returnNotes && (
                <div className="bg-emerald-50 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-200/50 dark:border-emerald-700/50 text-emerald-800 dark:text-emerald-300">
                  <span className="font-bold block mb-0.5">Catatan Pengembalian:</span>
                  <span>{selectedRecord.returnNotes}</span>
                </div>
              )}

              {/* Photo Evidence in Detail Modal */}
              {(selectedRecord.photo || selectedRecord.evidence?.photo) && (
                <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-slate-400 font-medium flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5 text-amber-500" />
                      Bukti Foto APD (Check-out):
                    </span>
                    {selectedRecord.evidence?.lat && selectedRecord.evidence?.lng && (
                      <span className="text-[10px] text-blue-500 flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5 text-rose-500" />
                        {selectedRecord.evidence.lat.toFixed(4)}, {selectedRecord.evidence.lng.toFixed(4)}
                      </span>
                    )}
                  </div>
                  <div className="w-28 h-20 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 cursor-pointer">
                    <PhotoView src={getImageUrl(selectedRecord.photo || selectedRecord.evidence?.photo)}>
                      <img
                        src={getImageUrl(selectedRecord.photo || selectedRecord.evidence?.photo)}
                        alt="Bukti APD"
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                      />
                    </PhotoView>
                  </div>
                </div>
              )}

              {selectedRecord.returnEvidence?.photo && (
                <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-200/50 dark:border-emerald-700/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5 text-emerald-500" />
                      Bukti Foto Pengembalian:
                    </span>
                  </div>
                  <div className="w-28 h-20 rounded-lg overflow-hidden border border-emerald-200 dark:border-emerald-700 bg-slate-900 cursor-pointer">
                    <PhotoView src={getImageUrl(selectedRecord.returnEvidence.photo)}>
                      <img
                        src={getImageUrl(selectedRecord.returnEvidence.photo)}
                        alt="Bukti Pengembalian"
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                      />
                    </PhotoView>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 mt-2">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER: PPE USAGE AUDIT HISTORY & EVIDENCE                                */}
      {/* ========================================================================= */}
      <PPEHistoryDrawer
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        usage={selectedRecord}
      />

      {/* ========================================================================= */}
      {/* MODAL: WATERMARK GPS CAMERA CAPTURE                                       */}
      {/* ========================================================================= */}
      <CaptureWatermarkModal
        isOpen={showCaptureModal}
        onClose={() => setShowCaptureModal(false)}
        toolName={
          captureTarget === 'create'
            ? `APD: ${formPpeItems.map((k) => PPE_DEFINITIONS[k]?.shortName || k).join(', ')}`
            : `Return APD: ${selectedRecord?.workerName || ''}`
        }
        actionLabel={
          captureTarget === 'create'
            ? 'Peminjaman / Check-out APD'
            : 'Pengembalian / Return APD'
        }
        locationName={
          captureTarget === 'create'
            ? formLocation || projectsList.find((p) => p._id === formProjectId)?.nama || 'Site Proyek'
            : selectedRecord?.projectName || selectedRecord?.location || 'Site Proyek'
        }
        onPhotoCaptured={(captured) => {
          if (captureTarget === 'create') {
            setCapturedCreatePhoto(captured);
          } else {
            setCapturedReturnPhoto(captured);
          }
          setShowCaptureModal(false);
        }}
      />
      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT MASTER PPE ITEM (CATALOG & REGULATIONS)                 */}
      {/* ========================================================================= */}
      <PPEItemModal
        isOpen={showPPEItemModal}
        onClose={() => {
          setShowPPEItemModal(false);
          setItemToEdit(null);
        }}
        onSuccess={(_savedItem) => {
          loadData();
        }}
        itemToEdit={itemToEdit}
        repoTemplates={repoTemplates}
        warehouses={warehousesList}
      />
    </div>
  );
}
