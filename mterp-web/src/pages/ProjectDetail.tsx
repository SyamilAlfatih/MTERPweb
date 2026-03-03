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
import './ProjectDetail.css';

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
  const dt = new Date(d);
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtShort = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

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

/* ─── Tooltip ─── */

const SCurveTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload as SCurveDataPoint;
  if (!data) return null;

  const dev = data.deviation;
  const devColor = dev >= 0 ? '#10B981' : '#EF4444';

  return (
    <div className="scurve-tooltip">
      <div className="scurve-tooltip-title">
        {data.date}
        {data.isToday && <span className="scurve-tooltip-today-badge">{data.todayLabel}</span>}
      </div>
      <div className="scurve-tooltip-divider" />
      <div className="scurve-tooltip-row">
        <span className="scurve-tooltip-dot planned" />
        <span>{data.plannedLabel}</span>
        <span className="scurve-tooltip-value">{data.planned.toFixed(1)}%</span>
      </div>
      <div className="scurve-tooltip-row">
        <span className="scurve-tooltip-dot actual" />
        <span>{data.actualLabel}</span>
        <span className="scurve-tooltip-value">{data.actual.toFixed(1)}%</span>
      </div>
      {data.actual > 0 && (
        <div className="scurve-tooltip-row">
          <span className="scurve-tooltip-dot" style={{ backgroundColor: devColor }} />
          <span>{data.deviationLabel}</span>
          <span className="scurve-tooltip-value" style={{ color: devColor }}>
            {dev >= 0 ? '+' : ''}{dev.toFixed(1)}% ({dev >= 0 ? data.aheadLabel : data.behindLabel})
          </span>
        </div>
      )}
      <div className="scurve-tooltip-divider" />
      <div className="scurve-tooltip-detail">
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
  }, [project, loading]);

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
      <div className="project-detail-container">
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

    const start = new Date(globalStart);
    const end = new Date(globalEnd);
    const months = monthRange(start, end);
    if (months.length === 0) return [];

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
      if (s && e) {
        allItems.push({
          startDate: new Date(s),
          endDate: new Date(e),
          plannedCost: wi.cost || 0,
          actualCost: wiAny.actualCost || 0,
        });
      }
    }

    for (const sup of supplies as any[]) {
      const s = sup.startDate || sup.deadline;
      const e = sup.endDate || sup.deadline;
      if (s && e) {
        allItems.push({
          startDate: new Date(s),
          endDate: new Date(e),
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
    const nowMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const points: SCurveDataPoint[] = [];

    for (const month of months) {
      let monthPlanned = 0;
      let monthActual = 0;

      for (const item of allItems) {
        const plannedInMonth = costInMonth(item.startDate, item.endDate, item.plannedCost, month);
        monthPlanned += plannedInMonth;

        const actualInMonth = costInMonth(item.startDate, item.endDate, item.actualCost, month);
        monthActual += actualInMonth;
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

    return points;
  })();

  // ─── Derive "today" label for the chart reference line ───
  const todayLabel = fmtShort(new Date());
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
    <div className="project-detail-container">
      {/* Header */}
      <div className="detail-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="detail-title">{project.nama || project.name}</h1>
          <p className="detail-location">{project.lokasi || project.location}</p>
        </div>
      </div>

      <div ref={statsRef}>
        {/* Progress Card */}
        <Card className="progress-card gradient-primary">
          <div className="progress-header">
            <span className="progress-label">{t('projectDetail.progress.overall')}</span>
            <span className="progress-value">{progress}%</span>
          </div>
          <div className="progress-bar-white">
            <div className="progress-fill-white" style={{ width: `${progress}%` }} />
          </div>
        </Card>

        {/* Stats Grid */}
        <div className="stats-grid">
          <Card className="stat-card">
            <Calendar size={24} color="var(--primary)" />
            <div className="stat-content">
              <span className="stat-label">{t('projectDetail.stats.start')}</span>
              <span className="stat-value">
                {fmtDate(project.startDate || (project.globalDates as any)?.planned?.start)}
              </span>
            </div>
          </Card>

          <Card className="stat-card">
            <Calendar size={24} color="var(--danger, #EF4444)" />
            <div className="stat-content">
              <span className="stat-label">{t('projectDetail.stats.end')}</span>
              <span className="stat-value">
                {fmtDate(project.endDate || (project.globalDates as any)?.planned?.end)}
              </span>
            </div>
          </Card>

          <Card className="stat-card">
            <DollarSign size={24} color="var(--success)" />
            <div className="stat-content">
              <span className="stat-label">{t('projectDetail.stats.budget')}</span>
              <span className="stat-value">{formatRupiah(budget)}</span>
            </div>
          </Card>

          {canSeeFinancials && (
            <>
              <Card className="stat-card">
                <TrendingUp size={24} color="var(--warning)" />
                <div className="stat-content">
                  <span className="stat-label">{t('projectDetail.stats.plannedCost')}</span>
                  <span className="stat-value">{formatRupiah(totalPlannedCost)}</span>
                </div>
              </Card>

              <Card className="stat-card">
                <BarChart3 size={24} color="var(--info, #3B82F6)" />
                <div className="stat-content">
                  <span className="stat-label">{t('projectDetail.stats.actualCost')}</span>
                  <span className="stat-value">{formatRupiah(totalActualCost)}</span>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* S-Curve Chart — Time-based */}
      {canSeeFinancials && scurveData.length > 1 && (
        <div ref={chartRef}>
          <Card className="scurve-card">
            <div className="scurve-header">
              <div>
                <h3 className="scurve-title">{t('projectDetail.scurve.title')}</h3>
                <p className="scurve-subtitle">{t('projectDetail.scurve.subtitle')}</p>
              </div>
              <div className="scurve-legend">
                <span className="legend-item">
                  <span className="legend-dot planned" /> {t('projectDetail.scurve.planned')}
                </span>
                <span className="legend-item">
                  <span className="legend-dot actual" /> {t('projectDetail.scurve.actual')}
                </span>
                {hasTodayOnChart && (
                  <span className="legend-item">
                    <span className="legend-dot today" /> {t('projectDetail.scurve.today')}
                  </span>
                )}
              </div>
            </div>
            <div className="scurve-chart-wrapper">
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
                  {/* Today marker line */}
                  {hasTodayOnChart && (
                    <ReferenceLine
                      x={todayLabel}
                      stroke="#F59E0B"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      label={{ value: t('projectDetail.scurve.today'), position: 'top', fill: '#F59E0B', fontSize: 11, fontWeight: 700 }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="planned"
                    stroke="#6366F1"
                    strokeWidth={3}
                    fill="url(#plannedGradient)"
                    dot={{ r: 4, fill: '#6366F1', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, fill: '#6366F1', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={0}
                  />
                  <Area
                    type="monotone"
                    dataKey="actual"
                    stroke="#10B981"
                    strokeWidth={3}
                    fill="url(#actualGradient)"
                    dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={0}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Performance Summary below chart */}
            <div className="scurve-performance">
              <div className={`perf-card ${isAheadOfSchedule ? 'perf-good' : 'perf-bad'}`}>
                <div className="perf-icon">
                  {isAheadOfSchedule ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                </div>
                <div className="perf-info">
                  <span className="perf-label">{t('projectDetail.scurve.performance.schedule')}</span>
                  <span className="perf-value">
                    {Math.abs(scheduleDeviation).toFixed(1)}% {isAheadOfSchedule ? t('projectDetail.scurve.performance.ahead') : t('projectDetail.scurve.performance.behind')}
                  </span>
                </div>
              </div>

              <div className={`perf-card ${isUnderBudget ? 'perf-good' : 'perf-bad'}`}>
                <div className="perf-icon">
                  {isUnderBudget ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                </div>
                <div className="perf-info">
                  <span className="perf-label">{t('projectDetail.scurve.performance.costVariance')}</span>
                  <span className="perf-value">
                    {costVariance >= 0 ? '+' : ''}{costVariance.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="perf-card perf-neutral">
                <div className="perf-icon"><Target size={18} /></div>
                <div className="perf-info">
                  <span className="perf-label">{t('projectDetail.scurve.performance.cpi')}</span>
                  <span className="perf-value">{cpi > 0 ? cpi.toFixed(2) : t('projectDetail.scurve.performance.na')}</span>
                </div>
              </div>

              <div className="perf-card perf-neutral">
                <div className="perf-icon"><Clock size={18} /></div>
                <div className="perf-info">
                  <span className="perf-label">{t('projectDetail.scurve.performance.elapsed')}</span>
                  <span className="perf-value">
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
          </Card>
        </div>
      )}

      {/* Work Items Table */}
      {workItems.length > 0 && (
        <div ref={tableRef}>
          <Card className="detail-table-card">
            <div className="detail-table-header">
              <Layers size={20} color="var(--primary)" />
              <h3>{t('projectDetail.workItems.title')}</h3>
              <Badge label={`${workItems.length} ${t('projectDetail.workItems.items')}`} variant="neutral" size="small" />
            </div>
            <div className="detail-table-scroll">
              <table className="detail-table">
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
                      <tr key={wiAny._id || i} className="table-row">
                        <td className="table-num">{i + 1}</td>
                        <td className="table-name">{item.name}</td>
                        <td className="table-date">{fmtDate(wiAny.startDate || wiAny.dates?.plannedStart)}</td>
                        <td className="table-date">{fmtDate(wiAny.endDate || wiAny.dates?.plannedEnd)}</td>
                        <td>{item.qty || 0}</td>
                        <td>{wiAny.unit || item.volume || '-'}</td>
                        {canSeeFinancials && <td className="table-cost">{formatRupiah(item.cost || 0)}</td>}
                        {canSeeFinancials && (
                          <td>
                            <Badge label={`${weight}%`} variant="primary" size="small" />
                          </td>
                        )}
                        <td>
                          <div className="table-progress">
                            <div className="table-progress-bar">
                              <div
                                className="table-progress-fill"
                                style={{ width: `${wiAny.progress || 0}%` }}
                              />
                            </div>
                            <span className="table-progress-text">{wiAny.progress || 0}%</span>
                          </div>
                        </td>
                        {canSeeFinancials && <td className="table-cost">{formatRupiah(wiAny.actualCost || 0)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Supply Plan Table */}
          {canSeeFinancials && supplies.length > 0 && (
            <Card className="detail-table-card">
              <div className="detail-table-header">
                <Package size={20} color="var(--warning)" />
                <h3>{t('projectDetail.supplyPlan.title')}</h3>
                <Badge label={`${supplies.length} ${t('projectDetail.supplyPlan.items')}`} variant="neutral" size="small" />
              </div>
              <div className="detail-table-scroll">
                <table className="detail-table">
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
                        <tr key={s._id || i} className="table-row">
                          <td className="table-num">{i + 1}</td>
                          <td className="table-name">{s.item}</td>
                          <td className="table-date">{fmtDate(s.startDate)}</td>
                          <td className="table-date">{fmtDate(s.endDate)}</td>
                          <td>{s.qty || 0}</td>
                          <td>{s.unit || '-'}</td>
                          <td className="table-cost">{formatRupiah(s.cost || 0)}</td>
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
                          <td className="table-cost">{formatRupiah(s.actualCost || 0)}</td>
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
      <Card className="actions-card">
        <h3 className="actions-title">{t('projectDetail.actions.title')}</h3>
        <div className="actions-grid">
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
        </div>
      </Card>

      {project.description && (
        <Card className="description-card">
          <h3 className="section-title">{t('projectDetail.description.title')}</h3>
          <p className="description-text">{project.description}</p>
        </Card>
      )}
    </div>
  );
}
