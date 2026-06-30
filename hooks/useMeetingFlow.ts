import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../utils/db';
import { useMeetingNotifications } from './useMeetingNotifications';
import { useMeetingNotificationHistory } from './useMeetingNotificationHistory';
import type { MeetingToastData } from '../utils/meetingUtils';
import type { MeetingNotificationRecord } from '../utils/db';
import type { AppSettings, AudioRecorderRef } from '../types';
import type { OutlookAppointment } from '../components/OutlookCalendarModal';

interface UseMeetingFlowParams {
  calAppointments: OutlookAppointment[];
  appSettings: AppSettings;
  audioRecorderRef: React.RefObject<AudioRecorderRef | null>;
  setIsNewCalendarOpen: (v: boolean) => void;
  handleOutlookImport: (title: string, noteHtml: string, attendees: { name: string; email: string }[]) => void;
}

export interface MeetingFlowState {
  meetingToasts: MeetingToastData[];
  meetingHistory: MeetingNotificationRecord[];
  deleteMeetingHistoryItem: (id: string) => Promise<void>;
  clearAllMeetingHistory: () => Promise<void>;
  handleToastDismiss: (id: string) => void;
  handleToastSnooze: (id: string, minutes: number) => void;
  handleToastOpen: (t: MeetingToastData) => void;
  handleTestMeetingNotification: () => void;
  handleStartSessionForMeeting: (rec: Pick<MeetingNotificationRecord, 'apptId' | 'date'>) => void;
  handleStartSessionFromToast: (toast: MeetingToastData) => void;
  pendingAutoStart: { startMs: number; subject: string } | null;
  autoStartCountdownMs: number | null;
  handleAutoStartNow: () => void;
  handleAutoStartCancel: () => void;
  scheduleAutoStart: (startMs: number, subject: string) => void;
}

export function useMeetingFlow({
  calAppointments, appSettings, audioRecorderRef, setIsNewCalendarOpen, handleOutlookImport,
}: UseMeetingFlowParams): MeetingFlowState {
  const [meetingToasts, setMeetingToasts] = useState<MeetingToastData[]>([]);
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

  const handleMeetingTrigger = useCallback((data: MeetingToastData) => {
    setMeetingToasts(prev => (prev.some(t => t.id === data.id) ? prev : [...prev, data]));
    playMeetingChime();
  }, [playMeetingChime]);

  const handleToastDismiss = useCallback((id: string) => {
    setMeetingToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleToastSnooze = useCallback((id: string, minutes: number) => {
    setMeetingToasts(prev => {
      const t = prev.find(x => x.id === id);
      if (t) {
        const snoozed: MeetingToastData = { ...t, id: `${t.apptId}::snooze::${Date.now()}` };
        window.setTimeout(() => {
          setMeetingToasts(cur => (cur.some(c => c.id === snoozed.id) ? cur : [...cur, snoozed]));
          playMeetingChime();
        }, minutes * 60_000);
      }
      return prev.filter(x => x.id !== id);
    });
  }, [playMeetingChime]);

  const handleToastOpen = useCallback((_t: MeetingToastData) => {
    setIsNewCalendarOpen(true);
  }, [setIsNewCalendarOpen]);

  const handleTestMeetingNotification = useCallback(() => {
    const now = new Date();
    const start = new Date(now.getTime() + 10 * 60_000);
    const fake: MeetingToastData = {
      id: `test::${Date.now()}`,
      apptId: 'test',
      subject: 'Test meeting · review demo',
      organizer: appSettings.appearance?.userEmail || 'you@company.com',
      startIso: start.toISOString(),
      minutesToStart: 10,
      role: 'required',
      summary: 'Questa è una notifica di prova. La call simulata richiede una breve presentazione dei progressi: PREPARA 2-3 slide sullo stato attuale, poi sarà discussione aperta.',
    };
    setMeetingToasts(prev => [...prev, fake]);
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

  const { records: meetingHistory, deleteOne: deleteMeetingHistoryItem, clearAll: clearAllMeetingHistory } = useMeetingNotificationHistory();

  const handleStartSessionForMeeting = useCallback((rec: Pick<MeetingNotificationRecord, 'apptId' | 'date'>) => {
    const u = new URL(window.location.href);
    u.searchParams.set('startMeeting', `${rec.apptId}::${rec.date}`);
    window.open(u.toString(), '_blank', 'noopener');
  }, []);

  const handleStartSessionFromToast = useCallback((toast: MeetingToastData) => {
    const date = toast.startIso ? new Date(toast.startIso) : new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    handleStartSessionForMeeting({ apptId: toast.apptId, date: `${y}-${m}-${d}` });
  }, [handleStartSessionForMeeting]);

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
      const bodyHtml = rec.body
        ? `<p><strong>${rec.subject}</strong></p><p>Organizer: ${rec.organizer}</p>${rec.summary ? `<hr><p>${rec.summary}</p>` : ''}${rec.body ? `<hr><p>${rec.body.replace(/\n/g, '<br>')}</p>` : ''}`
        : `<p><strong>${rec.subject}</strong></p><p>Organizer: ${rec.organizer}</p>`;
      handleOutlookImport(rec.subject, bodyHtml, []);
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
    meetingToasts, meetingHistory, deleteMeetingHistoryItem, clearAllMeetingHistory,
    handleToastDismiss, handleToastSnooze, handleToastOpen,
    handleTestMeetingNotification, handleStartSessionForMeeting, handleStartSessionFromToast,
    pendingAutoStart, autoStartCountdownMs, handleAutoStartNow, handleAutoStartCancel,
    scheduleAutoStart,
  };
}
