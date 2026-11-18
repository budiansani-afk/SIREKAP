import firebaseConfig from "../firebase-applet-config.json";
import { auth } from "./firebase";
import { BACKUP_COLLECTIONS, backupDatabaseToJSON } from "./dbService";
import { BackupScheduleConfig } from "./types";

export const LS_AUTO_BACKUP_DATA_KEY = "sirekap_auto_backup_latest";
export const LS_AUTO_BACKUP_META_KEY = "sirekap_auto_backup_meta";
export const LS_AUTO_BACKUP_SYNC_KEY = "sirekap_backup_sync_key";
export const LS_AUTO_BACKUP_CLIENT_CFG_KEY = "sirekap_auto_backup_client_cfg";
export const AUTO_BACKUP_SYNC_EVENT = "sirekap:autobackup-synced";

export interface AutoBackupPublicStatus {
  enabled: boolean;
  daysOfWeek: number[];
  hour: number;
  minute: number;
  timeOfDay: string;
  timezone: string;
  autoDownload: boolean;
  lastRunAt: string | null;
  lastRunSlot: string | null;
  lastStatus: "idle" | "running" | "success" | "error";
  lastError: string | null;
  lastTotalRecords: number;
  lastSizeBytes: number;
  hasLatestSnapshot: boolean;
  hasCredentials: boolean;
  updatedAt: string | null;
  executionMode?: "server_hybrid" | "browser_standalone";
}

export interface LocalBackupMeta {
  exportedAt: string;
  syncedAt: string;
  source: string;
  totalRecords: number;
  sizeBytes: number;
  lastRunSlot?: string | null;
}

interface ClientBackupConfig extends AutoBackupPublicStatus {
  refreshToken?: string;
  lastAutoDownloadedSlot?: string | null;
}

let cachedBackendAvailable: boolean | null = null;
let clientBackupInFlight: Promise<any> | null = null;

function isBackendKnownUnavailable(): boolean {
  if (cachedBackendAvailable === false) return true;
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith(".web.app") || host.endsWith(".firebaseapp.com")) {
      cachedBackendAvailable = false;
      return true;
    }
  }
  try {
    if (sessionStorage.getItem("sirekap_backend_api") === "unavailable") {
      cachedBackendAvailable = false;
      return true;
    }
  } catch {}
  return false;
}

function markBackendAvailability(available: boolean) {
  cachedBackendAvailable = available;
  try {
    sessionStorage.setItem("sirekap_backend_api", available ? "available" : "unavailable");
  } catch {}
}

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json");
}

