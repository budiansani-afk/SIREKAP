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

// Cloudinary configuration using your credentials of project sibirutanah
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "de4prnqa4",
  api_key: process.env.CLOUDINARY_API_KEY || "522531551358338",
  api_secret: process.env.CLOUDINARY_API_SECRET || "17j1h0HMoBTG8LUpX3k7gnjDuH0"
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
    const preset = process.env.CLOUDINARY_PRESET || "sirekap";

    try {
      // 1. Try traditional signed upload with the custom preset (if preset is signed in Cloudinary)
      uploadResponse = await cloudinary.uploader.upload(image, {
        folder: folder || "sirekap",
        upload_preset: preset,
        resource_type: "auto"
      });
    } catch (presetError: any) {
      // 2. Try unsigned upload with the preset (if preset is configured as unsigned in Cloudinary)
      try {
        uploadResponse = await cloudinary.uploader.unsigned_upload(image, preset, {
          folder: folder || "sirekap",
          resource_type: "auto"
        });
      } catch (unsignedError: any) {
        // 3. Robust fallback: traditional direct signed upload into the folder without any preset
        console.log(`Info: Preset '${preset}' gagal digunakan (signed/unsigned). Melakukan fallback upload langsung...`);
        uploadResponse = await cloudinary.uploader.upload(image, {
          folder: folder || "sirekap",
          resource_type: "auto"
        });
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

    const deleteResult = await cloudinary.uploader.destroy(public_id);
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
