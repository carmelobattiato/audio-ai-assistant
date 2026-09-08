import { db, DB_SCHEMA_VERSION, type BackupStoreName } from '../utils/db';
import { createSessionZipBlob, parseStoredZip, type ZipEntry } from '../utils/fileUtils';
import { blobToDataUrl, dataUrlToBlob } from '../utils/blobUtils';
import { loggingService } from './loggingService';
import type { SavedSession, CalendarEventRecord, SessionEmbedding } from '../types';

// ── Formato del file di backup ────────────────────────────────────────────────
//
//   manifest.json              inventario + versioni, sempre la PRIMA entry dello ZIP
//   sessions/<sessionId>.json  una entry per sessione, audio come data URL base64
//   calendarEvents.json
//   sessionEmbeddings.json
//   meetingNotifications.json
//   settings.json              sottoinsieme di localStorage
//   secrets.json               opt-in: chiave API cifrata + chiave AES che la decifra
//
// ZIP STORED (nessuna compressione) per riusare createSessionZipBlob/parseStoredZip
// senza dipendenze esterne. L'audio viaggia in base64 dentro il JSON di sessione,
// nella stessa forma usata dall'export per singola sessione già esistente
// (audioBlobBase64 / chunksBase64), così i backup restano compatibili.

export const BACKUP_FORMAT_VERSION = 1;

export type BackupCategory =
  | 'sessions'
  | 'calendarEvents'
  | 'sessionEmbeddings'
  | 'meetingNotifications'
  | 'settings'
  | 'secrets';

export type AudioMode = 'all' | 'skipIfTranscribed' | 'none';

export type CategoryFlags = Record<BackupCategory, boolean>;

export interface BackupSelection extends CategoryFlags {
  audioMode: AudioMode;
}

export interface CategoryInfo {
  count: number;
  bytes: number;
  withAudio?: number;
}

export interface SessionsInfo extends CategoryInfo {
  withAudio: number;
  /** Testo + metadati, audio escluso. */
  baseBytes: number;
  /** Byte audio totali (dimensione dei blob, prima della codifica base64). */
  audioBytesAll: number;
  /** Byte audio delle sole sessioni prive di trascrizione. */
  audioBytesUntranscribed: number;
  /** Sessioni che manterrebbero l'audio in modalità skipIfTranscribed. */
  withAudioUntranscribed: number;
}

export interface BackupInventory {
  sessions: SessionsInfo;
  calendarEvents: CategoryInfo;
  sessionEmbeddings: CategoryInfo;
  meetingNotifications: CategoryInfo;
  settings: CategoryInfo;
  secrets: CategoryInfo;
}

export interface BackupManifest {
  formatVersion: number;
  appDbVersion: number;
  createdAt: number;
  audioMode: AudioMode;
  contents: Partial<Record<BackupCategory, CategoryInfo>>;
}

export interface RestoreResult {
  imported: number;
  skipped: number;
  errors: number;
}

export type ProgressFn = (done: number, total: number, label: string) => void;

/** base64 (+33%) più l'overhead degli header ZIP e dell'escaping JSON. */
const BASE64_OVERHEAD = 1.37;

// Throughput indicativi, misurati su un backup di sessioni reali con audio webm.
// Dominati da FileReader.readAsDataURL in export e da atob in import.
const THROUGHPUT_EXPORT_BPS = 25 * 1024 * 1024;
const THROUGHPUT_IMPORT_BPS = 20 * 1024 * 1024;

// Chiavi localStorage incluse nella categoria "settings".
const SETTINGS_KEYS = [
  'audioAIAssistantSettings', // contexts/SettingsContext.tsx
  'neo_log_min_level',        // components/settings/LogsTab.tsx
  'calendar:source',          // services/icsService.ts
  'calendar2:ics',            // services/icsService.ts
];

/** Chiave AES che decifra appSecrets — vedi utils/crypto.ts. */
const CRYPTO_KEY_STORAGE = 'aaia_enc_key_v1';

const MANIFEST_ENTRY = 'manifest.json';
const SESSION_ENTRY_PREFIX = 'sessions/';

type SerializedSession = Omit<SavedSession, 'data'> & {
  data: Record<string, unknown> & {
    audioBlobBase64?: string;
    chunksBase64?: string[];
    audioStripped?: boolean;
  };
};

const hasTranscription = (session: SavedSession): boolean =>
  !!session.data.transcribedText?.trim();

const sessionAudioBytes = (session: SavedSession): number => {
  let bytes = session.data.audioBlob?.size ?? 0;
  session.data.chunks?.forEach(c => { bytes += c.size; });
  return bytes;
};

const shouldKeepAudio = (session: SavedSession, mode: AudioMode): boolean => {
  if (mode === 'none') return false;
  if (mode === 'skipIfTranscribed') return !hasTranscription(session);
  return true;
};

