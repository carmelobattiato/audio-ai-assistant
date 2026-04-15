import React, { useState, useEffect, useCallback } from 'react';

const BRIDGE_URL = 'http://127.0.0.1:5001';

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
}

interface OutlookCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Chiamata con il titolo della riunione e l'HTML della bubble note da creare */
  onImport: (title: string, noteHtml: string) => void;
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

export const OutlookCalendarModal: React.FC<OutlookCalendarModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [appointments, setAppointments] = useState<OutlookAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [bridgeAvailable, setBridgeAvailable] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<OutlookAppointment | null>(null);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setBridgeAvailable(null);
    try {
      const statusRes = await fetch(`${BRIDGE_URL}/api/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!statusRes.ok) throw new Error('Bridge non risponde');
      const statusData = await statusRes.json();
      if (statusData.status !== 'ok') throw new Error(statusData.message || 'Bridge non disponibile');
      setBridgeAvailable(true);

      const res = await fetch(`${BRIDGE_URL}/api/outlook/appointments/today`);
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

  const handleImport = () => {
    if (!selected) return;
    onImport(selected.subject, buildNoteHtml(selected));
    onClose();
  };

  if (!isOpen) return null;

  const todayLabel = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

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
                Sincronizza Calendario Outlook
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

        {/* ── Disclaimer ─────────────────────────────────────────────────── */}
        <div className="mx-4 mt-3 px-3 py-2 bg-amber-900/30 border border-amber-700/50 rounded-lg flex items-start gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-amber-300 leading-snug">
            Funzione disponibile solo su <strong>Windows</strong> con Microsoft Outlook installato.
            Richiede l'avvio del server{' '}
            <code className="bg-gray-700 px-1 rounded text-amber-200">outlook_bridge.py</code>{' '}
            tramite{' '}
            <code className="bg-gray-700 px-1 rounded text-amber-200">.\setup_and_run.ps1 start</code>.
          </p>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400 gap-3">
              <div className="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Connessione a Outlook in corso…</p>
            </div>
          )}

          {/* Bridge non disponibile */}
          {!loading && bridgeAvailable === false && (
            <div className="text-center py-10 space-y-3 px-4">
              <div className="text-4xl">⚠️</div>
              <p className="text-red-400 font-medium text-sm">Outlook Bridge non raggiungibile</p>
              {errorMsg && (
                <p className="text-gray-500 text-xs font-mono bg-gray-900 rounded px-3 py-1 inline-block">
                  {errorMsg}
                </p>
              )}
              <p className="text-gray-400 text-sm max-w-sm mx-auto leading-relaxed">
                Assicurati di aver eseguito{' '}
                <code className="bg-gray-700 px-1 rounded text-xs">.\setup_and_run.ps1 start</code>{' '}
                e che Microsoft Outlook sia aperto.
              </p>
              <button
                onClick={fetchAppointments}
                className="mt-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm rounded-lg transition-colors"
              >
                Riprova
              </button>
            </div>
          )}

          {/* Nessuna riunione */}
          {!loading && bridgeAvailable && appointments.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">📭</div>
              <p className="font-medium text-sm">Nessuna riunione oggi</p>
              <p className="text-xs mt-1 text-gray-500">
                Il calendario Outlook non mostra eventi per la giornata odierna.
              </p>
            </div>
          )}

          {/* Lista appuntamenti */}
          {!loading && bridgeAvailable && appointments.map(appt => {
            const isSelected = selected?.id === appt.id;
            return (
              <div
                key={appt.id}
                onClick={() => setSelected(appt)}
                className={`rounded-lg border p-3 cursor-pointer transition-all duration-150 select-none ${
                  isSelected
                    ? 'border-sky-500 bg-sky-900/25 shadow-md'
                    : 'border-gray-700 bg-gray-900/40 hover:border-gray-500 hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Barra colorata laterale */}
                  <div className={`w-1 rounded-full flex-shrink-0 mt-0.5 ${isSelected ? 'bg-sky-400' : 'bg-blue-600'}`}
                    style={{ minHeight: '44px' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-white text-sm leading-tight truncate">{appt.subject}</p>
                      <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                        {formatTime(appt.start)} – {formatTime(appt.end)}
                      </span>
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
                          {appt.attendees.length} invitati
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dettaglio invitati (espanso quando selezionato) */}
                {isSelected && appt.attendees.length > 0 && (
                  <div className="mt-3 ml-4 pl-3 border-l border-sky-800 space-y-0.5">
                    <p className="text-xs text-sky-400 font-medium mb-1.5">Invitati:</p>
                    {appt.attendees.slice(0, 8).map((a, i) => (
                      <p key={i} className="text-xs text-gray-300 leading-snug">
                        {a.name}
                        {a.email && <span className="text-gray-500"> — {a.email}</span>}
                      </p>
                    ))}
                    {appt.attendees.length > 8 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        + altri {appt.attendees.length - 8} invitati…
                      </p>
                    )}
                  </div>
                )}

                {/* Preview note (solo prima riga) */}
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
        <div className="px-5 py-3 border-t border-gray-700 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            {appointments.length > 0
              ? `${appointments.length} riunion${appointments.length === 1 ? 'e' : 'i'} oggi`
              : ''}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              Annulla
            </button>
            <button
              onClick={handleImport}
              disabled={!selected}
              className="px-4 py-1.5 text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Importa riunione
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
