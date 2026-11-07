import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  TrendingUp,
  Camera, 
  Calendar, 
  ShieldCheck, 
  AlertTriangle,
  Receipt,
  Download,
  DollarSign,
  Eye,
  ShieldAlert,
  X,
  Ban,
  Activity,
  Briefcase
} from 'lucide-react';
import { Realisasi, Program, Kegiatan, SubKegiatan, UserRole, RKA, BelanjaPihakKetiga } from '../types';
import { formatRupiah, exportToCSV } from '../utils/helpers';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { COLL_REALISASI, createAuditLog, synchronizeCalculations, syncSp2dToPihakKetiga } from '../dbService';
import { uploadFile, deleteFile } from '../cloudinaryService';
import { 
  uploadFileToFirebaseStorage, 
  deleteFileFromFirebaseStorage,
  isFirebaseStorageUrl 
} from '../firebaseStorageService';

interface RealisasiViewProps {
  realisasis: Realisasi[];
  rkaList: RKA[];
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  pihakKetigas?: BelanjaPihakKetiga[];
  currentUserRole: UserRole;
  currentUserEmail: string;
  onShowToast: (msg: string, type: 'success' | 'error') => void;
  selectedYear: number;
  initialSubKeg?: string;
  initialUraianFilter?: string;
}

