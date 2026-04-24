import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    LineChart,
    Line,
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
import { Card } from '../components/shared';
import { formatDate as formatWIBDate, formatTime as formatWIBTime } from '../utils/date';

interface WorkerEntry {
    _id: string;
    name: string;
    role: string;
    status: string;
    checkIn: string | null;
    checkOut: string | null;
    project: string;
    dailyRate: number;
    overtimePay: number;
    wageType: string;
    paymentStatus: string;
}

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
    // Enhanced attendance
    todayWorkers: WorkerEntry[];
    weeklyTrend: WeeklyTrendEntry[];
    wageSummary: WageSummary;
    totalWorkers: number;
}

const TASK_COLORS: Record<string, string> = {
    pending: '#F59E0B',
    in_progress: '#3B82F6',
    completed: '#10B981',
    cancelled: '#94A3B8',
};

const TASK_LABELS: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
    Present: { color: '#059669', bg: '#D1FAE5' },
    Late: { color: '#D97706', bg: '#FEF3C7' },
    Absent: { color: '#DC2626', bg: '#FEE2E2' },
    'Half-day': { color: '#6366F1', bg: '#EEF2FF' },
    Permit: { color: '#8B5CF6', bg: '#EDE9FE' },
};

const formatCurrency = (val: number): string => {
    if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(1)}B`;
    if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `Rp ${(val / 1_000).toFixed(0)}K`;
    return `Rp ${val.toLocaleString('id-ID')}`;
};

const formatTime = (dateStr: string | null): string => {
    if (!dateStr) return '--:--';
    return formatWIBTime(dateStr);
};

export default function Dashboard() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedProject, setSelectedProject] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);

    useEffect(() => {
        fetchDashboard();
    }, [selectedProject]);

    const fetchDashboard = async () => {
        try {
            setLoading(true);
            const params = selectedProject ? `?projectId=${selectedProject}` : '';
            const response = await api.get(`/dashboard${params}`);
            setData(response.data);
        } catch (err) {
            console.error('Failed to fetch dashboard', err);
        } finally {
            setLoading(false);
        }
    };

    const selectedProjectName = selectedProject
        ? data?.projectList.find((p) => p._id === selectedProject)?.nama || 'Project'
        : 'All Projects';

    const taskPieData = data
        ? Object.entries(data.taskStatusCounts)
            .filter(([, v]) => v > 0)
            .map(([key, value]) => ({
                name: TASK_LABELS[key] || key,
                value,
                color: TASK_COLORS[key] || '#94A3B8',
            }))
        : [];

    const budgetPercent = data && data.totalBudget > 0
        ? Math.min(100, Math.round((data.actualSpend / data.totalBudget) * 100))
        : 0;

    const attendanceRate = data && data.totalWorkers > 0
        ? Math.round((data.totalAttendanceToday / data.totalWorkers) * 100)
        : 0;

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-text-muted">
                <Loader className="animate-spin" size={32} />
                <p>Loading dashboard...</p>
            </div>
        );
    }

    if (!data) return null;

    // Placeholder for userName and formattedDate, as they are not defined in the original code
    const userName = "User";
    const formattedDate = formatWIBDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="p-6 max-w-[1200px] mx-auto max-lg:p-4 max-sm:p-3">
            {/* Field Header / Greetings */}
            <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-primary to-primary-light text-white shadow-lg overflow-hidden relative">
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2 opacity-90">
                        <HardHat size={18} />
                        <span className="text-xs font-bold uppercase tracking-wider">{formattedDate}</span>
                    </div>
                    <h1 className="text-3xl font-extrabold m-0 mb-1">Welcome back, {userName}</h1>
                    <p className="text-sm opacity-90 font-medium">Ready for another productive day in the field?</p>
                </div>
                <div className="absolute top-[-20px] right-[-20px] opacity-10 rotate-[15deg]">
                    <HardHat size={180} />
                </div>
            </div>

            {/* Field Quick Actions - HIGH PRIORITY FOR CONSTRUCTION PERSONNEL */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <button 
                    onClick={() => navigate('/attendance')}
                    className="flex items-center gap-4 p-5 bg-bg-white border-2 border-border-light rounded-xl cursor-pointer transition-all hover:border-primary hover:shadow-lg hover:-translate-y-1 group"
                >
                    <div className="w-14 h-14 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <LogIn size={28} />
                    </div>
                    <div className="text-left">
                        <h3 className="text-lg font-bold text-text-primary m-0">Clock In/Out</h3>
                        <p className="text-xs text-text-muted m-0">Tap to record attendance</p>
                    </div>
                </button>

                <button 
                    onClick={() => navigate('/daily-report')}
                    className="flex items-center gap-4 p-5 bg-bg-white border-2 border-border-light rounded-xl cursor-pointer transition-all hover:border-primary hover:shadow-lg hover:-translate-y-1 group"
                >
                    <div className="w-14 h-14 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <PlusCircle size={28} />
                    </div>
                    <div className="text-left">
                        <h3 className="text-lg font-bold text-text-primary m-0">Daily Report</h3>
                        <p className="text-xs text-text-muted m-0">Log work progress today</p>
                    </div>
                </button>

                <button 
                    onClick={() => navigate('/materials')}
                    className="flex items-center gap-4 p-5 bg-bg-white border-2 border-border-light rounded-xl cursor-pointer transition-all hover:border-primary hover:shadow-lg hover:-translate-y-1 group"
                >
                    <div className="w-14 h-14 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                        <Package size={28} />
                    </div>
                    <div className="text-left">
                        <h3 className="text-lg font-bold text-text-primary m-0">Materials</h3>
                        <p className="text-xs text-text-muted m-0">Update supply status</p>
                    </div>
                </button>
            </div>

            {/* Project Selector - Sticky or Floating for easy reach */}
            <div className="flex items-center justify-between mb-6 gap-4 border-b border-border-light pb-4">
                <div className="flex items-center gap-2">
                    <BarChart3 size={20} className="text-primary" />
                    <h2 className="text-lg font-bold text-text-primary m-0">Project Insights</h2>
                </div>
                
                <div className="relative">
                    <button
                        className="flex items-center gap-2 px-5 py-2.5 bg-bg-white border-2 border-primary rounded-lg cursor-pointer text-sm font-bold text-primary transition-all shadow-sm hover:shadow-md active:scale-95"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                    >
                        <span>{selectedProjectName}</span>
                        <ChevronDown
                            size={16}
                            className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                        />
                    </button>
                    {dropdownOpen && (
                        <div className="absolute top-[calc(100%+6px)] right-0 min-w-[240px] max-h-[300px] overflow-y-auto bg-bg-white border-2 border-border rounded-xl shadow-xl z-[100] animate-fade-in origin-top">
                            <button
                                className={`block w-full px-5 py-4 text-left text-sm font-semibold border-none cursor-pointer border-b border-border-light hover:bg-primary-bg ${!selectedProject ? 'text-primary' : 'text-text-secondary'}`}
                                onClick={() => { setSelectedProject(''); setDropdownOpen(false); }}
                            >
                                All Projects
                            </button>
                            {data.projectList.map((p) => (
                                <button
                                    key={p._id}
                                    className={`block w-full px-5 py-4 text-left text-sm font-semibold border-none cursor-pointer border-b border-border-light last:border-0 hover:bg-primary-bg ${selectedProject === p._id ? 'text-primary' : 'text-text-secondary'}`}
                                    onClick={() => { setSelectedProject(p._id); setDropdownOpen(false); }}
                                >
                                    {p.nama}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* KPI Cards - BIG NUMBER STYLE */}
            <div className="grid grid-cols-4 gap-4 mb-6 max-lg:grid-cols-2 max-sm:grid-cols-1">
                <Card className="relative !p-6 flex flex-col gap-2 overflow-hidden border-2 border-border-light hover:border-primary transition-all">
                    <span className="text-xs font-bold text-text-muted uppercase tracking-wider">{t('dashboard.activeProjects')}</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-extrabold text-text-primary leading-none tracking-tight">{data.totalProjects}</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                        {data.statusCounts['In Progress'] > 0 && (
                            <span className="text-[10px] font-bold px-2 py-1 rounded bg-blue-100 text-blue-700">{data.statusCounts['In Progress']} Active</span>
                        )}
                        {data.statusCounts['Completed'] > 0 && (
                            <span className="text-[10px] font-bold px-2 py-1 rounded bg-green-100 text-green-700">{data.statusCounts['Completed']} Done</span>
                        )}
                    </div>
                    <div className="absolute right-[-10px] bottom-[-10px] opacity-10">
                        <BarChart3 size={80} />
                    </div>
                </Card>

                <Card className="relative !p-6 flex flex-col gap-2 overflow-hidden border-2 border-border-light hover:border-primary transition-all">
                    <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Budget Spent</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-extrabold text-text-primary leading-none tracking-tight">{formatCurrency(data.actualSpend)}</span>
                    </div>
                    <div className="mt-3">
                        <div className="w-full h-2.5 bg-bg-secondary rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                                style={{ width: `${budgetPercent}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-1.5">
                            <span className="text-[10px] font-bold text-primary">{budgetPercent}% used</span>
                            <span className="text-[10px] font-bold text-text-muted">Total: {formatCurrency(data.totalBudget)}</span>
                        </div>
                    </div>
                </Card>

                <Card className="relative !p-6 flex flex-col gap-2 overflow-hidden border-2 border-border-light hover:border-primary transition-all">
                    <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Overall Progress</span>
                    <div className="flex items-center gap-4">
                        <span className="text-4xl font-extrabold text-text-primary leading-none tracking-tight">{data.avgProgress}%</span>
                    </div>
                    <div className="mt-auto pt-2">
                         <div className="flex items-center gap-1.5 text-success font-bold text-[10px]">
                            <TrendingUp size={12} />
                            <span>On Track</span>
                        </div>
                    </div>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20">
                         <div className="w-16 h-16 rounded-full border-[6px] border-primary-bg flex items-center justify-center relative">
                            <div className="absolute inset-0 rounded-full border-[6px] border-primary border-t-transparent border-r-transparent rotate-45" style={{ opacity: data.avgProgress / 100 }}></div>
                            <HardHat size={20} className="text-primary" />
                         </div>
                    </div>
                </Card>

                <Card className="relative !p-6 flex flex-col gap-2 overflow-hidden border-2 border-border-light hover:border-primary transition-all">
                    <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Active Tasks</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-extrabold text-text-primary leading-none tracking-tight">{data.totalTasks}</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                        <span className="text-[10px] font-bold px-2 py-1 rounded bg-amber-100 text-amber-700">{data.taskStatusCounts.in_progress || 0} In Progress</span>
                        <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-700">{data.taskStatusCounts.pending || 0} Pending</span>
                    </div>
                    <div className="absolute right-[-10px] bottom-[-10px] opacity-10">
                        <ClipboardList size={80} />
                    </div>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mb-6">
                {/* Progress Timeline */}
                <Card className="!p-5 relative">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-text-primary m-0">{t('dashboard.projectProgress')}</h3>
                        </div>
                        {data.progressTimeline.length === 0 && (
                            <span className="text-xs text-text-muted">No reports yet</span>
                        )}
                    </div>
                    {data.progressTimeline.length > 0 ? (
                        <div className="w-full">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={data.progressTimeline}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
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
                                        formatter={(v: number | undefined) => [`${v ?? 0}%`, 'Progress']}
                                        contentStyle={{
                                            background: 'var(--bg-white)',
                                            borderRadius: '12px',
                                            border: '1px solid var(--border)',
                                            boxShadow: 'var(--shadow-md)',
                                            fontSize: '12px',
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="progress"
                                        stroke="var(--primary)"
                                        strokeWidth={2.5}
                                        dot={{ fill: 'var(--primary)', r: 3 }}
                                        activeDot={{ r: 5, fill: 'var(--primary)' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[180px] gap-3 text-text-muted text-sm">
                            <TrendingUp size={40} color="var(--text-muted)" />
                            <p>Submit daily reports to see progress trends</p>
                        </div>
                    )}
                </Card>

                {/* Task Breakdown */}
                <Card className="!p-5">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-text-primary m-0">{t('dashboard.progressChart')}</h3>
                        </div>
                    </div>
                    {taskPieData.length > 0 ? (
                        <div className="flex flex-col items-center w-full">
                            <ResponsiveContainer width="100%" height={180}>
                                <PieChart>
                                    <Pie
                                        data={taskPieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={45}
                                        outerRadius={70}
                                        paddingAngle={3}
                                        dataKey="value"
                                    >
                                        {taskPieData.map((entry, i) => (
                                            <Cell key={i} fill={entry.color} />
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
                            <div className="flex flex-wrap gap-3 justify-center mt-2">
                                {taskPieData.map((entry, i) => (
                                    <div key={i} className="flex items-center gap-[6px] text-xs">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                                        <span className="text-text-secondary">{t('dashboard.overall')}</span>
                                        <span className="font-bold text-text-primary">{entry.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[180px] gap-3 text-text-muted text-sm">
                            <ClipboardList size={40} color="var(--text-muted)" />
                            <p>No tasks found</p>
                        </div>
                    )}
                </Card>
            </div>

            {/* ===== ATTENDANCE ANALYTICS SECTION ===== */}
            <div className="flex items-center gap-3 mb-5 mt-2 pb-3 border-b border-border">
                <div className="w-[34px] h-[34px] rounded-md bg-gradient-to-br from-[#10B981] to-[#34D399] flex items-center justify-center text-white shrink-0">
                    <UserCheck size={18} />
                </div>
                <h2 className="text-base font-bold text-text-primary m-0">Attendance Analytics</h2>
                <span className="ml-auto text-xs font-bold py-[3px] px-[10px] rounded-full bg-[#D1FAE5] text-[#059669]">{attendanceRate}% today</span>
            </div>

            {/* Attendance KPI Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
                <Card className="!p-4 sm:!p-5 flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-[0.4px]">
                        <Users size={16} color="#10B981" />
                        <span>Today's Workforce</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-text-primary leading-none">{data.totalAttendanceToday}</span>
                        <span className="text-xs text-text-muted font-medium">/ {data.totalWorkers} workers</span>
                    </div>
                    <div className="w-full">
                        <div className="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-[0.8s] ease bg-gradient-to-r from-[#10B981] to-[#34D399]" style={{ width: `${attendanceRate}%` }} />
                        </div>
                    </div>
                </Card>

                <Card className="!p-4 sm:!p-5 flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-[0.4px]">
                        <Clock size={16} color="#3B82F6" />
                        <span>Status Breakdown</span>
                    </div>
                    <div className="grid grid-cols-2 gap-[6px]">
                        <div className="flex items-center gap-[6px] py-1.5 px-2.5 rounded-md text-xs bg-[#D1FAE5] text-[#059669]">
                            <span className="font-extrabold text-base leading-none">{data.attendanceCounts.Present || 0}</span>
                            <span className="font-medium opacity-80">{t('dashboard.newProject')}</span>
                        </div>
                        <div className="flex items-center gap-[6px] py-1.5 px-2.5 rounded-md text-xs bg-[#FEF3C7] text-[#D97706]">
                            <span className="font-extrabold text-base leading-none">{data.attendanceCounts.Late || 0}</span>
                            <span className="font-medium opacity-80">{t('dashboard.reqMaterial')}</span>
                        </div>
                        <div className="flex items-center gap-[6px] py-1.5 px-2.5 rounded-md text-xs bg-[#FEE2E2] text-[#DC2626]">
                            <span className="font-extrabold text-base leading-none">{data.attendanceCounts.Absent || 0}</span>
                            <span className="font-medium opacity-80">Absent</span>
                        </div>
                        <div className="flex items-center gap-[6px] py-1.5 px-2.5 rounded-md text-xs bg-[#EDE9FE] text-[#7C3AED]">
                            <span className="font-extrabold text-base leading-none">{data.attendanceCounts.Permit || 0}</span>
                            <span className="font-medium opacity-80">Permit</span>
                        </div>
                    </div>
                </Card>

                <Card className="!p-4 sm:!p-5 flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-[0.4px]">
                        <Wallet size={16} color="#F59E0B" />
                        <span>This Month's Wages</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-text-primary leading-none">{formatCurrency(data.wageSummary.totalWages)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-xs text-text-secondary font-medium">
                            <span className="w-2 h-2 rounded-full shrink-0 bg-[#10B981]" />
                            <span>Paid: {formatCurrency(data.wageSummary.totalPaid)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-secondary font-medium">
                            <span className="w-2 h-2 rounded-full shrink-0 bg-[#EF4444]" />
                            <span>Unpaid: {formatCurrency(data.wageSummary.totalUnpaid)}</span>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Weekly Trend Chart + Worker Table */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {/* Weekly Attendance Bar Chart */}
                <Card className="!p-5">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-base font-bold text-text-primary m-0">{t('dashboard.recentActivity')}</h3>
                        <button className="text-sm font-bold text-primary cursor-pointer border-none bg-transparent p-0">{t('dashboard.viewAll')}</button>
                    </div>
                    <div className="w-full">
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={data.weeklyTrend} barSize={16}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
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
                                    }}
                                />
                                <Legend
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                                />
                                <Bar dataKey="present" name="Present" fill="#10B981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="late" name="Late" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="absent" name="Absent" fill="#EF4444" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="permit" name="Permit" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Today's Workers Table */}
                <Card className="flex flex-col !p-5">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-base font-bold text-text-primary m-0">Today's Workers</h3>
                        <span className="text-xs text-text-muted">{data.todayWorkers.length} records</span>
                    </div>
                    {data.todayWorkers.length > 0 ? (
                        <div className="flex flex-col gap-[2px] max-h-[280px] overflow-y-auto pr-1">
                            {data.todayWorkers.map((w) => {
                                const style = STATUS_STYLES[w.status] || STATUS_STYLES.Present;
                                return (
                                    <div key={w._id} className="flex items-center gap-3 py-2 px-2 rounded-md transition-colors hover:bg-bg-secondary">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style={{ backgroundColor: style.bg, color: style.color }}>
                                                {w.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-semibold text-text-primary whitespace-nowrap overflow-hidden text-ellipsis">{w.name}</span>
                                                <span className="text-[10px] text-text-muted whitespace-nowrap overflow-hidden text-ellipsis">{w.project}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className="text-[11px] font-semibold text-text-secondary tabular-nums">{formatTime(w.checkIn)}</span>
                                            <span className="text-[10px] text-text-muted">→</span>
                                            <span className="text-[11px] font-semibold text-text-secondary tabular-nums">{formatTime(w.checkOut)}</span>
                                        </div>
                                        <span className="text-[9px] font-bold py-0.5 px-2 rounded-full whitespace-nowrap shrink-0" style={{ backgroundColor: style.bg, color: style.color }}>
                                            {w.status}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[180px] gap-3 text-text-muted text-sm">
                            <Users size={40} color="var(--text-muted)" />
                            <p>No attendance records today</p>
                        </div>
                    )}
                </Card>
            </div>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="flex items-center gap-3 !py-4 !px-5 transition-transform hover:-translate-y-[1px]">
                    <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: '#D1FAE5' }}>
                        <Users size={18} color="#10B981" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-lg font-extrabold text-text-primary leading-[1.2]">{data.totalAttendanceToday}</span>
                        <span className="text-xs text-text-muted font-medium">Attendance Today</span>
                    </div>
                    <div className="flex gap-1 flex-wrap ml-auto">
                        {data.attendanceCounts.Present > 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap bg-[#D1FAE5] text-[#059669]">{data.attendanceCounts.Present} Present</span>
                        )}
                        {data.attendanceCounts.Late > 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap bg-[#FEF3C7] text-[#D97706]">{data.attendanceCounts.Late} Late</span>
                        )}
                        {data.attendanceCounts.Absent > 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap bg-[#FEE2E2] text-[#DC2626]">{data.attendanceCounts.Absent} Absent</span>
                        )}
                    </div>
                </Card>

                <Card className="flex items-center gap-3 !py-4 !px-5 transition-transform hover:-translate-y-[1px]">
                    <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: '#FEF3C7' }}>
                        <AlertCircle size={18} color="#F59E0B" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-lg font-extrabold text-text-primary leading-[1.2]">{data.pendingRequests}</span>
                        <span className="text-xs text-text-muted font-medium uppercase tracking-[0.5px] mt-0.5">{t('dashboard.pendingApprovals')}</span>
                    </div>
                </Card>

                <Card className="flex items-center gap-3 !py-4 !px-5 transition-transform hover:-translate-y-[1px]">
                    <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: '#FEE2E2' }}>
                        <Package size={18} color="#EF4444" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-lg font-extrabold text-text-primary leading-[1.2]">{formatCurrency(data.totalUnpaid)}</span>
                        <span className="text-xs text-text-muted font-medium">Unpaid Wages</span>
                    </div>
                </Card>
            </div>
        </div>
    );
}
