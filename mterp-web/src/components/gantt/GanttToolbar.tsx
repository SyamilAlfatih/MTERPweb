import React, { useState } from 'react';
import { ZoomLevel, ColumnDef } from './useGanttState';
import {
  Plus,
  Diamond,
  Indent,
  Outdent,
  Link,
  Unlink,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Calendar,
  Layers,
  Activity,
  Flame,
  CheckCircle2,
  Trash2,
  Info,
  Maximize2,
  Minimize2,
  Download,
  Upload,
  RefreshCw,
  Eye,
  ArrowUp,
  ArrowDown,
  Printer,
} from 'lucide-react';

interface GanttToolbarProps {
  onAddTask: () => void;
  onAddMilestone: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onLinkTasks: () => void;
  onUnlinkTasks: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSetPercent: (percent: number) => void;
  onDeleteSelected: () => void;
  onOpenDetails: () => void;
  canIndent: boolean;
  canOutdent: boolean;
  canLink: boolean;
  hasSelection: boolean;
  // View props
  zoomLevel: ZoomLevel;
  onSetZoom: (zoom: ZoomLevel) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  showCriticalPath: boolean;
  onToggleCriticalPath: () => void;
  showBaseline: boolean;
  onToggleBaseline: () => void;
  showDependencies: boolean;
  onToggleDependencies: () => void;
  filterType: 'all' | 'critical' | 'milestones' | 'incomplete';
  onSetFilterType: (filter: 'all' | 'critical' | 'milestones' | 'incomplete') => void;
  columns: ColumnDef[];
  onToggleColumn: (colId: string) => void;
  // Project props
  onOpenCalendar?: () => void;
  activeBaselineIndex?: number;
  onSelectBaselineIndex?: (index: number) => void;
  onSetBaseline: (index?: number) => void;
  onClearBaseline: (index?: number) => void;
  onRecalculate: () => void;
  onImportWorkItems: () => void;
  onExportExcel?: () => void;
  onExportXML?: () => void;
  onPrint?: () => void;
  onOpenImportDialog?: () => void;
  // History
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // Fullscreen
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

type RibbonTab = 'task' | 'view' | 'project';

export const GanttToolbar: React.FC<GanttToolbarProps> = ({
  onAddTask,
  onAddMilestone,
  onIndent,
  onOutdent,
  onLinkTasks,
  onUnlinkTasks,
  onMoveUp,
  onMoveDown,
  onSetPercent,
  onDeleteSelected,
  onOpenDetails,
  canIndent,
  canOutdent,
  canLink,
  hasSelection,
  zoomLevel,
  onSetZoom,
  onZoomIn,
  onZoomOut,
  showCriticalPath,
  onToggleCriticalPath,
  showBaseline,
  onToggleBaseline,
  showDependencies,
  onToggleDependencies,
  filterType,
  onSetFilterType,
  columns,
  onToggleColumn,
  onOpenCalendar,
  activeBaselineIndex = 0,
  onSelectBaselineIndex,
  onSetBaseline,
  onClearBaseline,
  onRecalculate,
  onImportWorkItems,
  onExportExcel,
  onExportXML,
  onPrint,
  onOpenImportDialog,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const [activeTab, setActiveTab] = useState<RibbonTab>('task');
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);

  return (
    <div className="gantt-toolbar-ribbon bg-white border-b border-slate-200 select-none shadow-xs">
      {/* Ribbon Top Tab Header */}
      <div className="flex items-center justify-between px-3 bg-[#0d1b3e] text-white text-xs border-b border-slate-800/80">
        <div className="flex items-center gap-1">
          {/* Quick Access Toolbar Icons */}
          <div className="flex items-center gap-1 pr-3 border-r border-slate-700/80 py-1.5">
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              title="Undo (Ctrl+Z)"
              className="p-1.5 hover:bg-white/10 rounded disabled:opacity-30 transition-colors"
            >
              <Undo className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
              title="Redo (Ctrl+Y)"
              className="p-1.5 hover:bg-white/10 rounded disabled:opacity-30 transition-colors"
            >
              <Redo className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRecalculate}
              title="Recalculate Schedule (CPM)"
              className="p-1.5 hover:bg-white/10 rounded transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Ribbon Tab Navigation */}
          <div className="flex items-center gap-1 pl-2 self-end">
            {[
              { id: 'task', label: 'TASK' },
              { id: 'view', label: 'VIEW' },
              { id: 'project', label: 'PROJECT' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as RibbonTab)}
                className={`px-3.5 py-1.5 font-bold tracking-wider text-[11px] transition-all rounded-t-md ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 border-t-2 border-blue-500 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right tools (Fullscreen) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 border border-white/10 rounded-md text-xs transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="text-[11px] font-medium">{isFullscreen ? 'Exit' : 'Full Screen'}</span>
          </button>
        </div>
      </div>

      {/* Ribbon Command Bar Content */}
      <div className="flex items-center gap-4 px-3 py-1.5 bg-white min-h-[54px] text-xs text-slate-700 overflow-x-auto border-b border-slate-200">
        {/* TASK TAB COMMANDS */}
        {activeTab === 'task' && (
          <>
            {/* Insert Group */}
            <div className="flex items-center gap-1 pr-3 border-r border-slate-300">
              <button
                type="button"
                onClick={onAddTask}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-white rounded hover:shadow-xs transition-all text-[11px]"
              >
                <Plus className="w-4 h-4 text-blue-600 mb-0.5" />
                <span>Task</span>
              </button>
              <button
                type="button"
                onClick={onAddMilestone}
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-white rounded hover:shadow-xs transition-all text-[11px]"
              >
                <Diamond className="w-4 h-4 text-amber-500 fill-amber-500 mb-0.5" />
                <span>Milestone</span>
              </button>
            </div>

            {/* Hierarchy & Move Group */}
            <div className="flex items-center gap-1 pr-3 border-r border-slate-300">
              <button
                type="button"
                disabled={!canOutdent}
                onClick={onOutdent}
                title="Outdent (Alt+Shift+Left)"
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-white rounded disabled:opacity-35 transition-all text-[11px]"
              >
                <Outdent className="w-4 h-4 text-slate-700 mb-0.5" />
                <span>Outdent</span>
              </button>
              <button
                type="button"
                disabled={!canIndent}
                onClick={onIndent}
                title="Indent (Alt+Shift+Right)"
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-white rounded disabled:opacity-35 transition-all text-[11px]"
              >
                <Indent className="w-4 h-4 text-slate-700 mb-0.5" />
                <span>Indent</span>
              </button>
              <button
                type="button"
                disabled={!hasSelection}
                onClick={onMoveUp}
                title="Move Task Up"
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-white rounded disabled:opacity-35 transition-all text-[11px]"
              >
                <ArrowUp className="w-4 h-4 text-slate-700 mb-0.5" />
                <span>Up</span>
              </button>
              <button
                type="button"
                disabled={!hasSelection}
                onClick={onMoveDown}
                title="Move Task Down"
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-white rounded disabled:opacity-35 transition-all text-[11px]"
              >
                <ArrowDown className="w-4 h-4 text-slate-700 mb-0.5" />
                <span>Down</span>
              </button>
            </div>

            {/* Links / Dependencies Group */}
            <div className="flex items-center gap-1 pr-3 border-r border-slate-300">
              <button
                type="button"
                disabled={!canLink}
                onClick={onLinkTasks}
                title="Link Selected Tasks (Finish-to-Start)"
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-white rounded disabled:opacity-35 transition-all text-[11px]"
              >
                <Link className="w-4 h-4 text-indigo-600 mb-0.5" />
                <span>Link</span>
              </button>
              <button
                type="button"
                disabled={!hasSelection}
                onClick={onUnlinkTasks}
                title="Unlink Selected Tasks"
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-white rounded disabled:opacity-35 transition-all text-[11px]"
              >
                <Unlink className="w-4 h-4 text-slate-600 mb-0.5" />
                <span>Unlink</span>
              </button>
            </div>

            {/* % Complete Quick Preset Group */}
            <div className="flex items-center gap-1 pr-3 border-r border-slate-300">
              <span className="text-[10px] text-slate-500 font-semibold mr-1">Progress:</span>
              {[0, 25, 50, 75, 100].map(pct => (
                <button
                  key={pct}
                  type="button"
                  disabled={!hasSelection}
                  onClick={() => onSetPercent(pct)}
                  className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono hover:bg-blue-50 hover:border-blue-500 disabled:opacity-35 transition-all"
                >
                  {pct}%
                </button>
              ))}
            </div>

            {/* Details & Delete Group */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!hasSelection}
                onClick={onOpenDetails}
                title="Task Information"
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-white rounded disabled:opacity-35 transition-all text-[11px]"
              >
                <Info className="w-4 h-4 text-blue-600 mb-0.5" />
                <span>Information</span>
              </button>
              <button
                type="button"
                disabled={!hasSelection}
                onClick={onDeleteSelected}
                title="Delete Selected Task"
                className="flex flex-col items-center justify-center px-2 py-1 hover:bg-rose-50 text-rose-600 rounded disabled:opacity-35 transition-all text-[11px]"
              >
                <Trash2 className="w-4 h-4 mb-0.5" />
                <span>Delete</span>
              </button>
            </div>
          </>
        )}

        {/* VIEW TAB COMMANDS */}
        {activeTab === 'view' && (
          <>
            {/* Zoom Controls */}
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
              <button
                type="button"
                onClick={onZoomIn}
                title="Zoom In"
                className="p-1.5 hover:bg-slate-100 rounded-md text-slate-700 transition-colors"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onZoomOut}
                title="Zoom Out"
                className="p-1.5 hover:bg-slate-100 rounded-md text-slate-700 transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              {/* Segmented Zoom Level Control */}
              <div className="flex items-center bg-slate-100/90 p-0.5 border border-slate-200 rounded-lg ml-1">
                {(['day', 'week', 'month', 'quarter'] as ZoomLevel[]).map(z => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => onSetZoom(z)}
                    className={`px-2.5 py-1 text-[11px] uppercase font-bold rounded-md transition-all ${
                      zoomLevel === z
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {z}
                  </button>
                ))}
              </div>
            </div>

            {/* Visual Layers Toggle */}
            <div className="flex items-center gap-2 pr-3 border-r border-slate-200">
              <button
                type="button"
                onClick={onToggleCriticalPath}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-[11px] font-semibold transition-all ${
                  showCriticalPath
                    ? 'bg-rose-50 border-rose-400 text-rose-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Flame className={`w-3.5 h-3.5 ${showCriticalPath ? 'text-rose-600' : 'text-slate-400'}`} />
                Critical Path
              </button>

              <button
                type="button"
                onClick={onToggleBaseline}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-[11px] font-semibold transition-all ${
                  showBaseline
                    ? 'bg-slate-100 border-slate-400 text-slate-800 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Layers className={`w-3.5 h-3.5 ${showBaseline ? 'text-slate-700' : 'text-slate-400'}`} />
                Baseline
              </button>

              <button
                type="button"
                onClick={onToggleDependencies}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-[11px] font-semibold transition-all ${
                  showDependencies
                    ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Activity className={`w-3.5 h-3.5 ${showDependencies ? 'text-blue-600' : 'text-slate-400'}`} />
                Dependency Links
              </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
              <span className="text-[10px] text-slate-500 font-semibold mr-1">Filter:</span>
              <select
                value={filterType}
                onChange={e => onSetFilterType(e.target.value as any)}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-700 shadow-xs outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All Tasks</option>
                <option value="critical">Critical Tasks</option>
                <option value="milestones">Milestones Only</option>
                <option value="incomplete">Incomplete Tasks</option>
              </select>
            </div>

            {/* Column Chooser */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnsMenu(prev => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-md text-xs font-medium text-slate-700 shadow-xs"
              >
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                Columns
              </button>

              {showColumnsMenu && (
                <div className="absolute top-full left-0 mt-1.5 w-52 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl shadow-xl p-2.5 z-40 space-y-1 animate-dropdown-enter">
                  <div className="text-[10px] font-bold uppercase text-slate-400 px-1 mb-1 tracking-wider">
                    Toggle Table Columns
                  </div>
                  {columns.map(col => (
                    <label
                      key={col.id}
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 rounded-lg text-xs cursor-pointer text-slate-700 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={col.visible}
                        onChange={() => onToggleColumn(col.id)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* PROJECT TAB COMMANDS */}
        {activeTab === 'project' && (
          <>
            {/* Calendar & Working Time */}
            {onOpenCalendar && (
              <div className="flex items-center gap-2 pr-3 border-r border-slate-300">
                <button
                  type="button"
                  onClick={onOpenCalendar}
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
                  title="Change Working Time, standard work hours, and holiday exceptions"
                >
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  <span>Change Working Time</span>
                </button>
              </div>
            )}

            {/* Baseline Group (Multiple Baselines 0-10) */}
            <div className="flex items-center gap-2 pr-3 border-r border-slate-300">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold text-slate-500">Baseline:</span>
                <select
                  value={activeBaselineIndex}
                  onChange={e => onSelectBaselineIndex && onSelectBaselineIndex(parseInt(e.target.value, 10))}
                  className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-xs font-semibold"
                >
                  <option value={0}>Baseline (Initial)</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(idx => (
                    <option key={idx} value={idx}>
                      Baseline {idx}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  const bName = activeBaselineIndex === 0 ? 'Baseline' : `Baseline ${activeBaselineIndex}`;
                  if (window.confirm(`Set current project schedule as ${bName}?`)) {
                    onSetBaseline(activeBaselineIndex);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
              >
                <Layers className="w-3.5 h-3.5" />
                Set Baseline
              </button>

              <button
                type="button"
                onClick={() => {
                  const bName = activeBaselineIndex === 0 ? 'Baseline' : `Baseline ${activeBaselineIndex}`;
                  if (window.confirm(`Clear snapshot for ${bName}?`)) {
                    onClearBaseline(activeBaselineIndex);
                  }
                }}
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 rounded text-xs text-slate-700 transition-colors"
              >
                Clear Baseline
              </button>
            </div>

            {/* Recalculate */}
            <div className="flex items-center gap-2 pr-3 border-r border-slate-300">
              <button
                type="button"
                onClick={onRecalculate}
                className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded text-xs font-semibold text-slate-700 transition-colors"
                title="Recalculate critical path, forward/backward pass, and floats"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                Recalculate CPM
              </button>
            </div>

            {/* Export Group */}
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-300">
              <span className="text-[10px] font-semibold text-slate-500 mr-0.5">Export:</span>
              {onExportExcel && (
                <button
                  type="button"
                  onClick={onExportExcel}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 rounded text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
                  title="Export all tasks and metrics to formatted Excel (.xlsx)"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Excel</span>
                </button>
              )}
              {onExportXML && (
                <button
                  type="button"
                  onClick={onExportXML}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 rounded text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
                  title="Export to MS Project standard XML format"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>XML</span>
                </button>
              )}
              {onPrint && (
                <button
                  type="button"
                  onClick={onPrint}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
                  title="Print schedule (A3 / A4 Landscape layout)"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-700" />
                  <span>Print</span>
                </button>
              )}
            </div>

            {/* Import Group */}
            <div className="flex items-center gap-2">
              {onOpenImportDialog && (
                <button
                  type="button"
                  onClick={onOpenImportDialog}
                  className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
                  title="Import schedule from Excel or MS Project XML"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import File</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Import work items from this project into the planning schedule?')) {
                    onImportWorkItems();
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 rounded text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
                title="Import legacy work items into plan"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-600" />
                <span>Work Items</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
