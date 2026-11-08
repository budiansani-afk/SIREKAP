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
  AlertCircle,
  HardDrive,
  RefreshCw,
  FolderCheck,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Clock,
  PowerOff,
  Activity
} from 'lucide-react';
import { AppSettings, UserRole, Pengguna, SesiPenggunaOnline } from '../types';
import { backupDatabaseToJSON, restoreDatabaseFromJSON, createAuditLog } from '../dbService';
import { 
  uploadFileToFirebaseStorage, 
  deleteFileFromFirebaseStorage, 
  isFirebaseStorageUrl 
} from '../firebaseStorageService';
import { runFirebaseStorageMigration, MigrationProgressData } from '../migrationStorageService';
import { formatDuration, formatWaktuMasuk } from '../utils/deviceHelper';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

interface PengaturanViewProps {
  settings: AppSettings | null;
  currentUserRole: UserRole;
  currentUserEmail: string;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  penggunas?: Pengguna[];
  onlineSessions?: SesiPenggunaOnline[];
  currentSessionId?: string;
  onDisconnectSession?: (sessionId: string, targetEmail: string, targetName: string) => Promise<void>;
  onOpenOnlineSessionsModal?: () => void;
}

export default function PengaturanView({
  settings,
  currentUserRole,
  currentUserEmail,
  onUpdateSettings,
  penggunas = [],
  onlineSessions = [],
  currentSessionId = '',
  onDisconnectSession,
  onOpenOnlineSessionsModal
}: PengaturanViewProps) {
  const [now, setNow] = useState<number>(Date.now());
  const [sessionSearchText, setSessionSearchText] = useState('');
  const [disconnectingSessionId, setDisconnectingSessionId] = useState<string | null>(null);

  // Live duration ticker
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeOnlineSessions = useMemo(() => {
    return onlineSessions.filter(s => {
      if (s.status === 'force_disconnected' || s.status === 'logged_out') return false;
      return (now - (s.last_active || 0)) < 60000;
    });
  }, [onlineSessions, now]);

  const [sessionSortOrder, setSessionSortOrder] = useState<'desc' | 'asc'>('desc');

  const filteredOnlineSessions = useMemo(() => {
    const q = sessionSearchText.toLowerCase().trim();
    let list = activeOnlineSessions;
    if (q) {
      list = activeOnlineSessions.filter(s => 
        s.email.toLowerCase().includes(q) ||
        (s.nama && s.nama.toLowerCase().includes(q)) ||
        (s.device && s.device.toLowerCase().includes(q)) ||
        (s.ip_address && s.ip_address.toLowerCase().includes(q))
      );
    }
    // Susunan akun dalam daftar monitoring akun berdasarkan waktu masuk
    return [...list].sort((a, b) => {
      const timeA = a.login_at || 0;
      const timeB = b.login_at || 0;
      return sessionSortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [activeOnlineSessions, sessionSearchText, sessionSortOrder]);

  const handleDisconnectFromPengaturan = async (session: SesiPenggunaOnline) => {
    if (session.id === currentSessionId) {
      alert("PERINGATAN: Anda tidak dapat memutuskan sesi Anda sendiri dari panel ini.");
      return;
    }
    const confirmMsg = `PUTUSKAN KONEKSI PENGGUNA:\n\n` +
      `Nama Pengguna: ${session.nama || session.email}\n` +
      `Perangkat: ${session.device}\n` +
      `Alamat IP: ${session.ip_address}\n` +
      `Waktu Masuk: ${formatWaktuMasuk(session.login_at)}\n\n` +
      `Apakah Anda yakin ingin memutuskan koneksi pengguna ini sekarang? Pengguna akan otomatis dikeluarkan dari aplikasi.`;

    if (!window.confirm(confirmMsg)) return;

    if (onDisconnectSession) {
      setDisconnectingSessionId(session.id);
      try {
        await onDisconnectSession(session.id, session.email, session.nama);
      } finally {
        setDisconnectingSessionId(null);
      }
    }
  };
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
      setExistingLogoUrl(settings.logo_instansi || 'https://firebasestorage.googleapis.com/v0/b/bidang-pertanahan.firebasestorage.app/o/bimatanahku%2Flogo%20kab.png?alt=media&token=678421d5-13c6-44d5-9e9e-82283be5e25f');
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

  // Firebase Storage Migration state
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgressData | null>(null);
  const [migrationStatusLog, setMigrationStatusLog] = useState<string[]>([]);

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
      let finalLogoUrl = existingLogoUrl;
      let finalStoragePath = settings?.logo_instansi_storage_path || '';

      // If a new physical logo is uploaded
      if (logoFile) {
        // If there is an old photo on Firebase Storage, clean it up
        if (settings?.logo_instansi_storage_path || (settings?.logo_instansi && isFirebaseStorageUrl(settings.logo_instansi))) {
          try {
            await deleteFileFromFirebaseStorage(settings.logo_instansi_storage_path || settings.logo_instansi);
          } catch (delErr) {
            console.warn("Gagal menghapus logo instansi lama di Firebase Storage:", delErr);
          }
        }

        // Upload new logo to Firebase Storage under sirekap/pengaturan/logo/
        const originalExtension = logoFile.name.split('.').pop() || 'png';
        const customFileName = `logo_instansi_${Date.now()}.${originalExtension}`;
        const targetPath = `sirekap/pengaturan/logo/${customFileName}`;
        const uploadRes = await uploadFileToFirebaseStorage(logoFile, targetPath);
        finalLogoUrl = uploadRes.downloadUrl;
        finalStoragePath = uploadRes.storagePath;
      }

      await onUpdateSettings({
        nama_instansi: instNama.trim(),
        logo_instansi: finalLogoUrl,
        logo_instansi_storage_path: finalStoragePath,
        logo_instansi_public_id: '',
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
          logo_instansi: finalLogoUrl ? 'TERLAMPIR_FIREBASE_STORAGE' : 'KOSONG',
          logo_instansi_storage_path: finalStoragePath,
          tahun_anggaran_aktif: fiscalYear,
          nama_pejabat_ttd: namaPejabatTtd,
          jabatan_pejabat_ttd: jabatanPejabatTtd,
          nip_pejabat_ttd: nipPejabatTtd,
          nama_bendahara: namaBendahara,
          jabatan_bendahara: jabatanBendahara,
          nip_bendahara: nipBendahara
        }
      );

      alert("[NOTIFIKASI DATA BERUBAH]\nPengaturan Berhasil Disimpan ke Firebase Storage & Sinkronisasi Sistem Berhasil! Audit log dicatat.");
    } catch (err) {
      alert("Gagal merubah parameter: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  // Run on-demand Firebase Storage Migration and verification
  const handleRunMigration = async () => {
    const isConfirmed = window.confirm(
      "Apakah Anda ingin memulai sinkronisasi & verifikasi pemindahan semua foto/berkas ke storage bidang-pertanahan.firebasestorage.app/sirekap?\n\nProses ini akan memeriksa seluruh berkas di database (Realisasi, Belanja Pihak Ketiga, Dokumen, dan Pengaturan Logo) dan memindahkannya ke hierarki folder Firebase Storage."
    );
    if (!isConfirmed) return;

    setIsMigrating(true);
    setMigrationStatusLog([]);
    try {
      const res = await runFirebaseStorageMigration((prog) => {
        setMigrationProgress({ ...prog });
        setMigrationStatusLog(prev => {
          const next = [...prev, `[${prog.currentCollection}] ${prog.log}`];
          return next.slice(-10);
        });
      });

      alert(
        `[MIGRASI FIREBASE STORAGE SELESAI]\n` +
        `Total Berkas Diperiksa: ${res.totalFiles}\n` +
        `Berhasil Dipindahkan: ${res.migratedCount}\n` +
        `Sudah di Firebase Storage: ${res.alreadyFirebaseCount}\n` +
        `Gagal: ${res.failedCount}`
      );
    } catch (err: any) {
      alert("Gagal menjalankan migrasi: " + (err?.message || String(err)));
    } finally {
      setIsMigrating(false);
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
      setUserActionError("Nama Akun wajib diisi!");
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
      // Jika admin mengedit dan mengubah email ID dari dokumen lama
      if (editingUserId && editingUserId.toLowerCase() !== emailClean) {
        await deleteDoc(doc(db, "sibiru_pengguna", editingUserId.toLowerCase())).catch(() => {});
      }

      const userPayload: any = {
        id: emailClean,
        email: emailClean,
        nama: namaState.trim(),
        role: roleState,
        aktif: aktifState,
        password: passwordState.trim()
      };

      await setDoc(doc(db, "sibiru_pengguna", emailClean), userPayload, { merge: true });

      // Sinkronisasi cache nama akun lokal untuk auto-fill di menu login
      try {
        const cached = JSON.parse(localStorage.getItem('sibiru_user_names_cache') || '{}');
        if (editingUserId && editingUserId.toLowerCase() !== emailClean) {
          delete cached[editingUserId.toLowerCase()];
        }
        cached[emailClean] = namaState.trim();
        localStorage.setItem('sibiru_user_names_cache', JSON.stringify(cached));
      } catch (e) {}
      
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        editingUserId ? "EDIT SEMUA PARAMETER AKUN PENGGUNA" : "TAMBAH AKUN PENGGUNA",
        "MANAJEMEN_AKUN",
        editingUserId ? { id: editingUserId } : null,
        { email: emailClean, role: roleState, nama: namaState.trim(), aktif: aktifState }
      );

      setUserActionSuccess(`Akun "${emailClean}" berhasil ${editingUserId ? 'diperbarui semua parameternya' : 'disimpan'} di sistem!`);
      
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
                  <p className="text-[10px] text-blue-700 font-semibold font-mono">Penyimpanan: Firebase Storage (bidang-pertanahan.firebasestorage.app)</p>
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
                      Menyimpan...
                    </>
                  ) : (
                    "Simpan Kustomisasi Brand"
                  )}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Right Column: Database Backup & Firebase Storage Management */}
        <div className="space-y-6">
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

          {/* Firebase Storage Management Panel */}
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm space-y-4" id="firebase-storage-panel">
            <h4 className="text-xs font-bold text-slate-800 border-b border-dashed pb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <HardDrive size={14} className="text-blue-700" />
                Penyimpanan Berkas (Firebase Storage Cloud)
              </span>
              <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-mono font-semibold">
                bidang-pertanahan.firebasestorage.app
              </span>
            </h4>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-blue-50/70 border border-blue-100 text-slate-800 rounded-lg space-y-2">
                <p className="font-bold text-blue-950 flex items-center gap-1.5">
                  <FolderCheck size={14} className="text-blue-700" />
                  Struktur Hierarki Folder Berkas:
                </p>
                <div className="font-mono text-[11px] bg-white p-2.5 rounded border border-blue-100 text-slate-700 space-y-1">
                  <div className="text-blue-900 font-bold">sirekap/{'{tahun}'}/{'{program}'}/{'{kegiatan}'}/{'{subkegiatan}'}/{'{jenis_belanja}'}/</div>
                  <div className="text-slate-500 text-[10px] pl-3">↳ Bukti SP2D Realisasi & Foto Belanja Pihak Ketiga</div>
                  <div className="text-blue-900 font-bold mt-1">sirekap/{'{tahun}'}/dokumen/{'{kategori}'}/</div>
                  <div className="text-slate-500 text-[10px] pl-3">↳ Arsip Dokumen Pendukung & Laporan</div>
                  <div className="text-blue-900 font-bold mt-1">sirekap/pengaturan/logo/</div>
                  <div className="text-slate-500 text-[10px] pl-3">↳ Logo Resmi Instansi Pemda</div>
                </div>
              </div>

              {/* Migration Status & Execution */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900">Sinkronisasi & Verifikasi Storage</p>
                    <p className="text-[11px] text-slate-600">Pindahkan & pastikan semua foto/berkas di database tersimpan pada Firebase Storage.</p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleRunMigration}
                      disabled={isMigrating}
                      className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition whitespace-nowrap text-xs"
                    >
                      <RefreshCw size={13} className={isMigrating ? "animate-spin" : ""} />
                      {isMigrating ? "Memindahkan..." : "Sinkronkan Sekarang"}
                    </button>
                  )}
                </div>

                {/* Progress bar if migrating */}
                {isMigrating && migrationProgress && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-blue-700 capitalize">Koleksi: {migrationProgress.currentCollection}</span>
                      <span className="text-slate-600">{migrationProgress.completedCount} / {migrationProgress.totalCount}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.round((migrationProgress.completedCount / (migrationProgress.totalCount || 1)) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] font-mono text-slate-500 truncate">{migrationProgress.log}</p>
                  </div>
                )}

                {/* Status messages stream */}
                {migrationStatusLog.length > 0 && (
                  <div className="bg-slate-900 text-emerald-400 p-2 rounded text-[10px] font-mono space-y-0.5 max-h-24 overflow-y-auto">
                    {migrationStatusLog.map((logMsg, idx) => (
                      <div key={idx} className="truncate">{logMsg}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
                <label className="block text-slate-700 font-extrabold mb-1">Nama Akun (Bebas / Tidak Wajib Email)</label>
                <input 
                  type="text"
                  placeholder="Cth: admin, operator1, atau surel"
                  value={emailState}
                  onChange={(e) => setEmailState(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-white outline-blue-600 font-bold text-slate-900"
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
                  <th className="px-3 py-2 text-left">Nama Akun</th>
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

      {/* Sesi Pengguna Sedang Masuk & Online (Kontrol Akses) Panel */}
      <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm space-y-5" id="online-sessions-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-dashed pb-3 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
              <Activity className="animate-pulse" size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Sesi Pengguna Sedang Masuk & Online (Kontrol Akses)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  {activeOnlineSessions.length} Akun Online
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Administrator dapat melihat nama akun, perangkat, alamat IP, waktu masuk, lama durasi aktif, dan berwenang memutuskan koneksi secara seketika.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs">
            <input 
              type="text"
              placeholder="Cari akun, perangkat, atau IP..."
              value={sessionSearchText}
              onChange={(e) => setSessionSearchText(e.target.value)}
              className="p-1.5 px-3 border border-slate-200 rounded-lg outline-blue-600 focus:bg-white text-slate-900 bg-slate-50 font-semibold max-w-xs"
            />
            {onOpenOnlineSessionsModal && (
              <button
                type="button"
                onClick={onOpenOnlineSessionsModal}
                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg shadow-3xs flex items-center gap-1.5 transition text-xs shrink-0 cursor-pointer"
              >
                <Users size={13} />
                Buka Layar Penuh
              </button>
            )}
          </div>
        </div>

        {/* Sessions Table */}
        <div className="overflow-x-auto text-[11px] border border-slate-200 rounded-xl shadow-3xs">
          <table className="min-w-full divide-y divide-slate-150">
            <thead className="bg-slate-50 text-slate-700 font-extrabold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3.5 py-2.5 text-left">Akun & Pengguna</th>
                <th className="px-3.5 py-2.5 text-left">Perangkat & Browser</th>
                <th className="px-3.5 py-2.5 text-left">Alamat IP</th>
                <th 
                  onClick={() => setSessionSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                  className="px-3.5 py-2.5 text-left cursor-pointer hover:bg-slate-200 transition-colors select-none"
                  title="Klik untuk membalikkan urutan waktu masuk"
                >
                  <div className="flex items-center gap-1.5 text-blue-900">
                    <span>Waktu Masuk</span>
                    <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.2 rounded font-mono font-bold">
                      {sessionSortOrder === 'desc' ? 'Terbaru ↓' : 'Terlama ↑'}
                    </span>
                  </div>
                </th>
                <th className="px-3.5 py-2.5 text-left">Lama Durasi</th>
                <th className="px-3.5 py-2.5 text-center">Status</th>
                <th className="px-3.5 py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100 font-semibold text-slate-800">
              {filteredOnlineSessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 italic">
                    Tidak ada sesi pengguna online yang ditemukan saat ini.
                  </td>
                </tr>
              ) : (
                filteredOnlineSessions.map((session) => {
                  const isCurrent = session.id === currentSessionId;
                  const isDisconnecting = disconnectingSessionId === session.id;
                  const isIdle = (now - (session.last_active || 0)) > 30000;

                  return (
                    <tr 
                      key={session.id} 
                      className={`hover:bg-blue-50/30 transition-colors ${isCurrent ? 'bg-blue-50/20' : ''}`}
                    >
                      {/* Akun & Pengguna */}
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 ${
                            session.role === UserRole.ADMIN 
                              ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                              : session.role === UserRole.PIMPINAN 
                              ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                              : 'bg-blue-100 text-blue-700 border border-blue-200'
                          }`}>
                            {(session.nama || session.email).substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900">{session.nama || session.email}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  Sesi Anda
                                </span>
                              )}
                            </div>
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              {session.role}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Perangkat & Browser */}
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          {session.device_type === 'mobile' ? (
                            <Smartphone size={14} className="text-orange-600 shrink-0" />
                          ) : session.device_type === 'tablet' ? (
                            <Tablet size={14} className="text-purple-600 shrink-0" />
                          ) : (
                            <Monitor size={14} className="text-blue-600 shrink-0" />
                          )}
                          <span>{session.os || 'Perangkat'}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium block">
                          {session.browser || 'Browser'}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono block truncate max-w-[200px]" title={session.device}>
                          {session.device}
                        </span>
                      </td>

                      {/* Alamat IP */}
                      <td className="px-3.5 py-2.5 font-mono">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 font-bold text-[10px]">
                          <Globe size={10} className="text-slate-500" />
                          {session.ip_address || '127.0.0.1'}
                        </span>
                      </td>

                      {/* Waktu Masuk */}
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1 text-slate-700">
                          <Clock size={12} className="text-slate-400 shrink-0" />
                          <span className="text-[10px] font-semibold">{formatWaktuMasuk(session.login_at)}</span>
                        </div>
                      </td>

                      {/* Lama Durasi Masuk (Live ticking) */}
                      <td className="px-3.5 py-2.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 font-mono font-bold text-[10px]">
                          <Activity size={10} className="text-blue-600 animate-pulse" />
                          {formatDuration(session.login_at, now)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3.5 py-2.5 text-center">
                        {isIdle ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Idle
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                            Online
                          </span>
                        )}
                      </td>

                      {/* Aksi: Putuskan Koneksi */}
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        {canEdit ? (
                          isCurrent ? (
                            <span className="text-[10px] text-slate-400 italic">
                              Sesi Anda
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDisconnectFromPengaturan(session)}
                              disabled={isDisconnecting}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-bold rounded-lg shadow-3xs flex items-center gap-1 ml-auto text-[10px] transition cursor-pointer"
                              title="Putuskan koneksi akun ini"
                            >
                              <PowerOff size={11} className={isDisconnecting ? 'animate-spin' : ''} />
                              {isDisconnecting ? "Memutuskan..." : "Putuskan Koneksi"}
                            </button>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-400">Hanya Admin</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
