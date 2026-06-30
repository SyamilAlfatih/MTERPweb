import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, User, Bell, CheckCheck, ArrowUpRight } from 'lucide-react';
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  FileText,
  HardHat,
  DollarSign,
  Clock,
  Megaphone,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import type { AppNotification, NotificationType } from '../../types';

/* ── Notification type → icon/color ── */
const TYPE_ICONS: Record<NotificationType, { icon: React.ElementType; color: string; bg: string }> = {
  task_assigned:    { icon: ClipboardList, color: '#D97706', bg: '#FEF3C7' },
  task_completed:   { icon: CheckCircle2,  color: '#059669', bg: '#D1FAE5' },
  request_approved: { icon: CheckCircle2,  color: '#10B981', bg: '#D1FAE5' },
  request_rejected: { icon: XCircle,       color: '#EF4444', bg: '#FEE2E2' },
  kasbon_approved:  { icon: DollarSign,    color: '#10B981', bg: '#D1FAE5' },
  kasbon_rejected:  { icon: XCircle,       color: '#EF4444', bg: '#FEE2E2' },
  daily_report:     { icon: FileText,      color: '#3B82F6', bg: '#DBEAFE' },
  project_created:  { icon: HardHat,       color: '#D97706', bg: '#FEF3C7' },
  report_approved:  { icon: CheckCircle2,  color: '#059669', bg: '#D1FAE5' },
  attendance_permit:{ icon: Clock,         color: '#7C3AED', bg: '#EDE9FE' },
  general:          { icon: Megaphone,     color: '#6366F1', bg: '#EEF2FF' },
};

