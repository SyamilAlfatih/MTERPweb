import React, { useState, useRef } from 'react';
import { 
  X, Camera, Upload, CheckCircle2, AlertCircle, 
  Trash2, FileText, User, Calendar, ZoomIn, CheckSquare
} from 'lucide-react';
import { PhotoView } from 'react-photo-view';
import { Button } from '../shared';
import { completeTaskWithEvidence } from '../../api/api';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate as formatWIBDate } from '../../utils/date';

export interface CompletionEvidence {
  photoUrl: string;
  photos?: string[];
  notes?: string;
  submittedBy?: {
    _id: string;
    fullName: string;
    role?: string;
  };
  submittedAt?: string;
}

export interface Subtask {
  _id?: string;
  title: string;
  isCompleted: boolean;
  completedAt?: string;
}

export interface TaskData {
  _id: string;
  title: string;
  description?: string;
  scope: 'office' | 'project';
  department?: string;
  officeLocation?: string;
  projectId: { _id: string; nama: string; lokasi: string } | null;
  assignedTo: { _id: string; fullName: string; role: string; position?: string } | null;
  assignedBy: { fullName: string } | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  progress?: number;
  subtasks?: Subtask[];
  dueDate?: string;
  workItemId?: string;
  completedAt?: string;
  completionEvidence?: CompletionEvidence;
}

interface TaskCompletionModalProps {
  task: TaskData | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedTask: TaskData) => void;
}

