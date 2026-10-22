import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Receipt,
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
  Table,
  LayoutGrid,
  ArrowUpDown,
  ChevronRight,
  CreditCard,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api, {
  reviewMaterialRequest,
  opsApproveMaterialRequest,
  financeApproveMaterialRequest,
  dispatchMaterialOrder,
  deleteMaterialRequest,
  getProcurementAuthorizers,
  getProcurementConfig,
} from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Button, Input, EmptyState, LoadingOverlay, Badge } from '../components/shared';
import {
  ProcurementConfigModal,
  OrderAuthorizerAssignModal,
  SupplierSourcingModal,
  MaterialRequestCreateModal,
  MaterialOrderReceiveModal,
  MaterialBulkActionModal,
  BulkActionType,
  MaterialPaymentConfirmationModal,
  PaymentEvidenceViewerModal,
} from '../components/materials';
import {
  MaterialRequest,
  ProjectData,
  ProcurementStatus,
  ProcurementAuthorizersResponse,
  ProcurementConfigResponse,
} from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { formatDate } from '../utils/date';
import { formatRupiah } from '../utils/currency';
import {
  exportPurchaseRequestPdf,
  exportPurchaseOrderPdf,
  exportGoodsReceiptPdf,
  exportPaymentVoucherPdf,
} from '../utils/exportProcurementPdf';
import { getImageUrl } from '../utils/image';

type PipelineTab = 'PR' | 'PO_SOURCING' | 'MUST_PURCHASE' | 'ON_THE_WAY' | 'DELIVERED' | 'PAID' | 'ALL';

const fmtDateStr = (d?: string) => {
  if (!d) return '-';
  try {
    return formatDate(d);
  } catch {
    return d;
  }
};

