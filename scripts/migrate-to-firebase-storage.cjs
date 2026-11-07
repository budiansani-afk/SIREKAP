/**
 * Direct Migration Script to Firebase Storage
 * Bucket: bidang-pertanahan.firebasestorage.app
 * Structure: sirekap/{tahun}/{program}/{kegiatan}/{subkegiatan}/{jenis_belanja}/{fileName}
 */

const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, collection, getDocs, doc, updateDoc } = require("firebase/firestore");
const { getStorage, ref, uploadBytes, getDownloadURL } = require("firebase/storage");
const config = require("../firebase-applet-config.json");

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app, config.firestoreDatabaseId);
const storage = getStorage(app, config.storageBucket);

function sanitize(str, fallback = "umum") {
  if (!str) return fallback;
  const s = String(str).trim();
  if (!s) return fallback;
  const cleaned = s.replace(/[/\\?%*:|"<>]+/g, "_").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function isFirebaseStorageUrl(url) {
  if (!url) return false;
  return (
    url.includes("firebasestorage.googleapis.com") ||
    url.includes("bidang-pertanahan.firebasestorage.app") ||
    url.includes("storage.googleapis.com")
  );
}

async function fetchAssetBuffer(url, fallbackName = "file") {
  if (url.startsWith("data:")) {
    const commaIdx = url.indexOf(",");
    const meta = url.substring(0, commaIdx);
    const mime = meta.split(":")[1]?.split(";")[0] || "image/jpeg";
    const ext = mime.split("/")[1] || "jpg";
    const base64Data = url.substring(commaIdx + 1);
    const buffer = Buffer.from(base64Data, "base64");
    return { buffer, contentType: mime, fileName: `${fallbackName}.${ext}` };
  }

  let fileName = fallbackName;
  let extension = "jpg";
  try {
    const parsed = new URL(url);
    const lastSlash = parsed.pathname.lastIndexOf("/");
    if (lastSlash !== -1) {
      const name = decodeURIComponent(parsed.pathname.substring(lastSlash + 1));
      if (name && name.includes(".")) {
        fileName = name;
        extension = name.split(".").pop();
      }
    }
  } catch (e) {}

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!fileName.includes(".")) {
    const extFromMime = contentType.split("/")[1] || "jpg";
    fileName = `${fileName}.${extFromMime.replace("+xml", "")}`;
  }

  return { buffer, contentType, fileName };
}

async function run() {
  console.log("=== MEMULAI MIGRASI BERKAS KE FIREBASE STORAGE ===");
  console.log("Target Bucket:", config.storageBucket);
  console.log("Struktur Target: sirekap/{tahun}/{program}/{kegiatan}/{subkegiatan}/{jenis_belanja}/{fileName}");

  await signInWithEmailAndPassword(auth, "migration_bot@sirekap.id", "bima2026_migration");
  console.log("Berhasil login sebagai migration_bot.");

  let migratedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // 1. MIGRATION SIBIRU_REALISASI
  console.log("\n[1/4] Memindai sibiru_realisasi...");
  const realSnap = await getDocs(collection(db, "sibiru_realisasi"));
  for (const d of realSnap.docs) {
    const data = d.data();
    if (!data.bukti_transaksi) continue;

    if (isFirebaseStorageUrl(data.bukti_transaksi)) {
      skippedCount++;
      console.log(`[SUDAH DI STORAGE] Realisasi: ${d.id}`);
      continue;
    }

    try {
      const tahun = sanitize(data.tahun || 2026, "2026");
      const program = sanitize(data.kode_program, "program");
      const kegiatan = sanitize(data.kode_kegiatan, "kegiatan");
      const subkegiatan = sanitize(data.kode_sub_kegiatan, "subkegiatan");
      const jenisBelanja = sanitize(data.uraian_belanja, "jenis_belanja");
      const defaultName = `Bukti_${sanitize(data.uraian_belanja, "SP2D")}_${d.id}`;

      const { buffer, contentType, fileName } = await fetchAssetBuffer(data.bukti_transaksi, defaultName);
      const cleanFileName = sanitize(fileName, `bukti_${d.id}.jpg`);
      const storagePath = `sirekap/${tahun}/${program}/${kegiatan}/${subkegiatan}/${jenisBelanja}/${cleanFileName}`;

      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, buffer, {
        contentType,
        customMetadata: {
          tahun,
          program,
          kegiatan,
          subkegiatan,
          jenisBelanja,
          realisasiId: d.id,
          migratedAt: new Date().toISOString()
        }
      });

      const downloadUrl = await getDownloadURL(storageRef);

      await updateDoc(doc(db, "sibiru_realisasi", d.id), {
        bukti_transaksi: downloadUrl,
        bukti_transaksi_storage_path: storagePath
      });

      migratedCount++;
      console.log(`✅ [Realisasi ${d.id}] Dipindah ke: ${storagePath}`);
    } catch (err) {
      failedCount++;
      console.error(`❌ [Realisasi ${d.id}] Gagal:`, err.message || err);
    }
  }

  // 2. MIGRATION SIBIRU_BELANJA_PIHAK_KETIGA
  console.log("\n[2/4] Memindai sibiru_belanja_pihak_ketiga...");
  const pkSnap = await getDocs(collection(db, "sibiru_belanja_pihak_ketiga"));
  for (const d of pkSnap.docs) {
    const data = d.data();
    if (!data.foto_kegiatan) continue;

    if (isFirebaseStorageUrl(data.foto_kegiatan)) {
      skippedCount++;
      console.log(`[SUDAH DI STORAGE] Pihak Ketiga: ${d.id}`);
      continue;
    }

    try {
      const tahun = sanitize(data.tahun || 2026, "2026");
      const program = sanitize(data.kode_program, "program");
      const kegiatan = sanitize(data.kode_kegiatan, "kegiatan");
      const subkegiatan = sanitize(data.kode_sub_kegiatan, "subkegiatan");
      const jenisBelanja = sanitize(data.uraian_belanja, "jenis_belanja");
      const defaultName = `Foto_${sanitize(data.nama_pelaksana, "kontrak")}_${d.id}`;

      const { buffer, contentType, fileName } = await fetchAssetBuffer(data.foto_kegiatan, defaultName);
      const cleanFileName = sanitize(fileName, `foto_${d.id}.jpg`);
      const storagePath = `sirekap/${tahun}/${program}/${kegiatan}/${subkegiatan}/${jenisBelanja}/${cleanFileName}`;

      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, buffer, {
        contentType,
        customMetadata: {
          tahun,
          program,
          kegiatan,
          subkegiatan,
          jenisBelanja,
          pihakKetigaId: d.id,
          pelaksana: data.nama_pelaksana || "",
          nomorKontrak: data.nomor_kontrak || "",
          migratedAt: new Date().toISOString()
        }
      });

      const downloadUrl = await getDownloadURL(storageRef);

      await updateDoc(doc(db, "sibiru_belanja_pihak_ketiga", d.id), {
        foto_kegiatan: downloadUrl,
        foto_kegiatan_storage_path: storagePath
      });

      migratedCount++;
      console.log(`✅ [Pihak Ketiga ${d.id}] Dipindah ke: ${storagePath}`);
    } catch (err) {
      failedCount++;
      console.error(`❌ [Pihak Ketiga ${d.id}] Gagal:`, err.message || err);
    }
  }

  // 3. MIGRATION SIBIRU_DOKUMEN
  console.log("\n[3/4] Memindai sibiru_dokumen...");
  const dokSnap = await getDocs(collection(db, "sibiru_dokumen"));
  for (const d of dokSnap.docs) {
    const data = d.data();
    if (!data.data_url) continue;

    if (isFirebaseStorageUrl(data.data_url)) {
      skippedCount++;
      console.log(`[SUDAH DI STORAGE] Dokumen: ${d.id}`);
      continue;
    }

    try {
      const tahun = "2026";
      const kategori = sanitize(data.kategori || "DPA", "DPA");
      const defaultName = data.nama_dokumen || `dokumen_${d.id}`;

      const { buffer, contentType, fileName } = await fetchAssetBuffer(data.data_url, defaultName);
      const cleanFileName = sanitize(fileName, `dok_${d.id}.pdf`);
      const storagePath = `sirekap/${tahun}/dokumen/${kategori}/${cleanFileName}`;

      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, buffer, {
        contentType,
        customMetadata: {
          kategori,
          dokumenId: d.id,
          namaDokumen: data.nama_dokumen || "",
          migratedAt: new Date().toISOString()
        }
      });

      const downloadUrl = await getDownloadURL(storageRef);

      await updateDoc(doc(db, "sibiru_dokumen", d.id), {
        data_url: downloadUrl,
        storage_path: storagePath
      });

      migratedCount++;
      console.log(`✅ [Dokumen ${d.id}] Dipindah ke: ${storagePath}`);
    } catch (err) {
      failedCount++;
      console.error(`❌ [Dokumen ${d.id}] Gagal:`, err.message || err);
    }
  }

  // 4. MIGRATION SIBIRU_PENGATURAN
  console.log("\n[4/4] Memindai sibiru_pengaturan (Logo)...");
  const pengSnap = await getDocs(collection(db, "sibiru_pengaturan"));
  for (const d of pengSnap.docs) {
    const data = d.data();
    if (!data.logo_instansi) continue;

    if (isFirebaseStorageUrl(data.logo_instansi)) {
      skippedCount++;
      console.log(`[SUDAH DI STORAGE] Pengaturan Logo: ${d.id}`);
      continue;
    }

    try {
      const defaultName = "logo_instansi_bima";
      const { buffer, contentType, fileName } = await fetchAssetBuffer(data.logo_instansi, defaultName);
      const cleanFileName = sanitize(fileName, "logo_instansi.png");
      const storagePath = `sirekap/pengaturan/logo/${cleanFileName}`;

      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, buffer, {
        contentType,
        customMetadata: {
          instansi: data.nama_instansi || "",
          migratedAt: new Date().toISOString()
        }
      });

      const downloadUrl = await getDownloadURL(storageRef);

      await updateDoc(doc(db, "sibiru_pengaturan", d.id), {
        logo_instansi: downloadUrl,
        logo_instansi_storage_path: storagePath
      });

      migratedCount++;
      console.log(`✅ [Pengaturan ${d.id}] Dipindah ke: ${storagePath}`);
    } catch (err) {
      failedCount++;
      console.error(`❌ [Pengaturan ${d.id}] Gagal:`, err.message || err);
    }
  }

  console.log("\n=== RINGKASAN MIGRASI ===");
  console.log(`Total berhasil dipindahkan: ${migratedCount}`);
  console.log(`Total sudah di Firebase:   ${skippedCount}`);
  console.log(`Total gagal:               ${failedCount}`);
  console.log("=========================================\n");

  process.exit(0);
}

run().catch(e => {
  console.error("Migration fatal error:", e);
  process.exit(1);
});
