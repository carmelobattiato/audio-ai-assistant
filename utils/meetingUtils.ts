import type { OutlookAppointment } from '../components/OutlookCalendarModal';

export type MeetingRole = 'organizer' | 'required' | 'optional' | 'unknown';

export interface MeetingToastData {
  id: string;                 // unique per-toast (appt.id + optional snooze suffix)
  apptId: string;             // original appointment id (for snooze re-trigger)
  subject: string;
  organizer: string;
  startIso: string;           // appt.start raw
  endIso?: string;            // appt.end raw
  minutesToStart: number;     // computed at fire time
  role: MeetingRole;
  summary: string;            // AI-generated, or '' on failure
  onlineMeetingUrl?: string;
}

export function computeRole(appt: OutlookAppointment, userEmail: string): MeetingRole {
  if (!userEmail) return 'unknown';
  if (appt.responseStatus === 'organizer') return 'organizer';
  const target = userEmail.toLowerCase();
  const me = (appt.attendees ?? []).find(a => (a.email ?? '').toLowerCase() === target);
  if (!me) return 'unknown';
  return me.type === 'optional' ? 'optional' : 'required';
}

export function roleLabel(role: MeetingRole): string {
  switch (role) {
    case 'organizer': return 'Sei l\'organizzatore';
    case 'required': return 'Sei richiesto (To)';
    case 'optional': return 'Sei opzionale (CC)';
    default: return '';
  }
}
