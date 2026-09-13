import React, { useMemo } from 'react';
import { ZoomLevel } from './useGanttState';

interface GanttTimescaleProps {
  timelineStart: Date;
  totalDays: number;
  dayWidth: number;
  zoomLevel: ZoomLevel;
  scrollLeft: number;
}

const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const GanttTimescale: React.FC<GanttTimescaleProps> = ({
  timelineStart,
  totalDays,
  dayWidth,
  zoomLevel,
}) => {
  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // Compute major header segments (Months)
  const majorSegments = useMemo(() => {
    const segments: { label: string; left: number; width: number }[] = [];
    let curr = new Date(timelineStart);
    let currentMonth = curr.getMonth();
    let currentYear = curr.getFullYear();
    let segmentStartDay = 0;

    for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
      const d = new Date(timelineStart);
      d.setDate(d.getDate() + dayIndex);

      if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear || dayIndex === totalDays - 1) {
        const daysInSegment = dayIndex === totalDays - 1 ? dayIndex - segmentStartDay + 1 : dayIndex - segmentStartDay;
        const width = daysInSegment * dayWidth;
        const label = `${MONTHS_LONG[currentMonth]} ${currentYear}`;

        segments.push({
          label,
          left: segmentStartDay * dayWidth,
          width,
        });

        currentMonth = d.getMonth();
        currentYear = d.getFullYear();
        segmentStartDay = dayIndex;
      }
    }

    return segments;
  }, [timelineStart, totalDays, dayWidth]);

  // Minor header units (Days or Weeks or Months depending on zoomLevel)
  const minorUnits = useMemo(() => {
    const units: {
      key: string;
      label: string;
      subLabel?: string;
      left: number;
      width: number;
      isWeekend: boolean;
      isToday: boolean;
    }[] = [];

    if (zoomLevel === 'day') {
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(timelineStart);
        d.setDate(d.getDate() + i);
        const dayOfWeek = d.getDay();
        const dateNum = d.getDate();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(dateNum).padStart(2, '0')}`;

        units.push({
          key: `day-${i}`,
          label: `${dateNum}`,
          subLabel: DAYS_SHORT[dayOfWeek],
          left: i * dayWidth,
          width: dayWidth,
          isWeekend: dayOfWeek === 0, // Sunday is weekend
          isToday: dateStr === todayStr,
        });
      }
    } else if (zoomLevel === 'week') {
      // Step by 7 days
      for (let i = 0; i < totalDays; i += 7) {
        const d = new Date(timelineStart);
        d.setDate(d.getDate() + i);
        const dateNum = d.getDate();
        const monthNum = d.getMonth();
        const width = Math.min(7, totalDays - i) * dayWidth;

        units.push({
          key: `week-${i}`,
          label: `${MONTHS_SHORT[monthNum]} ${dateNum}`,
          left: i * dayWidth,
          width,
          isWeekend: false,
          isToday: false,
        });
      }
    } else {
      // Month / Quarter zoom
      for (let i = 0; i < totalDays; i += 30) {
        const d = new Date(timelineStart);
        d.setDate(d.getDate() + i);
        const width = Math.min(30, totalDays - i) * dayWidth;

        units.push({
          key: `month-${i}`,
          label: `${MONTHS_SHORT[d.getMonth()]}`,
          left: i * dayWidth,
          width,
          isWeekend: false,
          isToday: false,
        });
      }
    }

    return units;
  }, [timelineStart, totalDays, dayWidth, zoomLevel, todayStr]);

  const totalWidth = totalDays * dayWidth;

  return (
    <div
      className="gantt-timescale-container select-none sticky top-0 z-20 bg-slate-100 border-b border-slate-300"
      style={{ width: totalWidth, minWidth: '100%', height: 50 }}
    >
      {/* Major Tier (Month / Year) */}
      <div className="relative h-6 border-b border-slate-300 text-xs font-semibold text-slate-700 overflow-hidden">
        {majorSegments.map((seg, idx) => (
          <div
            key={idx}
            className="absolute top-0 bottom-0 flex items-center px-2 border-r border-slate-300 bg-slate-100 text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ left: seg.left, width: seg.width }}
          >
            {seg.label}
          </div>
        ))}
      </div>

      {/* Minor Tier (Days / Weeks) */}
      <div className="relative h-6 flex overflow-hidden text-[11px] text-slate-600 font-medium">
        {minorUnits.map(u => (
          <div
            key={u.key}
            className={`absolute top-0 bottom-0 flex flex-col items-center justify-center border-r border-slate-200 ${
              u.isToday
                ? 'bg-blue-100 font-bold text-blue-800'
                : u.isWeekend
                ? 'bg-slate-200/70 text-slate-400'
                : 'bg-white text-slate-600'
            }`}
            style={{ left: u.left, width: u.width }}
          >
            <span>{u.label}</span>
            {u.subLabel && <span className="text-[9px] leading-none opacity-80">{u.subLabel}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};
