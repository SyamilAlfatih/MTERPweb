import React, { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import {
  Search, Wrench, Plus, Package, MapPin, User,
  Calendar, Edit3, Trash2, X, ChevronDown, ChevronUp, ChevronRight, AlertTriangle,
  CheckCircle2, Settings, Archive, Camera, UserX, Warehouse as WarehouseIcon,
  LayoutGrid, List, FileSpreadsheet, Download, UploadCloud, Layers, Filter, Check,
  History, Compass, ShieldCheck, ArrowRightLeft, Building2, PieChart as PieChartIcon
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import api, {
  getToolDashboard,
  createTool,
  updateTool,
  deleteTool,
  bulkDeleteTools,
  bulkUpdateToolCondition,
  bulkRelocateTools,
  exportToolsExcel,
  getWarehouses,
  getMyTools,
  getUsers,
} from '../api/api';
import { Card, Input, Badge, EmptyState, LoadingOverlay, Button } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import { PhotoView } from 'react-photo-view';
import { Tool, Warehouse } from '../types';
import { getImageUrl } from '../utils/image';
import { formatDate as formatWIBDate } from '../utils/date';
import { useFocusTrap } from '../hooks/useFocusTrap';
import ToolsExcelImportModal from '../components/tools/ToolsExcelImportModal';
import ToolMovementModal, { MovementAction } from '../components/tools/ToolMovementModal';
import ToolMovementsDrawer from '../components/tools/ToolMovementsDrawer';
import WarehouseManagementModal from '../components/tools/WarehouseManagementModal';
import ToolsMapView from '../components/tools/ToolsMapView';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'];

const CONDITION_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  'Baik': { color: '#059669', bg: '#D1FAE5', icon: CheckCircle2, label: 'Good' },
  'Maintenance': { color: '#D97706', bg: '#FEF3C7', icon: Settings, label: 'Service' },
  'Rusak': { color: '#DC2626', bg: '#FEE2E2', icon: AlertTriangle, label: 'Damaged' },
};

type FilterType = 'all' | 'Baik' | 'inUse' | 'Maintenance' | 'Rusak';

const FILTERS: { key: FilterType; label: string; icon: any }[] = [
  { key: 'all', label: 'All', icon: Package },
  { key: 'Baik', label: 'Available', icon: CheckCircle2 },
  { key: 'inUse', label: 'In Use', icon: User },
  { key: 'Maintenance', label: 'Service', icon: Settings },
  { key: 'Rusak', label: 'Damaged', icon: AlertTriangle },
];

const EXPORTABLE_TOOL_COLUMNS = [
  { key: 'no', label: 'No', default: true },
  { key: 'nama', label: 'Nama Alat / Mesin', default: true },
  { key: 'kategori', label: 'Kategori', default: true },
  { key: 'kondisi', label: 'Kondisi', default: true },
  { key: 'stok', label: 'Stok', default: true },
  { key: 'satuan', label: 'Satuan', default: true },
  { key: 'lokasi', label: 'Lokasi Penyimpanan', default: true },
  { key: 'status', label: 'Status Penggunaan', default: true },
  { key: 'assignedTo', label: 'Penanggung Jawab', default: true },
  { key: 'project', label: 'Proyek Terkait', default: true },
  { key: 'lastChecked', label: 'Pengecekan Terakhir', default: true },
  { key: 'createdAt', label: 'Tanggal Terdaftar', default: false },
  { key: 'notes', label: 'Catatan', default: false },
];

const DEFAULT_EXPORT_COLUMNS = EXPORTABLE_TOOL_COLUMNS.filter(c => c.default).map(c => c.key);
const COMPACT_EXPORT_COLUMNS = ['no', 'nama', 'kondisi', 'stok', 'lokasi', 'status'];

const EMPTY_FORM = {
  nama: '',
  kategori: '',
  stok: 1,
  satuan: 'unit',
  kondisi: 'Baik',
  lokasi: 'Warehouse',
  warehouseId: '',
  binRef: '',
};

const DENSITY_CONFIG = {
  compact: {
    th: 'py-2 px-3 text-xs',
    td: 'py-2 px-3 text-xs',
  },
  normal: {
    th: 'py-3 px-3.5 text-xs',
    td: 'py-2.5 px-3.5 text-xs',
  },
  comfortable: {
    th: 'py-3.5 px-4 text-xs',
    td: 'py-3.5 px-4 text-sm',
  },
};

type GroupByOption = 'none' | 'lokasi' | 'kategori' | 'kondisi' | 'project' | 'status';

interface ToolGroup {
  key: string;
  label: string;
  tools: Tool[];
  totalStock: number;
  kondisiCount: { baik: number; maintenance: number; rusak: number };
}

export default function Tools() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tools, setTools] = useState<Tool[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<GroupByOption>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'card';
    }
    const saved = typeof window !== 'undefined' ? localStorage.getItem('tools_view_mode') : null;
    if (saved === 'card' || saved === 'table') return saved;
    return 'table';
  });
  const [tableDensity, setTableDensity] = useState<'compact' | 'normal' | 'comfortable'>('normal');
  const [showChartOnMobile, setShowChartOnMobile] = useState(false);

  // Automatically default to Card view whenever viewport is or switches to mobile (<768px)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia('(max-width: 767px)');
    
    // Initial check: if on mobile view, ensure card mode
    if (mql.matches) {
      setViewMode('card');
    }

    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setViewMode('card');
      } else {
        const saved = localStorage.getItem('tools_view_mode');
        setViewMode((saved as 'card' | 'table') || 'table');
      }
    };

    mql.addEventListener('change', handleMediaChange);
    return () => mql.removeEventListener('change', handleMediaChange);
  }, []);

  const handleSetViewMode = (mode: 'card' | 'table') => {
    setViewMode(mode);
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      localStorage.setItem('tools_view_mode', mode);
    }
  };

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'inventory' | 'my_tools' | 'map'>('inventory');

  // Master data states
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [myTools, setMyTools] = useState<Tool[]>([]);
  const [usersList, setUsersList] = useState<Array<{ _id: string; fullName: string; role?: string }>>([]);
  const [projectsList, setProjectsList] = useState<Array<{ _id: string; nama: string; code?: string }>>([]);

  // Movement & Drawer modal states
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [selectedToolForMovement, setSelectedToolForMovement] = useState<Tool | null>(null);
  const [movementDefaultAction, setMovementDefaultAction] = useState<MovementAction>('check_out');

  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [selectedToolForHistory, setSelectedToolForHistory] = useState<Tool | null>(null);

  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Export states
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportScope, setExportScope] = useState<'current' | 'all' | 'selected'>('current');
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>(DEFAULT_EXPORT_COLUMNS);
  const [includeExportHeaders, setIncludeExportHeaders] = useState(true);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Bulk selection & action states
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [bulkActionModal, setBulkActionModal] = useState<{
    isOpen: boolean;
    type: 'condition' | 'relocate' | 'delete' | null;
  }>({ isOpen: false, type: null });
  const [bulkCondition, setBulkCondition] = useState<'Baik' | 'Maintenance' | 'Rusak'>('Baik');
  const [bulkWarehouseId, setBulkWarehouseId] = useState<string>('');
  const [bulkBinLocation, setBulkBinLocation] = useState<string>('');
  const [bulkProjectId, setBulkProjectId] = useState<string>('');
  const [bulkNotes, setBulkNotes] = useState<string>('');
  const [bulkSubmitting, setBulkSubmitting] = useState<boolean>(false);

  const toolModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(toolModalRef, { 
    isActive: showAddModal || !!editingTool, 
    onEscape: () => { setShowAddModal(false); setEditingTool(null); } 
  });

  const exportModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(exportModalRef, {
    isActive: showExportModal,
    onEscape: () => setShowExportModal(false),
  });

  const canManage = user?.role && ['owner', 'director', 'asset_admin'].includes(user.role);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [dashData, whData, myToolsData, usersData, projectsRes] = await Promise.all([
        getToolDashboard(search),
        getWarehouses().catch(() => []),
        getMyTools().catch(() => []),
        getUsers().catch(() => []),
        api.get('/projects').catch(() => ({ data: [] })),
      ]);

      setTools(dashData.tools || []);
      setStats(dashData.stats || null);
      setWarehouses(whData || []);
      setMyTools(myToolsData || []);
      setUsersList(Array.isArray(usersData) ? usersData : usersData?.users || []);
      setProjectsList(Array.isArray(projectsRes.data) ? projectsRes.data : []);
    } catch (err) {
      console.error('Failed to fetch tools data', err);
    } finally {
      setLoading(false);
    }
  };

  const openMovementModal = (tool: Tool, defaultAction: MovementAction = 'check_out') => {
    setSelectedToolForMovement(tool);
    setMovementDefaultAction(defaultAction);
    setMovementModalOpen(true);
  };

  const openHistoryDrawer = (tool: Tool) => {
    setSelectedToolForHistory(tool);
    setHistoryDrawerOpen(true);
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  // Extract unique categories for filter
  const categories = useMemo(() => {
    const set = new Set<string>();
    tools.forEach((t) => {
      if (t.kategori && t.kategori.trim()) set.add(t.kategori.trim());
    });
    return Array.from(set).sort();
  }, [tools]);

  // Filtered tools
  const filteredTools = useMemo(() => {
    return tools.filter((tool) => {
      if (filter === 'inUse' && !tool.assignedTo) return false;
      if (filter === 'Baik' && (tool.kondisi !== 'Baik' || tool.assignedTo)) return false;
      if (['Maintenance', 'Rusak'].includes(filter) && tool.kondisi !== filter) return false;
      if (categoryFilter !== 'all' && tool.kategori !== categoryFilter) return false;
      return true;
    });
  }, [tools, filter, categoryFilter]);

  // Grouped tools structure
  const groupedTools = useMemo((): ToolGroup[] => {
    if (groupBy === 'none') {
      return [{
        key: 'all',
        label: 'Semua Alat',
        tools: filteredTools,
        totalStock: filteredTools.reduce((acc, t) => acc + (Number(t.stok) || 0), 0),
        kondisiCount: {
          baik: filteredTools.filter((t) => t.kondisi === 'Baik').length,
          maintenance: filteredTools.filter((t) => t.kondisi === 'Maintenance').length,
          rusak: filteredTools.filter((t) => t.kondisi === 'Rusak').length,
        },
      }];
    }

    const map = new Map<string, ToolGroup>();

    filteredTools.forEach((tool) => {
      let key = 'Tanpa Data';
      let label = 'Tanpa Data';

      if (groupBy === 'lokasi') {
        key = tool.lokasi?.trim() || 'Tanpa Lokasi (Gudang Belum Disetel)';
        label = key;
      } else if (groupBy === 'kategori') {
        key = tool.kategori?.trim() || 'Tanpa Kategori';
        label = key;
      } else if (groupBy === 'kondisi') {
        key = tool.kondisi || 'Baik';
        label = `Kondisi: ${key}`;
      } else if (groupBy === 'project') {
        key = tool.projectId?.nama || (tool.assignedTo ? 'Ditugaskan ke Personel' : 'Di Gudang (Belum di Proyek)');
        label = key;
      } else if (groupBy === 'status') {
        key = tool.assignedTo ? 'Sedang Digunakan' : 'Tersedia di Gudang';
        label = key;
      }

      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          tools: [],
          totalStock: 0,
          kondisiCount: { baik: 0, maintenance: 0, rusak: 0 },
        });
      }

      const group = map.get(key)!;
      group.tools.push(tool);
      group.totalStock += Number(tool.stok) || 0;
      if (tool.kondisi === 'Baik') group.kondisiCount.baik++;
      else if (tool.kondisi === 'Maintenance') group.kondisiCount.maintenance++;
      else if (tool.kondisi === 'Rusak') group.kondisiCount.rusak++;
    });

    return Array.from(map.values()).sort((a, b) => b.tools.length - a.tools.length);
  }, [filteredTools, groupBy]);

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const expandAllGroups = () => setCollapsedGroups({});
  const collapseAllGroups = () => {
    const allCollapsed: Record<string, boolean> = {};
    groupedTools.forEach((g) => {
      allCollapsed[g.key] = true;
    });
    setCollapsedGroups(allCollapsed);
  };

  // Bulk selection states & memos
  const visibleToolIds = useMemo(() => filteredTools.map((t) => t._id), [filteredTools]);

  const isAllSelected = useMemo(() => {
    return visibleToolIds.length > 0 && visibleToolIds.every((id) => selectedToolIds.includes(id));
  }, [visibleToolIds, selectedToolIds]);

  const isSomeSelected = useMemo(() => {
    return visibleToolIds.some((id) => selectedToolIds.includes(id)) && !isAllSelected;
  }, [visibleToolIds, selectedToolIds, isAllSelected]);

  const handleToggleSelectTool = (id: string, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e && 'stopPropagation' in e) e.stopPropagation();
    setSelectedToolIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedToolIds((prev) => prev.filter((id) => !visibleToolIds.includes(id)));
    } else {
      setSelectedToolIds((prev) => Array.from(new Set([...prev, ...visibleToolIds])));
    }
  };

  const handleClearSelection = () => {
    setSelectedToolIds([]);
  };

  const pieData = stats ? [
    { name: t('tools.filter.available'), value: stats.available || 0 },
    { name: t('tools.filter.inUse'), value: stats.inUse || 0 },
    { name: t('tools.filter.service'), value: stats.maintenance || 0 },
    { name: t('tools.filter.damaged'), value: stats.other || 0 },
  ] : [];

  const getConditionStyle = (kondisi?: string) => {
    const config = CONDITION_CONFIG[kondisi || ''];
    if (!config) {
      return { color: '#94A3B8', bg: '#F1F5F9', icon: Package, label: t('tools.condition.na') };
    }
    const labelMapping: Record<string, string> = {
      'Good': t('tools.condition.good'),
      'Service': t('tools.condition.service'),
      'Damaged': t('tools.condition.damaged')
    };
    return { ...config, label: labelMapping[config.label] };
  };

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return null;
    return formatWIBDate(dateStr, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // CRUD handlers
  const openAddModal = () => {
    const defaultWh = warehouses.find(w => w.isDefault) || warehouses[0];
    setEditingTool(null);
    setFormData({
      ...EMPTY_FORM,
      warehouseId: defaultWh ? defaultWh._id : '',
      lokasi: defaultWh ? defaultWh.name : 'Warehouse',
    });
    setPhoto(null);
    setPhotoPreview(null);
    setShowAddModal(true);
  };

  const openEditModal = (tool: Tool) => {
    const whId = typeof tool.warehouseId === 'object' && tool.warehouseId
      ? tool.warehouseId._id
      : typeof tool.warehouseId === 'string'
      ? tool.warehouseId
      : '';

    setEditingTool(tool);
    setFormData({
      nama: tool.nama,
      kategori: tool.kategori || '',
      stok: tool.stok,
      satuan: tool.satuan,
      kondisi: tool.kondisi || 'Baik',
      lokasi: tool.lokasi || '',
      warehouseId: whId,
      binRef: tool.binRef || '',
    });
    setPhoto(null);
    setPhotoPreview(tool.photo ? getImageUrl(tool.photo) : null);
    setShowAddModal(true);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!formData.nama.trim()) return;
    if (!editingTool && !photo) {
      alert(t('tools.messages.photoRequired'));
      return;
    }
    
    setSubmitting(true);
    try {
      const data = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        data.append(key, value.toString());
      });
      if (photo) {
        data.append('photo', photo);
      }

      if (editingTool) {
        await api.put(`/tools/${editingTool._id}`, data, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await api.post('/tools', data, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      setShowAddModal(false);
      setEditingTool(null);
      setFormData(EMPTY_FORM);
      setPhoto(null);
      setPhotoPreview(null);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || t('tools.messages.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (tool: Tool) => {
    if (!confirm(t('tools.messages.deleteConfirm', { name: tool.nama }))) return;
    try {
      await deleteTool(tool._id);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || t('tools.messages.deleteFailed'));
    }
  };

  const handleBulkExecuteCondition = async () => {
    if (selectedToolIds.length === 0) return;
    setBulkSubmitting(true);
    try {
      await bulkUpdateToolCondition(selectedToolIds, bulkCondition, bulkNotes);
      setToastMessage({
        type: 'success',
        text: `Kondisi ${selectedToolIds.length} alat berhasil diubah ke ${bulkCondition}`,
      });
      setBulkActionModal({ isOpen: false, type: null });
      setBulkNotes('');
      setSelectedToolIds([]);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal mengubah kondisi alat massal');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleBulkExecuteRelocate = async () => {
    if (selectedToolIds.length === 0) return;
    setBulkSubmitting(true);
    try {
      await bulkRelocateTools({
        toolIds: selectedToolIds,
        warehouseId: bulkWarehouseId || undefined,
        binLocation: bulkBinLocation || undefined,
        projectId: bulkProjectId || undefined,
        notes: bulkNotes,
      });
      setToastMessage({
        type: 'success',
        text: `${selectedToolIds.length} alat berhasil direlokasi`,
      });
      setBulkActionModal({ isOpen: false, type: null });
      setBulkWarehouseId('');
      setBulkBinLocation('');
      setBulkProjectId('');
      setBulkNotes('');
      setSelectedToolIds([]);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal merelokasi alat massal');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleBulkExecuteDelete = async () => {
    if (selectedToolIds.length === 0) return;
    setBulkSubmitting(true);
    try {
      await bulkDeleteTools(selectedToolIds);
      setToastMessage({
        type: 'success',
        text: `${selectedToolIds.length} alat berhasil dihapus`,
      });
      setBulkActionModal({ isOpen: false, type: null });
      setSelectedToolIds([]);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal menghapus alat massal');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleBulkExportSelected = async () => {
    if (selectedToolIds.length === 0) return;
    setIsExporting(true);
    try {
      await exportToolsExcel({
        toolIds: selectedToolIds,
        columns: selectedExportColumns,
        headers: includeExportHeaders,
      });
      setToastMessage({
        type: 'success',
        text: `${selectedToolIds.length} alat terpilih berhasil diekspor ke Excel`,
      });
    } catch (err: any) {
      alert('Gagal mengekspor alat terpilih');
    } finally {
      setIsExporting(false);
    }
  };

  // Filter counts
  const filterCounts: Record<FilterType, number> = {
    all: tools.length,
    Baik: tools.filter(t => t.kondisi === 'Baik' && !t.assignedTo).length,
    inUse: tools.filter(t => !!t.assignedTo).length,
    Maintenance: tools.filter(t => t.kondisi === 'Maintenance').length,
    Rusak: tools.filter(t => t.kondisi === 'Rusak').length,
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-5 lg:px-6 py-3.5 sm:py-4 space-y-3.5">
      <LoadingOverlay visible={loading} />

      {/* Global Toast Alert */}
      {toastMessage && (
        <div className="p-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold shadow-xs bg-emerald-50 text-emerald-900 border-emerald-200 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-text-muted hover:text-text-primary p-0.5 cursor-pointer bg-transparent border-none"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-light rounded-lg flex items-center justify-center shadow-primary shrink-0">
            <Wrench size={20} color="white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary m-0 tracking-tight">{t('tools.title')}</h1>
            <p className="text-xs text-text-muted m-0">{t('tools.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 max-sm:w-full max-sm:overflow-x-auto max-sm:pb-1 no-scrollbar">
          {canManage && (
            <button
              type="button"
              onClick={() => setWarehouseModalOpen(true)}
              className="flex items-center gap-1.5 py-2 px-3 bg-cyan-700 hover:bg-cyan-600 active:bg-cyan-800 text-white rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer whitespace-nowrap min-h-[38px] shrink-0"
              title="Kelola Fasilitas Gudang & Lokasi Bin"
            >
              <WarehouseIcon size={15} />
              <span>Kelola Gudang</span>
            </button>
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer whitespace-nowrap min-h-[38px] shrink-0"
              title="Impor Alat dari Excel (.xlsx / .csv)"
            >
              <UploadCloud size={15} />
              <span>Impor Excel</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setExportScope(search || filter !== 'all' ? 'current' : 'all');
              setShowExportModal(true);
            }}
            disabled={tools.length === 0 || isExporting}
            className="flex items-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap min-h-[38px] shrink-0"
            title={t('tools.actions.exportExcel')}
          >
            {isExporting ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FileSpreadsheet size={15} />
            )}
            <span>Export .xlsx</span>
          </button>

          {canManage && (
            <button
              type="button"
              onClick={openAddModal}
              className="flex items-center gap-1.5 py-2 px-3.5 bg-primary hover:bg-primary-dark active:bg-primary text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap min-h-[38px] shrink-0"
            >
              <Plus size={15} />
              <span>{t('tools.actions.add')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Module Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border-light pb-1 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 py-2.5 px-3.5 sm:px-4 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap min-h-[42px] active:scale-95 shrink-0 ${
            activeTab === 'inventory'
              ? 'bg-primary text-white shadow-xs'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
          }`}
        >
          <Package size={15} />
          <span>Semua Inventaris</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              activeTab === 'inventory' ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-text-primary'
            }`}
          >
            {tools.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('my_tools')}
          className={`flex items-center gap-2 py-2.5 px-3.5 sm:px-4 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap min-h-[42px] active:scale-95 shrink-0 ${
            activeTab === 'my_tools'
              ? 'bg-primary text-white shadow-xs'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
          }`}
        >
          <User size={15} />
          <span>Alat Saya (Peminjaman)</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              myTools.length > 0
                ? activeTab === 'my_tools'
                  ? 'bg-emerald-400 text-slate-900'
                  : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : activeTab === 'my_tools'
                ? 'bg-white/25 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-text-primary'
            }`}
          >
            {myTools.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className={`flex items-center gap-2 py-2.5 px-3.5 sm:px-4 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap min-h-[42px] active:scale-95 shrink-0 ${
            activeTab === 'map'
              ? 'bg-primary text-white shadow-xs'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
          }`}
        >
          <Compass size={15} />
          <span>Peta Lokasi & Geofence</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              activeTab === 'map' ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-text-primary'
            }`}
          >
            {warehouses.length} Fasilitas
          </span>
        </button>
      </div>

      {/* Map View Tab */}
      {activeTab === 'map' && (
        <ToolsMapView
          warehouses={warehouses}
          tools={tools}
          onSelectWarehouseFilter={(whName) => {
            setSearch(whName);
            setActiveTab('inventory');
          }}
        />
      )}

      {/* My Tools Tab */}
      {activeTab === 'my_tools' && (
        <div className="space-y-4">
          <div className="p-4 bg-gradient-to-r from-cyan-900/30 to-blue-900/30 rounded-2xl border border-cyan-500/30 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <User size={18} className="text-cyan-400" />
                <span>Alat & Peralatan yang Sedang Anda Pegang</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Alat yang Anda pinjam wajib dikembalikan ke gudang dengan bukti foto ber-watermark GPS saat pekerjaan selesai.
              </p>
            </div>
            <div className="px-3 py-1 rounded-xl bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold text-xs">
              {myTools.length} Alat Aktif
            </div>
          </div>

          {myTools.length === 0 ? (
            <div className="py-16 text-center bg-bg-white rounded-2xl border border-border-light p-6 space-y-2">
              <CheckCircle2 size={42} className="text-emerald-500 mx-auto mb-1" />
              <h3 className="text-base font-bold text-text-primary">Tidak Ada Tanggungan Alat</h3>
              <p className="text-xs text-text-muted max-w-md mx-auto">
                Anda tidak memiliki alat yang sedang dipinjam saat ini. Jika Anda mengambil alat dari gudang, mintalah Supervisor atau Asset Admin untuk melakukan Check-out kepada Anda.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {myTools.map((tool) => (
                <Card key={tool._id} className="p-4 flex flex-col justify-between gap-3 border border-border-light shadow-xs hover:border-cyan-500/40 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-bg-secondary border border-border-light flex items-center justify-center">
                      {tool.photo ? (
                        <PhotoView src={getImageUrl(tool.photo)}>
                          <img src={getImageUrl(tool.photo)} alt={tool.nama} className="w-full h-full object-cover cursor-pointer" />
                        </PhotoView>
                      ) : (
                        <Wrench size={24} className="text-text-muted" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">{tool.kategori || 'Alat'}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {tool.kondisi || 'Baik'}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-text-primary truncate mt-0.5">{tool.nama}</h4>
                      <p className="text-xs text-text-muted mt-1 font-mono">
                        Stok: <span className="font-bold text-text-primary">{tool.stok} {tool.satuan}</span>
                      </p>
                      {tool.binRef && (
                        <p className="text-[11px] text-cyan-600 dark:text-cyan-400 font-semibold mt-0.5 truncate">
                          Rak Asal: {tool.binRef}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions for My Tools */}
                  <div className="pt-3 border-t border-border-light flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openMovementModal(tool, 'return')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      <Camera size={14} />
                      <span>Kembalikan (Return)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openMovementModal(tool, 'hand_over')}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                      title="Oper Alih ke Rekan Teknisi"
                    >
                      <ArrowRightLeft size={14} />
                      <span>Oper Alih</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openHistoryDrawer(tool)}
                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-text-secondary transition-colors cursor-pointer"
                      title="Riwayat Pergerakan"
                    >
                      <History size={15} />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Inventory Tab Content */}
      {activeTab === 'inventory' && (
        <>
          {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-2 max-sm:gap-2">
          <Card className="flex items-center gap-2.5 p-3 !transition-all !duration-150 hover:-translate-y-[2px] hover:shadow-xs">
            <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 max-sm:w-9 max-sm:h-9" style={{ backgroundColor: '#EDE9FE' }}>
              <Package size={20} color="#7C3AED" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-text-primary leading-[1.2] max-sm:text-lg">{stats.total || 0}</span>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px]">{t('tools.stats.total')}</span>
            </div>
          </Card>

          <Card className="flex items-center gap-3 p-4 !transition-all !duration-150 hover:-translate-y-[2px] hover:shadow-lg max-sm:p-3 max-sm:gap-2">
            <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 max-sm:w-9 max-sm:h-9" style={{ backgroundColor: '#D1FAE5' }}>
              <CheckCircle2 size={20} color="#059669" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-text-primary leading-[1.2] max-sm:text-lg" style={{ color: '#059669' }}>{stats.available || 0}</span>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px]">{t('tools.stats.available')}</span>
            </div>
          </Card>

          <Card className="flex items-center gap-3 p-4 !transition-all !duration-150 hover:-translate-y-[2px] hover:shadow-lg max-sm:p-3 max-sm:gap-2">
            <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 max-sm:w-9 max-sm:h-9" style={{ backgroundColor: '#DBEAFE' }}>
              <User size={20} color="#2563EB" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-text-primary leading-[1.2] max-sm:text-lg" style={{ color: '#2563EB' }}>{stats.inUse || 0}</span>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px]">{t('tools.stats.inUse')}</span>
            </div>
          </Card>

          <Card className="flex items-center gap-3 p-4 !transition-all !duration-150 hover:-translate-y-[2px] hover:shadow-lg max-sm:p-3 max-sm:gap-2">
            <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 max-sm:w-9 max-sm:h-9" style={{ backgroundColor: '#FEF3C7' }}>
              <AlertTriangle size={20} color="#D97706" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-text-primary leading-[1.2] max-sm:text-lg" style={{ color: '#D97706' }}>{(stats.maintenance || 0) + (stats.other || 0)}</span>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px]">{t('tools.stats.needsAttention')}</span>
            </div>
          </Card>
        </div>
      )}

      {/* Search + Filters + ERP Grouping Toolbar */}
      <div className="flex flex-col gap-2.5 mb-3.5 bg-bg-white dark:bg-slate-900 p-3 rounded-xl border border-border-light shadow-2xs">
        {/* Top Control Bar: Search + Category + Group By */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder={t('tools.searchPlaceholder')}
              value={search}
              onChangeText={setSearch}
              icon={Search}
              style={{ flex: 1 }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2.5">
            {/* Category Dropdown */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-text-muted hidden md:flex items-center gap-1 shrink-0">
                <Filter size={13} />
                <span>Kategori:</span>
              </span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full min-h-[38px] py-2 px-2.5 text-xs font-semibold rounded-xl border border-border-light bg-bg-secondary text-text-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer truncate"
              >
                <option value="all">Semua Kategori ({tools.length})</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} ({tools.filter((t) => t.kategori === cat).length})
                  </option>
                ))}
              </select>
            </div>

            {/* Group By Selector */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-text-muted hidden md:flex items-center gap-1 shrink-0">
                <Layers size={13} />
                <span>Grup:</span>
              </span>
              <select
                value={groupBy}
                onChange={(e) => {
                  setGroupBy(e.target.value as GroupByOption);
                  setCollapsedGroups({});
                }}
                className="w-full min-h-[38px] py-2 px-2.5 text-xs font-semibold rounded-xl border border-primary/30 bg-primary/[0.04] text-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer truncate"
              >
                <option value="none">Tanpa Grup (Flat)</option>
                <option value="lokasi">Grup: Lokasi / Gudang</option>
                <option value="kategori">Grup: Kategori</option>
                <option value="kondisi">Grup: Kondisi</option>
                <option value="project">Grup: Proyek</option>
                <option value="status">Grup: Status</option>
              </select>
            </div>
          </div>

          {/* Expand / Collapse All (When Grouped) */}
          {groupBy !== 'none' && (
            <div className="flex items-center gap-1.5 shrink-0 max-sm:w-full">
              <button
                type="button"
                onClick={expandAllGroups}
                className="flex-1 sm:flex-initial py-1.5 px-3 min-h-[34px] text-xs font-bold rounded-xl border border-border-light bg-bg-secondary text-text-secondary hover:text-text-primary cursor-pointer active:scale-95 text-center transition-all"
                title="Buka semua grup"
              >
                Buka Semua
              </button>
              <button
                type="button"
                onClick={collapseAllGroups}
                className="flex-1 sm:flex-initial py-1.5 px-3 min-h-[34px] text-xs font-bold rounded-xl border border-border-light bg-bg-secondary text-text-secondary hover:text-text-primary cursor-pointer active:scale-95 text-center transition-all"
                title="Tutup semua grup"
              >
                Tutup Semua
              </button>
            </div>
          )}
        </div>

        {/* Bottom Control Bar: Status Filter Pills & View Mode */}
        <div className="flex items-center justify-between gap-2.5 flex-wrap pt-2 border-t border-border-light/60">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar max-sm:w-full">
            {FILTERS.map(f => {
              const Icon = f.icon;
              const filterLabelMapping: Record<string, string> = {
                'All': t('tools.filter.all'),
                'Available': t('tools.filter.available'),
                'In Use': t('tools.filter.inUse'),
                'Service': t('tools.filter.service'),
                'Damaged': t('tools.filter.damaged'),
              };
              return (
                <button
                  key={f.key}
                  className={`flex items-center gap-1.5 py-2 px-3 border border-border-light rounded-xl bg-bg-secondary/60 text-text-secondary text-xs font-bold cursor-pointer whitespace-nowrap transition-all min-h-[38px] active:scale-95 shrink-0 ${filter === f.key ? '!bg-primary !text-white !border-primary shadow-xs' : 'hover:border-primary-light hover:text-primary'}`}
                  onClick={() => setFilter(f.key)}
                >
                  <Icon size={13} />
                  <span>{filterLabelMapping[f.label]}</span>
                  <span className={`py-[0.5px] px-1.5 rounded-full text-[10px] font-mono font-bold ${filter === f.key ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-text-primary'}`}>{filterCounts[f.key]}</span>
                </button>
              );
            })}
          </div>

          {/* View Mode & Density Switcher */}
          <div className="flex items-center justify-between sm:justify-end gap-2 max-sm:w-full">
            {selectedToolIds.length > 0 && (
              <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-bold animate-in fade-in">
                <span>{selectedToolIds.length} dipilih</span>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="p-0.5 hover:bg-primary/20 rounded text-primary transition-colors cursor-pointer"
                  title="Batalkan pilihan"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <div className="flex items-center gap-1 bg-bg-secondary p-1 rounded-xl border border-border-light">
              <button
                onClick={() => handleSetViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'table'
                    ? 'bg-bg-white text-primary shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <List size={14} />
                <span>Tabel</span>
              </button>
              <button
                onClick={() => handleSetViewMode('card')}
                className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'card'
                    ? 'bg-bg-white text-primary shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <LayoutGrid size={14} />
                <span>Kartu</span>
              </button>
            </div>

            {viewMode === 'table' && (
              <div className="hidden sm:flex items-center gap-1">
                {(['compact', 'normal', 'comfortable'] as const).map((density) => (
                  <button
                    key={density}
                    onClick={() => setTableDensity(density)}
                    className={`px-2 py-1 text-xs font-medium rounded-lg border transition-all ${
                      tableDensity === density
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-border-light bg-bg-white text-text-secondary hover:bg-bg-secondary'
                    }`}
                  >
                    {density === 'compact' ? 'Rapat' : density === 'normal' ? 'Standar' : 'Lapang'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content: Chart + List */}
      <div className="flex gap-5 items-start max-lg:flex-col">
        {/* Donut Chart Side Panel (Collapsible Accordion on Mobile/Tablet) */}
        {stats && (stats.total || 0) > 0 && (
          <div className="w-full lg:w-[260px] lg:shrink-0 lg:sticky lg:top-4">
            {/* Mobile/Tablet Accordion Header */}
            <button
              type="button"
              onClick={() => setShowChartOnMobile(!showChartOnMobile)}
              className="lg:hidden w-full flex items-center justify-between p-3 rounded-xl border border-border-light bg-bg-white dark:bg-slate-900 shadow-2xs text-xs font-bold text-text-primary mb-2 cursor-pointer transition-colors hover:bg-bg-secondary active:scale-[0.99]"
            >
              <div className="flex items-center gap-2">
                <PieChartIcon size={16} className="text-primary" />
                <span>Statistik & Ringkasan Kondisi</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-mono font-bold">
                  {stats.total || 0} Unit
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-text-muted">
                <span className="text-[11px] font-medium">{showChartOnMobile ? 'Tutup' : 'Lihat Grafik'}</span>
                {showChartOnMobile ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </div>
            </button>

            {/* Chart Body: Visible always on desktop (lg:block), collapsible on mobile */}
            <div className={`${showChartOnMobile ? 'block' : 'hidden lg:block'}`}>
              <Card className="w-full p-4 lg:p-5">
                <h3 className="text-sm lg:text-base font-bold text-text-primary m-0 mb-3">{t('tools.overview')}</h3>
                <div className="mx-auto max-w-[200px] lg:max-w-none">
                  <ResponsiveContainer width="100%" height={170}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={46}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-white)',
                          borderRadius: '12px',
                          border: '1px solid var(--border)',
                          boxShadow: 'var(--shadow-md)',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 lg:flex lg:flex-col gap-2 pt-3 border-t border-border-light mt-3">
                  {pieData.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-xs text-text-secondary flex-1 truncate">{entry.name}</span>
                      <span className="text-xs font-bold text-text-primary">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Tool List */}
        <div className="flex-1 min-w-0">
          {filteredTools.length === 0 && !loading ? (
            <EmptyState
              icon={Wrench}
              title={t('tools.empty.title')}
              description={filter !== 'all'
                ? t('tools.empty.filtered')
                : t('tools.empty.default')}
            />
          ) : (
            viewMode === 'table' ? (
              <div className="w-full max-w-full bg-bg-white dark:bg-slate-900 rounded-xl border border-border-light overflow-hidden shadow-2xs">
                {/* 1. Mobile Dense Table (sm:hidden) - ZERO Horizontal Scrolling */}
                <div className="sm:hidden divide-y divide-border-light">
                  {/* Mobile Select-All Bar */}
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between border-b border-border-light">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-text-primary select-none">
                      <input
                        type="checkbox"
                        aria-label="Pilih semua alat"
                        className="w-4 h-4 rounded border-slate-300 text-primary accent-primary cursor-pointer"
                        checked={isAllSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isSomeSelected;
                        }}
                        onChange={handleToggleSelectAll}
                      />
                      <span>Pilih Semua ({filteredTools.length})</span>
                    </label>
                    {selectedToolIds.length > 0 && (
                      <span className="text-[11px] font-bold text-primary px-2 py-0.5 rounded-full bg-primary/10">
                        {selectedToolIds.length} terpilih
                      </span>
                    )}
                  </div>

                  {groupedTools.map((group) => {
                    const isCollapsed = Boolean(collapsedGroups[group.key]);

                    return (
                      <Fragment key={group.key}>
                        {/* Group Header */}
                        {groupBy !== 'none' && (
                          <div
                            onClick={() => toggleGroupCollapse(group.key)}
                            className="bg-slate-100/90 dark:bg-slate-800/80 px-3 py-2.5 flex items-center justify-between border-b border-border-light cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              {isCollapsed ? <ChevronRight size={14} className="text-text-muted shrink-0" /> : <ChevronDown size={14} className="text-text-muted shrink-0" />}
                              <span className="font-bold text-xs text-text-primary truncate">{group.label}</span>
                              <span className="px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-bold text-[10px] shrink-0">
                                {group.tools.length}
                              </span>
                            </div>
                            <span className="text-[10px] text-text-muted font-mono shrink-0">
                              Stok: <strong className="text-text-primary">{group.totalStock}</strong>
                            </span>
                          </div>
                        )}

                        {/* Dense Mobile Rows */}
                        {(!isCollapsed || groupBy === 'none') &&
                          group.tools.map((tool, index) => {
                            const condStyle = getConditionStyle(tool.kondisi);
                            const CondIcon = condStyle.icon;

                            return (
                              <div
                                key={tool._id}
                                className={`p-3 transition-colors flex flex-col gap-2 ${
                                  selectedToolIds.includes(tool._id)
                                    ? 'bg-blue-50/70 dark:bg-blue-950/20 border-l-4 border-l-primary'
                                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                {/* Row Top: Checkbox + Index + Photo + Title & Category + Condition Badge + Stock */}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-2 min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                                      <input
                                        type="checkbox"
                                        aria-label={`Pilih ${tool.nama}`}
                                        className="w-4 h-4 rounded border-slate-300 text-primary accent-primary cursor-pointer shrink-0"
                                        checked={selectedToolIds.includes(tool._id)}
                                        onChange={(e) => handleToggleSelectTool(tool._id, e)}
                                      />
                                      <span className="text-[10px] font-mono text-text-muted w-3.5 text-center">
                                        {index + 1}
                                      </span>
                                    </div>
                                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border-light bg-bg-secondary flex items-center justify-center">
                                      {tool.photo ? (
                                        <PhotoView src={getImageUrl(tool.photo)}>
                                          <img src={getImageUrl(tool.photo)} alt={tool.nama} className="w-full h-full object-cover cursor-pointer" />
                                        </PhotoView>
                                      ) : (
                                        <Wrench size={16} className="text-text-muted" />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="font-bold text-xs text-text-primary truncate">{tool.nama}</div>
                                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                        {tool.kategori && (
                                          <span className="text-[10px] text-text-muted">{tool.kategori}</span>
                                        )}
                                        {tool.kategori && <span className="text-[10px] text-text-muted">•</span>}
                                        <span
                                          className="text-[9px] font-bold py-0.2 px-1.5 rounded-full inline-flex items-center gap-1"
                                          style={{ backgroundColor: condStyle.bg, color: condStyle.color }}
                                        >
                                          <CondIcon size={9} />
                                          {condStyle.label}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="shrink-0 text-right">
                                    <span className="text-xs font-mono font-bold text-text-primary bg-bg-secondary py-0.5 px-1.5 rounded">
                                      {tool.stok} <span className="font-sans text-[10px] font-normal text-text-muted">{tool.satuan}</span>
                                    </span>
                                  </div>
                                </div>

                                {/* Row Middle: Warehouse/Bin Location & Holder/Project */}
                                <div className="flex items-center justify-between gap-2 text-xs pl-6 text-text-secondary flex-wrap">
                                  <div className="flex items-center gap-1 truncate max-w-[200px]">
                                    {tool.warehouseId && typeof tool.warehouseId === 'object' ? (
                                      <span className="inline-flex items-center gap-1 font-semibold text-cyan-700 dark:text-cyan-400 truncate text-[11px]">
                                        <WarehouseIcon size={12} className="shrink-0" />
                                        {tool.warehouseId.name} {tool.binRef ? `(${tool.binRef})` : ''}
                                      </span>
                                    ) : tool.lokasi ? (
                                      <span className="inline-flex items-center gap-1 text-text-muted truncate text-[11px]">
                                        <MapPin size={12} className="shrink-0" />
                                        {tool.lokasi} {tool.binRef ? `(${tool.binRef})` : ''}
                                      </span>
                                    ) : (
                                      <span className="text-text-muted italic text-[11px]">Lokasi belum disetel</span>
                                    )}
                                  </div>

                                  <div className="text-[11px]">
                                    {tool.assignedTo ? (
                                      <span className="inline-flex items-center gap-1 text-primary font-semibold">
                                        <User size={11} />
                                        {tool.assignedTo.fullName}
                                      </span>
                                    ) : tool.projectId ? (
                                      <span className="inline-flex items-center gap-1 text-info font-semibold">
                                        <Package size={11} />
                                        {tool.projectId.nama}
                                      </span>
                                    ) : (
                                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">Tersedia</span>
                                    )}
                                  </div>
                                </div>

                                {/* Row Bottom: Last Checked Date + Compact Touch Action Buttons */}
                                <div className="flex items-center justify-between gap-2 pl-6 pt-1.5 border-t border-border-light/50">
                                  <span className="text-[10px] text-text-muted">
                                    {tool.lastChecked ? `Cek: ${formatDateDisplay(tool.lastChecked)}` : '-'}
                                  </span>

                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openMovementModal(tool)}
                                      className="py-1 px-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-[11px] font-bold flex items-center gap-1 min-h-[30px] active:scale-95 cursor-pointer shadow-2xs"
                                      title="Gerakkan / Pindahkan Alat"
                                    >
                                      <Camera size={12} />
                                      <span>Gerakkan</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openHistoryDrawer(tool)}
                                      className="p-1.5 min-w-[30px] min-h-[30px] rounded-lg border border-border-light bg-bg-secondary text-text-secondary hover:text-text-primary active:scale-95 cursor-pointer flex items-center justify-center"
                                      title="Riwayat Audit"
                                    >
                                      <History size={13} />
                                    </button>
                                    {canManage && (
                                      <>
                                        <button
                                          onClick={() => openEditModal(tool)}
                                          className="p-1.5 min-w-[30px] min-h-[30px] rounded-lg border border-border-light bg-bg-secondary text-text-secondary hover:text-primary active:scale-95 cursor-pointer flex items-center justify-center"
                                          title="Edit"
                                        >
                                          <Edit3 size={13} />
                                        </button>
                                        <button
                                          onClick={() => handleDelete(tool)}
                                          className="p-1.5 min-w-[30px] min-h-[30px] rounded-lg border border-border-light bg-bg-secondary text-text-secondary hover:text-danger active:scale-95 cursor-pointer flex items-center justify-center"
                                          title="Hapus"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </div>

                {/* 2. Desktop & Tablet Multi-Column Table (hidden sm:block) */}
                <div className="hidden sm:block overflow-x-auto w-full">
                  <table role="grid" aria-rowcount={filteredTools.length} className="w-full border-collapse text-left">
                    <thead>
                      <tr role="row" className="bg-slate-50/80 border-b border-border-light text-text-muted uppercase tracking-wider font-semibold">
                        <th role="columnheader" className={`${DENSITY_CONFIG[tableDensity].th} sm:sticky sm:left-0 z-30 bg-slate-50 w-11 text-center border-r border-border-light`}>
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              aria-label="Pilih semua alat"
                              className="w-4 h-4 rounded border-slate-300 text-primary accent-primary cursor-pointer transition-colors"
                              checked={isAllSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = isSomeSelected;
                              }}
                              onChange={handleToggleSelectAll}
                            />
                          </div>
                        </th>
                        <th role="columnheader" className={`${DENSITY_CONFIG[tableDensity].th} sm:sticky sm:left-11 z-20 bg-slate-50 w-12 text-center border-r border-border-light`}>#</th>
                        <th role="columnheader" className={`${DENSITY_CONFIG[tableDensity].th} sm:sticky sm:left-[92px] z-20 bg-slate-50 min-w-[180px] sm:min-w-[200px] border-r border-border-light shadow-[4px_0_8px_-3px_rgba(0,0,0,0.06)]`}>Alat / Mesin</th>
                        <th role="columnheader" className={`${DENSITY_CONFIG[tableDensity].th} min-w-[120px]`}>Kondisi</th>
                        <th role="columnheader" className={`${DENSITY_CONFIG[tableDensity].th} min-w-[110px] text-right`}>Stok</th>
                        <th role="columnheader" className={`${DENSITY_CONFIG[tableDensity].th} min-w-[130px]`}>Lokasi</th>
                        <th role="columnheader" className={`${DENSITY_CONFIG[tableDensity].th} min-w-[150px]`}>Pengguna / Proyek</th>
                        <th role="columnheader" className={`${DENSITY_CONFIG[tableDensity].th} min-w-[130px]`}>Pengecekan</th>
                        <th role="columnheader" className={`${DENSITY_CONFIG[tableDensity].th} sm:sticky sm:right-0 z-20 bg-slate-50 text-right w-28 border-l border-border-light shadow-[-4px_0_8px_-3px_rgba(0,0,0,0.06)]`}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y border-border-light">
                      {groupedTools.map((group) => {
                        const isCollapsed = Boolean(collapsedGroups[group.key]);

                        return (
                          <Fragment key={group.key}>
                            {/* Group Banner Row (Only if groupBy !== 'none') */}
                            {groupBy !== 'none' && (
                              <tr
                                onClick={() => toggleGroupCollapse(group.key)}
                                className="bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-colors cursor-pointer select-none border-y border-border-light font-medium"
                              >
                                <td colSpan={9} className="py-2 px-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-md bg-white/80 dark:bg-slate-700 flex items-center justify-center text-text-muted shadow-2xs">
                                        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                      </span>
                                      <span className="font-bold text-xs text-text-primary tracking-tight">
                                        {group.label}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                                        {group.tools.length} Alat
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-text-secondary font-mono font-bold text-[10px]">
                                        Total Stok: {group.totalStock}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px]">
                                      {group.kondisiCount.baik > 0 && (
                                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                                          {group.kondisiCount.baik} Baik
                                        </span>
                                      )}
                                      {group.kondisiCount.maintenance > 0 && (
                                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                                          {group.kondisiCount.maintenance} Servis
                                        </span>
                                      )}
                                      {group.kondisiCount.rusak > 0 && (
                                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold">
                                          {group.kondisiCount.rusak} Rusak
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}

                            {/* Group Tool Rows (if not collapsed) */}
                            {(!isCollapsed || groupBy === 'none') &&
                              group.tools.map((tool, index) => {
                                const condStyle = getConditionStyle(tool.kondisi);
                                const CondIcon = condStyle.icon;
                                return (
                                  <tr
                                    role="row"
                                    aria-rowindex={index + 1}
                                    key={tool._id}
                                    className={`transition-colors group ${
                                      selectedToolIds.includes(tool._id)
                                        ? 'bg-blue-50/70 hover:bg-blue-50/90 dark:bg-blue-950/20'
                                        : 'hover:bg-slate-50/80'
                                    }`}
                                  >
                                    {/* Sticky Checkbox */}
                                    <td className={`${DENSITY_CONFIG[tableDensity].td} sm:sticky sm:left-0 z-20 bg-white group-hover:bg-slate-50 text-center border-r border-border-light ${selectedToolIds.includes(tool._id) ? '!bg-blue-50/80' : ''}`}>
                                      <div className="flex items-center justify-center">
                                        <input
                                          type="checkbox"
                                          aria-label={`Pilih ${tool.nama}`}
                                          className="w-4 h-4 rounded border-slate-300 text-primary accent-primary cursor-pointer"
                                          checked={selectedToolIds.includes(tool._id)}
                                          onChange={(e) => handleToggleSelectTool(tool._id, e)}
                                        />
                                      </div>
                                    </td>
                                    {/* Sticky # */}
                                    <td className={`${DENSITY_CONFIG[tableDensity].td} sm:sticky sm:left-11 z-10 bg-white group-hover:bg-slate-50 text-center text-text-muted font-mono tabular-nums border-r border-border-light ${selectedToolIds.includes(tool._id) ? '!bg-blue-50/80' : ''}`}>
                                      {index + 1}
                                    </td>
                                    {/* Sticky Photo + Name + Category */}
                                    <td className={`${DENSITY_CONFIG[tableDensity].td} sm:sticky sm:left-[92px] z-10 bg-white group-hover:bg-slate-50 border-r border-border-light shadow-[4px_0_8px_-3px_rgba(0,0,0,0.06)] ${selectedToolIds.includes(tool._id) ? '!bg-blue-50/80' : ''}`}>
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 border border-border-light bg-bg-secondary flex items-center justify-center">
                                          {tool.photo ? (
                                            <PhotoView src={getImageUrl(tool.photo)}>
                                              <img src={getImageUrl(tool.photo)} alt={tool.nama} className="w-full h-full object-cover cursor-pointer" />
                                            </PhotoView>
                                          ) : (
                                            <Wrench size={16} className="text-text-muted" />
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <div className="font-semibold text-text-primary truncate">{tool.nama}</div>
                                          {tool.kategori && (
                                            <span className="text-[11px] text-text-muted">{tool.kategori}</span>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    {/* Kondisi Badge */}
                                    <td className={DENSITY_CONFIG[tableDensity].td}>
                                      <span
                                        className="text-xs font-bold py-[2px] px-2 rounded-full inline-flex items-center gap-1"
                                        style={{ backgroundColor: condStyle.bg, color: condStyle.color }}
                                      >
                                        <CondIcon size={12} />
                                        {condStyle.label}
                                      </span>
                                    </td>
                                    {/* Stok */}
                                    <td className={`${DENSITY_CONFIG[tableDensity].td} text-right font-mono tabular-nums font-semibold text-text-primary`}>
                                      {tool.stok} <span className="font-sans text-xs font-normal text-text-muted">{tool.satuan}</span>
                                    </td>
                                    {/* Lokasi & Bin */}
                                    <td className={`${DENSITY_CONFIG[tableDensity].td} text-text-secondary`}>
                                      {tool.warehouseId && typeof tool.warehouseId === 'object' ? (
                                        <div className="flex flex-col min-w-0">
                                          <span className="inline-flex items-center gap-1 font-semibold text-xs text-cyan-700 dark:text-cyan-400 truncate">
                                            <WarehouseIcon size={12} className="shrink-0" />
                                            {tool.warehouseId.name}
                                          </span>
                                          {tool.binRef && (
                                            <span className="text-[10px] font-mono text-text-muted truncate">
                                              {tool.binRef}
                                            </span>
                                          )}
                                        </div>
                                      ) : tool.lokasi ? (
                                        <div className="flex flex-col min-w-0">
                                          <span className="inline-flex items-center gap-1 truncate text-xs">
                                            <MapPin size={12} className="text-text-muted shrink-0" />
                                            {tool.lokasi}
                                          </span>
                                          {tool.binRef && (
                                            <span className="text-[10px] font-mono text-text-muted truncate">
                                              {tool.binRef}
                                            </span>
                                          )}
                                        </div>
                                      ) : '-'}
                                    </td>
                                    {/* Assigned User / Project */}
                                    <td className={DENSITY_CONFIG[tableDensity].td}>
                                      {tool.assignedTo ? (
                                        <span className="inline-flex items-center gap-1 text-primary font-medium text-xs truncate">
                                          <User size={12} className="shrink-0" />
                                          {tool.assignedTo.fullName}
                                        </span>
                                      ) : tool.projectId ? (
                                        <span className="inline-flex items-center gap-1 text-info font-medium text-xs truncate">
                                          <Package size={12} className="shrink-0" />
                                          {tool.projectId.nama}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-text-muted">Tersedia</span>
                                      )}
                                    </td>
                                    {/* Pengecekan */}
                                    <td className={`${DENSITY_CONFIG[tableDensity].td} text-xs text-text-muted whitespace-nowrap`}>
                                      {tool.lastChecked ? formatDateDisplay(tool.lastChecked) : '-'}
                                    </td>
                                    {/* Sticky Aksi */}
                                    <td className={`${DENSITY_CONFIG[tableDensity].td} sm:sticky sm:right-0 z-10 bg-white group-hover:bg-slate-50 text-right border-l border-border-light shadow-[-4px_0_8px_-3px_rgba(0,0,0,0.06)]`}>
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          type="button"
                                          onClick={() => openMovementModal(tool)}
                                          className="p-2 min-w-[32px] min-h-[32px] rounded-lg hover:bg-cyan-50 dark:hover:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400 transition-colors active:scale-95 cursor-pointer flex items-center justify-center"
                                          title="Gerakkan / Pindahkan Alat (Watermark Foto)"
                                        >
                                          <Camera size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => openHistoryDrawer(tool)}
                                          className="p-2 min-w-[32px] min-h-[32px] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors active:scale-95 cursor-pointer flex items-center justify-center"
                                          title="Lihat Riwayat Pergerakan & Bukti Foto"
                                        >
                                          <History size={14} />
                                        </button>
                                        {canManage && (
                                          <>
                                            <button
                                              onClick={() => openEditModal(tool)}
                                              className="p-2 min-w-[32px] min-h-[32px] rounded-lg hover:bg-primary-bg hover:text-primary text-text-muted transition-colors active:scale-95 cursor-pointer flex items-center justify-center"
                                              title={t('tools.actions.edit')}
                                            >
                                              <Edit3 size={14} />
                                            </button>
                                            <button
                                              onClick={() => handleDelete(tool)}
                                              className="p-2 min-w-[32px] min-h-[32px] rounded-lg hover:bg-danger-bg hover:text-danger text-text-muted transition-colors active:scale-95 cursor-pointer flex items-center justify-center"
                                              title={t('tools.actions.delete')}
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {groupedTools.map((group) => {
                  const isCollapsed = Boolean(collapsedGroups[group.key]);

                  return (
                    <div key={group.key} className="space-y-2">
                      {groupBy !== 'none' && (
                        <div
                          onClick={() => toggleGroupCollapse(group.key)}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200/70 border border-border-light cursor-pointer select-none transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded bg-white dark:bg-slate-700 flex items-center justify-center text-text-muted shadow-2xs">
                              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                            </span>
                            <span className="font-bold text-xs text-text-primary">{group.label}</span>
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                              {group.tools.length} Alat
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-text-secondary font-mono font-bold text-[10px]">
                              Total Stok: {group.totalStock}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            {group.kondisiCount.baik > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">{group.kondisiCount.baik} Baik</span>}
                            {group.kondisiCount.maintenance > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">{group.kondisiCount.maintenance} Servis</span>}
                            {group.kondisiCount.rusak > 0 && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold">{group.kondisiCount.rusak} Rusak</span>}
                          </div>
                        </div>
                      )}

                      {(!isCollapsed || groupBy === 'none') && (
                        <div className="flex flex-col gap-2.5">
                          {group.tools.map((tool, index) => {
                            const condStyle = getConditionStyle(tool.kondisi);
                            const CondIcon = condStyle.icon;
                            return (
                              <Card
                                key={tool._id}
                                className={`group p-3 !transition-all !duration-150 hover:-translate-y-[2px] hover:shadow-xs relative ${
                                  selectedToolIds.includes(tool._id)
                                    ? 'ring-2 ring-primary bg-primary/[0.02]'
                                    : ''
                                }`}
                                style={{
                                  borderLeft: `4px solid ${condStyle.color}`,
                                }}
                              >
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3">
                                  {/* Info Container */}
                                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                    <div className="pt-1 shrink-0">
                                      <input
                                        type="checkbox"
                                        aria-label={`Pilih ${tool.nama}`}
                                        className="w-4 h-4 rounded border-slate-300 text-primary accent-primary cursor-pointer shrink-0"
                                        checked={selectedToolIds.includes(tool._id)}
                                        onChange={(e) => handleToggleSelectTool(tool._id, e)}
                                      />
                                    </div>
                                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 border border-border-light bg-bg-secondary flex items-center justify-center">
                                      {tool.photo ? (
                                        <PhotoView src={getImageUrl(tool.photo)}>
                                          <img 
                                            src={getImageUrl(tool.photo)} 
                                            alt={tool.nama} 
                                            className="w-full h-full object-cover cursor-pointer"
                                          />
                                        </PhotoView>
                                      ) : (
                                        <div className="w-full h-full bg-bg-secondary flex items-center justify-center">
                                          <Wrench size={22} className="text-text-muted" />
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                        <h3 className="text-sm font-bold text-text-primary m-0 truncate max-w-[200px] sm:max-w-none">{tool.nama}</h3>
                                      </div>
                                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                        {tool.kategori && (
                                          <span className="text-[10px] font-semibold text-text-secondary bg-bg-secondary py-[1px] px-2 rounded-full">{tool.kategori}</span>
                                        )}
                                        <span
                                          className="text-[10px] font-bold py-[1px] px-2 rounded-full flex items-center gap-1"
                                          style={{ backgroundColor: condStyle.bg, color: condStyle.color }}
                                        >
                                          <CondIcon size={11} />
                                          {condStyle.label}
                                        </span>
                                      </div>

                                      <div className="flex flex-wrap gap-1.5 sm:gap-2 text-xs">
                                        <span className="flex items-center gap-1 text-text-muted whitespace-nowrap bg-bg-secondary/60 py-0.5 px-2 rounded-md">
                                          <Archive size={12} />
                                          <span className="font-semibold text-text-primary">{tool.stok}</span> {tool.satuan}
                                        </span>
                                        {tool.warehouseId && typeof tool.warehouseId === 'object' ? (
                                          <span className="flex items-center gap-1 text-cyan-700 dark:text-cyan-400 font-semibold whitespace-nowrap bg-cyan-500/10 py-0.5 px-2 rounded-md">
                                            <WarehouseIcon size={12} />
                                            {tool.warehouseId.name} {tool.binRef ? `• ${tool.binRef}` : ''}
                                          </span>
                                        ) : tool.lokasi ? (
                                          <span className="flex items-center gap-1 text-text-muted whitespace-nowrap bg-bg-secondary/60 py-0.5 px-2 rounded-md">
                                            <MapPin size={12} />
                                            {tool.lokasi} {tool.binRef ? `• ${tool.binRef}` : ''}
                                          </span>
                                        ) : null}
                                        {tool.assignedTo && (
                                          <span className="flex items-center gap-1 whitespace-nowrap !text-primary font-medium bg-primary/10 py-0.5 px-2 rounded-md">
                                            <User size={12} />
                                            {tool.assignedTo.fullName}
                                          </span>
                                        )}
                                        {tool.projectId && (
                                          <span className="flex items-center gap-1 whitespace-nowrap !text-info font-medium bg-info/10 py-0.5 px-2 rounded-md">
                                            <Package size={12} />
                                            {tool.projectId.nama}
                                          </span>
                                        )}
                                        {tool.lastChecked && (
                                          <span className="flex items-center gap-1 text-text-muted whitespace-nowrap py-0.5 px-1.5">
                                            <Calendar size={12} />
                                            {formatDateDisplay(tool.lastChecked)}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Action Buttons: Prominent and Thumb-Friendly */}
                                  <div className="flex items-center gap-2 pt-2.5 border-t border-border-light sm:border-t-0 sm:pt-0 sm:shrink-0 max-sm:w-full">
                                    <button
                                      type="button"
                                      onClick={() => openMovementModal(tool)}
                                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs font-bold transition-all shadow-xs min-h-[38px] active:scale-95 cursor-pointer"
                                      title="Gerakkan / Pindahkan Alat (Watermark Foto)"
                                    >
                                      <Camera size={14} />
                                      <span>Gerakkan</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openHistoryDrawer(tool)}
                                      className="p-2 min-h-[38px] min-w-[38px] rounded-xl border border-border-light bg-bg-white hover:bg-bg-secondary text-text-secondary flex items-center justify-center cursor-pointer transition-colors active:scale-95"
                                      title="Riwayat Audit & Watermark"
                                    >
                                      <History size={15} />
                                    </button>
                                    {canManage && (
                                      <>
                                        <button
                                          onClick={() => openEditModal(tool)}
                                          className="p-2 min-h-[38px] min-w-[38px] rounded-xl border border-border-light bg-bg-white hover:bg-primary-bg hover:text-primary text-text-muted flex items-center justify-center cursor-pointer transition-colors active:scale-95"
                                          title={t('tools.actions.edit')}
                                        >
                                          <Edit3 size={14} />
                                        </button>
                                        <button
                                          onClick={() => handleDelete(tool)}
                                          className="p-2 min-h-[38px] min-w-[38px] rounded-xl border border-border-light bg-bg-white hover:bg-danger-bg hover:text-danger text-text-muted flex items-center justify-center cursor-pointer transition-colors active:scale-95"
                                          title={t('tools.actions.delete')}
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
          </div>
        </div>
      </>
    )}

    {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-[1000] backdrop-blur-[4px]" onClick={() => { setShowAddModal(false); setEditingTool(null); }}>
          <div 
            ref={toolModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-tool-title"
            className="bg-bg-white rounded-xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto shadow-xl" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-border-light">
              <h2 id="modal-tool-title" className="m-0 font-bold text-lg text-text-primary">{editingTool ? t('tools.modal.editTitle') : t('tools.modal.addTitle')}</h2>
              <button className="p-2 border-none bg-transparent cursor-pointer text-text-muted rounded-md flex hover:bg-bg-secondary hover:text-text-primary" onClick={() => { setShowAddModal(false); setEditingTool(null); }}>
                <X size={24} />
              </button>
            </div>

            <div className="p-5">
              {/* Photo Upload Area */}
              <div className="flex flex-col items-center mb-6">
                <div 
                  className="relative w-32 h-32 rounded-xl border-2 border-dashed border-border-light overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => document.getElementById('tool-photo-input')?.click()}
                >
                  {photoPreview ? (
                    <PhotoView src={photoPreview}>
                      <img src={photoPreview} alt="Preview" className="w-full h-full object-cover cursor-pointer" />
                    </PhotoView>
                  ) : (
                    <div className="flex flex-col items-center text-text-muted">
                      <Camera size={28} />
                      <span className="text-[10px] font-bold uppercase mt-1">Upload Photo</span>
                    </div>
                  )}
                </div>
                {!editingTool && !photo && (
                  <span className="text-[10px] text-danger font-bold uppercase mt-1">* Required</span>
                )}
                <input 
                  id="tool-photo-input"
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handlePhotoChange}
                />
              </div>

              <div className="flex flex-col gap-2 mb-4">
                <label className="text-sm font-semibold text-text-primary">{t('tools.modal.name')}</label>
                <input
                  className="w-full p-3 px-4 border border-border rounded-md text-base text-text-primary bg-bg-white transition-all duration-150 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 placeholder:text-text-muted"
                  value={formData.nama}
                  onChange={e => setFormData(p => ({ ...p, nama: e.target.value }))}
                  placeholder={t('tools.modal.namePlaceholder')}
                />
              </div>

              <div className="flex gap-3 max-sm:flex-col mb-4">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('tools.modal.category')}</label>
                  <input
                    className="w-full p-3 px-4 border border-border rounded-md text-base text-text-primary bg-bg-white transition-all duration-150 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 placeholder:text-text-muted"
                    value={formData.kategori}
                    onChange={e => setFormData(p => ({ ...p, kategori: e.target.value }))}
                    placeholder={t('tools.modal.categoryPlaceholder')}
                  />
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-sm font-semibold text-text-primary">Fasilitas Gudang</label>
                  <select
                    className="w-full p-3 px-4 border border-border rounded-md text-sm text-text-primary bg-bg-white transition-all duration-150 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 cursor-pointer"
                    value={formData.warehouseId}
                    onChange={(e) => {
                      const whId = e.target.value;
                      const wh = warehouses.find(w => w._id === whId);
                      setFormData(p => ({
                        ...p,
                        warehouseId: whId,
                        lokasi: wh ? wh.name : p.lokasi,
                      }));
                    }}
                  >
                    <option value="">-- Pilih Fasilitas Gudang --</option>
                    {warehouses.map((w) => (
                      <option key={w._id} value={w._id}>
                        {w.name} {w.isDefault ? '(Head Office)' : `[${w.code}]`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-4">
                <label className="text-sm font-semibold text-text-primary">Posisi Rak / Bin Penyimpanan (Opsional)</label>
                <input
                  className="w-full p-3 px-4 border border-border rounded-md text-sm text-text-primary bg-bg-white transition-all duration-150 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 placeholder:text-text-muted"
                  value={formData.binRef}
                  onChange={e => setFormData(p => ({ ...p, binRef: e.target.value }))}
                  placeholder="Contoh: Zona A / Rak 1 / B-02"
                />
              </div>

              <div className="flex gap-3 max-sm:flex-col mb-4">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('tools.modal.stock')}</label>
                  <input
                    className="w-full p-3 px-4 border border-border rounded-md text-base text-text-primary bg-bg-white transition-all duration-150 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 placeholder:text-text-muted"
                    type="number"
                    min="0"
                    value={formData.stok}
                    onChange={e => setFormData(p => ({ ...p, stok: Number(e.target.value) }))}
                  />
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('tools.modal.unit')}</label>
                  <input
                    className="w-full p-3 px-4 border border-border rounded-md text-base text-text-primary bg-bg-white transition-all duration-150 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 placeholder:text-text-muted"
                    value={formData.satuan}
                    onChange={e => setFormData(p => ({ ...p, satuan: e.target.value }))}
                    placeholder={t('tools.modal.unitPlaceholder')}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-4">
                <label className="text-sm font-semibold text-text-primary">{t('tools.modal.condition')}</label>
                <div className="flex gap-2 max-sm:flex-col">
                  {(['Baik', 'Maintenance', 'Rusak'] as const).map(k => {
                    const cfg = CONDITION_CONFIG[k];
                    const isActive = formData.kondisi === k;
                    const Icon = cfg.icon;
                    const labelMapping: Record<string, string> = {
                      'Good': t('tools.condition.good'),
                      'Service': t('tools.condition.service'),
                      'Damaged': t('tools.condition.damaged')
                    };
                    const translatedLabel = labelMapping[cfg.label];
                    return (
                      <button
                        key={k}
                        className={`flex-1 flex items-center justify-center gap-[6px] p-3 border-[1.5px] border-border rounded-md bg-bg-white text-text-secondary text-sm font-semibold cursor-pointer transition-all duration-150 hover:border-text-muted ${isActive ? '!font-bold' : ''}`}
                        style={isActive ? { backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.color } : {}}
                        onClick={() => setFormData(p => ({ ...p, kondisi: k }))}
                        type="button"
                      >
                        <Icon size={14} />
                        {translatedLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-border-light">
              <Button
                title={t('tools.actions.cancel')}
                onClick={() => { setShowAddModal(false); setEditingTool(null); }}
                variant="outline"
              />
              <Button
                title={editingTool ? t('tools.actions.saveChanges') : t('tools.actions.add')}
                onClick={handleSave}
                loading={submitting}
                variant="primary"
                disabled={!formData.nama.trim() || (!editingTool && !photo)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Export to Excel Modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-[1000] backdrop-blur-[4px]"
          onClick={() => setShowExportModal(false)}
        >
          <div
            ref={exportModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-export-title"
            className="bg-bg-white rounded-xl w-full max-w-[540px] max-h-[90vh] overflow-y-auto shadow-2xl border border-border-light flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border-light bg-slate-50/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h2 id="modal-export-title" className="m-0 font-bold text-base text-text-primary">
                    {t('tools.export.title')}
                  </h2>
                  <p className="m-0 text-xs text-text-muted mt-0.5">
                    {t('tools.export.subtitle')}
                  </p>
                </div>
              </div>
              <button
                className="p-1.5 border-none bg-transparent cursor-pointer text-text-muted rounded-md flex hover:bg-bg-secondary hover:text-text-primary transition-colors"
                onClick={() => setShowExportModal(false)}
                aria-label="Tutup"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-5">
              {/* Scope Selector */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-text-muted block mb-2">
                  {t('tools.export.scope')}
                </label>
                <div className={`grid grid-cols-1 ${selectedToolIds.length > 0 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2.5`}>
                  {selectedToolIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExportScope('selected')}
                      className={`flex flex-col text-left p-3 rounded-lg border text-xs transition-all cursor-pointer ${
                        exportScope === 'selected'
                          ? 'border-emerald-500 bg-emerald-50/60 text-text-primary ring-1 ring-emerald-500 shadow-xs'
                          : 'border-border-light bg-bg-white text-text-secondary hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-text-primary">
                        <span>Hanya Terpilih</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold">
                          {selectedToolIds.length}
                        </span>
                      </div>
                      <span className="text-[11px] text-text-muted mt-1 leading-snug">
                        Item yang dicentang di tabel/kartu
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setExportScope('current')}
                    className={`flex flex-col text-left p-3 rounded-lg border text-xs transition-all cursor-pointer ${
                      exportScope === 'current'
                        ? 'border-emerald-500 bg-emerald-50/60 text-text-primary ring-1 ring-emerald-500 shadow-xs'
                        : 'border-border-light bg-bg-white text-text-secondary hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-text-primary">
                      <span>{t('tools.export.scopeCurrent')}</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold">
                        {filteredTools.length}
                      </span>
                    </div>
                    <span className="text-[11px] text-text-muted mt-1 leading-snug">
                      {search || filter !== 'all'
                        ? `${filter !== 'all' ? `Filter: ${filter}` : ''} ${search ? `| "${search}"` : ''}`
                        : 'Menampilkan data yang difilter'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportScope('all')}
                    className={`flex flex-col text-left p-3 rounded-lg border text-xs transition-all cursor-pointer ${
                      exportScope === 'all'
                        ? 'border-emerald-500 bg-emerald-50/60 text-text-primary ring-1 ring-emerald-500 shadow-xs'
                        : 'border-border-light bg-bg-white text-text-secondary hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-text-primary">
                      <span>{t('tools.export.scopeAll')}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-extrabold">
                        {tools.length}
                      </span>
                    </div>
                    <span className="text-[11px] text-text-muted mt-1 leading-snug">
                      Seluruh item di database tanpa filter
                    </span>
                  </button>
                </div>
              </div>

              {/* Column Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    {t('tools.export.columns')} ({selectedExportColumns.length}/{EXPORTABLE_TOOL_COLUMNS.length})
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedExportColumns(EXPORTABLE_TOOL_COLUMNS.map(c => c.key))}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                    >
                      {t('tools.export.selectAll')}
                    </button>
                    <span className="text-border-light">•</span>
                    <button
                      type="button"
                      onClick={() => setSelectedExportColumns(DEFAULT_EXPORT_COLUMNS)}
                      className="text-[11px] font-bold text-primary hover:text-primary-light hover:underline cursor-pointer"
                    >
                      {t('tools.export.presetDefault')}
                    </button>
                    <span className="text-border-light">•</span>
                    <button
                      type="button"
                      onClick={() => setSelectedExportColumns(COMPACT_EXPORT_COLUMNS)}
                      className="text-[11px] font-bold text-text-secondary hover:text-text-primary hover:underline cursor-pointer"
                    >
                      {t('tools.export.presetCompact')}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto p-2.5 border border-border-light rounded-xl bg-slate-50/50">
                  {EXPORTABLE_TOOL_COLUMNS.map(col => {
                    const isChecked = selectedExportColumns.includes(col.key);
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2.5 p-2 rounded-lg text-xs font-semibold cursor-pointer transition-all border ${
                          isChecked
                            ? 'bg-bg-white border-emerald-300 text-text-primary shadow-xs'
                            : 'bg-transparent border-transparent text-text-muted hover:bg-white/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (selectedExportColumns.includes(col.key)) {
                              if (selectedExportColumns.length > 1) {
                                setSelectedExportColumns(selectedExportColumns.filter(k => k !== col.key));
                              }
                            } else {
                              setSelectedExportColumns([...selectedExportColumns, col.key]);
                            }
                          }}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                        />
                        <span className="truncate">{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Header Row Option & Info */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border-light">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-text-primary select-none">
                  <input
                    type="checkbox"
                    checked={includeExportHeaders}
                    onChange={e => setIncludeExportHeaders(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                  />
                  <span>{t('tools.export.includeHeaders')}</span>
                </label>
                <span className="text-[11px] text-text-muted font-mono">Format: .xlsx</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border-light bg-slate-50/60">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="py-2.5 px-4 rounded-lg text-xs font-bold text-text-secondary hover:bg-bg-secondary border border-border-light transition-all cursor-pointer"
              >
                {t('tools.actions.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (selectedExportColumns.length === 0) {
                    alert(t('tools.export.selectAtLeastOneColumn'));
                    return;
                  }

                  setIsExporting(true);
                  try {
                    const params: {
                      search?: string;
                      kondisi?: string;
                      columns: string[];
                      headers: boolean;
                      toolIds?: string[];
                    } = {
                      columns: selectedExportColumns,
                      headers: includeExportHeaders,
                    };

                    if (exportScope === 'selected') {
                      params.toolIds = selectedToolIds;
                    } else if (exportScope === 'current') {
                      if (search.trim()) params.search = search.trim();
                      if (filter !== 'all') params.kondisi = filter;
                    }

                    await exportToolsExcel(params);
                    setShowExportModal(false);
                    setExportSuccess(true);
                    setTimeout(() => setExportSuccess(false), 4000);
                  } catch (err: any) {
                    console.error('Failed to export tools to Excel:', err);
                    alert(err.response?.data?.msg || t('tools.export.failedMsg'));
                  } finally {
                    setIsExporting(false);
                  }
                }}
                disabled={isExporting || selectedExportColumns.length === 0}
                className="flex items-center gap-2 py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-emerald-700/20 active:scale-95 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{t('tools.export.downloading')}</span>
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    <span>{t('tools.export.download')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      <ToolsExcelImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={(msg) => {
          fetchData();
          setToastMessage({ type: 'success', text: msg });
        }}
      />

      {/* Tool Movement Modal (Check-out, Return, Hand-over, Transfer, Relocation, Service) */}
      <ToolMovementModal
        isOpen={movementModalOpen}
        onClose={() => {
          setMovementModalOpen(false);
          setSelectedToolForMovement(null);
        }}
        tool={selectedToolForMovement}
        warehouses={warehouses}
        users={usersList}
        projects={projectsList}
        defaultAction={movementDefaultAction}
        onSuccess={(updatedTool, msg) => {
          fetchData();
          setToastMessage({ type: 'success', text: msg });
        }}
      />

      {/* Tool Movement History & Audit Drawer */}
      <ToolMovementsDrawer
        isOpen={historyDrawerOpen}
        onClose={() => {
          setHistoryDrawerOpen(false);
          setSelectedToolForHistory(null);
        }}
        tool={selectedToolForHistory}
      />

      {/* Warehouse Master Data Modal */}
      <WarehouseManagementModal
        isOpen={warehouseModalOpen}
        onClose={() => setWarehouseModalOpen(false)}
        warehouses={warehouses}
        onRefresh={() => {
          fetchData();
          setToastMessage({ type: 'success', text: 'Data gudang berhasil disinkronkan' });
        }}
      />

      {/* Floating Toast Notification on Success / Error */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-[1100] flex items-center gap-2.5 py-3 px-4 rounded-xl shadow-2xl border animate-[fade-in-up_0.2s_ease_both] ${
            toastMessage.type === 'success'
              ? 'bg-slate-900 text-white border-emerald-500/50'
              : 'bg-rose-900 text-white border-rose-500/50'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle size={18} className="text-rose-400 shrink-0" />
          )}
          <span className="text-xs font-bold">{toastMessage.text}</span>
        </div>
      )}

      {/* Floating Toast Notification on Export Success */}
      {exportSuccess && !toastMessage && (
        <div className="fixed bottom-6 right-6 z-[1100] flex items-center gap-2.5 bg-slate-900 text-white py-3 px-4 rounded-xl shadow-2xl border border-slate-700 animate-[fade-in-up_0.2s_ease_both]">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{t('tools.export.successMsg')}</span>
        </div>
      )}

      {/* ── FLOATING BULK ACTION BAR ── */}
      {selectedToolIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-auto max-w-[95vw] bg-slate-950/95 text-white border border-slate-700/80 shadow-2xl rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3 backdrop-blur-md animate-in fade-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2 pr-2.5 border-r border-slate-700/80">
            <div className="w-7 h-7 rounded-lg bg-primary/20 text-blue-300 flex items-center justify-center font-black text-xs font-mono">
              {selectedToolIds.length}
            </div>
            <div className="hidden sm:block">
              <span className="text-xs font-black text-white">Dipilih</span>
              <span className="text-[10px] text-slate-400 block font-medium">Bulk Action</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
            {/* Ubah Kondisi */}
            <button
              type="button"
              onClick={() => setBulkActionModal({ isOpen: true, type: 'condition' })}
              className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Settings size={14} />
              <span>Kondisi</span>
            </button>

            {/* Pindah Gudang / Relokasi */}
            <button
              type="button"
              onClick={() => setBulkActionModal({ isOpen: true, type: 'relocate' })}
              className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <ArrowRightLeft size={14} />
              <span>Relokasi</span>
            </button>

            {/* Export Excel */}
            <button
              type="button"
              onClick={handleBulkExportSelected}
              disabled={isExporting}
              className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              <FileSpreadsheet size={14} />
              <span>{isExporting ? 'Ekspor...' : 'Ekspor Excel'}</span>
            </button>

            {/* Hapus Massal (Owner/Asset Admin) */}
            {canManage && (
              <button
                type="button"
                onClick={() => setBulkActionModal({ isOpen: true, type: 'delete' })}
                className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <Trash2 size={14} />
                <span>Hapus</span>
              </button>
            )}

            {/* Clear Selection */}
            <button
              type="button"
              onClick={handleClearSelection}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ml-1"
              title="Batal Pilih Semua"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── BULK ACTION MODAL ── */}
      {bulkActionModal.isOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[1050] backdrop-blur-[3px]"
          onClick={() => !bulkSubmitting && setBulkActionModal({ isOpen: false, type: null })}
        >
          <div
            className="bg-bg-white dark:bg-slate-900 rounded-2xl w-full max-w-[480px] shadow-2xl border border-border-light overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-light bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  bulkActionModal.type === 'condition'
                    ? 'bg-amber-500/15 text-amber-600 border-amber-300'
                    : bulkActionModal.type === 'relocate'
                    ? 'bg-cyan-500/15 text-cyan-600 border-cyan-300'
                    : 'bg-rose-500/15 text-rose-600 border-rose-300'
                }`}>
                  {bulkActionModal.type === 'condition' && <Settings size={20} />}
                  {bulkActionModal.type === 'relocate' && <ArrowRightLeft size={20} />}
                  {bulkActionModal.type === 'delete' && <Trash2 size={20} />}
                </div>
                <div>
                  <h3 className="m-0 font-bold text-base text-text-primary">
                    {bulkActionModal.type === 'condition' && 'Ubah Kondisi Massal'}
                    {bulkActionModal.type === 'relocate' && 'Relokasi Alat Massal'}
                    {bulkActionModal.type === 'delete' && 'Hapus Alat Massal'}
                  </h3>
                  <p className="m-0 text-xs text-text-muted mt-0.5">
                    Menargetkan <span className="font-bold text-text-primary">{selectedToolIds.length} alat</span> yang dipilih
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={bulkSubmitting}
                onClick={() => setBulkActionModal({ isOpen: false, type: null })}
                className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-secondary transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-4 text-xs">
              {/* CONDITION MODAL */}
              {bulkActionModal.type === 'condition' && (
                <>
                  <div>
                    <label className="font-bold text-text-secondary block mb-2">Pilih Kondisi Baru:</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Baik', 'Maintenance', 'Rusak'] as const).map((kondisi) => {
                        const style = getConditionStyle(kondisi);
                        const Icon = style.icon;
                        const isSelected = bulkCondition === kondisi;
                        return (
                          <button
                            key={kondisi}
                            type="button"
                            onClick={() => setBulkCondition(kondisi)}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer ${
                              isSelected
                                ? 'border-primary ring-2 ring-primary/20 bg-primary/5 font-bold text-text-primary'
                                : 'border-border-light hover:border-slate-300 bg-bg-secondary/40 text-text-secondary'
                            }`}
                          >
                            <span className="w-8 h-8 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: style.bg, color: style.color }}>
                              <Icon size={16} />
                            </span>
                            <span className="text-xs">{style.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-text-secondary block mb-1.5">Catatan Perubahan (Opsional):</label>
                    <textarea
                      value={bulkNotes}
                      onChange={(e) => setBulkNotes(e.target.value)}
                      placeholder="Contoh: Pengecekan rutin bulanan / telah diservis"
                      rows={3}
                      className="w-full p-2.5 rounded-xl border border-border-light bg-bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    />
                  </div>
                </>
              )}

              {/* RELOCATE MODAL */}
              {bulkActionModal.type === 'relocate' && (
                <>
                  <div>
                    <label className="font-bold text-text-secondary block mb-1.5">Pilih Gudang Tujuan:</label>
                    <select
                      value={bulkWarehouseId}
                      onChange={(e) => setBulkWarehouseId(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-border-light bg-bg-white text-text-primary font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                    >
                      <option value="">-- Tetap di Gudang Saat Ini --</option>
                      {warehouses.map((w) => (
                        <option key={w._id} value={w._id}>
                          {w.name} ({w.code || w.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-text-secondary block mb-1.5">Lokasi Rak / Bin (Opsional):</label>
                    <input
                      type="text"
                      value={bulkBinLocation}
                      onChange={(e) => setBulkBinLocation(e.target.value)}
                      placeholder="Contoh: Rak A-02 / Zona Barat"
                      className="w-full p-2.5 rounded-xl border border-border-light bg-bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-text-secondary block mb-1.5">Tugaskan ke Proyek (Opsional):</label>
                    <select
                      value={bulkProjectId}
                      onChange={(e) => setBulkProjectId(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-border-light bg-bg-white text-text-primary font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                    >
                      <option value="">-- Tidak Terkait Proyek / Gudang Utama --</option>
                      {projectsList.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.nama} {p.code ? `(${p.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-text-secondary block mb-1.5">Catatan Relokasi (Opsional):</label>
                    <textarea
                      value={bulkNotes}
                      onChange={(e) => setBulkNotes(e.target.value)}
                      placeholder="Alasan transfer atau penugasan massal..."
                      rows={2}
                      className="w-full p-2.5 rounded-xl border border-border-light bg-bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500/20 resize-none"
                    />
                  </div>
                </>
              )}

              {/* DELETE MODAL */}
              {bulkActionModal.type === 'delete' && (
                <div className="flex flex-col gap-3">
                  <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-start gap-3">
                    <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed">
                      <p className="font-bold m-0 mb-1">Peringatan: Penghapusan Permanen</p>
                      <p className="m-0">
                        Anda akan menghapus <strong className="font-black text-rose-700 dark:text-rose-400">{selectedToolIds.length} data alat</strong> beserta file foto fisiknya dari server. Data yang telah dihapus tidak dapat dipulihkan kembali.
                      </p>
                    </div>
                  </div>
                  <p className="text-text-muted text-[11px] m-0">
                    Klik tombol konfirmasi di bawah untuk memproses penghapusan massal.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2.5 p-4 border-t border-border-light bg-slate-50/70 dark:bg-slate-800/50">
              <button
                type="button"
                disabled={bulkSubmitting}
                onClick={() => setBulkActionModal({ isOpen: false, type: null })}
                className="py-2 px-3.5 rounded-xl text-xs font-bold text-text-secondary hover:bg-bg-secondary border border-border-light transition-all cursor-pointer"
              >
                Batal
              </button>

              {bulkActionModal.type === 'condition' && (
                <button
                  type="button"
                  disabled={bulkSubmitting}
                  onClick={handleBulkExecuteCondition}
                  className="py-2 px-4 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {bulkSubmitting ? 'Memproses...' : `Perbarui ${selectedToolIds.length} Alat`}
                </button>
              )}

              {bulkActionModal.type === 'relocate' && (
                <button
                  type="button"
                  disabled={bulkSubmitting}
                  onClick={handleBulkExecuteRelocate}
                  className="py-2 px-4 rounded-xl text-xs font-bold bg-cyan-700 hover:bg-cyan-600 active:bg-cyan-800 text-white transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {bulkSubmitting ? 'Memproses...' : `Pindahkan ${selectedToolIds.length} Alat`}
                </button>
              )}

              {bulkActionModal.type === 'delete' && (
                <button
                  type="button"
                  disabled={bulkSubmitting}
                  onClick={handleBulkExecuteDelete}
                  className="py-2 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {bulkSubmitting ? 'Menghapus...' : `Hapus Permanen (${selectedToolIds.length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

