export enum UserRole {
  ADMIN = "Administrator",
  OPERATOR = "Operator",
  PIMPINAN = "Pimpinan"
}

export interface Program {
  id: string; // matches kode_program
  kode_program: string;
  nama_program: string;
  pagu: number;
  realisasi: number;
  sisa: number;
  persentase: number;
  tahun?: number;
}

export interface Kegiatan {
  id: string; // matches kode_kegiatan
  kode_kegiatan: string;
  nama_kegiatan: string;
  kode_program: string;
  pagu: number;
  realisasi: number;
  sisa: number;
  persentase: number;
  tahun?: number;
}

export interface SubKegiatan {
  id: string; // matches kode_sub_kegiatan
  kode_sub_kegiatan: string;
  nama_sub_kegiatan: string;
  kode_program: string;
  kode_kegiatan: string;
  pagu: number;
  realisasi: number;
  sisa: number;
  persentase: number;
  tahun?: number;
}

export interface RKA {
  id: string;
  tahun: number;
  kode_program: string;
  kode_kegiatan: string;
  kode_sub_kegiatan: string;
  kode_rekening: string;
  uraian_belanja: string;
  volume: number;
  satuan: string;
  harga_satuan: number;
  jumlah: number;
  tw1: number;
  tw2: number;
  tw3: number;
  tw4: number;
}

export interface Realisasi {
  id: string;
  tanggal: string; // YYYY-MM-DD
  bulan: string; // e.g. "Januari", "Februari"
  kode_program: string;
  kode_kegiatan: string;
  kode_sub_kegiatan: string;
  uraian_belanja: string;
  nominal_realisasi: number;
  persentase_realisasi: number;
  sisa_anggaran: number;
  pagu_anggaran_terpantau?: number;
  keterangan: string;
  bukti_transaksi?: string; // Firebase Storage download url or legacy
  bukti_transaksi_storage_path?: string; // Firebase Storage relative path
  bukti_transaksi_public_id?: string; // Cloudinary public_id for real-time deletion
  tahun?: number;
  id_pihak_ketiga?: string;
}

export interface BelanjaPihakKetiga {
  id: string;
  tanggal: string;
  kode_program: string;
  kode_kegiatan: string;
  kode_sub_kegiatan: string;
  uraian_belanja: string;
  nama_pelaksana: string;
  nomor_kontrak: string;
  masa_kerja_mulai: string;
  masa_kerja_selesai: string;
  realisasi: number;
  catatan: string;
  foto_kegiatan?: string; // Firebase Storage download url or legacy
  foto_kegiatan_storage_path?: string; // Firebase Storage relative path
  foto_kegiatan_public_id?: string; // Cloudinary public_id
  tahun?: number;
  id_realisasi_sp2d?: string;
}

export interface DokumenArsip {
  id: string;
  nama_dokumen: string;
  kategori: string; // "RKA" | "DPA" ...
  tanggal_upload: string;
  tipe_file: string;
  ukuran_file: string;
  data_url: string; // Firebase Storage download url or legacy
  storage_path?: string; // Firebase Storage relative path
  cloudinary_public_id?: string; // Cloudinary public ID
}

export interface Pengguna {
  id: string; // user uid or email
  nama: string;
  email: string;
  role: UserRole;
  aktif: boolean;
  password?: string;
}

export interface SesiPenggunaOnline {
  id: string; // session ID
  email: string;
  nama: string;
  role: string;
  device: string; // e.g. "Desktop - Windows (Chrome)"
  device_type: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os: string;
  ip_address: string;
  login_at: number; // timestamp in epoch ms
  waktu_masuk_format?: string;
  last_active: number; // timestamp in epoch ms
  status: 'online' | 'idle' | 'force_disconnected' | 'logged_out';
  disconnected_by?: string;
  disconnected_at?: number;
}

export interface LogAktivitas {
  id: string;
  waktu: string; // ISO datetime
  nama_pengguna: string;
  role: string;
  aksi: string;
  modul: string;
  data_lama?: string; // stringified JSON
  data_baru?: string; // stringified JSON
  ip_address: string;
  browser: string;

  // Compatibility virtual fields for UI rendering
  timestamp?: number;
  userEmail?: string;
  userRole?: string;
  action?: string;
  module?: string;
  oldData?: any;
  newData?: any;
  details?: any; // for optional payload
}

export interface PengaturanSistem {
  id: string; // e.g., "aktif"
  tahun_anggaran_aktif: number;
  nama_instansi: string;
  logo_instansi: string; // Firebase Storage secure URL or legacy
  logo_instansi_storage_path?: string;
  logo_instansi_public_id?: string;
  nama_pejabat_ttd?: string;
  jabatan_pejabat_ttd?: string;
  nip_pejabat_ttd?: string;
  nama_bendahara?: string;
  jabatan_bendahara?: string;
  nip_bendahara?: string;
}

// Type Aliases for compatibility
export type ActivityLog = LogAktivitas;
export type AppSettings = PengaturanSistem;

