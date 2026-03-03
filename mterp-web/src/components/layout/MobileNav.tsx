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
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import './MobileNav.css';

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
    roles: ['owner', 'director', 'supervisor', 'admin_project', 'asset_admin', 'worker', 'mandor', 'tukang', 'logistik'],
    color: '#6366F1',
    bg: '#EEF2FF',
  },
  {
    id: 'dashboard',
    label: 'sidebar.dashboard',
    icon: BarChart3,
    route: '/dashboard',
    roles: ['owner', 'director', 'supervisor', 'asset_admin'],
    color: '#312E59',
    bg: '#F0EDF6',
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    route: '/profile',
    roles: ['owner', 'director', 'supervisor', 'admin_project', 'asset_admin', 'worker', 'mandor', 'tukang', 'logistik'],
    color: '#6366F1',
    bg: '#EEF2FF',
  },
  {
    id: 'projects',
    label: 'sidebar.projects',
    icon: Briefcase,
    route: '/projects',
    roles: ['owner', 'director', 'supervisor', 'admin_project', 'asset_admin'],
    color: '#D97706',
    bg: '#FEF3C7',
  },
  {
    id: 'daily-report',
    label: 'Daily Report',
    icon: FileText,
    route: '/daily-report',
    roles: ['supervisor', 'asset_admin', 'admin_project', 'mandor'],
    color: '#3B82F6',
    bg: '#DBEAFE',
  },
  {
    id: 'tools',
    label: 'sidebar.tools',
    icon: Wrench,
    route: '/tools',
    roles: ['owner', 'director', 'supervisor', 'admin_project', 'asset_admin', 'logistik'],
    color: '#0EA5E9',
    bg: '#E0F2FE',
  },
  {
    id: 'materials',
    label: 'sidebar.materials',
    icon: Truck,
    route: '/materials',
    roles: ['owner', 'director', 'supervisor', 'admin_project', 'asset_admin', 'logistik'],
    color: '#8B5CF6',
    bg: '#EDE9FE',
  },
  {
    id: 'attendance',
    label: 'sidebar.attendance',
    icon: Clock,
    route: '/attendance',
    roles: ['owner', 'director', 'supervisor', 'asset_admin', 'admin_project', 'worker', 'mandor', 'tukang'],
    color: '#10B981',
    bg: '#D1FAE5',
  },
  {
    id: 'tasks',
    label: 'sidebar.tasks',
    icon: ClipboardList,
    route: '/tasks',
    roles: ['worker', 'tukang', 'mandor', 'supervisor', 'asset_admin', 'admin_project'],
    color: '#F59E0B',
    bg: '#FEF3C7',
  },
  {
    id: 'my-payments',
    label: 'sidebar.payments',
    icon: DollarSign,
    route: '/my-payments',
    roles: ['worker', 'tukang', 'mandor'],
    color: '#059669',
    bg: '#D1FAE5',
  },
  {
    id: 'approvals',
    label: 'sidebar.approvals',
    icon: CheckSquare,
    route: '/approvals',
    roles: ['owner', 'director', 'supervisor', 'asset_admin', 'admin_project'],
    color: '#EF4444',
    bg: '#FEE2E2',
  },
  {
    id: 'slip-gaji',
    label: 'sidebar.payroll',
    icon: Receipt,
    route: '/slip-gaji',
    roles: ['owner', 'director', 'supervisor', 'asset_admin'],
    color: '#0D9488',
    bg: '#CCFBF1',
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
        className={`mobile-nav-overlay ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(false)}
      />

      {/* Menu Items */}
      <div className={`mobile-nav-menu ${isOpen ? 'open' : ''}`}>
        <div className="mobile-nav-items">
          {filteredItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.route ||
              location.pathname.startsWith(item.route + '/');

            return (
              <button
                key={item.id}
                className={`mobile-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleNavigation(item.route)}
                style={{
                  animationDelay: `${index * 50}ms`,
                  '--item-color': item.color,
                  '--item-bg': item.bg,
                } as React.CSSProperties}
              >
                <div className="mobile-nav-item-icon" style={{ backgroundColor: item.bg }}>
                  <Icon size={20} color={item.color} />
                </div>
                <span className="mobile-nav-item-label">{item.label.includes('sidebar.') ? t(item.label) : item.label}</span>
              </button>
            );
          })}

          {/* Logout Button */}
          <button
            className="mobile-nav-item logout"
            onClick={handleLogout}
            style={{ animationDelay: `${filteredItems.length * 50}ms` }}
          >
            <div className="mobile-nav-item-icon" style={{ backgroundColor: '#FEE2E2' }}>
              <LogOut size={20} color="#EF4444" />
            </div>
            <span className="mobile-nav-item-label">{t('sidebar.logout')}</span>
          </button>
        </div>
      </div>

      {/* FAB Button */}
      <button
        className={`mobile-nav-fab ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Navigation menu"
      >
        <Menu className="fab-icon menu" size={24} />
        <X className="fab-icon close" size={24} />
      </button>
    </>
  );
}
