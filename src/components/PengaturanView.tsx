import React, { useState, useMemo, useEffect } from 'react';
import { 
  Settings, 
  Database, 
  Download, 
  Upload, 
  Layers, 
  Building2, 
  TrendingUp, 
  CheckCircle,
  FileText,
  Camera,
  Crown
} from 'lucide-react';
import { AppSettings, UserRole } from '../types';
import { backupDatabaseToJSON, restoreDatabaseFromJSON, createAuditLog } from '../dbService';
import { uploadFile, deleteFile } from '../cloudinaryService';

interface PengaturanViewProps {
  settings: AppSettings | null;
  currentUserRole: UserRole;
  currentUserEmail: string;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
}

export default function PengaturanView({
  settings,
  currentUserRole,
  currentUserEmail,
  onUpdateSettings
}: PengaturanViewProps) {
  const [instNama, setInstNama] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [existingLogoUrl, setExistingLogoUrl] = useState('');
  const [fiscalYear, setFiscalYear] = useState<number>(2026);
  const [logoFileName, setLogoFileName] = useState('');
  const [namaPejabatTtd, setNamaPejabatTtd] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [jabatanPejabatTtd, setJabatanPejabatTtd] = useState('');
  const [nipPejabatTtd, setNipPejabatTtd] = useState('');
  const [namaBendahara, setNamaBendahara] = useState('');
  const [jabatanBendahara, setJabatanBendahara] = useState('');
  const [nipBendahara, setNipBendahara] = useState('');

  useEffect(() => {
    if (settings) {
      setInstNama(settings.nama_instansi || 'Dinas Perumahan dan Kawasan Permukiman Kabupaten Bima');
      setExistingLogoUrl(settings.logo_instansi || '');
      setLogoFile(null);
      setFiscalYear(settings.tahun_anggaran_aktif || 2026);
      setNamaPejabatTtd(settings.nama_pejabat_ttd || '');
      setJabatanPejabatTtd(settings.jabatan_pejabat_ttd || '');
      setNipPejabatTtd(settings.nip_pejabat_ttd || '');
      setNamaBendahara(settings.nama_bendahara || '');
      setJabatanBendahara(settings.jabatan_bendahara || 'Bendahara Pengeluaran');
      setNipBendahara(settings.nip_bendahara || '');
    }
  }, [settings]);

  // Backup / Restore states
  const [backupFileUrl, setBackupFileUrl] = useState('');
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const canEdit = currentUserRole === UserRole.ADMIN;

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("SIMPAN DITOLAK: Logo instansi harus berupa berkas gambar/foto (.png, .jpg, .jpeg)!");
      e.target.value = "";
      return;
    }

    setLogoFileName(file.name);
    setLogoFile(file);
  };

  // Submit main parameters
  const handleSubmitSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instNama.trim()) {
      alert("Nama Instansi wajib diisi!");
      return;
    }

    setIsSaving(true);
    try {
      let cloudinaryUrl = existingLogoUrl;
      let cloudinaryPublicId = settings?.logo_instansi_public_id || '';

      // If a new physical logo is uploaded
      if (logoFile) {
        // If there is an old photo on Cloudinary, delete it first
        if (settings?.logo_instansi_public_id) {
          try {
            await deleteFile(settings.logo_instansi_public_id);
          } catch (cloudinaryErr) {
            console.warn("Gagal menghapus logo instansi lama di Cloudinary:", cloudinaryErr);
          }
        }

        // Upload the new logo to Cloudinary with dynamic name based on instansi logo setting
        const originalExtension = logoFile.name.split('.').pop() || 'png';
        const customFileName = `logo_instansi.${originalExtension}`;
        const uploadRes = await uploadFile(logoFile, "sirekap", customFileName);
        cloudinaryUrl = uploadRes.secure_url;
        cloudinaryPublicId = uploadRes.public_id;
      }

      await onUpdateSettings({
        nama_instansi: instNama.trim(),
        logo_instansi: cloudinaryUrl,
        logo_instansi_public_id: cloudinaryPublicId,
        tahun_anggaran_aktif: fiscalYear,
        nama_pejabat_ttd: namaPejabatTtd.trim(),
        jabatan_pejabat_ttd: jabatanPejabatTtd.trim(),
        nip_pejabat_ttd: nipPejabatTtd.trim(),
        nama_bendahara: namaBendahara.trim(),
        jabatan_bendahara: jabatanBendahara.trim(),
        nip_bendahara: nipBendahara.trim()
      });

      // AuditTrail Log
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        "UPDATE SETTINGS PARAMETERS",
        "PENGATURAN",
        settings,
        {
          nama_instansi: instNama,
          logo_instansi: cloudinaryUrl ? 'TERLAMPIR_CDN' : 'KOSONG',
          logo_instansi_public_id: cloudinaryPublicId,
          tahun_anggaran_aktif: fiscalYear,
          nama_pejabat_ttd: namaPejabatTtd,
          jabatan_pejabat_ttd: jabatanPejabatTtd,
          nip_pejabat_ttd: nipPejabatTtd,
          nama_bendahara: namaBendahara,
          jabatan_bendahara: jabatanBendahara,
          nip_bendahara: nipBendahara
        }
      );

      alert("[NOTIFIKASI DATA BERUBAH]\nPengaturan Berhasil Disimpan & Sinkronisasi Sistem Berhasil! Audit log dicatat.");
    } catch (err) {
      alert("Gagal merubah parameter: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger whole database export to JSON
  const handleExportBackup = async () => {
    try {
      const dataObj = await backupDatabaseToJSON();
      const dataStr = JSON.stringify(dataObj, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `SIBIRU_BackUp_Database_TA2026_${new Date().toISOString().substring(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        "EXPORT BACKUP DATABASE",
        "DATABASE_BACK_RECOV",
        null,
        { status: 'SUCCESS' }
      );
    } catch (err) {
      alert("Gagal melakukan export backup: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Handle Restore file select loader
  const handleRestoreFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isConfirmed = window.confirm(`WARNING: Anda memilih file "${file.name}". Melakukan Restore database akan menduplikat atau menimpa koleksi sibiru_* yang ada. Apakah Anda ingin melanjutkan proses recovery ini?`);
    if (!isConfirmed) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const textStr = reader.result as string;
        setRestoreMessage("Sedang mengupload & memvalidasi skema data...");
        
        const backupObj = JSON.parse(textStr);
        await restoreDatabaseFromJSON(backupObj, currentUserEmail, currentUserRole);

        setRestoreMessage("✓ Database berhasil dipulihkan & Sinkronisasi sistem RKA selesai!");

        await createAuditLog(
          currentUserEmail,
          currentUserRole,
          "RESTORE DATABASE RECOVERY",
          "DATABASE_BACK_RECOV",
          null,
          { file_name: file.name, status: 'RESTORE_SUCCESS' }
        );

        // Soft reload to cascade state triggers
        setTimeout(() => {
          window.location.reload();
        }, 1500);

      } catch (err) {
        setRestoreMessage("❌ Gagal memulihkan database. Cek apakah format berkas JSON murni backup yang benar.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6" id="pengaturan-module-root">
      
      {/* Title */}
      <div className="flex items-center gap-1.5 p-4 bg-white rounded-xl border border-slate-100 shadow-sm" id="set-title-card">
        <Settings className="text-blue-800 animate-spin" size={22} />
        <div>
          <h2 className="text-xl font-bold text-slate-800">Administrasi & Backup Recovery</h2>
          <p className="text-xs text-slate-600">Atur parameter dinas instansi, kustomisasi logo pemkab, dan sinkronkan salinan basis data cadangan.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="set-content-grid">
        
        {/* Main Brand Settings */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-4" id="brand-settings-panel">
          <h4 className="text-xs font-bold text-slate-800 border-b border-dashed pb-2 flex items-center gap-1">
            <Building2 size={14} className="text-blue-800" />
            Parameter Instansi & Pemda Berjalan
          </h4>

          <form onSubmit={handleSubmitSettings} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Nama Instansi Dinas Pemerintahan</label>
              <textarea 
                value={instNama} 
                onChange={(e) => setInstNama(e.target.value)} 
                disabled={!canEdit}
                rows={2}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 disabled:bg-slate-100/50 outline-blue-600 focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Tahun Anggaran Aktif</label>
                <input 
                  type="number"
                  value={fiscalYear}
                  onChange={(e) => setFiscalYear(Number(e.target.value))}
                  disabled={!canEdit}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 disabled:bg-slate-100/50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Logo Instansi (Kop Surat)</label>
                <div className="flex items-center gap-2">
                  <div className="relative overflow-hidden bg-slate-50 border px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 flex items-center gap-1.5">
                    <Camera size={13} />
                    <span>Upload Logo</span>
                    <input 
                      type="file" 
                      accept="image/*"
                      disabled={!canEdit || isSaving}
                      onChange={handleLogoUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Pejabat Penandatangan Inputs */}
            <div className="border-t border-slate-200/60 pt-3 mt-3 space-y-3">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-blue-800">Spesimen Pejabat Penandatangan Dokumen</span>
              
              <div>
                <label className="block text-slate-700 font-bold mb-1">Nama Lengkap Pejabat</label>
                <input 
                  type="text"
                  placeholder="e.g. Drs. H. Budiansani, M.Si"
                  value={namaPejabatTtd}
                  onChange={(e) => setNamaPejabatTtd(e.target.value)}
                  disabled={!canEdit || isSaving}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 disabled:bg-slate-100/50 outline-blue-600 focus:bg-white text-slate-900 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Jabatan Resmi</label>
                  <input 
                    type="text"
                    placeholder="e.g. Kepala Bidang Sektor Pertanahan"
                    value={jabatanPejabatTtd}
                    onChange={(e) => setJabatanPejabatTtd(e.target.value)}
                    disabled={!canEdit || isSaving}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 disabled:bg-slate-100/50 outline-blue-600 focus:bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">NIP Pejabat</label>
                  <input 
                    type="text"
                    placeholder="e.g. 19780512 200501 1 002"
                    value={nipPejabatTtd}
                    onChange={(e) => setNipPejabatTtd(e.target.value)}
                    disabled={!canEdit || isSaving}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 disabled:bg-slate-100/50 outline-blue-600 focus:bg-white text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Spesimen Bendahara Pengeluaran */}
            <div className="border-t border-slate-200/60 pt-3 mt-3 space-y-3">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-orange-600 block">Spesimen Bendahara Pengeluaran</span>
              
              <div>
                <label className="block text-slate-700 font-bold mb-1">Nama Lengkap Bendahara</label>
                <input 
                  type="text"
                  placeholder="e.g. Rohana, S.E."
                  value={namaBendahara}
                  onChange={(e) => setNamaBendahara(e.target.value)}
                  disabled={!canEdit || isSaving}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 disabled:bg-slate-100/50 outline-blue-600 focus:bg-white text-slate-900 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Jabatan Bendahara</label>
                  <input 
                    type="text"
                    placeholder="e.g. Bendahara Pengeluaran"
                    value={jabatanBendahara}
                    onChange={(e) => setJabatanBendahara(e.target.value)}
                    disabled={!canEdit || isSaving}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 disabled:bg-slate-100/50 outline-blue-600 focus:bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">NIP Bendahara</label>
                  <input 
                    type="text"
                    placeholder="e.g. 19850614 201101 2 004"
                    value={nipBendahara}
                    onChange={(e) => setNipBendahara(e.target.value)}
                    disabled={!canEdit || isSaving}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 disabled:bg-slate-100/50 outline-blue-600 focus:bg-white text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Logo Preview box */}
            {(logoFile || existingLogoUrl) && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-3">
                <img src={logoFile ? URL.createObjectURL(logoFile) : existingLogoUrl} alt="Preview_Logo" className="w-12 h-12 object-contain bg-white p-1 rounded" referrerPolicy="no-referrer" />
                <div>
                  <p className="font-bold text-slate-850">Preview Logo Terlampir</p>
                  <p className="text-[10px] text-slate-400 font-semibold font-mono">Penyimpanan: Cloudinary Secure CDN</p>
                </div>
              </div>
            )}

            {canEdit && (
              <div className="pt-2 text-right border-t">
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-5 py-2 text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 disabled:cursor-not-allowed font-bold shadow-sm rounded-lg flex items-center gap-1.5 ml-auto"
                >
                  {isSaving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Menyimak...
                    </>
                  ) : (
                    "Simpan Kustomisasi Brand"
                  )}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Database Disaster Backup & Recovery Panel */}
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-4" id="db-recoveries">
          <h4 className="text-xs font-bold text-slate-800 border-b border-dashed pb-2 flex items-center gap-1.5">
            <Database size={14} className="text-emerald-800" />
            Database Backup & Recovery Control (JSON)
          </h4>

          <div className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-950 rounded-lg flex flex-col justify-between">
              <div>
                <p className="font-black flex items-center gap-1 text-emerald-900">
                  <Download size={14} />
                  Satu Tombol Pencadangan (Full Export)
                </p>
                <p className="text-[11px] text-emerald-800 mt-1">Mengunduh seluruh isi koleksi <b>sibiru_program, sibiru_kegiatan, sibiru_sub_kegiatan, sibiru_rka</b> dan <b>realisasi</b> dalam bentuk berkas tunggal JSON ramah-ke-disk lokal.</p>
              </div>
              <button 
                onClick={handleExportBackup}
                className="mt-4 px-4 py-2 bg-emerald-800 hover:bg-emerald-950 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5 self-start"
              >
                <Download size={14} />
                Ekspor Semua Basis Data (JSON)
              </button>
            </div>

            {/* Database Restore Action Box */}
            {canEdit ? (
              <div className="p-4 bg-orange-50 border border-orange-100 text-orange-950 rounded-lg">
                <p className="font-black flex items-center gap-1 text-orange-950">
                  <Upload size={14} />
                  Pemulihan Basis Data (Restore Recovery)
                </p>
                <p className="text-[11px] text-orange-800 mt-1">Pilih file JSON hasil backup sebelumnya untuk memulihkan seluruh struktur data belanja satker pertanahan Bima.</p>
                
                <div className="mt-4 relative overflow-hidden bg-white hover:bg-orange-100/50 border border-orange-200 px-4 py-2 rounded-lg cursor-pointer flex items-center justify-center gap-1.5 font-bold self-start max-w-xs transition">
                  <Database size={13} className="text-orange-900" />
                  <span>Pilih File Backup (.json)</span>
                  <input 
                    type="file" 
                    accept=".json"
                    onChange={handleRestoreFileSelected}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>

                {restoreMessage && (
                  <p className="mt-2 text-[10px] font-mono font-bold text-orange-950 uppercase">{restoreMessage}</p>
                )}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-lg border text-slate-500 font-bold flex items-center gap-1">
                <Crown size={14} className="text-amber-600 animate-pulse" />
                Hanya Administrator yang memiliki akses Disaster Recovery Pemulihan Database.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