const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;

// ── Inventario ────────────────────────────────────────────────────────────────

export const getBackupInventory = async (): Promise<BackupInventory> => {
  const [sessions, events, embeddings, notifications, secrets] = await Promise.all([
    db.getAllSessions(),
    db.getAllCalendarEventsRaw(),
    db.getAllEmbeddings(),
    db.getAllMeetingNotifications(),
    db.getSecretRecords(),
  ]);

  let baseBytes = 0;
  let audioBytesAll = 0;
  let audioBytesUntranscribed = 0;
  let withAudio = 0;
  let withAudioUntranscribed = 0;

  for (const session of sessions) {
    const { audioBlob, chunks, ...restData } = session.data;
    void audioBlob; void chunks;
    baseBytes += utf8Bytes(JSON.stringify({ ...session, data: restData }));

    const audio = sessionAudioBytes(session);
    if (audio > 0) {
      audioBytesAll += audio;
      withAudio++;
      if (!hasTranscription(session)) {
        audioBytesUntranscribed += audio;
        withAudioUntranscribed++;
      }
    }
  }

  const settingsPayload = collectSettings();
  const settingsCount = Object.keys(settingsPayload).length;

  return {
    sessions: {
      count: sessions.length,
      bytes: baseBytes + Math.round(audioBytesAll * BASE64_OVERHEAD),
      withAudio,
      baseBytes,
      audioBytesAll,
      audioBytesUntranscribed,
      withAudioUntranscribed,
    },
    calendarEvents: { count: events.length, bytes: utf8Bytes(JSON.stringify(events)) },
    sessionEmbeddings: { count: embeddings.length, bytes: utf8Bytes(JSON.stringify(embeddings)) },
    meetingNotifications: { count: notifications.length, bytes: utf8Bytes(JSON.stringify(notifications)) },
    settings: { count: settingsCount, bytes: utf8Bytes(JSON.stringify(settingsPayload)) },
    secrets: { count: secrets.length, bytes: utf8Bytes(JSON.stringify(secrets)) },
  };
};

/** Dimensione stimata del file per la selezione corrente. */
export const estimateBackupBytes = (inv: BackupInventory, sel: BackupSelection): number => {
  let bytes = 0;
  if (sel.sessions) bytes += sessionsBytesFor(inv.sessions, sel.audioMode);
  if (sel.calendarEvents) bytes += inv.calendarEvents.bytes;
  if (sel.sessionEmbeddings) bytes += inv.sessionEmbeddings.bytes;
  if (sel.meetingNotifications) bytes += inv.meetingNotifications.bytes;
  if (sel.settings) bytes += inv.settings.bytes;
  if (sel.secrets) bytes += inv.secrets.bytes;
  return bytes;
};

export const sessionsBytesFor = (info: SessionsInfo, mode: AudioMode): number => {
  const audio =
    mode === 'all' ? info.audioBytesAll :
    mode === 'skipIfTranscribed' ? info.audioBytesUntranscribed :
    0;
  return info.baseBytes + Math.round(audio * BASE64_OVERHEAD);
};

export const estimateSeconds = (bytes: number, phase: 'export' | 'import'): number => {
  const throughput = phase === 'export' ? THROUGHPUT_EXPORT_BPS : THROUGHPUT_IMPORT_BPS;
  return Math.max(1, Math.round(bytes / throughput));
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const formatSeconds = (seconds: number): string =>
  seconds < 60 ? `~${seconds} s` : `~${Math.round(seconds / 60)} min`;

// ── Export ────────────────────────────────────────────────────────────────────

const collectSettings = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const key of SETTINGS_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
};

const serializeSession = async (session: SavedSession, mode: AudioMode): Promise<string> => {
  const { audioBlob, chunks, ...restData } = session.data;
  const copy = JSON.parse(JSON.stringify({ ...session, data: restData })) as SerializedSession;

  if (shouldKeepAudio(session, mode)) {
    if (audioBlob) copy.data.audioBlobBase64 = await blobToDataUrl(audioBlob);
    if (chunks?.length) copy.data.chunksBase64 = await Promise.all(chunks.map(blobToDataUrl));
  } else if (audioBlob || chunks?.length) {
    copy.data.audioStripped = true;
  }

  return JSON.stringify(copy);
};

