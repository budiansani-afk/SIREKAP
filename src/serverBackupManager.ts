import fs from "fs";
import path from "path";
import crypto from "crypto";
import firebaseConfig from "../firebase-applet-config.json";

export const BACKUP_COLLECTIONS = [
  "sibiru_program",
  "sibiru_kegiatan",
  "sibiru_sub_kegiatan",
  "sibiru_rka",
  "sibiru_realisasi",
  "sibiru_belanja_pihak_ketiga",
  "sibiru_dokumen",
  "sibiru_pengguna",
  "sibiru_pengaturan"
] as const;

const BOOTSTRAPPED_ADMIN_EMAILS = new Set([
  "admin@sirekap.com",
  "budiansani@gmail.com",
  "ianzbjx@gmail.com"
]);

export interface AutoBackupServerConfig {
  enabled: boolean;
  daysOfWeek: number[]; // 0 (Minggu) .. 6 (Sabtu)
  timeOfDay: string; // "HH:mm" 24-hour
  timezone: string; // e.g. "Asia/Makassar"
  syncKey: string;
  refreshToken: string;
  adminEmail: string;
  lastRunAt: string | null;
  lastRunSlot: string | null;
  lastStatus: "idle" | "running" | "success" | "error";
  lastError: string | null;
  lastTotalRecords: number;
  lastSizeBytes: number;
  updatedAt: string | null;
}

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

const BACKUP_DIR = path.join(process.cwd(), ".sirekap-backups");
const CONFIG_FILE = path.join(BACKUP_DIR, "config.json");
const SNAPSHOT_FILE = path.join(BACKUP_DIR, "latest-backup.json");

let inFlightBackup: Promise<any> | null = null;
let schedulerTimer: NodeJS.Timeout | null = null;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function defaultConfig(): AutoBackupServerConfig {
  return {
    enabled: false,
    daysOfWeek: [1, 2, 3, 4, 5],
    timeOfDay: "23:00",
    timezone: "Asia/Makassar",
    syncKey: crypto.randomBytes(24).toString("hex"),
    refreshToken: "",
    adminEmail: "",
    lastRunAt: null,
    lastRunSlot: null,
    lastStatus: "idle",
    lastError: null,
    lastTotalRecords: 0,
    lastSizeBytes: 0,
    updatedAt: null
  };
}

export function loadAutoBackupConfig(): AutoBackupServerConfig {
  ensureBackupDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    const def = defaultConfig();
    saveAutoBackupConfig(def);
    return def;
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const merged: AutoBackupServerConfig = {
      ...defaultConfig(),
      ...parsed
    };
    if (!merged.syncKey) {
      merged.syncKey = crypto.randomBytes(24).toString("hex");
    }
    return merged;
  } catch {
    const def = defaultConfig();
    saveAutoBackupConfig(def);
    return def;
  }
}

