import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  Receipt,
  Globe,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

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
    id: 'attendance',
    label: 'sidebar.attendance',
    icon: Clock,
    route: '/attendance',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project', 'worker', 'foreman', 'tukang', 'helper'],
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
];

export default function Sidebar() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
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
    <aside className="w-[260px] min-h-screen bg-gradient-to-b from-primary to-primary-light p-6 flex flex-col fixed left-0 top-0 bottom-0 z-[100] border-r-2 border-border-light max-lg:hidden">
      <div className="flex items-center gap-3 pb-6 border-b border-white/10 mb-6">
        <div className="w-12 h-12 bg-white/15 rounded-md flex items-center justify-center -rotate-6">
          <Wrench size={28} color="white" />
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-black text-white">mterp<span className="text-white/60">.</span></span>
          <span className="text-xs text-white/60">Construction ERP</span>
        </div>
      </div>

      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto pr-2 -mr-2">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.route ||
            location.pathname.startsWith(item.route + '/');

          return (
            <NavLink
              key={item.id}
              to={item.route}
              className={`flex items-center gap-3 py-3 px-4 rounded-md font-medium text-sm transition-all relative ${
                isActive
                  ? 'bg-white/20 text-white font-bold before:absolute before:-left-6 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-6 before:bg-white before:rounded-r-md'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={20} />
              <span>{item.label.includes('sidebar.') ? t(item.label) : item.label}</span>
              {isActive && <ChevronRight size={16} className="ml-auto opacity-60" />}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer with profile & logout */}
      <div className="mt-auto pt-4 border-t border-white/10 flex flex-col gap-2">
        <NavLink
          to="/profile"
          className={`flex items-center gap-3 py-3 px-4 rounded-md transition-all relative ${
            isProfileActive
              ? 'bg-white/20 text-white'
              : 'text-white/85 hover:bg-white/10 hover:text-white'
          }`}
        >
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white shrink-0 overflow-hidden">
            {user?.profileImage ? (
              <img src={user.profileImage} alt={user?.fullName} className="w-full h-full object-cover rounded-full" />
            ) : (
              <User size={18} />
            )}
          </div>
          <div className="flex flex-col overflow-hidden min-w-0">
            <span className="text-sm font-semibold text-white whitespace-nowrap overflow-hidden text-ellipsis">{user?.fullName || 'User'}</span>
            <span className="text-xs text-white/50 capitalize">{user?.role || 'Worker'}</span>
          </div>
        </NavLink>

        <button className="flex items-center gap-3 py-3 px-4 rounded-md bg-white/10 border border-white/10 text-white/70 text-sm font-medium transition-all w-full hover:bg-white/20 hover:text-white mb-2" onClick={toggleLanguage}>
          <Globe size={18} />
          <span>{i18n.language === 'id' ? 'English' : 'Bahasa Ind'}</span>
        </button>

        <button className="flex items-center gap-3 py-3 px-4 rounded-md bg-white/10 border border-white/10 text-white/70 text-sm font-medium transition-all w-full hover:bg-red-500/25 hover:text-red-300 hover:border-red-500/30" onClick={handleLogout}>
          <LogOut size={18} />
          <span>{t('sidebar.logout')}</span>
        </button>
      </div>
    </aside>
  );
}
