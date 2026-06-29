import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../utils/db';
import { useCalBridgeV2, type OutlookState } from './useCalBridgeV2';
import { loggingService } from '../services/loggingService';
import type { OutlookAppointment } from '../components/OutlookCalendarModal';
import type { CalendarEventRecord } from '../types';

interface UseCalendarSyncParams {
  isCalendarOpen: boolean;
  isNewCalendarOpen: boolean;
}

export interface CalendarSyncState {
  calAppointments: OutlookAppointment[];
  calBridgeAvailable: boolean | null;
  calError: string | null;
  calRefreshing: boolean;
  calExtensionConnected: boolean;
  calOutlookState: OutlookState;
  calSource: string;
  calendarEventsDb: CalendarEventRecord[];
  setCalendarEventsDb: React.Dispatch<React.SetStateAction<CalendarEventRecord[]>>;
  fetchCalendarData: (isRetry?: boolean, bypassThrottle?: boolean) => Promise<void>;
  lastSyncAt: number | null;
}

const CAL_LAST_KEY = 'calendar:lastFetch';
const CAL_LOCK_KEY = 'calendar:fetching';
const CAL_LOCK_TTL = 120_000;
const CAL_BC = 'calendar-sync-v1';

export function useCalendarSync({ isCalendarOpen, isNewCalendarOpen }: UseCalendarSyncParams): CalendarSyncState {
  const [calAppointments, setCalAppointments] = useState<OutlookAppointment[]>([]);
  const [calBridgeAvailable, setCalBridgeAvailable] = useState<boolean | null>(null);
  const [calError, setCalError] = useState<string | null>(null);
  const [calRefreshing, setCalRefreshing] = useState(false);
  // Initialise directly from localStorage so the first render already shows correct state.
  // The calV2 effect keeps these up to date as the extension pushes new data.
  const [calExtensionConnected, setCalExtensionConnected] = useState<boolean>(() => {
    const raw = localStorage.getItem('cal-bridge-v2-ext-ts') ?? localStorage.getItem('cal-bridge-v2-ts');
    const ts = raw ? parseInt(raw, 10) : 0;
    return !!(ts && Date.now() - ts < 5 * 60_000);
  });
  const [calOutlookState, setCalOutlookState] = useState<OutlookState>(() => {
    return (localStorage.getItem('cal-bridge-v2-outlook-state') as OutlookState | null) ?? 'unknown';
  });
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(() => {
    const ts = localStorage.getItem('cal-bridge-v2-ts');
    return ts ? parseInt(ts, 10) : null;
  });
  // Ref so fetchCalendarData (stable callback) can read latest value without stale closure
  const calExtConnectedRef = useRef<boolean>(false);
  // Resolves when extension confirms sync with actual appointment data
  const pendingSyncRef = useRef<{ resolve: () => void; reject: (err: string) => void } | null>(null);
  const calV2LastTsRef = useRef<number | null>(null);
  const [calSource, setCalSource] = useState<string>(() => localStorage.getItem('calendar:source') || 'windows');
  const [calendarEventsDb, setCalendarEventsDb] = useState<CalendarEventRecord[]>([]);

  const calBcRef = useRef<BroadcastChannel | null>(null);
  const calInFlightRef = useRef(false);
  const calLastDetailHashRef = useRef<string>('');

  const calV2 = useCalBridgeV2();

  // BroadcastChannel — receives appointment lists from other tabs
  useEffect(() => {
    const bc = new BroadcastChannel(CAL_BC);
    calBcRef.current = bc;
    bc.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'appointments' && Array.isArray(msg.appointments)) {
        setCalAppointments(msg.appointments as OutlookAppointment[]);
        setCalBridgeAvailable(true);
        setCalError(null);
        const ts = Date.now();
        setLastSyncAt(ts);
        // Resolve pending sync promise if waiting
        if (pendingSyncRef.current) {
          pendingSyncRef.current.resolve();
          pendingSyncRef.current = null;
        }
      }
      if (msg.type === 'extension-heartbeat') {
        // Legacy: some older builds send this via BroadcastChannel; honour it but
        // don't rely on it — calExtensionConnected is driven by useCalBridgeV2.
        setCalExtensionConnected(true);
        calExtConnectedRef.current = true;
      }
    };
    return () => { bc.close(); calBcRef.current = null; };
  }, []);

  // Poll calendar source changes (every 5s)
  // NOTE: calExtensionConnected is driven exclusively by useCalBridgeV2 (localStorage cal-bridge-v2-ts)
  useEffect(() => {
    const check = () => setCalSource(localStorage.getItem('calendar:source') || 'windows');
    check();
    const id = setInterval(check, 5_000);
    return () => clearInterval(id);
  }, []);

  const fetchCalendarData = useCallback(async (isRetry = false, bypassThrottle = false) => {
    if (calInFlightRef.current) return;
    const now = Date.now();
    const lastStr = localStorage.getItem(CAL_LAST_KEY);
    const last = lastStr ? parseInt(lastStr, 10) : 0;
    if (!isRetry && !bypassThrottle && Number.isFinite(last) && (now - last) < 60_000) return;
    const lockStr = localStorage.getItem(CAL_LOCK_KEY);
    if (!isRetry && lockStr) {
      const lockTs = parseInt(lockStr, 10);
      if (Number.isFinite(lockTs) && (now - lockTs) < CAL_LOCK_TTL) return;
    }
    localStorage.setItem(CAL_LAST_KEY, String(now));
    localStorage.setItem(CAL_LOCK_KEY, String(now));
    calInFlightRef.current = true;
    setCalRefreshing(true);
    if (isRetry) {
      loggingService.info('CALENDAR_RETRY', 'User triggered calendar data retry', { platform: navigator.platform });
    }

    const { loadCalendarSource, loadIcsConfig, fetchIcs } = await import('../services/icsService');
    const source = loadCalendarSource();

    if (source === 'extension') {
      if (!calExtConnectedRef.current) {
        setCalError('Estensione non connessa — nessun segnale recente');
        setCalBridgeAvailable(false);
        setCalRefreshing(false);
        calInFlightRef.current = false;
        localStorage.removeItem(CAL_LOCK_KEY);
        return;
      }
      // If calV2 data is already fresh (< 2 min), resolve immediately — no need to wait.
      // Extension writes to localStorage (not BroadcastChannel), so request-sync would
      // time out if the extension has no new data to push.
      const v2Age = calV2LastTsRef.current ? Date.now() - calV2LastTsRef.current : Infinity;
      if (v2Age < 2 * 60_000) {
        setCalBridgeAvailable(true);
        setCalError(null);
        setCalRefreshing(false);
        calInFlightRef.current = false;
        localStorage.removeItem(CAL_LOCK_KEY);
        return;
      }
      // Send request and wait up to 6s for actual appointment data
      calBcRef.current?.postMessage({ type: 'request-sync' });
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingSyncRef.current = null;
          reject(new Error('Nessuna risposta dall\'estensione (timeout 6s)'));
        }, 6000);
        pendingSyncRef.current = {
          resolve: () => { clearTimeout(timeoutId); resolve(); },
          reject: (msg: string) => { clearTimeout(timeoutId); reject(new Error(msg)); },
        };
      }).then(() => {
        setCalBridgeAvailable(true);
        setCalError(null);
      }).catch((e: Error) => {
        setCalError(e.message);
        setCalBridgeAvailable(false);
      }).finally(() => {
        setCalRefreshing(false);
        calInFlightRef.current = false;
        localStorage.removeItem(CAL_LOCK_KEY);
      });
      return;
    }

    if (source === 'ics') {
      try {
        const cfg = loadIcsConfig();
        if (!cfg?.icsUrl) {
          throw new Error('ICS feed not configured. Open Settings → Integrations and paste the published Outlook ICS URL.');
        }
        const events = await fetchIcs(cfg.icsUrl);
        const now2 = new Date();
        const weekLater = new Date(now2);
        weekLater.setDate(now2.getDate() + 7);
        weekLater.setHours(23, 59, 59, 999);
        const teamsRe = /https:\/\/teams\.microsoft\.com\/l\/[^\s<>"']+/;
        const mapped: OutlookAppointment[] = events
          .filter(ev => { if (!ev.start) return false; const d = new Date(ev.start); return d >= now2 && d <= weekLater; })
          .sort((a, b) => a.start.localeCompare(b.start))
          .map(ev => ({
            id: ev.id, subject: ev.subject, start: ev.start, end: ev.end,
            location: ev.location || '', body: ev.description || '',
            attendees: (ev.attendees || []).map(name => ({ name, email: '' })),
            organizer: ev.organizer || '',
            onlineMeetingUrl: ev.description?.match(teamsRe)?.[0],
            isCanceled: ev.isCancelled, isRecurring: ev.isRecurring,
          }));
        setCalBridgeAvailable(true);
        setCalAppointments(mapped);
        setCalError(null);
        setLastSyncAt(Date.now());
        loggingService.debug('CALENDAR_LOADED', `Loaded ${mapped.length} appointments via ICS feed`, { count: mapped.length, source: 'ics', isRetry });
        calBcRef.current?.postMessage({ type: 'appointments', appointments: mapped });
      } catch (e: unknown) {
        setCalBridgeAvailable(false);
        setCalError((e as Error).message ?? 'ICS fetch error');
        loggingService.warn('CALENDAR_BRIDGE_ERROR', String((e as Error).message), { source: 'ics', isRetry });
      } finally {
        localStorage.removeItem(CAL_LOCK_KEY);
        calInFlightRef.current = false;
        setCalRefreshing(false);
      }
      return;
    }

    try {
      const statusRes = await fetch('/api/outlook/status', { signal: AbortSignal.timeout(3000) });
      if (!statusRes.ok) {
        const reason = `Outlook Bridge unreachable (HTTP ${statusRes.status})`;
        loggingService.warn('CALENDAR_BRIDGE_ERROR', reason, { httpStatus: statusRes.status, isRetry, platform: navigator.platform });
        throw new Error(reason);
      }
      const statusData = await statusRes.json();
      if (statusData.status !== 'ok') {
        const serverPlatform: string = statusData.platform ?? '';
        const isNonWindows = serverPlatform !== '' && serverPlatform !== 'win32';
        const reason = isNonWindows
          ? `Outlook Bridge is not available on ${serverPlatform}. This feature requires Windows.`
          : (statusData.message ?? 'Outlook Bridge unavailable');
        loggingService.warn('CALENDAR_BRIDGE_ERROR', reason, { serverPlatform, isNonWindows, isRetry, bridgeStatus: statusData.status });
        throw new Error(reason);
      }
      setCalBridgeAvailable(true);
      const res = await fetch('/api/outlook/appointments/today');
      const data = await res.json();
      if (data.error) {
        loggingService.warn('CALENDAR_APPOINTMENTS_ERROR', data.error, { isRetry });
        throw new Error(data.error);
      }
      const apptList = data.appointments ?? [];
      const skippedList = data.skipped ?? [];
      setCalAppointments(apptList);
      setCalError(null);
      setLastSyncAt(Date.now());
      loggingService.debug('CALENDAR_LOADED', `Loaded ${apptList.length} appointments (seen ${data.totalSeen ?? '?'}, skipped ${skippedList.length}) in ${data.timings?.total ?? '?'}ms`, {
        count: apptList.length, skippedCount: skippedList.length, totalSeen: data.totalSeen,
        filter: data.filter, timings: data.timings,
        canceledCount: apptList.filter((a: OutlookAppointment) => a.isCanceled).length,
        recurringCount: apptList.filter((a: OutlookAppointment) => a.isRecurring).length,
        isRetry,
      });
      if (skippedList.length > 0) loggingService.warn('CALENDAR_SKIPPED', `${skippedList.length} appointments skipped by bridge`, { skipped: skippedList });
      const detailEntries = apptList.map((a: OutlookAppointment) => ({
        id: a.id, subject: a.subject, start: a.start, end: a.end,
        organizer: a.organizer, isCanceled: a.isCanceled, isRecurring: a.isRecurring,
        hasTeamsUrl: !!a.onlineMeetingUrl, attendees: a.attendees?.length ?? 0,
      }));
      const detailHash = detailEntries.map((e: { id: string; start: string; end: string; isCanceled: boolean | undefined }) => `${e.id}|${e.start}|${e.end}|${e.isCanceled}`).join('::');
      if (detailHash !== calLastDetailHashRef.current) {
        calLastDetailHashRef.current = detailHash;
        loggingService.debug('CALENDAR_APPOINTMENTS_DETAIL', 'Appointment summary (changed)', { appointments: detailEntries });
      }
      calBcRef.current?.postMessage({ type: 'appointments', appointments: apptList });
    } catch (e: unknown) {
      setCalBridgeAvailable(false);
      setCalError((e as Error).message ?? 'Connection error');
    } finally {
      localStorage.removeItem(CAL_LOCK_KEY);
      calInFlightRef.current = false;
      setCalRefreshing(false);
    }
  }, []);

  // Sync calAppointments → IndexedDB (next 7 days window)
  useEffect(() => {
    if (calAppointments.length === 0) return;
    const now = new Date();
    const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const toSync = calAppointments.filter(apt => {
      const start = new Date(apt.start);
      const end = new Date(apt.end || apt.start);
      return end >= now && start <= oneWeekLater;
    });
    const records: CalendarEventRecord[] = toSync.map(apt => ({
      id: apt.id, subject: apt.subject, start: apt.start, end: apt.end,
      location: apt.location || undefined, organizer: apt.organizer || undefined,
      attendees: apt.attendees, onlineMeetingUrl: apt.onlineMeetingUrl,
      body: apt.body || undefined, responseStatus: apt.responseStatus || undefined,
      source: calSource as 'windows' | 'ics' | 'extension',
      createdAt: Date.now(),
    }));
    db.upsertCalendarEvents(records).catch(console.error);
  }, [calAppointments, calSource]);

  // Load calendar events from DB when NewCalendar opens or after sync
  useEffect(() => {
    if (!isNewCalendarOpen) return;
    db.getAllCalendarEvents().then(setCalendarEventsDb).catch(console.error);
    db.deleteStaleCalendarEvents().catch(console.error);
    db.deleteAudioOlderThan(10).catch(console.error);
  }, [isNewCalendarOpen, calAppointments]);

  // Calendar Bridge v2 — sync localStorage→DB; track extension+outlook state
  useEffect(() => {
    setCalExtensionConnected(calV2.extensionOnline);
    calExtConnectedRef.current = calV2.extensionOnline;
    setCalOutlookState(calV2.outlookState);
    if (!calV2.extensionOnline) return;
    if (calV2.events.length === 0) return;
    if (calV2.lastSyncTs) { setLastSyncAt(calV2.lastSyncTs); calV2LastTsRef.current = calV2.lastSyncTs; }
    db.upsertCalendarEvents(calV2.events).catch(console.error);
    // Populate calAppointments so useMeetingNotifications fires for extension events
    const asAppointments: OutlookAppointment[] = calV2.events.map(ev => ({
      id: ev.id,
      subject: ev.subject,
      start: ev.start,
      end: ev.end,
      location: ev.location ?? '',
      body: ev.body ?? '',
      attendees: ev.attendees ?? [],
      organizer: ev.organizer ?? '',
      onlineMeetingUrl: ev.onlineMeetingUrl,
      responseStatus: ev.responseStatus,
    }));
    setCalAppointments(asAppointments);
    setCalError(null);
    // Resolve any fetchCalendarData() waiting on request-sync:
    // extension writes to localStorage (not BroadcastChannel), so pendingSyncRef
    // must be resolved here when fresh events arrive.
    if (pendingSyncRef.current) {
      pendingSyncRef.current.resolve();
      pendingSyncRef.current = null;
    }
    if (isNewCalendarOpen) {
      db.getAllCalendarEvents().then(setCalendarEventsDb).catch(console.error);
    }
  }, [calV2.extensionOnline, calV2.outlookState, calV2.events, isNewCalendarOpen]);

  // Fetch once silently on mount
  useEffect(() => { fetchCalendarData(); }, [fetchCalendarData]);

  // Refresh when calendar modal opens
  useEffect(() => { if (isCalendarOpen) fetchCalendarData(); }, [isCalendarOpen, fetchCalendarData]);

  // Auto-refresh every 60s (bypasses throttle) + opportunistic on focus/visibility
  useEffect(() => {
    const intervalId = window.setInterval(() => { fetchCalendarData(false, true); }, 60 * 1000);
    const onFocus = () => { fetchCalendarData(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchCalendarData(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchCalendarData]);

  return {
    calAppointments, calBridgeAvailable, calError, calRefreshing,
    calExtensionConnected, calOutlookState, calSource, calendarEventsDb, setCalendarEventsDb,
    fetchCalendarData, lastSyncAt,
  };
}
