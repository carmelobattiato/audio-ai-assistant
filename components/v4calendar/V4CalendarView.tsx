import React, { useState, useMemo, useEffect } from 'react';
import { SavedSession } from '@/types';
import { CalendarEventRecord, CalEventDetailPanel } from '@/components/newcalendar/CalEventDetailPanel';
import { NewCalMonthView } from '@/components/newcalendar/NewCalMonthView';
import { NewCalWeekView } from '@/components/newcalendar/NewCalWeekView';
import { NewCalWorkWeekView } from '@/components/newcalendar/NewCalWorkWeekView';
import { useV4CalendarSync, V4OutlookState, V4SyncRequestState } from '@/hooks/useV4CalendarSync';

type ViewMode = 'month' | 'week' | 'workweek' | 'day';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

function formatWeekRange(date: Date, days: number): string {
  const start = new Date(date);
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + days - 1);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('it-IT', opts)} – ${end.toLocaleDateString('it-IT', { ...opts, year: 'numeric' })}`;
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function buildMiniGrid(year: number, month: number): Date[] {
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const grid: Date[] = [];
  for (let i = startDow - 1; i >= 0; i--) grid.push(new Date(year, month, -i));
  for (let d = 1; d <= lastDay.getDate(); d++) grid.push(new Date(year, month, d));
  let extra = 1;
  while (grid.length % 7 !== 0) grid.push(new Date(year, month + 1, extra++));
  return grid;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s fa`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m fa`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h fa`;
  return `${Math.floor(hrs / 24)}g fa`;
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Mini calendar ────────────────────────────────────────────────────────────

