# Procurement System Architecture: Post-GRN Payment Confirmation & Paylater Scheme (0% Interest)

**Target Platform:** MTERPweb (Construction & Enterprise Operations Management Platform)  
**Modules Affected:** Procurement & PO (`mterp-web/src/pages/Materials.tsx`, `mterp-backend/src/routes/requests.js`, `mterp-backend/src/models/Request.js`)  
**Status:** Unified Architectural Plan & Execution Blueprint  
**Scope:**
1. **Post-GRN Payment Confirmation & Settlement System** (Mandatory Bon Pembayaran, Bukti Transfer Bank, and Invoice Evidence)
2. **Paylater Scheme** ("Ambil Dulu Bayar Nanti" / Take First Pay Later with 0% Interest)

---

## 1. Executive Summary & Domain Architecture

In construction project supply chain management, standard commercial workflows enforce **3-Way Matching** (`PR` ➔ `PO` ➔ `GRN` ➔ `Invoice & Payment Settlement`). 

Previously, the MTERP procurement pipeline concluded at **Stage 5: Goods Receipt Note (GRN / DELIVERED)** upon physical verification at the job site. This left the financial settlement phase unrecorded in the system. Furthermore, project procurement frequently sources bulk materials (aggregates, sand, brick, masonry, and rebar) under partner consignment/credit terms: **Paylater ("Ambil Dulu Bayar Nanti")** with strictly **0% interest / Tanpa Bunga**, where settlement occurs only after physical site verification (GRN) or project milestone billing.

This document unifies both capabilities into a single, cohesive, enterprise-grade architecture.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                       END-TO-END PROCUREMENT & SETTLEMENT PIPELINE                          │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  [ 1. Pengajuan PR ] ──► [ 2. Komparasi PO & Sourcing ]                                     │
│         │                          │                                                        │
│         │                          ├─► Standard Terms (COD / Tempo / DP)                    │
│         │                          └─► [★] "Skema Paylater"                                 │
│         │                                  - Ambil Dulu Bayar Nanti                         │
│         │                                  - Bunga 0% (Tanpa Bunga)                         │
│         │                                  - DP: Rp 0                                       │
│         │                                                                                   │
│         ▼                                                                                   │
│  [ 3. Siap Beli (PO Disetujui) ] ──► [ 4. Pengiriman & Dispatch ]                           │
│         │                                       │                                           │
│         │                                       ├─► Input Surat Jalan & Nota Supir          │
│         │                                       └─► Notifikasi Lapangan                     │
│         │                                                                                   │
│         ▼                                                                                   │
│  [ 5. Penerimaan di Proyek (GRN) ]                                                          │
│         ├── Verifikasi Fisik Qty & Kondisi (Good / Damaged / Partial)                       │
│         ├── Foto Fisik Kedatangan Site Wajib                                                │
│         ├── Tanda Tangan Digital Penerima & Supir                                           │
│         ├── Auto Inflow Stok Supply & Realisasi RAB Proyek                                  │
│         └── Terbit Dokumen GRN PDF Resmi                                                    │
│         │                                                                                   │
│         ▼                                                                                   │
│  [ 6. Konfirmasi Pembayaran & Pelunasan (Settlement) ]                                       │
│         ├── 3-Way Match Check (PO vs GRN Qty vs Tagihan)                                    │
│         ├── Perhitungan Pelunasan (Pokok PO + Bunga 0% Paylater)                            │
│         ├── Input Tanggal, Metode, Rekening Asal & Tujuan                                   │
│         ├── Upload Wajib: Bon Pembayaran / Kuitansi Asli Toko/Supplier                     │
│         ├── Upload Wajib: Bukti Transfer Bank / Rekening Koran                              │
│         ├── Upload Opsional: Faktur Pajak / Invoice Resmi                                   │
│         └── Tanda Tangan Digital Finance / Kasir                                            │
│         │                                                                                   │
│         ▼                                                                                   │
│  [ 7. Selesai & Lunas (Status: PAID) ]                                                      │
│         ├── Cetak Bukti Kas Keluar / Payment Voucher PDF Resmi                              │
│         ├── Galeri Inspeksi Bukti Pembayaran Digital                                        │
│         └── Notifikasi WhatsApp & In-App ke Manajemen & Proyek                             │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Enhancements & System Modifications

