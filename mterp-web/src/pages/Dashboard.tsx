import { useState, useEffect } from 'react';
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
    return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

export default function Dashboard() {
    const { t } = useTranslation();
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
    const formattedDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="p-6 max-w-[1100px] max-lg:p-4 max-sm:p-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap max-sm:flex-col max-sm:items-start">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-primary-light flex items-center justify-center shadow-primary">
                        <BarChart3 size={24} color="white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-text-primary m-0">Dashboard</h1>
                        <p className="text-sm text-text-muted m-0">Project analytics overview</p>
                    </div>
                </div>

                {/* Project Selector */}
                <div className="relative">
                    <button
                        className="flex items-center gap-2 px-4 py-2 bg-bg-white border border-border rounded-full cursor-pointer text-sm font-semibold text-text-primary transition-all shadow-sm hover:border-primary hover:shadow-md"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                    >
                        <span>{selectedProjectName}</span>
                        <ChevronDown
                            size={16}
                            className={`transition-transform text-text-muted ${dropdownOpen ? 'rotate-180' : ''}`}
                        />
                    </button>
                    {dropdownOpen && (
                        <div className="absolute top-[calc(100%+6px)] right-0 min-w-[220px] max-h-[300px] overflow-y-auto bg-bg-white border border-border rounded-lg shadow-lg z-[100] animate-fade-in origin-top">
                            <button
                                className={`block w-full px-4 py-3 text-left text-sm text-text-secondary bg-transparent border-none cursor-pointer transition-all hover:bg-bg-primary hover:text-text-primary ${!selectedProject ? 'bg-primary-bg text-primary font-semibold' : ''}`}
                                onClick={() => { setSelectedProject(''); setDropdownOpen(false); }}
                            >
                                All Projects
                            </button>
                            {data.projectList.map((p) => (
                                <button
                                    key={p._id}
                                    className={`block w-full px-4 py-3 text-left text-sm text-text-secondary bg-transparent border-none cursor-pointer transition-all hover:bg-bg-primary hover:text-text-primary ${selectedProject === p._id ? 'bg-primary-bg text-primary font-semibold' : ''}`}
                                    onClick={() => { setSelectedProject(p._id); setDropdownOpen(false); }}
                                >
                                    {p.nama}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6 max-lg:grid-cols-2 max-sm:grid-cols-1">
                <Card className="relative !p-5 flex flex-col gap-3 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="w-10 h-10 rounded-md flex items-center justify-center text-white bg-gradient-to-br from-[#6366F1] to-[#818CF8]">
                        <BarChart3 size={20} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-extrabold text-text-primary leading-[1.1]">{data.totalProjects}</span>
                        <span className="text-xs text-text-muted font-semibold uppercase tracking-[0.5px] mt-0.5">{t('dashboard.activeProjects')}</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {data.statusCounts['In Progress'] > 0 && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full tracking-[0.3px] bg-blue-100 text-blue-600">{data.statusCounts['In Progress']} Active</span>
                        )}
                        {data.statusCounts['Completed'] > 0 && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full tracking-[0.3px] bg-green-100 text-green-600">{data.statusCounts['Completed']} Done</span>
                        )}
                    </div>
                </Card>

                <Card className="relative !p-5 flex flex-col gap-3 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-text-primary m-0">{t('dashboard.quickActions')}</h3>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-extrabold text-text-primary leading-[1.1]">{formatCurrency(data.actualSpend)}</span>
                        <span className="text-xs text-text-muted font-semibold uppercase tracking-[0.5px] mt-0.5">Budget Used</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-[#059669] to-[#34D399] rounded-full transition-all duration-700 ease-out"
                                style={{ width: `${budgetPercent}%` }}
                            />
                        </div>
                        <span className="text-[9px] text-text-muted font-medium">
                            {budgetPercent}% of {formatCurrency(data.totalBudget)}
                        </span>
                    </div>
                </Card>

                <Card className="relative !p-5 flex flex-col gap-3 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="w-10 h-10 rounded-md flex items-center justify-center text-white bg-gradient-to-br from-primary to-primary-light">
                        <TrendingUp size={20} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-extrabold text-text-primary leading-[1.1]">{data.avgProgress}%</span>
                        <span className="text-xs text-text-muted font-semibold uppercase tracking-[0.5px] mt-0.5">Avg. Progress</span>
                    </div>
                    <div className="absolute top-4 right-4 w-11 h-11">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
                            <circle className="fill-none stroke-bg-secondary stroke-[3]" cx="22" cy="22" r="18" />
                            <circle
                                className="fill-none stroke-primary stroke-[3] stroke-linecap-round transition-all duration-[0.8s] ease-out"
                                cx="22" cy="22" r="18"
                                strokeDasharray={`${(data.avgProgress / 100) * 113} 113`}
                            />
                        </svg>
                    </div>
                </Card>

                <Card className="relative !p-5 flex flex-col gap-3 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="w-10 h-10 rounded-md flex items-center justify-center text-white bg-gradient-to-br from-[#F59E0B] to-[#FBBF24]">
                        <ClipboardList size={20} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-2xl font-extrabold text-text-primary leading-[1.1]">{data.totalTasks}</span>
                        <span className="text-xs text-text-muted font-semibold uppercase tracking-[0.5px] mt-0.5">{t('dashboard.toolsInUse')}</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {data.taskStatusCounts.in_progress > 0 && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full tracking-[0.3px] bg-blue-100 text-blue-600">{data.taskStatusCounts.in_progress} Active</span>
                        )}
                        {data.taskStatusCounts.pending > 0 && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full tracking-[0.3px] bg-yellow-100 text-yellow-600">{data.taskStatusCounts.pending} Pending</span>
                        )}
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
