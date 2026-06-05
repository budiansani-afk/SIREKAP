import { 
  collection, 
  getDocs, 
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
  MonitoringFisik, 
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
export const COLL_MONITORING_FISIK = 'sibiru_monitoring_fisik';
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
    console.log("SIBIRU Bottom-up real-time calculations sync completed");
  } catch (error) {
    console.error("Error synchronizing calculations:", error);
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
      COLL_MONITORING_FISIK,
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
      COLL_MONITORING_FISIK,
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

// 4. Seeding Initial Static Data for 2026 Admin & Operator Demo
// When the app starts first time with empty tables, we seed
export async function seedInitialDataIfEmpty() {
  try {
    const qProg = await getDocs(collection(db, COLL_PROGRAM)).catch(err => handleFirestoreError(err, OperationType.LIST, COLL_PROGRAM)) as any;
    if (qProg.empty) {
      console.log("Seeding initial data for SIBIRU Bidang Pertanahan 2026...");
      
      // Program Seed
      const samplePrograms: Program[] = [
        {
          id: "2.10.01",
          kode_program: "2.10.01",
          nama_program: "PROGRAM PENUNJANG URUSAN PEMERINTAHAN DAERAH KABUPATEN/KOTA",
          pagu: 750000000,
          realisasi: 0,
          sisa: 750000000,
          persentase: 0
        },
        {
          id: "2.10.02",
          kode_program: "2.10.02",
          nama_program: "PROGRAM PENYELESAIAN MASALAH GANTI KERUGIAN DAN SANTUNAN TANAH UNTUK PEMBANGUNAN",
          pagu: 1200000000,
          realisasi: 0,
          sisa: 1200000000,
          persentase: 0
        },
        {
          id: "2.10.03",
          kode_program: "2.10.03",
          nama_program: "PROGRAM PENATAAN, PENGUASAAN, PEMILIKAN, PENGGUNAAN DAN PEMANFAATAN TANAH",
          pagu: 450000000,
          realisasi: 0,
          sisa: 450000000,
          persentase: 0
        }
      ];

      for (const p of samplePrograms) {
        await setDoc(doc(db, COLL_PROGRAM, p.id), p);
      }

      // Kegiatan Seed
      const sampleKegiatans: Kegiatan[] = [
        {
          id: "2.10.01.2.01",
          kode_kegiatan: "2.10.01.2.01",
          nama_kegiatan: "Penyediaan Gaji dan Tunjangan ASN Bidang Pertanahan",
          kode_program: "2.10.01",
          pagu: 400000000,
          realisasi: 0,
          sisa: 400000000,
          persentase: 0
        },
        {
          id: "2.10.01.2.06",
          kode_kegiatan: "2.10.01.2.06",
          nama_kegiatan: "Administrasi Keuangan dan Operasional Kantor",
          kode_program: "2.10.01",
          pagu: 350000000,
          realisasi: 0,
          sisa: 350000000,
          persentase: 0
        },
        {
          id: "2.10.02.2.01",
          kode_kegiatan: "2.10.02.2.01",
          nama_kegiatan: "Identifikasi, Inventarisasi, dan Sertifikasi Tanah Pemda Kabupaten Bima",
          kode_program: "2.10.02",
          pagu: 800000000,
          realisasi: 0,
          sisa: 800000000,
          persentase: 0
        },
        {
          id: "2.10.02.2.02",
          kode_kegiatan: "2.10.02.2.02",
          nama_kegiatan: "Penyelesaian Sengketa Tanah Fasilitas Umum Daerah Bima",
          kode_program: "2.10.02",
          pagu: 400000000,
          realisasi: 0,
          sisa: 400000000,
          persentase: 0
        },
        {
          id: "2.10.03.2.01",
          kode_kegiatan: "2.10.03.2.01",
          nama_kegiatan: "Penyusunan Rencana Detail Tata Guna Tanah Sektoral",
          kode_program: "2.10.03",
          pagu: 450000000,
          realisasi: 0,
          sisa: 450000000,
          persentase: 0
        }
      ];

      for (const k of sampleKegiatans) {
        await setDoc(doc(db, COLL_KEGIATAN, k.id), k);
      }

      // Sub-Kegiatan Seed
      const sampleSubKegiatans: SubKegiatan[] = [
        {
          id: "2.10.01.2.01.01",
          kode_sub_kegiatan: "2.10.01.2.01.01",
          nama_sub_kegiatan: "Pembayaran Gaji Pokok dan Tunjangan Melekat ASN Pertanahan",
          kode_program: "2.10.01",
          kode_kegiatan: "2.10.01.2.01",
          pagu: 400000000,
          realisasi: 0,
          sisa: 400000000,
          persentase: 0
        },
        {
          id: "2.10.01.2.06.01",
          kode_sub_kegiatan: "2.10.01.2.06.01",
          nama_sub_kegiatan: "Penyediaan Alat Tulis Kantor, Konsumsi, dan Rapat Koordinasi",
          kode_program: "2.10.01",
          kode_kegiatan: "2.10.01.2.06",
          pagu: 150000000,
          realisasi: 0,
          sisa: 150000000,
          persentase: 0
        },
        {
          id: "2.10.01.2.06.02",
          kode_sub_kegiatan: "2.10.01.2.06.02",
          nama_sub_kegiatan: "Perjalanan Dinas Koordinasi Pertanahan lintas Provinsi/Kabupaten",
          kode_program: "2.10.01",
          kode_kegiatan: "2.10.01.2.06",
          pagu: 200000000,
          realisasi: 0,
          sisa: 200000000,
          persentase: 0
        },
        {
          id: "2.10.02.2.01.01",
          kode_sub_kegiatan: "2.10.02.2.01.01",
          nama_sub_kegiatan: "Pengukuran Fisik dan Penerbitan Sertifikat Hak Pakai Tanah Pemda",
          kode_program: "2.10.02",
          kode_kegiatan: "2.10.02.2.01",
          pagu: 500000000,
          realisasi: 0,
          sisa: 500000000,
          persentase: 0
        },
        {
          id: "2.10.02.2.01.02",
          kode_sub_kegiatan: "2.10.02.2.01.02",
          nama_sub_kegiatan: "Honorarium Tim Inventarisasi dan Pembebasan Lahan Daerah",
          kode_program: "2.10.02",
          kode_kegiatan: "2.10.02.2.01",
          pagu: 300000000,
          realisasi: 0,
          sisa: 300000000,
          persentase: 0
        },
        {
          id: "2.10.02.2.02.01",
          kode_sub_kegiatan: "2.10.02.2.02.01",
          nama_sub_kegiatan: "Mediasi dan Advokasi Hukum Sengketa Batas Tanah Fasum",
          kode_program: "2.10.02",
          kode_kegiatan: "2.10.02.2.02",
          pagu: 400000000,
          realisasi: 0,
          sisa: 400000000,
          persentase: 0
        },
        {
          id: "2.10.03.2.01.01",
          kode_sub_kegiatan: "2.10.03.2.01.01",
          nama_sub_kegiatan: "Penyusunan Peta Digital Penggunaan Lahan Wilayah Kabupaten Bima",
          kode_program: "2.10.03",
          kode_kegiatan: "2.10.03.2.01",
          pagu: 450000000,
          realisasi: 0,
          sisa: 450000000,
          persentase: 0
        }
      ];

      for (const s of sampleSubKegiatans) {
        await setDoc(doc(db, COLL_SUB_KEGIATAN, s.id), s);
      }

      // RKA Seed - Default items to help calculate Pagu perfectly
      const sampleRKAList: RKA[] = [
        {
          id: "rka_seed_1",
          tahun: 2026,
          kode_program: "2.10.01",
          kode_kegiatan: "2.10.01.2.01",
          kode_sub_kegiatan: "2.10.01.2.01.01",
          kode_rekening: "5.1.01.01.0001",
          uraian_belanja: "Belanja Gaji Pokok PNS Bidang Pertanahan (12 Bulan)",
          volume: 12,
          satuan: "Bulan",
          harga_satuan: 25000000,
          jumlah: 300000000,
          tw1: 75000000,
          tw2: 75000000,
          tw3: 75000000,
          tw4: 75000000
        },
        {
          id: "rka_seed_2",
          tahun: 2026,
          kode_program: "2.10.01",
          kode_kegiatan: "2.10.01.2.01",
          kode_sub_kegiatan: "2.10.01.2.01.01",
          kode_rekening: "5.1.01.02.0002",
          uraian_belanja: "Tunjangan Tambahan Penghasilan PNS Pertanahan (12 Bulan)",
          volume: 12,
          satuan: "Bulan",
          harga_satuan: 8333333,
          jumlah: 100000000,
          tw1: 25000000,
          tw2: 25000000,
          tw3: 25000000,
          tw4: 25000000
        },
        {
          id: "rka_seed_3",
          tahun: 2026,
          kode_program: "2.10.01",
          kode_kegiatan: "2.10.01.2.06",
          kode_sub_kegiatan: "2.10.01.2.06.01",
          kode_rekening: "5.1.02.01.0004",
          uraian_belanja: "Belanja Alat Tulis Kantor (ATK) Operasional Bidang",
          volume: 1,
          satuan: "Paket",
          harga_satuan: 50000000,
          jumlah: 50000000,
          tw1: 15000000,
          tw2: 15000000,
          tw3: 10000000,
          tw4: 10000000
        },
        {
          id: "rka_seed_4",
          tahun: 2026,
          kode_program: "2.10.01",
          kode_kegiatan: "2.10.01.2.06",
          kode_sub_kegiatan: "2.10.01.2.06.01",
          kode_rekening: "5.1.02.01.0035",
          uraian_belanja: "Belanja Jamuan Konsumsi dan Rapat Koordinasi internal",
          volume: 100,
          satuan: "Kotak",
          harga_satuan: 1000000,
          jumlah: 100000000,
          tw1: 25000000,
          tw2: 25000000,
          tw3: 25000000,
          tw4: 25000000
        },
        {
          id: "rka_seed_5",
          tahun: 2026,
          kode_program: "2.10.01",
          kode_kegiatan: "2.10.01.2.06",
          kode_sub_kegiatan: "2.10.01.2.06.02",
          kode_rekening: "5.1.02.04.0012",
          uraian_belanja: "Perjalanan Dinas Koordinasi Pengukuran Jalan ke Mataram/Jakarta",
          volume: 4,
          satuan: "Kali",
          harga_satuan: 50000000,
          jumlah: 200000000,
          tw1: 50000000,
          tw2: 50000000,
          tw3: 50000000,
          tw4: 50000000
        },
        {
          id: "rka_seed_6",
          tahun: 2026,
          kode_program: "2.10.02",
          kode_kegiatan: "2.10.02.2.01",
          kode_sub_kegiatan: "2.10.02.2.01.01",
          kode_rekening: "5.2.04.01.0001",
          uraian_belanja: "Biaya Pengukuran dan Pembuatan Peta Batas Kawasan Pemda Bima",
          volume: 1,
          satuan: "Paket",
          harga_satuan: 500000000,
          jumlah: 500000000,
          tw1: 100000000,
          tw2: 200000000,
          tw3: 150000000,
          tw4: 50000000
        },
        {
          id: "rka_seed_7",
          tahun: 2026,
          kode_program: "2.10.02",
          kode_kegiatan: "2.10.02.2.01",
          kode_sub_kegiatan: "2.10.02.2.01.02",
          kode_rekening: "5.1.02.02.0001",
          uraian_belanja: "Honorarium Tim Satgas Inventarisasi Sengketa Tanah Huntap",
          volume: 12,
          satuan: "Bulan",
          harga_satuan: 25000000,
          jumlah: 300000000,
          tw1: 75000000,
          tw2: 75000000,
          tw3: 75000000,
          tw4: 75000000
        },
        {
          id: "rka_seed_8",
          tahun: 2026,
          kode_program: "2.10.02",
          kode_kegiatan: "2.10.02.2.02",
          kode_sub_kegiatan: "2.10.02.2.02.01",
          kode_rekening: "5.1.02.03.0044",
          uraian_belanja: "Belanja Konsultasi dan Advokat Hukum Sengketa Lahan Fasum Bima",
          volume: 1,
          satuan: "Paket",
          harga_satuan: 400000000,
          jumlah: 400000000,
          tw1: 100000000,
          tw2: 100000000,
          tw3: 100000000,
          tw4: 100000000
        },
        {
          id: "rka_seed_9",
          tahun: 2026,
          kode_program: "2.10.03",
          kode_kegiatan: "2.10.03.2.01",
          kode_sub_kegiatan: "2.10.03.2.01.01",
          kode_rekening: "5.2.05.01.0023",
          uraian_belanja: "Desain Sistem Peta Digital Pertanahan Geospasial Kabupaten Bima",
          volume: 1,
          satuan: "Paket",
          harga_satuan: 450000000,
          jumlah: 450000000,
          tw1: 100000000,
          tw2: 150000000,
          tw3: 150000000,
          tw4: 50000000
        }
      ];

      for (const r of sampleRKAList) {
        await setDoc(doc(db, COLL_RKA, r.id), r);
      }

      // Realisasi Seed
      const sampleRealisasis: Realisasi[] = [
        {
          id: "real_seed_1",
          tanggal: "2026-03-31",
          bulan: "Maret",
          kode_program: "2.10.01",
          kode_kegiatan: "2.10.01.2.01",
          kode_sub_kegiatan: "2.10.01.2.01.01",
          uraian_belanja: "Realisasi Gaji & Tunjangan Melekat Triwulan I",
          nominal_realisasi: 75000000,
          persentase_realisasi: 18.75,
          sisa_anggaran: 325000000,
          keterangan: "SP2D Cair Sesuai Pengajuan TW I"
        },
        {
          id: "real_seed_2",
          tanggal: "2026-04-15",
          bulan: "April",
          kode_program: "2.10.01",
          kode_kegiatan: "2.10.01.2.06",
          kode_sub_kegiatan: "2.10.01.2.06.01",
          uraian_belanja: "Pengadaan Kertas, Tinta Printer & ATK Pokok",
          nominal_realisasi: 15000000,
          persentase_realisasi: 10.00,
          sisa_anggaran: 135000000,
          keterangan: "Sesuai Kwitansi No. ATK-04"
        },
        {
          id: "real_seed_3",
          tanggal: "2026-05-10",
          bulan: "Mei",
          kode_program: "2.10.02",
          kode_kegiatan: "2.10.02.2.01",
          kode_sub_kegiatan: "2.10.02.2.01.01",
          uraian_belanja: "Pembayaran DP Tim Pengukuran BPN untuk 15 Bidang Lahan",
          nominal_realisasi: 80000000,
          persentase_realisasi: 16.00,
          sisa_anggaran: 420000000,
          keterangan: "Uang Muka Kerja Pengukuran Lapangan"
        }
      ];

      for (const rx of sampleRealisasis) {
        await setDoc(doc(db, COLL_REALISASI, rx.id), rx);
      }

      // Monitoring Fisik Seed
      const sampleMonitoringFisik: MonitoringFisik[] = [
        {
          id: "mon_seed_1",
          tanggal: "2026-03-31",
          kode_program: "2.10.01",
          kode_kegiatan: "2.10.01.2.01",
          kode_sub_kegiatan: "2.10.01.2.01.01",
          target_fisik: 25,
          realisasi_fisik: 25,
          persentase: 100,
          kendala: "Tidak Ada",
          tindak_lanjut: "Pemantauan rutin pembayaran gaji berkala"
        },
        {
          id: "mon_seed_2",
          tanggal: "2026-05-15",
          kode_program: "2.10.02",
          kode_kegiatan: "2.10.02.2.01",
          kode_sub_kegiatan: "2.10.02.2.01.01",
          target_fisik: 40,
          realisasi_fisik: 32,
          persentase: 80,
          kendala: "Cuaca hujan lebat menghambat koordinasi di beberapa titik koordinat",
          tindak_lanjut: "Menunda pengukuran selama 3 hari dan melanjutkan saat cuaca cerah"
        }
      ];

      for (const mf of sampleMonitoringFisik) {
        await setDoc(doc(db, COLL_MONITORING_FISIK, mf.id), mf);
      }

      // Settings Seed
      const initSettings: PengaturanSistem = {
        id: "aktif",
        tahun_anggaran_aktif: 2026,
        nama_instansi: "Dinas Perumahan dan Kawasan Permukiman",
        logo_instansi: ""
      };
      await setDoc(doc(db, COLL_PENGATURAN, initSettings.id), initSettings);

      // Seed Users
      const sampleUsers: Pengguna[] = [
        {
          id: "admin@sibiru.go.id",
          nama: "Administrator SIBIRU Bima",
          email: "admin@sibiru.go.id",
          role: UserRole.ADMIN,
          aktif: true
        },
        {
          id: "operator@sibiru.go.id",
          nama: "Operator Teknis Pertanahan",
          email: "operator@sibiru.go.id",
          role: UserRole.OPERATOR,
          aktif: true
        },
        {
          id: "pimpinan@sibiru.go.id",
          nama: "Kepala Bidang Pertanahan",
          email: "pimpinan@sibiru.go.id",
          role: UserRole.PIMPINAN,
          aktif: true
        }
      ];

      for (const u of sampleUsers) {
        await setDoc(doc(db, COLL_PENGGUNA, u.id), u);
      }

      console.log("Seed data created. Recalculating everything bottom-up...");
      await synchronizeCalculations();
      console.log("Initial seed & synchronization successfully built!");
    }
  } catch (error) {
    console.error("Error seeding initial data:", error);
  }
}