### 2.1 Backend Data Model (`mterp-backend/src/models/Request.js`)

Extend the `requestSchema` and subdocuments:

```javascript
// 1. Status Lifecycle Enum Addition
status: {
  type: String,
  enum: [
    'Pending', 'Approved', 'Rejected',
    'PR_PENDING', 'PR_REVIEWED', 'PR_APPROVED', 'PR_REJECTED',
    'PO_PENDING_FINANCE', 'MUST_PURCHASE', 'ON_THE_WAY',
    'Delivered', 'DELIVERED',
    'PAID' // ➔ Final Settled Status
  ],
  default: 'PR_PENDING',
},

// 2. Sourcing Comparison & Selected Supplier Enhancement (Paylater Scheme)
comparisons: [{
  supplierName: { type: String, required: true, trim: true },
  location: { type: String, default: '' },
  contact: { type: String, default: '' },
  itemRates: [{
    itemIndex: Number,
    itemName: String,
    quotedUnitPrice: Number,
    quotedTotalAmount: Number,
  }],
  subtotalItems: { type: Number, default: 0 },
  shippingCost: { type: Number, default: 0 },
  totalLandedCost: { type: Number, default: 0 },
  leadTimeDays: Number,
  paymentTerms: String,
  notes: String,
  isRecommended: { type: Boolean, default: false },

  // Paylater "Take First Pay Later" Fields:
  isPaylater: { type: Boolean, default: false },
  schemeType: {
    type: String,
    enum: ['STANDARD', 'PAYLATER'],
    default: 'STANDARD',
  },
  interestRate: { type: Number, default: 0 }, // Strictly 0%
  settlementTerms: { type: String, default: 'Tempo Setelah GRN Tanpa Bunga' },
}],

selectedSupplier: {
  supplierName: String,
  location: String,
  contact: String,
  subtotalItems: Number,
  shippingCost: Number,
  totalLandedCost: Number,
  leadTimeDays: Number,
  paymentTerms: String,
  isPaylater: { type: Boolean, default: false },
  schemeType: {
    type: String,
    enum: ['STANDARD', 'PAYLATER'],
    default: 'STANDARD',
  },
  interestRate: { type: Number, default: 0 },
  settlementTerms: String,
},

// 3. Post-GRN Payment Confirmation Subdocument
paymentConfirmation: {
  paymentDate: {
    type: Date,
    default: Date.now,
  },
  paymentType: {
    type: String,
    enum: [
      'Full Payment (Lunas)',
      'Down Payment (DP)',
      'Pelunasan Akhir',
      'Termin Proyek',
      'Pelunasan Paylater (Bunga 0%)'
    ],
    default: 'Full Payment (Lunas)',
  },
  paymentMethod: {
    type: String,
    enum: ['Bank Transfer', 'Kas Tunai Proyek', 'Giro / Cek', 'Kasbon Settlement', 'Lainnya'],
    default: 'Bank Transfer',
  },
  amountPaid: {
    type: Number,
    required: true,
  },
  principalAmount: {
    type: Number,
    default: 0,
  },
  interestRate: {
    type: Number,
    default: 0, // Enforced 0 for Paylater scheme
  },
  interestAmount: {
    type: Number,
    default: 0,
  },
  sourceAccount: {
    type: String,
    trim: true, // e.g., "BCA PT Mega Tama Enerco (Acc 123-456-7890)"
  },
  targetAccount: {
    type: String,
    trim: true, // e.g., "Bank Mandiri - Toko Material (Acc 987-654-3210)"
  },
  targetAccountName: {
    type: String,
    trim: true,
  },
  referenceNumber: {
    type: String,
    trim: true, // Transaction ID / No Bukti Kas Keluar (BKK)
  },
  notes: {
    type: String,
    default: '',
  },

  // ── Uploaded Evidences ──
  bonPembayaranUrl: {
    type: String,
    required: true, // Mandatory: Bon Pembayaran / Nota Fisik Asli
  },
  transferReceiptUrl: {
    type: String,
    required: true, // Mandatory: Bukti Transfer Bank / Rekening Koran
  },
  invoiceDocUrl: {
    type: String, // Optional: Faktur Pajak / Invoice Tagihan Resmi
  },
  additionalEvidences: [{
    fileUrl: String,
    fileName: String,
  }],

  // ── Verification & Sign-off ──
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  confirmedAt: {
    type: Date,
    default: Date.now,
  },
  payerSignature: {
    type: String, // Base64 signature data URL
  },
}
```

