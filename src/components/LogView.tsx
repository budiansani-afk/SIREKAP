import React, { useState, useMemo } from 'react';
import { 
  ShieldAlert, 
  Search, 
  Calendar, 
  UserCheck, 
  Database,
  Eye,
  Info,
  Layers
} from 'lucide-react';
import { ActivityLog, Pengguna } from '../types';

export function resolveLogUserAndRole(
  log: ActivityLog,
  penggunas: Pengguna[] = []
): { nama: string; role: string } {
  const rawUser = (log.nama_pengguna || log.userEmail || '').trim();
  const rawRole = (log.role || log.userRole || '').trim();
  const clean = rawUser.toLowerCase();

  // 1. Try finding in penggunas list
  let found = penggunas.find(p => 
    (p.email && p.email.toLowerCase() === clean) ||
    (p.id && p.id.toLowerCase() === clean) ||
    (p.nama && p.nama.toLowerCase() === clean) ||
    ((p as any).username && (p as any).username.toLowerCase() === clean)
  );

  if (!found && clean.includes('@')) {
    const handle = clean.split('@')[0];
    found = penggunas.find(p => 
      (p.email && p.email.toLowerCase().includes(handle)) ||
      (p.id && p.id.toLowerCase().includes(handle))
    );
  }

  // 2. Resolve Role label
  let resolvedRole = found?.role || rawRole || 'Operator';
  const roleLower = String(resolvedRole).toLowerCase();
  let roleLabel = 'OPERATOR';
  if (roleLower.includes('admin')) {
    roleLabel = 'ADMINISTRATOR';
  } else if (roleLower.includes('pimpinan') || roleLower.includes('kabid') || roleLower.includes('kepala')) {
    roleLabel = 'PIMPINAN';
  } else if (roleLower.includes('operator')) {
    roleLabel = 'OPERATOR';
  } else if (roleLower) {
    roleLabel = roleLower.toUpperCase();
  }

  // 3. Resolve Nama Pengguna
  if (found?.nama && found.nama.trim()) {
    return { nama: found.nama.trim(), role: roleLabel };
  }

  // Known account presets
  if (clean === 'admin@sirekap.com' || clean === 'admin' || clean === 'administrator') {
    return { nama: 'Administrator SIREKAP Bima', role: 'ADMINISTRATOR' };
  }
  if (clean === 'budiansani@gmail.com' || clean === 'budiansani' || clean === 'budi') {
    return { nama: 'Drs. H. BUDIAN SANI, M.Si', role: 'PIMPINAN' };
  }
  if (clean === 'operator@sirekap.com' || clean === 'operator' || clean === 'operator1') {
    return { nama: 'Operator Teknis Pertanahan', role: 'OPERATOR' };
  }
  if (clean === 'pimpinan@sirekap.com' || clean === 'pimpinan' || clean === 'kabid') {
    return { nama: 'Kepala Bidang Pertanahan', role: 'PIMPINAN' };
  }

  // Check localStorage cache if available
  try {
    const cached = JSON.parse(localStorage.getItem('sibiru_user_names_cache') || '{}');
    if (cached[clean]) {
      return { nama: cached[clean], role: roleLabel };
    }
  } catch (e) {}

  // If already a human name (no @ and reasonable length)
  if (rawUser && !rawUser.includes('@') && rawUser.length > 3) {
    return { nama: rawUser, role: roleLabel };
  }

  if (clean.includes('@')) {
    const username = clean.split('@')[0];
    const capitalized = username.charAt(0).toUpperCase() + username.slice(1);
    if (roleLabel === 'ADMINISTRATOR') {
      return { nama: `Administrator (${capitalized})`, role: roleLabel };
    }
    return { nama: capitalized, role: roleLabel };
  }

  return { nama: rawUser || 'Aparatur Pertanahan', role: roleLabel };
}

function formatValue(key: string, val: any): string {
  if (val === null || val === undefined) return "Kosong";
  if (typeof val === 'boolean') return val ? 'Ya' : 'Tidak';
  if (typeof val === 'number') {
    const k = key.toLowerCase();
    if (k.includes('pagu') || k.includes('realisasi') || k.includes('nominal') || k.includes('jumlah') || k.includes('sisa') || k.includes('anggaran') || k.includes('nominal_')) {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
    }
    return String(val);
  }
  if (typeof val === 'string') {
    if (val.startsWith('data:image/') || val.startsWith('data:application/')) {
      return "[File Gambar / Base64 Data]";
    }
    if (val.startsWith('http://') || val.startsWith('https://')) {
      try {
        const urlObj = new URL(val);
        const pathname = urlObj.pathname;
        const parts = pathname.split('/');
        let filename = parts[parts.length - 1];
        filename = decodeURIComponent(filename);
        return filename || "File Foto / Tautan CDN";
      } catch (e) {
        const parts = val.split('/');
        return parts[parts.length - 1] || "File Foto";
      }
    }
    return val;
  }
  return typeof val === 'object' ? JSON.stringify(val) : String(val);
}

