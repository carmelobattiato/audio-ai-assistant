import type { Content } from '@google/genai';
import { llmService } from '@/services/geminiService';
import { ARCHIVE_FUNCTION_DECLARATIONS, executeArchiveTool, type SessionSummary } from '@/utils/archiveTools';
import { db } from '@/utils/db';
import type { LlmSettings, SavedSession } from '@/types';
import type { SessionMeta } from '@/hooks/useArchiveIndex';

const MAX_TOOL_TURNS = 6;
const CANDIDATES_THRESHOLD = 3;

function buildMetaIndex(sessions: SavedSession[]): SessionMeta[] {
  return sessions.map(s => ({
    id: s.id,
    name: s.name,
    timestamp: s.timestamp,
    durationMin: Math.round((s.data.audioDuration ?? 0) / 60),
    status: s.status,
    linkedCalendarEventSubject: s.data.linkedCalendarEventSubject,
    hasTranscript: !!(s.data.transcribedText?.trim()),
    hasAnalysis: !!(s.data.llmProcessedText?.trim()),
  }));
}

function buildStats(sessions: SavedSession[]) {
  return {
    total: sessions.length,
    withTranscript: sessions.filter(s => s.data.transcribedText?.trim()).length,
    withAnalysis: sessions.filter(s => s.data.llmProcessedText?.trim()).length,
    totalDurationMin: sessions.reduce((acc, s) => acc + Math.round((s.data.audioDuration ?? 0) / 60), 0),
  };
}

const ARCHIVE_SYSTEM_PROMPT = (sessionCount: number): string => {
  const today = new Date().toISOString().slice(0, 10);
  const todayFull = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return [
    `Sei un assistente AI che interroga un archivio di ${sessionCount} sessioni audio registrate.`,
    `Data di oggi: ${today} (${todayFull}).`,
    `Regole:`,
    `- Usa i tool per rispondere. Una sola chiamata tool alla volta.`,
    `- Hai accesso anche al calendario Outlook tramite search_calendar: usalo per trovare meeting, appuntamenti e riunioni anche quando non ci sono sessioni registrate.`,
    `- Se search_sessions o filter_sessions restituisce 0 risultati, prova search_calendar prima di rispondere "Nessuna sessione trovata".`,
    `- Se non conosci l'ID di una sessione specifica, chiama prima list_sessions.`,
    `- Rispondi in italiano. Usa markdown. Sii conciso.`,
  ].join('\n');
};

export interface ArchiveQueryResult {
  text: string;
  toolCallsCount: number;
  usageInputTokens: number;
  usageOutputTokens: number;
}

/**
 * Runs a multi-turn Gemini function calling loop to answer a query over the session archive.
 * Loads fresh data from IndexedDB at each call — always sees the latest sessions.
 * @param conversationHistory - Previous archive chat turns for context continuity.
 * @param onCandidates - Called when search_sessions returns >THRESHOLD results. Returns the IDs the user selected. Return null to auto-select all.
 */
export async function runArchiveQuery(
  userQuery: string,
  llmSettings: LlmSettings,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  onCandidates: (candidates: SessionSummary[]) => Promise<string[] | null>,
  signal?: AbortSignal,
): Promise<ArchiveQueryResult> {
  // Always load fresh from IDB — captures sessions recorded after component mount
  const sessions: SavedSession[] = await db.getAllSessions();
  const calendarEvents = await db.getAllCalendarEvents();
  const stats = buildStats(sessions);
  const metaIndex: SessionMeta[] = buildMetaIndex(sessions);

  const systemPrompt = ARCHIVE_SYSTEM_PROMPT(sessions.length);

  // Include last 8 conversation turns as context (so LLM knows e.g. which session was found before)
  const historyContents: Content[] = conversationHistory.slice(-8).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  const contents: Content[] = [
    ...historyContents,
    { role: 'user', parts: [{ text: userQuery }] },
  ];

  let toolCallsCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const result = await llmService.generateWithTools(
      contents,
      llmSettings,
      systemPrompt,
      ARCHIVE_FUNCTION_DECLARATIONS,
      signal,
    );

    if (result.usageMetadata) {
      totalInputTokens += result.usageMetadata.inputTokens;
      totalOutputTokens += result.usageMetadata.outputTokens;
    }

    // Model returned text → done
    if (result.text !== undefined) {
      return {
        text: result.text || 'Nessuna risposta.',
        toolCallsCount,
        usageInputTokens: totalInputTokens,
        usageOutputTokens: totalOutputTokens,
      };
    }

    // Model returned function calls
    if (!result.functionCalls?.length) break;
    toolCallsCount++;

    // Add model's turn to conversation
    if (result.modelContent) {
      contents.push(result.modelContent);
    } else {
      contents.push({
        role: 'model',
        parts: result.functionCalls.map(fc => ({ functionCall: { name: fc.name, args: fc.args } })),
      });
    }

    // Execute each tool call and collect responses
    const toolResponseParts: Content['parts'] = [];

    for (const fc of result.functionCalls) {
      let toolResult = executeArchiveTool(fc.name, fc.args, sessions, stats, metaIndex, calendarEvents);

      // Human-in-loop: if search_sessions returns many candidates, ask user to select
      if (fc.name === 'search_sessions' && Array.isArray(toolResult) && toolResult.length > CANDIDATES_THRESHOLD) {
        const candidates = toolResult as SessionSummary[];
        const selectedIds = await onCandidates(candidates);
        if (selectedIds !== null && selectedIds.length > 0) {
          toolResult = candidates.filter(c => selectedIds.includes(c.id));
        }
        // else: keep all (user dismissed or selected all)
      }

      toolResponseParts.push({
        functionResponse: {
          name: fc.name,
          response: { result: toolResult },
        },
      });
    }

    // Add tool responses as user turn
    contents.push({ role: 'user', parts: toolResponseParts });
  }

  return {
    text: 'Ho raggiunto il limite di chiamate al database. Prova a riformulare la domanda.',
    toolCallsCount,
    usageInputTokens: totalInputTokens,
    usageOutputTokens: totalOutputTokens,
  };
}
