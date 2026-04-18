import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, User, Clock, Filter,
  ChevronDown, DollarSign, X, Check, Building, Users,
  Wallet, Loader, FileText, CalendarOff, Eye, Ban, AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PhotoView } from 'react-photo-view';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, Button, EmptyState, CostInput } from '../components/shared';

interface UserOption {
  _id: string;
  fullName: string;
  role: string;
}

interface AttendanceRecord {
  _id: string;
  userId: { _id: string; fullName: string; role: string };
  date: string;
  checkIn?: { time: string; photo?: string };
  checkOut?: { time: string; photo?: string };
  wageType: string;
  wageMultiplier: number;
  dailyRate: number;
  hourlyRate: number;
  overtimePay: number;
  paymentStatus: 'Unpaid' | 'Paid';
  paidAt?: string;
  projectId?: { _id: string; nama: string };
  status: string;
  permit?: { reason: string; evidence: string; status: string };
  invalidatedBy?: { fullName: string };
  invalidatedAt?: string;
  invalidatedReason?: string;
}

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace('/api', '');

const getImageUrl = (path: string | undefined): string => {
  if (!path) return '';
  // Convert Windows backslashes to forward slashes
  const normalizedPath = path.replace(/\\/g, '/');
  // If absolute path from backend (contains /uploads/), extract from 'uploads'
  const uploadsIndex = normalizedPath.indexOf('uploads/');
  if (uploadsIndex !== -1) {
    return `${API_BASE}/${normalizedPath.substring(uploadsIndex)}`;
  }
  return `${API_BASE}/${normalizedPath}`;
};

interface RecapSummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  totalHours: number;
  totalOvertimeHours: number;
  wageMultiplierTotal: number;
  totalPayment: number;
}


const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
  Present: { color: '#059669', bg: '#D1FAE5' },
  Late: { color: '#D97706', bg: '#FEF3C7' },
  Absent: { color: '#DC2626', bg: '#FEE2E2' },
  Permit: { color: '#7C3AED', bg: '#EDE9FE' },
  'Half-day': { color: '#6366F1', bg: '#EEF2FF' },
};

