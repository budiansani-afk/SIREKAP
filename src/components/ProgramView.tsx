import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Download, 
  Search, 
  ChevronRight, 
  Layers, 
  FolderLock, 
  ShieldCheck,
  Briefcase,
  Copy,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { Program, Kegiatan, SubKegiatan, UserRole, RKA } from '../types';
import { formatRupiah, exportToCSV } from '../utils/helpers';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';
import { 
  COLL_PROGRAM, 
  COLL_KEGIATAN, 
  COLL_SUB_KEGIATAN, 
  COLL_RKA,
  createAuditLog, 
  synchronizeCalculations,
  clearDatabase 
} from '../dbService';

interface ProgramViewProps {
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  rkaList: RKA[];
  allPrograms?: Program[];
  allKegiatans?: Kegiatan[];
  allSubKegiatans?: SubKegiatan[];
  allRkaList?: RKA[];
  currentUserRole: UserRole;
  currentUserEmail: string;
  activeTab: 'program' | 'kegiatan' | 'sub_kegiatan';
  onChangeTab: (tab: 'program' | 'kegiatan' | 'sub_kegiatan') => void;
  selectedYear: number;
}

type ActiveTabType = 'program' | 'kegiatan' | 'sub_kegiatan';

export default function ProgramView({
  programs,
  kegiatans,
  subKegiatans,
  rkaList = [],
  allPrograms = [],
  allKegiatans = [],
  allSubKegiatans = [],
  allRkaList = [],
  currentUserRole,
  currentUserEmail,
  activeTab,
  onChangeTab,
  selectedYear
}: ProgramViewProps) {
  const setActiveTab = onChangeTab;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProgramFilter, setSelectedProgramFilter] = useState('');
  const [selectedSubKegiatanRka, setSelectedSubKegiatanRka] = useState<SubKegiatan | null>(null);

  const matchingRkas = useMemo(() => {
    if (!selectedSubKegiatanRka) return [];
    return rkaList.filter(item => item.kode_sub_kegiatan === selectedSubKegiatanRka.kode_sub_kegiatan);
  }, [selectedSubKegiatanRka, rkaList]);

  const totalRkasSum = useMemo(() => {
    return matchingRkas.reduce((sum, item) => sum + (item.jumlah || 0), 0);
  }, [matchingRkas]);
  
  // Modal controllers
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);

  // Copy Year states
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceYear, setCopySourceYear] = useState<number>(2026);
  const [copyTargetYear, setCopyTargetYear] = useState<number>(2027);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    if (showCopyModal) {
      setCopySourceYear(selectedYear);
      setCopyTargetYear(selectedYear === 2026 ? 2027 : selectedYear + 1);
    }
  }, [showCopyModal, selectedYear]);

  const listAllYears = [2025, 2026, 2027, 2028, 2029, 2030];

  const sourceStats = useMemo(() => {
    const progs = allPrograms?.filter(p => (p.tahun || 2026) === copySourceYear) || [];
    const kegs = allKegiatans?.filter(k => (k.tahun || 2026) === copySourceYear) || [];
    const subs = allSubKegiatans?.filter(s => (s.tahun || 2026) === copySourceYear) || [];
    const rkas = allRkaList?.filter(r => (r.tahun || 2026) === copySourceYear) || [];
    return {
      progs: progs.length,
      kegs: kegs.length,
      subs: subs.length,
      rkas: rkas.length
    };
  }, [allPrograms, allKegiatans, allSubKegiatans, allRkaList, copySourceYear]);

  const doSeedSourceYear = async (sourceYear: number) => {
    // Sample Programs
    const p1: Program = {
      id: `${sourceYear}_2.10.01`,
      kode_program: "2.10.01",
      nama_program: "Program Penataan Penguasaan, Pemilikan, Penggunaan dan Pemanfaatan Tanah",
      pagu: 18500000,
      realisasi: 0,
      sisa: 18500000,
      persentase: 0,
      tahun: sourceYear
    };
    const p2: Program = {
      id: `${sourceYear}_2.10.02`,
      kode_program: "2.10.02",
      nama_program: "Program Penyediaan Tanah untuk Pembangunan Kepentingan Umum",
      pagu: 10000000,
      realisasi: 0,
      sisa: 10000000,
      persentase: 0,
      tahun: sourceYear
    };

    // Sample Kegiatan
    const k1: Kegiatan = {
      id: `${sourceYear}_2.10.01.2.01`,
      kode_kegiatan: "2.10.01.2.01",
      nama_kegiatan: "Penyelesaian Sengketa Tanah Garapan dan Tanah Ulayat",
      kode_program: "2.10.01",
      pagu: 18500000,
      realisasi: 0,
      sisa: 18500000,
      persentase: 0,
      tahun: sourceYear
    };
    const k2: Kegiatan = {
      id: `${sourceYear}_2.10.02.2.01`,
      kode_kegiatan: "2.10.02.2.01",
      nama_kegiatan: "Fasilitasi Ganti Kerugian dan Penyediaan Tanah bagi Pembangunan",
      kode_program: "2.10.02",
      pagu: 10000000,
      realisasi: 0,
      sisa: 10000000,
      persentase: 0,
      tahun: sourceYear
    };

    // Sample Sub-Kegiatan
    const s1: SubKegiatan = {
      id: `${sourceYear}_2.10.01.2.01.01`,
      kode_sub_kegiatan: "2.10.01.2.01.01",
      nama_sub_kegiatan: "Mediasi dan Fasilitasi Penyelesaian Sengketa Pertanahan Daerah",
      kode_program: "2.10.01",
      kode_kegiatan: "2.10.01.2.01",
      pagu: 18500000,
      realisasi: 0,
      sisa: 18500000,
      persentase: 0,
      tahun: sourceYear
    };
    const s2: SubKegiatan = {
      id: `${sourceYear}_2.10.02.2.01.01`,
      kode_sub_kegiatan: "2.10.02.2.01.01",
      nama_sub_kegiatan: "Pengukuran, Pemetaan, dan Inventarisasi Lahan Bidang Tanah",
      kode_program: "2.10.02",
      kode_kegiatan: "2.10.02.2.01",
      pagu: 10000000,
      realisasi: 0,
      sisa: 10000000,
      persentase: 0,
      tahun: sourceYear
    };

    // Sample RKA details
    const r1: RKA = {
      id: `rka_${sourceYear}_2.10.01.2.01.01_5.1.02.01`,
      tahun: sourceYear,
      kode_program: "2.10.01",
      kode_kegiatan: "2.10.01.2.01",
      kode_sub_kegiatan: "2.10.01.2.01.01",
      kode_rekening: "5.1.02.01",
      uraian_belanja: "Belanja ATK dan Penggandaan Dokumen Sengketa Tanah",
      volume: 10,
      satuan: "Paket",
      harga_satuan: 350000,
      jumlah: 3500000,
      tw1: 1000000,
      tw2: 1000000,
      tw3: 1000000,
      tw4: 500000
    };
    const r2: RKA = {
      id: `rka_${sourceYear}_2.10.01.2.01.01_5.1.02.04`,
      tahun: sourceYear,
      kode_program: "2.10.01",
      kode_kegiatan: "2.10.01.2.01",
      kode_sub_kegiatan: "2.10.01.2.01.01",
      kode_rekening: "5.1.02.04",
      uraian_belanja: "Honorarium Tenaga Ahli Hukum Pertanahan & Mediasi Konflik",
      volume: 3,
      satuan: "OB",
      harga_satuan: 5000000,
      jumlah: 15000000,
      tw1: 5000000,
      tw2: 5000000,
      tw3: 5000000,
      tw4: 0
    };
    const r3: RKA = {
      id: `rka_${sourceYear}_2.10.02.2.01.01_5.1.02.02`,
      tahun: sourceYear,
      kode_program: "2.10.02",
      kode_kegiatan: "2.10.02.2.01",
      kode_sub_kegiatan: "2.10.02.2.01.01",
      kode_rekening: "5.1.02.02",
      uraian_belanja: "Uang Harian Perjalanan Dinas Tim Pengukuran Lahan Lapangan",
      volume: 25,
      satuan: "OH",
      harga_satuan: 400000,
      jumlah: 10000000,
      tw1: 2500000,
      tw2: 2500000,
      tw3: 2500000,
      tw4: 2500000
    };

    // Write to Firestore
    await setDoc(doc(db, COLL_PROGRAM, p1.id), p1);
    await setDoc(doc(db, COLL_PROGRAM, p2.id), p2);

    await setDoc(doc(db, COLL_KEGIATAN, k1.id), k1);
    await setDoc(doc(db, COLL_KEGIATAN, k2.id), k2);

    await setDoc(doc(db, COLL_SUB_KEGIATAN, s1.id), s1);
    await setDoc(doc(db, COLL_SUB_KEGIATAN, s2.id), s2);

    await setDoc(doc(db, COLL_RKA, r1.id), r1);
    await setDoc(doc(db, COLL_RKA, r2.id), r2);
    await setDoc(doc(db, COLL_RKA, r3.id), r3);

    await createAuditLog(
      currentUserEmail,
      currentUserRole,
      `MEMBUAT DATA SAMPEL TAHUN ${sourceYear}`,
      "PROGRAM",
      null,
      {
        seeded_year: sourceYear,
        programs: 2,
        kegiatans: 2,
        subkegiatans: 2,
        rkas: 3
      }
    );

    await synchronizeCalculations();
  };

  const doCloneYearData = async (sourceYear: number, targetYear: number) => {
    // Read local/live lists, filtered for sourceYear
    const progsToCopy = allPrograms?.filter(p => (p.tahun || 2026) === sourceYear) || [];
    const kegsToCopy = allKegiatans?.filter(k => (k.tahun || 2026) === sourceYear) || [];
    const subsToCopy = allSubKegiatans?.filter(s => (s.tahun || 2026) === sourceYear) || [];
    const rkasToCopy = allRkaList?.filter(r => (r.tahun || 2026) === sourceYear) || [];

    let copiedProgs = 0;
    let copiedKegs = 0;
    let copiedSubs = 0;
    let copiedRkas = 0;

    // Copy Programs
    for (const p of progsToCopy) {
      const docId = `${targetYear}_${p.kode_program}`;
      await setDoc(doc(db, COLL_PROGRAM, docId), {
        ...p,
        id: docId,
        tahun: targetYear,
        pagu: p.pagu || 0,
        realisasi: 0,
        sisa: p.pagu || 0,
        persentase: 0
      }, { merge: true });
      copiedProgs++;
    }

    // Copy Kegiatans
    for (const k of kegsToCopy) {
      const docId = `${targetYear}_${k.kode_kegiatan}`;
      await setDoc(doc(db, COLL_KEGIATAN, docId), {
        ...k,
        id: docId,
        tahun: targetYear,
        pagu: k.pagu || 0,
        realisasi: 0,
        sisa: k.pagu || 0,
        persentase: 0
      }, { merge: true });
      copiedKegs++;
    }

    // Copy SubKegiatans
    for (const s of subsToCopy) {
      const docId = `${targetYear}_${s.kode_sub_kegiatan}`;
      await setDoc(doc(db, COLL_SUB_KEGIATAN, docId), {
        ...s,
        id: docId,
        tahun: targetYear,
        pagu: s.pagu || 0,
        realisasi: 0,
        sisa: s.pagu || 0,
        persentase: 0
      }, { merge: true });
      copiedSubs++;
    }

    // Copy RKAs
    for (const r of rkasToCopy) {
      const rkaId = `rka_${targetYear}_${r.kode_sub_kegiatan}_${r.kode_rekening || 'x'}_${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, COLL_RKA, rkaId), {
        ...r,
        id: rkaId,
        tahun: targetYear
      });
      copiedRkas++;
    }

    await createAuditLog(
      currentUserEmail,
      currentUserRole,
      `SALIN ANGGARAN DARI ${sourceYear} KE ${targetYear}`,
      "PROGRAM",
      null,
      {
        source_year: sourceYear,
        target_year: targetYear,
        copied_programs: copiedProgs,
        copied_kegiatans: copiedKegs,
        copied_sub_kegiatans: copiedSubs,
        copied_rkas: copiedRkas
      }
    );

    await synchronizeCalculations();
    return { copiedProgs, copiedKegs, copiedSubs, copiedRkas };
  };

  const handleCloneYearData = async () => {
    if (copySourceYear === copyTargetYear) {
      alert("Tahun sumber dan tahun tujuan tidak boleh sama.");
      return;
    }

    if (sourceStats.progs === 0 && sourceStats.kegs === 0 && sourceStats.subs === 0 && sourceStats.rkas === 0) {
      const confirmSeed = window.confirm(
        `Tahun sumber ${copySourceYear} tidak memiliki data anggaran. Apakah Anda ingin membuat Data Sampel Bidang Pertanahan ${copySourceYear} terlebih dahulu agar langsung disalin ke tahun aktif ${copyTargetYear}?`
      );
      if (!confirmSeed) return;

      setIsCopying(true);
      try {
        await doSeedSourceYear(copySourceYear);
        const stats = await doCloneYearData(copySourceYear, copyTargetYear);
        alert(`Sukses menginisialisasi Data Sampel Pertanahan ${copySourceYear} & langsung menyalin ke tahun ${copyTargetYear}:\n- ${stats.copiedProgs} Program\n- ${stats.copiedKegs} Kegiatan\n- ${stats.copiedSubs} Sub-Kegiatan\n- ${stats.copiedRkas} Rincian RKA Belanja\n\nSemua kalkulasi pagu telah disinkronkan secara bottom-up.`);
        setShowCopyModal(false);
      } catch (err) {
        console.error("Gagal menyalin data:", err);
        alert("Gagal menyalin data: " + (err instanceof Error ? err.message : String(err)));
      } finally {
        setIsCopying(false);
      }
      return;
    }

    const confirmClone = window.confirm(
      `Apakah Anda yakin ingin menyalin ${sourceStats.progs} Program, ${sourceStats.kegs} Kegiatan, ${sourceStats.subs} Sub-Kegiatan, dan ${sourceStats.rkas} Rincian RKA Belanja dari tahun ${copySourceYear} ke tahun anggaran ${copyTargetYear}?`
    );
    if (!confirmClone) return;

    setIsCopying(true);

    try {
      const stats = await doCloneYearData(copySourceYear, copyTargetYear);
      alert(`Sukses menyalin data dari tahun ${copySourceYear} ke tahun ${copyTargetYear}:\n- ${stats.copiedProgs} Program\n- ${stats.copiedKegs} Kegiatan\n- ${stats.copiedSubs} Sub-Kegiatan\n- ${stats.copiedRkas} Rincian RKA Belanja\n\nSemua kalkulasi pagu telah disinkronkan secara bottom-up.`);
      setShowCopyModal(false);
    } catch (err) {
      console.error("Gagal menyalin data tahunan:", err);
      alert("Gagal menyalin data: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsCopying(false);
    }
  };

  // Form Fields holding state based on current dynamic tab
  const [formKode, setFormKode] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formParentProgram, setFormParentProgram] = useState(''); // for Kegiatan and Sub Kegiatan
  const [formParentKegiatan, setFormParentKegiatan] = useState(''); // for Sub Kegiatan
  const [formManualPagu, setFormManualPagu] = useState<number>(0); // manual fallback if no RKA

  const canEdit = currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.OPERATOR;
  const canDelete = currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.OPERATOR;

  // Search/Filters logic
  const filteredPrograms = useMemo(() => {
    return programs.filter(p => 
      (p && p.kode_program ? String(p.kode_program).toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
      (p && p.nama_program ? String(p.nama_program).toLowerCase().includes(searchTerm.toLowerCase()) : false)
    );
  }, [programs, searchTerm]);

  const filteredKegiatans = useMemo(() => {
    return kegiatans.filter(k => {
      const matchSearch = (k && k.kode_kegiatan ? String(k.kode_kegiatan).toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
                          (k && k.nama_kegiatan ? String(k.nama_kegiatan).toLowerCase().includes(searchTerm.toLowerCase()) : false);
      const matchParent = selectedProgramFilter === '' || (k && k.kode_program === selectedProgramFilter);
      return matchSearch && matchParent;
    });
  }, [kegiatans, searchTerm, selectedProgramFilter]);

  const filteredSubKegiatans = useMemo(() => {
    return subKegiatans.filter(s => {
      const matchSearch = (s && s.kode_sub_kegiatan ? String(s.kode_sub_kegiatan).toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
                          (s && s.nama_sub_kegiatan ? String(s.nama_sub_kegiatan).toLowerCase().includes(searchTerm.toLowerCase()) : false);
      const matchParent = selectedProgramFilter === '' || (s && s.kode_program === selectedProgramFilter);
      return matchSearch && matchParent;
    });
  }, [subKegiatans, searchTerm, selectedProgramFilter]);

  // Open Form Overlay in Addition Mode
  const openAddModal = () => {
    setEditItem(null);
    setFormKode('');
    setFormNama('');
    setFormParentProgram('');
    setFormParentKegiatan('');
    setFormManualPagu(0);
    setShowForm(true);
  };

  // Open Form Overlay in Edit Mode
  const openEditModal = (item: any) => {
    setEditItem(item);
    setFormKode(item.kode_program || item.kode_kegiatan || item.kode_sub_kegiatan);
    setFormNama(item.nama_program || item.nama_kegiatan || item.nama_sub_kegiatan);
    setFormParentProgram(item.kode_program || '');
    setFormParentKegiatan(item.kode_kegiatan || '');
    setFormManualPagu(item.pagu || 0);
    setShowForm(true);
  };

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const codeRegex = /^[a-zA-Z0-9_\-\.]+$/;
    if (!formKode.trim() || !formNama.trim()) {
      alert("Kode dan Nama wajib diisi.");
      return;
    }
    if (!codeRegex.test(formKode.trim())) {
      alert("Kode hanya boleh berisi huruf, angka, titik, underscore, atau tanda hubung. Tanpa spasi.");
      return;
    }

    try {
      const baseCode = formKode.trim();
      const targetYear = editItem?.tahun || selectedYear;
      const docId = `${targetYear}_${baseCode}`;
      let collectionName = '';
      let logModule = '';
      let payload: any = {};

      if (activeTab === 'program') {
        collectionName = COLL_PROGRAM;
        logModule = "PROGRAM";
        payload = { ...editItem, id: docId, kode_program: baseCode, nama_program: formNama.trim(), tahun: targetYear };
        if (!editItem) {
          payload.pagu = formManualPagu;
          payload.realisasi = 0;
          payload.sisa = formManualPagu;
          payload.persentase = 0;
        }
      } else if (activeTab === 'kegiatan') {
        collectionName = COLL_KEGIATAN;
        logModule = "KEGIATAN";
        if (!formParentProgram) {
          alert("Harap pilih Program Atasan.");
          return;
        }
        payload = { ...editItem, id: docId, kode_kegiatan: baseCode, nama_kegiatan: formNama.trim(), kode_program: formParentProgram, tahun: targetYear };
        if (!editItem) {
          payload.pagu = formManualPagu;
          payload.realisasi = 0;
          payload.sisa = formManualPagu;
          payload.persentase = 0;
        }
      } else {
        collectionName = COLL_SUB_KEGIATAN;
        logModule = "SUB_KEGIATAN";
        if (!formParentProgram || !formParentKegiatan) {
          alert("Harap lengkapi Program dan Kegiatan Atasan.");
          return;
        }
        payload = { ...editItem, id: docId, kode_sub_kegiatan: baseCode, nama_sub_kegiatan: formNama.trim(), kode_program: formParentProgram, kode_kegiatan: formParentKegiatan, tahun: targetYear };
        if (!editItem) {
          payload.pagu = formManualPagu;
          payload.realisasi = 0;
          payload.sisa = formManualPagu;
          payload.persentase = 0;
        }
      }

      const docRef = doc(db, collectionName, docId);
      
      try {
        await setDoc(docRef, payload, { merge: true });
      } catch (err) {
        console.error('Firestore setDoc failed:', err);
        handleFirestoreError(err, OperationType.WRITE, `${collectionName}/${docId}`);
        throw err;
      }
      
      // If code was changed during editing, delete the old document
      if (editItem && editItem.id && editItem.id !== docId) {
        console.log(`[DEBUG_HAPUS] WILL DELETE OLD DOC: ${collectionName}/${editItem.id} because ID changed to ${docId}`);
        try {
          await deleteDoc(doc(db, collectionName, editItem.id));
          console.log(`[DEBUG_HAPUS] OLD DOC DELETED SUCCESSFULLY: ${editItem.id}`);
        } catch (err) {
          console.error(`[DEBUG_HAPUS] FAILED TO DELETE OLD DOC: ${editItem.id}`, err);
        }
      } else {
        console.log(`[DEBUG_HAPUS] NO DELETION: editItem.id=${editItem?.id}, docId=${docId}`);
      }

      // Log the changes
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        editItem ? "UPDATE DATAS" : "TAMBAH DATAS",
        logModule,
        editItem,
        payload
      );

      // Force recalculation bottom up
      await synchronizeCalculations();
      
      setShowForm(false);
      setEditItem(null);
    } catch (err) {
      alert("Gagal menyimpan data: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Handle deletion of Master Data row
  const handleDelete = async (item: any) => {
    const isConfirmed = window.confirm(`Apakah Anda yakin ingin menghapus "${item.id}"? Tindakan ini tidak dapat dibatalkan.`);
    if (!isConfirmed) return;

    try {
      let collectionName = '';
      let logModule = '';

      if (activeTab === 'program') {
        collectionName = COLL_PROGRAM;
        logModule = "PROGRAM";
      } else if (activeTab === 'kegiatan') {
        collectionName = COLL_KEGIATAN;
        logModule = "KEGIATAN";
      } else {
        collectionName = COLL_SUB_KEGIATAN;
        logModule = "SUB_KEGIATAN";
      }

      console.log(`[DEBUG_HAPUS] DELETING DOC FROM ${collectionName}: ${item.id}`);
      await deleteDoc(doc(db, collectionName, item.id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${item.id}`));
      
      await createAuditLog(
        currentUserEmail,
        currentUserRole,
        "HAPUS DATAS",
        logModule,
        item,
        null
      );

      // Recalculate cascades
      await synchronizeCalculations();
    } catch (err) {
      alert("Gagal menghapus: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Handle Export CSV
  const handleExport = () => {
    if (activeTab === 'program') {
      const exportHeaders = ['kode_program', 'nama_program', 'pagu', 'realisasi', 'sisa', 'persentase'];
      exportToCSV(filteredPrograms, exportHeaders, `Daftar_Program_SIREKAP`);
    } else if (activeTab === 'kegiatan') {
      const exportHeaders = ['kode_kegiatan', 'nama_kegiatan', 'kode_program', 'pagu', 'realisasi', 'sisa', 'persentase'];
      exportToCSV(filteredKegiatans, exportHeaders, `Daftar_Kegiatan_SIREKAP`);
    } else {
      const exportHeaders = ['kode_sub_kegiatan', 'nama_sub_kegiatan', 'kode_program', 'kode_kegiatan', 'pagu', 'realisasi', 'sisa', 'persentase'];
      exportToCSV(filteredSubKegiatans, exportHeaders, `Daftar_Sub_Kegiatan_SIREKAP`);
    }
  };

  return (
    <div className="space-y-6" id="program-module-root">
      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="module-title-bar">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 font-display">
            <Layers className="text-[#1e3a8a]" size={20} />
            Struktur Belanja Sektor Pertanahan
          </h2>
          <p className="text-xs text-slate-500 mt-1">Kinerja master program dinas, kode kegiatan DPA, dan sub kegiatan teknis pendukung.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canEdit && (
            <button 
              onClick={() => setShowCopyModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition cursor-pointer"
              id="btn-copy-previous-year"
            >
              <Copy size={13} />
              Salin dari Tahun Lain
            </button>
          )}
          <button 
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition cursor-pointer"
            id="btn-export-structure"
          >
            <Download size={14} />
            Ekspor CSV
          </button>
          {canEdit && (
            <button 
              onClick={openAddModal}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1e40af] hover:bg-[#1e3a8a] rounded-lg shadow-sm transition cursor-pointer"
              id="btn-add-structure"
            >
              <Plus size={15} />
              Tambah {activeTab === 'program' ? 'Program' : activeTab === 'kegiatan' ? 'Kegiatan' : 'Sub Kegiatan'}
            </button>
          )}

          {currentUserEmail === 'budiansani@gmail.com' && (
            <button 
              onClick={async () => { if(confirm("Yakin hapus SEMUA database?")) { await clearDatabase(); location.reload(); } }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg shadow-sm transition cursor-pointer"
            >
              <Trash2 size={15} />
              Hapus Database
            </button>
          )}
        </div>
      </div>

      {/* Tabs Selector & Search */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm" id="controls-section">
        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg self-start" id="tab-nav-buttons">
          <button
            onClick={() => { setActiveTab('program'); setSearchTerm(''); }}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${activeTab === 'program' ? 'bg-white text-[#1e3a8a] shadow' : 'text-slate-600 hover:text-slate-900'}`}
          >
            1. Program ({programs.length})
          </button>
          <button
            onClick={() => { setActiveTab('kegiatan'); setSearchTerm(''); }}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${activeTab === 'kegiatan' ? 'bg-white text-[#1e3a8a] shadow' : 'text-slate-600 hover:text-slate-900'}`}
          >
            2. Kegiatan ({kegiatans.length})
          </button>
          <button
            onClick={() => { setActiveTab('sub_kegiatan'); setSearchTerm(''); }}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${activeTab === 'sub_kegiatan' ? 'bg-white text-[#1e3a8a] shadow' : 'text-slate-600 hover:text-slate-900'}`}
          >
            3. Sub-Kegiatan ({subKegiatans.length})
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center flex-1 md:justify-end" id="filters-search-wrapper">
          {/* Program filter for Kegiatan and Sub Kegiatan tabs */}
          {activeTab !== 'program' && (
            <select
              value={selectedProgramFilter}
              onChange={(e) => setSelectedProgramFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-blue-600 max-w-xs"
            >
              <option value="">Semua Program</option>
              {programs.map((p, k) => (
                <option key={k} value={p.kode_program}>{p.kode_program} - {(p.nama_program || '').substring(0, 30)}...</option>
              ))}
            </select>
          )}

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder={`Cari ${activeTab === 'program' ? 'program' : activeTab === 'kegiatan' ? 'kegiatan' : 'sub kegiatan'}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-blue-600 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="tables-wrapper">
        <div className="overflow-x-auto w-full">
          {activeTab === 'program' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
                  <th className="p-3.5 pl-4 w-40">Kode Program</th>
                  <th className="p-3.5">Nama Program</th>
                  <th className="p-3.5 text-right">Pagu</th>
                  <th className="p-3.5 text-right">Realisasi</th>
                  <th className="p-3.5 text-right">Sisa Anggaran</th>
                  <th className="p-3.5 text-center w-24">Persentase</th>
                  {canEdit && <th className="p-3.5 text-center w-28">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredPrograms.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-medium">Data program tidak ditemukan.</td>
                  </tr>
                ) : (
                  filteredPrograms.map((p, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition">
                      <td className="p-3.5 pl-4 font-mono font-bold text-slate-900">{p.kode_program}</td>
                      <td className="p-3.5 font-medium">
                        <button 
                          onClick={() => {
                            setSelectedProgramFilter(p.kode_program);
                            setActiveTab('kegiatan');
                          }}
                          className="hover:underline text-blue-700 hover:text-blue-800 text-left font-bold cursor-pointer transition flex items-center gap-1"
                        >
                          {p.nama_program}
                          <ChevronRight size={14} className="text-blue-500 shrink-0 inline" />
                        </button>
                      </td>
                      <td className="p-3.5 text-right font-bold text-slate-950">{formatRupiah(p.pagu)}</td>
                      <td className="p-3.5 text-right text-emerald-800 font-semibold">{formatRupiah(p.realisasi)}</td>
                      <td className="p-3.5 text-right font-medium text-slate-700">{formatRupiah(p.sisa)}</td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${p.persentase >= 80 ? 'bg-emerald-100 text-emerald-800' : p.persentase >= 50 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}`}>
                          {p.persentase}%
                        </span>
                      </td>
                      {canEdit && (
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => openEditModal(p)} className="p-1.5 hover:bg-amber-100 text-amber-700 rounded transition" title="Edit"><Edit2 size={13} /></button>
                            {canDelete && <button onClick={() => handleDelete(p)} className="p-1.5 hover:bg-red-100 text-red-700 rounded transition" title="Hapus"><Trash2 size={13} /></button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'kegiatan' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
                  <th className="p-3.5 pl-4 w-40">Kode Kegiatan</th>
                  <th className="p-3.5">Nama Kegiatan</th>
                  <th className="p-3.5 w-36">Kode Program</th>
                  <th className="p-3.5 text-right">Pagu</th>
                  <th className="p-3.5 text-right">Realisasi</th>
                  <th className="p-3.5 text-right">Sisa Anggaran</th>
                  <th className="p-3.5 text-center w-24">Persentase</th>
                  {canEdit && <th className="p-3.5 text-center w-28">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredKegiatans.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">Data kegiatan tidak ditemukan.</td>
                  </tr>
                ) : (
                  filteredKegiatans.map((k, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition">
                      <td className="p-3.5 pl-4 font-mono font-bold text-slate-900">{k.kode_kegiatan}</td>
                      <td className="p-3.5 font-medium">
                        <button 
                          onClick={() => {
                            setSelectedProgramFilter(k.kode_program);
                            setSearchTerm(k.kode_kegiatan);
                            setActiveTab('sub_kegiatan');
                          }}
                          className="hover:underline text-blue-700 hover:text-blue-800 text-left font-bold cursor-pointer transition flex items-center gap-1"
                        >
                          {k.nama_kegiatan}
                          <ChevronRight size={14} className="text-blue-500 shrink-0 inline" />
                        </button>
                      </td>
                      <td className="p-3.5 font-mono text-slate-600">{k.kode_program}</td>
                      <td className="p-3.5 text-right font-bold text-slate-950">{formatRupiah(k.pagu)}</td>
                      <td className="p-3.5 text-right text-emerald-800 font-semibold">{formatRupiah(k.realisasi)}</td>
                      <td className="p-3.5 text-right font-medium text-slate-700">{formatRupiah(k.sisa)}</td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${k.persentase >= 80 ? 'bg-emerald-100 text-emerald-800' : k.persentase >= 50 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}`}>
                          {k.persentase}%
                        </span>
                      </td>
                      {canEdit && (
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => openEditModal(k)} className="p-1.5 hover:bg-amber-100 text-amber-700 rounded transition" title="Edit"><Edit2 size={13} /></button>
                            {canDelete && <button onClick={() => handleDelete(k)} className="p-1.5 hover:bg-red-100 text-red-700 rounded transition" title="Hapus"><Trash2 size={13} /></button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'sub_kegiatan' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
                  <th className="p-3.5 pl-4 w-44">Kode Sub Kegiatan</th>
                  <th className="p-3.5">Nama Sub Kegiatan</th>
                  <th className="p-3.5 w-36">Kode Kegiatan</th>
                  <th className="p-3.5 text-right">Pagu</th>
                  <th className="p-3.5 text-right">Realisasi</th>
                  <th className="p-3.5 text-right">Sisa Anggaran</th>
                  <th className="p-3.5 text-center w-24">Persentase</th>
                  {canEdit && <th className="p-3.5 text-center w-28">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredSubKegiatans.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">Data sub-kegiatan tidak ditemukan.</td>
                  </tr>
                ) : (
                  filteredSubKegiatans.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition">
                      <td className="p-3.5 pl-4 font-mono font-bold text-slate-900">{s.kode_sub_kegiatan}</td>
                      <td className="p-3.5 font-medium">
                        <button 
                          onClick={() => {
                            setSelectedSubKegiatanRka(s);
                          }}
                          className="hover:underline text-orange-600 hover:text-orange-700 text-left font-bold cursor-pointer transition flex items-center gap-1.5"
                        >
                          {s.nama_sub_kegiatan}
                          <span className="text-[9px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-black tracking-wider uppercase shrink-0">Rincian RKA</span>
                        </button>
                      </td>
                      <td className="p-3.5 font-mono text-slate-600">{s.kode_kegiatan}</td>
                      <td className="p-3.5 text-right font-bold text-slate-950">{formatRupiah(s.pagu)}</td>
                      <td className="p-3.5 text-right text-emerald-800 font-semibold">{formatRupiah(s.realisasi)}</td>
                      <td className="p-3.5 text-right font-medium text-slate-700">{formatRupiah(s.sisa)}</td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${s.persentase >= 80 ? 'bg-emerald-100 text-emerald-800' : s.persentase >= 50 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}`}>
                          {s.persentase}%
                        </span>
                      </td>
                      {canEdit && (
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => openEditModal(s)} className="p-1.5 hover:bg-amber-100 text-amber-700 rounded transition" title="Edit"><Edit2 size={13} /></button>
                            {canDelete && <button onClick={() => handleDelete(s)} className="p-1.5 hover:bg-red-100 text-red-700 rounded transition" title="Hapus"><Trash2 size={13} /></button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Unified overlay drawer form */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="form-overlay bg">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden" id="form-card">
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-1.5 text-sm">
                <ShieldCheck size={16} />
                {editItem ? 'Edit' : 'Tambah'} {activeTab === 'program' ? 'Program' : activeTab === 'kegiatan' ? 'Kegiatan' : 'Sub Kegiatan'}
              </h3>
              <button 
                onClick={() => setShowForm(false)}
                className="text-white/80 hover:text-white font-semibold text-lg"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
              
               {/* Parent program selector (when target is Kegiatan / SubKegiatan) */}
              {activeTab !== 'program' && (
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Pilih Program Atasan *</label>
                  <select
                    value={formParentProgram}
                    onChange={(e) => setFormParentProgram(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 focus:border-blue-600 bg-slate-50"
                  >
                    <option value="">-- Pilih Program --</option>
                    {programs.map((p, x) => (
                      <option key={x} value={p.kode_program}>{p.kode_program} - {(p.nama_program || '').substring(0, 35)}...</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Parent kegiatan selector (when target is SubKegiatan) */}
              {activeTab === 'sub_kegiatan' && (
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Pilih Kegiatan Atasan *</label>
                  <select
                    value={formParentKegiatan}
                    onChange={(e) => setFormParentKegiatan(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 focus:border-blue-600 bg-slate-50"
                  >
                    <option value="">-- Pilih Kegiatan --</option>
                    {kegiatans
                      .filter(k => !formParentProgram || k.kode_program === formParentProgram)
                      .map((keg, idx) => (
                        <option key={idx} value={keg.kode_kegiatan}>{keg.kode_kegiatan} - {(keg.nama_kegiatan || '').substring(0, 35)}...</option>
                      ))
                    }
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Kode {activeTab === 'program' ? 'Program' : activeTab === 'kegiatan' ? 'Kegiatan' : 'Sub Kegiatan'} *
                </label>
                <input
                  type="text"
                  placeholder={activeTab === 'program' ? 'Contoh: 2.10.01' : activeTab === 'kegiatan' ? 'Contoh: 2.10.01.2.01' : 'Contoh: 2.10.01.2.01.01'}
                  value={formKode}
                  onChange={(e) => setFormKode(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 focus:border-blue-600 disabled:bg-slate-100 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Nama {activeTab === 'program' ? 'Program' : activeTab === 'kegiatan' ? 'Kegiatan' : 'Sub Kegiatan'} *
                </label>
                <textarea
                  placeholder="Ketik deskripsi nama lengkap..."
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  rows={3}
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 focus:border-blue-600"
                />
              </div>

              {/* Manual Pagu fallback when no RKA detailed belanja lines exist */}
              {!editItem && (
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Pagu Sektor Tetap (Rupiah) <span className="text-slate-400 font-normal">(Isi jika tidak memakai perhitungan rincian RKA)</span>
                  </label>
                  <input
                    type="number"
                    value={formManualPagu}
                    onChange={(e) => setFormManualPagu(Number(e.target.value))}
                    min={0}
                    className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 focus:border-blue-600"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 justify-end" id="form-actions-buttons">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow"
                >
                  Simpan Perubahan
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* RKA Detailed Expenses Overlay Modal */}
      {selectedSubKegiatanRka && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="rka-details-modal-container">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]">
            <div className="bg-gradient-to-r from-blue-900 to-[#1e3a8a] px-6 py-4 flex items-center justify-between text-white shrink-0">
              <div>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold text-blue-100">Rincian Dokumen RKA</span>
                <h3 className="text-sm font-bold mt-1 font-mono">{selectedSubKegiatanRka.kode_sub_kegiatan} - {selectedSubKegiatanRka.nama_sub_kegiatan}</h3>
              </div>
              <button 
                onClick={() => setSelectedSubKegiatanRka(null)}
                className="text-white hover:text-orange-400 font-extrabold text-xl p-1 transition"
              >
                &times;
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* Highlight summary indicators */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-100/50">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Pagu Sektor Tetap</span>
                  <p className="text-base font-black text-blue-800 font-mono mt-0.5">{formatRupiah(selectedSubKegiatanRka.pagu)}</p>
                </div>
                <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-100/50">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Total Rincian Belanja RKA</span>
                  <p className="text-base font-black text-emerald-800 font-mono mt-0.5">{formatRupiah(totalRkasSum)}</p>
                </div>
                <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-100/50">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Selisih Alokasi</span>
                  <p className={`text-base font-black font-mono mt-0.5 ${selectedSubKegiatanRka.pagu - totalRkasSum < 0 ? 'text-red-700' : 'text-slate-800'}`}>
                    {formatRupiah(selectedSubKegiatanRka.pagu - totalRkasSum)}
                  </p>
                </div>
              </div>

              {matchingRkas.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-slate-500 font-bold text-xs uppercase tracking-wider">Belum ada rincian belanja RKA yang diinput atau disinkronkan untuk sub kegiatan ini.</p>
                  <p className="text-[11px] text-slate-400 mt-1">Silahkan masuk ke menu E-RKA Detail Belanja untuk menyusun rincian rekening belanja.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                          <th className="p-3 w-36">Kode Rekening</th>
                          <th className="p-3">Uraian Belanja</th>
                          <th className="p-3 text-center w-24">Volume</th>
                          <th className="p-3 text-center w-20 font-bold">Satuan</th>
                          <th className="p-3 text-right w-32">Harga Satuan</th>
                          <th className="p-3 text-right w-36">Jumlah</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 text-slate-700 font-medium">
                        {matchingRkas.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/40">
                            <td className="p-3 font-mono text-slate-600 font-semibold">{item.kode_rekening}</td>
                            <td className="p-3 text-slate-900 font-semibold">{item.uraian_belanja}</td>
                            <td className="p-3 text-center font-mono">{item.volume}</td>
                            <td className="p-3 text-center font-semibold text-slate-500">{item.satuan}</td>
                            <td className="p-3 text-right font-mono">{formatRupiah(item.harga_satuan)}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">{formatRupiah(item.jumlah)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-bold text-slate-800 border-t border-slate-200 text-xs">
                          <td colSpan={5} className="p-3 text-right uppercase tracking-wider">Total Hasil Rincian Belanja RKA:</td>
                          <td className="p-3 text-right font-mono font-black text-slate-950 text-sm border-l bg-slate-50">{formatRupiah(totalRkasSum)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2 shrink-0">
              <button 
                onClick={() => setSelectedSubKegiatanRka(null)}
                className="px-5 py-2 hover:bg-slate-200/80 text-slate-750 font-bold border rounded-lg bg-white transition cursor-pointer text-xs uppercase shadow-sm"
              >
                Tutup Rincian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yearly Cloning Modal */}
      {showCopyModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" id="copy-yearly-data-modal">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 flex flex-col">
            <div className="bg-gradient-to-r from-blue-900 to-[#1e3a8a] px-6 py-4 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-2">
                <Copy size={16} />
                <h3 className="text-sm font-bold font-display">Salin Struktur & RKA Anggaran</h3>
              </div>
              <button 
                onClick={() => setShowCopyModal(false)}
                className="text-white hover:text-orange-400 font-extrabold text-xl p-1 transition"
                disabled={isCopying}
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs text-slate-600">
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex gap-3">
                <HelpCircle className="text-blue-700 shrink-0 mt-0.5" size={16} />
                <div>
                  <p className="font-semibold text-blue-900">Salin Data Master & Struktur Anggaran</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Fitur ini akan menyalin seluruh Program, Kegiatan, Sub-Kegiatan, beserta detail Rincian RKA Belanja dari tahun sumber ke tahun anggaran tujuan pilihan Anda.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-slate-700 font-bold">Tahun Sumber *</label>
                  <select
                    value={copySourceYear}
                    onChange={(e) => setCopySourceYear(Number(e.target.value))}
                    disabled={isCopying}
                    className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 focus:border-blue-600 bg-slate-50 font-semibold cursor-pointer"
                  >
                    {listAllYears.map((yr) => (
                      <option key={yr} value={yr}>Tahun {yr}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-slate-700 font-bold">Tahun Tujuan *</label>
                  <select
                    value={copyTargetYear}
                    onChange={(e) => setCopyTargetYear(Number(e.target.value))}
                    disabled={isCopying}
                    className="w-full p-2.5 rounded-lg border border-slate-200 outline-blue-600 focus:border-blue-600 bg-slate-50 font-semibold cursor-pointer"
                  >
                    {listAllYears.map((yr) => (
                      <option key={yr} value={yr}>Tahun {yr}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Stats Preview */}
              {copySourceYear && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <p className="font-bold text-slate-700">Ringkasan Data yang Akan Disalin ({copySourceYear}):</p>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-100 flex flex-col">
                      <span className="text-slate-400 font-medium">Program</span>
                      <span className="text-base font-black text-slate-800 mt-0.5">{sourceStats.progs}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-100 flex flex-col">
                      <span className="text-slate-400 font-medium">Kegiatan</span>
                      <span className="text-base font-black text-slate-800 mt-0.5">{sourceStats.kegs}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-100 flex flex-col">
                      <span className="text-slate-400 font-medium">Sub-Kegiatan</span>
                      <span className="text-base font-black text-slate-800 mt-0.5">{sourceStats.subs}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-100 flex flex-col">
                      <span className="text-slate-400 font-medium">Detail RKA</span>
                      <span className="text-base font-black text-blue-800 mt-0.5">{sourceStats.rkas} items</span>
                    </div>
                  </div>

                  {sourceStats.progs === 0 && (
                    <p className="text-amber-900 font-medium text-[11px] leading-relaxed mt-3 p-3 bg-amber-50/70 rounded-lg border border-amber-200 shadow-3xs flex flex-col gap-2">
                      <span className="flex items-start gap-2">
                        <span className="shrink-0 text-amber-600 text-xs">⚠️</span>
                        <span>
                          <strong>Sistem Informasi:</strong> Tidak ditemukan data Master Program maupun RKA pada tahun sumber <strong>{copySourceYear}</strong>. Silakan gunakan tombol di bawah untuk membuat data sampel atau langsung klik tombol Tempel.
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsCopying(true);
                          try {
                            await doSeedSourceYear(copySourceYear);
                            alert(`Berhasil membuat Data Sampel Tahun ${copySourceYear}! Sekarang Anda dapat menyalin data tersebut.`);
                          } catch (err) {
                            alert("Gagal membuat data sampel: " + (err instanceof Error ? err.message : String(err)));
                          } finally {
                            setIsCopying(false);
                          }
                        }}
                        disabled={isCopying}
                        className="mt-1 self-start px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-[10px] uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
                      >
                        Inisialisasi Data Sampel {copySourceYear}
                      </button>
                    </p>
                  )}
                </div>
              )}
            </div>
 
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2 shrink-0">
              <button 
                type="button"
                onClick={() => setShowCopyModal(false)}
                disabled={isCopying}
                className="px-4 py-2 hover:bg-slate-200/85 text-slate-700 font-bold border rounded-lg bg-white transition cursor-pointer text-xs uppercase"
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={handleCloneYearData}
                disabled={isCopying}
                className="px-5 py-2 text-white font-bold rounded-lg bg-blue-700 hover:bg-blue-800 transition cursor-pointer text-xs uppercase shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCopying ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Menyalin...
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} />
                    Tempel ke {copyTargetYear}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
