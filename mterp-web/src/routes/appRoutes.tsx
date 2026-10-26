/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import {
  Home as HomeIcon,
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
  ShieldCheck,
  Megaphone,
} from 'lucide-react';
import { lazyWithRetry } from '../utils/lazyWithRetry';

// Lazy-loaded page components
export const Home             = lazyWithRetry(() => import('../pages/Home'), 'Home');
export const Dashboard        = lazyWithRetry(() => import('../pages/Dashboard'), 'Dashboard');
export const Projects         = lazyWithRetry(() => import('../pages/Projects'), 'Projects');
export const ProjectDetail    = lazyWithRetry(() => import('../pages/ProjectDetail'), 'ProjectDetail');
export const ProjectTools     = lazyWithRetry(() => import('../pages/ProjectTools'), 'ProjectTools');
export const AddProject       = lazyWithRetry(() => import('../pages/AddProject'), 'AddProject');
export const Tools            = lazyWithRetry(() => import('../pages/Tools'), 'Tools');
export const Materials        = lazyWithRetry(() => import('../pages/Materials'), 'Materials');
export const ProjectMaterials = lazyWithRetry(() => import('../pages/ProjectMaterials'), 'ProjectMaterials');
export const MaterialUsage    = lazyWithRetry(() => import('../pages/MaterialUsage'), 'MaterialUsage');
export const Approvals        = lazyWithRetry(() => import('../pages/Approvals'), 'Approvals');
export const Tasks            = lazyWithRetry(() => import('../pages/Tasks'), 'Tasks');
export const Attendance       = lazyWithRetry(() => import('../pages/Attendance'), 'Attendance');
export const GroupAttendance  = lazyWithRetry(() => import('../pages/GroupAttendance'), 'GroupAttendance');
export const OfficeAttendance = lazyWithRetry(() => import('../pages/OfficeAttendance'), 'OfficeAttendance');
export const AttendanceLogs   = lazyWithRetry(() => import('../pages/AttendanceLogs'), 'AttendanceLogs');
export const AttendanceRecap  = lazyWithRetry(() => import('../pages/AttendanceRecap'), 'AttendanceRecap');
export const DailyReport      = lazyWithRetry(() => import('../pages/DailyReport'), 'DailyReport');
export const Profile          = lazyWithRetry(() => import('../pages/Profile'), 'Profile');
export const MyPayments       = lazyWithRetry(() => import('../pages/MyPayments'), 'MyPayments');
export const SlipGaji         = lazyWithRetry(() => import('../pages/SlipGaji'), 'SlipGaji');
export const ProjectReports   = lazyWithRetry(() => import('../pages/ProjectReports'), 'ProjectReports');
export const Users            = lazyWithRetry(() => import('../pages/Users'), 'Users');
export const ProjectAssign    = lazyWithRetry(() => import('../pages/ProjectAssign'), 'ProjectAssign');
export const ProjectDocuments = lazyWithRetry(() => import('../pages/ProjectDocuments'), 'ProjectDocuments');
export const Notifications    = lazyWithRetry(() => import('../pages/Notifications'), 'Notifications');
export const ProjectPlan      = lazyWithRetry(() => import('../pages/ProjectPlan'), 'ProjectPlan');
export const ProjectSwakelola = lazyWithRetry(() => import('../pages/ProjectSwakelola'), 'ProjectSwakelola');
export const OvertimeSPKL     = lazyWithRetry(() => import('../pages/OvertimeSPKL'), 'OvertimeSPKL');
export const ApprovalConfig   = lazyWithRetry(() => import('../pages/ApprovalConfig'), 'ApprovalConfig');

export interface RouteMeta {
  path: string;
  defaultTitle: string;
  titleKey?: string;
  icon: React.ElementType;
}

