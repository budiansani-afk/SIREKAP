import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { v2 as cloudinary } from "cloudinary";

const app = express();
const PORT = 3000;

// Set up express body parsers with higher limit for image base64
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

// Helper helper to sanitize environment variables that might be wrapped in quotes or represent missing variables
const getSanitizedEnv = (key: string, fallback: string): string => {
  const value = process.env[key];
  if (!value) return fallback;
  const cleaned = value.replace(/^["']|["']$/g, "").trim();
  if (cleaned === "" || cleaned === "undefined" || cleaned === "null") {
    return fallback;
  }
  return cleaned;
};

const cloudName = getSanitizedEnv("CLOUDINARY_CLOUD_NAME", "de4prnqa4");
const apiKey = getSanitizedEnv("CLOUDINARY_API_KEY", "522531551358338");
const apiSecret = getSanitizedEnv("CLOUDINARY_API_SECRET", "phNUcFk3bY4zsNJwBH8ffrNIbWk");
const preset = getSanitizedEnv("CLOUDINARY_PRESET", "sirekap");

console.log(`Cloudinary Configured: cloudName=${cloudName}, api_key_length=${apiKey.length}, preset=${preset}`);

// Cloudinary configuration using your credentials of project sibirutanah
cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret
});

// JSON API Route: Cloudinary Upload Proxy
app.post("/api/cloudinary/upload", async (req, res) => {
  try {
    const { image, folder } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Required: 'image' (Base64 data URL) in request body" });
    }

    // Direct check to enforce valid base64 data URLs, supporting images and common PDF/document formats
    if (!image.startsWith("data:")) {
      return res.status(400).json({ error: "Sistem hanya mengizinkan pengunggahan file data URL (.png, .jpg, .pdf, dsb)." });
    }

    let uploadResponse;

    try {
      // 1. Direct signed upload (No preset required because we sign with our API secret!). This is the most robust method in production.
      console.log(`Mencoba upload Cloudinary langsung ke folder: ${folder || "sirekap"}`);
      uploadResponse = await cloudinary.uploader.upload(image, {
        folder: folder || "sirekap",
        resource_type: "auto"
      });
    } catch (directError: any) {
      console.warn("Upload langsung tanpa preset gagal. Mencoba upload dengan preset: " + (directError.message || directError));
      try {
        // 2. Try signed upload with the custom preset
        uploadResponse = await cloudinary.uploader.upload(image, {
          folder: folder || "sirekap",
          upload_preset: preset,
          resource_type: "auto"
        });
      } catch (presetError: any) {
        console.warn("Upload dengan preset gagal, mencoba unsigned upload...", presetError.message || presetError);
        // 3. Try unsigned upload with the preset
        try {
          uploadResponse = await cloudinary.uploader.unsigned_upload(image, preset, {
            folder: folder || "sirekap",
            resource_type: "auto"
          });
        } catch (unsignedError: any) {
          throw new Error(`Semua metode upload gagal. Detail error langsung: ${directError.message || directError}. Detail preset: ${presetError.message || presetError}`);
        }
      }
    }

    res.json({
      secure_url: uploadResponse.secure_url,
      public_id: uploadResponse.public_id,
      format: uploadResponse.format,
      bytes: uploadResponse.bytes
    });
  } catch (error: any) {
    console.error("Cloudinary Upload Error:", error);
    res.status(500).json({ error: error.message || "Gagal mengunggah foto ke Cloudinary" });
  }
});

// JSON API Route: Cloudinary Delete Proxy
app.post("/api/cloudinary/delete", async (req, res) => {
  try {
    const { public_id } = req.body;
    if (!public_id) {
      return res.status(400).json({ error: "Required: 'public_id' in request body" });
    }

    console.log(`Mencoba menghapus file Cloudinary public_id: ${public_id}`);

    // Loop through resource types because a direct destroy defaults to 'image'. If the file was a PDF,
    // it was uploaded as 'raw', so destroying as 'image' returns 'not found'.
    let deleteResult = await cloudinary.uploader.destroy(public_id, { resource_type: "image" });
    console.log(`Hapus sebagai 'image' hasil:`, deleteResult);

    if (deleteResult.result === "not found") {
      console.log(`Tidak ditemukan sebagai image, mencoba hapus sebagai 'raw' (misal .pdf): ${public_id}`);
      deleteResult = await cloudinary.uploader.destroy(public_id, { resource_type: "raw" });
      console.log(`Hapus sebagai 'raw' hasil:`, deleteResult);
    }

    if (deleteResult.result === "not found") {
      console.log(`Tidak ditemukan sebagai raw, mencoba hapus sebagai 'video': ${public_id}`);
      deleteResult = await cloudinary.uploader.destroy(public_id, { resource_type: "video" });
      console.log(`Hapus sebagai 'video' hasil:`, deleteResult);
    }

    res.json({
      result: deleteResult.result,
      public_id
    });
  } catch (error: any) {
    console.error("Cloudinary Delete Error:", error);
    res.status(500).json({ error: error.message || "Gagal menghapus file dari Cloudinary" });
  }
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
