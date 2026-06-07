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
import { MonitoringFisik, Program, Kegiatan, SubKegiatan, UserRole } from '../types';
import { formatRupiah, exportToCSV } from '../utils/helpers';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { COLL_MONITORING_FISIK, createAuditLog } from '../dbService';
import { uploadFile, deleteFile } from '../cloudinaryService';

interface MonitoringViewProps {
  monitorings: MonitoringFisik[];
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  currentUserRole: UserRole;
  currentUserEmail: string;
}

export default function MonitoringView({
  monitorings,
  programs,
  kegiatans,
  subKegiatans,
  currentUserRole,
  currentUserEmail
}: MonitoringViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubKeg, setSelectedSubKeg] = useState('');

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MonitoringFisik | null>(null);

  // Form Fields
  const [formTanggal, setFormTanggal] = useState<string>(new Date().toISOString().substring(0, 10));
  const [formSubKeg, setFormSubKeg] = useState<string>('');
  const [formTarget, setFormTarget] = useState<number>(100);
  const [formRealisasiFisik, setFormRealisasiFisik] = useState<number>(0);
  const [formKendala, setFormKendala] = useState<string>('');
  const [formTindakLanjut, setFormTindakLanjut] = useState<string>('');
  const [formFotoFile, setFormFotoFile] = useState<File | null>(null);
  const [existingFotoUrl, setExistingFotoUrl] = useState<string>('');
  const [formFotoFileName, setFormFotoFileName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const canEdit = currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.OPERATOR;

  // Search filter
  const filteredMonitorings = useMemo(() => {
    return monitorings.filter(m => {
      const matchSearch = String(m.kode_sub_kegiatan).toLowerCase().includes(searchTerm.toLowerCase()) ||
                          String(m.kendala || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchSub = selectedSubKeg === '' || m.kode_sub_kegiatan === selectedSubKeg;
      return matchSearch && matchSub;
    });
  }, [monitorings, searchTerm, selectedSubKeg]);

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

  // Compute calculated performance ratio % e.g. (realisasiFisik / targetFisik) * 100
  const computedPercent = useMemo(() => {
    if (formTarget <= 0) return 0;
    return parseFloat(((formRealisasiFisik / formTarget) * 100).toFixed(1));
  }, [formTarget, formRealisasiFisik]);

  // Open Form Dialogs
  const openAddModal = () => {
    setEditItem(null);
    setFormTanggal(new Date().toISOString().substring(0, 10));
    setFormSubKeg('');
    setFormTarget(100);
    setFormRealisasiFisik(0);
    setFormKendala('');
    setFormTindakLanjut('');
    setFormFotoFile(null);
    setExistingFotoUrl('');
    setFormFotoFileName('');
    setShowForm(true);
  };

  const openEditModal = (item: MonitoringFisik) => {
    setEditItem(item);
    setFormTanggal(item.tanggal);
    setFormSubKeg(item.kode_sub_kegiatan);
    setFormTarget(item.target_fisik);
    setFormRealisasiFisik(item.realisasi_fisik);
    setFormKendala(item.kendala || '');
    setFormTindakLanjut(item.tindak_lanjut || '');
    setFormFotoFile(null);
    setExistingFotoUrl(item.foto_kegiatan || '');
    setFormFotoFileName(item.foto_kegiatan ? 'Dokumentasi_Foto_Sektor.png' : '');
    setShowForm(true);
  };

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubKeg || formTarget <= 0 || formRealisasiFisik < 0) {
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

        // Upload the new image to Cloudinary with custom name based on sub-activity code
        const originalExtension = formFotoFile.name.split('.').pop() || 'png';
        const customFileName = `Foto_Kegiatan_${formSubKeg}.${originalExtension}`;
        const uploadRes = await uploadFile(formFotoFile, "sirekap", customFileName);
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

      const docId = editItem ? editItem.id : `monitor_${Date.now()}`;
      const payload: MonitoringFisik = {
        id: docId,
        tanggal: formTanggal,
        kode_program: linkedSub.kode_program,
        kode_kegiatan: linkedSub.kode_kegiatan,
        kode_sub_kegiatan: formSubKeg,
        target_fisik: formTarget,
        realisasi_fisik: formRealisasiFisik,
        persentase: computedPercent,
        kendala: formKendala.trim(),
        tindak_lanjut: formTindakLanjut.trim(),
        foto_kegiatan: cloudinaryUrl || undefined,
        foto_kegiatan_public_id: cloudinaryPublicId || undefined
      };

      await setDoc(doc(db, COLL_MONITORING_FISIK, docId), payload).catch(err => handleFirestoreError(err, OperationType.WRITE, `${COLL_MONITORING_FISIK}/${docId}`));

      // Handle audit logging
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        editItem ? "UPDATE MONITORING FISIK" : "TAMBAH MONITORING FISIK",
        "MONITORING_FISIK",
        editItem,
        payload
      );

      alert(`[NOTIFIKASI DATA BERUBAH]\nBerhasil menyimpan realisasi fisik untuk sub-kegiatan ${payload.kode_sub_kegiatan} dengan capaian ${payload.persentase}%. Log audit dicatat.`);

      setShowForm(false);
      setEditItem(null);
    } catch (err) {
      alert("Gagal memproses monitoring: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  // Handle row deletion
  const handleDelete = async (item: MonitoringFisik) => {
    const isConfirmed = window.confirm(`Hapus monitoring fisik untuk Sub-Kegiatan: ${item.kode_sub_kegiatan}?`);
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

      await deleteDoc(doc(db, COLL_MONITORING_FISIK, item.id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `${COLL_MONITORING_FISIK}/${item.id}`));
      
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        "HAPUS MONITORING FISIK",
        "MONITORING_FISIK",
        item,
        null
      );

      alert(`[NOTIFIKASI DATA BERUBAH]\nPencatatan monitoring fisik sub-kegiatan ${item.kode_sub_kegiatan} berhasil dipindahkan secara permanen.`);
    } catch (err) {
      alert("Gagal menghapus: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleExportCSV = () => {
    const exportHeaders = ['id', 'tanggal', 'kode_program', 'kode_kegiatan', 'kode_sub_kegiatan', 'target_fisik', 'realisasi_fisik', 'persentase', 'kendala', 'tindak_lanjut'];
    exportToCSV(filteredMonitorings, exportHeaders, 'Laporan_Monitoring_Ganti_Rugi_Bima_2026');
  };

  return (
    <div className="space-y-6" id="monitoring-module-root">
      
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="mon-title-card">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 font-display">
            <Activity className="text-[#1e3a8a]" size={20} />
            Pemantauan Kinerja Fisik & Batas Sengketa
          </h2>
          <p className="text-xs text-slate-500 mt-1">Sistem informasi kemajuan fisik pengukuran batas ganti rugi, kendala lapangan, tindak lanjut hukum, dan arsip foto.</p>
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
              Input Laporan Kemajuan Fisik
            </button>
          )}
        </div>
      </div>

      {/* Sorter / Filters */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 text-xs" id="mon-filter-box">
        <select value={selectedSubKeg} onChange={(e) => setSelectedSubKeg(e.target.value)} className="p-2 border border-slate-200 bg-white rounded-lg flex-1 max-w-sm focus:outline-blue-600">
          <option value="">Semua Sub-Kegiatan</option>
          {subKegiatans.map((s, idx) => (
            <option key={idx} value={s.kode_sub_kegiatan}>{s.kode_sub_kegiatan} - {(s.nama_sub_kegiatan || '').substring(0, 35)}...</option>
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
          {filteredMonitorings.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-semibold">Tabel monitoring fisik kosong. Harap tambahkan data baru.</div>
          ) : (
            filteredMonitorings.map((m, i) => (
              <div key={i} className="p-5 flex flex-col md:flex-row gap-5 items-start hover:bg-slate-50/30 transition duration-150" id={`mon-row-${i}`}>
                {/* Photo or Placeholder */}
                <div className="w-full md:w-44 h-28 bg-slate-100 border rounded-lg hover:border-blue-500 transition overflow-hidden flex items-center justify-center flex-shrink-0 relative">
                  {m.foto_kegiatan ? (
                    <img src={m.foto_kegiatan} alt="Foto_Kegiatan" className="object-cover w-full h-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="text-center text-slate-400 p-2">
                      <Camera className="mx-auto mb-1 text-slate-400" size={24} />
                      <span className="text-[10px] font-semibold">Bebas Foto Mediasi</span>
                    </div>
                  )}
                </div>

                {/* Main description data */}
                <div className="flex-1 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-slate-100 pb-2">
                    <div>
                      <span className="text-[10px] bg-blue-100 text-blue-900 font-black px-2 py-0.5 rounded-full font-mono">{m.kode_sub_kegiatan}</span>
                      <h4 className="font-bold text-slate-900 mt-1 text-xs">{subKegiatans.find(s => s.kode_sub_kegiatan === m.kode_sub_kegiatan)?.nama_sub_kegiatan || 'Sub Kegiatan Terdaftar'}</h4>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500 font-bold flex items-center gap-1"><Calendar size={12} /> {m.tanggal}</span>
                  </div>

                  {/* Progressive Achievements */}
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Target Fisik</p>
                      <p className="font-black text-slate-800 text-sm mt-0.5">{m.target_fisik}%</p>
                    </div>
                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Realisasi Fisik</p>
                      <p className="font-black text-emerald-800 text-sm mt-0.5">{m.realisasi_fisik}%</p>
                    </div>
                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Efisiensi Capaian</p>
                      <p className="font-black text-slate-900 text-sm mt-0.5 flex justify-center items-center gap-0.5">
                        <ArrowUpRight size={13} className="text-emerald-700" />
                        {m.persentase}%
                      </p>
                    </div>
                  </div>

                  {/* Constraints or Action Logs text */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium">
                    <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100 text-amber-900 space-y-0.5">
                      <span className="font-bold text-[9px] uppercase tracking-wider text-amber-800 flex items-center gap-1">
                        <AlertTriangle size={11} />
                        Hambatan & Kendala Lapangan
                      </span>
                      <p className="text-[11px] leading-relaxed italic">{m.kendala || 'Tidak ditemukan kendala krusial.'}</p>
                    </div>

                    <div className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 text-blue-900 space-y-0.5">
                      <span className="font-bold text-[9px] uppercase tracking-wider text-blue-800 flex items-center gap-1">
                        <ShieldCheck size={11} />
                        Intervensi & Tindak Lanjut Pemda
                      </span>
                      <p className="text-[11px] leading-relaxed">{m.tindak_lanjut || 'Pemantauan berkala kemajuan lapangan.'}</p>
                    </div>
                  </div>
                </div>

                {/* Crud Actions right aligned */}
                {canEdit && (
                  <div className="flex md:flex-col items-center gap-1 text-center justify-end self-stretch md:border-l border-slate-100 md:pl-4">
                    <button onClick={() => openEditModal(m)} className="p-2 hover:bg-amber-100 text-amber-700 rounded-lg transition" title="Edit"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(m)} className="p-2 hover:bg-red-100 text-red-700 rounded-lg transition" title="Hapus"><Trash2 size={14} /></button>
                  </div>
                )}
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
                {editItem ? 'Edit Laporan Fisik' : 'Tambah Kemajuan Fisik & Ganti Rugi'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-white hover:text-white/80 font-bold text-lg">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs max-h-[78vh] overflow-y-auto">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Tanggal Pantauan *</label>
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
                      <option key={idx} value={s.kode_sub_kegiatan}>{s.kode_sub_kegiatan} - {(s.nama_sub_kegiatan || '').substring(0,30)}...</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Target Fisik (%) *</label>
                  <input 
                    type="number"
                    value={formTarget}
                    onChange={(e) => setFormTarget(Number(e.target.value))}
                    min={1}
                    max={100}
                    required
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-lg focus:outline-blue-600 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Realisasi Fisik (%) *</label>
                  <input 
                    type="number"
                    value={formRealisasiFisik}
                    onChange={(e) => setFormRealisasiFisik(Number(e.target.value))}
                    min={0}
                    max={100}
                    required
                    className="w-full p-2.5 border border-slate-200 bg-white rounded-lg focus:outline-blue-600 font-bold text-emerald-800"
                  />
                </div>
              </div>

              <div className="bg-emerald-50 text-emerald-900 border border-emerald-100 p-2.5 rounded-lg flex justify-between font-bold">
                <span>Rasio Capaian Target:</span>
                <span>{computedPercent}%</span>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Hambatan / Kendala Utama Lapangan</label>
                <textarea 
                  placeholder="Ketik hambatan seperti kontur sengketa batas ulayat bima, sengketa hak pakai, dll."
                  value={formKendala}
                  onChange={(e) => setFormKendala(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-blue-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Tindak Lanjut / Intervensi Pemda</label>
                <textarea 
                  placeholder="Ketik langkah advokasi, pengukuhan sertifikat, dll."
                  value={formTindakLanjut}
                  onChange={(e) => setFormTindakLanjut(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-blue-600"
                />
              </div>

              {/* Photo Upload for photographic evidence */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Ganti/Unggah Foto Lapangan (*Hanya Foto saja)</label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative overflow-hidden bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 flex items-center gap-2">
                    <Camera size={14} className="text-slate-500" />
                    <span>Upload Citra Satelit / Medias</span>
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
                    "Simpan & Sync Capaian"
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
