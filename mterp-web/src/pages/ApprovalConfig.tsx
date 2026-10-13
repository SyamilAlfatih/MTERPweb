import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  Save,
  Clock,
  DollarSign,
  UserCheck,
  Layers,
  FileText,
  Lock,
  Users,
  ArrowRight,
  ShieldAlert,
  Building,
  RefreshCw,
  ExternalLink,
  Info,
  Check,
  ChevronRight,
  Sparkles,
  Phone,
  Mail,
  MessageSquare,
  KeyRound,
  Search,
  Copy,
  CheckCheck,
  Workflow,
  ArrowUpRight,
  Sliders,
  CheckSquare,
  BadgeCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getMasterApprovalConfig,
  updateMasterProcurementConfig,
  updateMasterSpklConfig,
} from '../api/api';
import {
  MasterApprovalConfigResponse,
  ApprovalConfigCandidateUser,
} from '../types';

export default function ApprovalConfig() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwner = user?.role === 'owner';

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'procurement' | 'spkl' | 'simulator' | 'directory'>('procurement');

  // Master Data
  const [configData, setConfigData] = useState<MasterApprovalConfigResponse | null>(null);

  // Form State - Procurement
  const [procReviewerId, setProcReviewerId] = useState('');
  const [procOpsId, setProcOpsId] = useState('');
  const [procFinanceId, setProcFinanceId] = useState('');
  const [procAutoAssign, setProcAutoAssign] = useState(true);
  const [savingProc, setSavingProc] = useState(false);
  const [procSuccessMsg, setProcSuccessMsg] = useState('');

  // Form State - SPKL
  const [spklSupervisorId, setSpklSupervisorId] = useState('');
  const [spklPmId, setSpklPmId] = useState('');
  const [spklFinanceId, setSpklFinanceId] = useState('');
  const [spklAutoAssign, setSpklAutoAssign] = useState(true);
  const [savingSpkl, setSavingSpkl] = useState(false);
  const [spklSuccessMsg, setSpklSuccessMsg] = useState('');

  // Directory search & filter
  const [directorySearch, setDirectorySearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<'all' | 'director' | 'ops' | 'finance' | 'project'>('all');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  // Simulator State
  const [simWorkflow, setSimWorkflow] = useState<'procurement' | 'spkl'>('procurement');
  const [simActiveStep, setSimActiveStep] = useState<number>(1);

  // Fetch Master Approval Config
  const fetchData = async () => {
    if (!isOwner) return;
    setLoading(true);
    try {
      const res = await getMasterApprovalConfig();
      setConfigData(res);

      // Initialize Procurement fields
      const p = res.procurement;
      if (p) {
        setProcReviewerId(typeof p.defaultReviewerId === 'object' ? p.defaultReviewerId?._id || '' : p.defaultReviewerId || '');
        setProcOpsId(typeof p.defaultOpsApproverId === 'object' ? p.defaultOpsApproverId?._id || '' : p.defaultOpsApproverId || '');
        setProcFinanceId(typeof p.defaultFinanceApproverId === 'object' ? p.defaultFinanceApproverId?._id || '' : p.defaultFinanceApproverId || '');
        setProcAutoAssign(p.autoAssignEnabled !== false);
      }

      // Initialize SPKL fields
      const s = res.spkl;
      if (s) {
        setSpklSupervisorId(typeof s.defaultSupervisorId === 'object' ? s.defaultSupervisorId?._id || '' : s.defaultSupervisorId || '');
        setSpklPmId(typeof s.defaultPmId === 'object' ? s.defaultPmId?._id || '' : s.defaultPmId || '');
        setSpklFinanceId(typeof s.defaultFinanceId === 'object' ? s.defaultFinanceId?._id || '' : s.defaultFinanceId || '');
        setSpklAutoAssign(s.autoAssignEnabled !== false);
      }
    } catch (err: any) {
      console.error('Failed to load approval config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isOwner]);

  // Handle Save Procurement Policy
  const handleSaveProcurement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProc(true);
    setProcSuccessMsg('');
    try {
      await updateMasterProcurementConfig({
        defaultReviewerId: procReviewerId || undefined,
        defaultOpsApproverId: procOpsId || undefined,
        defaultFinanceApproverId: procFinanceId || undefined,
        autoAssignEnabled: procAutoAssign,
      });
      setProcSuccessMsg('Kebijakan Otorisasi Pengadaan (PR/PO) berhasil disimpan dan aktif perusahaan.');
      setTimeout(() => setProcSuccessMsg(''), 4500);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal menyimpan konfigurasi pengadaan');
    } finally {
      setSavingProc(false);
    }
  };

  // Handle Save SPKL Policy
  const handleSaveSpkl = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSpkl(true);
    setSpklSuccessMsg('');
    try {
      await updateMasterSpklConfig({
        defaultSupervisorId: spklSupervisorId || undefined,
        defaultPmId: spklPmId || undefined,
        defaultFinanceId: spklFinanceId || undefined,
        autoAssignEnabled: spklAutoAssign,
      });
      setSpklSuccessMsg('Kebijakan Otorisasi Lembur (SPKL) berhasil disimpan dan aktif perusahaan.');
      setTimeout(() => setSpklSuccessMsg(''), 4500);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal menyimpan konfigurasi SPKL');
    } finally {
      setSavingSpkl(false);
    }
  };

  // Helper to copy text to clipboard
  const handleCopy = (text: string, identifier: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedItem(identifier);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  // Helper to construct WhatsApp link
  const getWhatsAppLink = (phone?: string, name?: string, roleTitle?: string) => {
    if (!phone) return null;
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.slice(1);
    }
    const message = encodeURIComponent(
      `Halo ${name || 'Bapak/Ibu'}, ini konfirmasi dari Owner MTERP mengenai penugasan otorisasi sebagai ${roleTitle || 'Approver'}. Mohon pastikan akun dan Passphrase Anda siap.`
    );
    return `https://wa.me/${cleaned}?text=${message}`;
  };

  // Helper to format date
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Default Sistem MTERP';
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  // Helper to find user info by ID
  const getUserById = (id: string): ApprovalConfigCandidateUser | undefined => {
    if (!id || !configData?.candidates?.allUsers) return undefined;
    return configData.candidates.allUsers.find((u) => u._id === id);
  };

  // Filter candidate directory users
  const filteredUsers = useMemo(() => {
    const all = configData?.candidates?.allUsers || [];
    let list = [...all];

    // Department filter
    if (departmentFilter === 'director') {
      list = list.filter((u) => u.role === 'owner' || u.role === 'director' || (u.department || '').toLowerCase().includes('direksi'));
    } else if (departmentFilter === 'ops') {
      list = list.filter((u) => u.role === 'supervisor' || u.role === 'qc' || (u.department || '').toLowerCase().includes('operasional'));
    } else if (departmentFilter === 'finance') {
      list = list.filter((u) => u.role === 'finance' || (u.department || '').toLowerCase().includes('keuangan') || (u.department || '').toLowerCase().includes('finance'));
    } else if (departmentFilter === 'project') {
      list = list.filter((u) => u.role === 'pm' || (u.department || '').toLowerCase().includes('proyek'));
    }

    // Text search
    const q = directorySearch.toLowerCase().trim();
    if (q) {
      list = list.filter((u) => {
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q) ||
          (u.department || '').toLowerCase().includes(q) ||
          (u.position || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.phone || '').toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [configData, directorySearch, departmentFilter]);

  // Department counts for filter badges
  const departmentCounts = useMemo(() => {
    const all = configData?.candidates?.allUsers || [];
    return {
      all: all.length,
      director: all.filter((u) => u.role === 'owner' || u.role === 'director' || (u.department || '').toLowerCase().includes('direksi')).length,
      ops: all.filter((u) => u.role === 'supervisor' || u.role === 'qc' || (u.department || '').toLowerCase().includes('operasional')).length,
      finance: all.filter((u) => u.role === 'finance' || (u.department || '').toLowerCase().includes('keuangan') || (u.department || '').toLowerCase().includes('finance')).length,
      project: all.filter((u) => u.role === 'pm' || (u.department || '').toLowerCase().includes('proyek')).length,
    };
  }, [configData]);

  // ── Access Denied for Non-Owner ───────────────────────────────────────────
  if (!isOwner) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-3 sm:p-4">
        <div className="max-w-md w-full p-6 sm:p-8 bg-white border-2 border-rose-300 rounded-2xl sm:rounded-3xl shadow-xl text-center space-y-4 sm:space-y-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl sm:rounded-3xl bg-rose-50 text-rose-700 flex items-center justify-center border-2 border-rose-200 shadow-xs">
            <ShieldAlert size={34} strokeWidth={2.2} className="sm:w-10 sm:h-10" />
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-rose-100 text-rose-950 border border-rose-300 mb-2">
              <Lock size={12} className="text-rose-700" />
              <span>Akses Khusus Terkunci</span>
            </span>
            <h2 className="text-lg sm:text-xl font-black text-slate-950 tracking-tight">Otorisasi Eksekutif Diperlukan</h2>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Halaman <b>Pusat Kebijakan Otorisasi & Approver</b> hanya dapat dibuka dan dikelola secara langsung oleh pemegang akun berkedudukan <b>Owner Perusahaan</b>.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="w-full min-h-[44px] py-3 px-5 rounded-xl bg-slate-950 text-white text-xs sm:text-sm font-black hover:bg-slate-800 transition-all cursor-pointer shadow-md"
            >
              Kembali ke Beranda Utama
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Helper: Render Person Card (Responsive) ───────────────────────────────
  const renderPersonCard = (
    assignedUser: ApprovalConfigCandidateUser | undefined,
    stageTitle: string,
    roleTitle: string,
    colorScheme: {
      bgLight: string;
      border: string;
      badgeBg: string;
      badgeText: string;
      iconColor: string;
    },
    tasks: string[]
  ) => {
    if (!assignedUser) {
      return (
        <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50/70 border-2 border-dashed border-amber-300 text-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded border border-amber-300">
              Mode Delegasi Fleksibel
            </span>
            <AlertCircle size={14} className="text-amber-700 shrink-0" />
          </div>
          <p className="text-xs font-black text-slate-950 m-0">Tidak Ditetapkan Personel Spesifik</p>
          <p className="text-[11px] text-slate-700 m-0 leading-relaxed">
            Semua pengguna dengan kualifikasi role <b>{roleTitle}</b> dapat meninjau dan memutuskan transaksi tahap ini di dasbor mereka masing-masing.
          </p>
        </div>
      );
    }

    const waLink = getWhatsAppLink(assignedUser.phone, assignedUser.fullName, stageTitle);

    return (
      <div className={`p-3.5 sm:p-4 rounded-xl ${colorScheme.bgLight} border-2 ${colorScheme.border} space-y-3 shadow-2xs`}>
        {/* User Identity Header */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-950 text-white font-black text-xs sm:text-sm flex items-center justify-center shrink-0 border border-slate-800 shadow-2xs">
              {assignedUser.fullName
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('')
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black text-slate-950 truncate max-w-[170px] sm:max-w-[200px]" title={assignedUser.fullName}>
                  {assignedUser.fullName}
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${colorScheme.badgeBg} ${colorScheme.badgeText} border border-current/20`}>
                  {assignedUser.role}
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium m-0 mt-0.5 truncate max-w-[190px] sm:max-w-[220px]">
                {assignedUser.position || 'Pejabat Otoritas'} • {assignedUser.department || 'Operasional'}
              </p>
            </div>
          </div>

          {/* Quick WA button */}
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] sm:text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors shadow-2xs"
              title="Hubungi via WhatsApp"
            >
              <MessageSquare size={13} />
              <span className="hidden xs:inline">WA</span>
            </a>
          )}
        </div>

        {/* Contact details */}
        <div className="grid grid-cols-1 gap-1.5 text-[11px] bg-white/90 p-2.5 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 flex items-center gap-1 text-[10px]">
              <Phone size={11} />
              <span>No. Telp:</span>
            </span>
            <span className="font-mono font-bold text-slate-950 text-xs">{assignedUser.phone || '-'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 flex items-center gap-1 text-[10px]">
              <Mail size={11} />
              <span>Email:</span>
            </span>
            <span className="font-medium text-slate-900 truncate max-w-[160px] sm:max-w-[200px] text-[10px] sm:text-[11px]" title={assignedUser.email}>
              {assignedUser.email || '-'}
            </span>
          </div>
        </div>

        {/* Duty Scope Checklist */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-700 block">
            Wewenang Otorisasi Pada Tahap Ini:
          </span>
          <div className="space-y-1">
            {tasks.map((task, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-[10px] sm:text-[11px] text-slate-800 font-medium leading-tight">
                <Check size={12} className={`${colorScheme.iconColor} shrink-0 mt-0.5`} strokeWidth={2.8} />
                <span>{task}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 max-w-full overflow-x-hidden px-1 sm:px-0">
      {/* ── Executive Governance Banner (Responsive) ── */}
      <div className="p-4 sm:p-6 rounded-2xl bg-slate-950 text-white border-2 border-slate-900 shadow-md relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center shadow-lg shrink-0 border border-amber-300">
              <ShieldCheck size={28} strokeWidth={2.4} className="sm:w-8 sm:h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl md:text-2xl font-black text-white m-0 tracking-tight leading-tight">
                  Pusat Kebijakan Otorisasi & Approver
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  <Lock size={10} className="text-amber-400" />
                  <span>Owner Executive Only</span>
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 font-medium m-0 mt-1 max-w-3xl leading-relaxed">
                Kendali penuh persetujuan berjenjang perusahaan untuk <b>Pengadaan Barang (PR/PO)</b> dan <b>Surat Perintah Kerja Lembur (SPKL)</b>. Diterapkan otomatis ke seluruh transaksi operasional.
              </p>
            </div>
          </div>

          {/* Quick Action Navigation on Mobile & Desktop */}
          <div className="grid grid-cols-3 sm:flex items-center gap-2 self-stretch lg:self-auto shrink-0 pt-2 lg:pt-0 border-t border-slate-800 lg:border-t-0">
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="min-h-[40px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
              title="Segarkan Data Kebijakan"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Segarkan</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/materials')}
              className="min-h-[40px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              <Layers size={13} className="text-amber-400" />
              <span>PR/PO</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/overtime-spkl')}
              className="min-h-[40px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              <FileText size={13} className="text-amber-400" />
              <span>SPKL</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Executive Governance KPI Matrix (2 cols on Mobile, 4 on Desktop) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* KPI 1: Procurement Policy */}
        <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white border-2 border-slate-300 shadow-xs space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-600 truncate">Pengadaan PR/PO</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center border border-blue-200 shrink-0">
              <Layers size={14} className="sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base sm:text-xl font-black text-slate-950 tracking-tight font-mono">3 Tahap</span>
            <span className="text-[10px] sm:text-xs font-bold text-blue-700 hidden sm:inline">Bertingkat</span>
          </div>
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] pt-1 border-t border-slate-200">
            <span className="text-slate-600 truncate">Auto-Assign:</span>
            <span className={`font-black px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] uppercase ${procAutoAssign ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-amber-100 text-amber-900 border border-amber-300'}`}>
              {procAutoAssign ? 'Aktif' : 'Manual'}
            </span>
          </div>
        </div>

        {/* KPI 2: SPKL Policy */}
        <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white border-2 border-slate-300 shadow-xs space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-600 truncate">Lembur SPKL</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center border border-teal-200 shrink-0">
              <Clock size={14} className="sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base sm:text-xl font-black text-slate-950 tracking-tight font-mono">3 Tingkat</span>
            <span className="text-[10px] sm:text-xs font-bold text-teal-700 hidden sm:inline">Verifikasi</span>
          </div>
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] pt-1 border-t border-slate-200">
            <span className="text-slate-600 truncate">Auto-Assign:</span>
            <span className={`font-black px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] uppercase ${spklAutoAssign ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-amber-100 text-amber-900 border border-amber-300'}`}>
              {spklAutoAssign ? 'Aktif' : 'Manual'}
            </span>
          </div>
        </div>

        {/* KPI 3: Authorized Personnel Pool */}
        <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white border-2 border-slate-300 shadow-xs space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-600 truncate">Pejabat Aktif</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center border border-purple-200 shrink-0">
              <Users size={14} className="sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base sm:text-xl font-black text-slate-950 tracking-tight font-mono">{configData?.candidates?.allUsers?.length || 0}</span>
            <span className="text-[10px] sm:text-xs font-bold text-purple-700">Personel</span>
          </div>
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] pt-1 border-t border-slate-200">
            <span className="text-slate-600 truncate">Validasi:</span>
            <span className="font-black px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] uppercase bg-purple-100 text-purple-900 border border-purple-300">
              100% Siap
            </span>
          </div>
        </div>

        {/* KPI 4: Security Level */}
        <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white border-2 border-slate-300 shadow-xs space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-600 truncate">Keamanan</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200 shrink-0">
              <KeyRound size={14} className="sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm sm:text-base md:text-xl font-black text-slate-950 tracking-tight font-mono truncate">Passphrase</span>
          </div>
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] pt-1 border-t border-slate-200">
            <span className="text-slate-600 truncate">Otentikasi:</span>
            <span className="font-black px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] uppercase bg-amber-100 text-amber-950 border border-amber-300">
              Aktif
            </span>
          </div>
        </div>
      </div>

      {/* ── Segmented Tab Switcher (Touch-friendly & Scrollable on Mobile) ── */}
      <div className="flex items-center gap-2 border-b-2 border-slate-200 pb-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => setActiveTab('procurement')}
          className={`min-h-[44px] flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap border-2 shrink-0 ${
            activeTab === 'procurement'
              ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:text-slate-950'
          }`}
        >
          <Layers size={15} className={activeTab === 'procurement' ? 'text-amber-400' : 'text-slate-500'} />
          <span className="sm:hidden">1. Pengadaan</span>
          <span className="hidden sm:inline">1. Otorisasi Pengadaan & PO (Procurement)</span>
          <span className={`px-2 py-0.2 rounded-full text-[10px] font-mono font-bold ${activeTab === 'procurement' ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-800'}`}>
            3 Lapis
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('spkl')}
          className={`min-h-[44px] flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap border-2 shrink-0 ${
            activeTab === 'spkl'
              ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:text-slate-950'
          }`}
        >
          <Clock size={15} className={activeTab === 'spkl' ? 'text-amber-400' : 'text-slate-500'} />
          <span className="sm:hidden">2. SPKL Lembur</span>
          <span className="hidden sm:inline">2. Otorisasi Lembur Lapangan (SPKL)</span>
          <span className={`px-2 py-0.2 rounded-full text-[10px] font-mono font-bold ${activeTab === 'spkl' ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-800'}`}>
            3 Tingkat
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('simulator')}
          className={`min-h-[44px] flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap border-2 shrink-0 ${
            activeTab === 'simulator'
              ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:text-slate-950'
          }`}
        >
          <Workflow size={15} className={activeTab === 'simulator' ? 'text-amber-400' : 'text-slate-500'} />
          <span className="sm:hidden">3. Simulator</span>
          <span className="hidden sm:inline">3. Simulator Alur Kerja Interaktif</span>
          <span className={`px-2 py-0.2 rounded-full text-[10px] font-mono font-bold ${activeTab === 'simulator' ? 'bg-emerald-400 text-slate-950' : 'bg-slate-200 text-slate-800'}`}>
            Live Demo
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('directory')}
          className={`min-h-[44px] flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap border-2 shrink-0 ${
            activeTab === 'directory'
              ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:text-slate-950'
          }`}
        >
          <Users size={15} className={activeTab === 'directory' ? 'text-amber-400' : 'text-slate-500'} />
          <span className="sm:hidden">4. Direktori</span>
          <span className="hidden sm:inline">4. Direktori Personel Berwenang</span>
          <span className={`px-2 py-0.2 rounded-full text-[10px] font-mono font-bold ${activeTab === 'directory' ? 'bg-blue-400 text-slate-950' : 'bg-slate-200 text-slate-800'}`}>
            {configData?.candidates?.allUsers?.length || 0}
          </span>
        </button>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: PROCUREMENT APPROVAL CONFIG ──                                  */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'procurement' && (
        <div className="space-y-4 sm:space-y-6">
          {procSuccessMsg && (
            <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 text-xs font-bold flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={18} className="text-emerald-700 shrink-0" />
                <span>{procSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setProcSuccessMsg('')}
                className="text-xs text-emerald-800 hover:text-emerald-950 font-black cursor-pointer underline shrink-0"
              >
                Tutup
              </button>
            </div>
          )}

          <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-xs overflow-hidden">
            {/* Header with Auto-Assign Toggle */}
            <div className="p-4 sm:p-5 bg-slate-950 text-white border-b-2 border-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={18} className="text-amber-400" />
                  <h3 className="text-sm sm:text-base font-black text-white m-0">
                    Kebijakan Alur Pengadaan Barang & Jasa (PR & PO)
                  </h3>
                </div>
                <p className="text-xs text-slate-300 m-0 mt-1 max-w-2xl leading-relaxed">
                  Setiap Purchase Request (PR) yang dibuat staf langsung otomatis mengalir ke pejabat berwenang di bawah ini tanpa penugasan manual per dokumen.
                </p>
                <div className="text-[11px] text-slate-400 font-mono mt-1.5">
                  Pembaruan Terakhir: {formatDate(configData?.procurement?.updatedAt)}
                </div>
              </div>

              {/* High-visibility Toggle */}
              <div className="bg-slate-900 border-2 border-slate-700 p-2.5 sm:p-3 rounded-2xl flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto shrink-0">
                <div>
                  <div className="text-xs font-black text-white">Auto-Assign Transaksi</div>
                  <div className="text-[10px] text-slate-300 font-medium">Otomatisasi pengaliran PR/PO</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0 min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={procAutoAssign}
                    onChange={(e) => setProcAutoAssign(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[11px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>

            <form onSubmit={handleSaveProcurement} className="p-4 sm:p-6 space-y-6">
              {/* Visual Pipeline Progression Banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                {/* Stage 1 Header Card */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-blue-50/70 border-2 border-blue-300 flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center shrink-0 shadow-2xs text-xs sm:text-sm">
                    01
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-900 block">
                      Tahap Pertama • Teknis & QC
                    </span>
                    <h4 className="text-xs font-black text-slate-950 m-0">Tinjauan SPV / QC Inspector</h4>
                  </div>
                </div>

                {/* Stage 2 Header Card */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-indigo-50/70 border-2 border-indigo-300 flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-600 text-white font-black flex items-center justify-center shrink-0 shadow-2xs text-xs sm:text-sm">
                    02
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 block">
                      Tahap Kedua • Operasional
                    </span>
                    <h4 className="text-xs font-black text-slate-950 m-0">Persetujuan Direktur Ops</h4>
                  </div>
                </div>

                {/* Stage 3 Header Card */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-purple-50/70 border-2 border-purple-300 flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-600 text-white font-black flex items-center justify-center shrink-0 shadow-2xs text-xs sm:text-sm">
                    03
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-900 block">
                      Tahap Ketiga • Finansial (PO)
                    </span>
                    <h4 className="text-xs font-black text-slate-950 m-0">Persetujuan Direktur Keuangan</h4>
                  </div>
                </div>
              </div>

              {/* 3 Interactive Approver Configuration Columns */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
                {/* 1. Reviewer QC Column */}
                <div className="space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-blue-950 uppercase flex items-center gap-1.5">
                      <UserCheck size={14} className="text-blue-700" />
                      <span>1. Personel Default Reviewer QC / SPV</span>
                    </label>
                    <select
                      value={procReviewerId}
                      onChange={(e) => setProcReviewerId(e.target.value)}
                      className="w-full min-h-[44px] p-2.5 text-xs sm:text-sm font-bold rounded-xl border-2 border-slate-300 bg-white text-slate-950 focus:outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
                    >
                      <option value="">-- Bebas (Semua Reviewer QC / SPV Lapangan) --</option>
                      {(configData?.candidates?.procurement?.reviewers || []).map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.fullName} ({u.role}) {u.position ? `• ${u.position}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Identity Card */}
                  {renderPersonCard(
                    getUserById(procReviewerId),
                    'Reviewer Teknis QC',
                    'Reviewer QC / SPV',
                    {
                      bgLight: 'bg-blue-50/50',
                      border: 'border-blue-300',
                      badgeBg: 'bg-blue-100',
                      badgeText: 'text-blue-900',
                      iconColor: 'text-blue-700',
                    },
                    [
                      'Memverifikasi spesifikasi teknis item material',
                      'Memvalidasi kuantitas kebutuhan riil lapangan',
                      'Menyetujui atau menolak dengan passphrase & catatan',
                    ]
                  )}
                </div>

                {/* 2. Ops Director Column */}
                <div className="space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-indigo-950 uppercase flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-indigo-700" />
                      <span>2. Personel Default Direktur Ops</span>
                    </label>
                    <select
                      value={procOpsId}
                      onChange={(e) => setProcOpsId(e.target.value)}
                      className="w-full min-h-[44px] p-2.5 text-xs sm:text-sm font-bold rounded-xl border-2 border-slate-300 bg-white text-slate-950 focus:outline-none focus:border-indigo-600 shadow-2xs cursor-pointer"
                    >
                      <option value="">-- Bebas (Semua Direktur Operasional) --</option>
                      {(configData?.candidates?.procurement?.opsApprovers || []).map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.fullName} ({u.role}) {u.position ? `• ${u.position}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Identity Card */}
                  {renderPersonCard(
                    getUserById(procOpsId),
                    'Direktur Operasional',
                    'Direktur Operasional',
                    {
                      bgLight: 'bg-indigo-50/50',
                      border: 'border-indigo-300',
                      badgeBg: 'bg-indigo-100',
                      badgeText: 'text-indigo-900',
                      iconColor: 'text-indigo-700',
                    },
                    [
                      'Menyetujui plafon anggaran estimasi PR',
                      'Mengotorisasi beban biaya ke mata anggaran WBS',
                      'Membuka izin pengadaan ke matriks komparasi vendor',
                    ]
                  )}
                </div>

                {/* 3. Finance Director Column */}
                <div className="space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-purple-950 uppercase flex items-center gap-1.5">
                      <DollarSign size={14} className="text-purple-700" />
                      <span>3. Personel Default Direktur Keuangan</span>
                    </label>
                    <select
                      value={procFinanceId}
                      onChange={(e) => setProcFinanceId(e.target.value)}
                      className="w-full min-h-[44px] p-2.5 text-xs sm:text-sm font-bold rounded-xl border-2 border-slate-300 bg-white text-slate-950 focus:outline-none focus:border-purple-600 shadow-2xs cursor-pointer"
                    >
                      <option value="">-- Bebas (Semua Direktur Keuangan) --</option>
                      {(configData?.candidates?.procurement?.financeApprovers || []).map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.fullName} ({u.role}) {u.position ? `• ${u.position}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Identity Card */}
                  {renderPersonCard(
                    getUserById(procFinanceId),
                    'Direktur Keuangan (PO)',
                    'Direktur Keuangan',
                    {
                      bgLight: 'bg-purple-50/50',
                      border: 'border-purple-300',
                      badgeBg: 'bg-purple-100',
                      badgeText: 'text-purple-900',
                      iconColor: 'text-purple-700',
                    },
                    [
                      'Memilih penawaran supplier terbaik (landed cost)',
                      'Memasukkan Passphrase Finansial mengikat',
                      'Menerbitkan dokumen Purchase Order (PO) sah perusahaan',
                    ]
                  )}
                </div>
              </div>

              {/* Submit & Governance Notice Bar (Responsive) */}
              <div className="pt-4 border-t-2 border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-2 text-xs text-slate-700 font-medium bg-slate-100 p-2.5 sm:p-3 rounded-xl border border-slate-200 w-full sm:w-auto">
                  <Info size={15} className="text-slate-600 shrink-0" />
                  <span>
                    Perubahan langsung berlaku untuk seluruh PR baru yang diajukan tanpa mengganggu transaksi berjalan.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={savingProc}
                  className="w-full sm:w-auto min-h-[46px] flex items-center justify-center gap-2 px-6 sm:px-7 py-3 rounded-xl bg-slate-950 hover:bg-slate-800 active:scale-[0.98] text-white text-xs sm:text-sm font-black transition-all cursor-pointer shadow-md disabled:opacity-50 shrink-0"
                >
                  <Save size={15} className="text-amber-400" />
                  <span>{savingProc ? 'Menyimpan Kebijakan...' : 'Simpan & Terapkan Kebijakan Pengadaan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: SPKL APPROVAL CONFIG ──                                         */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'spkl' && (
        <div className="space-y-4 sm:space-y-6">
          {spklSuccessMsg && (
            <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 text-xs font-bold flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={18} className="text-emerald-700 shrink-0" />
                <span>{spklSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setSpklSuccessMsg('')}
                className="text-xs text-emerald-800 hover:text-emerald-950 font-black cursor-pointer underline shrink-0"
              >
                Tutup
              </button>
            </div>
          )}

          <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-xs overflow-hidden">
            {/* Header with Auto-Assign Toggle */}
            <div className="p-4 sm:p-5 bg-slate-950 text-white border-b-2 border-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-amber-400" />
                  <h3 className="text-sm sm:text-base font-black text-white m-0">
                    Kebijakan Alur Surat Perintah Kerja Lembur (SPKL)
                  </h3>
                </div>
                <p className="text-xs text-slate-300 m-0 mt-1 max-w-2xl leading-relaxed">
                  Setiap pengajuan lembur pekerja lapangan (baik individual maupun batch kolektif) dialirkan secara berjenjang ke 3 verifikator terpilih di bawah ini.
                </p>
                <div className="text-[11px] text-slate-400 font-mono mt-1.5">
                  Pembaruan Terakhir: {formatDate(configData?.spkl?.updatedAt)}
                </div>
              </div>

              {/* High-visibility Toggle */}
              <div className="bg-slate-900 border-2 border-slate-700 p-2.5 sm:p-3 rounded-2xl flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto shrink-0">
                <div>
                  <div className="text-xs font-black text-white">Auto-Assign Transaksi</div>
                  <div className="text-[10px] text-slate-300 font-medium">Otomatisasi delegasi lembur</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0 min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={spklAutoAssign}
                    onChange={(e) => setSpklAutoAssign(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[11px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>

            <form onSubmit={handleSaveSpkl} className="p-4 sm:p-6 space-y-6">
              {/* Visual Pipeline Progression Banner for SPKL */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                {/* Step 1 Header Card */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-teal-50/70 border-2 border-teal-300 flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-teal-600 text-white font-black flex items-center justify-center shrink-0 shadow-2xs text-xs sm:text-sm">
                    01
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-teal-900 block">
                      Tingkat Pertama • Lapangan
                    </span>
                    <h4 className="text-xs font-black text-slate-950 m-0">Verifikator SPV Lapangan</h4>
                  </div>
                </div>

                {/* Step 2 Header Card */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-sky-50/70 border-2 border-sky-300 flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-sky-600 text-white font-black flex items-center justify-center shrink-0 shadow-2xs text-xs sm:text-sm">
                    02
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-sky-900 block">
                      Tingkat Kedua • Manajemen Proyek
                    </span>
                    <h4 className="text-xs font-black text-slate-950 m-0">Penyetuju Project Manager</h4>
                  </div>
                </div>

                {/* Step 3 Header Card */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-emerald-50/70 border-2 border-emerald-300 flex items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center shrink-0 shadow-2xs text-xs sm:text-sm">
                    03
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900 block">
                      Tingkat Ketiga • Biaya & Payroll
                    </span>
                    <h4 className="text-xs font-black text-slate-950 m-0">Verifikator Direktur Keuangan</h4>
                  </div>
                </div>
              </div>

              {/* 3 Interactive SPKL Verifier Configuration Columns */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
                {/* 1. Supervisor Column */}
                <div className="space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-teal-950 uppercase flex items-center gap-1.5">
                      <UserCheck size={14} className="text-teal-700" />
                      <span>1. Personel Default Verifikator SPV</span>
                    </label>
                    <select
                      value={spklSupervisorId}
                      onChange={(e) => setSpklSupervisorId(e.target.value)}
                      className="w-full min-h-[44px] p-2.5 text-xs sm:text-sm font-bold rounded-xl border-2 border-slate-300 bg-white text-slate-950 focus:outline-none focus:border-teal-600 shadow-2xs cursor-pointer"
                    >
                      <option value="">-- Bebas (Semua Supervisor / Site Manager) --</option>
                      {(configData?.candidates?.spkl?.supervisors || []).map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.fullName} ({u.role}) {u.position ? `• ${u.position}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Identity Card */}
                  {renderPersonCard(
                    getUserById(spklSupervisorId),
                    'Verifikator SPV Lapangan',
                    'Supervisor / Pengawas Lapangan',
                    {
                      bgLight: 'bg-teal-50/50',
                      border: 'border-teal-300',
                      badgeBg: 'bg-teal-100',
                      badgeText: 'text-teal-900',
                      iconColor: 'text-teal-700',
                    },
                    [
                      'Memverifikasi jam kerja lembur riil dan kehadiran pekerja',
                      'Memvalidasi pencapaian volume output pekerjaan lembur',
                      'Menyetujui atau menolak dengan catatan verifikasi lapangan',
                    ]
                  )}
                </div>

                {/* 2. PM Column */}
                <div className="space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-sky-950 uppercase flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-sky-700" />
                      <span>2. Personel Default Penyetuju PM</span>
                    </label>
                    <select
                      value={spklPmId}
                      onChange={(e) => setSpklPmId(e.target.value)}
                      className="w-full min-h-[44px] p-2.5 text-xs sm:text-sm font-bold rounded-xl border-2 border-slate-300 bg-white text-slate-950 focus:outline-none focus:border-sky-600 shadow-2xs cursor-pointer"
                    >
                      <option value="">-- Bebas (Semua Project Manager / Direksi) --</option>
                      {(configData?.candidates?.spkl?.projectManagers || []).map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.fullName} ({u.role}) {u.position ? `• ${u.position}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Identity Card */}
                  {renderPersonCard(
                    getUserById(spklPmId),
                    'Penyetuju Project Manager',
                    'Project Manager',
                    {
                      bgLight: 'bg-sky-50/50',
                      border: 'border-sky-300',
                      badgeBg: 'bg-sky-100',
                      badgeText: 'text-sky-900',
                      iconColor: 'text-sky-700',
                    },
                    [
                      'Memeriksa urgensi lembur terhadap jadwal kurva S proyek',
                      'Mengotorisasi beban jam lembur terhadap WBS pekerjaan',
                      'Mengesahkan dokumen SPKL sebelum kalkulasi kompensasi',
                    ]
                  )}
                </div>

                {/* 3. Finance Column */}
                <div className="space-y-3 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-emerald-950 uppercase flex items-center gap-1.5">
                      <DollarSign size={14} className="text-emerald-700" />
                      <span>3. Personel Default Verifikator Keuangan</span>
                    </label>
                    <select
                      value={spklFinanceId}
                      onChange={(e) => setSpklFinanceId(e.target.value)}
                      className="w-full min-h-[44px] p-2.5 text-xs sm:text-sm font-bold rounded-xl border-2 border-slate-300 bg-white text-slate-950 focus:outline-none focus:border-emerald-600 shadow-2xs cursor-pointer"
                    >
                      <option value="">-- Bebas (Semua Verifikator Keuangan / Accounting) --</option>
                      {(configData?.candidates?.spkl?.financeVerifiers || []).map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.fullName} ({u.role}) {u.position ? `• ${u.position}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Identity Card */}
                  {renderPersonCard(
                    getUserById(spklFinanceId),
                    'Verifikator Finansial SPKL',
                    'Direktur Keuangan / Payroll',
                    {
                      bgLight: 'bg-emerald-50/50',
                      border: 'border-emerald-300',
                      badgeBg: 'bg-emerald-100',
                      badgeText: 'text-emerald-900',
                      iconColor: 'text-emerald-700',
                    },
                    [
                      'Memverifikasi tarif upah lembur reguler & PP 35/2021',
                      'Mengotorisasi total nilai kompensasi lembur pekerja',
                      'Sinkronisasi otomatis ke modul Payroll Slip Gaji',
                    ]
                  )}
                </div>
              </div>

              {/* Submit & Governance Notice Bar */}
              <div className="pt-4 border-t-2 border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-2 text-xs text-slate-700 font-medium bg-slate-100 p-2.5 sm:p-3 rounded-xl border border-slate-200 w-full sm:w-auto">
                  <Info size={15} className="text-slate-600 shrink-0" />
                  <span>
                    Seluruh dokumen lembur SPKL baru akan otomatis dialirkan ke verifikator di atas secara instan.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={savingSpkl}
                  className="w-full sm:w-auto min-h-[46px] flex items-center justify-center gap-2 px-6 sm:px-7 py-3 rounded-xl bg-slate-950 hover:bg-slate-800 active:scale-[0.98] text-white text-xs sm:text-sm font-black transition-all cursor-pointer shadow-md disabled:opacity-50 shrink-0"
                >
                  <Save size={15} className="text-amber-400" />
                  <span>{savingSpkl ? 'Menyimpan Kebijakan...' : 'Simpan & Terapkan Kebijakan SPKL'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 3: INTERACTIVE WORKFLOW SIMULATOR (Fully Responsive) ──             */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'simulator' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-slate-300 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Workflow size={18} className="text-blue-700" />
                <h3 className="text-sm sm:text-base font-black text-slate-950 m-0">
                  Simulator Alur Kerja Interaktif (Live Flow)
                </h3>
              </div>
              <p className="text-xs text-slate-600 m-0 mt-0.5">
                Uji dan amati bagaimana sistem MTERP mengeksekusi routing, validasi bertahap, notifikasi WhatsApp, dan perlindungan Passphrase.
              </p>
            </div>

            {/* Workflow Mode Switcher */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border-2 border-slate-300 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setSimWorkflow('procurement');
                  setSimActiveStep(1);
                }}
                className={`flex-1 sm:flex-none min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer text-center ${
                  simWorkflow === 'procurement' ? 'bg-slate-950 text-white shadow-2xs' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                Pengadaan (PR/PO)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimWorkflow('spkl');
                  setSimActiveStep(1);
                }}
                className={`flex-1 sm:flex-none min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer text-center ${
                  simWorkflow === 'spkl' ? 'bg-slate-950 text-white shadow-2xs' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                Lembur (SPKL)
              </button>
            </div>
          </div>

          {/* Flow Stepper Indicator */}
          <div className="p-4 sm:p-6 rounded-2xl bg-white border-2 border-slate-300 shadow-xs space-y-4 sm:space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
              {[
                { step: 1, title: 'Inisiasi Transaksi', sub: simWorkflow === 'procurement' ? 'Staf Input PR' : 'Mandor Input Lembur' },
                { step: 2, title: 'Tahap 1 Verifikasi', sub: simWorkflow === 'procurement' ? 'QC/SPV Lapangan' : 'SPV Lapangan' },
                { step: 3, title: 'Tahap 2 Otorisasi', sub: simWorkflow === 'procurement' ? 'Direktur Ops' : 'Project Manager' },
                { step: 4, title: 'Tahap 3 Finalisasi', sub: simWorkflow === 'procurement' ? 'Direktur Keuangan' : 'Keuangan Payroll' },
              ].map((s) => {
                const isActive = simActiveStep === s.step;
                const isPassed = simActiveStep > s.step;
                return (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => setSimActiveStep(s.step)}
                    className={`p-2.5 sm:p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer min-h-[44px] ${
                      isActive
                        ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                        : isPassed
                        ? 'bg-emerald-50 text-slate-900 border-emerald-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[9px] sm:text-[10px] font-black uppercase font-mono px-1.5 sm:px-2 py-0.2 rounded ${isActive ? 'bg-amber-400 text-slate-950' : isPassed ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-200 text-slate-700'}`}>
                        Langkah {s.step}
                      </span>
                      {isPassed && <CheckCircle2 size={13} className="text-emerald-700" />}
                    </div>
                    <div className="text-[11px] sm:text-xs font-black mt-1.5 leading-tight">{s.title}</div>
                    <div className={`text-[10px] mt-0.5 truncate hidden sm:block ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>{s.sub}</div>
                  </button>
                );
              })}
            </div>

            {/* Simulated Live Step Inspector */}
            <div className="p-4 sm:p-6 rounded-2xl bg-slate-50 border-2 border-slate-200 space-y-4">
              {simWorkflow === 'procurement' ? (
                <>
                  {simActiveStep === 1 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-950 font-black text-xs border border-blue-300">
                          Status: PR_PENDING
                        </span>
                        <span className="text-xs font-bold text-slate-600">Dokumen Dibuat Oleh Staf Proyek</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-950 m-0">Inisiasi Purchase Request (PR)</h4>
                      <p className="text-xs text-slate-700 leading-relaxed m-0">
                        Staf lapangan menginput rincian material (item, spesifikasi, volume, dan perkiraan biaya). Karena fitur <b>Auto-Assign</b> aktif, sistem MTERP otomatis menetapkan <b>{getUserById(procReviewerId)?.fullName || 'Reviewer QC Terdaftar'}</b> sebagai pemeriksa tahap pertama.
                      </p>
                      <div className="p-3 rounded-xl bg-white border border-slate-300 text-xs font-mono text-slate-800 space-y-1">
                        <div className="text-emerald-700 font-bold">✓ Notifikasi WhatsApp Otomatis:</div>
                        <div className="text-slate-600">"PR Baru #PR-2026-0042 butuh verifikasi teknis Anda di MTERP."</div>
                      </div>
                    </div>
                  )}

                  {simActiveStep === 2 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-950 font-black text-xs border border-indigo-300">
                          Status: PR_REVIEWED
                        </span>
                        <span className="text-xs font-bold text-slate-600">Pemeriksaan Teknis & Spesifikasi</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-950 m-0">Tinjauan SPV / QC Inspector</h4>
                      <p className="text-xs text-slate-700 leading-relaxed m-0">
                        Reviewer <b>{getUserById(procReviewerId)?.fullName || 'Reviewer QC'}</b> memeriksa material di lapangan. Mereka memiliki opsi <b>Setujui</b> atau <b>Tolak</b> dengan verifikasi Passphrase. Setelah disetujui, dokumen otomatis berlanjut ke Direktur Operasional.
                      </p>
                      <div className="p-3 rounded-xl bg-white border border-slate-300 text-xs font-mono text-slate-800 space-y-1">
                        <div className="text-blue-700 font-bold">✓ Integritas Passphrase:</div>
                        <div className="text-slate-600">Passphrase terenkripsi diverifikasi sebelum status bergeser ke PR_REVIEWED.</div>
                      </div>
                    </div>
                  )}

                  {simActiveStep === 3 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-950 font-black text-xs border border-purple-300">
                          Status: PR_APPROVED
                        </span>
                        <span className="text-xs font-bold text-slate-600">Otorisasi Anggaran Operasional</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-950 m-0">Persetujuan Direktur Operasional</h4>
                      <p className="text-xs text-slate-700 leading-relaxed m-0">
                        Direktur Operasional <b>{getUserById(procOpsId)?.fullName || 'Direktur Ops'}</b> mengkaji anggaran dan menyetujui pengadaan. Sistem membuka fase komparasi vendor supplier dan otomatis menetapkan dokumen ke Direktur Keuangan.
                      </p>
                      <div className="p-3 rounded-xl bg-white border border-slate-300 text-xs font-mono text-slate-800 space-y-1">
                        <div className="text-indigo-700 font-bold">✓ Izin Komparasi Supplier Terbuka:</div>
                        <div className="text-slate-600">Tim purchasing dapat menginput penawaran hingga 3 vendor pembanding.</div>
                      </div>
                    </div>
                  )}

                  {simActiveStep === 4 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-950 font-black text-xs border border-emerald-300">
                          Status: MUST_PURCHASE (PO Terbit)
                        </span>
                        <span className="text-xs font-bold text-slate-600">Pengesahan PO Mengikat</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-950 m-0">Persetujuan Direktur Keuangan & Terbit PO</h4>
                      <p className="text-xs text-slate-700 leading-relaxed m-0">
                        Direktur Keuangan <b>{getUserById(procFinanceId)?.fullName || 'Direktur Keuangan'}</b> memilih vendor pemenang, memverifikasi total landed cost, memasukkan Passphrase, dan nomor PO resmi diterbitkan secara otomatis.
                      </p>
                      <div className="p-3 rounded-xl bg-white border border-slate-300 text-xs font-mono text-slate-800 space-y-1">
                        <div className="text-emerald-700 font-bold">✓ Dokumen PO Mengikat Resmi:</div>
                        <div className="text-slate-600">Nomor PO terbentuk (contoh: PO-2026-0042) dan siap dicetak / dikirim ke vendor.</div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {simActiveStep === 1 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-950 font-black text-xs border border-teal-300">
                          Status: SPKL_SUBMITTED
                        </span>
                        <span className="text-xs font-bold text-slate-600">Pengajuan Lembur Lapangan</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-950 m-0">Inisiasi Surat Perintah Kerja Lembur</h4>
                      <p className="text-xs text-slate-700 leading-relaxed m-0">
                        Mandor atau admin lapangan menginput daftar pekerja lembur, rincian pekerjaan, dan jam kerja yang direncanakan. Dokumen otomatis diarahkan ke <b>{getUserById(spklSupervisorId)?.fullName || 'Supervisor Lapangan'}</b>.
                      </p>
                    </div>
                  )}

                  {simActiveStep === 2 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-950 font-black text-xs border border-sky-300">
                          Status: SPV_VERIFIED
                        </span>
                        <span className="text-xs font-bold text-slate-600">Verifikasi Fisik Lapangan</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-950 m-0">Verifikasi SPV Lapangan</h4>
                      <p className="text-xs text-slate-700 leading-relaxed m-0">
                        Supervisor <b>{getUserById(spklSupervisorId)?.fullName || 'SPV'}</b> mengecek absensi fisik dan output pekerjaan, lalu menyetujui lembur secara digital.
                      </p>
                    </div>
                  )}

                  {simActiveStep === 3 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-950 font-black text-xs border border-indigo-300">
                          Status: PM_APPROVED
                        </span>
                        <span className="text-xs font-bold text-slate-600">Evaluasi Progress Proyek</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-950 m-0">Persetujuan Project Manager</h4>
                      <p className="text-xs text-slate-700 leading-relaxed m-0">
                        PM <b>{getUserById(spklPmId)?.fullName || 'Project Manager'}</b> mengevaluasi urgensi lembur terhadap target kurva S dan menyetujui pengalokasian jam kerja.
                      </p>
                    </div>
                  )}

                  {simActiveStep === 4 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-950 font-black text-xs border border-emerald-300">
                          Status: FINANCE_VERIFIED & SYNCED
                        </span>
                        <span className="text-xs font-bold text-slate-600">Sinkronisasi Slip Gaji Payroll</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-950 m-0">Verifikasi Keuangan & Payroll</h4>
                      <p className="text-xs text-slate-700 leading-relaxed m-0">
                        Keuangan <b>{getUserById(spklFinanceId)?.fullName || 'Direktur Keuangan'}</b> memverifikasi tarif lembur PP 35/2021 dan menyetujui pencairan upah lembur langsung ke slip gaji.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Navigation buttons between steps (Responsive) */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-300 gap-2">
                <button
                  type="button"
                  disabled={simActiveStep === 1}
                  onClick={() => setSimActiveStep((prev) => Math.max(1, prev - 1))}
                  className="min-h-[40px] px-3.5 sm:px-4 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 disabled:opacity-40 cursor-pointer shadow-2xs"
                >
                  ← <span className="hidden sm:inline">Sebelumnya</span>
                </button>
                <div className="text-xs font-black text-slate-700 font-mono">
                  Langkah {simActiveStep} / 4
                </div>
                <button
                  type="button"
                  disabled={simActiveStep === 4}
                  onClick={() => setSimActiveStep((prev) => Math.min(4, prev + 1))}
                  className="min-h-[40px] px-3.5 sm:px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-bold disabled:opacity-40 cursor-pointer shadow-xs"
                >
                  <span className="hidden sm:inline">Berikutnya</span> →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 4: AUTHORIZER DIRECTORY (Responsive Table + Mobile Cards) ──       */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          {/* Filter Bar & Search */}
          <div className="p-3.5 sm:p-5 rounded-2xl bg-white border-2 border-slate-300 shadow-xs space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-blue-700" />
                  <h3 className="text-sm sm:text-base font-black text-slate-950 m-0">
                    Direktori Personel Otorisasi & Kredensial
                  </h3>
                </div>
                <p className="text-xs text-slate-600 m-0 mt-0.5">
                  Matriks kualifikasi seluruh pejabat, direksi, pengawas, dan verifikator di sistem MTERP.
                </p>
              </div>

              <div className="text-[11px] font-bold text-slate-500 self-start sm:self-auto">
                Total: <span className="text-slate-950 font-black">{filteredUsers.length}</span> personel
              </div>
            </div>

            {/* Department Filter Chips (Horizontal Scroll on Mobile) */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
              <button
                type="button"
                onClick={() => setDepartmentFilter('all')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border-2 shrink-0 ${
                  departmentFilter === 'all'
                    ? 'bg-slate-950 text-white border-slate-950 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Semua ({departmentCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setDepartmentFilter('director')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border-2 shrink-0 ${
                  departmentFilter === 'director'
                    ? 'bg-slate-950 text-white border-slate-950 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Direksi ({departmentCounts.director})
              </button>
              <button
                type="button"
                onClick={() => setDepartmentFilter('ops')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border-2 shrink-0 ${
                  departmentFilter === 'ops'
                    ? 'bg-slate-950 text-white border-slate-950 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Operasional ({departmentCounts.ops})
              </button>
              <button
                type="button"
                onClick={() => setDepartmentFilter('finance')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border-2 shrink-0 ${
                  departmentFilter === 'finance'
                    ? 'bg-slate-950 text-white border-slate-950 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Keuangan ({departmentCounts.finance})
              </button>
              <button
                type="button"
                onClick={() => setDepartmentFilter('project')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border-2 shrink-0 ${
                  departmentFilter === 'project'
                    ? 'bg-slate-950 text-white border-slate-950 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Proyek ({departmentCounts.project})
              </button>
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-3.5 text-slate-500" />
              <input
                type="text"
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                placeholder="Cari nama, role, posisi, no. telp, email..."
                className="w-full min-h-[44px] pl-10 pr-12 py-2.5 text-xs sm:text-sm font-semibold rounded-xl border-2 border-slate-300 bg-white text-slate-950 placeholder-slate-400 focus:outline-none focus:border-slate-950 shadow-2xs"
              />
              {directorySearch && (
                <button
                  type="button"
                  onClick={() => setDirectorySearch('')}
                  className="absolute right-3 top-3 text-xs font-bold text-slate-400 hover:text-slate-800 cursor-pointer min-h-[32px] px-1"
                >
                  Hapus
                </button>
              )}
            </div>
          </div>

          {/* ── View 1: Mobile Persona Cards (Visible on screens < 768px) ── */}
          <div className="block md:hidden space-y-3">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border-2 border-slate-300">
                <Users size={32} className="mx-auto text-slate-300 mb-2" />
                <div className="text-xs font-bold">Tidak ada personel yang sesuai kriteria pencarian.</div>
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isProcReviewer = (configData?.candidates?.procurement?.reviewers || []).some((c) => c._id === u._id);
                const isProcOps = (configData?.candidates?.procurement?.opsApprovers || []).some((c) => c._id === u._id);
                const isProcFinance = (configData?.candidates?.procurement?.financeApprovers || []).some((c) => c._id === u._id);
                const isSpklSpv = (configData?.candidates?.spkl?.supervisors || []).some((c) => c._id === u._id);
                const isSpklPm = (configData?.candidates?.spkl?.projectManagers || []).some((c) => c._id === u._id);
                const isSpklFin = (configData?.candidates?.spkl?.financeVerifiers || []).some((c) => c._id === u._id);
                const waLink = getWhatsAppLink(u.phone, u.fullName, 'Approver');

                return (
                  <div key={u._id} className="p-4 rounded-xl bg-white border-2 border-slate-300 shadow-xs space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-slate-950 text-white font-black text-xs flex items-center justify-center shrink-0 border border-slate-800">
                          {u.fullName
                            .split(' ')
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="font-black text-slate-950 text-xs">{u.fullName}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[170px]" title={u.email}>
                            {u.email || 'Tanpa email'}
                          </div>
                        </div>
                      </div>

                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-slate-200 text-slate-950 border border-slate-300 shrink-0">
                        {u.role}
                      </span>
                    </div>

                    {/* Department & Position */}
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] flex items-center justify-between">
                      <span className="text-slate-600 font-medium">Jabatan:</span>
                      <span className="font-bold text-slate-950">{u.position || '-'} • {u.department || 'Operasional'}</span>
                    </div>

                    {/* Contact & WA */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Phone size={12} className="text-slate-500" />
                        <span className="font-mono text-xs font-bold text-slate-950">{u.phone || '-'}</span>
                        {u.phone && (
                          <button
                            type="button"
                            onClick={() => handleCopy(u.phone || '', u._id)}
                            className="p-1 rounded text-slate-400 hover:text-slate-800"
                            title="Salin No Telp"
                          >
                            {copiedItem === u._id ? <CheckCheck size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          </button>
                        )}
                      </div>

                      {waLink && (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 shrink-0"
                        >
                          <MessageSquare size={12} />
                          <span>Chat WA</span>
                        </a>
                      )}
                    </div>

                    {/* Authorization Tags */}
                    <div className="pt-2 border-t border-slate-100 flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] font-bold text-slate-500 mr-1">Wewenang:</span>
                      {isProcReviewer && <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-100 text-blue-900 border border-blue-300">QC PR</span>}
                      {isProcOps && <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-100 text-indigo-900 border border-indigo-300">Ops PR</span>}
                      {isProcFinance && <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-100 text-purple-900 border border-purple-300">Finance PO</span>}
                      {isSpklSpv && <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-teal-100 text-teal-900 border border-teal-300">SPV SPKL</span>}
                      {isSpklPm && <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-sky-100 text-sky-900 border border-sky-300">PM SPKL</span>}
                      {isSpklFin && <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">Finance SPKL</span>}
                      {!isProcReviewer && !isProcOps && !isProcFinance && !isSpklSpv && !isSpklPm && !isSpklFin && (
                        <span className="text-[10px] text-slate-400 italic">User Standar</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── View 2: High-contrast Desktop ERP Table (Visible on screens >= 768px) ── */}
          <div className="hidden md:block bg-white border-2 border-slate-300 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-white border-b-2 border-slate-950 text-[11px] font-black uppercase tracking-wider select-none">
                    <th className="py-3 px-3 w-12 text-center text-slate-300">#</th>
                    <th className="py-3 px-3 text-left">Nama & Identitas Personel</th>
                    <th className="py-3 px-3 text-left">Role Sistem</th>
                    <th className="py-3 px-3 text-left">Jabatan & Departemen</th>
                    <th className="py-3 px-3 text-left">Kontak & Hubungi</th>
                    <th className="py-3 px-3 text-right">Kelayakan Otorisasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 font-bold">
                        <Users size={32} className="mx-auto text-slate-300 mb-2" />
                        <div>Tidak ada personel yang sesuai kriteria pencarian "{directorySearch}".</div>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u, idx) => {
                      const isProcReviewer = (configData?.candidates?.procurement?.reviewers || []).some((c) => c._id === u._id);
                      const isProcOps = (configData?.candidates?.procurement?.opsApprovers || []).some((c) => c._id === u._id);
                      const isProcFinance = (configData?.candidates?.procurement?.financeApprovers || []).some((c) => c._id === u._id);
                      const isSpklSpv = (configData?.candidates?.spkl?.supervisors || []).some((c) => c._id === u._id);
                      const isSpklPm = (configData?.candidates?.spkl?.projectManagers || []).some((c) => c._id === u._id);
                      const isSpklFin = (configData?.candidates?.spkl?.financeVerifiers || []).some((c) => c._id === u._id);

                      const waLink = getWhatsAppLink(u.phone, u.fullName, 'Approver');

                      return (
                        <tr key={u._id} className="hover:bg-amber-50/50 even:bg-slate-50/60 odd:bg-white transition-colors">
                          <td className="py-3 px-3 text-center text-slate-600 font-mono font-bold">{idx + 1}</td>
                          <td className="py-3 px-3 text-left">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-slate-950 text-white font-black text-xs flex items-center justify-center shrink-0 border border-slate-700">
                                {u.fullName
                                  .split(' ')
                                  .slice(0, 2)
                                  .map((n) => n[0])
                                  .join('')
                                  .toUpperCase()}
                              </div>
                              <div>
                                <div className="font-black text-slate-950 text-xs">{u.fullName}</div>
                                <div className="text-[10px] text-slate-500 font-medium truncate max-w-[200px]" title={u.email}>
                                  {u.email || 'Tanpa email'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-left">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-slate-200 text-slate-950 border border-slate-300">
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-left">
                            <div className="font-bold text-slate-900 text-xs">{u.position || '-'}</div>
                            <div className="text-[10px] text-slate-600 font-medium">{u.department || 'Operasional'}</div>
                          </td>
                          <td className="py-3 px-3 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-slate-950 font-bold text-xs">{u.phone || '-'}</span>
                              {u.phone && (
                                <button
                                  type="button"
                                  onClick={() => handleCopy(u.phone || '', u._id)}
                                  className="text-slate-400 hover:text-slate-800 p-1 rounded hover:bg-slate-200 cursor-pointer transition-colors"
                                  title="Salin Nomor Telp"
                                >
                                  {copiedItem === u._id ? <CheckCheck size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                </button>
                              )}
                              {waLink && (
                                <a
                                  href={waLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors cursor-pointer"
                                  title="Chat WhatsApp Langsung"
                                >
                                  <MessageSquare size={12} />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              {isProcReviewer && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-100 text-blue-900 border border-blue-300">
                                  QC PR
                                </span>
                              )}
                              {isProcOps && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-100 text-indigo-900 border border-indigo-300">
                                  Ops PR
                                </span>
                              )}
                              {isProcFinance && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-100 text-purple-900 border border-purple-300">
                                  Finance PO
                                </span>
                              )}
                              {isSpklSpv && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-teal-100 text-teal-900 border border-teal-300">
                                  SPV SPKL
                                </span>
                              )}
                              {isSpklPm && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-sky-100 text-sky-900 border border-sky-300">
                                  PM SPKL
                                </span>
                              )}
                              {isSpklFin && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                                  Finance SPKL
                                </span>
                              )}
                              {!isProcReviewer && !isProcOps && !isProcFinance && !isSpklSpv && !isSpklPm && !isSpklFin && (
                                <span className="text-[10px] text-slate-400 italic">User Standar</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-slate-100 border-t-2 border-slate-300 text-xs text-slate-700 font-bold flex flex-col sm:flex-row items-center justify-between gap-2">
              <span>
                Menampilkan <strong className="text-slate-950 font-black">{filteredUsers.length}</strong> dari total{' '}
                <strong className="text-slate-950 font-black">{configData?.candidates?.allUsers?.length || 0}</strong> personel terdaftar
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Kualifikasi otorisasi dievaluasi otomatis berdasarkan role sistem per pengguna
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