function renderLogDetails(log: ActivityLog) {
  if (log.oldData && log.newData) {
    try {
      const changes: string[] = [];
      const oldObj = log.oldData;
      const newObj = log.newData;
      const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
      
      const ignoredKeys = ['id', 'timestamp', 'waktu', 'data_rows_hash', 'ip_address', 'browser', 'nama_pengguna', 'role', 'password'];
      
      allKeys.forEach(k => {
        if (ignoredKeys.includes(k)) return;
        const oldVal = oldObj[k];
        const newVal = newObj[k];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          const label = k.replace(/_/g, ' ').toUpperCase();
          changes.push(`${label}: ${formatValue(k, oldVal)} ➜ ${formatValue(k, newVal)}`);
        }
      });
      
      if (changes.length > 0) {
        return (
          <ul className="list-disc pl-4 space-y-0.5 mt-1 text-[10px] text-slate-500 font-mono leading-relaxed">
            {changes.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        );
      }
    } catch (e) {
      console.warn("Error diffing audit log", e);
    }
  }

  const mainData = log.newData || log.oldData || log.details;
  if (mainData && typeof mainData === 'object') {
    try {
      const items: string[] = [];
      const ignoredKeys = ['id', 'timestamp', 'waktu', 'data_rows_hash', 'ip_address', 'browser', 'nama_pengguna', 'role', 'password'];
      
      Object.entries(mainData).forEach(([k, val]) => {
        if (ignoredKeys.includes(k)) return;
        if (val === null || val === undefined || val === '') return;
        const label = k.replace(/_/g, ' ').toUpperCase();
        items.push(`${label}: ${formatValue(k, val)}`);
      });

      if (items.length > 0) {
        return (
          <ul className="list-disc pl-4 space-y-0.5 mt-1 text-[10px] text-slate-500 font-mono leading-relaxed">
            {items.map((it, i) => <li key={i}>{it}</li>)}
          </ul>
        );
      }
    } catch (e) {
      // fallback
    }
  }

  return null;
}

interface LogViewProps {
  logs: ActivityLog[];
  penggunas?: Pengguna[];
}

