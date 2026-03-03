import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { useAuth } from '../../contexts/AuthContext';
import { Badge, IconButton } from '../shared';
import './AppLayout.css';

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
      <div className="app-loading">
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
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <header className="app-header">
          <div className="app-header-left">
            <span className="app-greeting">{t(getGreetingKey())}</span>
            <span className="app-username">{user?.fullName || 'User'}</span>
            <Badge 
              label={user?.role?.toUpperCase() || 'STAFF'} 
              variant="neutral"
              size="small"
            />
          </div>
          <div className="app-header-right">
            <IconButton
              icon={LogOut}
              onClick={handleLogout}
              size={20}
              color="var(--text-secondary)"
              backgroundColor="var(--bg-secondary)"
            />
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

