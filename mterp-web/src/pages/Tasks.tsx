import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  ClipboardList, Circle, Check, Plus, User, Calendar, 
  FolderKanban, AlertCircle, X, ChevronDown, List, LayoutGrid,
  Search, RotateCcw, Clock, CheckCircle2,
  Building2, Briefcase, Trash2, CheckSquare, Layers
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, Button, EmptyState, Input, AriaLiveRegion } from '../components/shared';
import { formatDate as formatWIBDate } from '../utils/date';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useDataGridKeyboard } from '../hooks/useDataGridKeyboard';

interface Subtask {
  _id?: string;
  title: string;
  isCompleted: boolean;
  completedAt?: string;
}

interface TaskData {
  _id: string;
  title: string;
  description?: string;
  scope: 'office' | 'project';
  department?: string;
  officeLocation?: string;
  projectId: { _id: string; nama: string; lokasi: string } | null;
  assignedTo: { _id: string; fullName: string; role: string; position?: string } | null;
  assignedBy: { fullName: string } | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  progress?: number;
  subtasks?: Subtask[];
  dueDate?: string;
  workItemId?: string;
}

interface WorkItemOption {
  _id: string;
  name: string;
}

interface ProjectOption {
  _id: string;
  nama: string;
}

interface UserOption {
  _id: string;
  fullName: string;
  role: string;
  position?: string;
}

type ViewMode = 'cards' | 'table';
type TableDensity = 'compact' | 'normal' | 'comfortable';
type ScopeFilter = 'all' | 'office' | 'project';
type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed';
type PriorityFilter = 'all' | 'urgent' | 'high' | 'normal' | 'low';

const OFFICE_DEPARTMENTS = [
  'General',
  'Management',
  'Finance & Accounting',
  'HRD & GA',
  'Procurement & SCM',
  'Engineering & Design',
  'Legal & Compliance',
  'IT & Infrastructure'
];

