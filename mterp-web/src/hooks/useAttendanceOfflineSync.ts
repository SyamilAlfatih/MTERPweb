import { useCallback } from 'react';
import {
  queueOfflineAttendance,
  fileToBase64,
  base64ToFile,
  cacheAttendanceProjects,
  getCachedAttendanceProjects,
  cacheProjectWorkers,
  getCachedProjectWorkers,
  cacheTodayAttendance,
  getCachedTodayAttendance,
  cacheTodaySessions,
  getCachedTodaySessions,
  addOfflineWorker,
  syncPendingAttendance,
} from '../services/attendanceSyncEngine';
import { OfflineAttendanceRecord } from '../services/attendanceOfflineDb';

export function useAttendanceOfflineSync() {
  const loadProjectsWithFallback = useCallback(async (fetchFn?: () => Promise<any[]>) => {
    if (fetchFn) {
      try {
        const data = await fetchFn();
        if (Array.isArray(data) && data.length > 0) {
          await cacheAttendanceProjects(data);
          return data;
        }
      } catch (err) {
        console.warn('[useAttendanceOfflineSync] Failed to fetch projects online, fallback to cache', err);
      }
    }
    return await getCachedAttendanceProjects();
  }, []);

  const loadTodayWithFallback = useCallback(async (userId: string, fetchFn?: () => Promise<any>) => {
    if (fetchFn) {
      try {
        const data = await fetchFn();
        if (data && userId) {
          await cacheTodayAttendance(userId, data);
          return data;
        }
      } catch (err) {
        console.warn('[useAttendanceOfflineSync] Failed to fetch today attendance online, fallback to cache', err);
      }
    }
    if (userId) {
      return await getCachedTodayAttendance(userId);
    }
    return null;
  }, []);

  const loadWorkersWithFallback = useCallback(async (projectId: string, fetchFn?: () => Promise<any[]>) => {
    if (fetchFn) {
      try {
        const data = await fetchFn();
        if (Array.isArray(data) && data.length > 0) {
          await cacheProjectWorkers(projectId, data);
          return data;
        }
      } catch (err) {
        console.warn('[useAttendanceOfflineSync] Failed to fetch project workers online, fallback to cache', err);
      }
    }
    return await getCachedProjectWorkers(projectId);
  }, []);

  const loadSessionsWithFallback = useCallback(async (fetchFn?: () => Promise<any[]>) => {
    if (fetchFn) {
      try {
        const data = await fetchFn();
        if (Array.isArray(data) && data.length > 0) {
          await cacheTodaySessions(data);
          return data;
        }
      } catch (err) {
        console.warn('[useAttendanceOfflineSync] Failed to fetch today sessions online, fallback to cache', err);
      }
    }
    return await getCachedTodaySessions();
  }, []);

  const queueAttendance = useCallback(async (
    record: Omit<OfflineAttendanceRecord, 'id' | 'syncStatus' | 'createdAt'>
  ) => {
    return await queueOfflineAttendance(record);
  }, []);

  const cacheToday = useCallback(async (userId: string, record: any) => {
    return await cacheTodayAttendance(userId, record);
  }, []);

  const cacheProjects = useCallback(async (projects: any[]) => {
    return await cacheAttendanceProjects(projects);
  }, []);

  const cacheWorkers = useCallback(async (projectId: string, workers: any[]) => {
    return await cacheProjectWorkers(projectId, workers);
  }, []);

  const cacheSessions = useCallback(async (sessions: any[]) => {
    return await cacheTodaySessions(sessions);
  }, []);

  const addWorker = useCallback(async (
    projectId: string,
    worker: { fullName: string; role?: string; position?: string }
  ) => {
    return await addOfflineWorker(projectId, worker);
  }, []);

  const convertFileToBase64 = useCallback(async (file: File) => {
    return await fileToBase64(file);
  }, []);

  const getCachedProjects = useCallback(async () => {
    return await getCachedAttendanceProjects();
  }, []);

  const getCachedWorkers = useCallback(async (projectId: string) => {
    return await getCachedProjectWorkers(projectId);
  }, []);

  const getCachedSessions = useCallback(async () => {
    return await getCachedTodaySessions();
  }, []);

  const getCachedToday = useCallback(async (userId: string) => {
    return await getCachedTodayAttendance(userId);
  }, []);

  return {
    loadProjectsWithFallback,
    loadTodayWithFallback,
    loadWorkersWithFallback,
    loadSessionsWithFallback,
    queueAttendance,
    cacheToday,
    cacheProjects,
    cacheWorkers,
    cacheSessions,
    getCachedProjects,
    getCachedWorkers,
    getCachedSessions,
    getCachedToday,
    addWorker,
    convertFileToBase64,
    fileToBase64,
    syncPending: syncPendingAttendance,
  };
}

export { fileToBase64, base64ToFile };
