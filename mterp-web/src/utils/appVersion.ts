import { invalidateApiCache } from '../api/client';

export interface CommitEntry {
  fullHash: string;
  hash: string;
  message: string;
  date: string;
  author: string;
  category?: string;
  categoryLabel?: string;
  moduleLabel?: string;
  humanTitle?: string;
  humanDescription?: string;
  highlights?: string[];
}

export interface LatestReleaseSummary {
  title: string;
  description: string;
  category: string;
  categoryLabel: string;
  moduleLabel: string;
  highlights: string[];
  date: string;
  dateLabel: string;
}

export interface ReleaseGroup {
  dateKey: string;
  dateLabel: string;
  items: CommitEntry[];
}

export interface ServerVersionInfo {
  version: string;
  humanVersionLabel?: string;
  commitHash: string;
  fullCommitHash: string;
  branch: string;
  commitDate: string;
  commitMessage: string;
  commitAuthor: string;
  latestRelease?: LatestReleaseSummary | null;
  serverStartedAt: string;
  checkedAt: string;
  enforceUpdate: boolean;
  releases?: ReleaseGroup[];
  changelog: CommitEntry[];
}

export interface FrontendVersionJson {
  version: string;
  commitHash: string;
  fullCommitHash: string;
  branch: string;
  commitDate: string;
  commitMessage: string;
  buildTime: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  reason: 'commit_mismatch' | 'build_mismatch' | 'sw_update' | null;
  targetCommit: string;
  targetVersion: string;
  targetMessage: string;
  targetDate: string;
  apiVersion: ServerVersionInfo | null;
  staticVersion: FrontendVersionJson | null;
}

