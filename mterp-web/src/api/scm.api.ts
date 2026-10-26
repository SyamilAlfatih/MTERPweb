import { api } from './client';
import {
  CreateToolDTO,
  CreateMaterialRequestDTO,
  AddProjectSupplyDTO,
  ProcurementAuthorizersResponse,
  ProcurementConfigResponse,
  Tool,
  Warehouse,
  ToolMovement,
} from '../types';

// === TOOL MANAGEMENT API ===

export const getToolDashboard = async (search = '') => {
  const response = await api.get(`/tools/dashboard?search=${search}`);
  return response.data;
};

export const assignToolToProject = async (data: {
  toolId: string;
  projectId: string;
  quantity: number;
  notes?: string;
}) => {
  const response = await api.put(`/tools/${data.toolId}/assign`, data);
  return response.data;
};

export const returnToolToWarehouse = async (toolId: string) => {
  const response = await api.put(`/tools/${toolId}/return`);
  return response.data;
};

export const createTool = async (data: CreateToolDTO) => {
  const response = await api.post('/tools', data);
  return response.data;
};

export const updateTool = async (id: string, data: Partial<CreateToolDTO>) => {
  const response = await api.put(`/tools/${id}`, data);
  return response.data;
};

export const deleteTool = async (id: string) => {
  const response = await api.delete(`/tools/${id}`);
  return response.data;
};

