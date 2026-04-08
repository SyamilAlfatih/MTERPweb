import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import ProjectTools from './pages/ProjectTools';
import AddProject from './pages/AddProject';
import Tools from './pages/Tools';
import Materials from './pages/Materials';
import ProjectMaterials from './pages/ProjectMaterials';
import MaterialUsage from './pages/MaterialUsage';
import Approvals from './pages/Approvals';
import Tasks from './pages/Tasks';
import Attendance from './pages/Attendance';
import AttendanceLogs from './pages/AttendanceLogs';
import DailyReport from './pages/DailyReport';
import Profile from './pages/Profile';
import MyPayments from './pages/MyPayments';
import Dashboard from './pages/Dashboard';
import SlipGaji from './pages/SlipGaji';
import ProjectReports from './pages/ProjectReports';
import Users from './pages/Users';
import AttendanceRecap from './pages/AttendanceRecap';

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
  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthRedirectHandler />
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
            <Route path="/attendance-logs" element={<AttendanceLogs />} />
            <Route path="/attendance-recap" element={<AttendanceRecap />} />
            <Route path="/daily-report" element={<DailyReport />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/my-payments" element={<MyPayments />} />
            <Route path="/slip-gaji" element={<SlipGaji />} />
            <Route path="/project-reports/:id" element={<ProjectReports />} />
            <Route path="/users" element={<Users />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
