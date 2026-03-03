import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, User, Clock, Filter,
  ChevronDown, DollarSign, X, Check, Building, Users,
  Wallet, TrendingUp, Loader,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, Button, EmptyState, CostInput } from '../components/shared';
import './AttendanceLogs.css';

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
}

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

  return (
    <div className="logs-container">
      {/* Header */}
      <div className="logs-header">
        <button className="logs-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div className="logs-header-icon">
          <Users size={20} color="white" />
        </div>
        <div>
          <h1 className="logs-title">{t('attendanceLogs.title')}</h1>
          <p className="logs-subtitle">{t('attendanceLogs.subtitle')}</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="logs-filters-card">
        <div className="logs-filter-row">
          <div className="logs-filter-group">
            <label className="logs-filter-label">{t('attendanceLogs.filters.dateRange')}</label>
            <div className="logs-tabs">
              {(['week', 'month', 'custom'] as const).map(r => (
                <button
                  key={r}
                  className={`logs-tab ${dateRange === r ? 'active' : ''}`}
                  onClick={() => handleDateRangeChange(r)}
                >
                  {r === 'week' ? t('attendanceLogs.filters.tabs.week') : r === 'month' ? t('attendanceLogs.filters.tabs.month') : t('attendanceLogs.filters.tabs.custom')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {dateRange === 'custom' && (
          <div className="logs-custom-dates">
            <div className="logs-date-field">
              <label>{t('attendanceLogs.filters.customStart')}</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="logs-date-input" />
            </div>
            <div className="logs-date-field">
              <label>{t('attendanceLogs.filters.customEnd')}</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="logs-date-input" />
            </div>
          </div>
        )}

        <div className="logs-selects-row">
          {users.length > 0 && (
            <div className="logs-select-group">
              <label className="logs-filter-label">{t('attendanceLogs.filters.worker')}</label>
              <div className="logs-select-wrapper">
                <User size={14} className="logs-select-pre" />
                <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="logs-select">
                  <option value="">{t('attendanceLogs.filters.allWorkers')}</option>
                  {users.map(u => <option key={u._id} value={u._id}>{u.fullName} ({u.role})</option>)}
                </select>
                <ChevronDown size={14} className="logs-select-icon" />
              </div>
            </div>
          )}

          <div className="logs-select-group">
            <label className="logs-filter-label">{t('attendanceLogs.filters.payment')}</label>
            <div className="logs-select-wrapper">
              <Wallet size={14} className="logs-select-pre" />
              <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as any)} className="logs-select">
                <option value="Unpaid">{t('attendanceLogs.filters.paymentOptions.unpaid')}</option>
                <option value="Paid">{t('attendanceLogs.filters.paymentOptions.paid')}</option>
                <option value="All">{t('attendanceLogs.filters.paymentOptions.all')}</option>
              </select>
              <ChevronDown size={14} className="logs-select-icon" />
            </div>
          </div>
        </div>
      </Card>

      {/* Summary */}
      {summary && (
        <div className="logs-summary-grid">
          <Card className="logs-summary-item">
            <Calendar size={16} color="#6366F1" />
            <span className="logs-sum-val">{summary.total}</span>
            <span className="logs-sum-label">{t('attendanceLogs.summary.totalDays')}</span>
          </Card>
          <Card className="logs-summary-item logs-sum-green">
            <Check size={16} color="#059669" />
            <span className="logs-sum-val">{summary.present}</span>
            <span className="logs-sum-label">{t('attendanceLogs.summary.present')}</span>
          </Card>
          <Card className="logs-summary-item logs-sum-amber">
            <Clock size={16} color="#D97706" />
            <span className="logs-sum-val">{summary.totalHours.toFixed(1)}h</span>
            <span className="logs-sum-label">{t('attendanceLogs.summary.totalHours')}</span>
          </Card>
          <Card className="logs-summary-item logs-sum-primary">
            <DollarSign size={16} color="var(--primary)" />
            <span className="logs-sum-val logs-sum-highlight">{formatRp(summary.totalPayment || 0)}</span>
            <span className="logs-sum-label">{t('attendanceLogs.summary.totalPayment')}</span>
          </Card>
        </div>
      )}

      {/* Pay All button */}
      {isSupervisor && paymentStatus === 'Unpaid' && (summary?.totalPayment || 0) > 0 && (
        <div className="logs-pay-row">
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

      {/* Records */}
      {loading ? (
        <div className="logs-loading">
          <Loader size={24} className="dashboard-spinner" />
          <span>{t('attendanceLogs.loading')}</span>
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={t('attendanceLogs.empty.title')}
          description={t('attendanceLogs.empty.desc')}
        />
      ) : (
        <div className="logs-records">
          {records.map((record) => {
            const statusStyle = STATUS_STYLES[record.status] || STATUS_STYLES.Present;
            const totalPay = (record.dailyRate || 0) + (record.overtimePay || 0);
            return (
              <Card key={record._id} className="logs-record">
                {/* Top row: Date + Status + Wage badge */}
                <div className="logs-rec-top">
                  <div className="logs-rec-date">
                    <Calendar size={14} />
                    <span>{formatDate(record.date)}</span>
                  </div>
                  <div className="logs-rec-badges">
                    <span className="logs-rec-status" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                      {record.status}
                    </span>
                    <Badge label={getWageLabel(record.wageType)} variant={record.wageType === 'daily' ? 'neutral' : record.wageType === 'overtime_1.5' ? 'warning' : 'danger'} size="small" />
                  </div>
                </div>

                {/* Worker info */}
                <div className="logs-rec-worker">
                  <div className="logs-rec-avatar" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                    {record.userId.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="logs-rec-worker-info">
                    <span className="logs-rec-name">{record.userId.fullName}</span>
                    <span className="logs-rec-role">{record.userId.role}</span>
                  </div>
                  <div className="logs-rec-times">
                    <span className="logs-rec-time">{record.checkIn?.time ? formatTime(record.checkIn.time) : '--:--'}</span>
                    <span className="logs-rec-sep">→</span>
                    <span className="logs-rec-time">{record.checkOut?.time ? formatTime(record.checkOut.time) : '--:--'}</span>
                  </div>
                </div>

                {/* Financials row */}
                <div className="logs-rec-finance">
                  <div className="logs-rec-fin-item">
                    <span className="logs-rec-fin-label">{t('attendanceLogs.record.daily')}</span>
                    <span className="logs-rec-fin-val">{formatRp(record.dailyRate || 0)}</span>
                  </div>
                  {record.overtimePay > 0 && (
                    <div className="logs-rec-fin-item">
                      <span className="logs-rec-fin-label">{t('attendanceLogs.record.overtime')}</span>
                      <span className="logs-rec-fin-val">{formatRp(record.overtimePay)}</span>
                    </div>
                  )}
                  <div className="logs-rec-fin-total">
                    <span>{formatRp(totalPay)}</span>
                    <Badge
                      label={record.paymentStatus === 'Paid' ? t('attendanceLogs.filters.paymentOptions.paid') : t('attendanceLogs.filters.paymentOptions.unpaid')}
                      variant={record.paymentStatus === 'Paid' ? 'success' : 'warning'}
                      size="small"
                    />
                  </div>
                </div>

                {/* Project + Action */}
                <div className="logs-rec-bottom">
                  {record.projectId && (
                    <div className="logs-rec-project">
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

      {/* Wage Modal */}
      {wageModal && selectedRecord && (
        <div className="modal-overlay" onClick={() => setWageModal(false)}>
          <div className="att-modal" onClick={e => e.stopPropagation()}>
            <div className="att-modal-title-row">
              <DollarSign size={20} color="#F59E0B" />
              <h3>{t('attendanceLogs.wageModal.title')}</h3>
            </div>

            <div className="logs-wage-info">
              <User size={14} />
              <span>{selectedRecord.userId.fullName}</span>
              <span className="logs-wage-sep">•</span>
              <span>{formatDate(selectedRecord.date)}</span>
            </div>

            <div className="logs-wage-options">
              {WAGE_OPTIONS_TRANSLATED.map(opt => (
                <button
                  key={opt.value}
                  className={`logs-wage-opt ${newWageType === opt.value ? 'active' : ''}`}
                  onClick={() => handleTypeChange(opt.value)}
                >
                  {newWageType === opt.value && <Check size={16} />}
                  <span className="logs-wage-opt-label">{opt.label}</span>
                  <span className="logs-wage-opt-mult">{opt.multiplier}x</span>
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
                    <p className="logs-helper">
                      {t('attendanceLogs.wageModal.duration', { hours: ((new Date(selectedRecord.checkOut.time).getTime() - new Date(selectedRecord.checkIn.time).getTime()) / (1000 * 60 * 60)).toFixed(2) })}
                    </p>
                  )}
                </div>
              )}
              <p className="logs-helper" style={{ marginTop: 12 }}>
                {t('attendanceLogs.wageModal.helper')}
              </p>
            </div>

            <div className="att-modal-actions">
              <Button title={t('attendanceLogs.actions.cancel')} onClick={() => setWageModal(false)} variant="outline" />
              <Button title={t('attendanceLogs.actions.save')} onClick={handleSaveWage} loading={submitting} variant="primary" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
