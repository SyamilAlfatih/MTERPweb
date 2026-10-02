import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, FileSpreadsheet, Search, Filter, ChevronDown,
  ChevronLeft, ChevronRight, ArrowRight, PenLine, CheckCircle, XCircle, Clock,
  Users, TrendingUp, Wallet, Loader, Calendar, Minus,
  X, Plus, Edit3, Building, Check, DollarSign, AlertCircle, Layers,
  Briefcase, ArrowLeft, RefreshCw, Sparkles, Table as TableIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { Card, Button, EmptyState, AriaLiveRegion } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatDate as formatWIBDate,
  todayWIB,
  wibDate,
  DAY_NAMES,
  MONTH_NAMES,
  getProjectWeekRange,
  getManagementMonthRange,
  shiftMonthRange,
  getStoredManagementCutoffDay,
  setStoredManagementCutoffDay,
  DEFAULT_MANAGEMENT_CUTOFF_DAY,
} from '../utils/date';
import { useDataGridKeyboard } from '../hooks/useDataGridKeyboard';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface DayAttendanceData {
  attendanceId?: string;
  status: string;
  score: number;
  overtimeHours: number;
  checkInTime?: string;
  checkOutTime?: string;
  projectId?: string;
  projectName?: string;
  dailyRate?: number;
  overtimePay?: number;
  notes?: string;
  workType?: string;
  officeLocation?: string;
  workSummary?: string;
  permitReason?: string;
}

interface WorkerRecap {
  userId: string;
  fullName: string;
  initials: string;
  role: string;
  position: string;
  dailyRate: number;
  days: Record<string, DayAttendanceData | null>;
  total: string;
  totalScore: number;
  totalOvertimeHours: number;
}

interface RecapSummary {
  totalWorkforce: number;
  avgAttendance: number;
  siteTarget: number;
  pendingPayroll: number;
  totalOvertimeHours: number;
  payrollCycleStart: string;
  payrollCycleEnd: string;
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Project {
  _id: string;
  nama: string;
  lokasi?: string;
  payrollConfig?: {
    cutoffStartDay?: number;
    cutoffEndDay?: number;
  };
}

export default function AttendanceRecap() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  // State
  const [workers, setWorkers] = useState<WorkerRecap[]>([]);
  const [dateColumns, setDateColumns] = useState<string[]>([]);
  const [summary, setSummary] = useState<RecapSummary | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [workforceFilter, setWorkforceFilter] = useState<'all' | 'office' | 'field'>('all');
  const [selectedProject, setSelectedProject] = useState('');

  // Selected project object & cutoff configuration
  const selectedProjectObj = useMemo(() => {
    return projects.find((p) => p._id === selectedProject);
  }, [projects, selectedProject]);

  const cutoffStartDay = selectedProjectObj?.payrollConfig?.cutoffStartDay ?? 1;
  const cutoffEndDay = selectedProjectObj?.payrollConfig?.cutoffEndDay ?? 6;

  // Management staff monthly cutoff configuration
  const [managementCutoffDay, setManagementCutoffDay] = useState<number>(() => getStoredManagementCutoffDay());
  const [mgmtCutoffModal, setMgmtCutoffModal] = useState(false);
  const [editMgmtCutoffDay, setEditMgmtCutoffDay] = useState(managementCutoffDay);