export default function Materials() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Tabs
  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<PipelineTab>('PR');

  // Enterprise Data Table View State
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [sortField, setSortField] = useState<'date' | 'prNumber' | 'amount' | 'status'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Authorizers Directory & Assignment State
  const [authorizers, setAuthorizers] = useState<ProcurementAuthorizersResponse>({
    all: [],
    reviewers: [],
    opsApprovers: [],
    financeApprovers: [],
  });
  const [showAuthorizerDirectoryModal, setShowAuthorizerDirectoryModal] = useState(false);
  const [assignModalOrder, setAssignModalOrder] = useState<MaterialRequest | null>(null);

  // Global Procurement Config State (Company-Wide Auto Routing)
  const [procurementConfig, setProcurementConfig] = useState<ProcurementConfigResponse | null>(null);

  // Multi-Item PR Creation Modal State
  const [showAddPrModal, setShowAddPrModal] = useState(false);

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

  // Post-GRN Payment Confirmation & Evidence Modal State
  const [paymentOrder, setPaymentOrder] = useState<MaterialRequest | null>(null);
  const [viewEvidenceOrder, setViewEvidenceOrder] = useState<MaterialRequest | null>(null);

  // Expanded items in list view
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);

  // Multi-Selection State for Bulk Approval & Actions
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [bulkModalConfig, setBulkModalConfig] = useState<{
    isOpen: boolean;
    actionType: BulkActionType;
    orders: MaterialRequest[];
  }>({
    isOpen: false,
    actionType: 'ops',
    orders: [],
  });

  // User role helpers
  const userRole = user?.role?.toLowerCase() || 'worker';
  const isOwner = userRole === 'owner';
  const canReview = ['owner', 'director', 'operational_director', 'site_manager', 'supervisor', 'admin_project'].includes(userRole);
  const canOpsApprove = ['owner', 'president_director', 'operational_director', 'director'].includes(userRole);
  const canFinanceApprove = ['owner', 'president_director', 'director'].includes(userRole);
  const canSourcing = ['owner', 'director', 'operational_director', 'asset_admin', 'admin_project', 'supervisor'].includes(userRole);
  const canReceive = ['owner', 'director', 'operational_director', 'site_manager', 'supervisor', 'foreman', 'asset_admin'].includes(userRole);
  const canPay = ['owner', 'president_director', 'director', 'operational_director', 'admin_project', 'asset_admin'].includes(userRole);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reqRes, projRes, authRes, configRes] = await Promise.all([
        api.get('/requests'),
        api.get('/projects'),
        isOwner
          ? getProcurementAuthorizers().catch(() => ({ all: [], reviewers: [], opsApprovers: [], financeApprovers: [] }))
          : Promise.resolve({ all: [], reviewers: [], opsApprovers: [], financeApprovers: [] }),
        getProcurementConfig().catch(() => null),
      ]);
      setRequests(reqRes.data);
      setProjects(projRes.data);
      if (authRes && isOwner) {
        setAuthorizers(authRes);
      }
      if (configRes) {
        setProcurementConfig(configRes);
      }
    } catch (err) {
      console.error('Failed to fetch procurement data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddPrModal = () => setShowAddPrModal(true);
  const handleOpenAssignModal = (order: MaterialRequest) => setAssignModalOrder(order);

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

  const handleOpenSourcingModal = (order: MaterialRequest) => setSourcingOrder(order);

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

  const handleOpenReceiveModal = (order: MaterialRequest) => setReceiveOrder(order);

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
      } else if (activeTab === 'PAID') {
        if (st !== 'PAID') return false;
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
        const isPl = r.selectedSupplier?.schemeType === 'PAYLATER' || r.selectedSupplier?.isPaylater || r.paymentConfirmation?.schemeApplied === 'PAYLATER';
        const plKeyword = isPl ? 'paylater ambil dulu 0% tanpa bunga' : '';
        return prNo.includes(q) || poNo.includes(q) || itm.includes(q) || itemsText.includes(q) || vendor.includes(q) || proj.includes(q) || rabKeyword.includes(q) || plKeyword.includes(q);
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
      PAID: requests.filter((r) => r.status === 'PAID').length,
      ALL: requests.length,
    };
  }, [requests]);

  const getStatusBadge = (status: ProcurementStatus) => {
    switch (status) {
      case 'PR_PENDING':
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-amber-100 text-amber-950 border border-amber-400">
            <Clock size={11} className="text-amber-800 shrink-0" />
            <span>Menunggu QC Review</span>
          </span>
        );
      case 'PR_REVIEWED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-blue-100 text-blue-950 border border-blue-400">
            <UserCheck size={11} className="text-blue-800 shrink-0" />
            <span>Menunggu Ops Director</span>
          </span>
        );
      case 'PR_APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-indigo-100 text-indigo-950 border border-indigo-400">
            <CheckCircle2 size={11} className="text-indigo-800 shrink-0" />
            <span>PR Disetujui (Sourcing)</span>
          </span>
        );
      case 'PO_PENDING_FINANCE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-purple-100 text-purple-950 border border-purple-400">
            <DollarSign size={11} className="text-purple-800 shrink-0" />
            <span>Menunggu Approval Finance</span>
          </span>
        );
      case 'MUST_PURCHASE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-emerald-100 text-emerald-950 border border-emerald-400">
            <Check size={11} className="text-emerald-800 shrink-0" />
            <span>Siap Beli (PO Disetujui)</span>
          </span>
        );
      case 'ON_THE_WAY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-sky-100 text-sky-950 border border-sky-400">
            <Truck size={11} className="text-sky-800 shrink-0" />
            <span>Dalam Pengiriman</span>
          </span>
        );
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-emerald-100 text-emerald-950 border border-emerald-400">
            <CheckCircle2 size={11} className="text-emerald-800 shrink-0" />
            <span>Selesai (Lunas)</span>
          </span>
        );
      case 'DELIVERED':
      case 'Delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-teal-100 text-teal-950 border border-teal-400">
            <CheckCircle2 size={11} className="text-teal-800 shrink-0" />
            <span>Diterima (GRN)</span>
          </span>
        );
      case 'PR_REJECTED':
      case 'Rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-rose-100 text-rose-950 border border-rose-400">
            <XCircle size={11} className="text-rose-800 shrink-0" />
            <span>Ditolak</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-slate-200 text-slate-900 border border-slate-300">
            {status}
          </span>
        );
    }
  };

  const getOrderTotalAmount = (order: MaterialRequest) => {
    if (order.poTotalAmount && Number(order.poTotalAmount) > 0) return Number(order.poTotalAmount);
    if (order.selectedSupplier?.totalLandedCost && Number(order.selectedSupplier.totalLandedCost) > 0) {
      return Number(order.selectedSupplier.totalLandedCost);
    }
    if (order.items && order.items.length > 0) {
      return order.items.reduce(
        (sum, itm) =>
          sum + (Number(itm.totalBudget) || Number(itm.qty) * Number(itm.budgetUnitRate) || 0),
        0
      );
    }
    return Number(order.totalEstimatedBudget || order.costEstimate) || 0;
  };

  const getCurrentApproverName = (order: MaterialRequest) => {
    switch (order.status) {
      case 'PR_PENDING':
      case 'Pending':
        return typeof order.assignedReviewerId === 'object'
          ? (order.assignedReviewerId?.fullName || order.assignedReviewerId?.name || 'QC/SPV')
          : (order.reviewedBy?.user?.fullName || order.reviewedBy?.user?.name || 'Reviewer QC / SPV');
      case 'PR_REVIEWED':
        return typeof order.assignedOpsApproverId === 'object'
          ? (order.assignedOpsApproverId?.fullName || order.assignedOpsApproverId?.name || 'Ops Director')
          : (order.opsApprovedBy?.user?.fullName || order.opsApprovedBy?.user?.name || 'Direktur Ops');
      case 'PO_PENDING_FINANCE':
        return typeof order.assignedFinanceApproverId === 'object'
          ? (order.assignedFinanceApproverId?.fullName || order.assignedFinanceApproverId?.name || 'Finance Director')
          : (order.financeApprovedBy?.user?.fullName || order.financeApprovedBy?.user?.name || 'Direktur Keuangan');
      case 'PR_APPROVED':
        return 'Tim Pengadaan (Sourcing)';
      case 'MUST_PURCHASE':
        return order.selectedSupplier?.supplierName ? `PO: ${order.selectedSupplier.supplierName}` : 'Vendor Pengadaan';
      case 'ON_THE_WAY':
        return order.dispatchInfo?.driverName ? `Supir: ${order.dispatchInfo.driverName}` : 'Ekspedisi / Logistik';
      case 'DELIVERED':
      case 'Delivered':
        return typeof order.deliveryProof?.receivedBy === 'object'
          ? (order.deliveryProof?.receivedBy?.fullName || order.deliveryProof?.receivedBy?.name || 'Penerima Proyek')
          : 'Diterima di Lapangan';
      case 'PR_REJECTED':
      case 'Rejected':
        return 'Ditolak';
      default:
        return '-';
    }
  };

  const handleSort = (field: 'date' | 'prNumber' | 'amount' | 'status') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'amount' || field === 'date' ? 'desc' : 'asc');
    }
  };

  const sortedRequests = useMemo(() => {
    const list = [...filteredRequests];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') {
        const dateA = new Date(a.createdAt || a.dateNeeded || 0).getTime();
        const dateB = new Date(b.createdAt || b.dateNeeded || 0).getTime();
        cmp = dateA - dateB;
      } else if (sortField === 'prNumber') {
        const prA = a.prNumber || '';
        const prB = b.prNumber || '';
        cmp = prA.localeCompare(prB);
      } else if (sortField === 'amount') {
        cmp = getOrderTotalAmount(a) - getOrderTotalAmount(b);
      } else if (sortField === 'status') {
        cmp = (a.status || '').localeCompare(b.status || '');
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredRequests, sortField, sortDirection]);

  const totalAccumulatedAmount = useMemo(() => {
    return filteredRequests.reduce((sum, order) => sum + getOrderTotalAmount(order), 0);
  }, [filteredRequests]);

  // Selected orders list
  const selectedOrders = useMemo(() => {
    return requests.filter((r) => r._id && selectedOrderIds.includes(r._id));
  }, [requests, selectedOrderIds]);

  // Selection Partitions by Lifecycle Stage
  const pendingReviewSelected = useMemo(() => {
    return selectedOrders.filter((r) => ['PR_PENDING', 'Pending'].includes(r.status));
  }, [selectedOrders]);

  const pendingOpsSelected = useMemo(() => {
    return selectedOrders.filter((r) => r.status === 'PR_REVIEWED');
  }, [selectedOrders]);

  const pendingFinanceSelected = useMemo(() => {
    return selectedOrders.filter((r) => r.status === 'PO_PENDING_FINANCE');
  }, [selectedOrders]);

  const pendingReceiveSelected = useMemo(() => {
    return selectedOrders.filter((r) => r.status === 'ON_THE_WAY');
  }, [selectedOrders]);

  const pendingPaymentSelected = useMemo(() => {
    return selectedOrders.filter((r) => ['DELIVERED', 'Delivered'].includes(r.status));
  }, [selectedOrders]);

  const deletableSelected = useMemo(() => {
    return selectedOrders.filter((r) => {
      const isDeletableStatus = ['PR_PENDING', 'Pending', 'PR_REJECTED', 'Rejected'].includes(r.status);
      const reqUserId = typeof r.requestedBy === 'object' ? r.requestedBy?._id : r.requestedBy;
      const isCreator = user?._id && String(reqUserId) === String(user._id);
      return isDeletableStatus && (isOwner || isCreator);
    });
  }, [selectedOrders, isOwner, user?._id]);

  const exportablePoSelected = useMemo(() => {
    return selectedOrders.filter((r) =>
      Boolean(r.poNumber || ['MUST_PURCHASE', 'ON_THE_WAY', 'DELIVERED', 'Delivered', 'PAID'].includes(r.status))
    );
  }, [selectedOrders]);

  const exportableGrnSelected = useMemo(() => {
    return selectedOrders.filter((r) =>
      ['DELIVERED', 'Delivered', 'PAID'].includes(r.status) || Boolean(r.deliveryProof)
    );
  }, [selectedOrders]);

  const exportablePaymentSelected = useMemo(() => {
    return selectedOrders.filter((r) => r.status === 'PAID' || Boolean(r.paymentConfirmation));
  }, [selectedOrders]);

  // Batch PDF Export Menu & State
  const [isExportingBulk, setIsExportingBulk] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

  const handleBulkExportPdf = async (type: 'PR' | 'PO' | 'GRN' | 'PAYMENT') => {
    setIsExportingBulk(true);
    setShowExportMenu(false);
    try {
      if (type === 'PO') {
        if (exportablePoSelected.length === 0) {
          alert('Tidak ada Purchase Order (PO) yang dapat diunduh pada item terpilih.');
          return;
        }
        for (const ord of exportablePoSelected) {
          await exportPurchaseOrderPdf(ord);
          await new Promise((res) => setTimeout(res, 250));
        }
      } else if (type === 'GRN') {
        if (exportableGrnSelected.length === 0) {
          alert('Tidak ada Surat Penerimaan Barang (GRN) pada item terpilih.');
          return;
        }
        for (const ord of exportableGrnSelected) {
          await exportGoodsReceiptPdf(ord);
          await new Promise((res) => setTimeout(res, 250));
        }
      } else if (type === 'PAYMENT') {
        if (exportablePaymentSelected.length === 0) {
          alert('Tidak ada Bukti Pembayaran / Voucher Kas pada item terpilih.');
          return;
        }
        for (const ord of exportablePaymentSelected) {
          await exportPaymentVoucherPdf(ord);
          await new Promise((res) => setTimeout(res, 250));
        }
      } else if (type === 'PR') {
        for (const ord of selectedOrders) {
          await exportPurchaseRequestPdf(ord);
          await new Promise((res) => setTimeout(res, 250));
        }
      }
    } catch (err) {
      console.error('Bulk PDF export error', err);
      alert('Terjadi kesalahan saat mengunduh dokumen batch PDF.');
    } finally {
      setIsExportingBulk(false);
    }
  };

  // Master checkbox states for current visible list
  const visibleIds = useMemo(() => {
    return sortedRequests.map((r) => r._id!).filter(Boolean);
  }, [sortedRequests]);

  const isAllSelected = useMemo(() => {
    return visibleIds.length > 0 && visibleIds.every((id) => selectedOrderIds.includes(id));
  }, [visibleIds, selectedOrderIds]);

  const isSomeSelected = useMemo(() => {
    return visibleIds.some((id) => selectedOrderIds.includes(id)) && !isAllSelected;
  }, [visibleIds, selectedOrderIds, isAllSelected]);

  const handleToggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedOrderIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedOrderIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleClearSelection = () => {
    setSelectedOrderIds([]);
  };

  const handleOpenBulkModal = (actionType: BulkActionType, targetOrders: MaterialRequest[]) => {
    if (targetOrders.length === 0) return;
    setBulkModalConfig({
      isOpen: true,
      actionType,
      orders: targetOrders,
    });
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
              onClick={() => navigate('/approval-config')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all cursor-pointer shadow-xs shrink-0 border border-slate-800"
              title="Pusat Kebijakan & Otorisasi Approver Global (Owner Only)"
            >
              <ShieldCheck size={15} className="text-amber-400" />
              <span>Kebijakan Approver</span>
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

      {/* ── Search, Project Filter & View Controls ── */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nomor PR, PO, nama material, supplier..."
            className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border-2 border-slate-300 bg-white text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-2xs"
          />
        </div>

        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="w-full sm:w-60 px-3 py-2.5 text-xs rounded-xl border-2 border-slate-300 bg-white text-slate-900 font-bold focus:outline-none focus:border-primary shadow-2xs cursor-pointer"
        >
          <option value="all">Semua Proyek</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.nama}
            </option>
          ))}
        </select>

        {/* View Mode Toggle: Tabel ERP vs Kartu */}
        <div className="flex items-center gap-1 p-1 bg-slate-200 rounded-xl border border-slate-300 shrink-0 shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-primary text-white shadow-xs border border-primary'
                : 'text-slate-700 hover:text-slate-950 hover:bg-slate-300/60'
            }`}
            title="Tampilan Tabel ERP Enterprise (Terstruktur & Padat Data)"
          >
            <Table size={14} strokeWidth={2.5} />
            <span>Tabel ERP</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('card')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              viewMode === 'card'
                ? 'bg-primary text-white shadow-xs border border-primary'
                : 'text-slate-700 hover:text-slate-950 hover:bg-slate-300/60'
            }`}
            title="Tampilan Kartu Tradisional"
          >
            <LayoutGrid size={14} strokeWidth={2.5} />
            <span>Kartu</span>
          </button>
        </div>
      </div>

      {/* ── Pipeline Navigation Tabs ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-border-light">
        {[
          { id: 'PR', label: '1. Pengajuan PR', count: tabCounts.PR },
          { id: 'PO_SOURCING', label: '2. Komparasi PO', count: tabCounts.PO_SOURCING },
          { id: 'MUST_PURCHASE', label: '3. Siap Beli (PO)', count: tabCounts.MUST_PURCHASE },
          { id: 'ON_THE_WAY', label: '4. Dalam Pengiriman', count: tabCounts.ON_THE_WAY },
          { id: 'DELIVERED', label: '5. Diterima (GRN)', count: tabCounts.DELIVERED },
          { id: 'PAID', label: '6. Selesai (Lunas)', count: tabCounts.PAID },
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
      ) : viewMode === 'table' ? (
        /* ══════════════════════════════════════════════════════════════ */
        /* ── ENTERPRISE DATA TABLE (ERP-TABLES-UX STANDARD) ──           */
        /* ══════════════════════════════════════════════════════════════ */
        <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white border-b-2 border-slate-950 text-[11px] font-black uppercase tracking-wider select-none">
                  {/* Master Selection Checkbox */}
                  <th className="py-3.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua data pengadaan pada halaman ini"
                      className="w-4 h-4 rounded border-slate-500 text-primary accent-primary cursor-pointer transition-colors"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeSelected;
                      }}
                      onChange={handleToggleSelectAll}
                    />
                  </th>
                  <th className="py-3.5 px-3 w-12 text-center text-slate-300">#</th>
                  <th
                    className="py-3.5 px-3 text-left cursor-pointer hover:bg-slate-800 transition-colors text-white"
                    onClick={() => handleSort('prNumber')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>No. Dokumen</span>
                      <ArrowUpDown size={12} className={sortField === 'prNumber' ? 'text-amber-400 font-bold' : 'text-slate-400 opacity-60'} />
                    </div>
                  </th>
                  <th className="py-3.5 px-3 text-left text-white min-w-[200px]">Proyek & Tipe</th>
                  <th className="py-3.5 px-3 text-left text-white">Pemohon</th>
                  <th className="py-3.5 px-3 text-left text-white">Ringkasan Material</th>
                  <th
                    className="py-3.5 px-3 text-right cursor-pointer hover:bg-slate-800 transition-colors text-white"
                    onClick={() => handleSort('amount')}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Total Anggaran / PO</span>
                      <ArrowUpDown size={12} className={sortField === 'amount' ? 'text-amber-400 font-bold' : 'text-slate-400 opacity-60'} />
                    </div>
                  </th>
                  <th
                    className="py-3.5 px-3 text-left cursor-pointer hover:bg-slate-800 transition-colors text-white"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Status & Tahap</span>
                      <ArrowUpDown size={12} className={sortField === 'status' ? 'text-amber-400 font-bold' : 'text-slate-400 opacity-60'} />
                    </div>
                  </th>
                  <th className="py-3.5 px-3 text-left text-white">Penanggung Jawab</th>
                  <th className="py-3.5 px-3 text-right text-white">Aksi & Dokumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedRequests.map((order) => {
                  const isExpanded = expandedOrders.includes(order._id!);
                  const isSelected = selectedOrderIds.includes(order._id!);
                  const itemsList =
                    order.items && order.items.length > 0
                      ? order.items
                      : [
                          {
                            item: order.item,
                            specifications: '',
                            qty: Number(order.qty) || 1,
                            unit: order.unit || 'Pcs',
                            budgetUnitRate: order.costEstimate
                              ? Number(order.costEstimate) / (Number(order.qty) || 1)
                              : 0,
                            totalBudget: Number(order.costEstimate) || 0,
                          },
                        ];
                  const hasRab = (order.items || []).some((i) => i.isRabBased || i.wbsCode);
                  const totalAmt = getOrderTotalAmount(order);

                  return (
                    <React.Fragment key={order._id}>
                      <tr
                        className={`transition-colors hover:bg-blue-50/80 ${
                          isSelected
                            ? 'bg-blue-50/90 border-l-4 border-l-blue-600 font-medium'
                            : isExpanded
                            ? 'bg-blue-50/50 border-l-4 border-l-primary font-medium'
                            : 'even:bg-slate-50/70 odd:bg-white'
                        }`}
                      >
                        {/* Checkbox Column */}
                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Pilih ${order.prNumber || 'order'}`}
                            className="w-4 h-4 rounded border-slate-300 text-primary accent-primary cursor-pointer transition-colors"
                            checked={isSelected}
                            onChange={() => handleToggleSelectOrder(order._id!)}
                          />
                        </td>

                        {/* 0. Expand Button */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleExpandOrder(order._id!)}
                            className={`w-7 h-7 mx-auto rounded-lg flex items-center justify-center transition-all cursor-pointer border ${
                              isExpanded
                                ? 'bg-primary text-white border-primary shadow-xs'
                                : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100 hover:text-primary hover:border-primary/50'
                            }`}
                            title={isExpanded ? 'Tutup Rincian' : 'Buka Rincian Material'}
                          >
                            {isExpanded ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronRight size={14} strokeWidth={2.5} />}
                          </button>
                        </td>

                        {/* 1. No. Dokumen (Left-aligned) */}
                        <td className="py-3 px-3 text-left whitespace-nowrap min-w-[130px]">
                          <div className="font-black text-slate-950 text-xs flex items-center gap-1.5">
                            <span className="font-mono tracking-tight">{order.prNumber || 'DRAFT-PR'}</span>
                          </div>
                          {order.poNumber && (
                            <div className="mt-0.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-black font-mono text-blue-950 bg-blue-100 border border-blue-400 px-2 py-0.5 rounded-md shadow-2xs">
                                PO: {order.poNumber}
                              </span>
                            </div>
                          )}
                          <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 mt-0.5">
                            <Clock size={10} className="text-slate-500 shrink-0" />
                            <span>{fmtDateStr(order.createdAt || order.dateNeeded)}</span>
                          </div>
                        </td>

                        {/* 2. Proyek & Tipe (Left-aligned) */}
                        <td className="py-3 px-3 text-left min-w-[200px] max-w-[320px]">
                          <div
                            className="font-bold text-slate-950 text-xs break-words line-clamp-2 leading-snug"
                            title={typeof order.projectId === 'object' && order.projectId?.nama ? order.projectId.nama : 'Non-Proyek / Umum'}
                          >
                            {typeof order.projectId === 'object' && order.projectId?.nama ? order.projectId.nama : 'Non-Proyek / Umum'}
                          </div>
                          <div className="mt-1">
                            {hasRab ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-950 bg-indigo-100 border border-indigo-400 px-2 py-0.5 rounded-md shadow-2xs">
                                <Layers size={10} className="text-indigo-800 shrink-0" />
                                <span>RAB Based</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-950 bg-amber-100 border border-amber-400 px-2 py-0.5 rounded-md shadow-2xs">
                                <Package size={10} className="text-amber-800 shrink-0" />
                                <span>Non-RAB</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 3. Pemohon (Left-aligned) */}
                        <td className="py-3 px-3 text-left">
                          <div className="font-bold text-slate-950 text-xs truncate max-w-[130px]">
                            {typeof order.requestedBy === 'object' ? (order.requestedBy?.fullName || order.requestedBy?.name) : 'User'}
                          </div>
                          <div className="mt-1">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-slate-200 text-slate-900 border border-slate-300">
                              {typeof order.requestedBy === 'object' ? (order.requestedBy?.role || 'Staff') : 'Staff'}
                            </span>
                          </div>
                        </td>

                        {/* 4. Ringkasan Material (Left-aligned) */}
                        <td className="py-3 px-3 text-left max-w-[210px]">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-white font-black text-[10px] shrink-0 font-mono shadow-2xs">
                              {itemsList.length} Item
                            </span>
                            <span className="text-xs font-bold text-slate-950 truncate" title={itemsList[0]?.item}>
                              {itemsList[0]?.item || '-'}
                            </span>
                          </div>
                          {itemsList.length > 1 && (
                            <div className="text-[10px] font-semibold text-slate-600 truncate mt-1">
                              +{itemsList.length - 1} item lainnya ({itemsList.slice(1).map((i) => i.item).join(', ')})
                            </div>
                          )}
                        </td>

                        {/* 5. Est. Anggaran / Nilai PO (Strictly Right-aligned) */}
                        <td className="py-3 px-3 text-right">
                          <div className="font-black font-mono tabular-nums text-xs sm:text-[13px] text-slate-950 text-right">
                            {formatRupiah(totalAmt)}
                          </div>
                          <div className="mt-0.5 text-right">
                            {order.poNumber ? (
                              <span className="text-[10px] font-black text-blue-900 uppercase tracking-wider">
                                PO Mengikat
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                Est. Plafon PR
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 6. Status & Tahapan (Left-aligned badge) */}
                        <td className="py-3 px-3 text-left whitespace-nowrap">
                          {getStatusBadge(order.status)}
                          {(order.selectedSupplier?.schemeType === 'PAYLATER' || order.selectedSupplier?.isPaylater) && (
                            <div className="mt-1">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                                Paylater 0%
                              </span>
                            </div>
                          )}
                        </td>

                        {/* 7. Penanggung Jawab (Left-aligned) */}
                        <td className="py-3 px-3 text-left">
                          <div className="flex items-center gap-1.5 text-xs">
                            <div className="w-5 h-5 rounded-md bg-blue-100 text-blue-900 flex items-center justify-center shrink-0 border border-blue-300">
                              <UserCheck size={12} />
                            </div>
                            <span className="font-bold text-slate-950 truncate max-w-[130px]" title={getCurrentApproverName(order)}>
                              {getCurrentApproverName(order)}
                            </span>
                          </div>
                          {isOwner && ['PR_PENDING', 'Pending', 'PR_REVIEWED', 'PR_APPROVED'].includes(order.status) && (
                            <button
                              type="button"
                              onClick={() => handleOpenAssignModal(order)}
                              className="inline-flex items-center gap-1 text-[10px] font-black text-primary hover:text-blue-950 hover:underline mt-1 cursor-pointer"
                            >
                              <SlidersHorizontal size={10} />
                              <span>Ubah Approver</span>
                            </button>
                          )}
                        </td>

                        {/* 8. Aksi & Dokumen (Right-aligned) */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {/* Stage actions */}
                            {['PR_PENDING', 'Pending'].includes(order.status) && canReview && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReviewModalOrder(order);
                                  setReviewNotes('');
                                  setReviewPassphrase('');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-black text-[11px] hover:bg-blue-700 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                              >
                                Tinjau QC
                              </button>
                            )}

                            {order.status === 'PR_REVIEWED' && canOpsApprove && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpsApproveOrder(order);
                                  setOpsPassphrase('');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-[11px] hover:bg-indigo-700 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                              >
                                Setujui Ops
                              </button>
                            )}

                            {order.status === 'PR_APPROVED' && canSourcing && (
                              <button
                                type="button"
                                onClick={() => handleOpenSourcingModal(order)}
                                className="px-2.5 py-1 rounded-lg bg-purple-600 text-white font-black text-[11px] hover:bg-purple-700 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                              >
                                Komparasi PO
                              </button>
                            )}

                            {order.status === 'PO_PENDING_FINANCE' && canFinanceApprove && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFinanceApproveOrder(order);
                                  setFinancePassphrase('');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-black text-[11px] hover:bg-emerald-700 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                              >
                                Setujui PO
                              </button>
                            )}

                            {order.status === 'PO_PENDING_FINANCE' && canSourcing && (
                              <button
                                type="button"
                                onClick={() => handleOpenSourcingModal(order)}
                                className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-950 border border-purple-400 font-black text-[11px] hover:bg-purple-200 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                              >
                                Edit Sourcing
                              </button>
                            )}

                            {order.status === 'MUST_PURCHASE' && canSourcing && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDispatchOrder(order);
                                  setSuratJalanFile(null);
                                  setDispatchForm({ driverName: '', driverPhone: '', vehiclePlate: '', eta: '', notes: '' });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-sky-600 text-white font-black text-[11px] hover:bg-sky-700 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                              >
                                Kirim
                              </button>
                            )}

                            {order.status === 'ON_THE_WAY' && canReceive && (
                              <button
                                type="button"
                                onClick={() => handleOpenReceiveModal(order)}
                                className="px-2.5 py-1 rounded-lg bg-teal-600 text-white font-black text-[11px] hover:bg-teal-700 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                              >
                                Terima Barang
                              </button>
                            )}

                            {['DELIVERED', 'Delivered'].includes(order.status) && canPay && (
                              <button
                                type="button"
                                onClick={() => setPaymentOrder(order)}
                                title="Konfirmasi Pelunasan & Upload Bukti Pembayaran"
                                className={`px-2.5 py-1 rounded-lg text-white font-black text-[11px] transition-all cursor-pointer shadow-2xs whitespace-nowrap flex items-center gap-1 ${
                                  order.selectedSupplier?.schemeType === 'PAYLATER' || order.selectedSupplier?.isPaylater
                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                    : 'bg-indigo-600 hover:bg-indigo-700'
                                }`}
                              >
                                <Receipt size={12} />
                                <span>{order.selectedSupplier?.schemeType === 'PAYLATER' || order.selectedSupplier?.isPaylater ? 'Lunasi Paylater' : 'Bayar'}</span>
                              </button>
                            )}

                            {/* PDF Downloads */}
                            <button
                              type="button"
                              onClick={() => exportPurchaseRequestPdf(order)}
                              title="Unduh Dokumen PR PDF"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-300 font-extrabold text-[11px] shadow-2xs cursor-pointer transition-colors"
                            >
                              <Download size={12} className="text-slate-700" />
                              <span>PR</span>
                            </button>
                            {order.poNumber && (
                              <button
                                type="button"
                                onClick={() => exportPurchaseOrderPdf(order)}
                                title="Unduh Dokumen PO PDF"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-100 text-blue-950 hover:bg-blue-200 border border-blue-400 font-extrabold text-[11px] shadow-2xs cursor-pointer transition-colors"
                              >
                                <FileText size={12} className="text-blue-800" />
                                <span>PO</span>
                              </button>
                            )}
                            {['DELIVERED', 'Delivered', 'PAID'].includes(order.status) && (
                              <button
                                type="button"
                                onClick={() => exportGoodsReceiptPdf(order)}
                                title="Unduh Bukti Terima Barang GRN PDF"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-teal-100 text-teal-950 hover:bg-teal-200 border border-teal-400 font-extrabold text-[11px] shadow-2xs cursor-pointer transition-colors"
                              >
                                <FileCheck size={12} className="text-teal-800" />
                                <span>GRN</span>
                              </button>
                            )}
                            {(order.status === 'PAID' || order.paymentConfirmation?.bonPembayaranUrl) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setViewEvidenceOrder(order)}
                                  title="Lihat Bukti Bon Pembayaran & Transfer Bank"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 text-emerald-950 hover:bg-emerald-200 border border-emerald-400 font-extrabold text-[11px] shadow-2xs cursor-pointer transition-colors"
                                >
                                  <Receipt size={12} className="text-emerald-800" />
                                  <span>Bukti Bayar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => exportPaymentVoucherPdf(order)}
                                  title="Unduh Voucher Pelunasan Kas PDF"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-teal-100 text-teal-950 hover:bg-teal-200 border border-teal-400 font-extrabold text-[11px] shadow-2xs cursor-pointer transition-colors"
                                >
                                  <Download size={12} className="text-teal-800" />
                                  <span>Voucher</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ── EXPANDABLE SUB-ROW ACCORDION (LINE-ITEMS DETAIL) ── */}
                      {isExpanded && (
                        <tr className="bg-slate-100/90 border-b-2 border-slate-300">
                          <td colSpan={10} className="p-4 sm:p-5">
                            <div className="space-y-4">
                              {/* Rejection notice if present */}
                              {order.rejectionReason && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-100 border-2 border-rose-300 text-xs text-rose-950 font-bold shadow-2xs">
                                  <AlertCircle size={16} className="shrink-0 text-rose-700" />
                                  <span>Alasan Penolakan: <b className="text-rose-900">{order.rejectionReason}</b></span>
                                </div>
                              )}

                              {/* Material Line Items Sub-Table */}
                              <div className="rounded-xl border-2 border-slate-300 bg-white overflow-hidden shadow-xs">
                                <div className="px-4 py-3 bg-slate-900 border-b border-slate-950 flex items-center justify-between">
                                  <span className="text-xs font-black uppercase text-white tracking-wide flex items-center gap-2">
                                    <Layers size={14} className="text-amber-400" />
                                    <span>Rincian Material & Spesifikasi ({itemsList.length} Baris)</span>
                                  </span>
                                  {order.purpose && (
                                    <span className="text-xs text-slate-300 font-medium italic">
                                      Keperluan: {order.purpose}
                                    </span>
                                  )}
                                </div>

                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-slate-200 border-b-2 border-slate-300 text-[10px] font-black text-slate-900 uppercase tracking-wider">
                                      <th className="py-2.5 px-3 w-10 text-center">No</th>
                                      <th className="py-2.5 px-3 text-left">Nama Material</th>
                                      <th className="py-2.5 px-3 text-left">Spesifikasi Teknis</th>
                                      <th className="py-2.5 px-3 text-left">Mata Anggaran / WBS</th>
                                      <th className="py-2.5 px-3 text-right">Kuantitas</th>
                                      <th className="py-2.5 px-3 text-left">Satuan</th>
                                      <th className="py-2.5 px-3 text-right">Tarif Est.</th>
                                      <th className="py-2.5 px-3 text-right">Subtotal Plafon</th>
                                      {order.poNumber && <th className="py-2.5 px-3 text-right text-blue-950">Tarif PO Satuan</th>}
                                      {order.poNumber && <th className="py-2.5 px-3 text-right text-blue-950">Subtotal PO</th>}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200">
                                    {itemsList.map((itm, iIdx) => {
                                      const q = Number(itm.qty) || 1;
                                      const budgetRate = Number(itm.budgetUnitRate) || 0;
                                      const budgetSub = Number(itm.totalBudget) || (q * budgetRate);
                                      const poRate = Number(itm.poUnitPrice) || 0;
                                      const poSub = Number(itm.poTotalAmount) || (q * poRate);

                                      return (
                                        <tr key={iIdx} className="hover:bg-blue-50/60 even:bg-slate-50/50 odd:bg-white">
                                          <td className="py-2.5 px-3 text-center text-slate-700 font-mono font-bold">{iIdx + 1}</td>
                                          <td className="py-2.5 px-3 font-bold text-slate-950 text-left">{itm.item}</td>
                                          <td className="py-2.5 px-3 text-left">
                                            {itm.specifications ? (
                                              <span className="text-slate-900 font-semibold bg-slate-100 border border-slate-300 px-2 py-0.5 rounded text-[11px]">
                                                {itm.specifications}
                                              </span>
                                            ) : (
                                              <span className="italic text-slate-400 text-[11px]">-</span>
                                            )}
                                          </td>
                                          <td className="py-2.5 px-3 text-left">
                                            {itm.wbsCode ? (
                                              <span className="font-mono text-indigo-950 bg-indigo-100 border border-indigo-300 px-2 py-0.5 rounded text-[10px] font-black">
                                                {itm.wbsCode}
                                              </span>
                                            ) : (
                                              <span className="text-amber-950 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-black">
                                                Non-RAB
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-black text-slate-950">
                                            {q.toLocaleString('id-ID')}
                                          </td>
                                          <td className="py-2.5 px-3 text-left font-bold text-slate-800">{itm.unit || 'Pcs'}</td>
                                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-700">
                                            {formatRupiah(budgetRate)}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-black text-slate-950">
                                            {formatRupiah(budgetSub)}
                                          </td>
                                          {order.poNumber && (
                                            <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-blue-900">
                                              {poRate > 0 ? formatRupiah(poRate) : '-'}
                                            </td>
                                          )}
                                          {order.poNumber && (
                                            <td className="py-2.5 px-3 text-right font-mono tabular-nums font-black text-blue-950 bg-blue-50/70">
                                              {poSub > 0 ? formatRupiah(poSub) : '-'}
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Additional contextual accordions (Supplier / Dispatch / Goods Receipt) */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                {/* Approver Chain */}
                                <div className="p-3.5 rounded-xl bg-white border-2 border-slate-300 space-y-2 shadow-2xs">
                                  <span className="text-[11px] font-black uppercase text-slate-900 block border-b border-slate-200 pb-1">
                                    Alur & Otorisasi Personel
                                  </span>
                                  <div className="space-y-1.5 text-[11px]">
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-600 font-bold">1. QC/SPV:</span>
                                      <span className="font-extrabold text-slate-950">
                                        {typeof order.assignedReviewerId === 'object' ? order.assignedReviewerId?.fullName : (order.reviewedBy?.user?.fullName || 'Belum ditugaskan')}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-600 font-bold">2. Ops Director:</span>
                                      <span className="font-extrabold text-slate-950">
                                        {typeof order.assignedOpsApproverId === 'object' ? order.assignedOpsApproverId?.fullName : (order.opsApprovedBy?.user?.fullName || 'Belum ditugaskan')}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-600 font-bold">3. Finance Director:</span>
                                      <span className="font-extrabold text-slate-950">
                                        {typeof order.assignedFinanceApproverId === 'object' ? order.assignedFinanceApproverId?.fullName : (order.financeApprovedBy?.user?.fullName || 'Belum ditugaskan')}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Supplier info */}
                                {order.selectedSupplier && (
                                  <div className="p-3.5 rounded-xl bg-purple-50/70 border-2 border-purple-300 space-y-2 shadow-2xs">
                                    <span className="text-[11px] font-black uppercase text-purple-950 block border-b border-purple-200 pb-1">
                                      Vendor Terpilih (PO)
                                    </span>
                                    <div className="font-black text-purple-950 text-xs">
                                      {order.selectedSupplier.supplierName}
                                    </div>
                                    <div className="text-[11px] font-semibold text-purple-900">
                                      {order.selectedSupplier.contact ? `Kontak: ${order.selectedSupplier.contact}` : (order.selectedSupplier.location || 'Lokal')}
                                    </div>
                                    <div className="text-xs font-black text-purple-950 font-mono tabular-nums bg-purple-200/80 px-2 py-1 rounded border border-purple-300">
                                      Total PO: {formatRupiah(order.selectedSupplier.totalLandedCost || order.poTotalAmount)}
                                    </div>
                                  </div>
                                )}

                                {/* Dispatch or Delivery info */}
                                {order.dispatchInfo && (
                                  <div className="p-3.5 rounded-xl bg-sky-50/70 border-2 border-sky-300 space-y-2 shadow-2xs">
                                    <span className="text-[11px] font-black uppercase text-sky-950 block border-b border-sky-200 pb-1">
                                      Status Pengiriman
                                    </span>
                                    <div className="font-black text-sky-950 text-xs">
                                      Supir: {order.dispatchInfo.driverName || '-'} ({order.dispatchInfo.vehiclePlate || 'Kendaraan'})
                                    </div>
                                    <div className="text-[11px] font-semibold text-sky-900">
                                      Telp: {order.dispatchInfo.driverPhone || '-'} • ETA: {fmtDateStr(order.dispatchInfo.eta)}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                      {order.dispatchInfo.suratJalanPhoto && (
                                        <a
                                          href={getImageUrl(order.dispatchInfo.suratJalanPhoto)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs font-black text-sky-950 bg-sky-200/80 hover:bg-sky-300 px-2 py-1 rounded border border-sky-400 inline-flex items-center gap-1 transition-colors"
                                        >
                                          <ExternalLink size={12} /> <span>Lihat Surat Jalan</span>
                                        </a>
                                      )}
                                      {order.dispatchInfo.supplierNotaPhoto && (
                                        <a
                                          href={getImageUrl(order.dispatchInfo.supplierNotaPhoto)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs font-black text-sky-950 bg-sky-200/80 hover:bg-sky-300 px-2 py-1 rounded border border-sky-400 inline-flex items-center gap-1 transition-colors"
                                        >
                                          <ExternalLink size={12} /> <span>Lihat Nota Supplier</span>
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {order.deliveryProof && (
                                  <div className="p-3.5 rounded-xl bg-teal-50/70 border-2 border-teal-300 space-y-2 shadow-2xs">
                                    <span className="text-[11px] font-black uppercase text-teal-950 block border-b border-teal-200 pb-1">
                                      Penerimaan di Lapangan (GRN)
                                    </span>
                                    <div className="font-black text-teal-950 text-xs flex items-center gap-1.5">
                                      <CheckCircle2 size={14} className="text-teal-700" />
                                      <span>Kondisi: {order.deliveryProof.overallCondition || 'Good'}</span>
                                    </div>
                                    <div className="text-[11px] font-semibold text-teal-900">
                                      Penerima: {typeof order.deliveryProof.receivedBy === 'object' ? order.deliveryProof.receivedBy?.fullName : 'Staff Proyek'}
                                    </div>
                                    {order.deliveryProof.notes && (
                                      <div className="text-[11px] text-teal-800 italic">
                                        Catatan: {order.deliveryProof.notes}
                                      </div>
                                    )}
                                    {order.deliveryProof.receiverSignature && (
                                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-800">
                                        <CheckCircle2 size={13} className="text-teal-600" />
                                        <span>Tanda Tangan Digital Tersimpan</span>
                                      </div>
                                    )}
                                    {order.deliveryProof.sitePhoto && (
                                      <div className="pt-2 border-t border-teal-200 flex items-center justify-between gap-2">
                                        <a
                                          href={getImageUrl(order.deliveryProof.sitePhoto)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs font-black text-teal-950 bg-teal-200/80 hover:bg-teal-300 px-2.5 py-1 rounded border border-teal-400 inline-flex items-center gap-1 transition-colors"
                                        >
                                          <ExternalLink size={12} /> <span>Lihat Foto Fisik (Site Photo)</span>
                                        </a>
                                        <span className="text-[10px] text-teal-800 font-semibold">Tercantum di Dokumen GRN</span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {order.paymentConfirmation && (
                                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border-2 border-emerald-300 space-y-2 shadow-2xs">
                                    <div className="flex items-center justify-between border-b border-emerald-200 pb-1">
                                      <span className="text-[11px] font-black uppercase text-emerald-950">
                                        Pelunasan & Bukti Kas (Lunas)
                                      </span>
                                      {order.paymentConfirmation.schemeApplied === 'PAYLATER' && (
                                        <span className="text-[10px] font-black bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded">
                                          Paylater 0%
                                        </span>
                                      )}
                                    </div>
                                    <div className="font-black text-emerald-950 text-xs flex items-center justify-between">
                                      <span>Nominal: {formatRupiah(order.paymentConfirmation.amountPaid)}</span>
                                      <span className="text-[10px] font-bold text-emerald-800">{order.paymentConfirmation.paymentMethod}</span>
                                    </div>
                                    <div className="text-[11px] font-semibold text-emerald-900">
                                      Dikonfirmasi: {typeof order.paymentConfirmation.confirmedBy === 'object' ? order.paymentConfirmation.confirmedBy?.fullName : 'Kasir/Finance'} • {fmtDateStr(order.paymentConfirmation.paymentDate)}
                                    </div>
                                    <div className="pt-2 border-t border-emerald-200 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setViewEvidenceOrder(order)}
                                        className="text-xs font-black text-emerald-950 bg-emerald-200/90 hover:bg-emerald-300 px-2.5 py-1 rounded border border-emerald-400 inline-flex items-center gap-1 transition-colors cursor-pointer"
                                      >
                                        <Receipt size={12} /> <span>Lihat Bukti Bayar & Transfer</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => exportPaymentVoucherPdf(order)}
                                        className="text-xs font-black text-slate-900 bg-white hover:bg-slate-100 px-2.5 py-1 rounded border border-slate-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
                                      >
                                        <Download size={12} /> <span>Voucher PDF</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Table Footer Summary Bar ── */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-100 border-t-2 border-slate-300 text-xs">
            <div className="flex items-center gap-2 text-slate-700 font-bold">
              <span>Menampilkan <strong className="text-slate-950 font-black px-1.5 py-0.5 rounded bg-white border border-slate-300">{sortedRequests.length}</strong> transaksi pengadaan</span>
              <span>•</span>
              <span>
                <strong className="text-slate-950 font-black px-1.5 py-0.5 rounded bg-white border border-slate-300">{sortedRequests.filter((r) => ['DELIVERED', 'Delivered'].includes(r.status)).length}</strong> Selesai di Proyek
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Total Akumulasi Nilai:</span>
              <span className="text-base sm:text-lg font-black font-mono tabular-nums text-emerald-950 bg-emerald-100 px-3 py-1 rounded-lg border-2 border-emerald-400 shadow-2xs">
                {formatRupiah(totalAccumulatedAmount)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedRequests.map((order) => {
            const isExpanded = expandedOrders.includes(order._id!);
            const itemsList = order.items && order.items.length > 0 ? order.items : [{
              item: order.item,
              specifications: '',
              qty: Number(order.qty) || 1,
              unit: order.unit || 'Pcs',
              budgetUnitRate: order.costEstimate ? (Number(order.costEstimate) / (Number(order.qty) || 1)) : 0,
              totalBudget: Number(order.costEstimate) || 0,
            }];

            const isCardSelected = selectedOrderIds.includes(order._id!);

            return (
              <div
                key={order._id}
                className={`bg-bg-white border rounded-2xl p-4 sm:p-5 shadow-xs transition-all ${
                  isCardSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
                    : 'border-border-light hover:border-primary/30'
                }`}
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-light">
                  <div className="flex items-start sm:items-center gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${order.prNumber || 'order'}`}
                      className="w-4 h-4 mt-2 sm:mt-0 rounded border-slate-300 text-primary accent-primary cursor-pointer transition-colors shrink-0"
                      checked={isCardSelected}
                      onChange={() => handleToggleSelectOrder(order._id!)}
                    />
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

                    {/* Stage 7 -> Post-GRN Payment Confirmation */}
                    {['DELIVERED', 'Delivered'].includes(order.status) && canPay && (
                      <button
                        type="button"
                        onClick={() => setPaymentOrder(order)}
                        className={`px-3 py-1.5 rounded-lg text-white font-bold text-xs transition-all cursor-pointer shadow-xs flex items-center gap-1.5 ${
                          order.selectedSupplier?.schemeType === 'PAYLATER' || order.selectedSupplier?.isPaylater
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                      >
                        <Receipt size={14} />
                        <span>{order.selectedSupplier?.schemeType === 'PAYLATER' || order.selectedSupplier?.isPaylater ? 'Lunasi Paylater (0% Bunga)' : 'Konfirmasi Pembayaran'}</span>
                      </button>
                    )}

                    {(order.status === 'PAID' || order.paymentConfirmation?.bonPembayaranUrl) && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewEvidenceOrder(order)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Receipt size={14} className="text-emerald-800" />
                          <span>Bukti Bayar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => exportPaymentVoucherPdf(order)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Download size={13} />
                          <span>Voucher</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL 1: BUAT PURCHASE REQUEST BARU (MULTI-ITEM) ── */}
      <MaterialRequestCreateModal
        isOpen={showAddPrModal}
        onClose={() => setShowAddPrModal(false)}
        projects={projects}
        authorizers={authorizers}
        procurementConfig={procurementConfig}
        isOwner={isOwner}
        onSuccess={fetchData}
      />

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
      <SupplierSourcingModal
        order={sourcingOrder}
        onClose={() => setSourcingOrder(null)}
        authorizers={authorizers}
        isOwner={isOwner}
        onSuccess={fetchData}
      />

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
      <MaterialOrderReceiveModal
        order={receiveOrder}
        onClose={() => setReceiveOrder(null)}
        onSuccess={fetchData}
      />

      {/* ── MODAL 8: UBAH PENUGASAN APPROVER & REVIEWER (OWNER ONLY) ── */}
      {isOwner && (
        <OrderAuthorizerAssignModal
          order={assignModalOrder}
          onClose={() => setAssignModalOrder(null)}
          authorizers={authorizers}
          onSuccess={fetchData}
        />
      )}

      {/* ── MODAL 9: DIREKTORI ALUR & PERSONEL APPROVER (OWNER ONLY) ── */}
      {isOwner && (
        <ProcurementConfigModal
          isOpen={showAuthorizerDirectoryModal}
          onClose={() => setShowAuthorizerDirectoryModal(false)}
          authorizers={authorizers}
          procurementConfig={procurementConfig}
          onConfigUpdated={fetchData}
        />
      )}

      {/* ── FLOATING BULK ACTION BAR ── */}
      {selectedOrderIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-auto max-w-[95vw] bg-slate-950/95 text-white border border-slate-700/80 shadow-2xl rounded-2xl px-4 py-3 flex items-center gap-3 sm:gap-4 backdrop-blur-md animate-in fade-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2 pl-1 border-r border-slate-700/80 pr-3">
            <div className="w-7 h-7 rounded-lg bg-primary/20 text-blue-300 flex items-center justify-center font-black text-xs font-mono">
              {selectedOrderIds.length}
            </div>
            <div className="hidden sm:block">
              <span className="text-xs font-black text-white">Dipilih</span>
              <span className="text-[10px] text-slate-400 block font-medium">Bulk Action</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {canReview && pendingReviewSelected.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenBulkModal('review', pendingReviewSelected)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <UserCheck size={14} />
                <span>Review QC ({pendingReviewSelected.length})</span>
              </button>
            )}

            {canOpsApprove && pendingOpsSelected.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenBulkModal('ops', pendingOpsSelected)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <ShieldCheck size={14} />
                <span>Approve Ops ({pendingOpsSelected.length})</span>
              </button>
            )}

            {canFinanceApprove && pendingFinanceSelected.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenBulkModal('finance', pendingFinanceSelected)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <DollarSign size={14} />
                <span>Approve Finance ({pendingFinanceSelected.length})</span>
              </button>
            )}

            {canReceive && pendingReceiveSelected.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenBulkModal('receive', pendingReceiveSelected)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Truck size={14} />
                <span>Terima Barang ({pendingReceiveSelected.length})</span>
              </button>
            )}

            {canPay && pendingPaymentSelected.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenBulkModal('payment', pendingPaymentSelected)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <CreditCard size={14} />
                <span>Konfirmasi Bayar ({pendingPaymentSelected.length})</span>
              </button>
            )}

            {/* Batch PDF Export Dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                disabled={isExportingBulk}
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs transition-all shadow-xs border border-slate-700 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isExportingBulk ? (
                  <Loader2 size={14} className="animate-spin text-amber-400" />
                ) : (
                  <Download size={14} className="text-amber-400" />
                )}
                <span>{isExportingBulk ? 'Mengunduh PDF...' : 'Unduh Dokumen'}</span>
                <ChevronDown size={12} className={`transition-transform duration-150 ${showExportMenu ? 'rotate-180' : ''}`} />
              </button>

              {showExportMenu && (
                <div className="absolute bottom-full mb-2 left-0 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 space-y-1 z-50 text-xs animate-in fade-in zoom-in-95">
                  <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    Pilihan Ekspor Dokumen
                  </div>

                  {exportablePoSelected.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkExportPdf('PO')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 hover:text-white flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <FileText size={13} className="text-blue-400" />
                        <span>Purchase Order (PO)</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-900/60 text-blue-300">
                        {exportablePoSelected.length}
                      </span>
                    </button>
                  )}

                  {exportableGrnSelected.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkExportPdf('GRN')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 hover:text-white flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <FileCheck size={13} className="text-teal-400" />
                        <span>Penerimaan Barang (GRN)</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-900/60 text-teal-300">
                        {exportableGrnSelected.length}
                      </span>
                    </button>
                  )}

                  {exportablePaymentSelected.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkExportPdf('PAYMENT')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 hover:text-white flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Receipt size={13} className="text-emerald-400" />
                        <span>Voucher Bukti Bayar / Kas</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-900/60 text-emerald-300">
                        {exportablePaymentSelected.length}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleBulkExportPdf('PR')}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <FileText size={13} className="text-slate-400" />
                      <span>Purchase Request (PR)</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                      {selectedOrders.length}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Bulk Delete */}
            {deletableSelected.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenBulkModal('delete', deletableSelected)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                title="Hapus permanen draft PR atau pengajuan ditolak"
              >
                <Trash2 size={14} />
                <span>Hapus ({deletableSelected.length})</span>
              </button>
            )}
          </div>

          {/* Reset / Deselect Button */}
          <button
            type="button"
            onClick={handleClearSelection}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ml-1"
            title="Batalkan Pilihan"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── BULK APPROVAL & ACTIONS MODAL ── */}
      <MaterialBulkActionModal
        isOpen={bulkModalConfig.isOpen}
        onClose={() => setBulkModalConfig((prev) => ({ ...prev, isOpen: false }))}
        actionType={bulkModalConfig.actionType}
        orders={bulkModalConfig.orders}
        onComplete={async () => {
          await fetchData();
          setSelectedOrderIds([]);
        }}
      />

      {/* ── MODAL 10: KONFIRMASI PEMBAYARAN & BUKTI BON (POST-GRN) ── */}
      <MaterialPaymentConfirmationModal
        order={paymentOrder}
        onClose={() => setPaymentOrder(null)}
        onSuccess={async () => {
          await fetchData();
          setPaymentOrder(null);
        }}
      />

      {/* ── MODAL 11: VIEWER BUKTI BON & TRANSFER BANK ── */}
      <PaymentEvidenceViewerModal
        order={viewEvidenceOrder}
        onClose={() => setViewEvidenceOrder(null)}
      />
    </div>
  );
}
