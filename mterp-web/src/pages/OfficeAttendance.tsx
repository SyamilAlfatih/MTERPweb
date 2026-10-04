import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Home,
  Briefcase,
  Clock,
  Camera,
  MapPin,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  Users,
  Timer,
  ChevronRight,
  RefreshCw,
  LogOut,
  Send,
  X,
  Upload,
  Sparkles,
  ShieldCheck,
  Compass,
  Laptop,
  Check,
  ChevronDown,
  Layers,
  Info,
  CalendarOff,
  BarChart3,
  ArrowUpRight,
  ExternalLink,
  PlusCircle,
  FileCheck,
  AlertTriangle,
  ClipboardList,
  CheckSquare,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PhotoView } from 'react-photo-view';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Button, Input, Badge, Alert } from '../components/shared';
import { formatDate as formatWIBDate, formatTime as formatWIBTime, todayWIB, wibDate } from '../utils/date';
import { OfflineAttendanceBanner } from '../components/attendance/OfflineAttendanceBanner';
import { useImageCompression } from '../utils/useImageCompression';
import {
  queueOfflineAttendance,
  fileToBase64,
  cacheTodayAttendance,
  getCachedTodayAttendance,
  cacheAttendanceProjects,
  getCachedAttendanceProjects,
} from '../services/attendanceSyncEngine';

type WorkType = 'WFO' | 'WFH' | 'Dinas';
type ActiveTab = 'presence' | 'team';

interface AttendanceRecord {
  _id: string;
  date: string;
  checkIn?: { time: string; photo?: string; location?: { lat: number; lng: number }; distanceToOffice?: number; geofenceStatus?: string };
  checkOut?: { time: string; photo?: string; location?: { lat: number; lng: number }; distanceToOffice?: number; geofenceStatus?: string };
  workType?: WorkType | string;
  officeLocation?: string;
  workSummary?: string;
  notes?: string;
  status: string;
  category?: string;
  projectId?: { _id: string; nama: string; lokasi?: string };
  permit?: { reason: string; evidence?: string; permitType?: string; status: string };
  isOffline?: boolean;
}

interface OfficeStaffMember {
  user: {
    _id: string;
    fullName: string;
    username: string;
    role: string;
    position?: string;
    profileImage?: string;
    phone?: string;
    email?: string;
  };
  record: AttendanceRecord | null;
  status: string;
  workType: string;
  officeLocation: string;
  checkInTime: string | null;
  checkInPhoto?: string | null;
  checkOutTime: string | null;
  checkOutPhoto?: string | null;
  workSummary: string;
}

interface OfficeTodayResponse {
  staff: OfficeStaffMember[];
  summary: {
    totalOfficeStaff: number;
    present: number;
    wfoCount: number;
    wfhCount: number;
    dinasCount: number;
    permitCount: number;
    absentCount: number;
  };
}

export interface OfficeGeofenceConfig {
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  address: string;
}

export const HEAD_OFFICE: OfficeGeofenceConfig = {
  name: 'Head Office PT Mega Tama Enerco',
  lat: -7.175077420272807,
  lng: 107.57089981757514,
  radiusMeters: 150, // 150 meter geofence radius
  address: 'Head Office PT Mega Tama Enerco',
};

/**
 * Calculates distance in meters between two coordinates via Haversine formula
 */
