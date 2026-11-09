import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

// Initialize GoogleGenAI SDK on server
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Set up express body parsers
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

// Global Incoming Request Logger for Diagnostics
app.use((req, res, next) => {
  console.log(`[EXPRESS REQUEST] ${req.method} ${req.url}`);
  next();
});

// Proxy Route: Download asset buffer for cross-origin file migrations
app.get("/api/proxy-download", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }

  try {
    const fetchResponse = await fetch(targetUrl);
    if (!fetchResponse.ok) {
      return res.status(fetchResponse.status).json({ error: `Failed to fetch remote asset: ${fetchResponse.statusText}` });
    }

    const contentType = fetchResponse.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    const arrayBuffer = await fetchResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error("[Proxy Download Error]", error);
    res.status(500).json({ error: error.message || "Failed to download asset" });
  }
});

// Client Info Endpoint (IP address & User Agent detection)
app.get("/api/client-info", (req, res) => {
  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = typeof forwarded === "string"
    ? forwarded.split(",")[0].trim()
    : (req.socket.remoteAddress || "127.0.0.1");
  const cleanIp = rawIp.replace(/^::ffff:/, "");
  res.json({
    ip: cleanIp || "127.0.0.1",
    userAgent: req.headers["user-agent"] || ""
  });
});

// Helper Fallback Analysis Generator (jika offline/kunci API belum terpasang)
function generateHeuristicAnalysis(body: any) {
  const {
    currentYear = 2026,
    currentMonth = new Date().getMonth() + 1,
    totalPagu = 0,
    totalRealisasi = 0,
    subKegiatans = []
  } = body || {};

  const sisaPaguTotal = Math.max(0, totalPagu - totalRealisasi);
  const sisaBulan = Math.max(1, 12 - currentMonth);
  const avgBulanan = currentMonth > 0 ? totalRealisasi / currentMonth : 0;
  const estimasiSilpa = Math.max(0, sisaPaguTotal - (avgBulanan * sisaBulan));

  // Filter donor: serapan rendah < 45%
  const donors = subKegiatans
    .filter((s: any) => s.persentase < 45 && (s.pagu - s.realisasi) > 10_000_000)
    .slice(0, 3);

  // Filter recipient: prioritas sertifikasi / ukur / serapan > 70%
  const recipients = subKegiatans
    .filter((s: any) => s.persentase >= 70 || (s.nama_sub_kegiatan || '').toLowerCase().includes('sertifik') || (s.nama_sub_kegiatan || '').toLowerCase().includes('ukur'))
    .slice(0, 3);

  const usulan = donors.map((d: any, idx: number) => {
    const targetRecipient = recipients[idx % recipients.length] || {
      kode_sub_kegiatan: "1.04.03.2.01.0001",
      nama_sub_kegiatan: "Penyelesaian Pendaftaran dan Sertifikasi Tanah Aset Pemda"
    };
    const sisaD = (d.pagu || 0) - (d.realisasi || 0);
    const nominalGeser = Math.round(sisaD * 0.35);

    return {
      donorKode: d.kode_sub_kegiatan,
      donorSubKegiatan: d.nama_sub_kegiatan,
      penerimaKode: targetRecipient.kode_sub_kegiatan,
      penerimaSubKegiatan: targetRecipient.nama_sub_kegiatan,
      rekomendasiNominal: nominalGeser > 0 ? nominalGeser : 25_000_000,
      alasanUrgensi: `Serapan sub-kegiatan donor baru mencapai ${d.persentase}% pada bulan ke-${currentMonth}. Pengalihan dana diperlukan untuk menuntaskan target fisik pensertifikatan dan pengukuran batas bidang tanah aset daerah yang membutuhkan akselerasi pendanaan mendesak.`,
      langkahRegulasi: "Pergeseran anggaran mendahului Perubahan APBD melalui Revisi DPA SKPD berdasarkan Peraturan Bupati Bima tentang Pedoman Pengelolaan Keuangan Daerah."
    };
  });

  return {
    ringkasanKinerja: `Evaluasi serapan anggaran Bidang Pertanahan pada bulan ke-${currentMonth} TA ${currentYear} menunjukkan realisasi kas sebesar Rp ${Number(totalRealisasi).toLocaleString('id-ID')} (${((totalRealisasi / (totalPagu || 1)) * 100).toFixed(2)}%). Terdapat deviasi serapan terhadap waktu yang memerlukan pergeseran anggaran (re-budgeting) taktis.`,
    statusSerapan: totalRealisasi / (totalPagu || 1) < 0.6 ? "DEFISIT KRITIS" : "PERHATIAN KHUSUS",
    deviasiAnalisis: `Target ideal serapan proporsional bulan ke-${currentMonth} adalah ${((currentMonth / 12) * 100).toFixed(1)}%. Capaian saat ini menunjukkan selisih sebesar ${((totalRealisasi / (totalPagu || 1) * 100) - ((currentMonth / 12) * 100)).toFixed(1)}%.`,
    proyeksiSilpa: `Rp ${Math.round(estimasiSilpa).toLocaleString('id-ID')}`,
    usulanPergeseran: usulan.length > 0 ? usulan : [
      {
        donorKode: "1.04.03.2.02.0002",
        donorSubKegiatan: "Sosialisasi dan Fasilitasi Penyelesaian Sengketa Tanah",
        penerimaKode: "1.04.03.2.01.0001",
        penerimaSubKegiatan: "Pengukuran dan Pemetaan Batas Tanah PSU dan Aset Daerah",
        rekomendasiNominal: 45000000,
        alasanUrgensi: "Optimalisasi anggaran dari pos belanja rapat/sosialisasi yang berlebih dialihkan ke belanja operasional pengukuran dan penerbitan sertifikat tanah Pemkab Bima.",
        langkahRegulasi: "Pergeseran DPA SKPD antar rincian objek belanja."
      }
    ],
    tindakanAkselerasi: [
      "Percepat kelengkapan Berita Acara Serah Terima (BAST) belanja pihak ketiga paling lambat 14 hari ke depan.",
      "Segera ajukan draf pergeseran anggaran DPA ke BPKAD dan TAPD Kabupaten Bima.",
      "Lakukan rekonsiliasi SPJ fungsional dan koordinasi dengan Kantor Pertanahan (BPN) Bima untuk berkas yang sedang dalam proses pengukuran fisik.",
      "Pantau jadwal cut-off penerbitan SPM/SP2D penutupan tahun anggaran agar tidak terjadi gagal bayar."
    ],
    catatanKebijakan: "Disarankan Kepala Bidang Pertanahan segera menyusun telaahan staf kepada Kepala Dinas Perumahan dan Kawasan Permukiman untuk persetujuan pergeseran anggaran demi mengamankan capaian IKU (Indikator Kinerja Utama) dinas."
  };
}

