import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, FileSpreadsheet, Search, Filter, ChevronDown,
  ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock,
  Users, TrendingUp, Wallet, Loader, Calendar, Minus,
  X, Plus, Edit3,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { Card, Button, EmptyState, AriaLiveRegion } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate as formatWIBDate, todayWIB, wibDate } from '../utils/date';
import { useDataGridKeyboard } from '../hooks/useDataGridKeyboard';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface WorkerRecap {
  userId: string;
  fullName: string;
  initials: string;
  role: string;
  position: string;
  dailyRate: number;
  days: Record<string, { status: string; score: number; overtimeHours: number } | null>;
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
  const [selectedProject, setSelectedProject] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const todayStr = todayWIB();
    const [y, m, d] = todayStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const day = date.getUTCDay(); // 0=Sun
    date.setUTCDate(date.getUTCDate() - day); // Sunday of current week
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const todayStr = todayWIB();
    const [y, m, d] = todayStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const day = date.getUTCDay(); // 0=Sun
    date.setUTCDate(date.getUTCDate() - day + 6); // Saturday of current week
    return date.toISOString().split('T')[0];
  });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/attendance/recap-table', {
        params: {
          startDate,
          endDate,
          projectId: selectedProject || undefined,
          search: search || undefined,
          page,
          limit: 10,
        },
      });
      setWorkers(response.data.workers);
      setDateColumns(response.data.dateColumns);
      setSummary(response.data.summary);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Failed to fetch recap:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, selectedProject, page]);

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

  const canEdit = !!user?.role && ['owner', 'president_director', 'operational_director', 'director', 'supervisor', 'asset_admin'].includes(user.role);

  const STATUS_CYCLE = ['Present', 'Late', 'Half-day', 'Permit', 'Absent'] as const;

  // Day Adjustment Modal State (Status & Overtime Hours)
  const [editDayModal, setEditDayModal] = useState<{
    worker: WorkerRecap;
    date: string;
    status: string;
    otHours: number;
  } | null>(null);

  const editDayModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(editDayModalRef, {
    isActive: !!editDayModal,
    onEscape: () => setEditDayModal(null),
  });

  const openEditDayModal = (worker: WorkerRecap, date: string) => {
    const dayData = worker.days[date];
    setEditDayModal({
      worker,
      date,
      status: dayData?.status || 'Present',
      otHours: dayData?.overtimeHours || 0,
    });
  };

  const handleSaveDayAdjustment = async (userId: string, date: string, status: string, overtimeHours: number) => {
    // Optimistic UI update
    setWorkers((prevWorkers) =>
      prevWorkers.map((w) => {
        if (w.userId !== userId) return w;
        const oldDay = w.days[date];
        const newScore =
          status === 'Present' ? 1 : status === 'Late' || status === 'Half-day' ? 0.5 : 0;
        const oldScore = oldDay?.score || 0;
        const scoreDiff = newScore - oldScore;
        const updatedScore = Math.max(0, w.totalScore + scoreDiff);

        const oldOt = oldDay?.overtimeHours || 0;
        const otDiff = overtimeHours - oldOt;
        const updatedTotalOt = Math.max(0, (w.totalOvertimeHours || 0) + otDiff);

        return {
          ...w,
          days: {
            ...w.days,
            [date]: {
              status,
              score: newScore,
              overtimeHours,
            },
          },
          totalScore: updatedScore,
          totalOvertimeHours: updatedTotalOt,
          total: `${updatedScore % 1 === 0 ? updatedScore : updatedScore.toFixed(1)}/${dateColumns.length}`,
        };
      })
    );

    setEditDayModal(null);

    // Sync to backend API
    try {
      await api.put('/attendance/recap-table/adjust', {
        userId,
        date,
        status,
        overtimeHours,
      });
    } catch (err) {
      console.error('Failed to adjust attendance/overtime:', err);
      fetchData(); // Rollback on error
    }
  };

  const handleCycleStatus = async (userId: string, date: string) => {
    const targetWorker = workers.find((w) => w.userId === userId);
    if (!targetWorker) return;
    const currentStatus = targetWorker.days[date]?.status || 'Absent';
    const nextIdx = (STATUS_CYCLE.indexOf(currentStatus as any) + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIdx];

    // Optimistic UI update
    setWorkers((prevWorkers) =>
      prevWorkers.map((w) => {
        if (w.userId !== userId) return w;
        const oldDay = w.days[date];
        const newScore =
          nextStatus === 'Present' ? 1 : nextStatus === 'Late' || nextStatus === 'Half-day' ? 0.5 : 0;
        const oldScore = oldDay?.score || 0;
        const scoreDiff = newScore - oldScore;
        const updatedScore = Math.max(0, w.totalScore + scoreDiff);

        return {
          ...w,
          days: {
            ...w.days,
            [date]: {
              status: nextStatus,
              score: newScore,
              overtimeHours: oldDay?.overtimeHours || 0,
            },
          },
          totalScore: updatedScore,
          total: `${updatedScore % 1 === 0 ? updatedScore : updatedScore.toFixed(1)}/${dateColumns.length}`,
        };
      })
    );

    // Sync to backend
    try {
      await api.put('/attendance/recap-table/adjust', {
        userId,
        date,
        status: nextStatus,
      });
    } catch (err) {
      console.error('Failed to adjust attendance:', err);
      fetchData(); // Rollback on error
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
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight uppercase m-0 leading-tight">
            {t('attendanceRecap.title')}
          </h1>
          <p className="text-sm text-text-muted m-0 mt-1 uppercase font-semibold tracking-wide">
            {t('attendanceRecap.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            title={t('attendanceRecap.export.pdf')}
            variant="outline"
            size="small"
            icon={Download}
            onClick={handleExportPdf}
            className="hidden sm:flex"
          />
          <Button
            title={t('attendanceRecap.export.excel')}
            size="small"
            icon={FileSpreadsheet}
            onClick={handleExportExcel}
            className="flex"
          />
        </div>
      </div>

      {/* Filters Bar */}
      <Card className="p-5 border-2 border-border-light shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Project Selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">
              {t('attendanceRecap.filters.project')}
            </label>
            <div className="relative">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full h-11 bg-bg-secondary border border-border-light rounded-xl px-4 appearance-none text-sm font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-10"
              >
                <option value="">{t('attendanceRecap.filters.allProjects')}</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>{p.nama}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" size={18} />
            </div>
          </div>

          {/* Date Period */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">
              {t('attendanceRecap.filters.period')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 h-11 bg-bg-secondary border border-border-light rounded-xl px-4 text-sm font-semibold text-text-primary focus:outline-none focus:border-primary"
              />
              <span className="text-xs text-text-muted font-bold uppercase">{t('attendanceRecap.filters.periodTo')}</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 h-11 bg-bg-secondary border border-border-light rounded-xl px-4 text-sm font-semibold text-text-primary focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Worker Search */}
          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">
              {t('attendanceRecap.filters.worker')}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('attendanceRecap.filters.workerPlaceholder')}
                  className="w-full h-11 bg-bg-secondary border border-border-light rounded-xl pl-11 pr-4 text-sm font-semibold text-text-primary focus:outline-none focus:border-primary"
                />
              </div>
              <button className="h-11 w-11 flex items-center justify-center bg-bg-secondary border border-border-light rounded-xl text-text-muted hover:text-primary hover:border-primary transition-all">
                <Filter size={18} />
              </button>
            </div>
          </div>
        </div>
      </Card>

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

      {/* Day Adjustment Modal (Status & Overtime Hours) */}
      {editDayModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-150"
          onClick={() => setEditDayModal(null)}
        >
          <div
            ref={editDayModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="adjust-day-title"
            className="bg-bg-white rounded-2xl max-w-[420px] w-full shadow-2xl overflow-hidden border border-border-light animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border-light bg-slate-50 flex justify-between items-center">
              <div>
                <h3 id="adjust-day-title" className="text-base font-bold text-text-primary m-0">
                  Ubah Kehadiran & Lembur
                </h3>
                <p className="text-xs text-text-muted m-0 mt-0.5 font-medium">
                  {editDayModal.worker.fullName} • {formatWIBDate(editDayModal.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditDayModal(null)}
                className="w-8 h-8 rounded-full bg-border-light/60 hover:bg-border-light flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Status Selection */}
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">
                  Status Kehadiran
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Present', 'Late', 'Half-day', 'Permit', 'Absent'] as const).map((st) => {
                    const isSelected = editDayModal.status === st;
                    const labels: Record<string, string> = {
                      Present: 'Hadir (1.0)',
                      Late: 'Telat (0.5)',
                      'Half-day': '½ Hari (0.5)',
                      Permit: 'Izin (0.0)',
                      Absent: 'Alpha (0.0)',
                    };
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setEditDayModal({ ...editDayModal, status: st })}
                        className={`px-2.5 py-2 rounded-lg text-xs font-bold border transition-all text-center cursor-pointer ${
                          isSelected
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-bg-secondary text-text-secondary border-border-light hover:bg-slate-100'
                        }`}
                      >
                        {labels[st]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Overtime Hours */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider">
                    Jam Lembur (Overtime)
                  </label>
                  <span className="text-xs font-mono font-bold text-amber-600">
                    +{Number(editDayModal.otHours || 0).toFixed(1)} jam
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="16"
                    step="0.5"
                    value={editDayModal.otHours}
                    onChange={(e) =>
                      setEditDayModal({
                        ...editDayModal,
                        otHours: Math.max(0, Math.min(16, parseFloat(e.target.value) || 0)),
                      })
                    }
                    className="flex-1 px-3 py-2 border-2 border-border-light rounded-xl font-mono text-base font-bold text-text-primary bg-bg-white focus:border-primary outline-none"
                    placeholder="0"
                  />
                  <div className="flex items-center gap-1">
                    {[1, 2, 4].map((hrs) => (
                      <button
                        key={hrs}
                        type="button"
                        onClick={() =>
                          setEditDayModal({
                            ...editDayModal,
                            otHours: (editDayModal.otHours || 0) + hrs,
                          })
                        }
                        className="px-2.5 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-mono font-bold border border-amber-200 cursor-pointer transition-colors"
                      >
                        +{hrs}h
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEditDayModal({ ...editDayModal, otHours: 0 })}
                      className="px-2.5 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-mono font-bold border border-slate-200 cursor-pointer transition-colors"
                    >
                      0h
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditDayModal(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-border-light bg-bg-white text-text-secondary hover:bg-bg-secondary text-sm font-semibold cursor-pointer transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSaveDayAdjustment(
                      editDayModal.worker.userId,
                      editDayModal.date,
                      editDayModal.status,
                      editDayModal.otHours
                    )
                  }
                  className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-white hover:bg-primary-dark text-sm font-bold shadow-md shadow-primary/20 cursor-pointer transition-colors"
                >
                  Simpan Perubahan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
