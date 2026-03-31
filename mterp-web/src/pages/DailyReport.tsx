import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Users, Package, ChevronDown, Layers, ArrowLeft, Truck, Calendar,
  Camera, X, FileDown, Plus, Image as ImageIcon, Wrench
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import api from '../api/api';
import { Card, Button, Input, Alert, Badge, CostInput } from '../components/shared';

interface ProjectOption {
  _id: string;
  nama: string;
  lokasi: string;
  progress: number;
  startDate?: string;
  endDate?: string;
  workItems?: unknown[];
  supplies?: unknown[];
}

interface ProjectData extends ProjectOption {
  workItems?: { cost?: number; actualCost?: number; startDate?: string; endDate?: string; dates?: { plannedStart?: string; plannedEnd?: string } }[];
  supplies?: { cost?: number; actualCost?: number; startDate?: string; endDate?: string; deadline?: string }[];
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



const STATUS_PROGRESS: Record<string, number> = { 'Pending': 0, 'Ordered': 50, 'Delivered': 100 };

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

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(preselectedId || '');
  const [selectedProjectName, setSelectedProjectName] = useState('');
  const [selectedProjectData, setSelectedProjectData] = useState<ProjectData | null>(null);
  const [workItemUpdates, setWorkItemUpdates] = useState<WorkItemUpdate[]>([]);
  const [supplyUpdates, setSupplyUpdates] = useState<SupplyUpdate[]>([]);
  const [equipmentData, setEquipmentData] = useState<{ _id: string; nama?: string; kategori?: string; stok?: number; satuan?: string; kondisi?: string; assignedTo?: { fullName?: string } }[]>([]);
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
          const presentWorkers = attendanceRecords.filter((a: { status?: string }) => 
            a.status === 'Present' || a.status === 'Late' || a.status === 'Half-day'
          );
          
