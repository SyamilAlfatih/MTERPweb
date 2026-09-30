import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, Check, Users, Search, ChevronRight, ChevronLeft,
  Building, Loader, AlertCircle, Clock, UserPlus, LogOut,
  X, CheckSquare, Square, PlayCircle, RefreshCw,
  FileText, DollarSign, CalendarOff, Receipt, Shield,
  Upload, Calendar, MapPin, Timer, CheckCircle2, UserCheck,
  TrendingUp, ShieldCheck, ArrowRight, Info, PlusCircle,
} from 'lucide-react';
import { PhotoView } from 'react-photo-view';
import api from '../api/api';
import { Card, Button, Alert, Input, CostInput } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import { useImageCompression } from '../utils/useImageCompression';
import { formatDate as formatWIBDate, formatTime as formatWIBTime, todayWIB, wibDate } from '../utils/date';

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
  workerIds: (string | { _id: string; fullName: string })[];
  lateWorkerIds: { workerId: string | { _id: string; fullName: string }; addedAt?: string }[];
  leaveRecords?: { workerId: string | { _id: string; fullName: string }; leaveHour: string; reason?: string }[];
  photoUrl: string;
  notes?: string;
  supervisorId: { _id?: string; fullName: string; role?: string } | string;
  createdAt?: string;
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
  const [currentActiveSession, setCurrentActiveSession] = useState<ActiveSession | null>(null);
  const skipProjectFetchRef = useRef(false);

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

  const mySessionsCount = useMemo(() => {
    return todaySessions.filter(isMySession).length;
  }, [todaySessions, isMySession]);

  const displayedSessions = useMemo(() => {
    if (sessionFilter === 'mine') {
      return todaySessions.filter(isMySession);
    }
    return todaySessions;
  }, [todaySessions, sessionFilter, isMySession]);

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
      if (response.data?.length > 0 && !selfProjectId) {
        setSelfProjectId(response.data[0]._id);
      }
    } catch (err) {
      console.error('Failed to fetch projects', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchTodaySessions = async () => {
    setLoadingTodaySessions(true);
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      const response = await api.get(`/attendance-session?date=${today}&limit=50`);
      const sessions = response.data?.sessions || [];
      setTodaySessions(sessions);
    } catch (err) {
      console.error('Failed to fetch today sessions', err);
      setTodaySessions([]);
    } finally {
      setLoadingTodaySessions(false);
    }
  };

  const fetchTodaySelfAttendance = async () => {
    setLoadingSelf(true);
    try {
      const response = await api.get('/attendance/today');
      setSelfRecord(response.data || null);
    } catch (err) {
      console.error('Failed to fetch self attendance', err);
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
          _id: u._id,
          fullName: u.fullName || 'Unknown',
          role: u.role || 'worker',
          position: u.position || u.role || 'worker',
        }))
        .sort((a: WorkerItem, b: WorkerItem) => a.fullName.localeCompare(b.fullName));
      setWorkers(assignedWorkers);
      if (!preserveSelection) {
        setSelectedWorkerIds(new Set());
      }
    } catch (err) {
      console.error('Failed to fetch project workers', err);
      setWorkers([]);
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
    setSelectedWorkerIds(prev => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedWorkerIds.size === filteredWorkers.length && filteredWorkers.length > 0) {
      setSelectedWorkerIds(prev => {
        const next = new Set(prev);
        filteredWorkers.forEach(w => next.delete(w._id));
        return next;
      });
    } else {
      setSelectedWorkerIds(prev => {
        const next = new Set(prev);
        filteredWorkers.forEach(w => next.add(w._id));
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    if (!photo || !selectedProjectId || selectedWorkerIds.size === 0) return;
    setSubmitting(true);
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
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Gagal Submit',
        message: err.response?.data?.msg || 'Terjadi kesalahan. Coba lagi.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLateAdd = async () => {
    if (!lateWorkerId || !result?.session?._id) return;
    setAddingLate(true);
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
      setAlertData({
        visible: true, type: 'error', title: 'Gagal',
        message: err.response?.data?.msg || 'Gagal menambahkan pekerja',
      });
    } finally {
      setAddingLate(false);
    }
  };

  const handleLeaveHour = async () => {
    if (!result?.session?._id) return;
    setRecordingLeave(true);

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

      const response = await api.post(
        `/attendance-session/${result.session._id}/leave-hour`,
        { workers: workersPayload }
      );
      setAlertData({ visible: true, type: 'success', title: 'Berhasil', message: response.data.msg });
      setLeaveWorkerId('');
      setLeaveHour('');
      setLeaveReason('');
      setBulkLeaveWorkerIds(new Set());
      setBulkLeaveHour('');
      setBulkLeaveReason('');
      fetchTodaySessions();
    } catch (err: any) {
      setAlertData({
        visible: true, type: 'error', title: 'Gagal',
        message: err.response?.data?.msg || 'Gagal mencatat jam pulang',
      });
    } finally {
      setRecordingLeave(false);
    }
  };

  const toggleBulkLeaveWorker = (id: string) => {
    setBulkLeaveWorkerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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

      setAlertData({
        visible: true,
        type: 'success',
        title: 'Sesi Dimuat',
        message: 'Anda melanjutkan sesi absensi yang sudah ada.',
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
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Check-In Gagal',
        message: err.response?.data?.msg || 'Gagal melakukan check-in mandiri.',
      });
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
        message: `Check-out berhasil tercatat pada ${formatWIBTime(new Date())} WIB.`,
      });
      setSelfPhoto(null);
      setSelfPhotoPreview(null);
      await fetchTodaySelfAttendance();
      await fetchRecentHistory();
    } catch (err: any) {
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Check-Out Gagal',
        message: err.response?.data?.msg || 'Gagal melakukan check-out mandiri.',
      });
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
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Pengajuan Izin Gagal',
        message: err.response?.data?.msg || 'Gagal mengajukan izin.',
      });
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
            <p className="text-[10px] text-emerald-600 font-semibold m-0 mt-0.5">Multi-Supervisor Aktif</p>
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
            <h3 className="text-base font-extrabold text-text-primary m-0 mt-0.5 truncate">
              {selfRecord?.checkIn?.time
                ? (selfRecord.checkOut?.time ? 'Selesai Check-Out' : 'Sedang Bertugas')
                : (selfRecord?.status === 'Permit' ? 'Status Izin' : 'Belum Check-In')}
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

          {!loadingTodaySessions && todaySessions.length > 0 && !result && (
            <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-[0_2px_8px_rgba(5,150,105,0.3)] shrink-0">
                    <PlayCircle size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-emerald-950 m-0">Sesi Aktif Hari Ini</h2>
                      <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-200 text-emerald-900">
                        {todaySessions.length} Sesi Terbuka
                      </span>
                    </div>
                    <p className="text-xs text-emerald-700/80 m-0">
                      Seluruh sesi dari berbagai supervisor ditampilkan di bawah ini. Pilih sesi untuk mengelola jam pulang atau pekerja terlambat.
                    </p>
                  </div>
                </div>
                <button
                  id="refresh-session-btn"
                  onClick={fetchTodaySessions}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-emerald-700 hover:bg-emerald-200/70 transition-colors shrink-0 bg-emerald-100/60"
                  title="Refresh sesi"
                  aria-label="Refresh sesi"
                >
                  <RefreshCw size={16} />
                </button>
              </div>

              {/* Tabs filter */}
              {(todaySessions.length > 1 || mySessionsCount > 0) && (
                <div className="flex gap-2 p-1 bg-emerald-200/50 rounded-xl mb-3.5">
                  <button
                    type="button"
                    onClick={() => setSessionFilter('all')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
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
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                      sessionFilter === 'mine'
                        ? 'bg-bg-white text-emerald-950 shadow-sm'
                        : 'text-emerald-800/80 hover:text-emerald-950'
                    }`}
                  >
                    Sesi Saya ({mySessionsCount})
                  </button>
                </div>
              )}

              {/* List of sessions */}
              {displayedSessions.length === 0 ? (
                <div className="p-4 rounded-xl bg-bg-white border border-emerald-200 text-center text-xs text-text-muted">
                  Tidak ada sesi yang Anda buat hari ini. Silakan beralih ke tab <strong>Semua Supervisor</strong> atau buat sesi baru.
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
                  {displayedSessions.map((session) => {
                    const isMine = isMySession(session);
                    const projectName = typeof session.projectId === 'string'
                      ? 'Proyek'
                      : session.projectId?.nama || 'Proyek';
                    const projectLocation = typeof session.projectId === 'object' ? session.projectId?.lokasi : '';
                    const supervisorName = typeof session.supervisorId === 'object'
                      ? session.supervisorId?.fullName
                      : 'Supervisor';
                    const totalWorkers = (session.workerIds?.length || 0) + (session.lateWorkerIds?.length || 0);
                    const isResumingThis = resumingSessionId === session._id;
                    const photoSrc = getImageUrl(session.photoUrl);

                    return (
                      <div
                        key={session._id}
                        className={`p-4 rounded-xl border transition-all ${
                          isMine
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
                            <div className="w-16 h-16 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                              <Camera size={22} />
                            </div>
                          )}

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h4 className="text-sm font-bold text-text-primary m-0 truncate">
                                {projectName}
                              </h4>
                              {isMine ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700 border border-emerald-300">
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
                              <span className="flex items-center gap-1 font-bold text-emerald-800">
                                <Users size={13} className="text-emerald-600" />
                                {totalWorkers} pekerja hadir
                              </span>
                              <span className="w-1 h-1 rounded-full bg-border" />
                              <span className="flex items-center gap-1 font-medium">
                                <Clock size={13} className="text-text-muted" />
                                {formatWIBTime(new Date(session.createdAt || session.date))} WIB
                              </span>
                            </div>

                            {session.notes && (
                              <p className="text-[11px] text-text-muted/80 italic m-0 mt-1 truncate">
                                "{session.notes}"
                              </p>
                            )}
                          </div>

                          {/* Action Button */}
                          <div className="shrink-0 self-center">
                            <button
                              onClick={() => handleResumeSession(session)}
                              disabled={resumingSessionId !== null}
                              className={`flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-bold text-white transition-all ${
                                isResumingThis
                                  ? 'bg-emerald-400 cursor-not-allowed'
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
                                  <PlayCircle size={14} />
                                  <span>Lanjutkan Sesi</span>
                                  <ChevronRight size={14} />
                                </>
                              )}
                            </button>
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
              <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-bg-white border border-border-light shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <PlayCircle size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider m-0">
                      Sesi Sedang Dibuka
                    </p>
                    <h3 className="text-base font-extrabold text-text-primary m-0 truncate">
                      {selectedProject?.nama || (typeof currentActiveSession?.projectId === 'object' ? currentActiveSession.projectId?.nama : 'Proyek')}
                    </h3>
                    <p className="text-xs text-text-muted m-0 truncate">
                      Supervisor: {typeof currentActiveSession?.supervisorId === 'object' ? currentActiveSession.supervisorId.fullName : user?.fullName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="back-to-sessions-btn"
                    onClick={handleBackToSessions}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-text-primary bg-bg-secondary hover:bg-border-light border border-border-light transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Kembali ke daftar sesi aktif"
                  >
                    <ChevronLeft size={14} />
                    <span>Daftar Sesi ({todaySessions.length})</span>
                  </button>
                </div>
              </div>

              {/* Result Summary Card */}
              <Card className="text-center p-8">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-3.5 text-white shadow-[0_4px_20px_rgba(5,150,105,0.3)]">
                  <Check size={32} />
                </div>
                <h3 className="text-xl font-extrabold text-text-primary m-0 mb-1">Absensi Sesi Aktif</h3>
                <p className="text-sm text-text-muted m-0">
                  <span className="font-black text-emerald-600 text-lg">{result.created}</span> pekerja tercatat hadir pada sesi ini
                </p>

                {result.conflicts.length > 0 && (
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

              {/* Late Add Section */}
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

                {untaggedWorkers.length > 0 ? (
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
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center text-xs font-semibold text-emerald-800">
                    ✓ Seluruh pekerja yang terdaftar pada proyek ini sudah tercatat hadir.
                  </div>
                )}
              </Card>

              {/* Leave Hour Section */}
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-red-500 to-red-400">
                    <LogOut size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-text-primary m-0">Catat Jam Pulang / Pulang Awal</h3>
                    <p className="text-xs text-text-muted m-0">Pekerja yang pulang lebih awal atau checkout shift</p>
                  </div>
                </div>

                {/* Mode Toggle */}
                <div className="flex gap-2 p-1 bg-bg-secondary rounded-xl mb-4">
                  <button
                    id="leave-mode-individual"
                    onClick={() => setLeaveMode('individual')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                      leaveMode === 'individual'
                        ? 'bg-bg-white text-text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    id="leave-mode-bulk"
                    onClick={() => setLeaveMode('bulk')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                      leaveMode === 'bulk'
                        ? 'bg-bg-white text-text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    Grup (Bulk Pulang Bersama)
                  </button>
                </div>

                {leaveMode === 'individual' ? (
                  <div className="space-y-3">
                    <select
                      id="leave-worker-select"
                      value={leaveWorkerId}
                      onChange={(e) => setLeaveWorkerId(e.target.value)}
                      className="w-full p-3 rounded-xl border border-border-light bg-bg-white text-sm font-medium text-text-primary focus:outline-none focus:border-primary transition-colors"
                    >
                      <option value="">— Pilih Pekerja yang Pulang —</option>
                      {taggedWorkers.map(w => (
                        <option key={w._id} value={w._id}>{w.fullName}</option>
                      ))}
                    </select>
                    <div>
                      <label htmlFor="leave-hour-input" className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
                        Jam Pulang
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
                        placeholder="Contoh: Sakit, urusan keluarga, cuaca hujan..."
                        className="w-full p-3 rounded-xl border border-border-light bg-bg-white text-sm font-medium text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Pilih pekerja yang pulang:</p>
                    <div
                      id="bulk-leave-worker-list"
                      className="flex flex-col gap-[2px] max-h-[220px] overflow-y-auto rounded-xl border border-border-light"
                    >
                      {taggedWorkers.map(w => {
                        const checked = bulkLeaveWorkerIds.has(w._id);
                        return (
                          <button
                            key={w._id}
                            id={`bulk-leave-worker-${w._id}`}
                            onClick={() => toggleBulkLeaveWorker(w._id)}
                            className={`flex items-center gap-3 p-3 text-left transition-all min-h-[48px] border-b border-border-light last:border-0 ${
                              checked ? 'bg-red-50' : 'bg-bg-white hover:bg-bg-secondary'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all ${
                              checked ? 'bg-red-500 text-white' : 'border-2 border-border bg-bg-white'
                            }`}>
                              {checked && <Check size={12} />}
                            </div>
                            <span className="text-sm font-medium text-text-primary">{w.fullName}</span>
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
                        placeholder="Contoh: Hujan lebat di lokasi proyek"
                        className="w-full p-3 rounded-xl border border-border-light bg-bg-white text-sm font-medium text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                )}

                <Button
                  title={recordingLeave ? 'Menyimpan...' : 'Simpan Jam Pulang'}
                  onClick={handleLeaveHour}
                  loading={recordingLeave}
                  icon={LogOut}
                  fullWidth
                  variant="danger"
                  className="mt-4"
                />
              </Card>

              {/* Start New Session Button */}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 max-h-[260px] overflow-y-auto pr-1">
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
                    <div className="p-8 text-center border-2 border-dashed border-border-light rounded-xl text-text-muted mb-5">
                      <Building size={24} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium">Tidak ada proyek aktif</p>
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

                  <button
                    id="step1-next-btn"
                    className={`w-full flex items-center justify-center gap-2 p-4 rounded-xl text-sm font-bold text-white bg-primary transition-all cursor-pointer ${
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
                      <h3 className="text-base font-bold text-text-primary m-0">2. Pilih Pekerja yang Hadir</h3>
                      <p className="text-xs text-text-muted m-0 truncate">{selectedProject?.nama || 'Proyek'}</p>
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

                  {/* Toggle All */}
                  <button
                    id="toggle-all-workers-btn"
                    onClick={toggleAll}
                    className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-bg-secondary text-xs font-bold text-text-muted hover:bg-primary-bg hover:text-primary transition-colors w-full cursor-pointer"
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

                  {/* Worker List */}
                  {loadingWorkers ? (
                    <div className="p-8 text-center text-text-muted">
                      <Loader size={24} className="animate-spin mx-auto mb-2" />
                      <p className="text-sm">Memuat daftar pekerja proyek...</p>
                    </div>
                  ) : workers.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-border-light rounded-xl text-text-muted">
                      <Users size={24} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium">Belum ada pekerja di proyek ini</p>
                      <p className="text-xs mt-1 opacity-70">Assign pekerja di halaman Pengaturan Proyek</p>
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
                <span
                  className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                  style={{
                    backgroundColor: STATUS_STYLES[selfRecord.status]?.bg || '#D1FAE5',
                    color: STATUS_STYLES[selfRecord.status]?.color || '#059669',
                  }}
                >
                  {STATUS_STYLES[selfRecord.status]?.label || selfRecord.status}
                </span>
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

    </div>
  );
}
