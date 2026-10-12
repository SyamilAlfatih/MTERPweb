import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  Calendar,
  DollarSign,
  User,
  Folder,
  AlertCircle,
  Truck,
  FileText,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Download,
  Camera,
  Layers,
  ShoppingBag,
  ExternalLink,
  ShieldCheck,
  Building2,
  Phone,
  Eye,
  Check,
  X,
  AlertTriangle,
  SlidersHorizontal,
  UserCheck,
  Users,
  Lock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api, {
  createMaterialRequest,
  reviewMaterialRequest,
  opsApproveMaterialRequest,
  submitSupplierComparisons,
  financeApproveMaterialRequest,
  dispatchMaterialOrder,
  receiveMaterialOrder,
  deleteMaterialRequest,
  getProcurementAuthorizers,
  assignProcurementAuthorizers,
} from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Button, Input, EmptyState, LoadingOverlay, Badge } from '../components/shared';
import {
  MaterialRequest,
  IProcurementItem,
  ISupplierComparison,
  ISupplierComparisonItemRate,
  ProjectData,
  ProcurementStatus,
  ProcurementAuthorizersResponse,
} from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { formatDate } from '../utils/date';
import {
  exportPurchaseRequestPdf,
  exportPurchaseOrderPdf,
  exportGoodsReceiptPdf,
} from '../utils/exportProcurementPdf';

type PipelineTab = 'PR' | 'PO_SOURCING' | 'MUST_PURCHASE' | 'ON_THE_WAY' | 'DELIVERED' | 'ALL';

