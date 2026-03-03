import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ChevronRight, Briefcase } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, ProgressBar, Button, Input, EmptyState, LoadingOverlay } from '../components/shared';
import { ProjectData } from '../types';
import './Projects.css';

export default function Projects() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || 'worker';

  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
  const [progressInput, setProgressInput] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await api.get('/projects');
      setProjects(response.data);
    } catch (err) {
      console.error('Failed to fetch projects', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('projects.actions.deleteConfirm'))) return;
    try {
      await api.delete(`/projects/${id}`);
      setProjects((prev) => prev.filter((p) => p._id !== id));
    } catch (err) {
      console.error('Failed to delete project', err);
    }
  };

  const handleUpdateProgress = async () => {
    if (!selectedProject) return;
    setUpdating(true);
    try {
      await api.put(`/projects/${selectedProject._id}/progress`, {
        progress: Number(progressInput),
      });
      fetchProjects();
      setModalOpen(false);
      setProgressInput('');
      setSelectedProject(null);
    } catch (err) {
      console.error('Failed to update progress', err);
    } finally {
      setUpdating(false);
    }
  };

  const openUpdateModal = (project: ProjectData) => {
    setSelectedProject(project);
    setProgressInput(String(project.progress || 0));
    setModalOpen(true);
  };

  const getStatusBadge = (progress: number) => {
    if (progress >= 100) return <Badge label={t('projects.status.completed')} variant="success" />;
    if (progress > 0) return <Badge label={t('projects.status.inProgress')} variant="primary" />;
    return <Badge label={t('projects.status.pending')} variant="neutral" />;
  };

  return (
    <div className="projects-container">
      <LoadingOverlay visible={loading} />

      {/* Header */}
      <div className="projects-header">
        <h1 className="projects-title">{t('projects.title')}</h1>
        {userRole === 'owner' && (
          <Button
            title={t('projects.add')}
            onClick={() => navigate('/add-project')}
            variant="primary"
            size="small"
            icon={Plus}
          />
        )}
      </div>

      {/* Summary Card for Director/Owner */}
      {['director', 'owner'].includes(userRole) && projects.length > 0 && (
        <Card className="projects-summary">
          <div className="summary-row">
            <span className="summary-label">{t('projects.summary.totalProjects')}</span>
            <span className="summary-value">{projects.length}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">{t('projects.summary.avgProgress')}</span>
            <span className="summary-value">
              {Math.round(projects.reduce((a, p) => a + (p.progress || 0), 0) / projects.length)}%
            </span>
          </div>
        </Card>
      )}

      {/* Project List */}
      {projects.length === 0 && !loading ? (
        <EmptyState
          icon={Briefcase}
          title={t('projects.empty.title')}
          description={t('projects.empty.desc')}
        />
      ) : (
        <div className="projects-list">
          {projects.map((project) => (
            <Card key={project._id} className="project-card" onClick={() => navigate(`/project/${project._id}`)}>
              <div className="project-header">
                <div>
                  <h3 className="project-name">{project.nama || project.name}</h3>
                  <p className="project-location">{project.lokasi || project.location}</p>
                </div>
                <div className="project-actions">
                  {getStatusBadge(project.progress || 0)}
                </div>
              </div>

              <ProgressBar
                progress={project.progress || 0}
                showLabel={false}
                style={{ marginTop: 12 }}
              />
              <span className="project-progress-label">{project.progress || 0}% {t('projects.status.complete')}</span>

              <div className="project-footer">
                {userRole === 'owner' && (
                  <Button
                    title=""
                    icon={Trash2}
                    onClick={(e: any) => {
                      e.stopPropagation();
                      handleDelete(project._id!);
                    }}
                    variant="danger"
                    size="small"
                  />
                )}
                <ChevronRight size={20} color="var(--text-muted)" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Update Progress Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{t('projects.actions.updateProgress')}</h3>
            <p>{selectedProject?.nama || selectedProject?.name}</p>
            <Input
              type="number"
              placeholder={t('projects.form.progressPlaceholder')}
              value={progressInput}
              onChangeText={setProgressInput}
            />
            <div className="modal-actions">
              <Button
                title={t('projects.actions.cancel')}
                onClick={() => setModalOpen(false)}
                variant="outline"
              />
              <Button
                title={t('projects.actions.save')}
                onClick={handleUpdateProgress}
                loading={updating}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
