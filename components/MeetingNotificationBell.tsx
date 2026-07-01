import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MeetingNotificationRecord } from '../utils/db';
import { MeetingNotificationCard } from './MeetingNotificationCard';

interface Props {
  records: MeetingNotificationRecord[];
  onOpenCalendar: () => void;
  onStartSessionForMeeting: (rec: MeetingNotificationRecord) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  // Unified notification surface
  activeMeetingIds?: Set<string>;
  forceOpen?: boolean;
  onForceOpenHandled?: () => void;
  onSnooze?: (id: string, minutes: number) => void;
  onActiveItemDismiss?: (id: string) => void;
}

export const MeetingNotificationBell: React.FC<Props> = ({
  records, onOpenCalendar, onStartSessionForMeeting, onDelete, onClearAll,
  activeMeetingIds, forceOpen, onForceOpenHandled, onSnooze, onActiveItemDismiss,
}) => {
  const [open, setOpen] = useState(false);
  const [shaking, setShaking] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);
  const hasActiveRef = useRef(false);

  // Click-outside closes panel
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        clearAutoCloseTimer();
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const clearAutoCloseTimer = () => {
    if (autoCloseTimerRef.current !== null) {
      window.clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  // Cancel auto-close when user interacts with panel
  const handlePanelInteraction = () => {
    clearAutoCloseTimer();
  };

  // Auto-open when forceOpen fires
  useEffect(() => {
    if (!forceOpen) return;
    setOpen(true);
    setShaking(true);
    onForceOpenHandled?.();

    // Shake animation: reset after 600ms
    const shakeTimer = window.setTimeout(() => setShaking(false), 600);

    // Auto-close after 10s if no interaction
    clearAutoCloseTimer();
    autoCloseTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      autoCloseTimerRef.current = null;
    }, 30_000);

    return () => {
      window.clearTimeout(shakeTimer);
    };
  }, [forceOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shake when a new active notification arrives (without forceOpen)
  const activeCount = activeMeetingIds?.size ?? 0;
  useEffect(() => {
    if (activeCount > 0 && !hasActiveRef.current) {
      setShaking(true);
      window.setTimeout(() => setShaking(false), 600);
    }
    hasActiveRef.current = activeCount > 0;
  }, [activeCount]);

  const now = Date.now();
  // Active items first, then newest-first by shownAt/startIso
  const sorted = useMemo(() => {
    return [...records].sort((a, b) => {
      const aActive = activeMeetingIds?.has(a.id) ? 1 : 0;
      const bActive = activeMeetingIds?.has(b.id) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const aT = a.shownAt ?? new Date(a.startIso).getTime();
      const bT = b.shownAt ?? new Date(b.startIso).getTime();
      return bT - aT;
    });
  }, [records, activeMeetingIds]);

  const count = sorted.length;

  return (
    <>
      <style>{`@keyframes bell-shake {
        0%,100% { transform: rotate(0deg); }
        15%      { transform: rotate(-18deg); }
        35%      { transform: rotate(16deg); }
        55%      { transform: rotate(-12deg); }
        75%      { transform: rotate(8deg); }
        90%      { transform: rotate(-4deg); }
      }
      @keyframes meeting-toast-slide-in {
        from { transform: translateX(120%); opacity: 0; }
        to   { transform: translateX(0); opacity: 1; }
      }`}</style>

      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => { setOpen(o => !o); clearAutoCloseTimer(); }}
          className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-all hover:scale-105"
          style={{
            background: activeCount > 0 ? 'rgba(56,189,248,0.15)' : 'var(--neo-card)',
            border: `1px solid ${activeCount > 0 ? 'rgba(56,189,248,0.5)' : 'var(--neo-border)'}`,
            color: activeCount > 0 ? '#7dd3fc' : 'var(--neo-primary-l)',
          }}
          title={`${count} notification${count === 1 ? '' : 's'} today`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            style={{ animation: shaking ? 'bell-shake 0.6s ease-in-out' : undefined }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.6V5a2 2 0 10-4 0v.4A6 6 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" />
          </svg>
          {count > 0 && (
            <span
              className="absolute -top-1 -right-1 text-[10px] font-bold rounded-full flex items-center justify-center"
              style={{
                minWidth: '16px', height: '16px', padding: '0 4px',
                background: activeCount > 0 ? '#0ea5e9' : '#ef4444',
                color: 'white',
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
            onMouseEnter={handlePanelInteraction}
            onClick={handlePanelInteraction}
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
                  const isActive = activeMeetingIds?.has(r.id) ?? false;
                  const isNewest = !isActive && idx === (activeMeetingIds?.size ?? 0) && !sorted.slice(0, idx).some(x => !(activeMeetingIds?.has(x.id)));
                  const startMs = new Date(r.startIso).getTime();
                  const minutesToStart = Math.max(0, Math.round((startMs - now) / 60_000));

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
                      isActive={isActive}
                      minutesToStart={minutesToStart}
                      onDismiss={() => {
                        if (isActive && onActiveItemDismiss) {
                          onActiveItemDismiss(r.id);
                        } else {
                          onDelete(r.id);
                        }
                      }}
                      actions={
                        isActive ? (
                          <>
                            <button
                              type="button"
                              onClick={() => { onStartSessionForMeeting(r); setOpen(false); }}
                              className="text-[10px] px-2 py-1 rounded font-medium"
                              style={{ background: 'rgba(16,185,129,0.25)', border: '1px solid rgba(16,185,129,0.5)', color: '#a7f3d0' }}
                            >
                              Start session
                            </button>
                            <button
                              type="button"
                              onClick={() => onSnooze?.(r.id, 2)}
                              className="text-[10px] px-2 py-1 rounded opacity-80 hover:opacity-100"
                              style={{ background: 'rgba(75,85,99,0.5)', color: '#e5e7eb' }}
                            >
                              Snooze 2m
                            </button>
                            <button
                              type="button"
                              onClick={() => onSnooze?.(r.id, 5)}
                              className="text-[10px] px-2 py-1 rounded opacity-80 hover:opacity-100"
                              style={{ background: 'rgba(75,85,99,0.5)', color: '#e5e7eb' }}
                            >
                              5m
                            </button>
                          </>
                        ) : !isPast ? (
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
    </>
  );
};
