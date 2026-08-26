import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Eye, 
  Calendar, 
  Activity, 
  Camera, 
  Briefcase, 
  Download,
  AlertTriangle,
  ArrowUpRight,
  Search,
  ShieldCheck,
  Receipt,
  FileCheck2,
  TrendingUp,
  Layers
} from 'lucide-react';
import { BelanjaPihakKetiga, Program, Kegiatan, SubKegiatan, RKA, Realisasi, UserRole } from '../types';
import { formatRupiah, exportToCSV } from '../utils/helpers';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { COLL_BELANJA_PIHAK_KETIGA, createAuditLog } from '../dbService';
import { uploadFile, deleteFile } from '../cloudinaryService';

interface BelanjaPihakKetigaProps {
  pihakKetigas: BelanjaPihakKetiga[];
  realisasis: Realisasi[];
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  rkaList: RKA[];
  currentUserRole: UserRole;
  currentUserEmail: string;
  selectedYear: number;
}

export default function BelanjaPihakKetigaView({
  pihakKetigas,
  realisasis = [],
  programs,
  kegiatans,
  subKegiatans,
  rkaList,
  currentUserRole,
  currentUserEmail,
  selectedYear
}: BelanjaPihakKetigaProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubKeg, setSelectedSubKeg] = useState('');

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<BelanjaPihakKetiga | null>(null);
  const [selectedItem, setSelectedItem] = useState<BelanjaPihakKetiga | null>(null);

  // Form Fields
  const [formTanggal, setFormTanggal] = useState<string>(new Date().toISOString().substring(0, 10));
  const [formSubKeg, setFormSubKeg] = useState<string>('');
  const [formDetailBelanja, setFormDetailBelanja] = useState<string>('');
  const [formNamaPelaksana, setFormNamaPelaksana] = useState<string>('');
  const [formNomorKontrak, setFormNomorKontrak] = useState<string>('');
  const [formMasaKerjaMulai, setFormMasaKerjaMulai] = useState<string>('');
  const [formMasaKerjaSelesai, setFormMasaKerjaSelesai] = useState<string>('');
  const [formRealisasi, setFormRealisasi] = useState<number>(0);
  const [formCatatan, setFormCatatan] = useState<string>('');
  const [formFotoFile, setFormFotoFile] = useState<File | null>(null);
  const [existingFotoUrl, setExistingFotoUrl] = useState<string>('');
  const [formFotoFileName, setFormFotoFileName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const canEdit = currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.OPERATOR;

  // Status options
  const statusOptions = ['Aktif', 'Akan Berakhir', 'Selesai', 'Belum Mulai'];
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  // Helper to match and get SP2D realisasis for a specific Pihak Ketiga item
  const getMatchedSp2dList = (m: { kode_sub_kegiatan: string; uraian_belanja?: string }) => {
    return realisasis.filter(r => {
      if (r.kode_sub_kegiatan !== m.kode_sub_kegiatan) return false;
      if (m.uraian_belanja && r.uraian_belanja) {
        const u1 = m.uraian_belanja.trim().toLowerCase();
        const u2 = r.uraian_belanja.trim().toLowerCase();
        return u1 === u2 || u1.includes(u2) || u2.includes(u1);
      }
      return true;
    });
  };

  // Helper to calculate realization amount from SP2D data
  const getItemRealisasi = (m: BelanjaPihakKetiga) => {
    const list = getMatchedSp2dList(m);
    const sumSp2d = list.reduce((acc, r) => acc + (Number(r.nominal_realisasi) || 0), 0);
    return sumSp2d > 0 ? sumSp2d : (Number(m.realisasi) || 0);
  };

  // Helper to calculate contract status
  const getContractStatus = (m: BelanjaPihakKetiga): string => {
    const now = new Date();
    const end = new Date(m.masa_kerja_selesai || '');
    const start = new Date(m.masa_kerja_mulai || '');
    if (!m.masa_kerja_mulai) return 'Belum Mulai';
    
    const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (now > end) return 'Selesai';
    if (diffDays <= 30 && diffDays >= 0) return 'Akan Berakhir';
    if (now >= start) return 'Aktif';
    return 'Belum Mulai';
  };

  // Search filter
  const filteredPihakKetigas = useMemo(() => {
    return pihakKetigas.filter(m => {
      const matchSearch = String(m.kode_sub_kegiatan).toLowerCase().includes(searchTerm.toLowerCase()) ||
                          String(m.uraian_belanja || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          String(m.nama_pelaksana || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          String(m.nomor_kontrak || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          String(m.catatan || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchSub = selectedSubKeg === '' || m.kode_sub_kegiatan === selectedSubKeg;
      const matchStatus = selectedStatus === '' || getContractStatus(m) === selectedStatus;
      return matchSearch && matchSub && matchStatus;
    });
  }, [pihakKetigas, searchTerm, selectedSubKeg, selectedStatus]);

  // Overall Statistics for Pihak Ketiga
  const totalStats = useMemo(() => {
    let totalPagu = 0;
    let totalReal = 0;

    const matchedRkaKeys = new Set<string>();
    filteredPihakKetigas.forEach(m => {
      const rkaMatch = rkaList.find(r => 
        (r.kode_sub_kegiatan === m.kode_sub_kegiatan && r.uraian_belanja === m.uraian_belanja) ||
        (m.uraian_belanja && r.uraian_belanja === m.uraian_belanja)
      );
      if (rkaMatch) {
        const key = `${rkaMatch.kode_sub_kegiatan}_${rkaMatch.uraian_belanja}`;
        if (!matchedRkaKeys.has(key)) {
          matchedRkaKeys.add(key);
          totalPagu += (rkaMatch.jumlah || 0);
        }
      } else {
        const rkaSumForSub = rkaList
          .filter(r => r.kode_sub_kegiatan === m.kode_sub_kegiatan)
          .reduce((acc, curr) => acc + (curr.jumlah || 0), 0);
        if (rkaSumForSub > 0) {
          totalPagu += rkaSumForSub;
        } else {
          const linkedSub = subKegiatans.find(s => s.kode_sub_kegiatan === m.kode_sub_kegiatan);
          totalPagu += (linkedSub?.pagu || 0);
        }
      }

      totalReal += getItemRealisasi(m);
    });

    const totalSisa = Math.max(0, totalPagu - totalReal);
    const persentase = totalPagu > 0 ? (totalReal / totalPagu) * 100 : 0;

    return { totalPagu, totalReal, totalSisa, persentase };
  }, [filteredPihakKetigas, rkaList, subKegiatans, realisasis]);

  // Handle Foto upload
  const handleFotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("SIMPAN DITOLAK: Hanya berkas foto/gambar kegiatan lapangan (.png, .jpg, .jpeg) yang diperkenankan!");
      e.target.value = "";
      return;
    }

    setFormFotoFileName(file.name);
    setFormFotoFile(file);
  };

  // Open Form Dialogs
  const openAddModal = () => {
    setEditItem(null);
    setFormTanggal(new Date().toISOString().substring(0, 10));
    setFormSubKeg('');
    setFormDetailBelanja('');
    setFormNamaPelaksana('');
    setFormNomorKontrak('');
    setFormMasaKerjaMulai('');
    setFormMasaKerjaSelesai('');
    setFormRealisasi(0);
    setFormCatatan('');
    setFormFotoFile(null);
    setExistingFotoUrl('');
    setFormFotoFileName('');
    setShowForm(true);
  };

  const openEditModal = (item: BelanjaPihakKetiga) => {
    setEditItem(item);
    setFormTanggal(item.tanggal);
    setFormSubKeg(item.kode_sub_kegiatan);
    setFormDetailBelanja(item.uraian_belanja);
    setFormNamaPelaksana(item.nama_pelaksana);
    setFormNomorKontrak(item.nomor_kontrak);
    setFormMasaKerjaMulai(item.masa_kerja_mulai);
    setFormMasaKerjaSelesai(item.masa_kerja_selesai);
    
    // Automatically use SP2D realization if available
    const currentReal = getItemRealisasi(item);
    setFormRealisasi(currentReal);
    
    setFormCatatan(item.catatan || '');
    setFormFotoFile(null);
    setExistingFotoUrl(item.foto_kegiatan || '');
    setFormFotoFileName(item.foto_kegiatan ? 'Dokumentasi_Foto.png' : '');
    setShowForm(true);
  };

  // When sub-kegiatan or detail belanja changes in the form, automatically update calculated SP2D realization
  const autoFormSp2dRealisasi = useMemo(() => {
    if (!formSubKeg) return 0;
    const sp2ds = getMatchedSp2dList({ kode_sub_kegiatan: formSubKeg, uraian_belanja: formDetailBelanja });
    return sp2ds.reduce((sum, r) => sum + (Number(r.nominal_realisasi) || 0), 0);
  }, [formSubKeg, formDetailBelanja, realisasis]);

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const linkedSub = subKegiatans.find(s => s.kode_sub_kegiatan === formSubKeg);

    setIsSaving(true);
    try {
      let cloudinaryUrl = existingFotoUrl;
      let cloudinaryPublicId = editItem?.foto_kegiatan_public_id || '';

      // If a new physical file is selected
      if (formFotoFile) {
        // If there is an old photo on Cloudinary, delete it first
        if (editItem?.foto_kegiatan_public_id) {
          try {
            await deleteFile(editItem.foto_kegiatan_public_id);
          } catch (cloudinaryErr) {
            console.warn("Sedang menghapus, Gagal menghapus asset Cloudinary lama:", cloudinaryErr);
          }
        }

        // Upload the new image to Cloudinary
        const originalExtension = formFotoFile.name.split('.').pop() || 'png';
        const customFileName = `Foto_Belanja_${formSubKeg || 'pihak_ketiga'}_${Date.now()}.${originalExtension}`;
        const uploadRes = await uploadFile(formFotoFile, "sirekap_pihak_ketiga", customFileName);
        cloudinaryUrl = uploadRes.secure_url;
        cloudinaryPublicId = uploadRes.public_id;
      } else if (!existingFotoUrl && editItem?.foto_kegiatan_public_id) {
        // If the user removed the image completely
        try {
          await deleteFile(editItem.foto_kegiatan_public_id);
        } catch (cloudinaryErr) {
          console.warn("Gagal menghapus asset Cloudinary lama:", cloudinaryErr);
        }
        cloudinaryUrl = '';
        cloudinaryPublicId = '';
      }

      const docId = editItem ? editItem.id : `pihak_ketiga_${Date.now()}`;
      const payload: BelanjaPihakKetiga = {
        id: docId,
        tanggal: formTanggal || new Date().toISOString().substring(0, 10),
        tahun: editItem?.tahun || selectedYear,
        kode_program: linkedSub?.kode_program || editItem?.kode_program || '',
        kode_kegiatan: linkedSub?.kode_kegiatan || editItem?.kode_kegiatan || '',
        kode_sub_kegiatan: formSubKeg || '',
        uraian_belanja: formDetailBelanja ? formDetailBelanja.trim() : '',
        nama_pelaksana: formNamaPelaksana ? formNamaPelaksana.trim() : '',
        nomor_kontrak: formNomorKontrak ? formNomorKontrak.trim() : '',
        masa_kerja_mulai: formMasaKerjaMulai || '',
        masa_kerja_selesai: formMasaKerjaSelesai || '',
        realisasi: Number(formRealisasi) || 0,
        catatan: formCatatan ? formCatatan.trim() : '',
        foto_kegiatan: cloudinaryUrl || '',
        foto_kegiatan_public_id: cloudinaryPublicId || ''
      };

      await setDoc(doc(db, COLL_BELANJA_PIHAK_KETIGA, docId), payload).catch(err => handleFirestoreError(err, OperationType.WRITE, `${COLL_BELANJA_PIHAK_KETIGA}/${docId}`));

      // Handle audit logging
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        editItem ? "UPDATE BELANJA PIHAK KETIGA" : "TAMBAH BELANJA PIHAK KETIGA",
        "BELANJA_PIHAK_KETIGA",
        editItem,
        payload
      );

      alert(`[NOTIFIKASI DATA BERUBAH]\nBerhasil menyimpan belanja pihak ketiga untuk sub-kegiatan ${payload.kode_sub_kegiatan}. Log audit dicatat.`);

      setShowForm(false);
      setEditItem(null);
    } catch (err) {
      alert("Gagal memproses belanja pihak ketiga: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  // Handle row deletion
  const handleDelete = async (item: BelanjaPihakKetiga) => {
    const isConfirmed = window.confirm(`Hapus belanja pihak ketiga untuk Sub-Kegiatan: ${item.kode_sub_kegiatan}?`);
    if (!isConfirmed) return;

    try {
      // Clean up Cloudinary asset
      if (item.foto_kegiatan_public_id) {
        try {
          await deleteFile(item.foto_kegiatan_public_id);
          console.log(`Berhasil menghapus foto kegiatan dari Cloudinary: ${item.foto_kegiatan_public_id}`);
        } catch (cloudinaryErr) {
          console.warn("Gagal menghapus foto dari Cloudinary:", cloudinaryErr);
        }
      }

      await deleteDoc(doc(db, COLL_BELANJA_PIHAK_KETIGA, item.id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `${COLL_BELANJA_PIHAK_KETIGA}/${item.id}`));
      
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        "HAPUS BELANJA PIHAK KETIGA",
        "BELANJA_PIHAK_KETIGA",
        item,
        null
      );

      alert(`[NOTIFIKASI DATA BERUBAH]\nPencatatan belanja pihak ketiga sub-kegiatan ${item.kode_sub_kegiatan} berhasil dihapus.`);
    } catch (err) {
      alert("Gagal menghapus: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleExportCSV = () => {
    const exportHeaders = ['id', 'tanggal', 'kode_program', 'kode_kegiatan', 'kode_sub_kegiatan', 'uraian_belanja', 'nama_pelaksana', 'nomor_kontrak', 'realisasi', 'catatan'];
    exportToCSV(filteredPihakKetigas, exportHeaders, 'Laporan_Belanja_Pihak_Ketiga_2026');
  };

  return (
    <div className="space-y-6" id="monitoring-module-root">
      
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="mon-title-card">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 font-display">
            <Activity className="text-[#1e3a8a]" size={20} />
            Pelaksanaan Belanja Barang dan Jasa Pihak Ketiga
          </h2>
          <p className="text-xs text-slate-500 mt-1">Belanja jasa pihak ketiga untuk penyediaan tenaga pendukung teknis dan administratif guna menunjang pelaksanaan program dan kegiatan.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition cursor-pointer"
          >
            <Download size={14} />
            Ekspor CSV
          </button>
          {canEdit && (
            <button 
              onClick={openAddModal}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1e40af] hover:bg-[#1e3a8a] rounded-lg shadow-sm transition cursor-pointer"
              id="btn-add-monitoring"
            >
              <Plus size={15} />
              Input Belanja
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards for Pihak Ketiga */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5" id="mon-summary-cards">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Pagu Pihak Ketiga</span>
          <p className="text-base font-black text-blue-900 font-mono mt-1">{formatRupiah(totalStats.totalPagu)}</p>
          <span className="text-[10px] text-slate-400 font-medium">{filteredPihakKetigas.length} Kontrak / Belanja Terdata</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block flex items-center gap-1">
            <Receipt size={12} className="text-emerald-600" />
            Realisasi SP2D
          </span>
          <p className="text-base font-black text-emerald-600 font-mono mt-1">{formatRupiah(totalStats.totalReal)}</p>
          <span className="text-[10px] text-emerald-700 font-bold">{totalStats.persentase.toFixed(1)}% Dari Pagu PK</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider block">Sisa Anggaran PK</span>
          <p className="text-base font-black text-amber-600 font-mono mt-1">{formatRupiah(totalStats.totalSisa)}</p>
          <span className="text-[10px] text-slate-400 font-medium">Sisa Pagu Tersedia</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider block">Tingkat Penyerapan</span>
          <p className="text-base font-black text-indigo-600 font-mono mt-1">{totalStats.persentase.toFixed(1)}%</p>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1.5">
            <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${Math.min(totalStats.persentase, 100)}%` }}></div>
          </div>
        </div>
      </div>

      {/* Sorter / Filters */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 text-xs" id="mon-filter-box">
        <select value={selectedSubKeg} onChange={(e) => setSelectedSubKeg(e.target.value)} className="p-2 border border-slate-200 bg-white rounded-lg flex-1 max-w-sm focus:outline-blue-600">
          <option value="">Semua Sub-Kegiatan</option>
          {subKegiatans.map((s, idx) => (
            <option key={idx} value={s.kode_sub_kegiatan}>{s.kode_sub_kegiatan} - {s.nama_sub_kegiatan || ''}</option>
          ))}
        </select>

        <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="p-2 border border-slate-200 bg-white rounded-lg flex-1 max-w-[200px] focus:outline-blue-600">
          <option value="">Semua Status</option>
          {statusOptions.map((s, idx) => (
            <option key={idx} value={s}>{s}</option>
          ))}
        </select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text" 
            placeholder="Cari kontrak, uraian, pelaksana..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full p-2 pl-8 border border-slate-200 bg-white rounded-lg focus:outline-blue-600"
          />
        </div>
      </div>

      {/* Main Table / Cards Layout */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="mon-table-panel">
        <div className="grid grid-cols-1 divide-y divide-slate-100" id="mon-cards-container">
          {filteredPihakKetigas.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-semibold">Tabel belanja pihak ketiga kosong. Harap tambahkan data baru.</div>
          ) : (
            filteredPihakKetigas.map((m, i) => {
              const rkaMatch = rkaList.find(r => 
                (r.kode_sub_kegiatan === m.kode_sub_kegiatan && r.uraian_belanja === m.uraian_belanja) ||
                (m.uraian_belanja && r.uraian_belanja === m.uraian_belanja)
              );
              
              const rkaSumForSub = rkaList
                .filter(r => r.kode_sub_kegiatan === m.kode_sub_kegiatan)
                .reduce((acc, curr) => acc + (curr.jumlah || 0), 0);

              const linkedSub = subKegiatans.find(s => s.kode_sub_kegiatan === m.kode_sub_kegiatan);
              
              const paguRka = rkaMatch?.jumlah 
                ? rkaMatch.jumlah 
                : (rkaSumForSub > 0 ? rkaSumForSub : (linkedSub?.pagu || 0));

              // Realisasi SP2D
              const matchedSp2ds = getMatchedSp2dList(m);
              const realisasiVal = getItemRealisasi(m);
              const sisaPaguSub = Math.max(0, paguRka - realisasiVal);
              const persentaseSerapan = paguRka > 0 ? (realisasiVal / paguRka) * 100 : 0;

              return (
                <div key={m.id} className="p-5 flex flex-col md:flex-row gap-5 items-start hover:bg-slate-50/30 transition duration-150" id={`mon-row-${i}`}>
                  {/* Photo or Placeholder */}
                  <div className="w-full md:w-32 h-32 bg-slate-100 border rounded-lg hover:border-blue-500 transition overflow-hidden flex items-center justify-center flex-shrink-0 relative">
                    {m.foto_kegiatan ? (
                      <img src={m.foto_kegiatan} alt="Foto_Belanja" className="object-cover w-full h-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="text-center text-slate-400 p-2">
                        <Camera className="mx-auto mb-1 text-slate-400" size={24} />
                        <span className="text-[10px] font-semibold">Tanpa Foto</span>
                      </div>
                    )}
                  </div>

                  {/* Main description data */}
                  <div className="flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-slate-100 pb-2">
                      <div>
                        <span className="text-[10px] bg-indigo-100 text-indigo-900 font-black px-2 py-0.5 rounded-full font-mono">{m.kode_sub_kegiatan}</span>
                        <h4 className="font-bold text-slate-900 mt-1 text-xs">{subKegiatans.find(s => s.kode_sub_kegiatan === m.kode_sub_kegiatan)?.nama_sub_kegiatan || 'Sub Kegiatan Terdaftar'}</h4>
                      </div>
                      {(() => {
                        const status = getContractStatus(m);
                        const badgeMap: { [key: string]: string } = {
                          'Aktif': 'bg-green-100 text-green-800',
                          'Selesai': 'bg-slate-100 text-slate-600',
                          'Akan Berakhir': 'bg-amber-100 text-amber-800',
                          'Belum Mulai': 'bg-blue-100 text-blue-800'
                        };
                        return (
                          <span className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${badgeMap[status] || 'bg-slate-100'}`}>
                            {status === 'Akan Berakhir' && <AlertTriangle size={10} />}
                            {status}
                          </span>
                        );
                      })()}
                      <span className="font-mono text-[10px] text-slate-500 font-bold flex items-center gap-1"><Calendar size={12} /> {m.tanggal}</span>
                    </div>

                    {/* Belanja Info */}
                    <div className="space-y-1 text-xs">
                      <p className="font-bold text-slate-900">{m.uraian_belanja}</p>
                      <p className="text-slate-600">Pelaksana: <span className="font-semibold text-slate-800">{m.nama_pelaksana}</span></p>
                      <p className="text-slate-600">Kontrak: <span className="font-mono text-slate-800">{m.nomor_kontrak || '-'}</span></p>
                    </div>

                    {/* Metrics from RKA & SP2D Realisasi */}
                    <div className="flex flex-wrap gap-2 text-[10px]">
                      <div className="bg-blue-50/80 border border-blue-100 p-2 rounded-lg min-w-[120px]">
                        <p className="font-bold text-blue-900 uppercase">Pagu Rincian RKA</p>
                        <p className="font-mono font-extrabold text-blue-950 text-xs mt-0.5">{formatRupiah(paguRka)}</p>
                      </div>
                      <div className="bg-emerald-50/80 border border-emerald-100 p-2 rounded-lg min-w-[130px]">
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-bold text-emerald-900 uppercase">Realisasi SP2D</p>
                          <span className="text-[8px] bg-emerald-100 text-emerald-800 font-black px-1 rounded font-mono">
                            {matchedSp2ds.length > 0 ? `${matchedSp2ds.length} SP2D` : 'Auto'}
                          </span>
                        </div>
                        <p className="font-mono font-extrabold text-emerald-950 text-xs mt-0.5">{formatRupiah(realisasiVal)}</p>
                        <span className="text-[9px] text-emerald-700 font-bold">Serapan: {persentaseSerapan.toFixed(1)}%</span>
                      </div>
                      <div className="bg-amber-50/80 border border-amber-100 p-2 rounded-lg min-w-[120px]">
                        <p className="font-bold text-amber-900 uppercase">Sisa Pagu RKA</p>
                        <p className="font-mono font-extrabold text-amber-950 text-xs mt-0.5">{formatRupiah(sisaPaguSub)}</p>
                      </div>
                      <div className="bg-slate-100 border border-slate-200 p-2 rounded-lg flex-1 min-w-[140px]">
                        <p className="font-bold text-slate-600 uppercase">Masa Kerja</p>
                        <p className="font-mono text-slate-800 font-semibold mt-0.5">{m.masa_kerja_mulai || '-'} s/d {m.masa_kerja_selesai || '-'}</p>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-2 rounded border border-slate-100 text-xs">
                      <span className="font-bold text-slate-500 block">Catatan:</span>
                      <p className="italic text-slate-700">{m.catatan || '-'}</p>
                    </div>
                  </div>

                  {/* Crud Actions right aligned */}
                  <div className="flex md:flex-col items-center gap-1 text-center justify-end self-stretch md:border-l border-slate-100 md:pl-4">
                    <button onClick={() => setSelectedItem(m)} className="p-2 hover:bg-emerald-100 text-emerald-700 rounded-lg transition" title="Lihat Detail Transaksi">
                      <Eye size={14} />
                    </button>
                    {canEdit && (
                      <>
                        <button onClick={() => openEditModal(m)} className="p-2 hover:bg-amber-100 text-amber-700 rounded-lg transition" title="Edit"><Edit2 size={14} /></button>
                        <button onClick={() => handleDelete(m)} className="p-2 hover:bg-red-100 text-red-700 rounded-lg transition" title="Hapus"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Forms Overlay Dialog */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="mon-form-overlay">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden" id="mon-form-modal">
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-1.5 text-sm">
                <Activity size={16} />
                {editItem ? 'Edit Belanja Pihak Ketiga' : 'Tambah Belanja Pihak Ketiga'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-white hover:text-white/80 font-bold text-lg">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs max-h-[78vh] overflow-y-auto">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Tanggal</label>
                  <input 
                    type="date"
                    value={formTanggal}
                    onChange={(e) => setFormTanggal(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-blue-600 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Pilih Sub-Kegiatan</label>
                  <select
                    value={formSubKeg}
                    onChange={(e) => {
                      setFormSubKeg(e.target.value);
                      // Auto calculate SP2D realization
                      const sp2ds = getMatchedSp2dList({ kode_sub_kegiatan: e.target.value, uraian_belanja: formDetailBelanja });
                      const autoReal = sp2ds.reduce((sum, r) => sum + (Number(r.nominal_realisasi) || 0), 0);
                      if (autoReal > 0) setFormRealisasi(autoReal);
                    }}
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-blue-600 focus:border-blue-600"
                  >
                    <option value="">-- Pilih Sub-Kegiatan --</option>
                    {subKegiatans.map((s, idx) => (
                      <option key={idx} value={s.kode_sub_kegiatan}>{s.kode_sub_kegiatan} - {s.nama_sub_kegiatan || ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Detail Belanja (E-RKA)</label>
                <select
                  value={formDetailBelanja}
                  onChange={(e) => {
                    setFormDetailBelanja(e.target.value);
                    const sp2ds = getMatchedSp2dList({ kode_sub_kegiatan: formSubKeg, uraian_belanja: e.target.value });
                    const autoReal = sp2ds.reduce((sum, r) => sum + (Number(r.nominal_realisasi) || 0), 0);
                    if (autoReal > 0) setFormRealisasi(autoReal);
                  }}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-blue-600"
                >
                  <option value="">-- Pilih Detail Belanja E-RKA --</option>
                  {rkaList
                    .filter(r => !formSubKeg || r.kode_sub_kegiatan === formSubKeg)
                    .map((r, idx) => (
                      <option key={idx} value={r.uraian_belanja}>{r.uraian_belanja} - {formatRupiah(r.jumlah)}</option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Nama Pelaksana</label>
                  <input 
                    type="text"
                    value={formNamaPelaksana}
                    onChange={(e) => setFormNamaPelaksana(e.target.value)}
                    placeholder="Contoh: PT Swadaya / CV Maju"
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Nomor Kontrak</label>
                  <input 
                    type="text"
                    value={formNomorKontrak}
                    onChange={(e) => setFormNomorKontrak(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-blue-600"
                  />
                </div>
              </div>

               <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Masa Kerja Mulai</label>
                  <input 
                    type="date"
                    value={formMasaKerjaMulai}
                    onChange={(e) => setFormMasaKerjaMulai(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-blue-600 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Masa Kerja Selesai</label>
                  <input 
                    type="date"
                    value={formMasaKerjaSelesai}
                    onChange={(e) => setFormMasaKerjaSelesai(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-blue-600 font-mono text-[11px]"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-slate-700 font-bold">Nilai Realisasi (Rp)</label>
                  {autoFormSp2dRealisasi > 0 && (
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Tersinkron SP2D: {formatRupiah(autoFormSp2dRealisasi)}
                    </span>
                  )}
                </div>
                <input 
                  type="number"
                  value={formRealisasi}
                  onChange={(e) => setFormRealisasi(Number(e.target.value))}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-blue-600 font-bold text-blue-900"
                />
                <p className="text-[10px] text-slate-500 mt-1">Data realisasi otomatis disinkronkan dari menu Realisasi SP2D sesuai Sub-Kegiatan dan uraian belanja.</p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Catatan</label>
                <textarea 
                  value={formCatatan}
                  onChange={(e) => setFormCatatan(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-blue-600"
                />
              </div>

              {/* Photo Upload for photographic evidence */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Unggah Foto (*Hanya Foto saja)</label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative overflow-hidden bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 flex items-center gap-2">
                    <Camera size={14} className="text-slate-500" />
                    <span>Klik unggah foto</span>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleFotoUpload}
                      disabled={isSaving}
                      className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 truncate max-w-[200px]" title={formFotoFileName}>
                    {formFotoFileName || 'Tidak ada foto dikoordinasikan'}
                  </span>
                  {formFotoFileName && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        setFormFotoFile(null);
                        setExistingFotoUrl('');
                        setFormFotoFileName('');
                      }}
                      className="px-2.5 py-1 text-red-700 bg-red-50 hover:bg-red-100 hover:text-red-800 rounded text-[10px] font-bold border border-red-200 transition cursor-pointer disabled:opacity-55"
                      title="Klik untuk menghapus foto yang telah diunggah ini"
                    >
                      Hapus Foto
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
                    "Simpan Data"
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Detail Overlay Dialog with Connected SP2D Transactions */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="detail-overlay">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden" id="detail-modal">
            <div className="p-4 bg-slate-800 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-1.5 text-sm">
                <Eye size={16} />
                Detail Belanja Pihak Ketiga & Realisasi SP2D
              </h3>
              <button onClick={() => setSelectedItem(null)} className="text-white hover:text-white/80 font-bold text-lg">&times;</button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[78vh] overflow-y-auto">
              <div className="relative w-full h-48 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center">
                {selectedItem.foto_kegiatan ? (
                  <img src={selectedItem.foto_kegiatan} alt="Foto_Belanja" className="object-cover w-full h-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="text-center text-slate-400">
                    <Camera size={32} className="mx-auto mb-2" />
                    <span className="font-semibold">Tanpa Foto</span>
                  </div>
                )}
              </div>
              <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200/60">
                <p><span className="font-bold text-slate-500">Tanggal:</span> {selectedItem.tanggal}</p>
                <p><span className="font-bold text-slate-500">Sub-Kegiatan:</span> 
                  <span className="ml-1 bg-indigo-100 text-indigo-900 font-black px-2 py-0.5 rounded-full font-mono text-[10px]">
                    {selectedItem.kode_sub_kegiatan}
                  </span>
                </p>
                <p className="font-bold text-sm text-slate-900">{selectedItem.uraian_belanja}</p>
                <p><span className="font-bold text-slate-500">Pelaksana:</span> {selectedItem.nama_pelaksana}</p>
                <p><span className="font-bold text-slate-500">Nomor Kontrak:</span> {selectedItem.nomor_kontrak || '-'}</p>
                <p><span className="font-bold text-slate-500">Masa Kerja:</span> {selectedItem.masa_kerja_mulai || '-'} s/d {selectedItem.masa_kerja_selesai || '-'}</p>
                <p className="flex justify-between items-center border-t border-slate-200 pt-1.5">
                  <span className="font-bold text-slate-500">Total Realisasi SP2D:</span> 
                  <span className="font-bold text-emerald-800 text-sm font-mono">{formatRupiah(getItemRealisasi(selectedItem))}</span>
                </p>
                <p className="border-t border-slate-200 pt-1.5"><span className="font-bold text-slate-500">Catatan:</span><br/> {selectedItem.catatan || '-'}</p>
              </div>

              {/* Breakdown of SP2D Transactions for this contract/sub-kegiatan */}
              <div>
                <h4 className="font-bold text-slate-800 flex items-center gap-1.5 mb-2 text-xs">
                  <Receipt size={14} className="text-blue-700" />
                  Rincian Transaksi Realisasi SP2D Terhubung ({getMatchedSp2dList(selectedItem).length})
                </h4>
                {getMatchedSp2dList(selectedItem).length === 0 ? (
                  <p className="text-slate-500 italic bg-slate-50 p-3 rounded text-center">Belum ada data transaksi di input pada menu Realisasi SP2D untuk sub kegiatan ini.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-slate-100 font-bold text-slate-700">
                        <tr>
                          <th className="p-2 pl-3">Tanggal / Bulan</th>
                          <th className="p-2">Uraian / Keterangan</th>
                          <th className="p-2 pr-3 text-right">Nominal Realisasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {getMatchedSp2dList(selectedItem).map((r, idx) => (
                          <tr key={r.id || idx} className="hover:bg-slate-50">
                            <td className="p-2 pl-3 font-mono font-bold text-slate-800">
                              {r.tanggal}
                              <span className="block text-[9px] font-sans font-semibold text-slate-500">{r.bulan}</span>
                            </td>
                            <td className="p-2 text-slate-700">
                              <p className="font-semibold">{r.uraian_belanja}</p>
                              <span className="text-[10px] text-slate-500">{r.keterangan || '-'}</span>
                            </td>
                            <td className="p-2 pr-3 text-right font-mono font-bold text-emerald-800">
                              {formatRupiah(r.nominal_realisasi)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t text-right bg-slate-50">
              <button onClick={() => setSelectedItem(null)} className="px-4 py-2 font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100">Tutup</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
