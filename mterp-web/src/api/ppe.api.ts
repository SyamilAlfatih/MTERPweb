import { api } from './client';

export type PPECategoryKey =
  | 'head_protection'
  | 'foot_leg_protection'
  | 'fall_protection'
  | 'eye_face_protection'
  | 'hand_arm_protection'
  | 'respiratory_protection'
  | 'hearing_protection'
  | 'body_protective_clothing'
  | 'other';

export interface PPERegulationTemplate {
  templateId: string;
  name: string;
  category: PPECategoryKey;
  categoryLabel: string;
  colorCode: string;
  mandatoryZones: string;
  expiryYears: number;
  unit: string;
  standardRegulation: {
    indonesian: string;
    international: string;
    riskLevel: string;
  };
  guide: {
    description: string;
    preUseInspection: string[];
    wearingSteps: string[];
    maintenance: string[];
    dosAndDonts: {
      dos: string[];
      donts: string[];
    };
  };
}

export interface PPEItem {
  _id: string;
  code: string;
  name: string;
  category: PPECategoryKey;
  categoryLabel: string;
  brand?: string;
  modelNumber?: string;
  totalQty: number;
  availableQty: number;
  inUseQty: number;
  damagedQty: number;
  unit: string;
  condition: 'Baik' | 'Cukup Baik' | 'Perlu Servis' | 'Rusak / Afkir';
  warehouseId?: {
    _id: string;
    name: string;
    code: string;
    type?: string;
    address?: string;
    zones?: any[];
    isDefault?: boolean;
  } | string | null;
  binRef?: string;
  location?: string;
  projectId?: {
    _id: string;
    nama: string;
    lokasi?: string;
  } | string | null;
  status: 'active' | 'inactive' | 'disposed';
  photo?: string | null;
  templateId?: string | null;
  standardRegulation: {
    indonesian: string;
    international: string;
    riskLevel: string;
    colorCode?: string;
    mandatoryZones?: string;
  };
  guide: {
    description: string;
    preUseInspection: string[];
    wearingSteps: string[];
    maintenance: string[];
    dosAndDonts: {
      dos: string[];
      donts: string[];
    };
    expiryYears?: number;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FetchPPEItemsParams {
  search?: string;
  category?: string;
  status?: string;
  condition?: string;
  projectId?: string;
  all?: boolean;
  page?: number;
  limit?: number;
}

export type PPETypeKey =
  | 'safety_helmet'
  | 'safety_boots'
  | 'full_body_harness'
  | 'safety_web'
  | 'fall_arrester'
  | 'welding_helmet'
  | 'leather_gloves'
  | string;

export interface PPEGuide {
  id: PPETypeKey;
  name: string;
  category: string;
  standard: string;
  riskLevel: string;
  colorCode: string;
  description: string;
  preUseInspection: string[];
  wearingSteps: string[];
  maintenance: string[];
  dosAndDonts: {
    dos: string[];
    donts: string[];
  };
}

export interface PPEEvidence {
  photo?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  capturedAt?: string | null;
  serverTime?: string | null;
  isManualGpsOverride?: boolean;
  notes?: string;
  photoPurged?: boolean;
  photoPurgedAt?: string | null;
}

export interface PPEHistoryItem {
  _id?: string;
  action: 'check_out' | 'return' | 'condition_check' | 'note_added';
  actionLabel: string;
  timestamp: string;
  byUserId?: {
    _id: string;
    fullName: string;
    role?: string;
    position?: string;
  } | string | null;
  byUserName?: string;
  location?: string;
  condition?: string;
  notes?: string;
  evidence?: {
    photo?: string | null;
    lat?: number | null;
    lng?: number | null;
    accuracy?: number | null;
    capturedAt?: string | null;
    isManualGpsOverride?: boolean;
    photoPurged?: boolean;
  };
}

export interface PPEUsageRecord {
  _id: string;
  workerId: {
    _id: string;
    fullName: string;
    username: string;
    role?: string;
    position?: string;
  } | string;
  workerName: string;
  workerRole?: string;
  projectId?: {
    _id: string;
    nama: string;
    lokasi?: string;
    status?: string;
  } | string | null;
  projectName?: string;
  location?: string;
  ppeItems: PPETypeKey[];
  activityType: string;
  borrowedAt: string;
  expectedReturnDate?: string | null;
  returnedAt?: string | null;
  status: 'in_use' | 'returned' | 'overdue' | 'maintenance_required';
  conditionBefore: string;
  conditionAfter: string;
  inspectedBy?: {
    _id: string;
    fullName: string;
    role?: string;
  } | string | null;
  inspectorName?: string;
  inspectionChecklist?: {
    fitCheck?: boolean;
    shellStrapsIntact?: boolean;
    latchLockSecure?: boolean;
    certifiedStandardChecked?: boolean;
  };
  notes?: string;
  returnNotes?: string;
  photo?: string | null;
  evidence?: PPEEvidence;
  returnEvidence?: PPEEvidence;
  history?: PPEHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PPEStats {
  totalRecords: number;
  activeInUse: number;
  returnedCount: number;
  highRiskCount: number;
  ppeDistribution: Record<PPETypeKey, number>;
  recentInspections: PPEUsageRecord[];
}

export interface FetchPPEUsagesParams {
  status?: string;
  ppeType?: string;
  projectId?: string;
  workerId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export async function getPPEUsages(params?: FetchPPEUsagesParams) {
  const res = await api.get<{
    success: boolean;
    data: PPEUsageRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>('/ppe-usages', { params });
  return res.data;
}

export async function getPPEStats() {
  const res = await api.get<{
    success: boolean;
    stats: PPEStats;
  }>('/ppe-usages/stats');
  return res.data.stats;
}

export async function getPPEGuides() {
  const res = await api.get<{
    success: boolean;
    data: PPEGuide[];
  }>('/ppe-usages/guide');
  return res.data.data;
}

export async function createPPEUsage(
  data:
    | FormData
    | {
        workerId: string;
        projectId?: string;
        ppeItems: PPETypeKey[];
        activityType: string;
        borrowedAt?: string;
        expectedReturnDate?: string;
        conditionBefore?: string;
        location?: string;
        notes?: string;
        inspectionChecklist?: {
          fitCheck: boolean;
          shellStrapsIntact: boolean;
          latchLockSecure: boolean;
          certifiedStandardChecked: boolean;
        };
        lat?: number | null;
        lng?: number | null;
        accuracy?: number | null;
        capturedAt?: string;
        isManualGpsOverride?: boolean;
      }
) {
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
  const res = await api.post<{
    success: boolean;
    msg: string;
    data: PPEUsageRecord;
  }>('/ppe-usages', data, {
    headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
  });
  return res.data;
}

export async function returnPPEUsage(
  id: string,
  data:
    | FormData
    | {
        conditionAfter: string;
        returnNotes?: string;
        returnedAt?: string;
        lat?: number | null;
        lng?: number | null;
        accuracy?: number | null;
        capturedAt?: string;
        isManualGpsOverride?: boolean;
      }
) {
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
  const res = await api.put<{
    success: boolean;
    msg: string;
    data: PPEUsageRecord;
  }>(`/ppe-usages/${id}/return`, data, {
    headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
  });
  return res.data;
}

export async function getPPEUsageHistory(id: string) {
  const res = await api.get<{
    success: boolean;
    data: {
      usageId: string;
      workerName: string;
      workerRole?: string;
      ppeItems: PPETypeKey[];
      projectName?: string;
      location?: string;
      status: string;
      conditionBefore?: string;
      conditionAfter?: string;
      borrowedAt?: string;
      returnedAt?: string;
      inspectorName?: string;
      history: PPEHistoryItem[];
      evidence?: PPEEvidence;
      returnEvidence?: PPEEvidence;
    };
  }>(`/ppe-usages/${id}/history`);
  return res.data.data;
}

export async function deletePPEUsage(id: string) {
  const res = await api.delete<{
    success: boolean;
    msg: string;
  }>(`/ppe-usages/${id}`);
  return res.data;
}

export async function exportPPEUsagesExcel(params?: FetchPPEUsagesParams) {
  const res = await api.get('/ppe-usages/export/excel', {
    params,
    responseType: 'blob',
  });

  const blob = new Blob([res.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `Laporan-Pemakaian-APD-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

// ==========================================
// PPE MASTER CATALOG & REGULATION REPO APIS
// ==========================================

export async function getPPERepoTemplates() {
  const res = await api.get<{
    success: boolean;
    data: PPERegulationTemplate[];
  }>('/ppe-items/repo-templates');
  return res.data.data;
}

export async function getPPEItems(params?: FetchPPEItemsParams) {
  const res = await api.get<{
    success: boolean;
    data: PPEItem[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>('/ppe-items', { params });
  return res.data;
}

export async function getPPEItem(id: string) {
  const res = await api.get<{
    success: boolean;
    data: PPEItem;
  }>(`/ppe-items/${id}`);
  return res.data.data;
}

export async function createPPEItem(data: FormData | Partial<PPEItem>) {
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
  const res = await api.post<{
    success: boolean;
    msg: string;
    data: PPEItem;
  }>('/ppe-items', data, {
    headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
  });
  return res.data;
}

export async function updatePPEItem(id: string, data: FormData | Partial<PPEItem>) {
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
  const res = await api.put<{
    success: boolean;
    msg: string;
    data: PPEItem;
  }>(`/ppe-items/${id}`, data, {
    headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
  });
  return res.data;
}

export async function deletePPEItem(id: string) {
  const res = await api.delete<{
    success: boolean;
    msg: string;
  }>(`/ppe-items/${id}`);
  return res.data;
}

