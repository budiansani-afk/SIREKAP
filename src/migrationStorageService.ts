/**
 * Migration Service for Firebase Storage
 * Migrates existing photos and documents from legacy Cloudinary/Base64/CDN
 * to Firebase Storage under the exact structured folder hierarchy:
 * sirekap/{tahun}/{program}/{kegiatan}/{subkegiatan}/{jenis_belanja}/{fileName}
 */

import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { 
  COLL_REALISASI, 
  COLL_BELANJA_PIHAK_KETIGA, 
  COLL_DOKUMEN, 
  COLL_PENGATURAN 
} from './dbService';
import { 
  uploadFileToFirebaseStorage, 
  isFirebaseStorageUrl,
  sanitizeStorageSegment 
} from './firebaseStorageService';

export interface MigrationProgressData {
  status: 'idle' | 'running' | 'success' | 'error';
  currentCollection: string;
  currentItem: string;
  completedCount: number;
  totalCount: number;
  log: string;
  stats: {
    realisasi: { total: number; migrated: number; already: number; failed: number };
    pihakKetiga: { total: number; migrated: number; already: number; failed: number };
    dokumen: { total: number; migrated: number; already: number; failed: number };
    pengaturan: { total: number; migrated: number; already: number; failed: number };
  };
}

export interface MigrationResult {
  success: boolean;
  stats: {
    realisasi: { total: number; migrated: number; already: number; failed: number };
    pihakKetiga: { total: number; migrated: number; already: number; failed: number };
    dokumen: { total: number; migrated: number; already: number; failed: number };
    pengaturan: { total: number; migrated: number; already: number; failed: number };
  };
  summary: string;
  totalFiles: number;
  migratedCount: number;
  alreadyFirebaseCount: number;
  failedCount: number;
}

export interface MigrationProgressCallback {
  (progress: MigrationProgressData): void;
}

/**
 * Downloads a file from remote URL (with server proxy fallback if needed)
 * and returns it as a Blob
 */