---

### 2.2 Backend Routes & Business Logic (`mterp-backend/src/routes/requests.js`)

#### A. Endpoint `PUT /api/requests/:id/confirm-payment`
Handles financial reconciliation and evidence upload after GRN:
- **Authorization**: `['owner', 'president_director', 'director', 'admin_project', 'asset_admin']` or assigned Finance Approver.
- **Multer Storage Config**:
  ```javascript
  upload.fields([
    { name: 'bonPembayaran', maxCount: 1 },
    { name: 'transferReceipt', maxCount: 1 },
    { name: 'invoiceDoc', maxCount: 1 },
  ])
  ```
- **Validation Guardrails**:
  1. Target request must currently be in `DELIVERED` status (goods confirmed on site).
  2. `bonPembayaran` file or URL is strictly mandatory.
  3. `transferReceipt` file or URL is mandatory for non-cash payment methods.
  4. `amountPaid` must be numeric and > 0.
  5. If `schemeType === 'PAYLATER'`, `interestAmount` is guaranteed to be `0`.
- **Execution & Transactions**:
  - Run inside Mongoose session (`withTransaction`).
  - Store file paths: `/uploads/documents/...`
  - Update `request.status = 'PAID'`.
- **Automated Notifications**:
  - In-app notification to requester, site manager, and directors.
  - WhatsApp broadcast formatted with `formatMaterialPaymentSettled`.

#### B. Query Population Update
Update `populateProcurement(query)`:
```javascript
function populateProcurement(query) {
  return query
    .populate('requestedBy', 'fullName role phone nik')
    .populate('projectId', 'nama lokasi')
    .populate('approvedBy', 'fullName role')
    .populate('reviewedBy.user', 'fullName role')
    .populate('opsApprovedBy.user', 'fullName role')
    .populate('financeApprovedBy.user', 'fullName role')
    .populate('assignedReviewerId', 'fullName role phone email')
    .populate('assignedOpsApproverId', 'fullName role phone email')
    .populate('assignedFinanceApproverId', 'fullName role phone email')
    .populate('deliveryProof.receivedBy', 'fullName role')
    .populate('paymentConfirmation.confirmedBy', 'fullName role') // ➔ Populated Payment Confirming Officer
    .populate('items.rabItemId', 'wbsCode description unitRate unitOfMeasure budgetedQuantity committedQuantity realizedQuantity');
}
```

---

### 2.3 WhatsApp Notification Templates (`mterp-backend/src/utils/whatsappTemplates.js`)

Add notification template `formatMaterialPaymentSettled(request)`:

```javascript
function formatMaterialPaymentSettled(request) {
  const isPaylater = request.selectedSupplier?.schemeType === 'PAYLATER' || request.paymentConfirmation?.schemeApplied === 'PAYLATER';
  const schemeTag = isPaylater ? ' [SKEMA PAYLATER (BUNGA 0%)]' : '';
  const projectName = request.projectId?.nama || 'Proyek';
  const payer = request.paymentConfirmation?.confirmedBy?.fullName || 'Divisi Keuangan';
  const amount = Number(request.paymentConfirmation?.amountPaid || 0).toLocaleString('id-ID');
  const method = request.paymentConfirmation?.paymentMethod || 'Bank Transfer';

  return [
    `💰 *PEMBAYARAN PENGADAAN MATERIAL LUNAS (SETTLED)*${schemeTag}`,
    'PT MEGA TAMA ENERCO — MTERP FINANCE',
    '',
    `Nomor PO: *${request.poNumber || request.prNumber}*`,
    `Proyek: *${projectName}*`,
    `Supplier / Toko: *${request.selectedSupplier?.supplierName || '-'}*`,
    `Nominal Terbayar: *Rp ${amount}*`,
    `Beban Bunga: *Rp 0 (0% Bunga)*`,
    `Metode: *${method}*`,
    `Dikonfirmasi Oleh: *${payer}*`,
    `Tanggal Bayar: *${new Date(request.paymentConfirmation?.paymentDate || Date.now()).toLocaleDateString('id-ID')}*`,
    '',
    '✅ *Status Berkas:* Bukti Bon Pembayaran dan Bukti Transfer Bank telah diverifikasi dan tersimpan dalam arsip MTERP.',
    `🔗 *Lihat Bukti Bayar & Voucher:* ${APP_URL}/materials`,
    '',
    `_Notifikasi Otomatis MTERP Web — ${new Date().toLocaleString('id-ID')} WIB_`,
  ].filter(Boolean).join('\n');
}
```

