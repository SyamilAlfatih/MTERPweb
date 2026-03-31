import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, Calendar, CheckCircle, Clock, FileDown,
  Lock, Shield, ChevronDown, Wrench
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import api from '../api/api';
import { Card, Button, Input, Alert, Badge } from '../components/shared';

/* ─── Helpers ─── */

const formatRupiah = (num: number) =>
  new Intl.NumberFormat('id-ID').format(num || 0);

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

const fmtDateLong = (d: string | Date) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

const loadImageAsBase64 = (src: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject('No context'); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject('Failed to load image');
    img.src = src;
  });
};

/** Generate a QR code with a custom image overlaid in the center */
const generateQrWithOverlay = async (qrData: string, overlayImageSrc: string, size = 600): Promise<string> => {
  // 1. Generate QR code as canvas
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, qrData, {
    width: size,
    margin: 3,
    color: { dark: '#312E59', light: '#FFFFFF' },
    errorCorrectionLevel: 'H', // High error correction to allow center overlay
  });

  // 2. Load the overlay image
  const overlayImg = new Image();
  overlayImg.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    overlayImg.onload = () => resolve();
    overlayImg.onerror = () => reject('Failed to load overlay');
    overlayImg.src = overlayImageSrc;
  });

  // 3. Composite: draw overlay in center with white background
  const ctx = qrCanvas.getContext('2d');
  if (ctx) {
    const overlaySize = size * 0.22; // 22% of QR size — keeps QR scannable
    const cx = (size - overlaySize) / 2;
    const cy = (size - overlaySize) / 2;

    // White rounded background behind signature
    const padding = 4;
    ctx.fillStyle = '#FFFFFF';
    const rx = cx - padding, ry = cy - padding;
    const rw = overlaySize + padding * 2, rh = overlaySize + padding * 2;
    const radius = 6;
    ctx.beginPath();
    ctx.moveTo(rx + radius, ry);
    ctx.lineTo(rx + rw - radius, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
    ctx.lineTo(rx + rw, ry + rh - radius);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
    ctx.lineTo(rx + radius, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
    ctx.lineTo(rx, ry + radius);
    ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
    ctx.closePath();
    ctx.fill();

    // Draw the signature image
    ctx.drawImage(overlayImg, cx, cy, overlaySize, overlaySize);
  }

  return qrCanvas.toDataURL('image/png');
};

/* ─── S-Curve helpers (same as DailyReport) ─── */

function monthRange(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) { months.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }
  return months;
}

function costInMonth(itemStart: Date, itemEnd: Date, totalCost: number, month: Date): number {
  const mStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const mEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const overlapStart = itemStart > mStart ? itemStart : mStart;
  const overlapEnd = itemEnd < mEnd ? itemEnd : mEnd;
  if (overlapStart > overlapEnd) return 0;
  const totalDays = Math.max(1, (itemEnd.getTime() - itemStart.getTime()) / 86400000);
  const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000 + 1;
  return totalCost * (overlapDays / totalDays);
}

