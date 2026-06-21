import { useState, useEffect } from 'react';
import type { CalendarEventRecord } from '@/types';

const LS_KEY    = 'cal-bridge-v2';
const LS_TS_KEY = 'cal-bridge-v2-ts';
const STALE_MS  = 5 * 60 * 1000; // 5 min — extension deve aver scritto entro 5 min

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

function readStorage(): { events: CalendarEventRecord[]; connected: boolean; ts: number | null } {
  const tsStr = localStorage.getItem(LS_TS_KEY);
  const ts    = tsStr ? parseInt(tsStr, 10) : 0;
  const connected = !!(ts && (Date.now() - ts) < STALE_MS);
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return { events: [], connected, ts: ts || null };
  try {
    const parsed: BridgeEvent[] = JSON.parse(raw);
    return { events: Array.isArray(parsed) ? parsed.map(toRecord) : [], connected, ts };
  } catch {
    return { events: [], connected, ts };
  }
}

export function useCalBridgeV2() {
  const [state, setState] = useState(() => readStorage());

  useEffect(() => {
    const poll = setInterval(() => setState(readStorage()), 10_000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY || e.key === LS_TS_KEY) setState(readStorage());
    };
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(poll); window.removeEventListener('storage', onStorage); };
  }, []);

  return {
    events:    state.events,
    connected: state.connected,
    lastSyncTs:state.ts,
  };
}
