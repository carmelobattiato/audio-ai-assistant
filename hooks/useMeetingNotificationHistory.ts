import { useCallback, useEffect, useState } from 'react';
import { db, type MeetingNotificationRecord } from '../utils/db';

const BC_NAME = 'meeting-notifications-v1';

// Returns the persisted notifications still within the 1-day TTL window, sorted
// by start time. Refreshes on BroadcastChannel "ready" events so newly-fired
// notifications from any tab appear here immediately.
export function useMeetingNotificationHistory(): {
  records: MeetingNotificationRecord[];
  refresh: () => Promise<void>;
  deleteOne: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
} {
  const [records, setRecords] = useState<MeetingNotificationRecord[]>([]);

  const refresh = useCallback(async () => {
    try {
      const all = await db.getAllMeetingNotifications();
      const now = Date.now();
      setRecords(all.filter(r => (r.expiresAt ?? 0) > now));
    } catch (err) {
      console.warn('[meeting-history] load error', err);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(BC_NAME);
    bc.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as { type?: string };
      if (msg?.type === 'ready') refresh();
    };
    return () => bc.close();
  }, [refresh]);

  // Soft refresh every 30s to pick up newly-fired records from this tab too
  useEffect(() => {
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const deleteOne = useCallback(async (id: string) => {
    try {
      await db.deleteMeetingNotification(id);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.warn('[meeting-history] delete error', err);
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await db.clearAllMeetingNotifications();
      setRecords([]);
    } catch (err) {
      console.warn('[meeting-history] clear error', err);
    }
  }, []);

  return { records, refresh, deleteOne, clearAll };
}