---

### 2.4 Frontend Types & API Client (`mterp-web`)

#### A. Type Definitions (`mterp-web/src/types/index.ts`)
```typescript
export type ProcurementStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'PR_PENDING'
  | 'PR_REVIEWED'
  | 'PR_APPROVED'
  | 'PR_REJECTED'
  | 'PO_PENDING_FINANCE'
  | 'MUST_PURCHASE'
  | 'ON_THE_WAY'
  | 'Delivered'
  | 'DELIVERED'
  | 'PAID'; // ➔ New Status

export type PipelineTab =
  | 'PR'
  | 'PO_SOURCING'
  | 'MUST_PURCHASE'
  | 'ON_THE_WAY'
  | 'DELIVERED'
  | 'PAID' // ➔ New Tab
  | 'ALL';

export interface IPaymentConfirmation {
  paymentDate: string;
  paymentType: string;
  paymentMethod: string;
  amountPaid: number;
  principalAmount?: number;
  interestRate?: number;
  interestAmount?: number;
  sourceAccount?: string;
  targetAccount?: string;
  targetAccountName?: string;
  referenceNumber?: string;
  notes?: string;
  bonPembayaranUrl: string;
  transferReceiptUrl: string;
  invoiceDocUrl?: string;
  additionalEvidences?: Array<{ fileUrl: string; fileName: string }>;
  confirmedBy?: { _id: string; fullName: string; role?: string };
  confirmedAt?: string;
  payerSignature?: string;
  schemeApplied?: 'STANDARD' | 'PAYLATER';
}

export interface ISupplierComparison {
  supplierName: string;
  location?: string;
  contact?: string;
  itemRates?: ISupplierComparisonItemRate[];
  subtotalItems?: number;
  shippingCost?: number;
  totalLandedCost?: number;
  leadTimeDays?: number;
  paymentTerms?: string;
  notes?: string;
  isRecommended?: boolean;
  isPaylater?: boolean;
  schemeType?: 'STANDARD' | 'PAYLATER';
  interestRate?: number;
  settlementTerms?: string;
}
```

#### B. SCM API Caller (`mterp-web/src/api/scm.api.ts`)
```typescript
export const confirmMaterialPayment = async (id: string, formData: FormData) => {
  const response = await api.put(`/requests/${id}/confirm-payment`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};
```

---

### 2.5 Frontend UI Components

#### A. Sourcing Modal Option: Paylater Scheme (`SupplierSourcingModal.tsx`)
In the supplier comparison form:
1. **Quick Preset Chips** above Syarat Pembayaran:
   - `[✨ Paylater (Bunga 0%)]`
   - `[Tempo 14 Hari]`
   - `[Tempo 30 Hari]`
   - `[Cash on Delivery (COD)]`
   - `[DP 30% - Pelunasan]`
2. **Toggle Switch**:
   - `Skema Paylater (Ambil Dulu Bayar Nanti - Bunga 0%)`
   - Automatically populates `paymentTerms = 'Paylater (Tanpa Bunga)'`, sets `isPaylater = true`, `schemeType = 'PAYLATER'`, and `interestRate = 0`.
   - Displays informative banner explaining zero cash advance required at PO approval.

#### B. New Component: `MaterialPaymentConfirmationModal.tsx`
Enterprise modal opened via `[Konfirmasi Pembayaran]` button on orders with GRN:
- **Order & GRN Recap**:
  - PO Number, PR Number, Project Name, Vendor Name.
  - Total PO Amount vs Actual Delivered Quantities.
  - Link to inspect GRN site photo and view GRN PDF.
- **Paylater Scheme Banner (if active)**:
  - `🏷️ Skema Paylater: Ambil Dulu Bayar Nanti (0% Bunga)`.
  - Pokok Tagihan: `Rp [Total PO]`.
  - Beban Bunga: `Rp 0 (0% Interest)`.