  // Initialize date range using standard cycle (Monday to Saturday)
  const [startDate, setStartDate] = useState(() => {
    const range = getProjectWeekRange(todayWIB(), 1, 6);
    return range.startDate;
  });
  const [endDate, setEndDate] = useState(() => {
    const range = getProjectWeekRange(todayWIB(), 1, 6);
    return range.endDate;
  });

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);

  const handleOpenStartDatePicker = () => {
    try {
      if (startDateInputRef.current && typeof startDateInputRef.current.showPicker === 'function') {
        startDateInputRef.current.showPicker();
      } else {
        startDateInputRef.current?.focus();
      }
    } catch {
      startDateInputRef.current?.focus();
    }
  };

  const handleOpenEndDatePicker = () => {
    try {
      if (endDateInputRef.current && typeof endDateInputRef.current.showPicker === 'function') {
        endDateInputRef.current.showPicker();
      } else {
        endDateInputRef.current?.focus();
      }
    } catch {
      endDateInputRef.current?.focus();
    }
  };

  // Project Cutoff config modal state
  const [configModal, setConfigModal] = useState(false);
  const [configProjId, setConfigProjId] = useState('');
  const [configStartDay, setConfigStartDay] = useState(1);
  const [configEndDay, setConfigEndDay] = useState(6);
  const [configSaving, setConfigSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Navigation: Shift week forward or backward
  const shiftWeek = (dir: number) => {
    const [y, m, d] = startDate.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + dir * 7);
    const range = getProjectWeekRange(date, cutoffStartDay, cutoffEndDay);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    setPage(1);
  };

  // Reset to current week cycle
  const resetToCurrentWeek = () => {
    const range = getProjectWeekRange(todayWIB(), cutoffStartDay, cutoffEndDay);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    setPage(1);
  };

  // Adaptive period shift (Month for management staff, Week for field workers)
  const shiftPeriod = (dir: number) => {
    if (workforceFilter === 'office') {
      const range = shiftMonthRange(startDate, dir, managementCutoffDay);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
      setPage(1);
    } else {
      shiftWeek(dir);
    }
  };

  const resetToCurrentPeriod = () => {
    if (workforceFilter === 'office') {
      const range = getManagementMonthRange(todayWIB(), managementCutoffDay);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
      setPage(1);
    } else {
      resetToCurrentWeek();
    }
  };

  // Handle workforce filter change: auto-switch to monthly for office staff
  const handleWorkforceFilterChange = (filter: 'all' | 'office' | 'field') => {
    setWorkforceFilter(filter);
    setPage(1);
    if (filter === 'office') {
      const mRange = getManagementMonthRange(todayWIB(), managementCutoffDay);
      setStartDate(mRange.startDate);
      setEndDate(mRange.endDate);
    } else {
      const sDay = cutoffStartDay;
      const eDay = cutoffEndDay;
      const range = getProjectWeekRange(todayWIB(), sDay, eDay);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  };

  // Handle saving management monthly cutoff
  const handleSaveMgmtCutoff = () => {
    setStoredManagementCutoffDay(editMgmtCutoffDay);
    setManagementCutoffDay(editMgmtCutoffDay);
    if (workforceFilter === 'office') {
      const range = getManagementMonthRange(todayWIB(), editMgmtCutoffDay);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
      setPage(1);
    }
    setMgmtCutoffModal(false);
    setToastMessage({ type: 'success', text: `Cut-off bulanan staf manajemen disimpan (Tanggal ${editMgmtCutoffDay})!` });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Handle project change: auto-align date range to project cutoff cycle
  const handleProjectChange = (projId: string) => {
    setSelectedProject(projId);
    setPage(1);
    if (projId) {
      const proj = projects.find((p) => p._id === projId);
      const sDay = proj?.payrollConfig?.cutoffStartDay ?? 1;
      const eDay = proj?.payrollConfig?.cutoffEndDay ?? 6;
      const range = getProjectWeekRange(todayWIB(), sDay, eDay);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  };

  // Open cutoff config modal
  const openCutoffConfig = (proj: Project) => {
    setConfigProjId(proj._id);
    setConfigStartDay(proj.payrollConfig?.cutoffStartDay ?? 1);
    setConfigEndDay(proj.payrollConfig?.cutoffEndDay ?? 6);
    setConfigModal(true);
  };

  // Save project cutoff configuration
  const handleSaveCutoffConfig = async () => {
    if (!configProjId) return;
    setConfigSaving(true);
    try {
      await api.put(`/projects/${configProjId}/payroll-config`, {
        cutoffStartDay: configStartDay,
        cutoffEndDay: configEndDay,
      });
      const res = await api.get('/projects');
      setProjects(res.data);
      if (selectedProject === configProjId) {
        const range = getProjectWeekRange(todayWIB(), configStartDay, configEndDay);
        setStartDate(range.startDate);
        setEndDate(range.endDate);
      }
      setConfigModal(false);
      setToastMessage({ type: 'success', text: 'Siklus cut-off mingguan proyek berhasil diperbarui!' });
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      console.error(err);
      setToastMessage({ type: 'error', text: err?.response?.data?.msg || 'Gagal menyimpan konfigurasi.' });
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setConfigSaving(false);
    }
  };

  // Fetch data with optional background/silent refresh (no skeleton flashing)
  const fetchData = async (showLoading: boolean = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await api.get('/attendance/recap-table', {
        params: {
          startDate,
          endDate,
          projectId: selectedProject || undefined,
          search: search || undefined,
          page,
          limit: 10,
          workforceType: workforceFilter !== 'all' ? workforceFilter : undefined,
        },
      });
      setWorkers(response.data.workers);
      setDateColumns(response.data.dateColumns);
      setSummary(response.data.summary);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Failed to fetch recap:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, [startDate, endDate, selectedProject, page, workforceFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchData();
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch projects for filter
  useEffect(() => {
    api.get('/projects').then(res => setProjects(res.data)).catch(err => console.error(err));
  }, []);

  const canEdit = !!user?.role && ['owner', 'president_director', 'operational_director', 'director', 'supervisor', 'site_manager', 'admin_project', 'asset_admin'].includes(user.role);

  const STATUS_CYCLE = ['Present', 'Late', 'Half-day', 'Permit', 'Absent'] as const;

  // Helper to extract HH:mm for <input type="time" />
  const toTimeInputVal = (dateVal?: string | Date, fallback: string = '08:00'): string => {
    if (!dateVal) return fallback;
    if (typeof dateVal === 'string' && /^\d{1,2}:\d{2}$/.test(dateVal.trim())) {
      const [h, m] = dateVal.trim().split(':');
      return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    }
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
    if (isNaN(d.getTime())) return fallback;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
    return parts.replace('.', ':');
  };

  const calculateHoursBetween = (inStr: string, outStr: string): number => {
    if (!inStr || !outStr) return 0;
    const [h1, m1] = inStr.split(':').map(Number);
    const [h2, m2] = outStr.split(':').map(Number);
    if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
    const totalMins = (h2 * 60 + m2) - (h1 * 60 + m1);
    return Math.max(0, Math.round((totalMins / 60) * 10) / 10);
  };

  // Day Adjustment Modal State (Full attendance log sync)
  const [editDayModal, setEditDayModal] = useState<{
    worker: WorkerRecap;
    date: string;
    status: string;
    otHours: number;
    checkInTime: string;
    checkOutTime: string;
    projectId: string;
    overtimeProjectId?: string;
    dailyRate: number;
    notes: string;
  } | null>(null);
  const [isSavingDay, setIsSavingDay] = useState(false);

  const editDayModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(editDayModalRef, {
    isActive: !!editDayModal,
    onEscape: () => setEditDayModal(null),
  });

  const openEditDayModal = (worker: WorkerRecap, date: string) => {
    const dayData = worker.days[date];
    const currentStatus = dayData?.status || 'Present';

    let initialCheckIn = '08:00';
    let initialCheckOut = '17:00';

    if (dayData?.checkInTime) {
      initialCheckIn = toTimeInputVal(dayData.checkInTime, '08:00');
    } else if (currentStatus === 'Late') {
      initialCheckIn = '09:30';
    }

    if (dayData?.checkOutTime) {
      initialCheckOut = toTimeInputVal(dayData.checkOutTime, '17:00');
    } else if (currentStatus === 'Half-day') {
      initialCheckOut = '12:00';
    }

    setEditDayModal({
      worker,
      date,
      status: currentStatus,
      otHours: dayData?.overtimeHours || 0,
      checkInTime: initialCheckIn,
      checkOutTime: initialCheckOut,
      projectId: dayData?.projectId || selectedProject || (projects[0]?._id || ''),
      overtimeProjectId: (dayData as any)?.overtimeProjectId || dayData?.projectId || selectedProject || (projects[0]?._id || ''),
      dailyRate: dayData?.dailyRate || worker.dailyRate || 150000,
      notes: dayData?.notes || dayData?.permitReason || '',
    });
  };

  // Pure function to recalculate full state in exact correspondence with any correction
  const recalculateRecap = (
    currentWorkers: WorkerRecap[],
    cols: string[]
  ): { workers: WorkerRecap[]; summary: RecapSummary } => {
    const recalculatedWorkers = currentWorkers.map((w) => {
      let workerScore = 0;
      let workerOt = 0;

      cols.forEach((d) => {
        const day = w.days[d];
        if (day) {
          const s =
            day.status === 'Present'
              ? 1
              : day.status === 'Late' || day.status === 'Half-day'
              ? 0.5
              : 0;
          day.score = s;
          workerScore += s;
          workerOt += (day.overtimeHours || 0);
        }
      });

      const totalScore = Math.round(workerScore * 10) / 10;
      const totalOvertimeHours = Math.round(workerOt * 10) / 10;
      const total = `${totalScore % 1 === 0 ? totalScore : totalScore.toFixed(1)}/${cols.length}`;

      return {
        ...w,
        totalScore,
        totalOvertimeHours,
        total,
      };
    });

    const totalWorkforce = recalculatedWorkers.length;
    const totalPossibleDays = totalWorkforce * cols.length;
    const totalActualScore = recalculatedWorkers.reduce((sum, w) => sum + w.totalScore, 0);
    const avgAttendance =
      totalPossibleDays > 0 ? Math.round((totalActualScore / totalPossibleDays) * 1000) / 10 : 0;
    const totalOvertimeHours =
      Math.round(recalculatedWorkers.reduce((sum, w) => sum + w.totalOvertimeHours, 0) * 10) / 10;

    let pendingPayroll = 0;
    recalculatedWorkers.forEach((w) => {
      cols.forEach((d) => {
        const day = w.days[d];
        if (day && day.status !== 'Absent' && day.status !== 'Permit') {
          const rate =
            day.dailyRate !== undefined && day.dailyRate > 0 ? day.dailyRate : (w.dailyRate || 150000);
          const dayWage = day.status === 'Half-day' ? Math.round(rate / 2) : rate;
          const otHours = day.overtimeHours || 0;
          const hourlyRate = Math.round(rate / 8);
          const otPay =
            day.overtimePay !== undefined && day.overtimePay > 0
              ? day.overtimePay
              : Math.round(otHours * hourlyRate * 1.5);
          pendingPayroll += dayWage + otPay;
        }
      });
    });

    return {
      workers: recalculatedWorkers,
      summary: {
        totalWorkforce,
        avgAttendance,
        siteTarget: 90,
        pendingPayroll,
        totalOvertimeHours,
        payrollCycleStart: cols[0] || startDate,
        payrollCycleEnd: cols[cols.length - 1] || endDate,
      },
    };
  };

  const handleSaveDayAdjustment = async (
    userId: string,
    date: string,
    data: {
      status: string;
      otHours: number;
      checkInTime: string;
      checkOutTime: string;
      projectId: string;
      overtimeProjectId?: string;
      dailyRate: number;
      notes: string;
    }
  ) => {
    setIsSavingDay(true);

    // Apply the correction to workers state
    const nextWorkers = workers.map((w) => {
      if (w.userId !== userId) return w;
      const oldDay = w.days[date];
      const newScore =
        data.status === 'Present' ? 1 : data.status === 'Late' || data.status === 'Half-day' ? 0.5 : 0;
      const hourlyRate = Math.round((data.dailyRate || w.dailyRate || 150000) / 8);
      const calculatedOtPay = Math.round(data.otHours * hourlyRate * 1.5);

      return {
        ...w,
        dailyRate: data.dailyRate > 0 ? data.dailyRate : w.dailyRate,
        days: {
          ...w.days,
          [date]: {
            ...(oldDay || {}),
            status: data.status,
            score: newScore,
            overtimeHours: data.otHours,
            overtimePay: calculatedOtPay,
            checkInTime: data.checkInTime ? `${date}T${data.checkInTime}:00+07:00` : undefined,
            checkOutTime: data.checkOutTime ? `${date}T${data.checkOutTime}:00+07:00` : undefined,
            projectId: data.projectId,
            dailyRate: data.dailyRate,
            notes: data.notes,
          } as any,
        },
      };
    });

    // Recalculate correspondence of correction immediately!
    const { workers: recalculated, summary: recalculatedSummary } = recalculateRecap(
      nextWorkers,
      dateColumns
    );

    setWorkers(recalculated);
    setSummary(recalculatedSummary);
    setEditDayModal(null);

    // Sync to backend API
    try {
      await api.put('/attendance/recap-table/adjust', {
        userId,
        date,
        status: data.status,
        overtimeHours: data.otHours,
        checkInTime: data.checkInTime,
        checkOutTime: data.checkOutTime,
        projectId: data.projectId || undefined,
        overtimeProjectId: data.overtimeProjectId || undefined,
        dailyRate: data.dailyRate,
        notes: data.notes,
      });
      // Silent refresh without flicker
      await fetchData(false);
    } catch (err) {
      console.error('Failed to adjust attendance/overtime:', err);
      alert('Gagal menyimpan perubahan kehadiran.');
      fetchData(true); // Rollback on error
    } finally {
      setIsSavingDay(false);
    }
  };

  const handleCycleStatus = async (userId: string, date: string) => {
    const targetWorker = workers.find((w) => w.userId === userId);
    if (!targetWorker) return;
    const currentStatus = targetWorker.days[date]?.status || 'Absent';
    const nextIdx = (STATUS_CYCLE.indexOf(currentStatus as any) + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIdx];
    const newScore =
      nextStatus === 'Present' ? 1 : nextStatus === 'Late' || nextStatus === 'Half-day' ? 0.5 : 0;

    const nextWorkers = workers.map((w) => {
      if (w.userId !== userId) return w;
      const oldDay = w.days[date];
      return {
        ...w,
        days: {
          ...w.days,
          [date]: {
            ...(oldDay || {}),
            status: nextStatus,
            score: newScore,
            overtimeHours: oldDay?.overtimeHours || 0,
          } as any,
        },
      };
    });

    const { workers: recalculated, summary: recalculatedSummary } = recalculateRecap(
      nextWorkers,
      dateColumns
    );
    setWorkers(recalculated);
    setSummary(recalculatedSummary);

    // Sync to backend
    try {
      await api.put('/attendance/recap-table/adjust', {
        userId,
        date,
        status: nextStatus,
        projectId: selectedProject || undefined,
        dailyRate: targetWorker.dailyRate || 150000,
      });
      fetchData(false);
    } catch (err) {
      console.error('Failed to adjust attendance:', err);
      fetchData(true); // Rollback on error
    }
  };

  const onCellActivate = (row: number, col: number) => {
    if (!canEdit) return;
    if (col >= 4 && col < 4 + dateColumns.length) {
      const date = dateColumns[col - 4];
      const worker = workers[row];
      if (worker && date) {
        openEditDayModal(worker, date);
      }
    }
  };

  // 2D Matrix Grid Keyboard Navigation
  const gridColCount = 6 + dateColumns.length;
  const { gridProps, getRowProps, getCellProps } = useDataGridKeyboard(workers.length, gridColCount, {
    gridId: 'recap-matrix',
    onActivate: onCellActivate,
  });

  // Formatters
  const formatRp = (val: number) => `Rp ${new Intl.NumberFormat('id-ID').format(val)}`;
  const formatRpShort = (val: number) => {
    if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(1)}B`;
    if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `Rp ${(val / 1_000).toFixed(0)}K`;
    return `Rp ${val}`;
  };

  const renderStatusIcon = (dayData: { status: string; score: number; overtimeHours: number } | null) => {
    if (!dayData) {
      return <Minus size={18} className="text-text-muted opacity-40" />;
    }
    switch (dayData.status) {
      case 'Present':
        return (
          <div className="w-7 h-7 rounded-full bg-[#D1FAE5] flex items-center justify-center">
            <CheckCircle size={16} color="#059669" strokeWidth={2.5} />
          </div>
        );
      case 'Late':
        return (
          <div className="w-7 h-7 rounded-full bg-[#FEF3C7] flex items-center justify-center">
            <Clock size={16} color="#D97706" strokeWidth={2.5} />
          </div>
        );
      case 'Half-day':
        return (
          <div className="w-7 h-7 rounded-full bg-[#EEF2FF] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#6366F1" strokeWidth="1.5" />
              <path d="M8 1A7 7 0 0 1 8 15V1Z" fill="#6366F1" />
            </svg>
          </div>
        );
      case 'Absent':
        return (
          <div className="w-7 h-7 rounded-full bg-[#FEE2E2] flex items-center justify-center">
            <XCircle size={16} color="#DC2626" strokeWidth={2.5} />
          </div>
        );
      case 'Permit':
        return (
          <div className="w-7 h-7 rounded-full bg-[#EDE9FE] flex items-center justify-center">
            <Minus size={16} color="#7C3AED" strokeWidth={2.5} />
          </div>
        );
      default:
        return <Minus size={18} className="text-text-muted opacity-40" />;
    }
  };

  const handleExportExcel = async () => {
    try {
      const response = await api.get('/attendance/recap-table/export-excel', {
        params: {
          startDate,
          endDate,
          projectId: selectedProject || undefined,
          search: search || undefined,
          workforceType: workforceFilter !== 'all' ? workforceFilter : undefined,
        },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance-recap-${startDate}-to-${endDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      console.error('Failed to export excel:', error);
      alert('Failed to export Excel file.');
    }
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    doc.text(`Attendance Recap (${startDate} to ${endDate})`, 14, 15);
    
    // Build table columns
    const columns = [
      t('attendanceRecap.table.no'),
      t('attendanceRecap.table.name').split(' ')[0], // Use short name
      t('attendanceRecap.table.position'),
      t('attendanceRecap.table.dailyWage'),
      ...dateColumns.map(dateStr => {
        const d = wibDate(dateStr);
        return d ? d.getUTCDate().toString().padStart(2, '0') : '-';
      }),
      t('attendanceRecap.table.total')
    ];

    // Build rows
    const rows = workers.map((worker, idx) => {
      const row = [
        (idx + 1).toString().padStart(2, '0'),
        worker.fullName,
        worker.position,
        formatRp(worker.dailyRate),
      ];

      dateColumns.forEach(date => {
        const dayData = worker.days[date];
        let statusText = '-';
        if (dayData) {
          switch (dayData.status) {
            case 'Present': statusText = '✓'; break;
            case 'Late': statusText = 'L'; break;
            case 'Half-day': statusText = '½'; break;
            case 'Absent': statusText = 'X'; break;
            case 'Permit': statusText = 'P'; break;
          }
        }
        row.push(statusText);
      });

      row.push(worker.total);
      return row;
    });

    autoTable(doc, {
      head: [columns],
      body: rows,
      startY: 20,
      styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'left' },
        2: { halign: 'left' },
        3: { halign: 'right' },
      },
    });

    doc.save(`attendance-recap-${startDate}-to-${endDate}.pdf`);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold shadow-sm animate-in fade-in slide-in-from-top-2 duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? (
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-text-muted hover:text-text-primary p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ══════════════ 1. ERP HEADER ══════════════ */}
      <div className="rounded-2xl bg-bg-white border border-border-light p-5 lg:p-6 shadow-sm">
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
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-blue-500 flex items-center justify-center shadow-[0_4px_14px_rgba(67,56,202,0.35)] shrink-0 mt-0.5">
              <TableIcon size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                <span>MTERP</span>
                <span>/</span>
                <span>Operasional Proyek</span>
                <span>/</span>
                <span className="text-indigo-600 font-black">Rekapitulasi Presensi</span>
              </div>
              <h1 className="text-2xl font-black text-text-primary tracking-tight m-0 flex items-center gap-2.5">
                <span>Rekapitulasi Kehadiran & Upah (ERP)</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Matrix Sheet
                </span>
              </h1>
              <p className="text-xs text-text-muted m-0 mt-1 max-w-2xl leading-relaxed">
                Evaluasi kehadiran mingguan, skor kehadiran, lembur pekerja, serta kalkulasi otomatis upah harian sesuai siklus cut-off proyek.
              </p>
            </div>
          </div>

          {/* Quick Actions / Export Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-bg-secondary text-text-primary hover:bg-border-light transition-colors border border-border-light cursor-pointer shadow-xs"
              title={t('attendanceRecap.export.pdf')}
            >
              <Download size={14} className="text-rose-600" />
              <span>Ekspor PDF</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors border border-emerald-200 cursor-pointer shadow-xs"
              title={t('attendanceRecap.export.excel')}
            >
              <FileSpreadsheet size={14} className="text-emerald-700" />
              <span>Ekspor Excel</span>
            </button>
            <button
              onClick={() => fetchData(true)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-bg-secondary text-text-primary hover:bg-border-light transition-colors border border-border-light cursor-pointer"
              title="Refresh data"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════ 2. UNIFIED ERP ACTION & FILTER SUITE ══════════════ */}
      <div className="p-5 rounded-2xl bg-bg-white border border-border-light shadow-sm space-y-4">
        {/* Top Filter Bar: Date Range + Week Shift + Project Filter + Cutoff Cycle Indicator */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period Shift & Unified Date Pill with Interactive Pen Trigger */}
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              <button
                type="button"
                onClick={() => shiftPeriod(-1)}
                className="w-8 h-8 border border-border-light rounded-lg bg-bg-white text-text-secondary flex items-center justify-center transition-all hover:bg-bg-secondary hover:border-primary hover:text-primary active:scale-95 cursor-pointer shadow-xs"
                title={workforceFilter === 'office' ? "Bulan Sebelumnya" : "Siklus Minggu Sebelumnya"}
                aria-label={workforceFilter === 'office' ? "Bulan Sebelumnya" : "Siklus Minggu Sebelumnya"}
              >
                <ChevronLeft size={16} strokeWidth={2.2} />
              </button>

              <div className="flex items-center gap-1.5 px-2 py-1 border border-border-light rounded-lg bg-bg-white shadow-xs focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                {/* Start Date Pill with Pen Logo (No Text) */}
                <div className="flex items-center gap-1 bg-slate-50 hover:bg-slate-100/90 focus-within:bg-white rounded-md px-1.5 py-0.5 border border-slate-200/90 transition-colors group">
                  <button
                    type="button"
                    onClick={handleOpenStartDatePicker}
                    className="p-1 rounded text-indigo-700 hover:bg-indigo-50 active:scale-95 transition-all cursor-pointer shrink-0"
                    title="Pilih Tanggal Mulai"
                    aria-label="Pilih Tanggal Mulai"
                  >
                    <PenLine size={13} className="text-indigo-700 shrink-0 transition-transform group-hover:scale-110" strokeWidth={2.2} />
                  </button>
                  <input
                    ref={startDateInputRef}
                    type="date"
                    className="border-none bg-transparent text-xs font-bold text-slate-800 outline-none w-[114px] cursor-pointer tabular-nums"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                    onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker?.(); } catch {} }}
                    title="Tanggal Mulai (Klik untuk ubah)"
                  />
                </div>

                <ArrowRight size={12} className="text-slate-400 shrink-0" strokeWidth={2.2} />

                {/* End Date Pill with Pen Logo (No Text) */}
                <div className="flex items-center gap-1 bg-slate-50 hover:bg-slate-100/90 focus-within:bg-white rounded-md px-1.5 py-0.5 border border-slate-200/90 transition-colors group">
                  <button
                    type="button"
                    onClick={handleOpenEndDatePicker}
                    className="p-1 rounded text-indigo-700 hover:bg-indigo-50 active:scale-95 transition-all cursor-pointer shrink-0"
                    title="Pilih Tanggal Akhir"
                    aria-label="Pilih Tanggal Akhir"
                  >
                    <PenLine size={13} className="text-indigo-700 shrink-0 transition-transform group-hover:scale-110" strokeWidth={2.2} />
                  </button>
                  <input
                    ref={endDateInputRef}
                    type="date"
                    className="border-none bg-transparent text-xs font-bold text-slate-800 outline-none w-[114px] cursor-pointer tabular-nums"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                    onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker?.(); } catch {} }}
                    title="Tanggal Akhir (Klik untuk ubah)"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => shiftPeriod(1)}
                className="w-8 h-8 border border-border-light rounded-lg bg-bg-white text-text-secondary flex items-center justify-center transition-all hover:bg-bg-secondary hover:border-primary hover:text-primary active:scale-95 cursor-pointer shadow-xs"
                title={workforceFilter === 'office' ? "Bulan Berikutnya" : "Siklus Minggu Berikutnya"}
                aria-label={workforceFilter === 'office' ? "Bulan Berikutnya" : "Siklus Minggu Berikutnya"}
              >
                <ChevronRight size={16} strokeWidth={2.2} />
              </button>

              <button
                type="button"
                onClick={resetToCurrentPeriod}
                className="px-2.5 py-1.5 border border-border-light rounded-lg bg-bg-white text-xs font-bold text-text-secondary hover:bg-bg-secondary hover:text-primary cursor-pointer shadow-xs transition-colors"
                title="Kembali ke siklus saat ini"
              >
                {workforceFilter === 'office' ? 'Bulan Ini' : 'Minggu Ini'}
              </button>
            </div>

            {/* Project Filter with Emoji Indicators */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg bg-bg-white shadow-xs">
              <Briefcase size={14} className="text-text-muted shrink-0" />
              <select
                value={selectedProject}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="border-none bg-transparent text-xs font-semibold text-text-primary outline-none cursor-pointer pr-1 max-w-[220px]"
              >
                <option value="">🏢 Semua Proyek ({projects.length})</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    🏗️ {p.nama} {p.lokasi ? `(${p.lokasi})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Cut-Off Cycle Badge & Trigger */}
            {workforceFilter === 'office' ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50/90 border border-indigo-200 rounded-lg text-xs shadow-xs">
                <span className="text-[11px] font-semibold text-indigo-900">
                  Cut-Off Manajemen: <strong className="text-indigo-950 font-bold">Tanggal {managementCutoffDay}</strong> ({formatWIBDate(startDate)} — {formatWIBDate(endDate)})
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => { setEditMgmtCutoffDay(managementCutoffDay); setMgmtCutoffModal(true); }}
                    className="text-[11px] font-bold text-indigo-700 hover:text-indigo-950 hover:underline cursor-pointer flex items-center gap-1 pl-1.5 border-l border-indigo-300"
                    title="Ubah tanggal cut-off bulanan untuk staf manajemen"
                  >
                    ⚙️ Atur Cut-Off Bulanan
                  </button>
                )}
              </div>
            ) : selectedProjectObj ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50/90 border border-emerald-200 rounded-lg text-xs shadow-xs">
                <span className="text-[11px] font-semibold text-emerald-800">
                  Siklus Proyek: <strong className="text-emerald-950 font-bold">{DAY_NAMES[cutoffStartDay]} — {DAY_NAMES[cutoffEndDay]}</strong>
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openCutoffConfig(selectedProjectObj)}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer flex items-center gap-1 pl-1.5 border-l border-emerald-300"
                    title="Ubah hari awal dan hari cut-off untuk proyek ini"
                  >
                    ⚙️ Atur Cut-Off
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-border-light rounded-lg text-xs text-text-muted shadow-xs">
                <span className="text-[11px]">
                  Siklus Standar: <strong>{DAY_NAMES[cutoffStartDay]} — {DAY_NAMES[cutoffEndDay]}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row: Workforce Category Selector & Search Combobox */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border-light">
          {/* Workforce Category Segmented Selector */}
          <div className="flex items-center gap-1.5 bg-bg-secondary p-1 rounded-xl border border-border-light self-start sm:self-auto">
            <button
              onClick={() => handleWorkforceFilterChange('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                workforceFilter === 'all'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Users size={14} />
              <span>Semua</span>
            </button>
            <button
              onClick={() => handleWorkforceFilterChange('office')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                workforceFilter === 'office'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Building size={14} />
              <span>🏢 Kantor</span>
            </button>
            <button
              onClick={() => handleWorkforceFilterChange('field')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                workforceFilter === 'field'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Layers size={14} />
              <span>👷 Lapangan</span>
            </button>
          </div>

          {/* Search Input with Shortcut and Clear */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama pekerja, jabatan..."
              className="w-full pl-9 pr-14 py-2 border border-border rounded-xl bg-bg-white text-xs font-semibold text-text-primary outline-none transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(30,58,138,0.08)] placeholder:text-text-muted"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="w-4 h-4 flex items-center justify-center rounded-full bg-border-light text-text-muted hover:bg-border hover:text-text-primary transition-colors cursor-pointer"
                  title="Hapus pencarian"
                >
                  <X size={10} />
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-medium text-text-muted bg-bg-secondary border border-border-light rounded pointer-events-none">
                  /
                </kbd>
              )}
            </div>
          </div>
        </div>

        {/* Active Filter Summary Bar */}
        {(selectedProject || workforceFilter !== 'all' || search.trim()) && (
          <div className="flex items-center justify-between text-xs pt-1 border-t border-dashed border-border-light">
            <span className="text-text-muted">
              Filter aktif: {selectedProject ? `Proyek (${selectedProjectObj?.nama || 'Terpilih'})` : ''}
              {workforceFilter !== 'all' ? ` • Kategori: ${workforceFilter === 'office' ? 'Kantor' : 'Lapangan'}` : ''}
              {search.trim() ? ` • Pencarian: "${search}"` : ''}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedProject('');
                setWorkforceFilter('all');
                setSearch('');
                resetToCurrentWeek();
              }}
              className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
            >
              Reset Semua Filter
            </button>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="relative">
        <div id="recap-export-container" className="overflow-x-auto rounded-2xl border-2 border-border-light bg-bg-white shadow-sm">
          <table {...gridProps} className="w-full border-collapse min-w-[1000px] focus:outline-none">
            <thead>
              <tr role="row" className="bg-bg-secondary border-b border-border-light">
                <th role="columnheader" className="sticky left-0 z-20 bg-bg-secondary p-4 text-left w-[50px]">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {t('attendanceRecap.table.no')}
                  </span>
                </th>
                <th role="columnheader" className="sticky left-[50px] z-20 bg-bg-secondary p-4 text-left w-[220px]">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {t('attendanceRecap.table.name')}
                  </span>
                </th>
                <th role="columnheader" className="p-4 text-left w-[140px]">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {t('attendanceRecap.table.position')}
                  </span>
                </th>
                <th role="columnheader" className="p-4 text-right w-[130px]">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {t('attendanceRecap.table.dailyWage')}
                  </span>
                </th>
                {dateColumns.map((dateStr) => {
                  const [y, m, dNum] = dateStr.split('-').map(Number);
                  const d = new Date(Date.UTC(y, m - 1, dNum));
                  const isSunday = d.getUTCDay() === 0;
                  return (
                    <th role="columnheader" key={dateStr} className="p-3 text-center w-[50px] min-w-[50px]">
                      <div className={`text-[9px] font-black leading-none mb-1 ${isSunday ? 'text-red-500' : 'text-text-muted opacity-60'}`}>
                        {formatWIBDate(d, { weekday: 'short' }).toUpperCase()}
                      </div>
                      <div className={`text-base font-black leading-none tabular-nums ${isSunday ? 'text-red-600' : 'text-text-primary'}`}>
                        {d.getUTCDate().toString().padStart(2, '0')}
                      </div>
                    </th>
                  );
                })}
                <th role="columnheader" className="sticky right-[80px] z-20 bg-bg-secondary p-4 text-right w-[80px] shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {t('attendanceRecap.table.total')}
                  </span>
                </th>
                <th role="columnheader" className="sticky right-0 z-20 bg-bg-secondary p-4 text-right w-[80px]">
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                    OT Hrs
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5 + dateColumns.length} className="p-4">
                      <div className="h-8 bg-bg-secondary rounded-lg w-full" />
                    </td>
                  </tr>
                ))
              ) : workers.length === 0 ? (
                <tr>
                  <td colSpan={5 + dateColumns.length} className="p-12">
                    <EmptyState
                      icon={Calendar}
                      title={t('attendanceRecap.empty.title')}
                      description={t('attendanceRecap.empty.description')}
                    />
                  </td>
                </tr>
              ) : (
                workers.map((worker, idx) => (
                  <tr key={worker.userId} {...getRowProps(idx)} className="hover:bg-bg-secondary/50 transition-colors group">
                    <td {...getCellProps(idx, 0)} className="sticky left-0 z-10 bg-bg-white group-hover:bg-bg-secondary/50 p-4 text-xs font-bold text-text-muted transition-colors focus:ring-2 focus:ring-primary focus:outline-none">
                      {(idx + 1 + (page - 1) * 10).toString().padStart(2, '0')}
                    </td>
                    <td {...getCellProps(idx, 1)} className="sticky left-[50px] z-10 bg-bg-white group-hover:bg-bg-secondary/50 p-4 transition-colors focus:ring-2 focus:ring-primary focus:outline-none">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-black shrink-0">
                          {worker.initials}
                        </div>
                        <span className="text-sm font-bold text-text-primary truncate">
                          {worker.fullName}
                        </span>
                      </div>
                    </td>
                    <td {...getCellProps(idx, 2)} className="p-4 focus:ring-2 focus:ring-primary focus:outline-none">
                      <span className="text-sm text-text-secondary font-medium">
                        {worker.position}
                      </span>
                    </td>
                    <td {...getCellProps(idx, 3)} className="p-4 text-right focus:ring-2 focus:ring-primary focus:outline-none">
                      <span className="text-sm font-bold font-mono text-text-primary tabular-nums">
                        {formatRp(worker.dailyRate)}
                      </span>
                    </td>
                    {dateColumns.map((date, dateIdx) => {
                      const dayData = worker.days[date];
                      return (
                        <td
                          key={date}
                          {...getCellProps(idx, 4 + dateIdx)}
                          className={`p-2 text-center focus:ring-2 focus:ring-primary focus:outline-none select-none transition-colors ${
                            canEdit ? 'cursor-pointer hover:bg-primary/10 rounded' : ''
                          }`}
                          onClick={() => canEdit && handleCycleStatus(worker.userId, date)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            if (canEdit) openEditDayModal(worker, date);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (canEdit) openEditDayModal(worker, date);
                          }}
                          title={canEdit ? 'Klik: ubah status | Double-klik / Klik Kanan: atur jam lembur (OT)' : undefined}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            {renderStatusIcon(dayData)}
                            {dayData?.workType && dayData.workType !== 'Project' && (
                              <span className={`text-[8px] font-black uppercase tracking-tight px-1 rounded leading-none ${
                                dayData.workType === 'WFH'
                                  ? 'bg-blue-100 text-blue-800'
                                  : dayData.workType === 'Dinas'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {dayData.workType}
                              </span>
                            )}
                            {(dayData?.overtimeHours || 0) > 0 && (
                              <span className="text-[9px] font-black font-mono text-amber-600 leading-none tabular-nums">
                                +{dayData!.overtimeHours.toFixed(1)}h
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td {...getCellProps(idx, 4 + dateColumns.length)} className="sticky right-[80px] z-10 bg-bg-white group-hover:bg-bg-secondary/50 p-4 text-right shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] transition-colors focus:ring-2 focus:ring-primary focus:outline-none">
                      <span className="text-sm font-black font-mono text-primary tabular-nums">
                        {worker.total}
                      </span>
                    </td>
                    <td {...getCellProps(idx, 5 + dateColumns.length)} className="sticky right-0 z-10 bg-bg-white group-hover:bg-bg-secondary/50 p-4 text-right transition-colors focus:ring-2 focus:ring-primary focus:outline-none">
                      {(worker.totalOvertimeHours || 0) > 0 ? (
                        <span className="text-sm font-black font-mono text-amber-600 tabular-nums">
                          {worker.totalOvertimeHours.toFixed(1)}h
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted opacity-40 font-mono">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* Table Footer: Column Totals & Daily Headcounts (Auto Recalculated) */}
            {workers.length > 0 && !loading && (
              <tfoot className="bg-slate-50 border-t-2 border-border-light text-xs font-bold text-text-primary">
                <tr>
                  <td colSpan={4} className="sticky left-0 z-10 bg-slate-50 p-3.5 text-text-muted uppercase tracking-wider">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-text-primary">Total & Rekap Kolom</span>
                      <span className="text-[11px] font-bold text-text-muted">
                        {workers.length} Pekerja
                      </span>
                    </div>
                  </td>
                  {dateColumns.map((date) => {
                    const presentCount = workers.filter(
                      (w) => w.days[date]?.status === 'Present' || w.days[date]?.status === 'Late' || w.days[date]?.status === 'Half-day'
                    ).length;
                    const otSum = workers.reduce(
                      (sum, w) => sum + (w.days[date]?.overtimeHours || 0),
                      0
                    );
                    return (
                      <td key={date} className="p-2 text-center border-l border-border-light/60">
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className={`text-[11px] font-black font-mono leading-none ${
                              presentCount > 0 ? 'text-primary' : 'text-text-muted/60'
                            }`}
                            title={`${presentCount} pekerja hadir pada ${date}`}
                          >
                            {presentCount}
                          </span>
                          {otSum > 0 && (
                            <span className="text-[9px] font-bold font-mono text-amber-600 leading-none" title={`Total lembur ${otSum.toFixed(1)} jam`}>
                              +{otSum.toFixed(1)}h
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  {/* Total Presence Score */}
                  <td className="sticky right-[80px] z-10 bg-slate-50 p-3.5 text-right shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] border-l border-border-light">
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-black font-mono text-primary tabular-nums">
                        {workers.reduce((sum, w) => sum + w.totalScore, 0).toFixed(1)}
                      </span>
                      <span className="text-[9px] text-text-muted font-normal uppercase leading-tight">Skor Total</span>
                    </div>
                  </td>
                  {/* Total Overtime Hours */}
                  <td className="sticky right-0 z-10 bg-slate-50 p-3.5 text-right border-l border-border-light">
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-black font-mono text-amber-600 tabular-nums">
                        {workers.reduce((sum, w) => sum + (w.totalOvertimeHours || 0), 0).toFixed(1)}h
                      </span>
                      <span className="text-[9px] text-text-muted font-normal uppercase leading-tight">Total Lembur</span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      {pagination && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
          <div className="text-sm text-text-muted font-medium">
            {t('attendanceRecap.pagination.showing')} {' '}
            <span className="text-text-primary font-bold">{(page - 1) * 10 + 1}</span> - {' '}
            <span className="text-text-primary font-bold">{Math.min(page * 10, pagination.total)}</span> {' '}
            {t('attendanceRecap.pagination.of')} {' '}
            <span className="text-text-primary font-bold">{pagination.total}</span> {' '}
            {t('attendanceRecap.pagination.workers')}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-bg-white border-2 border-border-light text-text-muted hover:text-primary hover:border-primary disabled:opacity-30 disabled:hover:border-border-light disabled:hover:text-text-muted transition-all"
            >
              <ChevronLeft size={18} />
            </button>
            {[...Array(pagination.totalPages)].map((_, i) => {
               const p = i + 1;
               if (pagination.totalPages > 5 && Math.abs(p - page) > 1 && p !== 1 && p !== pagination.totalPages) {
                 if (p === 2 || p === pagination.totalPages - 1) return <span key={p} className="px-1 text-text-muted">...</span>;
                 return null;
               }
               return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-10 h-10 rounded-xl text-sm font-heavy transition-all ${
                    page === p
                      ? 'bg-primary text-white shadow-md shadow-primary/20 scale-105'
                      : 'bg-bg-white border-2 border-border-light text-text-secondary hover:border-primary/50'
                  }`}
                >
                  {p}
                </button>
               );
            })}
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-bg-white border-2 border-border-light text-text-muted hover:text-primary hover:border-primary disabled:opacity-30 disabled:hover:border-border-light disabled:hover:text-text-muted transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Legend Card */}
          <Card className="p-5 border-2 border-border-light shadow-sm">
            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-4">
              {t('attendanceRecap.summary.legend')}
            </h3>
            <div className="space-y-3">
              {[
                { label: t('attendanceRecap.status.present'), icon: 'Present' },
                { label: t('attendanceRecap.status.late'), icon: 'Late' },
                { label: t('attendanceRecap.status.halfDay'), icon: 'Half-day' },
                { label: t('attendanceRecap.status.absent'), icon: 'Absent' },
                { label: t('attendanceRecap.status.permit'), icon: 'Permit' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  {renderStatusIcon({ status: item.icon, score: 1, overtimeHours: 0 })}
                  <span className="text-[11px] font-bold text-text-secondary leading-tight">{item.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Workforce Card */}
          <Card className="p-5 border-2 border-border-light shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">
                {t('attendanceRecap.summary.totalWorkforce')}
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-text-primary">{summary.totalWorkforce}</span>
                <span className="text-sm font-bold text-text-secondary">{t('attendanceRecap.summary.active')}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4 text-[#059669]">
              <TrendingUp size={14} />
              <span className="text-[11px] font-bold leading-none">+12 {t('attendanceRecap.summary.fromLastWeek')}</span>
            </div>
          </Card>

          {/* Attendance Rate Card */}
          <Card className="p-5 border-2 border-border-light shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">
                {t('attendanceRecap.summary.avgAttendance')}
              </h3>
              <span className="text-3xl font-black text-primary">{summary.avgAttendance}%</span>
            </div>
            <div className={`flex items-center gap-1.5 mt-4 ${summary.avgAttendance >= summary.siteTarget ? 'text-[#059669]' : 'text-red-500'}`}>
              <div className={`w-2 h-2 rounded-full ${summary.avgAttendance >= summary.siteTarget ? 'bg-[#10B981]' : 'bg-red-500'} animate-pulse`} />
              <span className="text-[11px] font-bold leading-none uppercase">
                {summary.avgAttendance >= summary.siteTarget ? t('attendanceRecap.summary.aboveSiteTarget') : t('attendanceRecap.summary.belowSiteTarget')} ({summary.siteTarget}%)
              </span>
            </div>
          </Card>

          {/* Payroll Card */}
          <Card className="p-5 border-2 border-border-light shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">
                {t('attendanceRecap.summary.pendingPayroll')}
              </h3>
              <span className="text-3xl font-black text-text-primary tabular-nums tracking-tighter">
                {formatRpShort(summary.pendingPayroll)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-4 text-text-muted">
              <Wallet size={14} />
              <span className="text-[11px] font-bold leading-none">
                {t('attendanceRecap.summary.cycle')}: {formatWIBDate(summary.payrollCycleStart, { month: 'short', day: 'numeric' })} - {formatWIBDate(summary.payrollCycleEnd, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          </Card>

          {/* Overtime Hours Card */}
          {(summary.totalOvertimeHours || 0) > 0 && (
            <Card className="p-5 border-2 border-amber-200 bg-amber-50 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">
                  Total Overtime Hours
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-amber-600 tabular-nums">
                    {summary.totalOvertimeHours.toFixed(1)}
                  </span>
                  <span className="text-sm font-bold text-amber-500">hrs</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 text-amber-500">
                <Clock size={14} />
                <span className="text-[11px] font-bold leading-none uppercase">
                  Across {summary.totalWorkforce} worker{summary.totalWorkforce !== 1 ? 's' : ''}
                </span>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Screen Reader Live Region for Async Filters */}
      <AriaLiveRegion
        message={
          loading
            ? 'Memuat data rekap presensi...'
            : `Menampilkan data rekap untuk ${workers.length} pekerja. Periode ${startDate} sampai ${endDate}.`
        }
      />

      {/* Day Adjustment Modal (Full Synchronized Attendance Log Editor) */}
      {editDayModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => !isSavingDay && setEditDayModal(null)}
        >
          <div
            ref={editDayModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="adjust-day-title"
            className="bg-bg-white rounded-2xl max-w-[500px] w-full shadow-2xl overflow-hidden border border-border-light animate-in zoom-in-95 duration-150 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-border-light bg-slate-50 flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary text-white font-black flex items-center justify-center text-sm shadow-xs shrink-0">
                  {editDayModal.worker.initials}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 id="adjust-day-title" className="text-base font-bold text-text-primary m-0">
                      {editDayModal.worker.fullName}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase">
                      {editDayModal.worker.role}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted m-0 mt-0.5 font-medium flex items-center gap-1.5">
                    <Calendar size={13} className="text-primary" />
                    <span>{formatWIBDate(editDayModal.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSavingDay}
                onClick={() => setEditDayModal(null)}
                className="w-8 h-8 rounded-full bg-border-light/60 hover:bg-border-light flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* 1. Status Selection */}
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">
                  Status Kehadiran
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {(['Present', 'Late', 'Half-day', 'Permit', 'Absent'] as const).map((st) => {
                    const isSelected = editDayModal.status === st;
                    const labels: Record<string, { title: string; score: string }> = {
                      Present: { title: 'Hadir', score: '1.0' },
                      Late: { title: 'Telat', score: '0.5' },
                      'Half-day': { title: '½ Hari', score: '0.5' },
                      Permit: { title: 'Izin', score: '0.0' },
                      Absent: { title: 'Alpha', score: '0.0' },
                    };
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => {
                          let nextIn = editDayModal.checkInTime;
                          let nextOut = editDayModal.checkOutTime;
                          if (st === 'Late') {
                            nextIn = '09:30';
                            nextOut = '17:00';
                          } else if (st === 'Half-day') {
                            nextIn = '08:00';
                            nextOut = '12:00';
                          } else if (st === 'Present') {
                            nextIn = '08:00';
                            nextOut = '17:00';
                          }
                          setEditDayModal({
                            ...editDayModal,
                            status: st,
                            checkInTime: nextIn,
                            checkOutTime: nextOut,
                          });
                        }}
                        className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          isSelected
                            ? 'bg-primary text-white border-primary shadow-sm ring-2 ring-primary/20'
                            : 'bg-bg-secondary text-text-secondary border-border-light hover:bg-slate-100'
                        }`}
                      >
                        <span className="leading-tight">{labels[st].title}</span>
                        <span className={`text-[10px] font-mono leading-none ${isSelected ? 'text-white/80' : 'text-text-muted'}`}>
                          ({labels[st].score})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Working Hours (Check-In & Check-Out) - Enabled for Present, Late, Half-day */}
              {['Present', 'Late', 'Half-day'].includes(editDayModal.status) && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-border-light space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={13} className="text-primary" />
                      <span>Jam Kerja (Sinkron Log)</span>
                    </label>
                    <span className="text-[11px] font-bold font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      ⏱ {calculateHoursBetween(editDayModal.checkInTime, editDayModal.checkOutTime)} jam
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-text-muted block mb-1">Jam Masuk (Check-In)</span>
                      <input
                        type="time"
                        value={editDayModal.checkInTime}
                        onChange={(e) => setEditDayModal({ ...editDayModal, checkInTime: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-border-light bg-bg-white font-mono text-sm font-bold text-text-primary focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-text-muted block mb-1">Jam Pulang (Check-Out)</span>
                      <input
                        type="time"
                        value={editDayModal.checkOutTime}
                        onChange={(e) => setEditDayModal({ ...editDayModal, checkOutTime: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-border-light bg-bg-white font-mono text-sm font-bold text-text-primary focus:border-primary outline-none"
                      />
                    </div>
                  </div>

                  {/* Quick Presets */}
                  <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                    <span className="text-[10px] text-text-muted font-bold mr-1">Preset:</span>
                    <button
                      type="button"
                      onClick={() => setEditDayModal({ ...editDayModal, checkInTime: '08:00', checkOutTime: '17:00' })}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-bg-white border border-border-light text-text-secondary hover:bg-slate-100 cursor-pointer"
                    >
                      Full 08-17
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDayModal({ ...editDayModal, checkInTime: '08:00', checkOutTime: '12:00' })}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-bg-white border border-border-light text-text-secondary hover:bg-slate-100 cursor-pointer"
                    >
                      ½ Hari 08-12
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDayModal({ ...editDayModal, checkInTime: '09:30', checkOutTime: '17:00' })}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-bg-white border border-border-light text-text-secondary hover:bg-slate-100 cursor-pointer"
                    >
                      Telat 09:30-17
                    </button>
                  </div>
                </div>
              )}

              {/* 3. Project Assignment */}
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Building size={13} className="text-primary" />
                  <span>Penugasan Proyek</span>
                </label>
                <select
                  value={editDayModal.projectId}
                  onChange={(e) => setEditDayModal({ ...editDayModal, projectId: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-border-light bg-bg-white text-xs font-bold text-text-primary focus:border-primary outline-none"
                >
                  <option value="">Pilih Proyek Lapangan...</option>
                  {projects.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.nama}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Wages & Overtime */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Daily Wage */}
                <div>
                  <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <DollarSign size={13} className="text-emerald-600" />
                    <span>Upah Pokok Harian</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-text-muted">Rp</span>
                    <input
                      type="number"
                      min="0"
                      step="5000"
                      value={editDayModal.dailyRate}
                      disabled={editDayModal.status === 'Absent'}
                      onChange={(e) =>
                        setEditDayModal({
                          ...editDayModal,
                          dailyRate: Math.max(0, parseInt(e.target.value) || 0),
                        })
                      }
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-light bg-bg-white font-mono text-sm font-bold text-text-primary focus:border-primary outline-none disabled:bg-slate-100 disabled:opacity-60"
                      placeholder="150000"
                    />
                  </div>
                </div>

                {/* Overtime Hours */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                      Jam Lembur (OT)
                    </label>
                    <span className="text-xs font-mono font-bold text-amber-600">
                      +{Number(editDayModal.otHours || 0).toFixed(1)} jam
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="16"
                      step="0.5"
                      disabled={editDayModal.status === 'Absent'}
                      value={editDayModal.otHours}
                      onChange={(e) =>
                        setEditDayModal({
                          ...editDayModal,
                          otHours: Math.max(0, Math.min(16, parseFloat(e.target.value) || 0)),
                        })
                      }
                      className="w-20 px-2.5 py-2 rounded-xl border border-border-light bg-bg-white font-mono text-sm font-bold text-text-primary focus:border-primary outline-none disabled:bg-slate-100 disabled:opacity-60 text-center"
                      placeholder="0"
                    />
                    <div className="flex items-center gap-1 flex-1">
                      {[1, 2, 4].map((hrs) => (
                        <button
                          key={hrs}
                          type="button"
                          disabled={editDayModal.status === 'Absent'}
                          onClick={() =>
                            setEditDayModal({
                              ...editDayModal,
                              otHours: (editDayModal.otHours || 0) + hrs,
                            })
                          }
                          className="flex-1 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-mono font-bold border border-amber-200 cursor-pointer transition-colors disabled:opacity-50 text-center"
                        >
                          +{hrs}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={editDayModal.status === 'Absent'}
                        onClick={() => setEditDayModal({ ...editDayModal, otHours: 0 })}
                        className="px-2 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-mono font-bold border border-slate-200 cursor-pointer transition-colors disabled:opacity-50"
                      >
                        0
                      </button>
                    </div>
                  </div>
                </div>

                {/* Overtime Project Allocation */}
                {editDayModal.otHours > 0 && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                    <label className="block text-[11px] font-bold text-amber-900 uppercase">
                      Alokasi Proyek Lembur
                    </label>
                    <select
                      value={editDayModal.overtimeProjectId || ''}
                      onChange={(e) =>
                        setEditDayModal({ ...editDayModal, overtimeProjectId: e.target.value })
                      }
                      className="w-full p-2 rounded-lg border border-amber-300 text-xs font-semibold text-text-primary bg-bg-white outline-none focus:border-amber-600 cursor-pointer"
                    >
                      <option value="">-- Sama dengan Proyek Harian --</option>
                      {projects.map((p) => (
                        <option key={p._id} value={p._id}>
                          🏗️ {p.nama} {p.lokasi ? `(${p.lokasi})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-amber-700 m-0">
                      Pilih jika lembur dikerjakan di proyek berbeda dari jam kerja harian.
                    </p>
                  </div>
                )}
              </div>

              {/* Total Pay Preview Banner */}
              {editDayModal.status !== 'Absent' && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                  <div className="text-emerald-800">
                    <span className="font-medium">Upah: </span>
                    <span className="font-bold font-mono">
                      {formatRp(editDayModal.status === 'Half-day' ? Math.round(editDayModal.dailyRate / 2) : editDayModal.dailyRate)}
                    </span>
                    {editDayModal.otHours > 0 && (
                      <span> + Lembur: <span className="font-bold font-mono">{formatRp(Math.round(editDayModal.otHours * (editDayModal.dailyRate / 8) * 1.5))}</span></span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-emerald-700 uppercase font-black block">Total Upah Hari Ini</span>
                    <span className="text-sm font-black font-mono text-emerald-900">
                      {formatRp(
                        (editDayModal.status === 'Half-day' ? Math.round(editDayModal.dailyRate / 2) : editDayModal.dailyRate) +
                        Math.round(editDayModal.otHours * (editDayModal.dailyRate / 8) * 1.5)
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* 5. Notes / Reason */}
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <FileSpreadsheet size={13} className="text-primary" />
                  <span>{editDayModal.status === 'Permit' ? 'Alasan Izin / Sakit' : 'Catatan Kerja / Keterangan'}</span>
                </label>
                <input
                  type="text"
                  value={editDayModal.notes}
                  onChange={(e) => setEditDayModal({ ...editDayModal, notes: e.target.value })}
                  placeholder={editDayModal.status === 'Permit' ? 'Masukkan alasan izin/sakit (mis: Sakit demam, Izin keluarga)...' : 'Catatan pekerjaan lapangan atau alasan koreksi kehadiran...'}
                  className="w-full px-3 py-2.5 rounded-xl border border-border-light bg-bg-white text-xs text-text-primary focus:border-primary outline-none"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-border-light bg-slate-50 flex items-center gap-3">
              <button
                type="button"
                disabled={isSavingDay}
                onClick={() => setEditDayModal(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-border-light bg-bg-white text-text-secondary hover:bg-bg-secondary text-xs font-bold cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSavingDay}
                onClick={() =>
                  handleSaveDayAdjustment(
                    editDayModal.worker.userId,
                    editDayModal.date,
                    {
                      status: editDayModal.status,
                      otHours: editDayModal.otHours,
                      checkInTime: editDayModal.checkInTime,
                      checkOutTime: editDayModal.checkOutTime,
                      projectId: editDayModal.projectId,
                      dailyRate: editDayModal.dailyRate,
                      notes: editDayModal.notes,
                    }
                  )
                }
                className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-white hover:bg-primary-dark text-xs font-bold shadow-md shadow-primary/20 cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isSavingDay ? (
                  <>
                    <Loader size={14} className="animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Simpan & Sinkron ke Log</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ Project Cutoff Config Modal ══════════════ */}
      {configModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1100] p-4 animate-in fade-in duration-150"
          onClick={() => !configSaving && setConfigModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-recap-cutoff-title"
            className="bg-bg-white rounded-2xl w-[90%] max-w-[440px] shadow-2xl animate-in zoom-in-95 duration-150 overflow-hidden border border-border-light"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 pt-5 pb-0">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-emerald-100 text-emerald-700 font-bold">
                <Briefcase size={20} />
              </div>
              <div>
                <h3 id="modal-recap-cutoff-title" className="text-base font-bold text-text-primary m-0">
                  Siklus Cut-Off Presensi Proyek
                </h3>
                <p className="text-xs text-text-muted m-0 truncate max-w-[280px]">
                  {projects.find((p) => p._id === configProjId)?.nama || 'Proyek'}
                </p>
              </div>
              <button
                type="button"
                className="ml-auto w-8 h-8 border-none bg-bg-secondary rounded-full cursor-pointer flex items-center justify-center text-text-muted hover:bg-border-light transition-colors"
                onClick={() => setConfigModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5">
              <p className="text-xs text-text-muted mb-4 leading-relaxed">
                Tentukan hari mulai dan hari cut-off untuk periode rekapitulasi mingguan proyek ini. Tabel rekapitulasi dan filter tanggal akan otomatis tersinkronisasi.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Hari Mulai (Start)
                  </label>
                  <select
                    value={configStartDay}
                    onChange={(e) => setConfigStartDay(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border-light rounded-xl text-xs font-bold text-text-primary bg-bg-secondary outline-none focus:border-emerald-600 focus:bg-white"
                  >
                    {DAY_NAMES.map((name, idx) => (
                      <option key={idx} value={idx}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Hari Selesai (Cut-Off)
                  </label>
                  <select
                    value={configEndDay}
                    onChange={(e) => setConfigEndDay(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border-light rounded-xl text-xs font-bold text-text-primary bg-bg-secondary outline-none focus:border-emerald-600 focus:bg-white"
                  >
                    {DAY_NAMES.map((name, idx) => (
                      <option key={idx} value={idx}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-900 mb-5">
                <strong>Siklus aktif:</strong> Setiap <strong>{DAY_NAMES[configStartDay]}</strong> s/d <strong>{DAY_NAMES[configEndDay]}</strong>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 py-2.5 border border-border-light bg-bg-white rounded-xl text-xs font-bold text-text-secondary cursor-pointer hover:bg-bg-secondary transition-colors"
                  onClick={() => setConfigModal(false)}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md hover:bg-emerald-700 transition-colors disabled:opacity-60"
                  disabled={configSaving}
                  onClick={handleSaveCutoffConfig}
                >
                  {configSaving ? <Loader size={14} className="animate-spin" /> : 'Simpan Siklus'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Management Monthly Cutoff Modal ===== */}
      {mgmtCutoffModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-recap-mgmt-cutoff-title"
            className="bg-bg-white rounded-2xl w-full max-w-[440px] shadow-2xl overflow-hidden border border-border-light animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-5 border-b border-border-light bg-bg-secondary/40">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Building size={20} />
              </div>
              <div>
                <h3 id="modal-recap-mgmt-cutoff-title" className="text-base font-bold text-text-primary m-0">
                  Cut-Off Bulanan Manajemen
                </h3>
                <p className="text-xs text-text-muted m-0">
                  Konfigurasi siklus rekap presensi staf kantor & direksi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMgmtCutoffModal(false)}
                className="ml-auto w-8 h-8 rounded-lg bg-bg-secondary text-text-muted hover:text-text-primary hover:bg-border-light flex items-center justify-center cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5">
              <p className="text-xs text-text-muted mb-4 leading-relaxed">
                Staf kantor dievaluasi berdasarkan siklus bulanan. Tentukan tanggal cut-off bulanan untuk sinkronisasi otomatis kalender matrix rekapitulasi.
              </p>

              {/* Quick Select Presets */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Pilihan Cepat
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { day: 25, label: 'Tgl 25', sub: '26 s/d 25' },
                    { day: 20, label: 'Tgl 20', sub: '21 s/d 20' },
                    { day: 1, label: 'Tgl 1', sub: '1 s/d Akhir' },
                  ].map((preset) => (
                    <button
                      key={preset.day}
                      type="button"
                      onClick={() => setEditMgmtCutoffDay(preset.day)}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        editMgmtCutoffDay === preset.day
                          ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 font-bold'
                          : 'border-border-light bg-bg-white text-text-secondary hover:bg-bg-secondary'
                      }`}
                    >
                      <div className="text-xs">{preset.label}</div>
                      <div className="text-[10px] text-text-muted">{preset.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Day Slider / Input */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-text-secondary">
                    Tanggal Cut-Off (1 – 31)
                  </label>
                  <span className="text-xs font-bold text-indigo-600 font-mono">
                    Tanggal {editMgmtCutoffDay}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={31}
                  value={editMgmtCutoffDay}
                  onChange={(e) => setEditMgmtCutoffDay(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-text-muted mt-1">
                  <span>Tgl 1 (Kalender)</span>
                  <span>Tgl 15</span>
                  <span>Tgl 25 (Payroll)</span>
                  <span>Tgl 31</span>
                </div>
              </div>

              {/* Live Calculated Range Preview */}
              {(() => {
                const previewRange = getManagementMonthRange(todayWIB(), editMgmtCutoffDay);
                return (
                  <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs text-indigo-950 mb-5 space-y-1">
                    <div className="font-semibold text-indigo-900">
                      Pratinjau Periode Matrix Berjalan:
                    </div>
                    <div className="font-mono text-[11px] text-indigo-800">
                      {formatWIBDate(previewRange.startDate)} — {formatWIBDate(previewRange.endDate)}
                    </div>
                    <div className="text-[10px] text-indigo-700">
                      {previewRange.label}
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 py-2.5 border border-border-light bg-bg-white rounded-xl text-xs font-bold text-text-secondary cursor-pointer hover:bg-bg-secondary transition-colors"
                  onClick={() => setMgmtCutoffModal(false)}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md hover:bg-indigo-700 transition-colors"
                  onClick={handleSaveMgmtCutoff}
                >
                  Simpan Cut-Off
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
