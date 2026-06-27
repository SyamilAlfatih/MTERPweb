import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, Upload, Search, Trash2, Download,
  ExternalLink, X, File, Image, FileSpreadsheet, FolderOpen,
  Filter, Plus, Clock, User as UserIcon, HardDrive,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { uploadProjectDocuments, deleteProjectDocument } from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Button, Input, EmptyState, LoadingOverlay } from '../components/shared';
import { ProjectData, ProjectDocument } from '../types';
import { formatDate as formatWIBDate } from '../utils/date';

// Category config
const CATEGORIES = [
  { key: 'all', label: 'All', color: '#6366f1', bg: '#EEF2FF' },
  { key: 'shopDrawing', label: 'Shop Drawing', color: '#6366f1', bg: '#EEF2FF' },
  { key: 'hse', label: 'HSE', color: '#059669', bg: '#D1FAE5' },
  { key: 'manPowerList', label: 'Man Power', color: '#2563EB', bg: '#DBEAFE' },
  { key: 'materialList', label: 'Material', color: '#D97706', bg: '#FEF3C7' },
  { key: 'contract', label: 'Contract', color: '#7C3AED', bg: '#EDE9FE' },
  { key: 'permit', label: 'Permit', color: '#0891B2', bg: '#CFFAFE' },
  { key: 'asBuilt', label: 'As-Built', color: '#BE185D', bg: '#FCE7F3' },
  { key: 'other', label: 'Other', color: '#64748B', bg: '#F1F5F9' },
] as const;

const getCategoryConfig = (key: string) =>
  CATEGORIES.find(c => c.key === key) || CATEGORIES[CATEGORIES.length - 1];

// File icon by mime
const getFileIcon = (mimeType: string) => {
  if (mimeType?.startsWith('image/')) return Image;
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return FileSpreadsheet;
  if (mimeType?.includes('pdf')) return FileText;
  return File;
};

