import { useState, useEffect } from 'react';
import {
  Package, Plus, Search, CheckCircle2,
  Clock, XCircle, Trash2, Calendar, DollarSign,
  User, Folder, AlertCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createMaterialRequest, updateMaterialRequestStatus, deleteMaterialRequest } from '../api/api';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Button, Input, EmptyState, LoadingOverlay } from '../components/shared';
import { MaterialRequest, ProjectData } from '../types';

const EMPTY_FORM = {
  item: '',
  qty: '',
  dateNeeded: '',
  purpose: '',
  costEstimate: '',
  urgency: 'Normal' as const,
  projectId: '',
};

type FilterType = 'All' | 'Pending' | 'Approved' | 'Rejected';

export default function Materials() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [currentFilter, setCurrentFilter] = useState<FilterType>('All');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Approval/Rejection Modals
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const isAdmin = user?.role && ['owner', 'director', 'asset_admin'].includes(user.role.toLowerCase());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [reqRes, projRes] = await Promise.all([
        api.get('/requests'),
        api.get('/projects'),
      ]);
      setRequests(reqRes.data);
      setProjects(projRes.data);
    } catch (err: any) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async () => {
    if (!formData.item.trim() || !formData.qty.trim() || !formData.dateNeeded) {
      alert(t('materials.messages.fillRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        costEstimate: Number(formData.costEstimate) || 0,
        projectId: formData.projectId || undefined,
      };

      await createMaterialRequest(payload);
      setShowAddModal(false);
      setFormData(EMPTY_FORM);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to create request', err);
      alert(err.response?.data?.msg || t('materials.messages.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string, reason?: string) => {
    try {
      if (newStatus === 'Rejected' && !reason && rejectingId !== id) {
        // Open rejection modal instead
        setRejectingId(id);
        setRejectionReason('');
        return;
      }

      await updateMaterialRequestStatus(id, {
        status: newStatus,
        rejectionReason: reason
      });

      setRejectingId(null);
      await fetchData();
    } catch (err) {
      console.error('Failed to update status', err);
      alert(t('materials.messages.updateStatusFailed'));
    }
  };

  const handleDeleteRequest = async (id: string, itemName: string) => {
    if (!confirm(t('materials.messages.deleteConfirm', { name: itemName }))) return;
    try {
      await deleteMaterialRequest(id);
      await fetchData();
    } catch (err) {
      console.error('Failed to delete request', err);
      alert(t('materials.messages.deleteFailed'));
    }
  };

  const getPopulatedName = (field: any, defaultKey: string) => {
    if (!field) return '-';
    if (typeof field === 'string') return '-';
    return field[defaultKey] || '-';
  };

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(num);
  };

  // Stats calculation
  const stats = {
    Total: requests.length,
    Pending: requests.filter((r: MaterialRequest) => r.status === 'Pending').length,
    Approved: requests.filter((r: MaterialRequest) => r.status === 'Approved').length,
    Rejected: requests.filter((r: MaterialRequest) => r.status === 'Rejected').length,
  };

  // Filtered lists
  const filteredRequests = requests.filter((r: MaterialRequest) => {
    const matchesFilter = currentFilter === 'All' || r.status === currentFilter;
    const searchString = `${r.item} ${getPopulatedName(r.projectId, 'nama')} ${getPopulatedName(r.requestedBy, 'fullName')} ${r.purpose || ''}`.toLowerCase();
    const matchesSearch = searchString.includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const StatusIcon = {
    'Pending': Clock,
    'Approved': CheckCircle2,
    'Rejected': XCircle
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
      {/* Premium Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-lg flex items-center justify-center shadow-[0_4px_12px_rgba(37,99,235,0.15)]">
            <Package size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-text-primary m-0 mb-1 tracking-tight">{t('materials.title')}</h1>
            <p className="text-sm text-text-muted m-0">{t('materials.subtitle')}</p>
          </div>
        </div>
        <div className="max-sm:w-full [&>button]:max-sm:w-full">
          <Button
            title={t('materials.actions.newRequest')}
            icon={Plus}
            onClick={() => setShowAddModal(true)}
            variant="primary"
          />
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6 max-lg:grid-cols-2">
        <div className="bg-bg-white border border-border-light rounded-lg p-4 flex justify-between items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-400">
          <div className="flex flex-col">
            <span className="text-2xl font-extrabold text-text-primary leading-tight mb-0.5">{stats.Total}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('materials.stats.total')}</span>
          </div>
          <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90 bg-slate-100 text-slate-600"><Package size={24} /></div>
        </div>
        <div className="bg-bg-white border border-border-light rounded-lg p-4 flex justify-between items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-amber-300">
          <div className="flex flex-col">
            <span className="text-2xl font-extrabold text-amber-700 leading-tight mb-0.5">{stats.Pending}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('materials.stats.pending')}</span>
          </div>
          <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90 bg-amber-100 text-amber-600"><Clock size={24} /></div>
        </div>
        <div className="bg-bg-white border border-border-light rounded-lg p-4 flex justify-between items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-300">
          <div className="flex flex-col">
            <span className="text-2xl font-extrabold text-emerald-700 leading-tight mb-0.5">{stats.Approved}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('materials.stats.approved')}</span>
          </div>
          <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90 bg-emerald-100 text-emerald-600"><CheckCircle2 size={24} /></div>
        </div>
        <div className="bg-bg-white border border-border-light rounded-lg p-4 flex justify-between items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-rose-300">
          <div className="flex flex-col">
            <span className="text-2xl font-extrabold text-rose-700 leading-tight mb-0.5">{stats.Rejected}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('materials.stats.rejected')}</span>
          </div>
          <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90 bg-rose-100 text-rose-600"><XCircle size={24} /></div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center gap-4 mb-5 flex-wrap max-sm:flex-col max-sm:items-stretch">
        <div className="flex-1 min-w-0 sm:min-w-[280px]">
          <Input
            placeholder={t('materials.searchPlaceholder')}
            value={search}
            onChangeText={setSearch}
            icon={Search}
          />
        </div>
        <div className="flex gap-2 bg-bg-white p-1 rounded-lg border border-border-light overflow-x-auto max-w-full pb-1 max-sm:flex-nowrap">
          {(['All', 'Pending', 'Approved', 'Rejected'] as FilterType[]).map(f => {
            const labelMapping: Record<string, string> = {
              'All': t('tools.filter.all'), // Reusing tools 'All'
              'Pending': t('materials.stats.pending'),
              'Approved': t('materials.stats.approved'),
              'Rejected': t('materials.stats.rejected')
            };

            return (
              <button
                key={f}
                className={`px-4 py-2 border-none bg-transparent rounded-md text-sm font-semibold text-text-secondary cursor-pointer transition-all duration-150 flex items-center gap-2 whitespace-nowrap hover:bg-bg-secondary hover:text-text-primary ${currentFilter === f ? '!bg-primary !text-white shadow-[0_2px_6px_rgba(37,99,235,0.2)]' : ''}`}
                onClick={() => setCurrentFilter(f)}
              >
                {labelMapping[f]}
                <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-bg-tertiary text-text-muted ${currentFilter === f ? '!bg-white/20 !text-white' : ''}`}>
                  {f === 'All' ? stats.Total : stats[f]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="flex flex-col gap-4">
        {filteredRequests.length === 0 ? (
          <EmptyState
            icon={Package}
            title={t('materials.empty.title')}
            description={search ? t('materials.empty.filtered', { search }) : t('materials.empty.default')}
          />
        ) : (
          filteredRequests.map((req: MaterialRequest, index: number) => {
            const IconComponent = StatusIcon[req.status as keyof typeof StatusIcon] || Package;
            const isRequester = typeof req.requestedBy === 'object' && req.requestedBy._id === (user as any)?._id;
            
            let statusColorCode = '';
            let statusPillClass = '';
            if(req.status === 'Pending') {
              statusColorCode = 'bg-amber-500';
              statusPillClass = 'bg-amber-100 text-amber-700';
            } else if(req.status === 'Approved') {
              statusColorCode = 'bg-emerald-500';
              statusPillClass = 'bg-emerald-100 text-emerald-700';
            } else if(req.status === 'Rejected') {
              statusColorCode = 'bg-rose-500';
              statusPillClass = 'bg-rose-100 text-rose-700';
            }

            return (
              <Card
                key={req._id}
                className="relative overflow-hidden !p-0 animate-[fade-in-up_0.35s_ease_both] transition-all duration-150 hover:-translate-y-[2px] hover:shadow-lg"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusColorCode}`} />
                <div className="p-5 flex flex-col gap-4">
                  
                  {/* Top Row */}
                  <div className="flex justify-between items-start gap-4 pb-4 border-b border-border-light max-sm:flex-col max-sm:items-stretch">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-lg font-bold text-text-primary m-0">{req.item}</h3>
                        {req.urgency === 'High' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold py-1 px-2 rounded-full uppercase bg-red-50 text-red-600 border border-red-200"><AlertCircle size={12} /> {t('materials.card.highPriority')}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-2">
                        <span className="flex items-center gap-1.5 text-sm text-text-secondary" title={t('materials.card.project')}>
                          <Folder size={14} />
                          {getPopulatedName(req.projectId, 'nama')}
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-text-secondary" title={t('materials.card.requester')}>
                          <User size={14} />
                          {getPopulatedName(req.requestedBy, 'fullName')}
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-text-secondary" title={t('materials.card.quantity')}>
                          <Package size={14} />
                          {req.qty}
                        </span>
                      </div>
                    </div>
                    
                    <div className="max-sm:self-start max-sm:pt-2">
                      <div className={`flex items-center gap-1.5 py-1.5 px-3.5 rounded-full text-sm font-bold whitespace-nowrap ${statusPillClass}`}>
                        <IconComponent size={14} />
                        {t(`materials.stats.${req.status.toLowerCase()}`)}
                      </div>
                    </div>
                  </div>

                  {/* Middle Row Details */}
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-6 max-sm:flex-col max-sm:gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-text-muted font-semibold uppercase tracking-[0.5px]">{t('materials.card.dateNeeded')}</span>
                        <span className="text-sm font-medium text-text-primary flex items-center gap-1.5"><Calendar size={14}/> {req.dateNeeded}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-text-muted font-semibold uppercase tracking-[0.5px]">{t('materials.card.costEstimate')}</span>
                        <span className="text-sm font-medium text-text-primary flex items-center gap-1.5"><DollarSign size={14}/> {req.costEstimate && typeof req.costEstimate === 'number' && req.costEstimate > 0 ? formatRupiah(req.costEstimate) : '-'}</span>
                      </div>
                      {req.status !== 'Pending' && req.approvedBy && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-text-muted font-semibold uppercase tracking-[0.5px]">{t('materials.card.reviewedBy')}</span>
                          <span className="text-sm font-medium text-text-primary flex items-center gap-1.5"><User size={14}/> {getPopulatedName(req.approvedBy, 'fullName')}</span>
                        </div>
                      )}
                    </div>

                    {req.purpose && (
                      <div className="bg-bg-secondary rounded-sm p-3 mt-2">
                        <span className="text-xs text-text-muted font-semibold uppercase tracking-[0.5px]">{t('materials.card.purpose')}</span>
                        <p className="m-0 mt-1 text-sm text-text-secondary leading-relaxed">{req.purpose}</p>
                      </div>
                    )}

                    {req.status === 'Rejected' && req.rejectionReason && (
                      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-sm p-3 text-red-800 mt-2">
                        <AlertCircle size={16} />
                        <div>
                          <strong>{t('materials.card.rejectionReason')}</strong>
                          <p className="m-0 mt-1 text-sm leading-relaxed">{req.rejectionReason}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Admin / Requester Actions */}
                  {(isAdmin || isRequester) && (
                    <div className="flex justify-end gap-3 pt-4 border-t border-dashed border-border-light mt-2 max-sm:flex-col max-sm:[&>button]:w-full max-sm:[&>button]:justify-center">
                      {isAdmin && req.status === 'Pending' && (
                        <div className="flex gap-2 max-sm:flex-col max-sm:w-full max-sm:[&>button]:w-full max-sm:[&>button]:justify-center">
                          <Button 
                            title={t('materials.actions.approve')} 
                            size="small" 
                            variant="primary" 
                            icon={CheckCircle2} 
                            onClick={() => handleUpdateStatus(req._id!, 'Approved')}
                          />
                          <Button 
                            title={t('materials.actions.reject')} 
                            size="small" 
                            variant="danger" 
                            icon={XCircle} 
                            onClick={() => handleUpdateStatus(req._id!, 'Rejected')}
                          />
                        </div>
                      )}
                      
                      {isRequester && (req.status === 'Pending' || req.status === 'Rejected') && (
                        <Button 
                          title={t('materials.actions.delete')} 
                          size="small" 
                          variant="outline" 
                          icon={Trash2} 
                          onClick={() => handleDeleteRequest(req._id!, req.item)}
                        />
                      )}
                    </div>
                  )}

                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Add Request Modal Form */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-[1000] backdrop-blur-[4px]" onClick={() => setShowAddModal(false)}>
          <div className="bg-bg-white rounded-xl w-full max-w-[500px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-light">
              <h2 className="m-0 font-bold text-lg text-text-primary">{t('materials.modal.addTitle')}</h2>
              <button className="p-2 border-none bg-transparent cursor-pointer text-text-muted flex hover:bg-bg-secondary hover:text-text-primary rounded-md" onClick={() => setShowAddModal(false)}>
                <XCircle size={24} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-text-primary">{t('materials.modal.itemName')} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow"
                  placeholder={t('materials.modal.itemNamePlaceholder')}
                  value={formData.item}
                  onChange={e => setFormData({ ...formData, item: e.target.value })}
                />
              </div>

              <div className="flex gap-3 max-sm:flex-col">
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('materials.modal.quantity')} <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow"
                    placeholder={t('materials.modal.quantityPlaceholder')}
                    value={formData.qty}
                    onChange={e => setFormData({ ...formData, qty: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('materials.modal.dateNeeded')} <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow"
                    value={formData.dateNeeded}
                    onChange={e => setFormData({ ...formData, dateNeeded: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-3 max-sm:flex-col">
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('materials.modal.costEstimate')}</label>
                  <input
                    type="number"
                    className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow"
                    placeholder={t('materials.modal.costEstimatePlaceholder')}
                    value={formData.costEstimate}
                    onChange={e => setFormData({ ...formData, costEstimate: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('materials.modal.urgency')}</label>
                  <select
                    className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow appearance-none cursor-pointer"
                    value={formData.urgency}
                    onChange={e => setFormData({ ...formData, urgency: e.target.value as any })}
                  >
                    <option value="Low">{t('materials.modal.urgencyOptions.low')}</option>
                    <option value="Normal">{t('materials.modal.urgencyOptions.normal')}</option>
                    <option value="High">{t('materials.modal.urgencyOptions.high')}</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-text-primary">{t('materials.modal.assignProject')}</label>
                <select
                    className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow appearance-none cursor-pointer"
                    value={formData.projectId}
                    onChange={e => setFormData({ ...formData, projectId: e.target.value })}
                  >
                    <option value="">{t('materials.modal.noProject')}</option>
                    {projects.map((p: ProjectData) => (
                      <option key={p._id} value={p._id}>{p.nama || p.name}</option>
                    ))}
                  </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-text-primary">{t('materials.modal.purpose')}</label>
                <textarea
                  className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow min-h-[80px] resize-y"
                  placeholder={t('materials.modal.purposePlaceholder')}
                  value={formData.purpose}
                  onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-border-light bg-bg-secondary/50 rounded-b-xl">
              <Button title={t('materials.actions.cancel')} variant="outline" onClick={() => setShowAddModal(false)} />
              <Button title={t('materials.actions.submit')} variant="primary" onClick={handleCreateRequest} loading={submitting} />
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingId && (
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-[1000] backdrop-blur-[4px]" onClick={() => setRejectingId(null)}>
          <div className="bg-bg-white rounded-xl w-full max-w-[500px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-light">
              <h2 className="m-0 font-bold text-lg text-text-primary">{t('materials.modal.rejectTitle')}</h2>
              <button className="p-2 border-none bg-transparent cursor-pointer text-text-muted flex hover:bg-bg-secondary hover:text-text-primary rounded-md" onClick={() => setRejectingId(null)}>
                <XCircle size={24} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-text-primary">{t('materials.modal.rejectionReason')} <span className="text-red-500">*</span></label>
                <textarea
                  className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow min-h-[100px]"
                  placeholder={t('materials.modal.rejectionPlaceholder')}
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-border-light bg-bg-secondary/50 rounded-b-xl">
              <Button title={t('materials.actions.cancel')} variant="outline" onClick={() => setRejectingId(null)} />
              <Button 
                title={t('materials.actions.confirmRejection')} 
                variant="danger" 
                onClick={() => {
                  if (!rejectionReason.trim()) {
                    alert(t('materials.messages.reasonRequired'));
                    return;
                  }
                  handleUpdateStatus(rejectingId, 'Rejected', rejectionReason);
                }} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
