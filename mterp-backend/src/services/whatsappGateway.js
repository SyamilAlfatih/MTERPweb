/**
 * WhatsApp Gateway Client for MTERP Enterprise
 * Integrates with Scraps WhatsApp Service (:8081)
 * Location: mterp-backend/src/services/whatsappGateway.js
 */

const BASE_URL = process.env.WA_GATEWAY_URL || 'http://127.0.0.1:8081';
const API_KEY = process.env.WA_GATEWAY_API_KEY;
const ENABLED = process.env.WA_GATEWAY_ENABLED === 'true';

/**
 * Normalizes Indonesian phone numbers into international format without '+'
 * e.g., '0812-3456-7890' -> '6281234567890', '+62 812 3456' -> '628123456'
 *
 * @param {string} rawPhone
 * @returns {string|null}
 */
function normalizePhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return null;
  let clean = rawPhone.replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean.length >= 10 && clean.length <= 16 ? clean : null;
}

/**
 * Dispatches a notification to all active contacts in one or multiple departments.
 * Optionally also dispatches to a designated WhatsApp Group.
 *
 * @param {string|string[]} department - e.g. 'Procurement' or ['Procurement', 'Finance']
 * @param {string} message - Pre-formatted WhatsApp memo
 * @param {Object} [options]
 * @param {string} [options.groupId] - Optional WhatsApp Group ID override
 * @param {string} [options.priority] - 'normal' | 'high'
 * @param {Object} [options.metadata] - Optional tracking metadata
 * @returns {Promise<{ ok: boolean, queued?: boolean, skipped?: boolean, error?: string }>}
 */
async function sendToDepartment(department, message, options = {}) {
  if (!ENABLED || !API_KEY) {
    return { ok: false, skipped: true, reason: 'WhatsApp Gateway disabled or missing API key' };
  }

  if (!message || !message.trim()) {
    return { ok: false, error: 'Message content is required' };
  }

  const depts = Array.isArray(department) ? department : [department];
  if (depts.length === 0) {
    return { ok: false, error: 'At least one target department is required' };
  }

  try {
    const res = await fetch(`${BASE_URL}/api/send/department`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        department: depts[0],
        departments: depts,
        message: message.trim(),
        groupId: options.groupId || process.env.WA_PROCUREMENT_GROUP_ID || undefined,
        priority: options.priority || 'normal',
        metadata: options.metadata || {},
      }),
      signal: AbortSignal.timeout(6000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.warn(`[WA Gateway] Department dispatch warning (${res.status}):`, data.error || res.statusText);
      return { ok: false, status: res.status, error: data.error || res.statusText };
    }

    return { ok: true, queued: true, ...data };
  } catch (err) {
    console.warn(`[WA Gateway] Error notifying department(s) ${depts.join(', ')}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Dispatches a direct message to a user or phone number.
 *
 * @param {string} phone - Recipient phone number
 * @param {string} message - Pre-formatted message
 * @param {Object} [options]
 * @returns {Promise<{ ok: boolean, queued?: boolean, skipped?: boolean, error?: string }>}
 */
async function sendToUser(phone, message, options = {}) {
  if (!ENABLED || !API_KEY) {
    return { ok: false, skipped: true, reason: 'WhatsApp Gateway disabled or missing API key' };
  }

  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) {
    return { ok: false, error: `Invalid phone number format: "${phone}"` };
  }

  if (!message || !message.trim()) {
    return { ok: false, error: 'Message content is required' };
  }

  try {
    const res = await fetch(`${BASE_URL}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        phone: cleanPhone,
        message: message.trim(),
        isGroup: false,
      }),
      signal: AbortSignal.timeout(6000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.warn(`[WA Gateway] User dispatch warning (${res.status}) for ${cleanPhone}:`, data.error || res.statusText);
      return { ok: false, status: res.status, error: data.error || res.statusText };
    }

    return { ok: true, queued: true, ...data };
  } catch (err) {
    console.warn(`[WA Gateway] Error sending to user ${cleanPhone}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Dispatches a direct message to a WhatsApp Group.
 *
 * @param {string} groupId - e.g. '120363xxx@g.us'
 * @param {string} message - Pre-formatted message
 * @returns {Promise<{ ok: boolean, queued?: boolean, skipped?: boolean, error?: string }>}
 */
async function sendToGroup(groupId, message) {
  if (!ENABLED || !API_KEY) {
    return { ok: false, skipped: true, reason: 'WhatsApp Gateway disabled or missing API key' };
  }

  if (!groupId || !message || !message.trim()) {
    return { ok: false, error: 'Group ID and message content are required' };
  }

  try {
    const res = await fetch(`${BASE_URL}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        groupId: groupId.trim(),
        message: message.trim(),
        isGroup: true,
      }),
      signal: AbortSignal.timeout(6000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data.error || res.statusText };
    }
    return { ok: true, ...data };
  } catch (err) {
    console.warn(`[WA Gateway] Error sending to group ${groupId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Checks WhatsApp gateway connectivity and telemetry stats.
 *
 * @returns {Promise<{ ok: boolean, waReady?: boolean, isRedisConnected?: boolean, error?: string }>}
 */
async function checkGatewayStatus() {
  if (!ENABLED || !API_KEY) {
    return { ok: false, error: 'WhatsApp Gateway disabled or missing API key' };
  }

  try {
    const res = await fetch(`${BASE_URL}/api/send/stats`, {
      headers: { 'X-API-Key': API_KEY },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    return await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  normalizePhone,
  sendToDepartment,
  sendToUser,
  sendToGroup,
  checkGatewayStatus,
};