const formatRupiah = (num?: number) => {
  if (num === undefined || num === null || isNaN(num)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
};

const fmtDateStr = (d?: string) => {
  if (!d) return '-';
  try {
    return formatDate(d);
  } catch {
    return d;
  }
};

const EMPTY_LINE_ITEM: IProcurementItem = {
  isRabBased: false,
  item: '',
  specifications: '',
  qty: 1,
  unit: 'Pcs',
  budgetUnitRate: 0,
  totalBudget: 0,
};

export default function Materials() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Tabs
  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<PipelineTab>('PR');

  // Authorizers Directory & Assignment State
  const [authorizers, setAuthorizers] = useState<ProcurementAuthorizersResponse>({
    all: [],
    reviewers: [],
    opsApprovers: [],
    financeApprovers: [],
  });
  const [showAuthorizerDirectoryModal, setShowAuthorizerDirectoryModal] = useState(false);
  const [assignModalOrder, setAssignModalOrder] = useState<MaterialRequest | null>(null);
  const [assignReviewerId, setAssignReviewerId] = useState('');
  const [assignOpsApproverId, setAssignOpsApproverId] = useState('');
  const [assignFinanceApproverId, setAssignFinanceApproverId] = useState('');
  const [savingAssignment, setSavingAssignment] = useState(false);

  // Multi-Item PR Creation Modal State
  const [showAddPrModal, setShowAddPrModal] = useState(false);
  const [prMode, setPrMode] = useState<'RAB' | 'NON_RAB'>('RAB');
  const [loadingRab, setLoadingRab] = useState(false);
  const [prProjectId, setPrProjectId] = useState('');
  const [prDateNeeded, setPrDateNeeded] = useState('');
  const [prUrgency, setPrUrgency] = useState<'Low' | 'Normal' | 'High' | 'Urgent'>('Normal');
  const [prPurpose, setPrPurpose] = useState('');
  const [prReviewerId, setPrReviewerId] = useState('');
  const [prOpsApproverId, setPrOpsApproverId] = useState('');
  const [prFinanceApproverId, setPrFinanceApproverId] = useState('');
  const [prItems, setPrItems] = useState<IProcurementItem[]>([{ ...EMPTY_LINE_ITEM, isRabBased: true }]);
  const [projectRabItems, setProjectRabItems] = useState<any[]>([]);
  const [submittingPr, setSubmittingPr] = useState(false);

  // Review & Approval Modals
  const [reviewModalOrder, setReviewModalOrder] = useState<MaterialRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewPassphrase, setReviewPassphrase] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const [opsApproveOrder, setOpsApproveOrder] = useState<MaterialRequest | null>(null);
  const [opsPassphrase, setOpsPassphrase] = useState('');
  const [opsApproving, setOpsApproving] = useState(false);

  // Sourcing & Multi-Supplier Comparison Modal State
  const [sourcingOrder, setSourcingOrder] = useState<MaterialRequest | null>(null);
  const [candidateSuppliers, setCandidateSuppliers] = useState<ISupplierComparison[]>([]);
  const [sourcingViewMode, setSourcingViewMode] = useState<'form' | 'matrix'>('form');
  const [activeVendorIndex, setActiveVendorIndex] = useState<number>(0);
  const [sourcingFinanceApproverId, setSourcingFinanceApproverId] = useState<string>('');
  const [submittingSourcing, setSubmittingSourcing] = useState(false);

  // Finance Approval Modal State
  const [financeApproveOrder, setFinanceApproveOrder] = useState<MaterialRequest | null>(null);
  const [financePassphrase, setFinancePassphrase] = useState('');
  const [financeApproving, setFinanceApproving] = useState(false);

  // In-Transit Dispatch Modal State
  const [dispatchOrder, setDispatchOrder] = useState<MaterialRequest | null>(null);
  const [dispatchForm, setDispatchForm] = useState({
    driverName: '',
    driverPhone: '',
    vehiclePlate: '',
    eta: '',
    notes: '',
  });
  const [suratJalanFile, setSuratJalanFile] = useState<File | null>(null);
  const [submittingDispatch, setSubmittingDispatch] = useState(false);

  // Goods Receipt / Site Reception Modal State
  const [receiveOrder, setReceiveOrder] = useState<MaterialRequest | null>(null);
  const [sitePhotoFile, setSitePhotoFile] = useState<File | null>(null);
  const [sitePhotoPreview, setSitePhotoPreview] = useState<string | null>(null);
  const [receivingItemsState, setReceivingItemsState] = useState<any[]>([]);
  const [overallCondition, setOverallCondition] = useState<'Good' | 'Damaged' | 'Partial'>('Good');
  const [receiverNotes, setReceiverNotes] = useState('');
  const [submittingReceive, setSubmittingReceive] = useState(false);

  // Expanded items in list view
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);

  // User role helpers
  const userRole = user?.role?.toLowerCase() || 'worker';
  const isOwner = userRole === 'owner';
  const canReview = ['owner', 'director', 'operational_director', 'site_manager', 'supervisor', 'admin_project'].includes(userRole);
  const canOpsApprove = ['owner', 'president_director', 'operational_director', 'director'].includes(userRole);
  const canFinanceApprove = ['owner', 'president_director', 'director'].includes(userRole);
  const canSourcing = ['owner', 'director', 'operational_director', 'asset_admin', 'admin_project', 'supervisor'].includes(userRole);
  const canReceive = ['owner', 'director', 'operational_director', 'site_manager', 'supervisor', 'foreman', 'asset_admin'].includes(userRole);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reqRes, projRes, authRes] = await Promise.all([
        api.get('/requests'),
        api.get('/projects'),
        isOwner
          ? getProcurementAuthorizers().catch(() => ({ all: [], reviewers: [], opsApprovers: [], financeApprovers: [] }))
          : Promise.resolve({ all: [], reviewers: [], opsApprovers: [], financeApprovers: [] }),
      ]);
      setRequests(reqRes.data);
      setProjects(projRes.data);
      if (authRes && isOwner) {
        setAuthorizers(authRes);
      }
    } catch (err) {
      console.error('Failed to fetch procurement data', err);
    } finally {
      setLoading(false);
    }
  };

  // Open PR modal with default authorizers pre-selected (if owner)
  const handleOpenAddPrModal = () => {
    setPrMode('RAB');
    setPrProjectId('');
    setProjectRabItems([]);
    setPrPurpose('');
    setPrDateNeeded('');
    setPrUrgency('Normal');
    setPrItems([{ ...EMPTY_LINE_ITEM, isRabBased: true }]);
    if (isOwner) {
      if (!prReviewerId && authorizers.reviewers.length > 0) {
        setPrReviewerId(authorizers.reviewers[0]._id);
      }
      if (!prOpsApproverId && authorizers.opsApprovers.length > 0) {
        setPrOpsApproverId(authorizers.opsApprovers[0]._id);
      }
      if (!prFinanceApproverId && authorizers.financeApprovers.length > 0) {
        setPrFinanceApproverId(authorizers.financeApprovers[0]._id);
      }
    } else {
      setPrReviewerId('');
      setPrOpsApproverId('');
      setPrFinanceApproverId('');
    }
    setShowAddPrModal(true);
  };

  // Switch between RAB-Based and Non-RAB PR
  const handlePrModeChange = (newMode: 'RAB' | 'NON_RAB') => {
    setPrMode(newMode);
    if (newMode === 'NON_RAB') {
      // Convert all lines to Non-RAB
      setPrItems((prev) =>
        prev.map((itm) => ({
          ...itm,
          isRabBased: false,
          rabItemId: undefined,
          wbsCode: '',
        }))
      );
    } else {
      // In RAB mode, mark lines as RAB based
      setPrItems((prev) =>
        prev.map((itm) => ({
          ...itm,
          isRabBased: true,
        }))
      );
      if (prProjectId && projectRabItems.length === 0) {
        handleSelectPrProject(prProjectId);
      }
    }
  };

  // Authorizer quick assignment handlers
  const handleOpenAssignModal = (order: MaterialRequest) => {
    setAssignModalOrder(order);
    const revId = typeof order.assignedReviewerId === 'object' ? order.assignedReviewerId?._id : order.assignedReviewerId;
    const opsId = typeof order.assignedOpsApproverId === 'object' ? order.assignedOpsApproverId?._id : order.assignedOpsApproverId;
    const finId = typeof order.assignedFinanceApproverId === 'object' ? order.assignedFinanceApproverId?._id : order.assignedFinanceApproverId;
    setAssignReviewerId(revId || authorizers.reviewers[0]?._id || '');
    setAssignOpsApproverId(opsId || authorizers.opsApprovers[0]?._id || '');
    setAssignFinanceApproverId(finId || authorizers.financeApprovers[0]?._id || '');
  };

  const handleSaveAssignAuthorizers = async () => {
    if (!assignModalOrder) return;
    setSavingAssignment(true);
    try {
      await assignProcurementAuthorizers(assignModalOrder._id!, {
        assignedReviewerId: assignReviewerId || undefined,
        assignedOpsApproverId: assignOpsApproverId || undefined,
        assignedFinanceApproverId: assignFinanceApproverId || undefined,
      });
      setAssignModalOrder(null);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal memperbarui penugasan approver');
    } finally {
      setSavingAssignment(false);
    }
  };

  // Load RAB items when project is chosen in PR modal
  const handleSelectPrProject = async (projId: string) => {
    setPrProjectId(projId);
    if (!projId) {
      setProjectRabItems([]);
      return;
    }
    setLoadingRab(true);
    try {
      const res = await api.get(`/projects/${projId}/rab`);
      const raw = Array.isArray(res.data?.rabItems)
        ? res.data.rabItems
        : Array.isArray(res.data)
        ? res.data
        : [];
      // Filter out summary/header groups, keeping actionable line items
      const leaves = raw.filter((r: any) => !r.isSummary);
      setProjectRabItems(leaves.length > 0 ? leaves : raw);
    } catch (err) {
      console.error('Failed to fetch project RAB', err);
      setProjectRabItems([]);
    } finally {
      setLoadingRab(false);
    }
  };

  // Multi-item row manipulation
  const handleAddPrItem = () => {
    setPrItems((prev) => [
      ...prev,
      {
        ...EMPTY_LINE_ITEM,
        isRabBased: prMode === 'RAB',
      },
    ]);
  };

  const handleRemovePrItem = (idx: number) => {
    if (prItems.length <= 1) return;
    setPrItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdatePrItem = (idx: number, patch: Partial<IProcurementItem>) => {
    setPrItems((prev) => {
      const copy = [...prev];
      const updated = { ...copy[idx], ...patch };
      const q = Number(updated.qty) || 0;
      const rate = Number(updated.budgetUnitRate) || 0;
      updated.totalBudget = q * rate;
      copy[idx] = updated;
      return copy;
    });
  };

  const handleToggleItemRabType = (idx: number, makeRab: boolean) => {
    if (makeRab) {
      handleUpdatePrItem(idx, {
        isRabBased: true,
      });
    } else {
      handleUpdatePrItem(idx, {
        isRabBased: false,
        rabItemId: undefined,
        wbsCode: '',
      });
    }
  };

  const handleSelectRabItem = (idx: number, rabItemId: string) => {
    const rab = projectRabItems.find((r) => r._id === rabItemId);
    if (!rab) {
      handleUpdatePrItem(idx, { isRabBased: false, rabItemId: undefined, wbsCode: '' });
      return;
    }
    const currentQty = Number(prItems[idx]?.qty) || 1;
    const unitRate = Number(rab.unitRate) || 0;
    handleUpdatePrItem(idx, {
      isRabBased: true,
      rabItemId: rab._id,
      wbsCode: rab.wbsCode,
      item: rab.description,
      unit: rab.unitOfMeasure || 'Pcs',
      budgetUnitRate: unitRate,
      totalBudget: currentQty * unitRate,
    });
  };

  const prTotalEstimatedBudget = useMemo(() => {
    return prItems.reduce((acc, itm) => acc + (Number(itm.totalBudget) || 0), 0);
  }, [prItems]);

  // Submit Multi-Item PR with Configured Reviewer & Approvers
  const handleCreatePrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prMode === 'RAB' && !prProjectId) {
      alert('Mohon pilih proyek tujuan untuk Purchase Request berbasis RAB');
      return;
    }
    if (!prDateNeeded) {
      alert('Mohon tentukan tanggal kebutuhan');
      return;
    }
    const validItems = prItems.filter((i) => i.item.trim().length > 0 && Number(i.qty) > 0);
    if (validItems.length === 0) {
      alert('Mohon lengkapi minimal 1 baris material dengan nama dan kuantitas valid');
      return;
    }

    if (prMode === 'RAB' && projectRabItems.length > 0) {
      const anyRabLinked = validItems.some((i) => i.isRabBased && i.rabItemId);
      if (!anyRabLinked) {
        const proceed = window.confirm(
          'Anda memilih mode Berbasis RAB namun belum memilih mata anggaran RAB pada baris material. Apakah Anda ingin tetap melanjutkan?'
        );
        if (!proceed) return;
      }
    }

    setSubmittingPr(true);
    try {
      await createMaterialRequest({
        projectId: prProjectId || undefined,
        dateNeeded: prDateNeeded,
        urgency: prUrgency,
        purpose: prPurpose,
        items: validItems,
        assignedReviewerId: prReviewerId || undefined,
        assignedOpsApproverId: prOpsApproverId || undefined,
        assignedFinanceApproverId: prFinanceApproverId || undefined,
      });
      setShowAddPrModal(false);
      setPrItems([{ ...EMPTY_LINE_ITEM }]);
      setPrPurpose('');
      setPrDateNeeded('');
      setPrProjectId('');
      setProjectRabItems([]);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal mengajukan Purchase Request');
    } finally {
      setSubmittingPr(false);
    }
  };

  // Submit Supervisor / QC Review (Approve or Reject with Passphrase)
  const handleReviewSubmit = async (action: 'approve' | 'reject' = 'approve') => {
    if (!reviewModalOrder) return;
    if (!reviewPassphrase || reviewPassphrase.length < 4) {
      alert('Passphrase akun Anda wajib diisi (minimal 4 karakter)');
      return;
    }
    if (action === 'reject' && !reviewNotes.trim()) {
      alert('Mohon masukkan alasan penolakan pada kolom catatan');
      return;
    }

    setReviewing(true);
    try {
      await reviewMaterialRequest(reviewModalOrder._id!, {
        action,
        notes: reviewNotes.trim(),
        rejectionReason: reviewNotes.trim(),
        passphrase: reviewPassphrase,
      });
      setReviewModalOrder(null);
      setReviewNotes('');
      setReviewPassphrase('');
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || `Gagal memproses ${action === 'reject' ? 'penolakan' : 'verifikasi'} PR`);
    } finally {
      setReviewing(false);
    }
  };

  // Submit Ops Director Approval
  const handleOpsApproveSubmit = async () => {
    if (!opsApproveOrder || !opsPassphrase) return;
    setOpsApproving(true);
    try {
      await opsApproveMaterialRequest(opsApproveOrder._id!, { passphrase: opsPassphrase });
      setOpsApproveOrder(null);
      setOpsPassphrase('');
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal menyetujui PR');
    } finally {
      setOpsApproving(false);
    }
  };

  // Sourcing & Multi-Supplier Comparison Matrix Handlers
  const handleOpenSourcingModal = (order: MaterialRequest) => {
    setSourcingOrder(order);
    setSourcingViewMode('form');
    setActiveVendorIndex(0);

    const initialFinId = (typeof order.assignedFinanceApproverId === 'object'
      ? order.assignedFinanceApproverId?._id
      : order.assignedFinanceApproverId) || authorizers.financeApprovers[0]?._id || '';
    setSourcingFinanceApproverId(initialFinId);

    const itemsList = order.items && order.items.length > 0 ? order.items : [{
      item: order.item,
      specifications: '',
      qty: Number(order.qty) || 1,
      unit: order.unit || 'Pcs',
      budgetUnitRate: order.costEstimate ? (Number(order.costEstimate) / (Number(order.qty) || 1)) : 0,
      totalBudget: Number(order.costEstimate) || 0,
    }];

    const existingComps = order.supplierComparisons || order.comparisons;
    if (existingComps && existingComps.length > 0) {
      const mapped = existingComps.map((sc: ISupplierComparison, scIdx: number) => {
        const itemRates = itemsList.map((itm, idx) => {
          const existingRate = sc.itemRates?.find((r: ISupplierComparisonItemRate) => r.itemIndex === idx || r.itemName === itm.item);
          const quotedUnitPrice = existingRate ? existingRate.quotedUnitPrice : (itm.budgetUnitRate || 0);
          const quotedTotalAmount = (Number(itm.qty) || 1) * quotedUnitPrice;
          return {
            itemIndex: idx,
            itemName: itm.item,
            quotedUnitPrice,
            quotedTotalAmount,
          };
        });
        const subtotal = itemRates.reduce((acc: number, r: ISupplierComparisonItemRate) => acc + (r.quotedTotalAmount || 0), 0);
        const shipping = Number(sc.shippingCost) || 0;
        return {
          ...sc,
          itemRates,
          subtotalItems: subtotal,
          shippingCost: shipping,
          totalLandedCost: subtotal + shipping,
          isRecommended: sc.isRecommended ?? (scIdx === 0),
        };
      });
      setCandidateSuppliers(mapped);
    } else {
      const createDefaultCandidate = (name: string, loc: string, rec: boolean): ISupplierComparison => {
        const itemRates = itemsList.map((itm, idx) => {
          const rate = itm.budgetUnitRate || 0;
          return {
            itemIndex: idx,
            itemName: itm.item,
            quotedUnitPrice: rate,
            quotedTotalAmount: (Number(itm.qty) || 1) * rate,
          };
        });
        const subtotal = itemRates.reduce((acc, r) => acc + (r.quotedTotalAmount || 0), 0);
        return {
          supplierName: name,
          location: loc,
          contact: '',
          shippingCost: 0,
          paymentTerms: 'Tempo 14 Hari',
          notes: '',
          isRecommended: rec,
          itemRates,
          subtotalItems: subtotal,
          totalLandedCost: subtotal,
        };
      };

      setCandidateSuppliers([
        createDefaultCandidate('Vendor A (Rekomendasi Utama)', 'Lokal / Dekat Proyek', true),
        createDefaultCandidate('Vendor B (Pembanding 1)', 'Pusat Kota', false),
      ]);
    }
  };

  const handleUpdateItemRate = (vendorIdx: number, itemIdx: number, unitPrice: number) => {
    if (!sourcingOrder) return;
    const itemsList = sourcingOrder.items && sourcingOrder.items.length > 0 ? sourcingOrder.items : [{
      item: sourcingOrder.item,
      qty: Number(sourcingOrder.qty) || 1,
    }];
    const itemQty = Number(itemsList[itemIdx]?.qty) || 1;

    setCandidateSuppliers((prev) => {
      const copy = [...prev];
      const supp = { ...copy[vendorIdx] };
      const rates = supp.itemRates ? [...supp.itemRates] : [];
      rates[itemIdx] = {
        itemIndex: itemIdx,
        itemName: itemsList[itemIdx]?.item || '',
        quotedUnitPrice: unitPrice,
        quotedTotalAmount: itemQty * unitPrice,
      };
      supp.itemRates = rates;
      const subtotal = rates.reduce((acc, r) => acc + (Number(r?.quotedTotalAmount) || 0), 0);
      const shipping = Number(supp.shippingCost) || 0;
      supp.subtotalItems = subtotal;
      supp.totalLandedCost = subtotal + shipping;
      copy[vendorIdx] = supp;
      return copy;
    });
  };

  const handleUpdateSupplierField = (vendorIdx: number, patch: Partial<ISupplierComparison>) => {
    setCandidateSuppliers((prev) => {
      const copy = [...prev];
      const supp = { ...copy[vendorIdx], ...patch };
      if ('shippingCost' in patch) {
        const subtotal = supp.subtotalItems || supp.itemRates?.reduce((acc, r) => acc + (Number(r?.quotedTotalAmount) || 0), 0) || 0;
        const shipping = Number(supp.shippingCost) || 0;
        supp.subtotalItems = subtotal;
        supp.totalLandedCost = subtotal + shipping;
      }
      copy[vendorIdx] = supp;
      return copy;
    });
  };

  const handleAddCandidateSupplier = () => {
    if (!sourcingOrder) return;
    const itemsList = sourcingOrder.items && sourcingOrder.items.length > 0 ? sourcingOrder.items : [{
      item: sourcingOrder.item,
      qty: Number(sourcingOrder.qty) || 1,
      budgetUnitRate: 0,
    }];
    const itemRates = itemsList.map((itm, idx) => {
      const rate = itm.budgetUnitRate || 0;
      return {
        itemIndex: idx,
        itemName: itm.item,
        quotedUnitPrice: rate,
        quotedTotalAmount: (Number(itm.qty) || 1) * rate,
      };
    });
    const subtotal = itemRates.reduce((acc, r) => acc + (r.quotedTotalAmount || 0), 0);
    const newIdx = candidateSuppliers.length;
    setCandidateSuppliers((prev) => [
      ...prev,
      {
        supplierName: `Vendor ${String.fromCharCode(65 + newIdx)}`,
        location: '',
        contact: '',
        shippingCost: 0,
        paymentTerms: 'Tempo 14 Hari',
        notes: '',
        isRecommended: false,
        itemRates,
        subtotalItems: subtotal,
        totalLandedCost: subtotal,
      },
    ]);
    setActiveVendorIndex(newIdx);
  };

  const handleRemoveCandidateSupplier = (idx: number) => {
    if (candidateSuppliers.length <= 1) return;
    setCandidateSuppliers((prev) => {
      const filtered = prev.filter((_, i) => i !== idx);
      if (!filtered.some((s) => s.isRecommended)) {
        filtered[0].isRecommended = true;
      }
      return filtered;
    });
    if (activeVendorIndex >= idx && activeVendorIndex > 0) {
      setActiveVendorIndex(activeVendorIndex - 1);
    }
  };

  const handleSelectRecommendedSupplier = (recIdx: number) => {
    setCandidateSuppliers((prev) =>
      prev.map((s, i) => ({ ...s, isRecommended: i === recIdx }))
    );
  };

  // Submit Sourcing Multi-Supplier Comparison Matrix
  const handleSubmitSourcing = async () => {
    if (!sourcingOrder) return;
    const validSuppliers = candidateSuppliers.filter((s) => s.supplierName.trim().length > 0);
    if (validSuppliers.length === 0) {
      alert('Mohon masukkan minimal 1 nama vendor/supplier');
      return;
    }
    const hasRecommended = validSuppliers.some((s) => s.isRecommended);
    if (!hasRecommended) {
      validSuppliers[0].isRecommended = true;
    }

    setSubmittingSourcing(true);
    try {
      const processed = validSuppliers.map((supp) => {
        const itemSubtotal = supp.itemRates?.reduce((acc, r) => acc + (Number(r?.quotedTotalAmount) || 0), 0) || 0;
        const shipping = Number(supp.shippingCost) || 0;
        return {
          ...supp,
          subtotalItems: itemSubtotal,
          shippingCost: shipping,
          totalLandedCost: itemSubtotal + shipping,
        };
      });

      await submitSupplierComparisons(sourcingOrder._id!, {
        comparisons: processed,
        assignedFinanceApproverId: sourcingFinanceApproverId || undefined,
      });
      setSourcingOrder(null);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal mengirim komparasi supplier');
    } finally {
      setSubmittingSourcing(false);
    }
  };

  // Submit Finance Director PO Approval
  const handleFinanceApproveSubmit = async () => {
    if (!financeApproveOrder || !financePassphrase) return;
    setFinanceApproving(true);
    try {
      await financeApproveMaterialRequest(financeApproveOrder._id!, { passphrase: financePassphrase });
      setFinanceApproveOrder(null);
      setFinancePassphrase('');
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal menyetujui PO');
    } finally {
      setFinanceApproving(false);
    }
  };

  // Submit In-Transit Dispatch
  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchOrder) return;

    setSubmittingDispatch(true);
    try {
      const formData = new FormData();
      formData.append('driverName', dispatchForm.driverName);
      formData.append('driverPhone', dispatchForm.driverPhone);
      formData.append('vehiclePlate', dispatchForm.vehiclePlate);
      formData.append('eta', dispatchForm.eta);
      formData.append('notes', dispatchForm.notes);
      if (suratJalanFile) {
        formData.append('suratJalanPhoto', suratJalanFile);
      }

      await dispatchMaterialOrder(dispatchOrder._id!, formData);
      setDispatchOrder(null);
      setSuratJalanFile(null);
      setDispatchForm({ driverName: '', driverPhone: '', vehiclePlate: '', eta: '', notes: '' });
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal mengonfirmasi pengiriman');
    } finally {
      setSubmittingDispatch(false);
    }
  };

  // Open Receive modal and initialize items checklist
  const handleOpenReceiveModal = (order: MaterialRequest) => {
    setReceiveOrder(order);
    const initialItems = (order.items && order.items.length > 0 ? order.items : [{
      item: order.item,
      specifications: '',
      qty: Number(order.qty) || 1,
      unit: order.unit || 'Pcs',
    }]).map((itm: any, idx: number) => ({
      itemIndex: idx,
      item: itm.item,
      specifications: itm.specifications || '',
      qty: itm.qty,
      receivedQty: itm.qty,
      unit: itm.unit,
      receivedCondition: 'Good',
    }));
    setReceivingItemsState(initialItems);
    setSitePhotoFile(null);
    setSitePhotoPreview(null);
  };

  // Submit Goods Receipt at Job Site
  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveOrder) return;
    if (!sitePhotoFile) {
      alert('Foto bukti fisik material di lokasi proyek wajib diunggah');
      return;
    }

    setSubmittingReceive(true);
    try {
      const formData = new FormData();
      formData.append('sitePhoto', sitePhotoFile);
      formData.append('overallCondition', overallCondition);
      formData.append('notes', receiverNotes);
      formData.append('receivedItems', JSON.stringify(receivingItemsState));

      await receiveMaterialOrder(receiveOrder._id!, formData);
      setReceiveOrder(null);
      setSitePhotoFile(null);
      setSitePhotoPreview(null);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal mengonfirmasi penerimaan barang');
    } finally {
      setSubmittingReceive(false);
    }
  };

  const toggleExpandOrder = (id: string) => {
    setExpandedOrders((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Filtered requests by Tab & Search
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // Project filter
      if (selectedProjectId !== 'all') {
        const projId = typeof r.projectId === 'object' ? r.projectId?._id : r.projectId;
        if (projId !== selectedProjectId) return false;
      }

      // Tab filter
      const st = r.status;
      if (activeTab === 'PR') {
        if (!['PR_PENDING', 'Pending', 'PR_REVIEWED'].includes(st)) return false;
      } else if (activeTab === 'PO_SOURCING') {
        if (!['PR_APPROVED', 'PO_PENDING_FINANCE'].includes(st)) return false;
      } else if (activeTab === 'MUST_PURCHASE') {
        if (st !== 'MUST_PURCHASE') return false;
      } else if (activeTab === 'ON_THE_WAY') {
        if (st !== 'ON_THE_WAY') return false;
      } else if (activeTab === 'DELIVERED') {
        if (!['DELIVERED', 'Delivered'].includes(st)) return false;
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const prNo = (r.prNumber || '').toLowerCase();
        const poNo = (r.poNumber || '').toLowerCase();
        const itm = (r.item || '').toLowerCase();
        const vendor = (r.selectedSupplier?.supplierName || '').toLowerCase();
        const proj = (typeof r.projectId === 'object' && r.projectId?.nama ? r.projectId.nama : 'non-proyek umum').toLowerCase();
        const itemsText = (r.items || []).map((i) => `${i.item} ${i.specifications || ''} ${i.wbsCode || ''}`).join(' ').toLowerCase();
        const hasRab = (r.items || []).some((i) => i.isRabBased || i.wbsCode);
        const rabKeyword = hasRab ? 'rab based rab' : 'non-rab non rab';
        return prNo.includes(q) || poNo.includes(q) || itm.includes(q) || itemsText.includes(q) || vendor.includes(q) || proj.includes(q) || rabKeyword.includes(q);
      }

      return true;
    });
  }, [requests, activeTab, selectedProjectId, search]);

  // Tab Badge counts
  const tabCounts = useMemo(() => {
    return {
      PR: requests.filter((r) => ['PR_PENDING', 'Pending', 'PR_REVIEWED'].includes(r.status)).length,
      PO_SOURCING: requests.filter((r) => ['PR_APPROVED', 'PO_PENDING_FINANCE'].includes(r.status)).length,
      MUST_PURCHASE: requests.filter((r) => r.status === 'MUST_PURCHASE').length,
      ON_THE_WAY: requests.filter((r) => r.status === 'ON_THE_WAY').length,
      DELIVERED: requests.filter((r) => ['DELIVERED', 'Delivered'].includes(r.status)).length,
      ALL: requests.length,
    };
  }, [requests]);

  const getStatusBadge = (status: ProcurementStatus) => {
    switch (status) {
      case 'PR_PENDING':
      case 'Pending':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Menunggu QC Review</span>;
      case 'PR_REVIEWED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">Menunggu Ops Director</span>;
      case 'PR_APPROVED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">PR Disetujui (Siap Sourcing)</span>;
      case 'PO_PENDING_FINANCE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">Menunggu Finance Director</span>;
      case 'MUST_PURCHASE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Siap Beli (Must Purchase)</span>;
      case 'ON_THE_WAY':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 flex items-center gap-1"><Truck size={10} /> Dalam Perjalanan</span>;
      case 'DELIVERED':
      case 'Delivered':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 flex items-center gap-1"><CheckCircle2 size={10} /> Selesai (Diterima)</span>;
      case 'PR_REJECTED':
      case 'Rejected':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">Ditolak</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* ── Header Banner ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-white border border-border-light rounded-2xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ShoppingBag size={22} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight m-0">
                Pengadaan & PO (Procurement Hub)
              </h1>
              <p className="text-xs text-text-muted m-0 mt-0.5">
                RAB Purchase Request ➔ Evaluasi Komparasi Supplier ➔ PO Mengikat ➔ Penerimaan Fisik Proyek
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOwner && (
            <button
              type="button"
              onClick={() => setShowAuthorizerDirectoryModal(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer shadow-xs shrink-0"
              title="Direktori alur & pejabat berwenang peninjau dan penyetuju dokumen (Owner Only)"
            >
              <Users size={15} />
              <span>Alur & Direktori Approver</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenAddPrModal}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary-dark transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
          >
            <Plus size={16} />
            <span>Buat PR Baru (Multi-Item)</span>
          </button>
        </div>
      </div>

      {/* ── Search & Project Filter Controls ── */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nomor PR, PO, nama material, supplier..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-border-light bg-bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="w-full sm:w-60 px-3 py-2 text-xs rounded-xl border border-border-light bg-bg-white text-text-primary focus:outline-none"
        >
          <option value="all">Semua Proyek</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.nama}
            </option>
          ))}
        </select>
      </div>

      {/* ── Pipeline Navigation Tabs ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-border-light">
        {[
          { id: 'PR', label: '1. Pengajuan PR', count: tabCounts.PR },
          { id: 'PO_SOURCING', label: '2. Komparasi PO', count: tabCounts.PO_SOURCING },
          { id: 'MUST_PURCHASE', label: '3. Siap Beli (PO)', count: tabCounts.MUST_PURCHASE },
          { id: 'ON_THE_WAY', label: '4. Dalam Pengiriman', count: tabCounts.ON_THE_WAY },
          { id: 'DELIVERED', label: '5. Selesai (Diterima)', count: tabCounts.DELIVERED },
          { id: 'ALL', label: 'Semua Riwayat', count: tabCounts.ALL },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as PipelineTab)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-bg-secondary text-text-secondary hover:bg-border/60'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  isActive ? 'bg-white/20 text-white' : 'bg-border text-text-muted'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Orders Listing ── */}
      {loading ? (
        <LoadingOverlay visible={true} />
      ) : filteredRequests.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Tidak ada data pengadaan"
          description="Belum ada transaksi pengadaan pada tahap ini."
        />
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((order) => {
            const isExpanded = expandedOrders.includes(order._id!);
            const itemsList = order.items && order.items.length > 0 ? order.items : [{
              item: order.item,
              specifications: '',
              qty: Number(order.qty) || 1,
              unit: order.unit || 'Pcs',
              budgetUnitRate: order.costEstimate ? (Number(order.costEstimate) / (Number(order.qty) || 1)) : 0,
              totalBudget: Number(order.costEstimate) || 0,
            }];

            return (
              <div
                key={order._id}
                className="bg-bg-white border border-border-light rounded-2xl p-4 sm:p-5 shadow-xs transition-all hover:border-primary/30"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-light">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-700 font-black text-xs">
                      PR
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-text-primary">
                          {order.prNumber || 'DRAFT-PR'}
                        </span>
                        {order.poNumber && (
                          <span className="text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
                            PO: {order.poNumber}
                          </span>
                        )}
                        {getStatusBadge(order.status)}
                        {(() => {
                          const hasRab = (order.items || []).some((i) => i.isRabBased || i.wbsCode);
                          return hasRab ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                              <Layers size={10} />
                              <span>RAB Based</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                              <Package size={10} />
                              <span>Non-RAB</span>
                            </span>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-muted mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Building2 size={12} />
                          {typeof order.projectId === 'object' && order.projectId?.nama ? order.projectId.nama : 'Non-Proyek / Umum'}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          Kebutuhan: {fmtDateStr(order.dateNeeded)}
                        </span>
                        <span>•</span>
                        <span>{itemsList.length} Material Line(s)</span>
                      </div>

                      {/* Configured Approvers Info Bar */}
                      <div className="flex items-center gap-2 mt-2 pt-1 text-[11px] flex-wrap">
                        <span className="text-[10px] uppercase font-bold text-text-muted">Alur Approver:</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                          <UserCheck size={11} className="text-blue-600" />
                          <span className="text-[10px] text-text-muted">QC:</span>
                          <b>{typeof order.assignedReviewerId === 'object' ? (order.assignedReviewerId?.fullName || order.assignedReviewerId?.name) : (order.reviewedBy?.user?.fullName || order.reviewedBy?.user?.name || 'QC/SPV')}</b>
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                          <ShieldCheck size={11} className="text-indigo-600" />
                          <span className="text-[10px] text-text-muted">Ops:</span>
                          <b>{typeof order.assignedOpsApproverId === 'object' ? (order.assignedOpsApproverId?.fullName || order.assignedOpsApproverId?.name) : (order.opsApprovedBy?.user?.fullName || order.opsApprovedBy?.user?.name || 'Ops Director')}</b>
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                          <DollarSign size={11} className="text-emerald-600" />
                          <span className="text-[10px] text-text-muted">Finance:</span>
                          <b>{typeof order.assignedFinanceApproverId === 'object' ? (order.assignedFinanceApproverId?.fullName || order.assignedFinanceApproverId?.name) : (order.financeApprovedBy?.user?.fullName || order.financeApprovedBy?.user?.name || 'Finance Director')}</b>
                        </span>
                        {isOwner && ['PR_PENDING', 'Pending', 'PR_REVIEWED', 'PR_APPROVED'].includes(order.status) && (
                          <button
                            type="button"
                            onClick={() => handleOpenAssignModal(order)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary font-bold transition-all cursor-pointer text-[10px]"
                            title="Ubah personel reviewer atau approver untuk transaksi ini (Owner Only)"
                          >
                            <SlidersHorizontal size={10} />
                            <span>Atur Approver</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PDF Download buttons */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => exportPurchaseRequestPdf(order)}
                      title="Unduh Dokumen PR PDF (Kop Surat & TTD Digital)"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-bg-secondary hover:bg-border text-text-primary text-[11px] font-bold transition-all cursor-pointer"
                    >
                      <Download size={13} />
                      <span>PDF PR</span>
                    </button>

                    {order.poNumber && (
                      <button
                        type="button"
                        onClick={() => exportPurchaseOrderPdf(order)}
                        title="Unduh Dokumen PO PDF (Kop Surat & TTD Digital)"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold transition-all cursor-pointer"
                      >
                        <Download size={13} />
                        <span>PDF PO</span>
                      </button>
                    )}

                    {['DELIVERED', 'Delivered'].includes(order.status) && (
                      <button
                        type="button"
                        onClick={() => exportGoodsReceiptPdf(order)}
                        title="Unduh Bukti Terima Barang GRN PDF"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold transition-all cursor-pointer"
                      >
                        <Download size={13} />
                        <span>GRN PDF</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Multi-Item Line Table (Name and Spec in Separate Columns) */}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border-light text-[11px] font-black text-text-muted uppercase">
                        <th className="py-2 px-2 w-8">No</th>
                        <th className="py-2 px-2">Nama Material</th>
                        <th className="py-2 px-2 text-primary">Spesifikasi / Spec</th>
                        <th className="py-2 px-2 text-center">Qty</th>
                        <th className="py-2 px-2 text-center">Satuan</th>
                        <th className="py-2 px-2 text-right">Estimasi/Tarif</th>
                        <th className="py-2 px-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light/50">
                      {(isExpanded ? itemsList : itemsList.slice(0, 3)).map((item, idx) => (
                        <tr key={idx} className="hover:bg-bg-secondary/40">
                          <td className="py-2 px-2 text-text-muted">{idx + 1}</td>
                          <td className="py-2 px-2 font-bold text-text-primary">
                            {item.item}
                            {item.wbsCode || item.isRabBased ? (
                              <span className="ml-1.5 px-1.5 py-0.2 rounded text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                                WBS: {item.wbsCode || 'RAB'}
                              </span>
                            ) : (
                              <span className="ml-1.5 px-1.5 py-0.2 rounded text-[9px] bg-slate-100 text-slate-500 font-mono">
                                Non-RAB
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-text-secondary italic">
                            {item.specifications || '-'}
                          </td>
                          <td className="py-2 px-2 text-center font-bold">{item.qty}</td>
                          <td className="py-2 px-2 text-center text-text-muted">{item.unit}</td>
                          <td className="py-2 px-2 text-right font-mono">
                            {formatRupiah(item.poUnitPrice || item.budgetUnitRate)}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-text-primary font-mono">
                            {formatRupiah(item.poTotalAmount || item.totalBudget || (item.qty * item.budgetUnitRate))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {itemsList.length > 3 && (
                    <button
                      type="button"
                      onClick={() => toggleExpandOrder(order._id!)}
                      className="mt-2 text-[11px] font-bold text-primary flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp size={13} /> Sembunyikan sebagian baris
                        </>
                      ) : (
                        <>
                          <ChevronDown size={13} /> Lihat semua ({itemsList.length} material)
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Total & Action Footer */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-border-light bg-slate-50/50 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 p-4 rounded-b-2xl">
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-text-muted block">Total Anggaran / PO</span>
                      <span className="text-sm font-black text-text-primary">
                        {formatRupiah(order.poTotalAmount || order.totalEstimatedBudget || order.costEstimate)}
                      </span>
                    </div>

                    {order.selectedSupplier && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-text-muted block">Vendor Terpilih</span>
                        <span className="text-xs font-bold text-text-primary">
                          {order.selectedSupplier.supplierName} ({order.selectedSupplier.location || 'Lokal'})
                        </span>
                      </div>
                    )}

                    {order.rejectionReason && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                        <AlertCircle size={14} className="shrink-0 text-rose-600" />
                        <span>Alasan Ditolak: <b>{order.rejectionReason}</b></span>
                      </div>
                    )}
                  </div>

                  {/* Contextual Workflow Action Buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Stage 1 -> Tier 1: Review by Supervisor/QC */}
                    {['PR_PENDING', 'Pending'].includes(order.status) && canReview && (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewModalOrder(order);
                          setReviewNotes('');
                          setReviewPassphrase('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-all cursor-pointer shadow-xs"
                      >
                        Tinjau QC / SPV
                      </button>
                    )}

                    {/* Stage 2 -> Tier 2: Ops Director Approval */}
                    {order.status === 'PR_REVIEWED' && canOpsApprove && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpsApproveOrder(order);
                          setOpsPassphrase('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-all cursor-pointer shadow-xs"
                      >
                        Setujui Ops Director
                      </button>
                    )}

                    {/* Stage 3 -> Sourcing & Multi-Supplier Comparison */}
                    {['PR_APPROVED'].includes(order.status) && canSourcing && (
                      <button
                        type="button"
                        onClick={() => handleOpenSourcingModal(order)}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                      >
                        <DollarSign size={14} />
                        <span>Input Komparasi Supplier (Multi-Item)</span>
                      </button>
                    )}

                    {['PO_PENDING_FINANCE'].includes(order.status) && canSourcing && (
                      <button
                        type="button"
                        onClick={() => handleOpenSourcingModal(order)}
                        className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 font-bold text-xs hover:bg-purple-100 transition-all cursor-pointer shadow-xs"
                      >
                        Lihat / Edit Komparasi
                      </button>
                    )}

                    {/* Stage 4 -> Finance Director Sign-off */}
                    {order.status === 'PO_PENDING_FINANCE' && canFinanceApprove && (
                      <button
                        type="button"
                        onClick={() => {
                          setFinanceApproveOrder(order);
                          setFinancePassphrase('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all cursor-pointer shadow-xs"
                      >
                        Setujui PO (Finance & Budget)
                      </button>
                    )}

                    {/* Stage 5 -> In-Transit Dispatch */}
                    {order.status === 'MUST_PURCHASE' && canSourcing && (
                      <button
                        type="button"
                        onClick={() => {
                          setDispatchOrder(order);
                          setSuratJalanFile(null);
                          setDispatchForm({ driverName: '', driverPhone: '', vehiclePlate: '', eta: '', notes: '' });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 text-white font-bold text-xs hover:bg-sky-700 transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                      >
                        <Truck size={14} />
                        <span>Kirim (Input Surat Jalan)</span>
                      </button>
                    )}

                    {/* Stage 6 -> Goods Receipt at Site */}
                    {order.status === 'ON_THE_WAY' && canReceive && (
                      <button
                        type="button"
                        onClick={() => handleOpenReceiveModal(order)}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                      >
                        <Camera size={14} />
                        <span>Terima Barang di Proyek</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL 1: BUAT PURCHASE REQUEST BARU (MULTI-ITEM) ── */}
      {showAddPrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-xl animate-dropdown-enter">
            <div className="flex items-center justify-between pb-4 border-b border-border-light">
              <div>
                <h2 className="text-lg font-black text-text-primary m-0">Pengajuan Purchase Request (PR) Baru</h2>
                <p className="text-xs text-text-muted m-0 mt-0.5">
                  Tentukan jenis pengadaan: Berbasis RAB Proyek atau Non-RAB (Kustom / Operasional)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddPrModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-bg-secondary"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePrSubmit} className="space-y-5 mt-4">
              {/* PR Mode Decision Cards (RAB Based vs Non-RAB) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handlePrModeChange('RAB')}
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    prMode === 'RAB'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs'
                      : 'border-border-light bg-bg-white hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      prMode === 'RAB' ? 'bg-primary text-white shadow-2xs' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Layers size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-black text-text-primary">Berbasis RAB (RAB-Based)</span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                          prMode === 'RAB' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        Terkontrol Anggaran
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
                      Material ditautkan ke mata anggaran WBS proyek. Memastikan harga dan kuantitas sesuai plafon RAB.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handlePrModeChange('NON_RAB')}
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    prMode === 'NON_RAB'
                      ? 'border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/20 shadow-xs'
                      : 'border-border-light bg-bg-white hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      prMode === 'NON_RAB' ? 'bg-amber-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Package size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-black text-text-primary">Non-RAB (Kustom / Operasional)</span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                          prMode === 'NON_RAB' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        Bebas / Fleksibel
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
                      Pengadaan bebas untuk kebutuhan darurat, operasional umum kantor/workshop, atau material tak terduga.
                    </p>
                  </div>
                </button>
              </div>

              {/* Basic Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-text-muted uppercase block">
                      {prMode === 'RAB' ? 'Proyek Tujuan *' : 'Proyek / Alokasi'}
                    </label>
                    {prMode === 'NON_RAB' && (
                      <span className="text-[10px] text-text-muted italic">(Opsional)</span>
                    )}
                  </div>
                  <select
                    value={prProjectId}
                    onChange={(e) => handleSelectPrProject(e.target.value)}
                    required={prMode === 'RAB'}
                    className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium"
                  >
                    <option value="">
                      {prMode === 'RAB' ? '-- Pilih Proyek (Wajib untuk RAB) --' : 'Non-Proyek / Umum (Operasional Kantor & Workshop)'}
                    </option>
                    {projects.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.nama}
                      </option>
                    ))}
                  </select>
                  {prMode === 'RAB' && prProjectId && (
                    <div className="mt-1.5 text-[11px]">
                      {loadingRab ? (
                        <span className="text-text-muted flex items-center gap-1">
                          <Clock size={11} className="animate-spin text-primary" /> Memuat data anggaran RAB...
                        </span>
                      ) : projectRabItems.length > 0 ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 size={12} /> {projectRabItems.length} mata anggaran RAB aktif ditemukan
                        </span>
                      ) : (
                        <span className="text-amber-700 font-bold flex items-center gap-1">
                          <AlertTriangle size={12} /> Belum ada RAB pada proyek ini (bisa beralih ke mode Non-RAB)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Tgl. Dibutuhkan *</label>
                  <input
                    type="date"
                    value={prDateNeeded}
                    onChange={(e) => setPrDateNeeded(e.target.value)}
                    required
                    className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Tingkat Urgensi</label>
                  <select
                    value={prUrgency}
                    onChange={(e) => setPrUrgency(e.target.value as any)}
                    className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium"
                  >
                    <option value="Low">Low (Rendah)</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High (Tinggi)</option>
                    <option value="Urgent">Urgent (Kritis)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Keperluan / Catatan Paket Kerja</label>
                <input
                  type="text"
                  value={prPurpose}
                  onChange={(e) => setPrPurpose(e.target.value)}
                  placeholder="Contoh: Pekerjaan Balok & Plat Lantai 2 Zona A"
                  className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white"
                />
              </div>

              {/* Penugasan Reviewer & Approver Config (Owner Only) */}
              {isOwner && (
                <div className="p-3.5 rounded-xl border border-border-light bg-slate-50/70 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-text-primary uppercase tracking-wide">
                    <UserCheck size={14} className="text-primary" />
                    <span>Penugasan Alur Otorisasi & Approver (Owner Only)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">
                        1. Peninjau QC / SPV
                      </label>
                      <select
                        value={prReviewerId}
                        onChange={(e) => setPrReviewerId(e.target.value)}
                        className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white font-medium"
                      >
                        <option value="">-- Bebas (Semua QC/SPV) --</option>
                        {authorizers.reviewers.map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.fullName} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">
                        2. Persetujuan Ops Director
                      </label>
                      <select
                        value={prOpsApproverId}
                        onChange={(e) => setPrOpsApproverId(e.target.value)}
                        className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white font-medium"
                      >
                        <option value="">-- Bebas (Semua Direktur Ops) --</option>
                        {authorizers.opsApprovers.map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.fullName} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">
                        3. Persetujuan Finance Director
                      </label>
                      <select
                        value={prFinanceApproverId}
                        onChange={(e) => setPrFinanceApproverId(e.target.value)}
                        className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white font-medium"
                      >
                        <option value="">-- Bebas (Semua Direktur Keuangan) --</option>
                        {authorizers.financeApprovers.map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.fullName} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Dynamic Line-Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-text-primary tracking-wide">
                      Daftar Material ({prItems.length} Baris)
                    </span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                        prMode === 'RAB'
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      Mode: {prMode === 'RAB' ? 'Berbasis RAB' : 'Non-RAB / Bebas'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddPrItem}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold text-xs hover:bg-primary/20 transition-all cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Tambah Baris Material</span>
                  </button>
                </div>

                <div className="border border-border-light rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-border-light text-[11px] font-black text-text-muted uppercase">
                        <th className="py-2.5 px-2 w-8 text-center">No</th>
                        <th className="py-2.5 px-2 w-48">Tipe / Sumber</th>
                        <th className="py-2.5 px-2 min-w-[160px]">Nama Material *</th>
                        <th className="py-2.5 px-2 min-w-[130px] text-primary">Spesifikasi / Spec</th>
                        <th className="py-2.5 px-2 w-20 text-center">Qty *</th>
                        <th className="py-2.5 px-2 w-20 text-center">Satuan</th>
                        <th className="py-2.5 px-2 w-28 text-right">Tarif Est.</th>
                        <th className="py-2.5 px-2 w-28 text-right">Subtotal</th>
                        <th className="py-2.5 px-2 w-8 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {prItems.map((itm, idx) => {
                        const isRabRow = Boolean(itm.isRabBased);
                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-2 text-center text-text-muted font-bold">{idx + 1}</td>

                            {/* Tipe / Sumber Column */}
                            <td className="py-2 px-2">
                              {prMode === 'RAB' ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleItemRabType(idx, true)}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                                        isRabRow
                                          ? 'bg-primary text-white shadow-2xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      RAB
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleItemRabType(idx, false)}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                                        !isRabRow
                                          ? 'bg-amber-600 text-white shadow-2xs'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      Non-RAB
                                    </button>
                                  </div>

                                  {isRabRow ? (
                                    prProjectId && projectRabItems.length > 0 ? (
                                      <select
                                        value={itm.rabItemId || ''}
                                        onChange={(e) => handleSelectRabItem(idx, e.target.value)}
                                        className="w-full p-1 text-[11px] rounded border border-border-light bg-bg-white font-medium"
                                      >
                                        <option value="">-- Pilih Mata Anggaran RAB --</option>
                                        {projectRabItems.map((rab) => (
                                          <option key={rab._id} value={rab._id}>
                                            [{rab.wbsCode}] {rab.description} ({formatRupiah(rab.unitRate)}/{rab.unitOfMeasure || 'pcs'})
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="text-[10px] text-amber-600 italic block">
                                        {prProjectId ? 'RAB tidak ditemukan' : 'Pilih proyek dahulu'}
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-[10px] text-amber-700 font-bold block">
                                      Kustom (Non-RAB)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <Package size={10} />
                                  <span>Non-RAB</span>
                                </span>
                              )}
                            </td>

                            {/* Nama Material */}
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={itm.item}
                                onChange={(e) => handleUpdatePrItem(idx, { item: e.target.value })}
                                placeholder={isRabRow ? 'Pilih RAB atau isi nama barang...' : 'Nama barang / material...'}
                                required
                                className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white font-bold text-text-primary"
                              />
                              {itm.wbsCode && (
                                <span className="inline-block mt-0.5 text-[9px] font-mono px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  WBS: {itm.wbsCode}
                                </span>
                              )}
                            </td>

                            {/* Spesifikasi */}
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={itm.specifications || ''}
                                onChange={(e) => handleUpdatePrItem(idx, { specifications: e.target.value })}
                                placeholder="Merk, ukuran, standar..."
                                className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white"
                              />
                            </td>

                            {/* Qty */}
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                min="0.1"
                                step="any"
                                value={itm.qty}
                                onChange={(e) => handleUpdatePrItem(idx, { qty: parseFloat(e.target.value) || 0 })}
                                required
                                className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white text-center font-bold"
                              />
                            </td>

                            {/* Satuan */}
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={itm.unit}
                                onChange={(e) => handleUpdatePrItem(idx, { unit: e.target.value })}
                                className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white text-center font-medium"
                              />
                            </td>

                            {/* Tarif Est. */}
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                min="0"
                                value={itm.budgetUnitRate || ''}
                                onChange={(e) => handleUpdatePrItem(idx, { budgetUnitRate: parseFloat(e.target.value) || 0 })}
                                placeholder="0"
                                className="w-full p-1.5 text-xs rounded border border-border-light bg-bg-white text-right font-mono font-medium"
                              />
                            </td>

                            {/* Subtotal */}
                            <td className="py-2 px-2 text-right font-bold font-mono text-text-primary">
                              {formatRupiah(itm.totalBudget)}
                            </td>

                            {/* Remove Row Button */}
                            <td className="py-2 px-2 text-center">
                              {prItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemovePrItem(idx)}
                                  className="text-red-400 hover:text-red-600 p-1 cursor-pointer transition-colors"
                                  title="Hapus baris"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-2 text-xs font-bold text-text-primary">
                  <span>Total Estimasi Anggaran PR: </span>
                  <span className="ml-2 font-mono text-sm text-primary">{formatRupiah(prTotalEstimatedBudget)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-light">
                <button
                  type="button"
                  onClick={() => setShowAddPrModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted hover:bg-bg-secondary cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingPr}
                  className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {submittingPr ? 'Menyimpan...' : 'Ajukan Purchase Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: REVIEW SUPERVISOR / QC / QA (WITH PASSPHRASE & REJECT) ── */}
      {reviewModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl animate-dropdown-enter">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-border-light">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-text-primary m-0">Tinjauan Teknis QC & SPV</h3>
                  <p className="text-xs text-text-muted m-0 mt-0.5">
                    PR: <b>{reviewModalOrder.prNumber}</b> {reviewModalOrder.projectId?.nama ? `— ${reviewModalOrder.projectId.nama}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReviewModalOrder(null);
                  setReviewNotes('');
                  setReviewPassphrase('');
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Summary */}
            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-border-light text-xs space-y-1.5">
              <div className="flex justify-between text-text-muted">
                <span>Diajukan Oleh:</span>
                <span className="font-bold text-text-primary">
                  {typeof reviewModalOrder.requestedBy === 'object'
                    ? (reviewModalOrder.requestedBy?.fullName || reviewModalOrder.requestedBy?.name)
                    : 'Staff Proyek'}
                </span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Total Estimasi Anggaran:</span>
                <span className="font-bold text-emerald-600">
                  {formatRupiah(reviewModalOrder.totalEstimatedBudget || reviewModalOrder.costEstimate || 0)}
                </span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Jumlah Material:</span>
                <span className="font-bold text-text-primary">
                  {reviewModalOrder.items?.length || 1} Baris Item
                </span>
              </div>
            </div>

            {/* Catatan / Alasan Penolakan */}
            <div className="mt-4">
              <label className="text-xs font-bold text-text-muted uppercase mb-1 block flex items-center justify-between">
                <span>Catatan Hasil Reviu / Alasan Penolakan</span>
                <span className="text-[10px] text-rose-500 font-semibold normal-case">(Wajib jika menolak)</span>
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Tuliskan catatan verifikasi teknis atau alasan penolakan PR..."
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white h-24 outline-none focus:border-primary"
              />
            </div>

            {/* Passphrase Input */}
            <div className="mt-4">
              <label className="text-xs font-bold text-text-muted uppercase mb-1 block flex items-center gap-1.5">
                <Lock size={13} className="text-primary" />
                <span>Passphrase Akun Anda *</span>
              </label>
              <input
                type="password"
                value={reviewPassphrase}
                onChange={(e) => setReviewPassphrase(e.target.value)}
                placeholder="Masukkan kata sandi/passphrase akun Anda..."
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white outline-none focus:border-primary font-medium"
              />
              <p className="text-[10px] text-text-muted mt-1">
                Passphrase keamanan diperlukan untuk memverifikasi otorisasi peninjau QC / Supervisor.
              </p>
            </div>

            {/* Footer Buttons: Batal, Tolak PR (Reject), Setujui (Approve) */}
            <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-border-light">
              <button
                type="button"
                onClick={() => {
                  setReviewModalOrder(null);
                  setReviewNotes('');
                  setReviewPassphrase('');
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-text-muted hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleReviewSubmit('reject')}
                  disabled={reviewing || !reviewPassphrase}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5 transition-all"
                  title="Tolak pengajuan PR ini dengan alasan yang diisi di atas"
                >
                  <XCircle size={14} />
                  <span>{reviewing ? 'Memproses...' : 'Tolak PR (Reject)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewSubmit('approve')}
                  disabled={reviewing || !reviewPassphrase}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5 transition-all"
                  title="Verifikasi dan loloskan PR ke tahap otorisasi Direktur Operasional"
                >
                  <CheckCircle2 size={14} />
                  <span>{reviewing ? 'Memverifikasi...' : 'Setujui & Verifikasi'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: OPS DIRECTOR APPROVAL (PASSPHRASE) ── */}
      {opsApproveOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-md p-5 shadow-xl">
            <h3 className="text-base font-black text-text-primary m-0">Persetujuan Direktur Operasional</h3>
            <p className="text-xs text-text-muted m-0 mt-1">
              Otorisasi persetujuan PR: <b>{opsApproveOrder.prNumber}</b>
            </p>

            <div className="mt-4">
              <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Passphrase Akun Anda *</label>
              <input
                type="password"
                value={opsPassphrase}
                onChange={(e) => setOpsPassphrase(e.target.value)}
                placeholder="Masukkan kata sandi untuk menyetujui..."
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white"
              />
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-border-light">
              <button
                type="button"
                onClick={() => setOpsApproveOrder(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleOpsApproveSubmit}
                disabled={opsApproving || !opsPassphrase}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer disabled:opacity-50"
              >
                {opsApproving ? 'Memverifikasi...' : 'Setujui PR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: MULTI-ITEM SOURCING & PRICE COMPARISON MATRIX ── */}
      {sourcingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-5xl p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto animate-dropdown-enter">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-light">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                    PO
                  </span>
                  <h3 className="text-base sm:text-lg font-black text-text-primary m-0">
                    Evaluasi Komparasi Harga Supplier (Multi-Item Sourcing Matrix)
                  </h3>
                </div>
                <p className="text-xs text-text-muted m-0 mt-1">
                  PR: <b>{sourcingOrder.prNumber}</b> • Proyek: <b>{typeof sourcingOrder.projectId === 'object' ? sourcingOrder.projectId?.nama : 'Proyek'}</b> • {sourcingOrder.items?.length || 1} Baris Material
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* View Mode Toggle */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setSourcingViewMode('form')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      sourcingViewMode === 'form'
                        ? 'bg-white text-purple-700 shadow-xs'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    📋 Rincian Per Vendor
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourcingViewMode('matrix')}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      sourcingViewMode === 'matrix'
                        ? 'bg-white text-purple-700 shadow-xs'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    📊 Matriks Berdampingan
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSourcingOrder(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content area: Mode 1 (Form / Per-Vendor Tab) or Mode 2 (Side-by-side Matrix) */}
            {sourcingViewMode === 'form' ? (
              <div className="mt-4 space-y-4">
                {/* Vendor Tabs Bar */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-border-light">
                  {candidateSuppliers.map((supp, sIdx) => {
                    const isActive = activeVendorIndex === sIdx;
                    return (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => setActiveVendorIndex(sIdx)}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'bg-slate-100 text-text-secondary hover:bg-slate-200'
                        }`}
                      >
                        <span>
                          {supp.supplierName.trim() ? supp.supplierName : `Vendor #${sIdx + 1}`}
                        </span>
                        {supp.isRecommended && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                            isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                          }`}>
                            ⭐ Pemenang
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={handleAddCandidateSupplier}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 transition-all cursor-pointer shrink-0"
                  >
                    <Plus size={14} />
                    <span>Tambah Alternatif Vendor</span>
                  </button>
                </div>

                {/* Active Vendor Card */}
                {candidateSuppliers[activeVendorIndex] && (() => {
                  const currentSupp = candidateSuppliers[activeVendorIndex];
                  const prItemsList = sourcingOrder.items && sourcingOrder.items.length > 0 ? sourcingOrder.items : [{
                    item: sourcingOrder.item,
                    specifications: sourcingOrder.specifications || '',
                    qty: Number(sourcingOrder.qty) || 1,
                    unit: sourcingOrder.unit || 'Pcs',
                    budgetUnitRate: sourcingOrder.costEstimate ? (Number(sourcingOrder.costEstimate) / (Number(sourcingOrder.qty) || 1)) : 0,
                    totalBudget: Number(sourcingOrder.costEstimate) || 0,
                  }];

                  return (
                    <div className="space-y-4">
                      {/* Top Action & Recommendation Flag */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-purple-50/60 border border-purple-100">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-purple-900">
                          <input
                            type="radio"
                            name="selectedRecommendedRadio"
                            checked={currentSupp.isRecommended}
                            onChange={() => handleSelectRecommendedSupplier(activeVendorIndex)}
                            className="w-4 h-4 text-purple-600"
                          />
                          <span>Pilih Vendor Ini Sebagai Rekomendasi Utama (Pemenang PO)</span>
                        </label>

                        {candidateSuppliers.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCandidateSupplier(activeVendorIndex)}
                            className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 size={13} />
                            <span>Hapus Vendor Ini</span>
                          </button>
                        )}
                      </div>

                      {/* Vendor Details Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-border-light bg-slate-50/50">
                        <div>
                          <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">Nama Toko / PT Vendor *</label>
                          <input
                            type="text"
                            value={currentSupp.supplierName}
                            onChange={(e) => handleUpdateSupplierField(activeVendorIndex, { supplierName: e.target.value })}
                            placeholder="PT Sinar Logam Abadi..."
                            className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white font-bold"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">Lokasi / Jarak</label>
                          <input
                            type="text"
                            value={currentSupp.location || ''}
                            onChange={(e) => handleUpdateSupplierField(activeVendorIndex, { location: e.target.value })}
                            placeholder="Jl. Lingkar Luar (8 km dari site)..."
                            className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">No. Kontak / PIC</label>
                          <input
                            type="text"
                            value={currentSupp.contact || ''}
                            onChange={(e) => handleUpdateSupplierField(activeVendorIndex, { contact: e.target.value })}
                            placeholder="0812-3456-7890 (Pak Johan)..."
                            className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">Syarat Pembayaran</label>
                          <input
                            type="text"
                            value={currentSupp.paymentTerms || ''}
                            onChange={(e) => handleUpdateSupplierField(activeVendorIndex, { paymentTerms: e.target.value })}
                            placeholder="Tempo 14 Hari / COD / DP 30%..."
                            className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">Biaya Pengiriman / Ongkir (Rp)</label>
                          <input
                            type="number"
                            min="0"
                            value={currentSupp.shippingCost || ''}
                            onChange={(e) => handleUpdateSupplierField(activeVendorIndex, { shippingCost: parseFloat(e.target.value) || 0 })}
                            placeholder="0"
                            className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white font-mono text-right font-bold"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">Catatan / Garansi Vendor</label>
                          <input
                            type="text"
                            value={currentSupp.notes || ''}
                            onChange={(e) => handleUpdateSupplierField(activeVendorIndex, { notes: e.target.value })}
                            placeholder="Ready stock, pengiriman H+1..."
                            className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white"
                          />
                        </div>
                      </div>

                      {/* Multi-Item Quotation Rate Table */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase text-text-primary tracking-wide">
                            Penawaran Harga Material ({prItemsList.length} Item Sesuai PR)
                          </span>
                          <span className="text-[11px] text-text-muted">
                            Isi harga satuan per item yang ditawarkan oleh vendor ini
                          </span>
                        </div>

                        <div className="border border-border-light rounded-xl overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-border-light text-[11px] font-black text-text-muted uppercase">
                                <th className="py-2.5 px-2 w-8 text-center">No</th>
                                <th className="py-2.5 px-2 min-w-[140px]">Nama Material</th>
                                <th className="py-2.5 px-2 min-w-[140px] text-primary">Spesifikasi / Spec</th>
                                <th className="py-2.5 px-2 w-20 text-center">Qty</th>
                                <th className="py-2.5 px-2 w-20 text-center">Satuan</th>
                                <th className="py-2.5 px-2 w-28 text-right">Tarif Est. PR</th>
                                <th className="py-2.5 px-2 w-36 text-right text-purple-700">Harga Penawaran Satuan *</th>
                                <th className="py-2.5 px-2 w-32 text-right">Subtotal Ditawarkan</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border-light">
                              {prItemsList.map((itm, itmIdx) => {
                                const rateObj = currentSupp.itemRates?.[itmIdx];
                                const quotedPrice = rateObj?.quotedUnitPrice ?? (itm.budgetUnitRate || 0);
                                const quotedSubtotal = (Number(itm.qty) || 1) * quotedPrice;

                                return (
                                  <tr key={itmIdx} className="hover:bg-slate-50/50">
                                    <td className="py-2 px-2 text-center text-text-muted">{itmIdx + 1}</td>
                                    <td className="py-2 px-2 font-bold text-text-primary">{itm.item}</td>
                                    <td className="py-2 px-2 text-text-secondary italic">{itm.specifications || '-'}</td>
                                    <td className="py-2 px-2 text-center font-bold">{itm.qty}</td>
                                    <td className="py-2 px-2 text-center text-text-muted">{itm.unit}</td>
                                    <td className="py-2 px-2 text-right font-mono text-text-muted">
                                      {formatRupiah(itm.budgetUnitRate)}
                                    </td>
                                    <td className="py-2 px-2 text-right">
                                      <input
                                        type="number"
                                        min="0"
                                        value={quotedPrice || ''}
                                        onChange={(e) => handleUpdateItemRate(activeVendorIndex, itmIdx, parseFloat(e.target.value) || 0)}
                                        placeholder="0"
                                        className="w-full p-1.5 text-xs rounded border border-purple-200 bg-purple-50/30 font-mono text-right font-bold text-purple-900 focus:bg-white"
                                      />
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono font-bold text-text-primary">
                                      {formatRupiah(quotedSubtotal)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Landed Cost Summary Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                        <div className="p-3 rounded-xl border border-border-light bg-slate-50 text-right">
                          <span className="text-[10px] font-bold text-text-muted uppercase block">Subtotal Material</span>
                          <span className="text-sm font-bold font-mono text-text-primary">
                            {formatRupiah(currentSupp.subtotalItems)}
                          </span>
                        </div>
                        <div className="p-3 rounded-xl border border-border-light bg-slate-50 text-right">
                          <span className="text-[10px] font-bold text-text-muted uppercase block">Ongkos Kirim (Shipping)</span>
                          <span className="text-sm font-bold font-mono text-text-primary">
                            {formatRupiah(currentSupp.shippingCost)}
                          </span>
                        </div>
                        <div className="p-3 rounded-xl border-2 border-purple-300 bg-purple-50/50 text-right">
                          <span className="text-[10px] font-black text-purple-700 uppercase block">Total Landed Cost (PO)</span>
                          <span className="text-base font-black font-mono text-purple-900">
                            {formatRupiah(currentSupp.totalLandedCost)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* Mode 2: Side-by-Side Comparison Matrix */
              <div className="mt-4 space-y-4">
                <div className="border border-border-light rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-border-light text-[11px] font-black text-text-muted uppercase">
                        <th className="py-2.5 px-2 w-8 text-center sticky left-0 bg-slate-50">No</th>
                        <th className="py-2.5 px-2 min-w-[130px] sticky left-8 bg-slate-50">Nama Material</th>
                        <th className="py-2.5 px-2 min-w-[130px] text-primary">Spesifikasi / Spec</th>
                        <th className="py-2.5 px-2 w-20 text-center">Qty & Sat</th>
                        {candidateSuppliers.map((supp, sIdx) => (
                          <th key={sIdx} className="py-2.5 px-3 min-w-[160px] text-right border-l border-border-light bg-slate-50">
                            <div className="font-bold text-text-primary">
                              {supp.supplierName || `Vendor #${sIdx + 1}`}
                            </div>
                            <div className="text-[9px] font-normal text-text-muted">
                              {supp.location || 'Lokal'} • {supp.paymentTerms || '-'}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {(sourcingOrder.items && sourcingOrder.items.length > 0 ? sourcingOrder.items : [{
                        item: sourcingOrder.item,
                        specifications: sourcingOrder.specifications || '',
                        qty: Number(sourcingOrder.qty) || 1,
                        unit: sourcingOrder.unit || 'Pcs',
                      }]).map((itm, itmIdx) => {
                        // Find lowest price for this item among candidate suppliers
                        const quotes = candidateSuppliers.map((s) => s.itemRates?.[itmIdx]?.quotedUnitPrice ?? 0);
                        const validQuotes = quotes.filter((q) => q > 0);
                        const minQuote = validQuotes.length > 0 ? Math.min(...validQuotes) : 0;

                        return (
                          <tr key={itmIdx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-2 text-center text-text-muted sticky left-0 bg-bg-white">{itmIdx + 1}</td>
                            <td className="py-2 px-2 font-bold text-text-primary sticky left-8 bg-bg-white">{itm.item}</td>
                            <td className="py-2 px-2 text-text-secondary italic">{itm.specifications || '-'}</td>
                            <td className="py-2 px-2 text-center font-bold">{itm.qty} {itm.unit}</td>
                            {candidateSuppliers.map((supp, sIdx) => {
                              const unitPrice = supp.itemRates?.[itmIdx]?.quotedUnitPrice ?? 0;
                              const lineTotal = (Number(itm.qty) || 1) * unitPrice;
                              const isLowest = unitPrice > 0 && unitPrice === minQuote && candidateSuppliers.length > 1;

                              return (
                                <td key={sIdx} className="py-2 px-3 text-right font-mono border-l border-border-light">
                                  <div className="font-bold text-text-primary flex items-center justify-end gap-1">
                                    <span>{formatRupiah(unitPrice)}</span>
                                    {isLowest && (
                                      <span className="px-1 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800">
                                        Termurah
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-text-muted">
                                    Total: {formatRupiah(lineTotal)}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {/* Subtotal Row */}
                      <tr className="bg-slate-50/80 font-bold border-t-2 border-border-light">
                        <td colSpan={4} className="py-2.5 px-3 text-right text-xs uppercase font-black text-text-muted">
                          Subtotal Material
                        </td>
                        {candidateSuppliers.map((supp, sIdx) => (
                          <td key={sIdx} className="py-2.5 px-3 text-right font-mono font-bold text-xs border-l border-border-light">
                            {formatRupiah(supp.subtotalItems)}
                          </td>
                        ))}
                      </tr>

                      {/* Shipping Cost Row */}
                      <tr className="bg-slate-50/80 font-bold">
                        <td colSpan={4} className="py-2 px-3 text-right text-xs uppercase font-black text-text-muted">
                          Ongkos Kirim
                        </td>
                        {candidateSuppliers.map((supp, sIdx) => (
                          <td key={sIdx} className="py-2 px-3 text-right font-mono text-xs border-l border-border-light">
                            {formatRupiah(supp.shippingCost)}
                          </td>
                        ))}
                      </tr>

                      {/* Total Landed Cost Row */}
                      {(() => {
                        const landedCosts = candidateSuppliers.map((s) => s.totalLandedCost || 0);
                        const validLanded = landedCosts.filter((c) => c > 0);
                        const minLanded = validLanded.length > 0 ? Math.min(...validLanded) : 0;

                        return (
                          <tr className="bg-purple-50/50 font-black border-t-2 border-purple-200">
                            <td colSpan={4} className="py-3 px-3 text-right text-xs uppercase font-black text-purple-900">
                              Total Landed Cost
                            </td>
                            {candidateSuppliers.map((supp, sIdx) => {
                              const isLowestLanded = (supp.totalLandedCost || 0) === minLanded && validLanded.length > 1;
                              return (
                                <td key={sIdx} className="py-3 px-3 text-right font-mono text-sm border-l border-border-light text-purple-955">
                                  <div>{formatRupiah(supp.totalLandedCost)}</div>
                                  {isLowestLanded && (
                                    <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800">
                                      Terendah Keseluruhan
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })()}

                      {/* Recommendation Selector Row */}
                      <tr className="bg-white border-t border-border-light">
                        <td colSpan={4} className="py-3 px-3 text-right text-xs font-black text-text-primary">
                          Pilihan Pemenang PO:
                        </td>
                        {candidateSuppliers.map((supp, sIdx) => (
                          <td key={sIdx} className="py-3 px-3 text-center border-l border-border-light">
                            <button
                              type="button"
                              onClick={() => handleSelectRecommendedSupplier(sIdx)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                supp.isRecommended
                                  ? 'bg-amber-500 text-white shadow-xs'
                                  : 'bg-slate-100 hover:bg-slate-200 text-text-secondary'
                              }`}
                            >
                              {supp.isRecommended ? '⭐ Terpilih Pemenang' : 'Pilih Ini'}
                            </button>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bottom Section: Finance Approver Selection & Submission */}
            <div className="mt-5 pt-4 border-t border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 max-w-md">
                <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block flex items-center gap-1">
                  <ShieldCheck size={12} className="text-emerald-600" />
                  <span>Otorisasi PO Ditujukan Kepada (Direktur Keuangan / Budget Controller):</span>
                </label>
                {isOwner ? (
                  <select
                    value={sourcingFinanceApproverId}
                    onChange={(e) => setSourcingFinanceApproverId(e.target.value)}
                    className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white font-medium"
                  >
                    <option value="">-- Bebas (Semua Direktur Keuangan) --</option>
                    {authorizers.financeApprovers.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.fullName} ({u.role})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-2 text-xs rounded-lg bg-bg-light border border-border-light text-text-secondary font-medium">
                    {typeof sourcingOrder?.assignedFinanceApproverId === 'object'
                      ? (sourcingOrder.assignedFinanceApproverId?.fullName || sourcingOrder.assignedFinanceApproverId?.name)
                      : (authorizers.financeApprovers.find((u) => u._id === sourcingOrder?.assignedFinanceApproverId)?.fullName || 'Direktur Keuangan (Sesuai Alur Perusahaan)')}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSourcingOrder(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSubmitSourcing}
                  disabled={submittingSourcing}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 size={15} />
                  <span>{submittingSourcing ? 'Menyimpan...' : 'Ajukan Komparasi ke Direktur Keuangan'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 5: FINANCE DIRECTOR PO APPROVAL ── */}
      {financeApproveOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-md p-5 shadow-xl">
            <h3 className="text-base font-black text-text-primary m-0">Persetujuan Direktur Keuangan & PO</h3>
            <p className="text-xs text-text-muted m-0 mt-1">
              Otorisasi anggaran PO untuk: <b>{financeApproveOrder.prNumber}</b>
            </p>
            <div className="my-3 p-3 rounded-xl bg-slate-50 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-text-muted">Vendor:</span>
                <span className="font-bold">{financeApproveOrder.selectedSupplier?.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Total Tagihan PO:</span>
                <span className="font-bold font-mono text-primary">{formatRupiah(financeApproveOrder.poTotalAmount)}</span>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Passphrase Direktur Keuangan *</label>
              <input
                type="password"
                value={financePassphrase}
                onChange={(e) => setFinancePassphrase(e.target.value)}
                placeholder="Masukkan kata sandi otorisasi..."
                className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white"
              />
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-border-light">
              <button
                type="button"
                onClick={() => setFinanceApproveOrder(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleFinanceApproveSubmit}
                disabled={financeApproving || !financePassphrase}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
              >
                {financeApproving ? 'Memverifikasi...' : 'Setujui PO (Tag Must Purchase)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 6: IN-TRANSIT DISPATCH (SURAT JALAN & DRIVER) ── */}
      {dispatchOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-md p-5 shadow-xl">
            <h3 className="text-base font-black text-text-primary m-0">Konfirmasi Pengiriman (On The Way)</h3>
            <p className="text-xs text-text-muted m-0 mt-1">PO: {dispatchOrder.poNumber || dispatchOrder.prNumber}</p>

            <form onSubmit={handleDispatchSubmit} className="space-y-3 mt-4">
              <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Foto Surat Jalan / DO Supplier</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setSuratJalanFile(e.target.files?.[0] || null)}
                  className="w-full text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Nama Supir Pengantar</label>
                <input
                  type="text"
                  value={dispatchForm.driverName}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, driverName: e.target.value })}
                  placeholder="Budi Santoso..."
                  className="w-full p-2 text-xs rounded-xl border border-border-light bg-bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-1 block">No. Polisi Armada</label>
                <input
                  type="text"
                  value={dispatchForm.vehiclePlate}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, vehiclePlate: e.target.value })}
                  placeholder="B 9234 TX..."
                  className="w-full p-2 text-xs rounded-xl border border-border-light bg-bg-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border-light">
                <button
                  type="button"
                  onClick={() => setDispatchOrder(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingDispatch}
                  className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 cursor-pointer shadow-xs"
                >
                  {submittingDispatch ? 'Menyimpan...' : 'Tandai Dalam Perjalanan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 7: GOODS RECEIPT AT SITE (MANDATORY PHOTO PROOF) ── */}
      {receiveOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-2xl p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-black text-text-primary m-0">Penerimaan Fisik Barang di Proyek (Goods Receipt)</h3>
            <p className="text-xs text-text-muted m-0 mt-1">PO: {receiveOrder.poNumber || receiveOrder.prNumber}</p>

            <form onSubmit={handleReceiveSubmit} className="space-y-4 mt-4">
              {/* Mandatory Job-Site Photo Upload */}
              <div className="p-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary/[0.02]">
                <label className="text-xs font-black uppercase text-primary mb-1 block flex items-center gap-1.5">
                  <Camera size={16} /> Foto Bukti Fisik Material Tiba di Lokasi Proyek (Wajib) *
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  required
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setSitePhotoFile(f);
                    if (f) setSitePhotoPreview(URL.createObjectURL(f));
                  }}
                  className="w-full text-xs mt-2"
                />
                {sitePhotoPreview && (
                  <div className="mt-3 w-40 h-28 rounded-lg overflow-hidden border border-border">
                    <img src={sitePhotoPreview} alt="Site arrival preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* Multi-Item Receiving Checklist */}
              <div>
                <span className="text-xs font-bold text-text-muted uppercase mb-1 block">Verifikasi Kuantitas Fisik per Baris</span>
                <div className="border border-border-light rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-border-light text-[11px] font-black text-text-muted uppercase">
                      <tr>
                        <th className="p-2">Nama Material</th>
                        <th className="p-2 text-primary">Spesifikasi / Spec</th>
                        <th className="p-2 text-center w-24">Qty Dipesan</th>
                        <th className="p-2 text-center w-28">Qty Diterima</th>
                        <th className="p-2 text-center w-36">Kondisi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {receivingItemsState.map((itm, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-bold text-text-primary">{itm.item}</td>
                          <td className="p-2 text-text-secondary italic">{itm.specifications || '-'}</td>
                          <td className="p-2 text-center">{itm.qty} {itm.unit}</td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={itm.receivedQty}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setReceivingItemsState((prev) => {
                                  const c = [...prev];
                                  c[idx].receivedQty = val;
                                  return c;
                                });
                              }}
                              className="w-20 p-1 text-center font-bold border rounded border-border-light"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <select
                              value={itm.receivedCondition}
                              onChange={(e) => {
                                const val = e.target.value;
                                setReceivingItemsState((prev) => {
                                  const c = [...prev];
                                  c[idx].receivedCondition = val;
                                  return c;
                                });
                              }}
                              className="p-1 text-xs border rounded border-border-light"
                            >
                              <option value="Good">Lengkap & Baik</option>
                              <option value="Partial">Kurang / Selisih</option>
                              <option value="Damaged">Ada Kerusakan</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Catatan Penerima</label>
                <input
                  type="text"
                  value={receiverNotes}
                  onChange={(e) => setReceiverNotes(e.target.value)}
                  placeholder="Material telah dibongkar dan diletakkan di gudang zona 1..."
                  className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border-light">
                <button
                  type="button"
                  onClick={() => setReceiveOrder(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingReceive}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 cursor-pointer shadow-xs"
                >
                  {submittingReceive ? 'Menyimpan & Memasukkan Stok...' : 'Konfirmasi Selesai & Tambah ke Stok Proyek'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 8: UBAH PENUGASAN APPROVER & REVIEWER (OWNER ONLY) ── */}
      {isOwner && assignModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-xl animate-dropdown-enter">
            <div className="flex items-center justify-between pb-3 border-b border-border-light">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                  <SlidersHorizontal size={16} />
                </div>
                <div>
                  <h3 className="text-base font-black text-text-primary m-0">Atur Penugasan Approver PR & PO</h3>
                  <p className="text-xs text-text-muted m-0 mt-0.5">
                    PR: <b>{assignModalOrder.prNumber}</b>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalOrder(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 mt-4">
              <p className="text-xs text-text-muted">
                Tentukan personel spesifik yang bertanggung jawab meninjau teknis, menyetujui PR operasional, dan menyetujui anggaran PO untuk transaksi ini.
              </p>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-1 block flex items-center gap-1.5">
                  <UserCheck size={14} className="text-blue-600" />
                  <span>1. Peninjau Teknis / QC (Supervisor / QA)</span>
                </label>
                <select
                  value={assignReviewerId}
                  onChange={(e) => setAssignReviewerId(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium"
                >
                  <option value="">-- Bebas (Semua QC/SPV Berhak Reviu) --</option>
                  {authorizers.reviewers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.fullName} ({u.role}) - {u.email || ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-1 block flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-indigo-600" />
                  <span>2. Penyetuju PR (Direktur Operasional)</span>
                </label>
                <select
                  value={assignOpsApproverId}
                  onChange={(e) => setAssignOpsApproverId(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium"
                >
                  <option value="">-- Bebas (Semua Direktur Ops Berhak Setujui) --</option>
                  {authorizers.opsApprovers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.fullName} ({u.role}) - {u.email || ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-1 block flex items-center gap-1.5">
                  <DollarSign size={14} className="text-emerald-600" />
                  <span>3. Penyetuju PO & Budget (Direktur Keuangan)</span>
                </label>
                <select
                  value={assignFinanceApproverId}
                  onChange={(e) => setAssignFinanceApproverId(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white font-medium"
                >
                  <option value="">-- Bebas (Semua Direktur Keuangan Berhak Setujui) --</option>
                  {authorizers.financeApprovers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.fullName} ({u.role}) - {u.email || ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-5 pt-3 border-t border-border-light">
              <button
                type="button"
                onClick={() => setAssignModalOrder(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveAssignAuthorizers}
                disabled={savingAssignment}
                className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark cursor-pointer shadow-xs disabled:opacity-50"
              >
                {savingAssignment ? 'Menyimpan...' : 'Simpan Penugasan Approver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 9: DIREKTORI ALUR & PERSONEL APPROVER (OWNER ONLY) ── */}
      {isOwner && showAuthorizerDirectoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl animate-dropdown-enter">
            <div className="flex items-center justify-between pb-4 border-b border-border-light">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-text-primary m-0">
                    Alur Otorisasi & Direktori Personel Approver
                  </h3>
                  <p className="text-xs text-text-muted m-0 mt-0.5">
                    Panduan 7 tahap alur pengadaan & daftar personil yang berwenang melakukan review dan approval
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAuthorizerDirectoryModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Visual Workflow Steps */}
            <div className="mt-5 space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-border-light">
                <span className="text-xs font-black uppercase tracking-wide text-text-primary block mb-3">
                  7 Tahap Alur Standar Procurement & Purchase Order
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-white border border-border-light space-y-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase block">Tahap 1</span>
                    <span className="font-bold text-text-primary block">Pengajuan PR Baru</span>
                    <p className="text-[11px] text-text-muted m-0">Berdasarkan RAB Proyek atau item kustom, multi-item material.</p>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-blue-200 bg-blue-50/20 space-y-1">
                    <span className="text-[10px] font-black text-blue-600 uppercase block">Tahap 2</span>
                    <span className="font-bold text-blue-900 block">Reviu QC / SPV</span>
                    <p className="text-[11px] text-text-muted m-0">Supervisor atau Quality Control memverifikasi spesifikasi & qty.</p>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-indigo-200 bg-indigo-50/20 space-y-1">
                    <span className="text-[10px] font-black text-indigo-600 uppercase block">Tahap 3</span>
                    <span className="font-bold text-indigo-900 block">Persetujuan Ops Director</span>
                    <p className="text-[11px] text-text-muted m-0">Otorisasi PR resmi dengan passphrase tanda tangan digital.</p>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-purple-200 bg-purple-50/20 space-y-1">
                    <span className="text-[10px] font-black text-purple-600 uppercase block">Tahap 4</span>
                    <span className="font-bold text-purple-900 block">Komparasi Supplier Multi-Item</span>
                    <p className="text-[11px] text-text-muted m-0">Membandingkan tarif per item vendor, ongkir, dan landed cost.</p>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-emerald-200 bg-emerald-50/20 space-y-1">
                    <span className="text-[10px] font-black text-emerald-600 uppercase block">Tahap 5</span>
                    <span className="font-bold text-emerald-900 block">Persetujuan Finance Director</span>
                    <p className="text-[11px] text-text-muted m-0">Approval anggaran PO mengikat, ditandai sebagai Siap Beli (Must Purchase).</p>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-sky-200 bg-sky-50/20 space-y-1">
                    <span className="text-[10px] font-black text-sky-600 uppercase block">Tahap 6</span>
                    <span className="font-bold text-sky-900 block">Pengiriman (On The Way)</span>
                    <p className="text-[11px] text-text-muted m-0">Input no. polisi, nama supir, dan foto Surat Jalan supplier.</p>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-teal-200 bg-teal-50/20 space-y-1 col-span-1 sm:col-span-2">
                    <span className="text-[10px] font-black text-teal-600 uppercase block">Tahap 7</span>
                    <span className="font-bold text-teal-900 block">Penerimaan Fisik di Proyek (Goods Receipt)</span>
                    <p className="text-[11px] text-text-muted m-0">Wajib unggah foto fisik material tiba di lokasi proyek & ceklist kuantitas per baris sebelum masuk inventaris stok.</p>
                  </div>
                </div>
              </div>

              {/* Authorizers Directory Groups */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Reviewers */}
                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-blue-900 flex items-center gap-1.5">
                      <UserCheck size={14} className="text-blue-600" />
                      <span>Reviewer QC / SPV</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                      {authorizers.reviewers.length} Personel
                    </span>
                  </div>
                  <div className="divide-y divide-blue-100 max-h-48 overflow-y-auto">
                    {authorizers.reviewers.map((u) => (
                      <div key={u._id} className="py-2 text-xs">
                        <div className="font-bold text-text-primary">{u.fullName}</div>
                        <div className="text-[11px] text-text-muted flex items-center justify-between">
                          <span>{u.role}</span>
                          <span className="italic">{u.email}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Ops Approvers */}
                <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-indigo-900 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-indigo-600" />
                      <span>Ops Director Approver</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                      {authorizers.opsApprovers.length} Personel
                    </span>
                  </div>
                  <div className="divide-y divide-indigo-100 max-h-48 overflow-y-auto">
                    {authorizers.opsApprovers.map((u) => (
                      <div key={u._id} className="py-2 text-xs">
                        <div className="font-bold text-text-primary">{u.fullName}</div>
                        <div className="text-[11px] text-text-muted flex items-center justify-between">
                          <span>{u.role}</span>
                          <span className="italic">{u.email}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Finance Approvers */}
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-emerald-900 flex items-center gap-1.5">
                      <DollarSign size={14} className="text-emerald-600" />
                      <span>Finance Director Approver</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {authorizers.financeApprovers.length} Personel
                    </span>
                  </div>
                  <div className="divide-y divide-emerald-100 max-h-48 overflow-y-auto">
                    {authorizers.financeApprovers.map((u) => (
                      <div key={u._id} className="py-2 text-xs">
                        <div className="font-bold text-text-primary">{u.fullName}</div>
                        <div className="text-[11px] text-text-muted flex items-center justify-between">
                          <span>{u.role}</span>
                          <span className="italic">{u.email}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 mt-5 border-t border-border-light">
              <button
                type="button"
                onClick={() => setShowAuthorizerDirectoryModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer shadow-xs"
              >
                Tutup Direktori
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
