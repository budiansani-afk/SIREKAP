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
import { deleteCloudinaryAsset } from "./src/api/cloudinary";

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

        while (!isUnique && suffixCounter <= 100) {
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
              trialBase = `${cleanedBase}_${suffixCounter}`;
              console.log(`[Cloudinary Signature Loader] Collision detected! Appending sequential code: "${trialBase}"`);
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

// JSON API Route: Cloudinary Delete Proxy (delegated to src/api/cloudinary.ts handler)
app.post("/api/cloudinary/delete", deleteCloudinaryAsset);

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
