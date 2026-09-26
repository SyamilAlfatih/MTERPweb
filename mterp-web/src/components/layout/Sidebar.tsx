import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home,
  BarChart3,
  Briefcase,
  Wrench,
  Clock,
  ClipboardList,
  CheckSquare,
  Truck,
  FileText,
  DollarSign,
  User,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Receipt,
  Globe,
  UserCog,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useSidebar } from '../../contexts/SidebarContext';
import { getImageUrl } from '../../utils/image';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  route: string;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    route: '/home',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'foreman', 'admin_project', 'asset_admin', 'worker', 'tukang', 'helper'],
  },
  {
    id: 'dashboard',
    label: 'sidebar.dashboard',
    icon: BarChart3,
    route: '/dashboard',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'],
  },
  {
    id: 'projects',
    label: 'sidebar.projects',
    icon: Briefcase,
    route: '/projects',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin'],
  },
  {
    id: 'daily-report',
    label: 'Daily Report',
    icon: FileText,
    route: '/daily-report',
    roles: ['site_manager', 'supervisor', 'foreman', 'asset_admin', 'admin_project'],
  },
  {
    id: 'tools',
    label: 'sidebar.tools',
    icon: Wrench,
    route: '/tools',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin'],
  },
  {
    id: 'materials',
    label: 'sidebar.materials',
    icon: Truck,
    route: '/materials',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin'],
  },
  {
    id: 'swakelola',
    label: 'Swakelola SCM',
    icon: Receipt,
    route: '/swakelola',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin'],
  },
  {
    id: 'attendance',
    label: 'sidebar.attendance',
    icon: Clock,
    route: '/group-attendance',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project', 'foreman'],
  },
  {
    id: 'attendance-legacy',
    label: 'sidebar.attendance',
    icon: Clock,
    route: '/attendance',
    roles: ['worker', 'tukang', 'helper'],
  },
  {
    id: 'tasks',
    label: 'sidebar.tasks',
    icon: ClipboardList,
    route: '/tasks',
    roles: ['worker', 'tukang', 'helper', 'foreman', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'],
  },
  {
    id: 'my-payments',
    label: 'sidebar.payments',
    icon: DollarSign,
    route: '/my-payments',
    roles: ['worker', 'tukang', 'helper', 'foreman'],
  },
  {
    id: 'approvals',
    label: 'sidebar.approvals',
    icon: CheckSquare,
    route: '/approvals',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'],
  },
  {
    id: 'slip-gaji',
    label: 'sidebar.payroll',
    icon: Receipt,
    route: '/slip-gaji',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin'],
  },
  {
    id: 'users',
    label: 'User Management',
    icon: User,
    route: '/users',
    roles: ['owner'],
  },
  {
    id: 'project-assign',
    label: 'Project Assignments',
    icon: UserCog,
    route: '/project-assign',
    roles: ['owner', 'director', 'supervisor', 'asset_admin', 'admin_project'],
  },
];

