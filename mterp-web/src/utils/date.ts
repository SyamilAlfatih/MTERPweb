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

/**
 * Day names in Indonesian (0=Minggu, 1=Senin, ..., 6=Sabtu)
 */
export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

/**
 * Calculates start and end YYYY-MM-DD date strings for a project cycle in WIB.
 * @param refDateStr - YYYY-MM-DD date string or Date object (defaults to todayWIB())
 * @param startDay - 0=Sun, 1=Mon, ..., 6=Sat (default 1)
 * @param endDay - 0=Sun, 1=Mon, ..., 6=Sat (default 6)
 */
export function getProjectWeekRange(
  refDateStr: string | Date = todayWIB(),
  startDay: number = 1,
  endDay: number = 6
): { startDate: string; endDate: string } {
  let y: number, m: number, d: number;
  if (refDateStr instanceof Date) {
    y = refDateStr.getFullYear();
    m = refDateStr.getMonth() + 1;
    d = refDateStr.getDate();
  } else {
    const parts = refDateStr.split('T')[0].split('-').map(Number);
    y = parts[0];
    m = parts[1];
    d = parts[2];
  }

  const calDate = new Date(Date.UTC(y, m - 1, d));
  const currentDayOfWeek = calDate.getUTCDay(); // 0=Sun .. 6=Sat

  const diffToStart = (currentDayOfWeek - startDay + 7) % 7;
  const startCal = new Date(calDate);
  startCal.setUTCDate(calDate.getUTCDate() - diffToStart);

  const cycleDays = (endDay - startDay + 7) % 7;
  const endCal = new Date(startCal);
  endCal.setUTCDate(startCal.getUTCDate() + cycleDays);

  const startYMD = `${startCal.getUTCFullYear()}-${String(startCal.getUTCMonth() + 1).padStart(2, '0')}-${String(startCal.getUTCDate()).padStart(2, '0')}`;
  const endYMD = `${endCal.getUTCFullYear()}-${String(endCal.getUTCMonth() + 1).padStart(2, '0')}-${String(endCal.getUTCDate()).padStart(2, '0')}`;

  return { startDate: startYMD, endDate: endYMD };
}

/**
 * Indonesian month names
 */
export const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
] as const;

export const DEFAULT_MANAGEMENT_CUTOFF_DAY = 25;

export function getStoredManagementCutoffDay(): number {
  try {
    const val = localStorage.getItem('management_monthly_cutoff_day');
    if (val) {
      const num = parseInt(val, 10);
      if (!isNaN(num) && num >= 1 && num <= 31) return num;
    }
  } catch {
    // Ignore localStorage access errors
  }
  return DEFAULT_MANAGEMENT_CUTOFF_DAY;
}

export function setStoredManagementCutoffDay(day: number): void {
  try {
    localStorage.setItem('management_monthly_cutoff_day', String(day));
  } catch {
    // Ignore localStorage access errors
  }
}

/**
 * Returns number of days in month m (1-12) of year y.
 */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Calculates start and end YYYY-MM-DD date strings for a Management Staff monthly payroll/attendance cycle.
 * @param refDateStr - YYYY-MM-DD date string or Date object
 * @param cutoffDay - Cutoff day of the month (1 = Calendar Month 1st-end, or 2-31 for e.g. 26th-25th)
 */
export function getManagementMonthRange(
  refDateStr: string | Date = todayWIB(),
  cutoffDay: number = 25
): { startDate: string; endDate: string; label: string; year: number; month: number } {
  let y: number, m: number, d: number;
  if (refDateStr instanceof Date) {
    y = refDateStr.getFullYear();
    m = refDateStr.getMonth() + 1;
    d = refDateStr.getDate();
  } else {
    const parts = refDateStr.split('T')[0].split('-').map(Number);
    y = parts[0];
    m = parts[1];
    d = parts[2];
  }

  // Case 1: Standard Calendar Month (1 s/d Akhir Bulan)
  if (cutoffDay <= 1) {
    const lastDay = lastDayOfMonth(y, m);
    const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
    const endStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return {
      startDate: startStr,
      endDate: endStr,
      label: `${MONTH_NAMES[m - 1]} ${y}`,
      year: y,
      month: m,
    };
  }

  // Case 2: Custom Cutoff Date (e.g. 25: 26 prev month s/d 25 current month)
  let targetYear = y;
  let targetMonth = m;
  if (d > cutoffDay) {
    // Already past cutoff date, current cycle belongs to next month
    if (m === 12) {
      targetMonth = 1;
      targetYear = y + 1;
    } else {
      targetMonth = m + 1;
    }
  }

  // End date is targetYear, targetMonth, cutoffDay
  const endMaxDay = lastDayOfMonth(targetYear, targetMonth);
  const actualEndDay = Math.min(cutoffDay, endMaxDay);
  const endStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(actualEndDay).padStart(2, '0')}`;

  // Start date is previous month from targetMonth, cutoffDay + 1
  let prevYear = targetYear;
  let prevMonth = targetMonth - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = targetYear - 1;
  }
  const prevMaxDay = lastDayOfMonth(prevYear, prevMonth);
  const actualStartDay = Math.min(cutoffDay + 1, prevMaxDay);
  const startStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(actualStartDay).padStart(2, '0')}`;

  const label = `${MONTH_NAMES[targetMonth - 1]} ${targetYear} (${actualStartDay} ${MONTH_NAMES[prevMonth - 1].slice(0, 3)} – ${actualEndDay} ${MONTH_NAMES[targetMonth - 1].slice(0, 3)})`;

  return {
    startDate: startStr,
    endDate: endStr,
    label,
    year: targetYear,
    month: targetMonth,
  };
}

/**
 * Shifts a management monthly range by dir (+1 or -1 months).
 */
export function shiftMonthRange(
  currentStartDate: string,
  dir: number,
  cutoffDay: number = 25
): { startDate: string; endDate: string; label: string; year: number; month: number } {
  // Use the current range to find its target month and year
  const currentRange = getManagementMonthRange(currentStartDate, cutoffDay);
  let newMonth = currentRange.month + dir;
  let newYear = currentRange.year;

  if (newMonth > 12) {
    newMonth = 1;
    newYear += 1;
  } else if (newMonth < 1) {
    newMonth = 12;
    newYear -= 1;
  }

  // Anchor inside the new target month on the cutoff day (or 1st)
  const targetDay = cutoffDay <= 1 ? 1 : Math.min(cutoffDay, lastDayOfMonth(newYear, newMonth));
  const refDateStr = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
  return getManagementMonthRange(refDateStr, cutoffDay);
}
