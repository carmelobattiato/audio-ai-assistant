import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Attendee, OutlookAppointment } from '../OutlookCalendarModal';
import { loggingService } from '@/services/loggingService';

// ─── Constants ─────────────────────────────────────────────────────────────────
const HOUR_PX    = 80;
const START_HOUR = 0;
const END_HOUR   = 24;
const HOURS      = END_HOUR - START_HOUR;
const MAX_COLS   = 10;
const TIME_COL_W = 52;
const OUTLOOK_API = '/api/outlook';

function clientOSName(): string {
  const p = navigator.platform.toLowerCase();
  if (p.startsWith('win')) return 'Windows';
  if (p.startsWith('mac')) return 'macOS';
  if (p.startsWith('linux')) return 'Linux';
  return navigator.platform || 'Unknown OS';
}

// ─── View type ─────────────────────────────────────────────────────────────────
type View = 'calendar' | 'list';

// ─── Helpers ───────────────────────────────────────────────────────────────────
function toMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function toPx(minutes: number): number {
  return (minutes / 60) * HOUR_PX;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Open Teams desktop app directly via the msteams:// protocol.
 * This avoids Chrome opening a new browser window/tab with the Teams web client.
 * On Windows with Teams installed, the OS protocol handler intercepts msteams:// and
 * opens the desktop app without navigating the current page.
 */
function openTeamsLink(url: string): void {
  const msteamsUrl = url.replace(/^https:\/\/teams\.microsoft\.com/, 'msteams://teams.microsoft.com');
  const a = document.createElement('a');
  a.href = msteamsUrl;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

type Status = 'live' | 'next' | 'future' | 'past';

function getStatus(appt: OutlookAppointment, now: Date, nextId: string | null): Status {
  const s = new Date(appt.start), e = new Date(appt.end);
  if (now >= s && now <= e) return 'live';
  if (appt.id === nextId)   return 'next';
  if (e < now)              return 'past';
  return 'future';
}

const STATUS_COLOR: Record<Status, { bg: string; border: string; text: string; dot: string }> = {
  live:   { bg: 'rgba(16,185,129,0.22)',  border: '#10B981', text: '#6EE7B7', dot: '#10B981' },
  next:   { bg: 'rgba(245,158,11,0.18)',  border: '#F59E0B', text: '#FCD34D', dot: '#F59E0B' },
  future: { bg: 'rgba(124,58,237,0.18)', border: '#7C3AED', text: '#C4B5FD', dot: '#8B5CF6' },
  past:   { bg: 'rgba(75,85,99,0.15)',    border: '#4B5563', text: '#9CA3AF', dot: '#6B7280' },
};

// ─── Layout algorithm (connected-component grouping) ──────────────────────────
interface LayoutItem {
  appt: OutlookAppointment;
  col: number;
  span: number;
}

function doOverlap(a: OutlookAppointment, b: OutlookAppointment): boolean {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(a.end) > toMinutes(b.start);
}

function computeLayout(appointments: OutlookAppointment[]): LayoutItem[] {
  if (!appointments.length) return [];

  const sorted = [...appointments].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  // Step 1: find connected components via BFS
  const visited = new Set<string>();
  const components: OutlookAppointment[][] = [];

  for (const appt of sorted) {
    if (visited.has(appt.id)) continue;
    const comp: OutlookAppointment[] = [];
    const queue: OutlookAppointment[] = [appt];
    while (queue.length) {
      const curr = queue.shift()!;
      if (visited.has(curr.id)) continue;
      visited.add(curr.id);
      comp.push(curr);
      for (const other of sorted) {
        if (!visited.has(other.id) && doOverlap(curr, other)) queue.push(other);
      }
    }
    components.push(comp);
  }

  // Step 2: greedy column assignment within each component
  const result: LayoutItem[] = [];

  for (const comp of components) {
    const cs = [...comp].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
    const colEnds: number[] = [];
    const colMap = new Map<string, number>();

    for (const appt of cs) {
      const s = toMinutes(appt.start);
      let col = colEnds.findIndex(end => end <= s);
      if (col === -1) col = colEnds.length;
      colEnds[col] = toMinutes(appt.end);
      colMap.set(appt.id, col);
    }

    // All appointments in the component share the same span for consistent widths
    const span = Math.min(MAX_COLS, colEnds.length);

    for (const appt of comp) {
      result.push({ appt, col: Math.min(colMap.get(appt.id)!, span - 1), span });
    }
  }

  return result;
}

// ─── Note HTML ────────────────────────────────────────────────────────────────
function buildNoteHtml(appt: OutlookAppointment): string {
  const attendeesList = appt.attendees.length > 0
    ? appt.attendees.map(a => `<li>${a.name}${a.email ? ` &lt;${a.email}&gt;` : ''}</li>`).join('')
    : '<li><em>Nessun invitato trovato</em></li>';
  return `<div>
    <h3 style="color:#38bdf8;margin:0 0 10px">📅 ${appt.subject}</h3>
    <p style="margin:4px 0"><strong>🕐 Inizio:</strong> ${appt.start}</p>
    <p style="margin:4px 0"><strong>🕑 Fine:</strong> ${appt.end}</p>
    ${appt.location ? `<p style="margin:4px 0"><strong>📍 Luogo:</strong> ${appt.location}</p>` : ''}
    ${appt.organizer ? `<p style="margin:4px 0"><strong>👤 Organizzatore:</strong> ${appt.organizer}</p>` : ''}
    <p style="margin:10px 0 4px"><strong>👥 Invitati:</strong></p>
    <ul style="margin:0 0 0 18px;padding:0">${attendeesList}</ul>
    ${appt.body ? `<p style="margin:14px 0 4px"><strong>📝 Note riunione:</strong></p><p style="margin:0;white-space:pre-wrap;color:#9CA3AF">${appt.body}</p>` : ''}
  </div>`;
}

function extractTeamsUrl(appt: OutlookAppointment): string | null {
  if (appt.onlineMeetingUrl) return appt.onlineMeetingUrl;
  const match = appt.body?.match(/https:\/\/teams\.microsoft\.com\/l\/[^\s<>"']+/);
  return match?.[0] ?? null;
}

// ─── Response Status Badge ────────────────────────────────────────────────────
const RESPONSE_CFG: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  accepted:    { label: 'Accepted',  bg: 'rgba(16,185,129,0.15)',  color: '#6EE7B7', icon: '✓' },
  tentative:   { label: 'Tentative', bg: 'rgba(245,158,11,0.15)',  color: '#FCD34D', icon: '~' },
  organizer:   { label: 'Organizer', bg: 'rgba(124,58,237,0.2)',   color: '#C4B5FD', icon: '★' },
  declined:    { label: 'Declined',  bg: 'rgba(239,68,68,0.15)',   color: '#FCA5A5', icon: '✗' },
};

const ResponseBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status || status === 'none' || status === 'notResponded') return null;
  const cfg = RESPONSE_CFG[status];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ─── Show Info modal ──────────────────────────────────────────────────────────
const ApptInfoModal: React.FC<{
  appt: OutlookAppointment;
  onClose: () => void;
  onLoadInfo: () => void;
  onTeams?: () => void;
}> = ({ appt, onClose, onLoadInfo, onTeams }) => {
  const teamsUrl = extractTeamsUrl(appt);
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-[60]"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          width: 760, maxWidth: '95vw', maxHeight: '88vh',
          background: 'var(--neo-surface-solid, #0F0B2E)',
          border: '1px solid var(--neo-border)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(139,92,246,0.3)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-start justify-between gap-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--neo-border)', background: 'rgba(124,58,237,0.1)' }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold leading-snug" style={{ color: 'var(--neo-text)' }}>
                {appt.subject}
              </h3>
              <ResponseBadge status={appt.responseStatus} />
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--neo-muted)' }}>
              {fmtFull(appt.start)} → {fmt(appt.end)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg flex-shrink-0"
            style={{ color: 'var(--neo-muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--neo-border)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ scrollbarWidth: 'thin' }}>
          {/* Meta row */}
          <div className="flex flex-wrap gap-2">
            {appt.location && (
              <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#C4B5FD' }}>
                📍 {appt.location}
              </div>
            )}
            {appt.organizer && (
              <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#C4B5FD' }}>
                👤 {appt.organizer}
              </div>
            )}
            {teamsUrl && (
              <button
                onClick={() => openTeamsLink(teamsUrl)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#A5B4FC', cursor: 'pointer' }}>
                🔗 Link Teams
              </button>
            )}
          </div>

          {/* Attendees */}
          {appt.attendees.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--neo-muted)' }}>
                Partecipanti ({appt.attendees.length})
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {appt.attendees.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.1)' }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: 'rgba(124,58,237,0.25)', color: '#A78BFA' }}>
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--neo-text)' }}>{a.name}</p>
                      {a.email && <p className="text-[10px] truncate" style={{ color: 'var(--neo-muted)' }}>{a.email}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body text */}
          {appt.body && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--neo-muted)' }}>Note riunione</p>
              <div className="text-xs leading-relaxed rounded-xl p-3 max-h-48 overflow-y-auto whitespace-pre-wrap"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(139,92,246,0.1)',
                  color: '#9CA3AF', scrollbarWidth: 'thin',
                }}>
                {appt.body}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex gap-2 justify-end flex-shrink-0"
          style={{ borderTop: '1px solid var(--neo-border)', background: 'rgba(124,58,237,0.04)' }}>
          {onTeams && teamsUrl && (
            <button onClick={onTeams}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105"
              style={{ background: 'rgba(124,58,237,0.3)', border: '1px solid rgba(139,92,246,0.5)', color: '#C4B5FD' }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.847v6.306a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
              Teams + Rec
            </button>
          )}
          <button onClick={onLoadInfo}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg,#7C3AED,#C026D3)', color: 'white' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Load Info
          </button>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium"
            style={{ color: 'var(--neo-muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--neo-border)' }}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface NeoCalendarDayViewProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (title: string, noteHtml: string, attendees: Attendee[]) => void;
  onOpenTeamsAndRecord?: (title: string, noteHtml: string, teamsUrl: string, attendees: Attendee[]) => void;
  externalAppointments?: OutlookAppointment[];
  externalBridgeAvailable?: boolean | null;
  externalError?: string | null;
  isBackgroundRefreshing?: boolean;
  onRequestRefresh?: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────
export const NeoCalendarDayView: React.FC<NeoCalendarDayViewProps> = ({
  isOpen, onClose, onImport, onOpenTeamsAndRecord,
  externalAppointments, externalBridgeAvailable, externalError,
  isBackgroundRefreshing = false, onRequestRefresh,
}) => {
  const isExternal = externalAppointments !== undefined;

  const [view, setView]             = useState<View>('calendar');
  const [intAppts, setIntAppts]     = useState<OutlookAppointment[]>([]);
  const [intLoading, setIntLoading] = useState(false);
  const [intBridge, setIntBridge]   = useState<boolean | null>(null);
  const [intError, setIntError]     = useState<string | null>(null);
  const [selected, setSelected]     = useState<OutlookAppointment | null>(null);
  const [infoAppt, setInfoAppt]     = useState<OutlookAppointment | null>(null);
  const [now, setNow]               = useState(new Date());

  const appointments    = isExternal ? (externalAppointments ?? []) : intAppts;
  const loading         = isExternal ? false : intLoading;
  const bridgeAvailable = isExternal ? (externalBridgeAvailable ?? null) : intBridge;
  const errorMsg        = isExternal ? (externalError ?? null) : intError;

  const calScrollRef      = useRef<HTMLDivElement>(null);
  const listScrollRef     = useRef<HTMLDivElement>(null);
  const firstHighlightRef = useRef<HTMLDivElement | null>(null);

  // Reset state on open — always default to Calendar view
  useEffect(() => {
    if (isOpen) {
      setView('calendar');
      setSelected(null);
      setInfoAppt(null);
    }
  }, [isOpen]);

  // Clock tick — every second for accurate red-line position and live clock
  useEffect(() => {
    if (!isOpen) return;
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isOpen]);

  // Internal fetch
  const fetchAppts = useCallback(async (isRetry = false) => {
    setIntLoading(true); setIntError(null); setIntBridge(null);
    if (isRetry) {
      loggingService.info('CALENDAR_RETRY', 'User triggered calendar data retry', {
        platform: navigator.platform,
      });
    }
    try {
      const st = await fetch(`${OUTLOOK_API}/status`, { signal: AbortSignal.timeout(3000) });
      if (!st.ok) {
        const reason = `Outlook Bridge unreachable (HTTP ${st.status})`;
        loggingService.warn('CALENDAR_BRIDGE_ERROR', reason, { httpStatus: st.status, isRetry, platform: navigator.platform });
        loggingService.debug('CALENDAR_BRIDGE_ERROR_DETAIL', 'Status endpoint returned non-OK response', {
          url: `${OUTLOOK_API}/status`, httpStatus: st.status, isRetry, platform: navigator.platform,
        });
        throw new Error(reason);
      }
      const sd = await st.json();
      if (sd.status !== 'ok') {
        const serverPlatform: string = sd.platform ?? '';
        const isNonWindows = serverPlatform !== '' && serverPlatform !== 'win32';
        const reason = isNonWindows
          ? `Outlook Bridge is not available on ${clientOSName()}. This feature requires Windows.`
          : (sd.message ?? 'Outlook Bridge unavailable');
        loggingService.warn('CALENDAR_BRIDGE_ERROR', reason, { serverPlatform, isNonWindows, isRetry, bridgeStatus: sd.status });
        loggingService.debug('CALENDAR_BRIDGE_ERROR_DETAIL', 'Bridge status check failed', {
          statusData: sd, serverPlatform, isNonWindows, isRetry, clientPlatform: navigator.platform,
        });
        throw new Error(reason);
      }
      setIntBridge(true);
      const r = await fetch(`${OUTLOOK_API}/appointments/today`);
      const d = await r.json();
      if (d.error) {
        loggingService.warn('CALENDAR_APPOINTMENTS_ERROR', d.error, { isRetry });
        loggingService.debug('CALENDAR_APPOINTMENTS_ERROR_DETAIL', 'Appointments endpoint returned error', { data: d, isRetry });
        throw new Error(d.error);
      }
      const apptList = d.appointments ?? [];
      const skippedList = d.skipped ?? [];
      setIntAppts(apptList);
      loggingService.debug('CALENDAR_LOADED', `Loaded ${apptList.length} appointments (seen ${d.totalSeen ?? '?'}, skipped ${skippedList.length}) in ${d.timings?.total ?? '?'}ms`, {
        count: apptList.length,
        skippedCount: skippedList.length,
        totalSeen: d.totalSeen,
        filter: d.filter,
        timings: d.timings,
        canceledCount: apptList.filter((a: any) => a.isCanceled).length,
        recurringCount: apptList.filter((a: any) => a.isRecurring).length,
        isRetry,
      });
      if (skippedList.length > 0) {
        loggingService.warn('CALENDAR_SKIPPED', `${skippedList.length} appointments skipped by bridge`, { skipped: skippedList });
      }
      // Per-appointment detail to spot meetings hidden by overlap or unexpected fields
      loggingService.debug('CALENDAR_APPOINTMENTS_DETAIL', 'Appointment summary', {
        appointments: apptList.map((a: any) => ({
          id: a.id, subject: a.subject, start: a.start, end: a.end,
          organizer: a.organizer, responseStatus: a.responseStatus,
          meetingStatus: a.meetingStatus, isCanceled: a.isCanceled, isRecurring: a.isRecurring,
          hasTeamsUrl: !!a.onlineMeetingUrl, attendees: a.attendees?.length ?? 0,
        })),
      });
    } catch (e: unknown) {
      setIntBridge(false);
      setIntError((e as Error).message ?? 'Connection error');
    } finally { setIntLoading(false); }
  }, []);

  useEffect(() => {
    if (isOpen && !isExternal) fetchAppts();
  }, [isOpen, isExternal, fetchAppts]);

  // Auto-scroll calendar view to center current time
  useEffect(() => {
    if (!isOpen || view !== 'calendar' || !calScrollRef.current) return;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const viewportH = calScrollRef.current.clientHeight;
    calScrollRef.current.scrollTop = Math.max(0, toPx(nowMin) - viewportH / 2);
  }, [isOpen, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll list view to first live/next meeting
  useEffect(() => {
    if (!isOpen || view !== 'list' || appointments.length === 0) return;
    const id = setTimeout(() => {
      firstHighlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 120);
    return () => clearTimeout(id);
  }, [isOpen, view, appointments]);

  const layout   = computeLayout(appointments);
  const nextId   = appointments
    .filter(a => new Date(a.start) > now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0]?.id ?? null;
  const nowMin   = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const nowPx    = toPx(nowMin);
  const liveCount = appointments.filter(a => getStatus(a, now, nextId) === 'live').length;

  const firstHighlightId = appointments.find(a => {
    const s = getStatus(a, now, nextId);
    return s === 'live' || s === 'next';
  })?.id ?? null;

  const refresh = isExternal ? onRequestRefresh : () => fetchAppts(true);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 flex items-center justify-center p-4 z-50"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{
            width: 1000, maxWidth: '96vw', height: '88vh',
            background: 'var(--neo-surface-solid, #0F0B2E)',
            border: '1px solid var(--neo-border)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.2)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--neo-border)', background: 'rgba(124,58,237,0.08)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(139,92,246,0.4)' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#A78BFA" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--neo-text)' }}>Today's Calendar</h2>
                <p className="text-[11px]" style={{ color: 'var(--neo-muted)' }}>
                  {now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {appointments.length > 0 && ` · ${appointments.length} riunion${appointments.length === 1 ? 'e' : 'i'}`}
                  {liveCount > 0 && ` · ${liveCount} live`}
                </p>
              </div>
              {isBackgroundRefreshing && (
                <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {/* Live clock — centered */}
            <div className="flex flex-col items-center select-none" title="Ora corrente">
              <span
                className="font-mono font-bold tracking-tight tabular-nums"
                style={{ fontSize: '1.45rem', lineHeight: 1, color: '#C4B5FD' }}
              >
                {now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="text-[10px] mt-0.5 font-medium uppercase tracking-widest" style={{ color: 'var(--neo-muted)' }}>
                ora corrente
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* View tab switcher */}
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--neo-border)' }}>
                <button
                  onClick={() => setView('calendar')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all"
                  style={view === 'calendar'
                    ? { background: 'rgba(124,58,237,0.35)', color: '#C4B5FD', borderRight: '1px solid var(--neo-border)' }
                    : { background: 'transparent', color: 'var(--neo-muted)', borderRight: '1px solid var(--neo-border)' }
                  }
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" />
                    <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" />
                    <line x1="3" y1="10" x2="21" y2="10" strokeLinecap="round" />
                  </svg>
                  Calendar
                </button>
                <button
                  onClick={() => setView('list')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all"
                  style={view === 'list'
                    ? { background: 'rgba(124,58,237,0.35)', color: '#C4B5FD' }
                    : { background: 'transparent', color: 'var(--neo-muted)' }
                  }
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  List
                </button>
              </div>

              {/* Refresh */}
              <button onClick={refresh} className="p-1.5 rounded-lg" title="Aggiorna"
                style={{ color: 'var(--neo-muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--neo-border)' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              {/* Close */}
              <button onClick={onClose} className="p-1.5 rounded-lg"
                style={{ color: 'var(--neo-muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--neo-border)' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Body ─────────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {loading || (isBackgroundRefreshing && bridgeAvailable === null && appointments.length === 0) ? (
              <div className="flex-1 flex items-center justify-center gap-3" style={{ color: 'var(--neo-muted)' }}>
                <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Caricamento calendario…</span>
              </div>
            ) : errorMsg || bridgeAvailable === false ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="text-3xl">📅</div>
                <p className="text-sm font-medium" style={{ color: 'var(--neo-text)' }}>Outlook Bridge unavailable</p>
                <p className="text-xs max-w-xs" style={{ color: 'var(--neo-muted)' }}>
                  {errorMsg ?? 'Start the Outlook bridge and try again.'}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--neo-muted)', opacity: 0.6 }}>
                  OS: {clientOSName()} ({navigator.platform})
                </p>
                <button onClick={refresh}
                  className="mt-2 px-4 py-2 text-xs font-medium rounded-lg transition-all hover:scale-105"
                  style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: '#A78BFA' }}>
                  Retry
                </button>
              </div>
            ) : appointments.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center">
                <div className="text-3xl">🎉</div>
                <p className="text-sm font-medium" style={{ color: 'var(--neo-text)' }}>Nessuna riunione oggi</p>
                <p className="text-xs" style={{ color: 'var(--neo-muted)' }}>Hai la giornata libera!</p>
              </div>
            ) : view === 'calendar' ? (

              /* ── Calendar (day grid) view ──────────────────────────────────── */
              <div ref={calScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'thin' }}>
                <div className="flex" style={{ minHeight: HOURS * HOUR_PX + 32, paddingBottom: 16 }}>
                  {/* Time labels */}
                  <div className="flex-shrink-0 relative select-none" style={{ width: TIME_COL_W }}>
                    {Array.from({ length: HOURS + 1 }, (_, i) => (
                      <div key={i} className="absolute right-3 text-[11px] font-mono"
                        style={{ top: i * HOUR_PX - 7, color: 'var(--neo-muted)', lineHeight: 1 }}>
                        {String(START_HOUR + i).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>

                  {/* Grid area */}
                  <div className="flex-1 relative" style={{ minWidth: 0 }}>
                    {/* Hour lines */}
                    {Array.from({ length: HOURS + 1 }, (_, i) => (
                      <div key={`h${i}`} className="absolute left-0 right-0"
                        style={{ top: i * HOUR_PX, height: 1, background: 'rgba(139,92,246,0.2)' }} />
                    ))}
                    {/* 30-min dashed lines */}
                    {Array.from({ length: HOURS }, (_, i) => (
                      <div key={`hh${i}`} className="absolute left-0 right-0"
                        style={{ top: i * HOUR_PX + HOUR_PX / 2, height: 1, borderTop: '1px dashed rgba(139,92,246,0.12)' }} />
                    ))}
                    {/* Current time indicator */}
                    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: nowPx }}>
                      <div className="relative flex items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] -ml-1.5 flex-shrink-0" />
                        <div className="flex-1" style={{ height: 2, background: 'rgba(239,68,68,0.7)' }} />
                      </div>
                    </div>

                    {/* Appointment rectangles */}
                    {layout.map(({ appt, col, span }) => {
                      const status   = getStatus(appt, now, nextId);
                      const c        = STATUS_COLOR[status];
                      const topPx    = toPx(toMinutes(appt.start));
                      const heightPx = Math.max(22, toPx(toMinutes(appt.end)) - topPx);
                      const widthPct = 100 / span;
                      const leftPct  = (col / span) * 100;
                      const isSel    = selected?.id === appt.id;
                      return (
                        <div
                          key={appt.id}
                          onClick={() => setSelected(isSel ? null : appt)}
                          className="absolute cursor-pointer rounded-lg overflow-hidden transition-all duration-150"
                          style={{
                            top: topPx + 1, height: heightPx - 2,
                            left: `calc(${leftPct}% + 3px)`, width: `calc(${widthPct}% - 6px)`,
                            background: c.bg, border: `1.5px solid ${c.border}`,
                            boxShadow: isSel ? `0 0 0 2px ${c.border}, 0 4px 16px rgba(0,0,0,0.3)` : status === 'live' ? `0 0 12px ${c.dot}44` : 'none',
                            zIndex: isSel ? 20 : (status === 'live' ? 10 : 5),
                            opacity: status === 'past' ? 0.55 : 1,
                          }}
                        >
                          <div className="absolute left-0 top-0 bottom-0" style={{ width: 3, background: c.dot }} />
                          <div className="pl-2 pr-1.5 py-1 h-full flex flex-col overflow-hidden">
                            <div className="flex items-center gap-1 min-w-0">
                              {status === 'live' && (
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                              )}
                              <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: c.text }}>
                                {appt.subject}
                              </p>
                            </div>
                            {heightPx > 36 && (
                              <p className="text-[10px] mt-0.5" style={{ color: c.text, opacity: 0.7 }}>
                                {fmt(appt.start)} – {fmt(appt.end)}
                              </p>
                            )}
                            {heightPx > 52 && appt.location && (
                              <p className="text-[10px] truncate mt-0.5" style={{ color: c.text, opacity: 0.6 }}>
                                📍 {appt.location}
                              </p>
                            )}
                            {heightPx > 72 && appt.responseStatus && (
                              <div className="mt-1">
                                <ResponseBadge status={appt.responseStatus} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            ) : (
              /* ── List view ────────────────────────────────────────────────── */
              <div ref={listScrollRef} className="flex-1 overflow-y-auto p-4 space-y-2" style={{ scrollbarWidth: 'thin' }}>
                {appointments.map(appt => {
                  const status  = getStatus(appt, now, nextId);
                  const c       = STATUS_COLOR[status];
                  const isSel   = selected?.id === appt.id;
                  const isFirst = appt.id === firstHighlightId;
                  return (
                    <div
                      key={appt.id}
                      ref={isFirst ? (el => { firstHighlightRef.current = el; }) : undefined}
                      onClick={() => setSelected(isSel ? null : appt)}
                      className="rounded-xl border cursor-pointer transition-all duration-150 overflow-hidden select-none"
                      style={{
                        background: isSel ? 'rgba(124,58,237,0.12)' : c.bg,
                        border: `1px solid ${isSel ? '#A78BFA' : c.border}`,
                        boxShadow: isSel ? `0 0 0 1px ${c.border}` : status === 'live' ? `0 0 10px ${c.dot}33` : 'none',
                        opacity: status === 'past' ? 0.65 : 1,
                      }}
                    >
                      <div className="flex items-stretch">
                        {/* Colored status bar */}
                        <div className="w-1 flex-shrink-0" style={{ background: c.dot }} />
                        <div className="flex-1 p-3">
                          {/* Title + badges row */}
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold leading-tight" style={{ color: c.text }}>
                              {appt.subject}
                            </p>
                            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                              <span className="text-[11px]" style={{ color: 'var(--neo-muted)' }}>
                                {fmt(appt.start)} – {fmt(appt.end)}
                              </span>
                              {status === 'live' && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                                  style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.5)', color: '#6EE7B7' }}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                                  Live
                                </span>
                              )}
                              {status === 'next' && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                                  style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.5)', color: '#FCD34D' }}>
                                  Next
                                </span>
                              )}
                              <ResponseBadge status={appt.responseStatus} />
                            </div>
                          </div>

                          {/* Meta: location + attendees */}
                          {(appt.location || appt.attendees.length > 0) && (
                            <div className="mt-1.5 flex flex-wrap gap-3">
                              {appt.location && (
                                <span className="text-xs" style={{ color: 'var(--neo-muted)' }}>
                                  📍 {appt.location}
                                </span>
                              )}
                              {appt.attendees.length > 0 && (
                                <span className="text-xs" style={{ color: 'var(--neo-muted)' }}>
                                  👥 {appt.attendees.length} partecipant{appt.attendees.length === 1 ? 'e' : 'i'}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Expanded attendees (when selected) */}
                          {isSel && appt.attendees.length > 0 && (
                            <div className="mt-3 space-y-1.5 pt-3"
                              style={{ borderTop: '1px solid rgba(139,92,246,0.15)' }}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                                style={{ color: 'var(--neo-muted)' }}>Partecipanti</p>
                              {appt.attendees.slice(0, 6).map((a, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                                    style={{ background: 'rgba(124,58,237,0.2)', color: '#A78BFA' }}>
                                    {a.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="font-medium" style={{ color: 'var(--neo-text)' }}>{a.name}</span>
                                  {a.email && (
                                    <span className="truncate text-[11px]" style={{ color: 'var(--neo-muted)' }}>{a.email}</span>
                                  )}
                                </div>
                              ))}
                              {appt.attendees.length > 6 && (
                                <p className="text-xs" style={{ color: 'var(--neo-muted)' }}>
                                  +{appt.attendees.length - 6} altri…
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Selected appointment quick bar ──────────────────────────────── */}
            {selected && (
              <div className="flex-shrink-0 border-t px-5 py-3"
                style={{ borderColor: 'var(--neo-border)', background: 'rgba(124,58,237,0.06)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--neo-text)' }}>
                        {selected.subject}
                      </p>
                      <ResponseBadge status={selected.responseStatus} />
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--neo-muted)' }}>
                      {fmt(selected.start)} – {fmt(selected.end)}
                      {selected.location && ` · 📍 ${selected.location}`}
                      {selected.attendees.length > 0 && ` · 👥 ${selected.attendees.length}`}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => setInfoAppt(selected)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA' }}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Show Info
                    </button>
                    {extractTeamsUrl(selected) && onOpenTeamsAndRecord && (
                      <button
                        onClick={() => {
                          const url = extractTeamsUrl(selected)!;
                          onOpenTeamsAndRecord(selected.subject, buildNoteHtml(selected), url, selected.attendees);
                          onClose();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                        style={{ background: 'rgba(124,58,237,0.3)', border: '1px solid rgba(139,92,246,0.5)', color: '#C4B5FD' }}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.847v6.306a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                        Teams + Rec
                      </button>
                    )}
                    <button
                      onClick={() => { onImport(selected.subject, buildNoteHtml(selected), selected.attendees); onClose(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                      style={{ background: 'linear-gradient(135deg,#7C3AED,#C026D3)', color: 'white' }}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Load Info
                    </button>
                    <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg"
                      style={{ color: 'var(--neo-muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--neo-border)' }}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Show Info modal (above day view) ─────────────────────────────────── */}
      {infoAppt && (
        <ApptInfoModal
          appt={infoAppt}
          onClose={() => setInfoAppt(null)}
          onLoadInfo={() => {
            onImport(infoAppt.subject, buildNoteHtml(infoAppt), infoAppt.attendees);
            setInfoAppt(null);
            onClose();
          }}
          onTeams={onOpenTeamsAndRecord && extractTeamsUrl(infoAppt) ? () => {
            const url = extractTeamsUrl(infoAppt)!;
            onOpenTeamsAndRecord!(infoAppt.subject, buildNoteHtml(infoAppt), url, infoAppt.attendees);
            setInfoAppt(null);
            onClose();
          } : undefined}
        />
      )}
    </>
  );
};
