import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../utils/db';
import { useMeetingNotifications, meetingStableId } from './useMeetingNotifications';
import { useMeetingNotificationHistory } from './useMeetingNotificationHistory';
import type { MeetingToastData } from '../utils/meetingUtils';
import type { MeetingNotificationRecord } from '../utils/db';
import type { AppSettings, AudioRecorderRef } from '../types';
import type { OutlookAppointment } from '../components/OutlookCalendarModal';
import { buildNoteHtml } from '../utils/calendarNoteUtils';

function normalizeSubject(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
}

function splitApptId(apptId: string): { subj: string; start: string } {
  const idx = apptId.lastIndexOf('::');
  if (idx < 0) return { subj: normalizeSubject(apptId), start: '' };
  return { subj: apptId.slice(0, idx), start: apptId.slice(idx + 2) };
}

interface UseMeetingFlowParams {
  calAppointments: OutlookAppointment[];
  appSettings: AppSettings;
  audioRecorderRef: React.RefObject<AudioRecorderRef | null>;
  setIsNewCalendarOpen: (v: boolean) => void;
  handleOutlookImport: (title: string, noteHtml: string, attendees: { name: string; email: string }[], eventId?: string) => void;
}

export interface MeetingFlowState {
  meetingHistory: MeetingNotificationRecord[];
  activeMeetingIds: Set<string>;
  bellForceOpen: boolean;
  onBellForceOpenHandled: () => void;
  handleActiveItemDismiss: (id: string) => void;
  deleteMeetingHistoryItem: (id: string) => Promise<void>;
  clearAllMeetingHistory: () => Promise<void>;
  handleTestMeetingNotification: () => void;
  handleStartSessionForMeeting: (rec: Pick<MeetingNotificationRecord, 'apptId' | 'date'>) => void;
  pendingAutoStart: { startMs: number; subject: string } | null;
  autoStartCountdownMs: number | null;
  handleAutoStartNow: () => void;
  handleAutoStartCancel: () => void;
  scheduleAutoStart: (startMs: number, subject: string) => void;
}

