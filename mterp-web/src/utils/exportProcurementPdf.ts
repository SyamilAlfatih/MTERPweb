import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MaterialRequest, IProcurementItem, ISupplierComparison } from '../types';
import { formatDate } from './date';
import { resolveImageUrl } from './image';
import { formatRupiah } from './currency';
import { loadImageAsBase64, generateQrSignatureSeal } from './documentSeal';

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

  // 3. Document Metadata Box (Auto-expanding cells to prevent text overlap)
  const projName = typeof order.projectId === 'object' ? order.projectId?.nama : 'Umum / Workshop';
  const reqName = typeof order.requestedBy === 'object' ? order.requestedBy?.fullName : 'Staff';

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      textColor: [15, 23, 42],
      fillColor: [248, 250, 252],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 },
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32, fillColor: [241, 245, 249] },
      1: { cellWidth: 58 },
      2: { fontStyle: 'bold', cellWidth: 36, fillColor: [241, 245, 249] },
      3: { cellWidth: 'auto' },
    },
    body: [
      [
        { content: 'Nomor PR' },
        { content: `: ${order.prNumber || '-'}`, styles: { fontStyle: 'bold' } },
        { content: 'Tanggal Dibutuhkan' },
        { content: `: ${fmtDateStr(order.dateNeeded)}`, styles: { fontStyle: 'bold' } },
      ],
      [
        { content: 'Nama Proyek' },
        {
          content: `: ${projName || 'General'}`,
          colSpan: 3,
          styles: { fontStyle: 'bold', textColor: [15, 23, 42] },
        },
      ],
      [
        { content: 'Tingkat Urgensi' },
        { content: `: ${order.urgency || 'Normal'}` },
        { content: 'Diajukan Oleh' },
        { content: `: ${reqName || '-'}` },
      ],
      [
        { content: 'Keperluan / WBS' },
        {
          content: `: ${order.purpose || order.items?.[0]?.wbsCode || '-'}`,
          colSpan: 3,
        },
      ],
    ],
  });

  y = ((doc as any).lastAutoTable?.finalY || (y + 24)) + 5;

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

  // 3. Document & Vendor Metadata Box (Auto-expanding cells to prevent text overlap)
  const projName = typeof order.projectId === 'object' ? order.projectId?.nama : 'Proyek';
  const vendor = order.selectedSupplier || order.comparisons?.find((c) => c.isRecommended);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      textColor: [15, 23, 42],
      fillColor: [248, 250, 252],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 },
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32, fillColor: [241, 245, 249] },
      1: { cellWidth: 58 },
      2: { fontStyle: 'bold', cellWidth: 36, fillColor: [241, 245, 249] },
      3: { cellWidth: 'auto' },
    },
    body: [
      [
        { content: 'Nomor PO' },
        { content: `: ${order.poNumber || 'DRAFT-PO'}`, styles: { fontStyle: 'bold' } },
        { content: 'Pemasok / Vendor' },
        { content: `: ${vendor?.supplierName || 'Pemasok Terpilih'}`, styles: { fontStyle: 'bold' } },
      ],
      [
        { content: 'Tanggal Terbit' },
        { content: `: ${fmtDateStr(order.financeApprovedBy?.approvedAt || order.updatedAt)}`, styles: { fontStyle: 'bold' } },
        { content: 'Kontak / Telp' },
        { content: `: ${vendor?.contact || '-'}` },
      ],
      [
        { content: 'Ref. Nomor PR' },
        { content: `: ${order.prNumber || '-'}` },
        { content: 'Termin Bayar' },
        { content: `: ${vendor?.paymentTerms || 'Tempo 14 Hari'}` },
      ],
      [
        { content: 'Proyek Tujuan' },
        {
          content: `: ${projName || 'General'}`,
          colSpan: 3,
          styles: { fontStyle: 'bold', textColor: [15, 23, 42] },
        },
      ],
      [
        { content: 'Alamat Vendor' },
        {
          content: `: ${vendor?.location || '-'}`,
          colSpan: 3,
        },
      ],
    ],
  });

  y = ((doc as any).lastAutoTable?.finalY || (y + 30)) + 5;

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

  // 3. Receipt Info Box (Auto-expanding cells)
  const projName = typeof order.projectId === 'object' ? order.projectId?.nama : 'Proyek';
  const recName = order.deliveryProof?.receivedBy?.fullName || order.deliveryProof?.receivedBy || 'Staff Lapangan';

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      textColor: [15, 23, 42],
      fillColor: [248, 250, 252],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 },
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32, fillColor: [241, 245, 249] },
      1: { cellWidth: 58 },
      2: { fontStyle: 'bold', cellWidth: 36, fillColor: [241, 245, 249] },
      3: { cellWidth: 'auto' },
    },
    body: [
      [
        { content: 'Nomor PO' },
        { content: `: ${order.poNumber || '-'}`, styles: { fontStyle: 'bold' } },
        { content: 'Tgl. Diterima' },
        { content: `: ${fmtDateStr(order.deliveryProof?.receivedAt || order.updatedAt)}`, styles: { fontStyle: 'bold' } },
      ],
      [
        { content: 'Nama Proyek' },
        {
          content: `: ${projName || 'General'}`,
          colSpan: 3,
          styles: { fontStyle: 'bold', textColor: [15, 23, 42] },
        },
      ],
      [
        { content: 'Pengantar / Supir' },
        { content: `: ${order.dispatchInfo?.driverName || '-'} (${order.dispatchInfo?.vehiclePlate || '-'})` },
        { content: 'Kondisi Fisik' },
        { content: `: ${order.deliveryProof?.overallCondition || 'Baik / Sesuai PO'}` },
      ],
      [
        { content: 'Penerima Proyek' },
        { content: `: ${recName}` },
        { content: 'Catatan' },
        { content: `: ${order.deliveryProof?.notes || '-'}` },
      ],
    ],
  });

  y = ((doc as any).lastAutoTable?.finalY || (y + 24)) + 5;

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

  // 5. Embedded Site Photo Proof (Matching Daily Project implementation)
  const photosToLoad: { title: string; subtitle: string; url: string }[] = [];

  if (order.deliveryProof?.sitePhoto) {
    photosToLoad.push({
      title: 'Foto Bukti Fisik Material di Proyek (Site Evidence)',
      subtitle: `Diterima: ${fmtDateStr(order.deliveryProof?.receivedAt || order.updatedAt)} • Kondisi: ${order.deliveryProof?.overallCondition || 'Baik'}`,
      url: order.deliveryProof.sitePhoto,
    });
  }

  if (order.dispatchInfo?.suratJalanPhoto) {
    photosToLoad.push({
      title: 'Surat Jalan / Delivery Note Pengiriman',
      subtitle: `Supir: ${order.dispatchInfo?.driverName || '-'} (${order.dispatchInfo?.vehiclePlate || '-'})`,
      url: order.dispatchInfo.suratJalanPhoto,
    });
  }

  if (order.dispatchInfo?.supplierNotaPhoto) {
    photosToLoad.push({
      title: 'Nota / Bon Pembelian Supplier',
      subtitle: 'Bukti pembayaran / transaksi vendor resmi',
      url: order.dispatchInfo.supplierNotaPhoto,
    });
  }

  const pageH = doc.internal.pageSize.getHeight();
  const bottomMargin = 18;
  const sigH = 34;

  if (photosToLoad.length > 0) {
    const photoH = 55;
    const isMulti = photosToLoad.length > 1;
    const photoW = (contentW - 6) / 2;

    if (curY + photoH + 25 + sigH > pageH - bottomMargin) {
      doc.addPage();
      curY = 15;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Foto Bukti Fisik Material di Lokasi Proyek (Job Site Evidence):', margin, curY);
    curY += 4;

    for (let i = 0; i < photosToLoad.length; i++) {
      const col = isMulti ? i % 2 : 0;
      const px = margin + (isMulti ? col * (photoW + 6) : 0);

      try {
        const imgData = await loadImageAsBase64(photosToLoad[i].url);

        // Photo border & image (Direct WEBP drawing matching Daily Report)
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.rect(px, curY, photoW, photoH, 'S');
        doc.addImage(imgData, 'WEBP', px + 0.5, curY + 0.5, photoW - 1, photoH - 1);

        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(5, 150, 105); // Emerald 600
        doc.text(photosToLoad[i].title, px + 2, curY + photoH + 4);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(photosToLoad[i].subtitle, px + 2, curY + photoH + 8);
      } catch (err) {
        console.warn('Failed to load image for GRN:', photosToLoad[i].url, err);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.rect(px, curY, photoW, photoH, 'S');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('[Foto terlampir di sistem]', px + photoW / 2, curY + photoH / 2, { align: 'center' });
      }

      if (!isMulti || col === 1 || i === photosToLoad.length - 1) {
        curY += photoH + 12;
      }
    }
  }

  // 6. Signatures (Driver vs Site Receiver)
  if (curY + sigH > pageH - bottomMargin) {
    doc.addPage();
    curY = 20;
  }

  const sigW = contentW / 2;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  doc.text('Diserahkan oleh (Driver / Supplier):', margin + 2, curY);
  doc.text('Diterima & Diverifikasi oleh (Gudang / Site):', margin + sigW + 2, curY);

  // Handwritten Digital Signatures (Driver & Receiver)
  const getSignatureDataUrl = async (sig?: string): Promise<string | null> => {
    if (!sig) return null;
    if (sig.startsWith('data:image/')) return sig;
    try {
      return await loadImageAsBase64(sig);
    } catch {
      return null;
    }
  };

  const driverSigData = await getSignatureDataUrl(order.deliveryProof?.driverSignature);
  const receiverSigData = await getSignatureDataUrl(order.deliveryProof?.receiverSignature);

  if (driverSigData) {
    try {
      doc.addImage(driverSigData, 'PNG', margin + 4, curY + 2, 42, 17);
    } catch (e) {
      console.warn('Failed to embed driver signature in GRN PDF:', e);
    }
  }

  if (receiverSigData) {
    try {
      doc.addImage(receiverSigData, 'PNG', margin + sigW + 4, curY + 2, 42, 17);
    } catch (e) {
      console.warn('Failed to embed receiver signature in GRN PDF:', e);
    }
  }

  doc.line(margin + 2, curY + 20, margin + sigW - 10, curY + 20);
  doc.line(margin + sigW + 2, curY + 20, margin + contentW - 2, curY + 20);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(order.dispatchInfo?.driverName || 'Supir Pengantar', margin + 2, curY + 24);
  doc.text(recName, margin + sigW + 2, curY + 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Ekspedisi / Logistik Supplier', margin + 2, curY + 27.5);
  doc.text('Gudang & Logistik Proyek', margin + sigW + 2, curY + 27.5);

  // 7. Official Running Footer on each page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Dokumen Resmi Goods Receipt Note (GRN) • PT Mega Tama Enerco`,
      margin,
      pageH - 7
    );
    doc.text(
      `Halaman ${i} dari ${totalPages}`,
      pageW - margin,
      pageH - 7,
      { align: 'right' }
    );
  }

  const filename = `${order.poNumber || order.prNumber || 'GRN'}_TandaTerima_GRN.pdf`;
  doc.save(filename);
}
