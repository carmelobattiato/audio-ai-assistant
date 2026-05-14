import React from 'react';
import type { MeetingToastData } from '../utils/meetingUtils';
import { MeetingNotificationCard } from './MeetingNotificationCard';

interface ToastProps {
  toast: MeetingToastData;
  onDismiss: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onOpen: (toast: MeetingToastData) => void;
  onStartSession: (toast: MeetingToastData) => void;
}

const SingleToast: React.FC<ToastProps> = ({ toast, onDismiss, onSnooze, onOpen, onStartSession }) => (
  <MeetingNotificationCard
    subject={toast.subject}
    organizer={toast.organizer}
    startIso={toast.startIso}
    endIso={toast.endIso}
    role={toast.role}
    summary={toast.summary}
    minutesToStart={toast.minutesToStart}
    variant="toast"
    onDismiss={() => onDismiss(toast.id)}
    actions={
      <>
        <button
          onClick={() => onOpen(toast)}
          className="text-[11px] px-2.5 py-1 rounded-md font-medium"
          style={{ background: 'rgba(124,58,237,0.4)', border: '1px solid rgba(167,139,250,0.5)', color: 'white' }}
          type="button"
        >
          Apri Calendar
        </button>
        <button
          onClick={() => { onStartSession(toast); onDismiss(toast.id); }}
          className="text-[11px] px-2.5 py-1 rounded-md font-medium"
          style={{ background: 'rgba(16,185,129,0.3)', border: '1px solid rgba(16,185,129,0.55)', color: '#a7f3d0' }}
          type="button"
          title="Apre una nuova scheda con il meeting precaricato e un countdown auto-record"
        >
          Avvia sessione
        </button>
        <button
          onClick={() => onSnooze(toast.id, 2)}
          className="text-[11px] px-2 py-1 rounded-md opacity-80 hover:opacity-100"
          style={{ background: 'rgba(75,85,99,0.5)', color: '#e5e7eb' }}
          type="button"
        >
          Snooze 2m
        </button>
        <button
          onClick={() => onSnooze(toast.id, 5)}
          className="text-[11px] px-2 py-1 rounded-md opacity-80 hover:opacity-100"
          style={{ background: 'rgba(75,85,99,0.5)', color: '#e5e7eb' }}
          type="button"
        >
          5m
        </button>
      </>
    }
  />
);

interface ContainerProps {
  toasts: MeetingToastData[];
  onDismiss: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onOpen: (toast: MeetingToastData) => void;
  onStartSession: (toast: MeetingToastData) => void;
}

export const MeetingNotificationToasts: React.FC<ContainerProps> = ({ toasts, onDismiss, onSnooze, onOpen, onStartSession }) => {
  if (toasts.length === 0) return null;
  return (
    <>
      <style>{`@keyframes meeting-toast-slide-in {
        from { transform: translateX(120%); opacity: 0; }
        to   { transform: translateX(0); opacity: 1; }
      }`}</style>
      <div
        className="fixed flex flex-col gap-2 pointer-events-none"
        style={{ top: '70px', right: '16px', zIndex: 9999 }}
      >
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <SingleToast toast={t} onDismiss={onDismiss} onSnooze={onSnooze} onOpen={onOpen} onStartSession={onStartSession} />
          </div>
        ))}
      </div>
    </>
  );
};
