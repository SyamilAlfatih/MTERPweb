import { api } from './client';
import {
  ProjectTask,
  TaskPredecessor,
  ProjectPlanSummary,
  ProjectCalendar,
  ProjectResource,
  EarnedValueMetrics,
  SCurveData,
} from '../types';

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
