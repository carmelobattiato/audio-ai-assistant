interface NoteHtmlAttendee {
  name: string;
  email: string;
  type?: 'required' | 'optional';
}

export interface NoteHtmlSource {
  subject: string;
  start: string;
  end: string;
  location?: string;
  organizer?: string;
  attendees?: NoteHtmlAttendee[];
  body?: string;
  onlineMeetingUrl?: string;
}

export function buildNoteHtml(ev: NoteHtmlSource): string {
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

export function extractTeamsUrl(ev: Pick<NoteHtmlSource, 'onlineMeetingUrl' | 'body'>): string | null {
  if (ev.onlineMeetingUrl) return ev.onlineMeetingUrl;
  const match = ev.body?.match(/https:\/\/teams\.microsoft\.com\/l\/[^\s<>"']+/);
  return match?.[0] ?? null;
}