export function useMeetingFlow({
  calAppointments, appSettings, audioRecorderRef, setIsNewCalendarOpen: _setIsNewCalendarOpen, handleOutlookImport,
}: UseMeetingFlowParams): MeetingFlowState {
  const [activeMeetingIds, setActiveMeetingIds] = useState<Set<string>>(new Set());
  const [bellForceOpen, setBellForceOpen] = useState(false);
  const [pendingAutoStart, setPendingAutoStart] = useState<{ startMs: number; subject: string } | null>(null);
  const [autoStartCountdownMs, setAutoStartCountdownMs] = useState<number | null>(null);

  const pendingAutoStartLoadedRef = useRef(false);
  const autoStartFiredRef = useRef(false);

  const playMeetingChime = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.45);
    } catch { /* audio not available */ }
  }, []);

  // Suono distinto (due toni bassi ripetuti, tipo allarme) per l'alert
  // "riunione finita ma registrazione ancora attiva" — riconoscibile dal chime normale.
  const playOverrunAlert = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [0, 0.35].forEach(offset => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(330, ctx.currentTime + offset);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + offset + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.25);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + offset);
        o.stop(ctx.currentTime + offset + 0.3);
      });
    } catch { /* audio not available */ }
  }, []);

  // Ogni 30s: se una riunione a calendario ha superato l'orario di fine di oltre 5 minuti
  // e la registrazione è ancora attiva, avvisa una sola volta per riunione con un suono diverso.
  const overrunAlertedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const OVERRUN_THRESHOLD_MS = 5 * 60_000;
    const check = () => {
      const sessionId = audioRecorderRef.current?.getRecordingSessionId();
      if (!sessionId) return;
      const now = Date.now();
      for (const appt of calAppointments) {
        if (appt.isCanceled || !appt.end) continue;
        const endMs = new Date(appt.end).getTime();
        if (!Number.isFinite(endMs) || now - endMs < OVERRUN_THRESHOLD_MS) continue;
        const key = meetingStableId(appt);
        if (overrunAlertedRef.current.has(key)) continue;
        overrunAlertedRef.current.add(key);

        const overdueMinutes = Math.round((now - endMs) / 60_000);
        const date = new Date(appt.start).toISOString().slice(0, 10);
        const record: MeetingNotificationRecord = {
          id: `overrun::${key}::${date}`,
          apptId: `${normalizeSubject(appt.subject)}::${appt.start}`,
          date,
          subject: appt.subject,
          organizer: appt.organizer || 'unknown',
          role: 'unknown',
          startIso: appt.start,
          endIso: appt.end,
          generatedAt: now,
          expiresAt: now + 24 * 60 * 60_000,
          summary: `Questa riunione doveva terminare alle ${new Date(appt.end).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} — sono passati ${overdueMinutes} minuti e la registrazione è ancora attiva.`,
          kind: 'overrun',
        };
        db.tryClaimMeetingNotification(record).then((claimed) => {
          if (!claimed) return;
          setActiveMeetingIds(prev => new Set(prev).add(record.id));
          setBellForceOpen(true);
          playOverrunAlert();
        }).catch(() => { /* best-effort */ });
      }
    };
    const interval = window.setInterval(check, 30_000);
    check();
    return () => window.clearInterval(interval);
  }, [calAppointments, audioRecorderRef, playOverrunAlert]);

  const handleMeetingTrigger = useCallback((data: MeetingToastData) => {
    setActiveMeetingIds(prev => {
      if (prev.has(data.id)) return prev;
      const next = new Set(prev);
      next.add(data.id);
      return next;
    });
    setBellForceOpen(true);
    playMeetingChime();
  }, [playMeetingChime]);

  const onBellForceOpenHandled = useCallback(() => {
    setBellForceOpen(false);
  }, []);

  const { records: meetingHistory, deleteOne: deleteMeetingHistoryItem, clearAll: clearAllMeetingHistory } = useMeetingNotificationHistory();

  const handleActiveItemDismiss = useCallback((id: string) => {
    setActiveMeetingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    void deleteMeetingHistoryItem(id);
  }, [deleteMeetingHistoryItem]);

  const handleTestMeetingNotification = useCallback(() => {
    const now = new Date();
    const start = new Date(now.getTime() + 10 * 60_000);
    const id = `test::${Date.now()}`;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const seedRecord: MeetingNotificationRecord = {
      id,
      apptId: 'test',
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      subject: 'Test meeting · review demo',
      organizer: appSettings.appearance?.userEmail || 'you@company.com',
      startIso: start.toISOString(),
      endIso: new Date(start.getTime() + 30 * 60_000).toISOString(),
      role: 'required',
      summary: 'Questa è una notifica di prova. La call simulata richiede una breve presentazione dei progressi: PREPARA 2-3 slide sullo stato attuale, poi sarà discussione aperta.',
      generatedAt: Date.now(),
      expiresAt: Date.now() + ONE_DAY_MS,
      shownAt: Date.now(),
    };
    db.tryClaimMeetingNotification(seedRecord).catch(() => undefined);
    setActiveMeetingIds(prev => { const next = new Set(prev); next.add(id); return next; });
    setBellForceOpen(true);
    playMeetingChime();
  }, [appSettings.appearance, playMeetingChime]);

  useMeetingNotifications({
    appointments: calAppointments,
    enabled: appSettings.appearance?.meetingNotificationsEnabled ?? true,
    leadMinutes: appSettings.appearance?.meetingNotificationLeadMinutes ?? 10,
    userEmail: appSettings.appearance?.userEmail ?? '',
    llmSettings: appSettings.llm,
    onTrigger: handleMeetingTrigger,
  });

  const handleStartSessionForMeeting = useCallback((rec: Pick<MeetingNotificationRecord, 'apptId' | 'date'>) => {
    const u = new URL(window.location.href);
    u.searchParams.set('startMeeting', `${rec.apptId}::${rec.date}`);
    window.open(u.toString(), '_blank', 'noopener');
  }, []);

  // URL param: ?startMeeting=<recordId> — auto-load meeting context + countdown
  useEffect(() => {
    if (pendingAutoStartLoadedRef.current) return;
    pendingAutoStartLoadedRef.current = true;
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get('startMeeting');
    if (!id) return;
    (async () => {
      const rec = await db.getMeetingNotification(id);
      if (!rec) {
        console.warn('[auto-start] meeting record not found for', id);
        return;
      }
      // Preferisci l'evento reale del calendario (stesso builder/dati del path Calendario).
      // rec.apptId = meetingStableId(subject, start) al momento della notifica; per il match
      // usiamo subject normalizzato + start tollerante, non uguaglianza stretta di stringa,
      // perché CalendarEventRecord.id è generato da una funzione diversa (EntryID/subject|start).
      const { subj: wantedSubj, start: wantedStart } = splitApptId(rec.apptId);
      const wantedStartMs = wantedStart ? new Date(wantedStart).getTime() : NaN;
      const isMatch = (subject: string, start: string) =>
        normalizeSubject(subject) === wantedSubj &&
        (Number.isNaN(wantedStartMs) || Math.abs(new Date(start).getTime() - wantedStartMs) < 5 * 60 * 1000);

      // 1) IndexedDB locale (calendarEvents), disponibile subito anche in una tab appena aperta
      const dbEvents = await db.getAllCalendarEvents().catch(() => []);
      let matchedEvent: { subject: string; start: string; end: string; location?: string; organizer?: string; attendees?: { name: string; email: string }[]; body?: string; onlineMeetingUrl?: string; id: string } | undefined =
        dbEvents.find(e => isMatch(e.subject, e.start));

      // 2) Fallback: calAppointments live (in caso non sia mai avvenuta una sync)
      if (!matchedEvent) {
        const matchedAppt = calAppointments.find(apt => isMatch(apt.subject, apt.start));
        if (matchedAppt) matchedEvent = matchedAppt;
      }

      const noteHtml = matchedEvent
        ? buildNoteHtml(matchedEvent)
        : (rec.body
          ? `<p><strong>${rec.subject}</strong></p><p>Organizer: ${rec.organizer}</p>${rec.summary ? `<hr><p>${rec.summary}</p>` : ''}${rec.body ? `<hr><p>${rec.body.replace(/\n/g, '<br>')}</p>` : ''}`
          : `<p><strong>${rec.subject}</strong></p><p>Organizer: ${rec.organizer}</p>`);
      handleOutlookImport(rec.subject, noteHtml, matchedEvent?.attendees ?? [], matchedEvent?.id ?? rec.apptId);
      setPendingAutoStart({ startMs: new Date(rec.startIso).getTime(), subject: rec.subject });
      console.info('[auto-start] loaded meeting "%s", auto-record at %s', rec.subject, rec.startIso);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally fires once on mount

  // Countdown banner recomputed each second
  useEffect(() => {
    if (!pendingAutoStart) { setAutoStartCountdownMs(null); return; }
    const tick = () => setAutoStartCountdownMs(pendingAutoStart.startMs - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [pendingAutoStart]);

  // Trigger recording at meeting start time
  useEffect(() => {
    if (!pendingAutoStart) return;
    if (autoStartFiredRef.current) return;
    const delay = Math.max(0, pendingAutoStart.startMs - Date.now());
    const id = window.setTimeout(() => {
      if (autoStartFiredRef.current) return;
      autoStartFiredRef.current = true;
      try {
        audioRecorderRef.current?.startMicOnly?.();
      } catch (err) {
        console.warn('[auto-start] startMicOnly failed', err);
      }
    }, delay);
    return () => window.clearTimeout(id);
  }, [pendingAutoStart, audioRecorderRef]);

  const handleAutoStartNow = useCallback(() => {
    if (autoStartFiredRef.current) return;
    autoStartFiredRef.current = true;
    try { audioRecorderRef.current?.startMicOnly?.(); } catch { /* noop */ }
    setPendingAutoStart(null);
  }, [audioRecorderRef]);

  const handleAutoStartCancel = useCallback(() => {
    setPendingAutoStart(null);
    autoStartFiredRef.current = true;
  }, []);

  const scheduleAutoStart = useCallback((startMs: number, subject: string) => {
    autoStartFiredRef.current = false;
    setPendingAutoStart({ startMs, subject });
  }, []);

  return {
    meetingHistory, activeMeetingIds, bellForceOpen, onBellForceOpenHandled,
    handleActiveItemDismiss,
    deleteMeetingHistoryItem, clearAllMeetingHistory,
    handleTestMeetingNotification, handleStartSessionForMeeting,
    pendingAutoStart, autoStartCountdownMs, handleAutoStartNow, handleAutoStartCancel,
    scheduleAutoStart,
  };
}
