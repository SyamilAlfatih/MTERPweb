import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, User, Clock, Filter,
  ChevronDown, DollarSign, X, Check, Building, Users,
  Wallet, Loader, FileText, CalendarOff, Eye, Ban, AlertTriangle,
  LayoutGrid, Table as TableIcon, Camera, Image, ShieldCheck,
  RefreshCw, Download, ExternalLink, Sparkles, MapPin, ZoomIn,
  CheckCircle2, AlertCircle, Layers
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PhotoView } from 'react-photo-view';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, Button, EmptyState, CostInput } from '../components/shared';
import { formatDate as formatWIBDate, formatTime as formatWIBTime, todayWIB, wibDate } from '../utils/date';

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface UserOption {
  _id: string;
  fullName: string;
  role: string;
}

interface ProjectOption {
  _id: string;
  nama: string;
  lokasi?: string;
}

interface AttendanceRecord {
  _id: string;
  userId: { _id: string; fullName: string; role: string; profileImage?: string };
  date: string;
  checkIn?: {
    time: string;
    photo?: string;
    isGroupPhoto?: boolean;
    location?: { lat: number; lng: number };
    distanceToOffice?: number;
    geofenceStatus?: 'in_radius' | 'out_of_range' | 'exempt_wfh' | 'exempt_dinas' | string;
  };
  checkOut?: {
    time: string;
    photo?: string;
    location?: { lat: number; lng: number };
    distanceToOffice?: number;
    geofenceStatus?: 'in_radius' | 'out_of_range' | 'exempt_wfh' | 'exempt_dinas' | string;
  };
  wageType: string;
  wageMultiplier: number;
  dailyRate: number;
  hourlyRate: number;
  overtimePay: number;
  paymentStatus: 'Unpaid' | 'Paid';
  paidAt?: string;
  projectId?: { _id: string; nama: string; lokasi?: string };
  sessionId?: { _id: string; photoUrl?: string; notes?: string; createdAt?: string };
  workType?: string;
  officeLocation?: string;
  workSummary?: string;
  category?: string;
  status: string;
  notes?: string;
  overtimeHours?: number;
  permit?: { reason: string; evidence: string; status: string };
  invalidatedBy?: { fullName: string };
  invalidatedAt?: string;
  invalidatedReason?: string;
}

interface PhotoEvidenceItem {
  type: 'checkIn' | 'checkOut' | 'session' | 'permit';
  label: string;
  url: string;
  isGroupSession?: boolean;
}

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

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace('/api', '');

const getImageUrl = (path: string | undefined): string => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalizedPath = path.replace(/\\/g, '/');
  const uploadsIndex = normalizedPath.indexOf('uploads/');
  if (uploadsIndex !== -1) {
    return `${API_BASE}/${normalizedPath.substring(uploadsIndex)}`;
  }
  const clean = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath;
  return `${API_BASE}/${clean}`;
};

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  Present: { color: '#059669', bg: '#D1FAE5', label: 'Hadir' },
  Late: { color: '#D97706', bg: '#FEF3C7', label: 'Terlambat' },
  Absent: { color: '#DC2626', bg: '#FEE2E2', label: 'Tidak Hadir' },
  Permit: { color: '#7C3AED', bg: '#EDE9FE', label: 'Izin / Sakit' },
  'Half-day': { color: '#6366F1', bg: '#EEF2FF', label: 'Setengah Hari' },
};

const OFFICE_ROLES = [
  'owner',
  'president_director',
  'operational_director',
  'director',
  'admin_project',
  'asset_admin',
  'device_admin'
];

const isOfficeRecord = (record: AttendanceRecord): boolean => {
  if (!record) return false;
  if (record.category === 'office') return true;
  if (record.workType && ['WFO', 'WFH', 'Dinas'].includes(record.workType)) return true;
  const role = record.userId?.role;
  if (role && OFFICE_ROLES.includes(role)) return true;
  return false;
};

const getRecordPhotos = (record: AttendanceRecord): PhotoEvidenceItem[] => {
  const items: PhotoEvidenceItem[] = [];
  const sessionPhotoUrl = record.sessionId?.photoUrl;
  const isCheckInGroup = (record.checkIn as any)?.isGroupPhoto ||
    (sessionPhotoUrl && record.checkIn?.photo === sessionPhotoUrl);

  // 1. Check-In photo / Group Session proof
  if (record.checkIn?.photo) {
    if (isCheckInGroup) {
      items.push({
        type: 'session',
        label: 'Foto Sesi Grup (Bukti Hadir)',
        url: getImageUrl(record.checkIn.photo),
        isGroupSession: true,
      });
    } else {
      items.push({
        type: 'checkIn',
        label: 'Foto Masuk (Selfie)',
        url: getImageUrl(record.checkIn.photo),
        isGroupSession: false,
      });
    }
  } else if (sessionPhotoUrl) {
    // If worker had no individual selfie check-in, group session photo serves as attendance proof
    items.push({
      type: 'session',
      label: 'Foto Sesi Grup (Bukti Hadir)',
      url: getImageUrl(sessionPhotoUrl),
      isGroupSession: true,
    });
  }

  // If there's a distinct supervisor session photo
  if (sessionPhotoUrl && !items.some(it => it.url === getImageUrl(sessionPhotoUrl))) {
    items.push({
      type: 'session',
      label: 'Foto Sesi Supervisi Lapangan',
      url: getImageUrl(sessionPhotoUrl),
      isGroupSession: true,
    });
  }

  // 2. Check-Out photo
  if (record.checkOut?.photo) {
    items.push({
      type: 'checkOut',
      label: 'Foto Pulang (Check-Out)',
      url: getImageUrl(record.checkOut.photo),
    });
  }

  // 3. Permit evidence
  if (record.permit?.evidence) {
    items.push({
      type: 'permit',
      label: 'Bukti Izin / Surat Dokter',
      url: getImageUrl(record.permit.evidence),
    });
  }

  return items;
};

/**
 * Returns the primary display photo for a worker.
 * If the worker attended via group attendance, uses the group photo so quick preview displays that photo.
 */
const getWorkerDisplayPhoto = (record: AttendanceRecord): { url: string; label: string; isGroupSession: boolean } | null => {
  const photos = getRecordPhotos(record);
  const attendancePhoto = photos.find(p => p.type === 'session' || p.type === 'checkIn');
  if (attendancePhoto) {
    return {
      url: attendancePhoto.url,
      label: attendancePhoto.label,
      isGroupSession: !!attendancePhoto.isGroupSession,
    };
  }
  const checkOutPhoto = photos.find(p => p.type === 'checkOut');
  if (checkOutPhoto) {
    return {
      url: checkOutPhoto.url,
      label: checkOutPhoto.label,
      isGroupSession: false,
    };
  }
  if (record.userId?.profileImage) {
    return {
      url: getImageUrl(record.userId.profileImage),
      label: 'Foto Profil',
      isGroupSession: false,
    };
  }
  return null;
};

