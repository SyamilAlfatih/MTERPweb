import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Calendar, DollarSign, FileText, Wrench, ArrowLeft,
  TrendingUp, Package, BarChart3, Layers,
  AlertTriangle, CheckCircle2, Clock, Target,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import gsap from 'gsap';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { Card, ProgressBar, Button, LoadingOverlay, Badge } from '../components/shared';
import { ProjectData, WorkItem } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { formatDate as formatWIBDate, todayWIB, wibDate } from '../utils/date';

/* ─── Types ─── */

interface SCurveDataPoint {
  date: string;           // "Jan 24", "Feb 24" etc.
  timestamp: number;      // ms for sorting
  planned: number;        // Cumulative planned cost %
  actual: number;         // Cumulative actual cost %
  plannedCost: number;    // Absolute cumulative planned cost
  actualCost: number;     // Absolute cumulative actual cost
  deviation: number;      // actual - planned %
  isToday: boolean;       // Is this the current month?
  todayLabel?: string;
  plannedLabel?: string;
  actualLabel?: string;
  deviationLabel?: string;
  aheadLabel?: string;
  behindLabel?: string;
  planLabel?: string;
  actLabel?: string;
}

/* ─── Helpers ─── */

const formatRupiah = (num: number) => {
  if (num >= 1_000_000_000) return `Rp ${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `Rp ${(num / 1_000_000).toFixed(0)}M`;
  if (num >= 1_000) return `Rp ${(num / 1_000).toFixed(0)}K`;
  return `Rp ${num}`;
};

const fmtDate = (d: string | Date | undefined) => {
  if (!d) return '-';
  return formatWIBDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtShort = (d: Date | string) => formatWIBDate(d, { month: 'short', year: '2-digit' });
const fmtDay = (d: Date | string) => formatWIBDate(d, { month: 'short', day: 'numeric' });

/** Generate an array of first-of-month Date objects from start to end (inclusive). */
function monthRange(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

/** Generate an array of Date objects for each day from start to end (inclusive). */
function dayRange(start: Date, end: Date): Date[] {
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
 * For a given item with [itemStart, itemEnd] and a given month,
 * return the fraction of the item's cost that falls in that month.
 * We spread cost evenly across the item's months.
 */
function costInMonth(
  itemStart: Date, itemEnd: Date, totalCost: number, month: Date
): number {
  const iStart = new Date(itemStart.getFullYear(), itemStart.getMonth(), 1);
  const iEnd = new Date(itemEnd.getFullYear(), itemEnd.getMonth(), 1);
  const mStart = new Date(month.getFullYear(), month.getMonth(), 1);

  if (mStart < iStart || mStart > iEnd) return 0;

  // Count total months this item spans
  let totalMonths = 0;
  const tmp = new Date(iStart);
  while (tmp <= iEnd) {
    totalMonths++;
    tmp.setMonth(tmp.getMonth() + 1);
  }
  if (totalMonths === 0) totalMonths = 1;

  return totalCost / totalMonths;
}

/**
 * For a given item with [itemStart, itemEnd] and a given day,
 * return the fraction of the item's cost that falls on that day.
 * We spread cost evenly across all days the item spans.
 */
function costInDay(
  itemStart: Date, itemEnd: Date, totalCost: number, day: Date
): number {
  const iStart = new Date(itemStart.getFullYear(), itemStart.getMonth(), itemStart.getDate());
  const iEnd = new Date(itemEnd.getFullYear(), itemEnd.getMonth(), itemEnd.getDate());
  const dDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());

  if (dDay < iStart || dDay > iEnd) return 0;

  const totalDays = Math.max(1, Math.round((iEnd.getTime() - iStart.getTime()) / 86400000) + 1);
  return totalCost / totalDays;
}

/* ─── Tooltip ─── */

const SCurveTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload as SCurveDataPoint;
  if (!data) return null;

  const dev = data.deviation;
  const devColor = dev >= 0 ? '#10B981' : '#EF4444';

  return (
    <div className="bg-bg-primary border border-border rounded-lg p-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)] min-w-[200px] backdrop-blur-[12px]">
      <div className="text-sm font-bold text-text-primary mb-1">
        {data.date}
        {data.isToday && <span className="inline-block ml-2 py-[1px] px-[6px] text-[9px] font-extrabold text-[#f59e0b] bg-[#f59e0b]/12 rounded-full tracking-[0.5px] align-middle">{data.todayLabel}</span>}
      </div>
      <div className="h-[1px] bg-border my-2" />
      <div className="flex items-center gap-2 text-sm text-text-secondary py-[2px]">
        <span className="w-2 h-2 rounded-full shrink-0 bg-[#6366f1]" />
        <span>{data.plannedLabel}</span>
        <span className="ml-auto font-bold text-text-primary">{data.planned.toFixed(1)}%</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-text-secondary py-[2px]">
        <span className="w-2 h-2 rounded-full shrink-0 bg-[#10b981]" />
        <span>{data.actualLabel}</span>
        <span className="ml-auto font-bold text-text-primary">{data.actual.toFixed(1)}%</span>
      </div>
      {data.actual > 0 && (
        <div className="flex items-center gap-2 text-sm text-text-secondary py-[2px]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: devColor }} />
          <span>{data.deviationLabel}</span>
          <span className="ml-auto font-bold text-text-primary" style={{ color: devColor }}>
            {dev >= 0 ? '+' : ''}{dev.toFixed(1)}% ({dev >= 0 ? data.aheadLabel : data.behindLabel})
          </span>
        </div>
      )}
      <div className="h-[1px] bg-border my-2" />
      <div className="flex justify-between text-xs text-text-muted py-[1px]">
        <span>{data.planLabel}: {formatRupiah(data.plannedCost)}</span>
        <span>{data.actLabel}: {formatRupiah(data.actualCost)}</span>
      </div>
    </div>
  );
};

/* ─── Component ─── */

export default function ProjectDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [vizMode, setVizMode] = useState<'scurve' | 'gantt'>('scurve');
  const [granularity, setGranularity] = useState<'auto' | 'daily' | 'monthly'>('auto');

  const chartRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const userRole = user?.role?.toLowerCase() || 'worker';
  const canSeeFinancials = ['owner', 'director', 'supervisor', 'asset_admin'].includes(userRole);

  useEffect(() => {
    fetchProject();
  }, [id]);

  useEffect(() => {
    if (project && !loading) {
      animateEntrance();
    }
  }, [project, loading, vizMode]);

  const fetchProject = async () => {
    try {
      const [projectRes, suppliesRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/supplies`),
      ]);
      const data = projectRes.data;
      data.supplies = suppliesRes.data || [];
      setProject(data);
    } catch (err) {
      console.error('Failed to fetch project', err);
    } finally {
      setLoading(false);
    }
  };

  const animateEntrance = () => {
    try {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      if (statsRef.current) {
        const cards = statsRef.current.querySelectorAll('.card-component');
        if (cards.length > 0) {
          tl.fromTo(cards,
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.5, stagger: 0.1, clearProps: 'all' },
            0
          );
        }
      }

      if (chartRef.current) {
        tl.fromTo(chartRef.current,
          { y: 40, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, clearProps: 'all' },
          0.2
        );

        setTimeout(() => {
          try {
            const paths = chartRef.current?.querySelectorAll('.recharts-area-curve');
            if (paths) {
              paths.forEach((path: any) => {
                const length = path.getTotalLength?.();
                if (length) {
                  gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
                  gsap.to(path, {
                    strokeDashoffset: 0,
                    duration: 1.5,
                    ease: 'power2.inOut',
                  });
                }
              });
            }
          } catch (e) {
            console.warn('S-curve path animation failed', e);
          }
        }, 300);
      }

      if (tableRef.current) {
        const rows = tableRef.current.querySelectorAll('.table-row, .detail-table-card');
        if (rows.length > 0) {
          tl.fromTo(rows,
            { x: -20, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.4, stagger: 0.05, clearProps: 'all' },
            0.4
          );
        }
      }
    } catch (e) {
      console.warn('GSAP animation failed, content displayed without animation', e);
    }
  };

  if (loading) {
    return <LoadingOverlay visible={true} />;
  }

  if (!project) {
    return (
      <div className="p-6 max-w-[900px] mx-auto max-lg:p-4 max-sm:p-3">
        <p>{t('projectDetail.notFound')}</p>
      </div>
    );
  }

  const budget = project.totalBudget || project.budget || 0;
  const progress = project.progress || 0;
  const workItems = project.workItems || [];
  const supplies = project.supplies || [];

  /* ─── S-Curve Data: Time-based ─── */

  const totalPlannedCost =
    workItems.reduce((s, w) => s + (w.cost || 0), 0) +
    supplies.reduce((s: number, sup: any) => s + (sup.cost || 0), 0);

  const totalActualCost =
    workItems.reduce((s, w) => s + ((w as any).actualCost || 0), 0) +
    supplies.reduce((s: number, sup: any) => s + (sup.actualCost || 0), 0);

  const scurveData: SCurveDataPoint[] = (() => {
    // Need global dates to construct X-axis
    const globalStart = project.startDate || (project.globalDates as any)?.planned?.start;
    const globalEnd = project.endDate || (project.globalDates as any)?.planned?.end;

    if (!globalStart || !globalEnd) return [];
    if (workItems.length === 0 && supplies.length === 0) return [];

    const start = wibDate(globalStart);
    const end = wibDate(globalEnd);
    if (!start || !end) return [];
    const months = monthRange(start, end);
    if (months.length === 0) return [];

    // Determine granularity: respect toggle or auto-detect
    const useDailyMode = granularity === 'daily' ? true : granularity === 'monthly' ? false : months.length === 1;

    // Collect all items (work + supply) with their dates and costs
    interface ScheduleItem {
      startDate: Date;
      endDate: Date;
      plannedCost: number;
      actualCost: number;
    }

    const allItems: ScheduleItem[] = [];

    for (const wi of workItems) {
      const wiAny = wi as any;
      const s = wiAny.startDate || wiAny.dates?.plannedStart;
      const e = wiAny.endDate || wiAny.dates?.plannedEnd;
      const dS = s ? wibDate(s) : start;
      const dE = e ? wibDate(e) : end;
      
      if (dS && dE) {
        allItems.push({
          startDate: dS,
          endDate: dE,
          plannedCost: wi.cost || 0,
          actualCost: wiAny.actualCost || 0,
        });
      }
    }

    for (const sup of supplies as any[]) {
      const s = sup.startDate || sup.deadline;
      const e = sup.endDate || sup.deadline;
      const dS = s ? wibDate(s) : start;
      const dE = e ? wibDate(e) : end;

      if (dS && dE) {
        allItems.push({
          startDate: dS,
          endDate: dE,
          plannedCost: sup.cost || 0,
          actualCost: sup.actualCost || 0,
        });
      }
    }

    if (allItems.length === 0) return [];

    const totalCost = allItems.reduce((s, i) => s + i.plannedCost, 0);
    if (totalCost === 0) return [];

    let cumPlanned = 0;
    let cumActual = 0;
    const now = new Date();
    const points: SCurveDataPoint[] = [];

    if (useDailyMode) {
      // ── Daily granularity ──
      const days = dayRange(start, end);
      if (days.length === 0) return [];
      const todayStr = todayWIB();
      const todayD = wibDate(todayStr);
      const todayDay = todayD ? new Date(todayD) : new Date();

      for (const day of days) {
        let dayPlanned = 0;
        let dayActual = 0;

        for (const item of allItems) {
          dayPlanned += costInDay(item.startDate, item.endDate, item.plannedCost, day);
          dayActual += costInDay(item.startDate, item.endDate, item.actualCost, day);
        }

        cumPlanned += dayPlanned;
        cumActual += dayActual;

        const pPct = Math.min((cumPlanned / totalCost) * 100, 100);
        const aPct = Math.min((cumActual / totalCost) * 100, 100);
        const dDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());

        points.push({
          date: fmtDay(day),
          timestamp: day.getTime(),
          planned: pPct,
          actual: aPct,
          plannedCost: cumPlanned,
          actualCost: cumActual,
          deviation: aPct - pPct,
          isToday: dDay.getTime() === todayDay.getTime(),
          todayLabel: t('projectDetail.tooltip.today'),
          plannedLabel: t('projectDetail.tooltip.planned'),
          actualLabel: t('projectDetail.tooltip.actual'),
          deviationLabel: t('projectDetail.tooltip.deviation'),
          aheadLabel: t('projectDetail.tooltip.ahead'),
          behindLabel: t('projectDetail.tooltip.behind'),
          planLabel: t('projectDetail.tooltip.plan'),
          actLabel: t('projectDetail.tooltip.act'),
        });
      }
    } else {
      // ── Monthly granularity ──
      const todayStr = todayWIB();
      const todayD = wibDate(todayStr);
      const nowMonth = todayD ? new Date(todayD) : new Date();
      nowMonth.setUTCDate(1);

      for (const month of months) {
        let monthPlanned = 0;
        let monthActual = 0;

        for (const item of allItems) {
          monthPlanned += costInMonth(item.startDate, item.endDate, item.plannedCost, month);
          monthActual += costInMonth(item.startDate, item.endDate, item.actualCost, month);
        }

        cumPlanned += monthPlanned;
        cumActual += monthActual;

        const pPct = Math.min((cumPlanned / totalCost) * 100, 100);
        const aPct = Math.min((cumActual / totalCost) * 100, 100);

        points.push({
          date: fmtShort(month),
          timestamp: month.getTime(),
          planned: pPct,
          actual: aPct,
          plannedCost: cumPlanned,
          actualCost: cumActual,
          deviation: aPct - pPct,
          isToday: month.getTime() === nowMonth.getTime(),
          todayLabel: t('projectDetail.tooltip.today'),
          plannedLabel: t('projectDetail.tooltip.planned'),
          actualLabel: t('projectDetail.tooltip.actual'),
          deviationLabel: t('projectDetail.tooltip.deviation'),
          aheadLabel: t('projectDetail.tooltip.ahead'),
          behindLabel: t('projectDetail.tooltip.behind'),
          planLabel: t('projectDetail.tooltip.plan'),
          actLabel: t('projectDetail.tooltip.act'),
        });
      }
    }

    return points;
  })();

  // ─── Derive "today" label for the chart reference line ───
  const useDailyMode = granularity === 'daily' ? true : granularity === 'monthly' ? false : monthRange(new Date(project.startDate || (project.globalDates as any)?.planned?.start), new Date(project.endDate || (project.globalDates as any)?.planned?.end)).length === 1;
  const todayLabel = useDailyMode ? fmtDay(todayWIB()) : fmtShort(todayWIB());
  const todayDataPoint = scurveData.find((d) => d.isToday);
  const hasTodayOnChart = scurveData.some((d) => d.isToday);

  // ─── Performance Metrics ───
  const latestActualPoint = [...scurveData].reverse().find((d) => d.actual > 0);
  const costVariance = totalPlannedCost > 0 ? ((totalActualCost - totalPlannedCost) / totalPlannedCost) * 100 : 0;
  const cpi = totalActualCost > 0 && totalPlannedCost > 0
    ? (totalPlannedCost * (progress / 100)) / totalActualCost
    : 0;
  const scheduleDeviation = todayDataPoint ? todayDataPoint.deviation : 0;
  const isAheadOfSchedule = scheduleDeviation >= 0;
  const isUnderBudget = costVariance <= 0;

  return (
    <div className="p-6 max-w-[900px] mx-auto max-lg:p-4 max-sm:p-3">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <button className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center cursor-pointer transition-colors border-none text-text-primary hover:bg-border" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0 max-sm:text-xl">{project.nama || project.name}</h1>
          <p className="text-sm text-text-muted mt-[2px]">{project.lokasi || project.location}</p>
        </div>
      </div>

      <div ref={statsRef}>
        {/* Progress Card */}
        <Card className="p-6 mb-4 bg-gradient-to-br from-primary to-primary-light text-white border-none">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-white/80 font-medium">{t('projectDetail.progress.overall')}</span>
            <span className="text-2xl font-bold text-white">{progress}%</span>
          </div>
          <div className="h-2 bg-white/30 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-4 max-sm:grid-cols-1">
          <Card className="flex items-center gap-3 p-4">
            <Calendar size={24} color="var(--primary)" />
            <div className="flex flex-col">
              <span className="text-sm text-text-muted font-medium">{t('projectDetail.stats.start')}</span>
              <span className="text-base text-text-primary font-bold">
                {fmtDate(project.startDate || (project.globalDates as any)?.planned?.start)}
              </span>
            </div>
          </Card>

          <Card className="flex items-center gap-3 p-4">
            <Calendar size={24} color="var(--danger, #EF4444)" />
            <div className="flex flex-col">
              <span className="text-sm text-text-muted font-medium">{t('projectDetail.stats.end')}</span>
              <span className="text-base text-text-primary font-bold">
                {fmtDate(project.endDate || (project.globalDates as any)?.planned?.end)}
              </span>
            </div>
          </Card>

          <Card className="flex items-center gap-3 p-4">
            <DollarSign size={24} color="var(--success)" />
            <div className="flex flex-col">
              <span className="text-sm text-text-muted font-medium">{t('projectDetail.stats.budget')}</span>
              <span className="text-base text-text-primary font-bold">{formatRupiah(budget)}</span>
            </div>
          </Card>

          {canSeeFinancials && (
            <>
              <Card className="flex items-center gap-3 p-4">
                <TrendingUp size={24} color="var(--warning)" />
                <div className="flex flex-col">
                  <span className="text-sm text-text-muted font-medium">{t('projectDetail.stats.plannedCost')}</span>
                  <span className="text-base text-text-primary font-bold">{formatRupiah(totalPlannedCost)}</span>
                </div>
              </Card>

              <Card className="flex items-center gap-3 p-4">
                <BarChart3 size={24} color="var(--info, #3B82F6)" />
                <div className="flex flex-col">
                  <span className="text-sm text-text-muted font-medium">{t('projectDetail.stats.actualCost')}</span>
                  <span className="text-base text-text-primary font-bold">{formatRupiah(totalActualCost)}</span>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Data Visualization: S-Curve / Gantt Chart */}
      {canSeeFinancials && (scurveData.length >= 1 || workItems.length > 0 || supplies.length > 0) && (
        <div ref={chartRef}>
          <Card className="mb-4 p-5 overflow-visible max-sm:p-3">
            {/* ── Viz Tab Switcher ── */}
            <div className="flex justify-between items-start mb-4 gap-3 flex-wrap max-lg:flex-col max-lg:gap-2">
              <div>
                <h3 className="text-lg font-bold text-text-primary m-0">
                  {vizMode === 'scurve' ? t('projectDetail.scurve.title') : t('projectDetail.gantt.title')}
                </h3>
                <p className="text-xs text-text-muted mt-[2px]">
                  {vizMode === 'scurve' ? t('projectDetail.scurve.subtitle') : t('projectDetail.gantt.subtitle')}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 max-lg:w-full max-lg:justify-between">
                {/* Granularity Switcher (S-Curve Only) */}
                {vizMode === 'scurve' && (
                  <div className="flex bg-bg-secondary rounded-lg p-[3px] gap-[2px]">
                    {[
                      { id: 'auto', label: 'Auto' },
                      { id: 'daily', label: 'Daily' },
                      { id: 'monthly', label: 'Monthly' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        className={`py-[6px] px-[12px] border-none bg-transparent rounded-md text-[10px] font-bold uppercase tracking-wider text-text-muted cursor-pointer transition-all hover:text-text-primary${granularity === opt.id ? ' bg-bg-primary !text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : ''}`}
                        onClick={() => setGranularity(opt.id as any)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Viz Mode Switcher */}
                <div className="flex bg-bg-secondary rounded-lg p-[3px] gap-[2px]">
                  <button
                    className={`flex items-center gap-[6px] py-[6px] px-[14px] border-none bg-transparent rounded-md text-xs font-semibold text-text-muted cursor-pointer transition-all hover:text-text-primary hover:bg-bg-primary whitespace-nowrap${vizMode === 'scurve' ? ' bg-bg-primary !text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : ''}`}
                    onClick={() => setVizMode('scurve')}
                  >
                    <TrendingUp size={14} />
                    S-Curve
                  </button>
                  <button
                    className={`flex items-center gap-[6px] py-[6px] px-[14px] border-none bg-transparent rounded-md text-xs font-semibold text-text-muted cursor-pointer transition-all hover:text-text-primary hover:bg-bg-primary whitespace-nowrap${vizMode === 'gantt' ? ' bg-bg-primary !text-primary shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : ''}`}
                    onClick={() => setVizMode('gantt')}
                  >
                    <BarChart3 size={14} />
                    Gantt
                  </button>
                </div>
              </div>
            </div>

            {/* ── S-Curve View ── */}
            {vizMode === 'scurve' && scurveData.length >= 1 && (
              <>
                <div className="flex justify-between items-start mb-4 max-lg:flex-col max-lg:gap-2" style={{ marginTop: 0 }}>
                  <div />
                  <div className="flex gap-4 items-center max-sm:gap-2">
                    <span className="flex items-center gap-1 text-xs text-text-secondary font-medium">
                      <span className="w-[10px] h-[10px] rounded-full bg-[#6366f1]" /> {t('projectDetail.scurve.planned')}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-text-secondary font-medium">
                      <span className="w-[10px] h-[10px] rounded-full bg-[#10b981]" /> {t('projectDetail.scurve.actual')}
                    </span>
                    {hasTodayOnChart && (
                      <span className="flex items-center gap-1 text-xs text-text-secondary font-medium">
                        <span className="w-[10px] h-[10px] rounded-full bg-[#f59e0b]" /> {t('projectDetail.scurve.today')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full overflow-x-auto">
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={scurveData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                      <defs>
                        <linearGradient id="plannedGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                        interval={scurveData.length > 12 ? Math.floor(scurveData.length / 8) : 0}
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip content={<SCurveTooltip />} />
                      <ReferenceLine y={50} stroke="var(--border)" strokeDasharray="5 5" opacity={0.4} />
                      {hasTodayOnChart && (
                        <ReferenceLine
                          x={todayLabel}
                          stroke="#F59E0B"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          label={{ value: t('projectDetail.scurve.today'), position: 'top', fill: '#F59E0B', fontSize: 11, fontWeight: 700 }}
                        />
                      )}
                      <Area type="monotone" dataKey="planned" stroke="#6366F1" strokeWidth={3} fill="url(#plannedGradient)" dot={{ r: 4, fill: '#6366F1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, fill: '#6366F1', stroke: '#fff', strokeWidth: 2 }} animationDuration={0} />
                      <Area type="monotone" dataKey="actual" stroke="#10B981" strokeWidth={3} fill="url(#actualGradient)" dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }} animationDuration={0} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Performance Summary */}
                <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-border max-sm:grid-cols-2">
                  <div className={`flex items-center gap-2 p-3 rounded-lg bg-bg-secondary transition-all hover:-translate-y-[1px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]`}>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${isAheadOfSchedule ? 'bg-[#10b981]/12 text-[#10b981]' : 'bg-[#ef4444]/12 text-[#ef4444]'}`}>{isAheadOfSchedule ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}</div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs text-text-muted font-medium whitespace-nowrap">{t('projectDetail.scurve.performance.schedule')}</span>
                      <span className={`text-sm font-bold whitespace-nowrap ${isAheadOfSchedule ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                        {Math.abs(scheduleDeviation).toFixed(1)}% {isAheadOfSchedule ? t('projectDetail.scurve.performance.ahead') : t('projectDetail.scurve.performance.behind')}
                      </span>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 p-3 rounded-lg bg-bg-secondary transition-all hover:-translate-y-[1px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]`}>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${isUnderBudget ? 'bg-[#10b981]/12 text-[#10b981]' : 'bg-[#ef4444]/12 text-[#ef4444]'}`}>{isUnderBudget ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}</div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs text-text-muted font-medium whitespace-nowrap">{t('projectDetail.scurve.performance.costVariance')}</span>
                      <span className={`text-sm font-bold whitespace-nowrap ${isUnderBudget ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{costVariance >= 0 ? '+' : ''}{costVariance.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-bg-secondary transition-all hover:-translate-y-[1px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 bg-[#6366f1]/12 text-[#6366f1]"><Target size={18} /></div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs text-text-muted font-medium whitespace-nowrap">{t('projectDetail.scurve.performance.cpi')}</span>
                      <span className="text-sm font-bold text-text-primary whitespace-nowrap">{cpi > 0 ? cpi.toFixed(2) : t('projectDetail.scurve.performance.na')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-bg-secondary transition-all hover:-translate-y-[1px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 bg-[#6366f1]/12 text-[#6366f1]"><Clock size={18} /></div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs text-text-muted font-medium whitespace-nowrap">{t('projectDetail.scurve.performance.elapsed')}</span>
                      <span className="text-sm font-bold text-text-primary whitespace-nowrap">
                        {(() => {
                          const gs = project.startDate || (project.globalDates as any)?.planned?.start;
                          const ge = project.endDate || (project.globalDates as any)?.planned?.end;
                          if (!gs || !ge) return t('projectDetail.scurve.performance.na');
                          const total = new Date(ge).getTime() - new Date(gs).getTime();
                          const elapsed = Date.now() - new Date(gs).getTime();
                          const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
                          return `${pct.toFixed(0)}%`;
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Gantt Chart View ── */}
            {vizMode === 'gantt' && (() => {
              const globalStart = project.startDate || (project.globalDates as any)?.planned?.start;
              const globalEnd = project.endDate || (project.globalDates as any)?.planned?.end;
              if (!globalStart || !globalEnd) return <p className="gantt-no-data">{t('projectDetail.gantt.noData')}</p>;

              const projStart = new Date(globalStart);
              const projEnd = new Date(globalEnd);
              const months = monthRange(projStart, projEnd);
              if (months.length === 0) return <p className="gantt-no-data">{t('projectDetail.gantt.noData')}</p>;

              const totalMs = projEnd.getTime() - projStart.getTime();
              if (totalMs <= 0) return <p className="gantt-no-data">{t('projectDetail.gantt.noData')}</p>;

              const toPercent = (d: Date) => {
                const pct = ((d.getTime() - projStart.getTime()) / totalMs) * 100;
                return Math.max(0, Math.min(100, pct));
              };

              const now = new Date();
              const todayPct = toPercent(now);
              const showToday = todayPct > 0 && todayPct < 100;

              // Build gantt items
              interface GanttItem {
                name: string;
                type: 'work' | 'supply';
                startDate: Date;
                endDate: Date;
                progress: number;
                cost: number;
                status?: string;
              }
              const ganttItems: GanttItem[] = [];

              for (const wi of workItems) {
                const wiAny = wi as any;
                const s = wiAny.startDate || wiAny.dates?.plannedStart;
                const e = wiAny.endDate || wiAny.dates?.plannedEnd;
                if (s && e) {
                  ganttItems.push({
                    name: wi.name,
                    type: 'work',
                    startDate: new Date(s),
                    endDate: new Date(e),
                    progress: wiAny.progress || 0,
                    cost: wi.cost || 0,
                  });
                }
              }

              for (const sup of supplies as any[]) {
                const s = sup.startDate || sup.deadline;
                const e = sup.endDate || sup.deadline;
                if (s && e) {
                  ganttItems.push({
                    name: sup.item || sup.name,
                    type: 'supply',
                    startDate: new Date(s),
                    endDate: new Date(e),
                    progress: sup.status === 'Delivered' ? 100 : sup.status === 'Ordered' ? 50 : 0,
                    cost: sup.cost || 0,
                    status: sup.status,
                  });
                }
              }

              if (ganttItems.length === 0) return <p className="gantt-no-data">{t('projectDetail.gantt.noData')}</p>;

              return (
                <div className="mt-2">
                  {/* Legend */}
                  <div className="flex gap-4 items-center mb-3 justify-end max-sm:gap-2 max-sm:flex-wrap max-sm:justify-start">
                    <span className="flex items-center gap-1 text-xs text-text-secondary font-medium"><span className="w-[10px] h-[10px] rounded-full bg-[#6366f1]" /> {t('projectDetail.gantt.workItems')}</span>
                    <span className="flex items-center gap-1 text-xs text-text-secondary font-medium"><span className="w-[10px] h-[10px] rounded-full bg-[#f59e0b]" /> {t('projectDetail.gantt.supplies')}</span>
                    {showToday && <span className="flex items-center gap-1 text-xs text-text-secondary font-medium"><span className="w-[10px] h-[10px] rounded-full bg-[#f59e0b]" /> {t('projectDetail.gantt.today')}</span>}
                  </div>

                  <div className="overflow-x-auto overflow-y-visible pb-2 [-webkit-overflow-scrolling:touch]">
                    <div className="relative" style={{ minWidth: Math.max(600, months.length * 80) }}>
                      {/* Month header */}
                      <div className="flex items-stretch min-h-[36px] border-b-2 border-border mb-1">
                        <div className="w-[160px] min-w-[160px] max-sm:w-[100px] max-sm:min-w-[100px] max-sm:text-[10px] shrink-0 flex items-center gap-2 py-1 px-2 text-xs text-text-secondary font-semibold overflow-hidden">&nbsp;</div>
                        <div className="flex-1 relative min-h-[32px]">
                          {months.map((m, i) => (
                            <div
                              key={i}
                              className="absolute top-0 bottom-0 flex items-center justify-center text-[10px] font-bold text-text-muted uppercase tracking-[0.5px] border-l border-border box-border"
                              style={{
                                left: `${toPercent(m)}%`,
                                width: `${i < months.length - 1 ? toPercent(months[i + 1]) - toPercent(m) : 100 - toPercent(m)}%`,
                              }}
                            >
                              {fmtShort(m)}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Rows */}
                      {ganttItems.map((item, idx) => {
                        const left = toPercent(item.startDate);
                        const right = toPercent(item.endDate);
                        const width = Math.max(right - left, 1);
                        const isWork = item.type === 'work';
                        const barColor = isWork ? '#6366F1' : '#F59E0B';
                        const fillColor = isWork ? '#818CF8' : '#FCD34D';

                        return (
                          <div key={idx} className="flex items-stretch min-h-[36px] border-b border-border transition-colors hover:bg-bg-secondary last:border-b-0">
                            <div className="w-[160px] min-w-[160px] max-sm:w-[100px] max-sm:min-w-[100px] max-sm:text-[10px] shrink-0 flex items-center gap-2 py-1 px-2 text-xs text-text-secondary font-semibold overflow-hidden" title={item.name}>
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: barColor }} />
                              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{item.name}</span>
                            </div>
                            <div className="flex-1 relative min-h-[32px]">
                              {/* Grid lines */}
                              {months.map((m, i) => (
                                <div key={i} className="absolute top-0 bottom-0 w-[1px] bg-border opacity-40 pointer-events-none" style={{ left: `${toPercent(m)}%` }} />
                              ))}
                              {/* Today marker */}
                              {showToday && <div className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-[#f59e0b] z-[3] rounded-[1px] pointer-events-none before:content-[''] before:absolute before:top-[-4px] before:left-[-3px] before:w-2 before:h-2 before:bg-[#f59e0b] before:rounded-full" style={{ left: `${todayPct}%` }} />}
                              {/* Bar */}
                              <div
                                className="absolute top-[4px] bottom-[4px] rounded-md overflow-hidden cursor-pointer transition-all duration-150 z-[2] flex items-center hover:scale-y-[1.15] hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:z-[5] group"
                                style={{ left: `${left}%`, width: `${width}%`, background: `${barColor}22`, border: `1.5px solid ${barColor}` }}
                              >
                                <div className="absolute top-0 left-0 bottom-0 rounded-md transition-[width] duration-300" style={{ width: `${item.progress}%`, background: fillColor }} />
                                {width > 8 && (
                                  <span className="relative z-[2] text-[9px] font-extrabold px-[6px] whitespace-nowrap tracking-[0.3px]" style={{ color: item.progress > 50 ? '#fff' : barColor }}>
                                    {item.progress}%
                                  </span>
                                )}
                                {/* Tooltip */}
                                <div className="hidden group-hover:block absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 bg-bg-primary border border-border rounded-lg p-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)] min-w-[200px] backdrop-blur-[12px] z-20 pointer-events-none animate-[ganttTooltipIn_0.15s_ease]">
                                  <div className="flex items-center gap-2 text-sm font-bold text-text-primary mb-1">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: barColor }} />
                                    {item.name}
                                  </div>
                                  <div className="h-[1px] bg-border my-2" />
                                  <div className="flex justify-between items-center gap-3 text-xs text-text-secondary py-[2px] [&>strong]:text-text-primary [&>strong]:font-bold">
                                    <span>{fmtDate(item.startDate)} → {fmtDate(item.endDate)}</span>
                                  </div>
                                  <div className="flex justify-between items-center gap-3 text-xs text-text-secondary py-[2px] [&>strong]:text-text-primary [&>strong]:font-bold">
                                    <span>{t('projectDetail.gantt.progress')}</span>
                                    <strong>{item.progress}%</strong>
                                  </div>
                                  {canSeeFinancials && (
                                    <div className="flex justify-between items-center gap-3 text-xs text-text-secondary py-[2px] [&>strong]:text-text-primary [&>strong]:font-bold">
                                      <span>{t('projectDetail.gantt.cost')}</span>
                                      <strong>{formatRupiah(item.cost)}</strong>
                                    </div>
                                  )}
                                  {item.status && (
                                    <div className="flex justify-between items-center gap-3 text-xs text-text-secondary py-[2px] [&>strong]:text-text-primary [&>strong]:font-bold">
                                      <span>Status</span>
                                      <strong>{item.status}</strong>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </Card>
        </div>
      )}

      {/* Work Items Table */}
      {workItems.length > 0 && (
        <div ref={tableRef}>
          <Card className="mb-4 overflow-hidden">
            <div className="flex items-center gap-2 p-4 pb-3 max-sm:p-3">
              <Layers size={20} color="var(--primary)" />
              <h3 className="text-base font-bold text-text-primary m-0 flex-1">{t('projectDetail.workItems.title')}</h3>
              <Badge label={`${workItems.length} ${t('projectDetail.workItems.items')}`} variant="neutral" size="small" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm [&_th]:py-2 [&_th]:px-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:text-text-muted [&_th]:uppercase [&_th]:tracking-[0.5px] [&_th]:border-b [&_th]:border-border [&_th]:whitespace-nowrap [&_th]:bg-bg-secondary [&_td]:p-3 [&_td]:border-b [&_td]:border-border [&_td]:text-text-secondary [&_td]:whitespace-nowrap [&_tbody>tr:last-child>td]:border-b-0 [&_tbody>tr:hover]:bg-bg-secondary">
                <thead>
                  <tr>
                    <th>{t('projectDetail.workItems.headers.num')}</th>
                    <th>{t('projectDetail.workItems.headers.name')}</th>
                    <th>{t('projectDetail.workItems.headers.start')}</th>
                    <th>{t('projectDetail.workItems.headers.end')}</th>
                    <th>{t('projectDetail.workItems.headers.qty')}</th>
                    <th>{t('projectDetail.workItems.headers.unit')}</th>
                    {canSeeFinancials && <th>{t('projectDetail.workItems.headers.cost')}</th>}
                    {canSeeFinancials && <th>{t('projectDetail.workItems.headers.weight')}</th>}
                    <th>{t('projectDetail.workItems.headers.progress')}</th>
                    {canSeeFinancials && <th>{t('projectDetail.workItems.headers.actualCost')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {workItems.map((item, i) => {
                    const weight = totalPlannedCost > 0
                      ? ((item.cost || 0) / totalPlannedCost * 100).toFixed(1)
                      : '0';
                    const wiAny = item as any;
                    return (
                      <tr key={wiAny._id || i} className="transition-colors duration-150">
                        <td className="font-bold text-text-muted text-xs w-8">{i + 1}</td>
                        <td className="font-semibold text-text-primary max-w-[200px] overflow-hidden text-ellipsis">{item.name}</td>
                        <td className="text-xs text-text-muted font-medium whitespace-nowrap">{fmtDate(wiAny.startDate || wiAny.dates?.plannedStart)}</td>
                        <td className="text-xs text-text-muted font-medium whitespace-nowrap">{fmtDate(wiAny.endDate || wiAny.dates?.plannedEnd)}</td>
                        <td>{item.qty || 0}</td>
                        <td>{wiAny.unit || item.volume || '-'}</td>
                        {canSeeFinancials && <td className="font-mono text-xs font-semibold">{formatRupiah(item.cost || 0)}</td>}
                        {canSeeFinancials && (
                          <td>
                            <Badge label={`${weight}%`} variant="primary" size="small" />
                          </td>
                        )}
                        <td>
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <div className="flex-1 h-[6px] bg-bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-[width] duration-300"
                                style={{ width: `${wiAny.progress || 0}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-text-primary min-w-[36px] text-right">{wiAny.progress || 0}%</span>
                          </div>
                        </td>
                        {canSeeFinancials && <td className="font-mono text-xs font-semibold">{formatRupiah(wiAny.actualCost || 0)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Supply Plan Table */}
          {canSeeFinancials && supplies.length > 0 && (
            <Card className="mb-4 overflow-hidden">
              <div className="flex items-center gap-2 p-4 pb-3 max-sm:p-3">
                <Package size={20} color="var(--warning)" />
                <h3 className="text-base font-bold text-text-primary m-0 flex-1">{t('projectDetail.supplyPlan.title')}</h3>
                <Badge label={`${supplies.length} ${t('projectDetail.supplyPlan.items')}`} variant="neutral" size="small" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm [&_th]:py-2 [&_th]:px-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:text-text-muted [&_th]:uppercase [&_th]:tracking-[0.5px] [&_th]:border-b [&_th]:border-border [&_th]:whitespace-nowrap [&_th]:bg-bg-secondary [&_td]:p-3 [&_td]:border-b [&_td]:border-border [&_td]:text-text-secondary [&_td]:whitespace-nowrap [&_tbody>tr:last-child>td]:border-b-0 [&_tbody>tr:hover]:bg-bg-secondary">
                  <thead>
                    <tr>
                      <th>{t('projectDetail.supplyPlan.headers.num')}</th>
                      <th>{t('projectDetail.supplyPlan.headers.item')}</th>
                      <th>{t('projectDetail.supplyPlan.headers.start')}</th>
                      <th>{t('projectDetail.supplyPlan.headers.end')}</th>
                      <th>{t('projectDetail.supplyPlan.headers.qty')}</th>
                      <th>{t('projectDetail.supplyPlan.headers.unit')}</th>
                      <th>{t('projectDetail.supplyPlan.headers.cost')}</th>
                      <th>{t('projectDetail.supplyPlan.headers.weight')}</th>
                      <th>{t('projectDetail.supplyPlan.headers.status')}</th>
                      <th>{t('projectDetail.supplyPlan.headers.actualCost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplies.map((s: any, i: number) => {
                      const supplyWeight = totalPlannedCost > 0
                        ? ((s.cost || 0) / totalPlannedCost * 100).toFixed(1)
                        : '0';
                      return (
                        <tr key={s._id || i} className="transition-colors duration-150">
                          <td className="font-bold text-text-muted text-xs w-8">{i + 1}</td>
                          <td className="font-semibold text-text-primary max-w-[200px] overflow-hidden text-ellipsis">{s.item}</td>
                          <td className="text-xs text-text-muted font-medium whitespace-nowrap">{fmtDate(s.startDate)}</td>
                          <td className="text-xs text-text-muted font-medium whitespace-nowrap">{fmtDate(s.endDate)}</td>
                          <td>{s.qty || 0}</td>
                          <td>{s.unit || '-'}</td>
                          <td className="font-mono text-xs font-semibold">{formatRupiah(s.cost || 0)}</td>
                          <td>
                            <Badge label={`${supplyWeight}%`} variant="warning" size="small" />
                          </td>
                          <td>
                            <Badge
                              label={s.status || 'Pending'}
                              variant={
                                s.status === 'Delivered' ? 'success'
                                  : s.status === 'Ordered' ? 'primary'
                                    : 'neutral'
                              }
                              size="small"
                            />
                          </td>
                          <td className="font-mono text-xs font-semibold">{formatRupiah(s.actualCost || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <Card className="mb-4">
        <h3 className="text-base font-bold text-text-primary mb-4 mt-0">{t('projectDetail.actions.title')}</h3>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Button
            title={t('projectDetail.actions.dailyReport')}
            icon={FileText}
            onClick={() => navigate(`/daily-report?projectId=${id}`)}
            variant="outline"
            fullWidth
          />
          <Button
            title={t('projectDetail.actions.toolInventory')}
            icon={Wrench}
            onClick={() => navigate(`/project-tools/${id}`)}
            variant="outline"
            fullWidth
          />
          <Button
            title="Material Usage"
            icon={BarChart3}
            onClick={() => navigate(`/project-material-usage/${id}`)}
            variant="outline"
            fullWidth
          />
          <Button
            title={t('projectDetail.actions.materialPlan')}
            icon={Package}
            onClick={() => navigate(`/project-materials/${id}`)}
            variant="outline"
            fullWidth
          />
          <Button
            title={t('projectDetail.actions.projectReports')}
            icon={FileText}
            onClick={() => navigate(`/project-reports/${id}`)}
            variant="outline"
            fullWidth
          />
        </div>
      </Card>

      {project.description && (
        <Card className="mt-4">
          <h3 className="text-base font-bold text-text-primary mb-3 mt-0">{t('projectDetail.description.title')}</h3>
          <p className="text-base text-text-secondary leading-relaxed m-0">{project.description}</p>
        </Card>
      )}
    </div>
  );
}
