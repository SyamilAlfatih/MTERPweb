import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { formatDate } from './date';

export interface SpklPdfData {
  spklNumber: string;
  workerName: string;
  workerNik?: string;
  department?: string;
  location: string;
  overtimeDate: string;
  schedulePlan: {
    startTime: string;
    endTime: string;
    breakMinutes: number;
    effectiveHours: number;
  };
  scheduleActual: {
    startTime: string;
    endTime: string;
    breakMinutes: number;
    effectiveHours: number;
  };
  workItems: Array<{
    itemNo: number;
    taskDescription: string;
    volumePlanned: string;
    volumeActual: string;
    isFinished: boolean;
    progressPercent: number;
  }>;
  signatures: {
    worker?: { signed: boolean; signedAt?: string; signerName?: string };
    supervisor?: { signed: boolean; signedAt?: string; signerName?: string; note?: string };
    projectManager?: { signed: boolean; signedAt?: string; signerName?: string; note?: string };
    financeDirector?: { signed: boolean; signedAt?: string; signerName?: string; note?: string };
  };
}

const fmtDate = (iso: string) => {
  if (!iso) return '-';
  try {
    return formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
};

const fmtShortDate = (iso?: string) => {
  if (!iso) return '___/___/______';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '___/___/______';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '___/___/______';
  }
};

/**
 * Generates an official SPKL document matching SPKL.pdf 1:1 using jsPDF direct vector drawing.
 */
