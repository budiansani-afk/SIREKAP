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
  keterangan: string;
  bukti_transaksi?: string; // Base64 data url or name
}

export interface MonitoringFisik {
  id: string;
  tanggal: string;
  kode_program: string;
  kode_kegiatan: string;
  kode_sub_kegiatan: string;
  target_fisik: number; // e.g. 80 (%)
  realisasi_fisik: number; // e.g. 75 (%)
  persentase: number; // e.g. 93.75 (%)
  kendala: string;
  tindak_lanjut: string;
  foto_kegiatan?: string; // Base64 data url
}

export interface DokumenArsip {
  id: string;
  nama_dokumen: string;
  kategori: string; // "RKA" | "DPA" | "DPPA" | "SK" | "Surat Tugas" | "Kontrak" | "Kwitansi" | "SPJ" | "Berita Acara" | "Foto Kegiatan" | "Dokumen Pendukung"
  tanggal_upload: string;
  tipe_file: string;
  ukuran_file: string;
  data_url: string; // Base64 string for previewing/downloading
}

export interface Pengguna {
  id: string; // user uid or email
  nama: string;
  email: string;
  role: UserRole;
  aktif: boolean;
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
  logo_instansi: string; // base64 logo
  nama_pejabat_ttd?: string;
  jabatan_pejabat_ttd?: string;
  nip_pejabat_ttd?: string;
}

// Type Aliases for compatibility
export type ActivityLog = LogAktivitas;
export type AppSettings = PengaturanSistem;

