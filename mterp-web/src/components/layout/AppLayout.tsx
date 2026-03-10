import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { useAuth } from '../../contexts/AuthContext';
import { Badge, IconButton } from '../shared';

export default function AppLayout() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  // Dynamic greeting based on time of day
  const getGreetingKey = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'home.greeting.morning';
    if (hour < 17) return 'home.greeting.afternoon';
    return 'home.greeting.evening';
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-text-muted">
        <div className="spinner"></div>
        <span>{t('home.updates.loading')}</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col bg-bg-primary ml-[260px] max-lg:ml-0">
        <header className="flex justify-between items-center p-4 lg:px-6 bg-bg-white border-b-2 border-border-light transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-text-muted text-sm max-sm:text-xs">{t(getGreetingKey())}</span>
            <span className="text-text-primary text-base font-bold max-sm:text-sm">{user?.fullName || 'User'}</span>
            <Badge 
              label={user?.role?.toUpperCase() || 'STAFF'} 
              variant="neutral"
              size="small"
            />
          </div>
          <div className="flex items-center gap-3">
            <IconButton
              icon={LogOut}
              onClick={handleLogout}
              size={20}
              color="var(--text-secondary)"
              backgroundColor="var(--bg-secondary)"
            />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto max-sm:pb-[80px]">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