export async function exportSpklToPdf(data: SpklPdfData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pw = doc.internal.pageSize.getWidth(); // 210mm
  const mx = 14; // margin left/right
  const cw = pw - mx * 2; // 182mm content width
  let y = 12;

  // Primary Theme Colors (matching SPKL.pdf)
  const NAVY_HEADER = [30, 80, 160] as const; // #1E50A0 header bar color
  const TABLE_HEADER_BG = [200, 220, 245] as const; // light blue table header
  const BORDER_COLOR = [60, 60, 60] as const;
  const TEXT_DARK = [30, 30, 30] as const;
  const RED_TITLE = [190, 40, 40] as const;

  // ── 1. HEADER & LETTERHEAD ───────────────────────────────────────────────
  // Mega Tama Enerco Logo / Branding
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text('MEGA TAMA', mx + 18, y + 4);
  doc.text('ENERCO', mx + 18, y + 9);

  // Logo geometric icon
  doc.setFillColor(30, 41, 59);
  doc.triangle(mx, y + 1, mx + 7, y + 5, mx, y + 9, 'F');
  doc.setFillColor(234, 88, 12);
  doc.triangle(mx + 8, y + 1, mx + 15, y + 5, mx + 8, y + 9, 'F');

  // Contact Info
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text('Jl. Raya Alun-Alun Pangalengan No. 221, Jawa Barat 40378', mx + 62, y + 3);
  doc.text('www.mte.megatama-enerco.com | mte.business08@gmail.com', mx + 62, y + 6.5);
  doc.text('022 6321 4006 | +62 817 206 191', mx + 62, y + 10);

  // ISO Certification badges text block (top-right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(16, 149, 193);
  doc.text('ISO', pw - mx - 45, y + 3);
  doc.text('ISO', pw - mx - 30, y + 3);
  doc.text('ISO', pw - mx - 15, y + 3);

  doc.setFontSize(5);
  doc.setTextColor(100, 100, 100);
  doc.text('9001:2015', pw - mx - 47, y + 6.5);
  doc.text('14001:2015', pw - mx - 32, y + 6.5);
  doc.text('45001:2018', pw - mx - 17, y + 6.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(22, 163, 74);
  doc.text('SMK3', pw - mx - 3, y + 5, { align: 'right' });

  y += 14;

  // Integrated Engineering Solution Divider Bar
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.line(mx, y, mx + 40, y);
  doc.line(pw - mx - 40, y, pw - mx, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(70, 70, 70);
  doc.text('INTEGRATED ENGINEERING SOLUTION', pw / 2, y + 1, { align: 'center' });
  y += 6;

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text('SURAT PERINTAH & BUKTI KERJA LEMBUR (SPKL)', pw / 2, y, { align: 'center' });
  y += 4;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...RED_TITLE);
  doc.text('Dokumen Resmi Bukti Penugasan, Pelaksanaan dan Pengajuan Kompensasi Lembur Karyawan', pw / 2, y, { align: 'center' });
  y += 3.5;

  // SPKL Document Number Tag
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(`No. Dokumen: ${data.spklNumber}`, pw / 2, y, { align: 'center' });
  y += 4;

  // ── SECTION HELPER ────────────────────────────────────────────────────────
  const drawSectionHeader = (title: string) => {
    doc.setFillColor(...NAVY_HEADER);
    doc.rect(mx, y, cw, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(title, mx + 2, y + 3.6);
    y += 5;
  };

  // ── SECTION I: IDENTITAS KARYAWAN / PELAKSANA LEMBUR ─────────────────────
  drawSectionHeader('I. IDENTITAS KARYAWAN / PELAKSANA LEMBUR');

  const sec1Height = 22;
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.rect(mx, y, cw, sec1Height);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_DARK);

  const rowH = 5.2;
  const colLabelX = mx + 3;
  const colValX = mx + 35;

  let rY = y + 4.2;
  doc.text('Nama Lengkap', colLabelX, rY);
  doc.text(`: ${data.workerName || '-'}`, colValX, rY);

  rY += rowH;
  doc.text('NIK', colLabelX, rY);
  doc.text(`: ${data.workerNik || '-'}`, colValX, rY);

  rY += rowH;
  doc.text('Departemen', colLabelX, rY);
  doc.text(`: ${data.department || 'Operasional Lapangan'}`, colValX, rY);

  rY += rowH;
  doc.text('Lokasi', colLabelX, rY);
  doc.text(`: ${data.location || '-'}`, colValX, rY);

  y += sec1Height + 3;

  // ── SECTION II: JADWAL & REALISASI WAKTU LEMBUR ──────────────────────────
  drawSectionHeader('II. JADWAL & REALISASI WAKTU LEMBUR');

  // Hari / Tanggal Row
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_DARK);
  doc.text('Hari/Tanggal Lembur', colLabelX, y + 4);
  doc.text(`: ${fmtDate(data.overtimeDate)}`, colValX, y + 4);
  y += 5.5;

  // Sub-Table: Jadwal Waktu
  const colW_Tahapan = 42;
  const colW_Mulai = 35;
  const colW_Selesai = 35;
  const colW_Istirahat = 35;
  const colW_Durasi = cw - (colW_Tahapan + colW_Mulai + colW_Selesai + colW_Istirahat); // 35mm

  const tableHeaderH = 5.5;
  const tableRowH = 5;

  // Draw Header
  doc.setFillColor(...TABLE_HEADER_BG);
  doc.rect(mx, y, cw, tableHeaderH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_DARK);

  let curX = mx;
  doc.text('Tahapan Waktu', curX + colW_Tahapan / 2, y + 3.8, { align: 'center' });
  curX += colW_Tahapan;
  doc.line(curX, y, curX, y + tableHeaderH + tableRowH * 2);

  doc.text('Jam Mulai', curX + colW_Mulai / 2, y + 3.8, { align: 'center' });
  curX += colW_Mulai;
  doc.line(curX, y, curX, y + tableHeaderH + tableRowH * 2);

  doc.text('Jam Selesai', curX + colW_Selesai / 2, y + 3.8, { align: 'center' });
  curX += colW_Selesai;
  doc.line(curX, y, curX, y + tableHeaderH + tableRowH * 2);

  doc.text('Istirahat', curX + colW_Istirahat / 2, y + 3.8, { align: 'center' });
  curX += colW_Istirahat;
  doc.line(curX, y, curX, y + tableHeaderH + tableRowH * 2);

  doc.text('Total Durasi Efektif', curX + colW_Durasi / 2, y + 3.8, { align: 'center' });

  y += tableHeaderH;

  // Row 1: Rencana (Instruksi)
  doc.setFont('helvetica', 'normal');
  doc.rect(mx, y, cw, tableRowH);
  curX = mx;
  doc.text('Rencana (Instruksi)', curX + 2, y + 3.5);
  curX += colW_Tahapan;
  doc.text(data.schedulePlan?.startTime || '-', curX + colW_Mulai / 2, y + 3.5, { align: 'center' });
  curX += colW_Mulai;
  doc.text(data.schedulePlan?.endTime || '-', curX + colW_Selesai / 2, y + 3.5, { align: 'center' });
  curX += colW_Selesai;
  doc.text(`${data.schedulePlan?.breakMinutes || 0} Menit`, curX + colW_Istirahat / 2, y + 3.5, { align: 'center' });
  curX += colW_Istirahat;
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.schedulePlan?.effectiveHours || 0} Jam`, curX + colW_Durasi / 2, y + 3.5, { align: 'center' });

  y += tableRowH;

  // Row 2: Aktual Realisasi
  doc.setFont('helvetica', 'normal');
  doc.rect(mx, y, cw, tableRowH);
  curX = mx;
  doc.text('Aktual Realisasi', curX + 2, y + 3.5);
  curX += colW_Tahapan;
  doc.text(data.scheduleActual?.startTime || '-', curX + colW_Mulai / 2, y + 3.5, { align: 'center' });
  curX += colW_Mulai;
  doc.text(data.scheduleActual?.endTime || '-', curX + colW_Selesai / 2, y + 3.5, { align: 'center' });
  curX += colW_Selesai;
  doc.text(`${data.scheduleActual?.breakMinutes || 0} Menit`, curX + colW_Istirahat / 2, y + 3.5, { align: 'center' });
  curX += colW_Istirahat;
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.scheduleActual?.effectiveHours || 0} Jam`, curX + colW_Durasi / 2, y + 3.5, { align: 'center' });

  y += tableRowH + 3;

  // ── SECTION III: RINCIAN PEKERJAAN & HASIL YANG DICAPAI (OUTPUT) ──────────
  drawSectionHeader('III. RINCIAN PEKERJAAN & HASIL YANG DICAPAI (OUTPUT)');

  const colW_No = 12;
  const colW_Uraian = 90;
  const colW_Vol = 42; // Split into Rencana (21) & Aktual (21)
  const colW_Status = cw - (colW_No + colW_Uraian + colW_Vol); // 38mm split Finish (19) & % (19)

  const headerH_L1 = 4.5;
  const headerH_L2 = 4.5;
  const totalHdrH = headerH_L1 + headerH_L2;

  // Header background
  doc.setFillColor(...TABLE_HEADER_BG);
  doc.rect(mx, y, cw, totalHdrH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_DARK);

  // Column: No
  doc.text('No.', mx + colW_No / 2, y + 5.5, { align: 'center' });
  doc.line(mx + colW_No, y, mx + colW_No, y + totalHdrH);

  // Column: Uraian Pekerjaan
  doc.text('Uraian Pekerjaan / Tugas yang Dikerjakan', mx + colW_No + colW_Uraian / 2, y + 5.5, { align: 'center' });
  doc.line(mx + colW_No + colW_Uraian, y, mx + colW_No + colW_Uraian, y + totalHdrH);

  // Column: Volume (Spans 2 sub-columns)
  const volStartX = mx + colW_No + colW_Uraian;
  doc.text('Volume', volStartX + colW_Vol / 2, y + 3.5, { align: 'center' });
  doc.line(volStartX, y + headerH_L1, volStartX + colW_Vol, y + headerH_L1);
  doc.text('Rencana', volStartX + 10.5, y + headerH_L1 + 3.3, { align: 'center' });
  doc.line(volStartX + 21, y + headerH_L1, volStartX + 21, y + totalHdrH);
  doc.text('Aktual', volStartX + 31.5, y + headerH_L1 + 3.3, { align: 'center' });
  doc.line(volStartX + colW_Vol, y, volStartX + colW_Vol, y + totalHdrH);

  // Column: Status Penyelesaian (Spans 2 sub-columns)
  const statStartX = volStartX + colW_Vol;
  doc.text('Status Penyelesaian', statStartX + colW_Status / 2, y + 3.5, { align: 'center' });
  doc.line(statStartX, y + headerH_L1, statStartX + colW_Status, y + headerH_L1);
  doc.text('Finish', statStartX + colW_Status / 4, y + headerH_L1 + 3.3, { align: 'center' });
  doc.line(statStartX + colW_Status / 2, y + headerH_L1, statStartX + colW_Status / 2, y + totalHdrH);
  doc.text('(%)', statStartX + (colW_Status * 3) / 4, y + headerH_L1 + 3.3, { align: 'center' });

  y += totalHdrH;

  // Work items rows (render items or default 5 blank rows)
  const items = data.workItems && data.workItems.length > 0
    ? data.workItems
    : [
        { itemNo: 1, taskDescription: '', volumePlanned: '', volumeActual: '', isFinished: false, progressPercent: 0 },
        { itemNo: 2, taskDescription: '', volumePlanned: '', volumeActual: '', isFinished: false, progressPercent: 0 },
        { itemNo: 3, taskDescription: '', volumePlanned: '', volumeActual: '', isFinished: false, progressPercent: 0 },
        { itemNo: 4, taskDescription: '', volumePlanned: '', volumeActual: '', isFinished: false, progressPercent: 0 },
        { itemNo: 5, taskDescription: '', volumePlanned: '', volumeActual: '', isFinished: false, progressPercent: 0 },
      ];

  const itemRowH = 6;
  items.forEach((item, index) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_DARK);
    doc.rect(mx, y, cw, itemRowH);

    // No
    doc.text(String(item.itemNo || index + 1), mx + colW_No / 2, y + 4, { align: 'center' });
    doc.line(mx + colW_No, y, mx + colW_No, y + itemRowH);

    // Uraian
    const truncatedTask = doc.splitTextToSize(item.taskDescription || '', colW_Uraian - 4);
    doc.text(truncatedTask[0] || '', mx + colW_No + 2, y + 4);
    doc.line(volStartX, y, volStartX, y + itemRowH);

    // Vol Rencana
    doc.text(item.volumePlanned || '-', volStartX + 10.5, y + 4, { align: 'center' });
    doc.line(volStartX + 21, y, volStartX + 21, y + itemRowH);

    // Vol Aktual
    doc.text(item.volumeActual || '-', volStartX + 31.5, y + 4, { align: 'center' });
    doc.line(statStartX, y, statStartX, y + itemRowH);

    // Finish
    doc.text(item.isFinished ? 'Ya' : 'Belum', statStartX + colW_Status / 4, y + 4, { align: 'center' });
    doc.line(statStartX + colW_Status / 2, y, statStartX + colW_Status / 2, y + itemRowH);

    // Progress %
    doc.text(`${item.progressPercent || 0}%`, statStartX + (colW_Status * 3) / 4, y + 4, { align: 'center' });

    y += itemRowH;
  });

  y += 3;

  // ── SECTION IV: TANDA TANGAN PERSETUJUAN & VERIFIKASI ───────────────────
  drawSectionHeader('IV. TANDA TANGAN PERSETUJUAN & VERIFIKASI');

  const signColW = cw / 4; // 45.5mm
  const signBoxH = 34;

  doc.rect(mx, y, cw, signBoxH);

  // Divide into 4 columns
  for (let c = 1; c < 4; c++) {
    doc.line(mx + signColW * c, y, mx + signColW * c, y + signBoxH);
  }

  // Column Titles
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_DARK);

  const signTitles = [
    { title: 'Karyawan Pemohon', sub: 'Pelaksana Lembur', sig: data.signatures.worker },
    { title: 'Supervisor', sub: 'Pemberi Perintah\n/Verificator', sig: data.signatures.supervisor },
    { title: 'Project Manager (PM)', sub: 'Approval', sig: data.signatures.projectManager },
    { title: 'Finance Director', sub: 'Verifikasi Final', sig: data.signatures.financeDirector },
  ];

  for (let i = 0; i < 4; i++) {
    const colX = mx + signColW * i;
    const item = signTitles[i];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(item.title, colX + signColW / 2, y + 4, { align: 'center' });

    // Subtitle / role definition
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const subLines = item.sub.split('\n');
    if (subLines.length > 1) {
      doc.text(subLines[0], colX + signColW / 2, y + 23, { align: 'center' });
      doc.text(subLines[1], colX + signColW / 2, y + 26, { align: 'center' });
    } else {
      doc.text(item.sub, colX + signColW / 2, y + 24, { align: 'center' });
    }

    // Signature stamp / QR code
    if (item.sig?.signed) {
      try {
        const qrContent = `MTE-SPKL-VERIFY\nDoc: ${data.spklNumber}\nRole: ${item.title}\nBy: ${item.sig.signerName || 'Authorized'}\nDate: ${item.sig.signedAt || ''}`;
        const qrData = await QRCode.toDataURL(qrContent, { margin: 0, width: 60 });
        doc.addImage(qrData, 'PNG', colX + signColW / 2 - 6, y + 6.5, 12, 12);
      } catch (_) {
        // Fallback stamp
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(22, 163, 74);
        doc.text('[VERIFIED]', colX + signColW / 2, y + 13, { align: 'center' });
      }
    }

    // Name bracket
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_DARK);
    const nameStr = item.sig?.signerName ? `( ${item.sig.signerName} )` : '(__________________)';
    doc.text(nameStr, colX + signColW / 2, y + 20, { align: 'center' });

    // Date
    const dateStr = `tgl: ${fmtShortDate(item.sig?.signedAt)}`;
    doc.setFontSize(6.5);
    doc.text(dateStr, colX + signColW / 2, y + 30.5, { align: 'center' });
  }

  // Save / Trigger Download
  const fileName = `${data.spklNumber.replace(/\//g, '_')}_${data.workerName.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}
