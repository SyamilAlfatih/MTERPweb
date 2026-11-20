import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  GitCommit,
  GitBranch,
  Clock,
  Server,
  Monitor,
  ShieldCheck,
  HardDrive,
  User,
  Trash2,
  Loader2,
  Sparkles,
  Check,
  Code2,
  Zap,
  Wrench,
  Layers,
} from 'lucide-react';
import {
  CLIENT_BUILD_INFO,
  CommitEntry,
  UpdateCheckResult,
  applyEnforcedUpdate,
  evaluateUpdateStatus,
  fetchVersionMetadata,
  getRuntimeDiagnostics,
} from '../utils/appVersion';

type CategoryFilter = 'all' | 'feature' | 'performance' | 'fix' | 'other';

function formatDateTime(iso?: string): string {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function getCategoryStyle(category?: string): {
  badge: string;
  icon: React.ElementType;
} {
  switch (category) {
    case 'feature':
      return {
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        icon: Sparkles,
      };
    case 'performance':
      return {
        badge: 'bg-blue-100 text-blue-800 border-blue-200',
        icon: Zap,
      };
    case 'fix':
      return {
        badge: 'bg-amber-100 text-amber-800 border-amber-200',
        icon: Wrench,
      };
    case 'ui':
      return {
        badge: 'bg-violet-100 text-violet-800 border-violet-200',
        icon: Layers,
      };
    default:
      return {
        badge: 'bg-slate-100 text-slate-700 border-slate-200',
        icon: GitCommit,
      };
  }
}

export default function AppVersioning() {
  const [status, setStatus] = useState<UpdateCheckResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<{
    swSupported: boolean;
    swRegistrations: number;
    swStates: string[];
    cacheStorageKeys: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showTechnical, setShowTechnical] = useState(false);

  const loadVersionData = useCallback(async (manual = false) => {
    if (manual) setChecking(true);
    else setLoading(true);

    try {
      const [{ apiVersion, staticVersion }, runtimeDiag] = await Promise.all([
        fetchVersionMetadata(),
        getRuntimeDiagnostics(),
      ]);

      const evaluated = evaluateUpdateStatus(apiVersion, staticVersion, false);
      setStatus(evaluated);
      setDiagnostics(runtimeDiag);
      setLastCheckedAt(new Date().toISOString());

      if (manual) {
        window.dispatchEvent(new CustomEvent('mterp:check-app-update'));
      }
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadVersionData(false);
  }, [loadVersionData]);

  const handleForceUpdate = async () => {
    setApplying(true);
    await applyEnforcedUpdate(status?.targetCommit, status?.staticVersion?.buildTime);
  };

  const server = status?.apiVersion;
  const isOutdated = Boolean(status?.updateAvailable);
  const latestRelease = server?.latestRelease;

  const filteredReleases = useMemo(() => {
    const groups = server?.releases || [];
    const matchesFilter = (item: CommitEntry) => {
      if (categoryFilter === 'all') return true;
      if (categoryFilter === 'other') {
        return !['feature', 'performance', 'fix'].includes(item.category || '');
      }
      return item.category === categoryFilter;
    };

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(matchesFilter),
      }))
      .filter((group) => group.items.length > 0);
  }, [server?.releases, categoryFilter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Versi & Pembaruan Aplikasi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Lihat ringkasan fitur terbaru, catatan rilis, dan pastikan aplikasi Anda selalu mutakhir.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowTechnical((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer ${
              showTechnical
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Code2 className="h-4 w-4" />
            {showTechnical ? 'Sembunyikan Info Teknis' : 'Info Teknis'}
          </button>

          <button
            type="button"
            disabled={checking || applying}
            onClick={() => void loadVersionData(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            ) : (
              <RefreshCw className="h-4 w-4 text-slate-500" />
            )}
            Periksa Pembaruan
          </button>

          <button
            type="button"
            disabled={applying}
            onClick={() => void handleForceUpdate()}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-xs disabled:opacity-60 transition-colors cursor-pointer ${
              isOutdated
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {isOutdated ? 'Terapkan Update Sekarang' : 'Bersihkan Cache & Reload'}
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      <div
        className={`rounded-2xl border p-5 transition-colors ${
          loading
            ? 'border-slate-200 bg-white'
            : isOutdated
              ? 'border-amber-200 bg-amber-50/70'
              : 'border-emerald-200 bg-emerald-50/70'
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-blue-600 shrink-0 mt-0.5" />
            ) : isOutdated ? (
              <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {loading
                    ? 'Memeriksa versi aplikasi...'
                    : isOutdated
                      ? 'Pembaruan Baru Tersedia (Wajib Sinkronisasi)'
                      : 'Aplikasi Anda Sudah Menggunakan Versi Terbaru'}
                </h2>
                {!loading && (
                  <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
                    {server?.humanVersionLabel || `v${CLIENT_BUILD_INFO.version}`}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {loading
                  ? 'Menghubungi server untuk memeriksa pembaruan terbaru.'
                  : isOutdated
                    ? `Terdapat pembaruan terbaru pada modul ${latestRelease?.moduleLabel || 'sistem'}. Klik "Terapkan Update Sekarang" untuk memuat fitur terbaru.`
                    : `Semua fitur dan perbaikan terbaru sudah aktif di perangkat Anda.`}
              </p>
            </div>
          </div>

          {lastCheckedAt && (
            <div className="text-xs text-slate-500 flex items-center gap-1.5 shrink-0">
              <Clock className="h-3.5 w-3.5" />
              Dicek: {formatDateTime(lastCheckedAt)}
            </div>
          )}
        </div>
      </div>

      {/* What's New Spotlight Card */}
      {!loading && latestRelease && (
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/70 via-white to-slate-50 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                <Sparkles className="h-3.5 w-3.5" />
                Apa yang Baru?
              </span>
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
                {latestRelease.moduleLabel}
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                {latestRelease.categoryLabel}
              </span>
            </div>
            <span className="text-xs text-slate-500">{latestRelease.dateLabel}</span>
          </div>

          <h3 className="text-lg font-bold text-slate-900">{latestRelease.title}</h3>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            {latestRelease.description}
          </p>

          {latestRelease.highlights && latestRelease.highlights.length > 0 && (
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {latestRelease.highlights.map((highlight, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 py-2.5 text-xs text-slate-700"
                >
                  <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Optional Technical Diagnostics Grid */}
      {showTechnical && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Client Build Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Monitor className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Build Aktif (Browser)</h3>
                  <p className="text-xs text-slate-500">Kode yang sedang dijalankan</p>
                </div>
              </div>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700">
                v{CLIENT_BUILD_INFO.version}
              </span>
            </div>

            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Commit Hash</dt>
                <dd className="font-mono font-semibold text-slate-800">{CLIENT_BUILD_INFO.commitHash}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Branch</dt>
                <dd className="inline-flex items-center gap-1 font-mono text-slate-700">
                  <GitBranch className="h-3 w-3 text-slate-400" />
                  {CLIENT_BUILD_INFO.branch}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Waktu Build</dt>
                <dd className="text-slate-700">{formatDateTime(CLIENT_BUILD_INFO.buildTime)}</dd>
              </div>
              <div>
                <dt className="text-slate-500 mb-1">Pesan Commit</dt>
                <dd className="rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-700 line-clamp-2">
                  {CLIENT_BUILD_INFO.commitMessage || '-'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Server Version Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Server className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Versi Server Terbaru</h3>
                  <p className="text-xs text-slate-500">Referensi repository aktif</p>
                </div>
              </div>
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-700">
                v{server?.version || CLIENT_BUILD_INFO.version}
              </span>
            </div>

            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Commit Hash</dt>
                <dd className="font-mono font-semibold text-slate-800">{server?.commitHash || '-'}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Branch</dt>
                <dd className="inline-flex items-center gap-1 font-mono text-slate-700">
                  <GitBranch className="h-3 w-3 text-slate-400" />
                  {server?.branch || '-'}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Tanggal Commit</dt>
                <dd className="text-slate-700">{formatDateTime(server?.commitDate)}</dd>
              </div>
              <div>
                <dt className="text-slate-500 mb-1">Pesan Commit Terbaru</dt>
                <dd className="rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-700 line-clamp-2">
                  {server?.commitMessage || '-'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Enforce Update & Cache Diagnostics Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Kebijakan & Cache PWA</h3>
                  <p className="text-xs text-slate-500">Status mekanisme auto-update</p>
                </div>
              </div>
              <span className="rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                Enforced
              </span>
            </div>

            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Enforce Update</dt>
                <dd className="font-semibold text-emerald-700">Aktif (Polling 60d + Focus)</dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Service Worker</dt>
                <dd className="font-mono text-slate-700">
                  {diagnostics?.swSupported
                    ? `${diagnostics.swRegistrations} terdaftar`
                    : 'Tidak didukung'}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Cache Storage</dt>
                <dd className="inline-flex items-center gap-1 font-mono text-slate-700">
                  <HardDrive className="h-3 w-3 text-slate-400" />
                  {diagnostics ? `${diagnostics.cacheStorageKeys.length} bucket` : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 mb-1">Server Aktif Sejak</dt>
                <dd className="rounded-lg bg-slate-50 p-2 text-slate-700">
                  {formatDateTime(server?.serverStartedAt)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* Human-Readable Release Notes Timeline */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Catatan Rilis & Perubahan</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ringkasan pembaruan fitur, peningkatan performa, dan perbaikan aplikasi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'feature', label: 'Fitur Baru' },
                { id: 'performance', label: 'Performa' },
                { id: 'fix', label: 'Perbaikan' },
                { id: 'other', label: 'Lainnya' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  categoryFilter === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500 gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat catatan rilis...
          </div>
        ) : filteredReleases.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Tidak ada catatan pembaruan untuk kategori ini.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredReleases.map((group) => (
              <div key={group.dateKey} className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {group.dateLabel}
                  </h4>
                  <span className="text-xs text-slate-400">({group.items.length} pembaruan)</span>
                </div>

                <div className="space-y-3 pl-4 border-l-2 border-slate-100">
                  {group.items.map((entry) => {
                    const isCurrentClient = entry.hash === CLIENT_BUILD_INFO.commitHash;
                    const isLatestServer = entry.hash === server?.commitHash;
                    const catStyle = getCategoryStyle(entry.category);
                    const CatIcon = catStyle.icon;

                    return (
                      <div
                        key={entry.fullHash || entry.hash}
                        className={`rounded-xl border p-4 transition-colors ${
                          isCurrentClient
                            ? 'border-blue-200 bg-blue-50/40'
                            : 'border-slate-200/80 bg-slate-50/40 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${catStyle.badge}`}
                              >
                                <CatIcon className="h-3 w-3" />
                                {entry.categoryLabel || 'Pembaruan'}
                              </span>

                              {entry.moduleLabel && (
                                <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-700 border border-slate-200">
                                  {entry.moduleLabel}
                                </span>
                              )}

                              {isLatestServer && (
                                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white uppercase">
                                  Terbaru
                                </span>
                              )}

                              {isCurrentClient && (
                                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white uppercase">
                                  Versi Anda
                                </span>
                              )}
                            </div>

                            <h5 className="text-sm font-bold text-slate-900">
                              {entry.humanTitle || entry.message}
                            </h5>

                            {entry.humanDescription && (
                              <p className="text-xs text-slate-600 leading-relaxed">
                                {entry.humanDescription}
                              </p>
                            )}

                            {entry.highlights && entry.highlights.length > 0 && (
                              <ul className="pt-1 space-y-1">
                                {entry.highlights.map((h, i) => (
                                  <li
                                    key={i}
                                    className="flex items-start gap-1.5 text-xs text-slate-600"
                                  >
                                    <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                    <span>{h}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0 text-[11px] text-slate-500">
                            <span>{formatDateTime(entry.date)}</span>
                            {showTechnical && (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {entry.author || 'System'}
                                </span>
                                <code className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono font-semibold text-slate-700">
                                  {entry.hash}
                                </code>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
