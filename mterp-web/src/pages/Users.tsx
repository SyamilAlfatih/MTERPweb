import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AxiosError } from 'axios';
import { 
  Users as UsersIcon, 
  Search, 
  Filter, 
  ShieldAlert, 
  CheckCircle, 
  Trash2, 
  Edit, 
  UserPlus, 
  ChevronDown, 
  X,
  Download,
  Upload,
  Key,
  Copy,
  Plus,
  Table as TableIcon,
  LayoutGrid,
  Phone,
  Calendar,
  Layers,
  Check,
  Briefcase,
  AlertCircle,
  FileSpreadsheet,
  FileText,
  ChevronUp,
  Code,
  ArrowUpDown,
  ArrowDownAZ,
  ArrowUpAZ,
  GraduationCap,
  Award,
  Eye,
  RotateCcw,
  ShieldCheck,
  HeartHandshake,
  Columns3,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { 
  getUsers, 
  createUser, 
  updateUser, 
  updateUserRole, 
  verifyUserManually, 
  deleteUser,
  exportUsersExcel,
  exportUsersCsv,
  downloadImportTemplate,
  importUsers,
  bulkCreateUsers,
  getApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey
} from '../api/api';
import { User, ApiKey, EmploymentType } from '../types';
import { Card } from '../components/shared';
import { PhotoView } from 'react-photo-view';
import { getImageUrl } from '../utils/image';
import { LiveDocumentViewer, ViewerDocument } from '../components/users/LiveDocumentViewer';
import { UserPortfolioModal } from '../components/users/UserPortfolioModal';

const ROLE_OPTIONS = [
  { value: 'worker', label: 'Worker' },
  { value: 'tukang', label: 'Tukang' },
  { value: 'helper', label: 'Helper' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'site_manager', label: 'Site Manager' },
  { value: 'foreman', label: 'Foreman' },
  { value: 'asset_admin', label: 'Asset Admin' },
  { value: 'admin_project', label: 'Admin Project' },
  { value: 'director', label: 'Director' },
  { value: 'president_director', label: 'President Director' },
  { value: 'operational_director', label: 'Operational Director' },
  { value: 'owner', label: 'Owner' },
];

const EDUCATION_LEVEL_OPTIONS = [
  { value: 'SD', label: 'SD' },
  { value: 'SMP', label: 'SMP' },
  { value: 'SMA/SMK', label: 'SMA / SMK' },
  { value: 'D1', label: 'D1' },
  { value: 'D2', label: 'D2' },
  { value: 'D3', label: 'D3' },
  { value: 'D4/S1', label: 'D4 / S1 (Sarjana)' },
  { value: 'S2', label: 'S2 (Magister)' },
  { value: 'S3', label: 'S3 (Doktor)' },
  { value: 'Lainnya', label: 'Lainnya' },
];

const EMPLOYMENT_TYPE_OPTIONS: { value: EmploymentType; label: string; bg: string; text: string; border: string }[] = [
  { value: 'tetap', label: 'Tetap (Permanent)', bg: 'bg-emerald-500/10', text: 'text-emerald-700', border: 'border-emerald-500/30' },
  { value: 'kontrak', label: 'Kontrak (Contract)', bg: 'bg-blue-500/10', text: 'text-blue-700', border: 'border-blue-500/30' },
  { value: 'harian_lepas', label: 'Harian Lepas (Daily)', bg: 'bg-amber-500/10', text: 'text-amber-700', border: 'border-amber-500/30' },
  { value: 'magang', label: 'Magang (Internship)', bg: 'bg-purple-500/10', text: 'text-purple-700', border: 'border-purple-500/30' },
];

const EXPORTABLE_COLUMNS = [
  { key: 'no', label: 'Nomor (No)' },
  { key: 'fullName', label: 'Nama Lengkap (Full Name)' },
  { key: 'username', label: 'Username' },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role / Peran' },
  { key: 'position', label: 'Jabatan (Position)' },
  { key: 'employmentType', label: 'Status Kerja (Employment Type)' },
  { key: 'bpjsTk', label: 'BPJS Ketenagakerjaan (TK)' },
  { key: 'bpjsKesehatan', label: 'BPJS Kesehatan' },
  { key: 'latestEducation', label: 'Pendidikan Terakhir (Education)' },
  { key: 'competencies', label: 'Sertifikasi / Kompetensi (Certificates)' },
  { key: 'contractStartDate', label: 'Mulai Kontrak (Contract Start)' },
  { key: 'contractEndDate', label: 'Akhir Kontrak (Contract End)' },
  { key: 'phone', label: 'Nomor Telepon (Phone)' },
  { key: 'address', label: 'Alamat (Address)' },
  { key: 'emergencyContactName', label: 'Kontak Darurat - Nama' },
  { key: 'emergencyContactPhone', label: 'Kontak Darurat - No HP' },
  { key: 'emergencyContactRelationship', label: 'Kontak Darurat - Hubungan' },
  { key: 'bankAccount', label: 'Rekening Bank (Bank Account)' },
  { key: 'bankPlatform', label: 'Nama Bank (Bank Platform)' },
  { key: 'accountName', label: 'Nama Pemilik Rekening' },
  { key: 'isVerified', label: 'Status Verifikasi (Verified)' },
  { key: 'createdAt', label: 'Tanggal Dibuat (Created At)' },
];

type TableDensity = 'compact' | 'normal' | 'comfortable';

interface DataTableColumn {
  id: string;
  label: string;
  minWidth: string;
}

const DATA_TABLE_COLUMNS: DataTableColumn[] = [
  { id: 'role', label: 'Role & Jabatan', minWidth: 'min-w-[140px]' },
  { id: 'employment', label: 'Status Kerja', minWidth: 'min-w-[150px]' },
  { id: 'bpjsTk', label: 'BPJS TK', minWidth: 'min-w-[160px]' },
  { id: 'bpjsKes', label: 'BPJS Kesehatan', minWidth: 'min-w-[160px]' },
  { id: 'education', label: 'Pendidikan Terakhir', minWidth: 'min-w-[180px]' },
  { id: 'competencies', label: 'Kompetensi & Sertifikasi', minWidth: 'min-w-[220px]' },
  { id: 'emergency', label: 'Kontak Darurat', minWidth: 'min-w-[180px]' },
  { id: 'contact', label: 'Telepon / Email', minWidth: 'min-w-[170px]' },
  { id: 'verification', label: 'Verifikasi', minWidth: 'min-w-[120px]' },
];

const DENSITY_CONFIG = {
  compact: {
    th: 'py-2 px-3 text-xs',
    td: 'py-2 px-3 text-xs',
    avatar: 'w-7 h-7 text-xs',
    subText: 'text-[10px]',
  },
  normal: {
    th: 'py-3 px-3.5 text-xs',
    td: 'py-2.5 px-3.5 text-xs',
    avatar: 'w-8 h-8 text-xs',
    subText: 'text-[11px]',
  },
  comfortable: {
    th: 'py-3.5 px-4 text-xs',
    td: 'py-3.5 px-4 text-sm',
    avatar: 'w-9 h-9 text-sm',
    subText: 'text-xs',
  },
};

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [employmentFilter, setEmploymentFilter] = useState('');
  const [educationFilter, setEducationFilter] = useState('');
  const [competencyFilter, setCompetencyFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'newest' | 'oldest'>('name-asc');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  // Enterprise Table UX States
  const [tableDensity, setTableDensity] = useState<TableDensity>('normal');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);
  const columnDropdownRef = useRef<HTMLDivElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    role: true,
    employment: true,
    bpjsTk: true,
    bpjsKes: true,
    education: true,
    competencies: true,
    emergency: true,
    contact: true,
    verification: true,
  });

  // Portfolio & Live Document Viewer state
  const [portfolioModalUser, setPortfolioModalUser] = useState<User | null>(null);
  const [portfolioModalTab, setPortfolioModalTab] = useState<'education' | 'competencies'>('education');
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerDocs, setViewerDocs] = useState<ViewerDocument[]>([]);
  const [viewerInitialIdx, setViewerInitialIdx] = useState(0);
  const [viewerUserName, setViewerUserName] = useState('');

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isApiKeysOpen, setIsApiKeysOpen] = useState(false);
  const [isApiKeysLoading, setIsApiKeysLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreateKeyModalOpen, setIsCreateKeyModalOpen] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState<ApiKey | null>(null);
  const [hasCopiedKey, setHasCopiedKey] = useState(false);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditRoleModalOpen, setIsEditRoleModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Single New User Form State
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    fullName: '',
    password: '',
    role: 'worker',
    position: '',
    employmentType: 'tetap' as EmploymentType,
    contractStartDate: '',
    contractEndDate: '',
    phone: '',
    address: '',
    bpjsTk: '',
    bpjsKesehatan: '',
    emergencyContact: {
      name: '',
      phone: '',
      relationship: '',
    },
    education: {
      level: '',
      institution: '',
      major: '',
      graduationYear: '',
    },
  });

  // Edit User Form State
  const [editFormData, setEditFormData] = useState({
    fullName: '',
    position: '',
    phone: '',
    address: '',
    employmentType: 'tetap' as EmploymentType,
    contractStartDate: '',
    contractEndDate: '',
    bpjsTk: '',
    bpjsKesehatan: '',
    emergencyContact: {
      name: '',
      phone: '',
      relationship: '',
    },
    education: {
      level: '',
      institution: '',
      major: '',
      graduationYear: '',
    },
  });

  // Edit Role State
  const [editRole, setEditRole] = useState('');

  // Export State
  const [selectedColumns, setSelectedColumns] = useState<string[]>(EXPORTABLE_COLUMNS.map(c => c.key));
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Import State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    msg?: string;
    createdCount?: number;
    failedCount?: number;
    errors?: Array<{ row?: number; error?: string }>;
  } | null>(null);

  // Quick Add (Bulk) State
  const [bulkRows, setBulkRows] = useState<Array<{
    fullName: string;
    username: string;
    email: string;
    password: string;
    role: string;
    employmentType: EmploymentType;
    position: string;
    phone: string;
    bpjsTk: string;
    bpjsKesehatan: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    emergencyContactRel: string;
  }>>([
    {
      fullName: '',
      username: '',
      email: '',
      password: '',
      role: 'worker',
      employmentType: 'tetap',
      position: '',
      phone: '',
      bpjsTk: '',
      bpjsKesehatan: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRel: '',
    },
  ]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    createdCount: number;
    failedCount: number;
    errors: Array<{ index: number; error: string }>;
  } | null>(null);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users', error);
      alert('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchApiKeys = async () => {
    try {
      setIsApiKeysLoading(true);
      const data = await getApiKeys();
      setApiKeys(data);
    } catch (error) {
      console.error('Failed to load API keys', error);
    } finally {
      setIsApiKeysLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchApiKeys();
  }, []);

  // KPI Summary Statistics
  const stats = useMemo(() => {
    const total = users.length;
    const verified = users.filter(u => u.isVerified).length;
    const certified = users.filter(u => (u.competencies?.length || 0) > 0).length;
    const withProof = users.filter(u => Boolean(u.education?.documentUrl)).length;
    const withBpjs = users.filter(u => Boolean(u.bpjsTk || u.bpjsKesehatan)).length;
    const expiringCerts = users.reduce((acc, u) => {
      const count = (u.competencies || []).filter(c => {
        if (!c.expiryDate) return false;
        const diffDays = Math.ceil((new Date(c.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 60;
      }).length;
      return acc + count;
    }, 0);

    return { total, verified, certified, withProof, withBpjs, expiringCerts };
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users
      .filter(user => {
        const searchLower = searchQuery.toLowerCase().trim();
        const matchesSearch = !searchLower || (
          (user.fullName || '').toLowerCase().includes(searchLower) || 
          user.email?.toLowerCase().includes(searchLower) ||
          user.username.toLowerCase().includes(searchLower) ||
          user.phone?.toLowerCase().includes(searchLower) ||
          user.position?.toLowerCase().includes(searchLower) ||
          (user.bpjsTk || '').toLowerCase().includes(searchLower) ||
          (user.bpjsKesehatan || '').toLowerCase().includes(searchLower) ||
          user.emergencyContact?.name?.toLowerCase().includes(searchLower) ||
          user.education?.institution?.toLowerCase().includes(searchLower) ||
          user.education?.major?.toLowerCase().includes(searchLower) ||
          (user.competencies || []).some(c => 
            c.name.toLowerCase().includes(searchLower) || 
            (c.issuer && c.issuer.toLowerCase().includes(searchLower))
          )
        );
        
        const matchesRole = roleFilter ? user.role === roleFilter : true;
        const matchesEmployment = employmentFilter ? (user.employmentType || 'tetap') === employmentFilter : true;
        const matchesEducation = educationFilter ? user.education?.level === educationFilter : true;

        let matchesCompetency = true;
        if (competencyFilter === 'has_cert') {
          matchesCompetency = (user.competencies?.length || 0) > 0;
        } else if (competencyFilter === 'no_cert') {
          matchesCompetency = !user.competencies || user.competencies.length === 0;
        } else if (competencyFilter === 'expired_cert') {
          matchesCompetency = (user.competencies || []).some(
            c => c.expiryDate && new Date(c.expiryDate) < new Date()
          );
        }
        
        return matchesSearch && matchesRole && matchesEmployment && matchesEducation && matchesCompetency;
      })
      .sort((a, b) => {
        if (sortBy === 'name-asc') {
          return (a.fullName || a.username || '').localeCompare(b.fullName || b.username || '', 'id', { sensitivity: 'base', numeric: true });
        }
        if (sortBy === 'name-desc') {
          return (b.fullName || b.username || '').localeCompare(a.fullName || a.username || '', 'id', { sensitivity: 'base', numeric: true });
        }
        if (sortBy === 'newest') {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        }
        return 0;
      });
  }, [users, searchQuery, roleFilter, employmentFilter, educationFilter, competencyFilter, sortBy]);

  // Reset pagination when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, employmentFilter, educationFilter, competencyFilter, sortBy]);

  // Click-outside listener for Column Visibility dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(event.target as Node)) {
        setIsColumnDropdownOpen(false);
      }
    };
    if (isColumnDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isColumnDropdownOpen]);

  const totalPages = useMemo(() => {
    if (pageSize === -1) return 1;
    return Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  }, [filteredUsers.length, pageSize]);

  const paginatedUsers = useMemo(() => {
    if (pageSize === -1) return filteredUsers;
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages]);

  // Handle Portfolio & Live Viewer Openers
  const handleOpenPortfolio = (user: User, tab: 'education' | 'competencies' = 'education') => {
    setPortfolioModalUser(user);
    setPortfolioModalTab(tab);
  };

  const handleOpenViewerForEducation = (user: User) => {
    const docs: ViewerDocument[] = [];
    if (user.education?.documentUrl) {
      docs.push({
        id: 'edu-proof',
        title: `Ijazah ${user.education.level || ''} ${user.education.major ? '- ' + user.education.major : ''}`,
        type: 'education',
        documentUrl: user.education.documentUrl,
        documentName: user.education.documentName,
        documentSize: user.education.documentSize,
        uploadedAt: user.education.uploadedAt,
        level: user.education.level,
        major: user.education.major,
        issuer: user.education.institution,
        graduationYear: user.education.graduationYear,
      });
    }

    (user.competencies || []).forEach(c => {
      if (c.documentUrl) {
        docs.push({
          id: c._id || c.name,
          title: c.name,
          type: 'competency',
          documentUrl: c.documentUrl,
          documentName: c.documentName,
          documentSize: c.documentSize,
          uploadedAt: c.uploadedAt,
          issuer: c.issuer,
          certificateNumber: c.certificateNumber,
          issueDate: c.issueDate,
          expiryDate: c.expiryDate,
        });
      }
    });

    if (docs.length > 0) {
      setViewerDocs(docs);
      setViewerInitialIdx(0);
      setViewerUserName(user.fullName);
      setIsViewerOpen(true);
    } else {
      handleOpenPortfolio(user, 'education');
    }
  };

  const handleOpenViewerForCertificate = (user: User, certId?: string) => {
    const docs: ViewerDocument[] = [];
    if (user.education?.documentUrl) {
      docs.push({
        id: 'edu-proof',
        title: `Ijazah ${user.education.level || ''} ${user.education.major ? '- ' + user.education.major : ''}`,
        type: 'education',
        documentUrl: user.education.documentUrl,
        documentName: user.education.documentName,
        documentSize: user.education.documentSize,
        uploadedAt: user.education.uploadedAt,
        level: user.education.level,
        major: user.education.major,
        issuer: user.education.institution,
        graduationYear: user.education.graduationYear,
      });
    }

    let targetIdx = 0;
    (user.competencies || []).forEach(c => {
      if (c.documentUrl) {
        if (c._id === certId) {
          targetIdx = docs.length;
        }
        docs.push({
          id: c._id || c.name,
          title: c.name,
          type: 'competency',
          documentUrl: c.documentUrl,
          documentName: c.documentName,
          documentSize: c.documentSize,
          uploadedAt: c.uploadedAt,
          issuer: c.issuer,
          certificateNumber: c.certificateNumber,
          issueDate: c.issueDate,
          expiryDate: c.expiryDate,
        });
      }
    });

    if (docs.length > 0) {
      setViewerDocs(docs);
      setViewerInitialIdx(targetIdx);
      setViewerUserName(user.fullName);
      setIsViewerOpen(true);
    } else {
      handleOpenPortfolio(user, 'competencies');
    }
  };

  // Handle single user creation
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser(newUser);
      setIsAddModalOpen(false);
      setNewUser({
        username: '',
        email: '',
        fullName: '',
        password: '',
        role: 'worker',
        position: '',
        employmentType: 'tetap',
        contractStartDate: '',
        contractEndDate: '',
        phone: '',
        address: '',
        bpjsTk: '',
        bpjsKesehatan: '',
        emergencyContact: { name: '', phone: '', relationship: '' },
        education: { level: '', institution: '', major: '', graduationYear: '' },
      });
      fetchUsers();
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        alert(error.response?.data?.msg || 'Failed to create user');
      } else {
        alert('An unexpected error occurred');
      }
    }
  };

  // Handle edit user profile
  const handleOpenEditUser = (user: User) => {
    setSelectedUser(user);
    setEditFormData({
      fullName: user.fullName || '',
      position: user.position || '',
      phone: user.phone || '',
      address: user.address || '',
      employmentType: (user.employmentType as EmploymentType) || 'tetap',
      contractStartDate: user.contractStartDate ? user.contractStartDate.slice(0, 10) : '',
      contractEndDate: user.contractEndDate ? user.contractEndDate.slice(0, 10) : '',
      bpjsTk: user.bpjsTk || '',
      bpjsKesehatan: user.bpjsKesehatan || '',
      emergencyContact: {
        name: user.emergencyContact?.name || '',
        phone: user.emergencyContact?.phone || '',
        relationship: user.emergencyContact?.relationship || '',
      },
      education: {
        level: user.education?.level || '',
        institution: user.education?.institution || '',
        major: user.education?.major || '',
        graduationYear: user.education?.graduationYear || '',
      },
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser?._id) return;
    try {
      await updateUser(selectedUser._id, editFormData);
      setIsEditModalOpen(false);
      fetchUsers();
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        alert(error.response?.data?.msg || 'Failed to update user profile');
      } else {
        alert('An unexpected error occurred');
      }
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      try {
        await deleteUser(id);
        fetchUsers();
      } catch (error: unknown) {
        if (error instanceof AxiosError) {
          alert(error.response?.data?.msg || 'Failed to delete user');
        } else {
          alert('An unexpected error occurred');
        }
      }
    }
  };

  const handleVerifyUser = async (id: string) => {
    if (window.confirm('Bypass email verification for this user?')) {
      try {
        await verifyUserManually(id);
        fetchUsers();
      } catch (error: unknown) {
        if (error instanceof AxiosError) {
          alert(error.response?.data?.msg || 'Failed to verify user');
        } else {
          alert('An unexpected error occurred');
        }
      }
    }
  };

  const handleOpenEditRole = (user: User) => {
    setSelectedUser(user);
    setEditRole(user.role);
    setIsEditRoleModalOpen(true);
  };

  const handleSaveRole = async () => {
    if (!selectedUser?._id) return;
    try {
      await updateUserRole(selectedUser._id, editRole);
      setIsEditRoleModalOpen(false);
      fetchUsers();
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        alert(error.response?.data?.msg || 'Failed to update role');
      } else {
        alert('An unexpected error occurred');
      }
    }
  };

  // Export handlers
  const handleExport = async (format: 'excel' | 'csv') => {
    try {
      setIsExporting(true);
      if (format === 'excel') {
        await exportUsersExcel(selectedColumns, includeHeaders);
      } else {
        await exportUsersCsv(selectedColumns, includeHeaders);
      }
      setIsExportModalOpen(false);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data');
    } finally {
      setIsExporting(false);
    }
  };

  const toggleColumnSelection = (key: string) => {
    if (selectedColumns.includes(key)) {
      if (selectedColumns.length > 1) {
        setSelectedColumns(selectedColumns.filter(k => k !== key));
      }
    } else {
      setSelectedColumns([...selectedColumns, key]);
    }
  };

  // Import handler
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;
    try {
      setIsImporting(true);
      setImportResult(null);
      const res = await importUsers(importFile);
      setImportResult(res);
      fetchUsers();
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        setImportResult({
          msg: error.response?.data?.msg || 'Gagal mengimpor file',
          errors: error.response?.data?.errors || [],
          failedCount: error.response?.data?.errors?.length || 1,
        });
      } else {
        alert('Unexpected import error');
      }
    } finally {
      setIsImporting(false);
    }
  };

  // Quick Add (Bulk) functions
  const addBulkRow = () => {
    setBulkRows([
      ...bulkRows,
      {
        fullName: '',
        username: '',
        email: '',
        password: '',
        role: 'worker',
        employmentType: 'tetap',
        position: '',
        phone: '',
        bpjsTk: '',
        bpjsKesehatan: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        emergencyContactRel: '',
      },
    ]);
  };

  const removeBulkRow = (index: number) => {
    if (bulkRows.length <= 1) return;
    setBulkRows(bulkRows.filter((_, idx) => idx !== index));
  };

  const updateBulkRow = (index: number, field: string, value: string) => {
    const updated = [...bulkRows];
    updated[index] = { ...updated[index], [field]: value };
    setBulkRows(updated);
  };

  const autoGenerateUsernames = () => {
    const updated = bulkRows.map(row => {
      if (!row.fullName.trim()) return row;
      const clean = row.fullName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '.');
      const suffix = Math.floor(100 + Math.random() * 900);
      const autoUsername = row.username || `${clean}${suffix}`;
      const autoEmail = row.email || `${clean}@mterp.com`;
      return { ...row, username: autoUsername, email: autoEmail };
    });
    setBulkRows(updated);
  };

  const autoGeneratePasswords = () => {
    const updated = bulkRows.map(row => {
      const randomPass = 'Mterp' + Math.floor(1000 + Math.random() * 9000) + '!';
      return { ...row, password: row.password || randomPass };
    });
    setBulkRows(updated);
  };

  const handleBulkSubmit = async () => {
    try {
      setIsBulkSubmitting(true);
      setBulkResult(null);

      const payload = bulkRows.map(r => ({
        fullName: r.fullName,
        username: r.username,
        email: r.email,
        password: r.password,
        role: r.role,
        employmentType: r.employmentType,
        position: r.position,
        phone: r.phone,
        bpjsTk: r.bpjsTk,
        bpjsKesehatan: r.bpjsKesehatan,
        emergencyContact: {
          name: r.emergencyContactName,
          phone: r.emergencyContactPhone,
          relationship: r.emergencyContactRel,
        },
      }));

      const res = await bulkCreateUsers(payload);
      setBulkResult(res);
      if (res.createdCount > 0) {
        fetchUsers();
      }
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        alert(error.response?.data?.msg || 'Failed to submit bulk users');
      } else {
        alert('An unexpected error occurred during bulk create');
      }
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  // API Key handlers
  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    try {
      const res = await createApiKey(newKeyName.trim());
      setCreatedKeyData(res);
      setNewKeyName('');
      setIsCreateKeyModalOpen(false);
      fetchApiKeys();
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        alert(error.response?.data?.msg || 'Failed to create API key');
      } else {
        alert('An unexpected error occurred');
      }
    }
  };

  const handleToggleKeyActive = async (key: ApiKey) => {
    try {
      await updateApiKey(key._id, { isActive: !key.isActive });
      fetchApiKeys();
    } catch (error) {
      console.error('Toggle key error:', error);
      alert('Failed to update API key');
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (window.confirm('Delete this API Key? External applications using it will lose access immediately.')) {
      try {
        await deleteApiKey(id);
        fetchApiKeys();
      } catch (error) {
        console.error('Delete key error:', error);
        alert('Failed to delete API key');
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setHasCopiedKey(true);
    setTimeout(() => setHasCopiedKey(false), 2500);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto max-lg:p-4 max-sm:p-3 animate-fade-in space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-bg-white p-6 rounded-2xl border-2 border-border-light shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-13 h-13 rounded-2xl bg-primary-bg flex items-center justify-center shadow-inner shrink-0 border border-primary/20">
            <UsersIcon size={28} className="text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-text-primary m-0 tracking-tight uppercase">
                Database Pekerja & Users
              </h1>
              <span className="bg-primary text-white text-[11px] font-black px-2.5 py-0.5 rounded-full">
                {users.length} Total
              </span>
            </div>
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider block mt-0.5">
              Kelola data tenaga kerja, kontak darurat, impor/ekspor data & akses API eksternal
            </span>
          </div>
        </div>

        {/* Action Button Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Quick Add (Bulk) */}
          <button 
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all shadow-md shadow-emerald-700/20 hover:-translate-y-0.5 active:scale-95 flex-1 sm:flex-initial"
            onClick={() => {
              setBulkResult(null);
              setIsQuickAddModalOpen(true);
            }}
            title="Tambah Banyak Pekerja Sekaligus"
          >
            <Layers size={16} strokeWidth={2.5} />
            <span>Quick Add (Bulk)</span>
          </button>

          {/* Add User (Single) */}
          <button 
            className="flex items-center justify-center gap-2 bg-primary text-white py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all shadow-md shadow-primary/20 hover:-translate-y-0.5 active:scale-95 flex-1 sm:flex-initial"
            onClick={() => setIsAddModalOpen(true)}
          >
            <UserPlus size={16} strokeWidth={2.5} />
            <span>+ Pekerja Baru</span>
          </button>

          {/* Export Button */}
          <button 
            className="flex items-center justify-center gap-2 bg-bg-secondary hover:bg-border-light text-text-primary border-2 border-border-light py-2.5 px-3.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all active:scale-95"
            onClick={() => setIsExportModalOpen(true)}
            title="Ekspor ke Excel atau CSV"
          >
            <Download size={16} strokeWidth={2.5} />
            <span>Ekspor</span>
          </button>

          {/* Import Button */}
          <button 
            className="flex items-center justify-center gap-2 bg-bg-secondary hover:bg-border-light text-text-primary border-2 border-border-light py-2.5 px-3.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all active:scale-95"
            onClick={() => {
              setImportResult(null);
              setImportFile(null);
              setIsImportModalOpen(true);
            }}
            title="Impor dari file Excel atau CSV"
          >
            <Upload size={16} strokeWidth={2.5} />
            <span>Impor</span>
          </button>

          {/* External API Access Shortcut */}
          <button 
            className={`flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all border-2 ${
              isApiKeysOpen 
                ? 'bg-primary text-white border-primary shadow-sm' 
                : 'bg-bg-secondary hover:bg-border-light text-text-primary border-border-light'
            }`}
            onClick={() => setIsApiKeysOpen(!isApiKeysOpen)}
            title="Buka panel API Key untuk integrasi aplikasi pihak ketiga"
          >
            <Key size={16} strokeWidth={2.5} />
            <span>API Keys</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 text-current font-bold">
              {apiKeys.length}
            </span>
          </button>
        </div>
      </div>

      {/* Modern KPI Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="!p-4 border-2 border-border-light flex items-center justify-between shadow-xs bg-bg-white hover:border-primary/30 transition-all">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-text-muted">Total Tenaga Kerja</div>
            <div className="text-2xl font-black text-text-primary mt-1 tracking-tight">{stats.total}</div>
            <div className="text-[11px] font-bold text-text-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-emerald-600">{users.filter(u => (u.employmentType || 'tetap') === 'tetap').length} Tetap</span>
              <span>•</span>
              <span className="text-blue-600">{users.filter(u => u.employmentType === 'kontrak').length} Kontrak</span>
              <span>•</span>
              <span className="text-teal-600">{stats.withBpjs} BPJS</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-500/20 shrink-0">
            <UsersIcon size={24} />
          </div>
        </Card>

        <Card className="!p-4 border-2 border-border-light flex items-center justify-between shadow-xs bg-bg-white hover:border-success/30 transition-all">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-text-muted">Status Terverifikasi</div>
            <div className="text-2xl font-black text-emerald-600 mt-1 tracking-tight">{stats.verified}</div>
            <div className="text-[11px] font-bold text-text-muted mt-0.5">
              {stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0}% Akun Terverifikasi
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20 shrink-0">
            <CheckCircle size={24} />
          </div>
        </Card>

        <Card className="!p-4 border-2 border-border-light flex items-center justify-between shadow-xs bg-bg-white hover:border-primary/30 transition-all">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-text-muted">Tersertifikasi (Kompetensi)</div>
            <div className="text-2xl font-black text-primary mt-1 tracking-tight">{stats.certified}</div>
            <div className="text-[11px] font-bold text-primary mt-0.5 flex items-center gap-1">
              <Award size={13} />
              <span>{stats.total > 0 ? Math.round((stats.certified / stats.total) * 100) : 0}% Memiliki Lisensi</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0">
            <Award size={24} />
          </div>
        </Card>

        <Card className="!p-4 border-2 border-border-light flex items-center justify-between shadow-xs bg-bg-white hover:border-indigo-500/30 transition-all">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-text-muted">Bukti Ijazah Terunggah</div>
            <div className="text-2xl font-black text-indigo-600 mt-1 tracking-tight">{stats.withProof}</div>
            <div className="text-[11px] font-bold text-text-muted mt-0.5 flex items-center gap-1">
              <GraduationCap size={13} className="text-indigo-600" />
              <span>{stats.total > 0 ? Math.round((stats.withProof / stats.total) * 100) : 0}% Dokumen Lengkap</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center border border-indigo-500/20 shrink-0">
            <GraduationCap size={24} />
          </div>
        </Card>
      </div>

      {/* Filters, Search & View Controls */}
      <Card className="!p-5 border-2 border-border-light space-y-4">
        {/* Top Search Bar */}
        <div>
          <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">
            Cari Pekerja (Nama, Username, Posisi, No HP, Jurusan, atau Sertifikasi)
          </label>
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input 
              type="text" 
              placeholder="Ketik nama, telepon, jurusan pendidikan, atau nama sertifikat..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-3 pr-4 pl-11 border-2 border-border-light rounded-xl bg-bg-white text-text-primary text-sm font-bold transition-all outline-none focus:border-primary shadow-xs"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Dropdown Filters & View Mode */}
        <div className="flex flex-wrap gap-3 items-end">
          {/* Filter by Employment Type */}
          <div className="w-full sm:w-[170px]">
            <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Status Kerja</label>
            <div className="relative">
              <Briefcase size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <select 
                value={employmentFilter} 
                onChange={(e) => setEmploymentFilter(e.target.value)}
                className="w-full py-2.5 pr-8 pl-9 border-2 border-border-light rounded-xl bg-bg-white text-text-primary text-xs font-black cursor-pointer appearance-none transition-all outline-none focus:border-primary shadow-xs"
              >
                <option value="">Semua Status</option>
                {EMPLOYMENT_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label.split(' ')[0]}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>

          {/* Filter by Role */}
          <div className="w-full sm:w-[170px]">
            <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Role / Peran</label>
            <div className="relative">
              <Filter size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <select 
                value={roleFilter} 
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full py-2.5 pr-8 pl-9 border-2 border-border-light rounded-xl bg-bg-white text-text-primary text-xs font-black cursor-pointer appearance-none transition-all outline-none focus:border-primary shadow-xs"
              >
                <option value="">Semua Role</option>
                {ROLE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>

          {/* Filter by Education */}
          <div className="w-full sm:w-[170px]">
            <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Pendidikan</label>
            <div className="relative">
              <GraduationCap size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <select 
                value={educationFilter} 
                onChange={(e) => setEducationFilter(e.target.value)}
                className="w-full py-2.5 pr-8 pl-9 border-2 border-border-light rounded-xl bg-bg-white text-text-primary text-xs font-black cursor-pointer appearance-none transition-all outline-none focus:border-primary shadow-xs"
              >
                <option value="">Semua Pendidikan</option>
                {EDUCATION_LEVEL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>

          {/* Filter by Competency */}
          <div className="w-full sm:w-[180px]">
            <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Sertifikasi</label>
            <div className="relative">
              <Award size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <select 
                value={competencyFilter} 
                onChange={(e) => setCompetencyFilter(e.target.value)}
                className="w-full py-2.5 pr-8 pl-9 border-2 border-border-light rounded-xl bg-bg-white text-text-primary text-xs font-black cursor-pointer appearance-none transition-all outline-none focus:border-primary shadow-xs"
              >
                <option value="">Semua Status Sertifikasi</option>
                <option value="has_cert">Memiliki Sertifikat</option>
                <option value="no_cert">Belum Bersertifikat</option>
                <option value="expired_cert">Ada Yang Kedaluwarsa</option>
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>

          {/* Sort By */}
          <div className="w-full sm:w-[160px]">
            <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Urutan (Sort)</label>
            <div className="relative">
              {sortBy === 'name-desc' ? (
                <ArrowUpAZ size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              ) : sortBy === 'name-asc' ? (
                <ArrowDownAZ size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              ) : (
                <ArrowUpDown size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              )}
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as 'name-asc' | 'name-desc' | 'newest' | 'oldest')}
                className="w-full py-2.5 pr-8 pl-9 border-2 border-border-light rounded-xl bg-bg-white text-text-primary text-xs font-black cursor-pointer appearance-none transition-all outline-none focus:border-primary shadow-xs"
              >
                <option value="name-asc">Nama (A - Z)</option>
                <option value="name-desc">Nama (Z - A)</option>
                <option value="newest">Terbaru</option>
                <option value="oldest">Terlama</option>
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>

          {/* Reset Filters Button (if active) */}
          {(searchQuery || roleFilter || employmentFilter || educationFilter || competencyFilter) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setRoleFilter('');
                setEmploymentFilter('');
                setEducationFilter('');
                setCompetencyFilter('');
              }}
              className="flex items-center gap-1.5 py-2.5 px-3 rounded-xl bg-bg-secondary hover:bg-border-light text-text-muted hover:text-text-primary text-xs font-bold transition-all border border-border-light cursor-pointer"
              title="Reset Semua Filter"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          )}

          <div className="flex-1" />

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 bg-bg-secondary p-1 rounded-xl border border-border-light shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === 'grid' 
                  ? 'bg-bg-white text-primary shadow-xs' 
                  : 'text-text-muted hover:text-text-primary'
              }`}
              title="Tampilan Kartu"
            >
              <LayoutGrid size={15} />
              <span className="hidden sm:inline">Kartu</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                viewMode === 'table' 
                  ? 'bg-bg-white text-primary shadow-xs' 
                  : 'text-text-muted hover:text-text-primary'
              }`}
              title="Tampilan Tabel Lengkap"
            >
              <TableIcon size={15} />
              <span className="hidden sm:inline">Tabel</span>
            </button>
          </div>
        </div>
      </Card>

      {/* Main Content Area: Grid View or Table View */}
      {filteredUsers.length === 0 ? (
        <Card className="py-16 text-center border-2 border-border-light">
          <div className="w-16 h-16 bg-bg-secondary text-text-muted rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border-light">
            <UsersIcon size={32} />
          </div>
          <h3 className="text-lg font-black text-text-primary mb-2">Tidak Ada Data Pekerja Ditemukan</h3>
          <p className="text-sm font-medium text-text-secondary m-0">
            Coba ubah kata kunci pencarian, filter role, atau filter status kerja.
          </p>
        </Card>
      ) : viewMode === 'grid' ? (
        /* GRID / CARD VIEW */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedUsers.map((user) => {
            const isDangerRole = ['owner', 'president_director', 'operational_director', 'director'].includes(user.role);
            const isWarningRole = ['asset_admin', 'admin_project'].includes(user.role);
            const isInfoRole = ['site_manager', 'supervisor', 'foreman'].includes(user.role);

            const employmentConfig = EMPLOYMENT_TYPE_OPTIONS.find(
              e => e.value === (user.employmentType || 'tetap')
            ) || EMPLOYMENT_TYPE_OPTIONS[0];

            return (
              <Card 
                key={user._id} 
                className="!p-5 border-2 border-border-light hover:border-primary/60 transition-all relative overflow-hidden group flex flex-col h-full bg-bg-white shadow-sm hover:shadow-md"
              >
                {/* Accent line based on role */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                  isDangerRole ? 'bg-danger' : isWarningRole ? 'bg-warning' : isInfoRole ? 'bg-info' : 'bg-primary'
                }`} />

                <div className="pl-2 flex-1 flex flex-col">
                  {/* Top section: Avatar, Full Name & Username */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
                      <div className="w-12 h-12 rounded-xl bg-bg-secondary text-text-secondary flex items-center justify-center font-black text-lg overflow-hidden shrink-0 border-2 border-border-light shadow-inner">
                        {user.profileImage ? (
                          <PhotoView src={getImageUrl(user.profileImage)}>
                            <img src={getImageUrl(user.profileImage)} alt={user.fullName} className="w-full h-full object-cover cursor-pointer" />
                          </PhotoView>
                        ) : (
                          <span>{user.fullName.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-black text-base text-text-primary truncate" title={user.fullName}>
                          {user.fullName}
                        </span>
                        <span className="text-xs font-bold text-text-muted truncate">@{user.username}</span>
                        {user.position && (
                          <span className="text-[11px] font-bold text-primary truncate mt-0.5">
                            {user.position}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Badges: Role & Employment Type */}
                  <div className="flex flex-wrap gap-1.5 mb-3.5">
                    {/* Role Badge */}
                    <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                      isDangerRole ? 'bg-danger-bg text-danger border border-danger/30' :
                      isWarningRole ? 'bg-warning-bg text-warning border border-warning/30' :
                      isInfoRole ? 'bg-info-bg text-info border border-info/30' :
                      'bg-bg-secondary text-text-secondary border border-border-light'
                    }`}>
                      {ROLE_OPTIONS.find(r => r.value === user.role)?.label || user.role}
                    </span>

                    {/* Employment Type Badge */}
                    <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${employmentConfig.bg} ${employmentConfig.text} ${employmentConfig.border}`}>
                      {employmentConfig.label.split(' ')[0]}
                    </span>
                  </div>

                  {/* Contact Info Box */}
                  <div className="space-y-1 bg-bg-secondary/40 p-2.5 rounded-xl border border-border-light/60 mb-3 text-xs">
                    {user.email && (
                      <div className="font-medium text-text-primary truncate" title={user.email}>
                        {user.email}
                      </div>
                    )}
                    {user.phone ? (
                      <div className="text-text-secondary flex items-center gap-1.5 font-bold truncate">
                        <Phone size={12} className="text-primary" />
                        <span>{user.phone}</span>
                      </div>
                    ) : (
                      <div className="text-text-muted/60 italic text-[11px]">No telepon belum ada</div>
                    )}
                  </div>

                  {/* KONTAK DARURAT (Emergency Contact) Box */}
                  <div className="bg-red-500/5 p-3 rounded-xl border border-red-500/20 mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-red-700 flex items-center gap-1">
                        <Phone size={12} className="text-red-600" />
                        Kontak Darurat
                      </span>
                      {user.emergencyContact?.relationship && (
                        <span className="bg-red-500/10 text-red-800 text-[10px] font-bold px-1.5 py-0.2 rounded border border-red-500/20">
                          {user.emergencyContact.relationship}
                        </span>
                      )}
                    </div>
                    {user.emergencyContact?.name || user.emergencyContact?.phone ? (
                      <div className="space-y-0.5">
                        <div className="text-xs font-black text-text-primary truncate">
                          {user.emergencyContact.name || '-'}
                        </div>
                        {user.emergencyContact.phone && (
                          <a 
                            href={`tel:${user.emergencyContact.phone}`} 
                            className="text-xs font-bold text-red-700 hover:underline flex items-center gap-1"
                          >
                            <span>{user.emergencyContact.phone}</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-text-muted italic">Belum dicatat</span>
                    )}
                  </div>

                  {/* Contract Period if available */}
                  {(user.contractStartDate || user.contractEndDate) && (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-text-secondary mb-3 bg-bg-secondary/60 px-2.5 py-1.5 rounded-lg">
                      <Calendar size={13} className="text-text-muted" />
                      <span>
                        {user.contractStartDate ? new Date(user.contractStartDate).toLocaleDateString('id-ID') : '...'} s/d {user.contractEndDate ? new Date(user.contractEndDate).toLocaleDateString('id-ID') : 'Selesai'}
                      </span>
                    </div>
                  )}

                  {/* BPJS Information Box if available */}
                  {(user.bpjsTk || user.bpjsKesehatan) && (
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 mb-3 text-xs">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1 mb-0.5">
                          <ShieldCheck size={11} className="text-emerald-600" />
                          BPJS TK
                        </span>
                        <span className="font-mono text-[11px] font-bold text-slate-800 truncate block select-all" title={user.bpjsTk}>
                          {user.bpjsTk || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1 mb-0.5">
                          <HeartHandshake size={11} className="text-sky-600" />
                          BPJS Kes
                        </span>
                        <span className="font-mono text-[11px] font-bold text-slate-800 truncate block select-all" title={user.bpjsKesehatan}>
                          {user.bpjsKesehatan || '-'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Kualifikasi: Pendidikan & Sertifikasi */}
                  <div className="bg-bg-secondary/40 p-3 rounded-xl border border-border-light/80 mb-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1">
                        <GraduationCap size={13} className="text-indigo-600" />
                        Pendidikan
                      </span>
                      {user.education?.level ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[11px] text-text-primary uppercase bg-indigo-500/10 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-500/20">
                            {user.education.level}
                          </span>
                          {user.education.documentUrl && (
                            <button
                              type="button"
                              onClick={() => handleOpenViewerForEducation(user)}
                              className="text-primary hover:text-primary-dark p-0.5 cursor-pointer"
                              title="Lihat Bukti Ijazah di Live Viewer"
                            >
                              <Eye size={13} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenPortfolio(user, 'education')}
                          className="text-[10px] text-text-muted hover:text-primary italic cursor-pointer"
                        >
                          + Catat
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-border-light/60">
                      <span className="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1">
                        <Award size={13} className="text-primary" />
                        Sertifikasi
                      </span>
                      {user.competencies && user.competencies.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleOpenPortfolio(user, 'competencies')}
                          className="text-[11px] font-black text-primary hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{user.competencies.length} Sertifikat</span>
                          <Eye size={12} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenPortfolio(user, 'competencies')}
                          className="text-[10px] text-text-muted hover:text-primary italic cursor-pointer"
                        >
                          + Tambah
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1" />

                  {/* Action Footer */}
                  <div className="flex items-center justify-between pt-3.5 mt-auto border-t-2 border-border-light/60">
                    <div className="flex items-center">
                      {user.isVerified ? (
                        <div className="flex items-center gap-1 text-success">
                          <CheckCircle size={15} strokeWidth={2.5} /> 
                          <span className="text-[10px] font-black uppercase tracking-wider">Verified</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-warning">
                          <ShieldAlert size={15} strokeWidth={2.5} /> 
                          <span className="text-[10px] font-black uppercase tracking-wider">Pending</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      {!user.isVerified && (
                        <button 
                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-white border-2 border-success/30 text-success cursor-pointer transition-all hover:bg-success hover:text-white active:scale-95" 
                          onClick={() => handleVerifyUser(user._id!)}
                          title="Verifikasi Akun Manual"
                        >
                          <CheckCircle size={16} />
                        </button>
                      )}
                      <button 
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-white border-2 border-primary/30 text-primary cursor-pointer transition-all hover:bg-primary hover:text-white active:scale-95" 
                        onClick={() => handleOpenPortfolio(user, 'education')}
                        title="Kelola Pendidikan & Sertifikat"
                      >
                        <Award size={16} />
                      </button>
                      <button 
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-white border-2 border-primary/30 text-primary cursor-pointer transition-all hover:bg-primary hover:text-white active:scale-95" 
                        onClick={() => handleOpenEditUser(user)}
                        title="Edit Data Pekerja & Kontak Darurat"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-white border-2 border-info/30 text-info cursor-pointer transition-all hover:bg-info hover:text-white active:scale-95" 
                        onClick={() => handleOpenEditRole(user)}
                        title="Ubah Role / Peran"
                      >
                        <ShieldAlert size={16} />
                      </button>
                      <button 
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-white border-2 border-danger/30 text-danger cursor-pointer transition-all hover:bg-danger hover:text-white active:scale-95" 
                        onClick={() => handleDeleteUser(user._id!)}
                        title="Hapus Pekerja"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Grid View Pagination Footer */}
        {filteredUsers.length > 0 && (
          <Card className="!p-3.5 border-2 border-border-light flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-bg-white shadow-xs">
            <div className="flex items-center gap-4">
              <span className="text-text-muted font-bold">
                Menampilkan <span className="font-mono tabular-nums font-black text-text-primary">{filteredUsers.length === 0 ? 0 : (pageSize === -1 ? 1 : (currentPage - 1) * pageSize + 1)}</span>
                {' - '}
                <span className="font-mono tabular-nums font-black text-text-primary">{pageSize === -1 ? filteredUsers.length : Math.min(currentPage * pageSize, filteredUsers.length)}</span>
                {' '}dari{' '}
                <span className="font-mono tabular-nums font-black text-text-primary">{filteredUsers.length}</span> pekerja
              </span>

              <div className="flex items-center gap-1.5">
                <span className="text-text-muted font-bold text-[11px]">Baris:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-border-light rounded-lg px-2 py-1 text-xs font-bold font-mono text-text-primary outline-none focus:border-primary cursor-pointer shadow-2xs"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={-1}>Semua</option>
                </select>
              </div>
            </div>

            {pageSize !== -1 && totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-border-light text-text-secondary hover:text-text-primary hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-all shadow-2xs"
                  title="Halaman Pertama"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-border-light text-text-secondary hover:text-text-primary hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-all shadow-2xs"
                  title="Halaman Sebelumnya"
                >
                  <ChevronLeft size={14} />
                </button>

                {pageNumbers.map(page => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`w-7 h-7 rounded-lg text-xs font-mono tabular-nums font-black transition-all cursor-pointer ${
                      currentPage === page
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-white border border-border-light text-text-secondary hover:bg-slate-100 hover:text-text-primary shadow-2xs'
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-border-light text-text-secondary hover:text-text-primary hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-all shadow-2xs"
                  title="Halaman Berikutnya"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-border-light text-text-secondary hover:text-text-primary hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-all shadow-2xs"
                  title="Halaman Terakhir"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            )}
          </Card>
        )}
      </div>
      ) : (
        /* TABLE VIEW */
        <Card className="overflow-hidden border-2 border-border-light shadow-sm flex flex-col bg-bg-white">
          {/* Table Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 border-b border-border-light">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-muted">
                Total:{' '}
                <span className="font-mono tabular-nums font-black text-text-primary">{filteredUsers.length}</span> pekerja
                {filteredUsers.length !== users.length && (
                  <span className="text-text-muted"> (difilter dari <span className="font-mono tabular-nums">{users.length}</span>)</span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Density control */}
              <div className="flex items-center bg-white border border-border-light rounded-lg p-0.5 shadow-2xs">
                <span className="text-[11px] font-bold text-text-muted px-2 select-none">Kerapatan:</span>
                <button
                  type="button"
                  onClick={() => setTableDensity('compact')}
                  className={`px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                    tableDensity === 'compact' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title="Kerapatan Rapat (Compact)"
                >
                  Rapat
                </button>
                <button
                  type="button"
                  onClick={() => setTableDensity('normal')}
                  className={`px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                    tableDensity === 'normal' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title="Kerapatan Standar (Normal)"
                >
                  Standar
                </button>
                <button
                  type="button"
                  onClick={() => setTableDensity('comfortable')}
                  className={`px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                    tableDensity === 'comfortable' ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title="Kerapatan Lapang (Comfortable)"
                >
                  Lapang
                </button>
              </div>

              {/* Column selector */}
              <div className="relative" ref={columnDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsColumnDropdownOpen(prev => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    isColumnDropdownOpen 
                      ? 'bg-slate-900 text-white border-slate-900' 
                      : 'bg-white text-text-primary border-border-light hover:bg-slate-50'
                  }`}
                  title="Kelola Kolom yang Ditampilkan"
                >
                  <Columns3 size={14} />
                  <span>Kolom</span>
                  <span className="font-mono tabular-nums text-[10px] bg-primary/20 text-primary px-1.5 py-0.2 rounded font-black">
                    {Object.values(visibleColumns).filter(Boolean).length}/{DATA_TABLE_COLUMNS.length}
                  </span>
                  <ChevronDown size={12} className={`transition-transform duration-200 ${isColumnDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isColumnDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border-2 border-border-light p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-light">
                      <span className="text-xs font-black text-text-primary uppercase tracking-wider">Tampilan Kolom</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const allTrue: Record<string, boolean> = {};
                            DATA_TABLE_COLUMNS.forEach(c => allTrue[c.id] = true);
                            setVisibleColumns(allTrue);
                          }}
                          className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
                        >
                          Semua
                        </button>
                        <span className="text-text-muted text-[10px]">•</span>
                        <button
                          type="button"
                          onClick={() => {
                            const defaults: Record<string, boolean> = {};
                            DATA_TABLE_COLUMNS.forEach(c => defaults[c.id] = true);
                            setVisibleColumns(defaults);
                          }}
                          className="text-[10px] font-bold text-text-muted hover:text-text-primary cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {DATA_TABLE_COLUMNS.map((col) => (
                        <label
                          key={col.id}
                          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs font-medium text-text-primary select-none transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={visibleColumns[col.id] !== false}
                            onChange={(e) => {
                              setVisibleColumns(prev => ({
                                ...prev,
                                [col.id]: e.target.checked
                              }));
                            }}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                          />
                          <span>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Table Container with Sticky / Frozen Columns */}
          <div className="overflow-x-auto relative w-full">
            <table role="grid" aria-rowcount={paginatedUsers.length} className="w-full text-left border-collapse">
              <thead>
                <tr role="row" className="bg-slate-900 text-white font-black uppercase tracking-wider border-b border-slate-800">
                  {/* Sticky 1: # Left-aligned qualitative number */}
                  <th role="columnheader" className={`sticky left-0 z-30 bg-slate-900 text-white font-mono tabular-nums text-left w-12 min-w-[48px] max-w-[48px] ${DENSITY_CONFIG[tableDensity].th}`}>
                    #
                  </th>

                  {/* Sticky 2: Pekerja / Karyawan */}
                  <th 
                    role="columnheader"
                    className={`sticky left-12 z-30 bg-slate-900 text-white text-left min-w-[230px] border-r border-slate-800 shadow-[4px_0_8px_-3px_rgba(0,0,0,0.4)] cursor-pointer select-none hover:text-primary transition-colors group ${DENSITY_CONFIG[tableDensity].th}`}
                    onClick={() => setSortBy(prev => prev === 'name-asc' ? 'name-desc' : 'name-asc')}
                    title="Klik untuk mengubah urutan A-Z / Z-A"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Pekerja / Karyawan</span>
                      {sortBy === 'name-asc' ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-primary font-black bg-primary/20 px-1.5 py-0.5 rounded">
                          <ArrowDownAZ size={12} /> A-Z
                        </span>
                      ) : sortBy === 'name-desc' ? (
                        <span className="inline-flex items-center gap-0.5 text-primary font-black text-[10px] bg-primary/20 px-1.5 py-0.5 rounded">
                          <ArrowUpAZ size={12} /> Z-A
                        </span>
                      ) : (
                        <ArrowUpDown size={12} className="text-white/40 group-hover:text-primary transition-colors" />
                      )}
                    </div>
                  </th>

                  {visibleColumns.role && (
                    <th role="columnheader" className={`min-w-[140px] text-left ${DENSITY_CONFIG[tableDensity].th}`}>Role & Jabatan</th>
                  )}
                  {visibleColumns.employment && (
                    <th role="columnheader" className={`min-w-[150px] text-left ${DENSITY_CONFIG[tableDensity].th}`}>Status Kerja</th>
                  )}
                  {visibleColumns.bpjsTk && (
                    <th role="columnheader" className={`min-w-[160px] text-left ${DENSITY_CONFIG[tableDensity].th}`}>BPJS TK</th>
                  )}
                  {visibleColumns.bpjsKes && (
                    <th role="columnheader" className={`min-w-[160px] text-left ${DENSITY_CONFIG[tableDensity].th}`}>BPJS Kesehatan</th>
                  )}
                  {visibleColumns.education && (
                    <th role="columnheader" className={`min-w-[180px] text-left ${DENSITY_CONFIG[tableDensity].th}`}>Pendidikan Terakhir</th>
                  )}
                  {visibleColumns.competencies && (
                    <th role="columnheader" className={`min-w-[220px] text-left ${DENSITY_CONFIG[tableDensity].th}`}>Kompetensi & Sertifikasi</th>
                  )}
                  {visibleColumns.emergency && (
                    <th role="columnheader" className={`min-w-[180px] text-left ${DENSITY_CONFIG[tableDensity].th}`}>Kontak Darurat</th>
                  )}
                  {visibleColumns.contact && (
                    <th role="columnheader" className={`min-w-[170px] text-left ${DENSITY_CONFIG[tableDensity].th}`}>Telepon / Email</th>
                  )}
                  {visibleColumns.verification && (
                    <th role="columnheader" className={`min-w-[120px] text-left ${DENSITY_CONFIG[tableDensity].th}`}>Verifikasi</th>
                  )}

                  {/* Sticky 3: Aksi */}
                  <th role="columnheader" className={`sticky right-0 z-30 bg-slate-900 text-white text-right min-w-[140px] border-l border-slate-800 shadow-[-4px_0_8px_-3px_rgba(0,0,0,0.4)] ${DENSITY_CONFIG[tableDensity].th}`}>
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {paginatedUsers.map((user, idx) => {
                  const rowNumber = (pageSize === -1 ? 0 : (currentPage - 1) * pageSize) + idx + 1;
                  const employmentConfig = EMPLOYMENT_TYPE_OPTIONS.find(
                    e => e.value === (user.employmentType || 'tetap')
                  ) || EMPLOYMENT_TYPE_OPTIONS[0];

                  return (
                    <tr role="row" aria-rowindex={rowNumber} key={user._id} className="group hover:bg-slate-50/80 transition-colors">
                      {/* Sticky 1: # Left-aligned with monospace tabular figures */}
                      <td className={`sticky left-0 z-10 bg-white group-hover:bg-slate-50 font-mono tabular-nums text-left font-bold text-text-muted w-12 min-w-[48px] max-w-[48px] border-b border-border-light ${DENSITY_CONFIG[tableDensity].td}`}>
                        {rowNumber}
                      </td>

                      {/* Sticky 2: Pekerja / Karyawan */}
                      <td className={`sticky left-12 z-10 bg-white group-hover:bg-slate-50 text-left min-w-[230px] border-r border-border-light shadow-[4px_0_8px_-3px_rgba(0,0,0,0.06)] border-b ${DENSITY_CONFIG[tableDensity].td}`}>
                        <div className="flex items-center gap-2.5">
                          <div className={`${DENSITY_CONFIG[tableDensity].avatar} rounded-lg bg-bg-secondary text-text-secondary flex items-center justify-center font-black shrink-0 border border-border-light overflow-hidden`}>
                            {user.profileImage ? (
                              <img src={getImageUrl(user.profileImage)} alt={user.fullName} className="w-full h-full object-cover" />
                            ) : (
                              <span>{user.fullName.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-black text-text-primary truncate max-w-[160px]" title={user.fullName}>
                              {user.fullName}
                            </div>
                            <div className={`text-text-muted font-bold truncate max-w-[160px] ${DENSITY_CONFIG[tableDensity].subText}`}>
                              @{user.username}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role & Jabatan */}
                      {visibleColumns.role && (
                        <td className={`text-left border-b border-border-light ${DENSITY_CONFIG[tableDensity].td}`}>
                          <div className="font-black text-text-primary capitalize">{user.role}</div>
                          {user.position ? (
                            <div className={`font-bold text-primary ${DENSITY_CONFIG[tableDensity].subText}`}>{user.position}</div>
                          ) : (
                            <div className={`text-text-muted ${DENSITY_CONFIG[tableDensity].subText}`}>-</div>
                          )}
                        </td>
                      )}

                      {/* Status Kerja */}
                      {visibleColumns.employment && (
                        <td className={`text-left border-b border-border-light ${DENSITY_CONFIG[tableDensity].td}`}>
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${employmentConfig.bg} ${employmentConfig.text} ${employmentConfig.border}`}>
                            {employmentConfig.label}
                          </span>
                          {(user.contractStartDate || user.contractEndDate) && (
                            <div className={`font-mono tabular-nums text-text-secondary mt-1 font-bold ${DENSITY_CONFIG[tableDensity].subText}`}>
                              {user.contractStartDate ? new Date(user.contractStartDate).toLocaleDateString('id-ID') : '...'} - {user.contractEndDate ? new Date(user.contractEndDate).toLocaleDateString('id-ID') : 'Selesai'}
                            </div>
                          )}
                        </td>
                      )}

                      {/* BPJS TK */}
                      {visibleColumns.bpjsTk && (
                        <td className={`text-left border-b border-border-light ${DENSITY_CONFIG[tableDensity].td}`}>
                          {user.bpjsTk ? (
                            <div className="flex items-center gap-1.5 font-mono tabular-nums font-bold text-slate-800 bg-emerald-500/10 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-500/20 text-[11px] w-fit">
                              <ShieldCheck size={13} className="text-emerald-600 shrink-0" />
                              <span className="tracking-tight select-all">{user.bpjsTk}</span>
                            </div>
                          ) : (
                            <span className="text-text-muted/60 italic text-[11px]">Belum terdaftar</span>
                          )}
                        </td>
                      )}

                      {/* BPJS Kesehatan */}
                      {visibleColumns.bpjsKes && (
                        <td className={`text-left border-b border-border-light ${DENSITY_CONFIG[tableDensity].td}`}>
                          {user.bpjsKesehatan ? (
                            <div className="flex items-center gap-1.5 font-mono tabular-nums font-bold text-slate-800 bg-sky-500/10 text-sky-800 px-2.5 py-1 rounded-lg border border-sky-500/20 text-[11px] w-fit">
                              <HeartHandshake size={13} className="text-sky-600 shrink-0" />
                              <span className="tracking-tight select-all">{user.bpjsKesehatan}</span>
                            </div>
                          ) : (
                            <span className="text-text-muted/60 italic text-[11px]">Belum terdaftar</span>
                          )}
                        </td>
                      )}

                      {/* Pendidikan Terakhir */}
                      {visibleColumns.education && (
                        <td className={`text-left border-b border-border-light ${DENSITY_CONFIG[tableDensity].td}`}>
                          {user.education?.level ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-700 border border-indigo-500/20">
                                  {user.education.level}
                                </span>
                                {user.education.graduationYear && (
                                  <span className={`font-mono tabular-nums font-bold text-text-muted ${DENSITY_CONFIG[tableDensity].subText}`}>
                                    '{user.education.graduationYear.slice(-2)}
                                  </span>
                                )}
                              </div>

                              {(user.education.major || user.education.institution) && (
                                <div className={`font-bold text-text-primary truncate max-w-[180px] ${DENSITY_CONFIG[tableDensity].subText}`} title={`${user.education.major || ''} ${user.education.institution ? '• ' + user.education.institution : ''}`}>
                                  {user.education.major || user.education.institution}
                                </div>
                              )}

                              {user.education.documentUrl ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenViewerForEducation(user)}
                                  className="inline-flex items-center gap-1 text-[10px] font-black text-primary hover:text-primary-dark hover:underline bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20 transition-all cursor-pointer"
                                  title="Buka bukti ijazah di Live Viewer"
                                >
                                  <Eye size={11} />
                                  <span>Lihat Ijazah</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPortfolio(user, 'education')}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-text-muted hover:text-primary hover:underline cursor-pointer"
                                  title="Unggah bukti kelulusan / ijazah"
                                >
                                  <Plus size={11} />
                                  <span>Unggah Bukti</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-text-muted/60 italic text-[11px]">Belum dicatat</span>
                              <button
                                type="button"
                                onClick={() => handleOpenPortfolio(user, 'education')}
                                className="w-5 h-5 rounded bg-bg-secondary hover:bg-border-light text-text-muted hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
                                title="Catat Pendidikan & Bukti"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                      )}

                      {/* Kompetensi & Sertifikasi */}
                      {visibleColumns.competencies && (
                        <td className={`text-left border-b border-border-light ${DENSITY_CONFIG[tableDensity].td}`}>
                          {user.competencies && user.competencies.length > 0 ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-1">
                                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                                  <Award size={11} />
                                  <span className="font-mono tabular-nums">{user.competencies.length}</span>
                                  <span>Sertifikat</span>
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleOpenPortfolio(user, 'competencies')}
                                  className="text-[10px] font-bold text-text-muted hover:text-primary cursor-pointer hover:underline"
                                  title="Kelola sertifikat pekerja"
                                >
                                  Kelola
                                </button>
                              </div>

                              <div className="flex flex-col gap-1">
                                {user.competencies.slice(0, 2).map((cert) => {
                                  const isExpired = cert.expiryDate && new Date(cert.expiryDate) < new Date();
                                  return (
                                    <div 
                                      key={cert._id || cert.name}
                                      className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                        isExpired
                                          ? 'bg-red-500/5 text-red-700 border-red-500/20'
                                          : 'bg-bg-secondary/60 text-text-primary border-border-light'
                                      }`}
                                    >
                                      <span className="truncate max-w-[130px]" title={cert.name}>{cert.name}</span>
                                      {cert.documentUrl ? (
                                        <button
                                          type="button"
                                          onClick={() => handleOpenViewerForCertificate(user, cert._id)}
                                          className="text-primary hover:text-primary-dark p-0.5 cursor-pointer shrink-0"
                                          title="Buka sertifikat ini di Live Viewer"
                                        >
                                          <Eye size={12} />
                                        </button>
                                      ) : null}
                                    </div>
                                  );
                                })}
                                {user.competencies.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenPortfolio(user, 'competencies')}
                                    className="text-[10px] font-bold text-text-muted hover:text-primary text-left pl-1 cursor-pointer"
                                  >
                                    +{user.competencies.length - 2} sertifikat lainnya...
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-text-muted/60 italic text-[11px]">Belum ada</span>
                              <button
                                type="button"
                                onClick={() => handleOpenPortfolio(user, 'competencies')}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-bg-secondary hover:bg-border-light text-text-muted hover:text-primary transition-colors cursor-pointer"
                                title="Tambah Sertifikat Baru"
                              >
                                <Plus size={11} />
                                <span>Sertifikat</span>
                              </button>
                            </div>
                          )}
                        </td>
                      )}

                      {/* Kontak Darurat */}
                      {visibleColumns.emergency && (
                        <td className={`text-left border-b border-border-light ${DENSITY_CONFIG[tableDensity].td}`}>
                          {user.emergencyContact?.name || user.emergencyContact?.phone ? (
                            <div>
                              <div className="font-black text-text-primary flex items-center gap-1.5">
                                <span>{user.emergencyContact.name || '-'}</span>
                                {user.emergencyContact.relationship && (
                                  <span className="bg-red-500/10 text-red-700 text-[10px] font-black px-1.5 py-0.2 rounded border border-red-500/20">
                                    {user.emergencyContact.relationship}
                                  </span>
                                )}
                              </div>
                              {user.emergencyContact.phone && (
                                <a href={`tel:${user.emergencyContact.phone}`} className={`font-mono tabular-nums font-bold text-red-700 hover:underline ${DENSITY_CONFIG[tableDensity].subText}`}>
                                  {user.emergencyContact.phone}
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-text-muted/60 italic text-[11px]">Belum dicatat</span>
                          )}
                        </td>
                      )}

                      {/* Telepon / Email */}
                      {visibleColumns.contact && (
                        <td className={`text-left border-b border-border-light ${DENSITY_CONFIG[tableDensity].td}`}>
                          {user.phone && <div className="font-mono tabular-nums font-bold text-text-primary">{user.phone}</div>}
                          {user.email && <div className={`text-text-secondary truncate max-w-[160px] ${DENSITY_CONFIG[tableDensity].subText}`}>{user.email}</div>}
                          {!user.phone && !user.email && <span className="text-text-muted/60 italic text-[11px]">-</span>}
                        </td>
                      )}

                      {/* Verifikasi (No center-align: left-aligned badge) */}
                      {visibleColumns.verification && (
                        <td className={`text-left border-b border-border-light ${DENSITY_CONFIG[tableDensity].td}`}>
                          {user.isVerified ? (
                            <span className="inline-flex items-center gap-1 text-success font-black text-[10px] uppercase bg-success-bg px-2 py-0.5 rounded border border-success/30">
                              <CheckCircle size={13} strokeWidth={2.5} /> Terverifikasi
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-warning font-black text-[10px] uppercase bg-warning-bg px-2 py-0.5 rounded border border-warning/30">
                              <ShieldAlert size={13} strokeWidth={2.5} /> Pending
                            </span>
                          )}
                        </td>
                      )}

                      {/* Sticky 3: Aksi */}
                      <td className={`sticky right-0 z-10 bg-white group-hover:bg-slate-50 text-right min-w-[140px] border-l border-border-light shadow-[-4px_0_8px_-3px_rgba(0,0,0,0.06)] border-b ${DENSITY_CONFIG[tableDensity].td}`}>
                        <div className="flex items-center justify-end gap-1.5">
                          {!user.isVerified && (
                            <button 
                              className="w-7 h-7 rounded flex items-center justify-center bg-bg-white border border-success/30 text-success hover:bg-success hover:text-white cursor-pointer transition-colors"
                              onClick={() => handleVerifyUser(user._id!)}
                              title="Verifikasi Manual"
                            >
                              <CheckCircle size={14} />
                            </button>
                          )}
                          <button 
                            className="w-7 h-7 rounded flex items-center justify-center bg-bg-white border border-primary/30 text-primary hover:bg-primary hover:text-white cursor-pointer transition-colors"
                            onClick={() => handleOpenPortfolio(user, 'education')}
                            title="Kelola Pendidikan & Sertifikat"
                          >
                            <Award size={14} />
                          </button>
                          <button 
                            className="w-7 h-7 rounded flex items-center justify-center bg-bg-white border border-primary/30 text-primary hover:bg-primary hover:text-white cursor-pointer transition-colors"
                            onClick={() => handleOpenEditUser(user)}
                            title="Edit Data"
                          >
                            <Edit size={14} />
                          </button>
                          <button 
                            className="w-7 h-7 rounded flex items-center justify-center bg-bg-white border border-danger/30 text-danger hover:bg-danger hover:text-white cursor-pointer transition-colors"
                            onClick={() => handleDeleteUser(user._id!)}
                            title="Hapus"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Pagination */}
          <div className="p-3.5 bg-slate-50 border-t border-border-light flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <span className="text-text-muted font-bold">
                Menampilkan <span className="font-mono tabular-nums font-black text-text-primary">{filteredUsers.length === 0 ? 0 : (pageSize === -1 ? 1 : (currentPage - 1) * pageSize + 1)}</span>
                {' - '}
                <span className="font-mono tabular-nums font-black text-text-primary">{pageSize === -1 ? filteredUsers.length : Math.min(currentPage * pageSize, filteredUsers.length)}</span>
                {' '}dari{' '}
                <span className="font-mono tabular-nums font-black text-text-primary">{filteredUsers.length}</span> pekerja
              </span>

              <div className="flex items-center gap-1.5">
                <span className="text-text-muted font-bold text-[11px]">Baris:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-border-light rounded-lg px-2 py-1 text-xs font-bold font-mono text-text-primary outline-none focus:border-primary cursor-pointer shadow-2xs"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={-1}>Semua</option>
                </select>
              </div>
            </div>

            {/* Pagination Controls */}
            {pageSize !== -1 && totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-border-light text-text-secondary hover:text-text-primary hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-all shadow-2xs"
                  title="Halaman Pertama"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-border-light text-text-secondary hover:text-text-primary hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-all shadow-2xs"
                  title="Halaman Sebelumnya"
                >
                  <ChevronLeft size={14} />
                </button>

                {pageNumbers.map(page => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`w-7 h-7 rounded-lg text-xs font-mono tabular-nums font-black transition-all cursor-pointer ${
                      currentPage === page
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-white border border-border-light text-text-secondary hover:bg-slate-100 hover:text-text-primary shadow-2xs'
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-border-light text-text-secondary hover:text-text-primary hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-all shadow-2xs"
                  title="Halaman Berikutnya"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-border-light text-text-secondary hover:text-text-primary hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-all shadow-2xs"
                  title="Halaman Terakhir"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ========================================== */}
      {/* API KEY MANAGEMENT SECTION (COLLAPSIBLE)  */}
      {/* ========================================== */}
      <Card className="border-2 border-border-light overflow-hidden">
        <div 
          className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex justify-between items-center cursor-pointer select-none"
          onClick={() => setIsApiKeysOpen(!isApiKeysOpen)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0">
              <Key size={20} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black uppercase tracking-tight m-0">
                  Manajemen API Key (Akses Aplikasi Eksternal)
                </h3>
                <span className="bg-amber-400 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full uppercase">
                  External Access
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium m-0 mt-0.5">
                Kunci otorisasi untuk membaca database pekerja dari sistem luar (endpoint: <code className="text-amber-300">/api/pekerja</code>)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsCreateKeyModalOpen(true);
              }}
              className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95"
            >
              <Plus size={15} strokeWidth={3} />
              <span>Buat API Key</span>
            </button>
            {isApiKeysOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>

        {isApiKeysOpen && (
          <div className="p-6 bg-bg-white space-y-6">
            {/* Documentation banner */}
            <div className="bg-slate-50 border-2 border-slate-200 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="text-xs font-black text-slate-900 uppercase flex items-center gap-1.5">
                  <Code size={16} className="text-primary" />
                  Format Pemanggilan API Eksternal
                </span>
                <p className="text-xs text-text-secondary mt-1 font-mono bg-white p-2 rounded border border-slate-200 inline-block">
                  GET /api/pekerja &nbsp;|&nbsp; Header: <span className="font-bold text-primary">X-API-Key: mterp_xxxxxxxx...</span>
                </p>
              </div>
              <div className="text-xs text-text-muted font-bold">
                Mendukung query parameter: <code className="text-primary">page, limit, search, role, employmentType</code>
              </div>
            </div>

            {/* API Keys List */}
            {isApiKeysLoading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-10 bg-bg-secondary/30 rounded-xl border border-border-light">
                <Key size={32} className="mx-auto text-text-muted mb-2 opacity-50" />
                <h4 className="text-sm font-black text-text-primary mb-1">Belum Ada API Key</h4>
                <p className="text-xs text-text-muted max-w-md mx-auto mb-4">
                  Buat API key baru untuk menghubungkan software payroll, absensi lapangan, atau sistem pihak ketiga lainnya.
                </p>
                <button
                  onClick={() => setIsCreateKeyModalOpen(true)}
                  className="bg-primary text-white text-xs font-black px-4 py-2 rounded-xl uppercase tracking-wider"
                >
                  Buat Key Sekarang
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border-light border-2 border-border-light rounded-xl overflow-hidden">
                {apiKeys.map((key) => (
                  <div key={key._id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        key.isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        <Key size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-text-primary">{key.name}</span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.2 rounded-full border ${
                            key.isActive 
                              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' 
                              : 'bg-red-500/10 text-red-700 border-red-500/30'
                          }`}>
                            {key.isActive ? 'Aktif' : 'Non-aktif'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-muted font-bold mt-0.5">
                          <span>Prefix: <code className="font-mono text-slate-800 font-black">{key.keyPrefix}••••••••</code></span>
                          <span>•</span>
                          <span>Dibuat: {new Date(key.createdAt).toLocaleDateString('id-ID')}</span>
                          {key.lastUsedAt && (
                            <>
                              <span>•</span>
                              <span>Terakhir digunakan: {new Date(key.lastUsedAt).toLocaleString('id-ID')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleToggleKeyActive(key)}
                        className={`text-xs font-black px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                          key.isActive 
                            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100' 
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                        }`}
                      >
                        {key.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button
                        onClick={() => handleDeleteApiKey(key._id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer transition-all"
                        title="Hapus Key"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ========================================== */}
      {/* MODAL: SINGLE NEW USER                     */}
      {/* ========================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" onClick={() => setIsAddModalOpen(false)}>
          <div className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[620px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b-2 border-border-light bg-bg-secondary flex justify-between items-center sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <UserPlus size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-text-primary m-0 tracking-tight uppercase">Tambah Pekerja Baru</h3>
                  <span className="text-xs font-bold text-text-muted">Data otomatis aktif & terverifikasi</span>
                </div>
              </div>
              <button className="w-8 h-8 rounded-full bg-border border-none flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer" onClick={() => setIsAddModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Nama Lengkap *</label>
                  <input 
                    type="text" 
                    required 
                    value={newUser.fullName}
                    onChange={(e) => setNewUser({...newUser, fullName: e.target.value})}
                    placeholder="e.g. Budi Santoso"
                    className="w-full px-3.5 py-2.5 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Username *</label>
                  <input 
                    type="text" 
                    required 
                    value={newUser.username}
                    onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                    placeholder="e.g. budi.santoso"
                    className="w-full px-3.5 py-2.5 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm lowercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Email *</label>
                  <input 
                    type="email" 
                    required 
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    placeholder="budi@mterp.com"
                    className="w-full px-3.5 py-2.5 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Password *</label>
                  <input 
                    type="password" 
                    required 
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    placeholder="Min. 6 karakter"
                    className="w-full px-3.5 py-2.5 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Role / Peran *</label>
                  <select 
                    required
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                    className="w-full py-2.5 px-3 border-2 border-border-light rounded-xl text-text-primary text-sm font-bold bg-bg-white focus:border-primary outline-none"
                  >
                    {ROLE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Status Kerja *</label>
                  <select 
                    value={newUser.employmentType}
                    onChange={(e) => setNewUser({...newUser, employmentType: e.target.value as EmploymentType})}
                    className="w-full py-2.5 px-3 border-2 border-border-light rounded-xl text-text-primary text-sm font-bold bg-bg-white focus:border-primary outline-none"
                  >
                    {EMPLOYMENT_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Jabatan / Keahlian</label>
                  <input 
                    type="text" 
                    value={newUser.position}
                    onChange={(e) => setNewUser({...newUser, position: e.target.value})}
                    placeholder="e.g. Tukang Cor / Mandor Lapangan"
                    className="w-full px-3.5 py-2.5 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">No. Telepon / WhatsApp</label>
                  <input 
                    type="text" 
                    value={newUser.phone}
                    onChange={(e) => setNewUser({...newUser, phone: e.target.value})}
                    placeholder="081234567890"
                    className="w-full px-3.5 py-2.5 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                  />
                </div>
              </div>

              {/* BPJS Sub-section */}
              <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl space-y-3">
                <span className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  Jaminan Sosial (BPJS)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">No. BPJS Ketenagakerjaan (TK)</label>
                    <input 
                      type="text" 
                      value={newUser.bpjsTk}
                      onChange={(e) => setNewUser({...newUser, bpjsTk: e.target.value})}
                      placeholder="e.g. 00012345678"
                      className="w-full px-3 py-2 border border-border-light rounded-lg font-mono font-bold text-xs bg-white outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">No. BPJS Kesehatan</label>
                    <input 
                      type="text" 
                      value={newUser.bpjsKesehatan}
                      onChange={(e) => setNewUser({...newUser, bpjsKesehatan: e.target.value})}
                      placeholder="e.g. 00098765432"
                      className="w-full px-3 py-2 border border-border-light rounded-lg font-mono font-bold text-xs bg-white outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Kontak Darurat Sub-section */}
              <div className="p-4 bg-red-50/60 border-2 border-red-200 rounded-xl space-y-3">
                <span className="text-xs font-black text-red-800 uppercase flex items-center gap-1.5">
                  <Phone size={14} className="text-red-600" />
                  Kontak Darurat (Keluarga / Kerabat Dekat)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Nama Kontak</label>
                    <input 
                      type="text"
                      placeholder="e.g. Siti Aminah"
                      value={newUser.emergencyContact.name}
                      onChange={(e) => setNewUser({
                        ...newUser,
                        emergencyContact: { ...newUser.emergencyContact, name: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-border-light rounded-lg font-bold text-xs bg-white outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">No. HP Kontak</label>
                    <input 
                      type="text"
                      placeholder="081298765432"
                      value={newUser.emergencyContact.phone}
                      onChange={(e) => setNewUser({
                        ...newUser,
                        emergencyContact: { ...newUser.emergencyContact, phone: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-border-light rounded-lg font-bold text-xs bg-white outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Hubungan</label>
                    <input 
                      type="text"
                      placeholder="Istri / Ayah / Saudara"
                      value={newUser.emergencyContact.relationship}
                      onChange={(e) => setNewUser({
                        ...newUser,
                        emergencyContact: { ...newUser.emergencyContact, relationship: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-border-light rounded-lg font-bold text-xs bg-white outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  className="flex-1 py-3.5 bg-bg-white border-2 border-border-light rounded-xl text-xs font-black text-text-secondary cursor-pointer hover:bg-bg-secondary uppercase tracking-wider" 
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="flex-[2] py-3.5 bg-primary text-white border-none rounded-xl text-xs font-black cursor-pointer hover:bg-primary/90 uppercase tracking-wider shadow-lg shadow-primary/20"
                >
                  Simpan Pekerja Baru
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: EDIT USER & KONTAK DARURAT          */}
      {/* ========================================== */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" onClick={() => setIsEditModalOpen(false)}>
          <div className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[620px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b-2 border-border-light bg-bg-secondary flex justify-between items-center sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Edit size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-text-primary m-0 tracking-tight uppercase">Edit Data Pekerja</h3>
                  <span className="text-xs font-bold text-text-muted">@{selectedUser.username} - {selectedUser.email}</span>
                </div>
              </div>
              <button className="w-8 h-8 rounded-full bg-border border-none flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer" onClick={() => setIsEditModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSaveEditUser} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Nama Lengkap *</label>
                  <input 
                    type="text" 
                    required 
                    value={editFormData.fullName}
                    onChange={(e) => setEditFormData({...editFormData, fullName: e.target.value})}
                    className="w-full px-3.5 py-2.5 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Status Kerja</label>
                  <select 
                    value={editFormData.employmentType}
                    onChange={(e) => setEditFormData({...editFormData, employmentType: e.target.value as EmploymentType})}
                    className="w-full py-2.5 px-3 border-2 border-border-light rounded-xl text-text-primary text-sm font-bold bg-bg-white focus:border-primary outline-none"
                  >
                    {EMPLOYMENT_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Jabatan / Spesialisasi</label>
                  <input 
                    type="text" 
                    value={editFormData.position}
                    onChange={(e) => setEditFormData({...editFormData, position: e.target.value})}
                    className="w-full px-3.5 py-2.5 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">No. HP</label>
                  <input 
                    type="text" 
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({...editFormData, phone: e.target.value})}
                    className="w-full px-3.5 py-2.5 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                  />
                </div>
              </div>

              {/* Periode Kontrak (jika kontrak/magang) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Mulai Kontrak</label>
                  <input 
                    type="date" 
                    value={editFormData.contractStartDate}
                    onChange={(e) => setEditFormData({...editFormData, contractStartDate: e.target.value})}
                    className="w-full px-3.5 py-2.5 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Selesai Kontrak</label>
                  <input 
                    type="date" 
                    value={editFormData.contractEndDate}
                    onChange={(e) => setEditFormData({...editFormData, contractEndDate: e.target.value})}
                    className="w-full px-3.5 py-2.5 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5">Alamat Tempat Tinggal</label>
                <input 
                  type="text" 
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({...editFormData, address: e.target.value})}
                  className="w-full px-3.5 py-2.5 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                />
              </div>

              {/* BPJS Sub-section */}
              <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl space-y-3">
                <span className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  Jaminan Sosial (BPJS)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">No. BPJS Ketenagakerjaan (TK)</label>
                    <input 
                      type="text" 
                      value={editFormData.bpjsTk}
                      onChange={(e) => setEditFormData({...editFormData, bpjsTk: e.target.value})}
                      placeholder="e.g. 00012345678"
                      className="w-full px-3 py-2 border border-border-light rounded-lg font-mono font-bold text-xs bg-white outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">No. BPJS Kesehatan</label>
                    <input 
                      type="text" 
                      value={editFormData.bpjsKesehatan}
                      onChange={(e) => setEditFormData({...editFormData, bpjsKesehatan: e.target.value})}
                      placeholder="e.g. 00098765432"
                      className="w-full px-3 py-2 border border-border-light rounded-lg font-mono font-bold text-xs bg-white outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Kontak Darurat (Emergency Contact) */}
              <div className="p-4 bg-red-50/60 border-2 border-red-200 rounded-xl space-y-3">
                <span className="text-xs font-black text-red-800 uppercase flex items-center gap-1.5">
                  <Phone size={14} className="text-red-600" />
                  Kontak Darurat (Emergency Contact)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Nama Kontak</label>
                    <input 
                      type="text"
                      placeholder="e.g. Siti Aminah"
                      value={editFormData.emergencyContact.name}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        emergencyContact: { ...editFormData.emergencyContact, name: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-border-light rounded-lg font-bold text-xs bg-white outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">No. HP Kontak</label>
                    <input 
                      type="text"
                      placeholder="081298765432"
                      value={editFormData.emergencyContact.phone}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        emergencyContact: { ...editFormData.emergencyContact, phone: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-border-light rounded-lg font-bold text-xs bg-white outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Hubungan</label>
                    <input 
                      type="text"
                      placeholder="Istri / Suami / Orang Tua"
                      value={editFormData.emergencyContact.relationship}
                      onChange={(e) => setEditFormData({
                        ...editFormData,
                        emergencyContact: { ...editFormData.emergencyContact, relationship: e.target.value }
                      })}
                      className="w-full px-3 py-2 border border-border-light rounded-lg font-bold text-xs bg-white outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  className="flex-1 py-3.5 bg-bg-white border-2 border-border-light rounded-xl text-xs font-black text-text-secondary cursor-pointer hover:bg-bg-secondary uppercase tracking-wider" 
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="flex-[2] py-3.5 bg-primary text-white border-none rounded-xl text-xs font-black cursor-pointer hover:bg-primary/90 uppercase tracking-wider shadow-lg shadow-primary/20"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: EXPORT CONFIGURATION                */}
      {/* ========================================== */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" onClick={() => setIsExportModalOpen(false)}>
          <div className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[560px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b-2 border-border-light bg-bg-secondary flex justify-between items-center sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Download size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-text-primary m-0 tracking-tight uppercase">Ekspor Data Pekerja</h3>
                  <span className="text-xs font-bold text-text-muted">Pilih kolom & opsi format judul tabel</span>
                </div>
              </div>
              <button className="w-8 h-8 rounded-full bg-border border-none flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer" onClick={() => setIsExportModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              {/* Header toggle */}
              <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-text-primary uppercase block">Sertakan Judul Kolom (Headers)</span>
                  <span className="text-[11px] text-text-muted block">
                    {includeHeaders 
                      ? 'Baris pertama berisikan nama kolom' 
                      : 'Baris judul disembunyikan (langsung baris data)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIncludeHeaders(!includeHeaders)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    includeHeaders ? 'bg-primary' : 'bg-slate-300'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    includeHeaders ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Column selection tools */}
              <div>
                <div className="flex justify-between items-center mb-2.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-wider">
                    Pilih Kolom ({selectedColumns.length} dipilih)
                  </label>
                  <div className="flex gap-2">
                    <button 
                      type="button" 
                      onClick={() => setSelectedColumns(EXPORTABLE_COLUMNS.map(c => c.key))}
                      className="text-[10px] font-black text-primary hover:underline uppercase"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-300">|</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedColumns(['no', 'fullName', 'phone', 'role', 'emergencyContactName', 'emergencyContactPhone'])}
                      className="text-[10px] font-black text-primary hover:underline uppercase"
                    >
                      Ringkas & Kontak
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto p-2 border border-border-light rounded-xl bg-slate-50/50">
                  {EXPORTABLE_COLUMNS.map(col => {
                    const isChecked = selectedColumns.includes(col.key);
                    return (
                      <label 
                        key={col.key} 
                        className={`flex items-center gap-2 p-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                          isChecked ? 'bg-white text-text-primary shadow-xs border border-primary/30' : 'text-text-muted hover:bg-white/60'
                        }`}
                      >
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleColumnSelection(col.key)}
                          className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                        />
                        <span className="truncate">{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleExport('excel')}
                  className="flex items-center justify-center gap-2 py-3.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-800/20 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <FileSpreadsheet size={16} />
                  <span>Ekspor Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleExport('csv')}
                  className="flex items-center justify-center gap-2 py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-slate-900/20 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <FileText size={16} />
                  <span>Ekspor CSV (.csv)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: IMPORT SPREADSHEET (XLSX / CSV)     */}
      {/* ========================================== */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" onClick={() => setIsImportModalOpen(false)}>
          <div className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[580px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b-2 border-border-light bg-bg-secondary flex justify-between items-center sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Upload size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-text-primary m-0 tracking-tight uppercase">Impor Data Pekerja</h3>
                  <span className="text-xs font-bold text-text-muted">Mendukung format .xlsx dan .csv</span>
                </div>
              </div>
              <button className="w-8 h-8 rounded-full bg-border border-none flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer" onClick={() => setIsImportModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="p-6 space-y-5 overflow-y-auto">
              {/* Step 1: Download Template */}
              <div className="p-4 bg-sky-50 border-2 border-sky-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-sky-900 uppercase block">1. Unduh Template Resmi</span>
                  <span className="text-[11px] text-sky-700 block mt-0.5">
                    Gunakan template standar agar nama kolom dan format kontak darurat cocok otomatis.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => downloadImportTemplate()}
                  className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider shrink-0"
                >
                  <Download size={14} />
                  <span>Unduh Template</span>
                </button>
              </div>

              {/* Step 2: File Picker */}
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-wider mb-2">
                  2. Pilih File Excel / CSV
                </label>
                <div className="border-2 border-dashed border-border-light hover:border-primary rounded-2xl p-6 text-center bg-slate-50/50 transition-colors">
                  <input 
                    type="file" 
                    accept=".xlsx,.xls,.csv"
                    required
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="hidden" 
                    id="worker-import-file"
                  />
                  <label htmlFor="worker-import-file" className="cursor-pointer flex flex-col items-center">
                    <FileSpreadsheet size={36} className="text-primary mb-2" />
                    <span className="text-sm font-black text-text-primary">
                      {importFile ? importFile.name : 'Klik untuk memilih file spreadsheet'}
                    </span>
                    <span className="text-xs text-text-muted mt-1 font-medium">
                      {importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : 'Format .xlsx atau .csv (Maks 10MB)'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Import Results Feedback */}
              {importResult && (
                <div className={`p-4 rounded-xl border-2 ${
                  (importResult.failedCount || 0) > 0 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {(importResult.failedCount || 0) > 0 ? (
                      <AlertCircle size={18} className="text-amber-700 shrink-0" />
                    ) : (
                      <CheckCircle size={18} className="text-emerald-700 shrink-0" />
                    )}
                    <span className="text-xs font-black uppercase tracking-wider text-text-primary">
                      {importResult.msg}
                    </span>
                  </div>

                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="mt-2 text-xs text-red-700 font-medium space-y-1 max-h-32 overflow-y-auto bg-white/60 p-2 rounded">
                      {importResult.errors.map((err, i) => (
                        <div key={i}>
                          {err.row ? `Baris ${err.row}: ` : ''}{err.error}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  className="flex-1 py-3.5 bg-bg-white border-2 border-border-light rounded-xl text-xs font-black text-text-secondary cursor-pointer hover:bg-bg-secondary uppercase tracking-wider" 
                  onClick={() => setIsImportModalOpen(false)}
                >
                  Tutup
                </button>
                <button 
                  type="submit" 
                  disabled={isImporting || !importFile}
                  className="flex-[2] py-3.5 bg-primary text-white border-none rounded-xl text-xs font-black cursor-pointer hover:bg-primary/90 uppercase tracking-wider shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {isImporting ? 'Memproses Impor...' : 'Mulai Impor Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: QUICK ADD (BULK MULTI-ROW EDITOR)   */}
      {/* ========================================== */}
      {isQuickAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-3 animate-in fade-in duration-200">
          <div className="bg-bg-white rounded-3xl w-full max-w-[1280px] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b-2 border-border-light bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
                  <Layers size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight m-0">
                    Quick Add — Tambah Cepat Banyak Pekerja Sekaligus
                  </h3>
                  <span className="text-xs text-emerald-100 font-bold">
                    Input beberapa pekerja dalam tabel sekaligus dan simpan sekali klik
                  </span>
                </div>
              </div>
              <button className="w-8 h-8 rounded-full bg-white/10 border-none flex items-center justify-center text-white hover:bg-white/20 cursor-pointer" onClick={() => setIsQuickAddModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Sub-toolbar */}
            <div className="p-4 bg-slate-50 border-b border-border-light flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addBulkRow}
                  className="flex items-center gap-1.5 bg-primary text-white text-xs font-black px-3.5 py-2 rounded-xl uppercase tracking-wider hover:bg-primary/90 cursor-pointer"
                >
                  <Plus size={15} strokeWidth={3} />
                  <span>Tambah Baris</span>
                </button>
                <button
                  type="button"
                  onClick={autoGenerateUsernames}
                  className="flex items-center gap-1.5 bg-bg-white text-text-primary border border-border-light text-xs font-bold px-3 py-2 rounded-xl hover:bg-slate-100 cursor-pointer"
                  title="Otomatis isi username dan email dari Nama Lengkap"
                >
                  <span>Auto-Usernames</span>
                </button>
                <button
                  type="button"
                  onClick={autoGeneratePasswords}
                  className="flex items-center gap-1.5 bg-bg-white text-text-primary border border-border-light text-xs font-bold px-3 py-2 rounded-xl hover:bg-slate-100 cursor-pointer"
                  title="Otomatis isi password acak yang aman"
                >
                  <span>Auto-Passwords</span>
                </button>
              </div>

              <span className="text-xs font-bold text-text-muted">
                Total: <span className="font-black text-text-primary">{bulkRows.length} baris</span>
              </span>
            </div>

            {/* Table Editor */}
            <div className="p-4 overflow-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-text-primary font-black uppercase tracking-wider border-b-2 border-border-light">
                    <th className="py-2.5 px-3 w-12 text-left font-mono tabular-nums">#</th>
                    <th className="py-2.5 px-3 min-w-[160px] text-left">Nama Lengkap *</th>
                    <th className="py-2.5 px-3 min-w-[130px] text-left">Username *</th>
                    <th className="py-2.5 px-3 min-w-[150px] text-left">Email *</th>
                    <th className="py-2.5 px-3 min-w-[120px] text-left">Password *</th>
                    <th className="py-2.5 px-3 min-w-[120px] text-left">Role</th>
                    <th className="py-2.5 px-3 min-w-[130px] text-left">Status Kerja</th>
                    <th className="py-2.5 px-3 min-w-[120px] text-left">Jabatan</th>
                    <th className="py-2.5 px-3 min-w-[130px] text-left">BPJS TK</th>
                    <th className="py-2.5 px-3 min-w-[130px] text-left">BPJS Kesehatan</th>
                    <th className="py-2.5 px-3 min-w-[140px] text-left">Kontak Darurat (Nama)</th>
                    <th className="py-2.5 px-3 min-w-[120px] text-left">Kontak Darurat (HP)</th>
                    <th className="py-2.5 px-3 min-w-[100px] text-left">Hubungan</th>
                    <th className="py-2.5 px-3 w-12 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {bulkRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 text-left font-mono tabular-nums font-bold text-text-muted">{idx + 1}</td>
                      <td className="py-2 px-2 text-left">
                        <input 
                          type="text"
                          required
                          placeholder="Nama Lengkap"
                          value={row.fullName}
                          onChange={(e) => updateBulkRow(idx, 'fullName', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-border-light rounded-lg font-bold text-xs bg-white outline-none focus:border-primary"
                        />
                      </td>
                      <td className="py-2 px-2 text-left">
                        <input 
                          type="text"
                          required
                          placeholder="username"
                          value={row.username}
                          onChange={(e) => updateBulkRow(idx, 'username', e.target.value.toLowerCase())}
                          className="w-full px-2.5 py-1.5 border border-border-light rounded-lg font-bold text-xs bg-white outline-none focus:border-primary lowercase"
                        />
                      </td>
                      <td className="py-2 px-2 text-left">
                        <input 
                          type="email"
                          required
                          placeholder="email@mterp.com"
                          value={row.email}
                          onChange={(e) => updateBulkRow(idx, 'email', e.target.value.toLowerCase())}
                          className="w-full px-2.5 py-1.5 border border-border-light rounded-lg font-bold text-xs bg-white outline-none focus:border-primary"
                        />
                      </td>
                      <td className="py-2 px-2 text-left">
                        <input 
                          type="text"
                          required
                          placeholder="Min. 6 char"
                          value={row.password}
                          onChange={(e) => updateBulkRow(idx, 'password', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-border-light rounded-lg font-mono text-xs bg-white outline-none focus:border-primary"
                        />
                      </td>
                      <td className="py-2 px-2 text-left">
                        <select
                          value={row.role}
                          onChange={(e) => updateBulkRow(idx, 'role', e.target.value)}
                          className="w-full py-1.5 px-2 border border-border-light rounded-lg text-xs font-bold bg-white outline-none focus:border-primary"
                        >
                          {ROLE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2 text-left">
                        <select
                          value={row.employmentType}
                          onChange={(e) => updateBulkRow(idx, 'employmentType', e.target.value)}
                          className="w-full py-1.5 px-2 border border-border-light rounded-lg text-xs font-bold bg-white outline-none focus:border-primary"
                        >
                          {EMPLOYMENT_TYPE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label.split(' ')[0]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2 text-left">
                        <input 
                          type="text"
                          placeholder="Jabatan"
                          value={row.position}
                          onChange={(e) => updateBulkRow(idx, 'position', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-border-light rounded-lg text-xs font-bold bg-white outline-none focus:border-primary"
                        />
                      </td>
                      <td className="py-2 px-2 text-left">
                        <input 
                          type="text" 
                          placeholder="No BPJS TK"
                          value={row.bpjsTk}
                          onChange={(e) => updateBulkRow(idx, 'bpjsTk', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-border-light rounded-lg text-xs font-mono tabular-nums font-bold bg-white outline-none focus:border-primary"
                        />
                      </td>
                      <td className="py-2 px-2 text-left">
                        <input 
                          type="text" 
                          placeholder="No BPJS Kes"
                          value={row.bpjsKesehatan}
                          onChange={(e) => updateBulkRow(idx, 'bpjsKesehatan', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-border-light rounded-lg text-xs font-mono tabular-nums font-bold bg-white outline-none focus:border-primary"
                        />
                      </td>
                      <td className="py-2 px-2 text-left">
                        <input 
                          type="text" 
                          placeholder="Nama Kontak Darurat"
                          value={row.emergencyContactName}
                          onChange={(e) => updateBulkRow(idx, 'emergencyContactName', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-border-light rounded-lg text-xs font-bold bg-white outline-none focus:border-primary"
                        />
                      </td>
                      <td className="py-2 px-2 text-left">
                        <input 
                          type="text" 
                          placeholder="No HP Darurat"
                          value={row.emergencyContactPhone}
                          onChange={(e) => updateBulkRow(idx, 'emergencyContactPhone', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-border-light rounded-lg text-xs font-mono tabular-nums font-bold bg-white outline-none focus:border-primary"
                        />
                      </td>
                      <td className="py-2 px-2 text-left">
                        <input 
                          type="text" 
                          placeholder="Hubungan"
                          value={row.emergencyContactRel}
                          onChange={(e) => updateBulkRow(idx, 'emergencyContactRel', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-border-light rounded-lg text-xs font-bold bg-white outline-none focus:border-primary"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          disabled={bulkRows.length <= 1}
                          onClick={() => removeBulkRow(idx)}
                          className="text-red-500 hover:text-red-700 disabled:opacity-20 cursor-pointer inline-flex items-center justify-end"
                          title="Hapus Baris"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Results Feedback Banner */}
            {bulkResult && (
              <div className="p-4 bg-slate-50 border-t border-border-light flex flex-col gap-1 shrink-0">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-600" />
                  <span className="text-xs font-black text-text-primary">
                    Hasil: {bulkResult.createdCount} user berhasil dibuat, {bulkResult.failedCount} gagal
                  </span>
                </div>
                {bulkResult.errors.length > 0 && (
                  <div className="text-xs text-red-600 font-medium">
                    {bulkResult.errors.map((err, i) => (
                      <div key={i}>Baris {err.index + 1}: {err.error}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="p-4 bg-slate-100 border-t-2 border-border-light flex justify-end gap-3 shrink-0">
              <button
                type="button"
                className="px-5 py-3 bg-white border border-border-light rounded-xl text-xs font-black text-text-secondary cursor-pointer hover:bg-slate-50 uppercase tracking-wider"
                onClick={() => setIsQuickAddModalOpen(false)}
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={isBulkSubmitting}
                onClick={handleBulkSubmit}
                className="px-6 py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-800/20 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isBulkSubmitting ? 'Menyimpan...' : `Simpan ${bulkRows.length} Pekerja Sekaligus`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: EDIT ROLE ONLY                      */}
      {/* ========================================== */}
      {isEditRoleModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" onClick={() => setIsEditRoleModalOpen(false)}>
          <div className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[420px] shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b-2 border-border-light bg-bg-secondary flex justify-between items-center sticky top-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-info-bg flex items-center justify-center text-info shrink-0">
                  <ShieldAlert size={20} strokeWidth={2.5} />
                </div>
                <h3 className="text-xl font-black text-text-primary m-0 tracking-tight uppercase">Ubah Role / Peran</h3>
              </div>
              <button className="w-8 h-8 rounded-full bg-border border-none flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer" onClick={() => setIsEditRoleModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-bg-secondary/50 p-4 rounded-xl border border-border-light/50 flex flex-col">
                <span className="text-[10px] font-bold text-text-muted uppercase mb-1">Target User</span>
                <span className="text-base font-black text-text-primary">{selectedUser.fullName}</span>
                <span className="text-xs text-text-secondary">@{selectedUser.username}</span>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-2">Role Baru</label>
                <div className="relative">
                  <select 
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full py-3.5 pr-10 pl-4 border-2 border-border-light rounded-xl text-text-primary text-sm font-black cursor-pointer appearance-none outline-none bg-bg-white focus:border-primary shadow-sm"
                  >
                    {ROLE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button type="button" className="flex-1 py-4 bg-bg-white border-2 border-border-light rounded-xl text-sm font-black text-text-secondary cursor-pointer hover:bg-bg-secondary uppercase tracking-wider" onClick={() => setIsEditRoleModalOpen(false)}>Batal</button>
                <button type="button" className="flex-[2] py-4 bg-primary text-white border-none rounded-xl text-sm font-black cursor-pointer shadow-lg shadow-primary/20 hover:bg-primary/90 uppercase tracking-wider" onClick={handleSaveRole}>Simpan Role</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: CREATE API KEY                      */}
      {/* ========================================== */}
      {isCreateKeyModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" onClick={() => setIsCreateKeyModalOpen(false)}>
          <div className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[460px] shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b-2 border-border-light bg-slate-900 text-white flex justify-between items-center sticky top-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 font-black">
                  <Key size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight m-0">Buat API Key Baru</h3>
                  <span className="text-xs text-slate-300">Akses eksternal endpoint /api/pekerja</span>
                </div>
              </div>
              <button className="w-8 h-8 rounded-full bg-white/10 border-none flex items-center justify-center text-white cursor-pointer" onClick={() => setIsCreateKeyModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateApiKey} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase mb-1.5">
                  Nama Identitas Kunci (Label) *
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Software Payroll Pusat, App Mobile Mandor"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full px-3.5 py-3 border-2 border-border-light rounded-xl font-bold text-text-primary bg-bg-white focus:border-primary outline-none text-sm"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
                Kunci mentah hanya akan ditampilkan <strong>sekali</strong> setelah dibuat. Simpan di tempat yang aman.
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  className="flex-1 py-3.5 bg-bg-white border-2 border-border-light rounded-xl text-xs font-black text-text-secondary cursor-pointer hover:bg-bg-secondary uppercase tracking-wider" 
                  onClick={() => setIsCreateKeyModalOpen(false)}
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="flex-[2] py-3.5 bg-primary text-white border-none rounded-xl text-xs font-black cursor-pointer hover:bg-primary/90 uppercase tracking-wider shadow-lg shadow-primary/20"
                >
                  Generate Kunci
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: SHOW CREATED API KEY (ONCE)         */}
      {/* ========================================== */}
      {createdKeyData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1100] p-4 animate-in fade-in duration-200">
          <div className="bg-bg-white rounded-3xl w-full max-w-[500px] shadow-2xl overflow-hidden flex flex-col p-6 space-y-4 border-2 border-amber-400">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Key size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-text-primary m-0 uppercase">API Key Berhasil Dibuat</h3>
                <span className="text-xs font-bold text-text-muted">{createdKeyData.name}</span>
              </div>
            </div>

            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl text-xs text-red-800 font-bold">
              PENTING: Salin kunci ini sekarang! Kunci ini tidak dapat ditampilkan kembali setelah Anda menutup jendela ini.
            </div>

            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase mb-1.5">
                Kunci API (Header: X-API-Key)
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={createdKeyData.rawKey || ''}
                  className="flex-1 p-3 bg-slate-100 border-2 border-slate-300 rounded-xl font-mono text-xs font-black select-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdKeyData.rawKey || '')}
                  className="flex items-center gap-1.5 bg-primary text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-primary/90 active:scale-95 cursor-pointer shrink-0"
                >
                  {hasCopiedKey ? <Check size={16} /> : <Copy size={16} />}
                  <span>{hasCopiedKey ? 'Tersalin' : 'Salin'}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCreatedKeyData(null)}
              className="w-full py-3.5 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all cursor-pointer mt-2"
            >
              Saya Sudah Menyimpan Kunci Ini
            </button>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: USER PORTFOLIO & QUALIFICATIONS     */}
      {/* ========================================== */}
      {portfolioModalUser && (
        <UserPortfolioModal
          isOpen={Boolean(portfolioModalUser)}
          onClose={() => setPortfolioModalUser(null)}
          user={portfolioModalUser}
          initialTab={portfolioModalTab}
          onUserUpdated={(updatedUser) => {
            setUsers(prev => prev.map(u => u._id === updatedUser._id ? updatedUser : u));
            setPortfolioModalUser(updatedUser);
          }}
          onOpenViewer={(docs, initialIdx) => {
            setViewerDocs(docs);
            setViewerInitialIdx(initialIdx);
            setViewerUserName(portfolioModalUser.fullName);
            setIsViewerOpen(true);
          }}
        />
      )}

      {/* ========================================== */}
      {/* MODAL: LIVE DOCUMENT VIEWER (PDF & IMAGES) */}
      {/* ========================================== */}
      <LiveDocumentViewer
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        documents={viewerDocs}
        initialIndex={viewerInitialIdx}
        userName={viewerUserName}
      />
    </div>
  );
}
