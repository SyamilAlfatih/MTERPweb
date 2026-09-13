import React, { useState, useRef } from 'react';
import { ProjectTask } from '../../types';
import { importProjectExcel, importProjectXML } from '../../api/api';
import {
  X,
  Upload,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Database,
  Trash2,
} from 'lucide-react';

interface ExportImportDialogProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onImportSuccess: (tasks: ProjectTask[]) => void;
}

export const ExportImportDialog: React.FC<ExportImportDialogProps> = ({
  isOpen,
  projectId,
  onClose,
  onImportSuccess,
}) => {
  const [fileType, setFileType] = useState<'excel' | 'xml'>('excel');
  const [file, setFile] = useState<File | null>(null);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'success'>('upload');
  const [previewData, setPreviewData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError(null);
      // Auto-detect type
      if (selected.name.endsWith('.xml')) {
        setFileType('xml');
      } else {
        setFileType('excel');
      }
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError('Pilih berkas Excel (.xlsx) atau MS Project (.xml) terlebih dahulu.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let res: any;
      if (fileType === 'excel') {
        res = await importProjectExcel(projectId, file, 'preview');
      } else {
        res = await importProjectXML(projectId, file, 'preview');
      }

      if (res.success && res.preview) {
        setPreviewData(res);
        setStep('preview');
      } else {
        setError(res.msg || 'Gagal memproses pratinjau data.');
      }
    } catch (err: any) {
      console.error('Import preview failed:', err);
      setError(err.response?.data?.msg || err.message || 'Gagal membaca berkas jadwal.');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!file) return;

    try {
      setLoading(true);
      setError(null);
      setStep('importing');

      let res: any;
      if (fileType === 'excel') {
        res = await importProjectExcel(projectId, file, 'commit', replaceExisting);
      } else {
        res = await importProjectXML(projectId, file, 'commit', replaceExisting);
      }

      if (res.success) {
        setStep('success');
        setTimeout(() => {
          onImportSuccess(res.tasks || []);
          handleClose();
        }, 1200);
      } else {
        setError(res.msg || 'Gagal mengimpor jadwal.');
        setStep('preview');
      }
    } catch (err: any) {
      console.error('Import commit failed:', err);
      setError(err.response?.data?.msg || err.message || 'Gagal mengimpor jadwal proyek.');
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreviewData(null);
    setStep('upload');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-300">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Import Project Schedule</h3>
              <p className="text-xs text-slate-300">
                Impor daftar pekerjaan dari berkas Excel (.xlsx) atau Microsoft Project (.xml)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 hover:bg-white/10 rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-slate-400 hover:text-white" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'upload' && (
            <>
              {/* Type Selection */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFileType('excel')}
                  className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                    fileType === 'excel'
                      ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <FileSpreadsheet className={`w-6 h-6 mt-0.5 ${fileType === 'excel' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <div>
                    <div className="font-bold text-sm text-slate-800">Excel Spreadsheet (.xlsx)</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Format kolom standar: Task Name, Duration, Start, Finish, % Complete, Predecessors
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFileType('xml')}
                  className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                    fileType === 'xml'
                      ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-600/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <FileCode className={`w-6 h-6 mt-0.5 ${fileType === 'xml' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <div>
                    <div className="font-bold text-sm text-slate-800">MS Project XML (.xml)</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Standar pertukaran MS Project (MSPDI) dengan hierarki WBS dan relasi dependensi penuh
                    </div>
                  </div>
                </button>
              </div>

              {/* File Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-blue-50/30 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={fileType === 'excel' ? '.xlsx,.xls,.csv' : '.xml'}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className="w-10 h-10 text-slate-400 mb-2" />
                <span className="text-sm font-semibold text-slate-700">
                  {file ? file.name : 'Klik untuk memilih berkas dari komputer'}
                </span>
                <span className="text-xs text-slate-400 mt-1">
                  {file ? `${(file.size / 1024).toFixed(1)} KB` : fileType === 'excel' ? 'Mendukung format .xlsx, .xls' : 'Mendukung format .xml'}
                </span>
              </div>

              {/* Replace options */}
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={e => setReplaceExisting(e.target.checked)}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800">
                      Gantikan semua pekerjaan yang ada (Replace All)
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Jika dicentang, seluruh task jadwal lama akan dihapus dan diganti dengan berkas yang baru diimpor. Jika tidak, data akan ditambahkan (append).
                    </p>
                  </div>
                </label>
              </div>
            </>
          )}

          {step === 'preview' && previewData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 font-medium">
                <span>
                  Ditemukan <strong>{previewData.totalTasks} pekerjaan</strong> siap diimpor ke jadwal proyek.
                </span>
                <span className="text-[11px] text-blue-600 font-normal">
                  Mode: {replaceExisting ? 'Gantikan Jadwal Lama' : 'Tambahkan'}
                </span>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                    <tr>
                      <th className="p-2 border-b border-slate-200">WBS</th>
                      <th className="p-2 border-b border-slate-200">Nama Pekerjaan</th>
                      <th className="p-2 border-b border-slate-200">Durasi</th>
                      <th className="p-2 border-b border-slate-200">Mulai</th>
                      <th className="p-2 border-b border-slate-200">Selesai</th>
                      <th className="p-2 border-b border-slate-200">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {(previewData.sampleTasks || []).map((t: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 text-slate-500">{t.wbsCode || idx + 1}</td>
                        <td className="p-2 font-sans font-medium text-slate-800">
                          {`${'  '.repeat(Math.max(0, (t.outlineLevel || 1) - 1))}${t.name}`}
                        </td>
                        <td className="p-2 text-slate-600">{t.duration || 0}d</td>
                        <td className="p-2 text-slate-600">
                          {t.startDate ? new Date(t.startDate).toISOString().slice(0, 10) : '-'}
                        </td>
                        <td className="p-2 text-slate-600">
                          {t.finishDate ? new Date(t.finishDate).toISOString().slice(0, 10) : '-'}
                        </td>
                        <td className="p-2 text-slate-600">{t.percentComplete || 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <RefreshCw className="w-10 h-10 animate-spin text-blue-600 mb-3" />
              <h4 className="text-base font-bold text-slate-800">Mengimpor Jadwal Proyek...</h4>
              <p className="text-xs text-slate-500 mt-1">
                Menyusun relasi predecessor, menghitung lintasan kritis (CPM), dan menyimpan ke basis data.
              </p>
            </div>
          )}

          {step === 'success' && (
            <div className="py-10 flex flex-col items-center justify-center text-center">
              <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full mb-3">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-slate-800">Jadwal Berhasil Diimpor!</h4>
              <p className="text-xs text-slate-500 mt-1">
                Pembaruan jadwal proyek telah disinkronkan ke tampilan Gantt Chart.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
          >
            Batal
          </button>

          {step === 'upload' && (
            <button
              type="button"
              disabled={!file || loading}
              onClick={handleAnalyze}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              <span>Pratinjau Data</span>
            </button>
          )}

          {step === 'preview' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Pilih Berkas Lain
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleCommit}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Konfirmasi & Simpan Jadwal</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
