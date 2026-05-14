import { useEffect, useRef } from 'react';
import type { OutlookAppointment } from '../components/OutlookCalendarModal';
import type { LlmSettings } from '../types';
import { llmService } from '../services/geminiService';
import { computeRole, type MeetingToastData } from '../utils/meetingUtils';
import { htmlToPlainText } from '../utils/textUtils';
import { db, type MeetingNotificationRecord } from '../utils/db';

interface Params {
  appointments: OutlookAppointment[];
  enabled: boolean;
  leadMinutes: number;
  userEmail: string;
  llmSettings: LlmSettings;
  onTrigger: (toast: MeetingToastData) => void;
}

const BC_NAME = 'meeting-notifications-v1';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const SYSTEM_INSTRUCTION =
  "Sei un assistente che prepara l'utente a una riunione imminente. " +
  "In 2-3 frasi italiane: di cosa parla la call e — fondamentale — di' chiaramente se l'utente deve PREPARARE/PRESENTARE qualcosa " +
  "o solo ASCOLTARE/PARTECIPARE. Output: testo puro, niente markdown, niente intestazioni.";

function localDateKey(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Outlook bridge ids are positional (re-numbered on every refresh) so they
// can't be used to dedup across fetches. Derive a stable id from subject +
// start time (normalized) instead.
function meetingStableId(appt: OutlookAppointment): string {
  const subj = (appt.subject || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
  return `${subj}::${appt.start}`;
}

function buildPrompt(appt: OutlookAppointment, role: string): string {
  const attendeeList = (appt.attendees ?? [])
    .map(a => `${a.name || a.email}${a.type === 'optional' ? ' (opzionale)' : ''}`)
    .join(', ');
  const body = (appt.body || '').slice(0, 2000);
  return [
    `Subject: ${appt.subject}`,
    `Organizzatore: ${appt.organizer || 'sconosciuto'}`,
    `Ruolo utente: ${role}`,
    appt.location ? `Luogo: ${appt.location}` : '',
    attendeeList ? `Partecipanti: ${attendeeList}` : '',
    body ? `\nNote/Body:\n${body}` : '',
  ].filter(Boolean).join('\n');
}

function recordToToast(rec: MeetingNotificationRecord): MeetingToastData {
  const startMs = new Date(rec.startIso).getTime();
  const minutesToStart = Math.max(0, Math.round((startMs - Date.now()) / 60_000));
  return {
    id: rec.id,
    apptId: rec.apptId,
    subject: rec.subject,
    organizer: rec.organizer,
    startIso: rec.startIso,
    endIso: rec.endIso,
    minutesToStart,
    role: rec.role,
    summary: rec.summary,
    onlineMeetingUrl: rec.onlineMeetingUrl,
  };
}

export function useMeetingNotifications({
  appointments,
  enabled,
  leadMinutes,
  userEmail,
  llmSettings,
  onTrigger,
}: Params): void {
  const timersRef = useRef<Map<string, number>>(new Map());
  const localFiredRef = useRef<Set<string>>(new Set());
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;
  const bcRef = useRef<BroadcastChannel | null>(null);

  // BroadcastChannel — listen for cross-tab "ready" events so this tab can show
  // the toast immediately when another tab finishes generating the summary.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(BC_NAME);
    bcRef.current = bc;
    bc.onmessage = async (ev: MessageEvent) => {
      const msg = ev.data as { type?: string; id?: string };
      if (msg?.type !== 'ready' || !msg.id) return;
      if (localFiredRef.current.has(msg.id)) return;
      const rec = await db.getMeetingNotification(msg.id);
      if (!rec) return;
      localFiredRef.current.add(msg.id);
      onTriggerRef.current(recordToToast(rec));
    };
    return () => { bc.close(); bcRef.current = null; };
  }, []);

  // Prune expired records once on mount
  useEffect(() => {
    db.pruneExpiredMeetingNotifications().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    timers.forEach(id => window.clearTimeout(id));
    timers.clear();

    if (!enabled) {
      console.info('[meeting-notif] disabled in settings');
      return;
    }

    const leadMs = Math.max(1, leadMinutes) * 60_000;
    const now = Date.now();
    let scheduled = 0;

    for (const appt of appointments) {
      if (appt.isCanceled) continue;
      const startMs = new Date(appt.start).getTime();
      if (!Number.isFinite(startMs)) continue;
      if (startMs <= now) continue;
      const stableId = meetingStableId(appt);
      const recordId = `${stableId}::${localDateKey(appt.start)}`;
      if (localFiredRef.current.has(recordId)) continue;
      const fireAt = startMs - leadMs;
      const delay = Math.max(0, fireAt - now);

      const timerId = window.setTimeout(async () => {
        if (localFiredRef.current.has(recordId)) return;
        localFiredRef.current.add(recordId);
        timers.delete(stableId);

        const role = computeRole(appt, userEmail);
        const seedRecord: MeetingNotificationRecord = {
          id: recordId,
          apptId: stableId,
          date: localDateKey(appt.start),
          subject: appt.subject || '(senza titolo)',
          organizer: appt.organizer || 'sconosciuto',
          startIso: appt.start,
          endIso: appt.end,
          role,
          summary: '',
          generatedAt: 0,
          expiresAt: startMs + ONE_DAY_MS,
          shownAt: Date.now(),
          body: (appt.body || '').slice(0, 4000),
          onlineMeetingUrl: appt.onlineMeetingUrl,
          location: appt.location,
        };

        let claimed = false;
        try {
          claimed = await db.tryClaimMeetingNotification(seedRecord);
        } catch (err) {
          console.warn('[meeting-notif] claim error', err);
        }

        if (claimed) {
          console.info(`[meeting-notif] claimed "${appt.subject}" — generating summary`);
          let summary = '';
          try {
            const { text } = await llmService.generateText(
              buildPrompt(appt, role),
              llmSettings,
              SYSTEM_INSTRUCTION,
            );
            if (text && !text.startsWith('Error:')) {
              summary = htmlToPlainText(text).trim();
            }
          } catch (err) {
            console.warn('[meeting-notif] LLM error', err);
          }
          try {
            await db.updateMeetingNotificationSummary(recordId, summary);
          } catch (err) {
            console.warn('[meeting-notif] DB update error', err);
          }
          const finalRec = (await db.getMeetingNotification(recordId)) ?? { ...seedRecord, summary };
          onTriggerRef.current(recordToToast(finalRec));
          // Notify other tabs to show the same toast
          try { bcRef.current?.postMessage({ type: 'ready', id: recordId }); } catch { /* noop */ }
        } else {
          console.info(`[meeting-notif] "${appt.subject}" already claimed by another tab — waiting for summary`);
          // Another tab is generating: poll DB briefly, fallback to seed if no summary appears
          const start = Date.now();
          let final: MeetingNotificationRecord | undefined;
          while (Date.now() - start < 15_000) {
            // eslint-disable-next-line no-await-in-loop
            final = await db.getMeetingNotification(recordId);
            if (final && (final.summary || final.generatedAt > 0)) break;
            // eslint-disable-next-line no-await-in-loop
            await new Promise<void>(r => window.setTimeout(r, 500));
          }
          onTriggerRef.current(recordToToast(final ?? seedRecord));
        }
      }, delay);

      timers.set(stableId, timerId);
      scheduled++;
      const min = Math.round(delay / 60_000);
      console.info(`[meeting-notif] scheduled "${appt.subject}" in ${min}m (start ${appt.start})`);
    }
    console.info(`[meeting-notif] scheduler armed: ${scheduled}/${appointments.length} appointments, lead=${leadMinutes}m, email=${userEmail || '(none)'}`);

    return () => {
      timers.forEach(id => window.clearTimeout(id));
      timers.clear();
    };
  }, [appointments, enabled, leadMinutes, userEmail, llmSettings]);
}
