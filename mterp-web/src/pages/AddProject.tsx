import React, { useState } from 'react';
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
    </div>
  );
}
