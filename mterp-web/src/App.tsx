import { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { SwakelolaProvider } from './contexts/SwakelolaContext';
import { initOfflineSyncListeners } from './services/syncEngine';
import { initAttendanceSyncListeners } from './services/attendanceSyncEngine';
import AppLayout from './components/layout/AppLayout';
import { ErrorBoundary } from './components/shared';
import { lazyWithRetry } from './utils/lazyWithRetry';

// ─── Eager (entry-point pages — always needed immediately) ────────────────────
import Login from './pages/Login';
import Register from './pages/Register';

// ─── Lazy (route-split — each page loads only when its route is visited) ──────
// Uses lazyWithRetry to automatically refresh when new deployment changes chunk hashes
const Home             = lazyWithRetry(() => import('./pages/Home'), 'Home');
const Dashboard        = lazyWithRetry(() => import('./pages/Dashboard'), 'Dashboard');
const Projects         = lazyWithRetry(() => import('./pages/Projects'), 'Projects');
const ProjectDetail    = lazyWithRetry(() => import('./pages/ProjectDetail'), 'ProjectDetail');
const ProjectTools     = lazyWithRetry(() => import('./pages/ProjectTools'), 'ProjectTools');
const AddProject       = lazyWithRetry(() => import('./pages/AddProject'), 'AddProject');
const Tools            = lazyWithRetry(() => import('./pages/Tools'), 'Tools');
const Materials        = lazyWithRetry(() => import('./pages/Materials'), 'Materials');
const ProjectMaterials = lazyWithRetry(() => import('./pages/ProjectMaterials'), 'ProjectMaterials');
const MaterialUsage    = lazyWithRetry(() => import('./pages/MaterialUsage'), 'MaterialUsage');
const Approvals        = lazyWithRetry(() => import('./pages/Approvals'), 'Approvals');
const Tasks            = lazyWithRetry(() => import('./pages/Tasks'), 'Tasks');
const Attendance       = lazyWithRetry(() => import('./pages/Attendance'), 'Attendance');
const GroupAttendance  = lazyWithRetry(() => import('./pages/GroupAttendance'), 'GroupAttendance');
const OfficeAttendance = lazyWithRetry(() => import('./pages/OfficeAttendance'), 'OfficeAttendance');
const AttendanceLogs   = lazyWithRetry(() => import('./pages/AttendanceLogs'), 'AttendanceLogs');
const AttendanceRecap  = lazyWithRetry(() => import('./pages/AttendanceRecap'), 'AttendanceRecap');
const DailyReport      = lazyWithRetry(() => import('./pages/DailyReport'), 'DailyReport');
const Profile          = lazyWithRetry(() => import('./pages/Profile'), 'Profile');
const MyPayments       = lazyWithRetry(() => import('./pages/MyPayments'), 'MyPayments');
const SlipGaji         = lazyWithRetry(() => import('./pages/SlipGaji'), 'SlipGaji');
const ProjectReports   = lazyWithRetry(() => import('./pages/ProjectReports'), 'ProjectReports');
const Users            = lazyWithRetry(() => import('./pages/Users'), 'Users');
const ProjectAssign    = lazyWithRetry(() => import('./pages/ProjectAssign'), 'ProjectAssign');
const ProjectDocuments = lazyWithRetry(() => import('./pages/ProjectDocuments'), 'ProjectDocuments');
const Notifications    = lazyWithRetry(() => import('./pages/Notifications'), 'Notifications');
const ProjectPlan      = lazyWithRetry(() => import('./pages/ProjectPlan'), 'ProjectPlan');
const ProjectSwakelola = lazyWithRetry(() => import('./pages/ProjectSwakelola'), 'ProjectSwakelola');

// ─── Page loading fallback ────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg-primary z-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
        <span className="text-xs font-bold text-text-muted uppercase tracking-widest">Memuat...</span>
      </div>
    </div>
  );
}

function AuthRedirectHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleUnauthorized = () => {
      navigate('/', { replace: true });
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [navigate]);

  return null;
}

function App() {
  useEffect(() => {
    const cleanupSwakelola = initOfflineSyncListeners();
    const cleanupAttendance = initAttendanceSyncListeners();
    return () => {
      cleanupSwakelola();
      cleanupAttendance();
    };
  }, []);

  return (
    <AuthProvider>
      <NotificationProvider>
        <SidebarProvider>
          <SwakelolaProvider>
            <BrowserRouter>
              <AuthRedirectHandler />
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<Login />} />
                    <Route path="/register" element={<Register />} />

                    {/* Protected Routes */}
                    <Route element={<AppLayout />}>
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
                    </Route>

                    {/* Fallback */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </BrowserRouter>
          </SwakelolaProvider>
        </SidebarProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
