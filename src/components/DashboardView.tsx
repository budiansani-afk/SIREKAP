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
import { Program, Kegiatan, SubKegiatan, Realisasi, BelanjaPihakKetiga, DokumenArsip, RKA } from '../types';
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
  pihakKetigas: BelanjaPihakKetiga[];
  rkaList: RKA[];
  dokumens: DokumenArsip[];
  onNavigate?: (page: 'dashboard' | 'program' | 'rka' | 'realisasi' | 'pihakKetiga' | 'dokumen' | 'laporan' | 'analisis' | 'logs' | 'pengaturan', tabDetail?: string) => void;
  onShowInfo?: (info: { title: string; content: string; type: 'guide' | 'alert' }) => void;
  selectedYear: number;
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

const ComparisonTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const paguVal = payload[0]?.value || 0;
    const realisasiVal = payload[1]?.value || 0;
    const sisaVal = Math.max(0, paguVal - realisasiVal);
    const percentage = paguVal > 0 ? (realisasiVal / paguVal) * 100 : 0;
    
    return (
      <div className="bg-slate-900 border border-slate-800 text-white p-3.5 rounded-xl shadow-xl text-xs flex flex-col font-sans select-none z-50 max-w-sm">
        <p className="font-extrabold uppercase tracking-wider text-slate-300 mb-2 border-b border-white/10 pb-1.5 truncate">
          {payload[0]?.payload?.fullName || label}
        </p>
        <div className="space-y-1 font-mono">
          <div className="flex justify-between gap-6">
            <span className="text-slate-400">Pagu:</span>
            <span className="font-bold text-blue-400">{formatRupiah(paguVal)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-slate-400">Realisasi:</span>
            <span className="font-bold text-emerald-400">{formatRupiah(realisasiVal)}</span>
          </div>
          <div className="flex justify-between gap-6 pt-1 border-t border-white/5">
            <span className="text-slate-400">Sisa:</span>
            <span className="font-bold text-amber-400">{formatRupiah(sisaVal)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-slate-400">Penyerapan:</span>
            <span className="font-bold text-blue-300">{percentage.toFixed(2)}%</span>
          </div>
        </div>
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

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  color: 'blue' | 'emerald' | 'amber';
}

const StatCard = ({ title, value, subtitle, color }: StatCardProps) => {
  const colorMap = {
    blue: 'bg-white border-slate-200 text-blue-700',
    emerald: 'bg-white border-slate-200 text-emerald-700',
    amber: 'bg-white border-slate-200 text-amber-700'
  };
  return (
    <div className={`p-4 rounded-xl border shadow-sm hover:shadow transition-all ${colorMap[color]}`}>
      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block truncate">{title}</p>
      <h3 className="text-lg font-black text-slate-950 mt-1 truncate" title={value}>{value}</h3>
      <p className="text-[10px] mt-0.5 font-bold">{subtitle}</p>
    </div>
  );
};

export default function DashboardView({
  programs,
  kegiatans,
  subKegiatans,
  realisasis,
  pihakKetigas,
  dokumens,
  rkaList,
  onNavigate,
  onShowInfo,
  selectedYear
}: DashboardProps) {

  // Calculate totals
  const totalPaguAll = useMemo(() => subKegiatans.reduce((sum, s) => sum + (s.pagu || 0), 0), [subKegiatans]);
  const totalRealisasiAll = useMemo(() => subKegiatans.reduce((sum, s) => sum + (s.realisasi || 0), 0), [subKegiatans]);

  const programChartData = useMemo(() => {
    return programs.map(p => ({
      name: p.kode_program,
      fullName: p.nama_program,
      Pagu: p.pagu || 0,
      Realisasi: p.realisasi || 0
    }));
  }, [programs]);
  
  const pkSubKegCodes = useMemo(() => new Set(pihakKetigas.map(p => p.kode_sub_kegiatan)), [pihakKetigas]);
  const totalPaguPK = useMemo(() => 
    subKegiatans.filter(s => pkSubKegCodes.has(s.kode_sub_kegiatan)).reduce((sum, s) => sum + (s.pagu || 0), 0),
    [subKegiatans, pkSubKegCodes]
  );
  const totalRealisasiPK = useMemo(() => 
    subKegiatans.filter(s => pkSubKegCodes.has(s.kode_sub_kegiatan)).reduce((sum, s) => sum + (s.realisasi || 0), 0),
    [subKegiatans, pkSubKegCodes]
  );
  
  const totalPaguNonPK = Math.max(0, totalPaguAll - totalPaguPK);
  const totalRealisasiNonPK = Math.max(0, totalRealisasiAll - totalRealisasiPK);
  
  const totalSisaAll = Math.max(0, totalPaguAll - totalRealisasiAll);
  const totalSisaNonPK = Math.max(0, totalPaguNonPK - totalRealisasiNonPK);
  const totalSisaPK = Math.max(0, totalPaguPK - totalRealisasiPK);
  
  const persentaseSerapanAll = totalPaguAll > 0 ? (totalRealisasiAll / totalPaguAll) * 100 : 0;
  const persentaseSerapanPK = totalPaguPK > 0 ? (totalRealisasiPK / totalPaguPK) * 100 : 0;
  const persentaseSerapanNonPK = totalPaguNonPK > 0 ? (totalRealisasiNonPK / totalPaguNonPK) * 100 : 0;

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

  // Notifications
  const alerts = useMemo(() => {
    const list: string[] = [];
    // If absorption is very low for modern time of year (e.g. June 2026 should be around 40-50%)
    if (persentaseSerapanAll < 30) {
      list.push(`Serapan anggaran keseluruhan baru mencapai ${persentaseSerapanAll.toFixed(2)}%, di bawah target paruh tahun 40%.`);
    }

    // Check if any Sub-Kegiatan has realisasi exceeding pagu
    subKegiatans.forEach(s => {
      if (s.realisasi > s.pagu) {
        list.push(`Defisit Anggaran: Sub Kegiatan "${s.nama_sub_kegiatan}" melampaui Pagu sebesar ${formatRupiah(s.realisasi - s.pagu)}!`);
      }
    });

    return list;
  }, [persentaseSerapanAll, subKegiatans]);

  return (
    <div className="space-y-6" id="dashboard-container">
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
            onClick={() => onShowInfo?.({
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
      <div className="space-y-4" id="stats-grid">
        {/* Row 1: Overall */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Total Pagu" value={formatRupiah(totalPaguAll)} subtitle="Total Anggaran" color="blue" />
          <StatCard title="Total Realisasi" value={formatRupiah(totalRealisasiAll)} subtitle={`${persentaseSerapanAll.toFixed(1)}% Serapan`} color="emerald" />
          <StatCard title="Sisa Anggaran" value={formatRupiah(totalSisaAll)} subtitle="Dana Tersisa" color="amber" />
        </div>
        {/* Row 2: Non-PK */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Pagu Non-PK" value={formatRupiah(totalPaguNonPK)} subtitle="Total Anggaran Non-PK" color="blue" />
          <StatCard title="Realisasi Non-PK" value={formatRupiah(totalRealisasiNonPK)} subtitle={`${persentaseSerapanNonPK.toFixed(1)}% Serapan`} color="emerald" />
          <StatCard title="Sisa Anggaran Non-PK" value={formatRupiah(totalSisaNonPK)} subtitle="Dana Tersisa Non-PK" color="amber" />
        </div>
        {/* Row 3: PK */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Pagu Pihak Ketiga" value={formatRupiah(totalPaguPK)} subtitle="Total Anggaran PK" color="blue" />
          <StatCard title="Realisasi Pihak Ketiga" value={formatRupiah(totalRealisasiPK)} subtitle={`${persentaseSerapanPK.toFixed(1)}% Serapan`} color="emerald" />
          <StatCard title="Sisa Anggaran PK" value={formatRupiah(totalSisaPK)} subtitle="Dana Tersisa PK" color="amber" />
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
                  Tren Realisasi Bulanan TA {selectedYear}
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
                  strokeDasharray={`${persentaseSerapanAll}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-2xl font-black text-slate-850">{persentaseSerapanAll.toFixed(1)}%</span>
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
                <span className="font-bold text-emerald-800">{persentaseSerapanAll >= 80 ? "Aktif" : "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Sedang (50% - 79%)</span>
                <span className="font-bold text-blue-800">{(persentaseSerapanAll >= 50 && persentaseSerapanAll < 80) ? "Aktif" : "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Lambat (&lt; 50%)</span>
                <span className="font-bold text-amber-700">{persentaseSerapanAll < 50 ? "Aktif" : "-"}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full mt-4 text-center text-xs border-t border-slate-100 pt-3">
            <div className="p-2 bg-blue-50/50 rounded-xl border border-blue-100/50">
              <p className="text-slate-500 font-semibold text-[10px] uppercase">Realisasi</p>
              <p className="font-bold text-blue-700 font-mono text-[11px] mt-0.5">{formatRupiah(totalRealisasiAll)}</p>
            </div>
            <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-slate-500 font-semibold text-[10px] uppercase">Sisa Kas</p>
              <p className="font-bold text-slate-750 font-mono text-[11px] mt-0.5">{formatRupiah(totalSisaAll)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Perbandingan Pagu vs Realisasi per Program (Bar Chart) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-fade-in" id="chart-comparison-container">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-700" />
              Perbandingan Pagu vs Realisasi Keuangan per Program (TA {selectedYear})
            </h3>
            <p className="text-slate-600 text-xs mt-1 font-medium">
              Analisis perbandingan antara ketetapan Pagu anggaran belanja dengan capaian Realisasi keuangan masing-masing program
            </p>
          </div>
          {/* Quick legend and summary badges */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-800 rounded-lg border border-blue-100 font-bold">
              <span className="w-2.5 h-2.5 rounded bg-blue-600 shrink-0"></span>
              Pagu
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-100 font-bold">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500 shrink-0"></span>
              Realisasi
            </div>
          </div>
        </div>

        {programChartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
            <Layers size={32} className="text-slate-400 mb-2" />
            <p className="text-slate-600 font-bold text-sm">Belum Ada Program Terdaftar untuk Tahun Anggaran {selectedYear}</p>
            <p className="text-slate-400 text-xs mt-1">Silakan tambahkan data Program di menu Program atau sesuaikan tahun anggaran di kanan atas.</p>
          </div>
        ) : (
          <div className="h-72 w-full text-[10px]" id="chart-comparison-recharts">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={programChartData}
                margin={{ top: 10, right: 10, left: -5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#475569', fontSize: 10, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tickFormatter={formatYAxis} 
                  tick={{ fill: '#475569', fontSize: 9, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <RechartsTooltip content={<ComparisonTooltip />} cursor={{ fill: '#f1f5f9', opacity: 0.4 }} />
                <Bar 
                  dataKey="Pagu" 
                  fill="#3b82f6" 
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar 
                  dataKey="Realisasi" 
                  fill="#10b981" 
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
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

    </div>
  );
}
