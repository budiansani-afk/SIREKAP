// Web Notifications API Utility for SIREKAP TANAH
import { formatRupiah } from './helpers';
import { RKA, Realisasi } from '../types';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    console.warn('Web Notifications API tidak didukung pada browser ini.');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      sendWebNotification('Notifikasi SIREKAP Aktif', {
        body: 'Peringatan real-time perubahan anggaran RKA & SP2D realisasi belanja berhasil diaktifkan.',
        icon: '/logo_kab_bima.png',
        tag: 'sirekap-welcome'
      });
    }
    return permission;
  } catch (err) {
    console.error('Gagal meminta izin notifikasi:', err);
    return 'denied';
  }
}

export function sendWebNotification(title: string, options?: NotificationOptions): Notification | null {
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const notifOptions: NotificationOptions = {
      icon: '/logo_kab_bima.png',
      badge: '/logo_kab_bima.png',
      silent: false,
      ...options
    };

    const notif = new Notification(title, notifOptions);

    // Auto close after 7 seconds
    setTimeout(() => {
      try {
        notif.close();
      } catch (e) {
        // ignore
      }
    }, 7000);

    // Click handler to bring window to focus
    notif.onclick = () => {
      try {
        window.focus();
        notif.close();
      } catch (e) {
        // ignore
      }
    };

    return notif;
  } catch (err) {
    console.warn('Gagal menampilkan Web Notification:', err);
    return null;
  }
}

export function notifyRkaChange(type: 'added' | 'modified' | 'removed', rka: RKA) {
  if (type === 'added') {
    sendWebNotification('RKA Anggaran: Rincian Baru', {
      body: `Penambahan rincian belanja: ${rka.uraian_belanja || 'RKA Baru'} (${formatRupiah(rka.jumlah || 0)}).`,
      icon: '/logo_kab_bima.png',
      tag: `rka-${rka.id}`
    });
  } else if (type === 'modified') {
    sendWebNotification('RKA Anggaran: Perubahan Alokasi', {
      body: `Pembaruan RKA: ${rka.uraian_belanja || 'RKA'} (${formatRupiah(rka.jumlah || 0)}).`,
      icon: '/logo_kab_bima.png',
      tag: `rka-${rka.id}`
    });
  } else if (type === 'removed') {
    sendWebNotification('RKA Anggaran: Penghapusan Data', {
      body: `Rincian RKA ${rka.uraian_belanja || ''} telah dihapus dari sistem.`,
      icon: '/logo_kab_bima.png',
      tag: `rka-${rka.id}`
    });
  }
}

export function notifyRealisasiChange(type: 'added' | 'modified' | 'removed', realisasi: Realisasi) {
  if (type === 'added') {
    sendWebNotification('Realisasi SP2D: Pencairan Baru', {
      body: `Pencairan SP2D: ${realisasi.uraian_belanja || 'SP2D'} (${formatRupiah(realisasi.nominal_realisasi || 0)}) pada bulan ${realisasi.bulan || '-'}.`,
      icon: '/logo_kab_bima.png',
      tag: `real-${realisasi.id}`
    });
  } else if (type === 'modified') {
    sendWebNotification('Realisasi SP2D: Pembaruan Data', {
      body: `Data realisasi ${realisasi.uraian_belanja || 'SP2D'} diperbarui: ${formatRupiah(realisasi.nominal_realisasi || 0)}.`,
      icon: '/logo_kab_bima.png',
      tag: `real-${realisasi.id}`
    });
  } else if (type === 'removed') {
    sendWebNotification('Realisasi SP2D: Pembatalan Transaksi', {
      body: `Transaksi SP2D ${realisasi.uraian_belanja || ''} telah dihapus dari pembukuan kas.`,
      icon: '/logo_kab_bima.png',
      tag: `real-${realisasi.id}`
    });
  }
}
