import { useState, useEffect, useId, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Receipt,
  Layers,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MapPin,
  Camera,
  Search,
  ArrowLeft,
  Wifi,
  WifiOff,
  Eye,
  X,
  TrendingUp,
  FileCheck,
  Building2,
  Wallet,
  Clock,
  Loader2,
  ShoppingCart,
  Tag,
  Filter,
  Calculator,
  UploadCloud,
  CheckSquare,
  Square,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSwakelola } from '../contexts/SwakelolaContext';
import { getImageUrl } from '../utils/image';
import { formatDate } from '../utils/date';
import { offlineDb, OfflinePurchaseRecord } from '../services/offlineDb';
import { syncPendingPurchases } from '../services/syncEngine';
import LocalPurchaseForm from '../components/swakelola/LocalPurchaseForm';
import { RABItem, LocalPurchase, ProjectData } from '../types';
import api, { createProjectRABItem, createBatchLocalPurchase } from '../api/api';

// Curated construction material classification rules
const PREDEFINED_FAMILIES = [
  { key: 'Semen', regex: /\b(semen|portland|gresik|tiga\s*roda|holcim|padang|dynamix)\b/i },
  { key: 'Besi & Baja', regex: /\b(besi|baja|wiremesh|hollow|wf|h-beam|cnp|unp|plat|rebar|tulangan|angkur)\b/i },
  { key: 'Pasir & Tanah', regex: /\b(pasir|tanah|urug|sirtu|agregat|base\s*course)\b/i },
  { key: 'Batu & Split', regex: /\b(batu|split|koral|kerikil|makadam|boulder)\b/i },
  { key: 'Bata & Hebel', regex: /\b(bata|hebel|batako|roster|celcon|bata\s*ringan)\b/i },
  { key: 'Cat & Finishing', regex: /\b(cat|thinner|plamir|sealer|alkali|kuas|roll|amplas|pelapis)\b/i },
  { key: 'Pipa & Sanitair', regex: /\b(pipa|pvc|hdpe|fitting|kran|valve|tandon|toren|kloset|wastafel|elbow|socket)\b/i },
  { key: 'Keramik & Granit', regex: /\b(keramik|granit|marmer|tile|nat|grout|homogeneous|step\s*nosing)\b/i },
  { key: 'Kayu & Triplek', regex: /\b(kayu|triplek|plywood|kaso|balok|papan|mdf|multiplex|multiplek)\b/i },
  { key: 'Paku, Baut & Kawat', regex: /\b(kawat|paku|baut|sekrup|mur|dynabolt|bendrat|anchor)\b/i },
  { key: 'Kabel & Listrik', regex: /\b(kabel|saklar|stopkontak|lampu|mcb|panel|conduit|fitting\s*lampu|led)\b/i },
  { key: 'Atap & Plafon', regex: /\b(genteng|spandek|asbes|seng|gypsum|kalsiboard|rooftop|alderon)\b/i },
  { key: 'Beton & Cor', regex: /\b(beton|readymix|ready mix|cor|aditif|sika|calbond|curing)\b/i },
  { key: 'Sewa Alat', regex: /\b(sewa|alat|crane|excavator|stamper|molen|genset|jack\s*hammer|scaffolding)\b/i },
];

/**
 * Intelligent material family extractor from item descriptions.
 * Matches predefined construction categories or extracts frequent root terms.
 */
export const extractMaterialFamily = (text: string): string => {
  if (!text) return 'Lainnya';
  for (const fam of PREDEFINED_FAMILIES) {
    if (fam.regex.test(text)) {
      return fam.key;
    }
  }
  // Fallback: extract the first non-trivial keyword
  const cleaned = text.replace(/^(pengadaan|pemasangan|pekerjaan|pembelian|biaya|jasa|sewa)\s+/i, '').trim();
  const firstWord = cleaned.split(/[\s,.-]+/)[0];
  if (firstWord && firstWord.length >= 4) {
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
  }
  return 'Lainnya';
};

export interface BatchShoppingItem {
  rabItemId: string;
  wbsCode: string;
  description: string;
  unitOfMeasure: string;
  budgetedQty: number;
  realizedQty: number;
  remainingQty: number;
  quantity: number;
  unitPrice: number;
  notes: string;
  included: boolean;
}

