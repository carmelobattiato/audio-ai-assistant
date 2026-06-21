import React, { useState } from 'react';
import { SavedSession } from '@/types';

// ─── Local types (mirrors CalendarEventRecord from types.ts) ──────────────────
export interface CalendarEventRecord {
  id: string;
  subject: string;
  start: string;
  end: string;
  location?: string;
  organizer?: string;
  attendees?: Array<{ name: string; email: string; type?: 'required' | 'optional' }>;
  onlineMeetingUrl?: string;
  body?: string;
  responseStatus?: string;
  source: 'windows' | 'ics' | 'extension';
  linkedSessionId?: string;
  createdAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function openTeamsLink(url: string): void {
  const msteamsUrl = url.replace(/^https:\/\/teams\.microsoft\.com/, 'msteams://teams.microsoft.com');
  const a = document.createElement('a');
  a.href = msteamsUrl;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function extractTeamsUrl(ev: CalendarEventRecord): string | null {
  if (ev.onlineMeetingUrl) return ev.onlineMeetingUrl;
  const match = ev.body?.match(/https:\/\/teams\.microsoft\.com\/l\/[^\s<>"']+/);
  return match?.[0] ?? null;
}

function buildNoteHtml(ev: CalendarEventRecord): string {
  const attendeesList = (ev.attendees && ev.attendees.length > 0)
    ? ev.attendees.map(a => `<li>${a.name}${a.email ? ` &lt;${a.email}&gt;` : ''}</li>`).join('')
    : '<li><em>Nessun invitato trovato</em></li>';
  return `<div>
    <h3 style="color:#38bdf8;margin:0 0 10px">📅 ${ev.subject}</h3>
    <p style="margin:4px 0"><strong>🕐 Inizio:</strong> ${ev.start}</p>
    <p style="margin:4px 0"><strong>🕑 Fine:</strong> ${ev.end}</p>
    ${ev.location ? `<p style="margin:4px 0"><strong>📍 Luogo:</strong> ${ev.location}</p>` : ''}
    ${ev.organizer ? `<p style="margin:4px 0"><strong>👤 Organizzatore:</strong> ${ev.organizer}</p>` : ''}
    <p style="margin:10px 0 4px"><strong>👥 Invitati:</strong></p>
    <ul style="margin:0 0 0 18px;padding:0">${attendeesList}</ul>
    ${ev.body ? `<p style="margin:14px 0 4px"><strong>📝 Note riunione:</strong></p><p style="margin:0;white-space:pre-wrap;color:#9CA3AF">${ev.body}</p>` : ''}
  </div>`;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface CalEventDetailPanelProps {
  event: CalendarEventRecord | null;
  sessions: SavedSession[];
  onClose: () => void;
  onLinkSession: (eventId: string, sessionId: string) => void;
  onUnlinkSession: (eventId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onLoadInfo?: (eventId: string, title: string, noteHtml: string, attendees: Array<{ name: string; email: string; type?: 'required' | 'optional' }>) => void;
  onLoadAndSchedule?: (eventId: string, title: string, noteHtml: string, attendees: Array<{ name: string; email: string; type?: 'required' | 'optional' }>, startIso: string, subject: string) => void;
  onOpenTeamsAndRecord?: (eventId: string, title: string, noteHtml: string, teamsUrl: string, attendees: Array<{ name: string; email: string; type?: 'required' | 'optional' }>) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const CalEventDetailPanel: React.FC<CalEventDetailPanelProps> = ({
  event,
  sessions,
  onClose,
  onLinkSession,
  onUnlinkSession,
  onOpenSession,
  onLoadInfo,
  onLoadAndSchedule,
  onOpenTeamsAndRecord,
}) => {
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);

  if (!event) return null;

  const eventDate = new Date(event.start);
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

  const nearbySessions = sessions.filter(s => {
    const diff = Math.abs(s.timestamp - eventDate.getTime());
    return diff <= twoDaysMs;
  });

  const linkedSession = event.linkedSessionId
    ? sessions.find(s => s.id === event.linkedSessionId)
    : null;

  const transcriptPreview = linkedSession?.data.transcribedText
    ? linkedSession.data.transcribedText.slice(0, 200) + (linkedSession.data.transcribedText.length > 200 ? '…' : '')
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
        style={{
          width: 380,
          background: '#1F2937',
          borderLeft: '1px solid #374151',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #374151', background: 'rgba(124,58,237,0.08)' }}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-snug text-gray-100 truncate">
              {event.subject}
            </h2>
            <p className="text-[11px] mt-1 text-gray-400">
              {fmtDate(event.start)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg flex-shrink-0 transition-colors hover:bg-gray-700"
            style={{ color: '#9CA3AF', border: '1px solid #374151' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ scrollbarWidth: 'thin' }}>

          {/* Time & basic meta */}
          <div className="space-y-2">
            <div
              className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#C4B5FD' }}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {fmt(event.start)} – {fmt(event.end)}
            </div>

            {event.location && (
              <div
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#C4B5FD' }}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {event.location}
              </div>
            )}

            {event.organizer && (
              <div
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#C4B5FD' }}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {event.organizer}
              </div>
            )}

            {/* Teams button */}
            {event.onlineMeetingUrl && (
              <button
                onClick={() => openTeamsLink(event.onlineMeetingUrl!)}
                className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-all hover:scale-[1.02]"
                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#A5B4FC' }}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.847v6.306a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
                Apri in Teams
              </button>
            )}
          </div>

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 text-gray-400">
                Partecipanti ({event.attendees.length})
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {event.attendees.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.1)' }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: 'rgba(124,58,237,0.25)', color: '#A78BFA' }}
                    >
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate text-gray-200">{a.name}</p>
                      {a.email && <p className="text-[10px] truncate text-gray-500">{a.email}</p>}
                    </div>
                    {a.type && (
                      <span
                        className="ml-auto text-[9px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          background: a.type === 'required' ? 'rgba(124,58,237,0.2)' : 'rgba(75,85,99,0.2)',
                          color: a.type === 'required' ? '#C4B5FD' : '#9CA3AF',
                        }}
                      >
                        {a.type === 'required' ? 'Req' : 'Opt'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Recording section ──────────────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 text-gray-400">
              Registrazione
            </p>

            {linkedSession ? (
              /* Has linked session */
              <div
                className="rounded-xl p-3 space-y-3"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">🎙</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-emerald-300 truncate">
                      {linkedSession.name}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {new Date(linkedSession.timestamp).toLocaleDateString('it-IT', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                      {' · '}
                      {linkedSession.status}
                    </p>
                  </div>
                </div>

                {transcriptPreview && (
                  <p
                    className="text-[11px] leading-relaxed rounded-lg p-2"
                    style={{ background: 'rgba(0,0,0,0.2)', color: '#9CA3AF', fontStyle: 'italic' }}
                  >
                    "{transcriptPreview}"
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => onOpenSession(linkedSession.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02]"
                    style={{ background: 'linear-gradient(135deg,#10B981,#7C3AED)', color: 'white' }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Apri Sessione
                  </button>
                  <button
                    onClick={() => onUnlinkSession(event.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-red-900/30"
                    style={{ color: '#F87171', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }}
                    title="Scollega sessione"
                  >
                    Scollega
                  </button>
                </div>
              </div>
            ) : (
              /* No linked session */
              <div
                className="rounded-xl p-3 space-y-3"
                style={{ background: 'rgba(75,85,99,0.15)', border: '1px solid rgba(75,85,99,0.3)' }}
              >
                <p className="text-xs text-gray-400">
                  Nessuna registrazione collegata a questo evento.
                </p>

                {nearbySessions.length > 0 ? (
                  <div>
                    <button
                      onClick={() => setShowSessionDropdown(prev => !prev)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-gray-700/50"
                      style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#C4B5FD' }}
                    >
                      <span className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        Collega Sessione ({nearbySessions.length})
                      </span>
                      <svg
                        className={`w-3.5 h-3.5 transition-transform ${showSessionDropdown ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {showSessionDropdown && (
                      <div
                        className="mt-1 rounded-lg overflow-hidden"
                        style={{ border: '1px solid rgba(139,92,246,0.2)', background: '#111827' }}
                      >
                        {nearbySessions.map(s => (
                          <button
                            key={s.id}
                            onClick={() => {
                              onLinkSession(event.id, s.id);
                              setShowSessionDropdown(false);
                            }}
                            className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-gray-800/60 transition-colors border-b border-gray-800 last:border-b-0"
                          >
                            <span className="text-sm mt-0.5">🎙</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-gray-200 truncate">{s.name}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                {new Date(s.timestamp).toLocaleDateString('it-IT', {
                                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                                })}
                                {isSameDay(new Date(s.timestamp), new Date(event.start)) && (
                                  <span className="ml-1.5 text-emerald-500">• stesso giorno</span>
                                )}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    Nessuna sessione nelle vicinanze (±2 giorni).
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Source badge */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">Sorgente:</span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={
                event.source === 'extension'
                  ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6EE7B7' }
                  : event.source === 'ics'
                  ? { background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: '#FCD34D' }
                  : { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#C4B5FD' }
              }
            >
              <span
                style={{
                  width: 5, height: 5, borderRadius: '50%', display: 'inline-block',
                  background: event.source === 'extension' ? '#10B981' : event.source === 'ics' ? '#F59E0B' : '#8B5CF6',
                }}
              />
              {event.source === 'extension' ? 'Outlook Live' : event.source === 'ics' ? 'ICS Feed' : 'Outlook COM'}
            </span>
          </div>

        </div>

        {/* Footer — action buttons */}
        {(onLoadInfo || onLoadAndSchedule || onOpenTeamsAndRecord) && (() => {
          const teamsUrl = extractTeamsUrl(event);
          const noteHtml = buildNoteHtml(event);
          const attendees = event.attendees ?? [];
          return (
            <div
              className="flex-shrink-0 px-4 py-3 flex flex-wrap gap-2"
              style={{ borderTop: '1px solid #374151', background: 'rgba(124,58,237,0.04)' }}
            >
              {teamsUrl && onOpenTeamsAndRecord && (
                <button
                  onClick={() => { onOpenTeamsAndRecord(event.id, event.subject, noteHtml, teamsUrl, attendees); onClose(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                  style={{ background: 'rgba(124,58,237,0.3)', border: '1px solid rgba(139,92,246,0.5)', color: '#C4B5FD' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.847v6.306a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                  </svg>
                  Teams + Rec
                </button>
              )}
              {onLoadInfo && (
                <button
                  onClick={() => { onLoadInfo(event.id, event.subject, noteHtml, attendees); onClose(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#C026D3)', color: 'white' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Load Info
                </button>
              )}
              {onLoadAndSchedule && (
                <button
                  onClick={() => { onLoadAndSchedule(event.id, event.subject, noteHtml, attendees, event.start, event.subject); onClose(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
                  style={{ background: 'linear-gradient(135deg,#10B981,#7C3AED)', color: 'white' }}
                  title="Carica info e imposta countdown per avvio automatico alla riunione"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Load & Schedule
                </button>
              )}
            </div>
          );
        })()}

      </div>
    </>
  );
};
