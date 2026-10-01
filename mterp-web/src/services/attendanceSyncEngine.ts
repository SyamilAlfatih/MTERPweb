import api from '../api/api';
import {
  attendanceOfflineDb,
  OfflineAttendanceRecord,
  OfflineAttendanceType,
  CachedAttendanceProject,
  CachedProjectWorker,
} from './attendanceOfflineDb';

export interface AttendanceSyncResult {
  synced: number;
  failed: number;
  errors: Array<{ localUuid: string; type: OfflineAttendanceType; error: string }>;
}

let isSyncing = false;

/**
 * Converts a browser File object to a Base64 string for IndexedDB storage.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

/**
 * Converts a Base64 data URL to a standard browser File object for multipart upload.
 */
export function base64ToFile(base64Data: string, fileName: string): File {
  const parts = base64Data.split(';base64,');
  const contentType = parts[0].replace('data:', '') || 'image/jpeg';
  const byteString = atob(parts[1] || parts[0]);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }

  return new File([uint8Array], fileName, { type: contentType });
}

/**
 * Queues an attendance action into IndexedDB for offline persistence.
 */
export async function queueOfflineAttendance(
  record: Omit<OfflineAttendanceRecord, 'id' | 'syncStatus' | 'createdAt'>
): Promise<OfflineAttendanceRecord> {
  const newRecord: OfflineAttendanceRecord = {
    ...record,
    syncStatus: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  const id = await attendanceOfflineDb.offlineAttendance.add(newRecord);
  const savedRecord = { ...newRecord, id };

  window.dispatchEvent(new CustomEvent('attendance:queue-updated', { detail: { record: savedRecord } }));

  // If online, attempt background sync immediately
  if (navigator.onLine && !isSyncing) {
    syncPendingAttendance().catch(err => {
      console.error('[AttendanceSync] Immediate sync attempt failed:', err);
    });
  }

  return savedRecord;
}

/**
 * Synchronizes all pending and errored offline attendance records to the server.
 */
export async function syncPendingAttendance(): Promise<AttendanceSyncResult> {
  if (isSyncing || !navigator.onLine) {
    return { synced: 0, failed: 0, errors: [] };
  }

  isSyncing = true;
  const result: AttendanceSyncResult = { synced: 0, failed: 0, errors: [] };
  const sessionMap = new Map<string, string>(); // Maps offline localUuid to server Mongo _id

  try {
    const pendingRecords = await attendanceOfflineDb.offlineAttendance
      .where('syncStatus')
      .anyOf(['PENDING', 'ERROR'])
      .sortBy('id');

    if (pendingRecords.length === 0) {
      isSyncing = false;
      return result;
    }

    console.log(`[AttendanceSync] Found ${pendingRecords.length} offline attendance records to sync.`);

    for (const record of pendingRecords) {
      if (!record.id) continue;

      try {
        await attendanceOfflineDb.offlineAttendance.update(record.id, { syncStatus: 'SYNCING' });

        switch (record.type) {
          case 'SELF_CHECKIN': {
            const payload: any = {
              projectId: record.projectId || undefined,
              workType: record.workType || undefined,
              officeLocation: record.officeLocation || undefined,
              notes: record.notes || undefined,
              lat: record.lat,
              lng: record.lng,
              clientTime: record.recordedAt,
            };
            if (record.photoBase64) {
              const formData = new FormData();
              const file = base64ToFile(
                record.photoBase64,
                `selfie_checkin_${record.localUuid}.jpg`
              );
              formData.append('photo', file);
              Object.entries(payload).forEach(([k, v]) => {
                if (v !== undefined) formData.append(k, String(v));
              });
              await api.post('/attendance/checkin', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
            } else {
              await api.post('/attendance/checkin', payload);
            }
            break;
          }

          case 'SELF_CHECKOUT': {
            const formData = new FormData();
            if (record.photoBase64) {
              const file = base64ToFile(
                record.photoBase64,
                `selfie_checkout_${record.localUuid}.jpg`
              );
              formData.append('photo', file);
            }
            if (record.lat) formData.append('lat', String(record.lat));
            if (record.lng) formData.append('lng', String(record.lng));
            if (record.workSummary) formData.append('workSummary', record.workSummary);
            if (record.notes) formData.append('notes', record.notes);
            formData.append('clientTime', record.recordedAt);

            await api.put('/attendance/checkout', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            break;
          }

          case 'PERMIT': {
            const formData = new FormData();
            if (record.photoBase64) {
              const file = base64ToFile(
                record.photoBase64,
                `permit_evidence_${record.localUuid}.jpg`
              );
              formData.append('evidence', file);
            }
            formData.append('reason', record.reason || 'Izin');
            if (record.permitType) formData.append('permitType', record.permitType);
            formData.append('clientTime', record.recordedAt);

            await api.post('/attendance/permit', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            break;
          }

          case 'GROUP_SESSION': {
            const formData = new FormData();
            if (record.photoBase64) {
              const file = base64ToFile(
                record.photoBase64,
                `group_session_${record.localUuid}.jpg`
              );
              formData.append('groupPhoto', file);
            }
            formData.append('projectId', record.projectId);
            formData.append('workerIds', JSON.stringify(record.workerIds || []));
            if (record.notes) formData.append('notes', record.notes);
            formData.append('clientTime', record.recordedAt);

            const res = await api.post('/attendance-session', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (res.data?.session?._id) {
              sessionMap.set(record.localUuid, res.data.session._id);
            }
            break;
          }

          case 'SESSION_LATE_ADD': {
            const targetId = record.targetSessionId
              ? (sessionMap.get(record.targetSessionId) || record.targetSessionId)
              : '';
            if (!targetId) throw new Error('Target session ID missing for late add');

            await api.post(`/attendance-session/${targetId}/late-add`, {
              workerId: record.targetWorkerId,
              clientTime: record.recordedAt,
            });
            break;
          }

          case 'SESSION_LEAVE_HOUR': {
            const targetId = record.targetSessionId
              ? (sessionMap.get(record.targetSessionId) || record.targetSessionId)
              : '';
            if (!targetId) throw new Error('Target session ID missing for leave hour');

            await api.post(`/attendance-session/${targetId}/leave-hour`, {
              workers: [
                {
                  workerId: record.targetWorkerId,
                  leaveHour: record.leaveHour,
                  reason: record.reason || '',
                },
              ],
              clientTime: record.recordedAt,
            });
            break;
          }

          case 'SESSION_CLOSE': {
            const targetId = record.targetSessionId
              ? (sessionMap.get(record.targetSessionId) || record.targetSessionId)
              : '';
            if (!targetId) throw new Error('Target session ID missing for session close');

            await api.post(`/attendance-session/${targetId}/close`, {
              defaultLeaveHour: record.leaveHour,
              reason: record.reason || 'Sesi ditutup offline',
              clientTime: record.recordedAt,
            });
            break;
          }

          default:
            throw new Error(`Unknown offline attendance type: ${(record as any).type}`);
        }

        // Mark as SYNCED
        await attendanceOfflineDb.offlineAttendance.update(record.id, {
          syncStatus: 'SYNCED',
          errorMessage: undefined,
        });
        result.synced += 1;
      } catch (err: any) {
        console.error(`[AttendanceSync] Error syncing record ${record.localUuid}:`, err);
        const errorText = err.response?.data?.msg || err.message || 'Sync failed';

        // Treat "Already checked in today" or "Already checked out today" as success to clear idempotent queue
        if (
          errorText.toLowerCase().includes('already checked in') ||
          errorText.toLowerCase().includes('already checked out')
        ) {
          await attendanceOfflineDb.offlineAttendance.update(record.id, {
            syncStatus: 'SYNCED',
            errorMessage: undefined,
          });
          result.synced += 1;
        } else {
          await attendanceOfflineDb.offlineAttendance.update(record.id, {
            syncStatus: 'ERROR',
            errorMessage: errorText,
          });
          result.failed += 1;
          result.errors.push({
            localUuid: record.localUuid,
            type: record.type,
            error: errorText,
          });
        }
      }
    }

    window.dispatchEvent(
      new CustomEvent('attendance:sync-completed', {
        detail: { synced: result.synced, failed: result.failed, errors: result.errors },
      })
    );
    window.dispatchEvent(new CustomEvent('attendance:queue-updated', { detail: {} }));
  } catch (fatalErr) {
    console.error('[AttendanceSync] Fatal error during synchronization:', fatalErr);
  } finally {
    isSyncing = false;
  }

  return result;
}

/**
 * Initializes automatic background synchronization on network reconnect.
 */
export function initAttendanceSyncListeners(): () => void {
  const handleOnline = () => {
    console.log('[AttendanceSync] Network restored. Syncing offline attendance & warming master data...');
    syncPendingAttendance();
    syncAttendanceMasterData();
  };

  window.addEventListener('online', handleOnline);

  if (navigator.onLine && localStorage.getItem('userToken')) {
    syncPendingAttendance();
    syncAttendanceMasterData();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
  };
}

// ── Cache Helpers ────────────────────────────────────────────────────────────

/**
 * Best practice: Pre-sync and warm offline cache with canonical master data
 * from MongoDB whenever online. Ensures projects & all assigned workers are ready
 * before going into offline dead-zones.
 */
export async function syncAttendanceMasterData(): Promise<{ projects: number; workers: number }> {
  if (!navigator.onLine) {
    return { projects: 0, workers: 0 };
  }

  let projectsCount = 0;
  let workersCount = 0;

  try {
    // 1. Fetch all active projects with populated assignedTo workers
    const projRes = await api.get('/attendance/projects', { timeout: 8000 });
    if (Array.isArray(projRes.data) && projRes.data.length > 0) {
      await cacheAttendanceProjects(projRes.data);
      projectsCount = projRes.data.length;
    }

    // 2. Fetch master company-wide field workers pool
    const workersRes = await api.get('/attendance/workers', { timeout: 8000 });
    if (Array.isArray(workersRes.data) && workersRes.data.length > 0) {
      await cacheProjectWorkers('__master__', workersRes.data);
      workersCount = workersRes.data.length;
    }

    localStorage.setItem('attendance_master_synced_at', new Date().toISOString());
    console.log(`[AttendanceSync] Master data warmed: ${projectsCount} projects, ${workersCount} master workers.`);
  } catch (err) {
    console.warn('[AttendanceSync] Background master data sync failed or partial', err);
  }

  return { projects: projectsCount, workers: workersCount };
}

export async function cacheAttendanceProjects(projects: any[]): Promise<void> {
  try {
    const list: CachedAttendanceProject[] = projects.map(p => ({
      _id: p._id,
      nama: p.nama,
      lokasi: p.lokasi,
      status: p.status,
      updatedAt: new Date().toISOString(),
    }));
    await attendanceOfflineDb.cachedProjects.bulkPut(list);

    // Automatically cache assigned workers for each project
    for (const p of projects) {
      if (Array.isArray(p.assignedTo) && p.assignedTo.length > 0) {
        await cacheProjectWorkers(p._id, p.assignedTo);
      }
    }
  } catch (err) {
    console.error('[AttendanceSync] Failed to cache projects', err);
  }
}

export async function getCachedAttendanceProjects(): Promise<CachedAttendanceProject[]> {
  try {
    return await attendanceOfflineDb.cachedProjects.toArray();
  } catch (err) {
    console.error('[AttendanceSync] Failed to get cached projects', err);
    return [];
  }
}

export async function cacheProjectWorkers(projectId: string, workers: any[]): Promise<void> {
  try {
    if (!workers || workers.length === 0) return;

    // Clear previous cached workers for this project
    await attendanceOfflineDb.cachedWorkers.where('projectId').equals(projectId).delete();

    const list: CachedProjectWorker[] = workers.map(w => ({
      projectId,
      _id: w._id ? String(w._id) : '',
      fullName: w.fullName || 'Unknown',
      role: w.role || 'worker',
      position: w.position || w.role || 'worker',
    })).filter(w => w._id);

    if (list.length > 0) {
      await attendanceOfflineDb.cachedWorkers.bulkAdd(list);
    }
  } catch (err) {
    console.error('[AttendanceSync] Failed to cache project workers', err);
  }
}

export async function getCachedProjectWorkers(projectId: string): Promise<CachedProjectWorker[]> {
  try {
    // 1. Direct match by projectId
    if (projectId) {
      const forProject = await attendanceOfflineDb.cachedWorkers.where('projectId').equals(projectId).toArray();
      if (forProject.length > 0) {
        return forProject;
      }
    }

    // 2. Check master company-wide workers pool
    const master = await attendanceOfflineDb.cachedWorkers.where('projectId').equals('__master__').toArray();
    if (master.length > 0) {
      return master;
    }

    // 3. Fallback: Return all unique workers cached in Dexie across all projects
    const all = await attendanceOfflineDb.cachedWorkers.toArray();
    const seen = new Set<string>();
    const unique: CachedProjectWorker[] = [];
    for (const w of all) {
      if (w._id && !seen.has(String(w._id))) {
        seen.add(String(w._id));
        unique.push(w);
      }
    }
    if (unique.length > 0) {
      return unique;
    }

    // 4. Fallback: Extract from cachedTodaySessions
    const todaySessions = await attendanceOfflineDb.cachedTodaySessions.toArray();
    const sessionWorkers: CachedProjectWorker[] = [];
    for (const item of todaySessions) {
      const s = item.session;
      if (!s) continue;
      const workerList = [
        ...(s.workerIds || []),
        ...(s.lateWorkerIds || []).map((lw: any) => lw?.workerId || lw),
      ];
      for (const w of workerList) {
        if (typeof w === 'object' && w?._id && !seen.has(String(w._id))) {
          seen.add(String(w._id));
          sessionWorkers.push({
            projectId: projectId || s.projectId || '__master__',
            _id: String(w._id),
            fullName: w.fullName || 'Worker',
            role: w.role || 'worker',
            position: w.position || w.role || 'worker',
          });
        }
      }
    }

    return sessionWorkers;
  } catch (err) {
    console.error('[AttendanceSync] Failed to get cached project workers', err);
    return [];
  }
}

export async function addOfflineWorker(
  projectId: string,
  worker: { fullName: string; role?: string; position?: string }
): Promise<CachedProjectWorker> {
  const newWorker: CachedProjectWorker = {
    projectId: projectId || '__all__',
    _id: `offline_worker_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fullName: worker.fullName.trim(),
    role: worker.role || 'worker',
    position: worker.position || worker.role || 'worker',
  };

  try {
    await attendanceOfflineDb.cachedWorkers.add(newWorker);
  } catch (err) {
    console.error('[AttendanceSync] Failed to add offline worker', err);
  }
  return newWorker;
}

export async function cacheTodayAttendance(userId: string, record: any): Promise<void> {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    await attendanceOfflineDb.cachedTodayAttendance.put({
      userId,
      date: today,
      record,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[AttendanceSync] Failed to cache today attendance', err);
  }
}

export async function getCachedTodayAttendance(userId: string): Promise<any | null> {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const cached = await attendanceOfflineDb.cachedTodayAttendance.get(userId);
    if (cached && cached.date === today) {
      return cached.record;
    }
    return null;
  } catch (err) {
    console.error('[AttendanceSync] Failed to get cached today attendance', err);
    return null;
  }
}

export async function cacheTodaySessions(sessions: any[]): Promise<void> {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const list = sessions.map(s => ({
      _id: s._id,
      projectId: typeof s.projectId === 'string' ? s.projectId : s.projectId?._id,
      date: today,
      session: s,
      updatedAt: new Date().toISOString(),
    }));
    await attendanceOfflineDb.cachedTodaySessions.bulkPut(list);
  } catch (err) {
    console.error('[AttendanceSync] Failed to cache today sessions', err);
  }
}

export async function getCachedTodaySessions(): Promise<any[]> {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const cached = await attendanceOfflineDb.cachedTodaySessions.where('date').equals(today).toArray();
    return cached.map(c => c.session);
  } catch (err) {
    console.error('[AttendanceSync] Failed to get cached today sessions', err);
    return [];
  }
}

export async function getPendingAttendanceCount(): Promise<number> {
  try {
    return await attendanceOfflineDb.offlineAttendance
      .where('syncStatus')
      .anyOf(['PENDING', 'ERROR'])
      .count();
  } catch (err) {
    return 0;
  }
}

export async function getAllOfflineAttendanceRecords(): Promise<OfflineAttendanceRecord[]> {
  try {
    return await attendanceOfflineDb.offlineAttendance.orderBy('id').reverse().toArray();
  } catch (err) {
    return [];
  }
}

export async function deleteOfflineAttendanceRecord(id: number): Promise<void> {
  await attendanceOfflineDb.offlineAttendance.delete(id);
  window.dispatchEvent(new CustomEvent('attendance:queue-updated', { detail: {} }));
}

export async function retryOfflineAttendanceRecord(id: number): Promise<void> {
  await attendanceOfflineDb.offlineAttendance.update(id, { syncStatus: 'PENDING', errorMessage: undefined });
  window.dispatchEvent(new CustomEvent('attendance:queue-updated', { detail: {} }));
  if (navigator.onLine) {
    syncPendingAttendance();
  }
}