// Format file size
const formatSize = (bytes: number) => {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Build file URL from server path
const getFileUrl = (filePath: string) => {
  if (!filePath) return '';
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  const serverBase = apiBase.replace('/api', '');
  // filePath is like "...\\uploads\\documents\\file.pdf" — extract from uploads/
  const uploadsIdx = filePath.replace(/\\/g, '/').indexOf('uploads/');
  if (uploadsIdx >= 0) {
    return `${serverBase}/${filePath.replace(/\\/g, '/').substring(uploadsIdx)}`;
  }
  return filePath;
};

export default function ProjectDocuments() {
  const { t } = useTranslation();
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<ProjectData | null>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  // Upload modal
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploading, setUploading] = useState(false);

  const canManage = user?.role && ['owner', 'director', 'supervisor', 'asset_admin'].includes(user.role);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      const [projectRes, docsRes] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/documents`),
      ]);
      setProject(projectRes.data);
      setDocuments(docsRes.data || []);
    } catch (err: any) {
      console.error('Failed to fetch project documents', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!projectId || uploadFiles.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      uploadFiles.forEach(f => formData.append('files', f));
      formData.append('category', uploadCategory);

      const result = await uploadProjectDocuments(projectId, formData);
      setDocuments(result);
      setShowUpload(false);
      setUploadFiles([]);
      setUploadCategory('other');
    } catch (err: any) {
      console.error('Upload failed', err);
      alert(err.response?.data?.msg || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string, docName: string) => {
    if (!projectId) return;
    if (!confirm(`Delete "${docName}"? This cannot be undone.`)) return;
    try {
      await deleteProjectDocument(projectId, docId);
      setDocuments(prev => prev.filter(d => d._id !== docId));
    } catch (err: any) {
      console.error('Delete failed', err);
      alert(err.response?.data?.msg || 'Delete failed');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeUploadFile = (idx: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return formatWIBDate(dateStr, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Derived stats
  const categoryCounts = CATEGORIES.slice(1).reduce((acc, c) => {
    acc[c.key] = documents.filter(d => d.category === c.key).length;
    return acc;
  }, {} as Record<string, number>);

  const totalDocs = documents.length;
  const totalSize = documents.reduce((s, d) => s + (d.fileSize || 0), 0);

  // Filter
  const filtered = documents
    .filter(d => activeCategory === 'all' || d.category === activeCategory)
    .filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) {
    return (
      <div className="p-6 max-w-[1000px] mx-auto max-sm:p-3">
        <LoadingOverlay visible={true} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto max-sm:p-3">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <button
          className="w-10 h-10 rounded-lg flex items-center justify-center bg-bg-secondary text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer border-none shrink-0"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-extrabold text-text-primary m-0 mb-1 tracking-tight">
            Project Documents
          </h1>
          <p className="text-sm text-text-muted m-0">{project?.nama || 'Project'}</p>
        </div>
        {canManage && (
          <div className="max-sm:w-full [&>button]:max-sm:w-full">
            <Button
              title="Upload Document"
              icon={Upload}
              onClick={() => setShowUpload(true)}
              variant="primary"
              size="small"
            />
          </div>
        )}
      </div>

      {/* KPI Stats */}
      {totalDocs > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <div className="bg-bg-white border border-border-light rounded-lg p-4 flex gap-4 items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-300">
            <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90 bg-indigo-100 text-indigo-700">
              <FolderOpen size={20} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-2xl font-extrabold leading-tight text-text-primary">{totalDocs}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Total Files</span>
            </div>
          </div>
          <div className="bg-bg-white border border-border-light rounded-lg p-4 flex gap-4 items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-300">
            <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90 bg-emerald-100 text-emerald-700">
              <HardDrive size={20} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-2xl font-extrabold leading-tight text-text-primary">{formatSize(totalSize)}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Total Size</span>
            </div>
          </div>
          <div className="bg-bg-white border border-border-light rounded-lg p-4 flex gap-4 items-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-violet-300">
            <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-90 bg-violet-100 text-violet-700">
              <Filter size={20} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-2xl font-extrabold leading-tight text-text-primary">
                {Object.values(categoryCounts).filter(v => v > 0).length}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Categories</span>
            </div>
          </div>
        </div>
      )}

      {/* Category Filter Tabs */}
      {totalDocs > 0 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          {CATEGORIES.map(cat => {
            const count = cat.key === 'all' ? totalDocs : (categoryCounts[cat.key] || 0);
            const isActive = activeCategory === cat.key;
            if (cat.key !== 'all' && count === 0) return null;
            return (
              <button
                key={cat.key}
                className={`flex items-center gap-2 py-2 px-4 rounded-full text-xs font-bold border cursor-pointer transition-all whitespace-nowrap shrink-0 active:scale-[0.97] ${
                  isActive
                    ? 'text-white border-transparent shadow-sm'
                    : 'bg-bg-white text-text-secondary border-border-light hover:border-border hover:bg-bg-secondary'
                }`}
                style={isActive ? { backgroundColor: cat.color } : undefined}
                onClick={() => setActiveCategory(cat.key)}
              >
                {cat.label}
                <span
                  className={`text-[10px] font-extrabold py-0.5 px-1.5 rounded-full ${
                    isActive ? 'bg-white/25 text-white' : 'bg-bg-secondary text-text-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      {totalDocs > 0 && (
        <div className="mb-5">
          <Input
            placeholder="Search documents..."
            value={search}
            onChangeText={setSearch}
            icon={Search}
          />
        </div>
      )}

      {/* Empty State */}
      {totalDocs === 0 && (
        <EmptyState
          icon={FolderOpen}
          title="No Documents"
          description="Upload project documents like shop drawings, HSE plans, contracts, and more."
        />
      )}

      {/* Document Cards */}
      {filtered.length > 0 && (
        <div className="flex flex-col gap-3">
          {filtered.map((doc, index) => {
            const catConfig = getCategoryConfig(doc.category);
            const IconComp = getFileIcon(doc.mimeType);
            const uploaderName = typeof doc.uploadedBy === 'object' ? doc.uploadedBy?.fullName : '—';
            const fileUrl = getFileUrl(doc.filePath);

            return (
              <Card
                key={doc._id}
                className="relative overflow-hidden !p-0 animate-[fade-in-up_0.35s_ease_both] transition-all duration-150 hover:-translate-y-[2px] hover:shadow-lg"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {/* Category color strip */}
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: catConfig.color }} />

                <div className="p-5 flex gap-4 items-center max-sm:flex-col max-sm:items-start pl-6">
                  {/* File icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 max-sm:w-10 max-sm:h-10"
                    style={{ backgroundColor: catConfig.bg }}
                  >
                    <IconComp size={22} style={{ color: catConfig.color }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                      <h3 className="text-base font-bold text-text-primary m-0 truncate max-w-[300px]" title={doc.name}>
                        {doc.name}
                      </h3>
                      <div
                        className="text-[10px] font-bold py-1 px-2.5 rounded-full border box-border whitespace-nowrap"
                        style={{
                          backgroundColor: catConfig.bg,
                          color: catConfig.color,
                          borderColor: `${catConfig.color}30`,
                        }}
                      >
                        {catConfig.label}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-1.5">
                      <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <HardDrive size={12} className="text-text-muted" /> {formatSize(doc.fileSize)}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <Clock size={12} className="text-text-muted" /> {formatDate(doc.uploadedAt)}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <UserIcon size={12} className="text-text-muted" /> {uploaderName}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 max-sm:w-full max-sm:justify-end max-sm:pt-3 max-sm:border-t max-sm:border-dashed max-sm:border-border-light max-sm:mt-1">
                    {fileUrl && (
                      <>
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-9 h-9 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none bg-bg-secondary text-text-secondary hover:bg-primary/10 hover:text-primary no-underline"
                          title="View"
                        >
                          <ExternalLink size={16} />
                        </a>
                        <a
                          href={fileUrl}
                          download={doc.name}
                          className="w-9 h-9 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none bg-bg-secondary text-text-secondary hover:bg-emerald-50 hover:text-emerald-600 no-underline"
                          title="Download"
                        >
                          <Download size={16} />
                        </a>
                      </>
                    )}
                    {canManage && (
                      <button
                        className="w-9 h-9 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none bg-bg-secondary text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => handleDelete(doc._id, doc.name)}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* No search results */}
      {search && filtered.length === 0 && totalDocs > 0 && (
        <EmptyState
          icon={Search}
          title="No Results"
          description={`No documents matching "${search}"`}
        />
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div
          className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-[1000] backdrop-blur-[4px]"
          onClick={() => setShowUpload(false)}
        >
          <div
            className="bg-bg-white rounded-xl w-full max-w-[500px] max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border-light">
              <h2 className="m-0 font-bold text-lg text-text-primary">Upload Documents</h2>
              <button
                className="p-2 border-none bg-transparent cursor-pointer text-text-muted flex hover:bg-bg-secondary hover:text-text-primary rounded-md"
                onClick={() => setShowUpload(false)}
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* Category selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-text-primary">Category</label>
                <select
                  className="w-full p-3 border border-border rounded-md text-base text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-shadow appearance-none cursor-pointer"
                  value={uploadCategory}
                  onChange={e => setUploadCategory(e.target.value)}
                >
                  {CATEGORIES.slice(1).map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* File picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-text-primary">Files</label>
                <label className="flex items-center gap-3 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer text-text-secondary text-sm hover:border-primary hover:bg-primary/5 transition-colors">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: getCategoryConfig(uploadCategory).bg }}
                  >
                    <Upload size={18} style={{ color: getCategoryConfig(uploadCategory).color }} />
                  </div>
                  <div className="flex-1">
                    <span className="text-text-primary font-semibold">Click to select files</span>
                    <p className="text-xs text-text-muted m-0 mt-0.5">PDF, images, documents, spreadsheets • Max 10MB each</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {/* Selected files list */}
              {uploadFiles.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                    {uploadFiles.length} file{uploadFiles.length > 1 ? 's' : ''} selected
                  </span>
                  {uploadFiles.map((file, idx) => {
                    const FileIcon = getFileIcon(file.type);
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg border border-border-light animate-[fade-in-up_0.2s_ease_both]"
                        style={{ animationDelay: `${idx * 0.03}s` }}
                      >
                        <FileIcon size={16} className="text-text-muted shrink-0" />
                        <span className="flex-1 text-sm text-text-primary font-medium truncate">{file.name}</span>
                        <span className="text-xs text-text-muted shrink-0">{formatSize(file.size)}</span>
                        <button
                          className="w-7 h-7 rounded-full flex items-center justify-center bg-transparent text-text-muted cursor-pointer transition-all border-none hover:bg-rose-50 hover:text-rose-500"
                          onClick={() => removeUploadFile(idx)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-5 border-t border-border-light bg-bg-secondary/50 rounded-b-xl">
              <Button title="Cancel" variant="outline" onClick={() => setShowUpload(false)} />
              <Button
                title={uploading ? 'Uploading...' : 'Upload'}
                variant="primary"
                onClick={handleUpload}
                loading={uploading}
                icon={Upload}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
