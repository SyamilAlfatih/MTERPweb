import { api } from './client';
import { RABItem, LocalPurchase } from '../types';

// ==========================================
// Swakelola SCM - RAB & Local Purchase APIs
// ==========================================

export const getProjectRAB = async (
  projectId: string
): Promise<{ rabItems: RABItem[]; summary: { totalBudget: number; totalRealized: number; totalCommitted: number; realizationPercent: number; itemCount: number } }> => {
  const response = await api.get(`/projects/${projectId}/rab`);
  return response.data;
};

export const createProjectRABItem = async (
  projectId: string,
  items: Partial<RABItem> | Partial<RABItem>[]
): Promise<any> => {
  const payload = Array.isArray(items) ? { items } : items;
  const response = await api.post(`/projects/${projectId}/rab`, payload);
  return response.data;
};

export const updateProjectRABItem = async (
  projectId: string,
  itemId: string,
  itemData: Partial<RABItem>
): Promise<{ success: boolean; rabItem: RABItem }> => {
  const response = await api.put(`/projects/${projectId}/rab/${itemId}`, itemData);
  return response.data;
};

export const getProjectLocalPurchases = async (
  projectId: string,
  params?: { status?: string; rabItemId?: string }
): Promise<{ purchases: LocalPurchase[]; summary: { totalPurchases: number; totalVerified: number; totalPendingVerification: number } }> => {
  const response = await api.get(`/projects/${projectId}/local-purchases`, { params });
  return response.data;
};

export const createLocalPurchase = async (
  projectId: string,
  formData: FormData
): Promise<{ success: boolean; localPurchase: LocalPurchase; rabItem: { id: string; realizedQuantity: number; realizedAmount: number } }> => {
  const response = await api.post(`/projects/${projectId}/local-purchases`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const createBatchLocalPurchase = async (
  projectId: string,
  formData: FormData
): Promise<{ success: boolean; count: number; purchases: LocalPurchase[]; totalAmount: number; msg: string }> => {
  const response = await api.post(`/projects/${projectId}/local-purchases/batch`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const verifyLocalPurchase = async (
  projectId: string,
  purchaseId: string,
  payload: { status: 'VERIFIED' | 'REJECTED'; rejectionReason?: string }
): Promise<{ success: boolean; purchase: LocalPurchase }> => {
  const response = await api.patch(`/projects/${projectId}/local-purchases/${purchaseId}/verify`, payload);
  return response.data;
};
