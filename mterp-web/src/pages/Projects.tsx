import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Plus,
  Trash2,
  ChevronRight,
  Briefcase,
  Copy,
  Check,
  ChevronLeft,
  AlertCircle,
  Users,
  FileText,
  Package,
  ListChecks,
  Key,
  X,
  ChevronDown,
  ChevronUp,
  Code,
  Layers,
  Calendar,
  Search,
  LayoutGrid,
  List,
  MapPin,
  TrendingUp,
  Wallet,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  SlidersHorizontal,
  ExternalLink,
  ShoppingCart,
  Eye,
  Activity,
  Sparkles,
  ClipboardList,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import api, { getApiKeys, createApiKey, updateApiKey, deleteApiKey } from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, ProgressBar, Button, Input, EmptyState, LoadingOverlay, Alert } from '../components/shared';
import { ProjectData, ApiKey } from '../types';
import { formatDate } from '../utils/date';

export default function Projects() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || 'worker';
  const isOwnerOrDirector = ['owner', 'director', 'operational_director', 'president_director'].includes(userRole);

  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);

  // Search, Filter, Sort & View Mode State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'PENDING'>('ALL');
  const [sortBy, setSortBy] = useState<'NEWEST' | 'NAME' | 'PROGRESS_HIGH' | 'PROGRESS_LOW' | 'BUDGET_HIGH'>('NEWEST');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  
  // Progress Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
  const [progressInput, setProgressInput] = useState('');
  const [updating, setUpdating] = useState(false);

  // Wizard State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [duplicateName, setDuplicateName] = useState('');
  const [cloneOptions, setCloneOptions] = useState({
    includeTasks: true,
    includeWorkItems: true,
    includeSupplies: true,
    includeCalendar: true,
    includeResources: true,
    includeDocuments: false,
    includeAssignedUsers: false,
  });
  const [duplicating, setDuplicating] = useState(false);
  const [alertData, setAlertData] = useState({ visible: false, type: 'success' as 'success' | 'error', message: '' });

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isApiKeysOpen, setIsApiKeysOpen] = useState(false);
  const [isApiKeysLoading, setIsApiKeysLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreateKeyModalOpen, setIsCreateKeyModalOpen] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState<ApiKey | null>(null);
  const [hasCopiedKey, setHasCopiedKey] = useState(false);

  useEffect(() => {
    fetchProjects();
    fetchApiKeys();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await api.get('/projects');
      setProjects(response.data);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('projects.actions.deleteConfirm') || 'Apakah Anda yakin ingin menghapus proyek ini?')) return;
    try {
      await api.delete(`/projects/${id}`);
      setProjects((prev) => prev.filter((p) => p._id !== id));
      setAlertData({ visible: true, type: 'success', message: 'Proyek berhasil dihapus' });
    } catch (err) {
      console.error('Failed to delete project', err);
      setAlertData({ visible: true, type: 'error', message: 'Gagal menghapus proyek' });
    }
  };

  const handleUpdateProgress = async () => {
    if (!selectedProject) return;
    setUpdating(true);
    try {
      await api.put(`/projects/${selectedProject._id}/progress`, {
        progress: Number(progressInput),
      });
      fetchProjects();
      setModalOpen(false);
      setProgressInput('');
      setSelectedProject(null);
      setAlertData({ visible: true, type: 'success', message: 'Progres fisik proyek berhasil diperbarui' });
    } catch (err) {
      console.error('Failed to update progress', err);
      setAlertData({ visible: true, type: 'error', message: 'Gagal memperbarui progres' });
    } finally {
      setUpdating(false);
    }
  };

  const handleDuplicate = async () => {
    if (!selectedProject) return;
    setDuplicating(true);
    try {
      const response = await api.post(`/projects/${selectedProject._id}/duplicate`, {
        newName: duplicateName,
        options: cloneOptions,
      });
      setProjects([response.data, ...projects]);
      setWizardOpen(false);
      setAlertData({ visible: true, type: 'success', message: t('projects.actions.duplicateSuccess') || 'Project cloned successfully' });
    } catch (err) {
      console.error('Failed to duplicate project', err);
      setAlertData({ visible: true, type: 'error', message: t('projects.actions.duplicateError') || 'Failed to clone project' });
    } finally {
      setDuplicating(false);
    }
  };

  const openDuplicateWizard = (project: ProjectData) => {
    setSelectedProject(project);
    setDuplicateName(`Copy of ${project.nama || project.name}`);
    setWizardStep(0);
    setCloneOptions({
      includeTasks: true,
      includeWorkItems: true,
      includeSupplies: true,
      includeCalendar: true,
      includeResources: true,
      includeDocuments: false,
      includeAssignedUsers: false,
    });
    setWizardOpen(true);
  };

  // API Key handlers
  const fetchApiKeys = async () => {
    try {
      setIsApiKeysLoading(true);
      const data = await getApiKeys();
      setApiKeys(data);
    } catch (error) {
      console.error('Failed to load API keys', error);
    } finally {
      setIsApiKeysLoading(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    try {
      const res = await createApiKey(newKeyName.trim());
      setCreatedKeyData(res);
      setNewKeyName('');
      setIsCreateKeyModalOpen(false);
      fetchApiKeys();
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        alert(error.response?.data?.msg || 'Failed to create API key');
      } else {
        alert('An unexpected error occurred');
      }
    }
  };

  const handleToggleKeyActive = async (key: ApiKey) => {
    try {
      await updateApiKey(key._id, { isActive: !key.isActive });
      fetchApiKeys();
    } catch (error) {
      console.error('Toggle key error:', error);
      alert('Failed to update API key');
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (window.confirm('Delete this API Key? External applications using it will lose access immediately.')) {
      try {
        await deleteApiKey(id);
        fetchApiKeys();
      } catch (error) {
        console.error('Delete key error:', error);
        alert('Failed to delete API key');
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setHasCopiedKey(true);
    setTimeout(() => setHasCopiedKey(false), 2500);
  };

  // KPI Calculations
  const totalProjects = projects.length;
  const completedProjects = projects.filter((p) => (p.progress || 0) >= 100).length;
  const inProgressProjects = projects.filter((p) => (p.progress || 0) > 0 && (p.progress || 0) < 100).length;
  const pendingProjects = projects.filter((p) => (p.progress || 0) === 0).length;

  const totalPortfolioBudget = projects.reduce(
    (sum, p) => sum + (p.totalBudget || p.budget || (p as any).anggaran || 0),
    0
  );
  const avgProgress =
    totalProjects > 0
      ? Math.round(projects.reduce((sum, p) => sum + (p.progress || 0), 0) / totalProjects)
      : 0;

  // Filtered & Sorted Projects
  const filteredProjects = useMemo(() => {
    return projects
      .filter((project) => {
        const prog = project.progress || 0;
        if (statusFilter === 'COMPLETED' && prog < 100) return false;
        if (statusFilter === 'IN_PROGRESS' && (prog <= 0 || prog >= 100)) return false;
        if (statusFilter === 'PENDING' && prog > 0) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const name = (project.nama || project.name || '').toLowerCase();
          const loc = (project.lokasi || project.location || '').toLowerCase();
          const desc = (project.description || '').toLowerCase();
          return name.includes(q) || loc.includes(q) || desc.includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'NAME') {
          return (a.nama || a.name || '').localeCompare(b.nama || b.name || '');
        }
        if (sortBy === 'PROGRESS_HIGH') {
          return (b.progress || 0) - (a.progress || 0);
        }
        if (sortBy === 'PROGRESS_LOW') {
          return (a.progress || 0) - (b.progress || 0);
        }
        if (sortBy === 'BUDGET_HIGH') {
          const bA = a.totalBudget || a.budget || (a as any).anggaran || 0;
          const bB = b.totalBudget || b.budget || (b as any).anggaran || 0;
          return bB - bA;
        }
        return 0; // Default: latest
      });
  }, [projects, statusFilter, searchQuery, sortBy]);

  // Helpers
  const getProjectTargetDate = (p: ProjectData) => {
    const dateVal = p.endDate || p.globalDates?.planned?.end || (p as any).tanggalSelesai;
    if (!dateVal) return '-';
    return formatDate(dateVal, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getProjectBudgetValue = (p: ProjectData) => {
    return p.totalBudget || p.budget || (p as any).anggaran || 0;
  };

  const renderStatusBadge = (progress: number, status?: string) => {
    if (progress >= 100 || status?.toLowerCase() === 'completed') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 whitespace-nowrap">
          <CheckCircle2 size={12} />
          <span>{t('projects.status.completed') || 'Selesai'}</span>
        </span>
      );
    }
    if (progress > 0 || status?.toLowerCase() === 'in_progress') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
          <span>{t('projects.status.inProgress') || 'Sedang Berjalan'}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-500/10 text-slate-600 border border-slate-500/20 whitespace-nowrap">
        <span>{t('projects.status.pending') || 'Belum Dimulai'}</span>
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <LoadingOverlay visible={loading} />
      
      {alertData.visible && (
        <div className="mb-4">
          <Alert
            visible={alertData.visible}
            type={alertData.type}
            title={alertData.type === 'success' ? 'Berhasil' : 'Error'}
            message={alertData.message}
            onClose={() => setAlertData({ ...alertData, visible: false })}
          />
        </div>
      )}

      {/* Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-light pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <Link to="/home" className="hover:underline flex items-center gap-1">
              <Briefcase size={13} /> Dashboard
            </Link>
            <span>/</span>
            <span className="font-semibold text-text-primary">Portofolio Proyek</span>
          </div>

          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-text-primary tracking-tight flex items-center gap-2.5">
            <Building2 className="text-primary" size={28} />
            <span>{t('projects.title') || 'Manajemen Portofolio Proyek'}</span>
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-0.5">
            Pusat kendali operasional portofolio, monitoring jadwal WBS, dan realisasi anggaran statuter
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* API Keys Toggle */}
          <button 
            className={`flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-all border ${
              isApiKeysOpen 
                ? 'bg-slate-900 text-amber-400 border-slate-900 shadow-sm' 
                : 'bg-bg-white hover:bg-bg-secondary text-text-secondary border-border-light'
            }`}
            onClick={() => setIsApiKeysOpen(!isApiKeysOpen)}
            title="Buka panel API Key untuk integrasi aplikasi pihak ketiga"
          >
            <Key size={15} />
            <span>API Keys</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-400/20 text-amber-600 font-mono font-bold">
              {apiKeys.length}
            </span>
          </button>

          {userRole === 'owner' && (
            <button
              onClick={() => navigate('/add-project')}
              className="px-4 py-2 bg-gradient-to-r from-primary to-primary-hover text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm hover:shadow-md flex items-center gap-2 transition-all cursor-pointer active:scale-95"
            >
              <Plus size={16} />
              <span>{t('projects.add') || 'Tambah Proyek Baru'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Executive ERP KPI Dashboard (Bento Grid) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Projects */}
        <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Portofolio</span>
            <Building2 size={18} className="text-primary" />
          </div>
          <div className="text-2xl sm:text-3xl font-mono font-bold text-text-primary tabular-nums">
            {totalProjects} <span className="text-xs font-normal text-text-muted">Proyek</span>
          </div>
          <div className="text-xs text-text-muted mt-1.5 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
            <span>{inProgressProjects} Berjalan</span>
            <span>•</span>
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span>{completedProjects} Selesai</span>
          </div>
        </div>

        {/* Card 2: Average Physical Progress */}
        <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Rata-Rata Progres</span>
            <TrendingUp size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-mono font-bold text-emerald-600 tabular-nums">
            {avgProgress}%
          </div>
          <div className="mt-2 w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden border border-border-light">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, avgProgress))}%` }}
            />
          </div>
        </div>

        {/* Card 3: Total Portfolio Budget */}
        <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Pagu Anggaran Total</span>
            <Wallet size={18} className="text-blue-600" />
          </div>
          <div className="text-lg sm:text-2xl font-mono font-bold text-blue-600 tabular-nums truncate" title={`Rp ${totalPortfolioBudget.toLocaleString('id-ID')}`}>
            {totalPortfolioBudget > 0 ? `Rp ${totalPortfolioBudget.toLocaleString('id-ID')}` : 'Rp 0'}
          </div>
          <div className="text-xs text-text-muted mt-1.5">
            <span>Akumulasi nilai kontrak aktif</span>
          </div>
        </div>

        {/* Card 4: Operational Readiness */}
        <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Status Pelaksanaan</span>
            <Clock size={18} className="text-amber-500" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xl sm:text-2xl font-mono font-bold text-text-primary">
                {inProgressProjects}
              </span>
              <p className="text-[11px] text-text-muted mt-0.5">Sedang Berjalan</p>
            </div>
            {pendingProjects > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 text-xs font-bold border border-amber-500/20">
                {pendingProjects} Persiapan
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Interactive ERP Control Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-bg-secondary/40 p-3 rounded-xl border border-border-light">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
          {[
            { id: 'ALL', label: 'Semua', count: totalProjects },
            { id: 'IN_PROGRESS', label: 'Berjalan', count: inProgressProjects },
            { id: 'COMPLETED', label: 'Selesai', count: completedProjects },
            { id: 'PENDING', label: 'Persiapan', count: pendingProjects },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-primary text-white shadow-xs font-bold'
                  : 'bg-bg-white text-text-secondary hover:bg-bg-secondary border border-border-light'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-bg-secondary text-text-muted'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search, Sort & View Mode Switcher */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Cari proyek, lokasi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-bg-white border border-border-light rounded-lg pl-9 pr-7 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-bg-white border border-border-light rounded-lg px-2.5 py-1.5 text-xs text-text-secondary font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
          >
            <option value="NEWEST">Terbaru</option>
            <option value="NAME">Nama (A-Z)</option>
            <option value="PROGRESS_HIGH">Progres Tertinggi</option>
            <option value="PROGRESS_LOW">Progres Terendah</option>
            <option value="BUDGET_HIGH">Pagu Terbesar</option>
          </select>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-bg-white rounded-lg border border-border-light p-0.5 shrink-0">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
              title="Tampilan Tabel ERP Matrix"
            >
              <List size={15} />
              <span className="hidden xl:inline text-[11px]">Tabel</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
              title="Tampilan Grid Kartu"
            >
              <LayoutGrid size={15} />
              <span className="hidden xl:inline text-[11px]">Grid</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {projects.length === 0 && !loading ? (
        <EmptyState
          icon={Briefcase}
          title={t('projects.empty.title') || 'Belum Ada Proyek'}
          description={t('projects.empty.desc') || 'Mulai dengan menambahkan proyek baru ke sistem ERP.'}
        />
      ) : filteredProjects.length === 0 ? (
        <div className="bg-bg-white border border-border-light rounded-xl p-12 text-center shadow-xs">
          <Search size={36} className="mx-auto text-text-muted mb-3 opacity-60" />
          <h4 className="text-sm font-bold text-text-primary mb-1">Tidak Ditemukan Proyek</h4>
          <p className="text-xs text-text-muted max-w-md mx-auto mb-4">
            Tidak ada proyek yang sesuai dengan kata kunci pencarian atau filter yang dipilih.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('ALL');
            }}
            className="px-4 py-2 bg-primary/10 text-primary text-xs font-bold rounded-lg hover:bg-primary hover:text-white transition-colors cursor-pointer"
          >
            Reset Filter & Pencarian
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE ERP MATRIX VIEW (Desktop Power-User Experience) */
        <div className="bg-bg-white border border-border-light rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-bg-secondary/60 border-b border-border-light text-text-muted uppercase tracking-wider font-semibold">
                  <th className="py-3.5 px-4 text-left">Nama Proyek</th>
                  <th className="py-3.5 px-4 text-left">Lokasi</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-left min-w-[180px]">Progres Fisik</th>
                  <th className="py-3.5 px-4 text-right">Pagu Anggaran</th>
                  <th className="py-3.5 px-4 text-center">Target Selesai</th>
                  <th className="py-3.5 px-4 text-center min-w-[160px]">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light/60">
                {filteredProjects.map((project) => {
                  const budget = getProjectBudgetValue(project);
                  const prog = project.progress || 0;
                  const targetDate = getProjectTargetDate(project);

                  return (
                    <tr
                      key={project._id}
                      onClick={() => navigate(`/project/${project._id}`)}
                      className="hover:bg-bg-secondary/40 transition-colors cursor-pointer group"
                    >
                      {/* Name & Creator */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <Building2 size={18} />
                          </div>
                          <div>
                            <span className="font-bold text-sm text-text-primary group-hover:text-primary transition-colors block">
                              {project.nama || project.name}
                            </span>
                            <span className="text-[11px] text-text-muted block truncate max-w-xs">
                              {project.description || 'Proyek Konstruksi MTERP'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3.5 px-4 text-text-secondary whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={13} className="text-text-muted shrink-0" />
                          <span className="truncate max-w-[140px]">{project.lokasi || project.location || '-'}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {renderStatusBadge(prog, project.status)}
                      </td>

                      {/* Physical Progress */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-text-muted font-medium">Realisasi</span>
                            <span className="font-mono font-bold text-text-primary">{prog}%</span>
                          </div>
                          <div className="w-full h-2 bg-bg-secondary rounded-full overflow-hidden border border-border-light">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                prog >= 100 ? 'bg-emerald-500' : prog >= 50 ? 'bg-primary' : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, prog))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Budget */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-text-primary whitespace-nowrap tabular-nums">
                        {budget > 0 ? `Rp ${budget.toLocaleString('id-ID')}` : '-'}
                      </td>

                      {/* Target Date */}
                      <td className="py-3.5 px-4 text-center text-text-secondary whitespace-nowrap font-medium">
                        {targetDate}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/project/${project._id}`);
                            }}
                            className="p-1.5 rounded-lg bg-bg-secondary hover:bg-primary hover:text-white text-text-secondary transition-all cursor-pointer"
                            title="Buka Detail Proyek"
                          >
                            <ArrowUpRight size={15} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/project/${project._id}/swakelola`);
                            }}
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-600 transition-all cursor-pointer"
                            title="Buka Supply Chain Swakelola (RAB & UMK)"
                          >
                            <ShoppingCart size={15} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/tasks?projectId=${project._id}`);
                            }}
                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-600 transition-all cursor-pointer"
                            title="Lihat Tugas Proyek"
                          >
                            <ClipboardList size={15} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProject(project);
                              setProgressInput(String(project.progress || 0));
                              setModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 transition-all cursor-pointer"
                            title="Perbarui Progres Fisik"
                          >
                            <TrendingUp size={15} />
                          </button>

                          {isOwnerOrDirector && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openDuplicateWizard(project);
                              }}
                              className="p-1.5 rounded-lg bg-bg-secondary hover:bg-border-light text-text-secondary transition-all cursor-pointer"
                              title="Duplikasi Proyek"
                            >
                              <Copy size={15} />
                            </button>
                          )}

                          {userRole === 'owner' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(project._id!);
                              }}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 transition-all cursor-pointer"
                              title="Hapus Proyek"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* GRID KARTU VIEW (Visual Modern Card Dashboard) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {filteredProjects.map((project) => {
            const budget = getProjectBudgetValue(project);
            const prog = project.progress || 0;
            const targetDate = getProjectTargetDate(project);

            return (
              <div
                key={project._id}
                onClick={() => navigate(`/project/${project._id}`)}
                className="bg-bg-white border border-border-light hover:border-primary/40 rounded-xl p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between group space-y-4"
              >
                {/* Card Header */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <Building2 size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-text-primary group-hover:text-primary transition-colors line-clamp-1">
                          {project.nama || project.name}
                        </h3>
                        <div className="flex items-center gap-1 text-xs text-text-muted mt-0.5">
                          <MapPin size={12} className="shrink-0 text-text-muted" />
                          <span className="truncate max-w-[180px]">{project.lokasi || project.location || 'Lokasi tidak diset'}</span>
                        </div>
                      </div>
                    </div>
                    {renderStatusBadge(prog, project.status)}
                  </div>

                  {project.description && (
                    <p className="text-xs text-text-muted line-clamp-2 mt-2 leading-relaxed">
                      {project.description}
                    </p>
                  )}
                </div>

                {/* Card Progress */}
                <div className="space-y-1.5 bg-bg-secondary/30 p-3 rounded-lg border border-border-light/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted font-medium flex items-center gap-1">
                      <TrendingUp size={13} className="text-primary" />
                      <span>Realisasi Fisik</span>
                    </span>
                    <span className="font-mono font-bold text-text-primary text-sm">{prog}%</span>
                  </div>
                  <div className="w-full h-2 bg-bg-secondary rounded-full overflow-hidden border border-border-light/60">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        prog >= 100 ? 'bg-emerald-500' : prog >= 50 ? 'bg-primary' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, prog))}%` }}
                    />
                  </div>
                </div>

                {/* 2x2 ERP Stats Matrix */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-bg-secondary/40 p-2.5 rounded-lg border border-border-light/50">
                    <span className="text-[10px] uppercase font-bold text-text-muted block">Pagu Anggaran</span>
                    <span className="font-mono font-bold text-text-primary block truncate">
                      {budget > 0 ? `Rp ${budget.toLocaleString('id-ID')}` : 'Tidak diset'}
                    </span>
                  </div>

                  <div className="bg-bg-secondary/40 p-2.5 rounded-lg border border-border-light/50">
                    <span className="text-[10px] uppercase font-bold text-text-muted block">Target Selesai</span>
                    <span className="font-medium text-text-primary block truncate">
                      {targetDate}
                    </span>
                  </div>
                </div>

                {/* Card Footer Toolbar */}
                <div className="flex items-center justify-between pt-3 border-t border-border-light/70 gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/project/${project._id}`);
                    }}
                    className="flex-1 py-1.5 px-3 bg-primary/10 hover:bg-primary text-primary hover:text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Detail Proyek</span>
                    <ArrowUpRight size={14} />
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/project/${project._id}/swakelola`);
                      }}
                      className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer"
                      title="Supply Chain Swakelola (RAB & UMK)"
                    >
                      <ShoppingCart size={15} />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/tasks?projectId=${project._id}`);
                      }}
                      className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer"
                      title="Lihat Tugas Proyek"
                    >
                      <ClipboardList size={15} />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProject(project);
                        setProgressInput(String(project.progress || 0));
                        setModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer"
                      title="Perbarui Progres"
                    >
                      <TrendingUp size={15} />
                    </button>

                    {isOwnerOrDirector && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDuplicateWizard(project);
                        }}
                        className="p-1.5 rounded-lg bg-bg-secondary text-text-secondary hover:bg-border-light transition-colors cursor-pointer"
                        title="Duplikasi Proyek"
                      >
                        <Copy size={15} />
                      </button>
                    )}

                    {userRole === 'owner' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(project._id!);
                        }}
                        className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                        title="Hapus Proyek"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================== */}
      {/* API KEY MANAGEMENT SECTION (COLLAPSIBLE)  */}
      {/* ========================================== */}
      <Card className="border-2 border-border-light overflow-hidden mt-6">
        <div 
          className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex justify-between items-center cursor-pointer select-none"
          onClick={() => setIsApiKeysOpen(!isApiKeysOpen)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0">
              <Key size={20} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black uppercase tracking-tight m-0">
                  Manajemen API Key (Akses Aplikasi Eksternal)
                </h3>
                <span className="bg-amber-400 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full uppercase">
                  External Access
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium m-0 mt-0.5">
                Kunci otorisasi untuk membaca data proyek dari sistem luar (endpoint: <code className="text-amber-300">/api/projects</code>)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsCreateKeyModalOpen(true);
              }}
              className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95"
            >
              <Plus size={15} strokeWidth={3} />
              <span>Buat API Key</span>
            </button>
            {isApiKeysOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>

        {isApiKeysOpen && (
          <div className="p-6 bg-bg-white space-y-6">
            {/* Documentation banner */}
            <div className="bg-slate-50 border-2 border-slate-200 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="text-xs font-black text-slate-900 uppercase flex items-center gap-1.5">
                  <Code size={16} className="text-primary" />
                  Format Pemanggilan API Eksternal
                </span>
                <p className="text-xs text-text-secondary mt-1 font-mono bg-white p-2 rounded border border-slate-200 inline-block">
                  GET /api/projects &nbsp;|&nbsp; Header: <span className="font-bold text-primary">X-API-Key: mterp_xxxxxxxx...</span>
                </p>
              </div>
              <div className="text-xs text-text-muted font-bold">
                Mendukung query parameter: <code className="text-primary">page, limit, search, status</code>
              </div>
            </div>

            {/* API Keys List */}
            {isApiKeysLoading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-10 bg-bg-secondary/30 rounded-xl border border-border-light">
                <Key size={32} className="mx-auto text-text-muted mb-2 opacity-50" />
                <h4 className="text-sm font-black text-text-primary mb-1">Belum Ada API Key</h4>
                <p className="text-xs text-text-muted max-w-md mx-auto mb-4">
                  Buat API key baru untuk menghubungkan sistem manajemen proyek eksternal atau dashboard pihak ketiga.
                </p>
                <button
                  onClick={() => setIsCreateKeyModalOpen(true)}
                  className="bg-primary text-white text-xs font-black px-4 py-2 rounded-xl uppercase tracking-wider"
                >
                  Buat Key Sekarang
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border-light border-2 border-border-light rounded-xl overflow-hidden">
                {apiKeys.map((key) => (
                  <div key={key._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        key.isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        <Key size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-text-primary">{key.name}</span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.2 rounded-full border ${
                            key.isActive 
                              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' 
                              : 'bg-red-500/10 text-red-700 border-red-500/30'
                          }`}>
                            {key.isActive ? 'Aktif' : 'Non-aktif'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-muted font-bold mt-0.5">
                          <span>Prefix: <code className="font-mono text-slate-800 font-black">{key.keyPrefix}••••••••</code></span>
                          <span>•</span>
                          <span>Dibuat: {new Date(key.createdAt).toLocaleDateString('id-ID')}</span>
                          {key.lastUsedAt && (
                            <>
                              <span>•</span>
                              <span>Terakhir digunakan: {new Date(key.lastUsedAt).toLocaleString('id-ID')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleToggleKeyActive(key)}
                        className={`text-xs font-black px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                          key.isActive 
                            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100' 
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        {key.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button
                        onClick={() => handleDeleteApiKey(key._id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer transition-all"
                        title="Hapus Key"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Update Progress Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setModalOpen(false)}>
          <div className="bg-bg-white p-6 rounded-xl w-full max-w-md shadow-xl text-text-primary animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-primary m-0 mb-1">{t('projects.actions.updateProgress')}</h3>
            <p className="text-sm text-text-muted m-0 mb-4">{selectedProject?.nama || selectedProject?.name}</p>
            <Input
              type="number"
              placeholder={t('projects.form.progressPlaceholder')}
              value={progressInput}
              onChangeText={setProgressInput}
            />
            <div className="flex gap-3 mt-4 justify-end max-sm:flex-col [&_button]:max-sm:w-full">
              <div className="max-sm:w-full">
                <Button
                  title={t('projects.actions.cancel')}
                  onClick={() => setModalOpen(false)}
                  variant="outline"
                />
              </div>
              <div className="max-sm:w-full">
                <Button
                  title={t('projects.actions.save')}
                  onClick={handleUpdateProgress}
                  loading={updating}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Wizard Modal */}
      {wizardOpen && (
        <div className="fixed inset-0 bg-black/60 z-[101] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setWizardOpen(false)}>
          <div className="bg-bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {/* Wizard Header & Progress */}
            <div className="p-6 pb-4 border-b border-border-light bg-bg-secondary/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Copy size={22} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text-primary m-0">Duplicate Project</h3>
                  <p className="text-xs text-text-muted m-0">Clone project structure and settings</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 px-1">
                {[0, 1, 2].map(step => (
                  <div key={step} className="flex-1 flex flex-col gap-1.5">
                    <div className={`h-1.5 rounded-full transition-all duration-300 ${wizardStep >= step ? 'bg-primary' : 'bg-border'}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${wizardStep === step ? 'text-primary' : 'text-text-muted'}`}>
                      {step === 0 ? 'Name' : step === 1 ? 'Options' : 'Confirm'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Wizard Content */}
            <div className="p-8 min-h-[280px] max-h-[60vh] overflow-y-auto">
              {wizardStep === 0 && (
                <div className="animate-fade-in">
                  <h4 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                    <AlertCircle size={16} className="text-primary" />
                    Set project identity
                  </h4>
                  <p className="text-xs text-text-muted mb-6 leading-relaxed">
                    Choose a name for the new project. All basic data like location and budget will be carried over from <span className="font-semibold text-text-primary">"{selectedProject?.nama}"</span>.
                  </p>
                  <Input
                    label="Project Name"
                    placeholder="Enter new name"
                    value={duplicateName}
                    onChangeText={setDuplicateName}
                  />
                </div>
              )}

              {wizardStep === 1 && (
                <div className="animate-fade-in">
                  <h4 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                    <ListChecks size={16} className="text-primary" />
                    Select components to clone
                  </h4>
                  <div className="space-y-3">
                    {[
                      { id: 'includeTasks', label: 'Jadwal & Struktur WBS', icon: Layers, desc: 'Hierarki WBS, durasi, dependensi CPM, dan baseline (Single Source of Truth)' },
                      { id: 'includeWorkItems', label: 'Item Pekerjaan Konstruksi', icon: ListChecks, desc: 'Daftar item pekerjaan lapangan (progres di-reset ke 0%)' },
                      { id: 'includeSupplies', label: 'Rencana Pengadaan Material', icon: Package, desc: 'Daftar pengadaan material & status pengadaan logistik' },
                      { id: 'includeCalendar', label: 'Kalender Kerja Proyek', icon: Calendar, desc: 'Hari kerja standar konstruksi dan libur nasional' },
                      { id: 'includeResources', label: 'Sumber Daya & Tenaga Kerja', icon: Users, desc: 'Alokasi staf pengawas, alat berat, dan tarif tenaga kerja' },
                      { id: 'includeDocuments', label: 'Dokumen Teknis & Gambar', icon: FileText, desc: 'Salin referensi file shop drawing dan izin proyek' },
                      { id: 'includeAssignedUsers', label: 'Penugasan Anggota Tim', icon: Users, desc: 'Salin penugasan site manager dan staf ke proyek baru' },
                    ].map(opt => (
                      <label 
                        key={opt.id} 
                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer hover:bg-bg-secondary group ${
                          (cloneOptions as any)[opt.id] ? 'border-primary/40 bg-primary/5' : 'border-border'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 accent-primary w-4 h-4"
                          checked={(cloneOptions as any)[opt.id]}
                          onChange={(e) => setCloneOptions({ ...cloneOptions, [opt.id]: e.target.checked })}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <opt.icon size={14} className={(cloneOptions as any)[opt.id] ? 'text-primary' : 'text-text-muted'} />
                            <span className={`text-sm font-bold ${(cloneOptions as any)[opt.id] ? 'text-text-primary' : 'text-text-secondary'}`}>
                              {opt.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-muted m-0">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="animate-fade-in text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-success/10 text-success mx-auto flex items-center justify-center mb-4">
                    <Check size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-text-primary mb-2">Ready to Clone</h4>
                  <p className="text-sm text-text-muted px-4 mb-6">
                    Menduplikasi proyek <span className="font-bold text-text-primary">"{selectedProject?.nama || selectedProject?.name}"</span> menjadi <span className="font-bold text-text-primary">"{duplicateName}"</span>.
                    Struktur WBS, kalender, dan RAB akan otomatis disinkronkan ke sumber data tunggal.
                  </p>
                  
                  <div className="inline-flex flex-wrap justify-center gap-2 max-w-sm px-4">
                    {Object.entries(cloneOptions).map(([key, val]) => val && (
                      <div key={key} className="px-3 py-1 bg-bg-secondary rounded-full text-[10px] font-bold text-text-muted border border-border">
                        {key === 'includeTasks' ? 'Struktur WBS' :
                         key === 'includeWorkItems' ? 'Pekerjaan' :
                         key === 'includeSupplies' ? 'Material' :
                         key === 'includeCalendar' ? 'Kalender' :
                         key === 'includeResources' ? 'Sumber Daya' :
                         key === 'includeDocuments' ? 'Dokumen' : 'Anggota Tim'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Footer */}
            <div className="p-6 bg-bg-secondary/30 border-t border-border-light flex justify-between gap-4">
              <Button
                title={wizardStep === 0 ? "Cancel" : "Back"}
                icon={wizardStep === 0 ? undefined : ChevronLeft}
                onClick={() => wizardStep === 0 ? setWizardOpen(false) : setWizardStep(prev => prev - 1)}
                variant="outline"
                size="small"
              />
              <Button
                title={wizardStep === 2 ? "Duplicate Project" : "Next Step"}
                icon={wizardStep === 2 ? Check : ChevronRight}
                iconPosition="right"
                onClick={() => wizardStep === 2 ? handleDuplicate() : setWizardStep(prev => prev + 1)}
                loading={duplicating}
                variant={wizardStep === 2 ? "success" : "primary"}
                size={wizardStep === 2 ? "medium" : "small"}
                disabled={wizardStep === 0 && !duplicateName.trim()}
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: CREATE API KEY                      */}
      {/* ========================================== */}
      {isCreateKeyModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" onClick={() => setIsCreateKeyModalOpen(false)}>
          <div className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[460px] shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b-2 border-border-light bg-slate-900 text-white flex justify-between items-center sticky top-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 font-black">
                  <Key size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight m-0">Buat API Key Baru</h3>
                  <span className="text-xs text-slate-300">Akses eksternal endpoint /api/projects</span>
                </div>
              </div>
              <button className="w-8 h-8 rounded-full bg-white/10 border-none flex items-center justify-center text-white cursor-pointer" onClick={() => setIsCreateKeyModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateApiKey} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase mb-1.5">
                  Nama Identitas Kunci (Label) *
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Dashboard Proyek, Sistem Monitoring"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full px-3.5 py-3 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
                Kunci mentah hanya akan ditampilkan <strong>sekali</strong> setelah dibuat. Simpan di tempat yang aman.
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  className="flex-1 py-3.5 bg-bg-white border-2 border-border-light rounded-xl text-xs font-black text-text-secondary cursor-pointer hover:bg-bg-secondary uppercase tracking-wider" 
                  onClick={() => setIsCreateKeyModalOpen(false)}
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="flex-[2] py-3.5 bg-primary text-white border-none rounded-xl text-xs font-black cursor-pointer hover:bg-primary/90 uppercase tracking-wider shadow-lg shadow-primary/20"
                >
                  Generate Kunci
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: SHOW CREATED API KEY (ONCE)         */}
      {/* ========================================== */}
      {createdKeyData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1100] p-4 animate-in fade-in duration-200">
          <div className="bg-bg-white rounded-3xl w-full max-w-[500px] shadow-2xl overflow-hidden flex flex-col p-6 space-y-4 border-2 border-amber-400">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Key size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-text-primary m-0 uppercase">API Key Berhasil Dibuat</h3>
                <span className="text-xs font-bold text-text-muted">{createdKeyData.name}</span>
              </div>
            </div>

            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl text-xs text-red-800 font-bold">
              PENTING: Salin kunci ini sekarang! Kunci ini tidak dapat ditampilkan kembali setelah Anda menutup jendela ini.
            </div>

            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase mb-1.5">
                Kunci API (Header: X-API-Key)
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={createdKeyData.rawKey || ''}
                  className="flex-1 p-3 bg-slate-100 border-2 border-slate-300 rounded-xl font-mono text-xs font-black select-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdKeyData.rawKey || '')}
                  className="flex items-center gap-1.5 bg-primary text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-primary/90 active:scale-95 cursor-pointer shrink-0"
                >
                  {hasCopiedKey ? <Check size={16} /> : <Copy size={16} />}
                  <span>{hasCopiedKey ? 'Tersalin' : 'Salin'}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCreatedKeyData(null)}
              className="w-full py-3.5 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all cursor-pointer mt-2"
            >
              Saya Sudah Menyimpan Kunci Ini
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
