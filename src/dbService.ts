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
import { db, auth, handleFirestoreError, OperationType } from './firebase';
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
export const COLL_PRESENCE = 'sibiru_presence';

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

// Helper untuk menentukan nama bulan dari format tanggal YYYY-MM-DD
export function getNamaBulanFromDate(dateStr?: string): string {
  if (!dateStr) return "Januari";
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  try {
    const d = new Date(dateStr);
    const m = d.getMonth();
    if (!isNaN(m) && m >= 0 && m < 12) {
      return months[m];
    }
  } catch (e) {}
  return "Januari";
}

// Sinkronisasi Belanja Pihak Ketiga ke Realisasi SP2D
export async function syncPihakKetigaToSp2d(
  item: BelanjaPihakKetiga,
  linkedSub?: SubKegiatan,
  rkaList: RKA[] = [],
  isDelete: boolean = false,
  oldItem?: BelanjaPihakKetiga
) {
  try {
    const sp2dId = `sp2d_pihak_ketiga_${item.id}`;

    // A. Jika terjadi perubahan jenis belanja (uraian_belanja) atau sub kegiatan pada pihak ketiga
    if (oldItem && (oldItem.uraian_belanja !== item.uraian_belanja || oldItem.kode_sub_kegiatan !== item.kode_sub_kegiatan)) {
      const oldUraianClean = (oldItem.uraian_belanja || '').trim().toLowerCase();
      const qExisting = await getDocs(
        query(
          collection(db, COLL_REALISASI),
          where("kode_sub_kegiatan", "==", oldItem.kode_sub_kegiatan)
        )
      ).catch(() => null);

      if (qExisting && !qExisting.empty) {
        for (const docSnap of qExisting.docs) {
          const rData = docSnap.data() as Realisasi;
          const isDirectLink = rData.id_pihak_ketiga === item.id || docSnap.id === sp2dId;
          const isUraianMatch = (rData.uraian_belanja || '').trim().toLowerCase() === oldUraianClean;

          if (isDirectLink || isUraianMatch) {
            const matchedRkaNew = rkaList.find(r => 
              r.kode_sub_kegiatan === item.kode_sub_kegiatan && 
              r.uraian_belanja.trim().toLowerCase() === (item.uraian_belanja || '').trim().toLowerCase()
            );
            const paguAmt = matchedRkaNew ? matchedRkaNew.jumlah : (linkedSub?.pagu || 0);
            const nom = rData.nominal_realisasi || 0;
            const persentase = paguAmt > 0 ? (nom / paguAmt) * 100 : 0;

            await updateDoc(doc(db, COLL_REALISASI, docSnap.id), {
              kode_sub_kegiatan: item.kode_sub_kegiatan,
              kode_program: linkedSub?.kode_program || item.kode_program || rData.kode_program,
              kode_kegiatan: linkedSub?.kode_kegiatan || item.kode_kegiatan || rData.kode_kegiatan,
              uraian_belanja: item.uraian_belanja || 'Belanja Pihak Ketiga',
              pagu_anggaran_terpantau: paguAmt,
              persentase_realisasi: parseFloat(persentase.toFixed(2)),
              sisa_anggaran: paguAmt - nom,
              id_pihak_ketiga: item.id
            }).catch(e => console.warn("Failed updating linked SP2D on uraian change:", e));
          }
        }
      }
    }

    // B. Handle Hapus (Deletion)
    if (isDelete) {
      const sp2dDocRef = doc(db, COLL_REALISASI, sp2dId);
      const snap = await getDoc(sp2dDocRef).catch(() => null);
      if (snap && snap.exists()) {
        await deleteDoc(sp2dDocRef).catch(err => console.warn("Notice: gagal menghapus sp2d linked:", err));
      }

      const qLinked = await getDocs(
        query(
          collection(db, COLL_REALISASI),
          where("id_pihak_ketiga", "==", item.id)
        )
      ).catch(() => null);

      if (qLinked && !qLinked.empty) {
        for (const docSnap of qLinked.docs) {
          if (docSnap.id === sp2dId) continue;
          await updateDoc(doc(db, COLL_REALISASI, docSnap.id), {
            id_pihak_ketiga: null
          }).catch(e => console.warn("Failed unlinking SP2D:", e));
        }
      }
      return;
    }

    // C. Handle Tambah / Update Belanja Pihak Ketiga
    const matchedRka = rkaList.find(r => 
      r.kode_sub_kegiatan === item.kode_sub_kegiatan && 
      (r.uraian_belanja.trim().toLowerCase() === (item.uraian_belanja || '').trim().toLowerCase())
    );
    const paguAmt = matchedRka ? matchedRka.jumlah : (linkedSub?.pagu || 0);
    const nominal = Number(item.realisasi) || 0;
    const persentase = paguAmt > 0 ? (nominal / paguAmt) * 100 : 0;
    const sisa = paguAmt - nominal;
    const bulan = getNamaBulanFromDate(item.tanggal);
    const tahun = item.tahun || (item.tanggal ? new Date(item.tanggal).getFullYear() : 2026);

    // Periksa apakah ada SP2D kustom yang terhubung ke item.id selain sp2dId
    const qCustomSp2d = await getDocs(
      query(
        collection(db, COLL_REALISASI),
        where("id_pihak_ketiga", "==", item.id)
      )
    ).catch(() => null);

    const customDocs = qCustomSp2d ? qCustomSp2d.docs.filter(d => d.id !== sp2dId) : [];

    if (customDocs.length > 0) {
      // Ada SP2D kustom yang dibuat pengguna di menu Realisasi SP2D
      for (const cDoc of customDocs) {
        await updateDoc(doc(db, COLL_REALISASI, cDoc.id), {
          kode_sub_kegiatan: item.kode_sub_kegiatan,
          uraian_belanja: item.uraian_belanja || 'Belanja Pihak Ketiga',
          pagu_anggaran_terpantau: paguAmt
        }).catch(e => console.warn("Update custom SP2D linked warning:", e));
      }
    } else {
      // SP2D bawaan otomatis
      if (nominal > 0) {
        const sp2dPayload: Realisasi = {
          id: sp2dId,
          tanggal: item.tanggal || new Date().toISOString().substring(0, 10),
          bulan: bulan,
          tahun: tahun,
          kode_program: linkedSub?.kode_program || item.kode_program || '',
          kode_kegiatan: linkedSub?.kode_kegiatan || item.kode_kegiatan || '',
          kode_sub_kegiatan: item.kode_sub_kegiatan,
          uraian_belanja: item.uraian_belanja || 'Belanja Pihak Ketiga',
          nominal_realisasi: nominal,
          persentase_realisasi: parseFloat(persentase.toFixed(2)),
          sisa_anggaran: sisa,
          pagu_anggaran_terpantau: paguAmt,
          keterangan: `[Belanja Pihak Ketiga] ${item.nama_pelaksana ? item.nama_pelaksana + ' | ' : ''}Kontrak: ${item.nomor_kontrak || '-'}${item.catatan ? ' | ' + item.catatan : ''}`,
          bukti_transaksi: item.foto_kegiatan || undefined,
          bukti_transaksi_public_id: item.foto_kegiatan_public_id || undefined,
          id_pihak_ketiga: item.id
        };
        await setDoc(doc(db, COLL_REALISASI, sp2dId), sp2dPayload, { merge: true });
      } else {
        const sp2dDocRef = doc(db, COLL_REALISASI, sp2dId);
        const snap = await getDoc(sp2dDocRef).catch(() => null);
        if (snap && snap.exists()) {
          await deleteDoc(sp2dDocRef).catch(() => null);
        }
      }
    }
  } catch (err) {
    console.warn("syncPihakKetigaToSp2d warning:", err);
  }
}

