import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, Check, Users, Search, ChevronRight, ChevronLeft,
  Building, Loader, AlertCircle, Clock, UserPlus, LogOut,
  X, CheckSquare, Square, PlayCircle, RefreshCw,
  FileText, DollarSign, CalendarOff, Receipt, Shield,
  Upload, Calendar, MapPin, Timer, CheckCircle2, UserCheck,
  TrendingUp, ShieldCheck, ArrowRight, Info, PlusCircle, AlertTriangle,
  Trash2,
} from 'lucide-react';
import { PhotoView } from 'react-photo-view';
import api, { deleteAttendanceSession } from '../api/api';
import { Card, Button, Alert, Input, CostInput } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import { useImageCompression } from '../utils/useImageCompression';
import { formatDate as formatWIBDate, formatTime as formatWIBTime, todayWIB, wibDate } from '../utils/date';
import { OfflineAttendanceBanner } from '../components/attendance/OfflineAttendanceBanner';
import {
  queueOfflineAttendance,
  fileToBase64,
  cacheAttendanceProjects,
  getCachedAttendanceProjects,
  cacheProjectWorkers,
  getCachedProjectWorkers,
  cacheTodayAttendance,
  getCachedTodayAttendance,
  cacheTodaySessions,
  getCachedTodaySessions,
  addOfflineWorker,
} from '../services/attendanceSyncEngine';
import { attendanceOfflineDb } from '../services/attendanceOfflineDb';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProjectItem {
  _id: string;
  nama: string;
  lokasi?: string;
}

interface WorkerItem {
  _id: string;
  fullName: string;
  role: string;
  position?: string;
}

interface SessionResult {
  session: { _id: string };
  created: number;
  conflicts: { workerId: string; fullName: string; reason: string }[];
}

interface ActiveSession {
  _id: string;
  projectId: { _id: string; nama: string; lokasi?: string } | string;
  date: string;
  workerIds: (string | { _id: string; fullName: string; role?: string; position?: string })[];
  lateWorkerIds: { workerId: string | { _id: string; fullName: string; role?: string; position?: string }; addedAt?: string }[];
  leaveRecords?: { workerId: string | { _id: string; fullName: string; role?: string; position?: string }; leaveHour: string; reason?: string; recordedAt?: string }[];
  photoUrl: string;
  notes?: string;
  supervisorId: { _id?: string; fullName: string; role?: string } | string;
  status?: 'active' | 'closed';
  closedAt?: string;
  closedBy?: { _id: string; fullName: string } | string;
  createdAt?: string;
  isOffline?: boolean;
}

interface AttendanceRecord {
  _id: string;
  date: string;
  checkIn?: { time: string; photo?: string };
  checkOut?: { time: string; photo?: string };
  wageType?: string;
  status?: string;
  projectId?: { _id: string; nama: string } | string;
  dailyRate?: number;
  paymentStatus?: string;
  isOffline?: boolean;
}

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace('/api', '');

