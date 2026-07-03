import type { FunctionDeclaration } from '@google/genai';
import { Type } from '@google/genai';
import { htmlToPlainText } from '@/utils/textUtils';
import type { SavedSession } from '@/types';
import type { ArchiveStats, SessionMeta } from '@/hooks/useArchiveIndex';

// ── Tool declarations ────────────────────────────────────────────────────────

export const ARCHIVE_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'list_sessions',
    description: 'Lista tutte le sessioni registrate con metadati base: id, nome, data, durata, se hanno trascritto, AI analysis e bubble notes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: { type: Type.NUMBER, description: 'Numero massimo di sessioni da ritornare (default 15, max 15)' },
      },
    },
  },
  {
    name: 'search_sessions',
    description: 'Cerca sessioni per testo libero nel nome, trascritto, AI analysis e bubble notes. Ritorna le sessioni che contengono il testo.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Testo da cercare (parole chiave, nome persona, argomento)' },
        limit: { type: Type.NUMBER, description: 'Numero massimo di risultati (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'filter_sessions',
    description: 'Filtra sessioni per attributi strutturati: data, presenza di bubble notes, trascritto, AI analysis o stato.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date_from: { type: Type.STRING, description: 'Data inizio nel formato YYYY-MM-DD (ISO 8601)' },
        date_to: { type: Type.STRING, description: 'Data fine nel formato YYYY-MM-DD (ISO 8601)' },
        has_bubble_notes: { type: Type.BOOLEAN, description: 'true = solo sessioni con bubble notes; false = solo senza' },
        has_transcript: { type: Type.BOOLEAN, description: 'true = solo sessioni con trascritto' },
        has_analysis: { type: Type.BOOLEAN, description: 'true = solo sessioni con AI analysis' },
        status: { type: Type.STRING, description: 'Filtra per stato: "In Progress", "Success", "Failed", "Interrupted"' },
      },
    },
  },
  {
    name: 'get_session_detail',
    description: 'Restituisce il dettaglio completo di una sessione: trascritto completo, AI analysis e lista delle bubble notes con il loro testo. Da usare dopo aver identificato l\'ID con list_sessions o search_sessions.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        session_id: { type: Type.STRING, description: 'ID esatto della sessione oppure parte del nome (es. "Session_290626_1617" oppure "Session_29")' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'get_session_stats',
    description: 'Restituisce statistiche aggregate su tutte le sessioni: numero totale, quante hanno trascritto / AI analysis / bubble notes, durata totale registrata.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];

// ── Tool result types ────────────────────────────────────────────────────────

export interface SessionSummary {
  id: string;
  name: string;
  date: string;
  durationMin: number;
  status: string;
  hasTranscript: boolean;
  hasAnalysis: boolean;
  hasBubbleNotes: boolean;
  calendarSubject?: string;
  matchSnippet?: string;
}

// ── Tool executor ────────────────────────────────────────────────────────────

export function executeArchiveTool(
  name: string,
  args: Record<string, unknown>,
  sessions: SavedSession[],
  stats: ArchiveStats,
  metaIndex: SessionMeta[],
): unknown {
  switch (name) {
    case 'list_sessions':
      return toolListSessions(sessions, metaIndex, (args.limit as number | undefined) ?? 15);

    case 'search_sessions':
      return toolSearchSessions(sessions, metaIndex, String(args.query ?? ''), (args.limit as number | undefined) ?? 5);

    case 'filter_sessions':
      return toolFilterSessions(sessions, metaIndex, args);

    case 'get_session_detail':
      return toolGetSessionDetail(sessions, String(args.session_id ?? ''));

    case 'get_session_stats':
      return toolGetStats(stats, sessions);

    default:
      return { error: `Tool sconosciuto: ${name}` };
  }
}

// ── Individual tool implementations ─────────────────────────────────────────

function toSessionSummary(s: SavedSession, meta: SessionMeta, matchSnippet?: string): SessionSummary {
  return {
    id: s.id,
    name: s.name,
    date: new Date(s.timestamp).toLocaleDateString('it-IT', { dateStyle: 'full' }),
    durationMin: meta.durationMin,
    status: s.status,
    hasTranscript: meta.hasTranscript,
    hasAnalysis: meta.hasAnalysis,
    hasBubbleNotes: (s.data.bubbleNotes ?? []).length > 0,
    calendarSubject: s.data.linkedCalendarEventSubject,
    ...(matchSnippet ? { matchSnippet } : {}),
  };
}

function toolListSessions(sessions: SavedSession[], metaIndex: SessionMeta[], limit: number): SessionSummary[] {
  return sessions.slice(0, Math.min(limit, 15)).map(s => {
    const meta = metaIndex.find(m => m.id === s.id) ?? fallbackMeta(s);
    return toSessionSummary(s, meta);
  });
}

function toolSearchSessions(sessions: SavedSession[], metaIndex: SessionMeta[], query: string, limit: number): SessionSummary[] {
  const lq = query.toLowerCase();
  return sessions
    .map(s => {
      const meta = metaIndex.find(m => m.id === s.id) ?? fallbackMeta(s);
      const transcript = htmlToPlainText(s.data.transcribedText ?? '');
      const analysis = s.data.llmProcessedText ?? '';
      const notes = (s.data.bubbleNotes ?? []).map(n => htmlToPlainText(n.contentHtml ?? '')).join(' ');
      const fullText = `${s.name} ${s.data.linkedCalendarEventSubject ?? ''} ${transcript} ${analysis} ${notes}`.toLowerCase();
      const idx = fullText.indexOf(lq);
      if (idx === -1) return null;
      const snippet = fullText.slice(Math.max(0, idx - 40), idx + lq.length + 80).replace(/\s+/g, ' ');
      return { s, meta, snippet, score: (s.name.toLowerCase().includes(lq) ? 10 : 0) + 1 };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ s, meta, snippet }) => toSessionSummary(s, meta, snippet));
}

