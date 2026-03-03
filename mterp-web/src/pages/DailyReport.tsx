import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Save, Cloud, Users, Package, ChevronDown, Layers, ArrowLeft, Truck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { Card, Button, Input, Alert, Badge, CostInput } from '../components/shared';
import './DailyReport.css';

interface ProjectOption {
  _id: string;
  nama: string;
  lokasi: string;
  progress: number;
}

interface WorkItemUpdate {
  workItemId: string;
  name: string;
  qty: number;
  unit: string;
  cost: number;
  currentProgress: number;
  newProgress: number;
  actualCost: number;
}

interface SupplyUpdate {
  supplyId: string;
  item: string;
  qty: number;
  unit: string;
  cost: number;
  currentStatus: string;
  newStatus: string;
  actualCost: number;
}

const SUPPLY_STATUSES = ['Pending', 'Ordered', 'Delivered'] as const;
const STATUS_PROGRESS: Record<string, number> = { 'Pending': 0, 'Ordered': 50, 'Delivered': 100 };

const formatRupiah = (num: number) => new Intl.NumberFormat('id-ID').format(num);

export default function DailyReport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get('projectId');

  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(preselectedId || '');
  const [selectedProjectName, setSelectedProjectName] = useState('');
  const [workItemUpdates, setWorkItemUpdates] = useState<WorkItemUpdate[]>([]);
  const [supplyUpdates, setSupplyUpdates] = useState<SupplyUpdate[]>([]);
  const [loadingProject, setLoadingProject] = useState(false);

  const [alertData, setAlertData] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string }>({
    visible: false,
    type: 'success',
    title: '',
    message: '',
  });

  const [formData, setFormData] = useState({
    weather: 'Cerah',
    materials: '',
    workforce: '',
    notes: '',
  });

  // Fetch all projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await api.get('/projects');
        setProjects(res.data);
      } catch (err) {
        console.error('Failed to fetch projects', err);
      }
    };
    fetchProjects();
  }, []);

  // When a project is selected, fetch its work items + supplies
  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectData(selectedProjectId);
    } else {
      setWorkItemUpdates([]);
      setSupplyUpdates([]);
      setSelectedProjectName('');
    }
  }, [selectedProjectId]);

  const fetchProjectData = async (pid: string) => {
    setLoadingProject(true);
    try {
      const [projectRes, suppliesRes] = await Promise.all([
        api.get(`/projects/${pid}`),
        api.get(`/projects/${pid}/supplies`),
      ]);
      const project = projectRes.data;
      const suppliesData = suppliesRes.data;
      setSelectedProjectName(project.nama || project.name || '');
      
      const items: WorkItemUpdate[] = (project.workItems || []).map((item: any) => ({
        workItemId: item._id,
        name: item.name,
        qty: item.qty || 0,
        unit: item.unit || item.volume || '-',
        cost: item.cost || 0,
        currentProgress: item.progress || 0,
        newProgress: item.progress || 0,
        actualCost: item.actualCost || 0,
      }));
      setWorkItemUpdates(items);

      const supplies: SupplyUpdate[] = (suppliesData || []).map((s: any) => ({
        supplyId: s._id,
        item: s.item,
        qty: s.qty || 0,
        unit: s.unit || '-',
        cost: s.cost || 0,
        currentStatus: s.status || 'Pending',
        newStatus: s.status || 'Pending',
        actualCost: s.actualCost || 0,
      }));
      setSupplyUpdates(supplies);
    } catch (err) {
      console.error('Failed to fetch project details', err);
    } finally {
      setLoadingProject(false);
    }
  };

  const updateItemProgress = (index: number, value: number) => {
    const updated = [...workItemUpdates];
    updated[index].newProgress = Math.min(100, Math.max(0, value));
    setWorkItemUpdates(updated);
  };

  const updateItemActualCost = (index: number, value: number) => {
    const updated = [...workItemUpdates];
    updated[index].actualCost = value;
    setWorkItemUpdates(updated);
  };

  const updateSupplyStatus = (index: number, status: string) => {
    const updated = [...supplyUpdates];
    updated[index].newStatus = status;
    setSupplyUpdates(updated);
  };

  const updateSupplyActualCost = (index: number, value: number) => {
    const updated = [...supplyUpdates];
    updated[index].actualCost = value;
    setSupplyUpdates(updated);
  };

  // Calculate computed overall progress (work items + supplies, cost-weighted)
  const allCosts = [
    ...workItemUpdates.map(w => ({ cost: w.cost, progress: w.newProgress })),
    ...supplyUpdates.map(s => ({ cost: s.cost, progress: STATUS_PROGRESS[s.newStatus] || 0 })),
  ];
  const totalCost = allCosts.reduce((s, i) => s + (i.cost || 0), 0);
  const computedProgress = totalCost > 0
    ? Math.round(allCosts.reduce((s, i) => s + ((i.cost || 0) / totalCost) * i.progress, 0))
    : 0;

  const handleSubmit = async () => {
    if (!selectedProjectId) {
      setAlertData({ visible: true, type: 'error', title: t('dailyReport.messages.error'), message: t('dailyReport.messages.selectProject') });
      return;
    }

    setLoading(true);
    try {
      await api.post(`/projects/${selectedProjectId}/daily-report`, {
        workItemUpdates: workItemUpdates.map(w => ({
          workItemId: w.workItemId,
          newProgress: w.newProgress,
          actualCost: w.actualCost,
        })),
        supplyUpdates: supplyUpdates.map(s => ({
          supplyId: s.supplyId,
          newStatus: s.newStatus,
          actualCost: s.actualCost,
        })),
        weather: formData.weather,
        materials: formData.materials,
        workforce: formData.workforce,
        notes: formData.notes,
        date: new Date().toISOString().split('T')[0],
      });

      setAlertData({
        visible: true,
        type: 'success',
        title: t('dailyReport.messages.submitSuccess'),
        message: t('dailyReport.messages.submitSuccessDesc', { progress: computedProgress }),
      });

      setTimeout(() => navigate(-1), 1500);
    } catch (err) {
      console.error('Failed to submit report', err);
      setAlertData({ visible: true, type: 'error', title: t('dailyReport.messages.submitFailed'), message: t('dailyReport.messages.submitFailedDesc') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="report-container">
      <Alert
        visible={alertData.visible}
        type={alertData.type}
        title={alertData.title}
        message={alertData.message}
        onClose={() => setAlertData({ ...alertData, visible: false })}
      />

      {/* Header */}
      <div className="report-header">
        <div className="report-header-left">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="report-title">{t('dailyReport.title')}</h1>
            <span className="report-date">{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Project Selector */}
      <Card className="report-card">
        <h3 className="card-title">
          <Layers size={18} /> {t('dailyReport.projectSelector.title')}
        </h3>
        <div className="project-selector-wrapper">
          <select
            className="project-selector"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            <option value="">{t('dailyReport.projectSelector.placeholder')}</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.nama} — {p.lokasi}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="selector-chevron" />
        </div>
        {selectedProjectName && (
          <div className="selected-project-info">
            <span className="selected-project-name">{selectedProjectName}</span>
            <Badge label={t('dailyReport.projectSelector.progress', { progress: computedProgress })} variant="primary" size="small" />
          </div>
        )}
      </Card>

      {/* Loading */}
      {loadingProject && <p className="loading-text">{t('dailyReport.loadingProject')}</p>}

      {/* Work Item Progress */}
      {!loadingProject && workItemUpdates.length > 0 && (
        <Card className="report-card">
          <h3 className="card-title">
            <Layers size={18} /> {t('dailyReport.workItem.title')}
          </h3>
          <div className="work-items-list">
            {workItemUpdates.map((item, i) => {
              const changed = item.newProgress !== item.currentProgress;
              const weight = totalCost > 0 ? ((item.cost / totalCost) * 100).toFixed(1) : '0';
              return (
                <div key={item.workItemId} className={`work-item-row ${changed ? 'changed' : ''}`}>
                  <div className="work-item-info">
                    <span className="work-item-name">{item.name}</span>
                    <div className="work-item-meta">
                      <Badge label={`${weight}%`} variant="neutral" size="small" />
                      <span className="work-item-detail">{item.qty} {item.unit} · Rp {formatRupiah(item.cost)}</span>
                    </div>
                  </div>
                  <div className="work-item-controls">
                    <div className="progress-slider-group">
                      <label className="slider-label">{t('dailyReport.workItem.progress')}</label>
                      <div className="slider-row">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={item.newProgress}
                          onChange={(e) => updateItemProgress(i, Number(e.target.value))}
                          className="progress-slider"
                        />
                        <span className={`slider-value ${changed ? 'value-changed' : ''}`}>
                          {item.newProgress}%
                        </span>
                      </div>
                      {changed && (
                        <span className="progress-diff">
                          {item.currentProgress}% → {item.newProgress}%
                        </span>
                      )}
                    </div>
                    <div className="actual-cost-group">
                      <CostInput
                        label={t('dailyReport.workItem.actualCost')}
                        value={item.actualCost}
                        onChange={(v) => updateItemActualCost(i, v)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Supply Plan Updates */}
      {!loadingProject && supplyUpdates.length > 0 && (
        <Card className="report-card">
          <h3 className="card-title">
            <Truck size={18} /> {t('dailyReport.supplyPlan.title')}
          </h3>
          <div className="work-items-list">
            {supplyUpdates.map((supply, i) => {
              const changed = supply.newStatus !== supply.currentStatus;
              const weight = totalCost > 0 ? ((supply.cost / totalCost) * 100).toFixed(1) : '0';
              return (
                <div key={supply.supplyId} className={`work-item-row ${changed ? 'changed' : ''}`}>
                  <div className="work-item-info">
                    <span className="work-item-name">{supply.item}</span>
                    <div className="work-item-meta">
                      <Badge label={`${weight}%`} variant="neutral" size="small" />
                      <span className="work-item-detail">{supply.qty} {supply.unit} · Rp {formatRupiah(supply.cost)}</span>
                    </div>
                  </div>
                  <div className="supply-status-controls">
                    <label className="slider-label">{t('dailyReport.supplyPlan.status')}</label>
                    <div className="supply-status-btns">
                      {SUPPLY_STATUSES.map((status) => (
                        <button
                          key={status}
                          className={`supply-status-btn ${supply.newStatus === status ? 'active' : ''} status-${status.toLowerCase()}`}
                          onClick={() => updateSupplyStatus(i, status)}
                        >
                          {status === 'Pending' ? '⏳' : status === 'Ordered' ? '📦' : '✅'} {t(`dailyReport.status.${status.toLowerCase()}`)}
                        </button>
                      ))}
                    </div>
                    {changed && (
                      <span className="progress-diff">
                        {supply.currentStatus} → {supply.newStatus}
                      </span>
                    )}
                    <div className="actual-cost-group">
                      <CostInput
                        label={t('dailyReport.supplyPlan.actualCost')}
                        value={supply.actualCost}
                        onChange={(v) => updateSupplyActualCost(i, v)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!loadingProject && selectedProjectId && workItemUpdates.length === 0 && supplyUpdates.length === 0 && (
        <Card className="report-card">
          <p className="empty-text">{t('dailyReport.emptyProject')}</p>
        </Card>
      )}

      {/* Weather */}
      <Card className="report-card">
        <h3 className="card-title">
          <Cloud size={18} /> {t('dailyReport.weather.title')}
        </h3>
        <div className="weather-options">
          {['Cerah', 'Berawan', 'Hujan'].map((w) => {
            const getIcon = (weather: string) => {
              if (weather === 'Cerah') return '☀️';
              if (weather === 'Berawan') return '⛅';
              return '🌧️';
            }
            const getTranslationValue = (weather: string) => {
              if (weather === 'Cerah') return t('dailyReport.weather.options.sunny');
              if (weather === 'Berawan') return t('dailyReport.weather.options.cloudy');
              return t('dailyReport.weather.options.rainy');
            }
            return (
              <button
                key={w}
                className={`weather-btn ${formData.weather === w ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, weather: w })}
              >
                {getIcon(w)} {getTranslationValue(w)}
              </button>
            )
          })}
        </div>
      </Card>

      {/* Materials */}
      <Card className="report-card">
        <h3 className="card-title">
          <Package size={18} /> {t('dailyReport.materials.title')}
        </h3>
        <Input
          placeholder={t('dailyReport.materials.placeholder')}
          value={formData.materials}
          onChangeText={(tVal) => setFormData({ ...formData, materials: tVal })}
          multiline
          numberOfLines={3}
        />
      </Card>

      {/* Workforce */}
      <Card className="report-card">
        <h3 className="card-title">
          <Users size={18} /> {t('dailyReport.workforce.title')}
        </h3>
        <Input
          placeholder={t('dailyReport.workforce.placeholder')}
          value={formData.workforce}
          onChangeText={(tVal) => setFormData({ ...formData, workforce: tVal })}
          multiline
          numberOfLines={3}
        />
      </Card>

      {/* Notes */}
      <Card className="report-card">
        <h3 className="card-title">{t('dailyReport.notes.title')}</h3>
        <Input
          placeholder={t('dailyReport.notes.placeholder')}
          value={formData.notes}
          onChangeText={(tVal) => setFormData({ ...formData, notes: tVal })}
          multiline
          numberOfLines={4}
        />
      </Card>

      {/* Submit */}
      <Button
        title={t('dailyReport.actions.submit')}
        icon={Save}
        onClick={handleSubmit}
        loading={loading}
        variant="primary"
        size="large"
        fullWidth
        style={{ marginTop: 16 }}
      />
    </div>
  );
}
