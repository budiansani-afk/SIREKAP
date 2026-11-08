import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  X, 
  Monitor, 
  Smartphone, 
  Tablet, 
  Clock, 
  Globe, 
  PowerOff, 
  ShieldCheck, 
  Activity, 
  Search, 
  Filter, 
  AlertTriangle,
  RefreshCw,
  Crown,
  UserCheck
} from 'lucide-react';
import { SesiPenggunaOnline, UserRole } from '../types';
import { formatDuration, formatWaktuMasuk } from '../utils/deviceHelper';

interface OnlineSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SesiPenggunaOnline[];
  currentSessionId: string;
  currentUserRole: UserRole;
  currentUserEmail: string;
  onDisconnectSession: (sessionId: string, targetEmail: string, targetName: string) => Promise<void>;
}

export default function OnlineSessionsModal({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  currentUserRole,
  currentUserEmail,
  onDisconnectSession
}: OnlineSessionsModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // Ticking live duration timer every second
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Filter out expired or logged_out sessions
  const activeSessions = useMemo(() => {
    return sessions.filter(s => {
      if (s.status === 'force_disconnected' || s.status === 'logged_out') return false;
      // Allow sessions with activity in the last 60 seconds
      return (now - (s.last_active || 0)) < 60000;
    });
  }, [sessions, now]);

  // Filtered and searched sessions - Disusun berdasarkan waktu masuk
  const filteredSessions = useMemo(() => {
    const list = activeSessions.filter(s => {
      const matchRole = roleFilter === 'ALL' || s.role === roleFilter;
      const q = searchTerm.toLowerCase().trim();
      const matchSearch = !q || 
        s.email.toLowerCase().includes(q) ||
        (s.nama && s.nama.toLowerCase().includes(q)) ||
        (s.device && s.device.toLowerCase().includes(q)) ||
        (s.ip_address && s.ip_address.toLowerCase().includes(q));

      return matchRole && matchSearch;
    });

    // Susunan akun dalam daftar monitoring akun berdasarkan waktu masuk
    return [...list].sort((a, b) => {
      const timeA = a.login_at || 0;
      const timeB = b.login_at || 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [activeSessions, roleFilter, searchTerm, sortOrder]);

  // Statistics
  const adminCount = useMemo(() => activeSessions.filter(s => s.role === UserRole.ADMIN).length, [activeSessions]);
  const operatorCount = useMemo(() => activeSessions.filter(s => s.role === UserRole.OPERATOR).length, [activeSessions]);
  const pimpinanCount = useMemo(() => activeSessions.filter(s => s.role === UserRole.PIMPINAN).length, [activeSessions]);

  const handleDisconnect = async (session: SesiPenggunaOnline) => {
    if (session.id === currentSessionId) {
      alert("PERINGATAN: Anda tidak dapat memutuskan sesi Anda sendiri dari panel ini.");
      return;
    }

    const confirmMsg = `PUTUSKAN KONEKSI PENGGUNA:\n\n` +
      `Nama Pengguna: ${session.nama || session.email}\n` +
      `Perangkat: ${session.device}\n` +
      `Alamat IP: ${session.ip_address}\n` +
      `Waktu Masuk: ${formatWaktuMasuk(session.login_at)}\n\n` +
      `Apakah Anda yakin ingin memutuskan koneksi pengguna ini sekarang? Pengguna akan otomatis dikeluarkan dari aplikasi.`;

    if (!window.confirm(confirmMsg)) return;

    setDisconnectingId(session.id);
    try {
      await onDisconnectSession(session.id, session.email, session.nama);
    } catch (err: any) {
      alert("Gagal memutuskan koneksi: " + (err?.message || String(err)));
    } finally {
      setDisconnectingId(null);
    }
  };

  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType) {
      case 'mobile':
        return <Smartphone size={16} className="text-orange-600" />;
      case 'tablet':
        return <Tablet size={16} className="text-purple-600" />;
      case 'desktop':
      default:
        return <Monitor size={16} className="text-blue-600" />;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case UserRole.ADMIN:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
            <Crown size={10} />
            Administrator
          </span>
        );
      case UserRole.OPERATOR:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
            <UserCheck size={10} />
            Operator
          </span>
        );
      case UserRole.PIMPINAN:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1">
            <Crown size={10} />
            Pimpinan
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {role}
          </span>
        );
    }
  };

  // Hanya akun role administrator yang dapat melihat monitoring akun yang sedang masuk dan online
  if (!isOpen || currentUserRole !== UserRole.ADMIN) return null;

  const isAdmin = currentUserRole === UserRole.ADMIN;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-fade-in antialiased">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden transform transition-all">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 via-blue-800 to-orange-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Users size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm sm:text-base tracking-tight text-white uppercase">
                  Monitoring Akun Sedang Masuk & Online
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live ({activeSessions.length} Sesi)
                </span>
              </div>
              <p className="text-[11px] text-blue-100 font-medium">
                Pantau seluruh akun pengguna yang aktif di SIREKAP TANAH, detail perangkat, alamat IP, waktu masuk, dan lama durasi koneksi.
              </p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Tutup Modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 shrink-0 text-xs">
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Akun Online</p>
              <p className="text-xl font-black text-slate-900 font-mono mt-0.5">{activeSessions.length}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Activity size={18} className="animate-pulse" />
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Administrator</p>
              <p className="text-xl font-black text-purple-900 font-mono mt-0.5">{adminCount}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Crown size={16} />
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Operator</p>
              <p className="text-xl font-black text-blue-900 font-mono mt-0.5">{operatorCount}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <UserCheck size={16} />
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Pimpinan</p>
              <p className="text-xl font-black text-amber-900 font-mono mt-0.5">{pimpinanCount}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <ShieldCheck size={16} />
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input 
              type="text"
              placeholder="Cari nama, email, perangkat, atau IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg outline-blue-600 focus:bg-white bg-slate-50 text-slate-800 font-semibold"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end text-xs flex-wrap">
            <div className="flex items-center gap-1.5 text-slate-500 font-bold">
              <Clock size={14} className="text-blue-600" />
              <span>Urutkan:</span>
            </div>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
              className="py-1.5 px-2.5 border border-slate-200 rounded-lg outline-blue-600 bg-white font-bold text-slate-800 text-xs"
            >
              <option value="desc">Waktu Masuk: Terbaru ke Terlama</option>
              <option value="asc">Waktu Masuk: Terlama ke Terbaru</option>
            </select>

            <div className="flex items-center gap-1.5 text-slate-500 font-bold">
              <Filter size={14} />
              <span>Peran:</span>
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="py-1.5 px-3 border border-slate-200 rounded-lg outline-blue-600 bg-white font-bold text-slate-800 text-xs"
            >
              <option value="ALL">Semua Peran ({activeSessions.length})</option>
              <option value={UserRole.ADMIN}>Administrator ({adminCount})</option>
              <option value={UserRole.OPERATOR}>Operator ({operatorCount})</option>
              <option value={UserRole.PIMPINAN}>Pimpinan ({pimpinanCount})</option>
            </select>
          </div>
        </div>

        {/* Sessions List Content Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {filteredSessions.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
              <Users size={32} className="mx-auto text-slate-400" />
              <p className="text-sm font-bold text-slate-700">Tidak ada sesi yang sesuai dengan kriteria pencarian.</p>
              <p className="text-xs text-slate-400">Pastikan filter peran atau kata kunci pencarian Anda benar.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-3xs bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <th className="p-3 pl-4">Akun & Pengguna</th>
                    <th className="p-3">Perangkat / Device</th>
                    <th className="p-3">Alamat IP</th>
                    <th 
                      onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                      className="p-3 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                      title="Klik untuk membalikkan urutan waktu masuk"
                    >
                      <div className="flex items-center gap-1.5 text-blue-900 font-black">
                        <span>Waktu Masuk</span>
                        <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono font-bold">
                          {sortOrder === 'desc' ? 'Terbaru ↓' : 'Terlama ↑'}
                        </span>
                      </div>
                    </th>
                    <th className="p-3">Lama Durasi</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 pr-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {filteredSessions.map((session) => {
                    const isCurrent = session.id === currentSessionId;
                    const isDisconnecting = disconnectingId === session.id;
                    const isIdle = (now - (session.last_active || 0)) > 30000;

                    return (
                      <tr 
                        key={session.id} 
                        className={`hover:bg-blue-50/40 transition-colors ${isCurrent ? 'bg-blue-50/30' : ''}`}
                      >
                        {/* Akun */}
                        <td className="p-3 pl-4">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                              session.role === UserRole.ADMIN 
                                ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                                : session.role === UserRole.PIMPINAN 
                                ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                : 'bg-blue-100 text-blue-700 border border-blue-200'
                            }`}>
                              {(session.nama || session.email).substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 truncate">
                                  {session.nama || session.email}
                                </span>
                                {isCurrent && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    Sesi Ini
                                  </span>
                                )}
                              </div>
                              <div className="mt-1">
                                {getRoleBadge(session.role)}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Perangkat */}
                        <td className="p-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-bold text-slate-800">
                              {getDeviceIcon(session.device_type)}
                              <span>{session.os || 'Perangkat'}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium">
                              {session.browser || 'Browser'}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono truncate max-w-xs" title={session.device}>
                              {session.device}
                            </p>
                          </div>
                        </td>

                        {/* Alamat IP */}
                        <td className="p-3 font-mono">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 font-bold text-[11px]">
                            <Globe size={11} className="text-slate-500" />
                            {session.ip_address || '127.0.0.1'}
                          </span>
                        </td>

                        {/* Waktu Masuk */}
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                            <Clock size={13} className="text-slate-400 shrink-0" />
                            <span className="text-[11px] font-semibold">{formatWaktuMasuk(session.login_at)}</span>
                          </div>
                        </td>

                        {/* Lama Durasi Masuk (Live ticking) */}
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-900 font-mono font-bold text-[11px]">
                            <Activity size={12} className="text-blue-600 animate-pulse" />
                            {formatDuration(session.login_at, now)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="p-3">
                          {isIdle ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Idle
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                              Online
                            </span>
                          )}
                        </td>

                        {/* Aksi: Putuskan Koneksi */}
                        <td className="p-3 pr-4 text-right">
                          {isAdmin ? (
                            isCurrent ? (
                              <span className="text-[10px] text-slate-400 italic font-semibold">
                                Sesi Anda Sendiri
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleDisconnect(session)}
                                disabled={isDisconnecting}
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-bold rounded-lg shadow-3xs flex items-center gap-1.5 ml-auto text-[11px] transition cursor-pointer"
                                title="Putuskan koneksi akun ini secara paksa"
                              >
                                <PowerOff size={12} className={isDisconnecting ? 'animate-spin' : ''} />
                                {isDisconnecting ? "Memutuskan..." : "Putuskan Koneksi"}
                              </button>
                            )
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">Hanya Admin</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex items-center gap-2 text-slate-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Waktu Server: <b className="font-mono">{new Date(now).toLocaleTimeString('id-ID')} WITA</b></span>
            <span className="text-slate-300">|</span>
            <span>Durasi diperbarui secara otomatis setiap detik.</span>
          </div>

          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition shadow-3xs cursor-pointer text-xs"
          >
            Tutup Jendela
          </button>
        </div>

      </div>
    </div>
  );
}
