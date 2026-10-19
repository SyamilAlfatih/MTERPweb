import React, { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import { MaterialRequest } from '../../types';
import { SignaturePad } from '../shared';
import { receiveMaterialOrder } from '../../api/api';

export interface MaterialOrderReceiveModalProps {
  order: MaterialRequest | null;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export function MaterialOrderReceiveModal({
  order,
  onClose,
  onSuccess,
}: MaterialOrderReceiveModalProps) {
  const [sitePhotoFile, setSitePhotoFile] = useState<File | null>(null);
  const [sitePhotoPreview, setSitePhotoPreview] = useState<string | null>(null);
  const [receivingItemsState, setReceivingItemsState] = useState<any[]>([]);
  const [overallCondition, setOverallCondition] = useState<'Good' | 'Damaged' | 'Partial'>('Good');
  const [receiverNotes, setReceiverNotes] = useState('');
  const [receiverSignature, setReceiverSignature] = useState<string | null>(null);
  const [driverSignature, setDriverSignature] = useState<string | null>(null);
  const [submittingReceive, setSubmittingReceive] = useState(false);

  useEffect(() => {
    if (order) {
      const initialItems = (
        order.items && order.items.length > 0
          ? order.items
          : [
              {
                item: order.item,
                specifications: '',
                qty: Number(order.qty) || 1,
                unit: order.unit || 'Pcs',
              },
            ]
      ).map((itm: any, idx: number) => ({
        itemIndex: idx,
        item: itm.item,
        specifications: itm.specifications || '',
        qty: itm.qty,
        receivedQty: itm.qty,
        unit: itm.unit,
        receivedCondition: 'Good',
      }));

      setReceivingItemsState(initialItems);
      setSitePhotoFile(null);
      setSitePhotoPreview(null);
      setOverallCondition('Good');
      setReceiverNotes('');
      setReceiverSignature(null);
      setDriverSignature(null);
    }
  }, [order]);

  if (!order) return null;

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sitePhotoFile) {
      alert('Foto bukti fisik material di lokasi proyek wajib diunggah');
      return;
    }
    if (!receiverSignature) {
      alert('Tanda tangan digital penerima proyek wajib dibuat sebelum menyelesaikan penerimaan barang');
      return;
    }

    setSubmittingReceive(true);
    try {
      const formData = new FormData();
      formData.append('sitePhoto', sitePhotoFile);
      formData.append('overallCondition', overallCondition);
      formData.append('notes', receiverNotes);
      formData.append('receivedItems', JSON.stringify(receivingItemsState));
      formData.append('receiverSignature', receiverSignature);
      if (driverSignature) {
        formData.append('driverSignature', driverSignature);
      }

      await receiveMaterialOrder(order._id!, formData);
      onClose();
      await onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal mengonfirmasi penerimaan barang');
    } finally {
      setSubmittingReceive(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-2xl p-5 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-black text-text-primary m-0">Penerimaan Fisik Barang di Proyek (Goods Receipt)</h3>
        <p className="text-xs text-text-muted m-0 mt-1">PO: {order.poNumber || order.prNumber}</p>

        <form onSubmit={handleReceiveSubmit} className="space-y-4 mt-4">
          {/* Mandatory Job-Site Photo Upload */}
          <div className="p-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary/[0.02]">
            <label className="text-xs font-black uppercase text-primary mb-1 block flex items-center gap-1.5">
              <Camera size={16} /> Foto Bukti Fisik Material Tiba di Lokasi Proyek (Wajib) *
            </label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              required
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setSitePhotoFile(f);
                if (f) setSitePhotoPreview(URL.createObjectURL(f));
              }}
              className="w-full text-xs mt-2"
            />
            {sitePhotoPreview && (
              <div className="mt-3 w-40 h-28 rounded-lg overflow-hidden border border-border">
                <img src={sitePhotoPreview} alt="Site arrival preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {/* Multi-Item Receiving Checklist */}
          <div>
            <span className="text-xs font-bold text-text-muted uppercase mb-1 block">Verifikasi Kuantitas Fisik per Baris</span>
            <div className="border border-border-light rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-border-light text-[11px] font-black text-text-muted uppercase">
                  <tr>
                    <th className="p-2">Nama Material</th>
                    <th className="p-2 text-primary">Spesifikasi / Spec</th>
                    <th className="p-2 text-center w-24">Qty Dipesan</th>
                    <th className="p-2 text-center w-28">Qty Diterima</th>
                    <th className="p-2 text-center w-36">Kondisi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {receivingItemsState.map((itm, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-bold text-text-primary">{itm.item}</td>
                      <td className="p-2 text-text-secondary italic">{itm.specifications || '-'}</td>
                      <td className="p-2 text-center">
                        {itm.qty} {itm.unit}
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={itm.receivedQty}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setReceivingItemsState((prev) => {
                              const c = [...prev];
                              c[idx].receivedQty = val;
                              return c;
                            });
                          }}
                          className="w-20 p-1 text-center font-bold border rounded border-border-light"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <select
                          value={itm.receivedCondition}
                          onChange={(e) => {
                            const val = e.target.value;
                            setReceivingItemsState((prev) => {
                              const c = [...prev];
                              c[idx].receivedCondition = val;
                              return c;
                            });
                          }}
                          className="p-1 text-xs border rounded border-border-light"
                        >
                          <option value="Good">Lengkap & Baik</option>
                          <option value="Partial">Kurang / Selisih</option>
                          <option value="Damaged">Ada Kerusakan</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Catatan Penerima</label>
            <input
              type="text"
              value={receiverNotes}
              onChange={(e) => setReceiverNotes(e.target.value)}
              placeholder="Material telah dibongkar dan diletakkan di gudang zona 1..."
              className="w-full p-2.5 text-xs rounded-xl border border-border-light bg-bg-white"
            />
          </div>

          {/* Digital Handwritten Signatures */}
          <div className="pt-2 border-t border-border-light space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-text-primary tracking-wide block">
                Tanda Tangan Digital Verifikasi Lapangan (GRN)
              </span>
              <span className="text-[11px] text-text-muted">Gunakan sentuhan layar (HP/Tablet) atau kursor</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <SignaturePad
                  label="Tanda Tangan Penerima Lapangan"
                  required
                  height={140}
                  onSave={(dataUrl) => setReceiverSignature(dataUrl)}
                  onClear={() => setReceiverSignature(null)}
                />
              </div>
              <div>
                <SignaturePad
                  label="Tanda Tangan Pengantar / Supir (Opsional)"
                  required={false}
                  height={140}
                  onSave={(dataUrl) => setDriverSignature(dataUrl)}
                  onClear={() => setDriverSignature(null)}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-border-light">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submittingReceive}
              className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 cursor-pointer shadow-xs"
            >
              {submittingReceive ? 'Menyimpan & Memasukkan Stok...' : 'Konfirmasi Selesai & Tambah ke Stok Proyek'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
