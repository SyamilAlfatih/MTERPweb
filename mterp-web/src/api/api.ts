import axios from 'axios';

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
      localStorage.removeItem('userData');
      window.location.href = '/';
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

export const createTool = async (data: {
  nama: string;
  kategori?: string;
  stok?: number;
  satuan?: string;
  kondisi?: string;
  lokasi?: string;
}) => {
  const response = await api.post('/tools', data);
  return response.data;
};

export const updateTool = async (id: string, data: Record<string, any>) => {
  const response = await api.put(`/tools/${id}`, data);
  return response.data;
};

export const deleteTool = async (id: string) => {
  const response = await api.delete(`/tools/${id}`);
  return response.data;
};

// === MATERIAL REQUESTS API ===

export const createMaterialRequest = async (data: Record<string, any>) => {
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

export const addProjectSupply = async (projectId: string, data: Record<string, any>) => {
  const response = await api.post(`/projects/${projectId}/supplies`, data);
  return response.data;
};

export const updateProjectSupply = async (projectId: string, supplyId: string, data: Record<string, any>) => {
  const response = await api.put(`/projects/${projectId}/supplies/${supplyId}`, data);
  return response.data;
};

export const deleteProjectSupply = async (projectId: string, supplyId: string) => {
  const response = await api.delete(`/projects/${projectId}/supplies/${supplyId}`);
  return response.data;
};

export default api;
