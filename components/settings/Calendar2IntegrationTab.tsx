import React, { useState } from 'react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import {
  loadIcsConfig, saveIcsConfig, clearIcsConfig, fetchIcs,
  loadCalendarSource, saveCalendarSource, type CalendarSource,
} from '../../services/icsService';

const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.platform);

function osLabel(): string {
  if (typeof navigator === 'undefined') return 'this OS';
  const p = navigator.platform.toLowerCase();
  if (p.startsWith('win')) return 'Windows';
  if (p.startsWith('mac')) return 'macOS';
  if (p.startsWith('linux')) return 'Linux';
  return 'this OS';
}

export const Calendar2IntegrationTab: React.FC = () => {
  const initial = loadIcsConfig();
  const [icsUrl, setIcsUrl] = useState(initial?.icsUrl || '');
  const [source, setSource] = useState<CalendarSource>(loadCalendarSource());
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const handleSource = (s: CalendarSource) => {
    setSource(s);
    saveCalendarSource(s);
    setStatus(`Source set to: ${s === 'windows' ? 'Windows COM bridge' : 'ICS feed'}. Reload calendar to apply.`);
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

      {/* Source toggle */}
      <div className="space-y-2">
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
              {!isWindows && <span className="text-emerald-300"> · Only option on non-Windows systems.</span>}
            </div>
          </div>
        </label>
      </div>

      {/* ICS config — visible only when ICS selected */}
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
              Contact your IT administrator or use a personal Microsoft account (outlook.live.com).
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

      {status && (
        <div className="text-xs text-gray-300">{status}</div>
      )}
    </div>
  );
};
