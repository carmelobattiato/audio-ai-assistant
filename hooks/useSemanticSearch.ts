import { useState, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { SavedSession } from '@/types';

const TOP_K = 5;
const SESSION_TEXT_SLICE = 600;
const SNIPPET_RADIUS = 100;

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

function extractSnippet(text: string, query: string): string {
  if (!text) return '';
  const firstWord = query.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!firstWord) return text.slice(0, 200);
  const idx = text.toLowerCase().indexOf(firstWord);
  if (idx === -1) return text.slice(0, 200);
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + SNIPPET_RADIUS);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export function useSemanticSearch(
  sessions: SavedSession[],
  apiKey: string,
  model: string,
): UseSemanticSearchReturn {
  const [isIndexing, setIsIndexing] = useState(false);
  const [results, setResults]       = useState<SemanticSearchResult[]>([]);
  const [error, setError]           = useState<string | null>(null);

  const search = useCallback(async (query: string): Promise<SemanticSearchResult[]> => {
    setError(null);
    setResults([]);

    if (!apiKey.trim()) {
      setError('API key non disponibile');
      return [];
    }
    if (!query.trim()) return [];

    const indexable = sessions.filter(s => s.data.transcribedText?.trim());
    if (indexable.length === 0) {
      setError('Nessuna sessione con testo disponibile per la ricerca');
      return [];
    }

    setIsIndexing(true);
    try {
      const ai = new GoogleGenAI({ apiKey });

      const ctx = indexable.map((s, i) => {
        const text = s.data.transcribedText.slice(0, SESSION_TEXT_SLICE);
        const date = new Date(s.timestamp).toLocaleDateString('it-IT');
        return `[${i}] "${s.name}" (${date})\n${text}`;
      }).join('\n\n---\n\n');

      const prompt = `Sei un assistente che analizza sessioni di registrazione audio.
Query: "${query}"

Trova le sessioni più rilevanti. Rispondi SOLO con JSON valido:
{"results":[{"index":0,"snippet":"estratto rilevante dal testo"}]}
Se nessuna è rilevante: {"results":[]}

Sessioni:
${ctx}`;

      const response = await ai.models.generateContent({ model, contents: prompt });
      const raw = response.text ?? '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Risposta non valida dal modello');

      const parsed = JSON.parse(jsonMatch[0]) as { results: { index: number; snippet: string }[] };
      const top: SemanticSearchResult[] = (parsed.results ?? [])
        .filter(r => Number.isInteger(r.index) && r.index >= 0 && r.index < indexable.length)
        .slice(0, TOP_K)
        .map(r => ({
          session: indexable[r.index]!,
          score: 1,
          snippet: r.snippet || extractSnippet(indexable[r.index]!.data.transcribedText, query),
        }));

      setResults(top);
      return top;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Errore ricerca AI: ${msg}`);
      return [];
    } finally {
      setIsIndexing(false);
    }
  }, [sessions, apiKey, model]);

  return {
    search,
    isIndexing,
    indexedCount: 0,
    totalCount: sessions.filter(s => s.data.transcribedText?.trim()).length,
    results,
    error,
  };
}
