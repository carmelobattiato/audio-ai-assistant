import React, { useRef, useEffect, useState } from 'react';
import { SavedSession } from '@/types';
import { CalendarEventRecord } from './CalEventDetailPanel';

// ─── Constants (same scale as NeoCalendarDayView) ─────────────────────────────
const HOUR_PX    = 60;
const START_HOUR = 0;
const END_HOUR   = 24;
const HOURS      = END_HOUR - START_HOUR;
const MAX_COLS   = 8;
const TIME_COL_W = 48;

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/** Returns the Monday of the week containing `date`. */
function weekStart(date: Date): Date {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7; // 0=Mon
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Layout algorithm (BFS connected-component grouping) ─────────────────────
interface LayoutItem {
  event: CalendarEventRecord;
  col: number;
  span: number;
}

function doOverlap(a: CalendarEventRecord, b: CalendarEventRecord): boolean {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(a.end) > toMinutes(b.start);
}

function computeLayout(dayEvents: CalendarEventRecord[]): LayoutItem[] {
  if (!dayEvents.length) return [];

  const sorted = [...dayEvents].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  // BFS connected components
  const visited = new Set<string>();
  const components: CalendarEventRecord[][] = [];

  for (const ev of sorted) {
    if (visited.has(ev.id)) continue;
    const comp: CalendarEventRecord[] = [];
    const queue: CalendarEventRecord[] = [ev];
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

  const result: LayoutItem[] = [];

  for (const comp of components) {
    const cs = [...comp].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
    const colEnds: number[] = [];
    const colMap = new Map<string, number>();

    for (const ev of cs) {
      const s = toMinutes(ev.start);
      let col = colEnds.findIndex(end => end <= s);
      if (col === -1) col = colEnds.length;
      colEnds[col] = toMinutes(ev.end);
      colMap.set(ev.id, col);
    }

    const span = Math.min(MAX_COLS, colEnds.length);
    for (const ev of comp) {
      result.push({ event: ev, col: Math.min(colMap.get(ev.id)!, span - 1), span });
    }
  }

  return result;
}

// ─── Event block color ────────────────────────────────────────────────────────
type EventStatus = 'live' | 'next' | 'future' | 'past';

function getStatus(ev: CalendarEventRecord, now: Date, nextId: string | null): EventStatus {
  const s = new Date(ev.start), e = new Date(ev.end);
  if (now >= s && now <= e) return 'live';
  if (ev.id === nextId)     return 'next';
  if (e < now)              return 'past';
  return 'future';
}

const STATUS_COLOR: Record<EventStatus, { bg: string; border: string; text: string; dot: string }> = {
  live:   { bg: 'rgba(16,185,129,0.22)',  border: '#10B981', text: '#6EE7B7', dot: '#10B981' },
  next:   { bg: 'rgba(245,158,11,0.18)',  border: '#F59E0B', text: '#FCD34D', dot: '#F59E0B' },
  future: { bg: 'rgba(124,58,237,0.18)',  border: '#7C3AED', text: '#C4B5FD', dot: '#8B5CF6' },
  past:   { bg: 'rgba(75,85,99,0.15)',    border: '#4B5563', text: '#9CA3AF', dot: '#6B7280' },
};

// ─── Props ────────────────────────────────────────────────────────────────────
export interface NewCalWeekViewProps {
  currentDate: Date;
  events: CalendarEventRecord[];
  sessions: SavedSession[];
  onEventClick: (event: CalendarEventRecord) => void;
  days?: number; // default 7; pass 5 for workweek
}

// ─── Component ────────────────────────────────────────────────────────────────
export const NewCalWeekView: React.FC<NewCalWeekViewProps> = ({
  currentDate,
  events,
  sessions: _sessions,
  onEventClick,
  days = 7,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());

  // Tick clock every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll to current time
  useEffect(() => {
    if (!scrollRef.current) return;
    const nowMin     = now.getHours() * 60 + now.getMinutes();
    const viewportH  = scrollRef.current.clientHeight;
    scrollRef.current.scrollTop = Math.max(0, toPx(nowMin) - viewportH / 3);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Day view (days=1) shows currentDate directly; week/workweek start from Monday
  const startDay = days === 1 ? (() => { const d = new Date(currentDate); d.setHours(0,0,0,0); return d; })() : weekStart(currentDate);
  const dayColumns: Date[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);
    return d;
  });

  const DOW_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const nowPx  = toPx(nowMin);

  // Pre-compute layout per day
  const layoutByDay = dayColumns.map(day => {
    const dayEvents = events.filter(e => sameDay(new Date(e.start), day));
    const nextId    = dayEvents
      .filter(e => new Date(e.start) > now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0]?.id ?? null;
    return { dayEvents, layout: computeLayout(dayEvents), nextId };
  });

  const MIN_EVENT_H = 18;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Column headers */}
      <div
        className="flex flex-shrink-0"
        style={{ borderBottom: '1px solid #374151', paddingLeft: TIME_COL_W }}
      >
        {dayColumns.map((day, idx) => {
          const isToday = sameDay(day, now);
          return (
            <div
              key={idx}
              className="flex-1 py-2 text-center border-l"
              style={{ borderColor: '#1F2937' }}
            >
              <div className={`text-[11px] font-semibold uppercase ${isToday ? 'text-blue-400' : 'text-gray-400'}`}>
                {DOW_SHORT[(day.getDay() + 6) % 7]}
              </div>
              <div
                className="w-7 h-7 mx-auto mt-0.5 flex items-center justify-center rounded-full text-sm font-bold"
                style={isToday
                  ? { background: '#3B82F6', color: 'white' }
                  : { color: '#E5E7EB' }
                }
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'thin' }}>
        <div className="flex" style={{ minHeight: HOURS * HOUR_PX + 32, paddingBottom: 16 }}>

          {/* Time labels */}
          <div
            className="flex-shrink-0 relative select-none"
            style={{ width: TIME_COL_W }}
          >
            {Array.from({ length: HOURS + 1 }, (_, i) => (
              <div
                key={i}
                className="absolute right-2 text-[10px] font-mono text-gray-500"
                style={{ top: i * HOUR_PX - 7, lineHeight: 1 }}
              >
                {String(START_HOUR + i).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {dayColumns.map((day, dayIdx) => {
            const isToday = sameDay(day, now);
            const { layout, nextId } = layoutByDay[dayIdx]!;

            return (
              <div
                key={dayIdx}
                className="flex-1 relative border-l"
                style={{ borderColor: '#1F2937', minWidth: 0 }}
              >
                {/* Hour lines */}
                {Array.from({ length: HOURS + 1 }, (_, i) => (
                  <div
                    key={`h${i}`}
                    className="absolute left-0 right-0"
                    style={{ top: i * HOUR_PX, height: 1, background: 'rgba(55,65,81,0.6)' }}
                  />
                ))}
                {/* 30-min dashed lines */}
                {Array.from({ length: HOURS }, (_, i) => (
                  <div
                    key={`hh${i}`}
                    className="absolute left-0 right-0"
                    style={{ top: i * HOUR_PX + HOUR_PX / 2, height: 1, borderTop: '1px dashed rgba(55,65,81,0.4)' }}
                  />
                ))}

                {/* Current time indicator (today only) */}
                {isToday && (
                  <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: nowPx }}>
                    <div className="relative flex items-center">
                      <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] -ml-1 flex-shrink-0" />
                      <div className="flex-1" style={{ height: 2, background: 'rgba(239,68,68,0.7)' }} />
                    </div>
                  </div>
                )}

                {/* Event blocks */}
                {layout.map(({ event: ev, col, span }: LayoutItem) => {
                  const status   = getStatus(ev, now, nextId);
                  const c        = STATUS_COLOR[status];
                  const topPx    = toPx(toMinutes(ev.start));
                  const heightPx = Math.max(MIN_EVENT_H, toPx(toMinutes(ev.end)) - topPx);
                  const widthPct = 100 / span;
                  const leftPct  = (col / span) * 100;
                  const hasSession = !!ev.linkedSessionId;

                  return (
                    <div
                      key={ev.id}
                      onClick={() => onEventClick(ev)}
                      className="absolute cursor-pointer rounded overflow-hidden transition-all duration-150 hover:opacity-90 hover:shadow-lg"
                      style={{
                        top: topPx + 1,
                        height: heightPx - 2,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        background: hasSession ? 'rgba(16,185,129,0.2)' : c.bg,
                        border: `1.5px solid ${hasSession ? '#10B981' : c.border}`,
                        boxShadow: status === 'live' ? `0 0 8px ${c.dot}44` : 'none',
                        zIndex: status === 'live' ? 10 : 5,
                        opacity: status === 'past' ? 0.5 : 1,
                      }}
                    >
                      {/* Left accent bar */}
                      <div
                        className="absolute left-0 top-0 bottom-0"
                        style={{ width: 2, background: hasSession ? '#10B981' : c.dot }}
                      />
                      <div className="pl-2 pr-1 py-0.5 h-full flex flex-col overflow-hidden">
                        <div className="flex items-center gap-0.5 min-w-0">
                          {status === 'live' && (
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                          )}
                          {hasSession && (
                            <span className="text-[9px] flex-shrink-0">🎙</span>
                          )}
                          <p
                            className="text-[10px] font-semibold leading-tight truncate"
                            style={{ color: hasSession ? '#6EE7B7' : c.text }}
                          >
                            {ev.subject}
                          </p>
                        </div>
                        {heightPx > 30 && (
                          <p className="text-[9px] mt-0.5" style={{ color: c.text, opacity: 0.7 }}>
                            {fmt(ev.start)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
