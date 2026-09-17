import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectTask, ProjectPlanSummary, ProjectCalendar, ProjectResource } from '../types';
import {
  getProjectPlanTasks,
  createProjectPlanTask,
  updateProjectPlanTask,
  deleteProjectPlanTask,
  indentProjectTask,
  outdentProjectTask,
  moveProjectTask,
  setProjectTaskPredecessors,
  setProjectBaseline,
  clearProjectBaseline,
  getProjectCalendar,
  updateProjectCalendar,
  recalculateProjectSchedule as apiRecalculate,
  importWorkItemsToPlan,
  getProjectPlanSummary,
  getProjectResources,
  createProjectResource,
  updateProjectResource,
  deleteProjectResource,
  levelProjectResources,
  exportProjectExcel,
  exportProjectXML,
} from '../api/api';
import api from '../api/api';
import { useGanttState, DEFAULT_COLUMNS } from '../components/gantt/useGanttState';
import { GanttToolbar } from '../components/gantt/GanttToolbar';
import { TaskTable } from '../components/gantt/TaskTable';
import { GanttChart } from '../components/gantt/GanttChart';
import { TaskDialog } from '../components/gantt/TaskDialog';
import { CalendarDialog } from '../components/gantt/CalendarDialog';
import { ViewSidebar } from '../components/gantt/ViewSidebar';
import { ResourceSheetView } from '../components/gantt/ResourceSheetView';
import { ResourceUsageView } from '../components/gantt/ResourceUsageView';
import { TaskUsageView } from '../components/gantt/TaskUsageView';
import { SCurveView } from '../components/gantt/SCurveView';
import { ExportImportDialog } from '../components/gantt/ExportImportDialog';
import { PrintView } from '../components/gantt/PrintView';
import {
  ArrowLeft,
  Calendar,
  Layers,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Clock,
  Briefcase,
  HelpCircle,
} from 'lucide-react';
import './ProjectPlan.css';

