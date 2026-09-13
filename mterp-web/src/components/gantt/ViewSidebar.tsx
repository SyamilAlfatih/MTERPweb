import React from 'react';
import { ProjectPlanView } from './useGanttState';
import {
  Calendar,
  Layers,
  Users,
  BarChart3,
  ListTodo,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface ViewSidebarProps {
  activeView: ProjectPlanView;
  onSelectView: (view: ProjectPlanView) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface ViewItem {
  id: ProjectPlanView;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
  description: string;
}

const VIEWS: ViewItem[] = [
  {
    id: 'gantt',
    label: 'Gantt Chart',
    shortLabel: 'Gantt',
    icon: Calendar,
    description: 'Task spreadsheet and interactive Gantt timeline schedule',
  },
  {
    id: 'tracking',
    label: 'Tracking Gantt',
    shortLabel: 'Tracking',
    icon: Layers,
    description: 'Compare current project schedule directly with saved baselines',
  },
  {
    id: 'resource_sheet',
    label: 'Resource Sheet',
    shortLabel: 'Resources',
    icon: Users,
    description: 'Manage manpower, materials, equipment, standard rates and units',
  },
  {
    id: 'resource_usage',
    label: 'Resource Usage',
    shortLabel: 'Res. Usage',
    icon: BarChart3,
    description: 'Time-phased daily allocation grid & over-allocation heat-map',
  },
  {
    id: 'task_usage',
    label: 'Task Usage',
    shortLabel: 'Task Usage',
    icon: ListTodo,
    description: 'Time-phased work hours distributed by task and assignments',
  },
  {
    id: 'kurva_s',
    label: 'Kurva S',
    shortLabel: 'Kurva S',
    icon: TrendingUp,
    description: 'S-Curve: Kumulatif rencana vs realisasi fisik, biaya, dan analisis EVM',
  },
];

export const ViewSidebar: React.FC<ViewSidebarProps> = ({
  activeView,
  onSelectView,
  isCollapsed,
  onToggleCollapse,
}) => {
  return (
    <div
      className={`bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col transition-all duration-200 select-none z-10 ${
        isCollapsed ? 'w-12' : 'w-44'
      }`}
    >
      {/* Sidebar Header / Toggle */}
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider text-slate-400">
        {!isCollapsed && <span>MS Project Views</span>}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1 hover:bg-slate-800 hover:text-white rounded transition-colors ml-auto"
          title={isCollapsed ? 'Expand View Bar' : 'Collapse View Bar'}
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* View List */}
      <div className="flex-1 py-1.5 space-y-1">
        {VIEWS.map(item => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              title={isCollapsed ? `${item.label} - ${item.description}` : item.description}
              className={`w-full flex items-center gap-2 px-2.5 py-2 text-xs transition-all relative ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-300" />
              )}
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Bottom Status / Mode */}
      {!isCollapsed && (
        <div className="p-2 border-t border-slate-800 text-[10px] text-slate-400 text-center">
          <span className="font-mono">MTERP CPM v2.0</span>
        </div>
      )}
    </div>
  );
};