export default function LogView({ logs, penggunas = [] }: LogViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  // Filter logic
  const filteredLogs = useMemo(() => {
    // Sort chronological: newest log item first
    const sorted = [...logs].sort((a,b) => b.timestamp - a.timestamp);

    return sorted.filter(l => {
      const { nama, role } = resolveLogUserAndRole(l, penggunas);
      const search = searchTerm.toLowerCase();
      const matchSearch = 
        nama.toLowerCase().includes(search) ||
        role.toLowerCase().includes(search) ||
        (l.nama_pengguna && l.nama_pengguna.toLowerCase().includes(search)) ||
        (l.userEmail && l.userEmail.toLowerCase().includes(search)) ||
        (l.action && l.action.toLowerCase().includes(search)) ||
        (l.aksi && l.aksi.toLowerCase().includes(search)) ||
        String(l.module || l.modul || '').toLowerCase().includes(search);
      const matchMod = selectedModule === '' || (l.module || l.modul) === selectedModule;

      return matchSearch && matchMod;
    });
  }, [logs, searchTerm, selectedModule, penggunas]);

  const uniqueModules = useMemo(() => {
    const mods = new Set<string>();
    logs.forEach(l => {
      if (l.module) mods.add(l.module);
    });
    return Array.from(mods);
  }, [logs]);

  return (
    <div className="space-y-6" id="logs-module-root">
      
      {/* Header */}
      <div className="flex items-center gap-1.5 p-4 bg-white rounded-xl border border-slate-100 shadow-sm" id="logs-title-card">
        <ShieldAlert className="text-rose-800 animate-pulse" size={22} />
        <div>
          <h2 className="text-xl font-bold text-slate-800">Log Aktivitas & Audit Forensik data</h2>
          <p className="text-xs text-slate-600">Catatan otomatis segala bentuk penambahan, perubahan data dpa, realisasi, dan restore database.</p>
        </div>
      </div>

      {/* Sorter / Search */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-3 text-xs" id="logs-filter-panel">
        <select 
          value={selectedModule} 
          onChange={(e) => setSelectedModule(e.target.value)} 
          className="p-2 border border-slate-200 rounded-lg bg-white max-w-xs focus:outline-blue-600 font-bold"
        >
          <option value="">Semua Modul Terkait</option>
          {uniqueModules.map((m, idx) => (
            <option key={idx} value={m}>{m}</option>
          ))}
        </select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text" 
            placeholder="Cari nama pengguna atau aksi..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full p-2 pl-8 border border-slate-200 rounded-lg focus:outline-blue-600"
          />
        </div>
      </div>

      {/* Logs Table timeline */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden" id="logs-table">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
                <th className="p-3.5 pl-4 w-44 align-top text-left">Waktu Kejadian (UTC)</th>
                <th className="p-3.5 w-56 align-top text-left">Nama Pengguna / Peran</th>
                <th className="p-3.5 align-top text-left">Dokumentasi Aksi / Kegiatan</th>
                <th className="p-3.5 w-32 align-top text-left">Modul</th>
                <th className="p-3.5 text-center w-24 align-top">Inspeksi Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 font-semibold align-top text-left">Tidak ditemukan aktivitas dalam sistem log audit.</td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => {
                  const dateStr = new Date(log.timestamp).toLocaleString('id-ID');
                  const { nama: userNama, role: userRole } = resolveLogUserAndRole(log, penggunas);
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 transition">
                      <td className="p-3.5 pl-4 font-mono text-[10px] text-slate-500 align-top text-left">
                        <div className="flex items-start gap-1.5 pt-0.5">
                          <Calendar size={12} className="text-blue-850 shrink-0 mt-0.5" />
                          <span>{dateStr}</span>
                        </div>
                      </td>
                      <td className="p-3.5 align-top text-left">
                        <div className="flex items-start gap-1.5">
                          <UserCheck size={13} className="text-blue-600 shrink-0 mt-0.5" />
                          <p className="font-bold text-slate-900 leading-snug" title={userNama}>
                            {userNama}
                          </p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-black tracking-wider uppercase mt-1.5 inline-block border ${
                          userRole === 'ADMINISTRATOR' 
                            ? 'bg-blue-50 text-blue-800 border-blue-200' 
                            : userRole === 'PIMPINAN' 
                            ? 'bg-purple-50 text-purple-800 border-purple-200' 
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}>
                          {userRole}
                        </span>
                      </td>
                      <td className="p-3.5 max-w-sm break-words whitespace-normal leading-relaxed align-top text-left">
                        <p className="font-bold text-slate-950 uppercase text-[11px] font-black tracking-wide break-words whitespace-normal">{log.action}</p>
                        {renderLogDetails(log)}
                      </td>
                      <td className="p-3.5 align-top text-left">
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-blue-50 text-blue-900 rounded font-bold border border-blue-100 text-[10px]">
                          <Layers size={10} />
                          {log.module || 'SYSTEM'}
                        </span>
                      </td>
                      <td className="p-3.5 text-center align-top">
                        <button 
                          onClick={() => setSelectedLog(log)}
                          className="px-2 py-1 bg-white hover:bg-slate-100 border text-slate-700 rounded-lg transition"
                          title="View Data Objects"
                        >
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Log details modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="logs-details-overlay">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden" id="logs-details-modal">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-1.5 text-sm">
                <Info size={16} />
                Detail Entri Audit Logging
              </h3>
              <button onClick={() => setSelectedLog(null)} className="text-white hover:text-white/80 font-bold text-lg">&times;</button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              <div>
                <p className="text-slate-500 font-bold">Waktu Transaksi:</p>
                <p className="font-bold text-slate-800">{new Date(selectedLog.timestamp).toISOString()}</p>
              </div>

              <div>
                <p className="text-slate-500 font-bold">Dilakukan Oleh:</p>
                <p className="font-bold text-slate-950">
                  {resolveLogUserAndRole(selectedLog, penggunas).nama} ({resolveLogUserAndRole(selectedLog, penggunas).role})
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border">
                <div>
                  <p className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Data Sebelum Perubahan (Old):</p>
                  <pre className="font-mono text-[9px] text-rose-800 bg-white p-2 border rounded-md mt-1 overflow-x-auto max-h-36">
                    {selectedLog.oldData ? JSON.stringify(selectedLog.oldData, null, 2) : 'NULL (NIL)'}
                  </pre>
                </div>

                <div>
                  <p className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Data Setelah Perubahan (New):</p>
                  <pre className="font-mono text-[9px] text-emerald-800 bg-white p-2 border rounded-md mt-1 overflow-x-auto max-h-36">
                    {selectedLog.newData ? JSON.stringify(selectedLog.newData, null, 2) : 'NULL (NIL)'}
                  </pre>
                </div>
              </div>

              <div className="pt-2 text-right">
                <button 
                  type="button" 
                  onClick={() => setSelectedLog(null)} 
                  className="px-4 py-2 font-bold text-white bg-slate-900 hover:bg-black rounded-lg"
                >
                  Tutup Rincian
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