export default function Sidebar() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { isCollapsed, toggle } = useSidebar();
  const location = useLocation();
  const userRole = user?.role?.toLowerCase() || 'worker';

  const filteredItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(userRole)
  );

  const isProfileActive = location.pathname === '/profile';

  const handleLogout = () => {
    logout();
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'id' ? 'en' : 'id';
    i18n.changeLanguage(newLang);
  };

  return (
    <aside
      className={`min-h-screen bg-gradient-to-b from-[#0d1b3e] to-[#1a2f5f] flex flex-col fixed left-0 top-0 bottom-0 z-[100] border-r border-slate-700/60 shadow-xl transition-[width,padding] duration-250 ease-[cubic-bezier(0.4,0,0.2,1)] max-lg:hidden select-none ${
        isCollapsed ? 'w-[72px] p-3' : 'w-[260px] p-5'
      }`}
    >
      {/* Floating Toggle Pill Button */}
      <button
        type="button"
        onClick={toggle}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-7 z-[102] w-6 h-6 rounded-full bg-white text-[#0d1b3e] shadow-md border border-slate-200 flex items-center justify-center cursor-pointer hover:bg-slate-100 hover:scale-110 active:scale-95 transition-all duration-200"
      >
        <ChevronLeft
          size={14}
          className={`transition-transform duration-250 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`}
        />
      </button>

      {/* Brand Header */}
      <div
        className={`flex items-center gap-3 pb-5 border-b border-white/10 mb-4 transition-all duration-200 ${
          isCollapsed ? 'justify-center' : 'justify-start'
        }`}
      >
        <div className="w-10 h-10 bg-white/15 backdrop-blur-xs rounded-xl flex items-center justify-center shrink-0 -rotate-3 transition-transform hover:rotate-0">
          <Wrench size={22} color="white" />
        </div>
        {!isCollapsed && (
          <div className="flex flex-col min-w-0 overflow-hidden">
            <span className="text-xl font-black text-white tracking-tight leading-none truncate">
              mterp<span className="text-blue-400">.</span>
            </span>
            <span className="text-[11px] text-white/60 font-medium tracking-wide leading-tight truncate mt-1">
              Construction ERP
            </span>
          </div>
        )}
      </div>

      {/* Navigation items */}
      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto overflow-x-hidden pr-1 -mr-1 py-1">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            location.pathname === item.route ||
            location.pathname.startsWith(item.route + '/');
          const labelText = item.label.includes('sidebar.')
            ? t(item.label)
            : item.label;

          return (
            <NavLink
              key={item.id}
              to={item.route}
              title={isCollapsed ? labelText : undefined}
              className={`flex items-center rounded-xl font-medium text-sm transition-all duration-150 relative group ${
                isCollapsed
                  ? 'justify-center py-2.5 px-0'
                  : 'gap-3 py-2.5 px-3 hover:translate-x-0.5'
              } ${
                isActive
                  ? 'bg-white/20 text-white font-bold shadow-sm'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              {/* Active Slide Indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full animate-slide-indicator origin-center" />
              )}

              <Icon
                size={20}
                className={`shrink-0 transition-transform group-hover:scale-110 ${
                  isActive ? 'text-white' : 'text-white/80'
                }`}
              />

              {!isCollapsed && (
                <span className="truncate flex-1">{labelText}</span>
              )}

              {!isCollapsed && isActive && (
                <ChevronRight size={14} className="ml-auto opacity-60 shrink-0" />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer with Profile, Language & Logout */}
      <div className="mt-auto pt-3 border-t border-white/10 flex flex-col gap-2">
        {/* Profile Card / Icon */}
        <NavLink
          to="/profile"
          title={isCollapsed ? (user?.fullName || 'Profile') : undefined}
          className={`flex items-center rounded-xl transition-all relative ${
            isCollapsed
              ? 'justify-center py-2 px-0'
              : 'gap-3 p-2 bg-white/10 backdrop-blur-sm hover:bg-white/15'
          } ${
            isProfileActive
              ? 'ring-2 ring-white/40'
              : 'hover:bg-white/10'
          }`}
        >
          {isProfileActive && isCollapsed && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full animate-slide-indicator origin-center" />
          )}
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0 overflow-hidden shadow-inner">
            {user?.profileImage ? (
              <img
                src={getImageUrl(user.profileImage)}
                alt={user?.fullName}
                className="w-full h-full object-cover"
              />
            ) : (
              <User size={18} />
            )}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden min-w-0 flex-1">
              <span className="text-xs font-bold text-white truncate leading-tight">
                {user?.fullName || 'User'}
              </span>
              <span className="text-[10px] text-white/60 capitalize truncate leading-tight mt-0.5">
                {user?.role?.replace(/_/g, ' ') || 'Worker'}
              </span>
            </div>
          )}
        </NavLink>

        {/* Language switch button */}
        <button
          type="button"
          onClick={toggleLanguage}
          title={isCollapsed ? (i18n.language === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia') : undefined}
          className={`flex items-center rounded-xl bg-white/10 border border-white/10 text-white/80 text-xs font-medium transition-all hover:bg-white/20 hover:text-white cursor-pointer ${
            isCollapsed
              ? 'justify-center py-2 px-0'
              : 'gap-2.5 py-2 px-3'
          }`}
        >
          <Globe size={16} className="shrink-0" />
          {!isCollapsed && (
            <span className="truncate">{i18n.language === 'id' ? 'English' : 'Bahasa Ind'}</span>
          )}
        </button>

        {/* Logout button */}
        <button
          type="button"
          onClick={handleLogout}
          title={isCollapsed ? t('sidebar.logout') : undefined}
          className={`flex items-center rounded-xl bg-white/10 border border-white/10 text-white/80 text-xs font-medium transition-all hover:bg-red-500/25 hover:text-red-200 hover:border-red-500/40 cursor-pointer ${
            isCollapsed
              ? 'justify-center py-2 px-0'
              : 'gap-2.5 py-2 px-3'
          }`}
        >
          <LogOut size={16} className="shrink-0" />
          {!isCollapsed && (
            <span className="truncate">{t('sidebar.logout')}</span>
          )}
        </button>
      </div>
    </aside>
  );
}
