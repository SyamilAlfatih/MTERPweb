import { api } from './client';

export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'APPROVE'
  | 'REJECT'
  | 'RETURN'
  | 'EXPORT'
  | 'UPLOAD'
  | 'OTHER';

export interface AuditLogEntry {
  _id: string;
  actorId: string | null;
  actorName: string;
  actorUsername: string;
  actorRole: string;
  action: AuditActionType;
  module: string;
  entityId: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  statusCode: number;
  success: boolean;
  summary: string;
  changes: Record<string, unknown> | null;
  ipAddress: string;
  userAgent: string;
  durationMs: number;
  createdAt: string;
}

export interface AuditLogFilters {
  page?: number;
  limit?: number;
  search?: string;
  module?: string;
  action?: string;
  actorId?: string;
  success?: string;
  startDate?: string;
  endDate?: string;
}

export interface AuditLogsResponse {
  logs: AuditLogEntry[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  filterOptions: {
    modules: string[];
    actions: string[];
  };
}

export interface AuditLogStats {
  totalLogs: number;
  todayLogs: number;
  failedEvents: number;
  loginFailedEvents: number;
  topModules: Array<{ module: string; count: number }>;
  topActors: Array<{
    actorId: string;
    actorName: string;
    actorRole: string;
    count: number;
  }>;
}

export async function getAuditLogs(params: AuditLogFilters = {}): Promise<AuditLogsResponse> {
  const res = await api.get<AuditLogsResponse>('/audit-logs', { params });
  return res.data;
}

export async function getAuditLogStats(): Promise<AuditLogStats> {
  const res = await api.get<AuditLogStats>('/audit-logs/stats');
  return res.data;
}

export async function exportAuditLogsExcel(params: AuditLogFilters = {}): Promise<Blob> {
  const res = await api.get('/audit-logs/export/excel', {
    params,
    responseType: 'blob',
  });
  return res.data;
}

