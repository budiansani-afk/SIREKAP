import React, { useMemo, useState } from 'react';
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
  ArrowUpRight,
  ArrowRight,
  ShieldAlert,
  FileSpreadsheet,
  Receipt,
  X,
  CheckCircle2,
  ExternalLink,
  BellRing,
  Building
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

export interface OverbudgetItem {
  id: string;
  kode_program: string;
  kode_kegiatan: string;
  kode_sub_kegiatan: string;
  nama_sub_kegiatan: string;
  kode_rekening?: string;
  uraian_belanja: string;
  pagu: number;
  realisasi: number;
  defisit: number;
  persentase: number;
  transaksiCount: number;
  transaksiList: Realisasi[];
}

interface DashboardProps {
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  realisasis: Realisasi[];
  pihakKetigas: BelanjaPihakKetiga[];
  rkaList: RKA[];
  dokumens: DokumenArsip[];
  onNavigate?: (page: 'dashboard' | 'program' | 'rka' | 'realisasi' | 'pihakKetiga' | 'dokumen' | 'laporan' | 'analisis' | 'logs' | 'pengaturan', tabDetail?: string, filterInfo?: { subKegiatan?: string; uraian?: string }) => void;
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
    const sisaVal = paguVal - realisasiVal;
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
            <span className={`font-bold ${sisaVal < 0 ? 'text-red-400' : 'text-amber-400'}`}>{formatRupiah(sisaVal)}</span>
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
  color: 'blue' | 'emerald' | 'amber' | 'rose';
  onClick?: () => void;
  actionText?: string;
}