export const ROUTE_METADATA: RouteMeta[] = [
  { path: '/home', defaultTitle: 'Home', titleKey: 'nav.home', icon: HomeIcon },
  { path: '/dashboard', defaultTitle: 'Dasbor', titleKey: 'sidebar.dashboard', icon: BarChart3 },
  { path: '/projects', defaultTitle: 'Proyek', titleKey: 'sidebar.projects', icon: Briefcase },
  { path: '/add-project', defaultTitle: 'Tambah Proyek', titleKey: 'projects.addProject', icon: Briefcase },
  { path: '/project/:id', defaultTitle: 'Detail Proyek', titleKey: 'projects.projectDetail', icon: Briefcase },
  { path: '/project-tools/:id', defaultTitle: 'Alat Proyek', icon: Wrench },
  { path: '/tools', defaultTitle: 'Peralatan', titleKey: 'sidebar.tools', icon: Wrench },
  { path: '/materials', defaultTitle: 'Pengadaan & PO', titleKey: 'sidebar.materials', icon: Truck },
  { path: '/project-materials/:id', defaultTitle: 'Material Proyek', icon: Truck },
  { path: '/project-material-usage/:id', defaultTitle: 'Penggunaan Material', icon: Truck },
  { path: '/approvals', defaultTitle: 'Persetujuan', titleKey: 'sidebar.approvals', icon: CheckSquare },
  { path: '/tasks', defaultTitle: 'Tugas', titleKey: 'sidebar.tasks', icon: ClipboardList },
  { path: '/attendance', defaultTitle: 'Presensi', titleKey: 'sidebar.attendance', icon: Clock },
  { path: '/group-attendance', defaultTitle: 'Presensi Lapangan', icon: Clock },
  { path: '/office-attendance', defaultTitle: 'Presensi Kantor', icon: Building2 },
  { path: '/attendance-logs', defaultTitle: 'Log Presensi', icon: Clock },
  { path: '/attendance-recap', defaultTitle: 'Rekap Presensi', icon: Clock },
  { path: '/daily-report', defaultTitle: 'Laporan Harian', icon: FileText },
  { path: '/profile', defaultTitle: 'Profil', titleKey: 'common.profile', icon: User },
  { path: '/my-payments', defaultTitle: 'Pembayaran Saya', titleKey: 'sidebar.payments', icon: DollarSign },
  { path: '/slip-gaji', defaultTitle: 'Slip Gaji', titleKey: 'sidebar.payroll', icon: Receipt },
  { path: '/project-reports/:id', defaultTitle: 'Laporan Proyek', icon: FileText },
  { path: '/project-documents/:id', defaultTitle: 'Dokumen Proyek', icon: FileText },
  { path: '/project-plan/:id', defaultTitle: 'Rencana Proyek', icon: FileText },
  { path: '/project/:id/plan', defaultTitle: 'Rencana Proyek', icon: FileText },
  { path: '/users', defaultTitle: 'User Management', icon: User },
  { path: '/project-assign', defaultTitle: 'Penugasan Proyek', icon: UserCog },
  { path: '/notifications', defaultTitle: 'Notifikasi', titleKey: 'common.notifications', icon: Megaphone },
  { path: '/swakelola', defaultTitle: 'Swakelola SCM', icon: Receipt },
  { path: '/project-swakelola/:id', defaultTitle: 'Swakelola Proyek', icon: Receipt },
  { path: '/project/:id/swakelola', defaultTitle: 'Swakelola Proyek', icon: Receipt },
  { path: '/spkl', defaultTitle: 'Surat Lembur (SPKL)', icon: FileText },
  { path: '/overtime', defaultTitle: 'Surat Lembur (SPKL)', icon: FileText },
  { path: '/approval-config', defaultTitle: 'Kebijakan Approval', icon: ShieldCheck },
];

/**
 * Match a pathname to its title and icon metadata
 */
export function getRouteMetadata(pathname: string, translate?: (key: string, defaultVal: string) => string): { title: string; icon: React.ElementType } {
  // Strip query string and trailing slash if any
  const cleanPath = (pathname.split('?')[0] || '').replace(/\/$/, '') || '/home';

  // Exact match first
  const exact = ROUTE_METADATA.find((r) => r.path === cleanPath);
  if (exact) {
    const title = translate && exact.titleKey ? translate(exact.titleKey, exact.defaultTitle) : exact.defaultTitle;
    return { title, icon: exact.icon };
  }

  // Parameterized match
  for (const meta of ROUTE_METADATA) {
    if (meta.path.includes(':')) {
      const regexPattern = '^' + meta.path.replace(/:[a-zA-Z0-9_]+/g, '([^/]+)') + '$';
      const regex = new RegExp(regexPattern);
      if (regex.test(cleanPath)) {
        const title = translate && meta.titleKey ? translate(meta.titleKey, meta.defaultTitle) : meta.defaultTitle;
        return { title, icon: meta.icon };
      }
    }
  }

  return { title: 'MTERP', icon: Briefcase };
}

/**
 * Standard Protected Routes JSX for Tabbed Router
 */
export function renderProtectedRoutes() {
  return (
    <>
      <Route path="/home" element={<Home />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/project/:id" element={<ProjectDetail />} />
      <Route path="/project-tools/:id" element={<ProjectTools />} />
      <Route path="/add-project" element={<AddProject />} />
      <Route path="/tools" element={<Tools />} />
      <Route path="/materials" element={<Materials />} />
      <Route path="/project-materials/:id" element={<ProjectMaterials />} />
      <Route path="/project-material-usage/:id" element={<MaterialUsage />} />
      <Route path="/approvals" element={<Approvals />} />
      <Route path="/tasks" element={<Tasks />} />
      <Route path="/attendance" element={<Attendance />} />
      <Route path="/group-attendance" element={<GroupAttendance />} />
      <Route path="/office-attendance" element={<OfficeAttendance />} />
      <Route path="/attendance-logs" element={<AttendanceLogs />} />
      <Route path="/attendance-recap" element={<AttendanceRecap />} />
      <Route path="/daily-report" element={<DailyReport />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/my-payments" element={<MyPayments />} />
      <Route path="/slip-gaji" element={<SlipGaji />} />
      <Route path="/project-reports/:id" element={<ProjectReports />} />
      <Route path="/project-documents/:id" element={<ProjectDocuments />} />
      <Route path="/project-plan/:id" element={<ProjectPlan />} />
      <Route path="/project/:id/plan" element={<ProjectPlan />} />
      <Route path="/users" element={<Users />} />
      <Route path="/project-assign" element={<ProjectAssign />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/swakelola" element={<ProjectSwakelola />} />
      <Route path="/project-swakelola/:id" element={<ProjectSwakelola />} />
      <Route path="/project/:id/swakelola" element={<ProjectSwakelola />} />
      <Route path="/spkl" element={<OvertimeSPKL />} />
      <Route path="/overtime" element={<OvertimeSPKL />} />
      <Route path="/approval-config" element={<ApprovalConfig />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </>
  );
}
