import React, { useState, useId } from 'react';
import { z } from 'zod';
import {
  Receipt,
  MapPin,
  Camera,
  AlertTriangle,
  CheckCircle2,
  X,
  UploadCloud,
  Loader2,
  Info,
  DollarSign,
  Layers,
} from 'lucide-react';
import { RABItem, LocalPurchase } from '../../types';
import { useSwakelola } from '../../contexts/SwakelolaContext';
import { offlineDb } from '../../services/offlineDb';

export const localPurchaseFormSchema = z.object({
  rabItemId: z.string().min(1, 'Pilih mata anggaran RAB yang sesuai'),
  voucherNumber: z.string().min(3, 'Nomor kuitansi/bukti voucher wajib diisi (min. 3 karakter)'),
  purchaserName: z.string().min(2, 'Nama pelaksana/pembeli wajib diisi'),
  supplierName: z.string().min(2, 'Nama toko/supplier lokal wajib diisi'),
  supplierContact: z.string().optional(),
  itemDescription: z.string().min(3, 'Deskripsi spesifikasi barang wajib diisi'),
  quantity: z
    .number()
    .positive('Jumlah kuantitas harus lebih dari 0'),
  unitPrice: z
    .number()
    .min(0, 'Harga satuan tidak boleh negatif'),
  notes: z.string().optional(),
});

export type LocalPurchaseFormData = z.infer<typeof localPurchaseFormSchema>;

interface LocalPurchaseFormProps {
  projectId: string;
  rabItems: RABItem[];
  onSuccess?: (purchase: LocalPurchase) => void;
  onCancel?: () => void;
}

