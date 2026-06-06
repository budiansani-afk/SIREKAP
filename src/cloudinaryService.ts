/**
 * Cloudinary Robust Integration Service
 * Handles uploading and deleting assets with server-signed proxy and direct client-side fallbacks.
 */

export interface CloudinaryServiceResponse {
  secure_url: string;
  public_id: string;
}

/**
 * Robustly uploads a file (Base64 data URL) to Cloudinary.
 * First uses our secure server-side proxy (which handles the signature process correctly).
 * If that fails, it falls back to direct client-side unsigned upload using the 'sirekap' upload_preset.
 *
 * @param base64DataUrl The base64-encoded file data URL (e.g. "data:image/png;base64,...")
 * @param folder The folder to store the asset inside Cloudinary
 */
export async function uploadFile(
  base64DataUrl: string,
  folder = "sirekap"
): Promise<CloudinaryServiceResponse> {
  if (!base64DataUrl) {
    throw new Error("No file content provided for upload.");
  }

  // Ensure it's a valid data URL
  if (!base64DataUrl.startsWith("data:")) {
    throw new Error("Only Base64 Data URLs are supported for secure uploading.");
  }

  // Method 1: Upload via Server-side Proxy (Handles the signature securely via Cloudinary's API key/secret)
  let lastServerError = "";
  try {
    console.log(`[CloudinaryService] Attempting server-signed proxy upload to folder: ${folder}`);
    const response = await fetch("/api/cloudinary/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: base64DataUrl,
        folder,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.secure_url && data.public_id) {
        console.log("[CloudinaryService] Server-signed upload succeeded:", data.public_id);
        return {
          secure_url: data.secure_url,
          public_id: data.public_id,
        };
      }
    }
    
    // Parse error response if available from JSON or text
    const errorBody = await response.json().catch(() => null);
    lastServerError = errorBody?.error || errorBody?.message || await response.text() || `Status: ${response.status}`;
    console.warn("[CloudinaryService] Server-signed upload returned non-ok status:", response.status, lastServerError);
  } catch (proxyError: any) {
    lastServerError = proxyError?.message || String(proxyError);
    console.warn("[CloudinaryService] Server-signed upload failed, trying direct fallback:", proxyError);
  }

  // Method 2: Direct Client-side Unsigned Upload to Cloudinary (using 'sirekap' preset as fallback)
  try {
    console.log("[CloudinaryService] Attempting direct client-side fallback upload to Cloudinary...");
    const cloudName = "de4prnqa4";
    const uploadPreset = "sirekap";
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    
    const formData = new FormData();
    formData.append("file", base64DataUrl);
    formData.append("upload_preset", uploadPreset);
    formData.append("folder", folder);

    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errResponse = await response.json().catch(() => ({}));
      throw new Error(errResponse?.error?.message || `Cloudinary direct response error (status: ${response.status})`);
    }

    const data = await response.json();
    console.log("[CloudinaryService] Direct client-side upload succeeded:", data.public_id);
    return {
      secure_url: data.secure_url,
      public_id: data.public_id,
    };
  } catch (directError: any) {
    console.error("[CloudinaryService] Both upload methods failed:", directError);
    const clientError = directError?.message || String(directError);
    throw new Error(
      `Gagal mengunggah file ke Cloudinary. \n\n` +
      `- Error Server Backend: ${lastServerError}\n` +
      `- Error Akses Langsung Client: ${clientError}\n\n` +
      `Silakan periksa apakah API Secret di .env atau Pengaturan sudah cocok.`
    );
  }
}

/**
 * Extracts a clean public_id and optional resource_type from a full Cloudinary URL.
 * Handles both standard image and raw asset URL formats securely.
 * 
 * @param input Either a full Cloudinary URL or a raw public_id
 */
export function extractCloudinaryInfo(input: string): { publicId: string; resourceType?: string } {
  if (!input) return { publicId: "" };
  
  if (input.startsWith("http://") || input.startsWith("https://")) {
    try {
      // Format: https://res.cloudinary.com/<cloud_name>/<resource_type>/upload/v<version>/<public_id_and_extension>
      const parts = input.split("/res.cloudinary.com/");
      if (parts.length > 1) {
        const pathParts = parts[1].split("/");
        // pathParts examples: ["de4prnqa4", "image", "upload", "v1717686523", "sirekap", "xyz.png"]
        const resourceType = pathParts[1]; // "image", "raw", "video"
        
        let startIndex = 3;
        // Skip version string if present (e.g., "v1717686523")
        if (pathParts[startIndex] && /^v\d+$/.test(pathParts[startIndex])) {
          startIndex++;
        }
        
        const publicIdAndExt = pathParts.slice(startIndex).join("/");
        let publicId = publicIdAndExt;
        
        // Split extension for non-raw assets (Cloudinary strips extensions in public_id for image/video)
        if (resourceType === "image" || resourceType === "video") {
          const lastDotIdx = publicIdAndExt.lastIndexOf(".");
          if (lastDotIdx !== -1) {
            publicId = publicIdAndExt.substring(0, lastDotIdx);
          }
        }
        
        console.log(`[CloudinaryService] Parsed URL - publicId: "${publicId}", resourceType: "${resourceType}"`);
        return { publicId, resourceType };
      }
    } catch (err) {
      console.warn("[CloudinaryService] Failed to parse Cloudinary URL, falling back to input as raw public_id:", err);
    }
  }
  
  return { publicId: input };
}

/**
 * Deletes a file from Cloudinary securely via server-side API proxy or Firebase Cloud Function.
 * Supports both full Cloudinary URLs and raw public_ids automatically.
 * 
 * @param urlOrPublicId Either the full Cloudinary URL or the public_id of the asset to delete
 */
export async function deleteFile(
  urlOrPublicId: string
): Promise<{ result: string; public_id: string }> {
  if (!urlOrPublicId) {
    throw new Error("No URL or public_id provided for deletion.");
  }

  // Parse to extract correct public ID & resource type from full URL if needed
  const { publicId, resourceType } = extractCloudinaryInfo(urlOrPublicId);

  console.log(`[CloudinaryService] Requesting file deletion for publicId: "${publicId}" (Extracted from: ${urlOrPublicId})`);

  // We attempt both paths to ensure resilience across AI Studio preview & Firebase deployed environment
  const endpoints = [
    "/api/cloudinary/delete",
    "https://us-central1-aplikasi-huntap.cloudfunctions.net/deleteFromCloudinary"
  ];

  let lastError: any = null;

  for (const url of endpoints) {
    try {
      console.log(`[CloudinaryService] [FETCH_PRE-CHECK] Preparing fetch request to endpoint: "${url}"`);
      console.log(`[CloudinaryService] [FETCH_PRE-CHECK] Sending payload with public_id: "${publicId}", resource_type: "${resourceType || "auto"}"`);
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          public_id: publicId,
          resource_type: resourceType,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[CloudinaryService] Deletion result from ${url}:`, data);
        
        // If the server-side deletion succeeded or completed its run, return the result
        return data;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `Status: ${response.status}`);
      }
    } catch (err: any) {
      console.warn(`[CloudinaryService] Delete failed via ${url}:`, err);
      lastError = err;
    }
  }

  throw new Error(
    `Gagal menghapus file dari Cloudinary.\n` +
    `- Error terakhir: ${lastError?.message || String(lastError)}`
  );
}