function fmtShort(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

/* ─── Interfaces ─── */

interface Report {
  _id: string;
  reportType: string;
  startDate: string;
  endDate: string;
  dailyReportIds: any[];
  status: string;
  authorization: {
    directorId?: any;
    directorName?: string;
    directorSignedAt?: string;
  };
  submittedBy: { fullName: string; role: string };
  createdAt: string;
}

/* ─── Types ─── */
type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom';

/* ─── Main Component ─── */

export default function ProjectReports() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [projectName, setProjectName] = useState('');
  const [projectData, setProjectData] = useState<any>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  // Report submit form
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Approve modal
  const [approveModal, setApproveModal] = useState<{ open: boolean; reportId: string }>({ open: false, reportId: '' });
  const [passphrase, setPassphrase] = useState('');
  const [approving, setApproving] = useState(false);
  const [passphraseError, setPassphraseError] = useState('');

  const [alertData, setAlertData] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string }>({
    visible: false, type: 'success', title: '', message: '',
  });

  const userRole = JSON.parse(localStorage.getItem('userData') || '{}').role || '';

  // ─── Auto-calculate date range ───
  useEffect(() => {
    const today = new Date();
    if (reportType === 'daily') {
      const d = today.toISOString().slice(0, 10);
      setStartDate(d);
      setEndDate(d);
    } else if (reportType === 'weekly') {
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setStartDate(monday.toISOString().slice(0, 10));
      setEndDate(sunday.toISOString().slice(0, 10));
    } else if (reportType === 'monthly') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(first.toISOString().slice(0, 10));
      setEndDate(last.toISOString().slice(0, 10));
    }
    // custom: user controls both dates
  }, [reportType]);

  // ─── Fetch project + reports ───
  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [projectRes, reportsRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/reports`),
      ]);
      const proj = projectRes.data;
      setProjectName(proj.nama || proj.name || '');
      setProjectData(proj);
      setReports(reportsRes.data);
    } catch (err) {
      console.error('Failed to fetch project reports', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Submit report ───
  const handleSubmit = async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      await api.post(`/projects/${id}/reports`, { reportType, startDate, endDate });
      setAlertData({ visible: true, type: 'success', title: t('projectReports.messages.submitSuccess'), message: t('projectReports.messages.submitSuccessDesc') });
      fetchData();
    } catch (err) {
      console.error('Submit report error', err);
      setAlertData({ visible: true, type: 'error', title: t('projectReports.messages.error'), message: t('projectReports.messages.submitFailed') });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Approve report ───
  const handleApprove = async () => {
    if (!approveModal.reportId || passphrase.length < 4) return;
    setApproving(true);
    setPassphraseError('');
    try {
      await api.put(`/projects/reports/${approveModal.reportId}/approve`, { passphrase });
      setAlertData({ visible: true, type: 'success', title: t('projectReports.messages.approveSuccess'), message: t('projectReports.messages.approveSuccessDesc') });
      setApproveModal({ open: false, reportId: '' });
      setPassphrase('');
      setPassphraseError('');
      fetchData();
    } catch (err: any) {
      const msg = err?.response?.data?.msg || t('projectReports.messages.approveFailed');
      setPassphraseError(msg);
    } finally {
      setApproving(false);
    }
  };

  // ─── PDF Export ───
  const handleExportPdf = async (report: Report) => {
    if (report.status !== 'approved') return;
    setExporting(report._id);
    try {
      // Fetch full report data
      const res = await api.get(`/projects/reports/${report._id}`);
      const fullReport = res.data;
      const dailyReports = fullReport.dailyReportIds || [];

      // Fetch tools for equipment
      let tools: any[] = [];
      try { tools = (await api.get(`/tools/project/${id}`)).data || []; } catch { /* ok */ }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 12;
      const contentW = pageW - margin * 2;
      let y = 8;

      const checkPage = (needed: number) => {
        if (y + needed > pageH - 15) { doc.addPage(); y = 12; }
      };

      // ── 1. Company Header ──
      try {
        const headerData = await loadImageAsBase64('/Kop Surat Aplikasi.webp');
        const hdrW = contentW;
        const hdrH = hdrW * 0.12;
        doc.addImage(headerData, 'PNG', margin, y, hdrW, hdrH);
        y += hdrH + 4;
      } catch { /* skip */ }

      // ── 2. Title ──
      const reportTypeLabel = reportType === 'daily' ? 'HARIAN / DAILY'
        : reportType === 'weekly' ? 'MINGGUAN / WEEKLY'
        : reportType === 'monthly' ? 'BULANAN / MONTHLY'
        : 'KUSTOM / CUSTOM';
      doc.setFillColor(49, 46, 89);
      doc.rect(margin, y, contentW, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(`LAPORAN ${reportTypeLabel} / ${reportTypeLabel.split(' / ')[1]} REPORT`, pageW / 2, y + 5.5, { align: 'center' });
      y += 12;

      // ── 3. Meta Info ──
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text('Proyek / Project:', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(projectName, margin + 35, y);

      doc.setFont('helvetica', 'bold');
      doc.text('Periode / Period:', pageW / 2 + 5, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`${fmtDateLong(report.startDate)} - ${fmtDateLong(report.endDate)}`, pageW / 2 + 33, y);
      y += 5;

      doc.setFont('helvetica', 'bold');
      doc.text('Status:', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text('APPROVED ✓', margin + 15, y);

      doc.setFont('helvetica', 'bold');
      doc.text('Jumlah Laporan:', pageW / 2 + 5, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`${dailyReports.length} laporan harian`, pageW / 2 + 37, y);
      y += 3;

      doc.setDrawColor(49, 46, 89);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageW - margin, y);
      y += 5;

      // ── 4. S-Curve Chart ──
      if (projectData) {
        checkPage(55);
        // Section title
        doc.setFillColor(241, 240, 255);
        doc.rect(margin, y, contentW, 6, 'F');
        doc.setDrawColor(49, 46, 89);
        doc.setLineWidth(0.8);
        doc.line(margin, y, margin, y + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(49, 46, 89);
        doc.text('S-CURVE PROGRESS', margin + 3, y + 4);
        y += 9;

        // Draw S-Curve on canvas
        const canvas = document.createElement('canvas');
        const W = 1400, H = 560;
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, W, H);

          const pStart = projectData.startDate ? new Date(projectData.startDate) : new Date();
          const pEnd = projectData.endDate ? new Date(projectData.endDate) : new Date();
          const months = monthRange(pStart, pEnd);
          // For sub-month projects (single month), pad with next month so we get ≥ 2 data points
          if (months.length === 1) {
            const nextMonth = new Date(months[0]);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            months.push(nextMonth);
          }
          if (months.length > 0) {
            interface ScheduleItem { startDate: Date; endDate: Date; plannedCost: number; actualCost: number; }
            const scheduleItems: ScheduleItem[] = (projectData.workItems || []).map((w: any) => ({
              startDate: new Date(w.startDate || pStart),
              endDate: new Date(w.endDate || pEnd),
              plannedCost: w.cost || 0,
              actualCost: w.actualCost || 0,
            }));

            const plannedPerMonth = months.map(m => scheduleItems.reduce((s, it) => s + costInMonth(it.startDate, it.endDate, it.plannedCost, m), 0));
            const actualPerMonth = months.map(m => scheduleItems.reduce((s, it) => s + costInMonth(it.startDate, it.endDate, it.actualCost, m), 0));

            const cumPlanned: number[] = []; let cp = 0;
            plannedPerMonth.forEach(v => { cp += v; cumPlanned.push(cp); });
            const cumActual: number[] = []; let ca = 0;
            actualPerMonth.forEach(v => { ca += v; cumActual.push(ca); });

            const totalPlanned = cumPlanned[cumPlanned.length - 1] || 1;
            const pctPlanned = cumPlanned.map(v => (v / totalPlanned) * 100);
            const pctActual = cumActual.map(v => (v / totalPlanned) * 100);

            const pad = { top: 50, right: 60, bottom: 80, left: 70 };
            const chartW = W - pad.left - pad.right;
            const chartH = H - pad.top - pad.bottom;

            // Grid
            ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1;
            for (let p = 0; p <= 100; p += 20) {
              const yy = pad.top + chartH - (p / 100) * chartH;
              ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(pad.left + chartW, yy); ctx.stroke();
              ctx.fillStyle = '#94A3B8'; ctx.font = '22px sans-serif'; ctx.textAlign = 'right';
              ctx.fillText(`${p}%`, pad.left - 10, yy + 7);
            }
            // X labels
            ctx.textAlign = 'center'; ctx.fillStyle = '#64748B'; ctx.font = '20px sans-serif';
            months.forEach((m, i) => {
              const x = pad.left + (i / Math.max(1, months.length - 1)) * chartW;
              ctx.fillText(fmtShort(m), x, H - pad.bottom + 30);
            });

            // Lines
            const drawLine = (data: number[], color: string, dashed = false) => {
              ctx.beginPath();
              ctx.strokeStyle = color;
              ctx.lineWidth = 4;
              if (dashed) ctx.setLineDash([12, 8]); else ctx.setLineDash([]);
              data.forEach((v, i) => {
                const x = pad.left + (i / Math.max(1, data.length - 1)) * chartW;
                const yy = pad.top + chartH - (v / 100) * chartH;
                i === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
              });
              ctx.stroke();
              ctx.setLineDash([]);
            };
            drawLine(pctPlanned, '#6366F1', true);
            drawLine(pctActual, '#10B981');

            // Legend
            const legendY = 20;
            ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.strokeStyle = '#6366F1';
            ctx.beginPath(); ctx.moveTo(W - 240, legendY); ctx.lineTo(W - 200, legendY); ctx.stroke();
            ctx.setLineDash([]); ctx.fillStyle = '#334155'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText('Planned', W - 195, legendY + 7);
            ctx.strokeStyle = '#10B981'; ctx.beginPath(); ctx.moveTo(W - 130, legendY); ctx.lineTo(W - 90, legendY); ctx.stroke();
            ctx.fillText('Actual', W - 85, legendY + 7);
          }
        }
        const scurveData = canvas.toDataURL('image/png');
        const scurveH = contentW * (H / W);
        doc.addImage(scurveData, 'PNG', margin, y, contentW, scurveH);
        y += scurveH + 5;
      }

      // ── Table helper ──
      const drawTable = (headers: string[], rows: string[][], colWidths: number[]) => {
        const rowH = 6, headerH = 7;
        checkPage(headerH + rowH * Math.min(rows.length, 3) + 5);
        doc.setFillColor(49, 46, 89);
        doc.rect(margin, y, contentW, headerH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        let cx = margin + 2;
        headers.forEach((h, i) => { doc.text(h, cx, y + 5); cx += colWidths[i]; });
        y += headerH;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        rows.forEach((row, rowIdx) => {
          checkPage(rowH + 2);
          if (rowIdx % 2 === 1) { doc.setFillColor(248, 250, 252); doc.rect(margin, y, contentW, rowH, 'F'); }
          doc.setTextColor(30, 41, 59);
          cx = margin + 2;
          row.forEach((cell, i) => { doc.text(String(cell), cx, y + 4); cx += colWidths[i]; });
          y += rowH;
        });
        y += 3;
      };

      // ── Section title helper ──
      const sectionTitle = (title: string) => {
        checkPage(20);
        doc.setFillColor(241, 240, 255);
        doc.rect(margin, y, contentW, 6, 'F');
        doc.setDrawColor(49, 46, 89);
        doc.setLineWidth(0.8);
        doc.line(margin, y, margin, y + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(49, 46, 89);
        doc.text(title, margin + 3, y + 4);
        y += 9;
      };

      // ── 5. Daily Reports Summary ──
      if (dailyReports.length > 0) {
        sectionTitle('RINGKASAN LAPORAN HARIAN / DAILY REPORTS SUMMARY');
        const headers = ['#', 'Tanggal / Date', 'Cuaca', 'Progress', 'Oleh / By'];
        const colW = [8, 40, 30, 25, 80];
        const rows = dailyReports.map((dr: any, i: number) => [
          `${i + 1}`,
          fmtDate(dr.date),
          dr.weather || '-',
          `${dr.progressPercent || 0}%`,
          dr.createdBy?.fullName || '-',
        ]);
        drawTable(headers, rows, colW);
      }

      // ── 6. Equipment Usage ──
      if (tools.length > 0) {
        sectionTitle('PENGGUNAAN ALAT / EQUIPMENT USAGE');
        const headers = ['#', 'Nama / Name', 'Kategori', 'Qty', 'Satuan', 'Kondisi'];
        const colW = [8, 50, 35, 15, 25, 50];
        const rows = tools.map((tool: any, i: number) => [
          `${i + 1}`, tool.nama || '-', tool.kategori || '-',
          `${tool.stok || 0}`, tool.satuan || 'unit', tool.kondisi || '-',
        ]);
        drawTable(headers, rows, colW);
      }

      // ── 7. Aggregated Notes/Materials/Workforce ──
      const allMaterials = dailyReports.filter((dr: any) => dr.materials).map((dr: any) => `[${fmtDate(dr.date)}] ${dr.materials}`).join('\n');
      const allWorkforce = dailyReports.filter((dr: any) => dr.workforce).map((dr: any) => `[${fmtDate(dr.date)}] ${dr.workforce}`).join('\n');
      const allNotes = dailyReports.filter((dr: any) => dr.notes).map((dr: any) => `[${fmtDate(dr.date)}] ${dr.notes}`).join('\n');

      const drawTextSection = (title: string, text: string) => {
        sectionTitle(title);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        const lines = doc.splitTextToSize(text, contentW - 6);
        lines.forEach((line: string) => { checkPage(5); doc.text(line, margin + 3, y); y += 4; });
        y += 3;
      };

      if (allMaterials) drawTextSection('MATERIAL / MATERIALS', allMaterials);
      if (allWorkforce) drawTextSection('TENAGA KERJA / WORKFORCE', allWorkforce);
      if (allNotes) drawTextSection('CATATAN / NOTES', allNotes);

      // ── 8. Signature Blocks with Digital Signatures ──
      checkPage(55);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);

      const sigW = (contentW - 10) / 3;
      const sigX1 = margin;
      const sigX2 = margin + sigW + 5;
      const sigX3 = margin + (sigW + 5) * 2;

      // Supervisor with QR code + digital signature overlay
      doc.text('Dibuat oleh / Prepared by:', sigX1 + 2, y);
      try {
        const spvQrData = `SPV|${report._id.slice(-8)}|${(report.submittedBy?.fullName || 'SPV').slice(0, 20)}`;
        const spvQr = await generateQrWithOverlay(spvQrData, '/Digital Signature SPV.webp');
        const qrSize = sigW - 8;
        doc.addImage(spvQr, 'PNG', sigX1 + 4, y + 2, qrSize, qrSize);
      } catch { doc.line(sigX1 + 2, y + 20, sigX1 + sigW - 2, y + 20); }
      doc.text('Supervisor', sigX1 + sigW / 2 - 8, y + sigW - 4);

      // Director with QR code + digital signature overlay (approved)
      doc.text('Disetujui / Approved by:', sigX2 + 2, y);
      try {
        const dirQrData = `DIR|${report._id.slice(-8)}|${(report.authorization.directorName || 'DIR').slice(0, 20)}`;
        const dirQr = await generateQrWithOverlay(dirQrData, '/Digital Signature.webp');
        const qrSize = sigW - 8;
        doc.addImage(dirQr, 'PNG', sigX2 + 4, y + 2, qrSize, qrSize);
      } catch { doc.line(sigX2 + 2, y + 20, sigX2 + sigW - 2, y + 20); }
      if (report.authorization.directorName) {
        doc.setFontSize(7);
        doc.text(report.authorization.directorName, sigX2 + sigW / 2 - 10, y + sigW - 4);
        doc.text('Direktur / Director', sigX2 + sigW / 2 - 14, y + sigW);
      } else {
        doc.text('Direktur / Director', sigX2 + sigW / 2 - 14, y + sigW - 4);
      }

      // Client (manual signature — no QR)
      doc.setFontSize(8);
      doc.text('Disetujui / Approved by:', sigX3 + 2, y);
      doc.line(sigX3 + 2, y + sigW - 8, sigX3 + sigW - 2, y + sigW - 8);
      doc.text('Klien / Client', sigX3 + sigW / 2 - 10, y + sigW - 4);
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text('Nama / Name: .............................', sigX3 + 2, y + sigW);

      // ── Save ──
      const typeLabel = report.reportType.charAt(0).toUpperCase() + report.reportType.slice(1);
      doc.save(`${typeLabel}_Report_${projectName.replace(/\s+/g, '_')}_${fmtDate(report.startDate)}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      setAlertData({ visible: true, type: 'error', title: t('projectReports.messages.error'), message: 'PDF export failed' });
    } finally {
      setExporting(null);
    }
  };

  // ─── Get report type label ───
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'daily': return t('projectReports.types.daily');
      case 'weekly': return t('projectReports.types.weekly');
      case 'monthly': return t('projectReports.types.monthly');
      case 'custom': return t('projectReports.types.custom');
      default: return type;
    }
  };

  // ─── Render ───
  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-[800px] mx-auto pb-24">
      <Alert
        visible={alertData.visible}
        type={alertData.type}
        title={alertData.title}
        message={alertData.message}
        onClose={() => setAlertData({ ...alertData, visible: false })}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-6">
        <div className="flex items-center gap-3">
          <button className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center cursor-pointer transition-colors border-none text-text-primary hover:bg-border shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary m-0 mb-1">{t('projectReports.title')}</h1>
            <p className="text-sm text-text-muted font-medium m-0">{projectName}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <Card className="mb-6"><p className="text-center text-text-muted py-8">{t('projectReports.loading')}</p></Card>
      ) : (
        <>
          {/* Submit New Report */}
          <Card className="mb-6 border-2 border-primary/20 shadow-sm relative overflow-visible">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
            <h3 className="flex items-center gap-2 text-lg font-bold text-text-primary m-0 mb-4 pb-3 border-b border-border">
              <FileText size={18} className="text-primary" /> {t('projectReports.submitNew')}
            </h3>

            {/* Report Type Tabs */}
            <div className="flex flex-wrap gap-2 mb-5">
              {(['daily', 'weekly', 'monthly', 'custom'] as ReportType[]).map((type) => (
                <button
                  key={type}
                  className={`px-4 py-2 rounded-md text-sm font-semibold cursor-pointer transition-all duration-200 flex-1 min-w-[100px] text-center ${reportType === type ? 'bg-primary text-white shadow-md' : 'bg-bg-secondary text-text-secondary hover:bg-border/50 hover:text-text-primary'}`}
                  onClick={() => setReportType(type)}
                >
                  {getTypeLabel(type)}
                </button>
              ))}
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px]">{t('projectReports.startDate')}</label>
                <div className="flex items-center bg-bg-secondary border border-border rounded-md px-3 py-2 transition-all focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(49,46,89,0.1)] opacity-100 disabled:opacity-60 disabled:cursor-not-allowed">
                  <Calendar size={16} className="text-text-muted mr-2" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={reportType !== 'custom'}
                    className="border-none bg-transparent outline-none w-full text-sm font-medium text-text-primary disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-[0.5px]">{t('projectReports.endDate')}</label>
                <div className="flex items-center bg-bg-secondary border border-border rounded-md px-3 py-2 transition-all focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(49,46,89,0.1)] opacity-100 disabled:opacity-60 disabled:cursor-not-allowed">
                  <Calendar size={16} className="text-text-muted mr-2" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={reportType !== 'custom' && reportType !== 'daily'}
                    className="border-none bg-transparent outline-none w-full text-sm font-medium text-text-primary disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            <Button
              title={t('projectReports.actions.submit')}
              icon={FileText}
              onClick={handleSubmit}
              loading={submitting}
              variant="primary"
              size="large"
              style={{ width: '100%' }}
            />
          </Card>

          {/* Reports List */}
          <Card className="mb-6">
            <h3 className="flex items-center gap-2 text-lg font-bold text-text-primary m-0 mb-4 pb-3 border-b border-border">
              <Clock size={18} className="text-secondary" /> {t('projectReports.submittedReports')} ({reports.length})
            </h3>

            {reports.length === 0 ? (
              <p className="text-center text-text-muted py-8 text-sm">{t('projectReports.empty')}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {reports.map((rpt) => (
                  <div key={rpt._id} className="p-4 sm:p-5 border border-border rounded-lg bg-bg-secondary transition-all hover:-translate-y-1 hover:shadow-md hover:border-primary/50 relative overflow-hidden group">
                    <div className={`absolute top-0 left-0 w-1.5 h-full ${rpt.status === 'approved' ? 'bg-success' : 'bg-warning'}`} />
                    
                    <div className="flex justify-between items-start mb-3 ml-2">
                      <div className="px-2 py-1 rounded-sm bg-primary-bg text-primary text-xs font-bold uppercase tracking-wider">
                        {getTypeLabel(rpt.reportType)}
                      </div>
                      <Badge
                        label={rpt.status === 'approved' ? t('projectReports.status.approved') : t('projectReports.status.pending')}
                        variant={rpt.status === 'approved' ? 'primary' : 'neutral'}
                        size="small"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-sm text-text-primary font-medium mb-2 ml-2">
                      <Calendar size={14} className="text-text-muted" />
                      <span>{fmtDate(rpt.startDate)} — {fmtDate(rpt.endDate)}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-text-muted mb-4 ml-2">
                      <span>{t('projectReports.dailyCount', { count: rpt.dailyReportIds?.length || 0 })}</span>
                      <span className="mx-1">•</span>
                      <span>{t('projectReports.by')} <span className="font-semibold text-text-primary">{rpt.submittedBy?.fullName || '-'}</span></span>
                    </div>

                    {rpt.status === 'approved' && rpt.authorization.directorName && (
                      <div className="flex items-center gap-2 text-xs text-success bg-success-bg px-3 py-2 rounded-md mb-4 ml-2 border border-success/20 font-medium">
                        <Shield size={14} />
                        <span>{t('projectReports.approvedBy')} {rpt.authorization.directorName}</span>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border/50 ml-2 mt-auto">
                      {rpt.status === 'pending' && (userRole === 'director' || userRole === 'owner') && (
                        <Button
                          title={t('projectReports.actions.approve')}
                          icon={CheckCircle}
                          onClick={() => setApproveModal({ open: true, reportId: rpt._id })}
                          variant="primary"
                          size="small"
                          style={{ flex: 1 }}
                        />
                      )}
                      {rpt.status === 'approved' && (
                        <Button
                          title={t('projectReports.actions.exportPdf')}
                          icon={FileDown}
                          onClick={() => handleExportPdf(rpt)}
                          loading={exporting === rpt._id}
                          variant="secondary"
                          size="small"
                          style={{ flex: 1 }}
                        />
                      )}
                      {rpt.status === 'pending' && (
                        <div className="flex items-center gap-2 text-xs text-warning bg-warning-bg px-3 py-2 rounded-md font-medium border border-warning/20">
                          <Lock size={14} />
                          <span>{t('projectReports.pendingApprovalNote')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Approve Modal */}
      {approveModal.open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000] flex justify-center items-center p-4 overflow-y-auto animate-fade-in" onClick={() => { setApproveModal({ open: false, reportId: '' }); setPassphrase(''); setPassphraseError(''); }}>
          <div className="bg-bg-primary rounded-xl w-full max-w-[450px] shadow-2xl overflow-hidden flex flex-col border border-border animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border bg-bg-secondary flex gap-3 items-center">
              <h3 className="text-lg font-bold text-text-primary m-0 flex items-center gap-2">
                <Shield size={20} className="text-secondary" /> {t('projectReports.approveModal.title')}
              </h3>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-text-muted m-0 mb-6 leading-relaxed">{t('projectReports.approveModal.desc')}</p>

              <div className="mb-2">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-[0.5px] mb-2">{t('projectReports.approveModal.passphrase')}</label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => { setPassphrase(e.target.value); setPassphraseError(''); }}
                  placeholder={t('projectReports.approveModal.placeholder')}
                  className={`w-full p-3 border rounded-md bg-bg-secondary text-text-primary text-sm transition-colors outline-none focus:bg-bg-primary ${passphraseError ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(220,38,38,0.1)]' : 'border-border focus:border-primary focus:shadow-[0_0_0_3px_rgba(49,46,89,0.1)]'}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' && passphrase.length >= 4) handleApprove(); }}
                />
                {passphraseError && <p className="text-xs text-danger mt-1 font-medium">{passphraseError}</p>}
              </div>
            </div>

            <div className="px-6 py-4 bg-bg-secondary border-t border-border flex justify-end gap-3 rounded-b-xl">
              <Button
                title={t('projectReports.actions.cancel')}
                onClick={() => { setApproveModal({ open: false, reportId: '' }); setPassphrase(''); setPassphraseError(''); }}
                variant="outline"
              />
              <Button
                title={approving ? t('projectReports.actions.approving') : t('projectReports.actions.approve')}
                icon={CheckCircle}
                onClick={handleApprove}
                loading={approving}
                variant="primary"
                disabled={passphrase.length < 4}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
