
import { openDB, DBSchema, IDBPDatabase, IDBPTransaction } from 'idb';
import { SavedSession, InProgressSessionData, CalendarEventRecord, SessionEmbedding, StorageStats } from '../types';
import { MAX_SESSIONS, CAL_SYNC_PAST_HOURS, CAL_AUDIO_RETENTION_DAYS } from '../constants';
import type { EncryptedBlob } from './crypto';
import { loggingService } from '../services/loggingService';

/**
 * Wraps an IndexedDB operation: logs failures (quota exceeded, corrupted DB,
 * blocked upgrade) via loggingService and re-throws so the UI can react.
 * Prevents silent failures from unhandled rejections.
 */
async function dbOp<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    loggingService.error('DB_ERROR', `IndexedDB op failed: ${label}`, {
      error: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined,
    });
    throw err;
  }
}

const DB_NAME = 'AudioAIAssistantDB';
const DB_VERSION = 8;
const SESSIONS_STORE_NAME = 'sessions';
const IN_PROGRESS_STORE_NAME = 'inProgressSessions';
const SECRETS_STORE_NAME = 'appSecrets';
const MEETING_NOTIF_STORE_NAME = 'meetingNotifications';
const CALENDAR_EVENTS_STORE_NAME = 'calendarEvents';
const SESSION_EMBEDDINGS_STORE_NAME = 'sessionEmbeddings';
const API_KEY_RECORD_ID = 'googleApiKey';

interface SecretRecord extends EncryptedBlob {
  id: string;
}

export interface MeetingNotificationRecord {
  id: string;                  // `${apptId}::${YYYY-MM-DD}`
  apptId: string;
  date: string;                // YYYY-MM-DD (local)
  subject: string;
  organizer: string;
  startIso: string;
  endIso?: string;             // meeting end time
  role: 'organizer' | 'required' | 'optional' | 'unknown';
  summary: string;             // '' until LLM finishes (placeholder for claim)
  generatedAt: number;         // ms epoch when summary was written ('' summary → 0)
  expiresAt: number;           // ms epoch; default = generatedAt + 24h
  shownAt?: number;            // when the toast was first displayed (for history grouping)
  body?: string;               // truncated meeting body, for "Avvia sessione" context
  onlineMeetingUrl?: string;
  location?: string;
}

interface AppDB extends DBSchema {
  [SESSIONS_STORE_NAME]: {
    key: string;
    value: SavedSession;
    indexes: { 'by-timestamp': number };
  };
  [IN_PROGRESS_STORE_NAME]: {
    key: string;
    value: InProgressSessionData;
  };
  [SECRETS_STORE_NAME]: {
    key: string;
    value: SecretRecord;
  };
  [MEETING_NOTIF_STORE_NAME]: {
    key: string;
    value: MeetingNotificationRecord;
    indexes: { 'by-expiresAt': number };
  };
  [CALENDAR_EVENTS_STORE_NAME]: {
    key: string;
    value: CalendarEventRecord;
    indexes: { 'by-start': string; 'by-session': string };
  };
  [SESSION_EMBEDDINGS_STORE_NAME]: {
    key: string;
    value: SessionEmbedding;
  };
}

type AppStoreName = 'sessions' | 'inProgressSessions' | 'appSecrets' | 'meetingNotifications' | 'calendarEvents' | 'sessionEmbeddings';

const dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
  upgrade(db: IDBPDatabase<AppDB>, oldVersion: number, _newVersion: number | null, tx: IDBPTransaction<AppDB, AppStoreName[], 'versionchange'>) {
    console.log(`Upgrading database from version ${oldVersion} to ${DB_VERSION}`);
    if (!db.objectStoreNames.contains(SESSIONS_STORE_NAME)) {
      const store = db.createObjectStore(SESSIONS_STORE_NAME, { keyPath: 'id' });
      store.createIndex('by-timestamp', 'timestamp');
    } else {
      const store = tx.objectStore(SESSIONS_STORE_NAME);
      if (!store.indexNames.contains('by-timestamp')) {
        store.createIndex('by-timestamp', 'timestamp');
        console.log('DB: Migrated — added missing by-timestamp index to sessions store.');
      }
    }
    if (!db.objectStoreNames.contains(IN_PROGRESS_STORE_NAME)) {
      db.createObjectStore(IN_PROGRESS_STORE_NAME, { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains(SECRETS_STORE_NAME)) {
      db.createObjectStore(SECRETS_STORE_NAME, { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains(MEETING_NOTIF_STORE_NAME)) {
      const store = db.createObjectStore(MEETING_NOTIF_STORE_NAME, { keyPath: 'id' });
      store.createIndex('by-expiresAt', 'expiresAt');
    }
    if (!db.objectStoreNames.contains(CALENDAR_EVENTS_STORE_NAME)) {
      const calStore = db.createObjectStore(CALENDAR_EVENTS_STORE_NAME, { keyPath: 'id' });
      calStore.createIndex('by-start', 'start');
      calStore.createIndex('by-session', 'linkedSessionId');
    }
    if (!db.objectStoreNames.contains(SESSION_EMBEDDINGS_STORE_NAME)) {
      db.createObjectStore(SESSION_EMBEDDINGS_STORE_NAME, { keyPath: 'sessionId' });
    }
  },
});

export const db = {
  async saveSession(session: SavedSession): Promise<void> {
    return dbOp('saveSession', async () => {
      const dbInstance = await dbPromise;

      let totalBytes = 0;
      if (session.data.audioBlob) totalBytes += session.data.audioBlob.size;
      if (session.data.chunks) {
          session.data.chunks.forEach(c => totalBytes += c.size);
      }
      session.totalSizeMb = Number((totalBytes / (1024 * 1024)).toFixed(2));

      await dbInstance.put(SESSIONS_STORE_NAME, session);
      console.log(`DB: Session '${session.name}' persisted. Size: ${session.totalSizeMb}MB. Status: ${session.status}`);

      await db.cleanupOldSessions();
    });
  },

  async cleanupOldSessions(): Promise<void> {
    return dbOp('cleanupOldSessions', async () => {
      const dbInstance = await dbPromise;
      const tx = dbInstance.transaction(SESSIONS_STORE_NAME, 'readwrite');
      let sessions: SavedSession[];
      try {
        sessions = await tx.store.index('by-timestamp').getAll();
      } catch {
        // Indice non ancora disponibile (es. prima apertura dopo migrazione): fallback su getAll
        sessions = await tx.store.getAll();
        sessions.sort((a, b) => a.timestamp - b.timestamp);
      }

      if (sessions.length > MAX_SESSIONS) {
        const toDeleteCount = sessions.length - MAX_SESSIONS;
        for (let i = 0; i < toDeleteCount; i++) {
          console.log(`DB: Deleting old session '${sessions[i]!.name}' due to retention policy.`);
          await tx.store.delete(sessions[i]!.id);
        }
      }
      await tx.done;
    });
  },

  async updateSessionIncremental(sessionId: string, updates: Partial<SavedSession['data']> | { status?: SavedSession['status'], name?: string }): Promise<void> {
    return dbOp('updateSessionIncremental', async () => {
      const dbInstance = await dbPromise;
      const session = await dbInstance.get(SESSIONS_STORE_NAME, sessionId);
      if (session) {
          const mutableUpdates = updates as { status?: SavedSession['status']; name?: string } & Partial<SavedSession['data']>;
          if ('status' in mutableUpdates && mutableUpdates.status !== undefined) {
              session.status = mutableUpdates.status;
              delete mutableUpdates.status;
          }
          if ('name' in mutableUpdates && mutableUpdates.name !== undefined) {
              session.name = mutableUpdates.name;
              delete mutableUpdates.name;
          }

          session.data = { ...session.data, ...mutableUpdates };
          session.timestamp = Date.now();

          let totalBytes = 0;
          if (session.data.audioBlob) totalBytes += session.data.audioBlob.size;
          if (session.data.chunks) session.data.chunks.forEach(c => totalBytes += c.size);
          session.totalSizeMb = Number((totalBytes / (1024 * 1024)).toFixed(2));

          await dbInstance.put(SESSIONS_STORE_NAME, session);
      }
    });
  },

  async getAllSessions(): Promise<SavedSession[]> {
    return dbOp('getAllSessions', async () => {
      const dbInstance = await dbPromise;
      const sessions = await dbInstance.getAll(SESSIONS_STORE_NAME);
      return sessions.sort((a, b) => b.timestamp - a.timestamp);
    });
  },

  async getSessionById(sessionId: string): Promise<SavedSession | undefined> {
    return dbOp('getSessionById', async () => {
      const dbInstance = await dbPromise;
      return dbInstance.get(SESSIONS_STORE_NAME, sessionId);
    });
  },

  async deleteSession(sessionId: string): Promise<void> {
    return dbOp('deleteSession', async () => {
      const dbInstance = await dbPromise;
      await dbInstance.delete(SESSIONS_STORE_NAME, sessionId);
    });
  },

  async saveEncryptedApiKey(blob: EncryptedBlob): Promise<void> {
    return dbOp('saveEncryptedApiKey', async () => {
      const dbInstance = await dbPromise;
      await dbInstance.put(SECRETS_STORE_NAME, { id: API_KEY_RECORD_ID, ...blob });
    });
  },

  async getEncryptedApiKey(): Promise<EncryptedBlob | null> {
    return dbOp('getEncryptedApiKey', async () => {
      const dbInstance = await dbPromise;
      const record = await dbInstance.get(SECRETS_STORE_NAME, API_KEY_RECORD_ID);
      if (!record) return null;
      return { iv: record.iv, data: record.data };
    });
  },

  async deleteEncryptedApiKey(): Promise<void> {
    return dbOp('deleteEncryptedApiKey', async () => {
      const dbInstance = await dbPromise;
      await dbInstance.delete(SECRETS_STORE_NAME, API_KEY_RECORD_ID);
    });
  },

  // ── Meeting notifications (cross-tab dedup + 1-day history) ────────────────
  // tryClaimMeetingNotification: atomic insert-if-absent. Returns true if this tab
  // owns the record (must generate the LLM summary), false if another tab already
  // claimed it. Uses an explicit transaction + get/add to avoid races.
  async tryClaimMeetingNotification(record: MeetingNotificationRecord): Promise<boolean> {
    return dbOp('tryClaimMeetingNotification', async () => {
      const dbInstance = await dbPromise;
      const tx = dbInstance.transaction(MEETING_NOTIF_STORE_NAME, 'readwrite');
      const existing = await tx.store.get(record.id);
      if (existing) {
        await tx.done;
        return false;
      }
      await tx.store.add(record);
      await tx.done;
      return true;
    });
  },

  async getMeetingNotification(id: string): Promise<MeetingNotificationRecord | undefined> {
    return dbOp('getMeetingNotification', async () => {
      const dbInstance = await dbPromise;
      return dbInstance.get(MEETING_NOTIF_STORE_NAME, id);
    });
  },

  async updateMeetingNotificationSummary(id: string, summary: string): Promise<void> {
    return dbOp('updateMeetingNotificationSummary', async () => {
      const dbInstance = await dbPromise;
      const existing = await dbInstance.get(MEETING_NOTIF_STORE_NAME, id);
      if (!existing) return;
      existing.summary = summary;
      existing.generatedAt = Date.now();
      if (!existing.shownAt) existing.shownAt = Date.now();
      await dbInstance.put(MEETING_NOTIF_STORE_NAME, existing);
    });
  },

  async getAllMeetingNotifications(): Promise<MeetingNotificationRecord[]> {
    return dbOp('getAllMeetingNotifications', async () => {
      const dbInstance = await dbPromise;
      const all = await dbInstance.getAll(MEETING_NOTIF_STORE_NAME);
      return all.sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());
    });
  },

  async deleteMeetingNotification(id: string): Promise<void> {
    return dbOp('deleteMeetingNotification', async () => {
      const dbInstance = await dbPromise;
      await dbInstance.delete(MEETING_NOTIF_STORE_NAME, id);
    });
  },

  async clearAllMeetingNotifications(): Promise<void> {
    return dbOp('clearAllMeetingNotifications', async () => {
      const dbInstance = await dbPromise;
      await dbInstance.clear(MEETING_NOTIF_STORE_NAME);
    });
  },

  async pruneExpiredMeetingNotifications(): Promise<number> {
    return dbOp('pruneExpiredMeetingNotifications', async () => {
      const dbInstance = await dbPromise;
      const tx = dbInstance.transaction(MEETING_NOTIF_STORE_NAME, 'readwrite');
      let pruned = 0;
      const now = Date.now();
      const all = await tx.store.getAll();
      for (const r of all) {
        if ((r.expiresAt ?? 0) <= now) {
          await tx.store.delete(r.id);
          pruned++;
        }
      }
      await tx.done;
      return pruned;
    });
  },

  async markCrashedSessions(): Promise<number> {
    return dbOp('markCrashedSessions', async () => {
      const dbInstance = await dbPromise;
      const sessions = await dbInstance.getAll(SESSIONS_STORE_NAME);
      let marked = 0;
      for (const s of sessions) {
          if (s.status === 'In Progress') {
              s.status = 'Interrupted';
              await dbInstance.put(SESSIONS_STORE_NAME, s);
              marked++;
          }
      }
      return marked;
    });
  },

  // ── Calendar Events ─────────────────────────────────────────────────────────
  async upsertCalendarEvent(event: CalendarEventRecord): Promise<void> {
    return dbOp('upsertCalendarEvent', async () => {
      const dbInstance = await dbPromise;
      await dbInstance.put(CALENDAR_EVENTS_STORE_NAME, event);
    });
  },

  async upsertCalendarEvents(events: CalendarEventRecord[]): Promise<void> {
    return dbOp('upsertCalendarEvents', async () => {
      const dbInstance = await dbPromise;
      const tx = dbInstance.transaction(CALENDAR_EVENTS_STORE_NAME, 'readwrite');
      await Promise.all(events.map(async e => {
        const existing = await tx.store.get(e.id);
        // Preserve linked session if already set — sync must not break existing links
        const record = existing?.linkedSessionId
          ? { ...e, linkedSessionId: existing.linkedSessionId }
          : e;
        return tx.store.put(record);
      }));
      await tx.done;
    });
  },

  async getCalendarEventsByRange(from: Date, to: Date): Promise<CalendarEventRecord[]> {
    return dbOp('getCalendarEventsByRange', async () => {
      const dbInstance = await dbPromise;
      const all = await dbInstance.getAll(CALENDAR_EVENTS_STORE_NAME);
      const fromIso = from.toISOString();
      const toIso = to.toISOString();
      return all.filter(e => e.start >= fromIso && e.start <= toIso);
    });
  },

  async getAllCalendarEvents(): Promise<CalendarEventRecord[]> {
    return dbOp('getAllCalendarEvents', async () => {
      const dbInstance = await dbPromise;
      const all = await dbInstance.getAll(CALENDAR_EVENTS_STORE_NAME);
      return all.sort((a, b) => a.start.localeCompare(b.start));
    });
  },

  async linkSessionToEvent(eventId: string, sessionId: string, sessionSubject?: string): Promise<void> {
    return dbOp('linkSessionToEvent', async () => {
      const dbInstance = await dbPromise;
      const event = await dbInstance.get(CALENDAR_EVENTS_STORE_NAME, eventId);
      if (event) {
        event.linkedSessionId = sessionId;
        await dbInstance.put(CALENDAR_EVENTS_STORE_NAME, event);
      }
      const session = await dbInstance.get(SESSIONS_STORE_NAME, sessionId);
      if (session) {
        session.data.linkedCalendarEventId = eventId;
        session.data.linkedCalendarEventSubject = sessionSubject ?? event?.subject;
        await dbInstance.put(SESSIONS_STORE_NAME, session);
      }
    });
  },

  async unlinkSessionFromEvent(eventId: string): Promise<void> {
    return dbOp('unlinkSessionFromEvent', async () => {
      const dbInstance = await dbPromise;
      const event = await dbInstance.get(CALENDAR_EVENTS_STORE_NAME, eventId);
      if (event?.linkedSessionId) {
        const session = await dbInstance.get(SESSIONS_STORE_NAME, event.linkedSessionId);
        if (session) {
          delete session.data.linkedCalendarEventId;
          delete session.data.linkedCalendarEventSubject;
          await dbInstance.put(SESSIONS_STORE_NAME, session);
        }
        delete event.linkedSessionId;
        await dbInstance.put(CALENDAR_EVENTS_STORE_NAME, event);
      }
    });
  },

  async deleteStaleCalendarEvents(): Promise<number> {
    return dbOp('deleteStaleCalendarEvents', async () => {
      const dbInstance = await dbPromise;
      const now = Date.now();
      const cutoff24h = now - CAL_SYNC_PAST_HOURS * 60 * 60 * 1000;
      const cutoff10d = now - CAL_AUDIO_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const all = await dbInstance.getAll(CALENDAR_EVENTS_STORE_NAME);
      let deleted = 0;
      for (const ev of all) {
        const endMs = new Date(ev.end || ev.start).getTime();
        if (!ev.linkedSessionId) {
          // No recording: delete 24h after event end
          if (endMs < cutoff24h) {
            await dbInstance.delete(CALENDAR_EVENTS_STORE_NAME, ev.id);
            deleted++;
          }
        } else {
          // Session linked: delete only if session is gone AND 10d elapsed
          const session = await dbInstance.get(SESSIONS_STORE_NAME, ev.linkedSessionId);
          if (!session && endMs < cutoff10d) {
            await dbInstance.delete(CALENDAR_EVENTS_STORE_NAME, ev.id);
            deleted++;
          }
        }
      }
      return deleted;
    });
  },

  async deleteCalendarEvent(eventId: string): Promise<void> {
    return dbOp('deleteCalendarEvent', async () => {
      const dbInstance = await dbPromise;
      await dbInstance.delete(CALENDAR_EVENTS_STORE_NAME, eventId);
    });
  },

  async resetOrphanCalendarEvents(): Promise<number> {
    return dbOp('resetOrphanCalendarEvents', async () => {
      const dbInstance = await dbPromise;
      const all = await dbInstance.getAll(CALENDAR_EVENTS_STORE_NAME);
      let deleted = 0;
      for (const ev of all) {
        if (!ev.linkedSessionId) {
          await dbInstance.delete(CALENDAR_EVENTS_STORE_NAME, ev.id);
          deleted++;
        }
      }
      return deleted;
    });
  },

  // ── Retention ───────────────────────────────────────────────────────────────
  async deleteAudioOlderThan(days: number): Promise<number> {
    return dbOp('deleteAudioOlderThan', async () => {
      const dbInstance = await dbPromise;
      const sessions = await dbInstance.getAll(SESSIONS_STORE_NAME);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let count = 0;
      for (const s of sessions) {
        if (s.timestamp < cutoff && (s.data.audioBlob || (s.data.chunks && s.data.chunks.length > 0))) {
          s.data.audioBlob = null;
          s.data.chunks = [];
          s.totalSizeMb = 0;
          await dbInstance.put(SESSIONS_STORE_NAME, s);
          count++;
        }
      }
      return count;
    });
  },

  async deleteSessionsOlderThan(days: number): Promise<number> {
    return dbOp('deleteSessionsOlderThan', async () => {
      const dbInstance = await dbPromise;
      const sessions = await dbInstance.getAll(SESSIONS_STORE_NAME);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let count = 0;
      for (const s of sessions) {
        if (s.timestamp < cutoff) {
          await dbInstance.delete(SESSIONS_STORE_NAME, s.id);
          count++;
        }
      }
      return count;
    });
  },

  async getStorageStats(): Promise<StorageStats> {
    return dbOp('getStorageStats', async () => {
      const dbInstance = await dbPromise;
      const sessions = await dbInstance.getAll(SESSIONS_STORE_NAME);
      const events = await dbInstance.getAll(CALENDAR_EVENTS_STORE_NAME);
      const embeddings = await dbInstance.getAll(SESSION_EMBEDDINGS_STORE_NAME);

      let audioBytes = 0;
      let textBytes = 0;
      let sessionsWithAudio = 0;

      for (const s of sessions) {
        if (s.data.audioBlob) audioBytes += s.data.audioBlob.size;
        if (s.data.chunks) s.data.chunks.forEach(c => audioBytes += c.size);
        if (s.data.audioBlob || (s.data.chunks && s.data.chunks.length > 0)) sessionsWithAudio++;
        const textLen = (s.data.transcribedText?.length || 0) + (s.data.llmProcessedText?.length || 0);
        textBytes += textLen * 2; // UTF-16 approx
      }
      const embeddingBytes = embeddings.reduce((acc, e) => acc + e.vector.length * 4, 0);
      const toMb = (b: number) => Number((b / (1024 * 1024)).toFixed(2));

      return {
        totalMb: toMb(audioBytes + textBytes + embeddingBytes),
        audioMb: toMb(audioBytes),
        textMb: toMb(textBytes),
        embeddingsMb: toMb(embeddingBytes),
        sessionCount: sessions.length,
        sessionWithAudioCount: sessionsWithAudio,
        calendarEventCount: events.length,
      };
    });
  },

  // ── Semantic Embeddings ─────────────────────────────────────────────────────
  async upsertEmbedding(embedding: SessionEmbedding): Promise<void> {
    return dbOp('upsertEmbedding', async () => {
      const dbInstance = await dbPromise;
      await dbInstance.put(SESSION_EMBEDDINGS_STORE_NAME, embedding);
    });
  },

  async getEmbeddingBySessionId(sessionId: string): Promise<SessionEmbedding | undefined> {
    return dbOp('getEmbeddingBySessionId', async () => {
      const dbInstance = await dbPromise;
      return dbInstance.get(SESSION_EMBEDDINGS_STORE_NAME, sessionId);
    });
  },

  async getAllEmbeddings(): Promise<SessionEmbedding[]> {
    return dbOp('getAllEmbeddings', async () => {
      const dbInstance = await dbPromise;
      return dbInstance.getAll(SESSION_EMBEDDINGS_STORE_NAME);
    });
  },

  async deleteEmbedding(sessionId: string): Promise<void> {
    return dbOp('deleteEmbedding', async () => {
      const dbInstance = await dbPromise;
      await dbInstance.delete(SESSION_EMBEDDINGS_STORE_NAME, sessionId);
    });
  },
};
