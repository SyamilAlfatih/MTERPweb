import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollText,
  Search,
  RefreshCw,
  Download,
  ShieldAlert,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Lock,
  Globe,
  User as UserIcon,
} from 'lucide-react';
import { Card, Badge, Button, EmptyState, LoadingOverlay, Alert } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import {
  getAuditLogs,
  getAuditLogStats,
  exportAuditLogsExcel,
  AuditLogEntry,
  AuditLogStats,
  AuditActionType,
} from '../api/auditLogs.api';

const EXECUTIVE_ROLES = ['owner', 'director', 'president_director', 'operational_director'];

const ACTION_BADGE_MAP: Record<
  AuditActionType,
  { variant: 'primary' | 'success' | 'warning' | 'danger' | 'neutral'; label: string }
> = {
  CREATE: { variant: 'success', label: 'CREATE' },
  UPDATE: { variant: 'primary', label: 'UPDATE' },
  DELETE: { variant: 'danger', label: 'DELETE' },
  LOGIN: { variant: 'success', label: 'LOGIN' },
  LOGIN_FAILED: { variant: 'danger', label: 'LOGIN FAILED' },
  LOGOUT: { variant: 'neutral', label: 'LOGOUT' },
  APPROVE: { variant: 'success', label: 'APPROVE' },
  REJECT: { variant: 'danger', label: 'REJECT' },
  RETURN: { variant: 'warning', label: 'RETURN' },
  EXPORT: { variant: 'primary', label: 'EXPORT' },
  UPLOAD: { variant: 'primary', label: 'UPLOAD' },
  OTHER: { variant: 'neutral', label: 'OTHER' },
};

