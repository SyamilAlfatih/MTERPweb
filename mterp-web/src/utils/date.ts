/**
 * Date utility functions for MTERP frontend handling WIB (Asia/Jakarta) timezone.
 */

const TZ = 'Asia/Jakarta';
const LOCALE = 'id-ID';

/**
 * Format a date string or Date object for display in WIB.
 * @param {string|Date} date
 * @param {Intl.DateTimeFormatOptions} options
 */
export function formatDate(date: string | Date, options: Intl.DateTimeFormatOptions = {}): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '';
  
  return dateObj.toLocaleDateString(LOCALE, {
    timeZone: TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  });
}

/**
 * Format with time component.
 */
export function formatDateTime(date: string | Date, options: Intl.DateTimeFormatOptions = {}): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '';

  return dateObj.toLocaleString(LOCALE, {
    timeZone: TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

/**
 * Get WIB "today" as YYYY-MM-DD string (for date inputs, filters).
 */
export function todayWIB(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  // en-CA gives YYYY-MM-DD format
}

/**
 * Format time only (HH:mm) in WIB timezone.
 */
export function formatTime(date: string | Date, options: Intl.DateTimeFormatOptions = {}): string {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '';

  return dateObj.toLocaleTimeString(LOCALE, {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

/**
 * Build a WIB-anchored Date from a date string.
 * Handles both YYYY-MM-DD and full ISO strings.
 */
export function wibDate(dateStr: string | Date): Date | null {
  if (!dateStr) return null;
  
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }

  const s = dateStr.trim();
  if (s === '') return null;
  
  // If it's already a full ISO string (contains T or :), just parse it
  if (s.includes('T') || s.includes(':')) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // Otherwise assume YYYY-MM-DD and anchor to WIB 00:00
  const date = new Date(`${s}T00:00:00+07:00`);
  return isNaN(date.getTime()) ? null : date;
}
