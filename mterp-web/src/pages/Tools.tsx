import { useState, useEffect } from 'react';
import {
  Search, Wrench, Plus, Package, MapPin, User,
  Calendar, Edit3, Trash2, X, ChevronDown, AlertTriangle,
  CheckCircle2, Settings, Archive, Camera, UserX, Warehouse
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import api, { getToolDashboard, createTool, updateTool, deleteTool } from '../api/api';
import { Card, Input, Badge, EmptyState, LoadingOverlay, Button } from '../components/shared';
import { useAuth } from '../contexts/AuthContext';
import { PhotoView } from 'react-photo-view';
import { Tool } from '../types';
import { getImageUrl } from '../utils/image';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'];

const CONDITION_CONFIG: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  'Baik': { color: '#059669', bg: '#D1FAE5', icon: CheckCircle2, label: 'Good' },
  'Maintenance': { color: '#D97706', bg: '#FEF3C7', icon: Settings, label: 'Service' },
  'Rusak': { color: '#DC2626', bg: '#FEE2E2', icon: AlertTriangle, label: 'Damaged' },
};

type FilterType = 'all' | 'Baik' | 'inUse' | 'Maintenance' | 'Rusak';

const FILTERS: { key: FilterType; label: string; icon: any }[] = [
  { key: 'all', label: 'All', icon: Package },
  { key: 'Baik', label: 'Available', icon: CheckCircle2 },
  { key: 'inUse', label: 'In Use', icon: User },
  { key: 'Maintenance', label: 'Service', icon: Settings },
  { key: 'Rusak', label: 'Damaged', icon: AlertTriangle },
];

const EMPTY_FORM = {
  nama: '', kategori: '', stok: 1, satuan: 'unit', kondisi: 'Baik', lokasi: 'Warehouse'
};