export function calculateDistanceMeters(
  lat1?: number, lon1?: number,
  lat2?: number, lon2?: number
): number | null {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return null;
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Sanitizes office location names to purge legacy dummy values
 */
export function cleanOfficeLocation(loc?: string): string {
  if (!loc) return HEAD_OFFICE.name;
  if (
    loc.includes('Jakarta (HQ)') ||
    loc.includes('Kantor Pusat') ||
    loc.includes('Kantor Operasional') ||
    loc.includes('Kantor Perwakilan') ||
    loc.includes('Kantor Cabang')
  ) {
    return HEAD_OFFICE.name;
  }
  return loc;
}

const OFFICE_LOCATIONS: { [key in WorkType]: string[] } = {
  WFO: [
    HEAD_OFFICE.name,
  ],
  WFH: [
    'Remote Work (Rumah / WFH)',
    'Work From Anywhere (WFA)',
  ],
  Dinas: [
    'Kunjungan Klien / Mitra Bisnis',
    'Perjalanan Dinas Luar Kota',
    'Site Inspection / Kunjungan Proyek',
    'Meeting Instansi / Pemerintah',
  ],
};

const WORK_SUMMARY_SUGGESTIONS = [
  'Rapat Koordinasi Manajemen',
  'Review & Persetujuan Dokumen',
  'Evaluasi Anggaran & SPK Proyek',
  'Supervisi & Kunjungan Lapangan',
  'Meeting Teknis Klien / Vendor',
];

export default function OfficeAttendance() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { compress } = useImageCompression();

  // Navigation tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('presence');

  // Live Clock
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Personal Today Record
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [fetchingToday, setFetchingToday] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  // Check-in Form States
  const [workType, setWorkType] = useState<WorkType>('WFO');
  const [officeLocation, setOfficeLocation] = useState<string>(HEAD_OFFICE.name);
  const [customLocation, setCustomLocation] = useState<string>('');
  const [workNotes, setWorkNotes] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projects, setProjects] = useState<any[]>([]);

  // Check-out Form States
  const [workSummary, setWorkSummary] = useState<string>('');

  // Location / GPS
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Camera / Selfie
  const [selfiePhoto, setSelfiePhoto] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Team States
  const [teamData, setTeamData] = useState<OfficeTodayResponse | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [teamFilter, setTeamFilter] = useState<'all' | 'WFO' | 'WFH' | 'Dinas' | 'permit' | 'absent'>('all');

  // Permit Modal
  const [permitModalOpen, setPermitModalOpen] = useState(false);
  const [permitType, setPermitType] = useState<'Cuti' | 'Izin' | 'Sakit' | 'Dinas'>('Cuti');
  const [permitReason, setPermitReason] = useState('');
  const [permitFile, setPermitFile] = useState<File | null>(null);
  const [permitFilePreview, setPermitFilePreview] = useState<string | null>(null);
  const [permitSubmitting, setPermitSubmitting] = useState(false);

  // My Tasks State & Attendance Integration
  interface MyOfficeTask {
    _id: string;
    title: string;
    scope?: 'office' | 'project';
    department?: string;
    projectId?: { _id: string; nama: string };
    status: 'pending' | 'in_progress' | 'completed';
    priority: string;
    dueDate?: string;
    progress?: number;
    subtasks?: { title: string; isCompleted: boolean }[];
  }
  const [myTasks, setMyTasks] = useState<MyOfficeTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);

  // Proximity & Geofencing Calculation
  const distanceToHeadOffice = useMemo(() => {
    if (!coords) return null;
    return calculateDistanceMeters(coords.lat, coords.lng, HEAD_OFFICE.lat, HEAD_OFFICE.lng);
  }, [coords]);

  const isInsideOfficeRadius = useMemo(() => {
    if (distanceToHeadOffice === null) return null;
    return distanceToHeadOffice <= HEAD_OFFICE.radiusMeters;
  }, [distanceToHeadOffice]);

  // Toast / Alert Notification
  const [alertData, setAlertData] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'success',
    title: '',
    message: '',
  });

  // Ticking Live Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Update default location when workType changes
  useEffect(() => {
    const defaultOptions = OFFICE_LOCATIONS[workType];
    if (defaultOptions && defaultOptions.length > 0) {
      setOfficeLocation(defaultOptions[0]);
    }
  }, [workType]);

  // Initial load
  useEffect(() => {
    loadTodayAttendance();
    loadProjects();
    fetchLocation();
    loadTeamData();
    fetchMyTasks();
  }, []);

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Attach stream to video element AFTER React renders it (fixes black camera)
  useEffect(() => {
    if (isCameraActive && videoRef.current && mediaStreamRef.current) {
      const video = videoRef.current;
      video.srcObject = mediaStreamRef.current;
      video.play().catch((e) => {
        // Ignore AbortError from rapid start/stop toggles
        if (e.name !== 'AbortError') console.warn('Video play error:', e);
      });
    }
  }, [isCameraActive]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera tidak didukung pada browser ini.');
      }
      // Stop any existing stream first
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      // setIsCameraActive triggers useEffect which attaches stream to the video element
      // after React renders the <video> tag into the DOM
      setIsCameraActive(true);
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      setCameraError(err.message || 'Tidak dapat mengakses kamera. Silakan pilih opsi unggah foto.');
      setIsCameraActive(false);
    }
  };

  const captureCameraSnapshot = async () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 640;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Mirror front camera
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `selfie_${Date.now()}.jpg`, { type: 'image/jpeg' });
        try {
          const compressed = await compress(file);
          setSelfiePhoto(compressed);
          setSelfiePreview(URL.createObjectURL(compressed));
        } catch {
          setSelfiePhoto(file);
          setSelfiePreview(URL.createObjectURL(file));
        }
        stopCameraStream();
      }, 'image/jpeg', 0.85);
    } catch (err) {
      console.error('Snapshot capture error:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compress(file);
      setSelfiePhoto(compressed);
      setSelfiePreview(URL.createObjectURL(compressed));
    } catch {
      setSelfiePhoto(file);
      setSelfiePreview(URL.createObjectURL(file));
    }
    stopCameraStream();
  };

  const removePhoto = () => {
    setSelfiePhoto(null);
    setSelfiePreview(null);
    stopCameraStream();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fetchLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolokasi tidak didukung oleh browser');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      (err) => {
        console.warn('Geolocation warning:', err.message);
        setGpsError('GPS tidak aktif / izin ditolak');
        setGpsLoading(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const loadTodayAttendance = async () => {
    setFetchingToday(true);
    try {
      const res = await api.get('/attendance/today');
      if (res.data && res.data.officeLocation) {
        res.data.officeLocation = cleanOfficeLocation(res.data.officeLocation);
      }
      setTodayRecord(res.data);
      if (user?._id && res.data) {
        cacheTodayAttendance(user._id, res.data);
      }
    } catch (err) {
      console.warn('Fetch today attendance failed, fallback to cache', err);
      if (user?._id) {
        const cached = await getCachedTodayAttendance(user._id);
        if (cached) {
          if (cached.officeLocation) {
            cached.officeLocation = cleanOfficeLocation(cached.officeLocation);
          }
          setTodayRecord(cached);
        }
      }
    } finally {
      setFetchingToday(false);
    }
  };

  const loadProjects = async () => {
    try {
      const res = await api.get('/attendance/projects');
      setProjects(res.data || []);
      cacheAttendanceProjects(res.data);
    } catch {
      const cached = await getCachedAttendanceProjects();
      setProjects(cached || []);
    }
  };

  const loadTeamData = async () => {
    setLoadingTeam(true);
    try {
      const res = await api.get('/attendance/office-today');
      setTeamData(res.data);
    } catch (err) {
      console.warn('Failed to fetch team data', err);
    } finally {
      setLoadingTeam(false);
    }
  };

  const fetchMyTasks = async () => {
    setLoadingTasks(true);
    try {
      const res = await api.get('/tasks/my');
      setMyTasks(res.data || []);
    } catch (err) {
      console.warn('Failed to load my tasks', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleQuickTaskStatus = async (taskId: string, newStatus: 'pending' | 'in_progress' | 'completed') => {
    try {
      await api.put(`/tasks/${taskId}/status`, { status: newStatus });
      setMyTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t)));
    } catch (err) {
      console.error('Failed to update task status from attendance', err);
    }
  };

  const toggleTaskForCheckout = (task: MyOfficeTask) => {
    const isSelected = completedTaskIds.includes(task._id);
    let updatedIds: string[];
    if (isSelected) {
      updatedIds = completedTaskIds.filter((id) => id !== task._id);
    } else {
      updatedIds = [...completedTaskIds, task._id];
      const contextTag = (task.scope || 'project') === 'office'
        ? (task.department || 'Kantor')
        : (task.projectId?.nama || 'Proyek');
      const taskLine = `• Selesai: ${task.title} (${contextTag})`;
      setWorkSummary((prev) => (prev ? `${prev}\n${taskLine}` : taskLine));
    }
    setCompletedTaskIds(updatedIds);
  };

  // Working Duration calculation
  const workingDuration = useMemo(() => {
    if (!todayRecord?.checkIn?.time) return null;
    const startTime = new Date(todayRecord.checkIn.time).getTime();
    const endTime = todayRecord.checkOut?.time
      ? new Date(todayRecord.checkOut.time).getTime()
      : currentTime.getTime();
    const diffMs = Math.max(0, endTime - startTime);

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

    return {
      hours: String(hours).padStart(2, '0'),
      mins: String(mins).padStart(2, '0'),
      secs: String(secs).padStart(2, '0'),
      rawHours: (diffMs / (1000 * 60 * 60)).toFixed(1),
    };
  }, [todayRecord, currentTime]);

  // Check In Handler
  const handleCheckIn = async () => {
    setLoadingAction(true);
    const resolvedLocation = workType === 'WFO'
      ? HEAD_OFFICE.name
      : (officeLocation === 'Custom' || customLocation ? customLocation : officeLocation);
    const nowIso = new Date().toISOString();

    const distanceCalc = coords
      ? calculateDistanceMeters(coords.lat, coords.lng, HEAD_OFFICE.lat, HEAD_OFFICE.lng)
      : null;

    const geofenceStatus = workType === 'WFH'
      ? 'exempt_wfh'
      : workType === 'Dinas'
      ? 'exempt_dinas'
      : (distanceCalc !== null && distanceCalc <= HEAD_OFFICE.radiusMeters)
      ? 'in_radius'
      : 'out_of_range';

    // 1. Offline Mode handling
    if (!navigator.onLine) {
      try {
        let photoBase64: string | undefined;
        if (selfiePhoto) {
          photoBase64 = await fileToBase64(selfiePhoto);
        }

        const localUuid = `off_office_in_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await queueOfflineAttendance({
          localUuid,
          type: 'SELF_CHECKIN',
          userId: user?._id || '',
          userName: user?.fullName || '',
          projectId: selectedProjectId || '',
          projectName: projects.find((p) => p._id === selectedProjectId)?.nama || HEAD_OFFICE.name,
          recordedAt: nowIso,
          workType,
          officeLocation: resolvedLocation,
          distanceToOffice: distanceCalc || undefined,
          geofenceStatus,
          notes: workNotes,
          lat: coords?.lat,
          lng: coords?.lng,
          photoBase64,
        });

        const optimistic: AttendanceRecord = {
          _id: localUuid,
          date: nowIso,
          checkIn: {
            time: nowIso,
            photo: selfiePreview || undefined,
            location: coords || undefined,
            distanceToOffice: distanceCalc || undefined,
            geofenceStatus,
          },
          workType,
          officeLocation: resolvedLocation,
          notes: workNotes,
          status: 'Present',
          category: 'office',
          isOffline: true,
        };

        setTodayRecord(optimistic);
        if (user?._id) cacheTodayAttendance(user._id, optimistic);

        setAlertData({
          visible: true,
          type: 'success',
          title: 'Presensi Check-In Disimpan Offline',
          message: 'Tersimpan lokal di perangkat dan akan tersinkronisasi otomatis saat terhubung kembali.',
        });
        removePhoto();
      } catch (err: any) {
        setAlertData({
          visible: true,
          type: 'error',
          title: 'Gagal Simpan Offline',
          message: err.message || 'Terjadi kesalahan saat menyimpan presensi offline.',
        });
      } finally {
        setLoadingAction(false);
      }
      return;
    }

    // 2. Online Mode handling
    try {
      const formData = new FormData();
      formData.append('workType', workType);
      formData.append('officeLocation', resolvedLocation);
      if (workNotes) formData.append('notes', workNotes);
      if (selectedProjectId) formData.append('projectId', selectedProjectId);
      if (coords?.lat) formData.append('lat', String(coords.lat));
      if (coords?.lng) formData.append('lng', String(coords.lng));
      if (distanceCalc !== null) formData.append('distanceToOffice', String(distanceCalc));
      formData.append('geofenceStatus', geofenceStatus);
      formData.append('clientTime', nowIso);
      if (selfiePhoto) formData.append('photo', selfiePhoto);

      const res = await api.post('/attendance/checkin', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setTodayRecord(res.data);
      if (user?._id) cacheTodayAttendance(user._id, res.data);

      setAlertData({
        visible: true,
        type: 'success',
        title: 'Check-In Kantor Berhasil',
        message: `Selamat beraktivitas! Presensi ${workType} tercatat pada ${formatWIBTime(nowIso)}.`,
      });
      removePhoto();
      loadTeamData();
    } catch (err: any) {
      console.error('Check-in error:', err);
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Check-In Gagal',
        message: err.response?.data?.msg || 'Terjadi kesalahan sistem saat melakukan check-in.',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // Check Out Handler
  const handleCheckOut = async () => {
    setLoadingAction(true);
    const nowIso = new Date().toISOString();

    // 1. Offline Mode handling
    if (!navigator.onLine) {
      try {
        let photoBase64: string | undefined;
        if (selfiePhoto) {
          photoBase64 = await fileToBase64(selfiePhoto);
        }

        const localUuid = `off_office_out_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await queueOfflineAttendance({
          localUuid,
          type: 'SELF_CHECKOUT',
          userId: user?._id || '',
          userName: user?.fullName || '',
          projectId: (todayRecord?.projectId as any)?._id || '',
          recordedAt: nowIso,
          workSummary,
          lat: coords?.lat,
          lng: coords?.lng,
          photoBase64,
        });

        const updated: AttendanceRecord = {
          ...(todayRecord || {
            _id: localUuid,
            date: nowIso,
            status: 'Present',
            category: 'office',
          }),
          checkOut: {
            time: nowIso,
            photo: selfiePreview || undefined,
            location: coords || undefined,
          },
          workSummary,
          isOffline: true,
        };

        setTodayRecord(updated);
        if (user?._id) cacheTodayAttendance(user._id, updated);

        setAlertData({
          visible: true,
          type: 'success',
          title: 'Presensi Check-Out Disimpan Offline',
          message: 'Laporan capaian kerja & check-out berhasil disimpan secara lokal di perangkat.',
        });
        removePhoto();
      } catch (err: any) {
        setAlertData({
          visible: true,
          type: 'error',
          title: 'Gagal Simpan Offline',
          message: err.message || 'Terjadi kesalahan saat menyimpan checkout.',
        });
      } finally {
        setLoadingAction(false);
      }
      return;
    }

    // 2. Online Mode handling
    try {
      const formData = new FormData();
      if (workSummary) formData.append('workSummary', workSummary);
      if (coords?.lat) formData.append('lat', String(coords.lat));
      if (coords?.lng) formData.append('lng', String(coords.lng));
      formData.append('clientTime', nowIso);
      if (selfiePhoto) formData.append('photo', selfiePhoto);

      const res = await api.put('/attendance/checkout', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setTodayRecord(res.data);
      if (user?._id) cacheTodayAttendance(user._id, res.data);

      setAlertData({
        visible: true,
        type: 'success',
        title: 'Check-Out Berhasil',
        message: `Terima kasih atas kerja keras Anda hari ini! Check-out selesai pada ${formatWIBTime(nowIso)}.`,
      });
      removePhoto();
      loadTeamData();

      // Sync completed tasks if any were selected during checkout
      if (completedTaskIds.length > 0) {
        await Promise.allSettled(
          completedTaskIds.map((id) => api.put(`/tasks/${id}/status`, { status: 'completed' }))
        );
        fetchMyTasks();
      }
    } catch (err: any) {
      console.error('Check-out error:', err);
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Check-Out Gagal',
        message: err.response?.data?.msg || 'Gagal memproses check-out.',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // Submit Permit / Leave
  const handlePermitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permitReason.trim()) {
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Alasan Wajib Diisi',
        message: 'Mohon cantumkan alasan atau keterangan izin/cuti.',
      });
      return;
    }
    setPermitSubmitting(true);
    const nowIso = new Date().toISOString();

    if (!navigator.onLine) {
      try {
        let photoBase64: string | undefined;
        if (permitFile) {
          photoBase64 = await fileToBase64(permitFile);
        }
        const localUuid = `off_permit_${Date.now()}`;
        await queueOfflineAttendance({
          localUuid,
          type: 'PERMIT',
          userId: user?._id || '',
          userName: user?.fullName || '',
          projectId: '',
          recordedAt: nowIso,
          reason: permitReason,
          permitType,
          photoBase64,
        });

        const optimistic: AttendanceRecord = {
          _id: localUuid,
          date: nowIso,
          status: 'Permit',
          category: 'office',
          permit: {
            reason: permitReason,
            permitType,
            status: 'Pending',
          },
          isOffline: true,
        };
        setTodayRecord(optimistic);
        if (user?._id) cacheTodayAttendance(user._id, optimistic);

        setPermitModalOpen(false);
        setAlertData({
          visible: true,
          type: 'success',
          title: 'Pengajuan Tersimpan Offline',
          message: 'Pengajuan izin/cuti Anda tersimpan lokal dan akan dikirim saat online.',
        });
      } catch (err: any) {
        setAlertData({
          visible: true,
          type: 'error',
          title: 'Gagal Simpan',
          message: err.message || 'Gagal menyimpan pengajuan permit.',
        });
      } finally {
        setPermitSubmitting(false);
      }
      return;
    }

    try {
      const formData = new FormData();
      formData.append('reason', permitReason);
      formData.append('permitType', permitType);
      formData.append('clientTime', nowIso);
      if (permitFile) formData.append('evidence', permitFile);

      const res = await api.post('/attendance/permit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setTodayRecord(res.data);
      if (user?._id) cacheTodayAttendance(user._id, res.data);
      setPermitModalOpen(false);
      setPermitReason('');
      setPermitFile(null);
      setPermitFilePreview(null);

      setAlertData({
        visible: true,
        type: 'success',
        title: 'Pengajuan Berhasil',
        message: 'Pengajuan cuti/izin Anda telah terkirim dan menunggu persetujuan manajemen.',
      });
      loadTeamData();
    } catch (err: any) {
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Pengajuan Gagal',
        message: err.response?.data?.msg || 'Gagal mengirim pengajuan izin/cuti.',
      });
    } finally {
      setPermitSubmitting(false);
    }
  };

  const addSuggestionToSummary = (text: string) => {
    setWorkSummary((prev) => {
      const clean = prev.trim();
      if (!clean) return `• ${text}`;
      return `${clean}\n• ${text}`;
    });
  };

  // Filtered team list
  const filteredTeamStaff = useMemo(() => {
    if (!teamData?.staff) return [];
    if (teamFilter === 'all') return teamData.staff;
    if (teamFilter === 'WFO') return teamData.staff.filter((s) => s.workType === 'WFO' && s.checkInTime);
    if (teamFilter === 'WFH') return teamData.staff.filter((s) => s.workType === 'WFH' && s.checkInTime);
    if (teamFilter === 'Dinas') return teamData.staff.filter((s) => s.workType === 'Dinas' && s.checkInTime);
    if (teamFilter === 'permit') return teamData.staff.filter((s) => s.status === 'Permit');
    if (teamFilter === 'absent') return teamData.staff.filter((s) => !s.checkInTime && s.status !== 'Permit');
    return teamData.staff;
  }, [teamData, teamFilter]);

  const hasCheckedIn = Boolean(todayRecord?.checkIn?.time);
  const hasCheckedOut = Boolean(todayRecord?.checkOut?.time);
  const isPermit = todayRecord?.status === 'Permit';

  const userRoleBadge = user?.role?.replace(/_/g, ' ').toUpperCase() || 'OFFICE STAFF';

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Offline Sync Status Banner */}
      <OfflineAttendanceBanner />

      {/* Global Notification Alert */}
      {alertData.visible && (
        <Alert
          visible={alertData.visible}
          type={alertData.type}
          title={alertData.title}
          message={alertData.message}
          onClose={() => setAlertData((prev) => ({ ...prev, visible: false }))}
        />
      )}

      {/* ── Executive Header Command Center ─────────────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-indigo-900/40 bg-gradient-to-br from-[#0a1226] via-[#101f4a] to-[#1e3a8a] text-white p-6 sm:p-8">
        {/* Subtle ambient grid and atmospheric glow */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center font-black text-sm shadow-inner text-white">
                {user?.fullName?.charAt(0)?.toUpperCase() || 'M'}
              </div>
              <Badge
                label={userRoleBadge}
                variant="neutral"
                size="small"
                className="!bg-white/15 !border-white/25 !text-white font-bold tracking-wider"
              />
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-400/20 border border-indigo-300/30 text-indigo-200 text-xs font-semibold">
                <ShieldCheck size={13} className="text-indigo-300" />
                <span>Executive & Office Presence</span>
              </div>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white m-0 leading-tight">
                Presensi Kantor & Manajemen
              </h1>
              <p className="text-white/75 text-sm sm:text-base font-medium mt-1 m-0 flex items-center gap-2">
                <Building2 size={16} className="text-indigo-300 shrink-0" />
                <span>
                  {user?.fullName} &bull; {user?.position || 'Head Office Management'}
                </span>
              </p>
            </div>
          </div>

          {/* Right: Live Digital Clock & Real-time Status Capsule */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-between gap-3 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 shadow-inner shrink-0">
            <div className="text-left lg:text-right">
              <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-200/90 block">
                Waktu Indonesia Barat (WIB)
              </span>
              <div className="text-2xl sm:text-3xl font-black tracking-tight font-mono text-white tabular-nums">
                {currentTime.toLocaleTimeString('id-ID', {
                  timeZone: 'Asia/Jakarta',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })}
              </div>
              <div className="text-xs text-indigo-100/80 font-medium">
                {formatWIBDate(currentTime, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasCheckedOut ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-400/40">
                  <CheckCircle2 size={13} />
                  <span>Selesai Bekerja</span>
                </span>
              ) : hasCheckedIn ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/25 text-amber-300 border border-amber-400/40 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Sedang Bekerja</span>
                </span>
              ) : isPermit ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/25 text-purple-300 border border-purple-400/40">
                  <FileText size={13} />
                  <span>Izin / Cuti</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-500/25 text-slate-300 border border-slate-400/40">
                  <Clock size={13} />
                  <span>Belum Check-In</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Top Navigation & Dedicated Portals Bar ──────────────────────── */}
        <div className="relative z-10 mt-6 pt-5 border-t border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Main Presence & Team Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('presence')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${activeTab === 'presence'
                ? 'bg-white text-indigo-950 shadow-md'
                : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
            >
              <Clock size={15} />
              <span>Presensi Saya</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('team');
                loadTeamData();
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${activeTab === 'team'
                ? 'bg-white text-indigo-950 shadow-md'
                : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
            >
              <Users size={15} />
              <span>Kehadiran Tim Kantor</span>
              {teamData?.summary && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/30 text-white">
                  {teamData.summary.present}/{teamData.summary.totalOfficeStaff}
                </span>
              )}
            </button>
          </div>

          {/* Dedicated Gateways to Dedicated Logs & Recap Pages */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
            <button
              type="button"
              onClick={() => navigate('/attendance-logs')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all cursor-pointer shadow-xs group"
              title="Buka Halaman Dedikasi Log Presensi & Foto Bukti"
            >
              <FileText size={14} className="text-cyan-300 group-hover:scale-110 transition-transform" />
              <span>Log Presensi</span>
              <ArrowUpRight size={13} className="text-white/70 group-hover:text-white" />
            </button>

            <button
              type="button"
              onClick={() => navigate('/attendance-recap')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all cursor-pointer shadow-xs group"
              title="Buka Halaman Dedikasi Rekapitulasi Kehadiran"
            >
              <BarChart3 size={14} className="text-emerald-300 group-hover:scale-110 transition-transform" />
              <span>Rekap Kehadiran</span>
              <ArrowUpRight size={13} className="text-white/70 group-hover:text-white" />
            </button>

            <button
              type="button"
              onClick={() => setPermitModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-500/25 hover:bg-purple-500/40 border border-purple-300/30 transition-all cursor-pointer shadow-xs"
            >
              <CalendarOff size={14} className="text-purple-300" />
              <span>Ajukan Izin / Cuti</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── TAB 1: PRESENSI SAYA (MY PRESENCE) ────────────────────────────── */}
      {activeTab === 'presence' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Attendance Console (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Active Working Shift Banner if Checked In */}
            {hasCheckedIn && !hasCheckedOut && (
              <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden border border-emerald-400/30">
                <div className="absolute -right-10 -bottom-10 w-52 h-52 rounded-full bg-white/15 blur-2xl pointer-events-none" />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-100">
                        Shift Kerja Aktif
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-white/20 text-white">
                        {todayRecord?.workType || 'WFO'}
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black m-0 tracking-tight">
                      Anda sedang bertugas aktif hari ini
                    </h2>
                    <p className="text-emerald-100/90 text-xs sm:text-sm m-0 flex items-center gap-2">
                      <span>
                        Waktu Check-In:{' '}
                        <strong className="text-white font-mono">
                          {todayRecord?.checkIn?.time ? formatWIBTime(todayRecord.checkIn.time) : '-'} WIB
                        </strong>
                      </span>
                      <span>&bull;</span>
                      <span className="truncate max-w-[200px]">
                        📍 {cleanOfficeLocation(todayRecord?.officeLocation)}
                      </span>
                    </p>
                  </div>

                  {/* Real-time Stopwatch Counter */}
                  <div className="bg-black/25 backdrop-blur-md px-6 py-3.5 rounded-2xl border border-white/25 text-center shrink-0 shadow-inner">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-200 block">
                      Durasi Kerja Aktif
                    </span>
                    <div className="text-2xl sm:text-3xl font-black font-mono tracking-wider tabular-nums text-white my-0.5">
                      {workingDuration?.hours}:{workingDuration?.mins}:{workingDuration?.secs}
                    </div>
                    <span className="text-[11px] text-emerald-100/80 font-medium">Jam : Menit : Detik</span>
                  </div>
                </div>
              </div>
            )}

            {/* Check-Out Completed Banner */}
            {hasCheckedOut && (
              <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 rounded-3xl p-6 text-white shadow-xl space-y-4 border border-indigo-400/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={22} className="text-emerald-400 shrink-0" />
                    <div>
                      <h3 className="text-lg sm:text-xl font-black m-0 tracking-tight">Presensi Hari Ini Selesai</h3>
                      <p className="text-xs text-blue-200 m-0">Shift kerja Anda telah berhasil di-check out.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/attendance-logs')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-all cursor-pointer border border-white/20 shadow-xs"
                  >
                    <span>Buka di Log Presensi</span>
                    <ArrowUpRight size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div className="bg-white/10 p-3 rounded-xl border border-white/10">
                    <span className="text-[10px] uppercase font-bold text-blue-200 block">Mode Kerja</span>
                    <span className="text-sm font-black text-white">{todayRecord?.workType || 'WFO'}</span>
                  </div>
                  <div className="bg-white/10 p-3 rounded-xl border border-white/10">
                    <span className="text-[10px] uppercase font-bold text-blue-200 block">Check-In</span>
                    <span className="text-sm font-black text-white font-mono">
                      {todayRecord?.checkIn?.time ? formatWIBTime(todayRecord.checkIn.time) : '-'} WIB
                    </span>
                  </div>
                  <div className="bg-white/10 p-3 rounded-xl border border-white/10">
                    <span className="text-[10px] uppercase font-bold text-blue-200 block">Check-Out</span>
                    <span className="text-sm font-black text-white font-mono">
                      {todayRecord?.checkOut?.time ? formatWIBTime(todayRecord.checkOut.time) : '-'} WIB
                    </span>
                  </div>
                  <div className="bg-white/10 p-3 rounded-xl border border-white/10">
                    <span className="text-[10px] uppercase font-bold text-blue-200 block">Total Durasi</span>
                    <span className="text-sm font-black text-white font-mono">{workingDuration?.rawHours || 0} Jam</span>
                  </div>
                </div>

                {todayRecord?.workSummary && (
                  <div className="bg-white/10 p-4 rounded-xl border border-white/15 text-xs space-y-1">
                    <span className="font-bold text-blue-200 block uppercase tracking-wider text-[10px]">
                      Catatan Capaian Kerja Harian:
                    </span>
                    <p className="m-0 text-white/95 leading-relaxed whitespace-pre-wrap font-sans">
                      {todayRecord.workSummary}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Today's Tasks & Assignments Widget ─────────────────── */}
            <Card className="p-5 sm:p-6 space-y-4 shadow-sm border-border-light bg-bg-white">
              <div className="flex items-center justify-between pb-3 border-b border-border-light">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <ClipboardList size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary m-0">Tugas Hari Ini (Today's Worklist)</h3>
                    <p className="text-xs text-text-muted m-0">Daftar penugasan operasional kantor dan proyek aktif Anda</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/tasks')}
                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Buka Pusat Tugas</span>
                  <ArrowUpRight size={13} />
                </button>
              </div>

              {loadingTasks ? (
                <div className="p-4 text-center text-xs text-text-muted flex items-center justify-center gap-2">
                  <RefreshCw size={13} className="animate-spin text-primary" />
                  <span>Memuat tugas harian Anda...</span>
                </div>
              ) : myTasks.length === 0 ? (
                <div className="p-4 text-center text-xs text-text-muted bg-bg-secondary/40 rounded-xl border border-dashed border-border-light">
                  <span>Tidak ada tugas tertunda yang ditugaskan hari ini. Kerja bagus!</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {myTasks.map((t) => (
                    <div
                      key={t._id}
                      className="flex items-center justify-between p-3 rounded-xl border border-border-light bg-bg-secondary/30 hover:bg-slate-50 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleQuickTaskStatus(t._id, t.status === 'in_progress' ? 'completed' : 'in_progress')}
                          className={`w-6 h-6 rounded-md border flex items-center justify-center cursor-pointer transition-colors ${
                            t.status === 'in_progress'
                              ? 'bg-amber-100 border-amber-400 text-amber-700'
                              : 'bg-white border-border-medium text-slate-400 hover:border-primary'
                          }`}
                          title={t.status === 'in_progress' ? 'Klik untuk tandai selesai' : 'Klik untuk mulai kerjakan'}
                        >
                          {t.status === 'in_progress' ? <Clock size={12} /> : <Check size={12} />}
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-text-primary truncate">{t.title}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              (t.scope || 'project') === 'office'
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {(t.scope || 'project') === 'office' ? `Kantor: ${t.department || 'General'}` : (t.projectId?.nama || 'Proyek')}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                              t.priority === 'urgent' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {t.priority}
                            </span>
                          </div>
                          {t.subtasks && t.subtasks.length > 0 && (
                            <div className="text-[11px] text-text-muted mt-0.5">
                              Subtugas: {t.subtasks.filter(s => s.isCompleted).length}/{t.subtasks.length}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          t.status === 'in_progress'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {t.status === 'in_progress' ? 'Sedang Dikerjakan' : 'Tertunda'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* CHECK-IN FORM (When not checked in and not permit) */}
            {!hasCheckedIn && !isPermit && (
              <Card className="p-6 sm:p-8 space-y-6 shadow-md border-border-light bg-bg-white">
                <div className="border-b border-border-light pb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-text-primary m-0 flex items-center gap-2">
                      <Building2 size={20} className="text-primary" />
                      <span>Check-In Presensi Kantor</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-text-muted mt-1 m-0">
                      Pilih moda kehadiran, lokasi kantor / tugas dinas, dan lakukan verifikasi kehadiran.
                    </p>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                    <Sparkles size={13} />
                    <span>Fleksibel & Presisi</span>
                  </span>
                </div>

                {/* 1. Work Mode Selector Cards */}
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                    1. Pilih Moda Kehadiran (Work Mode)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {/* WFO Option */}
                    <button
                      type="button"
                      onClick={() => setWorkType('WFO')}
                      className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${workType === 'WFO'
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-sm ring-2 ring-emerald-500/20'
                        : 'border-border-light hover:border-emerald-500/40 bg-bg-white'
                        }`}
                    >
                      <div className="flex items-center justify-between w-full mb-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${workType === 'WFO' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-bg-secondary text-text-muted'
                            }`}
                        >
                          <Building2 size={20} />
                        </div>
                        {workType === 'WFO' && <CheckCircle2 size={18} className="text-emerald-600" />}
                      </div>
                      <div>
                        <span className="font-black text-sm text-text-primary block">WFO (Office)</span>
                        <span className="text-[11px] text-text-muted leading-tight block mt-0.5">
                          {HEAD_OFFICE.name}
                        </span>
                      </div>
                    </button>

                    {/* WFH Option */}
                    <button
                      type="button"
                      onClick={() => setWorkType('WFH')}
                      className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${workType === 'WFH'
                        ? 'border-blue-600 bg-blue-50/50 shadow-sm ring-2 ring-blue-500/20'
                        : 'border-border-light hover:border-blue-500/40 bg-bg-white'
                        }`}
                    >
                      <div className="flex items-center justify-between w-full mb-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${workType === 'WFH' ? 'bg-blue-600 text-white shadow-sm' : 'bg-bg-secondary text-text-muted'
                            }`}
                        >
                          <Home size={20} />
                        </div>
                        {workType === 'WFH' && <CheckCircle2 size={18} className="text-blue-600" />}
                      </div>
                      <div>
                        <span className="font-black text-sm text-text-primary block">WFH (Remote)</span>
                        <span className="text-[11px] text-text-muted leading-tight block mt-0.5">
                          Bekerja dari Rumah / WFA
                        </span>
                      </div>
                    </button>

                    {/* Dinas Luar Option */}
                    <button
                      type="button"
                      onClick={() => setWorkType('Dinas')}
                      className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${workType === 'Dinas'
                        ? 'border-amber-600 bg-amber-50/50 shadow-sm ring-2 ring-amber-500/20'
                        : 'border-border-light hover:border-amber-500/40 bg-bg-white'
                        }`}
                    >
                      <div className="flex items-center justify-between w-full mb-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${workType === 'Dinas' ? 'bg-amber-600 text-white shadow-sm' : 'bg-bg-secondary text-text-muted'
                            }`}
                        >
                          <Briefcase size={20} />
                        </div>
                        {workType === 'Dinas' && <CheckCircle2 size={18} className="text-amber-600" />}
                      </div>
                      <div>
                        <span className="font-black text-sm text-text-primary block">Dinas Luar</span>
                        <span className="text-[11px] text-text-muted leading-tight block mt-0.5">
                          Meeting Klien / Luar Kota
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* 2. Location Selection */}
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                    {workType === 'WFO' ? '2. Lokasi Kantor Pusat' : '2. Lokasi / Penugasan'}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      {workType === 'WFO' ? (
                        <div className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-emerald-50/60 border border-emerald-200/80 text-emerald-950 font-bold flex items-center gap-2">
                          <Building2 size={16} className="text-emerald-700 shrink-0" />
                          <span className="truncate">{HEAD_OFFICE.name}</span>
                        </div>
                      ) : (
                        <select
                          value={officeLocation}
                          onChange={(e) => setOfficeLocation(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-bg-secondary/40 border border-border-light focus:outline-hidden focus:border-primary text-text-primary font-medium"
                        >
                          {OFFICE_LOCATIONS[workType].map((loc) => (
                            <option key={loc} value={loc}>
                              {loc}
                            </option>
                          ))}
                          <option value="Custom">+ Masukkan Lokasi Lainnya...</option>
                        </select>
                      )}
                    </div>

                    {/* Optional Project Attachment */}
                    <div>
                      <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-bg-secondary/40 border border-border-light focus:outline-hidden focus:border-primary text-text-primary font-medium"
                      >
                        <option value="">(Opsional) Tautkan ke Proyek Tertentu</option>
                        {projects.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.nama}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {workType !== 'WFO' && officeLocation === 'Custom' && (
                    <input
                      type="text"
                      value={customLocation}
                      onChange={(e) => setCustomLocation(e.target.value)}
                      placeholder="Tuliskan nama lokasi / tujuan tugas dinas..."
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-bg-secondary/40 border border-border-light focus:outline-hidden focus:border-primary text-text-primary"
                    />
                  )}
                </div>

                {/* 3. Selfie Photo Verification (Camera or File) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-text-muted">
                      3. Verifikasi Foto Selfie Wajib
                    </label>
                    {selfiePreview && (
                      <button
                        type="button"
                        onClick={removePhoto}
                        className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <X size={14} />
                        <span>Hapus Foto</span>
                      </button>
                    )}
                  </div>

                  {/* Active Camera View */}
                  {isCameraActive ? (
                    <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-h-72 flex items-center justify-center border-2 border-primary shadow-lg">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-3 px-4">
                        <button
                          type="button"
                          onClick={captureCameraSnapshot}
                          className="px-5 py-2.5 rounded-full bg-primary hover:bg-primary-light text-white text-xs font-black flex items-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer"
                        >
                          <Camera size={16} />
                          <span>Ambil Gambar (Snapshot)</span>
                        </button>
                        <button
                          type="button"
                          onClick={stopCameraStream}
                          className="px-4 py-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : selfiePreview ? (
                    /* Photo Preview */
                    <div className="relative rounded-2xl overflow-hidden border border-border-light p-2 bg-bg-secondary/30 flex items-center gap-4">
                      <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 border border-border-medium bg-slate-900">
                        <PhotoView src={selfiePreview}>
                          <img
                            src={selfiePreview}
                            alt="Selfie Check-in"
                            className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                          />
                        </PhotoView>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 size={14} /> Foto Selfie Terlampir
                        </span>
                        <p className="text-xs text-text-muted m-0">
                          Foto siap dikirim sebagai bukti kehadiran eksekutif.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            removePhoto();
                            startCamera();
                          }}
                          className="text-xs text-primary font-bold hover:underline cursor-pointer"
                        >
                          Ambil Ulang
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Camera Action Buttons */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="flex items-center justify-center gap-2.5 p-4 rounded-2xl border-2 border-dashed border-border-medium hover:border-primary hover:bg-primary/5 transition-all text-text-secondary hover:text-primary font-bold text-xs sm:text-sm cursor-pointer"
                      >
                        <Camera size={18} className="text-primary" />
                        <span>Buka Kamera (Webcam)</span>
                      </button>

                      <label className="flex items-center justify-center gap-2.5 p-4 rounded-2xl border-2 border-dashed border-border-medium hover:border-primary hover:bg-primary/5 transition-all text-text-secondary hover:text-primary font-bold text-xs sm:text-sm cursor-pointer">
                        <Upload size={18} className="text-primary" />
                        <span>Pilih File dari Galeri</span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}

                  {cameraError && (
                    <p className="text-xs text-amber-600 m-0 flex items-center gap-1.5 font-medium">
                      <AlertCircle size={14} /> {cameraError}
                    </p>
                  )}
                </div>

                {/* 4. Daily Agenda / Work Plan Notes */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                    4. Agenda & Rencana Kerja Hari Ini (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={workNotes}
                    onChange={(e) => setWorkNotes(e.target.value)}
                    placeholder="Contoh: Rapat evaluasi manajemen Q3, koordinasi vendor, review dokumen tender..."
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-bg-secondary/40 border border-border-light focus:outline-hidden focus:border-primary text-text-primary placeholder:text-text-muted/60"
                  />
                </div>

                {/* 5. Smart Geofence Verification Radar Widget */}
                <div className="rounded-2xl border border-border-light bg-bg-secondary/40 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        workType === 'WFO'
                          ? (isInsideOfficeRadius ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-amber-100 text-amber-700 border-amber-300')
                          : workType === 'WFH'
                          ? 'bg-blue-100 text-blue-700 border-blue-300'
                          : 'bg-purple-100 text-purple-700 border-purple-300'
                      }`}>
                        <MapPin size={18} />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-text-primary block">
                          Verifikasi Radius Geofence (GeoJSON)
                        </span>
                        <span className="text-[11px] text-text-muted block">
                          Titik Kantor: <strong>{HEAD_OFFICE.name}</strong> (Radius: {HEAD_OFFICE.radiusMeters}m)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <a
                        href={`https://www.google.com/maps?q=${HEAD_OFFICE.lat},${HEAD_OFFICE.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 bg-bg-white px-2.5 py-1 rounded-lg border border-border-light"
                        title="Buka titik koordinat kantor di Google Maps"
                      >
                        <ExternalLink size={12} />
                        <span>Peta Kantor</span>
                      </a>
                      <button
                        type="button"
                        onClick={fetchLocation}
                        disabled={gpsLoading}
                        className="text-[11px] font-bold text-text-primary bg-bg-white hover:bg-border-light px-2.5 py-1 rounded-lg border border-border-light flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <RefreshCw size={11} className={gpsLoading ? 'animate-spin' : ''} />
                        <span>GPS Ulang</span>
                      </button>
                    </div>
                  </div>

                  {/* Geofence Status Pill & Proximity Details */}
                  {gpsLoading ? (
                    <div className="p-3 bg-bg-white rounded-xl border border-border-light flex items-center gap-2.5 text-xs text-text-muted">
                      <RefreshCw size={14} className="animate-spin text-primary" />
                      <span>Mendeteksi koordinat GPS dan menghitung radius kantor...</span>
                    </div>
                  ) : coords ? (
                    <div className="space-y-2">
                      {workType === 'WFO' ? (
                        isInsideOfficeRadius ? (
                          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2.5">
                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5 text-xs">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-emerald-800">
                                  Terverifikasi di Lokasi Kantor (Dalam Radius)
                                </span>
                                <span className="px-2 py-0.2 rounded-full text-[10px] font-black bg-emerald-200 text-emerald-900 border border-emerald-300">
                                  {distanceToHeadOffice} m dari Head Office
                                </span>
                              </div>
                              <p className="text-[11px] text-emerald-700 m-0">
                                Posisi GPS Anda valid di dalam area {HEAD_OFFICE.name} (maksimal {HEAD_OFFICE.radiusMeters} meter).
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                            <div className="flex items-center gap-2 text-xs flex-wrap">
                              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                              <span className="font-bold text-amber-800">
                                Peringatan: Di Luar Radius Kantor (Out-of-Range)
                              </span>
                              <span className="px-2 py-0.2 rounded-full text-[10px] font-black bg-amber-200 text-amber-900 border border-amber-300">
                                {distanceToHeadOffice !== null && distanceToHeadOffice > 1000
                                  ? `${(distanceToHeadOffice / 1000).toFixed(2)} km dari HQ`
                                  : `${distanceToHeadOffice} m dari HQ`}
                              </span>
                            </div>
                            <p className="text-[11px] text-amber-800 m-0 leading-relaxed">
                              Anda terdeteksi di luar batas radius {HEAD_OFFICE.radiusMeters}m. Sesuai <strong>Kebijakan Fleksibel (Soft Policy)</strong>, Anda tetap dapat melakukan check-in, dan presensi akan ditandai sebagai <strong>Out-of-Range</strong> untuk peninjauan HR/Manajemen. Mohon pastikan rencana kerja diisi pada catatan.
                            </p>
                          </div>
                        )
                      ) : workType === 'WFH' ? (
                        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center gap-2.5 text-xs">
                          <Home size={15} className="text-blue-600 shrink-0" />
                          <div>
                            <span className="font-bold text-blue-800">Moda WFH (Remote Work) Aktif</span>
                            <p className="text-[11px] text-blue-700 m-0">
                              Batas kantor dibebaskan. Titik GPS ({coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}) tersimpan untuk audit lokasi kerja remote.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 flex items-center gap-2.5 text-xs">
                          <Briefcase size={15} className="text-purple-600 shrink-0" />
                          <div>
                            <span className="font-bold text-purple-800">Moda Perjalanan Dinas Luar Aktif</span>
                            <p className="text-[11px] text-purple-700 m-0">
                              Batas kantor dibebaskan. Titik GPS tersimpan sebagai bukti verifikasi kunjungan dinas/klien.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* GPS Readout Coordinates */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-text-muted px-1 gap-1">
                        <span className="font-mono">
                          GPS Terdeteksi: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                        </span>
                        <span className="font-mono text-text-muted/80">
                          Target HQ: {HEAD_OFFICE.lat.toFixed(6)}, {HEAD_OFFICE.lng.toFixed(6)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-bg-white border border-border-light text-xs text-text-muted flex items-center justify-between">
                      <span>{gpsError || 'Koordinat GPS belum terdeteksi. Silakan klik tombol perbarui GPS.'}</span>
                      <button
                        type="button"
                        onClick={fetchLocation}
                        className="text-xs text-primary font-bold hover:underline cursor-pointer"
                      >
                        Deteksi GPS
                      </button>
                    </div>
                  )}
                </div>

                {/* Submit Check-In Button */}
                <Button
                  type="button"
                  title={
                    workType === 'WFO' && isInsideOfficeRadius === false
                      ? 'Konfirmasi Check-In WFO (Catat Out-of-Range)'
                      : `Konfirmasi Check-In (${workType})`
                  }
                  variant={workType === 'WFO' && isInsideOfficeRadius === false ? 'outline' : 'primary'}
                  size="large"
                  onClick={handleCheckIn}
                  loading={loadingAction}
                  disabled={loadingAction}
                  icon={Check}
                  className="w-full !rounded-2xl !py-3.5 font-black text-sm shadow-md"
                />
              </Card>
            )}

            {/* CHECK-OUT SECTION (When checked in and not yet checked out) */}
            {hasCheckedIn && !hasCheckedOut && (
              <Card className="p-6 sm:p-8 space-y-6 shadow-md border-border-light bg-bg-white">
                <div className="border-b border-border-light pb-4">
                  <h2 className="text-lg sm:text-xl font-black text-text-primary m-0 flex items-center gap-2">
                    <LogOut size={20} className="text-amber-500" />
                    <span>Check-Out & Laporan Capaian Kerja</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-text-muted mt-1 m-0">
                    Selesaikan shift kerja Anda hari ini. Ringkasan capaian kerja harian akan dicatat ke dalam log
                    produktivitas dan dapat dilihat di halaman <strong>Log Presensi</strong>.
                  </p>
                </div>

                {/* Task Completion Checklist for Check-Out */}
                {myTasks.length > 0 && (
                  <div className="p-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                        <CheckSquare size={15} className="text-indigo-600" />
                        Pilih Tugas yang Diselesaikan Hari Ini (Otomatis Masuk Laporan):
                      </span>
                      <span className="text-[11px] text-indigo-700 font-bold font-mono">
                        {completedTaskIds.length} dipilih
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {myTasks.map((t) => (
                        <label
                          key={t._id}
                          className="flex items-center gap-2.5 p-2 rounded-xl bg-white border border-border-light hover:border-indigo-300 transition-colors cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={completedTaskIds.includes(t._id)}
                            onChange={() => toggleTaskForCheckout(t)}
                            className="rounded border-border-medium text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <span className="font-semibold text-text-primary flex-1 truncate">{t.title}</span>
                          <span className="text-[10px] font-bold text-text-muted px-1.5 py-0.5 rounded bg-bg-secondary">
                            {(t.scope || 'project') === 'office' ? (t.department || 'Kantor') : (t.projectId?.nama || 'Proyek')}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Work Summary Textarea with Assistant Chips */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                      Ringkasan Hasil Kerja / Capaian Harian (Work Summary)
                    </label>
                    <span className="text-[11px] text-text-muted">Klik chip untuk memasukkan poin:</span>
                  </div>

                  {/* Suggestion Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pb-1">
                    {WORK_SUMMARY_SUGGESTIONS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => addSuggestionToSummary(item)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-bg-secondary hover:bg-primary/10 text-text-secondary hover:text-primary border border-border-light transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                      >
                        <PlusCircle size={12} />
                        <span>{item}</span>
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={4}
                    value={workSummary}
                    onChange={(e) => setWorkSummary(e.target.value)}
                    placeholder="Tuliskan poin-poin capaian kerja hari ini. Contoh:&#10;• Menyelesaikan evaluasi laporan keuangan&#10;• Rapat koordinasi direksi mengenai target timeline&#10;• Menandatangani SPK vendor material"
                    className="w-full px-4 py-3 rounded-2xl text-sm bg-bg-secondary/40 border border-border-light focus:outline-hidden focus:border-primary text-text-primary placeholder:text-text-muted/60 leading-relaxed font-sans"
                  />
                </div>

                {/* Optional Check-out Selfie */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-text-muted">
                      Foto Selfie Check-Out (Opsional)
                    </label>
                    {selfiePreview && (
                      <button
                        type="button"
                        onClick={removePhoto}
                        className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <X size={14} />
                        <span>Hapus Foto</span>
                      </button>
                    )}
                  </div>

                  {isCameraActive ? (
                    <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-h-72 flex items-center justify-center border-2 border-primary shadow-lg">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-3 px-4">
                        <button
                          type="button"
                          onClick={captureCameraSnapshot}
                          className="px-5 py-2.5 rounded-full bg-primary hover:bg-primary-light text-white text-xs font-black flex items-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer"
                        >
                          <Camera size={16} />
                          <span>Ambil Gambar (Snapshot)</span>
                        </button>
                        <button
                          type="button"
                          onClick={stopCameraStream}
                          className="px-4 py-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : selfiePreview ? (
                    <div className="relative rounded-2xl overflow-hidden border border-border-light p-2 bg-bg-secondary/30 flex items-center gap-4">
                      <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 border border-border-medium bg-slate-900">
                        <PhotoView src={selfiePreview}>
                          <img
                            src={selfiePreview}
                            alt="Selfie Check-out"
                            className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                          />
                        </PhotoView>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 size={14} /> Foto Selfie Check-Out Siap
                        </span>
                        <p className="text-xs text-text-muted m-0">Foto akan dilampirkan pada catatan check-out.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-border-medium hover:border-primary text-text-secondary hover:text-primary font-bold text-xs cursor-pointer"
                      >
                        <Camera size={16} />
                        <span>Kamera (Snapshot)</span>
                      </button>
                      <label className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-border-medium hover:border-primary text-text-secondary hover:text-primary font-bold text-xs cursor-pointer">
                        <Upload size={16} />
                        <span>Unggah Foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Submit Check-Out Button */}
                <Button
                  type="button"
                  title="Konfirmasi Check-Out Sekarang"
                  variant="primary"
                  size="large"
                  onClick={handleCheckOut}
                  loading={loadingAction}
                  disabled={loadingAction}
                  icon={LogOut}
                  className="w-full !rounded-2xl !py-3.5 font-black text-sm shadow-md !bg-amber-600 hover:!bg-amber-700"
                />
              </Card>
            )}
          </div>

          {/* Right Sidebar: Dedicated Gateways & Team Pulse (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Identity Profile Card */}
            <Card className="p-5 space-y-4 shadow-sm border-border-light bg-bg-white">
              <div className="flex items-start gap-3.5">
                <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-indigo-700 to-primary text-white flex items-center justify-center font-black text-lg shadow-md shrink-0">
                  {user?.fullName?.charAt(0)?.toUpperCase() || 'M'}
                </div>
                <div className="space-y-0.5 overflow-hidden">
                  <h3 className="text-base font-black text-text-primary m-0 truncate">
                    {user?.fullName || 'Office Staff'}
                  </h3>
                  <p className="text-xs text-text-muted m-0 truncate">@{user?.username}</p>
                  <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                    {userRoleBadge}
                  </span>
                </div>
              </div>

              <div className="border-t border-border-light pt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between text-text-secondary">
                  <span>Jabatan / Posisi</span>
                  <span className="font-bold text-text-primary">{user?.position || 'Management'}</span>
                </div>
                <div className="flex items-center justify-between text-text-secondary">
                  <span>Unit Kerja</span>
                  <span className="font-bold text-text-primary">{HEAD_OFFICE.name}</span>
                </div>
                <div className="flex items-center justify-between text-text-secondary">
                  <span>Status Hari Ini</span>
                  <span className="font-bold text-text-primary">
                    {hasCheckedOut
                      ? 'Sudah Pulang'
                      : hasCheckedIn
                        ? 'Aktif Bertugas'
                        : isPermit
                          ? 'Izin / Cuti'
                          : 'Belum Hadir'}
                  </span>
                </div>
              </div>
            </Card>

            {/* ════════ DEDICATED RECAP & LOGS GATEWAYS ════════ */}
            <div className="space-y-3">
              <span className="text-[11px] font-black uppercase tracking-widest text-text-muted block px-1">
                Portal Rekapitulasi & Log Presensi
              </span>

              {/* Portal 1: Dedicated Attendance Logs */}
              <div
                onClick={() => navigate('/attendance-logs')}
                className="group p-4 bg-bg-white rounded-2xl border border-border-light hover:border-cyan-500/50 shadow-xs hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <FileText size={20} />
                  </div>
                  <div className="w-7 h-7 rounded-full bg-bg-secondary group-hover:bg-cyan-50 flex items-center justify-center text-text-muted group-hover:text-cyan-600 transition-colors">
                    <ArrowUpRight size={15} />
                  </div>
                </div>
                <div className="mt-3">
                  <h4 className="text-sm font-black text-text-primary m-0 group-hover:text-cyan-600 transition-colors">
                    Buka Log Presensi Detail
                  </h4>
                  <p className="text-xs text-text-muted m-0 mt-0.5 leading-relaxed">
                    Lihat catatan harian, verifikasi foto bukti check-in/out, dan filter histori kehadiran lengkap.
                  </p>
                </div>
              </div>

              {/* Portal 2: Dedicated Attendance Recap */}
              <div
                onClick={() => navigate('/attendance-recap')}
                className="group p-4 bg-bg-white rounded-2xl border border-border-light hover:border-emerald-500/50 shadow-xs hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <BarChart3 size={20} />
                  </div>
                  <div className="w-7 h-7 rounded-full bg-bg-secondary group-hover:bg-emerald-50 flex items-center justify-center text-text-muted group-hover:text-emerald-600 transition-colors">
                    <ArrowUpRight size={15} />
                  </div>
                </div>
                <div className="mt-3">
                  <h4 className="text-sm font-black text-text-primary m-0 group-hover:text-emerald-600 transition-colors">
                    Buka Rekapitulasi Tim
                  </h4>
                  <p className="text-xs text-text-muted m-0 mt-0.5 leading-relaxed">
                    Tabel matriks kehadiran bulanan, total akumulasi jam kerja manajemen, dan persentase kehadiran tim.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Link to Team Presence */}
            <Card
              className="p-5 border-border-light hover:border-primary/40 shadow-xs hover:shadow-md transition-all cursor-pointer group bg-gradient-to-br from-bg-white to-indigo-50/20"
              onClick={() => setActiveTab('team')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Users size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-text-primary m-0">
                      Kehadiran Rekan Kantor
                    </h4>
                    <p className="text-xs text-text-muted m-0">
                      {teamData?.summary ? `${teamData.summary.present} dari ${teamData.summary.totalOfficeStaff} hadir hari ini` : 'Lihat status WFO / WFH tim'}
                    </p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-text-muted group-hover:text-primary transition-colors" />
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── TAB 2: KEHADIRAN TIM KANTOR (OFFICE TEAM PRESENCE) ──────────── */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <div className="p-4 rounded-2xl bg-bg-white border border-border-light shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-text-muted block">
                Total Staf Kantor
              </span>
              <span className="text-2xl font-black text-text-primary block mt-1">
                {teamData?.summary.totalOfficeStaff || 0}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-bg-white border border-border-light shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">
                Hadir Hari Ini
              </span>
              <span className="text-2xl font-black text-emerald-600 block mt-1">
                {teamData?.summary.present || 0}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-bg-white border border-border-light shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-primary block">WFO (Kantor)</span>
              <span className="text-2xl font-black text-primary block mt-1">
                {teamData?.summary.wfoCount || 0}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-bg-white border border-border-light shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">WFH (Remote)</span>
              <span className="text-2xl font-black text-blue-600 block mt-1">
                {teamData?.summary.wfhCount || 0}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-bg-white border border-border-light shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 block">Dinas Luar</span>
              <span className="text-2xl font-black text-amber-600 block mt-1">
                {teamData?.summary.dinasCount || 0}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-bg-white border border-border-light shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 block">Izin / Cuti</span>
              <span className="text-2xl font-black text-purple-600 block mt-1">
                {teamData?.summary.permitCount || 0}
              </span>
            </div>
          </div>

          {/* Filter Pills & Refresh */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
              {[
                { id: 'all', label: 'Semua Staf' },
                { id: 'WFO', label: 'WFO (Kantor)' },
                { id: 'WFH', label: 'WFH (Remote)' },
                { id: 'Dinas', label: 'Dinas Luar' },
                { id: 'permit', label: 'Cuti / Izin' },
                { id: 'absent', label: 'Belum Hadir' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setTeamFilter(pill.id as any)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer border ${teamFilter === pill.id
                    ? 'bg-primary text-white border-primary shadow-xs'
                    : 'bg-bg-white text-text-secondary border-border-light hover:bg-bg-secondary'
                    }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadTeamData}
                disabled={loadingTeam}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-text-secondary hover:text-primary bg-bg-white border border-border-light cursor-pointer shadow-xs"
              >
                <RefreshCw size={13} className={loadingTeam ? 'animate-spin' : ''} />
                <span>Muat Ulang</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/attendance-recap')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-primary hover:text-primary-light bg-primary/10 border border-primary/20 cursor-pointer shadow-xs"
              >
                <BarChart3 size={13} />
                <span>Lihat Rekap Lengkap</span>
              </button>
            </div>
          </div>

          {/* Staff Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTeamStaff.map((item) => {
              const isPresent = Boolean(item.checkInTime);
              return (
                <div
                  key={item.user._id}
                  className="bg-bg-white rounded-2xl border border-border-light p-4 shadow-xs space-y-3 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-700 to-primary text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                        {item.user.fullName?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                      <div className="overflow-hidden">
                        <h4 className="text-sm font-black text-text-primary m-0 truncate">
                          {item.user.fullName}
                        </h4>
                        <p className="text-xs text-text-muted m-0 truncate">
                          {item.user.position || item.user.role.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>

                    {isPresent ? (
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${item.workType === 'WFO'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : item.workType === 'WFH'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                      >
                        {item.workType}
                      </span>
                    ) : item.status === 'Permit' ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                        Izin / Cuti
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                        Belum Hadir
                      </span>
                    )}
                  </div>

                  {isPresent ? (
                    <div className="p-2.5 rounded-xl bg-bg-secondary/40 border border-border-light/60 space-y-1 text-xs">
                      <div className="flex items-center justify-between text-text-secondary">
                        <span>Check-In:</span>
                        <span className="font-bold text-text-primary font-mono">
                          {formatWIBTime(item.checkInTime!)} WIB
                        </span>
                      </div>
                      {item.checkOutTime && (
                        <div className="flex items-center justify-between text-text-secondary">
                          <span>Check-Out:</span>
                          <span className="font-bold text-text-primary font-mono">
                            {formatWIBTime(item.checkOutTime)} WIB
                          </span>
                        </div>
                      )}
                      {item.officeLocation && (
                        <div className="text-[11px] text-text-muted truncate pt-1">
                          📍 {cleanOfficeLocation(item.officeLocation)}
                        </div>
                      )}
                      {item.workSummary && (
                        <div className="text-[11px] text-indigo-700 bg-indigo-50/60 p-1.5 rounded mt-1 line-clamp-2">
                          📋 {item.workSummary}
                        </div>
                      )}
                    </div>
                  ) : item.status === 'Permit' ? (
                    <div className="p-2.5 rounded-xl bg-purple-50/50 border border-purple-100 text-xs text-purple-800">
                      <span className="font-bold block mb-0.5">Keterangan Izin / Cuti:</span>
                      <p className="m-0 line-clamp-2">{item.record?.permit?.reason || 'Pengajuan Izin'}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {filteredTeamStaff.length === 0 && (
            <div className="text-center py-12 bg-bg-white rounded-3xl border border-dashed border-border-medium space-y-2">
              <Users size={32} className="mx-auto text-text-muted opacity-50" />
              <h4 className="text-sm font-bold text-text-primary m-0">Tidak ada staf kantor pada filter ini</h4>
              <p className="text-xs text-text-muted m-0">Silakan pilih kategori filter lain.</p>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: AJUKAN IZIN / CUTI (LEAVE / PERMIT REQUEST) ──────────── */}
      {permitModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-border-light animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border-light pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  <CalendarOff size={20} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-text-primary m-0">
                    Pengajuan Izin / Cuti Kantor
                  </h3>
                  <p className="text-xs text-text-muted m-0">Kirim pengajuan ke HR & direksi manajemen</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPermitModalOpen(false)}
                className="p-1 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-secondary cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePermitSubmit} className="space-y-4">
              {/* Jenis Izin */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                  Kategori Pengajuan
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
                  {(['Cuti', 'Izin', 'Sakit', 'Dinas'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setPermitType(type)}
                      className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer ${permitType === type
                        ? 'border-purple-600 bg-purple-50 text-purple-700 shadow-2xs'
                        : 'border-border-light bg-bg-secondary/40 text-text-secondary hover:bg-bg-secondary'
                        }`}
                    >
                      {type === 'Cuti'
                        ? 'Cuti Tahunan'
                        : type === 'Izin'
                          ? 'Izin Pribadi'
                          : type === 'Sakit'
                            ? 'Sakit'
                            : 'Dinas Luar'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alasan */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                  Alasan / Keterangan
                </label>
                <textarea
                  rows={3}
                  required
                  value={permitReason}
                  onChange={(e) => setPermitReason(e.target.value)}
                  placeholder="Jelaskan keperluan izin atau cuti Anda..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-bg-secondary/40 border border-border-light focus:outline-hidden focus:border-purple-600 text-text-primary placeholder:text-text-muted/60"
                />
              </div>

              {/* Bukti / Dokumen */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-text-muted block">
                  Bukti / Dokumen Pendukung (Opsional)
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setPermitFile(f);
                      if (f.type.startsWith('image/')) {
                        setPermitFilePreview(URL.createObjectURL(f));
                      }
                    }
                  }}
                  className="w-full text-xs text-text-secondary file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-light">
                <button
                  type="button"
                  onClick={() => setPermitModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-text-secondary hover:bg-bg-secondary cursor-pointer"
                >
                  Batal
                </button>
                <Button
                  type="submit"
                  title="Kirim Pengajuan"
                  variant="primary"
                  size="medium"
                  loading={permitSubmitting}
                  disabled={permitSubmitting}
                  className="!rounded-xl font-bold !bg-purple-600 hover:!bg-purple-700"
                />
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
