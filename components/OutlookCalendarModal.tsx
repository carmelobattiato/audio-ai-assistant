import React, { useState, useEffect, useCallback, useRef } from 'react';

const OUTLOOK_API = '/api/outlook';

interface Attendee {
  name: string;
  email: string;
}

interface OutlookAppointment {
  id: string;
  subject: string;
  start: string;
  end: string;
  location: string;
  body: string;
  attendees: Attendee[];
  organizer: string;
  onlineMeetingUrl?: string;
}

type MeetingStatus = 'live' | 'next' | 'future' | 'past';

interface OutlookCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (title: string, noteHtml: string) => void;
  onOpenTeamsAndRecord?: (title: string, noteHtml: string, teamsUrl: string) => void;
}

const CalendarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const LocationIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const PeopleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function getMeetingStatus(
  appt: OutlookAppointment,
  now: Date,
  nextId: string | null,
): MeetingStatus {
  const start = new Date(appt.start);
  const end = new Date(appt.end);
  if (now >= start && now <= end) return 'live';
  if (appt.id === nextId) return 'next';
  if (end < now) return 'past';
  return 'future';
}

function buildNoteHtml(appt: OutlookAppointment): string {
  const attendeesList = appt.attendees.length > 0
    ? appt.attendees
        .map(a => `<li>${a.name}${a.email ? ` &lt;${a.email}&gt;` : ''}</li>`)
        .join('')
    : '<li><em>Nessun invitato trovato</em></li>';

  return `<div>
    <h3 style="color:#38bdf8;margin:0 0 10px">📅 ${appt.subject}</h3>
    <p style="margin:4px 0"><strong>🕐 Inizio:</strong> ${appt.start}</p>
    <p style="margin:4px 0"><strong>🕑 Fine:</strong> ${appt.end}</p>
    ${appt.location ? `<p style="margin:4px 0"><strong>📍 Luogo:</strong> ${appt.location}</p>` : ''}
    ${appt.organizer ? `<p style="margin:4px 0"><strong>👤 Organizzatore:</strong> ${appt.organizer}</p>` : ''}
    <p style="margin:10px 0 4px"><strong>👥 Invitati:</strong></p>
    <ul style="margin:0 0 0 18px;padding:0">${attendeesList}</ul>
    ${appt.body ? `<hr style="border:none;border-top:1px solid #374151;margin:12px 0"/>
    <p style="margin:0 0 4px"><strong>📝 Note riunione:</strong></p>
    <p style="white-space:pre-wrap;font-size:0.85em;color:#9ca3af;margin:0">${appt.body}</p>` : ''}
  </div>`;
}