const getImageUrl = (path: string | undefined): string => {
  if (!path) return '';
  const normalizedPath = path.replace(/\\/g, '/');
  const uploadsIndex = normalizedPath.indexOf('uploads/');
  if (uploadsIndex !== -1) {
    return `${API_BASE}/${normalizedPath.substring(uploadsIndex)}`;
  }
  return `${API_BASE}/${normalizedPath}`;
};

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  Present: { color: '#059669', bg: '#D1FAE5', label: 'Hadir' },
  Late: { color: '#D97706', bg: '#FEF3C7', label: 'Terlambat' },
  Absent: { color: '#DC2626', bg: '#FEE2E2', label: 'Tidak Hadir' },
  Permit: { color: '#7C3AED', bg: '#EDE9FE', label: 'Izin / Sakit' },
  'Half-day': { color: '#6366F1', bg: '#EEF2FF', label: 'Setengah Hari' },
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function GroupAttendance() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { compress } = useImageCompression();

  // Guard: redirect non-supervisors
  const isSupervisor = user?.role && [
    'owner', 'president_director', 'operational_director', 'director',
    'supervisor', 'site_manager', 'admin_project', 'asset_admin', 'foreman',
  ].includes(user.role);

  // ── Real-Time Clock & Working Status ──
  const [liveTime, setLiveTime] = useState(new Date());

  // ── Step State ──
  const [step, setStep] = useState(1); // 1 = Project+Photo, 2 = Tag Workers, 3 = Review

  // ── Step 1: Project & Photo ──
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  // ── Step 2: Workers ──
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // ── Offline Worker Quick-Add & Preview ──
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerRole, setNewWorkerRole] = useState('tukang');
  const [addingWorker, setAddingWorker] = useState(false);
  const [showProjectWorkersPreview, setShowProjectWorkersPreview] = useState(false);

  // ── Step 3: Submit ──
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);

  // ── Post-Submit: Late Add ──
  const [lateWorkerId, setLateWorkerId] = useState('');
  const [addingLate, setAddingLate] = useState(false);

  // ── Post-Submit: Leave Hour ──
  const [leaveMode, setLeaveMode] = useState<'individual' | 'bulk'>('individual');
  const [leaveWorkerId, setLeaveWorkerId] = useState('');
  const [leaveHour, setLeaveHour] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [bulkLeaveWorkerIds, setBulkLeaveWorkerIds] = useState<Set<string>>(new Set());
  const [bulkLeaveHour, setBulkLeaveHour] = useState('');
  const [bulkLeaveReason, setBulkLeaveReason] = useState('');
  const [recordingLeave, setRecordingLeave] = useState(false);

  // ── Alert ──
  const [alertData, setAlertData] = useState<{
    visible: boolean; type: 'success' | 'error'; title: string; message: string;
  }>({ visible: false, type: 'success', title: '', message: '' });

  // ── Active Sessions (Multi-Supervisor Today's Sessions) ──
  const [todaySessions, setTodaySessions] = useState<ActiveSession[]>([]);
  const [loadingTodaySessions, setLoadingTodaySessions] = useState(true);
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<'all' | 'mine'>('all');
  const [sessionStatusFilter, setSessionStatusFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [currentActiveSession, setCurrentActiveSession] = useState<ActiveSession | null>(null);
  const skipProjectFetchRef = useRef(false);

  // ── Eliminate / Delete Session State ──
  const [sessionToDelete, setSessionToDelete] = useState<ActiveSession | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);

  // ── Previous / Unclosed Sessions Navigation State ──
  const [sessionDateMode, setSessionDateMode] = useState<'today' | 'yesterday' | 'unclosed' | 'custom'>('today');
  const [selectedCustomDate, setSelectedCustomDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  });
  const [unclosedSessions, setUnclosedSessions] = useState<ActiveSession[]>([]);
  const [loadingUnclosed, setLoadingUnclosed] = useState(false);

  // ── Close Session (1-Click Bulk Clock-out & Close) Modal ──
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeLeaveHour, setCloseLeaveHour] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [closingSession, setClosingSession] = useState(false);

  // ── Self Attendance for Supervisor (moved from deprecated Attendance.tsx) ──
  const [selfRecord, setSelfRecord] = useState<AttendanceRecord | null>(null);
  const [loadingSelf, setLoadingSelf] = useState(true);
  const [selfProjectId, setSelfProjectId] = useState('');
  const [selfPhoto, setSelfPhoto] = useState<File | null>(null);
  const [selfPhotoPreview, setSelfPhotoPreview] = useState<string | null>(null);
  const [selfSubmitting, setSelfSubmitting] = useState(false);

  // ── Kasbon Modal (moved from deprecated Attendance.tsx) ──
  const [kasbonOpen, setKasbonOpen] = useState(false);
  const [kasbonAmount, setKasbonAmount] = useState('');
  const [kasbonReason, setKasbonReason] = useState('');
  const [submittingKasbon, setSubmittingKasbon] = useState(false);

  // ── Permit Modal (moved from deprecated Attendance.tsx) ──
  const [permitModal, setPermitModal] = useState(false);
  const [permitReason, setPermitReason] = useState('');
  const [permitPhoto, setPermitPhoto] = useState<File | null>(null);
  const [permitPhotoPreview, setPermitPhotoPreview] = useState<string | null>(null);
  const [submittingPermit, setSubmittingPermit] = useState(false);

  // ── Recent Attendance History (last 7 days, moved from deprecated Attendance.tsx) ──
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // ── Live Clock Tick ──
  useEffect(() => {
    const interval = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Working Hours Check ──
  const currentHour = liveTime.getHours();
  const isWorkingHours = currentHour >= 8 && currentHour < 16;

  // ── Derived ──
  const selectedProject = projects.find(p => p._id === selectedProjectId);

  const filteredWorkers = useMemo(() => {
    if (!searchQuery.trim()) return workers;
    const q = searchQuery.toLowerCase();
    return workers.filter(w =>
      w.fullName.toLowerCase().includes(q) ||
      (w.position || w.role).toLowerCase().includes(q)
    );
  }, [workers, searchQuery]);

  const untaggedWorkers = useMemo(() => {
    return workers.filter(w => !selectedWorkerIds.has(w._id));
  }, [workers, selectedWorkerIds]);

  const taggedWorkers = useMemo(() => {
    return workers.filter(w => selectedWorkerIds.has(w._id));
  }, [workers, selectedWorkerIds]);

  // ── Active Sessions Helpers ──
  const isMySession = useCallback((s: ActiveSession) => {
    if (!user?._id) return false;
    const supId = typeof s.supervisorId === 'string' ? s.supervisorId : s.supervisorId?._id;
    return String(supId) === String(user._id);
  }, [user?._id]);

  const isSessionClosed = useCallback((s: ActiveSession): boolean => {
    if (s.status === 'closed') return true;
    const allWorkerIds = [
      ...(s.workerIds || []).map((w: any) => (typeof w === 'string' ? w : w?._id)),
      ...(s.lateWorkerIds || []).map((lw: any) => (typeof lw?.workerId === 'string' ? lw.workerId : lw?.workerId?._id)),
    ].filter(Boolean);
    if (allWorkerIds.length === 0) return false;
    const leaveWorkerIds = new Set(
      (s.leaveRecords || []).map((lr: any) => (typeof lr?.workerId === 'string' ? lr.workerId : lr?.workerId?._id)).filter(Boolean)
    );
    return allWorkerIds.every(id => leaveWorkerIds.has(id));
  }, []);

  const getSessionWorkerCounts = useCallback((s: ActiveSession) => {
    const allWorkerIds = [
      ...(s.workerIds || []).map((w: any) => (typeof w === 'string' ? w : w?._id)),
      ...(s.lateWorkerIds || []).map((lw: any) => (typeof lw?.workerId === 'string' ? lw.workerId : lw?.workerId?._id)),
    ].filter(Boolean);
    const total = allWorkerIds.length;
    const leaveWorkerIds = new Set(
      (s.leaveRecords || []).map((lr: any) => (typeof lr?.workerId === 'string' ? lr.workerId : lr?.workerId?._id)).filter(Boolean)
    );
    const left = allWorkerIds.filter(id => leaveWorkerIds.has(id)).length;
    const remaining = Math.max(0, total - left);
    const isClosed = s.status === 'closed' || (total > 0 && remaining === 0);
    return { total, left, remaining, isClosed };
  }, []);

  const mySessionsCount = useMemo(() => {
    return todaySessions.filter(isMySession).length;
  }, [todaySessions, isMySession]);

  const activeSessionsCount = useMemo(() => {
    return todaySessions.filter(s => !isSessionClosed(s)).length;
  }, [todaySessions, isSessionClosed]);

  const closedSessionsCount = useMemo(() => {
    return todaySessions.filter(s => isSessionClosed(s)).length;
  }, [todaySessions, isSessionClosed]);

  const myActiveSessionsCount = useMemo(() => {
    return todaySessions.filter(s => isMySession(s) && !isSessionClosed(s)).length;
  }, [todaySessions, isMySession, isSessionClosed]);

  const displayedSessions = useMemo(() => {
    let list = todaySessions;
    if (sessionFilter === 'mine') {
      list = list.filter(isMySession);
    }
    if (sessionStatusFilter === 'active') {
      list = list.filter(s => !isSessionClosed(s));
    } else if (sessionStatusFilter === 'closed') {
      list = list.filter(s => isSessionClosed(s));
    }
    return list;
  }, [todaySessions, sessionFilter, sessionStatusFilter, isMySession, isSessionClosed]);

  // Comprehensive workers breakdown for the current active / resumed session
  const sessionAllWorkers = useMemo(() => {
    if (!currentActiveSession) return [];

    const leaveMap = new Map<string, { leaveHour: string; reason?: string; recordedAt?: string }>();
    (currentActiveSession.leaveRecords || []).forEach((lr: any) => {
      const id = typeof lr.workerId === 'string' ? lr.workerId : lr.workerId?._id;
      if (id) {
        leaveMap.set(String(id), { leaveHour: lr.leaveHour, reason: lr.reason, recordedAt: lr.recordedAt });
      }
    });

    const list: {
      _id: string;
      fullName: string;
      role?: string;
      isLate: boolean;
      addedAt?: string;
      hasLeft: boolean;
      leaveHour?: string;
      leaveReason?: string;
      recordedAt?: string;
    }[] = [];
    const seenIds = new Set<string>();

    // Tagged initial workers
    (currentActiveSession.workerIds || []).forEach((w: any) => {
      const id = typeof w === 'string' ? w : w?._id;
      if (!id || seenIds.has(String(id))) return;
      seenIds.add(String(id));
      const fullName = typeof w === 'object' && w?.fullName ? w.fullName : (workers.find(wk => wk._id === id)?.fullName || 'Pekerja');
      const role = typeof w === 'object' ? (w?.position || w?.role) : (workers.find(wk => wk._id === id)?.position || workers.find(wk => wk._id === id)?.role);
      const leaveInfo = leaveMap.get(String(id));
      list.push({
        _id: String(id),
        fullName,
        role,
        isLate: false,
        hasLeft: !!leaveInfo,
        leaveHour: leaveInfo?.leaveHour,
        leaveReason: leaveInfo?.reason,
        recordedAt: leaveInfo?.recordedAt,
      });
    });

    // Late added workers
    (currentActiveSession.lateWorkerIds || []).forEach((lw: any) => {
      const w = lw.workerId;
      const id = typeof w === 'string' ? w : w?._id;
      if (!id || seenIds.has(String(id))) return;
      seenIds.add(String(id));
      const fullName = typeof w === 'object' && w?.fullName ? w.fullName : (workers.find(wk => wk._id === id)?.fullName || 'Pekerja');
      const role = typeof w === 'object' ? (w?.position || w?.role) : (workers.find(wk => wk._id === id)?.position || workers.find(wk => wk._id === id)?.role);
      const leaveInfo = leaveMap.get(String(id));
      list.push({
        _id: String(id),
        fullName,
        role,
        isLate: true,
        addedAt: lw.addedAt,
        hasLeft: !!leaveInfo,
        leaveHour: leaveInfo?.leaveHour,
        leaveReason: leaveInfo?.reason,
        recordedAt: leaveInfo?.recordedAt,
      });
    });

    return list;
  }, [currentActiveSession, workers]);

  const workersStillPresent = useMemo(() => {
    return sessionAllWorkers.filter(w => !w.hasLeft);
  }, [sessionAllWorkers]);

  const workersAlreadyLeft = useMemo(() => {
    return sessionAllWorkers.filter(w => w.hasLeft);
  }, [sessionAllWorkers]);

  const isCurrentSessionClosed = useMemo(() => {
    if (!currentActiveSession) return false;
    return isSessionClosed(currentActiveSession);
  }, [currentActiveSession, isSessionClosed]);

  const isCurrentSessionPast = useMemo(() => {
    if (!currentActiveSession?.date) return false;
    const sessDateStr = new Date(currentActiveSession.date).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const todayStr = todayWIB();
    return sessDateStr < todayStr;
  }, [currentActiveSession]);

  const sessionContainerTitle = useMemo(() => {
    switch (sessionDateMode) {
      case 'today':
        return 'Sesi Grup Hari Ini';
      case 'yesterday':
        return 'Sesi Grup Kemarin';
      case 'unclosed':
        return 'Sesi Lampau Belum Ditutup';
      case 'custom':
        return `Sesi Tanggal ${selectedCustomDate ? formatWIBDate(new Date(selectedCustomDate)) : ''}`;
      default:
        return 'Daftar Sesi Grup';
    }
  }, [sessionDateMode, selectedCustomDate]);

  const sessionContainerSubtitle = useMemo(() => {
    switch (sessionDateMode) {
      case 'unclosed':
        return 'Daftar sesi dari tanggal sebelumnya di mana ada pekerja yang belum clock-out. Selesaikan agar data absensi rapi.';
      case 'yesterday':
        return 'Sesi grup multi-supervisor yang dibuat kemarin.';
      case 'custom':
        return `Sesi grup multi-supervisor yang dibuat pada tanggal ${selectedCustomDate ? formatWIBDate(new Date(selectedCustomDate)) : ''}.`;
      default:
        return 'Seluruh sesi multi-supervisor hari ini. Sesi otomatis ditutup setelah seluruh pekerja clock-out.';
    }
  }, [sessionDateMode, selectedCustomDate]);

  // Total workers present across all sessions today
  const totalWorkersToday = useMemo(() => {
    return todaySessions.reduce((acc, s) => {
      return acc + (s.workerIds?.length || 0) + (s.lateWorkerIds?.length || 0);
    }, 0);
  }, [todaySessions]);

  const totalLateToday = useMemo(() => {
    return todaySessions.reduce((acc, s) => acc + (s.lateWorkerIds?.length || 0), 0);
  }, [todaySessions]);

  // Supervisor working duration
  const getSelfDuration = () => {
    if (!selfRecord?.checkIn?.time) return null;
    const start = new Date(selfRecord.checkIn.time);
    const end = selfRecord.checkOut?.time ? new Date(selfRecord.checkOut.time) : liveTime;
    const diff = end.getTime() - start.getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}j ${m}m`;
  };

  // ── Initial Fetch ──
  useEffect(() => {
    fetchProjects();
    fetchTodaySessions();
    fetchTodaySelfAttendance();
    fetchRecentHistory();
  }, []);

  useEffect(() => {
    fetchSessions(sessionDateMode, selectedCustomDate);
  }, [sessionDateMode, selectedCustomDate]);

  useEffect(() => {
    if (selectedProjectId && !skipProjectFetchRef.current) {
      fetchProjectWorkers(selectedProjectId);
    }
    skipProjectFetchRef.current = false;
  }, [selectedProjectId]);

  // ── API Calls ──

  const fetchProjects = async () => {
    try {
      const response = await api.get('/attendance/projects');
      setProjects(response.data);
      await cacheAttendanceProjects(response.data);
      if (response.data?.length > 0) {
        if (!selectedProjectId) setSelectedProjectId(response.data[0]._id);
        if (!selfProjectId) setSelfProjectId(response.data[0]._id);
      }
      // Also fetch and cache company-wide workers pool
      api.get('/attendance/workers').then(workersRes => {
        if (workersRes.data && workersRes.data.length > 0) {
          cacheProjectWorkers('__all__', workersRes.data);
        }
      }).catch(() => {});
    } catch (err) {
      console.warn('Failed to fetch projects, checking offline cache', err);
      const cached = await getCachedAttendanceProjects();
      if (cached.length > 0) {
        setProjects(cached);
        if (!selectedProjectId) setSelectedProjectId(cached[0]._id);
        if (!selfProjectId) setSelfProjectId(cached[0]._id);
      } else {
        setProjects([]);
      }
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchUnclosedSessions = async () => {
    setLoadingUnclosed(true);
    try {
      const response = await api.get('/attendance-session/unclosed');
      const list = response.data?.sessions || [];
      setUnclosedSessions(list);
    } catch (err) {
      console.warn('Failed to fetch unclosed sessions', err);
    } finally {
      setLoadingUnclosed(false);
    }
  };

  const fetchSessions = async (
    mode: 'today' | 'yesterday' | 'unclosed' | 'custom' = sessionDateMode,
    customDate: string = selectedCustomDate
  ) => {
    setLoadingTodaySessions(true);
    try {
      if (mode === 'unclosed') {
        const response = await api.get('/attendance-session/unclosed');
        const list = response.data?.sessions || [];
        setTodaySessions(list);
        setUnclosedSessions(list);
        return;
      }

      let dateQuery = '';
      if (mode === 'today') {
        dateQuery = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      } else if (mode === 'yesterday') {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        dateQuery = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      } else if (mode === 'custom') {
        dateQuery = customDate;
      }

      const response = await api.get(`/attendance-session?date=${dateQuery}&limit=50`);
      const sessions = response.data?.sessions || [];
      setTodaySessions(sessions);
      if (mode === 'today') {
        cacheTodaySessions(sessions);
      }
    } catch (err) {
      console.warn('Failed to fetch sessions, checking offline cache', err);
      if (mode === 'today') {
        const cached = await getCachedTodaySessions();
        setTodaySessions(cached.length > 0 ? cached : []);
      } else {
        setTodaySessions([]);
      }
    } finally {
      setLoadingTodaySessions(false);
    }
  };

  const fetchTodaySessions = async () => {
    await Promise.all([
      fetchSessions(sessionDateMode, selectedCustomDate),
      fetchUnclosedSessions(),
    ]);
  };

  const fetchTodaySelfAttendance = async () => {
    setLoadingSelf(true);
    try {
      const response = await api.get('/attendance/today');
      setSelfRecord(response.data || null);
      if (user?._id) {
        cacheTodayAttendance(user._id, response.data || null);
      }
    } catch (err) {
      console.warn('Failed to fetch self attendance, checking offline cache', err);
      if (user?._id) {
        const cached = await getCachedTodayAttendance(user._id);
        if (cached) {
          setSelfRecord(cached);
        }
      }
    } finally {
      setLoadingSelf(false);
    }
  };

  const fetchRecentHistory = async () => {
    setLoadingRecent(true);
    try {
      const todayStr = todayWIB();
      const todayD = wibDate(todayStr);
      if (!todayD) return;
      const weekAgo = new Date(todayD);
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
      const response = await api.get('/attendance', {
        params: {
          startDate: weekAgo.toISOString().split('T')[0],
          endDate: todayStr,
        },
      });
      setRecentRecords((response.data || []).slice(0, 7));
    } catch (err) {
      console.error('Failed to fetch recent history', err);
    } finally {
      setLoadingRecent(false);
    }
  };

  const fetchProjectWorkers = async (projectId: string, preserveSelection = false) => {
    setLoadingWorkers(true);
    try {
      const response = await api.get(`/projects/${projectId}`);
      const project = response.data;
      const assignedWorkers: WorkerItem[] = (project.assignedTo || [])
        .filter((u: any) => u && u._id)
        .map((u: any): WorkerItem => ({
          _id: String(u._id),
          fullName: u.fullName || 'Unknown',
          role: u.role || 'worker',
          position: u.position || u.role || 'worker',
        }))
        .sort((a: WorkerItem, b: WorkerItem) => a.fullName.localeCompare(b.fullName));
      setWorkers(assignedWorkers);
      cacheProjectWorkers(projectId, assignedWorkers);
      if (!preserveSelection) {
        setSelectedWorkerIds(new Set());
      }
    } catch (err) {
      console.warn('Failed to fetch project workers, checking offline cache', err);
      const cached = await getCachedProjectWorkers(projectId);
      if (cached.length > 0) {
        const mapped = cached.map(c => ({
          _id: String(c._id),
          fullName: c.fullName,
          role: c.role,
          position: c.position || c.role,
        })).sort((a, b) => a.fullName.localeCompare(b.fullName));
        setWorkers(mapped);
      } else {
        setWorkers([]);
      }
    } finally {
      setLoadingWorkers(false);
    }
  };

  // ── Group Attendance Handlers ──

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressing(true);
    try {
      const compressed = await compress(file);
      setPhoto(compressed);
      setPhotoPreview(URL.createObjectURL(compressed));
    } catch (err) {
      console.error('Compression failed, using original', err);
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    } finally {
      setCompressing(false);
    }
  };

  const toggleWorker = (workerId: string) => {
    const id = String(workerId);
    setSelectedWorkerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allFilteredSelected =
      filteredWorkers.length > 0 &&
      filteredWorkers.every(w => selectedWorkerIds.has(String(w._id)));

    if (allFilteredSelected) {
      setSelectedWorkerIds(prev => {
        const next = new Set(prev);
        filteredWorkers.forEach(w => next.delete(String(w._id)));
        return next;
      });
    } else {
      setSelectedWorkerIds(prev => {
        const next = new Set(prev);
        filteredWorkers.forEach(w => next.add(String(w._id)));
        return next;
      });
    }
  };

  const handleAddOfflineWorker = async () => {
    if (!newWorkerName.trim()) return;
    setAddingWorker(true);
    try {
      const created = await addOfflineWorker(selectedProjectId, {
        fullName: newWorkerName.trim(),
        role: newWorkerRole,
        position: newWorkerRole,
      });

      const workerItem: WorkerItem = {
        _id: String(created._id),
        fullName: created.fullName,
        role: created.role,
        position: created.position,
      };

      setWorkers(prev => {
        const exists = prev.some(w => w._id === workerItem._id);
        if (exists) return prev;
        return [...prev, workerItem].sort((a, b) => a.fullName.localeCompare(b.fullName));
      });

      // Auto-select the newly added worker
      setSelectedWorkerIds(prev => new Set(prev).add(workerItem._id));

      setNewWorkerName('');
      setShowAddWorkerModal(false);
      setAlertData({
        visible: true,
        type: 'success',
        title: 'Pekerja Ditambahkan',
        message: `Pekerja "${workerItem.fullName}" berhasil ditambahkan dan dicentang hadir.`,
      });
    } catch (e: any) {
      console.error('Error adding offline worker', e);
    } finally {
      setAddingWorker(false);
    }
  };

  const handleSubmit = async () => {
    if (!photo || !selectedProjectId || selectedWorkerIds.size === 0) return;
    setSubmitting(true);

    if (!navigator.onLine) {
      try {
        const photoBase64 = await fileToBase64(photo);
        const localUuid = `offline_sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const nowIso = new Date().toISOString();
        const workerNames = Array.from(selectedWorkerIds).map(id => {
          const w = workers.find(item => item._id === id);
          return w ? w.fullName : 'Worker';
        });

        await queueOfflineAttendance({
          localUuid,
          type: 'GROUP_SESSION',
          userId: user?._id || '',
          userName: user?.fullName || '',
          projectId: selectedProjectId,
          projectName: selectedProject?.nama || 'Proyek',
          workerIds: Array.from(selectedWorkerIds),
          workerNames,
          notes,
          photoBase64,
          recordedAt: nowIso,
        });

        const localSession: ActiveSession = {
          _id: localUuid,
          supervisorId: user ? { _id: user._id, fullName: user.fullName, role: user.role } : '',
          projectId: selectedProject ? selectedProject : { _id: selectedProjectId, nama: 'Proyek' },
          date: nowIso,
          photoUrl: photoPreview || '',
          workerIds: Array.from(selectedWorkerIds),
          lateWorkerIds: [],
          leaveRecords: [],
          notes,
          status: 'active',
          createdAt: nowIso,
          isOffline: true,
        };

        setTodaySessions(prev => [localSession, ...prev]);
        setCurrentActiveSession(localSession);
        setResult({
          session: { _id: localUuid },
          created: selectedWorkerIds.size,
          conflicts: [],
        });
        setAlertData({
          visible: true,
          type: 'success',
          title: 'Absensi Tersimpan (Offline)',
          message: `${selectedWorkerIds.size} pekerja diabsen secara offline. Data tersimpan di memori perangkat dan akan disinkronkan saat tersambung internet.`,
        });
      } catch (offlineErr: any) {
        setAlertData({
          visible: true,
          type: 'error',
          title: 'Gagal Simpan Offline',
          message: offlineErr.message || 'Gagal menyimpan sesi offline.',
        });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const formData = new FormData();
      formData.append('groupPhoto', photo);
      formData.append('projectId', selectedProjectId);
      formData.append('workerIds', JSON.stringify(Array.from(selectedWorkerIds)));
      if (notes) formData.append('notes', notes);

      const response = await api.post('/attendance-session', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(response.data);
      if (response.data.session) {
        setCurrentActiveSession({
          ...response.data.session,
          workerIds: Array.from(selectedWorkerIds),
          lateWorkerIds: [],
          projectId: selectedProject ? selectedProject : { _id: selectedProjectId, nama: 'Proyek' },
          supervisorId: user ? { _id: user._id, fullName: user.fullName, role: user.role } : '',
        });
      }
      fetchTodaySessions();
      setAlertData({
        visible: true,
        type: 'success',
        title: 'Absensi Berhasil!',
        message: response.data.msg,
      });
    } catch (err: any) {
      if (!err.response) {
        try {
          const photoBase64 = await fileToBase64(photo);
          const localUuid = `offline_sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const nowIso = new Date().toISOString();
          const workerNames = Array.from(selectedWorkerIds).map(id => {
            const w = workers.find(item => item._id === id);
            return w ? w.fullName : 'Worker';
          });

          await queueOfflineAttendance({
            localUuid,
            type: 'GROUP_SESSION',
            userId: user?._id || '',
            userName: user?.fullName || '',
            projectId: selectedProjectId,
            projectName: selectedProject?.nama || 'Proyek',
            workerIds: Array.from(selectedWorkerIds),
            workerNames,
            notes,
            photoBase64,
            recordedAt: nowIso,
          });

          const localSession: ActiveSession = {
            _id: localUuid,
            supervisorId: user ? { _id: user._id, fullName: user.fullName, role: user.role } : '',
            projectId: selectedProject ? selectedProject : { _id: selectedProjectId, nama: 'Proyek' },
            date: nowIso,
            photoUrl: photoPreview || '',
            workerIds: Array.from(selectedWorkerIds),
            lateWorkerIds: [],
            leaveRecords: [],
            notes,
            status: 'active',
            createdAt: nowIso,
            isOffline: true,
          };

          setTodaySessions(prev => [localSession, ...prev]);
          setCurrentActiveSession(localSession);
          setResult({
            session: { _id: localUuid },
            created: selectedWorkerIds.size,
            conflicts: [],
          });
          setAlertData({
            visible: true,
            type: 'success',
            title: 'Absensi Tersimpan (Offline)',
            message: 'Koneksi terputus. Sesi absensi grup berhasil disimpan di perangkat.',
          });
        } catch {
          setAlertData({
            visible: true,
            type: 'error',
            title: 'Gagal Submit',
            message: err.message || 'Terjadi kesalahan jaringan.',
          });
        }
      } else {
        setAlertData({
          visible: true,
          type: 'error',
          title: 'Gagal Submit',
          message: err.response?.data?.msg || 'Terjadi kesalahan. Coba lagi.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLateAdd = async () => {
    if (!lateWorkerId || !result?.session?._id) return;
    setAddingLate(true);
    const isLocalSession = result.session._id.startsWith('offline_');

    if (!navigator.onLine || isLocalSession) {
      const nowIso = new Date().toISOString();
      await queueOfflineAttendance({
        localUuid: `off_late_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: 'SESSION_LATE_ADD',
        userId: user?._id || '',
        userName: user?.fullName || '',
        projectId: selectedProjectId,
        targetSessionId: result.session._id,
        targetWorkerId: lateWorkerId,
        recordedAt: nowIso,
      });

      setSelectedWorkerIds(prev => new Set(prev).add(lateWorkerId));
      if (currentActiveSession) {
        const updated = {
          ...currentActiveSession,
          lateWorkerIds: [
            ...(currentActiveSession.lateWorkerIds || []),
            { workerId: lateWorkerId, addedAt: nowIso } as any,
          ],
        };
        setCurrentActiveSession(updated);
        setTodaySessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      }
      setLateWorkerId('');
      setAlertData({ visible: true, type: 'success', title: 'Tersimpan (Offline)', message: 'Pekerja susulan disimpan di perangkat.' });
      setAddingLate(false);
      return;
    }

    try {
      const response = await api.post(
        `/attendance-session/${result.session._id}/late-add`,
        { workerId: lateWorkerId }
      );
      setAlertData({ visible: true, type: 'success', title: 'Berhasil', message: response.data.msg });
      setSelectedWorkerIds(prev => new Set(prev).add(lateWorkerId));
      setLateWorkerId('');
      fetchTodaySessions();
    } catch (err: any) {
      if (!err.response) {
        const nowIso = new Date().toISOString();
        await queueOfflineAttendance({
          localUuid: `off_late_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          type: 'SESSION_LATE_ADD',
          userId: user?._id || '',
          userName: user?.fullName || '',
          projectId: selectedProjectId,
          targetSessionId: result.session._id,
          targetWorkerId: lateWorkerId,
          recordedAt: nowIso,
        });
        setSelectedWorkerIds(prev => new Set(prev).add(lateWorkerId));
        setLateWorkerId('');
        setAlertData({ visible: true, type: 'success', title: 'Tersimpan (Offline)', message: 'Koneksi terputus. Pekerja susulan disimpan di perangkat.' });
      } else {
        setAlertData({
          visible: true, type: 'error', title: 'Gagal',
          message: err.response?.data?.msg || 'Gagal menambahkan pekerja',
        });
      }
    } finally {
      setAddingLate(false);
    }
  };

  const handleLeaveHour = async () => {
    if (!result?.session?._id) return;
    setRecordingLeave(true);
    const isLocalSession = result.session._id.startsWith('offline_');

    try {
      let workersPayload: { workerId: string; leaveHour: string; reason: string }[] = [];

      if (leaveMode === 'individual') {
        if (!leaveWorkerId || !leaveHour) {
          setAlertData({ visible: true, type: 'error', title: 'Data Kurang', message: 'Pilih pekerja dan jam pulang' });
          setRecordingLeave(false);
          return;
        }
        workersPayload = [{ workerId: leaveWorkerId, leaveHour, reason: leaveReason }];
      } else {
        if (bulkLeaveWorkerIds.size === 0 || !bulkLeaveHour) {
          setAlertData({ visible: true, type: 'error', title: 'Data Kurang', message: 'Pilih pekerja dan jam pulang' });
          setRecordingLeave(false);
          return;
        }
        workersPayload = Array.from(bulkLeaveWorkerIds).map(id => ({
          workerId: id,
          leaveHour: bulkLeaveHour,
          reason: bulkLeaveReason,
        }));
      }

      if (!navigator.onLine || isLocalSession) {
        const nowIso = new Date().toISOString();
        for (const wp of workersPayload) {
          await queueOfflineAttendance({
            localUuid: `off_leave_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            type: 'SESSION_LEAVE_HOUR',
            userId: user?._id || '',
            userName: user?.fullName || '',
            projectId: selectedProjectId,
            targetSessionId: result.session._id,
            targetWorkerId: wp.workerId,
            leaveHour: wp.leaveHour,
            reason: wp.reason,
            recordedAt: nowIso,
          });
        }

        if (currentActiveSession) {
          const newLeaves = workersPayload.map(wp => ({
            workerId: wp.workerId,
            leaveHour: wp.leaveHour,
            reason: wp.reason,
            recordedAt: nowIso,
          }));
          const updated = {
            ...currentActiveSession,
            leaveRecords: [...(currentActiveSession.leaveRecords || []), ...newLeaves as any],
          };
          setCurrentActiveSession(updated);
          setTodaySessions(prev => prev.map(s => s._id === updated._id ? updated : s));
        }

        setLeaveWorkerId('');
        setLeaveHour('');
        setLeaveReason('');
        setBulkLeaveWorkerIds(new Set());
        setBulkLeaveHour('');
        setBulkLeaveReason('');
        setAlertData({ visible: true, type: 'success', title: 'Tersimpan (Offline)', message: 'Catatan pulang awal disimpan di perangkat.' });
        setRecordingLeave(false);
        return;
      }

      const response = await api.post(
        `/attendance-session/${result.session._id}/leave-hour`,
        { workers: workersPayload }
      );

      // Refresh current session from server to update status & leave records
      try {
        const sessionRes = await api.get(`/attendance-session/${result.session._id}`);
        setCurrentActiveSession(sessionRes.data);
      } catch (e) {
        if (response.data.session) {
          setCurrentActiveSession(response.data.session);
        }
      }

      if (response.data.isClosed) {
        setAlertData({
          visible: true,
          type: 'success',
          title: 'Sesi Selesai & Ditutup',
          message: 'Semua pekerja dalam sesi ini telah clock-out. Sesi ini telah resmi ditutup dan menjadi read-only.',
        });
      } else {
        setAlertData({ visible: true, type: 'success', title: 'Berhasil', message: response.data.msg });
      }

      setLeaveWorkerId('');
      setLeaveHour('');
      setLeaveReason('');
      setBulkLeaveWorkerIds(new Set());
      setBulkLeaveHour('');
      setBulkLeaveReason('');
      await fetchTodaySessions();
    } catch (err: any) {
      setAlertData({
        visible: true, type: 'error', title: 'Gagal',
        message: err.response?.data?.msg || 'Gagal mencatat jam pulang',
      });
    } finally {
      setRecordingLeave(false);
    }
  };

  const handleCloseAllAndFinishSession = async () => {
    if (!result?.session?._id) return;
    setClosingSession(true);
    const isLocalSession = result.session._id.startsWith('offline_');

    if (!navigator.onLine || isLocalSession) {
      const finalHour = closeLeaveHour || (isCurrentSessionPast ? '17:00' : formatWIBTime(new Date()));
      const defaultReason = isCurrentSessionPast
        ? 'Clock-out susulan sesi lampau oleh supervisor'
        : 'Penutupan sesi offline';
      const nowIso = new Date().toISOString();
      await queueOfflineAttendance({
        localUuid: `off_close_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: 'SESSION_CLOSE',
        userId: user?._id || '',
        userName: user?.fullName || '',
        projectId: selectedProjectId,
        targetSessionId: result.session._id,
        leaveHour: finalHour,
        reason: closeReason || defaultReason,
        recordedAt: nowIso,
      });

      if (currentActiveSession) {
        const updated: ActiveSession = {
          ...currentActiveSession,
          status: 'closed',
          closedAt: nowIso,
        };
        setCurrentActiveSession(updated);
        setTodaySessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      }
      setShowCloseModal(false);
      setCloseLeaveHour('');
      setCloseReason('');
      setAlertData({
        visible: true,
        type: 'success',
        title: 'Sesi Ditutup (Offline)',
        message: 'Penutupan sesi tersimpan di perangkat dan akan disinkronkan saat online.',
      });
      setClosingSession(false);
      return;
    }

    try {
      const finalHour = closeLeaveHour || (isCurrentSessionPast ? '17:00' : formatWIBTime(new Date()));
      const defaultReason = isCurrentSessionPast
        ? 'Clock-out susulan sesi lampau oleh supervisor'
        : 'Clock-out serentak & penutupan sesi oleh supervisor';

      const response = await api.post(`/attendance-session/${result.session._id}/close`, {
        defaultLeaveHour: finalHour,
        reason: closeReason || defaultReason,
      });

      // Refresh current session from server
      const sessionRes = await api.get(`/attendance-session/${result.session._id}`);
      setCurrentActiveSession(sessionRes.data);

      setAlertData({
        visible: true,
        type: 'success',
        title: 'Sesi Resmi Ditutup',
        message: response.data.msg || 'Semua sisa pekerja telah di-clockout dan sesi resmi ditutup.',
      });

      setShowCloseModal(false);
      setCloseLeaveHour('');
      setCloseReason('');
      await fetchTodaySessions();
    } catch (err: any) {
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Gagal Menutup Sesi',
        message: err.response?.data?.msg || 'Terjadi kesalahan saat menutup sesi.',
      });
    } finally {
      setClosingSession(false);
    }
  };

  const toggleBulkLeaveWorker = (id: string) => {
    setBulkLeaveWorkerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllRemainingWorkers = () => {
    setBulkLeaveWorkerIds(new Set(workersStillPresent.map(w => w._id)));
  };

  const clearBulkLeaveWorkers = () => {
    setBulkLeaveWorkerIds(new Set());
  };

  const handleResumeSession = async (session: ActiveSession) => {
    setResumingSessionId(session._id);
    try {
      const response = await api.get(`/attendance-session/${session._id}`);
      const fullSession = response.data;
      setCurrentActiveSession(fullSession);

      const projectId = typeof fullSession.projectId === 'string'
        ? fullSession.projectId
        : fullSession.projectId?._id;

      const workerIdList: string[] = [
        ...(fullSession.workerIds || []).map((w: any) =>
          typeof w === 'string' ? w : w._id
        ),
        ...(fullSession.lateWorkerIds || []).map((lw: any) =>
          typeof lw.workerId === 'string' ? lw.workerId : lw.workerId?._id
        ).filter(Boolean),
      ];

      if (projectId) {
        await fetchProjectWorkers(projectId, true);
        skipProjectFetchRef.current = true;
        setSelectedProjectId(projectId);
      }

      setSelectedWorkerIds(new Set(workerIdList));

      setResult({
        session: { _id: fullSession._id },
        created: workerIdList.length,
        conflicts: [],
      });

      const isClosed = isSessionClosed(fullSession);
      const sessDateStr = new Date(fullSession.date).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      const isPast = sessDateStr < todayWIB();

      if (isPast && !isClosed) {
        setLeaveHour('17:00');
        setBulkLeaveHour('17:00');
        setLeaveReason('Clock-out susulan sesi lampau');
        setBulkLeaveReason('Clock-out susulan sesi lampau');
      } else if (!isClosed) {
        setLeaveHour(formatWIBTime(new Date()));
        setBulkLeaveHour(formatWIBTime(new Date()));
        setLeaveReason('');
        setBulkLeaveReason('');
      }

      setAlertData({
        visible: true,
        type: 'success',
        title: isClosed
          ? 'Detail Sesi Dimuat (Selesai)'
          : isPast
            ? 'Sesi Lampau Dimuat (Perlu Clock-Out)'
            : 'Sesi Dimuat (Aktif)',
        message: isClosed
          ? 'Sesi ini telah selesai/ditutup. Anda dapat meninjau rekap jam pulang pekerja.'
          : isPast
            ? 'Sesi dari hari sebelumnya. Jam pulang diset default 17:00 WIB untuk memudahkan penyelesaian clock-out.'
            : 'Anda melanjutkan sesi absensi yang sedang aktif.',
      });
    } catch (err) {
      console.error('Failed to resume session', err);
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Gagal Memuat Sesi',
        message: 'Tidak dapat memuat detail sesi. Coba lagi.',
      });
    } finally {
      setResumingSessionId(null);
    }
  };

  const handleBackToSessions = () => {
    setResult(null);
    setCurrentActiveSession(null);
    setStep(1);
    fetchTodaySessions();
  };

  const canDeleteSession = useCallback((session: any) => {
    if (!user || !session) return false;
    const adminRoles = ['owner', 'president_director', 'operational_director', 'director', 'admin_project'];
    if (adminRoles.includes(user.role)) return true;
    const supervisorId = typeof session.supervisorId === 'object' ? session.supervisorId?._id : session.supervisorId;
    return String(supervisorId) === String(user._id);
  }, [user]);

  const handleConfirmDeleteSession = async () => {
    if (!sessionToDelete) return;
    setDeletingSession(true);
    try {
      const isLocalSession = sessionToDelete._id?.startsWith('offline_');
      if (isLocalSession) {
        await attendanceOfflineDb.cachedTodaySessions.delete(sessionToDelete._id);
        await attendanceOfflineDb.offlineAttendance.where('localUuid').equals(sessionToDelete._id).delete();
        await attendanceOfflineDb.offlineAttendance.where('targetSessionId').equals(sessionToDelete._id).delete();
      } else {
        await deleteAttendanceSession(sessionToDelete._id);
      }

      setAlertData({
        visible: true,
        type: 'success',
        title: 'Sesi Dieliminasi',
        message: 'Sesi absensi dan catatan clock-in pekerja terkait berhasil dihapus.',
      });

      if (result && result.session._id === sessionToDelete._id) {
        setResult(null);
        setCurrentActiveSession(null);
        setStep(1);
      }

      await fetchTodaySessions();
      setSessionToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete attendance session:', err);
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Gagal Menghapus Sesi',
        message: err.response?.data?.msg || err.message || 'Terjadi kesalahan saat menghapus sesi absensi.',
      });
    } finally {
      setDeletingSession(false);
    }
  };

  const resetAll = () => {
    setStep(1);
    setResult(null);
    setCurrentActiveSession(null);
    setPhoto(null);
    setPhotoPreview(null);
    setSelectedProjectId('');
    setSelectedWorkerIds(new Set());
    setNotes('');
    setLateWorkerId('');
    setBulkLeaveWorkerIds(new Set());
    fetchTodaySessions();
  };

  // ── Supervisor Self-Attendance Handlers ──

  const handleSelfCheckIn = async () => {
    if (!selfProjectId) {
      setAlertData({ visible: true, type: 'error', title: 'Pilih Proyek', message: 'Silakan pilih lokasi proyek untuk check-in.' });
      return;
    }
    setSelfSubmitting(true);

    if (!navigator.onLine) {
      const localUuid = `off_self_in_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const nowIso = new Date().toISOString();
      const proj = projects.find(p => p._id === selfProjectId);
      await queueOfflineAttendance({
        localUuid,
        type: 'SELF_CHECKIN',
        userId: user?._id || '',
        userName: user?.fullName || '',
        projectId: selfProjectId,
        projectName: proj?.nama || 'Proyek',
        recordedAt: nowIso,
      });
      const opt = {
        _id: localUuid,
        date: nowIso,
        checkIn: { time: nowIso },
        wageType: 'daily',
        status: 'Present',
        projectId: proj ? { _id: proj._id, nama: proj.nama } : undefined,
        isOffline: true,
      };
      setSelfRecord(opt as any);
      if (user?._id) cacheTodayAttendance(user._id, opt);
      setAlertData({
        visible: true,
        type: 'success',
        title: 'Check-In Berhasil! (Offline)',
        message: `Check-in mandiri tercatat di perangkat pada ${formatWIBTime(new Date())} WIB dan akan disinkronkan saat online.`,
      });
      setSelfSubmitting(false);
      return;
    }

    try {
      await api.post('/attendance/checkin', { projectId: selfProjectId });
      setAlertData({
        visible: true,
        type: 'success',
        title: 'Check-In Berhasil!',
        message: `Check-in berhasil tercatat pada ${formatWIBTime(new Date())} WIB.`,
      });
      await fetchTodaySelfAttendance();
      await fetchRecentHistory();
    } catch (err: any) {
      if (!err.response) {
        const localUuid = `off_self_in_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const nowIso = new Date().toISOString();
        const proj = projects.find(p => p._id === selfProjectId);
        await queueOfflineAttendance({
          localUuid,
          type: 'SELF_CHECKIN',
          userId: user?._id || '',
          userName: user?.fullName || '',
          projectId: selfProjectId,
          projectName: proj?.nama || 'Proyek',
          recordedAt: nowIso,
        });
        const opt = {
          _id: localUuid,
          date: nowIso,
          checkIn: { time: nowIso },
          wageType: 'daily',
          status: 'Present',
          projectId: proj ? { _id: proj._id, nama: proj.nama } : undefined,
          isOffline: true,
        };
        setSelfRecord(opt as any);
        if (user?._id) cacheTodayAttendance(user._id, opt);
        setAlertData({
          visible: true,
          type: 'success',
          title: 'Check-In Berhasil! (Offline)',
          message: `Koneksi terputus. Check-in mandiri tercatat di perangkat pada ${formatWIBTime(new Date())} WIB.`,
        });
      } else {
        setAlertData({
          visible: true,
          type: 'error',
          title: 'Check-In Gagal',
          message: err.response?.data?.msg || 'Gagal melakukan check-in mandiri.',
        });
      }
    } finally {
      setSelfSubmitting(false);
    }
  };

  const handleSelfCheckOut = async () => {
    if (!selfPhoto) {
      setAlertData({ visible: true, type: 'error', title: 'Foto Selfie Wajib', message: 'Silakan ambil foto selfie untuk konfirmasi check-out.' });
      return;
    }
    setSelfSubmitting(true);

    if (!navigator.onLine) {
      try {
        const photoBase64 = await fileToBase64(selfPhoto);
        const localUuid = `off_self_out_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const nowIso = new Date().toISOString();
        await queueOfflineAttendance({
          localUuid,
          type: 'SELF_CHECKOUT',
          userId: user?._id || '',
          userName: user?.fullName || '',
          projectId: (selfRecord?.projectId as any)?._id || selfProjectId || '',
          projectName: (selfRecord?.projectId as any)?.nama || '',
          recordedAt: nowIso,
          photoBase64,
        });
        const opt = {
          ...(selfRecord || {
            _id: localUuid,
            date: nowIso,
            status: 'Present',
          }),
          checkOut: { time: nowIso, photo: selfPhotoPreview || undefined },
          isOffline: true,
        };
        setSelfRecord(opt as any);
        if (user?._id) cacheTodayAttendance(user._id, opt);
        setSelfPhoto(null);
        setSelfPhotoPreview(null);
        setAlertData({
          visible: true,
          type: 'success',
          title: 'Check-Out Berhasil! (Offline)',
          message: `Check-out mandiri tercatat di perangkat pada ${formatWIBTime(new Date())} WIB.`,
        });
      } catch (err: any) {
        setAlertData({ visible: true, type: 'error', title: 'Gagal Simpan Offline', message: err.message });
      } finally {
        setSelfSubmitting(false);
      }
      return;
    }

    try {
      const formData = new FormData();
      formData.append('photo', selfPhoto);
      await api.put('/attendance/checkout', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAlertData({
        visible: true,
        type: 'success',
        title: 'Check-Out Berhasil!',
        message: `Check-out berhasil tercatat pada ${formatWIBTime(new Date())} WIB. Status sesi aktif telah diperbarui.`,
      });
      setSelfPhoto(null);
      setSelfPhotoPreview(null);
      await fetchTodaySelfAttendance();
      await fetchRecentHistory();
      await fetchTodaySessions();
    } catch (err: any) {
      if (!err.response && selfPhoto) {
        try {
          const photoBase64 = await fileToBase64(selfPhoto);
          const localUuid = `off_self_out_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const nowIso = new Date().toISOString();
          await queueOfflineAttendance({
            localUuid,
            type: 'SELF_CHECKOUT',
            userId: user?._id || '',
            userName: user?.fullName || '',
            projectId: (selfRecord?.projectId as any)?._id || selfProjectId || '',
            projectName: (selfRecord?.projectId as any)?.nama || '',
            recordedAt: nowIso,
            photoBase64,
          });
          const opt = {
            ...(selfRecord || {
              _id: localUuid,
              date: nowIso,
              status: 'Present',
            }),
            checkOut: { time: nowIso, photo: selfPhotoPreview || undefined },
            isOffline: true,
          };
          setSelfRecord(opt as any);
          if (user?._id) cacheTodayAttendance(user._id, opt);
          setSelfPhoto(null);
          setSelfPhotoPreview(null);
          setAlertData({
            visible: true,
            type: 'success',
            title: 'Check-Out Berhasil! (Offline)',
            message: `Koneksi terputus. Check-out mandiri tercatat di perangkat pada ${formatWIBTime(new Date())} WIB.`,
          });
        } catch {
          setAlertData({
            visible: true,
            type: 'error',
            title: 'Check-Out Gagal',
            message: err.message || 'Gagal melakukan check-out mandiri.',
          });
        }
      } else {
        setAlertData({
          visible: true,
          type: 'error',
          title: 'Check-Out Gagal',
          message: err.response?.data?.msg || 'Gagal melakukan check-out mandiri.',
        });
      }
    } finally {
      setSelfSubmitting(false);
    }
  };

  // ── Kasbon & Permit Handlers ──

  const handleKasbonSubmit = async () => {
    if (!kasbonAmount || Number(kasbonAmount) <= 0) {
      setAlertData({ visible: true, type: 'error', title: 'Nominal Wajib', message: 'Masukkan nominal kasbon yang valid.' });
      return;
    }
    if (Number(kasbonAmount) > 200000) {
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Batas Kasbon Terlampaui',
        message: 'Maksimum limit pengajuan kasbon adalah Rp 200.000.',
      });
      return;
    }
    setSubmittingKasbon(true);
    try {
      await api.post('/kasbon', {
        amount: Number(kasbonAmount),
        reason: kasbonReason,
        userId: user?._id,
      });
      setAlertData({
        visible: true,
        type: 'success',
        title: 'Kasbon Berhasil Diajukan',
        message: 'Pengajuan kasbon Anda telah diteruskan ke bagian keuangan.',
      });
      setKasbonOpen(false);
      setKasbonAmount('');
      setKasbonReason('');
    } catch (err: any) {
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Kasbon Gagal',
        message: err.response?.data?.msg || 'Gagal mengajukan kasbon.',
      });
    } finally {
      setSubmittingKasbon(false);
    }
  };

  const handlePermitSubmit = async () => {
    if (!permitReason || !permitPhoto) {
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Data Belum Lengkap',
        message: 'Alasan izin dan foto bukti (surat dokter / keterangan) wajib dilampirkan.',
      });
      return;
    }
    setSubmittingPermit(true);

    if (!navigator.onLine) {
      try {
        const photoBase64 = await fileToBase64(permitPhoto);
        const localUuid = `off_self_per_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const nowIso = new Date().toISOString();
        await queueOfflineAttendance({
          localUuid,
          type: 'PERMIT',
          userId: user?._id || '',
          userName: user?.fullName || '',
          projectId: selfProjectId || '',
          reason: permitReason,
          recordedAt: nowIso,
          photoBase64,
        });
        const opt = {
          _id: localUuid,
          date: nowIso,
          status: 'Permit',
          isOffline: true,
        };
        setSelfRecord(opt as any);
        if (user?._id) cacheTodayAttendance(user._id, opt);
        setPermitModal(false);
        setPermitReason('');
        setPermitPhoto(null);
        setPermitPhotoPreview(null);
        setAlertData({
          visible: true,
          type: 'success',
          title: 'Pengajuan Izin Tersimpan (Offline)',
          message: 'Pengajuan izin berhasil dicatat di perangkat.',
        });
      } catch (err: any) {
        setAlertData({ visible: true, type: 'error', title: 'Gagal Simpan Offline', message: err.message });
      } finally {
        setSubmittingPermit(false);
      }
      return;
    }

    try {
      const formData = new FormData();
      formData.append('reason', permitReason);
      formData.append('evidence', permitPhoto);
      await api.post('/attendance/permit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAlertData({
        visible: true,
        type: 'success',
        title: 'Pengajuan Izin Terkirim',
        message: 'Pengajuan izin / sakit Anda berhasil dicatat.',
      });
      setPermitModal(false);
      setPermitReason('');
      setPermitPhoto(null);
      setPermitPhotoPreview(null);
      await fetchTodaySelfAttendance();
    } catch (err: any) {
      if (!err.response && permitPhoto) {
        try {
          const photoBase64 = await fileToBase64(permitPhoto);
          const localUuid = `off_self_per_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const nowIso = new Date().toISOString();
          await queueOfflineAttendance({
            localUuid,
            type: 'PERMIT',
            userId: user?._id || '',
            userName: user?.fullName || '',
            projectId: selfProjectId || '',
            reason: permitReason,
            recordedAt: nowIso,
            photoBase64,
          });
          const opt = {
            _id: localUuid,
            date: nowIso,
            status: 'Permit',
            isOffline: true,
          };
          setSelfRecord(opt as any);
          if (user?._id) cacheTodayAttendance(user._id, opt);
          setPermitModal(false);
          setPermitReason('');
          setPermitPhoto(null);
          setPermitPhotoPreview(null);
          setAlertData({
            visible: true,
            type: 'success',
            title: 'Pengajuan Izin Tersimpan (Offline)',
            message: 'Koneksi terputus. Pengajuan izin berhasil dicatat di perangkat.',
          });
        } catch {
          setAlertData({
            visible: true,
            type: 'error',
            title: 'Pengajuan Izin Gagal',
            message: err.message || 'Gagal mengajukan izin.',
          });
        }
      } else {
        setAlertData({
          visible: true,
          type: 'error',
          title: 'Pengajuan Izin Gagal',
          message: err.response?.data?.msg || 'Gagal mengajukan izin.',
        });
      }
    } finally {
      setSubmittingPermit(false);
    }
  };

  // ── Guard ──
  if (!isSupervisor) {
    return (
      <div className="p-8 max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-4 shadow-sm">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">Akses Ditolak</h2>
        <p className="text-sm text-text-muted mb-6">Halaman ini dikhususkan untuk Supervisor, Site Manager, Foreman, dan Direksi.</p>
        <Button title="Kembali ke Dashboard" onClick={() => navigate('/')} variant="outline" />
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="p-6 max-w-7xl mx-auto max-lg:p-4 max-sm:p-3 space-y-6">
      <Alert
        visible={alertData.visible}
        type={alertData.type}
        title={alertData.title}
        message={alertData.message}
        onClose={() => setAlertData({ ...alertData, visible: false })}
      />

      {/* Offline sync banner */}
      <OfflineAttendanceBanner
        onSyncComplete={() => {
          fetchTodaySessions();
          fetchTodaySelfAttendance();
          fetchRecentHistory();
        }}
      />

      {/* ══════════════ 1. ENTERPRISE ERP HEADER ══════════════ */}
      <div className="rounded-2xl bg-bg-white border border-border-light p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          {/* Title & Breadcrumb */}
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
              <span>MTERP</span>
              <span>/</span>
              <span>Operasional Proyek</span>
              <span>/</span>
              <span className="text-primary font-black">Kehadiran & Sesi Grup</span>
            </div>
            <h1 className="text-2xl font-black text-text-primary tracking-tight m-0 flex items-center gap-2.5">
              <span>Pusat Absensi Grup & Mandiri</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-primary/10 text-primary border border-primary/20">
                ERP Site Ops
              </span>
            </h1>
            <p className="text-xs text-text-muted m-0 mt-1 max-w-xl">
              Platform terpusat absensi multi-supervisor, foto grup lapangan, perizinan, kasbon, dan sinkronisasi gaji harian.
            </p>
          </div>

          {/* Real-time Clock Widget */}
          <div className="flex items-center gap-4 bg-bg-secondary p-3.5 rounded-xl border border-border-light shrink-0">
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5 mb-0.5">
                <span className={`w-2 h-2 rounded-full ${isWorkingHours ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  {isWorkingHours ? 'Jam Kerja Aktif (08:00 - 16:00)' : 'Luar Jam Kerja'}
                </span>
              </div>
              <div className="text-xs font-semibold text-text-muted">
                {formatWIBDate(liveTime, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
            <div className="h-9 w-[1px] bg-border-light" />
            <div className="text-2xl font-extrabold text-text-primary tabular-nums tracking-tight">
              {formatWIBTime(liveTime)}
              <span className="text-xs opacity-50 ml-1">WIB</span>
            </div>
          </div>
        </div>

        {/* ERP Quick Actions Toolbar */}
        <div className="mt-5 pt-4 border-t border-border-light flex items-center gap-2.5 flex-wrap">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider mr-1 hidden sm:inline-block">
            Modul ERP:
          </span>
          <button
            onClick={() => navigate('/attendance-logs')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200"
          >
            <FileText size={14} />
            <span>Log Kehadiran</span>
          </button>
          <button
            onClick={() => navigate('/attendance-recap')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
          >
            <TrendingUp size={14} />
            <span>Rekap & Payroll</span>
          </button>
          <button
            onClick={() => setKasbonOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors border border-amber-200"
          >
            <DollarSign size={14} />
            <span>Ajukan Kasbon</span>
          </button>
          <button
            onClick={() => setPermitModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors border border-purple-200"
          >
            <CalendarOff size={14} />
            <span>Izin / Sakit</span>
          </button>
          <button
            onClick={() => navigate('/slip-gaji')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-bg-secondary text-text-primary hover:bg-border-light transition-colors border border-border-light"
          >
            <Receipt size={14} />
            <span>Slip Gaji</span>
          </button>
          {!result && (
            <button
              onClick={() => {
                resetAll();
                const el = document.getElementById('group-attendance-form-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary-dark transition-all shadow-sm"
            >
              <PlusCircle size={14} />
              <span>Buat Sesi Absensi Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* ══════════════ 2. KPI METRICS BENTO GRID ══════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="p-4 rounded-xl bg-bg-white border border-border-light shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <PlayCircle size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider m-0">Sesi Hari Ini</p>
            <h3 className="text-xl font-extrabold text-text-primary m-0 mt-0.5">{todaySessions.length} Sesi</h3>
            <p className="text-[10px] text-emerald-600 font-semibold m-0 mt-0.5">
              {activeSessionsCount} Aktif • {closedSessionsCount} Ditutup
            </p>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="p-4 rounded-xl bg-bg-white border border-border-light shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-primary-bg text-primary flex items-center justify-center shrink-0 border border-primary/20">
            <Users size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider m-0">Pekerja Hadir</p>
            <h3 className="text-xl font-extrabold text-text-primary m-0 mt-0.5">{totalWorkersToday} Pekerja</h3>
            <p className="text-[10px] text-amber-600 font-semibold m-0 mt-0.5">
              {totalLateToday > 0 ? `${totalLateToday} terlambat hadir` : 'Semua hadir tepat waktu'}
            </p>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="p-4 rounded-xl bg-bg-white border border-border-light shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <ShieldCheck size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider m-0">Sesi Anda</p>
            <h3 className="text-xl font-extrabold text-text-primary m-0 mt-0.5">{mySessionsCount} Sesi</h3>
            <p className="text-[10px] text-text-muted font-medium m-0 mt-0.5">Dikelola oleh akun Anda</p>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="p-4 rounded-xl bg-bg-white border border-border-light shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
            <UserCheck size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider m-0">Absensi Anda</p>
            <h3 className="text-base font-extrabold text-text-primary m-0 mt-0.5 truncate flex items-center gap-1.5">
              <span>
                {selfRecord?.checkIn?.time
                  ? (selfRecord.checkOut?.time ? 'Selesai Check-Out' : 'Sedang Bertugas')
                  : (selfRecord?.status === 'Permit' ? 'Status Izin' : 'Belum Check-In')}
              </span>
              {(selfRecord?.isOffline || selfRecord?._id?.startsWith('offline_')) && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-700 border border-amber-500/30">Offline</span>
              )}
            </h3>
            <p className="text-[10px] text-purple-600 font-semibold m-0 mt-0.5">
              {getSelfDuration() ? `Durasi: ${getSelfDuration()}` : 'Mandiri Supervisor'}
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════ 3. MAIN WORKSPACE (2-COLUMN RESPONSIVE) ══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ─── LEFT COLUMN (8 cols): ACTIVE SESSIONS & GROUP ATTENDANCE FLOW ─── */}
        <div className="lg:col-span-8 space-y-6">

          {/* ── Sesi Aktif Hari Ini (All Supervisors Visible) ── */}
          {loadingTodaySessions && !result && (
            <div className="p-5 rounded-2xl bg-bg-white border border-border-light animate-pulse space-y-3">
              <div className="h-4 bg-border-light rounded w-48" />
              <div className="h-14 bg-border-light rounded-xl" />
              <div className="h-14 bg-border-light rounded-xl" />
            </div>
          )}

          {/* ── Warning Alert Banner: Unclosed Past Sessions ── */}
          {!result && unclosedSessions.length > 0 && sessionDateMode !== 'unclosed' && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-950 m-0 flex items-center gap-2">
                    <span>{unclosedSessions.length} Sesi Lampau Belum Ditutup</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white">
                      Perlu Tindakan
                    </span>
                  </h4>
                  <p className="text-xs text-amber-900/80 m-0 mt-0.5">
                    Ada pekerja pada sesi hari sebelumnya yang belum di-clockout. Segera selesaikan sesi tersebut.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSessionDateMode('unclosed')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-amber-950 bg-amber-200/90 hover:bg-amber-300 border border-amber-400/60 transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-xs"
              >
                <span>Tinjau & Clock-Out ({unclosedSessions.length})</span>
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {!loadingTodaySessions && !result && (
            <div className={`rounded-2xl border-2 p-5 shadow-sm transition-all ${
              sessionDateMode === 'unclosed'
                ? 'border-amber-300 bg-gradient-to-br from-amber-50/90 via-amber-50/40 to-bg-white'
                : 'border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-bg-white'
            }`}>
              {/* Header Title & Refresh */}
              <div className="flex items-center justify-between gap-3 mb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm ${
                    sessionDateMode === 'unclosed'
                      ? 'bg-amber-500 shadow-[0_2px_8px_rgba(245,158,11,0.3)]'
                      : 'bg-emerald-500 shadow-[0_2px_8px_rgba(5,150,105,0.3)]'
                  }`}>
                    {sessionDateMode === 'unclosed' ? <AlertTriangle size={20} /> : <PlayCircle size={20} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className={`text-base font-bold m-0 ${sessionDateMode === 'unclosed' ? 'text-amber-950' : 'text-emerald-950'}`}>
                        {sessionContainerTitle}
                      </h2>
                      {sessionDateMode === 'unclosed' ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-200 text-amber-950 border border-amber-300">
                          {unclosedSessions.length} Perlu Tindakan
                        </span>
                      ) : (
                        <>
                          <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-200 text-emerald-900">
                            {activeSessionsCount} Aktif
                          </span>
                          {closedSessionsCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800">
                              {closedSessionsCount} Ditutup
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <p className={`text-xs m-0 mt-0.5 ${sessionDateMode === 'unclosed' ? 'text-amber-800/80' : 'text-emerald-700/80'}`}>
                      {sessionContainerSubtitle}
                    </p>
                  </div>
                </div>
                <button
                  id="refresh-session-btn"
                  onClick={fetchTodaySessions}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    sessionDateMode === 'unclosed'
                      ? 'text-amber-800 bg-amber-100/80 hover:bg-amber-200/80'
                      : 'text-emerald-700 bg-emerald-100/60 hover:bg-emerald-200/70'
                  }`}
                  title="Refresh sesi"
                  aria-label="Refresh sesi"
                >
                  <RefreshCw size={16} className={loadingTodaySessions || loadingUnclosed ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* Date Navigation Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-emerald-100/60 rounded-xl mb-3.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSessionDateMode('today')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    sessionDateMode === 'today'
                      ? 'bg-bg-white text-emerald-950 shadow-sm'
                      : 'text-emerald-800/80 hover:text-emerald-950'
                  }`}
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => setSessionDateMode('yesterday')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    sessionDateMode === 'yesterday'
                      ? 'bg-bg-white text-emerald-950 shadow-sm'
                      : 'text-emerald-800/80 hover:text-emerald-950'
                  }`}
                >
                  Kemarin
                </button>
                <button
                  type="button"
                  onClick={() => setSessionDateMode('unclosed')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    sessionDateMode === 'unclosed'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : unclosedSessions.length > 0
                        ? 'bg-amber-200/70 text-amber-900 hover:bg-amber-200 font-extrabold'
                        : 'text-emerald-800/80 hover:text-emerald-950'
                  }`}
                >
                  <AlertTriangle size={13} className={sessionDateMode === 'unclosed' ? 'text-white' : 'text-amber-600'} />
                  <span>Belum Clock-Out</span>
                  {unclosedSessions.length > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      sessionDateMode === 'unclosed' ? 'bg-white text-amber-900' : 'bg-amber-500 text-white'
                    }`}>
                      {unclosedSessions.length}
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-1.5 sm:ml-auto">
                  <button
                    type="button"
                    onClick={() => setSessionDateMode('custom')}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      sessionDateMode === 'custom'
                        ? 'bg-bg-white text-emerald-950 shadow-sm'
                        : 'text-emerald-800/80 hover:text-emerald-950'
                    }`}
                  >
                    <Calendar size={13} />
                    <span>Pilih Tanggal</span>
                  </button>
                  {sessionDateMode === 'custom' && (
                    <input
                      type="date"
                      value={selectedCustomDate}
                      max={todayWIB()}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedCustomDate(e.target.value);
                          setSessionDateMode('custom');
                        }
                      }}
                      className="py-1 px-2 text-xs font-semibold rounded-lg border border-emerald-300 bg-bg-white text-text-primary focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-xs"
                    />
                  )}
                </div>
              </div>

              {/* Multi-Filter Bar: Supervisor & Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3.5">
                {/* Supervisor Filter */}
                <div className="flex gap-1.5 p-1 bg-emerald-200/50 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSessionFilter('all')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      sessionFilter === 'all'
                        ? 'bg-bg-white text-emerald-950 shadow-sm'
                        : 'text-emerald-800/80 hover:text-emerald-950'
                    }`}
                  >
                    Semua Supervisor ({todaySessions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSessionFilter('mine')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      sessionFilter === 'mine'
                        ? 'bg-bg-white text-emerald-950 shadow-sm'
                        : 'text-emerald-800/80 hover:text-emerald-950'
                    }`}
                  >
                    Sesi Saya ({mySessionsCount})
                  </button>
                </div>

                {/* Status Filter */}
                <div className="flex gap-1.5 p-1 bg-bg-secondary rounded-xl border border-border-light">
                  <button
                    type="button"
                    onClick={() => setSessionStatusFilter('all')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      sessionStatusFilter === 'all'
                        ? 'bg-bg-white text-text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    Semua ({todaySessions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSessionStatusFilter('active')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      sessionStatusFilter === 'active'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-emerald-700 hover:text-emerald-900'
                    }`}
                  >
                    🟢 Aktif ({activeSessionsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSessionStatusFilter('closed')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      sessionStatusFilter === 'closed'
                        ? 'bg-slate-700 text-white shadow-sm'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    ⚪ Ditutup ({closedSessionsCount})
                  </button>
                </div>
              </div>

              {/* List of sessions */}
              {displayedSessions.length === 0 ? (
                <div className="p-6 rounded-xl bg-bg-white border border-emerald-200 text-center text-xs text-text-muted space-y-1">
                  <p className="font-bold text-text-primary m-0">
                    {sessionDateMode === 'unclosed'
                      ? '🎉 Bagus! Tidak Ada Sesi Lampau yang Terbengkalai'
                      : sessionDateMode === 'today'
                        ? 'Belum Ada Sesi Grup Hari Ini'
                        : sessionDateMode === 'yesterday'
                          ? 'Tidak Ada Sesi Grup Kemarin'
                          : 'Tidak Ada Sesi pada Tanggal Ini'}
                  </p>
                  <p className="m-0 text-[11px]">
                    {sessionDateMode === 'unclosed'
                      ? 'Seluruh sesi absensi grup dari hari-hari sebelumnya telah selesai dan ditutup rapi.'
                      : sessionStatusFilter === 'active'
                        ? 'Tidak ada sesi yang sedang aktif. Semua sesi telah selesai / ditutup.'
                        : sessionStatusFilter === 'closed'
                          ? 'Belum ada sesi yang selesai / ditutup.'
                          : 'Tidak ada sesi yang sesuai dengan kriteria filter.'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
                  {displayedSessions.map((session) => {
                    const isMine = isMySession(session);
                    const { total: totalWorkers, left: leftWorkers, remaining: remainingWorkers, isClosed } = getSessionWorkerCounts(session);
                    const projectName = typeof session.projectId === 'string'
                      ? 'Proyek'
                      : session.projectId?.nama || 'Proyek';
                    const projectLocation = typeof session.projectId === 'object' ? session.projectId?.lokasi : '';
                    const supervisorName = typeof session.supervisorId === 'object'
                      ? session.supervisorId?.fullName
                      : 'Supervisor';
                    const isResumingThis = resumingSessionId === session._id;
                    const photoSrc = getImageUrl(session.photoUrl);
                    const sessDate = session.date || session.createdAt;
                    const sessDateObj = sessDate ? new Date(sessDate) : null;
                    const isPastDate = sessDateObj ? (new Date(sessDateObj).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) < todayWIB()) : false;

                    return (
                      <div
                        key={session._id}
                        className={`p-4 rounded-xl border transition-all ${
                          isClosed
                            ? 'bg-slate-50/70 border-slate-200/90 hover:border-slate-300 opacity-95'
                            : isPastDate
                              ? 'bg-amber-50/40 border-amber-300 shadow-sm ring-1 ring-amber-200 hover:border-amber-400'
                              : isMine
                                ? 'bg-bg-white border-emerald-300 shadow-sm ring-1 ring-emerald-200'
                                : 'bg-bg-white/95 border-emerald-200/80 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex items-start gap-3.5">
                          {/* Photo Thumbnail */}
                          {photoSrc ? (
                            <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-border-light bg-bg-secondary">
                              <PhotoView src={photoSrc}>
                                <img
                                  src={photoSrc}
                                  alt="Group attendance"
                                  className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                                />
                              </PhotoView>
                            </div>
                          ) : (
                            <div className={`w-16 h-16 rounded-xl flex items-center justify-center shrink-0 ${
                              isClosed
                                ? 'bg-slate-200 text-slate-600'
                                : isPastDate
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-emerald-100 text-emerald-600'
                            }`}>
                              <Camera size={22} />
                            </div>
                          )}

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h4 className="text-sm font-bold text-text-primary m-0 truncate">
                                {projectName}
                              </h4>

                              {/* Date Pill */}
                              {sessDateObj && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-bg-secondary text-text-primary border border-border-light flex items-center gap-1">
                                  <Calendar size={10} className="text-text-muted" />
                                  {formatWIBDate(sessDateObj)}
                                </span>
                              )}

                              {/* Status Badge */}
                              {(session.isOffline || session._id?.startsWith('offline_')) && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-700 border border-amber-500/30 flex items-center gap-1">
                                  Offline
                                </span>
                              )}
                              {isClosed ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-200/80 text-slate-700 border border-slate-300 flex items-center gap-1">
                                  <CheckCircle2 size={11} className="text-slate-600" />
                                  Selesai (Clock-out Semua)
                                </span>
                              ) : isPastDate ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white flex items-center gap-1 shadow-xs">
                                  <AlertTriangle size={11} />
                                  Belum Clock-Out (Sesi Lampau)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Sesi Aktif
                                </span>
                              )}

                              {isMine ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  ✓ Sesi Anda
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-bg-secondary text-text-muted">
                                  Oleh: {supervisorName}
                                </span>
                              )}
                            </div>

                            {projectLocation && (
                              <p className="text-xs text-text-muted m-0 truncate mb-2">
                                📍 {projectLocation}
                              </p>
                            )}

                            <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
                              {isClosed ? (
                                <span className="flex items-center gap-1 font-bold text-slate-700">
                                  <Users size={13} className="text-slate-500" />
                                  {totalWorkers} pekerja • Selesai Clock-Out
                                </span>
                              ) : (
                                <span className={`flex items-center gap-1 font-bold ${isPastDate ? 'text-amber-800' : 'text-emerald-800'}`}>
                                  <Users size={13} className={isPastDate ? 'text-amber-600' : 'text-emerald-600'} />
                                  {remainingWorkers} dari {totalWorkers} belum clock-out {leftWorkers > 0 && `(${leftWorkers} pulang)`}
                                </span>
                              )}

                              <span className="w-1 h-1 rounded-full bg-border" />
                              <span className="flex items-center gap-1 font-medium">
                                <Clock size={13} className="text-text-muted" />
                                Mulai: {formatWIBTime(new Date(session.createdAt || session.date))} WIB
                              </span>

                              {isClosed && session.closedAt && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-border" />
                                  <span className="text-[11px] text-slate-500 font-medium">
                                    Ditutup: {formatWIBTime(new Date(session.closedAt))} WIB
                                  </span>
                                </>
                              )}
                            </div>

                            {session.notes && (
                              <p className="text-[11px] text-text-muted/80 italic m-0 mt-1 truncate">
                                "{session.notes}"
                              </p>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="shrink-0 self-center flex items-center gap-2">
                            {isClosed ? (
                              <button
                                onClick={() => handleResumeSession(session)}
                                disabled={resumingSessionId !== null}
                                className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                              >
                                {isResumingThis ? (
                                  <>
                                    <Loader size={14} className="animate-spin" />
                                    <span>Memuat...</span>
                                  </>
                                ) : (
                                  <>
                                    <FileText size={14} className="text-slate-600" />
                                    <span>Detail Sesi</span>
                                    <ChevronRight size={14} />
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleResumeSession(session)}
                                disabled={resumingSessionId !== null}
                                className={`flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-bold text-white transition-all ${
                                  isResumingThis
                                    ? isPastDate ? 'bg-amber-400 cursor-not-allowed' : 'bg-emerald-400 cursor-not-allowed'
                                    : isPastDate
                                      ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 shadow-sm cursor-pointer'
                                      : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 shadow-sm cursor-pointer'
                                }`}
                              >
                                {isResumingThis ? (
                                  <>
                                    <Loader size={14} className="animate-spin" />
                                    <span>Memuat...</span>
                                  </>
                                ) : (
                                  <>
                                    {isPastDate ? <LogOut size={14} /> : <PlayCircle size={14} />}
                                    <span>{isPastDate ? 'Selesaikan Clock-out' : 'Lanjutkan Sesi'}</span>
                                    <ChevronRight size={14} />
                                  </>
                                )}
                              </button>
                            )}

                            {/* Eliminate / Delete Duplicate Session Button */}
                            {canDeleteSession(session) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSessionToDelete(session);
                                }}
                                title="Eliminasi / Hapus Sesi (Jika Clock-In Ganda)"
                                className="p-2.5 rounded-xl text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all cursor-pointer shadow-xs active:scale-95 flex items-center justify-center min-h-[40px] min-w-[40px]"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════ POST-SUBMIT: RESULTS & ACTIVE SESSION MANAGER ══════════════ */}
          {result && (
            <div className="space-y-6">
              {/* Header Bar */}
              <div className={`flex items-center justify-between gap-3 p-4 rounded-2xl bg-bg-white border shadow-sm ${
                isCurrentSessionClosed ? 'border-slate-300 ring-1 ring-slate-200' : isCurrentSessionPast ? 'border-amber-300 ring-1 ring-amber-200' : 'border-emerald-300'
              }`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm text-white ${
                    isCurrentSessionClosed ? 'bg-slate-700' : isCurrentSessionPast ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}>
                    {isCurrentSessionClosed ? <CheckCircle2 size={22} /> : isCurrentSessionPast ? <AlertTriangle size={20} /> : <PlayCircle size={20} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {(currentActiveSession?.isOffline || currentActiveSession?._id?.startsWith('offline_')) && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-700 border border-amber-500/30 flex items-center gap-1">
                          Offline
                        </span>
                      )}
                      <p className={`text-[10px] font-black uppercase tracking-wider m-0 px-2 py-0.5 rounded-full ${
                        isCurrentSessionClosed ? 'bg-slate-100 text-slate-800 border border-slate-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {isCurrentSessionClosed ? '⚪ Sesi Telah Ditutup (Selesai)' : '🟢 Sesi Sedang Dibuka (Aktif)'}
                      </p>
                      {currentActiveSession?.date && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-bg-secondary text-text-primary border border-border-light flex items-center gap-1">
                          <Calendar size={11} className="text-text-muted" />
                          {formatWIBDate(new Date(currentActiveSession.date))}
                        </span>
                      )}
                      {!isCurrentSessionClosed && isCurrentSessionPast && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white flex items-center gap-1 animate-pulse">
                          <AlertTriangle size={11} /> Sesi Lampau Belum Ditutup
                        </span>
                      )}
                      {isCurrentSessionClosed && currentActiveSession?.closedAt && (
                        <span className="text-[11px] text-text-muted font-medium">
                          Ditutup: {formatWIBTime(new Date(currentActiveSession.closedAt))} WIB
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-extrabold text-text-primary m-0 truncate">
                      {selectedProject?.nama || (typeof currentActiveSession?.projectId === 'object' ? currentActiveSession.projectId?.nama : 'Proyek')}
                    </h3>
                    <p className="text-xs text-text-muted m-0 truncate">
                      Supervisor: {typeof currentActiveSession?.supervisorId === 'object' ? currentActiveSession.supervisorId.fullName : user?.fullName}
                      {!isCurrentSessionClosed && (
                        <span className="text-emerald-700 font-bold ml-2">
                          • {workersStillPresent.length} pekerja belum clock-out
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {canDeleteSession(currentActiveSession || (result as any)?.session) && (
                    <button
                      type="button"
                      onClick={() => setSessionToDelete(currentActiveSession || (result as any)?.session)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 min-h-[40px]"
                      title="Eliminasi / batalkan sesi ini jika terjadi clock-in ganda"
                    >
                      <Trash2 size={14} />
                      <span>Hapus Sesi</span>
                    </button>
                  )}

                  <button
                    id="back-to-sessions-btn"
                    onClick={handleBackToSessions}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-text-primary bg-bg-secondary hover:bg-border-light border border-border-light transition-all flex items-center gap-1.5 cursor-pointer shadow-sm min-h-[40px]"
                    title="Kembali ke daftar sesi hari ini"
                  >
                    <ChevronLeft size={14} />
                    <span>Daftar Sesi ({todaySessions.length})</span>
                  </button>
                </div>
              </div>

              {/* Status & Summary Card */}
              {isCurrentSessionClosed ? (
                <Card className="text-center p-8 bg-gradient-to-br from-slate-50 via-bg-white to-slate-50/50 border-2 border-slate-300">
                  <div className="w-16 h-16 bg-gradient-to-br from-slate-700 to-slate-600 rounded-2xl flex items-center justify-center mx-auto mb-3.5 text-white shadow-[0_4px_20px_rgba(71,85,105,0.25)]">
                    <CheckCircle2 size={32} />
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-200 text-slate-800 border border-slate-300 inline-block mb-2">
                    SESI SELESAI / INAKTIF
                  </span>
                  <h3 className="text-xl font-extrabold text-text-primary m-0 mb-1">
                    Seluruh Pekerja Telah Clock-Out
                  </h3>
                  <p className="text-sm text-text-muted m-0 max-w-lg mx-auto">
                    Sesi grup ini telah resmi ditutup karena seluruh <span className="font-bold text-text-primary">{sessionAllWorkers.length} pekerja</span> telah tercatat jam pulang. Data sesi ini tersimpan dan bersifat read-only.
                  </p>

                  <div className="flex items-center justify-center gap-4 mt-4 text-xs text-text-muted flex-wrap">
                    <span className="px-3 py-1.5 bg-bg-white rounded-xl border border-border-light font-bold text-text-primary">
                      👥 Total: {sessionAllWorkers.length} Pekerja
                    </span>
                    <span className="px-3 py-1.5 bg-bg-white rounded-xl border border-border-light font-bold text-slate-700">
                      ✓ Clock-Out: {workersAlreadyLeft.length} Pekerja
                    </span>
                    {currentActiveSession?.closedAt && (
                      <span className="px-3 py-1.5 bg-bg-white rounded-xl border border-border-light font-semibold text-text-muted">
                        🕒 Ditutup: {formatWIBTime(new Date(currentActiveSession.closedAt))} WIB
                      </span>
                    )}
                  </div>
                </Card>
              ) : (
                <Card className="text-center p-8 bg-gradient-to-br from-emerald-50/60 via-bg-white to-emerald-50/30 border-2 border-emerald-300">
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-3.5 text-white shadow-[0_4px_20px_rgba(5,150,105,0.3)]">
                    <Check size={32} />
                  </div>
                  <h3 className="text-xl font-extrabold text-text-primary m-0 mb-1">Sesi Absensi Berjalan (Aktif)</h3>
                  <p className="text-sm text-text-muted m-0">
                    <span className="font-black text-emerald-600 text-lg">{workersStillPresent.length}</span> pekerja masih berada di lokasi • <span className="font-bold text-text-muted">{workersAlreadyLeft.length}</span> telah tercatat pulang
                  </p>

                  {result.conflicts && result.conflicts.length > 0 && (
                    <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-left max-w-md mx-auto">
                      <p className="text-xs font-bold text-amber-800 mb-1.5 flex items-center gap-1.5">
                        <AlertCircle size={14} />
                        {result.conflicts.length} pekerja dilewati (sudah absen mandiri):
                      </p>
                      {result.conflicts.map((c) => (
                        <p key={c.workerId} className="text-xs text-amber-700 m-0 pl-4">• {c.fullName}</p>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* ══════════════ IF CLOSED: REKAP TABEL READ-ONLY ══════════════ */}
              {isCurrentSessionClosed ? (
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-300">
                        <FileText size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-text-primary m-0">Rekap Jam Pulang Seluruh Pekerja</h3>
                        <p className="text-xs text-text-muted m-0">Daftar kehadiran dan kepulangan pekerja pada sesi ini</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      {sessionAllWorkers.length} Pekerja Selesai
                    </span>
                  </div>

                  {/* Rekap Table */}
                  <div className="overflow-x-auto rounded-xl border border-border-light">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-bg-secondary text-text-muted uppercase text-[10px] font-bold border-b border-border-light">
                        <tr>
                          <th className="py-3 px-3.5 w-12 text-center">No</th>
                          <th className="py-3 px-3.5">Nama Pekerja</th>
                          <th className="py-3 px-3.5">Jabatan / Role</th>
                          <th className="py-3 px-3.5 text-center">Status Masuk</th>
                          <th className="py-3 px-3.5 text-center">Jam Pulang</th>
                          <th className="py-3 px-3.5">Keterangan / Alasan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-light bg-bg-white">
                        {sessionAllWorkers.map((worker, idx) => (
                          <tr key={worker._id} className="hover:bg-bg-secondary/40 transition-colors">
                            <td className="py-3 px-3.5 text-center font-bold text-text-muted">{idx + 1}</td>
                            <td className="py-3 px-3.5 font-bold text-text-primary">
                              {worker.fullName}
                            </td>
                            <td className="py-3 px-3.5 text-text-muted">
                              {worker.role || 'Pekerja Lapangan'}
                            </td>
                            <td className="py-3 px-3.5 text-center">
                              {worker.isLate ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  Menyusul
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  Hadir Awal
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3.5 text-center font-bold text-slate-800">
                              {worker.leaveHour ? `${worker.leaveHour} WIB` : '—'}
                            </td>
                            <td className="py-3 px-3.5 text-text-muted italic">
                              {worker.leaveReason || 'Shift selesai'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Actions for closed session */}
                  <div className="flex gap-3 mt-6">
                    <Button
                      title="Kembali ke Daftar Sesi"
                      onClick={handleBackToSessions}
                      icon={ChevronLeft}
                      variant="outline"
                      className="flex-1"
                    />
                    <Button
                      title="Buat Sesi Absensi Baru"
                      onClick={resetAll}
                      icon={Camera}
                      variant="primary"
                      className="flex-1"
                    />
                    <Button
                      title="Lihat Log Kehadiran"
                      onClick={() => navigate('/attendance-logs')}
                      icon={FileText}
                      variant="outline"
                      className="flex-1"
                    />
                  </div>
                </Card>
              ) : (
                /* ══════════════ IF ACTIVE: LIVE CLOCK-OUT & MANAGEMENT ══════════════ */
                <>
                  {/* Notice for Past Session Clock-out */}
                  {!isCurrentSessionClosed && isCurrentSessionPast && (
                    <div className="p-4 rounded-xl bg-amber-500/15 border-2 border-amber-400 text-amber-950 flex items-start gap-3">
                      <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <p className="font-bold m-0 mb-0.5">Sesi Absensi Tanggal Lampau ({currentActiveSession?.date ? formatWIBDate(new Date(currentActiveSession.date)) : ''})</p>
                        <p className="m-0 text-amber-900/90">
                          Sesi ini belum ditutup pada tanggal tersebut. Anda dapat mencatat jam pulang pekerja yang terlupa atau langsung klik <strong>"Clock-Out Semua & Tutup Sesi"</strong>. Jam pulang default otomatis diset ke <strong>17:00 WIB</strong> (jam akhir shift kerja standar).
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 1-Click Action: Bulk Clock-Out & Close Session */}
                  <div className={`p-5 rounded-2xl border-2 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isCurrentSessionPast
                      ? 'bg-gradient-to-r from-amber-100/90 via-amber-50 to-bg-white border-amber-300'
                      : 'bg-gradient-to-r from-amber-50 via-emerald-50 to-bg-white border-emerald-300'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm ${
                        isCurrentSessionPast ? 'bg-amber-600' : 'bg-emerald-600'
                      }`}>
                        <LogOut size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-text-primary m-0 flex items-center gap-2">
                          <span>Clock-Out Seluruh Pekerja & Tutup Sesi</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isCurrentSessionPast ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
                          }`}>
                            1-Klik
                          </span>
                        </h4>
                        <p className="text-xs text-text-muted m-0 mt-0.5">
                          Tandai jam pulang untuk seluruh {workersStillPresent.length} pekerja tersisa dan ubah status sesi menjadi inaktif/ditutup.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (isCurrentSessionPast) {
                          setCloseLeaveHour('17:00');
                          setCloseReason('Clock-out susulan sesi lampau oleh supervisor');
                        } else {
                          setCloseLeaveHour(formatWIBTime(new Date()));
                          setCloseReason('');
                        }
                        setShowCloseModal(true);
                      }}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm cursor-pointer whitespace-nowrap transition-all flex items-center justify-center gap-2 shrink-0 ${
                        isCurrentSessionPast
                          ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600'
                          : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600'
                      }`}
                    >
                      <LogOut size={14} />
                      <span>Clock-Out Semua ({workersStillPresent.length}) & Tutup Sesi</span>
                    </button>
                  </div>

                  {/* Late Add Section */}
                  {untaggedWorkers.length > 0 && (
                    <Card className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-amber-500 to-amber-400">
                          <UserPlus size={20} />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-text-primary m-0">Tambah Pekerja Terlambat</h3>
                          <p className="text-xs text-text-muted m-0">Catat pekerja yang datang menyusul setelah foto grup diambil</p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <select
                          id="late-add-select"
                          value={lateWorkerId}
                          onChange={(e) => setLateWorkerId(e.target.value)}
                          className="flex-1 p-3 rounded-xl border border-border-light bg-bg-white text-sm font-medium text-text-primary focus:outline-none focus:border-primary transition-colors"
                        >
                          <option value="">— Pilih Pekerja yang Baru Tiba —</option>
                          {untaggedWorkers.map(w => (
                            <option key={w._id} value={w._id}>
                              {w.fullName} ({w.position || w.role})
                            </option>
                          ))}
                        </select>
                        <button
                          id="late-add-btn"
                          onClick={handleLateAdd}
                          disabled={!lateWorkerId || addingLate}
                          className={`px-5 py-3 rounded-xl border-none text-sm font-bold text-white bg-gradient-to-br from-amber-500 to-amber-400 transition-all cursor-pointer ${
                            !lateWorkerId || addingLate ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-[1px]'
                          }`}
                        >
                          {addingLate ? <Loader size={18} className="animate-spin" /> : <span>Tambah</span>}
                        </button>
                      </div>
                    </Card>
                  )}

                  {/* Leave Hour Section (Individual & Bulk) */}
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-red-500 to-red-400">
                          <LogOut size={20} />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-text-primary m-0">Catat Jam Pulang / Pulang Awal</h3>
                          <p className="text-xs text-text-muted m-0">Catat jam kepulangan untuk pekerja tertentu atau sebagian pekerja</p>
                        </div>
                      </div>

                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        {workersStillPresent.length} Pekerja Belum Pulang
                      </span>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex gap-2 p-1 bg-bg-secondary rounded-xl mb-4">
                      <button
                        id="leave-mode-individual"
                        onClick={() => setLeaveMode('individual')}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          leaveMode === 'individual'
                            ? 'bg-bg-white text-text-primary shadow-sm'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        Individual ({workersStillPresent.length})
                      </button>
                      <button
                        id="leave-mode-bulk"
                        onClick={() => setLeaveMode('bulk')}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          leaveMode === 'bulk'
                            ? 'bg-bg-white text-text-primary shadow-sm'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        Grup / Bulk ({workersStillPresent.length})
                      </button>
                    </div>

                    {workersStillPresent.length === 0 ? (
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center text-xs font-bold text-emerald-800">
                        ✓ Seluruh pekerja telah mencatat jam pulang. Sesi ini siap untuk ditutup.
                      </div>
                    ) : leaveMode === 'individual' ? (
                      <div className="space-y-3">
                        <select
                          id="leave-worker-select"
                          value={leaveWorkerId}
                          onChange={(e) => setLeaveWorkerId(e.target.value)}
                          className="w-full p-3 rounded-xl border border-border-light bg-bg-white text-sm font-medium text-text-primary focus:outline-none focus:border-primary transition-colors"
                        >
                          <option value="">— Pilih Pekerja yang Pulang —</option>
                          {workersStillPresent.map(w => (
                            <option key={w._id} value={w._id}>
                              {w.fullName} {w.isLate ? '(Menyusul)' : ''}
                            </option>
                          ))}
                        </select>
                        <div>
                          <label htmlFor="leave-hour-input" className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
                            Jam Pulang (Format HH:mm)
                          </label>
                          <input
                            id="leave-hour-input"
                            type="time"
                            value={leaveHour}
                            onChange={(e) => setLeaveHour(e.target.value)}
                            className="w-full p-3 rounded-xl border border-border-light bg-bg-white text-sm font-medium text-text-primary focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>
                        <div>
                          <label htmlFor="leave-reason-input" className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
                            Alasan Pulang (Opsional)
                          </label>
                          <input
                            id="leave-reason-input"
                            type="text"
                            value={leaveReason}
                            onChange={(e) => setLeaveReason(e.target.value)}
                            placeholder="Contoh: Selesai shift, izin keluarga, sakit..."
                            className="w-full p-3 rounded-xl border border-border-light bg-bg-white text-sm font-medium text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-text-muted uppercase tracking-wider m-0">
                            Pilih pekerja yang pulang ({bulkLeaveWorkerIds.size} dipilih):
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={selectAllRemainingWorkers}
                              className="text-xs font-bold text-primary hover:underline cursor-pointer"
                            >
                              Pilih Semua ({workersStillPresent.length})
                            </button>
                            <span className="text-border-light">•</span>
                            <button
                              type="button"
                              onClick={clearBulkLeaveWorkers}
                              className="text-xs font-semibold text-text-muted hover:underline cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        </div>

                        <div
                          id="bulk-leave-worker-list"
                          className="flex flex-col gap-[2px] max-h-[220px] overflow-y-auto rounded-xl border border-border-light"
                        >
                          {workersStillPresent.map(w => {
                            const checked = bulkLeaveWorkerIds.has(w._id);
                            return (
                              <button
                                key={w._id}
                                id={`bulk-leave-worker-${w._id}`}
                                onClick={() => toggleBulkLeaveWorker(w._id)}
                                className={`flex items-center gap-3 p-3 text-left transition-all min-h-[48px] border-b border-border-light last:border-0 cursor-pointer ${
                                  checked ? 'bg-red-50' : 'bg-bg-white hover:bg-bg-secondary'
                                }`}
                              >
                                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all ${
                                  checked ? 'bg-red-500 text-white' : 'border-2 border-border bg-bg-white'
                                }`}>
                                  {checked && <Check size={12} />}
                                </div>
                                <span className="text-sm font-medium text-text-primary">{w.fullName}</span>
                                {w.isLate && (
                                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
                                    Menyusul
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <div>
                          <label htmlFor="bulk-leave-hour-input" className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
                            Jam Pulang (untuk semua yang dipilih)
                          </label>
                          <input
                            id="bulk-leave-hour-input"
                            type="time"
                            value={bulkLeaveHour}
                            onChange={(e) => setBulkLeaveHour(e.target.value)}
                            className="w-full p-3 rounded-xl border border-border-light bg-bg-white text-sm font-medium text-text-primary focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>
                        <div>
                          <label htmlFor="bulk-leave-reason-input" className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
                            Alasan Pulang Bersama (Opsional)
                          </label>
                          <input
                            id="bulk-leave-reason-input"
                            type="text"
                            value={bulkLeaveReason}
                            onChange={(e) => setBulkLeaveReason(e.target.value)}
                            placeholder="Contoh: Selesai shift, hujan deras..."
                            className="w-full p-3 rounded-xl border border-border-light bg-bg-white text-sm font-medium text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>
                      </div>
                    )}

                    {workersStillPresent.length > 0 && (
                      <Button
                        title={recordingLeave ? 'Menyimpan...' : 'Simpan Jam Pulang'}
                        onClick={handleLeaveHour}
                        loading={recordingLeave}
                        icon={LogOut}
                        fullWidth
                        variant="danger"
                        className="mt-4"
                      />
                    )}
                  </Card>

                  {/* Summary of workers who already left in this session */}
                  {workersAlreadyLeft.length > 0 && (
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-3.5">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={18} className="text-emerald-600" />
                          <h4 className="text-sm font-bold text-text-primary m-0">
                            Pekerja yang Sudah Clock-Out ({workersAlreadyLeft.length})
                          </h4>
                        </div>
                        <span className="text-xs text-text-muted font-medium">Tercatat di sistem</span>
                      </div>

                      <div className="divide-y divide-border-light rounded-xl border border-border-light max-h-[180px] overflow-y-auto">
                        {workersAlreadyLeft.map((w) => (
                          <div key={w._id} className="p-2.5 flex items-center justify-between text-xs bg-bg-white">
                            <div>
                              <span className="font-bold text-text-primary">{w.fullName}</span>
                              {w.leaveReason && (
                                <span className="text-text-muted italic ml-2">({w.leaveReason})</span>
                              )}
                            </div>
                            <span className="font-bold text-slate-700 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                              {w.leaveHour} WIB
                            </span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Bottom navigation buttons */}
                  <div className="flex gap-3">
                    <Button
                      title="Kembali ke Daftar Sesi"
                      onClick={handleBackToSessions}
                      icon={ChevronLeft}
                      variant="outline"
                      className="flex-1"
                    />
                    <Button
                      title="Buat Sesi Absensi Baru"
                      onClick={resetAll}
                      icon={Camera}
                      variant="primary"
                      className="flex-1"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════ 4. CREATE NEW GROUP ATTENDANCE STEPPER ══════════════ */}
          {!result && (
            <div id="group-attendance-form-section" className="space-y-5">
              {/* Stepper Header */}
              <div className="p-5 rounded-2xl bg-bg-white border border-border-light shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-text-primary m-0 flex items-center gap-2">
                    <Camera size={18} className="text-primary" />
                    <span>Form Buat Absensi Foto Grup Baru</span>
                  </h3>
                  <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                    Langkah {step} dari 3
                  </span>
                </div>

                <div className="flex items-center gap-0 px-2">
                  {[
                    { num: 1, label: 'Proyek & Foto' },
                    { num: 2, label: 'Tag Pekerja' },
                    { num: 3, label: 'Review & Kirim' },
                  ].map((s) => (
                    <div key={s.num} className="flex items-center flex-1 last:flex-none">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all ${
                          step > s.num
                            ? 'bg-emerald-500 text-white'
                            : step === s.num
                              ? 'bg-primary text-white shadow-sm ring-4 ring-primary/20'
                              : 'bg-bg-secondary text-text-muted border border-border-light'
                        }`}>
                          {step > s.num ? <Check size={14} /> : s.num}
                        </div>
                        <span className={`text-xs font-bold hidden sm:inline-block ${
                          step === s.num ? 'text-text-primary' : 'text-text-muted'
                        }`}>
                          {s.label}
                        </span>
                      </div>
                      {s.num < 3 && (
                        <div className={`flex-1 h-[2px] mx-3 rounded transition-colors ${
                          step > s.num ? 'bg-emerald-500' : 'bg-border-light'
                        }`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* STEP 1: Project + Photo */}
              {step === 1 && (
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 bg-primary shadow-sm">
                      <Building size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-text-primary m-0">1. Pilih Lokasi Proyek & Foto Grup</h3>
                      <p className="text-xs text-text-muted m-0">Tentukan proyek, lalu ambil foto grup pekerja lapangan</p>
                    </div>
                  </div>

                  {/* Project Selector */}
                  <span className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 block">
                    Pilih Proyek Aktif
                  </span>
                  {loadingProjects ? (
                    <div className="p-8 text-center text-text-muted">
                      <Loader size={24} className="animate-spin mx-auto mb-2" />
                      <p className="text-sm">Memuat daftar proyek aktif...</p>
                    </div>
                  ) : projects.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 max-h-[260px] overflow-y-auto pr-1">
                      {projects.map((p) => (
                        <button
                          key={p._id}
                          id={`project-${p._id}`}
                          onClick={() => setSelectedProjectId(p._id)}
                          className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                            selectedProjectId === p._id
                              ? 'border-primary bg-primary-bg shadow-sm'
                              : 'border-border-light bg-bg-white hover:border-primary/50'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            selectedProjectId === p._id ? 'bg-primary text-white' : 'bg-bg-secondary text-text-muted'
                          }`}>
                            <Building size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className={`text-sm font-bold m-0 truncate ${selectedProjectId === p._id ? 'text-primary' : 'text-text-primary'}`}>
                              {p.nama}
                            </h4>
                            {p.lokasi && <p className="text-xs text-text-muted m-0 truncate mt-0.5">{p.lokasi}</p>}
                          </div>
                          {selectedProjectId === p._id && (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white shrink-0">
                              <Check size={12} />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center border-2 border-dashed border-border-light rounded-xl text-text-muted mb-4">
                      <Building size={24} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium">Tidak ada proyek aktif</p>
                    </div>
                  )}

                  {/* Worker Preview Accordion in Step 1 */}
                  {selectedProjectId && (
                    <div className="mb-5 p-3.5 rounded-xl border border-border-light bg-bg-secondary/60">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Users size={16} className="text-primary shrink-0" />
                          <span className="text-xs font-bold text-text-primary">
                            Daftar Pekerja Terdaftar: {loadingWorkers ? 'Memuat...' : `${workers.length} Pekerja`}
                          </span>
                        </div>
                        <button
                          type="button"
                          id="preview-workers-toggle-btn"
                          onClick={() => setShowProjectWorkersPreview(prev => !prev)}
                          className="text-xs font-bold text-primary hover:text-primary-dark transition-colors cursor-pointer"
                        >
                          {showProjectWorkersPreview ? 'Tutup Daftar' : 'Cek / Lihat Daftar Nama'}
                        </button>
                      </div>

                      {showProjectWorkersPreview && (
                        <div className="mt-3 pt-3 border-t border-border-light/80 space-y-2 animate-fade-in">
                          {loadingWorkers ? (
                            <div className="p-3 text-center text-text-muted text-xs flex items-center justify-center gap-2">
                              <Loader size={14} className="animate-spin" />
                              <span>Memuat pekerja...</span>
                            </div>
                          ) : workers.length === 0 ? (
                            <div className="p-3 text-center text-xs text-text-muted">
                              <p className="m-0">Belum ada pekerja terdaftar untuk proyek ini.</p>
                              <button
                                type="button"
                                onClick={() => setShowAddWorkerModal(true)}
                                className="mt-2 text-xs font-bold text-primary underline cursor-pointer"
                              >
                                + Tambah Nama Pekerja (Offline)
                              </button>
                            </div>
                          ) : (
                            <div className="max-h-[190px] overflow-y-auto space-y-1.5 pr-1">
                              {workers.map((w, idx) => (
                                <div
                                  key={w._id}
                                  className="flex items-center justify-between p-2 rounded-lg bg-bg-white border border-border-light text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-text-muted text-[11px] w-5 text-right font-mono">{idx + 1}.</span>
                                    <span className="font-semibold text-text-primary truncate">{w.fullName}</span>
                                  </div>
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-bg-secondary text-text-muted font-medium capitalize shrink-0">
                                    {w.position || w.role}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Photo Capture */}
                  <span className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 block">
                    Foto Grup Tim Lapangan
                  </span>
                  {photoPreview ? (
                    <div className="relative rounded-2xl overflow-hidden mb-5 border border-border-light bg-bg-secondary">
                      <img src={photoPreview} alt="Group preview" className="w-full max-h-[300px] object-cover" />
                      <button
                        id="remove-photo-btn"
                        onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90 transition-colors"
                        aria-label="Hapus foto"
                      >
                        <X size={16} />
                      </button>
                      {photo && (
                        <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/70 text-white text-[11px] font-semibold rounded-lg">
                          Ukuran: {(photo.size / 1024).toFixed(0)} KB (Telah Dikompres)
                        </div>
                      )}
                    </div>
                  ) : (
                    <label
                      id="photo-capture-label"
                      className={`flex flex-col items-center justify-center gap-3 w-full h-[190px] border-2 border-dashed rounded-2xl cursor-pointer transition-all mb-5 ${
                        compressing
                          ? 'border-primary bg-primary-bg'
                          : 'border-border-light hover:border-primary hover:bg-primary-bg/50 bg-bg-secondary/40'
                      }`}
                    >
                      {compressing ? (
                        <>
                          <Loader size={32} className="animate-spin text-primary" />
                          <span className="text-sm text-primary font-semibold">Mengompresi foto server-side...</span>
                        </>
                      ) : (
                        <>
                          <div className="w-14 h-14 rounded-2xl bg-primary-bg text-primary flex items-center justify-center shadow-sm">
                            <Camera size={26} />
                          </div>
                          <div className="text-center">
                            <span className="text-sm font-bold text-text-primary block">Ambil / Unggah Foto Grup</span>
                            <span className="text-xs text-text-muted">Kamera belakang terbuka otomatis di ponsel</span>
                          </div>
                        </>
                      )}
                      <input
                        id="group-photo-input"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoCapture}
                        className="hidden"
                        disabled={compressing}
                      />
                    </label>
                  )}

                  <div className="flex gap-2.5">
                    <button
                      id="step1-check-workers-btn"
                      type="button"
                      onClick={() => setStep(2)}
                      disabled={!selectedProjectId}
                      className={`flex-1 flex items-center justify-center gap-1.5 p-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                        !selectedProjectId
                          ? 'border-border-light text-text-muted/50 cursor-not-allowed bg-bg-secondary/40'
                          : 'border-primary/40 text-primary bg-primary/5 hover:bg-primary/10'
                      }`}
                      title="Lihat atau periksa daftar nama pekerja proyek"
                    >
                      <Users size={15} />
                      <span>Cek Pekerja ({workers.length})</span>
                    </button>

                    <button
                      id="step1-next-btn"
                      className={`flex-[2] flex items-center justify-center gap-2 p-3.5 rounded-xl text-sm font-bold text-white bg-primary transition-all cursor-pointer ${
                        !selectedProjectId || !photo
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-primary-dark shadow-sm'
                      }`}
                      onClick={() => setStep(2)}
                      disabled={!selectedProjectId || !photo}
                    >
                      <span>Lanjut ke Pilih Pekerja</span>
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </Card>
              )}

              {/* STEP 2: Tag Workers */}
              {step === 2 && (
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 bg-emerald-500 shadow-sm">
                      <Users size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <h3 className="text-base font-bold text-text-primary m-0">2. Pilih Pekerja yang Hadir</h3>
                        {!navigator.onLine && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-800 border border-amber-500/30">
                            Offline Sync
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted m-0 truncate">
                        {selectedProject?.nama || 'Proyek'} • {workers.length} Pekerja Tersinkronisasi
                      </p>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl text-xs font-black bg-primary-bg text-primary shrink-0">
                      {selectedWorkerIds.size} / {workers.length} Terpilih
                    </div>
                  </div>

                  {/* Search */}
                  <div className="relative mb-3">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input
                      id="worker-search-input"
                      type="text"
                      placeholder="Cari nama pekerja atau jabatan..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border-light bg-bg-white text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  {/* Toggle All & Quick Add Worker */}
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <button
                      id="toggle-all-workers-btn"
                      onClick={toggleAll}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-secondary text-xs font-bold text-text-muted hover:bg-primary-bg hover:text-primary transition-colors cursor-pointer"
                    >
                      {selectedWorkerIds.size === filteredWorkers.length && filteredWorkers.length > 0 ? (
                        <CheckSquare size={16} className="text-primary" />
                      ) : (
                        <Square size={16} />
                      )}
                      <span>
                        {selectedWorkerIds.size === filteredWorkers.length && filteredWorkers.length > 0
                          ? 'Batal Pilih Semua'
                          : `Pilih Semua (${filteredWorkers.length} pekerja)`}
                      </span>
                    </button>

                    <button
                      type="button"
                      id="quick-add-worker-btn"
                      onClick={() => setShowAddWorkerModal(true)}
                      className="px-3 py-2 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserPlus size={14} />
                      <span>+ Tambah Pekerja</span>
                    </button>
                  </div>

                  {/* Worker List */}
                  {loadingWorkers ? (
                    <div className="p-8 text-center text-text-muted">
                      <Loader size={24} className="animate-spin mx-auto mb-2" />
                      <p className="text-sm">Memuat daftar pekerja proyek...</p>
                    </div>
                  ) : workers.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-border-light rounded-xl text-text-muted space-y-3">
                      <Users size={28} className="mx-auto text-text-muted/60" />
                      <div>
                        <p className="text-sm font-bold text-text-primary m-0">Belum ada pekerja di proyek ini</p>
                        <p className="text-xs text-text-muted m-0 mt-1">
                          Dalam mode offline, Anda dapat menambahkan nama pekerja secara langsung di lapangan.
                        </p>
                      </div>
                      <button
                        type="button"
                        id="add-worker-offline-btn"
                        onClick={() => setShowAddWorkerModal(true)}
                        className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-sm hover:bg-primary-dark transition-all inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <UserPlus size={15} />
                        <span>+ Tambah Nama Pekerja (Offline)</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      id="worker-list"
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1"
                    >
                      {filteredWorkers.map((w) => {
                        const isSelected = selectedWorkerIds.has(w._id);
                        return (
                          <button
                            key={w._id}
                            id={`worker-row-${w._id}`}
                            onClick={() => toggleWorker(w._id)}
                            className={`flex items-center gap-3 p-3 text-left transition-all rounded-xl border cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-50 border-emerald-300 shadow-sm'
                                : 'bg-bg-white border-border-light hover:bg-bg-secondary'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all ${
                              isSelected
                                ? 'bg-emerald-500 text-white'
                                : 'border border-border bg-bg-white'
                            }`}>
                              {isSelected && <Check size={12} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-text-primary m-0 truncate">{w.fullName}</p>
                              <p className="text-[11px] text-text-muted m-0 capitalize truncate">{w.position || w.role}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Stepper Buttons */}
                  <div className="flex gap-3 mt-5">
                    <button
                      id="step2-back-btn"
                      onClick={() => setStep(1)}
                      className="flex-1 flex items-center justify-center gap-1.5 p-3 rounded-xl border border-border-light text-xs font-bold text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-all cursor-pointer"
                    >
                      <ChevronLeft size={16} />
                      <span>Kembali</span>
                    </button>
                    <button
                      id="step2-next-btn"
                      className={`flex-[2] flex items-center justify-center gap-1.5 p-3 rounded-xl text-xs font-bold text-white bg-primary transition-all cursor-pointer ${
                        selectedWorkerIds.size === 0
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-primary-dark shadow-sm'
                      }`}
                      onClick={() => setStep(3)}
                      disabled={selectedWorkerIds.size === 0}
                    >
                      <span>Review ({selectedWorkerIds.size} Pekerja)</span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </Card>
              )}

              {/* STEP 3: Review & Submit */}
              {step === 3 && (
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 bg-amber-500 shadow-sm">
                      <Check size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-text-primary m-0">3. Review & Konfirmasi Absensi</h3>
                      <p className="text-xs text-text-muted m-0">Periksa kembali ringkasan sesi sebelum disimpan ke database</p>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                    <div className="p-3 rounded-xl bg-bg-secondary border border-border-light">
                      <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider m-0">Lokasi Proyek</p>
                      <p className="text-xs font-bold text-text-primary m-0 mt-0.5 truncate">{selectedProject?.nama}</p>
                      {selectedProject?.lokasi && (
                        <p className="text-[11px] text-text-muted m-0 truncate">📍 {selectedProject.lokasi}</p>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-bg-secondary border border-border-light">
                      <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider m-0">Total Pekerja Hadir</p>
                      <p className="text-xs font-bold text-emerald-600 m-0 mt-0.5">
                        {selectedWorkerIds.size} dari {workers.length} pekerja
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-bg-secondary border border-border-light">
                      <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider m-0">Waktu Submit</p>
                      <p className="text-xs font-bold text-text-primary m-0 mt-0.5">{formatWIBTime(new Date())} WIB</p>
                    </div>
                  </div>

                  {photoPreview && (
                    <div className="rounded-xl overflow-hidden border border-border-light mb-5 max-h-[220px]">
                      <img src={photoPreview} alt="Group photo" className="w-full h-full object-cover" />
                    </div>
                  )}

                  {/* Notes */}
                  <div className="mb-5">
                    <label htmlFor="notes-input" className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
                      Catatan Shift / Lapangan (Opsional)
                    </label>
                    <textarea
                      id="notes-input"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Contoh: Pekerjaan cor lantai 2, shift pagi..."
                      className="w-full p-3 rounded-xl border border-border-light bg-bg-white text-xs text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary transition-colors resize-none h-20"
                    />
                  </div>

                  {/* Stepper Buttons */}
                  <div className="flex gap-3">
                    <button
                      id="step3-back-btn"
                      onClick={() => setStep(2)}
                      className="flex-1 flex items-center justify-center gap-1.5 p-3 rounded-xl border border-border-light text-xs font-bold text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-all cursor-pointer"
                    >
                      <ChevronLeft size={16} />
                      <span>Kembali</span>
                    </button>
                    <button
                      id="submit-attendance-btn"
                      className={`flex-[2] flex items-center justify-center gap-2 p-3.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-sm cursor-pointer ${
                        submitting ? 'opacity-50 cursor-not-allowed' : 'hover:from-emerald-700 hover:to-emerald-600'
                      }`}
                      onClick={handleSubmit}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <Loader size={18} className="animate-spin" />
                      ) : (
                        <>
                          <Check size={18} />
                          <span>Simpan & Tandai Hadir Seluruhnya</span>
                        </>
                      )}
                    </button>
                  </div>
                </Card>
              )}
            </div>
          )}

        </div>

        {/* ─── RIGHT COLUMN (4 cols): SUPERVISOR SELF ATTENDANCE & ERP MODULES ─── */}
        <div className="lg:col-span-4 space-y-6">

          {/* ── Widget 1: Absensi Mandiri Supervisor ── */}
          <div className="p-5 rounded-2xl bg-bg-white border border-border-light shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary-bg text-primary flex items-center justify-center shrink-0">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-primary m-0">Absensi Mandiri Supervisor</h3>
                  <p className="text-[11px] text-text-muted m-0">Kehadiran personal Anda hari ini</p>
                </div>
              </div>
              {selfRecord?.status && (
                <div className="flex items-center gap-1.5">
                  {(selfRecord.isOffline || selfRecord._id?.startsWith('offline_')) && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-700 border border-amber-500/30">
                      Offline
                    </span>
                  )}
                  <span
                    className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                    style={{
                      backgroundColor: STATUS_STYLES[selfRecord.status]?.bg || '#D1FAE5',
                      color: STATUS_STYLES[selfRecord.status]?.color || '#059669',
                    }}
                  >
                    {STATUS_STYLES[selfRecord.status]?.label || selfRecord.status}
                  </span>
                </div>
              )}
            </div>

            {loadingSelf ? (
              <div className="p-4 text-center text-text-muted text-xs">
                <Loader size={16} className="animate-spin mx-auto mb-1" />
                <span>Memuat status kehadiran...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Timeline Progress */}
                <div className="p-3 rounded-xl bg-bg-secondary border border-border-light space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted font-medium">Check-In:</span>
                    <span className="font-bold text-text-primary">
                      {selfRecord?.checkIn?.time ? `${formatWIBTime(selfRecord.checkIn.time)} WIB` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted font-medium">Check-Out:</span>
                    <span className="font-bold text-text-primary">
                      {selfRecord?.checkOut?.time ? `${formatWIBTime(selfRecord.checkOut.time)} WIB` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border-light">
                    <span className="text-text-muted font-medium">Durasi Kerja:</span>
                    <span className="font-extrabold text-primary">{getSelfDuration() || 'Belum mulai'}</span>
                  </div>
                </div>

                {/* Self Check-In Form (if not checked in) */}
                {!selfRecord?.checkIn?.time && selfRecord?.status !== 'Permit' && (
                  <div className="space-y-2.5">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                      Lokasi Proyek Tugas Anda:
                    </label>
                    <select
                      value={selfProjectId}
                      onChange={(e) => setSelfProjectId(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-border-light bg-bg-white text-xs font-semibold text-text-primary focus:outline-none focus:border-primary"
                    >
                      {projects.map((p) => (
                        <option key={p._id} value={p._id}>{p.nama}</option>
                      ))}
                    </select>

                    <button
                      onClick={handleSelfCheckIn}
                      disabled={selfSubmitting || !selfProjectId}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {selfSubmitting ? (
                        <Loader size={14} className="animate-spin" />
                      ) : (
                        <>
                          <Check size={14} />
                          <span>Check-In Sekarang</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Self Check-Out Form (if checked in but not checked out) */}
                {selfRecord?.checkIn?.time && !selfRecord?.checkOut?.time && (
                  <div className="space-y-2.5">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                      Selfie Check-Out (Wajib):
                    </label>

                    {selfPhotoPreview ? (
                      <div className="relative rounded-xl overflow-hidden border border-border-light max-h-[140px]">
                        <img src={selfPhotoPreview} alt="Selfie preview" className="w-full h-full object-cover" />
                        <button
                          onClick={() => { setSelfPhoto(null); setSelfPhotoPreview(null); }}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border-light hover:border-red-400 hover:bg-red-50/50 cursor-pointer transition-colors">
                        <Upload size={16} className="text-text-muted" />
                        <span className="text-xs font-medium text-text-muted">Ambil Foto Selfie Pulang</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="user"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setSelfPhoto(file);
                              setSelfPhotoPreview(URL.createObjectURL(file));
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    )}

                    {myActiveSessionsCount > 0 && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-medium flex items-start gap-1.5">
                        <Info size={14} className="shrink-0 text-amber-600 mt-0.5" />
                        <span>
                          Info: Anda memiliki <strong>{myActiveSessionsCount} sesi grup aktif</strong>. Sesi yang seluruh pekerjanya telah clock-out akan otomatis ditutup saat Anda check-out.
                        </span>
                      </div>
                    )}

                    <button
                      onClick={handleSelfCheckOut}
                      disabled={selfSubmitting || !selfPhoto}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {selfSubmitting ? (
                        <Loader size={14} className="animate-spin" />
                      ) : (
                        <>
                          <LogOut size={14} />
                          <span>Check-Out Sekarang</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Completed Banner */}
                {selfRecord?.checkIn?.time && selfRecord?.checkOut?.time && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                    <p className="text-xs font-bold text-emerald-800 m-0">✓ Absensi Anda hari ini telah lengkap.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Widget 2: Aksi Finansial & Operasional Lapangan ── */}
          <div className="p-5 rounded-2xl bg-bg-white border border-border-light shadow-sm space-y-2.5">
            <h3 className="text-sm font-bold text-text-primary m-0 mb-3 flex items-center gap-2">
              <DollarSign size={16} className="text-amber-500" />
              <span>Aksi Finansial & Administrasi</span>
            </h3>

            <button
              onClick={() => setKasbonOpen(true)}
              className="w-full p-3 rounded-xl border border-border-light bg-bg-white hover:bg-amber-50/60 hover:border-amber-200 transition-all flex items-center gap-3 text-left cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <DollarSign size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-text-primary m-0 group-hover:text-amber-800">Ajukan Kasbon Lapangan</p>
                <p className="text-[11px] text-text-muted m-0 truncate">Maks. limit Rp 200.000 per permohonan</p>
              </div>
              <ChevronRight size={14} className="text-text-muted" />
            </button>

            <button
              onClick={() => setPermitModal(true)}
              className="w-full p-3 rounded-xl border border-border-light bg-bg-white hover:bg-purple-50/60 hover:border-purple-200 transition-all flex items-center gap-3 text-left cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <CalendarOff size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-text-primary m-0 group-hover:text-purple-800">Permohonan Izin / Sakit</p>
                <p className="text-[11px] text-text-muted m-0 truncate">Lampirkan foto bukti atau surat izin</p>
              </div>
              <ChevronRight size={14} className="text-text-muted" />
            </button>

            <button
              onClick={() => navigate('/attendance-logs')}
              className="w-full p-3 rounded-xl border border-border-light bg-bg-white hover:bg-indigo-50/60 hover:border-indigo-200 transition-all flex items-center gap-3 text-left cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <FileText size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-text-primary m-0 group-hover:text-indigo-800">Log Kehadiran & Validasi</p>
                <p className="text-[11px] text-text-muted m-0 truncate">Lihat data kehadiran harian seluruh pekerja</p>
              </div>
              <ChevronRight size={14} className="text-text-muted" />
            </button>
          </div>

          {/* ── Widget 3: Riwayat Kehadiran 7 Hari Terakhir ── */}
          <div className="p-5 rounded-2xl bg-bg-white border border-border-light shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-text-primary m-0 flex items-center gap-2">
                <Calendar size={16} className="text-primary" />
                <span>Riwayat Pribadi 7 Hari</span>
              </h3>
              <button
                onClick={fetchRecentHistory}
                className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
              >
                Refresh
              </button>
            </div>

            {loadingRecent ? (
              <div className="p-4 text-center text-text-muted text-xs">
                <Loader size={16} className="animate-spin mx-auto mb-1" />
                <span>Memuat riwayat...</span>
              </div>
            ) : recentRecords.length === 0 ? (
              <div className="p-6 text-center text-xs text-text-muted">
                Belum ada riwayat absensi 7 hari terakhir.
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {recentRecords.map((r) => {
                  const style = STATUS_STYLES[r.status || 'Present'] || STATUS_STYLES.Present;
                  return (
                    <div
                      key={r._id}
                      className="p-2.5 rounded-xl border border-border-light bg-bg-secondary/40 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-text-primary m-0">
                          {formatWIBDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                        <p className="text-[11px] text-text-muted m-0 tabular-nums">
                          {r.checkIn?.time ? formatWIBTime(r.checkIn.time) : '--:--'}
                          {' → '}
                          {r.checkOut?.time ? formatWIBTime(r.checkOut.time) : '--:--'}
                        </p>
                      </div>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: style.bg, color: style.color }}
                      >
                        {style.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* ══════════════ MODALS ══════════════ */}

      {/* Kasbon Modal */}
      {kasbonOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-4 backdrop-blur-sm"
          onClick={() => setKasbonOpen(false)}
        >
          <div
            className="bg-bg-white rounded-2xl w-full max-w-[440px] p-6 shadow-2xl border border-border-light"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <DollarSign size={22} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-text-primary m-0">Pengajuan Kasbon Lapangan</h3>
                <p className="text-xs text-text-muted m-0">Pinjaman operasional / kasbon sementara</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl my-4 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <span>Maksimum limit per pengajuan kasbon adalah Rp 200.000. Memerlukan persetujuan admin.</span>
            </div>

            <div className="space-y-4">
              <CostInput
                label="Nominal Kasbon (Rp)"
                placeholder="Contoh: 150.000"
                value={Number(kasbonAmount) || 0}
                onChange={(v) => setKasbonAmount(v.toString())}
              />

              <Input
                label="Keperluan / Alasan Pengajuan"
                placeholder="Contoh: Pembelian bensin operasional proyek..."
                value={kasbonReason}
                onChangeText={setKasbonReason}
                multiline
              />
            </div>

            <div className="flex gap-2.5 mt-6 justify-end">
              <Button
                title="Batal"
                onClick={() => setKasbonOpen(false)}
                variant="outline"
              />
              <Button
                title={submittingKasbon ? 'Mengirim...' : 'Kirim Pengajuan'}
                onClick={handleKasbonSubmit}
                loading={submittingKasbon}
                variant="primary"
              />
            </div>
          </div>
        </div>
      )}

      {/* Permit Modal */}
      {permitModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-4 backdrop-blur-sm"
          onClick={() => setPermitModal(false)}
        >
          <div
            className="bg-bg-white rounded-2xl w-full max-w-[440px] p-6 shadow-2xl border border-border-light"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <CalendarOff size={22} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-text-primary m-0">Pengajuan Izin / Sakit</h3>
                <p className="text-xs text-text-muted m-0">Kirim permohonan izin tidak masuk kerja</p>
              </div>
            </div>

            <div className="space-y-4 mt-4">
              <Input
                label="Alasan Izin / Keterangan Sakit"
                placeholder="Jelaskan alasan izin Anda..."
                value={permitReason}
                onChangeText={setPermitReason}
                multiline
              />

              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5 block">
                  Foto Bukti / Surat Keterangan Dokter (Wajib)
                </label>

                {permitPhotoPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-border-light max-h-[160px]">
                    <img src={permitPhotoPreview} alt="Bukti izin" className="w-full h-full object-cover" />
                    <button
                      onClick={() => { setPermitPhoto(null); setPermitPhotoPreview(null); }}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed border-border-light rounded-xl hover:border-purple-400 hover:bg-purple-50/40 cursor-pointer transition-colors">
                    <Upload size={22} className="text-text-muted" />
                    <span className="text-xs font-semibold text-text-muted">Upload Foto Surat / Bukti</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPermitPhoto(file);
                          setPermitPhotoPreview(URL.createObjectURL(file));
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="flex gap-2.5 mt-6 justify-end">
              <Button
                title="Batal"
                onClick={() => setPermitModal(false)}
                variant="outline"
              />
              <Button
                title={submittingPermit ? 'Mengirim...' : 'Kirim Permohonan Izin'}
                onClick={handlePermitSubmit}
                loading={submittingPermit}
                variant="primary"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Close Session (Bulk Clock-Out & Close) Confirmation Modal ── */}
      {showCloseModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-4 backdrop-blur-sm"
          onClick={() => !closingSession && setShowCloseModal(false)}
        >
          <div
            className="bg-bg-white rounded-2xl w-full max-w-[480px] p-6 shadow-2xl border border-border-light"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                isCurrentSessionPast
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              }`}>
                {isCurrentSessionPast ? <AlertTriangle size={22} /> : <LogOut size={22} />}
              </div>
              <div>
                <h3 className="text-base font-extrabold text-text-primary m-0">
                  {isCurrentSessionPast ? 'Clock-Out Susulan & Tutup Sesi' : 'Clock-Out Semua & Selesaikan Sesi'}
                </h3>
                <p className="text-xs text-text-muted m-0">
                  {isCurrentSessionPast
                    ? `Selesaikan presensi sisa pekerja untuk sesi lampau (${currentActiveSession?.date ? formatWIBDate(new Date(currentActiveSession.date)) : ''})`
                    : 'Tandai jam pulang seluruh sisa pekerja dan tutup sesi ini'}
                </p>
              </div>
            </div>

            {isCurrentSessionPast ? (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 mb-4 space-y-1">
                <p className="m-0 font-bold flex items-center gap-1.5 text-amber-900">
                  <AlertTriangle size={14} className="text-amber-600" />
                  Clock-Out Susulan Sesi Lampau ({currentActiveSession?.date ? formatWIBDate(new Date(currentActiveSession.date)) : ''}):
                </p>
                <p className="m-0 text-amber-800">
                  Sesi ini berasal dari tanggal sebelumnya. Jam pulang disetel default ke <strong>17:00 WIB</strong> (jam akhir shift kerja standar) agar absensi pekerja tercatat penuh pada tanggal tersebut.
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 mb-4">
                <p className="m-0 font-bold mb-1">Konfirmasi Penutupan Sesi:</p>
                <p className="m-0 text-emerald-800">
                  Aksi ini akan mencatat jam kepulangan untuk <strong>{workersStillPresent.length} pekerja</strong> yang tersisa dan mengubah status sesi menjadi <strong>Inaktif / Ditutup</strong>.
                </p>
              </div>
            )}

            <div className="space-y-3.5 mb-5">
              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
                  Jam Pulang Bersama (WIB)
                </label>
                <input
                  type="time"
                  value={closeLeaveHour}
                  onChange={(e) => setCloseLeaveHour(e.target.value)}
                  className="w-full p-3 rounded-xl border border-border-light bg-bg-white text-sm font-semibold text-text-primary focus:outline-none focus:border-primary"
                />
                <span className="text-[11px] text-text-muted mt-1 block">
                  {isCurrentSessionPast
                    ? `Default: 17:00 WIB (jam shift normal sesi lampau)`
                    : `Default: jam saat ini (${formatWIBTime(new Date())} WIB)`}
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
                  Keterangan / Catatan Penutupan (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Shift harian selesai serentak"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full p-3 rounded-xl border border-border-light bg-bg-white text-sm font-medium text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="flex gap-2.5 justify-end">
              <Button
                title="Batal"
                onClick={() => setShowCloseModal(false)}
                variant="outline"
                disabled={closingSession}
              />
              <Button
                title={closingSession ? 'Menutup Sesi...' : `Ya, Clock-Out (${workersStillPresent.length}) & Tutup Sesi`}
                onClick={handleCloseAllAndFinishSession}
                loading={closingSession}
                variant="danger"
                icon={LogOut}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Konfirmasi Eliminasi Sesi Absensi ── */}
      {sessionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-bg-white rounded-2xl max-w-md w-full border border-border-light shadow-2xl p-6 relative animate-zoom-in">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 shadow-xs">
                <Trash2 size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-text-primary m-0 mb-1">
                  Eliminasi / Hapus Sesi Absensi?
                </h3>
                <p className="text-xs text-text-muted m-0 leading-relaxed">
                  Fitur ini digunakan jika terjadi clock-in ganda (dua kali) atau kekeliruan sesi oleh supervisor.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900 mb-5 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-950">
                <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                <span>Perhatian & Konsekuensi:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-amber-800">
                <li>
                  Catatan clock-in untuk{' '}
                  <strong className="text-amber-950">
                    {(sessionToDelete.workerIds?.length || 0) + (sessionToDelete.lateWorkerIds?.length || 0)} pekerja
                  </strong>{' '}
                  pada sesi ini akan ikut dibatalkan/dihapus.
                </li>
                <li>
                  Foto bukti dan riwayat sesi ini akan dihapus secara permanen.
                </li>
                <li>
                  Pekerja yang dibatalkan dapat di-clock-in kembali secara benar pada sesi baru.
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deletingSession}
                onClick={() => setSessionToDelete(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-text-primary bg-bg-secondary hover:bg-border-light border border-border-light transition-all cursor-pointer min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deletingSession}
                onClick={handleConfirmDeleteSession}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all flex items-center gap-2 cursor-pointer shadow-sm min-h-[44px] disabled:opacity-50"
              >
                {deletingSession ? (
                  <>
                    <Loader size={15} className="animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={15} />
                    <span>Ya, Eliminasi Sesi</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Tambah Pekerja Offline ── */}
      {showAddWorkerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-bg-white rounded-2xl border border-border-light shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-light">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary-bg text-primary flex items-center justify-center">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-primary m-0">Tambah Pekerja Lapangan</h3>
                  <p className="text-[11px] text-text-muted m-0">Tersimpan di perangkat & otomatis masuk presensi</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddWorkerModal(false)}
                className="w-7 h-7 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
                  Nama Lengkap Pekerja *
                </label>
                <input
                  id="new-worker-name-input"
                  type="text"
                  placeholder="Contoh: Budi Santoso"
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border-light bg-bg-white text-sm text-text-primary focus:outline-none focus:border-primary transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
                  Peran / Posisi
                </label>
                <select
                  id="new-worker-role-select"
                  value={newWorkerRole}
                  onChange={(e) => setNewWorkerRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border-light bg-bg-white text-sm text-text-primary focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="tukang">Tukang</option>
                  <option value="helper">Helper / Kenek</option>
                  <option value="worker">Pekerja Lapangan</option>
                  <option value="foreman">Mandor / Foreman</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowAddWorkerModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-border-light text-xs font-bold text-text-muted hover:bg-bg-secondary cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                id="submit-add-worker-btn"
                onClick={handleAddOfflineWorker}
                disabled={!newWorkerName.trim() || addingWorker}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-primary flex items-center justify-center gap-1.5 cursor-pointer ${
                  !newWorkerName.trim() || addingWorker
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-primary-dark shadow-sm'
                }`}
              >
                {addingWorker ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Simpan & Pilih</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
