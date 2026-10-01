import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HardHat, ArrowRight, User, WifiOff, ShieldAlert,
  CheckCircle2, AlertCircle, RefreshCw, UserCheck
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input } from '../components/shared';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, loginOffline, cachedUser, isAuthenticated } = useAuth();
  
  const [showLoading, setShowLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Offline & Server Status
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverDown, setServerDown] = useState(false);
  const [checkingServer, setCheckingServer] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/home');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    // Loading screen animation
    const timer = setTimeout(() => {
      setShowLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const checkServerHealth = async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      setServerDown(true);
      return;
    }
    setCheckingServer(true);
    try {
      await api.get('/health', { timeout: 3500 });
      setServerDown(false);
      setIsOnline(true);
      if (error === 'Server tidak dapat dihubungi atau sedang offline.') {
        setError('');
      }
    } catch (err) {
      console.warn('Backend server /health unreachable', err);
      setServerDown(true);
    } finally {
      setCheckingServer(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      checkServerHealth();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setServerDown(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check on mount
    if (!navigator.onLine) {
      setIsOnline(false);
      setServerDown(true);
    } else {
      checkServerHealth();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLogin = async () => {
    if (!username || !password) {
      setError(t('auth.login.usernameRequired'));
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await api.post('/auth/login', { username, password });
      login(response.data, response.data.token);
      setServerDown(false);
      navigate('/home');
    } catch (err: any) {
      const isNetworkIssue =
        !err.response ||
        err.code === 'ERR_NETWORK' ||
        (err.response && err.response.status >= 500);

      if (isNetworkIssue) {
        setServerDown(true);
        setError('Server tidak dapat dihubungi atau sedang offline.');
      } else {
        setError(err.response?.data?.msg || t('auth.login.networkError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineEnter = () => {
    const success = loginOffline();
    if (success) {
      // If supervisor role, redirect to group-attendance directly for convenience, else home
      const isSupervisor = cachedUser?.role && [
        'owner', 'president_director', 'operational_director', 'director',
        'supervisor', 'site_manager', 'admin_project', 'asset_admin', 'foreman',
      ].includes(cachedUser.role);

      navigate(isSupervisor ? '/group-attendance' : '/home');
    } else {
      setError('Gagal memuat profil offline. Harap login saat server online.');
    }
  };

  // Show loading screen
  if (showLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary to-primary-light">
        <div className="w-[100px] h-[100px] rounded-[24px] bg-white/15 flex items-center justify-center mb-6 animate-pulse">
          <HardHat size={60} color="white" />
        </div>
        <div className="flex text-[48px] font-black text-white max-sm:text-[36px]">
          <span className="animate-fade-in opacity-0" style={{ animationDelay: '0ms', animationFillMode: 'forwards' }}>m</span>
          <span className="animate-fade-in opacity-0" style={{ animationDelay: '50ms', animationFillMode: 'forwards' }}>t</span>
          <span className="animate-fade-in opacity-0" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>e</span>
          <span className="animate-fade-in opacity-0" style={{ animationDelay: '150ms', animationFillMode: 'forwards' }}>r</span>
          <span className="animate-fade-in opacity-0" style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}>p</span>
          <span className="text-white/60 animate-fade-in opacity-0" style={{ animationDelay: '250ms', animationFillMode: 'forwards' }}>.</span>
        </div>
        <p className="text-white/70 text-sm mt-2 animate-fade-in opacity-0" style={{ animationDelay: '500ms', animationFillMode: 'forwards' }}>{t('auth.login.subtitle')}</p>
      </div>
    );
  }

  const showOfflineBanner = !isOnline || serverDown;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#F8F9FA] to-[#E9ECEF] relative overflow-hidden py-10">
      <div className="absolute -top-[100px] -right-[100px] w-[300px] h-[300px] rounded-full bg-[#312e59]/5"></div>
      
      <div className="p-8 z-10 w-full max-w-[460px] max-sm:px-4 max-sm:py-6">
        <div className="mb-6 max-sm:mb-5">
          <div className="w-16 h-16 rounded-[18px] bg-gradient-to-br from-primary to-primary-light flex items-center justify-center mb-4 -rotate-6 shadow-hypr">
            <HardHat color="white" size={32} />
          </div>
          <h1 className="text-[36px] font-black text-primary tracking-tight m-0 max-sm:text-[28px]">mterp<span className="text-primary-light">.</span></h1>
          <p className="text-base text-text-muted font-medium m-0 max-sm:text-sm">{t('auth.login.subtitle')}</p>
        </div>

        {/* ══════════════ OFFLINE & SERVER DOWN BANNER ══════════════ */}
        {showOfflineBanner && (
          <div className="mb-6 rounded-2xl border border-amber-300/80 bg-amber-50/95 p-4 shadow-sm text-left animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0 border border-amber-500/20">
                <WifiOff size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-900">
                    {!isOnline ? 'Koneksi Terputus (Offline)' : 'Server Sedang Tidak Terjangkau'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-200/80 text-amber-900 border border-amber-300/80">
                    Mode Darurat
                  </span>
                </div>
                <p className="text-[11px] text-amber-950/80 leading-relaxed m-0 mb-3">
                  {!isOnline
                    ? 'Perangkat Anda tidak terhubung ke jaringan internet.'
                    : 'Server backend tidak dapat dihubungi atau sedang offline.'}
                </p>

                {/* Requirement callout */}
                <div className="p-3 rounded-xl bg-white/90 border border-amber-200/90 space-y-1.5 mb-3 shadow-xs">
                  <div className="flex items-start gap-2">
                    <ShieldAlert size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-amber-950 leading-snug">
                      <strong className="font-bold text-amber-950 block mb-0.5">Syarat Wajib Absensi Offline:</strong>
                      Untuk mencatat kehadiran mandiri atau sesi grup di lapangan saat offline, Pengguna / Supervisor <u>wajib sudah pernah login dengan kredensial akun minimal 1 kali sebelumnya saat online</u> pada perangkat ini agar profil dan data proyek telah tersimpan di cache lokal.
                    </div>
                  </div>
                </div>

                {/* Account status check */}
                {cachedUser ? (
                  <div className="space-y-2">
                    <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 p-2 rounded-lg flex items-center gap-1.5 font-medium">
                      <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      <span>Kredensial tersimpan: <strong>{cachedUser.fullName || cachedUser.username}</strong> ({cachedUser.role})</span>
                    </div>
                    <button
                      type="button"
                      id="login-offline-btn"
                      onClick={handleOfflineEnter}
                      className="w-full py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <UserCheck size={15} />
                      <span>Lanjut Mode Offline ({cachedUser.fullName || cachedUser.username})</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-red-50/90 border border-red-200 text-[11px] text-red-800 flex items-start gap-2">
                    <AlertCircle size={15} className="text-red-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Perangkat Belum Pernah Login:</strong> Tidak ada kredensial akun tersimpan pada perangkat ini. Anda <u>belum dapat</u> menggunakan mode offline. Sambungkan internet atau aktifkan server untuk melakukan login pertama kali.
                    </span>
                  </div>
                )}

                {/* Server check trigger */}
                <div className="mt-3 pt-2 border-t border-amber-200/70 flex items-center justify-between">
                  <button
                    type="button"
                    id="recheck-server-btn"
                    onClick={checkServerHealth}
                    disabled={checkingServer}
                    className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <RefreshCw size={11} className={checkingServer ? 'animate-spin' : ''} />
                    <span>{checkingServer ? 'Memeriksa...' : 'Cek Status Server'}</span>
                  </button>
                  <span className="text-[10px] text-amber-700/60 font-semibold">MTERP Offline Sync</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {error && <div className="bg-semantic-danger-bg text-semantic-danger px-4 py-3 rounded-md text-sm font-medium">{error}</div>}
          
          <Input
            label={t('auth.login.usernameLabel')}
            placeholder={t('auth.login.usernamePlaceholder')}
            value={username}
            onChangeText={setUsername}
            type="text"
            icon={User}
          />

          <Input
            label={t('auth.login.passwordLabel')}
            placeholder={t('auth.login.passwordPlaceholder')}
            value={password}
            onChangeText={setPassword}
            type="password"
          />

          <Button
            title={t('auth.login.signIn')}
            onClick={handleLogin}
            variant="primary"
            size="large"
            loading={loading}
            icon={ArrowRight}
            iconPosition="right"
            fullWidth
            style={{ marginTop: 10 }}
          />

          <Button
            title={t('auth.login.noAccount')}
            onClick={() => navigate('/register')}
            variant="outline"
            size="medium"
            fullWidth
            style={{ marginTop: 16, border: 'none', background: 'transparent' }}
          />
        </div>
      </div>
      
      <p className="mt-4 text-text-muted text-xs font-semibold">v1.0.0 Web Build</p>
    </div>
  );
}
