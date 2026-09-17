import React, { useState, useMemo } from 'react';
import { ProjectTask, ProjectResource, TaskResource } from '../../types';
import {
  ChevronRight,
  ChevronDown,
  User,
  FileText,
  AlertTriangle,
  Search,
  Filter,
  ChevronsDown,
  ChevronsUp,
  Clock,
  Briefcase,
  Check,
  X,
  Edit2,
  ShieldAlert,
} from 'lucide-react';

interface ResourceUsageViewProps {
  tasks: ProjectTask[];
  resources: ProjectResource[];
  onUpdateTask?: (taskId: string, field: keyof ProjectTask, value: any) => Promise<void> | void;
}

// Helpers
const toDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseLocalDate = (str: string): Date => {
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

const formatHours = (h: number): string => {
  const rounded = Math.round(h * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
};

export const ResourceUsageView: React.FC<ResourceUsageViewProps> = ({
  tasks,
  resources,
  onUpdateTask,
}) => {
  const [collapsedResIds, setCollapsedResIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'overallocated'>('all');

  // Inline editing state for assignment units
  const [editingUnits, setEditingUnits] = useState<{
    taskId: string;
    resId: string;
    value: string;
  } | null>(null);

  // Compute project date range
  const { dateList, todayStr } = useMemo(() => {
    let min: Date | null = null;
    let max: Date | null = null;

    tasks.forEach(t => {
      if (t.startDate && t.finishDate && !t.isSummary) {
        const s = parseLocalDate(t.startDate);
        const f = parseLocalDate(t.finishDate);
        if (!min || s < min) min = s;
        if (!max || f > max) max = f;
      }
    });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!min) min = new Date(today);
    if (!max) max = new Date(today.getTime() + 14 * 86400000);

    // Add padding: 2 days before, 5 days after
    const startDate = new Date(min);
    startDate.setDate(startDate.getDate() - 2);

    const endDate = new Date(max);
    endDate.setDate(endDate.getDate() + 5);

    const dates: string[] = [];
    const curr = new Date(startDate);
    let count = 0;
    while (curr <= endDate && count < 90) {
      dates.push(toDateStr(curr));
      curr.setDate(curr.getDate() + 1);
      count++;
    }

    return {
      dateList: dates,
      todayStr: toDateStr(today),
    };
  }, [tasks]);

  // Matcher helper
  const isResourceMatch = (arUserId: any, res: ProjectResource) => {
    const arId = (typeof arUserId === 'object' && arUserId !== null ? arUserId._id : arUserId)?.toString();
    const resId = res._id?.toString();
    const resUserId = (typeof res.userId === 'object' && res.userId !== null ? res.userId._id : res.userId)?.toString();
    return arId === resId || (resUserId && arId === resUserId);
  };

  // Group and calculate dynamic data by resource
  const resourceAssignments = useMemo(() => {
    return resources.map(res => {
      const maxUnits = res.maxUnits || 100;
      const dailyCapacity = Math.round(((maxUnits / 100) * 8) * 10) / 10;

      // Find tasks assigned to this resource
      const assignedTasks = tasks.filter(t => {
        if (!t.assignedResources || t.isSummary) return false;
        return t.assignedResources.some(ar => isResourceMatch(ar.userId, res));
      });

      // Compute task breakdowns
      const taskBreakdowns = assignedTasks.map(task => {
        const ar = task.assignedResources.find(a => isResourceMatch(a.userId, res));
        const units = ar?.units ?? 100;
        const taskDailyHours = Math.round(((units / 100) * 8) * 10) / 10;

        const startStr = task.startDate ? task.startDate.slice(0, 10) : '';
        const finishStr = task.finishDate ? task.finishDate.slice(0, 10) : '';

        const hoursByDate: { [d: string]: number } = {};
        let taskTotalWork = 0;

        dateList.forEach(d => {
          const dateObj = parseLocalDate(d);
          const isSunday = dateObj.getDay() === 0;
          const isActive = d >= startStr && d <= finishStr && !isSunday;
          const hours = isActive ? taskDailyHours : 0;
          hoursByDate[d] = hours;
          taskTotalWork += hours;
        });

        return {
          task,
          ar,
          units,
          hoursByDate,
          totalWork: Math.round(taskTotalWork * 10) / 10,
        };
      });

      // Roll up daily hours for the resource across all tasks
      const dailyHours: { [d: string]: number } = {};
      const overallocatedDates: Set<string> = new Set();
      let totalWork = 0;

      dateList.forEach(d => {
        const sum = taskBreakdowns.reduce((acc, curr) => acc + (curr.hoursByDate[d] || 0), 0);
        const rounded = Math.round(sum * 10) / 10;
        dailyHours[d] = rounded;
        totalWork += rounded;

        if (rounded > dailyCapacity) {
          overallocatedDates.add(d);
        }
      });

      const hasOverallocation = overallocatedDates.size > 0;

      return {
        resource: res,
        dailyCapacity,
        tasks: taskBreakdowns,
        dailyHours,
        totalWork: Math.round(totalWork * 10) / 10,
        hasOverallocation,
        overallocatedDates,
      };
    });
  }, [resources, tasks, dateList]);

  // Filter based on search query and overallocation toggle
  const filteredAssignments = useMemo(() => {
    return resourceAssignments.filter(item => {
      if (filterMode === 'overallocated' && !item.hasOverallocation) return false;

      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();

      if (item.resource.name.toLowerCase().includes(query)) return true;
      if (item.resource.group && item.resource.group.toLowerCase().includes(query)) return true;

      // Check child tasks
      const matchTask = item.tasks.some(t => t.task.name.toLowerCase().includes(query));
      return matchTask;
    });
  }, [resourceAssignments, filterMode, searchQuery]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalRes = resources.length;
    const overallocatedCount = resourceAssignments.filter(r => r.hasOverallocation).length;
    const totalScheduledHours = resourceAssignments.reduce((acc, curr) => acc + curr.totalWork, 0);

    return {
      totalRes,
      overallocatedCount,
      totalScheduledHours: Math.round(totalScheduledHours * 10) / 10,
    };
  }, [resources, resourceAssignments]);

  // Collapse / Expand handlers
  const toggleCollapse = (resId: string) => {
    setCollapsedResIds(prev => {
      const next = new Set(prev);
      if (next.has(resId)) next.delete(resId);
      else next.add(resId);
      return next;
    });
  };

  const expandAll = () => setCollapsedResIds(new Set());
  const collapseAll = () => {
    const allWithTasks = resourceAssignments.filter(r => r.tasks.length > 0).map(r => r.resource._id);
    setCollapsedResIds(new Set(allWithTasks));
  };

  // Inline update of assignment units
  const handleSaveUnits = async (task: ProjectTask, res: ProjectResource) => {
    if (!editingUnits || editingUnits.taskId !== task._id || editingUnits.resId !== res._id) return;
    const val = parseFloat(editingUnits.value);
    if (!isNaN(val) && val > 0 && onUpdateTask) {
      const updatedAssignments: TaskResource[] = (task.assignedResources || []).map(ar => {
        const rawUserId = typeof ar.userId === 'object' && ar.userId !== null ? (ar.userId as any)._id : ar.userId;
        const matches = isResourceMatch(ar.userId, res);
        return {
          userId: rawUserId,
          units: matches ? Math.min(1000, Math.max(1, Math.round(val))) : (ar.units ?? 100),
          costRate: ar.costRate ?? 0,
        };
      });
      await onUpdateTask(task._id, 'assignedResources', updatedAssignments);
    }
    setEditingUnits(null);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden select-none">
      {/* View Header & Toolbar */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Title & Subtitle */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <User className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-800 text-sm tracking-tight">Resource Usage</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                Workload & Over-allocation
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Time-phased daily allocation per resource across project tasks
            </p>
          </div>
        </div>

        {/* Middle: Summary Stats Chips */}
        <div className="hidden lg:flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-700">{stats.totalRes}</span>
            <span className="text-[11px] text-slate-500">Resources</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5 text-slate-600">
            <AlertTriangle className={`w-3.5 h-3.5 ${stats.overallocatedCount > 0 ? 'text-rose-500' : 'text-slate-400'}`} />
            <span className={`font-semibold font-mono ${stats.overallocatedCount > 0 ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>
              {stats.overallocatedCount}
            </span>
            <span className="text-[11px] text-slate-500">Overallocated</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5 text-slate-600">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-semibold text-slate-700 font-mono">{stats.totalScheduledHours}h</span>
            <span className="text-[11px] text-slate-500">Total Work</span>
          </div>
        </div>

        {/* Right: Search, Filter, Expand/Collapse */}
        <div className="flex items-center gap-2">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search resource or task..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-none transition w-44"
            />
          </div>

          {/* Filter toggle */}
          <div className="flex items-center rounded-md border border-slate-200 bg-white overflow-hidden text-xs">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 font-medium transition ${
                filterMode === 'all'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('overallocated')}
              className={`px-2.5 py-1 font-medium border-l border-slate-200 transition flex items-center gap-1 ${
                filterMode === 'overallocated'
                  ? 'bg-rose-50 text-rose-700 font-bold'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-rose-500" />
              Overallocated
            </button>
          </div>

          {/* Expand / Collapse All */}
          <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
            <button
              onClick={expandAll}
              title="Expand All"
              className="p-1 rounded hover:bg-slate-100 text-slate-600 transition"
            >
              <ChevronsDown className="w-4 h-4" />
            </button>
            <button
              onClick={collapseAll}
              title="Collapse All"
              className="p-1 rounded hover:bg-slate-100 text-slate-600 transition"
            >
              <ChevronsUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid Container with Sticky Fixed Left Column and Horizontal Scroll */}
      <div className="flex-1 overflow-auto bg-slate-100 relative">
        <div className="min-w-max inline-block align-top bg-white shadow-sm">
          {/* Header Row */}
          <div className="flex sticky top-0 z-30 bg-slate-100 border-b border-slate-300 text-xs font-semibold text-slate-700 select-none shadow-xs">
            {/* Left Header - Sticky Left */}
            <div className="sticky left-0 z-40 bg-slate-100 border-r border-slate-300 w-[420px] shrink-0 flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Resource / Assigned Task
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 uppercase tracking-wider pr-2">
                <span>Total Work</span>
              </div>
            </div>

            {/* Date Headers */}
            <div className="flex">
              {dateList.map(d => {
                const dateObj = parseLocalDate(d);
                const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dateObj.getDay()];
                const isSunday = dateObj.getDay() === 0;
                const isToday = d === todayStr;

                return (
                  <div
                    key={d}
                    className={`w-12 shrink-0 py-1.5 border-r border-slate-200 flex flex-col items-center justify-center font-mono text-[10px] ${
                      isToday
                        ? 'bg-blue-100/70 text-blue-900 font-bold border-b-2 border-b-blue-600'
                        : isSunday
                        ? 'bg-slate-200/50 text-slate-400'
                        : 'text-slate-700'
                    }`}
                  >
                    <span className="text-[9px] uppercase font-semibold tracking-tight">{dayName}</span>
                    <span className={`leading-none ${isToday ? 'px-1 rounded bg-blue-600 text-white font-bold' : ''}`}>
                      {d.slice(8, 10)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body Rows */}
          <div className="divide-y divide-slate-100 text-xs">
            {filteredAssignments.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-400 text-xs">
                No matching resources found.
              </div>
            ) : (
              filteredAssignments.map(item => {
                const res = item.resource;
                const isCollapsed = collapsedResIds.has(res._id);

                return (
                  <div key={res._id} className="flex flex-col group">
                    {/* Resource Row */}
                    <div
                      className={`flex h-9 border-b border-slate-200 transition-colors ${
                        item.hasOverallocation ? 'bg-rose-50/40 hover:bg-rose-50/70' : 'bg-slate-50/90 hover:bg-slate-100/90'
                      }`}
                    >
                      {/* Left Column: Resource Name & Total Hours */}
                      <div
                        className={`sticky left-0 z-20 border-r border-slate-300 w-[420px] shrink-0 flex items-center justify-between px-3 ${
                          item.hasOverallocation ? 'bg-rose-50/80 group-hover:bg-rose-100/60' : 'bg-slate-50 group-hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate flex-1 mr-2">
                          {item.tasks.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleCollapse(res._id)}
                              className="p-1 text-slate-500 hover:text-slate-800 rounded transition"
                            >
                              {isCollapsed ? (
                                <ChevronRight className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="w-5" />
                          )}
                          <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate" title={res.name}>
                            {res.name}
                          </span>

                          <span className="px-1.5 py-0.2 rounded bg-slate-200/60 text-slate-600 font-mono text-[10px]">
                            {res.maxUnits || 100}%
                          </span>

                          {item.hasOverallocation && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 font-bold text-[9px] flex items-center gap-1 border border-rose-300 shadow-xs">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Overallocated
                            </span>
                          )}
                        </div>

                        {/* Resource Total Work */}
                        <span className="font-mono text-[11px] font-bold text-slate-700 shrink-0 pr-1">
                          {item.totalWork}h
                        </span>
                      </div>

                      {/* Right Cells: Resource Daily Hours */}
                      <div className="flex">
                        {dateList.map(d => {
                          const hours = item.dailyHours[d] || 0;
                          const isOver = hours > item.dailyCapacity;
                          const dateObj = parseLocalDate(d);
                          const isSunday = dateObj.getDay() === 0;
                          const isToday = d === todayStr;

                          return (
                            <div
                              key={d}
                              className={`w-12 shrink-0 border-r border-slate-200 flex items-center justify-center font-mono text-[11px] transition-colors ${
                                isOver
                                  ? 'bg-rose-200/90 text-rose-900 font-bold ring-1 ring-rose-400 inset'
                                  : isSunday
                                  ? 'bg-slate-100/40 text-slate-300'
                                  : hours > 0
                                  ? 'bg-blue-50/70 text-blue-900 font-semibold'
                                  : isToday
                                  ? 'bg-blue-50/20 text-slate-300'
                                  : 'text-slate-300'
                              }`}
                              title={
                                hours > 0
                                  ? `${res.name}: ${hours}h / ${item.dailyCapacity}h capacity on ${d}${
                                      isOver ? ' (OVERALLOCATED!)' : ''
                                    }`
                                  : undefined
                              }
                            >
                              {hours > 0 ? formatHours(hours) : '-'}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Child Task Rows */}
                    {!isCollapsed &&
                      item.tasks.map(({ task, ar, units, hoursByDate, totalWork: taskWork }, idx) => {
                        const isEditingThisUnits =
                          editingUnits?.taskId === task._id && editingUnits?.resId === res._id;

                        return (
                          <div
                            key={task._id}
                            className="flex h-8 bg-white hover:bg-blue-50/30 border-b border-slate-100 transition-colors"
                          >
                            {/* Left Column: Task Name, Units & Calculated Assignment Work */}
                            <div className="sticky left-0 z-20 bg-white hover:bg-blue-50/30 border-r border-slate-300 w-[420px] shrink-0 flex items-center justify-between pl-8 pr-3">
                              <div className="flex items-center gap-2 truncate flex-1 mr-2">
                                <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="text-slate-700 font-medium truncate text-xs" title={task.name}>
                                  {task.name}
                                </span>

                                {/* Editable Units for this resource on this task */}
                                {isEditingThisUnits ? (
                                  <div className="flex items-center gap-1 bg-white border border-blue-500 rounded px-1 py-0.2 shadow-xs">
                                    <input
                                      type="number"
                                      min={1}
                                      max={500}
                                      step={10}
                                      autoFocus
                                      value={editingUnits.value}
                                      onChange={e =>
                                        setEditingUnits({
                                          taskId: task._id,
                                          resId: res._id,
                                          value: e.target.value,
                                        })
                                      }
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') handleSaveUnits(task, res);
                                        if (e.key === 'Escape') setEditingUnits(null);
                                      }}
                                      className="w-10 text-[10px] font-mono font-bold text-slate-800 focus:outline-none"
                                    />
                                    <span className="text-[10px] text-slate-500">%</span>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveUnits(task, res)}
                                      className="text-emerald-600 hover:text-emerald-800"
                                      title="Save Units"
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingUnits(null)}
                                      className="text-slate-400 hover:text-slate-600"
                                      title="Cancel"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <span
                                    onClick={() => {
                                      setEditingUnits({
                                        taskId: task._id,
                                        resId: res._id,
                                        value: String(units),
                                      });
                                    }}
                                    className="cursor-pointer px-1 py-0.2 rounded bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 font-mono text-[10px] font-semibold border border-slate-200 transition"
                                    title="Click to edit assignment units (%) for this task"
                                  >
                                    {units}%
                                  </span>
                                )}
                              </div>

                              {/* Task Assignment Total Work */}
                              <span
                                className="font-mono text-[11px] text-slate-500 shrink-0"
                                title={`Work hours on this task: ${taskWork}h`}
                              >
                                {taskWork}h
                              </span>
                            </div>

                            {/* Right Cells: Task Daily Hours */}
                            <div className="flex">
                              {dateList.map(d => {
                                const hours = hoursByDate[d] || 0;
                                const isOverDate = item.overallocatedDates.has(d);
                                const dateObj = parseLocalDate(d);
                                const isSunday = dateObj.getDay() === 0;

                                return (
                                  <div
                                    key={d}
                                    className={`w-12 shrink-0 border-r border-slate-100 flex items-center justify-center font-mono text-[10px] ${
                                      isSunday
                                        ? 'bg-slate-50 text-slate-200'
                                        : hours > 0
                                        ? isOverDate
                                          ? 'bg-rose-50/70 text-rose-800 font-semibold border-b border-rose-200'
                                          : 'bg-blue-50/40 text-slate-700 font-medium'
                                        : 'text-slate-200'
                                    }`}
                                    title={hours > 0 ? `${task.name}: ${hours}h on ${d}` : undefined}
                                  >
                                    {hours > 0 ? formatHours(hours) : ''}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
