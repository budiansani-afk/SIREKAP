import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  TrendingUp, 
  Search, 
  Camera, 
  Calendar, 
  ShieldCheck, 
  AlertTriangle,
  Receipt,
  Download,
  DollarSign
} from 'lucide-react';
import { Realisasi, Program, Kegiatan, SubKegiatan, UserRole, RKA } from '../types';
import { formatRupiah, exportToCSV } from '../utils/helpers';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { COLL_REALISASI, createAuditLog, synchronizeCalculations } from '../dbService';
import { uploadFile, deleteFile } from '../cloudinaryService';

interface RealisasiViewProps {
  realisasis: Realisasi[];
  rkaList: RKA[];
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  currentUserRole: UserRole;
  currentUserEmail: string;
}

export default function RealisasiView({
  realisasis,
  rkaList,
  programs,
  kegiatans,
  subKegiatans,
  currentUserRole,
  currentUserEmail
}: RealisasiViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedSubKeg, setSelectedSubKeg] = useState('');
  const [selectedUraianFilter, setSelectedUraianFilter] = useState('');

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Realisasi | null>(null);

  // Form Fields
  const [formTanggal, setFormTanggal] = useState<string>(new Date().toISOString().substring(0, 10));
  const [formBulan, setFormBulan] = useState<string>("Januari");
  const [formSubKeg, setFormSubKeg] = useState<string>('');
  const [formUraian, setFormUraian] = useState<string>('');
  const [formNominal, setFormNominal] = useState<number>(0);
  const [formKeterangan, setFormKeterangan] = useState<string>('');
  const [formBuktiBase64, setFormBuktiBase64] = useState<string>('');
  const [formBuktiFileName, setFormBuktiFileName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [formUraianIsManual, setFormUraianIsManual] = useState(false);
  const [manualUraianVal, setManualUraianVal] = useState('');

  const canEdit = currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.OPERATOR;

  const monthsList = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  // Dynamic automatic Month selector based on dynamic date inputted
  const handleDateChange = (dateVal: string) => {
    setFormTanggal(dateVal);
    try {
      const parsedDate = new Date(dateVal);
      const mIdx = parsedDate.getMonth();
      if (!isNaN(mIdx)) {
        setFormBulan(monthsList[mIdx]);
      }
    } catch (e){}
  };

  // Upload proof of transaction via Base64 FileReader
  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("SIMPAN DITOLAK: Hanya file berupa foto/gambar bukti kuitansi (.png, .jpg, .jpeg) yang diperkenankan!");
      e.target.value = "";
      return;
    }

    setFormBuktiFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFormBuktiBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Filter calculations list
  const filteredRealisasis = useMemo(() => {
    return realisasis.filter(r => {
      const matchSearch = (r && r.uraian_belanja ? String(r.uraian_belanja).toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
                          (r && r.kode_sub_kegiatan ? String(r.kode_sub_kegiatan).toLowerCase().includes(searchTerm.toLowerCase()) : false);
      const matchMonth = selectedMonth === '' || (r && r.bulan === selectedMonth);
      const matchSub = selectedSubKeg === '' || (r && r.kode_sub_kegiatan === selectedSubKeg);
      const matchUraian = selectedUraianFilter === '' || (r && r.uraian_belanja === selectedUraianFilter);

      return matchSearch && matchMonth && matchSub && matchUraian;
    });
  }, [realisasis, searchTerm, selectedMonth, selectedSubKeg, selectedUraianFilter]);

  // Compute monthly recap indicators filtered by selected sub-kegiatan and description
  const rekapBulanan = useMemo(() => {
    const recaps: Record<string, number> = monthsList.reduce((acc, m) => {
      acc[m] = 0;
      return acc;
    }, {} as Record<string, number>);

    realisasis.forEach(r => {
      if (selectedSubKeg && r.kode_sub_kegiatan !== selectedSubKeg) {
        return;
      }
      if (selectedUraianFilter && r.uraian_belanja !== selectedUraianFilter) {
        return;
      }
      if (recaps[r.bulan] !== undefined) {
        recaps[r.bulan] += r.nominal_realisasi;
      }
    });

    return recaps;
  }, [realisasis, selectedSubKeg, selectedUraianFilter]);

  // Compute total sum of matched/filtered realisasis
  const totalBelanjaFiltered = useMemo(() => {
    let sum = 0;
    realisasis.forEach(r => {
      if (selectedSubKeg && r.kode_sub_kegiatan !== selectedSubKeg) {
        return;
      }
      if (selectedUraianFilter && r.uraian_belanja !== selectedUraianFilter) {
        return;
      }
      sum += r.nominal_realisasi;
    });
    return sum;
  }, [realisasis, selectedSubKeg, selectedUraianFilter]);

  // Get unique list of inputted descriptions (uraian_belanja) for filtering
  const uniqueUraianList = useMemo(() => {
    const list = realisasis
      .filter(r => r && r.uraian_belanja)
      .filter(r => !selectedSubKeg || r.kode_sub_kegiatan === selectedSubKeg)
      .map(r => r.uraian_belanja)
      .filter((val, index, self) => val && self.indexOf(val) === index);
    return list;
  }, [realisasis, selectedSubKeg]);

  // Compute selected Sub-Kegiatan Pagu and remaining sisa for dynamic warning alert guards
  const activeSubStatus = useMemo(() => {
    if (!formSubKeg) return null;
    const s = subKegiatans.find(sk => sk.kode_sub_kegiatan === formSubKeg);
    if (!s) return null;
    return {
      pagu: s.pagu,
      realisasi_lama: s.realisasi,
      sisa_tersedia: Math.max(0, s.pagu - s.realisasi)
    };
  }, [formSubKeg, subKegiatans]);

  // Find RKA list for chosen sub-kegiatan
  const matchingRkasForSub = useMemo(() => {
    if (!formSubKeg) return [];
    return rkaList.filter(r => r.kode_sub_kegiatan === formSubKeg);
  }, [formSubKeg, rkaList]);

  // Find currently selected RKA item to display its pagu and sisa
  const selectedRkaItem = useMemo(() => {
    if (!formSubKeg || !formUraian) return null;
    return rkaList.find(r => r.kode_sub_kegiatan === formSubKeg && r.uraian_belanja === formUraian);
  }, [formSubKeg, formUraian, rkaList]);

  const rkaSpecificBudgetStatus = useMemo(() => {
    if (!selectedRkaItem) return null;
    const itemRealisasis = realisasis.filter(r => r.kode_sub_kegiatan === formSubKeg && r.uraian_belanja === selectedRkaItem.uraian_belanja && r.id !== editItem?.id);
    const spent = itemRealisasis.reduce((sum, r) => sum + r.nominal_realisasi, 0);
    const sisa = Math.max(0, selectedRkaItem.jumlah - spent);
    return {
      pagu: selectedRkaItem.jumlah,
      realisasi_lama: spent,
      sisa_tersedia: sisa
    };
  }, [selectedRkaItem, realisasis, formSubKeg, editItem]);

  // Handle Form open dialogs
  const openAddModal = () => {
    setEditItem(null);
    setFormTanggal(new Date().toISOString().substring(0, 10));
    setFormBulan(monthsList[new Date().getMonth()]);
    setFormSubKeg('');
    setFormUraian('');
    setFormUraianIsManual(false);
    setManualUraianVal('');
    setFormNominal(0);
    setFormKeterangan('');
    setFormBuktiBase64('');
    setFormBuktiFileName('');
    setShowForm(true);
  };

  const openEditModal = (item: Realisasi) => {
    setEditItem(item);
    setFormTanggal(item.tanggal);
    setFormBulan(item.bulan);
    setFormSubKeg(item.kode_sub_kegiatan);
    setFormUraian(item.uraian_belanja);
    const belongsToRka = item.uraian_belanja && rkaList.some(r => r.kode_sub_kegiatan === item.kode_sub_kegiatan && r.uraian_belanja === item.uraian_belanja);
    setFormUraianIsManual(!belongsToRka);
    setManualUraianVal(!belongsToRka ? item.uraian_belanja : '');
    setFormNominal(item.nominal_realisasi);
    setFormKeterangan(item.keterangan || '');
    setFormBuktiBase64(item.bukti_transaksi || '');
    setFormBuktiFileName(item.bukti_transaksi ? 'Unduh_Bukti_Fisik_SPD.png' : '');
    setShowForm(true);
  };

  // Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubKeg || !formUraian.trim() || formNominal <= 0) {
      alert("Harap lengkapi semua field wajib dan nominal harus lebih besar dari Nol!");
      return;
    }

    const linkedSub = subKegiatans.find(s => s.kode_sub_kegiatan === formSubKeg);
    if (!linkedSub) {
      alert("Kode Sub-Kegiatan tidak valid!");
      return;
    }

    // Budget check guard based on RKA specific sisa
    const maxAvailableSpecific = rkaSpecificBudgetStatus ? rkaSpecificBudgetStatus.sisa_tersedia + (editItem ? editItem.nominal_realisasi : 0) : 9999999999;
    if (rkaSpecificBudgetStatus && formNominal > maxAvailableSpecific) {
      const proceed = window.confirm(`Peringatan Defisit Uraian RKA: Nominal pengeluaran ${formatRupiah(formNominal)} melebihi kuota Sisa Anggaran khusus untuk rincian belanja terpilih (${formatRupiah(maxAvailableSpecific)}). Apakah Anda yakin ingin tetap memproses transaksi ini?`);
      if (!proceed) return;
    }

    // Budget check guard to notify but let user decide
    const maxAvailable = activeSubStatus ? activeSubStatus.sisa_tersedia + (editItem ? editItem.nominal_realisasi : 0) : 0;
    if (formNominal > maxAvailable) {
      const proceed = window.confirm(`Peringatan Defisit DPA: Nominal pengeluaran ${formatRupiah(formNominal)} melebihi kuota Sisa Anggaran total sub-kegiatan tersedia (${formatRupiah(maxAvailable)}). Apakah Anda yakin ingin memproses ini?`);
      if (!proceed) return;
    }

    setIsSaving(true);
    try {
      let cloudinaryUrl = formBuktiBase64;
      let cloudinaryPublicId = editItem?.bukti_transaksi_public_id || '';

      // If a new base64 file is uploaded
      if (formBuktiBase64 && formBuktiBase64.startsWith('data:')) {
        // If there is an old photo on Cloudinary, delete it first
        if (editItem?.bukti_transaksi_public_id) {
          try {
            await deleteFile(editItem.bukti_transaksi_public_id);
          } catch (cloudinaryErr) {
            console.warn("Sedang menghapus, Gagal menghapus asset Cloudinary lama:", cloudinaryErr);
          }
        }

        // Upload the new image to Cloudinary
        const uploadRes = await uploadFile(formBuktiBase64, "sirekap");
        cloudinaryUrl = uploadRes.secure_url;
        cloudinaryPublicId = uploadRes.public_id;
      } else if (!formBuktiBase64) {
        // If the user removed the image completely
        if (editItem?.bukti_transaksi_public_id) {
          try {
            await deleteFile(editItem.bukti_transaksi_public_id);
          } catch (cloudinaryErr) {
            console.warn("Gagal menghapus asset Cloudinary lama:", cloudinaryErr);
          }
        }
        cloudinaryUrl = '';
        cloudinaryPublicId = '';
      }

      const docId = editItem ? editItem.id : `realisasi_${Date.now()}`;
      
      const computedPersentaseOfSub = linkedSub.pagu > 0 ? (formNominal / linkedSub.pagu) * 100 : 0;
      const computedSisaValue = Math.max(0, maxAvailable - formNominal);

      const payload: Realisasi = {
        id: docId,
        tanggal: formTanggal,
        bulan: formBulan,
        kode_program: linkedSub.kode_program,
        kode_kegiatan: linkedSub.kode_kegiatan,
        kode_sub_kegiatan: formSubKeg,
        uraian_belanja: formUraian.trim(),
        nominal_realisasi: formNominal,
        persentase_realisasi: parseFloat(computedPersentaseOfSub.toFixed(2)),
        sisa_anggaran: computedSisaValue,
        keterangan: formKeterangan.trim(),
        bukti_transaksi: cloudinaryUrl || undefined,
        bukti_transaksi_public_id: cloudinaryPublicId || undefined
      };

      await setDoc(doc(db, COLL_REALISASI, docId), payload).catch(err => handleFirestoreError(err, OperationType.WRITE, `${COLL_REALISASI}/${docId}`));

      // Audit trail
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        editItem ? "UPDATE REALISASI KEUANGAN" : "TAMBAH REALISASI KEUANGAN",
        "REALISASI_KEUANGAN",
        editItem,
        payload
      );

      // Trigger structural budgets calculations
      await synchronizeCalculations();

      alert(`[NOTIFIKASI DATA BERUBAH]\nBerhasil menyimpan realisasi belanja: "${payload.uraian_belanja}" senilai ${formatRupiah(payload.nominal_realisasi)}. Log audit telah dicatat.`);

      setShowForm(false);
      setEditItem(null);
    } catch (err) {
      alert("Gagal memproses realisasi: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Realisasi
  const handleDelete = async (item: Realisasi) => {
    const isConfirmed = window.confirm(`Hapus pencatatan realisasi "${item.uraian_belanja}" senilai ${formatRupiah(item.nominal_realisasi)}?`);
    if (!isConfirmed) return;

    try {
      // Clean up Cloudinary asset
      if (item.bukti_transaksi_public_id) {
        try {
          await deleteFile(item.bukti_transaksi_public_id);
          console.log(`Berhasil menghapus bukti transaksi dari Cloudinary: ${item.bukti_transaksi_public_id}`);
        } catch (cloudinaryErr) {
          console.warn("Gagal menghapus bukti dari Cloudinary:", cloudinaryErr);
        }
      }

      await deleteDoc(doc(db, COLL_REALISASI, item.id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `${COLL_REALISASI}/${item.id}`));
      
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        "HAPUS REALISASI KEUANGAN",
        "REALISASI_KEUANGAN",
        item,
        null
      );

      // Re-calculate structural cascades
      await synchronizeCalculations();

      alert(`[NOTIFIKASI DATA BERUBAH]\nBerhasil menghapus pencatatan realisasi "${item.uraian_belanja}" dari basis data & Cloudinary. Anggaran dikoordinasikan ulang.`);
    } catch (err) {
      alert("Gagal menghapus realisasi: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleExportRealisasi = () => {
    const exportHeaders = ['id', 'tanggal', 'bulan', 'kode_program', 'kode_kegiatan', 'kode_sub_kegiatan', 'uraian_belanja', 'nominal_realisasi', 'persentase_realisasi', 'sisa_anggaran', 'keterangan'];
    exportToCSV(filteredRealisasis, exportHeaders, 'Laporan_Realisasi_Belanja_Pertanahan_2026');
  };

  return (
    <div className="space-y-6" id="realisasi-module-root">
      
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="real-title-card">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 font-display">
            <TrendingUp className="text-[#1e3a8a]" size={20} />
            Realisasi Penyerapan Keuangan Sektor Lahan
          </h2>
          <p className="text-xs text-slate-500 mt-1">Sistem pencatatan realisasi Surat Perintah Pencairan Dana (SP2D), bukti kuitansi lapangan, dan sisa kas.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button 
            onClick={handleExportRealisasi}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition cursor-pointer"
          >
            <Download size={14} />
            Ekspor CSV
          </button>
          {canEdit && (
            <button 
              onClick={openAddModal}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1e40af] hover:bg-[#1e3a8a] rounded-lg shadow-sm transition cursor-pointer"
              id="btn-add-realisasi"
            >
              <Plus size={15} />
              Input Realisasi SP2D
            </button>
          )}
        </div>
      </div>

      {/* Monthly Recap Row Widget */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4" id="recap-monthly-row">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Receipt size={15} className="text-[#10409F]" />
              Rekap Belanja Kas Bulanan TA 2026
            </h4>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {selectedSubKeg || selectedUraianFilter 
                ? "Menampilkan rekapitulasi realisasi belanja kas yang disaring khusus." 
                : "Menampilkan akumulasi seluruh realisasi belanja kas bulanan."}
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2 items-center">
            {/* Filter status indicator badges */}
            {(selectedSubKeg || selectedUraianFilter) && (
              <div className="flex flex-wrap items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/50">
                <span className="text-[9px] text-[#1e3a8a] font-black uppercase tracking-wider">Aktif Saringan:</span>
                {selectedSubKeg && (
                  <span className="text-[10px] bg-white font-mono font-bold text-blue-900 border px-1.5 py-0.5 rounded shadow-xs">
                    Sub-Keg: {selectedSubKeg}
                  </span>
                )}
                {selectedUraianFilter && (
                  <span className="text-[10px] bg-white text-orange-950 font-bold border border-orange-200 px-1.5 py-0.5 rounded shadow-xs" title={selectedUraianFilter}>
                    Uraian: {selectedUraianFilter.substring(0, 18)}...
                  </span>
                )}
                <button 
                  onClick={() => {
                    setSelectedSubKeg('');
                    setSelectedUraianFilter('');
                  }}
                  className="text-[9px] hover:text-red-700 text-red-500 font-extrabold ml-1.5 hover:underline cursor-pointer"
                >
                  Bersihkan
                </button>
              </div>
            )}
            
            {/* SUM / TOTAL OF THE SUB-KEGIATAN EXPENSES */}
            <div className="bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 text-right">
              <span className="text-[9px] text-slate-500 uppercase font-black block leading-none">Jumlah Belanja Sub Kegiatan</span>
              <span className="text-xs font-mono font-black text-emerald-900 mt-1 inline-block">{formatRupiah(totalBelanjaFiltered)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2" id="grid recaps box">
          {monthsList.map((m, i) => {
            const amount = rekapBulanan[m];
            return (
              <div key={i} className={`p-2.5 rounded-lg border text-center transition ${amount > 0 ? 'bg-emerald-50 border-emerald-250 text-emerald-950' : 'bg-slate-50/50 border-slate-100'}`}>
                <p className="text-[10px] text-slate-500 font-semibold tracking-wide uppercase">{m.substring(0,3)}</p>
                <p className="text-xs font-black mt-1 pl-0.5 truncate" title={formatRupiah(amount)}>
                  {amount > 0 ? formatRupiah(amount).replace('Rp', '') : '-'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sorters and search filters */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 text-xs" id="real-filters">
        <div className="flex flex-wrap gap-2.5">
          <div>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="p-2 border border-slate-200 bg-white rounded-lg outline-blue-600">
              <option value="">Semua Bulan</option>
              {monthsList.map((m, idx) => (
                <option key={idx} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <select value={selectedSubKeg} onChange={(e) => { setSelectedSubKeg(e.target.value); setSelectedUraianFilter(''); }} className="p-2 border border-slate-200 bg-white rounded-lg max-w-xs outline-blue-600 font-medium text-slate-800">
              <option value="">Semua Sub-Kegiatan</option>
              {subKegiatans.map((s, idx) => (
                <option key={idx} value={s.kode_sub_kegiatan}>{s.kode_sub_kegiatan} - {(s.nama_sub_kegiatan || '').substring(0, 30)}...</option>
              ))}
            </select>
          </div>
          <div>
            <select value={selectedUraianFilter} onChange={(e) => setSelectedUraianFilter(e.target.value)} className="p-2 border border-slate-200 bg-white rounded-lg max-w-xs outline-blue-600 font-medium text-slate-800 focus:border-blue-600" title="Saring berdasarkan uraian/rincian detail belanja">
              <option value="">Semua Uraian Detail Belanja</option>
              {uniqueUraianList.map((ur, idx) => (
                <option key={idx} value={ur}>{ur}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative max-w-xs w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text" 
            placeholder="Cari uraian transaksi..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full p-2 pl-8 border border-slate-200 rounded-lg focus:outline-blue-600 focus:ring-1 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Main Table view */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="real-table-panel">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
                <th className="p-3.5 pl-4 w-32">Tanggal / Bulan</th>
                <th className="p-3.5 w-40">Sub Kegiatan</th>
                <th className="p-3.5">Uraian / Keterangan</th>
                <th className="p-3.5 text-right w-36">Pagu Anggaran</th>
                <th className="p-3.5 text-right w-36">Nominal Realisasi</th>
                <th className="p-3.5 text-right w-36">Sisa Anggaran</th>
                <th className="p-3.5 text-center w-28">Persen Serapan</th>
                <th className="p-3.5 text-center w-28">Lampiran / Bukti</th>
                {canEdit && <th className="p-3.5 text-center w-24">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRealisasis.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 font-semibold">Tabel realisasi kosong / Atur saringan filter.</td>
                </tr>
              ) : (
                filteredRealisasis.map((r, i) => {
                  const subKeg = subKegiatans.find(s => s.kode_sub_kegiatan === r.kode_sub_kegiatan);
                  const matchedRka = rkaList.find(item => item.kode_sub_kegiatan === r.kode_sub_kegiatan && item.uraian_belanja === r.uraian_belanja);
                  const paguAmt = matchedRka ? matchedRka.jumlah : (subKeg ? subKeg.pagu : 0);
                  
                  // Calculate precise remaining sisa for this specific detail RKA item based on matching realisasis
                  const rkaRealisasis = realisasis.filter(real => real.kode_sub_kegiatan === r.kode_sub_kegiatan && real.uraian_belanja === r.uraian_belanja);
                  const spentOnThisRka = rkaRealisasis.reduce((sum, item) => sum + item.nominal_realisasi, 0);
                  const sisaAmt = matchedRka ? Math.max(0, matchedRka.jumlah - spentOnThisRka) : (subKeg ? subKeg.sisa : r.sisa_anggaran);

                  // Calculate absorption percentage against specific detail RKA pagu
                  const matchPercent = paguAmt > 0 ? parseFloat(((r.nominal_realisasi / paguAmt) * 100).toFixed(2)) : r.persentase_realisasi;

                  return (
                    <tr key={i} className="hover:bg-slate-50/50 transition antialiased">
                      <td className="p-3.5 pl-4">
                        <p className="font-bold text-slate-900 flex items-center gap-1 font-mono text-[11px]"><Calendar size={12} className="text-blue-800" />{r.tanggal}</p>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">{r.bulan}</span>
                      </td>
                      <td className="p-3.5 font-mono text-[11px] font-bold text-slate-900" title={r.kode_sub_kegiatan}>{r.kode_sub_kegiatan}</td>
                      <td className="p-3.5">
                        <button 
                          onClick={() => setSelectedUraianFilter(r.uraian_belanja)}
                          className={`hover:underline text-left cursor-pointer transition font-bold block text-wrap ${selectedUraianFilter === r.uraian_belanja ? 'text-orange-600 font-black decoration-orange-605' : 'text-slate-950 hover:text-blue-800'}`}
                          title="Klik untuk menyaring khusus uraian/keterangan ini pada rekap kas bulanan"
                        >
                          {r.uraian_belanja} {matchedRka && <span className="text-[9px] bg-blue-50 text-blue-800 border border-blue-200 px-1 py-0.5 rounded ml-1 tracking-wider uppercase font-extrabold">E-RKA Detail</span>}
                        </button>
                        <span className="text-[10px] text-slate-600 italic block mt-0.5" title={r.keterangan}>{r.keterangan || 'Tidak ada kuintor SPJ adendum.'}</span>
                      </td>
                      <td className="p-3.5 text-right font-black text-slate-900 font-mono">{formatRupiah(paguAmt)}</td>
                      <td className="p-3.5 text-right font-black text-rose-950 font-mono">{formatRupiah(r.nominal_realisasi)}</td>
                      <td className="p-3.5 text-right font-black text-indigo-900 font-mono">{formatRupiah(sisaAmt)}</td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${matchPercent >= 100 ? 'bg-emerald-100 text-emerald-900' : 'bg-blue-100 text-blue-900'}`}>{matchPercent}%</span>
                      </td>
                      <td className="p-3.5 text-center">
                        {r.bukti_transaksi ? (
                          <a 
                            href={r.bukti_transaksi} 
                            download={`sp2d_${r.id}.png`}
                            className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 hover:bg-emerald-100 transition whitespace-nowrap"
                          >
                            <Receipt size={11} />
                            Unduh Bukti
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">Bebas SPJ</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => openEditModal(r)} className="p-1.5 hover:bg-amber-100 text-amber-700 rounded transition" title="Edit"><Edit2 size={13} /></button>
                            <button onClick={() => handleDelete(r)} className="p-1.5 hover:bg-red-100 text-red-700 rounded transition" title="Hapus"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Form Dialog */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="real-form-overlay">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden" id="real-form-modal">
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-1.5 text-sm">
                <Receipt size={16} />
                {editItem ? 'Edit Input Realisasi Belanja' : 'Input Realisasi SP2D Keuangan'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-white hover:text-white/80 font-bold text-lg">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs max-h-[78vh] overflow-y-auto">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Tanggal Realisasi *</label>
                  <input 
                    type="date"
                    value={formTanggal}
                    onChange={(e) => handleDateChange(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Bulan Alokasi</label>
                  <input 
                    type="text"
                    value={formBulan}
                    disabled
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-800 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Pilih Sub-Kegiatan *</label>
                <select
                  value={formSubKeg}
                  onChange={(e) => setFormSubKeg(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 focus:border-blue-600"
                >
                  <option value="">-- Pilih Sub-Kegiatan --</option>
                  {subKegiatans.map((s, idx) => (
                    <option key={idx} value={s.kode_sub_kegiatan}>{s.kode_sub_kegiatan} - {(s.nama_sub_kegiatan || '').substring(0,35)}...</option>
                  ))}
                </select>
              </div>

              {/* Dynamic Warning alerts when budget is low */}
              {(activeSubStatus || rkaSpecificBudgetStatus) && (
                <div className="space-y-2">
                  {rkaSpecificBudgetStatus && (
                    <div className={`p-3 rounded-lg border text-[11px] ${rkaSpecificBudgetStatus.sisa_tersedia < formNominal ? 'bg-amber-50 border-amber-200 text-amber-900 border-dashed animate-pulse' : 'bg-orange-50/50 border-orange-100 text-slate-800'}`}>
                      <p className="font-extrabold flex items-center gap-1 text-orange-950 uppercase tracking-wider text-[9px]">
                        <ShieldCheck size={13} className="text-orange-600 animate-bounce" />
                        Pagu & Sisa Uraian Belanja Terpilih (E-RKA):
                      </p>
                      <ul className="list-inside mt-1.5 pl-0.5 space-y-1 font-sans">
                        <li>Pagu RKA Detail: <b>{formatRupiah(rkaSpecificBudgetStatus.pagu)}</b></li>
                        <li>Sisa Anggaran Uraian Ini: <b className={`font-mono ${rkaSpecificBudgetStatus.sisa_tersedia < formNominal ? 'text-rose-700 bg-rose-50 px-1 rounded font-black' : 'text-blue-900 font-black'}`}>{formatRupiah(rkaSpecificBudgetStatus.sisa_tersedia)}</b></li>
                      </ul>
                      {rkaSpecificBudgetStatus.sisa_tersedia < formNominal && (
                        <p className="mt-1 pb-0.5 font-black text-rose-700 text-[10px] flex items-center gap-1">
                          <AlertTriangle size={12} />
                          Atensi SP2D: Pengeluaran melebihi sisa pagu uraian detail RKA ini!
                        </p>
                      )}
                    </div>
                  )}

                  {activeSubStatus && (
                    <div className={`p-3 rounded-lg border text-[11px] ${activeSubStatus.sisa_tersedia < formNominal ? 'bg-red-50 border-red-150 text-red-900' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                      <p className="font-bold flex items-center gap-1 text-[10px]">
                        <DollarSign size={13} />
                        Status Kas Total Sub-Kegiatan:
                      </p>
                      <ul className="list-inside mt-1 pl-0.5 space-y-0.5 font-sans">
                        <li>Total Alokasi Sub DPA: <b>{formatRupiah(activeSubStatus.pagu)}</b></li>
                        <li>Sisa Kas Sub-Kegiatan: <b className={`${activeSubStatus.sisa_tersedia < formNominal ? 'text-rose-700 font-extrabold' : 'text-slate-900 font-mono'}`}>{formatRupiah(activeSubStatus.sisa_tersedia)}</b></li>
                      </ul>
                      {activeSubStatus.sisa_tersedia < formNominal && (
                        <p className="mt-1 font-extrabold text-rose-750 text-[9px] flex items-center gap-1">
                          <AlertTriangle size={12} />
                          Defisit: Nominal input melebihi Plafon Sub DPA!
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">Uraian / Rincian Belanja (Dari E-RKA) *</label>
                {matchingRkasForSub.length > 0 ? (
                  <div>
                    <select
                      value={formUraianIsManual ? 'kustom_manual' : formUraian}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'kustom_manual') {
                          setFormUraianIsManual(true);
                          setFormUraian(manualUraianVal);
                        } else {
                          setFormUraianIsManual(false);
                          setFormUraian(val);
                          // Auto-suggest nominal to remaining specific budget sisa!
                          const matched = matchingRkasForSub.find(r => r.uraian_belanja === val);
                          if (matched) {
                            const itemRealisasis = realisasis.filter(r => r.kode_sub_kegiatan === formSubKeg && r.uraian_belanja === matched.uraian_belanja && r.id !== editItem?.id);
                            const spent = itemRealisasis.reduce((sum, r) => sum + r.nominal_realisasi, 0);
                            const sisaVal = Math.max(0, matched.jumlah - spent);
                            setFormNominal(sisaVal > 0 ? sisaVal : matched.jumlah);
                          }
                        }
                      }}
                      required
                      className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 focus:border-blue-600 font-medium text-slate-800"
                    >
                      <option value="">-- Pilih Uraian Rincian Belanja E-RKA --</option>
                      {matchingRkasForSub.map((r, idx) => (
                        <option key={idx} value={r.uraian_belanja}>
                          {r.uraian_belanja} (Pagu: {formatRupiah(r.jumlah)})
                        </option>
                      ))}
                      <option value="kustom_manual">-- Masukkan Manual --</option>
                    </select>

                    {(formUraianIsManual) && (
                      <div className="mt-2.5 animate-fade-in">
                        <label className="block text-[10px] text-slate-500 font-bold mb-1">Input Uraian Manual Tambahan *</label>
                        <input 
                          type="text"
                          placeholder="Masukkan rincian kegiatan baru..."
                          value={manualUraianVal}
                          onChange={(e) => {
                            setManualUraianVal(e.target.value);
                            setFormUraian(e.target.value);
                          }}
                          required
                          className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <input 
                      type="text"
                      placeholder="Masukkan manual (Tidak ada E-RKA detail untuk sub-kegiatan ini)..."
                      value={formUraian}
                      onChange={(e) => {
                        setFormUraian(e.target.value);
                        setManualUraianVal(e.target.value);
                        setFormUraianIsManual(true);
                      }}
                      required
                      className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600"
                    />
                    <p className="text-[10px] text-slate-500 mt-1 italic">Sub-kegiatan ini belum memiliki detail uraian belanja di E-RKA. Sisa anggaran akan dihitung di tingkat Sub-Kegiatan.</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Nominal Belanja Realisasi (Rp) *</label>
                <input 
                  type="number"
                  placeholder="Masukkan nominal..."
                  value={formNominal}
                  onChange={(e) => setFormNominal(Number(e.target.value))}
                  min={1}
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 font-bold text-indigo-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Catatan SPJ Tambahan</label>
                <textarea 
                  placeholder="Ketik rincian pendukung..."
                  value={formKeterangan}
                  onChange={(e) => setFormKeterangan(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-blue-600"
                />
              </div>

               {/* Upload Proof / Lampiran (SP2D Receipt) */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Lampirkan Bukti SP2D / Kwitansi (*Hanya Foto saja)</label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative overflow-hidden bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 flex items-center gap-2">
                    <Camera size={14} className="text-slate-500" />
                    <span>Upload Berkas Fisik</span>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleProofUpload}
                      disabled={isSaving}
                      className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 truncate max-w-[200px]" title={formBuktiFileName}>
                    {formBuktiFileName || 'Tidak ada file diunggah'}
                  </span>
                  {formBuktiFileName && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        setFormBuktiBase64('');
                        setFormBuktiFileName('');
                      }}
                      className="px-2.5 py-1 text-red-700 bg-red-50 hover:bg-red-100 hover:text-red-800 rounded text-[10px] font-bold border border-red-200 transition cursor-pointer disabled:opacity-55"
                      title="Klik untuk menghapus berkas yang telah diunggah ini"
                    >
                      Hapus Berkas
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-4 justify-end border-t border-slate-100" id="form-actions">
                <button type="button" disabled={isSaving} onClick={() => setShowForm(false)} className="px-4 py-2 font-semibold text-slate-700 border border-slate-200 rounded-lg disabled:opacity-50">Batal</button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-5 py-2 font-black text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Menyimpan...
                    </>
                  ) : (
                    "Simpan & Laporkan Audit"
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
