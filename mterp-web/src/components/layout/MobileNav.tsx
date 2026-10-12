import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, LogOut, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { NAV_GROUPS, NavItemConfig } from './navConfig';

export default function MobileNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const userRole = user?.role?.toLowerCase() || 'worker';

  // Filter groups and items according to the current user's role
  const visibleGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(userRole)),
    })).filter((group) => group.items.length > 0);
  }, [userRole]);

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
        className={`fixed inset-0 bg-black/50 backdrop-blur-xs transition-all duration-300 z-[998] lg:hidden ${
          isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
        onClick={() => setIsOpen(false)}
      />

      {/* Menu Drawer / Floating Panel */}
      <div
        className={`fixed bottom-24 right-4 sm:right-6 transition-all duration-300 z-[999] lg:hidden ${
          isOpen ? 'opacity-100 visible translate-y-0 scale-100' : 'opacity-0 invisible translate-y-5 scale-95'
        }`}
      >
        <div className="flex flex-col gap-3 p-3 bg-bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.16)] border border-border-light max-h-[75vh] overflow-y-auto w-72 sm:w-80">
          {/* Header in drawer */}
          <div className="flex items-center justify-between pb-2 border-b border-border-light px-1">
            <span className="text-xs font-black uppercase tracking-wider text-text-muted">Menu Navigasi</span>
            <span className="text-[10px] font-bold text-primary uppercase bg-primary/10 px-2 py-0.5 rounded-full">
              {user?.role?.replace(/_/g, ' ') || 'Staff'}
            </span>
          </div>

          {/* Grouped Modules */}
          {visibleGroups.map((group) => {
            const groupTitle = group.titleKey ? t(group.titleKey, group.defaultTitle) : group.defaultTitle;

            return (
              <div key={group.id} className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-text-muted/70 px-2 pt-1">
                  {groupTitle}
                </span>

                <div className="flex flex-col gap-1">
                  {group.items.map((item: NavItemConfig) => {
                    const Icon = item.icon;
                    const isActive =
                      location.pathname === item.route ||
                      (item.route !== '/home' && location.pathname.startsWith(item.route + '/'));
                    const labelText = item.label.includes('sidebar.') ? t(item.label) : item.label;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all duration-150 text-left cursor-pointer border-none ${
                          isActive
                            ? 'bg-primary/10 text-primary font-bold shadow-xs'
                            : 'bg-transparent text-text-primary hover:bg-bg-secondary'
                        }`}
                        onClick={() => handleNavigation(item.route)}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isActive ? 'bg-primary text-white shadow-xs' : 'bg-bg-secondary text-text-secondary'
                          }`}
                        >
                          <Icon size={16} />
                        </div>
                        <span className="text-xs sm:text-[13px] font-medium truncate flex-1">{labelText}</span>
                        {isActive && <ChevronRight size={14} className="text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Logout Button */}
          <button
            type="button"
            className="flex items-center gap-3 py-2.5 px-3 bg-red-50 hover:bg-red-100 rounded-xl transition-colors cursor-pointer border border-red-100 mt-2 text-left"
            onClick={handleLogout}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-red-500 text-white shadow-xs">
              <LogOut size={16} />
            </div>
            <span className="text-xs sm:text-[13px] font-bold text-red-600 truncate">{t('sidebar.logout', 'Keluar')}</span>
          </button>
        </div>
      </div>

      {/* FAB Button */}
      <button
        type="button"
        className={`fixed bottom-6 right-6 w-14 h-14 flex items-center justify-center z-[1000] cursor-pointer transition-all duration-300 lg:hidden shadow-[0_4px_20px_rgba(30,64,175,0.4),0_8px_32px_rgba(30,64,175,0.2)] active:scale-95 hover:scale-105 ${
          isOpen
            ? 'rounded-full bg-bg-primary text-text-primary !shadow-[0_0_0_4px_rgba(30,64,175,0.15),0_4px_20px_rgba(0,0,0,0.1)]'
            : 'rounded-2xl bg-gradient-to-br from-primary to-primary-light text-white'
        }`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Navigation menu"
      >
        <Menu
          className={`absolute transition-all duration-300 ${
            isOpen ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'
          }`}
          size={24}
        />
        <X
          className={`absolute transition-all duration-300 text-text-primary ${
            isOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'
          }`}
          size={24}
        />
      </button>
    </>
  );
}
