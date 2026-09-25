import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CalendarEventRecord } from '@/types';
import { loggingService } from '@/services/loggingService';
import { db } from '@/utils/db';

/** localStorage contract written by extension-v4's background service worker. */
const K = {
  events:   'aai-v4-bridge',
  ts:       'aai-v4-bridge-ts',
  state:    'aai-v4-bridge-state',
  extTs:    'aai-v4-bridge-ext-ts',
  nextSync: 'aai-v4-bridge-next-sync',
} as const;

/** The plugin beats once per sync cycle (60s); allow a cycle and a half. */
const PLUGIN_STALE_MS = 90_000;
const POLL_MS = 5_000;

/** postMessage contract with the plugin's content-app.js relay. */
const MSG_REQUEST = '__AAI_V4_APP_SYNC_REQUEST__';
const MSG_RESULT = '__AAI_V4_APP_SYNC_RESULT__';
const MSG_PRESENT = '__AAI_V4_APP_PRESENT__';

/** No relay answer within this window means the plugin isn't there to answer. */
const SYNC_TIMEOUT_MS = 10_000;

const LOG_EVENT = 'CALENDAR_V4';

export type V4OutlookState = 'ok' | 'error' | 'fetching' | 'idle' | 'unknown';
export type V4SyncRequestState = 'idle' | 'requesting' | 'ok' | 'error';

export interface V4CalendarSyncState {
  events: CalendarEventRecord[];
  /** Plugin installed and beating within PLUGIN_STALE_MS. */
  pluginDetected: boolean;
  /** Whether the plugin's own last Outlook fetch succeeded. */
  outlookState: V4OutlookState;
  /** When the plugin last delivered Outlook data. */
  lastDataAt: number | null;
  /** When the plugin's alarm is scheduled to fire next. */
  nextSyncAt: number | null;
  /** Last heartbeat from the plugin. */
  lastSeenAt: number | null;
  /** Events the plugin itself published, excluding app-recorded ones. */
  pluginEventCount: number;
  /** Re-read event→session links after the app changes one. */
  reloadArchive: () => void;
  /** Plugin's content script answered on this page — installed, even if idle. */
  pluginInstalled: boolean;
  /** Outcome of the most recent manual "Run sync". */
  syncRequestState: V4SyncRequestState;
  syncRequestError: string | null;
  requestSync: () => void;
}

/**
 * Stable identity for an event across sources. Ids differ between the plugin
 * and what the app stored, and `start` formats vary (ISO with 7 decimals,
 * plain ISO, dd/MM/yyyy), so both are normalised.
 */
function identityKey(e: { subject: string; start: string }): string {
  const ms = new Date(e.start).getTime();
  return `${e.subject}|${Number.isFinite(ms) ? ms : e.start}`;
}

function readNumber(key: string): number | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The plugin emits Outlook's own shape; the calendar views want
 * CalendarEventRecord. Anything unparseable yields an empty list rather than
 * throwing — a malformed push must not blank the calendar's chrome.
 */
function mapEvents(raw: string | null): CalendarEventRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && e.id && e.start && e.end)
      .map((e): CalendarEventRecord => ({
        id: String(e.id),
        subject: e.subject || '(senza titolo)',
        start: e.start,
        end: e.end,
        location: e.location || undefined,
        organizer: e.organizer || undefined,
        attendees: Array.isArray(e.attendees) ? e.attendees : undefined,
        onlineMeetingUrl: e.onlineMeetingUrl || undefined,
        body: e.body || undefined,
        responseStatus: e.responseStatus || undefined,
        source: 'extension',
        createdAt: Date.now(),
      }));
  } catch {
    return [];
  }
}

type V4Data = Pick<
  V4CalendarSyncState,
  'events' | 'pluginDetected' | 'outlookState' | 'lastDataAt' | 'nextSyncAt' | 'lastSeenAt'
>;

const EMPTY: V4Data = {
  events: [],
  pluginDetected: false,
  outlookState: 'unknown',
  lastDataAt: null,
  nextSyncAt: null,
  lastSeenAt: null,
};

/**
 * Reads extension-v4's calendar bridge. Memory only: the plugin owns the data
 * and re-pushes it every cycle, so there is nothing to persist here.
 */
