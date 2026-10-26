import { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { SwakelolaProvider } from './contexts/SwakelolaContext';
import { BreadcrumbProvider } from './contexts/BreadcrumbContext';
import { CommandPaletteProvider } from './contexts/CommandPaletteContext';
import { TabsProvider } from './contexts/TabsContext';
import { initOfflineSyncListeners } from './services/syncEngine';
import { initAttendanceSyncListeners } from './services/attendanceSyncEngine';
import AppLayout from './components/layout/AppLayout';
import { ErrorBoundary } from './components/shared';

// ─── Eager (entry-point pages — always needed immediately) ────────────────────
import Login from './pages/Login';
import Register from './pages/Register';

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
            <BreadcrumbProvider>
              <CommandPaletteProvider>
                <BrowserRouter>
                  <TabsProvider>
                    <AuthRedirectHandler />
                    <ErrorBoundary>
                      <Suspense fallback={<PageLoader />}>
                        <Routes>
                          {/* Public Routes */}
                          <Route path="/" element={<Login />} />
                          <Route path="/register" element={<Register />} />

                          {/* Protected App Shell with Multi-Tab Management */}
                          <Route path="/*" element={<AppLayout />} />
                        </Routes>
                      </Suspense>
                    </ErrorBoundary>
                  </TabsProvider>
                </BrowserRouter>
              </CommandPaletteProvider>
            </BreadcrumbProvider>
          </SwakelolaProvider>
        </SidebarProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
