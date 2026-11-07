/**
 * Firebase Storage Service for SIREKAP TANAH
 * Target Bucket: bidang-pertanahan.firebasestorage.app
 * Structure:
 * sirekap/{tahun}/{program}/{kegiatan}/{subkegiatan}/{jenis_belanja}/{fileName}
 */

import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject,
  uploadString
} from 'firebase/storage';
import { storage } from './firebase';

export interface StoragePathParams {
  tahun?: string | number;
  program?: string;
  kegiatan?: string;
  subkegiatan?: string;
  jenisBelanja?: string;
  fileName: string;
  module?: 'realisasi' | 'pihak_ketiga' | 'dokumen' | 'pengaturan';
  kategori?: string;
}

export interface StorageUploadResult {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  sizeBytes?: number;
  contentType?: string;
}

/**
 * Sanitizes a path segment to ensure valid Firebase Storage path naming
 * without path traversal or invalid characters.
 */
export function sanitizeStorageSegment(raw: string | number | undefined | null, fallback: string = 'umum'): string {
  if (raw === undefined || raw === null) return fallback;
  const str = String(raw).trim();
  if (!str) return fallback;
  
  // Replace illegal path characters (/ \ ? % * : | " < >) with underscores or dashes
  const cleaned = str
    .replace(/[/\\?%*:|"<>]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || fallback;
}

/**
 * Builds the canonical storage path according to the user specification:
 * folder sirekap/ with subfolders: {tahun}/{program}/{kegiatan}/{subkegiatan}/{jenis_belanja}/{fileName}
 */
export function buildSirekapStoragePath(params: StoragePathParams): string {
  const tahun = sanitizeStorageSegment(params.tahun || 2026, '2026');
  const fileName = sanitizeStorageSegment(params.fileName, `file_${Date.now()}`);

  if (params.module === 'dokumen') {
    const kategori = sanitizeStorageSegment(params.kategori, 'DPA');
    return `sirekap/${tahun}/dokumen/${kategori}/${fileName}`;
  }

  if (params.module === 'pengaturan') {
    return `sirekap/pengaturan/logo/${fileName}`;
  }

  const program = sanitizeStorageSegment(params.program, 'program');
  const kegiatan = sanitizeStorageSegment(params.kegiatan, 'kegiatan');
  const subkegiatan = sanitizeStorageSegment(params.subkegiatan, 'subkegiatan');
  const jenisBelanja = sanitizeStorageSegment(params.jenisBelanja, 'jenis_belanja');

  return `sirekap/${tahun}/${program}/${kegiatan}/${subkegiatan}/${jenisBelanja}/${fileName}`;
}

/**
 * Checks whether a given URL is already hosted on Firebase Storage
 */
export function isFirebaseStorageUrl(url?: string | null): boolean {
  if (!url) return false;
  return (
    url.includes('firebasestorage.googleapis.com') ||
    url.includes('bidang-pertanahan.firebasestorage.app') ||
    url.includes('storage.googleapis.com')
  );
}

/**
 * Extracts storage path from Firebase Storage download URL
 */
export function extractStoragePath(urlOrPath: string): string {
  if (!urlOrPath) return '';
  if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }

  try {
    // Format: .../o/sirekap%2F2026%2F...?...alt=media
    const match = urlOrPath.match(/\/o\/([^?]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch (e) {
    console.warn('Failed to parse storage path from URL:', e);
  }

  return urlOrPath;
}

/**
 * Uploads a physical File or Blob to Firebase Storage at the structured path
 */
export async function uploadFileToFirebaseStorage(
  fileOrBlob: File | Blob,
  paramsOrPath: StoragePathParams | string
): Promise<StorageUploadResult> {
  if (!fileOrBlob) {
    throw new Error('Berkas tidak ditemukan untuk diunggah ke Firebase Storage.');
  }

  const isDirectPath = typeof paramsOrPath === 'string';
  const storagePath = isDirectPath ? paramsOrPath : buildSirekapStoragePath(paramsOrPath);
  const resolvedFileName = isDirectPath ? (storagePath.split('/').pop() || 'file') : paramsOrPath.fileName;
  
  console.log(`[FirebaseStorageService] Mengunggah ke path: "${storagePath}"`);

  const storageRef = ref(storage, storagePath);
  const metadata = {
    contentType: fileOrBlob.type || undefined,
    customMetadata: {
      uploadedAt: new Date().toISOString()
    }
  };

  const snapshot = await uploadBytes(storageRef, fileOrBlob, metadata);
  const downloadUrl = await getDownloadURL(snapshot.ref);

  console.log(`[FirebaseStorageService] Sukses unggah. Download URL:`, downloadUrl);

  return {
    downloadUrl,
    storagePath,
    fileName: resolvedFileName,
    sizeBytes: fileOrBlob.size,
    contentType: fileOrBlob.type
  };
}

/**
 * Uploads a base64 Data URL to Firebase Storage
 */
export async function uploadBase64ToFirebaseStorage(
  base64DataUrl: string,
  params: StoragePathParams
): Promise<StorageUploadResult> {
  const storagePath = buildSirekapStoragePath(params);
  console.log(`[FirebaseStorageService] Mengunggah base64 ke path: "${storagePath}"`);

  const storageRef = ref(storage, storagePath);
  const snapshot = await uploadString(storageRef, base64DataUrl, 'data_url');
  const downloadUrl = await getDownloadURL(snapshot.ref);

  return {
    downloadUrl,
    storagePath,
    fileName: params.fileName
  };
}

/**
 * Deletes a file from Firebase Storage
 */
export async function deleteFileFromFirebaseStorage(urlOrPath: string): Promise<boolean> {
  if (!urlOrPath) return false;

  const storagePath = extractStoragePath(urlOrPath);
  console.log(`[FirebaseStorageService] Menghapus berkas dari path: "${storagePath}"`);

  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
    console.log(`[FirebaseStorageService] Berkas berhasil dihapus: "${storagePath}"`);
    return true;
  } catch (err: any) {
    // If object does not exist, consider delete successful
    if (err?.code === 'storage/object-not-found') {
      console.warn(`[FirebaseStorageService] Berkas sudah tidak ditemukan: "${storagePath}"`);
      return true;
    }
    console.error(`[FirebaseStorageService] Gagal menghapus berkas:`, err);
    throw err;
  }
}
