import React, { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { getProjectSCurve } from '../../api/api';
import { SCurveData } from '../../types';
import { EarnedValueTable } from './EarnedValueTable';
import {
  TrendingUp,
  RefreshCw,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Percent,
  Coins,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface SCurveViewProps {
  projectId: string;
  project: any;
}

export const SCurveView: React.FC<SCurveViewProps> = ({ projectId, project }) => {
  const [mode, setMode] = useState<'progress' | 'cost'>('progress');
  const [statusDate, setStatusDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [scurveData, setScurveData] = useState<SCurveData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState<boolean>(false);

  const fetchSCurve = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getProjectSCurve(projectId, mode, statusDate);
      if (res.success && res.scurve) {
        setScurveData(res.scurve);
      } else {
        setError('Gagal memuat data Kurva S');
      }
    } catch (err: any) {
      console.error('Error fetching S-curve:', err);
      setError(err?.response?.data?.msg || 'Gagal memuat data Kurva S');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSCurve();
  }, [projectId, mode, statusDate]);

  // Compute Deviation (Deviasi) at status date
  const statusDeviation = useMemo(() => {
    if (!scurveData || !scurveData.dataPoints || scurveData.dataPoints.length === 0) return null;
    const currentPoint = [...scurveData.dataPoints]
      .reverse()
      .find(p => p.earnedCumulative !== null);

    if (!currentPoint || currentPoint.earnedCumulative === null) return null;
    const diff = currentPoint.earnedCumulative - currentPoint.plannedCumulative;
    return {
      diff,
      planned: currentPoint.plannedCumulative,
      earned: currentPoint.earnedCumulative,
      date: currentPoint.date,
    };
  }, [scurveData]);

  // Prepare Chart.js data
  const chartData = useMemo(() => {
    if (!scurveData || !scurveData.dataPoints) {
      return { labels: [], datasets: [] };
    }

    const labels = scurveData.dataPoints.map(p => {
      const parts = p.date.split('-');
      if (parts.length === 3) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
        const mIdx = parseInt(parts[1], 10) - 1;
        return `${parts[2]} ${monthNames[mIdx] || parts[1]}`;
      }
      return p.date;
    });

    const plannedValues = scurveData.dataPoints.map(p => p.plannedCumulative);
    const earnedValues = scurveData.dataPoints.map(p => p.earnedCumulative);
    const actualValues = scurveData.dataPoints.map(p => p.actualCumulative);

    const datasets: any[] = [
      {
        label: mode === 'progress' ? 'Rencana Kumulatif (PV %)' : 'Rencana Kumulatif (BCWS Rp)',
        data: plannedValues,
        borderColor: '#2563EB', // Blue 600
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#2563EB',
      },
      {
        label: mode === 'progress' ? 'Realisasi Kumulatif (EV %)' : 'Realisasi Kumulatif (BCWP Rp)',
        data: earnedValues,
        borderColor: '#16A34A', // Green 600
        backgroundColor: 'rgba(22, 163, 74, 0.12)',
        fill: false,
        tension: 0.35,
        borderWidth: 3.5,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: '#16A34A',
        spanGaps: false,
      },
    ];

    if (mode === 'cost') {
      datasets.push({
        label: 'Biaya Aktual (ACWP Rp)',
        data: actualValues,
        borderColor: '#9333EA', // Purple 600
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#9333EA',
        spanGaps: false,
      });
    }

    return { labels, datasets };
  }, [scurveData, mode]);

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 16,
          font: { size: 12, weight: 'bold' },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 12,
        boxPadding: 6,
        usePointStyle: true,
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const val = context.parsed.y;
            if (val === null || val === undefined) return `${label}: -`;
            if (mode === 'progress') {
              return `${label}: ${Number(val).toFixed(2)}%`;
            }
            return `${label}: Rp ${Math.round(val).toLocaleString('id-ID')}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: true,
          color: 'rgba(226, 232, 240, 0.6)',
        },
        ticks: {
          font: { size: 11 },
          maxRotation: 45,
          minRotation: 0,
        },
      },
      y: {
        min: 0,
        max: mode === 'progress' ? 100 : undefined,
        grid: {
          color: 'rgba(226, 232, 240, 0.6)',
        },
        ticks: {
          font: { size: 11 },
          callback: (val: any) => {
            if (mode === 'progress') return `${val}%`;
            if (val >= 1e9) return `Rp ${(val / 1e9).toFixed(1)}M`;
            if (val >= 1e6) return `Rp ${(val / 1e6).toFixed(0)}Jt`;
            return `Rp ${val}`;
          },
        },
      },
    },
  };

  return (
    <div className="p-6 bg-slate-50 min-h-full overflow-y-auto">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Kurva S Proyek (S-Curve)
                </h2>
                <p className="text-xs text-slate-500">
                  Visualisasi kumulatif rencana vs realisasi progress fisik / biaya proyek konstruksi
                </p>
              </div>
            </div>
          </div>

          {/* Controls: Mode Switch, Status Date & Refresh */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Mode Switcher */}
            <div className="bg-slate-100 p-1 rounded-lg border border-slate-200 flex items-center">
              <button
                type="button"
                onClick={() => setMode('progress')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  mode === 'progress'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Percent className="w-3.5 h-3.5" />
                Bobot Fisik (%)
              </button>
              <button
                type="button"
                onClick={() => setMode('cost')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  mode === 'cost'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                Biaya (Rp)
              </button>
            </div>

            {/* Status Date Selector */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 font-medium">Status Date:</span>
              <input
                type="date"
                value={statusDate}
                onChange={e => setStatusDate(e.target.value)}
                className="font-semibold text-slate-800 bg-transparent focus:outline-hidden"
              />
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={fetchSCurve}
              disabled={loading}
              className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-200 transition-colors"
              title="Perbarui Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Deviation Summary Banner */}
        {statusDeviation && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500">
                Posisi s/d {statusDeviation.date}:
              </span>
              <div
                className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                  statusDeviation.diff >= 0
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {statusDeviation.diff >= 0 ? (
                  <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-rose-600" />
                )}
                <span>
                  Deviasi:{' '}
                  {statusDeviation.diff >= 0 ? '+' : ''}
                  {mode === 'progress'
                    ? `${statusDeviation.diff.toFixed(2)}%`
                    : `Rp ${Math.round(statusDeviation.diff).toLocaleString('id-ID')}`}
                </span>
                <span className="font-normal opacity-90">
                  ({statusDeviation.diff >= 0 ? 'Lebih Cepat / Maju' : 'Terlambat / Kritis'})
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              Rencana:{' '}
              <span className="font-bold text-slate-700">
                {mode === 'progress'
                  ? `${statusDeviation.planned.toFixed(2)}%`
                  : `Rp ${Math.round(statusDeviation.planned).toLocaleString('id-ID')}`}
              </span>{' '}
              | Realisasi:{' '}
              <span className="font-bold text-slate-700">
                {mode === 'progress'
                  ? `${statusDeviation.earned.toFixed(2)}%`
                  : `Rp ${Math.round(statusDeviation.earned).toLocaleString('id-ID')}`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Chart Canvas Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
        {loading && !scurveData ? (
          <div className="h-96 flex flex-col items-center justify-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mb-2" />
            <span className="text-sm font-medium">Menghitung dan memetakan Kurva S...</span>
          </div>
        ) : error ? (
          <div className="h-96 flex flex-col items-center justify-center text-rose-500">
            <AlertCircle className="w-8 h-8 mb-2" />
            <span className="text-sm font-semibold">{error}</span>
            <button
              onClick={fetchSCurve}
              className="mt-3 px-4 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        ) : (
          <div className="h-[420px] w-full">
            <Line data={chartData} options={chartOptions} />
          </div>
        )}

        {/* Collapsible Data Table Toggle */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowTable(!showTable)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
          >
            {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showTable ? 'Sembunyikan Tabel Data Kurva S' : 'Tampilkan Tabel Data Kurva S (Detail Nilai)'}
          </button>
          <span className="text-[11px] text-slate-400">
            {scurveData?.dataPoints?.length || 0} titik data waktu
          </span>
        </div>

        {/* Data Table */}
        {showTable && scurveData && (
          <div className="mt-3 max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                <tr>
                  <th className="p-2 border-b border-slate-200">Tanggal</th>
                  <th className="p-2 border-b border-slate-200">
                    {mode === 'progress' ? 'Rencana Kumulatif (%)' : 'Rencana (BCWS Rp)'}
                  </th>
                  <th className="p-2 border-b border-slate-200">
                    {mode === 'progress' ? 'Realisasi Kumulatif (%)' : 'Realisasi (BCWP Rp)'}
                  </th>
                  <th className="p-2 border-b border-slate-200">
                    {mode === 'progress' ? 'Deviasi (%)' : 'Deviasi (SV Rp)'}
                  </th>
                  {mode === 'cost' && (
                    <th className="p-2 border-b border-slate-200">Biaya Aktual (ACWP Rp)</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {scurveData.dataPoints.map((pt, i) => {
                  const dev = pt.earnedCumulative !== null ? pt.earnedCumulative - pt.plannedCumulative : null;
                  return (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2 font-sans font-medium text-slate-700">{pt.date}</td>
                      <td className="p-2 text-blue-600">
                        {mode === 'progress'
                          ? `${pt.plannedCumulative.toFixed(2)}%`
                          : `Rp ${Math.round(pt.plannedCumulative).toLocaleString('id-ID')}`}
                      </td>
                      <td className="p-2 text-emerald-600 font-semibold">
                        {pt.earnedCumulative !== null
                          ? mode === 'progress'
                            ? `${pt.earnedCumulative.toFixed(2)}%`
                            : `Rp ${Math.round(pt.earnedCumulative).toLocaleString('id-ID')}`
                          : '—'}
                      </td>
                      <td
                        className={`p-2 font-bold ${
                          dev === null
                            ? 'text-slate-400'
                            : dev >= 0
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {dev !== null
                          ? `${dev >= 0 ? '+' : ''}${
                              mode === 'progress'
                                ? `${dev.toFixed(2)}%`
                                : `Rp ${Math.round(dev).toLocaleString('id-ID')}`
                            }`
                          : '—'}
                      </td>
                      {mode === 'cost' && (
                        <td className="p-2 text-purple-600">
                          {pt.actualCumulative !== null
                            ? `Rp ${Math.round(pt.actualCumulative).toLocaleString('id-ID')}`
                            : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Earned Value Performance Metrics Table */}
      {scurveData?.projectEV && (
        <EarnedValueTable metrics={scurveData.projectEV} />
      )}
    </div>
  );
};
