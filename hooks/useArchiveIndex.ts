import { useEffect, useRef, useState, useCallback } from 'react';
import { db } from '@/utils/db';
import { llmService } from '@/services/geminiService';
import { htmlToPlainText } from '@/utils/textUtils';
import { computeRole, type MeetingRole } from '@/utils/meetingUtils';
import type { SavedSession, SessionEmbedding, CalendarEventRecord } from '@/types';
import type { OutlookAppointment } from '@/components/OutlookCalendarModal';

export interface SessionMeta {
  id: string;
  name: string;
  timestamp: number;
  durationMin: number;
  status: string;
  linkedCalendarEventSubject?: string;
  calendarStart?: string;
  calendarEnd?: string;
  myAttendeeRole?: MeetingRole;
  hasTranscript: boolean;
  hasAnalysis: boolean;
}

export interface SessionMatch {
  session: SavedSession;
  meta: SessionMeta;
  score: number;
  matchedKeywords: string[];
}

export interface ArchiveStats {
  total: number;
  withTranscript: number;
  withAnalysis: number;
  totalDurationMin: number;
}

interface UseArchiveIndexResult {
  isReady: boolean;
  isIndexing: boolean;
  stats: ArchiveStats;
  metaIndex: SessionMeta[];
  sessions: SavedSession[];
  grepSearch: (keywords: string[], filters?: { dateRange?: { from: Date; to: Date } }) => SessionMatch[];
  embedSearch: (queryVector: number[], limit?: number) => Promise<SessionMatch[]>;
  ensureEmbeddings: (apiKey: string) => Promise<void>;
  reload: () => Promise<void>;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildMetaText(s: SavedSession): string {
  return [
    s.name,
    htmlToPlainText(s.data.transcribedText ?? ''),
    s.data.llmProcessedText ?? '',
    (s.data.bubbleNotes ?? []).map(n => htmlToPlainText(n.contentHtml ?? '')).join(' '),
    s.data.linkedCalendarEventSubject ?? '',
  ].join(' ').toLowerCase();
}

export function useArchiveIndex(userEmail?: string): UseArchiveIndexResult {
  const [isReady, setIsReady] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [metaIndex, setMetaIndex] = useState<SessionMeta[]>([]);
  const [stats, setStats] = useState<ArchiveStats>({ total: 0, withTranscript: 0, withAnalysis: 0, totalDurationMin: 0 });
  const embeddingsRef = useRef<SessionEmbedding[]>([]);
  const sessionTextRef = useRef<Map<string, string>>(new Map());

  const buildIndex = useCallback(async () => {
    setIsReady(false);
    try {
      const [allSessions, allCalEvents] = await Promise.all([
        db.getAllSessions(),
        db.getAllCalendarEvents(),
      ]);

      const calByLinkedSession = new Map<string, CalendarEventRecord>();
      for (const ev of allCalEvents) {
        if (ev.linkedSessionId) calByLinkedSession.set(ev.linkedSessionId, ev);
      }

      const metas: SessionMeta[] = allSessions.map(s => {
        const calEvent = calByLinkedSession.get(s.id);
        let myAttendeeRole: MeetingRole | undefined;
        if (calEvent && userEmail) {
          myAttendeeRole = computeRole(calEvent as unknown as OutlookAppointment, userEmail);
        }
        return {
          id: s.id,
          name: s.name,
          timestamp: s.timestamp,
          durationMin: Math.round((s.data.audioDuration ?? 0) / 60),
          status: s.status,
          linkedCalendarEventSubject: s.data.linkedCalendarEventSubject,
          calendarStart: calEvent?.start,
          calendarEnd: calEvent?.end,
          myAttendeeRole,
          hasTranscript: !!(s.data.transcribedText?.trim()),
          hasAnalysis: !!(s.data.llmProcessedText?.trim()),
        };
      });

      // Pre-compute searchable text per session
      const textMap = new Map<string, string>();
      for (const s of allSessions) textMap.set(s.id, buildMetaText(s));
      sessionTextRef.current = textMap;

      setSessions(allSessions);
      setMetaIndex(metas);
      setStats({
        total: allSessions.length,
        withTranscript: metas.filter(m => m.hasTranscript).length,
        withAnalysis: metas.filter(m => m.hasAnalysis).length,
        totalDurationMin: metas.reduce((acc, m) => acc + m.durationMin, 0),
      });
    } finally {
      setIsReady(true);
    }
  }, [userEmail]);

  useEffect(() => { buildIndex(); }, [buildIndex]);

  const grepSearch = useCallback((
    keywords: string[],
    filters?: { dateRange?: { from: Date; to: Date } }
  ): SessionMatch[] => {
    const kws = keywords.map(k => k.toLowerCase());
    return sessions
      .filter(s => {
        if (!filters?.dateRange) return true;
        const { from, to } = filters.dateRange;
        return s.timestamp >= from.getTime() && s.timestamp <= to.getTime();
      })
      .map(s => {
        const text = sessionTextRef.current.get(s.id) ?? buildMetaText(s);
        const matched = kws.filter(k => text.includes(k));
        const meta = metaIndex.find(m => m.id === s.id)!;
        return { session: s, meta, score: matched.length, matchedKeywords: matched };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [sessions, metaIndex]);

  const embedSearch = useCallback(async (queryVector: number[], limit = 5): Promise<SessionMatch[]> => {
    const embeddings = embeddingsRef.current.length
      ? embeddingsRef.current
      : await db.getAllEmbeddings();
    embeddingsRef.current = embeddings;

    const results: SessionMatch[] = [];
    for (const e of embeddings) {
      const s = sessions.find(sess => sess.id === e.sessionId);
      const meta = metaIndex.find(m => m.id === e.sessionId);
      if (!s || !meta) continue;
      results.push({ session: s, meta, score: cosineSimilarity(queryVector, e.vector), matchedKeywords: [] as string[] });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }, [sessions, metaIndex]);

  const ensureEmbeddings = useCallback(async (apiKey: string) => {
    if (isIndexing || !apiKey) return;
    setIsIndexing(true);
    try {
      const existing = await db.getAllEmbeddings();
      const existingIds = new Set(existing.map(e => e.sessionId));
      const missing = sessions.filter(s => !existingIds.has(s.id) && (s.data.llmProcessedText || s.data.transcribedText));
      for (const s of missing) {
        const text = `${s.name}\n${s.data.llmProcessedText ?? htmlToPlainText(s.data.transcribedText ?? '')}`.slice(0, 8000);
        const vector = await llmService.embedContent(text, apiKey);
        if (vector) {
          await db.upsertEmbedding({ sessionId: s.id, vector, textSnippet: text.slice(0, 200), generatedAt: Date.now() });
        }
      }
      embeddingsRef.current = await db.getAllEmbeddings();
    } finally {
      setIsIndexing(false);
    }
  }, [sessions, isIndexing]);

  return { isReady, isIndexing, stats, metaIndex, sessions, grepSearch, embedSearch, ensureEmbeddings, reload: buildIndex };
}
