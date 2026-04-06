// MTERP Types

export interface GlobalDates {
  start: string; // ISO Date yyyy-mm-dd
  end: string;   // ISO Date
}

export interface Resource {
  name: string;
  type: 'Material' | 'Manpower' | 'Tool';
  cost: number;  // Cost in Rupiah
  unit?: string; // e.g. 'sak', 'org', 'unit'
  qty?: number;
}

export interface WorkItem {
  id: number;
  _id?: string;
  name: string;
  qty: number;
  volume: string; // e.g., "M3", "M2"
  unit: string;   // e.g., "M2", "M3", "pcs"
  cost: number;   // Total Cost (Rv) for this item
  weight: number; // Calculated Percentage (Cost / TotalProjectBudget * 100)
  actualCost: number;
  
  // Schedule
  dates: {
    plannedStart: string;
    plannedEnd: string;
    actualStart?: string;
    actualEnd?: string;
  };

  // Logic
  logic: 'Flexible' | 'Semi-flexible' | 'Inflexible';

  // Allocated Resources (Plan)
  resources: Resource[];
  
  // Actuals (Execution)
  actuals: {
    progressPercent: number; // Daily update sum
    costUsed: number;        // Sum of actual resource costs
    resourcesUsed: Resource[]; 
  };
}

export interface ProjectSupply {
  id: string;
  item: string;
  qty: number;
  unit: string;
  cost: number; // Estimated Cost
  staffAssigned: string;
  deadline: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Ordered' | 'Delivered';
  actualPurchaseDate?: string;
  actualCost?: number;
}

export interface ProjectData {
  _id?: string;
  id?: string;
  nama?: string;
  name?: string;
  lokasi?: string;
  location?: string;
  description?: string;
  totalBudget?: number;
  budget?: number;
  progress?: number;
  status?: string;
  
  globalDates?: {
    planned: GlobalDates;
    actual: GlobalDates;
  };
  
  documents?: {
    shopDrawing: any;
    hse: any;
    manPowerList: any;
    workItemsList: any;
    materialList: any;
    toolsList: any;
  };
  
  supplies?: ProjectSupply[];
  workItems?: WorkItem[];
  
  startDate?: string;
  endDate?: string;
}

export interface User {
  _id?: string;
  username: string;
  fullName: string;
  email?: string;
  role: string; // worker, tukang, helper, supervisor, site_manager, foreman, asset_admin, admin_project, director, president_director, operational_director, owner
  token?: string;
  phone?: string;
  address?: string;
  profileImage?: string;
  isVerified?: boolean;
}

export interface CreateToolDTO {
  nama: string;
  kategori?: string;
  stok?: number;
  satuan?: string;
  kondisi?: string;
  lokasi?: string;
}

export interface CreateMaterialRequestDTO {
  item: string;
  qty: string;
  projectId: string;
  dateNeeded: string;
  urgency?: 'Low' | 'Normal' | 'High';
  purpose?: string;
}

export interface AddProjectSupplyDTO {
  item: string;
  qty: number;
  unit: string;
  cost: number;
  deadline: string;
  staffAssigned: string;
}

export interface MaterialRequest {
  _id?: string;
  id?: string;
  item: string;
  qty: string;
  dateNeeded: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedBy: { _id: string; fullName: string; role?: string } | string;
  approvedBy?: { _id: string; fullName: string } | string;
  projectId?: { _id: string; nama: string; lokasi?: string } | string;
  costEstimate?: number;
  purpose?: string;
  urgency?: 'Low' | 'Normal' | 'High';
  rejectionReason?: string;
  createdAt?: string;
}

export interface Tool {
  _id: string;
  nama: string;
  kategori?: string;
  stok: number;
  satuan: string;
  kondisi?: string;
  lokasi?: string;
  qrCode?: string;
  assignedTo?: { _id: string; fullName: string };
  projectId?: { _id: string; nama: string };
  lastChecked?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApprovalItem {
  id: string;
  requester: string;
  role: string;
  item: string;
  qty: string;
  urgency: 'High' | 'Normal' | 'Low';
  date: string;
  project: string;
}

export interface TaskItem {
  id: string;
  title: string;
  loc: string;
  time: string;
  status: 'Pending' | 'Progress' | 'Done';
  priority: 'High' | 'Low';
}

export interface KasbonItem {
  id: string;
  requester: string;
  role: string;
  amount: number;
  reason: string;
  date: string;
}
