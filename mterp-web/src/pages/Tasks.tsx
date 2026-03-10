import { useState, useEffect } from 'react';
import { 
  ClipboardList, Circle, Check, Plus, User, Calendar, 
  FolderKanban, AlertCircle, X, ChevronDown 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, Button, EmptyState, Input } from '../components/shared';

interface TaskData {
  _id: string;
  title: string;
  description?: string;
  projectId: { _id: string; nama: string; lokasi: string } | null;
  assignedTo: { _id: string; fullName: string; role: string } | null;
  assignedBy: { fullName: string } | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueDate?: string;
}

interface ProjectOption {
  _id: string;
  nama: string;
}

interface UserOption {
  _id: string;
  fullName: string;
  role: string;
}

export default function Tasks() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'assign'>('create');
  const [selectedTask, setSelectedTask] = useState<TaskData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    projectId: '',
    assignedTo: '',
    priority: 'normal',
    dueDate: '',
  });

  const canManageTasks = user?.role && ['owner', 'director', 'supervisor', 'asset_admin'].includes(user.role);

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

  const handleStatusToggle = async (task: TaskData) => {
    const statusFlow: Record<string, 'pending' | 'in_progress' | 'completed'> = {
      pending: 'in_progress',
      in_progress: 'completed',
      completed: 'pending',
    };
    
    try {
      const newStatus = statusFlow[task.status] || 'pending';
      await api.put(`/tasks/${task._id}/status`, { status: newStatus });
      setTasks(prev => 
        prev.map(t => t._id === task._id ? { ...t, status: newStatus } : t)
      );
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const handleOpenCreate = () => {
    setFormData({
      title: '',
      description: '',
      projectId: projects[0]?._id || '',
      assignedTo: '',
      priority: 'normal',
      dueDate: '',
    });
    setModalMode('create');
    setSelectedTask(null);
    setShowModal(true);
  };

  const handleOpenAssign = (task: TaskData) => {
    setFormData({
      ...formData,
      assignedTo: task.assignedTo?._id || '',
    });
    setModalMode('assign');
    setSelectedTask(task);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (modalMode === 'create' && (!formData.title || !formData.projectId)) {
      return;
    }

    setSubmitting(true);
    try {
      if (modalMode === 'create') {
        const response = await api.post('/tasks', formData);
        setTasks(prev => [response.data, ...prev]);
      } else if (modalMode === 'assign' && selectedTask) {
        const response = await api.put(`/tasks/${selectedTask._id}/assign`, {
          assignedTo: formData.assignedTo || null,
        });
        setTasks(prev => 
          prev.map(t => t._id === selectedTask._id ? response.data : t)
        );
      }
      setShowModal(false);
    } catch (err: any) {
      console.error('Submit error:', err);
      alert(err.response?.data?.msg || t('tasks.messages.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <Check size={20} color="var(--success)" />;
      case 'in_progress':
        return <Circle size={20} color="var(--warning)" fill="var(--warning)" />;
      default:
        return <Circle size={20} color="var(--text-muted)" />;
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

  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    pending: tasks.filter(t => t.status === 'pending').length,
  };

  return (
    <div className="p-6 max-w-[1000px] mx-auto max-lg:p-4 max-sm:p-3">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 max-sm:flex-col max-sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0 max-sm:text-xl">{t('tasks.title')}</h1>
          <p className="text-sm text-text-muted mt-1 mb-0">{t('tasks.subtitle')}</p>
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

      {/* Stats */}
      <Card className="mb-6">
        <div className="flex justify-around gap-4 max-sm:flex-col max-sm:gap-4">
          <div className="flex flex-col items-center gap-1 p-3">
            <span className="text-2xl font-bold text-text-primary">{stats.pending}</span>
            <span className="text-sm text-text-muted">{t('tasks.stats.pending')}</span>
          </div>
          <div className="flex flex-col items-center gap-1 p-3">
            <span className="text-2xl font-bold" style={{ color: 'var(--warning)' }}>
              {stats.inProgress}
            </span>
            <span className="text-sm text-text-muted">{t('tasks.stats.inProgress')}</span>
          </div>
          <div className="flex flex-col items-center gap-1 p-3">
            <span className="text-2xl font-bold" style={{ color: 'var(--success)' }}>
              {stats.completed}
            </span>
            <span className="text-sm text-text-muted">{t('tasks.stats.completed')}</span>
          </div>
        </div>
      </Card>

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
      {!loading && !error && tasks.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={t('tasks.empty.title')}
          description={canManageTasks ? t('tasks.empty.descManager') : t('tasks.empty.descWorker')}
        />
      )}

      {/* Task List */}
      {!loading && !error && tasks.length > 0 && (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <Card 
              key={task._id} 
              className={`flex items-start gap-4 p-4 cursor-default transition-all duration-150 hover:translate-x-1 max-sm:flex-col max-sm:gap-3 ${task.status === 'completed' ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center pt-[2px] max-sm:self-start">
                <button 
                  className="p-2 border-none bg-transparent cursor-pointer rounded-full flex items-center justify-center transition-colors duration-150 hover:bg-bg-secondary" 
                  onClick={() => handleStatusToggle(task)}
                  title="Toggle status"
                >
                  {getStatusIcon(task.status)}
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className={`text-base font-semibold m-0 ${task.status === 'completed' ? 'line-through text-text-muted' : 'text-text-primary'}`}>{task.title}</h3>
                  {getPriorityBadge(task.priority)}
                </div>
                {task.description && (
                  <p className="text-sm text-text-secondary m-0 mb-2">{task.description}</p>
                )}
                <div className="flex items-center gap-4 flex-wrap max-sm:gap-2">
                  {task.projectId && (
                    <span className="flex items-center gap-1 text-sm text-text-muted">
                      <FolderKanban size={14} />
                      {task.projectId.nama}
                    </span>
                  )}
                  {task.assignedTo && (
                    <span className="flex items-center gap-1 text-sm text-text-muted">
                      <User size={14} />
                      {task.assignedTo.fullName}
                    </span>
                  )}
                  {task.dueDate && (
                    <span className="flex items-center gap-1 text-sm text-text-muted">
                      <Calendar size={14} />
                      {new Date(task.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 max-sm:self-end max-sm:mt-2">
                {/* Status buttons for workers and everyone */}
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
                  <Badge label={t('tasks.status.completed')} variant="success" />
                )}
                {/* Assign button for managers */}
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
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4" onClick={() => setShowModal(false)}>
          <div className="bg-bg-white rounded-lg w-full max-w-[500px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-border-light">
              <h2 className="m-0 text-xl font-bold text-text-primary">{modalMode === 'create' ? t('tasks.modal.createTitle') : t('tasks.modal.assignTitle')}</h2>
              <button className="p-2 border-none bg-transparent cursor-pointer text-text-muted rounded-md flex items-center justify-center hover:bg-bg-secondary hover:text-text-primary" onClick={() => setShowModal(false)}>
                <X size={24} />
              </button>
            </div>
            
            <div className="p-5 flex flex-col gap-4">
              {modalMode === 'create' && (
                <>
                  <Input
                    label={t('tasks.modal.taskTitle')}
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder={t('tasks.modal.taskTitlePlaceholder')}
                  />
                  
                  <Input
                    label={t('tasks.modal.description')}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('tasks.modal.descriptionPlaceholder')}
                    multiline
                  />
                  
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-text-primary">{t('tasks.modal.project')}</label>
                    <div className="relative">
                      <select
                        value={formData.projectId}
                        onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                        className="w-full py-3 px-4 pr-10 border border-border-medium rounded-md text-base text-text-primary bg-bg-white appearance-none cursor-pointer transition-colors duration-150 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/10"
                      >
                        <option value="">{t('tasks.modal.selectProject')}</option>
                        {projects.map(p => (
                          <option key={p._id} value={p._id}>{p.nama}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-text-primary">{t('tasks.modal.priority')}</label>
                    <div className="relative">
                      <select
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                        className="w-full py-3 px-4 pr-10 border border-border-medium rounded-md text-base text-text-primary bg-bg-white appearance-none cursor-pointer transition-colors duration-150 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/10"
                      >
                        <option value="low">{t('tasks.modal.priorityOptions.low')}</option>
                        <option value="normal">{t('tasks.modal.priorityOptions.normal')}</option>
                        <option value="high">{t('tasks.modal.priorityOptions.high')}</option>
                        <option value="urgent">{t('tasks.modal.priorityOptions.urgent')}</option>
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-text-primary">{t('tasks.modal.dueDate')}</label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      className="w-full py-3 px-4 border border-border-medium rounded-md text-base text-text-primary bg-bg-white cursor-pointer transition-colors duration-150 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/10"
                    />
                  </div>
                </>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-text-primary">
                  {modalMode === 'create' ? t('tasks.modal.assignToOptional') : t('tasks.modal.assignTo')}
                </label>
                <div className="relative">
                  <select
                    value={formData.assignedTo}
                    onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                    className="w-full py-3 px-4 pr-10 border border-border-medium rounded-md text-base text-text-primary bg-bg-white appearance-none cursor-pointer transition-colors duration-150 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/10"
                  >
                    <option value="">{t('tasks.modal.unassigned')}</option>
                    {users.map(u => (
                      <option key={u._id} value={u._id}>
                        {u.fullName} ({u.role})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 p-5 border-t border-border-light">
              <Button
                title={t('tasks.actions.cancel')}
                onClick={() => setShowModal(false)}
                variant="outline"
              />
              <Button
                title={modalMode === 'create' ? t('tasks.actions.createTask') : t('tasks.actions.saveAssignment')}
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
