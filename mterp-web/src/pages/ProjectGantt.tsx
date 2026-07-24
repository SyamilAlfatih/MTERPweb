import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ZoomIn, ZoomOut, Undo2, Redo2, Plus, Trash2,
  Calendar, GanttChart, ChevronDown, ChevronRight, Filter,
  Maximize2, Save, Loader2, X, Link2, AlertTriangle,
} from 'lucide-react';
import gsap from 'gsap';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { LoadingOverlay } from '../components/shared';
import { ProjectData } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { formatDate as formatWIBDate, todayWIB } from '../utils/date';

/* ─── Types ─── */

interface GanttRow {
  id: string;
  _id: string;
  name: string;
  type: 'work' | 'supply';
  startDate: string; // ISO string
  endDate: string;
  duration: number; // calculated days
  progress: number;
  cost: number;
  actualCost: number;
  qty: number;
  unit: string;
  status?: string; // for supplies
  predecessors?: { workItemId: string; type: string; lag: number }[];
  parentId?: string;
}

interface EditingCell {
  rowIdx: number;
  field: string;
}

interface DragState {
  rowIdx: number;
  type: 'move' | 'resize-start' | 'resize-end';
  startX: number;
  originalStart: Date;
  originalEnd: Date;
}

type ZoomLevel = 'day' | 'week' | 'month';
type FilterMode = 'all' | 'work' | 'supply';

/* ─── Helpers ─── */