export const createBackup = async (
  sel: BackupSelection,
  onProgress?: ProgressFn
): Promise<{ blob: Blob; manifest: BackupManifest }> => {
  const entries: ZipEntry[] = [];
  const contents: Partial<Record<BackupCategory, CategoryInfo>> = {};

  const sessions = sel.sessions ? await db.getAllSessions() : [];
  const total = sessions.length + 5;
  let done = 0;
  const tick = (label: string) => { done++; onProgress?.(done, total, label); };

  if (sel.sessions) {
    let bytes = 0;
    let withAudio = 0;
    for (const session of sessions) {
      const content = await serializeSession(session, sel.audioMode);
      entries.push({ name: `${SESSION_ENTRY_PREFIX}${session.id}.json`, content });
      bytes += utf8Bytes(content);
      if (shouldKeepAudio(session, sel.audioMode) && sessionAudioBytes(session) > 0) withAudio++;
      tick(session.name);
    }
    contents.sessions = { count: sessions.length, bytes, withAudio };
  }

  const addJsonEntry = async (
    category: Exclude<BackupCategory, 'sessions'>,
    name: string,
    load: () => Promise<unknown[]> | unknown[]
  ) => {
    if (!sel[category]) return;
    const records = await load();
    const content = JSON.stringify(records);
    entries.push({ name, content });
    contents[category] = { count: records.length, bytes: utf8Bytes(content) };
    tick(name);
  };

  await addJsonEntry('calendarEvents', 'calendarEvents.json', () => db.getAllCalendarEventsRaw());
  await addJsonEntry('sessionEmbeddings', 'sessionEmbeddings.json', () => db.getAllEmbeddings());
  await addJsonEntry('meetingNotifications', 'meetingNotifications.json', () => db.getAllMeetingNotifications());

  if (sel.settings) {
    const payload = collectSettings();
    const content = JSON.stringify(payload);
    entries.push({ name: 'settings.json', content });
    contents.settings = { count: Object.keys(payload).length, bytes: utf8Bytes(content) };
    tick('settings.json');
  }

  if (sel.secrets) {
    const records = await db.getSecretRecords();
    const payload = { secrets: records, cryptoKey: localStorage.getItem(CRYPTO_KEY_STORAGE) };
    const content = JSON.stringify(payload);
    entries.push({ name: 'secrets.json', content });
    contents.secrets = { count: records.length, bytes: utf8Bytes(content) };
    tick('secrets.json');
  }

  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    appDbVersion: DB_SCHEMA_VERSION,
    createdAt: Date.now(),
    audioMode: sel.audioMode,
    contents,
  };

  // Il manifest va per primo: parseStoredZip legge le entry in ordine, così
  // readBackupManifest può fermarsi subito senza materializzare gli audio.
  entries.unshift({ name: MANIFEST_ENTRY, content: JSON.stringify(manifest, null, 2) });

  onProgress?.(total, total, 'Creazione archivio…');
  const blob = createSessionZipBlob(entries);
  loggingService.info('BACKUP_EXPORT', 'Backup creato', {
    sizeMb: Number((blob.size / (1024 * 1024)).toFixed(2)),
    audioMode: sel.audioMode,
    contents,
  });
  return { blob, manifest };
};

export const backupFileName = (date = new Date()): string => {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `backup_aiassistant_${p2(date.getDate())}${p2(date.getMonth() + 1)}${date.getFullYear()}_${p2(date.getHours())}${p2(date.getMinutes())}.zip`;
};

// ── Import ────────────────────────────────────────────────────────────────────

export const readBackupManifest = async (file: File): Promise<BackupManifest> => {
  const buffer = await file.arrayBuffer();
  const entries = parseStoredZip(buffer);
  const manifestEntry = entries.find(e => e.name === MANIFEST_ENTRY);
  if (!manifestEntry) {
    throw new Error("File non riconosciuto: manifest.json assente. Non è un backup completo.");
  }
  const manifest = JSON.parse(manifestEntry.content) as BackupManifest;
  if (manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error(`Backup in formato v${manifest.formatVersion}, questa versione dell'app legge fino a v${BACKUP_FORMAT_VERSION}.`);
  }
  return manifest;
};

const deserializeSession = (raw: string): SavedSession => {
  const parsed = JSON.parse(raw) as SerializedSession;
  if (!parsed.id || !parsed.name || !parsed.data) throw new Error('Formato sessione non valido');

  const data = parsed.data;
  if (data.audioBlobBase64) {
    data.audioBlob = dataUrlToBlob(data.audioBlobBase64);
    delete data.audioBlobBase64;
  }
  if (data.chunksBase64) {
    data.chunks = data.chunksBase64.map(dataUrlToBlob);
    delete data.chunksBase64;
  }
  return parsed as unknown as SavedSession;
};

