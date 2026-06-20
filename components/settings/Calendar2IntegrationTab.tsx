import React, { useState, useEffect } from 'react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import {
  loadIcsConfig, saveIcsConfig, clearIcsConfig, fetchIcs,
  loadCalendarSource, saveCalendarSource, type CalendarSource,
} from '../../services/icsService';

const HEARTBEAT_KEY = 'calendar:extension-heartbeat';
const HEARTBEAT_STALE_MS = 90_000; // 90s — extension heartbeats every 30s

const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.platform);

function osLabel(): string {
  if (typeof navigator === 'undefined') return 'this OS';
  const p = navigator.platform.toLowerCase();
  if (p.startsWith('win')) return 'Windows';
  if (p.startsWith('mac')) return 'macOS';
  if (p.startsWith('linux')) return 'Linux';
  return 'this OS';
}

function isExtensionConnected(): boolean {
  const ts = localStorage.getItem(HEARTBEAT_KEY);
  if (!ts) return false;
  return (Date.now() - parseInt(ts, 10)) < HEARTBEAT_STALE_MS;
}

export const Calendar2IntegrationTab: React.FC = () => {
  const initial = loadIcsConfig();
  const [icsUrl, setIcsUrl] = useState(initial?.icsUrl || '');
  const [source, setSource] = useState<CalendarSource>(loadCalendarSource());
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [extConnected, setExtConnected] = useState(isExtensionConnected);

  // Refresh extension status every 5s while this tab is open
  useEffect(() => {
    const t = setInterval(() => setExtConnected(isExtensionConnected()), 5_000);
    return () => clearInterval(t);
  }, []);

  const sourceLabel = (s: CalendarSource) => {
    if (s === 'windows') return 'Windows COM bridge';
    if (s === 'ics') return 'ICS feed';
    return 'Browser Extension';
  };

  const handleSource = (s: CalendarSource) => {
    setSource(s);
    saveCalendarSource(s);
    setStatus(`Source set to: ${sourceLabel(s)}. Reload calendar to apply.`);
  };

  const handleSave = () => {
    const u = icsUrl.trim();
    if (!u) { setStatus('ICS URL required'); return; }
    if (!/^https:\/\//i.test(u)) { setStatus('URL must start with https://'); return; }
    saveIcsConfig({ icsUrl: u });
    setStatus('Configuration saved');
  };

  const handleTest = async () => {
    const u = icsUrl.trim();
    if (!u) { setStatus('Enter URL first'); return; }
    setBusy(true);
    setStatus('Testing…');
    try {
      const events = await fetchIcs(u);
      setStatus(`✅ OK · ${events.length} events fetched`);
    } catch (e) {
      setStatus(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    clearIcsConfig();
    setIcsUrl('');
    setStatus('ICS configuration cleared');
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Calendar source</h3>
        <p className="text-sm text-gray-400">
          Choose how the Calendar button fetches your appointments.
        </p>
      </div>

      {/* ── Source selection ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        {/* Windows COM bridge */}
        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${source === 'windows' ? 'border-violet-500 bg-violet-900/10' : 'border-gray-700 bg-gray-800/30'} ${!isWindows ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <input
            type="radio"
            name="calsrc"
            value="windows"
            checked={source === 'windows'}
            disabled={!isWindows}
            onChange={() => handleSource('windows')}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-100">Windows COM bridge</div>
            <div className="text-xs text-gray-400">
              Reads from Outlook desktop via PowerShell. Rich data: attendees, Teams URL, response status, body.
              {!isWindows && <span className="text-amber-300"> · Not available on {osLabel()}</span>}
            </div>
          </div>
        </label>

        {/* ICS feed */}
        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${source === 'ics' ? 'border-violet-500 bg-violet-900/10' : 'border-gray-700 bg-gray-800/30'}`}>
          <input
            type="radio"
            name="calsrc"
            value="ics"
            checked={source === 'ics'}
            onChange={() => handleSource('ics')}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-100">ICS feed (published Outlook calendar)</div>
            <div className="text-xs text-gray-400">
              Reads from a public ICS URL. Cross-platform (Mac/Linux/Windows). Read-only, refresh latency 1–3h
              (managed by Microsoft).
              {!isWindows && <span className="text-emerald-300"> · Recommended for non-Windows.</span>}
            </div>
          </div>
        </label>

        {/* Browser Extension bridge */}
        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${source === 'extension' ? 'border-violet-500 bg-violet-900/10' : 'border-gray-700 bg-gray-800/30'}`}>
          <input
            type="radio"
            name="calsrc"
            value="extension"
            checked={source === 'extension'}
            onChange={() => handleSource('extension')}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-100">Browser Extension bridge</span>
              {extConnected
                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-900/30 text-emerald-300 border border-emerald-700/40">● Connessa</span>
                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-800/60 text-gray-500 border border-gray-700/40">○ Non rilevata</span>
              }
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Legge il calendario direttamente dal tab Outlook Live già aperto nel browser.
              Funziona indipendentemente dalle policy del tenant. Richiede installazione dell'extension.
            </div>
          </div>
        </label>
      </div>

      {/* ── ICS config ────────────────────────────────────────────────────── */}
      {source === 'ics' && (
        <>
          <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 text-xs text-gray-300 space-y-1">
            <p className="font-semibold text-gray-200">How to get your ICS URL from Outlook Web:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-gray-400">
              <li>Open <span className="text-violet-300">outlook.office.com</span> (or outlook.live.com)</li>
              <li>⚙️ Settings → <span className="text-violet-300">Calendar → Shared calendars</span></li>
              <li>Under <span className="text-violet-300">"Publish a calendar"</span>, select your calendar</li>
              <li>Permissions: <span className="text-violet-300">"Can view all details"</span> → Publish</li>
              <li>Copy the <span className="text-violet-300">ICS link</span> (ends in <code>.ics</code>) and paste below</li>
            </ol>
            <p className="text-[11px] text-amber-300/80 mt-2">
              ⚠️ Anyone with the URL can read your calendar. Treat it as a secret.
            </p>
          </div>

          <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 text-xs text-amber-200/90">
            <p className="font-semibold mb-1">⚠️ Tenant policy disclaimer</p>
            <p>
              Calendar publishing is controlled by your Microsoft 365 tenant administrator. If the
              "Publish a calendar" option is missing, greyed out, or rejects the operation, it means
              your organization's admin has disabled external calendar sharing — this is a server-side
              policy and <span className="font-semibold">does not depend on this application</span>.
              Contact your IT administrator or use the Browser Extension source instead.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Calendar ICS URL</label>
            <Input
              value={icsUrl}
              onChange={(e) => setIcsUrl(e.target.value)}
              placeholder="https://outlook.office365.com/owa/calendar/.../calendar.ics"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} variant="primary" disabled={busy}>Save</Button>
            <Button onClick={handleTest} variant="secondary" disabled={busy || !icsUrl.trim()}>Test fetch</Button>
            <Button onClick={handleClear} variant="ghost" disabled={busy}>Clear</Button>
          </div>
        </>
      )}

      {/* ── Extension config ───────────────────────────────────────────────── */}
      {source === 'extension' && (
        <div className="space-y-4">
          {/* Status */}
          <div className={`rounded-lg p-3 text-sm border ${extConnected ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-300' : 'bg-gray-800/40 border-gray-700 text-gray-400'}`}>
            {extConnected
              ? '✅ Extension connessa — il calendario si sincronizza automaticamente quando apri Outlook Live.'
              : '⏳ Extension non rilevata. Installa l\'extension e apri outlook.live.com per attivare la sincronizzazione.'
            }
          </div>

          {/* Download */}
          <div className="bg-violet-900/20 border border-violet-700/40 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-violet-200">Calendar Bridge Extension</p>
                <p className="text-xs text-gray-400 mt-0.5">Chrome / Edge · Manifest V3 · ~20 KB</p>
              </div>
              <a
                href="/calendar-extension.zip"
                download="calendar-extension.zip"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #C026D3)', boxShadow: '0 0 16px rgba(124,58,237,0.35)' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Scarica .zip
              </a>
            </div>
          </div>

          {/* Installation guide */}
          <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 text-xs text-gray-300 space-y-2">
            <p className="font-semibold text-gray-200">Guida installazione</p>
            <ol className="list-none space-y-2 text-gray-400">
              {[
                { n: '1', text: 'Scarica il file <code class="text-violet-300">calendar-extension.zip</code> e decomprimi in una cartella.' },
                { n: '2', text: 'Apri <span class="text-violet-300">chrome://extensions</span> (o <span class="text-violet-300">edge://extensions</span>).' },
                { n: '3', text: 'Attiva <span class="text-violet-300">Modalità sviluppatore</span> (toggle in alto a destra).' },
                { n: '4', text: 'Clicca <span class="text-violet-300">Carica estensione non pacchettizzata</span> → seleziona la cartella decompressa.' },
                { n: '5', text: 'L\'icona <strong>Calendar Bridge</strong> appare nella barra del browser.' },
                { n: '6', text: 'Apri <span class="text-violet-300">outlook.live.com</span> e naviga al calendario — la sincronizzazione parte automaticamente.' },
                { n: '7', text: 'Torna qui: il badge <span class="text-emerald-300">● Connessa</span> apparirà entro 30s.' },
              ].map(step => (
                <li key={step.n} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
                    style={{ background: 'rgba(124,58,237,0.6)' }}>
                    {step.n}
                  </span>
                  <span dangerouslySetInnerHTML={{ __html: step.text }} />
                </li>
              ))}
            </ol>
          </div>

          {/* How it works */}
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1">
            <p className="font-medium text-gray-300">Come funziona</p>
            <p>
              L'extension intercetta le chiamate API che Outlook fa al proprio backend quando navighi nel calendario,
              estrae gli appuntamenti del giorno e li invia a questa app senza richiedere credenziali aggiuntive né
              registrazioni Azure. I dati non lasciano mai il browser.
            </p>
            <p className="text-[11px] text-amber-300/70 mt-1">
              Nota: se Outlook Live cambia i propri endpoint interni, l'extension potrebbe richiedere un aggiornamento.
            </p>
          </div>
        </div>
      )}

      {status && (
        <div className="text-xs text-gray-300">{status}</div>
      )}
    </div>
  );
};
