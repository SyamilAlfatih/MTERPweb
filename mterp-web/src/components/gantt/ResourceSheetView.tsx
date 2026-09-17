import React, { useState, useRef, useCallback } from 'react';
import { ProjectResource, ResourceType } from '../../types';
import {
  Plus,
  Trash2,
  Users,
  Briefcase,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  X,
} from 'lucide-react';

interface ResourceSheetViewProps {
  resources: ProjectResource[];
  availableUsers: { _id: string; name: string; role: string }[];
  onAddResource: (newRes: Partial<ProjectResource>) => Promise<void>;
  onUpdateResource: (resourceId: string, updated: Partial<ProjectResource>) => Promise<void>;
  onDeleteResource: (resourceId: string) => Promise<void>;
  onLevelResources?: () => Promise<void>;
}

type EditingCell = { id: string; field: string } | null;

const ACCRUE_OPTIONS: Array<'Start' | 'Prorated' | 'End'> = ['Start', 'Prorated', 'End'];
const RESOURCE_TYPES: ResourceType[] = ['Work', 'Material', 'Cost'];

function fmtRp(val?: number) {
  return `Rp ${(val || 0).toLocaleString('id-ID')}`;
}

export const ResourceSheetView: React.FC<ResourceSheetViewProps> = ({
  resources,
  availableUsers,
  onAddResource,
  onUpdateResource,
  onDeleteResource,
  onLevelResources,
}) => {
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState<any>('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isLeveling, setIsLeveling] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // New resource form state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ResourceType>('Work');
  const [newGroup, setNewGroup] = useState('');
  const [newMaxUnits, setNewMaxUnits] = useState(100);
  const [newStandardRate, setNewStandardRate] = useState(300000);
  const [newMaterialLabel, setNewMaterialLabel] = useState('');

  const startEdit = useCallback((res: ProjectResource, field: string) => {
    setEditingCell({ id: res._id, field });
    setEditValue((res as any)[field] ?? '');
    // Focus input on next tick
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const commitEdit = useCallback(
    async (resourceId: string) => {
      if (!editingCell || editingCell.id !== resourceId) return;
      const field = editingCell.field;
      let val = editValue;
      // Numeric fields
      if (['maxUnits', 'standardRate', 'overtimeRate', 'costPerUse'].includes(field)) {
        val = parseFloat(String(editValue).replace(/[^0-9.]/g, '')) || 0;
      }
      setEditingCell(null);
      setSavingId(resourceId);
      try {
        await onUpdateResource(resourceId, { [field]: val });
        setSavingId(null);
      } catch (err) {
        console.error('Resource update failed:', err);
        setSavingId(null);
        setErrorId(resourceId);
        setTimeout(() => setErrorId(null), 2500);
      }
    },
    [editingCell, editValue, onUpdateResource]
  );

  const cancelEdit = useCallback(() => setEditingCell(null), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, resourceId: string) => {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(resourceId); }
      if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    },
    [commitEdit, cancelEdit]
  );

  const handleCreate = async () => {
    if (!newName.trim()) { alert('Resource name is required.'); return; }
    await onAddResource({
      name: newName.trim(),
      type: newType,
      group: newGroup.trim() || undefined,
      maxUnits: Number(newMaxUnits) || 100,
      standardRate: Number(newStandardRate) || 0,
      materialLabel: newMaterialLabel.trim() || undefined,
      accrueAt: 'Prorated',
      baseCalendar: 'Standard',
    });
    setNewName(''); setNewGroup(''); setNewMaterialLabel(''); setIsAdding(false);
  };

  const handleLevel = async () => {
    if (!onLevelResources) return;
    if (window.confirm('Run CPM Resource Leveling? This will automatically adjust task delays to resolve overallocations.')) {
      try { setIsLeveling(true); await onLevelResources(); }
      finally { setIsLeveling(false); }
    }
  };

  // ── Inline cell renderers ──────────────────────────────────────────────────

  /** Text cell – double-click to edit */
  const TextCell = ({
    res, field, className = '', placeholder = '—',
  }: { res: ProjectResource; field: string; className?: string; placeholder?: string }) => {
    const isEditing = editingCell?.id === res._id && editingCell?.field === field;
    const val = (res as any)[field];
    if (isEditing) {
      return (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => commitEdit(res._id)}
          onKeyDown={e => handleKeyDown(e, res._id)}
          className={`w-full px-1.5 py-0.5 border border-blue-500 rounded text-xs outline-none bg-blue-50 ${className}`}
        />
      );
    }
    return (
      <span
        className={`block truncate cursor-text hover:bg-blue-50 px-1 py-0.5 rounded transition-colors ${!val ? 'text-slate-400 italic' : ''} ${className}`}
        onDoubleClick={() => startEdit(res, field)}
        title="Double-click to edit"
      >
        {val || placeholder}
      </span>
    );
  };

  /** Number cell – double-click to edit */
  const NumberCell = ({
    res, field, suffix = '', prefix = '',
  }: { res: ProjectResource; field: string; suffix?: string; prefix?: string }) => {
    const isEditing = editingCell?.id === res._id && editingCell?.field === field;
    const raw = (res as any)[field] as number | undefined;
    if (isEditing) {
      return (
        <input
          ref={inputRef}
          type="number"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => commitEdit(res._id)}
          onKeyDown={e => handleKeyDown(e, res._id)}
          className="w-full px-1.5 py-0.5 border border-blue-500 rounded text-xs outline-none text-right font-mono bg-blue-50"
        />
      );
    }
    const display = prefix
      ? `${prefix}${(raw ?? 0).toLocaleString('id-ID')}`
      : `${raw ?? 0}${suffix}`;
    return (
      <span
        className="block text-right font-mono cursor-text hover:bg-blue-50 px-1 py-0.5 rounded transition-colors"
        onDoubleClick={() => startEdit(res, field)}
        title="Double-click to edit"
      >
        {display}
      </span>
    );
  };

  /** Select/dropdown cell */
  const SelectCell = ({
    res, field, options, className = '',
  }: { res: ProjectResource; field: string; options: readonly string[]; className?: string }) => {
    const isEditing = editingCell?.id === res._id && editingCell?.field === field;
    const val = (res as any)[field] as string;
    if (isEditing) {
      return (
        <select
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => commitEdit(res._id)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitEdit(res._id);
            if (e.key === 'Escape') cancelEdit();
          }}
          className="w-full px-1 py-0.5 border border-blue-500 rounded text-xs outline-none bg-blue-50"
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    return (
      <span
        className={`block cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded transition-colors ${className}`}
        onDoubleClick={() => startEdit(res, field)}
        title="Double-click to change"
      >
        {val || options[0]}
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden select-none">
      {/* ── View Header & Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-100 border-b border-slate-300 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <h2 className="font-bold text-slate-800 text-sm">Resource Sheet</h2>
          </div>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500">
            Total: <strong>{resources.length}</strong>
          </span>
          <span className="text-[10px] text-slate-400 italic">
            Double-click any cell to edit
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onLevelResources && (
            <button
              type="button"
              disabled={isLeveling}
              onClick={handleLevel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold text-xs transition-colors shadow-xs disabled:opacity-50"
              title="Automatically resolve worker over-allocations by delaying non-critical tasks"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>{isLeveling ? 'Leveling...' : 'Level Resources'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsAdding(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-xs transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Resource</span>
          </button>
        </div>
      </div>

      {/* ── Add Resource Form ── */}
      {isAdding && (
        <div className="p-3 bg-blue-50/60 border-b border-blue-200 text-xs flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Resource Name *</label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Mandor Struktur / Semen PCC"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
            />
          </div>

          <div className="w-28">
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Type</label>
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as ResourceType)}
              className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
            >
              {RESOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {newType === 'Material' && (
            <div className="w-24">
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Unit / Label</label>
              <input
                type="text"
                placeholder="sak, m3, kg…"
                value={newMaterialLabel}
                onChange={e => setNewMaterialLabel(e.target.value)}
                className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
              />
            </div>
          )}

          <div className="w-32">
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Group / Trade</label>
            <input
              type="text"
              placeholder="e.g. Struktur"
              value={newGroup}
              onChange={e => setNewGroup(e.target.value)}
              className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
            />
          </div>

          <div className="w-24">
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Max Units (%)</label>
            <input
              type="number"
              min="0"
              value={newMaxUnits}
              onChange={e => setNewMaxUnits(parseInt(e.target.value, 10) || 100)}
              className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
            />
          </div>

          <div className="w-36">
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Std. Rate (Rp/day)</label>
            <input
              type="number"
              min="0"
              value={newStandardRate}
              onChange={e => setNewStandardRate(parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
            />
          </div>

          <div className="flex items-end gap-2 pt-3.5">
            <button
              type="button"
              onClick={handleCreate}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs shadow-xs"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Spreadsheet Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100 text-slate-700 border-b border-slate-300 sticky top-0 z-10 select-none">
            <tr>
              <th className="p-2 w-10 text-center font-bold text-[11px] border-r border-slate-200">#</th>
              <th className="p-2 font-bold text-[11px] border-r border-slate-200">Resource Name</th>
              <th className="p-2 w-24 font-bold text-[11px] border-r border-slate-200">Type</th>
              <th className="p-2 w-20 font-bold text-[11px] border-r border-slate-200">Initials</th>
              <th className="p-2 w-24 font-bold text-[11px] border-r border-slate-200">Mat. Label</th>
              <th className="p-2 w-32 font-bold text-[11px] border-r border-slate-200">Group</th>
              <th className="p-2 w-24 font-bold text-[11px] border-r border-slate-200 text-right">Max Units</th>
              <th className="p-2 w-36 font-bold text-[11px] border-r border-slate-200 text-right">Std. Rate</th>
              <th className="p-2 w-36 font-bold text-[11px] border-r border-slate-200 text-right">Ovt. Rate</th>
              <th className="p-2 w-24 font-bold text-[11px] border-r border-slate-200 text-center">Accrue At</th>
              <th className="p-2 w-28 font-bold text-[11px] border-r border-slate-200">Calendar</th>
              <th className="p-2 w-14 text-center font-bold text-[11px]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {resources.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-8 text-center text-slate-400">
                  No resources defined. Click <strong>Add Resource</strong> to register team members or materials.
                </td>
              </tr>
            ) : (
              resources.map((res, idx) => {
                const isSaving = savingId === res._id;
                const hasError = errorId === res._id;
                const rowClass = hasError
                  ? 'bg-rose-50 transition-colors'
                  : isSaving
                  ? 'bg-blue-50/60 transition-colors'
                  : 'hover:bg-slate-50/80 transition-colors';

                return (
                  <tr key={res._id} className={rowClass}>
                    {/* # */}
                    <td className="p-2 text-center font-mono text-slate-400 border-r border-slate-200">
                      {isSaving ? (
                        <span className="inline-block w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      ) : hasError ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 mx-auto" />
                      ) : (
                        idx + 1
                      )}
                    </td>

                    {/* Resource Name */}
                    <td className="p-2 font-medium text-slate-800 border-r border-slate-200">
                      <div className="flex items-center gap-1.5">
                        {res.isOverallocated && (
                          <span title="Overallocated" className="shrink-0 px-1 py-0.5 rounded bg-rose-100 text-rose-700 font-bold text-[9px]">
                            ⚠ Over
                          </span>
                        )}
                        <TextCell res={res} field="name" />
                      </div>
                    </td>

                    {/* Type — dropdown select */}
                    <td className="p-2 border-r border-slate-200">
                      {editingCell?.id === res._id && editingCell?.field === 'type' ? (
                        <select
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => commitEdit(res._id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEdit(res._id);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="w-full px-1 py-0.5 border border-blue-500 rounded text-xs outline-none bg-blue-50"
                        >
                          {RESOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : (
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-opacity hover:opacity-80 ${
                            res.type === 'Work'
                              ? 'bg-blue-50 text-blue-700'
                              : res.type === 'Material'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                          onDoubleClick={() => startEdit(res, 'type')}
                          title="Double-click to change type"
                        >
                          {res.type}
                        </span>
                      )}
                    </td>

                    {/* Initials */}
                    <td className="p-2 text-center border-r border-slate-200">
                      <TextCell res={res} field="initials" placeholder={res.name.slice(0, 2).toUpperCase()} className="text-center font-mono" />
                    </td>

                    {/* Material Label */}
                    <td className="p-2 border-r border-slate-200">
                      <TextCell res={res} field="materialLabel" placeholder="—" className="font-mono" />
                    </td>

                    {/* Group */}
                    <td className="p-2 text-slate-600 border-r border-slate-200">
                      <TextCell res={res} field="group" placeholder="—" />
                    </td>

                    {/* Max Units */}
                    <td className="p-2 text-right border-r border-slate-200">
                      <NumberCell res={res} field="maxUnits" suffix="%" />
                    </td>

                    {/* Standard Rate */}
                    <td className="p-2 text-right border-r border-slate-200 text-slate-700">
                      <NumberCell res={res} field="standardRate" prefix="Rp " />
                    </td>

                    {/* Overtime Rate */}
                    <td className="p-2 text-right border-r border-slate-200 text-slate-500">
                      <NumberCell res={res} field="overtimeRate" prefix="Rp " />
                    </td>

                    {/* Accrue At */}
                    <td className="p-2 text-center border-r border-slate-200">
                      <SelectCell res={res} field="accrueAt" options={ACCRUE_OPTIONS} className="text-center text-slate-600" />
                    </td>

                    {/* Base Calendar */}
                    <td className="p-2 border-r border-slate-200">
                      <TextCell res={res} field="baseCalendar" placeholder="Standard" />
                    </td>

                    {/* Actions */}
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete resource "${res.name}"? This may affect task assignments.`)) {
                            onDeleteResource(res._id);
                          }
                        }}
                        className="text-slate-300 hover:text-rose-600 p-1 transition-colors rounded hover:bg-rose-50"
                        title="Delete Resource"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Legend ── */}
      <div className="px-4 py-1.5 border-t border-slate-200 bg-slate-50 flex items-center gap-4 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><Edit3 className="w-3 h-3" /> Double-click any cell to edit inline</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Enter or click away to save</span>
        <span className="flex items-center gap-1"><X className="w-3 h-3 text-slate-400" /> Escape to cancel</span>
      </div>
    </div>
  );
};
