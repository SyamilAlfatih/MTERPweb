/**
 * Canonical ERP Project Cost & Time-Window Engine
 * Single Source of Truth for S-Curve schedule calculations, time-window generation,
 * and cost apportioning across daily, weekly, and monthly periods.
 */

export interface DateWindow {
  start: Date;
  end: Date;
}

/**
 * Returns the Monday (00:00:00) of the week containing the given date.
 */
export function getMonday(d: Date): Date {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  dt.setDate(diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/**
 * Generate an array of Date objects for each day from start to end (inclusive).
 */
export function dayRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/**
 * Generate an array of Mondays from start to end (inclusive of the week containing end).
 */
export function weekRange(start: Date, end: Date): Date[] {
  const weeks: Date[] = [];
  const cur = getMonday(start);
  cur.setHours(0, 0, 0, 0);
  const last = getMonday(end);
  last.setHours(0, 0, 0, 0);
  while (cur <= last) {
    weeks.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

/**
 * Generate an array of first-of-month Date objects from start to end (inclusive).
 */
export function monthRange(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

/**
 * For a given item with [itemStart, itemEnd] and a given day,
 * return the fraction of the item's cost that falls on that day.
 * Spreads cost evenly across all days the item spans.
 */
export function costInDay(
  itemStart: Date | string,
  itemEnd: Date | string,
  totalCost: number,
  day: Date
): number {
  const s = new Date(itemStart);
  const e = new Date(itemEnd);
  const iStart = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const iEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  const dDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());

  if (dDay < iStart || dDay > iEnd) return 0;

  const totalDays = Math.max(1, Math.round((iEnd.getTime() - iStart.getTime()) / 86400000) + 1);
  return (Number(totalCost) || 0) / totalDays;
}

/**
 * For a given item with [itemStart, itemEnd] and a given week (starting on Monday),
 * return the fraction of the item's cost that falls in that week.
 */
export function costInWeek(
  itemStart: Date | string,
  itemEnd: Date | string,
  totalCost: number,
  weekStart: Date
): number {
  const wStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
  const wEnd = new Date(wStart);
  wEnd.setDate(wEnd.getDate() + 6);
  wEnd.setHours(23, 59, 59, 999);

  const s = new Date(itemStart);
  const e = new Date(itemEnd);
  const iStart = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const iEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999);

  if (wEnd < iStart || wStart > iEnd) return 0;

  const overlapStart = wStart > iStart ? wStart : iStart;
  const overlapEnd = wEnd < iEnd ? wEnd : iEnd;
  const overlapDays = Math.max(0, Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1);

  const totalDays = Math.max(1, Math.round((iEnd.getTime() - iStart.getTime()) / 86400000) + 1);
  return ((Number(totalCost) || 0) / totalDays) * overlapDays;
}

/**
 * For a given item with [itemStart, itemEnd] and a given month,
 * return the fraction of the item's cost that falls in that month.
 * Spreads cost evenly across the item's months.
 */
export function costInMonth(
  itemStart: Date | string,
  itemEnd: Date | string,
  totalCost: number,
  month: Date
): number {
  const s = new Date(itemStart);
  const e = new Date(itemEnd);
  const iStart = new Date(s.getFullYear(), s.getMonth(), 1);
  const iEnd = new Date(e.getFullYear(), e.getMonth(), 1);
  const mStart = new Date(month.getFullYear(), month.getMonth(), 1);

  if (mStart < iStart || mStart > iEnd) return 0;

  let totalMonths = 0;
  const tmp = new Date(iStart);
  while (tmp <= iEnd) {
    totalMonths++;
    tmp.setMonth(tmp.getMonth() + 1);
  }
  if (totalMonths === 0) totalMonths = 1;

  return (Number(totalCost) || 0) / totalMonths;
}