export const CLIENT_BUILD_INFO = {
  version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
  commitHash: typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'unknown',
  fullCommitHash: typeof __APP_COMMIT_FULL__ !== 'undefined' ? __APP_COMMIT_FULL__ : 'unknown',
  commitDate: typeof __APP_COMMIT_DATE__ !== 'undefined' ? __APP_COMMIT_DATE__ : '',
  commitMessage: typeof __APP_COMMIT_MESSAGE__ !== 'undefined' ? __APP_COMMIT_MESSAGE__ : '',
  branch: typeof __APP_BRANCH__ !== 'undefined' ? __APP_BRANCH__ : 'main',
  buildTime: typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '',
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const ATTEMPTED_UPDATE_KEY = 'mterp_attempted_update_state';
const UPDATE_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes cooldown if reload loaded same build

interface AttemptedUpdateState {
  targetCommit: string;
  targetBuildTime: string;
  attemptedAt: number;
}

export function getAttemptedUpdateState(): AttemptedUpdateState | null {
  try {
    const raw = localStorage.getItem(ATTEMPTED_UPDATE_KEY) || sessionStorage.getItem(ATTEMPTED_UPDATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AttemptedUpdateState>;
    if (!parsed || typeof parsed.attemptedAt !== 'number') return null;
    if (Date.now() - parsed.attemptedAt > UPDATE_COOLDOWN_MS) {
      clearAttemptedUpdateCommit();
      return null;
    }
    return {
      targetCommit: parsed.targetCommit || '',
      targetBuildTime: parsed.targetBuildTime || '',
      attemptedAt: parsed.attemptedAt,
    };
  } catch {
    return null;
  }
}

export function getAttemptedUpdateCommit(): string | null {
  return getAttemptedUpdateState()?.targetCommit || null;
}

export function isUpdateInCooldown(targetCommit: string, targetBuildTime = ''): boolean {
  const state = getAttemptedUpdateState();
  if (!state) return false;
  if (targetBuildTime && state.targetBuildTime) {
    return state.targetCommit === targetCommit && state.targetBuildTime === targetBuildTime;
  }
  return Boolean(targetCommit && state.targetCommit === targetCommit);
}

export function clearAttemptedUpdateCommit(): void {
  try {
    localStorage.removeItem(ATTEMPTED_UPDATE_KEY);
    sessionStorage.removeItem(ATTEMPTED_UPDATE_KEY);
  } catch {
    // ignore storage restrictions
  }
}

export async function fetchVersionMetadata(): Promise<{
  apiVersion: ServerVersionInfo | null;
  staticVersion: FrontendVersionJson | null;
}> {
  const bust = `t=${Date.now()}`;

  const [apiRes, staticRes] = await Promise.allSettled([
    fetch(`${API_URL}/version?${bust}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    }),
    fetch(`/version.json?${bust}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    }),
  ]);

  let apiVersion: ServerVersionInfo | null = null;
  if (apiRes.status === 'fulfilled' && apiRes.value.ok) {
    try {
      apiVersion = (await apiRes.value.json()) as ServerVersionInfo;
    } catch {
      apiVersion = null;
    }
  }

  let staticVersion: FrontendVersionJson | null = null;
  if (staticRes.status === 'fulfilled' && staticRes.value.ok) {
    try {
      const contentType = staticRes.value.headers.get('content-type') || '';
      if (!contentType || contentType.includes('application/json') || contentType.includes('text/plain')) {
        const parsed = (await staticRes.value.json()) as Partial<FrontendVersionJson>;
        if (parsed && typeof parsed.commitHash === 'string' && typeof parsed.buildTime === 'string') {
          staticVersion = parsed as FrontendVersionJson;
        }
      }
    } catch {
      staticVersion = null;
    }
  }

  return { apiVersion, staticVersion };
}

export function evaluateUpdateStatus(
  apiVersion: ServerVersionInfo | null,
  staticVersion: FrontendVersionJson | null,
  swWaiting = false
): UpdateCheckResult {
  const clientCommit = CLIENT_BUILD_INFO.commitHash;
  const hasStaticVersion = Boolean(
    staticVersion &&
      typeof staticVersion.commitHash === 'string' &&
      typeof staticVersion.buildTime === 'string'
  );

  // Only compare against the deployed frontend build (/version.json) or waiting Service Worker.
  // Backend /api/version reflects server repo HEAD and may deploy independently of the frontend CDN.
  if (hasStaticVersion && staticVersion) {
    if (
      staticVersion.commitHash &&
      staticVersion.commitHash !== 'unknown' &&
      clientCommit !== 'unknown' &&
      staticVersion.commitHash !== clientCommit
    ) {
      return {
        updateAvailable: true,
        reason: 'commit_mismatch',
        targetCommit: staticVersion.commitHash,
        targetVersion: staticVersion.version || CLIENT_BUILD_INFO.version,
        targetMessage: staticVersion.commitMessage || 'Build frontend terbaru tersedia',
        targetDate: staticVersion.commitDate || staticVersion.buildTime || '',
        apiVersion,
        staticVersion,
      };
    }

    if (
      staticVersion.buildTime &&
      CLIENT_BUILD_INFO.buildTime &&
      staticVersion.buildTime !== CLIENT_BUILD_INFO.buildTime
    ) {
      return {
        updateAvailable: true,
        reason: 'build_mismatch',
        targetCommit: staticVersion.commitHash || clientCommit,
        targetVersion: staticVersion.version || CLIENT_BUILD_INFO.version,
        targetMessage: staticVersion.commitMessage || 'Build aplikasi baru telah dirilis',
        targetDate: staticVersion.buildTime,
        apiVersion,
        staticVersion,
      };
    }
  }

  if (swWaiting) {
    return {
      updateAvailable: true,
      reason: 'sw_update',
      targetCommit: staticVersion?.commitHash || apiVersion?.commitHash || clientCommit,
      targetVersion: staticVersion?.version || apiVersion?.version || CLIENT_BUILD_INFO.version,
      targetMessage: 'Service Worker baru siap diaktifkan',
      targetDate: apiVersion?.commitDate || new Date().toISOString(),
      apiVersion,
      staticVersion,
    };
  }

  return {
    updateAvailable: false,
    reason: null,
    targetCommit: clientCommit,
    targetVersion: CLIENT_BUILD_INFO.version,
    targetMessage: CLIENT_BUILD_INFO.commitMessage,
    targetDate: CLIENT_BUILD_INFO.commitDate,
    apiVersion,
    staticVersion,
  };
}

export async function applyEnforcedUpdate(targetCommit?: string, targetBuildTime?: string): Promise<void> {
  try {
    const payload: AttemptedUpdateState = {
      targetCommit: targetCommit || '',
      targetBuildTime: targetBuildTime || '',
      attemptedAt: Date.now(),
    };
    localStorage.setItem(ATTEMPTED_UPDATE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }

  invalidateApiCache();

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(async (reg) => {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          await reg.unregister();
        })
      );
    } catch {
      // continue reload even if SW cleanup fails
    }
  }

  if ('caches' in window) {
    try {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    } catch {
      // continue reload
    }
  }

  const url = new URL(window.location.href);
  url.searchParams.set('_upd', String(Date.now()));
  window.location.replace(url.toString());
}

export async function getRuntimeDiagnostics(): Promise<{
  swSupported: boolean;
  swRegistrations: number;
  swStates: string[];
  cacheStorageKeys: string[];
}> {
  let swRegistrations = 0;
  const swStates: string[] = [];

  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      swRegistrations = regs.length;
      regs.forEach((reg) => {
        if (reg.active) swStates.push(`active (${reg.scope})`);
        if (reg.waiting) swStates.push(`waiting (${reg.scope})`);
        if (reg.installing) swStates.push(`installing (${reg.scope})`);
      });
    } catch {
      // ignore
    }
  }

  let cacheStorageKeys: string[] = [];
  if ('caches' in window) {
    try {
      cacheStorageKeys = await window.caches.keys();
    } catch {
      // ignore
    }
  }

  return {
    swSupported: 'serviceWorker' in navigator,
    swRegistrations,
    swStates,
    cacheStorageKeys,
  };
}

