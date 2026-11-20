const express = require('express');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const REPO_ROOT = path.resolve(__dirname, '../../..');
const RELEASES_PATH = path.resolve(__dirname, '../data/releases.json');
const SERVER_START_TIME = new Date().toISOString();
const CACHE_TTL_MS = 5000;

let cachedPayload = null;
let cachedAt = 0;

const TYPE_META = {
  feat: { category: 'feature', label: 'Fitur Baru' },
  perf: { category: 'performance', label: 'Peningkatan Performa' },
  fix: { category: 'fix', label: 'Perbaikan Bug' },
  style: { category: 'ui', label: 'Tampilan & UI' },
  ui: { category: 'ui', label: 'Tampilan & UI' },
  docs: { category: 'docs', label: 'Panduan & Dokumentasi' },
  refactor: { category: 'improvement', label: 'Penyempurnaan Sistem' },
  chore: { category: 'improvement', label: 'Pemeliharaan Sistem' },
  security: { category: 'security', label: 'Keamanan' },
};

const SCOPE_LABELS = {
  attendance: 'Absensi & Kehadiran',
  spkl: 'Surat Lembur (SPKL)',
  overtime: 'Surat Lembur (SPKL)',
  audit: 'Audit Logs & Keamanan',
  tools: 'Alat & Peralatan',
  ppe: 'Alat Pelindung Diri (APD)',
  apd: 'Alat Pelindung Diri (APD)',
  payroll: 'Slip Gaji & Pembayaran',
  dashboard: 'Dashboard Eksekutif',
  maps: 'Peta & Lokasi',
  versioning: 'Versi & Pembaruan',
  update: 'Versi & Pembaruan',
  swakelola: 'Swakelola & SCM',
  projects: 'Manajemen Proyek',
  auth: 'Autentikasi & Akses',
};

function readPackageVersion() {
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    return pkg.version || '1.0.0';
  } catch {
    return process.env.APP_VERSION || '1.0.0';
  }
}

function readCuratedReleases() {
  try {
    const raw = fs.readFileSync(RELEASES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.curatedCommits || {};
  } catch {
    return {};
  }
}

function execGit(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
  } catch {
    return '';
  }
}

function capitalizeSentence(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatModuleLabel(rawScope) {
  if (!rawScope) return 'Umum';
  const parts = rawScope
    .split(/[,/]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return 'Umum';
  return parts
    .map((part) => SCOPE_LABELS[part] || capitalizeSentence(part))
    .join(' & ');
}

function parseBodyHighlights(body) {
  if (!body) return [];
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line))
    .map((line) => capitalizeSentence(line.replace(/^[-*•]\s+/, '').trim()))
    .slice(0, 5);
}

function humanizeCommit(rawEntry, curatedCommits) {
  const { fullHash, hash, message, body, date, author } = rawEntry;
  const match = message.match(/^([a-zA-Z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/);

  const rawType = match ? match[1].toLowerCase() : 'improvement';
  const rawScope = match && match[2] ? match[2].trim() : '';
  const cleanSubject = match ? match[3].trim() : message.trim();

  const typeInfo = TYPE_META[rawType] || { category: 'improvement', label: 'Pembaruan' };
  const moduleLabel = formatModuleLabel(rawScope);
  const curated = curatedCommits[hash] || curatedCommits[fullHash] || null;
  const bodyHighlights = parseBodyHighlights(body);

  const humanTitle = curated?.humanTitle || capitalizeSentence(cleanSubject);
  const humanDescription =
    curated?.humanDescription ||
    (body && !bodyHighlights.length ? body.trim().split('\n')[0] : '') ||
    `${typeInfo.label} pada modul ${moduleLabel}: ${capitalizeSentence(cleanSubject)}.`;
  const highlights =
    curated?.highlights?.length
      ? curated.highlights
      : bodyHighlights.length
        ? bodyHighlights
        : [];

  return {
    fullHash,
    hash,
    message,
    date,
    author,
    category: typeInfo.category,
    categoryLabel: typeInfo.label,
    scope: rawScope || 'general',
    moduleLabel,
    humanTitle,
    humanDescription,
    highlights,
  };
}

function formatHumanDate(iso) {
  if (!iso) return 'Tanggal tidak diketahui';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function formatShortHumanDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function groupReleasesByDate(changelog) {
  const groups = new Map();
  for (const item of changelog) {
    const dayKey = item.date ? item.date.slice(0, 10) : 'unknown';
    if (!groups.has(dayKey)) {
      groups.set(dayKey, {
        dateKey: dayKey,
        dateLabel: formatHumanDate(item.date),
        items: [],
      });
    }
    groups.get(dayKey).items.push(item);
  }
  return Array.from(groups.values());
}

function getChangelog(limit = 25) {
  const raw = execGit(`log -n ${limit} --format=%H%x1f%h%x1f%s%x1f%b%x1f%cI%x1f%an%x1e`);
  if (!raw) return [];

  const curatedCommits = readCuratedReleases();

  return raw
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [fullHash, hash, message, body, date, author] = record.split('\x1f');
      return humanizeCommit(
        {
          fullHash: fullHash || '',
          hash: hash || '',
          message: message || '',
          body: body || '',
          date: date || '',
          author: author || '',
        },
        curatedCommits
      );
    });
}

function buildVersionPayload() {
  const now = Date.now();
  if (cachedPayload && now - cachedAt < CACHE_TTL_MS) {
    return cachedPayload;
  }

  const version = process.env.APP_VERSION || readPackageVersion();
  const commitHash = execGit('rev-parse --short HEAD') || process.env.APP_COMMIT_HASH || 'unknown';
  const fullCommitHash = execGit('rev-parse HEAD') || process.env.APP_COMMIT_FULL || commitHash;
  const frontendCommitHash = execGit('log -n 1 --format=%h -- mterp-web') || commitHash;
  const branch = execGit('rev-parse --abbrev-ref HEAD') || process.env.APP_BRANCH || 'main';
  const commitDate = execGit('log -1 --format=%cI') || process.env.APP_COMMIT_DATE || SERVER_START_TIME;
  const commitMessage = execGit('log -1 --format=%s') || process.env.APP_COMMIT_MESSAGE || 'Latest deployment';
  const commitAuthor = execGit('log -1 --format=%an') || process.env.APP_COMMIT_AUTHOR || 'System';
  const changelog = getChangelog(25);
  const latest = changelog[0] || null;
  const shortDate = formatShortHumanDate(commitDate);

  cachedPayload = {
    version,
    humanVersionLabel: shortDate ? `v${version} (${shortDate})` : `v${version}`,
    commitHash,
    fullCommitHash,
    frontendCommitHash,
    branch,
    commitDate,
    commitMessage,
    commitAuthor,
    latestRelease: latest
      ? {
          title: latest.humanTitle,
          description: latest.humanDescription,
          category: latest.category,
          categoryLabel: latest.categoryLabel,
          moduleLabel: latest.moduleLabel,
          highlights: latest.highlights,
          date: latest.date,
          dateLabel: formatHumanDate(latest.date),
        }
      : null,
    serverStartedAt: SERVER_START_TIME,
    checkedAt: new Date(now).toISOString(),
    enforceUpdate: process.env.ENFORCE_APP_UPDATE === 'true',
    releases: groupReleasesByDate(changelog),
    changelog,
  };
  cachedAt = now;
  return cachedPayload;
}

/**
 * GET /api/version
 * Public endpoint returning current repository commit/version metadata,
 * human-readable release notes, and recent commits.
 */
router.get('/', (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
  });
  res.json(buildVersionPayload());
});

module.exports = router;
