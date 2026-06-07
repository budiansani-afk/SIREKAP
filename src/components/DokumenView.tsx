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
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Derive activeDoc from selectedFile URL
  const activeDoc = useMemo(() => {
    if (!selectedFile) return null;
    return dokumens.find(d => d.data_url === selectedFile) || {
      id: 'temp',
      nama_dokumen: selectedFile.split('/').pop()?.split('?')[0] || 'Dokumen',
      kategori: 'Undocumented',
      tanggal_upload: '-',
      tipe_file: selectedFile.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png',
      ukuran_file: '-',
      data_url: selectedFile
    } as DokumenArsip;
  }, [dokumens, selectedFile]);

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

  // Trigger secure local download for both same-origin and different-origin (e.g., Cloudinary CDN) files
  const handleDownloadFile = async (url: string, filename: string) => {
    if (!url) return;
    
    // Extract the exact filename stored in the Cloudinary storage (the last segment of the path)
    let storageFilename = url.split('/').pop()?.split('?')[0] || filename || 'dokumen';
    try {
      storageFilename = decodeURIComponent(storageFilename);
    } catch (e) {}

    console.log(`[DOWNLOAD] Initiating download for filename in storage: "${storageFilename}"`);

    // 1. If it's a Cloudinary URL, use fl_attachment with the specific filename to force browser download in the CDN layer
    if (url.includes("res.cloudinary.com/")) {
      try {
        let downloadUrl = url;
        const lastDot = storageFilename.lastIndexOf('.');
        const baseName = lastDot !== -1 ? storageFilename.substring(0, lastDot) : storageFilename;
        const cleanBaseName = encodeURIComponent(baseName);

        if (url.includes("/upload/")) {
          // Replace /upload/ with /upload/fl_attachment:cleanBaseName/ to preserve storage filename
          downloadUrl = url.replace("/upload/", `/upload/fl_attachment:${cleanBaseName}/`);
        } else {
          downloadUrl = url + `?fl_attachment=${cleanBaseName}`;
        }
        
        console.log(`[DOWNLOAD] Triggering native Cloudinary download with fl_attachment: ${downloadUrl}`);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.target = "_blank";
        link.setAttribute("download", storageFilename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      } catch (err) {
        console.warn("[DOWNLOAD] Failed Cloudinary delivery flag optimization, falling back to Blob download:", err);
      }
    }

    // 2. Fetch Blob fallback - this guarantees custom name attribute is respected by the browser
    try {
      console.log(`[DOWNLOAD] Fetching data blob for URL: ${url}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Gagal mengambil file");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = storageFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      console.error("[DOWNLOAD] Blob download failed:", err);
      // Absolute fallback if everything fails (CORS blocks, etc): open direct in blank page
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.setAttribute("download", storageFilename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

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
    const rawBase = file.name.split('.').slice(0, -1).join('.');
    const cleanBase = rawBase
      .replace(/[^a-zA-Z0-9_\-\s]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_");
    setFormNamaDokumen(cleanBase);
    setFileType(file.type || 'application/octet-stream');

    // Convert file size to readable string
    const sizeInKb = (file.size / 1024).toFixed(1);
    setFileSizeStr(`${sizeInKb} KB`);
    setFileToUpload(file);
  };

  // Submit Upload Form
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formNamaDokumen.trim()
      .replace(/[^a-zA-Z0-9_\-\s]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_");

    if (!cleanName || !fileToUpload) {
      alert("Harap pilih berkas foto terlebih dahulu dan masukkan nama.");
      return;
    }

    setIsUploading(true);
    try {
      // 1. Check for file name collision in Firestore dokumens list.
      // If a match is found, append sequential numbers (_1, _2, etc.) to ensure uniqueness.
      const originalExtension = fileName.split('.').pop() || '';
      let isNameUnique = false;
      let suffixCounter = 0;
      let checkBase = cleanName;
      
      while (!isNameUnique) {
        const candidateNameWithExt = originalExtension 
          ? `${checkBase}.${originalExtension}`
          : checkBase;
          
        const candidateNameWithoutExt = checkBase;
        
        const hasCollision = dokumens.some(d => {
          const existingName = d.nama_dokumen.toLowerCase();
          const targetWithExt = candidateNameWithExt.toLowerCase();
          const targetWithoutExt = candidateNameWithoutExt.toLowerCase();
          
          return existingName === targetWithExt || 
                 existingName === targetWithoutExt ||
                 d.cloudinary_public_id === `sirekap/${candidateNameWithoutExt}` ||
                 d.cloudinary_public_id?.endsWith(`/${candidateNameWithoutExt}`) ||
                 d.data_url?.toLowerCase().includes(`/${targetWithExt}`) ||
                 d.data_url?.toLowerCase().includes(`/${targetWithoutExt}`);
        });
        
        if (hasCollision) {
          suffixCounter++;
          checkBase = `${cleanName}_${suffixCounter}`;
          console.log(`[COLLISION DETECTION] Name taken! Retrying sequence: "${checkBase}"`);
        } else {
          isNameUnique = true;
        }
      }

      const finalCleanName = checkBase;
      const customFileName = originalExtension 
        ? `${finalCleanName}.${originalExtension}`
        : finalCleanName;

      const cloudinaryRes = await uploadFile(fileToUpload, "sirekap", customFileName);

      // Extract back the exact final public_id from Cloudinary response (without directory/folder prefix)
      const fullPublicId = cloudinaryRes.public_id || '';
      const lastSlashIdx = fullPublicId.lastIndexOf('/');
      const finalMappedName = lastSlashIdx !== -1 ? fullPublicId.substring(lastSlashIdx + 1) : fullPublicId;

      const docId = `dok_${Date.now()}`;
      const payload: DokumenArsip = {
        id: docId,
        nama_dokumen: finalMappedName, // Explicitly map to the exact finalized Cloudinary public_id name
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

    setDeletingId(item.id);
    try {
      // Determine deletion target: prefer raw public ID, fallback to Cloudinary URL parsing if present
      const deleteTarget = item.cloudinary_public_id || (item.data_url?.includes("res.cloudinary.com") ? item.data_url : null);

      if (deleteTarget) {
        console.log(`[DEBUG_HAPUS] Memulai proses penghapusan asset Cloudinary.`);
        console.log(`[DEBUG_HAPUS] Parameter / URL yang akan dikirim: "${deleteTarget}"`);
        try {
          // Call the secure server-side deletion route directly passing public_id from Firestore document
          const response = await fetch("/api/cloudinary/delete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              public_id: item.cloudinary_public_id || deleteTarget,
              url: item.data_url
            })
          });

          if (!response.ok) {
            const errInfo = await response.json().catch(() => ({}));
            const errCodeStr = errInfo.errorCode ? ` [Error Code: ${errInfo.errorCode}]` : "";
            console.error(`[DEBUG_HAPUS] Error terdeteksi dari endpoint server:${errCodeStr}`, errInfo);
            throw new Error((errInfo.error || `Server responded with status: ${response.status}`) + errCodeStr);
          }

          const delResult = await response.json();
          console.log(`[DEBUG_HAPUS] Berhasil memproses permintaan hapus Cloudinary secara tuntas.`, delResult);
          
          if (delResult && delResult.success === false) {
            const errCodeStr = delResult.errorCode ? ` [Error Code: ${delResult.errorCode}]` : "";
            console.error(`[DEBUG_HAPUS] Gagal menghapus aset Cloudinary:${errCodeStr}`, delResult);
            
            if (delResult.errorCode === "ASSET_NOT_FOUND" || delResult.result === "not found") {
              console.warn(`[DEBUG_HAPUS] Cloudinary melaporkan asset tidak ditemukan ("not found"). Melanjutkan ke penghapusan database.`);
            } else {
              throw new Error((delResult.error || "Gagal menghapus aset dari Cloudinary server") + errCodeStr);
            }
          }
          
          if (delResult && delResult.result === "not found") {
            console.warn(`[DEBUG_HAPUS] Cloudinary melaporkan asset tidak ditemukan ("not found"). Melanjutkan ke penghapusan database.`);
          }
        } catch (cloudinaryErr: any) {
          console.error("[DEBUG_HAPUS] Terjadi kesalahan saat memanggil fungsi hapus Cloudinary!");
          console.error("[DEBUG_HAPUS] Detail Error Object:", cloudinaryErr);
          
          const errMsg = cloudinaryErr?.message || String(cloudinaryErr);
          const isNotFoundError = errMsg.toLowerCase().includes("not found") || 
                                 errMsg.toLowerCase().includes("not_found") || 
                                 errMsg.includes("ASSET_NOT_FOUND");

          if (isNotFoundError) {
            console.warn(`[DEBUG_HAPUS] Deteksi NOT_FOUND pada Cloudinary (${errMsg}). Melompati validasi blocker untuk mencegah record Firestore yatim (orphaned).`);
          } else {
            const forceConfirm = window.confirm(
              `KONEKSI CLOUDINARY GAGAL UNTUK TARGET: "${deleteTarget}"\n\n` +
              `Detail Error:\n${errMsg}\n\n` +
              `Apakah Anda ingin tetap memaksa menghapus record dokumen ini secara permanen dari database Firestore?`
            );
            if (!forceConfirm) {
              console.log("[DEBUG_HAPUS] Proses penghapusan dibatalkan oleh pengguna karena kegagalan Cloudinary.");
              return; // Abort deletion
            }
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
    } finally {
      setDeletingId(null);
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
              <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-xs hover:shadow-md hover:border-blue-500 transition-all duration-200 flex flex-col justify-between overflow-hidden group/card" id={`doc-card-${i}`}>
                {/* Micro preview block - Clickable to open preview */}
                <div 
                  className="h-32 bg-slate-50 border-b flex items-center justify-center relative group overflow-hidden cursor-pointer"
                  onClick={() => setSelectedFile(d.data_url)}
                  title="Klik untuk melihat pratinjau dokumen"
                >
                  {isImage ? (
                    <img src={d.data_url} alt="doc-preview" className="w-[85%] h-[85%] object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="p-4 bg-blue-50/50 hover:bg-slate-100 text-blue-800 rounded-2xl border border-blue-100/50 flex flex-col items-center gap-1 w-[80%] h-[75%] justify-center">
                      <FileText size={28} className="text-blue-800" />
                      <span className="text-[9px] font-mono font-bold tracking-wide break-all text-center leading-tight line-clamp-1">{d.nama_dokumen}</span>
                    </div>
                  )}

                  {/* Hover Overlay indicator */}
                  <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover/card:opacity-100 transition duration-150 flex items-center justify-center">
                    <span className="bg-blue-900 border border-blue-800 text-white rounded-lg text-[10px] font-bold px-2 py-1 shadow">
                      Lihat Berkas
                    </span>
                  </div>

                  {/* Absolute Badge Category */}
                  <span className="absolute top-2.5 right-2.5 bg-blue-900 border border-blue-800 text-[9px] font-extrabold text-white px-2 py-0.5 rounded-full select-none shadow">
                    {d.kategori}
                  </span>
                </div>

                {/* Meta details - Clickable to open preview */}
                <div 
                  className="p-4 space-y-2 cursor-pointer" 
                  onClick={() => setSelectedFile(d.data_url)}
                  title="Klik untuk melihat pratinjau dokumen"
                >
                  <h4 className="font-extrabold text-slate-900 truncate leading-tight text-xs hover:text-blue-700 transition" title={d.nama_dokumen}>{d.nama_dokumen}</h4>
                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium">
                    <span className="flex items-center gap-0.5 font-bold"><Calendar size={11} /> {d.tanggal_upload}</span>
                    <span className="bg-slate-100 text-slate-700 font-mono font-bold px-1 rounded">{d.ukuran_file}</span>
                  </div>
                </div>

                {/* Action panel */}
                <div className="bg-slate-50 p-2 border-t flex gap-1.5 items-center justify-end">
                  <button 
                    onClick={() => setSelectedFile(d.data_url)}
                    className="p-1.5 bg-white border hover:bg-blue-50 text-blue-800 rounded-lg hover:border-blue-300 transition"
                    title="Lihat Detail / Preview"
                  >
                    <Eye size={13} />
                  </button>
                  <button 
                    onClick={() => handleDownloadFile(d.data_url, d.nama_dokumen)}
                    className="p-1.5 bg-white border hover:bg-emerald-50 text-emerald-800 rounded-lg hover:border-emerald-300 transition cursor-pointer"
                    title="Download File ke Lokal"
                    id={`btn-download-card-${i}`}
                  >
                    <Download size={13} />
                  </button>
                  {canEdit && (
                    <button 
                      onClick={() => handleDelete(d)}
                      disabled={deletingId !== null}
                      className={`p-1.5 border rounded-lg transition ${
                        deletingId === d.id 
                          ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed animate-pulse" 
                          : "bg-white hover:bg-red-50 text-red-700 hover:border-red-300 cursor-pointer"
                      }`}
                      title={deletingId === d.id ? "Sedang Menghapus..." : "Hapus"}
                    >
                      {deletingId === d.id ? (
                        <span className="w-3 h-3 border-2 border-red-700 border-t-transparent rounded-full animate-spin inline-block" />
                      ) : (
                        <Trash2 size={13} />
                      )}
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
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-Z0-9_\-\s]/g, "");
                    setFormNamaDokumen(val);
                  }}
                  onBlur={(e) => {
                    const val = e.target.value
                      .trim()
                      .replace(/\s+/g, "_")
                      .replace(/_+/g, "_");
                    setFormNamaDokumen(val);
                  }}
                  required
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-blue-600 font-mono"
                />
              </div>

              {/* Upload file triggers conversion */}
              <div className="border-2 border-dashed border-slate-200 hover:border-blue-500 rounded-xl p-4 text-center cursor-pointer transition relative bg-slate-50/50">
                <input 
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileUploadAndConvertObj}
                  required
                  disabled={isUploading}
                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <Upload className="mx-auto text-blue-800 mb-1 animate-pulse" size={24} />
                <p className="font-bold text-slate-700">Pilih Berkas Foto / PDF</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Hanya berkas Foto (PNG, JPG, WEBP) atau Dokumen PDF (.pdf)</p>
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

      {/* Preview Modal */}
      {selectedFile && activeDoc && (
        <div 
          className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          id="preview-overlay-bg"
          onClick={() => setSelectedFile(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-150 max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]"
            id="preview-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-blue-300" />
                <div>
                  <h3 className="font-bold text-sm md:text-base line-clamp-1" title={activeDoc.nama_dokumen}>{activeDoc.nama_dokumen}</h3>
                  <p className="text-[10px] text-slate-300 flex items-center gap-1.5 mt-0.5">
                    Kategori: 
                    <span className="font-extrabold text-white bg-blue-800 px-2 py-0.5 rounded-full text-[9px]">
                      {activeDoc.kategori}
                    </span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedFile(null)} 
                className="text-white hover:text-white/80 font-bold text-2xl px-2 focus:outline-none cursor-pointer"
                aria-label="Tutup"
              >
                &times;
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 bg-slate-50 flex-1 overflow-auto flex flex-col items-center justify-center min-h-[350px]">
              {activeDoc.tipe_file.startsWith('image/') ? (
                <div className="relative max-h-[55vh] w-full flex items-center justify-center bg-slate-100 rounded-xl border overflow-hidden p-2">
                  <img 
                    src={selectedFile} 
                    alt={activeDoc.nama_dokumen} 
                    className="max-h-[50vh] max-w-full object-contain rounded-md"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : activeDoc.tipe_file === 'application/pdf' ? (
                <div className="w-full h-full flex flex-col gap-2">
                  <iframe 
                    src={selectedFile} 
                    className="w-full h-[55vh] rounded-lg border border-slate-200 bg-white" 
                    title={activeDoc.nama_dokumen}
                  />
                  <div className="text-[11px] text-slate-500 text-center font-medium">
                    Jika file PDF tidak tampil secara otomatis, Anda dapat mengunduh berkas menggunakan tombol di bawah ini.
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 space-y-3">
                  <FileText size={64} className="mx-auto text-blue-900/40" />
                  <div className="font-bold text-slate-700 text-sm">Format berkas tidak dapat ditinjau langsung</div>
                  <div className="text-xs text-slate-500">Tipe Berkas: {activeDoc.tipe_file}</div>
                </div>
              )}
            </div>

            {/* Footer with Details & Download */}
            <div className="p-4 bg-white border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-4 text-slate-600">
                <div>
                  <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Tanggal Unggah</span>
                  <span className="font-semibold text-slate-800">{activeDoc.tanggal_upload}</span>
                </div>
                <div>
                  <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Ukuran File</span>
                  <span className="font-semibold text-slate-800">{activeDoc.ukuran_file}</span>
                </div>
                {activeDoc.cloudinary_public_id && (
                  <div className="col-span-2 sm:col-span-1">
                    <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Cloudinary Public ID</span>
                    <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded truncate block max-w-[200px]" title={activeDoc.cloudinary_public_id}>
                      {activeDoc.cloudinary_public_id}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 justify-end">
                <a 
                  href={selectedFile} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-all flex items-center gap-1.5"
                >
                  Buka di Tab Baru
                </a>
                <button 
                  onClick={() => handleDownloadFile(selectedFile, activeDoc.nama_dokumen)}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  id="btn-download-preview"
                >
                  <Download size={14} />
                  Unduh Berkas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
