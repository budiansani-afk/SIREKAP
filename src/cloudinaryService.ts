/**
 * Cloudinary Robust Integration Service
 * Handles uploading and deleting assets with server-signed proxy and direct client-side fallbacks.
 */

export interface CloudinaryServiceResponse {
  secure_url: string;
  public_id: string;
}

/**
 * Robustly uploads a physical File object to Cloudinary.
 * First uses our secure server-side proxy (which handles the signature process correctly).
 * If that fails, it falls back to direct client-side unsigned upload using the 'sirekap' upload_preset.
 *
 * @param file The File object returned by browser file picker input
 * @param folder The folder to store the asset inside Cloudinary
 */
export async function uploadFile(
  file: File,
  folder = "sirekap",
  filename?: string
): Promise<CloudinaryServiceResponse> {
  if (!file) {
    throw new Error("No file content provided for upload.");
  }

  // Method 1: Upload via Server-side Proxy (Handles the signature securely via Cloudinary's API key/secret with standard multipart/form-data)
  let lastServerError = "";
  try {
    const finalFilename = filename || file.name;
    console.log(`[CloudinaryService] Attempting server proxy upload for file: ${file.name} to folder: ${folder}, filename override: ${finalFilename}`);
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    if (finalFilename) {
      formData.append("filename", finalFilename);
    }

    const response = await fetch("/api/cloudinary/upload", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.secure_url && data.public_id) {
        console.log("[CloudinaryService] Server-side signed upload succeeded:", data.public_id);
        return {
          secure_url: data.secure_url,
          public_id: data.public_id,
        };
      }
    }
    
    // Parse error response if available from JSON or text
    const text = await response.text().catch(() => "");
    try {
      const json = JSON.parse(text);
      lastServerError = json.error || json.message || text;
    } catch {
      lastServerError = text || `Status: ${response.status}`;
    }
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
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);
    formData.append("folder", folder);
    if (filename) {
      formData.append("public_id", filename.split('.').slice(0, -1).join('.'));
    }

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
  
  // Clean possible URL encoding (e.g., %20 to space)
  let decodedInput = input;
  try {
    decodedInput = decodeURIComponent(input);
  } catch (e) {
    console.warn("[CloudinaryService] Failed to decode URI component of input path:", e);
  }

  if (decodedInput.startsWith("http://") || decodedInput.startsWith("https://")) {
    try {
      // Format: https://res.cloudinary.com/<cloud_name>/<resource_type>/upload/v<version>/<public_id_and_extension>
      const parts = decodedInput.split("/res.cloudinary.com/");
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
  
  return { publicId: decodedInput };
}

/**
 * Deletes a file from Cloudinary securely via server-side API proxy.
 * Supports both full Cloudinary URLs and raw public_ids automatically.
 * 
 * @param urlOrPublicId Either the full Cloudinary URL or the public_id of the asset to delete
 * @param alternativeUrl Optional full Cloudinary delivery URL for fallback parsing
 */
export async function deleteFile(
  urlOrPublicId: string,
  alternativeUrl?: string
): Promise<{ result: string; public_id: string; success?: boolean }> {
  if (!urlOrPublicId) {
    throw new Error("No URL or public_id provided for deletion.");
  }

  // Parse to extract correct public ID & resource type from full URL if needed
  const { publicId, resourceType } = extractCloudinaryInfo(urlOrPublicId);

  console.log(`[CloudinaryService] Requesting file deletion for publicId: "${publicId}", alternativeUrl: "${alternativeUrl || ""}"`);

  const url = "/api/cloudinary/delete";

  try {
    console.log(`[CloudinaryService] Sending delete request to local proxy: "${url}"`);
    console.log(`[CloudinaryService] Payload: public_id="${publicId}", resource_type="${resourceType || "auto"}", url="${alternativeUrl || ""}"`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        public_id: publicId,
        resource_type: resourceType,
        url: alternativeUrl || (urlOrPublicId.startsWith("http") ? urlOrPublicId : undefined),
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[CloudinaryService] Deletion result from server proxy:`, data);
      
      // If the deletion failed with a real Cloudinary error, but ignoring 'not found' which indicates the file is already gone.
      if (data && data.success === false && data.result !== "not found") {
        throw new Error(`Cloudinary Error: ${data.result || "Gagal menghapus berkas dari Cloudinary"}`);
      }
      return data;
    } else {
      const errorText = await response.text().catch(() => "");
      let parsedError = errorText;
      try {
        const json = JSON.parse(errorText);
        parsedError = json.error || json.message || errorText;
      } catch {
        // use raw text
      }
      throw new Error(parsedError || `Server returned status: ${response.status}`);
    }
  } catch (err: any) {
    console.error(`[CloudinaryService] Delete request failed:`, err);
    throw new Error(
      `Gagal menghapus file dari Cloudinary melalui server proxy.\n` +
      `- Detail Error: ${err?.message || String(err)}`
    );
  }
}