async function fetchAssetAsBlob(url: string, defaultName: string = 'file'): Promise<{ blob: Blob; fileName: string; extension: string }> {
  // 1. If base64 data url
  if (url.startsWith('data:')) {
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = blob.type.split('/')[1] || 'jpg';
    return { blob, fileName: `${defaultName}.${ext}`, extension: ext };
  }

  // Extract clean filename from URL if present
  let cleanName = defaultName;
  let extension = 'jpg';
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const lastSlash = pathname.lastIndexOf('/');
    if (lastSlash !== -1) {
      const extracted = decodeURIComponent(pathname.substring(lastSlash + 1));
      if (extracted && extracted.includes('.')) {
        cleanName = extracted;
        extension = cleanName.split('.').pop() || 'jpg';
      }
    }
  } catch (e) {
    // URL parsing fallback
  }

  // 2. Fetch directly or via proxy to bypass any CORS restrictions
  let response: Response | null = null;
  try {
    response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Direct fetch returned ${response.status}`);
    }
  } catch (directErr) {
    console.warn(`[Migration] Direct fetch failed for "${url}", using backend proxy...`);
    const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(url)}`;
    response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Proxy fetch failed: ${response.statusText}`);
    }
  }

  const blob = await response.blob();
  if (blob.type) {
    const mimeExt = blob.type.split('/')[1];
    if (mimeExt && (!extension || extension === 'file')) {
      extension = mimeExt.replace('+xml', '');
    }
  }

  return { blob, fileName: cleanName, extension };
}

/**
 * Runs the comprehensive migration of all existing files in Firestore to Firebase Storage
 */
export async function runFirebaseStorageMigration(onProgress?: MigrationProgressCallback) {
  const stats = {
    realisasi: { total: 0, migrated: 0, already: 0, failed: 0 },
    pihakKetiga: { total: 0, migrated: 0, already: 0, failed: 0 },
    dokumen: { total: 0, migrated: 0, already: 0, failed: 0 },
    pengaturan: { total: 0, migrated: 0, already: 0, failed: 0 }
  };

  const notify = (status: 'running' | 'success' | 'error', collectionName: string, itemName: string, completed: number, total: number, logMsg: string) => {
    console.log(`[Storage Migration] ${logMsg}`);
    if (onProgress) {
      onProgress({
        status,
        currentCollection: collectionName,
        currentItem: itemName,
        completedCount: completed,
        totalCount: total,
        log: logMsg,
        stats
      });
    }
  };

  notify('running', 'Inisialisasi', 'Menghitung berkas...', 0, 0, 'Memulai pemindaian koleksi database...');

  // 1. SCAN SIBIRU_REALISASI
  try {
    notify('running', 'Realisasi SP2D', 'Memindai dokumen...', 0, 0, 'Memindai koleksi sibiru_realisasi...');
    const realisasiSnap = await getDocs(collection(db, COLL_REALISASI));
    const realisasiDocsWithFiles = realisasiSnap.docs.filter(d => {
      const data = d.data();
      return Boolean(data.bukti_transaksi);
    });

    stats.realisasi.total = realisasiDocsWithFiles.length;
    let counter = 0;

    for (const d of realisasiDocsWithFiles) {
      counter++;
      const data = d.data();
      const currentUrl = data.bukti_transaksi as string;

      if (isFirebaseStorageUrl(currentUrl)) {
        stats.realisasi.already++;
        notify('running', 'Realisasi SP2D', d.id, counter, stats.realisasi.total, `[Sudah di Storage] Realisasi: ${d.id}`);
        continue;
      }

      try {
        notify('running', 'Realisasi SP2D', d.id, counter, stats.realisasi.total, `Memindahkan berkas Realisasi: ${data.uraian_belanja || d.id}...`);
        
        const defaultName = `Bukti_${sanitizeStorageSegment(data.uraian_belanja || 'SP2D')}_${d.id}`;
        const { blob, fileName } = await fetchAssetAsBlob(currentUrl, defaultName);

        const uploadResult = await uploadFileToFirebaseStorage(blob, {
          tahun: data.tahun || 2026,
          program: data.kode_program || 'program',
          kegiatan: data.kode_kegiatan || 'kegiatan',
          subkegiatan: data.kode_sub_kegiatan || 'subkegiatan',
          jenisBelanja: data.uraian_belanja || 'jenis_belanja',
          fileName,
          module: 'realisasi'
        });

        // Update Firestore document with new Firebase Storage URL and storage path
        await updateDoc(doc(db, COLL_REALISASI, d.id), {
          bukti_transaksi: uploadResult.downloadUrl,
          bukti_transaksi_storage_path: uploadResult.storagePath
        });

        stats.realisasi.migrated++;
        notify('running', 'Realisasi SP2D', d.id, counter, stats.realisasi.total, `✅ Berhasil dipindah ke: ${uploadResult.storagePath}`);
      } catch (err: any) {
        stats.realisasi.failed++;
        console.error(`Gagal memindahkan file realisasi ${d.id}:`, err);
        notify('running', 'Realisasi SP2D', d.id, counter, stats.realisasi.total, `⚠️ Gagal migrasi ${d.id}: ${err.message || String(err)}`);
      }
    }
  } catch (err: any) {
    console.error('Error saat migrasi sibiru_realisasi:', err);
  }

  // 2. SCAN SIBIRU_BELANJA_PIHAK_KETIGA
  try {
    notify('running', 'Belanja Pihak Ketiga', 'Memindai dokumen...', 0, 0, 'Memindai koleksi sibiru_belanja_pihak_ketiga...');
    const pkSnap = await getDocs(collection(db, COLL_BELANJA_PIHAK_KETIGA));
    const pkDocsWithFiles = pkSnap.docs.filter(d => {
      const data = d.data();
      return Boolean(data.foto_kegiatan);
    });

    stats.pihakKetiga.total = pkDocsWithFiles.length;
    let counter = 0;

    for (const d of pkDocsWithFiles) {
      counter++;
      const data = d.data();
      const currentUrl = data.foto_kegiatan as string;

      if (isFirebaseStorageUrl(currentUrl)) {
        stats.pihakKetiga.already++;
        notify('running', 'Belanja Pihak Ketiga', d.id, counter, stats.pihakKetiga.total, `[Sudah di Storage] Pihak Ketiga: ${d.id}`);
        continue;
      }

      try {
        notify('running', 'Belanja Pihak Ketiga', d.id, counter, stats.pihakKetiga.total, `Memindahkan foto kontrak: ${data.uraian_belanja || d.id}...`);

        const defaultName = `Foto_${sanitizeStorageSegment(data.nama_pelaksana || 'kontrak')}_${d.id}`;
        const { blob, fileName } = await fetchAssetAsBlob(currentUrl, defaultName);

        const uploadResult = await uploadFileToFirebaseStorage(blob, {
          tahun: data.tahun || 2026,
          program: data.kode_program || 'program',
          kegiatan: data.kode_kegiatan || 'kegiatan',
          subkegiatan: data.kode_sub_kegiatan || 'subkegiatan',
          jenisBelanja: data.uraian_belanja || 'jenis_belanja',
          fileName,
          module: 'pihak_ketiga'
        });

        // Update Firestore document
        await updateDoc(doc(db, COLL_BELANJA_PIHAK_KETIGA, d.id), {
          foto_kegiatan: uploadResult.downloadUrl,
          foto_kegiatan_storage_path: uploadResult.storagePath
        });

        stats.pihakKetiga.migrated++;
        notify('running', 'Belanja Pihak Ketiga', d.id, counter, stats.pihakKetiga.total, `✅ Berhasil dipindah ke: ${uploadResult.storagePath}`);
      } catch (err: any) {
        stats.pihakKetiga.failed++;
        console.error(`Gagal memindahkan foto pihak ketiga ${d.id}:`, err);
        notify('running', 'Belanja Pihak Ketiga', d.id, counter, stats.pihakKetiga.total, `⚠️ Gagal migrasi ${d.id}: ${err.message || String(err)}`);
      }
    }
  } catch (err: any) {
    console.error('Error saat migrasi sibiru_belanja_pihak_ketiga:', err);
  }

  // 3. SCAN SIBIRU_DOKUMEN
  try {
    notify('running', 'Arsip Dokumen', 'Memindai dokumen...', 0, 0, 'Memindai koleksi sibiru_dokumen...');
    const dokSnap = await getDocs(collection(db, COLL_DOKUMEN));
    const dokDocsWithFiles = dokSnap.docs.filter(d => {
      const data = d.data();
      return Boolean(data.data_url);
    });

    stats.dokumen.total = dokDocsWithFiles.length;
    let counter = 0;

    for (const d of dokDocsWithFiles) {
      counter++;
      const data = d.data();
      const currentUrl = data.data_url as string;

      if (isFirebaseStorageUrl(currentUrl)) {
        stats.dokumen.already++;
        notify('running', 'Arsip Dokumen', d.id, counter, stats.dokumen.total, `[Sudah di Storage] Dokumen: ${data.nama_dokumen || d.id}`);
        continue;
      }

      try {
        notify('running', 'Arsip Dokumen', d.id, counter, stats.dokumen.total, `Memindahkan arsip dokumen: ${data.nama_dokumen || d.id}...`);

        const defaultName = data.nama_dokumen || `Dokumen_${d.id}`;
        const { blob, fileName } = await fetchAssetAsBlob(currentUrl, defaultName);

        const uploadResult = await uploadFileToFirebaseStorage(blob, {
          tahun: 2026,
          kategori: data.kategori || 'DPA',
          fileName,
          module: 'dokumen'
        });

        // Update Firestore document
        await updateDoc(doc(db, COLL_DOKUMEN, d.id), {
          data_url: uploadResult.downloadUrl,
          storage_path: uploadResult.storagePath
        });

        stats.dokumen.migrated++;
        notify('running', 'Arsip Dokumen', d.id, counter, stats.dokumen.total, `✅ Berhasil dipindah ke: ${uploadResult.storagePath}`);
      } catch (err: any) {
        stats.dokumen.failed++;
        console.error(`Gagal memindahkan dokumen ${d.id}:`, err);
        notify('running', 'Arsip Dokumen', d.id, counter, stats.dokumen.total, `⚠️ Gagal migrasi ${d.id}: ${err.message || String(err)}`);
      }
    }
  } catch (err: any) {
    console.error('Error saat migrasi sibiru_dokumen:', err);
  }

  // 4. SCAN SIBIRU_PENGATURAN (Logo Instansi)
  try {
    notify('running', 'Pengaturan Sistem', 'Memindai logo instansi...', 0, 0, 'Memindai logo instansi di sibiru_pengaturan...');
    const pengSnap = await getDocs(collection(db, COLL_PENGATURAN));
    const pengDocsWithLogo = pengSnap.docs.filter(d => {
      const data = d.data();
      return Boolean(data.logo_instansi);
    });

    stats.pengaturan.total = pengDocsWithLogo.length;
    let counter = 0;

    for (const d of pengDocsWithLogo) {
      counter++;
      const data = d.data();
      const currentUrl = data.logo_instansi as string;

      if (isFirebaseStorageUrl(currentUrl)) {
        stats.pengaturan.already++;
        notify('running', 'Pengaturan Sistem', d.id, counter, stats.pengaturan.total, `[Sudah di Storage] Logo Instansi`);
        continue;
      }

      try {
        notify('running', 'Pengaturan Sistem', d.id, counter, stats.pengaturan.total, `Memindahkan logo instansi...`);

        const defaultName = `logo_instansi_bima`;
        const { blob, fileName } = await fetchAssetAsBlob(currentUrl, defaultName);

        const uploadResult = await uploadFileToFirebaseStorage(blob, {
          tahun: 2026,
          fileName,
          module: 'pengaturan'
        });

        await updateDoc(doc(db, COLL_PENGATURAN, d.id), {
          logo_instansi: uploadResult.downloadUrl,
          logo_instansi_storage_path: uploadResult.storagePath
        });

        stats.pengaturan.migrated++;
        notify('running', 'Pengaturan Sistem', d.id, counter, stats.pengaturan.total, `✅ Berhasil dipindah ke: ${uploadResult.storagePath}`);
      } catch (err: any) {
        stats.pengaturan.failed++;
        console.error(`Gagal memindahkan logo instansi ${d.id}:`, err);
      }
    }
  } catch (err: any) {
    console.error('Error saat migrasi sibiru_pengaturan:', err);
  }

  const grandTotal = stats.realisasi.total + stats.pihakKetiga.total + stats.dokumen.total + stats.pengaturan.total;
  const grandMigrated = stats.realisasi.migrated + stats.pihakKetiga.migrated + stats.dokumen.migrated + stats.pengaturan.migrated;
  const grandAlready = stats.realisasi.already + stats.pihakKetiga.already + stats.dokumen.already + stats.pengaturan.already;
  const grandFailed = stats.realisasi.failed + stats.pihakKetiga.failed + stats.dokumen.failed + stats.pengaturan.failed;

  const finalSummary = `Migrasi selesai! Total: ${grandTotal} berkas. Berhasil dipindahkan: ${grandMigrated}, Sudah di Storage: ${grandAlready}, Gagal: ${grandFailed}.`;
  notify('success', 'Selesai', 'Semua Berkas Terproses', grandMigrated + grandAlready, grandTotal, finalSummary);

  return {
    success: grandFailed === 0,
    stats,
    summary: finalSummary,
    totalFiles: grandTotal,
    migratedCount: grandMigrated,
    alreadyFirebaseCount: grandAlready,
    failedCount: grandFailed
  };
}