export default function RealisasiView({
  realisasis,
  rkaList,
  programs,
  kegiatans,
  subKegiatans,
  pihakKetigas = [],
  currentUserRole,
  currentUserEmail,
  onShowToast,
  selectedYear,
  initialSubKeg,
  initialUraianFilter
}: RealisasiViewProps) {
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedSubKeg, setSelectedSubKeg] = useState(initialSubKeg || '');
  const [selectedErikaFilter, setSelectedErikaFilter] = useState(initialUraianFilter || '');
  const [selectedRealisasiStatus, setSelectedRealisasiStatus] = useState('');

  // Sinkronisasi filter saat menerima navigasi dari luar (misal Dashboard)
  React.useEffect(() => {
    if (initialSubKeg !== undefined) {
      setSelectedSubKeg(initialSubKeg);
    }
  }, [initialSubKeg]);

  React.useEffect(() => {
    if (initialUraianFilter !== undefined) {
      setSelectedErikaFilter(initialUraianFilter);
    }
  }, [initialUraianFilter]);

  // Modal State untuk Peringatan Anggaran Tidak Cukup (Budget Exceeded Popup)
  const [showInsufficientBudgetModal, setShowInsufficientBudgetModal] = useState(false);
  const [insufficientBudgetData, setInsufficientBudgetData] = useState<{
    subKegiatanKode: string;
    namaSubKegiatan: string;
    uraianBelanja: string;
    paguAnggaran: number;
    realisasiSebelumnya: number;
    sisaTersedia: number;
    nominalInput: number;
    kelebihanNominal: number;
    level: string;
  } | null>(null);

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<Realisasi | null>(null);
  const [editItem, setEditItem] = useState<Realisasi | null>(null);

  // Form Fields
  const [formTanggal, setFormTanggal] = useState<string>(new Date().toISOString().substring(0, 10));
  const [formBulan, setFormBulan] = useState<string>("Januari");
  const [formSubKeg, setFormSubKeg] = useState<string>('');
  const [formUraian, setFormUraian] = useState<string>('');
  const [formNominal, setFormNominal] = useState<number>(0);
  const [formKeterangan, setFormKeterangan] = useState<string>('');
  const [formBuktiFile, setFormBuktiFile] = useState<File | null>(null);
  const [existingBuktiUrl, setExistingBuktiUrl] = useState<string>('');
  const [formBuktiFileName, setFormBuktiFileName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [formUraianIsManual, setFormUraianIsManual] = useState(false);
  const [manualUraianVal, setManualUraianVal] = useState('');
  const [formPihakKetigaId, setFormPihakKetigaId] = useState<string>('');

  const canEdit = currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.OPERATOR;

  const monthsList = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  // Dynamic automatic Month selector based on dynamic date inputted
  const handleDateChange = (dateVal: string) => {
    setFormTanggal(dateVal);
    try {
      const parsedDate = new Date(dateVal);
      const mIdx = parsedDate.getMonth();
      if (!isNaN(mIdx)) {
        setFormBulan(monthsList[mIdx]);
      }
    } catch (e){}
  };

  // Upload proof of transaction
  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onShowToast("SIMPAN DITOLAK: Hanya file berupa foto/gambar bukti kuitansi (.png, .jpg, .jpeg) yang diperkenankan!", 'error');
      e.target.value = "";
      return;
    }

    setFormBuktiFileName(file.name);
    setFormBuktiFile(file);
  };

  // Compute unique Erika options for filter
  const uniqueErikaOptions = useMemo(() => {
    const filtered = rkaList.filter(r => !selectedSubKeg || r.kode_sub_kegiatan === selectedSubKeg);
    const uniqueUraians = Array.from(new Set(filtered.map(r => r.uraian_belanja)));
    return uniqueUraians.sort();
  }, [rkaList, selectedSubKeg]);

  // Filter calculations list
  const filteredRealisasis = useMemo(() => {
    return realisasis.filter(r => {
      const matchMonth = selectedMonth === '' || (r && r.bulan === selectedMonth);
      const matchSub = selectedSubKeg === '' || (r && r.kode_sub_kegiatan === selectedSubKeg);
      const matchErika = !selectedErikaFilter || (r.uraian_belanja === selectedErikaFilter);

      return matchMonth && matchSub && matchErika;
    });
  }, [realisasis, selectedMonth, selectedSubKeg, selectedErikaFilter]);

  // Compute monthly recap indicators filtered by selected sub-kegiatan and description
  const rekapBulanan = useMemo(() => {
    const recaps: Record<string, number> = monthsList.reduce((acc, m) => {
      acc[m] = 0;
      return acc;
    }, {} as Record<string, number>);

    const erikaUraian = selectedErikaFilter;

    realisasis.forEach(r => {
      if (selectedSubKeg && r.kode_sub_kegiatan !== selectedSubKeg) {
        return;
      }
      if (erikaUraian && r.uraian_belanja !== erikaUraian) {
        return;
      }
      if (recaps[r.bulan] !== undefined) {
        recaps[r.bulan] += r.nominal_realisasi;
      }
    });

    return recaps;
  }, [realisasis, selectedSubKeg, selectedErikaFilter]);

  // Aggregate table data based on RKA and Realisasi
  const tableData = useMemo(() => {
    const data: any[] = [];
    rkaList
      .filter(rka => !selectedSubKeg || rka.kode_sub_kegiatan === selectedSubKeg)
      .filter(rka => !selectedErikaFilter || rka.uraian_belanja === selectedErikaFilter)
      .forEach(rka => {
        const matches = filteredRealisasis.filter(real => real.kode_sub_kegiatan === rka.kode_sub_kegiatan && real.uraian_belanja === rka.uraian_belanja);
        
        const showUnrealized = !selectedRealisasiStatus || selectedRealisasiStatus === 'belum';
        const showRealized = !selectedRealisasiStatus || selectedRealisasiStatus === 'sudah';

        if (matches.length === 0) {
          if (showUnrealized) {
              data.push({
                type: 'unrealized',
                kode_sub_kegiatan: rka.kode_sub_kegiatan,
                uraian_belanja: rka.uraian_belanja,
                pagu: rka.jumlah,
                nominal_realisasi: 0,
                sisa_anggaran: rka.jumlah,
                persentase_realisasi: 0,
                tanggal: '-',
                bulan: '-',
                keterangan: 'Belum ada transaksi',
                id: `dummy_${rka.id}`
              });
          }
        } else {
          if (showRealized) {
              // Sort realizations by date to calculate running remaining budget
              const sortedMatches = [...matches].sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime() || a.id.localeCompare(b.id));
              
              let runningSpent = 0;
              sortedMatches.forEach(real => {
                runningSpent += real.nominal_realisasi;
                data.push({
                  type: 'realized',
                  ...real,
                  pagu: rka.jumlah,
                  sisa_anggaran: rka.jumlah - runningSpent,
                });
              });
          }
        }
      });
    data.sort((a, b) => {
      const timeA = a.tanggal && a.tanggal !== '-' ? new Date(a.tanggal).getTime() : Infinity;
      const timeB = b.tanggal && b.tanggal !== '-' ? new Date(b.tanggal).getTime() : Infinity;
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return (a.id || '').localeCompare(b.id || '');
    });

    return data;
  }, [rkaList, filteredRealisasis, selectedRealisasiStatus, selectedSubKeg, selectedErikaFilter]);

  const summaryTotals = useMemo(() => {
    let totalReal = 0;
    
    filteredRealisasis.forEach(r => {
        totalReal += r.nominal_realisasi;
    });

    // Pagu: sum of RKA matching selected filters
    const pagu = rkaList
      .filter(rka => (!selectedSubKeg || rka.kode_sub_kegiatan === selectedSubKeg) && (!selectedErikaFilter || rka.uraian_belanja === selectedErikaFilter))
      .reduce((sum, rka) => sum + rka.jumlah, 0);

    // Sisa Anggaran (tetap ditampilkan bila negatif/defisit)
    const sisa = pagu - totalReal;
    
    const persen = pagu > 0 ? (totalReal / pagu) * 100 : 0;
    
    return {
        pagu_subkegiatan: pagu,
        realisasi: totalReal,
        sisa: sisa,
        persen: persen
    };
  }, [filteredRealisasis, rkaList, selectedSubKeg, selectedErikaFilter]);


  // Compute selected Sub-Kegiatan Pagu and remaining sisa for dynamic warning alert guards
  const activeSubStatus = useMemo(() => {
    if (!formSubKeg) return null;
    const s = subKegiatans.find(sk => sk.kode_sub_kegiatan === formSubKeg);
    if (!s) return null;
    const subRealisasis = realisasis.filter(r => r.kode_sub_kegiatan === formSubKeg && r.id !== editItem?.id);
    const spent = subRealisasis.reduce((sum, r) => sum + r.nominal_realisasi, 0);
    const sisa = s.pagu - spent;
    return {
      pagu: s.pagu,
      realisasi_lama: spent,
      sisa_tersedia: sisa,
      sisa_setelah_input: sisa - formNominal
    };
  }, [formSubKeg, subKegiatans, realisasis, editItem, formNominal]);

  // Find RKA list for chosen sub-kegiatan
  const matchingRkasForSub = useMemo(() => {
    if (!formSubKeg) return [];
    return rkaList.filter(r => r.kode_sub_kegiatan === formSubKeg);
  }, [formSubKeg, rkaList]);

  // Find Belanja Pihak Ketiga list for chosen sub-kegiatan
  const availablePihakKetigas = useMemo(() => {
    if (!formSubKeg) return [];
    return pihakKetigas.filter(p => p.kode_sub_kegiatan === formSubKeg);
  }, [formSubKeg, pihakKetigas]);

  // Find currently selected RKA item to display its pagu and sisa
  const totalPagu = useMemo(() => {
    if (!formSubKeg || !formUraian) return 0;
    return rkaList
      .filter(r => r.kode_sub_kegiatan === formSubKeg && r.uraian_belanja === formUraian)
      .reduce((sum, r) => sum + r.jumlah, 0);
  }, [formSubKeg, formUraian, rkaList]);

  const rkaSpecificBudgetStatus = useMemo(() => {
    if (totalPagu === 0) return null;
    const itemRealisasis = realisasis.filter(r => r.kode_sub_kegiatan === formSubKeg && r.uraian_belanja === formUraian && r.id !== editItem?.id);
    const spent = itemRealisasis.reduce((sum, r) => sum + r.nominal_realisasi, 0);
    const sisa = totalPagu - spent;
    return {
      pagu: totalPagu,
      realisasi_lama: spent,
      sisa_tersedia: sisa,
      sisa_setelah_input: sisa - formNominal
    };
  }, [totalPagu, realisasis, formSubKeg, formUraian, editItem, formNominal]);

  const uniqueUraianList = useMemo(() => {
    const filteredRka = rkaList.filter(r => !selectedSubKeg || r.kode_sub_kegiatan === selectedSubKeg);
    const uniqueUraian = Array.from(new Set(filteredRka.map(r => r.uraian_belanja)));
    return uniqueUraian.sort();
  }, [rkaList, selectedSubKeg]);

  // Handle Form open dialogs
  const openAddModal = () => {
    setEditItem(null);
    setFormTanggal(new Date().toISOString().substring(0, 10));
    setFormBulan(monthsList[new Date().getMonth()]);
    setFormSubKeg('');
    setFormUraian('');
    setFormUraianIsManual(false);
    setManualUraianVal('');
    setFormPihakKetigaId('');
    setFormNominal(0);
    setFormKeterangan('');
    setFormBuktiFile(null);
    setExistingBuktiUrl('');
    setFormBuktiFileName('');
    setShowForm(true);
  };

  const openEditModal = (item: Realisasi) => {
    setEditItem(item);
    setFormTanggal(item.tanggal);
    setFormBulan(item.bulan);
    setFormSubKeg(item.kode_sub_kegiatan);
    setFormUraian(item.uraian_belanja);
    const belongsToRka = item.uraian_belanja && rkaList.some(r => r.kode_sub_kegiatan === item.kode_sub_kegiatan && r.uraian_belanja === item.uraian_belanja);
    setFormUraianIsManual(!belongsToRka);
    setManualUraianVal(!belongsToRka ? item.uraian_belanja : '');
    setFormPihakKetigaId(item.id_pihak_ketiga || '');
    setFormNominal(item.nominal_realisasi);
    setFormKeterangan(item.keterangan || '');
    setFormBuktiFile(null);
    setExistingBuktiUrl(item.bukti_transaksi || '');
    setFormBuktiFileName(item.bukti_transaksi ? 'Unduh_Bukti_Fisik_SPD.png' : '');
    setShowForm(true);
  };

  // Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubKeg || !formUraian.trim() || formNominal <= 0) {
      onShowToast("Harap lengkapi semua field wajib dan nominal harus lebih besar dari Nol!", 'error');
      return;
    }

    const linkedSub = subKegiatans.find(s => s.kode_sub_kegiatan === formSubKeg);
    if (!linkedSub) {
      onShowToast("Kode Sub-Kegiatan tidak valid!", 'error');
      return;
    }

    // 1. Validasi Keras Anggaran Khusus Rincian Belanja (E-RKA) jika terdaftar di E-RKA
    if (rkaSpecificBudgetStatus) {
      const maxAvailableSpecific = rkaSpecificBudgetStatus.sisa_tersedia;
      if (formNominal > maxAvailableSpecific) {
        const kelebihan = formNominal - maxAvailableSpecific;
        setInsufficientBudgetData({
          subKegiatanKode: linkedSub.kode_sub_kegiatan,
          namaSubKegiatan: linkedSub.nama_sub_kegiatan,
          uraianBelanja: formUraian.trim(),
          paguAnggaran: rkaSpecificBudgetStatus.pagu,
          realisasiSebelumnya: rkaSpecificBudgetStatus.realisasi_lama,
          sisaTersedia: maxAvailableSpecific,
          nominalInput: formNominal,
          kelebihanNominal: kelebihan,
          level: 'Rincian Belanja (E-RKA)'
        });
        setShowInsufficientBudgetModal(true);
        onShowToast(`PROSES INPUT DITOLAK: Anggaran tidak cukup! Melebihi sisa pagu belanja sebesar ${formatRupiah(kelebihan)}`, 'error');
        return; // PROSES PENCAIRAN TIDAK BISA DILANJUTKAN!
      }
    }

    // 2. Validasi Keras Anggaran Total Sub-Kegiatan (DPA)
    if (activeSubStatus) {
      const maxAvailableSub = activeSubStatus.sisa_tersedia;
      if (formNominal > maxAvailableSub) {
        const kelebihan = formNominal - maxAvailableSub;
        setInsufficientBudgetData({
          subKegiatanKode: linkedSub.kode_sub_kegiatan,
          namaSubKegiatan: linkedSub.nama_sub_kegiatan,
          uraianBelanja: formUraian.trim(),
          paguAnggaran: activeSubStatus.pagu,
          realisasiSebelumnya: activeSubStatus.realisasi_lama,
          sisaTersedia: maxAvailableSub,
          nominalInput: formNominal,
          kelebihanNominal: kelebihan,
          level: 'Total Pagu Sub-Kegiatan (DPA)'
        });
        setShowInsufficientBudgetModal(true);
        onShowToast(`PROSES INPUT DITOLAK: Anggaran tidak cukup! Melebihi sisa pagu sub-kegiatan sebesar ${formatRupiah(kelebihan)}`, 'error');
        return; // PROSES PENCAIRAN TIDAK BISA DILANJUTKAN!
      }
    }

    setIsSaving(true);
    try {
      let storageUrl = existingBuktiUrl;
      let storagePath = editItem?.bukti_transaksi_storage_path || '';
      let cloudinaryPublicId = editItem?.bukti_transaksi_public_id || '';

      // If a new physical file is selected
      if (formBuktiFile) {
        // If there is an old photo on Firebase Storage or Cloudinary, delete it first
        if (editItem?.bukti_transaksi_storage_path) {
          try {
            await deleteFileFromFirebaseStorage(editItem.bukti_transaksi_storage_path);
          } catch (storageErr) {
            console.warn("Gagal menghapus berkas lama dari Firebase Storage:", storageErr);
          }
        } else if (editItem?.bukti_transaksi_public_id) {
          try {
            await deleteFile(editItem.bukti_transaksi_public_id);
          } catch (cloudinaryErr) {
            console.warn("Gagal menghapus asset Cloudinary lama:", cloudinaryErr);
          }
        }

        // Upload the new file directly to Firebase Storage with exact hierarchy:
        // sirekap/{tahun}/{program}/{kegiatan}/{subkegiatan}/{jenis_belanja}/{fileName}
        const uploadRes = await uploadFileToFirebaseStorage(formBuktiFile, {
          tahun: editItem?.tahun || selectedYear,
          program: linkedSub.kode_program,
          kegiatan: linkedSub.kode_kegiatan,
          subkegiatan: formSubKeg,
          jenisBelanja: formUraian.trim(),
          fileName: formBuktiFile.name,
          module: 'realisasi'
        });
        storageUrl = uploadRes.downloadUrl;
        storagePath = uploadRes.storagePath;
        cloudinaryPublicId = '';
      } else if (!existingBuktiUrl) {
        // If the user removed the image completely
        if (editItem?.bukti_transaksi_storage_path) {
          try {
            await deleteFileFromFirebaseStorage(editItem.bukti_transaksi_storage_path);
          } catch (storageErr) {
            console.warn("Gagal menghapus berkas dari Firebase Storage:", storageErr);
          }
        } else if (editItem?.bukti_transaksi_public_id) {
          try {
            await deleteFile(editItem.bukti_transaksi_public_id);
          } catch (cloudinaryErr) {
            console.warn("Gagal menghapus asset Cloudinary lama:", cloudinaryErr);
          }
        }
        storageUrl = '';
        storagePath = '';
        cloudinaryPublicId = '';
      }

      const docId = editItem ? editItem.id : `realisasi_${Date.now()}`;
      
      // Define paguAmt for payload usage and percentage calculation
      const matchedRka = rkaList.find(item => item.kode_sub_kegiatan === formSubKeg && item.uraian_belanja === formUraian.trim());
      const paguAmt = matchedRka ? matchedRka.jumlah : linkedSub.pagu;
      
      const computedPersentaseOfSub = paguAmt > 0 ? (formNominal / paguAmt) * 100 : 0;
      const currentAvailable = rkaSpecificBudgetStatus ? rkaSpecificBudgetStatus.sisa_tersedia : (activeSubStatus ? activeSubStatus.sisa_tersedia : paguAmt);
      const computedSisaValue = currentAvailable - formNominal;
      
      const payload: Realisasi = {
        id: docId,
        tanggal: formTanggal,
        bulan: formBulan,
        tahun: editItem?.tahun || selectedYear,
        kode_program: linkedSub.kode_program,
        kode_kegiatan: linkedSub.kode_kegiatan,
        kode_sub_kegiatan: formSubKeg,
        uraian_belanja: formUraian.trim(),
        nominal_realisasi: formNominal,
        persentase_realisasi: parseFloat(computedPersentaseOfSub.toFixed(2)),
        sisa_anggaran: computedSisaValue,
        pagu_anggaran_terpantau: paguAmt,
        keterangan: formKeterangan.trim(),
        bukti_transaksi: storageUrl || undefined,
        bukti_transaksi_storage_path: storagePath || undefined,
        bukti_transaksi_public_id: cloudinaryPublicId || undefined,
        id_pihak_ketiga: formPihakKetigaId || editItem?.id_pihak_ketiga || undefined
      };

      await setDoc(doc(db, COLL_REALISASI, docId), payload).catch(err => handleFirestoreError(err, OperationType.WRITE, `${COLL_REALISASI}/${docId}`));

      // Sinkronisasi otomatis ke modul Belanja Pihak Ketiga
      await syncSp2dToPihakKetiga(payload, false, editItem || undefined);

      // Audit trail
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        editItem ? "UPDATE REALISASI KEUANGAN" : "TAMBAH REALISASI KEUANGAN",
        "REALISASI_KEUANGAN",
        editItem,
        payload
      );

      // Trigger structural budgets calculations
      await synchronizeCalculations();

      onShowToast(`Berhasil menyimpan realisasi belanja: "${payload.uraian_belanja}" senilai ${formatRupiah(payload.nominal_realisasi)}. Tersinkron ke seluruh modul.`, 'success');

      setShowForm(false);
      setEditItem(null);
    } catch (err) {
      onShowToast("Gagal memproses realisasi: " + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Realisasi
  const handleDelete = async (item: Realisasi) => {
    const isConfirmed = window.confirm(`Hapus pencatatan realisasi "${item.uraian_belanja}" senilai ${formatRupiah(item.nominal_realisasi)}?`);
    if (!isConfirmed) return;

    try {
      // Clean up Storage asset (Firebase Storage or legacy Cloudinary)
      if (item.bukti_transaksi_storage_path || (item.bukti_transaksi && isFirebaseStorageUrl(item.bukti_transaksi))) {
        try {
          await deleteFileFromFirebaseStorage(item.bukti_transaksi_storage_path || item.bukti_transaksi);
        } catch (storageErr) {
          console.warn("Gagal menghapus bukti dari Firebase Storage:", storageErr);
        }
      } else if (item.bukti_transaksi_public_id) {
        try {
          await deleteFile(item.bukti_transaksi_public_id);
          console.log(`Berhasil menghapus bukti transaksi dari Cloudinary: ${item.bukti_transaksi_public_id}`);
        } catch (cloudinaryErr) {
          console.warn("Gagal menghapus bukti dari Cloudinary:", cloudinaryErr);
        }
      }

      await deleteDoc(doc(db, COLL_REALISASI, item.id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `${COLL_REALISASI}/${item.id}`));
      
      // Sinkronisasi otomatis ke modul Belanja Pihak Ketiga saat dihapus
      await syncSp2dToPihakKetiga(item, true);

      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        "HAPUS REALISASI KEUANGAN",
        "REALISASI_KEUANGAN",
        item,
        null
      );

      // Re-calculate structural cascades
      await synchronizeCalculations();

      onShowToast(`Berhasil menghapus pencatatan realisasi "${item.uraian_belanja}". Tersinkron ke seluruh modul.`, 'success');
    } catch (err) {
      onShowToast("Gagal menghapus realisasi: " + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  const handleExportRealisasi = () => {
    const exportHeaders = ['id', 'tanggal', 'bulan', 'kode_program', 'kode_kegiatan', 'kode_sub_kegiatan', 'uraian_belanja', 'nominal_realisasi', 'persentase_realisasi', 'sisa_anggaran', 'keterangan'];
    exportToCSV(filteredRealisasis, exportHeaders, 'Laporan_Realisasi_Belanja_Pertanahan_2026');
  };

  return (
    <div className="space-y-6" id="realisasi-module-root">
      
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="real-title-card">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 font-display">
            <TrendingUp className="text-[#1e3a8a]" size={20} />
            Realisasi Penyerapan Keuangan Sektor Lahan
          </h2>
          <p className="text-xs text-slate-500 mt-1">Sistem pencatatan realisasi Surat Perintah Pencairan Dana (SP2D), bukti kuitansi lapangan, dan sisa kas.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button 
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg border border-blue-950 transition cursor-pointer"
          >
            <Plus size={14} />
            Input Realisasi
          </button>
          <button 
            onClick={handleExportRealisasi}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition cursor-pointer"
          >
            <Download size={14} />
            Ekspor CSV
          </button>
          {/* Remove Input button */}
        </div>
      </div>

      {/* Filter Summary Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm" id="summary-filter">
        <div>
          <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Pagu</span>
          <span className="text-sm font-black text-slate-900 font-mono">{formatRupiah(summaryTotals.pagu_subkegiatan)}</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Realisasi</span>
          <span className="text-sm font-black text-rose-800 font-mono">{formatRupiah(summaryTotals.realisasi)}</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Sisa Anggaran</span>
          <span className={`text-sm font-black font-mono flex items-center gap-1.5 ${summaryTotals.sisa < 0 ? 'text-red-600' : 'text-indigo-900'}`}>
            {formatRupiah(summaryTotals.sisa)}
            {summaryTotals.sisa < 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 uppercase tracking-wider">
                Defisit
              </span>
            )}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-slate-500 font-bold uppercase block">Persentase Serapan</span>
          <span className={`text-sm font-black ${summaryTotals.persen > 100 ? 'text-rose-600' : summaryTotals.persen === 100 ? 'text-emerald-700' : 'text-blue-800'} font-mono`}>{summaryTotals.persen.toFixed(2)}%</span>
        </div>
      </div>

      {/* Monthly Recap Row Widget */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4" id="recap-monthly-row">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Receipt size={15} className="text-[#10409F]" />
              Rekap Belanja Kas Bulanan TA 2026
            </h4>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {selectedSubKeg 
                ? "Menampilkan rekapitulasi realisasi belanja kas yang disaring khusus." 
                : "Menampilkan akumulasi seluruh realisasi belanja kas bulanan."}
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2 items-center">
            {/* Filter status indicator badges */}
            {selectedSubKeg && (
              <div className="flex flex-wrap items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/50">
                <span className="text-[9px] text-[#1e3a8a] font-black uppercase tracking-wider">Aktif Saringan:</span>
                <span className="text-[10px] bg-white font-mono font-bold text-blue-900 border px-1.5 py-0.5 rounded shadow-xs">
                  Sub-Keg: {selectedSubKeg}
                </span>
                <button 
                  onClick={() => {
                    setSelectedSubKeg('');
                  }}
                  className="text-[9px] hover:text-red-700 text-red-500 font-extrabold ml-1.5 hover:underline cursor-pointer"
                >
                  Bersihkan
                </button>
              </div>
            )}
            
            {/* SUM / TOTAL OF THE SUB-KEGIATAN EXPENSES */}
            <div className="bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 text-right">
              <span className="text-[9px] text-slate-500 uppercase font-black block leading-none">Jumlah Belanja Sub Kegiatan</span>
              <span className="text-xs font-mono font-black text-emerald-900 mt-1 inline-block">{formatRupiah(summaryTotals.realisasi)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2" id="grid recaps box">
          {monthsList.map((m, i) => {
            const amount = rekapBulanan[m];
            return (
              <div key={i} className={`p-2.5 rounded-lg border text-center transition ${amount > 0 ? 'bg-emerald-50 border-emerald-250 text-emerald-950' : 'bg-slate-50/50 border-slate-100'}`}>
                <p className="text-[10px] text-slate-500 font-semibold tracking-wide uppercase">{m.substring(0,3)}</p>
                <p className="text-xs font-black mt-1 pl-0.5 truncate" title={formatRupiah(amount)}>
                  {amount > 0 ? formatRupiah(amount).replace('Rp', '') : '-'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sorters and search filters */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-stretch gap-4 text-xs" id="real-filters">
        
        <div className="flex flex-wrap gap-2.5 flex-1">
          {/* Bulan */}
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="p-2 border border-slate-200 bg-white rounded-lg outline-blue-600">
            <option value="">Semua Bulan</option>
            {monthsList.map((m, idx) => (
              <option key={idx} value={m}>{m}</option>
            ))}
          </select>
          
          {/* Status */}
          <select value={selectedRealisasiStatus} onChange={(e) => setSelectedRealisasiStatus(e.target.value)} className="p-2 border border-slate-200 bg-white rounded-lg outline-blue-600 font-medium text-slate-800">
            <option value="">Semua Status</option>
            <option value="belum">Belum</option>
            <option value="sudah">Selesai</option> {/* Map 'sudah' to Selesai */}
          </select>
          
          {/* Sub Kegiatan */}
          <select value={selectedSubKeg} onChange={(e) => { setSelectedSubKeg(e.target.value); setSelectedErikaFilter(''); }} className="p-2 border border-slate-200 bg-white rounded-lg w-48 outline-blue-600 font-medium text-slate-800">
            <option value="">Semua Sub Kegiatan</option>
            {subKegiatans.map((s, idx) => (
              <option key={idx} value={s.kode_sub_kegiatan}>{s.kode_sub_kegiatan} - {s.nama_sub_kegiatan || ''}</option>
            ))}
          </select>

          {/* E-RKA Filter */}
          <select value={selectedErikaFilter} onChange={(e) => setSelectedErikaFilter(e.target.value)} className="p-2 border border-slate-200 bg-white rounded-lg w-48 outline-blue-600 font-medium text-slate-800">
            <option value="">Semua Daftar Belanja (E-RKA)</option>
            {uniqueErikaOptions.map((uraian, idx) => (
              <option key={idx} value={uraian}>{uraian}</option>
            ))}
          </select>
          
          {/* Reset Button */}
          <button
            onClick={() => {
              setSelectedMonth('');
              setSelectedRealisasiStatus('');
              setSelectedSubKeg('');
              setSelectedErikaFilter('');
            }}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Main Table view */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="real-table-panel">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
                <th className="p-3.5 pl-4 w-12 text-center">No.</th>
                <th className="p-3.5 w-32">Tanggal / Bulan</th>
                <th className="p-3.5 w-48">Sub Kegiatan</th>
                <th className="p-3.5">Uraian / Keterangan</th>
                <th className="p-3.5 text-right w-36">Pagu Anggaran</th>
                <th className="p-3.5 text-right w-36">Nominal Realisasi</th>
                <th className="p-3.5 text-right w-36">Sisa Anggaran</th>
                {canEdit && <th className="p-3.5 text-center w-24">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {tableData.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="p-8 text-center text-slate-500 font-semibold">Tabel realisasi kosong / Atur saringan filter.</td>
                </tr>
              ) : (
                tableData.map((r, i) => {
                  const subKeg = subKegiatans.find(s => s.kode_sub_kegiatan === r.kode_sub_kegiatan);
                  const matchedRka = rkaList.find(item => item.kode_sub_kegiatan === r.kode_sub_kegiatan && item.uraian_belanja === r.uraian_belanja);
                  
                  return (
                    <tr 
                      key={r.id || i} 
                      className="hover:bg-slate-50/50 transition antialiased"
                    >
                      <td className="p-3.5 pl-4 text-center font-bold text-slate-500 font-mono text-[11px]">{i + 1}</td>
                      <td className="p-3.5">
                        <p className="font-bold text-slate-900 flex items-center gap-1 font-mono text-[11px]"><Calendar size={12} className="text-blue-800" />{r.tanggal}</p>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">{r.bulan}</span>
                      </td>
                      <td className="p-3.5 text-[11px] font-bold text-slate-700">
                        {subKeg ? subKeg.nama_sub_kegiatan : r.kode_sub_kegiatan}
                      </td>
                      <td className="p-3.5">
                        <div
                          className={`text-left font-bold block text-wrap text-slate-950`}
                        >
                          {r.uraian_belanja} {matchedRka && <span className="text-[9px] bg-blue-50 text-blue-800 border border-blue-200 px-1 py-0.5 rounded ml-1 tracking-wider uppercase font-extrabold">E-RKA Detail</span>}
                        </div>
                        <span className="text-[10px] text-slate-600 italic block mt-0.5" title={r.keterangan}>{r.keterangan}</span>
                      </td>
                      <td className="p-3.5 text-right font-black text-slate-900 font-mono">{formatRupiah(r.pagu)}</td>
                      <td className="p-3.5 text-right font-black text-rose-950 font-mono">{formatRupiah(r.nominal_realisasi)}</td>
                      <td className={`p-3.5 text-right font-black font-mono ${r.sisa_anggaran < 0 ? 'text-red-600' : 'text-indigo-900'}`}>{formatRupiah(r.sisa_anggaran)}</td>
                      {canEdit && (
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {r.type === 'realized' && r.bukti_transaksi && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setSelectedPhoto(r.bukti_transaksi!); setShowPhoto(true); }}
                                className="p-1.5 hover:bg-emerald-100 text-emerald-700 rounded transition" 
                                title="Lihat Bukti Foto"
                              >
                                <Eye size={13} />
                              </button>
                            )}
                            {r.type === 'realized' && <button onClick={(e) => { e.stopPropagation(); openEditModal(r); }} className="p-1.5 hover:bg-amber-100 text-amber-700 rounded transition" title="Edit"><Edit2 size={13} /></button>}
                            {r.type === 'realized' && <button onClick={(e) => { e.stopPropagation(); handleDelete(r); }} className="p-1.5 hover:bg-red-100 text-red-700 rounded transition" title="Hapus"><Trash2 size={13} /></button>}
                            {r.type === 'unrealized' && <button onClick={(e) => { e.stopPropagation(); openAddModal(); setFormSubKeg(r.kode_sub_kegiatan); setFormUraian(r.uraian_belanja); }} className="p-1.5 hover:bg-indigo-100 text-indigo-700 rounded transition" title="Input Realisasi"><Plus size={13} /></button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {showDetail && detailItem && (
        <div 
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => setShowDetail(false)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl border border-slate-100 max-w-2xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Detail Realisasi SP2D</h3>
              <button 
                onClick={() => setShowDetail(false)} 
                className="text-white hover:text-white/80 font-bold text-lg"
              >&times;</button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-[1fr,2fr] gap-3 text-slate-700">
                  <span className="font-bold text-slate-500">Program:</span>
                  <span>{programs.find(p => p.kode_program === detailItem.kode_program)?.nama_program || detailItem.kode_program}</span>
                  
                  <span className="font-bold text-slate-500">Kegiatan:</span>
                  <span>{kegiatans.find(k => k.kode_kegiatan === detailItem.kode_kegiatan)?.nama_kegiatan || detailItem.kode_kegiatan}</span>
                  
                  <span className="font-bold text-slate-500">Sub-Kegiatan:</span>
                  <span>{subKegiatans.find(s => s.kode_sub_kegiatan === detailItem.kode_sub_kegiatan)?.nama_sub_kegiatan || detailItem.kode_sub_kegiatan}</span>
                  
                  <span className="font-bold text-slate-500">Uraian Detail:</span>
                  <span className="font-bold text-slate-950 text-sm bg-yellow-50 px-2 py-1 rounded inline-block">{detailItem.uraian_belanja}</span>
                  
                  <span className="font-bold text-slate-500">Tanggal:</span>
                  <span className="font-mono text-slate-800">{detailItem.tanggal} ({detailItem.bulan})</span>

                  <span className="font-bold text-slate-500">Catatan:</span>
                  <span className="italic text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">{detailItem.keterangan || '-'}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start border-t pt-6">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 space-y-2 text-xs">
                    <div className="grid grid-cols-[1fr,1fr] gap-2 text-slate-700">
                        <span className="font-medium text-slate-500">Nilai Anggaran:</span>
                        <span className="font-bold">{formatRupiah(detailItem.pagu_anggaran_terpantau || 0)}</span>
                        
                        <span className="font-medium text-slate-500">Nilai Realisasi:</span>
                        <span className="font-black text-blue-950">{formatRupiah(detailItem.nominal_realisasi)}</span>
                        
                        <span className="font-medium text-slate-500">Sisa Anggaran:</span>
                        <span className="font-bold text-slate-900">{formatRupiah(detailItem.sisa_anggaran || 0)}</span>
                    </div>
                </div>

                {detailItem.bukti_transaksi && (
                  <div className="flex flex-col items-center">
                    <span className="font-bold text-slate-500 block mb-2 w-full text-left">Preview Bukti SPJ:</span>
                    <div className="max-w-[120px] w-full">
                      <img 
                        src={detailItem.bukti_transaksi} 
                        alt="Bukti SPJ" 
                        className="w-full aspect-square object-contain rounded-lg border border-slate-200 shadow-sm" 
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Photo Popup Modal */}
      {showPhoto && selectedPhoto && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => setShowPhoto(false)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl p-4 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-sm">Bukti Transaksi (SPJ)</h3>
              <button 
                onClick={() => setShowPhoto(false)} 
                className="text-slate-600 hover:text-slate-900 font-bold text-lg"
              >&times;</button>
            </div>
            
            <img 
              src={selectedPhoto} 
              alt="Bukti SPJ" 
              className="w-full h-auto rounded-lg mb-4" 
            />
            
            <div className="flex justify-end gap-2">
              <button 
                onClick={async () => {
                  try {
                    const response = await fetch(selectedPhoto!);
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Bukti_SPJ_${Date.now()}.png`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                  } catch (error) {
                    console.error("Gagal mengunduh file:", error);
                    alert("Gagal mengunduh file.");
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 transition"
              >
                <Download size={14} />
                Unduh
              </button>
              <button 
                onClick={() => setShowPhoto(false)}
                className="px-4 py-2 bg-slate-100 text-slate-800 text-xs font-bold rounded-lg hover:bg-slate-200 transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Form Dialog */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="real-form-overlay">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden" id="real-form-modal">
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-1.5 text-sm">
                <Receipt size={16} />
                {editItem ? 'Edit Input Realisasi Belanja' : 'Input Realisasi SP2D Keuangan'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-white hover:text-white/80 font-bold text-lg">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs max-h-[78vh] overflow-y-auto">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Tanggal Realisasi *</label>
                  <input 
                    type="date"
                    value={formTanggal}
                    onChange={(e) => handleDateChange(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Bulan Alokasi</label>
                  <input 
                    type="text"
                    value={formBulan}
                    disabled
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-800 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Pilih Sub-Kegiatan *</label>
                <select
                  value={formSubKeg}
                  onChange={(e) => setFormSubKeg(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 focus:border-blue-600"
                >
                  <option value="">-- Pilih Sub-Kegiatan --</option>
                  {subKegiatans.map((s, idx) => (
                    <option key={idx} value={s.kode_sub_kegiatan}>{s.kode_sub_kegiatan} - {s.nama_sub_kegiatan || ''}</option>
                  ))}
                </select>
              </div>

              {/* Dynamic Warning alerts when budget is low */}
              {(activeSubStatus || rkaSpecificBudgetStatus) && (
                <div className="space-y-2">
                  {rkaSpecificBudgetStatus && (
                    <div className={`p-3 rounded-lg border text-[11px] ${rkaSpecificBudgetStatus.sisa_tersedia < formNominal ? 'bg-amber-50 border-amber-200 text-amber-900 border-dashed animate-pulse' : 'bg-orange-50/50 border-orange-100 text-slate-800'}`}>
                      <p className="font-extrabold flex items-center gap-1 text-orange-950 uppercase tracking-wider text-[9px]">
                        <ShieldCheck size={13} className="text-orange-600 animate-bounce" />
                        Pagu & Sisa Uraian Belanja Terpilih (E-RKA):
                      </p>
                      <ul className="list-inside mt-1.5 pl-0.5 space-y-1 font-sans">
                        <li>Pagu RKA Detail: <b>{formatRupiah(rkaSpecificBudgetStatus.pagu)}</b></li>
                        <li>Sisa Anggaran Uraian Ini (Setelah Input): <b className={`font-mono ${rkaSpecificBudgetStatus.sisa_tersedia < formNominal ? 'text-rose-700 bg-rose-50 px-1 rounded font-black' : 'text-blue-900 font-black'}`}>{formatRupiah(rkaSpecificBudgetStatus.sisa_setelah_input)}</b></li>
                      </ul>
                      {rkaSpecificBudgetStatus.sisa_tersedia < formNominal && (
                        <p className="mt-1 pb-0.5 font-black text-rose-700 text-[10px] flex items-center gap-1">
                          <AlertTriangle size={12} />
                          Atensi SP2D: Pengeluaran melebihi sisa pagu uraian detail RKA ini!
                        </p>
                      )}
                    </div>
                  )}

                  {activeSubStatus && (
                    <div className={`p-3 rounded-lg border text-[11px] ${activeSubStatus.sisa_tersedia < formNominal ? 'bg-red-50 border-red-150 text-red-900' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                      <p className="font-bold flex items-center gap-1 text-[10px]">
                        <DollarSign size={13} />
                        Status Kas Total Sub-Kegiatan:
                      </p>
                      <ul className="list-inside mt-1 pl-0.5 space-y-0.5 font-sans">
                        <li>Total Alokasi Sub DPA: <b>{formatRupiah(activeSubStatus.pagu)}</b></li>
                        <li>Sisa Kas Sub-Kegiatan: <b className={`${activeSubStatus.sisa_tersedia < formNominal ? 'text-rose-700 font-extrabold' : 'text-slate-900 font-mono'}`}>{formatRupiah(activeSubStatus.sisa_tersedia)}</b></li>
                      </ul>
                      {activeSubStatus.sisa_tersedia < formNominal && (
                        <p className="mt-1 font-extrabold text-rose-750 text-[9px] flex items-center gap-1">
                          <AlertTriangle size={12} />
                          Defisit: Nominal input melebihi Plafon Sub DPA!
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Koneksi opsional / otomatis ke Belanja Pihak Ketiga */}
              {availablePihakKetigas.length > 0 && (
                <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg animate-fade-in">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                      <Briefcase size={14} className="text-blue-700" />
                      Kaitkan dengan Kontrak Pihak Ketiga (Opsional)
                    </label>
                    {formPihakKetigaId && (
                      <button
                        type="button"
                        onClick={() => setFormPihakKetigaId('')}
                        className="text-[10px] text-red-600 hover:underline font-bold"
                      >
                        Lepas Kaitan
                      </button>
                    )}
                  </div>
                  <select
                    value={formPihakKetigaId}
                    onChange={(e) => {
                      const pkId = e.target.value;
                      setFormPihakKetigaId(pkId);
                      if (pkId) {
                        const selectedPk = availablePihakKetigas.find(p => p.id === pkId);
                        if (selectedPk) {
                          setFormUraian(selectedPk.uraian_belanja);
                          const inRka = matchingRkasForSub.some(r => r.uraian_belanja === selectedPk.uraian_belanja);
                          setFormUraianIsManual(!inRka);
                          setManualUraianVal(!inRka ? selectedPk.uraian_belanja : '');
                          if (selectedPk.realisasi && selectedPk.realisasi > 0 && formNominal === 0) {
                            setFormNominal(selectedPk.realisasi);
                          }
                          if (!formKeterangan && selectedPk.nama_pelaksana) {
                            setFormKeterangan(`Kontrak: ${selectedPk.nomor_kontrak || '-'} | Pelaksana: ${selectedPk.nama_pelaksana}`);
                          }
                        }
                      }
                    }}
                    className="w-full p-2 bg-white rounded-lg border border-blue-200 text-xs font-medium text-slate-800 focus:outline-blue-600"
                  >
                    <option value="">-- Bukan Belanja Pihak Ketiga / Pilih Kontrak --</option>
                    {availablePihakKetigas.map((pk, idx) => (
                      <option key={idx} value={pk.id}>
                        {pk.nama_pelaksana ? `${pk.nama_pelaksana} - ` : ''}{pk.uraian_belanja} (Kontrak: {pk.nomor_kontrak || '-'})
                      </option>
                    ))}
                  </select>
                  {formPihakKetigaId && (
                    <p className="text-[10px] text-blue-700 mt-1 italic">
                      ✓ Realisasi SP2D ini otomatis tersinkron dengan data Belanja Pihak Ketiga & Uraian Belanja.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">Uraian / Rincian Belanja (Dari E-RKA) *</label>
                {matchingRkasForSub.length > 0 ? (
                  <div>
                    <select
                      value={formUraianIsManual ? 'kustom_manual' : formUraian}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'kustom_manual') {
                          setFormUraianIsManual(true);
                          setFormUraian(manualUraianVal);
                        } else {
                          setFormUraianIsManual(false);
                          setFormUraian(val);
                          // Auto-suggest nominal to remaining specific budget sisa!
                          const matched = matchingRkasForSub.find(r => r.uraian_belanja === val);
                          if (matched) {
                            const itemRealisasis = realisasis.filter(r => r.kode_sub_kegiatan === formSubKeg && r.uraian_belanja === matched.uraian_belanja && r.id !== editItem?.id);
                            const spent = itemRealisasis.reduce((sum, r) => sum + r.nominal_realisasi, 0);
                            const sisaVal = matched.jumlah - spent;
                            setFormNominal(sisaVal > 0 ? sisaVal : 0);
                          }
                        }
                      }}
                      required
                      className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 focus:border-blue-600 font-medium text-slate-800"
                    >
                      <option value="">-- Pilih Uraian Rincian Belanja E-RKA --</option>
                      {matchingRkasForSub.map((r, idx) => (
                        <option key={idx} value={r.uraian_belanja}>
                          {r.uraian_belanja} (Pagu: {formatRupiah(r.jumlah)})
                        </option>
                      ))}
                      <option value="kustom_manual">-- Masukkan Manual --</option>
                    </select>

                    {(formUraianIsManual) && (
                      <div className="mt-2.5 animate-fade-in">
                        <label className="block text-[10px] text-slate-500 font-bold mb-1">Input Uraian Manual Tambahan *</label>
                        <input 
                          type="text"
                          placeholder="Masukkan rincian kegiatan baru..."
                          value={manualUraianVal}
                          onChange={(e) => {
                            setManualUraianVal(e.target.value);
                            setFormUraian(e.target.value);
                          }}
                          required
                          className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <input 
                      type="text"
                      placeholder="Masukkan manual (Tidak ada E-RKA detail untuk sub-kegiatan ini)..."
                      value={formUraian}
                      onChange={(e) => {
                        setFormUraian(e.target.value);
                        setManualUraianVal(e.target.value);
                        setFormUraianIsManual(true);
                      }}
                      required
                      className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600"
                    />
                    <p className="text-[10px] text-slate-500 mt-1 italic">Sub-kegiatan ini belum memiliki detail uraian belanja di E-RKA. Sisa anggaran akan dihitung di tingkat Sub-Kegiatan.</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Nominal Belanja Realisasi (Rp) *</label>
                <input 
                  type="number"
                  placeholder="Masukkan nominal..."
                  value={formNominal}
                  onChange={(e) => setFormNominal(Number(e.target.value))}
                  min={1}
                  required
                  className={`w-full p-2.5 rounded-lg border ${
                    (rkaSpecificBudgetStatus && formNominal > rkaSpecificBudgetStatus.sisa_tersedia) ||
                    (activeSubStatus && formNominal > activeSubStatus.sisa_tersedia)
                      ? 'border-rose-500 bg-rose-50 text-rose-900 font-black ring-2 ring-rose-300' 
                      : 'border-slate-200 text-indigo-900 font-bold'
                  } outline-blue-600`}
                />
                {((rkaSpecificBudgetStatus && formNominal > rkaSpecificBudgetStatus.sisa_tersedia) ||
                  (activeSubStatus && formNominal > activeSubStatus.sisa_tersedia)) && (
                  <div className="mt-2 p-2.5 bg-red-50 border border-red-300 rounded-lg text-red-900 text-xs space-y-1 animate-fade-in">
                    <p className="font-extrabold flex items-center gap-1.5 text-red-700">
                      <AlertTriangle size={14} className="animate-pulse" />
                      ANGGARAN TIDAK CUKUP (PROSES INPUT TIDAK DAPAT DILANJUTKAN)
                    </p>
                    <p className="text-[11px] text-red-800">
                      Sisa pagu tersedia: <b className="font-mono text-emerald-800 font-bold">{formatRupiah(rkaSpecificBudgetStatus ? rkaSpecificBudgetStatus.sisa_tersedia : activeSubStatus!.sisa_tersedia)}</b>. 
                      Defisit: <b className="font-mono text-rose-700 font-black">+{formatRupiah(formNominal - (rkaSpecificBudgetStatus ? rkaSpecificBudgetStatus.sisa_tersedia : activeSubStatus!.sisa_tersedia))}</b>.
                    </p>
                    <p className="text-[10px] text-rose-700 font-bold">
                      🚫 Sistem mengunci proses simpan karena melebihi plafon pagu anggaran.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Catatan SPJ Tambahan</label>
                <textarea 
                  placeholder="Ketik rincian pendukung..."
                  value={formKeterangan}
                  onChange={(e) => setFormKeterangan(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-blue-600"
                />
              </div>

               {/* Upload Proof / Lampiran (SP2D Receipt) */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Lampirkan Bukti SP2D / Kwitansi (*Hanya Foto saja)</label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative overflow-hidden bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 flex items-center gap-2">
                    <Camera size={14} className="text-slate-500" />
                    <span>Upload Berkas Fisik</span>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleProofUpload}
                      disabled={isSaving}
                      className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 truncate max-w-[200px]" title={formBuktiFileName}>
                    {formBuktiFileName || 'Tidak ada file diunggah'}
                  </span>
                  {formBuktiFileName && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        setFormBuktiFile(null);
                        setExistingBuktiUrl('');
                        setFormBuktiFileName('');
                      }}
                      className="px-2.5 py-1 text-red-700 bg-red-50 hover:bg-red-100 hover:text-red-800 rounded text-[10px] font-bold border border-red-200 transition cursor-pointer disabled:opacity-55"
                      title="Klik untuk menghapus berkas yang telah diunggah ini"
                    >
                      Hapus Berkas
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-4 justify-end border-t border-slate-100" id="form-actions">
                <button type="button" disabled={isSaving} onClick={() => setShowForm(false)} className="px-4 py-2 font-semibold text-slate-700 border border-slate-200 rounded-lg disabled:opacity-50">Batal</button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-5 py-2 font-black text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Menyimpan...
                    </>
                  ) : (
                    "Simpan & Laporkan Audit"
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* POPUP NOTIFIKASI ANGGARAN TIDAK CUKUP (BUDGET EXCEEDED) */}
      {showInsufficientBudgetModal && insufficientBudgetData && (
        <div 
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in"
          onClick={() => setShowInsufficientBudgetModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border-2 border-red-400 max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Red Alert Header */}
            <div className="p-4 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-xs">
                  <ShieldAlert size={24} className="text-white animate-bounce" />
                </div>
                <div>
                  <h3 className="font-black text-sm tracking-wide uppercase">Pencairan Ditolak: Anggaran Tidak Cukup</h3>
                  <p className="text-[11px] text-red-100 font-medium">Batas Plafon Anggaran Terlampaui ({insufficientBudgetData.level})</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowInsufficientBudgetModal(false)}
                className="text-white/80 hover:text-white font-black text-xl p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Main Warning Box */}
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-950 space-y-1.5">
                <div className="flex items-center gap-2 font-black text-red-800 text-xs">
                  <Ban size={15} className="text-red-600" />
                  Proses Input Pencairan Tidak Bisa Dilanjutkan!
                </div>
                <p className="text-[11px] text-red-900/90 leading-relaxed">
                  Nominal pencairan yang diajukan sebesar <b className="font-mono text-red-950 font-black">{formatRupiah(insufficientBudgetData.nominalInput)}</b> melebihi kuota sisa pagu anggaran yang tersedia.
                </p>
              </div>

              {/* Data Breakdown Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 font-sans">
                <div className="border-b border-slate-200 pb-2">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Sub-Kegiatan</span>
                  <p className="font-bold text-slate-800 text-xs truncate" title={insufficientBudgetData.namaSubKegiatan}>
                    {insufficientBudgetData.subKegiatanKode} - {insufficientBudgetData.namaSubKegiatan}
                  </p>
                </div>

                <div className="border-b border-slate-200 pb-2">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Jenis / Uraian Belanja</span>
                  <p className="font-black text-blue-950 text-xs mt-0.5">
                    {insufficientBudgetData.uraianBelanja}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold block">Pagu Anggaran ({insufficientBudgetData.level})</span>
                    <span className="font-mono font-bold text-slate-900">{formatRupiah(insufficientBudgetData.paguAnggaran)}</span>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold block">Total Realisasi Sebelumnya</span>
                    <span className="font-mono font-bold text-slate-700">{formatRupiah(insufficientBudgetData.realisasiSebelumnya)}</span>
                  </div>

                  <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-300">
                    <span className="text-[10px] text-emerald-800 font-bold block">Sisa Pagu Tersedia (Maksimal)</span>
                    <span className="font-mono font-black text-emerald-800 text-xs">{formatRupiah(insufficientBudgetData.sisaTersedia)}</span>
                  </div>

                  <div className="bg-rose-50 p-2.5 rounded-lg border border-rose-300">
                    <span className="text-[10px] text-rose-800 font-bold block">Nominal Pencairan Diajukan</span>
                    <span className="font-mono font-black text-rose-800 text-xs">{formatRupiah(insufficientBudgetData.nominalInput)}</span>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-red-100 to-rose-100 border border-red-300 p-2.5 rounded-lg flex items-center justify-between">
                  <span className="font-bold text-red-950 text-[11px]">Kekurangan / Defisit Anggaran:</span>
                  <span className="font-mono font-black text-red-700 text-sm">+{formatRupiah(insufficientBudgetData.kelebihanNominal)}</span>
                </div>
              </div>

              {/* Informative Guidance */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
                <p className="font-bold text-amber-950 flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-amber-700" />
                  SOP Pengendalian Anggaran (Internal Control):
                </p>
                <p className="text-amber-800 leading-relaxed text-[10.5px]">
                  Pencairan SP2D tidak dapat diproses melebihi plafon pagu yang telah disahkan. Harap sesuaikan nominal pencairan agar tidak melebihi <b>{formatRupiah(insufficientBudgetData.sisaTersedia)}</b> atau ajukan pergeseran/revisi anggaran DPA terlebih dahulu.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowInsufficientBudgetModal(false)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  Tutup &amp; Sesuaikan Nominal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
