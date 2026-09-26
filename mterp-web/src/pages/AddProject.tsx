import React, { useState, useRef, useMemo, useEffect } from 'react';
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
  Layers,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  X,
  Eye,
  Calculator,
  TrendingUp,
  FolderKanban,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  MoveUp,
  MoveDown,
  CornerDownRight,
  RotateCcw,
  Boxes,
  HelpCircle,
  Keyboard,
  ShieldCheck,
  CheckSquare,
  Square,
  MinusSquare,
  Tag,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { Card, Button, Input, Alert, Badge, CostInput } from '../components/shared';
import { formatRupiahDots } from '../components/shared/CostInput';

export interface WizardTaskItem {
  id: string;
  wbsCode: string;
  outlineLevel: number; // 1 = root, 2 = subtask, 3 = sub-subtask
  itemType: 'summary' | 'work' | 'supply' | 'milestone';
  name: string;
  category: 'general' | 'material' | 'labor' | 'equipment' | 'subcontractor' | 'overhead';
  quantity: number;
  unit: string;
  unitRate: number;
  cost: number;
  duration: number; // in days
  startDate?: string;
  endDate?: string;
  deliveryDate?: string;
}

const UNIT_OPTIONS = [
  'ls', 'm2', 'm3', 'sak', 'btg', 'titik', 'ton', 'kg', 'pcs',
  'lbr', 'unit', 'set', 'roll', 'ltr', 'HOK', 'JAM', 'bulan', 'hari'
];

const CATEGORY_OPTIONS: { value: WizardTaskItem['category']; label: string }[] = [
  { value: 'general', label: 'Umum / Persiapan' },
  { value: 'labor', label: 'Upah / Tukang (Labor)' },
  { value: 'material', label: 'Material (Bahan)' },
  { value: 'equipment', label: 'Sewa Alat Berat (Equipment)' },
  { value: 'subcontractor', label: 'Subkontraktor (Subkon)' },
  { value: 'overhead', label: 'Overhead Proyek' },
];

const DEFAULT_WBS_TEMPLATE: WizardTaskItem[] = [
  {
    id: 'tmpl-1',
    wbsCode: '1',
    outlineLevel: 1,
    itemType: 'summary',
    name: 'Pekerjaan Struktur Bawah (Substructure)',
    category: 'general',
    quantity: 1,
    unit: 'ls',
    unitRate: 0,
    cost: 551250000,
    duration: 30,
    startDate: '',
    endDate: '',
  },
  {
    id: 'tmpl-2',
    wbsCode: '1.1',
    outlineLevel: 2,
    itemType: 'work',
    name: 'Pemancangan Spun Pile Dia 50cm',
    category: 'labor',
    quantity: 120,
    unit: 'titik',
    unitRate: 350000,
    cost: 42000000,
    duration: 14,
    startDate: '',
    endDate: '',
  },
  {
    id: 'tmpl-3',
    wbsCode: '1.2',
    outlineLevel: 2,
    itemType: 'supply',
    name: 'Spun Pile Beton Dia 50cm L=12m',
    category: 'material',
    quantity: 120,
    unit: 'btg',
    unitRate: 2500000,
    cost: 300000000,
    duration: 10,
    startDate: '',
    endDate: '',
  },
  {
    id: 'tmpl-4',
    wbsCode: '1.3',
    outlineLevel: 2,
    itemType: 'work',
    name: 'Galian Tanah Pile Cap & Tie Beam',
    category: 'labor',
    quantity: 450,
    unit: 'm3',
    unitRate: 85000,
    cost: 38250000,
    duration: 12,
    startDate: '',
    endDate: '',
  },
  {
    id: 'tmpl-5',
    wbsCode: '1.4',
    outlineLevel: 2,
    itemType: 'supply',
    name: 'Ready Mix Concrete K-350 Pile Cap',
    category: 'material',
    quantity: 180,
    unit: 'm3',
    unitRate: 950000,
    cost: 171000000,
    duration: 7,
    startDate: '',
    endDate: '',
  },
  {
    id: 'tmpl-6',
    wbsCode: '1.5',
    outlineLevel: 2,
    itemType: 'milestone',
    name: 'Milestone: Struktur Bawah Selesai',
    category: 'general',
    quantity: 0,
    unit: 'ls',
    unitRate: 0,
    cost: 0,
    duration: 0,
    startDate: '',
    endDate: '',
  },
  {
    id: 'tmpl-7',
    wbsCode: '2',
    outlineLevel: 1,
    itemType: 'summary',
    name: 'Pekerjaan Struktur Atas (Superstructure)',
    category: 'general',
    quantity: 1,
    unit: 'ls',
    unitRate: 0,
    cost: 527400000,
    duration: 60,
    startDate: '',
    endDate: '',
  },
  {
    id: 'tmpl-8',
    wbsCode: '2.1',
    outlineLevel: 2,
    itemType: 'work',
    name: 'Pembesian Balok & Pelat Lantai',
    category: 'labor',
    quantity: 15000,
    unit: 'kg',
    unitRate: 3500,
    cost: 52500000,
    duration: 20,
    startDate: '',
    endDate: '',
  },
  {
    id: 'tmpl-9',
    wbsCode: '2.2',
    outlineLevel: 2,
    itemType: 'supply',
    name: 'Besi Beton Ulir D16 & D19 (SNI)',
    category: 'material',
    quantity: 15000,
    unit: 'kg',
    unitRate: 14500,
    cost: 217500000,
    duration: 15,
    startDate: '',
    endDate: '',
  },
  {
    id: 'tmpl-10',
    wbsCode: '2.3',
    outlineLevel: 2,
    itemType: 'work',
    name: 'Pengecoran Pelat & Balok Lantai 1',
    category: 'labor',
    quantity: 220,
    unit: 'm3',
    unitRate: 250000,
    cost: 55000000,
    duration: 10,
    startDate: '',
    endDate: '',
  },
  {
    id: 'tmpl-11',
    wbsCode: '2.4',
    outlineLevel: 2,
    itemType: 'supply',
    name: 'Ready Mix Concrete K-300 Lantai 1',
    category: 'material',
    quantity: 220,
    unit: 'm3',
    unitRate: 920000,
    cost: 202400000,
    duration: 5,
    startDate: '',
    endDate: '',
  },
  {
    id: 'tmpl-12',
    wbsCode: '2.5',
    outlineLevel: 2,
    itemType: 'milestone',
    name: 'Milestone: Topping Off Lantai 1',
    category: 'general',
    quantity: 0,
    unit: 'ls',
    unitRate: 0,
    cost: 0,
    duration: 0,
    startDate: '',
    endDate: '',
  },
];

/**
 * Automatically recalculates standard WBS numbering (1, 1.1, 1.1.1, 1.2, 2, 2.1)
 * based on the outline level of each item.
 */
function recomputeWbsCodes(tasks: WizardTaskItem[]): WizardTaskItem[] {
  const counters: number[] = [];
  return tasks.map((task) => {
    const level = Math.max(1, Number(task.outlineLevel) || 1);
    while (counters.length < level) {
      counters.push(0);
    }
    counters.length = level;
    counters[level - 1]++;
    const code = counters.join('.');
    return { ...task, outlineLevel: level, wbsCode: code };
  });
}

