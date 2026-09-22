import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  GraduationCap, 
  Award, 
  Upload, 
  FileText, 
  Trash2, 
  Edit3, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Eye, 
  Building2, 
  Calendar, 
  FileCheck,
  Check,
  AlertCircle
} from 'lucide-react';
import { User, CompetencyCertificate } from '../../types';
import { 
  uploadEducationData, 
  deleteEducationProof, 
  addCompetencyCertificate, 
  updateCompetencyCertificate, 
  deleteCompetencyCertificate 
} from '../../api/api';
import { ViewerDocument } from './LiveDocumentViewer';

interface UserPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onUserUpdated: (updated: User) => void;
  onOpenViewer: (documents: ViewerDocument[], initialIndex: number) => void;
  initialTab?: 'education' | 'competencies';
}

const EDUCATION_LEVELS = [
  'SD', 
  'SMP', 
  'SMA/SMK', 
  'D1', 
  'D2', 
  'D3', 
  'D4/S1', 
  'S2', 
  'S3', 
  'Lainnya'
];

export const UserPortfolioModal: React.FC<UserPortfolioModalProps> = ({
  isOpen,
  onClose,
  user,
  onUserUpdated,
  onOpenViewer,
  initialTab = 'education'
}) => {
  const [activeTab, setActiveTab] = useState<'education' | 'competencies'>(initialTab);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Education state
  const [educationForm, setEducationForm] = useState({
    level: '',
    institution: '',
    major: '',
    graduationYear: '',
  });
  const [educationFile, setEducationFile] = useState<File | null>(null);
  const [isEduDragging, setIsEduDragging] = useState(false);
  const eduFileInputRef = useRef<HTMLInputElement>(null);

  // Competency state
  const [isAddingCert, setIsAddingCert] = useState(false);
  const [editingCertId, setEditingCertId] = useState<string | null>(null);
  const [certForm, setCertForm] = useState({
    name: '',
    issuer: '',
    certificateNumber: '',
    issueDate: '',
    expiryDate: '',
    isLifetime: false,
  });
  const [certFile, setCertFile] = useState<File | null>(null);
  const [isCertDragging, setIsCertDragging] = useState(false);
  const certFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (user?.education) {
      setEducationForm({
        level: user.education.level || '',
        institution: user.education.institution || '',
        major: user.education.major || '',
        graduationYear: user.education.graduationYear || '',
      });
    } else {
      setEducationForm({
        level: '',
        institution: '',
        major: '',
        graduationYear: '',
      });
    }
    setEducationFile(null);
    setIsAddingCert(false);
    setEditingCertId(null);
    setFeedbackMsg(null);
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  // Helper to compile all viewer documents for this user
  const getAllViewerDocuments = (): ViewerDocument[] => {
    const docs: ViewerDocument[] = [];
    if (user.education?.documentUrl) {
      docs.push({
        id: 'education-proof',
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

    (user.competencies || []).forEach((c) => {
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

    return docs;
  };

  const handleOpenEducationProofViewer = () => {
    const allDocs = getAllViewerDocuments();
    const eduIdx = allDocs.findIndex(d => d.type === 'education');
    if (eduIdx !== -1) {
      onOpenViewer(allDocs, eduIdx);
    }
  };

  const handleOpenCertViewer = (certId?: string) => {
    const allDocs = getAllViewerDocuments();
    const certIdx = allDocs.findIndex(d => d.id === certId);
    if (certIdx !== -1) {
      onOpenViewer(allDocs, certIdx);
    } else {
      onOpenViewer(allDocs, 0);
    }
  };

  // Submit Education changes
  const handleSaveEducation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const formData = new FormData();
      formData.append('level', educationForm.level);
      formData.append('institution', educationForm.institution);
      formData.append('major', educationForm.major);
      formData.append('graduationYear', educationForm.graduationYear);
      if (educationFile) {
        formData.append('file', educationFile);
      }

      const updated = await uploadEducationData(user._id!, formData);
      onUserUpdated(updated);
      setEducationFile(null);
      setFeedbackMsg({ type: 'success', text: 'Data pendidikan berhasil diperbarui!' });
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { msg?: string } } };
      setFeedbackMsg({ type: 'error', text: apiErr.response?.data?.msg || 'Gagal menyimpan data pendidikan' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Education Proof
  const handleDeleteEducationProof = async () => {
    if (!window.confirm('Hapus dokumen bukti ijazah ini?')) return;
    setIsSubmitting(true);
    try {
      const updated = await deleteEducationProof(user._id!);
      onUserUpdated(updated);
      setFeedbackMsg({ type: 'success', text: 'Bukti ijazah berhasil dihapus' });
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { msg?: string } } };
      setFeedbackMsg({ type: 'error', text: apiErr.response?.data?.msg || 'Gagal menghapus bukti' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Start adding or editing competency
  const handleStartAddCert = () => {
    setEditingCertId(null);
    setCertForm({
      name: '',
      issuer: '',
      certificateNumber: '',
      issueDate: '',
      expiryDate: '',
      isLifetime: false,
    });
    setCertFile(null);
    setIsAddingCert(true);
  };

  const handleStartEditCert = (cert: CompetencyCertificate) => {
    setEditingCertId(cert._id || null);
    setCertForm({
      name: cert.name || '',
      issuer: cert.issuer || '',
      certificateNumber: cert.certificateNumber || '',
      issueDate: cert.issueDate ? new Date(cert.issueDate).toISOString().split('T')[0] : '',
      expiryDate: cert.expiryDate ? new Date(cert.expiryDate).toISOString().split('T')[0] : '',
      isLifetime: !cert.expiryDate,
    });
    setCertFile(null);
    setIsAddingCert(true);
  };

  // Submit Competency Certificate
  const handleSaveCert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certForm.name.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Nama sertifikat / kompetensi wajib diisi' });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const formData = new FormData();
      formData.append('name', certForm.name);
      formData.append('issuer', certForm.issuer);
      formData.append('certificateNumber', certForm.certificateNumber);
      if (certForm.issueDate) formData.append('issueDate', certForm.issueDate);
      if (!certForm.isLifetime && certForm.expiryDate) {
        formData.append('expiryDate', certForm.expiryDate);
      }
      if (certFile) {
        formData.append('file', certFile);
      }

      let updated: User;
      if (editingCertId) {
        updated = await updateCompetencyCertificate(user._id!, editingCertId, formData);
        setFeedbackMsg({ type: 'success', text: 'Sertifikat berhasil diperbarui!' });
      } else {
        updated = await addCompetencyCertificate(user._id!, formData);
        setFeedbackMsg({ type: 'success', text: 'Sertifikat baru berhasil ditambahkan!' });
      }

      onUserUpdated(updated);
      setIsAddingCert(false);
      setEditingCertId(null);
      setCertFile(null);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { msg?: string } } };
      setFeedbackMsg({ type: 'error', text: apiErr.response?.data?.msg || 'Gagal menyimpan sertifikat' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Competency Certificate
  const handleDeleteCert = async (certId: string, certName: string) => {
    if (!window.confirm(`Hapus sertifikat "${certName}"?`)) return;
    setIsSubmitting(true);
    try {
      const updated = await deleteCompetencyCertificate(user._id!, certId);
      onUserUpdated(updated);
      setFeedbackMsg({ type: 'success', text: 'Sertifikat berhasil dihapus' });
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { msg?: string } } };
      setFeedbackMsg({ type: 'error', text: apiErr.response?.data?.msg || 'Gagal menghapus sertifikat' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getExpiryPill = (expiryDate?: string) => {
    if (!expiryDate) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
          <Clock size={11} /> Seumur Hidup
        </span>
      );
    }

    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 border border-red-500/20">
          <AlertTriangle size={11} /> Kedaluwarsa
        </span>
      );
    }
    if (diffDays <= 60) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/20">
          <Clock size={11} /> Exp dlm {diffDays} hari
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
        <CheckCircle2 size={11} /> Berlaku s/d {expiry.toLocaleDateString('id-ID')}
      </span>
    );
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div 
      className="fixed inset-0 z-[1500] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-bg-white border-2 border-border-light rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header with Worker Info */}
        <div className="p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-black text-xl shrink-0 overflow-hidden shadow-inner">
              {user.profileImage ? (
                <img src={user.profileImage} alt={user.fullName} className="w-full h-full object-cover" />
              ) : (
                <span>{user.fullName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-black text-white m-0 tracking-tight">{user.fullName}</h3>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/10 text-slate-300 border border-white/10">
                  {user.role}
                </span>
                {user.position && (
                  <span className="text-[11px] font-bold text-primary-light">
                    • {user.position}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 m-0 mt-1 font-medium">
                Kelola berkas bukti kualifikasi pendidikan formal dan sertifikat keahlian konstruksi
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b-2 border-border-light bg-bg-secondary/40 px-6 shrink-0">
          <button
            onClick={() => {
              setActiveTab('education');
              setFeedbackMsg(null);
            }}
            className={`flex items-center gap-2 py-3.5 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'education'
                ? 'border-primary text-primary bg-bg-white shadow-xs'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <GraduationCap size={16} />
            <span>Pendidikan Terakhir</span>
            {user.education?.level && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-primary/10 text-primary font-bold">
                {user.education.level}
              </span>
            )}
            {user.education?.documentUrl && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Ada bukti ijazah" />
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('competencies');
              setFeedbackMsg(null);
            }}
            className={`flex items-center gap-2 py-3.5 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'competencies'
                ? 'border-primary text-primary bg-bg-white shadow-xs'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Award size={16} />
            <span>Kompetensi & Sertifikasi</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-white font-bold">
              {user.competencies?.length || 0}
            </span>
          </button>
        </div>

        {/* Feedback Alert if any */}
        {feedbackMsg && (
          <div className={`mx-6 mt-4 p-3 rounded-xl flex items-center gap-2 text-xs font-bold ${
            feedbackMsg.type === 'success' 
              ? 'bg-emerald-500/10 text-emerald-800 border border-emerald-500/30' 
              : 'bg-red-500/10 text-red-800 border border-red-500/30'
          }`}>
            {feedbackMsg.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> : <AlertCircle size={16} className="text-red-600 shrink-0" />}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Modal Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* ==================================================== */}
          {/* TAB 1: PENDIDIKAN TERAKHIR                          */}
          {/* ==================================================== */}
          {activeTab === 'education' && (
            <form onSubmit={handleSaveEducation} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                    Jenjang Pendidikan
                  </label>
                  <select
                    value={educationForm.level}
                    onChange={(e) => setEducationForm({ ...educationForm, level: e.target.value })}
                    className="w-full py-2.5 px-3 border-2 border-border-light rounded-xl font-bold text-sm text-text-primary bg-bg-white outline-none focus:border-primary transition-all"
                  >
                    <option value="">Pilih Jenjang Pendidikan</option>
                    {EDUCATION_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>{lvl}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                    Tahun Kelulusan
                  </label>
                  <input
                    type="text"
                    value={educationForm.graduationYear}
                    onChange={(e) => setEducationForm({ ...educationForm, graduationYear: e.target.value })}
                    placeholder="Contoh: 2021"
                    className="w-full py-2.5 px-3.5 border-2 border-border-light rounded-xl font-bold text-sm text-text-primary bg-bg-white outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                    Nama Institusi / Sekolah / Universitas
                  </label>
                  <input
                    type="text"
                    value={educationForm.institution}
                    onChange={(e) => setEducationForm({ ...educationForm, institution: e.target.value })}
                    placeholder="Contoh: Universitas Indonesia / SMKN 1 Jakarta"
                    className="w-full py-2.5 px-3.5 border-2 border-border-light rounded-xl font-bold text-sm text-text-primary bg-bg-white outline-none focus:border-primary transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                    Jurusan / Program Studi
                  </label>
                  <input
                    type="text"
                    value={educationForm.major}
                    onChange={(e) => setEducationForm({ ...educationForm, major: e.target.value })}
                    placeholder="Contoh: Teknik Sipil / Konstruksi Gedung"
                    className="w-full py-2.5 px-3.5 border-2 border-border-light rounded-xl font-bold text-sm text-text-primary bg-bg-white outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>

              {/* Bukti Ijazah / Dokumen Section */}
              <div className="pt-2">
                <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-2">
                  Berkas Bukti Ijazah / SKL (PDF atau Gambar)
                </label>

                {/* Existing Document Card */}
                {user.education?.documentUrl && !educationFile && (
                  <div className="p-4 rounded-2xl bg-slate-50 border-2 border-border-light flex items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                        <FileText size={20} />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-text-primary flex items-center gap-2">
                          <span className="truncate max-w-[240px]">{user.education.documentName || 'Dokumen Ijazah'}</span>
                          {user.education.documentSize ? (
                            <span className="text-[10px] text-text-muted font-normal">
                              ({formatFileSize(user.education.documentSize)})
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-text-muted mt-0.5">
                          Tersimpan • Klik untuk melihat dokumen di Live Viewer
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenEducationProofViewer}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer shadow-sm"
                      >
                        <Eye size={14} />
                        <span>Lihat Bukti</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDeleteEducationProof}
                        disabled={isSubmitting}
                        className="w-8 h-8 rounded-xl bg-bg-white border border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                        title="Hapus Bukti Dokumen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Upload or Replace Dropzone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsEduDragging(true); }}
                  onDragLeave={() => setIsEduDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsEduDragging(false);
                    if (e.dataTransfer.files?.[0]) {
                      setEducationFile(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => eduFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                    isEduDragging 
                      ? 'border-primary bg-primary/5 scale-[0.99]' 
                      : educationFile
                        ? 'border-emerald-500 bg-emerald-500/5'
                        : 'border-border-light hover:border-primary/50 bg-bg-secondary/30'
                  }`}
                >
                  <input
                    ref={eduFileInputRef}
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setEducationFile(e.target.files[0]);
                      }
                    }}
                  />

                  {educationFile ? (
                    <div className="flex items-center justify-center gap-3 text-emerald-700 font-bold text-xs">
                      <CheckCircle2 size={20} className="text-emerald-600" />
                      <span>Berkas dipilih: <strong className="font-black text-text-primary">{educationFile.name}</strong> ({formatFileSize(educationFile.size)})</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEducationFile(null);
                        }}
                        className="ml-2 text-text-muted hover:text-red-600"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload size={24} className="mx-auto text-text-muted" />
                      <div className="text-xs font-bold text-text-primary">
                        {user.education?.documentUrl ? 'Ganti berkas ijazah dengan yang baru' : 'Unggah berkas bukti ijazah (Ijazah / SKL / Transkrip)'}
                      </div>
                      <div className="text-[11px] text-text-muted">
                        Format PDF, JPG, PNG, atau WEBP (Maksimal 10MB). Seret dan lepas berkas ke sini.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Action */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-light">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-primary/20 flex items-center gap-2"
                >
                  <Check size={16} />
                  <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Data Pendidikan'}</span>
                </button>
              </div>
            </form>
          )}

          {/* ==================================================== */}
          {/* TAB 2: KOMPETENSI & SERTIFIKASI                     */}
          {/* ==================================================== */}
          {activeTab === 'competencies' && (
            <div className="space-y-5">
              {/* Header with Add Button */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-text-primary m-0 tracking-tight">
                    Daftar Sertifikat & Lisensi Konstruksi
                  </h4>
                  <p className="text-xs text-text-muted m-0 mt-0.5">
                    Catat keahlian bersertifikasi (K3, SKA/SKT, SIO, BNSP, Lisensi Operator, dll.)
                  </p>
                </div>

                {!isAddingCert && (
                  <button
                    onClick={handleStartAddCert}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-primary/90 transition-all cursor-pointer shadow-md shadow-primary/20"
                  >
                    <Plus size={15} />
                    <span>Tambah Sertifikat</span>
                  </button>
                )}
              </div>

              {/* Add / Edit Form Card */}
              {isAddingCert && (
                <form onSubmit={handleSaveCert} className="p-5 rounded-2xl bg-primary/5 border-2 border-primary/20 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between pb-2 border-b border-primary/10">
                    <div className="text-xs font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                      <Award size={16} />
                      <span>{editingCertId ? 'Edit Data Sertifikat' : 'Tambah Sertifikat Baru'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddingCert(false)}
                      className="text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1">
                        Nama Sertifikat / Kompetensi *
                      </label>
                      <input
                        type="text"
                        required
                        value={certForm.name}
                        onChange={(e) => setCertForm({ ...certForm, name: e.target.value })}
                        placeholder="Contoh: Ahli K3 Konstruksi Madya"
                        className="w-full py-2 px-3 border border-border-light rounded-xl font-bold text-xs bg-bg-white outline-none focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1">
                        Lembaga Penerbit
                      </label>
                      <input
                        type="text"
                        value={certForm.issuer}
                        onChange={(e) => setCertForm({ ...certForm, issuer: e.target.value })}
                        placeholder="Contoh: BNSP / Kementerian PUPR / Kemnaker"
                        className="w-full py-2 px-3 border border-border-light rounded-xl font-bold text-xs bg-bg-white outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1">
                        Nomor Registrasi / Sertifikat
                      </label>
                      <input
                        type="text"
                        value={certForm.certificateNumber}
                        onChange={(e) => setCertForm({ ...certForm, certificateNumber: e.target.value })}
                        placeholder="Contoh: K3-2023-88219"
                        className="w-full py-2 px-3 border border-border-light rounded-xl font-bold text-xs bg-bg-white outline-none focus:border-primary font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1">
                        Tanggal Terbit
                      </label>
                      <input
                        type="date"
                        value={certForm.issueDate}
                        onChange={(e) => setCertForm({ ...certForm, issueDate: e.target.value })}
                        className="w-full py-2 px-3 border border-border-light rounded-xl font-bold text-xs bg-bg-white outline-none focus:border-primary"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted">
                          Kedaluwarsa
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-text-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={certForm.isLifetime}
                            onChange={(e) => setCertForm({ ...certForm, isLifetime: e.target.checked })}
                            className="rounded border-border-light"
                          />
                          <span>Seumur Hidup</span>
                        </label>
                      </div>
                      <input
                        type="date"
                        disabled={certForm.isLifetime}
                        value={certForm.expiryDate}
                        onChange={(e) => setCertForm({ ...certForm, expiryDate: e.target.value })}
                        className="w-full py-2 px-3 border border-border-light rounded-xl font-bold text-xs bg-bg-white outline-none focus:border-primary disabled:opacity-40 disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  {/* Certificate Document Upload Box */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                      Lampirkan Dokumen Sertifikat (PDF atau Gambar)
                    </label>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsCertDragging(true); }}
                      onDragLeave={() => setIsCertDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsCertDragging(false);
                        if (e.dataTransfer.files?.[0]) {
                          setCertFile(e.dataTransfer.files[0]);
                        }
                      }}
                      onClick={() => certFileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
                        isCertDragging 
                          ? 'border-primary bg-primary/10' 
                          : certFile
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-border-light bg-bg-white hover:border-primary/50'
                      }`}
                    >
                      <input
                        ref={certFileInputRef}
                        type="file"
                        accept=".pdf,image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setCertFile(e.target.files[0]);
                          }
                        }}
                      />

                      {certFile ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-700 text-xs font-bold">
                          <CheckCircle2 size={16} />
                          <span>Berkas: <strong>{certFile.name}</strong> ({formatFileSize(certFile.size)})</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-text-muted text-xs">
                          <Upload size={16} />
                          <span>Klik atau seret dokumen sertifikat di sini (PDF / Gambar)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingCert(false)}
                      className="px-4 py-2 rounded-xl bg-bg-white border border-border-light text-xs font-bold text-text-secondary hover:bg-bg-secondary cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-primary/90 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      {isSubmitting ? 'Menyimpan...' : (editingCertId ? 'Perbarui Sertifikat' : 'Simpan Sertifikat')}
                    </button>
                  </div>
                </form>
              )}

              {/* Existing Certificates List */}
              {(!user.competencies || user.competencies.length === 0) && !isAddingCert ? (
                <div className="py-12 text-center border-2 border-dashed border-border-light rounded-2xl p-6 bg-bg-secondary/20">
                  <Award size={36} className="mx-auto text-text-muted/40 mb-2" />
                  <div className="text-xs font-bold text-text-primary">Belum ada sertifikat tercatat</div>
                  <div className="text-[11px] text-text-muted mt-0.5 mb-4">
                    Pekerja ini belum memiliki data sertifikat kompetensi atau lisensi keahlian.
                  </div>
                  <button
                    onClick={handleStartAddCert}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer shadow-sm"
                  >
                    <Plus size={14} />
                    <span>Tambah Sertifikat Pertama</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {user.competencies?.map((cert) => (
                    <div
                      key={cert._id}
                      className="p-4 rounded-2xl bg-bg-white border-2 border-border-light hover:border-primary/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm text-text-primary">{cert.name}</span>
                          {getExpiryPill(cert.expiryDate)}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
                          {cert.issuer && (
                            <span className="flex items-center gap-1 font-medium">
                              <Building2 size={13} className="text-text-muted" />
                              <span className="font-bold text-text-secondary">{cert.issuer}</span>
                            </span>
                          )}
                          {cert.certificateNumber && (
                            <span className="flex items-center gap-1 font-mono text-[11px]">
                              <FileCheck size={13} className="text-text-muted" />
                              <span>No: {cert.certificateNumber}</span>
                            </span>
                          )}
                          {cert.issueDate && (
                            <span className="flex items-center gap-1 text-[11px]">
                              <Calendar size={13} className="text-text-muted" />
                              <span>Terbit: {new Date(cert.issueDate).toLocaleDateString('id-ID')}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border-light/60">
                        {cert.documentUrl ? (
                          <button
                            type="button"
                            onClick={() => handleOpenCertViewer(cert._id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/20 text-xs font-bold transition-all cursor-pointer"
                            title="Buka dokumen di Live Viewer"
                          >
                            <Eye size={14} />
                            <span>Lihat Sertifikat</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-text-muted italic px-2">Tanpa dokumen</span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleStartEditCert(cert)}
                          className="w-8 h-8 rounded-xl bg-bg-secondary hover:bg-border-light text-text-secondary hover:text-text-primary flex items-center justify-center transition-colors cursor-pointer"
                          title="Edit Sertifikat"
                        >
                          <Edit3 size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteCert(cert._id!, cert.name)}
                          className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition-colors cursor-pointer border border-red-200"
                          title="Hapus Sertifikat"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default UserPortfolioModal;
