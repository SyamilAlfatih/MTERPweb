import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ChevronRight, Briefcase, Copy, Check, ChevronLeft, AlertCircle, Users, FileText, Package, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, ProgressBar, Button, Input, EmptyState, LoadingOverlay, Alert } from '../components/shared';
import { ProjectData } from '../types';

export default function Projects() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || 'worker';
  const isOwnerOrDirector = ['owner', 'director'].includes(userRole);

  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Progress Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);
  const [progressInput, setProgressInput] = useState('');
  const [updating, setUpdating] = useState(false);

  // Wizard State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [duplicateName, setDuplicateName] = useState('');
  const [cloneOptions, setCloneOptions] = useState({
    includeWorkItems: true,
    includeSupplies: true,
    includeDocuments: false,
    includeAssignedUsers: false,
  });
  const [duplicating, setDuplicating] = useState(false);
  const [alertData, setAlertData] = useState({ visible: false, type: 'success' as 'success' | 'error', message: '' });

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

  const handleDuplicate = async () => {
    if (!selectedProject) return;
    setDuplicating(true);
    try {
      const response = await api.post(`/projects/${selectedProject._id}/duplicate`, {
        newName: duplicateName,
        options: cloneOptions,
      });
      setProjects([response.data, ...projects]);
      setWizardOpen(false);
      setAlertData({ visible: true, type: 'success', message: t('projects.actions.duplicateSuccess') || 'Project cloned successfully' });
    } catch (err) {
      console.error('Failed to duplicate project', err);
      setAlertData({ visible: true, type: 'error', message: t('projects.actions.duplicateError') || 'Failed to clone project' });
    } finally {
      setDuplicating(false);
    }
  };

  const openDuplicateWizard = (project: ProjectData) => {
    setSelectedProject(project);
    setDuplicateName(`Copy of ${project.nama || project.name}`);
    setWizardStep(0);
    setCloneOptions({
      includeWorkItems: true,
      includeSupplies: true,
      includeDocuments: false,
      includeAssignedUsers: false,
    });
    setWizardOpen(true);
  };

  const getStatusBadge = (progress: number) => {
    if (progress >= 100) return <Badge label={t('projects.status.completed')} variant="success" />;
    if (progress > 0) return <Badge label={t('projects.status.inProgress')} variant="primary" />;
    return <Badge label={t('projects.status.pending')} variant="neutral" />;
  };

  return (
    <div className="p-6 max-w-[900px] max-lg:p-4 max-sm:p-3">
      <LoadingOverlay visible={loading} />
      
      {alertData.visible && (
        <div className="mb-4">
          <Alert
            visible={alertData.visible}
            type={alertData.type}
            title={alertData.type === 'success' ? 'Success' : 'Error'}
            message={alertData.message}
            onClose={() => setAlertData({ ...alertData, visible: false })}
          />
        </div>
      )}

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
            <Card key={project._id} className="cursor-pointer transition-all hover:shadow-md hover:border-primary/20" onClick={() => navigate(`/project/${project._id}`)}>
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
                {isOwnerOrDirector && (
                  <Button
                    title=""
                    icon={Copy}
                    onClick={(e: any) => {
                      e.stopPropagation();
                      openDuplicateWizard(project);
                    }}
                    variant="outline"
                    size="small"
                  />
                )}
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

      {/* Duplicate Wizard Modal */}
      {wizardOpen && (
        <div className="fixed inset-0 bg-black/60 z-[101] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setWizardOpen(false)}>
          <div className="bg-bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {/* Wizard Header & Progress */}
            <div className="p-6 pb-4 border-b border-border-light bg-bg-secondary/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Copy size={22} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text-primary m-0">Duplicate Project</h3>
                  <p className="text-xs text-text-muted m-0">Clone project structure and settings</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 px-1">
                {[0, 1, 2].map(step => (
                  <div key={step} className="flex-1 flex flex-col gap-1.5">
                    <div className={`h-1.5 rounded-full transition-all duration-300 ${wizardStep >= step ? 'bg-primary' : 'bg-border'}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${wizardStep === step ? 'text-primary' : 'text-text-muted'}`}>
                      {step === 0 ? 'Name' : step === 1 ? 'Options' : 'Confirm'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Wizard Content */}
            <div className="p-8 min-h-[280px] max-h-[60vh] overflow-y-auto">
              {wizardStep === 0 && (
                <div className="animate-fade-in">
                  <h4 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                    <AlertCircle size={16} className="text-primary" />
                    Set project identity
                  </h4>
                  <p className="text-xs text-text-muted mb-6 leading-relaxed">
                    Choose a name for the new project. All basic data like location and budget will be carried over from <span className="font-semibold text-text-primary">"{selectedProject?.nama}"</span>.
                  </p>
                  <Input
                    label="Project Name"
                    placeholder="Enter new name"
                    value={duplicateName}
                    onChangeText={setDuplicateName}
                  />
                </div>
              )}

              {wizardStep === 1 && (
                <div className="animate-fade-in">
                  <h4 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                    <ListChecks size={16} className="text-primary" />
                    Select components to clone
                  </h4>
                  <div className="space-y-3">
                    {[
                      { id: 'includeWorkItems', label: 'Work Items', icon: ListChecks, desc: 'Pekerjaan list (reset to 0% progress)' },
                      { id: 'includeSupplies', label: 'Supply Plan', icon: Package, desc: 'Planning material list' },
                      { id: 'includeDocuments', label: 'Documents', icon: FileText, desc: 'Keep existing file upload references' },
                      { id: 'includeAssignedUsers', label: 'Team Assignments', icon: Users, desc: 'Copy supervisors and workers' },
                    ].map(opt => (
                      <label 
                        key={opt.id} 
                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer hover:bg-bg-secondary group ${
                          (cloneOptions as any)[opt.id] ? 'border-primary/40 bg-primary/5' : 'border-border'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 accent-primary w-4 h-4"
                          checked={(cloneOptions as any)[opt.id]}
                          onChange={(e) => setCloneOptions({ ...cloneOptions, [opt.id]: e.target.checked })}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <opt.icon size={14} className={(cloneOptions as any)[opt.id] ? 'text-primary' : 'text-text-muted'} />
                            <span className={`text-sm font-bold ${(cloneOptions as any)[opt.id] ? 'text-text-primary' : 'text-text-secondary'}`}>
                              {opt.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-muted m-0">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="animate-fade-in text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-success/10 text-success mx-auto flex items-center justify-center mb-4">
                    <Check size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-text-primary mb-2">Ready to Clone</h4>
                  <p className="text-sm text-text-muted px-4 mb-6">
                    Creating <span className="font-bold text-text-primary">"{duplicateName}"</span>.
                    You can still adjust these settings in project details later.
                  </p>
                  
                  <div className="inline-flex flex-wrap justify-center gap-2 max-w-sm px-4">
                    {Object.entries(cloneOptions).map(([key, val]) => val && (
                      <div key={key} className="px-3 py-1 bg-bg-secondary rounded-full text-[10px] font-bold text-text-muted border border-border">
                        {key.replace('include', '').split(/(?=[A-Z])/).join(' ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Footer */}
            <div className="p-6 bg-bg-secondary/30 border-t border-border-light flex justify-between gap-4">
              <Button
                title={wizardStep === 0 ? "Cancel" : "Back"}
                icon={wizardStep === 0 ? undefined : ChevronLeft}
                onClick={() => wizardStep === 0 ? setWizardOpen(false) : setWizardStep(prev => prev - 1)}
                variant="outline"
                size="small"
              />
              <Button
                title={wizardStep === 2 ? "Duplicate Project" : "Next Step"}
                icon={wizardStep === 2 ? Check : ChevronRight}
                iconPosition="right"
                onClick={() => wizardStep === 2 ? handleDuplicate() : setWizardStep(prev => prev + 1)}
                loading={duplicating}
                variant={wizardStep === 2 ? "success" : "primary"}
                size={wizardStep === 2 ? "medium" : "small"}
                disabled={wizardStep === 0 && !duplicateName.trim()}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
