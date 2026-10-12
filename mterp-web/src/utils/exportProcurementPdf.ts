import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { MaterialRequest, IProcurementItem, ISupplierComparison } from '../types';
import { formatDate } from './date';

/** Helper to load an image asset as base64 from a URL */
const loadImageAsBase64 = (src: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
};

/** Generate a QR code canvas composite with digital signature stamp */
const generateQrSignatureSeal = async (
  qrData: string,
  signatureAssetUrl: string,
  size = 500
): Promise<string> => {
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, qrData, {
    width: size,
    margin: 2,
    color: { dark: '#0F172A', light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  });

  try {
    const sigImg = new Image();
    sigImg.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      sigImg.onload = () => resolve();
      sigImg.onerror = () => reject();
      sigImg.src = signatureAssetUrl;
    });

    const ctx = qrCanvas.getContext('2d');
    if (ctx) {
      const overlaySize = size * 0.28;
      const cx = (size - overlaySize) / 2;
      const cy = (size - overlaySize) / 2;

      ctx.fillStyle = '#FFFFFF';
      const pad = 4;
      ctx.fillRect(cx - pad, cy - pad, overlaySize + pad * 2, overlaySize + pad * 2);
      ctx.drawImage(sigImg, cx, cy, overlaySize, overlaySize);
    }
  } catch {
    // If signature image fails to load, QR remains valid
  }

  return qrCanvas.toDataURL('image/png');
};

const formatRupiah = (val?: number) => {
  if (val === undefined || val === null || isNaN(val)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val);
};

