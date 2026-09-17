import React, { useState, useMemo, useRef } from 'react';
import { ProjectTask, ProjectResource, TaskResource } from '../../types';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  User,
  Search,
  ChevronsDown,
  ChevronsUp,
  Edit2,
  Check,
  X,
  Clock,
  Briefcase,
  Layers,
  Filter,
} from 'lucide-react';

interface TaskUsageViewProps {
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

export const TaskUsageView: React.FC<TaskUsageViewProps> = ({
  tasks,
  resources,
  onUpdateTask,
}) => {
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'assigned' | 'unassigned'>('all');

  // Inline editing states
  const [editingTaskWork, setEditingTaskWork] = useState<{ taskId: string; value: string } | null>(null);
  const [editingAssignmentUnits, setEditingAssignmentUnits] = useState<{
    taskId: string;
    assignIndex: number;
    value: string;
  } | null>(null);

  // Filter leaf tasks
  const leafTasks = useMemo(() => {
    return tasks.filter(t => !t.isSummary);
  }, [tasks]);

  // Date range calculation (padded nicely)
  const { dateList, todayStr } = useMemo(() => {
    let min: Date | null = null;
    let max: Date | null = null;

    leafTasks.forEach(t => {
      if (t.startDate && t.finishDate) {
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
  }, [leafTasks]);

  // Resource resolver helper
  const getResourceInfo = (ar: TaskResource) => {
    const arId = (typeof ar.userId === 'object' && ar.userId !== null ? ar.userId._id : ar.userId)?.toString();
    const resObj = resources.find(r => {
      const resId = r._id?.toString();
      const resUserId = (typeof r.userId === 'object' && r.userId !== null ? r.userId._id : r.userId)?.toString();
      return resId === arId || (resUserId && resUserId === arId);
    });

    const name = resObj?.name || (typeof ar.userId === 'object' && ar.userId !== null ? (ar.userId as any).name : 'Resource');
    return { name, resource: resObj };
  };

  // Filter tasks based on search and assignment status
  const filteredTasks = useMemo(() => {
    return leafTasks.filter(task => {
      // Filter mode check
      const assignments = task.assignedResources || [];
      if (filterMode === 'assigned' && assignments.length === 0) return false;
      if (filterMode === 'unassigned' && assignments.length > 0) return false;

      // Search query check
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      if (task.name.toLowerCase().includes(query)) return true;
      if (task.wbsCode && task.wbsCode.toLowerCase().includes(query)) return true;

      // Check assigned resource names
      const matchResource = assignments.some(ar => {
        const { name } = getResourceInfo(ar);
        return name.toLowerCase().includes(query);
      });

      return matchResource;
    });
  }, [leafTasks, filterMode, searchQuery, resources]);

  // Statistics
  const stats = useMemo(() => {
    let totalWork = 0;
    let totalAssignments = 0;
    leafTasks.forEach(t => {
      totalWork += t.plannedWork || 0;
      totalAssignments += (t.assignedResources || []).length;
    });
    return {
      totalTasks: leafTasks.length,
      totalWork,
      totalAssignments,
    };
  }, [leafTasks]);

  // Collapse / Expand handlers
  const toggleCollapse = (taskId: string) => {
    setCollapsedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const expandAll = () => setCollapsedTaskIds(new Set());
  const collapseAll = () => {
    const allWithAssignments = leafTasks
      .filter(t => (t.assignedResources || []).length > 0)
      .map(t => t._id);
    setCollapsedTaskIds(new Set(allWithAssignments));
  };

  // Inline edit actions
  const handleSaveTaskWork = async (taskId: string) => {
    if (!editingTaskWork || editingTaskWork.taskId !== taskId) return;
    const num = parseFloat(editingTaskWork.value);
    if (!isNaN(num) && num >= 0 && onUpdateTask) {
      await onUpdateTask(taskId, 'plannedWork', num);
    }
    setEditingTaskWork(null);
  };

  const handleSaveAssignmentUnits = async (task: ProjectTask, index: number) => {
    if (!editingAssignmentUnits || editingAssignmentUnits.taskId !== task._id || editingAssignmentUnits.assignIndex !== index) {
      return;
    }
    const val = parseFloat(editingAssignmentUnits.value);
    if (!isNaN(val) && val > 0 && onUpdateTask) {
      const updatedAssignments: TaskResource[] = (task.assignedResources || []).map((ar, i) => {
        const rawUserId = typeof ar.userId === 'object' && ar.userId !== null ? (ar.userId as any)._id : ar.userId;
        return {
          userId: rawUserId,
          units: i === index ? Math.min(1000, Math.max(1, Math.round(val))) : (ar.units ?? 100),
          costRate: ar.costRate ?? 0,
        };
      });
      await onUpdateTask(task._id, 'assignedResources', updatedAssignments);
    }
    setEditingAssignmentUnits(null);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden select-none">
      {/* View Header & Toolbar */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Title & Subtitle */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-800 text-sm tracking-tight">Task Usage</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                Time-Phased Distribution
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Work hours distributed across task timelines & assigned resources
            </p>
          </div>
        </div>

        {/* Middle: Summary Stats Chips */}
        <div className="hidden lg:flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-700">{stats.totalTasks}</span>
            <span className="text-[11px] text-slate-500">Tasks</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5 text-slate-600">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-semibold text-slate-700 font-mono">{stats.totalWork}h</span>
            <span className="text-[11px] text-slate-500">Planned Work</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5 text-slate-600">
            <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
            <span className="font-semibold text-slate-700">{stats.totalAssignments}</span>
            <span className="text-[11px] text-slate-500">Assignments</span>
          </div>
        </div>

        {/* Right: Search, Filter, Expand/Collapse */}
        <div className="flex items-center gap-2">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search task or resource..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-none transition w-44"
            />
          </div>

          {/* Filter dropdown */}
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
              onClick={() => setFilterMode('assigned')}
              className={`px-2.5 py-1 font-medium border-l border-slate-200 transition ${
                filterMode === 'assigned'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Assigned
            </button>
            <button
              onClick={() => setFilterMode('unassigned')}
              className={`px-2.5 py-1 font-medium border-l border-slate-200 transition ${
                filterMode === 'unassigned'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Unassigned
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
                  Task / Assigned Resource
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
            {filteredTasks.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-400 text-xs">
                No matching tasks found.
              </div>
            ) : (
              filteredTasks.map(task => {
                const isCollapsed = collapsedTaskIds.has(task._id);
                const assignments = task.assignedResources || [];
                const startStr = task.startDate ? task.startDate.slice(0, 10) : '';
                const finishStr = task.finishDate ? task.finishDate.slice(0, 10) : '';

                // Precompute dynamic daily hours for each assignment
                const assignmentHoursMap = assignments.map(ar => {
                  const units = ar.units ?? 100;
                  const dailyUnitsHours = Math.round(((units / 100) * 8) * 10) / 10;

                  const hoursByDate: { [d: string]: number } = {};
                  let totalAssignmentWork = 0;

                  dateList.forEach(d => {
                    const dateObj = parseLocalDate(d);
                    const isSunday = dateObj.getDay() === 0;
                    const isActive = d >= startStr && d <= finishStr && !isSunday;
                    const hours = isActive ? dailyUnitsHours : 0;
                    hoursByDate[d] = hours;
                    totalAssignmentWork += hours;
                  });

                  return {
                    ar,
                    hoursByDate,
                    totalAssignmentWork: Math.round(totalAssignmentWork * 10) / 10,
                  };
                });

                // Task row daily hours = sum of all assignments, or 8h if no assignment
                const taskDailyHours: { [d: string]: number } = {};
                dateList.forEach(d => {
                  const dateObj = parseLocalDate(d);
                  const isSunday = dateObj.getDay() === 0;
                  const isActive = d >= startStr && d <= finishStr && !isSunday;

                  if (assignments.length > 0) {
                    const sum = assignmentHoursMap.reduce((acc, curr) => acc + (curr.hoursByDate[d] || 0), 0);
                    taskDailyHours[d] = Math.round(sum * 10) / 10;
                  } else {
                    taskDailyHours[d] = isActive ? 8 : 0;
                  }
                });

                const isEditingThisTask = editingTaskWork?.taskId === task._id;

                return (
                  <div key={task._id} className="flex flex-col group">
                    {/* Task Row */}
                    <div className="flex h-9 bg-slate-50/90 hover:bg-slate-100/90 border-b border-slate-200 transition-colors">
                      {/* Left Column: Task Name & Planned Work */}
                      <div className="sticky left-0 z-20 bg-slate-50 group-hover:bg-slate-100 border-r border-slate-300 w-[420px] shrink-0 flex items-center justify-between px-3">
                        <div className="flex items-center gap-1.5 truncate flex-1 mr-2">
                          {assignments.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleCollapse(task._id)}
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
                          <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate" title={task.name}>
                            {task.name}
                          </span>
                          {task.wbsCode && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({task.wbsCode})
                            </span>
                          )}
                        </div>

                        {/* Task Total Work - Editable */}
                        <div className="flex items-center gap-1 shrink-0">
                          {isEditingThisTask ? (
                            <div className="flex items-center gap-1 bg-white border border-blue-500 rounded px-1.5 py-0.5 shadow-xs">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                autoFocus
                                value={editingTaskWork.value}
                                onChange={e => setEditingTaskWork({ taskId: task._id, value: e.target.value })}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveTaskWork(task._id);
                                  if (e.key === 'Escape') setEditingTaskWork(null);
                                }}
                                className="w-14 text-xs font-mono font-semibold text-slate-800 focus:outline-none"
                              />
                              <span className="text-[11px] text-slate-500 font-mono">h</span>
                              <button
                                type="button"
                                onClick={() => handleSaveTaskWork(task._id)}
                                className="text-emerald-600 hover:text-emerald-800 p-0.5"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaskWork(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setEditingTaskWork({
                                  taskId: task._id,
                                  value: String(task.plannedWork || 0),
                                });
                              }}
                              className="group/work flex items-center gap-1 cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50 border border-transparent hover:border-blue-200 transition"
                              title="Double-click or click to edit Total Work"
                            >
                              <span className="font-mono text-[11px] font-bold text-slate-700">
                                {task.plannedWork || 0}h
                              </span>
                              <Edit2 className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover/work:opacity-100 transition" />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Cells: Task Daily Rollup */}
                      <div className="flex">
                        {dateList.map(d => {
                          const hours = taskDailyHours[d] || 0;
                          const dateObj = parseLocalDate(d);
                          const isSunday = dateObj.getDay() === 0;
                          const isToday = d === todayStr;

                          return (
                            <div
                              key={d}
                              className={`w-12 shrink-0 border-r border-slate-200 flex items-center justify-center font-mono text-[11px] transition-colors ${
                                isSunday
                                  ? 'bg-slate-100/40 text-slate-300'
                                  : hours > 0
                                  ? 'bg-blue-50/70 text-blue-900 font-semibold'
                                  : isToday
                                  ? 'bg-blue-50/20 text-slate-300'
                                  : 'text-slate-300'
                              }`}
                              title={hours > 0 ? `${task.name}: ${hours}h on ${d}` : undefined}
                            >
                              {hours > 0 ? formatHours(hours) : '-'}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Child Resource Rows */}
                    {!isCollapsed &&
                      assignmentHoursMap.map(({ ar, hoursByDate, totalAssignmentWork }, idx) => {
                        const { name } = getResourceInfo(ar);
                        const isEditingUnits =
                          editingAssignmentUnits?.taskId === task._id &&
                          editingAssignmentUnits?.assignIndex === idx;

                        return (
                          <div
                            key={idx}
                            className="flex h-8 bg-white hover:bg-blue-50/30 border-b border-slate-100 transition-colors"
                          >
                            {/* Left Column: Resource Name, Units & Calculated Work */}
                            <div className="sticky left-0 z-20 bg-white hover:bg-blue-50/30 border-r border-slate-300 w-[420px] shrink-0 flex items-center justify-between pl-8 pr-3">
                              <div className="flex items-center gap-2 truncate flex-1 mr-2">
                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="text-slate-700 font-medium truncate text-xs" title={name}>
                                  {name}
                                </span>

                                {/* Editable Units */}
                                {isEditingUnits ? (
                                  <div className="flex items-center gap-1 bg-white border border-blue-500 rounded px-1 py-0.2 shadow-xs">
                                    <input
                                      type="number"
                                      min={1}
                                      max={500}
                                      step={10}
                                      autoFocus
                                      value={editingAssignmentUnits.value}
                                      onChange={e =>
                                        setEditingAssignmentUnits({
                                          taskId: task._id,
                                          assignIndex: idx,
                                          value: e.target.value,
                                        })
                                      }
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') handleSaveAssignmentUnits(task, idx);
                                        if (e.key === 'Escape') setEditingAssignmentUnits(null);
                                      }}
                                      className="w-10 text-[10px] font-mono font-bold text-slate-800 focus:outline-none"
                                    />
                                    <span className="text-[10px] text-slate-500">%</span>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveAssignmentUnits(task, idx)}
                                      className="text-emerald-600 hover:text-emerald-800"
                                      title="Save Units"
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingAssignmentUnits(null)}
                                      className="text-slate-400 hover:text-slate-600"
                                      title="Cancel"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <span
                                    onClick={() => {
                                      setEditingAssignmentUnits({
                                        taskId: task._id,
                                        assignIndex: idx,
                                        value: String(ar.units ?? 100),
                                      });
                                    }}
                                    className="cursor-pointer px-1 py-0.2 rounded bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 font-mono text-[10px] font-semibold border border-slate-200 transition"
                                    title="Click to edit assignment units (%)"
                                  >
                                    {ar.units ?? 100}%
                                  </span>
                                )}
                              </div>

                              {/* Assignment Total Hours */}
                              <span
                                className="font-mono text-[11px] text-slate-500 shrink-0"
                                title={`Total calculated work for this assignment: ${totalAssignmentWork} hrs`}
                              >
                                {totalAssignmentWork}h
                              </span>
                            </div>

                            {/* Right Cells: Assignment Daily Hours */}
                            <div className="flex">
                              {dateList.map(d => {
                                const hours = hoursByDate[d] || 0;
                                const dateObj = parseLocalDate(d);
                                const isSunday = dateObj.getDay() === 0;

                                return (
                                  <div
                                    key={d}
                                    className={`w-12 shrink-0 border-r border-slate-100 flex items-center justify-center font-mono text-[10px] ${
                                      isSunday
                                        ? 'bg-slate-50 text-slate-200'
                                        : hours > 0
                                        ? 'bg-blue-50/40 text-slate-700 font-medium'
                                        : 'text-slate-200'
                                    }`}
                                    title={hours > 0 ? `${name}: ${hours}h on ${d}` : undefined}
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
