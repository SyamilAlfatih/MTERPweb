import React, { useState } from 'react';
import { ProjectTask, ProjectPlanSummary } from '../../types';
import {
  Printer,
  X,
  Calendar,
  Layers,
  Flame,
  CheckCircle2,
  Clock,
  Building2,
  Check,
} from 'lucide-react';

interface PrintViewProps {
  project: any;
  tasks: ProjectTask[];
  summary: ProjectPlanSummary | null;
  onClose: () => void;
}

export const PrintView: React.FC<PrintViewProps> = ({
  project,
  tasks,
  summary,
  onClose,
}) => {
  const [paperSize, setPaperSize] = useState<'A3' | 'A4'>('A3');

  const handlePrint = () => {
    window.print();
  };

  const todayStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-800/90 backdrop-blur-xs flex flex-col overflow-y-auto">
      {/* Non-printable Action Bar */}
      <div className="no-print bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between border-b border-slate-700 shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <Printer className="w-5 h-5 text-blue-400" />
          <span className="font-bold text-sm">Pratinjau Cetak Jadwal Proyek (Print / PDF Export)</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Paper Size Selector */}
          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setPaperSize('A3')}
              className={`px-3 py-1 rounded font-bold transition-all ${
                paperSize === 'A3' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              A3 Landscape (Standar Proyek)
            </button>
            <button
              type="button"
              onClick={() => setPaperSize('A4')}
              className={`px-3 py-1 rounded font-bold transition-all ${
                paperSize === 'A4' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              A4 Landscape
            </button>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak / Simpan PDF</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Printable Sheet Container */}
      <div className="flex-1 p-6 flex justify-center">
        <div
          className={`bg-white text-slate-900 shadow-2xl p-8 rounded-lg print:rounded-none print:shadow-none print:p-0 print-sheet ${
            paperSize === 'A3' ? 'w-[1400px] max-w-full' : 'w-[1050px] max-w-full'
          }`}
        >
          {/* Document Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  MTERP Construction ERP System
                </div>
                <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight mt-0.5">
                  MASTER PROJECT SCHEDULE (JADWAL INDUK PROYEK)
                </h1>
                <div className="text-sm font-semibold text-blue-800 mt-0.5">
                  {project?.name || 'Nama Proyek'}
                </div>
              </div>

              <div className="text-right text-xs text-slate-600 space-y-0.5">
                <div>Lokasi: <strong>{project?.location || '-'}</strong></div>
                <div>Tanggal Cetak: <strong>{todayStr}</strong></div>
                <div>Status Jadwal: <strong className="text-emerald-700">Official Baseline</strong></div>
              </div>
            </div>

            {/* Project Key Metrics Summary Bar */}
            {summary && (
              <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-4 gap-2 text-xs bg-slate-50 p-2.5 rounded border">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Durasi</span>
                  <span className="font-bold text-slate-800">{summary.totalDurationDays} Hari Kerja</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Kemajuan Fisik</span>
                  <span className="font-bold text-blue-700">{summary.overallPercentComplete}%</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Pekerjaan</span>
                  <span className="font-bold text-slate-800">{summary.totalTasks} Items</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Lintasan Kritis</span>
                  <span className="font-bold text-rose-600">{summary.criticalTasksCount} Tasks (CPM)</span>
                </div>
              </div>
            )}
          </div>

          {/* Schedule Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-900 text-white font-bold uppercase text-[10px]">
                  <th className="p-1.5 border border-slate-800 text-center w-8">#</th>
                  <th className="p-1.5 border border-slate-800 w-16">WBS</th>
                  <th className="p-1.5 border border-slate-800">Nama Pekerjaan (Task Name)</th>
                  <th className="p-1.5 border border-slate-800 text-center w-16">Durasi</th>
                  <th className="p-1.5 border border-slate-800 text-center w-24">Tgl Mulai</th>
                  <th className="p-1.5 border border-slate-800 text-center w-24">Tgl Selesai</th>
                  <th className="p-1.5 border border-slate-800 text-center w-12">%</th>
                  <th className="p-1.5 border border-slate-800 w-24">Predecessor</th>
                  <th className="p-1.5 border border-slate-800 text-right w-28">Biaya Rencana</th>
                  <th className="p-1.5 border border-slate-800 text-center w-16">Kritis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-sans">
                {tasks.map((task, idx) => {
                  const sDate = task.startDate ? task.startDate.slice(0, 10) : '-';
                  const fDate = task.finishDate ? task.finishDate.slice(0, 10) : '-';

                  return (
                    <tr
                      key={task._id}
                      className={
                        task.isSummary
                          ? 'bg-slate-100 font-bold text-slate-900'
                          : task.isCritical
                          ? 'bg-rose-50/40 text-slate-900'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="p-1.5 border border-slate-300 text-center font-mono text-[10px] text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="p-1.5 border border-slate-300 font-mono text-[10px] text-slate-600">
                        {task.wbsCode || '-'}
                      </td>
                      <td className="p-1.5 border border-slate-300">
                        <div style={{ paddingLeft: `${Math.max(0, (task.outlineLevel || 1) - 1) * 16}px` }}>
                          {task.isMilestone && <span className="font-bold text-amber-600 mr-1">◆</span>}
                          <span>{task.name}</span>
                        </div>
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono">
                        {task.isMilestone ? '0d' : `${task.duration}d`}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono text-[10px]">
                        {sDate}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono text-[10px]">
                        {fDate}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono">
                        {task.percentComplete || 0}%
                      </td>
                      <td className="p-1.5 border border-slate-300 font-mono text-[10px] text-slate-600">
                        {(task.predecessors || [])
                          .map(p => {
                            const pt = tasks.find(t => t._id === (typeof p.taskId === 'string' ? p.taskId : p.taskId?._id));
                            return pt ? `${pt.sortOrder + 1}${p.type !== 'FS' ? p.type : ''}` : '';
                          })
                          .filter(Boolean)
                          .join(', ') || '-'}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-right font-mono text-[10px]">
                        {task.plannedCost ? `Rp ${task.plannedCost.toLocaleString('id-ID')}` : '-'}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center">
                        {task.isCritical ? (
                          <span className="font-bold text-rose-600 text-[10px]">CRITICAL</span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend and Signature Blocks */}
          <div className="mt-8 pt-4 border-t-2 border-slate-900 break-inside-avoid">
            {/* Legend */}
            <div className="flex items-center gap-6 text-[10px] text-slate-600 mb-6">
              <span className="font-bold uppercase text-slate-900">Keterangan:</span>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-blue-600 rounded-xs" />
                <span>Pekerjaan Normal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-rose-600 rounded-xs" />
                <span>Lintasan Kritis (Critical Path)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-amber-600 font-bold">◆</span>
                <span>Milestone (Tonggak Pencapaian)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-slate-900 rounded-xs" />
                <span>Summary (Rangkuman WBS)</span>
              </div>
            </div>

            {/* Formal Approval Signature Block */}
            <div className="grid grid-cols-3 gap-8 text-center text-xs">
              <div className="border border-slate-300 p-4 rounded bg-slate-50/50">
                <div className="font-bold text-slate-700">Dipersiapkan Oleh:</div>
                <div className="text-[10px] text-slate-500 mb-16">Site Engineer / Scheduler</div>
                <div className="border-b border-slate-400 mx-6" />
                <div className="text-[11px] font-bold text-slate-800 mt-1">( ........................................ )</div>
              </div>

              <div className="border border-slate-300 p-4 rounded bg-slate-50/50">
                <div className="font-bold text-slate-700">Diperiksa Oleh:</div>
                <div className="text-[10px] text-slate-500 mb-16">Project Manager / Site Manager</div>
                <div className="border-b border-slate-400 mx-6" />
                <div className="text-[11px] font-bold text-slate-800 mt-1">( ........................................ )</div>
              </div>

              <div className="border border-slate-300 p-4 rounded bg-slate-50/50">
                <div className="font-bold text-slate-700">Disetujui Oleh:</div>
                <div className="text-[10px] text-slate-500 mb-16">Direksi / Konsultan Pengawas</div>
                <div className="border-b border-slate-400 mx-6" />
                <div className="text-[11px] font-bold text-slate-800 mt-1">( ........................................ )</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