// Sinkronisasi Realisasi SP2D ke Belanja Pihak Ketiga
export async function syncSp2dToPihakKetiga(
  real: Realisasi,
  isDelete: boolean = false,
  oldReal?: Realisasi
) {
  try {
    const cleanRealUraian = (real.uraian_belanja || '').trim().toLowerCase();
    const cleanOldUraian = (oldReal?.uraian_belanja || '').trim().toLowerCase();

    // A. Jika terjadi perubahan jenis belanja (uraian_belanja) pada SP2D
    if (oldReal && oldReal.uraian_belanja !== real.uraian_belanja) {
      const targetPksToRename: string[] = [];
      if (real.id_pihak_ketiga) {
        targetPksToRename.push(real.id_pihak_ketiga);
      }
      if (cleanOldUraian) {
        const qPkOld = await getDocs(
          query(
            collection(db, COLL_BELANJA_PIHAK_KETIGA),
            where("kode_sub_kegiatan", "==", oldReal.kode_sub_kegiatan || real.kode_sub_kegiatan)
          )
        ).catch(() => null);

        if (qPkOld && !qPkOld.empty) {
          qPkOld.docs.forEach(d => {
            const pkUraian = (d.data().uraian_belanja || '').trim().toLowerCase();
            if (pkUraian === cleanOldUraian) {
              if (!targetPksToRename.includes(d.id)) {
                targetPksToRename.push(d.id);
              }
            }
          });
        }
      }

      for (const pkId of targetPksToRename) {
        await updateDoc(doc(db, COLL_BELANJA_PIHAK_KETIGA, pkId), {
          uraian_belanja: real.uraian_belanja.trim(),
          kode_sub_kegiatan: real.kode_sub_kegiatan
        }).catch(e => console.warn("Rename pihak ketiga from SP2D warning:", e));
      }
    }

    // B. Cari semua Pihak Ketiga yang relevan untuk kalkulasi ulang realisasinya
    const targetPkDocs: { id: string; uraian_belanja: string; kode_sub_kegiatan: string }[] = [];

    if (real.id_pihak_ketiga) {
      const pkRef = doc(db, COLL_BELANJA_PIHAK_KETIGA, real.id_pihak_ketiga);
      const pkSnap = await getDoc(pkRef).catch(() => null);
      if (pkSnap && pkSnap.exists()) {
        const d = pkSnap.data();
        targetPkDocs.push({ id: pkSnap.id, uraian_belanja: d.uraian_belanja || real.uraian_belanja, kode_sub_kegiatan: d.kode_sub_kegiatan || real.kode_sub_kegiatan });
      }
    }

    const qPk = await getDocs(
      query(
        collection(db, COLL_BELANJA_PIHAK_KETIGA),
        where("kode_sub_kegiatan", "==", real.kode_sub_kegiatan)
      )
    ).catch(() => null);

    if (qPk && !qPk.empty) {
      qPk.docs.forEach(d => {
        const pkData = d.data();
        const u = (pkData.uraian_belanja || '').trim().toLowerCase();
        if (u === cleanRealUraian || (cleanOldUraian && u === cleanOldUraian)) {
          if (!targetPkDocs.some(t => t.id === d.id)) {
            targetPkDocs.push({ id: d.id, uraian_belanja: pkData.uraian_belanja, kode_sub_kegiatan: pkData.kode_sub_kegiatan });
          }
        }
      });
    }

    // C. Untuk setiap target Pihak Ketiga, hitung total akumulasi SP2D yang aktif
    if (targetPkDocs.length > 0) {
      const qAllReal = await getDocs(
        query(
          collection(db, COLL_REALISASI),
          where("kode_sub_kegiatan", "==", real.kode_sub_kegiatan)
        )
      ).catch(() => null);

      const allRealList: { id: string; data: Realisasi }[] = [];
      if (qAllReal && !qAllReal.empty) {
        qAllReal.docs.forEach(d => {
          allRealList.push({ id: d.id, data: d.data() as Realisasi });
        });
      }

      for (const targetPk of targetPkDocs) {
        const targetUraianClean = (targetPk.uraian_belanja || real.uraian_belanja).trim().toLowerCase();
        let totalRealisasi = 0;
        let lastFoto = '';
        let lastFotoId = '';

        allRealList.forEach(({ id: rId, data: rData }) => {
          if (isDelete && rId === real.id) return;

          const isCurrentDoc = rId === real.id;
          const currentNominal = isCurrentDoc ? real.nominal_realisasi : (rData.nominal_realisasi || 0);
          const currentUraian = (isCurrentDoc ? real.uraian_belanja : (rData.uraian_belanja || '')).trim().toLowerCase();
          const currentPihakId = isCurrentDoc ? real.id_pihak_ketiga : rData.id_pihak_ketiga;

          const isDirectLink = currentPihakId === targetPk.id || rId === `sp2d_pihak_ketiga_${targetPk.id}`;
          const isUraianMatch = currentUraian === targetUraianClean || currentUraian === cleanRealUraian;

          if (isDirectLink || isUraianMatch) {
            totalRealisasi += Number(currentNominal) || 0;
            if (isCurrentDoc && real.bukti_transaksi) {
              lastFoto = real.bukti_transaksi;
              lastFotoId = real.bukti_transaksi_public_id || '';
            } else if (rData.bukti_transaksi) {
              lastFoto = rData.bukti_transaksi;
              lastFotoId = rData.bukti_transaksi_public_id || '';
            }
          }
        });

        if (!isDelete && !allRealList.some(r => r.id === real.id)) {
          const isDirectLink = real.id_pihak_ketiga === targetPk.id || real.id === `sp2d_pihak_ketiga_${targetPk.id}`;
          const isUraianMatch = cleanRealUraian === targetUraianClean;
          if (isDirectLink || isUraianMatch) {
            totalRealisasi += Number(real.nominal_realisasi) || 0;
            if (real.bukti_transaksi) {
              lastFoto = real.bukti_transaksi;
              lastFotoId = real.bukti_transaksi_public_id || '';
            }
          }
        }

        const updatePayload: any = {
          realisasi: totalRealisasi,
          uraian_belanja: real.uraian_belanja.trim()
        };
        if (lastFoto) {
          updatePayload.foto_kegiatan = lastFoto;
          updatePayload.foto_kegiatan_public_id = lastFotoId;
        }

        await updateDoc(doc(db, COLL_BELANJA_PIHAK_KETIGA, targetPk.id), updatePayload).catch(err => {
          console.warn("Failed updating pihak ketiga realisasi & uraian:", err);
        });
      }
    }
  } catch (err) {
    console.warn("syncSp2dToPihakKetiga warning:", err);
  }
}

