import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HardHat, ArrowRight, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input } from '../components/shared';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  
  const [showLoading, setShowLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      navigate('/home');
    } catch (err: any) {
      setError(err.response?.data?.msg || t('auth.login.networkError'));
    } finally {
      setLoading(false);
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#F8F9FA] to-[#E9ECEF] relative overflow-hidden">
      <div className="absolute -top-[100px] -right-[100px] w-[300px] h-[300px] rounded-full bg-[#312e59]/5"></div>
      
      <div className="p-10 z-10 w-full max-w-[400px] max-sm:px-5 max-sm:py-6">
        <div className="mb-10 max-sm:mb-7">
          <div className="w-20 h-20 rounded-[20px] bg-gradient-to-br from-primary to-primary-light flex items-center justify-center mb-5 -rotate-6 shadow-hypr">
            <HardHat color="white" size={40} />
          </div>
          <h1 className="text-[42px] font-black text-primary tracking-tight m-0 max-sm:text-[32px]">mterp<span className="text-primary-light">.</span></h1>
          <p className="text-lg text-text-muted font-medium m-0 max-sm:text-[15px]">{t('auth.login.subtitle')}</p>
        </div>

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
      
      <p className="absolute bottom-[30px] text-text-muted text-sm font-semibold">v1.0.0 Web Build</p>
    </div>
  );
}
