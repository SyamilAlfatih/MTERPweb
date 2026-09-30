import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, Check, Users, Search, ChevronRight, ChevronLeft,
  Building, Loader, AlertCircle, Clock, UserPlus, LogOut,
  X, CheckSquare, Square, PlayCircle, RefreshCw,
} from 'lucide-react';
import api from '../api/api';
import { Card, Button, Alert } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import { useImageCompression } from '../utils/useImageCompression';
import { formatDate as formatWIBDate, formatTime as formatWIBTime } from '../utils/date';

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

  // ── Active Sessions (today's existing sessions) ──
  const [todaySessions, setTodaySessions] = useState<ActiveSession[]>([]);
  const [loadingTodaySessions, setLoadingTodaySessions] = useState(true);
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<'all' | 'mine'>('all');
  const [currentActiveSession, setCurrentActiveSession] = useState<ActiveSession | null>(null);
  // Flag to prevent useEffect from re-fetching workers (and clearing selection) during resume
  const skipProjectFetchRef = useRef(false);

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

  // Workers NOT in the session (for late-add dropdown)
  const untaggedWorkers = useMemo(() => {
    return workers.filter(w => !selectedWorkerIds.has(w._id));
  }, [workers, selectedWorkerIds]);

  // Workers IN the session (for leave-hour dropdowns)
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

  // ── Effects ──

  useEffect(() => {
    fetchProjects();
    fetchTodaySessions();
  }, []);

  useEffect(() => {
    if (selectedProjectId && !skipProjectFetchRef.current) {
      fetchProjectWorkers(selectedProjectId);
    }
    // Reset the flag after consuming it
    skipProjectFetchRef.current = false;
  }, [selectedProjectId]);

  // ── API Calls ──

  const fetchProjects = async () => {
    try {
      const response = await api.get('/attendance/projects');
      setProjects(response.data);
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

  const fetchProjectWorkers = async (projectId: string, preserveSelection = false) => {
    setLoadingWorkers(true);
    try {
      const response = await api.get(`/projects/${projectId}`);
      const project = response.data;
      // assignedTo is an array of populated user objects
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
      // Only reset selection when NOT resuming a session
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

  // ── Handlers ──

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
      if (next.has(workerId)) {
        next.delete(workerId);
      } else {
        next.add(workerId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedWorkerIds.size === filteredWorkers.length && filteredWorkers.length > 0) {
      // Deselect all currently visible
      setSelectedWorkerIds(prev => {
        const next = new Set(prev);
        filteredWorkers.forEach(w => next.delete(w._id));
        return next;
      });
    } else {
      // Select all currently visible
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
      // Add to selected set so it moves to taggedWorkers
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
      // Reset leave form
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
      // Fetch full session detail to get populated workerIds
      const response = await api.get(`/attendance-session/${session._id}`);
      const fullSession = response.data;
      setCurrentActiveSession(fullSession);

      const projectId = typeof fullSession.projectId === 'string'
        ? fullSession.projectId
        : fullSession.projectId?._id;

      // Reconstruct the worker ID set (initial + late)
      const workerIdList: string[] = [
        ...(fullSession.workerIds || []).map((w: any) =>
          typeof w === 'string' ? w : w._id
        ),
        ...(fullSession.lateWorkerIds || []).map((lw: any) =>
          typeof lw.workerId === 'string' ? lw.workerId : lw.workerId?._id
        ).filter(Boolean),
      ];

      // Populate workers from the project.
      // Pass preserveSelection=true so fetchProjectWorkers does NOT reset
      // selectedWorkerIds — we set them right after.
      if (projectId) {
        await fetchProjectWorkers(projectId, true);
        // Raise flag BEFORE setting projectId so the useEffect skip fires correctly
        skipProjectFetchRef.current = true;
        setSelectedProjectId(projectId);
      }

      // Restore the full worker selection from the session
      setSelectedWorkerIds(new Set(workerIdList));

      // Set result so we jump straight to the post-submit view
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

  // ── Guard ──
  if (!isSupervisor) {
    return (
      <div className="p-6 max-w-[600px] mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertCircle size={32} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-text-primary mb-2">Akses Ditolak</h2>
        <p className="text-sm text-text-muted mb-4">Hanya supervisor yang dapat menggunakan fitur ini.</p>
        <Button title="Kembali" onClick={() => navigate('/attendance')} variant="outline" />
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="p-6 max-w-[600px] mx-auto max-lg:p-4 max-sm:p-3">
      <Alert
        visible={alertData.visible}
        type={alertData.type}
        title={alertData.title}
        message={alertData.message}
        onClose={() => setAlertData({ ...alertData, visible: false })}
      />

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/attendance')}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-bg-secondary text-text-muted hover:bg-bg-white hover:text-text-primary transition-all border border-border-light"
          aria-label="Kembali"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary m-0">Absensi Foto Grup</h1>
          <p className="text-xs text-text-muted m-0">
            {formatWIBDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* ── Active Sessions Section (Today's Sessions) ── */}
      {loadingTodaySessions && !result && (
        <div className="flex items-center gap-3 p-4 mb-4 rounded-xl bg-bg-secondary border border-border-light animate-pulse">
          <div className="w-10 h-10 rounded-lg bg-border-light shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-border-light rounded w-40" />
            <div className="h-2.5 bg-border-light rounded w-24" />
          </div>
        </div>
      )}

      {!loadingTodaySessions && todaySessions.length > 0 && !result && (
        <div className="mb-6 rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-emerald-100/50 p-4 shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-[0_2px_8px_rgba(5,150,105,0.3)] shrink-0">
                <PlayCircle size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-emerald-950 m-0">Sesi Aktif Hari Ini</h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-200/80 text-emerald-800">
                    {todaySessions.length} Sesi
                  </span>
                </div>
                <p className="text-[11px] text-emerald-700/80 m-0">
                  {todaySessions.length > 1
                    ? 'Pilih sesi untuk melanjutkan absensi atau kelola jam pulang'
                    : 'Lanjutkan sesi yang sudah ada atau buat sesi baru di bawah'}
                </p>
              </div>
            </div>
            <button
              id="refresh-session-btn"
              onClick={fetchTodaySessions}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-700 hover:bg-emerald-200/70 transition-colors shrink-0"
              title="Refresh daftar sesi"
              aria-label="Refresh sesi"
            >
              <RefreshCw size={15} />
            </button>
          </div>

          {/* Filter Tabs (when multiple sessions or user has own sessions) */}
          {(todaySessions.length > 1 || mySessionsCount > 0) && (
            <div className="flex gap-1.5 p-1 bg-emerald-200/50 rounded-xl mb-3">
              <button
                type="button"
                onClick={() => setSessionFilter('all')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                  sessionFilter === 'all'
                    ? 'bg-bg-white text-emerald-900 shadow-sm'
                    : 'text-emerald-800/80 hover:text-emerald-950'
                }`}
              >
                Semua Sesi ({todaySessions.length})
              </button>
              <button
                type="button"
                onClick={() => setSessionFilter('mine')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                  sessionFilter === 'mine'
                    ? 'bg-bg-white text-emerald-900 shadow-sm'
                    : 'text-emerald-800/80 hover:text-emerald-950'
                }`}
              >
                Sesi Saya ({mySessionsCount})
              </button>
            </div>
          )}

          {/* Sessions List */}
          {displayedSessions.length === 0 ? (
            <div className="p-4 rounded-xl bg-bg-white/80 border border-emerald-200/60 text-center text-xs text-text-muted">
              Tidak ada sesi yang Anda buat hari ini. Silakan lihat tab <strong>Semua Sesi</strong> atau buat sesi baru di bawah.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-[360px] overflow-y-auto pr-1">
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

                return (
                  <div
                    key={session._id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isMine
                        ? 'bg-bg-white border-emerald-300 shadow-sm ring-1 ring-emerald-200/50'
                        : 'bg-bg-white/90 border-emerald-200/70 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-sm font-bold text-text-primary m-0 truncate">
                            {projectName}
                          </h4>
                          {isMine ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">
                              ✓ Sesi Anda
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg-secondary text-text-muted shrink-0">
                              Oleh: {supervisorName}
                            </span>
                          )}
                        </div>
                        {projectLocation && (
                          <p className="text-[11px] text-text-muted m-0 truncate mt-0.5">
                            {projectLocation}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-3 text-xs text-text-muted mb-3 flex-wrap">
                      <span className="flex items-center gap-1 font-semibold text-emerald-800">
                        <Users size={12} className="text-emerald-600" />
                        {totalWorkers} pekerja
                      </span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span className="flex items-center gap-1">
                        <Clock size={12} className="text-text-muted" />
                        {formatWIBTime(new Date(session.createdAt || session.date))}
                      </span>
                      {session.notes && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <span className="text-[11px] text-text-muted truncate max-w-[150px]" title={session.notes}>
                            "{session.notes}"
                          </span>
                        </>
                      )}
                    </div>

                    {/* Resume Button */}
                    <button
                      onClick={() => handleResumeSession(session)}
                      disabled={resumingSessionId !== null}
                      className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold text-white transition-all ${
                        isResumingThis
                          ? 'bg-emerald-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 shadow-sm cursor-pointer'
                      }`}
                    >
                      {isResumingThis ? (
                        <>
                          <Loader size={14} className="animate-spin" />
                          <span>Memuat Sesi...</span>
                        </>
                      ) : (
                        <>
                          <PlayCircle size={14} />
                          <span>Lanjutkan Sesi Ini</span>
                          <ChevronRight size={14} className="ml-auto" />
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-center text-[11px] text-emerald-800/70 mt-3 m-0">
            atau buat sesi absensi baru di bawah ini ↓
          </p>
        </div>
      )}

      {/* ── Step Indicator ── */}
      {!result && (
        <div className="flex items-center gap-0 mb-6 px-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 ${
                step > s
                  ? 'bg-gradient-to-br from-emerald-600 to-emerald-400 text-white shadow-[0_2px_8px_rgba(5,150,105,0.3)]'
                  : step === s
                    ? 'bg-gradient-to-br from-primary to-primary-light text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]'
                    : 'bg-bg-secondary text-text-muted border-2 border-border'
              }`}>
                {step > s ? <Check size={14} /> : s}
              </div>
              {s < 3 && (
                <div className={`flex-1 h-[2px] mx-2 rounded transition-colors duration-300 ${
                  step > s ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-border'
                }`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══════════════ STEP 1: Project + Photo ══════════════ */}
      {step === 1 && !result && (
        <Card className="mb-4 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-[42px] h-[42px] rounded-md flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-primary to-primary-light">
              <Camera size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary m-0">Pilih Proyek & Foto Grup</h3>
              <p className="text-xs text-text-muted m-0">Pilih lokasi proyek, lalu ambil foto grup</p>
            </div>
          </div>

          {/* Project Selection */}
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 block">
            Pilih Proyek
          </span>
          {loadingProjects ? (
            <div className="p-8 text-center text-text-muted">
              <Loader size={24} className="animate-spin mx-auto mb-2" />
              <p className="text-sm">Memuat proyek...</p>
            </div>
          ) : projects.length > 0 ? (
            <div className="flex flex-col gap-2 mb-5 max-h-[220px] overflow-y-auto">
              {projects.map((p) => (
                <button
                  key={p._id}
                  id={`project-${p._id}`}
                  onClick={() => setSelectedProjectId(p._id)}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    selectedProjectId === p._id
                      ? 'border-primary bg-primary-bg'
                      : 'border-border-light bg-bg-white hover:border-primary/50'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    selectedProjectId === p._id ? 'bg-primary text-white' : 'bg-bg-secondary text-text-muted'
                  }`}>
                    <Building size={20} />
                  </div>
                  <div className="flex-1">
                    <h4 className={`text-base font-bold m-0 ${selectedProjectId === p._id ? 'text-primary' : 'text-text-primary'}`}>
                      {p.nama}
                    </h4>
                    {p.lokasi && <p className="text-xs text-text-muted m-0">{p.lokasi}</p>}
                  </div>
                  {selectedProjectId === p._id && (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white">
                      <Check size={14} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center border-2 border-dashed border-border-light rounded-xl text-text-muted mb-5">
              <Building size={24} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Tidak ada proyek aktif</p>
              <p className="text-xs mt-1 opacity-70">Hubungi admin untuk membuat proyek</p>
            </div>
          )}

          {/* Photo Capture */}
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 block">
            Foto Grup
          </span>
          {photoPreview ? (
            <div className="relative rounded-xl overflow-hidden mb-5 border border-border-light">
              <img src={photoPreview} alt="Group photo preview" className="w-full max-h-[260px] object-cover" />
              <button
                id="remove-photo-btn"
                onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                aria-label="Hapus foto"
              >
                <X size={16} />
              </button>
              {photo && (
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-white text-[10px] font-semibold rounded-md">
                  {(photo.size / 1024).toFixed(0)} KB
                </div>
              )}
            </div>
          ) : (
            <label
              id="photo-capture-label"
              className={`flex flex-col items-center justify-center gap-3 w-full h-[190px] border-2 border-dashed rounded-xl cursor-pointer transition-colors duration-200 mb-5 ${
                compressing
                  ? 'border-primary bg-primary-bg'
                  : 'border-border hover:border-primary hover:bg-primary-bg'
              }`}
            >
              {compressing ? (
                <>
                  <Loader size={32} className="animate-spin text-primary" />
                  <span className="text-sm text-primary font-semibold">Mengompresi foto...</span>
                  <span className="text-[10px] text-primary/60">Mohon tunggu sebentar</span>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-primary-bg flex items-center justify-center">
                    <Camera size={28} className="text-primary" />
                  </div>
                  <span className="text-sm text-text-muted font-semibold">Tap untuk ambil foto grup</span>
                  <span className="text-[10px] text-text-muted/60">Kamera belakang akan terbuka otomatis</span>
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
            className={`w-full flex items-center justify-center gap-2 p-4 border-none rounded-lg text-base font-bold cursor-pointer transition-all duration-150 text-white bg-gradient-to-br from-primary to-primary-light shadow-hypr ${
              !selectedProjectId || !photo
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:-translate-y-[1px]'
            }`}
            onClick={() => setStep(2)}
            disabled={!selectedProjectId || !photo}
          >
            <span>Lanjut — Pilih Pekerja</span>
            <ChevronRight size={20} />
          </button>
        </Card>
      )}

      {/* ══════════════ STEP 2: Tag Workers ══════════════ */}
      {step === 2 && !result && (
        <Card className="mb-4 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-[42px] h-[42px] rounded-md flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-emerald-600 to-emerald-400">
              <Users size={20} />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-text-primary m-0">Pilih Pekerja Hadir</h3>
              <p className="text-xs text-text-muted m-0">{selectedProject?.nama || ''}</p>
            </div>
            <div className="px-3 py-1.5 rounded-lg text-sm font-black bg-primary-bg text-primary shrink-0">
              {selectedWorkerIds.size}/{workers.length}
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              id="worker-search-input"
              type="text"
              placeholder="Cari nama pekerja atau jabatan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-border-light bg-bg-white text-sm font-medium text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Select All Toggle */}
          <button
            id="toggle-all-workers-btn"
            onClick={toggleAll}
            className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-bg-secondary text-xs font-bold text-text-muted hover:bg-primary-bg hover:text-primary transition-colors w-full"
          >
            {selectedWorkerIds.size === filteredWorkers.length && filteredWorkers.length > 0 ? (
              <CheckSquare size={16} className="text-primary" />
            ) : (
              <Square size={16} />
            )}
            <span>
              {selectedWorkerIds.size === filteredWorkers.length && filteredWorkers.length > 0
                ? 'Batal Pilih Semua'
                : 'Pilih Semua'}
            </span>
          </button>

          {/* Worker List */}
          {loadingWorkers ? (
            <div className="p-8 text-center text-text-muted">
              <Loader size={24} className="animate-spin mx-auto mb-2" />
              <p className="text-sm">Memuat daftar pekerja...</p>
            </div>
          ) : workers.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-border-light rounded-xl text-text-muted">
              <Users size={24} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Belum ada pekerja di proyek ini</p>
              <p className="text-xs mt-1 opacity-70">Assign pekerja di halaman Project Assignments</p>
            </div>
          ) : (
            <div
              id="worker-list"
              className="flex flex-col gap-[2px] max-h-[400px] overflow-y-auto rounded-xl border border-border-light"
            >
              {filteredWorkers.map((w) => {
                const isSelected = selectedWorkerIds.has(w._id);
                return (
                  <button
                    key={w._id}
                    id={`worker-row-${w._id}`}
                    onClick={() => toggleWorker(w._id)}
                    className={`flex items-center gap-3 p-4 text-left transition-all min-h-[56px] border-b border-border-light last:border-0 ${
                      isSelected ? 'bg-emerald-50' : 'bg-bg-white hover:bg-bg-secondary'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 transition-all duration-150 ${
                      isSelected
                        ? 'bg-emerald-500 text-white'
                        : 'border-2 border-border bg-bg-white'
                    }`}>
                      {isSelected && <Check size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary m-0 truncate">{w.fullName}</p>
                      <p className="text-[11px] text-text-muted m-0 capitalize">{w.position || w.role}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-5">
            <button
              id="step2-back-btn"
              onClick={() => setStep(1)}
              className="flex-1 flex items-center justify-center gap-2 p-4 border-2 border-border rounded-lg text-sm font-bold text-text-muted hover:border-primary hover:text-primary transition-all"
            >
              <ChevronLeft size={18} />
              <span>Kembali</span>
            </button>
            <button
              id="step2-next-btn"
              className={`flex-[2] flex items-center justify-center gap-2 p-4 border-none rounded-lg text-base font-bold cursor-pointer transition-all duration-150 text-white bg-gradient-to-br from-primary to-primary-light shadow-hypr ${
                selectedWorkerIds.size === 0
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:-translate-y-[1px]'
              }`}
              onClick={() => setStep(3)}
              disabled={selectedWorkerIds.size === 0}
            >
              <span>Review ({selectedWorkerIds.size})</span>
              <ChevronRight size={18} />
            </button>
          </div>
        </Card>
      )}

      {/* ══════════════ STEP 3: Review & Submit ══════════════ */}
      {step === 3 && !result && (
        <Card className="mb-4 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-[42px] h-[42px] rounded-md flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-amber-500 to-amber-400">
              <Check size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary m-0">Review & Submit</h3>
              <p className="text-xs text-text-muted m-0">Periksa data sebelum submit</p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="space-y-3 mb-5">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary">
              <Building size={18} className="text-text-muted shrink-0" />
              <div>
                <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider m-0">Proyek</p>
                <p className="text-sm font-semibold text-text-primary m-0">{selectedProject?.nama}</p>
                {selectedProject?.lokasi && (
                  <p className="text-xs text-text-muted m-0">{selectedProject.lokasi}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary">
              <Users size={18} className="text-text-muted shrink-0" />
              <div>
                <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider m-0">Pekerja Hadir</p>
                <p className="text-sm font-semibold text-text-primary m-0">
                  <span className="text-emerald-600">{selectedWorkerIds.size}</span> dari {workers.length} pekerja
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary">
              <Clock size={18} className="text-text-muted shrink-0" />
              <div>
                <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider m-0">Waktu Submit</p>
                <p className="text-sm font-semibold text-text-primary m-0">{formatWIBTime(new Date())}</p>
              </div>
            </div>

            {photoPreview && (
              <div className="rounded-xl overflow-hidden border border-border-light">
                <img src={photoPreview} alt="Group photo" className="w-full max-h-[180px] object-cover" />
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="mb-5">
            <label htmlFor="notes-input" className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
              Catatan (Opsional)
            </label>
            <textarea
              id="notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan untuk sesi ini..."
              className="w-full p-3 rounded-xl border-2 border-border-light bg-bg-white text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary transition-colors resize-none h-20"
            />
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            <button
              id="step3-back-btn"
              onClick={() => setStep(2)}
              className="flex-1 flex items-center justify-center gap-2 p-4 border-2 border-border rounded-lg text-sm font-bold text-text-muted hover:border-primary hover:text-primary transition-all"
            >
              <ChevronLeft size={18} />
              <span>Kembali</span>
            </button>
            <button
              id="submit-attendance-btn"
              className={`flex-[2] flex items-center justify-center gap-2 p-4 border-none rounded-lg text-base font-bold cursor-pointer transition-all duration-150 text-white bg-gradient-to-br from-emerald-600 to-emerald-500 shadow-[0_4px_14px_rgba(5,150,105,0.35)] ${
                submitting ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-[1px]'
              }`}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <Loader size={22} className="animate-spin" />
              ) : (
                <>
                  <Check size={20} />
                  <span>Submit Absensi</span>
                </>
              )}
            </button>
          </div>
        </Card>
      )}

      {/* ══════════════ POST-SUBMIT: Results ══════════════ */}
      {result && (
        <>
          {/* Active Session Management Header Bar */}
          <div className="flex items-center justify-between gap-3 mb-4 p-3.5 rounded-xl bg-bg-secondary border border-border-light">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <PlayCircle size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider m-0">
                  Mengelola Sesi
                </p>
                <p className="text-xs font-bold text-text-primary m-0 truncate">
                  {selectedProject?.nama || (typeof currentActiveSession?.projectId === 'object' ? currentActiveSession.projectId?.nama : 'Proyek')}
                  {currentActiveSession?.supervisorId && (
                    <span className="text-text-muted font-normal">
                      {' '}• Oleh {typeof currentActiveSession.supervisorId === 'object' ? currentActiveSession.supervisorId.fullName : user?.fullName}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              id="back-to-sessions-btn"
              onClick={handleBackToSessions}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-text-primary bg-bg-white hover:bg-border-light border border-border-light transition-all flex items-center gap-1 shrink-0 cursor-pointer"
              title="Kembali ke daftar sesi aktif"
            >
              <ChevronLeft size={14} />
              <span>Daftar Sesi</span>
            </button>
          </div>
          {/* Result Success Card */}
          <Card className="text-center p-8 mb-4">
            <div className="w-[72px] h-[72px] bg-gradient-to-br from-emerald-600 to-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 text-white shadow-[0_4px_20px_rgba(5,150,105,0.3)]">
              <Check size={36} />
            </div>
            <h3 className="text-lg font-bold text-text-primary m-0 mb-1">Absensi Grup Berhasil!</h3>
            <p className="text-sm text-text-muted m-0 mb-1">
              <span className="font-black text-emerald-600 text-base">{result.created}</span> pekerja ditandai hadir
            </p>
            <p className="text-xs text-text-muted m-0">{selectedProject?.nama}</p>

            {result.conflicts.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-left">
                <p className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1">
                  <AlertCircle size={14} />
                  {result.conflicts.length} pekerja dilewati (sudah absen mandiri):
                </p>
                {result.conflicts.map((c) => (
                  <p key={c.workerId} className="text-xs text-amber-600 m-0 pl-4">• {c.fullName}</p>
                ))}
              </div>
            )}
          </Card>

          {/* Late Add Section */}
          <Card className="mb-4 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-[42px] h-[42px] rounded-md flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-amber-500 to-amber-400">
                <UserPlus size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-primary m-0">Tambah Pekerja Terlambat</h3>
                <p className="text-xs text-text-muted m-0">Datang setelah foto grup diambil</p>
              </div>
            </div>

            {untaggedWorkers.length > 0 ? (
              <div className="flex gap-2">
                <select
                  id="late-add-select"
                  value={lateWorkerId}
                  onChange={(e) => setLateWorkerId(e.target.value)}
                  className="flex-1 p-3 rounded-xl border-2 border-border-light bg-bg-white text-sm font-medium text-text-primary focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="">— Pilih Pekerja —</option>
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
                  className={`px-4 py-3 rounded-xl border-none text-sm font-bold text-white bg-gradient-to-br from-amber-500 to-amber-400 transition-all ${
                    !lateWorkerId || addingLate ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-[1px]'
                  }`}
                >
                  {addingLate ? <Loader size={18} className="animate-spin" /> : <UserPlus size={18} />}
                </button>
              </div>
            ) : (
              <p className="text-sm text-text-muted text-center py-3 bg-bg-secondary rounded-xl">
                ✅ Semua pekerja sudah ditandai hadir
              </p>
            )}
          </Card>

          {/* Leave Hour Section */}
          <Card className="mb-4 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-[42px] h-[42px] rounded-md flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-red-500 to-red-400">
                <LogOut size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-primary m-0">Catat Jam Pulang</h3>
                <p className="text-xs text-text-muted m-0">Pekerja pulang awal / jam keluar</p>
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
                Grup (Bulk)
              </button>
            </div>

            {leaveMode === 'individual' ? (
              <div className="space-y-3">
                <select
                  id="leave-worker-select"
                  value={leaveWorkerId}
                  onChange={(e) => setLeaveWorkerId(e.target.value)}
                  className="w-full p-3 rounded-xl border-2 border-border-light bg-bg-white text-sm font-medium text-text-primary focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="">— Pilih Pekerja —</option>
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
                    className="w-full p-3 rounded-xl border-2 border-border-light bg-bg-white text-sm font-medium text-text-primary focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="leave-reason-input" className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
                    Alasan (Opsional)
                  </label>
                  <input
                    id="leave-reason-input"
                    type="text"
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder="Contoh: Urusan keluarga"
                    className="w-full p-3 rounded-xl border-2 border-border-light bg-bg-white text-sm font-medium text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary transition-colors"
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
                    className="w-full p-3 rounded-xl border-2 border-border-light bg-bg-white text-sm font-medium text-text-primary focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="bulk-leave-reason-input" className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1 block">
                    Alasan (Opsional)
                  </label>
                  <input
                    id="bulk-leave-reason-input"
                    type="text"
                    value={bulkLeaveReason}
                    onChange={(e) => setBulkLeaveReason(e.target.value)}
                    placeholder="Contoh: Hujan deras, pulang bareng"
                    className="w-full p-3 rounded-xl border-2 border-border-light bg-bg-white text-sm font-medium text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>
            )}

            <Button
              title={recordingLeave ? 'Menyimpan...' : 'Catat Jam Pulang'}
              onClick={handleLeaveHour}
              loading={recordingLeave}
              icon={LogOut}
              fullWidth
              variant="danger"
              className="mt-4"
            />
          </Card>

          {/* Start New Session */}
          <Button
            title="Buat Sesi Absensi Baru"
            onClick={resetAll}
            icon={Camera}
            fullWidth
            variant="outline"
            className="mb-4"
          />
        </>
      )}
    </div>
  );
}