/** Estrae l'URL Teams dall'appointment: prima la proprietà COM, poi dal corpo del testo. */
function extractTeamsUrl(appt: OutlookAppointment): string | null {
  if (appt.onlineMeetingUrl) return appt.onlineMeetingUrl;
  const match = appt.body?.match(/https:\/\/teams\.microsoft\.com\/l\/[^\s<>"']+/);
  return match?.[0] ?? null;
}

// Per-status Tailwind classes
const STATUS_CARD: Record<MeetingStatus, string> = {
  live:   'border-emerald-500/80 bg-emerald-900/20 shadow-emerald-900/30 shadow-md',
  next:   'border-amber-500/60 bg-amber-900/15',
  future: 'border-gray-700 bg-gray-900/40 hover:border-gray-500 hover:bg-gray-700/50',
  past:   'border-gray-700/50 bg-gray-900/20 opacity-50',
};
const STATUS_BAR: Record<MeetingStatus, string> = {
  live:   'bg-emerald-400',
  next:   'bg-amber-400',
  future: 'bg-blue-600',
  past:   'bg-gray-600',
};

export const OutlookCalendarModal: React.FC<OutlookCalendarModalProps> = ({
  isOpen,
  onClose,
  onImport,
  onOpenTeamsAndRecord,
}) => {
  const [appointments, setAppointments] = useState<OutlookAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [bridgeAvailable, setBridgeAvailable] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<OutlookAppointment | null>(null);

  const firstHighlightedRef = useRef<HTMLDivElement | null>(null);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setBridgeAvailable(null);
    try {
      const statusRes = await fetch(`${OUTLOOK_API}/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!statusRes.ok) throw new Error('Server non risponde');
      const statusData = await statusRes.json();
      if (statusData.status !== 'ok') throw new Error(statusData.message || 'Outlook non disponibile su questa piattaforma');
      setBridgeAvailable(true);

      const res = await fetch(`${OUTLOOK_API}/appointments/today`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAppointments(data.appointments ?? []);
    } catch (e: any) {
      setBridgeAvailable(false);
      setErrorMsg(e.message ?? 'Errore di connessione');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelected(null);
      setAppointments([]);
      fetchAppointments();
    }
  }, [isOpen, fetchAppointments]);

  // Auto-scroll to the first live/next meeting once data arrives
  useEffect(() => {
    if (appointments.length === 0) return;
    const id = setTimeout(() => {
      firstHighlightedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 120);
    return () => clearTimeout(id);
  }, [appointments]);

  const handleImport = () => {
    if (!selected) return;
    onImport(selected.subject, buildNoteHtml(selected));
    onClose();
  };

  const handleOpenTeams = () => {
    if (!selected) return;
    const url = extractTeamsUrl(selected);
    if (!url || !onOpenTeamsAndRecord) return;
    onOpenTeamsAndRecord(selected.subject, buildNoteHtml(selected), url);
  };

  if (!isOpen) return null;

  const now = new Date();
  const selectedTeamsUrl = selected ? extractTeamsUrl(selected) : null;
  const todayLabel = now.toLocaleDateString('it-IT', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // Find the single "next" meeting: first one that hasn't started yet
  const nextAppt = appointments
    .filter(a => new Date(a.start) > now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0];
  const nextId = nextAppt?.id ?? null;

  // First card that should receive auto-scroll focus
  const firstHighlightedId = appointments.find(a => {
    const s = getMeetingStatus(a, now, nextId);
    return s === 'live' || s === 'next';
  })?.id ?? null;

  const liveCount = appointments.filter(a => getMeetingStatus(a, now, nextId) === 'live').length;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center flex-shrink-0">
              <CalendarIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-sky-400 leading-tight">
                Sync Outlook Calendar
              </h3>
              <p className="text-xs text-gray-400 capitalize">{todayLabel}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors rounded p-1 ml-2"
            aria-label="Chiudi"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400 gap-3">
              <div className="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Reading Outlook calendar…</p>
            </div>
          )}

          {/* Bridge non disponibile */}
          {!loading && bridgeAvailable === false && (
            <div className="text-center py-10 space-y-3 px-4">
              <div className="text-4xl">⚠️</div>
              <p className="text-red-400 font-medium text-sm">Outlook Bridge unreachable</p>
              {errorMsg && (
                <p className="text-gray-500 text-xs font-mono bg-gray-900 rounded px-3 py-1 inline-block">
                  {errorMsg}
                </p>
              )}
              <p className="text-gray-400 text-sm max-w-sm mx-auto leading-relaxed">
                Make sure you are on <strong>Windows</strong> with Microsoft Outlook open
                and the Vite dev server running.
              </p>
              <button
                onClick={fetchAppointments}
                className="mt-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Nessuna riunione */}
          {!loading && bridgeAvailable && appointments.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">📭</div>
              <p className="font-medium text-sm">No meetings today</p>
              <p className="text-xs mt-1 text-gray-500">
                Your Outlook calendar shows no events for today.
              </p>
            </div>
          )}

          {/* Lista appuntamenti */}
          {!loading && bridgeAvailable && appointments.map(appt => {
            const status = getMeetingStatus(appt, now, nextId);
            const isSelected = selected?.id === appt.id;
            const isHighlightedCard = appt.id === firstHighlightedId;

            const cardClass = isSelected
              ? 'border-sky-500 bg-sky-900/25 shadow-md'
              : STATUS_CARD[status];

            const barClass = isSelected ? 'bg-sky-400' : STATUS_BAR[status];

            return (
              <div
                key={appt.id}
                ref={isHighlightedCard ? firstHighlightedRef : null}
                onClick={() => setSelected(appt)}
                className={`rounded-lg border p-3 cursor-pointer transition-all duration-150 select-none ${cardClass}`}
              >
                <div className="flex items-start gap-3">
                  {/* Barra colorata laterale */}
                  <div
                    className={`w-1 rounded-full flex-shrink-0 mt-0.5 ${barClass} ${status === 'live' ? 'animate-pulse' : ''}`}
                    style={{ minHeight: '44px' }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-semibold text-sm leading-tight truncate ${
                        status === 'live' ? 'text-emerald-100' :
                        status === 'next' ? 'text-amber-100' :
                        status === 'past' ? 'text-gray-500' : 'text-white'
                      }`}>
                        {appt.subject}
                      </p>

                      {/* Time + status badge */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatTime(appt.start)} – {formatTime(appt.end)}
                        </span>
                        {status === 'live' && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold uppercase tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                            Live
                          </span>
                        )}
                        {status === 'next' && (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
                            Next
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-3">
                      {appt.location && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <LocationIcon className="w-3 h-3" />
                          {appt.location}
                        </span>
                      )}
                      {appt.attendees.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <PeopleIcon className="w-3 h-3" />
                          {appt.attendees.length} attendee{appt.attendees.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dettaglio invitati (espanso quando selezionato) */}
                {isSelected && appt.attendees.length > 0 && (
                  <div className="mt-3 ml-4 pl-3 border-l border-sky-800 space-y-0.5">
                    <p className="text-xs text-sky-400 font-medium mb-1.5">Attendees:</p>
                    {appt.attendees.slice(0, 8).map((a, i) => (
                      <p key={i} className="text-xs text-gray-300 leading-snug">
                        {a.name}
                        {a.email && <span className="text-gray-500"> — {a.email}</span>}
                      </p>
                    ))}
                    {appt.attendees.length > 8 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        + {appt.attendees.length - 8} more attendee{appt.attendees.length - 8 !== 1 ? 's' : ''}…
                      </p>
                    )}
                  </div>
                )}

                {/* Preview note */}
                {isSelected && appt.body && (
                  <p className="mt-3 ml-4 text-xs text-gray-500 italic line-clamp-2 leading-snug">
                    {appt.body.slice(0, 160)}…
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-gray-700 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {appointments.length > 0 && (
              <span>{appointments.length} meeting{appointments.length !== 1 ? 's' : ''} today</span>
            )}
            {liveCount > 0 && (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                {liveCount} live
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!selected}
              className="px-4 py-1.5 text-sm font-semibold bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Import meeting
            </button>
            {onOpenTeamsAndRecord && selectedTeamsUrl && (
              <button
                onClick={handleOpenTeams}
                className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold bg-[#6264A7] hover:bg-[#4f51a0] text-white rounded-lg transition-colors"
                title="Opens Teams and starts the system audio recording guide"
              >
                {/* Teams icon */}
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.5 8.25a3 3 0 100-6 3 3 0 000 6zm1.5 1.5h-3a2.25 2.25 0 00-2.25 2.25v.75H18a3 3 0 013 3v2.25A2.25 2.25 0 0118.75 20H15a2.25 2.25 0 01-2.25-2.25V15a4.5 4.5 0 014.5-4.5h1.5A2.25 2.25 0 0121 12.75v2.25h-.75V17a.75.75 0 001.5 0v-4.25A2.25 2.25 0 0021 9.75zM13 6.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM8.25 9a4.5 4.5 0 014.5 4.5v5.25A2.25 2.25 0 0110.5 21h-4.5A2.25 2.25 0 013.75 18.75V13.5A4.5 4.5 0 018.25 9zm0 1.5a3 3 0 00-3 3v5.25c0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75V13.5a3 3 0 00-3-3z"/>
                </svg>
                Open Teams &amp; Record
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
