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
 * Expects a POST request with JSON payload: { "public_id": "..." }
 */
exports.deleteFromCloudinary = onRequest({ cors: true }, async (req, res) => {
  // Enforce CORS and POST method
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Metode tidak diizinkan. Gunakan POST." });
  }

  try {
    const { public_id } = req.body;
    if (!public_id) {
      return res.status(400).json({ success: false, error: "Required: 'public_id' di dalam request body." });
    }

    console.log(`Cloud Function: Mencoba menghapus public_id: ${public_id}`);

    // Try destroying with the correct resource type fallback
    let deleteResult = await cloudinary.uploader.destroy(public_id, { resource_type: "image" });
    console.log(`Hapus sebagai 'image' hasil:`, deleteResult);

    if (deleteResult.result === "not found") {
      console.log(`Tidak ditemukan sebagai image, mencoba hapus sebagai 'raw' (seperti .pdf): ${public_id}`);
      deleteResult = await cloudinary.uploader.destroy(public_id, { resource_type: "raw" });
      console.log(`Hapus sebagai 'raw' hasil:`, deleteResult);
    }

    if (deleteResult.result === "not found") {
      console.log(`Tidak ditemukan sebagai raw, mencoba hapus sebagai 'video': ${public_id}`);
      deleteResult = await cloudinary.uploader.destroy(public_id, { resource_type: "video" });
      console.log(`Hapus sebagai 'video' hasil:`, deleteResult);
    }

    return res.status(200).json({
      success: true,
      result: deleteResult.result,
      public_id
    });
  } catch (err) {
    console.error("Cloud Function Cloudinary Delete Error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Gagal menghapus file dari Cloudinary"
    });
  }
});
