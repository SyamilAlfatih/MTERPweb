import React, { useState, useEffect } from 'react';
import { ProjectCalendar, CalendarException } from '../../types';
import { X, Calendar, Plus, Trash2, Clock, Check, AlertCircle } from 'lucide-react';

interface CalendarDialogProps {
  isOpen: boolean;
  calendar: ProjectCalendar | null;
  onClose: () => void;
  onSave: (updatedCalendar: Partial<ProjectCalendar>) => Promise<void>;
}

const DAYS_OF_WEEK = [
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
  { id: 0, name: 'Sunday' },
];

export const CalendarDialog: React.FC<CalendarDialogProps> = ({
  isOpen,
  calendar,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('Standard Construction (Mon-Sat)');
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [hoursPerDay, setHoursPerDay] = useState<number>(8);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [saving, setSaving] = useState(false);

  // New exception form
  const [newExName, setNewExName] = useState('');
  const [newExStart, setNewExStart] = useState('');
  const [newExFinish, setNewExFinish] = useState('');
  const [newExIsWorking, setNewExIsWorking] = useState(false);

  useEffect(() => {
    if (calendar) {
      setName(calendar.name || 'Standard Construction (Mon-Sat)');
      setWorkingDays(calendar.workingDays || [1, 2, 3, 4, 5, 6]);
      setHoursPerDay(calendar.hoursPerDay || 8);
      setExceptions(
        (calendar.exceptions || []).map(ex => ({
          _id: ex._id,
          name: ex.name,
          startDate: ex.startDate ? ex.startDate.slice(0, 10) : '',
          finishDate: ex.finishDate ? ex.finishDate.slice(0, 10) : '',
          isWorkingDay: Boolean(ex.isWorkingDay),
        }))
      );
    }
  }, [calendar]);

  if (!isOpen) return null;

  const toggleDay = (dayId: number) => {
    setWorkingDays(prev =>
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId].sort()
    );
  };

  const handleAddException = () => {
    if (!newExName.trim() || !newExStart) {
      alert('Please enter exception name and start date.');
      return;
    }

    setExceptions(prev => [
      ...prev,
      {
        name: newExName.trim(),
        startDate: newExStart,
        finishDate: newExFinish || newExStart,
        isWorkingDay: newExIsWorking,
      },
    ]);

    setNewExName('');
    setNewExStart('');
    setNewExFinish('');
    setNewExIsWorking(false);
  };

  const handleRemoveException = (index: number) => {
    setExceptions(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await onSave({
        name,
        workingDays,
        hoursPerDay,
        exceptions,
      });
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to save calendar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold">Change Working Time / Project Calendar</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Calendar Name & Hours */}
          <div className="grid grid-cols-2 gap-4 pb-3 border-b border-slate-200">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Calendar Name:</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Standard Work Hours / Day:</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={hoursPerDay}
                  onChange={e => setHoursPerDay(parseInt(e.target.value, 10) || 8)}
                  className="w-24 px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                />
                <span className="text-slate-500">hours/day</span>
              </div>
            </div>
          </div>

          {/* Working Days of Week */}
          <div>
            <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              Standard Working Days of the Week:
            </h3>
            <div className="grid grid-cols-7 gap-2">
              {DAYS_OF_WEEK.map(day => {
                const isWork = workingDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleDay(day.id)}
                    className={`py-2 px-1 text-center rounded border transition-all ${
                      isWork
                        ? 'bg-blue-50 border-blue-500 text-blue-800 font-bold shadow-xs'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    <div className="text-[11px] truncate">{day.name.slice(0, 3)}</div>
                    <div className="text-[10px] mt-0.5">{isWork ? 'Work' : 'Off'}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Selected working days: {workingDays.length} days/week. (Indonesian construction default is Mon–Sat).
            </p>
          </div>

          {/* Holiday / Site Exceptions */}
          <div className="pt-2 border-t border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              Holiday & Non-Working Exceptions:
            </h3>

            {/* Exceptions Table */}
            <div className="border border-slate-200 rounded max-h-48 overflow-y-auto mb-3">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-2 font-semibold">Exception Name</th>
                    <th className="p-2 font-semibold w-28">Start Date</th>
                    <th className="p-2 font-semibold w-28">Finish Date</th>
                    <th className="p-2 font-semibold w-20 text-center">Type</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {exceptions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                        No holiday exceptions defined yet.
                      </td>
                    </tr>
                  ) : (
                    exceptions.map((ex, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 font-medium text-slate-800">{ex.name}</td>
                        <td className="p-2 font-mono text-slate-600">{ex.startDate}</td>
                        <td className="p-2 font-mono text-slate-600">{ex.finishDate}</td>
                        <td className="p-2 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              ex.isWorkingDay ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {ex.isWorkingDay ? 'Working' : 'Non-Working'}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveException(idx)}
                            className="text-slate-400 hover:text-rose-600 p-1"
                            title="Remove Exception"
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

            {/* Add Exception Sub-form */}
            <div className="bg-slate-50 p-2.5 rounded border border-slate-200 space-y-2">
              <div className="text-[11px] font-semibold text-slate-700">Add New Exception:</div>
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-2">
                  <input
                    type="text"
                    placeholder="Holiday / Exception Name (e.g. Idul Fitri)"
                    value={newExName}
                    onChange={e => setNewExName(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                  />
                </div>
                <div>
                  <input
                    type="date"
                    value={newExStart}
                    onChange={e => setNewExStart(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
                <div>
                  <input
                    type="date"
                    value={newExFinish}
                    onChange={e => setNewExFinish(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={newExIsWorking}
                    onChange={e => setNewExIsWorking(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Is working day (exception override)</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddException}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add to Exceptions
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 bg-slate-100 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Apply & Recalculate'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