function toolFilterSessions(sessions: SavedSession[], metaIndex: SessionMeta[], args: Record<string, unknown>): SessionSummary[] {
  const dateFrom = args.date_from ? new Date(String(args.date_from)).getTime() : null;
  const dateTo = args.date_to ? new Date(String(args.date_to) + 'T23:59:59').getTime() : null;

  return sessions
    .filter(s => {
      if (dateFrom && s.timestamp < dateFrom) return false;
      if (dateTo && s.timestamp > dateTo) return false;
      const hasNotes = (s.data.bubbleNotes ?? []).length > 0;
      if (args.has_bubble_notes === true && !hasNotes) return false;
      if (args.has_bubble_notes === false && hasNotes) return false;
      if (args.has_transcript === true && !s.data.transcribedText?.trim()) return false;
      if (args.has_analysis === true && !s.data.llmProcessedText?.trim()) return false;
      if (args.status && s.status !== args.status) return false;
      return true;
    })
    .map(s => {
      const meta = metaIndex.find(m => m.id === s.id) ?? fallbackMeta(s);
      return toSessionSummary(s, meta);
    });
}

function toolGetSessionDetail(sessions: SavedSession[], sessionId: string): unknown {
  const id = sessionId.toLowerCase();
  const s = sessions.find(sess =>
    sess.id.toLowerCase() === id ||
    sess.id.toLowerCase().replace(/[_\-\s]/g, '').includes(id.replace(/[_\-\s]/g, '')) ||
    sess.name.toLowerCase().includes(id)
  );
  if (!s) return { error: `Sessione non trovata: "${sessionId}". Usa list_sessions per vedere gli ID disponibili.` };

  const transcript = htmlToPlainText(s.data.transcribedText ?? '').slice(0, 4000);
  const analysis = (s.data.llmProcessedText ?? '').slice(0, 3000);
  const bubbleNotes = (s.data.bubbleNotes ?? [])
    .filter(n => n.type !== 'auto-screenshot')
    .map((n, i) => ({
      index: i + 1,
      text: htmlToPlainText(n.contentHtml ?? '').slice(0, 300),
      timeOffset: n.recordingElapsedTime ? `${Math.round(n.recordingElapsedTime / 60)}m${n.recordingElapsedTime % 60}s` : undefined,
    }));

  return {
    id: s.id,
    name: s.name,
    date: new Date(s.timestamp).toLocaleDateString('it-IT', { dateStyle: 'full' }),
    durationMin: Math.round((s.data.audioDuration ?? 0) / 60),
    status: s.status,
    calendarSubject: s.data.linkedCalendarEventSubject,
    hasBubbleNotes: bubbleNotes.length > 0,
    bubbleNotesCount: bubbleNotes.length,
    transcript: transcript || '(nessun trascritto)',
    analysis: analysis || '(nessuna AI analysis)',
    bubbleNotes: bubbleNotes.length > 0 ? bubbleNotes : '(nessuna bubble note)',
  };
}

function toolGetStats(stats: ArchiveStats, sessions: SavedSession[]): unknown {
  const withNotes = sessions.filter(s => (s.data.bubbleNotes ?? []).length > 0).length;
  const h = Math.floor(stats.totalDurationMin / 60);
  const m = stats.totalDurationMin % 60;
  return {
    totalSessions: stats.total,
    withTranscript: stats.withTranscript,
    withAnalysis: stats.withAnalysis,
    withBubbleNotes: withNotes,
    totalDuration: h > 0 ? `${h}h ${m}min` : `${m}min`,
  };
}

function fallbackMeta(s: SavedSession): SessionMeta {
  return {
    id: s.id,
    name: s.name,
    timestamp: s.timestamp,
    durationMin: Math.round((s.data.audioDuration ?? 0) / 60),
    status: s.status,
    hasTranscript: !!(s.data.transcribedText?.trim()),
    hasAnalysis: !!(s.data.llmProcessedText?.trim()),
    linkedCalendarEventSubject: s.data.linkedCalendarEventSubject,
  };
}
