import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { Input, Button, Chip } from '../components/shared';

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    role: 'worker',
  });
  const [otp, setOtp] = useState('');

  const handleRegister = async () => {
    if (!formData.username || !formData.email || !formData.password) {
      setError(t('auth.register.missingData'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.post('/auth/register', formData);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.msg || t('auth.register.serverError'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    setError('');

    try {
      await api.post('/auth/verify', { email: formData.email, otp });
      alert(t('auth.register.accountActive'));
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.msg || t('auth.register.invalidOtp'));
    } finally {
      setLoading(false);
    }
  };

  // Step 2: OTP Verification
  if (step === 2) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-white">
        <div className="p-10 w-full max-w-[450px] max-sm:px-5 max-sm:py-6">
          <CheckCircle2 size={60} color="var(--primary)" className="block mx-auto mb-5" />
          <h1 className="text-[28px] font-bold text-primary m-0 mb-1 max-sm:text-[24px]">{t('auth.register.verifyEmailTitle')}</h1>
          <p className="text-sm text-text-secondary m-0 mb-[30px]">
            {t('auth.register.verifyEmailSubtitle')} {formData.email}
          </p>

          {error && <div className="bg-semantic-danger-bg text-semantic-danger px-4 py-3 rounded-md text-sm font-medium mb-4">{error}</div>}

          <Input
            placeholder="000000"
            type="text"
            value={otp}
            onChangeText={setOtp}
            maxLength={6}
            style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8 }}
          />

          <Button
            title={t('auth.register.verifyButton')}
            onClick={handleVerify}
            loading={loading}
            variant="primary"
            size="large"
            fullWidth
          />
        </div>
      </div>
    );
  }

  // Step 1: Registration Form
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-white">
      <div className="p-10 w-full max-w-[450px] max-sm:px-5 max-sm:py-6">
        <h1 className="text-[28px] font-bold text-primary m-0 mb-1 max-sm:text-[24px]">{t('auth.register.createAccountTitle')}</h1>
        <p className="text-sm text-text-secondary m-0 mb-[30px]">{t('auth.register.createAccountSubtitle')}</p>

        {error && <div className="bg-semantic-danger-bg text-semantic-danger px-4 py-3 rounded-md text-sm font-medium mb-4">{error}</div>}

        <div className="flex flex-col gap-3">
          <Input
            placeholder={t('auth.register.fullNamePlaceholder')}
            value={formData.fullName}
            onChangeText={(t) => setFormData({ ...formData, fullName: t })}
          />

          <div className="mb-2">
            <label className="block text-xs font-bold text-text-muted mb-2 tracking-[1px]">{t('auth.register.roleLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {['supervisor', 'asset_admin', 'director'].map((r) => (
                <Chip
                  key={r}
                  label={r === 'asset_admin' ? 'Admin Aset' : r.toUpperCase()}
                  onPress={() => setFormData({ ...formData, role: r })}
                  selected={formData.role === r}
                  variant="outline"
                  size="medium"
                />
              ))}
            </div>
          </div>

          <Input
            placeholder={t('auth.register.companyEmailPlaceholder')}
            type="email"
            value={formData.email}
            onChangeText={(t) => setFormData({ ...formData, email: t })}
          />

          <Input
            placeholder={t('auth.register.usernamePlaceholder')}
            value={formData.username}
            onChangeText={(t) => setFormData({ ...formData, username: t })}
          />

          <Input
            placeholder={t('auth.register.passwordPlaceholder')}
            type="password"
            value={formData.password}
            onChangeText={(t) => setFormData({ ...formData, password: t })}
          />

          <Button
            title={t('auth.register.startVerifyButton')}
            onClick={handleRegister}
            loading={loading}
            variant="primary"
            size="large"
            fullWidth
          />

          <Button
            title={t('auth.register.hasAccount')}
            onClick={() => navigate('/')}
            variant="outline"
            size="medium"
            fullWidth
            style={{ marginTop: 16, border: 'none', background: 'transparent' }}
          />
        </div>
      </div>
    </div>
  );
}
