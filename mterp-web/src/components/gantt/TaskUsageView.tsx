import React, { useState, useMemo } from 'react';
import { ProjectTask, ProjectResource } from '../../types';
import { ChevronRight, ChevronDown, FileText, User } from 'lucide-react';

interface TaskUsageViewProps {
  tasks: ProjectTask[];
  resources: ProjectResource[];
}

export const TaskUsageView: React.FC<TaskUsageViewProps> = ({ tasks, resources }) => {
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());

  // Date list for time-phased grid
  const { dateList } = useMemo(() => {
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

    const dates: string[] = [];
    const curr = new Date(min);
    let count = 0;
    while (curr <= max && count < 60) {
      dates.push(curr.toISOString().slice(0, 10));
      curr.setDate(curr.getDate() + 1);
      count++;
    }

    return { dateList: dates };
  }, [tasks]);

  const toggleCollapse = (taskId: string) => {
    setCollapsedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const leafTasks = tasks.filter(t => !t.isSummary);

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-100 border-b border-slate-300 text-xs">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-800 text-sm">Task Usage</h2>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500">
            Work Hours Distributed by Task & Resource Assignments
          </span>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane */}
        <div className="w-[380px] min-w-[320px] border-r border-slate-300 flex flex-col bg-white overflow-y-auto">
          <div className="sticky top-0 bg-slate-100 border-b border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 flex justify-between">
            <span>Task / Assigned Resource</span>
            <span>Total Work</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {leafTasks.map(task => {
              const isCollapsed = collapsedTaskIds.has(task._id);
              const assignments = task.assignedResources || [];

              return (
                <div key={task._id} className="flex flex-col">
                  {/* Task Row */}
                  <div
                    onClick={() => toggleCollapse(task._id)}
                    className="flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 cursor-pointer font-semibold text-slate-800 border-b border-slate-200"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {assignments.length > 0 ? (
                        <button type="button" className="p-0.5 text-slate-500">
                          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      ) : (
                        <span className="w-4" />
                      )}
                      <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">{task.name}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-600">{task.plannedWork || 0} hrs</span>
                  </div>

                  {/* Child Resource Rows */}
                  {!isCollapsed &&
                    assignments.map((ar, idx) => {
                      const resId = (typeof ar.userId === 'object' ? ar.userId?._id : ar.userId)?.toString();
                      const resObj = resources.find(r => r._id.toString() === resId || (r.userId && r.userId.toString() === resId));
                      const resName = resObj ? resObj.name : (typeof ar.userId === 'object' ? ar.userId?.name : 'Resource');

                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between pl-8 pr-3 py-1.5 hover:bg-blue-50/50 text-slate-600 border-b border-slate-100 text-[11px]"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <User className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{resName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({ar.units || 100}%)</span>
                          </div>
                          <span className="font-mono text-[10px] text-slate-500">
                            {Math.round(((task.plannedWork || 0) / Math.max(1, assignments.length)) * 10) / 10}h
                          </span>
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Pane: Daily Grid */}
        <div className="flex-1 overflow-x-auto overflow-y-auto bg-white">
          <div className="min-w-max">
            {/* Header */}
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

            {/* Rows */}
            <div className="divide-y divide-slate-100">
              {leafTasks.map(task => {
                const isCollapsed = collapsedTaskIds.has(task._id);
                const assignments = task.assignedResources || [];
                const start = task.startDate ? task.startDate.slice(0, 10) : '';
                const finish = task.finishDate ? task.finishDate.slice(0, 10) : '';

                return (
                  <div key={task._id} className="flex flex-col">
                    {/* Task Daily Row */}
                    <div className="flex h-[37px] bg-slate-50 border-b border-slate-200">
                      {dateList.map(d => {
                        const isActiveDay = d >= start && d <= finish;
                        return (
                          <div
                            key={d}
                            className={`w-12 border-r border-slate-200 flex items-center justify-center font-mono text-[11px] ${
                              isActiveDay ? 'bg-blue-50 text-blue-900 font-semibold' : 'text-slate-300'
                            }`}
                          >
                            {isActiveDay ? '8h' : '-'}
                          </div>
                        );
                      })}
                    </div>

                    {/* Child Resource Daily Rows */}
                    {!isCollapsed &&
                      assignments.map((ar, idx) => (
                        <div key={idx} className="flex h-[29px] border-b border-slate-100">
                          {dateList.map(d => {
                            const isActiveDay = d >= start && d <= finish;
                            return (
                              <div
                                key={d}
                                className={`w-12 border-r border-slate-100 flex items-center justify-center font-mono text-[10px] ${
                                  isActiveDay ? 'bg-blue-50/40 text-slate-600' : 'text-slate-200'
                                }`}
                              >
                                {isActiveDay ? '8h' : ''}
                              </div>
                            );
                          })}
                        </div>
                      ))}
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
