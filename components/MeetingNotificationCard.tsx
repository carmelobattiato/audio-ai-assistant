import React from 'react';

// Shared visual surface for both the popup toast and the bell-dropdown entry —
// guarantees the two stay in sync. The card itself is style-only; the parent
// decides which action buttons to render via the `actions` slot.

export type CardRole = 'organizer' | 'required' | 'optional' | 'unknown';

export const cardRoleColor = (role: CardRole): string => {
  switch (role) {
    case 'organizer': return '#a78bfa';
    case 'required':  return '#fb7185';
    case 'optional':  return '#fbbf24';
    default:          return '#9ca3af';
  }
};

export const cardRoleLabel = (role: CardRole): string => {
  switch (role) {
    case 'organizer': return "Sei l'organizzatore";
    case 'required':  return 'Sei richiesto (To)';
    case 'optional':  return 'Sei opzionale (CC)';
    default:          return '';
  }
};

const fmtTime = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
};

export interface MeetingNotificationCardProps {
  subject: string;
  organizer: string;
  startIso: string;
  endIso?: string;
  role: CardRole;
  summary?: string;
  minutesToStart?: number;        // shown only on toasts (variant='toast')
  variant: 'toast' | 'panel';
  isPast?: boolean;
  isNewest?: boolean;             // shows "Recente" badge in the panel variant
  onDismiss: () => void;
  actions: React.ReactNode;       // buttons row at the bottom
}

export const MeetingNotificationCard: React.FC<MeetingNotificationCardProps> = ({
  subject, organizer, startIso, endIso, role, summary,
  minutesToStart, variant, isPast, isNewest,
  onDismiss, actions,
}) => {
  const isToast = variant === 'toast';
  const headerLine = isToast
    ? `📅 In ${minutesToStart ?? 0}m · ${fmtTime(startIso)}${endIso ? `–${fmtTime(endIso)}` : ''}`
    : `📅 ${fmtTime(startIso)}${endIso ? `–${fmtTime(endIso)}` : ''}`;
  const roleLabel = cardRoleLabel(role);
  const accent = cardRoleColor(role);

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{
        width: isToast ? '380px' : '100%',
        background: isPast
          ? 'linear-gradient(135deg, rgba(55,65,81,0.6), rgba(31,41,55,0.6))'
          : 'linear-gradient(135deg, rgba(30,41,59,0.98), rgba(15,23,42,0.98))',
        border: `1px solid ${isPast ? 'rgba(107,114,128,0.4)' : 'rgba(124,58,237,0.45)'}`,
        color: '#f1f5f9',
        opacity: isPast ? 0.7 : 1,
        boxShadow: isToast ? '0 10px 30px rgba(0,0,0,0.4)' : 'none',
        animation: isToast ? 'meeting-toast-slide-in 0.35s ease-out' : undefined,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: accent }} />

      <div className="p-3 pl-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isNewest && !isToast && (
                <span
                  className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(16,185,129,0.3)', color: '#a7f3d0', letterSpacing: '0.05em' }}
                  title="Notifica più recente"
                >
                  Recente
                </span>
              )}
              <span className="text-[11px] uppercase tracking-wider opacity-70">{headerLine}</span>
              {isPast && (
                <span className="text-[9px] uppercase px-1 py-0.5 rounded" style={{ background: 'rgba(107,114,128,0.5)', color: '#e5e7eb', letterSpacing: '0.05em' }}>
                  Terminata
                </span>
              )}
            </div>
            <div className="font-semibold text-[13px] mt-0.5 leading-tight">{subject}</div>
            <div className="text-[11px] mt-1 opacity-90">
              <span className="opacity-70">Da:</span> {organizer}
              {roleLabel && (
                <>
                  {' · '}
                  <span style={{ color: accent, fontWeight: 600 }}>{roleLabel}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-white text-lg leading-none flex-shrink-0"
            title="Elimina"
            type="button"
          >
            ×
          </button>
        </div>

        {summary && (
          <p className="text-[12px] mt-2 leading-relaxed opacity-90" style={{ whiteSpace: 'pre-wrap' }}>
            {summary}
          </p>
        )}

        {actions && <div className="flex items-center gap-2 mt-3 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
};
