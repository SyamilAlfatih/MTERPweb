import axios from 'axios';
import { CreateToolDTO, CreateMaterialRequestDTO, AddProjectSupplyDTO } from '../types';

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

export const updateMaterialRequestStatus = async (id: string, data: { status: string; rejectionReason?: string }) => {
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

export const getUsers = async () => {
  const response = await api.get('/users');
  return response.data;
};

export const createUser = async (data: Record<string, any>) => {
  const response = await api.post('/users', data);
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

export default api;
