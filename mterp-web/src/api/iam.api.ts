import { api } from './client';
import {
  User,
  ApiKey,
  MasterApprovalConfigResponse,
  ProcurementConfigResponse,
  SPKLConfigResponse,
} from '../types';

// === USER MANAGEMENT API ===

export const getUsers = async (params?: { search?: string; role?: string; employmentType?: string }) => {
  const response = await api.get('/users', { params });
  return response.data;
};

export const createUser = async (data: Record<string, any>) => {
  const response = await api.post('/users', data);
  return response.data;
};

export const updateUser = async (id: string, data: Partial<User>) => {
  const response = await api.put(`/users/${id}`, data);
  return response.data;
};

export const updateUserRole = async (id: string, role: string) => {
  const response = await api.put(`/users/${id}/role`, { role });
  return response.data;
};

export const verifyUserManually = async (id: string) => {
  const response = await api.put(`/users/${id}/verify`);
  return response.data;
};

export const resetUserPassword = async (
  id: string,
  newPassword?: string
): Promise<{ success: boolean; msg: string; username: string; fullName: string; newPassword: string }> => {
  const response = await api.put(`/users/${id}/reset-password`, { newPassword });
  return response.data;
};

export const deleteUser = async (id: string) => {
  const response = await api.delete(`/users/${id}`);
  return response.data;
};

export const uploadEducationData = async (userId: string, formData: FormData): Promise<User> => {
  const response = await api.post(`/users/${userId}/education`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const deleteEducationProof = async (userId: string): Promise<User> => {
  const response = await api.delete(`/users/${userId}/education/proof`);
  return response.data;
};

export const addCompetencyCertificate = async (userId: string, formData: FormData): Promise<User> => {
  const response = await api.post(`/users/${userId}/competencies`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const updateCompetencyCertificate = async (userId: string, certId: string, formData: FormData): Promise<User> => {
  const response = await api.put(`/users/${userId}/competencies/${certId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const deleteCompetencyCertificate = async (userId: string, certId: string): Promise<User> => {
  const response = await api.delete(`/users/${userId}/competencies/${certId}`);
  return response.data;
};

export const exportUsersExcel = async (columns?: string[], headers = true) => {
  const params = new URLSearchParams();
  if (columns && columns.length > 0) params.append('columns', columns.join(','));
  params.append('headers', headers ? 'true' : 'false');

  const response = await api.get(`/users/export-excel?${params.toString()}`, {
    responseType: 'blob',
  });
  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'pekerja-export.xlsx');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const exportUsersCsv = async (columns?: string[], headers = true) => {
  const params = new URLSearchParams();
  if (columns && columns.length > 0) params.append('columns', columns.join(','));
  params.append('headers', headers ? 'true' : 'false');

  const response = await api.get(`/users/export-csv?${params.toString()}`, {
    responseType: 'blob',
  });
  const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'pekerja-export.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const downloadImportTemplate = async () => {
  const response = await api.get('/users/import-template', {
    responseType: 'blob',
  });
  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'MTERP_Template_Import_Pekerja.xlsx');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const importUsers = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/users/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const bulkCreateUsers = async (users: any[]) => {
  const response = await api.post('/users/bulk', { users });
  return response.data;
};

// === API KEY MANAGEMENT API ===

export const getApiKeys = async (): Promise<ApiKey[]> => {
  const response = await api.get('/apikeys');
  return response.data;
};

export const createApiKey = async (name: string): Promise<ApiKey> => {
  const response = await api.post('/apikeys', { name });
  return response.data;
};

export const updateApiKey = async (id: string, data: { name?: string; isActive?: boolean }): Promise<ApiKey> => {
  const response = await api.put(`/apikeys/${id}`, data);
  return response.data;
};

export const deleteApiKey = async (id: string) => {
  const response = await api.delete(`/apikeys/${id}`);
  return response.data;
};

// === DEDICATED APPROVAL CONFIG API (OWNER ONLY) ===

export const getMasterApprovalConfig = async (): Promise<MasterApprovalConfigResponse> => {
  const response = await api.get('/approval-config');
  return response.data;
};

export const updateMasterProcurementConfig = async (data: {
  defaultReviewerId?: string;
  defaultOpsApproverId?: string;
  defaultFinanceApproverId?: string;
  autoAssignEnabled?: boolean;
}): Promise<ProcurementConfigResponse> => {
  const response = await api.put('/approval-config/procurement', data);
  return response.data;
};

export const updateMasterSpklConfig = async (data: {
  defaultSupervisorId?: string;
  defaultPmId?: string;
  defaultFinanceId?: string;
  autoAssignEnabled?: boolean;
}): Promise<SPKLConfigResponse> => {
  const response = await api.put('/approval-config/spkl', data);
  return response.data;
};
