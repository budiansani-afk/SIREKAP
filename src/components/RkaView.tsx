import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Download, 
  Search, 
  Upload, 
  FileSpreadsheet, 
  Filter, 
  Table,
  CheckCircle,
  XCircle,
  AlertCircle,
  Copy
} from 'lucide-react';
import { RKA, Program, Kegiatan, SubKegiatan, UserRole } from '../types';
import { formatRupiah, exportToCSV } from '../utils/helpers';
import * as XLSX from 'xlsx';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { COLL_RKA, createAuditLog, synchronizeCalculations } from '../dbService';

interface RkaViewProps {
  rkaList: RKA[];
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  allPrograms?: Program[];
  allKegiatans?: Kegiatan[];
  allSubKegiatans?: SubKegiatan[];
  currentUserRole: UserRole;
  currentUserEmail: string;
  selectedYear: number;
}

export default function RkaView({
  rkaList,
  programs,
  kegiatans,
  subKegiatans,
  allPrograms,
  allKegiatans,
  allSubKegiatans,
  currentUserRole,
  currentUserEmail,
  selectedYear
}: RkaViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUraian, setFilterUraian] = useState('');
  const [filterTahun, setFilterTahun] = useState<string>(String(selectedYear));
  const [filterProgram, setFilterProgram] = useState('');
  const [filterKegiatan, setFilterKegiatan] = useState('');
  const [filterSubKegiatan, setFilterSubKegiatan] = useState('');

  // Modals state
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailItem, setDetailItem] = useState<RKA | null>(null);
  const [editItem, setEditItem] = useState<RKA | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Form Fields
  const [formTahun, setFormTahun] = useState<number>(selectedYear);

  React.useEffect(() => {
    setFilterTahun(String(selectedYear));
    setFormTahun(selectedYear);
  }, [selectedYear]);
  const [formSubKegiatan, setFormSubKegiatan] = useState('');
  const [formRekening, setFormRekening] = useState('');
  const [formUraian, setFormUraian] = useState('');
  const [formVolume, setFormVolume] = useState<number>(1);
  const [formSatuan, setFormSatuan] = useState('Paket');
  const [formHarga, setFormHarga] = useState<number>(0);
  
  // Triwulan Breakdowns
  const [formTw1, setFormTw1] = useState<number>(0);
  const [formTw2, setFormTw2] = useState<number>(0);
  const [formTw3, setFormTw3] = useState<number>(0);
  const [formTw4, setFormTw4] = useState<number>(0);

  // Import Excel State
  const [excelPreviewData, setExcelPreviewData] = useState<any[]>([]);
  const [excelSheetNames, setExcelSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    tahun: '',
    kode_sub_kegiatan: '',
    kode_rekening: '',
    uraian_belanja: '',
    volume: '',
    satuan: '',
    harga_satuan: '',
    jumlah: '',
    tw1: '',
    tw2: '',
    tw3: '',
    tw4: ''
  });
  const [importStatus, setImportStatus] = useState<{ success: number; failed: number } | null>(null);

  const canEdit = currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.OPERATOR;

  // Handle Dynamic Calculations
  const computedJumlah = useMemo(() => {
    return formVolume * formHarga;
  }, [formVolume, formHarga]);

  // Handle automatic triwulan allocation (evenly divided by default or custom input)
  const allocateTwEvenly = () => {
    const quarterVal = Math.floor(computedJumlah / 4);
    const remainder = computedJumlah - (quarterVal * 4);
    setFormTw1(quarterVal + remainder);
    setFormTw2(quarterVal);
    setFormTw3(quarterVal);
    setFormTw4(quarterVal);
  };

  // RKA Filter Logic
  const filteredRka = useMemo(() => {
    return rkaList.filter(r => {
      const matchSearch = (r && r.uraian_belanja ? String(r.uraian_belanja).toLowerCase().includes(searchTerm.toLowerCase()) : false) || 
                          (r && r.kode_rekening ? String(r.kode_rekening).toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
                          (r && r.kode_sub_kegiatan ? String(r.kode_sub_kegiatan).toLowerCase().includes(searchTerm.toLowerCase()) : false);
      const matchTahun = filterTahun === '' || (r && String(r.tahun) === filterTahun);
      const matchProgram = filterProgram === '' || (r && r.kode_program === filterProgram);
      const matchKegiatan = filterKegiatan === '' || (r && r.kode_kegiatan === filterKegiatan);
      const matchSub = filterSubKegiatan === '' || (r && r.kode_sub_kegiatan === filterSubKegiatan);

      return matchSearch && matchTahun && matchProgram && matchKegiatan && matchSub;
    });
  }, [rkaList, searchTerm, filterTahun, filterProgram, filterKegiatan, filterSubKegiatan]);

  // Total anggaran hasil filter
  const totalAnggaranFiltered = useMemo(() => {
    return filteredRka.reduce((sum, item) => sum + (item.jumlah || 0), 0);
  }, [filteredRka]);

  // Open Form modal
  const openAddModal = () => {
    setEditItem(null);
    setFormTahun(selectedYear);
    setFormSubKegiatan('');
    setFormRekening('');
    setFormUraian('');
    setFormVolume(1);
    setFormSatuan('Paket');
    setFormHarga(0);
    setFormTw1(0);
    setFormTw2(0);
    setFormTw3(0);
    setFormTw4(0);
    setShowForm(true);
  };

  const openEditModal = (item: RKA) => {
    setEditItem(item);
    setFormTahun(item.tahun);
    setFormSubKegiatan(item.kode_sub_kegiatan);
    setFormRekening(item.kode_rekening);
    setFormUraian(item.uraian_belanja);
    setFormVolume(item.volume);
    setFormSatuan(item.satuan);
    setFormHarga(item.harga_satuan);
    setFormTw1(item.tw1 || 0);
    setFormTw2(item.tw2 || 0);
    setFormTw3(item.tw3 || 0);
    setFormTw4(item.tw4 || 0);
    setShowForm(true);
  };

  const handleCopyData = (item: RKA) => {
    setEditItem(null);
    setFormTahun(item.tahun);
    setFormSubKegiatan(item.kode_sub_kegiatan);
    setFormRekening(item.kode_rekening);
    setFormUraian(item.uraian_belanja);
    setFormVolume(item.volume);
    setFormSatuan(item.satuan);
    setFormHarga(item.harga_satuan);
    setFormTw1(item.tw1 || 0);
    setFormTw2(item.tw2 || 0);
    setFormTw3(item.tw3 || 0);
    setFormTw4(item.tw4 || 0);
    setShowForm(true);
  };

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubKegiatan || !formUraian.trim()) {
      alert("Harap lengkapi semua field bertanda *");
      return;
    }

    const linkedSub = subKegiatans.find(s => s.kode_sub_kegiatan === formSubKegiatan);
    if (!linkedSub) {
      alert("Kode Sub-Kegiatan tidak valid / tidak sinkron!");
      return;
    }

    // Automatically divide computedJumlah evenly across 4 quarters since Triwulan is disabled/hidden from form view
    const quarterAmt = Math.floor(computedJumlah / 4);
    const balanceRemainder = computedJumlah - (quarterAmt * 4);
    const tw1Val = quarterAmt + balanceRemainder;
    const tw2Val = quarterAmt;
    const tw3Val = quarterAmt;
    const tw4Val = quarterAmt;

    try {
      const docId = editItem ? editItem.id : `rka_${Date.now()}`;
      const payload: RKA = {
        id: docId,
        tahun: formTahun,
        kode_program: linkedSub.kode_program,
        kode_kegiatan: linkedSub.kode_kegiatan,
        kode_sub_kegiatan: formSubKegiatan,
        kode_rekening: formRekening,
        uraian_belanja: formUraian.trim(),
        volume: formVolume,
        satuan: formSatuan,
        harga_satuan: formHarga,
        jumlah: computedJumlah,
        tw1: tw1Val,
        tw2: tw2Val,
        tw3: tw3Val,
        tw4: tw4Val
      };

      await setDoc(doc(db, COLL_RKA, docId), payload).catch(err => handleFirestoreError(err, OperationType.WRITE, `${COLL_RKA}/${docId}`));

      // Log Activities
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        editItem ? "UPDATE RKA ITEM" : "TAMBAH RKA ITEM",
        "RKA",
        editItem,
        payload
      );

      // Cascading update budget targets
      await synchronizeCalculations();

      setShowForm(false);
      setEditItem(null);
    } catch (err) {
      alert("Gagal menambahkan item: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Handle Deletion
  const handleDelete = async (item: RKA) => {
    const isConfirmed = window.confirm(`Hapus uraian belanja "${item.uraian_belanja}"?`);
    if (!isConfirmed) return;

    try {
      await deleteDoc(doc(db, COLL_RKA, item.id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `${COLL_RKA}/${item.id}`));
      
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        "HAPUS RKA ITEM",
        "RKA",
        item,
        null
      );

      // Cascade recalculate
      await synchronizeCalculations();
    } catch (err) {
      alert("Gagal menghapus: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Parser Excel logic
  const handleExcelImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const bstr = event.target?.result;
      const wb = XLSX.read(bstr, { type: 'array' });
      setExcelSheetNames(wb.SheetNames);
      
      // Load first sheet by default
      const firstSheet = wb.SheetNames[0];
      setSelectedSheet(firstSheet);
      
      const ws = wb.Sheets[firstSheet];
      const data = XLSX.utils.sheet_to_json(ws);
      setExcelPreviewData(data);

      // Attempt automatic mapping
      if (data.length > 0) {
        const firstRowKeys = Object.keys(data[0]);
        const mapped: Record<string, string> = { ...columnMapping };
        
        firstRowKeys.forEach(k => {
          const lk = k.toLowerCase();
          if (lk.includes('tahun')) mapped.tahun = k;
          if (lk.includes('sub_kegiatan') || lk.includes('sub kegiatan') || lk.includes('kode sub')) mapped.kode_sub_kegiatan = k;
          if (lk.includes('rekening')) mapped.kode_rekening = k;
          if (lk.includes('uraian') || lk.includes('belanja')) mapped.uraian_belanja = k;
          if (lk.includes('volume') || lk.includes('vol')) mapped.volume = k;
          if (lk.includes('satuan') || lk.includes('sat')) mapped.satuan = k;
          if (lk.includes('harga') || lk.includes('satuan harga')) mapped.harga_satuan = k;
          if (lk.includes('jumlah') || lk.includes('total')) mapped.jumlah = k;
          if (lk.includes('tw1') || lk.includes('triwulan 1')) mapped.tw1 = k;
          if (lk.includes('tw2') || lk.includes('triwulan 2')) mapped.tw2 = k;
          if (lk.includes('tw3') || lk.includes('triwulan 3')) mapped.tw3 = k;
          if (lk.includes('tw4') || lk.includes('triwulan 4')) mapped.tw4 = k;
        });

        setColumnMapping(mapped);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Perform saving of imported Excel rows to Firestore
  const processImportToFirestore = async () => {
    if (excelPreviewData.length === 0) {
      alert("Tidak ada data untuk di-import.");
      return;
    }

    let successCount = 0;
    let failedCount = 0;
    const clonedSubCodes = new Set<string>();

    for (const row of excelPreviewData) {
      try {
        const rkaTahun = selectedYear; // Force the imported RKA year to follow the active year
        const rkaSub = String(row[columnMapping.kode_sub_kegiatan] || '').trim();
        const rkaRekening = String(row[columnMapping.kode_rekening] || '').trim();
        const rkaUraian = String(row[columnMapping.uraian_belanja] || '').trim();
        const rkaVolume = Number(row[columnMapping.volume]) || 1;
        const rkaSatuan = String(row[columnMapping.satuan] || 'Paket').trim();
        const rkaHarga = Number(row[columnMapping.harga_satuan]) || 0;
        
        const rkaJumlah = rkaVolume * rkaHarga;
        const tw1 = Number(row[columnMapping.tw1]) || Math.floor(rkaJumlah / 4);
        const tw2 = Number(row[columnMapping.tw2]) || Math.floor(rkaJumlah / 4);
        const tw3 = Number(row[columnMapping.tw3]) || Math.floor(rkaJumlah / 4);
        const tw4 = Number(row[columnMapping.tw4]) || (rkaJumlah - (tw1 + tw2 + tw3));

        if (!rkaSub || !rkaUraian) {
          failedCount++;
          continue;
        }

        // Must relate to an existing sub kegiatan
        let linkedSub = subKegiatans.find(s => s.kode_sub_kegiatan === rkaSub);
        
        if (!linkedSub && allSubKegiatans) {
          const globalSub = allSubKegiatans.find(s => s.kode_sub_kegiatan === rkaSub);
          if (globalSub) {
            if (!clonedSubCodes.has(rkaSub)) {
              // 1. Copy parent Program to target year if it doesn't exist yet
              const parentProgram = allPrograms?.find(p => p.kode_program === globalSub.kode_program);
              if (parentProgram) {
                const programDocRef = doc(db, 'sibiru_program', `${selectedYear}_${parentProgram.kode_program}`);
                await setDoc(programDocRef, {
                  ...parentProgram,
                  id: `${selectedYear}_${parentProgram.kode_program}`,
                  tahun: selectedYear
                }, { merge: true });
              }
              
              // 2. Copy parent Kegiatan to target year
              const parentKegiatan = allKegiatans?.find(k => k.kode_kegiatan === globalSub.kode_kegiatan);
              if (parentKegiatan) {
                const kegiatanDocRef = doc(db, 'sibiru_kegiatan', `${selectedYear}_${parentKegiatan.kode_kegiatan}`);
                await setDoc(kegiatanDocRef, {
                  ...parentKegiatan,
                  id: `${selectedYear}_${parentKegiatan.kode_kegiatan}`,
                  tahun: selectedYear
                }, { merge: true });
              }
              
              // 3. Copy Sub-Kegiatan to target year
              const subDocRef = doc(db, 'sibiru_sub_kegiatan', `${selectedYear}_${globalSub.kode_sub_kegiatan}`);
              await setDoc(subDocRef, {
                ...globalSub,
                id: `${selectedYear}_${globalSub.kode_sub_kegiatan}`,
                tahun: selectedYear
              }, { merge: true });
              
              clonedSubCodes.add(rkaSub);
            }
            
            linkedSub = {
              ...globalSub,
              tahun: selectedYear
            };
          }
        }

        if (!linkedSub) {
          failedCount++;
          continue;
        }

        const customId = `rka_excel_${rkaSub}_${rkaRekening.replace(/\./g, '_')}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const payload: RKA = {
          id: customId,
          tahun: rkaTahun,
          kode_program: linkedSub.kode_program,
          kode_kegiatan: linkedSub.kode_kegiatan,
          kode_sub_kegiatan: rkaSub,
          kode_rekening: rkaRekening,
          uraian_belanja: rkaUraian,
          volume: rkaVolume,
          satuan: rkaSatuan,
          harga_satuan: rkaHarga,
          jumlah: rkaJumlah,
          tw1: tw1,
          tw2: tw2,
          tw3: tw3,
          tw4: tw4
        };

        await setDoc(doc(db, COLL_RKA, customId), payload);
        successCount++;

      } catch (e) {
        failedCount++;
      }
    }

    setImportStatus({ success: successCount, failed: failedCount });

    // Flush cascading system
    await synchronizeCalculations();

    // Log the Import Action
    await createAuditLog(
      currentUserEmail,
      currentUserRole,
      "IMPORT EXCEL RKA",
      "RKA",
      null,
      { rows_imported: successCount, rows_failed: failedCount }
    );
  };

  // Export tables
  const handleExportRka = () => {
    const exportHeaders = [
      'tahun', 'kode_program', 'kode_kegiatan', 'kode_sub_kegiatan', 
      'kode_rekening', 'uraian_belanja', 'volume', 'satuan', 'harga_satuan', 
      'jumlah', 'tw1', 'tw2', 'tw3', 'tw4'
    ];
    exportToCSV(filteredRka, exportHeaders, 'Rencana_Belanja_RKA_Pertanahan_2026');
  };

  return (
    <div className="space-y-6" id="rka-module-root">
      
      {/* Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="rka-title-section">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 font-display">
            <FileSpreadsheet className="text-[#1e3a8a]" size={20} />
            E-RKA Perencanaan Rincian Belanja
          </h2>
          <p className="text-xs text-slate-500 mt-1">Daftar pagu rincian belanja, pembagian anggaran termin Triwulan, dan import-export excel bulanan.</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {canEdit && (
            <button
              onClick={() => {
                setExcelPreviewData([]);
                setImportStatus(null);
                setShowImportModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#15803d] bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition cursor-pointer"
              id="btn-import-rka"
            >
              <Upload size={14} />
              Impor Excel
            </button>
          )}
          <button 
            onClick={handleExportRka}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition cursor-pointer"
          >
            <Download size={14} />
            Ekspor CSV
          </button>
          {canEdit && (
            <button 
              onClick={openAddModal}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1e40af] hover:bg-[#1e3a8a] rounded-lg shadow-sm transition cursor-pointer"
              id="btn-add-rka"
            >
              <Plus size={15} />
              Tambah Rincian Belanja
            </button>
          )}
        </div>
      </div>

      {/* Grid Filter Box */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs" id="rka-filters-box">
        {/* Filter Tahun */}
        <div>
          <label className="block text-slate-500 font-bold mb-1">Tahun Anggaran</label>
          <select value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)} className="w-full p-2 border border-slate-200 rounded-md">
            <option value="">Semua Tahun</option>
            <option value="2026">Tahun 2026</option>
            <option value="2025">Tahun 2025</option>
          </select>
        </div>

        {/* Filter Program */}
        <div>
          <label className="block text-slate-500 font-bold mb-1">Filter Program</label>
          <select value={filterProgram} onChange={(e) => { setFilterProgram(e.target.value); setFilterKegiatan(''); setFilterSubKegiatan(''); }} className="w-full p-2 border border-slate-200 rounded-md">
            <option value="">Semua Program</option>
            {programs.map((p, i) => (
              <option key={i} value={p.kode_program}>{p.kode_program} - {(p.nama_program || '').substring(0,25)}...</option>
            ))}
          </select>
        </div>

        {/* Filter Kegiatan */}
        <div>
          <label className="block text-slate-500 font-bold mb-1">Filter Kegiatan</label>
          <select 
            value={filterKegiatan} 
            onChange={(e) => { setFilterKegiatan(e.target.value); setFilterSubKegiatan(''); }} 
            className="w-full p-2 border border-slate-200 rounded-md"
          >
            <option value="">Semua Kegiatan</option>
            {kegiatans
              .filter(k => filterProgram === '' || k.kode_program === filterProgram)
              .map((k, i) => (
                <option key={i} value={k.kode_kegiatan}>{k.kode_kegiatan} - {(k.nama_kegiatan || '').substring(0,25)}...</option>
              ))
            }
          </select>
        </div>

        {/* Filter Sub Kegiatan */}
        <div>
          <label className="block text-slate-500 font-bold mb-1">Filter Sub-Kegiatan</label>
          <select 
            value={filterSubKegiatan} 
            onChange={(e) => setFilterSubKegiatan(e.target.value)} 
            className="w-full p-2 border border-slate-200 rounded-md"
          >
            <option value="">Semua Sub-Kegiatan</option>
            {subKegiatans
              .filter(s => filterKegiatan === '' || s.kode_kegiatan === filterKegiatan)
              .map((s, i) => (
                <option key={i} value={s.kode_sub_kegiatan}>{s.kode_sub_kegiatan} - {s.nama_sub_kegiatan || ''}</option>
              ))
            }
          </select>
        </div>
        <div>
          <label className="block text-slate-500 font-bold mb-1">Cari Keterangan Belanja</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Cari uraian / No_Rek..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full p-2 pl-8 border border-slate-200 rounded-md"
            />
          </div>
        </div>
      </div>

      {/* Filtered Total Summary Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-orange-50/70 border border-blue-200/60 rounded-xl px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-3xs" id="rka-filter-summary">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-3xs">
            {filteredRka.length}
          </div>
          <div>
            <p className="text-[11px] font-black text-blue-900 uppercase tracking-wider leading-none">Hasil Penyaringan Anggaran</p>
            <p className="text-[10px] text-slate-500 mt-1">Ditemukan {filteredRka.length} item rincian kerja anggaran aktif.</p>
          </div>
        </div>
        
        <div className="bg-white border border-orange-200 shadow-3xs rounded-lg px-4 py-2 flex items-center gap-3 shrink-0">
          <span className="text-[10px] text-orange-600 uppercase font-black tracking-wider border-r border-slate-100 pr-3">Total Anggaran Saringan</span>
          <span className="text-sm font-black text-blue-950 font-mono tracking-tight">{formatRupiah(totalAnggaranFiltered)}</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="rka-table-panel">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
                <th className="p-3 pl-4 w-12">TA</th>
                <th className="p-3 w-40">Sub Kegiatan / Rekening</th>
                <th className="p-3 min-w-[220px]">Uraian Detail Belanja</th>
                <th className="p-3 text-center w-16">Vol</th>
                <th className="p-3 text-center w-16">Satuan</th>
                <th className="p-3 text-right w-28">Harga Satuan</th>
                <th className="p-3 text-right w-32">Jumlah Belanja</th>
                {canEdit && <th className="p-3 text-center w-36">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRka.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-semibold">Tabel Rencana Kerja Anggaran kosong / Saring filter lain.</td>
                </tr>
              ) : (
                filteredRka.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition antialiased">
                    <td className="p-3 pl-4 font-mono font-bold text-slate-900">{r.tahun}</td>
                    <td className="p-3">
                      <p className="font-bold text-slate-900 font-mono text-[11px] whitespace-normal break-all">{r.kode_sub_kegiatan}</p>
                      <span className="text-[10px] text-slate-500 font-mono font-medium whitespace-normal break-all">{r.kode_rekening || '-'}</span>
                    </td>
                    <td 
                      className="p-3 font-semibold text-slate-900 break-words whitespace-normal min-w-[220px] max-w-sm cursor-pointer hover:text-blue-700 hover:underline"
                      onClick={() => {
                        setDetailItem(r);
                        setShowDetail(true);
                      }}
                    >
                      {r.uraian_belanja}
                    </td>
                    <td className="p-3 text-center font-bold">{r.volume}</td>
                    <td className="p-3 text-center text-slate-600 font-medium">{r.satuan}</td>
                    <td className="p-3 text-right font-medium">{formatRupiah(r.harga_satuan)}</td>
                    <td className="p-3 text-right font-black text-blue-900">{formatRupiah(r.jumlah)}</td>
                    {canEdit && (
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => openEditModal(r)} className="p-1.5 hover:bg-amber-50 text-amber-700 rounded border border-transparent hover:border-amber-200" title="Edit"><Edit2 size={13} /></button>
                          <button onClick={() => handleDelete(r)} className="p-1.5 hover:bg-red-50 text-red-750 rounded border border-transparent hover:border-red-200" title="Hapus"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RKA Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="rka-form-overlay">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden" id="rka-form-modal">
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-1.5 text-sm">
                <Table size={16} />
                {editItem ? 'Edit Rencana Belanja' : 'Tambah Rencana Belanja (RKA)'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-white hover:text-white/80 font-bold text-lg">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Tahun Anggaran *</label>
                  <input 
                    type="number" 
                    value={formTahun} 
                    onChange={(e) => setFormTahun(Number(e.target.value))} 
                    required 
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Sub-Kegiatan *</label>
                  <select 
                    value={formSubKegiatan} 
                    onChange={(e) => setFormSubKegiatan(e.target.value)} 
                    required 
                    className="w-full p-2 border border-slate-200 rounded-lg outline-blue-600 focus:border-blue-600"
                  >
                    <option value="">-- Pilih Sub-Kegiatan --</option>
                    {subKegiatans.map((sk, id) => (
                      <option key={id} value={sk.kode_sub_kegiatan}>{sk.kode_sub_kegiatan} - {(sk.nama_sub_kegiatan || '').substring(0,35)}...</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Kode Rekening Belanja</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: 5.1.02.01.0004"
                    value={formRekening} 
                    onChange={(e) => setFormRekening(e.target.value)} 
                    className="w-full p-2 border border-slate-200 rounded-lg outline-blue-600 focus:border-blue-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Uraian Belanja *</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: Belanja Cetak Peta Bidang Pertanahan Bima"
                    value={formUraian} 
                    onChange={(e) => setFormUraian(e.target.value)} 
                    required 
                    className="w-full p-2 border border-slate-200 rounded-lg outline-blue-600 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Volume</label>
                  <input 
                    type="number" 
                    value={formVolume} 
                    onChange={(e) => setFormVolume(Math.max(1, Number(e.target.value)))} 
                    min={1}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Satuan</label>
                  <input 
                    type="text" 
                    placeholder="Bulan/Paket/Kali"
                    value={formSatuan} 
                    onChange={(e) => setFormSatuan(e.target.value)} 
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Harga Satuan (Rp) *</label>
                  <input 
                    type="number" 
                    value={formHarga} 
                    onChange={(e) => setFormHarga(Number(e.target.value))} 
                    min={0}
                    required
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 text-blue-900 rounded-lg flex justify-between items-center font-bold">
                <span>Alokasi Total:</span>
                <span className="text-base text-blue-700">{formatRupiah(computedJumlah)}</span>
              </div>



              <div className="flex items-center gap-2 pt-4 justify-end border-t border-slate-100" id="rka-form-actions">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 font-semibold text-slate-700 border border-slate-200 rounded-lg">Batal</button>
                <button type="submit" className="px-5 py-2 font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow">Simpan Rencana Belanja</button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* RKA Detail Modal */}
      {showDetail && detailItem && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Informasi Rincian Belanja</h3>
              <button onClick={() => setShowDetail(false)} className="text-white hover:text-white/80 font-bold text-lg">&times;</button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <span className="font-bold">Program:</span>
                <span>{programs.find(p => p.kode_program === detailItem.kode_program)?.nama_program || detailItem.kode_program}</span>
                <span className="font-bold">Kegiatan:</span>
                <span>{kegiatans.find(k => k.kode_kegiatan === detailItem.kode_kegiatan)?.nama_kegiatan || detailItem.kode_kegiatan}</span>
                <span className="font-bold">Sub-Kegiatan:</span>
                <span>{subKegiatans.find(s => s.kode_sub_kegiatan === detailItem.kode_sub_kegiatan)?.nama_sub_kegiatan || detailItem.kode_sub_kegiatan}</span>
                <span className="font-bold">Besaran:</span>
                <span>{detailItem.volume} {detailItem.satuan}</span>
                <span className="font-bold">Alokasi Anggaran:</span>
                <span className="font-black text-blue-950 text-sm">{formatRupiah(detailItem.jumlah)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RKA Import Excel Dialog */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="import-excel-overlay">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-3xl w-full overflow-hidden" id="import-excel-modal">
            <div className="p-4 bg-emerald-900 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-1.5 text-sm">
                <FileSpreadsheet size={16} />
                Import File Excel (.xlsx / .xls)
              </h3>
              <button onClick={() => setShowImportModal(false)} className="text-white hover:text-white/80 font-bold text-lg">&times;</button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[82vh] overflow-y-auto">
              
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-emerald-500 transition cursor-pointer relative bg-slate-50/50">
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleExcelImportFile} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="mx-auto text-emerald-800 mb-2" size={32} />
                <p className="font-bold text-slate-700">Pilih berkas Excel Anda di sini</p>
                <p className="text-slate-400 mt-1">Mendukung format Buku RKA xlsx, xls, atau csv dengan header kolom.</p>
              </div>

              {/* Excel preview and mapping */}
              {excelPreviewData.length > 0 && (
                <div className="space-y-4">
                  
                  {/* Select sheets */}
                  {excelSheetNames.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">Pilih Lembar Sheet:</span>
                      <select 
                        value={selectedSheet} 
                        onChange={(e) => setSelectedSheet(e.target.value)}
                        className="p-1.5 border border-slate-200 rounded focus:outline-emerald-600"
                      >
                        {excelSheetNames.map((sn, id) => (
                          <option key={id} value={sn}>{sn}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Mapping of columns fields */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-1">
                      <Filter size={13} />
                      Pemetaan Header Kolom Otomatis (Mapping Columns)
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
                      {Object.keys(columnMapping).map((fieldName) => (
                        <div key={fieldName} className="space-y-1">
                          <span className="font-bold uppercase tracking-wide text-slate-500">{fieldName.replace('_', ' ')}:</span>
                          <select
                            value={columnMapping[fieldName]}
                            onChange={(e) => setColumnMapping({ ...columnMapping, [fieldName]: e.target.value })}
                            className="w-full p-1.5 border border-slate-200 bg-white rounded"
                          >
                            <option value="">-- Abaikan --</option>
                            {Object.keys(excelPreviewData[0]).map((sheetCol, cIdx) => (
                              <option key={cIdx} value={sheetCol}>{sheetCol}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Previewing Top 3 Items */}
                  <div>
                    <h4 className="font-bold text-slate-700 mb-2">Pratinjau Data (Preview Top 3 Sheets Rows)</h4>
                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="w-full text-left text-[10px] border-collapse bg-white">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
                            {Object.keys(excelPreviewData[0]).slice(0, 7).map((h, i) => (
                              <th key={i} className="p-2 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {excelPreviewData.slice(0, 3).map((row, rIdx) => (
                            <tr key={rIdx} className="border-b divide-x divide-slate-100">
                              {Object.values(row).slice(0, 7).map((val: any, vIdx) => (
                                <td key={vIdx} className="p-2 whitespace-nowrap max-w-[120px] truncate">{String(val)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                    <span className="text-[11px] text-slate-600">Terbaca sebanyak <b>{excelPreviewData.length}</b> baris data dalam sheet.</span>
                    <button 
                      type="button" 
                      onClick={processImportToFirestore}
                      className="px-5 py-2 font-bold text-white bg-emerald-800 hover:bg-emerald-950 rounded-lg shadow-sm"
                    >
                      Konfirmasi & Simpan ke Database
                    </button>
                  </div>

                </div>
              )}

              {/* Status messages indicator */}
              {importStatus && (
                <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-900 space-y-1.5 text-sm" id="import-report">
                  <p className="font-bold flex items-center gap-1.5">
                    <CheckCircle className="text-emerald-700" size={18} />
                    Import Selesai Diproses!
                  </p>
                  <ul className="list-disc list-inside text-xs space-y-1 pl-1 text-emerald-800">
                    <li>Data Berhasil Disinkronkan: <b>{importStatus.success} Baris</b></li>
                    <li>Row Gagal / Dilewati (Kode Unsur Tidak Ada): <b>{importStatus.failed} Baris</b></li>
                  </ul>
                  <p className="text-[10px] text-slate-400 font-medium">Sistem secara otomatis menyesuaikan budget terdaftar dan memberitahu Admin log.</p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
