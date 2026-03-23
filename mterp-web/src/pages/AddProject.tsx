import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Upload,
  Plus,
  Trash2,
  FileText,
  Calendar,
  DollarSign,
  Package,
  Hash,
  Percent,
  FileSpreadsheet,
  Download,
  X,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { Card, Button, Input, Alert, Badge, CostInput } from '../components/shared';
import { ProjectData, WorkItem, ProjectSupply } from '../types';

const UNIT_OPTIONS = ['pcs', 'kg', 'sak', 'btg', 'lbr', 'unit', 'set', 'roll', 'ltr', 'M2', 'M3', 'M1'];

export default function AddProject() {
  const { t } = useTranslation();
  
  const STEPS = [
    t('addProject.steps.basicInfo'),
    t('addProject.steps.documents'),
    t('addProject.steps.supplyPlan'),
    t('addProject.steps.workItems'),
  ];
  
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [alertData, setAlertData] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string }>({
    visible: false,
    type: 'success',
    title: '',
    message: '',
  });

  const [projectData, setProjectData] = useState({
    name: '',
    location: '',
    description: '',
    totalBudget: '',
    startDate: '',
    endDate: '',
  });

  const [documents, setDocuments] = useState<Record<string, File | null>>({
    shopDrawing: null,
    hse: null,
    manPowerList: null,
    materialList: null,
  });

  const [supplies, setSupplies] = useState<Partial<ProjectSupply>[]>([]);
  const [workItems, setWorkItems] = useState<Partial<WorkItem>[]>([]);

  // Import state
  const [importLoading, setImportLoading] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importPreviewTab, setImportPreviewTab] = useState(0);
  const [importData, setImportData] = useState<{ projectData: any; supplies: any[]; workItems: any[] } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const totalBudget = Number(projectData.totalBudget) || 0;

  // Calculate total costs
  const totalSupplyCost = supplies.reduce((sum, s) => sum + (Number(s.cost) || 0), 0);
  const totalWorkItemCost = workItems.reduce((sum, w) => sum + (Number(w.cost) || 0), 0);

  const getWeight = (cost: number) => {
    if (totalBudget <= 0) return 0;
    return Number(((cost / totalBudget) * 100).toFixed(1));
  };

  const handleNext = () => {
    if (currentStep === 0 && (!projectData.name || !projectData.location)) {
      setAlertData({ visible: true, type: 'error', title: 'Error', message: t('addProject.errors.fillNameLocation') });
      return;
    }
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('nama', projectData.name);
      formData.append('lokasi', projectData.location);
      formData.append('description', projectData.description);
      formData.append('totalBudget', projectData.totalBudget);
      formData.append('startDate', projectData.startDate);
      formData.append('endDate', projectData.endDate);
      formData.append('supplies', JSON.stringify(supplies));
      formData.append('workItems', JSON.stringify(workItems));

      Object.entries(documents).forEach(([key, file]) => {
        if (file) formData.append(key, file);
      });

      await api.post('/projects', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setAlertData({ visible: true, type: 'success', title: 'Success', message: t('addProject.errors.success') });
      setTimeout(() => navigate('/projects'), 1500);
    } catch (err) {
      console.error('Failed to create project', err);
      setAlertData({ visible: true, type: 'error', title: 'Error', message: t('addProject.errors.failed') });
    } finally {
      setLoading(false);
    }
  };

  const addSupply = () => {
    setSupplies([...supplies, { id: Date.now().toString(), item: '', qty: 0, unit: 'pcs', cost: 0, status: 'Pending', deadline: '', actualPurchaseDate: '' }]);
  };

  const updateSupply = (index: number, field: string, value: any) => {
    const updated = [...supplies];
    (updated[index] as any)[field] = value;
    setSupplies(updated);
  };

  const addWorkItem = () => {
    setWorkItems([...workItems, { id: Date.now(), name: '', qty: 0, volume: 'M2', unit: 'M2', cost: 0, dates: { plannedStart: '', plannedEnd: '' } } as any]);
  };

  const updateWorkItem = (index: number, field: string, value: any) => {
    const updated = [...workItems];
    (updated[index] as any)[field] = value;
    setWorkItems(updated);
  };

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID').format(num);
  };

  // ===== Import Handlers =====
  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/projects/import-template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'MTERP_Project_Template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download template', err);
      setAlertData({ visible: true, type: 'error', title: 'Error', message: t('addProject.import.downloadFailed') });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/projects/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportData(response.data);
      setImportPreviewTab(0);
      setShowImportPreview(true);
    } catch (err) {
      console.error('Failed to import spreadsheet', err);
      setAlertData({ visible: true, type: 'error', title: 'Error', message: t('addProject.import.parseFailed') });
    } finally {
      setImportLoading(false);
      // Reset file input
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (!importData) return;

    const d = importData.projectData;
    setProjectData({
      name: d.nama || '',
      location: d.lokasi || '',
      description: d.description || '',
      totalBudget: d.totalBudget ? String(d.totalBudget) : '',
      startDate: d.startDate || '',
      endDate: d.endDate || '',
    });

    if (importData.supplies.length > 0) {
      setSupplies(importData.supplies);
    }
    if (importData.workItems.length > 0) {
      setWorkItems(importData.workItems);
    }

    setShowImportPreview(false);
    setImportData(null);
    setCurrentStep(0);
    setAlertData({ visible: true, type: 'success', title: t('addProject.import.successTitle'), message: t('addProject.import.successMessage') });
  };

  // Helper for preview
  const previewTabs = [
    { label: t('addProject.steps.basicInfo'), count: importData?.projectData?.nama ? 1 : 0 },
    { label: t('addProject.steps.supplyPlan'), count: importData?.supplies?.length || 0 },
    { label: t('addProject.steps.workItems'), count: importData?.workItems?.length || 0 },
  ];

  return (
    <div className="p-6 max-w-[700px] mx-auto max-lg:p-4 max-sm:p-3">
      <Alert
        visible={alertData.visible}
        type={alertData.type}
        title={alertData.title}
        message={alertData.message}
        onClose={() => setAlertData({ ...alertData, visible: false })}
      />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary m-0 max-sm:text-xl">{t('addProject.title')}</h1>
      </div>

      {/* Import Actions Bar */}
      <div className="flex items-center gap-3 mb-6 p-4 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-xl max-sm:flex-col max-sm:items-stretch">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileSpreadsheet size={20} className="text-primary shrink-0" />
          <span className="text-sm font-semibold text-text-primary truncate">{t('addProject.import.title')}</span>
        </div>
        <div className="flex gap-2 max-sm:flex-col">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary bg-bg-primary border border-primary/30 rounded-lg cursor-pointer transition-all hover:bg-primary/10 hover:border-primary/50 active:scale-[0.97]"
          >
            <Download size={16} />
            {t('addProject.import.downloadTemplate')}
          </button>
          <label className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg cursor-pointer transition-all hover:opacity-90 active:scale-[0.97] ${importLoading ? 'opacity-60 pointer-events-none' : ''}`}>
            <Upload size={16} />
            {importLoading ? t('addProject.import.importing') : t('addProject.import.importSheet')}
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportFile}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex justify-between mb-6 max-sm:gap-1">
        {STEPS.map((step, i) => (
          <div key={step} className="flex flex-col items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mb-2 transition-all ${
              i === currentStep ? 'bg-primary text-white' : i < currentStep ? 'bg-success text-white' : 'bg-bg-secondary text-text-muted'
            }`}>
              {i < currentStep ? <Check size={14} /> : i + 1}
            </div>
            <span className={`text-xs text-center max-sm:text-[9px] ${
              i === currentStep ? 'text-primary font-bold' : 'text-text-muted font-medium'
            }`}>{step}</span>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card className="mb-6 min-h-[300px]">
        {/* Step 0: Basic Info */}
        {currentStep === 0 && (
          <div>
            <Input
              label={t('addProject.form.projectName')}
              placeholder={t('addProject.form.projectNamePlaceholder')}
              value={projectData.name}
              onChangeText={(t) => setProjectData({ ...projectData, name: t })}
            />
            <Input
              label={t('addProject.form.location')}
              placeholder={t('addProject.form.locationPlaceholder')}
              value={projectData.location}
              onChangeText={(t) => setProjectData({ ...projectData, location: t })}
            />
            <Input
              label={t('addProject.form.description')}
              placeholder={t('addProject.form.descriptionPlaceholder')}
              value={projectData.description}
              onChangeText={(t) => setProjectData({ ...projectData, description: t })}
              multiline
            />
            <CostInput
              label={t('addProject.form.totalBudget')}
              placeholder={t('addProject.form.totalBudgetPlaceholder')}
              value={Number(projectData.totalBudget) || 0}
              onChange={(v) => setProjectData({ ...projectData, totalBudget: v.toString() })}
              icon={DollarSign}
            />
            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <Input
                label={t('addProject.form.startDate')}
                placeholder="YYYY-MM-DD"
                value={projectData.startDate}
                onChangeText={(t) => setProjectData({ ...projectData, startDate: t })}
                icon={Calendar}
              />
              <Input
                label={t('addProject.form.endDate')}
                placeholder="YYYY-MM-DD"
                value={projectData.endDate}
                onChangeText={(t) => setProjectData({ ...projectData, endDate: t })}
                icon={Calendar}
              />
            </div>
          </div>
        )}

        {/* Step 1: Documents */}
        {currentStep === 1 && (
          <div>
            <h3 className="text-base font-bold text-text-primary m-0 mb-4">{t('addProject.form.uploadDocs')}</h3>
            {['shopDrawing', 'hse', 'manPowerList', 'materialList'].map((docKey) => (
              <div key={docKey} className="mb-3">
                <label className="block text-xs font-bold text-text-muted mb-1 tracking-wide">{docKey.replace(/([A-Z])/g, ' $1').toUpperCase()}</label>
                <label className="flex items-center gap-2 p-3 border border-dashed border-border rounded-md cursor-pointer text-text-secondary text-sm hover:border-primary hover:bg-primary-bg">
                  <Upload size={18} />
                  <span>{documents[docKey]?.name || t('addProject.form.chooseFile')}</span>
                  <input
                    type="file"
                    onChange={(e) => setDocuments({ ...documents, [docKey]: e.target.files?.[0] || null })}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Supply Plan */}
        {currentStep === 2 && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-text-primary m-0">{STEPS[2]}</h3>
              <Button title={t('addProject.actions.add')} icon={Plus} onClick={addSupply} variant="outline" size="small" />
            </div>

            {/* Summary */}
            {supplies.length > 0 && (
              <div className="flex items-center gap-3 p-3 px-4 bg-bg-secondary rounded-md mb-4 text-sm text-text-secondary max-sm:flex-wrap">
                <span>{t('addProject.form.totalSupplyCost')}</span>
                <span className="font-bold text-text-primary ml-auto">Rp {formatRupiah(totalSupplyCost)}</span>
                {totalBudget > 0 && (
                  <Badge label={`${((totalSupplyCost / totalBudget) * 100).toFixed(1)}${t('addProject.form.ofBudget')}`} variant="primary" size="small" />
                )}
              </div>
            )}

            {supplies.map((s, i) => (
              <div key={s.id} className="bg-bg-secondary border border-border rounded-lg p-4 mb-3 transition-colors hover:border-primary">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-text-muted bg-bg-primary py-[2px] px-2 rounded-full">#{i + 1}</span>
                  {totalBudget > 0 && (Number(s.cost) || 0) > 0 && (
                    <Badge
                      label={`${getWeight(Number(s.cost) || 0)}%`}
                      variant="primary"
                      size="small"
                    />
                  )}
                  <button
                    className="ml-auto w-8 h-8 rounded-full flex items-center justify-center bg-transparent text-text-muted cursor-pointer transition-all border-none hover:bg-red-500/10 hover:text-red-500"
                    onClick={() => setSupplies(supplies.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="w-full">
                    <Input
                      label={t('addProject.form.itemName')}
                      placeholder={t('addProject.form.itemNamePlaceholder')}
                      value={s.item || ''}
                      onChangeText={(t) => updateSupply(i, 'item', t)}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                    <div className="flex flex-col">
                      <Input
                        label={t('addProject.form.qty')}
                        type="number"
                        placeholder="0"
                        value={String(s.qty || '')}
                        onChangeText={(t) => updateSupply(i, 'qty', Number(t) || 0)}
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-text-secondary mb-1">{t('addProject.form.unit')}</label>
                      <select
                        className="py-2 px-3 border border-border rounded-md bg-bg-primary text-text-primary text-sm h-10 cursor-pointer transition-colors focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/10"
                        value={s.unit || 'pcs'}
                        onChange={(e) => updateSupply(i, 'unit', e.target.value)}
                      >
                        {UNIT_OPTIONS.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <CostInput
                        label={t('addProject.form.cost')}
                        placeholder="0"
                        value={Number(s.cost) || 0}
                        onChange={(v) => updateSupply(i, 'cost', v)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                    <div className="flex flex-col">
                      <Input
                        label={t('addProject.form.startDate')}
                        type="date"
                        placeholder="YYYY-MM-DD"
                        value={(s as any).startDate || ''}
                        onChangeText={(t) => updateSupply(i, 'startDate', t)}
                        icon={Calendar}
                      />
                    </div>
                    <div className="flex flex-col">
                      <Input
                        label={t('addProject.form.endDate')}
                        type="date"
                        placeholder="YYYY-MM-DD"
                        value={(s as any).endDate || ''}
                        onChangeText={(t) => updateSupply(i, 'endDate', t)}
                        icon={Calendar}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {supplies.length === 0 && <p className="text-text-muted text-sm text-center py-6">{t('addProject.form.noSupplies')}</p>}
          </div>
        )}

        {/* Step 3: Work Items */}
        {currentStep === 3 && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-text-primary m-0">{STEPS[3]}</h3>
              <Button title={t('addProject.actions.add')} icon={Plus} onClick={addWorkItem} variant="outline" size="small" />
            </div>

            {/* Summary */}
            {workItems.length > 0 && (
              <div className="flex items-center gap-3 p-3 px-4 bg-bg-secondary rounded-md mb-4 text-sm text-text-secondary max-sm:flex-wrap">
                <span>{t('addProject.form.totalWorkItemCost')}</span>
                <span className="font-bold text-text-primary ml-auto">Rp {formatRupiah(totalWorkItemCost)}</span>
                {totalBudget > 0 && (
                  <Badge label={`${((totalWorkItemCost / totalBudget) * 100).toFixed(1)}${t('addProject.form.ofBudget')}`} variant="primary" size="small" />
                )}
              </div>
            )}

            {workItems.map((w, i) => (
              <div key={w.id} className="bg-bg-secondary border border-border rounded-lg p-4 mb-3 transition-colors hover:border-primary">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-text-muted bg-bg-primary py-[2px] px-2 rounded-full">#{i + 1}</span>
                  {totalBudget > 0 && (Number(w.cost) || 0) > 0 && (
                    <Badge
                      label={`${getWeight(Number(w.cost) || 0)}%`}
                      variant="warning"
                      size="small"
                    />
                  )}
                  <button
                    className="ml-auto w-8 h-8 rounded-full flex items-center justify-center bg-transparent text-text-muted cursor-pointer transition-all border-none hover:bg-red-500/10 hover:text-red-500"
                    onClick={() => setWorkItems(workItems.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="w-full">
                    <Input
                      label={t('addProject.form.workItemName')}
                      placeholder={t('addProject.form.workItemNamePlaceholder')}
                      value={w.name || ''}
                      onChangeText={(t) => updateWorkItem(i, 'name', t)}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                    <div className="flex flex-col">
                      <Input
                        label={t('addProject.form.qty')}
                        type="number"
                        placeholder="0"
                        value={String(w.qty || '')}
                        onChangeText={(t) => updateWorkItem(i, 'qty', Number(t) || 0)}
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-text-secondary mb-1">{t('addProject.form.unit')}</label>
                      <select
                        className="py-2 px-3 border border-border rounded-md bg-bg-primary text-text-primary text-sm h-10 cursor-pointer transition-colors focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/10"
                        value={w.unit || w.volume || 'M2'}
                        onChange={(e) => {
                          updateWorkItem(i, 'unit', e.target.value);
                          updateWorkItem(i, 'volume', e.target.value);
                        }}
                      >
                        {UNIT_OPTIONS.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <CostInput
                        label={t('addProject.form.cost')}
                        placeholder="0"
                        value={Number(w.cost) || 0}
                        onChange={(v) => updateWorkItem(i, 'cost', v)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                    <div className="flex flex-col">
                      <Input
                        label={t('addProject.form.startDate')}
                        type="date"
                        placeholder="YYYY-MM-DD"
                        value={(w as any).startDate || (w as any).dates?.plannedStart || ''}
                        onChangeText={(t) => updateWorkItem(i, 'startDate', t)}
                        icon={Calendar}
                      />
                    </div>
                    <div className="flex flex-col">
                      <Input
                        label={t('addProject.form.endDate')}
                        type="date"
                        placeholder="YYYY-MM-DD"
                        value={(w as any).endDate || (w as any).dates?.plannedEnd || ''}
                        onChangeText={(t) => updateWorkItem(i, 'endDate', t)}
                        icon={Calendar}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {workItems.length === 0 && <p className="text-text-muted text-sm text-center py-6">{t('addProject.form.noWorkItems')}</p>}
          </div>
        )}
      </Card>

      {/* Navigation Buttons */}
      <div className={`flex justify-between gap-4 max-sm:flex-col [&>button]:max-sm:w-full ${currentStep === 0 ? 'justify-end' : ''}`}>
        {currentStep > 0 && (
          <Button
            title={t('addProject.actions.back')}
            icon={ChevronLeft}
            onClick={handleBack}
            variant="outline"
          />
        )}
        {currentStep < STEPS.length - 1 ? (
          <Button
            title={t('addProject.actions.next')}
            icon={ChevronRight}
            iconPosition="right"
            onClick={handleNext}
            variant="primary"
          />
        ) : (
          <Button
            title={t('addProject.actions.create')}
            icon={Check}
            onClick={handleSubmit}
            loading={loading}
            variant="success"
          />
        )}
      </div>

      {/* ===== Import Preview Modal ===== */}
      {showImportPreview && importData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-bg-primary rounded-2xl shadow-2xl w-full max-w-[600px] max-h-[85vh] flex flex-col overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Eye size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-text-primary m-0">{t('addProject.import.previewTitle')}</h2>
                  <p className="text-xs text-text-muted m-0 mt-0.5">{t('addProject.import.previewSubtitle')}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowImportPreview(false); setImportData(null); }}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-transparent text-text-muted cursor-pointer transition-all border-none hover:bg-bg-secondary hover:text-text-primary"
              >
                <X size={20} />
              </button>
            </div>

            {/* Preview Tabs */}
            <div className="flex border-b border-border px-5 gap-1">
              {previewTabs.map((tab, i) => (
                <button
                  key={i}
                  onClick={() => setImportPreviewTab(i)}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer bg-transparent ${
                    importPreviewTab === i
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">{tab.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* Tab 0: Basic Info */}
              {importPreviewTab === 0 && (
                <div className="space-y-3">
                  {[
                    { label: t('addProject.form.projectName'), value: importData.projectData.nama },
                    { label: t('addProject.form.location'), value: importData.projectData.lokasi },
                    { label: t('addProject.form.description'), value: importData.projectData.description },
                    { label: t('addProject.form.totalBudget'), value: importData.projectData.totalBudget ? `Rp ${formatRupiah(importData.projectData.totalBudget)}` : '-' },
                    { label: t('addProject.form.startDate'), value: importData.projectData.startDate || '-' },
                    { label: t('addProject.form.endDate'), value: importData.projectData.endDate || '-' },
                  ].map((field, i) => (
                    <div key={i} className="flex justify-between items-start gap-4 py-2 border-b border-border/50 last:border-none">
                      <span className="text-xs font-semibold text-text-muted uppercase tracking-wide shrink-0">{field.label}</span>
                      <span className="text-sm text-text-primary text-right font-medium">{field.value || '-'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 1: Supplies Preview */}
              {importPreviewTab === 1 && (
                <div>
                  {importData.supplies.length === 0 ? (
                    <div className="text-center py-8 text-text-muted text-sm">
                      <AlertCircle size={24} className="mx-auto mb-2 opacity-40" />
                      {t('addProject.import.noSuppliesFound')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {importData.supplies.map((s: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg border border-border/50">
                          <span className="text-xs font-bold text-text-muted bg-bg-primary w-6 h-6 rounded-full flex items-center justify-center shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-text-primary truncate">{s.item}</div>
                            <div className="text-xs text-text-muted mt-0.5">{s.qty} {s.unit} • Rp {formatRupiah(s.cost)}</div>
                          </div>
                          {s.startDate && <span className="text-xs text-text-muted shrink-0">{s.startDate}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Work Items Preview */}
              {importPreviewTab === 2 && (
                <div>
                  {importData.workItems.length === 0 ? (
                    <div className="text-center py-8 text-text-muted text-sm">
                      <AlertCircle size={24} className="mx-auto mb-2 opacity-40" />
                      {t('addProject.import.noWorkItemsFound')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {importData.workItems.map((w: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg border border-border/50">
                          <span className="text-xs font-bold text-text-muted bg-bg-primary w-6 h-6 rounded-full flex items-center justify-center shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-text-primary truncate">{w.name}</div>
                            <div className="text-xs text-text-muted mt-0.5">{w.qty} {w.unit} • Rp {formatRupiah(w.cost)}</div>
                          </div>
                          {w.startDate && <span className="text-xs text-text-muted shrink-0">{w.startDate}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-5 border-t border-border">
              <button
                onClick={() => { setShowImportPreview(false); setImportData(null); }}
                className="px-5 py-2.5 text-sm font-semibold text-text-secondary bg-bg-secondary border border-border rounded-lg cursor-pointer transition-all hover:bg-bg-primary"
              >
                {t('addProject.actions.back')}
              </button>
              <button
                onClick={handleConfirmImport}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg cursor-pointer transition-all hover:opacity-90 active:scale-[0.97] flex items-center gap-2"
              >
                <Check size={16} />
                {t('addProject.import.confirmImport')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
