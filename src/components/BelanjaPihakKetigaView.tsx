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
  ShieldCheck
} from 'lucide-react';
import { BelanjaPihakKetiga, Program, Kegiatan, SubKegiatan, RKA, UserRole } from '../types';
import { formatRupiah, exportToCSV } from '../utils/helpers';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { COLL_BELANJA_PIHAK_KETIGA, createAuditLog } from '../dbService';
import { uploadFile, deleteFile } from '../cloudinaryService';

interface BelanjaPihakKetigaProps {
  pihakKetigas: BelanjaPihakKetiga[];
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

  // Helper to calculate status
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
                          String(m.catatan || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchSub = selectedSubKeg === '' || m.kode_sub_kegiatan === selectedSubKeg;
      const matchStatus = selectedStatus === '' || getContractStatus(m) === selectedStatus;
      return matchSearch && matchSub && matchStatus;
    });
  }, [pihakKetigas, searchTerm, selectedSubKeg, selectedStatus]);

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
    setFormRealisasi(item.realisasi);
    setFormCatatan(item.catatan || '');
    setFormFotoFile(null);
    setExistingFotoUrl(item.foto_kegiatan || '');
    setFormFotoFileName(item.foto_kegiatan ? 'Dokumentasi_Foto.png' : '');
    setShowForm(true);
  };

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubKeg || !formDetailBelanja || !formNamaPelaksana || formRealisasi < 0) {
      alert("Harap lengkapi semua field bertanda *");
      return;
    }

    const linkedSub = subKegiatans.find(s => s.kode_sub_kegiatan === formSubKeg);
    if (!linkedSub) {
      alert("Kode Sub-Kegiatan tidak valid!");
      return;
    }

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
        const customFileName = `Foto_Belanja_${formSubKeg}_${Date.now()}.${originalExtension}`;
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
        tanggal: formTanggal,
        tahun: editItem?.tahun || selectedYear,
        kode_program: linkedSub.kode_program,
        kode_kegiatan: linkedSub.kode_kegiatan,
        kode_sub_kegiatan: formSubKeg,
        uraian_belanja: formDetailBelanja.trim(),
        nama_pelaksana: formNamaPelaksana.trim(),
        nomor_kontrak: formNomorKontrak.trim(),
        masa_kerja_mulai: formMasaKerjaMulai,
        masa_kerja_selesai: formMasaKerjaSelesai,
        realisasi: formRealisasi,
        catatan: formCatatan.trim(),
        foto_kegiatan: cloudinaryUrl || undefined,
        foto_kegiatan_public_id: cloudinaryPublicId || undefined
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
            placeholder="Cari kendala lapangan..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full p-2 pl-8 border border-slate-200 bg-white rounded-lg focus:outline-blue-600"
          />
        </div>
      </div>

      {/* Main Table Layout */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="mon-table-panel">
        <div className="grid grid-cols-1 divide-y divide-slate-100" id="mon-cards-container">
          {filteredPihakKetigas.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-semibold">Tabel belanja pihak ketiga kosong. Harap tambahkan data baru.</div>
          ) : (
            filteredPihakKetigas.map((m, i) => (
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

                  <div className="flex gap-4">
                     <div className="bg-slate-100 p-2 rounded text-[10px]">
                        <p className="font-bold text-slate-600">Realisasi</p>
                        <p className="font-black text-blue-900">{formatRupiah(m.realisasi)}</p>
                     </div>
                     <div className="bg-slate-100 p-2 rounded text-[10px]">
                        <p className="font-bold text-slate-600">Masa Kerja</p>
                        <p className="font-mono text-slate-700">{m.masa_kerja_mulai || '-'} s/d {m.masa_kerja_selesai || '-'}</p>
                     </div>
                  </div>

                  <div className="bg-slate-50 p-2 rounded border border-slate-100 text-xs">
                      <span className="font-bold text-slate-500 block">Catatan:</span>
                      <p className="italic text-slate-700">{m.catatan || '-'}</p>
                  </div>
                </div>

                {/* Crud Actions right aligned */}
                <div className="flex md:flex-col items-center gap-1 text-center justify-end self-stretch md:border-l border-slate-100 md:pl-4">
                  <button onClick={() => setSelectedItem(m)} className="p-2 hover:bg-emerald-100 text-emerald-700 rounded-lg transition" title="Lihat">
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
            ))
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
                  <label className="block text-slate-700 font-bold mb-1">Tanggal *</label>
                  <input 
                    type="date"
                    value={formTanggal}
                    onChange={(e) => setFormTanggal(e.target.value)}
                    required
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-blue-600 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Pilih Sub-Kegiatan *</label>
                  <select
                    value={formSubKeg}
                    onChange={(e) => setFormSubKeg(e.target.value)}
                    required
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
                <label className="block text-slate-700 font-bold mb-1">Detail Belanja (E-RKA) *</label>
                <select
                  value={formDetailBelanja}
                  onChange={(e) => setFormDetailBelanja(e.target.value)}
                  required
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
                  <label className="block text-slate-700 font-bold mb-1">Nama Pelaksana *</label>
                  <input 
                    type="text"
                    value={formNamaPelaksana}
                    onChange={(e) => setFormNamaPelaksana(e.target.value)}
                    required
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
                <label className="block text-slate-700 font-bold mb-1">Nilai Realisasi (Rp) *</label>
                <input 
                  type="number"
                  value={formRealisasi}
                  onChange={(e) => setFormRealisasi(Number(e.target.value))}
                  required
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-blue-600 font-bold text-blue-900"
                />
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

      {/* Detail Overlay Dialog */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="detail-overlay">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden" id="detail-modal">
            <div className="p-4 bg-slate-800 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-1.5 text-sm">
                <Eye size={16} />
                Detail Belanja Pihak Ketiga
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
              <div className="space-y-2">
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
                <p><span className="font-bold text-slate-500">Realisasi:</span> {formatRupiah(selectedItem.realisasi)}</p>
                <p className="border-t pt-2"><span className="font-bold text-slate-500">Catatan:</span><br/> {selectedItem.catatan || '-'}</p>
              </div>
            </div>
            <div className="p-4 border-t text-right">
              <button onClick={() => setSelectedItem(null)} className="px-4 py-2 font-semibold text-slate-700 border border-slate-200 rounded-lg">Tutup</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
