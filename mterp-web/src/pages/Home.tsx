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
  SlidersHorizontal,
  RotateCcw,
  Check,
  Plus,
  EyeOff,
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

/* ── Skeleton loaders ── */
function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-border-light rounded-xl animate-pulse ${className}`}
      style={{ animation: 'pulse 1.5s cubic-bezier(.4,0,.6,1) infinite' }}
    />
  );
}

function UpdateSkeleton() {
  return (
    <div className="flex gap-3 p-4 bg-bg-white rounded-2xl border border-border-light">
      <SkeletonBlock className="w-11 h-11 rounded-xl shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <SkeletonBlock className="h-3 w-1/3 rounded" />
        <SkeletonBlock className="h-4 w-2/3 rounded" />
        <SkeletonBlock className="h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}

/* ── Card Registry Definition ── */
export interface DashboardCardDef {
  id: string;
  type: 'primary' | 'quick';
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

const ALL_DASHBOARD_CARDS: DashboardCardDef[] = [
  // Primary Cards
  {
    id: 'projects',
    type: 'primary',
    icon: HardHat,
    labelKey: 'home.cards.projectsTitle',
    defaultLabel: 'Projects',
    subKey: 'home.cards.projectsSub',
    defaultSub: 'Manage ongoing projects & timelines',
    route: '/projects',
    gradientFrom: '#D97706',
    gradientTo: '#F59E0B',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin'],
  },
  {
    id: 'tools',
    type: 'primary',
    icon: Wrench,
    labelKey: 'home.cards.toolsTitle',
    defaultLabel: 'Tools & Machinery',
    subKey: 'home.cards.toolsSub',
    defaultSub: 'Equipment tracking & assignments',
    route: '/tools',
    gradientFrom: '#1e3a8a',
    gradientTo: '#3b82f6',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin'],
  },
  {
    id: 'tasks-primary',
    type: 'primary',
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
    icon: Clock,
    labelKey: 'home.cards.attendanceTitle',
    defaultLabel: 'Attendance',
    subKey: 'home.cards.attendanceSub',
    defaultSub: 'Clock in / clock out',
    route: '/attendance',
    color: '#059669',
    bg: '#D1FAE5',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'foreman', 'admin_project', 'asset_admin', 'worker', 'tukang', 'helper'],
  },
  {
    id: 'tasks',
    type: 'quick',
    icon: ClipboardList,
    labelKey: 'home.cards.tasksTitle',
    defaultLabel: 'Tasks',
    subKey: 'home.cards.tasksSub',
    defaultSub: 'Assignments & progress',
    route: '/tasks',
    color: '#D97706',
    bg: '#FEF3C7',
    roles: ['worker', 'tukang', 'helper', 'foreman', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'],
  },
  {
    id: 'payments',
    type: 'quick',
    icon: DollarSign,
    labelKey: 'home.cards.paymentsTitle',
    defaultLabel: 'My Payments',
    subKey: 'home.cards.paymentsSub',
    defaultSub: 'Salary & payout history',
    route: '/my-payments',
    color: '#059669',
    bg: '#D1FAE5',
    roles: ['worker', 'tukang', 'helper', 'foreman'],
  },
  {
    id: 'materials',
    type: 'quick',
    icon: Truck,
    labelKey: 'home.cards.materialsTitle',
    defaultLabel: 'Materials',
    subKey: 'home.cards.materialsSub',
    defaultSub: 'Stock, requests & inventory',
    route: '/materials',
    color: '#7C3AED',
    bg: '#EDE9FE',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin'],
  },
  {
    id: 'approvals',
    type: 'quick',
    icon: CheckSquare,
    labelKey: 'home.cards.approvalsTitle',
    defaultLabel: 'Approvals',
    subKey: 'home.cards.approvalsSub',
    defaultSub: 'Pending requests & approvals',
    route: '/approvals',
    color: '#2563EB',
    bg: '#DBEAFE',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'],
  },
  {
    id: 'daily-report',
    type: 'quick',
    icon: FileText,
    labelKey: 'home.cards.reportTitle',
    defaultLabel: 'Daily Report',
    subKey: 'home.cards.reportSub',
    defaultSub: 'Field progress reporting',
    route: '/daily-report',
    color: '#2563EB',
    bg: '#DBEAFE',
    roles: ['site_manager', 'supervisor', 'foreman', 'asset_admin', 'admin_project'],
  },
  {
    id: 'dashboard',
    type: 'quick',
    icon: BarChart3,
    labelKey: 'sidebar.dashboard',
    defaultLabel: 'Dashboard',
    defaultSub: 'Analytics & KPIs',
    route: '/dashboard',
    color: '#0D9488',
    bg: '#CCFBF1',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'],
  },
  {
    id: 'slip-gaji',
    type: 'quick',
    icon: Receipt,
    labelKey: 'sidebar.payroll',
    defaultLabel: 'Payroll',
    defaultSub: 'Salary & Slips',
    route: '/slip-gaji',
    color: '#059669',
    bg: '#D1FAE5',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin'],
  },
  {
    id: 'users',
    type: 'quick',
    icon: User,
    defaultLabel: 'User Management',
    defaultSub: 'Roles & Staff',
    route: '/users',
    color: '#E81CFF',
    bg: '#FEEBFF',
    roles: ['owner'],
  },
];

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);

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

  // Customization mode toggle
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Toggle card visibility
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

  // For display (normal mode: only visible; customize mode: all role cards)
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

  // Adjust attendance route for manager vs worker
  const getCardRoute = (card: DashboardCardDef) => {
    if (card.id === 'attendance') {
      const isWorkerRole = ['worker', 'tukang', 'helper'].includes(userRole);
      return isWorkerRole ? '/attendance' : '/group-attendance';
    }
    return card.route;
  };

  useEffect(() => {
    api
      .get('/updates')
      .then((r) => setUpdates(r.data))
      .catch((err) => console.error('Failed to fetch updates', err))
      .finally(() => setLoadingUpdates(false));
  }, []);

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 60) return `${diffMins}${t('home.time.minsAgo')}`;
    if (diffHours < 24) return `${diffHours}${t('home.time.hoursAgo')}`;
    if (diffDays < 7) return `${diffDays}${t('home.time.daysAgo')}`;
    return formatWIBDate(date, { day: 'numeric', month: 'short' });
  };

  return (
    <div className="p-4 sm:p-5 lg:p-6 max-w-[820px]">
      {/* ── Hero Banner ──────────────────────────────────────── */}
      <div
        className="relative rounded-3xl overflow-hidden mb-6 p-6 sm:p-8 shadow-sm"
        style={{
          background: 'linear-gradient(135deg, #0d1b3e 0%, #1e3a8a 60%, #3b82f6 100%)',
          minHeight: '140px',
        }}
      >
        {/* Decorative blobs */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/5 blur-sm" />
        <div className="absolute bottom-0 left-1/2 w-32 h-32 rounded-full bg-blue-400/10 blur-xl" />
        <div className="absolute top-4 right-4 w-20 h-20 rounded-full bg-indigo-300/10" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <span className="text-white font-black text-sm">
                  {user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
              <Badge
                label={user?.role?.replace(/_/g, ' ').toUpperCase() || 'STAFF'}
                variant="neutral"
                size="small"
                className="!bg-white/15 !border-white/25 !text-white"
              />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight m-0 leading-tight">
              {user?.fullName?.split(' ')[0] || 'Hi there'} 👷
            </h2>
            <p className="text-white/70 text-sm font-medium mt-1 m-0">
              {formatWIBDate(new Date(), {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
          </div>

          {/* Quick stat & customize button */}
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-3">
              <Activity size={18} className="text-white/80" />
              <div>
                <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider block leading-none">
                  Status
                </span>
                <span className="text-sm font-black text-white leading-none">
                  Active
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Customization Banner (Active State) ── */}
      {isCustomizing && (
        <div className="bg-primary/5 border-2 border-primary/20 rounded-2xl p-4 sm:p-5 mb-6 animate-card-enter">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 shadow-sm">
                <SlidersHorizontal size={18} />
              </div>
              <div>
                <h4 className="text-sm font-black text-text-primary m-0">
                  Customizing Home Dashboard
                </h4>
                <p className="text-xs text-text-muted m-0 mt-0.5 font-medium">
                  Click any card to add or remove it from your personal view.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleResetCards}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-text-muted hover:text-text-primary bg-bg-secondary hover:bg-bg-white border border-border-light transition-all cursor-pointer shadow-xs active:scale-95"
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

      {/* ── Primary Actions ────────────────────────────────── */}
      {displayedPrimaryCards.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between gap-2 mb-3 px-1">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs font-black text-text-muted uppercase tracking-widest">
                Quick Access
              </span>
              <div className="flex-1 h-px bg-border-light" />
            </div>

            {!isCustomizing && (
              <button
                type="button"
                onClick={() => setIsCustomizing(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-text-muted hover:text-primary hover:bg-primary/10 transition-all border border-border-light hover:border-primary/30 cursor-pointer"
                title="Customize home cards"
              >
                <SlidersHorizontal size={12} />
                <span className="hidden sm:inline">Customize</span>
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {displayedPrimaryCards.map((card, idx) => {
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
                    className={`group w-full flex items-center justify-between p-5 bg-bg-white rounded-2xl border-2 transition-all duration-200 cursor-pointer text-left ${
                      isCustomizing
                        ? isVisible
                          ? 'border-emerald-500/60 ring-2 ring-emerald-500/20 shadow-sm'
                          : 'opacity-40 border-dashed border-border-medium hover:opacity-70'
                        : 'border-border-light hover:border-primary/40 shadow-sm hover:shadow-md active:scale-[0.98]'
                    }`}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                        style={{
                          background: `linear-gradient(135deg, ${card.gradientFrom || '#1e3a8a'}, ${card.gradientTo || '#3b82f6'})`,
                        }}
                      >
                        <Icon size={28} className="text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-black text-text-primary m-0 tracking-tight leading-snug truncate">
                          {label}
                        </h3>
                        <p className="text-sm text-text-muted mt-0.5 mb-0 font-medium truncate">
                          {sub}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {isCustomizing ? (
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-white transition-all shadow-xs ${
                            isVisible
                              ? 'bg-emerald-500'
                              : 'bg-slate-400'
                          }`}
                          title={isVisible ? 'Click to hide' : 'Click to add'}
                        >
                          {isVisible ? <Check size={16} /> : <Plus size={16} />}
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-bg-secondary group-hover:bg-primary/10 flex items-center justify-center transition-colors duration-200">
                          <ChevronRight
                            size={18}
                            className="text-text-muted group-hover:text-primary transition-colors duration-200"
                          />
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Quick Actions Grid ─────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center justify-between gap-2 mb-3 px-1">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs font-black text-text-muted uppercase tracking-widest">
              Actions
            </span>
            <div className="flex-1 h-px bg-border-light" />
          </div>

          {!isCustomizing && displayedPrimaryCards.length === 0 && (
            <button
              type="button"
              onClick={() => setIsCustomizing(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-text-muted hover:text-primary hover:bg-primary/10 transition-all border border-border-light hover:border-primary/30 cursor-pointer"
              title="Customize dashboard cards"
            >
              <SlidersHorizontal size={12} />
              <span className="hidden sm:inline">Customize</span>
            </button>
          )}
        </div>

        {displayedQuickCards.length === 0 ? (
          <div className="p-8 text-center bg-bg-white rounded-2xl border-2 border-dashed border-border-light">
            <EyeOff size={28} className="mx-auto text-text-muted mb-2 opacity-50" />
            <p className="text-sm font-semibold text-text-primary m-0">No actions visible</p>
            <p className="text-xs text-text-muted m-0 mt-1">
              Click &quot;Customize&quot; above to re-enable cards on your dashboard.
            </p>
            <button
              type="button"
              onClick={() => setIsCustomizing(true)}
              className="mt-3 px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-sm hover:bg-primary-light transition-all cursor-pointer"
            >
              Add Cards
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {displayedQuickCards.map((card, idx) => {
              const Icon = card.icon;
              const isVisible = visibleCardIds.includes(card.id);
              const label = card.labelKey ? t(card.labelKey, card.defaultLabel) : card.defaultLabel;
              const sub = card.subKey ? t(card.subKey, card.defaultSub) : card.defaultSub;

              return (
                <div
                  key={card.id}
                  className="relative animate-card-enter"
                  style={{ animationDelay: `${(idx + displayedPrimaryCards.length) * 35}ms` }}
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
                    className={`group flex flex-col items-start p-4 bg-bg-white rounded-2xl border-2 transition-all duration-200 cursor-pointer text-left w-full relative ${
                      isCustomizing
                        ? isVisible
                          ? 'border-emerald-500/60 ring-2 ring-emerald-500/20 shadow-sm'
                          : 'opacity-40 border-dashed border-border-medium hover:opacity-70'
                        : 'border-border-light hover:border-primary/40 shadow-sm hover:shadow-md active:scale-[0.97]'
                    }`}
                    style={{ touchAction: 'manipulation', minHeight: '110px' }}
                  >
                    {/* Corner badge in customization mode */}
                    {isCustomizing && (
                      <div
                        className={`absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-xs transition-all ${
                          isVisible ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      >
                        {isVisible ? <Check size={13} /> : <Plus size={14} />}
                      </div>
                    )}

                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center mb-3 shadow-sm shrink-0"
                      style={{ backgroundColor: card.bg || '#F1F5F9' }}
                    >
                      <Icon size={22} style={{ color: card.color || '#1e3a8a' }} />
                    </div>
                    <span className="text-sm font-black text-text-primary leading-tight tracking-tight truncate w-full">
                      {label}
                    </span>
                    <span className="text-xs text-text-muted font-medium mt-0.5 leading-tight truncate w-full">
                      {sub}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Site Updates ───────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-text-muted uppercase tracking-widest">
              {t('home.updates.title')}
            </span>
            {!loadingUpdates && updates.length > 0 && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary">
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
              {t('home.updates.viewAll')}
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>

        {loadingUpdates ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <UpdateSkeleton key={i} />
            ))}
          </div>
        ) : updates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 bg-bg-white rounded-2xl border-2 border-dashed border-border-light text-center">
            <div className="w-14 h-14 rounded-2xl bg-bg-secondary flex items-center justify-center mb-3">
              <Activity size={24} className="text-text-muted" />
            </div>
            <p className="text-sm font-semibold text-text-muted m-0">
              {t('home.updates.empty')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {updates.slice(0, 5).map((update) => {
              const IconComponent = getIcon(update.icon);
              return (
                <div
                  key={update._id}
                  className="flex gap-3 p-4 bg-bg-white rounded-2xl border border-border-light hover:border-primary/30 hover:shadow-sm transition-all duration-200"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                    style={{ backgroundColor: update.bg }}
                  >
                    <IconComponent size={20} style={{ color: update.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <span className="text-[10px] font-black text-text-muted uppercase tracking-wider leading-none mt-0.5">
                        {update.title}
                      </span>
                      <span className="text-[10px] text-text-muted shrink-0 font-medium">
                        {formatTimeAgo(update.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-text-primary m-0 truncate leading-snug">
                      {update.description}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5 mb-0 mx-0 font-medium leading-snug">
                      {update.subtitle}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Bottom safe-area spacer */}
      <div className="h-4 lg:hidden" />
    </div>
  );
}
