const AuditLog = require('../models/AuditLog');

const SENSITIVE_KEY_PATTERN = /(password|passcode|pin|otp|token|secret|apikey|api_key|authorization|cookie|privatekey|cvv)/i;
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_ITEMS = 25;
const MAX_DEPTH = 5;

const MODULE_LABELS = {
  auth: 'Autentikasi',
  users: 'User Management',
  projects: 'Proyek',
  requests: 'Pengadaan & Material',
  tools: 'Peralatan & Gudang',
  attendance: 'Presensi',
  'attendance-session': 'Sesi Presensi',
  kasbon: 'Kasbon',
  tasks: 'Tugas',
  slipgaji: 'Slip Gaji',
  spkl: 'Surat Lembur (SPKL)',
  'approval-config': 'Kebijakan Approval',
  warehouses: 'Gudang',
  'ppe-usages': 'Penggunaan APD',
  ppe: 'Penggunaan APD',
  'ppe-items': 'Master Katalog APD',
  rab: 'RAB',
  'local-purchases': 'Pembelian Lokal',
  pekerja: 'Data Pekerja',
  apikeys: 'API Keys',
  notifications: 'Notifikasi',
  'audit-logs': 'Audit Logs',
};

/**
 * Recursively sanitizes request payloads so passwords, OTPs, tokens, and secrets
 * are never stored in plain text in the audit trail.
 */
function sanitizePayload(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return '[MAX_DEPTH]';
  if (Buffer.isBuffer(value)) return '[BINARY_DATA]';

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      return `${value.slice(0, MAX_STRING_LENGTH)}... [truncated ${value.length - MAX_STRING_LENGTH} chars]`;
    }
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizePayload(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      sliced.push(`... (+${value.length - MAX_ARRAY_ITEMS} more items)`);
    }
    return sliced;
  }

  if (typeof value === 'object') {
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizePayload(val, depth + 1);
      }
    }
    return sanitized;
  }

  return String(value);
}

/**
 * Extracts client IP address safely behind proxies.
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

/**
 * Normalizes uploaded file metadata without storing binary buffers.
 */
function extractFileMetadata(req) {
  if (req.file) {
    return {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
    };
  }
  if (Array.isArray(req.files) && req.files.length > 0) {
    return req.files.slice(0, 10).map((f) => ({
      fieldname: f.fieldname,
      originalname: f.originalname,
      filename: f.filename,
      mimetype: f.mimetype,
      size: f.size,
    }));
  }
  return null;
}

/**
 * Infers normalized module, action, entityId, and summary from an Express request.
 */
function inferModuleAndAction(req, res) {
  const cleanPath = (req.originalUrl || req.path || '').split('?')[0];
  const segments = cleanPath.split('/').filter(Boolean);

  // Strip leading 'api' prefix
  const apiSegments = segments[0] === 'api' ? segments.slice(1) : segments;
  let moduleName = apiSegments[0] || 'system';

  // Map nested project sub-resources to clearer module names
  if (moduleName === 'projects' && apiSegments.length >= 3) {
    const subResource = apiSegments[2];
    if (['plan', 'rab', 'local-purchases'].includes(subResource)) {
      moduleName = subResource;
    }
  }

  const entitySegment = apiSegments.find((seg) => OBJECT_ID_REGEX.test(seg));
  const entityId = res.locals.auditEntityId || entitySegment || '';

  const lowerPath = cleanPath.toLowerCase();
  let action = res.locals.auditAction || 'OTHER';

  if (!res.locals.auditAction) {
    if (moduleName === 'auth' && lowerPath.includes('/login')) {
      action = res.statusCode >= 400 ? 'LOGIN_FAILED' : 'LOGIN';
    } else if (moduleName === 'auth' && lowerPath.includes('/logout')) {
      action = 'LOGOUT';
    } else if (lowerPath.includes('/approve')) {
      action = 'APPROVE';
    } else if (lowerPath.includes('/reject')) {
      action = 'REJECT';
    } else if (lowerPath.includes('/return')) {
      action = 'RETURN';
    } else if (lowerPath.includes('/export')) {
      action = 'EXPORT';
    } else if (req.method === 'POST') {
      action = 'CREATE';
    } else if (req.method === 'PUT' || req.method === 'PATCH') {
      action = 'UPDATE';
    } else if (req.method === 'DELETE') {
      action = 'DELETE';
    }
  }

  const moduleLabel = MODULE_LABELS[moduleName] || moduleName;
  const defaultSummary = `${action} ${moduleLabel}${entityId ? ` (#${entityId.slice(-6)})` : ''} via ${req.method} ${cleanPath}`;

  return {
    module: moduleName,
    action,
    entityId: String(entityId || ''),
    endpoint: cleanPath,
    summary: res.locals.auditSummary || defaultSummary,
  };
}

/**
 * Persists an audit log entry asynchronously without interrupting application flow.
 */
async function recordAuditEvent(entry) {
  try {
    await AuditLog.create(entry);
  } catch (err) {
    console.warn('[AuditLogger] Failed to persist audit log:', err.message);
  }
}

/**
 * Global Express middleware that captures all API mutations (POST/PUT/PATCH/DELETE)
 * and export downloads after response completion.
 */
function auditMiddleware(req, res, next) {
  const cleanPath = (req.originalUrl || req.path || '').split('?')[0];
  if (!cleanPath.startsWith('/api/')) {
    return next();
  }

  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const isExport = req.method === 'GET' && cleanPath.toLowerCase().includes('/export');

  if (!isMutation && !isExport) {
    return next();
  }

  const startTime = Date.now();

  res.on('finish', () => {
    if (res.locals.skipAudit) return;

    const actor = res.locals.auditActor || req.user || null;
    const { module, action, entityId, endpoint, summary } = inferModuleAndAction(req, res);

    const sanitizedBody = req.body && Object.keys(req.body).length > 0 ? sanitizePayload(req.body) : null;
    const fileMeta = extractFileMetadata(req);

    let changes = null;
    if (sanitizedBody || fileMeta) {
      changes = {
        ...(sanitizedBody ? { payload: sanitizedBody } : {}),
        ...(fileMeta ? { file: fileMeta } : {}),
      };
    }

    recordAuditEvent({
      actorId: actor?._id || null,
      actorName: actor?.fullName || actor?.name || res.locals.auditActorName || 'System / Anonymous',
      actorUsername: actor?.username || res.locals.auditActorUsername || '',
      actorRole: actor?.role || 'anonymous',
      action,
      module,
      entityId,
      method: req.method,
      endpoint,
      statusCode: res.statusCode,
      success: res.statusCode < 400,
      summary,
      changes,
      ipAddress: getClientIp(req),
      userAgent: (req.headers['user-agent'] || '').slice(0, 300),
      durationMs: Date.now() - startTime,
    });
  });

  next();
}

module.exports = {
  auditMiddleware,
  recordAuditEvent,
  sanitizePayload,
  getClientIp,
};

