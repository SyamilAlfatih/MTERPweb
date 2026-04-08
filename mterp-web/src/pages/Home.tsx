import { type ElementType, useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from '../components/shared';

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

/* ── Primary action card (big) ── */
interface PrimaryCardProps {
  icon: ElementType;
  label: string;
  sub: string;
  gradientFrom: string;
  gradientTo: string;
  onClick: () => void;
}

function PrimaryCard({ icon: Icon, label, sub, gradientFrom, gradientTo, onClick }: PrimaryCardProps) {
  return (
    <button
      onClick={onClick}
      className="group w-full flex items-center justify-between p-5 bg-bg-white rounded-2xl border-2 border-border-light hover:border-primary/40 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] cursor-pointer text-left"
      style={{ touchAction: 'manipulation' }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
          style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
        >
          <Icon size={28} className="text-white" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-black text-text-primary m-0 tracking-tight leading-snug">{label}</h3>
          <p className="text-sm text-text-muted mt-0.5 mb-0 font-medium">{sub}</p>
        </div>
      </div>
      <div className="w-9 h-9 rounded-full bg-bg-secondary group-hover:bg-primary/10 flex items-center justify-center transition-colors duration-200 shrink-0 ml-3">
        <ChevronRight size={18} className="text-text-muted group-hover:text-primary transition-colors duration-200" />
      </div>
    </button>
  );
}

/* ── Quick action card (small grid) ── */
interface QuickCardProps {
  icon: ElementType;
  label: string;
  sub: string;
  color: string;
  bg: string;
  onClick: () => void;
}

function QuickCard({ icon: Icon, label, sub, color, bg, onClick }: QuickCardProps) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start p-4 bg-bg-white rounded-2xl border-2 border-border-light hover:border-primary/40 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.97] cursor-pointer text-left w-full"
      style={{ touchAction: 'manipulation', minHeight: '110px' }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-3 shadow-sm"
        style={{ backgroundColor: bg }}
      >
        <Icon size={22} style={{ color }} />
      </div>
      <span className="text-sm font-black text-text-primary leading-tight tracking-tight">{label}</span>
      <span className="text-xs text-text-muted font-medium mt-0.5 leading-tight">{sub}</span>
    </button>
  );
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);

  useEffect(() => {
    api.get('/updates')
      .then(r => setUpdates(r.data))
      .catch(err => console.error('Failed to fetch updates', err))
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
    return date.toLocaleDateString(i18n.language === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' });
  };

  const isManager = user?.role && ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'].includes(user.role);
  const isWorker = user?.role && ['worker', 'tukang', 'helper', 'foreman'].includes(user.role);
  const canApprove = user?.role && ['director', 'owner', 'president_director', 'operational_director'].includes(user.role);

  return (
    <div className="p-4 sm:p-5 lg:p-6 max-w-[820px]">

      {/* ── Hero Banner ──────────────────────────────────────── */}
      <div
        className="relative rounded-3xl overflow-hidden mb-6 p-6 sm:p-8"
        style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #60a5fa 100%)',
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
                <span className="text-white font-black text-sm">{user?.fullName?.charAt(0)?.toUpperCase() || 'U'}</span>
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
              {new Date().toLocaleDateString(i18n.language === 'id' ? 'id-ID' : 'en-US', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </p>
          </div>

          {/* Quick stat pill */}
          <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-3 self-start sm:self-auto shrink-0">
            <Activity size={18} className="text-white/80" />
            <div>
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider block leading-none">Status</span>
              <span className="text-sm font-black text-white leading-none">Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Primary Actions ────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-xs font-black text-text-muted uppercase tracking-widest">Quick Access</span>
          <div className="flex-1 h-px bg-border-light" />
        </div>
        <div className="flex flex-col gap-3">
          <PrimaryCard
            icon={HardHat}
            label={t('home.cards.projectsTitle')}
            sub={t('home.cards.projectsSub')}
            gradientFrom="#D97706"
            gradientTo="#F59E0B"
            onClick={() => navigate('/projects')}
          />
          <PrimaryCard
            icon={Wrench}
            label={t('home.cards.toolsTitle')}
            sub={t('home.cards.toolsSub')}
            gradientFrom="#1e3a8a"
            gradientTo="#3b82f6"
            onClick={() => navigate('/tools')}
          />
        </div>
      </section>

      {/* ── Quick Actions Grid ─────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-xs font-black text-text-muted uppercase tracking-widest">Actions</span>
          <div className="flex-1 h-px bg-border-light" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <QuickCard
            icon={Clock}
            label={t('home.cards.attendanceTitle')}
            sub={t('home.cards.attendanceSub')}
            color="#059669"
            bg="#D1FAE5"
            onClick={() => navigate('/attendance')}
          />
          <QuickCard
            icon={ClipboardList}
            label={t('home.cards.tasksTitle')}
            sub={t('home.cards.tasksSub')}
            color="#D97706"
            bg="#FEF3C7"
            onClick={() => navigate('/tasks')}
          />

          {/* Worker cards */}
          {isWorker && (
            <QuickCard
              icon={DollarSign}
              label={t('home.cards.paymentsTitle')}
              sub={t('home.cards.paymentsSub')}
              color="#059669"
              bg="#D1FAE5"
              onClick={() => navigate('/my-payments')}
            />
          )}

          {/* Manager cards */}
          {isManager && (
            <>
              <QuickCard
                icon={Truck}
                label={t('home.cards.materialsTitle')}
                sub={t('home.cards.materialsSub')}
                color="#7C3AED"
                bg="#EDE9FE"
                onClick={() => navigate('/materials')}
              />
              {canApprove ? (
                <QuickCard
                  icon={CheckSquare}
                  label={t('home.cards.approvalsTitle')}
                  sub={t('home.cards.approvalsSub')}
                  color="#2563EB"
                  bg="#DBEAFE"
                  onClick={() => navigate('/approvals')}
                />
              ) : (
                <QuickCard
                  icon={FileText}
                  label={t('home.cards.reportTitle')}
                  sub={t('home.cards.reportSub')}
                  color="#2563EB"
                  bg="#DBEAFE"
                  onClick={() => navigate('/daily-report')}
                />
              )}
              <QuickCard
                icon={BarChart3}
                label={t('sidebar.dashboard', 'Dashboard')}
                sub="Analytics & KPIs"
                color="#0D9488"
                bg="#CCFBF1"
                onClick={() => navigate('/dashboard')}
              />
            </>
          )}
        </div>
      </section>

      {/* ── Site Updates ───────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-text-muted uppercase tracking-widest">{t('home.updates.title')}</span>
            {!loadingUpdates && updates.length > 0 && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {updates.length}
              </span>
            )}
          </div>
          {updates.length > 3 && (
            <button
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
            {[1, 2, 3].map(i => <UpdateSkeleton key={i} />)}
          </div>
        ) : updates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 bg-bg-white rounded-2xl border-2 border-dashed border-border-light text-center">
            <div className="w-14 h-14 rounded-2xl bg-bg-secondary flex items-center justify-center mb-3">
              <Activity size={24} className="text-text-muted" />
            </div>
            <p className="text-sm font-semibold text-text-muted m-0">{t('home.updates.empty')}</p>
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
                      <span className="text-[10px] font-black text-text-muted uppercase tracking-wider leading-none mt-0.5">{update.title}</span>
                      <span className="text-[10px] text-text-muted shrink-0 font-medium">{formatTimeAgo(update.timestamp)}</span>
                    </div>
                    <p className="text-sm font-semibold text-text-primary m-0 truncate leading-snug">{update.description}</p>
                    <p className="text-xs text-text-muted mt-0.5 mb-0 mx-0 font-medium leading-snug">{update.subtitle}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Bottom safe-area spacer (supplements padding-bottom on main) */}
      <div className="h-4 lg:hidden" />
    </div>
  );
}