export default function Tools() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tools, setTools] = useState<Tool[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canManage = user?.role && ['owner', 'director', 'asset_admin'].includes(user.role);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const data = await getToolDashboard(search);
      setTools(data.tools || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error('Failed to fetch tools', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  // Filtered tools
  const filteredTools = tools.filter(tool => {
    if (filter === 'all') return true;
    if (filter === 'inUse') return !!tool.assignedTo;
    return tool.kondisi === filter;
  });

  const pieData = stats ? [
    { name: t('tools.filter.available'), value: stats.available || 0 },
    { name: t('tools.filter.inUse'), value: stats.inUse || 0 },
    { name: t('tools.filter.service'), value: stats.maintenance || 0 },
    { name: t('tools.filter.damaged'), value: stats.other || 0 },
  ] : [];

  const getConditionStyle = (kondisi?: string) => {
    const config = CONDITION_CONFIG[kondisi || ''];
    if (!config) {
      return { color: '#94A3B8', bg: '#F1F5F9', icon: Package, label: t('tools.condition.na') };
    }
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
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  // CRUD handlers
  const openAddModal = () => {
    setEditingTool(null);
    setFormData(EMPTY_FORM);
    setPhoto(null);
    setPhotoPreview(null);
    setShowAddModal(true);
  };

  const openEditModal = (tool: Tool) => {
    setEditingTool(tool);
    setFormData({
      nama: tool.nama,
      kategori: tool.kategori || '',
      stok: tool.stok,
      satuan: tool.satuan,
      kondisi: tool.kondisi || 'Baik',
      lokasi: tool.lokasi || '',
    });
    setPhoto(null);
    setPhotoPreview(tool.photo ? getImageUrl(tool.photo) : null);
    setShowAddModal(true);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!formData.nama.trim()) return;
    if (!editingTool && !photo) {
      alert(t('tools.messages.photoRequired'));
      return;
    }
    
    setSubmitting(true);
    try {
      const data = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        data.append(key, value.toString());
      });
      if (photo) {
        data.append('photo', photo);
      }

      if (editingTool) {
        await api.put(`/tools/${editingTool._id}`, data, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await api.post('/tools', data, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      setShowAddModal(false);
      setEditingTool(null);
      setFormData(EMPTY_FORM);
      setPhoto(null);
      setPhotoPreview(null);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || t('tools.messages.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (tool: Tool) => {
    if (!confirm(t('tools.messages.deleteConfirm', { name: tool.nama }))) return;
    try {
      await deleteTool(tool._id);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || t('tools.messages.deleteFailed'));
    }
  };

  // Filter counts
  const filterCounts: Record<FilterType, number> = {
    all: tools.length,
    Baik: tools.filter(t => t.kondisi === 'Baik' && !t.assignedTo).length,
    inUse: tools.filter(t => !!t.assignedTo).length,
    Maintenance: tools.filter(t => t.kondisi === 'Maintenance').length,
    Rusak: tools.filter(t => t.kondisi === 'Rusak').length,
  };

  return (
    <div className="p-6 max-w-[1100px] mx-auto max-lg:p-4 max-sm:p-3">
      <LoadingOverlay visible={loading} />

      {/* Header */}
      <div className="flex justify-between items-center mb-6 max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary-light rounded-md flex items-center justify-center shadow-primary shrink-0 max-sm:w-10 max-sm:h-10">
            <Wrench size={24} color="white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary m-0 max-sm:text-xl">{t('tools.title')}</h1>
            <p className="text-sm text-text-muted m-0 mt-[2px]">{t('tools.subtitle')}</p>
          </div>
        </div>
        {canManage && (
          <Button
            title={t('tools.actions.add')}
            icon={Plus}
            onClick={openAddModal}
            variant="primary"
          />
        )}
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6 max-lg:grid-cols-2 max-sm:grid-cols-2 max-sm:gap-2">
          <Card className="flex items-center gap-3 p-4 !transition-all !duration-150 hover:-translate-y-[2px] hover:shadow-lg max-sm:p-3 max-sm:gap-2">
            <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 max-sm:w-9 max-sm:h-9" style={{ backgroundColor: '#EDE9FE' }}>
              <Package size={20} color="#7C3AED" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-text-primary leading-[1.2] max-sm:text-lg">{stats.total || 0}</span>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px]">{t('tools.stats.total')}</span>
            </div>
          </Card>

          <Card className="flex items-center gap-3 p-4 !transition-all !duration-150 hover:-translate-y-[2px] hover:shadow-lg max-sm:p-3 max-sm:gap-2">
            <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 max-sm:w-9 max-sm:h-9" style={{ backgroundColor: '#D1FAE5' }}>
              <CheckCircle2 size={20} color="#059669" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-text-primary leading-[1.2] max-sm:text-lg" style={{ color: '#059669' }}>{stats.available || 0}</span>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px]">{t('tools.stats.available')}</span>
            </div>
          </Card>

          <Card className="flex items-center gap-3 p-4 !transition-all !duration-150 hover:-translate-y-[2px] hover:shadow-lg max-sm:p-3 max-sm:gap-2">
            <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 max-sm:w-9 max-sm:h-9" style={{ backgroundColor: '#DBEAFE' }}>
              <User size={20} color="#2563EB" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-text-primary leading-[1.2] max-sm:text-lg" style={{ color: '#2563EB' }}>{stats.inUse || 0}</span>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px]">{t('tools.stats.inUse')}</span>
            </div>
          </Card>

          <Card className="flex items-center gap-3 p-4 !transition-all !duration-150 hover:-translate-y-[2px] hover:shadow-lg max-sm:p-3 max-sm:gap-2">
            <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 max-sm:w-9 max-sm:h-9" style={{ backgroundColor: '#FEF3C7' }}>
              <AlertTriangle size={20} color="#D97706" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-text-primary leading-[1.2] max-sm:text-lg" style={{ color: '#D97706' }}>{(stats.maintenance || 0) + (stats.other || 0)}</span>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px]">{t('tools.stats.needsAttention')}</span>
            </div>
          </Card>
        </div>
      )}

      {/* Search + Filters Row */}
      <div className="flex flex-col gap-3 mb-5">
        <Input
          placeholder={t('tools.searchPlaceholder')}
          value={search}
          onChangeText={setSearch}
          icon={Search}
          style={{ flex: 1 }}
        />
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar max-sm:gap-1">
          {FILTERS.map(f => {
            const Icon = f.icon;
            const filterLabelMapping: Record<string, string> = {
              'All': t('tools.filter.all'),
              'Available': t('tools.filter.available'),
              'In Use': t('tools.filter.inUse'),
              'Service': t('tools.filter.service'),
              'Damaged': t('tools.filter.damaged'),
            };
            return (
              <button
                key={f.key}
                className={`flex items-center gap-[6px] py-2 px-3.5 border border-border rounded-full bg-bg-white text-text-secondary text-sm font-semibold cursor-pointer whitespace-nowrap transition-all duration-150 hover:border-primary-light hover:text-primary hover:bg-primary-bg max-sm:py-1.5 max-sm:px-2.5 max-sm:text-xs ${filter === f.key ? '!bg-primary !text-white !border-primary hover:!bg-primary-light hover:!border-primary-light' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                <Icon size={14} />
                <span>{filterLabelMapping[f.label]}</span>
                <span className={`py-[1px] px-[7px] rounded-full text-xs font-bold ${filter === f.key ? 'bg-white/25' : 'bg-black/10'}`}>{filterCounts[f.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content: Chart + List */}
      <div className="flex gap-5 items-start max-lg:flex-col">
        {/* Donut Chart Side Panel */}
        {stats && (stats.total || 0) > 0 && (
          <Card className="w-[260px] shrink-0 p-5 sticky top-4 max-lg:w-full max-lg:static">
            <h3 className="text-base font-bold text-text-primary m-0 mb-3">{t('tools.overview')}</h3>
            <div className="mx-auto max-lg:max-w-[220px]">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-white)',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      boxShadow: 'var(--shadow-md)',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2 pt-3 border-t border-border-light mt-3 max-sm:flex-row max-sm:flex-wrap max-sm:gap-3">
              {pieData.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 max-sm:min-w-[calc(50%-0.5rem)]">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-sm text-text-secondary flex-1">{entry.name}</span>
                  <span className="text-sm font-bold text-text-primary">{entry.value}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Tool List */}
        <div className="flex-1 min-w-0">
          {filteredTools.length === 0 && !loading ? (
            <EmptyState
              icon={Wrench}
              title={t('tools.empty.title')}
              description={filter !== 'all'
                ? t('tools.empty.filtered')
                : t('tools.empty.default')}
            />
          ) : (
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
                      <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-border-light max-sm:w-full max-sm:h-40">
                        {tool.photo ? (
                          <PhotoView src={getImageUrl(tool.photo)}>
                            <img 
                              src={getImageUrl(tool.photo)} 
                              alt={tool.nama} 
                              className="w-full h-full object-cover cursor-pointer"
                            />
                          </PhotoView>
                        ) : (
                          <div className="w-full h-full bg-bg-secondary flex items-center justify-center">
                            <Wrench size={24} className="text-text-muted" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="text-base font-bold text-text-primary m-0">{tool.nama}</h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            {tool.kategori && (
                              <span className="text-xs font-semibold text-text-secondary bg-bg-secondary py-[2px] px-2 rounded-full">{tool.kategori}</span>
                            )}
                            <span
                              className="text-xs font-bold py-[2px] px-2 rounded-full flex items-center gap-1"
                              style={{ backgroundColor: condStyle.bg, color: condStyle.color }}
                            >
                              <CondIcon size={12} />
                              {condStyle.label}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <span className="flex items-center gap-1 text-sm text-text-muted whitespace-nowrap">
                            <Archive size={13} />
                            {tool.stok} {tool.satuan}
                          </span>
                          {tool.lokasi && (
                            <span className="flex items-center gap-1 text-sm text-text-muted whitespace-nowrap">
                              <MapPin size={13} />
                              {tool.lokasi}
                            </span>
                          )}
                          {tool.assignedTo && (
                            <span className="flex items-center gap-1 text-sm whitespace-nowrap !text-primary font-medium">
                              <User size={13} />
                              {tool.assignedTo.fullName}
                            </span>
                          )}
                          {tool.projectId && (
                            <span className="flex items-center gap-1 text-sm whitespace-nowrap !text-info font-medium">
                              <Package size={13} />
                              {tool.projectId.nama}
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

                      {canManage && (
                        <div className="flex gap-2 opacity-0 transition-opacity duration-150 shrink-0 group-hover:opacity-100 max-sm:opacity-100 max-sm:flex-row max-sm:w-full [&>button]:max-sm:flex-1">
                          <button className="w-[34px] h-[34px] rounded-sm border border-border bg-bg-white flex items-center justify-center cursor-pointer text-text-muted transition-all duration-150 hover:!text-primary hover:!border-primary hover:!bg-primary-bg" onClick={() => openEditModal(tool)} title={t('tools.actions.edit')}>
                            <Edit3 size={16} />
                          </button>
                          <button className="w-[34px] h-[34px] rounded-sm border border-border bg-bg-white flex items-center justify-center cursor-pointer text-text-muted transition-all duration-150 hover:!text-danger hover:!border-danger hover:!bg-danger-bg" onClick={() => handleDelete(tool)} title={t('tools.actions.delete')}>
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
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-[1000] backdrop-blur-[4px]" onClick={() => { setShowAddModal(false); setEditingTool(null); }}>
          <div className="bg-bg-white rounded-xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-light">
              <h2 className="m-0 font-bold text-lg text-text-primary">{editingTool ? t('tools.modal.editTitle') : t('tools.modal.addTitle')}</h2>
              <button className="p-2 border-none bg-transparent cursor-pointer text-text-muted rounded-md flex hover:bg-bg-secondary hover:text-text-primary" onClick={() => { setShowAddModal(false); setEditingTool(null); }}>
                <X size={24} />
              </button>
            </div>

            <div className="p-5">
              {/* Photo Upload Area */}
              <div className="flex flex-col items-center mb-6">
                <div 
                  className="relative w-32 h-32 rounded-xl border-2 border-dashed border-border-light overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => document.getElementById('tool-photo-input')?.click()}
                >
                  {photoPreview ? (
                    <PhotoView src={photoPreview}>
                      <img src={photoPreview} alt="Preview" className="w-full h-full object-cover cursor-pointer" />
                    </PhotoView>
                  ) : (
                    <div className="flex flex-col items-center text-text-muted">
                      <Camera size={28} />
                      <span className="text-[10px] font-bold uppercase mt-1">Upload Photo</span>
                    </div>
                  )}
                </div>
                {!editingTool && !photo && (
                  <span className="text-[10px] text-danger font-bold uppercase mt-1">* Required</span>
                )}
                <input 
                  id="tool-photo-input"
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handlePhotoChange}
                />
              </div>

              <div className="flex flex-col gap-2 mb-4">
                <label className="text-sm font-semibold text-text-primary">{t('tools.modal.name')}</label>
                <input
                  className="w-full p-3 px-4 border border-border rounded-md text-base text-text-primary bg-bg-white transition-all duration-150 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 placeholder:text-text-muted"
                  value={formData.nama}
                  onChange={e => setFormData(p => ({ ...p, nama: e.target.value }))}
                  placeholder={t('tools.modal.namePlaceholder')}
                />
              </div>

              <div className="flex gap-3 max-sm:flex-col mb-4">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('tools.modal.category')}</label>
                  <input
                    className="w-full p-3 px-4 border border-border rounded-md text-base text-text-primary bg-bg-white transition-all duration-150 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 placeholder:text-text-muted"
                    value={formData.kategori}
                    onChange={e => setFormData(p => ({ ...p, kategori: e.target.value }))}
                    placeholder={t('tools.modal.categoryPlaceholder')}
                  />
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('tools.modal.location')}</label>
                  <input
                    className="w-full p-3 px-4 border border-border rounded-md text-base text-text-primary bg-bg-white transition-all duration-150 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 placeholder:text-text-muted"
                    value={formData.lokasi}
                    onChange={e => setFormData(p => ({ ...p, lokasi: e.target.value }))}
                    placeholder={t('tools.modal.locationPlaceholder')}
                  />
                </div>
              </div>

              <div className="flex gap-3 max-sm:flex-col mb-4">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('tools.modal.stock')}</label>
                  <input
                    className="w-full p-3 px-4 border border-border rounded-md text-base text-text-primary bg-bg-white transition-all duration-150 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 placeholder:text-text-muted"
                    type="number"
                    min="0"
                    value={formData.stok}
                    onChange={e => setFormData(p => ({ ...p, stok: Number(e.target.value) }))}
                  />
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-sm font-semibold text-text-primary">{t('tools.modal.unit')}</label>
                  <input
                    className="w-full p-3 px-4 border border-border rounded-md text-base text-text-primary bg-bg-white transition-all duration-150 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 placeholder:text-text-muted"
                    value={formData.satuan}
                    onChange={e => setFormData(p => ({ ...p, satuan: e.target.value }))}
                    placeholder={t('tools.modal.unitPlaceholder')}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-4">
                <label className="text-sm font-semibold text-text-primary">{t('tools.modal.condition')}</label>
                <div className="flex gap-2 max-sm:flex-col">
                  {(['Baik', 'Maintenance', 'Rusak'] as const).map(k => {
                    const cfg = CONDITION_CONFIG[k];
                    const isActive = formData.kondisi === k;
                    const Icon = cfg.icon;
                    const labelMapping: Record<string, string> = {
                      'Good': t('tools.condition.good'),
                      'Service': t('tools.condition.service'),
                      'Damaged': t('tools.condition.damaged')
                    };
                    const translatedLabel = labelMapping[cfg.label];
                    return (
                      <button
                        key={k}
                        className={`flex-1 flex items-center justify-center gap-[6px] p-3 border-[1.5px] border-border rounded-md bg-bg-white text-text-secondary text-sm font-semibold cursor-pointer transition-all duration-150 hover:border-text-muted ${isActive ? '!font-bold' : ''}`}
                        style={isActive ? { backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.color } : {}}
                        onClick={() => setFormData(p => ({ ...p, kondisi: k }))}
                        type="button"
                      >
                        <Icon size={14} />
                        {translatedLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-border-light">
              <Button
                title={t('tools.actions.cancel')}
                onClick={() => { setShowAddModal(false); setEditingTool(null); }}
                variant="outline"
              />
              <Button
                title={editingTool ? t('tools.actions.saveChanges') : t('tools.actions.add')}
                onClick={handleSave}
                loading={submitting}
                variant="primary"
                disabled={!formData.nama.trim() || (!editingTool && !photo)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
