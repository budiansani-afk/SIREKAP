import "dotenv/config";

console.log("=== Environment Variables Debug Startup ===");
console.log("process.env.CLOUDINARY_CLOUD_NAME:", process.env.CLOUDINARY_CLOUD_NAME);
console.log("process.env.CLOUDINARY_API_KEY:", process.env.CLOUDINARY_API_KEY);
console.log("Does CLOUDINARY_API_SECRET exist?:", !!process.env.CLOUDINARY_API_SECRET);
console.log("===========================================");

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 } // 30 MB limit
});

const app = express();
const PORT = 3000;

// Set up express body parsers with higher limit for image base64
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

// Global Incoming Request Logger for Diagnostics
app.use((req, res, next) => {
  console.log(`[EXPRESS REQUEST] ${req.method} ${req.url}`);
  next();
});

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
const apiSecret = getSanitizedEnv("CLOUDINARY_API_SECRET", "17j1h0HMoBTG8LUpX3k7gnjDuH0");
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
if (apiSecret !== "17j1h0HMoBTG8LUpX3k7gnjDuH0") {
  console.log(`[PEMANDU] Perhatian: API Secret dimuat dari sistem environment variable, BUKAN dari hardcoded fallback ("phNUcFk3bY4zsNJwBH8ffrNIbWk")!`);
} else {
  console.log(`[PEMANDU] Info: API Secret menggunakan default fallback "17j1h0HMoBTG8LUpX3k7gnjDuH0".`);
}
console.log("==========================================");

// Cloudinary configuration using credentials
cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret
});

