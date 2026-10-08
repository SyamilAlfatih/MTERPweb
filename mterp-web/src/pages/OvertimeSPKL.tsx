import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText, Plus, Users, CheckCircle2, Clock, Download,
  AlertCircle, Filter, Search, Calendar, ArrowRight,
  ChevronRight, Trash2, Edit3, ShieldCheck, Eye, Printer,
  RefreshCw, Check, X, Building, ArrowLeft, Layers, UserCheck,
  AlertTriangle, Briefcase, Award, ChevronDown, CheckSquare,
  Sparkles, HelpCircle, FileCheck, Lock, Unlock,
  EyeOff, ChevronUp, SlidersHorizontal, HardHat,
  Hammer, Wrench, Zap, CheckCheck, RotateCcw, XCircle, Info
} from 'lucide-react';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge } from '../components/shared';
import { formatDate as formatWIBDate, todayWIB } from '../utils/date';
import { exportSpklToPdf, SpklPdfData } from '../utils/exportSpklPdf';

// ─── TYPES & INTERFACES ─────────────────────────────────────────────────────

interface WorkItemForm {
  itemNo: number;
  taskDescription: string;
  volumePlanned: string;
  volumeActual: string;
  isFinished: boolean;
  progressPercent: number;
}

interface WorkerSelectionItem {
  workerId: string;
  fullName: string;
  role: string;
  position?: string;
  nik?: string;
  department?: string;
  actualStartTime?: string;
  actualEndTime?: string;
  actualBreakMinutes?: number;
  effectiveHours?: number;
  volumeOverride?: string;
}

interface ProjectWbsTaskItem {
  id: string;
  wbsCode: string;
  name: string;
  isSummary?: boolean;
  unit: string;
  quantity: number;
  volume: string;
  progress: number;
}

interface PassphraseModalState {
  isOpen: boolean;
  actionType: 'supervisor' | 'pm' | 'finance' | 'batch';
  recordId?: string;
  recordNumber?: string;
  workerName?: string;
  batchStep?: 'supervisor' | 'pm' | 'finance';
  batchCount?: number;
  passphrase: string;
  note: string;
  error: string;
  loading: boolean;
}

interface RejectionModalState {
  isOpen: boolean;
  recordId: string;
  recordNumber: string;
  workerName: string;
  reason: string;
  error: string;
  loading: boolean;
}

const CATEGORIZED_TEMPLATES = {
  'Struktur & Sipil': [
    'Pengecoran plat & balok lantai',
    'Pembesian & perakitan stek kolom',
    'Pengecoran retaining wall',
    'Galian tanah & pemadatan pondasi',
  ],
  'Bekisting & Perancah': [
    'Pemasangan bekisting balok & scaffolding',
    'Bongkar bekisting plat lantai zona A',
    'Penyetelan pipe support & tie rod',
  ],
  'MEP & Elektrikal': [
    'Instalasi kabel feeder MDP & cable tray',
    'Pemasangan pipa instalasi hydrant & fitting',
    'Penarikan kabel power penerangan site',
    'Terminasi panel distribusi lantai',
  ],
  'Finishing & Plester': [
    'Finishing acian dinding bata ringan',
    'Pemasangan keramik lantai & nat',
    'Pengecatan dasar interior & eksterior',
    'Screed lantai & waterproofing',
  ],
  'K3 & Lapangan': [
    'Housekeeping & pembersihan area cor',
    'Pemasangan barikade & safety line K3',
  ],
};

const SHIFT_PRESETS = [
  { label: 'Lembur Sore (17:00 - 21:00)', start: '17:00', end: '21:00', brk: 30 },
  { label: 'Lembur Malam (17:00 - 23:00)', start: '17:00', end: '23:00', brk: 45 },
  { label: 'Lembur Larut (19:00 - 02:00)', start: '19:00', end: '02:00', brk: 60 },
  { label: 'Lembur Singkat (17:00 - 19:30)', start: '17:00', end: '19:30', brk: 15 },
];

const BREAK_PRESETS = [0, 15, 30, 45, 60];

