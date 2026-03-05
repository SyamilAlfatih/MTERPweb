import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Save, Cloud, Users, Package, ChevronDown, Layers, ArrowLeft, Truck, Calendar,
  Camera, X, FileDown, Plus, Image as ImageIcon, Wrench
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import api from '../api/api';
import { Card, Button, Input, Alert, Badge, CostInput } from '../components/shared';
import './DailyReport.css';

interface ProjectOption {
  _id: string;
  nama: string;
  lokasi: string;
  progress: number;
  startDate?: string;
  endDate?: string;
  workItems?: any[];
  supplies?: any[];
}

interface WorkItemUpdate {
  workItemId: string;
  name: string;
  qty: number;
  unit: string;
  cost: number;
  currentProgress: number;
  newProgress: number;
  actualCost: number;
  startDate?: string;
  endDate?: string;
}

interface SupplyUpdate {
  supplyId: string;
  item: string;
  qty: number;
  unit: string;
  cost: number;
  currentStatus: string;
  newStatus: string;
  actualCost: number;
  startDate?: string;
  endDate?: string;
}

const SUPPLY_STATUSES = ['Pending', 'Ordered', 'Delivered'] as const;
const STATUS_PROGRESS: Record<string, number> = { 'Pending': 0, 'Ordered': 50, 'Delivered': 100 };

const formatRupiah = (num: number) => new Intl.NumberFormat('id-ID').format(num);

/* ─── S-Curve helpers (mirrored from ProjectDetail) ─── */

