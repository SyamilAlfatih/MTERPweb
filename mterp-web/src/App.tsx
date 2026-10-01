import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { SwakelolaProvider } from './contexts/SwakelolaContext';
import { initOfflineSyncListeners } from './services/syncEngine';
import { initAttendanceSyncListeners } from './services/attendanceSyncEngine';
import AppLayout from './components/layout/AppLayout';

// ─── Eager (entry-point pages — always needed immediately) ────────────────────
import Login from './pages/Login';
import Register from './pages/Register';

// ─── Lazy (route-split — each page loads only when its route is visited) ──────
const Home             = lazy(() => import('./pages/Home'));
const Dashboard        = lazy(() => import('./pages/Dashboard'));
const Projects         = lazy(() => import('./pages/Projects'));
const ProjectDetail    = lazy(() => import('./pages/ProjectDetail'));
const ProjectTools     = lazy(() => import('./pages/ProjectTools'));
const AddProject       = lazy(() => import('./pages/AddProject'));
const Tools            = lazy(() => import('./pages/Tools'));
const Materials        = lazy(() => import('./pages/Materials'));
const ProjectMaterials = lazy(() => import('./pages/ProjectMaterials'));
const MaterialUsage    = lazy(() => import('./pages/MaterialUsage'));
const Approvals        = lazy(() => import('./pages/Approvals'));
const Tasks            = lazy(() => import('./pages/Tasks'));
const Attendance       = lazy(() => import('./pages/Attendance'));
const GroupAttendance  = lazy(() => import('./pages/GroupAttendance'));
const OfficeAttendance = lazy(() => import('./pages/OfficeAttendance'));
const AttendanceLogs   = lazy(() => import('./pages/AttendanceLogs'));
const AttendanceRecap  = lazy(() => import('./pages/AttendanceRecap'));
const DailyReport      = lazy(() => import('./pages/DailyReport'));
const Profile          = lazy(() => import('./pages/Profile'));
const MyPayments       = lazy(() => import('./pages/MyPayments'));
const SlipGaji         = lazy(() => import('./pages/SlipGaji'));
const ProjectReports   = lazy(() => import('./pages/ProjectReports'));
const Users            = lazy(() => import('./pages/Users'));
const ProjectAssign    = lazy(() => import('./pages/ProjectAssign'));
const ProjectDocuments = lazy(() => import('./pages/ProjectDocuments'));
const Notifications    = lazy(() => import('./pages/Notifications'));
const ProjectPlan      = lazy(() => import('./pages/ProjectPlan'));
const ProjectSwakelola = lazy(() => import('./pages/ProjectSwakelola'));

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
            </BrowserRouter>
          </SwakelolaProvider>
        </SidebarProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
