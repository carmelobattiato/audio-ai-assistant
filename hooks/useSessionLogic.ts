
import { useCallback, useMemo } from 'react';
import { db } from '../utils/db';
import { saveBlobToFile } from '../utils/fileUtils';
import { SavedSession } from '../types';
import { loggingService } from '../services/loggingService';

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

      // We need to handle the Blobs (audio and chunks) if we want them in JSON.
      // For simplicity and to avoid massive JSON files, we'll convert them to base64 if present, 
      // or just export the metadata/text if they are too large.
      // But let's try to be thorough.
      
      const sessionCopy = JSON.parse(JSON.stringify(session));
      
      // Handle audioBlob
      if (session.data.audioBlob) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(session.data.audioBlob!);
        });
        sessionCopy.data.audioBlobBase64 = await base64Promise;
        delete sessionCopy.data.audioBlob;
      }

      // Handle chunks
      if (session.data.chunks && session.data.chunks.length > 0) {
        sessionCopy.data.chunksBase64 = await Promise.all(session.data.chunks.map(chunk => {
          return new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result as string);
            r.readAsDataURL(chunk);
          });
        }));
        delete sessionCopy.data.chunks;
      }

      const jsonString = JSON.stringify(sessionCopy, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
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

  const handleImportSessionJson = useCallback(async (file: File) => {
    try {
      setIsBusy(true);
      setAppUserMessage("Importing session...");

      const text = await file.text();
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
      const sessionData = JSON.parse(text) as ImportedSession;

      if (!sessionData.id || !sessionData.name || !sessionData.data) {
        throw new Error("Invalid session JSON format");
      }

      // Converte un data URL base64 in Blob senza usare fetch()
      const dataUrlToBlob = (dataUrl: string): Blob => {
        const [header, b64] = dataUrl.split(',');
        const mime = header?.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
        const binary = atob(b64 ?? '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
      };

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
      loggingService.info('SESSION_IMPORT_JSON', `Session imported from ${file.name}`, { name: sessionData.name });
      setAppUserMessage("Session imported successfully.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("JSON Import Error:", msg);
      loggingService.error('SESSION_IMPORT_JSON_ERROR', `Failed to import session from ${file.name}`, { error: msg });
      setAppUserMessage(`Error importing JSON: ${msg}`);
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
    handleImportSessionJson,
    handleDeleteSession
  }), [handleExportSessionJson, handleImportSessionJson, handleDeleteSession]);
};
