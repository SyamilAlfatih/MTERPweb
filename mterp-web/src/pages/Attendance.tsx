import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, Clock, DollarSign, AlertCircle, Check, LogOut, FileText,
  Building, CalendarOff, MapPin, Timer, Calendar, ChevronRight,
  Shield, TrendingUp, Loader, Users,
} from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import api from '../api/api';
import { Card, Button, Input, Alert, CostInput } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import { PhotoView } from 'react-photo-view';

interface AttendanceRecord {
  _id: string;
  date: string;
  checkIn?: { time: string; photo?: string };
  checkOut?: { time: string; photo?: string };
  wageType: string;
  status: string;
  projectId?: { _id: string; nama: string };
  dailyRate?: number;
  paymentStatus?: string;
}

export default function Attendance() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Core state
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingToday, setFetchingToday] = useState(true);
  const [alertData, setAlertData] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string }>({
    visible: false, type: 'success', title: '', message: '',
  });

  // Live clock
  const [liveTime, setLiveTime] = useState(new Date());

  // Project & Permit
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [permitModal, setPermitModal] = useState(false);
  const [permitReason, setPermitReason] = useState('');
  const [permitPhoto, setPermitPhoto] = useState<File | null>(null);
  const [permitPhotoPreview, setPermitPhotoPreview] = useState<string | null>(null);

  // Kasbon
  const [kasbonOpen, setKasbonOpen] = useState(false);
  const [kasbonAmount, setKasbonAmount] = useState('');
  const [kasbonReason, setKasbonReason] = useState('');

  // Recent history
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const isSupervisor = user?.role && ['owner', 'president_director', 'operational_director', 'director', 'supervisor', 'asset_admin'].includes(user.role);

  // Live clock tick
  useEffect(() => {
    const interval = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchTodayAttendance();
    fetchProjects();
    fetchRecentHistory();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await api.get('/attendance/projects');
      setProjects(response.data);
    } catch (err) {
      console.error('Failed to fetch projects', err);
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchTodayAttendance = async () => {
    try {
      const response = await api.get('/attendance/today');
      setTodayRecord(response.data);
    } catch (err) {
      console.error('Failed to fetch today attendance', err);
    } finally {
      setFetchingToday(false);
    }
  };

  const fetchRecentHistory = async () => {
    try {
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const response = await api.get('/attendance', {
        params: {
          startDate: weekAgo.toISOString().split('T')[0],
          endDate: now.toISOString().split('T')[0],
        },
      });
      setRecentRecords((response.data || []).slice(0, 7));
    } catch (err) {
      console.error('Failed to fetch recent history', err);
    } finally {
      setLoadingRecent(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setPhoto(file); setPhotoPreview(URL.createObjectURL(file)); }
  };

  const handlePermitFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setPermitPhoto(file); setPermitPhotoPreview(URL.createObjectURL(file)); }
  };

  const handleCheckIn = async () => {
    if (!selectedProjectId) {
      setAlertData({ visible: true, type: 'error', title: t('attendance.messages.projectRequiredTitle'), message: t('attendance.messages.projectRequired') });
      return;
    }
    setLoading(true);
    try {
      await api.post('/attendance/checkin', { projectId: selectedProjectId });
      setAlertData({ visible: true, type: 'success', title: t('attendance.messages.checkInSuccessTitle'), message: t('attendance.messages.checkInSuccess', { time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }) });
      await fetchTodayAttendance();
      await fetchRecentHistory();
    } catch (err: any) {
      setAlertData({ visible: true, type: 'error', title: t('attendance.messages.checkInFailedTitle'), message: err.response?.data?.msg || t('attendance.messages.checkInFailedDefault') });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!photo) {
      setAlertData({ visible: true, type: 'error', title: t('attendance.messages.photoRequiredTitle'), message: t('attendance.messages.photoRequired') });
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('photo', photo);
      await api.put('/attendance/checkout', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setAlertData({ visible: true, type: 'success', title: t('attendance.messages.checkOutSuccessTitle'), message: t('attendance.messages.checkOutSuccess', { time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }) });
      setPhoto(null);
      setPhotoPreview(null);
      await fetchTodayAttendance();
      await fetchRecentHistory();
    } catch (err: any) {
      setAlertData({ visible: true, type: 'error', title: t('attendance.messages.checkOutFailedTitle'), message: err.response?.data?.msg || t('attendance.messages.checkOutFailedDefault') });
    } finally {
      setLoading(false);
    }
  };

  const handleKasbonSubmit = async () => {
    if (!kasbonAmount) return;
    
    if (Number(kasbonAmount) > 200000) {
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Kasbon Ditolak',
        message: 'Maksimum limit Kasbon adalah Rp 200.000',
      });
      return;
    }

    try {
      await api.post('/kasbon', { amount: Number(kasbonAmount), reason: kasbonReason, userId: user?._id });
      setAlertData({ visible: true, type: 'success', title: t('attendance.messages.kasbonSuccessTitle'), message: t('attendance.messages.kasbonSuccess') });
      setKasbonOpen(false); setKasbonAmount(''); setKasbonReason('');
    } catch (err: any) { 
      console.error('Kasbon request failed', err); 
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Kasbon Gagal',
        message: err.response?.data?.msg || 'Gagal mengajukan kasbon',
      });
    }
  };

  const handlePermitSubmit = async () => {
    if (!permitReason || !permitPhoto) {
      setAlertData({ visible: true, type: 'error', title: t('attendance.messages.permitMissingInfoTitle'), message: t('attendance.messages.permitMissingInfo') });
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('reason', permitReason);
      formData.append('evidence', permitPhoto);
      await api.post('/attendance/permit', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setAlertData({ visible: true, type: 'success', title: t('attendance.messages.permitSuccessTitle'), message: t('attendance.messages.permitSuccess') });
      setPermitModal(false); setPermitReason(''); setPermitPhoto(null); setPermitPhotoPreview(null);
      await fetchTodayAttendance();
    } catch (err: any) {
      setAlertData({ visible: true, type: 'error', title: t('attendance.messages.permitFailedTitle'), message: err.response?.data?.msg || t('attendance.messages.permitFailedDefault') });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const formatDay = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });

  const hasCheckedIn = todayRecord?.checkIn?.time;
  const hasCheckedOut = todayRecord?.checkOut?.time;
  const isPermit = todayRecord?.status === 'Permit';

  // Working hours
  const now = liveTime;
  const currentHour = now.getHours();
  const isWorkingHours = currentHour >= 8 && currentHour < 16;
  const checkInDisabled = !isWorkingHours && user?.role === 'worker';

  // Duration
  const getDuration = () => {
    if (!todayRecord?.checkIn?.time) return null;
    const start = new Date(todayRecord.checkIn.time);
    const end = todayRecord.checkOut?.time ? new Date(todayRecord.checkOut.time) : liveTime;
    const diff = end.getTime() - start.getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  // Status color map
  const getStatusInfo = (status: string) => {
    const map: Record<string, { color: string; bg: string; label: string }> = {
      Present: { color: '#059669', bg: '#D1FAE5', label: t('attendance.statusRibbon.present') },
      Late: { color: '#D97706', bg: '#FEF3C7', label: t('attendance.statusRibbon.late') },
      Absent: { color: '#DC2626', bg: '#FEE2E2', label: t('attendance.statusRibbon.absent') },
      Permit: { color: '#7C3AED', bg: '#EDE9FE', label: t('attendance.statusRibbon.permit') },
      'Half-day': { color: '#6366F1', bg: '#EEF2FF', label: t('attendance.statusRibbon.halfDay') },
    };
    return map[status] || { color: '#059669', bg: '#D1FAE5', label: t('attendance.statusRibbon.present') };
  };

  return (
    <div className="p-6 max-w-[600px] mx-auto max-lg:p-4 max-sm:p-3">
      <Alert
        visible={alertData.visible}
        type={alertData.type}
        title={alertData.title}
        message={alertData.message}
        onClose={() => setAlertData({ ...alertData, visible: false })}
      />

      {/* Header with live clock */}
      <div className="flex flex-col mb-8 p-6 rounded-2xl bg-bg-white border-2 border-border-light shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-text-muted uppercase tracking-widest">
            {liveTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <div className="flex items-center gap-1">
             <div className={`w-2 h-2 rounded-full ${isWorkingHours ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
             <span className="text-[10px] font-bold text-text-muted uppercase tracking-tight">System Online</span>
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <div className="text-5xl font-extrabold text-text-primary tabular-nums tracking-tighter leading-none">
            {liveTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            <span className="text-2xl opacity-40 ml-1">{liveTime.toLocaleTimeString('id-ID', { second: '2-digit' })}</span>
          </div>
          <div className={`px-3 py-1.5 rounded-lg text-sm font-black uppercase ${isWorkingHours ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {isWorkingHours ? "Working" : "After Hours"}
          </div>
        </div>
      </div>

      {/* Today's Status Timeline */}
      <Card className="mb-5 p-5">
        {fetchingToday ? (
          <div className="flex items-center justify-center gap-2 p-4 text-text-muted text-sm">
            <Loader size={20} className="dashboard-spinner" />
            <span>{t('attendance.loading')}</span>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-0">
              {/* Step 1: Check In */}
              <div className={`flex items-center gap-2 flex-1 ${hasCheckedIn ? 'completed' : isPermit ? 'skipped' : 'pending'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 max-sm:w-7 max-sm:h-7 ${hasCheckedIn ? 'bg-gradient-to-br from-emerald-600 to-emerald-400 text-white shadow-[0_2px_8px_rgba(5,150,105,0.3)]' : isPermit ? 'bg-purple-100 text-purple-600' : 'bg-bg-secondary text-text-muted border-2 border-border'}`}>
                  {hasCheckedIn ? <Check size={14} /> : isPermit ? <CalendarOff size={14} /> : <span>1</span>}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.3px] max-sm:text-[9px]">{t('attendance.steps.checkIn')}</span>
                  <span className={`text-sm font-bold max-sm:text-xs ${hasCheckedIn ? 'text-emerald-600' : 'text-text-primary'}`}>
                    {hasCheckedIn ? formatTime(todayRecord!.checkIn!.time) : isPermit ? t('attendance.steps.permit') : '--:--'}
                  </span>
                </div>
              </div>

              <div className={`flex-none w-6 h-[2px] mx-1 mt-4 rounded-[2px] transition-colors duration-300 max-sm:w-3 ${hasCheckedIn ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-border'}`} />

              {/* Step 2: Working */}
              <div className={`flex items-center gap-2 flex-1 ${(hasCheckedIn && !hasCheckedOut) ? 'active' : hasCheckedOut ? 'completed' : 'pending'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 max-sm:w-7 max-sm:h-7 ${hasCheckedOut ? 'bg-gradient-to-br from-emerald-600 to-emerald-400 text-white shadow-[0_2px_8px_rgba(5,150,105,0.3)]' : (hasCheckedIn && !hasCheckedOut) ? 'bg-gradient-to-br from-primary to-primary-light text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)] animate-[pulse-ring_2s_ease_infinite]' : 'bg-bg-secondary text-text-muted border-2 border-border'}`}>
                  {hasCheckedIn && !hasCheckedOut ? (
                    <Timer size={14} />
                  ) : hasCheckedOut ? (
                    <Check size={14} />
                  ) : (
                    <span>2</span>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.3px] max-sm:text-[9px]">{t('attendance.steps.working')}</span>
                  <span className={`text-sm font-bold max-sm:text-xs ${hasCheckedOut ? 'text-emerald-600' : (hasCheckedIn && !hasCheckedOut) ? 'text-primary' : 'text-text-primary'}`}>
                    {getDuration() || '--'}
                  </span>
                </div>
              </div>

              <div className={`flex-none w-6 h-[2px] mx-1 mt-4 rounded-[2px] transition-colors duration-300 max-sm:w-3 ${hasCheckedOut ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-border'}`} />

              {/* Step 3: Check Out */}
              <div className={`flex items-center gap-2 flex-1 ${hasCheckedOut ? 'completed' : 'pending'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 max-sm:w-7 max-sm:h-7 ${hasCheckedOut ? 'bg-gradient-to-br from-emerald-600 to-emerald-400 text-white shadow-[0_2px_8px_rgba(5,150,105,0.3)]' : 'bg-bg-secondary text-text-muted border-2 border-border'}`}>
                  {hasCheckedOut ? <Check size={14} /> : <span>3</span>}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.3px] max-sm:text-[9px]">{t('attendance.steps.checkOut')}</span>
                  <span className={`text-sm font-bold max-sm:text-xs ${hasCheckedOut ? 'text-emerald-600' : 'text-text-primary'}`}>
                    {hasCheckedOut ? formatTime(todayRecord!.checkOut!.time) : '--:--'}
                  </span>
                </div>
              </div>
            </div>

            {/* Status ribbon */}
            {todayRecord && (
              <div className="flex items-center gap-2 mt-4 px-3 py-2 rounded-md text-xs font-semibold" style={{
                backgroundColor: getStatusInfo(todayRecord.status).bg,
                color: getStatusInfo(todayRecord.status).color,
              }}>
                <Shield size={14} />
                <span>{t('attendance.statusRibbon.status', { status: getStatusInfo(todayRecord.status).label })}</span>
                {todayRecord.projectId && (
                  <>
                    <span className="mx-[2px] opacity-50">•</span>
                    <Building size={12} />
                    <span>{typeof todayRecord.projectId === 'object' ? todayRecord.projectId.nama : ''}</span>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ===== ACTION CARDS ===== */}

      {/* Check In */}
      {!hasCheckedIn && !isPermit && (
        <Card className="mb-4 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-[42px] h-[42px] rounded-md flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-emerald-600 to-emerald-400">
              <MapPin size={20} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 mb-6">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">{t('attendance.actions.selectProject')}</span>
            {loadingProjects ? (
              <div className="p-8 text-center border-2 border-dashed border-border-light rounded-xl text-text-muted">
                <Loader size={24} className="animate-spin mx-auto mb-2" />
                <p className="text-sm font-medium">{t('attendance.actions.loadingProjects') || 'Loading project sites...'}</p>
              </div>
            ) : projects.length > 0 ? (
              <div className="flex flex-col gap-2">
                {projects.map((p) => (
                  <button
                    key={p._id}
                    onClick={() => setSelectedProjectId(p._id)}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                      selectedProjectId === p._id
                        ? 'border-primary bg-primary-bg'
                        : 'border-border-light bg-bg-white hover:border-primary/50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      selectedProjectId === p._id ? 'bg-primary text-white' : 'bg-bg-secondary text-text-muted'
                    }`}>
                      <Building size={20} />
                    </div>
                    <div className="flex-1">
                      <h4 className={`text-base font-bold m-0 ${selectedProjectId === p._id ? 'text-primary' : 'text-text-primary'}`}>
                        {p.nama || p.name}
                      </h4>
                      <p className="text-xs text-text-muted m-0">Project Site</p>
                    </div>
                    {selectedProjectId === p._id && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white">
                        <Check size={14} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-border-light rounded-xl text-text-muted">
                <Building size={24} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">{t('attendance.actions.noProjects') || 'No active projects available'}</p>
                <p className="text-xs mt-1 opacity-70">{t('attendance.actions.contactAdmin') || 'Please contact your supervisor'}</p>
              </div>
            )}
          </div>

          <button
            className={`w-full flex items-center justify-center gap-2 p-4 border-none rounded-lg text-base font-bold cursor-pointer transition-all duration-150 text-white bg-gradient-to-br from-emerald-600 to-emerald-500 shadow-[0_4px_14px_rgba(5,150,105,0.35)] hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_6px_20px_rgba(5,150,105,0.45)] ${checkInDisabled || loading ? 'opacity-50 cursor-not-allowed hover:-translate-y-0 hover:shadow-none' : ''}`}
            onClick={handleCheckIn}
            disabled={loading || checkInDisabled}
          >
            {loading ? (
              <Loader size={22} className="dashboard-spinner" />
            ) : (
              <>
                <Check size={22} />
                <span>{t('attendance.actions.checkInNow')}</span>
              </>
            )}
          </button>

          {checkInDisabled && (
            <p className="flex items-center justify-center gap-1 mt-3 text-xs text-red-600 font-medium">
              <AlertCircle size={14} />
              {t('attendance.actions.checkInWarning')}
            </p>
          )}

          <button className="flex items-center gap-2 w-full mt-3 p-3 border border-dashed border-border rounded-md bg-transparent cursor-pointer text-xs text-text-muted font-medium transition-colors duration-150 hover:border-purple-600 hover:text-purple-600 hover:bg-purple-50" onClick={() => setPermitModal(true)}>
            <CalendarOff size={14} />
            <span className="flex-1 text-left">{t('attendance.actions.requestPermit')}</span>
            <ChevronRight size={14} />
          </button>
        </Card>
      )}

      {/* Check Out */}
      {hasCheckedIn && !hasCheckedOut && (
        <Card className="mb-4 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-[42px] h-[42px] rounded-md flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-amber-500 to-amber-400">
              <LogOut size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary m-0">{t('attendance.actions.readyToLeave')}</h3>
              <p className="text-xs text-text-muted m-0">{t('attendance.actions.uploadSelfie')}</p>
            </div>
          </div>

          <div className="mb-4">
            {photoPreview ? (
              <div className="relative w-[180px] h-[180px] rounded-lg overflow-hidden mx-auto max-sm:w-[150px] max-sm:h-[150px]">
                <PhotoView src={photoPreview}>
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover cursor-pointer" />
                </PhotoView>
                <button className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/70 text-white text-xs font-semibold border-none rounded-sm cursor-pointer" onClick={() => { setPhoto(null); setPhotoPreview(null); }}>
                  {t('attendance.actions.removePhoto')}
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 w-[180px] h-[180px] border-2 border-dashed border-border rounded-lg cursor-pointer transition-colors duration-150 mx-auto max-sm:w-[150px] max-sm:h-[150px] hover:border-primary hover:bg-primary-bg">
                <Upload size={28} color="var(--text-muted)" />
                <span className="text-xs text-text-muted font-medium">{t('attendance.actions.tapToUpload')}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </label>
            )}
          </div>

          <button
            className={`w-full flex items-center justify-center gap-2 p-4 border-none rounded-lg text-base font-bold cursor-pointer transition-all duration-150 text-white bg-gradient-to-br from-red-600 to-red-500 shadow-[0_4px_14px_rgba(220,38,38,0.35)] hover:not(:disabled):-translate-y-[1px] hover:not(:disabled):shadow-[0_6px_20px_rgba(220,38,38,0.45)] ${!photo || loading ? 'opacity-50 cursor-not-allowed hover:-translate-y-0 hover:shadow-none' : ''}`}
            onClick={handleCheckOut}
            disabled={loading || !photo}
          >
            {loading ? (
              <Loader size={22} className="dashboard-spinner" />
            ) : (
              <>
                <LogOut size={22} />
                <span>{t('attendance.actions.checkOutNow')}</span>
              </>
            )}
          </button>
        </Card>
      )}

      {/* ✅ All Done */}
      {hasCheckedIn && hasCheckedOut && (
        <Card className="text-center p-8 mb-4">
          <div className="w-[72px] h-[72px] bg-gradient-to-br from-emerald-600 to-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 text-white shadow-[0_4px_20px_rgba(5,150,105,0.3)]">
            <Check size={36} />
          </div>
          <h3 className="text-lg font-bold text-text-primary m-0 mb-2">{t('attendance.allDone.title')}</h3>
          <p className="text-sm text-text-muted m-0">
            {t('attendance.allDone.desc')} <strong className="text-text-primary">{getDuration()}</strong> {t('attendance.allDone.descDetail', { start: formatTime(todayRecord!.checkIn!.time), end: formatTime(todayRecord!.checkOut!.time) })}
          </p>
        </Card>
      )}

      {/* Permit status */}
      {isPermit && !hasCheckedIn && (
        <Card className="text-center p-8 mb-4">
          <div className="w-[72px] h-[72px] bg-gradient-to-br from-purple-600 to-purple-400 rounded-full flex items-center justify-center mx-auto mb-4 text-white shadow-[0_4px_20px_rgba(124,58,237,0.3)]">
            <CalendarOff size={36} />
          </div>
          <h3 className="text-lg font-bold text-text-primary m-0 mb-2">{t('attendance.permitRequested.title')}</h3>
          <p className="text-sm text-text-muted m-0">{t('attendance.permitRequested.desc')}</p>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="flex flex-col gap-2 mb-6">
        <button className="flex items-center gap-3 p-3 bg-bg-white border border-border rounded-lg cursor-pointer transition-all duration-150 hover:border-primary hover:shadow-sm group" onClick={() => setKasbonOpen(true)}>
          <div className="w-[36px] h-[36px] rounded-md flex items-center justify-center shrink-0 bg-amber-100 group-hover:bg-amber-200 transition-colors">
            <DollarSign size={18} color="#D97706" />
          </div>
          <span className="flex-1 text-left text-sm font-semibold text-text-primary">{t('attendance.quickActions.requestKasbon')}</span>
          <ChevronRight size={16} color="var(--text-muted)" />
        </button>

        {isSupervisor && (
          <>
            <button className="flex items-center gap-3 p-3 bg-bg-white border border-border rounded-lg cursor-pointer transition-all duration-150 hover:border-primary hover:shadow-sm group" onClick={() => navigate('/attendance-logs')}>
              <div className="w-[36px] h-[36px] rounded-md flex items-center justify-center shrink-0 bg-indigo-50 group-hover:bg-indigo-100 transition-colors">
                <FileText size={18} color="#6366F1" />
              </div>
              <span className="flex-1 text-left text-sm font-semibold text-text-primary">{t('attendance.quickActions.attendanceLogs')}</span>
              <ChevronRight size={16} color="var(--text-muted)" />
            </button>

            <button className="flex items-center gap-3 p-3 bg-bg-white border border-border rounded-lg cursor-pointer transition-all duration-150 hover:border-primary hover:shadow-sm group" onClick={() => navigate('/attendance-recap')}>
              <div className="w-[36px] h-[36px] rounded-md flex items-center justify-center shrink-0 bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
                <Users size={18} color="#059669" />
              </div>
              <span className="flex-1 text-left text-sm font-semibold text-text-primary">{t('attendance.quickActions.attendanceRecap')}</span>
              <ChevronRight size={16} color="var(--text-muted)" />
            </button>
          </>
        )}
      </div>

      {/* Recent History */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-bold text-text-primary m-0">{t('attendance.recentHistory.title')}</h3>
          <span className="text-xs text-text-muted">{t('attendance.recentHistory.hint')}</span>
        </div>
        {loadingRecent ? (
          <div className="flex items-center justify-center gap-2 p-6 text-text-muted text-sm">{t('attendance.loading')}</div>
        ) : recentRecords.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-6 text-text-muted text-sm">
            <Calendar size={24} color="var(--text-muted)" />
            <span>{t('attendance.recentHistory.noRecords')}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-[2px] bg-bg-white border border-border rounded-lg overflow-hidden">
            {recentRecords.map((r) => {
              const info = getStatusInfo(r.status);
              return (
                <div key={r._id} className="flex items-center gap-3 p-3 transition-colors duration-150 border-b border-border-light last:border-0 hover:bg-bg-secondary">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: info.color }} />
                  <div className="flex-1 flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-text-primary">{formatDay(r.date)}</span>
                    <span className="text-[11px] text-text-muted tabular-nums">
                      {r.checkIn?.time ? formatTime(r.checkIn.time) : '--:--'}
                      {' → '}
                      {r.checkOut?.time ? formatTime(r.checkOut.time) : '--:--'}
                    </span>
                  </div>
                  <span className="text-[9px] font-bold px-2 py-[2px] rounded-full whitespace-nowrap shrink-0" style={{ backgroundColor: info.bg, color: info.color }}>
                    {info.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== MODALS ===== */}

      {/* Permit Modal */}
      {permitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4 backdrop-blur-[4px]" onClick={() => setPermitModal(false)}>
          <div className="bg-bg-white rounded-xl w-full max-w-[420px] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <CalendarOff size={20} color="#7C3AED" />
              <h3 className="text-lg font-bold text-text-primary m-0">{t('attendance.modals.permit.title')}</h3>
            </div>
            <p className="text-sm text-text-muted m-0 mb-4">{t('attendance.modals.permit.desc')}</p>

            <Input
              label={t('attendance.modals.permit.reasonLabel')}
              placeholder={t('attendance.modals.permit.reasonPlaceholder')}
              value={permitReason}
              onChangeText={setPermitReason}
              multiline
            />

            <div className="mt-3">
              {permitPhotoPreview ? (
                <div className="relative w-[180px] h-[180px] rounded-lg overflow-hidden mx-auto max-sm:w-[150px] max-sm:h-[150px]">
                  <PhotoView src={permitPhotoPreview}>
                    <img src={permitPhotoPreview} alt="Preview" className="w-full h-full object-cover cursor-pointer" />
                  </PhotoView>
                  <button className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/70 text-white text-xs font-semibold border-none rounded-sm cursor-pointer" onClick={() => { setPermitPhoto(null); setPermitPhotoPreview(null); }}>
                    {t('attendance.actions.removePhoto')}
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 w-[180px] h-[180px] border-2 border-dashed border-border rounded-lg cursor-pointer transition-colors duration-150 mx-auto max-sm:w-[150px] max-sm:h-[150px] hover:border-primary hover:bg-primary-bg">
                  <Upload size={28} color="var(--text-muted)" />
                  <span className="text-xs text-text-muted font-medium">{t('attendance.modals.permit.uploadEvidence')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePermitFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>

            <div className="flex gap-3 mt-5 justify-end max-sm:flex-col [&>button]:max-sm:w-full">
              <Button title={t('attendance.modals.common.cancel')} onClick={() => setPermitModal(false)} variant="outline" />
              <Button title={t('attendance.modals.common.submitRequest')} onClick={handlePermitSubmit} loading={loading} />
            </div>
          </div>
        </div>
      )}

      {/* Kasbon Modal */}
      {kasbonOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4 backdrop-blur-[4px]" onClick={() => setKasbonOpen(false)}>
          <div className="bg-bg-white rounded-xl w-full max-w-[420px] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={20} color="#D97706" />
              <h3 className="text-lg font-bold text-text-primary m-0">{t('attendance.modals.kasbon.title')}</h3>
            </div>
            <div className="flex items-center gap-2 p-3 bg-amber-100 rounded-md mb-4 text-xs text-amber-900 font-medium">
              <AlertCircle size={18} color="#D97706" />
              <span>{t('attendance.modals.kasbon.warning')}</span>
            </div>

            <CostInput
              label={t('attendance.modals.kasbon.amountLabel')}
              placeholder={t('attendance.modals.kasbon.amountPlaceholder')}
              value={Number(kasbonAmount) || 0}
              onChange={(v) => setKasbonAmount(v.toString())}
            />

            <Input
              label={t('attendance.modals.kasbon.reasonLabel')}
              placeholder={t('attendance.modals.kasbon.reasonPlaceholder')}
              value={kasbonReason}
              onChangeText={setKasbonReason}
              multiline
            />

             <div className="flex gap-3 mt-5 justify-end max-sm:flex-col [&>button]:max-sm:w-full">
              <Button title={t('attendance.modals.common.cancel')} onClick={() => setKasbonOpen(false)} variant="outline" />
              <Button title={t('attendance.modals.common.submitRequest')} onClick={handleKasbonSubmit} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
