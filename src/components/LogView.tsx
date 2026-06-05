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
import { ActivityLog } from '../types';

interface LogViewProps {
  logs: ActivityLog[];
}

export default function LogView({ logs }: LogViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  // Filter logic
  const filteredLogs = useMemo(() => {
    // Sort chronological: newest log item first
    const sorted = [...logs].sort((a,b) => b.timestamp - a.timestamp);

    return sorted.filter(l => {
      const matchSearch = l.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          String(l.module || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchMod = selectedModule === '' || l.module === selectedModule;

      return matchSearch && matchMod;
    });
  }, [logs, searchTerm, selectedModule]);

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
            placeholder="Cari email operator atau aksi..." 
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
                <th className="p-3.5 pl-4 w-44">Waktu Kejadian (UTC)</th>
                <th className="p-3.5 w-48">Pengguna / Role</th>
                <th className="p-3.5">Dokumentasi Aksi / Kegiatan</th>
                <th className="p-3.5 w-32">Modul</th>
                <th className="p-3.5 text-center w-24">Inspeksi Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 font-semibold">Tidak ditemukan aktivitas dalam sistem log audit.</td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => {
                  const dateStr = new Date(log.timestamp).toLocaleString('id-ID');
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 transition">
                      <td className="p-3.5 pl-4 font-mono text-[10px] text-slate-500 flex items-center gap-1.5">
                        <Calendar size={12} className="text-blue-850" />
                        {dateStr}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-1">
                          <UserCheck size={12} className="text-blue-600" />
                          <p className="font-bold text-slate-900 truncate max-w-[150px]" title={log.userEmail}>{log.userEmail}</p>
                        </div>
                        <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 uppercase tracking-widest font-extrabold">{log.userRole}</span>
                      </td>
                      <td className="p-3.5">
                        <p className="font-bold text-slate-950 uppercase text-[11px] font-black tracking-wide">{log.action}</p>
                        {log.details && (
                          <span className="text-[10px] text-slate-500 truncate block mt-0.5 max-w-sm" title={JSON.stringify(log.details)}>
                            Detail: {JSON.stringify(log.details)}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-blue-50 text-blue-900 rounded font-bold border border-blue-100 text-[10px]">
                          <Layers size={10} />
                          {log.module || 'SYSTEM'}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button 
                          onClick={() => setSelectedLog(log)}
                          className="px-2 py-1 bg-white hover:bg-slate-100 border text-slate-700 rounded-lg transition"
                          title="View Data Objects"
                        >
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                  )
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
                <p className="font-bold text-slate-950">{selectedLog.userEmail} ({selectedLog.userRole})</p>
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
