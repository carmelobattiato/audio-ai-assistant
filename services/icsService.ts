import { loggingService } from './loggingService';
import type { IcsAppointment, Calendar2Settings } from '../types';

const CFG_KEY = 'calendar2:ics';
const SOURCE_KEY = 'calendar:source';

export type CalendarSource = 'windows' | 'ics' | 'extension';

export function loadCalendarSource(): CalendarSource {
  const v = localStorage.getItem(SOURCE_KEY);
  if (v === 'windows' || v === 'ics' || v === 'extension') return v;
  return 'windows';
}

export function saveCalendarSource(s: CalendarSource) {
  localStorage.setItem(SOURCE_KEY, s);
}

export function loadIcsConfig(): Calendar2Settings | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v?.icsUrl) return null;
    return { icsUrl: String(v.icsUrl) };
  } catch {
    return null;
  }
}

export function saveIcsConfig(cfg: Calendar2Settings) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

export function clearIcsConfig() {
  localStorage.removeItem(CFG_KEY);
}

// RFC5545 line unfolding: a leading SP/HT means continuation of previous line
function unfoldLines(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      out[out.length - 1] = (out[out.length - 1] || '') + line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescape(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

// Windows/IANA TZID names that map to UTC offset 0
const UTC_TZIDS = /^(utc|gmt|greenwich standard time|coordinated universal time|etc\/utc)$/i;

function parseIcsDate(value: string, params: Record<string, string>): string {
  // Forms: 20260511T143000Z | 20260511T143000 (floating, with optional TZID) | 20260511 (all-day)
  const v = value.trim();
  if (/^\d{8}$/.test(v)) {
    const y = +v.slice(0, 4), mo = +v.slice(4, 6) - 1, d = +v.slice(6, 8);
    return new Date(Date.UTC(y, mo, d, 0, 0, 0)).toISOString();
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return '';
  const y = +m[1]!, mo = +m[2]! - 1, d = +m[3]!, h = +m[4]!, mi = +m[5]!, s = +m[6]!;
  const tzid = params['TZID'] || '';
  if (m[7] === 'Z' || UTC_TZIDS.test(tzid)) {
    return new Date(Date.UTC(y, mo, d, h, mi, s)).toISOString();
  }
  // Other TZIDs: no IANA db available, fall back to local time (best effort, v1)
  return new Date(y, mo, d, h, mi, s).toISOString();
}

function splitProp(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(';');
  const name = (parts[0] || '').toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const piece = parts[i] || '';
    const eq = piece.indexOf('=');
    if (eq > 0) params[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1);
  }
  return { name, params, value };
}

export function parseIcs(raw: string): IcsAppointment[] {
  const lines = unfoldLines(raw);
  const events: IcsAppointment[] = [];
  let cur: Partial<IcsAppointment> & { _attendees?: string[] } | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { _attendees: [] }; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.start && cur.end) {
        events.push({
          id: cur.id || crypto.randomUUID(),
          subject: cur.subject || '(no subject)',
          start: cur.start,
          end: cur.end,
          location: cur.location,
          description: cur.description,
          organizer: cur.organizer,
          attendees: cur._attendees && cur._attendees.length ? cur._attendees : undefined,
          isCancelled: cur.isCancelled || false,
          isRecurring: cur.isRecurring || false,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = splitProp(line);
    if (!p) continue;
    switch (p.name) {
      case 'UID': cur.id = p.value; break;
      case 'SUMMARY': cur.subject = unescape(p.value); break;
      case 'DTSTART': cur.start = parseIcsDate(p.value, p.params); break;
      case 'DTEND': cur.end = parseIcsDate(p.value, p.params); break;
      case 'LOCATION': cur.location = unescape(p.value); break;
      case 'DESCRIPTION': cur.description = unescape(p.value); break;
      case 'ORGANIZER': {
        const cn = p.params['CN'];
        cur.organizer = cn ? unescape(cn) : p.value.replace(/^MAILTO:/i, '');
        break;
      }
      case 'ATTENDEE': {
        const cn = p.params['CN'];
        const who = cn ? unescape(cn) : p.value.replace(/^MAILTO:/i, '');
        cur._attendees!.push(who);
        break;
      }
      case 'STATUS': if (p.value.toUpperCase() === 'CANCELLED') cur.isCancelled = true; break;
      case 'RRULE': cur.isRecurring = true; break;
    }
  }
  return events;
}

export async function fetchIcs(url: string): Promise<IcsAppointment[]> {
  const t0 = performance.now();
  // Prefer direct fetch; fall back to dev proxy if CORS fails
  let body: string;
  try {
    const res = await fetch(url, { headers: { Accept: 'text/calendar' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.text();
  } catch (e) {
    loggingService.debug('ICS_DIRECT_FAILED', `Falling back to proxy: ${(e as Error).message}`);
    const proxyUrl = `/api/ics?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) {
      const body2 = await res.text().catch(() => '');
      loggingService.warn('ICS_FETCH_ERROR', `HTTP ${res.status}`, { body: body2.slice(0, 300) });
      throw new Error(`ICS fetch ${res.status}`);
    }
    body = await res.text();
  }
  const events = parseIcs(body);
  loggingService.debug('ICS_FETCH_OK', `Loaded ${events.length} events`, {
    ms: Math.round(performance.now() - t0),
    bytes: body.length,
  });
  return events;
}