export function useV4CalendarSync(): V4CalendarSyncState {
  const [data, setData] = useState<V4Data>(EMPTY);
  const [sessionLinks, setSessionLinks] = useState<Map<string, string>>(() => new Map());
  const [appEvents, setAppEvents] = useState<CalendarEventRecord[]>([]);
  const [pluginInstalled, setPluginInstalled] = useState(false);
  const [syncRequestState, setSyncRequestState] = useState<V4SyncRequestState>('idle');
  const [syncRequestError, setSyncRequestError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number>(0);

  const read = useCallback(() => {
    const extTs = readNumber(K.extTs);
    setData({
      events: mapEvents(localStorage.getItem(K.events)),
      pluginDetected: extTs !== null && Date.now() - extTs < PLUGIN_STALE_MS,
      outlookState: (localStorage.getItem(K.state) as V4OutlookState) || 'unknown',
      lastDataAt: readNumber(K.ts),
      nextSyncAt: readNumber(K.nextSync),
      lastSeenAt: extTs,
    });
  }, []);

  useEffect(() => {
    read();

    const onStorage = (e: StorageEvent) => {
      if (!e.key || !Object.values(K).includes(e.key as typeof K[keyof typeof K])) return;
      read();
    };
    window.addEventListener('storage', onStorage);

    // A plugin that stops beating emits no event, so staleness needs its own tick.
    const poll = setInterval(read, POLL_MS);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, [read]);

  /**
   * The plugin has no notion of recording sessions, but the app already stores
   * event→session links in IndexedDB, plus events recorded in the app itself.
   * Both are invisible to the plugin, so without this the recorded meetings
   * lose their badge and the app-only sessions don't appear at all.
   */
  const loadArchive = useCallback((signal?: { cancelled: boolean }) => {
    db.getAllCalendarEvents()
      .then((stored) => {
        if (signal?.cancelled) return;

        const links = new Map<string, string>();
        for (const e of stored) {
          if (!e.linkedSessionId) continue;
          links.set(e.id, e.linkedSessionId);
          // Start formats differ across sources (ISO with 7 decimals, plain
          // ISO, even dd/MM/yyyy), so the fallback key normalises to epoch.
          links.set(identityKey(e), e.linkedSessionId);
        }
        setSessionLinks(links);

        // Recording history, over the app's full archive rather than the
        // plugin's ±7d: 'app' events exist nowhere else, and anything with a
        // linked session is a past recording the user expects to still find.
        // Plain Outlook events are left out — the plugin already supplies those
        // and re-adding them would duplicate every meeting.
        setAppEvents(stored.filter((e) => e.source === 'app' || !!e.linkedSessionId));
      })
      .catch((err) => {
        loggingService.warn(LOG_EVENT, `Eventi registrati non caricati: ${err?.message || err}`);
      });
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    loadArchive(signal);
    return () => { signal.cancelled = true; };
  }, [loadArchive]);

  // Linking happens in the app, not the plugin, so the archive has to be
  // re-read for the badge to appear without reopening the calendar.
  const reloadArchive = useCallback(() => loadArchive(), [loadArchive]);

  const eventsWithSessions = useMemo(() => {
    const withLinks = sessionLinks.size === 0
      ? data.events
      : data.events.map((e) => {
          const linked = sessionLinks.get(e.id) ?? sessionLinks.get(identityKey(e));
          return linked ? { ...e, linkedSessionId: linked } : e;
        });

    if (appEvents.length === 0) return withLinks;

    // A stored event can be the same meeting the plugin just sent under a
    // different id, so identity falls back to subject + start instant.
    const seenIds = new Set(withLinks.map((e) => e.id));
    const seenKeys = new Set(withLinks.map(identityKey));
    return withLinks.concat(
      appEvents.filter((e) => !seenIds.has(e.id) && !seenKeys.has(identityKey(e)))
    );
  }, [data.events, sessionLinks, appEvents]);

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || !e.data) return;

      if (e.data.type === MSG_PRESENT) {
        setPluginInstalled(true);
        loggingService.info(LOG_EVENT, 'Plugin v4 rilevato sulla pagina');
        return;
      }

      if (e.data.type !== MSG_RESULT) return;
      clearPending();
      setPluginInstalled(true);

      const durationMs = Date.now() - startedAtRef.current;
      if (e.data.ok) {
        setSyncRequestState('ok');
        setSyncRequestError(null);
        loggingService.info(LOG_EVENT, 'Run sync: il plugin ha accettato la richiesta', { durationMs });
      } else {
        const error = e.data.error || 'Errore sconosciuto dal plugin';
        setSyncRequestState('error');
        setSyncRequestError(error);
        loggingService.error(LOG_EVENT, `Run sync fallita: ${error}`, { durationMs });
      }
      read();
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [clearPending, read]);

  useEffect(() => clearPending, [clearPending]);

  const requestSync = useCallback(() => {
    if (timeoutRef.current) return; // already waiting on the plugin

    startedAtRef.current = Date.now();
    setSyncRequestState('requesting');
    setSyncRequestError(null);
    loggingService.info(LOG_EVENT, 'Run sync: richiesta inviata al plugin');

    window.postMessage({ type: MSG_REQUEST }, '*');

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      const error = 'Nessuna risposta dal plugin entro 10s — verifica che sia installato e attivo';
      setSyncRequestState('error');
      setSyncRequestError(error);
      loggingService.error(LOG_EVENT, `Run sync fallita: ${error}`, { timeoutMs: SYNC_TIMEOUT_MS });
    }, SYNC_TIMEOUT_MS);
  }, []);

  return {
    ...data,
    events: eventsWithSessions,
    pluginEventCount: data.events.length,
    reloadArchive,
    pluginInstalled,
    syncRequestState,
    syncRequestError,
    requestSync,
  };
}
