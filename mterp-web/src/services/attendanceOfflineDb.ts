import Dexie, { Table } from 'dexie';

export type OfflineAttendanceType =
  | 'SELF_CHECKIN'
  | 'SELF_CHECKOUT'
  | 'PERMIT'
  | 'GROUP_SESSION'
  | 'SESSION_LATE_ADD'
  | 'SESSION_LEAVE_HOUR'
  | 'SESSION_CLOSE';

export interface OfflineAttendanceRecord {
  id?: number;
  localUuid: string;
  type: OfflineAttendanceType;
  userId: string;
  userName?: string;
  projectId: string;
  projectName?: string;
  recordedAt: string; // ISO string when user performed the action
  lat?: number;
  lng?: number;
  photoBase64?: string; // photo base64 data url for selfie, evidence, or group photo
  workerIds?: string[]; // for GROUP_SESSION
  workerNames?: string[]; // for GROUP_SESSION display
  notes?: string;
  workType?: string; // 'WFO' | 'WFH' | 'Dinas' | 'Project'
  officeLocation?: string;
  workSummary?: string; // Daily activity summary on check-out
  permitType?: string; // 'Cuti' | 'Izin' | 'Sakit' | 'Dinas Luar'
  reason?: string; // for PERMIT, LEAVE_HOUR, CLOSE
  leaveHour?: string; // for LEAVE_HOUR, CLOSE (HH:mm)
  targetSessionId?: string; // for LATE_ADD, LEAVE_HOUR, CLOSE (Mongo ID or localUuid)
  targetWorkerId?: string; // for LATE_ADD, LEAVE_HOUR
  targetWorkerName?: string;
  syncStatus: 'PENDING' | 'SYNCING' | 'SYNCED' | 'ERROR';
  errorMessage?: string;
  createdAt: string;
}

export interface CachedAttendanceProject {
  _id: string;
  nama: string;
  lokasi?: string;
  status?: string;
  updatedAt: string;
}

export interface CachedProjectWorker {
  id?: number;
  projectId: string;
  _id: string;
  fullName: string;
  role: string;
  position?: string;
}

export interface CachedTodayAttendance {
  userId: string;
  date: string;
  record: any;
  updatedAt: string;
}

export interface CachedTodaySession {
  _id: string; // Mongo ID or localUuid
  projectId: string;
  date: string;
  session: any;
  updatedAt: string;
}

export class AttendanceOfflineDB extends Dexie {
  offlineAttendance!: Table<OfflineAttendanceRecord>;
  cachedProjects!: Table<CachedAttendanceProject, string>;
  cachedWorkers!: Table<CachedProjectWorker, number>;
  cachedTodayAttendance!: Table<CachedTodayAttendance, string>;
  cachedTodaySessions!: Table<CachedTodaySession, string>;

  constructor() {
    super('AttendanceOfflineDB');
    this.version(1).stores({
      offlineAttendance: '++id, localUuid, type, userId, projectId, syncStatus, createdAt',
      cachedProjects: '_id, nama, status, updatedAt',
      cachedWorkers: '++id, projectId, _id, fullName',
      cachedTodayAttendance: 'userId, date, updatedAt',
      cachedTodaySessions: '_id, projectId, date, updatedAt',
    });
  }
}

export const attendanceOfflineDb = new AttendanceOfflineDB();
