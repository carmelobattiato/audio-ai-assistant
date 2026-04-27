
import { useRef, useEffect } from 'react';
import { db } from '../utils/db';
import { loggingService } from '../services/loggingService';
import type { SavedSessionData, SavedSession } from '../types';

type DbUpdates = Partial<SavedSessionData> | { status?: SavedSession['status']; name?: string };

/**
 * Batches rapid consecutive db.updateSessionIncremental calls into a single write
 * after `delayMs` of inactivity. Flushes immediately on unmount to avoid data loss.
 *
 * Returns `schedule(updates)` to enqueue a partial update.
 */
export function useBatchedDbUpdate(
  activeSessionIdRef: React.RefObject<string | null>,
  isInitialLoadingRef: React.RefObject<boolean>,
  delayMs = 500
) {
  const pendingRef = useRef<DbUpdates>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = () => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || isInitialLoadingRef.current) return;
    if (Object.keys(pendingRef.current).length === 0) return;
    const snapshot = { ...pendingRef.current };
    pendingRef.current = {};
    db.updateSessionIncremental(sessionId, snapshot)
      .catch(err => loggingService.error('DB_UPDATE', 'Batched update failed', { err: String(err) }));
  };

  const schedule = (updates: DbUpdates) => {
    Object.assign(pendingRef.current, updates);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, delayMs);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      flush();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { schedule, flush };
}
