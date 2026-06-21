import React, { useState } from 'react';
import { SavedSession } from '@/types';
import { CalendarEventRecord } from './CalEventDetailPanel';

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Returns Monday-anchored grid for the month containing `date`. */
function buildMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  // Weekday of first day (0=Sun → remap to Mon=0)
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const grid: Date[] = [];

  // Pad before
  for (let i = startDow - 1; i >= 0; i--) {
    grid.push(new Date(year, month, -i));
  }
  // Days in month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    grid.push(new Date(year, month, d));
  }
  // Pad after to fill complete rows (multiple of 7)
  let extra = 1;
  while (grid.length % 7 !== 0) {
    grid.push(new Date(year, month + 1, extra++));
  }
  return grid;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function eventsForDay(day: Date, events: CalendarEventRecord[]): CalendarEventRecord[] {
  return events.filter(e => sameDay(new Date(e.start), day))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function eventPillColor(event: CalendarEventRecord, now: Date): { bg: string; text: string; border: string } {
  if (event.linkedSessionId) {
    return { bg: 'rgba(16,185,129,0.25)', text: '#6EE7B7', border: 'rgba(16,185,129,0.5)' };
  }
  const start = new Date(event.start);
  const end   = new Date(event.end);
  if (now >= start && now <= end) {
    return { bg: 'rgba(16,185,129,0.2)', text: '#6EE7B7', border: 'rgba(16,185,129,0.4)' };
  }
  if (end < now) {
    return { bg: 'rgba(75,85,99,0.2)', text: '#9CA3AF', border: 'rgba(75,85,99,0.4)' };
  }
  return { bg: 'rgba(124,58,237,0.2)', text: '#C4B5FD', border: 'rgba(124,58,237,0.4)' };
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface NewCalMonthViewProps {
  currentDate: Date;
  events: CalendarEventRecord[];
  sessions: SavedSession[];
  onEventClick: (event: CalendarEventRecord) => void;
  onDayClick: (date: Date) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const NewCalMonthView: React.FC<NewCalMonthViewProps> = ({
  currentDate,
  events,
  sessions: _sessions,
  onEventClick,
  onDayClick,
}) => {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const now   = new Date();
  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const grid  = buildMonthGrid(year, month);

  const DOW_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const MAX_VISIBLE = 3;

  return (
    <div className="flex flex-col h-full">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 flex-shrink-0" style={{ borderBottom: '1px solid #374151' }}>
        {DOW_LABELS.map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {d}
          </div>
        ))}
      </div>

      {/* Grid cells */}
      <div
        className="flex-1 grid grid-cols-7 overflow-y-auto"
        style={{ gridAutoRows: 'minmax(0, 1fr)', scrollbarWidth: 'thin' }}
      >
        {grid.map((day, idx) => {
          const isCurrentMonth = day.getMonth() === month;
          const isToday        = sameDay(day, now);
          const dayEvents      = eventsForDay(day, events);
          const dayKey         = day.toISOString().slice(0, 10);
          const isExpanded     = expandedDay === dayKey;
          const hiddenCount    = dayEvents.length - MAX_VISIBLE;

          return (
            <div
              key={idx}
              className="flex flex-col p-1.5 cursor-pointer transition-colors hover:bg-gray-800/40 select-none"
              style={{
                borderRight:  (idx + 1) % 7 === 0 ? 'none' : '1px solid #1F2937',
                borderBottom: '1px solid #1F2937',
                minHeight: 80,
                opacity: isCurrentMonth ? 1 : 0.4,
              }}
              onClick={() => onDayClick(day)}
            >
              {/* Day number */}
              <div className="flex justify-end mb-1">
                <span
                  className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold"
                  style={
                    isToday
                      ? { background: '#3B82F6', color: 'white' }
                      : { color: isCurrentMonth ? '#E5E7EB' : '#6B7280' }
                  }
                >
                  {day.getDate()}
                </span>
              </div>

              {/* Event pills */}
              <div className="space-y-0.5 min-w-0">
                {(isExpanded ? dayEvents : dayEvents.slice(0, MAX_VISIBLE)).map(ev => {
                  const c = eventPillColor(ev, now);
                  return (
                    <button
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                      className="w-full text-left truncate text-[10px] px-1.5 py-0.5 rounded font-medium transition-all hover:opacity-80"
                      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                      title={ev.subject}
                    >
                      {ev.linkedSessionId && <span className="mr-0.5">🎙</span>}
                      {ev.subject}
                    </button>
                  );
                })}

                {!isExpanded && hiddenCount > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setExpandedDay(isExpanded ? null : dayKey); }}
                    className="w-full text-left text-[10px] px-1.5 py-0.5 rounded font-medium text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    +{hiddenCount} altri
                  </button>
                )}

                {isExpanded && (
                  <button
                    onClick={e => { e.stopPropagation(); setExpandedDay(null); }}
                    className="w-full text-left text-[10px] px-1.5 py-0.5 rounded font-medium text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    meno ▲
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
