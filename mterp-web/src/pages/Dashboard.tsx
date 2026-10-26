import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BarChart3,
    TrendingUp,
    DollarSign,
    ClipboardList,
    Users,
    AlertCircle,
    Package,
    ChevronDown,
    Loader,
    Clock,
    UserCheck,
    Wallet,
    Calendar,
    LogIn,
    PlusCircle,
    HardHat,
    RefreshCw,
    Search,
    ArrowUpRight,
    Briefcase,
    CheckCircle2,
    Clock3,
    AlertTriangle,
    FileText,
    ArrowRight,
    Filter,
    Building2,
    X,
    Sparkles,
    ShieldAlert,
    Wrench,
    CheckSquare,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    Legend,
} from 'recharts';
import api from '../api/api';
import { Card, Badge, EmptyState } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import { useTabs } from '../contexts/TabsContext';
import { formatDate as formatWIBDate, formatTime as formatWIBTime } from '../utils/date';
import { formatRupiah as formatCurrency } from '../utils/currency';
import { WorkerEntry } from '../types';

interface WeeklyTrendEntry {
    date: string;
    dayLabel: string;
    present: number;
    late: number;
    absent: number;
    permit: number;
    total: number;
}

interface WageSummary {
    totalWages: number;
    totalPaid: number;
    totalUnpaid: number;
    totalOvertime: number;
    recordsPaid: number;
    recordsUnpaid: number;
}

interface DashboardData {
    projectList: { _id: string; nama: string }[];
    totalProjects: number;
    statusCounts: Record<string, number>;
    totalBudget: number;
    actualSpend: number;
    avgProgress: number;
    taskStatusCounts: Record<string, number>;
    totalTasks: number;
    attendanceCounts: Record<string, number>;
    totalAttendanceToday: number;
    totalUnpaid: number;
    pendingRequests: number;
    progressTimeline: { date: string; progress: number }[];
    todayWorkers: WorkerEntry[];
    weeklyTrend: WeeklyTrendEntry[];
    wageSummary: WageSummary;
    totalWorkers: number;
}

const TASK_COLORS: Record<string, string> = {
    in_progress: '#3B82F6',
    pending: '#F59E0B',
    completed: '#10B981',
    cancelled: '#94A3B8',
};

