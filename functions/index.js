const { onRequest } = require("firebase-functions/v2/https");
const cloudinary = require("cloudinary").v2;

// Configure Cloudinary using the user's project sibirutanah credentials
cloudinary.config({
  cloud_name: "de4prnqa4",
  api_key: "522531551358338",
  api_secret: process.env.CLOUDINARY_API_SECRET || "phNUcFk3bY4zsNJwBH8ffrNIbWk"
});

/**
 * secure Cloud Function to delete Cloudinary assets.
 * Expects a POST request with JSON payload: { "public_id": "...", "resource_type": "..." }
 */
exports.deleteFromCloudinary = onRequest({ cors: true }, async (req, res) => {
  // Enforce CORS and POST method
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Metode tidak diizinkan. Gunakan POST." });
  }

  try {
    const { public_id, resource_type } = req.body;
    if (!public_id) {
      return res.status(400).json({ success: false, error: "Required: 'public_id' di dalam request body." });
    }

    console.log(`Cloud Function: Request received for public_id: "${public_id}", resource_type: "${resource_type || "auto"}"`);

    const types = ["image", "raw", "video"];
    const attempts = [];

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
    const uniqueAttempts = [];
    const seen = new Set();
    for (const a of attempts) {
      const key = `${a.id}:${a.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueAttempts.push(a);
      }
    }

    console.log(`[Cloud Function RobustDelete] Target attempts total: ${uniqueAttempts.length}`);

    let lastResult = { result: "not found" };
    let successDeleted = false;
    let deletedDetails = null;

    for (const attempt of uniqueAttempts) {
      try {
        console.log(`[Cloud Function RobustDelete] Trying destroy: ID="${attempt.id}", TYPE="${attempt.type}"`);
        const result = await cloudinary.uploader.destroy(attempt.id, { resource_type: attempt.type });
        console.log(`[Cloud Function RobustDelete] Result:`, result);
        
        if (result && result.result === "ok") {
          successDeleted = true;
          deletedDetails = { id: attempt.id, type: attempt.type };
          lastResult = result;
          break; // Stop on first successful deletion!
        } else {
          lastResult = result;
        }
      } catch (err) {
        console.warn(`[Cloud Function RobustDelete] Attempt failed for ID="${attempt.id}" TYPE="${attempt.type}":`, err.message || err);
      }
    }

    if (successDeleted) {
      console.log(`[Cloud Function RobustDelete] SUCCESS! File successfully destroyed:`, deletedDetails);
      return res.status(200).json({
        success: true,
        result: "ok",
        public_id,
        attempt: deletedDetails
      });
    } else {
      console.warn(`[Cloud Function RobustDelete] FAILED! File could not be deleted from Cloudinary.`);
      // Return 200 with success: false but with result: "not found" to allow client cleanup
      return res.status(200).json({
        success: false,
        result: lastResult?.result || "not found",
        public_id
      });
    }
  } catch (err) {
    console.error("Cloud Function Cloudinary Delete Error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Gagal menghapus file dari Cloudinary"
    });
  }
});
