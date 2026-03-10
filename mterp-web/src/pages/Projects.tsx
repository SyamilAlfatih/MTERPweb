import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ChevronRight, Briefcase } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, ProgressBar, Button, Input, EmptyState, LoadingOverlay } from '../components/shared';
import { ProjectData } from '../types';

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
    <div className="p-6 max-w-[900px] max-lg:p-4 max-sm:p-3">
      <LoadingOverlay visible={loading} />

      {/* Header */}
      <div className="flex justify-between items-center mb-6 max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <h1 className="text-2xl font-bold text-text-primary m-0 max-sm:text-xl">{t('projects.title')}</h1>
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
        <Card className="bg-gradient-to-br from-primary to-primary-light text-white mb-6">
          <div className="flex justify-between items-center py-2 max-sm:flex-col max-sm:gap-2">
            <span className="text-sm opacity-80">{t('projects.summary.totalProjects')}</span>
            <span className="text-xl font-bold">{projects.length}</span>
          </div>
          <div className="flex justify-between items-center py-2 max-sm:flex-col max-sm:gap-2">
            <span className="text-sm opacity-80">{t('projects.summary.avgProgress')}</span>
            <span className="text-xl font-bold">
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
        <div className="flex flex-col gap-4">
          {projects.map((project) => (
            <Card key={project._id} className="cursor-pointer" onClick={() => navigate(`/project/${project._id}`)}>
              <div className="flex justify-between items-start max-sm:flex-col max-sm:gap-2">
                <div>
                  <h3 className="text-base font-bold text-text-primary m-0">{project.nama || project.name}</h3>
                  <p className="text-sm text-text-muted mt-0.5 mb-0 mx-0">{project.lokasi || project.location}</p>
                </div>
                <div className="flex gap-2">
                  {getStatusBadge(project.progress || 0)}
                </div>
              </div>

              <ProgressBar
                progress={project.progress || 0}
                showLabel={false}
                style={{ marginTop: 12 }}
              />
              <span className="text-sm text-text-muted font-medium">{project.progress || 0}% {t('projects.status.complete')}</span>

              <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-border-light max-sm:flex-wrap">
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
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setModalOpen(false)}>
          <div className="bg-bg-white p-6 rounded-xl w-full max-w-md shadow-xl text-text-primary animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-primary m-0 mb-1">{t('projects.actions.updateProgress')}</h3>
            <p className="text-sm text-text-muted m-0 mb-4">{selectedProject?.nama || selectedProject?.name}</p>
            <Input
              type="number"
              placeholder={t('projects.form.progressPlaceholder')}
              value={progressInput}
              onChangeText={setProgressInput}
            />
            <div className="flex gap-3 mt-4 justify-end max-sm:flex-col [&_button]:max-sm:w-full">
              <div className="max-sm:w-full">
                <Button
                  title={t('projects.actions.cancel')}
                  onClick={() => setModalOpen(false)}
                  variant="outline"
                />
              </div>
              <div className="max-sm:w-full">
                <Button
                  title={t('projects.actions.save')}
                  onClick={handleUpdateProgress}
                  loading={updating}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
