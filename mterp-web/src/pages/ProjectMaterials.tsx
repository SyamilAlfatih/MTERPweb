import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Truck, Package, Plus, Search, CheckCircle2,
  Clock, Check, X, Edit3, Trash2, Calendar, DollarSign
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { addProjectSupply, updateProjectSupply, deleteProjectSupply } from '../api/api';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Button, Input, EmptyState, LoadingOverlay } from '../components/shared';
import { ProjectData } from '../types';

interface Supply {
  _id: string;
  item: string;
  qty: number;
  unit: string;
  cost: number;
  actualCost: number;
  status: 'Pending' | 'Ordered' | 'Delivered';
  startDate?: string;
  endDate?: string;
  deliveryDate?: string;
}

const EMPTY_FORM = {
  item: '',
  qty: '',
  unit: 'pcs',
  cost: '',
  startDate: '',
  endDate: '',
  status: 'Pending' as 'Pending' | 'Ordered' | 'Delivered',
};

export default function ProjectMaterials() {
  const { t } = useTranslation();
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState<ProjectData | null>(null);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const canManage = user?.role && ['owner', 'director', 'supervisor', 'asset_admin'].includes(user.role);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      const [projectRes, suppliesRes] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/supplies`),
      ]);
      setProject(projectRes.data);
      setSupplies(suppliesRes.data || []);
    } catch (err: any) {
      console.error('Failed to fetch project materials', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (supply: Supply) => {
    setEditingId(supply._id);
    setFormData({
      item: supply.item,
      qty: supply.qty.toString(),
      unit: supply.unit || 'pcs',
      cost: supply.cost?.toString() || '',
      startDate: supply.startDate ? new Date(supply.startDate).toISOString().split('T')[0] : '',
      endDate: supply.endDate ? new Date(supply.endDate).toISOString().split('T')[0] : '',
      status: supply.status || 'Pending',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.item.trim() || !formData.qty) {
      alert(t('projectMaterials.messages.validationRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        qty: Number(formData.qty),
        cost: Number(formData.cost) || 0,
      };

      if (editingId && projectId) {
        await updateProjectSupply(projectId, editingId, payload);
      } else if (projectId) {
        await addProjectSupply(projectId, payload);
      }

      setShowModal(false);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to save material', err);
      alert(err.response?.data?.msg || t('projectMaterials.messages.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (supplyId: string, itemName: string) => {
    if (!projectId) return;
    if (!confirm(t('projectMaterials.messages.deleteConfirm', { name: itemName }))) return;

    try {
      await deleteProjectSupply(projectId, supplyId);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to delete material', err);
      alert(t('projectMaterials.messages.deleteFailed'));
    }
  };

  const handleStatusUpdate = async (supplyId: string, newStatus: string) => {
    if (!projectId) return;
    try {
      await updateProjectSupply(projectId, supplyId, { status: newStatus });
      await fetchData();
    } catch (err) {
      console.error('Failed to update status', err);
      alert(t('projectMaterials.messages.updateFailed'));
    }
  };

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short'
    });
  };

  // derived stats
  const totalItems = supplies.length;
  const pendingItems = supplies.filter(s => s.status === 'Pending').length;
  const orderedItems = supplies.filter(s => s.status === 'Ordered').length;
  const deliveredItems = supplies.filter(s => s.status === 'Delivered').length;

  const filteredSupplies = supplies.filter(s =>
    s.item.toLowerCase().includes(search.toLowerCase())
  );

  const StatusIcon = {
    'Pending': Clock,
    'Ordered': Truck,
    'Delivered': CheckCircle2
  };

  const StatusColor = {
    'Pending': { color: '#D97706', bg: '#FEF3C7' },
    'Ordered': { color: '#2563EB', bg: '#DBEAFE' },
    'Delivered': { color: '#059669', bg: '#D1FAE5' }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-[1000px] mx-auto max-sm:p-3">
        <LoadingOverlay visible={true} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto max-sm:p-3">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <button className="w-10 h-10 rounded-lg flex items-center justify-center bg-bg-secondary text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer border-none shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-extrabold text-text-primary m-0 mb-1 tracking-tight">{t('projectMaterials.title')}</h1>
          <p className="text-sm text-text-muted m-0">{project?.nama || t('projectMaterials.fallbackProject')}</p>
        </div>
        {canManage && (
          <div className="max-sm:w-full [&>button]:max-sm:w-full">
            <Button
              title={t('projectMaterials.actions.addMaterial')}
              icon={Plus}
              onClick={openAddModal}
              variant="primary"
              size="small"
            />
          </div>
        )}
      </div>

      {/* KPI Stats */}
      {supplies.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6 max-lg:grid-cols-2">
          <div className="bg-bg-white border border-border-light rounded-lg p-4 flex gap-4 items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-violet-300">
            <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90 bg-violet-100 text-violet-700">
              <Package size={20} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-2xl font-extrabold leading-tight text-text-primary">{totalItems}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('projectMaterials.stats.total')}</span>
            </div>
          </div>
          <div className="bg-bg-white border border-border-light rounded-lg p-4 flex gap-4 items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-amber-300">
            <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90" style={{ backgroundColor: StatusColor['Pending'].bg, color: StatusColor['Pending'].color }}>
              <Clock size={20} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-2xl font-extrabold leading-tight" style={{ color: StatusColor['Pending'].color }}>{pendingItems}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('projectMaterials.stats.pending')}</span>
            </div>
          </div>
          <div className="bg-bg-white border border-border-light rounded-lg p-4 flex gap-4 items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-blue-300">
            <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90" style={{ backgroundColor: StatusColor['Ordered'].bg, color: StatusColor['Ordered'].color }}>
              <Truck size={20} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-2xl font-extrabold leading-tight" style={{ color: StatusColor['Ordered'].color }}>{orderedItems}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('projectMaterials.stats.ordered')}</span>
            </div>
          </div>
          <div className="bg-bg-white border border-border-light rounded-lg p-4 flex gap-4 items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-300">
            <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90" style={{ backgroundColor: StatusColor['Delivered'].bg, color: StatusColor['Delivered'].color }}>
              <CheckCircle2 size={20} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-2xl font-extrabold leading-tight" style={{ color: StatusColor['Delivered'].color }}>{deliveredItems}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('projectMaterials.stats.delivered')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      {supplies.length > 0 && (
        <div className="mb-5">
          <Input
            placeholder={t('projectMaterials.searchPlaceholder')}
            value={search}
            onChangeText={setSearch}
            icon={Search}
          />
        </div>
      )}

      {/* Empty State */}
      {supplies.length === 0 && (
        <EmptyState
          icon={Package}
          title={t('projectMaterials.empty.noMaterials')}
          description={t('projectMaterials.empty.trackDesc')}
        />
      )}

      {/* Materials List */}
      {filteredSupplies.length > 0 && (
        <div className="flex flex-col gap-4">
          {filteredSupplies.map((supply, index) => {
            const statusConfig = StatusColor[supply.status] || { color: '#64748B', bg: '#F1F5F9' };
            const IconComponent = StatusIcon[supply.status] || Package;
            
            let statusBadgeClass = 'bg-slate-50 text-slate-700 border-slate-200';
            if(supply.status === 'Pending') statusBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
            if(supply.status === 'Ordered') statusBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
            if(supply.status === 'Delivered') statusBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';

            return (
              <Card
                key={supply._id}
                className="relative overflow-hidden !p-0 animate-[fade-in-up_0.35s_ease_both] transition-all duration-150 hover:-translate-y-[2px] hover:shadow-lg"
                style={{
                  animationDelay: `${index * 0.05}s`
                }}
              >
               <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: statusConfig.color }} />
                <div className="p-5 flex gap-5 items-center max-sm:flex-col max-sm:items-start pl-6">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 max-sm:w-10 max-sm:h-10" style={{ backgroundColor: statusConfig.bg }}>
                    <IconComponent size={24} color={statusConfig.color} />
                  </div>
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                      <h3 className="text-lg font-bold text-text-primary m-0">{supply.item}</h3>
                      <div className={`text-xs font-bold py-1 px-2.5 rounded-full border box-border whitespace-nowrap ${statusBadgeClass}`}>
                        {supply.status}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-text-primary">
                        <Package size={14} className="text-text-secondary" /> {supply.qty} {supply.unit}
                      </span>
                      {supply.cost > 0 && (
                        <span className="flex items-center gap-1.5 text-sm text-text-secondary">
                          <DollarSign size={14} /> {t('projectMaterials.labels.estCost', { cost: formatRupiah(supply.cost) })}
                        </span>
                      )}
                      {(supply.startDate || supply.endDate) && (
                        <span className="flex items-center gap-1.5 text-sm text-text-secondary">
                          <Calendar size={14} /> {formatDate(supply.startDate)} - {formatDate(supply.endDate)}
                        </span>
                      )}
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-3 shrink-0 max-sm:w-full max-sm:justify-end max-sm:pt-4 max-sm:border-t max-sm:border-dashed max-sm:border-border-light max-sm:mt-2">
                      <div className="flex items-center max-sm:w-full max-sm:flex-col max-sm:gap-2 max-sm:mr-0 z-10">
                        {supply.status === 'Pending' && (
                          <button
                            className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded text-xs font-bold border border-transparent cursor-pointer transition-colors max-sm:w-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-200 mr-2 max-sm:mr-0"
                            onClick={() => handleStatusUpdate(supply._id, 'Ordered')}
                            title={t('projectMaterials.actions.markOrdered')}
                          >
                            <Truck size={14} /> {t('projectMaterials.labels.ordered')}
                          </button>
                        )}
                        {supply.status === 'Ordered' && (
                          <button
                            className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded text-xs font-bold border border-transparent cursor-pointer transition-colors max-sm:w-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:border-emerald-200 mr-2 max-sm:mr-0"
                            onClick={() => handleStatusUpdate(supply._id, 'Delivered')}
                            title={t('projectMaterials.actions.markDelivered')}
                          >
                            <Check size={14} /> {t('projectMaterials.labels.delivered')}
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                          <button className="w-8 h-8 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none bg-bg-secondary text-text-secondary hover:bg-primary/10 hover:text-primary z-10" onClick={() => openEditModal(supply)}>
                            <Edit3 size={16} />
                          </button>
                          <button className="w-8 h-8 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none bg-bg-secondary text-rose-500 hover:bg-rose-50 hover:text-rose-600 z-10" onClick={() => handleDelete(supply._id, supply.item)}>
                            <Trash2 size={16} />
                          </button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* No Results */}
      {search && filteredSupplies.length === 0 && supplies.length > 0 && (
        <EmptyState
          icon={Search}
          title={t('projectMaterials.empty.noResults')}
          description={t('projectMaterials.empty.noMatch', { search })}
        />
      )}

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-[1000] backdrop-blur-[4px]" onClick={() => setShowModal(false)}>
          <div className="bg-bg-white rounded-xl w-full max-w-[500px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-light">
              <h2 className="m-0 font-bold text-lg text-text-primary">{editingId ? t('projectMaterials.actions.editMaterial') : t('projectMaterials.actions.addMaterial')}</h2>
              <button className="p-2 border-none bg-transparent cursor-pointer text-text-muted flex hover:bg-bg-secondary hover:text-text-primary rounded-md" onClick={() => setShowModal(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-text-primary">{t('projectMaterials.modal.itemName')}</label>
                <input
                  type="text"
                  className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow"
                  placeholder={t('projectMaterials.modal.itemNamePlaceholder')}
                  value={formData.item}
                  onChange={e => setFormData({ ...formData, item: e.target.value })}
                />
              </div>

              <div className="flex gap-3 max-sm:flex-col">
                <div className="flex flex-col gap-1.5 flex-[2]">
                  <label className="text-sm font-semibold text-text-primary">{t('projectMaterials.modal.quantity')}</label>
                  <input
                    type="number"
                    className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow"
                    placeholder="0"
                    value={formData.qty}
                    onChange={e => setFormData({ ...formData, qty: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('projectMaterials.modal.unit')}</label>
                  <input
                    type="text"
                    className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow"
                    placeholder={t('projectMaterials.modal.unitPlaceholder')}
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-text-primary">{t('projectMaterials.modal.estimatedCost', { unit: formData.unit || 'unit' })}</label>
                <input
                  type="number"
                  className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow"
                  placeholder={t('projectMaterials.modal.costPlaceholder')}
                  value={formData.cost}
                  onChange={e => setFormData({ ...formData, cost: e.target.value })}
                />
              </div>

              <div className="flex gap-3 max-sm:flex-col">
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('projectMaterials.modal.startDate')}</label>
                  <input
                    type="date"
                    className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow"
                    value={formData.startDate}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('projectMaterials.modal.endDate')}</label>
                  <input
                    type="date"
                    className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow"
                    value={formData.endDate}
                    onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-text-primary">{t('projectMaterials.modal.status')}</label>
                <select
                  className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow appearance-none cursor-pointer"
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                >
                  <option value="Pending">{t('projectMaterials.modal.statusOptions.pending')}</option>
                  <option value="Ordered">{t('projectMaterials.modal.statusOptions.ordered')}</option>
                  <option value="Delivered">{t('projectMaterials.modal.statusOptions.delivered')}</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-border-light bg-bg-secondary/50 rounded-b-xl">
              <Button title={t('projectMaterials.actions.cancel')} variant="outline" onClick={() => setShowModal(false)} />
              <Button title={t('projectMaterials.actions.saveMaterial')} variant="primary" onClick={handleSave} loading={submitting} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