const TASK_LABELS: Record<string, string> = {
    in_progress: 'Dikerjakan',
    pending: 'Menunggu',
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    Present: { label: 'Hadir', color: '#047857', bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60', dot: 'bg-emerald-500' },
    Late: { label: 'Terlambat', color: '#B45309', bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60', dot: 'bg-amber-500' },
    Absent: { label: 'Alpa', color: '#BE123C', bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/60', dot: 'bg-rose-500' },
    'Half-day': { label: 'Setengah Hari', color: '#4338CA', bg: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60', dot: 'bg-indigo-500' },
    Permit: { label: 'Izin', color: '#6D28D9', bg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/60', dot: 'bg-purple-500' },
};

export default function Dashboard() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { openTab } = useTabs();

    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedProject, setSelectedProject] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [projectSearch, setProjectSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Live Workforce Filter State
    const [workerSearch, setWorkerSearch] = useState('');
    const [workerStatusFilter, setWorkerStatusFilter] = useState<string>('all');

    const handleNavigate = (path: string) => {
        if (openTab) {
            openTab(path);
        } else {
            navigate(path);
        }
    };

    // Close project dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        if (dropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [dropdownOpen]);

    const fetchDashboard = async (isManual = false) => {
        try {
            if (isManual) setRefreshing(true);
            else setLoading(true);

            const params = selectedProject ? `?projectId=${selectedProject}` : '';
            const response = await api.get(`/dashboard${params}`);
            setData(response.data);
        } catch (err) {
            console.error('Failed to fetch dashboard data', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchDashboard();
    }, [selectedProject]);

    const selectedProjectName = useMemo(() => {
        if (!selectedProject) return 'Semua Proyek Aktif';
        return data?.projectList.find((p) => p._id === selectedProject)?.nama || 'Proyek';
    }, [selectedProject, data?.projectList]);

    const filteredProjectList = useMemo(() => {
        if (!data?.projectList) return [];
        if (!projectSearch.trim()) return data.projectList;
        return data.projectList.filter(p => 
            p.nama.toLowerCase().includes(projectSearch.toLowerCase().trim())
        );
    }, [data?.projectList, projectSearch]);

    // Task Pie Data with accurate labels
    const taskPieData = useMemo(() => {
        if (!data?.taskStatusCounts) return [];
        return Object.entries(data.taskStatusCounts)
            .filter(([, v]) => v > 0)
            .map(([key, value]) => ({
                key,
                name: TASK_LABELS[key] || key,
                value,
                color: TASK_COLORS[key] || '#94A3B8',
            }));
    }, [data?.taskStatusCounts]);

    // Financial Metrics
    const budgetPercent = useMemo(() => {
        if (!data || !data.totalBudget || data.totalBudget <= 0) return 0;
        return Math.min(100, Math.round((data.actualSpend / data.totalBudget) * 100));
    }, [data?.totalBudget, data?.actualSpend]);

    // Attendance Metrics
    const attendanceRate = useMemo(() => {
        if (!data || !data.totalWorkers || data.totalWorkers <= 0) return 0;
        return Math.min(100, Math.round((data.totalAttendanceToday / data.totalWorkers) * 100));
    }, [data?.totalAttendanceToday, data?.totalWorkers]);

    // Filtered Workers for Live Feed
    const filteredWorkers = useMemo(() => {
        if (!data?.todayWorkers) return [];
        return data.todayWorkers.filter((w) => {
            if (workerStatusFilter !== 'all' && w.status !== workerStatusFilter) return false;
            if (workerSearch.trim()) {
                const q = workerSearch.toLowerCase().trim();
                const matchName = w.name.toLowerCase().includes(q);
                const matchProject = w.project?.toLowerCase().includes(q);
                const matchRole = w.role?.toLowerCase().includes(q);
                if (!matchName && !matchProject && !matchRole) return false;
            }
            return true;
        });
    }, [data?.todayWorkers, workerStatusFilter, workerSearch]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 11) return 'Selamat Pagi';
        if (hour < 15) return 'Selamat Siang';
        if (hour < 18) return 'Selamat Sore';
        return 'Selamat Malam';
    };

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-text-muted">
                <Loader className="animate-spin text-primary" size={36} />
                <p className="text-sm font-semibold tracking-wide">Memuat Dashboard Eksekutif...</p>
            </div>
        );
    }

    if (!data) return null;

    const userName = user?.fullName || user?.username || 'Pimpinan';
    const userRole = user?.role ? user.role.replace(/_/g, ' ').toUpperCase() : 'MANAGEMENT';
    const formattedDate = formatWIBDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6 animate-in fade-in duration-200">
            {/* ─── 1. EXECUTIVE COMMAND HEADER ────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs relative overflow-hidden transition-all">
                {/* Background ambient accent */}
                <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/5 dark:bg-primary/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    {/* User Greeting & Context */}
                    <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                                <Sparkles size={12} />
                                {userRole}
                            </span>
                            <span className="text-xs font-semibold text-text-muted flex items-center gap-1">
                                <Calendar size={13} className="text-text-muted" />
                                {formattedDate}
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight m-0">
                            {getGreeting()}, <span className="text-primary">{userName}</span>
                        </h1>
                        <p className="text-xs sm:text-sm text-text-secondary m-0">
                            Ringkasan performa operasional, realisasi anggaran, dan kehadiran personel lapangan.
                        </p>
                    </div>

                    {/* Filter & Action Controls */}
                    <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
                        {/* Project Selector Popover */}
                        <div className="relative" ref={dropdownRef}>
                            <button
                                type="button"
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-xs ${
                                    dropdownOpen || selectedProject
                                        ? 'bg-primary text-white border-primary shadow-primary/20'
                                        : 'bg-slate-50 dark:bg-slate-800/80 text-text-primary border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                                title="Filter Analitik Berdasarkan Proyek"
                            >
                                <Briefcase size={16} className={selectedProject ? 'text-white' : 'text-primary'} />
                                <span className="max-w-[180px] sm:max-w-[220px] truncate">{selectedProjectName}</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {dropdownOpen && (
                                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-light dark:border-slate-800">
                                        <span className="text-xs font-black text-text-primary uppercase tracking-wider">Pilih Lingkup Proyek</span>
                                        <span className="text-[11px] font-mono text-text-muted">
                                            {data.projectList.length} Proyek
                                        </span>
                                    </div>

                                    {/* Search input in project dropdown */}
                                    <div className="relative mb-2">
                                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <input
                                            type="text"
                                            value={projectSearch}
                                            onChange={(e) => setProjectSearch(e.target.value)}
                                            placeholder="Cari nama proyek..."
                                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-text-primary focus:outline-hidden focus:border-primary"
                                            autoFocus
                                        />
                                    </div>

                                    <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedProject('');
                                                setDropdownOpen(false);
                                                setProjectSearch('');
                                            }}
                                            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-between ${
                                                !selectedProject
                                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                                    : 'text-text-primary hover:bg-slate-50 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            <span>Semua Proyek (Konsolidasi)</span>
                                            {!selectedProject && <CheckCircle2 size={14} className="text-primary" />}
                                        </button>

                                        {filteredProjectList.map((p) => {
                                            const isSelected = selectedProject === p._id;
                                            return (
                                                <button
                                                    key={p._id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedProject(p._id);
                                                        setDropdownOpen(false);
                                                        setProjectSearch('');
                                                    }}
                                                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                                                        isSelected
                                                            ? 'bg-primary/10 text-primary border border-primary/20 font-bold'
                                                            : 'text-text-primary hover:bg-slate-50 dark:hover:bg-slate-800'
                                                    }`}
                                                >
                                                    <span className="truncate">{p.nama}</span>
                                                    {isSelected && <CheckCircle2 size={14} className="text-primary shrink-0" />}
                                                </button>
                                            );
                                        })}

                                        {filteredProjectList.length === 0 && (
                                            <div className="py-4 text-center text-xs text-text-muted">
                                                Proyek tidak ditemukan
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Refresh Button */}
                        <button
                            type="button"
                            onClick={() => fetchDashboard(true)}
                            disabled={refreshing}
                            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                            title="Segarkan Data"
                        >
                            <RefreshCw size={16} className={refreshing ? 'animate-spin text-primary' : ''} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── 2. HIGH-IMPACT EXECUTIVE KPI BENTO GRID ───────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Portofolio Proyek */}
                <Card className="!p-5 flex flex-col justify-between border border-slate-200/80 dark:border-slate-800 hover:border-primary/40 dark:hover:border-primary/40 transition-all shadow-xs group">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Portofolio Proyek</span>
                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                            <Building2 size={20} />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                                {data.totalProjects}
                            </span>
                            <span className="text-xs font-semibold text-text-muted">Proyek Aktif</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-3.5 flex-wrap">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                                {data.statusCounts['In Progress'] || 0} Berjalan
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                                {data.statusCounts['Completed'] || 0} Selesai
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                {data.statusCounts['Planning'] || 0} Rencana
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleNavigate('/projects')}
                        className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                        <span>Kelola Portofolio</span>
                        <ArrowRight size={13} />
                    </button>
                </Card>

                {/* Realisasi Anggaran & Biaya */}
                <Card className="!p-5 flex flex-col justify-between border border-slate-200/80 dark:border-slate-800 hover:border-primary/40 dark:hover:border-primary/40 transition-all shadow-xs group">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Realisasi Biaya Lapangan</span>
                        <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                            <DollarSign size={20} />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                                {formatCurrency(data.actualSpend)}
                            </span>
                        </div>
                        <div className="mt-3.5 space-y-1.5">
                            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                                        budgetPercent > 90 ? 'bg-rose-500' : budgetPercent > 75 ? 'bg-amber-500' : 'bg-primary'
                                    }`}
                                    style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between items-center text-[11px] font-semibold">
                                <span className={budgetPercent > 90 ? 'text-rose-600 font-bold' : 'text-amber-600 dark:text-amber-400'}>
                                    {budgetPercent}% terpakai
                                </span>
                                <span className="text-text-muted truncate max-w-[150px]">
                                    Pagu: {formatCurrency(data.totalBudget)}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-text-muted font-medium">
                        <span>Kontrol Anggaran</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">WorkItems + Supplies</span>
                    </div>
                </Card>

                {/* Rata-Rata Progres Fisik */}
                <Card className="!p-5 flex flex-col justify-between border border-slate-200/80 dark:border-slate-800 hover:border-primary/40 dark:hover:border-primary/40 transition-all shadow-xs group">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Rata-Rata Progres Fisik</span>
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                            <TrendingUp size={20} />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                                {data.avgProgress}%
                            </span>
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                Terpantau
                            </span>
                        </div>
                        <div className="mt-3.5 space-y-1.5">
                            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 rounded-full transition-all duration-700 ease-out"
                                    style={{ width: `${Math.min(data.avgProgress, 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between items-center text-[11px] text-text-muted font-semibold">
                                <span>Verifikasi Lapangan</span>
                                <span className="text-text-secondary">{data.progressTimeline.length} Catatan Laporan</span>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleNavigate('/daily-report')}
                        className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                        <span>Lihat Laporan Harian</span>
                        <ArrowRight size={13} />
                    </button>
                </Card>

                {/* Status Tugas & Eksekusi */}
                <Card className="!p-5 flex flex-col justify-between border border-slate-200/80 dark:border-slate-800 hover:border-primary/40 dark:hover:border-primary/40 transition-all shadow-xs group">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Status Tugas Proyek</span>
                        <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/40 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                            <ClipboardList size={20} />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                                {data.totalTasks}
                            </span>
                            <span className="text-xs font-semibold text-text-muted">Total Pekerjaan</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-3.5 flex-wrap">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                                {data.taskStatusCounts.in_progress || 0} Dikerjakan
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">
                                {data.taskStatusCounts.pending || 0} Menunggu
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                                {data.taskStatusCounts.completed || 0} Selesai
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleNavigate('/tasks')}
                        className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                        <span>Kelola Daftar Tugas</span>
                        <ArrowRight size={13} />
                    </button>
                </Card>
            </div>

            {/* ─── 3. STRATEGIC ATTENTION & BOTTLENECK STRIP ─────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Pending Approvals Alert */}
                <div 
                    onClick={() => handleNavigate('/approvals')}
                    className="p-4 rounded-xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30 flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors shadow-2xs group"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <AlertCircle size={20} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-amber-950 dark:text-amber-200">Menunggu Persetujuan</span>
                                <span className="px-2 py-0.2 rounded-full text-[11px] font-black bg-amber-200/80 dark:bg-amber-800 text-amber-900 dark:text-amber-100">
                                    {data.pendingRequests}
                                </span>
                            </div>
                            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 m-0 truncate">
                                Material, kasbon & permohonan butuh otorisasi
                            </p>
                        </div>
                    </div>
                    <ArrowRight size={16} className="text-amber-700 dark:text-amber-300 group-hover:translate-x-1 transition-transform shrink-0" />
                </div>

                {/* Unpaid Wages Alert */}
                <div 
                    onClick={() => handleNavigate('/attendance-recap')}
                    className="p-4 rounded-xl border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 flex items-center justify-between gap-3 cursor-pointer hover:bg-rose-100/60 dark:hover:bg-rose-900/40 transition-colors shadow-2xs group"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <Wallet size={20} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-rose-950 dark:text-rose-200">Upah Belum Terbayar</span>
                                <span className="px-2 py-0.2 rounded-full text-[10px] font-black bg-rose-200/80 dark:bg-rose-800 text-rose-900 dark:text-rose-100 tabular-nums">
                                    {formatCurrency(data.totalUnpaid)}
                                </span>
                            </div>
                            <p className="text-xs text-rose-800/80 dark:text-rose-300/80 m-0 truncate">
                                Tunggakan gaji harian & lembur pekerja
                            </p>
                        </div>
                    </div>
                    <ArrowRight size={16} className="text-rose-700 dark:text-rose-300 group-hover:translate-x-1 transition-transform shrink-0" />
                </div>

                {/* Today's Attendance Overview */}
                <div 
                    onClick={() => handleNavigate('/attendance')}
                    className="p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 flex items-center justify-between gap-3 cursor-pointer hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 transition-colors shadow-2xs group"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <UserCheck size={20} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-emerald-950 dark:text-emerald-200">Presensi Hari Ini</span>
                                <span className="px-2 py-0.2 rounded-full text-[11px] font-black bg-emerald-200/80 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100">
                                    {attendanceRate}%
                                </span>
                            </div>
                            <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 m-0 truncate">
                                {data.totalAttendanceToday} dari {data.totalWorkers} personel telah check-in
                            </p>
                        </div>
                    </div>
                    <ArrowRight size={16} className="text-emerald-700 dark:text-emerald-300 group-hover:translate-x-1 transition-transform shrink-0" />
                </div>
            </div>

            {/* ─── 4. ANALYTICS & VISUALIZATION ROW ────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Progress Timeline AreaChart (2 Cols) */}
                <Card className="lg:col-span-2 !p-5 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <TrendingUp size={16} className="text-primary" />
                                <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">Kurva Progres Proyek</h3>
                            </div>
                            <p className="text-xs text-text-muted m-0">Akumulasi tren persentase penyelesaian fisik pekerjaan lapangan</p>
                        </div>
                        <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                            {selectedProjectName}
                        </span>
                    </div>

                    {data.progressTimeline.length > 0 ? (
                        <div className="w-full h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.progressTimeline}>
                                    <defs>
                                        <linearGradient id="progressGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                                        tickFormatter={(v: string) => {
                                            const d = new Date(v);
                                            return `${d.getDate()}/${d.getMonth() + 1}`;
                                        }}
                                    />
                                    <YAxis
                                        domain={[0, 100]}
                                        tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                                        tickFormatter={(v: number) => `${v}%`}
                                    />
                                    <Tooltip
                                        formatter={(v: any) => [`${v ?? 0}%`, 'Progres']}
                                        labelFormatter={(lbl: any) => `Tanggal: ${formatWIBDate(lbl)}`}
                                        contentStyle={{
                                            background: 'var(--bg-white)',
                                            borderRadius: '12px',
                                            border: '1px solid var(--border)',
                                            boxShadow: 'var(--shadow-md)',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="progress"
                                        stroke="#2563EB"
                                        strokeWidth={2.5}
                                        fillOpacity={1}
                                        fill="url(#progressGrad)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[220px] gap-2 text-text-muted text-xs">
                            <TrendingUp size={36} className="text-slate-300 dark:text-slate-700" />
                            <p className="font-semibold m-0">Belum ada rekaman laporan harian untuk kurva progres</p>
                        </div>
                    )}
                </Card>

                {/* Task Distribution Donut Chart (1 Col) */}
                <Card className="!p-5 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                    <div className="mb-2">
                        <div className="flex items-center gap-2">
                            <ClipboardList size={16} className="text-primary" />
                            <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">Distribusi Pekerjaan</h3>
                        </div>
                        <p className="text-xs text-text-muted m-0">Proporsi status tiket tugas operasional</p>
                    </div>

                    {taskPieData.length > 0 ? (
                        <div className="flex flex-col items-center justify-center flex-1 py-2">
                            <div className="relative w-full h-[180px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={taskPieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={52}
                                            outerRadius={75}
                                            paddingAngle={3}
                                            dataKey="value"
                                        >
                                            {taskPieData.map((entry, i) => (
                                                <Cell key={i} fill={entry.color} strokeWidth={1.5} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(val: any, name: any) => [`${val} Tugas`, name]}
                                            contentStyle={{
                                                background: 'var(--bg-white)',
                                                borderRadius: '12px',
                                                border: '1px solid var(--border)',
                                                boxShadow: 'var(--shadow-md)',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-2xl font-black text-slate-900 dark:text-white leading-none">
                                        {data.totalTasks}
                                    </span>
                                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mt-0.5">
                                        Tugas
                                    </span>
                                </div>
                            </div>

                            {/* Corrected Task Status Legend Labels */}
                            <div className="grid grid-cols-2 gap-2 w-full mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                {taskPieData.map((entry, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                                        <span className="text-text-secondary truncate flex-1">{entry.name}</span>
                                        <span className="font-mono font-bold text-text-primary">{entry.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[200px] gap-2 text-text-muted text-xs">
                            <ClipboardList size={36} className="text-slate-300 dark:text-slate-700" />
                            <p className="font-semibold m-0">Tidak ada tugas dalam lingkup ini</p>
                        </div>
                    )}
                </Card>
            </div>

            {/* ─── 5. WORKFORCE TRENDS & MONTHLY WAGES ROW ────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Weekly Attendance Bar Chart (2 Cols) */}
                <Card className="lg:col-span-2 !p-5 border border-slate-200/80 dark:border-slate-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <Users size={16} className="text-emerald-600" />
                                <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">Tren Presensi 7 Hari Terakhir</h3>
                            </div>
                            <p className="text-xs text-text-muted m-0">Tingkat kehadiran, keterlambatan, izin, dan alpa pekerja lapangan</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => handleNavigate('/attendance-recap')}
                            className="text-xs font-bold text-primary hover:underline cursor-pointer flex items-center gap-1 self-start sm:self-auto"
                        >
                            <span>Rekap Lengkap</span>
                            <ArrowRight size={13} />
                        </button>
                    </div>

                    <div className="w-full h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.weeklyTrend} barSize={14}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                                <XAxis
                                    dataKey="dayLabel"
                                    tick={{ fontSize: 11, fill: 'var(--text-muted)', fontWeight: 600 }}
                                />
                                <YAxis
                                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                                    allowDecimals={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-white)',
                                        borderRadius: '12px',
                                        border: '1px solid var(--border)',
                                        boxShadow: 'var(--shadow-md)',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                    }}
                                />
                                <Legend
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                                />
                                <Bar dataKey="present" name="Hadir" fill="#10B981" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="late" name="Terlambat" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="permit" name="Izin" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="absent" name="Alpa" fill="#EF4444" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Monthly Wage Realization Summary (1 Col) */}
                <Card className="!p-5 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Wallet size={16} className="text-amber-600" />
                                <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">Upah Bulan Ini</h3>
                            </div>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                Berjalan
                            </span>
                        </div>
                        <div className="space-y-1 mb-4">
                            <span className="text-xs text-text-muted font-bold uppercase tracking-wider">Total Akumulasi Upah</span>
                            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                                {formatCurrency(data.wageSummary.totalWages)}
                            </div>
                        </div>

                        {/* Segmented Paid vs Unpaid Bar */}
                        <div className="space-y-2 mb-4">
                            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                                {data.wageSummary.totalWages > 0 ? (
                                    <>
                                        <div 
                                            className="h-full bg-emerald-500 transition-all duration-500" 
                                            style={{ width: `${Math.round((data.wageSummary.totalPaid / data.wageSummary.totalWages) * 100)}%` }}
                                            title="Terbayar"
                                        />
                                        <div 
                                            className="h-full bg-rose-500 transition-all duration-500" 
                                            style={{ width: `${Math.round((data.wageSummary.totalUnpaid / data.wageSummary.totalWages) * 100)}%` }}
                                            title="Belum Terbayar"
                                        />
                                    </>
                                ) : (
                                    <div className="h-full bg-slate-300 w-full" />
                                )}
                            </div>
                            <div className="flex justify-between items-center text-xs font-semibold">
                                <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                    Terbayar ({data.wageSummary.recordsPaid})
                                </span>
                                <span className="text-rose-700 dark:text-rose-400 flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                                    Tertunda ({data.wageSummary.recordsUnpaid})
                                </span>
                            </div>
                        </div>

                        {/* Wage Breakdown Cards */}
                        <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                                <span className="font-semibold text-emerald-900 dark:text-emerald-200">Realisasi Dibayar</span>
                                <span className="font-mono font-black text-emerald-800 dark:text-emerald-300">
                                    {formatCurrency(data.wageSummary.totalPaid)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40">
                                <span className="font-semibold text-rose-900 dark:text-rose-200">Menunggu Pembayaran</span>
                                <span className="font-mono font-black text-rose-800 dark:text-rose-300">
                                    {formatCurrency(data.wageSummary.totalUnpaid)}
                                </span>
                            </div>
                            {data.wageSummary.totalOvertime > 0 && (
                                <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
                                    <span className="font-semibold text-amber-900 dark:text-amber-200">Total Lembur (SPKL)</span>
                                    <span className="font-mono font-black text-amber-800 dark:text-amber-300">
                                        {formatCurrency(data.wageSummary.totalOvertime)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => handleNavigate('/my-payments')}
                        className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                        <span>Kelola Pembayaran & Slip</span>
                        <ArrowRight size={13} />
                    </button>
                </Card>
            </div>

            {/* ─── 6. LIVE TODAY'S WORKFORCE FEED & OPERATIONAL NAVIGATOR ─────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Live Field Workforce Feed (2 Cols) */}
                <Card className="lg:col-span-2 !p-5 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                    <div>
                        {/* Feed Header with Search & Status Filters */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <div className="flex items-center gap-2">
                                    <UserCheck size={18} className="text-emerald-600" />
                                    <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">Presensi Personel Hari Ini</h3>
                                    <span className="px-2 py-0.2 rounded-full text-xs font-mono font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                        {filteredWorkers.length}
                                    </span>
                                </div>
                                <p className="text-xs text-text-muted m-0">Monitor absensi langsung pekerja dan penanggung jawab lapangan</p>
                            </div>

                            {/* Search bar */}
                            <div className="relative w-full sm:w-60">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                <input
                                    type="text"
                                    value={workerSearch}
                                    onChange={(e) => setWorkerSearch(e.target.value)}
                                    placeholder="Cari pekerja / proyek..."
                                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-text-primary focus:outline-hidden focus:border-primary"
                                />
                                {workerSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setWorkerSearch('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5 cursor-pointer"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Status Filter Chips */}
                        <div className="flex items-center gap-1.5 overflow-x-auto py-2.5 no-scrollbar">
                            {[
                                { key: 'all', label: 'Semua Status', count: data.todayWorkers.length },
                                { key: 'Present', label: 'Hadir', count: data.attendanceCounts.Present || 0 },
                                { key: 'Late', label: 'Terlambat', count: data.attendanceCounts.Late || 0 },
                                { key: 'Permit', label: 'Izin', count: data.attendanceCounts.Permit || 0 },
                                { key: 'Absent', label: 'Alpa', count: data.attendanceCounts.Absent || 0 },
                            ].map((f) => (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setWorkerStatusFilter(f.key)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                                        workerStatusFilter === f.key
                                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                                            : 'bg-slate-100 dark:bg-slate-800 text-text-secondary hover:text-text-primary'
                                    }`}
                                >
                                    <span>{f.label}</span>
                                    <span className="text-[10px] font-mono opacity-80">({f.count})</span>
                                </button>
                            ))}
                        </div>

                        {/* Worker List */}
                        {filteredWorkers.length > 0 ? (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[340px] overflow-y-auto pr-1">
                                {filteredWorkers.map((w) => {
                                    const conf = STATUS_CONFIG[w.status] || STATUS_CONFIG.Present;
                                    return (
                                        <div key={w._id} className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 rounded-xl px-2 transition-colors">
                                            {/* Name & Avatar */}
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                                                    {w.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                                            {w.name}
                                                        </span>
                                                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize shrink-0">
                                                            {w.role}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[11px] text-text-muted truncate mt-0.5">
                                                        <Building2 size={11} className="shrink-0" />
                                                        <span className="truncate">{w.project || 'Di Luar Proyek'}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Times & Status */}
                                            <div className="flex items-center gap-3 shrink-0">
                                                <div className="hidden sm:flex flex-col items-end text-[11px]">
                                                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                                                        Masuk: {w.checkIn ? formatWIBTime(w.checkIn) : '--:--'}
                                                    </span>
                                                    <span className="text-[10px] font-mono text-text-muted">
                                                        Pulang: {w.checkOut ? formatWIBTime(w.checkOut) : '--:--'}
                                                    </span>
                                                </div>
                                                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border whitespace-nowrap ${conf.bg}`}>
                                                    {conf.label}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="py-12 flex flex-col items-center justify-center gap-2 text-text-muted text-xs">
                                <Users size={32} className="text-slate-300 dark:text-slate-700" />
                                <p className="font-semibold m-0">Tidak ada personel yang sesuai filter</p>
                                {(workerSearch || workerStatusFilter !== 'all') && (
                                    <button
                                        type="button"
                                        onClick={() => { setWorkerSearch(''); setWorkerStatusFilter('all'); }}
                                        className="text-primary font-bold hover:underline cursor-pointer"
                                    >
                                        Reset Filter
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => handleNavigate('/attendance')}
                        className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                        <span>Buka Modul Presensi & Rekapitulasi</span>
                        <ArrowRight size={13} />
                    </button>
                </Card>

                {/* Quick Navigation Hub (1 Col) */}
                <Card className="!p-5 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <HardHat size={16} className="text-primary" />
                                <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">Aksi Cepat Operasional</h3>
                            </div>
                        </div>
                        <p className="text-xs text-text-muted mb-4">Akses langsung ke submodul eksekusi lapangan</p>

                        <div className="space-y-2.5">
                            {[
                                {
                                    title: 'Presensi & Kehadiran',
                                    desc: 'Check-in, absen swafoto GPS & SPKL lembur',
                                    icon: Clock,
                                    route: '/attendance',
                                    color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/40',
                                },
                                {
                                    title: 'Laporan Harian Proyek',
                                    desc: 'Input capaian fisik pekerjaan, material & cuaca',
                                    icon: FileText,
                                    route: '/daily-report',
                                    color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/40',
                                },
                                {
                                    title: 'Pusat Otorisasi & Persetujuan',
                                    desc: 'Review kasbon, PO material & disposisi',
                                    icon: CheckSquare,
                                    route: '/approvals',
                                    color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/40',
                                },
                                {
                                    title: 'Inventaris Alat & Mesin',
                                    desc: 'Audit pergerakan, kondisi fisik & lokasi bin',
                                    icon: Wrench,
                                    route: '/tools',
                                    color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-900/40',
                                },
                                {
                                    title: 'Material & Logistik Proyek',
                                    desc: 'Purchase order, stok gudang & penerimaan barang',
                                    icon: Package,
                                    route: '/materials',
                                    color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/40',
                                },
                            ].map((navItem, idx) => {
                                const Icon = navItem.icon;
                                return (
                                    <div
                                        key={idx}
                                        onClick={() => handleNavigate(navItem.route)}
                                        className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer flex items-center justify-between gap-3 group shadow-2xs"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${navItem.color}`}>
                                                <Icon size={18} />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-xs font-bold text-slate-900 dark:text-white m-0 truncate group-hover:text-primary transition-colors">
                                                    {navItem.title}
                                                </h4>
                                                <p className="text-[11px] text-text-muted m-0 truncate">
                                                    {navItem.desc}
                                                </p>
                                            </div>
                                        </div>
                                        <ArrowRight size={14} className="text-text-muted group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-text-muted text-center">
                        MTERP Operational Intelligence v2.0
                    </div>
                </Card>
            </div>
        </div>
    );
}
