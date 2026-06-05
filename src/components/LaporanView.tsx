import React, { useState, useMemo } from 'react';
import { 
  Printer, 
  FileSpreadsheet, 
  Layers, 
  FileText, 
  Download, 
  CheckCircle,
  TrendingDown,
  Building,
  Activity,
  Award
} from 'lucide-react';
import { Program, Kegiatan, SubKegiatan, Realisasi, MonitoringFisik } from '../types';
import { formatRupiah, formatPercent } from '../utils/helpers';

interface LaporanViewProps {
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  realisasis: Realisasi[];
  monitorings: MonitoringFisik[];
}

type LaporanType = 
  | "rekap_anggaran" 
  | "rekap_realisasi" 
  | "rekap_program" 
  | "rekap_kegiatan" 
  | "rekap_sub_kegiatan" 
  | "bulanan" 
  | "triwulan" 
  | "tahunan" 
  | "monitoring_fisik";

export default function LaporanView({
  programs,
  kegiatans,
  subKegiatans,
  realisasis,
  monitorings
}: LaporanViewProps) {
  const [selectedLaporan, setSelectedLaporan] = useState<LaporanType>("rekap_anggaran");
  const [selectedMonth, setSelectedMonth] = useState<string>("Semua");
  const [selectedQuarter, setSelectedQuarter] = useState<string>("Semua");

  const monthsList = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  // Title of the currently selected report
  const reportTitle = useMemo(() => {
    switch (selectedLaporan) {
      case "rekap_anggaran": return "LAPORAN REKAPITULASI PLAFON PAGU ANGGARAN";
      case "rekap_realisasi": return "LAPORAN REKAPITULASI REALISASI BELANJA";
      case "rekap_program": return "LAPORAN REALISASI ANGGARAN PER PROGRAM";
      case "rekap_kegiatan": return "LAPORAN REALISASI ANGGARAN PER KEGIATAN";
      case "rekap_sub_kegiatan": return "LAPORAN REALISASI ANGGARAN PER SUB-KEGIATAN";
      case "bulanan": return `LAPORAN PERKEMBANGAN REALISASI BULANAN (${selectedMonth})`;
      case "triwulan": return `LAPORAN PERKEMBANGAN REALISASI TRIWULAN (${selectedQuarter})`;
      case "tahunan": return "LAPORAN REKAPITULASI TAHUNAN KABUPATEN BIMA";
      case "monitoring_fisik": return "LAPORAN MONITORING FISIK LAPANGAN";
      default: return "LAPORAN KEUANGAN";
    }
  }, [selectedLaporan, selectedMonth, selectedQuarter]);

  // Handle direct print trigger
  const handlePrint = () => {
    window.print();
  };

  // Build rows depending on selected options
  const reportRows = useMemo(() => {
    switch (selectedLaporan) {
      case "rekap_program":
        return programs.map(p => ({
          kode: p.kode_program,
          nama: p.nama_program,
          pagu: p.pagu,
          realisasi: p.realisasi,
          sisa: p.sisa,
          persen: p.persentase
        }));
      case "rekap_kegiatan":
        return kegiatans.map(k => ({
          kode: k.kode_kegiatan,
          nama: k.nama_kegiatan,
          pagu: k.pagu,
          realisasi: k.realisasi,
          sisa: k.sisa,
          persen: k.persentase
        }));
      case "rekap_sub_kegiatan":
      case "rekap_anggaran":
      case "rekap_realisasi":
        return subKegiatans.map(s => ({
          kode: s.kode_sub_kegiatan,
          nama: s.nama_sub_kegiatan,
          pagu: s.pagu,
          realisasi: s.realisasi,
          sisa: s.sisa,
          persen: s.persentase
        }));
      case "bulanan":
        const filteredRealM = realisasis.filter(r => selectedMonth === "Semua" || r.bulan === selectedMonth);
        return filteredRealM.map(r => ({
          kode: r.tanggal,
          nama: `${r.kode_sub_kegiatan} - ${r.uraian_belanja}`,
          pagu: subKegiatans.find(s => s.kode_sub_kegiatan === r.kode_sub_kegiatan)?.pagu || 0,
          realisasi: r.nominal_realisasi,
          sisa: r.sisa_anggaran,
          persen: r.persentase_realisasi
        }));
      case "triwulan":
        const filteredRealQ = realisasis.filter(r => {
          if (selectedQuarter === "Semua") return true;
          const idx = monthsList.indexOf(r.bulan);
          if (selectedQuarter === "I") return idx >= 0 && idx <= 2;
          if (selectedQuarter === "II") return idx >= 3 && idx <= 5;
          if (selectedQuarter === "III") return idx >= 6 && idx <= 8;
          return idx >= 9 && idx <= 11;
        });
        return filteredRealQ.map(r => ({
          kode: r.tanggal,
          nama: `${r.kode_sub_kegiatan} - ${r.uraian_belanja} (Bulan: ${r.bulan})`,
          pagu: subKegiatans.find(s => s.kode_sub_kegiatan === r.kode_sub_kegiatan)?.pagu || 0,
          realisasi: r.nominal_realisasi,
          sisa: r.sisa_anggaran,
          persen: r.persentase_realisasi
        }));
      case "monitoring_fisik":
        return monitorings.map(m => ({
          kode: m.tanggal,
          nama: `${m.kode_sub_kegiatan} - ${subKegiatans.find(s => s.kode_sub_kegiatan === m.kode_sub_kegiatan)?.nama_sub_kegiatan || 'Sektor'}`,
          pagu: m.target_fisik, // mapping pagu text element to Target Physical
          realisasi: m.realisasi_fisik, // mapping realisasi text to Realisasi Physical
          sisa: Math.max(0, m.target_fisik - m.realisasi_fisik), // mapping gap
          persen: m.persentase
        }));
      case "tahunan":
      default:
        // Combined master summary
        return subKegiatans.map(s => ({
          kode: s.kode_sub_kegiatan,
          nama: s.nama_sub_kegiatan,
          pagu: s.pagu,
          realisasi: s.realisasi,
          sisa: s.sisa,
          persen: s.persentase
        }));
    }
  }, [selectedLaporan, programs, kegiatans, subKegiatans, realisasis, monitorings, selectedMonth, selectedQuarter]);

  // Aggregate totals
  const totalPaguSum = useMemo(() => reportRows.reduce((s, r) => s + r.pagu, 0), [reportRows]);
  const totalRealisasiSum = useMemo(() => reportRows.reduce((s, r) => s + r.realisasi, 0), [reportRows]);
  const totalSisaSum = useMemo(() => reportRows.reduce((s, r) => s + r.sisa, 0), [reportRows]);
  const avgPersenSum = useMemo(() => totalPaguSum > 0 ? (totalRealisasiSum / totalPaguSum) * 100 : 0, [totalPaguSum, totalRealisasiSum]);

  // Simulated export Excel
  const handleExportExcelSim = () => {
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
      + ["KODE/TANGGAL,URAIAN KEGIATAN,PAGU / TARGET,REALISASI KAS/FISIK,SISA PLAFON,PERSENTASE SERAPAN"].join(",") + "\n"
      + reportRows.map(r => `"${r.kode}","${r.nama}",${r.pagu},${r.realisasi},${r.sisa},"${r.persen}%"`).join("\n") + "\n"
      + `TOTAL,,${totalPaguSum},${totalRealisasiSum},${totalSisaSum},"${avgPersenSum.toFixed(2)}%"`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SIBIRU_Laporan_${selectedLaporan}_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6" id="laporan-module-root">
      
      {/* Selector Dashboard control */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 text-xs select-none" id="laporan-selectors">
        <div className="flex flex-col gap-1.5 flex-1 max-w-sm">
          <label className="font-extrabold text-slate-700 uppercase tracking-wider block">Pilih Atribut Jenis Laporan</label>
          <select 
            value={selectedLaporan} 
            onChange={(e) => setSelectedLaporan(e.target.value as LaporanType)}
            className="p-2.5 border border-slate-200 bg-white font-bold rounded-lg outline-blue-600 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          >
            <option value="rekap_anggaran">1. Laporan Rekapitulasi Alokasi Pagu</option>
            <option value="rekap_realisasi">2. Laporan Rekapitulasi Realisasi Belanja</option>
            <option value="rekap_program">3. Laporan Serapan Anggaran per Program</option>
            <option value="rekap_kegiatan">4. Laporan Serapan Anggaran per Kegiatan</option>
            <option value="rekap_sub_kegiatan">5. Laporan Serapan Anggaran per Sub-Kegiatan</option>
            <option value="bulanan">6. Laporan Realisasi Bulanan Berjalan</option>
            <option value="triwulan">7. Laporan Realisasi Triwulan (Termin)</option>
            <option value="tahunan">8. Laporan Kinerja Belanja Tahunan</option>
            <option value="monitoring_fisik">9. Laporan Kinerja Fisik Sengketa Lahan</option>
          </select>
        </div>

        {/* Dynamic Context options */}
        <div className="flex gap-2">
          {selectedLaporan === "bulanan" && (
            <div>
              <label className="block text-slate-500 font-bold mb-1">Filter Month</label>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="p-2 border border-slate-200 rounded-md bg-white">
                <option value="Semua">Semua Bulan</option>
                {monthsList.map((m, idx) => <option key={idx} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {selectedLaporan === "triwulan" && (
            <div>
              <label className="block text-slate-500 font-bold mb-1">Filter Triwulan (Termin)</label>
              <select value={selectedQuarter} onChange={(e) => setSelectedQuarter(e.target.value)} className="p-2 border border-slate-200 rounded-md bg-white">
                <option value="Semua">Semua Triwulan</option>
                <option value="I">Triwulan I (Jan-Mar)</option>
                <option value="II">Triwulan II (Apr-Jun)</option>
                <option value="III">Triwulan III (Jul-Sep)</option>
                <option value="IV">Triwulan IV (Okt-Des)</option>
              </select>
            </div>
          )}
        </div>

        {/* Exporter triggers */}
        <div className="flex gap-2.5 shrink-0 self-end md:self-auto">
          <button 
            onClick={handleExportExcelSim}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#15803d] bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            Simulasi Excel
          </button>
          
          <button 
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1e40af] hover:bg-[#1e3a8a] rounded-lg shadow-sm transition cursor-pointer"
          >
            <Printer size={15} />
            Cetak Laporan Langsung
          </button>
        </div>
      </div>

      {/* Formal Indonesia Administration Printing Card Template "KOP LAPORAN" */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-6 print:p-0 print:border-0" id="formal-print-sheet">
        
        {/* Formal Header Logo / Kop Surat */}
        <div className="border-b-4 border-double border-slate-800 pb-5 text-center relative flex flex-col items-center" id="kop-surat">
          <div className="flex items-center justify-center gap-4">
            <Building className="text-blue-900" size={54} />
            <div>
              <h1 className="text-base font-black tracking-widest text-slate-900 uppercase">PEMERINTAH KABUPATEN BIMA</h1>
              <h2 className="text-sm font-extrabold tracking-widest text-slate-800 uppercase mt-0.5">DINAS PERUMAHAN DAN KAWASAN PERMUKIMAN</h2>
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">BIDANG PERTANAHAN KABUPATEN BIMA TAHUN ANGGARAN 2026</p>
              <p className="text-[9px] text-slate-500 font-semibold italic mt-0.5">Kompleks Perkantoran Pemkab Bima - Woha, Nusa Tenggara Barat</p>
            </div>
          </div>
        </div>

        {/* Laporan Title */}
        <div className="text-center space-y-1 select-none" id="report-centered-header flex flex-col">
          <h3 className="text-center font-black text-slate-900 tracking-wide text-xs uppercase underline">
            {reportTitle}
          </h3>
          <p className="text-[10px] text-slate-500 font-mono font-bold">Kode Dokumen Rekap: SIBIRU/PERTANAHAN/{new Date().getFullYear()}/REP-0{selectedLaporan.length}</p>
        </div>

        {/* Tabular details */}
        <div className="overflow-x-auto w-full select-text">
          <table className="w-full text-left text-[11px] border border-slate-300 border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-300 font-bold text-slate-800">
                <th className="p-3 border border-slate-300 w-32">KODE / TANGGAL</th>
                <th className="p-3 border border-slate-300">NAMA & URAIAN DETAIL KEGIATAN</th>
                <th className="p-3 border border-slate-300 text-right w-36">
                  {selectedLaporan === "monitoring_fisik" ? "TARGET FISIK" : "PAGU ANGGARAN"}
                </th>
                <th className="p-3 border border-slate-300 text-right w-36">
                  {selectedLaporan === "monitoring_fisik" ? "REALISASI FISIK" : "REALISASI KAS"}
                </th>
                <th className="p-3 border border-slate-300 text-right w-36">
                  {selectedLaporan === "monitoring_fisik" ? "GAP KEMULIAAN" : "SISA PLAFON"}
                </th>
                <th className="p-3 border border-slate-300 text-center w-20">RASIO SERAPAN</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-800">
              {reportRows.map((row, index) => (
                <tr key={index} className="hover:bg-slate-50/20 divide-x font-medium">
                  <td className="p-2.5 border border-slate-200 font-mono font-semibold">{row.kode}</td>
                  <td className="p-2.5 border border-slate-200 max-w-xs truncate">{row.nama}</td>
                  <td className="p-2.5 border border-slate-200 text-right lg:font-bold">
                    {selectedLaporan === "monitoring_fisik" ? `${row.pagu}%` : formatRupiah(row.pagu)}
                  </td>
                  <td className="p-2.5 border border-slate-200 text-right text-emerald-800 font-semibold">
                    {selectedLaporan === "monitoring_fisik" ? `${row.realisasi}%` : formatRupiah(row.realisasi)}
                  </td>
                  <td className="p-2.5 border border-slate-200 text-right text-slate-600">
                    {selectedLaporan === "monitoring_fisik" ? `${row.sisa}%` : formatRupiah(row.sisa)}
                  </td>
                  <td className="p-2.5 border border-slate-200 text-center font-bold">
                    {row.persen}%
                  </td>
                </tr>
              ))}

              {/* Accumulator Row summary info */}
              <tr className="bg-slate-50 font-black text-rose-950 divide-x border-t-2 border-slate-300">
                <td colSpan={2} className="p-3 text-right uppercase border border-slate-300">TOTAL KESELURUHAN (TOTAL EXPENDITURES):</td>
                <td className="p-3 text-right border border-slate-300">
                  {selectedLaporan === "monitoring_fisik" ? `${(totalPaguSum / Math.max(1, reportRows.length)).toFixed(1)}%` : formatRupiah(totalPaguSum)}
                </td>
                <td className="p-3 text-right border border-slate-300">
                  {selectedLaporan === "monitoring_fisik" ? `${(totalRealisasiSum / Math.max(1, reportRows.length)).toFixed(1)}%` : formatRupiah(totalRealisasiSum)}
                </td>
                <td className="p-3 text-right border border-slate-300">
                  {selectedLaporan === "monitoring_fisik" ? `${(totalSisaSum / Math.max(1, reportRows.length)).toFixed(1)}%` : formatRupiah(totalSisaSum)}
                </td>
                <td className="p-3 text-center border border-slate-300">
                  {avgPersenSum.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Offsite legal signing "Tanda Tangan Pengesahan" */}
        <div className="grid grid-cols-2 gap-4 pt-12 text-center text-xs select-none" id="signing-block font-medium">
          <div>
            <p className="text-slate-500 font-semibold uppercase">Mengetahui & Menyetujui,</p>
            <p className="text-slate-800 font-extrabold mt-0.5">Kepala Dinas Perkim Kabupaten Bima</p>
            <div className="h-16 flex items-center justify-center">
              <Award className="text-blue-900 opacity-20" size={36} />
            </div>
            <p className="text-slate-900 font-extrabold underline uppercase">Drs. H. BUDIAN SANI, M.Si</p>
            <p className="text-[10px] text-slate-500 font-bold font-mono">NIP. 19741022 199803 1 004</p>
          </div>

          <div>
            <p className="text-slate-500 font-semibold uppercase">Bima, {new Date().toLocaleDateString('id-ID', {year:'numeric', month:'long', day:'numeric'})}</p>
            <p className="text-slate-800 font-extrabold mt-0.5">Bendahara Urusan Bidang Pertanahan</p>
            <div className="h-16 flex items-center justify-center">
              <CheckCircle className="text-emerald-800 opacity-15" size={32} />
            </div>
            <p className="text-slate-900 font-extrabold underline uppercase">SUHARTINI, SE</p>
            <p className="text-[10px] text-slate-500 font-bold font-mono">NIP. 19820512 200904 2 003</p>
          </div>
        </div>

      </div>

    </div>
  );
}