export default function ProjectSwakelola() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    rabItems,
    rabSummary,
    localPurchases,
    purchaseSummary,
    isLoading,
    error,
    setProjectId,
    refreshRAB,
    refreshPurchases,
    verifyPurchase,
  } = useSwakelola();

  // Active Project & Projects List
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(id || '');

  // Tabs & Views
  const [activeTab, setActiveTab] = useState<'purchases' | 'rab' | 'offline'>('purchases');
  const [purchaseFilter, setPurchaseFilter] = useState<'ALL' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [rabSearchQuery, setRabSearchQuery] = useState('');

  // Material Family Filter & Item Selection
  const [selectedMaterialFamily, setSelectedMaterialFamily] = useState<string | null>(null);
  const [selectedRABItemIds, setSelectedRABItemIds] = useState<string[]>([]);

  // Modals
  const [showAddPurchaseModal, setShowAddPurchaseModal] = useState(false);
  const [showAddRABModal, setShowAddRABModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const [rejectingPurchaseId, setRejectingPurchaseId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Batch Shopping Modal Form State
  const [batchItems, setBatchItems] = useState<BatchShoppingItem[]>([]);
  const [batchFormData, setBatchFormData] = useState({
    voucherNumber: '',
    transactionDate: '',
    supplierName: '',
    supplierContact: '',
    purchaserName: '',
    notes: '',
  });
  const [batchReceiptFile, setBatchReceiptFile] = useState<File | null>(null);
  const [batchReceiptPreview, setBatchReceiptPreview] = useState<string | null>(null);
  const [batchLocation, setBatchLocation] = useState<{ lat?: number; lng?: number; addressText?: string }>({});
  const [isBatchLocating, setIsBatchLocating] = useState(false);
  const [batchLocationError, setBatchLocationError] = useState<string | null>(null);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
  const [batchSubmitError, setBatchSubmitError] = useState<string | null>(null);

  // Offline Sync State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineRecords, setOfflineRecords] = useState<OfflinePurchaseRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // New RAB Item Form State
  const [rabFormData, setRabFormData] = useState({
    wbsCode: '',
    description: '',
    category: 'material' as const,
    unitOfMeasure: 'Pcs',
    budgetedQuantity: '',
    unitRate: '',
  });
  const [rabSubmitting, setRabSubmitting] = useState(false);
  const [rabError, setRabError] = useState<string | null>(null);

  const formId = useId();

  // Monitor Network Connectivity
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleSyncEvent = (e: any) => {
      setSyncMessage(`Berhasil menyinkronkan ${e.detail.synced} data pembelian offline.`);
      loadOfflineRecords();
      if (selectedProjectId) {
        refreshRAB(selectedProjectId);
        refreshPurchases(selectedProjectId);
      }
      setTimeout(() => setSyncMessage(null), 4000);
    };

    window.addEventListener('swakelola:sync-completed', handleSyncEvent);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('swakelola:sync-completed', handleSyncEvent);
    };
  }, [selectedProjectId, refreshRAB, refreshPurchases]);

  // Load Offline Records from Dexie
  const loadOfflineRecords = useCallback(async () => {
    try {
      const records = await offlineDb.offlinePurchases.toArray();
      setOfflineRecords(records);
    } catch (e) {
      console.error('Failed to load offline records', e);
    }
  }, []);

  useEffect(() => {
    loadOfflineRecords();
  }, [loadOfflineRecords]);

  // Load Projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await api.get('/projects');
        const list = res.data.projects || res.data || [];
        setProjects(list);

        if (!selectedProjectId && list.length > 0) {
          setSelectedProjectId(list[0]._id);
        }
      } catch (err) {
        console.error('Failed to fetch projects', err);
      }
    };
    fetchProjects();
  }, [selectedProjectId]);

  // Sync Selected Project with Context
  useEffect(() => {
    if (selectedProjectId) {
      setProjectId(selectedProjectId);
      refreshRAB(selectedProjectId);
      refreshPurchases(selectedProjectId);

      const found = projects.find((p) => p._id === selectedProjectId);
      if (found) setActiveProject(found);
    }
  }, [selectedProjectId, projects, setProjectId, refreshRAB, refreshPurchases]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await syncPendingPurchases();
      await loadOfflineRecords();
      if (selectedProjectId) {
        await refreshRAB(selectedProjectId);
        await refreshPurchases(selectedProjectId);
      }
      setSyncMessage(
        `Sinkronisasi selesai: ${res.synced} berhasil, ${res.failed} gagal.`
      );
    } catch (e: any) {
      setSyncMessage(`Gagal melakukan sinkronisasi: ${e.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleVerify = async (purchaseId: string) => {
    try {
      await verifyPurchase(purchaseId, 'VERIFIED');
    } catch (err: any) {
      alert(err.response?.data?.msg || err.message || 'Gagal memverifikasi pembelian');
    }
  };

  const handleReject = async () => {
    if (!rejectingPurchaseId) return;
    try {
      await verifyPurchase(rejectingPurchaseId, 'REJECTED', rejectionReason);
      setRejectingPurchaseId(null);
      setRejectionReason('');
    } catch (err: any) {
      alert(err.response?.data?.msg || err.message || 'Gagal menolak pembelian');
    }
  };

  const handleAddRABSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRabError(null);

    const bQty = parseFloat(rabFormData.budgetedQuantity);
    const uRate = parseFloat(rabFormData.unitRate);

    if (!rabFormData.wbsCode || !rabFormData.description || isNaN(bQty) || isNaN(uRate)) {
      setRabError('Mohon isi kode WBS, deskripsi, kuantitas plafon, dan tarif satuan dengan benar.');
      return;
    }

    setRabSubmitting(true);
    try {
      await createProjectRABItem(selectedProjectId, {
        wbsCode: rabFormData.wbsCode.trim(),
        description: rabFormData.description.trim(),
        category: rabFormData.category,
        unitOfMeasure: rabFormData.unitOfMeasure.trim(),
        budgetedQuantity: bQty,
        unitRate: uRate,
      });

      setShowAddRABModal(false);
      setRabFormData({
        wbsCode: '',
        description: '',
        category: 'material',
        unitOfMeasure: 'Pcs',
        budgetedQuantity: '',
        unitRate: '',
      });
      await refreshRAB(selectedProjectId);
    } catch (err: any) {
      setRabError(err.response?.data?.msg || err.message || 'Gagal menambahkan mata anggaran RAB');
    } finally {
      setRabSubmitting(false);
    }
  };

  const canVerify = ['owner', 'director', 'operational_director', 'project_manager', 'site_manager'].includes(
    user?.role || ''
  );

  // Dynamic Material Family Categories computed from current dataset
  const availableFamilies = useMemo(() => {
    const counts: Record<string, number> = {};
    if (activeTab === 'purchases') {
      localPurchases.forEach((p) => {
        const rabDesc = typeof p.rabItemId === 'object' && p.rabItemId ? p.rabItemId.description : '';
        const fam = extractMaterialFamily(p.itemDescription || rabDesc || '');
        counts[fam] = (counts[fam] || 0) + 1;
      });
    } else {
      rabItems.forEach((it) => {
        const fam = extractMaterialFamily(it.description || '');
        counts[fam] = (counts[fam] || 0) + 1;
      });
    }

    return Object.entries(counts)
      .sort((a, b) => {
        if (a[0] === 'Lainnya') return 1;
        if (b[0] === 'Lainnya') return -1;
        return b[1] - a[1];
      })
      .map(([key, count]) => ({ key, count }));
  }, [activeTab, localPurchases, rabItems]);

  // Filtered RAB items according to selected family and search query
  const filteredRABItems = useMemo(() => {
    return rabItems.filter((item) => {
      if (selectedMaterialFamily && extractMaterialFamily(item.description) !== selectedMaterialFamily) {
        return false;
      }
      if (rabSearchQuery.trim()) {
        const q = rabSearchQuery.toLowerCase();
        const code = item.wbsCode?.toLowerCase() || '';
        const desc = item.description?.toLowerCase() || '';
        const cat = item.category?.toLowerCase() || '';
        return code.includes(q) || desc.includes(q) || cat.includes(q);
      }
      return true;
    });
  }, [rabItems, selectedMaterialFamily, rabSearchQuery]);

  // Filtered Purchases according to status, selected family, and search query
  const filteredPurchases = useMemo(() => {
    return localPurchases.filter((p) => {
      if (purchaseFilter !== 'ALL' && p.status !== purchaseFilter) return false;
      if (selectedMaterialFamily) {
        const rabDesc = typeof p.rabItemId === 'object' && p.rabItemId ? p.rabItemId.description : '';
        const fam1 = extractMaterialFamily(p.itemDescription || '');
        const fam2 = rabDesc ? extractMaterialFamily(rabDesc) : '';
        if (fam1 !== selectedMaterialFamily && fam2 !== selectedMaterialFamily) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const vNo = p.voucherNumber?.toLowerCase() || '';
        const desc = p.itemDescription?.toLowerCase() || '';
        const supp = p.supplierName?.toLowerCase() || '';
        const buyer = p.purchaserName?.toLowerCase() || '';
        return vNo.includes(q) || desc.includes(q) || supp.includes(q) || buyer.includes(q);
      }
      return true;
    });
  }, [localPurchases, purchaseFilter, selectedMaterialFamily, searchQuery]);

  // Live Aggregated Calculations for filtered or checked RAB items
  const calculationMetrics = useMemo(() => {
    const isSelectionActive = selectedRABItemIds.length > 0;
    const itemsToCalc = isSelectionActive
      ? rabItems.filter((it) => selectedRABItemIds.includes(it._id))
      : filteredRABItems;

    const totalBudget = itemsToCalc.reduce(
      (sum, it) => sum + (it.totalBudget || (it.budgetedQuantity || 0) * (it.unitRate || 0)),
      0
    );
    const totalRealized = itemsToCalc.reduce((sum, it) => sum + (it.realizedAmount || 0), 0);
    const remainingBudget = Math.max(0, totalBudget - totalRealized);
    const realizationPercent =
      totalBudget > 0 ? Math.min(100, Math.round((totalRealized / totalBudget) * 100)) : 0;

    // Remaining physical shopping estimate (cost to buy remaining quota at budgeted unit rate)
    const remainingEstShoppingCost = itemsToCalc.reduce((sum, it) => {
      const remQty = Math.max(0, (it.budgetedQuantity || 0) - (it.realizedQuantity || 0));
      return sum + remQty * (it.unitRate || 0);
    }, 0);

    // Remaining physical volume breakdown
    const unitCounts: Record<string, number> = {};
    itemsToCalc.forEach((it) => {
      const remQty = Math.max(0, (it.budgetedQuantity || 0) - (it.realizedQuantity || 0));
      if (remQty > 0) {
        const u = it.unitOfMeasure || 'Item';
        unitCounts[u] = (unitCounts[u] || 0) + remQty;
      }
    });

    const remainingUnitsSummary = Object.entries(unitCounts)
      .slice(0, 3)
      .map(([u, q]) => `${q.toLocaleString('id-ID')} ${u}`)
      .join(', ');

    const purchasableCount = itemsToCalc.filter(
      (it) => (it.budgetedQuantity || 0) - (it.realizedQuantity || 0) > 0
    ).length;

    return {
      isSelectionActive,
      itemCount: itemsToCalc.length,
      purchasableCount,
      totalBudget,
      totalRealized,
      remainingBudget,
      realizationPercent,
      remainingEstShoppingCost,
      remainingUnitsSummary,
      itemsToCalc,
    };
  }, [selectedRABItemIds, rabItems, filteredRABItems]);

  // Purchases Metrics Summary for current filter
  const purchasesMetrics = useMemo(() => {
    const totalSpent = filteredPurchases.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
    const uniqueSuppliers = new Set(filteredPurchases.map((p) => p.supplierName).filter(Boolean)).size;
    return {
      count: filteredPurchases.length,
      totalSpent,
      uniqueSuppliers,
    };
  }, [filteredPurchases]);

  // Open Batch Purchase Modal
  const handleOpenBatchPurchase = () => {
    const itemsToShop = calculationMetrics.isSelectionActive
      ? rabItems.filter((it) => selectedRABItemIds.includes(it._id))
      : filteredRABItems.filter((it) => (it.budgetedQuantity || 0) - (it.realizedQuantity || 0) > 0);

    const targetList = itemsToShop.length > 0 ? itemsToShop : filteredRABItems;

    setBatchItems(
      targetList.map((it) => {
        const remainingQty = Math.max(0, (it.budgetedQuantity || 0) - (it.realizedQuantity || 0));
        return {
          rabItemId: it._id,
          wbsCode: it.wbsCode,
          description: it.description,
          unitOfMeasure: it.unitOfMeasure,
          budgetedQty: it.budgetedQuantity || 0,
          realizedQty: it.realizedQuantity || 0,
          remainingQty,
          quantity: remainingQty > 0 ? remainingQty : 1,
          unitPrice: it.unitRate || 0,
          notes: '',
          included: true,
        };
      })
    );

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randNum = Math.floor(1000 + Math.random() * 9000);
    setBatchFormData({
      voucherNumber: `VCH-${dateStr}-${randNum}`,
      transactionDate: new Date().toISOString().slice(0, 10),
      supplierName: '',
      supplierContact: '',
      purchaserName: user?.fullName || user?.username || 'Pelaksana Lapangan',
      notes: selectedMaterialFamily ? `Pengadaan batch material ${selectedMaterialFamily}` : '',
    });
    setBatchReceiptFile(null);
    setBatchReceiptPreview(null);
    setBatchLocation({});
    setBatchLocationError(null);
    setBatchSubmitError(null);
    setShowBatchModal(true);
  };

  // Get GPS for Batch Purchase
  const handleGetBatchLocation = () => {
    if (!navigator.geolocation) {
      setBatchLocationError('Geolocation tidak didukung oleh browser Anda.');
      return;
    }
    setIsBatchLocating(true);
    setBatchLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsBatchLocating(false);
        setBatchLocation({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          addressText: `Lat: ${pos.coords.latitude.toFixed(4)}, Lng: ${pos.coords.longitude.toFixed(4)} (GPS Toko)`,
        });
      },
      (err) => {
        setIsBatchLocating(false);
        setBatchLocationError(`Gagal membaca GPS: ${err.message}`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Handle Receipt File Upload for Batch Purchase
  const handleBatchFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setBatchSubmitError('Ukuran foto nota belanja maksimal 10MB');
        return;
      }
      setBatchReceiptFile(file);
      setBatchSubmitError(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setBatchReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit Batch Purchase
  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBatchSubmitError(null);

    if (!batchFormData.voucherNumber.trim()) {
      setBatchSubmitError('Nomor kuitansi/voucher wajib diisi.');
      return;
    }
    if (!batchFormData.supplierName.trim()) {
      setBatchSubmitError('Nama toko / supplier wajib diisi.');
      return;
    }
    if (!batchFormData.purchaserName.trim()) {
      setBatchSubmitError('Nama pelaksana / pembeli wajib diisi.');
      return;
    }

    const includedItems = batchItems.filter((it) => it.included && Number(it.quantity) > 0);
    if (includedItems.length === 0) {
      setBatchSubmitError('Pilih minimal 1 item material dengan kuantitas > 0 untuk dibelanjakan.');
      return;
    }

    setIsBatchSubmitting(true);

    try {
      if (!navigator.onLine) {
        // Offline mode: bulk add to Dexie
        const offlineList: OfflinePurchaseRecord[] = includedItems.map((it, idx) => ({
          localUuid: `offline_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
          projectId: selectedProjectId,
          rabItemId: it.rabItemId,
          voucherNumber:
            includedItems.length > 1
              ? `${batchFormData.voucherNumber.trim()}/${idx + 1}`
              : batchFormData.voucherNumber.trim(),
          purchaserName: batchFormData.purchaserName.trim(),
          supplierName: batchFormData.supplierName.trim(),
          supplierContact: batchFormData.supplierContact.trim() || undefined,
          itemDescription: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          totalPrice: Number(it.quantity) * Number(it.unitPrice),
          receiptPhotoBase64: batchReceiptPreview || undefined,
          geotagLocation:
            batchLocation.lat && batchLocation.lng
              ? { lat: batchLocation.lat, lng: batchLocation.lng }
              : undefined,
          notes: it.notes
            ? `${batchFormData.notes ? batchFormData.notes + ' - ' : ''}${it.notes}`
            : batchFormData.notes || undefined,
          syncStatus: 'PENDING' as const,
          createdAt: new Date().toISOString(),
        }));

        await offlineDb.offlinePurchases.bulkAdd(offlineList);
        await loadOfflineRecords();
        setSyncMessage(
          `Tersimpan offline: ${includedItems.length} item pembelian akan disinkronkan saat tersambung internet.`
        );
        setShowBatchModal(false);
        setSelectedRABItemIds([]);
        return;
      }

      // Online submission via FormData
      const postData = new FormData();
      postData.append('voucherNumber', batchFormData.voucherNumber.trim());
      postData.append('purchaserName', batchFormData.purchaserName.trim());
      postData.append('supplierName', batchFormData.supplierName.trim());
      if (batchFormData.supplierContact.trim()) {
        postData.append('supplierContact', batchFormData.supplierContact.trim());
      }
      if (batchFormData.notes.trim()) {
        postData.append('notes', batchFormData.notes.trim());
      }

      if (batchLocation.lat && batchLocation.lng) {
        postData.append(
          'geotagLocation',
          JSON.stringify({
            lat: batchLocation.lat,
            lng: batchLocation.lng,
            addressText: batchLocation.addressText,
          })
        );
      }

      if (batchReceiptFile) {
        postData.append('receipt', batchReceiptFile);
      }

      const payloadItems = includedItems.map((it) => ({
        rabItemId: it.rabItemId,
        itemDescription: it.description,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        notes: it.notes || '',
      }));
      postData.append('items', JSON.stringify(payloadItems));

      await createBatchLocalPurchase(selectedProjectId, postData);

      setSyncMessage(
        `Sukses mencatat ${includedItems.length} item belanja sekaligus (Voucher: ${batchFormData.voucherNumber})`
      );
      setShowBatchModal(false);
      setSelectedRABItemIds([]);
      await refreshRAB(selectedProjectId);
      await refreshPurchases(selectedProjectId);
      setActiveTab('purchases');
    } catch (err: any) {
      setBatchSubmitError(
        err.response?.data?.msg || err.message || 'Gagal menyimpan transaksi belanja sekaligus'
      );
    } finally {
      setIsBatchSubmitting(false);
    }
  };

  const pendingOfflineCount = offlineRecords.filter((r) => r.syncStatus === 'PENDING').length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Network Offline Status Banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-white px-4 py-2.5 rounded-lg flex items-center justify-between text-sm shadow-sm">
          <div className="flex items-center gap-2 font-medium">
            <WifiOff size={18} />
            <span>Mode Offline Aktif. Anda tetap dapat mencatat kuitansi pembelian UMK. Data tersimpan di memori perangkat.</span>
          </div>
          <span className="text-xs bg-amber-600 px-2.5 py-1 rounded-full font-mono">
            {pendingOfflineCount} Antrean
          </span>
        </div>
      )}

      {syncMessage && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg flex items-center justify-between text-sm shadow-sm">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={18} />
            <span>{syncMessage}</span>
          </div>
          <button onClick={() => setSyncMessage(null)} className="text-white hover:opacity-80">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-light pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <Link to="/projects" className="hover:underline flex items-center gap-1">
              <Building2 size={13} /> Proyek
            </Link>
            <span>/</span>
            {id ? (
              <Link to={`/project/${id}`} className="hover:underline">
                {activeProject?.nama || 'Detail Proyek'}
              </Link>
            ) : (
              <span>Swakelola SCM</span>
            )}
            <span>/</span>
            <span className="font-semibold text-text-primary">Manajemen Plafon & Pembelian Langsung</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => (id ? navigate(`/project/${id}`) : navigate('/projects'))}
              className="p-1.5 rounded-lg bg-bg-secondary hover:bg-border-light text-text-secondary transition-colors"
              title="Kembali"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
                <span>Supply Chain Swakelola (RAB Hard-Cap & UMK)</span>
                {isOnline ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600">
                    <Wifi size={12} /> Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600">
                    <WifiOff size={12} /> Offline
                  </span>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-text-muted mt-0.5">
                Pengawasan pagu anggaran statuter WBS, validasi transaksi belanja langsung, dan audit kuitansi digital
              </p>
            </div>
          </div>
        </div>

        {/* Project Selector & Action */}
        <div className="flex items-center gap-3">
          <div className="min-w-[200px]">
            <select
              aria-label="Pilih Proyek"
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                if (id) navigate(`/project-swakelola/${e.target.value}`);
              }}
              className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs sm:text-sm text-text-primary font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.nama || p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleOpenBatchPurchase}
            className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs sm:text-sm font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer active:scale-95"
            title="Belanja beberapa material sekaligus dalam satu kuitansi/nota toko"
          >
            <ShoppingCart size={16} />
            <span>Belanja Sekaligus</span>
          </button>

          <button
            onClick={() => setShowAddPurchaseModal(true)}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs sm:text-sm font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all whitespace-nowrap"
          >
            <Plus size={16} />
            <span>Catat Pembelian Satuan</span>
          </button>
        </div>
      </div>

      {/* Bento Grid KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Plafon RAB */}
        <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Pagu RAB</span>
            <Wallet size={18} className="text-primary" />
          </div>
          <div className="text-lg sm:text-2xl font-mono font-bold text-text-primary tabular-nums">
            Rp {(rabSummary?.totalBudget || 0).toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-text-muted mt-1 flex items-center gap-1">
            <span>{rabSummary?.itemCount || 0} Mata Anggaran WBS</span>
          </div>
        </div>

        {/* Realisasi Belanja */}
        <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Realisasi Pengeluaran</span>
            <TrendingUp size={18} className="text-emerald-600" />
          </div>
          <div className="text-lg sm:text-2xl font-mono font-bold text-emerald-600 tabular-nums">
            Rp {(rabSummary?.totalRealized || 0).toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-text-muted mt-1 flex items-center justify-between">
            <span>Tingkat Serapan:</span>
            <span className="font-bold text-emerald-700 font-mono">
              {rabSummary?.realizationPercent || 0}%
            </span>
          </div>
        </div>

        {/* Sisa Anggaran */}
        <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Sisa Pagu Bebas</span>
            <Receipt size={18} className="text-blue-600" />
          </div>
          <div className="text-lg sm:text-2xl font-mono font-bold text-blue-600 tabular-nums">
            Rp {Math.max(0, (rabSummary?.totalBudget || 0) - (rabSummary?.totalRealized || 0)).toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-text-muted mt-1">
            <span>Saldo aman dari over-budget</span>
          </div>
        </div>

        {/* Antrean Verifikasi & Offline */}
        <div className="bg-bg-white border border-border-light rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Audit & Sinkronisasi</span>
            <Clock size={18} className="text-amber-500" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-base sm:text-lg font-bold text-amber-600">
                {purchaseSummary?.totalPendingVerification || 0 > 0
                  ? `Rp ${(purchaseSummary?.totalPendingVerification || 0).toLocaleString('id-ID')}`
                  : '0 Pending'}
              </span>
              <p className="text-[11px] text-text-muted mt-0.5">Menunggu Verifikasi PM</p>
            </div>
            {pendingOfflineCount > 0 && (
              <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-[11px] font-bold">
                {pendingOfflineCount} Offline
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-border-light">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('purchases')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'purchases'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Receipt size={16} />
            <span>Buku Pembelian UMK ({localPurchases.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('rab')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'rab'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Layers size={16} />
            <span>Matriks Plafon RAB ({rabItems.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('offline')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'offline'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <WifiOff size={16} />
            <span>Antrean Offline ({offlineRecords.length})</span>
            {pendingOfflineCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                {pendingOfflineCount}
              </span>
            )}
          </button>
        </div>

        <button
          onClick={() => {
            if (selectedProjectId) {
              refreshRAB(selectedProjectId);
              refreshPurchases(selectedProjectId);
              loadOfflineRecords();
            }
          }}
          disabled={isLoading}
          className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-secondary transition-colors"
          title="Perbarui Data"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* TAB CONTENT 1: Buku Pembelian Langsung (UMK) */}
      {activeTab === 'purchases' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-bg-secondary/40 p-3 rounded-lg border border-border-light">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              {(['ALL', 'SUBMITTED', 'VERIFIED', 'REJECTED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setPurchaseFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    purchaseFilter === st
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-bg-white text-text-secondary hover:bg-bg-secondary border border-border-light'
                  }`}
                >
                  {st === 'ALL' && 'Semua'}
                  {st === 'SUBMITTED' && 'Menunggu Verifikasi'}
                  {st === 'VERIFIED' && 'Terverifikasi'}
                  {st === 'REJECTED' && 'Ditolak'}
                </button>
              ))}
            </div>

            <div className="relative min-w-[240px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Cari voucher, toko, barang..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg-white border border-border-light rounded-lg pl-9 pr-3.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Dynamic Material Family Chips Filter Bar */}
          <div className="bg-bg-white border border-border-light rounded-xl p-3 shadow-xs space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-bold text-text-secondary uppercase tracking-wider">
                <Tag size={14} className="text-primary" />
                <span>Filter Kategori Material ({availableFamilies.length} Grup Terdeteksi)</span>
              </div>

              {selectedMaterialFamily && (
                <button
                  onClick={() => setSelectedMaterialFamily(null)}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <X size={12} />
                  <span>Reset Filter Grup ({selectedMaterialFamily})</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <button
                onClick={() => setSelectedMaterialFamily(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedMaterialFamily === null
                    ? 'bg-primary text-white shadow-xs font-bold ring-2 ring-primary/20'
                    : 'bg-bg-secondary/60 hover:bg-bg-secondary text-text-secondary border border-border-light'
                }`}
              >
                <span>Semua Item ({localPurchases.length})</span>
              </button>

              {availableFamilies.map(({ key, count }) => {
                const isSelected = selectedMaterialFamily === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedMaterialFamily(isSelected ? null : key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-primary text-white shadow-xs font-bold ring-2 ring-primary/20 scale-[1.02]'
                        : 'bg-bg-white hover:bg-bg-secondary text-text-secondary border border-border-light hover:border-primary/40'
                    }`}
                  >
                    <span>{key}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-bg-secondary text-text-muted'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Filter Calculation Banner */}
          {(selectedMaterialFamily || searchQuery || purchaseFilter !== 'ALL') && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-primary flex items-center gap-1.5">
                  <Calculator size={14} />
                  <span>Total Hasil Filter:</span>
                </span>
                <span className="text-text-secondary">
                  <strong>{purchasesMetrics.count}</strong> Transaksi di <strong>{purchasesMetrics.uniqueSuppliers}</strong> Toko
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-text-muted">Total Riil Belanja:</span>
                <span className="font-mono font-bold text-primary text-sm">
                  Rp {purchasesMetrics.totalSpent.toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          )}

          {/* Purchases Table (SAP Fiori Density) */}
          <div className="bg-bg-white border border-border-light rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-bg-secondary/60 border-b border-border-light text-text-muted uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3.5 text-left">No. Voucher</th>
                    <th className="py-3 px-3.5 text-left">Mata Anggaran (WBS)</th>
                    <th className="py-3 px-3.5 text-left">Toko / Supplier</th>
                    <th className="py-3 px-3.5 text-left">Uraian Spesifikasi</th>
                    <th className="py-3 px-3.5 text-right">Volume</th>
                    <th className="py-3 px-3.5 text-right">Harga Satuan</th>
                    <th className="py-3 px-3.5 text-right">Total Riil</th>
                    <th className="py-3 px-3.5 text-center">GPS</th>
                    <th className="py-3 px-3.5 text-center">Nota</th>
                    <th className="py-3 px-3.5 text-center">Status</th>
                    {canVerify && <th className="py-3 px-3.5 text-center">Aksi Verifikasi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light/60">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canVerify ? 11 : 10}
                        className="py-12 text-center text-text-muted text-sm"
                      >
                        Belum ada data pembelian langsung tercatat untuk filter ini.
                      </td>
                    </tr>
                  ) : (
                    filteredPurchases.map((purchase) => {
                      const rabObj = typeof purchase.rabItemId === 'object' ? purchase.rabItemId : null;
                      return (
                        <tr key={purchase._id} className="hover:bg-bg-secondary/30 transition-colors">
                          <td className="py-3 px-3.5 font-mono font-bold text-text-primary whitespace-nowrap">
                            {purchase.voucherNumber}
                          </td>
                          <td className="py-3 px-3.5">
                            <span className="font-mono font-semibold text-primary">
                              {rabObj?.wbsCode || '-'}
                            </span>
                            <p className="text-[11px] text-text-muted truncate max-w-[150px]">
                              {rabObj?.description || '-'}
                            </p>
                          </td>
                          <td className="py-3 px-3.5 font-medium text-text-primary">
                            <div>{purchase.supplierName}</div>
                            <div className="text-[11px] text-text-muted">Oleh: {purchase.purchaserName}</div>
                          </td>
                          <td className="py-3 px-3.5 max-w-[200px]">
                            <p className="text-text-primary font-medium truncate" title={purchase.itemDescription}>
                              {purchase.itemDescription}
                            </p>
                            {purchase.notes && (
                              <p className="text-[11px] text-text-muted italic truncate" title={purchase.notes}>
                                Ket: {purchase.notes}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-medium text-text-primary whitespace-nowrap tabular-nums">
                            {purchase.quantity.toLocaleString('id-ID')} {rabObj?.unitOfMeasure || ''}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-text-secondary whitespace-nowrap tabular-nums">
                            Rp {purchase.unitPrice.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-primary whitespace-nowrap tabular-nums">
                            Rp {purchase.totalPrice.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            {purchase.geotagLocation?.lat && purchase.geotagLocation?.lng ? (
                              <a
                                href={`https://www.google.com/maps?q=${purchase.geotagLocation.lat},${purchase.geotagLocation.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 hover:underline bg-emerald-50 px-2 py-0.5 rounded"
                                title="Lihat Lokasi GPS Toko"
                              >
                                <MapPin size={12} />
                                <span>Peta</span>
                              </a>
                            ) : (
                              <span className="text-[11px] text-text-muted">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            {purchase.receiptPhotoUrl ? (
                              <button
                                onClick={() => setPreviewPhotoUrl(getImageUrl(purchase.receiptPhotoUrl))}
                                className="p-1 rounded bg-bg-secondary hover:bg-border-light text-primary transition-colors"
                                title="Lihat Foto Nota Belanja"
                              >
                                <Camera size={16} />
                              </button>
                            ) : (
                              <span className="text-text-muted text-[11px]">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-center whitespace-nowrap">
                            {purchase.status === 'VERIFIED' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600">
                                <CheckCircle2 size={12} /> Terverifikasi
                              </span>
                            )}
                            {purchase.status === 'SUBMITTED' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600">
                                <Clock size={12} /> Menunggu Verifikasi
                              </span>
                            )}
                            {purchase.status === 'REJECTED' && (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-600"
                                title={purchase.rejectionReason}
                              >
                                <XCircle size={12} /> Ditolak
                              </span>
                            )}
                            {purchase.status === 'DRAFT' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-500/10 text-gray-600">
                                Draft Offline
                              </span>
                            )}
                          </td>
                          {canVerify && (
                            <td className="py-3 px-3.5 text-center whitespace-nowrap">
                              {purchase.status === 'SUBMITTED' ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleVerify(purchase._id)}
                                    className="p-1.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                    title="Setujui Bukti Belanja"
                                  >
                                    <CheckCircle2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => setRejectingPurchaseId(purchase._id)}
                                    className="p-1.5 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                                    title="Tolak Bukti Belanja"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-text-muted">Selesai</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: Matriks Plafon RAB (Hard-Cap) */}
      {activeTab === 'rab' && (
        <div className="space-y-4">
          {/* Header Controls: Title, Search & Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-text-primary">Struktur WBS & Plafon Anggaran Statuter</h3>
              <p className="text-xs text-text-muted">
                Batas pengeluaran maksimum per mata anggaran. Transaksi tidak dapat melampaui kuota ini.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Cari WBS, nama barang..."
                  value={rabSearchQuery}
                  onChange={(e) => setRabSearchQuery(e.target.value)}
                  className="w-full bg-bg-white border border-border-light rounded-lg pl-9 pr-3.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {['owner', 'director', 'project_manager'].includes(user?.role || '') && (
                <button
                  onClick={() => setShowAddRABModal(true)}
                  className="px-3.5 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer"
                >
                  <Plus size={15} />
                  <span>Tambah Mata Anggaran</span>
                </button>
              )}
            </div>
          </div>

          {/* Dynamic Material Family Filter Bar */}
          <div className="bg-bg-white border border-border-light rounded-xl p-3 shadow-xs space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-bold text-text-secondary uppercase tracking-wider">
                <Tag size={14} className="text-primary" />
                <span>Filter Kategori Material ({availableFamilies.length} Grup Terdeteksi)</span>
              </div>

              {selectedMaterialFamily && (
                <button
                  onClick={() => setSelectedMaterialFamily(null)}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <X size={12} />
                  <span>Reset Filter Grup ({selectedMaterialFamily})</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <button
                onClick={() => setSelectedMaterialFamily(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedMaterialFamily === null
                    ? 'bg-primary text-white shadow-xs font-bold ring-2 ring-primary/20'
                    : 'bg-bg-secondary/60 hover:bg-bg-secondary text-text-secondary border border-border-light'
                }`}
              >
                <span>Semua Item ({rabItems.length})</span>
              </button>

              {availableFamilies.map(({ key, count }) => {
                const isSelected = selectedMaterialFamily === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedMaterialFamily(isSelected ? null : key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-primary text-white shadow-xs font-bold ring-2 ring-primary/20 scale-[1.02]'
                        : 'bg-bg-white hover:bg-bg-secondary text-text-secondary border border-border-light hover:border-primary/40'
                    }`}
                  >
                    <span>{key}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-bg-secondary text-text-muted'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Aggregated Calculation & Batch Shopping Bar */}
          <div className="bg-gradient-to-r from-bg-white via-bg-white to-primary/5 border border-primary/20 rounded-xl p-4 shadow-xs relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Left Info: Scope & Item Stats */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary">
                    <Calculator size={13} />
                    {calculationMetrics.isSelectionActive
                      ? `${calculationMetrics.itemCount} Item Terpilih`
                      : selectedMaterialFamily
                      ? `Kalkulasi Grup: ${selectedMaterialFamily} (${calculationMetrics.itemCount} Item)`
                      : `Semua Material (${calculationMetrics.itemCount} Item)`}
                  </span>
                  {calculationMetrics.isSelectionActive && (
                    <button
                      onClick={() => setSelectedRABItemIds([])}
                      className="text-[11px] text-text-muted hover:text-rose-600 underline cursor-pointer"
                    >
                      Batalkan Pilihan
                    </button>
                  )}
                </div>

                <p className="text-xs text-text-muted">
                  {calculationMetrics.purchasableCount > 0 ? (
                    <>
                      Tersedia sisa kuota belanja:{' '}
                      <span className="font-semibold text-text-primary">
                        {calculationMetrics.purchasableCount} item
                      </span>{' '}
                      {calculationMetrics.remainingUnitsSummary && (
                        <span className="text-primary font-mono font-medium">
                          ({calculationMetrics.remainingUnitsSummary})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-emerald-600 font-medium">
                      Semua kuota dalam grup filter ini telah terpenuhi/terealisasi
                    </span>
                  )}
                </p>
              </div>

              {/* Center KPI Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-bg-secondary/40 p-2.5 rounded-lg border border-border-light text-xs">
                <div>
                  <span className="text-text-muted text-[11px] block">Plafon Anggaran</span>
                  <span className="font-mono font-bold text-text-primary">
                    Rp {calculationMetrics.totalBudget.toLocaleString('id-ID')}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted text-[11px] block">Realisasi Belanja</span>
                  <span className="font-mono font-bold text-emerald-600">
                    Rp {calculationMetrics.totalRealized.toLocaleString('id-ID')}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted text-[11px] block">Sisa Pagu Bebas</span>
                  <span className="font-mono font-bold text-blue-600">
                    Rp {calculationMetrics.remainingBudget.toLocaleString('id-ID')}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted text-[11px] block">Est. Sisa Belanja</span>
                  <span className="font-mono font-bold text-primary">
                    Rp {calculationMetrics.remainingEstShoppingCost.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* Right Action: Belanja Sekaligus Button */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleOpenBatchPurchase}
                  disabled={calculationMetrics.purchasableCount === 0 && !calculationMetrics.isSelectionActive}
                  className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs sm:text-sm font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95"
                  title="Beli sekaligus semua item material yang dipilih atau dalam filter saat ini"
                >
                  <ShoppingCart size={16} />
                  <span>
                    Belanja Sekaligus{' '}
                    {calculationMetrics.isSelectionActive
                      ? `(${calculationMetrics.itemCount} Dipilih)`
                      : selectedMaterialFamily
                      ? `(${calculationMetrics.purchasableCount} ${selectedMaterialFamily})`
                      : `(${calculationMetrics.purchasableCount} Item)`}
                  </span>
                </button>
              </div>
            </div>

            {/* Progress Bar Serapan */}
            <div className="mt-3 pt-2.5 border-t border-border-light/60 flex items-center gap-3">
              <span className="text-[11px] text-text-muted font-medium shrink-0">
                Serapan Anggaran Grup:{' '}
                <strong className="font-mono text-text-primary">{calculationMetrics.realizationPercent}%</strong>
              </span>
              <div className="flex-1 h-2 bg-bg-secondary rounded-full overflow-hidden border border-border-light">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    calculationMetrics.realizationPercent >= 100
                      ? 'bg-rose-500'
                      : calculationMetrics.realizationPercent > 80
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, calculationMetrics.realizationPercent)}%` }}
                />
              </div>
            </div>
          </div>

          {/* RAB Table (SAP Fiori Style with Selection Checkboxes) */}
          <div className="bg-bg-white border border-border-light rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-bg-secondary/60 border-b border-border-light text-text-muted uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3 text-center w-10">
                      <input
                        type="checkbox"
                        aria-label="Pilih Semua Item Terfilter"
                        checked={
                          filteredRABItems.length > 0 &&
                          filteredRABItems.every((it) => selectedRABItemIds.includes(it._id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            const allIds = filteredRABItems.map((it) => it._id);
                            setSelectedRABItemIds((prev) => Array.from(new Set([...prev, ...allIds])));
                          } else {
                            const filteredIds = new Set(filteredRABItems.map((it) => it._id));
                            setSelectedRABItemIds((prev) => prev.filter((id) => !filteredIds.has(id)));
                          }
                        }}
                        className="rounded border-border-light text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3.5 text-left">Kode WBS</th>
                    <th className="py-3 px-3.5 text-left">Uraian Pekerjaan / Bahan</th>
                    <th className="py-3 px-3.5 text-left">Kategori</th>
                    <th className="py-3 px-3.5 text-center">Satuan</th>
                    <th className="py-3 px-3.5 text-right">Plafon Volume</th>
                    <th className="py-3 px-3.5 text-right">Tarif Satuan (Rp)</th>
                    <th className="py-3 px-3.5 text-right">Total Plafon Anggaran</th>
                    <th className="py-3 px-3.5 text-right">Volume Realisasi</th>
                    <th className="py-3 px-3.5 text-right">Biaya Realisasi</th>
                    <th className="py-3 px-3.5 text-right">Sisa Kuota Fisik</th>
                    <th className="py-3 px-3.5 text-center min-w-[120px]">Serapan Kuota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light/60">
                  {filteredRABItems.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-text-muted text-sm">
                        Tidak ada item anggaran RAB yang cocok dengan filter atau kata kunci ini.
                      </td>
                    </tr>
                  ) : (
                    filteredRABItems.map((item) => {
                      const realizedQty = item.realizedQuantity || 0;
                      const budgetedQty = item.budgetedQuantity || 0;
                      const remainingQty = Math.max(0, budgetedQty - realizedQty);
                      const percent =
                        budgetedQty > 0 ? Math.min(100, Math.round((realizedQty / budgetedQty) * 100)) : 0;
                      const isOver = realizedQty > budgetedQty;
                      const isSelected = selectedRABItemIds.includes(item._id);

                      return (
                        <tr
                          key={item._id}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-primary/5 hover:bg-primary/10'
                              : 'hover:bg-bg-secondary/30'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              aria-label={`Pilih ${item.description}`}
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRABItemIds((prev) => [...prev, item._id]);
                                } else {
                                  setSelectedRABItemIds((prev) => prev.filter((id) => id !== item._id));
                                }
                              }}
                              className="rounded border-border-light text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-3.5 font-mono font-bold text-primary whitespace-nowrap">
                            {item.wbsCode}
                          </td>
                          <td className="py-3 px-3.5 font-medium text-text-primary max-w-[220px]">
                            <div className="flex items-center gap-1.5">
                              <span>{item.description}</span>
                              <span className="text-[10px] text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded font-mono">
                                {extractMaterialFamily(item.description)}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span className="capitalize px-2 py-0.5 rounded text-[11px] font-semibold bg-bg-secondary text-text-secondary border border-border-light">
                              {item.category}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-center font-medium text-text-muted whitespace-nowrap">
                            {item.unitOfMeasure}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-semibold text-text-primary whitespace-nowrap tabular-nums">
                            {budgetedQty.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-text-secondary whitespace-nowrap tabular-nums">
                            Rp {(item.unitRate || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-text-primary whitespace-nowrap tabular-nums">
                            Rp {(item.totalBudget || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-600 whitespace-nowrap tabular-nums">
                            {realizedQty.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-600 whitespace-nowrap tabular-nums">
                            Rp {(item.realizedAmount || 0).toLocaleString('id-ID')}
                          </td>
                          <td
                            className={`py-3 px-3.5 text-right font-mono font-bold whitespace-nowrap tabular-nums ${
                              isOver ? 'text-semantic-danger' : 'text-blue-600'
                            }`}
                          >
                            {remainingQty.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-bg-secondary rounded-full overflow-hidden border border-border-light">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isOver ? 'bg-semantic-danger' : percent > 85 ? 'bg-amber-500' : 'bg-primary'
                                  }`}
                                  style={{ width: `${Math.min(100, percent)}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-mono font-bold text-text-muted w-8 text-right">
                                {percent}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: Antrean Sinkronisasi Offline (Dexie.js) */}
      {activeTab === 'offline' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-bg-white p-4 rounded-xl border border-border-light">
            <div>
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <WifiOff size={18} className="text-amber-500" />
                <span>Penyimpanan Offline Lapangan (IndexedDB)</span>
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Voucher pembelian yang dibuat saat sinyal hilang akan disimpan di sini dan dikirim otomatis saat tersambung internet.
              </p>
            </div>

            <button
              onClick={handleManualSync}
              disabled={isSyncing || !isOnline || pendingOfflineCount === 0}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs sm:text-sm font-bold rounded-lg shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSyncing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Sedang Menyinkronkan...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  <span>Sinkronkan Sekarang ({pendingOfflineCount})</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-bg-white border border-border-light rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-bg-secondary/60 border-b border-border-light text-text-muted uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3.5 text-left">Waktu Simpan</th>
                    <th className="py-3 px-3.5 text-left">No. Voucher</th>
                    <th className="py-3 px-3.5 text-left">Supplier / Toko</th>
                    <th className="py-3 px-3.5 text-left">Uraian Barang</th>
                    <th className="py-3 px-3.5 text-right">Total Biaya</th>
                    <th className="py-3 px-3.5 text-center">Status Sync</th>
                    <th className="py-3 px-3.5 text-left">Keterangan / Kesalahan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light/60">
                  {offlineRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-text-muted text-sm">
                        Tidak ada catatan pembelian offline yang tersimpan di browser ini.
                      </td>
                    </tr>
                  ) : (
                    offlineRecords.map((rec) => (
                      <tr key={rec.localUuid} className="hover:bg-bg-secondary/30 transition-colors">
                        <td className="py-3 px-3.5 font-mono text-text-muted whitespace-nowrap">
                          {formatDate(rec.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-3.5 font-mono font-bold text-text-primary whitespace-nowrap">
                          {rec.voucherNumber}
                        </td>
                        <td className="py-3 px-3.5 font-medium text-text-primary">{rec.supplierName}</td>
                        <td className="py-3 px-3.5 text-text-secondary">{rec.itemDescription}</td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-primary whitespace-nowrap tabular-nums">
                          Rp {rec.totalPrice.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          {rec.syncStatus === 'PENDING' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-600">
                              PENDING
                            </span>
                          )}
                          {rec.syncStatus === 'SYNCED' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-600">
                              SYNCED
                            </span>
                          )}
                          {rec.syncStatus === 'ERROR' && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-600">
                              ERROR
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-xs text-semantic-danger font-medium">
                          {rec.errorMessage || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Tambah Pembelian Langsung UMK */}
      {showAddPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl my-8">
            <LocalPurchaseForm
              projectId={selectedProjectId}
              rabItems={rabItems}
              onSuccess={() => {
                setShowAddPurchaseModal(false);
                refreshPurchases(selectedProjectId);
                refreshRAB(selectedProjectId);
                loadOfflineRecords();
              }}
              onCancel={() => setShowAddPurchaseModal(false)}
            />
          </div>
        </div>
      )}

      {/* MODAL: Tambah Mata Anggaran RAB Baru */}
      {showAddRABModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-bg-white border border-border-light rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between border-b border-border-light pb-3 mb-4">
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Layers size={18} className="text-primary" />
                <span>Tambah Mata Anggaran RAB Baru</span>
              </h3>
              <button
                onClick={() => setShowAddRABModal(false)}
                className="text-text-muted hover:text-text-primary p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {rabError && (
              <div className="mb-4 p-3 rounded-lg bg-semantic-danger/10 border border-semantic-danger/30 text-semantic-danger text-xs flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0" />
                <span>{rabError}</span>
              </div>
            )}

            <form onSubmit={handleAddRABSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor={`${formId}-wbsCode`}
                  className="block text-xs font-bold text-text-muted uppercase mb-1"
                >
                  Kode WBS / Akun Anggaran <span className="text-semantic-danger">*</span>
                </label>
                <input
                  id={`${formId}-wbsCode`}
                  type="text"
                  placeholder="Contoh: 1.1.01 atau MAT-01"
                  value={rabFormData.wbsCode}
                  onChange={(e) => setRabFormData({ ...rabFormData, wbsCode: e.target.value })}
                  className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor={`${formId}-description`}
                  className="block text-xs font-bold text-text-muted uppercase mb-1"
                >
                  Uraian Pekerjaan / Material <span className="text-semantic-danger">*</span>
                </label>
                <input
                  id={`${formId}-description`}
                  type="text"
                  placeholder="Contoh: Pengadaan Semen Portland 40kg"
                  value={rabFormData.description}
                  onChange={(e) => setRabFormData({ ...rabFormData, description: e.target.value })}
                  className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${formId}-category`}
                    className="block text-xs font-bold text-text-muted uppercase mb-1"
                  >
                    Kategori
                  </label>
                  <select
                    id={`${formId}-category`}
                    value={rabFormData.category}
                    onChange={(e) => setRabFormData({ ...rabFormData, category: e.target.value as any })}
                    className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="material">Material / Bahan</option>
                    <option value="labor">Upah HOK / Tenaga</option>
                    <option value="equipment">Peralatan</option>
                    <option value="subcontractor">Subkontraktor</option>
                    <option value="overhead">Overhead / Umum</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`${formId}-unitOfMeasure`}
                    className="block text-xs font-bold text-text-muted uppercase mb-1"
                  >
                    Satuan Ukur <span className="text-semantic-danger">*</span>
                  </label>
                  <input
                    id={`${formId}-unitOfMeasure`}
                    type="text"
                    placeholder="Contoh: Zak, m3, HOK, Kg"
                    value={rabFormData.unitOfMeasure}
                    onChange={(e) => setRabFormData({ ...rabFormData, unitOfMeasure: e.target.value })}
                    className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${formId}-budgetedQuantity`}
                    className="block text-xs font-bold text-text-muted uppercase mb-1"
                  >
                    Plafon Kuantitas <span className="text-semantic-danger">*</span>
                  </label>
                  <input
                    id={`${formId}-budgetedQuantity`}
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="0.00"
                    value={rabFormData.budgetedQuantity}
                    onChange={(e) => setRabFormData({ ...rabFormData, budgetedQuantity: e.target.value })}
                    className="w-full font-mono text-right bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${formId}-unitRate`}
                    className="block text-xs font-bold text-text-muted uppercase mb-1"
                  >
                    Tarif Satuan (Rp) <span className="text-semantic-danger">*</span>
                  </label>
                  <input
                    id={`${formId}-unitRate`}
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={rabFormData.unitRate}
                    onChange={(e) => setRabFormData({ ...rabFormData, unitRate: e.target.value })}
                    className="w-full font-mono text-right bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>

              {/* Total Plafon Kalkulasi */}
              <div className="p-3 rounded-lg bg-bg-secondary/60 border border-border-light flex justify-between items-center text-xs">
                <span className="text-text-muted font-medium">Total Plafon Anggaran:</span>
                <span className="font-mono font-bold text-primary text-sm">
                  Rp{' '}
                  {(
                    (parseFloat(rabFormData.budgetedQuantity) || 0) *
                    (parseFloat(rabFormData.unitRate) || 0)
                  ).toLocaleString('id-ID')}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-light">
                <button
                  type="button"
                  onClick={() => setShowAddRABModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-bg-secondary rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={rabSubmitting}
                  className="px-5 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-60"
                >
                  {rabSubmitting ? <Loader2 size={14} className="animate-spin" /> : <FileCheck size={14} />}
                  <span>Simpan Mata Anggaran</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Belanja Sekaligus (Batch Purchase Multi-Item) */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-bg-white border border-border-light rounded-2xl shadow-2xl w-full max-w-4xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-primary p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-xs">
                  <ShoppingCart size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">Belanja Sekaligus / Pengadaan Borongan UMK</h3>
                  <p className="text-xs text-emerald-100 mt-0.5">
                    Catat beberapa material dalam satu kuitansi/nota toko dengan perhitungan otomatis
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <form onSubmit={handleBatchSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {batchSubmitError && (
                <div className="p-3.5 rounded-xl bg-semantic-danger/10 border border-semantic-danger/30 text-semantic-danger text-xs flex items-start gap-2.5">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Terjadi Kesalahan:</strong>
                    <span>{batchSubmitError}</span>
                  </div>
                </div>
              )}

              {/* Form Section 1: Header Nota & Toko */}
              <div className="bg-bg-secondary/30 border border-border-light rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-text-primary uppercase tracking-wider border-b border-border-light/60 pb-2">
                  <Receipt size={15} className="text-primary" />
                  <span>Informasi Kuitansi & Toko / Supplier</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-text-muted uppercase mb-1">
                      No. Kuitansi / Voucher <span className="text-semantic-danger">*</span>
                    </label>
                    <input
                      type="text"
                      value={batchFormData.voucherNumber}
                      onChange={(e) => setBatchFormData({ ...batchFormData, voucherNumber: e.target.value })}
                      placeholder="VCH-YYYYMMDD-XXXX"
                      className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs font-mono font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-text-muted uppercase mb-1">
                      Nama Toko / Supplier <span className="text-semantic-danger">*</span>
                    </label>
                    <input
                      type="text"
                      value={batchFormData.supplierName}
                      onChange={(e) => setBatchFormData({ ...batchFormData, supplierName: e.target.value })}
                      placeholder="Contoh: TB Sinar Maju"
                      className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-text-muted uppercase mb-1">
                      Kontak / Telepon Toko
                    </label>
                    <input
                      type="text"
                      value={batchFormData.supplierContact}
                      onChange={(e) => setBatchFormData({ ...batchFormData, supplierContact: e.target.value })}
                      placeholder="Contoh: 08123456789"
                      className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-text-muted uppercase mb-1">
                      Nama Pelaksana / Pembeli <span className="text-semantic-danger">*</span>
                    </label>
                    <input
                      type="text"
                      value={batchFormData.purchaserName}
                      onChange={(e) => setBatchFormData({ ...batchFormData, purchaserName: e.target.value })}
                      placeholder="Nama personil lapangan"
                      className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-text-muted uppercase mb-1">
                      Tanggal Belanja
                    </label>
                    <input
                      type="date"
                      value={batchFormData.transactionDate}
                      onChange={(e) => setBatchFormData({ ...batchFormData, transactionDate: e.target.value })}
                      className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-text-muted uppercase mb-1">
                      Catatan Nota / Keperluan
                    </label>
                    <input
                      type="text"
                      value={batchFormData.notes}
                      onChange={(e) => setBatchFormData({ ...batchFormData, notes: e.target.value })}
                      placeholder="Contoh: Belanja material cor tahap 1"
                      className="w-full bg-bg-white border border-border-light rounded-lg px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                {/* GPS and Receipt Photo Upload in Header Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {/* GPS Toko */}
                  <div className="bg-bg-white border border-border-light rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-text-muted uppercase flex items-center gap-1">
                        <MapPin size={13} className="text-emerald-600" />
                        <span>Lokasi GPS Toko (Geotag)</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleGetBatchLocation}
                        disabled={isBatchLocating}
                        className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {isBatchLocating ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            <span>Membaca GPS...</span>
                          </>
                        ) : (
                          <>
                            <MapPin size={12} />
                            <span>Ambil Lokasi Saat Ini</span>
                          </>
                        )}
                      </button>
                    </div>

                    {batchLocation.lat && batchLocation.lng ? (
                      <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded border border-emerald-200">
                        <CheckCircle2 size={14} className="shrink-0" />
                        <span className="font-mono text-[11px]">
                          Lat: {batchLocation.lat}, Lng: {batchLocation.lng}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-text-muted">
                        Koordinat GPS toko opsional untuk verifikasi audit lapangan.
                      </p>
                    )}
                    {batchLocationError && (
                      <p className="text-[11px] text-semantic-danger font-medium">{batchLocationError}</p>
                    )}
                  </div>

                  {/* Foto Nota Belanja */}
                  <div className="bg-bg-white border border-border-light rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-text-muted uppercase flex items-center gap-1">
                        <Camera size={13} className="text-primary" />
                        <span>Foto Nota Kuitansi Belanja</span>
                      </span>
                      {batchReceiptPreview && (
                        <button
                          type="button"
                          onClick={() => {
                            setBatchReceiptFile(null);
                            setBatchReceiptPreview(null);
                          }}
                          className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                        >
                          Hapus Foto
                        </button>
                      )}
                    </div>

                    {batchReceiptPreview ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={batchReceiptPreview}
                          alt="Preview Nota"
                          className="w-12 h-12 object-cover rounded border border-border-light shrink-0"
                        />
                        <div className="text-xs">
                          <span className="font-semibold text-text-primary block truncate max-w-[180px]">
                            {batchReceiptFile?.name || 'Foto Nota'}
                          </span>
                          <span className="text-[10px] text-text-muted">
                            {batchReceiptFile ? `${(batchReceiptFile.size / 1024).toFixed(1)} KB` : 'Siap diunggah'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 p-2 border border-dashed border-border-light rounded-lg text-xs text-text-muted hover:text-text-primary hover:border-primary/50 cursor-pointer transition-colors bg-bg-secondary/20">
                        <UploadCloud size={16} />
                        <span>Unggah Foto Bukti Nota Toko</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleBatchFileChange}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Form Section 2: Items Table with Quantity & Price Adjustment */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingBag size={16} className="text-primary" />
                    <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                      Daftar Material yang Dibelanjakan ({batchItems.filter((i) => i.included).length} Terpilih)
                    </h4>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setBatchItems((prev) => prev.map((it) => ({ ...it, included: true })))}
                      className="text-primary hover:underline font-semibold cursor-pointer"
                    >
                      Pilih Semua
                    </button>
                    <span>|</span>
                    <button
                      type="button"
                      onClick={() => setBatchItems((prev) => prev.map((it) => ({ ...it, included: false })))}
                      className="text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      Hapus Centang
                    </button>
                  </div>
                </div>

                <div className="border border-border-light rounded-xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-bg-secondary/60 border-b border-border-light text-text-muted uppercase tracking-wider font-semibold">
                          <th className="py-2.5 px-3 text-center w-10">Pilih</th>
                          <th className="py-2.5 px-3 text-left">Kode WBS & Material</th>
                          <th className="py-2.5 px-3 text-center">Sisa Kuota</th>
                          <th className="py-2.5 px-3 text-center min-w-[140px]">Volume Belanja</th>
                          <th className="py-2.5 px-3 text-right min-w-[140px]">Harga Satuan (Rp)</th>
                          <th className="py-2.5 px-3 text-right min-w-[130px]">Subtotal (Rp)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-light/60">
                        {batchItems.map((item, idx) => {
                          const subtotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                          const isExceeding = Number(item.quantity) > item.remainingQty && item.remainingQty > 0;

                          return (
                            <tr
                              key={item.rabItemId}
                              className={`transition-colors ${
                                item.included ? 'bg-bg-white hover:bg-bg-secondary/20' : 'bg-bg-secondary/40 opacity-60'
                              }`}
                            >
                              <td className="py-3 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={item.included}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setBatchItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, included: checked } : it))
                                    );
                                  }}
                                  className="rounded border-border-light text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                                />
                              </td>
                              <td className="py-3 px-3 max-w-[220px]">
                                <span className="font-mono font-bold text-primary block">{item.wbsCode}</span>
                                <span className="text-text-primary font-medium block truncate" title={item.description}>
                                  {item.description}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-semibold whitespace-nowrap">
                                <span className={item.remainingQty <= 0 ? 'text-semantic-danger' : 'text-text-primary'}>
                                  {item.remainingQty.toLocaleString('id-ID')} {item.unitOfMeasure}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    step="any"
                                    min="0.01"
                                    disabled={!item.included}
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      setBatchItems((prev) =>
                                        prev.map((it, i) => (i === idx ? { ...it, quantity: val } : it))
                                      );
                                    }}
                                    className="w-24 text-right font-mono text-xs bg-bg-white border border-border-light rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-bg-secondary"
                                  />
                                  <span className="text-text-muted text-[11px]">{item.unitOfMeasure}</span>
                                </div>
                                {isExceeding && (
                                  <span className="text-[10px] text-amber-600 block mt-0.5">
                                    ⚠️ Lebih dari sisa kuota ({item.remainingQty})
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  disabled={!item.included}
                                  value={item.unitPrice}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setBatchItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, unitPrice: val } : it))
                                    );
                                  }}
                                  className="w-28 text-right font-mono text-xs bg-bg-white border border-border-light rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-bg-secondary"
                                />
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-bold text-primary whitespace-nowrap">
                                Rp {subtotal.toLocaleString('id-ID')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Grand Total Calculation Banner */}
              <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
                    Total Transaksi Pembelian Borongan
                  </span>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    <strong>{batchItems.filter((i) => i.included).length}</strong> material akan dicatat dalam voucher{' '}
                    <span className="font-mono font-semibold">{batchFormData.voucherNumber}</span>
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs text-emerald-800 font-semibold block">Grand Total Kuitansi:</span>
                  <span className="text-2xl font-mono font-extrabold text-emerald-700 tracking-tight">
                    Rp{' '}
                    {batchItems
                      .filter((i) => i.included)
                      .reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0)
                      .toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-light shrink-0">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary rounded-lg transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    isBatchSubmitting ||
                    batchItems.filter((i) => i.included && Number(i.quantity) > 0).length === 0
                  }
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs sm:text-sm font-bold rounded-lg shadow-sm flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95"
                >
                  {isBatchSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Menyimpan Pembelian...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck size={16} />
                      <span>Konfirmasi & Catat Belanja Sekaligus</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Foto Bukti Kuitansi Lightbox */}
      {previewPhotoUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="relative max-w-3xl w-full flex flex-col items-center">
            <button
              onClick={() => setPreviewPhotoUrl(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 p-2"
              title="Tutup Preview"
            >
              <X size={24} />
            </button>
            <img
              src={previewPhotoUrl}
              alt="Bukti Nota Belanja"
              className="max-h-[85vh] rounded-lg shadow-2xl object-contain border border-white/20"
            />
          </div>
        </div>
      )}

      {/* MODAL: Alasan Penolakan Pembelian */}
      {rejectingPurchaseId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-bg-white border border-border-light rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-text-primary mb-2 flex items-center gap-2">
              <XCircle size={18} className="text-rose-600" />
              <span>Tolak Bukti Pembelian UMK</span>
            </h3>
            <p className="text-xs text-text-muted mb-4">
              Berikan alasan penolakan agar personil lapangan dapat memperbaiki atau mengganti bukti nota belanja.
            </p>
            <textarea
              rows={3}
              placeholder="Contoh: Nota tidak terbaca jelas, stempel toko tidak ada, atau barang tidak sesuai spesifikasi..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full bg-bg-white border border-border-light rounded-lg p-3 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingPurchaseId(null)}
                className="px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-bg-secondary rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors"
              >
                Konfirmasi Penolakan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
