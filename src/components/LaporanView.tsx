import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
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
import { Program, Kegiatan, SubKegiatan, Realisasi, BelanjaPihakKetiga, AppSettings, UserRole, ActivityLog, RKA } from '../types';
import { formatRupiah, formatPercent } from '../utils/helpers';
import { createAuditLog } from '../dbService';

interface LaporanViewProps {
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  realisasis: Realisasi[];
  pihakKetigas: BelanjaPihakKetiga[];
  rkaList: RKA[];
  settings?: AppSettings | null;
  currentUserEmail: string;
  currentUserRole: UserRole;
  logs: ActivityLog[];
  selectedYear: number;
}

type LaporanType = 
  | "rekap_anggaran" 
  | "rekap_realisasi" 
  | "rekap_program" 
  | "rekap_kegiatan" 
  | "rekap_sub_kegiatan" 
  | "bulanan" 
  | "tahunan" 
  | "monitoring_fisik";

export default function LaporanView({
  programs,
  kegiatans,
  subKegiatans,
  realisasis,
  pihakKetigas,
  rkaList,
  settings,
  currentUserEmail,
  currentUserRole,
  logs,
  selectedYear
}: LaporanViewProps) {
  const [selectedLaporan, setSelectedLaporan] = useState<LaporanType>("rekap_anggaran");
  const [selectedMonth, setSelectedMonth] = useState<string>("Semua");
  const [showPdfModal, setShowPdfModal] = useState(false);

  const monthsList = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  const urutanJenis = useMemo(() => {
    switch (selectedLaporan) {
      case "rekap_anggaran": return "01";
      case "rekap_realisasi": return "02";
      case "rekap_program": return "03";
      case "rekap_kegiatan": return "04";
      case "rekap_sub_kegiatan": return "05";
      case "bulanan": return "06";
      case "tahunan": return "07";
      case "monitoring_fisik": return "08";
      default: return "09";
    }
  }, [selectedLaporan]);

  const currentMonthCode = useMemo(() => {
    return String(new Date().getMonth() + 1).padStart(2, '0');
  }, []);

  const currentYearCode = useMemo(() => {
    return String(selectedYear);
  }, [selectedYear]);

  // Official signature details derived from settings
  const namaPejabat = settings?.nama_pejabat_ttd || "Drs. H. BUDIAN SANI, M.Si";
  const jabatanPejabat = settings?.jabatan_pejabat_ttd || "Kepala Dinas Perkim Kabupaten Bima";
  const nipPejabatRaw = settings?.nip_pejabat_ttd || "19741022 199803 1 004";
  const nipPejabat = nipPejabatRaw.toUpperCase().startsWith("NIP") ? nipPejabatRaw : `NIP. ${nipPejabatRaw}`;

  const namaBendahara = settings?.nama_bendahara || "SUHARTINI, SE";
  const jabatanBendahara = settings?.jabatan_bendahara || "Bendahara Pengeluaran";
  const nipBendaharaRaw = settings?.nip_bendahara || "19820512 200904 2 003";
  const nipBendahara = nipBendaharaRaw.toUpperCase().startsWith("NIP") ? nipBendaharaRaw : `NIP. ${nipBendaharaRaw}`;

  // Title of the currently selected report
  const reportTitle = useMemo(() => {
    switch (selectedLaporan) {
      case "rekap_anggaran": return "LAPORAN REKAPITULASI PLAFON PAGU ANGGARAN";
      case "rekap_realisasi": return "LAPORAN REKAPITULASI REALISASI BELANJA";
      case "rekap_program": return "LAPORAN REALISASI ANGGARAN PER PROGRAM";
      case "rekap_kegiatan": return "LAPORAN REALISASI ANGGARAN PER KEGIATAN";
      case "rekap_sub_kegiatan": return "LAPORAN REALISASI ANGGARAN PER SUB-KEGIATAN";
      case "bulanan": return `LAPORAN PERKEMBANGAN REALISASI BULANAN (${selectedMonth})`;
      case "tahunan": return "LAPORAN REKAPITULASI TAHUNAN KABUPATEN BIMA";
      case "belanja_pihak_ketiga": return "LAPORAN PELAKSANAAN BELANJA PIHAK KETIGA";
      default: return "LAPORAN KEUANGAN";
    }
  }, [selectedLaporan, selectedMonth]);

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
          pagu: rkaList.find(a => a.uraian_belanja === r.uraian_belanja)?.jumlah || 0,
          realisasi: r.nominal_realisasi,
          sisa: Math.max(0, (rkaList.find(a => a.uraian_belanja === r.uraian_belanja)?.jumlah || 0) - r.nominal_realisasi),
          persen: r.persentase_realisasi
        }));
      case "belanja_pihak_ketiga":
        return pihakKetigas.map(m => ({
          kode: m.tanggal,
          nama: m.uraian_belanja,
          pagu: 0, // Not applicable for PK
          realisasi: m.realisasi,
          sisa: 0, // Not applicable for PK
          persen: 0
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
  }, [selectedLaporan, programs, kegiatans, subKegiatans, realisasis, pihakKetigas, selectedMonth]);

  // Content signature of current report content
  const currentReportContentSignature = useMemo(() => {
    const dataToSign = reportRows.map(r => ({
      kode: r.kode,
      nama: r.nama,
      pagu: r.pagu,
      realisasi: r.realisasi,
      sisa: r.sisa,
      persen: r.persen
    }));
    return JSON.stringify(dataToSign);
  }, [reportRows]);

  // List of previous prints and exports of this same report type
  const previousPrintsOfSameTypeColor = useMemo(() => {
    if (!logs) return [];
    return logs
      .filter(log => {
        const matchAction = log.aksi === "CELAK_LAPORAN" || log.aksi === "CETAK_LAPORAN" || log.aksi === "EKSPOR_PDF";
        if (!matchAction) return false;
        try {
          const parsed = log.data_baru ? JSON.parse(log.data_baru) : null;
          return parsed && parsed.jenis_laporan === selectedLaporan;
        } catch (e) {
          return log.data_baru?.includes(`"jenis_laporan":"${selectedLaporan}"`);
        }
      })
      .map(log => {
        try {
          const parsed = log.data_baru ? JSON.parse(log.data_baru) : null;
          return {
            waktu: log.waktu,
            kode_dokumen: parsed?.kode_dokumen || "",
            data_rows_hash: parsed?.data_rows_hash || "",
            seq: parsed?.seq || 0
          };
        } catch (e) {
          return null;
        }
      })
      .filter((item): item is NonNullable<typeof item> => !!item)
      .sort((a, b) => new Date(a.waktu).getTime() - new Date(b.waktu).getTime());
  }, [logs, selectedLaporan]);

  // Core requirement: Same data content = Same sequence number
  const { currentSeq, isDataSameAsPrevious } = useMemo(() => {
    if (previousPrintsOfSameTypeColor.length === 0) {
      return { currentSeq: 1, isDataSameAsPrevious: false };
    }
    const lastPrint = previousPrintsOfSameTypeColor[previousPrintsOfSameTypeColor.length - 1];
    const isSame = lastPrint.data_rows_hash === currentReportContentSignature;
    
    let lastSeqVal = typeof lastPrint.seq === 'number' ? lastPrint.seq : 0;
    if (!lastSeqVal && lastPrint.kode_dokumen) {
      const parts = lastPrint.kode_dokumen.split('/');
      if (parts.length >= 4) {
        const parsedSeq = parseInt(parts[3], 10);
        if (!isNaN(parsedSeq)) {
          lastSeqVal = parsedSeq;
        }
      }
    }
    
    if (lastSeqVal === 0) {
      lastSeqVal = previousPrintsOfSameTypeColor.length;
    }

    if (isSame) {
      return { currentSeq: lastSeqVal, isDataSameAsPrevious: true };
    } else {
      return { currentSeq: lastSeqVal + 1, isDataSameAsPrevious: false };
    }
  }, [previousPrintsOfSameTypeColor, currentReportContentSignature]);

  const currentDocCode = useMemo(() => {
    const seqStr = String(currentSeq).padStart(3, '0');
    return `SIREKAP/PERTANAHAN/${urutanJenis}/${seqStr}/${currentMonthCode}/${currentYearCode}`;
  }, [currentSeq, urutanJenis, currentMonthCode, currentYearCode]);

  // Handle direct print trigger
  const handlePrint = async () => {
    try {
      await createAuditLog(
        currentUserEmail || "Guest User",
        currentUserRole || "Pimpinan",
        "CETAK_LAPORAN",
        "LAPORAN",
        null,
        {
          jenis_laporan: selectedLaporan,
          kode_dokumen: currentDocCode,
          judul_laporan: reportTitle,
          waktu_cetak: new Date().toISOString(),
          data_rows_hash: currentReportContentSignature,
          seq: currentSeq
        }
      );
    } catch (err) {
      console.warn("Failed recording print history:", err);
    }
    window.print();
  };

  const handleExportPdf = async () => {
    try {
      await createAuditLog(
        currentUserEmail || "Guest User",
        currentUserRole || "Pimpinan",
        "EKSPOR_PDF",
        "LAPORAN",
        null,
        {
          jenis_laporan: selectedLaporan,
          kode_dokumen: currentDocCode,
          judul_laporan: reportTitle,
          waktu_cetak: new Date().toISOString(),
          data_rows_hash: currentReportContentSignature,
          seq: currentSeq
        }
      );
    } catch (err) {
      console.warn("Failed recording export history:", err);
    }
    window.print();
    setShowPdfModal(false);
  };

  // Aggregate totals
  const totalPaguSum = useMemo(() => reportRows.reduce((s, r) => s + r.pagu, 0), [reportRows]);
  const totalRealisasiSum = useMemo(() => reportRows.reduce((s, r) => s + r.realisasi, 0), [reportRows]);
  const totalSisaSum = useMemo(() => reportRows.reduce((s, r) => s + r.sisa, 0), [reportRows]);
  const avgPersenSum = useMemo(() => totalPaguSum > 0 ? (totalRealisasiSum / totalPaguSum) * 100 : 0, [totalPaguSum, totalRealisasiSum]);

  // Export to Excel
  const handleExportExcel = () => {
    const wsData = [
      ['KODE/TANGGAL', 'URAIAN KEGIATAN', 'PAGU (Rp)', 'REALISASI (Rp)', 'SISA (Rp)', 'PERSENTASE'],
      ...reportRows.map(r => [r.kode, r.nama, r.pagu, r.realisasi, r.sisa, `${r.persen}%`]),
      ['TOTAL', '', totalPaguSum, totalRealisasiSum, totalSisaSum, `${avgPersenSum.toFixed(2)}%`]
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Laporan");
    XLSX.writeFile(wb, `SIREKAP_Laporan_${selectedLaporan}_2026.xlsx`);
  };

  return (
    <div className="space-y-6" id="laporan-module-root">
      
      {/* Selector Dashboard control */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 text-xs select-none print:hidden shadow-3xs" id="laporan-selectors">
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
            <option value="tahunan">7. Laporan Kinerja Belanja Tahunan</option>
            <option value="belanja_pihak_ketiga">8. Laporan Belanja Jasa Pihak Ketiga</option>
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
        </div>

        {/* Exporter triggers */}
        <div className="flex gap-2.5 flex-wrap shrink-0 self-end md:self-auto">
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#15803d] bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            Ekspor Excel (.xlsx)
          </button>

          <button 
            onClick={() => setShowPdfModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition cursor-pointer shadow-3xs"
          >
            <FileText size={14} />
            Ekspor PDF
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
            {settings?.logo_instansi ? (
              <img src={settings.logo_instansi} alt="Logo Dinas" className="w-16 h-16 object-contain" referrerPolicy="no-referrer" />
            ) : (
              <img src="https://res.cloudinary.com/de4prnqa4/image/upload/v1780640818/logo_sibiru_y2jgaw.jpg" alt="Logo SIREKAP TANAH" className="w-15 h-15 object-contain" referrerPolicy="no-referrer" />
            )}
            <div className="text-left">
              <h1 className="text-base font-black tracking-widest text-slate-900 uppercase">PEMERINTAH KABUPATEN BIMA</h1>
              <h2 className="text-sm font-extrabold tracking-widest text-slate-800 uppercase mt-0.5">DINAS PERUMAHAN DAN KAWASAN PERMUKIMAN</h2>
              <p className="text-[9px] text-slate-500 font-semibold italic mt-0.5">Kompleks Perkantoran Pemkab Bima - Woha, Nusa Tenggara Barat</p>
            </div>
          </div>
        </div>

        {/* Laporan Title */}
        <div className="text-center space-y-1 select-none flex flex-col" id="report-centered-header">
          <h3 className="text-center font-black text-slate-900 tracking-wide text-xs uppercase underline">
            {reportTitle}
          </h3>
          <p className="text-[10px] text-slate-500 font-mono font-bold">Kode Dokumen Rekap: {currentDocCode}</p>
        </div>

        {/* Tabular details */}
        <div className="overflow-x-auto w-full select-text">
          <table className="w-full text-left text-[11px] border border-slate-300 border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-300 font-bold text-slate-800">
                <th className="p-3 border border-slate-300 w-32">KODE / TANGGAL</th>
                <th className="p-3 border border-slate-300">NAMA & URAIAN DETAIL KEGIATAN</th>
                <th className="p-3 border border-slate-300 text-right w-36">
                  {selectedLaporan === "belanja_pihak_ketiga" ? "NILAI KONTRAK" : "PAGU ANGGARAN"}
                </th>
                <th className="p-3 border border-slate-300 text-right w-36">
                  {selectedLaporan === "belanja_pihak_ketiga" ? "REALISASI" : "REALISASI KAS"}
                </th>
                <th className="p-3 border border-slate-300 text-right w-36">
                  {selectedLaporan === "belanja_pihak_ketiga" ? "SISA" : "SISA PLAFON"}
                </th>
                <th className="p-3 border border-slate-300 text-center w-20">RASIO SERAPAN</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-800">
              {reportRows.map((row, index) => (
                <tr key={index} className="hover:bg-slate-50/20 divide-x font-medium">
                  <td className="p-2.5 border border-slate-200 font-mono font-semibold whitespace-nowrap">{row.kode}</td>
                  <td className="p-2.5 border border-slate-200 break-words whitespace-normal min-w-[260px] max-w-md font-semibold text-slate-900 leading-snug">{row.nama}</td>
                  <td className="p-2.5 border border-slate-200 text-right lg:font-bold whitespace-nowrap">
                    {selectedLaporan === "belanja_pihak_ketiga" ? "-" : formatRupiah(row.pagu)}
                  </td>
                  <td className="p-2.5 border border-slate-200 text-right text-emerald-800 font-semibold whitespace-nowrap">
                    {selectedLaporan === "belanja_pihak_ketiga" ? formatRupiah(row.realisasi) : formatRupiah(row.realisasi)}
                  </td>
                  <td className="p-2.5 border border-slate-200 text-right text-slate-600 whitespace-nowrap">
                    {selectedLaporan === "belanja_pihak_ketiga" ? "-" : formatRupiah(row.sisa)}
                  </td>
                  <td className="p-2.5 border border-slate-200 text-center font-bold whitespace-nowrap">
                    {row.persen}%
                  </td>
                </tr>
              ))}

              {/* Accumulator Row summary info */}
              <tr className="bg-slate-50 font-black text-rose-950 divide-x border-t-2 border-slate-300">
                <td colSpan={2} className="p-3 text-right uppercase border border-slate-300">TOTAL KESELURUHAN (TOTAL EXPENDITURES):</td>
                <td className="p-3 text-right border border-slate-300">
                  {selectedLaporan === "belanja_pihak_ketiga" ? "-" : formatRupiah(totalPaguSum)}
                </td>
                <td className="p-3 text-right border border-slate-300">
                  {formatRupiah(totalRealisasiSum)}
                </td>
                <td className="p-3 text-right border border-slate-300">
                  {selectedLaporan === "belanja_pihak_ketiga" ? "-" : formatRupiah(totalSisaSum)}
                </td>
                <td className="p-3 text-center border border-slate-300">
                  {avgPersenSum.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Offsite legal signing "Tanda Tangan Pengesahan" */}
        <div className="grid grid-cols-2 gap-4 pt-12 text-center text-xs select-none font-medium" id="signing-block">
          <div>
            <p className="text-slate-500 font-semibold uppercase">Mengetahui & Menyetujui,</p>
            <p className="text-slate-800 font-extrabold mt-0.5">{jabatanPejabat}</p>
            <div className="h-16 flex items-center justify-center">
              <Award className="text-blue-900 opacity-20" size={36} />
            </div>
            <p className="text-slate-900 font-extrabold underline uppercase">{namaPejabat}</p>
            <p className="text-[10px] text-slate-500 font-bold font-mono">{nipPejabat}</p>
          </div>

          <div>
            <p className="text-slate-500 font-semibold uppercase">Bima, {new Date().toLocaleDateString('id-ID', {year:'numeric', month:'long', day:'numeric'})}</p>
            <p className="text-slate-800 font-extrabold mt-0.5">{jabatanBendahara}</p>
            <div className="h-16 flex items-center justify-center">
              <CheckCircle className="text-emerald-800 opacity-15" size={32} />
            </div>
            <p className="text-slate-900 font-extrabold underline uppercase">{namaBendahara}</p>
            <p className="text-[10px] text-slate-500 font-bold font-mono">{nipBendahara}</p>
          </div>
        </div>

      </div>

      {/* PDF Export confirmation modal */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4 z-50 animate-fade-in print:hidden" id="pdf-export-modal">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-100 shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-dashed">
              <div className="flex items-center gap-2">
                <FileText className="text-red-700 font-bold" size={18} />
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Konfirmasi Ekspor PDF</h4>
              </div>
              <button 
                onClick={() => setShowPdfModal(false)}
                className="text-slate-400 hover:text-slate-600 transition cursor-pointer font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="text-[11px] text-slate-600 space-y-3.5 leading-relaxed">
              <p className="font-semibold">
                Sistem mendeteksi format data laporan saat ini untuk verifikasi kode dokumen legal:
              </p>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                <div className="flex justify-between items-center text-slate-700">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Jenis Laporan:</span>
                  <span className="font-black text-slate-800 uppercase text-right truncate max-w-[180px]">{selectedLaporan.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between items-center text-slate-700">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Validasi Data:</span>
                  {isDataSameAsPrevious ? (
                    <span className="inline-flex items-center gap-1 font-extrabold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full text-[9px]">
                      <CheckCircle size={9} />
                      IDENTIK (Sama)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-extrabold text-blue-800 bg-blue-100/80 px-2 py-0.5 rounded-full text-[9px]">
                      DATA BARU / BERBEDA
                    </span>
                  )}
                </div>
                <div className="border-t border-dashed my-2 pt-2">
                  <p className="font-bold text-slate-400 uppercase tracking-widest text-[9px]">Ditetapkan Kode Dokumen Rekap:</p>
                  <p className="font-mono font-black text-blue-700 text-[11px] tracking-wide mt-1 select-all break-all">{currentDocCode}</p>
                </div>
              </div>

              {isDataSameAsPrevious ? (
                <div className="p-3 bg-emerald-50 text-emerald-900 rounded-lg border border-emerald-150 font-bold text-[10px]">
                  💡 Isi data sama persis dengan cetakan sebelumnya! Sesuai aturan, nomor urutan tetap dipertahankan yaitu <b className="font-black text-emerald-950">{String(currentSeq).padStart(3, '0')}</b>.
                </div>
              ) : (
                <div className="p-3 bg-indigo-50 text-indigo-900 rounded-lg border border-indigo-150 font-bold text-[10px]">
                  ✨ Perubahan data atau data baru terdeteksi! Urutan dokumen naik otomatis menjadi nomor urutan baru <b className="font-black text-indigo-950">{String(currentSeq).padStart(3, '0')}</b>.
                </div>
              )}

              <p className="font-bold text-slate-500 text-[10px]">
                💡 Tip: Pilih printer <b className="text-slate-800 font-extrabold">"Save as PDF" / "Simpan sebagai PDF"</b> di jendela dialog print browser untuk menyimpan file.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={handleExportPdf}
                className="flex-1 py-2.5 bg-red-700 hover:bg-red-800 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-xs transition cursor-pointer text-center"
              >
                Unduh / Simpan PDF
              </button>
              <button
                onClick={() => setShowPdfModal(false)}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
