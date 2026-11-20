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
const ATTEMPTED_COMMIT_KEY = 'mterp_attempted_update_commit';

export function getAttemptedUpdateCommit(): string | null {
  try {
    return sessionStorage.getItem(ATTEMPTED_COMMIT_KEY);
  } catch {
    return null;
  }
}

export function clearAttemptedUpdateCommit(): void {
  try {
    sessionStorage.removeItem(ATTEMPTED_COMMIT_KEY);
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
      staticVersion = (await staticRes.value.json()) as FrontendVersionJson;
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
  const hasStaticVersion = Boolean(staticVersion && (staticVersion.commitHash || staticVersion.buildTime));

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
  } else if (
    apiVersion?.commitHash &&
    apiVersion.commitHash !== 'unknown' &&
    clientCommit !== 'unknown' &&
    apiVersion.commitHash !== clientCommit
  ) {
    return {
      updateAvailable: true,
      reason: 'commit_mismatch',
      targetCommit: apiVersion.commitHash,
      targetVersion: apiVersion.version || CLIENT_BUILD_INFO.version,
      targetMessage: apiVersion.commitMessage || 'Pembaruan kode terbaru tersedia',
      targetDate: apiVersion.commitDate || '',
      apiVersion,
      staticVersion,
    };
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

export async function applyEnforcedUpdate(targetCommit?: string): Promise<void> {
  try {
    if (targetCommit) {
      sessionStorage.setItem(ATTEMPTED_COMMIT_KEY, targetCommit);
    }
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

