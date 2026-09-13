import React, { useState, useRef, useMemo, useCallback } from 'react';
import { ProjectTask } from '../../types';
import { ZoomLevel } from './useGanttState';
import { GanttTimescale } from './GanttTimescale';
import { DependencyArrows } from './DependencyArrows';

interface GanttChartProps {
  tasks: ProjectTask[];
  collapsedTaskIds: Set<string>;
  zoomLevel: ZoomLevel;
  showCriticalPath: boolean;
  showBaseline: boolean;
  showDependencies: boolean;
  activeView?: string;
  onUpdateTaskDates: (taskId: string, newStartDate: string, newFinishDate?: string, newDuration?: number) => void;
  onCreateDependency: (fromTaskId: string, toTaskId: string) => void;
  onOpenDialog: (taskId: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

const ROW_HEIGHT = 36;
const BAR_HEIGHT = 18;

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  collapsedTaskIds,
  zoomLevel,
  showCriticalPath,
  showBaseline,
  showDependencies,
  activeView = 'gantt',
  onUpdateTaskDates,
  onCreateDependency,
  onOpenDialog,
  scrollRef,
  onScroll,
}) => {
  const [hoveredTask, setHoveredTask] = useState<ProjectTask | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const hasAutoScrolledRef = useRef(false);

  // Drag interaction states: 'move' | 'resize' | 'link'
  const dragRef = useRef<{
    type: 'move' | 'resize' | 'link';
    taskId: string;
    startX: number;
    initialStart: Date;
    initialFinish: Date;
    initialDuration: number;
    currentX?: number;
    currentY?: number;
  } | null>(null);

  // Filter out tasks hidden by collapsed summaries
  const visibleTasks = useMemo(() => {
    const list: ProjectTask[] = [];
    const hiddenParents = new Set<string>();

    for (const task of tasks) {
      if (task.parentTaskId && hiddenParents.has(task.parentTaskId.toString())) {
        if (task.isSummary) hiddenParents.add(task._id.toString());
        continue;
      }

      list.push(task);

      if (task.isSummary && collapsedTaskIds.has(task._id.toString())) {
        hiddenParents.add(task._id.toString());
      }
    }

    return list;
  }, [tasks, collapsedTaskIds]);

  // Determine timeline boundary dates
  const { timelineStart, totalDays, dayWidth } = useMemo(() => {
    let minDate = new Date();
    let maxDate = new Date();

    if (tasks.length > 0) {
      let earliest = Infinity;
      let latest = -Infinity;

      tasks.forEach(t => {
        if (t.startDate) {
          const s = new Date(t.startDate).getTime();
          if (s < earliest) earliest = s;
        }
        if (t.finishDate) {
          const f = new Date(t.finishDate).getTime();
          if (f > latest) latest = f;
        }
        if (t.baselineStart) {
          const bs = new Date(t.baselineStart).getTime();
          if (bs < earliest) earliest = bs;
        }
        if (t.baselineFinish) {
          const bf = new Date(t.baselineFinish).getTime();
          if (bf > latest) latest = bf;
        }
      });

      if (earliest !== Infinity) minDate = new Date(earliest);
      if (latest !== -Infinity) maxDate = new Date(latest);
    }

    // Add padding (7 days before, 30 days after)
    const start = new Date(minDate);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);

    const end = new Date(maxDate);
    end.setDate(end.getDate() + 30);
    end.setHours(23, 59, 59, 999);

    const total = Math.max(30, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

    let dWidth = 34;
    if (zoomLevel === 'week') dWidth = 16;
    else if (zoomLevel === 'month') dWidth = 6;
    else if (zoomLevel === 'quarter') dWidth = 3;

    return { timelineStart: start, totalDays: total, dayWidth: dWidth };
  }, [tasks, zoomLevel]);

  // Convert Date to horizontal X pixel offset
  const dateToX = useCallback(
    (d: Date | string) => {
      const date = new Date(d);
      const diffMs = date.getTime() - timelineStart.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return Math.round(diffDays * dayWidth);
    },
    [timelineStart, dayWidth]
  );

  // Convert X pixel offset to Date
  const xToDate = useCallback(
    (x: number) => {
      const days = x / dayWidth;
      const d = new Date(timelineStart);
      d.setDate(d.getDate() + Math.round(days));
      return d;
    },
    [timelineStart, dayWidth]
  );

  // Compute Task bar coordinates map for DependencyArrows overlay
  const taskCoordinates = useMemo(() => {
    const map = new Map<string, { x: number; y: number; width: number; isCritical?: boolean }>();

    visibleTasks.forEach((task, idx) => {
      if (!task.startDate || !task.finishDate) return;
      const startX = dateToX(task.startDate);
      const finishX = dateToX(task.finishDate) + dayWidth;
      const width = Math.max(dayWidth, finishX - startX);
      const y = idx * ROW_HEIGHT + ROW_HEIGHT / 2;

      map.set(task._id, {
        x: startX,
        y,
        width: task.isMilestone ? dayWidth : width,
        isCritical: task.isCritical,
      });
    });

    return map;
  }, [visibleTasks, dateToX, dayWidth]);

  // Drag handlers (Move & Resize)
  const handleBarMouseDown = (e: React.MouseEvent, task: ProjectTask, type: 'move' | 'resize' | 'link') => {
    e.stopPropagation();
    if (task.isSummary && type !== 'link') return; // MS Project summaries cannot be moved directly

    dragRef.current = {
      type,
      taskId: task._id,
      startX: e.clientX,
      initialStart: new Date(task.startDate || new Date()),
      initialFinish: new Date(task.finishDate || new Date()),
      initialDuration: task.duration || 1,
    };

    const handleMouseMove = (moveEv: MouseEvent) => {
      if (!dragRef.current) return;
      const deltaX = moveEv.clientX - dragRef.current.startX;
      const deltaDays = Math.round(deltaX / dayWidth);

      if (dragRef.current.type === 'move') {
        const newStart = new Date(dragRef.current.initialStart);
        newStart.setDate(newStart.getDate() + deltaDays);
        const newFinish = new Date(dragRef.current.initialFinish);
        newFinish.setDate(newFinish.getDate() + deltaDays);

        onUpdateTaskDates(
          dragRef.current.taskId,
          newStart.toISOString().slice(0, 10),
          newFinish.toISOString().slice(0, 10),
          dragRef.current.initialDuration
        );
      } else if (dragRef.current.type === 'resize') {
        const newDur = Math.max(1, dragRef.current.initialDuration + deltaDays);
        const newFinish = new Date(dragRef.current.initialStart);
        newFinish.setDate(newFinish.getDate() + newDur - 1);

        onUpdateTaskDates(
          dragRef.current.taskId,
          dragRef.current.initialStart.toISOString().slice(0, 10),
          newFinish.toISOString().slice(0, 10),
          newDur
        );
      }
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const totalWidth = totalDays * dayWidth;
  const totalHeight = visibleTasks.length * ROW_HEIGHT;
  const todayX = dateToX(new Date());

  // Auto-scroll to today on initial mount
  React.useEffect(() => {
    if (!hasAutoScrolledRef.current && scrollRef.current && todayX > 0) {
      const containerWidth = scrollRef.current.clientWidth || 800;
      scrollRef.current.scrollLeft = Math.max(0, todayX - containerWidth / 3);
      hasAutoScrolledRef.current = true;
    }
  }, [todayX, scrollRef]);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="gantt-chart-wrapper flex-1 overflow-x-auto overflow-y-auto bg-white select-none relative"
      style={{ height: '100%' }}
    >
      <div style={{ width: totalWidth, height: totalHeight + 50, position: 'relative' }}>
        {/* Sticky Timescale Header */}
        <GanttTimescale
          timelineStart={timelineStart}
          totalDays={totalDays}
          dayWidth={dayWidth}
          zoomLevel={zoomLevel}
          scrollLeft={0}
        />

        {/* Gantt Canvas / Body */}
        <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
          {/* Background Weekend Shading & Grid Lines */}
          <div className="absolute inset-0 pointer-events-none flex">
            {Array.from({ length: totalDays }).map((_, i) => {
              const d = new Date(timelineStart);
              d.setDate(d.getDate() + i);
              const isSun = d.getDay() === 0;

              return (
                <div
                  key={i}
                  className={`h-full border-r border-slate-100 ${isSun ? 'bg-slate-100/70' : 'bg-transparent'}`}
                  style={{ width: dayWidth, minWidth: dayWidth }}
                />
              );
            })}
          </div>

          {/* Horizontal Row Divider Lines */}
          <div className="absolute inset-0 pointer-events-none">
            {visibleTasks.map((_, idx) => (
              <div
                key={idx}
                className="w-full border-b border-slate-100"
                style={{ height: ROW_HEIGHT }}
              />
            ))}
          </div>

          {/* Today Indicator Vertical Line */}
          {todayX >= 0 && todayX <= totalWidth && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none border-l-2 border-dashed border-rose-500 z-30"
              style={{ left: todayX }}
            >
              <div className="bg-rose-500 text-white text-[9px] font-bold px-1 rounded-xs -ml-4 -mt-2 shadow-xs">
                TODAY
              </div>
            </div>
          )}

          {/* Dependency Link Arrows Layer */}
          {showDependencies && (
            <DependencyArrows
              tasks={visibleTasks}
              taskCoordinates={taskCoordinates}
              width={totalWidth}
              height={totalHeight}
            />
          )}

          {/* Task Bars Layer */}
          <div className="relative z-10">
            {visibleTasks.map((task, idx) => {
              if (!task.startDate || !task.finishDate) return null;

              const barX = dateToX(task.startDate);
              const finishX = dateToX(task.finishDate) + dayWidth;
              const barW = Math.max(dayWidth, finishX - barX);
              const topY = idx * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;

              const isCritical = Boolean(showCriticalPath && task.isCritical);

              // Baseline bar calculations
              let baselineX = 0;
              let baselineW = 0;
              const hasBaseline = Boolean((showBaseline || activeView === 'tracking') && task.baselineStart && task.baselineFinish);
              if (hasBaseline) {
                baselineX = dateToX(task.baselineStart!);
                const bFinishX = dateToX(task.baselineFinish!) + dayWidth;
                baselineW = Math.max(dayWidth, bFinishX - baselineX);
              }

              // Slippage indicator for Tracking Gantt (current finish extends beyond baseline finish)
              const hasSlip = Boolean(hasBaseline && finishX > baselineX + baselineW);
              const slipX = baselineX + baselineW;
              const slipW = finishX - slipX;

              // Deadline marker
              const hasDeadline = Boolean(task.deadlineDate);
              const deadlineX = hasDeadline ? dateToX(task.deadlineDate!) + dayWidth / 2 : 0;

              const isCompleted = (task.percentComplete || 0) === 100;

              return (
                <div
                  key={task._id}
                  className="absolute"
                  style={{ top: idx * ROW_HEIGHT, left: 0, width: totalWidth, height: ROW_HEIGHT }}
                >
                  {/* Baseline shadow bar */}
                  {hasBaseline && (
                    <div
                      className={`absolute rounded-xs pointer-events-none border ${
                        activeView === 'tracking'
                          ? 'h-2 bg-slate-500/80 border-slate-600 top-[23px]'
                          : 'h-2 bg-slate-400/60 border-slate-500/40 top-[24px]'
                      }`}
                      style={{ left: baselineX, width: baselineW }}
                      title={`Baseline: ${task.baselineStart?.slice(0, 10)} - ${task.baselineFinish?.slice(0, 10)}`}
                    />
                  )}

                  {/* Slippage indicator bar */}
                  {hasSlip && (
                    <div
                      className="absolute h-1.5 bg-rose-500/70 border border-rose-600 top-[24px] pointer-events-none rounded-xs"
                      style={{ left: slipX, width: slipW }}
                      title={`Schedule Slip: ${Math.round(slipW / dayWidth)} working days behind baseline`}
                    />
                  )}

                  {/* Deadline Marker (Green downward triangle) */}
                  {hasDeadline && (
                    <div
                      className="absolute top-1 pointer-events-none flex flex-col items-center z-20"
                      style={{ left: deadlineX - 5 }}
                      title={`Deadline: ${task.deadlineDate?.slice(0, 10)}`}
                    >
                      <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] border-t-emerald-600 drop-shadow-xs" />
                      <div className="w-[1px] h-6 bg-emerald-500/40 border-dashed" />
                    </div>
                  )}

                  {/* Task Bar Types */}
                  {task.isMilestone ? (
                    /* Milestone Marker: Diamond ◆ */
                    <div
                      onMouseDown={e => handleBarMouseDown(e, task, 'move')}
                      onDoubleClick={() => onOpenDialog(task._id)}
                      onMouseEnter={e => {
                        setHoveredTask(task);
                        setTooltipPos({ x: e.clientX, y: e.clientY });
                      }}
                      onMouseLeave={() => setHoveredTask(null)}
                      className="absolute cursor-pointer flex items-center group z-20"
                      style={{ left: barX - 8, top: topY + 1 }}
                    >
                      <div className={`w-4 h-4 rotate-45 border-2 shadow-xs transition-transform group-hover:scale-125 ${
                        isCompleted
                          ? (isCritical ? 'bg-rose-600 border-rose-800' : 'bg-emerald-600 border-emerald-800')
                          : (isCritical ? 'bg-rose-100 border-rose-600' : 'bg-amber-100 border-amber-600')
                      }`} />
                      <span className="ml-3 text-[11px] font-medium text-slate-800 whitespace-nowrap drop-shadow-xs">
                        {task.name} ({task.startDate ? task.startDate.slice(5, 10) : ''})
                        {isCompleted && <span className="ml-1 text-emerald-600 font-bold">✓</span>}
                      </span>
                    </div>
                  ) : task.isSummary ? (
                    /* Summary Task: MS Project Bracket Bar */
                    <div
                      onDoubleClick={() => onOpenDialog(task._id)}
                      onMouseEnter={e => {
                        setHoveredTask(task);
                        setTooltipPos({ x: e.clientX, y: e.clientY });
                      }}
                      onMouseLeave={() => setHoveredTask(null)}
                      className="absolute cursor-pointer group z-20"
                      style={{ left: barX, top: topY + 1, width: barW }}
                    >
                      {/* Top bracket bar */}
                      <div className={`h-[8px] relative rounded-xs shadow-xs ${
                        isCritical ? 'bg-rose-950' : 'bg-slate-900'
                      }`}>
                        {/* Summary progress fill */}
                        <div
                          className="h-full bg-blue-500/80 rounded-xs"
                          style={{ width: `${task.percentComplete || 0}%` }}
                        />
                        {/* Downward triangle bracket at left */}
                        <div
                          className={`absolute -left-1 top-[6px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] ${
                            isCritical ? 'border-t-rose-950' : 'border-t-slate-900'
                          }`}
                        />
                        {/* Downward triangle bracket at right */}
                        <div
                          className={`absolute -right-1 top-[6px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] ${
                            isCritical ? 'border-t-rose-950' : 'border-t-slate-900'
                          }`}
                        />
                      </div>
                      <span className="absolute left-[calc(100%+10px)] -top-1 text-[11px] font-bold text-slate-900 whitespace-nowrap">
                        {task.name}
                        <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                          ({task.percentComplete || 0}%)
                        </span>
                      </span>
                    </div>
                  ) : (
                    /* Standard Task Bar */
                    <div
                      onMouseDown={e => handleBarMouseDown(e, task, 'move')}
                      onDoubleClick={() => onOpenDialog(task._id)}
                      onMouseEnter={e => {
                        setHoveredTask(task);
                        setTooltipPos({ x: e.clientX, y: e.clientY });
                      }}
                      onMouseLeave={() => setHoveredTask(null)}
                      className={`absolute rounded-xs h-[18px] cursor-move shadow-xs flex items-center group overflow-hidden border ${
                        isCritical
                          ? 'bg-rose-500 border-rose-700'
                          : task.barColor
                          ? 'border-blue-700'
                          : 'bg-blue-600 border-blue-700'
                      }`}
                      style={{
                        left: barX,
                        top: topY,
                        width: barW,
                        backgroundColor: task.barColor || undefined,
                      }}
                    >
                      {/* Percent complete inner fill */}
                      <div
                        className="h-full bg-black/35 pointer-events-none transition-all"
                        style={{ width: `${task.percentComplete || 0}%` }}
                      />

                      {/* Right Edge Resize Handle */}
                      <div
                        onMouseDown={e => handleBarMouseDown(e, task, 'resize')}
                        className="absolute right-0 top-0 bottom-0 w-3 cursor-e-resize hover:bg-white/40 rounded-r transition-colors z-10"
                        title="Drag to resize duration"
                      />

                      {/* Task Name Label on the Right */}
                      <span className="absolute left-[calc(100%+8px)] text-[11px] font-medium text-slate-800 whitespace-nowrap pointer-events-none drop-shadow-xs">
                        {task.name}
                        {task.percentComplete > 0 && (
                          <span className="ml-1 text-[10px] font-semibold text-slate-600">
                            {task.percentComplete}%
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Hover Tooltip */}
      {hoveredTask && tooltipPos && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-900/95 backdrop-blur-xs text-white text-xs rounded-lg shadow-2xl p-3 min-w-[220px] border border-slate-700"
          style={{
            left: Math.min(window.innerWidth - 240, tooltipPos.x + 15),
            top: Math.min(window.innerHeight - 200, tooltipPos.y + 15),
          }}
        >
          <div className="font-bold text-sm text-blue-300 mb-1 flex items-center justify-between border-b border-slate-700 pb-1">
            <span className="truncate max-w-[160px]">{hoveredTask.name}</span>
            <span className="text-slate-400 font-mono text-[10px]">WBS: {hoveredTask.wbsCode || '-'}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-300 mt-1.5">
            <div>
              <span className="text-slate-400">Duration:</span>{' '}
              {hoveredTask.isMilestone ? '0d' : `${hoveredTask.duration}d`}
            </div>
            <div>
              <span className="text-slate-400">Progress:</span> {hoveredTask.percentComplete || 0}%
            </div>
            <div>
              <span className="text-slate-400">Start:</span> {hoveredTask.startDate?.slice(0, 10) || '-'}
            </div>
            <div>
              <span className="text-slate-400">Finish:</span> {hoveredTask.finishDate?.slice(0, 10) || '-'}
            </div>
            {hoveredTask.totalFloat !== undefined && (
              <div className="col-span-2">
                <span className="text-slate-400">Total Float:</span> {hoveredTask.totalFloat}d{' '}
                {hoveredTask.isCritical && <span className="text-rose-400 font-semibold">(Critical)</span>}
              </div>
            )}
            {hoveredTask.plannedCost ? (
              <div className="col-span-2 text-slate-300">
                <span className="text-slate-400">Planned Cost:</span> Rp {hoveredTask.plannedCost.toLocaleString('id-ID')}
              </div>
            ) : null}
            {hoveredTask.actualCost ? (
              <div className="col-span-2 text-slate-300">
                <span className="text-slate-400">Actual Cost:</span> Rp {hoveredTask.actualCost.toLocaleString('id-ID')}
              </div>
            ) : null}
            {hoveredTask.baselineStart && (
              <div className="col-span-2 text-slate-400 border-t border-slate-700/80 pt-1 mt-1 text-[10px]">
                Baseline: {hoveredTask.baselineStart.slice(0, 10)} — {hoveredTask.baselineFinish?.slice(0, 10)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