function readClientBackupConfig(): ClientBackupConfig {
  const localMeta = readLocalBackupMeta();
  const hasLocalData = Boolean(readLocalBackupRawJson());
  const defaults: ClientBackupConfig = {
    enabled: false,
    daysOfWeek: [1, 2, 3, 4, 5],
    hour: 23,
    minute: 0,
    timeOfDay: "23:00",
    timezone: "Asia/Makassar",
    autoDownload: false,
    lastRunAt: localMeta?.exportedAt || null,
    lastRunSlot: localMeta?.lastRunSlot || null,
    lastStatus: localMeta ? "success" : "idle",
    lastError: null,
    lastTotalRecords: localMeta?.totalRecords || 0,
    lastSizeBytes: localMeta?.sizeBytes || 0,
    hasLatestSnapshot: hasLocalData,
    hasCredentials: false,
    updatedAt: null,
    lastAutoDownloadedSlot: null,
    executionMode: "browser_standalone"
  };

  try {
    const raw = localStorage.getItem(LS_AUTO_BACKUP_CLIENT_CFG_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const timeMatch = typeof parsed.timeOfDay === "string" ? /^(\d{2}):(\d{2})$/.exec(parsed.timeOfDay.trim()) : null;
    const hour = parsed.hour !== undefined && parsed.hour !== null && Number.isInteger(Number(parsed.hour))
      ? Math.min(23, Math.max(0, Number(parsed.hour)))
      : (timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : 23);
    const minute = parsed.minute !== undefined && parsed.minute !== null && Number.isInteger(Number(parsed.minute))
      ? Math.min(59, Math.max(0, Number(parsed.minute)))
      : (timeMatch ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 0);
    return {
      ...defaults,
      ...parsed,
      hour,
      minute,
      timeOfDay: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      autoDownload: Boolean(parsed.autoDownload),
      hasLatestSnapshot: hasLocalData || Boolean(parsed.hasLatestSnapshot),
      hasCredentials: Boolean(parsed.refreshToken),
      executionMode: "browser_standalone"
    };
  } catch {
    return defaults;
  }
}

function writeClientBackupConfig(cfg: Partial<ClientBackupConfig>): ClientBackupConfig {
  const current = readClientBackupConfig();
  const next: ClientBackupConfig = {
    ...current,
    ...cfg,
    hasCredentials: Boolean(cfg.refreshToken ?? current.refreshToken),
    executionMode: "browser_standalone"
  };
  try {
    localStorage.setItem(LS_AUTO_BACKUP_CLIENT_CFG_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function syncClientBackupConfigFromRemote(remote: Partial<BackupScheduleConfig> | null | undefined) {
  if (!remote || typeof remote.enabled !== "boolean") return;
  const current = readClientBackupConfig();
  const remoteUpdated = remote.updatedAt ? new Date(String(remote.updatedAt)).getTime() : 0;
  const localUpdated = current.updatedAt ? new Date(String(current.updatedAt)).getTime() : 0;
  if (remoteUpdated < localUpdated) return;

  const timeMatch = typeof remote.timeOfDay === "string" ? /^(\d{2}):(\d{2})$/.exec(remote.timeOfDay.trim()) : null;
  const hour = remote.hour !== undefined && remote.hour !== null && Number.isInteger(Number(remote.hour))
    ? Math.min(23, Math.max(0, Number(remote.hour)))
    : (timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : current.hour);
  const minute = remote.minute !== undefined && remote.minute !== null && Number.isInteger(Number(remote.minute))
    ? Math.min(59, Math.max(0, Number(remote.minute)))
    : (timeMatch ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : current.minute);
  const days = Array.isArray(remote.daysOfWeek)
    ? remote.daysOfWeek.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : current.daysOfWeek;

  writeClientBackupConfig({
    enabled: Boolean(remote.enabled),
    daysOfWeek: days,
    hour,
    minute,
    timeOfDay: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    timezone: typeof remote.timezone === "string" && remote.timezone.trim() ? remote.timezone.trim() : current.timezone,
    autoDownload: typeof remote.autoDownload === "boolean" ? remote.autoDownload : current.autoDownload,
    updatedAt: remote.updatedAt || current.updatedAt
  });
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

export function downloadDatabaseJsonFile(
  backupDataOrRaw: Record<string, any[]> | string,
  options?: { tahunAnggaran?: number; exportedAt?: string }
): boolean {
  try {
    let dataStr: string;
    if (typeof backupDataOrRaw === "string") {
      try {
        dataStr = JSON.stringify(JSON.parse(backupDataOrRaw), null, 2);
      } catch {
        dataStr = backupDataOrRaw;
      }
    } else {
      dataStr = JSON.stringify(backupDataOrRaw, null, 2);
    }

    const tahun = options?.tahunAnggaran || 2026;
    const datePart = (options?.exportedAt || new Date().toISOString()).substring(0, 10);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SIREKAP_TANAH_BackUp_Database_TA${tahun}_${datePart}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
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
  const totalRecords =
    typeof info.totalRecords === "number"
      ? info.totalRecords
      : Object.values(backupData).reduce(
          (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
          0
        );

  const tryPersist = (jsonStr: string): { ok: boolean; error?: string; meta?: LocalBackupMeta } => {
    const sizeBytes = new Blob([jsonStr]).size;
    const meta: LocalBackupMeta = {
      exportedAt: info.exportedAt,
      syncedAt: new Date().toISOString(),
      source: info.source,
      totalRecords,
      sizeBytes,
      lastRunSlot: info.lastRunSlot || null
    };
    localStorage.setItem(LS_AUTO_BACKUP_DATA_KEY, jsonStr);
    localStorage.setItem(LS_AUTO_BACKUP_META_KEY, JSON.stringify(meta));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTO_BACKUP_SYNC_EVENT, { detail: meta }));
    }
    return { ok: true, meta };
  };

  try {
    // Format JSON identik (pretty-printed) dengan tombol "Ekspor Semua Basis Data (JSON)"
    return tryPersist(JSON.stringify(backupData, null, 2));
  } catch (err: any) {
    const isQuota =
      err?.name === "QuotaExceededError" ||
      String(err?.message || "").toLowerCase().includes("quota");
    if (isQuota) {
      try {
        // Fallback ke format kompak bila kuota localStorage ketat
        return tryPersist(JSON.stringify(backupData));
      } catch {}
    }
    return {
      ok: false,
      error: isQuota
        ? "Kapasitas localStorage browser penuh (~5 MB) untuk menampung seluruh JSON backup."
        : err?.message || "Gagal menyimpan JSON backup ke localStorage."
    };
  }
}

// ==================== FIRESTORE REST HELPERS (STATIC HOSTING AUTONOMOUS MODE) ====================
function decodeFirestoreValue(val: any): any {
  if (!val || typeof val !== "object") return undefined;
  if ("nullValue" in val) return null;
  if ("booleanValue" in val) return Boolean(val.booleanValue);
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("timestampValue" in val) return val.timestampValue;
  if ("stringValue" in val) return String(val.stringValue);
  if ("bytesValue" in val) return val.bytesValue;
  if ("referenceValue" in val) return val.referenceValue;
  if ("geoPointValue" in val) return val.geoPointValue;
  if ("arrayValue" in val) {
    const values = val.arrayValue?.values;
    return Array.isArray(values) ? values.map(decodeFirestoreValue) : [];
  }
  if ("mapValue" in val) {
    return decodeFirestoreFields(val.mapValue?.fields || {});
  }
  return undefined;
}

function decodeFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  if (!fields) return out;
  for (const [key, value] of Object.entries(fields)) {
    out[key] = decodeFirestoreValue(value);
  }
  return out;
}

async function exchangeRefreshTokenBrowser(refreshToken: string): Promise<{ idToken: string; refreshToken: string }> {
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${firebaseConfig.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id_token) {
    throw new Error(data?.error?.message || "Gagal memperbarui sesi autentikasi backup otomatis.");
  }
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token || refreshToken
  };
}

async function fetchCollectionViaRestBrowser(collName: string, idToken: string): Promise<any[]> {
  const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${encodeURIComponent(dbId)}/documents/${encodeURIComponent(collName)}`;
  const items: any[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const url = pageToken
      ? `${baseUrl}?pageSize=500&pageToken=${encodeURIComponent(pageToken)}`
      : `${baseUrl}?pageSize=500`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    if (!res.ok) {
      throw new Error(`Gagal membaca koleksi ${collName} (${res.status})`);
    }
    const json: any = await res.json();
    const docs = Array.isArray(json.documents) ? json.documents : [];
    for (const docItem of docs) {
      const docId = String(docItem.name || "").split("/").pop() || "";
      items.push({
        id: docId,
        ...decodeFirestoreFields(docItem.fields || {})
      });
    }
    pageToken = json.nextPageToken || undefined;
  } while (pageToken);

  return items;
}

async function runBrowserAutonomousBackup(options?: {
  idToken?: string;
  slotKey?: string;
  source?: string;
  autoDownload?: boolean;
  tahunAnggaran?: number;
}) {
  if (clientBackupInFlight) return clientBackupInFlight;

  clientBackupInFlight = (async () => {
    const cfg = readClientBackupConfig();
    writeClientBackupConfig({ lastStatus: "running", lastError: null });

    try {
      let backupData: Record<string, any[]> = {};

      // Jika sesi Firebase SDK aktif, panggil langsung fungsi backupDatabaseToJSON() agar 100% identik
      if (auth.currentUser) {
        backupData = await backupDatabaseToJSON();
      } else {
        let idToken = options?.idToken || "";
        if (!idToken && cfg.refreshToken) {
          const exchanged = await exchangeRefreshTokenBrowser(cfg.refreshToken);
          idToken = exchanged.idToken;
          if (exchanged.refreshToken && exchanged.refreshToken !== cfg.refreshToken) {
            writeClientBackupConfig({ refreshToken: exchanged.refreshToken });
          }
        }

        if (idToken) {
          for (const collName of BACKUP_COLLECTIONS) {
            backupData[collName] = await fetchCollectionViaRestBrowser(collName, idToken);
          }
        } else {
          backupData = await backupDatabaseToJSON();
        }
      }

      const exportedAt = new Date().toISOString();
      const totalRecords = Object.values(backupData).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0
      );

      const saved = saveBackupSnapshotToLocalStorage(backupData, {
        exportedAt,
        source: options?.source || "browser_auto_scheduler",
        totalRecords,
        lastRunSlot: options?.slotKey || null
      });

      if (!saved.ok || !saved.meta) {
        throw new Error(saved.error || "Gagal menyimpan ke localStorage.");
      }

      const shouldAutoDownload = options?.autoDownload ?? cfg.autoDownload;
      const slotTrack = options?.slotKey || exportedAt;
      let nextDownloadedSlot = cfg.lastAutoDownloadedSlot || null;
      if (shouldAutoDownload && (!options?.slotKey || cfg.lastAutoDownloadedSlot !== options.slotKey)) {
        const downloaded = downloadDatabaseJsonFile(backupData, {
          tahunAnggaran: options?.tahunAnggaran,
          exportedAt
        });
        if (downloaded) {
          nextDownloadedSlot = slotTrack;
        }
      }

      const updatedStatus = writeClientBackupConfig({
        lastRunAt: exportedAt,
        lastRunSlot: options?.slotKey || cfg.lastRunSlot || null,
        lastStatus: "success",
        lastError: null,
        lastTotalRecords: saved.meta.totalRecords,
        lastSizeBytes: saved.meta.sizeBytes,
        hasLatestSnapshot: true,
        lastAutoDownloadedSlot: nextDownloadedSlot
      });

      return {
        status: updatedStatus,
        snapshot: {
          exportedAt,
          source: options?.source || "browser_auto_scheduler",
          totalRecords: saved.meta.totalRecords,
          sizeBytes: saved.meta.sizeBytes,
          data: backupData
        }
      };
    } catch (err: any) {
      writeClientBackupConfig({
        lastStatus: "error",
        lastError: err?.message || "Gagal menjalankan backup otomatis."
      });
      throw err;
    } finally {
      clientBackupInFlight = null;
    }
  })();

  return clientBackupInFlight;
}

// ==================== UNIFIED PUBLIC API (HYBRID EXPRESS SERVER OR STATIC HOSTING) ====================
export async function fetchAutoBackupStatus(idToken?: string): Promise<AutoBackupPublicStatus> {
  if (!isBackendKnownUnavailable()) {
    try {
      const headers: Record<string, string> = {};
      if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
      const res = await fetch("/api/backup/status", { headers, cache: "no-store" });
      if (res.ok && isJsonResponse(res)) {
        markBackendAvailability(true);
        const data = await res.json();
        if (data?.syncKey) {
          try { localStorage.setItem(LS_AUTO_BACKUP_SYNC_KEY, data.syncKey); } catch {}
        }
        return { ...data, executionMode: "server_hybrid" };
      }
      if (res.status === 404 || !isJsonResponse(res)) {
        markBackendAvailability(false);
      }
    } catch {
      // Network error or static fallback
    }
  }

  return readClientBackupConfig();
}

export async function saveAutoBackupSchedule(
  idToken: string,
  payload: {
    enabled: boolean;
    daysOfWeek: number[];
    hour: number;
    minute: number;
    timeOfDay: string;
    timezone?: string;
    autoDownload?: boolean;
    refreshToken?: string;
  }
): Promise<{ status: AutoBackupPublicStatus; syncKey: string }> {
  // Selalu simpan juga ke localStorage browser agar mode static / Firebase Hosting tetap bekerja
  const localCfg = writeClientBackupConfig({
    enabled: payload.enabled,
    daysOfWeek: payload.daysOfWeek,
    hour: payload.hour,
    minute: payload.minute,
    timeOfDay: payload.timeOfDay,
    timezone: payload.timezone || "Asia/Makassar",
    autoDownload: Boolean(payload.autoDownload),
    refreshToken: payload.refreshToken,
    updatedAt: new Date().toISOString()
  });

  if (!isBackendKnownUnavailable()) {
    try {
      const res = await fetch("/api/backup/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok && isJsonResponse(res)) {
        markBackendAvailability(true);
        const data = await res.json();
        if (data.syncKey) {
          try { localStorage.setItem(LS_AUTO_BACKUP_SYNC_KEY, data.syncKey); } catch {}
        }
        return {
          status: { ...data.status, executionMode: "server_hybrid" },
          syncKey: data.syncKey || ""
        };
      }
      if (res.status === 404 || !isJsonResponse(res)) {
        markBackendAvailability(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Gagal menyimpan jadwal backup (${res.status})`);
      }
    } catch (err: any) {
      if (cachedBackendAvailable === true) {
        throw err;
      }
    }
  }

  return {
    status: localCfg,
    syncKey: "browser-standalone"
  };
}

