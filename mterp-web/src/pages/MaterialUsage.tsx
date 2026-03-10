import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Package, Search, DollarSign, Calendar, Plus, Send, Clock, User, FileText
} from 'lucide-react';
import api from '../api/api';
import { Card, Input, Button, Alert, EmptyState, LoadingOverlay, CostInput } from '../components/shared';
import { ProjectData } from '../types';

interface Supply {
  _id: string;
  item: string;
  qty: number;
  unit: string;
  cost: number;
  actualCost: number;
  totalQtyUsed: number;
  status: 'Pending' | 'Ordered' | 'Delivered';
}

interface MaterialLog {
  _id: string;
  supplyId: { _id: string; item: string; unit: string; qty: number; totalQtyUsed: number } | null;
  date: string;
  qtyUsed: number;
  qtyLeft: number;
  notes: string;
  recordedBy: { fullName: string } | null;
  createdAt: string;
}

export default function MaterialUsage() {
  const { t } = useTranslation();
  const { id: projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectData | null>(null);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [logs, setLogs] = useState<MaterialLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [alertData, setAlertData] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string }>({
    visible: false, type: 'success', title: '', message: '',
  });

  // Form state
  const [formData, setFormData] = useState({
    supplyId: '',
    qtyUsed: '',
    notes: '',
    date: (() => {
      const d = new Date();
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().split('T')[0];
    })(),
  });

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      const [projectRes, suppliesRes, logsRes] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/supplies`),
        api.get(`/projects/${projectId}/material-logs`),
      ]);
      setProject(projectRes.data);
      setSupplies(suppliesRes.data || []);
      setLogs(logsRes.data || []);
    } catch (err: any) {
      console.error('Failed to fetch material usage', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.supplyId || !formData.qtyUsed || Number(formData.qtyUsed) <= 0) {
      setAlertData({ visible: true, type: 'error', title: 'Error', message: 'Please select a material and enter a valid quantity.' });
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/projects/${projectId}/material-logs`, {
        supplyId: formData.supplyId,
        qtyUsed: Number(formData.qtyUsed),
        notes: formData.notes,
        date: formData.date,
      });

      setAlertData({ visible: true, type: 'success', title: 'Success', message: 'Material usage logged successfully!' });
      setFormData({ ...formData, supplyId: '', qtyUsed: '', notes: '' });
      setShowForm(false);
      fetchData(); // Refresh data
    } catch (err: any) {
      console.error('Failed to log material usage', err);
      setAlertData({ visible: true, type: 'error', title: 'Error', message: err.response?.data?.msg || 'Failed to log usage.' });
    } finally {
      setSubmitting(false);
    }
  };

  const formatRupiah = (num: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  // Derived stats
  const totalPlannedQty = supplies.reduce((sum, s) => sum + (s.qty || 0), 0);
  const totalUsedQty = supplies.reduce((sum, s) => sum + (s.totalQtyUsed || 0), 0);
  const totalPlannedCost = supplies.reduce((sum, s) => sum + (s.cost || 0), 0);
  const totalActualCost = supplies.reduce((sum, s) => sum + (s.actualCost || 0), 0);

  const filteredLogs = logs.filter(log =>
    (log.supplyId?.item || '').toLowerCase().includes(search.toLowerCase()) ||
    (log.notes || '').toLowerCase().includes(search.toLowerCase())
  );

  const selectedSupply = supplies.find(s => s._id === formData.supplyId);

  if (loading) {
    return <div className="p-6 max-w-[1000px] mx-auto max-sm:p-3"><LoadingOverlay visible={true} /></div>;
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto max-sm:p-3">
      <Alert
        visible={alertData.visible}
        type={alertData.type}
        title={alertData.title}
        message={alertData.message}
        onClose={() => setAlertData({ ...alertData, visible: false })}
      />

      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <button className="w-10 h-10 rounded-lg flex items-center justify-center bg-bg-secondary text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer border-none shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-extrabold text-text-primary m-0 mb-1 tracking-tight">Material Usage</h1>
          <p className="text-sm text-text-muted m-0">{project?.nama || 'Project'}</p>
        </div>
        <div className="max-sm:w-full [&>button]:max-sm:w-full">
          <Button
            title={showForm ? 'Cancel' : 'Log Usage'}
            icon={showForm ? ArrowLeft : Plus}
            onClick={() => setShowForm(!showForm)}
            variant={showForm ? 'outline' : 'primary'}
            size="small"
          />
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6 max-lg:grid-cols-1">
        <div className="bg-bg-white border border-border-light rounded-lg p-4 flex gap-4 items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-violet-300">
          <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90 bg-violet-100 text-violet-700">
            <Package size={20} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-2xl font-extrabold leading-tight text-text-primary">{supplies.length}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Materials</span>
          </div>
        </div>
        <div className="bg-bg-white border border-border-light rounded-lg p-4 flex gap-4 items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-amber-300">
          <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90 bg-amber-100 text-amber-600">
            <FileText size={20} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-2xl font-extrabold leading-tight text-text-primary">{logs.length}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Usage Logs</span>
          </div>
        </div>
        <div className="bg-bg-white border border-border-light rounded-lg p-4 flex gap-4 items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-blue-300">
          <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90 bg-blue-100 text-blue-600">
            <Package size={20} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-2xl font-extrabold leading-tight text-text-primary">{totalUsedQty}/{totalPlannedQty}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Total Qty Used</span>
          </div>
        </div>
      </div>

      {/* Log Usage Form */}
      {showForm && (
        <Card className="relative overflow-hidden !p-0 mb-5 border-l-4 border-l-violet-600 shadow-sm animate-[fade-in-up_0.35s_ease_both]">
          <div className="p-5">
            <h3 className="flex items-center m-0 mb-4 text-[1.05rem] text-slate-800">
              <Plus size={18} className="mr-2" />
              Log Material Usage
            </h3>

            {/* Date */}
            <div className="mb-3.5">
              <label className="block text-[0.85rem] text-slate-500 mb-1 font-medium">Date</label>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-500 transition-all">
                <Calendar size={16} className="text-slate-500 mr-2" />
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData({ ...formData, date: e.target.value })}
                  className="border-none bg-transparent outline-none w-full text-[0.95rem] text-slate-800"
                />
              </div>
            </div>

            {/* Select Material */}
            <div className="mb-3.5">
              <label className="block text-[0.85rem] text-slate-500 mb-1 font-medium">Material</label>
              <select
                value={formData.supplyId}
                onChange={e => setFormData({ ...formData, supplyId: e.target.value })}
                className="w-full py-2.5 px-3 rounded-lg border border-slate-200 bg-slate-50 text-[0.95rem] text-slate-800 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all appearance-none"
              >
                <option value="">-- Select Material --</option>
                {supplies.map(s => (
                  <option key={s._id} value={s._id}>
                    {s.item} ({s.qty - (s.totalQtyUsed || 0)} {s.unit} remaining)
                  </option>
                ))}
              </select>
            </div>

            {/* Qty Used */}
            {selectedSupply && (
              <div className="mb-3.5">
                <label className="block text-[0.85rem] text-slate-500 mb-1 font-medium">
                  Qty Used ({selectedSupply.unit}) — {selectedSupply.qty - (selectedSupply.totalQtyUsed || 0)} remaining
                </label>
                <input
                  type="number"
                  min="0"
                  max={selectedSupply.qty - (selectedSupply.totalQtyUsed || 0)}
                  placeholder="e.g. 3"
                  value={formData.qtyUsed}
                  onChange={e => setFormData({ ...formData, qtyUsed: e.target.value })}
                  className="w-full py-2.5 px-3 rounded-lg border border-slate-200 bg-slate-50 text-[0.95rem] text-slate-800 outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
                />
              </div>
            )}

            {/* Notes */}
            <Input
              label="Usage Notes"
              placeholder="e.g. Used by Worker for foundation work"
              value={formData.notes}
              onChangeText={v => setFormData({ ...formData, notes: v })}
              multiline
            />

            {/* Submit */}
            <div className="mt-4 flex justify-end">
              <Button
                title="Log Usage"
                icon={Send}
                onClick={handleSubmit}
                loading={submitting}
                variant="success"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Search */}
      {logs.length > 0 && (
        <div className="mb-5">
          <Input
            placeholder="Search usage logs..."
            value={search}
            onChangeText={setSearch}
            icon={Search}
          />
        </div>
      )}

      {/* Supply Overview Cards */}
      {supplies.length > 0 && (
        <>
          <h3 className="text-base text-slate-600 mb-3 font-semibold">📦 Supply Inventory</h3>
          <div className="flex flex-col gap-4 mb-6">
            {supplies.map((supply) => {
              const remaining = supply.qty - (supply.totalQtyUsed || 0);
              const usagePercent = supply.qty > 0 ? Math.round((supply.totalQtyUsed || 0) / supply.qty * 100) : 0;
              const isLow = remaining <= 0;
              
              const borderLeftColorClass = isLow ? 'border-l-red-500' : usagePercent > 75 ? 'border-l-amber-500' : 'border-l-emerald-500';
              const iconBgClass = isLow ? 'bg-red-100' : 'bg-emerald-100';
              const iconColor = isLow ? '#EF4444' : '#10B981';

              return (
                <Card
                  key={supply._id}
                  className={`relative overflow-hidden !p-0 border-l-4 ${borderLeftColorClass} shadow-sm transition-all duration-150 hover:-translate-y-[2px] hover:shadow-md`}
                >
                  <div className="p-4 flex gap-4 items-center pl-5 max-sm:flex-col max-sm:items-start max-sm:p-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconBgClass}`}>
                      <Package size={20} color={iconColor} />
                    </div>
                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                        <h3 className="text-base font-bold text-slate-800 m-0 leading-tight block w-full">{supply.item}</h3>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-2">
                        <span className="flex items-center gap-1.5 text-sm text-slate-600">
                          <Package size={14} /> Used: <strong>{supply.totalQtyUsed || 0}</strong> / {supply.qty} {supply.unit}
                        </span>
                        <span className={`text-sm font-semibold ${isLow ? 'text-red-500' : 'text-emerald-600'}`}>
                          Remaining: {remaining} {supply.unit}
                        </span>
                      </div>
                      {/* Usage Progress Bar */}
                      <div className="mt-2.5 bg-slate-200 rounded overflow-hidden">
                        <div 
                          className={`rounded transition-all duration-500 ease-out`}
                          style={{
                            width: `${Math.min(usagePercent, 100)}%`,
                            backgroundColor: isLow ? '#EF4444' : usagePercent > 75 ? '#F59E0B' : '#10B981',
                            height: '6px'
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Usage History */}
      <h3 className="text-base text-slate-600 mb-3 font-semibold">📝 Usage History</h3>

      {filteredLogs.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No Usage Logs Yet"
          description="Click 'Log Usage' above to record material usage for this project."
        />
      )}

      {filteredLogs.length > 0 && (
        <div className="flex flex-col gap-3">
          {filteredLogs.map((log, index) => (
            <Card
              key={log._id}
              className="relative overflow-hidden !p-0 border-l-4 border-l-violet-600 shadow-sm transition-all duration-150 animate-[fade-in-up_0.35s_ease_both]"
              style={{ animationDelay: `${index * 0.03}s` }}
            >
              <div className="p-4 flex gap-4 items-start pl-5 max-sm:flex-col max-sm:p-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-violet-100 hidden sm:flex">
                  <Package size={20} color="#7C3AED" />
                </div>
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                    <h3 className="text-base font-bold text-slate-800 m-0 block">
                      {log.supplyId?.item || 'Unknown Material'}
                    </h3>
                    <span className="text-xs text-slate-500 flex items-center">
                      <Calendar size={12} className="mr-1" />
                      {formatDate(log.date)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm bg-slate-50 py-1.5 px-2.5 rounded border border-slate-100 mb-2">
                    <span className="font-semibold text-violet-600">
                      -{log.qtyUsed} {log.supplyId?.unit || ''}
                    </span>
                    <span className="text-emerald-600 font-medium">
                      Left: {log.qtyLeft} {log.supplyId?.unit || ''}
                    </span>
                    {log.recordedBy && (
                      <span className="flex items-center text-slate-600">
                        <User size={13} className="mr-1 opacity-70" /> {log.recordedBy.fullName}
                      </span>
                    )}
                  </div>
                  {log.notes && (
                    <p className="m-0 text-sm text-slate-600 italic bg-slate-50 border-l-2 border-slate-300 pl-3 py-1">
                      "{log.notes}"
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
