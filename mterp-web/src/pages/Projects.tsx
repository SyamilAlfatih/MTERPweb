import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ChevronRight, Briefcase, Copy, Check, ChevronLeft, AlertCircle, Users, FileText, Package, ListChecks, Key, X, ChevronDown, ChevronUp, Code } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import api, { getApiKeys, createApiKey, updateApiKey, deleteApiKey } from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, ProgressBar, Button, Input, EmptyState, LoadingOverlay, Alert } from '../components/shared';
import { ProjectData, ApiKey } from '../types';

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

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isApiKeysOpen, setIsApiKeysOpen] = useState(false);
  const [isApiKeysLoading, setIsApiKeysLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreateKeyModalOpen, setIsCreateKeyModalOpen] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState<ApiKey | null>(null);
  const [hasCopiedKey, setHasCopiedKey] = useState(false);

  useEffect(() => {
    fetchProjects();
    fetchApiKeys();
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

  // API Key handlers
  const fetchApiKeys = async () => {
    try {
      setIsApiKeysLoading(true);
      const data = await getApiKeys();
      setApiKeys(data);
    } catch (error) {
      console.error('Failed to load API keys', error);
    } finally {
      setIsApiKeysLoading(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    try {
      const res = await createApiKey(newKeyName.trim());
      setCreatedKeyData(res);
      setNewKeyName('');
      setIsCreateKeyModalOpen(false);
      fetchApiKeys();
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        alert(error.response?.data?.msg || 'Failed to create API key');
      } else {
        alert('An unexpected error occurred');
      }
    }
  };

  const handleToggleKeyActive = async (key: ApiKey) => {
    try {
      await updateApiKey(key._id, { isActive: !key.isActive });
      fetchApiKeys();
    } catch (error) {
      console.error('Toggle key error:', error);
      alert('Failed to update API key');
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (window.confirm('Delete this API Key? External applications using it will lose access immediately.')) {
      try {
        await deleteApiKey(id);
        fetchApiKeys();
      } catch (error) {
        console.error('Delete key error:', error);
        alert('Failed to delete API key');
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setHasCopiedKey(true);
    setTimeout(() => setHasCopiedKey(false), 2500);
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
        <div className="flex items-center gap-2.5 max-sm:w-full max-sm:flex-wrap">
          {/* API Keys Toggle */}
          <button 
            className={`flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all border-2 ${
              isApiKeysOpen 
                ? 'bg-primary text-white border-primary shadow-sm' 
                : 'bg-bg-secondary hover:bg-border-light text-text-primary border-border-light'
            }`}
            onClick={() => setIsApiKeysOpen(!isApiKeysOpen)}
            title="Buka panel API Key untuk integrasi aplikasi pihak ketiga"
          >
            <Key size={16} strokeWidth={2.5} />
            <span>API Keys</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 text-current font-bold">
              {apiKeys.length}
            </span>
          </button>
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

      {/* ========================================== */}
      {/* API KEY MANAGEMENT SECTION (COLLAPSIBLE)  */}
      {/* ========================================== */}
      <Card className="border-2 border-border-light overflow-hidden mt-6">
        <div 
          className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex justify-between items-center cursor-pointer select-none"
          onClick={() => setIsApiKeysOpen(!isApiKeysOpen)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0">
              <Key size={20} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black uppercase tracking-tight m-0">
                  Manajemen API Key (Akses Aplikasi Eksternal)
                </h3>
                <span className="bg-amber-400 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full uppercase">
                  External Access
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium m-0 mt-0.5">
                Kunci otorisasi untuk membaca data proyek dari sistem luar (endpoint: <code className="text-amber-300">/api/projects</code>)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsCreateKeyModalOpen(true);
              }}
              className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95"
            >
              <Plus size={15} strokeWidth={3} />
              <span>Buat API Key</span>
            </button>
            {isApiKeysOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>

        {isApiKeysOpen && (
          <div className="p-6 bg-bg-white space-y-6">
            {/* Documentation banner */}
            <div className="bg-slate-50 border-2 border-slate-200 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="text-xs font-black text-slate-900 uppercase flex items-center gap-1.5">
                  <Code size={16} className="text-primary" />
                  Format Pemanggilan API Eksternal
                </span>
                <p className="text-xs text-text-secondary mt-1 font-mono bg-white p-2 rounded border border-slate-200 inline-block">
                  GET /api/projects &nbsp;|&nbsp; Header: <span className="font-bold text-primary">X-API-Key: mterp_xxxxxxxx...</span>
                </p>
              </div>
              <div className="text-xs text-text-muted font-bold">
                Mendukung query parameter: <code className="text-primary">page, limit, search, status</code>
              </div>
            </div>

            {/* API Keys List */}
            {isApiKeysLoading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-10 bg-bg-secondary/30 rounded-xl border border-border-light">
                <Key size={32} className="mx-auto text-text-muted mb-2 opacity-50" />
                <h4 className="text-sm font-black text-text-primary mb-1">Belum Ada API Key</h4>
                <p className="text-xs text-text-muted max-w-md mx-auto mb-4">
                  Buat API key baru untuk menghubungkan sistem manajemen proyek eksternal atau dashboard pihak ketiga.
                </p>
                <button
                  onClick={() => setIsCreateKeyModalOpen(true)}
                  className="bg-primary text-white text-xs font-black px-4 py-2 rounded-xl uppercase tracking-wider"
                >
                  Buat Key Sekarang
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border-light border-2 border-border-light rounded-xl overflow-hidden">
                {apiKeys.map((key) => (
                  <div key={key._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        key.isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        <Key size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-text-primary">{key.name}</span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.2 rounded-full border ${
                            key.isActive 
                              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' 
                              : 'bg-red-500/10 text-red-700 border-red-500/30'
                          }`}>
                            {key.isActive ? 'Aktif' : 'Non-aktif'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-muted font-bold mt-0.5">
                          <span>Prefix: <code className="font-mono text-slate-800 font-black">{key.keyPrefix}••••••••</code></span>
                          <span>•</span>
                          <span>Dibuat: {new Date(key.createdAt).toLocaleDateString('id-ID')}</span>
                          {key.lastUsedAt && (
                            <>
                              <span>•</span>
                              <span>Terakhir digunakan: {new Date(key.lastUsedAt).toLocaleString('id-ID')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleToggleKeyActive(key)}
                        className={`text-xs font-black px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                          key.isActive 
                            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100' 
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        {key.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button
                        onClick={() => handleDeleteApiKey(key._id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer transition-all"
                        title="Hapus Key"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

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

      {/* ========================================== */}
      {/* MODAL: CREATE API KEY                      */}
      {/* ========================================== */}
      {isCreateKeyModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" onClick={() => setIsCreateKeyModalOpen(false)}>
          <div className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[460px] shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b-2 border-border-light bg-slate-900 text-white flex justify-between items-center sticky top-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 font-black">
                  <Key size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight m-0">Buat API Key Baru</h3>
                  <span className="text-xs text-slate-300">Akses eksternal endpoint /api/projects</span>
                </div>
              </div>
              <button className="w-8 h-8 rounded-full bg-white/10 border-none flex items-center justify-center text-white cursor-pointer" onClick={() => setIsCreateKeyModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateApiKey} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase mb-1.5">
                  Nama Identitas Kunci (Label) *
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Dashboard Proyek, Sistem Monitoring"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full px-3.5 py-3 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
                Kunci mentah hanya akan ditampilkan <strong>sekali</strong> setelah dibuat. Simpan di tempat yang aman.
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  className="flex-1 py-3.5 bg-bg-white border-2 border-border-light rounded-xl text-xs font-black text-text-secondary cursor-pointer hover:bg-bg-secondary uppercase tracking-wider" 
                  onClick={() => setIsCreateKeyModalOpen(false)}
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="flex-[2] py-3.5 bg-primary text-white border-none rounded-xl text-xs font-black cursor-pointer hover:bg-primary/90 uppercase tracking-wider shadow-lg shadow-primary/20"
                >
                  Generate Kunci
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: SHOW CREATED API KEY (ONCE)         */}
      {/* ========================================== */}
      {createdKeyData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1100] p-4 animate-in fade-in duration-200">
          <div className="bg-bg-white rounded-3xl w-full max-w-[500px] shadow-2xl overflow-hidden flex flex-col p-6 space-y-4 border-2 border-amber-400">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Key size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-text-primary m-0 uppercase">API Key Berhasil Dibuat</h3>
                <span className="text-xs font-bold text-text-muted">{createdKeyData.name}</span>
              </div>
            </div>

            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl text-xs text-red-800 font-bold">
              PENTING: Salin kunci ini sekarang! Kunci ini tidak dapat ditampilkan kembali setelah Anda menutup jendela ini.
            </div>

            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase mb-1.5">
                Kunci API (Header: X-API-Key)
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={createdKeyData.rawKey || ''}
                  className="flex-1 p-3 bg-slate-100 border-2 border-slate-300 rounded-xl font-mono text-xs font-black select-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdKeyData.rawKey || '')}
                  className="flex items-center gap-1.5 bg-primary text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-primary/90 active:scale-95 cursor-pointer shrink-0"
                >
                  {hasCopiedKey ? <Check size={16} /> : <Copy size={16} />}
                  <span>{hasCopiedKey ? 'Tersalin' : 'Salin'}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCreatedKeyData(null)}
              className="w-full py-3.5 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all cursor-pointer mt-2"
            >
              Saya Sudah Menyimpan Kunci Ini
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
