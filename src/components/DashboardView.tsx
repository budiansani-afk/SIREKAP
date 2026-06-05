import React, { useMemo } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  PieChart, 
  Layers, 
  FolderLock, 
  Briefcase, 
  FileCheck, 
  Activity,
  AlertTriangle,
  ArrowUpRight
} from 'lucide-react';
import { Program, Kegiatan, SubKegiatan, Realisasi, MonitoringFisik, DokumenArsip } from '../types';
import { formatRupiah, formatPercent } from '../utils/helpers';

interface DashboardProps {
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  realisasis: Realisasi[];
  monitorings: MonitoringFisik[];
  dokumens: DokumenArsip[];
}

export default function DashboardView({
  programs,
  kegiatans,
  subKegiatans,
  realisasis,
  monitorings,
  dokumens
}: DashboardProps) {

  // Calculate totals
  const totalPagu = useMemo(() => programs.reduce((sum, p) => sum + (p.pagu || 0), 0), [programs]);
  const totalRealisasi = useMemo(() => realisasis.reduce((sum, r) => sum + (r.nominal_realisasi || 0), 0), [realisasis]);
  const totalSisa = Math.max(0, totalPagu - totalRealisasi);
  const persentaseSerapan = totalPagu > 0 ? (totalRealisasi / totalPagu) * 100 : 0;

  // Monthly breakdown
  const monthlyData = useMemo(() => {
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const counts = months.reduce((acc, m) => {
      acc[m] = 0;
      return acc;
    }, {} as Record<string, number>);

    realisasis.forEach(r => {
      if (counts[r.bulan] !== undefined) {
        counts[r.bulan] += r.nominal_realisasi;
      }
    });

    return months.map(m => ({ month: m, amount: counts[m] }));
  }, [realisasis]);

  const maxMonthAmount = Math.max(...monthlyData.map(d => d.amount), 1000000);

  // Overall Physical Target vs Realisation
  const avgPhysical = useMemo(() => {
    if (monitorings.length === 0) return { target: 0, realisasi: 0 };
    const sumTarget = monitorings.reduce((sum, m) => sum + (m.target_fisik || 0), 0);
    const sumReal = monitorings.reduce((sum, m) => sum + (m.realisasi_fisik || 0), 0);
    return {
      target: parseFloat((sumTarget / monitorings.length).toFixed(2)),
      realisasi: parseFloat((sumReal / monitorings.length).toFixed(2))
    };
  }, [monitorings]);

  // Notifications
  const alerts = useMemo(() => {
    const list: string[] = [];
    // If absorption is very low for modern time of year (e.g. June 2026 should be around 40-50%)
    if (persentaseSerapan < 30) {
      list.push(`Serapan anggaran keseluruhan baru mencapai ${persentaseSerapan.toFixed(2)}%, di bawah target paruh tahun 40%.`);
    }

    // Check if any Sub-Kegiatan has realisasi exceeding pagu
    subKegiatans.forEach(s => {
      if (s.realisasi > s.pagu) {
        list.push(`Defisit Anggaran: Sub Kegiatan "${s.nama_sub_kegiatan}" melampaui Pagu sebesar ${formatRupiah(s.realisasi - s.pagu)}!`);
      }
    });

    return list;
  }, [persentaseSerapan, subKegiatans]);

  return (
    <div className="space-y-6" id="dashboard-container">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#172554] via-[#1e3a8a] to-[#1e40af] rounded-xl p-6 text-white shadow-sm relative overflow-hidden" id="welcome-pane">
        <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-12 translate-y-6">
          <Activity size={320} />
        </div>
        <div className="relative z-10">
          <h2 className="text-xl md:text-2xl font-bold font-display flex items-center gap-2">
            <span className="bg-white/10 px-3 py-1 rounded-lg text-xs border border-white/20 select-none font-mono">TA 2026</span>
            Sistem SIBIRU Realoperasi
          </h2>
          <p className="text-blue-100/90 mt-1 max-w-2xl text-xs md:text-sm leading-relaxed">
            Sistem Informasi Belanja dan Realisasi Keuangan Sektor Pertanahan Kabupaten Bima, Provinsi Nusa Tenggara Barat. Seluruh data transaksi, cetakan laporan DPA, dan monitoring terdokumentasi serta tersinkronisasi secara real-time.
          </p>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 space-y-2 text-sm" id="dashboard-alerts">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="text-amber-600" size={18} />
            Sistem Peringatan Dini (Early Warning System)
          </div>
          <ul className="list-disc list-inside space-y-1 text-amber-800 pl-1">
            {alerts.map((alert, i) => (
              <li key={i}>{alert}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="stats-grid">
        {/* Pagu */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-[#1e3a8a] hover:shadow transition-all duration-200" id="card-pagu">
          <div className="p-3 bg-blue-50 text-blue-800 rounded-lg shrink-0">
            <DollarSign size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total Pagu</p>
            <h3 className="text-xl font-black text-slate-900 mt-0.5 tracking-tight font-display">{formatRupiah(totalPagu)}</h3>
            <p className="text-[11px] text-blue-600 mt-0.5 font-medium">Batas Plafon Bidang</p>
          </div>
        </div>

        {/* Realisasi */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-emerald-600 hover:shadow transition-all duration-200" id="card-realisasi">
          <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg shrink-0">
            <TrendingUp size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total Realisasi</p>
            <h3 className="text-xl font-black text-slate-950 mt-0.5 tracking-tight font-display">{formatRupiah(totalRealisasi)}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                {persentaseSerapan.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-500 font-medium">Anggaran Terserap</span>
            </div>
          </div>
        </div>

        {/* Sisa */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-amber-500 hover:shadow transition-all duration-200" id="card-sisa">
          <div className="p-3 bg-amber-50 text-amber-850 rounded-lg shrink-0">
            <PieChart size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Sisa Anggaran</p>
            <h3 className="text-xl font-black text-slate-900 mt-0.5 tracking-tight font-display">{formatRupiah(totalSisa)}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Sisa Kas Belanja Lahan</p>
          </div>
        </div>

        {/* Realisasi Fisik */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-indigo-600 hover:shadow transition-all duration-200" id="card-fisik">
          <div className="p-3 bg-indigo-50 text-indigo-800 rounded-lg shrink-0">
            <ArrowUpRight size={22} />
          </div>
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Capaian Fisik</p>
            <h3 className="text-xl font-black text-slate-900 mt-0.5 tracking-tight font-display">{avgPhysical.realisasi}%</h3>
            <p className="text-[11px] text-indigo-650 mt-0.5 font-semibold">Dari target {avgPhysical.target}%</p>
          </div>
        </div>
      </div>

      {/* Structural Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="stats-mini-grid">
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center hover:bg-slate-100/50 transition">
          <Layers size={18} className="mx-auto text-slate-600 mb-1" />
          <h4 className="text-emerald-700 text-lg font-bold">{programs.length}</h4>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Program</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center hover:bg-slate-100/50 transition">
          <Briefcase size={18} className="mx-auto text-slate-600 mb-1" />
          <h4 className="text-emerald-700 text-lg font-bold">{kegiatans.length}</h4>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Kegiatan</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center hover:bg-slate-100/50 transition">
          <Layers size={18} className="mx-auto text-slate-600 mb-1" />
          <h4 className="text-emerald-700 text-lg font-bold">{subKegiatans.length}</h4>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Sub-Kegiatan</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center hover:bg-slate-100/50 transition">
          <FileCheck size={18} className="mx-auto text-slate-600 mb-1" />
          <h4 className="text-emerald-700 text-lg font-bold">{dokumens.length}</h4>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Arsip Dokumen</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-charts">
        
        {/* 1. Serapan Bulanan (Bar Chart) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2 flex flex-col justify-between" id="chart-bulan">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <FolderLock size={18} className="text-blue-700" />
              Tren Realisasi Bulanan TA 2026
            </h3>
            <p className="text-slate-600 text-xs mt-1">Grafik nominal realisasi penyerapan keuangan per bulan berjalan</p>
          </div>
          
          <div className="mt-8 h-48 flex items-end gap-2.5 pb-2" id="chart-months-bars">
            {monthlyData.map((d, index) => {
              const heightPct = (d.amount / maxMonthAmount) * 100;
              return (
                <div key={index} className="flex-1 flex flex-col items-center group relative cursor-pointer">
                  {/* Tooltip on Hover */}
                  <div className="absolute bottom-full mb-2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none">
                    {formatRupiah(d.amount)}
                  </div>
                  {/* Vertical Bar */}
                  <div 
                    className="w-full bg-blue-600 hover:bg-blue-500 rounded-t transition-all duration-300"
                    style={{ height: `${Math.max(4, heightPct)}%` }}
                  ></div>
                  {/* Month Label */}
                  <span className="text-[10px] text-slate-500 font-semibold mt-2 select-none rotate-45 sm:rotate-0 inline-block overflow-hidden max-w-[28px] truncate">
                    {d.month.substring(0, 3)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Donut Gauge for overall Serapan */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between" id="chart-gauge">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
              <PieChart size={18} className="text-blue-700" />
              Persentase Kinerja Serapan
            </h3>
            <p className="text-slate-600 text-xs mt-1">Visualisasi efisiensi penyerapan DPA dinas</p>
          </div>

          <div className="flex flex-col items-center justify-center py-6">
            <div className="relative w-36 h-36 flex items-center justify-center">
              {/* Simple SV Donut */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-100"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-blue-700"
                  strokeWidth="3.5"
                  strokeDasharray={`${persentaseSerapan}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-2xl font-black text-slate-800">{persentaseSerapan.toFixed(1)}%</span>
                <p className="text-[10px] text-slate-500 font-semibold tracking-wide uppercase mt-0.5">TERSERAP</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 w-full mt-6 text-center text-xs">
              <div className="p-2 bg-blue-50/50 rounded-xl border border-blue-100/50">
                <p className="text-slate-500 font-medium">Realisasi</p>
                <p className="font-bold text-blue-700">{formatRupiah(totalRealisasi)}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-slate-500 font-medium">Sisa Kas</p>
                <p className="font-bold text-slate-700">{formatRupiah(totalSisa)}</p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 3. Program & Kegiatan Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="dashboard-program-progression">
        
        {/* Left: Program detail progress */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm" id="prog-programs">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Layers size={18} className="text-blue-700" />
            Alokasi & Penyerapan per Program
          </h3>
          <div className="space-y-4">
            {programs.length === 0 ? (
              <p className="text-sm text-slate-600 py-4 text-center">Sistem tidak mendeteksi Program Aktif.</p>
            ) : (
              programs.map((p, i) => (
                <div key={i} className="space-y-1.5 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                  <div className="flex justify-between text-xs font-semibold text-slate-900 gap-4">
                    <span className="truncate max-w-[200px]" title={p.nama_program}>
                      {p.kode_program} - {p.nama_program}
                    </span>
                    <span className="font-bold pr-1">{p.persentase}%</span>
                  </div>
                  {/* Progress track */}
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, p.persentase)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-600">
                    <span>Realisasi: <b>{formatRupiah(p.realisasi)}</b></span>
                    <span>Pagu: <b>{formatRupiah(p.pagu)}</b></span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Key Kegiatan Progress */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm" id="prog-kegiatans">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Briefcase size={18} className="text-blue-700" />
            Kegiatan dengan Porsi Pagu Terbesar
          </h3>
          <div className="space-y-4">
            {kegiatans.length === 0 ? (
              <p className="text-sm text-slate-600 py-4 text-center">Belum ada Kegiatan terdaftar.</p>
            ) : (
              kegiatans
                .slice()
                .sort((a, b) => b.pagu - a.pagu)
                .slice(0, 4)
                .map((k, i) => (
                  <div key={i} className="space-y-1.5 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                    <div className="flex justify-between text-xs font-semibold text-slate-900 gap-4">
                      <span className="truncate max-w-[200px]" title={k.nama_kegiatan}>
                        {k.kode_kegiatan} - {k.nama_kegiatan}
                      </span>
                      <span className="font-bold text-emerald-800">{k.persentase}%</span>
                    </div>
                    {/* Progress track */}
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, k.persentase)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>Pagu: {formatRupiah(k.pagu)}</span>
                      <span>Sisa: {formatRupiah(k.sisa)}</span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