export async function triggerServerAutoBackupNow(
  idToken: string,
  options?: { autoDownload?: boolean; tahunAnggaran?: number }
): Promise<{
  status: AutoBackupPublicStatus;
  snapshot: {
    exportedAt: string;
    source: string;
    totalRecords: number;
    sizeBytes: number;
    data: Record<string, any[]>;
  };
}> {
  if (!isBackendKnownUnavailable()) {
    try {
      const res = await fetch("/api/backup/run-now", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`
        }
      });
      if (res.ok && isJsonResponse(res)) {
        markBackendAvailability(true);
        const data = await res.json();
        if (data.syncKey) {
          try { localStorage.setItem(LS_AUTO_BACKUP_SYNC_KEY, data.syncKey); } catch {}
        }
        if (data.snapshot?.data) {
          saveBackupSnapshotToLocalStorage(data.snapshot.data, {
            exportedAt: data.snapshot.exportedAt,
            source: data.snapshot.source || "manual_trigger",
            totalRecords: data.snapshot.totalRecords,
            lastRunSlot: data.status?.lastRunSlot || null
          });
          if (options?.autoDownload) {
            downloadDatabaseJsonFile(data.snapshot.data, {
              tahunAnggaran: options?.tahunAnggaran,
              exportedAt: data.snapshot.exportedAt
            });
          }
        }
        return {
          status: { ...data.status, executionMode: "server_hybrid" },
          snapshot: data.snapshot
        };
      }
      if (res.status === 404 || !isJsonResponse(res)) {
        markBackendAvailability(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Gagal menjalankan backup (${res.status})`);
      }
    } catch (err: any) {
      if (cachedBackendAvailable === true) {
        throw err;
      }
    }
  }

  return runBrowserAutonomousBackup({
    idToken,
    source: "manual_trigger_browser",
    autoDownload: options?.autoDownload,
    tahunAnggaran: options?.tahunAnggaran
  });
}