const StatCard = ({ title, value, subtitle, color, onClick, actionText = 'Buka →' }: StatCardProps) => {
  const colorMap = {
    blue: 'bg-white border-slate-200 text-blue-700',
    emerald: 'bg-white border-slate-200 text-emerald-700',
    amber: 'bg-white border-slate-200 text-amber-700',
    rose: 'bg-white border-red-200 text-rose-700'
  };
  return (
    <div 
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`p-4 rounded-xl border shadow-2xs transition-all ${colorMap[color]} ${
        onClick 
          ? 'cursor-pointer hover:border-blue-500 hover:shadow-md hover:ring-2 hover:ring-blue-100 hover:scale-[1.01] active:scale-[0.99] group' 
          : ''
      }`}
      title={onClick ? `Klik untuk membuka informasi ${title}` : value}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block truncate">{title}</p>
        {onClick && (
          <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 group-hover:bg-blue-600 group-hover:text-white px-2 py-0.5 rounded transition-colors flex items-center gap-0.5 shrink-0 shadow-2xs">
            <span>{actionText}</span>
          </span>
        )}
      </div>
      <h3 className={`text-lg font-black mt-1.5 truncate ${color === 'rose' ? 'text-red-600' : 'text-slate-950'}`} title={value}>{value}</h3>
      <div className="text-[10.5px] mt-1 font-bold text-slate-600 flex items-center justify-between">
        <span>{subtitle}</span>
      </div>
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

  // Calculate totals (prefer sum of RKA rincian belanja if available)
  const totalPaguRka = useMemo(() => rkaList.reduce((sum, r) => sum + (r.jumlah || 0), 0), [rkaList]);
  const totalPaguSub = useMemo(() => subKegiatans.reduce((sum, s) => sum + (s.pagu || 0), 0), [subKegiatans]);
  const totalPaguAll = totalPaguRka > 0 ? totalPaguRka : totalPaguSub;

  const totalRealisasiAll = useMemo(() => {
    const sumRealList = realisasis.reduce((sum, r) => sum + (Number(r.nominal_realisasi) || 0), 0);
    const sumSub = subKegiatans.reduce((sum, s) => sum + (s.realisasi || 0), 0);
    return sumRealList > 0 ? sumRealList : sumSub;
  }, [realisasis, subKegiatans]);

  const programChartData = useMemo(() => {
    return programs.map(p => ({
      name: p.kode_program,
      fullName: p.nama_program,
      Pagu: p.pagu || 0,
      Realisasi: p.realisasi || 0
    }));
  }, [programs]);

  // Helper identik dengan getMatchedSp2dList di menu Belanja Pihak Ketiga
  const getMatchedSp2dListForPk = (m: { id?: string; kode_sub_kegiatan: string; uraian_belanja?: string }) => {
    return realisasis.filter(r => {
      if (m.id && r.id_pihak_ketiga === m.id) return true;
      if (m.id && r.id === `sp2d_pihak_ketiga_${m.id}`) return true;
      if (r.kode_sub_kegiatan !== m.kode_sub_kegiatan) return false;
      if (m.uraian_belanja && r.uraian_belanja) {
        const u1 = m.uraian_belanja.trim().toLowerCase();
        const u2 = r.uraian_belanja.trim().toLowerCase();
        return u1 === u2 || u1.includes(u2) || u2.includes(u1);
      }
      return true;
    });
  };

  const getPkItemRealisasi = (m: BelanjaPihakKetiga) => {
    const list = getMatchedSp2dListForPk(m);
    const sumSp2d = list.reduce((acc, r) => acc + (Number(r.nominal_realisasi) || 0), 0);
    return sumSp2d > 0 ? sumSp2d : (Number(m.realisasi) || 0);
  };
  
  const totalPaguPK = useMemo(() => {
    if (!pihakKetigas || pihakKetigas.length === 0) return 0;

    const matchedRkaKeys = new Set<string>();
    let total = 0;

    for (const p of pihakKetigas) {
      const pUraian = (p.uraian_belanja || '').trim().toLowerCase();
      const rkaMatch = rkaList.find(r => 
        (r.kode_sub_kegiatan === p.kode_sub_kegiatan && (r.uraian_belanja || '').trim().toLowerCase() === pUraian) ||
        (pUraian && (r.uraian_belanja || '').trim().toLowerCase() === pUraian)
      );

      if (rkaMatch) {
        const key = `${rkaMatch.kode_sub_kegiatan}_${rkaMatch.uraian_belanja}`;
        if (!matchedRkaKeys.has(key)) {
          matchedRkaKeys.add(key);
          total += (rkaMatch.jumlah || 0);
        }
      } else if (p.kode_sub_kegiatan) {
        const rkaSumForSub = rkaList
          .filter(r => r.kode_sub_kegiatan === p.kode_sub_kegiatan)
          .reduce((acc, curr) => acc + (curr.jumlah || 0), 0);

        if (rkaSumForSub > 0) {
          total += rkaSumForSub;
        } else {
          const linkedSub = subKegiatans.find(s => s.kode_sub_kegiatan === p.kode_sub_kegiatan);
          total += (linkedSub?.pagu || 0);
        }
      }
    }

    if (total === 0) {
      const pkSubKegCodes = new Set(pihakKetigas.map(p => p.kode_sub_kegiatan).filter(Boolean));
      const totalPaguRkaPK = rkaList.filter(r => pkSubKegCodes.has(r.kode_sub_kegiatan)).reduce((sum, r) => sum + (r.jumlah || 0), 0);
      const totalPaguSubPK = subKegiatans.filter(s => pkSubKegCodes.has(s.kode_sub_kegiatan)).reduce((sum, s) => sum + (s.pagu || 0), 0);
      total = totalPaguRkaPK > 0 ? totalPaguRkaPK : totalPaguSubPK;
    }

    return total;
  }, [pihakKetigas, rkaList, subKegiatans]);
  
  // Realisasi Pihak Ketiga dihitung 100% konsisten sesuai data dalam menu Belanja Pihak Ketiga
  const totalRealisasiPK = useMemo(() => {
    if (!pihakKetigas || pihakKetigas.length === 0) return 0;
    return pihakKetigas.reduce((sum, p) => sum + getPkItemRealisasi(p), 0);
  }, [pihakKetigas, realisasis]);
  
  const totalPaguNonPK = Math.max(0, totalPaguAll - totalPaguPK);
  const totalRealisasiNonPK = Math.max(0, totalRealisasiAll - totalRealisasiPK);
  
  const totalSisaAll = totalPaguAll - totalRealisasiAll;
  const totalSisaNonPK = totalPaguNonPK - totalRealisasiNonPK;
  const totalSisaPK = totalPaguPK - totalRealisasiPK;
  
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

  // Perhitungan komprehensif jenis belanja yang pencairannya melebihi pagu (Overbudget)
  const overbudgetBelanjaList = useMemo(() => {
    const map = new Map<string, {
      kode_sub_kegiatan: string;
      nama_sub_kegiatan: string;
      kode_program: string;
      kode_kegiatan: string;
      kode_rekening?: string;
      uraian_belanja: string;
      pagu: number;
      realisasi: number;
      transaksiCount: number;
      transaksiList: Realisasi[];
    }>();

    // 1. Kumpulkan pagu dari rkaList
    rkaList.forEach(r => {
      if (!r.kode_sub_kegiatan || !r.uraian_belanja) return;
      const sub = subKegiatans.find(s => s.kode_sub_kegiatan === r.kode_sub_kegiatan);
      const key = `${r.kode_sub_kegiatan}:::${r.uraian_belanja.trim()}`;
      if (!map.has(key)) {
        map.set(key, {
          kode_sub_kegiatan: r.kode_sub_kegiatan,
          nama_sub_kegiatan: sub?.nama_sub_kegiatan || r.kode_sub_kegiatan,
          kode_program: r.kode_program || sub?.kode_program || '',
          kode_kegiatan: r.kode_kegiatan || sub?.kode_kegiatan || '',
          kode_rekening: r.kode_rekening || '',
          uraian_belanja: r.uraian_belanja.trim(),
          pagu: r.jumlah || 0,
          realisasi: 0,
          transaksiCount: 0,
          transaksiList: []
        });
      } else {
        const item = map.get(key)!;
        item.pagu += (r.jumlah || 0);
        if (!item.kode_rekening && r.kode_rekening) item.kode_rekening = r.kode_rekening;
      }
    });

    // 2. Akumulasi pencairan realisasi SP2D
    realisasis.forEach(real => {
      if (!real.kode_sub_kegiatan || !real.uraian_belanja) return;
      const sub = subKegiatans.find(s => s.kode_sub_kegiatan === real.kode_sub_kegiatan);
      const key = `${real.kode_sub_kegiatan}:::${real.uraian_belanja.trim()}`;
      if (!map.has(key)) {
        map.set(key, {
          kode_sub_kegiatan: real.kode_sub_kegiatan,
          nama_sub_kegiatan: sub?.nama_sub_kegiatan || real.kode_sub_kegiatan,
          kode_program: real.kode_program || sub?.kode_program || '',
          kode_kegiatan: real.kode_kegiatan || sub?.kode_kegiatan || '',
          kode_rekening: '',
          uraian_belanja: real.uraian_belanja.trim(),
          pagu: real.pagu_anggaran_terpantau || 0,
          realisasi: real.nominal_realisasi || 0,
          transaksiCount: 1,
          transaksiList: [real]
        });
      } else {
        const item = map.get(key)!;
        item.realisasi += (real.nominal_realisasi || 0);
        item.transaksiCount += 1;
        item.transaksiList.push(real);
      }
    });

    // 3. Saring hanya belanja yang realisasi > pagu
    const list: OverbudgetItem[] = [];
    map.forEach((item, key) => {
      if (item.realisasi > item.pagu) {
        const defisit = item.realisasi - item.pagu;
        const persentase = item.pagu > 0 ? (item.realisasi / item.pagu) * 100 : 999;
        list.push({
          id: key,
          ...item,
          defisit,
          persentase
        });
      }
    });

    return list.sort((a, b) => b.defisit - a.defisit);
  }, [rkaList, realisasis, subKegiatans]);

  const [selectedOverbudgetDetail, setSelectedOverbudgetDetail] = useState<OverbudgetItem | null>(null);
  const [showPkDetailModal, setShowPkDetailModal] = useState<boolean>(false);

  const handleOpenBelanjaInRka = (item: OverbudgetItem) => {
    setSelectedOverbudgetDetail(null);
    onNavigate?.('rka', undefined, { subKegiatan: item.kode_sub_kegiatan, uraian: item.uraian_belanja });
  };

  const handleOpenBelanjaInRealisasi = (item: OverbudgetItem) => {
    setSelectedOverbudgetDetail(null);
    onNavigate?.('realisasi', undefined, { subKegiatan: item.kode_sub_kegiatan, uraian: item.uraian_belanja });
  };

  return (
    <div className="space-y-6" id="dashboard-container">
      {/* Compact Alerts (Sistem Peringatan Dini) */}
      {alerts.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-200/80 rounded-lg p-2.5 text-amber-950 text-[11px] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-l-4 border-l-amber-500" id="dashboard-alerts">
          <div className="flex items-center gap-1.5 font-black uppercase tracking-wide shrink-0 text-amber-900 select-none">
            <AlertTriangle className="text-amber-600 animate-pulse shrink-0" size={14} />
            <span>Peringatan Dini ({alerts.length})</span>
          </div>
          <div className="flex-1 min-w-0">
            <marquee scrollamount="6.0" className="cursor-default font-bold text-amber-900 block font-mono select-none">
              {alerts.join(" | ")}
            </marquee>
          </div>
        </div>
      )}

      {/* SECTION PERINGATAN DEFISIT: REALISASI ANGGARAN MELEBIHI PAGU */}
      {overbudgetBelanjaList.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 via-rose-50 to-orange-50 border-2 border-red-300 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 animate-fade-in" id="dashboard-overbudget-section">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-red-200/80 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-red-600 text-white rounded-xl shadow-md shrink-0">
                <ShieldAlert size={20} className="animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-red-950 uppercase tracking-wide flex items-center gap-2">
                    Peringatan: Realisasi Anggaran Melebihi Pagu
                  </h3>
                  <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-black rounded-full shadow-xs">
                    {overbudgetBelanjaList.length} Jenis Belanja Overbudget
                  </span>
                </div>
                <p className="text-[11px] text-red-800 mt-0.5">
                  Terdeteksi pencairan SP2D yang melampaui plafon pagu anggaran. <b>Klik pada jenis belanja di bawah ini untuk membuka dan meninjau rincian belanja dimaksud.</b>
                </p>
              </div>
            </div>
          </div>

          {/* Daftar kartu jenis belanja memanjang per baris rapat */}
          <div className="flex flex-col gap-2">
            {overbudgetBelanjaList.map((item, idx) => (
              <div 
                key={item.id || idx}
                onClick={() => setSelectedOverbudgetDetail(item)}
                className="bg-white hover:bg-red-50/70 border border-red-200 hover:border-red-400 p-2.5 sm:px-4 sm:py-2.5 rounded-xl shadow-2xs hover:shadow-xs transition-all cursor-pointer group flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4"
                title={`Klik untuk membuka rincian jenis belanja: ${item.uraian_belanja}`}
              >
                {/* Sisi Kiri: Ikon Notif Peringatan + Identitas Belanja */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Ikon Notifikasi Peringatan Berkedip/Aktif */}
                  <div className="relative shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-red-100 text-red-700 border border-red-200 group-hover:bg-red-600 group-hover:text-white transition-colors shadow-2xs">
                    <BellRing size={16} className="animate-pulse" />
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
                    </span>
                  </div>

                  {/* Uraian dan Sub-Kegiatan */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                        {item.kode_sub_kegiatan}
                      </span>
                      <span className="text-[10.5px] text-slate-500 truncate max-w-[280px]" title={item.nama_sub_kegiatan}>
                        {item.nama_sub_kegiatan}
                      </span>
                    </div>
                    <p className="font-extrabold text-slate-900 group-hover:text-red-700 transition-colors text-xs sm:text-[13px] truncate mt-0.5" title={item.uraian_belanja}>
                      {item.uraian_belanja}
                    </p>
                  </div>
                </div>

                {/* Sisi Kanan: Parameter Anggaran Tersusun Rapat Memanjang */}
                <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-5 shrink-0 flex-wrap sm:flex-nowrap border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                  <div className="text-right">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Pagu</span>
                    <span className="font-mono font-bold text-slate-700 text-xs">{formatRupiah(item.pagu)}</span>
                  </div>

                  <div className="text-right">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Realisasi SP2D</span>
                    <span className="font-mono font-black text-rose-700 text-xs">{formatRupiah(item.realisasi)}</span>
                  </div>

                  <div className="text-right flex flex-col items-end">
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-black rounded-full whitespace-nowrap shadow-2xs">
                      Defisit: +{formatRupiah(item.defisit)}
                    </span>
                    <span className="text-[9px] font-bold text-red-600 font-mono mt-0.5">
                      {item.persentase > 999 ? '>1000%' : `${item.persentase.toFixed(1)}%`} Serapan
                    </span>
                  </div>

                  {/* Tombol Aksi Buka Jenis Belanja */}
                  <div className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 group-hover:bg-red-600 text-red-700 group-hover:text-white border border-red-200 group-hover:border-red-600 text-[11px] font-extrabold rounded-lg transition-colors shrink-0">
                    <span>Buka Jenis Belanja</span>
                    <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ringkasan Utama Info Pagu Anggaran */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-md border border-blue-800 space-y-4" id="dashboard-pagu-banner">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <span className="text-[10px] uppercase font-mono font-extrabold tracking-widest text-blue-300 bg-blue-950/80 px-2.5 py-1 rounded-full border border-blue-700/50">
              Pagu Anggaran TA {selectedYear}
            </span>
            <h2 className="text-xl font-black font-display mt-1 text-white flex items-center gap-2">
              <DollarSign size={20} className="text-emerald-400" />
              Informasi Pagu Anggaran &amp; Realisasi
            </h2>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-300 font-medium">Total Pagu Terdaftar DPA</p>
            <p className="text-xl font-black font-mono text-emerald-400">{formatRupiah(totalPaguAll)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div 
            onClick={() => onNavigate?.('rka')}
            className="bg-white/10 hover:bg-white/15 backdrop-blur-xs p-3 rounded-xl border border-white/10 hover:border-white/30 space-y-1 cursor-pointer transition-all group"
            title="Klik untuk membuka informasi E-RKA Anggaran"
          >
            <div className="flex justify-between text-slate-300 text-[11px] font-bold">
              <span className="flex items-center gap-1 group-hover:text-emerald-300 transition-colors">
                Keseluruhan Pagu
                <ArrowRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
              <span className="text-emerald-400 font-mono">{persentaseSerapanAll.toFixed(1)}%</span>
            </div>
            <p className="text-base font-black font-mono text-white">{formatRupiah(totalPaguAll)}</p>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mt-1">
              <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${Math.min(persentaseSerapanAll, 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-slate-300 pt-1">
              <span>Realisasi: {formatRupiah(totalRealisasiAll)}</span>
              <span>Sisa: {formatRupiah(totalSisaAll)}</span>
            </div>
          </div>

          <div 
            onClick={() => onNavigate?.('realisasi')}
            className="bg-white/10 hover:bg-white/15 backdrop-blur-xs p-3 rounded-xl border border-white/10 hover:border-white/30 space-y-1 cursor-pointer transition-all group"
            title="Klik untuk membuka informasi Realisasi SP2D Non-PK"
          >
            <div className="flex justify-between text-slate-300 text-[11px] font-bold">
              <span className="flex items-center gap-1 group-hover:text-blue-300 transition-colors">
                Pagu Non-Pihak Ketiga
                <ArrowRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
              <span className="text-blue-300 font-mono">{persentaseSerapanNonPK.toFixed(1)}%</span>
            </div>
            <p className="text-base font-black font-mono text-white">{formatRupiah(totalPaguNonPK)}</p>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mt-1">
              <div className="bg-blue-400 h-full rounded-full" style={{ width: `${Math.min(persentaseSerapanNonPK, 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-slate-300 pt-1">
              <span>Realisasi: {formatRupiah(totalRealisasiNonPK)}</span>
              <span>Sisa: {formatRupiah(totalSisaNonPK)}</span>
            </div>
          </div>

          <div 
            onClick={() => setShowPkDetailModal(true)}
            className="bg-white/10 hover:bg-white/20 backdrop-blur-xs p-3 rounded-xl border border-white/10 hover:border-amber-400/60 space-y-1 cursor-pointer transition-all group shadow-2xs"
            title="Klik untuk melihat rincian alokasi & kontrak Belanja Pihak Ketiga"
          >
            <div className="flex justify-between text-slate-300 text-[11px] font-bold">
              <span className="flex items-center gap-1 text-white group-hover:text-amber-300 transition-colors">
                Pagu Pihak Ketiga
                <span className="text-[9px] bg-amber-400/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-400/30 flex items-center gap-0.5">
                  Detail <ArrowRight size={10} />
                </span>
              </span>
              <span className="text-amber-300 font-mono">{persentaseSerapanPK.toFixed(1)}%</span>
            </div>
            <p className="text-base font-black font-mono text-white">{formatRupiah(totalPaguPK)}</p>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mt-1">
              <div className="bg-amber-400 h-full rounded-full" style={{ width: `${Math.min(persentaseSerapanPK, 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-slate-300 pt-1">
              <span>Realisasi: {formatRupiah(totalRealisasiPK)}</span>
              <span>Sisa: {formatRupiah(totalSisaPK)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="space-y-4" id="stats-grid">
        {/* Row 1: Overall */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard 
            title="Total Pagu" 
            value={formatRupiah(totalPaguAll)} 
            subtitle="Total Anggaran DPA" 
            color="blue" 
            onClick={() => onNavigate?.('rka')}
            actionText="E-RKA →"
          />
          <StatCard 
            title="Total Realisasi" 
            value={formatRupiah(totalRealisasiAll)} 
            subtitle={`${persentaseSerapanAll.toFixed(1)}% Serapan`} 
            color="emerald" 
            onClick={() => onNavigate?.('realisasi')}
            actionText="SP2D →"
          />
          <StatCard 
            title="Sisa Anggaran" 
            value={formatRupiah(totalSisaAll)} 
            subtitle={totalSisaAll < 0 ? "Defisit Anggaran" : "Dana Tersisa"} 
            color={totalSisaAll < 0 ? "rose" : "amber"} 
            onClick={() => onNavigate?.('laporan')}
            actionText="Laporan →"
          />
        </div>
        {/* Row 2: Non-PK */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard 
            title="Pagu Non-PK" 
            value={formatRupiah(totalPaguNonPK)} 
            subtitle="Total Anggaran Non-PK" 
            color="blue" 
            onClick={() => onNavigate?.('rka')}
            actionText="E-RKA →"
          />
          <StatCard 
            title="Realisasi Non-PK" 
            value={formatRupiah(totalRealisasiNonPK)} 
            subtitle={`${persentaseSerapanNonPK.toFixed(1)}% Serapan`} 
            color="emerald" 
            onClick={() => onNavigate?.('realisasi')}
            actionText="SP2D →"
          />
          <StatCard 
            title="Sisa Anggaran Non-PK" 
            value={formatRupiah(totalSisaNonPK)} 
            subtitle={totalSisaNonPK < 0 ? "Defisit Anggaran Non-PK" : "Dana Tersisa Non-PK"} 
            color={totalSisaNonPK < 0 ? "rose" : "amber"} 
            onClick={() => onNavigate?.('laporan')}
            actionText="Laporan →"
          />
        </div>
        {/* Row 3: PK */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard 
            title="Pagu Pihak Ketiga" 
            value={formatRupiah(totalPaguPK)} 
            subtitle="Total Anggaran PK" 
            color="blue" 
            onClick={() => setShowPkDetailModal(true)}
            actionText="Lihat Rincian →"
          />
          <StatCard 
            title="Realisasi Pihak Ketiga" 
            value={formatRupiah(totalRealisasiPK)} 
            subtitle={`${persentaseSerapanPK.toFixed(1)}% Serapan`} 
            color="emerald" 
            onClick={() => setShowPkDetailModal(true)}
            actionText="Lihat Rincian →"
          />
          <StatCard 
            title="Sisa Anggaran PK" 
            value={formatRupiah(totalSisaPK)} 
            subtitle={totalSisaPK < 0 ? "Defisit Anggaran PK" : "Dana Tersisa PK"} 
            color={totalSisaPK < 0 ? "rose" : "amber"} 
            onClick={() => setShowPkDetailModal(true)}
            actionText="Lihat Rincian →"
          />
        </div>
      </div>

      {/* Structural Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 animate-fade-in" id="stats-mini-grid">
        <div 
          onClick={() => onNavigate?.('program', 'program')}
          className="bg-white p-3.5 rounded-xl border border-slate-200 text-center hover:bg-blue-50/50 hover:border-blue-400 cursor-pointer shadow-2xs group transition-all duration-200"
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
          className="bg-white p-3.5 rounded-xl border border-slate-200 text-center hover:bg-blue-50/50 hover:border-blue-400 cursor-pointer shadow-2xs group transition-all duration-200"
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
          className="bg-white p-3.5 rounded-xl border border-slate-200 text-center hover:bg-blue-50/50 hover:border-blue-400 cursor-pointer shadow-2xs group transition-all duration-200"
          title="Klik untuk langsung menuju informasi Sub-Kegiatan"
        >
          <Layers size={18} className="mx-auto text-slate-500 mb-1 group-hover:text-blue-600 transition-colors" />
          <h4 className="text-blue-900 text-lg font-black">{subKegiatans.length}</h4>
          <p className="text-slate-600 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1">
            Info Sub Kegiatan <span className="text-[10px] text-[#ea580c] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </p>
        </div>
        <div 
          onClick={() => setShowPkDetailModal(true)}
          className="bg-white p-3.5 rounded-xl border border-amber-200 text-center hover:bg-amber-50/50 hover:border-amber-400 cursor-pointer shadow-2xs group transition-all duration-200"
          title="Klik untuk melihat rincian informasi Belanja Pihak Ketiga"
        >
          <Building size={18} className="mx-auto text-amber-600 mb-1 group-hover:text-amber-700 transition-colors" />
          <h4 className="text-amber-950 text-lg font-black">{pihakKetigas.length}</h4>
          <p className="text-amber-800 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1">
            Info Pihak Ketiga <span className="text-[10px] text-amber-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </p>
        </div>
        <div 
          onClick={() => onNavigate?.('dokumen')}
          className="bg-white p-3.5 rounded-xl border border-slate-200 text-center hover:bg-blue-50/50 hover:border-blue-400 cursor-pointer shadow-2xs group transition-all duration-200"
          title="Klik untuk langsung menuju bagian arsip dokumen"
        >
          <FileCheck size={18} className="mx-auto text-slate-500 mb-1 group-hover:text-blue-600 transition-colors" />
          <h4 className="text-blue-900 text-lg font-black">{dokumens.length}</h4>
          <p className="text-slate-600 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1">
            Arsip Dokumen <span className="text-[10px] text-[#ea580c] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </p>
        </div>
      </div>

      {/* Charts Grid - 1 Baris Rapi & Informatif (3 Kolom Sejajar) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade-in items-stretch" id="dashboard-charts">
        
        {/* 1. Serapan Bulanan (Bar Chart) */}
        <div 
          onClick={() => onNavigate?.('analisis')}
          className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-400 cursor-pointer shadow-sm flex flex-col justify-between transition group duration-200 h-full" 
          id="chart-bulan"
          title="Klik untuk langsung menuju informasi Tren Realisasi Bulanan"
        >
          <div>
            <div className="flex justify-between items-start gap-2">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                  <FolderLock size={16} className="text-blue-700" />
                  Tren Realisasi Bulanan (TA {selectedYear})
                </h3>
                <p className="text-slate-500 text-[11px] mt-0.5 font-medium">Realisasi SP2D per bulan berjalan</p>
              </div>
              <div className="text-right text-[9px] text-slate-500 font-bold bg-slate-50 px-2 py-1 rounded border border-slate-200 shrink-0">
                Tertinggi: <span className="font-mono text-emerald-800 font-black block">{formatRupiah(maxMonthAmount)}</span>
              </div>
            </div>
          </div>
          
          <div className="my-auto py-2 h-52 w-full text-[10px]" id="chart-months-bars-container" onClick={(e) => e.stopPropagation()}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
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
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-[10px] text-slate-600 font-bold">
            <span>Total Realisasi SP2D:</span>
            <span className="font-mono font-black text-blue-800 text-xs" title={formatRupiah(totalRealisasiAll)}>{formatRupiah(totalRealisasiAll)}</span>
          </div>
        </div>

        {/* 2. Donut Gauge for overall Serapan */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-full" id="chart-gauge">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
              <PieChart size={16} className="text-blue-700" />
              Persentase Kinerja Serapan
            </h3>
            <p className="text-slate-500 text-[11px] mt-0.5 font-medium">Visualisasi efisiensi penyerapan DPA dinas</p>
          </div>

          <div className="flex flex-col items-center justify-center my-auto py-2">
            <div className="relative w-36 h-36 flex items-center justify-center">
              {/* Donut SVG */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-100"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-blue-600 transition-all duration-700 ease-out"
                  strokeWidth="3.5"
                  strokeDasharray={`${Math.min(persentaseSerapanAll, 100)}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-1">
                <span className="text-xl font-black text-slate-900 font-mono tracking-tight leading-none">
                  {persentaseSerapanAll.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                </span>
                <p className="text-[9px] text-slate-500 font-extrabold tracking-wider uppercase mt-1">TERSERAP</p>
                <span className="text-[10px] font-mono font-black text-blue-700 mt-1 px-2 py-0.5 bg-blue-50/90 rounded border border-blue-150 block truncate max-w-[125px]" title={formatRupiah(totalRealisasiAll)}>
                  {formatRupiah(totalRealisasiAll)}
                </span>
              </div>
            </div>
            
            {/* Status referensi kinerja */}
            <div className="w-full mt-3.5 space-y-1 text-[10px] bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-500 pb-1 border-b border-slate-200">
                <span>Rujukan Status Kinerja</span>
                <span>Status</span>
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

          <div className="grid grid-cols-2 gap-2 w-full pt-3 border-t border-slate-100 text-center text-xs">
            <div className="p-2 bg-blue-50/60 rounded-xl border border-blue-150/60">
              <p className="text-slate-500 font-semibold text-[9px] uppercase tracking-wider">Anggaran Terserap</p>
              <p className="font-extrabold text-blue-800 font-mono text-[11px] mt-0.5 truncate" title={formatRupiah(totalRealisasiAll)}>
                {formatRupiah(totalRealisasiAll)}
              </p>
            </div>
            <div className="p-2 bg-slate-50 rounded-xl border border-slate-200/70">
              <p className="text-slate-500 font-semibold text-[9px] uppercase tracking-wider">Sisa Anggaran</p>
              <p className="font-extrabold text-slate-800 font-mono text-[11px] mt-0.5 truncate" title={formatRupiah(totalSisaAll)}>
                {formatRupiah(totalSisaAll)}
              </p>
            </div>
          </div>
        </div>

        {/* 3. Perbandingan Pagu vs Realisasi per Program (Bar Chart) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-full" id="chart-comparison-container">
          <div>
            <div className="flex justify-between items-start gap-2">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                  <TrendingUp size={16} className="text-blue-700" />
                  Pagu vs Realisasi Program
                </h3>
                <p className="text-slate-500 text-[11px] mt-0.5 font-medium">Perbandingan pagu &amp; serapan program</p>
              </div>
              {/* Quick legend */}
              <div className="flex items-center gap-2 text-[10px] shrink-0 bg-slate-50 px-2 py-1 rounded border border-slate-150">
                <span className="flex items-center gap-1 font-bold text-blue-700">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span> Pagu
                </span>
                <span className="flex items-center gap-1 font-bold text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Realisasi
                </span>
              </div>
            </div>
          </div>

          {programChartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center my-auto py-8 text-center border border-dashed border-slate-200 rounded-xl">
              <Layers size={24} className="text-slate-400 mb-1" />
              <p className="text-slate-600 font-bold text-xs">Belum Ada Program TA {selectedYear}</p>
            </div>
          ) : (
            <div className="my-auto py-2 h-52 w-full text-[10px]" id="chart-comparison-recharts">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={programChartData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis 
                    dataKey="name" 
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
                  <RechartsTooltip content={<ComparisonTooltip />} cursor={{ fill: '#f1f5f9', opacity: 0.4 }} />
                  <Bar 
                    dataKey="Pagu" 
                    fill="#3b82f6" 
                    radius={[3, 3, 0, 0]}
                    maxBarSize={18}
                  />
                  <Bar 
                    dataKey="Realisasi" 
                    fill="#10b981" 
                    radius={[3, 3, 0, 0]}
                    maxBarSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-[10px] text-slate-600 font-bold">
            <span>Total Program Terdaftar:</span>
            <span className="font-bold text-slate-800">{programs.length} Program Kerja</span>
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

      {/* MODAL DETAIL RINCIAN JENIS BELANJA MELEBIHI PAGU */}
      {selectedOverbudgetDetail && (
        <div 
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in"
          onClick={() => setSelectedOverbudgetDetail(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border-2 border-red-300 max-w-2xl w-full overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
                  <AlertTriangle size={20} className="text-white animate-pulse" />
                </div>
                <div>
                  <h3 className="font-black text-sm tracking-wide uppercase">Rincian Jenis Belanja Melampaui Pagu (Overbudget)</h3>
                  <p className="text-[11px] text-red-100 font-medium">Informasi Defisit Anggaran &amp; Riwayat Pencairan SP2D</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedOverbudgetDetail(null)}
                className="text-white/80 hover:text-white font-black text-xl p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
              {/* Identitas Belanja */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Sub-Kegiatan</span>
                    <p className="font-bold text-slate-800 text-xs">
                      {selectedOverbudgetDetail.kode_sub_kegiatan} - {selectedOverbudgetDetail.nama_sub_kegiatan}
                    </p>
                  </div>
                  {selectedOverbudgetDetail.kode_rekening && (
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-700 font-mono text-[10px] font-bold rounded">
                      Rek: {selectedOverbudgetDetail.kode_rekening}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Uraian / Jenis Belanja</span>
                  <p className="font-black text-blue-950 text-sm mt-0.5">
                    {selectedOverbudgetDetail.uraian_belanja}
                  </p>
                </div>
              </div>

              {/* Financial KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl">
                  <span className="text-[10px] text-blue-700 font-bold block">Pagu Anggaran</span>
                  <span className="font-mono font-black text-blue-900 text-xs mt-0.5 block">{formatRupiah(selectedOverbudgetDetail.pagu)}</span>
                </div>
                <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
                  <span className="text-[10px] text-rose-700 font-bold block">Realisasi SP2D</span>
                  <span className="font-mono font-black text-rose-900 text-xs mt-0.5 block">{formatRupiah(selectedOverbudgetDetail.realisasi)}</span>
                </div>
                <div className="bg-red-100 border border-red-300 p-2.5 rounded-xl">
                  <span className="text-[10px] text-red-800 font-black block">Defisit / Kelebihan</span>
                  <span className="font-mono font-black text-red-700 text-xs mt-0.5 block">+{formatRupiah(selectedOverbudgetDetail.defisit)}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
                  <span className="text-[10px] text-amber-700 font-bold block">Persentase Serapan</span>
                  <span className="font-mono font-black text-amber-900 text-xs mt-0.5 block">
                    {selectedOverbudgetDetail.persentase > 999 ? '>1000%' : `${selectedOverbudgetDetail.persentase.toFixed(1)}%`}
                  </span>
                </div>
              </div>

              {/* Tabel Riwayat Transaksi SP2D */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                    <Receipt size={14} className="text-blue-700" />
                    Daftar Pencairan SP2D Terkait ({selectedOverbudgetDetail.transaksiList.length} Transaksi)
                  </h4>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-2 pl-3">No.</th>
                        <th className="p-2">Tanggal / Bulan</th>
                        <th className="p-2">Keterangan / SP2D</th>
                        <th className="p-2 text-right pr-3">Nominal Realisasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {selectedOverbudgetDetail.transaksiList.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-slate-400 italic">Tidak ada catatan transaksi spesifik.</td>
                        </tr>
                      ) : (
                        selectedOverbudgetDetail.transaksiList.map((t, idx) => (
                          <tr key={t.id || idx} className="hover:bg-slate-50">
                            <td className="p-2 pl-3 font-mono text-slate-500">{idx + 1}</td>
                            <td className="p-2 font-mono">
                              <span className="font-bold text-slate-800">{t.tanggal}</span>
                              <span className="text-[10px] text-slate-500 block">({t.bulan})</span>
                            </td>
                            <td className="p-2 truncate max-w-[200px]" title={t.keterangan || t.uraian_belanja}>
                              {t.keterangan || t.uraian_belanja}
                            </td>
                            <td className="p-2 pr-3 text-right font-mono font-bold text-rose-800">
                              {formatRupiah(t.nominal_realisasi)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Petunjuk Aksi */}
              <p className="text-[10.5px] text-slate-500 italic bg-amber-50/70 border border-amber-200/70 p-2.5 rounded-lg">
                💡 <b>Aksi Penanganan:</b> Anda dapat membuka jenis belanja ini langsung di menu <b>E-RKA</b> untuk menyesuaikan alokasi pagu anggaran atau di menu <b>Realisasi SP2D</b> untuk memeriksa berkas transaksi keuangan terkait.
              </p>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedOverbudgetDetail(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200 transition text-xs cursor-pointer"
              >
                Tutup
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenBelanjaInRka(selectedOverbudgetDetail)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-xs transition text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet size={14} />
                  Buka di E-RKA Detail Belanja
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenBelanjaInRealisasi(selectedOverbudgetDetail)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-xs transition text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <TrendingUp size={14} />
                  Buka di Realisasi SP2D
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RINCIAN BELANJA PIHAK KETIGA */}
      {showPkDetailModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fade-in overflow-y-auto"
          onClick={() => setShowPkDetailModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden my-auto animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600/40 text-blue-200 border border-blue-400/30 rounded-xl">
                  <Briefcase size={22} className="text-blue-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-black tracking-widest text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-600/40 uppercase">
                      Informasi Pihak Ketiga TA {selectedYear}
                    </span>
                    <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-slate-300">
                      {pihakKetigas.length} Kontrak Terdata
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-white mt-1">
                    Rincian Alokasi &amp; Realisasi Belanja Pihak Ketiga
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPkDetailModal(false)}
                className="p-1.5 hover:bg-white/20 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
                title="Tutup Modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {/* 4 Ringkasan Angka Utama */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-left">
                  <span className="text-[10px] text-blue-700 font-bold block uppercase tracking-wider">Total Pagu PK</span>
                  <span className="font-mono font-black text-blue-950 text-sm mt-0.5 block">{formatRupiah(totalPaguPK)}</span>
                  <span className="text-[10px] text-blue-600 font-medium">Alokasi Kontrak/DPA</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-left">
                  <span className="text-[10px] text-emerald-700 font-bold block uppercase tracking-wider">Realisasi SP2D</span>
                  <span className="font-mono font-black text-emerald-950 text-sm mt-0.5 block">{formatRupiah(totalRealisasiPK)}</span>
                  <span className="text-[10px] text-emerald-600 font-medium">Sudah Dicairkan</span>
                </div>
                <div className={`p-3 rounded-xl border text-left ${totalSisaPK < 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                  <span className={`text-[10px] font-bold block uppercase tracking-wider ${totalSisaPK < 0 ? 'text-red-700' : 'text-amber-700'}`}>
                    Sisa Anggaran PK
                  </span>
                  <span className={`font-mono font-black text-sm mt-0.5 block ${totalSisaPK < 0 ? 'text-red-700' : 'text-amber-950'}`}>
                    {formatRupiah(totalSisaPK)}
                  </span>
                  <span className={`text-[10px] font-medium ${totalSisaPK < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {totalSisaPK < 0 ? 'Defisit Anggaran' : 'Sisa Belum Cair'}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-left">
                  <span className="text-[10px] text-slate-700 font-bold block uppercase tracking-wider">Tingkat Serapan</span>
                  <span className="font-mono font-black text-slate-900 text-sm mt-0.5 block">{persentaseSerapanPK.toFixed(1)}%</span>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden mt-1.5">
                    <div className="bg-blue-600 h-full rounded-full" style={{ width: `${Math.min(persentaseSerapanPK, 100)}%` }} />
                  </div>
                </div>
              </div>

              {/* Tabel Daftar Kontrak Pihak Ketiga */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                    <Building size={14} className="text-blue-700" />
                    Daftar Rekanan &amp; Kontrak Belanja Pihak Ketiga ({pihakKetigas.length} Kontrak)
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Data sinkron otomatis dengan menu Belanja Pihak Ketiga
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 pl-3">No.</th>
                        <th className="p-2.5">Pelaksana / Perusahaan</th>
                        <th className="p-2.5">Sub Kegiatan &amp; Uraian</th>
                        <th className="p-2.5 text-right">Nilai Kontrak</th>
                        <th className="p-2.5 text-right">Realisasi SP2D</th>
                        <th className="p-2.5 text-right">Sisa Kontrak</th>
                        <th className="p-2.5 text-center pr-3">Serapan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {pihakKetigas.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                            Belum ada kontrak atau pekerjaan belanja pihak ketiga yang terdaftar untuk Tahun Anggaran {selectedYear}.
                          </td>
                        </tr>
                      ) : (
                        pihakKetigas.map((p, idx) => {
                          const rkaMatch = rkaList.find(r => 
                            r.kode_sub_kegiatan === p.kode_sub_kegiatan && 
                            r.uraian_belanja === p.uraian_belanja
                          );
                          const rkaSumForSub = rkaList
                            .filter(r => r.kode_sub_kegiatan === p.kode_sub_kegiatan)
                            .reduce((acc, curr) => acc + (curr.jumlah || 0), 0);
                          const linkedSub = subKegiatans.find(s => s.kode_sub_kegiatan === p.kode_sub_kegiatan);
                          const paguItem = rkaMatch?.jumlah 
                            ? rkaMatch.jumlah 
                            : (rkaSumForSub > 0 ? rkaSumForSub : (linkedSub?.pagu || p.realisasi || 0));
                          const realisasiItem = getPkItemRealisasi(p);
                          const sisa = paguItem - realisasiItem;
                          const persen = paguItem > 0 ? (realisasiItem / paguItem) * 100 : 0;
                          return (
                            <tr key={p.id || idx} className="hover:bg-slate-50 transition-colors">
                              <td className="p-2.5 pl-3 font-mono text-slate-500">{idx + 1}</td>
                              <td className="p-2.5">
                                <span className="font-extrabold text-slate-900 block">{p.nama_pelaksana || '-'}</span>
                                <span className="text-[10px] font-mono text-slate-500 block">No: {p.nomor_kontrak || '-'}</span>
                              </td>
                              <td className="p-2.5 max-w-[240px]">
                                <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-100 block truncate" title={p.kode_sub_kegiatan}>
                                  {p.kode_sub_kegiatan}
                                </span>
                                <span className="text-slate-700 font-medium block truncate mt-0.5" title={p.uraian_belanja}>
                                  {p.uraian_belanja || '-'}
                                </span>
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                                {formatRupiah(paguItem)}
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                                {formatRupiah(realisasiItem)}
                              </td>
                              <td className={`p-2.5 text-right font-mono font-bold ${sisa < 0 ? 'text-red-700' : 'text-amber-800'}`}>
                                {formatRupiah(sisa)}
                              </td>
                              <td className="p-2.5 text-center pr-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold inline-block ${
                                  persen >= 100 
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                    : persen > 0 
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}>
                                  {persen.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Petunjuk Aksi Navigasi */}
              <div className="bg-blue-50/70 border border-blue-200/70 p-3 rounded-xl flex items-center justify-between gap-3 text-xs text-blue-900">
                <div className="flex items-center gap-2">
                  <span className="text-base">💡</span>
                  <p className="text-[11px] leading-relaxed">
                    Untuk menambah, mengedit kontrak, atau mencocokkan rincian pembayaran SP2D dengan rekanan, silakan buka menu <b>Belanja Pihak Ketiga</b> atau <b>Realisasi SP2D</b>.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowPkDetailModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200 transition text-xs cursor-pointer"
              >
                Tutup
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPkDetailModal(false);
                    onNavigate?.('realisasi');
                  }}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl border border-slate-300 transition text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <TrendingUp size={14} className="text-emerald-600" />
                  Buka Realisasi SP2D
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPkDetailModal(false);
                    onNavigate?.('pihakKetiga');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-xs transition text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Briefcase size={14} />
                  Buka Menu Belanja Pihak Ketiga Lengkap →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
