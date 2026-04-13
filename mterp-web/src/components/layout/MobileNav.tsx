import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  Menu,
  X,
  LogOut,
  User,
  DollarSign,
  Receipt,
  UserCog,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  route: string;
  roles: string[];
  color: string;
  bg: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    route: '/home',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'foreman', 'admin_project', 'asset_admin', 'worker', 'tukang', 'helper'],
    color: '#6366F1',
    bg: '#EEF2FF',
  },
  {
    id: 'dashboard',
    label: 'sidebar.dashboard',
    icon: BarChart3,
    route: '/dashboard',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'],
    color: '#312E59',
    bg: '#F0EDF6',
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    route: '/profile',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'foreman', 'admin_project', 'asset_admin', 'worker', 'tukang', 'helper'],
    color: '#6366F1',
    bg: '#EEF2FF',
  },
  {
    id: 'users',
    label: 'User Management',
    icon: User,
    route: '/users',
    roles: ['owner'],
    color: '#E81CFF',
    bg: '#FEEBFF',
  },
  {
    id: 'projects',
    label: 'sidebar.projects',
    icon: Briefcase,
    route: '/projects',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin'],
    color: '#D97706',
    bg: '#FEF3C7',
  },
  {
    id: 'daily-report',
    label: 'Daily Report',
    icon: FileText,
    route: '/daily-report',
    roles: ['site_manager', 'supervisor', 'foreman', 'asset_admin', 'admin_project'],
    color: '#3B82F6',
    bg: '#DBEAFE',
  },
  {
    id: 'tools',
    label: 'sidebar.tools',
    icon: Wrench,
    route: '/tools',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin'],
    color: '#0EA5E9',
    bg: '#E0F2FE',
  },
  {
    id: 'materials',
    label: 'sidebar.materials',
    icon: Truck,
    route: '/materials',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin'],
    color: '#8B5CF6',
    bg: '#EDE9FE',
  },
  {
    id: 'attendance',
    label: 'sidebar.attendance',
    icon: Clock,
    route: '/attendance',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project', 'worker', 'foreman', 'tukang', 'helper'],
    color: '#10B981',
    bg: '#D1FAE5',
  },
  {
    id: 'tasks',
    label: 'sidebar.tasks',
    icon: ClipboardList,
    route: '/tasks',
    roles: ['worker', 'tukang', 'helper', 'foreman', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'],
    color: '#F59E0B',
    bg: '#FEF3C7',
  },
  {
    id: 'my-payments',
    label: 'sidebar.payments',
    icon: DollarSign,
    route: '/my-payments',
    roles: ['worker', 'tukang', 'helper', 'foreman'],
    color: '#059669',
    bg: '#D1FAE5',
  },
  {
    id: 'approvals',
    label: 'sidebar.approvals',
    icon: CheckSquare,
    route: '/approvals',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'],
    color: '#EF4444',
    bg: '#FEE2E2',
  },
  {
    id: 'slip-gaji',
    label: 'sidebar.payroll',
    icon: Receipt,
    route: '/slip-gaji',
    roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin'],
    color: '#0D9488',
    bg: '#CCFBF1',
  },
  {
    id: 'project-assign',
    label: 'Project Assignments',
    icon: UserCog,
    route: '/project-assign',
    roles: ['owner', 'director', 'supervisor', 'asset_admin', 'admin_project'],
    color: '#7C3AED',
    bg: '#EDE9FE',
  },
];

export default function MobileNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const userRole = user?.role?.toLowerCase() || 'worker';

  const filteredItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(userRole)
  );

  const handleNavigation = (route: string) => {
    navigate(route);
    setIsOpen(false);
  };

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm transition-all duration-300 z-[998] lg:hidden ${
          isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
        onClick={() => setIsOpen(false)}
      />

      {/* Menu Items */}
      <div 
        className={`fixed bottom-24 right-6 transition-all duration-300 z-[999] lg:hidden ${
          isOpen ? 'opacity-100 visible translate-y-0 scale-100' : 'opacity-0 invisible translate-y-5 scale-95'
        }`}
      >
        <div className="flex flex-col gap-2 p-2 bg-bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.1),0_8px_32px_rgba(0,0,0,0.05)] max-h-[70vh] overflow-y-auto w-64">
          {filteredItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.route ||
              location.pathname.startsWith(item.route + '/');

            return (
              <button
                key={item.id}
                className={`flex items-center gap-3 py-3 pr-4 pl-3 rounded-[14px] min-w-[180px] transition-all duration-300 transform ${
                  isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-5'
                } ${
                  isActive ? 'bg-primary-bg' : 'bg-bg-secondary hover:bg-bg-white hover:-translate-x-1 active:scale-95'
                }`}
                onClick={() => handleNavigation(item.route)}
                style={{
                  transitionDelay: `${isOpen ? index * 40 : 0}ms`,
                }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: item.bg }}>
                  <Icon size={20} color={item.color} />
                </div>
                <span className={`text-[15px] whitespace-nowrap ${isActive ? 'text-primary font-semibold' : 'text-text-primary font-medium'}`}>
                  {item.label.includes('sidebar.') ? t(item.label) : item.label}
                </span>
              </button>
            );
          })}

          {/* Logout Button */}
          <button
            className={`flex items-center gap-3 py-3 pr-4 pl-3 bg-bg-secondary rounded-[14px] min-w-[180px] transition-all duration-300 transform mt-1 border-t border-border-light pt-4 hover:bg-red-50 hover:-translate-x-1 active:scale-95 ${
              isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-5'
            }`}
            onClick={handleLogout}
            style={{ transitionDelay: `${isOpen ? filteredItems.length * 40 : 0}ms` }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-red-100">
              <LogOut size={20} className="text-red-500" />
            </div>
            <span className="text-[15px] font-medium text-text-primary whitespace-nowrap">{t('sidebar.logout')}</span>
          </button>
        </div>
      </div>

      {/* FAB Button */}
      <button
        className={`fixed bottom-6 right-6 w-14 h-14 flex items-center justify-center z-[1000] cursor-pointer transition-all duration-300 lg:hidden shadow-[0_4px_20px_rgba(30,64,175,0.4),0_8px_32px_rgba(30,64,175,0.2)] active:scale-95 hover:scale-105 ${
          isOpen ? 'rounded-full bg-bg-primary !shadow-[0_4px_20px_rgba(0,0,0,0.1)]' : 'rounded-2xl bg-gradient-to-br from-primary to-primary-light text-white'
        }`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Navigation menu"
      >
        <Menu 
          className={`absolute transition-all duration-300 ${isOpen ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`} 
          size={24} 
        />
        <X 
          className={`absolute transition-all duration-300 text-text-primary ${isOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`} 
          size={24} 
        />
      </button>
    </>
  );
}
