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

export type EmploymentType = 'tetap' | 'kontrak' | 'harian_lepas' | 'magang';

export interface EmergencyContact {
  name?: string;
  phone?: string;
  relationship?: string;
}

export interface UserPaymentInfo {
  bankAccount?: string;
  bankPlatform?: string;
  accountName?: string;
}

export interface Education {
  level: string; // 'SD' | 'SMP' | 'SMA/SMK' | 'D1' | 'D2' | 'D3' | 'D4/S1' | 'S2' | 'S3' | 'Lainnya' | ''
  institution?: string;
  major?: string;
  graduationYear?: string;
  documentUrl?: string;
  documentName?: string;
  documentSize?: number;
  uploadedAt?: string;
}

export interface CompetencyCertificate {
  _id?: string;
  name: string;
  issuer?: string;
  certificateNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  documentUrl?: string;
  documentName?: string;
  documentSize?: number;
  uploadedAt?: string;
}

export interface User {
  _id?: string;
  username: string;
  fullName: string;
  email?: string;
  role: string; // worker, tukang, helper, supervisor, site_manager, foreman, asset_admin, admin_project, director, president_director, operational_director, owner
  position?: string;
  employmentType?: EmploymentType;
  contractStartDate?: string;
  contractEndDate?: string;
  emergencyContact?: EmergencyContact;
  paymentInfo?: UserPaymentInfo;
  education?: Education;
  competencies?: CompetencyCertificate[];
  token?: string;
  phone?: string;
  address?: string;
  profileImage?: string;
  profilePhoto?: string;
  isVerified?: boolean;
  createdAt?: string;
}

export interface ApiKey {
  _id: string;
  name: string;
  keyPrefix: string;
  rawKey?: string;
  isActive: boolean;
  createdBy?: { _id: string; fullName: string; username?: string } | string;
  lastUsedAt?: string;
  createdAt: string;
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
  qty: string | number;
  unit?: string;
  projectId?: string;
  dateNeeded: string;
  urgency?: 'Low' | 'Normal' | 'High';
  purpose?: string;
  costEstimate?: number;
}

export interface AddProjectSupplyDTO {
  item: string;
  qty: number;
  unit: string;
  cost: number;
  startDate?: string;
  endDate?: string;
  deadline?: string;
  staffAssigned?: string;
  status?: 'Pending' | 'Ordered' | 'Delivered';
}

export interface MaterialRequest {
  _id?: string;
  id?: string;
  item: string;
  qty: string | number;
  unit?: string;
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
  photo?: string;
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

export interface ProjectDocument {
  _id: string;
  name: string;
  category: 'shopDrawing' | 'hse' | 'manPowerList' | 'materialList' | 'contract' | 'permit' | 'asBuilt' | 'other';
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: { _id: string; fullName: string } | string;
  uploadedAt: string;
}

export type NotificationType =
  | 'task_assigned'
  | 'task_completed'
  | 'request_approved'
  | 'request_rejected'
  | 'kasbon_approved'
  | 'kasbon_rejected'
  | 'daily_report'
  | 'project_created'
  | 'report_approved'
  | 'attendance_permit'
  | 'general';

export interface AppNotification {
  _id: string;
  recipient: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: {
    taskId?: string;
    projectId?: string;
    requestId?: string;
    kasbonId?: string;
    reportId?: string;
  };
  isRead: boolean;
  createdAt: string;
}

// === MS Project-like Project Planning Types ===

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';

export interface ColumnDef {
  id: string;
  label: string;
  width: number;
  minWidth?: number;
  visible: boolean;
  align?: 'left' | 'center' | 'right';
}

export type DependencyType = 'FS' | 'FF' | 'SS' | 'SF';

export interface TaskPredecessor {
  taskId: string | { _id: string; name?: string; wbsCode?: string; sortOrder?: number };
  type: DependencyType;
  lagDays: number;
}

export type ResourceType = 'Work' | 'Material' | 'Cost';

export interface ProjectResource {
  _id: string;
  projectId: string;
  userId?: string | { _id: string; name?: string; role?: string };
  name: string;
  type: ResourceType;
  materialLabel?: string;
  initials?: string;
  group?: string;
  maxUnits: number; // e.g. 100 for 100% (1 worker)
  standardRate: number; // Rp / day or Rp / unit
  overtimeRate?: number;
  costPerUse?: number;
  accrueAt: 'Start' | 'Prorated' | 'End';
  baseCalendar?: string;
  code?: string;
  notes?: string;
  isOverallocated?: boolean;
}

export interface TaskResource {
  userId: string | { _id: string; name?: string; role?: string };
  units: number;
  costRate: number;
}

export interface CalendarException {
  _id?: string;
  name: string;
  startDate: string;
  finishDate: string;
  isWorkingDay: boolean;
}

export interface ProjectCalendar {
  _id?: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  workingDays: number[]; // 1=Mon, ..., 6=Sat, 0=Sun
  hoursPerDay: number;
  exceptions: CalendarException[];
}

export interface TaskBaselineRecord {
  baselineIndex: number;
  name: string;
  startDate: string | null;
  finishDate: string | null;
  duration: number | null;
  cost: number;
  work: number;
  savedAt: string;
}

export type TaskType = 'FixedUnits' | 'FixedDuration' | 'FixedWork';

export interface ProjectTask {
  _id: string;
  projectId: string;
  wbsCode: string;
  outlineLevel: number;
  parentTaskId?: string | null;
  sortOrder: number;
  isSummary: boolean;
  isMilestone: boolean;

