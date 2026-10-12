import React from 'react';
import {
  Home,
  BarChart3,
  Briefcase,
  FileText,
  Wrench,
  Truck,
  Receipt,
  Building2,
  Clock,
  ClipboardList,
  CheckSquare,
  DollarSign,
  User,
  UserCog,
} from 'lucide-react';

export interface NavItemConfig {
  id: string;
  label: string;          // Translation key or display text
  icon: React.ElementType;
  route: string;
  roles: string[];
  badgeKey?: 'approvals' | 'notifications';
}

export interface NavGroupConfig {
  id: string;
  titleKey: string;      // Translation key or default title
  defaultTitle: string;
  items: NavItemConfig[];
}

export const NAV_GROUPS: NavGroupConfig[] = [
  {
    id: 'overview',
    titleKey: 'sidebar.groups.overview',
    defaultTitle: 'Ikhtisar',
    items: [
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
    ],
  },
  {
    id: 'operations',
    titleKey: 'sidebar.groups.operations',
    defaultTitle: 'Proyek & Operasional',
    items: [
      {
        id: 'projects',
        label: 'sidebar.projects',
        icon: Briefcase,
        route: '/projects',
        roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin'],
      },
      {
        id: 'tasks',
        label: 'sidebar.tasks',
        icon: ClipboardList,
        route: '/tasks',
        roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin', 'foreman', 'worker', 'tukang', 'helper'],
      },
      {
        id: 'daily-report',
        label: 'Daily Report',
        icon: FileText,
        route: '/daily-report',
        roles: ['site_manager', 'supervisor', 'foreman', 'asset_admin', 'admin_project'],
      },
    ],
  },
  {
    id: 'supply_chain',
    titleKey: 'sidebar.groups.supply_chain',
    defaultTitle: 'Logistik & Aset',
    items: [
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
    ],
  },
  {
    id: 'workforce',
    titleKey: 'sidebar.groups.workforce',
    defaultTitle: 'SDM & Presensi',
    items: [
      {
        id: 'office-attendance',
        label: 'Presensi Kantor',
        icon: Building2,
        route: '/office-attendance',
        roles: ['owner', 'president_director', 'operational_director', 'director', 'admin_project', 'asset_admin', 'device_admin'],
      },
      {
        id: 'attendance',
        label: 'Presensi Lapangan',
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
        id: 'spkl',
        label: 'Surat Lembur (SPKL)',
        icon: FileText,
        route: '/spkl',
        roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'admin_project', 'asset_admin', 'foreman', 'worker', 'tukang', 'helper'],
      },
    ],
  },
  {
    id: 'finance',
    titleKey: 'sidebar.groups.finance',
    defaultTitle: 'Keuangan & Kontrol',
    items: [
      {
        id: 'approvals',
        label: 'sidebar.approvals',
        icon: CheckSquare,
        route: '/approvals',
        roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin', 'admin_project'],
        badgeKey: 'approvals',
      },
      {
        id: 'slip-gaji',
        label: 'sidebar.payroll',
        icon: Receipt,
        route: '/slip-gaji',
        roles: ['owner', 'president_director', 'operational_director', 'director', 'site_manager', 'supervisor', 'asset_admin'],
      },
      {
        id: 'my-payments',
        label: 'sidebar.payments',
        icon: DollarSign,
        route: '/my-payments',
        roles: ['worker', 'tukang', 'helper', 'foreman'],
      },
    ],
  },
  {
    id: 'admin',
    titleKey: 'sidebar.groups.admin',
    defaultTitle: 'Sistem & Administrasi',
    items: [
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
    ],
  },
];
