import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc,
  getDoc
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  LayoutDashboard, 
  FileSpreadsheet, 
  TrendingUp, 
  Activity, 
  FolderCheck, 
  FileText, 
  Sparkles, 
  ShieldAlert, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  User, 
  Lock, 
  Layers,
  Building,
  RotateCcw,
  AlertCircle
} from 'lucide-react';
import { auth, db } from './firebase';
import { 
  COLL_PROGRAM, 
  COLL_KEGIATAN, 
  COLL_SUB_KEGIATAN, 
  COLL_RKA, 
  COLL_REALISASI, 
  COLL_MONITORING_FISIK, 
  COLL_DOKUMEN, 
  COLL_LOG_AKTIVITAS, 
  COLL_PENGATURAN, 
  seedInitialDataIfEmpty,
  synchronizeCalculations
} from './dbService';
import { 
  Program, 
  Kegiatan, 
  SubKegiatan, 
  RKA, 
  Realisasi, 
  MonitoringFisik, 
  DokumenArsip, 
  ActivityLog, 
  AppSettings, 
  UserRole 
} from './types';

// Importing Views
import DashboardView from './components/DashboardView';
import ProgramView from './components/ProgramView';
import RkaView from './components/RkaView';
import RealisasiView from './components/RealisasiView';
import MonitoringView from './components/MonitoringView';
import DokumenView from './components/DokumenView';
import LaporanView from './components/LaporanView';
import AnalisisView from './components/AnalisisView';
import LogView from './components/LogView';
import PengaturanView from './components/PengaturanView';

type ViewPage = 
  | "dashboard" 
  | "program" 
  | "rka" 
  | "realisasi" 
  | "monitoring" 
  | "dokumen" 
  | "laporan" 
  | "analisis" 
  | "logs" 
  | "pengaturan";

