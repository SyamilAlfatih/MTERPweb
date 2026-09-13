import React, { useState } from 'react';
import { ProjectResource, ResourceType } from '../../types';
import {
  Plus,
  Trash2,
  Users,
  Briefcase,
  Layers,
  DollarSign,
  AlertTriangle,
  Check,
} from 'lucide-react';

interface ResourceSheetViewProps {
  resources: ProjectResource[];
  availableUsers: { _id: string; name: string; role: string }[];
  onAddResource: (newRes: Partial<ProjectResource>) => Promise<void>;
  onUpdateResource: (resourceId: string, updated: Partial<ProjectResource>) => Promise<void>;
  onDeleteResource: (resourceId: string) => Promise<void>;
  onLevelResources?: () => Promise<void>;
}

export const ResourceSheetView: React.FC<ResourceSheetViewProps> = ({
  resources,
  availableUsers,
  onAddResource,
  onUpdateResource,
  onDeleteResource,
  onLevelResources,
}) => {
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<any>('');
  const [isAdding, setIsAdding] = useState(false);
  const [isLeveling, setIsLeveling] = useState(false);

  // New resource state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ResourceType>('Work');
  const [newGroup, setNewGroup] = useState('');
  const [newMaxUnits, setNewMaxUnits] = useState(100);
  const [newStandardRate, setNewStandardRate] = useState(300000);
  const [newMaterialLabel, setNewMaterialLabel] = useState('');

  const handleStartEdit = (resource: ProjectResource, field: string) => {
    setEditingCell({ id: resource._id, field });
    setEditValue((resource as any)[field] || '');
  };

  const handleCommitEdit = async (resourceId: string) => {
    if (!editingCell) return;
    try {
      const field = editingCell.field;
      let val = editValue;
      if (field === 'maxUnits' || field === 'standardRate' || field === 'overtimeRate' || field === 'costPerUse') {
        val = Number(editValue) || 0;
      }
      await onUpdateResource(resourceId, { [field]: val });
    } catch (err) {
      console.error(err);
    } finally {
      setEditingCell(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      alert('Resource name is required.');
      return;
    }
    await onAddResource({
      name: newName.trim(),
      type: newType,
      group: newGroup.trim(),
      maxUnits: Number(newMaxUnits) || 100,
      standardRate: Number(newStandardRate) || 0,
      materialLabel: newMaterialLabel.trim(),
      accrueAt: 'Prorated',
      baseCalendar: 'Standard',
    });

    setNewName('');
    setNewGroup('');
    setNewMaterialLabel('');
    setIsAdding(false);
  };

  const handleLevel = async () => {
    if (!onLevelResources) return;
    if (window.confirm('Run CPM Resource Leveling? This will automatically adjust task delays to resolve overallocations.')) {
      try {
        setIsLeveling(true);
        await onLevelResources();
      } finally {
        setIsLeveling(false);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden select-none">
      {/* View Header & Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-100 border-b border-slate-300 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <h2 className="font-bold text-slate-800 text-sm">Resource Sheet</h2>
          </div>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500">
            Total Resources: <strong>{resources.length}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onLevelResources && (
            <button
              type="button"
              disabled={isLeveling}
              onClick={handleLevel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold text-xs transition-colors shadow-xs"
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

      {/* Add Resource Form Accordion */}
      {isAdding && (
        <div className="p-3 bg-blue-50/50 border-b border-blue-200 text-xs flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Resource Name</label>
            <input
              type="text"
              placeholder="e.g. Mandor Struktur / Semen PCC"
              value={newName}
              onChange={e => setNewName(e.target.value)}
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
              <option value="Work">Work</option>
              <option value="Material">Material</option>
              <option value="Cost">Cost</option>
            </select>
          </div>

          {newType === 'Material' && (
            <div className="w-24">
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Unit / Label</label>
              <input
                type="text"
                placeholder="e.g. sak, m3"
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
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Standard Rate (Rp)</label>
            <input
              type="number"
              min="0"
              value={newStandardRate}
              onChange={e => setNewStandardRate(parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
            />
          </div>

          <div className="flex items-end gap-2 pt-3">
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

      {/* Spreadsheet Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100 text-slate-700 border-b border-slate-300 sticky top-0 z-10 select-none">
            <tr>
              <th className="p-2 w-10 text-center font-bold text-[11px] border-r border-slate-200">ID</th>
              <th className="p-2 font-bold text-[11px] border-r border-slate-200">Resource Name</th>
              <th className="p-2 w-24 font-bold text-[11px] border-r border-slate-200">Type</th>
              <th className="p-2 w-24 font-bold text-[11px] border-r border-slate-200">Material Label</th>
              <th className="p-2 w-20 font-bold text-[11px] border-r border-slate-200 text-center">Initials</th>
              <th className="p-2 w-32 font-bold text-[11px] border-r border-slate-200">Group</th>
              <th className="p-2 w-24 font-bold text-[11px] border-r border-slate-200 text-right">Max Units</th>
              <th className="p-2 w-36 font-bold text-[11px] border-r border-slate-200 text-right">Std. Rate</th>
              <th className="p-2 w-32 font-bold text-[11px] border-r border-slate-200 text-right">Ovt. Rate</th>
              <th className="p-2 w-24 font-bold text-[11px] border-r border-slate-200 text-center">Accrue</th>
              <th className="p-2 w-28 font-bold text-[11px] border-r border-slate-200">Calendar</th>
              <th className="p-2 w-12 text-center"></th>
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
              resources.map((res, idx) => (
                <tr key={res._id} className="hover:bg-blue-50/40 transition-colors">
                  <td className="p-2 text-center font-mono text-slate-400 border-r border-slate-200">
                    {idx + 1}
                  </td>

                  {/* Resource Name */}
                  <td
                    className="p-2 font-medium text-slate-800 border-r border-slate-200"
                    onDoubleClick={() => handleStartEdit(res, 'name')}
                  >
                    {editingCell?.id === res._id && editingCell?.field === 'name' ? (
                      <input
                        type="text"
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => handleCommitEdit(res._id)}
                        onKeyDown={e => e.key === 'Enter' && handleCommitEdit(res._id)}
                        className="w-full px-1 py-0.5 border border-blue-500 rounded text-xs outline-none"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{res.name}</span>
                        {res.isOverallocated && (
                          <span
                            title="Resource is overallocated (> 100% on some days)"
                            className="px-1 py-0.2 rounded bg-rose-100 text-rose-700 font-bold text-[9px]"
                          >
                            Overallocated
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Type */}
                  <td className="p-2 border-r border-slate-200">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        res.type === 'Work'
                          ? 'bg-blue-50 text-blue-700'
                          : res.type === 'Material'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {res.type}
                    </span>
                  </td>

                  {/* Material Label */}
                  <td
                    className="p-2 font-mono text-slate-600 border-r border-slate-200"
                    onDoubleClick={() => handleStartEdit(res, 'materialLabel')}
                  >
                    {res.materialLabel || '-'}
                  </td>

                  {/* Initials */}
                  <td className="p-2 text-center font-mono text-slate-500 border-r border-slate-200">
                    {res.initials || res.name.slice(0, 2).toUpperCase()}
                  </td>

                  {/* Group */}
                  <td
                    className="p-2 text-slate-600 border-r border-slate-200"
                    onDoubleClick={() => handleStartEdit(res, 'group')}
                  >
                    {editingCell?.id === res._id && editingCell?.field === 'group' ? (
                      <input
                        type="text"
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => handleCommitEdit(res._id)}
                        onKeyDown={e => e.key === 'Enter' && handleCommitEdit(res._id)}
                        className="w-full px-1 py-0.5 border border-blue-500 rounded text-xs outline-none"
                      />
                    ) : (
                      res.group || '-'
                    )}
                  </td>

                  {/* Max Units */}
                  <td
                    className="p-2 text-right font-mono border-r border-slate-200"
                    onDoubleClick={() => handleStartEdit(res, 'maxUnits')}
                  >
                    {editingCell?.id === res._id && editingCell?.field === 'maxUnits' ? (
                      <input
                        type="number"
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => handleCommitEdit(res._id)}
                        onKeyDown={e => e.key === 'Enter' && handleCommitEdit(res._id)}
                        className="w-full px-1 py-0.5 border border-blue-500 rounded text-xs outline-none text-right font-mono"
                      />
                    ) : (
                      `${res.maxUnits || 100}%`
                    )}
                  </td>

                  {/* Standard Rate */}
                  <td
                    className="p-2 text-right font-mono border-r border-slate-200 text-slate-700"
                    onDoubleClick={() => handleStartEdit(res, 'standardRate')}
                  >
                    {editingCell?.id === res._id && editingCell?.field === 'standardRate' ? (
                      <input
                        type="number"
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => handleCommitEdit(res._id)}
                        onKeyDown={e => e.key === 'Enter' && handleCommitEdit(res._id)}
                        className="w-full px-1 py-0.5 border border-blue-500 rounded text-xs outline-none text-right font-mono"
                      />
                    ) : (
                      `Rp ${(res.standardRate || 0).toLocaleString('id-ID')}`
                    )}
                  </td>

                  {/* Overtime Rate */}
                  <td className="p-2 text-right font-mono border-r border-slate-200 text-slate-500">
                    {res.overtimeRate ? `Rp ${res.overtimeRate.toLocaleString('id-ID')}` : 'Rp 0'}
                  </td>

                  {/* Accrue At */}
                  <td className="p-2 text-center text-slate-600 border-r border-slate-200">
                    {res.accrueAt || 'Prorated'}
                  </td>

                  {/* Base Calendar */}
                  <td className="p-2 text-slate-600 border-r border-slate-200">
                    {res.baseCalendar || 'Standard'}
                  </td>

                  {/* Actions */}
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete resource "${res.name}"?`)) {
                          onDeleteResource(res._id);
                        }
                      }}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Delete Resource"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