          if (presentWorkers.length > 0) {
            const names = presentWorkers.map((a: { userId?: { fullName?: string } }) => a.userId?.fullName).filter(Boolean);
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
          const lines = materialLogs.map((log: { qtyUsed?: number; supplyId?: { unit?: string; item?: string }; notes?: string }) => 
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
      
      const items: WorkItemUpdate[] = (project.workItems || []).map((item: { _id: string; name: string; qty?: number; unit?: string; volume?: string; cost?: number; progress?: number; actualCost?: number; startDate?: string; endDate?: string }) => ({
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

      const supplies: SupplyUpdate[] = (suppliesData || []).map((s: { _id: string; item: string; qty?: number; unit?: string; cost?: number; status?: string; actualCost?: number; startDate?: string; endDate?: string }) => ({
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
  }, [photoPreviewUrls]);

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

    const start = new Date(globalStart as string);
    const end = new Date(globalEnd as string);
    const months = monthRange(start, end);
    if (months.length === 0) return;

    // For sub-month projects (single month), pad with next month so we get ≥ 2 data points
    if (months.length === 1) {
      const nextMonth = new Date(months[0]);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      months.push(nextMonth);
    }

    interface ScheduleItem { startDate: Date; endDate: Date; plannedCost: number; actualCost: number; }
    const allItems: ScheduleItem[] = [];

    for (const wi of wItems) {
      const s = wi.startDate || wi.dates?.plannedStart;
      const e = wi.endDate || wi.dates?.plannedEnd;
      if (s && e) {
        allItems.push({ startDate: new Date(s as string), endDate: new Date(e as string), plannedCost: wi.cost || 0, actualCost: wi.actualCost || 0 });
      }
    }

    for (const sup of sItems) {
      const s = sup.startDate || sup.deadline;
      const e = sup.endDate || sup.deadline;
      if (s && e) {
        allItems.push({ startDate: new Date(s as string), endDate: new Date(e as string), plannedCost: sup.cost || 0, actualCost: sup.actualCost || 0 });
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

    if (points.length < 1) return;

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
        const rows = equipmentData.map((tool: { nama?: string; kategori?: string; stok?: number; satuan?: string; kondisi?: string }, i: number) => [
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
    <div className="p-3 sm:p-4 lg:p-6 max-w-[700px] mx-auto pb-24">
      {/* Alert */}
      <Alert
        visible={alertData.visible}
        type={alertData.type}
        title={alertData.title}
        message={alertData.message}
        onClose={() => setAlertData(prev => ({ ...prev, visible: false }))}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-8">
        <div className="flex items-center gap-3">
          <button 
            className="w-12 h-12 rounded-xl bg-bg-secondary flex items-center justify-center cursor-pointer transition-all border-none text-text-primary hover:bg-border active:scale-95 shrink-0" 
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-text-primary m-0 tracking-tight uppercase">{t('dailyReport.title')}</h1>
            <span className="text-xs font-bold text-text-muted uppercase tracking-widest">
              {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* Project Selector - Prominent for Site Workers */}
      <Section title={t('dailyReport.projectSelector.title')} icon={Layers}>
        <div className="relative">
          <select
            className="w-full py-4 pr-10 pl-4 border-2 border-border-light rounded-xl bg-bg-white text-text-primary text-lg font-bold cursor-pointer appearance-none transition-all outline-none focus:border-primary shadow-sm"
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
          <ChevronDown size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
        {selectedProjectName && (
          <div className="flex items-center gap-4 mt-4 p-4 bg-primary-bg rounded-xl border-2 border-primary/20">
            <div className="flex-1">
              <span className="block text-xs font-bold text-primary uppercase mb-1">Active Project Site</span>
              <span className="text-base font-black text-primary">{selectedProjectName}</span>
            </div>
            <div className="text-right">
              <span className="block text-xs font-bold text-primary uppercase mb-1">Current Progress</span>
              <span className="text-xl font-black text-primary">{computedProgress}%</span>
            </div>
          </div>
        )}
      </Section>

      {/* Loading State */}
      {loadingProject && (
        <div className="py-12 text-center text-text-muted">
          <Loader size={32} className="animate-spin mx-auto mb-4" />
          <p className="font-bold uppercase tracking-wider">{t('dailyReport.loadingProject')}</p>
        </div>
      )}

      {/* Work Item Updates - CARD BASED FOR FIELD WORK */}
      {!loadingProject && workItemUpdates.length > 0 && (
        <Section title="Pekerjaan / Work Items" icon={Layers}>
          <div className="grid grid-cols-1 gap-4">
            {workItemUpdates.map((item, i) => (
              <Card key={item.workItemId} className="!p-5 border-2 border-border-light hover:border-primary transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-text-primary m-0">{item.name}</h4>
                    <p className="text-xs text-text-muted m-0">Target Qty: {item.qty} {item.unit}</p>
                  </div>
                  <Badge label={`${item.newProgress}%`} variant={item.newProgress === 100 ? 'success' : 'primary'} />
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase mb-2">Update Progress (%)</label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={item.newProgress}
                        onChange={(e) => updateItemProgress(i, Number(e.target.value))}
                        className="flex-1 h-3 bg-bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <input 
                        type="number"
                        value={item.newProgress}
                        onChange={(e) => updateItemProgress(i, Number(e.target.value))}
                        className="w-16 p-2 rounded-lg border-2 border-border-light text-center font-black text-primary focus:border-primary outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <CostInput
                      label="ACTUAL COST IMPACT"
                      value={item.actualCost}
                      onChange={(val) => updateItemActualCost(i, val)}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* Supply Updates - CARD BASED */}
      {!loadingProject && supplyUpdates.length > 0 && (
        <Section title="Material & Logistik / Supplies" icon={Truck}>
          <div className="grid grid-cols-1 gap-4">
            {supplyUpdates.map((item, i) => (
              <Card key={item.supplyId} className="!p-5 border-2 border-border-light hover:border-primary transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-text-primary m-0">{item.item}</h4>
                    <p className="text-xs text-text-muted m-0">Planning Qty: {item.qty} {item.unit}</p>
                  </div>
                  <Badge 
                    label={item.newStatus} 
                    variant={item.newStatus === 'Delivered' ? 'success' : item.newStatus === 'Ordered' ? 'primary' : 'neutral'} 
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase mb-2">Update Status</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['Pending', 'Ordered', 'Delivered'].map((status) => (
                        <button
                          key={status}
                          onClick={() => updateSupplyStatus(i, status)}
                          className={`py-3 rounded-lg text-xs font-bold border-2 transition-all ${
                            item.newStatus === status 
                              ? 'bg-primary border-primary text-white' 
                              : 'bg-bg-white border-border-light text-text-secondary hover:border-primary/50'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <CostInput
                      label="ACTUAL PROCUREMENT COST"
                      value={item.actualCost}
                      onChange={(val) => updateSupplyActualCost(i, val)}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* Equipment Usage */}
      {!loadingProject && equipmentData.length > 0 && (
        <Section title={t('dailyReport.equipment.title')} icon={Wrench}>
          <div className="grid grid-cols-1 gap-3">
            {equipmentData.map((tool: { _id: string; nama?: string; kondisi?: string; stok?: number; satuan?: string; assignedTo?: { fullName?: string } }) => (
              <div key={tool._id} className="p-4 border-2 border-border-light rounded-xl bg-bg-white flex justify-between items-center shadow-sm">
                <div>
                  <h4 className="text-base font-black text-text-primary m-0 uppercase tracking-tight">{tool.nama}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge label={tool.kondisi || 'Baik'} variant={tool.kondisi === 'Baik' ? 'success' : 'neutral'} size="small" />
                    <span className="text-xs font-bold text-text-muted">{tool.stok || 0} {tool.satuan || 'unit'}</span>
                  </div>
                </div>
                {tool.assignedTo?.fullName && (
                  <div className="text-right">
                    <span className="block text-[10px] font-bold text-text-muted uppercase">PIC</span>
                    <span className="text-xs font-black text-primary">{tool.assignedTo.fullName}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Report Basics: Date & Weather */}
      <Section title="Detail Laporan" icon={Calendar}>
        <div className="space-y-6">
          <Card className="!p-5 border-2 border-border-light">
            <label className="block text-xs font-bold text-text-muted uppercase mb-3">{t('dailyReport.date.title')}</label>
            <div className="flex items-center bg-bg-secondary rounded-xl px-4 py-3 border-2 border-transparent focus-within:border-primary transition-all">
              <Calendar size={20} className="text-text-muted mr-3" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border-none bg-transparent outline-none w-full text-base font-black text-text-primary uppercase tracking-wider"
              />
            </div>
            <p className="mt-2 text-[10px] font-medium text-text-muted px-1">{t('dailyReport.date.hint')}</p>
          </Card>

          <Card className="!p-5 border-2 border-border-light">
            <label className="block text-xs font-bold text-text-muted uppercase mb-3">{t('dailyReport.weather.title')}</label>
            <div className="grid grid-cols-3 gap-2">
              {['Cerah', 'Berawan', 'Hujan'].map((w) => (
                <button
                  key={w}
                  className={`py-4 border-2 rounded-xl text-xs font-black uppercase transition-all flex flex-col items-center gap-2 ${
                    formData.weather === w 
                      ? 'bg-primary border-primary text-white shadow-md' 
                      : 'border-border-light bg-bg-white text-text-secondary hover:border-primary/50'
                  }`}
                  onClick={() => setFormData({ ...formData, weather: w })}
                >
                  <span className="text-2xl">{getIcon(w)}</span>
                  {getTranslationValue(w)}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </Section>

      {/* Materials & Workforce */}
      <div className="grid grid-cols-1 gap-6 mb-8">
        <Section title={t('dailyReport.materials.title')} icon={Package}>
          <Input
            placeholder={t('dailyReport.materials.placeholder')}
            value={formData.materials}
            onChangeText={(tVal) => setFormData({ ...formData, materials: tVal })}
            multiline
            numberOfLines={4}
            className="!rounded-xl border-2 border-border-light focus:border-primary !p-4 !text-base"
          />
        </Section>

        <Section title={t('dailyReport.workforce.title')} icon={Users}>
          <Input
            placeholder={t('dailyReport.workforce.placeholder')}
            value={formData.workforce}
            onChangeText={(tVal) => setFormData({ ...formData, workforce: tVal })}
            multiline
            numberOfLines={4}
            className="!rounded-xl border-2 border-border-light focus:border-primary !p-4 !text-base"
          />
        </Section>

        <Section title={t('dailyReport.notes.title')} icon={ImageIcon}>
          <Input
            placeholder={t('dailyReport.notes.placeholder')}
            value={formData.notes}
            onChangeText={(tVal) => setFormData({ ...formData, notes: tVal })}
            multiline
            numberOfLines={4}
            className="!rounded-xl border-2 border-border-light focus:border-primary !p-4 !text-base"
          />
        </Section>
      </div>

      {/* Photos */}
      <Section title={t('dailyReport.photos.title')} icon={Camera}>
        <div className="grid grid-cols-3 gap-3">
          {photoPreviewUrls.map((url, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden border-2 border-border-light group">
              <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              <button 
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center border-none shadow-lg active:scale-90" 
                onClick={() => handleRemovePhoto(i)}
              >
                <X size={18} />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button 
              className="aspect-square border-2 border-dashed border-border-light rounded-xl bg-bg-secondary text-text-muted flex flex-col items-center justify-center gap-2 hover:border-primary hover:text-primary transition-all active:scale-95" 
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus size={32} />
              <span className="text-[10px] font-black uppercase tracking-wider">{t('dailyReport.photos.add')}</span>
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleAddPhoto} style={{ display: 'none' }} />
      </Section>

      {/* Action Buttons - Sticky Bottom for easy access on site */}
      <div className="sticky bottom-4 left-0 right-0 px-2 sm:px-0 z-40 mt-12">
        <div className="bg-bg-white/80 backdrop-blur-xl p-3 rounded-2xl border-2 border-border-light shadow-2xl flex gap-3">
          <Button
            className="flex-1 !h-16 !rounded-xl !text-xl !font-black uppercase tracking-widest shadow-lg shadow-primary/20"
            variant="primary"
            title={loading ? t('dailyReport.actions.submitting') : t('dailyReport.actions.submit')}
            onClick={handleSubmit}
            disabled={loading || !selectedProjectId}
          />
          <Button
            className="!w-16 !h-16 !rounded-xl p-0 flex items-center justify-center border-2 border-border-light bg-bg-white text-text-primary hover:border-primary transition-all active:scale-95"
            variant="secondary"
            title=""
            icon={FileDown}
            onClick={handleExportPdf}
            disabled={exporting || !selectedProjectId}
            loading={exporting}
          />
        </div>
      </div>

      {/* S-Curve Canvas (Hidden for PDF generation) */}
      <canvas ref={scurveCanvasRef} style={{ display: 'none' }} width={1400} height={560} />
    </div>
  );
}

{/* Field-Ready Section Wrapper */}
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="mb-10 last:mb-0">
      <div className="flex items-center gap-3 mb-4 px-1">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon size={22} strokeWidth={2.5} />
        </div>
        <h3 className="text-xl font-black text-text-primary tracking-tight uppercase m-0 leading-none">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Loader({ size, className }: { size: number; className?: string }) {
  return <Wrench size={size} className={className} />;
}