const fmtDateStr = (dateVal?: string | Date) => {
  if (!dateVal) return '-';
  try {
    return formatDate(dateVal, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return String(dateVal);
  }
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. EXPORT PURCHASE REQUEST (PR) PDF
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function exportPurchaseRequestPdf(order: MaterialRequest) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 210mm
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = 8;

  // 1. Official Kop Surat Header from public/Kop Surat Aplikasi.webp
  try {
    const kopData = await loadImageAsBase64('/Kop Surat Aplikasi.webp');
    const kopH = contentW * 0.13;
    doc.addImage(kopData, 'PNG', margin, y, contentW, kopH);
    y += kopH + 3;
  } catch {
    // Fallback company text header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('PT MEGA TAMA ENERCO', margin, y + 6);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('General Contractor, Mechanical Electrical & Engineering Services', margin, y + 10);
    y += 14;
  }

  // 2. Title Banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(margin, y, contentW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('SURAT PERMINTAAN PEMBELIAN / PURCHASE REQUEST (PR)', margin + contentW / 2, y + 4.8, { align: 'center' });
  y += 11;

  // 3. Document Metadata Box
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.roundedRect(margin, y, contentW, 20, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);

  const col1 = margin + 4;
  const col2 = margin + 35;
  const col3 = margin + 100;
  const col4 = margin + 135;

  doc.setFont('helvetica', 'bold');
  doc.text('Nomor PR', col1, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${order.prNumber || '-'}`, col2, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Tanggal Dibutuhkan', col3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${fmtDateStr(order.dateNeeded)}`, col4, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Proyek', col1, y + 10);
  doc.setFont('helvetica', 'normal');
  const projName = typeof order.projectId === 'object' ? order.projectId?.nama : 'Umum / Workshop';
  doc.text(`: ${projName || 'General'}`, col2, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.text('Tingkat Urgensi', col3, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${order.urgency || 'Normal'}`, col4, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.text('Keperluan / WBS', col1, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${order.purpose || order.items?.[0]?.wbsCode || '-'}`, col2, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.text('Diajukan Oleh', col3, y + 15);
  doc.setFont('helvetica', 'normal');
  const reqName = typeof order.requestedBy === 'object' ? order.requestedBy?.fullName : 'Staff';
  doc.text(`: ${reqName || '-'}`, col4, y + 15);

  y += 24;

  // 4. Line Items Table (Name and Spec in Separate Columns)
  const items = order.items && order.items.length > 0 ? order.items : [{
    item: order.item,
    specifications: '',
    qty: Number(order.qty) || 1,
    unit: order.unit || 'Pcs',
    budgetUnitRate: order.costEstimate ? (Number(order.costEstimate) / (Number(order.qty) || 1)) : 0,
    totalBudget: Number(order.costEstimate) || 0,
  }];

  const tableRows = items.map((itm: IProcurementItem, index: number) => {
    return [
      String(index + 1),
      itm.item || '-',
      itm.specifications || '-', // Name & Spec in Different Columns!
      Number(itm.qty).toLocaleString('id-ID'),
      itm.unit || 'Pcs',
      formatRupiah(itm.budgetUnitRate),
      formatRupiah(itm.totalBudget || (itm.qty * itm.budgetUnitRate)),
    ];
  });

  const totalEst = items.reduce((acc, i) => acc + (Number(i.totalBudget) || (Number(i.qty) * Number(i.budgetUnitRate))), 0);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [[
      'No',
      'Nama Material / Barang',
      'Spesifikasi / Detail',
      'Qty',
      'Satuan',
      'Estimasi Tarif',
      'Total Anggaran',
    ]],
    body: tableRows,
    foot: [[
      '',
      '',
      '',
      '',
      '',
      'Total Estimasi Anggaran:',
      formatRupiah(totalEst),
    ]],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 50 },
      2: { cellWidth: 42 }, // Specification column
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'right',
    },
  });

  // 5. Digital Signature Blocks (Requester, Supervisor/QC, Ops Director)
  const finalY = (doc as any).lastAutoTable?.finalY || y + 50;
  y = finalY + 8;

  // Ensure signatures fit on current page or start new page
  if (y + 40 > doc.internal.pageSize.getHeight()) {
    doc.addPage();
    y = 20;
  }

  const sigW = contentW / 3;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  // ── Block 1: Pemohon (Requester) ──
  const x1 = margin;
  doc.text('Diajukan oleh / Requested by:', x1 + 2, y);
  doc.setFont('helvetica', 'bold');
  doc.text(reqName || 'Staf Lapangan', x1 + 2, y + 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Site Engineer / Mandor', x1 + 2, y + 29);
  doc.text(`Tgl: ${fmtDateStr(order.createdAt)}`, x1 + 2, y + 33);

  // ── Block 2: Supervisor / QC / QA Review ──
  const x2 = margin + sigW;
  doc.setFontSize(8);
  doc.text('Ditinjau oleh / Reviewed by:', x2 + 2, y);
  const reviewerName = order.reviewedBy?.user?.fullName || order.reviewedBy?.user || 'Supervisor / QC';
  if (order.reviewedBy?.reviewedAt || ['PR_REVIEWED', 'PR_APPROVED', 'PO_PENDING_FINANCE', 'MUST_PURCHASE', 'ON_THE_WAY', 'DELIVERED'].includes(order.status)) {
    try {
      const qrData = `MTERP|PR-QC|${order.prNumber || order._id}|${reviewerName}|${order.reviewedBy?.reviewedAt || new Date().toISOString()}`;
      const sealImg = await generateQrSignatureSeal(qrData, '/Digital Signature SPV.webp');
      doc.addImage(sealImg, 'PNG', x2 + 2, y + 3, 18, 18);
    } catch {
      doc.line(x2 + 2, y + 20, x2 + sigW - 5, y + 20);
    }
  } else {
    doc.line(x2 + 2, y + 20, x2 + sigW - 5, y + 20);
  }
  doc.setFont('helvetica', 'bold');
  doc.text(reviewerName, x2 + 2, y + 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Supervisor / QC / QA', x2 + 2, y + 29);
  doc.text(`Tgl: ${fmtDateStr(order.reviewedBy?.reviewedAt || order.createdAt)}`, x2 + 2, y + 33);

  // ── Block 3: Operations Director Approval ──
  const x3 = margin + sigW * 2;
  doc.setFontSize(8);
  doc.text('Disetujui oleh / Approved by:', x3 + 2, y);
  const opsName = order.opsApprovedBy?.user?.fullName || order.opsApprovedBy?.user || 'Direktur Operasional';
  if (order.opsApprovedBy?.approvedAt || ['PR_APPROVED', 'PO_PENDING_FINANCE', 'MUST_PURCHASE', 'ON_THE_WAY', 'DELIVERED'].includes(order.status)) {
    try {
      const qrData = `MTERP|PR-OPS|${order.prNumber || order._id}|${opsName}|${order.opsApprovedBy?.approvedAt || new Date().toISOString()}`;
      const sealImg = await generateQrSignatureSeal(qrData, '/Digital Signature.webp');
      doc.addImage(sealImg, 'PNG', x3 + 2, y + 3, 18, 18);
    } catch {
      doc.line(x3 + 2, y + 20, x3 + sigW - 5, y + 20);
    }
  } else {
    doc.line(x3 + 2, y + 20, x3 + sigW - 5, y + 20);
  }
  doc.setFont('helvetica', 'bold');
  doc.text(opsName, x3 + 2, y + 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Direktur Operasional', x3 + 2, y + 29);
  doc.text(`Tgl: ${fmtDateStr(order.opsApprovedBy?.approvedAt || order.createdAt)}`, x3 + 2, y + 33);

  // Footer seal
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Dokumen resmi MTERP Enterprise System — Dicetak pada ${new Date().toLocaleString('id-ID')}`, margin, doc.internal.pageSize.getHeight() - 6);

  doc.save(`${order.prNumber || 'PR'}_Dokumen.pdf`);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. EXPORT OFFICIAL PURCHASE ORDER (PO) PDF
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function exportPurchaseOrderPdf(order: MaterialRequest) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = 8;

  // 1. Official Kop Surat from public/Kop Surat Aplikasi.webp
  try {
    const kopData = await loadImageAsBase64('/Kop Surat Aplikasi.webp');
    const kopH = contentW * 0.13;
    doc.addImage(kopData, 'PNG', margin, y, contentW, kopH);
    y += kopH + 3;
  } catch {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('PT MEGA TAMA ENERCO', margin, y + 6);
    y += 14;
  }

  // 2. Title Banner
  doc.setFillColor(30, 41, 59); // Slate 800
  doc.rect(margin, y, contentW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('SURAT PESANAN PEMBELIAN / PURCHASE ORDER (PO)', margin + contentW / 2, y + 4.8, { align: 'center' });
  y += 11;

  // 3. Document & Vendor Metadata Double Box
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentW, 26, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);

  const col1 = margin + 4;
  const col2 = margin + 35;
  const col3 = margin + 98;
  const col4 = margin + 130;

  // Left col: Order info
  doc.setFont('helvetica', 'bold');
  doc.text('Nomor PO', col1, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${order.poNumber || 'DRAFT-PO'}`, col2, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Ref. Nomor PR', col1, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${order.prNumber || '-'}`, col2, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.text('Proyek Tujuan', col1, y + 15);
  doc.setFont('helvetica', 'normal');
  const projName = typeof order.projectId === 'object' ? order.projectId?.nama : 'Proyek';
  doc.text(`: ${projName || 'General'}`, col2, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.text('Tanggal Terbit', col1, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${fmtDateStr(order.financeApprovedBy?.approvedAt || order.updatedAt)}`, col2, y + 20);

  // Right col: Vendor info
  const vendor = order.selectedSupplier || order.comparisons?.find((c) => c.isRecommended);
  doc.setFont('helvetica', 'bold');
  doc.text('Pemasok / Vendor', col3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${vendor?.supplierName || 'Pemasok Terpilih'}`, col4, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Alamat Vendor', col3, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${vendor?.location || '-'}`, col4, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.text('Kontak / Telp', col3, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${vendor?.contact || '-'}`, col4, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.text('Termin Pembayaran', col3, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${vendor?.paymentTerms || 'Tempo 14 Hari'}`, col4, y + 20);

  y += 30;

  // 4. Multi-Item Table (Name and Spec in Separate Columns!)
  const fallbackSinglePrice = order.poTotalAmount
    ? Number(order.poTotalAmount) / (Number(order.qty) || 1)
    : (order.costEstimate ? Number(order.costEstimate) / (Number(order.qty) || 1) : 0);

  const items: IProcurementItem[] = order.items && order.items.length > 0 ? order.items : [{
    item: order.item,
    specifications: '',
    qty: Number(order.qty) || 1,
    unit: order.unit || 'Pcs',
    budgetUnitRate: fallbackSinglePrice,
    totalBudget: Number(order.costEstimate) || 0,
    poUnitPrice: fallbackSinglePrice,
    poTotalAmount: order.poTotalAmount || order.costEstimate || 0,
  }];

  const tableRows = items.map((itm: IProcurementItem, idx: number) => {
    const rate = itm.poUnitPrice || itm.budgetUnitRate || 0;
    const tot = itm.poTotalAmount || (itm.qty * rate);
    return [
      String(idx + 1),
      itm.item || '-',
      itm.specifications || '-', // Separate Spec column
      Number(itm.qty).toLocaleString('id-ID'),
      itm.unit || 'Pcs',
      formatRupiah(rate),
      formatRupiah(tot),
    ];
  });

  const subtotal = items.reduce((acc, i) => acc + (i.poTotalAmount || (i.qty * (i.poUnitPrice || i.budgetUnitRate || 0))), 0);
  const shipping = order.poShippingCost || vendor?.shippingCost || 0;
  const grandTotal = subtotal + shipping;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [[
      'No',
      'Uraian Material / Barang',
      'Spesifikasi / Standar',
      'Qty',
      'Satuan',
      'Harga Satuan (PO)',
      'Total Biaya',
    ]],
    body: tableRows,
    foot: [
      ['', '', '', '', '', 'Subtotal Barang:', formatRupiah(subtotal)],
      ['', '', '', '', '', 'Biaya Kirim / Ongkir:', formatRupiah(shipping)],
      ['', '', '', '', '', 'TOTAL TAGIHAN PO:', formatRupiah(grandTotal)],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 50 },
      2: { cellWidth: 42 }, // Specification column!
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'right',
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 50;
  y = finalY + 8;

  if (y + 40 > doc.internal.pageSize.getHeight()) {
    doc.addPage();
    y = 20;
  }

  // 5. Signatures (Procurement Staff, Ops Director, Finance Director)
  const sigW = contentW / 3;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  // ── Block 1: Diterbitkan oleh Procurement ──
  const x1 = margin;
  doc.text('Diterbitkan oleh / Issued by:', x1 + 2, y);
  doc.setFont('helvetica', 'bold');
  doc.text('Divisi Pengadaan & Logistik', x1 + 2, y + 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Procurement Specialist', x1 + 2, y + 29);
  doc.text(`Tgl: ${fmtDateStr(order.updatedAt)}`, x1 + 2, y + 33);

  // ── Block 2: Ops Director Sign-off ──
  const x2 = margin + sigW;
  doc.setFontSize(8);
  doc.text('Ditinjau oleh / Operational:', x2 + 2, y);
  const opsName = order.opsApprovedBy?.user?.fullName || order.opsApprovedBy?.user || 'Direktur Operasional';
  try {
    const qrData = `MTERP|PO-OPS|${order.poNumber || order._id}|${opsName}|VERIFIED`;
    const sealImg = await generateQrSignatureSeal(qrData, '/Digital Signature.webp');
    doc.addImage(sealImg, 'PNG', x2 + 2, y + 3, 18, 18);
  } catch {
    doc.line(x2 + 2, y + 20, x2 + sigW - 5, y + 20);
  }
  doc.setFont('helvetica', 'bold');
  doc.text(opsName, x2 + 2, y + 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Direktur Operasional', x2 + 2, y + 29);
  doc.text(`Tgl: ${fmtDateStr(order.opsApprovedBy?.approvedAt || order.updatedAt)}`, x2 + 2, y + 33);

  // ── Block 3: Finance Director & Budget Control Approval ──
  const x3 = margin + sigW * 2;
  doc.setFontSize(8);
  doc.text('Disetujui oleh / Finance & Budget:', x3 + 2, y);
  const finName = order.financeApprovedBy?.user?.fullName || order.financeApprovedBy?.user || 'Direktur Keuangan';
  try {
    const qrData = `MTERP|PO-FIN|${order.poNumber || order._id}|${finName}|BUDGET_APPROVED`;
    const sealImg = await generateQrSignatureSeal(qrData, '/owner signature.webp');
    doc.addImage(sealImg, 'PNG', x3 + 2, y + 3, 18, 18);
  } catch {
    doc.line(x3 + 2, y + 20, x3 + sigW - 5, y + 20);
  }
  doc.setFont('helvetica', 'bold');
  doc.text(finName, x3 + 2, y + 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Direktur Keuangan & Budget', x3 + 2, y + 29);
  doc.text(`Tgl: ${fmtDateStr(order.financeApprovedBy?.approvedAt || order.updatedAt)}`, x3 + 2, y + 33);

  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Dokumen resmi Purchase Order PT Mega Tama Enerco — Cetak: ${new Date().toLocaleString('id-ID')}`, margin, doc.internal.pageSize.getHeight() - 6);

  doc.save(`${order.poNumber || 'PO'}_Official.pdf`);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 3. EXPORT GOODS RECEIPT NOTE (GRN) WITH SITE ARRIVAL PHOTO
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function exportGoodsReceiptPdf(order: MaterialRequest) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = 8;

  // 1. Kop Surat
  try {
    const kopData = await loadImageAsBase64('/Kop Surat Aplikasi.webp');
    const kopH = contentW * 0.13;
    doc.addImage(kopData, 'PNG', margin, y, contentW, kopH);
    y += kopH + 3;
  } catch {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('PT MEGA TAMA ENERCO', margin, y + 6);
    y += 14;
  }

  // 2. Title
  doc.setFillColor(16, 185, 129); // Emerald 500
  doc.rect(margin, y, contentW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('BUKTI PENERIMAAN BARANG DI PROYEK / GOODS RECEIPT NOTE (GRN)', margin + contentW / 2, y + 4.8, { align: 'center' });
  y += 11;

  // 3. Receipt Info Box
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentW, 20, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);

  const col1 = margin + 4;
  const col2 = margin + 35;
  const col3 = margin + 98;
  const col4 = margin + 130;

  doc.setFont('helvetica', 'bold');
  doc.text('Nomor PO', col1, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${order.poNumber || '-'}`, col2, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Tgl. Diterima', col3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${fmtDateStr(order.deliveryProof?.receivedAt || order.updatedAt)}`, col4, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Pengantar / Supir', col1, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${order.dispatchInfo?.driverName || '-'} (${order.dispatchInfo?.vehiclePlate || '-'})`, col2, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.text('Kondisi Fisik', col3, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${order.deliveryProof?.overallCondition || 'Baik / Sesuai PO'}`, col4, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.text('Penerima Proyek', col1, y + 15);
  doc.setFont('helvetica', 'normal');
  const recName = order.deliveryProof?.receivedBy?.fullName || order.deliveryProof?.receivedBy || 'Staff Lapangan';
  doc.text(`: ${recName}`, col2, y + 15);

  y += 24;

  // 4. Received Items Table (Name and Spec in Separate Columns!)
  const items: IProcurementItem[] = order.items && order.items.length > 0 ? order.items : [{
    item: order.item,
    specifications: '',
    qty: Number(order.qty) || 1,
    unit: order.unit || 'Pcs',
    budgetUnitRate: order.costEstimate ? Number(order.costEstimate) / (Number(order.qty) || 1) : 0,
    totalBudget: Number(order.costEstimate) || 0,
    receivedQty: Number(order.qty) || 1,
    receivedCondition: 'Good',
  }];

  const tableRows = items.map((itm: IProcurementItem, idx: number) => {
    return [
      String(idx + 1),
      itm.item || '-',
      itm.specifications || '-',
      Number(itm.qty).toLocaleString('id-ID'),
      Number(itm.receivedQty || itm.qty).toLocaleString('id-ID'),
      itm.unit || 'Pcs',
      itm.receivedCondition === 'Good' ? 'Lengkap & Baik' : 'Ada Selisih / Kerusakan',
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [[
      'No',
      'Nama Material / Barang',
      'Spesifikasi / Spec',
      'Qty Dipesan',
      'Qty Diterima',
      'Satuan',
      'Kondisi Fisik',
    ]],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [5, 150, 105], // Emerald 600
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 50 },
      2: { cellWidth: 42 },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 16, halign: 'center' },
      6: { cellWidth: 24, halign: 'center' },
    },
  });

  let curY = (doc as any).lastAutoTable?.finalY || y + 40;
  curY += 6;

  // 5. Embedded Site Photo Proof
  if (order.deliveryProof?.sitePhoto) {
    if (curY + 50 > doc.internal.pageSize.getHeight()) {
      doc.addPage();
      curY = 15;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Foto Bukti Fisik Material di Lokasi Proyek (Job Site Evidence):', margin, curY);
    curY += 3;

    try {
      const photoData = await loadImageAsBase64(order.deliveryProof.sitePhoto);
      doc.addImage(photoData, 'JPEG', margin, curY, 65, 45);
      curY += 48;
    } catch {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`[Foto terlampir di sistem: ${order.deliveryProof.sitePhoto}]`, margin, curY + 5);
      curY += 10;
    }
  }

  // 6. Signatures (Driver vs Site Receiver)
  if (curY + 30 > doc.internal.pageSize.getHeight()) {
    doc.addPage();
    curY = 15;
  }

  const sigW = contentW / 2;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  doc.text('Diserahkan oleh (Driver / Supplier):', margin + 2, curY);
  doc.text('Diterima & Diverifikasi oleh (Gudang / Site):', margin + sigW + 2, curY);

  doc.line(margin + 2, curY + 20, margin + sigW - 10, curY + 20);
  doc.line(margin + sigW + 2, curY + 20, margin + contentW - 2, curY + 20);

  doc.setFont('helvetica', 'bold');
  doc.text(order.dispatchInfo?.driverName || 'Supir Pengantar', margin + 2, curY + 24);
  doc.text(recName, margin + sigW + 2, curY + 24);

  doc.save(`${order.poNumber || 'GRN'}_TandaTerima.pdf`);
}
