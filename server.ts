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

// Generate masked representations of API credentials for debugging/diagnosing environment overrides safely
const maskCred = (val: string) => {
  if (!val) return "empty";
  if (val.length <= 8) return "*".repeat(val.length);
  return `${val.slice(0, 4)}...${val.slice(-4)} (length: ${val.length})`;
};

console.log("==========================================");
console.log("CLOUDINARY SERVER CONFIGURATION ENGINE");
console.log(`- Cloud Name: ${cloudName}`);
console.log(`- API Key:    ${maskCred(apiKey)}`);
console.log(`- API Secret: ${maskCred(apiSecret)}`);
console.log(`- Preset:     ${preset}`);
if (apiSecret !== "phNUcFk3bY4zsNJwBH8ffrNIbWk") {
  console.log(`[PEMANDU] Perhatian: API Secret dimuat dari sistem environment variable, BUKAN dari hardcoded fallback ("phNUcFk3bY4zsNJwBH8ffrNIbWk")!`);
} else {
  console.log(`[PEMANDU] Info: API Secret menggunakan default fallback "phNUcFk3bY4zsNJwBH8ffrNIbWk".`);
}
console.log("==========================================");

// Cloudinary configuration using credentials
cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret
});

// JSON API Route: Cloudinary Upload Proxy
app.post("/api/cloudinary/upload", async (req, res) => {
  try {
    const { image, folder, filename } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Required: 'image' (Base64 data URL) in request body" });
    }

    // Direct check to enforce valid base64 data URLs, supporting images and common PDF/document formats
    if (!image.startsWith("data:")) {
      return res.status(400).json({ error: "Sistem hanya mengizinkan pengunggahan file data URL (.png, .jpg, .pdf, dsb)." });
    }

    let finalPublicId: string | undefined = undefined;

    if (filename) {
      try {
        const lastDot = filename.lastIndexOf(".");
        const base = lastDot !== -1 ? filename.substring(0, lastDot) : filename;
        const cleanedBase = base.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/_+/g, "_");
        
        const folderName = folder || "sirekap";
        let trialBase = cleanedBase;
        let isUnique = false;
        let suffixCounter = 0;

        while (!isUnique && suffixCounter < 5) {
          const fullCheckId = `${folderName}/${trialBase}`;
          console.log(`[Cloudinary Signature Loader] Checking if asset exists: "${fullCheckId}"`);
          try {
            let exists = false;
            for (const type of ["image", "raw", "video"]) {
              try {
                await cloudinary.api.resource(fullCheckId, { resource_type: type });
                exists = true;
                break;
              } catch (e) {
                // Not found is expected throwing resource not found
              }
            }

            if (exists) {
              suffixCounter++;
              const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
              trialBase = `${cleanedBase}_${randomCode}`;
              console.log(`[Cloudinary Signature Loader] Collision detected! Appending unique code: "${trialBase}"`);
            } else {
              finalPublicId = trialBase;
              isUnique = true;
            }
          } catch (err) {
            trialBase = `${cleanedBase}_${Date.now()}`;
            finalPublicId = trialBase;
            isUnique = true;
          }
        }
        
        if (!isUnique || !finalPublicId) {
          finalPublicId = `${cleanedBase}_${Date.now()}`;
        }
      } catch (e: any) {
        console.warn("[Cloudinary Proxy] Failed to compute unique filename base, using default auto-generation:", e.message || e);
      }
    }

    let uploadResponse;

    try {
      // 1. Direct signed upload (No preset required because we sign with our API secret!). This is the most robust method in production.
      console.log(`Mencoba upload Cloudinary langsung ke folder: ${folder || "sirekap"}, public_id: ${finalPublicId || "auto-generate"}`);
      uploadResponse = await cloudinary.uploader.upload(image, {
        folder: folder || "sirekap",
        public_id: finalPublicId,
        resource_type: "auto"
      });
    } catch (directError: any) {
      console.warn("Upload langsung tanpa preset gagal. Mencoba upload dengan preset: " + (directError.message || directError));
      try {
        // 2. Try signed upload with the custom preset
        uploadResponse = await cloudinary.uploader.upload(image, {
          folder: folder || "sirekap",
          upload_preset: preset,
          public_id: finalPublicId,
          resource_type: "auto"
        });
      } catch (presetError: any) {
        console.warn("Upload dengan preset gagal, mencoba unsigned upload...", presetError.message || presetError);
        // 3. Try unsigned upload with the preset
        try {
          uploadResponse = await cloudinary.uploader.unsigned_upload(image, preset, {
            folder: folder || "sirekap",
            public_id: finalPublicId,
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
    const { public_id, resource_type } = req.body;
    if (!public_id) {
      return res.status(400).json({ error: "Required: 'public_id' in request body" });
    }

    console.log(`[Server Cloudinary Delete] Request received for public_id: "${public_id}", resource_type: "${resource_type || "auto"}"`);

    const types = ["image", "raw", "video"];
    const attempts: { id: string; type: string }[] = [];

    // 1. Add provided resource type if valid
    if (resource_type && types.includes(resource_type)) {
      attempts.push({ id: public_id, type: resource_type });
    }

    // 2. Add default variations for original public_id
    for (const t of types) {
      attempts.push({ id: public_id, type: t });
    }

    // Extract raw filename without folders
    let rawId = public_id;
    const lastSlashIdx = public_id.lastIndexOf("/");
    if (lastSlashIdx !== -1) {
      rawId = public_id.substring(lastSlashIdx + 1);
    }

    // 3. Add attempts for rawId without folder prefix
    if (rawId !== public_id) {
      for (const t of types) {
        attempts.push({ id: rawId, type: t });
      }
    }

    // 4. Force check with 'sirekap' prefix in case preset uploaded it under sirekap folder
    const sirekapPrefixed = `sirekap/${rawId}`;
    if (sirekapPrefixed !== public_id && sirekapPrefixed !== rawId) {
      for (const t of types) {
        attempts.push({ id: sirekapPrefixed, type: t });
      }
    }

    // Deduplicate attempts
    const uniqueAttempts: { id: string; type: string }[] = [];
    const seen = new Set<string>();
    for (const a of attempts) {
      const key = `${a.id}:${a.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueAttempts.push(a);
      }
    }

    console.log(`[Server Cloudinary Delete] Target attempts total: ${uniqueAttempts.length}`);

    let lastResult: any = { result: "not found" };
    let successDeleted = false;
    let deletedDetails = null;

    for (const attempt of uniqueAttempts) {
      try {
        console.log(`[Server Cloudinary Delete] Trying destroy: ID="${attempt.id}", TYPE="${attempt.type}"`);
        const result = await cloudinary.uploader.destroy(attempt.id, { resource_type: attempt.type });
        console.log(`[Server Cloudinary Delete] Result:`, result);
        
        if (result && result.result === "ok") {
          successDeleted = true;
          deletedDetails = { id: attempt.id, type: attempt.type };
          lastResult = result;
          break; // Stop on first successful deletion!
        } else {
          lastResult = result;
        }
      } catch (err: any) {
        console.warn(`[Server Cloudinary Delete] Attempt failed for ID="${attempt.id}" TYPE="${attempt.type}":`, err.message || err);
      }
    }

    if (successDeleted) {
      console.log(`[Server Cloudinary Delete] SUCCESS! File successfully destroyed:`, deletedDetails);
      return res.json({
        success: true,
        result: "ok",
        public_id,
        attempt: deletedDetails
      });
    } else {
      console.warn(`[Server Cloudinary Delete] FAILED! File could not be deleted from Cloudinary.`);
      // Even if not found on Cloudinary (e.g. already deleted manually), return 200 with result: "not found"
      // to let the client clean up local state if needed, but indicate success: false for the Cloudinary hook
      return res.json({
        success: false,
        result: lastResult?.result || "not found",
        public_id
      });
    }
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