export async function syncLatestBackupToLocalStorage(options?: {
  idToken?: string;
  force?: boolean;
  tahunAnggaran?: number;
}): Promise<{ synced: boolean; reason?: string; meta?: LocalBackupMeta; status?: AutoBackupPublicStatus }> {
  if (isBackendKnownUnavailable()) {
    return { synced: false, reason: "browser_standalone_mode", status: readClientBackupConfig() };
  }

  const syncKey = localStorage.getItem(LS_AUTO_BACKUP_SYNC_KEY) || "";
  if (!syncKey && !options?.idToken) {
    return { synced: false, reason: "no_credentials" };
  }

  const status = await fetchAutoBackupStatus(options?.idToken);
  if (status.executionMode === "browser_standalone") {
    return { synced: false, reason: "browser_standalone_mode", status };
  }

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
  if (!latestRes.ok || !isJsonResponse(latestRes)) {
    if (latestRes.status === 404 || !isJsonResponse(latestRes)) {
      markBackendAvailability(false);
    }
    return { synced: false, reason: `http_${latestRes.status}`, status };
  }

  const snapshot = await latestRes.json();
  if (!snapshot?.data) {
    return { synced: false, reason: "empty_payload", status };
  }

  const exportedAt = snapshot.exportedAt || status.lastRunAt;
  const saved = saveBackupSnapshotToLocalStorage(snapshot.data, {
    exportedAt,
    source: snapshot.source || "auto_scheduler",
    totalRecords: snapshot.totalRecords,
    lastRunSlot: status.lastRunSlot
  });

  if (!saved.ok) {
    return { synced: false, reason: saved.error, status };
  }

  const clientCfg = readClientBackupConfig();
  const shouldAutoDownload = Boolean(status.autoDownload || clientCfg.autoDownload);
  const slotToTrack = status.lastRunSlot || exportedAt;
  if (shouldAutoDownload && snapshot.source === "auto_scheduler" && clientCfg.lastAutoDownloadedSlot !== slotToTrack) {
    const downloaded = downloadDatabaseJsonFile(snapshot.data, {
      tahunAnggaran: options?.tahunAnggaran,
      exportedAt
    });
    if (downloaded) {
      writeClientBackupConfig({ lastAutoDownloadedSlot: slotToTrack });
    }
  }

  return { synced: true, meta: saved.meta, status };
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const weekday = WEEKDAY_MAP[map.weekday] ?? date.getDay();
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const totalMinutes = Number(map.hour) * 60 + Number(map.minute);
  return { weekday, dateStr, totalMinutes };
}