// JSON API Route: Cloudinary Upload Proxy using Multer physical file streaming
app.post("/api/cloudinary/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { folder, filename } = req.body;

    if (!file) {
      return res.status(400).json({ error: "Required: 'file' (multipart/form-data) in request body" });
    }

    const fileToUseName = filename || file.originalname;
    let finalPublicId: string | undefined = undefined;

    if (fileToUseName) {
      try {
        const lastDot = fileToUseName.lastIndexOf(".");
        const base = lastDot !== -1 ? fileToUseName.substring(0, lastDot) : fileToUseName;
        const cleanedBase = base.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().replace(/\s+/g, " ");
        
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

    const uploadOptions: any = {
      folder: folder || "sirekap",
      public_id: finalPublicId,
      resource_type: "auto"
    };

    console.log(`Mencoba upload Cloudinary via buffer stream, folder: ${uploadOptions.folder}, public_id: ${uploadOptions.public_id || "auto-generate"}`);

    const uploadResponse = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
      stream.end(file.buffer);
    });

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
    const { public_id, resource_type, url } = req.body;
    
    if (!public_id && !url) {
      return res.status(400).json({ error: "Required: 'public_id' or 'url' in request body" });
    }

    console.log(`[Server Cloudinary Delete] Request received. public_id: "${public_id}", url: "${url}", resource_type: "${resource_type || "auto"}"`);

    // 1. Gather all raw potential source identifiers
    const rawInputs = new Set<string>();
    if (public_id) rawInputs.add(public_id);
    if (url) rawInputs.add(url);

    // 2. Decode and extract basic path elements
    const extractedPaths = new Set<string>();
    for (const raw of rawInputs) {
      if (!raw) continue;
      extractedPaths.add(raw);

      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
        extractedPaths.add(decoded);
      } catch (err) {
        // Safe fallback
      }

      // If it looks like a Cloudinary delivery URL
      if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
        const uploadSplit = decoded.split("/upload/");
        if (uploadSplit.length > 1) {
          let trailing = uploadSplit[1];
          // Strip any version portion if present (e.g. "v1717686523/")
          if (trailing.startsWith("v")) {
            const slashIdx = trailing.indexOf("/");
            if (slashIdx !== -1 && /^\d+$/.test(trailing.substring(1, slashIdx))) {
              trailing = trailing.substring(slashIdx + 1);
            }
          }
          extractedPaths.add(trailing);
        }
      }
    }

    // 3. Generate combinatorial candidate IDs (folders, extensions, spacers)
    const candidateIds = new Set<string>();
    for (const p of extractedPaths) {
      if (!p) continue;
      candidateIds.add(p);

      // Extract filename without folders
      const lastSlashIdx = p.lastIndexOf("/");
      const filename = lastSlashIdx !== -1 ? p.substring(lastSlashIdx + 1) : p;
      candidateIds.add(filename);
      candidateIds.add(`sirekap/${filename}`);

      // Strip extensions if present (Cloudinary strips extensions for image/video resource_type public_ids)
      const lastDotIdx = p.lastIndexOf(".");
      if (lastDotIdx > lastSlashIdx) {
        const pNoExt = p.substring(0, lastDotIdx);
        candidateIds.add(pNoExt);

        const filenameNoExt = filename.substring(0, filename.lastIndexOf("."));
        candidateIds.add(filenameNoExt);
        candidateIds.add(`sirekap/${filenameNoExt}`);
      }

      // Handle space vs underscore sanitization
      if (p.includes(" ")) {
        const replaced = p.replace(/ /g, "_");
        candidateIds.add(replaced);
        const lastDotReplaced = replaced.lastIndexOf(".");
        if (lastDotReplaced > lastSlashIdx) {
          candidateIds.add(replaced.substring(0, lastDotReplaced));
        }
      }
      if (p.includes("_")) {
        const replaced = p.replace(/_/g, " ");
        candidateIds.add(replaced);
        const lastDotReplaced = replaced.lastIndexOf(".");
        if (lastDotReplaced > lastSlashIdx) {
          candidateIds.add(replaced.substring(0, lastDotReplaced));
        }
      }
    }

    // 4. Prioritize candidate attempts with all possible types (image, raw, video)
    const types = ["image", "raw", "video"];
    const attempts: { id: string; type: string }[] = [];
    const preferredType = (resource_type && types.includes(resource_type)) ? resource_type : null;

    for (const cid of candidateIds) {
      if (!cid) continue;
      if (preferredType) {
        attempts.push({ id: cid, type: preferredType });
      }
      for (const t of types) {
        if (t !== preferredType) {
          attempts.push({ id: cid, type: t });
        }
      }
    }

    // Deduplicate attempts list
    const uniqueAttempts: { id: string; type: string }[] = [];
    const seen = new Set<string>();
    for (const a of attempts) {
      const key = `${a.id}:${a.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueAttempts.push(a);
      }
    }

    console.log(`[Server Cloudinary Delete] Prepared candidate attempts total: ${uniqueAttempts.length}`);
    console.log(`[Server Cloudinary Delete] Candidates to try:`, uniqueAttempts.map(x => `${x.id} (${x.type})`));

    let lastResult: any = { result: "not found" };
    let successDeleted = false;
    let deletedDetails = null;

    // 5. Try destroying to find and destroy the asset securely
    for (const attempt of uniqueAttempts) {
      try {
        console.log(`[Server Cloudinary Delete] Action -> Destroy: ID="${attempt.id}", TYPE="${attempt.type}"`);
        const result = await cloudinary.uploader.destroy(attempt.id, { resource_type: attempt.type });
        console.log(`[Server Cloudinary Delete] Response from Cloudinary:`, result);

        if (result && result.result === "ok") {
          successDeleted = true;
          deletedDetails = { id: attempt.id, type: attempt.type };
          lastResult = result;
          break; // Stop immediately upon matching destruction!
        } else {
          lastResult = result;
        }
      } catch (err: any) {
        console.warn(`[Server Cloudinary Delete] Error in attempt ID="${attempt.id}" TYPE="${attempt.type}":`, err.message || err);
      }
    }

    if (successDeleted) {
      console.log(`[Server Cloudinary Delete] SUCCESS! Destroyed asset:`, deletedDetails);
      return res.json({
        success: true,
        result: "ok",
        public_id,
        attempt: deletedDetails
      });
    } else {
      console.warn(`[Server Cloudinary Delete] EXHAUSTED ALL PATHWAYS! No live file matching candidates was found (or was already deleted).`);
      // Return 200 with success: false but preserve details so the UI can decide
      return res.json({
        success: false,
        result: lastResult?.result || "not found",
        public_id
      });
    }
  } catch (error: any) {
    console.error("Cloudinary Delete Proxy Route Error:", error);
    res.status(500).json({ error: error.message || "Gagal menghapus file dari Cloudinary secara server-side" });
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
