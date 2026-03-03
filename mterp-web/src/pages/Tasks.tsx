import { useState, useEffect } from 'react';
import { 
  ClipboardList, Circle, Check, Plus, User, Calendar, 
  FolderKanban, AlertCircle, X, ChevronDown 
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, Button, EmptyState, Input } from '../components/shared';
import './Tasks.css';

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
    <div className="tasks-container">
      {/* Header */}
      <div className="tasks-header">
        <div>
          <h1 className="tasks-title">{t('tasks.title')}</h1>
          <p className="tasks-subtitle">{t('tasks.subtitle')}</p>
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
      <Card className="tasks-stats">
        <div className="stat-row">
          <div className="stat-box">
            <span className="stat-value">{stats.pending}</span>
            <span className="stat-label">{t('tasks.stats.pending')}</span>
          </div>
          <div className="stat-box">
            <span className="stat-value" style={{ color: 'var(--warning)' }}>
              {stats.inProgress}
            </span>
            <span className="stat-label">{t('tasks.stats.inProgress')}</span>
          </div>
          <div className="stat-box">
            <span className="stat-value" style={{ color: 'var(--success)' }}>
              {stats.completed}
            </span>
            <span className="stat-label">{t('tasks.stats.completed')}</span>
          </div>
        </div>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="tasks-loading">
          <div className="spinner"></div>
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
        <div className="tasks-list">
          {tasks.map((task) => (
            <Card 
              key={task._id} 
              className={`task-card ${task.status === 'completed' ? 'task-done' : ''}`}
            >
              <div className="task-left">
                <button 
                  className="task-toggle" 
                  onClick={() => handleStatusToggle(task)}
                  title="Toggle status"
                >
                  {getStatusIcon(task.status)}
                </button>
              </div>
              <div className="task-content">
                <div className="task-header">
                  <h3 className="task-title">{task.title}</h3>
                  {getPriorityBadge(task.priority)}
                </div>
                {task.description && (
                  <p className="task-description">{task.description}</p>
                )}
                <div className="task-meta">
                  {task.projectId && (
                    <span className="task-meta-item">
                      <FolderKanban size={14} />
                      {task.projectId.nama}
                    </span>
                  )}
                  {task.assignedTo && (
                    <span className="task-meta-item">
                      <User size={14} />
                      {task.assignedTo.fullName}
                    </span>
                  )}
                  {task.dueDate && (
                    <span className="task-meta-item">
                      <Calendar size={14} />
                      {new Date(task.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
              <div className="task-actions">
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
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalMode === 'create' ? t('tasks.modal.createTitle') : t('tasks.modal.assignTitle')}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={24} />
              </button>
            </div>
            
            <div className="modal-body">
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
                  
                  <div className="form-group">
                    <label className="form-label">{t('tasks.modal.project')}</label>
                    <div className="select-wrapper">
                      <select
                        value={formData.projectId}
                        onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                        className="form-select"
                      >
                        <option value="">{t('tasks.modal.selectProject')}</option>
                        {projects.map(p => (
                          <option key={p._id} value={p._id}>{p.nama}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="select-icon" />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('tasks.modal.priority')}</label>
                    <div className="select-wrapper">
                      <select
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                        className="form-select"
                      >
                        <option value="low">{t('tasks.modal.priorityOptions.low')}</option>
                        <option value="normal">{t('tasks.modal.priorityOptions.normal')}</option>
                        <option value="high">{t('tasks.modal.priorityOptions.high')}</option>
                        <option value="urgent">{t('tasks.modal.priorityOptions.urgent')}</option>
                      </select>
                      <ChevronDown size={16} className="select-icon" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('tasks.modal.dueDate')}</label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      className="form-select"
                    />
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="form-label">
                  {modalMode === 'create' ? t('tasks.modal.assignToOptional') : t('tasks.modal.assignTo')}
                </label>
                <div className="select-wrapper">
                  <select
                    value={formData.assignedTo}
                    onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                    className="form-select"
                  >
                    <option value="">{t('tasks.modal.unassigned')}</option>
                    {users.map(u => (
                      <option key={u._id} value={u._id}>
                        {u.fullName} ({u.role})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="select-icon" />
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
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