function monthRange(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function costInMonth(
  itemStart: Date, itemEnd: Date, totalCost: number, month: Date
): number {
  const iStart = new Date(itemStart.getFullYear(), itemStart.getMonth(), 1);
  const iEnd = new Date(itemEnd.getFullYear(), itemEnd.getMonth(), 1);
  const mStart = new Date(month.getFullYear(), month.getMonth(), 1);
  if (mStart < iStart || mStart > iEnd) return 0;
  let totalMonths = 0;
  const tmp = new Date(iStart);
  while (tmp <= iEnd) { totalMonths++; tmp.setMonth(tmp.getMonth() + 1); }
  if (totalMonths === 0) totalMonths = 1;
  return totalCost / totalMonths;
}

const fmtShort = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

export default function DailyReport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get('projectId');
  const scurveCanvasRef = useRef<HTMLCanvasElement>(null);
  const headerImgRef = useRef<HTMLImageElement>(null);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(preselectedId || '');
  const [selectedProjectName, setSelectedProjectName] = useState('');
  const [selectedProjectData, setSelectedProjectData] = useState<any>(null);
  const [workItemUpdates, setWorkItemUpdates] = useState<WorkItemUpdate[]>([]);
  const [supplyUpdates, setSupplyUpdates] = useState<SupplyUpdate[]>([]);
  const [equipmentData, setEquipmentData] = useState<any[]>([]);
  const [loadingProject, setLoadingProject] = useState(false);

  const [alertData, setAlertData] = useState<{ visible: boolean; type: 'success' | 'error'; title: string; message: string }>({
    visible: false,
    type: 'success',
    title: '',
    message: '',
  });

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  });

  const [formData, setFormData] = useState({
    weather: 'Cerah',
    materials: '',
    workforce: '',
    notes: '',
  });

  // Photo state
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_PHOTOS = 5;

  // Fetch all projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await api.get('/projects');
        setProjects(res.data);
      } catch (err) {
        console.error('Failed to fetch projects', err);
      }
    };
    fetchProjects();
  }, []);

  // When project or date changes, fetch workforce for that date automatically
  useEffect(() => {
    if (!selectedProjectId || !selectedDate) return;
    
    const fetchWorkforce = async () => {
      try {
        const res = await api.get(`/attendance?projectId=${selectedProjectId}&startDate=${selectedDate}&endDate=${selectedDate}`);
        const attendanceRecords = res.data;
        
        if (attendanceRecords && attendanceRecords.length > 0) {
          const presentWorkers = attendanceRecords.filter((a: any) => 
            a.status === 'Present' || a.status === 'Late' || a.status === 'Half-day'
          );
          
          if (presentWorkers.length > 0) {
            const names = presentWorkers.map((a: any) => a.userId?.fullName).filter(Boolean);
            const workforceString = `${presentWorkers.length} Pekerja: ${names.join(', ')}`;
            
            setFormData(prev => ({
              ...prev,
              workforce: prev.workforce === '' || prev.workforce.includes('Pekerja:') ? workforceString : prev.workforce
            }));
          } else {
             setFormData(prev => ({ ...prev, workforce: '0 Pekerja (Tidak ada yang hadir)' }));
          }
        } else {
             setFormData(prev => ({ ...prev, workforce: '0 Pekerja' }));
        }
      } catch (err) {
        console.error('Failed to auto-fetch workforce:', err);
      }
    };
    
    fetchWorkforce();
  }, [selectedProjectId, selectedDate]);

  // When project or date changes, fetch material logs for that date automatically
  useEffect(() => {
    if (!selectedProjectId || !selectedDate) return;
    
    const fetchMaterialLogs = async () => {
      try {
        const res = await api.get(`/projects/${selectedProjectId}/material-logs?date=${selectedDate}`);
        const materialLogs = res.data;
        
        if (materialLogs && materialLogs.length > 0) {
          const lines = materialLogs.map((log: any) => 
            `- ${log.qtyUsed} ${log.supplyId?.unit || ''} ${log.supplyId?.item || 'Unknown'}${log.notes ? ': ' + log.notes : ''}`
          );
          const materialsString = lines.join('\n');
          
          setFormData(prev => ({
            ...prev,
            materials: prev.materials === '' || prev.materials.startsWith('- ') ? materialsString : prev.materials
          }));
        } else {
          setFormData(prev => ({
            ...prev,
            materials: prev.materials === '' || prev.materials.startsWith('- ') ? '' : prev.materials
          }));
        }
      } catch (err) {
        console.error('Failed to auto-fetch material logs:', err);
      }
    };
    
    fetchMaterialLogs();
  }, [selectedProjectId, selectedDate]);

  // When a project is selected, fetch its work items + supplies
  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectData(selectedProjectId);
    } else {
      setWorkItemUpdates([]);
      setSupplyUpdates([]);
      setEquipmentData([]);
      setSelectedProjectName('');
      setSelectedProjectData(null);
    }
  }, [selectedProjectId]);

  const fetchProjectData = async (pid: string) => {
    setLoadingProject(true);
    try {
      const [projectRes, suppliesRes, toolsRes] = await Promise.all([
        api.get(`/projects/${pid}`),
        api.get(`/projects/${pid}/supplies`),
        api.get(`/tools/project/${pid}`),
      ]);
      const project = projectRes.data;
      const suppliesData = suppliesRes.data;
      const toolsData = toolsRes.data || [];
      setSelectedProjectName(project.nama || project.name || '');
      setSelectedProjectData({ ...project, supplies: suppliesData || [] });
      setEquipmentData(toolsData);
      
      const items: WorkItemUpdate[] = (project.workItems || []).map((item: any) => ({
        workItemId: item._id,
        name: item.name,
        qty: item.qty || 0,
        unit: item.unit || item.volume || '-',
        cost: item.cost || 0,
        currentProgress: item.progress || 0,
        newProgress: item.progress || 0,
        actualCost: item.actualCost || 0,
        startDate: item.startDate,
        endDate: item.endDate,
      }));
      setWorkItemUpdates(items);

      const supplies: SupplyUpdate[] = (suppliesData || []).map((s: any) => ({
        supplyId: s._id,
        item: s.item,
        qty: s.qty || 0,
        unit: s.unit || '-',
        cost: s.cost || 0,
        currentStatus: s.status || 'Pending',
        newStatus: s.status || 'Pending',
        actualCost: s.actualCost || 0,
        startDate: s.startDate,
        endDate: s.endDate,
      }));
      setSupplyUpdates(supplies);
    } catch (err) {
      console.error('Failed to fetch project details', err);
    } finally {
      setLoadingProject(false);
    }
  };

  const updateItemProgress = (index: number, value: number) => {
    const updated = [...workItemUpdates];
    updated[index].newProgress = Math.min(100, Math.max(0, value));
    setWorkItemUpdates(updated);
  };

  const updateItemActualCost = (index: number, value: number) => {
    const updated = [...workItemUpdates];
    updated[index].actualCost = value;
    setWorkItemUpdates(updated);
  };

  const updateSupplyStatus = (index: number, status: string) => {
    const updated = [...supplyUpdates];
    updated[index].newStatus = status;
    setSupplyUpdates(updated);
  };

  const updateSupplyActualCost = (index: number, value: number) => {
    const updated = [...supplyUpdates];
    updated[index].actualCost = value;
    setSupplyUpdates(updated);
  };

  // Calculate computed overall progress (work items + supplies, cost-weighted)
  const allCosts = [
    ...workItemUpdates.map(w => ({ cost: w.cost, progress: w.newProgress })),
    ...supplyUpdates.map(s => ({ cost: s.cost, progress: STATUS_PROGRESS[s.newStatus] || 0 })),
  ];
  const totalCost = allCosts.reduce((s, i) => s + (i.cost || 0), 0);
  const computedProgress = totalCost > 0
    ? Math.round(allCosts.reduce((s, i) => s + ((i.cost || 0) / totalCost) * i.progress, 0))
    : 0;

  /* ─── Photo Handlers ─── */

  const handleAddPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const newFiles = Array.from(files).slice(0, MAX_PHOTOS - photos.length);
    if (newFiles.length === 0) return;

    const updatedPhotos = [...photos, ...newFiles];
    setPhotos(updatedPhotos);

    const newUrls = newFiles.map(f => URL.createObjectURL(f));
    setPhotoPreviewUrls(prev => [...prev, ...newUrls]);

    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemovePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviewUrls[index]);
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      photoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  /* ─── Submit Handler ─── */

  const handleSubmit = async () => {
    if (!selectedProjectId) {
      setAlertData({ visible: true, type: 'error', title: t('dailyReport.messages.error'), message: t('dailyReport.messages.selectProject') });
      return;
    }

    setLoading(true);
    try {
      // Build FormData for multipart upload
      const fd = new FormData();
      fd.append('workItemUpdates', JSON.stringify(workItemUpdates.map(w => ({
        workItemId: w.workItemId,
        newProgress: w.newProgress,
        actualCost: w.actualCost,
      }))));
      fd.append('supplyUpdates', JSON.stringify(supplyUpdates.map(s => ({
        supplyId: s.supplyId,
        newStatus: s.newStatus,
        actualCost: s.actualCost,
      }))));
      fd.append('weather', formData.weather);
      fd.append('materials', formData.materials);
      fd.append('workforce', formData.workforce);
      fd.append('notes', formData.notes);
      fd.append('date', selectedDate);

      // Append photos
      photos.forEach(photo => {
        fd.append('photos', photo);
      });

      await api.post(`/projects/${selectedProjectId}/daily-report`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setAlertData({
        visible: true,
        type: 'success',
        title: t('dailyReport.messages.submitSuccess'),
        message: t('dailyReport.messages.submitSuccessDesc', { progress: computedProgress }),
      });

      setTimeout(() => navigate(-1), 1500);
    } catch (err) {
      console.error('Failed to submit report', err);
      setAlertData({ visible: true, type: 'error', title: t('dailyReport.messages.submitFailed'), message: t('dailyReport.messages.submitFailedDesc') });
    } finally {
      setLoading(false);
    }
  };

  /* ─── S-Curve Canvas Drawing for PDF ─── */

  const drawSCurveOnCanvas = useCallback((canvas: HTMLCanvasElement) => {
    if (!selectedProjectData) return;

    const project = selectedProjectData;
    const wItems = project.workItems || [];
    const sItems = project.supplies || [];

    const globalStart = project.startDate;
    const globalEnd = project.endDate;
    if (!globalStart || !globalEnd) return;

    const start = new Date(globalStart);
    const end = new Date(globalEnd);
    const months = monthRange(start, end);
    if (months.length === 0) return;

    interface ScheduleItem { startDate: Date; endDate: Date; plannedCost: number; actualCost: number; }
    const allItems: ScheduleItem[] = [];

    for (const wi of wItems) {
      const s = wi.startDate || wi.dates?.plannedStart;
      const e = wi.endDate || wi.dates?.plannedEnd;
      if (s && e) {
        allItems.push({ startDate: new Date(s), endDate: new Date(e), plannedCost: wi.cost || 0, actualCost: wi.actualCost || 0 });
      }
    }

    for (const sup of sItems) {
      const s = sup.startDate || sup.deadline;
      const e = sup.endDate || sup.deadline;
      if (s && e) {
        allItems.push({ startDate: new Date(s), endDate: new Date(e), plannedCost: sup.cost || 0, actualCost: sup.actualCost || 0 });
      }
    }

    if (allItems.length === 0) return;
    const totalItemCost = allItems.reduce((acc, i) => acc + i.plannedCost, 0);
    if (totalItemCost === 0) return;

    // Build cumulative data
    let cumPlanned = 0, cumActual = 0;
    const points: { label: string; planned: number; actual: number }[] = [];

    for (const month of months) {
      let mPlanned = 0, mActual = 0;
      for (const item of allItems) {
        mPlanned += costInMonth(item.startDate, item.endDate, item.plannedCost, month);
        mActual += costInMonth(item.startDate, item.endDate, item.actualCost, month);
      }
      cumPlanned += mPlanned;
      cumActual += mActual;
      points.push({
        label: fmtShort(month),
        planned: Math.min((cumPlanned / totalItemCost) * 100, 100),
        actual: Math.min((cumActual / totalItemCost) * 100, 100),
      });
    }

    if (points.length < 2) return;

    // Draw on canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const padding = { top: 30, right: 30, bottom: 50, left: 50 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#FAFBFC';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(W - padding.right, y);
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = '#64748B';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.fillText(`${100 - i * 25}%`, padding.left - 8, y + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    const xStep = chartW / (points.length - 1);
    const labelInterval = points.length > 12 ? Math.ceil(points.length / 8) : 1;
    for (let i = 0; i < points.length; i++) {
      if (i % labelInterval !== 0 && i !== points.length - 1) continue;
      const x = padding.left + xStep * i;
      ctx.save();
      ctx.translate(x, H - padding.bottom + 14);
      ctx.rotate(-0.4);
      ctx.fillText(points[i].label, 0, 0);
      ctx.restore();
    }

    // Draw lines helper
    const drawLine = (data: number[], color: string, dashed = false) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      if (dashed) ctx.setLineDash([6, 3]);
      else ctx.setLineDash([]);
      for (let i = 0; i < data.length; i++) {
        const x = padding.left + xStep * i;
        const y = padding.top + chartH - (data[i] / 100) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Dots
      for (let i = 0; i < data.length; i++) {
        const x = padding.left + xStep * i;
        const y = padding.top + chartH - (data[i] / 100) * chartH;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    drawLine(points.map(p => p.planned), '#6366F1');
    drawLine(points.map(p => p.actual), '#10B981');

    // Today reference line
    const now = new Date();
    const nowMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayIdx = months.findIndex(m => m.getTime() === nowMonth.getTime());
    if (todayIdx >= 0) {
      const tx = padding.left + xStep * todayIdx;
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(tx, padding.top);
      ctx.lineTo(tx, padding.top + chartH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#F59E0B';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TODAY', tx, padding.top - 8);
    }

    // Legend
    const legendY = 12;
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#6366F1';
    ctx.fillRect(W - 200, legendY - 4, 10, 10);
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.fillText('Planned', W - 186, legendY + 5);

    ctx.fillStyle = '#10B981';
    ctx.fillRect(W - 130, legendY - 4, 10, 10);
    ctx.fillStyle = '#334155';
    ctx.fillText('Actual', W - 116, legendY + 5);
  }, [selectedProjectData]);

  /* ─── PDF Export (jsPDF) ─── */

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

  const handleExportPdf = async () => {
    if (!selectedProjectId) {
      setAlertData({ visible: true, type: 'error', title: t('dailyReport.messages.error'), message: t('dailyReport.messages.selectProject') });
      return;
    }

    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 12;
      const contentW = pageW - margin * 2;
      let y = 8;

      // Helper: check page break
      const checkPage = (needed: number) => {
        if (y + needed > pageH - 15) {
          doc.addPage();
          y = 12;
        }
      };

      // ── 1. Company Header Image ──
      try {
        const headerData = await loadImageAsBase64('/Kop Surat Aplikasi.webp');
        const hdrW = contentW;
        const hdrH = hdrW * 0.12; // approximate aspect ratio
        doc.addImage(headerData, 'PNG', margin, y, hdrW, hdrH);
        y += hdrH + 4;
      } catch { /* skip header if it fails */ }

      // ── 2. Title ──
      doc.setFillColor(49, 46, 89);
      doc.rect(margin, y, contentW, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text('LAPORAN HARIAN / DAILY REPORT', pageW / 2, y + 5.5, { align: 'center' });
      y += 12;

      // ── 3. Meta Info ──
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text('Proyek / Project:', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(selectedProjectName, margin + 35, y);

      const dateStr = new Date(selectedDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      doc.setFont('helvetica', 'bold');
      doc.text('Tanggal / Date:', pageW / 2 + 5, y);
      doc.setFont('helvetica', 'normal');
      doc.text(dateStr, pageW / 2 + 33, y);
      y += 5;

      doc.setFont('helvetica', 'bold');
      doc.text('Cuaca / Weather:', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(getWeatherLabel(formData.weather), margin + 35, y);

      doc.setFont('helvetica', 'bold');
      doc.text('Progress:', pageW / 2 + 5, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`${computedProgress}%`, pageW / 2 + 23, y);
      y += 3;

      // Divider
      doc.setDrawColor(49, 46, 89);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageW - margin, y);
      y += 5;

      // ── 4. S-Curve Chart ──
      if (selectedProjectData) {
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

        // Draw S-Curve on hidden canvas and embed
        const canvas = document.createElement('canvas');
        canvas.width = 1400;
        canvas.height = 560;
        drawSCurveOnCanvas(canvas);
        const scurveData = canvas.toDataURL('image/png');
        const scurveH = contentW * (560 / 1400);
        doc.addImage(scurveData, 'PNG', margin, y, contentW, scurveH);
        y += scurveH + 5;
      }

      // ── Helper: draw a table ──
      const drawTable = (headers: string[], rows: string[][], colWidths: number[]) => {
        const rowH = 6;
        const headerH = 7;

        checkPage(headerH + rowH * Math.min(rows.length, 3) + 5);

        // Header
        doc.setFillColor(49, 46, 89);
        doc.rect(margin, y, contentW, headerH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        let cx = margin + 2;
        headers.forEach((h, i) => {
          doc.text(h, cx, y + 5);
          cx += colWidths[i];
        });
        y += headerH;

        // Rows
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        rows.forEach((row, rowIdx) => {
          checkPage(rowH + 2);
          if (rowIdx % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y, contentW, rowH, 'F');
          }
          doc.setTextColor(30, 41, 59);
          cx = margin + 2;
          row.forEach((cell, i) => {
            doc.text(String(cell), cx, y + 4);
            cx += colWidths[i];
          });
          y += rowH;
        });
        y += 3;
      };

      // ── 5. Work Items Table ──
      if (workItemUpdates.length > 0) {
        checkPage(20);
        doc.setFillColor(241, 240, 255);
        doc.rect(margin, y, contentW, 6, 'F');
        doc.setDrawColor(49, 46, 89);
        doc.setLineWidth(0.8);
        doc.line(margin, y, margin, y + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(49, 46, 89);
        doc.text('PEKERJAAN / WORK ITEMS', margin + 3, y + 4);
        y += 9;

        const headers = ['#', 'Nama / Name', 'Qty', 'Unit', 'Progress (%)'];
        const colW = [10, 65, 22, 22, 65];
        const rows = workItemUpdates.map((item, i) => [
          `${i + 1}`,
          item.name,
          `${item.qty}`,
          item.unit,
          item.currentProgress !== item.newProgress
            ? `${item.currentProgress}% → ${item.newProgress}%`
            : `${item.newProgress}%`,
        ]);
        drawTable(headers, rows, colW);
      }

      // ── 6. Supply Plan Table ──
      if (supplyUpdates.length > 0) {
        checkPage(20);
        doc.setFillColor(241, 240, 255);
        doc.rect(margin, y, contentW, 6, 'F');
        doc.setDrawColor(49, 46, 89);
        doc.setLineWidth(0.8);
        doc.line(margin, y, margin, y + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(49, 46, 89);
        doc.text('RENCANA PENGADAAN / SUPPLY PLAN', margin + 3, y + 4);
        y += 9;

        const headers = ['#', 'Item', 'Qty', 'Unit', 'Status'];
        const colW = [10, 65, 22, 22, 65];
        const rows = supplyUpdates.map((s, i) => [
          `${i + 1}`,
          s.item,
          `${s.qty}`,
          s.unit,
          s.currentStatus !== s.newStatus ? `${s.currentStatus} → ${s.newStatus}` : s.newStatus,
        ]);
        drawTable(headers, rows, colW);
      }

      // ── Helper: text section ──
      const drawTextSection = (title: string, text: string) => {
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

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        const lines = doc.splitTextToSize(text, contentW - 6);
        lines.forEach((line: string) => {
          checkPage(5);
          doc.text(line, margin + 3, y);
          y += 4;
        });
        y += 3;
      };

      // ── 7. Equipment Usage Table ──
      if (equipmentData.length > 0) {
        checkPage(20);
        doc.setFillColor(241, 240, 255);
        doc.rect(margin, y, contentW, 6, 'F');
        doc.setDrawColor(49, 46, 89);
        doc.setLineWidth(0.8);
        doc.line(margin, y, margin, y + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(49, 46, 89);
        doc.text('PENGGUNAAN ALAT / EQUIPMENT USAGE', margin + 3, y + 4);
        y += 9;

        const headers = ['#', 'Nama Alat / Name', 'Kategori / Category', 'Qty', 'Satuan / Unit', 'Kondisi / Condition'];
        const colW = [8, 50, 35, 15, 25, 50];
        const rows = equipmentData.map((tool: any, i: number) => [
          `${i + 1}`,
          tool.nama || '-',
          tool.kategori || '-',
          `${tool.stok || 0}`,
          tool.satuan || 'unit',
          tool.kondisi || '-',
        ]);
        drawTable(headers, rows, colW);
      }

      // ── 8. Materials, Workforce, Notes ──
      if (formData.materials) drawTextSection('MATERIAL YANG DIGUNAKAN / MATERIALS USED', formData.materials);
      if (formData.workforce) drawTextSection('TENAGA KERJA / WORKFORCE', formData.workforce);
      if (formData.notes) drawTextSection('CATATAN / NOTES', formData.notes);

      // ── 8. Photos ──
      if (photoPreviewUrls.length > 0) {
        checkPage(20);
        doc.setFillColor(241, 240, 255);
        doc.rect(margin, y, contentW, 6, 'F');
        doc.setDrawColor(49, 46, 89);
        doc.setLineWidth(0.8);
        doc.line(margin, y, margin, y + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(49, 46, 89);
        doc.text('DOKUMENTASI / SITE PHOTOS', margin + 3, y + 4);
        y += 9;

        const photoW = (contentW - 4) / 2;
        const photoH = 50;
        for (let i = 0; i < photoPreviewUrls.length; i++) {
          const col = i % 2;
          if (col === 0) checkPage(photoH + 5);
          try {
            const imgData = await loadImageAsBase64(photoPreviewUrls[i]);
            const px = margin + col * (photoW + 4);
            doc.addImage(imgData, 'JPEG', px, y, photoW, photoH);
            if (col === 1 || i === photoPreviewUrls.length - 1) {
              y += photoH + 4;
            }
          } catch { /* skip broken image */ }
        }
        y += 3;
      }

      // ── 9. Signature Blocks ──
      checkPage(35);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);

      // Left: Prepared by (Supervisor)
      const sigW = (contentW - 10) / 3;
      const sigX1 = margin;
      const sigX2 = margin + sigW + 5;
      const sigX3 = margin + (sigW + 5) * 2;

      doc.text('Dibuat oleh / Prepared by:', sigX1 + 5, y);
      doc.line(sigX1 + 2, y + 25, sigX1 + sigW - 2, y + 25);
      doc.text('Supervisor', sigX1 + sigW / 2 - 8, y + 29);

      // Center: Approved by (Director)
      doc.text('Disetujui / Approved by:', sigX2 + 5, y);
      doc.line(sigX2 + 2, y + 25, sigX2 + sigW - 2, y + 25);
      doc.text('Direktur / Director', sigX2 + sigW / 2 - 14, y + 29);

      // Right: Approved by (Client)
      doc.text('Disetujui / Approved by:', sigX3 + 5, y);
      doc.line(sigX3 + 2, y + 25, sigX3 + sigW - 2, y + 25);
      doc.text('Klien / Client', sigX3 + sigW / 2 - 10, y + 29);
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text('Nama / Name: .............................', sigX3 + 2, y + 34);

      // ── Save ──
      doc.save(`Daily_Report_${selectedProjectName.replace(/\s+/g, '_')}_${selectedDate}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      setAlertData({ visible: true, type: 'error', title: t('dailyReport.messages.submitFailed'), message: 'PDF export failed' });
    } finally {
      setExporting(false);
    }
  };

  /* ─── Weather helpers ─── */

  const getIcon = (weather: string) => {
    if (weather === 'Cerah') return '☀️';
    if (weather === 'Berawan') return '⛅';
    return '🌧️';
  };

  const getTranslationValue = (weather: string) => {
    if (weather === 'Cerah') return t('dailyReport.weather.options.sunny');
    if (weather === 'Berawan') return t('dailyReport.weather.options.cloudy');
    return t('dailyReport.weather.options.rainy');
  };

  const getWeatherLabel = (weather: string) => {
    if (weather === 'Cerah') return `☀️ ${t('dailyReport.weather.options.sunny')}`;
    if (weather === 'Berawan') return `⛅ ${t('dailyReport.weather.options.cloudy')}`;
    return `🌧️ ${t('dailyReport.weather.options.rainy')}`;
  };

  return (
    <div className="report-container">
      <Alert
        visible={alertData.visible}
        type={alertData.type}
        title={alertData.title}
        message={alertData.message}
        onClose={() => setAlertData({ ...alertData, visible: false })}
      />

      {/* Header */}
      <div className="report-header">
        <div className="report-header-left">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="report-title">{t('dailyReport.title')}</h1>
            <span className="report-date">{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Project Selector */}
      <Card className="report-card">
        <h3 className="card-title">
          <Layers size={18} /> {t('dailyReport.projectSelector.title')}
        </h3>
        <div className="project-selector-wrapper">
          <select
            className="project-selector"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            <option value="">{t('dailyReport.projectSelector.placeholder')}</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.nama} — {p.lokasi}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="selector-chevron" />
        </div>
        {selectedProjectName && (
          <div className="selected-project-info">
            <span className="selected-project-name">{selectedProjectName}</span>
            <Badge label={t('dailyReport.projectSelector.progress', { progress: computedProgress })} variant="primary" size="small" />
          </div>
        )}
      </Card>

      {/* Loading */}
      {loadingProject && <p className="loading-text">{t('dailyReport.loadingProject')}</p>}

      {/* Work Item Progress */}
      {!loadingProject && workItemUpdates.length > 0 && (
        <Card className="report-card">
          <h3 className="card-title">
            <Layers size={18} /> {t('dailyReport.workItem.title')}
          </h3>
          <div className="work-items-list">
            {workItemUpdates.map((item, i) => {
              const changed = item.newProgress !== item.currentProgress;
              const weight = totalCost > 0 ? ((item.cost / totalCost) * 100).toFixed(1) : '0';
              return (
                <div key={item.workItemId} className={`work-item-row ${changed ? 'changed' : ''}`}>
                  <div className="work-item-info">
                    <span className="work-item-name">{item.name}</span>
                    <div className="work-item-meta">
                      <Badge label={`${weight}%`} variant="neutral" size="small" />
                      <span className="work-item-detail">{item.qty} {item.unit} · Rp {formatRupiah(item.cost)}</span>
                    </div>
                  </div>
                  <div className="work-item-controls">
                    <div className="progress-slider-group">
                      <label className="slider-label">{t('dailyReport.workItem.progress')}</label>
                      <div className="slider-row">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={item.newProgress}
                          onChange={(e) => updateItemProgress(i, Number(e.target.value))}
                          className="progress-slider"
                        />
                        <span className={`slider-value ${changed ? 'value-changed' : ''}`}>
                          {item.newProgress}%
                        </span>
                      </div>
                      {changed && (
                        <span className="progress-diff">
                          {item.currentProgress}% → {item.newProgress}%
                        </span>
                      )}
                    </div>
                    <div className="actual-cost-group">
                      <CostInput
                        label={t('dailyReport.workItem.actualCost')}
                        value={item.actualCost}
                        onChange={(v) => updateItemActualCost(i, v)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Supply Plan Updates */}
      {!loadingProject && supplyUpdates.length > 0 && (
        <Card className="report-card">
          <h3 className="card-title">
            <Truck size={18} /> {t('dailyReport.supplyPlan.title')}
          </h3>
          <div className="work-items-list">
            {supplyUpdates.map((supply, i) => {
              const changed = supply.newStatus !== supply.currentStatus;
              const weight = totalCost > 0 ? ((supply.cost / totalCost) * 100).toFixed(1) : '0';
              return (
                <div key={supply.supplyId} className={`work-item-row ${changed ? 'changed' : ''}`}>
                  <div className="work-item-info">
                    <span className="work-item-name">{supply.item}</span>
                    <div className="work-item-meta">
                      <Badge label={`${weight}%`} variant="neutral" size="small" />
                      <span className="work-item-detail">{supply.qty} {supply.unit} · Rp {formatRupiah(supply.cost)}</span>
                    </div>
                  </div>
                  <div className="supply-status-controls">
                    <label className="slider-label">{t('dailyReport.supplyPlan.status')}</label>
                    <div className="supply-status-btns">
                      {SUPPLY_STATUSES.map((status) => (
                        <button
                          key={status}
                          className={`supply-status-btn ${supply.newStatus === status ? 'active' : ''} status-${status.toLowerCase()}`}
                          onClick={() => updateSupplyStatus(i, status)}
                        >
                          {status === 'Pending' ? '⏳' : status === 'Ordered' ? '📦' : '✅'} {t(`dailyReport.status.${status.toLowerCase()}`)}
                        </button>
                      ))}
                    </div>
                    {changed && (
                      <span className="progress-diff">
                        {supply.currentStatus} → {supply.newStatus}
                      </span>
                    )}
                    <div className="actual-cost-group">
                      <CostInput
                        label={t('dailyReport.supplyPlan.actualCost')}
                        value={supply.actualCost}
                        onChange={(v) => updateSupplyActualCost(i, v)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!loadingProject && selectedProjectId && workItemUpdates.length === 0 && supplyUpdates.length === 0 && (
        <Card className="report-card">
          <p className="empty-text">{t('dailyReport.emptyProject')}</p>
        </Card>
      )}

      {/* Report Details: Date & Weather */}
      <Card className="report-card">
        <h3 className="card-title">
          <Calendar size={18} /> {t('dailyReport.date.title')}
        </h3>
        <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 12px', lineHeight: 1.4 }}>
          {t('dailyReport.date.hint')}
        </p>

        {/* Quick date buttons */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {(() => {
            const today = new Date();
            const fmtLocal = (d: Date) => { const dd = new Date(d); dd.setMinutes(dd.getMinutes() - dd.getTimezoneOffset()); return dd.toISOString().split('T')[0]; };
            const dayLabels = [
              { label: t('dailyReport.date.today'), offset: 0 },
              { label: t('dailyReport.date.yesterday'), offset: 1 },
              { label: t('dailyReport.date.daysAgo', { count: 2 }), offset: 2 },
              { label: t('dailyReport.date.daysAgo', { count: 3 }), offset: 3 },
            ];
            return dayLabels.map(({ label, offset }) => {
              const d = new Date(today);
              d.setDate(today.getDate() - offset);
              const val = fmtLocal(d);
              return (
                <button
                  key={offset}
                  onClick={() => setSelectedDate(val)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: selectedDate === val ? '2px solid #312E59' : '1px solid #E2E8F0',
                    background: selectedDate === val ? '#312E59' : '#F8FAFC',
                    color: selectedDate === val ? '#fff' : '#475569',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {label}
                </button>
              );
            });
          })()}
        </div>

        <div className="report-form-group" style={{ marginBottom: 20 }}>
          <div className="report-input-wrapper" style={{ display: 'flex', alignItems: 'center', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px' }}>
            <Calendar size={18} color="#64748B" style={{ marginRight: 10 }} />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '1rem', color: '#1E293B' }}
            />
          </div>
        </div>

        <h3 className="card-title" style={{ marginTop: 24 }}>
          <Cloud size={18} /> {t('dailyReport.weather.title')}
        </h3>
        <div className="weather-options">
          {['Cerah', 'Berawan', 'Hujan'].map((w) => (
            <button
              key={w}
              className={`weather-btn ${formData.weather === w ? 'active' : ''}`}
              onClick={() => setFormData({ ...formData, weather: w })}
            >
              {getIcon(w)} {getTranslationValue(w)}
            </button>
          ))}
        </div>
      </Card>

      {/* Materials */}
      <Card className="report-card">
        <h3 className="card-title">
          <Package size={18} /> {t('dailyReport.materials.title')}
        </h3>
        <Input
          placeholder={t('dailyReport.materials.placeholder')}
          value={formData.materials}
          onChangeText={(tVal) => setFormData({ ...formData, materials: tVal })}
          multiline
          numberOfLines={3}
        />
      </Card>

      {/* Workforce */}
      <Card className="report-card">
        <h3 className="card-title">
          <Users size={18} /> {t('dailyReport.workforce.title')}
        </h3>
        <Input
          placeholder={t('dailyReport.workforce.placeholder')}
          value={formData.workforce}
          onChangeText={(tVal) => setFormData({ ...formData, workforce: tVal })}
          multiline
          numberOfLines={3}
        />
      </Card>

      {/* Equipment Usage */}
      {!loadingProject && equipmentData.length > 0 && (
        <Card className="report-card">
          <h3 className="card-title">
            <Wrench size={18} /> {t('dailyReport.equipment.title')}
          </h3>
          <div className="work-items-list">
            {equipmentData.map((tool: any) => (
              <div key={tool._id} className="work-item-row">
                <div className="work-item-info">
                  <span className="work-item-name">{tool.nama}</span>
                  <div className="work-item-meta">
                    <Badge label={tool.kondisi || 'Baik'} variant={tool.kondisi === 'Baik' ? 'primary' : 'neutral'} size="small" />
                    <span className="work-item-detail">{tool.stok || 0} {tool.satuan || 'unit'} · {tool.kategori || '-'}</span>
                    {tool.assignedTo?.fullName && (
                      <span className="work-item-detail">→ {tool.assignedTo.fullName}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Notes */}
      <Card className="report-card">
        <h3 className="card-title">{t('dailyReport.notes.title')}</h3>
        <Input
          placeholder={t('dailyReport.notes.placeholder')}
          value={formData.notes}
          onChangeText={(tVal) => setFormData({ ...formData, notes: tVal })}
          multiline
          numberOfLines={4}
        />
      </Card>

      {/* Photos */}
      <Card className="report-card">
        <h3 className="card-title">
          <Camera size={18} /> {t('dailyReport.photos.title')}
        </h3>
        <div className="photo-upload-grid">
          {photoPreviewUrls.map((url, i) => (
            <div key={i} className="photo-thumbnail">
              <img src={url} alt={`Photo ${i + 1}`} />
              <button className="photo-remove-btn" onClick={() => handleRemovePhoto(i)} title={t('dailyReport.photos.remove')}>
                <X size={14} />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button className="photo-add-btn" onClick={() => fileInputRef.current?.click()}>
              <Plus size={24} />
              <span>{t('dailyReport.photos.add')}</span>
            </button>
          )}
        </div>
        {photos.length >= MAX_PHOTOS && (
          <p className="photo-limit-text">{t('dailyReport.photos.maxReached')}</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleAddPhoto}
          style={{ display: 'none' }}
        />
      </Card>

      {/* Action Buttons */}
      <div className="report-actions">
        <Button
          title={t('dailyReport.actions.exportPdf')}
          icon={FileDown}
          onClick={handleExportPdf}
          loading={exporting}
          variant="secondary"
          size="large"
          style={{ flex: 1 }}
        />
        <Button
          title={t('dailyReport.actions.submit')}
          icon={Save}
          onClick={handleSubmit}
          loading={loading}
          variant="primary"
          size="large"
          style={{ flex: 2 }}
        />
      </div>


    </div>
  );
}