export default function OvertimeSPKL() {
  const { user } = useAuth();

  // Navigation Tabs: 'list' | 'create' | 'approvals'
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'approvals'>('list');
  // Form Mode: 'individual' | 'bulk'
  const [entryMode, setEntryMode] = useState<'individual' | 'bulk'>('individual');
  // Mobile View Switcher for Individual Form: 'form' | 'preview'
  const [mobileFormView, setMobileFormView] = useState<'form' | 'preview'>('form');

  // Master Data
  const [projects, setProjects] = useState<any[]>([]);
  const [workersList, setWorkersList] = useState<any[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(true);

  // List State
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ total: 0, pendingSupervisor: 0, pendingPm: 0, pendingFinance: 0, verified: 0 });
  const [listLoading, setListLoading] = useState(false);
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDatePreset, setFilterDatePreset] = useState<'all' | 'today' | 'week'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<any | null>(null);

  // Form State: Shared / Individual Fields
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [locationName, setLocationName] = useState('');
  const [departmentName, setDepartmentName] = useState('Operasional Lapangan');
  const [overtimeDate, setOvertimeDate] = useState(todayWIB());

  // Assigned Verifier (Supervisor), Approver (PM), and Finance Verificator
  const [assignedSupervisorId, setAssignedSupervisorId] = useState('');
  const [assignedPmId, setAssignedPmId] = useState('');
  const [assignedFinanceId, setAssignedFinanceId] = useState('');

  // Linked Project WBS Tasks
  const [projectWbsTasks, setProjectWbsTasks] = useState<ProjectWbsTaskItem[]>([]);
  const [loadingWbs, setLoadingWbs] = useState(false);

  // Schedule Fields
  const [planStart, setPlanStart] = useState('17:00');
  const [planEnd, setPlanEnd] = useState('21:00');
  const [planBreak, setPlanBreak] = useState(30);

  const [actStart, setActStart] = useState('17:00');
  const [actEnd, setActEnd] = useState('21:00');
  const [actBreak, setActBreak] = useState(30);

  // Work Items
  const [workItems, setWorkItems] = useState<WorkItemForm[]>([
    { itemNo: 1, taskDescription: 'Pengecoran plat lantai 2 zona B', volumePlanned: '45 m²', volumeActual: '45 m²', isFinished: true, progressPercent: 100 },
    { itemNo: 2, taskDescription: 'Pemadatan & perapihan permukaan coran', volumePlanned: '45 m²', volumeActual: '45 m²', isFinished: true, progressPercent: 100 },
    { itemNo: 3, taskDescription: 'Pembersihan alat kerja & mixer concrete', volumePlanned: '1 ls', volumeActual: '1 ls', isFinished: true, progressPercent: 100 },
  ]);

  // Bulk State
  const [bulkWorkers, setBulkWorkers] = useState<WorkerSelectionItem[]>([]);
  const [bulkRoleFilter, setBulkRoleFilter] = useState('all');
  const [bulkWorkerSearch, setBulkWorkerSearch] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkGlobalEndTime, setBulkGlobalEndTime] = useState('21:00');

  // Approval Queue State
  const [approvalTierFilter, setApprovalTierFilter] = useState<'all' | 'supervisor' | 'pm' | 'finance'>('all');
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<string[]>([]);

  // Passphrase Modal State
  const [passphraseModal, setPassphraseModal] = useState<PassphraseModalState>({
    isOpen: false,
    actionType: 'supervisor',
    passphrase: '',
    note: '',
    error: '',
    loading: false,
  });
  const [showPassphraseText, setShowPassphraseText] = useState(false);

  // Rejection Modal State
  const [rejectionModal, setRejectionModal] = useState<RejectionModalState>({
    isOpen: false,
    recordId: '',
    recordNumber: '',
    workerName: '',
    reason: '',
    error: '',
    loading: false,
  });

  // Allocation Modal State (Owner-Only Verificator Assignment)
  const [allocationModal, setAllocationModal] = useState<{
    isOpen: boolean;
    recordId?: string;
    recordNumber?: string;
    workerName?: string;
    isBatch?: boolean;
    supervisorId: string;
    pmId: string;
    financeId: string;
    loading: boolean;
    error: string;
  }>({
    isOpen: false,
    supervisorId: '',
    pmId: '',
    financeId: '',
    loading: false,
    error: '',
  });

  // Fullscreen Live A4 Preview Modal
  const [showA4Fullscreen, setShowA4Fullscreen] = useState(false);

  // ── Compute Duration Helper ───────────────────────────────────────────────
  const computeDuration = useCallback((start: string, end: string, brk: number) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let min1 = (h1 || 0) * 60 + (m1 || 0);
    let min2 = (h2 || 0) * 60 + (m2 || 0);
    if (min2 < min1) min2 += 1440; // Overnight shift crossing midnight
    const diff = Math.max(0, min2 - min1 - (Number(brk) || 0));
    return Math.round((diff / 60) * 10) / 10;
  }, []);

  const planDuration = useMemo(() => computeDuration(planStart, planEnd, planBreak), [computeDuration, planStart, planEnd, planBreak]);
  const actDuration = useMemo(() => computeDuration(actStart, actEnd, actBreak), [computeDuration, actStart, actEnd, actBreak]);

  // Check if shift crosses midnight
  const isOvernightShift = useMemo(() => {
    if (!actStart || !actEnd) return false;
    const [h1, m1] = actStart.split(':').map(Number);
    const [h2, m2] = actEnd.split(':').map(Number);
    const min1 = (h1 || 0) * 60 + (m1 || 0);
    const min2 = (h2 || 0) * 60 + (m2 || 0);
    return min2 < min1;
  }, [actStart, actEnd]);

  // ── Selected Worker & Dynamic Baseline ───────────────────────────────────
  const activeWorker = useMemo(() => {
    return workersList.find(w => w._id === selectedWorkerId) || null;
  }, [workersList, selectedWorkerId]);

  // ── Verificator / Approver Authorization Helpers ──────────────────────────
  const currentUserId = user?._id || (user as any)?.id;
  const currentUserRole = (user?.role || '').toLowerCase();
  const isOwner = currentUserRole === 'owner';
  const isExecutive = ['owner', 'president_director', 'operational_director', 'director'].includes(currentUserRole);
  const isFinanceRole = ['owner', 'president_director', 'operational_director', 'director', 'finance', 'admin_project', 'accounting'].includes(currentUserRole);

  const getAssignedSupervisorId = useCallback((rec: any): string | undefined => {
    const as = rec.assignedSupervisorId || rec.signatures?.supervisor?.assignedTo;
    if (!as) return undefined;
    return typeof as === 'object' ? (as._id || as.id) : String(as);
  }, []);

  const getAssignedSupervisorName = useCallback((rec: any): string => {
    const as = rec.assignedSupervisorId || rec.signatures?.supervisor?.assignedTo;
    if (!as) return '';
    if (typeof as === 'object' && as.fullName) return as.fullName;
    const id = typeof as === 'object' ? (as._id || as.id) : String(as);
    const found = workersList.find(u => String(u._id) === String(id));
    return found?.fullName || '';
  }, [workersList]);

  const getAssignedPmId = useCallback((rec: any): string | undefined => {
    const ap = rec.assignedPmId || rec.signatures?.projectManager?.assignedTo;
    if (!ap) return undefined;
    return typeof ap === 'object' ? (ap._id || ap.id) : String(ap);
  }, []);

  const getAssignedPmName = useCallback((rec: any): string => {
    const ap = rec.assignedPmId || rec.signatures?.projectManager?.assignedTo;
    if (!ap) return '';
    if (typeof ap === 'object' && ap.fullName) return ap.fullName;
    const id = typeof ap === 'object' ? (ap._id || ap.id) : String(ap);
    const found = workersList.find(u => String(u._id) === String(id));
    return found?.fullName || '';
  }, [workersList]);

  const getAssignedFinanceId = useCallback((rec: any): string | undefined => {
    const af = rec.assignedFinanceId || rec.signatures?.financeDirector?.assignedTo;
    if (!af) return undefined;
    return typeof af === 'object' ? (af._id || af.id) : String(af);
  }, []);

  const getAssignedFinanceName = useCallback((rec: any): string => {
    const af = rec.assignedFinanceId || rec.signatures?.financeDirector?.assignedTo;
    if (!af) return '';
    if (typeof af === 'object' && af.fullName) return af.fullName;
    const id = typeof af === 'object' ? (af._id || af.id) : String(af);
    const found = workersList.find(u => String(u._id) === String(id));
    return found?.fullName || '';
  }, [workersList]);

  // Check if current logged in user is the assigned supervisor for this record
  const canVerifySupervisor = useCallback((rec: any): boolean => {
    if (rec.workflowStatus !== 'submitted') return false;
    if (isExecutive) return true;
    const assignedId = getAssignedSupervisorId(rec);
    if (assignedId && currentUserId) {
      return String(assignedId) === String(currentUserId);
    }
    // If unassigned: allow supervisors & site managers
    return ['supervisor', 'site_manager', 'foreman', 'admin_project'].includes(currentUserRole);
  }, [isExecutive, getAssignedSupervisorId, currentUserId, currentUserRole]);

  // Check if current logged in user is the assigned PM for this record
  const canApprovePm = useCallback((rec: any): boolean => {
    if (rec.workflowStatus !== 'supervisor_verified') return false;
    if (isExecutive) return true;
    const assignedId = getAssignedPmId(rec);
    if (assignedId && currentUserId) {
      return String(assignedId) === String(currentUserId);
    }
    // If unassigned: allow PM and site managers
    return ['site_manager', 'project_manager'].includes(currentUserRole);
  }, [isExecutive, getAssignedPmId, currentUserId, currentUserRole]);

  // Check if current logged in user has finance verification authority
  const canVerifyFinance = useCallback((rec: any): boolean => {
    if (rec.workflowStatus !== 'pm_approved') return false;
    if (isExecutive) return true;
    const assignedId = getAssignedFinanceId(rec);
    if (assignedId && currentUserId) {
      return String(assignedId) === String(currentUserId);
    }
    return isFinanceRole;
  }, [isExecutive, getAssignedFinanceId, currentUserId, isFinanceRole]);

  // Check if current logged in user can act on this record (verify SPV, approve PM, or verify Finance)
  const canActOnRecord = useCallback((rec: any): boolean => {
    return canVerifySupervisor(rec) || canApprovePm(rec) || canVerifyFinance(rec);
  }, [canVerifySupervisor, canApprovePm, canVerifyFinance]);

  // Check if current logged in user can reject this record at its current stage
  const canRejectRecord = useCallback((rec: any): boolean => {
    if (isExecutive) return true;
    if (rec.workflowStatus === 'submitted') return canVerifySupervisor(rec);
    if (rec.workflowStatus === 'supervisor_verified') return canApprovePm(rec);
    if (rec.workflowStatus === 'pm_approved') return canVerifyFinance(rec);
    return false;
  }, [isExecutive, canVerifySupervisor, canApprovePm, canVerifyFinance]);

  // ── Modal Handlers for Verifier Allocation (Owner Only) ───────────────────
  const openAllocationModal = useCallback((options?: { record?: any; isBatch?: boolean }) => {
    if (options?.record) {
      const rec = options.record;
      setAllocationModal({
        isOpen: true,
        recordId: rec._id,
        recordNumber: rec.spklNumber,
        workerName: rec.workerSnapshot?.fullName,
        isBatch: false,
        supervisorId: getAssignedSupervisorId(rec) || assignedSupervisorId || '',
        pmId: getAssignedPmId(rec) || assignedPmId || '',
        financeId: getAssignedFinanceId(rec) || assignedFinanceId || '',
        loading: false,
        error: '',
      });
    } else if (options?.isBatch) {
      setAllocationModal({
        isOpen: true,
        recordId: undefined,
        recordNumber: undefined,
        workerName: undefined,
        isBatch: true,
        supervisorId: assignedSupervisorId || '',
        pmId: assignedPmId || '',
        financeId: assignedFinanceId || '',
        loading: false,
        error: '',
      });
    } else {
      setAllocationModal({
        isOpen: true,
        recordId: undefined,
        recordNumber: undefined,
        workerName: undefined,
        isBatch: false,
        supervisorId: assignedSupervisorId || '',
        pmId: assignedPmId || '',
        financeId: assignedFinanceId || '',
        loading: false,
        error: '',
      });
    }
  }, [assignedSupervisorId, assignedPmId, assignedFinanceId, getAssignedSupervisorId, getAssignedPmId, getAssignedFinanceId]);

  // ── Fetch Master Data ─────────────────────────────────────────────────────
  const fetchMasterData = useCallback(async () => {
    setLoadingMaster(true);
    try {
      const [projRes, userRes] = await Promise.all([
        api.get('/projects'),
        api.get('/users?limit=150'),
      ]);
      const pList = projRes.data?.projects || projRes.data || [];
      const uList = userRes.data?.users || userRes.data || [];
      setProjects(pList);
      setWorkersList(uList);

      if (pList?.[0]?._id && !selectedProjectId) {
        setSelectedProjectId(pList[0]._id);
        setLocationName(pList[0].lokasi ? `${pList[0].nama} (${pList[0].lokasi})` : pList[0].nama);
      }
      if (uList?.[0]?._id && !selectedWorkerId) {
        setSelectedWorkerId(uList[0]._id);
      }
      const defaultSpv = uList.find((u: any) => ['supervisor', 'site_manager'].includes(u.role)) || uList[0];
      const defaultPm = uList.find((u: any) => ['site_manager', 'director', 'operational_director', 'president_director', 'owner'].includes(u.role)) || uList[0];
      const defaultFinance = uList.find((u: any) => ['finance', 'admin_project', 'director', 'owner'].includes(u.role)) || uList[0];
      if (defaultSpv && !assignedSupervisorId) {
        setAssignedSupervisorId(defaultSpv._id);
      }
      if (defaultPm && !assignedPmId) {
        setAssignedPmId(defaultPm._id);
      }
      if (defaultFinance && !assignedFinanceId) {
        setAssignedFinanceId(defaultFinance._id);
      }
    } catch (err) {
      console.error('Failed to load master data for SPKL', err);
    } finally {
      setLoadingMaster(false);
    }
  }, [selectedProjectId, selectedWorkerId, assignedSupervisorId, assignedPmId, assignedFinanceId]);

  // ── Fetch Records ─────────────────────────────────────────────────────────
  const fetchRecords = useCallback(async () => {
    setListLoading(true);
    try {
      const params: any = {};
      if (filterProject) params.projectId = filterProject;
      if (filterStatus !== 'all') params.status = filterStatus;
      if (searchQuery) params.search = searchQuery;

      const [resList, resSum] = await Promise.all([
        api.get('/spkl', { params }),
        api.get('/spkl/summary'),
      ]);
      setRecords(resList.data?.records || []);
      setSummary(resSum.data || {});
    } catch (err) {
      console.error('Failed to load SPKL records', err);
    } finally {
      setListLoading(false);
    }
  }, [filterProject, filterStatus, searchQuery]);

  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Handle Project Selection
  const handleProjectSelect = (projId: string) => {
    setSelectedProjectId(projId);
    const p = projects.find(x => x._id === projId);
    if (p) {
      setLocationName(p.lokasi ? `${p.nama} (${p.lokasi})` : p.nama);
    }
  };

  // ── Fetch Project WBS ───────────────────────────────────────────────────────
  const fetchProjectWbs = useCallback(async (projId: string) => {
    if (!projId) {
      setProjectWbsTasks([]);
      return;
    }
    setLoadingWbs(true);
    try {
      const res = await api.get(`/spkl/project-wbs/${projId}`);
      if (res.data?.success && Array.isArray(res.data?.tasks)) {
        setProjectWbsTasks(res.data.tasks);
      } else {
        setProjectWbsTasks([]);
      }
    } catch (err) {
      console.warn('WBS not available or failed to load for project', err);
      setProjectWbsTasks([]);
    } finally {
      setLoadingWbs(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectWbs(selectedProjectId);
    }
  }, [selectedProjectId, fetchProjectWbs]);

  // ── Candidate Verifiers & Approvers ─────────────────────────────────────────
  const supervisorCandidates = useMemo(() => {
    return workersList.filter(u =>
      ['supervisor', 'site_manager', 'foreman', 'admin_project', 'director', 'operational_director', 'president_director', 'owner'].includes(u.role)
    );
  }, [workersList]);

  const pmCandidates = useMemo(() => {
    return workersList.filter(u =>
      ['site_manager', 'director', 'operational_director', 'president_director', 'owner', 'supervisor'].includes(u.role)
    );
  }, [workersList]);

  const financeCandidates = useMemo(() => {
    return workersList.filter(u =>
      ['finance', 'admin_project', 'director', 'operational_director', 'president_director', 'owner', 'accounting'].includes(u.role)
    );
  }, [workersList]);

  const assignedSupervisorUser = useMemo(() => {
    return workersList.find(u => u._id === assignedSupervisorId) || null;
  }, [workersList, assignedSupervisorId]);

  const assignedPmUser = useMemo(() => {
    return workersList.find(u => u._id === assignedPmId) || null;
  }, [workersList, assignedPmId]);

  const assignedFinanceUser = useMemo(() => {
    return workersList.find(u => u._id === assignedFinanceId) || null;
  }, [workersList, assignedFinanceId]);

  const handleSaveAllocation = async () => {
    if (allocationModal.recordId) {
      setAllocationModal(p => ({ ...p, loading: true, error: '' }));
      try {
        await api.post(`/spkl/${allocationModal.recordId}/allocate-verifiers`, {
          assignedSupervisorId: allocationModal.supervisorId || null,
          assignedPmId: allocationModal.pmId || null,
          assignedFinanceId: allocationModal.financeId || null,
        });
        alert('Alokasi verifikator berhasil diperbarui oleh Owner!');
        setAllocationModal(p => ({ ...p, isOpen: false, loading: false }));
        fetchRecords();
      } catch (err: any) {
        setAllocationModal(p => ({
          ...p,
          loading: false,
          error: err.response?.data?.msg || 'Gagal menyimpan alokasi verifikator',
        }));
      }
    } else if (allocationModal.isBatch && selectedApprovalIds.length > 0) {
      setAllocationModal(p => ({ ...p, loading: true, error: '' }));
      try {
        await api.post('/spkl/batch-allocate-verifiers', {
          spklIds: selectedApprovalIds,
          assignedSupervisorId: allocationModal.supervisorId || null,
          assignedPmId: allocationModal.pmId || null,
          assignedFinanceId: allocationModal.financeId || null,
        });
        alert(`Berhasil mengalokasikan verifikator untuk ${selectedApprovalIds.length} dokumen SPKL!`);
        setAllocationModal(p => ({ ...p, isOpen: false, loading: false }));
        setSelectedApprovalIds([]);
        fetchRecords();
      } catch (err: any) {
        setAllocationModal(p => ({
          ...p,
          loading: false,
          error: err.response?.data?.msg || 'Gagal menyimpan alokasi massal',
        }));
      }
    } else {
      // In form mode
      setAssignedSupervisorId(allocationModal.supervisorId);
      setAssignedPmId(allocationModal.pmId);
      setAssignedFinanceId(allocationModal.financeId);
      setAllocationModal(p => ({ ...p, isOpen: false }));
    }
  };

  // ── WBS Work Item Helpers ───────────────────────────────────────────────────
  const handleSelectWbsForWorkItem = (idx: number, taskId: string) => {
    if (!taskId) return;
    const task = projectWbsTasks.find(t => t.id === taskId);
    if (!task) return;
    const desc = task.wbsCode ? `[${task.wbsCode}] ${task.name}` : task.name;
    handleUpdateWorkItem(idx, 'taskDescription', desc);
    if (task.volume) {
      handleUpdateWorkItem(idx, 'volumePlanned', task.volume);
    }
  };

  const handleAddWbsItem = (task: any) => {
    const desc = task.wbsCode ? `[${task.wbsCode}] ${task.name}` : task.name;
    setWorkItems(prev => [
      ...prev,
      {
        itemNo: prev.length + 1,
        taskDescription: desc,
        volumePlanned: task.volume || '',
        volumeActual: '',
        isFinished: true,
        progressPercent: 100,
      },
    ]);
  };

  // ── Work Items Management ────────────────────────────────────────────────
  const handleAddWorkItem = (desc = '') => {
    setWorkItems(prev => [
      ...prev,
      { itemNo: prev.length + 1, taskDescription: desc, volumePlanned: '', volumeActual: '', isFinished: true, progressPercent: 100 },
    ]);
  };

  const handleRemoveWorkItem = (idx: number) => {
    setWorkItems(prev => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, itemNo: i + 1 })));
  };

  const handleUpdateWorkItem = (idx: number, field: keyof WorkItemForm, val: any) => {
    setWorkItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  };

  // ── Handle Save Individual SPKL ──────────────────────────────────────────
  const handleSubmitIndividual = async (isDraft = false) => {
    if (!selectedWorkerId || !selectedProjectId) {
      alert('Pilih pekerja dan proyek terlebih dahulu.');
      return;
    }

    const validItems = workItems.filter(w => w.taskDescription.trim() !== '');
    if (validItems.length === 0) {
      alert('Minimal harus mengisi 1 rincian pekerjaan pada Bagian III.');
      return;
    }

    try {
      const payload = {
        workerId: selectedWorkerId,
        projectId: selectedProjectId,
        location: locationName,
        overtimeDate,
        schedulePlan: {
          startTime: planStart,
          endTime: planEnd,
          breakMinutes: planBreak,
          effectiveHours: planDuration,
        },
        scheduleActual: {
          startTime: actStart,
          endTime: actEnd,
          breakMinutes: actBreak,
          effectiveHours: actDuration,
        },
        workItems: validItems,
        draft: isDraft,
        assignedSupervisorId: assignedSupervisorId || null,
        assignedPmId: assignedPmId || null,
        assignedFinanceId: assignedFinanceId || null,
      };

      const res = await api.post('/spkl/individual', payload);
      alert(res.data.message || 'SPKL Berhasil diterbitkan!');
      setActiveTab('list');
      fetchRecords();
    } catch (err: any) {
      console.error('Error creating SPKL', err);
      alert(err.response?.data?.msg || 'Gagal menyimpan SPKL');
    }
  };

  // ── Bulk Worker Helpers ──────────────────────────────────────────────────
  const toggleWorkerInBulk = (w: any) => {
    setBulkWorkers(prev => {
      const exists = prev.some(x => x.workerId === w._id);
      if (exists) {
        return prev.filter(x => x.workerId !== w._id);
      } else {
        return [
          ...prev,
          {
            workerId: w._id,
            fullName: w.fullName,
            role: w.role || 'Pekerja',
            position: w.position,
            nik: w.nik,
            department: w.department || departmentName,
            actualStartTime: actStart,
            actualEndTime: actEnd,
            actualBreakMinutes: actBreak,
            effectiveHours: actDuration,
          },
        ];
      }
    });
  };

  const handleUpdateBulkWorker = (wId: string, field: string, val: any) => {
    setBulkWorkers(prev => prev.map(w => {
      if (w.workerId !== wId) return w;
      const updated = { ...w, [field]: val };

      // If time changed, recalculate effectiveHours
      if (field === 'actualStartTime' || field === 'actualEndTime' || field === 'actualBreakMinutes') {
        const hours = computeDuration(
          updated.actualStartTime || actStart,
          updated.actualEndTime || actEnd,
          updated.actualBreakMinutes ?? actBreak
        );
        updated.effectiveHours = hours;
      }

      return updated;
    }));
  };

  // Batch helper: apply end time to all bulk workers
  const handleApplyGlobalEndTime = () => {
    setBulkWorkers(prev => prev.map(w => {
      const hours = computeDuration(w.actualStartTime || actStart, bulkGlobalEndTime, w.actualBreakMinutes ?? actBreak);
      return {
        ...w,
        actualEndTime: bulkGlobalEndTime,
        effectiveHours: hours,
      };
    }));
  };

  const handleSubmitBulk = async () => {
    if (!selectedProjectId || bulkWorkers.length === 0) {
      alert('Pilih proyek dan minimal 1 pekerja untuk lembur massal.');
      return;
    }
    const validItems = workItems.filter(w => w.taskDescription.trim() !== '');
    if (validItems.length === 0) {
      alert('Wajib mengisi minimal 1 tugas bersama pada Bagian III.');
      return;
    }

    setBulkSubmitting(true);
    try {
      const workersPayload = bulkWorkers.map(w => ({
        workerId: w.workerId,
        scheduleActualOverride: {
          startTime: w.actualStartTime || actStart,
          endTime: w.actualEndTime || actEnd,
          breakMinutes: w.actualBreakMinutes ?? actBreak,
        },
      }));

      const res = await api.post('/spkl/bulk', {
        projectId: selectedProjectId,
        location: locationName,
        department: departmentName,
        overtimeDate,
        sharedSchedulePlan: {
          startTime: planStart,
          endTime: planEnd,
          breakMinutes: planBreak,
        },
        sharedScheduleActual: {
          startTime: actStart,
          endTime: actEnd,
          breakMinutes: actBreak,
        },
        sharedWorkItems: validItems,
        workers: workersPayload,
        assignedSupervisorId: assignedSupervisorId || null,
        assignedPmId: assignedPmId || null,
        assignedFinanceId: assignedFinanceId || null,
      });

      alert(res.data.message || 'Penugasan lembur massal berhasil dibuat!');
      setBulkWorkers([]);
      setActiveTab('list');
      fetchRecords();
    } catch (err: any) {
      console.error('Error submitting bulk SPKL', err);
      alert(err.response?.data?.msg || 'Gagal menyimpan lembur massal');
    } finally {
      setBulkSubmitting(false);
    }
  };

  // ── PDF Export Trigger ────────────────────────────────────────────────────
  const handleExportPdf = (record: any) => {
    const pdfData: SpklPdfData = {
      spklNumber: record.spklNumber,
      workerName: record.workerSnapshot?.fullName || record.workerId?.fullName || 'Pekerja',
      workerNik: record.workerSnapshot?.nik || record.workerId?.nik || '',
      department: record.workerSnapshot?.department || record.workerId?.department || 'Operasional Lapangan',
      location: record.location || 'Site Proyek',
      overtimeDate: record.overtimeDate,
      schedulePlan: record.schedulePlan || { startTime: '17:00', endTime: '21:00', breakMinutes: 30, effectiveHours: 3.5 },
      scheduleActual: record.scheduleActual || { startTime: '17:00', endTime: '21:00', breakMinutes: 30, effectiveHours: 3.5 },
      workItems: record.workItems || [],
      signatures: {
        worker: {
          signed: record.signatures?.worker?.signed,
          signedAt: record.signatures?.worker?.signedAt,
          signerName: record.workerSnapshot?.fullName,
        },
        supervisor: {
          signed: record.signatures?.supervisor?.signed,
          signedAt: record.signatures?.supervisor?.signedAt,
          signerName: record.signatures?.supervisor?.signedBy?.fullName || record.signatures?.supervisor?.assignedTo?.fullName || record.assignedSupervisorId?.fullName || 'Supervisor Lapangan',
          note: record.signatures?.supervisor?.note,
        },
        projectManager: {
          signed: record.signatures?.projectManager?.signed,
          signedAt: record.signatures?.projectManager?.signedAt,
          signerName: record.signatures?.projectManager?.signedBy?.fullName || record.signatures?.projectManager?.assignedTo?.fullName || record.assignedPmId?.fullName || 'Project Manager',
          note: record.signatures?.projectManager?.note,
        },
        financeDirector: {
          signed: record.signatures?.financeDirector?.signed,
          signedAt: record.signatures?.financeDirector?.signedAt,
          signerName: record.signatures?.financeDirector?.signedBy?.fullName || record.signatures?.financeDirector?.assignedTo?.fullName || record.assignedFinanceId?.fullName || 'Finance Director',
          note: record.signatures?.financeDirector?.note,
        },
      },
    };

    exportSpklToPdf(pdfData);
  };

  // ── Passphrase Modal Handlers ─────────────────────────────────────────────
  const openPassphraseModal = (
    actionType: 'supervisor' | 'pm' | 'finance' | 'batch',
    record?: any,
    batchStep?: 'supervisor' | 'pm' | 'finance'
  ) => {
    setPassphraseModal({
      isOpen: true,
      actionType,
      recordId: record?._id,
      recordNumber: record?.spklNumber,
      workerName: record?.workerSnapshot?.fullName,
      batchStep: batchStep || 'pm',
      batchCount: selectedApprovalIds.length,
      passphrase: '',
      note: '',
      error: '',
      loading: false,
    });
    setShowPassphraseText(false);
  };

  const handleConfirmPassphrase = async () => {
    if (!passphraseModal.passphrase || passphraseModal.passphrase.length < 4) {
      setPassphraseModal(p => ({ ...p, error: 'Passphrase otorisasi wajib diisi (minimal 4 karakter)' }));
      return;
    }

    setPassphraseModal(p => ({ ...p, loading: true, error: '' }));

    try {
      if (passphraseModal.actionType === 'supervisor' && passphraseModal.recordId) {
        await api.post(`/spkl/${passphraseModal.recordId}/verify-supervisor`, {
          note: passphraseModal.note || 'Diverifikasi oleh Supervisor',
          passphrase: passphraseModal.passphrase,
        });
        alert('SPKL berhasil diverifikasi Supervisor!');
      } else if (passphraseModal.actionType === 'pm' && passphraseModal.recordId) {
        await api.post(`/spkl/${passphraseModal.recordId}/approve-pm`, {
          note: passphraseModal.note || 'Disetujui Project Manager',
          passphrase: passphraseModal.passphrase,
        });
        alert('SPKL berhasil disetujui Project Manager!');
      } else if (passphraseModal.actionType === 'finance' && passphraseModal.recordId) {
        await api.post(`/spkl/${passphraseModal.recordId}/verify-finance`, {
          note: passphraseModal.note || 'Verifikasi Final Finance Director',
          passphrase: passphraseModal.passphrase,
        });
        alert('SPKL diverifikasi final oleh Finance dan otomatis disinkronkan ke Presensi/Slip Gaji!');
      } else if (passphraseModal.actionType === 'batch') {
        const res = await api.post('/spkl/batch-verify', {
          spklIds: selectedApprovalIds,
          step: passphraseModal.batchStep,
          note: passphraseModal.note,
          passphrase: passphraseModal.passphrase,
        });
        alert(res.data.message || 'Verifikasi massal berhasil diproses!');
        setSelectedApprovalIds([]);
      }

      setPassphraseModal(p => ({ ...p, isOpen: false }));
      fetchRecords();
    } catch (err: any) {
      const msg = err.response?.data?.msg || 'Gagal memproses otorisasi. Pastikan passphrase benar.';
      setPassphraseModal(p => ({ ...p, error: msg, loading: false }));
    }
  };

  // ── Rejection Modal Handlers ──────────────────────────────────────────────
  const openRejectionModal = (rec: any) => {
    setRejectionModal({
      isOpen: true,
      recordId: rec._id,
      recordNumber: rec.spklNumber,
      workerName: rec.workerSnapshot?.fullName,
      reason: '',
      error: '',
      loading: false,
    });
  };

  const handleConfirmRejection = async () => {
    if (!rejectionModal.reason.trim()) {
      setRejectionModal(r => ({ ...r, error: 'Alasan penolakan / revisi wajib diisi' }));
      return;
    }

    setRejectionModal(r => ({ ...r, loading: true, error: '' }));
    try {
      await api.post(`/spkl/${rejectionModal.recordId}/reject`, {
        reason: rejectionModal.reason,
      });
      alert('Dokumen SPKL telah ditolak / dikembalikan untuk revisi.');
      setRejectionModal(r => ({ ...r, isOpen: false }));
      fetchRecords();
    } catch (err: any) {
      setRejectionModal(r => ({ ...r, error: err.response?.data?.msg || 'Gagal menolak SPKL', loading: false }));
    }
  };

  // ── Status Badging ────────────────────────────────────────────────────────
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'finance_verified':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Final Finance (Synced)
          </span>
        );
      case 'pm_approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs">
            <Check className="w-3.5 h-3.5 text-blue-600" />
            Approved PM
          </span>
        );
      case 'supervisor_verified':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Verif Supervisor
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 shadow-2xs">
            Diajukan
          </span>
        );
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs">
            Draft
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Ditolak / Revisi
          </span>
        );
      default:
        return <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  // Filtered Bulk Worker Candidates
  const filteredBulkWorkerCandidates = useMemo(() => {
    return workersList.filter(w => {
      const matchRole = bulkRoleFilter === 'all' || (w.role || '').toLowerCase() === bulkRoleFilter.toLowerCase();
      const matchSearch = !bulkWorkerSearch ||
        (w.fullName || '').toLowerCase().includes(bulkWorkerSearch.toLowerCase()) ||
        (w.nik || '').toLowerCase().includes(bulkWorkerSearch.toLowerCase());
      return matchRole && matchSearch;
    });
  }, [workersList, bulkRoleFilter, bulkWorkerSearch]);

  // Filtered Records for Approval Tab
  const approvalRecords = useMemo(() => {
    return records.filter(r => {
      if (r.workflowStatus === 'finance_verified') return false;
      if (approvalTierFilter === 'all') return true;
      if (approvalTierFilter === 'supervisor') return r.workflowStatus === 'submitted';
      if (approvalTierFilter === 'pm') return r.workflowStatus === 'supervisor_verified';
      if (approvalTierFilter === 'finance') return r.workflowStatus === 'pm_approved';
      return true;
    });
  }, [records, approvalTierFilter]);

  const selectableApprovalRecords = useMemo(() => {
    return approvalRecords.filter(r => canActOnRecord(r));
  }, [approvalRecords, canActOnRecord]);

  return (
    <div className="p-3 sm:p-5 lg:p-7 max-w-7xl mx-auto space-y-5 sm:space-y-6 pb-24 font-sans">
      {/* ── 1. ENTERPRISE HERO & CREDENTIALS BANNER ────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white p-4 sm:p-6 lg:p-7 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-800">
        {/* Subtle decorative glow */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-extrabold tracking-wider uppercase px-2.5 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-md">
                ISO 9001:2015 • 14001:2015 • 45001:2018 • SMK3
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700">
                FRM-MTE-HR-014 Rev. 02
              </span>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/40">
                ⚡ PP No. 35/2021 Compliant
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white m-0">
              Surat Perintah &amp; Bukti Kerja Lembur (SPKL)
            </h1>

            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed m-0">
              Sistem resmi otorisasi dan pelaporan jam kerja lembur PT Mega Tama Enerco. Verifikasi digital ber-passphrase, penetapan jam lembur efektif, dan sinkronisasi ke presensi payroll.
            </p>
          </div>

          {/* Segmented Tab Controls (Fully Responsive on All Devices) */}
          <div className="grid grid-cols-3 sm:flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 w-full sm:w-auto shrink-0 shadow-inner">
            <button
              onClick={() => setActiveTab('list')}
              className={`min-h-[44px] px-2 sm:px-3.5 py-2 text-[11px] sm:text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'list'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Registry SPKL ({summary.total || 0})</span>
              <span className="sm:hidden">Registry</span>
            </button>
            <button
              onClick={() => setActiveTab('create')}
              className={`min-h-[44px] px-2 sm:px-3.5 py-2 text-[11px] sm:text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Penerbitan SPKL</span>
              <span className="sm:hidden">Buat Baru</span>
            </button>
            <button
              onClick={() => setActiveTab('approvals')}
              className={`min-h-[44px] px-2 sm:px-3.5 py-2 text-[11px] sm:text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer relative ${
                activeTab === 'approvals'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Otorisasi 4-Tier</span>
              <span className="sm:hidden">Otorisasi</span>
              {(summary.pendingSupervisor + summary.pendingPm + summary.pendingFinance) > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-0.5" />
              )}
            </button>
          </div>
        </div>

        {/* Executive KPI Strip with Interactive Filter On Click */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <div
            onClick={() => { setActiveTab('list'); setFilterStatus('all'); }}
            className="p-3 bg-slate-900/60 hover:bg-slate-800/60 rounded-xl border border-slate-800 transition-colors cursor-pointer group"
          >
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Terbit</span>
            <span className="text-xl font-extrabold text-white font-mono group-hover:text-blue-400 transition-colors">{summary.total || 0}</span>
            <span className="text-[10px] text-slate-500 block truncate">Akumulasi dokumen</span>
          </div>
          <div
            onClick={() => { setActiveTab('list'); setFilterStatus('submitted'); }}
            className="p-3 bg-slate-900/60 hover:bg-amber-950/40 rounded-xl border border-amber-900/30 transition-colors cursor-pointer group"
          >
            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">Verif SPV</span>
            <span className="text-xl font-extrabold text-amber-300 font-mono group-hover:scale-105 transition-transform inline-block">{summary.pendingSupervisor || 0}</span>
            <span className="text-[10px] text-amber-500/80 block truncate">Menunggu mandor/SPV</span>
          </div>
          <div
            onClick={() => { setActiveTab('list'); setFilterStatus('supervisor_verified'); }}
            className="p-3 bg-slate-900/60 hover:bg-blue-950/40 rounded-xl border border-blue-900/30 transition-colors cursor-pointer group"
          >
            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">Approval PM</span>
            <span className="text-xl font-extrabold text-blue-300 font-mono group-hover:scale-105 transition-transform inline-block">{summary.pendingPm || 0}</span>
            <span className="text-[10px] text-blue-500/80 block truncate">Persetujuan site/PM</span>
          </div>
          <div
            onClick={() => { setActiveTab('list'); setFilterStatus('pm_approved'); }}
            className="p-3 bg-slate-900/60 hover:bg-purple-950/40 rounded-xl border border-purple-900/30 transition-colors cursor-pointer group"
          >
            <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider block">Verif Finance</span>
            <span className="text-xl font-extrabold text-purple-300 font-mono group-hover:scale-105 transition-transform inline-block">{summary.pendingFinance || 0}</span>
            <span className="text-[10px] text-purple-500/80 block truncate">Audit kantor pusat</span>
          </div>
          <div
            onClick={() => { setActiveTab('list'); setFilterStatus('finance_verified'); }}
            className="p-3 bg-slate-900/60 hover:bg-emerald-950/40 rounded-xl border border-emerald-900/30 transition-colors cursor-pointer group col-span-2 sm:col-span-1"
          >
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">Payroll Synced</span>
            <span className="text-xl font-extrabold text-emerald-300 font-mono group-hover:scale-105 transition-transform inline-block">{summary.verified || 0}</span>
            <span className="text-[10px] text-emerald-500/80 block truncate">Terkunci slip gaji</span>
          </div>
        </div>
      </div>

      {/* ── 2. TAB 1: REGISTRY DOKUMEN SPKL ──────────────────────────────────── */}
      {activeTab === 'list' && (
        <Card className="p-4 sm:p-6 space-y-4 shadow-sm border border-border-light rounded-2xl">
          {/* Action & Filter Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-border-light">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2.5 w-full md:w-auto">
              <div className="relative w-full sm:col-span-2 lg:w-64">
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari No. SPKL, Pekerja, NIK..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 text-xs border border-border-light rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 bg-bg-white min-h-[44px]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={filterProject}
                onChange={e => setFilterProject(e.target.value)}
                className="w-full lg:w-auto px-3 py-2.5 text-xs border border-border-light rounded-xl outline-none bg-bg-white focus:border-blue-500 font-medium min-h-[44px]"
              >
                <option value="">Semua Proyek Lapangan</option>
                {projects.map((p: any) => (
                  <option key={p._id} value={p._id}>{p.nama}</option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full lg:w-auto px-3 py-2.5 text-xs border border-border-light rounded-xl outline-none bg-bg-white focus:border-blue-500 font-bold text-text-primary min-h-[44px]"
              >
                <option value="all">Semua Status Otorisasi</option>
                <option value="submitted">Diajukan (Pending SPV)</option>
                <option value="supervisor_verified">Verif SPV (Pending PM)</option>
                <option value="pm_approved">Approved PM (Pending Finance)</option>
                <option value="finance_verified">Final Finance (Synced)</option>
                <option value="draft">Draft</option>
                <option value="rejected">Ditolak / Revisi</option>
              </select>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                type="button"
                onClick={fetchRecords}
                className="flex-1 md:flex-initial min-h-[44px] px-3 py-2 text-xs font-semibold rounded-xl border border-border-light bg-bg-white hover:bg-bg-secondary text-text-secondary flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Segarkan
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className="flex-1 md:flex-initial min-h-[44px] px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Buat Formulir Baru
              </button>
            </div>
          </div>

          {/* Table / Card Container with Responsive View */}
          {listLoading ? (
            <div className="py-16 text-center text-xs text-text-muted font-bold flex flex-col items-center justify-center gap-3">
              <div className="w-7 h-7 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Memuat arsip data dokumen SPKL...
            </div>
          ) : records.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-xs text-text-muted font-semibold m-0">Belum ada dokumen SPKL yang sesuai kriteria pencarian.</p>
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
              >
                Mulai Buat Formulir
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mobile View: High-Density Responsive ERP Cards */}
              <div className="md:hidden space-y-3">
                {records.map(rec => (
                  <div
                    key={rec._id}
                    className="p-3.5 bg-white border border-border-light rounded-2xl shadow-xs space-y-2.5 hover:border-blue-300 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <span className="font-mono font-bold text-xs text-blue-900 block">
                          {rec.spklNumber}
                        </span>
                        <span className="text-[11px] text-text-muted">
                          {formatWIBDate(rec.overtimeDate)}
                        </span>
                      </div>
                      <div>{getStatusBadge(rec.workflowStatus)}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-text-muted block">Pekerja:</span>
                        <span className="font-bold text-text-primary block truncate">
                          {rec.workerSnapshot?.fullName || rec.workerId?.fullName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          NIK: {rec.workerSnapshot?.nik || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-text-muted block">Proyek &amp; Lokasi:</span>
                        <span className="font-semibold text-text-primary block truncate">
                          {rec.projectId?.nama || 'Proyek'}
                        </span>
                        <span className="text-[10px] text-text-muted block truncate">
                          {rec.location}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-blue-50/60 border border-blue-100 rounded-xl text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Jadwal:</span>
                        <span className="font-medium text-slate-800">
                          {rec.scheduleActual?.startTime} - {rec.scheduleActual?.endTime} ({rec.scheduleActual?.breakMinutes || 0}m)
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-blue-700 font-bold block">Output Jam:</span>
                        <span className="font-mono font-bold text-blue-900 bg-white border border-blue-200 px-2 py-0.5 rounded-md inline-block">
                          {rec.scheduleActual?.effectiveHours || 0} Jam OT
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedRecordForDetail(rec)}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl border border-border-light bg-slate-50 hover:bg-slate-100 text-text-primary text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                        Detail SPKL
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportPdf(rec)}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5 text-blue-700" />
                        PDF 1:1
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View: Full Data Table */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-border-light">
                <table className="w-full text-left text-xs border-collapse min-w-[750px]">
                  <thead>
                    <tr className="bg-slate-50/80 text-text-secondary uppercase text-[10px] font-extrabold tracking-wider border-b border-border-light">
                      <th className="p-3">No. Dokumen SPKL</th>
                      <th className="p-3">Tanggal Lembur</th>
                      <th className="p-3">Pekerja</th>
                      <th className="p-3">Lokasi / Proyek</th>
                      <th className="p-3 text-center">Jadwal Lembur</th>
                      <th className="p-3 text-center">Output Jam Lembur</th>
                      <th className="p-3 text-center">Status Alur 4-Tier</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light font-medium bg-white">
                    {records.map(rec => (
                      <tr key={rec._id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="p-3 font-mono font-bold text-blue-900">
                          {rec.spklNumber}
                        </td>
                        <td className="p-3 text-text-secondary">
                          {formatWIBDate(rec.overtimeDate)}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-text-primary">{rec.workerSnapshot?.fullName || rec.workerId?.fullName}</div>
                          <div className="text-[10px] text-text-muted">
                            NIK: {rec.workerSnapshot?.nik || '-'} • {rec.workerSnapshot?.position || 'Pekerja'}
                          </div>
                        </td>
                        <td className="p-3 text-text-secondary">
                          <span className="font-semibold text-text-primary block">{rec.projectId?.nama || 'Proyek'}</span>
                          <span className="text-[10px] text-text-muted">{rec.location}</span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="font-semibold text-text-primary text-[11px]">
                            {rec.scheduleActual?.startTime} - {rec.scheduleActual?.endTime}
                          </div>
                          <div className="text-[10px] text-text-muted mt-0.5">
                            Istirahat: {rec.scheduleActual?.breakMinutes || 0}m
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="font-mono font-bold text-blue-900 bg-blue-100/70 border border-blue-200 px-2.5 py-1 rounded-lg">
                            {rec.scheduleActual?.effectiveHours || 0} Jam OT
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {getStatusBadge(rec.workflowStatus)}
                        </td>
                        <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedRecordForDetail(rec)}
                            className="px-2.5 py-1.5 rounded-lg border border-border-light hover:bg-bg-secondary text-text-secondary hover:text-blue-600 transition-colors cursor-pointer text-[11px] font-semibold"
                            title="Lihat Detail SPKL"
                          >
                            Detail
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportPdf(rec)}
                            className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors cursor-pointer text-[11px] font-bold inline-flex items-center gap-1"
                            title="Unduh PDF Resmi 1:1"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            PDF 1:1
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── 3. TAB 2: INPUT FORMULIR SPKL (INDIVIDU VS MASSAL) ──────────────── */}
      {activeTab === 'create' && (
        <div className="space-y-5">
          {/* Tactical Mode Switcher & Responsive View Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-border-light shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider shrink-0">Mode Pengisian:</span>
              <div className="grid grid-cols-2 sm:flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setEntryMode('individual')}
                  className={`min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    entryMode === 'individual'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Formulir Individu (Single + A4)</span>
                  <span className="sm:hidden">Individu (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('bulk')}
                  className={`min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    entryMode === 'bulk'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Penugasan Regu Massal (Crew)</span>
                  <span className="sm:hidden">Regu Massal</span>
                </button>
              </div>
            </div>

            {/* Mobile / Tablet View Switcher (Individual Mode Only) */}
            {entryMode === 'individual' && (
              <div className="flex items-center gap-2 lg:hidden">
                <span className="text-[11px] font-bold text-slate-500">Tampilan:</span>
                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-bold">
                  <button
                    onClick={() => setMobileFormView('form')}
                    className={`px-3 py-1 rounded-md transition-all ${mobileFormView === 'form' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    📝 Formulir
                  </button>
                  <button
                    onClick={() => setMobileFormView('preview')}
                    className={`px-3 py-1 rounded-md transition-all ${mobileFormView === 'preview' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    📄 Pratinjau A4
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── SUB-MODE A: FORMULIR INDIVIDU DENGAN LIVE A4 REPLICA PREVIEW ── */}
          {entryMode === 'individual' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Form Fields (Active on desktop, or on mobile when 'form' tab chosen) */}
              <div className={`space-y-4 lg:col-span-7 ${mobileFormView === 'preview' ? 'hidden lg:block' : 'block'}`}>
                {/* Section I: Identitas */}
                <Card className="p-4 sm:p-5 space-y-4 border border-border-light shadow-sm rounded-2xl">
                  <div className="flex items-center justify-between border-b pb-2.5">
                    <h3 className="text-xs font-black text-blue-900 uppercase tracking-wider m-0 flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-blue-600" />
                      I. Identitas Karyawan / Pelaksana Lembur
                    </h3>
                    <span className="text-[10px] text-text-muted font-medium">Standard FRM-MTE-HR-014</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-text-secondary mb-1">
                        Pilih Pekerja <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selectedWorkerId}
                        onChange={e => setSelectedWorkerId(e.target.value)}
                        className="w-full p-2.5 border border-border-light rounded-xl font-bold bg-bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 min-h-[44px]"
                      >
                        {workersList.map(w => (
                          <option key={w._id} value={w._id}>
                            {w.fullName} {w.role ? `(${w.role})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-text-secondary mb-1">Nomor Induk Karyawan (NIK)</label>
                      <input
                        type="text"
                        value={activeWorker?.nik || 'MTE-EMP-00' + (activeWorker?._id?.slice(-3) || '01')}
                        readOnly
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-700 min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-text-secondary mb-1">Departemen / Divisi</label>
                      <input
                        type="text"
                        value={departmentName}
                        onChange={e => setDepartmentName(e.target.value)}
                        placeholder="Contoh: Operasional Sipil / MEP"
                        className="w-full p-2.5 border border-border-light rounded-xl bg-bg-white outline-none focus:border-blue-500 min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-text-secondary mb-1">
                        Lokasi Proyek Penugasan <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selectedProjectId}
                        onChange={e => handleProjectSelect(e.target.value)}
                        className="w-full p-2.5 border border-border-light rounded-xl font-bold bg-bg-white outline-none focus:border-blue-500 min-h-[44px]"
                      >
                        {projects.map(p => (
                          <option key={p._id} value={p._id}>{p.nama}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </Card>

                {/* Section II: Jadwal & Realisasi */}
                <Card className="p-4 sm:p-5 space-y-4 border border-border-light shadow-sm rounded-2xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5">
                    <h3 className="text-xs font-black text-blue-900 uppercase tracking-wider m-0 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      II. Jadwal &amp; Realisasi Waktu Lembur
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-text-secondary">Hari/Tanggal:</span>
                      <input
                        type="date"
                        value={overtimeDate}
                        onChange={e => setOvertimeDate(e.target.value)}
                        className="p-1.5 text-xs font-bold border border-border-light rounded-lg bg-bg-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Shift Quick Presets */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Preset Jam Lembur Cepat:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {SHIFT_PRESETS.map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setPlanStart(p.start);
                            setPlanEnd(p.end);
                            setPlanBreak(p.brk);
                            setActStart(p.start);
                            setActEnd(p.end);
                            setActBreak(p.brk);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 transition-colors cursor-pointer"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Overnight Alert Banner */}
                  {isOvernightShift && (
                    <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-2 text-xs text-indigo-900 font-bold">
                      <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                      🌙 Shift Lembur Melintasi Tengah Malam (Perhitungan Otomatis +24 Jam)
                    </div>
                  )}

                  {/* Mobile View: Clean Stacked Schedule Cards */}
                  <div className="sm:hidden space-y-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                        <span className="font-bold text-xs text-slate-800">Rencana (Instruksi)</span>
                        <span className="font-mono font-bold text-xs text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {planDuration} Jam
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5 font-bold">Mulai</label>
                          <input
                            type="time"
                            value={planStart}
                            onChange={e => setPlanStart(e.target.value)}
                            className="w-full p-1.5 border border-border-light rounded-lg text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5 font-bold">Selesai</label>
                          <input
                            type="time"
                            value={planEnd}
                            onChange={e => setPlanEnd(e.target.value)}
                            className="w-full p-1.5 border border-border-light rounded-lg text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5 font-bold">Istirahat</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              step="15"
                              value={planBreak}
                              onChange={e => setPlanBreak(Number(e.target.value))}
                              className="w-full p-1.5 border border-border-light rounded-lg text-xs bg-white text-center"
                            />
                            <span className="text-[10px] text-slate-400">m</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between border-b border-emerald-100 pb-1.5">
                        <span className="font-bold text-xs text-emerald-950">Aktual Realisasi</span>
                        <span className="font-mono font-bold text-xs text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-200">
                          {actDuration} Jam Efektif
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5 font-bold">Mulai</label>
                          <input
                            type="time"
                            value={actStart}
                            onChange={e => setActStart(e.target.value)}
                            className="w-full p-1.5 border border-emerald-300 rounded-lg text-xs bg-white font-bold text-emerald-950"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5 font-bold">Selesai</label>
                          <input
                            type="time"
                            value={actEnd}
                            onChange={e => setActEnd(e.target.value)}
                            className="w-full p-1.5 border border-emerald-300 rounded-lg text-xs bg-white font-bold text-emerald-950"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5 font-bold">Istirahat</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              step="15"
                              value={actBreak}
                              onChange={e => setActBreak(Number(e.target.value))}
                              className="w-full p-1.5 border border-emerald-300 rounded-lg text-xs bg-white font-bold text-emerald-950 text-center"
                            />
                            <span className="text-[10px] text-slate-400">m</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Desktop View: 2-Row Dual Table */}
                  <div className="hidden sm:block overflow-x-auto rounded-xl border border-blue-200">
                    <table className="w-full text-xs text-left border-collapse min-w-[500px]">
                      <thead className="bg-blue-50 text-blue-950 font-bold text-[10px] uppercase border-b border-blue-200">
                        <tr>
                          <th className="p-2.5">Tahapan Waktu</th>
                          <th className="p-2.5">Jam Mulai</th>
                          <th className="p-2.5">Jam Selesai</th>
                          <th className="p-2.5">Istirahat</th>
                          <th className="p-2.5 text-center">Durasi Efektif</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-100 font-medium bg-white">
                        {/* Row 1: Rencana */}
                        <tr className="bg-slate-50/50">
                          <td className="p-2.5 font-bold text-slate-800">Rencana (Instruksi)</td>
                          <td className="p-2">
                            <input
                              type="time"
                              value={planStart}
                              onChange={e => setPlanStart(e.target.value)}
                              className="p-1.5 border border-border-light rounded-lg text-xs w-24 bg-white"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="time"
                              value={planEnd}
                              onChange={e => setPlanEnd(e.target.value)}
                              className="p-1.5 border border-border-light rounded-lg text-xs w-24 bg-white"
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="15"
                                value={planBreak}
                                onChange={e => setPlanBreak(Number(e.target.value))}
                                className="p-1.5 border border-border-light rounded-lg text-xs w-16 bg-white"
                              />
                              <span className="text-[10px] text-slate-500">m</span>
                            </div>
                          </td>
                          <td className="p-2 text-center font-bold text-slate-800 font-mono">
                            {planDuration} Jam
                          </td>
                        </tr>

                        {/* Row 2: Aktual */}
                        <tr className="bg-white">
                          <td className="p-2.5 font-bold text-emerald-900">Aktual Realisasi</td>
                          <td className="p-2">
                            <input
                              type="time"
                              value={actStart}
                              onChange={e => setActStart(e.target.value)}
                              className="p-1.5 border border-emerald-300 rounded-lg text-xs w-24 bg-white font-bold text-emerald-950"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="time"
                              value={actEnd}
                              onChange={e => setActEnd(e.target.value)}
                              className="p-1.5 border border-emerald-300 rounded-lg text-xs w-24 bg-white font-bold text-emerald-950"
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="15"
                                value={actBreak}
                                onChange={e => setActBreak(Number(e.target.value))}
                                className="p-1.5 border border-emerald-300 rounded-lg text-xs w-16 bg-white font-bold text-emerald-950"
                              />
                              <span className="text-[10px] text-slate-500">m</span>
                            </div>
                          </td>
                          <td className="p-2 text-center font-black text-emerald-800 font-mono bg-emerald-50/60">
                            {actDuration} Jam
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* OT Hours Output Summary Card */}
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-black text-blue-900 block tracking-wide">
                        Output Otorisasi Jam Lembur (OT Hours)
                      </span>
                      <span className="font-black text-blue-950 text-base">
                        {actDuration} Jam Lembur Efektif
                      </span>
                      <span className="text-[10px] text-blue-700 block mt-0.5">
                        Dokumen ini menghasilkan jam lembur resmi yang diverifikasi dan disinkronkan ke Presensi &amp; Payroll.
                      </span>
                    </div>

                    <div className="text-right sm:text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Jam OT Disetujui</span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-xs">
                        <Clock className="w-3.5 h-3.5" />
                        {actDuration} Jam OT
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Section III: Rincian Pekerjaan & Output */}
                <Card className="p-4 sm:p-5 space-y-4 border border-border-light shadow-sm rounded-2xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5">
                    <h3 className="text-xs font-black text-blue-900 uppercase tracking-wider m-0 flex items-center gap-2">
                      <Award className="w-4 h-4 text-blue-600" />
                      III. Rincian Pekerjaan &amp; Hasil Yang Dicapai (Output)
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleAddWorkItem('')}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-border-light bg-bg-white hover:bg-bg-secondary text-text-secondary transition-colors cursor-pointer self-start sm:self-auto"
                    >
                      + Tambah Baris Tugas
                    </button>
                  </div>

                  {/* Linked Project WBS Task Chips */}
                  {loadingWbs ? (
                    <div className="p-2.5 bg-blue-50/50 border border-blue-200 rounded-xl text-[11px] text-blue-700 flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Memuat data WBS dari proyek terpilih...</span>
                    </div>
                  ) : projectWbsTasks.length > 0 ? (
                    <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-blue-600" />
                          WBS Proyek Terkait ({projectWbsTasks.length} Pekerjaan Terdaftar):
                        </span>
                        <span className="text-[10px] text-blue-700 hidden sm:inline">Klik item untuk menambah baris otomatis</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                        {projectWbsTasks.map(task => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => handleAddWbsItem(task)}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white hover:bg-blue-600 hover:text-white text-slate-700 transition-all cursor-pointer border border-blue-200 shadow-2xs flex items-center gap-1 group text-left"
                            title={`Tambah baris: ${task.name}`}
                          >
                            <Plus className="w-3 h-3 text-blue-600 group-hover:text-white flex-shrink-0" />
                            {task.wbsCode ? <span className="font-mono font-bold text-blue-800 group-hover:text-white flex-shrink-0">[{task.wbsCode}]</span> : null}
                            <span className="truncate max-w-[200px]">{task.name}</span>
                            {task.volume && <span className="text-[9px] text-slate-400 group-hover:text-blue-100 flex-shrink-0">({task.volume})</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] text-slate-500 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      Proyek ini belum memiliki WBS terdaftar. Anda dapat mengetik uraian pekerjaan secara bebas atau memilih template umum di bawah.
                    </div>
                  )}

                  {/* Categorized Template Chips */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Template Pekerjaan Cepat (Opsional):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(CATEGORIZED_TEMPLATES).map(([category, items]) => (
                        <div key={category} className="contents">
                          {items.slice(0, 2).map((tmpl, tIdx) => (
                            <button
                              key={`${category}-${tIdx}`}
                              type="button"
                              onClick={() => handleAddWorkItem(tmpl)}
                              className="px-2 py-0.5 text-[10px] rounded-md bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 transition-colors cursor-pointer border border-slate-200"
                            >
                              + {tmpl}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mobile View: High-Density Task Item Cards */}
                  <div className="md:hidden space-y-3">
                    {workItems.map((item, idx) => (
                      <div key={idx} className="p-3 bg-white border border-border-light rounded-xl shadow-xs space-y-2.5">
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                          <span className="font-bold text-xs text-blue-900 flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[10px]">
                              {idx + 1}
                            </span>
                            Tugas Lembur #{idx + 1}
                          </span>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.isFinished}
                                onChange={e => handleUpdateWorkItem(idx, 'isFinished', e.target.checked)}
                                className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                              />
                              <span>Selesai</span>
                            </label>
                            {workItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveWorkItem(idx)}
                                className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                                title="Hapus tugas"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {projectWbsTasks.length > 0 && (
                          <select
                            defaultValue=""
                            onChange={e => {
                              handleSelectWbsForWorkItem(idx, e.target.value);
                              e.target.value = '';
                            }}
                            className="w-full p-2 text-xs border border-blue-200 bg-blue-50/50 rounded-lg text-blue-900 outline-none"
                          >
                            <option value="">🏷️ Ambil dari WBS Proyek... (Opsional)</option>
                            {projectWbsTasks.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.wbsCode ? `[${t.wbsCode}] ` : ''}{t.name} ({t.volume})
                              </option>
                            ))}
                          </select>
                        )}

                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Uraian Tugas Lembur:</label>
                          <input
                            type="text"
                            placeholder="Uraian pekerjaan (pilih WBS atau ketik kustom)..."
                            value={item.taskDescription}
                            onChange={e => handleUpdateWorkItem(idx, 'taskDescription', e.target.value)}
                            className="w-full p-2 text-xs border border-border-light rounded-lg outline-none focus:border-blue-500 bg-white"
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Vol. Rencana</label>
                            <input
                              type="text"
                              placeholder="Mis: 45 m²"
                              value={item.volumePlanned}
                              onChange={e => handleUpdateWorkItem(idx, 'volumePlanned', e.target.value)}
                              className="w-full p-2 text-xs border border-border-light rounded-lg bg-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Vol. Aktual</label>
                            <input
                              type="text"
                              placeholder="Mis: 45 m²"
                              value={item.volumeActual}
                              onChange={e => handleUpdateWorkItem(idx, 'volumeActual', e.target.value)}
                              className="w-full p-2 text-xs border border-border-light rounded-lg bg-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Progress (%)</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.progressPercent}
                              onChange={e => handleUpdateWorkItem(idx, 'progressPercent', Number(e.target.value))}
                              className="w-full p-2 text-xs border border-border-light rounded-lg bg-white font-mono text-center"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop View: Full Table */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-border-light">
                    <table className="w-full text-xs text-left border-collapse min-w-[550px]">
                      <thead className="bg-slate-50 text-slate-700 font-bold text-[10px] uppercase border-b border-border-light">
                        <tr>
                          <th className="p-2 text-center w-8">No</th>
                          <th className="p-2">Uraian Tugas Lembur (WBS / Kustom)</th>
                          <th className="p-2 w-24">Vol. Rencana</th>
                          <th className="p-2 w-24">Vol. Aktual</th>
                          <th className="p-2 text-center w-14">Finish</th>
                          <th className="p-2 text-center w-14">(%)</th>
                          <th className="p-2 text-center w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-light bg-white">
                        {workItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-2 text-center font-bold text-slate-400">{idx + 1}</td>
                            <td className="p-1.5 space-y-1">
                              {projectWbsTasks.length > 0 && (
                                <select
                                  defaultValue=""
                                  onChange={e => {
                                    handleSelectWbsForWorkItem(idx, e.target.value);
                                    e.target.value = '';
                                  }}
                                  className="w-full p-1 text-[10px] border border-blue-200 bg-blue-50/40 rounded text-blue-900 outline-none cursor-pointer focus:border-blue-500"
                                >
                                  <option value="">🏷️ Ambil dari WBS Proyek... (Opsional)</option>
                                  {projectWbsTasks.map(t => (
                                    <option key={t.id} value={t.id}>
                                      {t.wbsCode ? `[${t.wbsCode}] ` : ''}{t.name} ({t.volume})
                                    </option>
                                  ))}
                                </select>
                              )}
                              <input
                                type="text"
                                placeholder="Uraian pekerjaan (pilih WBS atau ketik kustom)..."
                                value={item.taskDescription}
                                onChange={e => handleUpdateWorkItem(idx, 'taskDescription', e.target.value)}
                                className="w-full p-2 text-xs border border-border-light rounded-lg outline-none focus:border-blue-500 bg-white"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                placeholder="Mis: 45 m²"
                                value={item.volumePlanned}
                                onChange={e => handleUpdateWorkItem(idx, 'volumePlanned', e.target.value)}
                                className="w-full p-2 text-xs border border-border-light rounded-lg outline-none bg-white font-mono"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                placeholder="Mis: 45 m²"
                                value={item.volumeActual}
                                onChange={e => handleUpdateWorkItem(idx, 'volumeActual', e.target.value)}
                                className="w-full p-2 text-xs border border-border-light rounded-lg outline-none bg-white font-mono"
                              />
                            </td>
                            <td className="p-1.5 text-center">
                              <input
                                type="checkbox"
                                checked={item.isFinished}
                                onChange={e => handleUpdateWorkItem(idx, 'isFinished', e.target.checked)}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={item.progressPercent}
                                onChange={e => handleUpdateWorkItem(idx, 'progressPercent', Number(e.target.value))}
                                className="w-full p-2 text-xs border border-border-light rounded-lg outline-none bg-white font-mono text-center"
                              />
                            </td>
                            <td className="p-1.5 text-center">
                              {workItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveWorkItem(idx)}
                                  className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                                  title="Hapus baris tugas"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Section IV: Alokasi & Penugasan Otorisasi */}
                <Card className="p-4 sm:p-5 space-y-4 border border-border-light shadow-sm rounded-2xl bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-black text-blue-900 uppercase tracking-wider m-0 flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-blue-600" />
                          IV. Penugasan Otorisasi (Verifikator &amp; Approver)
                        </h3>
                        {isOwner ? (
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                            👑 Khusus Owner
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5 text-slate-400" />
                            Ditetapkan Owner
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-text-muted m-0 mt-0.5">
                        Alur otorisasi berjenjang 3 tahap (Supervisor Lapangan ➔ Project Manager ➔ Finance &amp; Payroll).
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {isOwner ? (
                        <button
                          type="button"
                          onClick={() => openAllocationModal()}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer hover:shadow"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          Alokasi Verifikator
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-emerald-600" />
                          Notifikasi Otomatis Aktif
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 3 Executive Verification Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Stage 1: Supervisor */}
                    <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200/90 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-amber-950 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-amber-700" />
                          1. Supervisor Lapangan
                        </span>
                        <span className="text-[9px] font-bold uppercase text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                          Tahap 1
                        </span>
                      </div>
                      <div className="font-bold text-slate-900 text-xs truncate">
                        {assignedSupervisorUser?.fullName || 'Belum Ditugaskan'}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {assignedSupervisorUser ? `${assignedSupervisorUser.role?.toUpperCase()} • ${assignedSupervisorUser.department || 'Operasional'}` : 'Pilih via Alokasi Verifikator'}
                      </div>
                      <div className="text-[9px] text-amber-700 font-medium pt-1 border-t border-amber-200/60 flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                        <span>Verifikasi absensi &amp; jam aktual lembur</span>
                      </div>
                    </div>

                    {/* Stage 2: PM */}
                    <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-200/90 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-blue-950 flex items-center gap-1">
                          <Award className="w-3.5 h-3.5 text-blue-700" />
                          2. Project Manager
                        </span>
                        <span className="text-[9px] font-bold uppercase text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                          Tahap 2
                        </span>
                      </div>
                      <div className="font-bold text-slate-900 text-xs truncate">
                        {assignedPmUser?.fullName || 'Belum Ditugaskan'}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {assignedPmUser ? `${assignedPmUser.role?.toUpperCase()} • ${assignedPmUser.department || 'Proyek'}` : 'Pilih via Alokasi Verifikator'}
                      </div>
                      <div className="text-[9px] text-blue-700 font-medium pt-1 border-t border-blue-200/60 flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                        <span>Persetujuan capaian &amp; anggaran proyek</span>
                      </div>
                    </div>

                    {/* Stage 3: Finance */}
                    <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200/90 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-emerald-950 flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-emerald-700" />
                          3. Finance Director
                        </span>
                        <span className="text-[9px] font-bold uppercase text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                          Tahap 3
                        </span>
                      </div>
                      <div className="font-bold text-slate-900 text-xs truncate">
                        {assignedFinanceUser?.fullName || 'Belum Ditugaskan'}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {assignedFinanceUser ? `${assignedFinanceUser.role?.toUpperCase()} • ${assignedFinanceUser.department || 'Keuangan'}` : 'Pilih via Alokasi Verifikator'}
                      </div>
                      <div className="text-[9px] text-emerald-700 font-medium pt-1 border-t border-emerald-200/60 flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                        <span>Otorisasi final &amp; sinkronisasi slip gaji</span>
                      </div>
                    </div>
                  </div>

                  {isOwner && (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-600">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>Ingin mengubah pejabat verifikator untuk dokumen ini?</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openAllocationModal()}
                        className="text-amber-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        Buka Modal Alokasi Verifikator
                      </button>
                    </div>
                  )}
                </Card>

                {/* Form Actions Footer */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleSubmitIndividual(true)}
                    className="min-h-[44px] px-4 py-2.5 text-xs font-bold rounded-xl border border-border-light bg-bg-white hover:bg-bg-secondary text-text-secondary transition-colors cursor-pointer"
                  >
                    Simpan Draft Sementara
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmitIndividual(false)}
                    className="min-h-[44px] px-5 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Terbitkan SPKL &amp; Ajukan Otorisasi
                  </button>
                </div>
              </div>

              {/* Right Column: EXECUTIVE LIVE A4 REPLICA PREVIEW */}
              <div className={`lg:col-span-5 ${mobileFormView === 'form' ? 'hidden lg:block' : 'block'}`}>
                <div className="sticky top-20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-text-secondary uppercase flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-blue-600" />
                      Live Executive Replica (Standar 1:1 A4)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowA4Fullscreen(true)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      Perbesar
                    </button>
                  </div>

                  {/* High-Fidelity Paper Sheet */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-2xl ring-1 ring-slate-900/5 font-sans text-[10px] text-slate-800 space-y-3.5 max-h-[84vh] overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-start justify-between border-b pb-2">
                      <div>
                        <div className="text-xs font-black text-slate-900 tracking-tight">PT MEGA TAMA ENERCO</div>
                        <div className="text-[7.5px] text-slate-500">Jl. Raya Alun-Alun Pangalengan No. 221</div>
                        <div className="text-[7.5px] text-slate-500">www.mte.megatama-enerco.com</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[7.5px] font-bold text-blue-600">ISO 9001 | 14001 | 45001</div>
                        <div className="text-[7.5px] font-extrabold text-emerald-600">SMK3 TERVERIFIKASI</div>
                      </div>
                    </div>

                    <div className="text-center pt-0.5">
                      <div className="text-[11px] font-black uppercase text-slate-900">
                        SURAT PERINTAH &amp; BUKTI KERJA LEMBUR (SPKL)
                      </div>
                      <div className="text-[7px] text-red-700 italic">
                        Dokumen Resmi Bukti Penugasan, Pelaksanaan dan Pengajuan Kompensasi Lembur Karyawan
                      </div>
                    </div>

                    {/* Section I */}
                    <div className="border border-blue-900 rounded">
                      <div className="bg-blue-800 text-white font-bold text-[8px] px-2 py-0.5">
                        I. IDENTITAS KARYAWAN / PELAKSANA LEMBUR
                      </div>
                      <div className="p-2 space-y-1 text-[8px]">
                        <div>Nama Lengkap : <span className="font-bold">{activeWorker?.fullName || '-'}</span></div>
                        <div>NIK : <span className="font-mono">{activeWorker?.nik || 'MTE-EMP-001'}</span></div>
                        <div>Departemen : {departmentName}</div>
                        <div>Lokasi : {locationName || '-'}</div>
                        <div>Output Lembur : <span className="font-mono font-bold text-blue-900">{actDuration} Jam Lembur Efektif</span></div>
                      </div>
                    </div>

                    {/* Section II */}
                    <div className="border border-blue-900 rounded">
                      <div className="bg-blue-800 text-white font-bold text-[8px] px-2 py-0.5">
                        II. JADWAL &amp; REALISASI WAKTU LEMBUR
                      </div>
                      <div className="p-1 text-[7px] font-bold">
                        Hari/Tanggal Lembur : {formatWIBDate(overtimeDate)}
                      </div>
                      <table className="w-full text-[7px] border-t border-blue-200">
                        <thead className="bg-blue-100 text-blue-950 font-bold">
                          <tr>
                            <th className="p-1">Tahapan</th>
                            <th className="p-1 text-center">Mulai</th>
                            <th className="p-1 text-center">Selesai</th>
                            <th className="p-1 text-center">Istirahat</th>
                            <th className="p-1 text-center">Durasi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-100 text-center">
                          <tr>
                            <td className="p-1 text-left font-semibold">Rencana</td>
                            <td>{planStart}</td>
                            <td>{planEnd}</td>
                            <td>{planBreak}m</td>
                            <td className="font-bold">{planDuration}h</td>
                          </tr>
                          <tr className="bg-blue-50/40">
                            <td className="p-1 text-left font-bold text-emerald-800">Aktual</td>
                            <td>{actStart}</td>
                            <td>{actEnd}</td>
                            <td>{actBreak}m</td>
                            <td className="font-black text-emerald-800">{actDuration}h</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Section III */}
                    <div className="border border-blue-900 rounded">
                      <div className="bg-blue-800 text-white font-bold text-[8px] px-2 py-0.5">
                        III. RINCIAN PEKERJAAN &amp; HASIL YANG DICAPAI (OUTPUT)
                      </div>
                      <table className="w-full text-[7px] text-left">
                        <thead className="bg-blue-100 text-blue-950 font-bold">
                          <tr>
                            <th className="p-1 w-4 text-center">No</th>
                            <th className="p-1">Uraian Pekerjaan</th>
                            <th className="p-1 text-center w-12">Rencana</th>
                            <th className="p-1 text-center w-12">Aktual</th>
                            <th className="p-1 text-center w-8">Finish</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {workItems.map((it, idx) => (
                            <tr key={idx}>
                              <td className="p-1 text-center">{idx + 1}</td>
                              <td className="p-1 font-semibold">{it.taskDescription || '-'}</td>
                              <td className="p-1 text-center">{it.volumePlanned || '-'}</td>
                              <td className="p-1 text-center">{it.volumeActual || '-'}</td>
                              <td className="p-1 text-center">{it.isFinished ? 'Ya' : 'Belum'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Section IV Signatures */}
                    <div className="border border-blue-900 rounded">
                      <div className="bg-blue-800 text-white font-bold text-[8px] px-2 py-0.5">
                        IV. TANDA TANGAN PERSETUJUAN &amp; VERIFIKASI
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 text-center text-[8px] sm:text-[7px] gap-2 sm:gap-0 sm:divide-x divide-slate-300 py-2">
                        <div className="p-1">
                          <div className="font-bold">Karyawan</div>
                          <div className="text-[7px] sm:text-[6px] text-slate-500">Pelaksana Lembur</div>
                          <div className="h-6 flex items-center justify-center font-bold text-emerald-700">[TTD]</div>
                          <div className="truncate">( {activeWorker?.fullName || 'Pemohon'} )</div>
                          <div className="text-[7px] sm:text-[6px] text-slate-400">tgl: {overtimeDate}</div>
                        </div>
                        <div className="p-1">
                          <div className="font-bold">Supervisor</div>
                          <div className="text-[7px] sm:text-[6px] text-slate-500">Verificator</div>
                          <div className="h-6 flex items-center justify-center font-bold text-amber-700">[Verif]</div>
                          <div className="truncate">( {assignedSupervisorUser?.fullName || user?.fullName || 'Supervisor'} )</div>
                          <div className="text-[7px] sm:text-[6px] text-slate-400">tgl: {overtimeDate}</div>
                        </div>
                        <div className="p-1">
                          <div className="font-bold">Project Manager</div>
                          <div className="text-[7px] sm:text-[6px] text-slate-500">Approval</div>
                          <div className="h-6 flex items-center justify-center text-slate-400">[Pending]</div>
                          <div className="truncate">( {assignedPmUser?.fullName || 'Project Manager'} )</div>
                          <div className="text-[7px] sm:text-[6px] text-slate-400">tgl: ___/___/___</div>
                        </div>
                        <div className="p-1">
                          <div className="font-bold">Finance Dir</div>
                          <div className="text-[7px] sm:text-[6px] text-slate-500">Verifikasi Final</div>
                          <div className="h-6 flex items-center justify-center text-slate-400">[Pending]</div>
                          <div className="truncate">( {assignedFinanceUser?.fullName || 'Finance Director'} )</div>
                          <div className="text-[7px] sm:text-[6px] text-slate-400">tgl: ___/___/___</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SUB-MODE B: PENUGASAN REGU MASSAL (BULK CREW WIZARD & MATRIX) ── */}
          {entryMode === 'bulk' && (
            <div className="space-y-5">
              {/* Parameter Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border border-border-light shadow-sm space-y-2.5 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-blue-900 block tracking-wider">
                    1. Proyek &amp; Tanggal Lembur
                  </span>
                  <div className="space-y-2 text-xs">
                    <select
                      value={selectedProjectId}
                      onChange={e => handleProjectSelect(e.target.value)}
                      className="w-full p-2.5 border border-border-light rounded-xl font-bold bg-white outline-none focus:border-blue-500 min-h-[44px]"
                    >
                      {projects.map(p => (
                        <option key={p._id} value={p._id}>{p.nama}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={overtimeDate}
                      onChange={e => setOvertimeDate(e.target.value)}
                      className="w-full p-2.5 border border-border-light rounded-xl font-bold bg-white outline-none focus:border-blue-500 min-h-[44px]"
                    />
                  </div>
                </Card>

                <Card className="p-4 border border-border-light shadow-sm space-y-2.5 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-emerald-900 block tracking-wider">
                    2. Jadwal Standar Regu
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="text-[9px] font-bold text-text-muted block">Mulai</label>
                      <input
                        type="time"
                        value={actStart}
                        onChange={e => setActStart(e.target.value)}
                        className="w-full p-2 border border-border-light rounded-lg bg-white text-xs min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-text-muted block">Selesai</label>
                      <input
                        type="time"
                        value={actEnd}
                        onChange={e => setActEnd(e.target.value)}
                        className="w-full p-2 border border-border-light rounded-lg bg-white text-xs min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-text-muted block">Istirahat</label>
                      <input
                        type="number"
                        min="0"
                        value={actBreak}
                        onChange={e => setActBreak(Number(e.target.value))}
                        className="w-full p-2 border border-border-light rounded-lg bg-white text-xs min-h-[44px]"
                      />
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-emerald-800">
                    Durasi Efektif Standar: <span className="font-mono text-sm">{actDuration} Jam</span>
                  </div>
                </Card>

                <Card className="p-4 border border-border-light shadow-sm space-y-2 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-purple-900 block tracking-wider">
                      3. Tugas Utama Tim Bersama
                    </span>
                    {projectWbsTasks.length > 0 && (
                      <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                        WBS Aktif
                      </span>
                    )}
                  </div>
                  {projectWbsTasks.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={e => {
                        const t = projectWbsTasks.find(x => x.id === e.target.value);
                        if (t) {
                          handleUpdateWorkItem(0, 'taskDescription', (t.wbsCode ? `[${t.wbsCode}] ` : '') + t.name);
                          if (t.volume) handleUpdateWorkItem(0, 'volumePlanned', t.volume);
                        }
                        e.target.value = '';
                      }}
                      className="w-full p-2 text-xs border border-purple-200 bg-purple-50/50 rounded-lg text-purple-900 outline-none cursor-pointer focus:border-purple-500"
                    >
                      <option value="">🏷️ Ambil dari WBS Proyek... (Opsional)</option>
                      {projectWbsTasks.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.wbsCode ? `[${t.wbsCode}] ` : ''}{t.name} ({t.volume})
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    placeholder="Deskripsi tugas lembur regu (WBS atau kustom)..."
                    value={workItems[0]?.taskDescription || ''}
                    onChange={e => handleUpdateWorkItem(0, 'taskDescription', e.target.value)}
                    className="w-full p-2.5 border border-border-light rounded-xl text-xs bg-white outline-none focus:border-purple-500 min-h-[44px]"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Vol. Rencana (mis: 45 m³)"
                      value={workItems[0]?.volumePlanned || ''}
                      onChange={e => handleUpdateWorkItem(0, 'volumePlanned', e.target.value)}
                      className="w-1/2 p-2 border border-border-light rounded-lg text-xs bg-white font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Vol. Aktual (mis: 45 m³)"
                      value={workItems[0]?.volumeActual || ''}
                      onChange={e => handleUpdateWorkItem(0, 'volumeActual', e.target.value)}
                      className="w-1/2 p-2 border border-border-light rounded-lg text-xs bg-white font-mono"
                    />
                  </div>
                </Card>
              </div>

              {/* Worker Selection with Role Filters & Search */}
              <Card className="p-4 sm:p-5 space-y-3.5 border border-border-light shadow-sm rounded-2xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-black text-text-primary uppercase tracking-wider m-0">
                      Pilih Anggota Regu / Crew Lapangan ({bulkWorkers.length} Terpilih)
                    </h3>
                    <p className="text-[11px] text-text-muted m-0">Centang atau klik nama pekerja yang bertugas pada regu lembur ini.</p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    {/* Role Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                      {['all', 'mandor', 'tukang', 'helper', 'worker'].map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setBulkRoleFilter(r)}
                          className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg uppercase transition-all cursor-pointer shrink-0 ${
                            bulkRoleFilter === r
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {r === 'all' ? 'Semua' : r}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="relative flex-1 sm:w-44">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Cari nama/NIK..."
                          value={bulkWorkerSearch}
                          onChange={e => setBulkWorkerSearch(e.target.value)}
                          className="w-full pl-7 pr-3 py-1.5 text-xs border border-border-light rounded-xl bg-white min-h-[38px] outline-none focus:border-blue-500"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          filteredBulkWorkerCandidates.slice(0, 10).forEach(toggleWorkerInBulk);
                        }}
                        className="min-h-[38px] px-3 py-1.5 text-[11px] font-bold rounded-xl border border-border-light bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer shrink-0"
                      >
                        + 10
                      </button>
                      {bulkWorkers.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setBulkWorkers([])}
                          className="min-h-[38px] px-3 py-1.5 text-[11px] font-bold rounded-xl text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 max-h-56 overflow-y-auto p-2 bg-slate-50/70 rounded-xl border border-border-light">
                  {filteredBulkWorkerCandidates.map(w => {
                    const isSelected = bulkWorkers.some(x => x.workerId === w._id);
                    return (
                      <button
                        key={w._id}
                        type="button"
                        onClick={() => toggleWorkerInBulk(w)}
                        className={`p-2.5 rounded-xl text-left text-xs border transition-all cursor-pointer min-h-[44px] ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                            : 'bg-white text-text-primary border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="font-bold truncate">{w.fullName}</div>
                        <div className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                          {w.role || 'Pekerja'} • {w.nik || 'NIK -'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>

              {/* Reactive Variance Matrix Grid (ERP Spreadsheet Style) */}
              {bulkWorkers.length > 0 && (
                <Card className="p-4 sm:p-5 space-y-4 border-2 border-blue-500/40 shadow-md rounded-2xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-black text-blue-900 uppercase tracking-wider m-0 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-600" />
                        Variance Matrix Grid (Edit Jam Lembur &amp; Waktu Pulang Per-Pekerja)
                      </h3>
                      <p className="text-[11px] text-text-muted m-0">
                        Sesuaikan waktu lembur individu atau jam pulang masing-masing regu. Total jam lembur efektif dihitung otomatis.
                      </p>
                    </div>

                    {/* Batch Quick Updaters */}
                    <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500">Jam Pulang Semua:</span>
                        <input
                          type="time"
                          value={bulkGlobalEndTime}
                          onChange={e => setBulkGlobalEndTime(e.target.value)}
                          className="p-1 border rounded bg-white text-xs w-20"
                        />
                        <button
                          type="button"
                          onClick={handleApplyGlobalEndTime}
                          className="px-2 py-1 bg-blue-600 text-white rounded text-[10px] font-bold cursor-pointer"
                        >
                          Terapkan Semua
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Summary Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-blue-50/80 rounded-xl border border-blue-200 text-xs font-bold text-blue-950">
                    <div>Total Regu: <span className="font-mono text-sm">{bulkWorkers.length} Orang</span></div>
                    <div>Total Man-Hours Lembur: <span className="font-mono text-sm text-blue-800">
                      {bulkWorkers.reduce((acc, curr) => acc + (curr.effectiveHours || actDuration), 0)} Jam OT Efektif
                    </span></div>
                  </div>

                  {/* Mobile View: Responsive Bulk Worker Cards */}
                  <div className="md:hidden space-y-3">
                    {bulkWorkers.map(bw => (
                      <div key={bw.workerId} className="p-3 bg-white border border-blue-200 rounded-xl space-y-2.5 shadow-2xs">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-bold text-xs text-text-primary block">{bw.fullName}</span>
                            <span className="text-[10px] text-slate-500 font-mono">NIK: {bw.nik || '-'} • <span className="text-blue-700 font-bold">{bw.role}</span></span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleWorkerInBulk({ _id: bw.workerId })}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                            title="Hapus dari regu"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Mulai</label>
                            <input
                              type="time"
                              value={bw.actualStartTime || actStart}
                              onChange={e => handleUpdateBulkWorker(bw.workerId, 'actualStartTime', e.target.value)}
                              className="w-full p-1.5 border border-border-light rounded-lg bg-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Selesai</label>
                            <input
                              type="time"
                              value={bw.actualEndTime || actEnd}
                              onChange={e => handleUpdateBulkWorker(bw.workerId, 'actualEndTime', e.target.value)}
                              className="w-full p-1.5 border border-blue-300 rounded-lg bg-white text-xs font-bold text-blue-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Istirahat (m)</label>
                            <input
                              type="number"
                              min="0"
                              step="5"
                              value={bw.actualBreakMinutes ?? actBreak}
                              onChange={e => handleUpdateBulkWorker(bw.workerId, 'actualBreakMinutes', Number(e.target.value))}
                              className="w-full p-1.5 border border-border-light rounded-lg bg-white text-xs text-center"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-xs">
                          <span className="text-[11px] text-slate-500">Output Jam Lembur:</span>
                          <span className="font-mono font-bold text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md">
                            {bw.effectiveHours || actDuration} Jam OT
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop View: Spreadsheet Grid */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-border-light">
                    <table className="w-full text-xs text-left border-collapse min-w-[650px]">
                      <thead className="bg-slate-50 text-slate-700 font-bold text-[10px] uppercase border-b border-border-light">
                        <tr>
                          <th className="p-2.5">Nama Anggota</th>
                          <th className="p-2.5">Peran</th>
                          <th className="p-2.5">Mulai Lembur</th>
                          <th className="p-2.5">Selesai (Override)</th>
                          <th className="p-2.5 text-center">Istirahat (m)</th>
                          <th className="p-2.5 text-center">Jam Lembur Efektif</th>
                          <th className="p-2.5 text-center w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-light font-medium bg-white">
                        {bulkWorkers.map(bw => (
                          <tr key={bw.workerId} className="hover:bg-slate-50/60">
                            <td className="p-2.5 font-bold text-text-primary">
                              {bw.fullName}
                              <div className="text-[10px] text-slate-400 font-normal">NIK: {bw.nik || '-'}</div>
                            </td>
                            <td className="p-2.5 text-text-secondary">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-semibold">
                                {bw.role}
                              </span>
                            </td>
                            <td className="p-2">
                              <input
                                type="time"
                                value={bw.actualStartTime || actStart}
                                onChange={e => handleUpdateBulkWorker(bw.workerId, 'actualStartTime', e.target.value)}
                                className="p-1 border border-border-light rounded text-xs w-24 bg-white"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="time"
                                value={bw.actualEndTime || actEnd}
                                onChange={e => handleUpdateBulkWorker(bw.workerId, 'actualEndTime', e.target.value)}
                                className="p-1 border border-blue-300 rounded text-xs w-24 bg-white font-bold text-blue-900"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="number"
                                min="0"
                                step="5"
                                value={bw.actualBreakMinutes ?? actBreak}
                                onChange={e => handleUpdateBulkWorker(bw.workerId, 'actualBreakMinutes', Number(e.target.value))}
                                className="p-1 border border-border-light rounded text-xs w-16 text-center bg-white"
                              />
                            </td>
                            <td className="p-2 text-center font-bold font-mono text-blue-800">
                              <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200">
                                {bw.effectiveHours || actDuration} Jam OT
                              </span>
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => toggleWorkerInBulk({ _id: bw.workerId })}
                                className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Bulk Otorisasi Assignment Card */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-black text-slate-900 uppercase tracking-wide">
                          Penugasan Otorisasi Batch ({bulkWorkers.length} Dokumen SPKL)
                        </span>
                        {isOwner ? (
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                            👑 Khusus Owner
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                            🔒 Ditetapkan Owner
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isOwner ? (
                          <button
                            type="button"
                            onClick={() => openAllocationModal()}
                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            Alokasi Verifikator
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                            🔔 Web Push Aktif
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-1">
                        <span className="text-[10px] font-black uppercase text-amber-950 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-amber-700" />
                          1. Supervisor (Tahap 1)
                        </span>
                        <div className="font-bold text-slate-900 text-xs truncate">
                          {assignedSupervisorUser?.fullName || 'Belum Ditugaskan'}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {assignedSupervisorUser ? `${assignedSupervisorUser.role?.toUpperCase()} • ${assignedSupervisorUser.department || 'Operasional'}` : '-'}
                        </div>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-blue-200 space-y-1">
                        <span className="text-[10px] font-black uppercase text-blue-950 flex items-center gap-1">
                          <Award className="w-3.5 h-3.5 text-blue-700" />
                          2. PM Approval (Tahap 2)
                        </span>
                        <div className="font-bold text-slate-900 text-xs truncate">
                          {assignedPmUser?.fullName || 'Belum Ditugaskan'}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {assignedPmUser ? `${assignedPmUser.role?.toUpperCase()} • ${assignedPmUser.department || 'Proyek'}` : '-'}
                        </div>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-emerald-200 space-y-1">
                        <span className="text-[10px] font-black uppercase text-emerald-950 flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-emerald-700" />
                          3. Finance (Tahap 3)
                        </span>
                        <div className="font-bold text-slate-900 text-xs truncate">
                          {assignedFinanceUser?.fullName || 'Belum Ditugaskan'}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {assignedFinanceUser ? `${assignedFinanceUser.role?.toUpperCase()} • ${assignedFinanceUser.department || 'Keuangan'}` : '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bulk Action Submit */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-text-muted">
                      Total <b>{bulkWorkers.length} dokumen SPKL individual</b> akan diterbitkan berurutan di bawah batch induk.
                    </div>

                    <button
                      type="button"
                      onClick={handleSubmitBulk}
                      disabled={bulkSubmitting}
                      className="min-h-[44px] px-6 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {bulkSubmitting ? 'Memproses Transaksi...' : `Terbitkan Penugasan Massal (${bulkWorkers.length} Pekerja)`}
                    </button>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 4. TAB 3: ANTRIAN OTORISASI BERJENJANG (4-TIER APPROVAL QUEUE) ─── */}
      {activeTab === 'approvals' && (
        <Card className="p-4 sm:p-6 space-y-4 border border-border-light shadow-sm rounded-2xl">
          {/* Header & 4-Tier Pipeline Legend */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-border-light">
            <div>
              <h2 className="text-sm font-black text-text-primary uppercase tracking-wider m-0 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                Antrian Otorisasi Berjenjang SPKL (4-Tier Audit)
              </h2>
              <p className="text-xs text-text-muted m-0">
                Alur otorisasi resmi: Pekerja ➔ Supervisor Lapangan ➔ Project Manager (PM) ➔ Finance Director (Payroll Synced).
              </p>
            </div>

            {/* Batch Sign Actions */}
            {selectedApprovalIds.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 w-full sm:w-auto">
                <span className="text-xs font-bold text-blue-600 shrink-0">{selectedApprovalIds.length} Dokumen Dipilih:</span>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => openAllocationModal({ isBatch: true })}
                      className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs min-h-[38px] flex items-center justify-center gap-1.5"
                      title="Atur penugasan verifikator untuk semua dokumen terpilih"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      Alokasi Verifikator ({selectedApprovalIds.length})
                    </button>
                  )}
                  {(isExecutive || ['site_manager', 'project_manager'].includes(currentUserRole)) && (
                    <button
                      type="button"
                      onClick={() => openPassphraseModal('batch', undefined, 'pm')}
                      className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs min-h-[38px]"
                    >
                      ✓ Approve PM Semua
                    </button>
                  )}
                  {isFinanceRole && (
                    <button
                      type="button"
                      onClick={() => openPassphraseModal('batch', undefined, 'finance')}
                      className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs min-h-[38px]"
                    >
                      ✓ Verifikasi Finance Semua
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sub-Tier Filter Tabs */}
          <div className="grid grid-cols-2 lg:flex lg:flex-wrap gap-2 text-xs font-bold">
            <button
              onClick={() => setApprovalTierFilter('all')}
              className={`px-3 py-2 rounded-xl transition-colors cursor-pointer text-center ${
                approvalTierFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Semua Pending ({records.filter(r => r.workflowStatus !== 'finance_verified').length})
            </button>
            <button
              onClick={() => setApprovalTierFilter('supervisor')}
              className={`px-3 py-2 rounded-xl transition-colors cursor-pointer text-center ${
                approvalTierFilter === 'supervisor' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Tahap 1: SPV ({summary.pendingSupervisor || 0})
            </button>
            <button
              onClick={() => setApprovalTierFilter('pm')}
              className={`px-3 py-2 rounded-xl transition-colors cursor-pointer text-center ${
                approvalTierFilter === 'pm' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
              }`}
            >
              Tahap 2: PM ({summary.pendingPm || 0})
            </button>
            <button
              onClick={() => setApprovalTierFilter('finance')}
              className={`px-3 py-2 rounded-xl transition-colors cursor-pointer text-center ${
                approvalTierFilter === 'finance' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              Tahap 3: Finance ({summary.pendingFinance || 0})
            </button>
          </div>

          {/* Pending Table / Cards */}
          {approvalRecords.length === 0 ? (
            <div className="py-16 text-center text-xs text-text-muted space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="m-0 font-bold text-slate-800 text-sm">Semua Dokumen SPKL Telah Diverifikasi!</p>
              <p className="m-0 text-slate-500">Tidak ada antrian lembur yang tertunda pada kategori ini.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mobile View: Touch-First Approval Cards */}
              <div className="md:hidden space-y-3">
                {approvalRecords.map(rec => {
                  const isChecked = selectedApprovalIds.includes(rec._id);
                  return (
                    <div
                      key={rec._id}
                      className={`p-3.5 bg-white border rounded-2xl shadow-xs space-y-2.5 transition-all ${
                        isChecked ? 'border-amber-400 bg-amber-50/20' : 'border-border-light hover:border-amber-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!canActOnRecord(rec)}
                            title={canActOnRecord(rec) ? "Pilih dokumen untuk otorisasi massal" : "Hanya verifikator yang ditugaskan dapat memilih dokumen ini"}
                            onChange={() => {
                              setSelectedApprovalIds(prev =>
                                prev.includes(rec._id) ? prev.filter(x => x !== rec._id) : [...prev, rec._id]
                              );
                            }}
                            className={`w-4 h-4 rounded text-blue-600 ${!canActOnRecord(rec) ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                          />
                          <div>
                            <span className="font-mono font-bold text-xs text-blue-900 block">
                              {rec.spklNumber}
                            </span>
                            <span className="text-[10px] text-text-muted">
                              {formatWIBDate(rec.overtimeDate)}
                            </span>
                          </div>
                        </div>
                        <div>{getStatusBadge(rec.workflowStatus)}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-text-muted block">Pekerja:</span>
                          <span className="font-bold text-text-primary block truncate">
                            {rec.workerSnapshot?.fullName}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            NIK: {rec.workerSnapshot?.nik || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-text-muted block">Proyek &amp; Lokasi:</span>
                          <span className="font-semibold text-text-primary block truncate">
                            {rec.projectId?.nama || 'Proyek'}
                          </span>
                          <span className="text-[10px] text-text-muted block truncate">
                            {rec.location}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-2 bg-amber-50/40 border border-amber-200/60 rounded-xl text-xs">
                        <div>
                          <span className="text-[10px] text-amber-800 font-bold block">Realisasi Jam:</span>
                          <span className="font-medium text-slate-800">
                            {rec.scheduleActual?.startTime} - {rec.scheduleActual?.endTime} ({rec.scheduleActual?.breakMinutes || 0}m)
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-blue-700 font-bold block">Output Jam OT:</span>
                          <span className="font-mono font-bold text-blue-900 bg-white border border-blue-200 px-2 py-0.5 rounded-md inline-block">
                            {rec.scheduleActual?.effectiveHours || 0} Jam OT
                          </span>
                        </div>
                      </div>

                      {/* Mobile Action Buttons Bar */}
                      <div className="space-y-1.5 pt-1">
                        {rec.workflowStatus === 'submitted' && (
                          canVerifySupervisor(rec) ? (
                            <button
                              type="button"
                              onClick={() => openPassphraseModal('supervisor', rec)}
                              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                            >
                              <Check className="w-4 h-4" />
                              Verifikasi SPV Lapangan
                            </button>
                          ) : (
                            <div className="text-[11px] text-amber-900/80 bg-amber-50/80 border border-amber-200/80 rounded-xl px-2.5 py-1.5 flex items-center justify-center gap-1.5 font-medium">
                              <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>Menunggu verifikasi: <b>{getAssignedSupervisorName(rec) || 'Supervisor'}</b></span>
                            </div>
                          )
                        )}
                        {rec.workflowStatus === 'supervisor_verified' && (
                          canApprovePm(rec) ? (
                            <button
                              type="button"
                              onClick={() => openPassphraseModal('pm', rec)}
                              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                            >
                              <Check className="w-4 h-4" />
                              Setujui (Approval Project Manager)
                            </button>
                          ) : (
                            <div className="text-[11px] text-blue-900/80 bg-blue-50/80 border border-blue-200/80 rounded-xl px-2.5 py-1.5 flex items-center justify-center gap-1.5 font-medium">
                              <Lock className="w-3 h-3 text-blue-600 shrink-0" />
                              <span>Menunggu persetujuan: <b>{getAssignedPmName(rec) || 'Project Manager'}</b></span>
                            </div>
                          )
                        )}
                        {rec.workflowStatus === 'pm_approved' && (
                          canVerifyFinance(rec) ? (
                            <button
                              type="button"
                              onClick={() => openPassphraseModal('finance', rec)}
                              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                            >
                              <Check className="w-4 h-4" />
                              Verifikasi Finance &amp; Sync Presensi
                            </button>
                          ) : (
                            <div className="text-[11px] text-purple-900/80 bg-purple-50/80 border border-purple-200/80 rounded-xl px-2.5 py-1.5 flex items-center justify-center gap-1.5 font-medium">
                              <Lock className="w-3 h-3 text-purple-600 shrink-0" />
                              <span>Menunggu verifikasi: <b>{getAssignedFinanceName(rec) || 'Divisi Finance / Payroll'}</b></span>
                            </div>
                          )
                        )}

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedRecordForDetail(rec)}
                            className="flex-1 min-h-[38px] px-2 py-1.5 rounded-xl border border-border-light bg-slate-50 hover:bg-slate-100 text-text-primary text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-600" />
                            Detail
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportPdf(rec)}
                            className="flex-1 min-h-[38px] px-2 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            PDF
                          </button>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => openAllocationModal({ record: rec })}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                              title="Alokasi Verifikator Khusus Dokumen Ini"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
                              Alokasi
                            </button>
                          )}
                          {canRejectRecord(rec) && (
                            <button
                              type="button"
                              onClick={() => openRejectionModal(rec)}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              Tolak
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop View: Full Table */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-border-light">
                <table className="w-full text-left text-xs border-collapse min-w-[750px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 uppercase text-[10px] font-extrabold tracking-wider border-b border-border-light">
                      <th className="p-3 w-8">
                        <input
                          type="checkbox"
                          checked={
                            selectableApprovalRecords.length > 0 &&
                            selectableApprovalRecords.every(r => selectedApprovalIds.includes(r._id))
                          }
                          onChange={e => {
                            setSelectedApprovalIds(e.target.checked ? selectableApprovalRecords.map(r => r._id) : []);
                          }}
                          disabled={selectableApprovalRecords.length === 0}
                          title="Pilih semua dokumen yang dapat Anda verifikasi"
                        />
                      </th>
                      <th className="p-3">No. SPKL</th>
                      <th className="p-3">Pekerja</th>
                      <th className="p-3">Proyek &amp; Lokasi</th>
                      <th className="p-3 text-center">Durasi Lembur</th>
                      <th className="p-3 text-center">Output Jam Lembur</th>
                      <th className="p-3 text-center">Status Tahapan</th>
                      <th className="p-3 text-right">Tindakan Otorisasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light font-medium bg-white">
                    {approvalRecords.map(rec => {
                      const isChecked = selectedApprovalIds.includes(rec._id);
                      return (
                        <tr key={rec._id} className="hover:bg-amber-50/20 transition-colors">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={!canActOnRecord(rec)}
                              title={canActOnRecord(rec) ? "Pilih dokumen untuk otorisasi massal" : "Hanya verifikator yang ditugaskan dapat memilih dokumen ini"}
                              onChange={() => {
                                setSelectedApprovalIds(prev =>
                                  prev.includes(rec._id) ? prev.filter(x => x !== rec._id) : [...prev, rec._id]
                                );
                              }}
                              className={!canActOnRecord(rec) ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                            />
                          </td>
                          <td className="p-3 font-mono font-bold text-blue-900">{rec.spklNumber}</td>
                          <td className="p-3 font-bold text-text-primary">
                            {rec.workerSnapshot?.fullName}
                            <div className="text-[10px] text-text-muted font-normal">NIK: {rec.workerSnapshot?.nik || '-'}</div>
                          </td>
                          <td className="p-3 text-text-secondary">{rec.location}</td>
                          <td className="p-3 text-center font-mono font-bold text-blue-800">
                            {rec.scheduleActual?.effectiveHours} Jam
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-blue-900">
                            <span className="bg-blue-100/70 border border-blue-200 px-2.5 py-1 rounded-lg">
                              {rec.scheduleActual?.effectiveHours || 0} Jam OT
                            </span>
                          </td>
                          <td className="p-3 text-center">{getStatusBadge(rec.workflowStatus)}</td>
                          <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                            {rec.workflowStatus === 'submitted' && (
                              canVerifySupervisor(rec) ? (
                                <button
                                  type="button"
                                  onClick={() => openPassphraseModal('supervisor', rec)}
                                  className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 text-[11px] font-bold transition-colors cursor-pointer"
                                >
                                  Verif SPV
                                </button>
                              ) : (
                                <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-1 rounded-md border border-amber-200/60 font-semibold" title={`Ditugaskan ke: ${getAssignedSupervisorName(rec) || 'Supervisor'}`}>
                                  🔒 SPV: {getAssignedSupervisorName(rec) || 'Ditugaskan'}
                                </span>
                              )
                            )}
                            {rec.workflowStatus === 'supervisor_verified' && (
                              canApprovePm(rec) ? (
                                <button
                                  type="button"
                                  onClick={() => openPassphraseModal('pm', rec)}
                                  className="px-3 py-1.5 rounded-lg border border-blue-300 text-blue-900 bg-blue-50 hover:bg-blue-100 text-[11px] font-bold transition-colors cursor-pointer"
                                >
                                  Approve PM
                                </button>
                              ) : (
                                <span className="text-[10px] text-blue-800 bg-blue-50 px-2 py-1 rounded-md border border-blue-200/60 font-semibold" title={`Ditugaskan ke: ${getAssignedPmName(rec) || 'Project Manager'}`}>
                                  🔒 PM: {getAssignedPmName(rec) || 'Ditugaskan'}
                                </span>
                              )
                            )}
                            {rec.workflowStatus === 'pm_approved' && (
                              canVerifyFinance(rec) ? (
                                <button
                                  type="button"
                                  onClick={() => openPassphraseModal('finance', rec)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors shadow-sm cursor-pointer"
                                >
                                  Verif Finance &amp; Sync
                                </button>
                              ) : (
                                <span className="text-[10px] text-purple-800 bg-purple-50 px-2 py-1 rounded-md border border-purple-200/60 font-semibold" title={`Ditugaskan ke: ${getAssignedFinanceName(rec) || 'Finance'}`}>
                                  🔒 Finance: {getAssignedFinanceName(rec) || 'Ditugaskan'}
                                </span>
                              )
                            )}
                            {canRejectRecord(rec) && (
                              <button
                                type="button"
                                onClick={() => openRejectionModal(rec)}
                                className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-bold transition-colors cursor-pointer"
                                title="Tolak atau Minta Revisi"
                              >
                                Tolak
                              </button>
                            )}
                            {isOwner && (
                              <button
                                type="button"
                                onClick={() => openAllocationModal({ record: rec })}
                                className="p-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 cursor-pointer inline-flex items-center"
                                title="Alokasi Verifikator Khusus Dokumen Ini"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-700" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleExportPdf(rec)}
                              className="p-1.5 rounded-lg border border-border-light text-text-secondary hover:text-blue-600 cursor-pointer inline-flex items-center"
                              title="Pratinjau PDF"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── 5. PASSPHRASE AUTHORIZATION MODAL ───────────────────────────────── */}
      {passphraseModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom sm:zoom-in-95">
            <div className="flex items-start justify-between pb-3 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200 shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 m-0">Otorisasi Digital SPKL</h3>
                  <p className="text-[11px] text-slate-500 m-0">Verifikasi tanda tangan elektronik aman</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPassphraseModal(p => ({ ...p, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {passphraseModal.actionType === 'batch' ? (
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                  <span className="font-bold text-blue-950 block">Otorisasi Massal:</span>
                  <span className="text-slate-600">
                    Anda akan menyetujui <b>{passphraseModal.batchCount} dokumen SPKL terpilih</b> sekaligus pada tahap:
                    <b className="uppercase text-blue-800 ml-1">[{passphraseModal.batchStep}]</b>
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div>No. Dokumen: <span className="font-mono font-bold text-blue-900">{passphraseModal.recordNumber}</span></div>
                  <div>Pekerja: <span className="font-bold text-slate-800">{passphraseModal.workerName}</span></div>
                  <div>Tahapan: <span className="font-bold uppercase text-amber-800">[{passphraseModal.actionType}]</span></div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Catatan Otorisasi (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Misal: Pekerjaan cor plat telah diperiksa sesuai spek..."
                  value={passphraseModal.note}
                  onChange={e => setPassphraseModal(p => ({ ...p, note: e.target.value }))}
                  className="w-full p-2.5 border border-border-light rounded-xl outline-none focus:border-blue-500 bg-white text-xs min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Masukkan Password Login Akun Anda <span className="text-red-500">*</span>
                </label>
                <p className="text-[10px] text-slate-500 mb-1.5 flex items-center gap-1">
                  <Info className="w-3 h-3 text-blue-600 flex-shrink-0" />
                  <span>Passphrase otorisasi adalah kata sandi (password) akun login Anda di MTERP.</span>
                </p>
                <div className="relative">
                  <input
                    type={showPassphraseText ? 'text' : 'password'}
                    placeholder="Masukkan password login akun MTERP Anda..."
                    value={passphraseModal.passphrase}
                    onChange={e => setPassphraseModal(p => ({ ...p, passphrase: e.target.value, error: '' }))}
                    className="w-full p-2.5 pr-10 border border-border-light rounded-xl outline-none focus:border-blue-500 bg-white font-mono text-sm min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphraseText(!showPassphraseText)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                  >
                    {showPassphraseText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passphraseModal.error && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {passphraseModal.error}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t">
              <button
                type="button"
                onClick={() => setPassphraseModal(p => ({ ...p, isOpen: false }))}
                className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-center"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmPassphrase}
                disabled={passphraseModal.loading}
                className="flex-1 sm:flex-initial min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-xs font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
              >
                <Check className="w-4 h-4" />
                {passphraseModal.loading ? 'Memverifikasi...' : 'Tandatangani'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. REJECTION / REVISION MODAL ────────────────────────────────────── */}
      {rejectionModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom sm:zoom-in-95">
            <div className="flex items-start justify-between pb-3 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 shrink-0">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 m-0">Tolak / Minta Revisi SPKL</h3>
                  <p className="text-[11px] text-slate-500 m-0">{rejectionModal.recordNumber} • {rejectionModal.workerName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectionModal(r => ({ ...r, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Alasan Penolakan / Catatan Perbaikan <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Jelaskan alasan pengembalian dokumen SPKL ini..."
                  value={rejectionModal.reason}
                  onChange={e => setRejectionModal(r => ({ ...r, reason: e.target.value, error: '' }))}
                  className="w-full p-2.5 border border-border-light rounded-xl outline-none focus:border-rose-500 bg-white text-xs"
                />
                {rejectionModal.error && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {rejectionModal.error}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t">
              <button
                type="button"
                onClick={() => setRejectionModal(r => ({ ...r, isOpen: false }))}
                className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-center"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmRejection}
                disabled={rejectionModal.loading}
                className="flex-1 sm:flex-initial min-h-[44px] px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-xs font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
              >
                <XCircle className="w-4 h-4" />
                {rejectionModal.loading ? 'Menyimpan...' : 'Konfirmasi Tolak'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 6b. VERIFICATOR ALLOCATION MODAL (OWNER EXCLUSIVE) ───────────────── */}
      {allocationModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom sm:zoom-in-95">
            <div className="flex items-start justify-between pb-3 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 shrink-0">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-900 m-0">Alokasi Verifikator SPKL</h3>
                    <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      👑 Khusus Owner
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                    {allocationModal.recordId ? (
                      <>Dokumen: <b className="font-mono text-blue-900">{allocationModal.recordNumber}</b> • {allocationModal.workerName}</>
                    ) : allocationModal.isBatch ? (
                      <>Penugasan Massal: <b>{selectedApprovalIds.length} Dokumen SPKL Terpilih</b></>
                    ) : (
                      'Konfigurasi Penugasan Otorisasi Berjenjang 3 Tahap'
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAllocationModal(p => ({ ...p, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs space-y-1">
              <span className="font-bold text-amber-950 block flex items-center gap-1.5">
                <Info className="w-4 h-4 text-amber-700 shrink-0" />
                Kewenangan Pengaturan Verifikator
              </span>
              <p className="text-slate-700 m-0 text-[11px] leading-relaxed">
                Sebagai Owner, Anda dapat menetapkan personil berwenang pada 3 tahapan otorisasi:
                <b> Supervisor Lapangan</b> (Tahap 1) ➔ <b>Project Manager</b> (Tahap 2) ➔ <b>Finance Director / Payroll</b> (Tahap 3).
                Jika dikosongkan (opsi Bebas), setiap staf dengan role terkait berwenang memproses.
              </p>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Stage 1: Supervisor */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-amber-900 font-extrabold">
                    <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                    1. Supervisor Lapangan (Tahap 1)
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">Verifikasi Absensi &amp; Jam Lapangan</span>
                </label>
                <select
                  value={allocationModal.supervisorId}
                  onChange={e => setAllocationModal(p => ({ ...p, supervisorId: e.target.value }))}
                  className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-amber-500 bg-white text-xs min-h-[44px] cursor-pointer"
                >
                  <option value="">-- Bebas (Semua Supervisor / SM Lapangan) --</option>
                  {supervisorCandidates.map(u => (
                    <option key={u._id} value={u._id}>
                      {u.fullName} ({u.role?.toUpperCase()}{u.department ? ` • ${u.department}` : ''})
                    </option>
                  ))}
                </select>
              </div>

              {/* Stage 2: PM */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-blue-900 font-extrabold">
                    <Award className="w-3.5 h-3.5 text-blue-600" />
                    2. Project Manager (Tahap 2)
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">Persetujuan Output &amp; Anggaran</span>
                </label>
                <select
                  value={allocationModal.pmId}
                  onChange={e => setAllocationModal(p => ({ ...p, pmId: e.target.value }))}
                  className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-blue-500 bg-white text-xs min-h-[44px] cursor-pointer"
                >
                  <option value="">-- Bebas (Semua Project Manager / SM) --</option>
                  {pmCandidates.map(u => (
                    <option key={u._id} value={u._id}>
                      {u.fullName} ({u.role?.toUpperCase()}{u.department ? ` • ${u.department}` : ''})
                    </option>
                  ))}
                </select>
              </div>

              {/* Stage 3: Finance */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-emerald-900 font-extrabold">
                    <Building className="w-3.5 h-3.5 text-emerald-600" />
                    3. Verifikator Finance / Payroll (Tahap 3)
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">Otorisasi Final &amp; Sinkronisasi Slip</span>
                </label>
                <select
                  value={allocationModal.financeId}
                  onChange={e => setAllocationModal(p => ({ ...p, financeId: e.target.value }))}
                  className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-emerald-500 bg-white text-xs min-h-[44px] cursor-pointer"
                >
                  <option value="">-- Bebas (Semua Divisi Finance / Payroll) --</option>
                  {financeCandidates.map(u => (
                    <option key={u._id} value={u._id}>
                      {u.fullName} ({u.role?.toUpperCase()}{u.department ? ` • ${u.department}` : ''})
                    </option>
                  ))}
                </select>
              </div>

              {allocationModal.error && (
                <p className="text-[11px] text-rose-600 font-bold mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {allocationModal.error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t">
              <button
                type="button"
                onClick={() => setAllocationModal(p => ({ ...p, isOpen: false }))}
                className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-center"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveAllocation}
                disabled={allocationModal.loading}
                className="flex-1 sm:flex-initial min-h-[44px] px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-xs font-bold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
              >
                <Check className="w-4 h-4" />
                {allocationModal.loading ? 'Menyimpan...' : (allocationModal.recordId || allocationModal.isBatch ? 'Simpan Alokasi' : 'Terapkan ke Form')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 7. DETAIL MODAL VIEW (EXECUTIVE DOSSIER) ─────────────────────────── */}
      {selectedRecordForDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase font-mono block">
                  {selectedRecordForDetail.spklNumber}
                </span>
                <h3 className="text-base font-black text-slate-900 m-0">Detail Dokumen Resmi SPKL</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecordForDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block text-[10px]">Pekerja Pelaksana:</span>
                  <span className="font-bold text-slate-900">{selectedRecordForDetail.workerSnapshot?.fullName}</span>
                  <span className="block text-[10px] text-slate-500 font-mono">NIK: {selectedRecordForDetail.workerSnapshot?.nik || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Lokasi &amp; Departemen:</span>
                  <span className="font-bold text-slate-900">{selectedRecordForDetail.location}</span>
                  <span className="block text-[10px] text-slate-500">{selectedRecordForDetail.workerSnapshot?.department}</span>
                </div>
              </div>

              {/* Jadwal Box */}
              <div className="p-3 border rounded-2xl space-y-1">
                <div className="font-bold text-slate-900 mb-1">Realisasi Jam Kerja Lembur:</div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-slate-700 font-mono">
                  <span>Waktu: {selectedRecordForDetail.scheduleActual?.startTime} - {selectedRecordForDetail.scheduleActual?.endTime}</span>
                  <span>Istirahat: {selectedRecordForDetail.scheduleActual?.breakMinutes || 0} menit</span>
                  <span className="font-bold text-blue-900">Durasi: {selectedRecordForDetail.scheduleActual?.effectiveHours} Jam</span>
                </div>
              </div>

              {/* Tasks List */}
              <div className="space-y-1">
                <div className="font-bold text-slate-900">Rincian Pekerjaan &amp; Output Fisik:</div>
                <div className="border rounded-2xl divide-y text-[11px]">
                  {selectedRecordForDetail.workItems?.map((it: any, i: number) => (
                    <div key={i} className="p-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 mr-2">{i + 1}. {it.taskDescription}</span>
                        <span className="text-slate-500 text-[10px]">({it.volumeActual || it.volumePlanned || 'Output fisik'})</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold text-[10px]">
                        {it.isFinished ? '✓ Selesai' : `${it.progressPercent}%`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4-Tier Audit Signatures Log */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-900">Log Otorisasi Digital Berjenjang (4-Tier Audit):</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                  <div className="p-2 bg-white rounded-xl border">
                    <span className="text-slate-400 block">Karyawan:</span>
                    <span className="font-bold text-emerald-700">✓ Ditandatangani</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border">
                    <span className="text-slate-400 block">Supervisor:</span>
                    <span className={`font-bold ${selectedRecordForDetail.signatures?.supervisor?.signed ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {selectedRecordForDetail.signatures?.supervisor?.signed ? '✓ Diverifikasi' : 'Menunggu'}
                    </span>
                    <span className="text-[9px] text-slate-500 block truncate mt-0.5">
                      {selectedRecordForDetail.signatures?.supervisor?.signedBy?.fullName || selectedRecordForDetail.signatures?.supervisor?.assignedTo?.fullName || selectedRecordForDetail.assignedSupervisorId?.fullName || '-'}
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border">
                    <span className="text-slate-400 block">Project Manager:</span>
                    <span className={`font-bold ${selectedRecordForDetail.signatures?.projectManager?.signed ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {selectedRecordForDetail.signatures?.projectManager?.signed ? '✓ Disetujui' : 'Menunggu'}
                    </span>
                    <span className="text-[9px] text-slate-500 block truncate mt-0.5">
                      {selectedRecordForDetail.signatures?.projectManager?.signedBy?.fullName || selectedRecordForDetail.signatures?.projectManager?.assignedTo?.fullName || selectedRecordForDetail.assignedPmId?.fullName || '-'}
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border">
                    <span className="text-slate-400 block">Finance Director:</span>
                    <span className={`font-bold ${selectedRecordForDetail.signatures?.financeDirector?.signed ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {selectedRecordForDetail.signatures?.financeDirector?.signed ? '✓ Final & Synced' : 'Menunggu'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => handleExportPdf(selectedRecordForDetail)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Unduh Dokumen PDF 1:1
              </button>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {canVerifySupervisor(selectedRecordForDetail) && (
                  <button
                    type="button"
                    onClick={() => {
                      const r = selectedRecordForDetail;
                      setSelectedRecordForDetail(null);
                      openPassphraseModal('supervisor', r);
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Check className="w-4 h-4" />
                    Verifikasi SPV Lapangan
                  </button>
                )}
                {canApprovePm(selectedRecordForDetail) && (
                  <button
                    type="button"
                    onClick={() => {
                      const r = selectedRecordForDetail;
                      setSelectedRecordForDetail(null);
                      openPassphraseModal('pm', r);
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Check className="w-4 h-4" />
                    Setujui (Approval PM)
                  </button>
                )}
                {canVerifyFinance(selectedRecordForDetail) && (
                  <button
                    type="button"
                    onClick={() => {
                      const r = selectedRecordForDetail;
                      setSelectedRecordForDetail(null);
                      openPassphraseModal('finance', r);
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Check className="w-4 h-4" />
                    Verifikasi Finance &amp; Sync
                  </button>
                )}
                {canRejectRecord(selectedRecordForDetail) && (
                  <button
                    type="button"
                    onClick={() => {
                      const r = selectedRecordForDetail;
                      setSelectedRecordForDetail(null);
                      openRejectionModal(r);
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    Tolak / Minta Revisi
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedRecordForDetail(null)}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 8. FULLSCREEN A4 PREVIEW MODAL ───────────────────────────────────── */}
      {showA4Fullscreen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-3 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b">
              <span className="text-xs font-bold text-slate-600 uppercase font-mono">
                Pratinjau Layar Penuh Format A4 Standar FRM-MTE-HR-014 Rev. 02
              </span>
              <button
                type="button"
                onClick={() => setShowA4Fullscreen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white p-3 sm:p-6 border rounded-2xl shadow-inner space-y-4 text-xs font-sans text-slate-800 overflow-x-auto">
              <div className="flex items-start justify-between border-b pb-2">
                <div>
                  <div className="text-base font-black text-slate-900">PT MEGA TAMA ENERCO</div>
                  <div className="text-[9px] text-slate-500">Jl. Raya Alun-Alun Pangalengan No. 221</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-bold text-blue-600">ISO 9001 | 14001 | 45001</div>
                  <div className="text-[9px] font-extrabold text-emerald-600">SMK3 TERVERIFIKASI</div>
                </div>
              </div>

              <div className="text-center">
                <div className="text-sm font-black uppercase text-slate-900">
                  SURAT PERINTAH &amp; BUKTI KERJA LEMBUR (SPKL)
                </div>
                <div className="text-[8px] text-red-700 italic">
                  Dokumen Resmi Bukti Penugasan, Pelaksanaan dan Pengajuan Kompensasi Lembur Karyawan
                </div>
              </div>

              {/* Data Summary */}
              <div className="border border-blue-900 p-3 rounded space-y-1">
                <div>Pekerja: <span className="font-bold">{activeWorker?.fullName}</span> (NIK: {activeWorker?.nik || '-'})</div>
                <div>Lokasi: {locationName} • Departemen: {departmentName}</div>
                <div>Tanggal Lembur: {formatWIBDate(overtimeDate)}</div>
                <div>Realisasi Waktu: {actStart} - {actEnd} ({actDuration} Jam Efektif)</div>
                <div>Output Lembur: <span className="font-mono font-bold text-blue-900">{actDuration} Jam Lembur Efektif</span></div>
              </div>

              {/* III. Rincian Pekerjaan */}
              <div className="border border-blue-900 rounded overflow-hidden">
                <div className="bg-blue-800 text-white font-bold text-[9px] px-2 py-0.5">
                  III. RINCIAN PEKERJAAN &amp; OUTPUT
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[9px] border-collapse min-w-[420px]">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                      <tr>
                        <th className="p-1 text-center w-8">No</th>
                        <th className="p-1 text-left">Uraian Tugas Lembur</th>
                        <th className="p-1 text-center w-24">Vol. Rencana</th>
                        <th className="p-1 text-center w-24">Vol. Aktual</th>
                        <th className="p-1 text-center w-16">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {workItems.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-1 text-center">{idx + 1}</td>
                          <td className="p-1 font-semibold">{it.taskDescription || '-'}</td>
                          <td className="p-1 text-center font-mono">{it.volumePlanned || '-'}</td>
                          <td className="p-1 text-center font-mono">{it.volumeActual || '-'}</td>
                          <td className="p-1 text-center">{it.isFinished ? 'Selesai' : `${it.progressPercent}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* IV. Signatures */}
              <div className="border border-blue-900 rounded overflow-hidden">
                <div className="bg-blue-800 text-white font-bold text-[9px] px-2 py-0.5">
                  IV. TANDA TANGAN PERSETUJUAN &amp; VERIFIKASI
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 text-center text-[8px] gap-2 sm:gap-0 sm:divide-x divide-slate-300 py-3">
                  <div className="p-1">
                    <div className="font-bold">Karyawan</div>
                    <div className="text-[7px] text-slate-500">Pelaksana Lembur</div>
                    <div className="h-8 flex items-center justify-center font-bold text-emerald-700 text-xs">[TTD]</div>
                    <div className="font-semibold truncate">( {activeWorker?.fullName || 'Pemohon'} )</div>
                    <div className="text-[7px] text-slate-400">tgl: {overtimeDate}</div>
                  </div>
                  <div className="p-1">
                    <div className="font-bold">Supervisor</div>
                    <div className="text-[7px] text-slate-500">Verificator</div>
                    <div className="h-8 flex items-center justify-center font-bold text-amber-700 text-xs">[Verif]</div>
                    <div className="font-semibold truncate">( {assignedSupervisorUser?.fullName || user?.fullName || 'Supervisor'} )</div>
                    <div className="text-[7px] text-slate-400">tgl: {overtimeDate}</div>
                  </div>
                  <div className="p-1">
                    <div className="font-bold">Project Manager</div>
                    <div className="text-[7px] text-slate-500">Approval</div>
                    <div className="h-8 flex items-center justify-center text-slate-400 text-xs">[Pending]</div>
                    <div className="font-semibold truncate">( {assignedPmUser?.fullName || 'Project Manager'} )</div>
                    <div className="text-[7px] text-slate-400">tgl: ___/___/___</div>
                  </div>
                  <div className="p-1">
                    <div className="font-bold">Finance Dir</div>
                    <div className="text-[7px] text-slate-500">Verifikasi Final</div>
                    <div className="h-8 flex items-center justify-center text-slate-400 text-xs">[Pending]</div>
                    <div className="font-semibold truncate">( {assignedFinanceUser?.fullName || 'Finance Director'} )</div>
                    <div className="text-[7px] text-slate-400">tgl: ___/___/___</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowA4Fullscreen(false)}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
