import { 
  collection, 
  getDocs, 
  getDoc,
  setDoc, 
  doc, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  query, 
  where,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { 
  Program, 
  Kegiatan, 
  SubKegiatan, 
  RKA, 
  Realisasi, 
  BelanjaPihakKetiga, 
  DokumenArsip, 
  LogAktivitas, 
  Pengguna, 
  PengaturanSistem,
  UserRole
} from './types';

// Constants for collection names
export const COLL_PROGRAM = 'sibiru_program';
export const COLL_KEGIATAN = 'sibiru_kegiatan';
export const COLL_SUB_KEGIATAN = 'sibiru_sub_kegiatan';
export const COLL_RKA = 'sibiru_rka';
export const COLL_REALISASI = 'sibiru_realisasi';
export const COLL_BELANJA_PIHAK_KETIGA = 'sibiru_belanja_pihak_ketiga';
export const COLL_DOKUMEN = 'sibiru_dokumen';
export const COLL_LOG_AKTIVITAS = 'sibiru_log_aktivitas';
export const COLL_PENGGUNA = 'sibiru_pengguna';
export const COLL_PENGATURAN = 'sibiru_pengaturan';

// Standard User-Agent / IP helper for client
const getClientMeta = () => {
  return {
    ip_address: "182.2.42.105", // Mocking local ISP from Bima
    browser: window.navigator.userAgent
  };
};

// 1. Audit Logging Service
export async function createAuditLog(
  userEmail: string,
  userRole: string,
  action: string,
  moduleName: string,
  dataLama?: any,
  dataBaru?: any
) {
  try {
    const meta = getClientMeta();
    const log: Omit<LogAktivitas, 'id'> = {
      waktu: new Date().toISOString(),
      nama_pengguna: userEmail || "Guest User",
      role: userRole || "Unknown Role",
      aksi: action,
      modul: moduleName,
      data_lama: dataLama ? JSON.stringify(dataLama) : undefined,
      data_baru: dataBaru ? JSON.stringify(dataBaru) : undefined,
      ip_address: meta.ip_address,
      browser: meta.browser
    };
    await addDoc(collection(db, COLL_LOG_AKTIVITAS), log);
  } catch (error) {
    console.warn("Failed to write audit log:", error);
  }
}

// 2. Cascading Sync Calculations
// Automatically recalculates all pagu, realisasi, sisa, and persentase
export async function synchronizeCalculations() {
  try {
    // A. Fetch all programs, kegiatans, subkegiatans, rka, & realisasis
    const qProg = await getDocs(collection(db, COLL_PROGRAM)).catch(err => handleFirestoreError(err, OperationType.LIST, COLL_PROGRAM)) as any;
    const qKeg = await getDocs(collection(db, COLL_KEGIATAN)).catch(err => handleFirestoreError(err, OperationType.LIST, COLL_KEGIATAN)) as any;
    const qSub = await getDocs(collection(db, COLL_SUB_KEGIATAN)).catch(err => handleFirestoreError(err, OperationType.LIST, COLL_SUB_KEGIATAN)) as any;
    const qRKA = await getDocs(collection(db, COLL_RKA)).catch(err => handleFirestoreError(err, OperationType.LIST, COLL_RKA)) as any;
    const qReal = await getDocs(collection(db, COLL_REALISASI)).catch(err => handleFirestoreError(err, OperationType.LIST, COLL_REALISASI)) as any;

    const programs: Program[] = qProg.docs.map(d => ({ id: d.id, ...d.data() } as Program));
    const kegiatans: Kegiatan[] = qKeg.docs.map(d => ({ id: d.id, ...d.data() } as Kegiatan));
    const subKegiatans: SubKegiatan[] = qSub.docs.map(d => ({ id: d.id, ...d.data() } as SubKegiatan));
    const rkaList: RKA[] = qRKA.docs.map(d => ({ id: d.id, ...d.data() } as RKA));
    const realisasiList: Realisasi[] = qReal.docs.map(d => ({ id: d.id, ...d.data() } as Realisasi));

    // Maps for faster loop aggregations
    // Sub-Kegiatan level calculations
    for (const sub of subKegiatans) {
      // Find related RKA items
      const subRka = rkaList.filter(r => r.kode_sub_kegiatan === sub.kode_sub_kegiatan);
      // If there are RKA items, Pagu is the sum. Otherwise, keep the set pagu (or 0)
      const computedPagu = subRka.length > 0 ? subRka.reduce((sum, item) => sum + (item.jumlah || 0), 0) : (sub.pagu || 0);

      // Sum of related Realisasis
      const subRealisasi = realisasiList
        .filter(r => r.kode_sub_kegiatan === sub.kode_sub_kegiatan)
        .reduce((sum, item) => sum + (item.nominal_realisasi || 0), 0);

      const sisa = computedPagu - subRealisasi;
      const persentase = computedPagu > 0 ? (subRealisasi / computedPagu) * 100 : 0;

      // Update in Firestore if any value changed
      if (
        sub.pagu !== computedPagu || 
        sub.realisasi !== subRealisasi || 
        sub.sisa !== sisa || 
        Math.abs(sub.persentase - persentase) > 0.01
      ) {
        sub.pagu = computedPagu;
        sub.realisasi = subRealisasi;
        sub.sisa = sisa;
        sub.persentase = parseFloat(persentase.toFixed(2));

        const subDocRef = doc(db, COLL_SUB_KEGIATAN, sub.id);
        await updateDoc(subDocRef, {
          pagu: sub.pagu,
          realisasi: sub.realisasi,
          sisa: sub.sisa,
          persentase: sub.persentase
        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `${COLL_SUB_KEGIATAN}/${sub.id}`));
      }
    }

    // B. Kegiatan level calculations
    for (const keg of kegiatans) {
      const childSubs = subKegiatans.filter(s => s.kode_kegiatan === keg.kode_kegiatan);
      const computedPagu = childSubs.reduce((sum, item) => sum + (item.pagu || 0), 0);
      const computedRealisasi = childSubs.reduce((sum, item) => sum + (item.realisasi || 0), 0);
      const sisa = computedPagu - computedRealisasi;
      const persentase = computedPagu > 0 ? (computedRealisasi / computedPagu) * 100 : 0;

      if (
        keg.pagu !== computedPagu || 
        keg.realisasi !== computedRealisasi || 
        keg.sisa !== sisa || 
        Math.abs(keg.persentase - persentase) > 0.01
      ) {
        keg.pagu = computedPagu;
        keg.realisasi = computedRealisasi;
        keg.sisa = sisa;
        keg.persentase = parseFloat(persentase.toFixed(2));

        const kegDocRef = doc(db, COLL_KEGIATAN, keg.id);
        await updateDoc(kegDocRef, {
          pagu: keg.pagu,
          realisasi: keg.realisasi,
          sisa: keg.sisa,
          persentase: keg.persentase
        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `${COLL_KEGIATAN}/${keg.id}`));
      }
    }

    // C. Program level calculations
    for (const prog of programs) {
      const childKegs = kegiatans.filter(k => k.kode_program === prog.kode_program);
      if (childKegs.length === 0) continue;

      const computedPagu = childKegs.reduce((sum, item) => sum + (item.pagu || 0), 0);
      const computedRealisasi = childKegs.reduce((sum, item) => sum + (item.realisasi || 0), 0);
      const sisa = computedPagu - computedRealisasi;
      const persentase = computedPagu > 0 ? (computedRealisasi / computedPagu) * 100 : 0;

      if (
        prog.pagu !== computedPagu || 
        prog.realisasi !== computedRealisasi || 
        prog.sisa !== sisa || 
        Math.abs(prog.persentase - persentase) > 0.01
      ) {
        prog.pagu = computedPagu;
        prog.realisasi = computedRealisasi;
        prog.sisa = sisa;
        prog.persentase = parseFloat(persentase.toFixed(2));

        const progDocRef = doc(db, COLL_PROGRAM, prog.id);
        await updateDoc(progDocRef, {
          pagu: prog.pagu,
          realisasi: prog.realisasi,
          sisa: prog.sisa,
          persentase: prog.persentase
        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `${COLL_PROGRAM}/${prog.id}`));
      }
    }
    console.log("SIREKAP Bottom-up real-time calculations sync completed");
  } catch (error) {
    console.error("Error synchronizing calculations:", error);
  }
}

export async function clearDatabase() {
  const collectionsToClear = [
    COLL_PROGRAM,
    COLL_KEGIATAN,
    COLL_SUB_KEGIATAN,
    COLL_RKA,
    COLL_REALISASI,
    COLL_BELANJA_PIHAK_KETIGA,
    COLL_DOKUMEN,
    COLL_PENGGUNA,
    COLL_PENGATURAN,
    COLL_LOG_AKTIVITAS
  ];
  for (const collName of collectionsToClear) {
    const snapshot = await getDocs(collection(db, collName));
    for (const docSnap of snapshot.docs) {
      await deleteDoc(doc(db, collName, docSnap.id));
    }
  }
}

// 3. Backup & Restore Data
export async function backupDatabaseToJSON() {
  try {
    const collectionsToBackup = [
      COLL_PROGRAM,
      COLL_KEGIATAN,
      COLL_SUB_KEGIATAN,
      COLL_RKA,
      COLL_REALISASI,
      COLL_BELANJA_PIHAK_KETIGA,
      COLL_DOKUMEN,
      COLL_PENGGUNA,
      COLL_PENGATURAN
    ];

    const backupData: Record<string, any[]> = {};

    for (const collName of collectionsToBackup) {
      const snapshot = await getDocs(collection(db, collName)).catch(err => handleFirestoreError(err, OperationType.LIST, collName)) as any;
      backupData[collName] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    return backupData;
  } catch (error) {
    console.error("Error during database backup:", error);
    throw error;
  }
}

export async function restoreDatabaseFromJSON(backupData: Record<string, any[]>, userEmail: string, userRole: string) {
  try {
    const collectionsToRestore = [
      COLL_PROGRAM,
      COLL_KEGIATAN,
      COLL_SUB_KEGIATAN,
      COLL_RKA,
      COLL_REALISASI,
      COLL_BELANJA_PIHAK_KETIGA,
      COLL_DOKUMEN,
      COLL_PENGGUNA,
      COLL_PENGATURAN
    ];

    // Simple validation of the structure
    for (const collName of collectionsToRestore) {
      if (!backupData[collName]) {
        throw new Error(`Data restore validator failed: Kunci koleksi "${collName}" tidak ditemukan.`);
      }
    }

    // Process restore
    for (const collName of collectionsToRestore) {
      const items = backupData[collName];
      // Dry clean and set documents
      for (const item of items) {
        const { id, ...data } = item;
        if (id) {
          await setDoc(doc(db, collName, id), data).catch(err => handleFirestoreError(err, OperationType.WRITE, `${collName}/${id}`));
        }
      }
    }

    // Call sync calculations
    await synchronizeCalculations();

    // Log Activity
    await createAuditLog(
      userEmail,
      userRole,
      "RESTORE DATABASE",
      "PENGATURAN",
      null,
      { system_restored: true, timestamp: new Date().toISOString() }
    );

    return true;
  } catch (error) {
    console.error("Error restoring database from JSON:", error);
    throw error;
  }
}

// 4. Clean up any previously seeded dummy/sample data and set up system configurations
export async function seedInitialDataIfEmpty() {
  try {
    const dummyProgramIds = ["2.10.01", "2.10.02", "2.10.03"];
    const dummyKegiatanIds = ["2.10.01.2.01", "2.10.01.2.06", "2.10.02.2.01", "2.10.02.2.02", "2.10.03.2.01"];
    const dummySubKegiatansIds = ["2.10.01.2.01.01", "2.10.01.2.06.01", "2.10.01.2.06.02", "2.10.02.2.01.01", "2.10.02.2.01.02", "2.10.02.2.02.01", "2.10.03.2.01.01"];
    const dummyRkaIds = ["rka_seed_1", "rka_seed_2", "rka_seed_3", "rka_seed_4", "rka_seed_5", "rka_seed_6", "rka_seed_7", "rka_seed_8", "rka_seed_9"];
    const dummyRealisasiIds = ["real_seed_1", "real_seed_2", "real_seed_3"];
    const dummyPihakKetigaIds = ["mon_seed_1", "mon_seed_2"];

    let deletedAny = false;

    for (const id of dummyProgramIds) {
      const docRef = doc(db, COLL_PROGRAM, id);
      const snap = await getDoc(docRef).catch(() => null);
      if (snap && snap.exists()) {
        await deleteDoc(docRef).catch(() => null);
        deletedAny = true;
      }
    }
    for (const id of dummyKegiatanIds) {
      const docRef = doc(db, COLL_KEGIATAN, id);
      const snap = await getDoc(docRef).catch(() => null);
      if (snap && snap.exists()) {
        await deleteDoc(docRef).catch(() => null);
        deletedAny = true;
      }
    }
    for (const id of dummySubKegiatansIds) {
      const docRef = doc(db, COLL_SUB_KEGIATAN, id);
      const snap = await getDoc(docRef).catch(() => null);
      if (snap && snap.exists()) {
        await deleteDoc(docRef).catch(() => null);
        deletedAny = true;
      }
    }
    for (const id of dummyRkaIds) {
      const docRef = doc(db, COLL_RKA, id);
      const snap = await getDoc(docRef).catch(() => null);
      if (snap && snap.exists()) {
        await deleteDoc(docRef).catch(() => null);
        deletedAny = true;
      }
    }
    for (const id of dummyRealisasiIds) {
      const docRef = doc(db, COLL_REALISASI, id);
      const snap = await getDoc(docRef).catch(() => null);
      if (snap && snap.exists()) {
        await deleteDoc(docRef).catch(() => null);
        deletedAny = true;
      }
    }
    for (const id of dummyPihakKetigaIds) {
      const docRef = doc(db, COLL_BELANJA_PIHAK_KETIGA, id);
      const snap = await getDoc(docRef).catch(() => null);
      if (snap && snap.exists()) {
        await deleteDoc(docRef).catch(() => null);
        deletedAny = true;
      }
    }

    if (deletedAny) {
      console.log("Existing dummy/seeded data successfully cleaned up from Firestore!");
      await synchronizeCalculations();
    }

    // 2. Only seed settings & users if they are completely missing, so system functions normally
    const qSettings = await getDocs(collection(db, COLL_PENGATURAN)).catch(() => null) as any;
    if (!qSettings || qSettings.empty) {
      const initSettings: PengaturanSistem = {
        id: "aktif",
        tahun_anggaran_aktif: 2026,
        nama_instansi: "Dinas Perumahan dan Kawasan Permukiman",
        logo_instansi: ""
      };
      await setDoc(doc(db, COLL_PENGATURAN, initSettings.id), initSettings);
    }

    const qUsers = await getDocs(collection(db, COLL_PENGGUNA)).catch(() => null) as any;
    if (!qUsers || qUsers.empty) {
      const sampleUsers: Pengguna[] = [
        {
          id: "admin@sirekap.com",
          nama: "Administrator SIREKAP Bima",
          email: "admin@sirekap.com",
          role: UserRole.ADMIN,
          aktif: true,
          password: "bima2026"
        },
        {
          id: "operator@sirekap.com",
          nama: "Operator Teknis Pertanahan",
          email: "operator@sirekap.com",
          role: UserRole.OPERATOR,
          aktif: true,
          password: "bima2026"
        },
        {
          id: "pimpinan@sirekap.com",
          nama: "Kepala Bidang Pertanahan",
          email: "pimpinan@sirekap.com",
          role: UserRole.PIMPINAN,
          aktif: true,
          password: "bima2026"
        }
      ];

      for (const u of sampleUsers) {
        await setDoc(doc(db, COLL_PENGGUNA, u.id), u);
      }
    }
  } catch (error) {
    console.error("Error during initial data check/cleanup:", error);
  }
}
