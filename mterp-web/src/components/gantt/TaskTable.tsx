import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProjectTask } from '../../types';
import { ColumnDef } from './useGanttState';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Diamond,
  Flame,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  UserX,
} from 'lucide-react';

interface TaskTableProps {
  tasks: ProjectTask[];
  columns: ColumnDef[];
  selectedTaskIds: string[];
  collapsedTaskIds: Set<string>;
  onSelectTask: (taskId: string, isMulti: boolean) => void;
  onToggleCollapse: (taskId: string) => void;
  onUpdateTask: (taskId: string, field: keyof ProjectTask, value: any) => void;
  onOpenDialog: (taskId: string) => void;
  onContextMenu: (e: React.MouseEvent, taskId: string) => void;
  onResizeColumn: (columnId: string, width: number) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  columns,
  selectedTaskIds,
  collapsedTaskIds,
  onSelectTask,
  onToggleCollapse,
  onUpdateTask,
  onOpenDialog,
  onContextMenu,
  onResizeColumn,
  scrollRef,
  onScroll,
}) => {
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement | null>(null);

  // Resize column state
  const resizingColRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

  // Filter out hidden subtasks under collapsed summaries (transitive check)
  const visibleTasks = useMemo(() => {
    const parentMap = new Map<string, string>();

    tasks.forEach(t => {
      const id = String(t._id);
      const rawParent = t.parentTaskId;
      const pId = rawParent
        ? typeof rawParent === 'object' && rawParent !== null
          ? String((rawParent as { _id?: unknown; id?: unknown })._id || (rawParent as { id?: unknown }).id || rawParent)
          : String(rawParent)
        : null;
      if (pId) parentMap.set(id, pId);
    });

    const isTaskHidden = (taskId: string): boolean => {
      let currentParentId = parentMap.get(taskId);
      while (currentParentId) {
        if (collapsedTaskIds.has(currentParentId)) return true;
        currentParentId = parentMap.get(currentParentId);
      }
      return false;
    };

    return tasks.filter(t => !isTaskHidden(String(t._id)));
  }, [tasks, collapsedTaskIds]);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  const handleCellDoubleClick = (task: ProjectTask, field: string) => {
    if (field === 'indicators' || (task.isSummary && (field === 'duration' || field === 'startDate' || field === 'finishDate'))) {
      onOpenDialog(task._id);
      return;
    }

    let initialVal = '';
    if (field === 'duration') initialVal = String(task.duration || 0);
    else if (field === 'startDate') initialVal = task.startDate ? task.startDate.slice(0, 10) : '';
    else if (field === 'finishDate') initialVal = task.finishDate ? task.finishDate.slice(0, 10) : '';
    else if (field === 'percentComplete') initialVal = String(task.percentComplete || 0);
    else if (field === 'name') initialVal = task.name;
    else if (field === 'plannedCost') initialVal = String(task.plannedCost || 0);
    else if (field === 'predecessors') {
      initialVal = (task.predecessors || [])
        .map(p => {
          const pTask = tasks.find(t => t._id === (typeof p.taskId === 'string' ? p.taskId : p.taskId?._id));
          const idOrOrder = pTask ? pTask.sortOrder + 1 : '';
          return `${idOrOrder}${p.type !== 'FS' ? p.type : ''}${p.lagDays ? (p.lagDays > 0 ? `+${p.lagDays}d` : `${p.lagDays}d`) : ''}`;
        })
        .filter(Boolean)
        .join(', ');
    }

    setEditingCell({ taskId: task._id, field });
    setEditValue(initialVal);
  };

  const commitCellEdit = () => {
    if (!editingCell) return;
    const { taskId, field } = editingCell;

    if (field === 'name') {
      if (editValue.trim()) onUpdateTask(taskId, 'name', editValue.trim());
    } else if (field === 'duration') {
      const parsed = Math.max(0, parseInt(editValue, 10) || 0);
      onUpdateTask(taskId, 'duration', parsed);
    } else if (field === 'percentComplete') {
      const parsed = Math.min(100, Math.max(0, parseInt(editValue, 10) || 0));
      onUpdateTask(taskId, 'percentComplete', parsed);
    } else if (field === 'startDate' || field === 'finishDate') {
      if (editValue) onUpdateTask(taskId, field as keyof ProjectTask, editValue);
    } else if (field === 'plannedCost') {
      const parsed = Math.max(0, parseFloat(editValue) || 0);
      onUpdateTask(taskId, 'plannedCost', parsed);
    }

    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitCellEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // Column resizing mouse events
  const startResize = (colId: string, currentWidth: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColRef.current = { id: colId, startX: e.clientX, startWidth: currentWidth };

    const handleMouseMove = (moveEv: MouseEvent) => {
      if (!resizingColRef.current) return;
      const delta = moveEv.clientX - resizingColRef.current.startX;
      onResizeColumn(resizingColRef.current.id, resizingColRef.current.startWidth + delta);
    };

    const handleMouseUp = () => {
      resizingColRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const visibleColumns = columns.filter(c => c.visible);
  const totalTableWidth = visibleColumns.reduce((sum, c) => sum + c.width, 0);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="task-table-wrapper flex-1 overflow-x-auto overflow-y-auto bg-white select-none border-r border-slate-300"
      style={{ height: '100%' }}
    >
      <div style={{ width: totalTableWidth, minWidth: '100%' }}>
        {/* Table Header */}
        <div className="sticky top-0 z-20 flex bg-gradient-to-b from-slate-50 to-slate-100 border-b border-slate-300 text-xs font-semibold text-slate-700 h-[50px] shadow-xs">
          {visibleColumns.map(col => (
            <div
              key={col.id}
              className="relative flex items-center px-2 border-r border-slate-200 uppercase tracking-wider text-[11px] font-bold text-slate-700 truncate"
              style={{ width: col.width, minWidth: col.width, justifyContent: col.align || 'left' }}
            >
              <span className="truncate">{col.label}</span>
              {/* Drag handle for resizing column */}
              <div
                onMouseDown={e => startResize(col.id, col.width, e)}
                className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/60 transition-colors"
              />
            </div>
          ))}
        </div>

        {/* Table Rows */}
        <div className="task-table-body divide-y divide-slate-100">
          {visibleTasks.map((task, rowIdx) => {
            const isSelected = selectedTaskIds.includes(task._id);
            const isCollapsed = collapsedTaskIds.has(task._id);
            const indentPadding = ((task.outlineLevel || 1) - 1) * 16;

            return (
              <div
                key={task._id}
                onClick={e => onSelectTask(task._id, e.ctrlKey || e.metaKey)}
                onContextMenu={e => onContextMenu(e, task._id)}
                className={`flex h-10 text-xs transition-colors items-center border-b border-slate-200 cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/80 text-blue-950 font-medium border-l-2 border-l-blue-500'
                    : rowIdx % 2 === 1
                    ? 'bg-slate-50/60 hover:bg-blue-50/50'
                    : 'bg-white hover:bg-blue-50/50'
                } ${task.isSummary ? 'font-semibold text-slate-900 bg-slate-50/40' : 'text-slate-700'}`}
              >
                {visibleColumns.map(col => {
                  const isEditing = editingCell?.taskId === task._id && editingCell?.field === col.id;

                  return (
                    <div
                      key={col.id}
                      onDoubleClick={() => handleCellDoubleClick(task, col.id)}
                      className={`h-full flex items-center px-2 border-r border-slate-200 truncate ${
                        col.align === 'right'
                          ? 'justify-end'
                          : col.align === 'center'
                          ? 'justify-center'
                          : 'justify-start'
                      }`}
                      style={{ width: col.width, minWidth: col.width }}
                    >
                      {isEditing ? (
                        col.id === 'startDate' || col.id === 'finishDate' ? (
                          <input
                            ref={editInputRef}
                            type="date"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitCellEdit}
                            onKeyDown={handleKeyDown}
                            className="w-full h-7 px-1 text-xs border border-blue-500 rounded outline-none bg-white"
                          />
                        ) : (
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitCellEdit}
                            onKeyDown={handleKeyDown}
                            className="w-full h-7 px-1 text-xs border border-blue-500 rounded outline-none bg-white"
                          />
                        )
                      ) : (
                        /* Cell Display Mode */
                        (() => {
                          switch (col.id) {
                            case 'indicators':
                              return (
                                <div className="flex items-center gap-1 justify-center w-full">
                                  {task.isMilestone && (
                                    <span title="Milestone">
                                      <Diamond className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                    </span>
                                  )}
                                  {task.isCritical && (
                                    <span title="Critical Path Task">
                                      <Flame className="w-3.5 h-3.5 text-rose-500" />
                                    </span>
                                  )}
                                  {task.isDeadlineMissed && (
                                    <span title="Deadline Missed!">
                                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                    </span>
                                  )}
                                  {!task.isDeadlineMissed && task.deadlineDate && (
                                    <span title={`Deadline: ${task.deadlineDate.slice(0, 10)}`}>
                                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                    </span>
                                  )}
                                  {task.constraintType && task.constraintType !== 'ASAP' && (
                                    <span title={`Constraint: ${task.constraintType} ${task.constraintDate ? task.constraintDate.slice(0, 10) : ''}`}>
                                      <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                    </span>
                                  )}
                                  {task.isOverallocated && (
                                    <span title="Resource Overallocated!">
                                      <UserX className="w-3.5 h-3.5 text-rose-500" />
                                    </span>
                                  )}
                                  {task.notes && (
                                    <span title={task.notes}>
                                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                                    </span>
                                  )}
                                  {task.percentComplete === 100 && (
                                    <span title="Completed">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    </span>
                                  )}
                                </div>
                              );

                            case 'wbsCode':
                              return (
                                <span className="font-mono text-[10px] bg-slate-100/90 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200/70 font-medium">
                                  {task.wbsCode}
                                </span>
                              );

                            case 'name':
                              return (
                                <div className="flex items-center w-full truncate" style={{ paddingLeft: `${indentPadding}px` }}>
                                  {task.isSummary && (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        onToggleCollapse(task._id);
                                      }}
                                      className="p-0.5 mr-1 hover:bg-slate-200 rounded text-slate-600 transition-colors"
                                    >
                                      {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                  {!task.isSummary && <span className="w-4 inline-block" />}
                                  <span className="truncate">{task.name}</span>
                                </div>
                              );

                            case 'duration':
                              return (
                                <span className="font-mono text-slate-600">
                                  {task.isMilestone ? '0 days' : `${task.duration} ${task.duration === 1 ? 'day' : 'days'}`}
                                </span>
                              );

                            case 'startDate':
                              return (
                                <span className="font-mono text-[11px] text-slate-600">
                                  {task.startDate ? task.startDate.slice(0, 10) : '-'}
                                </span>
                              );

                            case 'finishDate':
                              return (
                                <span className="font-mono text-[11px] text-slate-600">
                                  {task.finishDate ? task.finishDate.slice(0, 10) : '-'}
                                </span>
                              );

                            case 'percentComplete':
                              return (
                                <div className="flex items-center gap-2 w-full justify-end font-mono">
                                  <span className="text-[11px]">{task.percentComplete || 0}%</span>
                                  <div className="w-10 h-2 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                                    <div
                                      className={`h-full rounded-full transition-all ${task.percentComplete === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                                      style={{ width: `${task.percentComplete || 0}%` }}
                                    />
                                  </div>
                                </div>
                              );

                            case 'predecessors': {
                              const predsStr = (task.predecessors || [])
                                .map(p => {
                                  const pTask = tasks.find(t => t._id === (typeof p.taskId === 'string' ? p.taskId : p.taskId?._id));
                                  const rowNum = pTask ? pTask.sortOrder + 1 : '';
                                  return `${rowNum}${p.type !== 'FS' ? p.type : ''}${p.lagDays ? (p.lagDays > 0 ? `+${p.lagDays}d` : `${p.lagDays}d`) : ''}`;
                                })
                                .filter(Boolean)
                                .join(', ');
                              return <span className="font-mono text-[11px] text-slate-600 truncate">{predsStr || '-'}</span>;
                            }

                            case 'resources': {
                              const resStr = (task.assignedResources || [])
                                .map(r => {
                                  if (typeof r.userId === 'object' && r.userId?.name) return r.userId.name;
                                  return 'User';
                                })
                                .join(', ');
                              return <span className="text-slate-600 truncate">{resStr || '-'}</span>;
                            }

                            case 'plannedCost':
                              return (
                                <span className="font-mono text-[11px] text-slate-600">
                                  {task.plannedCost ? `Rp ${task.plannedCost.toLocaleString('id-ID')}` : 'Rp 0'}
                                </span>
                              );

                            case 'plannedWork':
                              return (
                                <span className="font-mono text-[11px] text-slate-600">
                                  {task.plannedWork !== undefined ? `${task.plannedWork} hrs` : '-'}
                                </span>
                              );

                            case 'totalFloat':
                              return (
                                <span className={`font-mono text-[11px] ${task.isCritical ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
                                  {task.totalFloat !== undefined ? `${task.totalFloat}d` : '-'}
                                </span>
                              );

                            case 'freeFloat':
                              return (
                                <span className="font-mono text-[11px] text-slate-600">
                                  {task.freeFloat !== undefined ? `${task.freeFloat}d` : '-'}
                                </span>
                              );

                            case 'deadlineDate':
                              return (
                                <span className={`font-mono text-[11px] ${task.isDeadlineMissed ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
                                  {task.deadlineDate ? task.deadlineDate.slice(0, 10) : '-'}
                                </span>
                              );

                            case 'constraintType':
                              return task.constraintType && task.constraintType !== 'ASAP' ? (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-bold">
                                  {task.constraintType}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">ASAP</span>
                              );

                            case 'constraintDate':
                              return (
                                <span className="font-mono text-[11px] text-slate-600">
                                  {task.constraintDate ? task.constraintDate.slice(0, 10) : '-'}
                                </span>
                              );

                            case 'taskType':
                              return (
                                <span className="text-[11px] text-slate-600 truncate">
                                  {task.taskType === 'FixedDuration' ? 'Fixed Duration' : task.taskType === 'FixedWork' ? 'Fixed Work' : 'Fixed Units'}
                                </span>
                              );

                            case 'baselineStart':
                              return (
                                <span className="font-mono text-[11px] text-slate-500">
                                  {task.baselineStart ? task.baselineStart.slice(0, 10) : '-'}
                                </span>
                              );

                            case 'baselineFinish':
                              return (
                                <span className="font-mono text-[11px] text-slate-500">
                                  {task.baselineFinish ? task.baselineFinish.slice(0, 10) : '-'}
                                </span>
                              );

                            case 'actualCost':
                              return (
                                <span className="font-mono text-[11px] text-slate-600">
                                  {task.actualCost ? `Rp ${task.actualCost.toLocaleString('id-ID')}` : 'Rp 0'}
                                </span>
                              );

                            case 'actualWork':
                              return (
                                <span className="font-mono text-[11px] text-slate-600">
                                  {task.actualWork !== undefined ? `${task.actualWork} hrs` : '-'}
                                </span>
                              );

                            case 'remainingWork':
                              return (
                                <span className="font-mono text-[11px] text-slate-600">
                                  {task.remainingWork !== undefined ? `${task.remainingWork} hrs` : '-'}
                                </span>
                              );

                            case 'bcws': {
                              const bac = task.baselineCost != null ? task.baselineCost : (task.plannedCost || 0);
                              let val = 0;
                              if (task.startDate && task.finishDate && bac > 0) {
                                const s = new Date(task.startDate).getTime();
                                const f = new Date(task.finishDate).getTime();
                                const now = Date.now();
                                if (now >= f) val = bac;
                                else if (now <= s) val = 0;
                                else val = Math.round(bac * Math.min(1, Math.max(0, (now - s) / Math.max(1, f - s))));
                              }
                              return <span className="font-mono text-[11px] text-blue-600">{`Rp ${val.toLocaleString('id-ID')}`}</span>;
                            }

                            case 'bcwp': {
                              const bac = task.baselineCost != null ? task.baselineCost : (task.plannedCost || 0);
                              const val = Math.round(bac * ((task.percentComplete || 0) / 100));
                              return <span className="font-mono text-[11px] text-emerald-600">{`Rp ${val.toLocaleString('id-ID')}`}</span>;
                            }

                            case 'acwp': {
                              const val = task.actualCost || 0;
                              return <span className="font-mono text-[11px] text-purple-600">{`Rp ${val.toLocaleString('id-ID')}`}</span>;
                            }

                            case 'sv': {
                              const bac = task.baselineCost != null ? task.baselineCost : (task.plannedCost || 0);
                              let bcws = 0;
                              if (task.startDate && task.finishDate && bac > 0) {
                                const s = new Date(task.startDate).getTime();
                                const f = new Date(task.finishDate).getTime();
                                const now = Date.now();
                                if (now >= f) bcws = bac;
                                else if (now <= s) bcws = 0;
                                else bcws = Math.round(bac * Math.min(1, Math.max(0, (now - s) / Math.max(1, f - s))));
                              }
                              const bcwp = Math.round(bac * ((task.percentComplete || 0) / 100));
                              const sv = bcwp - bcws;
                              return (
                                <span className={`font-mono text-[11px] font-semibold ${sv >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {sv >= 0 ? '+' : ''}Rp {sv.toLocaleString('id-ID')}
                                </span>
                              );
                            }

                            case 'cv': {
                              const bac = task.baselineCost != null ? task.baselineCost : (task.plannedCost || 0);
                              const bcwp = Math.round(bac * ((task.percentComplete || 0) / 100));
                              const cv = bcwp - (task.actualCost || 0);
                              return (
                                <span className={`font-mono text-[11px] font-semibold ${cv >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {cv >= 0 ? '+' : ''}Rp {cv.toLocaleString('id-ID')}
                                </span>
                              );
                            }

                            case 'spi': {
                              const bac = task.baselineCost != null ? task.baselineCost : (task.plannedCost || 0);
                              let bcws = 0;
                              if (task.startDate && task.finishDate && bac > 0) {
                                const s = new Date(task.startDate).getTime();
                                const f = new Date(task.finishDate).getTime();
                                const now = Date.now();
                                if (now >= f) bcws = bac;
                                else if (now <= s) bcws = 0;
                                else bcws = Math.round(bac * Math.min(1, Math.max(0, (now - s) / Math.max(1, f - s))));
                              }
                              const bcwp = Math.round(bac * ((task.percentComplete || 0) / 100));
                              const spi = bcws > 0 ? Number((bcwp / bcws).toFixed(2)) : (bcwp === 0 ? 1.0 : 0.0);
                              return (
                                <span className={`font-mono text-[11px] font-bold ${spi >= 1 ? 'text-emerald-600' : spi >= 0.9 ? 'text-amber-600' : 'text-rose-600'}`}>
                                  {spi.toFixed(2)}
                                </span>
                              );
                            }

                            case 'cpi': {
                              const bac = task.baselineCost != null ? task.baselineCost : (task.plannedCost || 0);
                              const bcwp = Math.round(bac * ((task.percentComplete || 0) / 100));
                              const acwp = task.actualCost || 0;
                              const cpi = acwp > 0 ? Number((bcwp / acwp).toFixed(2)) : (bcwp === 0 ? 1.0 : 1.0);
                              return (
                                <span className={`font-mono text-[11px] font-bold ${cpi >= 1 ? 'text-emerald-600' : cpi >= 0.9 ? 'text-amber-600' : 'text-rose-600'}`}>
                                  {cpi.toFixed(2)}
                                </span>
                              );
                            }

                            case 'eac': {
                              const bac = task.baselineCost != null ? task.baselineCost : (task.plannedCost || 0);
                              const bcwp = Math.round(bac * ((task.percentComplete || 0) / 100));
                              const acwp = task.actualCost || 0;
                              const cpi = acwp > 0 ? bcwp / acwp : (bcwp === 0 ? 1.0 : 1.0);
                              const eac = cpi > 0 ? Math.round(bac / cpi) : bac;
                              return <span className="font-mono text-[11px] text-slate-700">{`Rp ${eac.toLocaleString('id-ID')}`}</span>;
                            }

                            default:
                              return <span>{String((task as any)[col.id] || '')}</span>;
                          }
                        })()
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