// Sinkronisasi perubahan RKA / Perubahan Anggaran ke Realisasi dan Belanja Pihak Ketiga
export async function syncRkaChangesToAll(
  oldSubKeg: string,
  oldUraian: string,
  newSubKeg: string,
  newUraian: string,
  newJumlah: number,
  isDelete: boolean = false
) {
  try {
    const cleanOldUraian = oldUraian.trim().toLowerCase();
    const cleanNewUraian = newUraian.trim();

    // A. Sinkronisasi ke koleksi Realisasi SP2D
    const qReal = await getDocs(
      query(
        collection(db, COLL_REALISASI),
        where("kode_sub_kegiatan", "==", oldSubKeg)
      )
    ).catch(() => null);

    if (qReal && !qReal.empty) {
      for (const rDoc of qReal.docs) {
        const d = rDoc.data() as Realisasi;
        if ((d.uraian_belanja || '').trim().toLowerCase() === cleanOldUraian) {
          const nominal = d.nominal_realisasi || 0;
          if (isDelete) {
            await updateDoc(doc(db, COLL_REALISASI, rDoc.id), {
              pagu_anggaran_terpantau: 0,
              persentase_realisasi: 0,
              sisa_anggaran: 0 - nominal
            }).catch(e => console.warn("Update realisasi after RKA deletion warning:", e));
          } else {
            const persentase = newJumlah > 0 ? (nominal / newJumlah) * 100 : 0;
            await updateDoc(doc(db, COLL_REALISASI, rDoc.id), {
              kode_sub_kegiatan: newSubKeg,
              uraian_belanja: cleanNewUraian,
              pagu_anggaran_terpantau: newJumlah,
              persentase_realisasi: parseFloat(persentase.toFixed(2)),
              sisa_anggaran: newJumlah - nominal
            }).catch(e => console.warn("Update realisasi after RKA change warning:", e));
          }
        }
      }
    }

    // B. Sinkronisasi ke koleksi Belanja Pihak Ketiga
    const qPk = await getDocs(
      query(
        collection(db, COLL_BELANJA_PIHAK_KETIGA),
        where("kode_sub_kegiatan", "==", oldSubKeg)
      )
    ).catch(() => null);

    if (qPk && !qPk.empty) {
      for (const pkDoc of qPk.docs) {
        const d = pkDoc.data() as BelanjaPihakKetiga;
        if ((d.uraian_belanja || '').trim().toLowerCase() === cleanOldUraian) {
          if (!isDelete) {
            await updateDoc(doc(db, COLL_BELANJA_PIHAK_KETIGA, pkDoc.id), {
              kode_sub_kegiatan: newSubKeg,
              uraian_belanja: cleanNewUraian
            }).catch(e => console.warn("Update pihak ketiga after RKA change warning:", e));
          }
        }
      }
    }
  } catch (err) {
    console.warn("syncRkaChangesToAll warning:", err);
  }
}