const formatRupiah = (num: number) => {
  if (num >= 1_000_000_000) return `Rp ${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `Rp ${(num / 1_000_000).toFixed(0)}M`;
  if (num >= 1_000) return `Rp ${(num / 1_000).toFixed(0)}K`;
  return `Rp ${num}`;
};

const fmtDate = (d: string | Date | undefined) => {
  if (!d) return '-';
  return formatWIBDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtDateInput = (d: string | Date | undefined) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().split('T')[0];
};

const daysBetween = (start: string | Date, end: string | Date) => {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
};

const addDays = (d: Date, days: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
};

const UNIT_OPTIONS = ['pcs', 'kg', 'sak', 'btg', 'lbr', 'unit', 'set', 'roll', 'ltr', 'M2', 'M3', 'M1'];

/* ─── Component ─── */

export default function ProjectGantt() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Data state
  const [project, setProject] = useState<ProjectData | null>(null);
  const [rows, setRows] = useState<GanttRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // UI state
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [splitWidth, setSplitWidth] = useState(480);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowIdx: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Advanced UI State (Pro Max)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [colWidths, setColWidths] = useState({ name: 240, date: 100, dur: 60, progress: 110, cost: 110 });
  const [resizingCol, setResizingCol] = useState<{ col: keyof typeof colWidths, startX: number, startWidth: number } | null>(null);

  // Undo/Redo
  const [undoStack, setUndoStack] = useState<GanttRow[][]>([]);
  const [redoStack, setRedoStack] = useState<GanttRow[][]>([]);

  // Refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLDivElement>(null);
  const headerTimelineRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const userRole = user?.role?.toLowerCase() || 'worker';
  const canEdit = ['owner', 'director', 'supervisor', 'asset_admin'].includes(userRole);
  const canSeeFinancials = ['owner', 'director', 'supervisor', 'asset_admin'].includes(userRole);

  /* ─── Data Fetching ─── */

  const fetchData = useCallback(async () => {
    try {
      const [projectRes, suppliesRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/supplies`),
      ]);
      const proj = projectRes.data;
      const supplies = suppliesRes.data || [];
      setProject(proj);

      // Build rows
      const ganttRows: GanttRow[] = [];

      for (const wi of (proj.workItems || [])) {
        const s = wi.startDate || wi.dates?.plannedStart;
        const e = wi.endDate || wi.dates?.plannedEnd;
        ganttRows.push({
          id: `work-${wi._id}`,
          _id: wi._id,
          name: wi.name,
          type: 'work',
          startDate: s || '',
          endDate: e || '',
          duration: s && e ? daysBetween(s, e) : 0,
          progress: wi.progress || 0,
          cost: wi.cost || 0,
          actualCost: wi.actualCost || 0,
          qty: wi.qty || 0,
          unit: wi.unit || wi.volume || 'M2',
          predecessors: wi.predecessors || [],
          parentId: wi.parentId,
        });
      }

      for (const sup of supplies) {
        const s = sup.startDate || sup.deadline;
        const e = sup.endDate || sup.deadline;
        ganttRows.push({
          id: `supply-${sup._id}`,
          _id: sup._id,
          name: sup.item || sup.name,
          type: 'supply',
          startDate: s || '',
          endDate: e || '',
          duration: s && e ? daysBetween(s, e) : 0,
          progress: sup.status === 'Delivered' ? 100 : sup.status === 'Ordered' ? 50 : 0,
          cost: sup.cost || 0,
          actualCost: sup.actualCost || 0,
          qty: sup.qty || 0,
          unit: sup.unit || 'pcs',
          status: sup.status,
        });
      }

      setRows(ganttRows);
    } catch (err) {
      console.error('Failed to fetch project', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Entrance animation
  useEffect(() => {
    if (!loading && containerRef.current) {
      gsap.fromTo(containerRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
    }
  }, [loading]);

  /* ─── Undo/Redo ─── */

  const pushUndo = useCallback((currentRows: GanttRow[]) => {
    setUndoStack(prev => [...prev.slice(-30), currentRows.map(r => ({ ...r }))]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack(r => [...r, rows.map(row => ({ ...row }))]);
      setRows(last);
      return prev.slice(0, -1);
    });
  }, [rows]);

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setUndoStack(u => [...u, rows.map(row => ({ ...row }))]);
      setRows(last);
      return prev.slice(0, -1);
    });
  }, [rows]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if (e.key === 'Escape') { setEditingCell(null); setContextMenu(null); setDeleteConfirm(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  /* ─── Auto-save with debounce ─── */

  const saveRow = useCallback(async (row: GanttRow) => {
    const key = row.id;
    setSaving(prev => ({ ...prev, [key]: true }));

    try {
      if (row.type === 'work') {
        await api.put(`/projects/${id}/work-items/${row._id}`, {
          name: row.name,
          startDate: row.startDate || undefined,
          endDate: row.endDate || undefined,
          progress: row.progress,
          cost: row.cost,
          actualCost: row.actualCost,
          qty: row.qty,
          unit: row.unit,
          predecessors: row.predecessors,
        });
      } else {
        await api.put(`/projects/${id}/supplies/${row._id}`, {
          item: row.name,
          startDate: row.startDate || undefined,
          endDate: row.endDate || undefined,
          cost: row.cost,
          actualCost: row.actualCost,
          qty: row.qty,
          unit: row.unit,
          status: row.status,
        });
      }
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }, [id]);

  const debouncedSave = useCallback((row: GanttRow) => {
    const key = row.id;
    if (saveTimerRef.current[key]) clearTimeout(saveTimerRef.current[key]);
    saveTimerRef.current[key] = setTimeout(() => saveRow(row), 800);
  }, [saveRow]);

  /* ─── Row Update Helper ─── */

  const updateRow = useCallback((idx: number, updates: Partial<GanttRow>) => {
    setRows(prev => {
      const next = [...prev];
      const row = { ...next[idx], ...updates };

      // Recalculate duration
      if (row.startDate && row.endDate) {
        row.duration = daysBetween(row.startDate, row.endDate);
      }

      next[idx] = row;
      return next;
    });
  }, []);

  const commitEdit = useCallback((idx: number, updates: Partial<GanttRow>) => {
    pushUndo(rows);
    const newRows = [...rows];
    const row = { ...newRows[idx], ...updates };
    if (row.startDate && row.endDate) {
      row.duration = daysBetween(row.startDate, row.endDate);
    }
    newRows[idx] = row;
    setRows(newRows);
    debouncedSave(row);
  }, [rows, pushUndo, debouncedSave]);

  /* ─── Add / Delete ─── */

  const addWorkItem = useCallback(async () => {
    if (!project) return;
    const defaultStart = project.startDate || new Date().toISOString();
    const defaultEnd = project.endDate || addDays(new Date(defaultStart), 7).toISOString();

    try {
      const res = await api.post(`/projects/${id}/work-items`, {
        name: 'New Work Item',
        startDate: defaultStart,
        endDate: defaultEnd,
        qty: 1,
        unit: 'M2',
        cost: 0,
      });
      const wi = res.data;
      const newRow: GanttRow = {
        id: `work-${wi._id}`,
        _id: wi._id,
        name: wi.name,
        type: 'work',
        startDate: wi.startDate || '',
        endDate: wi.endDate || '',
        duration: wi.startDate && wi.endDate ? daysBetween(wi.startDate, wi.endDate) : 0,
        progress: 0,
        cost: 0,
        actualCost: 0,
        qty: 1,
        unit: 'M2',
        predecessors: [],
      };
      setRows(prev => [...prev, newRow]);
      // Auto-focus the name cell
      setTimeout(() => {
        setEditingCell({ rowIdx: rows.length, field: 'name' });
      }, 100);
    } catch (err) {
      console.error('Failed to add work item', err);
    }
  }, [project, id, rows.length]);

  const addSubtask = useCallback(async (parentRow: GanttRow) => {
    if (!project) return;
    const defaultStart = parentRow.startDate || project.startDate || new Date().toISOString();
    const defaultEnd = parentRow.endDate || project.endDate || addDays(new Date(defaultStart), 7).toISOString();

    try {
      const res = await api.post(`/projects/${id}/work-items`, {
        name: 'New Subtask',
        startDate: defaultStart,
        endDate: defaultEnd,
        qty: 1,
        unit: 'M2',
        cost: 0,
        parentId: parentRow._id
      });
      const wi = res.data;
      const newRow: GanttRow = {
        id: `work-${wi._id}`,
        _id: wi._id,
        name: wi.name,
        type: 'work',
        startDate: wi.startDate || '',
        endDate: wi.endDate || '',
        duration: wi.startDate && wi.endDate ? daysBetween(wi.startDate, wi.endDate) : 0,
        progress: 0,
        cost: 0,
        actualCost: 0,
        qty: 1,
        unit: 'M2',
        predecessors: [],
        parentId: wi.parentId,
      };
      setExpandedRows(prev => {
        const next = new Set(prev);
        next.add(parentRow.id);
        return next;
      });
      setRows(prev => [...prev, newRow]);
      setTimeout(() => {
        setEditingCell({ rowIdx: rows.length, field: 'name' });
      }, 100);
    } catch (err) {
      console.error('Failed to add subtask', err);
    }
  }, [project, id, rows.length]);

  const addSupply = useCallback(async () => {
    if (!project) return;
    const defaultStart = project.startDate || new Date().toISOString();
    const defaultEnd = project.endDate || addDays(new Date(defaultStart), 7).toISOString();

    try {
      const res = await api.post(`/projects/${id}/supplies`, {
        item: 'New Supply',
        startDate: defaultStart,
        endDate: defaultEnd,
        qty: 1,
        unit: 'pcs',
        cost: 0,
      });
      const sup = res.data;
      const newRow: GanttRow = {
        id: `supply-${sup._id}`,
        _id: sup._id,
        name: sup.item,
        type: 'supply',
        startDate: sup.startDate || '',
        endDate: sup.endDate || '',
        duration: sup.startDate && sup.endDate ? daysBetween(sup.startDate, sup.endDate) : 0,
        progress: 0,
        cost: 0,
        actualCost: 0,
        qty: 1,
        unit: 'pcs',
        status: 'Pending',
      };
      setRows(prev => [...prev, newRow]);
    } catch (err) {
      console.error('Failed to add supply', err);
    }
  }, [project, id]);

  const deleteRow = useCallback(async (idx: number) => {
    const row = rows[idx];
    if (!row) return;

    try {
      if (row.type === 'work') {
        await api.delete(`/projects/${id}/work-items/${row._id}`);
      } else {
        await api.delete(`/projects/${id}/supplies/${row._id}`);
      }
      pushUndo(rows);
      setRows(prev => prev.filter((_, i) => i !== idx));
      setDeleteConfirm(null);
      setContextMenu(null);
    } catch (err) {
      console.error('Failed to delete', err);
    }
  }, [rows, id, pushUndo]);

  /* ─── Timeline Calculations ─── */

  const sortedRows = useMemo(() => {
    let source = rows;
    if (filter !== 'all') source = rows.filter(r => r.type === filter);

    const rootRows = source.filter(r => !r.parentId);
    const result: (GanttRow & { level?: number })[] = [];

    const addChildren = (parentId: string, level: number) => {
      const children = source.filter(r => r.parentId === parentId);
      for (const c of children) {
        result.push({ ...c, level });
        if (expandedRows.has(c.id)) {
          addChildren(c._id, level + 1);
        }
      }
    };

    for (const root of rootRows) {
      result.push({ ...root, level: 0 });
      if (expandedRows.has(root.id)) {
        addChildren(root._id, 1);
      }
    }
    return result;
  }, [rows, filter, expandedRows]);

  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    const allDates = rows
      .filter(r => r.startDate && r.endDate)
      .flatMap(r => [new Date(r.startDate).getTime(), new Date(r.endDate).getTime()]);

    if (allDates.length === 0) {
      const now = new Date();
      return { timelineStart: now, timelineEnd: addDays(now, 30), totalDays: 30 };
    }

    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.max(...allDates));

    // Add padding
    const padDays = zoom === 'day' ? 3 : zoom === 'week' ? 7 : 15;
    const start = addDays(minDate, -padDays);
    const end = addDays(maxDate, padDays);

    return {
      timelineStart: start,
      timelineEnd: end,
      totalDays: Math.max(1, daysBetween(start, end)),
    };
  }, [rows, zoom]);

  // Generate time columns
  const timeColumns = useMemo(() => {
    const cols: { date: Date; label: string; subLabel?: string; width: number }[] = [];
    const cellWidth = zoom === 'day' ? 36 : zoom === 'week' ? 80 : 120;

    if (zoom === 'day') {
      const cur = new Date(timelineStart);
      while (cur <= timelineEnd) {
        cols.push({
          date: new Date(cur),
          label: `${cur.getDate()}`,
          subLabel: cur.getDate() === 1 ? formatWIBDate(cur, { month: 'short', year: '2-digit' }) : undefined,
          width: cellWidth,
        });
        cur.setDate(cur.getDate() + 1);
      }
    } else if (zoom === 'week') {
      const cur = new Date(timelineStart);
      // Align to Monday
      const day = cur.getDay();
      cur.setDate(cur.getDate() - (day === 0 ? 6 : day - 1));
      while (cur <= timelineEnd) {
        const weekEnd = addDays(cur, 6);
        cols.push({
          date: new Date(cur),
          label: `${cur.getDate()}-${weekEnd.getDate()}`,
          subLabel: formatWIBDate(cur, { month: 'short', year: '2-digit' }),
          width: cellWidth,
        });
        cur.setDate(cur.getDate() + 7);
      }
    } else {
      const cur = new Date(timelineStart.getFullYear(), timelineStart.getMonth(), 1);
      while (cur <= timelineEnd) {
        cols.push({
          date: new Date(cur),
          label: formatWIBDate(cur, { month: 'short' }),
          subLabel: `${cur.getFullYear()}`,
          width: cellWidth,
        });
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    return cols;
  }, [timelineStart, timelineEnd, zoom]);

  const timelineWidth = useMemo(() =>
    timeColumns.reduce((s, c) => s + c.width, 0), [timeColumns]);

  // Convert date to pixel position
  const dateToX = useCallback((d: Date | string) => {
    const dt = new Date(d);
    const elapsed = dt.getTime() - timelineStart.getTime();
    const totalMs = timelineEnd.getTime() - timelineStart.getTime();
    return (elapsed / totalMs) * timelineWidth;
  }, [timelineStart, timelineEnd, timelineWidth]);

  // Convert pixel to date
  const xToDate = useCallback((x: number) => {
    const totalMs = timelineEnd.getTime() - timelineStart.getTime();
    const ms = (x / timelineWidth) * totalMs;
    return new Date(timelineStart.getTime() + ms);
  }, [timelineStart, timelineEnd, timelineWidth]);

  // Today position
  const todayX = useMemo(() => {
    const now = new Date();
    if (now < timelineStart || now > timelineEnd) return -1;
    return dateToX(now);
  }, [timelineStart, timelineEnd, dateToX]);

  /* ─── Scroll Sync ─── */

  const handleTimelineScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const sl = e.currentTarget.scrollLeft;
    const st = e.currentTarget.scrollTop;
    if (headerTimelineRef.current) headerTimelineRef.current.scrollLeft = sl;
    if (tableBodyRef.current) tableBodyRef.current.scrollTop = st;
  }, []);

  const handleTableScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    if (timelineRef.current) timelineRef.current.scrollTop = st;
  }, []);

  /* ─── Drag: Split Divider ─── */

  useEffect(() => {
    if (!isDraggingSplit) return;
    const onMove = (e: MouseEvent) => {
      setSplitWidth(Math.max(300, Math.min(e.clientX, window.innerWidth - 300)));
    };
    const onUp = () => setIsDraggingSplit(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [isDraggingSplit]);

  /* ─── Drag: Column Resize ─── */
  useEffect(() => {
    if (!resizingCol) return;
    const onMove = (e: MouseEvent) => {
      const diff = e.clientX - resizingCol.startX;
      setColWidths(prev => ({
        ...prev,
        [resizingCol.col]: Math.max(50, resizingCol.startWidth + diff)
      }));
    };
    const onUp = () => setResizingCol(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [resizingCol]);

  /* ─── Drag: Bar Move/Resize ─── */

  useEffect(() => {
    if (!dragState) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragState.startX;
      const totalMs = timelineEnd.getTime() - timelineStart.getTime();
      const msPerPx = totalMs / timelineWidth;
      const deltaMs = dx * msPerPx;

      const row = rows[dragState.rowIdx];
      if (!row) return;

      if (dragState.type === 'move') {
        const newStart = new Date(dragState.originalStart.getTime() + deltaMs);
        const newEnd = new Date(dragState.originalEnd.getTime() + deltaMs);
        updateRow(dragState.rowIdx, {
          startDate: newStart.toISOString(),
          endDate: newEnd.toISOString(),
        });
      } else if (dragState.type === 'resize-start') {
        const newStart = new Date(dragState.originalStart.getTime() + deltaMs);
        if (newStart < dragState.originalEnd) {
          updateRow(dragState.rowIdx, { startDate: newStart.toISOString() });
        }
      } else if (dragState.type === 'resize-end') {
        const newEnd = new Date(dragState.originalEnd.getTime() + deltaMs);
        if (newEnd > dragState.originalStart) {
          updateRow(dragState.rowIdx, { endDate: newEnd.toISOString() });
        }
      }
    };

    const onUp = () => {
      const row = rows[dragState.rowIdx];
      if (row) {
        pushUndo(rows);
        debouncedSave(row);
      }
      setDragState(null);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = dragState.type === 'move' ? 'grabbing' : 'ew-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragState, rows, timelineStart, timelineEnd, timelineWidth, updateRow, pushUndo, debouncedSave]);

  /* ─── Fit to Screen ─── */

  const fitToScreen = useCallback(() => {
    if (rows.length === 0) return;
    // Just set zoom to month and let the auto-padding handle it
    setZoom('month');
  }, [rows]);

  /* ─── Context Menu ─── */

  const handleContextMenu = useCallback((e: React.MouseEvent, rowIdx: number) => {
    if (!canEdit) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, rowIdx });
  }, [canEdit]);

  // Close context menu on outside click
  useEffect(() => {
    const handler = () => setContextMenu(null);
    if (contextMenu) window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  /* ─── Render Helpers ─── */

  const renderEditableCell = (rowIdx: number, field: string, value: string | number, type: 'text' | 'number' | 'date' | 'select' = 'text', options?: string[]) => {
    const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.field === field;

    if (isEditing && canEdit) {
      if (type === 'select' && options) {
        return (
          <select
            className="gantt-cell-input"
            value={String(value)}
            autoFocus
            onChange={(e) => {
              commitEdit(rowIdx, { [field]: e.target.value } as any);
              setEditingCell(null);
            }}
            onBlur={() => setEditingCell(null)}
          >
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      }

      return (
        <input
          type={type}
          className="gantt-cell-input"
          value={type === 'date' ? fmtDateInput(value as string) : value}
          autoFocus
          onChange={(e) => {
            const val = type === 'number' ? Number(e.target.value) : e.target.value;
            updateRow(rowIdx, { [field]: val } as any);
          }}
          onBlur={() => {
            commitEdit(rowIdx, { [field]: rows[rowIdx]?.[field as keyof GanttRow] } as any);
            setEditingCell(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitEdit(rowIdx, { [field]: rows[rowIdx]?.[field as keyof GanttRow] } as any);
              setEditingCell(null);
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              commitEdit(rowIdx, { [field]: rows[rowIdx]?.[field as keyof GanttRow] } as any);
              // Move to next editable cell
              const fields = ['name', 'startDate', 'endDate', 'progress', 'cost'];
              const curIdx = fields.indexOf(field);
              if (curIdx < fields.length - 1) {
                setEditingCell({ rowIdx, field: fields[curIdx + 1] });
              } else if (rowIdx < rows.length - 1) {
                setEditingCell({ rowIdx: rowIdx + 1, field: fields[0] });
              }
            }
          }}
        />
      );
    }

    return (
      <span
        className={`gantt-cell-value ${canEdit ? 'editable' : ''}`}
        onClick={() => canEdit && setEditingCell({ rowIdx, field })}
        title={String(value)}
      >
        {type === 'date' ? fmtDate(value as string) : type === 'number' ? value : value || '-'}
      </span>
    );
  };

  /* ─── Loading ─── */

  if (loading) return <LoadingOverlay visible={true} />;
  if (!project) return <div className="gantt-error">Project not found</div>;

  const projectName = project.nama || project.name || 'Project';

  return (
    <div className="gantt-page" ref={containerRef}>
      {/* ─── Toolbar ─── */}
      <div className="gantt-toolbar">
        <div className="gantt-toolbar-left">
          <button className="gantt-toolbar-btn back" onClick={() => navigate(`/project/${id}`)}>
            <ArrowLeft size={18} />
          </button>
          <div className="gantt-toolbar-title">
            <GanttChart size={20} />
            <div>
              <h1>{projectName}</h1>
              <span>Gantt Chart</span>
            </div>
          </div>
        </div>

        <div className="gantt-toolbar-center">
          {/* Zoom controls */}
          <div className="gantt-zoom-group">
            <button
              className={`gantt-zoom-btn ${zoom === 'day' ? 'active' : ''}`}
              onClick={() => setZoom('day')}
            >Day</button>
            <button
              className={`gantt-zoom-btn ${zoom === 'week' ? 'active' : ''}`}
              onClick={() => setZoom('week')}
            >Week</button>
            <button
              className={`gantt-zoom-btn ${zoom === 'month' ? 'active' : ''}`}
              onClick={() => setZoom('month')}
            >Month</button>
          </div>

          {/* Filter */}
          <div className="gantt-filter-wrap" style={{ position: 'relative' }}>
            <button className="gantt-toolbar-btn" onClick={() => setShowFilterMenu(!showFilterMenu)}>
              <Filter size={16} />
              <span>{filter === 'all' ? 'All' : filter === 'work' ? 'Work Items' : 'Supplies'}</span>
              <ChevronDown size={14} />
            </button>
            {showFilterMenu && (
              <div className="gantt-dropdown">
                {(['all', 'work', 'supply'] as FilterMode[]).map(f => (
                  <button
                    key={f}
                    className={`gantt-dropdown-item ${filter === f ? 'active' : ''}`}
                    onClick={() => { setFilter(f); setShowFilterMenu(false); }}
                  >
                    {f === 'all' ? 'All Items' : f === 'work' ? 'Work Items Only' : 'Supplies Only'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="gantt-toolbar-btn" onClick={fitToScreen} title="Fit to screen">
            <Maximize2 size={16} />
          </button>
        </div>

        <div className="gantt-toolbar-right">
          {canEdit && (
            <>
              <button className="gantt-toolbar-btn" onClick={undo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)">
                <Undo2 size={16} />
              </button>
              <button className="gantt-toolbar-btn" onClick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)">
                <Redo2 size={16} />
              </button>
            </>
          )}
          <div className="gantt-save-indicator">
            {Object.values(saving).some(Boolean) && (
              <span className="gantt-saving"><Loader2 size={14} className="animate-spin" /> Saving...</span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Main Content (Split Panel) ─── */}
      <div className="gantt-content">
        {/* ─── Left: Task Table ─── */}
        <div className="gantt-table-panel" style={{ width: splitWidth }}>
          <div className="gantt-table-header">
            <div className="gantt-th gantt-th-num">#</div>
            <div className="gantt-th gantt-th-type"></div>
            <div className="gantt-th gantt-th-name" style={{ width: colWidths.name, minWidth: colWidths.name }}>
              Task Name
              <div className={`gantt-col-resizer ${resizingCol?.col === 'name' ? 'is-resizing' : ''}`} onMouseDown={(e) => setResizingCol({ col: 'name', startX: e.clientX, startWidth: colWidths.name })} />
            </div>
            <div className="gantt-th gantt-th-date" style={{ width: colWidths.date, minWidth: colWidths.date }}>
              Start
              <div className={`gantt-col-resizer ${resizingCol?.col === 'date' ? 'is-resizing' : ''}`} onMouseDown={(e) => setResizingCol({ col: 'date', startX: e.clientX, startWidth: colWidths.date })} />
            </div>
            <div className="gantt-th gantt-th-date" style={{ width: colWidths.date, minWidth: colWidths.date }}>
              End
              <div className={`gantt-col-resizer ${resizingCol?.col === 'date' ? 'is-resizing' : ''}`} onMouseDown={(e) => setResizingCol({ col: 'date', startX: e.clientX, startWidth: colWidths.date })} />
            </div>
            <div className="gantt-th gantt-th-dur" style={{ width: colWidths.dur, minWidth: colWidths.dur }}>
              Days
              <div className={`gantt-col-resizer ${resizingCol?.col === 'dur' ? 'is-resizing' : ''}`} onMouseDown={(e) => setResizingCol({ col: 'dur', startX: e.clientX, startWidth: colWidths.dur })} />
            </div>
            <div className="gantt-th gantt-th-progress" style={{ width: colWidths.progress, minWidth: colWidths.progress }}>
              Progress
              <div className={`gantt-col-resizer ${resizingCol?.col === 'progress' ? 'is-resizing' : ''}`} onMouseDown={(e) => setResizingCol({ col: 'progress', startX: e.clientX, startWidth: colWidths.progress })} />
            </div>
            {canSeeFinancials && (
              <div className="gantt-th gantt-th-cost" style={{ width: colWidths.cost, minWidth: colWidths.cost }}>
                Cost
                <div className={`gantt-col-resizer ${resizingCol?.col === 'cost' ? 'is-resizing' : ''}`} onMouseDown={(e) => setResizingCol({ col: 'cost', startX: e.clientX, startWidth: colWidths.cost })} />
              </div>
            )}
          </div>

          {/* Table Body */}
          <div className="gantt-table-body" ref={tableBodyRef} onScroll={handleTableScroll}>
            {sortedRows.map((row, _idx) => {
              const isCritical = row.progress === 0 && row.endDate && new Date(row.endDate) < new Date();
              const rowClass = `gantt-row ${_idx % 2 === 0 ? 'even' : 'odd'} ${isCritical ? 'critical' : ''}`;
              
              // Find original index for editing
              const originalIdx = rows.findIndex(r => r.id === row.id);
              const hasChildren = sortedRows.some(r => r.parentId === row._id);
              const isExpanded = expandedRows.has(row.id);

              return (
                <div
                  key={row.id}
                  className={rowClass}
                  onContextMenu={(e) => handleContextMenu(e, originalIdx)}
                >
                  <div className="gantt-td gantt-td-num">{originalIdx + 1}</div>
                  <div className="gantt-td gantt-td-type">
                    <span className={`gantt-type-dot ${row.type}`} title={row.type === 'work' ? 'Work Item' : 'Supply'} />
                  </div>
                  <div className="gantt-td gantt-td-name" style={{ width: colWidths.name, minWidth: colWidths.name, paddingLeft: 12 + (row.level || 0) * 20 }}>
                    {hasChildren ? (
                      <div className={`gantt-expand-icon ${isExpanded ? 'expanded' : ''}`} onClick={() => {
                        setExpandedRows(prev => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        });
                      }}>
                        <ChevronRight size={14} />
                      </div>
                    ) : (row.level && row.level > 0) ? (
                      <div className="gantt-hierarchy-line" />
                    ) : null}
                    {renderEditableCell(originalIdx, 'name', row.name)}
                    {saving[row.id] && <Loader2 size={12} className="animate-spin gantt-cell-saving" />}
                  </div>
                  <div className="gantt-td gantt-td-date" style={{ width: colWidths.date, minWidth: colWidths.date }}>
                    {renderEditableCell(originalIdx, 'startDate', row.startDate, 'date')}
                  </div>
                  <div className="gantt-td gantt-td-date" style={{ width: colWidths.date, minWidth: colWidths.date }}>
                    {renderEditableCell(originalIdx, 'endDate', row.endDate, 'date')}
                  </div>
                  <div className="gantt-td gantt-td-dur" style={{ width: colWidths.dur, minWidth: colWidths.dur }}>{row.duration || '-'}</div>
                  <div className="gantt-td gantt-td-progress" style={{ width: colWidths.progress, minWidth: colWidths.progress }}>
                    <div className="gantt-progress-cell">
                      <div className="gantt-progress-bar-mini">
                        <div className="gantt-progress-fill-mini" style={{ width: `${row.progress}%` }} />
                      </div>
                      {renderEditableCell(originalIdx, 'progress', row.progress, 'number')}
                    </div>
                  </div>
                  {canSeeFinancials && (
                    <div className="gantt-td gantt-td-cost" style={{ width: colWidths.cost, minWidth: colWidths.cost }}>
                      {renderEditableCell(originalIdx, 'cost', row.cost, 'number')}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add Row */}
            {canEdit && (
              <div className="gantt-add-row">
                <button className="gantt-add-btn" onClick={addWorkItem}>
                  <Plus size={14} /> Work Item
                </button>
                <button className="gantt-add-btn supply" onClick={addSupply}>
                  <Plus size={14} /> Supply
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Split Divider ─── */}
        <div
          className={`gantt-split-divider ${isDraggingSplit ? 'active' : ''}`}
          onMouseDown={() => setIsDraggingSplit(true)}
        />

        {/* ─── Right: Timeline ─── */}
        <div className="gantt-timeline-panel">
          {/* Timeline Header */}
          <div className="gantt-timeline-header" ref={headerTimelineRef}>
            <div className="gantt-timeline-header-inner" style={{ width: timelineWidth }}>
              {/* Sub-labels (year/month) row */}
              <div className="gantt-timeline-sub-row">
                {timeColumns.map((col, i) => (
                  col.subLabel ? (
                    <div key={`sub-${i}`} className="gantt-time-sub" style={{ left: dateToX(col.date), position: 'absolute' }}>
                      {col.subLabel}
                    </div>
                  ) : null
                ))}
              </div>
              {/* Main labels row */}
              <div className="gantt-timeline-main-row">
                {timeColumns.map((col, i) => (
                  <div
                    key={i}
                    className={`gantt-time-cell ${new Date(col.date).toDateString() === new Date().toDateString() ? 'today' : ''}`}
                    style={{ width: col.width }}
                  >
                    {col.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline Body */}
          <div className="gantt-timeline-body" ref={timelineRef} onScroll={handleTimelineScroll}>
            <div className="gantt-timeline-body-inner" style={{ width: timelineWidth }}>
              {/* Grid lines */}
              {timeColumns.map((col, i) => (
                <div
                  key={`grid-${i}`}
                  className="gantt-grid-line"
                  style={{ left: dateToX(col.date) }}
                />
              ))}

              {/* Today marker */}
              {todayX >= 0 && (
                <div className="gantt-today-marker" style={{ left: todayX }}>
                  <div className="gantt-today-diamond" />
                  <div className="gantt-today-line" />
                </div>
              )}

              {/* Dependency lines */}
              {sortedRows.map((row, _idx) => {
                if (!row.predecessors || row.predecessors.length === 0) return null;
                return row.predecessors.map((pred, pi) => {
                  const predRow = sortedRows.find(r => r._id === pred.workItemId);
                  if (!predRow || !predRow.endDate || !row.startDate) return null;
                  const startX = dateToX(predRow.endDate);
                  const endX = dateToX(row.startDate);
                  const startY = sortedRows.indexOf(predRow) * 48 + 24;
                  const endY = _idx * 48 + 24;

                  return (
                    <svg key={`link-${row.id}-${pi}`} className="gantt-dependency-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
                      <path
                        d={`M ${startX} ${startY} C ${startX + 20} ${startY}, ${endX - 20} ${endY}, ${endX} ${endY}`}
                        fill="none"
                        stroke="rgba(79, 70, 229, 0.4)"
                        strokeWidth="1.5"
                      />
                    </svg>
                  );
                });
              })}

              {/* Task Bars */}
              {sortedRows.map((row, idx) => {
                if (!row.startDate || !row.endDate) return (
                  <div key={row.id} className="gantt-bar-row" style={{ height: 48 }} />
                );

                const left = dateToX(row.startDate);
                const right = dateToX(row.endDate);
                const width = Math.max(right - left, 8);
                const isWork = row.type === 'work';
                const isCritical = row.progress === 0 && new Date(row.endDate) < new Date();

                return (
                  <div key={row.id} className="gantt-bar-row" style={{ height: 48 }}>
                    {/* Bar */}
                    <div
                      className={`gantt-bar ${isWork ? 'work' : 'supply'} ${isCritical ? 'critical' : ''} ${dragState?.rowIdx === idx ? 'dragging' : ''}`}
                      style={{ left, width }}
                    >
                      {/* Resize handle: start */}
                      {canEdit && (
                        <div
                          className="gantt-bar-handle start"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              rowIdx: idx,
                              type: 'resize-start',
                              startX: e.clientX,
                              originalStart: new Date(row.startDate),
                              originalEnd: new Date(row.endDate),
                            });
                          }}
                        />
                      )}

                      {/* Bar body (drag to move) */}
                      <div
                        className="gantt-bar-body"
                        onMouseDown={(e) => {
                          if (!canEdit) return;
                          e.stopPropagation();
                          setDragState({
                            rowIdx: idx,
                            type: 'move',
                            startX: e.clientX,
                            originalStart: new Date(row.startDate),
                            originalEnd: new Date(row.endDate),
                          });
                        }}
                      >
                        {/* Progress fill */}
                        <div
                          className="gantt-bar-progress"
                          style={{ width: `${row.progress}%` }}
                        />
                        {/* Label */}
                        {width > 50 && (
                          <span className="gantt-bar-label">
                            {row.progress}%
                          </span>
                        )}
                      </div>

                      {/* Resize handle: end */}
                      {canEdit && (
                        <div
                          className="gantt-bar-handle end"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              rowIdx: idx,
                              type: 'resize-end',
                              startX: e.clientX,
                              originalStart: new Date(row.startDate),
                              originalEnd: new Date(row.endDate),
                            });
                          }}
                        />
                      )}

                      {/* Tooltip */}
                      <div className="gantt-bar-tooltip">
                        <div className="gantt-tooltip-title">
                          <span className={`gantt-type-dot ${row.type}`} />
                          {row.name}
                        </div>
                        <div className="gantt-tooltip-divider" />
                        <div className="gantt-tooltip-row">
                          <span>{fmtDate(row.startDate)} → {fmtDate(row.endDate)}</span>
                        </div>
                        <div className="gantt-tooltip-row">
                          <span>Duration</span>
                          <strong>{row.duration} days</strong>
                        </div>
                        <div className="gantt-tooltip-row">
                          <span>Progress</span>
                          <strong>{row.progress}%</strong>
                        </div>
                        {canSeeFinancials && (
                          <div className="gantt-tooltip-row">
                            <span>Cost</span>
                            <strong>{formatRupiah(row.cost)}</strong>
                          </div>
                        )}
                        {row.status && (
                          <div className="gantt-tooltip-row">
                            <span>Status</span>
                            <strong>{row.status}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Context Menu ─── */}
      {contextMenu && (
        <div className="gantt-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => { addWorkItem(); setContextMenu(null); }}>
            <Plus size={14} /> Add Work Item
          </button>
          <button onClick={() => { addSupply(); setContextMenu(null); }}>
            <Plus size={14} /> Add Supply
          </button>
          <button onClick={() => {
            if (rows[contextMenu.rowIdx].type === 'work') {
              addSubtask(rows[contextMenu.rowIdx]);
            }
            setContextMenu(null);
          }}>
            <Plus size={14} /> Add Subtask
          </button>
          <div className="gantt-context-divider" />
          <button className="danger" onClick={() => { setDeleteConfirm(contextMenu.rowIdx); setContextMenu(null); }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}

      {/* ─── Delete Confirmation ─── */}
      {deleteConfirm !== null && (
        <div className="gantt-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="gantt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gantt-modal-icon">
              <AlertTriangle size={24} />
            </div>
            <h3>Delete {rows[deleteConfirm]?.type === 'work' ? 'Work Item' : 'Supply'}?</h3>
            <p>"{rows[deleteConfirm]?.name}" will be permanently removed.</p>
            <div className="gantt-modal-actions">
              <button className="gantt-modal-btn cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="gantt-modal-btn danger" onClick={() => deleteRow(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