export default function Tasks() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlProjectId = searchParams.get('projectId') || '';

  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  
  // View & Density Mode (persisted in localStorage)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('mterp_tasks_view_mode') as ViewMode) || 'table';
  });
  const [tableDensity, setTableDensity] = useState<TableDensity>(() => {
    return (localStorage.getItem('mterp_tasks_density') as TableDensity) || 'normal';
  });

  // Filters & Search
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [projectFilter, setProjectFilter] = useState<string>(urlProjectId);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  useEffect(() => {
    const pId = searchParams.get('projectId') || '';
    if (pId) {
      setProjectFilter(pId);
      setScopeFilter('project');
    }
  }, [searchParams]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'assign'>('create');
  const [selectedTask, setSelectedTask] = useState<TaskData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    scope: 'office' as 'office' | 'project',
    department: 'General',
    projectId: urlProjectId,
    assignedTo: '',
    priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent',
    dueDate: '',
    workItemId: '',
    subtasks: [] as { title: string; isCompleted: boolean }[],
  });
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [taskMode, setTaskMode] = useState<'custom' | 'workitem'>('custom');
  const [projectWorkItems, setProjectWorkItems] = useState<WorkItemOption[]>([]);
  const [loadingWorkItems, setLoadingWorkItems] = useState(false);

  // Focus trap for accessibility
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, {
    isActive: showModal,
    onEscape: () => setShowModal(false),
  });

  const canManageTasks = user?.role && [
    'owner', 'president_director', 'operational_director', 'director', 
    'site_manager', 'supervisor', 'admin_project', 'asset_admin'
  ].includes(user.role);

  useEffect(() => {
    fetchTasks();
    if (canManageTasks) {
      fetchProjects();
      fetchUsers();
    }
  }, []);

  const fetchTasks = async () => {
    try {
      setError(null);
      const response = await api.get('/tasks');
      setTasks(response.data);
    } catch (err: any) {
      console.error('Failed to fetch tasks', err);
      setError(err.response?.data?.msg || t('tasks.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await api.get('/projects');
      setProjects(response.data);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/tasks/users/list');
      setUsers(response.data);
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  };

  const handleSetStatus = async (task: TaskData, newStatus: 'pending' | 'in_progress' | 'completed') => {
    if (task.status === newStatus) return;
    try {
      const res = await api.put(`/tasks/${task._id}/status`, { status: newStatus });
      setTasks(prev => 
        prev.map(t => t._id === task._id ? res.data : t)
      );
      const statusLabels = {
        pending: 'Tertunda (Pending)',
        in_progress: 'Sedang Dikerjakan (In Progress)',
        completed: 'Selesai (Completed)',
      };
      setAnnouncement(`Status tugas "${task.title}" diubah menjadi ${statusLabels[newStatus]}`);
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const handleStatusToggle = async (task: TaskData) => {
    const statusFlow: Record<string, 'pending' | 'in_progress' | 'completed'> = {
      pending: 'in_progress',
      in_progress: 'completed',
      completed: 'pending',
    };
    const nextStatus = statusFlow[task.status] || 'pending';
    await handleSetStatus(task, nextStatus);
  };

  const handleToggleSubtask = async (task: TaskData, subtaskIndex: number) => {
    if (!task.subtasks) return;
    const updatedSubtasks = task.subtasks.map((st, idx) => {
      if (idx === subtaskIndex) {
        return {
          ...st,
          isCompleted: !st.isCompleted,
          completedAt: !st.isCompleted ? new Date().toISOString() : undefined,
        };
      }
      return st;
    });

    const completedCount = updatedSubtasks.filter(s => s.isCompleted).length;
    const newProgress = updatedSubtasks.length > 0
      ? Math.round((completedCount / updatedSubtasks.length) * 100)
      : 0;

    let newStatus = task.status;
    if (newProgress === 100 && task.status !== 'completed') {
      newStatus = 'completed';
    } else if (newProgress > 0 && task.status === 'pending') {
      newStatus = 'in_progress';
    }

    try {
      const res = await api.put(`/tasks/${task._id}`, {
        subtasks: updatedSubtasks,
        progress: newProgress,
        status: newStatus,
      });
      setTasks(prev => prev.map(t => t._id === task._id ? res.data : t));
    } catch (err) {
      console.error('Failed to toggle subtask', err);
    }
  };

  const handleOpenCreate = () => {
    const initialScope: 'office' | 'project' = scopeFilter === 'office' ? 'office' : 'project';
    const defaultProjId = projectFilter || projects[0]?._id || '';
    setFormData({
      title: '',
      description: '',
      scope: initialScope,
      department: 'General',
      projectId: initialScope === 'project' ? defaultProjId : '',
      assignedTo: '',
      priority: 'normal',
      dueDate: '',
      workItemId: '',
      subtasks: [],
    });
    setNewSubtaskTitle('');
    setModalMode('create');
    setTaskMode('custom');
    setProjectWorkItems([]);
    if (initialScope === 'project' && defaultProjId) {
      fetchProjectWorkItems(defaultProjId);
    }
    setSelectedTask(null);
    setShowModal(true);
  };

  const handleAddSubtaskToForm = () => {
    if (!newSubtaskTitle.trim()) return;
    setFormData(prev => ({
      ...prev,
      subtasks: [...prev.subtasks, { title: newSubtaskTitle.trim(), isCompleted: false }],
    }));
    setNewSubtaskTitle('');
  };

  const handleRemoveSubtaskFromForm = (index: number) => {
    setFormData(prev => ({
      ...prev,
      subtasks: prev.subtasks.filter((_, i) => i !== index),
    }));
  };

  const handleProjectChange = async (projectId: string) => {
    setFormData(prev => ({ ...prev, projectId, workItemId: '' }));
    if (taskMode === 'workitem' && projectId) {
      fetchProjectWorkItems(projectId);
    }
  };

  const fetchProjectWorkItems = async (projectId: string) => {
    setLoadingWorkItems(true);
    try {
      const response = await api.get(`/projects/${projectId}`);
      setProjectWorkItems(response.data.workItems || []);
    } catch (err) {
      console.error('Failed to fetch work items', err);
    } finally {
      setLoadingWorkItems(false);
    }
  };

  const handleWorkItemChange = (workItemId: string) => {
    const item = projectWorkItems.find(wi => wi._id === workItemId);
    setFormData(prev => ({
      ...prev,
      workItemId,
      title: item ? item.name : prev.title
    }));
  };

  const toggleTaskMode = (mode: 'custom' | 'workitem') => {
    setTaskMode(mode);
    if (mode === 'workitem' && formData.projectId) {
      fetchProjectWorkItems(formData.projectId);
    }
  };

  const handleOpenAssign = (task: TaskData) => {
    setFormData({
      ...formData,
      scope: task.scope || 'project',
      department: task.department || 'General',
      projectId: task.projectId?._id || '',
      assignedTo: task.assignedTo?._id || '',
    });
    setModalMode('assign');
    setSelectedTask(task);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (modalMode === 'create') {
      if (!formData.title.trim()) {
        alert('Judul tugas wajib diisi.');
        return;
      }
      if (formData.scope === 'project' && !formData.projectId) {
        alert('Silakan pilih proyek untuk tugas kategori proyek.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (modalMode === 'create') {
        const response = await api.post('/tasks', {
          ...formData,
          projectId: formData.scope === 'office' ? (formData.projectId || undefined) : formData.projectId,
        });
        setTasks(prev => [response.data, ...prev]);
        setAnnouncement(`Tugas baru "${response.data.title}" berhasil dibuat`);
      } else if (modalMode === 'assign' && selectedTask) {
        const response = await api.put(`/tasks/${selectedTask._id}/assign`, {
          assignedTo: formData.assignedTo || null,
        });
        setTasks(prev => 
          prev.map(t => t._id === selectedTask._id ? response.data : t)
        );
        setAnnouncement(`Penugasan tugas "${selectedTask.title}" berhasil diperbarui`);
      }
      setShowModal(false);
    } catch (err: any) {
      console.error('Submit error:', err);
      alert(err.response?.data?.msg || t('tasks.messages.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  // Filter tasks across scope, department, project, status, priority, and search
  const filteredTasks = tasks.filter(task => {
    const taskScope = task.scope || 'project';
    if (scopeFilter !== 'all' && taskScope !== scopeFilter) return false;
    if (scopeFilter === 'office' && departmentFilter !== 'all' && task.department !== departmentFilter) return false;
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    if (projectFilter && task.projectId?._id !== projectFilter) return false;
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title?.toLowerCase().includes(q);
      const matchDesc = task.description?.toLowerCase().includes(q);
      const matchProject = task.projectId?.nama?.toLowerCase().includes(q);
      const matchDept = task.department?.toLowerCase().includes(q);
      const matchAssignee = task.assignedTo?.fullName?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchProject && !matchDept && !matchAssignee) return false;
    }
    return true;
  });

  // DataGrid keyboard navigation (Columns: 0: #, 1: Context, 2: Title, 3: Assignee, 4: Priority, 5: Due Date, 6: Status, 7: Actions)
  const { gridProps, getRowProps, getCellProps } = useDataGridKeyboard(
    filteredTasks.length,
    8,
    {
      gridId: 'tasks-grid',
      onActivate: (row: number, col: number) => {
        const task = filteredTasks[row];
        if (!task) return;
        if (col === 6 || col === 7) {
          handleStatusToggle(task);
        } else if (canManageTasks) {
          handleOpenAssign(task);
        }
      },
    }
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={18} className="text-emerald-700" />;
      case 'in_progress':
        return <Clock size={18} className="text-amber-700" />;
      default:
        return <Circle size={18} className="text-slate-400" />;
    }
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, 'danger' | 'warning' | 'primary' | 'neutral'> = {
      urgent: 'danger',
      high: 'danger',
      normal: 'primary',
      low: 'neutral',
    };
    return <Badge label={priority.toUpperCase()} variant={variants[priority] || 'neutral'} size="small" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge label="Selesai" variant="success" size="small" />;
      case 'in_progress':
        return <Badge label="Pengerjaan" variant="warning" size="small" />;
      default:
        return <Badge label="Tertunda" variant="neutral" size="small" />;
    }
  };

  const densityPadding = {
    compact: 'py-2 px-3 text-xs',
    normal: 'py-3 px-4 text-sm',
    comfortable: 'py-4 px-4 text-sm',
  }[tableDensity];

  const stats = {
    total: tasks.length,
    office: tasks.filter(t => (t.scope || 'project') === 'office').length,
    project: tasks.filter(t => (t.scope || 'project') === 'project').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    pending: tasks.filter(t => t.status === 'pending').length,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Screen reader live region */}
      <AriaLiveRegion message={announcement} />

      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Link to="/home" className="hover:text-primary transition-colors flex items-center gap-1 font-medium">
          <span>Beranda</span>
        </Link>
        <span>/</span>
        <span className="text-text-primary font-semibold">
          Manajemen Tugas Terpadu
        </span>
        {projectFilter && (
          <>
            <span>/</span>
            <span className="text-primary font-bold">
              {projects.find(p => p._id === projectFilter)?.nama || 'Proyek Terpilih'}
            </span>
            <button
              onClick={() => {
                setProjectFilter('');
                setSearchParams({});
              }}
              className="text-[11px] text-rose-500 hover:underline ml-1 cursor-pointer"
            >
              (Tampilkan Semua)
            </button>
          </>
        )}
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-6 gap-4 flex-wrap max-sm:flex-col max-sm:gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shadow-xs">
            <ClipboardList size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-text-primary m-0 tracking-tight max-sm:text-xl">
              {t('tasks.title')}
            </h1>
            <p className="text-sm text-text-muted mt-0.5 mb-0">
              Pusat penugasan operasional kantor dan eksekusi proyek lapangan
            </p>
          </div>
        </div>
        
        {canManageTasks && (
          <Button 
            title={t('tasks.actions.addTask')}
            icon={Plus} 
            onClick={handleOpenCreate}
            variant="primary"
          />
        )}
      </div>

      {/* Scope Switcher Tabs (Semua / Kantor / Proyek) */}
      <div className="flex items-center gap-2 border-b border-border-light pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setScopeFilter('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            scopeFilter === 'all'
              ? 'bg-primary text-white shadow-xs'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
          }`}
        >
          <Layers size={14} />
          <span>Semua Lingkup</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">
            {stats.total}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setScopeFilter('office')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            scopeFilter === 'office'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
          }`}
        >
          <Building2 size={14} />
          <span>🏛️ Tugas Kantor & Manajemen</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 text-indigo-800">
            {stats.office}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setScopeFilter('project')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            scopeFilter === 'project'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
          }`}
        >
          <Briefcase size={14} />
          <span>🏗️ Tugas Proyek Lapangan</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800">
            {stats.project}
          </span>
        </button>
      </div>

      {/* Enterprise KPI Metric Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6 max-lg:grid-cols-2">
        <div 
          onClick={() => setStatusFilter('all')}
          className={`bg-bg-white border rounded-xl p-4 flex justify-between items-center shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${statusFilter === 'all' ? 'border-primary ring-2 ring-primary/15' : 'border-border-light'}`}
        >
          <div className="flex flex-col">
            <span className="text-2xl font-extrabold text-text-primary leading-tight font-mono tabular-nums">{filteredTasks.length}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted mt-0.5">Tugas Sesuai Filter</span>
          </div>
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 text-slate-600">
            <ClipboardList size={20} />
          </div>
        </div>

        <div 
          onClick={() => setStatusFilter('pending')}
          className={`bg-bg-white border rounded-xl p-4 flex justify-between items-center shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${statusFilter === 'pending' ? 'border-slate-500 ring-2 ring-slate-400/20' : 'border-border-light'}`}
        >
          <div className="flex flex-col">
            <span className="text-2xl font-extrabold text-slate-700 leading-tight font-mono tabular-nums">{stats.pending}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted mt-0.5">{t('tasks.stats.pending')}</span>
          </div>
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 text-slate-600">
            <Circle size={20} />
          </div>
        </div>

        <div 
          onClick={() => setStatusFilter('in_progress')}
          className={`bg-bg-white border rounded-xl p-4 flex justify-between items-center shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${statusFilter === 'in_progress' ? 'border-amber-500 ring-2 ring-amber-400/20' : 'border-border-light'}`}
        >
          <div className="flex flex-col">
            <span className="text-2xl font-extrabold text-amber-700 leading-tight font-mono tabular-nums">{stats.inProgress}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted mt-0.5">{t('tasks.stats.inProgress')}</span>
          </div>
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-100 text-amber-600">
            <Clock size={20} />
          </div>
        </div>

        <div 
          onClick={() => setStatusFilter('completed')}
          className={`bg-bg-white border rounded-xl p-4 flex justify-between items-center shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${statusFilter === 'completed' ? 'border-emerald-500 ring-2 ring-emerald-400/20' : 'border-border-light'}`}
        >
          <div className="flex flex-col">
            <span className="text-2xl font-extrabold text-emerald-700 leading-tight font-mono tabular-nums">{stats.completed}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted mt-0.5">{t('tasks.stats.completed')}</span>
          </div>
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-100 text-emerald-600">
            <Check size={20} />
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filters & View Toggle */}
      <div className="flex justify-between items-center gap-3 mb-5 flex-wrap max-lg:flex-col max-lg:items-stretch">
        <div className="flex items-center gap-2 flex-1 min-w-[260px] max-lg:w-full flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Cari tugas, deskripsi, departemen, proyek, personil..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              icon={Search}
            />
          </div>

          {/* Department Filter (Visible when viewing office or all) */}
          {(scopeFilter === 'office' || scopeFilter === 'all') && (
            <div className="relative min-w-[160px] max-sm:w-full">
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full py-2.5 px-3 pr-8 border border-border-medium rounded-lg text-xs font-medium text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary"
                title="Filter berdasarkan departemen kantor"
              >
                <option value="all">Semua Departemen</option>
                {OFFICE_DEPARTMENTS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          )}

          {/* Project Filter (Visible when viewing project or all) */}
          {(scopeFilter === 'project' || scopeFilter === 'all') && projects.length > 0 && (
            <div className="relative min-w-[160px] max-sm:w-full">
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="w-full py-2.5 px-3 pr-8 border border-border-medium rounded-lg text-xs font-medium text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary"
                title="Filter berdasarkan proyek"
              >
                <option value="">Semua Proyek</option>
                {projects.map(p => (
                  <option key={p._id} value={p._id}>{p.nama}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          )}

          <div className="relative min-w-[130px] max-sm:w-full">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
              className="w-full py-2.5 px-3 pr-8 border border-border-medium rounded-lg text-xs font-medium text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary"
              title="Filter prioritas"
            >
              <option value="all">Semua Prioritas</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Density Switcher (visible in table mode) */}
          {viewMode === 'table' && (
            <div className="flex items-center bg-bg-white border border-border-light rounded-lg p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => { setTableDensity('compact'); localStorage.setItem('mterp_tasks_density', 'compact'); }}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  tableDensity === 'compact' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Kepadatan Rapat (Compact)"
              >
                Rapat
              </button>
              <button
                type="button"
                onClick={() => { setTableDensity('normal'); localStorage.setItem('mterp_tasks_density', 'normal'); }}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  tableDensity === 'normal' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Kepadatan Standar (Normal)"
              >
                Standar
              </button>
              <button
                type="button"
                onClick={() => { setTableDensity('comfortable'); localStorage.setItem('mterp_tasks_density', 'comfortable'); }}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  tableDensity === 'comfortable' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Kepadatan Lapang (Comfortable)"
              >
                Lapang
              </button>
            </div>
          )}

          {/* View Mode Switcher: Cards vs Table */}
          <div className="flex items-center bg-bg-white border border-border-light rounded-lg p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => { setViewMode('table'); localStorage.setItem('mterp_tasks_view_mode', 'table'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'table' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Tampilan Tabel Fiori"
            >
              <List size={14} />
              <span className="hidden sm:inline">Tabel</span>
            </button>
            <button
              type="button"
              onClick={() => { setViewMode('cards'); localStorage.setItem('mterp_tasks_view_mode', 'cards'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'cards' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Tampilan Kartu"
            >
              <LayoutGrid size={14} />
              <span className="hidden sm:inline">Kartu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-12 gap-4 text-text-muted">
          <div className="w-8 h-8 rounded-full border-[3px] border-border border-t-primary animate-spin"></div>
          <span>{t('tasks.loading')}</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <EmptyState
          icon={AlertCircle}
          title={t('tasks.errorLoading')}
          description={error}
        />
      )}

      {/* Empty State */}
      {!loading && !error && filteredTasks.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={searchQuery || statusFilter !== 'all' ? 'Tidak Ada Tugas yang Cocok' : t('tasks.empty.title')}
          description={
            searchQuery || statusFilter !== 'all'
              ? 'Silakan sesuaikan kata kunci pencarian atau filter status untuk menemukan data.'
              : canManageTasks ? t('tasks.empty.descManager') : t('tasks.empty.descWorker')
          }
        />
      )}

      {/* Table Mode (SAP Fiori List Report) */}
      {!loading && !error && filteredTasks.length > 0 && viewMode === 'table' && (
        <Card className="overflow-hidden border border-border-light shadow-sm">
          <div className="overflow-x-auto">
            <table
              {...gridProps}
              aria-label="Tabel Tugas Terpadu Kantor dan Proyek"
              className="w-full border-collapse text-left"
            >
              <thead role="rowgroup" className="bg-bg-secondary border-b border-border text-xs font-bold uppercase tracking-wider text-text-muted">
                <tr role="row">
                  <th role="columnheader" aria-colindex={1} className="py-2.5 px-3 w-12 text-center">#</th>
                  <th role="columnheader" aria-colindex={2} className="py-2.5 px-4 min-w-[180px]">Lingkup & Konteks</th>
                  <th role="columnheader" aria-colindex={3} className="py-2.5 px-4 min-w-[260px]">Tugas & Subtugas</th>
                  <th role="columnheader" aria-colindex={4} className="py-2.5 px-4 min-w-[150px]">Penugasan</th>
                  <th role="columnheader" aria-colindex={5} className="py-2.5 px-3 min-w-[100px] text-center">Prioritas</th>
                  <th role="columnheader" aria-colindex={6} className="py-2.5 px-4 min-w-[130px] font-mono tabular-nums">Tenggat Waktu</th>
                  <th role="columnheader" aria-colindex={7} className="py-2.5 px-4 min-w-[150px] text-center">Status</th>
                  <th role="columnheader" aria-colindex={8} className="py-2.5 px-4 min-w-[160px] text-right sticky right-0 bg-bg-secondary shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.06)]">
                    Aksi Cepat
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup" className="divide-y divide-border-light bg-bg-white text-text-primary text-sm">
                {filteredTasks.map((task, rowIndex) => {
                  const isCompleted = task.status === 'completed';
                  const taskScope = task.scope || 'project';
                  const subtasksTotal = task.subtasks?.length || 0;
                  const subtasksDone = task.subtasks?.filter(s => s.isCompleted).length || 0;

                  return (
                    <tr
                      key={task._id}
                      {...getRowProps(rowIndex)}
                      className={`hover:bg-slate-50/80 transition-colors ${isCompleted ? 'bg-slate-50/50' : ''}`}
                    >
                      {/* 0: # */}
                      <td
                        {...getCellProps(rowIndex, 0)}
                        className={`${densityPadding} text-center font-mono tabular-nums text-text-muted text-xs`}
                      >
                        {rowIndex + 1}
                      </td>

                      {/* 1: Scope & Context */}
                      <td
                        {...getCellProps(rowIndex, 1)}
                        className={`${densityPadding}`}
                      >
                        {taskScope === 'office' ? (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 w-fit">
                              <Building2 size={12} />
                              Kantor
                            </span>
                            <span className="text-xs font-semibold text-text-secondary truncate max-w-[160px]">
                              {task.department || 'General'}
                            </span>
                            {task.projectId && (
                              <span className="text-[11px] text-text-muted flex items-center gap-1 truncate max-w-[160px]">
                                ↳ Proyek: {task.projectId.nama}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 w-fit">
                              <Briefcase size={12} />
                              Proyek
                            </span>
                            <span className="text-xs font-semibold text-text-secondary truncate max-w-[160px]">
                              {task.projectId?.nama || 'Proyek Lapangan'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 2: Title & Subtasks */}
                      <td
                        {...getCellProps(rowIndex, 2)}
                        className={`${densityPadding}`}
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-semibold ${isCompleted ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                              {task.title}
                            </span>
                            {task.workItemId && (
                              <Badge label="WORK ITEM" variant="primary" size="small" />
                            )}
                            {subtasksTotal > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                <CheckSquare size={10} />
                                {subtasksDone}/{subtasksTotal}
                              </span>
                            )}
                          </div>
                          {task.description && (
                            <span className="text-xs text-text-muted line-clamp-1">
                              {task.description}
                            </span>
                          )}
                          {subtasksTotal > 0 && (
                            <div className="w-full max-w-[180px] bg-slate-100 rounded-full h-1.5 overflow-hidden mt-0.5">
                              <div 
                                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${Math.round((subtasksDone / subtasksTotal) * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 3: Assignee */}
                      <td
                        {...getCellProps(rowIndex, 3)}
                        className={`${densityPadding}`}
                      >
                        {task.assignedTo ? (
                          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                            <User size={13} className="text-text-muted shrink-0" />
                            <div className="flex flex-col">
                              <span className="font-medium text-text-primary">{task.assignedTo.fullName}</span>
                              <span className="text-[10px] text-text-muted capitalize">
                                {task.assignedTo.position || task.assignedTo.role}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium">
                            Belum Ditugaskan
                          </span>
                        )}
                      </td>

                      {/* 4: Priority */}
                      <td
                        {...getCellProps(rowIndex, 4)}
                        className={`${densityPadding} text-center`}
                      >
                        {getPriorityBadge(task.priority)}
                      </td>

                      {/* 5: Due Date */}
                      <td
                        {...getCellProps(rowIndex, 5)}
                        className={`${densityPadding} font-mono tabular-nums text-xs text-text-secondary`}
                      >
                        {task.dueDate ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar size={13} className="text-text-muted shrink-0" />
                            <span>{formatWIBDate(task.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                        ) : (
                          <span className="text-text-muted italic">-</span>
                        )}
                      </td>

                      {/* 6: Status Pill */}
                      <td
                        {...getCellProps(rowIndex, 6)}
                        className={`${densityPadding} text-center`}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          {getStatusBadge(task.status)}
                        </div>
                      </td>

                      {/* 7: Quick Actions (Sticky Right) */}
                      <td
                        {...getCellProps(rowIndex, 7)}
                        className={`${densityPadding} text-right sticky right-0 bg-bg-white shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.06)]`}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {task.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => handleSetStatus(task, 'in_progress')}
                              className="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer flex items-center gap-1"
                              title="Mulai Kerjakan"
                            >
                              <Clock size={12} />
                              <span>Mulai</span>
                            </button>
                          )}
                          {task.status === 'in_progress' && (
                            <button
                              type="button"
                              onClick={() => handleSetStatus(task, 'completed')}
                              className="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer flex items-center gap-1"
                              title="Tandai Selesai"
                            >
                              <Check size={12} />
                              <span>Selesai</span>
                            </button>
                          )}
                          {task.status === 'completed' && (
                            <button
                              type="button"
                              onClick={() => handleSetStatus(task, 'pending')}
                              className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1"
                              title="Buka Kembali"
                            >
                              <RotateCcw size={12} />
                              <span>Buka</span>
                            </button>
                          )}
                          {canManageTasks && (
                            <button
                              type="button"
                              onClick={() => handleOpenAssign(task)}
                              className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Delegasikan / Ubah Penugasan"
                            >
                              <User size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 bg-bg-secondary/40 border-t border-border-light flex items-center justify-between text-xs text-text-muted">
            <span>Total {filteredTasks.length} tugas ditemukan</span>
            <span className="hidden sm:inline">Navigasi sel dengan tombol Panah (<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd>), <kbd>Enter</kbd> untuk toggle</span>
          </div>
        </Card>
      )}

      {/* Cards Mode (Kanban Style) */}
      {!loading && !error && filteredTasks.length > 0 && viewMode === 'cards' && (
        <div className="flex flex-col gap-3">
          {filteredTasks.map((task) => {
            const taskScope = task.scope || 'project';
            const subtasksTotal = task.subtasks?.length || 0;
            const subtasksDone = task.subtasks?.filter(s => s.isCompleted).length || 0;

            return (
              <Card 
                key={task._id} 
                className={`flex items-start gap-4 p-4 cursor-default transition-all duration-150 hover:translate-x-1 max-sm:flex-col max-sm:gap-3 ${task.status === 'completed' ? 'opacity-75 bg-slate-50/50' : ''}`}
              >
                <div className="flex items-center pt-[2px] max-sm:self-start">
                  <button 
                    className="p-2 border-none bg-transparent cursor-pointer rounded-full flex items-center justify-center transition-colors duration-150 hover:bg-bg-secondary" 
                    onClick={() => handleStatusToggle(task)}
                    title="Ganti status berikutnya"
                  >
                    {getStatusIcon(task.status)}
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {taskScope === 'office' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <Building2 size={12} />
                        Kantor: {task.department || 'General'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Briefcase size={12} />
                        Proyek: {task.projectId?.nama || 'Proyek Lapangan'}
                      </span>
                    )}

                    <h3 className={`text-base font-semibold m-0 ${task.status === 'completed' ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                      {task.title}
                    </h3>
                    {task.workItemId && (
                      <Badge label="WORK ITEM" variant="primary" size="small" />
                    )}
                    {getPriorityBadge(task.priority)}
                    {getStatusBadge(task.status)}
                  </div>

                  {task.description && (
                    <p className="text-sm text-text-secondary m-0 mb-3">{task.description}</p>
                  )}

                  {/* Subtask checklist if present */}
                  {subtasksTotal > 0 && (
                    <div className="mb-3 p-3 bg-bg-secondary/40 rounded-lg border border-border-light space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-text-secondary">
                        <span className="flex items-center gap-1">
                          <CheckSquare size={13} className="text-primary" />
                          Subtugas ({subtasksDone}/{subtasksTotal})
                        </span>
                        <span className="font-mono">{Math.round((subtasksDone / subtasksTotal) * 100)}%</span>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        {task.subtasks!.map((st, idx) => (
                          <label key={idx} className="flex items-center gap-2 text-xs text-text-primary cursor-pointer hover:text-primary">
                            <input
                              type="checkbox"
                              checked={st.isCompleted}
                              onChange={() => handleToggleSubtask(task, idx)}
                              className="rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                            />
                            <span className={st.isCompleted ? 'line-through text-text-muted' : ''}>{st.title}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-4 flex-wrap max-sm:gap-2 text-xs text-text-muted">
                    {task.projectId && taskScope === 'office' && (
                      <span className="flex items-center gap-1">
                        <FolderKanban size={13} />
                        Mendukung: {task.projectId.nama}
                      </span>
                    )}
                    {task.assignedTo && (
                      <span className="flex items-center gap-1">
                        <User size={13} />
                        {task.assignedTo.fullName} ({task.assignedTo.position || task.assignedTo.role})
                      </span>
                    )}
                    {task.dueDate && (
                      <span className="flex items-center gap-1 font-mono tabular-nums">
                        <Calendar size={13} />
                        {formatWIBDate(task.dueDate, { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 max-sm:self-end max-sm:mt-2">
                  {task.status !== 'completed' && (
                    <Button
                      title={task.status === 'pending' ? t('tasks.actions.start') : t('tasks.actions.done')}
                      icon={task.status === 'pending' ? Circle : Check}
                      onClick={() => handleStatusToggle(task)}
                      variant={task.status === 'pending' ? 'warning' : 'success'}
                      size="small"
                    />
                  )}
                  {task.status === 'completed' && (
                    <Button
                      title="Buka Kembali"
                      icon={RotateCcw}
                      onClick={() => handleSetStatus(task, 'pending')}
                      variant="outline"
                      size="small"
                    />
                  )}
                  {canManageTasks && (
                    <Button
                      title={t('tasks.actions.assign')}
                      icon={User}
                      onClick={() => handleOpenAssign(task)}
                      variant="outline"
                      size="small"
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal with WCAG 2.2 AA Focus Trap */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-150" 
          onClick={() => setShowModal(false)}
        >
          <div 
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-tasks-title"
            className="bg-bg-white rounded-xl w-full max-w-[540px] max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-150" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b border-border-light">
              <h2 id="modal-tasks-title" className="m-0 text-xl font-bold text-text-primary">
                {modalMode === 'create' ? 'Buat Tugas Baru' : 'Delegasikan / Atur Penugasan'}
              </h2>
              <button 
                className="p-2 border-none bg-transparent cursor-pointer text-text-muted rounded-md flex items-center justify-center hover:bg-bg-secondary hover:text-text-primary transition-colors" 
                onClick={() => setShowModal(false)}
                aria-label="Tutup dialog"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 flex flex-col gap-4">
              {modalMode === 'create' && (
                <>
                  {/* Scope Selector: Office vs Project */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-text-primary uppercase tracking-wide">Lingkup Tugas</label>
                    <div className="grid grid-cols-2 gap-2 border border-border-medium rounded-lg p-1 bg-bg-secondary/40">
                      <button 
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, scope: 'office' }))}
                        className={`py-2 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          formData.scope === 'office' ? 'bg-indigo-600 text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <Building2 size={14} />
                        Tugas Kantor (Office)
                      </button>
                      <button 
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, scope: 'project' }))}
                        className={`py-2 px-3 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          formData.scope === 'project' ? 'bg-emerald-600 text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <Briefcase size={14} />
                        Tugas Proyek (Field)
                      </button>
                    </div>
                  </div>

                  {/* Context Fields based on Scope */}
                  {formData.scope === 'office' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-text-primary">Departemen Kantor</label>
                        <div className="relative">
                          <select
                            value={formData.department}
                            onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                            className="w-full py-2.5 px-3 pr-10 border border-border-medium rounded-lg text-sm text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          >
                            {OFFICE_DEPARTMENTS.map(dept => (
                              <option key={dept} value={dept}>{dept}</option>
                            ))}
                          </select>
                          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-text-primary">Proyek Pendukung (Opsional)</label>
                        <div className="relative">
                          <select
                            value={formData.projectId}
                            onChange={(e) => setFormData(prev => ({ ...prev, projectId: e.target.value }))}
                            className="w-full py-2.5 px-3 pr-10 border border-border-medium rounded-lg text-sm text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          >
                            <option value="">Tidak Terkait Proyek (Internal)</option>
                            {projects.map(p => (
                              <option key={p._id} value={p._id}>{p.nama}</option>
                            ))}
                          </select>
                          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex border border-border-medium rounded-md overflow-hidden mb-1">
                        <button 
                          className={`flex-1 py-2 px-4 border-none cursor-pointer text-xs font-bold transition-colors ${taskMode === 'custom' ? 'bg-primary text-white' : 'bg-bg-secondary text-text-muted hover:bg-bg-tertiary'}`}
                          type="button"
                          onClick={() => toggleTaskMode('custom')}
                        >
                          Custom Task
                        </button>
                        <button 
                          className={`flex-1 py-2 px-4 border-none cursor-pointer text-xs font-bold transition-colors ${taskMode === 'workitem' ? 'bg-primary text-white' : 'bg-bg-secondary text-text-muted hover:bg-bg-tertiary'}`}
                          type="button"
                          onClick={() => toggleTaskMode('workitem')}
                        >
                          From Work Item (WBS)
                        </button>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-text-primary">Proyek Lapangan *</label>
                        <div className="relative">
                          <select
                            value={formData.projectId}
                            onChange={(e) => handleProjectChange(e.target.value)}
                            className="w-full py-2.5 px-3 pr-10 border border-border-medium rounded-lg text-sm text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                          >
                            <option value="">Pilih Proyek Lapangan</option>
                            {projects.map(p => (
                              <option key={p._id} value={p._id}>{p.nama}</option>
                            ))}
                          </select>
                          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                        </div>
                      </div>

                      {taskMode === 'workitem' && (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-text-primary">Pilih Sub-pekerjaan Proyek</label>
                          <div className="relative">
                            <select
                              value={formData.workItemId}
                              onChange={(e) => handleWorkItemChange(e.target.value)}
                              disabled={!formData.projectId || loadingWorkItems}
                              className="w-full py-2.5 px-3 pr-10 border border-border-medium rounded-lg text-sm text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
                            >
                              <option value="">{loadingWorkItems ? 'Memuat items...' : 'Pilih Work Item'}</option>
                              {projectWorkItems.map(wi => (
                                <option key={wi._id} value={wi._id}>{wi.name}</option>
                              ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <Input
                    label="Judul Tugas *"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Contoh: Rekonsiliasi Rekening Koran atau Pasang Bekisting Grid A"
                    disabled={taskMode === 'workitem'}
                  />
                  
                  <Input
                    label="Deskripsi / Catatan Petunjuk"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Tuliskan spesifikasi, instruksi, atau kriteria penyelesaian..."
                    multiline
                  />

                  {/* Subtask Checklist Creator */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-text-primary">Checklist Subtugas (Opsional)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtaskToForm(); } }}
                        placeholder="Ketik rincian langkah lalu klik Tambah..."
                        className="flex-1 py-2 px-3 border border-border-medium rounded-lg text-xs text-text-primary bg-bg-white focus:outline-none focus:border-primary"
                      />
                      <Button
                        title="Tambah"
                        icon={Plus}
                        onClick={handleAddSubtaskToForm}
                        variant="secondary"
                        size="small"
                      />
                    </div>
                    {formData.subtasks.length > 0 && (
                      <div className="flex flex-col gap-1.5 p-2 bg-bg-secondary/40 rounded-lg border border-border-light max-h-[140px] overflow-y-auto">
                        {formData.subtasks.map((st, i) => (
                          <div key={i} className="flex items-center justify-between text-xs py-1 px-2 bg-white rounded border border-border-light">
                            <span className="flex items-center gap-1.5 truncate">
                              <span className="text-text-muted font-mono">{i + 1}.</span>
                              {st.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSubtaskFromForm(i)}
                              className="text-rose-500 hover:text-rose-700 cursor-pointer p-0.5"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-text-primary">Tingkat Prioritas</label>
                      <div className="relative">
                        <select
                          value={formData.priority}
                          onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                          className="w-full py-2.5 px-3 pr-10 border border-border-medium rounded-lg text-sm text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        >
                          <option value="low">Rendah (Low)</option>
                          <option value="normal">Biasa (Normal)</option>
                          <option value="high">Tinggi (High)</option>
                          <option value="urgent">Mendesak (Urgent)</option>
                        </select>
                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-text-primary">Tenggat Waktu (Target)</label>
                      <input
                        type="date"
                        value={formData.dueDate}
                        onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                        className="w-full py-2.5 px-3 border border-border-medium rounded-lg text-sm text-text-primary bg-bg-white cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-primary">
                  {modalMode === 'create' ? 'Personil yang Ditugaskan (Opsional)' : 'Delegasikan Kepada'}
                </label>
                <div className="relative">
                  <select
                    value={formData.assignedTo}
                    onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                    className="w-full py-2.5 px-3 pr-10 border border-border-medium rounded-lg text-sm text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  >
                    <option value="">{t('tasks.modal.unassigned')}</option>
                    {users.map(u => (
                      <option key={u._id} value={u._id}>
                        {u.fullName} ({u.position || u.role})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 p-5 border-t border-border-light bg-bg-secondary/30">
              <Button
                title={t('tasks.actions.cancel')}
                onClick={() => setShowModal(false)}
                variant="outline"
              />
              <Button
                title={modalMode === 'create' ? 'Simpan Tugas' : 'Simpan Delegasi'}
                onClick={handleSubmit}
                loading={submitting}
                variant="primary"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
