import { useState, useCallback, useRef } from 'react';
import { ProjectTask } from '../../types';

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';
export type ProjectPlanView = 'gantt' | 'tracking' | 'resource_sheet' | 'resource_usage' | 'task_usage' | 'kurva_s';

export interface ColumnDef {
  id: string;
  label: string;
  width: number;
  minWidth?: number;
  visible: boolean;
  align?: 'left' | 'center' | 'right';
}

export const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: 'indicators', label: 'i', width: 42, minWidth: 36, visible: true, align: 'center' },
  { id: 'wbsCode', label: 'WBS', width: 68, minWidth: 50, visible: true, align: 'left' },
  { id: 'name', label: 'Task Name', width: 260, minWidth: 150, visible: true, align: 'left' },
  { id: 'duration', label: 'Duration', width: 85, minWidth: 60, visible: true, align: 'right' },
  { id: 'startDate', label: 'Start', width: 105, minWidth: 90, visible: true, align: 'center' },
  { id: 'finishDate', label: 'Finish', width: 105, minWidth: 90, visible: true, align: 'center' },
  { id: 'predecessors', label: 'Predecessors', width: 100, minWidth: 80, visible: true, align: 'left' },
  { id: 'percentComplete', label: '% Comp.', width: 75, minWidth: 60, visible: true, align: 'right' },
  { id: 'resources', label: 'Resource Names', width: 140, minWidth: 90, visible: true, align: 'left' },
  { id: 'plannedCost', label: 'Cost', width: 110, minWidth: 80, visible: false, align: 'right' },
  { id: 'actualCost', label: 'Actual Cost', width: 110, minWidth: 80, visible: false, align: 'right' },
  { id: 'plannedWork', label: 'Work', width: 80, minWidth: 60, visible: false, align: 'right' },
  { id: 'actualWork', label: 'Actual Work', width: 80, minWidth: 60, visible: false, align: 'right' },
  { id: 'remainingWork', label: 'Rem. Work', width: 80, minWidth: 60, visible: false, align: 'right' },
  { id: 'bcws', label: 'BCWS (PV)', width: 105, minWidth: 80, visible: false, align: 'right' },
  { id: 'bcwp', label: 'BCWP (EV)', width: 105, minWidth: 80, visible: false, align: 'right' },
  { id: 'acwp', label: 'ACWP (AC)', width: 105, minWidth: 80, visible: false, align: 'right' },
  { id: 'sv', label: 'SV', width: 95, minWidth: 70, visible: false, align: 'right' },
  { id: 'cv', label: 'CV', width: 95, minWidth: 70, visible: false, align: 'right' },
  { id: 'spi', label: 'SPI', width: 70, minWidth: 55, visible: false, align: 'right' },
  { id: 'cpi', label: 'CPI', width: 70, minWidth: 55, visible: false, align: 'right' },
  { id: 'eac', label: 'EAC', width: 110, minWidth: 80, visible: false, align: 'right' },
  { id: 'totalFloat', label: 'Total Float', width: 80, minWidth: 60, visible: false, align: 'right' },
  { id: 'freeFloat', label: 'Free Float', width: 80, minWidth: 60, visible: false, align: 'right' },
  { id: 'deadlineDate', label: 'Deadline', width: 105, minWidth: 90, visible: false, align: 'center' },
  { id: 'constraintType', label: 'Constraint', width: 90, minWidth: 70, visible: false, align: 'center' },
  { id: 'constraintDate', label: 'Constraint Date', width: 105, minWidth: 90, visible: false, align: 'center' },
  { id: 'taskType', label: 'Task Type', width: 95, minWidth: 80, visible: false, align: 'left' },
  { id: 'baselineStart', label: 'Baseline Start', width: 105, minWidth: 90, visible: false, align: 'center' },
  { id: 'baselineFinish', label: 'Baseline Finish', width: 105, minWidth: 90, visible: false, align: 'center' },
];

export function useGanttState(initialTasks: ProjectTask[] = []) {
  const [tasks, setTasksState] = useState<ProjectTask[]>(initialTasks);
  const [columns, setColumns] = useState<ColumnDef[]>(DEFAULT_COLUMNS);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [activeCell, setActiveCell] = useState<{ taskId: string; columnId: string } | null>(null);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());

  // View state
  const [activeView, setActiveView] = useState<ProjectPlanView>('gantt');
  const [activeBaselineIndex, setActiveBaselineIndex] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('day');
  const [showCriticalPath, setShowCriticalPath] = useState(true);
  const [showBaseline, setShowBaseline] = useState(true);
  const [showDependencies, setShowDependencies] = useState(true);
  const [splitWidth, setSplitWidth] = useState(580);
  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'critical' | 'milestones' | 'incomplete'>('all');

  // Dialog state
  const [dialogTaskId, setDialogTaskId] = useState<string | null>(null);

  // Undo / Redo history
  const historyRef = useRef<ProjectTask[][]>([]);
  const futureRef = useRef<ProjectTask[][]>([]);

  const pushHistory = useCallback((currentTasks: ProjectTask[]) => {
    historyRef.current.push(JSON.parse(JSON.stringify(currentTasks)));
    if (historyRef.current.length > 30) {
      historyRef.current.shift();
    }
    futureRef.current = []; // Clear redo on new action
  }, []);

  const setTasks = useCallback(
    (newTasksOrUpdater: ProjectTask[] | ((prev: ProjectTask[]) => ProjectTask[]), saveHistory = true) => {
      setTasksState(prev => {
        const next = typeof newTasksOrUpdater === 'function' ? newTasksOrUpdater(prev) : newTasksOrUpdater;
        if (saveHistory) {
          pushHistory(prev);
        }
        return next;
      });
    },
    [pushHistory]
  );

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const previous = historyRef.current.pop()!;
    futureRef.current.push(JSON.parse(JSON.stringify(tasks)));
    setTasksState(previous);
  }, [tasks]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push(JSON.parse(JSON.stringify(tasks)));
    setTasksState(next);
  }, [tasks]);

  const toggleCollapse = useCallback((taskId: string) => {
    setCollapsedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const toggleColumnVisibility = useCallback((columnId: string) => {
    setColumns(prev =>
      prev.map(c => (c.id === columnId ? { ...c, visible: !c.visible } : c))
    );
  }, []);

  const setColumnWidth = useCallback((columnId: string, width: number) => {
    setColumns(prev =>
      prev.map(c => (c.id === columnId ? { ...c, width: Math.max(c.minWidth || 40, width) } : c))
    );
  }, []);

  return {
    tasks,
    setTasks,
    columns,
    setColumns,
    selectedTaskIds,
    setSelectedTaskIds,
    activeCell,
    setActiveCell,
    collapsedTaskIds,
    toggleCollapse,
    zoomLevel,
    setZoomLevel,
    showCriticalPath,
    setShowCriticalPath,
    showBaseline,
    setShowBaseline,
    showDependencies,
    setShowDependencies,
    splitWidth,
    setSplitWidth,
    filterText,
    setFilterText,
    filterType,
    setFilterType,
    dialogTaskId,
    setDialogTaskId,
    activeView,
    setActiveView,
    activeBaselineIndex,
    setActiveBaselineIndex,
    undo,
    redo,
    canUndo: historyRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    toggleColumnVisibility,
    setColumnWidth,
  };
}