export const ProjectPlan: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<any>(null);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [calendar, setCalendar] = useState<ProjectCalendar | null>(null);
  const [resources, setResources] = useState<ProjectResource[]>([]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [summary, setSummary] = useState<ProjectPlanSummary | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);

  // Gantt State Hook
  const {
    tasks,
    setTasks,
    columns,
    selectedTaskIds,
    setSelectedTaskIds,
    collapsedTaskIds,
    toggleCollapse,
    activeView,
    setActiveView,
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
    filterType,
    setFilterType,
    dialogTaskId,
    setDialogTaskId,
    activeBaselineIndex,
    setActiveBaselineIndex,
    undo,
    redo,
    canUndo,
    canRedo,
    toggleColumnVisibility,
    setColumnWidth,
  } = useGanttState([]);

  // Synchronized scroll refs
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const chartScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingScroll = useRef<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Splitter dragging
  const isDraggingSplitter = useRef(false);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);

      const [projRes, tasksRes, usersRes, sumRes, calRes, resRes] = await Promise.all([
        api.get(`/projects/${id}`),
        getProjectPlanTasks(id),
        api.get('/users').catch(() => ({ data: [] })),
        getProjectPlanSummary(id).catch(() => ({ summary: null })),
        getProjectCalendar(id).catch(() => ({ calendar: null })),
        getProjectResources(id).catch(() => ({ resources: [] })),
      ]);

      setProject(projRes.data);
      setTasks(tasksRes.tasks || [], false);
      setAvailableUsers(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.users || []);
      if (sumRes && sumRes.summary) setSummary(sumRes.summary);
      if (calRes && calRes.calendar) setCalendar(calRes.calendar);
      if (resRes && resRes.resources) setResources(resRes.resources);
    } catch (err: any) {
      console.error('Failed to load project plan data:', err);
      setError(err.response?.data?.msg || err.message || 'Failed to load project schedule');
    } finally {
      setLoading(false);
    }
  }, [id, setTasks]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Synchronized Vertical Scroll Handler
  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (chartScrollRef.current) {
      chartScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  const handleChartScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  // Splitter drag mouse handling
  const startSplitterDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplitter.current = true;

    const handleMouseMove = (moveEv: MouseEvent) => {
      if (!isDraggingSplitter.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = Math.max(300, Math.min(rect.width - 250, moveEv.clientX - rect.left));
      setSplitWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDraggingSplitter.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Task Selection
  const handleSelectTask = (taskId: string, isMulti: boolean) => {
    if (isMulti) {
      setSelectedTaskIds(prev =>
        prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
      );
    } else {
      setSelectedTaskIds([taskId]);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (dialogTaskId) return; // Ignore while dialog is open
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Insert') {
        e.preventDefault();
        handleAddTask();
      } else if (e.key === 'Delete' && selectedTaskIds.length > 0) {
        e.preventDefault();
        handleDeleteSelected();
      } else if (e.altKey && e.shiftKey && e.key === 'ArrowRight' && selectedTaskIds.length > 0) {
        e.preventDefault();
        handleIndent();
      } else if (e.altKey && e.shiftKey && e.key === 'ArrowLeft' && selectedTaskIds.length > 0) {
        e.preventDefault();
        handleOutdent();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogTaskId, selectedTaskIds, undo, redo]);

  // Context Menu close on outside click
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // CRUD Operations
  const handleAddTask = async () => {
    if (!id) return;
    try {
      const selectedTask = tasks.find(t => selectedTaskIds.includes(t._id));
      const targetOrder = selectedTask ? selectedTask.sortOrder + 1 : tasks.length;
      const targetLevel = selectedTask ? selectedTask.outlineLevel : 1;

      const res = await createProjectPlanTask(id, {
        name: 'New Task',
        duration: 1,
        sortOrder: targetOrder,
        outlineLevel: targetLevel,
      });

      setTasks(res.tasks);
      setSelectedTaskIds([res.task._id]);
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Failed to create task');
    }
  };

  const handleAddMilestone = async () => {
    if (!id) return;
    try {
      const selectedTask = tasks.find(t => selectedTaskIds.includes(t._id));
      const targetOrder = selectedTask ? selectedTask.sortOrder + 1 : tasks.length;
      const targetLevel = selectedTask ? selectedTask.outlineLevel : 1;

      const res = await createProjectPlanTask(id, {
        name: 'New Milestone',
        duration: 0,
        isMilestone: true,
        sortOrder: targetOrder,
        outlineLevel: targetLevel,
      });

      setTasks(res.tasks);
      setSelectedTaskIds([res.task._id]);
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Failed to create milestone');
    }
  };

  const handleUpdateTask = async (taskId: string, field: keyof ProjectTask, value: any) => {
    if (!id) return;
    // Optimistic local update
    setTasks(prev =>
      prev.map(t => (t._id === taskId ? { ...t, [field]: value } : t))
    );

    try {
      const res = await updateProjectPlanTask(id, taskId, { [field]: value });
      setTasks(res.tasks, false);
    } catch (err: any) {
      console.error('Failed to update task:', err);
      // Revert on failure
      fetchData();
    }
  };

  const handleUpdateTaskDates = async (taskId: string, newStartDate: string, newFinishDate?: string, newDuration?: number) => {
    if (!id) return;
    const payload: Partial<ProjectTask> = { startDate: newStartDate };
    if (newFinishDate) payload.finishDate = newFinishDate;
    if (newDuration !== undefined) payload.duration = newDuration;

    // Optimistic local update
    setTasks(prev =>
      prev.map(t => (t._id === taskId ? { ...t, ...payload } : t))
    );

    try {
      const res = await updateProjectPlanTask(id, taskId, payload);
      setTasks(res.tasks, false);
    } catch (err: any) {
      console.error('Failed to update dates:', err);
      fetchData();
    }
  };

  const handleDeleteSelected = async () => {
    if (!id || selectedTaskIds.length === 0) return;
    const taskToDelete = tasks.find(t => t._id === selectedTaskIds[0]);
    if (!taskToDelete) return;

    if (!window.confirm(`Delete task "${taskToDelete.name}"?`)) return;

    try {
      const res = await deleteProjectPlanTask(id, taskToDelete._id);
      setTasks(res.tasks);
      setSelectedTaskIds([]);
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Failed to delete task');
    }
  };

  const handleIndent = async () => {
    if (!id || selectedTaskIds.length === 0) return;
    try {
      const res = await indentProjectTask(id, selectedTaskIds[0]);
      setTasks(res.tasks);
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Cannot indent task');
    }
  };

  const handleOutdent = async () => {
    if (!id || selectedTaskIds.length === 0) return;
    try {
      const res = await outdentProjectTask(id, selectedTaskIds[0]);
      setTasks(res.tasks);
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Cannot outdent task');
    }
  };

  const handleMoveUp = async () => {
    if (!id || selectedTaskIds.length === 0) return;
    const currentTask = tasks.find(t => t._id === selectedTaskIds[0]);
    if (!currentTask || currentTask.sortOrder <= 0) return;

    try {
      const res = await moveProjectTask(id, currentTask._id, currentTask.sortOrder - 1);
      setTasks(res.tasks);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleMoveDown = async () => {
    if (!id || selectedTaskIds.length === 0) return;
    const currentTask = tasks.find(t => t._id === selectedTaskIds[0]);
    if (!currentTask || currentTask.sortOrder >= tasks.length - 1) return;

    try {
      const res = await moveProjectTask(id, currentTask._id, currentTask.sortOrder + 1);
      setTasks(res.tasks);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleLinkTasks = async () => {
    if (!id || selectedTaskIds.length < 2) return;
    const [predId, succId] = selectedTaskIds;
    const succTask = tasks.find(t => t._id === succId);
    if (!succTask) return;

    const existingPreds = succTask.predecessors || [];
    if (existingPreds.some(p => (typeof p.taskId === 'string' ? p.taskId : p.taskId?._id) === predId)) {
      alert('These tasks are already linked.');
      return;
    }

    try {
      const res = await setProjectTaskPredecessors(id, succId, [
        ...existingPreds,
        { taskId: predId, type: 'FS', lagDays: 0 },
      ]);
      setTasks(res.tasks);
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Cannot link tasks');
    }
  };

  const handleUnlinkTasks = async () => {
    if (!id || selectedTaskIds.length === 0) return;
    const taskId = selectedTaskIds[0];
    try {
      const res = await setProjectTaskPredecessors(id, taskId, []);
      setTasks(res.tasks);
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Cannot unlink tasks');
    }
  };

  const handleSetPercent = async (percent: number) => {
    if (!id || selectedTaskIds.length === 0) return;
    handleUpdateTask(selectedTaskIds[0], 'percentComplete', percent);
  };

  const handleSetBaseline = async (index?: number) => {
    if (!id) return;
    const targetIdx = index !== undefined ? index : activeBaselineIndex;
    try {
      const res = await setProjectBaseline(id, targetIdx);
      setTasks(res.tasks);
      alert(res.msg || `Baseline ${targetIdx === 0 ? '' : targetIdx} snapshot saved.`);
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Failed to set baseline');
    }
  };

  const handleClearBaseline = async (index?: number) => {
    if (!id) return;
    const targetIdx = index !== undefined ? index : activeBaselineIndex;
    try {
      const res = await clearProjectBaseline(id, targetIdx);
      setTasks(res.tasks);
      alert(res.msg || `Baseline ${targetIdx === 0 ? '' : targetIdx} snapshot cleared.`);
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Failed to clear baseline');
    }
  };

  const handleSaveCalendar = async (updated: Partial<ProjectCalendar>) => {
    if (!id) return;
    const res = await updateProjectCalendar(id, updated);
    setCalendar(res.calendar);
    setTasks(res.tasks);
  };

  const handleRecalculate = async () => {
    if (!id) return;
    try {
      const res = await apiRecalculate(id);
      setTasks(res.tasks);
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Failed to recalculate schedule');
    }
  };

  const handleImportWorkItems = async () => {
    if (!id) return;
    try {
      const res = await importWorkItemsToPlan(id);
      setTasks(res.tasks);
      alert(`Imported ${res.importedCount} work items into the project plan.`);
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Failed to import work items');
    }
  };

  const handleSaveDialog = async (taskId: string, updatedData: Partial<ProjectTask>) => {
    if (!id) return;
    try {
      const res = await updateProjectPlanTask(id, taskId, updatedData);
      setTasks(res.tasks);
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Failed to update task');
    }
  };

  const handleContextMenu = (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    setSelectedTaskIds([taskId]);
    setContextMenu({ x: e.clientX, y: e.clientY, taskId });
  };

  // Zoom controls
  const handleZoomIn = () => {
    if (zoomLevel === 'quarter') setZoomLevel('month');
    else if (zoomLevel === 'month') setZoomLevel('week');
    else if (zoomLevel === 'week') setZoomLevel('day');
  };

  const handleZoomOut = () => {
    if (zoomLevel === 'day') setZoomLevel('week');
    else if (zoomLevel === 'week') setZoomLevel('month');
    else if (zoomLevel === 'month') setZoomLevel('quarter');
  };

  // Selected task state helpers
  const selectedTask = tasks.find(t => selectedTaskIds.includes(t._id));
  const selectedIndex = selectedTask ? tasks.findIndex(t => t._id === selectedTask._id) : -1;
  const canIndent = selectedIndex > 0;
  const canOutdent = Boolean(selectedTask && selectedTask.outlineLevel > 1);
  const canLink = selectedTaskIds.length >= 2;

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    if (filterType === 'critical') return t.isCritical;
    if (filterType === 'milestones') return t.isMilestone;
    if (filterType === 'incomplete') return t.percentComplete < 100;
    return true;
  });

  const taskForDialog = tasks.find(t => t._id === dialogTaskId) || null;

  return (
    <div className={`project-plan-page ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Top Application Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0d1b3e] text-white border-b border-slate-800/90 select-none shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/projects/${id}`)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white rounded-md text-xs transition-colors border border-white/10"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Project</span>
          </button>
          <div className="h-4 w-px bg-slate-700/80" />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              <span>{project ? project.nama : 'Loading project...'}</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                MS Project Schedule
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-300">
          {project?.lokasi && (
            <span className="flex items-center gap-1 text-slate-300 bg-white/5 px-2 py-0.5 rounded border border-white/10">
              <Briefcase className="w-3.5 h-3.5 text-blue-300" />
              {project.lokasi}
            </span>
          )}
          {tasks.length > 0 && (
            <span className="bg-white/10 px-2.5 py-0.5 rounded-full font-mono text-[11px] text-slate-200 border border-white/10">
              {tasks.length} {tasks.length === 1 ? 'Task' : 'Tasks'}
            </span>
          )}
        </div>
      </div>

      {/* Resource & Export Handlers */}
      {(() => null)()}

      {/* Ribbon Toolbar */}
      <GanttToolbar
        onAddTask={handleAddTask}
        onAddMilestone={handleAddMilestone}
        onIndent={handleIndent}
        onOutdent={handleOutdent}
        onLinkTasks={handleLinkTasks}
        onUnlinkTasks={handleUnlinkTasks}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        onSetPercent={handleSetPercent}
        onDeleteSelected={handleDeleteSelected}
        onOpenDetails={() => {
          if (selectedTaskIds.length > 0) setDialogTaskId(selectedTaskIds[0]);
        }}
        canIndent={canIndent}
        canOutdent={canOutdent}
        canLink={canLink}
        hasSelection={selectedTaskIds.length > 0}
        zoomLevel={zoomLevel}
        onSetZoom={setZoomLevel}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        showCriticalPath={showCriticalPath}
        onToggleCriticalPath={() => setShowCriticalPath(prev => !prev)}
        showBaseline={showBaseline}
        onToggleBaseline={() => setShowBaseline(prev => !prev)}
        showDependencies={showDependencies}
        onToggleDependencies={() => setShowDependencies(prev => !prev)}
        filterType={filterType}
        onSetFilterType={setFilterType}
        columns={columns}
        onToggleColumn={toggleColumnVisibility}
        onOpenCalendar={() => setIsCalendarOpen(true)}
        activeBaselineIndex={activeBaselineIndex}
        onSelectBaselineIndex={setActiveBaselineIndex}
        onSetBaseline={handleSetBaseline}
        onClearBaseline={handleClearBaseline}
        onRecalculate={handleRecalculate}
        onImportWorkItems={handleImportWorkItems}
        onExportExcel={async () => {
          if (!id) return;
          try {
            await exportProjectExcel(id);
          } catch (e: any) {
            alert('Failed to export Excel');
          }
        }}
        onExportXML={async () => {
          if (!id) return;
          try {
            await exportProjectXML(id);
          } catch (e: any) {
            alert('Failed to export XML');
          }
        }}
        onPrint={() => setIsPrintOpen(true)}
        onOpenImportDialog={() => setIsImportOpen(true)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(prev => !prev)}
      />

      {/* Main Workspace with Left ViewSidebar */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
        {/* Left MS Project View Sidebar */}
        <ViewSidebar
          activeView={activeView}
          onSelectView={setActiveView}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        />

        {/* Center/Right Dynamic View Panel */}
        <div className="flex-1 flex overflow-hidden relative bg-white">
          {loading ? (
            <div className="flex-1 flex items-center justify-center bg-white">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-600 font-medium">Loading project schedule...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center bg-white p-6">
              <div className="max-w-md text-center">
                <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-slate-800 mb-1">Failed to load schedule</h3>
                <p className="text-xs text-slate-600 mb-4">{error}</p>
                <button
                  type="button"
                  onClick={fetchData}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : activeView === 'resource_sheet' ? (
            <ResourceSheetView
              resources={resources}
              availableUsers={availableUsers}
              onAddResource={async newRes => {
                if (!id) return;
                try {
                  const res = await createProjectResource(id, newRes);
                  if (res.success && res.resource) {
                    setResources(prev => [...prev, res.resource]);
                  }
                } catch (e: any) {
                  alert(e?.response?.data?.msg || 'Failed to add resource');
                }
              }}
              onUpdateResource={async (resId, updated) => {
                if (!id) return;
                try {
                  const res = await updateProjectResource(id, resId, updated);
                  if (res.success && res.resource) {
                    setResources(prev => prev.map(r => r._id === resId ? res.resource : r));
                  }
                } catch (e: any) {
                  alert(e?.response?.data?.msg || 'Failed to update resource');
                }
              }}
              onDeleteResource={async resId => {
                if (!id) return;
                try {
                  await deleteProjectResource(id, resId);
                  setResources(prev => prev.filter(r => r._id !== resId));
                } catch (e: any) {
                  alert(e?.response?.data?.msg || 'Failed to delete resource');
                }
              }}
              onLevelResources={async () => {
                if (!id) return;
                try {
                  const res = await levelProjectResources(id);
                  if (res.success && res.tasks) {
                    setTasks(res.tasks);
                    alert(res.msg || 'Resource leveling completed.');
                  }
                } catch (e: any) {
                  alert(e?.response?.data?.msg || 'Failed to level resources');
                }
              }}
            />
          ) : activeView === 'resource_usage' ? (
            <ResourceUsageView tasks={tasks} resources={resources} />
          ) : activeView === 'task_usage' ? (
            <TaskUsageView tasks={tasks} resources={resources} />
          ) : activeView === 'kurva_s' ? (
            <div className="flex-1 overflow-y-auto">
              <SCurveView projectId={id || ''} project={project} />
            </div>
          ) : loading ? (
            /* Split-Pane Loading Skeleton */
            <div className="flex-1 flex overflow-hidden bg-white animate-pulse">
              <div style={{ width: splitWidth, minWidth: 250 }} className="border-r border-slate-200 p-4 space-y-3 shrink-0">
                <div className="h-6 bg-slate-200 rounded-md w-3/4 mb-4" />
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-4 bg-slate-200 rounded w-10" />
                    <div className={`h-4 bg-slate-200 rounded ${i % 3 === 0 ? 'w-48 font-bold' : 'w-32'}`} />
                    <div className="h-4 bg-slate-100 rounded w-14 ml-auto" />
                  </div>
                ))}
              </div>
              <div className="flex-1 p-4 space-y-4 bg-slate-50/50 overflow-hidden">
                <div className="h-6 bg-slate-200 rounded-md w-full mb-4" />
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="relative h-6 w-full">
                    <div
                      className="absolute h-4 bg-blue-200/60 rounded-md"
                      style={{ left: `${(i * 9) % 55 + 5}%`, width: `${((i * 13) % 30) + 15}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center bg-slate-50/50 p-6">
              <div className="max-w-md text-center p-8 bg-white rounded-2xl shadow-xl border border-slate-200/80">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3.5 shadow-xs">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1.5">No tasks in project plan</h3>
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  Start building your project schedule by adding tasks, importing Excel/XML files, or pulling existing work items.
                </p>
                <div className="flex items-center justify-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleAddTask}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all hover:shadow"
                  >
                    + Add First Task
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsImportOpen(true)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all hover:shadow"
                  >
                    Import File (.xlsx / .xml)
                  </button>
                  <button
                    type="button"
                    onClick={handleImportWorkItems}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-all hover:shadow"
                  >
                    Import Work Items
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* Left Pane: Spreadsheet Task Table */}
              <div style={{ width: splitWidth, minWidth: 250, height: '100%' }} className="flex flex-col shrink-0">
                <TaskTable
                  tasks={filteredTasks}
                  columns={columns}
                  selectedTaskIds={selectedTaskIds}
                  collapsedTaskIds={collapsedTaskIds}
                  onSelectTask={handleSelectTask}
                  onToggleCollapse={toggleCollapse}
                  onUpdateTask={handleUpdateTask}
                  onOpenDialog={taskId => setDialogTaskId(taskId)}
                  onContextMenu={handleContextMenu}
                  onResizeColumn={setColumnWidth}
                  scrollRef={tableScrollRef}
                  onScroll={handleTableScroll}
                />
              </div>

              {/* Splitter Divider Handle */}
              <div
                onMouseDown={startSplitterDrag}
                className="split-pane-divider"
                title="Drag to resize pane"
              />

              {/* Right Pane: Gantt Chart View */}
              <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 300 }}>
                <GanttChart
                  tasks={filteredTasks}
                  collapsedTaskIds={collapsedTaskIds}
                  zoomLevel={zoomLevel}
                  showCriticalPath={showCriticalPath}
                  showBaseline={showBaseline}
                  showDependencies={showDependencies}
                  activeView={activeView}
                  onUpdateTaskDates={handleUpdateTaskDates}
                  onCreateDependency={(fromId, toId) => {
                    // Create FS link
                    const targetTask = tasks.find(t => t._id === toId);
                    if (!targetTask) return;
                    const existing = targetTask.predecessors || [];
                    if (existing.some(p => (typeof p.taskId === 'string' ? p.taskId : p.taskId?._id) === fromId)) return;
                    handleUpdateTask(toId, 'predecessors', [
                      ...existing,
                      { taskId: fromId, type: 'FS', lagDays: 0 },
                    ]);
                  }}
                  onOpenDialog={taskId => setDialogTaskId(taskId)}
                  scrollRef={chartScrollRef}
                  onScroll={handleChartScroll}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MS Project Status Bar */}
      <div className="project-plan-statusbar bg-[#0d1b3e] text-slate-300 border-t border-slate-800">
        <div className="flex items-center gap-4">
          <span>
            Tasks: <strong className="text-white font-mono">{tasks.length}</strong>
          </span>
          {summary && (
            <>
              <span>
                Duration: <strong className="text-white">{summary.totalDurationDays} days</strong>
              </span>
              <span className="flex items-center gap-1.5">
                Progress: <strong className="text-white">{summary.overallPercentComplete}%</strong>
                <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden inline-block align-middle">
                  <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${summary.overallPercentComplete}%` }} />
                </div>
              </span>
              <span>
                Critical Tasks: <strong className="text-rose-400 font-bold">{summary.criticalTasksCount}</strong>
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-400">
            View: <strong className="uppercase text-blue-300 font-mono">{activeView}</strong>
          </span>
          <span className="text-[10px] text-slate-400">
            Zoom: <strong className="uppercase text-slate-200">{zoomLevel}</strong>
          </span>
          <span className="text-[10px] text-slate-400">
            Baseline: <strong className={tasks.some(t => t.baselineStart) ? 'text-emerald-400' : 'text-slate-400'}>{tasks.some(t => t.baselineStart) ? 'Saved' : 'None'}</strong>
          </span>
        </div>
      </div>

      {/* Task Information Modal Dialog */}
      <TaskDialog
        task={taskForDialog}
        allTasks={tasks}
        availableUsers={availableUsers}
        isOpen={Boolean(dialogTaskId)}
        onClose={() => setDialogTaskId(null)}
        onSave={handleSaveDialog}
        onDelete={handleDeleteSelected}
      />

      {/* Calendar / Working Time Modal Dialog */}
      <CalendarDialog
        isOpen={isCalendarOpen}
        calendar={calendar}
        onClose={() => setIsCalendarOpen(false)}
        onSave={handleSaveCalendar}
      />

      {/* Excel / MS Project XML Import Dialog */}
      <ExportImportDialog
        isOpen={isImportOpen}
        projectId={id || ''}
        onClose={() => setIsImportOpen(false)}
        onImportSuccess={importedTasks => {
          setTasks(importedTasks);
          fetchData();
        }}
      />

      {/* Print View Modal */}
      {isPrintOpen && (
        <PrintView
          project={project}
          tasks={tasks}
          summary={summary}
          onClose={() => setIsPrintOpen(false)}
        />
      )}

      {/* Right-Click Context Menu with Backdrop */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-[199]"
            onClick={() => setContextMenu(null)}
            onContextMenu={e => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            className="fixed z-[200] bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-2xl py-1.5 text-xs text-slate-700 min-w-[170px] animate-dropdown-enter"
            style={{
              left: Math.min(window.innerWidth - 180, contextMenu.x),
              top: Math.min(window.innerHeight - 240, contextMenu.y),
            }}
          >
            <button
              type="button"
              onClick={() => {
                setDialogTaskId(contextMenu.taskId);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700 font-medium transition-colors"
            >
              Task Information...
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              onClick={() => {
                handleAddTask();
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 transition-colors"
            >
              Insert Task
            </button>
            <button
              type="button"
              onClick={() => {
                handleAddMilestone();
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 transition-colors"
            >
              Insert Milestone
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              disabled={!canIndent}
              onClick={() => {
                handleIndent();
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 disabled:opacity-40 transition-colors"
            >
              Indent
            </button>
            <button
              type="button"
              disabled={!canOutdent}
              onClick={() => {
                handleOutdent();
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 disabled:opacity-40 transition-colors"
            >
              Outdent
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              onClick={() => {
                handleDeleteSelected();
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50 transition-colors"
            >
              Delete Task
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ProjectPlan;