function formatWIBDateTime(iso: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AuditLogs() {
  const { user } = useAuth();
  const isAuthorized = Boolean(user?.role && EXECUTIVE_ROLES.includes(user.role));

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [successFilter, setSuccessFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [availableModules, setAvailableModules] = useState<string[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  // Detail Drawer
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const fetchAuditData = useCallback(async () => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const [logsRes, statsRes] = await Promise.all([
        getAuditLogs({
          page,
          limit: 25,
          search: search.trim() || undefined,
          module: moduleFilter !== 'ALL' ? moduleFilter : undefined,
          action: actionFilter !== 'ALL' ? actionFilter : undefined,
          success: successFilter !== 'ALL' ? successFilter : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
        getAuditLogStats(),
      ]);

      setLogs(logsRes.logs || []);
      setTotalPages(logsRes.pagination?.totalPages || 1);
      setTotalCount(logsRes.pagination?.total || 0);
      setAvailableModules(logsRes.filterOptions?.modules || []);
      setAvailableActions(logsRes.filterOptions?.actions || []);
      setStats(statsRes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data audit logs.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, page, search, moduleFilter, actionFilter, successFilter, startDate, endDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAuditData();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchAuditData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedLog) {
        setSelectedLog(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLog]);

  const handleResetFilters = () => {
    setSearch('');
    setModuleFilter('ALL');
    setActionFilter('ALL');
    setSuccessFilter('ALL');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handleExportExcel = async () => {
    setExporting(true);
    setErrorMsg(null);
    try {
      const blob = await exportAuditLogsExcel({
        search: search.trim() || undefined,
        module: moduleFilter !== 'ALL' ? moduleFilter : undefined,
        action: actionFilter !== 'ALL' ? actionFilter : undefined,
        success: successFilter !== 'ALL' ? successFilter : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MTERP-Audit-Logs-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengekspor Excel.';
      setErrorMsg(msg);
    } finally {
      setExporting(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <EmptyState
          icon={Lock}
          title="Akses Terbatas"
          description="Halaman Audit Logs hanya dapat diakses oleh Owner dan Direksi."
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-5 lg:px-6 py-4 space-y-4">
      <LoadingOverlay visible={loading && logs.length === 0} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800 text-white flex items-center justify-center shrink-0">
            <ScrollText size={20} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-text-primary m-0">
              Audit Logs & Keamanan Sistem
            </h1>
            <p className="text-xs text-text-muted m-0">
              Catatan immutable seluruh perubahan data, persetujuan, dan autentikasi (retensi 365 hari)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            title="Refresh"
            variant="secondary"
            size="small"
            icon={RefreshCw}
            onClick={fetchAuditData}
            loading={loading}
          />
          <Button
            title={exporting ? 'Mengekspor...' : 'Export Excel'}
            variant="primary"
            size="small"
            icon={Download}
            onClick={handleExportExcel}
            loading={exporting}
          />
        </div>
      </div>

      <Alert
        visible={Boolean(errorMsg)}
        type="error"
        title="Terjadi Kesalahan"
        message={errorMsg || ''}
        onClose={() => setErrorMsg(null)}
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Activity size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-text-muted font-medium">Total Event</div>
            <div className="text-xl font-bold text-text-primary">
              {(stats?.totalLogs ?? 0).toLocaleString('id-ID')}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Clock size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-text-muted font-medium">Aktivitas Hari Ini</div>
            <div className="text-xl font-bold text-emerald-600">
              {(stats?.todayLogs ?? 0).toLocaleString('id-ID')}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <XCircle size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-text-muted font-medium">Event Gagal / Ditolak</div>
            <div className="text-xl font-bold text-amber-600">
              {(stats?.failedEvents ?? 0).toLocaleString('id-ID')}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-text-muted font-medium">Login Gagal</div>
            <div className="text-xl font-bold text-rose-600">
              {(stats?.loginFailedEvents ?? 0).toLocaleString('id-ID')}
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-3.5 space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari aktor, username, ringkasan, endpoint, IP..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Filter size={14} />
          </div>

          <select
            value={moduleFilter}
            onChange={(e) => {
              setModuleFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter Modul"
            className="px-2.5 py-2 text-xs sm:text-sm rounded-lg border border-border bg-bg-primary text-text-primary"
          >
            <option value="ALL">Semua Modul</option>
            {availableModules.map((mod) => (
              <option key={mod} value={mod}>
                {mod}
              </option>
            ))}
          </select>

          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter Aksi"
            className="px-2.5 py-2 text-xs sm:text-sm rounded-lg border border-border bg-bg-primary text-text-primary"
          >
            <option value="ALL">Semua Aksi</option>
            {availableActions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>

          <select
            value={successFilter}
            onChange={(e) => {
              setSuccessFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter Status"
            className="px-2.5 py-2 text-xs sm:text-sm rounded-lg border border-border bg-bg-primary text-text-primary"
          >
            <option value="ALL">Semua Status</option>
            <option value="true">Berhasil</option>
            <option value="false">Gagal</option>
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            aria-label="Tanggal Mulai"
            className="px-2.5 py-2 text-xs sm:text-sm rounded-lg border border-border bg-bg-primary text-text-primary"
          />
          <span className="text-xs text-text-muted">s/d</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            aria-label="Tanggal Akhir"
            className="px-2.5 py-2 text-xs sm:text-sm rounded-lg border border-border bg-bg-primary text-text-primary"
          />

          {(search || moduleFilter !== 'ALL' || actionFilter !== 'ALL' || successFilter !== 'ALL' || startDate || endDate) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2.5 py-2 text-xs font-medium text-text-secondary hover:text-text-primary border border-border rounded-lg flex items-center gap-1"
            >
              <X size={13} /> Reset
            </button>
          )}
        </div>
      </Card>

      {/* Logs Table / Empty State */}
      {logs.length === 0 && !loading ? (
        <Card className="p-8">
          <EmptyState
            icon={ScrollText}
            title="Belum Ada Audit Log"
            description="Tidak ada catatan aktivitas yang sesuai dengan filter saat ini."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-bg-secondary/60 text-[11px] uppercase tracking-wider text-text-muted">
                  <th className="py-3 px-4 font-semibold">Waktu (WIB)</th>
                  <th className="py-3 px-4 font-semibold">Aktor</th>
                  <th className="py-3 px-4 font-semibold">Aksi</th>
                  <th className="py-3 px-4 font-semibold">Modul</th>
                  <th className="py-3 px-4 font-semibold">Ringkasan</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">IP / Durasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs sm:text-sm">
                {logs.map((log) => {
                  const actionMeta = ACTION_BADGE_MAP[log.action] || ACTION_BADGE_MAP.OTHER;
                  return (
                    <tr
                      key={log._id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-bg-secondary/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-xs text-text-secondary font-mono">
                        {formatWIBDateTime(log.createdAt)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-text-primary leading-tight">
                          {log.actorName || '-'}
                        </div>
                        <div className="text-[11px] text-text-muted">
                          {log.actorUsername ? `@${log.actorUsername} · ` : ''}
                          {log.actorRole}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge label={actionMeta.label} variant={actionMeta.variant} size="small" />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-bg-secondary text-text-primary text-xs font-mono">
                          {log.module}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-md truncate text-text-primary" title={log.summary}>
                        {log.summary}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {log.success ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <CheckCircle2 size={14} /> {log.statusCode}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                            <XCircle size={14} /> {log.statusCode}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-xs text-text-muted font-mono">
                        <div>{log.ipAddress || '-'}</div>
                        <div className="text-[10px]">{log.durationMs ?? 0} ms</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-border">
            {logs.map((log) => {
              const actionMeta = ACTION_BADGE_MAP[log.action] || ACTION_BADGE_MAP.OTHER;
              return (
                <div
                  key={log._id}
                  onClick={() => setSelectedLog(log)}
                  className="p-3.5 space-y-2 hover:bg-bg-secondary/40 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge label={actionMeta.label} variant={actionMeta.variant} size="small" />
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-bg-secondary text-text-secondary">
                        {log.module}
                      </span>
                    </div>
                    <span className={`text-xs font-semibold ${log.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                      HTTP {log.statusCode}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-text-primary">{log.summary}</div>
                  <div className="flex items-center justify-between text-[11px] text-text-muted">
                    <span>
                      {log.actorName} ({log.actorRole})
                    </span>
                    <span className="font-mono">{formatWIBDateTime(log.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-bg-secondary/30 text-xs text-text-secondary">
            <span>
              Total: <strong>{totalCount.toLocaleString('id-ID')}</strong> log · Halaman{' '}
              <strong>{page}</strong> dari <strong>{totalPages}</strong>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 rounded border border-border bg-bg-primary disabled:opacity-40 flex items-center gap-1"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1.5 rounded border border-border bg-bg-primary disabled:opacity-40 flex items-center gap-1"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Detail Drawer */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex justify-end"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="w-full max-w-xl bg-bg-primary h-full shadow-2xl border-l border-border flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ScrollText size={18} className="text-primary" />
                <div>
                  <h2 className="text-base font-bold text-text-primary m-0">Detail Audit Event</h2>
                  <p className="text-[11px] font-mono text-text-muted m-0">ID: {selectedLog._id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                aria-label="Tutup detail"
                className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  label={(ACTION_BADGE_MAP[selectedLog.action] || ACTION_BADGE_MAP.OTHER).label}
                  variant={(ACTION_BADGE_MAP[selectedLog.action] || ACTION_BADGE_MAP.OTHER).variant}
                />
                <Badge
                  label={selectedLog.success ? `BERHASIL (${selectedLog.statusCode})` : `GAGAL (${selectedLog.statusCode})`}
                  variant={selectedLog.success ? 'success' : 'danger'}
                />
                <span className="px-2 py-0.5 rounded bg-bg-secondary text-xs font-mono text-text-secondary">
                  {selectedLog.module}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-bg-secondary/60 border border-border">
                <div className="text-[11px] uppercase tracking-wider text-text-muted font-semibold mb-1">
                  Ringkasan Aktivitas
                </div>
                <div className="text-sm font-medium text-text-primary">{selectedLog.summary}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-border space-y-1">
                  <div className="flex items-center gap-1.5 text-text-muted font-semibold">
                    <UserIcon size={13} /> Aktor
                  </div>
                  <div className="font-semibold text-text-primary">{selectedLog.actorName}</div>
                  <div className="text-text-muted">
                    @{selectedLog.actorUsername || '-'} · {selectedLog.actorRole}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-border space-y-1">
                  <div className="flex items-center gap-1.5 text-text-muted font-semibold">
                    <Clock size={13} /> Waktu & Durasi
                  </div>
                  <div className="font-mono text-text-primary">
                    {formatWIBDateTime(selectedLog.createdAt)} WIB
                  </div>
                  <div className="text-text-muted">Durasi: {selectedLog.durationMs ?? 0} ms</div>
                </div>

                <div className="p-3 rounded-lg border border-border space-y-1 sm:col-span-2">
                  <div className="flex items-center gap-1.5 text-text-muted font-semibold">
                    <Globe size={13} /> Request Metadata
                  </div>
                  <div className="font-mono text-text-primary break-all">
                    <span className="font-bold">{selectedLog.method}</span> {selectedLog.endpoint}
                  </div>
                  {selectedLog.entityId && (
                    <div className="font-mono text-text-muted">Entity ID: {selectedLog.entityId}</div>
                  )}
                  <div className="text-text-muted">IP: {selectedLog.ipAddress || '-'}</div>
                  {selectedLog.userAgent && (
                    <div className="text-[11px] text-text-muted break-all">
                      UA: {selectedLog.userAgent}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-secondary">
                    Payload / Perubahan Data (Sanitized)
                  </span>
                  <span className="text-[10px] text-text-muted">
                    Data sensitif otomatis di-mask ([REDACTED])
                  </span>
                </div>
                <pre className="p-3.5 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto max-h-80">
                  {selectedLog.changes
                    ? JSON.stringify(selectedLog.changes, null, 2)
                    : '// Tidak ada payload body tercatat'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
