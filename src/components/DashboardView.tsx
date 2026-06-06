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
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip 
} from 'recharts';

interface DashboardProps {
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  realisasis: Realisasi[];
  monitorings: MonitoringFisik[];
  dokumens: DokumenArsip[];
  onNavigate?: (page: 'dashboard' | 'program' | 'rka' | 'realisasi' | 'monitoring' | 'dokumen' | 'laporan' | 'analisis' | 'logs' | 'pengaturan', tabDetail?: string) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-800 text-white p-3 rounded-xl shadow-xl text-xs flex flex-col font-sans select-none z-50">
        <p className="font-extrabold uppercase tracking-wider text-slate-400 mb-1.5 border-b border-white/20 pb-1">{label}</p>
        <p className="font-mono text-emerald-400 font-black text-sm">{formatRupiah(payload[0].value)}</p>
        <p className="text-[10px] text-slate-450 mt-1 font-semibold">Realisasi Bulanan TA 2026</p>
      </div>
    );
  }
  return null;
};

const formatYAxis = (value: number) => {
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(1)} M`;
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(0)} jt`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)} rb`;
  }
  return value.toString();
};

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
          title: "SIREKAP TANAH - Informasi Lengkap Aplikasi",
          content: "SIREKAP TANAH (Sistem Informasi Rekapitulasi, Evaluasi, dan Kelola Anggaran Pertanahan) merupakan aplikasi pengelolaan anggaran Bidang Pertanahan yang dirancang untuk mendukung perencanaan, pelaksanaan, monitoring, evaluasi, dan pelaporan kegiatan secara terintegrasi.\n\nSistem ini menyediakan informasi secara real-time mengenai pagu anggaran, realisasi keuangan, capaian fisik, serta berkas arsip dokumen pendukung kegiatan pertanahan.\n\nTujuan Utama:\n• Meningkatkan efektivitas pengelolaan anggaran pertanahan.\n• Mempermudah monitoring dan evaluasi kegiatan secara terstruktur.\n• Menyediakan data dan laporan yang akurat, dinamis, dan terintegrasi.\n• Mendukung transparansi serta akuntabilitas pelaksanaan program kerja.",
          type: 'guide'
        })}
        className="bg-gradient-to-r from-blue-900 via-blue-800 to-orange-600 hover:from-blue-950 hover:to-orange-700 rounded-xl p-5 text-white shadow-md cursor-pointer group transition-all duration-300 relative overflow-hidden animate-fade-in flex flex-col sm:flex-row items-center justify-between gap-4 border border-blue-200/20" 
        id="welcome-pane"
        title="Klik untuk melihat Tujuan dan Deskripsi SIREKAP TANAH"
      >
        <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-12 translate-y-6 group-hover:scale-105 transition-transform duration-300">
          <Activity size={240} />
        </div>
        <div className="relative z-10 flex flex-col gap-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="bg-orange-500 hover:bg-orange-600 font-extrabold text-[10px] px-2.5 py-1 rounded-md border border-orange-400/40 tracking-wider">SIREKAP TANAH</span>
            <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] border border-white/20 select-none font-mono">T.A. 2026</span>
          </div>
          <h2 className="text-lg sm:text-xl font-black font-display tracking-tight text-white mt-1">
            Sistem Informasi Rekapitulasi, Evaluasi, dan Kelola Anggaran Pertanahan
          </h2>
          <p className="text-xs text-blue-100 font-semibold leading-relaxed line-clamp-2 max-w-xl group-hover:text-white transition-colors">
            "Terintegrasi untuk Perencanaan, Realisasi, dan Evaluasi Anggaran Pertanahan | Data Akurat, Evaluasi Cepat, Kinerja Tepat"
          </p>
        </div>
        <div className="relative z-10 shrink-0 mt-2 sm:mt-0">
          <button 
            type="button"
            className="px-4 py-2 bg-white hover:bg-slate-50 text-blue-950 font-black text-xs rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer transform group-hover:scale-105 active:scale-95"
          >
            Tujuan & Detail
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
            <marquee scrollamount="6.0" className="cursor-pointer font-bold text-amber-900 block font-mono" title="Scroll Peringatan, klik Detail Tindak untuk petunjuk penanganan.">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="stats-grid">
        {/* Pagu */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3.5 hover:border-blue-500 hover:shadow transition-all duration-200 min-w-0 overflow-hidden" id="card-pagu">
          <div className="w-11 h-11 bg-blue-50 text-blue-850 rounded-lg shrink-0 flex items-center justify-center font-black text-sm select-none border border-blue-100 shadow-3xs" title="Rupiah">
            Rp
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block truncate">Total Pagu</p>
            <h3 className="text-sm xs:text-base md:text-lg font-black text-slate-900 mt-0.5 tracking-tight font-display truncate" title={formatRupiah(totalPagu)}>
              {formatRupiah(totalPagu)}
            </h3>
            <p className="text-[10px] text-blue-600 mt-0.5 font-bold truncate">Batas Plafon Bidang</p>
          </div>
        </div>

        {/* Realisasi */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3.5 hover:border-[#16a34a] hover:shadow transition-all duration-200 min-w-0 overflow-hidden" id="card-realisasi">
          <div className="w-11 h-11 bg-emerald-50 text-emerald-850 rounded-lg shrink-0 flex items-center justify-center font-black text-sm select-none border border-emerald-100 shadow-3xs" title="Rupiah">
            Rp
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block truncate">Total Realisasi</p>
            <h3 className="text-sm xs:text-base md:text-lg font-black text-slate-950 mt-0.5 tracking-tight font-display truncate" title={formatRupiah(totalRealisasi)}>
              {formatRupiah(totalRealisasi)}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              <span className="text-[9px] font-black bg-emerald-100 text-emerald-850 px-1 py-0.5 rounded shrink-0">
                {persentaseSerapan.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-500 font-semibold truncate">Anggaran Terserap</span>
            </div>
          </div>
        </div>

        {/* Sisa */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3.5 hover:border-amber-500 hover:shadow transition-all duration-200 min-w-0 overflow-hidden" id="card-sisa">
          <div className="w-11 h-11 bg-amber-50 text-amber-900 rounded-lg shrink-0 flex items-center justify-center font-black text-sm select-none border border-amber-100 shadow-3xs" title="Rupiah">
            Rp
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block truncate">Sisa Anggaran</p>
            <h3 className="text-sm xs:text-base md:text-lg font-black text-slate-900 mt-0.5 tracking-tight font-display truncate" title={formatRupiah(totalSisa)}>
              {formatRupiah(totalSisa)}
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5 font-bold truncate">Sisa Kas Belanja Lahan</p>
          </div>
        </div>

        {/* Realisasi Fisik */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3.5 hover:border-[#4f46e5] hover:shadow transition-all duration-200 min-w-0 overflow-hidden" id="card-fisik">
          <div className="w-11 h-11 bg-indigo-50 text-indigo-900 rounded-lg shrink-0 flex items-center justify-center font-bold text-sm select-none border border-indigo-100 shadow-3xs">
            %
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block truncate">Capaian Fisik</p>
            <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-black text-slate-900 mt-0.5 tracking-tight font-display truncate">
              {avgPhysical.realisasi}%
            </h3>
            <p className="text-[10px] text-indigo-650 mt-0.5 font-bold truncate">Target {avgPhysical.target}%</p>
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
          
          <div className="mt-6 h-56 w-full text-[10px]" id="chart-months-bars-container" onClick={(e) => e.stopPropagation()}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyData}
                margin={{ top: 10, right: 10, left: -5, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorRealisasi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.95}/>
                    <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0.7}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                <XAxis 
                  dataKey="month" 
                  tickFormatter={(val) => val.substring(0, 3).toUpperCase()} 
                  tick={{ fill: '#475569', fontSize: 9, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tickFormatter={formatYAxis} 
                  tick={{ fill: '#475569', fontSize: 9, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9', opacity: 0.4 }} />
                <Bar 
                  dataKey="amount" 
                  fill="url(#colorRealisasi)" 
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
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
        </div>
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
