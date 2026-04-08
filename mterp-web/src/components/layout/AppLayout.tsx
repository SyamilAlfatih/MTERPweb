import React from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { useAuth } from '../../contexts/AuthContext';

export default function AppLayout() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const location = useLocation();

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
      '/tasks': t('sidebar.tasks', 'Tasks'),
      '/approvals': t('sidebar.approvals', 'Approvals'),
      '/slip-gaji': t('sidebar.payroll', 'Payroll'),
      '/my-payments': t('sidebar.payments', 'My Payments'),
      '/daily-report': 'Daily Report',
      '/users': 'User Management',
      '/profile': 'Profile',
    };
    return Object.entries(titles).find(([k]) => path === k || path.startsWith(k + '/'))?.[1] ?? 'MTERP';
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

          {/* Right: user chip + logout */}
          <div className="flex items-center gap-2 shrink-0 ml-4">
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