export default function LocalPurchaseForm({
  projectId,
  rabItems,
  onSuccess,
  onCancel,
}: LocalPurchaseFormProps) {
  const { recordPurchase } = useSwakelola();

  const [formData, setFormData] = useState({
    rabItemId: '',
    voucherNumber: '',
    purchaserName: '',
    supplierName: '',
    supplierContact: '',
    itemDescription: '',
    quantity: '',
    unitPrice: '',
    notes: '',
  });

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat?: number; lng?: number; addressText?: string }>({});
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState<string | null>(null);

  // Generate unique form IDs for accessibility
  const idPrefix = useId();

  // Selected RAB Item details
  const selectedRAB = rabItems.find((item) => item._id === formData.rabItemId);
  const qtyNum = parseFloat(formData.quantity) || 0;
  const unitPriceNum = parseFloat(formData.unitPrice) || 0;
  const totalPrice = qtyNum * unitPriceNum;

  const remainingQty = selectedRAB
    ? Math.max(0, (selectedRAB.budgetedQuantity || 0) - (selectedRAB.realizedQuantity || 0))
    : 0;

  const isExceedingQuota = selectedRAB && qtyNum > remainingQty;

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setFieldErrors((prev) => ({
          ...prev,
          receiptPhoto: 'Ukuran foto nota maksimal 10MB',
        }));
        return;
      }
      setReceiptFile(file);
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.receiptPhoto;
        return next;
      });
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation tidak didukung oleh browser Anda.');
      return;
    }
    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        setLocation({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          addressText: `Lat: ${pos.coords.latitude.toFixed(4)}, Lng: ${pos.coords.longitude.toFixed(4)} (GPS Lapangan)`,
        });
      },
      (err) => {
        setIsLocating(false);
        setLocationError(`Gagal membaca GPS: ${err.message}`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccessMsg(null);

    // Validate with Zod
    const validationResult = localPurchaseFormSchema.safeParse({
      ...formData,
      quantity: parseFloat(formData.quantity),
      unitPrice: parseFloat(formData.unitPrice),
    });

    const errors: Record<string, string> = {};

    if (!validationResult.success) {
      validationResult.error.issues.forEach((err: any) => {
        const path = err.path[0] as string;
        if (!errors[path]) {
          errors[path] = err.message;
        }
      });
    }

    if (!receiptFile && !receiptPreview) {
      errors.receiptPhoto = 'Foto kuitansi / nota belanja wajib diunggah';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      // Check offline mode
      if (!navigator.onLine) {
        // Save to Dexie IndexedDB
        const offlineRecord = {
          localUuid: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          projectId,
          rabItemId: formData.rabItemId,
          voucherNumber: formData.voucherNumber,
          purchaserName: formData.purchaserName,
          supplierName: formData.supplierName,
          itemDescription: formData.itemDescription,
          quantity: qtyNum,
          unitPrice: unitPriceNum,
          totalPrice,
          receiptPhotoBase64: receiptPreview || undefined,
          geotagLocation: location.lat && location.lng ? { lat: location.lat, lng: location.lng } : undefined,
          syncStatus: 'PENDING' as const,
          createdAt: new Date().toISOString(),
        };

        await offlineDb.offlinePurchases.add(offlineRecord);
        setSubmitSuccessMsg(
          'Tersimpan offline di memori browser lokal! Voucher akan otomatis diunggah begitu koneksi internet pulih.'
        );
        setIsSubmitting(false);
        setTimeout(() => {
          if (onSuccess) {
            onSuccess({
              _id: offlineRecord.localUuid,
              projectId,
              rabItemId: formData.rabItemId,
              voucherNumber: formData.voucherNumber,
              purchaserName: formData.purchaserName,
              supplierName: formData.supplierName,
              itemDescription: formData.itemDescription,
              quantity: qtyNum,
              unitPrice: unitPriceNum,
              totalPrice,
              receiptPhotoUrl: receiptPreview || '',
              status: 'DRAFT',
              createdAt: offlineRecord.createdAt,
            });
          }
        }, 1200);
        return;
      }

      // Online submission via FormData
      const postData = new FormData();
      postData.append('rabItemId', formData.rabItemId);
      postData.append('voucherNumber', formData.voucherNumber);
      postData.append('purchaserName', formData.purchaserName);
      postData.append('supplierName', formData.supplierName);
      if (formData.supplierContact) postData.append('supplierContact', formData.supplierContact);
      postData.append('itemDescription', formData.itemDescription);
      postData.append('quantity', String(qtyNum));
      postData.append('unitPrice', String(unitPriceNum));
      if (formData.notes) postData.append('notes', formData.notes);

      if (receiptFile) {
        postData.append('receiptPhoto', receiptFile);
      }

      if (location.lat !== undefined && location.lng !== undefined) {
        postData.append(
          'geotagLocation',
          JSON.stringify({
            lat: location.lat,
            lng: location.lng,
            addressText: location.addressText,
          })
        );
      }

      const created = await recordPurchase(postData);
      setSubmitSuccessMsg('Voucher pembelian langsung berhasil dicatat & kuota RAB terupdate!');
      setIsSubmitting(false);

      if (onSuccess) {
        setTimeout(() => onSuccess(created), 800);
      }
    } catch (err: any) {
      setIsSubmitting(false);
      const serverMsg =
        err.response?.data?.msg || err.message || 'Gagal menyimpan transaksi pembelian langsung.';
      setSubmitError(serverMsg);
    }
  };

  return (
    <div className="bg-bg-white border border-border-light rounded-xl shadow-lg p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-light pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Receipt size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-primary tracking-tight">
              Catat Pembelian Langsung (UMK Swakelola)
            </h2>
            <p className="text-sm text-text-muted">
              Input bukti transaksi riil lapangan dengan kontrol anggaran RAB & geotagging
            </p>
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-text-muted hover:text-text-primary p-2 rounded-lg hover:bg-bg-secondary transition-colors"
            title="Tutup Form"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Global Banners */}
      {submitError && (
        <div className="mb-6 p-4 rounded-lg bg-semantic-danger/10 border border-semantic-danger/30 flex items-start gap-3 text-semantic-danger text-sm">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{submitError}</div>
        </div>
      )}

      {submitSuccessMsg && (
        <div className="mb-6 p-4 rounded-lg bg-semantic-success/10 border border-semantic-success/30 flex items-start gap-3 text-semantic-success text-sm">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{submitSuccessMsg}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1: Mata Anggaran RAB */}
        <div className="bg-bg-secondary/40 border border-border-light rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers size={18} className="text-primary" />
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
              1. Alokasi Mata Anggaran RAB
            </h3>
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-rabItemId`}
              className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5"
            >
              Mata Anggaran WBS <span className="text-semantic-danger">*</span>
            </label>
            <select
              id={`${idPrefix}-rabItemId`}
              value={formData.rabItemId}
              onChange={(e) => handleInputChange('rabItemId', e.target.value)}
              className={`w-full bg-bg-white border rounded-lg px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                fieldErrors.rabItemId ? 'border-semantic-danger ring-1 ring-semantic-danger' : 'border-border-light'
              }`}
            >
              <option value="">-- Pilih Mata Anggaran WBS --</option>
              {rabItems.map((item) => (
                <option key={item._id} value={item._id}>
                  [{item.wbsCode}] {item.description} ({item.unitOfMeasure}) - Sisa Kuota:{' '}
                  {Math.max(0, (item.budgetedQuantity || 0) - (item.realizedQuantity || 0)).toLocaleString('id-ID')}
                </option>
              ))}
            </select>
            {fieldErrors.rabItemId && (
              <p className="mt-1 text-xs text-semantic-danger font-medium">{fieldErrors.rabItemId}</p>
            )}
          </div>

          {/* Real-time Budget Info Badge */}
          {selectedRAB && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border-light/60">
              <div className="bg-bg-white p-2.5 rounded border border-border-light">
                <span className="block text-[11px] text-text-muted font-medium">Anggaran RAB</span>
                <span className="text-xs font-mono font-bold text-text-primary">
                  {(selectedRAB.budgetedQuantity || 0).toLocaleString('id-ID')} {selectedRAB.unitOfMeasure}
                </span>
              </div>
              <div className="bg-bg-white p-2.5 rounded border border-border-light">
                <span className="block text-[11px] text-text-muted font-medium">Sudah Terealisasi</span>
                <span className="text-xs font-mono font-bold text-text-secondary">
                  {(selectedRAB.realizedQuantity || 0).toLocaleString('id-ID')} {selectedRAB.unitOfMeasure}
                </span>
              </div>
              <div
                className={`p-2.5 rounded border ${
                  remainingQty <= 0
                    ? 'bg-semantic-danger/10 border-semantic-danger/30 text-semantic-danger'
                    : 'bg-semantic-success/10 border-semantic-success/30 text-semantic-success'
                }`}
              >
                <span className="block text-[11px] font-medium">Sisa Kuota Fisik</span>
                <span className="text-xs font-mono font-bold">
                  {remainingQty.toLocaleString('id-ID')} {selectedRAB.unitOfMeasure}
                </span>
              </div>
              <div className="bg-bg-white p-2.5 rounded border border-border-light">
                <span className="block text-[11px] text-text-muted font-medium">Tarif Satuan RAB</span>
                <span className="text-xs font-mono font-bold text-text-primary">
                  Rp {(selectedRAB.unitRate || 0).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          )}

          {isExceedingQuota && (
            <div className="mt-3 p-3 rounded bg-semantic-danger/10 border border-semantic-danger/30 text-semantic-danger text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>
                <strong>Peringatan Hard-Cap:</strong> Kuantitas ({qtyNum.toLocaleString('id-ID')}) melebihi sisa kuota
                RAB ({remainingQty.toLocaleString('id-ID')} {selectedRAB?.unitOfMeasure}). Server akan menolak transaksi jika melebihi plafon.
              </span>
            </div>
          )}
        </div>

        {/* SECTION 2: Bukti Kuitansi & Vendor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor={`${idPrefix}-voucherNumber`}
              className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5"
            >
              No. Kuitansi / Voucher UMK <span className="text-semantic-danger">*</span>
            </label>
            <input
              id={`${idPrefix}-voucherNumber`}
              type="text"
              placeholder="Contoh: KW-001/SWK/2026"
              value={formData.voucherNumber}
              onChange={(e) => handleInputChange('voucherNumber', e.target.value)}
              className={`w-full bg-bg-white border rounded-lg px-3.5 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                fieldErrors.voucherNumber ? 'border-semantic-danger ring-1 ring-semantic-danger' : 'border-border-light'
              }`}
            />
            {fieldErrors.voucherNumber && (
              <p className="mt-1 text-xs text-semantic-danger font-medium">{fieldErrors.voucherNumber}</p>
            )}
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-purchaserName`}
              className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5"
            >
              Nama Pelaksana / Pembeli <span className="text-semantic-danger">*</span>
            </label>
            <input
              id={`${idPrefix}-purchaserName`}
              type="text"
              placeholder="Nama personil yang membelanjakan dana"
              value={formData.purchaserName}
              onChange={(e) => handleInputChange('purchaserName', e.target.value)}
              className={`w-full bg-bg-white border rounded-lg px-3.5 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                fieldErrors.purchaserName ? 'border-semantic-danger ring-1 ring-semantic-danger' : 'border-border-light'
              }`}
            />
            {fieldErrors.purchaserName && (
              <p className="mt-1 text-xs text-semantic-danger font-medium">{fieldErrors.purchaserName}</p>
            )}
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-supplierName`}
              className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5"
            >
              Nama Toko / Supplier Lokal <span className="text-semantic-danger">*</span>
            </label>
            <input
              id={`${idPrefix}-supplierName`}
              type="text"
              placeholder="Contoh: Toko Bangunan Berkah Jaya"
              value={formData.supplierName}
              onChange={(e) => handleInputChange('supplierName', e.target.value)}
              className={`w-full bg-bg-white border rounded-lg px-3.5 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                fieldErrors.supplierName ? 'border-semantic-danger ring-1 ring-semantic-danger' : 'border-border-light'
              }`}
            />
            {fieldErrors.supplierName && (
              <p className="mt-1 text-xs text-semantic-danger font-medium">{fieldErrors.supplierName}</p>
            )}
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-supplierContact`}
              className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5"
            >
              Kontak / Telepon Toko (Opsional)
            </label>
            <input
              id={`${idPrefix}-supplierContact`}
              type="text"
              placeholder="No. HP / Telp toko lokal"
              value={formData.supplierContact}
              onChange={(e) => handleInputChange('supplierContact', e.target.value)}
              className="w-full bg-bg-white border border-border-light rounded-lg px-3.5 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* SECTION 3: Rincian Barang & Keuangan */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <label
              htmlFor={`${idPrefix}-itemDescription`}
              className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5"
            >
              Deskripsi & Spesifikasi Barang <span className="text-semantic-danger">*</span>
            </label>
            <input
              id={`${idPrefix}-itemDescription`}
              type="text"
              placeholder="Contoh: Semen Gresik PPC 40kg, Pasir Pasang 1 Truk Colt Diesel"
              value={formData.itemDescription}
              onChange={(e) => handleInputChange('itemDescription', e.target.value)}
              className={`w-full bg-bg-white border rounded-lg px-3.5 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                fieldErrors.itemDescription ? 'border-semantic-danger ring-1 ring-semantic-danger' : 'border-border-light'
              }`}
            />
            {fieldErrors.itemDescription && (
              <p className="mt-1 text-xs text-semantic-danger font-medium">{fieldErrors.itemDescription}</p>
            )}
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-quantity`}
              className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5"
            >
              Jumlah Kuantitas ({selectedRAB?.unitOfMeasure || 'Satuan'}){' '}
              <span className="text-semantic-danger">*</span>
            </label>
            <input
              id={`${idPrefix}-quantity`}
              type="number"
              step="any"
              min="0.01"
              placeholder="0.00"
              value={formData.quantity}
              onChange={(e) => handleInputChange('quantity', e.target.value)}
              className={`w-full font-mono text-right bg-bg-white border rounded-lg px-3.5 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                fieldErrors.quantity ? 'border-semantic-danger ring-1 ring-semantic-danger' : 'border-border-light'
              }`}
            />
            {fieldErrors.quantity && (
              <p className="mt-1 text-xs text-semantic-danger font-medium">{fieldErrors.quantity}</p>
            )}
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-unitPrice`}
              className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5"
            >
              Harga Satuan Riil (Rp) <span className="text-semantic-danger">*</span>
            </label>
            <input
              id={`${idPrefix}-unitPrice`}
              type="number"
              step="any"
              min="0"
              placeholder="0"
              value={formData.unitPrice}
              onChange={(e) => handleInputChange('unitPrice', e.target.value)}
              className={`w-full font-mono text-right bg-bg-white border rounded-lg px-3.5 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                fieldErrors.unitPrice ? 'border-semantic-danger ring-1 ring-semantic-danger' : 'border-border-light'
              }`}
            />
            {fieldErrors.unitPrice && (
              <p className="mt-1 text-xs text-semantic-danger font-medium">{fieldErrors.unitPrice}</p>
            )}
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-totalPrice`}
              className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5"
            >
              Total Pembayaran Riil
            </label>
            <div
              id={`${idPrefix}-totalPrice`}
              tabIndex={0}
              role="region"
              aria-label="Total Pembayaran Riil"
              className="w-full font-mono font-bold text-right bg-bg-secondary/60 border border-border-light rounded-lg px-3.5 py-2 text-sm text-primary tabular-nums"
            >
              Rp {totalPrice.toLocaleString('id-ID')}
            </div>
          </div>
        </div>

        {/* SECTION 4: Upload Foto Nota & Geotag GPS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Foto Nota */}
          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
              Foto Bukti Kuitansi / Nota Belanja <span className="text-semantic-danger">*</span>
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center transition-colors ${
                fieldErrors.receiptPhoto
                  ? 'border-semantic-danger/60 bg-semantic-danger/5'
                  : 'border-border-light hover:border-primary/50 bg-bg-secondary/20'
              }`}
            >
              {receiptPreview ? (
                <div className="relative group w-full flex flex-col items-center">
                  <img
                    src={receiptPreview}
                    alt="Preview Kuitansi"
                    className="max-h-40 rounded object-contain border border-border-light"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptFile(null);
                      setReceiptPreview(null);
                    }}
                    className="mt-2 text-xs text-semantic-danger hover:underline font-medium"
                  >
                    Ganti Foto Kuitansi
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center w-full">
                  <Camera size={28} className="text-text-muted mb-2" />
                  <span className="text-xs font-semibold text-text-primary">
                    Pilih File Foto / Kamera HP
                  </span>
                  <span className="text-[11px] text-text-muted mt-0.5">
                    JPG, PNG, atau WebP (Maks. 10MB)
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            {fieldErrors.receiptPhoto && (
              <p className="mt-1 text-xs text-semantic-danger font-medium">{fieldErrors.receiptPhoto}</p>
            )}
          </div>

          {/* Geotag Lokasi GPS */}
          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
              Geotag GPS Lapangan (Anti-Fraud)
            </label>
            <div className="border border-border-light rounded-lg p-4 bg-bg-secondary/20 flex flex-col justify-between h-[120px]">
              {location.lat && location.lng ? (
                <div className="flex items-start gap-2.5">
                  <MapPin size={18} className="text-semantic-success shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-bold text-semantic-success">Koordinat Terverifikasi</p>
                    <p className="font-mono text-text-secondary mt-0.5">
                      Lat: {location.lat}, Lng: {location.lng}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-xs text-text-muted">
                  <Info size={16} className="shrink-0 mt-0.5" />
                  <span>Tekan tombol di bawah untuk mencatat koordinat GPS toko/lokasi saat ini.</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleGetLocation}
                disabled={isLocating}
                className="w-full mt-2 py-1.5 px-3 bg-bg-white border border-border-light hover:bg-bg-secondary text-text-primary text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
              >
                {isLocating ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-primary" />
                    <span>Mendeteksi Satelit GPS...</span>
                  </>
                ) : (
                  <>
                    <MapPin size={14} className="text-primary" />
                    <span>{location.lat ? 'Perbarui Lokasi GPS' : 'Ambil Lokasi GPS Saat Ini'}</span>
                  </>
                )}
              </button>
            </div>
            {locationError && (
              <p className="mt-1 text-xs text-semantic-danger font-medium">{locationError}</p>
            )}
          </div>
        </div>

        {/* Catatan Tambahan */}
        <div>
          <label
            htmlFor={`${idPrefix}-notes`}
            className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5"
          >
            Catatan Tambahan (Opsional)
          </label>
          <textarea
            id={`${idPrefix}-notes`}
            rows={2}
            placeholder="Keterangan kondisi barang, alasan pembelian mendesak, dll."
            value={formData.notes}
            onChange={(e) => handleInputChange('notes', e.target.value)}
            className="w-full bg-bg-white border border-border-light rounded-lg px-3.5 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-light">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-secondary rounded-lg transition-colors"
            >
              Batal
            </button>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-bold rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Memproses Bukti Transaksi...</span>
              </>
            ) : (
              <>
                <UploadCloud size={16} />
                <span>Simpan Bukti Pembelian</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
