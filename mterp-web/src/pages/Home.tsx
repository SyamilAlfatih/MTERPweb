import { type ElementType, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench,
  ClipboardList,
  Clock,
  Truck,
  CheckSquare,
  ChevronRight,
  HardHat,
  FileText,
  DollarSign,
  BarChart3,
  Activity,
  ArrowUpRight,
  Receipt,
  User,
  UserCog,
  SlidersHorizontal,
  RotateCcw,
  Check,
  Plus,
  EyeOff,
  Search,
  Sparkles,
  Calendar,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from '../components/shared';
import { formatDate as formatWIBDate } from '../utils/date';

interface UpdateItem {
  _id: string;
  type: 'project' | 'attendance' | 'report';
  icon: string;
  title: string;
  description: string;
  subtitle: string;
  timestamp: string;
  color: string;
  bg: string;
}

interface TodayAttendanceRecord {
  _id: string;
  status?: string;
  checkIn?: {
    time: string;
    photo?: string;
    location?: { lat: number; lng: number };
  };
  checkOut?: {
    time: string;
    photo?: string;
    location?: { lat: number; lng: number };
  };
}

export type CardCategory = 'field' | 'finance' | 'admin';

export interface DashboardCardDef {
  id: string;
  type: 'primary' | 'quick';
  category: CardCategory;
  icon: ElementType;
  labelKey?: string;
  defaultLabel: string;
  subKey?: string;
  defaultSub: string;
  route: string;
  roles: string[];
  gradientFrom?: string;
  gradientTo?: string;
  color?: string;
  bg?: string;
}

const getIcon = (iconName: string) => {
  const icons: Record<string, ElementType> = {
    HardHat,
    Clock,
    FileText,
    Wrench,
    Truck,
  };
  return icons[iconName] || FileText;
};

/* ── Card Registry Definition ── */
const ALL_DASHBOARD_CARDS: DashboardCardDef[] = [
  // Primary Cards
  {
    id: 'projects',
    type: 'primary',
    category: 'field',
    icon: HardHat,
    labelKey: 'home.cards.projectsTitle',
    defaultLabel: 'Projects',
    subKey: 'home.cards.projectsSub',
    defaultSub: 'Manage ongoing projects & timelines',
    route: '/projects',
    gradientFrom: '#D97706',
    gradientTo: '#F59E0B',
    roles: [
      'owner',
      'president_director',
      'operational_director',
      'director',
      'site_manager',
      'supervisor',
      'admin_project',
      'asset_admin',
    ],
  },
  {
    id: 'tools',
    type: 'primary',
    category: 'field',
    icon: Wrench,
    labelKey: 'home.cards.toolsTitle',
    defaultLabel: 'Tools & Machinery',
    subKey: 'home.cards.toolsSub',
    defaultSub: 'Equipment tracking & assignments',
    route: '/tools',
    gradientFrom: '#1e3a8a',
    gradientTo: '#3b82f6',
    roles: [
      'owner',
      'president_director',
      'operational_director',
      'director',
      'site_manager',
      'supervisor',
      'admin_project',
      'asset_admin',
    ],
  },
  {
    id: 'tasks-primary',
    type: 'primary',
    category: 'field',
    icon: ClipboardList,
    labelKey: 'home.cards.tasksTitle',
    defaultLabel: 'My Tasks & Worklist',
    subKey: 'home.cards.tasksSub',
    defaultSub: 'Daily assigned jobs and site checklists',
    route: '/tasks',
    gradientFrom: '#059669',
    gradientTo: '#10B981',
    roles: ['worker', 'tukang', 'helper', 'foreman'],
  },

  // Quick Cards
  {
    id: 'attendance',
    type: 'quick',
    category: 'finance',
    icon: Clock,
    labelKey: 'home.cards.attendanceTitle',
    defaultLabel: 'Attendance',
    subKey: 'home.cards.attendanceSub',
    defaultSub: 'Clock in / clock out & daily presence',
    route: '/attendance',
    color: '#059669',
    bg: '#D1FAE5',
    roles: [
      'owner',
      'president_director',
      'operational_director',
      'director',
      'site_manager',
      'supervisor',
      'foreman',
      'admin_project',
      'asset_admin',
      'worker',
      'tukang',
      'helper',
    ],
  },
  {
    id: 'tasks',
    type: 'quick',
    category: 'field',
    icon: ClipboardList,
    labelKey: 'home.cards.tasksTitle',
    defaultLabel: 'Tasks',
    subKey: 'home.cards.tasksSub',
    defaultSub: 'Assignments & progress',
    route: '/tasks',
    color: '#D97706',
    bg: '#FEF3C7',
    roles: [
      'worker',
      'tukang',
      'helper',
      'foreman',
      'site_manager',
      'supervisor',
      'asset_admin',
      'admin_project',
    ],
  },
  {
    id: 'payments',
    type: 'quick',
    category: 'finance',
    icon: DollarSign,
    labelKey: 'home.cards.paymentsTitle',
    defaultLabel: 'My Payments',
    subKey: 'home.cards.paymentsSub',
    defaultSub: 'Kasbon requests & payout history',
    route: '/my-payments',
    color: '#059669',
    bg: '#D1FAE5',
    roles: ['worker', 'tukang', 'helper', 'foreman'],
  },
  {
    id: 'materials',
    type: 'quick',
    category: 'field',
    icon: Truck,
    labelKey: 'home.cards.materialsTitle',
    defaultLabel: 'Materials',
    subKey: 'home.cards.materialsSub',
    defaultSub: 'Stock, requests & inventory tracking',
    route: '/materials',
    color: '#7C3AED',
    bg: '#EDE9FE',
    roles: [
      'owner',
      'president_director',
      'operational_director',
      'director',
      'site_manager',
      'supervisor',
      'admin_project',
      'asset_admin',
    ],
  },
  {
    id: 'approvals',
    type: 'quick',
    category: 'admin',
    icon: CheckSquare,
    labelKey: 'home.cards.approvalsTitle',
    defaultLabel: 'Approvals',
    subKey: 'home.cards.approvalsSub',
    defaultSub: 'Review pending requests & authorizations',
    route: '/approvals',
    color: '#2563EB',
    bg: '#DBEAFE',
    roles: [
      'owner',
      'president_director',
      'operational_director',
      'director',
      'site_manager',
      'supervisor',
      'asset_admin',
      'admin_project',
    ],
  },
  {
    id: 'daily-report',
    type: 'quick',
    category: 'field',
    icon: FileText,
    labelKey: 'home.cards.reportTitle',
    defaultLabel: 'Daily Report',
    subKey: 'home.cards.reportSub',
    defaultSub: 'Field progress & site logs reporting',
    route: '/daily-report',
    color: '#2563EB',
    bg: '#DBEAFE',
    roles: ['site_manager', 'supervisor', 'foreman', 'asset_admin', 'admin_project'],
  },
  {
    id: 'dashboard',
    type: 'quick',
    category: 'admin',
    icon: BarChart3,
    labelKey: 'sidebar.dashboard',
    defaultLabel: 'Executive Analytics',
    defaultSub: 'KPIs, project budgets & S-curve',
    route: '/dashboard',
    color: '#0D9488',
    bg: '#CCFBF1',
    roles: [
      'owner',
      'president_director',
      'operational_director',
      'director',
      'site_manager',
      'supervisor',
      'asset_admin',
      'admin_project',
    ],
  },
  {
    id: 'slip-gaji',
    type: 'quick',
    category: 'finance',
    icon: Receipt,
    labelKey: 'sidebar.payroll',
    defaultLabel: 'Payroll & Wages',
    subKey: 'sidebar.payroll',
    defaultSub: 'Worker wages and pay slips',
    route: '/slip-gaji',
    color: '#059669',
    bg: '#D1FAE5',
    roles: [
      'owner',
      'president_director',
      'operational_director',
      'director',
      'site_manager',
      'supervisor',
      'asset_admin',
    ],
  },
  {
    id: 'users',
    type: 'quick',
    category: 'admin',
    icon: User,
    defaultLabel: 'User Management',
    defaultSub: 'Staff profiles, roles & credentials',
    route: '/users',
    color: '#E81CFF',
    bg: '#FEEBFF',
    roles: ['owner'],
  },
  {
    id: 'project-assign',
    type: 'quick',
    category: 'admin',
    icon: UserCog,
    defaultLabel: 'Project Assignments',
    defaultSub: 'Site personnel and resource allocation',
    route: '/project-assign',
    color: '#6366F1',
    bg: '#EEF2FF',
    roles: ['owner', 'director', 'supervisor', 'asset_admin', 'admin_project'],
  },
];

/* ── Skeletons ── */
function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-slate-200/80 rounded-xl animate-pulse ${className}`}
      style={{ animation: 'pulse 1.5s cubic-bezier(.4,0,.6,1) infinite' }}
    />
  );
}

function UpdateSkeleton() {
  return (
    <div className="flex gap-3 p-3.5 bg-bg-white rounded-2xl border border-border-light shadow-2xs">
      <SkeletonBlock className="w-10 h-10 rounded-xl shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <SkeletonBlock className="h-3 w-1/3 rounded" />
        <SkeletonBlock className="h-3.5 w-4/5 rounded" />
        <SkeletonBlock className="h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);
  const [activeUpdateFilter, setActiveUpdateFilter] = useState<'all' | 'project' | 'attendance' | 'report'>('all');

  const [todayAttendance, setTodayAttendance] = useState<TodayAttendanceRecord | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(true);

  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | CardCategory>('all');
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Live real-time clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const userRole = user?.role?.toLowerCase() || 'worker';
  const storageKey = `home_visible_cards_${userRole}`;

  // Filter available cards for this user's role
  const roleCards = useMemo(() => {
    return ALL_DASHBOARD_CARDS.filter((c) => c.roles.includes(userRole));
  }, [userRole]);

  // Default card IDs for this role
  const defaultCardIds = useMemo(() => {
    return roleCards.map((c) => c.id);
  }, [roleCards]);

  // Visible card IDs state (persisted per role in localStorage)
  const [visibleCardIds, setVisibleCardIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return defaultCardIds;
  });

  // Re-sync when user role or available cards change
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setVisibleCardIds(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    setVisibleCardIds(roleCards.map((c) => c.id));
  }, [storageKey, roleCards]);

  // Toggle card visibility in customize mode
  const toggleCard = (cardId: string) => {
    setVisibleCardIds((prev) => {
      let next: string[];
      if (prev.includes(cardId)) {
        next = prev.filter((id) => id !== cardId);
      } else {
        next = [...prev, cardId];
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Select all cards
  const handleSelectAll = () => {
    const allIds = roleCards.map((c) => c.id);
    setVisibleCardIds(allIds);
    try {
      localStorage.setItem(storageKey, JSON.stringify(allIds));
    } catch {
      // ignore
    }
  };

  // Reset cards to default
  const handleResetCards = () => {
    const defaults = roleCards.map((c) => c.id);
    setVisibleCardIds(defaults);
    try {
      localStorage.setItem(storageKey, JSON.stringify(defaults));
    } catch {
      // ignore
    }
  };

  // Categorize cards
  const primaryRoleCards = useMemo(
    () => roleCards.filter((c) => c.type === 'primary'),
    [roleCards]
  );
  const quickRoleCards = useMemo(
    () => roleCards.filter((c) => c.type === 'quick'),
    [roleCards]
  );

  // Cards to display considering customization mode
  const displayedPrimaryCards = useMemo(() => {
    return isCustomizing
      ? primaryRoleCards
      : primaryRoleCards.filter((c) => visibleCardIds.includes(c.id));
  }, [isCustomizing, primaryRoleCards, visibleCardIds]);

  const displayedQuickCards = useMemo(() => {
    return isCustomizing
      ? quickRoleCards
      : quickRoleCards.filter((c) => visibleCardIds.includes(c.id));
  }, [isCustomizing, quickRoleCards, visibleCardIds]);

  // Filtered by Search & Category
  const filteredPrimaryCards = useMemo(() => {
    return displayedPrimaryCards.filter((card) => {
      const matchesCategory = activeCategory === 'all' || card.category === activeCategory;
      const label = card.labelKey ? t(card.labelKey, card.defaultLabel) : card.defaultLabel;
      const sub = card.subKey ? t(card.subKey, card.defaultSub) : card.defaultSub;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q || label.toLowerCase().includes(q) || sub.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [displayedPrimaryCards, activeCategory, searchQuery, t]);

  const filteredQuickCards = useMemo(() => {
    return displayedQuickCards.filter((card) => {
      const matchesCategory = activeCategory === 'all' || card.category === activeCategory;
      const label = card.labelKey ? t(card.labelKey, card.defaultLabel) : card.defaultLabel;
      const sub = card.subKey ? t(card.subKey, card.defaultSub) : card.defaultSub;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q || label.toLowerCase().includes(q) || sub.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [displayedQuickCards, activeCategory, searchQuery, t]);

  // Route resolver (attendance manager vs worker)
  const isWorkerRole = ['worker', 'tukang', 'helper'].includes(userRole);
  const attendanceRoute = isWorkerRole ? '/attendance' : '/group-attendance';

  const getCardRoute = (card: DashboardCardDef) => {
    if (card.id === 'attendance') {
      return attendanceRoute;
    }
    return card.route;
  };

  // Fetch Site Updates
  useEffect(() => {
    api
      .get('/updates')
      .then((r) => setUpdates(r.data))
      .catch((err) => console.error('Failed to fetch updates', err))
      .finally(() => setLoadingUpdates(false));
  }, []);

  // Fetch Today's Personal Attendance
  useEffect(() => {
    api
      .get('/attendance/today')
      .then((r) => setTodayAttendance(r.data))
      .catch((err) => console.error('Failed to fetch today attendance', err))
      .finally(() => setLoadingAttendance(false));
  }, []);

  // Filtered updates
  const filteredUpdates = useMemo(() => {
    if (activeUpdateFilter === 'all') return updates;
    return updates.filter((u) => u.type === activeUpdateFilter);
  }, [updates, activeUpdateFilter]);

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}${t('home.time.minsAgo', 'm ago')}`;
    if (diffHours < 24) return `${diffHours}${t('home.time.hoursAgo', 'h ago')}`;
    if (diffDays < 7) return `${diffDays}${t('home.time.daysAgo', 'd ago')}`;
    return formatWIBDate(date, { day: 'numeric', month: 'short' });
  };

  const formattedTime = currentTime.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const formattedDate = formatWIBDate(currentTime, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const getGreetingText = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return t('home.greeting.morning', 'Good Morning');
    if (hour < 17) return t('home.greeting.afternoon', 'Good Afternoon');
    return t('home.greeting.evening', 'Good Evening');
  };

  const handleUpdateClick = (update: UpdateItem) => {
    if (update.type === 'project') navigate('/projects');
    else if (update.type === 'attendance') navigate(attendanceRoute);
    else if (update.type === 'report') navigate('/daily-report');
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6">
      {/* ── Executive Command Center Hero Banner ────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden shadow-lg border border-slate-700/30 bg-gradient-to-br from-[#0a1530] via-[#102353] to-[#1e3a8a] text-white">
        {/* Subtle architectural grid pattern background */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        />
        {/* Ambient atmospheric glow */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 p-5 sm:p-7 lg:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Greeting, identity & live clock */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
                <span className="text-white font-black text-sm">
                  {user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
              <Badge
                label={user?.role?.replace(/_/g, ' ').toUpperCase() || 'STAFF'}
                variant="neutral"
                size="small"
                className="!bg-white/15 !border-white/25 !text-white font-bold tracking-wider"
              />
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>MTERP Operational System</span>
              </div>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white m-0 leading-tight">
                {getGreetingText()},{' '}
                <span className="bg-gradient-to-r from-white via-slate-100 to-amber-200 bg-clip-text text-transparent">
                  {user?.fullName?.split(' ')[0] || 'User'}
                </span>
              </h1>
              <p className="text-white/70 text-sm sm:text-base font-medium mt-1 m-0 flex items-center gap-2">
                <Calendar size={15} className="text-amber-300/80 shrink-0" />
                <span>{formattedDate}</span>
              </p>
            </div>
          </div>

          {/* Right: Real-time WIB Digital Clock & Quick Shift Widget */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 self-start lg:self-auto shrink-0 w-full sm:w-auto">
            {/* Live Clock Card */}
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-3 flex items-center justify-between sm:justify-start gap-3 shadow-inner">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <Clock size={20} className="text-amber-300" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest block leading-none">
                  WIB Real-Time
                </span>
                <span className="text-lg font-black text-white tabular-nums tracking-wider leading-tight">
                  {formattedTime}
                </span>
              </div>
            </div>

            {/* Quick Shift / Attendance Status CTA */}
            <button
              type="button"
              onClick={() => navigate(attendanceRoute)}
              className="group bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm px-4 py-3 rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-between sm:justify-center gap-3 cursor-pointer active:scale-[0.98]"
              style={{ touchAction: 'manipulation' }}
            >
              <div className="flex items-center gap-2 text-left">
                {todayAttendance?.checkIn?.time ? (
                  <CheckCircle2 size={18} className="text-slate-950 shrink-0" />
                ) : (
                  <AlertCircle size={18} className="text-slate-950 shrink-0" />
                )}
                <div>
                  <span className="block text-[10px] uppercase font-bold tracking-wider leading-none text-slate-900/80">
                    {isWorkerRole ? 'Daily Attendance' : 'Attendance Hub'}
                  </span>
                  <span className="block font-black text-slate-950 text-xs sm:text-sm leading-tight">
                    {todayAttendance?.checkOut?.time
                      ? 'Shift Completed'
                      : todayAttendance?.checkIn?.time
                      ? 'Checked In'
                      : 'Clock In / Out'}
                  </span>
                </div>
              </div>
              <ArrowRight
                size={16}
                className="group-hover:translate-x-1 transition-transform text-slate-950"
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── Customization Active Toolbar ─────────────────────────────────── */}
      {isCustomizing && (
        <div className="bg-primary/10 border-2 border-primary/30 rounded-2xl p-4 sm:p-5 shadow-sm animate-card-enter">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 shadow-sm">
                <SlidersHorizontal size={20} />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-black text-text-primary m-0">
                  Customizing Workspace Layout
                </h4>
                <p className="text-xs text-text-muted m-0 mt-0.5 font-medium">
                  Showing <span className="font-bold text-primary">{visibleCardIds.length}</span> of{' '}
                  <span className="font-bold">{roleCards.length}</span> modules for your role. Click any card to toggle.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary bg-bg-white border border-border-light hover:border-primary/40 transition-all cursor-pointer shadow-2xs active:scale-95"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleResetCards}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-text-muted hover:text-text-primary bg-bg-white border border-border-light hover:border-primary/40 transition-all cursor-pointer shadow-2xs active:scale-95"
              >
                <RotateCcw size={13} />
                <span>Reset Defaults</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCustomizing(false)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary-light transition-all shadow-sm cursor-pointer active:scale-95"
              >
                <Check size={14} />
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Responsive Bento Grid (Desktop 8/4, Mobile 1-col) ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── LEFT / MAIN CONTENT (8 COLS ON DESKTOP) ─────────────────── */}
        <div className="lg:col-span-8 space-y-6">
          {/* Quick Search & Category Filters Bar */}
          <div className="bg-bg-white rounded-2xl border border-border-light/80 p-3 sm:p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tools, modules, actions..."
                  className="w-full pl-10 pr-9 py-2 rounded-xl text-sm bg-bg-secondary/40 border border-border-light focus:outline-hidden focus:border-primary focus:bg-bg-white transition-all text-text-primary placeholder:text-text-muted/70"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Customize Button */}
              {!isCustomizing && (
                <button
                  type="button"
                  onClick={() => setIsCustomizing(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-text-secondary hover:text-primary bg-bg-secondary/40 hover:bg-primary/10 border border-border-light hover:border-primary/30 transition-all cursor-pointer shrink-0"
                  title="Customize card layout"
                >
                  <SlidersHorizontal size={14} />
                  <span>Customize</span>
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider mr-1 hidden sm:inline">
                Filter:
              </span>
              {[
                { id: 'all', label: 'All Modules' },
                { id: 'field', label: 'Field & Operations' },
                { id: 'finance', label: 'Finance & HR' },
                { id: 'admin', label: 'Admin & Analytics' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCategory(tab.id as 'all' | CardCategory)}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all duration-150 cursor-pointer border ${
                    activeCategory === tab.id
                      ? 'bg-primary text-white border-primary shadow-xs'
                      : 'bg-bg-secondary/50 text-text-secondary border-border-light/60 hover:bg-bg-secondary hover:text-text-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Featured Primary Workspaces ── */}
          {filteredPrimaryCards.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-500" />
                  <h2 className="text-xs font-black text-text-muted uppercase tracking-widest m-0">
                    Primary Key Workspaces
                  </h2>
                </div>
                <span className="text-xs text-text-muted font-semibold">
                  {filteredPrimaryCards.length} Featured
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {filteredPrimaryCards.map((card, idx) => {
                  const Icon = card.icon;
                  const isVisible = visibleCardIds.includes(card.id);
                  const label = card.labelKey ? t(card.labelKey, card.defaultLabel) : card.defaultLabel;
                  const sub = card.subKey ? t(card.subKey, card.defaultSub) : card.defaultSub;

                  return (
                    <div
                      key={card.id}
                      className="relative animate-card-enter"
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (isCustomizing) {
                            toggleCard(card.id);
                          } else {
                            navigate(getCardRoute(card));
                          }
                        }}
                        className={`group w-full h-full p-5 bg-bg-white rounded-2xl border-2 transition-all duration-200 cursor-pointer text-left flex flex-col justify-between ${
                          isCustomizing
                            ? isVisible
                              ? 'border-emerald-500/70 ring-2 ring-emerald-500/20 shadow-sm'
                              : 'opacity-40 border-dashed border-border-medium hover:opacity-70'
                            : 'border-border-light/80 hover:border-primary/40 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]'
                        }`}
                        style={{ touchAction: 'manipulation', minHeight: '140px' }}
                      >
                        <div className="flex items-start justify-between gap-3 w-full">
                          <div
                            className="w-13 h-13 rounded-2xl flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform"
                            style={{
                              background: `linear-gradient(135deg, ${card.gradientFrom || '#1e3a8a'}, ${
                                card.gradientTo || '#3b82f6'
                              })`,
                            }}
                          >
                            <Icon size={26} className="text-white" />
                          </div>

                          {isCustomizing ? (
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-white transition-all shadow-2xs ${
                                isVisible ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            >
                              {isVisible ? <Check size={14} /> : <Plus size={14} />}
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-bg-secondary/60 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                              <ArrowUpRight
                                size={16}
                                className="text-text-muted group-hover:text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                              />
                            </div>
                          )}
                        </div>

                        <div className="mt-4">
                          <h3 className="text-base font-black text-text-primary m-0 tracking-tight leading-snug group-hover:text-primary transition-colors">
                            {label}
                          </h3>
                          <p className="text-xs text-text-muted mt-1 mb-0 font-medium line-clamp-2 leading-relaxed">
                            {sub}
                          </p>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Quick Access & Operational Modules Grid ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-primary" />
                <h2 className="text-xs font-black text-text-muted uppercase tracking-widest m-0">
                  Operational Modules & Tools
                </h2>
              </div>
              <span className="text-xs text-text-muted font-semibold">
                {filteredQuickCards.length} Available
              </span>
            </div>

            {filteredQuickCards.length === 0 ? (
              <div className="p-8 text-center bg-bg-white rounded-2xl border-2 border-dashed border-border-light shadow-2xs">
                <EyeOff size={32} className="mx-auto text-text-muted mb-2 opacity-50" />
                <p className="text-sm font-bold text-text-primary m-0">No matching modules found</p>
                <p className="text-xs text-text-muted m-0 mt-1">
                  {searchQuery
                    ? `No tools match "${searchQuery}". Clear your search query.`
                    : 'All modules in this category are hidden or disabled.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveCategory('all');
                    setIsCustomizing(true);
                  }}
                  className="mt-3 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-light transition-all cursor-pointer"
                >
                  Adjust Workspace Cards
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-3.5">
                {filteredQuickCards.map((card, idx) => {
                  const Icon = card.icon;
                  const isVisible = visibleCardIds.includes(card.id);
                  const label = card.labelKey ? t(card.labelKey, card.defaultLabel) : card.defaultLabel;
                  const sub = card.subKey ? t(card.subKey, card.defaultSub) : card.defaultSub;

                  return (
                    <div
                      key={card.id}
                      className="relative animate-card-enter"
                      style={{
                        animationDelay: `${(idx + filteredPrimaryCards.length) * 30}ms`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (isCustomizing) {
                            toggleCard(card.id);
                          } else {
                            navigate(getCardRoute(card));
                          }
                        }}
                        className={`group flex flex-col items-start p-3.5 sm:p-4 bg-bg-white rounded-2xl border-2 transition-all duration-200 cursor-pointer text-left w-full relative ${
                          isCustomizing
                            ? isVisible
                              ? 'border-emerald-500/70 ring-2 ring-emerald-500/20 shadow-sm'
                              : 'opacity-40 border-dashed border-border-medium hover:opacity-70'
                            : 'border-border-light/80 hover:border-primary/40 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]'
                        }`}
                        style={{ touchAction: 'manipulation', minHeight: '118px' }}
                      >
                        {/* Customization corner badge */}
                        {isCustomizing && (
                          <div
                            className={`absolute top-2.5 right-2.5 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-2xs transition-all ${
                              isVisible ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          >
                            {isVisible ? <Check size={13} /> : <Plus size={13} />}
                          </div>
                        )}

                        <div className="flex items-center justify-between w-full mb-2.5">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-2xs shrink-0 group-hover:scale-105 transition-transform"
                            style={{ backgroundColor: card.bg || '#F1F5F9' }}
                          >
                            <Icon size={20} style={{ color: card.color || '#1e3a8a' }} />
                          </div>

                          {!isCustomizing && (
                            <ChevronRight
                              size={15}
                              className="text-text-muted/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all"
                            />
                          )}
                        </div>

                        <span className="text-xs sm:text-sm font-black text-text-primary leading-tight tracking-tight truncate w-full group-hover:text-primary transition-colors">
                          {label}
                        </span>
                        <span className="text-[11px] text-text-muted font-medium mt-0.5 leading-tight truncate w-full">
                          {sub}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── RIGHT COLUMN: SHIFT WIDGET & LIVE UPDATES (4 COLS ON DESKTOP) ── */}
        <div className="lg:col-span-4 space-y-6">
          {/* ── 1. Live Shift & Personal Presence Card ── */}
          <div className="bg-bg-white rounded-2xl border border-border-light/90 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-text-primary m-0 leading-tight">
                    Shift & Attendance
                  </h3>
                  <span className="text-[10px] text-text-muted font-medium">
                    {user?.fullName?.split(' ')[0]}'s Record
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate(attendanceRoute)}
                className="text-xs font-bold text-primary hover:text-primary-light flex items-center gap-0.5 transition-colors cursor-pointer"
              >
                <span>View</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {loadingAttendance ? (
              <div className="space-y-2 py-2">
                <SkeletonBlock className="h-4 w-1/2 rounded" />
                <SkeletonBlock className="h-3 w-3/4 rounded" />
              </div>
            ) : todayAttendance?.checkIn?.time ? (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-start gap-2.5">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-black text-emerald-900 block leading-tight">
                      Clocked In Today
                    </span>
                    <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
                      Check-in time:{' '}
                      <strong className="font-bold">
                        {formatWIBDate(new Date(todayAttendance.checkIn.time), {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        WIB
                      </strong>
                    </span>
                  </div>
                </div>

                {todayAttendance?.checkOut?.time ? (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-text-secondary flex justify-between items-center">
                    <span className="font-semibold">Clocked out at:</span>
                    <span className="font-bold text-text-primary">
                      {formatWIBDate(new Date(todayAttendance.checkOut.time), {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      WIB
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate(attendanceRoute)}
                    className="w-full py-2 px-3 rounded-xl bg-bg-secondary hover:bg-border-light text-text-primary font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Clock size={14} />
                    <span>Proceed to Clock Out</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2.5">
                  <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-black text-amber-900 block leading-tight">
                      Not Clocked In Yet
                    </span>
                    <span className="text-[11px] text-amber-700 font-medium block mt-0.5">
                      Please record your attendance for today's shift.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(attendanceRoute)}
                  className="w-full py-2.5 px-3 rounded-xl bg-primary hover:bg-primary-light text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
                >
                  <Clock size={14} />
                  <span>{isWorkerRole ? 'Clock In Now' : 'Open Attendance'}</span>
                </button>
              </div>
            )}
          </div>

          {/* ── 2. Live Site Updates & Activity Stream ── */}
          <div className="bg-bg-white rounded-2xl border border-border-light/90 p-4 sm:p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={17} className="text-primary" />
                <h3 className="text-xs font-black text-text-primary uppercase tracking-wider m-0">
                  {t('home.updates.title', 'Site Updates')}
                </h3>
                {!loadingUpdates && updates.length > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    {updates.length}
                  </span>
                )}
              </div>

              {updates.length > 3 && (
                <button
                  type="button"
                  onClick={() => navigate('/updates')}
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-light transition-colors cursor-pointer bg-transparent border-none p-0"
                >
                  {t('home.updates.viewAll', 'View All')}
                  <ArrowUpRight size={13} />
                </button>
              )}
            </div>

            {/* Filter Tabs for Updates */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-[11px]">
              {[
                { id: 'all', label: 'All' },
                { id: 'project', label: 'Projects' },
                { id: 'attendance', label: 'Attendance' },
                { id: 'report', label: 'Reports' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setActiveUpdateFilter(t.id as 'all' | 'project' | 'attendance' | 'report')
                  }
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    activeUpdateFilter === t.id
                      ? 'bg-slate-800 text-white'
                      : 'bg-bg-secondary/40 text-text-muted hover:text-text-primary hover:bg-bg-secondary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Update Items List */}
            {loadingUpdates ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map((i) => (
                  <UpdateSkeleton key={i} />
                ))}
              </div>
            ) : filteredUpdates.length === 0 ? (
              <div className="py-8 px-4 text-center rounded-xl bg-bg-secondary/20 border border-dashed border-border-light">
                <Activity size={24} className="mx-auto text-text-muted mb-2 opacity-50" />
                <p className="text-xs font-semibold text-text-muted m-0">
                  {t('home.updates.empty', 'No recent site updates')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUpdates.slice(0, 5).map((update) => {
                  const IconComponent = getIcon(update.icon);
                  return (
                    <button
                      key={update._id}
                      type="button"
                      onClick={() => handleUpdateClick(update)}
                      className="group w-full flex items-start gap-3 p-3 bg-bg-white hover:bg-bg-secondary/30 rounded-xl border border-border-light/70 hover:border-primary/30 transition-all text-left cursor-pointer shadow-2xs"
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform mt-0.5"
                        style={{ backgroundColor: update.bg }}
                      >
                        <IconComponent size={17} style={{ color: update.color }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-[10px] font-black text-text-muted uppercase tracking-wider truncate">
                            {update.title}
                          </span>
                          <span className="text-[10px] text-text-muted shrink-0 font-medium">
                            {formatTimeAgo(update.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-text-primary m-0 truncate group-hover:text-primary transition-colors leading-snug">
                          {update.description}
                        </p>
                        <p className="text-[11px] text-text-muted mt-0.5 mb-0 font-medium truncate leading-tight">
                          {update.subtitle}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── 3. Quick System Information & Shortcuts ── */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-white/70">
                System Quick Info
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/15 text-amber-300">
                WIB GMT+7
              </span>
            </div>

            <p className="text-xs text-white/80 leading-relaxed m-0 font-medium">
              Connected to Megatama Enerco ERP Cloud. For support or urgent dispatch, contact your site
              supervisor or project manager.
            </p>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-semibold text-white/70">
              <button
                type="button"
                onClick={() => navigate('/notifications')}
                className="hover:text-white transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>Alerts</span>
                <ArrowUpRight size={12} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="hover:text-white transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>My Profile</span>
                <ArrowUpRight size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Safe Area Spacer for Mobile Nav Bar */}
      <div className="h-6 lg:hidden" />
    </div>
  );
}
