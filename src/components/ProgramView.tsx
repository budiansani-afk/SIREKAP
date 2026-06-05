import React, { useState, useMemo } from 'react';
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
  Briefcase
} from 'lucide-react';
import { Program, Kegiatan, SubKegiatan, UserRole } from '../types';
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
  createAuditLog, 
  synchronizeCalculations 
} from '../dbService';

interface ProgramViewProps {
  programs: Program[];
  kegiatans: Kegiatan[];
  subKegiatans: SubKegiatan[];
  currentUserRole: UserRole;
  currentUserEmail: string;
}

type ActiveTabType = 'program' | 'kegiatan' | 'sub_kegiatan';

export default function ProgramView({
  programs,
  kegiatans,
  subKegiatans,
  currentUserRole,
  currentUserEmail
}: ProgramViewProps) {
  const [activeTab, setActiveTab] = useState<ActiveTabType>('program');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProgramFilter, setSelectedProgramFilter] = useState('');
  
  // Modal controllers
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);

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
    if (!formKode.trim() || !formNama.trim()) {
      alert("Kode dan Nama wajib diisi.");
      return;
    }

    try {
      const docId = formKode.trim();
      let collectionName = '';
      let logModule = '';
      let payload: any = {};

      if (activeTab === 'program') {
        collectionName = COLL_PROGRAM;
        logModule = "PROGRAM";
        payload = {
          id: docId,
          kode_program: docId,
          nama_program: formNama.trim(),
          pagu: editItem ? editItem.pagu : formManualPagu,
          realisasi: editItem ? editItem.realisasi : 0,
          sisa: editItem ? editItem.sisa : formManualPagu,
          persentase: editItem ? editItem.persentase : 0
        };
      } else if (activeTab === 'kegiatan') {
        collectionName = COLL_KEGIATAN;
        logModule = "KEGIATAN";
        if (!formParentProgram) {
          alert("Harap pilih Program Atasan.");
          return;
        }
        payload = {
          id: docId,
          kode_kegiatan: docId,
          nama_kegiatan: formNama.trim(),
          kode_program: formParentProgram,
          pagu: editItem ? editItem.pagu : formManualPagu,
          realisasi: editItem ? editItem.realisasi : 0,
          sisa: editItem ? editItem.sisa : formManualPagu,
          persentase: editItem ? editItem.persentase : 0
        };
      } else {
        collectionName = COLL_SUB_KEGIATAN;
        logModule = "SUB_KEGIATAN";
        if (!formParentProgram || !formParentKegiatan) {
          alert("Harap lengkapi Program dan Kegiatan Atasan.");
          return;
        }
        payload = {
          id: docId,
          kode_sub_kegiatan: docId,
          nama_sub_kegiatan: formNama.trim(),
          kode_program: formParentProgram,
          kode_kegiatan: formParentKegiatan,
          pagu: editItem ? editItem.pagu : formManualPagu,
          realisasi: editItem ? editItem.realisasi : 0,
          sisa: editItem ? editItem.sisa : formManualPagu,
          persentase: editItem ? editItem.persentase : 0
        };
      }

      const docRef = doc(db, collectionName, docId);
      await setDoc(docRef, payload).catch(err => handleFirestoreError(err, OperationType.WRITE, `${collectionName}/${docId}`));

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
      exportToCSV(filteredPrograms, exportHeaders, `Daftar_Program_SIBIRU`);
    } else if (activeTab === 'kegiatan') {
      const exportHeaders = ['kode_kegiatan', 'nama_kegiatan', 'kode_program', 'pagu', 'realisasi', 'sisa', 'persentase'];
      exportToCSV(filteredKegiatans, exportHeaders, `Daftar_Kegiatan_SIBIRU`);
    } else {
      const exportHeaders = ['kode_sub_kegiatan', 'nama_sub_kegiatan', 'kode_program', 'kode_kegiatan', 'pagu', 'realisasi', 'sisa', 'persentase'];
      exportToCSV(filteredSubKegiatans, exportHeaders, `Daftar_Sub_Kegiatan_SIBIRU`);
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
          <p className="text-xs text-slate-500 mt-1">Kelola master program dinas, kode kegiatan DPA, dan sub kegiatan teknis pendukung.</p>
        </div>
        <div className="flex gap-2 shrink-0">
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
                      <td className="p-3.5 font-medium">{p.nama_program}</td>
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
                      <td className="p-3.5 font-medium">{k.nama_kegiatan}</td>
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
                      <td className="p-3.5 font-medium">{s.nama_sub_kegiatan}</td>
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
                    disabled={editItem !== null}
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
                    disabled={editItem !== null}
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
                  disabled={editItem !== null}
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
    </div>
  );
}
