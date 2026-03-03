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
import './ProjectMaterials.css';
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
      <div className="pm-container">
        <LoadingOverlay visible={true} />
      </div>
    );
  }

  return (
    <div className="pm-container">
      {/* Header */}
      <div className="pm-header">
        <button className="pm-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <div className="pm-header-info">
          <h1 className="pm-title">{t('projectMaterials.title')}</h1>
          <p className="pm-subtitle">{project?.nama || t('projectMaterials.fallbackProject')}</p>
        </div>
        {canManage && (
          <Button
            title={t('projectMaterials.actions.addMaterial')}
            icon={Plus}
            onClick={openAddModal}
            variant="primary"
            size="small"
          />
        )}
      </div>

      {/* KPI Stats */}
      {supplies.length > 0 && (
        <div className="pm-stats-row">
          <div className="pm-stat-card">
            <div className="pm-stat-icon" style={{ backgroundColor: '#EDE9FE', color: '#7C3AED' }}>
              <Package size={20} />
            </div>
            <div className="pm-stat-info">
              <span className="pm-stat-value">{totalItems}</span>
              <span className="pm-stat-label">{t('projectMaterials.stats.total')}</span>
            </div>
          </div>
          <div className="pm-stat-card">
            <div className="pm-stat-icon" style={{ backgroundColor: StatusColor['Pending'].bg, color: StatusColor['Pending'].color }}>
              <Clock size={20} />
            </div>
            <div className="pm-stat-info">
              <span className="pm-stat-value" style={{ color: StatusColor['Pending'].color }}>{pendingItems}</span>
              <span className="pm-stat-label">{t('projectMaterials.stats.pending')}</span>
            </div>
          </div>
          <div className="pm-stat-card">
            <div className="pm-stat-icon" style={{ backgroundColor: StatusColor['Ordered'].bg, color: StatusColor['Ordered'].color }}>
              <Truck size={20} />
            </div>
            <div className="pm-stat-info">
              <span className="pm-stat-value" style={{ color: StatusColor['Ordered'].color }}>{orderedItems}</span>
              <span className="pm-stat-label">{t('projectMaterials.stats.ordered')}</span>
            </div>
          </div>
          <div className="pm-stat-card">
            <div className="pm-stat-icon" style={{ backgroundColor: StatusColor['Delivered'].bg, color: StatusColor['Delivered'].color }}>
              <CheckCircle2 size={20} />
            </div>
            <div className="pm-stat-info">
              <span className="pm-stat-value" style={{ color: StatusColor['Delivered'].color }}>{deliveredItems}</span>
              <span className="pm-stat-label">{t('projectMaterials.stats.delivered')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      {supplies.length > 0 && (
        <Input
          placeholder={t('projectMaterials.searchPlaceholder')}
          value={search}
          onChangeText={setSearch}
          icon={Search}
          style={{ marginBottom: 20 }}
        />
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
        <div className="pm-list">
          {filteredSupplies.map((supply, index) => {
            const statusConfig = StatusColor[supply.status] || { color: '#64748B', bg: '#F1F5F9' };
            const IconComponent = StatusIcon[supply.status] || Package;

            return (
              <Card
                key={supply._id}
                className="pm-card"
                style={{
                  borderLeft: `4px solid ${statusConfig.color}`,
                  animationDelay: `${index * 0.05}s`
                }}
              >
                <div className="pm-card-body">
                  <div className="pm-icon-wrap" style={{ backgroundColor: statusConfig.bg }}>
                    <IconComponent size={24} color={statusConfig.color} />
                  </div>
                  <div className="pm-info">
                    <div className="pm-info-top">
                      <h3 className="pm-item-name">{supply.item}</h3>
                      <div className={`pm-status-badge pm-status-${supply.status.toLowerCase()}`}>
                        {supply.status}
                      </div>
                    </div>
                    <div className="pm-meta-row">
                      <span className="pm-meta-item pm-meta-qty">
                        <Package size={14} /> {supply.qty} {supply.unit}
                      </span>
                      {supply.cost > 0 && (
                        <span className="pm-meta-item">
                          <DollarSign size={14} /> {t('projectMaterials.labels.estCost', { cost: formatRupiah(supply.cost) })}
                        </span>
                      )}
                      {(supply.startDate || supply.endDate) && (
                        <span className="pm-meta-item">
                          <Calendar size={14} /> {formatDate(supply.startDate)} - {formatDate(supply.endDate)}
                        </span>
                      )}
                    </div>
                  </div>

                  {canManage && (
                    <div className="pm-actions">
                      <div className="pm-status-quick-actions">
                        {supply.status === 'Pending' && (
                          <button
                            className="pm-quick-btn pm-quick-ordered"
                            onClick={() => handleStatusUpdate(supply._id, 'Ordered')}
                            title={t('projectMaterials.actions.markOrdered')}
                          >
                            <Truck size={14} /> {t('projectMaterials.labels.ordered')}
                          </button>
                        )}
                        {supply.status === 'Ordered' && (
                          <button
                            className="pm-quick-btn pm-quick-delivered"
                            onClick={() => handleStatusUpdate(supply._id, 'Delivered')}
                            title={t('projectMaterials.actions.markDelivered')}
                          >
                            <Check size={14} /> {t('projectMaterials.labels.delivered')}
                          </button>
                        )}
                      </div>
                      <button className="pm-action-btn pm-edit-btn" onClick={() => openEditModal(supply)}>
                        <Edit3 size={16} />
                      </button>
                      <button className="pm-action-btn pm-delete-btn" onClick={() => handleDelete(supply._id, supply.item)}>
                        <Trash2 size={16} />
                      </button>
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
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? t('projectMaterials.actions.editMaterial') : t('projectMaterials.actions.addMaterial')}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">{t('projectMaterials.modal.itemName')}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('projectMaterials.modal.itemNamePlaceholder')}
                  value={formData.item}
                  onChange={e => setFormData({ ...formData, item: e.target.value })}
                />
              </div>

              <div className="form-row" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">{t('projectMaterials.modal.quantity')}</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="0"
                    value={formData.qty}
                    onChange={e => setFormData({ ...formData, qty: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('projectMaterials.modal.unit')}</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={t('projectMaterials.modal.unitPlaceholder')}
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">{t('projectMaterials.modal.estimatedCost', { unit: formData.unit || 'unit' })}</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder={t('projectMaterials.modal.costPlaceholder')}
                  value={formData.cost}
                  onChange={e => setFormData({ ...formData, cost: e.target.value })}
                />
              </div>

              <div className="form-row" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('projectMaterials.modal.startDate')}</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.startDate}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('projectMaterials.modal.endDate')}</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.endDate}
                    onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('projectMaterials.modal.status')}</label>
                <select
                  className="form-input"
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                >
                  <option value="Pending">{t('projectMaterials.modal.statusOptions.pending')}</option>
                  <option value="Ordered">{t('projectMaterials.modal.statusOptions.ordered')}</option>
                  <option value="Delivered">{t('projectMaterials.modal.statusOptions.delivered')}</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <Button title={t('projectMaterials.actions.cancel')} variant="outline" onClick={() => setShowModal(false)} />
              <Button title={t('projectMaterials.actions.saveMaterial')} variant="primary" onClick={handleSave} loading={submitting} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