export function saveAutoBackupConfig(cfg: AutoBackupServerConfig) {
  ensureBackupDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

export function getPublicBackupStatus(cfg?: AutoBackupServerConfig): AutoBackupPublicStatus {
  const c = cfg || loadAutoBackupConfig();
  return {
    enabled: Boolean(c.enabled),
    daysOfWeek: Array.isArray(c.daysOfWeek) ? c.daysOfWeek : [],
    timeOfDay: c.timeOfDay || "23:00",
    timezone: c.timezone || "Asia/Makassar",
    lastRunAt: c.lastRunAt || null,
    lastRunSlot: c.lastRunSlot || null,
    lastStatus: c.lastStatus || "idle",
    lastError: c.lastError || null,
    lastTotalRecords: c.lastTotalRecords || 0,
    lastSizeBytes: c.lastSizeBytes || 0,
    hasLatestSnapshot: fs.existsSync(SNAPSHOT_FILE),
    hasCredentials: Boolean(c.refreshToken || (process.env.BACKUP_ADMIN_EMAIL && process.env.BACKUP_ADMIN_PASSWORD)),
    updatedAt: c.updatedAt || null
  };
}

export function loadLatestSnapshot(): { exportedAt: string; totalRecords: number; sizeBytes: number; data: Record<string, any[]> } | null {
  if (!fs.existsSync(SNAPSHOT_FILE)) return null;
  try {
    const raw = fs.readFileSync(SNAPSHOT_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function verifySyncKey(providedKey?: string | null): boolean {
  if (!providedKey) return false;
  const cfg = loadAutoBackupConfig();
  if (!cfg.syncKey) return false;
  const a = Buffer.from(String(providedKey));
  const b = Buffer.from(String(cfg.syncKey));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Decode Firestore REST Value into standard JS values matching client SDK output
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

export async function verifyAdminIdToken(idToken: string): Promise<{ email: string; uid: string } | null> {
  if (!idToken) return null;
  try {
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      }
    );
    if (!lookupRes.ok) return null;
    const lookupData: any = await lookupRes.json();
    const user = lookupData?.users?.[0];
    const email = String(user?.email || "").trim().toLowerCase();
    const uid = String(user?.localId || "");
    if (!email || !uid) return null;

    if (BOOTSTRAPPED_ADMIN_EMAILS.has(email)) {
      return { email, uid };
    }

    // Verify role & active status from Firestore sibiru_pengguna/{email}
    const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
    const userDocUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${encodeURIComponent(dbId)}/documents/sibiru_pengguna/${encodeURIComponent(email)}`;
    const docRes = await fetch(userDocUrl, {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    if (!docRes.ok) return null;
    const docJson: any = await docRes.json();
    const decoded = decodeFirestoreFields(docJson.fields || {});
    if (decoded.role === "Administrator" && decoded.aktif !== false) {
      return { email, uid };
    }
    return null;
  } catch (err) {
    console.warn("[AutoBackup] Admin token verification error:", err);
    return null;
  }
}

async function exchangeRefreshTokenForIdToken(refreshToken: string): Promise<{ idToken: string; refreshToken: string }> {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
    }
  );
  const data: any = await res.json();
  if (!res.ok || !data?.id_token) {
    throw new Error(data?.error?.message || "Gagal memperbarui sesi autentikasi backup di server.");
  }
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token || refreshToken
  };
}

async function signInWithEnvCredentials(): Promise<{ idToken: string; refreshToken: string } | null> {
  const email = process.env.BACKUP_ADMIN_EMAIL;
  const password = process.env.BACKUP_ADMIN_PASSWORD;
  if (!email || !password) return null;

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  const data: any = await res.json();
  if (!res.ok || !data?.idToken) {
    throw new Error(data?.error?.message || "Login kredensial backup server gagal.");
  }
  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken || ""
  };
}

async function fetchCollectionViaRest(collName: string, idToken: string): Promise<any[]> {
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
      const errBody = await res.text().catch(() => "");
      throw new Error(`Gagal membaca koleksi ${collName} (${res.status}): ${errBody}`);
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

export async function runServerBackupNow(options?: { overrideIdToken?: string; slotKey?: string; source?: string }) {
  if (inFlightBackup) {
    return inFlightBackup;
  }

  inFlightBackup = (async () => {
    const cfg = loadAutoBackupConfig();
    cfg.lastStatus = "running";
    cfg.lastError = null;
    saveAutoBackupConfig(cfg);

    try {
      let idToken = options?.overrideIdToken || "";
      if (!idToken) {
        if (cfg.refreshToken) {
          const exchanged = await exchangeRefreshTokenForIdToken(cfg.refreshToken);
          idToken = exchanged.idToken;
          if (exchanged.refreshToken && exchanged.refreshToken !== cfg.refreshToken) {
            cfg.refreshToken = exchanged.refreshToken;
          }
        } else {
          const envAuth = await signInWithEnvCredentials();
          if (envAuth) {
            idToken = envAuth.idToken;
            if (envAuth.refreshToken) cfg.refreshToken = envAuth.refreshToken;
          }
        }
      }

      if (!idToken) {
        throw new Error("Token autentikasi server untuk backup otomatis belum tersedia. Silakan simpan ulang jadwal saat login sebagai Administrator.");
      }

      const backupData: Record<string, any[]> = {};
      let totalRecords = 0;

      for (const collName of BACKUP_COLLECTIONS) {
        const docs = await fetchCollectionViaRest(collName, idToken);
        backupData[collName] = docs;
        totalRecords += docs.length;
      }

      const exportedAt = new Date().toISOString();
      const rawJson = JSON.stringify(backupData);
      const sizeBytes = Buffer.byteLength(rawJson, "utf8");

      const snapshotEnvelope = {
        exportedAt,
        source: options?.source || "auto_scheduler",
        totalRecords,
        sizeBytes,
        data: backupData
      };

      ensureBackupDir();
      fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshotEnvelope), "utf8");

      cfg.lastRunAt = exportedAt;
      if (options?.slotKey) {
        cfg.lastRunSlot = options.slotKey;
      }
      cfg.lastStatus = "success";
      cfg.lastError = null;
      cfg.lastTotalRecords = totalRecords;
      cfg.lastSizeBytes = sizeBytes;
      saveAutoBackupConfig(cfg);

      console.log(`[AutoBackup] Backup berhasil (${totalRecords} dokumen, ${sizeBytes} bytes) pada ${exportedAt}`);
      return snapshotEnvelope;
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error("[AutoBackup] Gagal menjalankan backup otomatis:", msg);
      cfg.lastStatus = "error";
      cfg.lastError = msg;
      saveAutoBackupConfig(cfg);
      throw err;
    } finally {
      inFlightBackup = null;
    }
  })();

  return inFlightBackup;
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

function getZonedDateParts(date: Date, timeZone: string) {
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
  const hhmm = `${map.hour}:${map.minute}`;
  const totalMinutes = Number(map.hour) * 60 + Number(map.minute);
  return { weekday, dateStr, hhmm, totalMinutes };
}

function parseHHmmMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec((hhmm || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function startAutoBackupScheduler() {
  if (schedulerTimer) return;

  const tick = async () => {
    try {
      const cfg = loadAutoBackupConfig();
      if (!cfg.enabled || !Array.isArray(cfg.daysOfWeek) || cfg.daysOfWeek.length === 0) {
        return;
      }
      const targetMinutes = parseHHmmMinutes(cfg.timeOfDay);
      if (targetMinutes === null) return;

      const tz = cfg.timezone || "Asia/Makassar";
      const now = new Date();
      const zoned = getZonedDateParts(now, tz);

      if (!cfg.daysOfWeek.includes(zoned.weekday)) {
        return;
      }

      const slotKey = `${zoned.dateStr}@${cfg.timeOfDay}`;
      if (cfg.lastRunSlot === slotKey) {
        return;
      }

      // Allow exact minute match or up to 3 minutes grace window in case of brief server sleep
      const diffMinutes = zoned.totalMinutes - targetMinutes;
      if (diffMinutes < 0 || diffMinutes > 3) {
        return;
      }

      // Avoid immediate retroactive execution if admin just saved config after the scheduled minute
      if (cfg.updatedAt) {
        const updatedZoned = getZonedDateParts(new Date(cfg.updatedAt), tz);
        if (updatedZoned.dateStr === zoned.dateStr && updatedZoned.totalMinutes > targetMinutes) {
          return;
        }
      }

      await runServerBackupNow({ slotKey, source: "auto_scheduler" });
    } catch (err) {
      console.warn("[AutoBackup Scheduler Tick]", err);
    }
  };

  schedulerTimer = setInterval(tick, 20_000);
  // Also run a delayed initial check shortly after server start
  setTimeout(tick, 5_000);
  console.log("[AutoBackup] Scheduler latar belakang aktif (cek setiap 20 detik).");
}
