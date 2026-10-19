import React, { useState, useEffect, useCallback } from 'react';
import { AxiosError } from 'axios';
import { 
  Key, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  X, 
  Code
} from 'lucide-react';
import { 
  getApiKeys, 
  createApiKey, 
  updateApiKey, 
  deleteApiKey 
} from '../../api/api';
import { ApiKey } from '../../types';

export interface ApiKeyManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyCountChange?: (count: number) => void;
}

export const ApiKeyManagementModal: React.FC<ApiKeyManagementModalProps> = ({
  isOpen,
  onClose,
  onKeyCountChange
}) => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isApiKeysLoading, setIsApiKeysLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreateKeyModalOpen, setIsCreateKeyModalOpen] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState<ApiKey | null>(null);
  const [hasCopiedKey, setHasCopiedKey] = useState(false);

  const fetchApiKeys = useCallback(async () => {
    try {
      setIsApiKeysLoading(true);
      const data = await getApiKeys();
      setApiKeys(data);
      if (onKeyCountChange) {
        onKeyCountChange(data.length);
      }
    } catch (error) {
      console.error('Failed to load API keys', error);
    } finally {
      setIsApiKeysLoading(false);
    }
  }, [onKeyCountChange]);

  useEffect(() => {
    if (isOpen) {
      fetchApiKeys();
    }
  }, [isOpen, fetchApiKeys]);

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

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1000] p-4 sm:p-0 animate-in fade-in duration-200" 
      onClick={onClose}
    >
      <div 
        className="bg-bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-[800px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex justify-between items-center sticky top-0 z-10">
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
              onClick={() => setIsCreateKeyModalOpen(true)}
              className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
            >
              <Plus size={15} strokeWidth={3} />
              <span>Buat API Key</span>
            </button>
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 border-none flex items-center justify-center text-white hover:bg-white/20 transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 bg-bg-white space-y-6 overflow-y-auto">
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
                className="bg-primary text-white text-xs font-black px-4 py-2 rounded-xl uppercase tracking-wider cursor-pointer"
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

        {/* Create Key Modal Dialog */}
        {isCreateKeyModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1050] p-4 animate-in fade-in duration-200">
            <div className="bg-bg-white rounded-3xl w-full max-w-[500px] shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b-2 border-border-light bg-slate-900 text-white flex justify-between items-center">
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

        {/* Show Created Key (Once) */}
        {createdKeyData && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1100] p-4 animate-in fade-in duration-200">
            <div className="bg-bg-white rounded-3xl w-full max-w-[500px] shadow-2xl overflow-hidden flex flex-col p-6 space-y-4 border-2 border-amber-400" onClick={e => e.stopPropagation()}>
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
      </div>
    </div>
  );
};
