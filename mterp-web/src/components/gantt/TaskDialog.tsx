import React, { useState, useEffect } from 'react';
import { ProjectTask, TaskPredecessor, DependencyType } from '../../types';
import CostInput from '../shared/CostInput';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  Link,
  Users,
  Settings,
  FileText,
} from 'lucide-react';

interface TaskDialogProps {
  task: ProjectTask | null;
  allTasks: ProjectTask[];
  availableUsers?: { _id: string; name: string; role: string }[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskId: string, updatedData: Partial<ProjectTask>) => void;
  onDelete?: (taskId: string) => void;
}

type DialogTab = 'general' | 'predecessors' | 'resources' | 'advanced' | 'notes';

export const TaskDialog: React.FC<TaskDialogProps> = ({
  task,
  allTasks,
  availableUsers = [],
  isOpen,
  onClose,
  onSave,
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState<DialogTab>('general');

  // Form state
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(1);
  const [isMilestone, setIsMilestone] = useState(false);
  const [percentComplete, setPercentComplete] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [finishDate, setFinishDate] = useState('');
  const [priority, setPriority] = useState(500);
  const [barColor, setBarColor] = useState('');
  const [predecessors, setPredecessors] = useState<TaskPredecessor[]>([]);
  const [assignedResources, setAssignedResources] = useState<{ userId: string; units: number; costRate: number }[]>([]);
  const [constraintType, setConstraintType] = useState<string>('ASAP');
  const [constraintDate, setConstraintDate] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [taskType, setTaskType] = useState<'FixedUnits' | 'FixedDuration' | 'FixedWork'>('FixedUnits');
  const [isEffortDriven, setIsEffortDriven] = useState<boolean>(true);
  const [levelingDelay, setLevelingDelay] = useState<number>(0);
  const [plannedCost, setPlannedCost] = useState(0);
  const [actualCost, setActualCost] = useState(0);
  const [plannedWork, setPlannedWork] = useState(0);
  const [actualWork, setActualWork] = useState(0);
  const [notes, setNotes] = useState('');

  // Unified WBS / RAB fields
  const [itemType, setItemType] = useState<'summary' | 'work' | 'supply' | 'milestone'>('work');
  const [category, setCategory] = useState<'general' | 'material' | 'labor' | 'equipment' | 'subcontractor' | 'overhead'>('general');
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<string>('ls');
  const [unitRate, setUnitRate] = useState<number>(0);

  useEffect(() => {
    if (task) {
      setName(task.name || '');
      setDuration(task.duration || 1);
      setIsMilestone(Boolean(task.isMilestone));
      setPercentComplete(task.percentComplete || 0);
      setStartDate(task.startDate ? task.startDate.slice(0, 10) : '');
      setFinishDate(task.finishDate ? task.finishDate.slice(0, 10) : '');
      setPriority(task.priority || 500);
      setBarColor(task.barColor || '');
      setPredecessors(
        (task.predecessors || []).map(p => ({
          taskId: typeof p.taskId === 'string' ? p.taskId : p.taskId?._id,
          type: p.type || 'FS',
          lagDays: p.lagDays || 0,
        }))
      );
      setAssignedResources(
        (task.assignedResources || []).map(r => ({
          userId: typeof r.userId === 'string' ? r.userId : r.userId?._id,
          units: r.units || 100,
          costRate: r.costRate || 0,
        }))
      );
      setConstraintType(task.constraintType || 'ASAP');
      setConstraintDate(task.constraintDate ? task.constraintDate.slice(0, 10) : '');
      setDeadlineDate(task.deadlineDate ? task.deadlineDate.slice(0, 10) : '');
      setTaskType(task.taskType || 'FixedUnits');
      setIsEffortDriven(task.isEffortDriven !== undefined ? task.isEffortDriven : true);
      setLevelingDelay(task.levelingDelay || 0);
      setPlannedCost(task.plannedCost || 0);
      setActualCost(task.actualCost || 0);
      setPlannedWork(task.plannedWork || 0);
      setActualWork(task.actualWork || 0);
      setNotes(task.notes || '');
      setItemType(task.itemType || (task.isSummary ? 'summary' : 'work'));
      setCategory(task.category || (task.itemType === 'supply' ? 'material' : 'general'));
      setQuantity(task.quantity || 1);
      setUnit(task.unit || 'ls');
      setUnitRate(task.unitRate || 0);
      setActiveTab('general');
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const handleSave = () => {
    onSave(task._id, {
      name: name.trim() || 'Untitled Task',
      duration: isMilestone ? 0 : Math.max(0, Number(duration)),
      isMilestone,
      percentComplete: Math.min(100, Math.max(0, Number(percentComplete))),
      startDate: startDate || undefined,
      finishDate: finishDate || undefined,
      priority: Number(priority),
      barColor,
      predecessors,
      assignedResources: assignedResources as any,
      constraintType: constraintType as any,
      constraintDate: constraintDate || null,
      deadlineDate: deadlineDate || null,
      taskType,
      isEffortDriven,
      levelingDelay: Number(levelingDelay) || 0,
      plannedCost: Number(plannedCost) || (Number(quantity) * Number(unitRate)),
      actualCost: Number(actualCost),
      plannedWork: Number(plannedWork),
      actualWork: Number(actualWork),
      itemType,
      category,
      quantity: Number(quantity) || 1,
      unit: unit || 'ls',
      unitRate: Number(unitRate) || 0,
      totalBudget: Number(quantity) * Number(unitRate),
      isSummary: itemType === 'summary' || task.isSummary,
      notes,
    });
    onClose();
  };

  const addPredecessor = () => {
    // Pick first candidate task that is not this task
    const candidate = allTasks.find(t => t._id !== task._id);
    if (!candidate) return;
    setPredecessors(prev => [...prev, { taskId: candidate._id, type: 'FS', lagDays: 0 }]);
  };

  const removePredecessor = (index: number) => {
    setPredecessors(prev => prev.filter((_, i) => i !== index));
  };

  const updatePredecessor = (index: number, key: keyof TaskPredecessor, val: any) => {
    setPredecessors(prev =>
      prev.map((item, i) => (i === index ? { ...item, [key]: val } : item))
    );
  };

  const addResource = () => {
    if (availableUsers.length === 0) return;
    setAssignedResources(prev => [...prev, { userId: availableUsers[0]._id, units: 100, costRate: 0 }]);
  };

  const removeResource = (index: number) => {
    setAssignedResources(prev => prev.filter((_, i) => i !== index));
  };

  const updateResource = (index: number, key: string, val: any) => {
    setAssignedResources(prev =>
      prev.map((item, i) => (i === index ? { ...item, [key]: val } : item))
    );
  };

  const otherTasks = allTasks.filter(t => t._id !== task._id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-300 flex flex-col max-h-[90vh]">
        {/* Modal Header (MS Project Style) */}
        <div className="bg-slate-800 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold tracking-wide">Task Information</h2>
            <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded font-mono">
              WBS: {task.wbsCode || '-'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ribbon Tab Bar */}
        <div className="flex border-b border-slate-200 bg-slate-100 px-4 pt-2 gap-1 text-xs font-semibold">
          {[
            { id: 'general', label: 'General', icon: Calendar },
            { id: 'predecessors', label: 'Predecessors', icon: Link },
            { id: 'resources', label: 'Resources', icon: Users },
            { id: 'advanced', label: 'Advanced', icon: Settings },
            { id: 'notes', label: 'Notes', icon: FileText },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as DialogTab)}
                className={`flex items-center gap-1.5 px-3 py-2 border-t-2 transition-all rounded-t ${
                  isActive
                    ? 'bg-white border-blue-600 text-blue-700 shadow-sm'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 text-xs space-y-4">
          {/* GENERAL TAB */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Name:</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tipe Item WBS / RAB:</label>
                  <select
                    value={itemType}
                    onChange={e => {
                      const val = e.target.value as any;
                      setItemType(val);
                      if (val === 'supply') setCategory('material');
                      if (val === 'work') setCategory('labor');
                    }}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-blue-500 font-semibold"
                  >
                    <option value="summary">📁 Paket Pekerjaan (Summary Task)</option>
                    <option value="work">🔨 Item Pekerjaan (Upah / Jasa / Alat)</option>
                    <option value="supply">📦 Item Pengadaan (Material / Bahan)</option>
                    <option value="milestone">💎 Milestone</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kategori RAB:</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="labor">Tenaga / Upah HOK</option>
                    <option value="material">Bahan / Material</option>
                    <option value="equipment">Peralatan</option>
                    <option value="subcontractor">Subkontraktor</option>
                    <option value="overhead">Overhead / Umum</option>
                    <option value="general">Umum</option>
                  </select>
                </div>
              </div>

              {/* Physical Quantities & Unit Rates */}
              {itemType !== 'summary' && itemType !== 'milestone' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div className="font-semibold text-slate-700 text-xs flex items-center justify-between">
                    <span>Kuantitas Volume & Tarif Satuan RAB</span>
                    <span className="text-[11px] font-mono text-primary font-bold">
                      Plafon: Rp {(Number(quantity || 0) * Number(unitRate || 0)).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Kuantitas / Volume:</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={quantity}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          setQuantity(val);
                          setPlannedCost(val * unitRate);
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono text-right"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Satuan Ukur:</label>
                      <input
                        type="text"
                        placeholder="m2, m3, zak, pcs"
                        value={unit}
                        onChange={e => setUnit(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Tarif Satuan (Rp):</label>
                      <CostInput
                        compact
                        prefix="Rp"
                        value={unitRate}
                        onChange={val => {
                          setUnitRate(val);
                          setPlannedCost(quantity * val);
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Duration (days):</label>
                  <input
                    type="number"
                    min="0"
                    disabled={isMilestone || task.isSummary || itemType === 'summary'}
                    value={duration}
                    onChange={e => setDuration(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs disabled:bg-slate-100"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isMilestoneChk"
                      checked={isMilestone}
                      disabled={task.isSummary}
                      onChange={e => setIsMilestone(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="isMilestoneChk" className="text-slate-600 cursor-pointer">
                      Mark task as milestone (0 duration)
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">% Complete:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={percentComplete}
                      onChange={e => setPercentComplete(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                      className="w-20 px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                    />
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={percentComplete}
                      onChange={e => setPercentComplete(parseInt(e.target.value, 10))}
                      className="flex-1 accent-blue-600"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Start Date:</label>
                  <input
                    type="date"
                    value={startDate}
                    disabled={task.isSummary}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs disabled:bg-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Finish Date:</label>
                  <input
                    type="date"
                    value={finishDate}
                    disabled={task.isSummary}
                    onChange={e => setFinishDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs disabled:bg-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Priority (0 - 1000):</label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={priority}
                    onChange={e => setPriority(parseInt(e.target.value, 10) || 500)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Custom Bar Color:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={barColor || '#2563eb'}
                      onChange={e => setBarColor(e.target.value)}
                      className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0"
                    />
                    {barColor && (
                      <button
                        type="button"
                        onClick={() => setBarColor('')}
                        className="text-[11px] text-slate-500 hover:text-red-500"
                      >
                        Reset default
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PREDECESSORS TAB */}
          {activeTab === 'predecessors' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-slate-600">Tasks that must finish or start before this task:</p>
                <button
                  type="button"
                  onClick={addPredecessor}
                  className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Predecessor
                </button>
              </div>

              {predecessors.length === 0 ? (
                <div className="py-8 text-center text-slate-400 bg-slate-50 rounded border border-dashed border-slate-200">
                  No predecessor links configured.
                </div>
              ) : (
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="p-2 font-semibold">Predecessor Task</th>
                        <th className="p-2 font-semibold w-28">Type</th>
                        <th className="p-2 font-semibold w-24">Lag (days)</th>
                        <th className="p-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {predecessors.map((p, idx) => (
                        <tr key={idx}>
                          <td className="p-2">
                            <select
                              value={typeof p.taskId === 'string' ? p.taskId : p.taskId?._id}
                              onChange={e => updatePredecessor(idx, 'taskId', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                            >
                              {otherTasks.map(t => (
                                <option key={t._id} value={t._id}>
                                  {t.sortOrder + 1}. {t.name} (WBS: {t.wbsCode})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <select
                              value={p.type}
                              onChange={e => updatePredecessor(idx, 'type', e.target.value as DependencyType)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                            >
                              <option value="FS">FS (Finish-to-Start)</option>
                              <option value="SS">SS (Start-to-Start)</option>
                              <option value="FF">FF (Finish-to-Finish)</option>
                              <option value="SF">SF (Start-to-Finish)</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={p.lagDays}
                              onChange={e => updatePredecessor(idx, 'lagDays', parseInt(e.target.value, 10) || 0)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removePredecessor(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* RESOURCES TAB */}
          {activeTab === 'resources' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-slate-600">Assign project team members to this task:</p>
                <button
                  type="button"
                  onClick={addResource}
                  disabled={availableUsers.length === 0}
                  className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs transition-colors disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" /> Assign Resource
                </button>
              </div>

              {assignedResources.length === 0 ? (
                <div className="py-8 text-center text-slate-400 bg-slate-50 rounded border border-dashed border-slate-200">
                  No resources assigned.
                </div>
              ) : (
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="p-2 font-semibold">User</th>
                        <th className="p-2 font-semibold w-24">Units %</th>
                        <th className="p-2 font-semibold w-32">Rate (Rp/day)</th>
                        <th className="p-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {assignedResources.map((res, idx) => (
                        <tr key={idx}>
                          <td className="p-2">
                            <select
                              value={res.userId}
                              onChange={e => updateResource(idx, 'userId', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                            >
                              {availableUsers.map(u => (
                                <option key={u._id} value={u._id}>
                                  {u.name} ({u.role})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={res.units}
                              onChange={e => updateResource(idx, 'units', parseInt(e.target.value, 10) || 100)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                            />
                          </td>
                          <td className="p-2">
                            <CostInput
                              compact
                              prefix="Rp"
                              value={res.costRate}
                              onChange={val => updateResource(idx, 'costRate', val)}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeResource(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ADVANCED TAB */}
          {activeTab === 'advanced' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Constraint Type:</label>
                  <select
                    value={constraintType}
                    onChange={e => setConstraintType(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                  >
                    <option value="ASAP">As Soon As Possible (ASAP)</option>
                    <option value="ALAP">As Late As Possible (ALAP)</option>
                    <option value="MSO">Must Start On (MSO)</option>
                    <option value="MFO">Must Finish On (MFO)</option>
                    <option value="SNET">Start No Earlier Than (SNET)</option>
                    <option value="SNLT">Start No Later Than (SNLT)</option>
                    <option value="FNET">Finish No Earlier Than (FNET)</option>
                    <option value="FNLT">Finish No Later Than (FNLT)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Constraint Date:</label>
                  <input
                    type="date"
                    value={constraintDate}
                    onChange={e => setConstraintDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Deadline Date:</label>
                  <input
                    type="date"
                    value={deadlineDate}
                    onChange={e => setDeadlineDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Leveling Delay (Days):</label>
                  <input
                    type="number"
                    min="0"
                    value={levelingDelay}
                    onChange={e => setLevelingDelay(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
              </div>

              {/* Task Type & Effort-Driven Scheduling */}
              <div className="border-t border-slate-200 pt-3 grid grid-cols-2 gap-4 items-center">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Task Type:</label>
                  <select
                    value={taskType}
                    onChange={e => setTaskType(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                  >
                    <option value="FixedUnits">Fixed Units (Duration = Work / Units)</option>
                    <option value="FixedDuration">Fixed Duration (Constant Duration)</option>
                    <option value="FixedWork">Fixed Work (Total Work Constant)</option>
                  </select>
                </div>

                <div className="pt-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={isEffortDriven}
                      onChange={e => setIsEffortDriven(e.target.checked)}
                      className="rounded text-blue-600 w-4 h-4"
                    />
                    <span>Effort-driven scheduling</span>
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5 ml-6">
                    Assigning more resources decreases duration proportionally.
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 grid grid-cols-2 gap-4">
                <div>
                  <CostInput
                    label="Planned Cost (Rp)"
                    prefix="Rp"
                    value={plannedCost}
                    onChange={val => setPlannedCost(val)}
                  />
                </div>

                <div>
                  <CostInput
                    label="Actual Cost (Rp)"
                    prefix="Rp"
                    value={actualCost}
                    onChange={val => setActualCost(val)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Planned Work (Hours):</label>
                  <input
                    type="number"
                    min="0"
                    value={plannedWork}
                    onChange={e => setPlannedWork(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Actual Work (Hours):</label>
                  <input
                    type="number"
                    min="0"
                    value={actualWork}
                    onChange={e => setActualWork(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* NOTES TAB */}
          {activeTab === 'notes' && (
            <div>
              <label className="block font-medium text-slate-700 mb-1">Detailed Notes / Specifications:</label>
              <textarea
                rows={8}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Enter notes, site specifications, or instructions regarding this task..."
                className="w-full p-3 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between">
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Are you sure you want to delete "${task.name}"?`)) {
                  onDelete(task._id);
                  onClose();
                }
              }}
              className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-1.5 rounded hover:bg-rose-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Task
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 border border-slate-300 rounded text-xs text-slate-700 hover:bg-slate-200 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
