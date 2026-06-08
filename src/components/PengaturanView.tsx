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
  Crown,
  Users,
  Trash2,
  Edit2,
  UserPlus,
  Shield,
  Eye,
  EyeOff,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import { AppSettings, UserRole, Pengguna } from '../types';
import { backupDatabaseToJSON, restoreDatabaseFromJSON, createAuditLog } from '../dbService';
import { uploadFile, deleteFile } from '../cloudinaryService';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

interface PengaturanViewProps {
  settings: AppSettings | null;
  currentUserRole: UserRole;
  currentUserEmail: string;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  penggunas?: Pengguna[];
}

export default function PengaturanView({
  settings,
  currentUserRole,
  currentUserEmail,
  onUpdateSettings,
  penggunas = []
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

  // User Management Board state controllers
  const [emailState, setEmailState] = useState('');
  const [namaState, setNamaState] = useState('');
  const [passwordState, setPasswordState] = useState('');
  const [roleState, setRoleState] = useState<UserRole>(UserRole.OPERATOR);
  const [aktifState, setAktifState] = useState(true);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userSearchText, setUserSearchText] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [userActionSuccess, setUserActionSuccess] = useState<string | null>(null);
  const [userActionError, setUserActionError] = useState<string | null>(null);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      link.download = `SIREKAP_TANAH_BackUp_Database_TA2026_${new Date().toISOString().substring(0,10)}.json`;
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

    const isConfirmed = window.confirm(`WARNING: Anda memilih file "${file.name}". Melakukan Restore database akan menduplikat atau menimpa data SIREKAP TANAH yang ada. Apakah Anda ingin melanjutkan proses recovery ini?`);
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

  // Save or edit user profile to Firestore
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserActionSuccess(null);
    setUserActionError(null);

    const emailClean = emailState.trim().toLowerCase();
    if (!emailClean) {
      setUserActionError("Nama Akun / Alamat Surel wajib diisi!");
      return;
    }
    if (!namaState.trim()) {
      setUserActionError("Nama Lengkap/Nama Akun wajib diisi!");
      return;
    }
    if (!passwordState.trim()) {
      setUserActionError("Kata Sandi/Password wajib diisi!");
      return;
    }

    setIsSubmittingUser(true);
    try {
      const userPayload: any = {
        id: emailClean,
        email: emailClean,
        nama: namaState.trim(),
        role: roleState,
        aktif: aktifState,
        password: passwordState.trim()
      };

      await setDoc(doc(db, "sibiru_pengguna", emailClean), userPayload, { merge: true });
      
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        editingUserId ? "EDIT AKUN PENGGUNA" : "TAMBAH AKUN PENGGUNA",
        "MANAJEMEN_AKUN",
        editingUserId ? { id: editingUserId } : null,
        { email: emailClean, role: roleState, nama: namaState.trim(), aktif: aktifState }
      );

      setUserActionSuccess(`Akun "${emailClean}" berhasil ${editingUserId ? 'diperbarui' : 'disimpan'} di Firestore!`);
      
      // Reset State
      setEmailState('');
      setNamaState('');
      setPasswordState('');
      setRoleState(UserRole.OPERATOR);
      setAktifState(true);
      setEditingUserId(null);
    } catch (err) {
      setUserActionError("Gagal menyimpan akun: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmittingUser(false);
    }
  };

  // Set selected user details to form fields for editing
  const handleEditUserClick = (targetUser: Pengguna) => {
    setUserActionSuccess(null);
    setUserActionError(null);
    setEditingUserId(targetUser.id);
    setEmailState(targetUser.email);
    setNamaState(targetUser.nama);
    setPasswordState(targetUser.password || 'bima2026');
    setRoleState(targetUser.role);
    setAktifState(targetUser.aktif);
  };

  // Perform Firestore user document deletion
  const handleDeleteUser = async (emailToDelete: string) => {
    if (emailToDelete.toLowerCase() === currentUserEmail.toLowerCase()) {
      alert("TINDAKAN DITOLAK: Anda sedang masuk dengan akun ini dan tidak dapat menghapusnya!");
      return;
    }

    const isConfirmed = window.confirm(`Apakah Anda yakin ingin menghapus akun "${emailToDelete}" secara permanen dari Firestore?`);
    if (!isConfirmed) return;

    setUserActionSuccess(null);
    setUserActionError(null);

    try {
      await deleteDoc(doc(db, "sibiru_pengguna", emailToDelete));
      
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        "HAPUS AKUN PENGGUNA",
        "MANAJEMEN_AKUN",
        { id: emailToDelete },
        { status: 'DELETED' }
      );

      setUserActionSuccess(`Akun "${emailToDelete}" berhasil dihapus secara permanen dari sistem.`);
    } catch (err) {
      setUserActionError("Gagal menghapus akun: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Search/Filter matching users from real-time data
  const filteredUsers = useMemo(() => {
    let list = penggunas;
    const searchLower = userSearchText.trim().toLowerCase();
    
    if (searchLower) {
      list = list.filter(u => 
        u.email.toLowerCase().includes(searchLower) || 
        u.nama.toLowerCase().includes(searchLower)
      );
    }
    
    if (userRoleFilter && userRoleFilter !== 'ALL') {
      list = list.filter(u => u.role === userRoleFilter);
    }
    
    return list;
  }, [penggunas, userSearchText, userRoleFilter]);

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
                  placeholder="cth: Nama Lengkap, ST"
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
                    placeholder="cth: Kepala Bidang Pertanahan"
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
                    placeholder="cth: 19780512 200501 1 002"
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
                  placeholder="cth: Nama Lengkap, S.E."
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
                    placeholder="cth: Bendahara Pengeluaran"
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
                    placeholder="cth: 19850614 201101 2 004"
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
                <p className="text-[11px] text-emerald-800 mt-1">Mengunduh seluruh isi data sistem <b>SIREKAP TANAH</b> (koleksi program, kegiatan, rka, dan realisasi) dalam bentuk berkas tunggal JSON ramah-ke-disk lokal.</p>
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

      {/* Kelola Akun Pengguna Panel */}
      <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm space-y-5" id="user-management-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-dashed pb-3">
          <div className="flex items-center gap-2">
            <Users className="text-blue-800 animate-pulse" size={20} />
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Kelola Akun Pengguna (Sistem Log-In)</h3>
              <p className="text-[11px] text-slate-500">Daftar otorisasi peran pengguna (Admin, Operator, Pimpinan). Semua data tersimpan di Firestore dan disinkronkan.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 mt-3 md:mt-0 text-xs">
            {/* Search Input */}
            <input 
              type="text"
              placeholder="Cari email / nama..."
              value={userSearchText}
              onChange={(e) => setUserSearchText(e.target.value)}
              className="p-1.5 px-3 border border-slate-200 rounded-lg outline-blue-600 focus:bg-white text-slate-900 bg-slate-50 font-semibold max-w-xs"
            />
            {/* Role filter */}
            <select
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
              className="p-1.5 border border-slate-200 rounded-lg outline-blue-600 bg-white font-bold"
            >
              <option value="ALL">Semua Peran</option>
              <option value={UserRole.ADMIN}>Administrator</option>
              <option value={UserRole.OPERATOR}>Operator</option>
              <option value={UserRole.PIMPINAN}>Pimpinan</option>
            </select>
          </div>
        </div>

        {/* Notifications and Alerts */}
        {userActionSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-lg text-xs font-bold flex items-center gap-2 animate-fade-in">
            <CheckCircle size={16} className="text-emerald-700" />
            <span>{userActionSuccess}</span>
          </div>
        )}

        {userActionError && (
          <div className="p-3 bg-red-50 border border-red-100 text-red-900 rounded-lg text-xs font-bold flex items-center gap-2 animate-fade-in">
            <AlertCircle size={16} className="text-red-700" />
            <span>{userActionError}</span>
          </div>
        )}

        {/* Dynamic Inner Layout split between Add/Edit form and Table */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Add / Edit Form Panel */}
          <div className="bg-slate-50/75 border border-slate-100 rounded-xl p-4 text-xs space-y-3.5">
            <span className="font-extrabold uppercase tracking-widest text-[10px] text-blue-800 block border-b pb-1">
              {editingUserId ? "🖋️ Edit Parameter Akun" : "➕ Tambah Akun Baru"}
            </span>

            <form onSubmit={handleSaveUser} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-extrabold mb-1">Nama Akun / Surel (ID Wajib)</label>
                <input 
                  type="email"
                  placeholder="name@sirekap.com"
                  disabled={!!editingUserId} // Account email cannot be edited after creation
                  value={emailState}
                  onChange={(e) => setEmailState(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-blue-600 font-bold text-slate-900 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-extrabold mb-1">Nama Anggota / Deskripsi Akun (Bebas)</label>
                <input 
                  type="text"
                  placeholder="cth: Nama"
                  value={namaState}
                  onChange={(e) => setNamaState(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-blue-600 font-bold text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-extrabold mb-1">Kata Sandi / Password</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimal 6 karakter"
                    value={passwordState}
                    onChange={(e) => setPasswordState(e.target.value)}
                    className="w-full p-2 pr-8 border border-slate-200 rounded-lg bg-white outline-blue-600 font-mono text-slate-900"
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-extrabold mb-1">Hak Akses / Peran Sistem (Role)</label>
                <select
                  value={roleState}
                  onChange={(e) => setRoleState(e.target.value as UserRole)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-blue-600 font-bold text-slate-900"
                >
                  <option value={UserRole.ADMIN}>Administrator (Akses Penuh)</option>
                  <option value={UserRole.OPERATOR}>Operator (Membuat Realisasi & RKA)</option>
                  <option value={UserRole.PIMPINAN}>Pimpinan (Melihat Laporan & Analisis)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-extrabold mb-1">Status Keaktifan Akun</label>
                <div className="flex items-center gap-4 mt-1">
                  <label className="inline-flex items-center">
                    <input 
                      type="radio"
                      checked={aktifState === true}
                      onChange={() => setAktifState(true)}
                      className="text-blue-600 focus:ring-blue-500 h-4 w-4 border-slate-350"
                    />
                    <span className="ml-1.5 font-bold text-emerald-700">Aktif (Diberi Izin)</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input 
                      type="radio"
                      checked={aktifState === false}
                      onChange={() => setAktifState(false)}
                      className="text-blue-600 focus:ring-blue-500 h-4 w-4 border-slate-350"
                    />
                    <span className="ml-1.5 font-bold text-red-600">Nonaktif</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="w-full py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-extrabold rounded-lg shadow-sm uppercase tracking-wide cursor-pointer"
                >
                  {isSubmittingUser ? "Menyimpan..." : editingUserId ? "Simpan Perubahan" : "Daftarkan Akun"}
                </button>
                
                {editingUserId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUserId(null);
                      setEmailState('');
                      setNamaState('');
                      setPasswordState('');
                      setRoleState(UserRole.OPERATOR);
                      setAktifState(true);
                      setUserActionSuccess(null);
                      setUserActionError(null);
                    }}
                    className="py-2 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer"
                  >
                    Batal
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Accounts Table List */}
          <div className="lg:col-span-2 overflow-x-auto text-[11px]">
            <table className="min-w-full divide-y divide-slate-150 border border-slate-100 rounded-lg overflow-hidden">
              <thead className="bg-slate-50 text-slate-750 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Nama Akun / Surel</th>
                  <th className="px-3 py-2 text-left">Nama Anggota/Karyawan</th>
                  <th className="px-3 py-2 text-left">Password</th>
                  <th className="px-3 py-2 text-left">Hak Akses (Role)</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100 font-semibold text-slate-800">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-450 italic font-medium">
                      {penggunas.length === 0 ? "Menghubungkan ke database Firestore..." : "Tidak ada akun pengguna yang cocok dengan kriteria filter."}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-2 font-mono text-blue-700">{item.email}</td>
                      <td className="px-3 py-2 text-slate-900 font-bold max-w-[150px] truncate" title={item.nama}>{item.nama}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{item.password || <span className="text-[10px] italic text-slate-400">bima2026 (Default)</span>}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                          item.role === UserRole.ADMIN ? 'bg-amber-100 text-amber-900' : 
                          item.role === UserRole.OPERATOR ? 'bg-indigo-100 text-indigo-900' : 
                          'bg-sky-100 text-sky-800'
                        }`}>
                          <Shield size={10} />
                          {item.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          item.aktif !== false ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'
                        }`}>
                          <UserCheck size={10} />
                          {item.aktif !== false ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button 
                            onClick={() => handleEditUserClick(item)}
                            title="Edit Akun"
                            className="p-1 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-950 rounded transition-colors cursor-pointer"
                          >
                            <Edit2 size={13} />
                          </button>
                          
                          <button 
                            onClick={() => handleDeleteUser(item.id)}
                            title="Hapus Akun Permanen"
                            className="p-1 text-red-700 hover:bg-red-50 hover:text-red-950 rounded transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            
            <p className="text-[9px] text-slate-400 mt-2 font-black uppercase tracking-wide">
              * Perubahan status keaktifan/peran pengguna akan langsung mengubah hak akses log-in secara real-time pada Firestore.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}