- **Payment Inputs**:
  - Tanggal Bayar (`paymentDate` picker).
  - Jumlah Bayar (`amountPaid` currency input with "Bayar Penuh Sesuai PO" quick-fill button).
  - Tipe Pembayaran (Dropdown: Full Payment / DP / Pelunasan Akhir / Pelunasan Paylater).
  - Metode Pembayaran (Bank Transfer, Kas Tunai, Giro).
  - Rekening Pengirim (Sumber) & Rekening Penerima (Tujuan).
  - No. Referensi Transaksi Bank / Bukti Kas Keluar (BKK).
- **Dual Evidence Uploaders (Drag-and-Drop with Instant Preview)**:
  1. 📄 **Bon Pembayaran / Nota Asli Toko/Supplier** *(Wajib)*.
  2. 💳 **Bukti Transfer Bank / Slip ATM** *(Wajib)*.
  3. 📑 **Faktur Pajak / Invoice Tagihan Supplier** *(Opsional)*.
- **Digital Handwritten Canvas Signature** for cashier / finance sign-off.

#### C. New Component: `PaymentEvidenceViewerModal.tsx`
A dedicated lightbox viewer allowing project managers, directors, and auditors to inspect:
- The uploaded **Bon Pembayaran** and **Bukti Transfer** side-by-side.
- Zoom in / out, rotate, and direct download links.
- Verified timestamp and confirming officer's identity.

#### D. Pipeline Navigation & Table Updates (`Materials.tsx`)
1. **Pipeline Tabs (6 Stages)**:
   ```typescript
   [
     { id: 'PR', label: '1. Pengajuan PR', count: tabCounts.PR },
     { id: 'PO_SOURCING', label: '2. Komparasi PO', count: tabCounts.PO_SOURCING },
     { id: 'MUST_PURCHASE', label: '3. Siap Beli (PO)', count: tabCounts.MUST_PURCHASE },
     { id: 'ON_THE_WAY', label: '4. Dalam Pengiriman', count: tabCounts.ON_THE_WAY },
     { id: 'DELIVERED', label: '5. Diterima (GRN)', count: tabCounts.DELIVERED },
     { id: 'PAID', label: '6. Selesai (Lunas)', count: tabCounts.PAID },
     { id: 'ALL', label: 'Semua Riwayat', count: tabCounts.ALL },
   ]
   ```
2. **Action Buttons**:
   - For `DELIVERED` orders: Primary button `[Konfirmasi Pembayaran]` (with DollarSign/Receipt icon).
   - If Paylater scheme: Button label displays `[Lunasi Paylater]`.
   - For `PAID` orders:
     * Status Badge: Emerald `Lunas (Terbayar)`.
     * Button `[Bukti Bayar]` (Opens `PaymentEvidenceViewerModal`).
     * Button `[Voucher PDF]` (Downloads official payment voucher).
     * Button `[GRN]`, `[PO]`, `[PR]` PDFs.
3. **Table Accordion Detail**:
   - For `PAID` orders: Sub-row displays an inspection panel **"Data Pelunasan & Bukti Pembayaran"** containing amount, date, bank account, cashier name, and clickable thumbnail cards for Bon Pembayaran and Bank Transfer receipts.

---

### 2.6 Official PDF Exports (`mterp-web/src/utils/exportProcurementPdf.ts`)

#### A. Purchase Order (PO) PDF Updates
- In Syarat Pembayaran table:
  - If Paylater scheme: Prints `Paylater (Ambil Dulu Bayar Nanti — Bunga 0%)`.
  - Appends clause: *"Pelunasan dilakukan setelah fisik barang tiba di proyek dan terverifikasi oleh GRN. Tanpa dikenakan bunga atau denda tempo."*

#### B. New Generator: `exportPaymentVoucherPdf(order)`
Generates an official PT Mega Tama Enerco **Bukti Pengeluaran Kas & Pelunasan Supplier (Payment Voucher)**:
1. **Kop Surat Aplikasi**: Official header from `/Kop Surat Aplikasi.webp`.
2. **Header Banner**: Emerald banner *"BUKTI PENGELUARAN KAS / PAYMENT VOUCHER & BUKTI BAYAR"*.
3. **Metadata Box**:
   - No. Voucher / No. BKK, Tanggal Bayar, No. PO & PR terkait.
   - Nama Supplier / Toko Material, Proyek Tujuan.
   - Rekening Sumber & Rekening Tujuan.
