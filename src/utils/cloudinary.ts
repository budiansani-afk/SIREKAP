/**
 * Cloudinary Integration Client Utilities for SIBIRU TANAH 2026
 */

export interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
}

/**
 * Upload an image (photo) represented as Base64 data URL to Cloudinary via backend proxy route
 */
export async function uploadToCloudinary(base64DataUrl: string, folder = "sibiru_tanah"): Promise<CloudinaryUploadResponse> {
  if (!base64DataUrl) {
    throw new Error("Data gambar kosong.");
  }

  // Strictly enforce image-only check on the client side
  if (!base64DataUrl.startsWith("data:image/")) {
    throw new Error("Sistem hanya mengizinkan penyimpanan file berupa foto/gambar saja di Cloudinary.");
  }

  const response = await fetch("/api/cloudinary/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image: base64DataUrl,
      folder
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Gagal mengunggah foto ke Cloudinary (status: ${response.status})`);
  }

  const data: CloudinaryUploadResponse = await response.json();
  return data;
}

/**
 * Delete a photo from Cloudinary using its unique public ID via backend proxy route
 */
export async function deleteFromCloudinary(publicId: string): Promise<{ result: string; public_id: string }> {
  if (!publicId) {
    throw new Error("ID Publik Cloudinary tidak ditentukan.");
  }

  const response = await fetch("/api/cloudinary/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      public_id: publicId
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Gagal menghapus foto dari Cloudinary (status: ${response.status})`);
  }

  return response.json();
}
