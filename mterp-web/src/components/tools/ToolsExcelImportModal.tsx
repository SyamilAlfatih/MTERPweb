import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  FileText,
  Filter,
} from 'lucide-react';
import { downloadToolImportTemplate, parseToolsExcel, commitToolsImport } from '../../api/api';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ParsedRow {
  rowNumber: number;
  nama: string;
  kategori: string;
  stok: number;
  satuan: string;
  kondisi: string;
  lokasi: string;
  notes: string;
  isDuplicate: boolean;
  existingId?: string | null;
  existingStok?: number | null;
  existingKondisi?: string | null;
  isValid: boolean;
  errors: string[];
}

interface ParseSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
}

interface ToolsExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export default function ToolsExcelImportModal({ isOpen, onClose, onSuccess }: ToolsExcelImportModalProps) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // File & parsed data
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [summary, setSummary] = useState<ParseSummary | null>(null);
  const [importMode, setImportMode] = useState<'skip' | 'update' | 'insert'>('skip');
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'duplicate' | 'invalid'>('all');
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, {
    isActive: isOpen,
    onEscape: () => {
      if (!isSubmitting) handleClose();
    },
  });

  if (!isOpen) return null;

  const handleClose = () => {
    setStep('upload');
    setFile(null);
    setParsedRows([]);
    setSummary(null);
    setErrorMessage(null);
    setPreviewFilter('all');
    onClose();
  };

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      await downloadToolImportTemplate();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.msg || 'Gagal mengunduh template Excel');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile) return;

    const ext = selectedFile.name.toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.csv')) {
      setErrorMessage('Hanya format file .xlsx, .xls, atau .csv yang didukung.');
      return;
    }

    try {
      setIsParsing(true);
      setErrorMessage(null);
      setFile(selectedFile);

      const result = await parseToolsExcel(selectedFile);
      setParsedRows(result.rows || []);
      setSummary(result.summary || null);
      setStep('preview');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.msg || 'Gagal membaca isi file Excel. Pastikan format tabel sesuai template.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleCommitImport = async () => {
    if (parsedRows.length === 0) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const res = await commitToolsImport(parsedRows, importMode);
      onSuccess(res.message || 'Impor data alat berhasil diselesaikan');
      handleClose();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.msg || 'Gagal menyimpan data impor ke database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedRows = parsedRows.filter((r) => {
    if (previewFilter === 'valid') return r.isValid && !r.isDuplicate;
    if (previewFilter === 'duplicate') return r.isDuplicate;
    if (previewFilter === 'invalid') return !r.isValid;
    return true;
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        ref={modalRef}
        className="w-full max-w-4xl bg-bg-white dark:bg-slate-900 border border-border-light dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-light dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h2 id="import-modal-title" className="text-base font-bold text-text-primary m-0 tracking-tight">
                Impor Data Inventaris Alat (Excel / CSV)
              </h2>
              <p className="text-xs text-text-muted m-0">
                {step === 'upload' ? 'Unggah file spreadsheet inventaris' : 'Pratinjau & verifikasi baris sebelum disimpan'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer border-none"
            title="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mx-5 mt-3.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer bg-transparent border-none"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {step === 'upload' ? (
            <div className="space-y-4">
              {/* Template Download Card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-teal-50/70 to-emerald-50/50 dark:from-teal-950/20 dark:to-emerald-950/20 border border-teal-200/80 dark:border-teal-800/40">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-teal-900 dark:text-teal-200">
                    <FileText size={15} className="text-teal-600" />
                    <span>Gunakan Format Standar MTERP</span>
                  </div>
                  <p className="text-xs text-text-secondary m-0">
                    Unduh template resmi berisikan contoh kolom nama alat, satuan, kondisi, dan lokasi default.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={isDownloadingTemplate}
                  className="flex items-center justify-center gap-2 py-2 px-3.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {isDownloadingTemplate ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  <span>Unduh Template (.xlsx)</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-primary bg-primary/5 scale-[1.005]'
                    : 'border-slate-300 dark:border-slate-700 hover:border-primary/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />

                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                  {isParsing ? (
                    <RefreshCw size={26} className="animate-spin" />
                  ) : (
                    <Upload size={26} />
                  )}
                </div>

                <h3 className="text-sm font-bold text-text-primary m-0">
                  {isParsing ? 'Membaca & Memvalidasi File...' : 'Tarik & Letakkan File Spreadsheet di Sini'}
                </h3>
                <p className="text-xs text-text-muted mt-1 m-0 max-w-sm">
                  Mendukung format Microsoft Excel (.xlsx, .xls) atau teks terpisah koma (.csv) hingga 10MB.
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <span className="py-1 px-3 bg-bg-secondary rounded-lg text-xs font-semibold text-text-secondary border border-border-light">
                    Pilih Berkas dari Komputer
                  </span>
                </div>
              </div>

              {/* Tips & Instructions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl border border-border-light bg-slate-50/50 dark:bg-slate-800/20 space-y-1">
                  <span className="font-bold text-text-primary block">1. Kolom Wajib</span>
                  <p className="text-text-muted m-0 text-[11px]">
                    Kolom <code className="text-primary font-mono font-bold">Nama Alat</code> harus ada dan tidak boleh kosong.
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-border-light bg-slate-50/50 dark:bg-slate-800/20 space-y-1">
                  <span className="font-bold text-text-primary block">2. Status & Kondisi</span>
                  <p className="text-text-muted m-0 text-[11px]">
                    Kondisi otomatis dinormalisasi ke: <span className="font-semibold text-emerald-600">Baik</span>, <span className="font-semibold text-amber-600">Maintenance</span>, atau <span className="font-semibold text-rose-600">Rusak</span>.
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-border-light bg-slate-50/50 dark:bg-slate-800/20 space-y-1">
                  <span className="font-bold text-text-primary block">3. Lokasi Default</span>
                  <p className="text-text-muted m-0 text-[11px]">
                    Jika kolom lokasi kosong, otomatis disimpan di <span className="font-semibold">Head Office PT Mega Tama Enerco</span>.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Top Summary Bar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-border-light">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setStep('upload')}
                    className="p-1.5 rounded-lg border border-border-light bg-bg-white hover:bg-bg-secondary text-text-primary transition-all cursor-pointer"
                    title="Ganti Berkas"
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-text-primary truncate max-w-[200px] sm:max-w-xs">
                        {file?.name}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono">
                        ({((file?.size || 0) / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <span className="text-[11px] text-text-muted">
                      Total {summary?.total || 0} baris ditemukan dalam file
                    </span>
                  </div>
                </div>

                {/* Validation Counts Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setPreviewFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      previewFilter === 'all'
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-bg-white text-text-secondary border-border-light hover:bg-bg-secondary'
                    }`}
                  >
                    Semua ({summary?.total || 0})
                  </button>
                  <button
                    onClick={() => setPreviewFilter('valid')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 ${
                      previewFilter === 'valid'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    <CheckCircle2 size={13} />
                    <span>Baru ({summary?.valid || 0})</span>
                  </button>
                  {summary && summary.duplicates > 0 && (
                    <button
                      onClick={() => setPreviewFilter('duplicate')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 ${
                        previewFilter === 'duplicate'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      <AlertTriangle size={13} />
                      <span>Duplikat ({summary.duplicates})</span>
                    </button>
                  )}
                  {summary && summary.invalid > 0 && (
                    <button
                      onClick={() => setPreviewFilter('invalid')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 ${
                        previewFilter === 'invalid'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      <AlertCircle size={13} />
                      <span>Error ({summary.invalid})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Import Mode Selection */}
              <div className="p-3.5 rounded-xl border border-border-light bg-bg-white dark:bg-slate-900 space-y-2">
                <span className="text-xs font-bold text-text-primary block">
                  Pilih Penanganan Duplikat:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      importMode === 'skip'
                        ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/40'
                        : 'border-border-light hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="skip"
                      checked={importMode === 'skip'}
                      onChange={() => setImportMode('skip')}
                      className="mt-0.5 text-primary"
                    />
                    <div>
                      <span className="text-xs font-bold text-text-primary block">Lewati Duplikat (Aman)</span>
                      <span className="text-[11px] text-text-muted leading-tight block">
                        Hanya alat baru yang disimpan; data alat yang sudah ada tidak disentuh.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      importMode === 'update'
                        ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/40'
                        : 'border-border-light hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="update"
                      checked={importMode === 'update'}
                      onChange={() => setImportMode('update')}
                      className="mt-0.5 text-primary"
                    />
                    <div>
                      <span className="text-xs font-bold text-text-primary block">Perbarui Data / Stok</span>
                      <span className="text-[11px] text-text-muted leading-tight block">
                        Perbarui stok, lokasi & kondisi jika nama alat sudah terdaftar di sistem.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      importMode === 'insert'
                        ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/40'
                        : 'border-border-light hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="insert"
                      checked={importMode === 'insert'}
                      onChange={() => setImportMode('insert')}
                      className="mt-0.5 text-primary"
                    />
                    <div>
                      <span className="text-xs font-bold text-text-primary block">Tambah Sebagai Baru</span>
                      <span className="text-[11px] text-text-muted leading-tight block">
                        Tetap masukkan sebagai baris alat baru terpisah meskipun nama serupa.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Data Rows Preview Table */}
              <div className="rounded-xl border border-border-light overflow-hidden shadow-2xs">
                <div className="max-h-[340px] overflow-y-auto overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-100/90 dark:bg-slate-800 sticky top-0 z-10 border-b border-border-light">
                      <tr className="text-text-muted font-bold text-[10px] uppercase tracking-wider">
                        <th className="py-2 px-2.5 w-10 text-center">No</th>
                        <th className="py-2 px-2.5 w-24">Status</th>
                        <th className="py-2 px-2.5 min-w-[180px]">Nama Alat / Mesin</th>
                        <th className="py-2 px-2.5 min-w-[110px]">Kategori</th>
                        <th className="py-2 px-2.5 w-16 text-right">Stok</th>
                        <th className="py-2 px-2.5 w-16 text-center">Satuan</th>
                        <th className="py-2 px-2.5 w-24 text-center">Kondisi</th>
                        <th className="py-2 px-2.5 min-w-[150px]">Lokasi</th>
                        <th className="py-2 px-2.5 min-w-[150px]">Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y border-border-light bg-bg-white dark:bg-slate-900">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-text-muted text-xs">
                            Tidak ada data yang sesuai dengan filter pratinjau.
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((row) => {
                          const isInvalid = !row.isValid;
                          const isDuplicate = row.isDuplicate;

                          return (
                            <tr
                              key={row.rowNumber}
                              className={`transition-colors ${
                                isInvalid
                                  ? 'bg-rose-50/70 dark:bg-rose-950/20 text-rose-900'
                                  : isDuplicate
                                  ? 'bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100/40'
                                  : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="py-1.5 px-2.5 text-center font-mono text-text-muted">
                                {row.rowNumber}
                              </td>
                              <td className="py-1.5 px-2.5">
                                {isInvalid ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-700">
                                    <AlertCircle size={11} />
                                    <span>Error</span>
                                  </span>
                                ) : isDuplicate ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                                    <AlertTriangle size={11} />
                                    <span>Duplikat</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
                                    <CheckCircle2 size={11} />
                                    <span>Valid</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-2.5 font-semibold text-text-primary">
                                {row.nama}
                                {row.errors.length > 0 && (
                                  <span className="block text-[10px] text-rose-600 font-normal">
                                    {row.errors.join(', ')}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-2.5 text-text-secondary">{row.kategori}</td>
                              <td className="py-1.5 px-2.5 text-right font-mono font-bold">{row.stok}</td>
                              <td className="py-1.5 px-2.5 text-center text-text-muted">{row.satuan}</td>
                              <td className="py-1.5 px-2.5 text-center">
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    row.kondisi === 'Baik'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : row.kondisi === 'Maintenance'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-rose-100 text-rose-700'
                                  }`}
                                >
                                  {row.kondisi}
                                </span>
                              </td>
                              <td className="py-1.5 px-2.5 text-text-secondary truncate max-w-[180px]">
                                {row.lokasi}
                              </td>
                              <td className="py-1.5 px-2.5 text-text-muted truncate max-w-[180px]">
                                {row.notes || '-'}
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
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-light dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
          <div>
            {step === 'preview' && (
              <button
                type="button"
                onClick={() => setStep('upload')}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text-primary p-1 bg-transparent border-none cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Pilih Ulang Berkas</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="py-1.5 px-3.5 border border-border-light bg-bg-white hover:bg-bg-secondary text-text-primary rounded-lg text-xs font-semibold transition-all cursor-pointer"
            >
              Batal
            </button>

            {step === 'preview' && (
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={isSubmitting || !summary || summary.valid + summary.duplicates === 0}
                className="flex items-center gap-1.5 py-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Menyimpan ke Database...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Konfirmasi & Simpan ({summary?.valid || 0} Baru)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
