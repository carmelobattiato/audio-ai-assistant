import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CAL_SYNC_PAST_HOURS, CAL_SYNC_FUTURE_DAYS, CAL_AUDIO_RETENTION_DAYS } from '@/constants/appConfig';
import { SavedSession } from '@/types';
import { CalendarEventRecord, CalEventDetailPanel } from './CalEventDetailPanel';
import { NewCalMonthView } from './NewCalMonthView';
import { NewCalWeekView } from './NewCalWeekView';
import { NewCalWorkWeekView } from './NewCalWorkWeekView';

// ─── Types ────────────────────────────────────────────────────────────────────
type ViewMode = 'month' | 'week' | 'workweek' | 'day';

interface NewCalendarViewProps {
  events: CalendarEventRecord[];
  sessions: SavedSession[];
  onLinkSession: (eventId: string, sessionId: string) => void;
  onUnlinkSession: (eventId: string) => void;
  onOpenSession: (sessionId: string) => void;
  currentSessionId?: string;
  onCorrelateEvents?: (sessionIds: string[]) => void;
  onLoadInfo?: (eventId: string, title: string, noteHtml: string, attendees: Array<{ name: string; email: string; type?: 'required' | 'optional' }>) => void;
  onLoadAndSchedule?: (eventId: string, title: string, noteHtml: string, attendees: Array<{ name: string; email: string; type?: 'required' | 'optional' }>, startIso: string, subject: string) => void;
  onOpenTeamsAndRecord?: (eventId: string, title: string, noteHtml: string, teamsUrl: string, attendees: Array<{ name: string; email: string; type?: 'required' | 'optional' }>) => void;
  onSync?: () => void;
  isSyncing?: boolean;
  syncError?: string | null;
  calSource?: string;
  calExtensionConnected?: boolean;
  calOutlookState?: 'ok' | 'error' | 'fetching' | 'idle' | 'unknown';
  lastSyncAt?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

function formatWeekRange(date: Date, days: number): string {
  const start = new Date(date);
  const dow   = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + days - 1);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('it-IT', opts)} – ${end.toLocaleDateString('it-IT', { ...opts, year: 'numeric' })}`;
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Build the mini-calendar for the left sidebar. */
function buildMiniGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const grid: Date[] = [];
  for (let i = startDow - 1; i >= 0; i--) grid.push(new Date(year, month, -i));
  for (let d = 1; d <= lastDay.getDate(); d++) grid.push(new Date(year, month, d));
  let extra = 1;
  while (grid.length % 7 !== 0) grid.push(new Date(year, month + 1, extra++));
  return grid;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function hasEventOnDay(day: Date, events: CalendarEventRecord[]): boolean {
  return events.some(e => sameDay(new Date(e.start), day));
}

// ─── Mini Calendar Sidebar ────────────────────────────────────────────────────
const MiniCalendar: React.FC<{
  date: Date;
  events: CalendarEventRecord[];
  onDayClick: (d: Date) => void;
}> = ({ date, events, onDayClick }) => {
  const [miniDate, setMiniDate] = useState(() => new Date(date.getFullYear(), date.getMonth(), 1));
  const now   = new Date();
  const year  = miniDate.getFullYear();
  const month = miniDate.getMonth();
  const grid  = buildMiniGrid(year, month);
  const DOW   = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

  const prevMonth = () => setMiniDate(new Date(year, month - 1, 1));
  const nextMonth = () => setMiniDate(new Date(year, month + 1, 1));

  return (
    <div className="p-3">
      {/* Mini header */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} aria-label="Previous month" className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-[11px] font-semibold text-gray-300 capitalize">
          {miniDate.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}
        </span>
        <button onClick={nextMonth} aria-label="Next month" className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* DOW labels */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-semibold text-gray-600">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {grid.map((day, idx) => {
          const isCurrentMonth = day.getMonth() === month;
          const isToday        = sameDay(day, now);
          const hasEvent       = isCurrentMonth && hasEventOnDay(day, events);
          const isSelected     = sameDay(day, date);

          return (
            <button
              key={idx}
              onClick={() => onDayClick(day)}
              className="relative flex flex-col items-center justify-center rounded w-6 h-6 mx-auto text-[10px] transition-colors"
              style={
                isToday
                  ? { background: '#3B82F6', color: 'white', fontWeight: 700 }
                  : isSelected && !isToday
                  ? { background: 'rgba(59,130,246,0.2)', color: '#93C5FD', fontWeight: 600 }
                  : { color: isCurrentMonth ? '#D1D5DB' : '#4B5563' }
              }
            >
              {day.getDate()}
              {hasEvent && !isToday && (
                <span
                  className="absolute bottom-0.5 w-1 h-1 rounded-full"
                  style={{ background: '#8B5CF6' }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── AI Results Panel ─────────────────────────────────────────────────────────
// ─── Keyword Session Pills ────────────────────────────────────────────────────
const KeywordResultsPill: React.FC<{
  sessions: SavedSession[];
  query: string;
  onOpenSession: (sessionId: string) => void;
}> = ({ sessions, query, onOpenSession }) => {
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return sessions.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.data.transcribedText?.toLowerCase().includes(q) ||
      s.data.llmProcessedText?.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [sessions, query]);

  if (!query.trim() || filtered.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {filtered.map(s => (
        <button
          key={s.id}
          onClick={() => onOpenSession(s.id)}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors hover:bg-gray-600"
          style={{ background: 'rgba(55,65,81,0.8)', border: '1px solid #4B5563', color: '#D1D5DB' }}
          title={`Apri sessione: ${s.name}`}
        >
          <svg className="w-2.5 h-2.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <span className="truncate max-w-[120px]">{s.name}</span>
        </button>
      ))}
    </div>
  );
};

// ─── Keyword Calendar Event Pills ────────────────────────────────────────────
const CalendarKeywordResults: React.FC<{
  events: CalendarEventRecord[];
  query: string;
  onEventClick: (e: CalendarEventRecord) => void;
}> = ({ events, query, onEventClick }) => {
  const filtered = useMemo(() => {
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const q = normalize(query);
    return events.filter(e => {
      const haystack = [
        e.subject, e.location ?? '', e.organizer ?? '', e.body ?? '',
        ...(e.attendees?.map(a => `${a.name} ${a.email}`) ?? []),
      ].map(normalize).join(' ');
      return haystack.includes(q);
    }).slice(0, 8);
  }, [events, query]);

  if (!query.trim() || filtered.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 pt-1">
      <p className="text-[9px] text-gray-600 uppercase tracking-wider px-0.5">Riunioni trovate</p>
      <div className="flex flex-wrap gap-1.5">
        {filtered.map(e => {
          const d = new Date(e.start);
          const dateStr = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
          const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
          return (
            <button
              key={e.id}
              onClick={() => onEventClick(e)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors hover:bg-gray-600"
              style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', color: '#C4B5FD' }}
              title={`${e.subject} — ${dateStr} ${timeStr}`}
            >
              <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[9px] text-gray-500 flex-shrink-0">{dateStr} {timeStr}</span>
              <span className="truncate max-w-[140px]">{e.subject}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const NewCalendarView: React.FC<NewCalendarViewProps> = ({
  events,
  sessions,
  onLinkSession,
  onUnlinkSession,
  onOpenSession,
  onLoadInfo,
  onLoadAndSchedule,
  onOpenTeamsAndRecord,

  onSync,
  isSyncing,
  syncError,
  calSource = 'windows',
  calExtensionConnected = false,
  calOutlookState = 'unknown',
  lastSyncAt,
  currentSessionId,
  onCorrelateEvents,
}) => {
  const [viewMode,           setViewMode]           = useState<ViewMode>('day');
  const [now,                setNow]                = useState(new Date());
  const [currentDate,        setCurrentDate]        = useState(new Date());
  const [selectedEvent,      setSelectedEvent]      = useState<CalendarEventRecord | null>(null);
  const [searchQuery,        setSearchQuery]        = useState('');
  const [syncState,          setSyncState]          = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [showSyncInfo,       setShowSyncInfo]       = useState(false);
  const [isSelectionMode,    setIsSelectionMode]    = useState(false);
  const [selectedEventIds,   setSelectedEventIds]   = useState<string[]>([]);
  const syncTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInfoRef  = useRef<HTMLDivElement>(null);

  const formatLastSync = (ts: number): string => {
    const mins = Math.floor((Date.now() - ts) / 60_000);
    if (mins < 1) return 'ora ora';
    if (mins < 60) return `${mins}m fa`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h fa`;
    return `${Math.floor(hrs / 24)}g fa`;
  };

  const extensionOffline = calSource === 'extension' && !calExtensionConnected;
  const outlookOffline   = calSource === 'extension' && calExtensionConnected && calOutlookState === 'error';

  const toggleEventSelection = (eventId: string) => {
    setSelectedEventIds(prev =>
      prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
    );
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedEventIds([]);
  };

  const handleCorrelate = () => {
    if (!onCorrelateEvents) return;
    const linkedIds = selectedEventIds
      .map(eid => events.find(e => e.id === eid)?.linkedSessionId)
      .filter((id): id is string => !!id);
    onCorrelateEvents(linkedIds);
    cancelSelection();
  };

  // Keep selectedEvent in sync with updated events (e.g. after link/unlink)
  useEffect(() => {
    if (!selectedEvent) return;
    const updated = events.find(e => e.id === selectedEvent.id);
    if (updated && updated !== selectedEvent) setSelectedEvent(updated);
  }, [events]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Drive syncState from parent isSyncing/syncError with minimum 800ms display
  useEffect(() => {
    if (isSyncing) {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      setSyncState('syncing');
      return;
    }
    if (syncState === 'syncing') {
      const next = syncError ? 'error' : 'success';
      setSyncState(next);
      syncTimerRef.current = setTimeout(() => setSyncState('idle'), next === 'success' ? 2000 : 4000);
    }
  }, [isSyncing, syncError]);

  // ── Keyword filter ──────────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const q = normalize(searchQuery);
    return events.filter(e => {
      const haystack = [
        e.subject,
        e.location ?? '',
        e.organizer ?? '',
        e.body ?? '',
        ...(e.attendees?.map(a => `${a.name} ${a.email}`) ?? []),
      ].map(normalize).join(' ');
      return haystack.includes(q);
    });
  }, [events, searchQuery]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const navigate = (direction: -1 | 1) => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      switch (viewMode) {
        case 'month':    d.setMonth(d.getMonth() + direction); break;
        case 'week':     d.setDate(d.getDate() + 7 * direction); break;
        case 'workweek': d.setDate(d.getDate() + 7 * direction); break;
        case 'day':      d.setDate(d.getDate() + direction); break;
      }
      return d;
    });
  };

  const goToday = () => setCurrentDate(new Date());

  const handleDayClick = (day: Date) => {
    setCurrentDate(day);
    setViewMode('day');
  };

  // ── Navigation label ────────────────────────────────────────────────────────
  const navLabel = useMemo(() => {
    switch (viewMode) {
      case 'month':    return formatMonthYear(currentDate);
      case 'week':     return formatWeekRange(currentDate, 7);
      case 'workweek': return formatWeekRange(currentDate, 5);
      case 'day':      return formatDayLabel(currentDate);
    }
  }, [viewMode, currentDate]);

  const VIEW_TABS: { key: ViewMode; label: string }[] = [
    { key: 'month',    label: 'Mese' },
    { key: 'week',     label: 'Settimana' },
    { key: 'workweek', label: 'Lun–Ven' },
    { key: 'day',      label: 'Giorno' },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 overflow-hidden">

      {/* ── Top toolbar ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid #374151', background: 'rgba(17,24,39,0.9)' }}
      >
        {/* View switcher */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #374151' }}>
          {VIEW_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setViewMode(tab.key)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={viewMode === tab.key
                ? { background: 'rgba(124,58,237,0.35)', color: '#C4B5FD', borderRight: '1px solid #374151' }
                : { background: 'transparent', color: '#9CA3AF', borderRight: '1px solid #374151' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            aria-label="Previous"
            className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            style={{ border: '1px solid #374151' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <span className="text-sm font-semibold text-gray-200 capitalize min-w-[180px] text-center select-none">
            {navLabel}
          </span>

          <button
            onClick={() => navigate(1)}
            aria-label="Next"
            className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            style={{ border: '1px solid #374151' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            onClick={goToday}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors hover:bg-gray-700"
            style={{ border: '1px solid #374151', color: '#93C5FD' }}
          >
            Oggi
          </button>

          {/* Select toggle — only when correlation is available */}
          {currentSessionId && onCorrelateEvents && (
            <button
              onClick={() => { setIsSelectionMode(v => { if (v) setSelectedEventIds([]); return !v; }); }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
              style={isSelectionMode
                ? { border: '1px solid rgba(245,158,11,0.6)', background: 'rgba(245,158,11,0.15)', color: '#FCD34D' }
                : { border: '1px solid rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.1)', color: '#C4B5FD' }
              }
            >
              {isSelectionMode ? 'Cancel' : 'Select'}
            </button>
          )}
        </div>

        {/* Right cluster: source pill + clock + sync */}
        <div className="flex items-center gap-2">

          {/* Source pills — extension status + outlook status */}
          {calSource === 'extension' && (() => {
            const extOk = calExtensionConnected;
            const outlookColor =
              calOutlookState === 'ok'       ? '#10B981' :
              calOutlookState === 'fetching' ? '#F59E0B' :
              calOutlookState === 'error'    ? '#EF4444' : '#475569';
            const outlookLabel =
              calOutlookState === 'ok'       ? 'Outlook Live' :
              calOutlookState === 'fetching' ? 'Outlook in sync…' :
              calOutlookState === 'error'    ? 'Outlook offline' :
              calOutlookState === 'idle'     ? 'Outlook inattivo' : 'Outlook sconosciuto';
            const outlookBg =
              calOutlookState === 'ok'       ? 'rgba(16,185,129,0.12)'  :
              calOutlookState === 'fetching' ? 'rgba(245,158,11,0.12)'  :
              calOutlookState === 'error'    ? 'rgba(239,68,68,0.10)'   : 'rgba(100,116,139,0.12)';
            const outlookBorder =
              calOutlookState === 'ok'       ? 'rgba(16,185,129,0.3)'   :
              calOutlookState === 'fetching' ? 'rgba(245,158,11,0.3)'   :
              calOutlookState === 'error'    ? 'rgba(239,68,68,0.3)'    : 'rgba(100,116,139,0.25)';
            const outlookText =
              calOutlookState === 'ok'       ? '#6EE7B7' :
              calOutlookState === 'fetching' ? '#FCD34D' :
              calOutlookState === 'error'    ? '#FCA5A5' : '#64748B';
            return (
              <>
                {/* Plugin pill */}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0"
                  style={extOk
                    ? { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#C4B5FD' }
                    : { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }
                  }>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: extOk ? '#8B5CF6' : '#EF4444' }} />
                  {extOk ? 'Plugin attivo' : 'Plugin offline'}
                </span>
                {/* Outlook pill — only meaningful if extension is online */}
                {extOk && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0"
                    style={{ background: outlookBg, border: `1px solid ${outlookBorder}`, color: outlookText }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: outlookColor }} />
                    {outlookLabel}
                  </span>
                )}
              </>
            );
          })()}
          {calSource === 'ics' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: '#FCD34D' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: '#F59E0B' }} />
              ICS Feed
            </span>
          )}
          {calSource === 'windows' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0"
              style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#C4B5FD' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: '#8B5CF6' }} />
              Outlook COM
            </span>
          )}

          {/* Live clock */}
          <div className="flex flex-col items-end select-none" title="Ora corrente">
            <span className="font-mono font-bold tabular-nums text-sm leading-none" style={{ color: '#C4B5FD' }}>
              {now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: 'var(--neo-muted, #6B7280)' }}>
              ora corrente
            </span>
          </div>

          {/* Sync button */}
          <button
            onClick={() => { if (!extensionOffline) { setSyncState('syncing'); onSync?.(); } }}
            disabled={!onSync || syncState === 'syncing' || extensionOffline}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.02] disabled:cursor-not-allowed"
            style={
              extensionOffline                ? { border: '1px solid rgba(239,68,68,0.4)',   background: 'rgba(239,68,68,0.08)',   color: '#FCA5A5', opacity: 0.7 } :
              syncState === 'syncing'         ? { border: '1px solid rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.12)', color: '#FCD34D' } :
              syncState === 'success'         ? { border: '1px solid rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.12)', color: '#6EE7B7' } :
              syncState === 'error'           ? { border: '1px solid rgba(239,68,68,0.5)',   background: 'rgba(239,68,68,0.12)',   color: '#FCA5A5' } :
                                                { border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(124,58,237,0.12)', color: '#C4B5FD' }
            }
            title={
              extensionOffline ? 'Plugin non connesso' :
              outlookOffline   ? 'Outlook non raggiungibile — apri Outlook nel browser' :
              syncState === 'error' ? `Errore: ${syncError}` : 'Sincronizza calendario'
            }
          >
            <svg
              className={`w-3.5 h-3.5 ${syncState === 'syncing' ? 'animate-spin' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {extensionOffline               ? 'Offline' :
             syncState === 'syncing'        ? 'Sincronizzazione…' :
             syncState === 'success'        ? 'Aggiornato!' :
             syncState === 'error'          ? 'Errore sync' :
             lastSyncAt                     ? `Ultimo sync ${formatLastSync(lastSyncAt)}` :
                                              'Sincronizza'}
          </button>

          {/* Sync info button */}
          <div className="relative" ref={syncInfoRef}>
            <button
              onClick={() => setShowSyncInfo(v => !v)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors flex-shrink-0"
              style={{ background: showSyncInfo ? 'rgba(56,189,248,0.2)' : 'rgba(55,65,81,0.8)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.3)' }}
              aria-label="Informazioni sincronizzazione"
              title="Informazioni sincronizzazione"
            >
              i
            </button>
            {showSyncInfo && (
              <div
                className="absolute right-0 top-8 z-50 rounded-xl shadow-2xl p-4 w-72 text-xs space-y-3"
                style={{ background: '#1E293B', border: '1px solid rgba(56,189,248,0.2)' }}
                onClick={e => e.stopPropagation()}
              >
                <p className="font-semibold text-sky-400 text-sm">Regole di sincronizzazione</p>
                <div className="space-y-2 text-gray-300">
                  <div className="flex gap-2">
                    <span className="text-sky-400 mt-0.5">⏱</span>
                    <span>Finestra: ultime <strong className="text-white">{CAL_SYNC_PAST_HOURS}h</strong> e prossimi <strong className="text-white">{CAL_SYNC_FUTURE_DAYS} giorni</strong></span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-emerald-400 mt-0.5">🔗</span>
                    <span>Meeting con sessione di registrazione collegata: conservati a <strong className="text-white">tempo indeterminato</strong></span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-amber-400 mt-0.5">🎙</span>
                    <span>Audio: eliminato automaticamente dopo <strong className="text-white">{CAL_AUDIO_RETENTION_DAYS} giorni</strong></span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-violet-400 mt-0.5">📝</span>
                    <span>Trascrizioni e note: <strong className="text-white">conservate sempre</strong></span>
                  </div>
                </div>
                <button
                  onClick={() => setShowSyncInfo(false)}
                  className="mt-1 text-gray-500 hover:text-gray-300 text-xs transition-colors"
                >
                  Chiudi
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main area: sidebar + content ────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar */}
        <div
          className="flex-shrink-0 flex flex-col overflow-hidden"
          style={{ width: 200, borderRight: '1px solid #374151', background: 'rgba(17,24,39,0.5)' }}
        >
          <MiniCalendar
            date={currentDate}
            events={events}
            onDayClick={handleDayClick}
          />

          {/* Stats */}
          <div className="px-3 py-2 mt-auto" style={{ borderTop: '1px solid #1F2937' }}>
            <p className="text-[10px] text-gray-600">
              {events.length} eventi · {events.filter(e => e.linkedSessionId).length} registrati
            </p>
          </div>
        </div>

        {/* Calendar view area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {viewMode === 'month' && (
              <NewCalMonthView
                currentDate={currentDate}
                events={filteredEvents}
                sessions={sessions}
                onEventClick={isSelectionMode ? () => {} : setSelectedEvent}
                onDayClick={handleDayClick}
                isSelectionMode={isSelectionMode}
                selectedEventIds={selectedEventIds}
                onToggleEventSelection={toggleEventSelection}
              />
            )}
            {viewMode === 'week' && (
              <NewCalWeekView
                currentDate={currentDate}
                events={filteredEvents}
                sessions={sessions}
                onEventClick={isSelectionMode ? () => {} : setSelectedEvent}
                days={7}
                isSelectionMode={isSelectionMode}
                selectedEventIds={selectedEventIds}
                onToggleEventSelection={toggleEventSelection}
              />
            )}
            {viewMode === 'workweek' && (
              <NewCalWorkWeekView
                currentDate={currentDate}
                events={filteredEvents}
                sessions={sessions}
                onEventClick={isSelectionMode ? () => {} : setSelectedEvent}
                isSelectionMode={isSelectionMode}
                selectedEventIds={selectedEventIds}
                onToggleEventSelection={toggleEventSelection}
              />
            )}
            {viewMode === 'day' && (
              <NewCalWeekView
                currentDate={currentDate}
                events={filteredEvents}
                sessions={sessions}
                onEventClick={isSelectionMode ? () => {} : setSelectedEvent}
                days={1}
                isSelectionMode={isSelectionMode}
                selectedEventIds={selectedEventIds}
                onToggleEventSelection={toggleEventSelection}
              />
            )}
          </div>

          {/* ── Selection action bar ─────────────────────────────────────────── */}
          {isSelectionMode && (
            <div
              className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 gap-3"
              style={{ borderTop: '1px solid rgba(245,158,11,0.3)', background: 'rgba(17,24,39,0.95)' }}
            >
              <span className="text-xs text-amber-300">
                {selectedEventIds.length === 0
                  ? 'Click events to select them'
                  : `${selectedEventIds.length} event${selectedEventIds.length !== 1 ? 's' : ''} selected`}
                {selectedEventIds.length > 0 && selectedEventIds.some(eid => !events.find(e => e.id === eid)?.linkedSessionId) && (
                  <span className="ml-2 text-amber-500">⚠ Some have no recording</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelSelection}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-gray-700"
                  style={{ border: '1px solid #374151', color: '#9CA3AF' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCorrelate}
                  disabled={selectedEventIds.filter(eid => !!events.find(e => e.id === eid)?.linkedSessionId).length === 0}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ border: '1px solid rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.2)', color: '#FCD34D' }}
                >
                  Correlate with current session ▶
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-4 py-2.5 flex flex-col gap-2"
        style={{ borderTop: '1px solid #374151', background: 'rgba(17,24,39,0.9)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cerca in sessioni e riunioni..."
              className="w-full pl-8 pr-4 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
              style={{ border: '1px solid #374151' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

        </div>

        {/* Keyword session pills */}
        {searchQuery.trim() && (
          <KeywordResultsPill
            sessions={sessions}
            query={searchQuery}
            onOpenSession={onOpenSession}
          />
        )}
        {/* Keyword calendar event pills */}
        {searchQuery.trim() && (
          <CalendarKeywordResults
            events={events}
            query={searchQuery}
            onEventClick={e => {
              setCurrentDate(new Date(e.start));
              setViewMode('day');
              setSelectedEvent(e);
            }}
          />
        )}
      </div>

      {/* ── Event detail panel ──────────────────────────────────────────────── */}
      <CalEventDetailPanel
        event={selectedEvent}
        sessions={sessions}
        onClose={() => setSelectedEvent(null)}
        onLinkSession={(eventId, sessionId) => {
          onLinkSession(eventId, sessionId);
          // Optimistically keep panel open — parent will re-render with updated event
        }}
        onUnlinkSession={(eventId) => {
          onUnlinkSession(eventId);
          setSelectedEvent(null);
        }}
        onOpenSession={(sessionId) => {
          onOpenSession(sessionId);
          setSelectedEvent(null);
        }}
        onLoadInfo={onLoadInfo ? (eventId, title, noteHtml, attendees) => {
          onLoadInfo(eventId, title, noteHtml, attendees);
          setSelectedEvent(null);
        } : undefined}
        onLoadAndSchedule={onLoadAndSchedule ? (eventId, title, noteHtml, attendees, startIso, subject) => {
          onLoadAndSchedule(eventId, title, noteHtml, attendees, startIso, subject);
          setSelectedEvent(null);
        } : undefined}
        onOpenTeamsAndRecord={onOpenTeamsAndRecord ? (eventId, title, noteHtml, teamsUrl, attendees) => {
          onOpenTeamsAndRecord(eventId, title, noteHtml, teamsUrl, attendees);
          setSelectedEvent(null);
        } : undefined}
      />
    </div>
  );
};
