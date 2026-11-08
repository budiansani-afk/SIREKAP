import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
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
  Sliders,
  Maximize2,
  FileDown,
  Loader2,
  Compass,
  FileCheck
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

interface ReportRowItem {
  id?: string;
  kode: string;
  nama: string;
  pagu: number;
  realisasi: number;
  sisa: number;
  persen: number;
  rekanan?: string;
  sub_kegiatan?: string;
  masa_kerja?: string;
  tanggal?: string;
  catatan?: string;
}

type LaporanType = 
  | "rekap_anggaran" 
  | "rekap_realisasi" 
  | "rekap_program" 
  | "rekap_kegiatan" 
  | "rekap_sub_kegiatan" 
  | "bulanan" 
  | "tahunan" 
  | "belanja_pihak_ketiga"
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
  const [selectedSubKegFilter, setSelectedSubKegFilter] = useState<string>("Semua");
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfPaperSize, setPdfPaperSize] = useState<'A4' | 'F4' | 'Letter' | 'Legal' | 'A3'>('A4');
  const [pdfOrientation, setPdfOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [pdfScale, setPdfScale] = useState<number>(100);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string>('/logo_kab_bima.png');

  // Pre-load and convert logo to Base64 to guarantee 100% reliable export in html2canvas and printing
  useEffect(() => {
    let isMounted = true;
    const loadLogoAsBase64 = async () => {
      const targetUrl = settings?.logo_instansi && !settings.logo_instansi.includes('logo_sibiru') 
        ? settings.logo_instansi 
        : '/logo_kab_bima.png';

      try {
        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error("Gagal mengambil logo");
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (isMounted && typeof reader.result === 'string') {
            setLogoBase64(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        // Fallback ke aset lokal yang pasti ada
        try {
          const fallbackRes = await fetch('/logo_kab_bima.png');
          const fallbackBlob = await fallbackRes.blob();
          const fallbackReader = new FileReader();
          fallbackReader.onloadend = () => {
            if (isMounted && typeof fallbackReader.result === 'string') {
              setLogoBase64(fallbackReader.result);
            }
          };
          fallbackReader.readAsDataURL(fallbackBlob);
        } catch (fallbackErr) {
          if (isMounted) setLogoBase64('/logo_kab_bima.png');
        }
      }
    };

    loadLogoAsBase64();
    return () => { isMounted = false; };
  }, [settings?.logo_instansi]);

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
      case "belanja_pihak_ketiga": return "08";
      case "monitoring_fisik": return "09";
      default: return "10";
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
      case "belanja_pihak_ketiga": return "LAPORAN PELAKSANAAN & REALISASI BELANJA JASA PIHAK KETIGA";
      default: return "LAPORAN KEUANGAN";
    }
  }, [selectedLaporan, selectedMonth]);

  // Build rows depending on selected options
  const reportRows: ReportRowItem[] = useMemo(() => {
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
        return filteredRealM.map(r => {
          const matchedRka = rkaList.find(a => 
            a.kode_sub_kegiatan === r.kode_sub_kegiatan && 
            a.uraian_belanja.trim().toLowerCase() === (r.uraian_belanja || '').trim().toLowerCase()
          ) || rkaList.find(a => a.uraian_belanja.trim().toLowerCase() === (r.uraian_belanja || '').trim().toLowerCase());
          const paguVal = matchedRka ? matchedRka.jumlah : (subKegiatans.find(s => s.kode_sub_kegiatan === r.kode_sub_kegiatan)?.pagu || 0);
          const sisaVal = paguVal - r.nominal_realisasi;
          const persenVal = paguVal > 0 ? (r.nominal_realisasi / paguVal) * 100 : r.persentase_realisasi;

          return {
            kode: r.tanggal,
            nama: `${r.kode_sub_kegiatan} - ${r.uraian_belanja}`,
            pagu: paguVal,
            realisasi: r.nominal_realisasi,
            sisa: sisaVal,
            persen: parseFloat(persenVal.toFixed(2))
          };
        });
      case "belanja_pihak_ketiga":
        const filteredPihakKetigaList = selectedSubKegFilter === "Semua" 
          ? pihakKetigas 
          : pihakKetigas.filter(p => p.kode_sub_kegiatan === selectedSubKegFilter);

        return filteredPihakKetigaList.map(m => {
          // 1. Cari alokasi pagu dari RKA / Sub-kegiatan persis logika di menu Belanja Pihak Ketiga
          const rkaMatch = rkaList.find(r => 
            (r.kode_sub_kegiatan === m.kode_sub_kegiatan && r.uraian_belanja.trim().toLowerCase() === (m.uraian_belanja || '').trim().toLowerCase()) ||
            (m.uraian_belanja && r.uraian_belanja.trim().toLowerCase() === m.uraian_belanja.trim().toLowerCase())
          );
          let paguVal = 0;
          if (rkaMatch) {
            paguVal = rkaMatch.jumlah || 0;
          } else {
            const rkaSumForSub = rkaList
              .filter(r => r.kode_sub_kegiatan === m.kode_sub_kegiatan)
              .reduce((acc, curr) => acc + (curr.jumlah || 0), 0);
            if (rkaSumForSub > 0) {
              paguVal = rkaSumForSub;
            } else {
              const linkedSub = subKegiatans.find(s => s.kode_sub_kegiatan === m.kode_sub_kegiatan);
              paguVal = linkedSub?.pagu || 0;
            }
          }

          // 2. Ambil realisasi pembayaran SP2D yang cocok persis logika di menu Belanja Pihak Ketiga
          const matchedSp2ds = realisasis.filter(r => {
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
          const sumSp2d = matchedSp2ds.reduce((acc, r) => acc + (Number(r.nominal_realisasi) || 0), 0);
          const realVal = sumSp2d > 0 ? sumSp2d : (Number(m.realisasi) || 0);

          // 3. Hitung sisa pagu kontrak dan rasio serapan persentase
          const sisaVal = paguVal - realVal;
          const persenVal = paguVal > 0 ? (realVal / paguVal) * 100 : (realVal > 0 ? 100 : 0);

          const subKeg = subKegiatans.find(s => s.kode_sub_kegiatan === m.kode_sub_kegiatan);
          const namaSub = subKeg ? subKeg.nama_sub_kegiatan : (m.kode_sub_kegiatan || '-');
          const masaKerja = (m.masa_kerja_mulai && m.masa_kerja_selesai)
            ? `${m.masa_kerja_mulai} s/d ${m.masa_kerja_selesai}`
            : (m.masa_kerja_mulai || m.tanggal || '-');

          return {
            id: m.id,
            kode: m.nomor_kontrak || m.tanggal || '-',
            nama: m.uraian_belanja || 'Belanja Jasa Pihak Ketiga',
            rekanan: m.nama_pelaksana || 'Pihak Ketiga / Rekanan',
            sub_kegiatan: `${m.kode_sub_kegiatan} - ${namaSub}`,
            masa_kerja: masaKerja,
            tanggal: m.tanggal,
            pagu: paguVal,
            realisasi: realVal,
            sisa: sisaVal,
            persen: parseFloat(persenVal.toFixed(2)),
            catatan: m.catatan || ''
          };
        });
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
  }, [selectedLaporan, programs, kegiatans, subKegiatans, realisasis, pihakKetigas, rkaList, selectedMonth, selectedSubKegFilter]);

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

  // Dynamic CSS @page injection for native browser print orientation & paper sizing
  const updatePrintPageStyle = (paperSize: string, orientation: string) => {
    let styleEl = document.getElementById('dynamic-page-size-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'dynamic-page-size-style';
      document.head.appendChild(styleEl);
    }
    const paperSizes: Record<string, string> = {
      A4: 'A4',
      F4: '215mm 330mm',
      Letter: 'letter',
      Legal: 'legal',
      A3: 'A3'
    };
    const sizeValue = paperSizes[paperSize] || 'A4';
    styleEl.textContent = `@page { size: ${sizeValue} ${orientation}; margin: 8mm; }`;
  };

  // Direct PDF binary file generation & download using html2canvas & jsPDF
  const handleDownloadDirectPdf = async () => {
    const element = document.getElementById('formal-print-sheet');
    if (!element) return;

    setIsGeneratingPdf(true);
    try {
      // Record audit log
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
            ukuran_kertas: pdfPaperSize,
            orientasi: pdfOrientation,
            skala: `${pdfScale}%`,
            waktu_cetak: new Date().toISOString(),
            data_rows_hash: currentReportContentSignature,
            seq: currentSeq
          }
        );
      } catch (err) {
        console.warn("Gagal mencatat log ekspor:", err);
      }

      // Capture element to canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const paperDimensions: Record<string, [number, number]> = {
        A4: [210, 297],
        F4: [215, 330],
        Letter: [215.9, 279.4],
        Legal: [215.9, 355.6],
        A3: [297, 420]
      };

      const baseDim = paperDimensions[pdfPaperSize] || [210, 297];
      const pageWidth = pdfOrientation === 'landscape' ? baseDim[1] : baseDim[0];
      const pageHeight = pdfOrientation === 'landscape' ? baseDim[0] : baseDim[1];

      const margin = 8; // 8mm margin
      const printableWidth = pageWidth - (margin * 2);
      const printableHeight = pageHeight - (margin * 2);

      const scaleFactor = pdfScale / 100;
      const contentWidthMm = printableWidth * scaleFactor;
      const contentHeightMm = (canvas.height / canvas.width) * contentWidthMm;

      const pdf = new jsPDF({
        orientation: pdfOrientation,
        unit: 'mm',
        format: [pageWidth, pageHeight],
        compress: true
      });

      const pixelsPerMm = canvas.width / contentWidthMm;
      const pageCanvasHeight = printableHeight * pixelsPerMm;

      if (contentHeightMm <= printableHeight) {
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const xPos = margin + Math.max(0, (printableWidth - contentWidthMm) / 2);
        pdf.addImage(imgData, 'JPEG', xPos, margin, contentWidthMm, contentHeightMm, undefined, 'FAST');
      } else {
        let remainingHeight = canvas.height;
        let sourceY = 0;
        let pageIndex = 0;

        while (remainingHeight > 0) {
          if (pageIndex > 0) {
            pdf.addPage([pageWidth, pageHeight], pdfOrientation);
          }

          const sliceHeight = Math.min(pageCanvasHeight, remainingHeight);
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceHeight;

          const ctx = pageCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            ctx.drawImage(
              canvas,
              0, sourceY, canvas.width, sliceHeight,
              0, 0, canvas.width, sliceHeight
            );

            const sliceData = pageCanvas.toDataURL('image/jpeg', 0.95);
            const sliceHeightMm = sliceHeight / pixelsPerMm;
            const xPos = margin + Math.max(0, (printableWidth - contentWidthMm) / 2);
            pdf.addImage(sliceData, 'JPEG', xPos, margin, contentWidthMm, sliceHeightMm, undefined, 'FAST');
          }

          sourceY += sliceHeight;
          remainingHeight -= sliceHeight;
          pageIndex++;
        }
      }

      const cleanTitle = selectedLaporan.replace(/_/g, '_');
      pdf.save(`SIREKAP_${cleanTitle}_${selectedYear}.pdf`);
      setShowPdfModal(false);
    } catch (error) {
      console.error("Gagal mengekspor file PDF:", error);
      updatePrintPageStyle(pdfPaperSize, pdfOrientation);
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Handle direct print trigger
  const handlePrint = async () => {
    updatePrintPageStyle(pdfPaperSize, pdfOrientation);
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
          ukuran_kertas: pdfPaperSize,
          orientasi: pdfOrientation,
          skala: `${pdfScale}%`,
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

  const handleBrowserPrintFromModal = async () => {
    updatePrintPageStyle(pdfPaperSize, pdfOrientation);
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
          ukuran_kertas: pdfPaperSize,
          orientasi: pdfOrientation,
          skala: `${pdfScale}%`,
          waktu_cetak: new Date().toISOString(),
          data_rows_hash: currentReportContentSignature,
          seq: currentSeq
        }
      );
    } catch (err) {
      console.warn("Failed recording print history:", err);
    }
    setShowPdfModal(false);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Aggregate totals
  const totalPaguSum = useMemo(() => reportRows.reduce((s, r) => s + r.pagu, 0), [reportRows]);
  const totalRealisasiSum = useMemo(() => reportRows.reduce((s, r) => s + r.realisasi, 0), [reportRows]);
  const totalSisaSum = useMemo(() => reportRows.reduce((s, r) => s + r.sisa, 0), [reportRows]);
  const avgPersenSum = useMemo(() => totalPaguSum > 0 ? (totalRealisasiSum / totalPaguSum) * 100 : 0, [totalPaguSum, totalRealisasiSum]);

  // Export to Excel with 'NO' column as first column
  const handleExportExcel = () => {
    let wsData: any[][];

    if (selectedLaporan === "belanja_pihak_ketiga") {
      wsData = [
        ['NO', 'NO. KONTRAK', 'TANGGAL', 'PELAKSANA / REKANAN', 'SUB-KEGIATAN', 'URAIAN BELANJA / PEKERJAAN', 'MASA KONTRAK', 'PAGU ANGGARAN (Rp)', 'REALISASI SP2D (Rp)', 'SISA ANGGARAN (Rp)', 'RASIO SERAPAN'],
        ...reportRows.map((r, idx) => [
          idx + 1,
          r.kode,
          r.tanggal || '-',
          r.rekanan || '-',
          r.sub_kegiatan || '-',
          r.nama,
          r.masa_kerja || '-',
          r.pagu,
          r.realisasi,
          r.sisa,
          `${r.persen}%`
        ]),
        ['TOTAL', '', '', '', '', '', '', totalPaguSum, totalRealisasiSum, totalSisaSum, `${avgPersenSum.toFixed(2)}%`]
      ];
    } else {
      wsData = [
        ['NO', 'KODE/TANGGAL', 'URAIAN KEGIATAN', 'PAGU (Rp)', 'REALISASI (Rp)', 'SISA (Rp)', 'PERSENTASE'],
        ...reportRows.map((r, idx) => [idx + 1, r.kode, r.nama, r.pagu, r.realisasi, r.sisa, `${r.persen}%`]),
        ['TOTAL', '', '', totalPaguSum, totalRealisasiSum, totalSisaSum, `${avgPersenSum.toFixed(2)}%`]
      ];
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Laporan");
    XLSX.writeFile(wb, `SIREKAP_Laporan_${selectedLaporan}_${selectedYear}.xlsx`);
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
            className="p-2.5 border border-slate-200 bg-white font-bold rounded-lg outline-blue-600 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 cursor-pointer"
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
        <div className="flex gap-2.5 flex-wrap items-center">
          {selectedLaporan === "bulanan" && (
            <div>
              <label className="block text-slate-500 font-bold mb-1">Filter Bulan</label>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="p-2 border border-slate-200 rounded-md bg-white font-semibold cursor-pointer">
                <option value="Semua">Semua Bulan</option>
                {monthsList.map((m, idx) => <option key={idx} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {selectedLaporan === "belanja_pihak_ketiga" && (
            <div>
              <label className="block text-slate-500 font-bold mb-1">Filter Sub-Kegiatan</label>
              <select 
                value={selectedSubKegFilter} 
                onChange={(e) => setSelectedSubKegFilter(e.target.value)} 
                className="p-2 border border-slate-200 rounded-md bg-white font-semibold text-xs cursor-pointer max-w-xs truncate"
              >
                <option value="Semua">Semua Sub-Kegiatan ({pihakKetigas.length} Kontrak)</option>
                {subKegiatans.map((s) => (
                  <option key={s.id} value={s.kode_sub_kegiatan}>
                    {s.kode_sub_kegiatan} - {s.nama_sub_kegiatan}
                  </option>
                ))}
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
            <img 
              src={logoBase64 || "/logo_kab_bima.png"} 
              alt="Logo Resmi Pemerintah Kabupaten Bima" 
              className="w-16 h-16 object-contain shrink-0" 
              crossOrigin="anonymous"
              loading="eager"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/logo_kab_bima.png";
              }}
            />
            <div className="text-left">
              <h1 className="text-base font-black tracking-widest text-slate-900 uppercase">PEMERINTAH KABUPATEN BIMA</h1>
              <h2 className="text-sm font-extrabold tracking-widest text-slate-800 uppercase mt-0.5">DINAS PERUMAHAN DAN KAWASAN PERMUKIMAN</h2>
              <p className="text-[9px] text-slate-500 font-semibold italic mt-0.5">Jl. Soekarno Hatta No. 07 Kompleks Perkantoran Pemerintah Kabupaten Bima Dadibou - Woha</p>
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
                <th className="p-3 border border-slate-300 text-center w-12 font-bold">NO</th>
                <th className="p-3 border border-slate-300 w-36">
                  {selectedLaporan === "belanja_pihak_ketiga" ? "NO. KONTRAK / TGL" : "KODE / TANGGAL"}
                </th>
                <th className="p-3 border border-slate-300">
                  {selectedLaporan === "belanja_pihak_ketiga" ? "REKANAN & URAIAN BELANJA PIHAK KETIGA" : "NAMA & URAIAN DETAIL KEGIATAN"}
                </th>
                <th className="p-3 border border-slate-300 text-right w-36">
                  {selectedLaporan === "belanja_pihak_ketiga" ? "PAGU / NILAI KONTRAK" : "PAGU ANGGARAN"}
                </th>
                <th className="p-3 border border-slate-300 text-right w-36">
                  {selectedLaporan === "belanja_pihak_ketiga" ? "REALISASI SP2D" : "REALISASI KAS"}
                </th>
                <th className="p-3 border border-slate-300 text-right w-36">
                  {selectedLaporan === "belanja_pihak_ketiga" ? "SISA ANGGARAN" : "SISA PLAFON"}
                </th>
                <th className="p-3 border border-slate-300 text-center w-24">RASIO SERAPAN</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-800">
              {reportRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                    {selectedLaporan === "belanja_pihak_ketiga" 
                      ? "Belum ada data belanja pihak ketiga yang tercatat pada Tahun Anggaran ini. Silakan tambahkan pada menu Belanja Pihak Ketiga."
                      : "Tidak ada data rekapan yang tersedia untuk kriteria laporan ini."}
                  </td>
                </tr>
              ) : (
                reportRows.map((row, index) => (
                  <tr key={index} className="hover:bg-slate-50/20 divide-x font-medium">
                    <td className="p-2.5 border border-slate-200 text-center font-bold text-slate-700 w-12 font-mono">
                      {index + 1}
                    </td>
                    <td className="p-2.5 border border-slate-200 font-mono font-semibold whitespace-nowrap">
                      {selectedLaporan === "belanja_pihak_ketiga" ? (
                        <div>
                          <span className="font-bold text-slate-800 block text-[11px]">{row.kode}</span>
                          {row.tanggal && <span className="text-[9px] text-slate-500 font-sans block">{row.tanggal}</span>}
                        </div>
                      ) : (
                        row.kode
                      )}
                    </td>
                    <td className="p-2.5 border border-slate-200 break-words whitespace-normal min-w-[260px] max-w-md font-semibold text-slate-900 leading-snug">
                      {selectedLaporan === "belanja_pihak_ketiga" ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-blue-900 text-[11px]">{row.nama}</span>
                            {row.rekanan && (
                              <span className="px-1.5 py-0.5 bg-orange-100 text-orange-900 border border-orange-200 rounded text-[9px] font-black uppercase">
                                {row.rekanan}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-normal flex items-center gap-3 flex-wrap">
                            {row.sub_kegiatan && <span>Sub-Keg: <b className="text-slate-700">{row.sub_kegiatan}</b></span>}
                            {row.masa_kerja && <span>Masa: <b className="text-slate-700 font-mono">{row.masa_kerja}</b></span>}
                          </div>
                        </div>
                      ) : (
                        row.nama
                      )}
                    </td>
                    <td className="p-2.5 border border-slate-200 text-right font-bold whitespace-nowrap text-slate-800">
                      {formatRupiah(row.pagu)}
                    </td>
                    <td className="p-2.5 border border-slate-200 text-right text-emerald-800 font-bold whitespace-nowrap">
                      {formatRupiah(row.realisasi)}
                    </td>
                    <td className={`p-2.5 border border-slate-200 text-right whitespace-nowrap font-bold ${row.sisa < 0 ? 'text-red-600 font-black' : 'text-slate-700'}`}>
                      {formatRupiah(row.sisa)}
                    </td>
                    <td className="p-2.5 border border-slate-200 text-center font-bold whitespace-nowrap">
                      {row.persen}%
                    </td>
                  </tr>
                ))
              )}

              {/* Accumulator Row summary info */}
              <tr className="bg-slate-50 font-black text-rose-950 divide-x border-t-2 border-slate-300">
                <td colSpan={3} className="p-3 text-right uppercase border border-slate-300">
                  {selectedLaporan === "belanja_pihak_ketiga" ? "TOTAL BELANJA JASA PIHAK KETIGA:" : "TOTAL KESELURUHAN (TOTAL EXPENDITURES):"}
                </td>
                <td className="p-3 text-right border border-slate-300 text-slate-900">
                  {formatRupiah(totalPaguSum)}
                </td>
                <td className="p-3 text-right border border-slate-300 text-emerald-900">
                  {formatRupiah(totalRealisasiSum)}
                </td>
                <td className={`p-3 text-right border border-slate-300 font-mono ${totalSisaSum < 0 ? 'text-red-600 font-black' : 'text-slate-800'}`}>
                  {formatRupiah(totalSisaSum)}
                </td>
                <td className="p-3 text-center border border-slate-300">
                  {avgPersenSum.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Offsite legal signing "Tanda Tangan Pengesahan" */}
        <div className="grid grid-cols-2 gap-4 pt-0 text-center text-xs select-none font-medium" id="signing-block">
          <div>
            <p className="text-slate-500 font-semibold uppercase">Mengetahui & Menyetujui,</p>
            <p className="text-slate-800 font-extrabold mt-0.5">{jabatanPejabat}</p>
            <div className="h-16 flex items-center justify-center" />
            <p className="text-slate-900 font-extrabold underline uppercase">{namaPejabat}</p>
            <p className="text-[10px] text-slate-500 font-bold font-mono">{nipPejabat}</p>
          </div>

          <div>
            <p className="text-slate-500 font-semibold uppercase">Bima, {new Date().toLocaleDateString('id-ID', {year:'numeric', month:'long', day:'numeric'})}</p>
            <p className="text-slate-800 font-extrabold mt-0.5">{jabatanBendahara}</p>
            <div className="h-16 flex items-center justify-center" />
            <p className="text-slate-900 font-extrabold underline uppercase">{namaBendahara}</p>
            <p className="text-[10px] text-slate-500 font-bold font-mono">{nipBendahara}</p>
          </div>
        </div>

      </div>

      {/* PDF Export confirmation & settings modal */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4 z-50 animate-fade-in print:hidden" id="pdf-export-modal">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-150 shadow-2xl overflow-hidden p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-50 text-red-700 flex items-center justify-center border border-red-150 shadow-3xs">
                  <FileText size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Pengaturan Ekspor PDF</h4>
                  <p className="text-[10px] text-slate-500 font-medium">Sesuaikan format kertas, orientasi, dan skala cetak</p>
                </div>
              </div>
              <button 
                onClick={() => setShowPdfModal(false)}
                disabled={isGeneratingPdf}
                className="text-slate-400 hover:text-slate-600 transition cursor-pointer font-bold text-sm p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-700">
              {/* 1. Pengaturan Ukuran Kertas */}
              <div className="space-y-2">
                <label className="flex items-center justify-between font-extrabold text-slate-700 uppercase tracking-wider text-[10px]">
                  <span className="flex items-center gap-1.5">
                    <Maximize2 size={12} className="text-blue-600" />
                    1. Ukuran Kertas (Paper Size)
                  </span>
                  <span className="text-blue-700 font-bold font-mono text-[10px] bg-blue-50 px-2 py-0.5 rounded border border-blue-150">
                    {pdfPaperSize}
                  </span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {[
                    { id: 'A4', label: 'A4', desc: '210 × 297 mm', badge: 'Standar' },
                    { id: 'F4', label: 'F4 / Folio', desc: '215 × 330 mm', badge: 'Pemda' },
                    { id: 'Letter', label: 'Letter', desc: '216 × 279 mm', badge: 'Kuarto' },
                    { id: 'Legal', label: 'Legal', desc: '216 × 356 mm', badge: '' },
                    { id: 'A3', label: 'A3', desc: '297 × 420 mm', badge: 'Lebar' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPdfPaperSize(p.id as any)}
                      className={`p-2 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-between min-h-[64px] ${
                        pdfPaperSize === p.id 
                          ? 'border-blue-600 bg-blue-50/70 text-blue-900 shadow-3xs ring-1 ring-blue-600' 
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-extrabold text-xs block">{p.label}</span>
                      <span className="text-[9px] text-slate-500 font-mono block mt-0.5">{p.desc}</span>
                      {p.badge && (
                        <span className={`text-[8px] font-black uppercase px-1 py-0.2 rounded mt-1 ${
                          pdfPaperSize === p.id ? 'bg-blue-200 text-blue-900' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {p.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Pengaturan Tata Letak / Orientasi */}
              <div className="space-y-2">
                <label className="flex items-center justify-between font-extrabold text-slate-700 uppercase tracking-wider text-[10px]">
                  <span className="flex items-center gap-1.5">
                    <Compass size={12} className="text-indigo-600" />
                    2. Tata Letak (Orientasi Kertas)
                  </span>
                  <span className="text-indigo-700 font-bold uppercase text-[10px] bg-indigo-50 px-2 py-0.5 rounded border border-indigo-150">
                    {pdfOrientation === 'landscape' ? 'Landscape (Mendatar)' : 'Portrait (Tegak)'}
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPdfOrientation('landscape')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer relative ${
                      pdfOrientation === 'landscape'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 shadow-3xs ring-1 ring-indigo-600'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs">Landscape (Mendatar)</span>
                      <span className="text-[8px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded uppercase">
                        Sangat Disarankan
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                      Format ideal untuk tabel keuangan 7 kolom agar angka pagu, realisasi, dan rasio tidak terpotong.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPdfOrientation('portrait')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      pdfOrientation === 'portrait'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 shadow-3xs ring-1 ring-indigo-600'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs">Portrait (Tegak)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                      Format tegak standar. Gunakan skala 80% atau 75% jika kolom tabel melebihi batas kanan.
                    </p>
                  </button>
                </div>
              </div>

              {/* 3. Pengaturan Skala Cetak / Export */}
              <div className="space-y-2">
                <div className="flex items-center justify-between font-extrabold text-slate-700 uppercase tracking-wider text-[10px]">
                  <span className="flex items-center gap-1.5">
                    <Sliders size={12} className="text-emerald-600" />
                    3. Skala Dokumen (Zoom / Scaling)
                  </span>
                  <span className="text-emerald-700 font-mono font-black text-xs bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-150">
                    {pdfScale}%
                  </span>
                </div>

                {/* Quick scale presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { val: 100, label: '100% (Penuh)' },
                    { val: 90, label: '90% (Pas)' },
                    { val: 80, label: '80% (Kompak)' },
                    { val: 75, label: '75% (Rapat)' },
                    { val: 65, label: '65% (Kecil)' }
                  ].map(sc => (
                    <button
                      key={sc.val}
                      type="button"
                      onClick={() => setPdfScale(sc.val)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                        pdfScale === sc.val 
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-3xs' 
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>

                {/* Slider */}
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[10px] font-mono text-slate-400">50%</span>
                  <input
                    type="range"
                    min="50"
                    max="120"
                    step="5"
                    value={pdfScale}
                    onChange={(e) => setPdfScale(parseInt(e.target.value, 10))}
                    className="flex-1 accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                  />
                  <span className="text-[10px] font-mono text-slate-400">120%</span>
                </div>
              </div>

              {/* Legal verification & document details summary */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-[10px]">
                <div className="flex justify-between items-center text-slate-700">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Laporan:</span>
                  <span className="font-black text-slate-800 uppercase text-right truncate max-w-[220px]">
                    {selectedLaporan.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-700">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Status Verifikasi:</span>
                  {isDataSameAsPrevious ? (
                    <span className="inline-flex items-center gap-1 font-extrabold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full text-[9px]">
                      <CheckCircle size={9} />
                      IDENTIK (No Urut Tetap #{String(currentSeq).padStart(3, '0')})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-extrabold text-blue-800 bg-blue-100/90 px-2 py-0.5 rounded-full text-[9px]">
                      DATA BARU (No Urut Baru #{String(currentSeq).padStart(3, '0')})
                    </span>
                  )}
                </div>
                <div className="border-t border-dashed border-slate-200 pt-1.5">
                  <p className="font-bold text-slate-400 uppercase tracking-widest text-[9px]">Kode Dokumen Rekap Resmi:</p>
                  <p className="font-mono font-black text-blue-700 text-[10px] tracking-wide select-all break-all mt-0.5">
                    {currentDocCode}
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <button
                onClick={handleDownloadDirectPdf}
                disabled={isGeneratingPdf}
                className="w-full py-2.5 px-4 bg-red-700 hover:bg-red-800 disabled:bg-red-400 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
              >
                {isGeneratingPdf ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Sedang Memproses & Mengunduh Berkas PDF...
                  </>
                ) : (
                  <>
                    <FileDown size={15} />
                    Unduh Berkas PDF (.pdf)
                  </>
                )}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={handleBrowserPrintFromModal}
                  disabled={isGeneratingPdf}
                  className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 border border-slate-200"
                >
                  <Printer size={13} />
                  Dialog Cetak Browser
                </button>
                <button
                  onClick={() => setShowPdfModal(false)}
                  disabled={isGeneratingPdf}
                  className="py-2 px-4 bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl transition cursor-pointer border border-slate-200"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
