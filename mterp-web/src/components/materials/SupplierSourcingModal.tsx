import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import {
  MaterialRequest,
  ISupplierComparison,
  ISupplierComparisonItemRate,
  ProcurementAuthorizersResponse,
} from '../../types';
import { submitSupplierComparisons } from '../../api/api';
import { formatRupiah } from '../../utils/currency';

export interface SupplierSourcingModalProps {
  order: MaterialRequest | null;
  onClose: () => void;
  authorizers: ProcurementAuthorizersResponse;
  isOwner: boolean;
  onSuccess: () => Promise<void> | void;
}

export function SupplierSourcingModal({
  order,
  onClose,
  authorizers,
  isOwner,
  onSuccess,
}: SupplierSourcingModalProps) {
  const [candidateSuppliers, setCandidateSuppliers] = useState<ISupplierComparison[]>([]);
  const [sourcingViewMode, setSourcingViewMode] = useState<'form' | 'matrix'>('form');
  const [activeVendorIndex, setActiveVendorIndex] = useState<number>(0);
  const [sourcingFinanceApproverId, setSourcingFinanceApproverId] = useState<string>('');
  const [submittingSourcing, setSubmittingSourcing] = useState(false);

  useEffect(() => {
    if (!order) return;

    setSourcingViewMode('form');
    setActiveVendorIndex(0);

    const initialFinId =
      (typeof order.assignedFinanceApproverId === 'object'
        ? order.assignedFinanceApproverId?._id
        : order.assignedFinanceApproverId) ||
      authorizers.financeApprovers[0]?._id ||
      '';
    setSourcingFinanceApproverId(initialFinId);

    const itemsList =
      order.items && order.items.length > 0
        ? order.items
        : [
            {
              item: order.item,
              specifications: '',
              qty: Number(order.qty) || 1,
              unit: order.unit || 'Pcs',
              budgetUnitRate: order.costEstimate
                ? Number(order.costEstimate) / (Number(order.qty) || 1)
                : 0,
              totalBudget: Number(order.costEstimate) || 0,
            },
          ];

    const existingComps = order.supplierComparisons || order.comparisons;
    if (existingComps && existingComps.length > 0) {
      const mapped = existingComps.map((sc: ISupplierComparison, scIdx: number) => {
        const itemRates = itemsList.map((itm, idx) => {
          const existingRate = sc.itemRates?.find(
            (r: ISupplierComparisonItemRate) => r.itemIndex === idx || r.itemName === itm.item
          );
          const quotedUnitPrice = existingRate ? existingRate.quotedUnitPrice : (itm.budgetUnitRate || 0);
          const quotedTotalAmount = (Number(itm.qty) || 1) * quotedUnitPrice;
          return {
            itemIndex: idx,
            itemName: itm.item,
            quotedUnitPrice,
            quotedTotalAmount,
          };
        });
        const subtotal = itemRates.reduce(
          (acc: number, r: ISupplierComparisonItemRate) => acc + (r.quotedTotalAmount || 0),
          0
        );
        const shipping = Number(sc.shippingCost) || 0;
        return {
          ...sc,
          itemRates,
          subtotalItems: subtotal,
          shippingCost: shipping,
          totalLandedCost: subtotal + shipping,
          isRecommended: sc.isRecommended ?? (scIdx === 0),
        };
      });
      setCandidateSuppliers(mapped);
    } else {
      const createDefaultCandidate = (name: string, loc: string, rec: boolean): ISupplierComparison => {
        const itemRates = itemsList.map((itm, idx) => {
          const rate = itm.budgetUnitRate || 0;
          return {
            itemIndex: idx,
            itemName: itm.item,
            quotedUnitPrice: rate,
            quotedTotalAmount: (Number(itm.qty) || 1) * rate,
          };
        });
        const subtotal = itemRates.reduce((acc, r) => acc + (r.quotedTotalAmount || 0), 0);
        return {
          supplierName: name,
          location: loc,
          contact: '',
          shippingCost: 0,
          paymentTerms: 'Tempo 14 Hari',
          notes: '',
          isRecommended: rec,
          itemRates,
          subtotalItems: subtotal,
          totalLandedCost: subtotal,
        };
      };

      setCandidateSuppliers([
        createDefaultCandidate('Vendor A (Rekomendasi Utama)', 'Lokal / Dekat Proyek', true),
        createDefaultCandidate('Vendor B (Pembanding 1)', 'Pusat Kota', false),
      ]);
    }
  }, [order, authorizers]);

  if (!order) return null;

  const itemsList =
    order.items && order.items.length > 0
      ? order.items
      : [
          {
            item: order.item,
            specifications: order.specifications || '',
            qty: Number(order.qty) || 1,
            unit: order.unit || 'Pcs',
            budgetUnitRate: order.costEstimate
              ? Number(order.costEstimate) / (Number(order.qty) || 1)
              : 0,
            totalBudget: Number(order.costEstimate) || 0,
          },
        ];

  const handleUpdateItemRate = (vendorIdx: number, itemIdx: number, unitPrice: number) => {
    const itemQty = Number(itemsList[itemIdx]?.qty) || 1;

    setCandidateSuppliers((prev) => {
      const copy = [...prev];
      const supp = { ...copy[vendorIdx] };
      const rates = supp.itemRates ? [...supp.itemRates] : [];
      rates[itemIdx] = {
        itemIndex: itemIdx,
        itemName: itemsList[itemIdx]?.item || '',
        quotedUnitPrice: unitPrice,
        quotedTotalAmount: itemQty * unitPrice,
      };
      supp.itemRates = rates;
      const subtotal = rates.reduce((acc, r) => acc + (Number(r?.quotedTotalAmount) || 0), 0);
      const shipping = Number(supp.shippingCost) || 0;
      supp.subtotalItems = subtotal;
      supp.totalLandedCost = subtotal + shipping;
      copy[vendorIdx] = supp;
      return copy;
    });
  };

  const handleUpdateSupplierField = (vendorIdx: number, patch: Partial<ISupplierComparison>) => {
    setCandidateSuppliers((prev) => {
      const copy = [...prev];
      const supp = { ...copy[vendorIdx], ...patch };
      if ('shippingCost' in patch) {
        const subtotal =
          supp.subtotalItems ||
          supp.itemRates?.reduce((acc, r) => acc + (Number(r?.quotedTotalAmount) || 0), 0) ||
          0;
        const shipping = Number(supp.shippingCost) || 0;
        supp.subtotalItems = subtotal;
        supp.totalLandedCost = subtotal + shipping;
      }
      copy[vendorIdx] = supp;
      return copy;
    });
  };

  const handleAddCandidateSupplier = () => {
    const itemRates = itemsList.map((itm, idx) => {
      const rate = itm.budgetUnitRate || 0;
      return {
        itemIndex: idx,
        itemName: itm.item,
        quotedUnitPrice: rate,
        quotedTotalAmount: (Number(itm.qty) || 1) * rate,
      };
    });
    const subtotal = itemRates.reduce((acc, r) => acc + (r.quotedTotalAmount || 0), 0);
    const newIdx = candidateSuppliers.length;
    setCandidateSuppliers((prev) => [
      ...prev,
      {
        supplierName: `Vendor ${String.fromCharCode(65 + newIdx)}`,
        location: '',
        contact: '',
        shippingCost: 0,
        paymentTerms: 'Tempo 14 Hari',
        notes: '',
        isRecommended: false,
        itemRates,
        subtotalItems: subtotal,
        totalLandedCost: subtotal,
      },
    ]);
    setActiveVendorIndex(newIdx);
  };

  const handleRemoveCandidateSupplier = (idx: number) => {
    if (candidateSuppliers.length <= 1) return;
    setCandidateSuppliers((prev) => {
      const filtered = prev.filter((_, i) => i !== idx);
      if (!filtered.some((s) => s.isRecommended)) {
        filtered[0].isRecommended = true;
      }
      return filtered;
    });
    if (activeVendorIndex >= idx && activeVendorIndex > 0) {
      setActiveVendorIndex(activeVendorIndex - 1);
    }
  };

  const handleSelectRecommendedSupplier = (recIdx: number) => {
    setCandidateSuppliers((prev) =>
      prev.map((s, i) => ({ ...s, isRecommended: i === recIdx }))
    );
  };

  const handleSubmitSourcing = async () => {
    const validSuppliers = candidateSuppliers.filter((s) => s.supplierName.trim().length > 0);
    if (validSuppliers.length === 0) {
      alert('Mohon masukkan minimal 1 nama vendor/supplier');
      return;
    }
    const hasRecommended = validSuppliers.some((s) => s.isRecommended);
    if (!hasRecommended) {
      validSuppliers[0].isRecommended = true;
    }

    setSubmittingSourcing(true);
    try {
      const processed = validSuppliers.map((supp) => {
        const itemSubtotal =
          supp.itemRates?.reduce((acc, r) => acc + (Number(r?.quotedTotalAmount) || 0), 0) || 0;
        const shipping = Number(supp.shippingCost) || 0;
        return {
          ...supp,
          subtotalItems: itemSubtotal,
          shippingCost: shipping,
          totalLandedCost: itemSubtotal + shipping,
        };
      });

      await submitSupplierComparisons(order._id!, {
        comparisons: processed,
        assignedFinanceApproverId: sourcingFinanceApproverId || undefined,
      });
      onClose();
      await onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.msg || 'Gagal mengirim komparasi supplier');
    } finally {
      setSubmittingSourcing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-bg-white border border-border-light rounded-2xl w-full max-w-5xl p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto animate-dropdown-enter">
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-light">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                PO
              </span>
              <h3 className="text-base sm:text-lg font-black text-text-primary m-0">
                Evaluasi Komparasi Harga Supplier (Multi-Item Sourcing Matrix)
              </h3>
            </div>
            <p className="text-xs text-text-muted m-0 mt-1">
              PR: <b>{order.prNumber}</b> • Proyek:{' '}
              <b>{typeof order.projectId === 'object' ? order.projectId?.nama : 'Proyek'}</b> •{' '}
              {order.items?.length || 1} Baris Material
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setSourcingViewMode('form')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  sourcingViewMode === 'form'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                📋 Rincian Per Vendor
              </button>
              <button
                type="button"
                onClick={() => setSourcingViewMode('matrix')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  sourcingViewMode === 'matrix'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                📊 Matriks Berdampingan
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content area: Mode 1 (Form / Per-Vendor Tab) or Mode 2 (Side-by-side Matrix) */}
        {sourcingViewMode === 'form' ? (
          <div className="mt-4 space-y-4">
            {/* Vendor Tabs Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-border-light">
              {candidateSuppliers.map((supp, sIdx) => {
                const isActive = activeVendorIndex === sIdx;
                return (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => setActiveVendorIndex(sIdx)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-slate-100 text-text-secondary hover:bg-slate-200'
                    }`}
                  >
                    <span>
                      {supp.supplierName.trim() ? supp.supplierName : `Vendor #${sIdx + 1}`}
                    </span>
                    {supp.isRecommended && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                          isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        ⭐ Pemenang
                      </span>
                    )}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={handleAddCandidateSupplier}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 transition-all cursor-pointer shrink-0"
              >
                <Plus size={14} />
                <span>Tambah Alternatif Vendor</span>
              </button>
            </div>

            {/* Active Vendor Card */}
            {candidateSuppliers[activeVendorIndex] && (() => {
              const currentSupp = candidateSuppliers[activeVendorIndex];

              return (
                <div className="space-y-4">
                  {/* Top Action & Recommendation Flag */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-purple-50/60 border border-purple-100">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-purple-900">
                      <input
                        type="radio"
                        name="selectedRecommendedRadio"
                        checked={currentSupp.isRecommended}
                        onChange={() => handleSelectRecommendedSupplier(activeVendorIndex)}
                        className="w-4 h-4 text-purple-600"
                      />
                      <span>Pilih Vendor Ini Sebagai Rekomendasi Utama (Pemenang PO)</span>
                    </label>

                    {candidateSuppliers.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCandidateSupplier(activeVendorIndex)}
                        className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>Hapus Vendor Ini</span>
                      </button>
                    )}
                  </div>

                  {/* Vendor Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-border-light bg-slate-50/50">
                    <div>
                      <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">
                        Nama Toko / PT Vendor *
                      </label>
                      <input
                        type="text"
                        value={currentSupp.supplierName}
                        onChange={(e) =>
                          handleUpdateSupplierField(activeVendorIndex, { supplierName: e.target.value })
                        }
                        placeholder="PT Sinar Logam Abadi..."
                        className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">
                        Lokasi / Jarak
                      </label>
                      <input
                        type="text"
                        value={currentSupp.location || ''}
                        onChange={(e) =>
                          handleUpdateSupplierField(activeVendorIndex, { location: e.target.value })
                        }
                        placeholder="Jl. Lingkar Luar (8 km dari site)..."
                        className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">
                        No. Kontak / PIC
                      </label>
                      <input
                        type="text"
                        value={currentSupp.contact || ''}
                        onChange={(e) =>
                          handleUpdateSupplierField(activeVendorIndex, { contact: e.target.value })
                        }
                        placeholder="0812-3456-7890 (Pak Johan)..."
                        className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-text-muted uppercase block">
                          Syarat Pembayaran
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const newIsPaylater = !currentSupp.isPaylater;
                              handleUpdateSupplierField(activeVendorIndex, {
                                isPaylater: newIsPaylater,
                                schemeType: newIsPaylater ? 'PAYLATER' : 'STANDARD',
                                interestRate: 0,
                                paymentTerms: newIsPaylater ? 'Paylater (Ambil Dulu Bayar Nanti - Bunga 0%)' : 'Tempo 14 Hari',
                                settlementTerms: newIsPaylater ? 'Tempo Setelah GRN Tanpa Bunga' : '',
                              });
                            }}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold transition-all cursor-pointer border ${
                              currentSupp.isPaylater
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                            }`}
                          >
                            {currentSupp.isPaylater ? '✓ Paylater Aktif (0% Bunga)' : '+ Skema Paylater'}
                          </button>
                        </div>
                      </div>

                      {/* Quick Preset Terms */}
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {[
                          { label: 'Paylater (0% Bunga)', val: 'Paylater (Ambil Dulu Bayar Nanti - Bunga 0%)', isPl: true },
                          { label: 'Tempo 14 Hari', val: 'Tempo 14 Hari', isPl: false },
                          { label: 'Tempo 30 Hari', val: 'Tempo 30 Hari', isPl: false },
                          { label: 'COD', val: 'Cash on Delivery (COD)', isPl: false },
                          { label: 'DP 30%', val: 'DP 30% - Pelunasan GRN', isPl: false },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              handleUpdateSupplierField(activeVendorIndex, {
                                paymentTerms: preset.val,
                                isPaylater: preset.isPl,
                                schemeType: preset.isPl ? 'PAYLATER' : 'STANDARD',
                                interestRate: 0,
                                settlementTerms: preset.isPl ? 'Tempo Setelah GRN Tanpa Bunga' : '',
                              })
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors border cursor-pointer ${
                              currentSupp.paymentTerms === preset.val
                                ? 'bg-primary text-white border-primary'
                                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      <input
                        type="text"
                        value={currentSupp.paymentTerms || ''}
                        onChange={(e) =>
                          handleUpdateSupplierField(activeVendorIndex, { paymentTerms: e.target.value })
                        }
                        placeholder="Tempo 14 Hari / COD / DP 30%..."
                        className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white"
                      />

                      {currentSupp.isPaylater && (
                        <div className="mt-1.5 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 leading-tight">
                          <span className="font-bold">Skema Paylater Aktif:</span> Material diambil / dikirim ke proyek tanpa uang muka (DP Rp 0). Pelunasan dilakukan setelah barang tiba (GRN) tanpa dikenakan beban bunga (Bunga 0%).
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">
                        Biaya Pengiriman / Ongkir (Rp)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={currentSupp.shippingCost || ''}
                        onChange={(e) =>
                          handleUpdateSupplierField(activeVendorIndex, {
                            shippingCost: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="0"
                        className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white font-mono text-right font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">
                        Catatan / Garansi Vendor
                      </label>
                      <input
                        type="text"
                        value={currentSupp.notes || ''}
                        onChange={(e) =>
                          handleUpdateSupplierField(activeVendorIndex, { notes: e.target.value })
                        }
                        placeholder="Ready stock, pengiriman H+1..."
                        className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white"
                      />
                    </div>
                  </div>

                  {/* Multi-Item Quotation Rate Table */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-text-primary tracking-wide">
                        Penawaran Harga Material ({itemsList.length} Item Sesuai PR)
                      </span>
                      <span className="text-[11px] text-text-muted">
                        Isi harga satuan per item yang ditawarkan oleh vendor ini
                      </span>
                    </div>

                    <div className="border border-border-light rounded-xl overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-border-light text-[11px] font-black text-text-muted uppercase">
                            <th className="py-2.5 px-2 w-8 text-center">No</th>
                            <th className="py-2.5 px-2 min-w-[140px]">Nama Material</th>
                            <th className="py-2.5 px-2 min-w-[140px] text-primary">Spesifikasi / Spec</th>
                            <th className="py-2.5 px-2 w-20 text-center">Qty</th>
                            <th className="py-2.5 px-2 w-20 text-center">Satuan</th>
                            <th className="py-2.5 px-2 w-28 text-right">Tarif Est. PR</th>
                            <th className="py-2.5 px-2 w-36 text-right text-purple-700">Harga Penawaran Satuan *</th>
                            <th className="py-2.5 px-2 w-32 text-right">Subtotal Ditawarkan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-light">
                          {itemsList.map((itm, itmIdx) => {
                            const rateObj = currentSupp.itemRates?.[itmIdx];
                            const quotedPrice = rateObj?.quotedUnitPrice ?? (itm.budgetUnitRate || 0);
                            const quotedSubtotal = (Number(itm.qty) || 1) * quotedPrice;

                            return (
                              <tr key={itmIdx} className="hover:bg-slate-50/50">
                                <td className="py-2 px-2 text-center text-text-muted">{itmIdx + 1}</td>
                                <td className="py-2 px-2 font-bold text-text-primary">{itm.item}</td>
                                <td className="py-2 px-2 text-text-secondary italic">{itm.specifications || '-'}</td>
                                <td className="py-2 px-2 text-center font-bold">{itm.qty}</td>
                                <td className="py-2 px-2 text-center text-text-muted">{itm.unit}</td>
                                <td className="py-2 px-2 text-right font-mono text-text-muted">
                                  {formatRupiah(itm.budgetUnitRate)}
                                </td>
                                <td className="py-2 px-2 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    value={quotedPrice || ''}
                                    onChange={(e) =>
                                      handleUpdateItemRate(activeVendorIndex, itmIdx, parseFloat(e.target.value) || 0)
                                    }
                                    placeholder="0"
                                    className="w-full p-1.5 text-xs rounded border border-purple-200 bg-purple-50/30 font-mono text-right font-bold text-purple-900 focus:bg-white"
                                  />
                                </td>
                                <td className="py-2 px-2 text-right font-mono font-bold text-text-primary">
                                  {formatRupiah(quotedSubtotal)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Landed Cost Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div className="p-3 rounded-xl border border-border-light bg-slate-50 text-right">
                      <span className="text-[10px] font-bold text-text-muted uppercase block">Subtotal Material</span>
                      <span className="text-sm font-bold font-mono text-text-primary">
                        {formatRupiah(currentSupp.subtotalItems)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl border border-border-light bg-slate-50 text-right">
                      <span className="text-[10px] font-bold text-text-muted uppercase block">Ongkos Kirim (Shipping)</span>
                      <span className="text-sm font-bold font-mono text-text-primary">
                        {formatRupiah(currentSupp.shippingCost)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl border-2 border-purple-300 bg-purple-50/50 text-right">
                      <span className="text-[10px] font-black text-purple-700 uppercase block">Total Landed Cost (PO)</span>
                      <span className="text-base font-black font-mono text-purple-900">
                        {formatRupiah(currentSupp.totalLandedCost)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          /* Mode 2: Side-by-Side Comparison Matrix */
          <div className="mt-4 space-y-4">
            <div className="border border-border-light rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-border-light text-[11px] font-black text-text-muted uppercase">
                    <th className="py-2.5 px-2 w-8 text-center sticky left-0 bg-slate-50">No</th>
                    <th className="py-2.5 px-2 min-w-[130px] sticky left-8 bg-slate-50">Nama Material</th>
                    <th className="py-2.5 px-2 min-w-[130px] text-primary">Spesifikasi / Spec</th>
                    <th className="py-2.5 px-2 w-20 text-center">Qty & Sat</th>
                    {candidateSuppliers.map((supp, sIdx) => (
                      <th
                        key={sIdx}
                        className="py-2.5 px-3 min-w-[160px] text-right border-l border-border-light bg-slate-50"
                      >
                        <div className="font-bold text-text-primary">
                          {supp.supplierName || `Vendor #${sIdx + 1}`}
                        </div>
                        <div className="text-[9px] font-normal text-text-muted">
                          {supp.location || 'Lokal'} • {supp.paymentTerms || '-'}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {itemsList.map((itm, itmIdx) => {
                    const quotes = candidateSuppliers.map((s) => s.itemRates?.[itmIdx]?.quotedUnitPrice ?? 0);
                    const validQuotes = quotes.filter((q) => q > 0);
                    const minQuote = validQuotes.length > 0 ? Math.min(...validQuotes) : 0;

                    return (
                      <tr key={itmIdx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-2 text-center text-text-muted sticky left-0 bg-bg-white">{itmIdx + 1}</td>
                        <td className="py-2 px-2 font-bold text-text-primary sticky left-8 bg-bg-white">{itm.item}</td>
                        <td className="py-2 px-2 text-text-secondary italic">{itm.specifications || '-'}</td>
                        <td className="py-2 px-2 text-center font-bold">
                          {itm.qty} {itm.unit}
                        </td>
                        {candidateSuppliers.map((supp, sIdx) => {
                          const unitPrice = supp.itemRates?.[itmIdx]?.quotedUnitPrice ?? 0;
                          const lineTotal = (Number(itm.qty) || 1) * unitPrice;
                          const isLowest = unitPrice > 0 && unitPrice === minQuote && candidateSuppliers.length > 1;

                          return (
                            <td key={sIdx} className="py-2 px-3 text-right font-mono border-l border-border-light">
                              <div className="font-bold text-text-primary flex items-center justify-end gap-1">
                                <span>{formatRupiah(unitPrice)}</span>
                                {isLowest && (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800">
                                    Termurah
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-text-muted">
                                Total: {formatRupiah(lineTotal)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Subtotal Row */}
                  <tr className="bg-slate-50/80 font-bold border-t-2 border-border-light">
                    <td colSpan={4} className="py-2.5 px-3 text-right text-xs uppercase font-black text-text-muted">
                      Subtotal Material
                    </td>
                    {candidateSuppliers.map((supp, sIdx) => (
                      <td
                        key={sIdx}
                        className="py-2.5 px-3 text-right font-mono font-bold text-xs border-l border-border-light"
                      >
                        {formatRupiah(supp.subtotalItems)}
                      </td>
                    ))}
                  </tr>

                  {/* Shipping Cost Row */}
                  <tr className="bg-slate-50/80 font-bold">
                    <td colSpan={4} className="py-2 px-3 text-right text-xs uppercase font-black text-text-muted">
                      Ongkos Kirim
                    </td>
                    {candidateSuppliers.map((supp, sIdx) => (
                      <td
                        key={sIdx}
                        className="py-2 px-3 text-right font-mono text-xs border-l border-border-light"
                      >
                        {formatRupiah(supp.shippingCost)}
                      </td>
                    ))}
                  </tr>

                  {/* Total Landed Cost Row */}
                  {(() => {
                    const landedCosts = candidateSuppliers.map((s) => s.totalLandedCost || 0);
                    const validLanded = landedCosts.filter((c) => c > 0);
                    const minLanded = validLanded.length > 0 ? Math.min(...validLanded) : 0;

                    return (
                      <tr className="bg-purple-50/50 font-black border-t-2 border-purple-200">
                        <td colSpan={4} className="py-3 px-3 text-right text-xs uppercase font-black text-purple-900">
                          Total Landed Cost
                        </td>
                        {candidateSuppliers.map((supp, sIdx) => {
                          const isLowestLanded = (supp.totalLandedCost || 0) === minLanded && validLanded.length > 1;
                          return (
                            <td
                              key={sIdx}
                              className="py-3 px-3 text-right font-mono text-sm border-l border-border-light text-purple-955"
                            >
                              <div>{formatRupiah(supp.totalLandedCost)}</div>
                              {isLowestLanded && (
                                <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800">
                                  Terendah Keseluruhan
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })()}

                  {/* Recommendation Selector Row */}
                  <tr className="bg-white border-t border-border-light">
                    <td colSpan={4} className="py-3 px-3 text-right text-xs font-black text-text-primary">
                      Pilihan Pemenang PO:
                    </td>
                    {candidateSuppliers.map((supp, sIdx) => (
                      <td key={sIdx} className="py-3 px-3 text-center border-l border-border-light">
                        <button
                          type="button"
                          onClick={() => handleSelectRecommendedSupplier(sIdx)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            supp.isRecommended
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-text-secondary'
                          }`}
                        >
                          {supp.isRecommended ? '⭐ Terpilih Pemenang' : 'Pilih Ini'}
                        </button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bottom Section: Finance Approver Selection & Submission */}
        <div className="mt-5 pt-4 border-t border-border-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block flex items-center gap-1">
              <ShieldCheck size={12} className="text-emerald-600" />
              <span>Otorisasi PO Ditujukan Kepada (Direktur Keuangan / Budget Controller):</span>
            </label>
            {isOwner ? (
              <select
                value={sourcingFinanceApproverId}
                onChange={(e) => setSourcingFinanceApproverId(e.target.value)}
                className="w-full p-2 text-xs rounded-lg border border-border-light bg-bg-white font-medium"
              >
                <option value="">-- Bebas (Semua Direktur Keuangan) --</option>
                {authorizers.financeApprovers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName} ({u.role})
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-2 text-xs rounded-lg bg-bg-light border border-border-light text-text-secondary font-medium">
                {typeof order?.assignedFinanceApproverId === 'object'
                  ? order.assignedFinanceApproverId?.fullName || order.assignedFinanceApproverId?.name
                  : authorizers.financeApprovers.find((u) => u._id === order?.assignedFinanceApproverId)?.fullName ||
                    'Direktur Keuangan (Sesuai Alur Perusahaan)'}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmitSourcing}
              disabled={submittingSourcing}
              className="px-5 py-2.5 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckCircle2 size={15} />
              <span>{submittingSourcing ? 'Menyimpan...' : 'Ajukan Komparasi ke Direktur Keuangan'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
