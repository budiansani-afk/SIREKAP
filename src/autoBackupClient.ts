export const LS_AUTO_BACKUP_DATA_KEY = "sirekap_auto_backup_latest";
export const LS_AUTO_BACKUP_META_KEY = "sirekap_auto_backup_meta";
export const LS_AUTO_BACKUP_SYNC_KEY = "sirekap_backup_sync_key";
export const AUTO_BACKUP_SYNC_EVENT = "sirekap:autobackup-synced";

export interface AutoBackupPublicStatus {
  enabled: boolean;
  daysOfWeek: number[];
  timeOfDay: string;
  timezone: string;
  lastRunAt: string | null;
  lastRunSlot: string | null;
  lastStatus: "idle" | "running" | "success" | "error";
  lastError: string | null;
  lastTotalRecords: number;
  lastSizeBytes: number;
  hasLatestSnapshot: boolean;
  hasCredentials: boolean;
  updatedAt: string | null;
}

export interface LocalBackupMeta {
  exportedAt: string;
  syncedAt: string;
  source: string;
  totalRecords: number;
  sizeBytes: number;
  lastRunSlot?: string | null;
}

export function readLocalBackupMeta(): LocalBackupMeta | null {
  try {
    const raw = localStorage.getItem(LS_AUTO_BACKUP_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalBackupMeta;
  } catch {
    return null;
  }
}

export function readLocalBackupRawJson(): string | null {
  try {
    return localStorage.getItem(LS_AUTO_BACKUP_DATA_KEY);
  } catch {
    return null;
  }
}

export function saveBackupSnapshotToLocalStorage(
  backupData: Record<string, any[]>,
  info: {
    exportedAt: string;
    source: string;
    totalRecords?: number;
    lastRunSlot?: string | null;
  }
): { ok: boolean; error?: string; meta?: LocalBackupMeta } {
  try {
    const jsonStr = JSON.stringify(backupData);
    const sizeBytes = new Blob([jsonStr]).size;
    const totalRecords =
      typeof info.totalRecords === "number"
        ? info.totalRecords
        : Object.values(backupData).reduce(
            (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
            0
          );

    const meta: LocalBackupMeta = {
      exportedAt: info.exportedAt,
      syncedAt: new Date().toISOString(),
      source: info.source,
      totalRecords,
      sizeBytes,
      lastRunSlot: info.lastRunSlot || null
    };

    // Selalu timpa key utama agar selalu menyimpan versi snapshot terbaru
    localStorage.setItem(LS_AUTO_BACKUP_DATA_KEY, jsonStr);
    localStorage.setItem(LS_AUTO_BACKUP_META_KEY, JSON.stringify(meta));

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTO_BACKUP_SYNC_EVENT, { detail: meta }));
    }

    return { ok: true, meta };
  } catch (err: any) {
    const isQuota =
      err?.name === "QuotaExceededError" ||
      String(err?.message || "").toLowerCase().includes("quota");
    return {
      ok: false,
      error: isQuota
        ? "Kapasitas localStorage browser penuh (~5 MB) untuk menampung seluruh JSON backup."
        : err?.message || "Gagal menyimpan JSON backup ke localStorage."
    };
  }
}

export async function fetchAutoBackupStatus(): Promise<AutoBackupPublicStatus> {
  const res = await fetch("/api/backup/status", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Gagal memuat status backup otomatis (${res.status})`);
  }
  return res.json();
}

export async function saveAutoBackupSchedule(
  idToken: string,
  payload: {
    enabled: boolean;
    daysOfWeek: number[];
    timeOfDay: string;
    timezone?: string;
    refreshToken?: string;
  }
): Promise<{ status: AutoBackupPublicStatus; syncKey: string }> {
  const res = await fetch("/api/backup/config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Gagal menyimpan jadwal backup (${res.status})`);
  }
  if (data.syncKey) {
    try {
      localStorage.setItem(LS_AUTO_BACKUP_SYNC_KEY, data.syncKey);
    } catch {}
  }
  return data;
}

export async function triggerServerAutoBackupNow(idToken: string): Promise<{
  status: AutoBackupPublicStatus;
  snapshot: {
    exportedAt: string;
    source: string;
    totalRecords: number;
    sizeBytes: number;
    data: Record<string, any[]>;
  };
}> {
  const res = await fetch("/api/backup/run-now", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Gagal menjalankan backup otomatis (${res.status})`);
  }
  if (data.syncKey) {
    try {
      localStorage.setItem(LS_AUTO_BACKUP_SYNC_KEY, data.syncKey);
    } catch {}
  }
  if (data.snapshot?.data) {
    saveBackupSnapshotToLocalStorage(data.snapshot.data, {
      exportedAt: data.snapshot.exportedAt,
      source: data.snapshot.source || "manual_trigger",
      totalRecords: data.snapshot.totalRecords,
      lastRunSlot: data.status?.lastRunSlot || null
    });
  }
  return data;
}

export async function syncLatestBackupToLocalStorage(options?: {
  idToken?: string;
  force?: boolean;
}): Promise<{ synced: boolean; reason?: string; meta?: LocalBackupMeta; status?: AutoBackupPublicStatus }> {
  const syncKey = localStorage.getItem(LS_AUTO_BACKUP_SYNC_KEY) || "";
  if (!syncKey && !options?.idToken) {
    return { synced: false, reason: "no_credentials" };
  }

  const status = await fetchAutoBackupStatus();
  if (!status.hasLatestSnapshot || !status.lastRunAt) {
    return { synced: false, reason: "no_server_snapshot", status };
  }

  const localMeta = readLocalBackupMeta();
  const hasLocalData = Boolean(readLocalBackupRawJson());

  if (
    !options?.force &&
    hasLocalData &&
    localMeta?.exportedAt &&
    new Date(localMeta.exportedAt).getTime() >= new Date(status.lastRunAt).getTime()
  ) {
    return { synced: false, reason: "already_up_to_date", meta: localMeta, status };
  }

  const headers: Record<string, string> = {};
  if (options?.idToken) {
    headers["Authorization"] = `Bearer ${options.idToken}`;
  }
  if (syncKey) {
    headers["X-Backup-Sync-Key"] = syncKey;
  }

  const latestRes = await fetch("/api/backup/latest", { headers, cache: "no-store" });
  if (!latestRes.ok) {
    const errBody = await latestRes.json().catch(() => ({}));
    return {
      synced: false,
      reason: errBody?.error || `http_${latestRes.status}`,
      status
    };
  }

  const snapshot = await latestRes.json();
  if (!snapshot?.data) {
    return { synced: false, reason: "empty_payload", status };
  }

  const saved = saveBackupSnapshotToLocalStorage(snapshot.data, {
    exportedAt: snapshot.exportedAt || status.lastRunAt,
    source: snapshot.source || "auto_scheduler",
    totalRecords: snapshot.totalRecords,
    lastRunSlot: status.lastRunSlot
  });

  if (!saved.ok) {
    return { synced: false, reason: saved.error, status };
  }

  return { synced: true, meta: saved.meta, status };
}

export function downloadLocalStorageBackupFile(): boolean {
  const raw = readLocalBackupRawJson();
  if (!raw) return false;
  const meta = readLocalBackupMeta();
  const datePart = (meta?.exportedAt || new Date().toISOString()).substring(0, 10);
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `SIREKAP_TANAH_AutoBackup_LocalStorage_${datePart}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}
