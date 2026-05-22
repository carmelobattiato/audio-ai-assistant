import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MeetingNotificationRecord } from '../utils/db';
import { MeetingNotificationCard } from './MeetingNotificationCard';

interface Props {
  records: MeetingNotificationRecord[];
  onOpenCalendar: () => void;
  onStartSessionForMeeting: (rec: MeetingNotificationRecord) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export const MeetingNotificationBell: React.FC<Props> = ({ records, onOpenCalendar, onStartSessionForMeeting, onDelete, onClearAll }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const now = Date.now();
  // Newest first: order by when the toast fired (shownAt), fallback to startIso
  const sorted = useMemo(() => {
    return [...records].sort((a, b) => {
      const aT = a.shownAt ?? new Date(a.startIso).getTime();
      const bT = b.shownAt ?? new Date(b.startIso).getTime();
      return bT - aT;
    });
  }, [records]);

  const count = sorted.length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-all hover:scale-105"
        style={{
          background: 'var(--neo-card)',
          border: '1px solid var(--neo-border)',
          color: 'var(--neo-primary-l)',
        }}
        title={`${count} notification${count === 1 ? '' : 's'} today`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.6V5a2 2 0 10-4 0v.4A6 6 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" />
        </svg>
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 text-[10px] font-bold rounded-full flex items-center justify-center"
            style={{
              minWidth: '16px', height: '16px', padding: '0 4px',
              background: '#ef4444', color: 'white',
              border: '1.5px solid var(--neo-bg, #0f172a)',
            }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 rounded-xl shadow-2xl overflow-hidden"
          style={{
            width: '400px', maxHeight: '560px',
            background: 'rgba(15,23,42,0.98)',
            border: '1px solid rgba(124,58,237,0.4)',
            backdropFilter: 'blur(16px)',
            zIndex: 9998,
          }}
        >
          <div className="px-3 py-2 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid rgba(124,58,237,0.25)' }}>
            <span className="text-xs font-semibold text-sky-300">Today's notifications</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { onOpenCalendar(); setOpen(false); }}
                className="text-[11px] text-violet-300 hover:text-violet-100"
              >
                Open Calendar
              </button>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => { if (window.confirm('Delete all notifications?')) onClearAll(); }}
                  className="text-[11px] text-red-300 hover:text-red-100"
                  title="Delete all notifications"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto p-2 space-y-2" style={{ maxHeight: '510px' }}>
            {sorted.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-gray-400">
                No notifications yet.<br />
                <span className="opacity-70">Today's meetings will appear here when the alarm fires.</span>
              </div>
            ) : (
              sorted.map((r, idx) => {
                const endMs = r.endIso ? new Date(r.endIso).getTime() : 0;
                const isPast = endMs > 0 && endMs < now;
                const isNewest = idx === 0;
                return (
                  <MeetingNotificationCard
                    key={r.id}
                    subject={r.subject}
                    organizer={r.organizer}
                    startIso={r.startIso}
                    endIso={r.endIso}
                    role={r.role}
                    summary={r.summary}
                    variant="panel"
                    isPast={isPast}
                    isNewest={isNewest}
                    onDismiss={() => onDelete(r.id)}
                    actions={
                      !isPast ? (
                        <button
                          type="button"
                          onClick={() => { onStartSessionForMeeting(r); setOpen(false); }}
                          className="text-[10px] px-2 py-1 rounded font-medium"
                          style={{ background: 'rgba(16,185,129,0.25)', border: '1px solid rgba(16,185,129,0.5)', color: '#a7f3d0' }}
                        >
                          Start session
                        </button>
                      ) : null
                    }
                  />
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