export default function AttendanceLogs() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<RecapSummary | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

  // View mode
  const [viewMode, setViewMode] = useState<'attendance' | 'permits'>('attendance');

  // Filters
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'custom'>('week');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'All' | 'Unpaid' | 'Paid'>('Unpaid');

  // Wage modal
  const [wageModal, setWageModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [newWageType, setNewWageType] = useState('daily');
  const [newDailyRate, setNewDailyRate] = useState<number>(0);
  const [newOvertimePay, setNewOvertimePay] = useState<number>(0);
  const [newOvertimeHours, setNewOvertimeHours] = useState<number | string>(0);
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);

  // Permit evidence modal
  const [evidenceModal, setEvidenceModal] = useState<{ open: boolean; url: string; worker: string }>({ open: false, url: '', worker: '' });

  // Invalidate modal
  const [invalidateModal, setInvalidateModal] = useState(false);
  const [invalidateRecord, setInvalidateRecord] = useState<AttendanceRecord | null>(null);
  const [invalidateStatus, setInvalidateStatus] = useState<'Absent' | 'Permit'>('Absent');
  const [invalidateReason, setInvalidateReason] = useState('');
  const [invalidating, setInvalidating] = useState(false);

  const isSupervisor = user?.role && ['owner', 'director', 'supervisor', 'asset_admin'].includes(user.role);

  useEffect(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    setStartDate(weekStart.toISOString().split('T')[0]);
    setEndDate(now.toISOString().split('T')[0]);
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/attendance/users');
      setUsers(response.data);
    } catch (err) { console.error('Failed to fetch users', err); }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { startDate, endDate };
      if (selectedUser) params.userId = selectedUser;
      const response = await api.get('/attendance/recap', { params });
      let fetchedRecords = response.data.records;
      if (paymentStatus !== 'All') {
        fetchedRecords = fetchedRecords.filter((r: AttendanceRecord) =>
          (r.paymentStatus || 'Unpaid') === paymentStatus
        );
      }
      setRecords(fetchedRecords);
      setSummary(response.data.summary);
    } catch (err) { console.error('Failed to fetch attendance', err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (startDate && endDate) fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, selectedUser, paymentStatus]);

  const handleDateRangeChange = (range: 'week' | 'month' | 'custom') => {
    setDateRange(range);
    const now = new Date();
    if (range === 'week') {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      setStartDate(weekStart.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else if (range === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(monthStart.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    }
  };

  const openWageModal = (record: AttendanceRecord) => {
    setSelectedRecord(record);
    const hourly = record.dailyRate ? record.dailyRate / 8 : 0;
    const hours = (record.overtimePay && hourly) ? record.overtimePay / hourly : 0;
    setNewOvertimeHours(hours);
    setNewWageType(record.wageType.startsWith('overtime') ? 'overtime' : 'daily');
    setNewDailyRate(record.dailyRate || 0);
    setNewOvertimePay(record.overtimePay || 0);
    setWageModal(true);
  };

  const handleRateChange = (val: number) => {
    setNewDailyRate(val);
    const parsedHrs = parseFloat(newOvertimeHours.toString().replace(',', '.')) || 0;
    setNewOvertimePay(Math.round(parsedHrs * (val / 8)));
  };

  const handleHoursChange = (valStr: string) => {
    setNewOvertimeHours(valStr);
    const parsedHrs = parseFloat(valStr.replace(',', '.')) || 0;
    setNewOvertimePay(Math.round(parsedHrs * (newDailyRate / 8)));
  };

  const handleTypeChange = (val: string) => {
    setNewWageType(val);
    if (val !== 'overtime') {
      setNewOvertimeHours(0);
      setNewOvertimePay(0);
    }
  };

  const handleSaveWage = async () => {
    if (!selectedRecord) return;
    setSubmitting(true);
    try {
      await api.put(`/attendance/${selectedRecord._id}/rate`, {
        wageType: newWageType, dailyRate: newDailyRate, overtimePay: newOvertimePay,
      });
      await fetchRecords();
      setWageModal(false); setSelectedRecord(null);
    } catch (err) { console.error('Failed to update wage', err); alert('Failed to update wage type'); }
    finally { setSubmitting(false); }
  };

  const handleMarkAsPaid = async () => {
    if (records.length === 0) return;
    const unpaidIds = records.filter(r => r.paymentStatus !== 'Paid').map(r => r._id);
    if (unpaidIds.length === 0) { alert(t('attendanceLogs.messages.noUnpaid')); return; }
    if (!window.confirm(t('attendanceLogs.messages.confirmPay', { count: unpaidIds.length, amount: formatRp(summary?.totalPayment || 0) }))) return;
    setPaying(true);
    try {
      await api.post('/attendance/pay', { attendanceIds: unpaidIds });
      await fetchRecords();
    } catch (err) { console.error('Payment failed', err); alert(t('attendanceLogs.messages.payFailed')); }
    finally { setPaying(false); }
  };

  const openInvalidateModal = (record: AttendanceRecord) => {
    setInvalidateRecord(record);
    setInvalidateStatus('Absent');
    setInvalidateReason('');
    setInvalidateModal(true);
  };

  const handleInvalidate = async () => {
    if (!invalidateRecord) return;
    setInvalidating(true);
    try {
      await api.put(`/attendance/${invalidateRecord._id}/invalidate`, {
        newStatus: invalidateStatus,
        reason: invalidateReason || 'Accidental check-in invalidated by supervisor',
      });
      setInvalidateModal(false);
      setInvalidateRecord(null);
      await fetchRecords();
    } catch (err: any) {
      alert(err?.response?.data?.msg || 'Failed to invalidate attendance');
    } finally {
      setInvalidating(false);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });



  const WAGE_OPTIONS_TRANSLATED = [
    { label: t('attendanceLogs.wageOptions.daily'), value: 'daily', multiplier: 1 },
    { label: t('attendanceLogs.wageOptions.overtime'), value: 'overtime', multiplier: '-' },
  ];

  const formatRp = (val: number) => `Rp ${new Intl.NumberFormat('id-ID').format(val)}`;

  // Permit-filtered records
  const permitRecords = records.filter(r => r.status === 'Permit');

  return (
    <div className="p-6 max-w-[900px] mx-auto max-lg:p-4 max-sm:p-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-8">
        <div className="flex items-center gap-3">
          <button 
            className="w-12 h-12 rounded-xl bg-bg-secondary flex items-center justify-center cursor-pointer transition-all border-none text-text-primary hover:bg-border active:scale-95 shrink-0" 
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-text-primary m-0 tracking-tight uppercase">{t('attendanceLogs.title')}</h1>
            <span className="text-xs font-bold text-text-muted uppercase tracking-widest">{t('attendanceLogs.subtitle')}</span>
          </div>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2 mb-6 bg-bg-secondary rounded-xl p-1.5 border-2 border-border-light">
        <button
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border-none rounded-lg text-sm font-black uppercase tracking-wider cursor-pointer transition-all duration-200 ${viewMode === 'attendance' ? 'bg-bg-white text-primary shadow-sm' : 'bg-transparent text-text-muted hover:text-text-primary'}`}
          onClick={() => setViewMode('attendance')}
        >
          <Users size={20} />
          {t('attendanceLogs.viewMode.attendance')}
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border-none rounded-lg text-sm font-black uppercase tracking-wider cursor-pointer transition-all duration-200 ${viewMode === 'permits' ? 'bg-bg-white text-primary shadow-sm' : 'bg-transparent text-text-muted hover:text-text-primary'}`}
          onClick={() => setViewMode('permits')}
        >
          <CalendarOff size={20} />
          {t('attendanceLogs.viewMode.permits')}
          {permitRecords.length > 0 && <span className="inline-flex items-center justify-center min-w-[24px] h-[24px] px-[8px] rounded-full bg-red-500 text-white text-[11px] font-black">{permitRecords.length}</span>}
        </button>
      </div>

      {/* Filters - Section Wrapper */}
      <div className="mb-10 last:mb-0">
        <div className="flex items-center gap-3 mb-4 px-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Filter size={22} strokeWidth={2.5} />
          </div>
          <h3 className="text-xl font-black text-text-primary tracking-tight uppercase m-0 leading-none">{t('attendanceLogs.filters.title', 'Filters')}</h3>
        </div>
        <Card className="!p-5 border-2 border-border-light">
          <div className="mb-5">
            <label className="block text-xs font-bold text-text-muted uppercase mb-3">{t('attendanceLogs.filters.dateRange')}</label>
            <div className="grid grid-cols-3 gap-2">
              {(['week', 'month', 'custom'] as const).map(r => (
                <button
                  key={r}
                  className={`py-3 rounded-xl text-xs font-black uppercase transition-all border-2 ${dateRange === r ? 'bg-primary border-primary text-white shadow-md' : 'bg-bg-white border-border-light text-text-secondary hover:border-primary/50'}`}
                  onClick={() => handleDateRangeChange(r)}
                >
                  {r === 'week' ? t('attendanceLogs.filters.tabs.week') : r === 'month' ? t('attendanceLogs.filters.tabs.month') : t('attendanceLogs.filters.tabs.custom')}
                </button>
              ))}
            </div>
          </div>

          {dateRange === 'custom' && (
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">{t('attendanceLogs.filters.customStart')}</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-3 border-2 border-border-light rounded-xl font-bold focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">{t('attendanceLogs.filters.customEnd')}</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-3 border-2 border-border-light rounded-xl font-bold focus:border-primary outline-none" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {users.length > 0 && (
              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">{t('attendanceLogs.filters.worker')}</label>
                <div className="relative">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="w-full py-4 pr-10 pl-11 border-2 border-border-light rounded-xl bg-bg-white text-text-primary text-sm font-bold cursor-pointer appearance-none transition-all outline-none focus:border-primary shadow-sm">
                    <option value="">{t('attendanceLogs.filters.allWorkers')}</option>
                    {users.map(u => <option key={u._id} value={u._id}>{u.fullName}</option>)}
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
            )}

            {viewMode === 'attendance' && (
              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">{t('attendanceLogs.filters.payment')}</label>
                <div className="relative">
                  <Wallet size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as 'All' | 'Unpaid' | 'Paid')} className="w-full py-4 pr-10 pl-11 border-2 border-border-light rounded-xl bg-bg-white text-text-primary text-sm font-bold cursor-pointer appearance-none transition-all outline-none focus:border-primary shadow-sm">
                    <option value="Unpaid">{t('attendanceLogs.filters.paymentOptions.unpaid')}</option>
                    <option value="Paid">{t('attendanceLogs.filters.paymentOptions.paid')}</option>
                    <option value="All">{t('attendanceLogs.filters.paymentOptions.all')}</option>
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Summary - only in attendance mode */}
      {viewMode === 'attendance' && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Card className="!p-4 border-2 border-border-light text-center flex flex-col justify-center items-center">
            <span className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2">
              <Calendar size={20} />
            </span>
            <span className="text-2xl font-black text-text-primary">{summary.total}</span>
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{t('attendanceLogs.summary.totalDays')}</span>
          </Card>

          <Card className="!p-4 border-2 border-border-light text-center flex flex-col justify-center items-center">
            <span className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 mb-2">
              <Check size={20} />
            </span>
            <span className="text-2xl font-black text-text-primary">{summary.present}</span>
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{t('attendanceLogs.summary.present')}</span>
          </Card>

          <Card className="!p-4 border-2 border-border-light text-center flex flex-col justify-center items-center">
             <span className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 mb-2">
               <Clock size={20} />
             </span>
             <span className="text-2xl font-black text-text-primary">{summary.totalHours.toFixed(1)}h</span>
             <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{t('attendanceLogs.summary.totalHours')}</span>
          </Card>

          <Card className="!p-4 border-2 border-border-light text-center flex flex-col justify-center items-center">
             <span className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-2">
               <Clock size={20} />
             </span>
             <span className="text-2xl font-black text-amber-600">{(summary.totalOvertimeHours || 0).toFixed(1)}h</span>
             <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Overtime Hours</span>
          </Card>

          <Card className="!p-4 border-2 border-border-light text-center flex flex-col justify-center items-center col-span-2 md:col-span-4">
             <span className="w-10 h-10 rounded-full bg-primary-bg flex items-center justify-center text-primary mb-2">
               <DollarSign size={20} />
             </span>
             <span className="text-lg font-black text-primary">{formatRp(summary.totalPayment || 0)}</span>
             <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{t('attendanceLogs.summary.totalPayment')}</span>
          </Card>
        </div>
      )}

      {/* Pay All button - only in attendance mode */}
      {viewMode === 'attendance' && isSupervisor && paymentStatus === 'Unpaid' && (summary?.totalPayment || 0) > 0 && (
        <div className="mb-5">
          <Button
            title={t('attendanceLogs.actions.markAllPaid', { amount: formatRp(summary?.totalPayment || 0) })}
            icon={Check}
            onClick={handleMarkAsPaid}
            loading={paying}
            variant="primary"
            fullWidth
          />
        </div>
      )}

      {/* ===== ATTENDANCE VIEW ===== */}
      {viewMode === 'attendance' && (
        <>
          {loading ? (
            <div className="py-12 text-center text-text-muted">
              <Loader size={32} className="animate-spin mx-auto mb-4 text-primary" />
              <p className="font-bold uppercase tracking-wider">{t('attendanceLogs.loading')}</p>
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title={t('attendanceLogs.empty.title')}
              description={t('attendanceLogs.empty.desc')}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {records.map((record) => {
                const statusStyle = STATUS_STYLES[record.status] || STATUS_STYLES.Present;
                const totalPay = (record.dailyRate || 0) + (record.overtimePay || 0);
                return (
                  <Card key={record._id} className="!p-5 border-2 border-border-light hover:border-primary transition-all">
                    {/* Top row: Worker & Status Base */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                         <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg shrink-0" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                          {record.userId.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-base font-black text-text-primary tracking-tight m-0">{record.userId.fullName}</h4>
                          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{record.userId.role}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge label={record.status} variant={record.status === 'Present' ? 'success' : record.status === 'Absent' ? 'danger' : 'warning'} className="mb-1" />
                        <span className="block text-[10px] font-bold text-text-muted uppercase">{formatDate(record.date)}</span>
                      </div>
                    </div>

                    {/* Time Log */}
                    <div className="flex items-center gap-2 bg-bg-secondary p-3 rounded-xl mb-4 border-2 border-transparent">
                      <Clock size={16} className="text-text-muted" />
                      <span className="text-sm font-black text-text-primary tabular-nums">{record.checkIn?.time ? formatTime(record.checkIn.time) : '--:--'}</span>
                      <span className="text-sm text-text-muted px-2">→</span>
                      <span className="text-sm font-black text-text-primary tabular-nums">{record.checkOut?.time ? formatTime(record.checkOut.time) : '--:--'}</span>
                    </div>

                    {/* Wage Display Panel */}
                    <div className="bg-primary-bg rounded-xl border-2 border-primary/20 p-4 mb-4 grid grid-cols-2 gap-4">
                       <div>
                          <span className="block text-[10px] font-bold text-primary uppercase mb-1">{t('attendanceLogs.record.daily')}</span>
                          <span className="text-sm font-black text-primary">{formatRp(record.dailyRate || 0)}</span>
                       </div>
                       {record.overtimePay > 0 && (
                          <div>
                            <span className="block text-[10px] font-bold text-primary uppercase mb-1">{t('attendanceLogs.record.overtime')}</span>
                            <span className="text-sm font-black text-primary">{formatRp(record.overtimePay)}</span>
                          </div>
                       )}
                       <div className="col-span-2 pt-3 border-t-2 border-primary/10 flex justify-between items-center">
                          <span className="text-xs font-bold text-primary uppercase">Total Pay</span>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-black text-primary">{formatRp(totalPay)}</span>
                            <Badge
                              label={record.paymentStatus === 'Paid' ? 'PAID' : 'UNPAID'}
                              variant={record.paymentStatus === 'Paid' ? 'success' : 'warning'}
                              size="small"
                            />
                          </div>
                       </div>
                    </div>

                    {/* Action Footer */}
                    <div className="flex items-center justify-between mt-2 pt-2">
                       {record.projectId ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-text-muted">
                            <Building size={14} />
                            <span>{record.projectId.nama}</span>
                          </div>
                       ) : <div/>}

                       {isSupervisor && (
                         <div className="flex items-center gap-2">
                           {/* Invalidate button — only for Present/Late with a check-in */}
                           {record.checkIn?.time && ['Present', 'Late'].includes(record.status) && (
                             <button
                               className="flex items-center gap-1.5 h-10 px-3 border-2 border-red-200 bg-red-50 text-red-600 rounded-xl text-xs font-black uppercase tracking-wide hover:bg-red-100 hover:border-red-400 transition-all cursor-pointer active:scale-95"
                               onClick={() => openInvalidateModal(record)}
                               title="Invalidate accidental check-in"
                             >
                               <Ban size={14} />
                               Invalidate
                             </button>
                           )}
                           <Button
                             title="Edit Wage"
                             icon={DollarSign}
                             onClick={() => openWageModal(record)}
                             variant="outline"
                             className="!h-10 text-xs px-3 py-1"
                           />
                         </div>
                       )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ===== PERMITS VIEW ===== */}
      {viewMode === 'permits' && (
        <>
          {loading ? (
             <div className="py-12 text-center text-text-muted">
               <Loader size={32} className="animate-spin mx-auto mb-4 text-primary" />
               <p className="font-bold uppercase tracking-wider">{t('attendanceLogs.loading')}</p>
             </div>
          ) : permitRecords.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title={t('attendanceLogs.permit.emptyTitle')}
              description={t('attendanceLogs.permit.emptyDesc')}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {permitRecords.map((record) => (
                <Card key={record._id} className="!p-5 border-2 border-border-light hover:border-primary transition-all relative overflow-hidden">
                   {/* Left Accent Bar */}
                   <div className="absolute left-0 top-0 bottom-0 w-2 bg-purple-500 rounded-l-xl" />
                   
                  {/* Top row */}
                  <div className="flex justify-between items-start mb-4 pl-3">
                    <div className="flex items-center gap-3">
                       <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg shrink-0 bg-purple-100 text-purple-600">
                        {record.userId.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-base font-black text-text-primary tracking-tight m-0">{record.userId.fullName}</h4>
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{record.userId.role}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className="inline-block text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider mb-1"
                        style={{
                          backgroundColor: record.permit?.status === 'Approved' ? '#D1FAE5' : record.permit?.status === 'Rejected' ? '#FEE2E2' : '#FEF3C7',
                          color: record.permit?.status === 'Approved' ? '#059669' : record.permit?.status === 'Rejected' ? '#DC2626' : '#D97706',
                        }}
                      >
                        {record.permit?.status || 'Pending'}
                      </span>
                      <span className="block text-[10px] font-bold text-text-muted uppercase">
                         {formatDate(record.date)}
                      </span>
                    </div>
                  </div>

                  {/* Permit reason */}
                  {record.permit?.reason && (
                    <div className="ml-3 p-4 bg-purple-50 rounded-xl mb-4 border-2 border-purple-100/50">
                      <div className="flex items-center gap-2 mb-2">
                         <FileText size={16} className="text-purple-600" />
                         <span className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">Reason</span>
                      </div>
                      <p className="text-sm font-semibold text-text-secondary m-0">{record.permit.reason}</p>
                    </div>
                  )}

                  {/* Evidence */}
                  {record.permit?.evidence && (
                    <div
                      className="ml-3 relative bg-bg-secondary rounded-xl overflow-hidden cursor-pointer aspect-video group border-2 border-border-light hover:border-primary transition-all"
                      onClick={() => setEvidenceModal({ open: true, url: getImageUrl(record.permit?.evidence), worker: record.userId.fullName })}
                    >
                      <img
                        src={getImageUrl(record.permit?.evidence)}
                        alt="Evidence"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2 text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm">
                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                           <Eye size={24} />
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest">{t('attendanceLogs.permit.viewEvidence')}</span>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Evidence Photo Modal */}
      {evidenceModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4 backdrop-blur-[4px]" onClick={() => setEvidenceModal({ open: false, url: '', worker: '' })}>
          <div className="bg-bg-white rounded-2xl max-w-[500px] w-full shadow-[0_20px_60px_rgba(0,0,0,0.2)] overflow-hidden animate-[evidence-modal-in_0.25s_ease-out]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between py-4 px-5 border-b border-border-light">
              <h3 className="text-base font-bold text-text-primary m-0">{t('attendanceLogs.permit.evidenceTitle', { name: evidenceModal.worker })}</h3>
              <button className="border-none bg-transparent cursor-pointer text-text-muted p-1 rounded-sm transition-colors duration-200 hover:text-text-primary" onClick={() => setEvidenceModal({ open: false, url: '', worker: '' })}>
                <X size={20} />
              </button>
            </div>
            <PhotoView src={evidenceModal.url}>
              <img src={evidenceModal.url} alt="Permit Evidence" className="w-full block max-h-[70vh] object-contain bg-[#f3f3f3] cursor-pointer" />
            </PhotoView>
          </div>
        </div>
      )}

      {/* ===== INVALIDATE MODAL ===== */}
      {invalidateModal && invalidateRecord && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1050] p-4 sm:p-0 animate-in fade-in duration-200" onClick={() => setInvalidateModal(false)}>
          <div className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[460px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 sm:zoom-in-95" onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div className="p-6 border-b-2 border-red-100 bg-red-50 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} className="text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-red-700 m-0 uppercase tracking-tight">Invalidate Check-in</h3>
                <p className="text-xs font-semibold text-red-500 m-0">Accidental / ghost check-in correction</p>
              </div>
              <button className="w-8 h-8 rounded-full bg-red-100 border-none flex items-center justify-center text-red-500 hover:bg-red-200 transition-colors cursor-pointer" onClick={() => setInvalidateModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-5">
              {/* Worker context */}
              <div className="flex items-center gap-3 p-4 bg-bg-secondary rounded-2xl border-2 border-border-light">
                <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-black text-lg shrink-0">
                  {invalidateRecord.userId.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <span className="block font-black text-text-primary">{invalidateRecord.userId.fullName}</span>
                  <span className="text-xs font-bold text-text-muted uppercase">{invalidateRecord.userId.role} · {formatDate(invalidateRecord.date)}</span>
                </div>
                <div className="text-right">
                  <span className="block text-xs font-bold text-text-muted">Checked in at</span>
                  <span className="text-sm font-black text-text-primary">{invalidateRecord.checkIn?.time ? formatTime(invalidateRecord.checkIn.time) : '--:--'}</span>
                </div>
              </div>

              {/* New Status Selection */}
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-3">Mark as</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 font-black text-sm uppercase cursor-pointer transition-all active:scale-95 ${
                      invalidateStatus === 'Absent'
                        ? 'border-red-500 bg-red-50 text-red-600 shadow-md shadow-red-100'
                        : 'border-border-light bg-bg-white text-text-muted hover:border-red-300'
                    }`}
                    onClick={() => setInvalidateStatus('Absent')}
                  >
                    <Ban size={22} />
                    Absent
                  </button>
                  <button
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 font-black text-sm uppercase cursor-pointer transition-all active:scale-95 ${
                      invalidateStatus === 'Permit'
                        ? 'border-purple-500 bg-purple-50 text-purple-600 shadow-md shadow-purple-100'
                        : 'border-border-light bg-bg-white text-text-muted hover:border-purple-300'
                    }`}
                    onClick={() => setInvalidateStatus('Permit')}
                  >
                    <CalendarOff size={22} />
                    Permit
                  </button>
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-2">Reason / Note</label>
                <textarea
                  className="w-full p-4 border-2 border-border-light rounded-2xl text-sm font-semibold text-text-primary bg-bg-white outline-none transition-all focus:border-red-400 resize-none placeholder:text-text-muted"
                  rows={3}
                  value={invalidateReason}
                  onChange={e => setInvalidateReason(e.target.value)}
                  placeholder="e.g. Worker was not physically present at site despite check-in..."
                />
              </div>

              {/* Warning note */}
              <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border-2 border-amber-200 rounded-xl">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-amber-700 m-0 leading-relaxed">
                  This will <strong>clear the check-in and check-out records</strong> for this worker on {formatDate(invalidateRecord.date)} and mark them as <strong>{invalidateStatus}</strong>. This action is logged.
                </p>
              </div>
            </div>

            {/* Action footer */}
            <div className="p-4 sm:p-6 border-t-2 border-border-light bg-bg-white flex gap-3">
              <button
                className="flex-1 py-4 border-2 border-border-light bg-bg-secondary rounded-2xl text-sm font-black text-text-secondary uppercase tracking-wide cursor-pointer hover:bg-border-light transition-colors"
                onClick={() => setInvalidateModal(false)}
              >
                Cancel
              </button>
              <button
                className={`flex-[2] flex items-center justify-center gap-2 py-4 border-none rounded-2xl text-sm font-black text-white uppercase tracking-wide cursor-pointer transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${
                  invalidateStatus === 'Absent'
                    ? 'bg-gradient-to-r from-red-600 to-red-500 shadow-lg shadow-red-200'
                    : 'bg-gradient-to-r from-purple-600 to-purple-500 shadow-lg shadow-purple-200'
                }`}
                onClick={handleInvalidate}
                disabled={invalidating}
              >
                {invalidating ? (
                  <><Loader size={16} className="animate-spin" /> Processing...</>
                ) : (
                  <><Ban size={16} /> Invalidate as {invalidateStatus}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wage Modal */}
      {wageModal && selectedRecord && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" onClick={() => setWageModal(false)}>
          <div className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[480px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-2" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="p-6 border-b-2 border-border-light bg-bg-secondary flex justify-between items-center sticky top-0">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                   <DollarSign size={20} strokeWidth={2.5} />
                 </div>
                 <h3 className="text-xl font-black text-text-primary m-0 tracking-tight uppercase">{t('attendanceLogs.wageModal.title')}</h3>
               </div>
               <button className="w-8 h-8 rounded-full bg-border border-none flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-border-light transition-colors cursor-pointer active:scale-95" onClick={() => setWageModal(false)}>
                 <X size={18} />
               </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto">
               {/* Context Banner */}
               <div className="flex items-center gap-4 p-4 bg-primary-bg rounded-xl mb-6 border-2 border-primary/20">
                  <div className="flex-1">
                    <span className="block text-[10px] font-bold text-primary uppercase mb-1">{selectedRecord.userId.role}</span>
                    <span className="text-base font-black text-primary">{selectedRecord.userId.fullName}</span>
                  </div>
                  <div className="text-right border-l-2 border-primary/20 pl-4">
                     <span className="block text-[10px] font-bold text-primary uppercase mb-1">Date</span>
                     <span className="text-sm font-black text-primary">{formatDate(selectedRecord.date)}</span>
                  </div>
               </div>

               {/* Wage Type Selection */}
               <div className="mb-6">
                 <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3">Select Rate Type</label>
                 <div className="grid grid-cols-1 gap-2">
                   {WAGE_OPTIONS_TRANSLATED.map(opt => (
                     <button
                       key={opt.value}
                       className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all duration-150 active:scale-[0.98] ${newWageType === opt.value ? 'border-primary bg-primary text-white shadow-md' : 'border-border-light bg-bg-white text-text-secondary hover:border-primary/50'}`}
                       onClick={() => handleTypeChange(opt.value)}
                     >
                       <span className="flex-1 font-black text-sm text-left uppercase">{opt.label}</span>
                       <span className={`text-xs font-bold px-2 py-1 rounded-lg ${newWageType === opt.value ? 'bg-white/20 text-white' : 'bg-bg-secondary text-text-muted'}`}>
                          {opt.multiplier}x
                       </span>
                     </button>
                   ))}
                 </div>
               </div>

               {/* Rate Inputs */}
               <div className="space-y-4">
                 <div>
                    <CostInput
                      label={t('attendanceLogs.wageModal.ratePerDay')}
                      value={newDailyRate}
                      onChange={handleRateChange}
                      placeholder={t('attendanceLogs.wageModal.ratePlaceholder')}
                    />
                 </div>

                 {newWageType === 'overtime' && (
                   <div className="p-4 bg-orange-50 rounded-xl border-2 border-orange-100">
                     <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">Total Overtime Hours</label>
                     <input 
                        type="text" 
                        value={newOvertimeHours} 
                        onChange={(e) => handleHoursChange(e.target.value)}
                        placeholder="0.5"
                        className="w-full p-3 border-2 border-border-light rounded-xl font-bold focus:border-primary outline-none mb-3"
                     />
                     <div className="flex items-center justify-between text-orange-600 bg-orange-100/50 p-2 rounded-lg">
                        <span className="text-xs font-bold uppercase">Total Overtime Pay</span>
                        <span className="text-sm font-black">{formatRp(newOvertimePay)}</span>
                     </div>
                   </div>
                 )}
                 
                 <p className="text-[10px] font-bold text-text-muted uppercase text-center mt-4">
                   {t('attendanceLogs.wageModal.helper')}
                 </p>
               </div>
            </div>

            {/* Action Footer */}
            <div className="p-4 sm:p-6 border-t-2 border-border-light bg-bg-white">
              <Button 
                 title={t('attendanceLogs.actions.save')} 
                 onClick={handleSaveWage} 
                 loading={submitting} 
                 variant="primary" 
                 fullWidth 
                 className="!h-14 !text-lg !font-black uppercase tracking-widest shadow-lg shadow-primary/20 target-touch"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
