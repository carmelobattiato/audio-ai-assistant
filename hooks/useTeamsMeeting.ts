import { useState, useEffect, useCallback } from 'react';
import { TeamsMeetingState } from '@/types';

const STORAGE_KEY     = 'teams-bridge-v1';
const STORAGE_KEY_TS  = 'teams-bridge-v1-ts';
const LIVE_THRESHOLD_MS = 90_000; // considera "live" se aggiornato negli ultimi 90s

const EMPTY: TeamsMeetingState = {
  participants:    [],
  chat:            null,
  callId:          null,
  meetingUrl:      null,
  isSharingScreen: false,
  lastUpdated:     null,
  isLive:          false,
  variant:         null,
  upcomingMeetings: [],
};

function parseFromStorage(): TeamsMeetingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const ts  = Number(localStorage.getItem(STORAGE_KEY_TS) || '0');
    if (!raw) return EMPTY;
    const data = JSON.parse(raw);
    const isLive = !!(data.callId) && (Date.now() - ts) < LIVE_THRESHOLD_MS;
    return {
      participants:    data.participants    ?? [],
      chat:            data.chat            ?? null,
      callId:          data.callId          ?? null,
      meetingUrl:      data.meetingUrl      ?? null,
      isSharingScreen: data.isSharingScreen ?? false,
      lastUpdated:      ts || null,
      isLive,
      variant:          data.variant          ?? null,
      upcomingMeetings: data.upcomingMeetings  ?? [],
    };
  } catch {
    return EMPTY;
  }
}

export function useTeamsMeeting(): TeamsMeetingState {
  const [state, setState] = useState<TeamsMeetingState>(parseFromStorage);

  const refresh = useCallback(() => {
    setState(parseFromStorage());
  }, []);

  useEffect(() => {
    // Ascolta aggiornamenti dal bridge (background.js dispatchEvent StorageEvent)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);

    // Ticker ogni 60s per aggiornare `isLive` anche senza nuovi messaggi
    const interval = setInterval(refresh, 60_000);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(interval);
    };
  }, [refresh]);

  return state;
}
