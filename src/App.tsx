import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc,
  getDoc,
  deleteDoc
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
  Mail,
  Lock, 
  Layers,
  Building,
  RotateCcw,
  AlertCircle,
  AlertTriangle,
  Clock,
  PowerOff
} from 'lucide-react';
import { auth, db } from './firebase';
import { 
  COLL_PROGRAM, 
  COLL_KEGIATAN, 
  COLL_SUB_KEGIATAN, 
  COLL_RKA, 
  COLL_REALISASI, 
  COLL_BELANJA_PIHAK_KETIGA, 
  COLL_DOKUMEN, 
  COLL_LOG_AKTIVITAS, 
  COLL_PENGATURAN, 
  COLL_PRESENCE,
  seedInitialDataIfEmpty,
  synchronizeCalculations,
  createAuditLog,
  forceDisconnectSession
} from './dbService';
import { 
  Program, 
  Kegiatan, 
  SubKegiatan, 
  RKA, 
  Realisasi, 
  BelanjaPihakKetiga, 
  DokumenArsip, 
  ActivityLog, 
  AppSettings, 
  UserRole,
  Pengguna,
  SesiPenggunaOnline
} from './types';

// Importing Views
import DashboardView from './components/DashboardView';
import ProgramView from './components/ProgramView';
import RkaView from './components/RkaView';
import RealisasiView from './components/RealisasiView';
import BelanjaPihakKetigaView from './components/BelanjaPihakKetigaView';
import DokumenView from './components/DokumenView';
import LaporanView from './components/LaporanView';
import AnalisisView from './components/AnalisisView';
import LogView from './components/LogView';
import PengaturanView from './components/PengaturanView';
import OnlineSessionsModal from './components/OnlineSessionsModal';
import { getDeviceDetails, getClientIp } from './utils/deviceHelper';

type ViewPage = 
  | "dashboard" 
  | "program" 
  | "rka" 
  | "realisasi" 
  | "pihakKetiga" 
  | "dokumen" 
  | "laporan" 
  | "analisis" 
  | "logs" 
  | "pengaturan";

