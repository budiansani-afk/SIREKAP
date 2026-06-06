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
  onNavigate?: (page: 'dashboard' | 'program' | 'rka' | 'realisasi' | 'monitoring' | 'dokumen' | 'laporan' | 'analisis' | 'logs' | 'pengaturan', tabDetail?: string) => void;
}

export default function DashboardView({
  programs,
  kegiatans,
  subKegiatans,
  realisasis,
  monitorings,
  dokumens,
  onNavigate
}: DashboardProps) {
  const [selectedInfo, setSelectedInfo] = React.useState<{ title: string; content: string; type: 'guide' | 'alert' } | null>(null);

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
      <div 
        onClick={() => setSelectedInfo({
          title: "Sistem SIBIRU Realoperasi - Informasi Lengkap",
          content: "Sistem Informasi Belanja dan Realisasi Keuangan Sektor Pertanahan Kabupaten Bima, Provinsi Nusa Tenggara Barat. Seluruh data transaksi, cetakan laporan DPA, dan monitoring terdokumentasi serta tersinkronisasi secara real-time.\n\nPisau Analisis SIBIRU-TANAH 2026 dirancang untuk menyinkronkan seluruh pengelolaan DPA, Program, Kegiatan Utama, Sub-Kegiatan, hingga Realisasi Anggaran Kas (RKA). Anda dapat memantau serapan kas bulanan, mengekspor laporan SP2D, serta mengelola berkas pertanahan secara digital.",
          type: 'guide'
        })}
        className="bg-gradient-to-r from-[#172554] via-[#1e3a8a] to-[#1e40af] hover:from-[#131d42] hover:to-[#17328c] rounded-xl p-4 text-white shadow-xs cursor-pointer group transition-all duration-300 relative overflow-hidden animate-fade-in flex flex-col sm:flex-row items-center justify-between gap-4" 
        id="welcome-pane"
        title="Klik untuk membuka informasi panduan sistem lengkap"
      >
        <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-12 translate-y-6 group-hover:scale-105 transition-transform duration-300">
          <Activity size={240} />
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <span className="bg-white/10 px-2.5 py-1 rounded-lg text-xs border border-white/20 select-none font-mono">T.A. 2026</span>
          <h2 className="text-lg md:text-xl font-bold font-display tracking-tight">
            Sistem SIBIRU Realoperasi 
          </h2>
        </div>
        <div className="relative z-10 mt-2 sm:mt-0">
          <button 
            type="button"
            className="px-4 py-1.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-95 text-white font-extrabold text-xs rounded-lg shadow-md transition flex items-center gap-1 cursor-pointer"
          >
            Klik info detail
          </button>
        </div>
      </div>

      {/* Compact Alerts (Sistem Peringatan Dini dibuat lebih kecil) */}
      {alerts.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-200/80 rounded-lg p-2.5 text-amber-950 text-[11px] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-l-4 border-l-amber-500" id="dashboard-alerts">
          <div className="flex items-center gap-1.5 font-black uppercase tracking-wide shrink-0 text-amber-905 text-amber-900">
            <AlertTriangle className="text-amber-600 animate-pulse shrink-0" size={14} />
            <span>Peringatan Dini ({alerts.length})</span>
          </div>
          <div className="flex-1 min-w-0">
            <marquee scrollamount="2.5" className="cursor-pointer font-semibold text-amber-900 block font-mono" title="Scroll Peringatan, klik Detail Tindak untuk petunjuk penanganan.">
              {alerts.join(" | ")}
            </marquee>
          </div>
          <button 
            onClick={() => setSelectedInfo({
              title: "Daftar Warning & Petunjuk Penanganan Defisit",
              content: alerts.map((a, idx) => `${idx + 1}. ${a}`).join("\n\n") + "\n\nLangkah Penanganan:\n1. Segera lakukan penyesuaian/revisi DPA melalui menu RKA belanja jika terdapat defisit belanja kas.\n2. Hubungi operator penanggung jawab daerah setempat untuk memvalidasi kelengkapan berkas fisik SP2D.\n3. Cocokkan sisa DPA agar rasio tetap berada di zona hijau.",
              type: 'alert'
            })}
            className="px-2 py-0.5 bg-amber-100 hover:bg-amber-205 text-[#7a4805] text-[10px] font-extrabold rounded cursor-pointer transition shrink-0 self-end sm:self-auto hover:bg-amber-200"
          >
            Detail Tindak
          </button>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in" id="stats-mini-grid">
        <div 
          onClick={() => onNavigate?.('program', 'program')}
          className="bg-white p-4 rounded-xl border border-slate-200 text-center hover:bg-blue-50/50 hover:border-blue-400 cursor-pointer shadow-2xs group transition-all duration-200 animate-fade-in"
          title="Klik untuk langsung menuju informasi Program"
        >
          <Layers size={18} className="mx-auto text-slate-500 mb-1 group-hover:text-blue-600 transition-colors" />
          <h4 className="text-blue-900 text-lg font-black">{programs.length}</h4>
          <p className="text-slate-600 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1">
            Info Program <span className="text-[10px] text-[#ea580c] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </p>
        </div>
        <div 
          onClick={() => onNavigate?.('program', 'kegiatan')}
          className="bg-white p-4 rounded-xl border border-slate-200 text-center hover:bg-blue-50/50 hover:border-blue-400 cursor-pointer shadow-2xs group transition-all duration-200 animate-fade-in"
          title="Klik untuk langsung menuju informasi Kegiatan"
        >
          <Briefcase size={18} className="mx-auto text-slate-500 mb-1 group-hover:text-blue-600 transition-colors" />
          <h4 className="text-blue-900 text-lg font-black">{kegiatans.length}</h4>
          <p className="text-slate-600 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1">
            Info Kegiatan <span className="text-[10px] text-[#ea580c] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </p>
        </div>
        <div 
          onClick={() => onNavigate?.('program', 'sub_kegiatan')}
          className="bg-white p-4 rounded-xl border border-slate-200 text-center hover:bg-blue-50/50 hover:border-blue-400 cursor-pointer shadow-2xs group transition-all duration-200 animate-fade-in"
          title="Klik untuk langsung menuju informasi Sub-Kegiatan"
        >
          <Layers size={18} className="mx-auto text-slate-500 mb-1 group-hover:text-blue-600 transition-colors" />
          <h4 className="text-blue-900 text-lg font-black">{subKegiatans.length}</h4>
          <p className="text-slate-600 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1">
            Info Sub Kegiatan <span className="text-[10px] text-[#ea580c] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </p>
        </div>
        <div 
          onClick={() => onNavigate?.('dokumen')}
          className="bg-white p-4 rounded-xl border border-slate-200 text-center hover:bg-blue-50/50 hover:border-blue-400 cursor-pointer shadow-2xs group transition-all duration-200 animate-fade-in"
          title="Klik untuk langsung menuju bagian arsip dokumen"
        >
          <FileCheck size={18} className="mx-auto text-slate-500 mb-1 group-hover:text-blue-600 transition-colors" />
          <h4 className="text-blue-900 text-lg font-black">{dokumens.length}</h4>
          <p className="text-slate-600 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1">
            Arsip Dokumen <span className="text-[10px] text-[#ea580c] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in" id="dashboard-charts">
        
        {/* 1. Serapan Bulanan (Bar Chart) (Tren Realisasi Bulanan clickable) */}
        <div 
          onClick={() => onNavigate?.('analisis')}
          className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-blue-400 cursor-pointer shadow-sm lg:col-span-2 flex flex-col justify-between transition group duration-200" 
          id="chart-bulan"
          title="Klik untuk langsung menuju informasi Tren Realisasi Bulanan"
        >
          <div>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FolderLock size={18} className="text-blue-750" />
                  Tren Realisasi Bulanan TA 2026
                </h3>
                <p className="text-slate-600 text-xs mt-1 font-medium">Grafik nominal realisasi penyerapan keuangan per bulan berjalan</p>
              </div>
              <div className="text-right text-[10px] text-slate-500 font-bold bg-slate-50 px-2 py-1 rounded border border-slate-100">
                Nilai Tertinggi: <span className="font-mono text-emerald-800 font-black">{formatRupiah(maxMonthAmount)}</span>
              </div>
            </div>
          </div>
          
          <div className="mt-8 h-56 relative" id="chart-months-bars-container">
            {/* Background Grid Lines & Ticks */}
            <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none select-none">
              {[100, 75, 50, 25, 0].map((tick, tIdx) => (
                <div key={tIdx} className="w-full flex items-center gap-2">
                  <span className="text-[9px] font-mono font-extrabold text-slate-450 w-7 text-right">{tick}%</span>
                  <div className="flex-1 border-t border-dashed border-slate-100"></div>
                </div>
              ))}
            </div>

            {/* Actual Bars */}
            <div className="absolute inset-x-0 top-1 bottom-6 pl-9 flex items-end gap-3.5" id="chart-months-bars">
              {monthlyData.map((d, index) => {
                const heightPct = (d.amount / maxMonthAmount) * 100;
                return (
                  <div key={index} className="flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer">
                    {/* Tooltip on Hover */}
                    <div className="absolute bottom-full mb-2 bg-slate-900 text-white text-[10px] px-2 py-1.5 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-30 pointer-events-none flex flex-col items-center">
                      <span className="font-black border-b border-white/20 pb-0.5 mb-1 w-full text-center uppercase tracking-wider">{d.month}</span>
                      <span className="font-mono font-extrabold text-emerald-400">{formatRupiah(d.amount)}</span>
                      <span className="text-[8px] text-slate-300 mt-0.5">({((d.amount / maxMonthAmount) * 100).toFixed(1)}% dari puncak)</span>
                    </div>

                    {/* Numeric overhead label */}
                    {d.amount > 0 && (
                      <span className="text-[8px] font-mono font-bold text-slate-500 mb-1 pointer-events-none scale-0 group-hover:scale-100 transition duration-150 transform -translate-y-1">
                        {d.amount >= 1000000000 ? `${(d.amount / 1000000000).toFixed(2)} M` : d.amount >= 1000000 ? `${(d.amount / 1000000).toFixed(1)} jt` : formatRupiah(d.amount)}
                      </span>
                    )}

                    {/* Vertical Bar */}
                    <div 
                      className="w-full bg-gradient-to-t from-blue-750 to-blue-500 group-hover:from-blue-600 group-hover:to-blue-400 rounded-lg transition-all duration-300 shadow-2xs"
                      style={{ height: `${Math.max(3, heightPct * 0.9)}%` }}
                    ></div>
                    
                    {/* Month Label */}
                    <span className="absolute top-full mt-1.5 text-[9px] text-slate-500 font-bold select-none uppercase tracking-wider">
                      {d.month.substring(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. Donut Gauge for overall Serapan */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between" id="chart-gauge">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
              <PieChart size={18} className="text-blue-750" />
              Persentase Kinerja Serapan
            </h3>
            <p className="text-slate-600 text-xs mt-1 font-medium">Visualisasi efisiensi penyerapan DPA dinas</p>
          </div>

          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative w-32 h-32 flex items-center justify-center">
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
                <span className="text-2xl font-black text-slate-850">{persentaseSerapan.toFixed(1)}%</span>
                <p className="text-[9px] text-slate-550 font-bold tracking-wider uppercase mt-1">TERSERAP</p>
              </div>
            </div>
            
            {/* Color-graded performance references */}
            <div className="w-full mt-4 space-y-1.5 text-[10px] bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-500 pb-1 border-b">
                <span>Rujukan Status Kinerja</span>
                <span>Alokasi</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Tinggi (&gt;= 80%)</span>
                <span className="font-bold text-emerald-800">{persentaseSerapan >= 80 ? "Aktif" : "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Sedang (50% - 79%)</span>
                <span className="font-bold text-blue-800">{(persentaseSerapan >= 50 && persentaseSerapan < 80) ? "Aktif" : "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Lambat (&lt; 50%)</span>
                <span className="font-bold text-amber-700">{persentaseSerapan < 50 ? "Aktif" : "-"}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full mt-4 text-center text-xs border-t border-slate-100 pt-3">
            <div className="p-2 bg-blue-50/50 rounded-xl border border-blue-100/50">
              <p className="text-slate-500 font-semibold text-[10px] uppercase">Realisasi</p>
              <p className="font-bold text-blue-700 font-mono text-[11px] mt-0.5">{formatRupiah(totalRealisasi)}</p>
            </div>
            <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-slate-500 font-semibold text-[10px] uppercase">Sisa Kas</p>
              <p className="font-bold text-slate-750 font-mono text-[11px] mt-0.5">{formatRupiah(totalSisa)}</p>
            </div>
          </div>
        </div>

            {/* 3. Program & Kegiatan Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in" id="dashboard-program-progression">
        
        {/* Left: Program detail progress */}
        <div 
          onClick={() => onNavigate?.('program', 'program')}
          className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-blue-400 cursor-pointer shadow-sm group transition duration-200" 
          id="prog-programs"
          title="Klik untuk langsung menuju porsi Alokasi dan Penyerapan per Program"
        >
          <h3 className="font-bold text-slate-800 flex items-center justify-between mb-4">
            <span className="flex items-center gap-2">
              <Layers size={18} className="text-blue-700" />
              Alokasi & Penyerapan per Program
            </span>
            <span className="text-[10px] text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">Detail Analisis →</span>
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
        <div 
          onClick={() => onNavigate?.('program', 'kegiatan')}
          className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-blue-400 cursor-pointer shadow-sm group transition duration-200" 
          id="prog-kegiatans"
          title="Klik untuk langsung menuju bagian Kegiatan"
        >
          <h3 className="font-bold text-slate-800 flex items-center justify-between mb-4">
            <span className="flex items-center gap-2">
              <Briefcase size={18} className="text-blue-700" />
              Kegiatan dengan Porsi Pagu Terbesar
            </span>
            <span className="text-[10px] text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">Daftar Kegiatan →</span>
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
        </div>      </div>

      </div>

      {/* Informational Lightbox Overlay Modal */}
      {selectedInfo && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 antialiased" id="info-overlay-lightbox">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-lg w-full overflow-hidden transform scale-100 transition-all duration-300">
            {/* Header */}
            <div className={`p-5 text-white ${selectedInfo.type === 'alert' ? 'bg-gradient-to-r from-amber-600 to-amber-700' : 'bg-gradient-to-r from-[#172554] to-blue-750'}`}>
              <div className="flex items-center gap-2.5">
                {selectedInfo.type === 'alert' ? <AlertTriangle size={20} className="animate-pulse text-white" /> : <Activity size={20} className="text-white" />}
                <h3 className="font-bold text-sm tracking-tight">{selectedInfo.title}</h3>
              </div>
            </div>
            
            {/* Contents */}
            <div className="p-6 space-y-4">
              <p className="text-slate-700 text-xs leading-relaxed whitespace-pre-wrap font-semibold">
                {selectedInfo.content}
              </p>

              {/* Decorative Guide Blocks */}
              {selectedInfo.type === 'guide' && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-2.5 mt-3 text-[11px] text-slate-650">
                  <div className="flex items-start gap-2">
                    <span className="text-[#10409F] font-extrabold font-mono">1.</span>
                    <p><b>Hierarki Program</b>: Klik nama Program/Kegiatan di halaman Program & Kegiatan untuk menelusuri penyerapan mendalam secara interaktif.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[#10409F] font-extrabold font-mono">2.</span>
                    <p><b>Filter Uraian</b>: Klik nama Uraian Belanja di daftar realisasi SP2D untuk menyeleksi rekap kas bulanan secara instan.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[#10409F] font-extrabold font-mono">3.</span>
                    <p><b>Administrasi Pejabat</b>: Mengubah penandatangan laporan di menu administrasi sistem secara permanen.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setSelectedInfo(null)}
                className="px-4 py-2 text-xs font-black bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition shadow-xs cursor-pointer"
              >
                Tutup Informasi
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
