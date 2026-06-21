import { useState, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { SavedSession } from '@/types';
import { db } from '@/utils/db';

const EMBEDDING_MODEL = 'text-embedding-004';
const TOP_K = 5;
const SCORE_THRESHOLD = 0.3;
const TEXT_SLICE_LENGTH = 2000;
const SNIPPET_RADIUS = 100; // chars on each side of matched word

export interface SemanticSearchResult {
  session: SavedSession;
  score: number;
  snippet: string;
}

export interface UseSemanticSearchReturn {
  search: (query: string) => Promise<SemanticSearchResult[]>;
  isIndexing: boolean;
  indexedCount: number;
  totalCount: number;
  results: SemanticSearchResult[];
  error: string | null;
}

// ─── Cosine similarity ────────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Snippet extraction ───────────────────────────────────────────────────────
function extractSnippet(text: string, query: string): string {
  if (!text) return '';
  const firstWord = query.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!firstWord) return text.slice(0, 200);
  const idx = text.toLowerCase().indexOf(firstWord);
  if (idx === -1) return text.slice(0, 200);
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end   = Math.min(text.length, idx + SNIPPET_RADIUS);
  const snippet = text.slice(start, end);
  return (start > 0 ? '…' : '') + snippet + (end < text.length ? '…' : '');
}

// ─── Embedding helper ─────────────────────────────────────────────────────────
async function getEmbedding(ai: GoogleGenAI, text: string): Promise<number[]> {
  // @google/genai v1: ai.models.embedContent
  const result = await (ai as unknown as {
    models: {
      embedContent: (params: {
        model: string;
        content: { parts: { text: string }[] };
      }) => Promise<{ embedding: { values: number[] } }>;
    };
  }).models.embedContent({
    model: EMBEDDING_MODEL,
    content: { parts: [{ text }] },
  });
  return result.embedding.values;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSemanticSearch(
  sessions: SavedSession[],
  apiKey: string,
): UseSemanticSearchReturn {
  const [isIndexing,    setIsIndexing]    = useState(false);
  const [indexedCount,  setIndexedCount]  = useState(0);
  const [results,       setResults]       = useState<SemanticSearchResult[]>([]);
  const [error,         setError]         = useState<string | null>(null);

  const search = useCallback(async (query: string): Promise<SemanticSearchResult[]> => {
    setError(null);
    setResults([]);

    if (!apiKey.trim()) {
      const msg = 'API key non disponibile';
      setError(msg);
      return [];
    }

    if (!query.trim()) return [];

    // Filter sessions that have transcribed text
    const indexable = sessions.filter(s => s.data.transcribedText?.trim());

    if (indexable.length === 0) {
      setError('Nessuna sessione con testo disponibile per la ricerca');
      return [];
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      setIsIndexing(true);

      // ── Phase 1: index missing embeddings ──────────────────────────────────
      const vectors = new Map<string, number[]>();
      let indexed = 0;

      for (const session of indexable) {
        const cached = await db.getEmbeddingBySessionId(session.id);
        if (cached) {
          vectors.set(session.id, cached.vector);
          indexed++;
          setIndexedCount(indexed);
        } else {
          try {
            const text   = session.data.transcribedText.slice(0, TEXT_SLICE_LENGTH);
            const vector = await getEmbedding(ai, text);
            await db.upsertEmbedding({ sessionId: session.id, vector, textSnippet: text.slice(0, 500), generatedAt: Date.now() });
            vectors.set(session.id, vector);
            indexed++;
            setIndexedCount(indexed);
          } catch (embErr) {
            console.warn(`useSemanticSearch: failed to embed session ${session.id}`, embErr);
          }
        }
      }

      // ── Phase 2: embed query ───────────────────────────────────────────────
      const queryVector = await getEmbedding(ai, query.trim());

      setIsIndexing(false);

      // ── Phase 3: rank by cosine similarity ────────────────────────────────
      const scored: SemanticSearchResult[] = [];
      for (const session of indexable) {
        const vec = vectors.get(session.id);
        if (!vec) continue;
        const score = cosineSimilarity(queryVector, vec);
        if (score >= SCORE_THRESHOLD) {
          scored.push({
            session,
            score,
            snippet: extractSnippet(session.data.transcribedText, query),
          });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, TOP_K);
      setResults(top);
      return top;

    } catch (err: unknown) {
      setIsIndexing(false);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Errore ricerca AI: ${msg}`);
      return [];
    }
  }, [sessions, apiKey]);

  return {
    search,
    isIndexing,
    indexedCount,
    totalCount: sessions.filter(s => s.data.transcribedText?.trim()).length,
    results,
    error,
  };
}