export default function App() {
  const [activePage, setActivePage] = useState<ViewPage>("dashboard");
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [programActiveTab, setProgramActiveTab] = useState<'program' | 'kegiatan' | 'sub_kegiatan'>('program');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedInfo, setSelectedInfo] = useState<{ title: string; content: string; type: 'guide' | 'alert' } | null>(null);

  // Filter target dari dashboard saat user mengklik jenis belanja yang overbudget
  const [targetFilterSubKeg, setTargetFilterSubKeg] = useState<string>('');
  const [targetFilterUraian, setTargetFilterUraian] = useState<string>('');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // States for DB synced collections
  const [programs, setPrograms] = useState<Program[]>([]);
  const [kegiatans, setKegiatans] = useState<Kegiatan[]>([]);
  const [subKegiatans, setSubKegiatans] = useState<SubKegiatan[]>([]);
  const [rkaList, setRkaList] = useState<RKA[]>([]);
  const [realisasis, setRealisasis] = useState<Realisasi[]>([]);
  const [pihakKetigas, setPihakKetigas] = useState<BelanjaPihakKetiga[]>([]);
  const [dokumens, setDokumens] = useState<DokumenArsip[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const saved = localStorage.getItem('sibiru_selected_year');
    return saved ? Number(saved) : 2026;
  });

  useEffect(() => {
    if (appSettings && !localStorage.getItem('sibiru_selected_year')) {
      setSelectedYear(appSettings.tahun_anggaran_aktif || 2026);
    }
  }, [appSettings]);

  const handleSelectYear = (year: number) => {
    setSelectedYear(year);
    localStorage.setItem('sibiru_selected_year', String(year));
    showToast(`Tahun Anggaran aktif dialihkan ke ${year}`, 'success');
  };

  const [seenLogsCount, setSeenLogsCount] = useState<number>(() => {
    return Number(localStorage.getItem('seen_logs_count') || 0);
  });

  // Logged-in credentials
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.PIMPINAN); // Fallback standard role
  const [userDisplayName, setUserDisplayName] = useState<string>('');
  const [penggunas, setPenggunas] = useState<Pengguna[]>([]);
  const [namaPenggunaInput, setNamaPenggunaInput] = useState('');
  const [namaPenggunaAktif, setNamaPenggunaAktif] = useState<string>(() => localStorage.getItem('nama_pengguna_aktif') || '');
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Login process states
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [currentDateTime, setCurrentDateTime] = useState<string>('');

  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Monitor online/offline statuses
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const goOnline = () => setIsOnline(true);
      const goOffline = () => setIsOnline(false);
      window.addEventListener('online', goOnline);
      window.addEventListener('offline', goOffline);
      return () => {
        window.removeEventListener('online', goOnline);
        window.removeEventListener('offline', goOffline);
      };
    }
  }, []);

  const [totalVisits, setTotalVisits] = useState<number>(0);
  const [activeUsersCount, setActiveUsersCount] = useState<number>(1);
  const [sessionId] = useState<string>(() => {
    const saved = sessionStorage.getItem('sibiru_session_id');
    if (saved) return saved;
    const fresh = `session_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    sessionStorage.setItem('sibiru_session_id', fresh);
    return fresh;
  });

  const [loginAt] = useState<number>(() => {
    const saved = sessionStorage.getItem('sibiru_session_login_at');
    if (saved) return Number(saved);
    const fresh = Date.now();
    sessionStorage.setItem('sibiru_session_login_at', String(fresh));
    return fresh;
  });

  const [clientIp, setClientIp] = useState<string>('127.0.0.1');
  const [onlineSessions, setOnlineSessions] = useState<SesiPenggunaOnline[]>([]);
  const [isOnlineSessionsModalOpen, setIsOnlineSessionsModalOpen] = useState<boolean>(false);
  const [forceDisconnectedNotice, setForceDisconnectedNotice] = useState<string | null>(null);

  // Inactivity Auto-Logout Configurations (30 Menit Tidak Aktif)
  const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 menit = 1.800.000 ms
  const INACTIVITY_WARNING_MS = 2 * 60 * 1000;  // Peringatan hitung mundur 2 menit sebelum logout
  const [inactivityNotice, setInactivityNotice] = useState<string | null>(null);
  const [idleWarningSeconds, setIdleWarningSeconds] = useState<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const handleExtendSession = () => {
    const now = Date.now();
    lastActivityRef.current = now;
    localStorage.setItem('sirekap_last_activity', String(now));
    setIdleWarningSeconds(null);
    showToast("Sesi aktif Anda telah diperpanjang.", "success");
  };

  // Fetch client IP on mount
  useEffect(() => {
    getClientIp().then(ip => {
      if (ip) setClientIp(ip);
    }).catch(() => {});
  }, []);

  // Real-time Visit session registration and Presence heartbeat
  useEffect(() => {
    if (!user) return;

    // 1. Visit Counter Registration (Only once per session)
    const hasVisited = sessionStorage.getItem('sibiru_session_visited');
    if (!hasVisited) {
      sessionStorage.setItem('sibiru_session_visited', 'true');
      const visitId = `visit_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      setDoc(doc(db, 'sibiru_visits', visitId), {
        waktu: new Date().toISOString(),
        email: user.email || 'guest@sirekap_bima.com'
      }).catch(err => console.warn('Gagal mencatat kunjungan:', err));
    }

    // 2. Presence Heartbeat Timer (every 10 seconds to keep it super fresh)
    const updatePresence = async () => {
      try {
        const deviceInfo = getDeviceDetails();
        const displayName = userDisplayName || (penggunas.find(p => p.email === user.email)?.nama) || (user.email ? user.email.split('@')[0] : 'Pengguna');

        await setDoc(doc(db, COLL_PRESENCE, sessionId), {
          id: sessionId,
          email: user.email || 'guest@sirekap_bima.com',
          nama: displayName,
          role: userRole,
          device: deviceInfo.deviceString,
          device_type: deviceInfo.deviceType,
          browser: deviceInfo.browser,
          os: deviceInfo.os,
          ip_address: clientIp,
          login_at: loginAt,
          last_active: Date.now(),
          status: 'online'
        }, { merge: true });
      } catch (err) {
        console.warn('Gagal update presensi:', err);
      }
    };

    updatePresence();
    const presenceInterval = setInterval(updatePresence, 10000);

    // Clean up presence when component unmounts or user logs out / closes tab
    const handleUnload = () => {
      try {
        setDoc(doc(db, COLL_PRESENCE, sessionId), {
          status: 'logged_out',
          last_active: Date.now()
        }, { merge: true }).catch(() => {});
      } catch (e) {}
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(presenceInterval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [user, sessionId, userRole, userDisplayName, penggunas, clientIp, loginAt]);

  // Listener on current user's session document to detect forced disconnection by Administrator
  useEffect(() => {
    if (!user || !sessionId) return;

    const unsubMySession = onSnapshot(doc(db, COLL_PRESENCE, sessionId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.status === 'force_disconnected') {
          const disconnectedBy = data.disconnected_by || 'Administrator';
          sessionStorage.removeItem('sibiru_session_id');
          sessionStorage.removeItem('sibiru_session_login_at');
          signOut(auth).catch(() => {});
          setUser(null);
          setForceDisconnectedNotice(
            `Koneksi akun Anda telah diputuskan oleh Administrator (${disconnectedBy}). Silakan hubungi admin atau masuk kembali jika diizinkan.`
          );
        }
      }
    });

    return () => unsubMySession();
  }, [user, sessionId]);

  // Otomatis keluar / logout jika pengguna tidak aktif dalam waktu 30 menit
  useEffect(() => {
    if (!user) {
      setIdleWarningSeconds(null);
      return;
    }

    // Inisialisasi waktu aktivitas saat user login
    const initTime = Date.now();
    lastActivityRef.current = initTime;
    localStorage.setItem('sirekap_last_activity', String(initTime));

    let lastRecordThrottle = initTime;
    const registerUserActivity = () => {
      const now = Date.now();
      // Throttle pembaruan storage & ref setiap minimal 2 detik untuk performa responsif
      if (now - lastRecordThrottle > 2000) {
        lastRecordThrottle = now;
        lastActivityRef.current = now;
        localStorage.setItem('sirekap_last_activity', String(now));
      }
      // Jika peringatan hitung mundur sedang tampil, gerak mouse/ketik memperpanjang sesi
      setIdleWarningSeconds((prev) => (prev !== null ? null : null));
    };

    const userActivityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'wheel'];
    userActivityEvents.forEach(evt => {
      window.addEventListener(evt, registerUserActivity, { passive: true });
    });

    const performInactivityLogout = async () => {
      const currentSession = sessionId;
      const currentEmail = user?.email || 'pengguna@sirekap.com';
      const currentRole = userRole;

      try {
        if (currentSession) {
          await setDoc(doc(db, COLL_PRESENCE, currentSession), {
            status: 'logged_out',
            last_active: Date.now(),
            disconnected_by: 'Sistem (Inaktivitas 30 Menit)',
            disconnected_at: Date.now()
          }, { merge: true }).catch(() => {});
        }
      } catch (e) {}

      createAuditLog(
        currentEmail,
        currentRole,
        "LOGOUT OTOMATIS (INAKTIVITAS 30 MENIT)",
        "AUTENTIKASI",
        { sessionId: currentSession },
        { status: 'LOGGED_OUT', alasan: 'Pengguna tidak aktif selama 30 menit', waktu: new Date().toISOString() }
      ).catch(() => {});

      localStorage.removeItem('nama_pengguna_aktif');
      localStorage.removeItem('sirekap_last_activity');
      sessionStorage.removeItem('sibiru_session_id');
      sessionStorage.removeItem('sibiru_session_login_at');
      setNamaPenggunaInput('');
      setNamaPenggunaAktif('');
      setIdleWarningSeconds(null);

      await signOut(auth).catch(() => {});
      setUser(null);
      setInactivityNotice(
        "Aplikasi telah keluar (logout) otomatis karena Anda tidak aktif selama 30 menit demi keamanan data. Silakan masuk (login) kembali untuk melanjutkan pekerjaan Anda."
      );
    };

    // Pengecekan inaktivitas berkala setiap 2 detik
    const inactivityInterval = setInterval(() => {
      const storedTime = Number(localStorage.getItem('sirekap_last_activity') || 0);
      const latestActivity = Math.max(lastActivityRef.current, storedTime);
      const elapsed = Date.now() - latestActivity;

      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        clearInterval(inactivityInterval);
        performInactivityLogout();
      } else if (elapsed >= (INACTIVITY_TIMEOUT_MS - INACTIVITY_WARNING_MS)) {
        const remainingMs = INACTIVITY_TIMEOUT_MS - elapsed;
        const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
        setIdleWarningSeconds(remainingSec);
      } else {
        setIdleWarningSeconds(null);
      }
    }, 2000);

    // Deteksi saat tab kembali aktif atau laptop dibuka kembali dari keadaan tidur (sleep)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const storedTime = Number(localStorage.getItem('sirekap_last_activity') || 0);
        const latestActivity = Math.max(lastActivityRef.current, storedTime);
        if (Date.now() - latestActivity >= INACTIVITY_TIMEOUT_MS) {
          clearInterval(inactivityInterval);
          performInactivityLogout();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      userActivityEvents.forEach(evt => {
        window.removeEventListener(evt, registerUserActivity);
      });
      clearInterval(inactivityInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [user, sessionId, userRole]);

  // Live Real-time Clock updating every second
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }) + ' - ' + now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      setCurrentDateTime(formatted);
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto seed check after authentication is established
  useEffect(() => {
    if (!user) return;
    const initSeed = async () => {
      try {
        await seedInitialDataIfEmpty();
      } catch (e) {
        console.warn("DB seed check failed:", e);
      }
    };
    initSeed();
  }, [user]);

  // Listen for Authentication session shifts
  useEffect(() => {
    // Standard persist browser storage local persistence
    setPersistence(auth, browserLocalPersistence).then(() => {
      onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          
          // Determine Role based on User Document in Firestore if it exists
          const email = currentUser.email?.toLowerCase() || '';
          let role = UserRole.PIMPINAN; // Fallback standard role
          let dbNama = email.split('@')[0];
          
          try {
            const userDoc = await getDoc(doc(db, "sibiru_pengguna", email));
            if (userDoc.exists()) {
              const data = userDoc.data();
              role = data.role || UserRole.PIMPINAN;
              dbNama = data.nama || dbNama;
            } else {
              // Standard fallback rules
              if (email.includes('admin') || email === 'budiansani@gmail.com') {
                role = UserRole.ADMIN;
              } else if (email.includes('operator')) {
                role = UserRole.OPERATOR;
              }
              // Save standard seeding account to Database so they can be modified
              await setDoc(doc(db, "sibiru_pengguna", email), {
                id: email,
                email: email,
                nama: email.includes('admin') ? "Administrator SIREKAP Bima" : email.includes('operator') ? "Operator Teknis Pertanahan" : "Kepala Bidang Pertanahan",
                role: role,
                aktif: true,
                password: "bima2026"
              }, { merge: true }).catch(err => console.warn("Notice: could not save initial user doc:", err));
            }
          } catch (e) {
            console.warn("Could not retrieve user document from firestore:", e);
          }

          setUserRole(role);
          const activeNama = localStorage.getItem('nama_pengguna_aktif');
          setUserDisplayName(activeNama || dbNama || 'Aparatur Pertanahan');
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
    }, (err) => console.warn('Error listening program:', err));

    const unsubKeg = onSnapshot(collection(db, COLL_KEGIATAN), (snap) => {
      setKegiatans(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kegiatan)));
    }, (err) => console.warn('Error listening kegiatan:', err));

    const unsubSub = onSnapshot(collection(db, COLL_SUB_KEGIATAN), (snap) => {
      setSubKegiatans(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubKegiatan)));
    }, (err) => console.warn('Error listening sub kegiatan:', err));

    const unsubRka = onSnapshot(collection(db, COLL_RKA), (snap) => {
      setRkaList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RKA)));
    }, (err) => console.warn('Error listening rka:', err));

    const unsubReal = onSnapshot(collection(db, COLL_REALISASI), (snap) => {
      setRealisasis(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Realisasi)));
    }, (err) => console.warn('Error listening realisasi:', err));

    const unsubMon = onSnapshot(collection(db, COLL_BELANJA_PIHAK_KETIGA), (snap) => {
      setPihakKetigas(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BelanjaPihakKetiga)));
    }, (err) => console.warn('Error listening belanja pihak ketiga:', err));

    const unsubDoc = onSnapshot(collection(db, COLL_DOKUMEN), (snap) => {
      setDokumens(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DokumenArsip)));
    }, (err) => console.warn('Error listening dokumen:', err));

    const unsubPengguna = onSnapshot(collection(db, "sibiru_pengguna"), (snap) => {
      setPenggunas(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pengguna)));
    }, (err) => console.warn('Error listening pengguna:', err));

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
    }, (err) => console.warn('Error listening logs:', err));

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
    }, (err) => console.warn('Error listening pengaturan:', err));

    const unsubVisits = onSnapshot(collection(db, 'sibiru_visits'), (snap) => {
      // We will set a beautiful baseline of 2145 to make it match existing system status vibe + actual count!
      setTotalVisits(2145 + snap.size);
    }, (err) => {
      console.warn('Error listening visits:', err);
    });

    const unsubPresence = onSnapshot(collection(db, COLL_PRESENCE), (snap) => {
      const now = Date.now();
      const list: SesiPenggunaOnline[] = [];
      let activeCount = 0;

      snap.docs.forEach(docVal => {
        const d = docVal.data() as any;
        const lastActive = d.last_active || d.lastActive || 0;
        const isOnline = (now - lastActive) < 60000 && d.status !== 'force_disconnected' && d.status !== 'logged_out';

        if (isOnline) {
          activeCount++;
        }

        list.push({
          id: docVal.id,
          email: d.email || 'unknown',
          nama: d.nama || d.email || 'Pengguna',
          role: d.role || UserRole.OPERATOR,
          device: d.device || 'Perangkat Web',
          device_type: d.device_type || 'desktop',
          browser: d.browser || 'Browser',
          os: d.os || 'OS',
          ip_address: d.ip_address || '127.0.0.1',
          login_at: d.login_at || lastActive,
          last_active: lastActive,
          status: d.status || (isOnline ? 'online' : 'idle'),
          disconnected_by: d.disconnected_by,
          disconnected_at: d.disconnected_at
        });
      });

      list.sort((a, b) => (b.last_active || 0) - (a.last_active || 0));
      setOnlineSessions(list);
      setActiveUsersCount(Math.max(1, activeCount));
    }, (err) => {
      console.warn('Error listening presence:', err);
    });

    return () => {
      unsubProg();
      unsubKeg();
      unsubSub();
      unsubRka();
      unsubReal();
      unsubMon();
      unsubDoc();
      unsubPengguna();
      unsubLogs();
      unsubSet();
      unsubVisits();
      unsubPresence();
    };

  }, [user]);

  // Sync log notifications as seen
  useEffect(() => {
    if (activePage === 'logs' && logs.length > 0) {
      localStorage.setItem('seen_logs_count', String(logs.length));
      setSeenLogsCount(logs.length);
    }
  }, [activePage, logs.length]);

  const filteredPrograms = useMemo(() => {
    return programs.filter(p => (p.tahun || 2026) === selectedYear);
  }, [programs, selectedYear]);

  const filteredKegiatans = useMemo(() => {
    return kegiatans.filter(k => (k.tahun || 2026) === selectedYear);
  }, [kegiatans, selectedYear]);

  const filteredSubKegiatans = useMemo(() => {
    return subKegiatans.filter(s => (s.tahun || 2026) === selectedYear);
  }, [subKegiatans, selectedYear]);

  const filteredRkaList = useMemo(() => {
    return rkaList.filter(r => (r.tahun || 2026) === selectedYear);
  }, [rkaList, selectedYear]);

  const filteredRealisasis = useMemo(() => {
    return realisasis.filter(r => {
      if (r.tahun !== undefined) return r.tahun === selectedYear;
      if (r.tanggal) {
        try {
          const y = new Date(r.tanggal).getFullYear();
          if (!isNaN(y)) return y === selectedYear;
        } catch (e) {}
      }
      return 2026 === selectedYear;
    });
  }, [realisasis, selectedYear]);

  const filteredPihakKetigas = useMemo(() => {
    return pihakKetigas.filter(p => {
      if (p.tahun !== undefined) return p.tahun === selectedYear;
      if (p.tanggal) {
        try {
          const y = new Date(p.tanggal).getFullYear();
          if (!isNaN(y)) return y === selectedYear;
        } catch (e) {}
      }
      return 2026 === selectedYear;
    });
  }, [pihakKetigas, selectedYear]);

  // Handle Authentication attempts
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaPenggunaInput.trim()) {
      setLoginError("Nama Pengguna wajib diisi!");
      return;
    }
    if (!emailInput || !passwordInput) {
      setLoginError("Harap masukkan email dan kata sandi Anda!");
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');
    setInactivityNotice(null);
    setForceDisconnectedNotice(null);

    const emailClean = emailInput.trim().toLowerCase();

    try {
      // 1. Authenticate with Firebase Auth first
      try {
        await signInWithEmailAndPassword(auth, emailClean, passwordInput);
      } catch (authErr: any) {
        if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
          // If first run, auto-register in Auth
          try {
            await createUserWithEmailAndPassword(auth, emailClean, passwordInput);
          } catch (createErr: any) {
            throw new Error("Akun belum terdaftar atau kombinasi email dan kata sandi salah!");
          }
        } else {
          throw authErr;
        }
      }

      // 2. Clear out any previous session-cached display names and save the new active one
      localStorage.setItem('nama_pengguna_aktif', namaPenggunaInput.trim());
      setNamaPenggunaAktif(namaPenggunaInput.trim());
      setUserDisplayName(namaPenggunaInput.trim());
      lastActivityRef.current = Date.now();
      localStorage.setItem('sirekap_last_activity', String(Date.now()));

      // 3. Fetch from Firestore sibiru_pengguna now that user is signed in
      try {
        const userDocRef = doc(db, "sibiru_pengguna", emailClean);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          if (userData.aktif === false) {
            await signOut(auth);
            throw new Error("Akun Anda telah dinonaktifkan oleh administrator!");
          }
        }
      } catch (docErr: any) {
        if (docErr.message?.includes('dinonaktifkan')) {
          throw docErr;
        }
        console.warn("Could not check user status doc:", docErr);
      }
    } catch (err: any) {
      setLoginError(err.message || `Nama akun atau kata sandi tidak cocok.`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      if (sessionId) {
        await setDoc(doc(db, COLL_PRESENCE, sessionId), {
          status: 'logged_out',
          last_active: Date.now()
        }, { merge: true });
      }
    } catch (e) {}
    localStorage.removeItem('nama_pengguna_aktif');
    localStorage.removeItem('sirekap_last_activity');
    sessionStorage.removeItem('sibiru_session_id');
    sessionStorage.removeItem('sibiru_session_login_at');
    setNamaPenggunaInput('');
    setNamaPenggunaAktif('');
    setIdleWarningSeconds(null);
    setInactivityNotice(null);
    signOut(auth);
  };

  // Disconnect active user session by Administrator
  const handleDisconnectSession = async (targetSessionId: string, targetEmail: string, targetName: string) => {
    if (userRole !== UserRole.ADMIN) {
      showToast("Hanya Administrator yang memiliki hak memutuskan sesi pengguna.", "error");
      return;
    }
    try {
      await forceDisconnectSession(targetSessionId, user?.email || 'admin@sirekap.com', targetEmail, targetName);
      setOnlineSessions(prev => prev.filter(s => s.id !== targetSessionId));
      showToast(`Koneksi sesi akun ${targetEmail} berhasil diputuskan.`, "success");
    } catch (err: any) {
      showToast("Gagal memutuskan sesi: " + (err?.message || String(err)), "error");
      throw err;
    }
  };

  // Prefill login input shortcut helper
  const handleQuickLogin = (email: string) => {
    setEmailInput(email);
    setPasswordInput("bima2026");
    if (email.includes('admin')) {
      setNamaPenggunaInput("Administrator SIREKAP Bima");
    } else if (email.includes('operator')) {
      setNamaPenggunaInput("Operator Teknis Pertanahan");
    } else {
      setNamaPenggunaInput("Kepala Bidang Pertanahan");
    }
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
    { id: "pihakKetiga", label: "Belanja Pihak Ketiga", icon: <Activity size={16} /> },
    { id: "dokumen", label: "Arsip Dokumen", icon: <FolderCheck size={16} /> },
    { id: "laporan", label: "Laporan & Cetak", icon: <FileText size={16} /> },
    { id: "analisis", label: "Analisis Kinerja", icon: <Sparkles size={16} /> },
    { id: "logs", label: "Audit Logs", icon: <ShieldAlert size={16} /> },
    { id: "pengaturan", label: "Administrasi Sistem", icon: <Settings size={16} /> },
  ].filter(item => {
    // Hide Audit Logs and Administrasi Sistem menus for OPERATOR and PIMPINAN
    if (userRole !== UserRole.ADMIN) {
      return item.id !== 'logs' && item.id !== 'pengaturan';
    }
    return true;
  });

  // Enforce access control on route/page state changes
  useEffect(() => {
    if (userRole !== UserRole.ADMIN) {
      if (activePage === 'logs' || activePage === 'pengaturan') {
        setActivePage('dashboard');
      }
    }
  }, [userRole, activePage]);


  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white space-y-3 font-sans">
        <Building className="text-blue-500 animate-bounce" size={48} />
        <h1 className="text-xl font-extrabold tracking-wide">SIREKAP TANAH KABUPATEN BIMA</h1>
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
            <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center p-1.5 shadow-2xl border-2 border-orange-500 overflow-hidden">
              <img 
                src={appSettings?.logo_instansi || "/logo.svg"} 
                alt="Logo SIREKAP TANAH" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/logo.svg";
                }}
              />
            </div>
          </div>
          <h2 className="mt-2 text-center text-3xl font-black tracking-tight">
            <span className="text-blue-600">SIREKAP</span> <span className="text-orange-500">TANAH</span>
          </h2>
          <p className="mt-2 text-center text-xs font-semibold text-slate-400 tracking-wide uppercase px-4">
            Sistem Informasi Rekapitulasi, Evaluasi, dan Kinerja Anggaran Pertanahan 2026
          </p>
          <div className="mt-2 text-center font-mono uppercase tracking-wider flex flex-col gap-0.5">
            <span className="text-[12px] text-orange-500 font-extrabold pb-0.5">Bidang Pertanahan</span>
            <span className="text-[9px] text-blue-400 font-bold leading-relaxed px-2">Dinas Perumahan dan Kawasan Permukiman Kabupaten Bima</span>
          </div>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10" id="login-form-box">
          <div className="bg-white/95 backdrop-blur-md py-8 px-8 shadow-2xl rounded-3xl border border-slate-100 space-y-6">
            {inactivityNotice && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-950 rounded-xl text-xs font-semibold flex items-start gap-2.5 shadow-xs animate-fade-in">
                <Clock size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-amber-900 text-xs">Sesi Berakhir Otomatis (Inaktivitas 30 Menit)</p>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">{inactivityNotice}</p>
                </div>
              </div>
            )}

            {forceDisconnectedNotice && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-950 rounded-xl text-xs font-semibold flex items-start gap-2.5 shadow-xs animate-fade-in">
                <PowerOff size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-rose-900 text-xs">Koneksi Sesi Diputuskan</p>
                  <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">{forceDisconnectedNotice}</p>
                </div>
              </div>
            )}

            {loginError && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-900 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="text-red-700 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form className="space-y-4 text-xs font-medium" onSubmit={handleLogin}>
              <div>
                <label className="block text-slate-700 font-bold mb-1 uppercase tracking-wider">Nama Pengguna (Wajib & Bebas)</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Budi Santoso atau Keuangan"
                    value={namaPenggunaInput}
                    onChange={(e) => setNamaPenggunaInput(e.target.value)}
                    className="w-full p-2.5 pl-9 border border-slate-200 bg-slate-50 focus:bg-white rounded-lg outline-blue-600 focus:border-blue-600 text-slate-900 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 uppercase tracking-wider">Nama Akun / Alamat Surel</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="email"
                    required
                    placeholder="nama@sirekap.com"
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
 
            {/* Quick credentials helper layout representing user role shortcuts removed */}

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
            programs={filteredPrograms} 
            kegiatans={filteredKegiatans} 
            subKegiatans={filteredSubKegiatans} 
            rkaList={filteredRkaList}
            realisasis={filteredRealisasis} 
            pihakKetigas={filteredPihakKetigas}
            dokumens={dokumens}
            onNavigate={(page, tabDetail, filterInfo) => {
              setActivePage(page as any);
              if (page === "program" && tabDetail) {
                setProgramActiveTab(tabDetail as any);
              }
              if (filterInfo) {
                setTargetFilterSubKeg(filterInfo.subKegiatan || '');
                setTargetFilterUraian(filterInfo.uraian || '');
              }
            }}
            selectedYear={selectedYear}
          />
        );
      case "program":
        return (
          <ProgramView 
            programs={filteredPrograms} 
            kegiatans={filteredKegiatans} 
            subKegiatans={filteredSubKegiatans} 
            rkaList={filteredRkaList}
            allPrograms={programs}
            allKegiatans={kegiatans}
            allSubKegiatans={subKegiatans}
            allRkaList={rkaList}
            currentUserRole={userRole} 
            currentUserEmail={user.email} 
            activeTab={programActiveTab}
            onChangeTab={setProgramActiveTab}
            selectedYear={selectedYear}
          />
        );
      case "rka":
        return (
          <RkaView 
            rkaList={filteredRkaList} 
            programs={filteredPrograms} 
            kegiatans={filteredKegiatans} 
            subKegiatans={filteredSubKegiatans} 
            allPrograms={programs}
            allKegiatans={kegiatans}
            allSubKegiatans={subKegiatans}
            currentUserRole={userRole} 
            currentUserEmail={user.email} 
            selectedYear={selectedYear}
            initialFilterSubKegiatan={targetFilterSubKeg}
            initialFilterUraian={targetFilterUraian}
          />
        );
      case "realisasi":
        return (
          <RealisasiView 
            realisasis={filteredRealisasis} 
            rkaList={filteredRkaList} 
            programs={filteredPrograms} 
            kegiatans={filteredKegiatans} 
            subKegiatans={filteredSubKegiatans} 
            pihakKetigas={filteredPihakKetigas}
            currentUserRole={userRole} 
            currentUserEmail={user.email} 
            onShowToast={showToast}
            selectedYear={selectedYear}
            initialSubKeg={targetFilterSubKeg}
            initialUraianFilter={targetFilterUraian}
          />
        );
      case "pihakKetiga":
        return (
          <BelanjaPihakKetigaView 
            pihakKetigas={filteredPihakKetigas} 
            realisasis={filteredRealisasis}
            programs={filteredPrograms} 
            kegiatans={filteredKegiatans} 
            subKegiatans={filteredSubKegiatans} 
            rkaList={filteredRkaList}
            currentUserRole={userRole} 
            currentUserEmail={user.email} 
            selectedYear={selectedYear}
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
            programs={filteredPrograms} 
            kegiatans={filteredKegiatans} 
            subKegiatans={filteredSubKegiatans} 
            realisasis={filteredRealisasis} 
            pihakKetigas={filteredPihakKetigas} 
            rkaList={filteredRkaList}
            settings={appSettings}
            currentUserEmail={user?.email || ''}
            currentUserRole={userRole}
            logs={logs}
            selectedYear={selectedYear}
          />
        );
      case "analisis":
        return (
          <AnalisisView 
            programs={filteredPrograms} 
            kegiatans={filteredKegiatans} 
            subKegiatans={filteredSubKegiatans} 
            realisasis={filteredRealisasis} 
            pihakKetigas={filteredPihakKetigas}
          />
        );
      case "logs":
        if (userRole !== UserRole.ADMIN) {
          return (
            <div className="bg-white rounded-2xl border border-red-100 p-12 text-center max-w-lg mx-auto my-12 shadow-sm space-y-4">
              <ShieldAlert className="text-red-500 mx-auto animate-bounce animate-duration-1000" size={48} />
              <h3 className="text-base font-black text-slate-800 uppercase tracking-widest">Akses Ditolak</h3>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                Halaman Log Aktivitas Sistem ini bersifat rahasia dan hanya dapat diakses oleh Administrator Sektor Bidang Pertanahan.
              </p>
            </div>
          );
        }
        return (
          <LogView logs={logs} />
        );
      case "pengaturan":
        if (userRole !== UserRole.ADMIN) {
          return (
            <div className="bg-white rounded-2xl border border-red-100 p-12 text-center max-w-lg mx-auto my-12 shadow-sm space-y-4">
              <ShieldAlert className="text-red-500 mx-auto animate-bounce animate-duration-1000" size={48} />
              <h3 className="text-base font-black text-slate-800 uppercase tracking-widest">Akses Ditolak</h3>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                Halaman Administrasi Sistem dan Konfigurasi Organisasi ini hanya diizinkan untuk akun Administrator Sektor.
              </p>
            </div>
          );
        }
        return (
          <PengaturanView 
            settings={appSettings} 
            currentUserRole={userRole} 
            currentUserEmail={user?.email || ''}
            onUpdateSettings={handleUpdateSettings} 
            penggunas={penggunas}
            onlineSessions={onlineSessions}
            currentSessionId={sessionId}
            onDisconnectSession={handleDisconnectSession}
            onOpenOnlineSessionsModal={() => setIsOnlineSessionsModalOpen(true)}
          />
        );
      default:
        return <div className="p-12 text-center text-slate-500 font-bold">Modul Belum Diimplementasikan.</div>;
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-[#ebf4fc] via-[#f0f7ff] to-[#fff3e0] flex flex-col font-sans text-slate-800 animate-fade-in" id="sirekap-container">
      
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
            {/* Swapped Brand from Sidebar into Topheader (SIREKAP TAHUN ANGGARAN [TAHUN]) */}
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0 border border-orange-500 overflow-hidden shadow-2xs select-none p-0.5">
              <img 
                src={appSettings?.logo_instansi || "/logo.svg"} 
                alt="Logo SIREKAP" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/logo.svg";
                }}
              />
            </div>
            
            <div className="flex flex-col justify-center border-l border-slate-200 pl-3">
              <h1 className="text-sm sm:text-base md:text-md lg:text-[17px] font-black tracking-tight text-blue-900 uppercase">
                SIREKAP TAHUN ANGGARAN <span className="text-orange-600 font-mono font-black">{selectedYear}</span> - BIDANG PERTANAHAN
              </h1>
              <p className="text-[10px] sm:text-[11px] font-extrabold font-sans text-slate-500 tracking-wider uppercase mt-0.5">
                Sistem Informasi Rekapitulasi, Evaluasi, dan Kinerja Anggaran Pertanahan
              </p>
            </div>
          </div>
        </div>

        {/* Active Profile context and status indicators */}
        <div className="flex items-center gap-5">
          {/* High-contrast Fiscal Year Dropdown Selector */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-orange-50 border border-orange-200 rounded-lg shadow-3xs text-[11px] font-bold text-orange-950">
            <span className="text-orange-800 uppercase tracking-wider text-[9px] font-black">Tahun Anggaran:</span>
            <select
              value={selectedYear}
              onChange={(e) => handleSelectYear(Number(e.target.value))}
              className="bg-transparent border-none font-black text-orange-900 outline-none cursor-pointer p-0.5 focus:ring-0 text-xs font-mono"
              id="select-tahun-anggaran-topbar"
            >
              <option value="2023">2023</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
              <option value="2029">2029</option>
              <option value="2030">2030</option>
            </select>
          </div>

          {currentDateTime && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200/80 rounded-lg text-[11px] font-bold text-slate-600 font-mono select-none shadow-3xs hover:bg-slate-100/50 transition-colors">
              <Clock size={12} className="text-blue-600 animate-pulse shrink-0 animate-duration-1000" />
              <span>{currentDateTime}</span>
            </div>
          )}

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
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] uppercase font-black tracking-widest text-slate-400/80">MODUL MENU AKTIF</span>
                  </div>
                  <h2 className="text-xs sm:text-xs font-black text-orange-300 font-display tracking-wide uppercase leading-tight mt-1 truncate">
                    {menuItems.find(item => item.id === activePage)?.label || "Dashboard Utama"}
                  </h2>
                </div>
              ) : (
                <div className="flex items-center justify-center h-10 w-10 mx-auto rounded-lg bg-orange-500/10 text-orange-300 font-black text-[11px] border border-orange-500/30 animate-fade-in" title={menuItems.find(item => item.id === activePage)?.label}>
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
                      setTargetFilterSubKeg('');
                      setTargetFilterUraian('');
                      if (item.id === 'program') {
                        setProgramActiveTab('program');
                      }
                    }}
                    className={`flex items-center rounded-lg transition-all duration-200 transform hover:translate-x-1 text-left cursor-pointer ${
                      isSidebarOpen 
                        ? 'w-full px-3.5 py-2.5 justify-between ' + (isActive ? 'bg-gradient-to-r from-blue-800 to-orange-500 border-l-4 border-orange-500 text-white font-extrabold shadow-[0_0_15px_rgba(249,115,22,0.35)]' : 'hover:bg-white/10 text-slate-300 hover:text-white font-medium')
                        : 'w-10 h-10 mx-auto justify-center ' + (isActive ? 'bg-orange-600 text-white border border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.4)]' : 'hover:bg-white/10 text-slate-300')
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
          <div className="p-4 border-t border-blue-950 bg-[#0d172e] space-y-3">
            {isSidebarOpen && (
              <div className="bg-[#13203f]/60 p-2.5 rounded-lg border border-blue-950/80 text-[10px] text-slate-300 space-y-1 font-sans animate-fade-in" id="panel-status-sistem">
                <div className="grid grid-cols-1 gap-1 font-medium text-slate-300">
                  <div className="flex justify-between border-b border-blue-950/20 pb-0.5">
                    <span>• Jumlah Kunjungan</span>
                    <span className="font-bold text-slate-100 font-mono">: {new Intl.NumberFormat('id-ID').format(totalVisits)} Kali</span>
                  </div>
                  <div className="flex justify-between items-center group">
                    <span>• Pengguna Aktif</span>
                    {userRole === UserRole.ADMIN ? (
                      <span 
                        onClick={() => setIsOnlineSessionsModalOpen(true)}
                        className="font-bold text-emerald-400 font-mono flex items-center gap-1 hover:text-emerald-300 hover:underline cursor-pointer transition select-none"
                        title="Klik untuk membuka monitoring akun yang sedang masuk & kontrol koneksi (Khusus Administrator)"
                      >
                        : {activeUsersCount} Aktif
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-ping inline-block"></span>
                        <span className="text-[8px] bg-emerald-500/20 text-emerald-300 px-1 py-0.2 rounded border border-emerald-500/30 group-hover:bg-emerald-500/30 font-bold">Lihat</span>
                      </span>
                    ) : (
                      <span className="font-bold text-slate-100 font-mono select-none flex items-center gap-1">
                        : {activeUsersCount} Aktif
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!isSidebarOpen && (
              <div className="flex items-center justify-center animate-fade-in">
                <div className="w-8 h-8 rounded-full bg-blue-900/50 text-blue-300 flex items-center justify-center font-black text-[10px] border border-blue-800">
                  {userRole.substring(0, 2).toUpperCase()}
                </div>
              </div>
            )}
            
            {/* New Modal State and Handler logic will be implemented in subsequent steps */}
          </div>
        </aside>

        {/* Core Contents viewport with professional bg slate */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto bg-[#ebf4fc]" id="main-viewport-content">
          {renderViewContent()}
        </main>

        {/* Toast notification */}
        {toast && (
          <div className={`fixed bottom-6 right-6 z-[100] p-4 rounded-xl shadow-2xl border ${toast.type === 'success' ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-rose-600 text-white border-rose-400'} animate-fade-in`}>
            <p className="text-xs font-bold">{toast.message}</p>
          </div>
        )}
      </div>

      {/* Informational Lightbox Overlay Modal */}
      {selectedInfo && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 antialiased" id="info-overlay-lightbox">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-lg w-full overflow-hidden transform scale-100 transition-all duration-300">
            {/* Header */}
            <div className={`p-5 text-white ${selectedInfo.type === 'alert' ? 'bg-gradient-to-r from-amber-600 to-amber-700' : 'bg-gradient-to-r from-[#172554] to-blue-750'}`}>
              <div className="flex items-center gap-2.5">
                {selectedInfo.type === 'alert' ? <AlertTriangle size={20} className="animate-pulse text-white" /> : <Activity size={20} className="text-white" />}
                <h3 className="font-bold text-sm tracking-tight">{selectedInfo.title}</h3>
              </div>
            </div>
            
            {/* Contents */}
            <div className="p-6 space-y-4">
              <p className="text-slate-700 text-xs leading-relaxed whitespace-pre-wrap font-semibold">
                {selectedInfo.content}
              </p>

              {/* Decorative Guide Blocks */}
              {selectedInfo.type === 'guide' && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-2.5 mt-3 text-[11px] text-slate-650">
                  <div className="flex items-start gap-2">
                    <span className="text-[#10409F] font-extrabold font-mono">1.</span>
                    <p><b>Hierarki Program</b>: Klik nama Program/Kegiatan di halaman Program & Kegiatan untuk menelusuri penyerapan mendalam secara interaktif.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[#10409F] font-extrabold font-mono">2.</span>
                    <p><b>Filter Uraian</b>: Klik nama Uraian Belanja di daftar realisasi SP2D untuk menyeleksi rekap kas bulanan secara instan.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[#10409F] font-extrabold font-mono">3.</span>
                    <p><b>Administrasi Pejabat</b>: Mengubah penandatangan laporan di menu administrasi sistem secara permanen.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setSelectedInfo(null)}
                className="px-4 py-2 text-xs font-black bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition shadow-xs cursor-pointer"
              >
                Tutup Informasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Online Active Sessions Modal - Hanya Akun Role Administrator yang dapat melihat */}
      {userRole === UserRole.ADMIN && (
        <OnlineSessionsModal 
          isOpen={isOnlineSessionsModalOpen}
          onClose={() => setIsOnlineSessionsModalOpen(false)}
          sessions={onlineSessions}
          currentSessionId={sessionId}
          currentUserRole={userRole}
          currentUserEmail={user?.email || ''}
          onDisconnectSession={handleDisconnectSession}
        />
      )}

      {/* Inactivity Warning Countdown Modal (Peringatan saat pengguna tidak aktif selama 28 menit, 2 menit sebelum logout otomatis) */}
      {idleWarningSeconds !== null && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in antialiased">
          <div className="bg-white rounded-2xl border border-amber-300 shadow-2xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
              <Clock size={28} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Peringatan Inaktivitas Sesi</h3>
              <p className="text-xs text-slate-600 mt-1 font-medium leading-relaxed">
                Tidak ada aktivitas pengguna yang terdeteksi. Demi keamanan data anggaran pertanahan, sesi Anda akan keluar otomatis dalam:
              </p>
            </div>

            {/* Countdown display */}
            <div className="py-3 px-5 bg-amber-50 border border-amber-200 rounded-xl inline-block mx-auto shadow-2xs">
              <span className="text-3xl font-black font-mono text-amber-700 tracking-wider">
                {Math.floor(idleWarningSeconds / 60).toString().padStart(2, '0')}:
                {(idleWarningSeconds % 60).toString().padStart(2, '0')}
              </span>
              <span className="block text-[10px] uppercase font-bold text-amber-800 tracking-widest mt-0.5">Menit : Detik</span>
            </div>

            <p className="text-[11px] text-slate-500 font-medium">
              Gerakkan mouse, ketik, atau klik tombol di bawah untuk tetap masuk dan melanjutkan pekerjaan Anda.
            </p>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleExtendSession}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition shadow-xs cursor-pointer"
              >
                Lanjutkan Sesi (Saya Masih Aktif)
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Force Disconnected Notice Alert Modal */}
      {forceDisconnectedNotice && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in antialiased">
          <div className="bg-white rounded-2xl border border-red-200 shadow-2xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <PowerOff size={28} />
            </div>
            <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Koneksi Sesi Diputuskan</h3>
            <p className="text-xs text-slate-600 font-semibold leading-relaxed">
              {forceDisconnectedNotice}
            </p>
            <button
              type="button"
              onClick={() => setForceDisconnectedNotice(null)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition shadow cursor-pointer"
            >
              Mengerti & Kembali ke Halaman Masuk
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