export default function AttendanceLogs() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Core Data
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<RecapSummary | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  // View Mode & Layout Mode
  const [viewMode, setViewMode] = useState<'attendance' | 'permits'>('attendance');
  const [layoutMode, setLayoutMode] = useState<'table' | 'cards'>('table');

  // Filters
  const [workforceCategory, setWorkforceCategory] = useState<'all' | 'office' | 'field'>('all');
  const [workTypeFilter, setWorkTypeFilter] = useState<'all' | 'WFO' | 'WFH' | 'Dinas'>('all');
  const [geofenceFilter, setGeofenceFilter] = useState<'all' | 'in_radius' | 'out_of_range'>('all');
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'custom'>('week');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Present' | 'Late' | 'Absent' | 'Permit' | 'Half-day'>('All');
  const [paymentStatus, setPaymentStatus] = useState<'All' | 'Unpaid' | 'Paid'>('All');
  const [photoOnly, setPhotoOnly] = useState(false);

  // Wage modal
  const [wageModal, setWageModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [newWageType, setNewWageType] = useState('daily');
  const [newDailyRate, setNewDailyRate] = useState<number>(0);
  const [newOvertimePay, setNewOvertimePay] = useState<number>(0);
  const [newOvertimeHours, setNewOvertimeHours] = useState<number | string>(0);
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);

  // Quick Photo Inspector Modal
  const [photoInspector, setPhotoInspector] = useState<{
    open: boolean;
    workerName: string;
    dateStr: string;
    projectName: string;
    sessionNotes?: string;
    photos: PhotoEvidenceItem[];
  }>({ open: false, workerName: '', dateStr: '', projectName: '', photos: [] });

  // Invalidate modal
  const [invalidateModal, setInvalidateModal] = useState(false);
  const [invalidateRecord, setInvalidateRecord] = useState<AttendanceRecord | null>(null);
  const [invalidateStatus, setInvalidateStatus] = useState<'Absent' | 'Permit'>('Absent');
  const [invalidateReason, setInvalidateReason] = useState('');
  const [invalidating, setInvalidating] = useState(false);

  const isSupervisor = user?.role && ['owner', 'president_director', 'operational_director', 'director', 'supervisor', 'asset_admin', 'site_manager'].includes(user.role);

  // Initial Range Setup
  useEffect(() => {
    const todayStr = todayWIB();
    const [y, m, d] = todayStr.split('-').map(Number);
    const todayD = new Date(Date.UTC(y, m - 1, d));

    const weekStart = new Date(todayD);
    weekStart.setUTCDate(todayD.getUTCDate() - todayD.getUTCDay());

    setStartDate(weekStart.toISOString().slice(0, 10));
    setEndDate(todayStr);
    fetchUsers();
    fetchProjects();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/attendance/users');
      setUsers(response.data || []);
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await api.get('/attendance/projects');
      setProjects(response.data || []);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { startDate, endDate };
      if (selectedUser) params.userId = selectedUser;
      if (workforceCategory !== 'all') params.workforceType = workforceCategory;
      if (workTypeFilter !== 'all') params.workType = workTypeFilter;
      const response = await api.get('/attendance/recap', { params });
      let fetchedRecords = response.data.records || [];
      if (paymentStatus !== 'All') {
        fetchedRecords = fetchedRecords.filter((r: AttendanceRecord) =>
          (r.paymentStatus || 'Unpaid') === paymentStatus
        );
      }
      setRecords(fetchedRecords);
      setSummary(response.data.summary);
    } catch (err) {
      console.error('Failed to fetch attendance', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startDate && endDate) fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, selectedUser, paymentStatus, workforceCategory, workTypeFilter]);

  const handleDateRangeChange = (range: 'week' | 'month' | 'custom') => {
    setDateRange(range);
    const todayStr = todayWIB();
    const [y, m, d] = todayStr.split('-').map(Number);
    const todayD = new Date(Date.UTC(y, m - 1, d));

    if (range === 'week') {
      const weekStart = new Date(todayD);
      weekStart.setUTCDate(todayD.getUTCDate() - todayD.getUTCDay());
      setStartDate(weekStart.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (range === 'month') {
      const monthStart = new Date(todayD);
      monthStart.setUTCDate(1);
      setStartDate(monthStart.toISOString().slice(0, 10));
      setEndDate(todayStr);
    }
  };

  // Client-side filtering for workforce, workType, geofence, project, status, and photos
  const filteredRecords = useMemo(() => {
    let result = records;
    if (workforceCategory === 'office') {
      result = result.filter(r => isOfficeRecord(r));
    } else if (workforceCategory === 'field') {
      result = result.filter(r => !isOfficeRecord(r));
    }
    if (workTypeFilter !== 'all') {
      result = result.filter(r => r.workType === workTypeFilter);
    }
    if (geofenceFilter === 'in_radius') {
      result = result.filter(r => r.checkIn?.geofenceStatus === 'in_radius');
    } else if (geofenceFilter === 'out_of_range') {
      result = result.filter(r => r.checkIn?.geofenceStatus === 'out_of_range');
    }
    if (selectedProject) {
      result = result.filter(r => {
        const pId = typeof r.projectId === 'string' ? r.projectId : r.projectId?._id;
        return pId === selectedProject;
      });
    }
    if (statusFilter !== 'All') {
      result = result.filter(r => r.status === statusFilter);
    }
    if (photoOnly) {
      result = result.filter(r => getRecordPhotos(r).length > 0);
    }
    return result;
  }, [records, workforceCategory, workTypeFilter, geofenceFilter, selectedProject, statusFilter, photoOnly]);

  const permitRecords = useMemo(() => {
    return filteredRecords.filter(r => r.status === 'Permit');
  }, [filteredRecords]);

  // Wage Modal Handlers
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
        wageType: newWageType,
        dailyRate: newDailyRate,
        overtimePay: newOvertimePay,
      });
      await fetchRecords();
      setWageModal(false);
      setSelectedRecord(null);
    } catch (err) {
      console.error('Failed to update wage', err);
      alert('Gagal memperbarui upah pekerja.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (filteredRecords.length === 0) return;
    const unpaidIds = filteredRecords.filter(r => r.paymentStatus !== 'Paid').map(r => r._id);
    if (unpaidIds.length === 0) {
      alert('Tidak ada tagihan upah yang belum dibayar.');
      return;
    }
    if (!window.confirm(`Konfirmasi pembayaran untuk ${unpaidIds.length} catatan kehadiran?`)) return;
    setPaying(true);
    try {
      await api.post('/attendance/pay', { attendanceIds: unpaidIds });
      await fetchRecords();
    } catch (err) {
      console.error('Payment failed', err);
      alert('Gagal memproses status pembayaran.');
    } finally {
      setPaying(false);
    }
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
      alert(err?.response?.data?.msg || 'Gagal mengoreksi kehadiran.');
    } finally {
      setInvalidating(false);
    }
  };

  const openQuickPhotoInspector = (record: AttendanceRecord) => {
    const photos = getRecordPhotos(record);
    setPhotoInspector({
      open: true,
      workerName: record.userId?.fullName || 'Pekerja',
      dateStr: formatWIBDate(record.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      projectName: record.projectId?.nama || 'Proyek Lapangan',
      sessionNotes: record.sessionId?.notes,
      photos,
    });
  };

  const formatDateDisplay = (dateStr: string) =>
    formatWIBDate(dateStr, { weekday: 'short', day: 'numeric', month: 'short' });

  const formatTimeDisplay = (dateStr: string) =>
    formatWIBTime(dateStr);

  const formatRp = (val: number) => `Rp ${new Intl.NumberFormat('id-ID').format(val)}`;

  const WAGE_OPTIONS = [
    { label: 'Harian Standar (1.0x)', value: 'daily', multiplier: 1 },
    { label: 'Lembur / Jam Tambahan', value: 'overtime', multiplier: '-' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto max-lg:p-4 max-sm:p-3 space-y-6">

      {/* ══════════════ 1. ERP HEADER ══════════════ */}
      <div className="rounded-2xl bg-bg-white border border-border-light p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-xl bg-bg-secondary flex items-center justify-center border border-border-light text-text-primary hover:bg-border-light transition-all cursor-pointer shrink-0 mt-1"
              title="Kembali"
              aria-label="Kembali"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                <span>MTERP</span>
                <span>/</span>
                <span>Operasional Proyek</span>
                <span>/</span>
                <span className="text-primary font-black">Audit & Log Kehadiran</span>
              </div>
              <h1 className="text-2xl font-black text-text-primary tracking-tight m-0 flex items-center gap-2.5">
                <span>Log & Validasi Kehadiran (ERP)</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-primary/10 text-primary border border-primary/20">
                  Site Audit
                </span>
              </h1>
              <p className="text-xs text-text-muted m-0 mt-1 max-w-xl">
                Audit verifikasi foto bukti check-in/out, rekam jam kerja lapangan, koreksi kehadiran, dan persetujuan upah.
              </p>
            </div>
          </div>

          {/* Quick Toolbar */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => navigate('/group-attendance')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200 cursor-pointer"
            >
              <Camera size={14} />
              <span>Absensi Foto Grup</span>
            </button>
            <button
              onClick={() => navigate('/attendance-recap')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-primary-bg text-primary hover:bg-primary/20 transition-colors border border-primary/20 cursor-pointer"
            >
              <TableIcon size={14} />
              <span>Rekapitulasi</span>
            </button>
            <button
              onClick={fetchRecords}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-bg-secondary text-text-primary hover:bg-border-light transition-colors border border-border-light cursor-pointer"
              title="Refresh data"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* View Mode & Layout Mode Selectors */}
        <div className="mt-5 pt-4 border-t border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-bg-secondary p-1 rounded-xl border border-border-light">
            <button
              onClick={() => setViewMode('attendance')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'attendance'
                  ? 'bg-bg-white text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Users size={15} />
              <span>Log Kehadiran & Upah ({filteredRecords.length})</span>
            </button>
            <button
              onClick={() => setViewMode('permits')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'permits'
                  ? 'bg-bg-white text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <CalendarOff size={15} />
              <span>Verifikasi Izin & Sakit ({permitRecords.length})</span>
            </button>
          </div>

          {viewMode === 'attendance' && (
            <div className="flex items-center gap-1.5 bg-bg-secondary p-1 rounded-xl border border-border-light self-start sm:self-auto">
              <span className="text-[11px] font-bold text-text-muted px-2 uppercase">Layout:</span>
              <button
                onClick={() => setLayoutMode('table')}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  layoutMode === 'table'
                    ? 'bg-bg-white text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
                title="Tampilan Tabel ERP (Data Grid)"
              >
                <TableIcon size={16} />
              </button>
              <button
                onClick={() => setLayoutMode('cards')}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  layoutMode === 'cards'
                    ? 'bg-bg-white text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
                title="Tampilan Kartu"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════ 2. KPI SUMMARY BENTO ROW ══════════════ */}
      {viewMode === 'attendance' && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-bg-white border border-border-light shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
              <Calendar size={22} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider m-0">Total Catatan Log</p>
              <h3 className="text-xl font-extrabold text-text-primary m-0 mt-0.5">{summary.total} Log</h3>
              <p className="text-[10px] text-text-muted font-medium m-0 mt-0.5">Dalam rentang aktif</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-bg-white border border-border-light shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider m-0">Kehadiran Valid</p>
              <h3 className="text-xl font-extrabold text-text-primary m-0 mt-0.5">{summary.present} Hadir</h3>
              <p className="text-[10px] text-amber-600 font-semibold m-0 mt-0.5">{summary.late} terlambat</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-bg-white border border-border-light shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 border border-orange-100">
              <Clock size={22} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider m-0">Total Jam Kerja</p>
              <h3 className="text-xl font-extrabold text-text-primary m-0 mt-0.5">{summary.totalHours.toFixed(1)}j</h3>
              <p className="text-[10px] text-orange-600 font-semibold m-0 mt-0.5">
                {(summary.totalOvertimeHours || 0).toFixed(1)}j lembur
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-bg-white border border-border-light shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-primary-bg text-primary flex items-center justify-center shrink-0 border border-primary/20">
              <DollarSign size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider m-0">Total Estimasi Upah</p>
              <h3 className="text-base font-black text-primary m-0 mt-0.5 truncate">{formatRp(summary.totalPayment || 0)}</h3>
              {isSupervisor && paymentStatus === 'Unpaid' && (summary.totalPayment || 0) > 0 ? (
                <button
                  onClick={handleMarkAsPaid}
                  disabled={paying}
                  className="mt-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Check size={10} />
                  <span>Bayar Semua Unpaid</span>
                </button>
              ) : (
                <p className="text-[10px] text-text-muted font-medium m-0 mt-0.5">Termasuk harian & lembur</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ 3. ERP ADVANCED FILTER SUITE ══════════════ */}
      <div className="p-5 rounded-2xl bg-bg-white border border-border-light shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-primary" />
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
              Filter Pencarian & Parameter Audit
            </span>
          </div>
          <button
            onClick={() => {
              setWorkforceCategory('all');
              setWorkTypeFilter('all');
              setGeofenceFilter('all');
              setSelectedUser('');
              setSelectedProject('');
              setStatusFilter('All');
              setPaymentStatus('All');
              setPhotoOnly(false);
              handleDateRangeChange('week');
            }}
            className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
          >
            Reset Filter
          </button>
        </div>

        {/* Workforce Category Segmented Control */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider">
            Kategori Tenaga Kerja
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => {
                setWorkforceCategory('all');
                setWorkTypeFilter('all');
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                workforceCategory === 'all'
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-bg-secondary text-text-muted border-border-light hover:text-text-primary'
              }`}
            >
              <Users size={15} />
              <span>Semua Tenaga Kerja</span>
            </button>
            <button
              onClick={() => setWorkforceCategory('office')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                workforceCategory === 'office'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-bg-secondary text-text-muted border-border-light hover:text-text-primary'
              }`}
            >
              <Building size={15} />
              <span>🏢 Kantor & Manajemen</span>
            </button>
            <button
              onClick={() => {
                setWorkforceCategory('field');
                setWorkTypeFilter('all');
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                workforceCategory === 'field'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                  : 'bg-bg-secondary text-text-muted border-border-light hover:text-text-primary'
              }`}
            >
              <Layers size={15} />
              <span>👷 Tim Lapangan & Proyek</span>
            </button>
          </div>

          {/* Sub-filters for Office: WFO / WFH / Dinas */}
          {workforceCategory === 'office' && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                Moda Kerja:
              </span>
              {(['all', 'WFO', 'WFH', 'Dinas'] as const).map(wt => (
                <button
                  key={wt}
                  onClick={() => setWorkTypeFilter(wt)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                    workTypeFilter === wt
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-bg-white text-text-muted border-border-light hover:text-text-primary'
                  }`}
                >
                  {wt === 'all' ? 'Semua Moda' : wt === 'WFO' ? '🏢 WFO (Kantor)' : wt === 'WFH' ? '🏠 WFH (Remote)' : '✈️ Dinas Luar'}
                </button>
              ))}

              <div className="h-4 w-px bg-border-light mx-1" />
              <button
                type="button"
                onClick={() => setGeofenceFilter(prev => prev === 'out_of_range' ? 'all' : 'out_of_range')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                  geofenceFilter === 'out_of_range'
                    ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-sm'
                    : 'bg-bg-white text-text-muted border-border-light hover:text-text-primary'
                }`}
                title="Filter hanya presensi WFO yang terdeteksi di luar radius kantor"
              >
                <AlertTriangle size={12} className={geofenceFilter === 'out_of_range' ? 'text-amber-600' : ''} />
                <span>Out-of-Range ({records.filter(r => r.checkIn?.geofenceStatus === 'out_of_range').length})</span>
              </button>
            </div>
          )}
        </div>

        {/* Date Presets */}
        <div>
          <div className="grid grid-cols-3 gap-2">
            {(['week', 'month', 'custom'] as const).map(r => (
              <button
                key={r}
                className={`py-2 px-3 rounded-xl text-xs font-bold uppercase transition-all border cursor-pointer ${
                  dateRange === r
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-bg-secondary text-text-muted border-border-light hover:text-text-primary'
                }`}
                onClick={() => handleDateRangeChange(r)}
              >
                {r === 'week' ? 'Minggu Ini' : r === 'month' ? 'Bulan Ini' : 'Rentang Kustom'}
              </button>
            ))}
          </div>
        </div>

        {dateRange === 'custom' && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Tanggal Mulai</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-2.5 border border-border-light rounded-xl text-xs font-bold text-text-primary focus:border-primary outline-none bg-bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Tanggal Akhir</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full p-2.5 border border-border-light rounded-xl text-xs font-bold text-text-primary focus:border-primary outline-none bg-bg-white"
              />
            </div>
          </div>
        )}

        {/* Dropdown Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-border-light">
          {/* Worker */}
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Pekerja</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full p-2.5 border border-border-light rounded-xl bg-bg-white text-xs font-bold text-text-primary outline-none focus:border-primary cursor-pointer"
            >
              <option value="">Semua Pekerja</option>
              {users.map(u => <option key={u._id} value={u._id}>{u.fullName}</option>)}
            </select>
          </div>

          {/* Project */}
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Proyek</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full p-2.5 border border-border-light rounded-xl bg-bg-white text-xs font-bold text-text-primary outline-none focus:border-primary cursor-pointer"
            >
              <option value="">Semua Proyek</option>
              {projects.map(p => <option key={p._id} value={p._id}>{p.nama}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Status Kehadiran</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full p-2.5 border border-border-light rounded-xl bg-bg-white text-xs font-bold text-text-primary outline-none focus:border-primary cursor-pointer"
            >
              <option value="All">Semua Status</option>
              <option value="Present">Hadir (Present)</option>
              <option value="Late">Terlambat (Late)</option>
              <option value="Permit">Izin / Sakit (Permit)</option>
              <option value="Half-day">Setengah Hari</option>
              <option value="Absent">Tidak Hadir (Absent)</option>
            </select>
          </div>

          {/* Payment or Photo Filter */}
          <div className="flex flex-col justify-end">
            {viewMode === 'attendance' ? (
              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Status Gaji / Payroll</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as any)}
                  className="w-full p-2.5 border border-border-light rounded-xl bg-bg-white text-xs font-bold text-text-primary outline-none focus:border-primary cursor-pointer"
                >
                  <option value="All">Semua Pembayaran</option>
                  <option value="Unpaid">Belum Dibayar (Unpaid)</option>
                  <option value="Paid">Sudah Dibayar (Paid)</option>
                </select>
              </div>
            ) : (
              <div className="pt-4">
                <span className="text-xs text-text-muted">Menampilkan khusus perizinan pekerja</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Photo Filter Pill */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => setPhotoOnly(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              photoOnly
                ? 'bg-purple-100 text-purple-800 border-purple-300'
                : 'bg-bg-secondary text-text-muted border-border-light hover:text-text-primary'
            }`}
          >
            <Camera size={14} className={photoOnly ? 'text-purple-600' : ''} />
            <span>Hanya yang Memiliki Foto Bukti</span>
            {photoOnly && <span className="text-[10px] font-black">✓</span>}
          </button>
        </div>
      </div>

      {/* ══════════════ 4. MAIN LOGS VIEW: ATTENDANCE MODE ══════════════ */}
      {viewMode === 'attendance' && (
        <div>
          {loading ? (
            <div className="p-16 text-center text-text-muted bg-bg-white rounded-2xl border border-border-light">
              <Loader size={32} className="animate-spin mx-auto mb-3 text-primary" />
              <p className="font-bold text-sm uppercase tracking-wider">Memuat catatan kehadiran...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="Tidak ada log kehadiran"
              description="Tidak ada catatan kehadiran yang sesuai dengan filter yang dipilih."
            />
          ) : layoutMode === 'table' ? (
            /* ──── ERP DATA TABLE (DATA GRID) ──── */
            <div className="bg-bg-white rounded-2xl border border-border-light shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-bg-secondary/60 border-b border-border-light text-[10px] font-black text-text-muted uppercase tracking-wider">
                      <th className="py-3 px-4">Pekerja</th>
                      <th className="py-3 px-4">Tanggal & Proyek</th>
                      <th className="py-3 px-4">Jam Kerja (WIB)</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Foto Bukti (Quick Preview)</th>
                      <th className="py-3 px-4 text-right">Rincian Upah</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light text-xs">
                    {filteredRecords.map((record) => {
                      const statusStyle = STATUS_STYLES[record.status] || STATUS_STYLES.Present;
                      const totalPay = (record.dailyRate || 0) + (record.overtimePay || 0);
                      const photos = getRecordPhotos(record);
                      const workerPhoto = getWorkerDisplayPhoto(record);

                      return (
                        <tr key={record._id} className="hover:bg-bg-secondary/40 transition-colors">
                          {/* Worker Column with Photo Quick Preview */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              {workerPhoto ? (
                                <PhotoView src={workerPhoto.url}>
                                  <div
                                    className="relative w-10 h-10 rounded-xl overflow-hidden border border-border-light cursor-pointer shadow-xs hover:ring-2 hover:ring-primary transition-all shrink-0 bg-bg-secondary group"
                                    title={`Klik untuk Quick Preview Foto ${record.userId?.fullName || 'Pekerja'} (${workerPhoto.label})`}
                                  >
                                    <img
                                      src={workerPhoto.url}
                                      alt={record.userId?.fullName || 'Worker'}
                                      className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                    />
                                    {workerPhoto.isGroupSession && (
                                      <div
                                        className="absolute bottom-0 right-0 bg-primary text-white p-0.5 rounded-tl-md leading-none shadow-xs"
                                        title="Bukti Foto Hadir Sesi Grup"
                                      >
                                        <Users size={8} />
                                      </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                      <ZoomIn size={12} />
                                    </div>
                                  </div>
                                </PhotoView>
                              ) : (
                                <div
                                  className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0"
                                  style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
                                >
                                  {record.userId?.fullName?.charAt(0).toUpperCase() || '?'}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-bold text-text-primary m-0 truncate">{record.userId?.fullName || 'Deleted User'}</p>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] text-text-muted m-0 capitalize truncate">{record.userId?.role || '-'}</span>
                                  {workerPhoto?.isGroupSession && (
                                    <span className="text-[9px] font-black text-primary bg-primary/10 px-1.5 py-0.2 rounded inline-flex items-center gap-0.5 leading-tight">
                                      <Users size={8} /> Sesi Grup
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Date & Project / Office Location */}
                          <td className="py-3.5 px-4">
                            <p className="font-bold text-text-primary m-0">{formatDateDisplay(record.date)}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {record.workType && (
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${
                                  record.workType === 'WFO'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : record.workType === 'WFH'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {record.workType}
                                </span>
                              )}
                              <span className="text-[11px] text-text-muted truncate max-w-[200px]">
                                {record.officeLocation ? `🏢 ${record.officeLocation}` : record.projectId?.nama ? `📍 ${record.projectId.nama}` : '—'}
                              </span>

                              {/* Geofence Status Badge */}
                              {record.checkIn?.geofenceStatus === 'in_radius' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-0.5">
                                  <span>🟢 In-Radius</span>
                                  {record.checkIn.distanceToOffice !== undefined && (
                                    <span>({record.checkIn.distanceToOffice}m)</span>
                                  )}
                                </span>
                              )}
                              {record.checkIn?.geofenceStatus === 'out_of_range' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-0.5" title="Di luar radius resmi kantor 150m">
                                  <span>⚠️ Out-of-Range</span>
                                  {record.checkIn.distanceToOffice !== undefined && (
                                    <span>(
                                      {record.checkIn.distanceToOffice > 1000
                                        ? `${(record.checkIn.distanceToOffice / 1000).toFixed(1)}km`
                                        : `${record.checkIn.distanceToOffice}m`}
                                    )</span>
                                  )}
                                </span>
                              )}
                            </div>
                            {record.workSummary && (
                              <p className="text-[10px] text-indigo-700 bg-indigo-50/70 p-1.5 rounded-md m-0 mt-1 max-w-[220px] truncate" title={record.workSummary}>
                                📋 {record.workSummary}
                              </p>
                            )}
                            {record.notes && !record.workSummary && (
                              <p className="text-[10px] text-text-muted italic m-0 mt-0.5 max-w-[200px] truncate" title={record.notes}>
                                📝 {record.notes}
                              </p>
                            )}
                          </td>

                          {/* Times */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 font-bold text-text-primary tabular-nums">
                              <Clock size={13} className="text-text-muted shrink-0" />
                              <span>{record.checkIn?.time ? formatTimeDisplay(record.checkIn.time) : '--:--'}</span>
                              <span className="text-text-muted font-normal">→</span>
                              <span>{record.checkOut?.time ? formatTimeDisplay(record.checkOut.time) : '--:--'}</span>
                            </div>
                            {record.invalidatedBy && (
                              <span className="text-[10px] text-red-600 font-bold block mt-0.5">
                                ⚠ Di-koreksi ({record.invalidatedBy.fullName})
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            <span
                              className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider inline-block"
                              style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
                            >
                              {statusStyle.label}
                            </span>
                          </td>

                          {/* Photo Evidence (Quick Preview) */}
                          <td className="py-3.5 px-4 text-center">
                            {photos.length > 0 ? (
                              <div className="flex flex-col items-center gap-1.5">
                                <div className="flex items-center justify-center gap-1.5">
                                  {photos.map((item, idx) => (
                                    <div key={idx} className="relative group shrink-0">
                                      <PhotoView src={item.url}>
                                        <div
                                          className={`relative w-10 h-10 rounded-xl overflow-hidden border cursor-pointer shadow-xs hover:ring-2 hover:ring-primary transition-all bg-bg-secondary group ${
                                            item.isGroupSession ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border-light'
                                          }`}
                                          title={`${item.label} (Klik untuk Zoom Preview)`}
                                        >
                                          <img src={item.url} alt={item.label} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                          {item.isGroupSession && (
                                            <div className="absolute bottom-0 right-0 bg-primary text-white p-0.5 rounded-tl-md leading-none shadow-xs" title="Foto Bukti Hadir Sesi Grup">
                                              <Users size={8} />
                                            </div>
                                          )}
                                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                            <ZoomIn size={12} />
                                          </div>
                                        </div>
                                      </PhotoView>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => openQuickPhotoInspector(record)}
                                    className="w-8 h-8 rounded-xl bg-bg-secondary hover:bg-primary-bg hover:text-primary transition-colors flex items-center justify-center text-text-muted shrink-0 cursor-pointer border border-border-light"
                                    title="Buka Galeri Foto Lengkap"
                                  >
                                    <Eye size={13} />
                                  </button>
                                </div>
                                {photos.some(p => p.isGroupSession) ? (
                                  <PhotoView src={photos.find(p => p.isGroupSession)!.url}>
                                    <button
                                      className="text-[9px] font-extrabold text-primary bg-primary/10 hover:bg-primary/20 transition-colors px-2 py-0.5 rounded-full inline-flex items-center gap-1 leading-tight cursor-pointer border border-primary/20"
                                      title="Klik untuk Quick Preview Foto Grup"
                                    >
                                      <Users size={9} />
                                      <span>Quick Preview Foto Grup</span>
                                    </button>
                                  </PhotoView>
                                ) : (
                                  <span className="text-[9px] font-bold text-text-muted">
                                    {photos.length} foto bukti
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-text-muted/60">—</span>
                            )}
                          </td>

                          {/* Wage */}
                          <td className="py-3.5 px-4 text-right">
                            <p className="font-extrabold text-text-primary m-0">{formatRp(totalPay)}</p>
                            <div className="flex items-center justify-end gap-1.5 mt-0.5">
                              <span className={`px-2 py-0.2 rounded-full text-[9px] font-black uppercase ${
                                record.paymentStatus === 'Paid'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {record.paymentStatus === 'Paid' ? 'PAID' : 'UNPAID'}
                              </span>
                              {record.overtimePay > 0 && (
                                <span className="text-[10px] text-orange-600 font-bold">
                                  +{formatRp(record.overtimePay)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {isSupervisor && (
                                <>
                                  <button
                                    onClick={() => openWageModal(record)}
                                    className="p-1.5 rounded-lg bg-bg-secondary hover:bg-primary-bg hover:text-primary transition-colors text-text-muted cursor-pointer"
                                    title="Edit Upah / Lembur"
                                  >
                                    <DollarSign size={15} />
                                  </button>
                                  {record.checkIn?.time && ['Present', 'Late'].includes(record.status) && (
                                    <button
                                      onClick={() => openInvalidateModal(record)}
                                      className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                                      title="Koreksi / Invalidate Check-In"
                                    >
                                      <Ban size={15} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ──── ERP CARDS GRID ──── */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRecords.map((record) => {
                const statusStyle = STATUS_STYLES[record.status] || STATUS_STYLES.Present;
                const totalPay = (record.dailyRate || 0) + (record.overtimePay || 0);
                const photos = getRecordPhotos(record);

                return (
                  <Card key={record._id} className="p-5 border border-border-light hover:border-primary/50 transition-all shadow-sm">
                    {/* Top Row with Worker Photo Quick Preview */}
                    {(() => {
                      const workerPhoto = getWorkerDisplayPhoto(record);
                      return (
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-3">
                            {workerPhoto ? (
                              <PhotoView src={workerPhoto.url}>
                                <div
                                  className="relative w-12 h-12 rounded-xl overflow-hidden border border-border-light cursor-pointer shadow-xs hover:ring-2 hover:ring-primary transition-all shrink-0 bg-bg-secondary group"
                                  title={`Klik untuk Quick Preview Foto ${record.userId?.fullName || 'Pekerja'} (${workerPhoto.label})`}
                                >
                                  <img
                                    src={workerPhoto.url}
                                    alt={record.userId?.fullName || 'Worker'}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                  />
                                  {workerPhoto.isGroupSession && (
                                    <div
                                      className="absolute bottom-0 right-0 bg-primary text-white p-0.5 rounded-tl-md leading-none shadow-xs"
                                      title="Bukti Foto Hadir Sesi Grup"
                                    >
                                      <Users size={9} />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                    <ZoomIn size={14} />
                                  </div>
                                </div>
                              </PhotoView>
                            ) : (
                              <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-base shrink-0"
                                style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
                              >
                                {record.userId?.fullName?.charAt(0).toUpperCase() || '?'}
                              </div>
                            )}
                            <div>
                              <h4 className="text-sm font-extrabold text-text-primary m-0 flex items-center gap-1.5 flex-wrap">
                                <span>{record.userId?.fullName || 'Deleted User'}</span>
                                {workerPhoto?.isGroupSession && (
                                  <span className="text-[9px] font-black text-primary bg-primary/10 px-1.5 py-0.2 rounded inline-flex items-center gap-0.5 leading-tight">
                                    <Users size={8} /> Sesi Grup
                                  </span>
                                )}
                              </h4>
                              <p className="text-[11px] text-text-muted m-0 capitalize">{record.userId?.role || '-'}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider block mb-1"
                              style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
                            >
                              {statusStyle.label}
                            </span>
                            <span className="text-[11px] font-bold text-text-muted">{formatDateDisplay(record.date)}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Time & Project / Office Banner */}
                    <div className="p-3 rounded-xl bg-bg-secondary flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                        <Clock size={14} className="text-text-muted" />
                        <span>{record.checkIn?.time ? formatTimeDisplay(record.checkIn.time) : '--:--'}</span>
                        <span className="text-text-muted font-normal">→</span>
                        <span>{record.checkOut?.time ? formatTimeDisplay(record.checkOut.time) : '--:--'}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {record.workType && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            record.workType === 'WFO'
                              ? 'bg-emerald-100 text-emerald-800'
                              : record.workType === 'WFH'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {record.workType}
                          </span>
                        )}
                        {(record.officeLocation || record.projectId?.nama) && (
                          <span className="text-xs text-text-muted font-semibold truncate max-w-[140px]" title={record.officeLocation || record.projectId?.nama}>
                            {record.officeLocation ? `🏢 ${record.officeLocation}` : `📍 ${record.projectId?.nama}`}
                          </span>
                        )}
                        {record.checkIn?.geofenceStatus === 'in_radius' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                            🟢 In-Radius ({record.checkIn.distanceToOffice}m)
                          </span>
                        )}
                        {record.checkIn?.geofenceStatus === 'out_of_range' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                            ⚠️ Out-of-Range ({record.checkIn.distanceToOffice !== undefined && (record.checkIn.distanceToOffice > 1000 ? `${(record.checkIn.distanceToOffice/1000).toFixed(1)}km` : `${record.checkIn.distanceToOffice}m`)})
                          </span>
                        )}
                      </div>
                    </div>

                    {record.workSummary && (
                      <div className="px-3 py-2 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 mb-3 leading-relaxed">
                        <strong className="block text-[10px] uppercase font-black text-indigo-600 mb-0.5">Catatan Capaian Kerja:</strong>
                        <p className="m-0 whitespace-pre-wrap">{record.workSummary}</p>
                      </div>
                    )}

                    {record.notes && !record.workSummary && (
                      <div className="px-3 py-1.5 rounded-lg bg-bg-secondary/70 border border-border-light text-xs text-text-muted italic mb-3">
                        📝 {record.notes}
                      </div>
                    )}

                    {/* Photo Evidence Bar (Quick Preview) */}
                    {photos.length > 0 && (
                      <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 mb-3 ${
                        photos.some(p => p.isGroupSession)
                          ? 'bg-primary-bg/50 border-primary/25'
                          : 'bg-purple-50/60 border-purple-100'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                            photos.some(p => p.isGroupSession) ? 'text-primary font-black' : 'text-purple-900'
                          }`}>
                            {photos.some(p => p.isGroupSession) ? <Users size={12} /> : <Camera size={12} />}
                            <span>{photos.some(p => p.isGroupSession) ? 'Bukti Foto Grup' : 'Foto Bukti'} ({photos.length}):</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            {photos.map((item, idx) => (
                              <PhotoView key={idx} src={item.url}>
                                <div
                                  className={`w-7 h-7 rounded-lg overflow-hidden border cursor-pointer hover:scale-105 transition-transform relative ${
                                    item.isGroupSession ? 'border-primary/60' : 'border-purple-200'
                                  }`}
                                  title={`${item.label} (Klik untuk zoom)`}
                                >
                                  <img src={item.url} alt={item.label} className="w-full h-full object-cover" />
                                  {item.isGroupSession && (
                                    <div className="absolute bottom-0 right-0 bg-primary text-white p-0.5 rounded-tl leading-none">
                                      <Users size={7} />
                                    </div>
                                  )}
                                </div>
                              </PhotoView>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => openQuickPhotoInspector(record)}
                          className={`text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                            photos.some(p => p.isGroupSession) ? 'text-primary hover:text-primary-hover' : 'text-purple-700 hover:text-purple-900'
                          }`}
                        >
                          <Eye size={12} />
                          <span>Detail</span>
                        </button>
                      </div>
                    )}

                    {/* Wage Panel */}
                    <div className="p-3 rounded-xl bg-primary-bg/70 border border-primary/20 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-primary uppercase block">Total Upah</span>
                        <span className="text-base font-black text-primary">{formatRp(totalPay)}</span>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          record.paymentStatus === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {record.paymentStatus === 'Paid' ? 'PAID' : 'UNPAID'}
                        </span>
                      </div>
                    </div>

                    {/* Action Footer */}
                    {isSupervisor && (
                      <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border-light">
                        {record.checkIn?.time && ['Present', 'Late'].includes(record.status) && (
                          <button
                            onClick={() => openInvalidateModal(record)}
                            className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer"
                          >
                            <Ban size={13} />
                            <span>Koreksi</span>
                          </button>
                        )}
                        <button
                          onClick={() => openWageModal(record)}
                          className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold text-primary bg-primary-bg hover:bg-primary/20 border border-primary/20 transition-colors cursor-pointer"
                        >
                          <DollarSign size={13} />
                          <span>Edit Upah</span>
                        </button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ 5. PERMITS VIEW: AUDIT MODE ══════════════ */}
      {viewMode === 'permits' && (
        <div>
          {loading ? (
            <div className="p-16 text-center text-text-muted bg-bg-white rounded-2xl border border-border-light">
              <Loader size={32} className="animate-spin mx-auto mb-3 text-primary" />
              <p className="font-bold text-sm uppercase tracking-wider">Memuat permohonan izin...</p>
            </div>
          ) : permitRecords.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="Tidak ada permohonan izin"
              description="Tidak ada catatan izin atau sakit yang ditemukan dalam rentang waktu ini."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {permitRecords.map((record) => {
                const evidenceUrl = record.permit?.evidence ? getImageUrl(record.permit.evidence) : '';
                return (
                  <Card key={record._id} className="p-6 border border-border-light shadow-sm relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-2 bg-purple-500" />
                    
                    <div className="flex justify-between items-start mb-4 pl-2">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-base shrink-0">
                          {record.userId?.fullName?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-text-primary m-0">{record.userId?.fullName || 'Deleted User'}</h4>
                          <p className="text-[11px] text-text-muted m-0 capitalize">{record.userId?.role || '-'}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase block mb-1"
                          style={{
                            backgroundColor: record.permit?.status === 'Approved' ? '#D1FAE5' : record.permit?.status === 'Rejected' ? '#FEE2E2' : '#FEF3C7',
                            color: record.permit?.status === 'Approved' ? '#059669' : record.permit?.status === 'Rejected' ? '#DC2626' : '#D97706',
                          }}
                        >
                          {record.permit?.status || 'Pending'}
                        </span>
                        <span className="text-[11px] font-bold text-text-muted">{formatDateDisplay(record.date)}</span>
                      </div>
                    </div>

                    {/* Reason */}
                    {record.permit?.reason && (
                      <div className="p-3.5 bg-purple-50 rounded-xl mb-4 border border-purple-100 text-xs pl-3">
                        <span className="font-bold text-purple-900 block mb-1">Alasan Izin / Sakit:</span>
                        <p className="text-text-primary m-0 leading-relaxed">{record.permit.reason}</p>
                      </div>
                    )}

                    {/* Evidence Photo Preview */}
                    {evidenceUrl && (
                      <div className="rounded-xl overflow-hidden border border-border-light relative group bg-bg-secondary max-h-[220px]">
                        <PhotoView src={evidenceUrl}>
                          <div className="cursor-pointer relative overflow-hidden">
                            <img src={evidenceUrl} alt="Bukti izin" className="w-full h-44 object-cover group-hover:scale-105 transition-transform" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                              <ZoomIn size={20} />
                              <span className="text-xs font-bold uppercase tracking-wider">Perbesar Foto Bukti</span>
                            </div>
                          </div>
                        </PhotoView>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ 6. MODALS ══════════════ */}

      {/* Quick Photo Inspector Modal */}
      {photoInspector.open && (
        <div
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-[1100] p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setPhotoInspector({ open: false, workerName: '', dateStr: '', projectName: '', photos: [] })}
        >
          <div
            className="bg-bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-border-light animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3.5 border-b border-border-light mb-4">
              <div>
                <h3 className="text-base font-extrabold text-text-primary m-0 flex items-center gap-2">
                  <Camera size={18} className="text-primary" />
                  <span>Galeri Bukti Kehadiran</span>
                </h3>
                <p className="text-xs text-text-muted m-0 mt-0.5 font-medium">
                  {photoInspector.workerName} • {photoInspector.dateStr} • {photoInspector.projectName}
                </p>
                {photoInspector.sessionNotes && (
                  <p className="text-[11px] text-primary bg-primary-bg/70 px-2.5 py-1 rounded-lg mt-2 inline-block font-semibold border border-primary/20">
                    💬 Catatan Sesi: "{photoInspector.sessionNotes}"
                  </p>
                )}
              </div>
              <button
                onClick={() => setPhotoInspector({ open: false, workerName: '', dateStr: '', projectName: '', photos: [] })}
                className="w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                title="Tutup"
              >
                <X size={16} />
              </button>
            </div>

            {photoInspector.photos.some(p => p.isGroupSession) && (
              <div className="mb-4 p-3 rounded-xl bg-primary-bg/70 border border-primary/25 flex items-center gap-2.5 text-xs">
                <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
                  <Users size={16} />
                </div>
                <div>
                  <span className="font-extrabold text-primary block">Bukti Kehadiran Sesi Foto Grup</span>
                  <span className="text-[11px] text-text-muted">Pekerja diverifikasi dan terdata melalui foto bersama dalam sesi absensi supervisi lapangan.</span>
                </div>
              </div>
            )}

            {photoInspector.photos.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-xs">
                Tidak ada foto bukti yang terlampir untuk catatan ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto pr-1">
                {photoInspector.photos.map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-border-light overflow-hidden bg-bg-secondary flex flex-col">
                    <div className="p-2.5 bg-bg-white border-b border-border-light flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {item.isGroupSession ? (
                          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-extrabold shrink-0 flex items-center gap-1">
                            <Users size={10} />
                            <span>Grup</span>
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-extrabold shrink-0">
                            Selfie
                          </span>
                        )}
                        <span className="text-[11px] font-bold text-text-primary truncate">{item.label}</span>
                      </div>
                      <span className="text-[10px] text-text-muted font-medium shrink-0">Klik zoom</span>
                    </div>
                    <PhotoView src={item.url}>
                      <div className="cursor-pointer relative overflow-hidden group flex-1 min-h-[180px] bg-black/5">
                        <img src={item.url} alt={item.label} className="w-full h-48 object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center gap-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <ZoomIn size={18} />
                          <span className="text-xs font-bold">Perbesar Foto</span>
                        </div>
                      </div>
                    </PhotoView>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 pt-3.5 border-t border-border-light flex justify-between items-center text-xs text-text-muted">
              <span>💡 Klik pada foto untuk memperbesar, memutar, atau melihat detail resolusi tinggi.</span>
              <Button
                title="Tutup"
                onClick={() => setPhotoInspector({ open: false, workerName: '', dateStr: '', projectName: '', photos: [] })}
                variant="outline"
              />
            </div>
          </div>
        </div>
      )}

      {/* Wage Modal */}
      {wageModal && selectedRecord && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1050] p-4 animate-in fade-in duration-200"
          onClick={() => setWageModal(false)}
        >
          <div
            className="bg-bg-white rounded-2xl w-full max-w-[480px] shadow-2xl overflow-hidden border border-border-light animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border-light bg-bg-secondary flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                  <DollarSign size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-text-primary m-0">Edit Upah & Lembur</h3>
                  <p className="text-xs text-text-muted m-0">{selectedRecord.userId?.fullName} • {formatDateDisplay(selectedRecord.date)}</p>
                </div>
              </div>
              <button
                className="w-8 h-8 rounded-full bg-border-light border-none flex items-center justify-center text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                onClick={() => setWageModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
              {/* Wage Type */}
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">Tipe Upah</label>
                <div className="grid grid-cols-2 gap-2">
                  {WAGE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`p-3 border-2 rounded-xl cursor-pointer transition-all text-left ${
                        newWageType === opt.value
                          ? 'border-primary bg-primary text-white shadow-sm'
                          : 'border-border-light bg-bg-white text-text-primary hover:border-primary/50'
                      }`}
                      onClick={() => handleTypeChange(opt.value)}
                    >
                      <span className="block font-bold text-xs">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Rate Inputs */}
              <div>
                <CostInput
                  label="Tarif Harian (Daily Rate - Rp)"
                  value={newDailyRate}
                  onChange={handleRateChange}
                  placeholder="Contoh: 150.000"
                />
              </div>

              {newWageType === 'overtime' && (
                <div className="p-4 bg-orange-50/70 rounded-xl border border-orange-200 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-orange-900 uppercase mb-1">Total Jam Lembur</label>
                    <input
                      type="text"
                      value={newOvertimeHours}
                      onChange={(e) => handleHoursChange(e.target.value)}
                      placeholder="Contoh: 2"
                      className="w-full p-2.5 border border-orange-300 rounded-xl text-xs font-bold text-text-primary focus:border-primary outline-none bg-bg-white"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold text-orange-900 pt-1">
                    <span>Estimasi Uang Lembur:</span>
                    <span className="text-sm font-black">{formatRp(newOvertimePay)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-border-light bg-bg-secondary flex gap-2.5 justify-end">
              <Button title="Batal" onClick={() => setWageModal(false)} variant="outline" />
              <Button
                title={submitting ? 'Menyimpan...' : 'Simpan Perubahan Upah'}
                onClick={handleSaveWage}
                loading={submitting}
                variant="primary"
              />
            </div>
          </div>
        </div>
      )}

      {/* Invalidate Modal */}
      {invalidateModal && invalidateRecord && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1050] p-4 animate-in fade-in duration-200"
          onClick={() => setInvalidateModal(false)}
        >
          <div
            className="bg-bg-white rounded-2xl w-full max-w-[460px] shadow-2xl overflow-hidden border border-border-light animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-red-100 bg-red-50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-extrabold text-red-700 m-0">Koreksi Kehadiran / Invalidate</h3>
                <p className="text-xs text-red-500 m-0">Koreksi check-in yang tidak sah atau tidak berada di lokasi</p>
              </div>
              <button
                className="w-8 h-8 rounded-full bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200 transition-colors cursor-pointer"
                onClick={() => setInvalidateModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-bg-secondary rounded-xl border border-border-light flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-text-primary m-0">{invalidateRecord.userId?.fullName}</p>
                  <p className="text-[11px] text-text-muted m-0">{formatDateDisplay(invalidateRecord.date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-text-muted uppercase m-0">Waktu Check-In</p>
                  <p className="font-bold text-text-primary m-0">
                    {invalidateRecord.checkIn?.time ? formatTimeDisplay(invalidateRecord.checkIn.time) : '--:--'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">Ubah Status Menjadi:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border-2 font-bold text-xs cursor-pointer transition-all ${
                      invalidateStatus === 'Absent'
                        ? 'border-red-500 bg-red-50 text-red-700 shadow-sm'
                        : 'border-border-light bg-bg-white text-text-muted hover:border-red-200'
                    }`}
                    onClick={() => setInvalidateStatus('Absent')}
                  >
                    <Ban size={16} />
                    <span>Tidak Hadir (Absent)</span>
                  </button>
                  <button
                    className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border-2 font-bold text-xs cursor-pointer transition-all ${
                      invalidateStatus === 'Permit'
                        ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                        : 'border-border-light bg-bg-white text-text-muted hover:border-purple-200'
                    }`}
                    onClick={() => setInvalidateStatus('Permit')}
                  >
                    <CalendarOff size={16} />
                    <span>Izin / Sakit (Permit)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Alasan Koreksi</label>
                <textarea
                  className="w-full p-3 border border-border-light rounded-xl text-xs text-text-primary bg-bg-white outline-none focus:border-red-400 resize-none h-20 placeholder:text-text-muted/60"
                  value={invalidateReason}
                  onChange={e => setInvalidateReason(e.target.value)}
                  placeholder="Contoh: Pekerja salah tap check-in, tidak berada di lokasi proyek..."
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                <span>Tindakan ini akan membatalkan jam check-in & check-out pekerja untuk tanggal tersebut dan tercatat di riwayat audit.</span>
              </div>
            </div>

            <div className="p-5 border-t border-border-light bg-bg-secondary flex gap-2.5 justify-end">
              <Button title="Batal" onClick={() => setInvalidateModal(false)} variant="outline" />
              <Button
                title={invalidating ? 'Memproses...' : `Koreksi Jadi ${invalidateStatus === 'Absent' ? 'Tidak Hadir' : 'Izin'}`}
                onClick={handleInvalidate}
                loading={invalidating}
                variant="danger"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
