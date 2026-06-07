import React, { useState, useMemo } from 'react';
import { 
  FolderCheck, 
  Upload, 
  Search, 
  Trash2, 
  Download, 
  Eye, 
  FileText, 
  Calendar,
  Layers,
  FileCheck2,
  FileSpreadsheet
} from 'lucide-react';
import { DokumenArsip, UserRole } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { COLL_DOKUMEN, createAuditLog } from '../dbService';
import { uploadFile, deleteFile } from '../cloudinaryService';

interface DokumenViewProps {
  dokumens: DokumenArsip[];
  currentUserRole: UserRole;
  currentUserEmail: string;
}

export default function DokumenView({
  dokumens,
  currentUserRole,
  currentUserEmail
}: DokumenViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [formNamaDokumen, setFormNamaDokumen] = useState('');
  const [formKategori, setFormKategori] = useState('DPA');
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileSizeStr, setFileSizeStr] = useState('');
  const [fileType, setFileType] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const canEdit = currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.OPERATOR;

  const categories = [
    "RKA", "DPA", "DPPA", "SK", "Surat Tugas", "Kontrak", "Kwitansi", "SPJ", "Berita Acara", "Foto Kegiatan", "Dokumen Pendukung"
  ];

  // Filter list
  const filteredDokumens = useMemo(() => {
    return dokumens.filter(d => {
      const matchSearch = d.nama_dokumen.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = selectedCategory === '' || d.kategori === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [dokumens, searchTerm, selectedCategory]);

  // Handle uploaded file as base64 representing file storage in firestore
  const handleFileUploadAndConvertObj = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Enforce that only image/photo or PDF files are allowed
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      alert("SIMPAN DITOLAK: Hanya file berupa foto/gambar atau dokumen PDF (.pdf, .png, .jpg, .jpeg, .gif, .webp) yang diizinkan!");
      e.target.value = "";
      return;
    }

    setFileName(file.name);
    setFormNamaDokumen(file.name.split('.').slice(0, -1).join('.'));
    setFileType(file.type || 'application/octet-stream');

    // Convert file size to readable string
    const sizeInKb = (file.size / 1024).toFixed(1);
    setFileSizeStr(`${sizeInKb} KB`);
    setFileToUpload(file);
  };

  // Submit Upload Form
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNamaDokumen.trim() || !fileToUpload) {
      alert("Harap pilih berkas foto terlebih dahulu dan masukkan nama.");
      return;
    }

    setIsUploading(true);
    try {
      // 1. Upload File to Cloudinary with custom name given by the user, preserving extension
      const originalExtension = fileName.split('.').pop() || '';
      const customFileName = originalExtension 
        ? `${formNamaDokumen.trim()}.${originalExtension}`
        : formNamaDokumen.trim();

      const cloudinaryRes = await uploadFile(fileToUpload, "sirekap", customFileName);

      const docId = `dok_${Date.now()}`;
      const payload: DokumenArsip = {
        id: docId,
        nama_dokumen: formNamaDokumen.trim(),
        kategori: formKategori,
        tanggal_upload: new Date().toISOString().substring(0, 10),
        tipe_file: fileType,
        ukuran_file: fileSizeStr,
        data_url: cloudinaryRes.secure_url,
        cloudinary_public_id: cloudinaryRes.public_id
      };

      await setDoc(doc(db, COLL_DOKUMEN, docId), payload).catch(err => handleFirestoreError(err, OperationType.WRITE, `${COLL_DOKUMEN}/${docId}`));

      // Audit Log log write
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        "UPLOAD ARSIP DOKUMEN (CLOUDINARY)",
        "DOKUMEN_ARSIP",
        null,
        payload
      );

      // Notify the user about data change
      alert(`[NOTIFIKASI DATA BERUBAH]\nBerhasil mengunggah foto "${payload.nama_dokumen}" ke Cloudinary!\nURL: ${payload.data_url}`);

      setShowUploadModal(false);
      setFormNamaDokumen('');
      setFileToUpload(null);
      setFileName('');
    } catch (err) {
      alert("Gagal mengunggah dokumen ke Cloudinary: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsUploading(false);
    }
  };

  // Delete document
  const handleDelete = async (item: DokumenArsip) => {
    const isConfirmed = window.confirm(`Hapus dokumen arsip "${item.nama_dokumen}" dari sistem dan Cloudinary secara permanen?`);
    if (!isConfirmed) return;

    try {
      // Determine deletion target: prefer raw public ID, fallback to Cloudinary URL parsing if present
      const deleteTarget = item.cloudinary_public_id || (item.data_url?.includes("res.cloudinary.com") ? item.data_url : null);

      if (deleteTarget) {
        console.log(`[DEBUG_HAPUS] Memulai proses penghapusan asset Cloudinary.`);
        console.log(`[DEBUG_HAPUS] Parameter / URL yang akan dikirim: "${deleteTarget}"`);
        try {
          await deleteFile(deleteTarget);
          console.log(`[DEBUG_HAPUS] Berhasil memproses permintaan hapus Cloudinary untuk target: ${deleteTarget}`);
        } catch (cloudinaryErr: any) {
          console.error("[DEBUG_HAPUS] Terjadi kesalahan fatal saat memanggil fungsi hapus Cloudinary!");
          console.error("[DEBUG_HAPUS] Detail Error Object:", cloudinaryErr);
          console.error("[DEBUG_HAPUS] Pesan Error:", cloudinaryErr?.message || String(cloudinaryErr));
          
          const forceConfirm = window.confirm(
            `KONEKSI CLOUDINARY GAGAL UNTUK TARGET: "${deleteTarget}"\n\n` +
            `Detail Error:\n${cloudinaryErr.message || cloudinaryErr}\n\n` +
            `Apakah Anda ingin tetap memaksa menghapus record dokumen ini secara permanen dari database Firestore?`
          );
          if (!forceConfirm) {
            console.log("[DEBUG_HAPUS] Proses penghapusan dibatalkan oleh pengguna karena kegagalan Cloudinary.");
            return; // Abort deletion
          }
        }
      } else {
        console.log(`[DEBUG_HAPUS] Dokumen tidak memiliki metadata penyimpanan Cloudinary, langsung menghapus dari Firestore.`);
      }

      await deleteDoc(doc(db, COLL_DOKUMEN, item.id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `${COLL_DOKUMEN}/${item.id}`));
      
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        "HAPUS ARSIP DOKUMEN (CLOUDINARY)",
        "DOKUMEN_ARSIP",
        item,
        null
      );

      alert(`[NOTIFIKASI DATA BERUBAH]\nBerhasil menghapus data arsip "${item.nama_dokumen}" secara permanen dari database & Cloudinary.`);
    } catch (err) {
      alert("Gagal menghapus: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div className="space-y-6" id="dokumen-module-root">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm" id="doc-title-block">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-1.5 animate-pulse">
            <FolderCheck className="text-blue-800" size={22} />
            Arsip & Klasifikasi Dokumen Pendukung
          </h2>
          <p className="text-xs text-slate-600 mt-1">Simpan, cari, klasifikasikan, dan simulasikan kuitansi digital SP2D, DPA, and Berita Acara Pertanahan Bima.</p>
        </div>
        {canEdit && (
          <button 
            onClick={() => {
              setFileName('');
              setFormNamaDokumen('');
              setFileToUpload(null);
              setShowUploadModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow transition"
            id="btn-upload-file"
          >
            <Upload size={16} />
            Unggah Dokumen/Kuitansi
          </button>
        )}
      </div>

      {/* Categories & Search */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 text-xs" id="doc-filter-panel">
        <select 
          value={selectedCategory} 
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="p-2 border border-slate-200 bg-white rounded-lg max-w-xs focus:outline-blue-600 font-bold"
        >
          <option value="">Semua Kategori Arsip</option>
          {categories.map((cat, idx) => (
            <option key={idx} value={cat}>{cat}</option>
          ))}
        </select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text" 
            placeholder="Cari nama dokumen..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full p-2 pl-8 border border-slate-200 rounded-lg focus:outline-blue-600"
          />
        </div>
      </div>

      {/* Grid of archival cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" id="cards-grid">
        {filteredDokumens.length === 0 ? (
          <div className="col-span-full p-12 text-center text-slate-500 font-semibold bg-white rounded-xl border">
            Sistem tidak mendeteksi Dokumen Terunggah sesuai klasifikasi.
          </div>
        ) : (
          filteredDokumens.map((d, i) => {
            const isImage = d.tipe_file.startsWith('image/');
            return (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-xs hover:shadow-md hover:border-blue-500 transition-all duration-200 flex flex-col justify-between overflow-hidden" id={`doc-card-${i}`}>
                {/* Micro preview block */}
                <div className="h-32 bg-slate-50 border-b flex items-center justify-center relative group overflow-hidden">
                  {isImage ? (
                    <img src={d.data_url} alt="doc-preview" className="w-[85%] h-[85%] object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="p-4 bg-blue-50/50 hover:bg-slate-100 text-blue-800 rounded-2xl border border-blue-100/50 flex flex-col items-center gap-1 w-[80%] h-[75%] justify-center">
                      <FileText size={28} className="text-blue-800" />
                      <span className="text-[9px] font-mono font-bold tracking-wide break-all text-center leading-tight line-clamp-1">{d.nama_dokumen}</span>
                    </div>
                  )}

                  {/* Absolute Badge Category */}
                  <span className="absolute top-2.5 right-2.5 bg-blue-900 border border-blue-800 text-[9px] font-extrabold text-white px-2 py-0.5 rounded-full select-none shadow">
                    {d.kategori}
                  </span>
                </div>

                {/* Meta details */}
                <div className="p-4 space-y-2">
                  <h4 className="font-extrabold text-slate-900 truncate leading-tight text-xs" title={d.nama_dokumen}>{d.nama_dokumen}</h4>
                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium">
                    <span className="flex items-center gap-0.5 font-bold"><Calendar size={11} /> {d.tanggal_upload}</span>
                    <span className="bg-slate-100 text-slate-700 font-mono font-bold px-1 rounded">{d.ukuran_file}</span>
                  </div>
                </div>

                {/* Action panel */}
                <div className="bg-slate-50 p-2 border-t flex gap-1.5 items-center justify-end">
                  <a 
                    href={d.data_url} 
                    download={d.nama_dokumen}
                    className="p-1.5 bg-white border hover:bg-emerald-50 text-emerald-800 rounded-lg hover:border-emerald-300 transition"
                    title="Download File"
                  >
                    <Download size={13} />
                  </a>
                  {canEdit && (
                    <button 
                      onClick={() => handleDelete(d)}
                      className="p-1.5 bg-white border hover:bg-red-50 text-red-700 rounded-lg hover:border-red-300 transition"
                      title="Hapus"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Upload File Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="upload-overlay bg">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-sm w-full overflow-hidden" id="upload-card">
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-1.5 text-sm">
                <FolderCheck size={16} />
                Unggah Dokumen Baru
              </h3>
              <button onClick={() => setShowUploadModal(false)} className="text-white hover:text-white/80 font-bold text-lg">&times;</button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-5 space-y-4 text-xs">
              
              <div>
                <label className="block text-slate-700 font-bold mb-1">Klasifikasi Kategori *</label>
                <select
                  value={formKategori}
                  onChange={(e) => setFormKategori(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 bg-slate-50 rounded-lg outline-blue-600 focus:border-blue-600"
                >
                  {categories.map((cat, idx) => (
                    <option key={idx} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Nama Arsip Dokumen *</label>
                <input 
                  type="text"
                  placeholder="Ketik deskripsi nama arsip..."
                  value={formNamaDokumen}
                  onChange={(e) => setFormNamaDokumen(e.target.value)}
                  required
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-blue-600"
                />
              </div>

              {/* Upload file triggers conversion */}
              <div className="border-2 border-dashed border-slate-200 hover:border-blue-500 rounded-xl p-4 text-center cursor-pointer transition relative bg-slate-50/50">
                <input 
                  type="file"
                  accept="image/*"
                  onChange={handleFileUploadAndConvertObj}
                  required
                  disabled={isUploading}
                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <Upload className="mx-auto text-blue-800 mb-1 animate-pulse" size={24} />
                <p className="font-bold text-slate-700">Pilih Berkas Foto / Gambar</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Hanya file Foto (PNG, JPG, JPEG, WEBP, GIF)</p>
              </div>

              {fileName && (
                <div className="p-2.5 bg-blue-50 border border-blue-100/50 text-blue-900 rounded-lg font-mono text-[10px] flex justify-between items-center">
                  <span className="truncate max-w-[170px]" title={fileName}>{fileName}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="bg-indigo-100 text-indigo-900 px-1 rounded font-bold">{fileSizeStr}</span>
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => {
                        setFileName('');
                        setFileToUpload(null);
                        setFileType('');
                        setFileSizeStr('');
                      }}
                      className="text-red-700 hover:text-red-900 font-bold ml-1 hover:underline cursor-pointer disabled:opacity-50"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-4 justify-end border-t border-slate-100" id="form-actions">
                <button type="button" disabled={isUploading} onClick={() => setShowUploadModal(false)} className="px-4 py-2 font-semibold text-slate-700 border border-slate-200 rounded-lg disabled:opacity-50">Batal</button>
                <button 
                  type="submit" 
                  disabled={isUploading}
                  className="px-5 py-2 font-black text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isUploading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Mengunggah...
                    </>
                  ) : (
                    "Berhasil Simpan"
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
