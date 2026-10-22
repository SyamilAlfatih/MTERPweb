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
  startDate?: string;
  endDate?: string;
  
  // Schedule
  dates?: {
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
  _id: string;
  id?: string;
  item: string;
  qty: number;
  unit: string;
  cost: number; // Estimated Cost
  actualCost: number;
  staffAssigned?: string;
  deadline?: string;
  status: 'Pending' | 'Ordered' | 'Delivered' | 'Approved' | 'Rejected' | string;
  actualPurchaseDate?: string;
  startDate?: string;
  endDate?: string;
  deliveryDate?: string;
  totalQtyUsed?: number;
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
  bpjsTk?: string;
  bpjsKesehatan?: string;
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

export type ProcurementStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'PR_PENDING'
  | 'PR_REVIEWED'
  | 'PR_APPROVED'
  | 'PR_REJECTED'
  | 'PO_PENDING_FINANCE'
  | 'MUST_PURCHASE'
  | 'ON_THE_WAY'
  | 'Delivered'
  | 'DELIVERED'
  | 'PAID';

export interface CreateMaterialRequestDTO {
  projectId?: string;
  dateNeeded: string;
  urgency?: 'Low' | 'Normal' | 'High' | 'Urgent';
  purpose?: string;
  items?: IProcurementItem[];
  item?: string;
  qty?: number | string;
  unit?: string;
  costEstimate?: number;
  assignedReviewerId?: string;
  assignedOpsApproverId?: string;
  assignedFinanceApproverId?: string;
}

export interface ProcurementAuthorizersResponse {
  all: Array<{ _id: string; fullName: string; role: string; position?: string; department?: string; email?: string; phone?: string }>;
  reviewers: Array<{ _id: string; fullName: string; role: string; position?: string; department?: string; email?: string; phone?: string }>;
  opsApprovers: Array<{ _id: string; fullName: string; role: string; position?: string; department?: string; email?: string; phone?: string }>;
  financeApprovers: Array<{ _id: string; fullName: string; role: string; position?: string; department?: string; email?: string; phone?: string }>;
}

export interface ProcurementConfigResponse {
  key?: string;
  defaultReviewerId?: any;
  defaultOpsApproverId?: any;
  defaultFinanceApproverId?: any;
  autoAssignEnabled?: boolean;
  updatedBy?: any;
  updatedAt?: string;
}

export interface SPKLConfigResponse {
  key?: string;
  defaultSupervisorId?: any;
  defaultPmId?: any;
  defaultFinanceId?: any;
  autoAssignEnabled?: boolean;
  updatedBy?: any;
  updatedAt?: string;
}

export interface ApprovalConfigCandidateUser {
  _id: string;
  fullName: string;
  role: string;
  position?: string;
  department?: string;
  email?: string;
  phone?: string;
}

export interface MasterApprovalConfigResponse {
  procurement: ProcurementConfigResponse;
  spkl: SPKLConfigResponse;
  candidates: {
    procurement: {
      reviewers: ApprovalConfigCandidateUser[];
      opsApprovers: ApprovalConfigCandidateUser[];
      financeApprovers: ApprovalConfigCandidateUser[];
    };
    spkl: {
      supervisors: ApprovalConfigCandidateUser[];
      projectManagers: ApprovalConfigCandidateUser[];
      financeVerifiers: ApprovalConfigCandidateUser[];
    };
    allUsers: ApprovalConfigCandidateUser[];
  };
}

export interface IProcurementItem {
  _id?: string;
  isRabBased?: boolean;
  rabItemId?: any;
  wbsCode?: string;
  item: string;
  specifications?: string; // Separate column for specification
  qty: number;
  unit: string;
  budgetUnitRate: number;
  targetPriceRange?: { min: number; max: number };
  totalBudget: number;
  poUnitPrice?: number;
  poTotalAmount?: number;
  receivedQty?: number;
  receivedCondition?: 'Good' | 'Damaged' | 'Partial' | 'Pending';
  itemNotes?: string;
}

export interface ISupplierComparisonItemRate {
  itemIndex: number;
  itemName: string;
  quotedUnitPrice: number;
  quotedTotalAmount: number;
}

export interface ISupplierComparison {
  supplierName: string;
  location?: string;
  contact?: string;
  itemRates?: ISupplierComparisonItemRate[];
  subtotalItems?: number;
  shippingCost?: number;
  totalLandedCost?: number;
  leadTimeDays?: number;
  paymentTerms?: string;
  notes?: string;
  isRecommended?: boolean;
  isPaylater?: boolean;
  schemeType?: 'STANDARD' | 'PAYLATER';
  interestRate?: number;
  settlementTerms?: string;
}

export interface IDispatchInfo {
  suratJalanPhoto?: string;
  supplierNotaPhoto?: string;
  driverName?: string;
  driverPhone?: string;
  vehiclePlate?: string;
  dispatchedAt?: string;
  eta?: string;
  notes?: string;
}

export interface IDeliveryProof {
  sitePhoto?: string;
  overallCondition?: 'Good' | 'Damaged' | 'Partial';
  receivedBy?: any;
  receivedAt?: string;
  notes?: string;
  receiverSignature?: string;
  driverSignature?: string;
}

export interface IPaymentConfirmation {
  paymentDate: string;
  paymentType: string;
  paymentMethod: string;
  amountPaid: number;
  principalAmount?: number;
  interestRate?: number;
  interestAmount?: number;
  sourceAccount?: string;
  targetAccount?: string;
  targetAccountName?: string;
  referenceNumber?: string;
  notes?: string;
  bonPembayaranUrl: string;
  transferReceiptUrl: string;
  invoiceDocUrl?: string;
  additionalEvidences?: Array<{ fileUrl: string; fileName: string }>;
  confirmedBy?: { _id: string; fullName: string; role?: string };
  confirmedAt?: string;
  payerSignature?: string;
  schemeApplied?: 'STANDARD' | 'PAYLATER';
}

export interface MaterialRequest {
  _id?: string;
  id?: string;
  prNumber?: string;
  poNumber?: string;
  item: string;
  qty: string | number;
  unit?: string;
  dateNeeded: string;
  status: ProcurementStatus;
  urgency?: 'Low' | 'Normal' | 'High' | 'Urgent';
  purpose?: string;
  costEstimate?: number;
  totalEstimatedBudget?: number;
  
  // Multi-item collection
  items?: IProcurementItem[];
  specifications?: string;

  // Supplier & PO fields
  comparisons?: ISupplierComparison[];
  supplierComparisons?: ISupplierComparison[];
  selectedSupplier?: ISupplierComparison;
  poSubtotal?: number;
  poShippingCost?: number;
  poTotalAmount?: number;

  // People & Audits
  requestedBy: { _id: string; fullName: string; role?: string; phone?: string; nik?: string } | any;
  approvedBy?: { _id: string; fullName: string } | any;
  reviewedBy?: { user: any; role?: string; reviewedAt?: string; notes?: string };
  opsApprovedBy?: { user: any; approvedAt?: string; notes?: string };
  financeApprovedBy?: { user: any; approvedAt?: string; notes?: string };
  assignedReviewerId?: { _id: string; fullName: string; role?: string; phone?: string } | any;
  assignedOpsApproverId?: { _id: string; fullName: string; role?: string; phone?: string } | any;
  assignedFinanceApproverId?: { _id: string; fullName: string; role?: string; phone?: string } | any;
  projectId?: { _id: string; nama: string; lokasi?: string } | any;
  rejectionReason?: string;

  // Delivery & Proof
  dispatchInfo?: IDispatchInfo;
  deliveryProof?: IDeliveryProof;
  paymentConfirmation?: IPaymentConfirmation;
  createdAt?: string;
  updatedAt?: string;
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

  // Unified Item Type & RAB Classification
  itemType?: 'summary' | 'work' | 'supply' | 'milestone';
  category?: 'general' | 'material' | 'labor' | 'equipment' | 'subcontractor' | 'overhead';
  quantity?: number;
  unit?: string;
  unitRate?: number;
  totalBudget?: number;
  realizedQuantity?: number;
  realizedAmount?: number;
  physicalWeight?: number;
  supplyStatus?: 'Pending' | 'Ordered' | 'Delivered';
  deliveryDate?: string | null;

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

export interface RABItem {
  _id: string;
  projectId: string;
  wbsCode: string;
  description: string;
  category: 'material' | 'labor' | 'equipment' | 'subcontractor' | 'overhead';
  unitOfMeasure: string;
  budgetedQuantity: number;
  unitRate: number;
  totalBudget: number;
  realizedQuantity: number;
  realizedAmount: number;
  committedQuantity: number;
  remainingQuantity?: number;
  remainingBudget?: number;
  realizationPercentage?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalPurchase {
  _id: string;
  projectId: string;
  rabItemId: string | RABItem;
  voucherNumber: string;
  purchaserName: string;
  supplierName: string;
  supplierContact?: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  receiptPhotoUrl: string;
  geotagLocation?: {
    lat?: number;
    lng?: number;
    addressText?: string;
  };
  notes?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
  verifiedBy?: string | { _id: string; fullName: string; role: string };
  verifiedAt?: string;
  rejectionReason?: string;
  createdBy?: string | { _id: string; fullName: string; role: string };
  createdAt?: string;
  updatedAt?: string;
}

// === Unified ERP Shared Domain Types ===

export interface AttendanceRecord {
  _id: string;
  userId?: {
    _id: string;
    fullName: string;
    role: string;
    profileImage?: string;
    dailyRate?: number;
    username?: string;
  };
  date: string;
  checkIn?: {
    time: string;
    photo?: string;
    isGroupPhoto?: boolean;
    location?: { lat: number; lng: number };
    distanceToOffice?: number;
    geofenceStatus?: 'in_radius' | 'out_of_range' | 'exempt_wfh' | 'exempt_dinas' | string;
  };
  checkOut?: {
    time: string;
    photo?: string;
    location?: { lat: number; lng: number };
    distanceToOffice?: number;
    geofenceStatus?: 'in_radius' | 'out_of_range' | 'exempt_wfh' | 'exempt_dinas' | string;
  };
  wageType?: string;
  wageMultiplier?: number;
  dailyRate?: number;
  hourlyRate?: number;
  overtimePay?: number;
  paymentStatus?: 'Unpaid' | 'Paid' | string;
  paidAt?: string;
  projectId?: { _id: string; nama: string; lokasi?: string };
  overtimeProjectId?: { _id: string; nama: string; lokasi?: string } | string;
  sessionId?: { _id: string; photoUrl?: string; notes?: string; createdAt?: string };
  workType?: string;
  officeLocation?: string;
  workSummary?: string;
  category?: string;
  status: string;
  notes?: string;
  overtimeHours?: number;
  permit?: {
    reason: string;
    evidence?: string;
    permitType?: string;
    status: string;
  };
  invalidatedBy?: { fullName: string };
  invalidatedAt?: string;
  invalidatedReason?: string;
  isOffline?: boolean;
}

export interface ProjectOption {
  _id: string;
  nama: string;
  name?: string;
  lokasi?: string;
  location?: string;
  progress?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  workItems?: unknown[];
  supplies?: unknown[];
  payrollConfig?: {
    cutoffStartDay?: number;
    cutoffEndDay?: number;
  };
}

export interface UserOption {
  _id: string;
  fullName: string;
  username?: string;
  role: string;
  position?: string;
  profilePhoto?: string;
  dailyRate?: number;
}

export interface KasbonRecord {
  _id: string;
  amount: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Paid';
  approvedBy?: { fullName: string };
  approvedAt?: string;
  paidAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface Worker {
  _id: string;
  fullName: string;
  role: string;
  position?: string;
  phone?: string;
  email?: string;
  paymentInfo?: { bankAccount: string; bankPlatform: string; accountName: string };
}

export interface WorkerEntry {
  _id: string;
  name: string;
  role: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  project: string;
  dailyRate: number;
  overtimePay: number;
  wageType: string;
  paymentStatus: string;
}



