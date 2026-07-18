
import { useCallback, useMemo } from 'react';
import { db } from '../utils/db';
import { saveBlobToFile, createSessionZipBlob, parseStoredZip } from '../utils/fileUtils';
import { SavedSession } from '../types';
import { loggingService } from '../services/loggingService';

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, b64] = dataUrl.split(',');
  const mime = header?.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const binary = atob(b64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

type ImportedSession = {
  id: string;
  name: string;
  data: {
    audioBlobBase64?: string;
    audioBlob?: Blob;
    chunksBase64?: string[];
    chunks?: Blob[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

const serializeSessionForExport = async (session: SavedSession): Promise<{ name: string; content: string }> => {
  const sessionCopy = JSON.parse(JSON.stringify(session)) as ImportedSession;
  if (session.data.audioBlob) {
    sessionCopy.data.audioBlobBase64 = await blobToDataUrl(session.data.audioBlob);
    delete sessionCopy.data.audioBlob;
  }
  if (session.data.chunks?.length) {
    sessionCopy.data.chunksBase64 = await Promise.all(session.data.chunks.map(blobToDataUrl));
    delete sessionCopy.data.chunks;
  }
  const safeName = session.name.replace(/[^a-z0-9_\-]/gi, '_');
  return { name: `${safeName}_${session.id}.json`, content: JSON.stringify(sessionCopy, null, 2) };
};

const importSessionFromObject = async (sessionData: ImportedSession): Promise<void> => {
  if (!sessionData.id || !sessionData.name || !sessionData.data) {
    throw new Error("Invalid session JSON format");
  }
  if (sessionData.data.audioBlobBase64) {
    sessionData.data.audioBlob = dataUrlToBlob(sessionData.data.audioBlobBase64);
    delete sessionData.data.audioBlobBase64;
  }
  if (sessionData.data.chunksBase64) {
    sessionData.data.chunks = sessionData.data.chunksBase64.map(dataUrlToBlob);
    delete sessionData.data.chunksBase64;
  }
  const existing = await db.getSessionById(sessionData.id);
  if (existing) {
    sessionData.id = `imported_${Date.now()}_${sessionData.id}`;
    sessionData.name = `[Imported] ${sessionData.name}`;
  }
  await db.saveSession(sessionData as unknown as SavedSession);
};

export const useSessionLogic = (
  setIsBusy: (busy: boolean) => void,
  setAppUserMessage: (msg: string) => void,
  fetchSessions: () => void
) => {

  const handleExportSessionJson = useCallback(async (sessionId: string) => {
    try {
      setIsBusy(true);
      const session = await db.getSessionById(sessionId);
      if (!session) throw new Error("Session not found");
      const { content } = await serializeSessionForExport(session);
      const blob = new Blob([content], { type: 'application/json' });
      saveBlobToFile(blob, `Session_${session.name.replace(/\s+/g, '_')}.json`);
      loggingService.info('SESSION_EXPORT_JSON', `Session ${sessionId} exported to JSON`, { name: session.name });
      setAppUserMessage("Session exported to JSON.");
    } catch (error) {
      console.error("JSON Export Error:", error);
      loggingService.error('SESSION_EXPORT_JSON_ERROR', `Failed to export session ${sessionId}`, { error });
      setAppUserMessage("Error exporting JSON.");
    } finally {
      setIsBusy(false);
    }
  }, [setIsBusy, setAppUserMessage]);

  const handleExportAllSessionsZip = useCallback(async () => {
    try {
      setIsBusy(true);
      setAppUserMessage("Esportazione backup in corso...");
      const sessions = await db.getAllSessions();
      if (sessions.length === 0) { setAppUserMessage("Nessuna sessione da esportare."); return; }
      const entries = await Promise.all(sessions.map(serializeSessionForExport));
      const zip = createSessionZipBlob(entries);
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      saveBlobToFile(zip, `backup_all_sessions_${dd}${mm}${yyyy}.zip`);
      loggingService.info('SESSION_EXPORT_ALL_ZIP', `Exported ${sessions.length} sessions to ZIP`);
      setAppUserMessage(`Backup esportato: ${sessions.length} sessioni.`);
    } catch (error) {
      console.error("ZIP Export Error:", error);
      loggingService.error('SESSION_EXPORT_ALL_ZIP_ERROR', 'Failed to export all sessions', { error });
      setAppUserMessage("Errore durante l'esportazione del backup.");
    } finally {
      setIsBusy(false);
    }
  }, [setIsBusy, setAppUserMessage]);

  const handleImportSessionJson = useCallback(async (file: File) => {
    try {
      setIsBusy(true);
      setAppUserMessage("Importazione sessione in corso...");

      if (file.name.endsWith('.zip')) {
        const buffer = await file.arrayBuffer();
        const entries = parseStoredZip(buffer).filter(e => e.name.endsWith('.json'));
        if (entries.length === 0) throw new Error("Nessun file JSON trovato nel backup ZIP.");
        let count = 0;
        for (const entry of entries) {
          try {
            const parsed = JSON.parse(entry.content) as ImportedSession;
            await importSessionFromObject(parsed);
            count++;
          } catch (e) {
            console.warn(`Skipped ${entry.name}:`, e);
          }
        }
        loggingService.info('SESSION_IMPORT_ZIP', `Imported ${count}/${entries.length} sessions from ZIP`);
        setAppUserMessage(`Importate ${count} sessioni dal backup.`);
      } else {
        const text = await file.text();
        const sessionData = JSON.parse(text) as ImportedSession;
        await importSessionFromObject(sessionData);
        loggingService.info('SESSION_IMPORT_JSON', `Session imported from ${file.name}`, { name: sessionData.name });
        setAppUserMessage("Sessione importata.");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Import Error:", msg);
      loggingService.error('SESSION_IMPORT_ERROR', `Failed to import from ${file.name}`, { error: msg });
      setAppUserMessage(`Errore importazione: ${msg}`);
    } finally {
      fetchSessions();
      setIsBusy(false);
    }
  }, [fetchSessions, setIsBusy, setAppUserMessage]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await db.deleteSession(sessionId);
    fetchSessions();
    setAppUserMessage("Session deleted.");
  }, [fetchSessions, setAppUserMessage]);

  return useMemo(() => ({
    handleExportSessionJson,
    handleExportAllSessionsZip,
    handleImportSessionJson,
    handleDeleteSession
  }), [handleExportSessionJson, handleExportAllSessionsZip, handleImportSessionJson, handleDeleteSession]);
};