export const exportToolsExcel = async (params?: {
  search?: string;
  kondisi?: string;
  projectId?: string;
  columns?: string[];
  headers?: boolean;
}): Promise<void> => {
  const queryParams = new URLSearchParams();
  if (params?.search) queryParams.append('search', params.search);
  if (params?.kondisi && params.kondisi !== 'all') queryParams.append('kondisi', params.kondisi);
  if (params?.projectId) queryParams.append('projectId', params.projectId);
  if (params?.columns && params.columns.length > 0) queryParams.append('columns', params.columns.join(','));
  if (params?.headers !== undefined) queryParams.append('headers', params.headers ? 'true' : 'false');

  const response = await api.get(`/tools/export-excel?${queryParams.toString()}`, {
    responseType: 'blob',
  });
  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute('download', `MTERP_Inventaris_Alat_${dateStr}.xlsx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const downloadToolImportTemplate = async (): Promise<void> => {
  const response = await api.get('/tools/template-excel', {
    responseType: 'blob',
  });
  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'MTERP_Template_Import_Alat.xlsx');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const parseToolsExcel = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/tools/parse-excel', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const commitToolsImport = async (rows: any[], mode: 'skip' | 'update' | 'insert') => {
  const response = await api.post('/tools/import-excel', { rows, mode });
  return response.data;
};

// === WAREHOUSE MASTER DATA API ===

export const getWarehouses = async (params?: { active?: boolean; search?: string }): Promise<Warehouse[]> => {
  const queryParams = new URLSearchParams();
  if (params?.active) queryParams.append('active', 'true');
  if (params?.search) queryParams.append('search', params.search);
  const response = await api.get(`/warehouses?${queryParams.toString()}`);
  return response.data;
};

export const getWarehouse = async (id: string): Promise<Warehouse> => {
  const response = await api.get(`/warehouses/${id}`);
  return response.data;
};

export const createWarehouse = async (data: Partial<Warehouse>): Promise<Warehouse> => {
  const response = await api.post('/warehouses', data);
  return response.data;
};

export const updateWarehouse = async (id: string, data: Partial<Warehouse>): Promise<Warehouse> => {
  const response = await api.put(`/warehouses/${id}`, data);
  return response.data;
};

export const deleteWarehouse = async (id: string): Promise<{ msg: string }> => {
  const response = await api.delete(`/warehouses/${id}`);
  return response.data;
};

// === TOOL MOVEMENT & AUDIT API ===

export const getMyTools = async (): Promise<Tool[]> => {
  const response = await api.get('/tools/my-tools');
  return response.data;
};

export const getToolMovements = async (toolId: string): Promise<ToolMovement[]> => {
  const response = await api.get(`/tools/${toolId}/movements`);
  return response.data;
};

export const recordToolMovement = async (formData: FormData): Promise<{
  success: boolean;
  msg: string;
  tool: Tool;
  movement: ToolMovement;
  purgedCount: number;
}> => {
  const response = await api.post('/tools/movement', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// === MATERIAL REQUESTS API ===

export const createMaterialRequest = async (data: CreateMaterialRequestDTO) => {
  const response = await api.post('/requests', data);
  return response.data;
};

export const updateMaterialRequestStatus = async (id: string, data: { status: string; rejectionReason?: string; passphrase?: string }) => {
  const response = await api.put(`/requests/${id}`, data);
  return response.data;
};

export const reviewMaterialRequest = async (
  id: string,
  data: { notes?: string; passphrase: string; action?: 'approve' | 'reject'; rejectionReason?: string }
) => {
  const response = await api.put(`/requests/${id}/review`, data);
  return response.data;
};

export const opsApproveMaterialRequest = async (id: string, data: { passphrase: string; notes?: string }) => {
  const response = await api.put(`/requests/${id}/ops-approve`, data);
  return response.data;
};

export const submitSupplierComparisons = async (
  id: string,
  data: { comparisons: any[]; assignedFinanceApproverId?: string }
) => {
  const response = await api.put(`/requests/${id}/compare-suppliers`, data);
  return response.data;
};

export const getProcurementAuthorizers = async (): Promise<ProcurementAuthorizersResponse> => {
  const response = await api.get('/requests/authorizers');
  return response.data;
};

export const getProcurementConfig = async (): Promise<ProcurementConfigResponse> => {
  const response = await api.get('/requests/config');
  return response.data;
};

export const updateProcurementConfig = async (data: {
  defaultReviewerId?: string;
  defaultOpsApproverId?: string;
  defaultFinanceApproverId?: string;
  autoAssignEnabled?: boolean;
}): Promise<ProcurementConfigResponse> => {
  const response = await api.put('/requests/config', data);
  return response.data;
};

export const assignProcurementAuthorizers = async (
  id: string,
  data: { assignedReviewerId?: string; assignedOpsApproverId?: string; assignedFinanceApproverId?: string }
) => {
  const response = await api.put(`/requests/${id}/assign-authorizers`, data);
  return response.data;
};

export const financeApproveMaterialRequest = async (id: string, data: { passphrase: string; notes?: string }) => {
  const response = await api.put(`/requests/${id}/finance-approve`, data);
  return response.data;
};

export const dispatchMaterialOrder = async (id: string, formData: FormData) => {
  const response = await api.put(`/requests/${id}/dispatch`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const receiveMaterialOrder = async (id: string, formData: FormData) => {
  const response = await api.put(`/requests/${id}/receive`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const confirmMaterialPayment = async (id: string, formData: FormData) => {
  const response = await api.put(`/requests/${id}/confirm-payment`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const deleteMaterialRequest = async (id: string) => {
  const response = await api.delete(`/requests/${id}`);
  return response.data;
};

// === PROJECT MATERIALS & SUPPLIES API ===

export const addProjectSupply = async (projectId: string, data: AddProjectSupplyDTO) => {
  const response = await api.post(`/projects/${projectId}/supplies`, data);
  return response.data;
};

export const updateProjectSupply = async (projectId: string, supplyId: string, data: Partial<AddProjectSupplyDTO>) => {
  const response = await api.put(`/projects/${projectId}/supplies/${supplyId}`, data);
  return response.data;
};

export const deleteProjectSupply = async (projectId: string, supplyId: string) => {
  const response = await api.delete(`/projects/${projectId}/supplies/${supplyId}`);
  return response.data;
};

export const getProjectSupplies = async (id: string) => {
  const response = await api.get(`/projects/${id}/supplies`);
  return response.data;
};

export const getProjectDailyReports = async (id: string) => {
  const response = await api.get(`/projects/${id}/daily-reports`);
  return response.data;
};

// === PROJECT DOCUMENTS API ===

export const uploadProjectDocuments = async (projectId: string, formData: FormData) => {
  const response = await api.post(`/projects/${projectId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const deleteProjectDocument = async (projectId: string, docId: string) => {
  const response = await api.delete(`/projects/${projectId}/documents/${docId}`);
  return response.data;
};
