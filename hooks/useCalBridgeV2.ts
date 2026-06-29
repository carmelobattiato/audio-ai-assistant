import { useState, useEffect } from 'react';
import type { CalendarEventRecord } from '@/types';

const LS_KEY           = 'cal-bridge-v2';
const LS_TS_KEY        = 'cal-bridge-v2-ts';
const LS_EXT_TS_KEY    = 'cal-bridge-v2-ext-ts';
const LS_OUTLOOK_STATE = 'cal-bridge-v2-outlook-state';
const STALE_EXT_MS     = 5 * 60 * 1000;  // 5 min — extension heartbeat
const STALE_DATA_MS    = 15 * 60 * 1000; // 15 min — dati outlook

export type OutlookState = 'ok' | 'error' | 'fetching' | 'idle' | 'unknown';

interface BridgeEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  isAllDay: boolean;
  isMeeting: boolean;
  isCancelled: boolean;
  organizer: string;
  location: string;
  onlineMeetingUrl: string | null;
  attendees?: Array<{ name: string; email: string; type?: 'required' | 'optional' }>;
  body?: string;
}

function toRecord(e: BridgeEvent): CalendarEventRecord {
  return {
    id:              e.id,
    subject:         e.subject,
    start:           e.start,
    end:             e.end,
    location:        e.location || undefined,
    organizer:       e.organizer || undefined,
    attendees:       e.attendees,
    onlineMeetingUrl:e.onlineMeetingUrl || undefined,
    body:            e.body || undefined,
    source:          'extension',
    createdAt:       Date.now(),
  };
}

interface BridgeState {
  events: CalendarEventRecord[];
  /** Extension wrote to localStorage within STALE_EXT_MS */
  extensionOnline: boolean;
  /** Last Outlook state reported by extension */
  outlookState: OutlookState;
  ts: number | null;
}

function readStorage(): BridgeState {
  // Prefer new key (extension >= v2.12); fallback to data ts for old extension (v2.11)
  const extTsRaw  = localStorage.getItem(LS_EXT_TS_KEY) ?? localStorage.getItem(LS_TS_KEY);
  const extTs     = extTsRaw ? parseInt(extTsRaw, 10) : 0;
  const extensionOnline = !!(extTs && (Date.now() - extTs) < STALE_EXT_MS);

  const dataTsStr = localStorage.getItem(LS_TS_KEY);
  const dataTs    = dataTsStr ? parseInt(dataTsStr, 10) : 0;

  const rawState  = localStorage.getItem(LS_OUTLOOK_STATE) as OutlookState | null;
  let outlookState: OutlookState;
  if (rawState) {
    // New extension: explicit state written by background.js
    outlookState = rawState;
    if (extensionOnline && dataTs && (Date.now() - dataTs) > STALE_DATA_MS && outlookState === 'ok') {
      outlookState = 'idle';
    }
  } else {
    // Old extension (no state key): infer from data freshness
    if (!extensionOnline) outlookState = 'unknown';
    else if (dataTs && (Date.now() - dataTs) < STALE_DATA_MS) outlookState = 'ok';
    else outlookState = 'idle';
  }

  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return { events: [], extensionOnline, outlookState, ts: dataTs || null };
  try {
    const parsed: BridgeEvent[] = JSON.parse(raw);
    return { events: Array.isArray(parsed) ? parsed.map(toRecord) : [], extensionOnline, outlookState, ts: dataTs || null };
  } catch {
    return { events: [], extensionOnline, outlookState, ts: dataTs || null };
  }
}

export function useCalBridgeV2() {
  const [state, setState] = useState(() => readStorage());

  useEffect(() => {
    const poll = setInterval(() => setState(readStorage()), 10_000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY || e.key === LS_TS_KEY || e.key === LS_EXT_TS_KEY || e.key === LS_OUTLOOK_STATE) {
        setState(readStorage());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(poll); window.removeEventListener('storage', onStorage); };
  }, []);

  return {
    events:         state.events,
    extensionOnline:state.extensionOnline,
    outlookState:   state.outlookState,
    lastSyncTs:     state.ts,
  };
}
