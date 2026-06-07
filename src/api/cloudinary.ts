import { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";

/**
 * secure POST handler for Cloudinary file deletion.
 * Targets /api/cloudinary/delete.
 * Accepts public_id and optional url in the request body.
 */
export async function deleteCloudinaryAsset(req: Request, res: Response) {
  try {
    // Ensure Cloudinary is configured with the correct credentials,
    // specifically falling back to the specified API Secret: '17j1h0HMoBTG8LUpX3k7gnjDuH0'
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.replace(/^["']|["']$/g, "").trim() || "de4prnqa4";
    const apiKey = process.env.CLOUDINARY_API_KEY?.replace(/^["']|["']$/g, "").trim() || "522531551358338";
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.replace(/^["']|["']$/g, "").trim() || "17j1h0HMoBTG8LUpX3k7gnjDuH0";

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret
    });

    const { public_id, url, resource_type } = req.body;
    
    if (!public_id && !url) {
      console.warn("[src/api/cloudinary.ts] Error: Parameter pub_id dan url kosong.");
      return res.status(400).json({ 
        success: false, 
        errorCode: "INVALID_PARAMETERS",
        error: "Harap sertakan 'public_id' atau 'url' di dalam body request." 
      });
    }

    console.log(`[src/api/cloudinary.ts] Menerima request hapus. public_id: "${public_id}", url: "${url}"`);

    // 1. Gather all potential identifiers (public_id from body, parsed from URL, etc.)
    const rawInputs = new Set<string>();
    if (public_id) rawInputs.add(public_id);
    if (url) rawInputs.add(url);

    // 2. Decode & gather variations
    const extractedPaths = new Set<string>();
    for (const raw of rawInputs) {
      if (!raw) continue;
      extractedPaths.add(raw);

      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
        extractedPaths.add(decoded);
      } catch (err) {}

      if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
        const uploadSplit = decoded.split("/upload/");
        if (uploadSplit.length > 1) {
          let trailing = uploadSplit[1];
          // Strip version if present (e.g., v17123456/)
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

    // 3. Develop candidate public_ids (handling folders and extensions)
    const candidateIds = new Set<string>();
    for (const p of extractedPaths) {
      if (!p) continue;
      candidateIds.add(p);

      const lastSlashIdx = p.lastIndexOf("/");
      const filename = lastSlashIdx !== -1 ? p.substring(lastSlashIdx + 1) : p;
      candidateIds.add(filename);
      candidateIds.add(`sirekap/${filename}`);

      // Strip extensions if any
      const lastDotIdx = p.lastIndexOf(".");
      if (lastDotIdx > lastSlashIdx) {
        const pNoExt = p.substring(0, lastDotIdx);
        candidateIds.add(pNoExt);

        const filenameNoExt = filename.substring(0, filename.lastIndexOf("."));
        candidateIds.add(filenameNoExt);
        candidateIds.add(`sirekap/${filenameNoExt}`);
      }

      // Handle space vs underscore sanitization variations
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

    // 4. Determine try path options
    const resourceTypes = ["image", "raw", "video"];
    const preferredType = (resource_type && resourceTypes.includes(resource_type)) ? resource_type : null;
    
    const attempts: { id: string; type: string }[] = [];
    for (const cid of candidateIds) {
      if (!cid) continue;
      if (preferredType) {
        attempts.push({ id: cid, type: preferredType });
      }
      for (const t of resourceTypes) {
        if (t !== preferredType) {
          attempts.push({ id: cid, type: t });
        }
      }
    }

    // Deduplicate efforts
    const uniqueAttempts: { id: string; type: string }[] = [];
    const seen = new Set<string>();
    for (const a of attempts) {
      const key = `${a.id}:${a.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueAttempts.push(a);
      }
    }

    console.log(`[src/api/cloudinary.ts] Mempersiapkan total kandidat coba: ${uniqueAttempts.length}`);

    let lastResult: any = { result: "not found" };
    let successDeleted = false;
    let deletedDetails = null;

    // 5. Try destroying the asset
    for (const attempt of uniqueAttempts) {
      try {
        console.log(`[src/api/cloudinary.ts] Menghapus asset ID="${attempt.id}", TYPE="${attempt.type}"`);
        const result = await cloudinary.uploader.destroy(attempt.id, { resource_type: attempt.type });
        console.log(`[src/api/cloudinary.ts] Respon:`, result);

        if (result && (result.result === "ok" || result.result === "deleted")) {
          successDeleted = true;
          deletedDetails = { id: attempt.id, type: attempt.type };
          lastResult = result;
          break;
        } else {
          lastResult = result;
        }
      } catch (err: any) {
        console.warn(`[src/api/cloudinary.ts] Gagal menghapus ID="${attempt.id}" TYPE="${attempt.type}":`, err.message || err);
      }
    }

    if (successDeleted) {
      return res.json({
        success: true,
        result: "ok",
        public_id,
        attempt: deletedDetails
      });
    } else {
      console.warn(`[src/api/cloudinary.ts] Aset tidak ditemukan atau gagal dihapus dari Cloudinary.`);
      return res.json({
        success: false,
        errorCode: "ASSET_NOT_FOUND",
        error: `Asset ${public_id || "unknown"} not found or could not be verified/deleted on Cloudinary servers (status: ${lastResult?.result || "not found"}).`,
        result: lastResult?.result || "not found",
        public_id
      });
    }

  } catch (error: any) {
    console.error("[src/api/cloudinary.ts] Error fatal server-side:", error);
    return res.status(500).json({
      success: false,
      errorCode: "INTERNAL_SERVER_ERROR",
      error: error.message || "Gagal menghapus file dari Cloudinary secara server-side"
    });
  }
}