4. **Financial Breakdown Table**:
   - Total Nilai Tagihan Pokok PO: `Rp ...`
   - Beban Bunga (0% Skema Paylater): `Rp 0`
   - Total Yang Telah Dibayarkan: `Rp ...`
   - Terbilang Rupiah: *"# ... Rupiah #"*
5. **Embedded Evidence Attachments**:
   - Embedded photo thumbnail of **Bon Pembayaran / Kuitansi Asli**.
   - Embedded photo thumbnail of **Bukti Transfer Bank / Slip ATM**.
6. **Digital QR Stamp & Signatures**:
   - Tanda tangan Direktur Keuangan / Kasir / Approver.

---

## 3. Phased Execution Roadmap

| Milestone | Deliverables | Target Files |
| :--- | :--- | :--- |
| **Phase 1: Backend Architecture** | • Update `Request.js` schema (`paymentConfirmation`, `PAID` status, Paylater scheme fields)<br>• Implement `PUT /api/requests/:id/confirm-payment` controller with Multer & transaction safety<br>• Update `populateProcurement` and WhatsApp templates | • `mterp-backend/src/models/Request.js`<br>• `mterp-backend/src/routes/requests.js`<br>• `mterp-backend/src/utils/whatsappTemplates.js` |
| **Phase 2: Types & API Client** | • Define `IPaymentConfirmation`, update `ISupplierComparison`, `ProcurementStatus`, and `PipelineTab`<br>• Implement `confirmMaterialPayment` API client function | • `mterp-web/src/types/index.ts`<br>• `mterp-web/src/api/scm.api.ts`<br>• `mterp-web/src/api/api.ts` |
| **Phase 3: Sourcing & PO UI** | • Add quick-preset chips & Paylater scheme toggle switch in `SupplierSourcingModal.tsx`<br>• Render Paylater 0% interest badges in PO summary cards | • `mterp-web/src/components/materials/SupplierSourcingModal.tsx` |
| **Phase 4: Modals & Evidence Viewer** | • Build `MaterialPaymentConfirmationModal.tsx` with Bon & Transfer uploads, Paylater recap, and canvas signature<br>• Build `PaymentEvidenceViewerModal.tsx` for high-res evidence inspection | • `mterp-web/src/components/materials/MaterialPaymentConfirmationModal.tsx`<br>• `mterp-web/src/components/materials/PaymentEvidenceViewerModal.tsx`<br>• `mterp-web/src/components/materials/index.ts` |
| **Phase 5: Page & Pipeline Integration** | • Add Tab 6 `Selesai (Lunas)` and re-index pipeline tabs in `Materials.tsx`<br>• Add `[Konfirmasi Pembayaran]` / `[Lunasi Paylater]` and `[Bukti Bayar]` triggers<br>• Add payment data panel in expanded table rows | • `mterp-web/src/pages/Materials.tsx` |
| **Phase 6: PDF Vouchers & Documents** | • Implement `exportPaymentVoucherPdf(order)` with Kop Surat, Terbilang, and embedded receipt thumbnails<br>• Update PO PDF with Paylater 0% interest legal clause | • `mterp-web/src/utils/exportProcurementPdf.ts` |
| **Phase 7: QA & Verification** | • Test full lifecycle: PR ➔ Sourcing (Paylater Option) ➔ PO ➔ Dispatch ➔ GRN ➔ Payment Confirmation ➔ PDF export<br>• Verify image uploads, transaction rollbacks, and backward compatibility | • End-to-end integration testing |

---

## 4. Verification & Validation Criteria

1. **Transaction Integrity**:
   - An order cannot be paid unless it has completed Stage 5 (`DELIVERED` with verified GRN).
   - `bonPembayaran` is strictly validated. A form submission without Bon Pembayaran will be rejected with an informative error.
2. **Paylater 0% Interest Compliance**:
   - In both database and exported PDFs, the interest rate and interest amount for the Paylater scheme remain strictly `0%` and `Rp 0`.
3. **Media Evidence Persistence**:
   - Both Bon Pembayaran and Bank Transfer receipts are saved in `/uploads/documents/` and accessible via authenticated URLs or image viewer modal.
4. **Backward Compatibility**:
   - Existing orders already in `DELIVERED` status remain functional and can either be settled via the new modal or viewed with GRN intact.
