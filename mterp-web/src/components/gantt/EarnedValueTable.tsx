import React from 'react';
import { EarnedValueMetrics } from '../../types';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Activity,
  DollarSign,
  Clock,
  Target,
} from 'lucide-react';

interface EarnedValueTableProps {
  metrics: EarnedValueMetrics;
}

export const EarnedValueTable: React.FC<EarnedValueTableProps> = ({ metrics }) => {
  const formatIDR = (amount: number) => {
    return `Rp ${Math.round(amount || 0).toLocaleString('id-ID')}`;
  };

  const isScheduleGood = metrics.spi >= 1.0;
  const isScheduleWarning = metrics.spi >= 0.9 && metrics.spi < 1.0;

  const isCostGood = metrics.cpi >= 1.0;
  const isCostWarning = metrics.cpi >= 0.9 && metrics.cpi < 1.0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden mt-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold tracking-tight">
              Earned Value Management (EVM) Performance
            </h3>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Evaluasi kinerja jadwal & biaya berbasis standar MS Project / PMI (Status Date: {metrics.statusDate})
          </p>
        </div>

        {/* Quick KPI Badges */}
        <div className="flex items-center gap-2.5">
          {/* SPI Badge */}
          <div
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold ${
              isScheduleGood
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : isScheduleWarning
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {isScheduleGood ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            <span>SPI: {metrics.spi.toFixed(2)}</span>
            <span className="text-[10px] font-normal opacity-80">
              ({metrics.spi >= 1.0 ? 'Ahead/On Schedule' : 'Behind Schedule'})
            </span>
          </div>

          {/* CPI Badge */}
          <div
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold ${
              isCostGood
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : isCostWarning
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {isCostGood ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            <span>CPI: {metrics.cpi.toFixed(2)}</span>
            <span className="text-[10px] font-normal opacity-80">
              ({metrics.cpi >= 1.0 ? 'Under/On Budget' : 'Over Budget'})
            </span>
          </div>

          {/* Progress Bobot */}
          <div className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
            <Target className="w-4 h-4" />
            <span>Progress: {metrics.overallProgress}%</span>
          </div>
        </div>
      </div>

      {/* Grid of Key EV Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-slate-100 bg-slate-50/50">
        {/* BAC */}
        <div className="p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
            BAC (Anggaran)
          </div>
          <div className="text-base font-bold text-slate-800 mt-1">
            {formatIDR(metrics.bac)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Budget At Completion</div>
        </div>

        {/* BCWS (PV) */}
        <div className="p-4">
          <div className="text-[11px] font-medium text-blue-600 uppercase tracking-wider">
            BCWS (Planned PV)
          </div>
          <div className="text-base font-bold text-blue-700 mt-1">
            {formatIDR(metrics.bcws)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Rencana s/d saat ini</div>
        </div>

        {/* BCWP (EV) */}
        <div className="p-4">
          <div className="text-[11px] font-medium text-emerald-600 uppercase tracking-wider">
            BCWP (Earned EV)
          </div>
          <div className="text-base font-bold text-emerald-700 mt-1">
            {formatIDR(metrics.bcwp)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Nilai hasil kerja riil</div>
        </div>

        {/* ACWP (AC) */}
        <div className="p-4">
          <div className="text-[11px] font-medium text-purple-600 uppercase tracking-wider">
            ACWP (Actual AC)
          </div>
          <div className="text-base font-bold text-purple-700 mt-1">
            {formatIDR(metrics.acwp)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Biaya aktual terpakai</div>
        </div>

        {/* SV */}
        <div className="p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            SV (Varian Jadwal)
          </div>
          <div
            className={`text-base font-bold mt-1 ${
              metrics.sv >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {metrics.sv >= 0 ? '+' : ''}
            {formatIDR(metrics.sv)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">EV − PV ({metrics.sv >= 0 ? 'Maju' : 'Terlambat'})</div>
        </div>

        {/* CV */}
        <div className="p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            CV (Varian Biaya)
          </div>
          <div
            className={`text-base font-bold mt-1 ${
              metrics.cv >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {metrics.cv >= 0 ? '+' : ''}
            {formatIDR(metrics.cv)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">EV − AC ({metrics.cv >= 0 ? 'Hemat' : 'Boros'})</div>
        </div>
      </div>

      {/* Forecast & Projection Section */}
      <div className="p-5 border-t border-slate-200">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
          Proyeksi Akhir Proyek (Forecast & Estimates)
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* EAC */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 font-medium">EAC (Estimasi Akhir Biaya)</span>
            <div className="text-sm font-bold text-slate-800 mt-1">
              {formatIDR(metrics.eac)}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">Rumus: BAC / CPI</span>
          </div>

          {/* ETC */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 font-medium">ETC (Sisa Biaya s/d Selesai)</span>
            <div className="text-sm font-bold text-slate-800 mt-1">
              {formatIDR(metrics.etc)}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">Rumus: EAC − AC</span>
          </div>

          {/* VAC */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 font-medium">VAC (Varian Saat Selesai)</span>
            <div
              className={`text-sm font-bold mt-1 ${
                metrics.vac >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {metrics.vac >= 0 ? '+' : ''}
              {formatIDR(metrics.vac)}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">Rumus: BAC − EAC</span>
          </div>

          {/* TCPI */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 font-medium">TCPI (Indeks Target Efisiensi)</span>
            <div
              className={`text-sm font-bold mt-1 ${
                metrics.tcpi <= 1.05 ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {metrics.tcpi.toFixed(2)}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">(BAC − EV) / (BAC − AC)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
