import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search,
  ArrowRight,
  CornerDownLeft,
  X,
  FileText,
  Building2,
  CheckSquare,
  User,
  Globe,
  LogOut,
  Copy,
  Check,
  PlusCircle,
  FolderKanban,
  Megaphone,
  Loader2,
} from 'lucide-react';
import { useCommandPalette } from '../../contexts/CommandPaletteContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTabs } from '../../contexts/TabsContext';
import { NAV_GROUPS } from './navConfig';
import api from '../../api/client';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  path?: string;
  category: 'recent' | 'navigation' | 'projects' | 'actions' | 'system';
  categoryLabel: string;
  icon: React.ElementType;
  keywords?: string[];
  action: () => void;
  badge?: string;
}

interface ProjectSummary {
  _id: string;
  name: string;
  code?: string;
  client?: string;
  status?: string;
}

const RECENT_STORAGE_KEY = 'mterp_recent_commands_v1';
const MAX_RECENT_ITEMS = 5;

export default function CommandPalette() {
  const { isOpen, close, isMac } = useCommandPalette();
  const { user, logout } = useAuth();
  const { openTab } = useTabs();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const userRole = user?.role?.toLowerCase() || 'worker';

  // Lock body scroll and load projects when dialog is opened
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 40);

    // Fetch projects once
    if (projects.length === 0) {
      let isMounted = true;
      const loadProjects = async () => {
        try {
          setIsLoadingProjects(true);
          const res = await api.get('/projects');
          if (isMounted && Array.isArray(res.data)) {
            setProjects(res.data);
          }
        } catch {
          try {
            const fallback = await api.get('/attendance/projects');
            if (isMounted && Array.isArray(fallback.data)) {
              setProjects(fallback.data);
            }
          } catch {
            // Ignore offline error
          }
        } finally {
          if (isMounted) {
            setIsLoadingProjects(false);
          }
        }
      };

      queueMicrotask(() => {
        if (isMounted) {
          loadProjects();
        }
      });

      return () => {
        isMounted = false;
        document.body.style.overflow = originalOverflow;
        clearTimeout(timer);
      };
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      clearTimeout(timer);
    };
  }, [isOpen, projects.length]);

  const handleClose = useCallback(() => {
    setQuery('');
    setSelectedIndex(0);
    close();
  }, [close]);

  // Record command in recents
  const recordRecent = useCallback((id: string) => {
    setRecentIds((prev) => {
      const updated = [id, ...prev.filter((item) => item !== id)].slice(0, MAX_RECENT_ITEMS);
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, []);

  const clearRecents = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentIds([]);
    try {
      localStorage.removeItem(RECENT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const executeItem = useCallback(
    (item: CommandItem) => {
      recordRecent(item.id);
      handleClose();
      item.action();
    },
    [handleClose, recordRecent]
  );

  // Build the complete list of available command items
  const allCommands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // 1. Navigation items from NAV_GROUPS filtered by userRole
    NAV_GROUPS.forEach((group) => {
      const groupTitle = group.titleKey ? t(group.titleKey, group.defaultTitle) : group.defaultTitle;
      group.items.forEach((navItem) => {
        if (navItem.roles.includes(userRole)) {
          const label = navItem.label.includes('sidebar.') ? t(navItem.label) : navItem.label;
          items.push({
            id: `nav_${navItem.id}`,
            title: label,
            subtitle: groupTitle,
            path: navItem.route,
            category: 'navigation',
            categoryLabel: t('commandPalette.groups.navigation', 'Navigasi Menu'),
            icon: navItem.icon,
            keywords: [groupTitle, navItem.id, navItem.route],
            action: () => navigate(navItem.route),
          });
        }
      });
    });

    // Additional core navigation pages
    items.push({
      id: 'nav_profile',
      title: t('common.profile', 'Profil Saya'),
      subtitle: user?.fullName || 'Pengaturan Akun',
      path: '/profile',
      category: 'navigation',
      categoryLabel: t('commandPalette.groups.navigation', 'Navigasi Menu'),
      icon: User,
      keywords: ['profile', 'akun', 'user', 'settings'],
      action: () => navigate('/profile'),
    });

    items.push({
      id: 'nav_notifications',
      title: t('common.notifications', 'Pusat Notifikasi'),
      subtitle: t('common.viewAllNotifications', 'Semua pemberitahuan sistem'),
      path: '/notifications',
      category: 'navigation',
      categoryLabel: t('commandPalette.groups.navigation', 'Navigasi Menu'),
      icon: Megaphone,
      keywords: ['notif', 'bell', 'pemberitahuan', 'inbox'],
      action: () => navigate('/notifications'),
    });

    // 2. Quick Actions
    const isOwnerOrAdmin = ['owner', 'president_director', 'operational_director', 'director', 'site_manager'].includes(userRole);

    if (isOwnerOrAdmin) {
      items.push({
        id: 'action_new_project',
        title: t('dashboard.newProject', 'Buat Proyek Baru'),
        subtitle: t('projects.createSubtitle', 'Daftarkan proyek konstruksi baru'),
        path: '/add-project',
        category: 'actions',
        categoryLabel: t('commandPalette.groups.actions', 'Aksi Cepat'),
        icon: PlusCircle,
        keywords: ['tambah', 'proyek', 'baru', 'add', 'project', 'create'],
        action: () => navigate('/add-project'),
      });
    }

    items.push({
      id: 'action_attendance_clock',
      title: t('commandPalette.quickAttendance', 'Presensi & Kehadiran'),
      subtitle: t('commandPalette.quickAttendanceSub', 'Buka pencatatan kehadiran'),
      category: 'actions',
      categoryLabel: t('commandPalette.groups.actions', 'Aksi Cepat'),
      icon: Building2,
      keywords: ['absen', 'clock in', 'clock out', 'kehadiran', 'presensi'],
      action: () => {
        if (['owner', 'president_director', 'operational_director', 'director', 'admin_project', 'asset_admin', 'device_admin'].includes(userRole)) {
          navigate('/office-attendance');
        } else if (['worker', 'tukang', 'helper'].includes(userRole)) {
          navigate('/attendance');
        } else {
          navigate('/group-attendance');
        }
      },
    });

    items.push({
      id: 'action_create_spkl',
      title: t('commandPalette.quickSpkl', 'Buat Surat Lembur (SPKL)'),
      subtitle: t('commandPalette.quickSpklSub', 'Pengajuan lembur pekerjaan'),
      path: '/spkl',
      category: 'actions',
      categoryLabel: t('commandPalette.groups.actions', 'Aksi Cepat'),
      icon: FileText,
      keywords: ['lembur', 'spkl', 'overtime', 'surat perintah kerja lembur'],
      action: () => navigate('/spkl'),
    });

    if (['site_manager', 'supervisor', 'foreman', 'asset_admin', 'admin_project'].includes(userRole)) {
      items.push({
        id: 'action_daily_report',
        title: t('commandPalette.quickReport', 'Isi Laporan Harian'),
        subtitle: t('commandPalette.quickReportSub', 'Laporan progres lapangan & cuaca'),
        path: '/daily-report',
        category: 'actions',
        categoryLabel: t('commandPalette.groups.actions', 'Aksi Cepat'),
        icon: FileText,
        keywords: ['laporan', 'harian', 'daily', 'report', 'cuaca', 'mandor'],
        action: () => navigate('/daily-report'),
      });
    }

    if (['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'].includes(userRole)) {
      items.push({
        id: 'action_approvals',
        title: t('commandPalette.quickApprovals', 'Periksa Persetujuan & Kasbon'),
        subtitle: t('commandPalette.quickApprovalsSub', 'Permintaan material, kasbon & cuti'),
        path: '/approvals',
        category: 'actions',
        categoryLabel: t('commandPalette.groups.actions', 'Aksi Cepat'),
        icon: CheckSquare,
        keywords: ['approval', 'persetujuan', 'kasbon', 'request', 'acc'],
        action: () => navigate('/approvals'),
      });
    }

    // 3. Projects
    projects.forEach((proj) => {
      items.push({
        id: `project_${proj._id}`,
        title: proj.name,
        subtitle: proj.client ? `${proj.code || 'Proyek'} • ${proj.client}` : proj.code || 'Detail Proyek',
        path: `/project/${proj._id}`,
        category: 'projects',
        categoryLabel: t('commandPalette.groups.projects', 'Proyek'),
        icon: FolderKanban,
        badge: proj.status || 'Active',
        keywords: [proj.name, proj.code || '', proj.client || '', 'proyek', 'project'],
        action: () => navigate(`/project/${proj._id}`),
      });
    });

    // 4. System & Preferences
    items.push({
      id: 'sys_toggle_lang',
      title: i18n.language === 'id' ? 'Switch Language to English' : 'Ganti Bahasa ke Indonesia',
      subtitle: t('commandPalette.currentLanguage', 'Bahasa aktif: {{lang}}', {
        lang: i18n.language === 'id' ? 'Bahasa Indonesia' : 'English',
      }),
      category: 'system',
      categoryLabel: t('commandPalette.groups.system', 'Sistem & Preferensi'),
      icon: Globe,
      keywords: ['language', 'bahasa', 'english', 'indonesia', 'translate'],
      action: () => {
        const nextLang = i18n.language === 'id' ? 'en' : 'id';
        i18n.changeLanguage(nextLang);
      },
    });

    items.push({
      id: 'sys_copy_url',
      title: copiedLink ? t('commandPalette.urlCopied', 'Tautan Berhasil Disalin!') : t('commandPalette.copyUrl', 'Salin Tautan Halaman Ini'),
      subtitle: window.location.pathname,
      category: 'system',
      categoryLabel: t('commandPalette.groups.system', 'Sistem & Preferensi'),
      icon: copiedLink ? Check : Copy,
      keywords: ['copy', 'salin', 'link', 'url', 'share'],
      action: () => {
        navigator.clipboard.writeText(window.location.href);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      },
    });

    items.push({
      id: 'sys_logout',
      title: t('sidebar.logout', 'Keluar dari Akun'),
      subtitle: user?.email || user?.fullName || 'Akhiri sesi aktif',
      category: 'system',
      categoryLabel: t('commandPalette.groups.system', 'Sistem & Preferensi'),
      icon: LogOut,
      keywords: ['logout', 'signout', 'keluar', 'exit'],
      action: () => logout(),
    });

    return items;
  }, [userRole, projects, user, t, i18n, navigate, copiedLink, logout]);

  // Filtered & grouped items
  const filteredItems = useMemo<CommandItem[]>(() => {
    const trimmed = query.trim().toLowerCase();

    if (!trimmed) {
      // When query is empty:
      // Show Recents first, then Quick Actions, then Navigation, then System
      const recents: CommandItem[] = [];
      recentIds.forEach((id) => {
        const found = allCommands.find((c) => c.id === id);
        if (found) {
          recents.push({
            ...found,
            category: 'recent',
            categoryLabel: t('commandPalette.groups.recent', 'Terkini'),
          });
        }
      });

      // Filter out duplicate recents from the rest of the list
      const nonRecents = allCommands.filter((c) => !recentIds.includes(c.id));
      return [...recents, ...nonRecents];
    }

    // Fuzzy matching against query
    return allCommands.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(trimmed);
      const matchSubtitle = item.subtitle?.toLowerCase().includes(trimmed);
      const matchKeywords = item.keywords?.some((k) => k.toLowerCase().includes(trimmed));
      const matchCategory = item.categoryLabel.toLowerCase().includes(trimmed);
      return matchTitle || matchSubtitle || matchKeywords || matchCategory;
    });
  }, [query, allCommands, recentIds, t]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  // Keyboard navigation inside the palette
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length === 0 ? 0 : (prev + 1) % filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length === 0 ? 0 : (prev - 1 + filteredItems.length) % filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const currentItem = filteredItems[selectedIndex];
      if (currentItem) {
        if ((e.ctrlKey || e.metaKey) && currentItem.path) {
          recordRecent(currentItem.id);
          handleClose();
          openTab(currentItem.path, { title: currentItem.title });
          return;
        }
        executeItem(currentItem);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  if (!isOpen) return null;

  // Group items by categoryLabel for visual section headers
  let lastCategory = '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-[200] flex items-start justify-center p-4 sm:p-6 md:p-12 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#0f172a] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col z-10 animate-in zoom-in-95 fade-in duration-150 my-auto sm:my-0 sm:mt-12">
        {/* Header Search Input */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          {isLoadingProjects ? (
            <Loader2 size={18} className="text-primary shrink-0 mr-3 animate-spin" />
          ) : (
            <Search size={18} className="text-primary shrink-0 mr-3 animate-pulse" />
          )}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-autocomplete="list"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('commandPalette.placeholder', 'Ketik menu, proyek, atau aksi cepat...')}
            className="flex-1 bg-transparent border-none outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm sm:text-base font-medium"
          />

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors mr-2 cursor-pointer"
              title={t('common.clear', 'Hapus')}
            >
              <X size={15} />
            </button>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-400 bg-slate-200/60 dark:bg-slate-800 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer border border-slate-300/60 dark:border-slate-700"
          >
            ESC
          </button>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          id="command-palette-results"
          role="listbox"
          className="max-h-[380px] sm:max-h-[440px] overflow-y-auto divide-y divide-transparent p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700"
        >
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                <Search size={22} />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {t('commandPalette.noResults', 'Tidak ada hasil untuk')} &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                {t('commandPalette.noResultsHint', 'Coba cari dengan kata kunci lain seperti nama proyek, surat lembur, presensi, atau menu.')}
              </p>
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;
              const showCategoryHeader = item.categoryLabel !== lastCategory;
              if (showCategoryHeader) {
                lastCategory = item.categoryLabel;
              }

              return (
                <React.Fragment key={item.id}>
                  {showCategoryHeader && (
                    <div className="flex items-center justify-between px-3 pt-3 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
                      <span>{item.categoryLabel}</span>
                      {item.category === 'recent' && (
                        <button
                          type="button"
                          onClick={clearRecents}
                          className="text-[10px] font-semibold text-slate-400 hover:text-red-500 lowercase transition-colors cursor-pointer bg-transparent border-none p-0"
                        >
                          {t('common.clear', 'hapus')}
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    role="option"
                    aria-selected={isSelected}
                    type="button"
                    onClick={() => executeItem(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer border ${
                      isSelected
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200 border-transparent'
                    }`}
                  >
                    {/* Item Icon */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Icon size={18} />
                    </div>

                    {/* Title & Subtitle */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                          {item.title}
                        </span>
                        {item.badge && (
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-300'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className={`text-xs truncate m-0 mt-0.5 ${isSelected ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                          {item.subtitle}
                        </p>
                      )}
                    </div>

                    {/* Action Hint */}
                    <div className="shrink-0 flex items-center">
                      {isSelected ? (
                        <div className="flex items-center gap-1 text-[11px] font-bold text-white/90 bg-white/15 px-2 py-1 rounded-lg">
                          <span>{t('commandPalette.open', 'Buka')}</span>
                          <CornerDownLeft size={12} />
                        </div>
                      ) : (
                        <ArrowRight size={14} className="text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer toolbar with shortcut hints & role info */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs font-semibold text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs font-semibold text-[10px]">↓</kbd>
              <span>{t('commandPalette.navigate', 'Pilih')}</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs font-semibold text-[10px]">↵</kbd>
              <span>{t('commandPalette.select', 'Eksekusi')}</span>
            </span>
            <span className="hidden md:flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs font-semibold text-[10px]">
                {isMac ? '⌘' : 'Ctrl'}+↵
              </kbd>
              <span>Tab Baru</span>
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs font-semibold text-[10px]">esc</kbd>
              <span>{t('commandPalette.close', 'Tutup')}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-block text-[10px] text-slate-400">
              {isMac ? '⌘K' : 'Ctrl+K'}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="font-semibold text-slate-600 dark:text-slate-300 capitalize truncate max-w-[120px]">
                {user?.role?.replace(/_/g, ' ') || 'Staff'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
