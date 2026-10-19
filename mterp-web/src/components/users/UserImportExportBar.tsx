import React, { useState } from 'react';
import { AxiosError } from 'axios';
import { 
  Download, 
  Upload, 
  X, 
  FileSpreadsheet, 
  FileText, 
  CheckCircle, 
  AlertCircle 
} from 'lucide-react';
import { 
  exportUsersExcel, 
  exportUsersCsv, 
  downloadImportTemplate, 
  importUsers 
} from '../../api/api';

export const EXPORTABLE_COLUMNS = [
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

export interface UserImportExportBarProps {
  onImportSuccess: () => void;
}

export const UserImportExportBar: React.FC<UserImportExportBarProps> = ({
  onImportSuccess
}) => {
  // Modal states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

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
      onImportSuccess();
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

  return (
    <>
      {/* Trigger Buttons */}
      <button 
        className="flex items-center justify-center gap-1.5 bg-bg-secondary hover:bg-border-light text-text-primary border border-border-light py-2 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-all active:scale-95"
        onClick={() => setIsExportModalOpen(true)}
        title="Ekspor ke Excel atau CSV"
      >
        <Download size={14} strokeWidth={2} />
        <span>Ekspor</span>
      </button>

      <button 
        className="flex items-center justify-center gap-1.5 bg-bg-secondary hover:bg-border-light text-text-primary border border-border-light py-2 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-all active:scale-95"
        onClick={() => {
          setImportResult(null);
          setImportFile(null);
          setIsImportModalOpen(true);
        }}
        title="Impor dari file Excel atau CSV"
      >
        <Upload size={14} strokeWidth={2} />
        <span>Impor</span>
      </button>

      {/* MODAL: EXPORT CONFIGURATION */}
      {isExportModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" 
          onClick={() => setIsExportModalOpen(false)}
        >
          <div 
            className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[560px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" 
            onClick={e => e.stopPropagation()}
          >
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
              <button 
                className="w-8 h-8 rounded-full bg-border border-none flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer" 
                onClick={() => setIsExportModalOpen(false)}
              >
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
                      className="text-[10px] font-black text-primary hover:underline uppercase cursor-pointer"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-300">|</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedColumns(['no', 'fullName', 'phone', 'role', 'emergencyContactName', 'emergencyContactPhone'])}
                      className="text-[10px] font-black text-primary hover:underline uppercase cursor-pointer"
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

      {/* MODAL: IMPORT SPREADSHEET (XLSX / CSV) */}
      {isImportModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" 
          onClick={() => setIsImportModalOpen(false)}
        >
          <div 
            className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[580px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" 
            onClick={e => e.stopPropagation()}
          >
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
              <button 
                className="w-8 h-8 rounded-full bg-border border-none flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer" 
                onClick={() => setIsImportModalOpen(false)}
              >
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
                  className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider shrink-0 cursor-pointer"
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
    </>
  );
};