const MiniCalendar: React.FC<{
  date: Date;
  events: CalendarEventRecord[];
  onDayClick: (d: Date) => void;
}> = ({ date, events, onDayClick }) => {
  const [miniDate, setMiniDate] = useState(() => new Date(date.getFullYear(), date.getMonth(), 1));
  const now = new Date();
  const year = miniDate.getFullYear();
  const month = miniDate.getMonth();
  const grid = buildMiniGrid(year, month);
  const DOW = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setMiniDate(new Date(year, month - 1, 1))}
          aria-label="Mese precedente"
          className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-[11px] font-semibold text-gray-300 capitalize">
          {miniDate.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}
        </span>
        <button
          onClick={() => setMiniDate(new Date(year, month + 1, 1))}
          aria-label="Mese successivo"
          className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DOW.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-semibold text-gray-600">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {grid.map((day, idx) => {
          const isCurrentMonth = day.getMonth() === month;
          const isToday = sameDay(day, now);
          const hasEvent = isCurrentMonth && events.some(e => sameDay(new Date(e.start), day));
          const isSelected = sameDay(day, date);
          return (
            <button
              key={idx}
              onClick={() => onDayClick(day)}
              className="relative flex flex-col items-center justify-center rounded w-6 h-6 mx-auto text-[10px] transition-colors"
              style={
                isToday
                  ? { background: '#3B82F6', color: 'white', fontWeight: 700 }
                  : isSelected
                  ? { background: 'rgba(59,130,246,0.2)', color: '#93C5FD', fontWeight: 600 }
                  : { color: isCurrentMonth ? '#D1D5DB' : '#4B5563' }
              }
            >
              {day.getDate()}
              {hasEvent && !isToday && (
                <span className="absolute bottom-0.5 w-1 h-1 rounded-full" style={{ background: '#8B5CF6' }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Plugin status bar ────────────────────────────────────────────────────────

const OUTLOOK_LABEL: Record<V4OutlookState, string> = {
  ok: 'Riuscita',
  error: 'Fallita',
  fetching: 'In corso…',
  idle: 'Inattiva',
  unknown: 'Sconosciuta',
};

const OUTLOOK_COLOR: Record<V4OutlookState, string> = {
  ok: '#10B981',
  error: '#EF4444',
  fetching: '#F59E0B',
  idle: '#64748B',
  unknown: '#64748B',
};

const StatusCell: React.FC<{ label: string; value: string; color?: string; dot?: string }> = ({
  label, value, color, dot,
}) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="text-[9px] uppercase tracking-widest" style={{ color: '#6B7280' }}>{label}</span>
    <span className="flex items-center gap-1.5 text-xs font-semibold truncate" style={{ color: color || '#E5E7EB' }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flex: 'none' }} />}
      {value}
    </span>
  </div>
);

const PluginStatusBar: React.FC<{
  pluginDetected: boolean;
  outlookState: V4OutlookState;
  lastDataAt: number | null;
  nextSyncAt: number | null;
  eventCount: number;
  syncRequestState: V4SyncRequestState;
  syncRequestError: string | null;
  onRunSync: () => void;
}> = ({ pluginDetected, outlookState, lastDataAt, nextSyncAt, eventCount, syncRequestState, syncRequestError, onRunSync }) => {
  const [, tick] = useState(0);

  // The "fra Ns" countdown and the "Xm fa" age are both wall-clock derived.
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const countdown = (() => {
    if (!pluginDetected || !nextSyncAt) return '—';
    const secs = Math.round((nextSyncAt - Date.now()) / 1000);
    if (secs <= 0) return 'a momenti…';
    return secs < 60 ? `fra ${secs}s` : `fra ${Math.floor(secs / 60)}m ${secs % 60}s`;
  })();

  return (
    <div
      className="flex items-center gap-5 px-4 py-2 flex-wrap"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(30,41,59,0.35)' }}
    >
      <StatusCell
        label="Plugin"
        value={pluginDetected ? 'Rilevato' : 'Non rilevato'}
        color={pluginDetected ? '#C4B5FD' : '#FCA5A5'}
        dot={pluginDetected ? '#8B5CF6' : '#EF4444'}
      />
      <StatusCell
        label="Ultima sync"
        value={pluginDetected ? OUTLOOK_LABEL[outlookState] : '—'}
        color={pluginDetected ? OUTLOOK_COLOR[outlookState] : '#6B7280'}
        dot={pluginDetected ? OUTLOOK_COLOR[outlookState] : undefined}
      />
      <StatusCell
        label="Dati Outlook"
        value={lastDataAt ? `${formatClock(lastDataAt)} · ${formatAgo(lastDataAt)}` : 'mai ricevuti'}
      />
      <StatusCell label="Prossima sync" value={countdown} />
      <StatusCell label="Appuntamenti" value={String(eventCount)} />

      <div className="flex items-center gap-2 ml-auto">
        {syncRequestState === 'error' && syncRequestError && (
          <span className="text-[11px] max-w-xs text-right" style={{ color: '#FCA5A5' }}>
            {syncRequestError}
          </span>
        )}
        {syncRequestState !== 'error' && !pluginDetected && (
          <span className="text-[11px]" style={{ color: '#FCA5A5' }}>
            Apri Outlook nel browser e verifica che il plugin sia installato e attivo.
          </span>
        )}
        <button
          onClick={onRunSync}
          disabled={syncRequestState === 'requesting'}
          title="Chiede al plugin di sincronizzare subito — l'esito finisce in Settings › Logs"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.02] disabled:cursor-not-allowed flex-none"
          style={
            syncRequestState === 'requesting'
              ? { border: '1px solid rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.12)', color: '#FCD34D' }
              : syncRequestState === 'ok'
              ? { border: '1px solid rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.12)', color: '#6EE7B7' }
              : syncRequestState === 'error'
              ? { border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }
              : { border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(124,58,237,0.12)', color: '#C4B5FD' }
          }
        >
          <svg
            className={`w-3.5 h-3.5 ${syncRequestState === 'requesting' ? 'animate-spin' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {syncRequestState === 'requesting' ? 'Sync…'
            : syncRequestState === 'ok' ? 'Avviata'
            : syncRequestState === 'error' ? 'Riprova'
            : 'Run sync'}
        </button>
      </div>
    </div>
  );
};

// ─── Main view ────────────────────────────────────────────────────────────────

const VIEW_TABS: Array<{ id: ViewMode; label: string }> = [
  { id: 'month', label: 'Mese' },
  { id: 'week', label: 'Settimana' },
  { id: 'workweek', label: 'Lun–Ven' },
  { id: 'day', label: 'Giorno' },
];

type EventAttendees = Array<{ name: string; email: string; type?: 'required' | 'optional' }>;

interface V4CalendarViewProps {
  sessions?: SavedSession[];
  onOpenSession?: (sessionId: string) => void;
  onLinkSession?: (eventId: string, sessionId: string) => void;
  onUnlinkSession?: (eventId: string) => void;
  onLoadInfo?: (eventId: string, title: string, noteHtml: string, attendees: EventAttendees) => void;
  onLoadAndSchedule?: (eventId: string, title: string, noteHtml: string, attendees: EventAttendees, startIso: string, subject: string) => void;
  onOpenTeamsAndRecord?: (eventId: string, title: string, noteHtml: string, teamsUrl: string, attendees: EventAttendees) => void;
}

export const V4CalendarView: React.FC<V4CalendarViewProps> = ({
  sessions = [],
  onOpenSession,
  onLinkSession,
  onUnlinkSession,
  onLoadInfo,
  onLoadAndSchedule,
  onOpenTeamsAndRecord,
}) => {
  const {
    events, pluginDetected, outlookState, lastDataAt, nextSyncAt, pluginEventCount,
    syncRequestState, syncRequestError, requestSync, reloadArchive,
  } = useV4CalendarSync();

  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const visibleEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return events;
    return events.filter(e =>
      e.subject.toLowerCase().includes(q) ||
      (e.location || '').toLowerCase().includes(q) ||
      (e.organizer || '').toLowerCase().includes(q)
    );
  }, [events, searchQuery]);

  const step = (dir: 1 | -1) => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() + dir);
    else if (viewMode === 'day') d.setDate(d.getDate() + dir);
    else d.setDate(d.getDate() + dir * (viewMode === 'workweek' ? 5 : 7));
    setCurrentDate(d);
  };

  const periodLabel =
    viewMode === 'month' ? formatMonthYear(currentDate) :
    viewMode === 'day' ? formatDayLabel(currentDate) :
    formatWeekRange(currentDate, viewMode === 'workweek' ? 5 : 7);

  return (
    <div className="flex flex-col h-full" style={{ background: 'rgb(17,24,39)' }}>
      <PluginStatusBar
        pluginDetected={pluginDetected}
        outlookState={outlookState}
        lastDataAt={lastDataAt}
        nextSyncAt={nextSyncAt}
        eventCount={pluginEventCount}
        syncRequestState={syncRequestState}
        syncRequestError={syncRequestError}
        onRunSync={requestSync}
      />

      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 py-2 flex-wrap"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          {VIEW_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={
                viewMode === tab.id
                  ? { background: '#7C3AED', color: 'white' }
                  : { background: 'transparent', color: '#9CA3AF' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => step(-1)}
            aria-label="Periodo precedente"
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold capitalize px-2" style={{ color: '#E5E7EB' }}>
            {periodLabel}
          </span>
          <button
            onClick={() => step(1)}
            aria-label="Periodo successivo"
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <button
          onClick={() => setCurrentDate(new Date())}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#D1D5DB' }}
        >
          Oggi
        </button>

        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Cerca…"
          className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB', width: 150 }}
        />

        <div className="flex flex-col items-end select-none ml-auto" title="Ora corrente">
          <span className="font-mono font-bold tabular-nums text-sm leading-none" style={{ color: '#C4B5FD' }}>
            {now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: '#6B7280' }}>
            ora corrente
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex-none overflow-y-auto"
          style={{ width: 190, borderRight: '1px solid rgba(255,255,255,0.08)' }}
        >
          <MiniCalendar
            date={currentDate}
            events={visibleEvents}
            onDayClick={d => { setCurrentDate(d); if (viewMode === 'month') setViewMode('day'); }}
          />
        </div>

        <div className="flex-1 overflow-auto">
          {viewMode === 'month' && (
            <NewCalMonthView
              currentDate={currentDate}
              events={visibleEvents}
              sessions={sessions}
              onEventClick={setSelectedEvent}
              onDayClick={d => { setCurrentDate(d); setViewMode('day'); }}
            />
          )}
          {viewMode === 'week' && (
            <NewCalWeekView currentDate={currentDate} events={visibleEvents} sessions={sessions} onEventClick={setSelectedEvent} />
          )}
          {viewMode === 'workweek' && (
            <NewCalWorkWeekView currentDate={currentDate} events={visibleEvents} sessions={sessions} onEventClick={setSelectedEvent} />
          )}
          {viewMode === 'day' && (
            <NewCalWeekView currentDate={currentDate} events={visibleEvents} sessions={sessions} onEventClick={setSelectedEvent} days={1} />
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-4 py-1.5 text-[11px]"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: '#6B7280' }}
      >
        {visibleEvents.length} event{visibleEvents.length === 1 ? 'o' : 'i'}
        {searchQuery.trim() && ` su ${events.length}`}
        {' · '}{visibleEvents.filter(e => e.linkedSessionId).length} registrati
        {' · dati in memoria dal plugin'}
      </div>

      {/* Read-only calendar: no sessions to link, so the link actions are inert. */}
      <CalEventDetailPanel
        event={selectedEvent}
        sessions={sessions}
        onClose={() => setSelectedEvent(null)}
        onLinkSession={(eventId, sessionId) => { onLinkSession?.(eventId, sessionId); reloadArchive(); }}
        onUnlinkSession={(eventId) => { onUnlinkSession?.(eventId); reloadArchive(); }}
        onOpenSession={(sessionId) => onOpenSession?.(sessionId)}
        onLoadInfo={onLoadInfo}
        onLoadAndSchedule={onLoadAndSchedule}
        onOpenTeamsAndRecord={onOpenTeamsAndRecord}
      />
    </div>
  );
};

export default V4CalendarView;