export const TaskCompletionModal: React.FC<TaskCompletionModalProps> = ({
  task,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, {
    isActive: isOpen,
    onEscape: () => {
      if (!submitting) handleClose();
    },
  });

  const handleClose = () => {
    if (submitting) return;
    setFile(null);
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setNotes('');
    setErrorMessage(null);
    onClose();
  };

  const handleFileSelect = (selectedFile: File) => {
    setErrorMessage(null);
    if (!selectedFile.type.startsWith('image/')) {
      setErrorMessage('File bukti harus berupa gambar (JPG, PNG, WEBP).');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setErrorMessage('Ukuran file foto maksimal 10 MB.');
      return;
    }

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selectedFile);
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleRemovePhoto = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!task) return;

    if (!file) {
      setErrorMessage('Foto bukti penyelesaian wajib diunggah.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('evidence', file);
      if (notes.trim()) {
        formData.append('notes', notes.trim());
      }

      const updatedTask = await completeTaskWithEvidence(task._id, formData);
      onSuccess(updatedTask);
      handleClose();
    } catch (err: any) {
      console.error('Failed to submit task completion evidence:', err);
      setErrorMessage(
        err.response?.data?.msg || 'Gagal mengirimkan bukti penyelesaian. Silakan coba lagi.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !task) return null;

  const subtasksTotal = task.subtasks?.length || 0;
  const subtasksDone = task.subtasks?.filter(s => s.isCompleted).length || 0;
  const pendingSubtasks = subtasksTotal - subtasksDone;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-150"
      onClick={handleClose}
      role="presentation"
    >
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-completion-title"
        className="bg-bg-white rounded-2xl w-full max-w-[560px] max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col border border-border-light animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border-light bg-bg-secondary/40">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <h2 id="modal-completion-title" className="text-lg font-bold text-text-primary m-0">
                Unggah Bukti Penyelesaian Tugas
              </h2>
              <p className="text-xs text-text-muted mt-1 mb-0 leading-relaxed">
                Tugas: <span className="font-semibold text-text-secondary">{task.title}</span>
              </p>
            </div>
          </div>
          <button 
            type="button"
            className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-secondary transition-colors cursor-pointer"
            onClick={handleClose}
            disabled={submitting}
            aria-label="Tutup dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Subtask notice if applicable */}
          {subtasksTotal > 0 && pendingSubtasks > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
              <CheckSquare size={16} className="shrink-0 mt-0.5 text-amber-600" />
              <div>
                <span className="font-semibold">Perhatian Subtugas: </span>
                <span>
                  Terdapat {pendingSubtasks} dari {subtasksTotal} subtugas yang belum dicentang. 
                  Menyelesaikan tugas ini akan otomatis memajukan progress menjadi 100%.
                </span>
              </div>
            </div>
          )}

          {/* Evidence Upload Area */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-text-primary flex items-center justify-between">
              <span>Foto Bukti Penyelesaian *</span>
              <span className="text-[11px] font-normal text-text-muted">Format: JPG, PNG, WEBP (Maks. 10MB)</span>
            </label>

            {!previewUrl ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-150 ${
                  isDragging 
                    ? 'border-primary bg-primary/5 scale-[0.99]' 
                    : 'border-border-medium hover:border-primary hover:bg-slate-50/60'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2.5">
                  <Camera size={24} />
                </div>
                <div className="text-sm font-semibold text-text-primary">
                  Ambil Foto atau Pilih File Bukti
                </div>
                <p className="text-xs text-text-muted mt-1 mb-0 max-w-xs">
                  Klik untuk membuka kamera / galeri, atau seret foto hasil pengerjaan ke area ini.
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary text-xs font-semibold text-text-secondary hover:text-text-primary border border-border-light">
                  <Upload size={13} />
                  <span>Pilih Dokumen / Foto</span>
                </div>
              </div>
            ) : (
              <div className="relative rounded-xl border border-border-light overflow-hidden bg-slate-900 group">
                <img 
                  src={previewUrl} 
                  alt="Preview Bukti Penyelesaian" 
                  className="w-full h-56 object-contain bg-black/40"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 p-4">
                  <PhotoView src={previewUrl}>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-white/90 text-slate-800 text-xs font-bold flex items-center gap-1.5 hover:bg-white shadow-md transition-all cursor-pointer"
                      title="Perbesar Tampilan Foto"
                    >
                      <ZoomIn size={14} />
                      <span>Perbesar</span>
                    </button>
                  </PhotoView>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="px-3 py-1.5 rounded-lg bg-rose-600/90 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-rose-600 shadow-md transition-all cursor-pointer"
                    title="Hapus dan Ganti Foto"
                  >
                    <Trash2 size={14} />
                    <span>Ganti Foto</span>
                  </button>
                </div>
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                  <span className="text-[11px] bg-black/70 backdrop-blur-xs text-white px-2 py-0.5 rounded-md truncate max-w-[70%]">
                    {file?.name}
                  </span>
                  <span className="text-[10px] bg-emerald-600/90 text-white px-2 py-0.5 rounded-md font-semibold">
                    Siap Diunggah
                  </span>
                </div>
              </div>
            )}

            <input 
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />
          </div>

          {/* Notes / Remarks */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="completion-notes" className="text-xs font-bold uppercase tracking-wider text-text-primary flex items-center gap-1">
              <FileText size={13} className="text-text-muted" />
              <span>Catatan / Keterangan Penyelesaian (Opsional)</span>
            </label>
            <textarea
              id="completion-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Pekerjaan telah tuntas 100%, area kerja bersih dan telah diinspeksi bersama tim lapangan..."
              className="w-full p-3 border border-border-medium rounded-xl text-xs text-text-primary bg-bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all resize-none"
              maxLength={500}
            />
            <div className="flex justify-between text-[11px] text-text-muted">
              <span>Rincian hasil verifikasi lapangan atau nomor berita acara</span>
              <span>{notes.length}/500</span>
            </div>
          </div>

          {/* Audit Verification Stamp info */}
          <div className="p-3 bg-bg-secondary/60 rounded-xl border border-border-light text-xs text-text-secondary flex flex-col gap-1">
            <div className="flex items-center gap-2 text-text-primary font-semibold">
              <User size={13} className="text-primary" />
              <span>Pelapor Penyelesaian: {user?.fullName || 'Pengguna Aktif'} ({user?.role || 'Staff'})</span>
            </div>
            <div className="flex items-center gap-2 text-text-muted text-[11px]">
              <Calendar size={13} />
              <span>Waktu Submit: {formatWIBDate(new Date().toISOString(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border-light">
            <Button
              title="Batal"
              onClick={handleClose}
              variant="outline"
              disabled={submitting}
            />
            <Button
              title="Selesaikan Tugas"
              icon={CheckCircle2}
              onClick={handleSubmit}
              loading={submitting}
              disabled={!file || submitting}
              variant="primary"
            />
          </div>
        </form>
      </div>
    </div>
  );
};
