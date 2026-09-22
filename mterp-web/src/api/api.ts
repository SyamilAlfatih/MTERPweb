import axios from 'axios';
import {
  CreateToolDTO,
  CreateMaterialRequestDTO,
  AddProjectSupplyDTO,
  User,
  ApiKey,
  ProjectTask,
  TaskPredecessor,
  ProjectPlanSummary,
  ProjectCalendar,
  ProjectResource,
  EarnedValueMetrics,
  SCurveData,
  ExcelImportPreview,
} from '../types';

// API Base URL - use local backend or production
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth interceptor to add Bearer token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('userToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('userToken');
      // Replace window.location.href = '/' with a custom event
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

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

// === MATERIAL REQUESTS API ===

export const createMaterialRequest = async (data: CreateMaterialRequestDTO) => {
  const response = await api.post('/requests', data);
  return response.data;
};

export const updateMaterialRequestStatus = async (id: string, data: { status: string; rejectionReason?: string; passphrase?: string }) => {
  const response = await api.put(`/requests/${id}`, data);
  return response.data;
};

export const deleteMaterialRequest = async (id: string) => {
  const response = await api.delete(`/requests/${id}`);
  return response.data;
};

// === PROJECT MATERIALS API ===

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

// === NOTIFICATIONS API ===

export const getNotifications = async (page = 1, limit = 20) => {
  const response = await api.get(`/notifications?page=${page}&limit=${limit}`);
  return response.data;
};

export const getUnreadCount = async () => {
  const response = await api.get('/notifications/unread-count');
  return response.data;
};

export const markNotificationRead = async (id: string) => {
  const response = await api.put(`/notifications/${id}/read`);
  return response.data;
};

export const markAllNotificationsRead = async () => {
  const response = await api.put('/notifications/read-all');
  return response.data;
};

export const deleteNotification = async (id: string) => {
  const response = await api.delete(`/notifications/${id}`);
  return response.data;
};

export const clearReadNotifications = async () => {
  const response = await api.delete('/notifications/clear');
  return response.data;
};

// === PROJECT PLAN (MS Project) API ===

export const getProjectPlanTasks = async (projectId: string): Promise<{ success: boolean; count: number; tasks: ProjectTask[] }> => {
  const response = await api.get(`/projects/${projectId}/plan/tasks`);
  return response.data;
};

export const createProjectPlanTask = async (
  projectId: string,
  data: Partial<ProjectTask>
): Promise<{ success: boolean; task: ProjectTask; tasks: ProjectTask[] }> => {
  const response = await api.post(`/projects/${projectId}/plan/tasks`, data);
  return response.data;
};

export const updateProjectPlanTask = async (
  projectId: string,
  taskId: string,
  data: Partial<ProjectTask>
): Promise<{ success: boolean; task: ProjectTask; tasks: ProjectTask[] }> => {
  const response = await api.put(`/projects/${projectId}/plan/tasks/${taskId}`, data);
  return response.data;
};

export const deleteProjectPlanTask = async (
  projectId: string,
  taskId: string
): Promise<{ success: boolean; deletedCount: number; tasks: ProjectTask[] }> => {
  const response = await api.delete(`/projects/${projectId}/plan/tasks/${taskId}`);
  return response.data;
};

export const indentProjectTask = async (
  projectId: string,
  taskId: string
): Promise<{ success: boolean; tasks: ProjectTask[] }> => {
  const response = await api.put(`/projects/${projectId}/plan/tasks/${taskId}/indent`);
  return response.data;
};

export const outdentProjectTask = async (
  projectId: string,
  taskId: string
): Promise<{ success: boolean; tasks: ProjectTask[] }> => {
  const response = await api.put(`/projects/${projectId}/plan/tasks/${taskId}/outdent`);
  return response.data;
};

export const moveProjectTask = async (
  projectId: string,
  taskId: string,
  newSortOrder: number
): Promise<{ success: boolean; tasks: ProjectTask[] }> => {
  const response = await api.put(`/projects/${projectId}/plan/tasks/${taskId}/move`, { newSortOrder });
  return response.data;
};

export const setProjectTaskPredecessors = async (
  projectId: string,
  taskId: string,
  predecessors: TaskPredecessor[]
): Promise<{ success: boolean; task: ProjectTask; tasks: ProjectTask[] }> => {
  const response = await api.put(`/projects/${projectId}/plan/tasks/${taskId}/predecessors`, { predecessors });
  return response.data;
};

export const setProjectBaseline = async (
  projectId: string,
  baselineIndex: number = 0,
  name?: string
): Promise<{ success: boolean; msg: string; baselineIndex: number; tasks: ProjectTask[] }> => {
  const response = await api.post(`/projects/${projectId}/plan/baseline/${baselineIndex}`, { name });
  return response.data;
};

export const clearProjectBaseline = async (
  projectId: string,
  baselineIndex: number = 0
): Promise<{ success: boolean; msg: string; baselineIndex: number; tasks: ProjectTask[] }> => {
  const response = await api.delete(`/projects/${projectId}/plan/baseline/${baselineIndex}`);
  return response.data;
};

export const getProjectCalendar = async (
  projectId: string
): Promise<{ success: boolean; calendar: ProjectCalendar }> => {
  const response = await api.get(`/projects/${projectId}/plan/calendar`);
  return response.data;
};

export const updateProjectCalendar = async (
  projectId: string,
  data: Partial<ProjectCalendar>
): Promise<{ success: boolean; calendar: ProjectCalendar; tasks: ProjectTask[] }> => {
  const response = await api.put(`/projects/${projectId}/plan/calendar`, data);
  return response.data;
};

export const recalculateProjectSchedule = async (
  projectId: string
): Promise<{ success: boolean; tasks: ProjectTask[] }> => {
  const response = await api.post(`/projects/${projectId}/plan/recalculate`);
  return response.data;
};

export const importWorkItemsToPlan = async (
  projectId: string
): Promise<{ success: boolean; importedCount: number; tasks: ProjectTask[] }> => {
  const response = await api.post(`/projects/${projectId}/plan/import-workitems`);
  return response.data;
};

export const getProjectCriticalPath = async (
  projectId: string
): Promise<{ success: boolean; count: number; criticalTaskIds: string[]; criticalTasks: ProjectTask[] }> => {
  const response = await api.get(`/projects/${projectId}/plan/critical-path`);
  return response.data;
};

export const getProjectPlanSummary = async (
  projectId: string
): Promise<{ success: boolean; summary: ProjectPlanSummary }> => {
  const response = await api.get(`/projects/${projectId}/plan/summary`);
  return response.data;
};

export const getProjectResources = async (
  projectId: string
): Promise<{ success: boolean; count: number; resources: ProjectResource[] }> => {
  const response = await api.get(`/projects/${projectId}/plan/resources`);
  return response.data;
};

export const createProjectResource = async (
  projectId: string,
  data: Partial<ProjectResource>
): Promise<{ success: boolean; resource: ProjectResource }> => {
  const response = await api.post(`/projects/${projectId}/plan/resources`, data);
  return response.data;
};

export const updateProjectResource = async (
  projectId: string,
  resourceId: string,
  data: Partial<ProjectResource>
): Promise<{ success: boolean; resource: ProjectResource }> => {
  const response = await api.put(`/projects/${projectId}/plan/resources/${resourceId}`, data);
  return response.data;
};

export const deleteProjectResource = async (
  projectId: string,
  resourceId: string
): Promise<{ success: boolean; msg: string }> => {
  const response = await api.delete(`/projects/${projectId}/plan/resources/${resourceId}`);
  return response.data;
};

export const levelProjectResources = async (
  projectId: string
): Promise<{ success: boolean; msg: string; tasks: ProjectTask[] }> => {
  const response = await api.post(`/projects/${projectId}/plan/level-resources`);
  return response.data;
};

// Earned Value Management (EVM)
export const getProjectEarnedValue = async (
  projectId: string,
  statusDate?: string
): Promise<{ success: boolean; earnedValue: EarnedValueMetrics }> => {
  const params = statusDate ? { statusDate } : {};
  const response = await api.get(`/projects/${projectId}/plan/earned-value`, { params });
  return response.data;
};

// S-Curve (Kurva S)
export const getProjectSCurve = async (
  projectId: string,
  mode: 'cost' | 'progress' = 'cost',
  statusDate?: string
): Promise<{ success: boolean; scurve: SCurveData }> => {
  const params: any = { mode };
  if (statusDate) params.statusDate = statusDate;
  const response = await api.get(`/projects/${projectId}/plan/s-curve`, { params });
  return response.data;
};

// Export to Excel
export const exportProjectExcel = async (projectId: string): Promise<void> => {
  const response = await api.get(`/projects/${projectId}/plan/export-excel`, {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `ProjectPlan_${new Date().toISOString().split('T')[0]}.xlsx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// Export to MS Project XML
export const exportProjectXML = async (projectId: string): Promise<void> => {
  const response = await api.get(`/projects/${projectId}/plan/export-xml`, {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `ProjectPlan_${new Date().toISOString().split('T')[0]}.xml`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// Import from Excel
export const importProjectExcel = async (
  projectId: string,
  file: File,
  mode: 'preview' | 'commit' = 'preview',
  replace: boolean = false
): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/projects/${projectId}/plan/import-excel`, formData, {
    params: { mode, replace: String(replace) },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// Import from MS Project XML
export const importProjectXML = async (
  projectId: string,
  file: File,
  mode: 'preview' | 'commit' = 'preview',
  replace: boolean = false
): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/projects/${projectId}/plan/import-xml`, formData, {
    params: { mode, replace: String(replace) },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export default api;

