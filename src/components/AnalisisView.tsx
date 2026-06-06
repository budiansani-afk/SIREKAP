import React, { useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  PieChart as PieIcon, 
  Award, 
  Activity, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { Program, Kegiatan, SubKegiatan, Realisasi } from '../types';
import { formatRupiah, formatPercent } from '../utils/helpers';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  BarChart, 
  Bar, 
  Cell,
  Legend 
} from 'recharts';

interface AnalisisViewProps {
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  realisasis: Realisasi[];
}

export default function AnalisisView({
  programs,
  kegiatans,
  subKegiatans,
  realisasis
}: AnalisisViewProps) {

  // Sorter rankings: highest absorption sub-kegiatan
  const highestAbsorptionSub = useMemo(() => {
    if (subKegiatans.length === 0) return null;
    return [...subKegiatans].sort((a,b) => b.persentase - a.persentase)[0];
  }, [subKegiatans]);

  // Lowest absorption sub-kegiatan
  const lowestAbsorptionSub = useMemo(() => {
    if (subKegiatans.length === 0) return null;
    return [...subKegiatans].sort((a,b) => a.persentase - b.persentase)[0];
  }, [subKegiatans]);

  // Largest sub-kegiatan in terms of Pagu volume
  const largestPaguSub = useMemo(() => {
    if (subKegiatans.length === 0) return null;
    return [...subKegiatans].sort((a,b) => b.pagu - a.pagu)[0];
  }, [subKegiatans]);

  // Sorter progress ranking list representation
  const rankedSubKegiatans = useMemo(() => {
    return [...subKegiatans].sort((a,b) => b.persentase - a.persentase);
  }, [subKegiatans]);

  // Process data for Recharts Trend Area Chart
  const trendChartData = useMemo(() => {
    const monthsName = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return monthsName.map(m => {
      const totalInMonth = realisasis
        .filter(r => r.bulan === m)
        .reduce((sum, r) => sum + r.nominal_realisasi, 0);

      return {
        name: m.substring(0,3),
        Realisasi: totalInMonth
      };
    });
  }, [realisasis]);

  // Process data for Program Absorption Bar Chart
  const programChartData = useMemo(() => {
    return programs.map(p => ({
      name: p.kode_program,
      Pagu: p.pagu,
      Realisasi: p.realisasi
    }));
  }, [programs]);

  return (
    <div className="space-y-6" id="analisis-module-root">
      
      {/* Title */}
      <div className="flex items-center gap-1.5 p-4 bg-white rounded-xl border border-slate-100 shadow-sm" id="analisis-title-section">
        <Sparkles className="text-blue-800 animate-spin" size={22} />
        <div>
          <h2 className="text-xl font-bold text-slate-800">Analisis Pagu & Tren Serapan</h2>
          <p className="text-xs text-slate-600">Visualisasi data interaktif, rekapitulasi efisiensi satker, dan sorotan grafik bulanan.</p>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="analisis-metrics-grid">
        
        {/* Highest absorption */}
        <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4.5 flex items-start gap-3.5 shadow-xs">
          <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-800 font-bold"><TrendingUp size={20} /></div>
          <div className="min-w-0">
            <span className="text-[10px] text-emerald-800 font-extrabold uppercase tracking-wide">Penerapan Tertinggi</span>
            <h4 className="text-base font-black text-emerald-950 mt-1 leading-snug truncate" title={highestAbsorptionSub?.nama_sub_kegiatan}>
              {highestAbsorptionSub ? `${highestAbsorptionSub.persentase}%` : '0%'}
            </h4>
            <p className="text-[10px] text-emerald-700 font-medium truncate mt-0.5">{highestAbsorptionSub?.nama_sub_kegiatan || 'Sub-Kegiatan'}</p>
          </div>
        </div>

        {/* Lowest absorption */}
        <div className="bg-rose-50 rounded-2xl border border-rose-100 p-4.5 flex items-start gap-3.5 shadow-xs">
          <div className="p-2.5 bg-rose-100 rounded-xl text-rose-800 font-bold"><TrendingDown size={20} /></div>
          <div className="min-w-0">
            <span className="text-[10px] text-rose-800 font-extrabold uppercase tracking-wide">Penerapan Terendah</span>
            <h4 className="text-base font-black text-rose-950 mt-1 leading-snug truncate" title={lowestAbsorptionSub?.nama_sub_kegiatan}>
              {lowestAbsorptionSub ? `${lowestAbsorptionSub.persentase}%` : '0%'}
            </h4>
            <p className="text-[10px] text-rose-700 font-medium truncate mt-0.5">{lowestAbsorptionSub?.nama_sub_kegiatan || 'Sub-Kegiatan'}</p>
          </div>
        </div>

        {/* Sizing master volume */}
        <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4.5 flex items-start gap-3.5 shadow-xs">
          <div className="p-2.5 bg-blue-100 rounded-xl text-blue-800 font-bold"><Award size={20} /></div>
          <div className="min-w-0">
            <span className="text-[10px] text-blue-800 font-extrabold uppercase tracking-wide">Pagu Terbesar TA 2026</span>
            <h4 className="text-base font-black text-blue-950 mt-1 leading-snug truncate" title={largestPaguSub?.nama_sub_kegiatan}>
              {largestPaguSub ? formatRupiah(largestPaguSub.pagu) : 'Rp 0'}
            </h4>
            <p className="text-[10px] text-blue-700 font-medium truncate mt-0.5">{largestPaguSub?.nama_sub_kegiatan || 'Sub-Kegiatan'}</p>
          </div>
        </div>

        {/* KPI health rating indicator */}
        <div className="bg-purple-50 rounded-2xl border border-purple-100 p-4.5 flex items-start gap-3.5 shadow-xs">
          <div className="p-2.5 bg-purple-100 rounded-xl text-purple-800 font-bold"><Activity size={20} /></div>
          <div className="min-w-0">
            <span className="text-[10px] text-purple-800 font-extrabold uppercase tracking-wide">Rasio Sehat Penggunaan</span>
            <h4 className="text-base font-black text-purple-950 mt-1 leading-snug truncate">
              {subKegiatans.filter(s => s.persentase >= 50).length} / {subKegiatans.length} Usulan
            </h4>
            <p className="text-[10px] text-purple-700 font-semibold truncate mt-0.5">Sudah melewati target serapan 50%.</p>
          </div>
        </div>

      </div>

      {/* Interactive Charts Panel and Trendings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="analisis-charts-panel">
        
        {/* Trend area chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase">
            <TrendingUp size={14} className="text-blue-800" />
            Fluktuasi Realisasi Belanja Bulanan (Tren Kas)
          </h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendChartData}>
                <defs>
                  <linearGradient id="colorRealisasi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e40af" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#1e40af" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: '10px', fontWeight: 'bold' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '10px' }} />
                <Tooltip formatter={(value) => [formatRupiah(Number(value)), 'Realisasi']} />
                <Area type="monotone" dataKey="Realisasi" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRealisasi)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sizing comparative chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase">
              <PieIcon size={14} className="text-blue-800" />
              Alokasi Pagu vs Realisasi per Program Kegiatan
            </h4>
            <span className="text-[10px] bg-blue-100/60 text-blue-900 border border-blue-200 px-2 py-0.5 rounded font-black font-mono">DPA TERVAKID</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={programChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="paguGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" />
                    <stop offset="100%" stopColor="#60a5fa" />
                  </linearGradient>
                  <linearGradient id="realisasiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ea580c" />
                    <stop offset="100%" stopColor="#fdbc74" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: '10px', fontWeight: 'bold' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '10px' }} />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const paguVal = Number(payload[0].value || 0);
                      const realisasiVal = Number(payload[1].value || 0);
                      const sisa = Math.max(0, paguVal - realisasiVal);
                      const p = paguVal > 0 ? (realisasiVal / paguVal) * 100 : 0;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs text-left max-w-[240px] space-y-1.5">
                          <p className="font-extrabold border-b border-slate-700 pb-1 text-slate-350 font-mono">KODE: {label}</p>
                          <div className="space-y-0.5 font-semibold">
                            <p className="flex justify-between gap-4"><span className="text-blue-300">Pagu:</span> <span className="font-mono">{formatRupiah(paguVal)}</span></p>
                            <p className="flex justify-between gap-4"><span className="text-orange-350 text-orange-400">Realisasi:</span> <span className="font-mono text-orange-300 font-extrabold">{formatRupiah(realisasiVal)}</span></p>
                            <p className="flex justify-between gap-4 border-t border-dashed border-slate-700/50 pt-1"><span className="text-slate-405">Sisa:</span> <span className="font-mono">{formatRupiah(sisa)}</span></p>
                            <p className="flex justify-between gap-4 text-emerald-400 font-black"><span className="uppercase text-[9px] tracking-wider leading-relaxed">Rasio Serapan:</span> <span>{p.toFixed(2)}%</span></p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend iconSize={10} style={{ fontSize: '11px', fontWeight: 'bold' }} />
                <Bar dataKey="Pagu" fill="url(#paguGrad)" radius={[4, 4, 0, 0]} name="Alokasi Pagu DPA" />
                <Bar dataKey="Realisasi" fill="url(#realisasiGrad)" radius={[4, 4, 0, 0]} name="Realisasi Diserap" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Performance Ranked list representing "Aparatur Sektor" achievements */}
      <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs" id="rankings-board bg-white border">
        <h4 className="text-xs font-bold text-slate-800 mb-4 flex items-center gap-1.5 uppercase">
          <Award size={14} className="text-blue-800 animate-bounce" />
          Daftar Urutan (Rangking) Efisiensi Capaian Serapan Anggaran Sub-Kegiatan
        </h4>
        
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                <th className="p-3 w-16 text-center">RANGK</th>
                <th className="p-3 w-36">KODE SUB</th>
                <th className="p-3">NAMA SUB-KEGIATAN</th>
                <th className="p-3 text-right">PAGU DPA</th>
                <th className="p-3 text-right">REALISASI KAS</th>
                <th className="p-3 text-right">SISA ANGGARAN</th>
                <th className="p-3 text-center">RASIO PENYERAPAN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 text-slate-700">
              {rankedSubKegiatans.map((sk, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition">
                  <td className="p-3 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-black text-xs ${idx === 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : idx === 1 ? 'bg-slate-100 text-slate-900 border' : idx === 2 ? 'bg-orange-50 text-orange-950 border' : 'bg-slate-50 text-slate-700'}`}>
                      {idx + 1}
                    </span>
                  </td>
                  <td className="p-3 font-mono font-bold text-[11px] text-slate-900">{sk.kode_sub_kegiatan}</td>
                  <td className="p-3 font-semibold text-slate-900 max-w-sm truncate" title={sk.nama_sub_kegiatan}>{sk.nama_sub_kegiatan}</td>
                  <td className="p-3 text-right font-medium">{formatRupiah(sk.pagu)}</td>
                  <td className="p-3 text-right text-emerald-900 font-bold">{formatRupiah(sk.realisasi)}</td>
                  <td className="p-3 text-right text-rose-950 font-bold">{formatRupiah(sk.sisa ?? Math.max(0, sk.pagu - sk.realisasi))}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full ${sk.persentase >= 75 ? 'bg-emerald-600' : sk.persentase >= 45 ? 'bg-blue-600' : 'bg-rose-600'}`} 
                          style={{ width: `${Math.min(100, sk.persentase)}%` }}
                        />
                      </div>
                      <span className="font-black text-[10px] text-slate-900">{sk.persentase}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
