import React, { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBreadcrumbContext } from '../../contexts/BreadcrumbContext';

export interface CrumbItem {
  label: string;
  path?: string;
  isCurrent?: boolean;
}

export const Breadcrumbs: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { dynamicLabels } = useBreadcrumbContext();
  const pathname = location.pathname;

  const { crumbs, parentPath } = useMemo(() => {
    const list: CrumbItem[] = [];
    let parent: string | undefined = undefined;

    // Home special case
    if (pathname === '/home') {
      return { crumbs: [{ label: t('nav.home', 'Home'), isCurrent: true }], parentPath: undefined };
    }

    // Always start with Home
    list.push({ label: t('nav.home', 'Home'), path: '/home' });

    // ── 1. PROJECT HIERARCHIES ──
    const projectSubMatch = pathname.match(/^\/project-([a-z-]+)\/([^/]+)/);
    const projectDetailMatch = pathname.match(/^\/project\/([^/]+)(\/([a-z-]+))?/);

    if (pathname === '/projects') {
      list.push({ label: t('sidebar.projects', 'Projects'), isCurrent: true });
    } else if (pathname === '/add-project') {
      parent = '/projects';
      list.push({ label: t('sidebar.projects', 'Projects'), path: '/projects' });
      list.push({ label: t('projects.addProject', 'Tambah Proyek'), isCurrent: true });
    } else if (projectDetailMatch) {
      const projectId = projectDetailMatch[1];
      const subTab = projectDetailMatch[3];
      const projectName = dynamicLabels.project || dynamicLabels[projectId] || t('projects.projectDetail', 'Detail Proyek');

      parent = '/projects';
      list.push({ label: t('sidebar.projects', 'Projects'), path: '/projects' });

      if (subTab) {
        list.push({ label: projectName, path: `/project/${projectId}` });
        const subTitles: Record<string, string> = {
          plan: 'Rencana Kerja & Kurva S',
          swakelola: 'Swakelola SCM',
        };
        list.push({ label: subTitles[subTab] || subTab, isCurrent: true });
        parent = `/project/${projectId}`;
      } else {
        list.push({ label: projectName, isCurrent: true });
      }
    } else if (projectSubMatch) {
      const subType = projectSubMatch[1];
      const projectId = projectSubMatch[2];
      const projectName = dynamicLabels.project || dynamicLabels[projectId] || t('projects.projectDetail', 'Detail Proyek');

      parent = `/project/${projectId}`;
      list.push({ label: t('sidebar.projects', 'Projects'), path: '/projects' });
      list.push({ label: projectName, path: `/project/${projectId}` });

      const subTitles: Record<string, string> = {
        tools: t('sidebar.tools', 'Peralatan Proyek'),
        materials: t('sidebar.materials', 'Material Proyek'),
        'material-usage': 'Pemakaian Material',
        swakelola: 'Swakelola SCM',
        reports: 'Laporan Proyek',
        documents: 'Dokumen Proyek',
        plan: 'Rencana Kerja & Kurva S',
      };
      list.push({ label: subTitles[subType] || subType, isCurrent: true });
    }
    // ── 2. OPERATIONS & TASKS ──
    else if (pathname === '/tasks') {
      list.push({ label: t('sidebar.tasks', 'Tasks'), isCurrent: true });
    } else if (pathname === '/daily-report') {
      list.push({ label: 'Daily Report', isCurrent: true });
    }
    // ── 3. SUPPLY CHAIN & RESOURCES ──
    else if (pathname === '/tools') {
      list.push({ label: t('sidebar.tools', 'Peralatan'), isCurrent: true });
    } else if (pathname === '/materials') {
      list.push({ label: t('sidebar.materials', 'Material'), isCurrent: true });
    } else if (pathname === '/swakelola') {
      list.push({ label: 'Swakelola SCM', isCurrent: true });
    }
    // ── 4. HR & WORKFORCE ──
    else if (pathname === '/office-attendance') {
      list.push({ label: 'Presensi Kantor', isCurrent: true });
    } else if (pathname === '/group-attendance') {
      list.push({ label: 'Presensi Lapangan', isCurrent: true });
    } else if (pathname === '/attendance') {
      list.push({ label: t('sidebar.attendance', 'Presensi Mandiri'), isCurrent: true });
    } else if (pathname === '/attendance-logs') {
      parent = '/attendance';
      list.push({ label: t('sidebar.attendance', 'Presensi'), path: '/attendance' });
      list.push({ label: 'Log Presensi', isCurrent: true });
    } else if (pathname === '/attendance-recap') {
      parent = '/attendance';
      list.push({ label: t('sidebar.attendance', 'Presensi'), path: '/attendance' });
      list.push({ label: t('attendanceRecap.title', 'Rekap Presensi'), isCurrent: true });
    } else if (pathname === '/spkl' || pathname === '/overtime') {
      list.push({ label: 'Surat Lembur (SPKL)', isCurrent: true });
    }
    // ── 5. FINANCE & APPROVALS ──
    else if (pathname === '/approvals') {
      list.push({ label: t('sidebar.approvals', 'Persetujuan'), isCurrent: true });
    } else if (pathname === '/slip-gaji') {
      list.push({ label: t('sidebar.payroll', 'Slip Gaji'), isCurrent: true });
    } else if (pathname === '/my-payments') {
      list.push({ label: t('sidebar.payments', 'Pembayaran Saya'), isCurrent: true });
    }
    // ── 6. ADMINISTRATION & SYSTEM ──
    else if (pathname === '/users') {
      list.push({ label: 'User Management', isCurrent: true });
    } else if (pathname === '/project-assign') {
      list.push({ label: 'Project Assignments', isCurrent: true });
    }
    // ── 7. PERSONAL & UTILITY ──
    else if (pathname === '/dashboard') {
      list.push({ label: t('sidebar.dashboard', 'Dasbor'), isCurrent: true });
    } else if (pathname === '/profile') {
      list.push({ label: 'Profile', isCurrent: true });
    } else if (pathname === '/notifications') {
      list.push({ label: 'Notifications', isCurrent: true });
    } else {
      // Fallback
      const segments = pathname.split('/').filter(Boolean);
      const cleanTitle = segments[segments.length - 1]
        ?.replace(/-/g, ' ')
        ?.replace(/\b\w/g, (c) => c.toUpperCase()) || 'MTERP';
      list.push({ label: cleanTitle, isCurrent: true });
    }

    return { crumbs: list, parentPath: parent };
  }, [pathname, dynamicLabels, t]);

  const handleBack = () => {
    if (parentPath) {
      navigate(parentPath);
    } else {
      navigate(-1);
    }
  };

  const showBackButton = crumbs.length > 2 || Boolean(parentPath);

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 sm:gap-2 min-w-0 overflow-hidden py-1"
    >
      {/* Smart Back button on deep pages */}
      {showBackButton && (
        <button
          type="button"
          onClick={handleBack}
          aria-label="Kembali ke halaman sebelumnya"
          title="Kembali"
          className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-bg-secondary hover:bg-border/60 text-text-primary hover:text-primary transition-all duration-150 border border-border-light shrink-0 cursor-pointer active:scale-95 mr-0.5"
        >
          <ArrowLeft size={14} className="sm:w-4 sm:h-4" />
        </button>
      )}

      {/* Breadcrumb Trail */}
      <ol className="flex items-center gap-1 sm:gap-1.5 list-none m-0 p-0 min-w-0 overflow-hidden text-xs sm:text-sm">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          const isRoot = idx === 0 && crumb.path === '/home';

          return (
            <li
              key={`${crumb.label}-${idx}`}
              className="flex items-center gap-1 sm:gap-1.5 min-w-0 shrink-0 last:shrink"
            >
              {idx > 0 && (
                <ChevronRight
                  size={13}
                  className="text-text-muted/50 shrink-0 select-none"
                  aria-hidden="true"
                />
              )}

              {isLast ? (
                <span
                  className="font-bold text-text-primary truncate max-w-[130px] sm:max-w-[220px] md:max-w-[340px]"
                  title={crumb.label}
                  aria-current="page"
                >
                  {crumb.label}
                </span>
              ) : crumb.path ? (
                <Link
                  to={crumb.path}
                  title={crumb.label}
                  className="flex items-center gap-1 text-text-muted hover:text-primary font-medium transition-colors duration-150 truncate max-w-[100px] sm:max-w-[160px]"
                >
                  {isRoot && <Home size={13} className="shrink-0 mb-0.5" />}
                  <span className="truncate">{crumb.label}</span>
                </Link>
              ) : (
                <span className="text-text-muted font-medium truncate max-w-[100px] sm:max-w-[160px]">
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
