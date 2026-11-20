import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ArrowRight, Sparkles, Check, Loader2 } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import {
  CLIENT_BUILD_INFO,
  UpdateCheckResult,
  applyEnforcedUpdate,
  clearAttemptedUpdateCommit,
  evaluateUpdateStatus,
  fetchVersionMetadata,
  isUpdateInCooldown,
} from '../../utils/appVersion';

const POLL_INTERVAL_MS = 60_000;
const AUTO_UPDATE_COUNTDOWN_SEC = 5;

export const AppUpdateEnforcer: React.FC = () => {
  const [pendingUpdate, setPendingUpdate] = useState<UpdateCheckResult | null>(null);
  const [countdown, setCountdown] = useState<number>(AUTO_UPDATE_COUNTDOWN_SEC);
  const [isApplying, setIsApplying] = useState(false);
  const swWaitingRef = useRef(false);
  const isCheckingRef = useRef(false);

  const runCheck = useCallback(async () => {
    if (isCheckingRef.current || isApplying) return;
    isCheckingRef.current = true;
    try {
      const { apiVersion, staticVersion } = await fetchVersionMetadata();
      const result = evaluateUpdateStatus(apiVersion, staticVersion, swWaitingRef.current);

      if (result.updateAvailable) {
        const targetBuildTime = result.staticVersion?.buildTime || '';
        if (isUpdateInCooldown(result.targetCommit, targetBuildTime)) {
          // Reload was already attempted for this build; suppress modal to prevent loops
          setPendingUpdate(null);
        } else {
          setPendingUpdate((prev) => {
            if (!prev || prev.targetCommit !== result.targetCommit || prev.staticVersion?.buildTime !== targetBuildTime) {
              setCountdown(AUTO_UPDATE_COUNTDOWN_SEC);
            }
            return result;
          });
        }
      } else {
        clearAttemptedUpdateCommit();
        setPendingUpdate(null);
      }
    } finally {
      isCheckingRef.current = false;
    }
  }, [isApplying]);

  const handleApplyUpdate = useCallback(async () => {
    if (isApplying) return;
    setIsApplying(true);
    await applyEnforcedUpdate(
      pendingUpdate?.targetCommit,
      pendingUpdate?.staticVersion?.buildTime
    );
  }, [isApplying, pendingUpdate?.targetCommit, pendingUpdate?.staticVersion?.buildTime]);

  // Strip cache-busting _upd query parameter from URL after reload
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('_upd')) {
        url.searchParams.delete('_upd');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      // ignore invalid URL
    }
  }, []);

  // Register VitePWA Service Worker and listen for new SW waiting
  useEffect(() => {
    if (import.meta.env.DEV) return;
    let swInterval: number | undefined;
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        swWaitingRef.current = true;
        void runCheck();
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        swInterval = window.setInterval(() => {
          void registration.update().catch(() => {});
        }, POLL_INTERVAL_MS);
      },
    });
    return () => {
      if (swInterval !== undefined) window.clearInterval(swInterval);
      void updateSW;
    };
  }, [runCheck]);

  // Poll on mount, interval, window focus, and visibility change
  useEffect(() => {
    void runCheck();

    const interval = window.setInterval(() => {
      void runCheck();
    }, POLL_INTERVAL_MS);

    const onFocus = () => void runCheck();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void runCheck();
      }
    };
    const onManualTrigger = () => void runCheck();

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('mterp:check-app-update', onManualTrigger);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('mterp:check-app-update', onManualTrigger);
    };
  }, [runCheck]);

  // Countdown & automatic enforcement when a new commit/build is detected
  useEffect(() => {
    if (!pendingUpdate?.updateAvailable || isApplying) return;

    if (countdown <= 0) {
      void handleApplyUpdate();
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown((c) => c - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [pendingUpdate, isApplying, countdown, handleApplyUpdate]);

  if (!pendingUpdate?.updateAvailable) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
            <RefreshCw className={`h-5 w-5 ${isApplying ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
              Pembaruan Wajib
            </span>
            <h2 id="app-update-title" className="text-lg font-bold text-slate-900 mt-0.5">
              Versi Baru Aplikasi Tersedia
            </h2>
          </div>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Pembaruan kode terbaru telah dirilis. Untuk menjaga konsistensi data dan fitur, aplikasi akan otomatis
          membersihkan cache dan memuat ulang ke versi terbaru.
        </p>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 mb-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Versi Saat Ini</span>
            <code className="font-mono font-semibold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
              v{CLIENT_BUILD_INFO.version} ({CLIENT_BUILD_INFO.commitHash})
            </code>
          </div>
          <div className="flex items-center justify-center text-slate-400">
            <ArrowRight className="h-3.5 w-3.5 rotate-90" />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Versi Terbaru</span>
            <code className="font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {pendingUpdate.apiVersion?.humanVersionLabel || `v${pendingUpdate.targetVersion}`} ({pendingUpdate.targetCommit})
            </code>
          </div>

          <div className="pt-2.5 border-t border-slate-200 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700">
                <Sparkles className="h-3 w-3" />
                Apa yang Baru
              </span>
              {pendingUpdate.apiVersion?.latestRelease?.moduleLabel && (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
                  {pendingUpdate.apiVersion.latestRelease.moduleLabel}
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-800">
              {pendingUpdate.apiVersion?.latestRelease?.title || pendingUpdate.targetMessage}
            </p>
            {pendingUpdate.apiVersion?.latestRelease?.description && (
              <p className="text-xs text-slate-600 leading-relaxed">
                {pendingUpdate.apiVersion.latestRelease.description}
              </p>
            )}
            {pendingUpdate.apiVersion?.latestRelease?.highlights &&
              pendingUpdate.apiVersion.latestRelease.highlights.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {pendingUpdate.apiVersion.latestRelease.highlights.slice(0, 3).map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                      <Check className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>

        <button
          type="button"
          disabled={isApplying}
          onClick={() => void handleApplyUpdate()}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer"
        >
          {isApplying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Memperbarui Aplikasi...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Perbarui Sekarang ({countdown}d)
            </>
          )}
        </button>
      </div>
    </div>
  );
};