  name: string;
  duration: number;
  durationUnit: 'days' | 'weeks' | 'months';
  startDate: string;
  finishDate: string;
  percentComplete: number;

  baselineStart?: string | null;
  baselineFinish?: string | null;
  baselineDuration?: number | null;
  baselineCost?: number | null;

  baselines?: TaskBaselineRecord[];

  predecessors: TaskPredecessor[];

  constraintType?: 'ASAP' | 'ALAP' | 'MSO' | 'MFO' | 'SNET' | 'SNLT' | 'FNET' | 'FNLT';
  constraintDate?: string | null;
  deadlineDate?: string | null;

  calendarId?: string | null;
  taskType?: TaskType;
  isEffortDriven?: boolean;
  levelingDelay?: number;

  assignedResources: TaskResource[];

  plannedCost: number;
  actualCost: number;
  plannedWork: number;
  actualWork: number;
  remainingWork: number;

  barColor?: string;
  notes?: string;
  priority: number;

  isCritical?: boolean;
  totalFloat?: number;
  freeFloat?: number;
  isDeadlineMissed?: boolean;
  isOverallocated?: boolean;
  earlyStart?: string;
  earlyFinish?: string;
  lateStart?: string;
  lateFinish?: string;

  // Client UI state
  isExpanded?: boolean;
  isSelected?: boolean;
  isEditing?: boolean;
}

export interface ProjectPlanSummary {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  notStartedTasks: number;
  milestonesCount: number;
  totalDurationDays: number;
  earliestStartDate: string | null;
  latestFinishDate: string | null;
  overallPercentComplete: number;
  totalPlannedCost: number;
  totalActualCost: number;
  totalPlannedWork: number;
  totalActualWork: number;
  criticalTasksCount: number;
  hasBaseline: boolean;
}

export interface EarnedValueMetrics {
  statusDate: string;
  bac: number;
  bcws: number;
  bcwp: number;
  acwp: number;
  sv: number;
  cv: number;
  spi: number;
  cpi: number;
  eac: number;
  etc: number;
  vac: number;
  tcpi: number;
  totalPlannedCost: number;
  totalActualCost: number;
  overallProgress: number;
}

export interface SCurveDataPoint {
  date: string;
  plannedCumulative: number;
  earnedCumulative: number | null;
  actualCumulative: number | null;
}

export interface SCurveData {
  mode: 'cost' | 'progress';
  statusDate: string;
  dataPoints: SCurveDataPoint[];
  projectEV: EarnedValueMetrics;
}

export interface ExcelImportPreview {
  preview: boolean;
  sheetName: string;
  totalTasks: number;
  columnMapping: Record<string, string | null>;
  sampleTasks: Partial<ProjectTask>[];
  warnings: string[];
}

