import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Wrench, User, Warehouse, Plus,
  ChevronDown, X, AlertCircle, Package, Search,
  CheckCircle2, Settings, AlertTriangle, Calendar, MapPin, UserX
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge, Button, EmptyState, Input } from '../components/shared';

interface ToolData {
  _id: string;
  nama: string;
  kategori: string;
  stok: number;
  satuan: string;
  kondisi: string;
  lokasi: string;
  lastChecked?: string;
  assignedTo?: { _id: string; fullName: string; role: string };
  projectId?: { _id: string; nama: string };
}

interface UserOption {
  _id: string;
  fullName: string;
  role: string;
}

interface ProjectData {
  _id: string;
  nama: string;
  lokasi: string;
}

const CONDITION_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  'Baik': { color: '#059669', bg: '#D1FAE5', icon: CheckCircle2, label: 'Good' },
  'Maintenance': { color: '#D97706', bg: '#FEF3C7', icon: Settings, label: 'Service' },
  'Rusak': { color: '#DC2626', bg: '#FEE2E2', icon: AlertTriangle, label: 'Damaged' },
};

export default function ProjectTools() {
  const { t } = useTranslation();
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState<ProjectData | null>(null);
  const [tools, setTools] = useState<ToolData[]>([]);
  const [availableTools, setAvailableTools] = useState<ToolData[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTool, setSelectedTool] = useState<ToolData | null>(null);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedToolToAdd, setSelectedToolToAdd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canManageTools = user?.role && ['owner', 'director', 'supervisor', 'asset_admin'].includes(user.role);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setError(null);

      const projectRes = await api.get(`/projects/${projectId}`);
      setProject(projectRes.data);

      const toolsRes = await api.get(`/tools/project/${projectId}`);
      setTools(toolsRes.data);

      if (canManageTools) {
        const availableRes = await api.get('/tools/available');
        setAvailableTools(availableRes.data);

        const usersRes = await api.get('/tasks/users/list');
        setUsers(usersRes.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch data', err);
      setError(err.response?.data?.msg || t('projectTools.messages.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddTool = async () => {
    if (!selectedToolToAdd) return;

    setSubmitting(true);
    try {
      await api.put(`/tools/${selectedToolToAdd}/assign`, {
        projectId: projectId,
      });
      await fetchData();
      setShowAddModal(false);
      setSelectedToolToAdd('');
    } catch (err: any) {
      console.error('Failed to add tool', err);
      alert(err.response?.data?.msg || t('projectTools.messages.addFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignUser = async () => {
    if (!selectedTool) return;

    setSubmitting(true);
    try {
      await api.put(`/tools/${selectedTool._id}/assign`, {
        projectId: projectId,
        assignedTo: selectedUser || null,
      });
      await fetchData();
      setShowAssignModal(false);
      setSelectedTool(null);
      setSelectedUser('');
    } catch (err: any) {
      console.error('Failed to assign user', err);
      alert(err.response?.data?.msg || t('projectTools.messages.assignFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnassign = async (tool: ToolData) => {
    if (!confirm(t('projectTools.messages.unassignConfirm', { name: tool.nama, user: tool.assignedTo?.fullName }))) return;

    try {
      await api.put(`/tools/${tool._id}/unassign`);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to unassign tool', err);
      alert(err.response?.data?.msg || t('projectTools.messages.unassignFailed'));
    }
  };

  const handleReturnToWarehouse = async (tool: ToolData) => {
    if (!confirm(t('projectTools.messages.returnConfirm', { name: tool.nama }))) return;

    try {
      await api.put(`/tools/${tool._id}/return`);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to return tool', err);
      alert(err.response?.data?.msg || t('projectTools.messages.returnFailed'));
    }
  };

  const openAssignModal = (tool: ToolData) => {
    setSelectedTool(tool);
    setSelectedUser(tool.assignedTo?._id || '');
    setShowAssignModal(true);
  };

  const getConditionStyle = (kondisi: string) => {
    const config = CONDITION_CONFIG[kondisi];
    if (!config) return { color: '#94A3B8', bg: '#F1F5F9', icon: Package, label: t('tools.condition.na') };
    const labelMapping: Record<string, string> = {
      'Good': t('tools.condition.good'),
      'Service': t('tools.condition.service'),
      'Damaged': t('tools.condition.damaged')
    };
    return { ...config, label: labelMapping[config.label] };
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short'
    });
  };

  // Filtered tools
  const filteredTools = tools.filter(t =>
    !search || t.nama.toLowerCase().includes(search.toLowerCase()) ||
    t.kategori?.toLowerCase().includes(search.toLowerCase())
  );

  // Mini stats
  const statsGood = tools.filter(t => t.kondisi === 'Baik').length;
  const statsMaint = tools.filter(t => t.kondisi === 'Maintenance' || t.kondisi === 'Rusak').length;
  const statsAssigned = tools.filter(t => !!t.assignedTo).length;

  if (loading) {
    return (
      <div className="p-6 max-w-[900px] mx-auto max-lg:p-4 max-sm:p-3">
        <div className="flex flex-col items-center justify-center p-12 gap-4 text-text-muted">
          <div className="spinner" />
          <span>{t('projectTools.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[900px] mx-auto max-lg:p-4 max-sm:p-3">
      {/* Header */}
      <div className="flex items-center gap-4 mb-5 max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <button className="p-2 border-none bg-bg-secondary rounded-md cursor-pointer flex items-center justify-center text-text-primary transition-colors duration-150 hover:bg-bg-tertiary" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-text-primary m-0">{t('projectTools.title')}</h1>
          <p className="text-sm text-text-muted m-0">{project?.nama || t('projectTools.fallbackProject')}</p>
        </div>
        {canManageTools && (
          <Button
            title={t('projectTools.actions.addTool')}
            icon={Plus}
            onClick={() => setShowAddModal(true)}
            variant="primary"
            size="small"
          />
        )}
      </div>

      {/* Mini Stats */}
      {tools.length > 0 && (
        <div className="flex items-center gap-4 py-3 px-5 bg-bg-white rounded-lg border border-border-light shadow-sm mb-4 overflow-x-auto max-sm:gap-3 max-sm:p-3">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Package size={16} color="var(--primary)" />
            <span className="text-lg font-bold text-text-primary">{tools.length}</span>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px] max-sm:hidden">{t('projectTools.stats.total')}</span>
          </div>
          <div className="w-px h-7 bg-border-light shrink-0" />
          <div className="flex items-center gap-2 whitespace-nowrap">
            <CheckCircle2 size={16} color="#059669" />
            <span className="text-lg font-bold text-text-primary" style={{ color: '#059669' }}>{statsGood}</span>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px] max-sm:hidden">{t('projectTools.stats.good')}</span>
          </div>
          <div className="w-px h-7 bg-border-light shrink-0" />
          <div className="flex items-center gap-2 whitespace-nowrap">
            <AlertTriangle size={16} color="#D97706" />
            <span className="text-lg font-bold text-text-primary" style={{ color: '#D97706' }}>{statsMaint}</span>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px] max-sm:hidden">{t('projectTools.stats.attention')}</span>
          </div>
          <div className="w-px h-7 bg-border-light shrink-0" />
          <div className="flex items-center gap-2 whitespace-nowrap">
            <User size={16} color="#2563EB" />
            <span className="text-lg font-bold text-text-primary" style={{ color: '#2563EB' }}>{statsAssigned}</span>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px] max-sm:hidden">{t('projectTools.stats.assigned')}</span>
          </div>
        </div>
      )}

      {/* Search */}
      {tools.length > 0 && (
        <Input
          placeholder={t('projectTools.searchPlaceholder')}
          value={search}
          onChangeText={setSearch}
          icon={Search}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Error */}
      {error && (
        <EmptyState
          icon={AlertCircle}
          title={t('projectTools.empty.error')}
          description={error}
        />
      )}

      {/* Empty State */}
      {!error && tools.length === 0 && (
        <EmptyState
          icon={Wrench}
          title={t('projectTools.empty.noAssignedTools')}
          description={canManageTools ? t('projectTools.empty.addFromWarehouse') : t('projectTools.empty.noAssignedWait')}
        />
      )}

      {/* Tools List */}
      {filteredTools.length > 0 && (
        <div className="flex flex-col gap-3">
          {filteredTools.map((tool, index) => {
            const condStyle = getConditionStyle(tool.kondisi);
            const CondIcon = condStyle.icon;
            return (
              <Card
                key={tool._id}
                className="group p-4 !transition-all !duration-150 hover:-translate-y-[2px] hover:shadow-lg animate-[fade-in-up_0.35s_ease_both]"
                style={{
                  borderLeft: `4px solid ${condStyle.color}`,
                  animationDelay: `${index * 0.04}s`,
                }}
              >
                <div className="flex items-start gap-4 max-sm:flex-col">
                  <div className="w-12 h-12 rounded-md flex items-center justify-center shrink-0 max-sm:w-10 max-sm:h-10" style={{ backgroundColor: condStyle.bg }}>
                    <Wrench size={22} color={condStyle.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="text-base font-bold text-text-primary m-0">{tool.nama}</h3>
                      <span
                        className="text-xs font-bold py-[2px] px-2 rounded-full flex items-center gap-1"
                        style={{ backgroundColor: condStyle.bg, color: condStyle.color }}
                      >
                        <CondIcon size={12} />
                        {condStyle.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {tool.kategori && (
                        <span className="flex items-center gap-1 text-sm text-text-muted whitespace-nowrap">
                          <Package size={13} />
                          {tool.kategori}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-sm text-text-muted whitespace-nowrap">
                        <MapPin size={13} />
                        {tool.stok} {tool.satuan}
                      </span>
                      {tool.assignedTo && (
                        <span className="flex items-center gap-1 text-sm whitespace-nowrap !text-primary font-medium">
                          <User size={13} />
                          {tool.assignedTo.fullName}
                        </span>
                      )}
                      {tool.lastChecked && (
                        <span className="flex items-center gap-1 text-sm text-text-muted whitespace-nowrap">
                          <Calendar size={13} />
                          {formatDate(tool.lastChecked)}
                        </span>
                      )}
                    </div>
                  </div>
                  {canManageTools && (
                    <div className="flex flex-col gap-2 shrink-0 max-sm:flex-row max-sm:w-full [&>button]:max-sm:flex-1">
                      <Button
                        title={tool.assignedTo ? t('projectTools.actions.reassign') : t('projectTools.actions.assign')}
                        icon={User}
                        onClick={() => openAssignModal(tool)}
                        variant="outline"
                        size="small"
                      />
                      {tool.assignedTo && (
                        <Button
                          title={t('projectTools.actions.unassign')}
                          icon={UserX}
                          onClick={() => handleUnassign(tool)}
                          variant="warning"
                          size="small"
                        />
                      )}
                      <Button
                        title={t('projectTools.actions.return')}
                        icon={Warehouse}
                        onClick={() => handleReturnToWarehouse(tool)}
                        variant="danger"
                        size="small"
                      />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* No search results */}
      {search && filteredTools.length === 0 && tools.length > 0 && (
        <EmptyState
          icon={Search}
          title={t('projectTools.empty.noResults')}
          description={t('projectTools.empty.noMatch', { search })}
        />
      )}

      {/* Add Tool Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-[1000] backdrop-blur-[4px]" onClick={() => setShowAddModal(false)}>
          <div className="bg-bg-white rounded-xl w-full max-w-[480px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-light">
              <h2 className="m-0 font-bold text-lg text-text-primary">{t('projectTools.modal.addTitle')}</h2>
              <button className="p-2 border-none bg-transparent cursor-pointer text-text-muted rounded-md flex hover:bg-bg-secondary hover:text-text-primary" onClick={() => setShowAddModal(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="p-5">
              {availableTools.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title={t('projectTools.empty.noToolsAvailable')}
                  description={t('projectTools.empty.allAssigned')}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-text-primary">{t('projectTools.modal.selectTool')}</label>
                  <div className="relative">
                    <select
                      value={selectedToolToAdd}
                      onChange={(e) => setSelectedToolToAdd(e.target.value)}
                      className="w-full p-3 px-4 pr-10 border border-border rounded-md text-base text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10"
                    >
                      <option value="">{t('projectTools.modal.chooseTool')}</option>
                      {availableTools.map(t => (
                        <option key={t._id} value={t._id}>
                          {t.nama} ({t.kategori}) - {t.stok} {t.satuan}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-border-light">
              <Button
                title={t('projectTools.actions.cancel')}
                onClick={() => setShowAddModal(false)}
                variant="outline"
              />
              <Button
                title={t('projectTools.actions.addToProject')}
                onClick={handleAddTool}
                loading={submitting}
                variant="primary"
                disabled={!selectedToolToAdd}
              />
            </div>
          </div>
        </div>
      )}

      {/* Assign User Modal */}
      {showAssignModal && selectedTool && (
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-[1000] backdrop-blur-[4px]" onClick={() => setShowAssignModal(false)}>
          <div className="bg-bg-white rounded-xl w-full max-w-[480px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-light">
              <h2 className="m-0 font-bold text-lg text-text-primary">{t('projectTools.modal.assignTitle')}</h2>
              <button className="p-2 border-none bg-transparent cursor-pointer text-text-muted rounded-md flex hover:bg-bg-secondary hover:text-text-primary" onClick={() => setShowAssignModal(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-3 p-3 bg-bg-secondary rounded-md mb-4 font-semibold text-text-primary">
                <Wrench size={20} color="var(--primary)" />
                <span>{selectedTool.nama}</span>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-text-primary">{t('projectTools.modal.assignTo')}</label>
                <div className="relative">
                  <select
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="w-full p-3 px-4 pr-10 border border-border rounded-md text-base text-text-primary bg-bg-white appearance-none cursor-pointer focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10"
                  >
                    <option value="">{t('projectTools.modal.unassigned')}</option>
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
                title={t('projectTools.actions.cancel')}
                onClick={() => setShowAssignModal(false)}
                variant="outline"
              />
              <Button
                title={t('projectTools.actions.saveAssignment')}
                onClick={handleAssignUser}
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