/**
 * Background runner called periodically by App.tsx (works even when logged out!).
 * - When Express server is present: syncs server snapshot into localStorage.
 * - When deployed statically (e.g. Firebase Hosting): runs scheduled Firestore REST backup directly into localStorage.
 */
export async function tickAutoBackupBackground(options?: { idToken?: string; tahunAnggaran?: number }) {
  const status = await fetchAutoBackupStatus(options?.idToken);

  if (status.executionMode === "server_hybrid") {
    await syncLatestBackupToLocalStorage({ idToken: options?.idToken, tahunAnggaran: options?.tahunAnggaran });
    return;
  }

  // Static Hosting / Browser Autonomous Mode
  const cfg = readClientBackupConfig();
  if (!cfg.enabled || (!cfg.refreshToken && !auth.currentUser) || !Array.isArray(cfg.daysOfWeek) || cfg.daysOfWeek.length === 0) {
    return;
  }

  const hourInt = Math.min(23, Math.max(0, Number(cfg.hour) || 0));
  const minuteInt = Math.min(59, Math.max(0, Number(cfg.minute) || 0));
  const formattedTime = `${String(hourInt).padStart(2, "0")}:${String(minuteInt).padStart(2, "0")}`;
  const targetMinutes = hourInt * 60 + minuteInt;
  const tz = cfg.timezone || "Asia/Makassar";

  const zoned = getZonedParts(new Date(), tz);
  if (!cfg.daysOfWeek.includes(zoned.weekday)) {
    return;
  }

  const slotKey = `${zoned.dateStr}@${formattedTime}`;
  if (cfg.lastRunSlot === slotKey) {
    return;
  }

  const diffMinutes = zoned.totalMinutes - targetMinutes;
  if (diffMinutes < 0 || diffMinutes > 3) {
    return;
  }

  if (cfg.updatedAt) {
    const updatedZoned = getZonedParts(new Date(cfg.updatedAt), tz);
    if (updatedZoned.dateStr === zoned.dateStr && updatedZoned.totalMinutes > targetMinutes) {
      return;
    }
  }

  await runBrowserAutonomousBackup({
    idToken: options?.idToken,
    slotKey,
    source: "browser_auto_scheduler",
    autoDownload: cfg.autoDownload,
    tahunAnggaran: options?.tahunAnggaran
  });
}

export function downloadLocalStorageBackupFile(tahunAnggaran?: number): boolean {
  const raw = readLocalBackupRawJson();
  if (!raw) return false;
  const meta = readLocalBackupMeta();
  return downloadDatabaseJsonFile(raw, {
    tahunAnggaran,
    exportedAt: meta?.exportedAt
  });
}