// Sinkronisasi jika kode sub kegiatan diganti
export async function syncSubKegiatanCodeChangeToAll(oldKode: string, newKode: string) {
  if (!oldKode || !newKode || oldKode === newKode) return;
  try {
    const qRka = await getDocs(query(collection(db, COLL_RKA), where("kode_sub_kegiatan", "==", oldKode))).catch(() => null);
    if (qRka && !qRka.empty) {
      for (const docSnap of qRka.docs) {
        await updateDoc(doc(db, COLL_RKA, docSnap.id), { kode_sub_kegiatan: newKode }).catch(() => null);
      }
    }
    const qReal = await getDocs(query(collection(db, COLL_REALISASI), where("kode_sub_kegiatan", "==", oldKode))).catch(() => null);
    if (qReal && !qReal.empty) {
      for (const docSnap of qReal.docs) {
        await updateDoc(doc(db, COLL_REALISASI, docSnap.id), { kode_sub_kegiatan: newKode }).catch(() => null);
      }
    }
    const qPk = await getDocs(query(collection(db, COLL_BELANJA_PIHAK_KETIGA), where("kode_sub_kegiatan", "==", oldKode))).catch(() => null);
    if (qPk && !qPk.empty) {
      for (const docSnap of qPk.docs) {
        await updateDoc(doc(db, COLL_BELANJA_PIHAK_KETIGA, docSnap.id), { kode_sub_kegiatan: newKode }).catch(() => null);
      }
    }
  } catch (e) {
    console.warn("syncSubKegiatanCodeChangeToAll warning:", e);
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
      const subYear = sub.tahun || 2026;
      // Find related RKA items
      const subRka = rkaList.filter(r => r.kode_sub_kegiatan === sub.kode_sub_kegiatan && (r.tahun || 2026) === subYear);
      // If there are RKA items, Pagu is the sum. Otherwise, keep the set pagu (or 0)
      const computedPagu = subRka.length > 0 ? subRka.reduce((sum, item) => sum + (item.jumlah || 0), 0) : (sub.pagu || 0);

      // Sum of related Realisasis
      const subRealisasi = realisasiList
        .filter(r => r.kode_sub_kegiatan === sub.kode_sub_kegiatan && (r.tahun || 2026) === subYear)
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
      const kegYear = keg.tahun || 2026;
      const childSubs = subKegiatans.filter(s => s.kode_kegiatan === keg.kode_kegiatan && (s.tahun || 2026) === kegYear);
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
      const progYear = prog.tahun || 2026;
      const childKegs = kegiatans.filter(k => k.kode_program === prog.kode_program && (k.tahun || 2026) === progYear);
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
  if (!auth.currentUser) {
    return;
  }
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
        logo_instansi: "https://firebasestorage.googleapis.com/v0/b/bidang-pertanahan.firebasestorage.app/o/bimatanahku%2Flogo%20kab.png?alt=media&token=678421d5-13c6-44d5-9e9e-82283be5e25f"
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
    console.warn("Notice during initial data check/cleanup:", error);
  }
}

/**
 * Force disconnects an active user session by Administrator
 */
export async function forceDisconnectSession(
  sessionId: string,
  adminEmail: string,
  targetEmail: string,
  targetName?: string
): Promise<void> {
  const sessionRef = doc(db, COLL_PRESENCE, sessionId);
  await setDoc(sessionRef, {
    status: 'force_disconnected',
    disconnected_by: adminEmail,
    disconnected_at: Date.now()
  }, { merge: true });

  await createAuditLog(
    adminEmail,
    'ADMIN',
    `PUTUSKAN KONEKSI PENGGUNA (${targetEmail})`,
    'MANAJEMEN_SESI',
    { sessionId, targetEmail, targetName },
    { status: 'FORCE_DISCONNECTED', disconnected_by: adminEmail, disconnected_at: new Date().toISOString() }
  );
}