export default function AddProject() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const STEPS = [
    t('addProject.steps.basicInfo', 'Informasi Proyek'),
    t('addProject.steps.documents', 'Dokumen Kontrak & K3'),
    'Tabel WBS Proyek (ERP)',
    'Review Struktur WBS & Finalisasi',
  ];

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [autoCalculateBudget, setAutoCalculateBudget] = useState(true);
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

  // Unified WBS Tasks Table state
  const [tasks, setTasks] = useState<WizardTaskItem[]>(() => recomputeWbsCodes(DEFAULT_WBS_TEMPLATE));
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Import state
  const [importLoading, setImportLoading] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importPreviewTab, setImportPreviewTab] = useState(0);
  const [importData, setImportData] = useState<{ projectData: any; tasks: any[]; supplies: any[]; workItems: any[] } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Sync dates to tasks when project dates change if task dates are blank
  useEffect(() => {
    if (projectData.startDate) {
      setTasks((prev) =>
        prev.map((t) => ({
          ...t,
          startDate: t.startDate || projectData.startDate,
          endDate: t.endDate || projectData.endDate || projectData.startDate,
        }))
      );
    }
  }, [projectData.startDate, projectData.endDate]);

  // Compute roll-up summary costs for parent tasks
  const summaryCostMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const isParent = (i + 1 < tasks.length && tasks[i + 1].outlineLevel > task.outlineLevel) || task.itemType === 'summary';
      if (isParent) {
        let sum = 0;
        for (let j = i + 1; j < tasks.length; j++) {
          if (tasks[j].outlineLevel <= task.outlineLevel) break;
          const childIsParent = (j + 1 < tasks.length && tasks[j + 1].outlineLevel > tasks[j].outlineLevel) || tasks[j].itemType === 'summary';
          if (!childIsParent && tasks[j].itemType !== 'milestone') {
            sum += Number(tasks[j].cost) || 0;
          }
        }
        map.set(task.id, sum);
      }
    }
    return map;
  }, [tasks]);

  // Live budget aggregations
  const totalWorkCost = useMemo(() => {
    return tasks
      .filter((t) => t.itemType === 'work')
      .reduce((sum, t) => sum + (Number(t.cost) || 0), 0);
  }, [tasks]);

  const totalSupplyCost = useMemo(() => {
    return tasks
      .filter((t) => t.itemType === 'supply')
      .reduce((sum, t) => sum + (Number(t.cost) || 0), 0);
  }, [tasks]);

  const totalAggregatedCost = totalWorkCost + totalSupplyCost;

  const workItemsCount = useMemo(() => tasks.filter((t) => t.itemType === 'work').length, [tasks]);
  const supplyItemsCount = useMemo(() => tasks.filter((t) => t.itemType === 'supply').length, [tasks]);
  const summaryPackagesCount = useMemo(() => tasks.filter((t) => t.itemType === 'summary').length, [tasks]);

  // Active working budget
  const effectiveBudget = autoCalculateBudget
    ? totalAggregatedCost
    : Number(projectData.totalBudget) || totalAggregatedCost;

  const formatRupiah = (num: number) => {
    return formatRupiahDots(num);
  };

  const getWeight = (cost: number) => {
    if (effectiveBudget <= 0) return 0;
    return Number(((cost / effectiveBudget) * 100).toFixed(1));
  };

  // ==================== WBS TABLE OPERATIONS ====================

  const updateTask = (index: number, field: keyof WizardTaskItem, value: any) => {
    setTasks((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      if (field === 'itemType') {
        if (value === 'summary') {
          item.quantity = 1;
          item.unit = 'ls';
          item.unitRate = 0;
          item.category = 'general';
        } else if (value === 'milestone') {
          item.duration = 0;
          item.quantity = 0;
          item.unitRate = 0;
          item.cost = 0;
          item.unit = 'ls';
          item.category = 'general';
        } else if (value === 'supply') {
          item.category = 'material';
          item.unit = item.unit === 'ls' ? 'sak' : item.unit;
        } else if (value === 'work') {
          item.category = 'labor';
          item.unit = item.unit === 'sak' ? 'm2' : item.unit;
        }
      }

      if (field === 'quantity' || field === 'unitRate') {
        const q = field === 'quantity' ? Number(value) || 0 : item.quantity;
        const r = field === 'unitRate' ? Number(value) || 0 : item.unitRate;
        item.cost = Math.round(q * r);
      } else if (field === 'cost') {
        const c = Number(value) || 0;
        item.cost = c;
        if (item.quantity > 0) {
          item.unitRate = Math.round(c / item.quantity);
        }
      }

      updated[index] = item;
      return updated;
    });
  };

  const handleIndent = (index: number) => {
    if (index === 0) return;
    setTasks((prev) => {
      const prevLevel = prev[index - 1].outlineLevel;
      const currentLevel = prev[index].outlineLevel;
      if (currentLevel <= prevLevel) {
        const nextTasks = [...prev];
        nextTasks[index] = { ...nextTasks[index], outlineLevel: currentLevel + 1 };
        return recomputeWbsCodes(nextTasks);
      }
      return prev;
    });
  };

  const handleOutdent = (index: number) => {
    setTasks((prev) => {
      const currentLevel = prev[index].outlineLevel;
      if (currentLevel > 1) {
        const nextTasks = [...prev];
        nextTasks[index] = { ...nextTasks[index], outlineLevel: currentLevel - 1 };
        return recomputeWbsCodes(nextTasks);
      }
      return prev;
    });
  };

  const handleAddRow = (index?: number) => {
    setTasks((prev) => {
      const defaultStart = projectData.startDate || new Date().toISOString().split('T')[0];
      const defaultEnd = projectData.endDate || defaultStart;

      let targetLevel = 1;
      let insertIndex = prev.length;

      if (typeof index === 'number' && index >= 0 && index < prev.length) {
        targetLevel = prev[index].outlineLevel;
        insertIndex = index + 1;
      }

      const newTask: WizardTaskItem = {
        id: String(Date.now() + Math.random().toString(36).slice(2, 6)),
        wbsCode: '',
        outlineLevel: targetLevel,
        itemType: 'work',
        name: '',
        category: 'labor',
        quantity: 1,
        unit: 'm2',
        unitRate: 0,
        cost: 0,
        duration: 7,
        startDate: defaultStart,
        endDate: defaultEnd,
      };

      const updated = [...prev];
      updated.splice(insertIndex, 0, newTask);
      return recomputeWbsCodes(updated);
    });
  };

  const handleAddSubtask = (parentIndex: number) => {
    setTasks((prev) => {
      const parent = prev[parentIndex];
      const targetLevel = (parent.outlineLevel || 1) + 1;
      const defaultStart = parent.startDate || projectData.startDate || new Date().toISOString().split('T')[0];
      const defaultEnd = parent.endDate || projectData.endDate || defaultStart;

      const newSubtask: WizardTaskItem = {
        id: String(Date.now() + Math.random().toString(36).slice(2, 6)),
        wbsCode: '',
        outlineLevel: targetLevel,
        itemType: 'work',
        name: '',
        category: 'labor',
        quantity: 1,
        unit: 'm2',
        unitRate: 0,
        cost: 0,
        duration: 7,
        startDate: defaultStart,
        endDate: defaultEnd,
      };

      const updated = [...prev];
      updated.splice(parentIndex + 1, 0, newSubtask);
      return recomputeWbsCodes(updated);
    });
  };

  const handleAddSummary = () => {
    setTasks((prev) => {
      const defaultStart = projectData.startDate || new Date().toISOString().split('T')[0];
      const defaultEnd = projectData.endDate || defaultStart;

      const newSummary: WizardTaskItem = {
        id: String(Date.now() + Math.random().toString(36).slice(2, 6)),
        wbsCode: '',
        outlineLevel: 1,
        itemType: 'summary',
        name: 'Paket WBS Baru',
        category: 'general',
        quantity: 1,
        unit: 'ls',
        unitRate: 0,
        cost: 0,
        duration: 30,
        startDate: defaultStart,
        endDate: defaultEnd,
      };

      const updated = [...prev, newSummary];
      return recomputeWbsCodes(updated);
    });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setTasks((prev) => {
      const updated = [...prev];
      const temp = updated[index - 1];
      updated[index - 1] = updated[index];
      updated[index] = temp;
      return recomputeWbsCodes(updated);
    });
  };

  const handleMoveDown = (index: number) => {
    setTasks((prev) => {
      if (index >= prev.length - 1) return prev;
      const updated = [...prev];
      const temp = updated[index + 1];
      updated[index + 1] = updated[index];
      updated[index] = temp;
      return recomputeWbsCodes(updated);
    });
  };

  const handleRemoveTask = (index: number) => {
    setTasks((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return recomputeWbsCodes(updated);
    });
  };

  const handleToggleSelect = (taskId: string, index: number, isShift = false) => {
    if (isShift && lastSelectedIndex !== null && lastSelectedIndex !== index) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const rangeIds = tasks.slice(start, end + 1).map((t) => t.id);
      setSelectedTaskIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
    } else {
      setSelectedTaskIds((prev) =>
        prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
      );
      setLastSelectedIndex(index);
    }
  };

  const handleSelectAll = () => {
    if (selectedTaskIds.length === tasks.length) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(tasks.map((t) => t.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedTaskIds([]);
    setLastSelectedIndex(null);
  };

  // Bulk Actions
  const handleBulkDelete = () => {
    if (selectedTaskIds.length === 0) return;
    if (!window.confirm(`Hapus ${selectedTaskIds.length} item WBS terpilih?`)) return;
    setTasks((prev) => {
      const updated = prev.filter((t) => !selectedTaskIds.includes(t.id));
      return recomputeWbsCodes(updated);
    });
    setSelectedTaskIds([]);
    setLastSelectedIndex(null);
  };

  const handleBulkChangeType = (newType: WizardTaskItem['itemType']) => {
    if (selectedTaskIds.length === 0) return;
    setTasks((prev) => {
      const updated = prev.map((t) => {
        if (!selectedTaskIds.includes(t.id)) return t;
        const isNowSummary = newType === 'summary';
        const isNowMilestone = newType === 'milestone';
        return {
          ...t,
          itemType: newType,
          quantity: isNowMilestone ? 0 : t.quantity || 1,
          unitRate: isNowSummary || isNowMilestone ? 0 : t.unitRate,
          cost: isNowSummary || isNowMilestone ? 0 : (t.quantity || 1) * t.unitRate,
          duration: isNowMilestone ? 0 : t.duration || 1,
        };
      });
      return recomputeWbsCodes(updated);
    });
  };

  const handleBulkChangeCategory = (newCategory: WizardTaskItem['category']) => {
    if (selectedTaskIds.length === 0) return;
    setTasks((prev) => {
      return prev.map((t) => {
        if (!selectedTaskIds.includes(t.id)) return t;
        return { ...t, category: newCategory };
      });
    });
  };

  const handleBulkChangeUnit = (newUnit: string) => {
    if (selectedTaskIds.length === 0) return;
    setTasks((prev) => {
      return prev.map((t) => {
        if (!selectedTaskIds.includes(t.id)) return t;
        return { ...t, unit: newUnit };
      });
    });
  };

  const handleBulkIndent = () => {
    if (selectedTaskIds.length === 0) return;
    setTasks((prev) => {
      const updated = prev.map((t) => {
        if (!selectedTaskIds.includes(t.id)) return t;
        return { ...t, outlineLevel: Math.min(5, t.outlineLevel + 1) };
      });
      return recomputeWbsCodes(updated);
    });
  };

  const handleBulkOutdent = () => {
    if (selectedTaskIds.length === 0) return;
    setTasks((prev) => {
      const updated = prev.map((t) => {
        if (!selectedTaskIds.includes(t.id)) return t;
        return { ...t, outlineLevel: Math.max(1, t.outlineLevel - 1) };
      });
      return recomputeWbsCodes(updated);
    });
  };

  // Keyboard shortcut: Escape to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTaskIds.length > 0) {
        setSelectedTaskIds([]);
        setLastSelectedIndex(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskIds.length]);

  const handleResetToTemplate = () => {
    const fresh = DEFAULT_WBS_TEMPLATE.map((t) => ({
      ...t,
      id: String(Date.now() + Math.random().toString(36).slice(2, 6)),
      startDate: projectData.startDate || '',
      endDate: projectData.endDate || '',
    }));
    setTasks(recomputeWbsCodes(fresh));
    setSelectedTaskIds([]);
    setLastSelectedIndex(null);
  };

  const handleClearTasks = () => {
    setTasks([]);
    setSelectedTaskIds([]);
    setLastSelectedIndex(null);
  };

  // ==================== NAVIGATION ====================

  const handleNext = () => {
    if (currentStep === 0) {
      if (!projectData.name.trim() || !projectData.location.trim()) {
        setAlertData({
          visible: true,
          type: 'error',
          title: 'Validasi Diperlukan',
          message: t('addProject.errors.fillNameLocation', 'Harap isi nama dan lokasi proyek.'),
        });
        return;
      }
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

  // ==================== SUBMISSION ====================

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('nama', projectData.name);
      formData.append('lokasi', projectData.location);
      formData.append('description', projectData.description);
      formData.append('totalBudget', String(effectiveBudget));
      formData.append('startDate', projectData.startDate);
      formData.append('endDate', projectData.endDate);

      // Unified WBS Tasks
      formData.append('tasks', JSON.stringify(tasks));

      // Dual projections for backward compatibility
      const derivedWorkItems = tasks
        .filter((t) => t.itemType === 'work')
        .map((t) => ({
          name: t.name,
          qty: t.quantity,
          volume: t.unit,
          unit: t.unit,
          unitRate: t.unitRate,
          cost: t.cost,
          category: t.category,
          startDate: t.startDate,
          endDate: t.endDate,
        }));
      formData.append('workItems', JSON.stringify(derivedWorkItems));

      const derivedSupplies = tasks
        .filter((t) => t.itemType === 'supply')
        .map((t) => ({
          item: t.name,
          qty: t.quantity,
          unit: t.unit,
          unitRate: t.unitRate,
          cost: t.cost,
          status: 'Pending',
          startDate: t.startDate,
          endDate: t.endDate,
          deliveryDate: t.deliveryDate || t.endDate,
        }));
      formData.append('supplies', JSON.stringify(derivedSupplies));

      Object.entries(documents).forEach(([key, file]) => {
        if (file) formData.append(key, file);
      });

      const res = await api.post('/projects', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newProjectId = res.data?._id;

      setAlertData({
        visible: true,
        type: 'success',
        title: 'Proyek WBS Berhasil Dibuat!',
        message: 'Struktur WBS, kalender kerja, RAB, dan Pengadaan Swakelola telah tersinkronkan ke sumber data tunggal.',
      });

      setTimeout(() => {
        if (newProjectId) {
          navigate(`/project/${newProjectId}`);
        } else {
          navigate('/projects');
        }
      }, 1200);
    } catch (err: any) {
      console.error('Failed to create project', err);
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Gagal Membuat Proyek',
        message: err.response?.data?.msg || t('addProject.errors.failed', 'Terjadi kesalahan pada server saat membuat proyek.'),
      });
    } finally {
      setLoading(false);
    }
  };

  // ==================== SPREADSHEET IMPORT ====================

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/projects/import-template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'MTERP_Project_WBS_Template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download template', err);
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Error',
        message: t('addProject.import.downloadFailed', 'Gagal mengunduh template spreadsheet.'),
      });
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
      setAlertData({
        visible: true,
        type: 'error',
        title: 'Error',
        message: t('addProject.import.parseFailed', 'Gagal membaca format spreadsheet.'),
      });
    } finally {
      setImportLoading(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (!importData) return;

    const d = importData.projectData || {};
    setProjectData({
      name: d.nama || '',
      location: d.lokasi || '',
      description: d.description || '',
      totalBudget: d.totalBudget ? String(d.totalBudget) : '',
      startDate: d.startDate || '',
      endDate: d.endDate || '',
    });

    if (Array.isArray(importData.tasks) && importData.tasks.length > 0) {
      const mappedTasks: WizardTaskItem[] = importData.tasks.map((t, idx) => {
        const qty = Number(t.quantity || t.qty) || (t.itemType === 'milestone' ? 0 : 1);
        const cost = Number(t.cost) || 0;
        return {
          id: t.id || String(Date.now() + idx),
          wbsCode: t.wbsCode || String(idx + 1),
          outlineLevel: Number(t.outlineLevel) || 1,
          itemType: t.itemType || 'work',
          name: t.name || `Task ${idx + 1}`,
          category: t.category || (t.itemType === 'supply' ? 'material' : 'general'),
          quantity: qty,
          unit: t.unit || 'ls',
          unitRate: Number(t.unitRate) || (qty > 0 ? Math.round(cost / qty) : cost),
          cost,
          duration: Number(t.duration) || (t.itemType === 'milestone' ? 0 : 7),
          startDate: t.startDate || d.startDate || '',
          endDate: t.endDate || d.endDate || '',
        };
      });
      setTasks(recomputeWbsCodes(mappedTasks));
    }

    setShowImportPreview(false);
    setImportData(null);
    setCurrentStep(2); // Jump directly to WBS Table to review the imported data!
    setAlertData({
      visible: true,
      type: 'success',
      title: t('addProject.import.successTitle', 'Impor WBS Berhasil'),
      message: 'Data spreadsheet berhasil dimuat ke dalam Tabel WBS ERP. Format biaya telah terformat rapi sesuai standar ERP.',
    });
  };

  const previewTabs = [
    { label: t('addProject.steps.basicInfo', 'Informasi Proyek'), count: importData?.projectData?.nama ? 1 : 0 },
    { label: 'Tabel WBS & Subtask', count: importData?.tasks?.length || 0 },
  ];

  return (
    <div className="p-6 max-w-[1380px] mx-auto max-lg:p-4 max-sm:p-3">
      <Alert
        visible={alertData.visible}
        type={alertData.type}
        title={alertData.title}
        message={alertData.message}
        onClose={() => setAlertData({ ...alertData, visible: false })}
      />

      {/* Header */}
      <div className="mb-6 flex justify-between items-center max-sm:flex-col max-sm:items-start max-sm:gap-2">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0 max-sm:text-xl flex items-center gap-2.5">
            <FolderKanban className="text-primary" size={26} />
            <span>Wizard Proyek & Tabel WBS Terpadu</span>
          </h1>
          <p className="text-xs text-text-muted mt-1 m-0">
            Penyusunan struktur WBS konstruksi terintegrasi: Subtask dapat berupa Pekerjaan (Labor/Jasa) maupun Pengadaan Material (Supply) dalam satu hierarki data tunggal.
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold shadow-xs">
          <Sparkles size={14} />
          <span>ERP Design System • Single Source of Truth</span>
        </div>
      </div>

      {/* Import / Export Template Actions Bar */}
      <div className="flex items-center gap-3 mb-6 p-4 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border border-primary/20 rounded-2xl max-sm:flex-col max-sm:items-stretch shadow-xs">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <span className="text-sm font-bold text-text-primary block truncate">Impor / Ekspor Template Spreadsheet WBS (.xlsx)</span>
            <span className="text-xs text-text-muted">Template diselaraskan dengan tabel WBS wizard (Sheet 1: Info Proyek, Sheet 2: WBS Tasks & Subtasks)</span>
          </div>
        </div>
        <div className="flex gap-2 max-sm:flex-col">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold text-primary bg-bg-primary border border-primary/30 rounded-xl cursor-pointer transition-all hover:bg-primary/10 hover:border-primary/50 active:scale-[0.97]"
          >
            <Download size={14} />
            Unduh Template .xlsx
          </button>
          <label className={`flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-primary rounded-xl cursor-pointer transition-all hover:opacity-90 active:scale-[0.97] shadow-sm ${importLoading ? 'opacity-60 pointer-events-none' : ''}`}>
            <Upload size={14} />
            {importLoading ? 'Membaca Sheet...' : 'Impor dari Sheet'}
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
      <div className="flex justify-between mb-6 px-1 gap-2 max-sm:gap-1">
        {STEPS.map((step, i) => (
          <div
            key={step}
            className="flex flex-col items-center flex-1 cursor-pointer group"
            onClick={() => i < currentStep && setCurrentStep(i)}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold mb-1.5 transition-all shadow-xs ${
                i === currentStep
                  ? 'bg-primary text-white ring-4 ring-primary/20 scale-105'
                  : i < currentStep
                  ? 'bg-success text-white'
                  : 'bg-bg-secondary text-text-muted border border-border group-hover:border-primary/40'
              }`}
            >
              {i < currentStep ? <Check size={16} strokeWidth={3} /> : i + 1}
            </div>
            <span
              className={`text-[11px] text-center line-clamp-1 max-sm:text-[9px] ${
                i === currentStep ? 'text-primary font-bold' : 'text-text-muted font-medium'
              }`}
            >
              {step}
            </span>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card className="mb-6 min-h-[360px] p-6 max-sm:p-4 rounded-2xl shadow-sm border border-border">
        {/* Step 0: Basic Info */}
        {currentStep === 0 && (
          <div className="space-y-5 animate-fade-in max-w-3xl mx-auto">
            <div className="border-b border-border pb-3 mb-4">
              <h3 className="text-base font-bold text-text-primary m-0 flex items-center gap-2">
                <FolderKanban size={18} className="text-primary" />
                <span>Identitas & Masa Berlaku Proyek</span>
              </h3>
              <p className="text-xs text-text-muted m-0 mt-0.5">Tentukan parameter utama dan periode pelaksanaan kontrak konstruksi</p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <div className="col-span-2">
                <Input
                  label={t('addProject.form.projectName', 'Nama Proyek')}
                  placeholder="Contoh: Pembangunan Warehouse & Logistic Hub MM2100"
                  value={projectData.name}
                  onChangeText={(t) => setProjectData({ ...projectData, name: t })}
                />
              </div>
              <div className="col-span-2">
                <Input
                  label={t('addProject.form.location', 'Lokasi Proyek')}
                  placeholder="Contoh: Kawasan Industri MM2100 Blok C-4, Cikarang Barat"
                  value={projectData.location}
                  onChangeText={(t) => setProjectData({ ...projectData, location: t })}
                />
              </div>
              <div className="col-span-2">
                <Input
                  label={t('addProject.form.description', 'Deskripsi & Lingkup Pekerjaan')}
                  placeholder="Jelaskan spesifikasi teknis, fungsi bangunan, dan lingkup konstruksi..."
                  value={projectData.description}
                  onChangeText={(t) => setProjectData({ ...projectData, description: t })}
                  multiline
                />
              </div>
            </div>

            {/* Budget Mode Selector */}
            <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-3">
              <div className="flex justify-between items-center max-sm:flex-col max-sm:items-start max-sm:gap-2">
                <div className="flex items-center gap-2">
                  <Calculator size={18} className="text-primary" />
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Perhitungan Anggaran Total</span>
                </div>
                <div className="flex items-center gap-2 bg-bg-primary p-1 rounded-lg border border-border text-xs">
                  <button
                    type="button"
                    onClick={() => setAutoCalculateBudget(true)}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      autoCalculateBudget ? 'bg-primary text-white shadow-xs' : 'text-text-muted hover:text-text-primary bg-transparent'
                    }`}
                  >
                    Otomatis dari WBS
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoCalculateBudget(false)}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      !autoCalculateBudget ? 'bg-primary text-white shadow-xs' : 'text-text-muted hover:text-text-primary bg-transparent'
                    }`}
                  >
                    Plafon Kontrak Manual
                  </button>
                </div>
              </div>

              {autoCalculateBudget ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="text-xs text-text-muted">
                    Total Anggaran Terkalkulasi dari Tabel WBS (Pekerjaan + Material):
                  </div>
                  <div className="text-base font-extrabold text-primary font-mono tabular-nums">
                    Rp {formatRupiah(totalAggregatedCost)}
                  </div>
                </div>
              ) : (
                <CostInput
                  label="Plafon Anggaran Kontrak (Rp)"
                  placeholder="Masukkan total plafon kontrak (Contoh: 1.500.000.000)"
                  prefix="Rp"
                  value={Number(projectData.totalBudget) || 0}
                  onChange={(v) => setProjectData({ ...projectData, totalBudget: String(v) })}
                  icon={DollarSign}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <Input
                label={t('addProject.form.startDate', 'Tanggal Mulai Proyek')}
                type="date"
                placeholder="YYYY-MM-DD"
                value={projectData.startDate}
                onChangeText={(t) => setProjectData({ ...projectData, startDate: t })}
                icon={Calendar}
              />
              <Input
                label={t('addProject.form.endDate', 'Tanggal Selesai Proyek')}
                type="date"
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
          <div className="space-y-4 animate-fade-in max-w-3xl mx-auto">
            <div className="border-b border-border pb-3 mb-4">
              <h3 className="text-base font-bold text-text-primary m-0 flex items-center gap-2">
                <FileText size={18} className="text-primary" />
                <span>Dokumen Teknis, K3 & Spesifikasi</span>
              </h3>
              <p className="text-xs text-text-muted m-0 mt-0.5">Unggah berkas acuan kerja dan kepatuhan K3 (opsional, dapat diunggah kemudian)</p>
            </div>

            {[
              { key: 'shopDrawing', label: 'Shop Drawing & Gambar Kerja Arsitektur/Struktur' },
              { key: 'hse', label: 'Rencana Keselamatan Konstruksi (K3L / HSE Plan)' },
              { key: 'manPowerList', label: 'Daftar Tenaga Kerja & Alokasi Subkon' },
              { key: 'materialList', label: 'Spesifikasi Teknis Material & Standar Mutu' },
            ].map((doc) => (
              <div key={doc.key} className="p-3.5 rounded-xl border border-border bg-bg-secondary/40 hover:bg-bg-secondary transition-all">
                <label className="block text-xs font-bold text-text-primary mb-1.5 tracking-wide">
                  {doc.label}
                </label>
                <label className="flex items-center gap-3 p-3 border border-dashed border-border rounded-xl cursor-pointer text-text-secondary text-xs hover:border-primary hover:bg-primary-bg transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-bg-primary flex items-center justify-center text-primary shadow-xs">
                    <Upload size={16} />
                  </div>
                  <span className="font-medium truncate flex-1">
                    {documents[doc.key]?.name || 'Pilih berkas dokumen (PDF, DWG, XLSX maks 25MB)'}
                  </span>
                  {documents[doc.key] && (
                    <Badge label="Terpilih" variant="success" size="small" />
                  )}
                  <input
                    type="file"
                    onChange={(e) => setDocuments({ ...documents, [doc.key]: e.target.files?.[0] || null })}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Unified ERP WBS Table */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-fade-in">
            {/* Table Header & Toolbar */}
            <div className="flex justify-between items-start border-b border-border pb-4 max-lg:flex-col max-lg:gap-3">
              <div>
                <h3 className="text-base font-bold text-text-primary m-0 flex items-center gap-2">
                  <Boxes size={20} className="text-primary" />
                  <span>Tabel Hierarki WBS Proyek (ERP Interactive Table)</span>
                </h3>
                <p className="text-xs text-text-muted m-0 mt-0.5">
                  Subtask dapat berupa <strong>Pekerjaan Lapangan</strong> (Jasa/Upah) atau <strong>Pengadaan Material</strong> (Supply). Gunakan tombol <strong>Indent / Outdent</strong> untuk mengatur level hierarki.
                </p>
              </div>

              {/* Action Buttons Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddSummary}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-600 bg-purple-500/10 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  <span>+ Paket Grup WBS</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddRow()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  <span>+ Tambah Baris</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetToTemplate}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary bg-bg-secondary border border-border rounded-lg hover:bg-bg-primary transition-colors cursor-pointer"
                  title="Muat contoh standar konstruksi gedung lengkap dengan pekerjaan & material"
                >
                  <RotateCcw size={13} />
                  <span>Muat Contoh Standar</span>
                </button>
                {tasks.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearTasks}
                    className="p-1.5 text-xs text-red-500 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/20 transition-colors cursor-pointer"
                    title="Bersihkan Semua Baris"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Live KPI Metric Cards */}
            <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
              <div className="p-3 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/20 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase font-bold text-primary">Total Anggaran WBS</span>
                  <DollarSign size={14} className="text-primary" />
                </div>
                <div className="text-base font-extrabold text-primary font-mono tabular-nums">
                  Rp {formatRupiah(totalAggregatedCost)}
                </div>
                <div className="text-[10px] text-text-muted mt-0.5">
                  {summaryPackagesCount} Paket Grup WBS
                </div>
              </div>

              <div className="p-3 bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 rounded-xl border border-emerald-500/20 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Pekerjaan Lapangan (Work)</span>
                  <Layers size={14} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                  Rp {formatRupiah(totalWorkCost)}
                </div>
                <div className="text-[10px] text-text-muted mt-0.5">
                  {workItemsCount} Item Pekerjaan Fisik
                </div>
              </div>

              <div className="p-3 bg-gradient-to-br from-amber-500/5 to-amber-500/10 rounded-xl border border-amber-500/20 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Pengadaan Material (Supply)</span>
                  <Package size={14} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="text-base font-extrabold text-amber-600 dark:text-amber-400 font-mono tabular-nums">
                  Rp {formatRupiah(totalSupplyCost)}
                </div>
                <div className="text-[10px] text-text-muted mt-0.5">
                  {supplyItemsCount} Item Logistik & Swakelola
                </div>
              </div>

              <div className="p-3 bg-bg-secondary rounded-xl border border-border shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase font-bold text-text-muted">Distribusi Biaya</span>
                  <TrendingUp size={14} className="text-text-muted" />
                </div>
                <div className="text-xs font-semibold text-text-primary mt-1">
                  Pekerjaan: <span className="font-bold text-emerald-600 font-mono tabular-nums">{getWeight(totalWorkCost)}%</span>
                </div>
                <div className="text-xs font-semibold text-text-primary mt-0.5">
                  Material: <span className="font-bold text-amber-600 font-mono tabular-nums">{getWeight(totalSupplyCost)}%</span>
                </div>
              </div>
            </div>

            {/* ERP Batch Action Toolbar (Floating/Sticky when rows are selected) */}
            {selectedTaskIds.length > 0 && (
              <div className="sticky top-2 z-30 mb-3 px-4 py-2.5 bg-slate-900 text-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-700 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white font-mono text-xs font-bold shadow-xs">
                      {selectedTaskIds.length}
                    </span>
                    <span className="text-xs font-semibold text-slate-100">
                      Item WBS Terpilih
                    </span>
                  </div>
                  <div className="h-4 w-px bg-slate-700 hidden sm:block" />
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[11px] text-slate-300 hover:text-white underline font-medium"
                  >
                    {selectedTaskIds.length === tasks.length ? 'Batal Semua' : `Pilih Semua (${tasks.length})`}
                  </button>
                </div>

                {/* Bulk Action Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Bulk Type Change */}
                  <div className="flex items-center gap-1 bg-slate-800 dark:bg-slate-700 rounded-lg px-2 py-1 border border-slate-700">
                    <Layers size={13} className="text-slate-400" />
                    <span className="text-[11px] text-slate-400 font-medium mr-1">Tipe:</span>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleBulkChangeType(e.target.value as any);
                          e.target.value = '';
                        }
                      }}
                      defaultValue=""
                      className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="" disabled className="text-slate-900">Ubah Tipe...</option>
                      <option value="summary" className="text-slate-900">📁 Grup WBS</option>
                      <option value="work" className="text-slate-900">🔨 Pekerjaan (Work)</option>
                      <option value="supply" className="text-slate-900">📦 Material (Supply)</option>
                      <option value="milestone" className="text-slate-900">🏁 Milestone</option>
                    </select>
                  </div>

                  {/* Bulk Category Change */}
                  <div className="flex items-center gap-1 bg-slate-800 dark:bg-slate-700 rounded-lg px-2 py-1 border border-slate-700">
                    <Tag size={13} className="text-slate-400" />
                    <span className="text-[11px] text-slate-400 font-medium mr-1">Kategori:</span>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleBulkChangeCategory(e.target.value as any);
                          e.target.value = '';
                        }
                      }}
                      defaultValue=""
                      className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="" disabled className="text-slate-900">Ubah Kategori...</option>
                      {CATEGORY_OPTIONS.map((cat) => (
                        <option key={cat.value} value={cat.value} className="text-slate-900">
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bulk Unit Change */}
                  <div className="flex items-center gap-1 bg-slate-800 dark:bg-slate-700 rounded-lg px-2 py-1 border border-slate-700">
                    <Boxes size={13} className="text-slate-400" />
                    <span className="text-[11px] text-slate-400 font-medium mr-1">Satuan:</span>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleBulkChangeUnit(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      defaultValue=""
                      className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="" disabled className="text-slate-900">Ubah Satuan...</option>
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u} className="text-slate-900">
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bulk Hierarchy Indent / Outdent */}
                  <div className="flex items-center gap-1 bg-slate-800 dark:bg-slate-700 rounded-lg p-0.5 border border-slate-700">
                    <button
                      type="button"
                      onClick={handleBulkOutdent}
                      title="Outdent Level (Geser ke luar)"
                      className="px-2 py-1 hover:bg-slate-700 rounded text-slate-200 hover:text-white text-xs flex items-center gap-1 transition-colors"
                    >
                      <ArrowLeft size={13} />
                      <span className="hidden sm:inline">Outdent</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkIndent}
                      title="Indent Level (Geser ke dalam / jadi subtask)"
                      className="px-2 py-1 hover:bg-slate-700 rounded text-slate-200 hover:text-white text-xs flex items-center gap-1 transition-colors"
                    >
                      <ArrowRight size={13} />
                      <span className="hidden sm:inline">Indent</span>
                    </button>
                  </div>

                  {/* Bulk Delete */}
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Trash2 size={13} />
                    <span>Hapus ({selectedTaskIds.length})</span>
                  </button>

                  {/* Deselect / Cancel */}
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                    title="Batal Pilihan (Esc)"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* ERP Interactive WBS Table */}
            <div className="border border-border rounded-xl overflow-hidden shadow-xs bg-bg-primary">
              <div className="overflow-x-auto">
                <table role="grid" className="w-full text-left text-xs border-collapse min-w-[1140px]">
                  <thead>
                    <tr role="row" className="bg-bg-secondary border-b border-border text-text-secondary font-bold text-[11px] uppercase tracking-wider">
                      <th role="columnheader" className="py-2.5 px-3 w-[44px] text-center">
                        <input
                          type="checkbox"
                          checked={tasks.length > 0 && selectedTaskIds.length === tasks.length}
                          ref={(el) => {
                            if (el) {
                              el.indeterminate = selectedTaskIds.length > 0 && selectedTaskIds.length < tasks.length;
                            }
                          }}
                          onChange={handleSelectAll}
                          aria-label="Pilih semua baris WBS"
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </th>
                      <th role="columnheader" className="py-2.5 px-3 w-[110px] text-left">WBS / Level</th>
                      <th role="columnheader" className="py-2.5 px-3 w-[150px] text-left">Tipe Item</th>
                      <th role="columnheader" className="py-2.5 px-3 min-w-[270px] text-left">Nama Task / Subtask</th>
                      <th role="columnheader" className="py-2.5 px-3 w-[140px] text-left">Kategori</th>
                      <th role="columnheader" className="py-2.5 px-3 w-[90px] text-right">Volume</th>
                      <th role="columnheader" className="py-2.5 px-3 w-[85px] text-left">Satuan</th>
                      <th role="columnheader" className="py-2.5 px-3 w-[145px] text-right">Harga Satuan (Rp)</th>
                      <th role="columnheader" className="py-2.5 px-3 w-[155px] text-right">Total Biaya (Rp)</th>
                      <th role="columnheader" className="py-2.5 px-3 w-[80px] text-right">Durasi</th>
                      <th role="columnheader" className="py-2.5 px-3 w-[170px] text-left">Aksi Hierarki</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {tasks.map((task, index) => {
                      const isSelected = selectedTaskIds.includes(task.id);
                      const isSummary = task.itemType === 'summary' || summaryCostMap.has(task.id);
                      const isMilestone = task.itemType === 'milestone';
                      const rollUpCost = summaryCostMap.get(task.id);
                      const displayCost = isSummary && rollUpCost !== undefined ? rollUpCost : task.cost;
                      const indentPadding = (Math.max(1, task.outlineLevel) - 1) * 20;

                      return (
                        <tr
                          key={task.id}
                          role="row"
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-primary/10 border-l-4 border-l-primary font-medium shadow-xs'
                              : isSummary
                              ? 'bg-purple-500/5 font-semibold hover:bg-purple-500/10'
                              : isMilestone
                              ? 'bg-blue-500/5 hover:bg-blue-500/10'
                              : task.itemType === 'supply'
                              ? 'bg-amber-500/5 hover:bg-amber-500/10'
                              : 'bg-emerald-500/5 hover:bg-emerald-500/10'
                          }`}
                        >
                          {/* Row Selection Checkbox */}
                          <td role="gridcell" className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleToggleSelect(task.id, index, (e.nativeEvent as MouseEvent).shiftKey)}
                              aria-label={`Pilih baris ${task.wbsCode || index + 1}`}
                              className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                            />
                          </td>

                          {/* WBS Code & Level */}
                          <td role="gridcell" className="py-2 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded font-mono text-[10px] font-extrabold tabular-nums ${
                                  isSummary
                                    ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
                                    : task.itemType === 'supply'
                                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                    : task.itemType === 'milestone'
                                    ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                                    : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                }`}
                              >
                                {task.wbsCode || `${index + 1}`}
                              </span>
                              <span className="text-[10px] text-text-muted font-mono">L{task.outlineLevel}</span>
                            </div>
                          </td>

                          {/* Item Type Selector */}
                          <td role="gridcell" className="py-2 px-3">
                            <select
                              value={task.itemType}
                              onChange={(e) => updateTask(index, 'itemType', e.target.value)}
                              className={`w-full py-1 px-2 rounded-md text-xs font-semibold border cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary ${
                                task.itemType === 'summary'
                                  ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30'
                                  : task.itemType === 'supply'
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                  : task.itemType === 'milestone'
                                  ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30'
                                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              <option value="summary">📁 Grup WBS</option>
                              <option value="work">🔨 Pekerjaan (Work)</option>
                              <option value="supply">📦 Material (Supply)</option>
                              <option value="milestone">🏁 Milestone</option>
                            </select>
                          </td>

                          {/* Task Name with visual tree branch indentation */}
                          <td role="gridcell" className="py-2 px-3">
                            <div className="flex items-center" style={{ paddingLeft: `${indentPadding}px` }}>
                              {task.outlineLevel > 1 && (
                                <CornerDownRight size={13} className="text-text-muted mr-1.5 shrink-0 opacity-60" />
                              )}
                              <input
                                type="text"
                                value={task.name}
                                onChange={(e) => updateTask(index, 'name', e.target.value)}
                                placeholder={
                                  isSummary
                                    ? 'Nama Paket WBS...'
                                    : task.itemType === 'supply'
                                    ? 'Nama Material / Barang...'
                                    : isMilestone
                                    ? 'Milestone Target...'
                                    : 'Nama Item Pekerjaan...'
                                }
                                className={`w-full py-1.5 px-2.5 rounded-lg border bg-bg-primary text-xs text-text-primary focus:outline-none focus:border-primary ${
                                  isSummary ? 'font-bold' : ''
                                } border-border h-8`}
                              />
                            </div>
                          </td>

                          {/* Category */}
                          <td role="gridcell" className="py-2 px-3">
                            {isSummary || isMilestone ? (
                              <span className="text-[11px] text-text-muted italic px-2">Umum</span>
                            ) : (
                              <select
                                value={task.category}
                                onChange={(e) => updateTask(index, 'category', e.target.value)}
                                className="w-full py-1 px-2 rounded-lg border border-border bg-bg-primary text-xs text-text-primary focus:outline-none focus:border-primary h-8"
                              >
                                {CATEGORY_OPTIONS.map((cat) => (
                                  <option key={cat.value} value={cat.value}>
                                    {cat.label}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>

                          {/* Volume (Right-aligned numeric) */}
                          <td role="gridcell" className="py-2 px-2 text-right">
                            {isSummary || isMilestone ? (
                              <span className="text-[11px] text-text-muted px-2 block font-mono">-</span>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={task.quantity || ''}
                                onChange={(e) => updateTask(index, 'quantity', Number(e.target.value) || 0)}
                                className="w-full py-1 px-2 rounded-lg border border-border bg-bg-primary text-xs text-text-primary font-mono tabular-nums text-right focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 h-8"
                              />
                            )}
                          </td>

                          {/* Unit (Left-aligned) */}
                          <td role="gridcell" className="py-2 px-2 text-left">
                            {isMilestone ? (
                              <span className="text-[11px] text-text-muted px-2 block">-</span>
                            ) : (
                              <select
                                value={task.unit || 'ls'}
                                onChange={(e) => updateTask(index, 'unit', e.target.value)}
                                className="w-full py-1 px-1.5 rounded-lg border border-border bg-bg-primary text-xs text-text-primary focus:outline-none focus:border-primary h-8"
                              >
                                {UNIT_OPTIONS.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>

                          {/* Unit Rate (CostInput with 1.000.000 look) */}
                          <td role="gridcell" className="py-2 px-2 text-right">
                            {isSummary || isMilestone ? (
                              <span className="text-[11px] text-text-muted px-2 block font-mono">-</span>
                            ) : (
                              <CostInput
                                compact
                                prefix="Rp"
                                value={task.unitRate || 0}
                                onChange={(val) => updateTask(index, 'unitRate', val)}
                              />
                            )}
                          </td>

                          {/* Total Cost (CostInput with 1.000.000 look, or roll-up on summary) */}
                          <td role="gridcell" className="py-2 px-2 text-right">
                            {isSummary ? (
                              <div className="py-1 px-2.5 rounded-lg bg-purple-500/10 font-bold text-purple-700 dark:text-purple-300 text-right font-mono text-xs tabular-nums border border-purple-500/20">
                                Rp {formatRupiah(displayCost)}
                              </div>
                            ) : isMilestone ? (
                              <span className="text-[11px] text-text-muted px-2 block font-mono">Rp 0</span>
                            ) : (
                              <CostInput
                                compact
                                prefix="Rp"
                                value={task.cost || 0}
                                onChange={(val) => updateTask(index, 'cost', val)}
                              />
                            )}
                          </td>

                          {/* Duration (Right-aligned numeric) */}
                          <td role="gridcell" className="py-2 px-2 text-right">
                            {isMilestone ? (
                              <span className="text-[10px] text-blue-500 font-bold font-mono px-1">0 h</span>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  value={task.duration || 1}
                                  onChange={(e) => updateTask(index, 'duration', Math.max(1, Number(e.target.value) || 1))}
                                  className="w-12 py-1 px-1 rounded-lg border border-border bg-bg-primary text-xs text-text-primary font-mono tabular-nums text-right focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 h-8"
                                />
                                <span className="text-[10px] text-text-muted">h</span>
                              </div>
                            )}
                          </td>

                          {/* Action Toolbar per row */}
                          <td role="gridcell" className="py-2 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              {/* Indent button */}
                              <button
                                type="button"
                                onClick={() => handleIndent(index)}
                                disabled={index === 0}
                                className="w-6 h-6 rounded flex items-center justify-center bg-bg-secondary text-text-secondary hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors border border-border"
                                title="Indent (Jadikan Subtask - Geser ke Dalam)"
                              >
                                <ArrowRight size={12} />
                              </button>

                              {/* Outdent button */}
                              <button
                                type="button"
                                onClick={() => handleOutdent(index)}
                                disabled={task.outlineLevel <= 1}
                                className="w-6 h-6 rounded flex items-center justify-center bg-bg-secondary text-text-secondary hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors border border-border"
                                title="Outdent (Naikkan Tingkat - Geser ke Luar)"
                              >
                                <ArrowLeft size={12} />
                              </button>

                              {/* Add Subtask */}
                              <button
                                type="button"
                                onClick={() => handleAddSubtask(index)}
                                className="px-1.5 h-6 rounded flex items-center gap-0.5 bg-bg-secondary text-[10px] font-bold text-text-secondary hover:bg-primary/10 hover:text-primary transition-colors border border-border"
                                title="Tambah Subtask di bawah baris ini"
                              >
                                <Plus size={10} />
                                <span>Sub</span>
                              </button>

                              {/* Move up */}
                              <button
                                type="button"
                                onClick={() => handleMoveUp(index)}
                                disabled={index === 0}
                                className="w-6 h-6 rounded flex items-center justify-center bg-bg-secondary text-text-secondary hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors border border-border"
                                title="Geser ke Atas"
                              >
                                <MoveUp size={11} />
                              </button>

                              {/* Move down */}
                              <button
                                type="button"
                                onClick={() => handleMoveDown(index)}
                                disabled={index === tasks.length - 1}
                                className="w-6 h-6 rounded flex items-center justify-center bg-bg-secondary text-text-secondary hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors border border-border"
                                title="Geser ke Bawah"
                              >
                                <MoveDown size={11} />
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => handleRemoveTask(index)}
                                className="w-6 h-6 rounded flex items-center justify-center bg-transparent text-text-muted hover:bg-red-500/10 hover:text-red-500 transition-colors border border-transparent"
                                title="Hapus Baris"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {tasks.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-text-muted">
                          <Boxes size={36} className="mx-auto mb-2 opacity-40 text-primary" />
                          <p className="text-sm font-semibold text-text-primary m-0">Tabel WBS Masih Kosong</p>
                          <p className="text-xs text-text-muted m-0 mt-1">
                            Klik tombol di bawah untuk memuat contoh struktur WBS standar atau menambah baris baru.
                          </p>
                          <div className="flex justify-center gap-2 mt-4">
                            <button
                              type="button"
                              onClick={handleResetToTemplate}
                              className="px-3.5 py-1.5 text-xs font-bold text-white bg-primary rounded-xl cursor-pointer hover:opacity-90 transition-all shadow-xs"
                            >
                              Muat Struktur Standar Konstruksi
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddRow()}
                              className="px-3.5 py-1.5 text-xs font-bold text-primary bg-primary/10 border border-primary/20 rounded-xl cursor-pointer hover:bg-primary/20 transition-all"
                            >
                              + Baris Pertama
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ERP UX Guidance & Keyboard Navigation Footer */}
              <div className="p-3 bg-bg-secondary/40 border-t border-border flex items-center justify-between text-[11px] text-text-muted max-sm:flex-col max-sm:items-start max-sm:gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 font-semibold text-text-secondary">
                    <Keyboard size={13} />
                    <span>ERP Keyboard Ergonomics:</span>
                  </span>
                  <span><kbd className="px-1.5 py-0.5 rounded bg-bg-primary border border-border text-[10px] font-mono">Tab</kbd> Geser kolom</span>
                  <span><kbd className="px-1.5 py-0.5 rounded bg-bg-primary border border-border text-[10px] font-mono">→</kbd> Indent</span>
                  <span><kbd className="px-1.5 py-0.5 rounded bg-bg-primary border border-border text-[10px] font-mono">←</kbd> Outdent</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  <ShieldCheck size={14} />
                  <span>Formatted dot currency (1.000.000) active</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review & Finalisasi */}
        {currentStep === 3 && (
          <div className="space-y-5 animate-fade-in max-w-4xl mx-auto">
            <div className="border-b border-border pb-3">
              <h3 className="text-base font-bold text-text-primary m-0 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-success" />
                <span>Review & Finalisasi Struktur WBS Proyek</span>
              </h3>
              <p className="text-xs text-text-muted m-0 mt-0.5">
                Verifikasi pohon hierarki WBS yang akan disinkronkan ke CPM Gantt Chart, Kurva-S, RAB, dan Pengadaan Swakelola.
              </p>
            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-4 gap-3 max-sm:grid-cols-2">
              <div className="p-3 bg-bg-secondary rounded-xl border border-border">
                <span className="text-[10px] uppercase font-bold text-text-muted block mb-1">Total Anggaran WBS</span>
                <span className="text-sm font-extrabold text-primary block font-mono tabular-nums">Rp {formatRupiah(effectiveBudget)}</span>
              </div>
              <div className="p-3 bg-bg-secondary rounded-xl border border-border">
                <span className="text-[10px] uppercase font-bold text-text-muted block mb-1">Item Pekerjaan (Work)</span>
                <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 block font-mono tabular-nums">{workItemsCount} Subtask</span>
              </div>
              <div className="p-3 bg-bg-secondary rounded-xl border border-border">
                <span className="text-[10px] uppercase font-bold text-text-muted block mb-1">Pengadaan Material</span>
                <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400 block font-mono tabular-nums">{supplyItemsCount} Item</span>
              </div>
              <div className="p-3 bg-bg-secondary rounded-xl border border-border">
                <span className="text-[10px] uppercase font-bold text-text-muted block mb-1">Periode Proyek</span>
                <span className="text-xs font-bold text-text-primary block truncate font-mono">
                  {projectData.startDate || 'TBA'} s/d {projectData.endDate || 'TBA'}
                </span>
              </div>
            </div>

            {/* Single Source of Truth Guarantee Banner */}
            <div className="p-4 bg-success/10 border border-success/30 rounded-xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-success text-white flex items-center justify-center shrink-0">
                <Sparkles size={18} />
              </div>
              <div className="text-xs">
                <span className="font-bold text-success block text-sm">Sinkronisasi Penuh ke Single Source of Truth</span>
                <span className="text-text-muted">
                  Setelah disimpan, struktur WBS ini langsung menjadi basis utama untuk MS Project Plan Gantt (/project-plan), Detail Kurva-S Proyek (/project), dan Pengadaan SCM Swakelola (/project-swakelola) tanpa duplikasi data.
                </span>
              </div>
            </div>

            {/* Hierarchical WBS Tree Preview */}
            <div className="border border-border rounded-xl overflow-hidden bg-bg-primary">
              <div className="bg-bg-secondary/60 p-3 px-4 border-b border-border flex justify-between items-center text-xs font-bold text-text-primary">
                <span>Pohon Struktur WBS & Komposisi Subtask</span>
                <span className="text-right">Estimasi Biaya</span>
              </div>

              <div className="divide-y divide-border/60 text-xs">
                {tasks.map((t) => {
                  const isSummary = t.itemType === 'summary' || summaryCostMap.has(t.id);
                  const isMilestone = t.itemType === 'milestone';
                  const rollUp = summaryCostMap.get(t.id);
                  const costVal = isSummary && rollUp !== undefined ? rollUp : t.cost;
                  const indentPx = (Math.max(1, t.outlineLevel) - 1) * 20;

                  return (
                    <div
                      key={t.id}
                      className={`p-2.5 px-4 flex items-center justify-between transition-colors ${
                        isSummary
                          ? 'bg-primary/5 font-bold text-text-primary'
                          : isMilestone
                          ? 'bg-blue-500/5'
                          : 'hover:bg-bg-secondary/40'
                      }`}
                      style={{ paddingLeft: `${16 + indentPx}px` }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {t.outlineLevel > 1 && (
                          <CornerDownRight size={13} className="text-text-muted shrink-0 opacity-60" />
                        )}
                        <span className="text-[10px] font-mono font-extrabold text-primary bg-primary/10 px-1.5 py-0.5 rounded tabular-nums">
                          {t.wbsCode}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            t.itemType === 'supply'
                              ? 'bg-amber-500/10 text-amber-600'
                              : t.itemType === 'work'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : t.itemType === 'milestone'
                              ? 'bg-blue-500/10 text-blue-600'
                              : 'bg-purple-500/10 text-purple-600'
                          }`}
                        >
                          {t.itemType.toUpperCase()}
                        </span>
                        <span className="text-text-primary font-medium truncate">{t.name || '(Tanpa Nama)'}</span>
                        {!isSummary && !isMilestone && (
                          <span className="text-[10px] text-text-muted font-mono tabular-nums">
                            ({t.quantity} {t.unit} @ Rp {formatRupiah(t.unitRate)})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {effectiveBudget > 0 && costVal > 0 && (
                          <Badge label={`${getWeight(costVal)}%`} variant="neutral" size="small" />
                        )}
                        <span className="font-semibold text-text-primary font-mono tabular-nums">Rp {formatRupiah(costVal)}</span>
                      </div>
                    </div>
                  );
                })}

                {tasks.length === 0 && (
                  <div className="p-4 text-center text-text-muted italic">
                    Belum ada task dalam struktur WBS. Silakan kembali ke langkah sebelumnya.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Navigation Buttons */}
      <div className={`flex justify-between gap-4 max-sm:flex-col [&>button]:max-sm:w-full ${currentStep === 0 ? 'justify-end' : ''}`}>
        {currentStep > 0 && (
          <Button
            title={t('addProject.actions.back', 'Kembali')}
            icon={ChevronLeft}
            onClick={handleBack}
            variant="outline"
          />
        )}
        {currentStep < STEPS.length - 1 ? (
          <Button
            title={t('addProject.actions.next', 'Lanjut')}
            icon={ChevronRight}
            iconPosition="right"
            onClick={handleNext}
            variant="primary"
          />
        ) : (
          <Button
            title="Simpan & Buat Proyek WBS"
            icon={Check}
            onClick={handleSubmit}
            loading={loading}
            variant="success"
            size="medium"
          />
        )}
      </div>

      {/* ===== Import Preview Modal ===== */}
      {showImportPreview && importData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-bg-primary rounded-2xl shadow-2xl w-full max-w-[780px] max-h-[85vh] flex flex-col overflow-hidden border border-border animate-slide-up">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-bg-secondary/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Eye size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text-primary m-0">{t('addProject.import.previewTitle', 'Pratinjau Data Impor WBS')}</h2>
                  <p className="text-xs text-text-muted m-0 mt-0.5">Tinjau struktur WBS spreadsheet sebelum dimuat ke dalam wizard</p>
                </div>
              </div>
              <button
                onClick={() => { setShowImportPreview(false); setImportData(null); }}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-transparent text-text-muted cursor-pointer transition-all border-none hover:bg-bg-secondary hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            {/* Preview Tabs */}
            <div className="flex border-b border-border px-5 gap-1 bg-bg-primary">
              {previewTabs.map((tab, i) => (
                <button
                  key={i}
                  onClick={() => setImportPreviewTab(i)}
                  className={`px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer bg-transparent ${
                    importPreviewTab === i
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="ml-2 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold tabular-nums">{tab.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Preview Content */}
            <div className="p-5 overflow-y-auto max-h-[50vh] text-xs">
              {importPreviewTab === 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-text-muted">Nama Proyek:</span>
                    <span className="font-bold text-text-primary">{importData.projectData?.nama || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-text-muted">Lokasi:</span>
                    <span className="font-bold text-text-primary">{importData.projectData?.lokasi || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-text-muted">Total Anggaran:</span>
                    <span className="font-bold text-primary font-mono tabular-nums">Rp {formatRupiah(Number(importData.projectData?.totalBudget) || 0)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-text-muted">Periode:</span>
                    <span className="font-bold text-text-primary font-mono">
                      {importData.projectData?.startDate || '-'} s/d {importData.projectData?.endDate || '-'}
                    </span>
                  </div>
                </div>
              )}

              {importPreviewTab === 1 && (
                <div className="space-y-2">
                  {importData.tasks?.map((t: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-bg-secondary rounded-lg flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded tabular-nums">
                          {t.wbsCode || `${idx + 1}`}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            t.itemType === 'supply'
                              ? 'bg-amber-500/10 text-amber-600'
                              : t.itemType === 'work'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : t.itemType === 'milestone'
                              ? 'bg-blue-500/10 text-blue-600'
                              : 'bg-purple-500/10 text-purple-600'
                          }`}
                        >
                          {String(t.itemType || 'work').toUpperCase()}
                        </span>
                        <div>
                          <span className="font-bold text-text-primary block">{t.name}</span>
                          <span className="text-text-muted text-[11px] font-mono tabular-nums">
                            {t.quantity} {t.unit} (L{t.outlineLevel || 1})
                          </span>
                        </div>
                      </div>
                      <span className="font-bold text-text-primary font-mono tabular-nums">Rp {formatRupiah(Number(t.cost) || 0)}</span>
                    </div>
                  ))}
                  {(!importData.tasks || importData.tasks.length === 0) && (
                    <p className="text-text-muted text-center py-4">Tidak ada data tasks pada sheet WBS</p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-bg-secondary/40 border-t border-border flex justify-end gap-3">
              <Button
                title="Batal"
                onClick={() => { setShowImportPreview(false); setImportData(null); }}
                variant="outline"
                size="small"
              />
              <Button
                title={t('addProject.import.confirmImport', 'Konfirmasi & Muat ke Tabel WBS')}
                icon={Check}
                onClick={handleConfirmImport}
                variant="primary"
                size="small"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
