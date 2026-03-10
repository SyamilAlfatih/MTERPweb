import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, User, Clock, Filter,
  ChevronDown, DollarSign, X, Check, Building, Users,
  Wallet, TrendingUp, Loader, FileText, CalendarOff, Eye,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  wageMultiplierTotal: number;
  totalPayment: number;
}

const WAGE_OPTIONS = [
  { label: 'Harian Biasa', value: 'daily', multiplier: 1 },
  { label: 'Lembur 1.5x', value: 'overtime_1.5', multiplier: 1.5 },
  { label: 'Lembur 2x', value: 'overtime_2', multiplier: 2 },
];

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
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);

  // Permit evidence modal
  const [evidenceModal, setEvidenceModal] = useState<{ open: boolean; url: string; worker: string }>({ open: false, url: '', worker: '' });

  const isSupervisor = user?.role && ['owner', 'director', 'supervisor', 'asset_admin'].includes(user.role);

  useEffect(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    setStartDate(weekStart.toISOString().split('T')[0]);
    setEndDate(now.toISOString().split('T')[0]);
    fetchUsers();
  }, []);

  useEffect(() => {
    if (startDate && endDate) fetchRecords();
  }, [startDate, endDate, selectedUser, paymentStatus]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/attendance/users');
      setUsers(response.data);
    } catch (err) { console.error('Failed to fetch users', err); }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params: any = { startDate, endDate };
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
    setNewWageType(record.wageType);
    setNewDailyRate(record.dailyRate || 0);
    setNewOvertimePay(record.overtimePay || 0);
    setWageModal(true);
  };

  const calculateAutoOvertime = (rate: number, type: string) => {
    if (!selectedRecord?.checkIn?.time || !selectedRecord?.checkOut?.time) return 0;
    if (!type.startsWith('overtime')) return 0;
    const start = new Date(selectedRecord.checkIn.time).getTime();
    const end = new Date(selectedRecord.checkOut.time).getTime();
    const durationHours = Math.max(0, (end - start) / (1000 * 60 * 60));
    const hourlyRate = rate / 8;
    const multiplier = type === 'overtime_1.5' ? 1.5 : (type === 'overtime_2' ? 2 : 1);
    return Math.round(durationHours * hourlyRate * multiplier);
  };

  const handleRateChange = (val: number) => {
    setNewDailyRate(val);
    setNewOvertimePay(calculateAutoOvertime(val, newWageType));
  };

  const handleTypeChange = (val: string) => {
    setNewWageType(val);
    setNewOvertimePay(calculateAutoOvertime(newDailyRate, val));
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

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const getWageLabel = (wageType: string) => {
    let baseLabel = wageType;
    if (wageType === 'daily') baseLabel = t('attendanceLogs.wageOptions.daily');
    else if (wageType === 'overtime_1.5') baseLabel = t('attendanceLogs.wageOptions.overtime15');
    else if (wageType === 'overtime_2') baseLabel = t('attendanceLogs.wageOptions.overtime2');
    
    return baseLabel;
  };

  const WAGE_OPTIONS_TRANSLATED = [
    { label: t('attendanceLogs.wageOptions.daily'), value: 'daily', multiplier: 1 },
    { label: t('attendanceLogs.wageOptions.overtime15'), value: 'overtime_1.5', multiplier: 1.5 },
    { label: t('attendanceLogs.wageOptions.overtime2'), value: 'overtime_2', multiplier: 2 },
  ];

  const formatRp = (val: number) => `Rp ${new Intl.NumberFormat('id-ID').format(val)}`;

  // Permit-filtered records
  const permitRecords = records.filter(r => r.status === 'Permit');

  return (
    <div className="p-6 max-w-[900px] mx-auto max-lg:p-4 max-sm:p-3">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 max-sm:flex-wrap">
        <button className="w-9 h-9 border border-border bg-bg-white rounded-md cursor-pointer flex items-center justify-center text-text-primary transition-all duration-150 shrink-0 hover:bg-bg-secondary hover:border-primary hover:text-primary" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div className="w-[42px] h-[42px] rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-400 flex items-center justify-center shadow-[0_4px_12px_rgba(99,102,241,0.3)] shrink-0">
          <Users size={20} color="white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary m-0 max-sm:text-lg">{t('attendanceLogs.title')}</h1>
          <p className="text-xs text-text-muted m-0">{t('attendanceLogs.subtitle')}</p>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-2 mb-4 bg-bg-secondary rounded-lg p-1">
        <button
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 border-none bg-transparent rounded-md text-sm font-semibold text-text-muted cursor-pointer transition-all duration-200 hover:text-text-primary ${viewMode === 'attendance' ? 'bg-bg-white text-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : ''}`}
          onClick={() => setViewMode('attendance')}
        >
          <Users size={16} />
          {t('attendanceLogs.viewMode.attendance')}
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 border-none bg-transparent rounded-md text-sm font-semibold text-text-muted cursor-pointer transition-all duration-200 hover:text-text-primary ${viewMode === 'permits' ? 'bg-bg-white text-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : ''}`}
          onClick={() => setViewMode('permits')}
        >
          <CalendarOff size={16} />
          {t('attendanceLogs.viewMode.permits')}
          {permitRecords.length > 0 && <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-[6px] rounded-full bg-purple-600 text-white text-[10px] font-bold">{permitRecords.length}</span>}
        </button>
      </div>

      {/* Filters */}
      <Card className="mb-5 p-5">
        <div className="mb-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-[0.3px]">{t('attendanceLogs.filters.dateRange')}</label>
            <div className="flex gap-2 max-sm:flex-wrap">
              {(['week', 'month', 'custom'] as const).map(r => (
                <button
                  key={r}
                  className={`px-4 py-2 border border-border bg-bg-white rounded-full text-sm font-semibold text-text-secondary cursor-pointer transition-all duration-150 hover:border-primary hover:text-primary focus:outline-none ${dateRange === r ? '!bg-primary !border-primary !text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]' : ''}`}
                  onClick={() => handleDateRangeChange(r)}
                >
                  {r === 'week' ? t('attendanceLogs.filters.tabs.week') : r === 'month' ? t('attendanceLogs.filters.tabs.month') : t('attendanceLogs.filters.tabs.custom')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {dateRange === 'custom' && (
          <div className="flex gap-4 mb-4 max-sm:flex-col">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-text-muted font-medium">{t('attendanceLogs.filters.customStart')}</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border border-border rounded-md text-sm bg-bg-white" />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-text-muted font-medium">{t('attendanceLogs.filters.customEnd')}</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border border-border rounded-md text-sm bg-bg-white" />
            </div>
          </div>
        )}

        <div className="flex gap-4 max-sm:flex-col">
          {users.length > 0 && (
            <div className="flex-1 flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-[0.3px]">{t('attendanceLogs.filters.worker')}</label>
              <div className="relative flex items-center">
                <User size={14} className="absolute left-3 text-text-muted pointer-events-none z-10" />
                <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="w-full py-2 px-9 border border-border rounded-md text-sm font-medium text-text-primary bg-bg-white appearance-none cursor-pointer transition-colors duration-150 focus:outline-none focus:border-primary">
                  <option value="">{t('attendanceLogs.filters.allWorkers')}</option>
                  {users.map(u => <option key={u._id} value={u._id}>{u.fullName} ({u.role})</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 text-text-muted pointer-events-none" />
              </div>
            </div>
          )}

          {viewMode === 'attendance' && (
            <div className="flex-1 flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-[0.3px]">{t('attendanceLogs.filters.payment')}</label>
              <div className="relative flex items-center">
                <Wallet size={14} className="absolute left-3 text-text-muted pointer-events-none z-10" />
                <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as any)} className="w-full py-2 px-9 border border-border rounded-md text-sm font-medium text-text-primary bg-bg-white appearance-none cursor-pointer transition-colors duration-150 focus:outline-none focus:border-primary">
                  <option value="Unpaid">{t('attendanceLogs.filters.paymentOptions.unpaid')}</option>
                  <option value="Paid">{t('attendanceLogs.filters.paymentOptions.paid')}</option>
                  <option value="All">{t('attendanceLogs.filters.paymentOptions.all')}</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 text-text-muted pointer-events-none" />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Summary - only in attendance mode */}
      {viewMode === 'attendance' && summary && (
        <div className="grid grid-cols-4 gap-3 mb-5 max-lg:grid-cols-2 max-sm:grid-cols-2">
          <Card className="flex flex-col items-center gap-[6px] p-4 text-center transition-transform duration-150 hover:-translate-y-[2px]">
            <Calendar size={16} color="#6366F1" />
            <span className="text-xl font-extrabold text-text-primary leading-[1.1]">{summary.total}</span>
            <span className="text-xs text-text-muted font-medium">{t('attendanceLogs.summary.totalDays')}</span>
          </Card>
          <Card className="flex flex-col items-center gap-[6px] p-4 text-center transition-transform duration-150 hover:-translate-y-[2px]">
            <Check size={16} color="#059669" />
            <span className="text-xl font-extrabold text-text-primary leading-[1.1]">{summary.present}</span>
            <span className="text-xs text-text-muted font-medium">{t('attendanceLogs.summary.present')}</span>
          </Card>
          <Card className="flex flex-col items-center gap-[6px] p-4 text-center transition-transform duration-150 hover:-translate-y-[2px]">
            <Clock size={16} color="#D97706" />
            <span className="text-xl font-extrabold text-text-primary leading-[1.1]">{summary.totalHours.toFixed(1)}h</span>
            <span className="text-xs text-text-muted font-medium">{t('attendanceLogs.summary.totalHours')}</span>
          </Card>
          <Card className="flex flex-col items-center gap-[6px] p-4 text-center transition-transform duration-150 hover:-translate-y-[2px]">
            <DollarSign size={16} color="var(--primary)" />
            <span className="text-xl font-extrabold text-text-primary leading-[1.1] !text-base !text-primary">{formatRp(summary.totalPayment || 0)}</span>
            <span className="text-xs text-text-muted font-medium">{t('attendanceLogs.summary.totalPayment')}</span>
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
            <div className="flex flex-col items-center justify-center p-10 gap-3 text-text-muted text-sm">
              <Loader size={24} className="animate-spin text-primary" />
              <span>{t('attendanceLogs.loading')}</span>
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title={t('attendanceLogs.empty.title')}
              description={t('attendanceLogs.empty.desc')}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {records.map((record) => {
                const statusStyle = STATUS_STYLES[record.status] || STATUS_STYLES.Present;
                const totalPay = (record.dailyRate || 0) + (record.overtimePay || 0);
                return (
                  <Card key={record._id} className="p-4 transition-all duration-150 hover:-translate-y-[1px] hover:shadow-md">
                    {/* Top row: Date + Status + Wage badge */}
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                        <Calendar size={14} />
                        <span>{formatDate(record.date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold px-2 py-[2px] rounded-full whitespace-nowrap" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                          {record.status}
                        </span>
                        <Badge label={getWageLabel(record.wageType)} variant={record.wageType === 'daily' ? 'neutral' : record.wageType === 'overtime_1.5' ? 'warning' : 'danger'} size="small" />
                      </div>
                    </div>

                    {/* Worker info */}
                    <div className="flex items-center gap-3 pb-3 border-b border-border-light mb-3">
                      <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                        {record.userId.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-text-primary whitespace-nowrap overflow-hidden text-ellipsis">{record.userId.fullName}</span>
                        <span className="block text-[10px] text-text-muted capitalize">{record.userId.role}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 max-sm:hidden">
                        <span className="text-sm font-semibold text-text-secondary tabular-nums">{record.checkIn?.time ? formatTime(record.checkIn.time) : '--:--'}</span>
                        <span className="text-[10px] text-text-muted">→</span>
                        <span className="text-sm font-semibold text-text-secondary tabular-nums">{record.checkOut?.time ? formatTime(record.checkOut.time) : '--:--'}</span>
                      </div>
                    </div>

                    {/* Financials row */}
                    <div className="flex items-center gap-4 mb-3 max-sm:flex-wrap max-sm:gap-2">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('attendanceLogs.record.daily')}</span>
                        <span className="text-sm font-semibold text-text-primary">{formatRp(record.dailyRate || 0)}</span>
                      </div>
                      {record.overtimePay > 0 && (
                        <div className="flex flex-col">
                          <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.3px]">{t('attendanceLogs.record.overtime')}</span>
                          <span className="text-sm font-semibold text-text-primary">{formatRp(record.overtimePay)}</span>
                        </div>
                      )}
                      <div className="ml-auto flex items-center gap-2 text-sm font-bold text-primary">
                        <span>{formatRp(totalPay)}</span>
                        <Badge
                          label={record.paymentStatus === 'Paid' ? t('attendanceLogs.filters.paymentOptions.paid') : t('attendanceLogs.filters.paymentOptions.unpaid')}
                          variant={record.paymentStatus === 'Paid' ? 'success' : 'warning'}
                          size="small"
                        />
                      </div>
                    </div>

                    {/* Project + Action */}
                    <div className="flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-2 [&>button]:max-sm:w-full">
                      {record.projectId && (
                        <div className="flex items-center gap-1 text-xs text-text-muted">
                          <Building size={12} />
                          <span>{record.projectId.nama}</span>
                        </div>
                      )}
                      {isSupervisor && (
                        <Button
                          title={t('attendanceLogs.actions.setWage')}
                          icon={DollarSign}
                          onClick={() => openWageModal(record)}
                          variant="outline"
                          size="small"
                        />
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
            <div className="flex flex-col items-center justify-center p-10 gap-3 text-text-muted text-sm">
              <Loader size={24} className="animate-spin text-primary" />
              <span>{t('attendanceLogs.loading')}</span>
            </div>
          ) : permitRecords.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title={t('attendanceLogs.permit.emptyTitle')}
              description={t('attendanceLogs.permit.emptyDesc')}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {permitRecords.map((record) => (
                <Card key={record._id} className="p-4 transition-all duration-150 hover:-translate-y-[1px] hover:shadow-md border-l-[3px] border-l-purple-600">
                  {/* Top row */}
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                      <Calendar size={14} />
                      <span>{formatDate(record.date)}</span>
                    </div>
                    <span
                      className="text-[9px] font-bold px-2 py-[2px] rounded-full whitespace-nowrap"
                      style={{
                        backgroundColor: record.permit?.status === 'Approved' ? '#D1FAE5' : record.permit?.status === 'Rejected' ? '#FEE2E2' : '#FEF3C7',
                        color: record.permit?.status === 'Approved' ? '#059669' : record.permit?.status === 'Rejected' ? '#DC2626' : '#D97706',
                      }}
                    >
                      {record.permit?.status || 'Pending'}
                    </span>
                  </div>

                  {/* Worker */}
                  <div className="flex items-center gap-3 pb-3 border-b border-border-light mb-3">
                    <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ backgroundColor: '#EDE9FE', color: '#7C3AED' }}>
                      {record.userId.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-text-primary whitespace-nowrap overflow-hidden text-ellipsis">{record.userId.fullName}</span>
                      <span className="block text-[10px] text-text-muted capitalize">{record.userId.role}</span>
                    </div>
                  </div>

                  {/* Permit reason */}
                  {record.permit?.reason && (
                    <div className="flex items-start gap-2 p-3 bg-purple-50 rounded-md mt-3 text-sm text-text-secondary leading-[1.5]">
                      <FileText size={14} className="shrink-0 mt-[2px] text-purple-600" />
                      <span>{record.permit.reason}</span>
                    </div>
                  )}

                  {/* Evidence */}
                  {record.permit?.evidence && (
                    <div
                      className="relative mt-3 rounded-md overflow-hidden cursor-pointer max-h-[180px] group"
                      onClick={() => setEvidenceModal({ open: true, url: getImageUrl(record.permit?.evidence), worker: record.userId.fullName })}
                    >
                      <img
                        src={getImageUrl(record.permit?.evidence)}
                        alt="Evidence"
                        className="w-full h-[180px] object-cover block rounded-md transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/35 flex flex-col items-center justify-center gap-1 text-white text-xs font-semibold opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <Eye size={16} />
                        <span>{t('attendanceLogs.permit.viewEvidence')}</span>
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
            <img src={evidenceModal.url} alt="Permit Evidence" className="w-full block max-h-[70vh] object-contain bg-[#f3f3f3]" />
          </div>
        </div>
      )}

      {/* Wage Modal */}
      {wageModal && selectedRecord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4 backdrop-blur-[4px]" onClick={() => setWageModal(false)}>
          <div className="bg-bg-white rounded-xl w-full max-w-[420px] p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={20} color="#F59E0B" />
              <h3 className="text-lg font-bold text-text-primary m-0">{t('attendanceLogs.wageModal.title')}</h3>
            </div>

            <div className="flex items-center gap-2 p-3 bg-bg-secondary rounded-md my-4 text-sm text-text-secondary">
              <User size={14} />
              <span>{selectedRecord.userId.fullName}</span>
              <span className="text-text-muted">•</span>
              <span>{formatDate(selectedRecord.date)}</span>
            </div>

            <div className="flex flex-col gap-2">
              {WAGE_OPTIONS_TRANSLATED.map(opt => (
                <button
                  key={opt.value}
                  className={`flex items-center gap-3 p-3 border border-border bg-bg-white rounded-md cursor-pointer transition-all duration-150 hover:border-primary ${newWageType === opt.value ? 'border-primary bg-primary-bg' : ''}`}
                  onClick={() => handleTypeChange(opt.value)}
                >
                  {newWageType === opt.value && <Check size={16} />}
                  <span className="flex-1 font-medium text-text-primary text-sm text-left">{opt.label}</span>
                  <span className="text-sm text-text-muted font-semibold">{opt.multiplier}x</span>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 20 }}>
              <CostInput
                label={t('attendanceLogs.wageModal.ratePerDay')}
                value={newDailyRate}
                onChange={handleRateChange}
                placeholder={t('attendanceLogs.wageModal.ratePlaceholder')}
              />

              {newWageType.startsWith('overtime') && (
                <div style={{ marginTop: 16 }}>
                  <CostInput
                    label={t('attendanceLogs.wageModal.overtimePay')}
                    value={newOvertimePay}
                    onChange={setNewOvertimePay}
                    placeholder={t('attendanceLogs.wageModal.overtimePlaceholder')}
                  />
                  {selectedRecord.checkIn?.time && selectedRecord.checkOut?.time && (
                    <p className="text-xs text-text-muted mt-1 mb-0">
                      {t('attendanceLogs.wageModal.duration', { hours: ((new Date(selectedRecord.checkOut.time).getTime() - new Date(selectedRecord.checkIn.time).getTime()) / (1000 * 60 * 60)).toFixed(2) })}
                    </p>
                  )}
                </div>
              )}
              <p className="text-xs text-text-muted mt-1 mb-0" style={{ marginTop: 12 }}>
                {t('attendanceLogs.wageModal.helper')}
              </p>
            </div>

            <div className="flex gap-3 mt-5 justify-end max-sm:flex-col [&>button]:max-sm:w-full">
              <Button title={t('attendanceLogs.actions.cancel')} onClick={() => setWageModal(false)} variant="outline" />
              <Button title={t('attendanceLogs.actions.save')} onClick={handleSaveWage} loading={submitting} variant="primary" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
