import React from 'react';
import { Check, Clock, X, Circle } from 'lucide-react';
import { PipelineStep } from '../../utils/approvalWorkflow';
import { formatDate as formatWIBDate } from '../../utils/date';

interface ApprovalPipelineStepperProps {
  steps: PipelineStep[];
}

export const ApprovalPipelineStepper: React.FC<ApprovalPipelineStepperProps> = ({ steps }) => {
  if (!steps.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Alur Otorisasi
        </span>
        <span className="text-[11px] font-medium text-slate-500">
          {steps.filter((s) => s.state === 'done').length} / {steps.length} tahap selesai
        </span>
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;

          const iconClasses =
            step.state === 'done'
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : step.state === 'current'
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : step.state === 'rejected'
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-slate-300 bg-white text-slate-400';

          const statusText =
            step.state === 'done'
              ? 'Disetujui'
              : step.state === 'current'
                ? 'Menunggu Tindakan'
                : step.state === 'rejected'
                  ? 'Ditolak'
                  : 'Menunggu Tahap Sebelumnya';

          const statusColor =
            step.state === 'done'
              ? 'text-emerald-700'
              : step.state === 'current'
                ? 'text-blue-700'
                : step.state === 'rejected'
                  ? 'text-red-700'
                  : 'text-slate-400';

          return (
            <li key={step.key} className="relative flex gap-3">
              {/* Vertical connector */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[13px] top-7 h-[calc(100%-6px)] w-0.5 ${
                    step.state === 'done' ? 'bg-emerald-300' : 'bg-slate-200'
                  }`}
                />
              )}

              <div
                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${iconClasses}`}
              >
                {step.state === 'done' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : step.state === 'current' ? (
                  <Clock className="h-3.5 w-3.5" />
                ) : step.state === 'rejected' ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Circle className="h-2.5 w-2.5" />
                )}
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-900">{step.label}</p>
                  <span className={`text-[11px] font-semibold ${statusColor}`}>
                    {statusText}
                  </span>
                </div>

                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                  <span>{step.actorName || step.actorRole || 'Belum ditentukan'}</span>
                  {step.timestamp && (
                    <>
                      <span>•</span>
                      <span>
                        {formatWIBDate(step.timestamp, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </>
                  )}
                </div>

                {step.notes && (
                  <p className="mt-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-600">
                    {step.notes}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
