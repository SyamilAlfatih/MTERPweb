import React, { useState, useMemo } from 'react';
import { ProjectTask, ProjectResource } from '../../types';
import { ChevronRight, ChevronDown, User, FileText, AlertTriangle } from 'lucide-react';

interface ResourceUsageViewProps {
  tasks: ProjectTask[];
  resources: ProjectResource[];
}

export const ResourceUsageView: React.FC<ResourceUsageViewProps> = ({ tasks, resources }) => {
  const [collapsedResIds, setCollapsedResIds] = useState<Set<string>>(new Set());

  // Compute project date range for the daily time-phased grid
  const { dateList, minDate, maxDate } = useMemo(() => {
    let min = new Date();
    let max = new Date();
    let hasDates = false;

    tasks.forEach(t => {
      if (t.startDate && t.finishDate) {
        const s = new Date(t.startDate);
        const f = new Date(t.finishDate);
        if (!hasDates || s < min) min = s;
        if (!hasDates || f > max) max = f;
        hasDates = true;
      }
    });

    // Generate array of days (limit to 60 days max for performance)
    const dates: string[] = [];
    const curr = new Date(min);
    let count = 0;
    while (curr <= max && count < 60) {
      dates.push(curr.toISOString().slice(0, 10));
      curr.setDate(curr.getDate() + 1);
      count++;
    }

    return { dateList: dates, minDate: min, maxDate: max };
  }, [tasks]);

  // Group tasks by assigned resource
  const resourceAssignments = useMemo(() => {
    return resources.map(res => {
      const resIdStr = res._id.toString();
      const userIdStr = res.userId ? (typeof res.userId === 'object' ? res.userId._id : res.userId).toString() : null;

      const assignedTasks = tasks.filter(t => {
        if (!t.assignedResources || t.isSummary) return false;
        return t.assignedResources.some(ar => {
          const arId = (typeof ar.userId === 'object' ? ar.userId?._id : ar.userId)?.toString();
          return arId === resIdStr || (userIdStr && arId === userIdStr);
        });
      });

      // Total work across all assigned tasks
      const totalWork = assignedTasks.reduce((sum, t) => sum + (t.plannedWork || 0), 0);

      // Compute daily hours map: dateStr -> total hours on that date
      const dailyHours: { [date: string]: number } = {};
      dateList.forEach(d => {
        let dayHours = 0;
        assignedTasks.forEach(t => {
          if (t.startDate && t.finishDate) {
            const start = t.startDate.slice(0, 10);
            const finish = t.finishDate.slice(0, 10);
            if (d >= start && d <= finish) {
              // Standard daily hours = 8 * units / 100
              const ar = t.assignedResources.find(a => {
                const aId = (typeof a.userId === 'object' ? a.userId?._id : a.userId)?.toString();
                return aId === resIdStr || (userIdStr && aId === userIdStr);
              });
              const units = ar ? ar.units || 100 : 100;
              dayHours += (units / 100) * 8;
            }
          }
        });
        dailyHours[d] = Math.round(dayHours * 10) / 10;
      });

      const hasOverallocation = Object.values(dailyHours).some(h => h > 8);

      return {
        resource: res,
        tasks: assignedTasks,
        totalWork,
        dailyHours,
        hasOverallocation,
      };
    });
  }, [resources, tasks, dateList]);

  const toggleCollapse = (resId: string) => {
    setCollapsedResIds(prev => {
      const next = new Set(prev);
      if (next.has(resId)) next.delete(resId);
      else next.add(resId);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-100 border-b border-slate-300 text-xs">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-800 text-sm">Resource Usage</h2>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500">
            Time-phased Daily Allocation (Hours)
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300 inline-block" />
            <span className="text-[11px] font-semibold text-rose-700">&gt; 8 hrs/day (Overallocated)</span>
          </div>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Resource & Task Hierarchy */}
        <div className="w-[380px] min-w-[320px] border-r border-slate-300 flex flex-col bg-white overflow-y-auto">
          <div className="sticky top-0 bg-slate-100 border-b border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 flex justify-between">
            <span>Resource / Task Name</span>
            <span>Total Work</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {resourceAssignments.map(item => {
              const res = item.resource;
              const isCollapsed = collapsedResIds.has(res._id);

              return (
                <div key={res._id} className="flex flex-col">
                  {/* Resource Row */}
                  <div
                    onClick={() => toggleCollapse(res._id)}
                    className="flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 cursor-pointer font-semibold text-slate-800 border-b border-slate-200"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <button type="button" className="p-0.5 text-slate-500">
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">{res.name}</span>
                      {item.hasOverallocation && (
                        <span className="px-1 py-0.2 rounded bg-rose-100 text-rose-700 text-[9px] font-bold">
                          Overallocated
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-slate-600">{item.totalWork} hrs</span>
                  </div>

                  {/* Child Task Rows */}
                  {!isCollapsed &&
                    item.tasks.map(t => (
                      <div
                        key={t._id}
                        className="flex items-center justify-between pl-8 pr-3 py-1.5 hover:bg-blue-50/50 text-slate-600 border-b border-slate-100 text-[11px]"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{t.name}</span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">{t.plannedWork || 0}h</span>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Pane: Time-phased Daily Grid */}
        <div className="flex-1 overflow-x-auto overflow-y-auto bg-white">
          <div className="min-w-max">
            {/* Timescale Header */}
            <div className="sticky top-0 z-10 flex bg-slate-100 border-b border-slate-200 text-center font-mono text-[10px]">
              {dateList.map(d => {
                const dateObj = new Date(d);
                const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getUTCDay()];
                const isSunday = dateObj.getUTCDay() === 0;

                return (
                  <div
                    key={d}
                    className={`w-12 py-1 border-r border-slate-200 flex flex-col justify-center ${
                      isSunday ? 'bg-slate-200/60 text-slate-400' : 'text-slate-700'
                    }`}
                  >
                    <span className="font-semibold text-[9px]">{dayName}</span>
                    <span>{d.slice(8, 10)}</span>
                  </div>
                );
              })}
            </div>

            {/* Daily Grid Rows */}
            <div className="divide-y divide-slate-100">
              {resourceAssignments.map(item => {
                const res = item.resource;
                const isCollapsed = collapsedResIds.has(res._id);

                return (
                  <div key={res._id} className="flex flex-col">
                    {/* Resource Daily Allocation Row */}
                    <div className="flex h-[37px] bg-slate-50 border-b border-slate-200">
                      {dateList.map(d => {
                        const hours = item.dailyHours[d] || 0;
                        const isOver = hours > 8;

                        return (
                          <div
                            key={d}
                            className={`w-12 border-r border-slate-200 flex items-center justify-center font-mono text-[11px] ${
                              isOver
                                ? 'bg-rose-100/90 text-rose-800 font-bold'
                                : hours > 0
                                ? 'bg-blue-50/70 text-blue-900 font-semibold'
                                : 'text-slate-300'
                            }`}
                          >
                            {hours > 0 ? `${hours}h` : '-'}
                          </div>
                        );
                      })}
                    </div>

                    {/* Child Tasks Daily Rows */}
                    {!isCollapsed &&
                      item.tasks.map(t => {
                        const start = t.startDate ? t.startDate.slice(0, 10) : '';
                        const finish = t.finishDate ? t.finishDate.slice(0, 10) : '';

                        return (
                          <div key={t._id} className="flex h-[29px] border-b border-slate-100">
                            {dateList.map(d => {
                              const isActiveDay = d >= start && d <= finish;
                              return (
                                <div
                                  key={d}
                                  className={`w-12 border-r border-slate-100 flex items-center justify-center font-mono text-[10px] ${
                                    isActiveDay ? 'bg-blue-50/40 text-slate-700 font-medium' : 'text-slate-200'
                                  }`}
                                >
                                  {isActiveDay ? '8h' : ''}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