export default function App() {
  const [activePage, setActivePage] = useState<ViewPage>("dashboard");
  const [programActiveTab, setProgramActiveTab] = useState<'program' | 'kegiatan' | 'sub_kegiatan'>('program');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // States for DB synced collections
  const [programs, setPrograms] = useState<Program[]>([]);
  const [kegiatans, setKegiatans] = useState<Kegiatan[]>([]);
  const [subKegiatans, setSubKegiatans] = useState<SubKegiatan[]>([]);
  const [rkaList, setRkaList] = useState<RKA[]>([]);
  const [realisasis, setRealisasis] = useState<Realisasi[]>([]);
  const [monitorings, setMonitorings] = useState<MonitoringFisik[]>([]);
  const [dokumens, setDokumens] = useState<DokumenArsip[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [seenLogsCount, setSeenLogsCount] = useState<number>(() => {
    return Number(localStorage.getItem('seen_logs_count') || 0);
  });

  // Logged-in credentials
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.PIMPINAN); // Fallback standard role
  const [userDisplayName, setUserDisplayName] = useState<string>('');
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Login process states
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Auto seed on boot
  useEffect(() => {
    const initSeed = async () => {
      try {
        await seedInitialDataIfEmpty();
      } catch (e) {
        console.warn("DB seed check failed:", e);
      }
    };
    initSeed();
  }, []);

  // Listen for Authentication session shifts
  useEffect(() => {
    // Standard persist browser storage local persistence
    setPersistence(auth, browserLocalPersistence).then(() => {
      onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          setUserDisplayName(currentUser.displayName || currentUser.email?.split('@')[0] || 'Aparatur Pertanahan');
          
          // Determine Role based on Email
          const email = currentUser.email?.toLowerCase() || '';
          let role = UserRole.PIMPINAN;
          if (email.includes('admin') || email === 'budiansani@gmail.com') {
            role = UserRole.ADMIN;
          } else if (email.includes('operator')) {
            role = UserRole.OPERATOR;
          }
          setUserRole(role);

          // Save/Sync user doc to firestore under sibiru_pengguna
          try {
            await setDoc(doc(db, "sibiru_pengguna", email), {
              id: email,
              email: email,
              nama: currentUser.displayName || currentUser.email?.split('@')[0] || 'Aparatur Pertanahan',
              role: role,
              aktif: true
            }, { merge: true });
          } catch (e) {
            console.warn("Could not sync user profile to database:", e);
          }
        } else {
          setUser(null);
        }
        setIsAuthChecking(false);
      });
    }).catch(err => {
      console.warn("Persistence error:", err);
      setIsAuthChecking(false);
    });
  }, []);

  // Real-time snap listeners for all firebase collections
  useEffect(() => {
    if (!user) return;

    const unsubProg = onSnapshot(collection(db, COLL_PROGRAM), (snap) => {
      setPrograms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Program)));
    });

    const unsubKeg = onSnapshot(collection(db, COLL_KEGIATAN), (snap) => {
      setKegiatans(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kegiatan)));
    });

    const unsubSub = onSnapshot(collection(db, COLL_SUB_KEGIATAN), (snap) => {
      setSubKegiatans(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubKegiatan)));
    });

    const unsubRka = onSnapshot(collection(db, COLL_RKA), (snap) => {
      setRkaList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RKA)));
    });

    const unsubReal = onSnapshot(collection(db, COLL_REALISASI), (snap) => {
      setRealisasis(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Realisasi)));
    });

    const unsubMon = onSnapshot(collection(db, COLL_MONITORING_FISIK), (snap) => {
      setMonitorings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MonitoringFisik)));
    });

    const unsubDoc = onSnapshot(collection(db, COLL_DOKUMEN), (snap) => {
      setDokumens(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DokumenArsip)));
    });

    const unsubLogs = onSnapshot(collection(db, COLL_LOG_AKTIVITAS), (snap) => {
      setLogs(snap.docs.map(doc => {
        const data = doc.data();
        let parsedOld = undefined;
        let parsedNew = undefined;
        try { if (data.data_lama) parsedOld = JSON.parse(data.data_lama); } catch(e) {}
        try { if (data.data_baru) parsedNew = JSON.parse(data.data_baru); } catch(e) {}

        return {
          id: doc.id,
          waktu: data.waktu || new Date().toISOString(),
          nama_pengguna: data.nama_pengguna || "Guest",
          role: data.role || "Unknown",
          aksi: data.aksi || "Activity",
          modul: data.modul || "System",
          data_lama: data.data_lama,
          data_baru: data.data_baru,
          ip_address: data.ip_address || "127.0.0.1",
          browser: data.browser || "System Browser",

          userEmail: data.nama_pengguna || "Guest",
          userRole: data.role || "Unknown",
          action: data.aksi || "Activity",
          module: data.modul || "System",
          timestamp: data.waktu ? new Date(data.waktu).getTime() : Date.now(),
          oldData: parsedOld,
          newData: parsedNew,
          details: parsedNew || parsedOld || null
        } as any;
      }));
    });

    const unsubSet = onSnapshot(doc(db, COLL_PENGATURAN, "aktif"), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setAppSettings({
          id: docSnap.id,
          tahun_anggaran_aktif: d.tahun_anggaran_aktif || 2026,
          nama_instansi: d.nama_instansi || "Dinas Perumahan dan Kawasan Permukiman",
          logo_instansi: d.logo_instansi || "",
          logo_instansi_public_id: d.logo_instansi_public_id || "",
          nama_pejabat_ttd: d.nama_pejabat_ttd || "",
          jabatan_pejabat_ttd: d.jabatan_pejabat_ttd || "",
          nip_pejabat_ttd: d.nip_pejabat_ttd || "",
          nama_bendahara: d.nama_bendahara || "",
          jabatan_bendahara: d.jabatan_bendahara || "",
          nip_bendahara: d.nip_bendahara || ""
        });
      }
    });

    return () => {
      unsubProg();
      unsubKeg();
      unsubSub();
      unsubRka();
      unsubReal();
      unsubMon();
      unsubDoc();
      unsubLogs();
      unsubSet();
    };

  }, [user]);

  // Sync log notifications as seen
  useEffect(() => {
    if (activePage === 'logs' && logs.length > 0) {
      localStorage.setItem('seen_logs_count', String(logs.length));
      setSeenLogsCount(logs.length);
    }
  }, [activePage, logs.length]);

  // Handle Authentication attempts
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput) {
      setLoginError("Harap masukkan email dan kata sandi Anda!");
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');

    try {
      // Try regular firebase sign in. If user not found (first run), auto-create standard users
      await signInWithEmailAndPassword(auth, emailInput, passwordInput)
        .catch(async (err: any) => {
          if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            // Auto register helper check for prefilled emails
            if (
              emailInput === 'admin@sibiru.go.id' || 
              emailInput === 'operator@sibiru.go.id' || 
              emailInput === 'pimpinan@sibiru.go.id'
            ) {
              await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        });
    } catch (err: any) {
      setLoginError(`Kombinasi salah atau gagal login: ${err.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = () => {
    signOut(auth);
  };

  // Prefill login input shortcut helper
  const handleQuickLogin = (email: string) => {
    setEmailInput(email);
    setPasswordInput("bima2026");
  };

  // Update brand settings helper
  const handleUpdateSettings = async (newBrand: Partial<AppSettings>) => {
    try {
      const activeDocRef = doc(db, COLL_PENGATURAN, "aktif");
      await setDoc(activeDocRef, newBrand, { merge: true });
    } catch (e) {
      console.error(e);
    }
  };

  // Sidebar link details
  const menuItems = [
    { id: "dashboard", label: "Dashboard Utama", icon: <LayoutDashboard size={16} /> },
    { id: "program", label: "Program & Kegiatan", icon: <Layers size={16} /> },
    { id: "rka", label: "E-RKA Detail Belanja", icon: <FileSpreadsheet size={16} /> },
    { id: "realisasi", label: "Realisasi SP2D", icon: <TrendingUp size={16} /> },
    { id: "monitoring", label: "Monitoring Fisik", icon: <Activity size={16} /> },
    { id: "dokumen", label: "Arsip Dokumen", icon: <FolderCheck size={16} /> },
    { id: "laporan", label: "Laporan & Cetak", icon: <FileText size={16} /> },
    { id: "analisis", label: "Analisis Kinerja", icon: <Sparkles size={16} /> },
    { id: "logs", label: "Audit Logs", icon: <ShieldAlert size={16} /> },
    { id: "pengaturan", label: "Administrasi Sistem", icon: <Settings size={16} /> },
  ];

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white space-y-3 font-sans">
        <Building className="text-blue-500 animate-bounce" size={48} />
        <h1 className="text-xl font-extrabold tracking-wide">SIBIRU KABUPATEN BIMA</h1>
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest animate-pulse">Memuat Sesi Keamanan Firebase...</p>
      </div>
    );
  }

  // Gatekeeper: Render Login Screen if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans relative overflow-hidden" id="auth-root">
        
        {/* Absolute branding watermarks */}
        <div className="absolute top-20 left-20 text-blue-900/30 font-black tracking-widest text-[160px] select-none uppercase pointer-events-none font-mono">BIMA</div>
        <div className="absolute bottom-20 right-20 text-indigo-900/20 font-black tracking-widest text-[160px] select-none uppercase pointer-events-none font-mono">2026</div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
          <div className="flex justify-center mb-2">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center p-0.5 shadow-2xl border-2 border-orange-500 overflow-hidden">
              <img 
                src="https://res.cloudinary.com/de4prnqa4/image/upload/v1780640818/logo_sibiru_y2jgaw.jpg" 
                alt="Logo SIBIRU" 
                className="w-full h-full object-cover rounded-full"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          <h2 className="mt-2 text-center text-3xl font-black tracking-tight">
            <span className="text-blue-600">SIBIRU</span> <span className="text-orange-500">TANAH</span>
          </h2>
          <p className="mt-2 text-center text-xs font-semibold text-slate-400 tracking-wide uppercase">
            Sistem Informasi Belanja & Realisasi Keuangan 2026
          </p>
          <div className="mt-0.5 text-center font-mono text-[10px] text-blue-400 font-black uppercase tracking-wider">
            Sektor Pertanahan Kabupaten Bima • Nusa Tenggara Barat
          </div>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10" id="login-form-box">
          <div className="bg-white/95 backdrop-blur-md py-8 px-8 shadow-2xl rounded-3xl border border-slate-100 space-y-6">
            
            {loginError && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-900 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="text-red-700 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form className="space-y-4 text-xs font-medium" onSubmit={handleLogin}>
              <div>
                <label className="block text-slate-700 font-bold mb-1 uppercase tracking-wider">Alamat Surel / Email</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="email"
                    required
                    placeholder="nama@sibiru.go.id"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full p-2.5 pl-9 border border-slate-200 bg-slate-50 focus:bg-white rounded-lg outline-blue-600 focus:border-blue-600 text-slate-900 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 uppercase tracking-wider">Kata Sandi (Password)</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full p-2.5 pl-9 border border-slate-200 bg-slate-50 focus:bg-white rounded-lg outline-blue-600 focus:border-blue-600 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="remember-me"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-slate-300 rounded"
                  />
                  <label htmlFor="remember-me" className="ml-1.5 font-semibold text-slate-700">Ingat Sesi Saya</label>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 focus:outline-none text-white font-bold text-xs uppercase tracking-widest rounded-xl shadow transition disabled:opacity-50"
              >
                {isLoggingIn ? "Mengautentikasi..." : "Masuk Sistem Keuangan"}
              </button>
            </form>

            {/* Quick credentials helper layout representing user role shortcuts */}
            <div className="pt-4 border-t border-slate-100 space-y-2 select-none" id="quick-logins">
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 text-center">Simulasi Satu-Klik Akun Terdaftar (Demo Users)</p>
              <div className="grid grid-cols-1 gap-1.5">
                
                <button 
                  onClick={() => handleQuickLogin('admin@sibiru.go.id')}
                  className="flex items-center justify-between p-2 rounded-xl bg-blue-50/50 hover:bg-blue-100/60 border border-blue-200 text-blue-900 transition text-left"
                >
                  <div>
                    <span className="font-extrabold text-[10px]">1. KABID ADMINISTRATOR (DPA Full Edit)</span>
                    <p className="text-[9px] text-slate-500">admin@sibiru.go.id</p>
                  </div>
                  <span className="text-[9px] bg-blue-200 px-1 rounded font-bold font-mono">ADMIN</span>
                </button>

                <button 
                  onClick={() => handleQuickLogin('operator@sibiru.go.id')}
                  className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/50 hover:bg-emerald-100/60 border border-emerald-200 text-emerald-900 transition text-left"
                >
                  <div>
                    <span className="font-extrabold text-[10px]">2. OPERATOR SEKTOR (Sp2d Input & Docs)</span>
                    <p className="text-[9px] text-slate-500">operator@sibiru.go.id</p>
                  </div>
                  <span className="text-[9px] bg-emerald-200 px-1 rounded font-bold font-mono">OPERATOR</span>
                </button>

                <button 
                  onClick={() => handleQuickLogin('pimpinan@sibiru.go.id')}
                  className="flex items-center justify-between p-2 rounded-xl bg-purple-50/50 hover:bg-purple-100/60 border border-purple-200 text-purple-905 transition text-left"
                >
                  <div>
                    <span className="font-extrabold text-[10px]">3. KEPALA DINAS (Cetak & Laporan)</span>
                    <p className="text-[9px] text-slate-500">pimpinan@sibiru.go.id</p>
                  </div>
                  <span className="text-[9px] bg-purple-200 px-1 rounded font-bold font-mono">PIMPINAN</span>
                </button>

              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Dynamic Page translation router switchboard mapping
  const renderViewContent = () => {
    switch (activePage) {
      case "dashboard":
        return (
          <DashboardView 
            programs={programs} 
            kegiatans={kegiatans} 
            subKegiatans={subKegiatans} 
            realisasis={realisasis} 
            monitorings={monitorings}
            dokumens={dokumens}
            onNavigate={(page, tabDetail) => {
              setActivePage(page as any);
              if (page === "program" && tabDetail) {
                setProgramActiveTab(tabDetail as any);
              }
            }}
          />
        );
      case "program":
        return (
          <ProgramView 
            programs={programs} 
            kegiatans={kegiatans} 
            subKegiatans={subKegiatans} 
            rkaList={rkaList}
            currentUserRole={userRole} 
            currentUserEmail={user.email} 
            activeTab={programActiveTab}
            onChangeTab={setProgramActiveTab}
          />
        );
      case "rka":
        return (
          <RkaView 
            rkaList={rkaList} 
            programs={programs} 
            kegiatans={kegiatans} 
            subKegiatans={subKegiatans} 
            currentUserRole={userRole} 
            currentUserEmail={user.email} 
          />
        );
      case "realisasi":
        return (
          <RealisasiView 
            realisasis={realisasis} 
            rkaList={rkaList} 
            programs={programs} 
            kegiatans={kegiatans} 
            subKegiatans={subKegiatans} 
            currentUserRole={userRole} 
            currentUserEmail={user.email} 
          />
        );
      case "monitoring":
        return (
          <MonitoringView 
            monitorings={monitorings} 
            programs={programs} 
            kegiatans={kegiatans} 
            subKegiatans={subKegiatans} 
            currentUserRole={userRole} 
            currentUserEmail={user.email} 
          />
        );
      case "dokumen":
        return (
          <DokumenView 
            dokumens={dokumens} 
            currentUserRole={userRole} 
            currentUserEmail={user.email} 
          />
        );
      case "laporan":
        return (
          <LaporanView 
            programs={programs} 
            kegiatans={kegiatans} 
            subKegiatans={subKegiatans} 
            realisasis={realisasis} 
            monitorings={monitorings} 
            settings={appSettings}
          />
        );
      case "analisis":
        return (
          <AnalisisView 
            programs={programs} 
            kegiatans={kegiatans} 
            subKegiatans={subKegiatans} 
            realisasis={realisasis} 
          />
        );
      case "logs":
        return (
          <LogView logs={logs} />
        );
      case "pengaturan":
        return (
          <PengaturanView 
            settings={appSettings} 
            currentUserRole={userRole} 
            currentUserEmail={user.email}
            onUpdateSettings={handleUpdateSettings} 
          />
        );
      default:
        return <div className="p-12 text-center text-slate-500 font-bold">Modul Belum Diimplementasikan.</div>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#ebf4fc] via-[#f0f7ff] to-[#fff3e0] flex flex-col font-sans text-slate-800 animate-fade-in" id="sibiru-container">
      
      {/* Top running gradient bar (Blue with Orange gradient banner decoration) */}
      <div className="h-1.5 bg-gradient-to-r from-blue-700 via-blue-500 to-orange-500 w-full sticky top-0 z-50 print:hidden shadow-xs" />

      {/* Top Header navbar panel (Professional Polish: white bg, border, clear typography) */}
      <header className="h-16 bg-white/95 backdrop-blur-md border-b border-blue-200/60 flex items-center justify-between px-6 sticky top-1.5 z-40 select-none print:hidden shadow-3xs" id="main-topbar">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg text-slate-500 transition-colors cursor-pointer"
          >
            <Menu size={20} />
          </button>
          
          <div className="flex items-center gap-3">
            {/* Swapped Brand from Sidebar into Topheader (SIREKAP TAHUN ANGGARAN 2026) */}
            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shrink-0 border border-orange-500 overflow-hidden shadow-2xs select-none">
              <img 
                src="https://res.cloudinary.com/de4prnqa4/image/upload/v1780640818/logo_sibiru_y2jgaw.jpg" 
                alt="Logo SIBIRU" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            
            <div className="flex flex-col justify-center border-l border-slate-200 pl-3">
              <h1 className="text-sm sm:text-base md:text-md lg:text-[17px] font-black tracking-tight text-blue-900 uppercase">
                SIREKAP TAHUN ANGGARAN 2026 - BIDANG PERTANAHAN
              </h1>
              <p className="text-[10px] sm:text-[11px] font-extrabold font-sans text-slate-500 tracking-wider uppercase mt-0.5">
                Sistem Informasi Rekapitulasi, Evaluasi, dan Kinerja Anggaran Pertanahan
              </p>
            </div>
          </div>
        </div>

        {/* Active Profile context and status indicators */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] text-slate-500 font-medium">Real-time Online</span>
          </div>
          
          <div className="flex items-center gap-3 pl-5 border-l border-slate-200">
            <div className="hidden sm:flex flex-col text-right">
              <p className="text-xs font-semibold text-slate-700 leading-tight">{user.email}</p>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded font-black ${userRole === UserRole.ADMIN ? 'bg-amber-100 text-amber-800' : userRole === UserRole.OPERATOR ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'}`}>
                  {userRole}
                </span>
              </div>
            </div>
            
            <button 
              onClick={handleSignOut}
              className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
              title="Keluar Aplikasi"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Structural Body holding Sidebar & Pages viewport */}
      <div className="flex-1 flex overflow-hidden lg:gap-0.5" id="main-layout-body">
        
        {/* Dynamic Sidebar drawer in Professional Deep Dark Blue palette (biru tua bergradasi) */}
        <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-[#0a1122] text-slate-100 transition-all duration-200 border-r border-blue-950/60 shadow-lg print:hidden shrink-0 flex flex-col justify-between select-none`} id="main-sidebar">
          <div className="flex flex-col flex-1 overflow-y-auto">
            
            {/* Sidebar Branding Header (Swapped active page title info with High-contrast colors) */}
            <div className={`p-4 border-b border-blue-950 bg-[#101a33] ${isSidebarOpen ? '' : 'text-center p-3'}`}>
              {isSidebarOpen ? (
                <div className="flex flex-col justify-center animate-fade-in">
                  <span className="text-[9px] uppercase font-black tracking-widest text-slate-400/80">MODUL MENU AKTIF</span>
                  <h2 className="text-xs sm:text-xs font-black text-orange-400 font-display tracking-wide uppercase leading-tight mt-1 truncate">
                    {menuItems.find(item => item.id === activePage)?.label || "Dashboard Utama"}
                  </h2>
                </div>
              ) : (
                <div className="flex items-center justify-center h-10 w-10 mx-auto rounded-lg bg-orange-500/10 text-orange-400 font-black text-[11px] border border-orange-500/30 animate-fade-in" title={menuItems.find(item => item.id === activePage)?.label}>
                  {activePage.substring(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div className={`px-5 pt-4 pb-1 text-[9px] uppercase font-black text-slate-400 tracking-wider opacity-85 ${isSidebarOpen ? '' : 'hidden'}`}>
              Menu Utama
            </div>
            
            <nav className="p-3 space-y-1 text-xs">
              {menuItems.map((item) => {
                const isActive = activePage === item.id;
                // Calculate unread activity logs
                let badgeCount = 0;
                if (item.id === 'logs') {
                  badgeCount = Math.max(0, logs.length - seenLogsCount);
                }

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActivePage(item.id as ViewPage);
                      if (item.id === 'program') {
                        setProgramActiveTab('program');
                      }
                    }}
                    className={`flex items-center rounded-lg transition-all text-left cursor-pointer ${
                      isSidebarOpen 
                        ? 'w-full px-3.5 py-2.5 justify-between ' + (isActive ? 'bg-gradient-to-r from-blue-900 to-orange-600/90 border-l-4 border-orange-500 text-white font-extrabold shadow-md' : 'hover:bg-white/5 text-slate-300 hover:text-white font-medium')
                        : 'w-10 h-10 mx-auto justify-center ' + (isActive ? 'bg-orange-600 text-white border border-orange-400 shadow-md' : 'hover:bg-white/5 text-slate-300')
                    }`}
                    title={item.label}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`${isActive ? 'text-orange-400' : 'text-slate-400'} shrink-0`}>
                        {item.icon}
                      </span>
                      {isSidebarOpen && <span className="truncate">{item.label}</span>}
                    </div>
                    {isSidebarOpen && badgeCount > 0 && (
                      <span className="bg-orange-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse shrink-0">
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Connected User Badge & Logo Context in Deep Navy design */}
          <div className="p-4 border-t border-blue-950 bg-[#0d172e]">
            {isSidebarOpen ? (
              <div className="flex items-center gap-3 bg-[#13203f] p-2.5 rounded-xl border border-blue-900/40 animate-fade-in">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center font-bold text-xs shrink-0 font-display shadow-2xs">
                  {userRole === UserRole.ADMIN ? 'AD' : userRole === UserRole.OPERATOR ? 'OP' : 'PM'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate text-slate-100">{userDisplayName}</p>
                  <p className="text-[9px] text-[#38bdf8] truncate font-mono uppercase tracking-wide font-black">{userRole} ACCESS</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center animate-fade-in" title={`${userDisplayName} (${userRole})`}>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center font-black text-xs font-display shadow-2xs">
                  {userRole === UserRole.ADMIN ? 'AD' : userRole === UserRole.OPERATOR ? 'OP' : 'PM'}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Core Contents viewport with professional bg slate */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto bg-[#ebf4fc]" id="main-viewport-content">
          {renderViewContent()}
        </main>

      </div>

    </div>
  );
}