// AI Gemini Endpoint: Analisis Kinerja & Rekomendasi Pergeseran Anggaran (Re-budgeting)
app.post("/api/gemini/analisis-pergeseran", async (req, res) => {
  try {
    const {
      currentYear = 2026,
      currentMonth = new Date().getMonth() + 1,
      totalPagu = 0,
      totalRealisasi = 0,
      rasioSerapan = 0,
      targetIdeal = 0,
      deviasiWaktu = 0,
      subKegiatans = [],
      rkaList = []
    } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("[Gemini API] GEMINI_API_KEY tidak terdeteksi. Menggunakan sistem analisis heuristik terintegrasi.");
      return res.json({
        isAiGenerated: false,
        source: "Sistem Analisis Cerdas (Mode Heuristik Otomatis)",
        data: generateHeuristicAnalysis(req.body)
      });
    }

    // Format ringkas data sub kegiatan untuk prompt
    const subKegSummary = (subKegiatans || []).slice(0, 15).map((s: any) => 
      `- [${s.kode_sub_kegiatan}] ${s.nama_sub_kegiatan}: Pagu Rp ${(s.pagu || 0).toLocaleString('id-ID')}, Realisasi Rp ${(s.realisasi || 0).toLocaleString('id-ID')} (${s.persentase || 0}%), Sisa Rp ${((s.pagu || 0) - (s.realisasi || 0)).toLocaleString('id-ID')}`
    ).join("\n");

    const rkaLowSummary = (rkaList || []).slice(0, 12).map((r: any) =>
      `- [${r.kode_sub_kegiatan}] ${r.uraian_belanja}: Alokasi Rp ${(r.jumlah || 0).toLocaleString('id-ID')}`
    ).join("\n");

    const prompt = `Lakukan audit kinerja dan analisis pergeseran anggaran (re-budgeting) APBD Tahun Anggaran ${currentYear} untuk Bidang Pertanahan Dinas Perumahan dan Kawasan Permukiman Kabupaten Bima.

DATA KINERJA KEUANGAN KAS:
- Tahun Anggaran: ${currentYear}
- Periode Evaluasi: Bulan ke-${currentMonth} dari 12 bulan (Tersisa ${12 - currentMonth} bulan)
- Target Ideal Proporsional Waktu: ${Number(targetIdeal).toFixed(1)}%
- Total Alokasi Pagu DPA: Rp ${Number(totalPagu).toLocaleString('id-ID')}
- Total Realisasi Kas SP2D: Rp ${Number(totalRealisasi).toLocaleString('id-ID')}
- Rasio Serapan Aktual: ${Number(rasioSerapan).toFixed(2)}%
- Deviasi Kinerja terhadap Waktu: ${Number(deviasiWaktu).toFixed(1)}% (${deviasiWaktu < 0 ? 'DEFISIT SERAPAN' : 'SESUAI TARGET'})

DATA SUB-KEGIATAN DPA:
${subKegSummary || 'Data sub-kegiatan umum'}

DATA BELANJA RKA TERKAIT:
${rkaLowSummary || 'Data RKA umum'}

TUGAS & INSTRUKSI:
1. Evaluasi secara kritis tingkat penyerapan anggaran saat ini terhadap target bulanan.
2. Identifikasi Sub-Kegiatan DONOR (sumber pengurangan pagu), yaitu kegiatan berpagu besar dengan serapan rendah (< 45%) yang tidak mungkin terserap habis dalam sisa ${12 - currentMonth} bulan.
3. Identifikasi Sub-Kegiatan PENERIMA (tujuan penambahan dana), khususnya kegiatan prioritas sektor pertanahan (seperti pensertifikatan tanah aset daerah, pengukuran dan pemetaan batas PSU, pembebasan lahan, belanja modal tanah) yang membutuhkan percepatan pendanaan.
4. Tentukan nominal rupiah yang direkomendasikan untuk digeser antar sub-kegiatan secara rasional dan terukur.
5. Rumuskan 4 langkah tindakan akselerasi konkret untuk PPTK dan Bendahara Pengeluaran dalam 14-30 hari ke depan serta antisipasi cut-off SPM/SP2D di BPKAD Bima.`;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Batas waktu respons Gemini (15s) tercapai")), 15000);
    });

    const generatePromise = ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt,
      config: {
        systemInstruction: "Anda adalah Konsultan Ahli Perencanaan Keuangan Daerah dan Analis APBD Sektor Pertanahan di Pemerintah Kabupaten Bima, NTB. Jawaban Anda harus formal, berbobot, berbasis data numerik riil, dan sesuai regulasi Permendagri tentang Pengelolaan Keuangan Daerah.",
        responseMimeType: "application/json",
        temperature: 0.2,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ringkasanKinerja: { type: Type.STRING, description: "Ringkasan evaluasi eksekutif atas capaian serapan terhadap target bulanan." },
            statusSerapan: { type: Type.STRING, description: "Status evaluasi: 'DEFISIT KRITIS', 'PERHATIAN KHUSUS', atau 'OPTIMAL/ON-TRACK'." },
            deviasiAnalisis: { type: Type.STRING, description: "Analisis matematis perbandingan antara target waktu dengan serapan riil." },
            proyeksiSilpa: { type: Type.STRING, description: "Estimasi sisa anggaran beku / SiLPA jika laju serapan tidak diubah." },
            usulanPergeseran: {
              type: Type.ARRAY,
              description: "Daftar rekomendasi konkret pergeseran anggaran antar sub-kegiatan.",
              items: {
                type: Type.OBJECT,
                properties: {
                  donorKode: { type: Type.STRING },
                  donorSubKegiatan: { type: Type.STRING },
                  penerimaKode: { type: Type.STRING },
                  penerimaSubKegiatan: { type: Type.STRING },
                  rekomendasiNominal: { type: Type.NUMBER },
                  alasanUrgensi: { type: Type.STRING },
                  langkahRegulasi: { type: Type.STRING }
                },
                required: ["donorKode", "donorSubKegiatan", "penerimaKode", "penerimaSubKegiatan", "rekomendasiNominal", "alasanUrgensi"]
              }
            },
            tindakanAkselerasi: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Langkah-langkah operasional yang harus diambil dalam 14-30 hari ke depan."
            },
            catatanKebijakan: { type: Type.STRING, description: "Catatan pengambil kebijakan untuk Kepala Dinas dan TAPD." }
          },
          required: ["ringkasanKinerja", "statusSerapan", "deviasiAnalisis", "proyeksiSilpa", "usulanPergeseran", "tindakanAkselerasi", "catatanKebijakan"]
        }
      }
    });

    const response = (await Promise.race([generatePromise, timeoutPromise])) as any;
    const textOutput = response.text || "{}";
    const parsedData = JSON.parse(textOutput);

    res.json({
      isAiGenerated: true,
      source: "Gemini 3.5 Flash Lite (AI Google)",
      data: parsedData
    });
  } catch (error: any) {
    console.warn("[Gemini Re-budgeting Fallback Active]", error?.message || error);
    res.json({
      isAiGenerated: false,
      source: "Sistem Analisis Cerdas (Mode Heuristik Otomatis)",
      data: generateHeuristicAnalysis(req.body)
    });
  }
});

// Alias endpoint route for flexibility
app.all(["/api/gemini/analisis-pergeseran", "/api/gemini/analisis-pergeseran/"], (req, res, next) => {
  if (req.method !== "POST") {
    return res.json({
      isAiGenerated: false,
      source: "Sistem Analisis Cerdas (Mode Heuristik Otomatis)",
      data: generateHeuristicAnalysis(req.body || {})
    });
  }
  next();
});

// Vite Middleware & SPA serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} (Firebase Storage Mode)`);
  });
}

startServer();
