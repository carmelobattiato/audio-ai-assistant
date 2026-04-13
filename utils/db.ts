
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { SavedSession, InProgressSessionData } from '../types';
import { MAX_SESSIONS } from '../constants';

const DB_NAME = 'AudioAIAssistantDB';
const DB_VERSION = 5;
const SESSIONS_STORE_NAME = 'sessions';
const IN_PROGRESS_STORE_NAME = 'inProgressSessions';

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
}

const dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
  upgrade(db: IDBPDatabase<AppDB>, oldVersion: number, _newVersion: number | null, tx: any) {
    console.log(`Upgrading database from version ${oldVersion} to ${DB_VERSION}`);
    if (!db.objectStoreNames.contains(SESSIONS_STORE_NAME)) {
      const store = db.createObjectStore(SESSIONS_STORE_NAME, { keyPath: 'id' });
      store.createIndex('by-timestamp', 'timestamp');
    } else {
      // Migrazione: aggiunge l'indice se mancante (store preesistente da versioni precedenti)
      const store = tx.objectStore(SESSIONS_STORE_NAME);
      if (!store.indexNames.contains('by-timestamp')) {
        store.createIndex('by-timestamp', 'timestamp');
        console.log('DB: Migrated — added missing by-timestamp index to sessions store.');
      }
    }
    if (!db.objectStoreNames.contains(IN_PROGRESS_STORE_NAME)) {
      db.createObjectStore(IN_PROGRESS_STORE_NAME, { keyPath: 'id' });
    }
  },
});

export const db = {
  async saveSession(session: SavedSession): Promise<void> {
    const dbInstance = await dbPromise;
    
    let totalBytes = 0;
    if (session.data.audioBlob) totalBytes += session.data.audioBlob.size;
    if (session.data.chunks) {
        session.data.chunks.forEach(c => totalBytes += c.size);
    }
    session.totalSizeMb = Number((totalBytes / (1024 * 1024)).toFixed(2));

    await dbInstance.put(SESSIONS_STORE_NAME, session);
    console.log(`DB: Session '${session.name}' persisted. Size: ${session.totalSizeMb}MB. Status: ${session.status}`);
    
    await this.cleanupOldSessions();
  },

  async cleanupOldSessions(): Promise<void> {
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
        console.log(`DB: Deleting old session '${sessions[i].name}' due to retention policy.`);
        await tx.store.delete(sessions[i].id);
      }
    }
    await tx.done;
  },

  async updateSessionIncremental(sessionId: string, updates: Partial<SavedSession['data']> | { status?: SavedSession['status'], name?: string }): Promise<void> {
    const dbInstance = await dbPromise;
    const session = await dbInstance.get(SESSIONS_STORE_NAME, sessionId);
    if (session) {
        if ('status' in updates) {
            session.status = (updates as any).status;
            delete (updates as any).status;
        }
        if ('name' in updates) {
            session.name = (updates as any).name;
            delete (updates as any).name;
        }
        
        session.data = { ...session.data, ...updates };
        session.timestamp = Date.now();
        
        let totalBytes = 0;
        if (session.data.audioBlob) totalBytes += session.data.audioBlob.size;
        if (session.data.chunks) session.data.chunks.forEach(c => totalBytes += c.size);
        session.totalSizeMb = Number((totalBytes / (1024 * 1024)).toFixed(2));
        
        await dbInstance.put(SESSIONS_STORE_NAME, session);
    }
  },

  async getAllSessions(): Promise<SavedSession[]> {
    const dbInstance = await dbPromise;
    const sessions = await dbInstance.getAll(SESSIONS_STORE_NAME);
    return sessions.sort((a, b) => b.timestamp - a.timestamp);
  },
  
  async getSessionById(sessionId: string): Promise<SavedSession | undefined> {
    const dbInstance = await dbPromise;
    return dbInstance.get(SESSIONS_STORE_NAME, sessionId);
  },

  async deleteSession(sessionId: string): Promise<void> {
    const dbInstance = await dbPromise;
    await dbInstance.delete(SESSIONS_STORE_NAME, sessionId);
  },

  async markCrashedSessions(): Promise<number> {
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
  }
};