function timeAgo(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function AppLayout() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDropdown(false);
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showDropdown]);

  // Close dropdown on route change
  useEffect(() => {
    setShowDropdown(false);
  }, [location.pathname]);

  const getGreetingKey = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'home.greeting.morning';
    if (hour < 17) return 'home.greeting.afternoon';
    return 'home.greeting.evening';
  };

  const getPageTitle = () => {
    const path = location.pathname;
    const titles: Record<string, string> = {
      '/home': t('nav.home', 'Home'),
      '/dashboard': t('sidebar.dashboard', 'Dashboard'),
      '/projects': t('sidebar.projects', 'Projects'),
      '/tools': t('sidebar.tools', 'Tools'),
      '/materials': t('sidebar.materials', 'Materials'),
      '/attendance': t('sidebar.attendance', 'Attendance'),
      '/attendance-recap': t('attendanceRecap.title', 'Attendance Recap'),
      '/tasks': t('sidebar.tasks', 'Tasks'),
      '/approvals': t('sidebar.approvals', 'Approvals'),
      '/slip-gaji': t('sidebar.payroll', 'Payroll'),
      '/my-payments': t('sidebar.payments', 'My Payments'),
      '/daily-report': 'Daily Report',
      '/users': 'User Management',
      '/profile': 'Profile',
      '/notifications': 'Notifications',
    };
    return Object.entries(titles).find(([k]) => path === k || path.startsWith(k + '/'))?.[1] ?? 'MTERP';
  };

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.isRead) markAsRead(n._id);
    setShowDropdown(false);
    if (n.data?.taskId) navigate('/tasks');
    else if (n.data?.projectId) navigate(`/project/${n.data.projectId}`);
    else if (n.data?.requestId) navigate('/approvals');
    else if (n.data?.kasbonId) navigate('/approvals');
    else if (n.data?.reportId && n.data?.projectId) navigate(`/project-reports/${n.data.projectId}`);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh gap-4 bg-bg-primary">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-light flex items-center justify-center shadow-lg animate-pulse">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-base font-bold text-text-primary">mterp.</span>
          <span className="text-sm text-text-muted">{t('home.updates.loading')}</span>
        </div>
        <div className="flex gap-1.5 mt-2">
          {[0,1,2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary/40 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const isHome = location.pathname === '/home';
  const latestNotifications = notifications.slice(0, 5);

  return (
    <div className="flex min-h-dvh bg-bg-primary">
      <Sidebar />

      {/* Main area — offset by sidebar on desktop */}
      <div className="flex-1 flex flex-col lg:ml-[260px] min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 lg:px-6 bg-bg-white/95 backdrop-blur-md border-b border-border-light shadow-sm"
          style={{ height: '64px' }}
        >
          {/* Left: page title / greeting */}
          <div className="flex flex-col justify-center min-w-0">
            {isHome ? (
              <>
                <span className="text-xs font-medium text-text-muted leading-tight">{t(getGreetingKey())}</span>
                <span className="text-base font-black text-text-primary leading-tight truncate max-w-[200px] sm:max-w-none">
                  {user?.fullName?.split(' ')[0] || 'User'} 👋
                </span>
              </>
            ) : (
              <h1 className="text-lg font-black text-text-primary tracking-tight m-0 leading-none">{getPageTitle()}</h1>
            )}
          </div>

          {/* Right: notification bell + user chip + logout */}
          <div className="flex items-center gap-2 shrink-0 ml-4">

            {/* Notification Bell */}
            <div className="relative" ref={dropdownRef}>
              <button
                id="notification-bell"
                onClick={() => setShowDropdown(!showDropdown)}
                className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border ${
                  showDropdown
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-bg-secondary border-border-light text-text-muted hover:bg-primary/10 hover:text-primary hover:border-primary/30'
                }`}
                aria-label="Notifications"
              >
                <Bell size={18} />
                {/* Unread badge */}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-red-500 text-white text-[10px] font-black leading-none shadow-sm"
                    style={{ animation: 'pulse 2s cubic-bezier(.4,0,.6,1) infinite' }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Dropdown Panel */}
              {showDropdown && (
                <div className="absolute right-0 top-[calc(100%+8px)] w-[340px] sm:w-[380px] max-h-[420px] bg-bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12),0_4px_10px_rgba(0,0,0,0.05)] border border-border-light overflow-hidden z-50"
                  style={{ animation: 'overlay-fade-in 150ms ease-out' }}
                >
                  {/* Dropdown Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border-light bg-bg-secondary/50">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-text-primary">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-primary text-white text-[10px] font-black">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => { markAllRead(); }}
                        className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-light transition-colors cursor-pointer bg-transparent border-none p-0"
                      >
                        <CheckCheck size={12} />
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* Notification Items */}
                  <div className="overflow-y-auto max-h-[300px]">
                    {latestNotifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                        <div className="w-12 h-12 rounded-xl bg-bg-secondary flex items-center justify-center mb-2">
                          <Bell size={20} className="text-text-muted" />
                        </div>
                        <p className="text-sm font-semibold text-text-muted m-0">No notifications</p>
                        <p className="text-xs text-text-muted m-0 mt-1">You're all caught up! 🎉</p>
                      </div>
                    ) : (
                      <div className="py-1">
                        {latestNotifications.map((n) => {
                          const config = TYPE_ICONS[n.type] || TYPE_ICONS.general;
                          const Icon = config.icon;
                          return (
                            <button
                              key={n._id}
                              className={`w-full flex gap-3 px-4 py-3 text-left transition-colors duration-150 cursor-pointer border-none ${
                                n.isRead
                                  ? 'bg-transparent hover:bg-bg-secondary/60 opacity-70'
                                  : 'bg-primary/[0.03] hover:bg-primary/[0.06]'
                              }`}
                              onClick={() => handleNotificationClick(n)}
                            >
                              <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                                style={{ backgroundColor: config.bg }}
                              >
                                <Icon size={16} style={{ color: config.color }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-black text-text-muted uppercase tracking-wider">
                                      {n.title}
                                    </span>
                                    {!n.isRead && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                    )}
                                  </div>
                                  <span className="text-[10px] text-text-muted shrink-0">{timeAgo(n.createdAt)}</span>
                                </div>
                                <p className="text-[13px] font-medium text-text-primary m-0 mt-0.5 leading-snug line-clamp-2">
                                  {n.message}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Dropdown Footer */}
                  <div className="border-t border-border-light px-4 py-2.5 bg-bg-secondary/30">
                    <button
                      onClick={() => { setShowDropdown(false); navigate('/notifications'); }}
                      className="flex items-center justify-center gap-1 w-full text-xs font-bold text-primary hover:text-primary-light transition-colors cursor-pointer bg-transparent border-none p-0"
                    >
                      View all notifications
                      <ArrowUpRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Role badge — subtle pill */}
            <span className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-secondary border border-border-light">
              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-white text-[10px] font-black shrink-0">
                {user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
              </span>
              <span className="text-xs font-semibold text-text-secondary max-w-[100px] truncate">{user?.fullName?.split(' ')[0]}</span>
              <span className="text-[10px] font-bold text-primary uppercase bg-primary/10 px-1.5 py-0.5 rounded-full">
                {user?.role?.replace('_', ' ') || 'Staff'}
              </span>
            </span>

            {/* Logout button */}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-secondary border border-border-light text-text-muted hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all duration-200 active:scale-95 cursor-pointer"
              aria-label={t('sidebar.logout')}
              title={t('sidebar.logout')}
            >
              <LogOut size={16} />
              <span className="text-xs font-semibold hidden sm:block">{t('sidebar.logout')}</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto pb-safe" style={{ paddingBottom: 'max(80px, env(safe-area-inset-bottom, 80px))' }}>
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
