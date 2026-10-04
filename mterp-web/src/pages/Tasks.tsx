import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  ClipboardList, Circle, Check, Plus, User, Calendar, 
  FolderKanban, AlertCircle, X, ChevronDown, ChevronUp, List, LayoutGrid,
  Search, RotateCcw, Clock, CheckCircle2,
  Building2, Briefcase, Trash2, CheckSquare, Layers,
  Camera, Eye, ZoomIn, AlertTriangle, Bell, BellRing,
  Download, ArrowUpDown, ArrowUp, ArrowDown, Filter, Sparkles
} from 'lucide-react';
import { PhotoView } from 'react-photo-view';
import { useTranslation } from 'react-i18next';
import api, { sendTaskReminder } from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, Button, EmptyState, Input, AriaLiveRegion } from '../components/shared';
import { formatDate as formatWIBDate } from '../utils/date';
import { getImageUrl } from '../utils/image';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useDataGridKeyboard } from '../hooks/useDataGridKeyboard';
import { 
  TaskCompletionModal, 
  TaskData, 
  Subtask, 
  CompletionEvidence 
} from '../components/tasks/TaskCompletionModal';

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
type ScopeFilter = 'all' | 'my' | 'office' | 'project';
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

  // Filters, Sorting & Search
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [projectFilter, setProjectFilter] = useState<string>(urlProjectId);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'overdue' | 'near_deadline'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'dueDate' | 'priority' | 'title' | 'status' | 'createdAt'>('dueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isRefreshing, setIsRefreshing] = useState(false);

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
  const [completingTask, setCompletingTask] = useState<TaskData | null>(null);
  const [expandedSubtaskTaskId, setExpandedSubtaskTaskId] = useState<string | null>(null);
  const [remindingTaskId, setRemindingTaskId] = useState<string | null>(null);
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

  const fetchTasks = async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) setIsRefreshing(true);
    try {
      setError(null);
      const response = await api.get('/tasks');
      setTasks(response.data);
      if (showRefreshSpinner) {
        setAnnouncement('Data tugas berhasil disegarkan dari server.');
      }
    } catch (err: any) {
      console.error('Failed to fetch tasks', err);
      setError(err.response?.data?.msg || t('tasks.messages.loadFailed'));
    } finally {
      setLoading(false);
      if (showRefreshSpinner) setIsRefreshing(false);
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
    if (newStatus === 'completed' && !task.completionEvidence?.photoUrl) {
      setCompletingTask(task);
      return;
    }
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
    } catch (err: any) {
      console.error('Failed to update status', err);
      alert(err.response?.data?.msg || 'Gagal mengubah status tugas');
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
      if (!task.completionEvidence?.photoUrl) {
        // Save subtasks progress up to 99% and open completion modal for mandatory evidence
        try {
          const res = await api.put(`/tasks/${task._id}`, {
            subtasks: updatedSubtasks,
            progress: 99,
            status: 'in_progress',
          });
          setTasks(prev => prev.map(t => t._id === task._id ? res.data : t));
          setCompletingTask({ ...res.data, subtasks: updatedSubtasks });
        } catch (err: any) {
          console.error('Failed to update subtask progress', err);
        }
        return;
      }
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
    } catch (err: any) {
      console.error('Failed to toggle subtask', err);
      alert(err.response?.data?.msg || 'Gagal memperbarui subtugas');
    }
  };

  const handleCompletionSuccess = (updatedTask: TaskData) => {
    setTasks(prev => prev.map(t => t._id === updatedTask._id ? updatedTask : t));
    setAnnouncement(`Tugas "${updatedTask.title}" berhasil diselesaikan dengan bukti foto.`);
  };

  const handleSendReminder = async (task: TaskData) => {
    if (!task.assignedTo?._id) {
      alert('Tugas belum memiliki personil yang ditugaskan.');
      return;
    }
    setRemindingTaskId(task._id);
    try {
      await sendTaskReminder(task._id);
      setAnnouncement(`Pengingat push notification berhasil dikirim ke ${task.assignedTo.fullName}`);
      alert(`Pengingat Web Push berhasil dikirim ke ${task.assignedTo.fullName}`);
    } catch (err: any) {
      console.error('Failed to send reminder', err);
      alert(err.response?.data?.msg || 'Gagal mengirimkan pengingat');
    } finally {
      setRemindingTaskId(null);
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

  // Sort handler
  const handleSort = (field: 'dueDate' | 'priority' | 'title' | 'status' | 'createdAt') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filter tasks across scope, department, project, status, priority, urgency, assignee, and search
  const filteredTasks = tasks.filter(task => {
    const taskScope = task.scope || 'project';
    if (scopeFilter === 'my') {
      if (task.assignedTo?._id !== user?._id) return false;
    } else if (scopeFilter !== 'all' && taskScope !== scopeFilter) {
      return false;
    }
    if (scopeFilter === 'office' && departmentFilter !== 'all' && task.department !== departmentFilter) return false;
    if (scopeFilter === 'all' && departmentFilter !== 'all' && task.scope === 'office' && task.department !== departmentFilter) return false;
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    if (projectFilter && task.projectId?._id !== projectFilter) return false;
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;

    // Urgency filter
    if (urgencyFilter !== 'all') {
      if (task.status === 'completed' || !task.dueDate) return false;
      const diffHours = (new Date(task.dueDate).getTime() - Date.now()) / (1000 * 60 * 60);
      if (urgencyFilter === 'overdue' && diffHours >= 0) return false;
      if (urgencyFilter === 'near_deadline' && (diffHours < 0 || diffHours > 48)) return false;
    }

    // Assignee filter
    if (assigneeFilter === 'my') {
      if (task.assignedTo?._id !== user?._id) return false;
    } else if (assigneeFilter === 'unassigned') {
      if (task.assignedTo) return false;
    } else if (assigneeFilter !== 'all') {
      if (task.assignedTo?._id !== assigneeFilter) return false;
    }

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

  const priorityWeight: Record<string, number> = {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  };

  const statusWeight: Record<string, number> = {
    in_progress: 3,
    pending: 2,
    completed: 1,
  };

  // Sort filtered tasks
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    let comp = 0;
    if (sortField === 'dueDate') {
      const timeA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const timeB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      comp = timeA - timeB;
    } else if (sortField === 'priority') {
      comp = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
    } else if (sortField === 'title') {
      comp = (a.title || '').localeCompare(b.title || '');
    } else if (sortField === 'status') {
      comp = (statusWeight[b.status] || 0) - (statusWeight[a.status] || 0);
    } else if (sortField === 'createdAt') {
      const timeA = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : 0;
      const timeB = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : 0;
      comp = timeA - timeB;
    }
    return sortOrder === 'asc' ? comp : -comp;
  });

  // DataGrid keyboard navigation (Columns: 0: #, 1: Context, 2: Title, 3: Assignee, 4: Priority, 5: Due Date, 6: Status, 7: Actions)
  const { gridProps, getRowProps, getCellProps } = useDataGridKeyboard(
    sortedTasks.length,
    8,
    {
      gridId: 'tasks-grid',
      onActivate: (row: number, col: number) => {
        const task = sortedTasks[row];
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
    switch (priority) {
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
            Urgent
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Tinggi
          </span>
        );
      case 'normal':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            Biasa
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Rendah
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs">
            <CheckCircle2 size={13} className="text-emerald-600" />
            Selesai
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
            <Clock size={13} className="text-amber-600" />
            Sedang Dikerjakan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <Circle size={13} className="text-slate-400" />
            Tertunda
          </span>
        );
    }
  };

  const densityPadding = {
    compact: 'py-2 px-3 text-xs',
    normal: 'py-3 px-4 text-sm',
    comfortable: 'py-4 px-4 text-sm',
  }[tableDensity];

  const stats = {
    total: tasks.length,
    my: tasks.filter(t => t.assignedTo?._id === user?._id).length,
    office: tasks.filter(t => (t.scope || 'project') === 'office').length,
    project: tasks.filter(t => (t.scope || 'project') === 'project').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    pending: tasks.filter(t => t.status === 'pending').length,
    overdue: tasks.filter(t => {
      if (t.status === 'completed' || !t.dueDate) return false;
      return new Date(t.dueDate).getTime() < Date.now();
    }).length,
    nearDeadline: tasks.filter(t => {
      if (t.status === 'completed' || !t.dueDate) return false;
      const diffHours = (new Date(t.dueDate).getTime() - Date.now()) / (1000 * 60 * 60);
      return diffHours > 0 && diffHours <= 48;
    }).length,
  };

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const hasActiveFilters = 
    searchQuery.trim() !== '' ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    projectFilter !== '' ||
    departmentFilter !== 'all' ||
    urgencyFilter !== 'all' ||
    assigneeFilter !== 'all' ||
    scopeFilter !== 'all';

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setProjectFilter('');
    setDepartmentFilter('all');
    setUrgencyFilter('all');
    setAssigneeFilter('all');
    setScopeFilter('all');
    setSearchParams({});
    setAnnouncement('Semua filter berhasil direset ke tampilan default.');
  };

  const handleExportCSV = () => {
    if (sortedTasks.length === 0) {
      alert('Tidak ada data tugas yang dapat diekspor.');
      return;
    }

    const headers = [
      'No',
      'Lingkup',
      'Departemen / Proyek',
      'Judul Tugas',
      'Deskripsi',
      'Pelaksana (Assignee)',
      'Jabatan/Role',
      'Prioritas',
      'Tenggat Waktu',
      'Status',
      'Total Subtugas',
      'Subtugas Selesai',
      'Bukti Selesai Terverifikasi',
      'Catatan Bukti'
    ];

    const rows = sortedTasks.map((t, idx) => [
      idx + 1,
      t.scope === 'office' ? 'Kantor' : 'Proyek',
      t.scope === 'office' ? (t.department || 'General') : (t.projectId?.nama || '-'),
      `"${(t.title || '').replace(/"/g, '""')}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      `"${t.assignedTo?.fullName || 'Belum Ditugaskan'}"`,
      `"${t.assignedTo?.position || t.assignedTo?.role || '-'}"`,
      t.priority.toUpperCase(),
      t.dueDate ? formatWIBDate(t.dueDate, { day: 'numeric', month: 'short', year: 'numeric' }) : '-',
      t.status === 'completed' ? 'Selesai' : t.status === 'in_progress' ? 'Dalam Pengerjaan' : 'Tertunda',
      t.subtasks?.length || 0,
      t.subtasks?.filter(s => s.isCompleted).length || 0,
      t.completionEvidence?.photoUrl ? 'Ya' : 'Tidak',
      `"${(t.completionEvidence?.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `MTERP_Tasks_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setAnnouncement('Data tugas berhasil diekspor ke file CSV.');
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

      {/* Enterprise Page Header */}
      <div className="flex justify-between items-start mb-6 gap-4 flex-wrap max-sm:flex-col max-sm:gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shadow-xs">
            <ClipboardList size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-text-primary m-0 tracking-tight max-sm:text-xl">
                {t('tasks.title')}
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700 border border-slate-300 tracking-wider">
                <Sparkles size={11} className="text-primary" />
                ERP Workbench
              </span>
            </div>
            <p className="text-sm text-text-muted mt-0.5 mb-0">
              Pusat kendali penugasan divisi kantor, kepatuhan SOP, dan pengendalian mutu proyek lapangan
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap max-sm:w-full max-sm:justify-between">
          <Button
            title="Segarkan"
            icon={RotateCcw}
            onClick={() => fetchTasks(true)}
            loading={isRefreshing}
            variant="outline"
            size="medium"
          />
          <Button
            title="Ekspor CSV"
            icon={Download}
            onClick={handleExportCSV}
            variant="secondary"
            size="medium"
          />
          {canManageTasks && (
            <Button 
              title={t('tasks.actions.addTask')}
              icon={Plus} 
              onClick={handleOpenCreate}
              variant="primary"
              size="medium"
            />
          )}
        </div>
      </div>

      {/* Enterprise KPI Metrics Ribbon (5 Interactive Tiles) */}
      <div className="grid grid-cols-5 gap-3.5 mb-6 max-xl:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
        {/* 1: Total */}
        <div 
          onClick={() => { setScopeFilter('all'); setStatusFilter('all'); setUrgencyFilter('all'); }}
          className={`bg-bg-white border rounded-xl p-3.5 flex justify-between items-center shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
            scopeFilter === 'all' && statusFilter === 'all' && urgencyFilter === 'all'
              ? 'border-primary ring-2 ring-primary/20 bg-primary/[0.02]' 
              : 'border-border-light hover:border-border-medium'
          }`}
          title="Tampilkan semua tugas"
        >
          <div className="flex flex-col min-w-0">
            <span className="text-2xl font-black text-text-primary leading-none font-mono tabular-nums tracking-tight">
              {stats.total}
            </span>
            <span className="text-xs font-bold text-text-secondary mt-1 truncate">Total Tugas</span>
            <span className="text-[10px] text-text-muted mt-0.5 truncate">{stats.office} Kantor • {stats.project} Proyek</span>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-700 shrink-0">
            <Layers size={18} />
          </div>
        </div>

        {/* 2: Tugas Saya (Focus High-Contrast) */}
        <div 
          onClick={() => { setScopeFilter('my'); setStatusFilter('all'); setUrgencyFilter('all'); }}
          className={`bg-bg-white border rounded-xl p-3.5 flex justify-between items-center shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
            scopeFilter === 'my'
              ? 'border-indigo-600 ring-2 ring-indigo-500/30 bg-indigo-50/40' 
              : 'border-indigo-200 bg-indigo-50/20 hover:border-indigo-400'
          }`}
          title="Filter hanya tugas yang ditugaskan kepada saya"
        >
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-black text-indigo-700 leading-none font-mono tabular-nums tracking-tight">
                {stats.my}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-indigo-600 text-white">
                Fokus
              </span>
            </div>
            <span className="text-xs font-bold text-indigo-950 mt-1 truncate">Tugas Saya</span>
            <span className="text-[10px] text-indigo-700/80 mt-0.5 truncate">Tanggung jawab Anda</span>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-600 text-white shadow-xs shrink-0">
            <User size={18} />
          </div>
        </div>

        {/* 3: In Progress */}
        <div 
          onClick={() => { setStatusFilter('in_progress'); setUrgencyFilter('all'); }}
          className={`bg-bg-white border rounded-xl p-3.5 flex justify-between items-center shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
            statusFilter === 'in_progress'
              ? 'border-amber-500 ring-2 ring-amber-400/25 bg-amber-50/30' 
              : 'border-border-light hover:border-border-medium'
          }`}
          title="Filter tugas sedang dikerjakan"
        >
          <div className="flex flex-col min-w-0">
            <span className="text-2xl font-black text-amber-700 leading-none font-mono tabular-nums tracking-tight">
              {stats.inProgress}
            </span>
            <span className="text-xs font-bold text-text-secondary mt-1 truncate">Sedang Berjalan</span>
            <span className="text-[10px] text-text-muted mt-0.5 truncate">{stats.pending} Tertunda</span>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-100 text-amber-700 shrink-0">
            <Clock size={18} />
          </div>
        </div>

        {/* 4: Selesai */}
        <div 
          onClick={() => { setStatusFilter('completed'); setUrgencyFilter('all'); }}
          className={`bg-bg-white border rounded-xl p-3.5 flex justify-between items-center shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
            statusFilter === 'completed'
              ? 'border-emerald-500 ring-2 ring-emerald-400/25 bg-emerald-50/30' 
              : 'border-border-light hover:border-border-medium'
          }`}
          title="Filter tugas selesai terverifikasi"
        >
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-black text-emerald-700 leading-none font-mono tabular-nums tracking-tight">
                {stats.completed}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-emerald-100 text-emerald-800">
                {completionRate}%
              </span>
            </div>
            <span className="text-xs font-bold text-text-secondary mt-1 truncate">Tuntas Terverifikasi</span>
            <span className="text-[10px] text-text-muted mt-0.5 truncate">Bukti foto tersimpan</span>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-700 shrink-0">
            <CheckCircle2 size={18} />
          </div>
        </div>

        {/* 5: Urgent / Overdue */}
        <div 
          onClick={() => { setUrgencyFilter(urgencyFilter === 'overdue' ? 'all' : 'overdue'); setStatusFilter('all'); }}
          className={`bg-bg-white border rounded-xl p-3.5 flex justify-between items-center shadow-xs cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
            urgencyFilter === 'overdue'
              ? 'border-rose-600 ring-2 ring-rose-500/30 bg-rose-50/40' 
              : (stats.overdue + stats.nearDeadline > 0 ? 'border-rose-200 bg-rose-50/15 hover:border-rose-400' : 'border-border-light')
          }`}
          title="Filter tugas terlambat atau mendekati tenggat"
        >
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-2xl font-black leading-none font-mono tabular-nums tracking-tight ${stats.overdue > 0 ? 'text-rose-700' : 'text-text-primary'}`}>
                {stats.overdue + stats.nearDeadline}
              </span>
              {stats.overdue > 0 && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-rose-600 text-white animate-pulse">
                  Kritis
                </span>
              )}
            </div>
            <span className="text-xs font-bold text-text-secondary mt-1 truncate">Tenggat Kritis</span>
            <span className="text-[10px] text-rose-700 mt-0.5 truncate">
              {stats.overdue} Lewat • {stats.nearDeadline} ≤48 Jam
            </span>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${stats.overdue > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
            <AlertTriangle size={18} />
          </div>
        </div>
      </div>

      {/* Enterprise Filter Workbench Card */}
      <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs space-y-3.5">
        {/* Row 1: Scope Segmented Switcher & Search Bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap max-lg:flex-col max-lg:items-stretch">
          {/* Segmented Scope Tabs */}
          <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 overflow-x-auto gap-1">
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                scopeFilter === 'all'
                  ? 'bg-white text-text-primary shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Layers size={13} />
              <span>Semua Lingkup</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${scopeFilter === 'all' ? 'bg-primary/10 text-primary font-bold' : 'bg-slate-200 text-slate-700'}`}>
                {stats.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setScopeFilter('my')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                scopeFilter === 'my'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-indigo-900 hover:bg-indigo-50/80'
              }`}
            >
              <User size={13} />
              <span>Tugas Saya</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${scopeFilter === 'my' ? 'bg-white/25 text-white' : 'bg-indigo-100 text-indigo-800'}`}>
                {stats.my}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setScopeFilter('office')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                scopeFilter === 'office'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Building2 size={13} />
              <span>Kantor & SOP</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${scopeFilter === 'office' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {stats.office}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setScopeFilter('project')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                scopeFilter === 'project'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Briefcase size={13} />
              <span>Proyek Lapangan</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${scopeFilter === 'project' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                {stats.project}
              </span>
            </button>
          </div>

          {/* Quick Search with Clear */}
          <div className="relative min-w-[280px] max-lg:w-full flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari tugas, deskripsi, pelaksana, kode proyek..."
              className="w-full pl-9 pr-8 py-2 text-xs font-medium text-text-primary bg-slate-50 border border-border-medium rounded-lg focus:outline-none focus:border-primary focus:bg-white transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5 rounded cursor-pointer"
                title="Hapus pencarian"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Multi-Facet ERP Filter Toolbar */}
        <div className="flex items-center gap-2 pt-2 border-t border-border-light flex-wrap">
          <div className="flex items-center gap-1 text-xs font-bold text-text-muted uppercase tracking-wider pr-1">
            <Filter size={13} className="text-primary" />
            <span>Filter:</span>
          </div>

          {/* Status Facet */}
          <div className="relative min-w-[140px]">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full py-1.5 px-2.5 pr-7 border border-border-medium rounded-lg text-xs font-semibold text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
              title="Filter Status Eksekusi"
            >
              <option value="all">Semua Status</option>
              <option value="pending">Tertunda (Pending)</option>
              <option value="in_progress">Dalam Pengerjaan</option>
              <option value="completed">Selesai (Completed)</option>
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>

          {/* Priority Facet */}
          <div className="relative min-w-[130px]">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
              className="w-full py-1.5 px-2.5 pr-7 border border-border-medium rounded-lg text-xs font-semibold text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
              title="Filter Prioritas"
            >
              <option value="all">Semua Prioritas</option>
              <option value="urgent">🔴 Urgent</option>
              <option value="high">🟠 Tinggi</option>
              <option value="normal">🔵 Biasa</option>
              <option value="low">⚪ Rendah</option>
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>

          {/* Department Facet (Visible when office or all) */}
          {(scopeFilter === 'office' || scopeFilter === 'all') && (
            <div className="relative min-w-[150px]">
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full py-1.5 px-2.5 pr-7 border border-border-medium rounded-lg text-xs font-semibold text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
                title="Filter Departemen Kantor"
              >
                <option value="all">Semua Departemen</option>
                {OFFICE_DEPARTMENTS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          )}

          {/* Project Facet (Visible when project or all) */}
          {(scopeFilter === 'project' || scopeFilter === 'all') && projects.length > 0 && (
            <div className="relative min-w-[160px] max-w-[200px]">
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="w-full py-1.5 px-2.5 pr-7 border border-border-medium rounded-lg text-xs font-semibold text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary truncate shadow-2xs"
                title="Filter Proyek Lapangan"
              >
                <option value="">Semua Proyek Lapangan</option>
                {projects.map(p => (
                  <option key={p._id} value={p._id}>{p.nama}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          )}

          {/* Urgency Facet */}
          <div className="relative min-w-[140px]">
            <select
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value as any)}
              className={`w-full py-1.5 px-2.5 pr-7 border rounded-lg text-xs font-semibold appearance-none cursor-pointer focus:outline-none focus:border-primary shadow-2xs ${
                urgencyFilter !== 'all' ? 'border-rose-400 bg-rose-50 text-rose-800' : 'border-border-medium bg-bg-white text-text-primary'
              }`}
              title="Filter Urgensi Tenggat"
            >
              <option value="all">Semua Tenggat</option>
              <option value="overdue">⚠️ Lewat Tenggat Saja</option>
              <option value="near_deadline">⏳ Mendekati Tenggat (≤48 Jam)</option>
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>

          {/* Assignee Facet */}
          <div className="relative min-w-[150px]">
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="w-full py-1.5 px-2.5 pr-7 border border-border-medium rounded-lg text-xs font-semibold text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
              title="Filter Personil Pelaksana"
            >
              <option value="all">Semua Pelaksana</option>
              <option value="my">👤 Ditugaskan ke Saya</option>
              <option value="unassigned">⚠️ Belum Ada Pelaksana</option>
              {users.map(u => (
                <option key={u._id} value={u._id}>{u.fullName}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>

          {/* Reset Filters Action */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
              title="Reset semua filter ke default"
            >
              <X size={12} />
              <span>Reset Filter</span>
            </button>
          )}
        </div>

        {/* Row 3: Active Filters Removable Chips */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 pt-2 border-t border-dashed border-border-light flex-wrap text-xs">
            <span className="text-[11px] font-bold text-text-muted uppercase">Aktif:</span>
            {scopeFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px] font-semibold border border-slate-300">
                Lingkup: {scopeFilter === 'my' ? 'Tugas Saya' : scopeFilter === 'office' ? 'Kantor' : 'Proyek'}
                <X size={11} className="cursor-pointer hover:text-rose-600" onClick={() => setScopeFilter('all')} />
              </span>
            )}
            {statusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-300">
                Status: {statusFilter === 'pending' ? 'Tertunda' : statusFilter === 'in_progress' ? 'Pengerjaan' : 'Selesai'}
                <X size={11} className="cursor-pointer hover:text-rose-600" onClick={() => setStatusFilter('all')} />
              </span>
            )}
            {priorityFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 text-[11px] font-semibold border border-sky-300">
                Prioritas: {priorityFilter.toUpperCase()}
                <X size={11} className="cursor-pointer hover:text-rose-600" onClick={() => setPriorityFilter('all')} />
              </span>
            )}
            {projectFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-semibold border border-emerald-300">
                Proyek: {projects.find(p => p._id === projectFilter)?.nama || projectFilter}
                <X size={11} className="cursor-pointer hover:text-rose-600" onClick={() => { setProjectFilter(''); setSearchParams({}); }} />
              </span>
            )}
            {departmentFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 text-[11px] font-semibold border border-indigo-300">
                Departemen: {departmentFilter}
                <X size={11} className="cursor-pointer hover:text-rose-600" onClick={() => setDepartmentFilter('all')} />
              </span>
            )}
            {urgencyFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 text-[11px] font-semibold border border-rose-300">
                Urgensi: {urgencyFilter === 'overdue' ? 'Lewat Tenggat' : '≤48 Jam'}
                <X size={11} className="cursor-pointer hover:text-rose-600" onClick={() => setUrgencyFilter('all')} />
              </span>
            )}
            {assigneeFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 text-[11px] font-semibold border border-purple-300">
                Pelaksana: {assigneeFilter === 'my' ? 'Saya' : assigneeFilter === 'unassigned' ? 'Belum Ada' : users.find(u => u._id === assigneeFilter)?.fullName || 'Spesifik'}
                <X size={11} className="cursor-pointer hover:text-rose-600" onClick={() => setAssigneeFilter('all')} />
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px] font-semibold border border-slate-300">
                Cari: "{searchQuery}"
                <X size={11} className="cursor-pointer hover:text-rose-600" onClick={() => setSearchQuery('')} />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Table Controls & Summary Ribbon */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="font-black text-text-primary font-mono text-sm tabular-nums">{sortedTasks.length}</span>
          <span className="font-medium text-text-muted">tugas ditampilkan</span>
          {sortedTasks.length < tasks.length && (
            <span className="text-[11px] text-text-muted">(dari total {tasks.length} tugas)</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Sort selector */}
          <div className="flex items-center gap-1.5 bg-bg-white border border-border-light rounded-lg px-2.5 py-1.5 shadow-2xs">
            <span className="text-[11px] font-semibold text-text-muted">Urutkan:</span>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as any)}
              className="text-xs font-bold text-text-primary bg-transparent border-none focus:outline-none cursor-pointer"
            >
              <option value="dueDate">Tenggat Target</option>
              <option value="priority">Prioritas</option>
              <option value="title">Judul Tugas</option>
              <option value="status">Status</option>
              <option value="createdAt">Tanggal Dibuat</option>
            </select>
            <button
              type="button"
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="p-0.5 text-text-muted hover:text-primary transition-colors cursor-pointer"
              title={sortOrder === 'asc' ? 'Urutan: Naik (Ascending)' : 'Urutan: Turun (Descending)'}
            >
              {sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
            </button>
          </div>

          {/* Density Switcher (visible in table mode) */}
          {viewMode === 'table' && (
            <div className="flex items-center bg-bg-white border border-border-light rounded-lg p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => { setTableDensity('compact'); localStorage.setItem('mterp_tasks_density', 'compact'); }}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  tableDensity === 'compact' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Kepadatan Rapat (Compact ERP)"
              >
                Rapat
              </button>
              <button
                type="button"
                onClick={() => { setTableDensity('normal'); localStorage.setItem('mterp_tasks_density', 'normal'); }}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  tableDensity === 'normal' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Kepadatan Standar"
              >
                Standar
              </button>
              <button
                type="button"
                onClick={() => { setTableDensity('comfortable'); localStorage.setItem('mterp_tasks_density', 'comfortable'); }}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  tableDensity === 'comfortable' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Kepadatan Lapang"
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
              title="Tampilan Tabel ERP Fiori"
            >
              <List size={14} />
              <span className="hidden sm:inline">Tabel ERP</span>
            </button>
            <button
              type="button"
              onClick={() => { setViewMode('cards'); localStorage.setItem('mterp_tasks_view_mode', 'cards'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'cards' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Tampilan Kartu / Kanban"
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
      {!loading && !error && sortedTasks.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={hasActiveFilters ? 'Tidak Ada Tugas yang Cocok dengan Filter' : t('tasks.empty.title')}
          description={
            hasActiveFilters
              ? 'Silakan sesuaikan kriteria pencarian, status, atau klik tombol "Reset Filter" di atas.'
              : canManageTasks ? t('tasks.empty.descManager') : t('tasks.empty.descWorker')
          }
        />
      )}

      {/* Table Mode (SAP Fiori Enterprise List Report) */}
      {!loading && !error && sortedTasks.length > 0 && viewMode === 'table' && (
        <Card className="overflow-hidden border border-border-light shadow-sm">
          <div className="overflow-x-auto">
            <table
              {...gridProps}
              aria-label="Tabel Tugas Terpadu Kantor dan Proyek"
              className="w-full border-collapse text-left"
            >
              <thead role="rowgroup" className="bg-slate-100/90 border-b border-border text-xs font-bold uppercase tracking-wider text-text-secondary select-none">
                <tr role="row">
                  <th role="columnheader" aria-colindex={1} className="py-3 px-3 w-12 text-center text-text-muted font-mono">#</th>
                  <th 
                    role="columnheader" 
                    aria-colindex={2} 
                    onClick={() => handleSort('title')}
                    className="py-3 px-4 min-w-[180px] cursor-pointer hover:bg-slate-200/60 transition-colors"
                    title="Klik untuk mengurutkan"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Lingkup & Konteks</span>
                    </div>
                  </th>
                  <th 
                    role="columnheader" 
                    aria-colindex={3} 
                    onClick={() => handleSort('title')}
                    className="py-3 px-4 min-w-[280px] cursor-pointer hover:bg-slate-200/60 transition-colors"
                    title="Klik untuk mengurutkan berdasarkan judul"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Tugas, WBS & Subtugas</span>
                      {sortField === 'title' ? (
                        sortOrder === 'asc' ? <ArrowUp size={13} className="text-primary" /> : <ArrowDown size={13} className="text-primary" />
                      ) : (
                        <ArrowUpDown size={12} className="text-text-muted opacity-40 hover:opacity-100" />
                      )}
                    </div>
                  </th>
                  <th role="columnheader" aria-colindex={4} className="py-3 px-4 min-w-[170px]">
                    <span>Pelaksana (Assignee)</span>
                  </th>
                  <th 
                    role="columnheader" 
                    aria-colindex={5} 
                    onClick={() => handleSort('priority')}
                    className="py-3 px-3 min-w-[110px] text-center cursor-pointer hover:bg-slate-200/60 transition-colors"
                    title="Klik untuk mengurutkan prioritas"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Prioritas</span>
                      {sortField === 'priority' ? (
                        sortOrder === 'asc' ? <ArrowUp size={13} className="text-primary" /> : <ArrowDown size={13} className="text-primary" />
                      ) : (
                        <ArrowUpDown size={12} className="text-text-muted opacity-40 hover:opacity-100" />
                      )}
                    </div>
                  </th>
                  <th 
                    role="columnheader" 
                    aria-colindex={6} 
                    onClick={() => handleSort('dueDate')}
                    className="py-3 px-4 min-w-[140px] cursor-pointer hover:bg-slate-200/60 transition-colors"
                    title="Klik untuk mengurutkan tenggat"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Tenggat Target</span>
                      {sortField === 'dueDate' ? (
                        sortOrder === 'asc' ? <ArrowUp size={13} className="text-primary" /> : <ArrowDown size={13} className="text-primary" />
                      ) : (
                        <ArrowUpDown size={12} className="text-text-muted opacity-40 hover:opacity-100" />
                      )}
                    </div>
                  </th>
                  <th 
                    role="columnheader" 
                    aria-colindex={7} 
                    onClick={() => handleSort('status')}
                    className="py-3 px-4 min-w-[150px] text-center cursor-pointer hover:bg-slate-200/60 transition-colors"
                    title="Klik untuk mengurutkan status"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Status Eksekusi</span>
                      {sortField === 'status' ? (
                        sortOrder === 'asc' ? <ArrowUp size={13} className="text-primary" /> : <ArrowDown size={13} className="text-primary" />
                      ) : (
                        <ArrowUpDown size={12} className="text-text-muted opacity-40 hover:opacity-100" />
                      )}
                    </div>
                  </th>
                  <th role="columnheader" aria-colindex={8} className="py-3 px-4 min-w-[170px] text-right sticky right-0 bg-slate-100 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.06)] z-10">
                    <span>Aksi Cepat</span>
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup" className="divide-y divide-border-light bg-bg-white text-text-primary text-sm">
                {sortedTasks.map((task, rowIndex) => {
                  const isCompleted = task.status === 'completed';
                  const isMyTask = task.assignedTo?._id === user?._id;
                  const taskScope = task.scope || 'project';
                  const subtasksTotal = task.subtasks?.length || 0;
                  const subtasksDone = task.subtasks?.filter(s => s.isCompleted).length || 0;
                  const isSubtasksExpanded = expandedSubtaskTaskId === task._id;

                  return (
                    <tr
                      key={task._id}
                      {...getRowProps(rowIndex)}
                      className={`hover:bg-slate-50/90 transition-all ${
                        isMyTask 
                          ? 'border-l-[6px] border-l-primary bg-primary/[0.035]' 
                          : 'border-l-[6px] border-l-transparent'
                      } ${isCompleted ? 'bg-slate-50/40 opacity-80' : ''}`}
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
                            <span className="text-xs font-bold text-text-primary truncate max-w-[160px]">
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
                            <span className="text-xs font-bold text-text-primary truncate max-w-[160px]">
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
                            {isMyTask && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-primary text-white shadow-2xs tracking-wide">
                                <User size={10} />
                                Tugas Anda
                              </span>
                            )}
                            <span className={`font-semibold ${isCompleted ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                              {task.title}
                            </span>
                            {task.workItemId && (
                              <Badge label="WBS" variant="primary" size="small" />
                            )}
                            {subtasksTotal > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedSubtaskTaskId(isSubtasksExpanded ? null : task._id);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-colors cursor-pointer"
                                title="Klik untuk membuka checklist dan mencentang subtugas"
                              >
                                <CheckSquare size={11} className="text-primary" />
                                <span>Subtugas {subtasksDone}/{subtasksTotal}</span>
                                <ChevronDown size={11} className={`transition-transform duration-200 ${isSubtasksExpanded ? 'rotate-180 text-primary' : 'text-slate-500'}`} />
                              </button>
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

                          {/* Expandable interactive subtask checklist drawer */}
                          {isSubtasksExpanded && task.subtasks && (
                            <div 
                              className="mt-2 p-3 bg-bg-secondary/70 rounded-xl border border-border-light space-y-2 animate-in slide-in-from-top-1 duration-150 max-w-md shadow-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="text-[11px] font-bold text-text-secondary flex items-center justify-between pb-1.5 border-b border-border-light">
                                <span className="flex items-center gap-1.5 text-text-primary">
                                  <CheckSquare size={13} className="text-primary" />
                                  Checklist Subtugas ({subtasksDone}/{subtasksTotal} Selesai)
                                </span>
                                <span className="font-mono text-xs px-2 py-0.2 rounded bg-primary/10 text-primary font-bold">
                                  {Math.round((subtasksDone / subtasksTotal) * 100)}%
                                </span>
                              </div>
                              <div className="space-y-1.5 pt-1 max-h-[160px] overflow-y-auto pr-1">
                                {task.subtasks.map((st, sIdx) => (
                                  <label 
                                    key={sIdx} 
                                    className="flex items-center gap-2.5 text-xs text-text-primary p-1.5 rounded-lg hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-border-light"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={st.isCompleted}
                                      onChange={() => handleToggleSubtask(task, sIdx)}
                                      className="w-4 h-4 rounded border-border-medium text-primary focus:ring-primary/20 cursor-pointer transition-transform active:scale-90"
                                    />
                                    <span className={st.isCompleted ? 'line-through text-text-muted font-normal' : 'font-medium'}>
                                      {st.title}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                          {isCompleted && task.completionEvidence?.photoUrl && (
                            <div className="flex items-center gap-2 mt-1.5 p-1.5 bg-emerald-50/80 border border-emerald-200/90 rounded-lg max-w-fit">
                              <PhotoView src={getImageUrl(task.completionEvidence.photoUrl)}>
                                <div className="relative w-8 h-8 rounded-md overflow-hidden border border-emerald-300 cursor-pointer shrink-0 group">
                                  <img 
                                    src={getImageUrl(task.completionEvidence.photoUrl)} 
                                    alt="Bukti Selesai" 
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                  />
                                  <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Eye size={12} className="text-white" />
                                  </div>
                                </div>
                              </PhotoView>
                              <div className="flex flex-col text-[11px] leading-tight pr-1">
                                <span className="font-bold text-emerald-800 flex items-center gap-1">
                                  <CheckCircle2 size={11} className="text-emerald-600" />
                                  Bukti Terverifikasi
                                </span>
                                <span className="text-text-muted truncate max-w-[200px]">
                                  Oleh: {task.completionEvidence.submittedBy?.fullName || 'Personil'}
                                </span>
                                {task.completionEvidence.notes && (
                                  <span className="text-text-secondary italic text-[10px] truncate max-w-[200px]">
                                    "{task.completionEvidence.notes}"
                                  </span>
                                )}
                              </div>
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
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                              isMyTask ? 'bg-primary text-white shadow-2xs' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {task.assignedTo.fullName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className={`font-semibold text-xs truncate max-w-[130px] ${isMyTask ? 'text-primary font-bold' : 'text-text-primary'}`}>
                                {task.assignedTo.fullName}
                              </span>
                              <span className="text-[10px] text-text-muted capitalize truncate max-w-[130px]">
                                {task.assignedTo.position || task.assignedTo.role}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            <AlertCircle size={11} className="text-amber-600" />
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
                        className={`${densityPadding} font-mono tabular-nums text-xs`}
                      >
                        {task.dueDate ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-text-secondary font-medium">
                              <Calendar size={13} className="text-text-muted shrink-0" />
                              <span>{formatWIBDate(task.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            </div>
                            {!isCompleted && (() => {
                              const diffHours = (new Date(task.dueDate).getTime() - Date.now()) / (1000 * 60 * 60);
                              if (diffHours < 0) {
                                const daysOverdue = Math.abs(Math.floor(diffHours / 24));
                                return (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse w-fit">
                                    <AlertTriangle size={10} />
                                    Terlambat {daysOverdue > 0 ? `${daysOverdue}h` : ''}
                                  </span>
                                );
                              } else if (diffHours <= 24) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 w-fit">
                                    <Clock size={10} />
                                    Hari Ini
                                  </span>
                                );
                              } else if (diffHours <= 48) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 w-fit">
                                    <Clock size={10} />
                                    2 Hari Lagi
                                  </span>
                                );
                              }
                              return null;
                            })()}
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
                        <div className="inline-flex items-center justify-center">
                          {getStatusBadge(task.status)}
                        </div>
                      </td>

                      {/* 7: Quick Actions (Sticky Right) */}
                      <td
                        {...getCellProps(rowIndex, 7)}
                        className={`${densityPadding} text-right sticky right-0 bg-bg-white shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.06)] z-10`}
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
                              className="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="Tandai Selesai (Wajib Unggah Bukti)"
                            >
                              <Check size={12} />
                              <span>Selesai</span>
                            </button>
                          )}
                          {task.status === 'completed' && (
                            <>
                              {task.completionEvidence?.photoUrl && (
                                <PhotoView src={getImageUrl(task.completionEvidence.photoUrl)}>
                                  <button
                                    type="button"
                                    className="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer flex items-center gap-1"
                                    title="Lihat Foto Bukti Penyelesaian"
                                  >
                                    <Camera size={12} />
                                    <span>Bukti</span>
                                  </button>
                                </PhotoView>
                              )}
                              <button
                                type="button"
                                onClick={() => handleSetStatus(task, 'pending')}
                                className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1"
                                title="Buka Kembali"
                              >
                                <RotateCcw size={12} />
                                <span>Buka</span>
                              </button>
                            </>
                          )}
                          {canManageTasks && task.status !== 'completed' && task.assignedTo && (
                            <button
                              type="button"
                              onClick={() => handleSendReminder(task)}
                              disabled={remindingTaskId === task._id}
                              className="p-1.5 rounded-md text-amber-600 hover:text-amber-800 hover:bg-amber-50 transition-colors cursor-pointer border border-transparent hover:border-amber-200"
                              title={`Kirim Pengingat Web Push ke ${task.assignedTo.fullName}`}
                            >
                              <Bell size={14} className={remindingTaskId === task._id ? 'animate-spin' : ''} />
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

          <div className="px-4 py-3 bg-slate-50 border-t border-border-light flex items-center justify-between text-xs text-text-muted flex-wrap gap-2">
            <span className="font-medium">Total {sortedTasks.length} tugas ditemukan</span>
            <span className="hidden sm:inline text-text-secondary">
              Navigasi keyboard: Gunakan tombol Panah (<kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px]">↑</kbd> <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px]">↓</kbd> <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px]">←</kbd> <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px]">→</kbd>), <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px]">Enter</kbd> untuk eksekusi aksi
            </span>
          </div>
        </Card>
      )}

      {/* Cards Mode (Kanban Style) */}
      {!loading && !error && sortedTasks.length > 0 && viewMode === 'cards' && (
        <div className="flex flex-col gap-3">
          {sortedTasks.map((task) => {
            const isCompleted = task.status === 'completed';
            const isMyTask = task.assignedTo?._id === user?._id;
            const taskScope = task.scope || 'project';
            const subtasksTotal = task.subtasks?.length || 0;
            const subtasksDone = task.subtasks?.filter(s => s.isCompleted).length || 0;

            return (
              <Card 
                key={task._id} 
                className={`flex items-start gap-4 p-4.5 cursor-default transition-all duration-200 hover:shadow-md max-sm:flex-col max-sm:gap-3 rounded-xl border ${
                  isMyTask 
                    ? 'border-l-[6px] border-l-primary ring-2 ring-primary/25 bg-gradient-to-r from-primary/[0.04] to-bg-white shadow-sm' 
                    : 'border-l-[6px] border-l-transparent border-border-light'
                } ${isCompleted ? 'opacity-80 bg-slate-50/50' : 'bg-bg-white'}`}
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
                    {isMyTask && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-primary text-white shadow-2xs tracking-wide">
                        <User size={11} />
                        Tugas Anda
                      </span>
                    )}

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
                      <Badge label="WBS" variant="primary" size="small" />
                    )}
                    {getPriorityBadge(task.priority)}
                    {getStatusBadge(task.status)}

                    {!isCompleted && task.dueDate && (() => {
                      const diffHours = (new Date(task.dueDate).getTime() - Date.now()) / (1000 * 60 * 60);
                      if (diffHours < 0) {
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                            <AlertTriangle size={11} />
                            Terlambat
                          </span>
                        );
                      } else if (diffHours <= 24) {
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                            <Clock size={11} />
                            Tenggat Hari Ini
                          </span>
                        );
                      } else if (diffHours <= 48) {
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock size={11} />
                            2 Hari Lagi
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {task.description && (
                    <p className="text-sm text-text-secondary m-0 mb-3">{task.description}</p>
                  )}

                  {/* Subtask checklist if present */}
                  {subtasksTotal > 0 && (
                    <div className="mb-3 p-3 bg-bg-secondary/60 rounded-xl border border-border-light space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-text-secondary">
                        <span className="flex items-center gap-1.5 text-text-primary">
                          <CheckSquare size={14} className="text-primary" />
                          <span className="font-bold">Checklist Subtugas</span>
                          <span className="text-text-muted">({subtasksDone}/{subtasksTotal} Selesai)</span>
                        </span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                          {Math.round((subtasksDone / subtasksTotal) * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((subtasksDone / subtasksTotal) * 100)}%` }}
                        />
                      </div>
                      <div className="space-y-1.5 pt-1">
                        {task.subtasks!.map((st, idx) => (
                          <label 
                            key={idx} 
                            className="flex items-center gap-2.5 text-xs text-text-primary p-1.5 rounded-lg hover:bg-white cursor-pointer transition-all border border-transparent hover:border-border-light"
                          >
                            <input
                              type="checkbox"
                              checked={st.isCompleted}
                              onChange={() => handleToggleSubtask(task, idx)}
                              className="w-4 h-4 rounded border-border-medium text-primary focus:ring-primary/20 cursor-pointer transition-transform active:scale-90"
                            />
                            <span className={st.isCompleted ? 'line-through text-text-muted font-normal' : 'font-medium'}>
                              {st.title}
                            </span>
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
                      <span className="flex items-center gap-1 font-medium text-text-secondary">
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

                  {task.status === 'completed' && task.completionEvidence?.photoUrl && (
                    <div className="mt-3 p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl flex items-center gap-3">
                      <PhotoView src={getImageUrl(task.completionEvidence.photoUrl)}>
                        <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-emerald-300 cursor-pointer shrink-0 shadow-2xs group">
                          <img 
                            src={getImageUrl(task.completionEvidence.photoUrl)} 
                            alt="Bukti Penyelesaian" 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <ZoomIn size={14} className="text-white" />
                          </div>
                        </div>
                      </PhotoView>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                          <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                          <span>Bukti Penyelesaian Terverifikasi</span>
                        </div>
                        {task.completionEvidence.notes && (
                          <p className="text-xs text-text-secondary mt-0.5 mb-1 italic line-clamp-2">
                            "{task.completionEvidence.notes}"
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-[11px] text-text-muted mt-0.5 flex-wrap">
                          <span>Oleh: <strong className="text-text-primary">{task.completionEvidence.submittedBy?.fullName || 'Personil'}</strong></span>
                          {task.completionEvidence.submittedAt && (
                            <span>• {formatWIBDate(task.completionEvidence.submittedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} WIB</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
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
                    <>
                      {task.completionEvidence?.photoUrl && (
                        <PhotoView src={getImageUrl(task.completionEvidence.photoUrl)}>
                          <Button
                            title="Lihat Foto"
                            icon={Camera}
                            variant="secondary"
                            size="small"
                          />
                        </PhotoView>
                      )}
                      <Button
                        title="Buka Kembali"
                        icon={RotateCcw}
                        onClick={() => handleSetStatus(task, 'pending')}
                        variant="outline"
                        size="small"
                      />
                    </>
                  )}
                  {canManageTasks && task.status !== 'completed' && task.assignedTo && (
                    <button
                      type="button"
                      onClick={() => handleSendReminder(task)}
                      disabled={remindingTaskId === task._id}
                      className="p-1.5 rounded-md text-amber-600 hover:text-amber-800 hover:bg-amber-50 transition-colors cursor-pointer border border-transparent hover:border-amber-200"
                      title={`Kirim Pengingat Web Push ke ${task.assignedTo.fullName}`}
                    >
                      <Bell size={16} className={remindingTaskId === task._id ? 'animate-spin' : ''} />
                    </button>
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

      {/* Task Completion Evidence Modal */}
      <TaskCompletionModal
        task={completingTask}
        isOpen={!!completingTask}
        onClose={() => setCompletingTask(null)}
        onSuccess={handleCompletionSuccess}
      />
    </div>
  );
}