export const restoreBackup = async (
  file: File,
  opts: { mode: 'merge' | 'replace'; selection: CategoryFlags },
  onProgress?: ProgressFn
): Promise<RestoreResult> => {
  const buffer = await file.arrayBuffer();
  const entries = parseStoredZip(buffer);
  const manifestEntry = entries.find(e => e.name === MANIFEST_ENTRY);
  if (!manifestEntry) throw new Error("File non riconosciuto: manifest.json assente.");

  const { mode, selection } = opts;
  const result: RestoreResult = { imported: 0, skipped: 0, errors: 0 };

  const sessionEntries = selection.sessions
    ? entries.filter(e => e.name.startsWith(SESSION_ENTRY_PREFIX))
    : [];
  const total = sessionEntries.length + 5;
  let done = 0;
  const tick = (label: string) => { done++; onProgress?.(done, total, label); };

  const entryContent = (name: string): string | null =>
    entries.find(e => e.name === name)?.content ?? null;

  // ── Sessioni ──
  if (selection.sessions) {
    if (mode === 'replace') await db.clearStore('sessions');
    for (const entry of sessionEntries) {
      try {
        const session = deserializeSession(entry.content);
        if (mode === 'merge' && await db.getSessionById(session.id)) {
          result.skipped++;
        } else {
          await db.saveSessionRaw(session);
          result.imported++;
        }
        tick(session.name);
      } catch (err) {
        result.errors++;
        loggingService.warn('BACKUP_IMPORT_ENTRY_ERROR', `Entry ${entry.name} saltata`, {
          error: err instanceof Error ? err.message : String(err),
        });
        tick(entry.name);
      }
    }
    // Retention applicata una sola volta, a importazione conclusa.
    await db.cleanupOldSessions();
  }

  // ── Store JSON semplici (upsert per chiave: idempotenti in merge) ──
  const restoreJsonStore = async (
    category: 'calendarEvents' | 'sessionEmbeddings' | 'meetingNotifications',
    fileName: string,
    store: BackupStoreName
  ) => {
    if (!selection[category]) return;
    const content = entryContent(fileName);
    if (content === null) return;
    try {
      const records = JSON.parse(content) as unknown[];
      if (mode === 'replace') await db.clearStore(store);
      await db.bulkPut(store, records);
      result.imported += records.length;
    } catch (err) {
      result.errors++;
      loggingService.warn('BACKUP_IMPORT_ENTRY_ERROR', `Entry ${fileName} saltata`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    tick(fileName);
  };

  await restoreJsonStore('calendarEvents', 'calendarEvents.json', 'calendarEvents');
  await restoreJsonStore('sessionEmbeddings', 'sessionEmbeddings.json', 'sessionEmbeddings');
  await restoreJsonStore('meetingNotifications', 'meetingNotifications.json', 'meetingNotifications');

  // ── Settings (localStorage) ──
  if (selection.settings) {
    const content = entryContent('settings.json');
    if (content !== null) {
      try {
        const payload = JSON.parse(content) as Record<string, string>;
        for (const [key, value] of Object.entries(payload)) {
          if (SETTINGS_KEYS.includes(key)) localStorage.setItem(key, value);
        }
        result.imported += Object.keys(payload).length;
      } catch (err) {
        result.errors++;
        loggingService.warn('BACKUP_IMPORT_ENTRY_ERROR', 'Entry settings.json saltata', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      tick('settings.json');
    }
  }

  // ── Secrets: la chiave cifrata è inutile senza la chiave AES che la decifra ──
  if (selection.secrets) {
    const content = entryContent('secrets.json');
    if (content !== null) {
      try {
        const payload = JSON.parse(content) as { secrets: unknown[]; cryptoKey: string | null };
        if (payload.cryptoKey) localStorage.setItem(CRYPTO_KEY_STORAGE, payload.cryptoKey);
        if (mode === 'replace') await db.clearStore('appSecrets');
        await db.bulkPut('appSecrets', payload.secrets ?? []);
        result.imported += payload.secrets?.length ?? 0;
      } catch (err) {
        result.errors++;
        loggingService.warn('BACKUP_IMPORT_ENTRY_ERROR', 'Entry secrets.json saltata', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      tick('secrets.json');
    }
  }

  onProgress?.(total, total, 'Completato');
  loggingService.info('BACKUP_IMPORT', 'Backup importato', { mode, ...result });
  return result;
};

export const CATEGORY_LABELS: Record<BackupCategory, string> = {
  sessions: 'Sessioni',
  calendarEvents: 'Eventi calendario',
  sessionEmbeddings: 'Embedding semantici',
  meetingNotifications: 'Notifiche riunioni',
  settings: 'Impostazioni app',
  secrets: 'Chiave API (cifrata)',
};

export const ALL_CATEGORIES: BackupCategory[] = [
  'sessions',
  'calendarEvents',
  'sessionEmbeddings',
  'meetingNotifications',
  'settings',
  'secrets',
];

export const CATEGORY_TO_STORE: Partial<Record<BackupCategory, BackupStoreName>> = {
  sessions: 'sessions',
  calendarEvents: 'calendarEvents',
  sessionEmbeddings: 'sessionEmbeddings',
  meetingNotifications: 'meetingNotifications',
  secrets: 'appSecrets',
};

export type { SavedSession, CalendarEventRecord, SessionEmbedding };
