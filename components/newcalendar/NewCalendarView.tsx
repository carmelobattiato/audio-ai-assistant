import React, { useState, useMemo, useEffect } from 'react';
import { SavedSession } from '@/types';
import { CalendarEventRecord, CalEventDetailPanel } from './CalEventDetailPanel';
import { NewCalMonthView } from './NewCalMonthView';
import { NewCalWeekView } from './NewCalWeekView';
import { NewCalWorkWeekView } from './NewCalWorkWeekView';
import { useSemanticSearch, SemanticSearchResult } from '@/hooks/useSemanticSearch';

// ─── Types ────────────────────────────────────────────────────────────────────
type ViewMode = 'month' | 'week' | 'workweek' | 'day';

interface NewCalendarViewProps {
  events: CalendarEventRecord[];
  sessions: SavedSession[];
  onLinkSession: (eventId: string, sessionId: string) => void;
  onUnlinkSession: (eventId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onLoadInfo?: (eventId: string, title: string, noteHtml: string, attendees: Array<{ name: string; email: string; type?: 'required' | 'optional' }>) => void;
  onLoadAndSchedule?: (eventId: string, title: string, noteHtml: string, attendees: Array<{ name: string; email: string; type?: 'required' | 'optional' }>, startIso: string, subject: string) => void;
  onOpenTeamsAndRecord?: (eventId: string, title: string, noteHtml: string, teamsUrl: string, attendees: Array<{ name: string; email: string; type?: 'required' | 'optional' }>) => void;
  onAiSearchRequest?: (query: string) => void;
  onSync?: () => void;
  isSyncing?: boolean;
  syncError?: string | null;
  calSource?: string;
  calExtensionConnected?: boolean;
  apiKey?: string;
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
const AiResultsPanel: React.FC<{
  results: SemanticSearchResult[];
  isIndexing: boolean;
  indexedCount: number;
  totalCount: number;
  error: string | null;
  onOpenSession: (sessionId: string) => void;
  onClose: () => void;
}> = ({ results, isIndexing, indexedCount, totalCount, error, onOpenSession, onClose }) => (
  <div
    className="flex-shrink-0 px-4 py-3 flex flex-col gap-2"
    style={{ borderTop: '1px solid #4B5563', background: 'rgba(17,24,39,0.95)', maxHeight: 260, overflowY: 'auto' }}
  >
    {/* Header */}
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold text-violet-400 uppercase tracking-wider">
        Risultati AI
      </span>
      <button
        onClick={onClose}
        className="text-gray-500 hover:text-gray-300 transition-colors"
        title="Chiudi risultati AI"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    {/* Indexing status */}
    {isIndexing && (
      <div className="flex items-center gap-2 text-[11px] text-gray-400">
        <svg className="w-3.5 h-3.5 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Indicizzando {indexedCount}/{totalCount} sessioni…
      </div>
    )}

    {/* Error */}
    {error && (
      <p className="text-xs text-red-400">{error}</p>
    )}

    {/* No results */}
    {!isIndexing && !error && results.length === 0 && (
      <p className="text-xs text-gray-500">Nessun risultato rilevante trovato.</p>
    )}

    {/* Results list */}
    {results.map(r => (
      <button
        key={r.session.id}
        onClick={() => onOpenSession(r.session.id)}
        className="w-full text-left flex flex-col gap-0.5 px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        style={{ border: '1px solid #374151' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-200 truncate max-w-[75%]">{r.session.name}</span>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(124,58,237,0.25)', color: '#C4B5FD' }}
          >
            {Math.round(r.score * 100)}%
          </span>
        </div>
        {r.snippet && (
          <p className="text-[11px] text-gray-400 line-clamp-2 leading-snug">{r.snippet}</p>
        )}
      </button>
    ))}
  </div>
);

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
  onAiSearchRequest,
  onSync,
  isSyncing,
  syncError,
  calSource = 'windows',
  calExtensionConnected = false,
  apiKey,
}) => {
  const [viewMode,       setViewMode]       = useState<ViewMode>('day');
  const [now,            setNow]            = useState(new Date());
  const [currentDate,    setCurrentDate]    = useState(new Date());
  const [selectedEvent,  setSelectedEvent]  = useState<CalendarEventRecord | null>(null);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [showAiPanel,    setShowAiPanel]    = useState(false);
  const [syncState,      setSyncState]      = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const syncTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const {
    search: semanticSearch,
    isIndexing,
    indexedCount,
    totalCount,
    results: aiResults,
    error: aiError,
  } = useSemanticSearch(sessions, apiKey ?? '');

  // ── Keyword filter ──────────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.toLowerCase();
    return events.filter(e => e.subject.toLowerCase().includes(q));
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

  const handleAiSearch = async () => {
    if (!searchQuery.trim()) return;
    setShowAiPanel(true);
    onAiSearchRequest?.(searchQuery);
    await semanticSearch(searchQuery);
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
        </div>

        {/* Right cluster: source pill + clock + sync */}
        <div className="flex items-center gap-2">

          {/* Source pill */}
          {calSource === 'extension' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0"
              style={calExtensionConnected
                ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6EE7B7' }
                : { background: 'rgba(100,116,139,0.12)', border: '1px solid rgba(100,116,139,0.25)', color: '#64748B' }
              }>
              <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: calExtensionConnected ? '#10B981' : '#475569' }} />
              Outlook Live{!calExtensionConnected && ' (disconnesso)'}
            </span>
          )}
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
            onClick={() => { setSyncState('syncing'); onSync?.(); }}
            disabled={!onSync || syncState === 'syncing'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.02] disabled:cursor-not-allowed"
            style={
              syncState === 'syncing' ? { border: '1px solid rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.12)', color: '#FCD34D' } :
              syncState === 'success' ? { border: '1px solid rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.12)', color: '#6EE7B7' } :
              syncState === 'error'   ? { border: '1px solid rgba(239,68,68,0.5)',   background: 'rgba(239,68,68,0.12)',   color: '#FCA5A5' } :
                                        { border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(124,58,237,0.12)', color: '#C4B5FD' }
            }
            title={syncState === 'error' ? `Errore: ${syncError}` : 'Sincronizza calendario'}
          >
            <svg
              className={`w-3.5 h-3.5 ${syncState === 'syncing' ? 'animate-spin' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncState === 'syncing' ? 'Sincronizzazione…' :
             syncState === 'success' ? 'Aggiornato!' :
             syncState === 'error'   ? 'Errore sync' : 'Sincronizza'}
          </button>
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

          {/* My Calendar section */}
          <div className="px-3 py-2 mt-1" style={{ borderTop: '1px solid #1F2937' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-2">
              Il mio calendario
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: '#7C3AED' }} />
              Calendario
            </div>
            {events.some(e => e.linkedSessionId) && (
              <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: '#10B981' }} />
                Con registrazione
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="px-3 py-2 mt-auto" style={{ borderTop: '1px solid #1F2937' }}>
            <p className="text-[10px] text-gray-600">
              {events.length} eventi · {events.filter(e => e.linkedSessionId).length} registrati
            </p>
          </div>
        </div>

        {/* Calendar view area */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'month' && (
            <NewCalMonthView
              currentDate={currentDate}
              events={filteredEvents}
              sessions={sessions}
              onEventClick={setSelectedEvent}
              onDayClick={handleDayClick}
            />
          )}
          {viewMode === 'week' && (
            <NewCalWeekView
              currentDate={currentDate}
              events={filteredEvents}
              sessions={sessions}
              onEventClick={setSelectedEvent}
              days={7}
            />
          )}
          {viewMode === 'workweek' && (
            <NewCalWorkWeekView
              currentDate={currentDate}
              events={filteredEvents}
              sessions={sessions}
              onEventClick={setSelectedEvent}
            />
          )}
          {viewMode === 'day' && (
            <NewCalWeekView
              currentDate={currentDate}
              events={filteredEvents}
              sessions={sessions}
              onEventClick={setSelectedEvent}
              days={1}
            />
          )}
        </div>
      </div>

      {/* ── AI Results Panel ─────────────────────────────────────────────────── */}
      {showAiPanel && (
        <AiResultsPanel
          results={aiResults}
          isIndexing={isIndexing}
          indexedCount={indexedCount}
          totalCount={totalCount}
          error={aiError}
          onOpenSession={(id) => { onOpenSession(id); setShowAiPanel(false); }}
          onClose={() => setShowAiPanel(false)}
        />
      )}

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
              onChange={e => { setSearchQuery(e.target.value); if (showAiPanel) setShowAiPanel(false); }}
              onKeyDown={e => { if (e.key === 'Enter' && searchQuery.trim()) handleAiSearch(); }}
              placeholder="Cerca in sessioni e riunioni..."
              className="w-full pl-8 pr-4 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
              style={{ border: '1px solid #374151' }}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setShowAiPanel(false); }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <button
            onClick={handleAiSearch}
            disabled={!searchQuery.trim() || isIndexing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg,#7C3AED,#C026D3)', color: 'white' }}
          >
            {isIndexing ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            )}
            {isIndexing ? `${indexedCount}/${totalCount}` : 'Cerca con AI'}
          </button>
        </div>

        {/* Keyword session pills */}
        {searchQuery.trim() && !showAiPanel && (
          <KeywordResultsPill
            sessions={sessions}
            query={searchQuery}
            onOpenSession={onOpenSession}
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
