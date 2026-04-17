import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  User,
  Mail,
  Phone,
  MapPin,
  ChevronRight,
  LogOut,
  Shield,
  Bell,
  HelpCircle,
  Info,
  Wallet,
  CreditCard,
} from 'lucide-react';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Alert } from '../components/shared';
import { useTranslation } from 'react-i18next';
import { getImageUrl } from '../utils/image';

interface SettingsItem {
  id: string;
  icon: React.ElementType;
  label: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
}

export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address || '',
    paymentInfo: {
      bankPlatform: (user as any)?.paymentInfo?.bankPlatform || '',
      bankAccount: (user as any)?.paymentInfo?.bankAccount || '',
      accountName: (user as any)?.paymentInfo?.accountName || '',
    },
  });
  const [saving, setSaving] = useState(false);
  const [alertData, setAlertData] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string }>({
    visible: false,
    type: 'success',
    title: '',
    message: '',
  });

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);

      const response = await api.put('/auth/profile/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      updateUser({ profileImage: response.data.profilePhoto ?? response.data.profileImage });
      setAlertData({
        visible: true,
        type: 'success',
        title: t('profile.messages.photoSuccess'),
        message: t('profile.messages.photoSuccessDesc'),
      });
    } catch (err) {
      console.error('Photo upload failed', err);
      setAlertData({
        visible: true,
        type: 'error',
        title: t('profile.messages.photoError'),
        message: t('profile.messages.photoErrorDesc'),
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoPreview(null);
    if (!user?.profileImage) return;

    try {
      await api.delete('/auth/profile/photo');
      updateUser({ profileImage: undefined });
      setAlertData({
        visible: true,
        type: 'success',
        title: t('profile.messages.photoRemoved'),
        message: t('profile.messages.photoRemovedDesc'),
      });
    } catch (err) {
      console.error('Photo removal failed', err);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const response = await api.put('/auth/profile', {
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        paymentInfo: formData.paymentInfo,
      });
      updateUser(response.data);
      setEditing(false);
      setAlertData({
        visible: true,
        type: 'success',
        title: t('profile.messages.saveSuccess'),
        message: t('profile.messages.saveSuccessDesc'),
      });
    } catch (err) {
      console.error('Profile update failed', err);
      setAlertData({
        visible: true,
        type: 'error',
        title: t('profile.messages.saveError'),
        message: t('profile.messages.saveErrorDesc'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getPhotoUrl = () => {
    return getImageUrl(user?.profileImage);
  };

  const getInitials = () => {
    if (!user?.fullName) return 'U';
    return user.fullName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const settingsItems: SettingsItem[] = [
    { id: 'notifications', icon: Bell, label: t('profile.settings.notifications'), onClick: () => { } },
    { id: 'privacy', icon: Shield, label: t('profile.settings.privacy'), onClick: () => { } },
    { id: 'help', icon: HelpCircle, label: t('profile.settings.help'), onClick: () => { } },
    { id: 'about', icon: Info, label: t('profile.settings.about'), value: 'v1.0.0' },
  ];

  return (
    <div className="p-6 pb-[100px] max-w-[600px] mx-auto max-lg:p-4 max-sm:p-3">
      <Alert
        visible={alertData.visible}
        type={alertData.type}
        title={alertData.title}
        message={alertData.message}
        onClose={() => setAlertData({ ...alertData, visible: false })}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button className="p-2 border-none bg-bg-secondary rounded-md cursor-pointer flex items-center justify-center text-text-primary" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-text-primary m-0 max-sm:text-base">{t('profile.title')}</h1>
        <button
          className="py-2 px-4 border-none bg-transparent text-primary text-base font-semibold cursor-pointer disabled:opacity-50"
          onClick={() => editing ? handleSaveProfile() : setEditing(true)}
          disabled={saving}
        >
          {saving ? t('profile.btnSaving') : editing ? t('profile.btnSave') : t('profile.btnEdit')}
        </button>
      </div>

      {/* Profile Photo Section */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative w-[120px] h-[120px] cursor-pointer max-sm:w-[100px] max-sm:h-[100px]" onClick={handlePhotoClick}>
          {photoPreview || getPhotoUrl() ? (
            <img src={photoPreview || getPhotoUrl()!} alt="Profile" className="w-full h-full rounded-full object-cover" />
          ) : (
            <div className="w-full h-full rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center">
              <span className="text-3xl font-bold text-white max-sm:text-2xl">{getInitials()}</span>
            </div>
          )}
          <div className="absolute bottom-0 right-0 w-9 h-9 bg-bg-white rounded-full flex items-center justify-center shadow-md text-primary">
            <Camera size={24} />
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          style={{ display: 'none' }}
        />
        <button className="mt-3 py-2 px-4 border-none bg-transparent text-primary text-base font-semibold cursor-pointer" onClick={handlePhotoClick}>
          {t('profile.btnChangePhoto')}
        </button>
        {user?.profileImage && (
          <button className="mt-1 py-2 px-4 border-none bg-transparent text-danger text-sm font-medium cursor-pointer" onClick={handleRemovePhoto}>
            {t('profile.btnRemovePhoto')}
          </button>
        )}
      </div>

      {/* User Info Section */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-text-muted tracking-[1px] ml-4 mb-3">{t('profile.sections.personalInfo')}</h2>
        <div className="bg-bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 p-4 border-none bg-transparent w-full text-left transition-colors border-b border-border-light hover:bg-bg-secondary max-sm:p-3">
            <div className="w-9 h-9 rounded-md bg-bg-secondary flex items-center justify-center shrink-0">
              <User size={20} color="var(--primary)" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-base font-medium text-text-primary max-sm:text-base">{t('profile.fields.fullName')}</span>
              {editing ? (
                <input
                  type="text"
                  className="w-full py-2 border-none border-b border-border-medium text-base text-text-primary bg-transparent outline-none focus:border-primary placeholder:text-text-muted"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder={t('profile.fields.fullNamePlaceholder')}
                />
              ) : (
                <span className="text-sm text-text-muted">{user?.fullName || t('profile.fields.notSet')}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 border-none bg-transparent w-full text-left transition-colors border-b border-border-light hover:bg-bg-secondary max-sm:p-3">
            <div className="w-9 h-9 rounded-md bg-bg-secondary flex items-center justify-center shrink-0">
              <Mail size={20} color="var(--success)" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-base font-medium text-text-primary max-sm:text-base">{t('profile.fields.email')}</span>
              {editing ? (
                <input
                  type="email"
                  className="w-full py-2 border-none border-b border-border-medium text-base text-text-primary bg-transparent outline-none focus:border-primary placeholder:text-text-muted"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder={t('profile.fields.emailPlaceholder')}
                />
              ) : (
                <span className="text-sm text-text-muted">{user?.email || t('profile.fields.notSet')}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 border-none bg-transparent w-full text-left transition-colors border-b border-border-light hover:bg-bg-secondary max-sm:p-3">
            <div className="w-9 h-9 rounded-md bg-bg-secondary flex items-center justify-center shrink-0">
              <Phone size={20} color="var(--warning)" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-base font-medium text-text-primary max-sm:text-base">{t('profile.fields.phone')}</span>
              {editing ? (
                <input
                  type="tel"
                  className="w-full py-2 border-none border-b border-border-medium text-base text-text-primary bg-transparent outline-none focus:border-primary placeholder:text-text-muted"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder={t('profile.fields.phonePlaceholder')}
                />
              ) : (
                <span className="text-sm text-text-muted">{user?.phone || t('profile.fields.notSet')}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 border-none bg-transparent w-full text-left transition-colors border-b border-border-light last:border-0 hover:bg-bg-secondary max-sm:p-3">
            <div className="w-9 h-9 rounded-md bg-bg-secondary flex items-center justify-center shrink-0">
              <MapPin size={20} color="var(--danger)" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-base font-medium text-text-primary max-sm:text-base">{t('profile.fields.address')}</span>
              {editing ? (
                <input
                  type="text"
                  className="w-full py-2 border-none border-b border-border-medium text-base text-text-primary bg-transparent outline-none focus:border-primary placeholder:text-text-muted"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder={t('profile.fields.addressPlaceholder')}
                />
              ) : (
                <span className="text-sm text-text-muted">{user?.address || t('profile.fields.notSet')}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Information */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-text-muted tracking-[1px] ml-4 mb-3">{t('profile.sections.paymentInfo')}</h2>
        <div className="bg-bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 p-4 border-none bg-transparent w-full text-left transition-colors border-b border-border-light hover:bg-bg-secondary max-sm:p-3">
            <div className="w-9 h-9 rounded-md bg-bg-secondary flex items-center justify-center shrink-0">
              <Wallet size={20} color="#F59E0B" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-base font-medium text-text-primary max-sm:text-base">{t('profile.fields.paymentPlatform')}</span>
              {editing ? (
                <input
                  type="text"
                  className="w-full py-2 border-none border-b border-border-medium text-base text-text-primary bg-transparent outline-none focus:border-primary placeholder:text-text-muted"
                  value={formData.paymentInfo.bankPlatform}
                  onChange={(e) => setFormData({ ...formData, paymentInfo: { ...formData.paymentInfo, bankPlatform: e.target.value } })}
                  placeholder={t('profile.fields.paymentPlatformPlaceholder')}
                />
              ) : (
                <span className="text-sm text-text-muted">{(user as any)?.paymentInfo?.bankPlatform || t('profile.fields.notSet')}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 border-none bg-transparent w-full text-left transition-colors border-b border-border-light hover:bg-bg-secondary max-sm:p-3">
            <div className="w-9 h-9 rounded-md bg-bg-secondary flex items-center justify-center shrink-0">
              <CreditCard size={20} color="#6366F1" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-base font-medium text-text-primary max-sm:text-base">{t('profile.fields.accountNumber')}</span>
              {editing ? (
                <input
                  type="text"
                  className="w-full py-2 border-none border-b border-border-medium text-base text-text-primary bg-transparent outline-none focus:border-primary placeholder:text-text-muted"
                  value={formData.paymentInfo.bankAccount}
                  onChange={(e) => setFormData({ ...formData, paymentInfo: { ...formData.paymentInfo, bankAccount: e.target.value } })}
                  placeholder={t('profile.fields.accountNumberPlaceholder')}
                />
              ) : (
                <span className="text-sm text-text-muted">{(user as any)?.paymentInfo?.bankAccount || t('profile.fields.notSet')}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 border-none bg-transparent w-full text-left transition-colors border-b border-border-light last:border-0 hover:bg-bg-secondary max-sm:p-3">
            <div className="w-9 h-9 rounded-md bg-bg-secondary flex items-center justify-center shrink-0">
              <User size={20} color="#10B981" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-base font-medium text-text-primary max-sm:text-base">{t('profile.fields.accountName')}</span>
              {editing ? (
                <input
                  type="text"
                  className="w-full py-2 border-none border-b border-border-medium text-base text-text-primary bg-transparent outline-none focus:border-primary placeholder:text-text-muted"
                  value={formData.paymentInfo.accountName}
                  onChange={(e) => setFormData({ ...formData, paymentInfo: { ...formData.paymentInfo, accountName: e.target.value } })}
                  placeholder={t('profile.fields.accountNamePlaceholder')}
                />
              ) : (
                <span className="text-sm text-text-muted">{(user as any)?.paymentInfo?.accountName || t('profile.fields.notSet')}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Role Badge */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-text-muted tracking-[1px] ml-4 mb-3">{t('profile.sections.account')}</h2>
        <div className="bg-bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 p-4 border-none bg-transparent w-full text-left transition-colors border-b border-border-light last:border-0 hover:bg-bg-secondary max-sm:p-3">
            <div className="w-9 h-9 rounded-md bg-bg-secondary flex items-center justify-center shrink-0">
              <Shield size={20} color="var(--primary)" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-base font-medium text-text-primary max-sm:text-base">{t('profile.fields.role')}</span>
              <div>
                <span className="inline-block py-0.5 px-2 bg-primary-bg text-primary rounded-sm font-semibold text-xs">
                  {user?.role?.toUpperCase() || 'WORKER'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Section */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-text-muted tracking-[1px] ml-4 mb-3">{t('profile.sections.settings')}</h2>
        <div className="bg-bg-white rounded-xl overflow-hidden shadow-sm">
          {settingsItems.map((item) => (
            <button
              key={item.id}
              className="flex items-center gap-3 p-4 border-none bg-transparent w-full text-left cursor-pointer transition-colors border-b border-border-light last:border-0 hover:bg-bg-secondary max-sm:p-3"
              onClick={item.onClick}
            >
              <div className="w-9 h-9 rounded-md bg-bg-secondary flex items-center justify-center shrink-0">
                <item.icon size={20} color="var(--text-secondary)" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                <span className="text-base font-medium text-text-primary max-sm:text-base">{item.label}</span>
                {item.value && (
                  <span className="text-sm text-text-muted">{item.value}</span>
                )}
              </div>
              <ChevronRight size={20} color="var(--text-muted)" />
            </button>
          ))}
        </div>
      </div>

      {/* Logout Section */}
      <div className="mb-6">
        <div className="bg-bg-white rounded-xl overflow-hidden shadow-sm">
          <button className="flex items-center gap-3 p-4 border-none bg-transparent w-full text-left cursor-pointer transition-colors border-b border-border-light last:border-0 hover:bg-red-50 max-sm:p-3 group" onClick={handleLogout}>
            <div className="w-9 h-9 rounded-md bg-bg-secondary flex items-center justify-center shrink-0">
              <LogOut size={20} color="var(--danger)" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-base font-medium text-danger max-sm:text-base">{t('profile.settings.signOut')}</span>
            </div>
          </button>
        </div>
      </div>

      {/* App Version */}
      <div className="text-center py-8 px-4 text-text-muted text-sm flex flex-col gap-1">
        <span>mterp. v1.0.0</span>
        <span>© 2026 MTE Construction</span>
      </div>
    </div>
  );
}
