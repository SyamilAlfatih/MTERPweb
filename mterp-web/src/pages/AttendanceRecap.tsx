import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, FileSpreadsheet, Search, Filter, ChevronDown,
  ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock,
  Users, TrendingUp, Wallet, Loader, Calendar, Minus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { Card, Button, EmptyState } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface WorkerRecap {
  userId: string;
  fullName: string;
  initials: string;
  role: string;
  position: string;
  dailyRate: number;
  days: Record<string, { status: string; score: number } | null>;
  total: string;
  totalScore: number;
}

interface RecapSummary {
  totalWorkforce: number;
  avgAttendance: number;
  siteTarget: number;
  pendingPayroll: number;
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
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1); // Monday of current week
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 7); // Sunday of current week
    return d.toISOString().split('T')[0];
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

  // Formatters
  const formatRp = (val: number) => `Rp ${new Intl.NumberFormat('id-ID').format(val)}`;
  const formatRpShort = (val: number) => {
    if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(1)}B`;
    if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `Rp ${(val / 1_000).toFixed(0)}K`;
    return `Rp ${val}`;
  };

  const renderStatusIcon = (dayData: { status: string; score: number } | null) => {
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
      ...dateColumns.map(dateStr => new Date(dateStr).getDate().toString().padStart(2, '0')),
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
          <table className="w-full border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-bg-secondary border-b border-border-light">
                <th className="sticky left-0 z-20 bg-bg-secondary p-4 text-left w-[50px]">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {t('attendanceRecap.table.no')}
                  </span>
                </th>
                <th className="sticky left-[50px] z-20 bg-bg-secondary p-4 text-left w-[220px]">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {t('attendanceRecap.table.name')}
                  </span>
                </th>
                <th className="p-4 text-left w-[140px]">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {t('attendanceRecap.table.position')}
                  </span>
                </th>
                <th className="p-4 text-left w-[130px]">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {t('attendanceRecap.table.dailyWage')}
                  </span>
                </th>
                {dateColumns.map((dateStr) => {
                  const d = new Date(dateStr);
                  const isSunday = d.getDay() === 0;
                  return (
                    <th key={dateStr} className="p-3 text-center w-[50px] min-w-[50px]">
                      <div className={`text-[9px] font-black leading-none mb-1 ${isSunday ? 'text-red-500' : 'text-text-muted opacity-60'}`}>
                        {d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                      </div>
                      <div className={`text-base font-black leading-none tabular-nums ${isSunday ? 'text-red-600' : 'text-text-primary'}`}>
                        {d.getDate().toString().padStart(2, '0')}
                      </div>
                    </th>
                  );
                })}
                <th className="p-4 text-center w-[70px]">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    {t('attendanceRecap.table.total')}
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
                  <tr key={worker.userId} className="hover:bg-bg-secondary/50 transition-colors group">
                    <td className="sticky left-0 z-10 bg-bg-white group-hover:bg-bg-secondary/50 p-4 text-xs font-bold text-text-muted transition-colors">
                      {(idx + 1 + (page - 1) * 10).toString().padStart(2, '0')}
                    </td>
                    <td className="sticky left-[50px] z-10 bg-bg-white group-hover:bg-bg-secondary/50 p-4 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-black shrink-0">
                          {worker.initials}
                        </div>
                        <span className="text-sm font-bold text-text-primary truncate">
                          {worker.fullName}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-sm text-text-secondary font-medium">
                        {worker.position}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-sm font-bold text-text-primary tabular-nums">
                        {formatRp(worker.dailyRate)}
                      </span>
                    </td>
                    {dateColumns.map((date) => (
                      <td key={date} className="p-2 text-center">
                        <div className="flex justify-center">
                          {renderStatusIcon(worker.days[date])}
                        </div>
                      </td>
                    ))}
                    <td className="p-4 text-center">
                      <span className="text-sm font-black text-primary tabular-nums">
                        {worker.total}
                      </span>
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
                  {renderStatusIcon({ status: item.icon, score: 1 })}
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
                {t('attendanceRecap.summary.cycle')}: {new Date(summary.payrollCycleStart).toLocaleDateString([], { month: 'short', day: 'numeric' })} - {new Date(summary.payrollCycleEnd).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
