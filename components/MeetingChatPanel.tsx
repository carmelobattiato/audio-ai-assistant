
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from './common/Button';
import { MeetingChatMessage, AppSettings, LlmUsageStats, BubbleNote } from '../types';
import { llmService } from '../services/geminiService';
import { htmlToPlainText, markdownToHtmlSimple, formatTime } from '../utils/textUtils';
import type { Part } from '@google/genai';

// ── Icons ──────────────────────────────────────────────────────────────────

const SendIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const CopyIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const StopIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

// ── SVG Bar Chart renderer ─────────────────────────────────────────────────

function renderChartSvg(jsonStr: string): string {
  try {
    const chart = JSON.parse(jsonStr);
    const labels: string[] = chart.labels || [];
    const values: number[] = chart.values || [];
    if (!labels.length || !values.length) throw new Error('empty');

    const max = Math.max(...values, 1);
    const barW = 44;
    const gap = 12;
    const padL = 12;
    const padR = 12;
    const chartH = 110;
    const labelH = 32;
    const padTop = 22;
    const totalW = labels.length * (barW + gap) + padL + padR;

    const bars = labels.map((label, i) => {
      const barH = Math.max(4, Math.round(((values[i] ?? 0) / max) * chartH));
      const x = padL + i * (barW + gap);
      const y = padTop + chartH - barH;
      const val = `${values[i]}${chart.unit || ''}`;
      const shortLabel = label.length > 9 ? label.slice(0, 8) + '…' : label;
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="rgba(56,189,248,0.7)" rx="3"/>
        <text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" font-size="10" fill="#e2e8f0">${val}</text>
        <text x="${x + barW / 2}" y="${padTop + chartH + labelH - 8}" text-anchor="middle" font-size="9" fill="#9ca3af">${shortLabel}</text>
      `;
    });

    return `<div class="my-3 p-3 rounded-lg overflow-x-auto" style="background:rgba(17,24,39,0.85);border:1px solid rgba(55,65,81,0.7)">
      <p class="text-xs font-semibold mb-2" style="color:#7dd3fc">${(chart.title || 'Chart').replace(/</g, '&lt;')}</p>
      <svg viewBox="0 0 ${totalW} ${padTop + chartH + labelH}" width="${Math.min(totalW, 480)}" style="max-width:100%;display:block">
        <line x1="${padL}" y1="${padTop + chartH}" x2="${totalW - padR}" y2="${padTop + chartH}" stroke="#374151" stroke-width="1"/>
        ${bars.join('')}
      </svg>
    </div>`;
  } catch {
    return `<pre class="text-xs p-2 my-2 rounded overflow-x-auto" style="background:rgba(17,24,39,0.8);color:#9ca3af">${jsonStr.replace(/</g, '&lt;')}</pre>`;
  }
}

// ── Markdown + code-block renderer ────────────────────────────────────────

function renderMessageContent(content: string): string {
  // Split into code-fence blocks and plain text blocks
  const segments = content.split(/(```[\w-]*\n[\s\S]*?```)/g);
  return segments.map(seg => {
    const m = seg.match(/^```([\w-]*)\n([\s\S]*?)```$/);
    if (m) {
      const lang = (m[1] ?? '').trim().toLowerCase();
      const code = m[2] ?? '';
      if (lang === 'chart') return renderChartSvg(code.trim());
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<pre class="text-sm rounded-lg p-3 overflow-x-auto my-2" style="background:rgba(17,24,39,0.9);color:#d1d5db;border:1px solid rgba(55,65,81,0.5)"><code>${escaped}</code></pre>`;
    }
    return markdownToHtmlSimple(seg);
  }).join('');
}

// ── BubbleNote helpers ─────────────────────────────────────────────────────

function bubbleNotesToText(notes: BubbleNote[]): string {
  return notes
    .map((n, i) => {
      const text = htmlToPlainText(n.contentHtml).trim();
      return text ? `Nota ${i + 1} [${formatTime(n.recordingElapsedTime)}]: ${text}` : null;
    })
    .filter(Boolean)
    .join('\n\n');
}

function extractNoteImages(notes: BubbleNote[]): Array<{ mimeType: string; data: string }> {
  const result: Array<{ mimeType: string; data: string }> = [];
  const regex = /src="data:([^;]+);base64,([^"]+)"/g;
  for (const note of notes) {
    let m: RegExpExecArray | null;
    const rx = new RegExp(regex.source, 'g');
    while ((m = rx.exec(note.contentHtml)) !== null) {
      result.push({ mimeType: m[1] ?? 'image/png', data: m[2] ?? '' });
    }
  }
  return result;
}

// ── Quick suggestions ──────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  'Elenca i punti d\'azione principali',
  'Quali decisioni sono state prese?',
  'Scrivi una email di follow-up',
  'Chi erano i partecipanti principali?',
  'Crea una tabella dei temi discussi',
  'Mostra un grafico dei temi principali',
];

// ── Props ──────────────────────────────────────────────────────────────────

interface MeetingChatPanelProps {
  sessionContext: {
    transcription: string;
    llmResult: string;
    sessionTitle: string;
    audioDuration?: number;
    audioRecordingStartTime?: Date | null;
    bubbleNotes?: BubbleNote[];
  };
  llmSettings: AppSettings['llm'];
  history: MeetingChatMessage[];
  onHistoryChange: (history: MeetingChatMessage[]) => void;
  onLlmUsage?: (stats: LlmUsageStats) => void;
  disabled?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export const MeetingChatPanel: React.FC<MeetingChatPanelProps> = ({
  sessionContext,
  llmSettings,
  history,
  onHistoryChange,
  onLlmUsage,
  disabled = false,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imageDecision, setImageDecision] = useState<'with-images' | 'text-only' | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasContext = !!(
    sessionContext.transcription ||
    sessionContext.llmResult ||
    sessionContext.bubbleNotes?.length
  );

  const noteImages = useMemo(
    () => extractNoteImages(sessionContext.bubbleNotes ?? []),
    [sessionContext.bubbleNotes],
  );
  const hasNoteImages = noteImages.length > 0;

  // Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, isTyping]);

  // ── System prompt builder ────────────────────────────────────────────────

  const buildSystemPrompt = useCallback((): string => {
    const { transcription, llmResult, sessionTitle, audioDuration, audioRecordingStartTime, bubbleNotes } = sessionContext;
    const plainTranscript = htmlToPlainText(transcription);
    const plainAnalysis = htmlToPlainText(llmResult);
    const notesText = bubbleNotes?.length ? bubbleNotesToText(bubbleNotes) : '';
    const dateStr = audioRecordingStartTime
      ? new Date(audioRecordingStartTime).toLocaleString()
      : new Date().toLocaleDateString();
    const durationStr = audioDuration ? formatTime(audioDuration) : 'N/A';

    return `You are a meeting intelligence assistant with full access to the transcript, AI analysis, and notes of a recorded session.

MEETING METADATA:
- Title: ${sessionTitle}
- Date: ${dateStr}
- Duration: ${durationStr}

FULL TRANSCRIPT:
${plainTranscript || '(no transcript available)'}

${plainAnalysis ? `AI ANALYSIS:\n${plainAnalysis}` : ''}

${notesText ? `BUBBLE NOTES (timestamped notes taken during the session):\n${notesText}` : ''}

INSTRUCTIONS:
- Answer questions directly and concisely, referencing actual content from the meeting
- The Bubble Notes are first-person notes taken by the user during the session; treat them as high-priority context
- Use markdown for formatting (headings, bold, lists, tables)
- For tabular data always use markdown tables
- For data visualizations use a chart code block with this exact JSON format:
  \`\`\`chart
  {"type":"bar","title":"Chart Title","labels":["A","B","C"],"values":[10,25,15],"unit":"%"}
  \`\`\`
- For rich document output, produce well-structured markdown that the user can download
- Always respond in the same language as the transcript
- Be precise and factual; never invent content not present in the meeting`;
  }, [sessionContext]);

  // ── Prompt builder (multi-turn) ──────────────────────────────────────────

  const buildPrompt = useCallback((currentInput: string): string => {
    // Include at most the last 12 messages to keep context manageable
    const recent = history.slice(-12);
    if (recent.length === 0) return currentInput;
    const historyText = recent
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    return `PREVIOUS CONVERSATION:\n${historyText}\n\nUser: ${currentInput}\n\nPlease respond:`;
  }, [history]);

  // ── Send handler ─────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isTyping || !hasContext) return;

    const userMsg: MeetingChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newHistory = [...history, userMsg];
    onHistoryChange(newHistory);
    setInputValue('');
    setIsTyping(true);
    abortRef.current = new AbortController();

    try {
      const systemPrompt = buildSystemPrompt();
      const promptText = buildPrompt(text);

      const promptOrParts: string | Part[] =
        imageDecision === 'with-images' && noteImages.length > 0
          ? [
              { text: promptText },
              ...noteImages.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
            ]
          : promptText;

      const { text: responseText, usageMetadata } = await llmService.generateText(
        promptOrParts,
        llmSettings,
        systemPrompt,
        abortRef.current.signal,
      );

      if (usageMetadata && onLlmUsage) {
        onLlmUsage({
          functionName: 'Meeting Chat',
          inputTokens: usageMetadata.inputTokens,
          outputTokens: usageMetadata.outputTokens,
          model: llmSettings.model,
          provider: llmSettings.provider,
          timestamp: Date.now(),
        });
      }

      const assistantMsg: MeetingChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: responseText || 'No response received.',
        timestamp: Date.now(),
      };
      onHistoryChange([...newHistory, assistantMsg]);
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name !== 'AbortError') {
        onHistoryChange([...newHistory, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `⚠️ Errore: ${e?.message || 'Errore sconosciuto.'}`,
          timestamp: Date.now(),
        }]);
      }
    } finally {
      setIsTyping(false);
      abortRef.current = null;
    }
  }, [inputValue, isTyping, hasContext, history, onHistoryChange, buildSystemPrompt, buildPrompt, llmSettings, onLlmUsage]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsTyping(false);
  }, []);

  const handleClear = useCallback(() => {
    if (isTyping) handleStop();
    onHistoryChange([]);
  }, [isTyping, handleStop, onHistoryChange]);

  const handleCopyMessage = useCallback(async (msg: MeetingChatMessage) => {
    await navigator.clipboard.writeText(msg.content);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleExportMarkdown = useCallback(() => {
    if (history.length === 0) return;
    const { sessionTitle } = sessionContext;
    const lines: string[] = [
      `# Chat: ${sessionTitle}`,
      `_Esportato il ${new Date().toLocaleString()}_`,
      '',
      ...history.flatMap(m => [
        `**${m.role === 'user' ? 'Tu' : 'Assistente'}** — ${new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        '',
        m.content,
        '',
        '---',
        '',
      ]),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sessionTitle}_chat.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [history, sessionContext]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (action: string) => {
    setInputValue(action);
    textareaRef.current?.focus();
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <span className="text-xs" style={{ color: 'var(--neo-muted)' }}>
          {history.length > 0
            ? `${history.length} messaggio${history.length !== 1 ? 'i' : ''}`
            : 'Chiedi qualcosa sulla sessione'}
        </span>
        {history.length > 0 && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handleExportMarkdown} leftIcon={<DownloadIcon />} title="Scarica chat come Markdown">
              Export .md
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClear} leftIcon={<TrashIcon />} title="Cancella chat">
              Pulisci
            </Button>
          </div>
        )}
      </div>

      {/* ── Messages area ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar"
        style={{ minHeight: 0 }}
      >
        {/* Empty state — no session context */}
        {!hasContext && (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center px-4">
            <div className="text-5xl mb-4">💬</div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--neo-muted)' }}>
              Nessun contenuto di sessione disponibile
            </p>
            <p className="text-xs" style={{ color: 'var(--neo-muted)', opacity: 0.6 }}>
              Registra o trascrivi una sessione per iniziare a chattare
            </p>
          </div>
        )}

        {/* Image analysis decision banner */}
        {hasContext && hasNoteImages && imageDecision === null && (
          <div
            className="rounded-xl px-4 py-3 flex-shrink-0"
            style={{
              background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.25)',
            }}
          >
            <p className="text-xs font-medium mb-2" style={{ color: '#fbbf24' }}>
              Le Bubble Notes contengono {noteImages.length} immagine{noteImages.length !== 1 ? 'i' : ''}.
              Vuoi che vengano analizzate insieme al testo?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setImageDecision('with-images')}
                className="text-xs px-3 py-1.5 rounded-full transition-all hover:opacity-90 active:scale-95 font-medium"
                style={{
                  background: 'rgba(251,191,36,0.18)',
                  border: '1px solid rgba(251,191,36,0.4)',
                  color: '#fbbf24',
                }}
              >
                Sì, analizza immagini
              </button>
              <button
                onClick={() => setImageDecision('text-only')}
                className="text-xs px-3 py-1.5 rounded-full transition-all hover:opacity-90 active:scale-95"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--neo-muted)',
                }}
              >
                No, solo testo
              </button>
            </div>
          </div>
        )}

        {/* Empty state — context available but no messages yet */}
        {hasContext && history.length === 0 && !isTyping && (imageDecision !== null || !hasNoteImages) && (
          <div className="py-2">
            <p className="text-xs text-center mb-3" style={{ color: 'var(--neo-muted)' }}>
              Inizia con una domanda o scegli un suggerimento:
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action}
                  onClick={() => handleQuickAction(action)}
                  className="text-xs px-3 py-1.5 rounded-full transition-all hover:opacity-90 active:scale-95"
                  style={{
                    background: 'rgba(124,58,237,0.12)',
                    border: '1px solid rgba(124,58,237,0.28)',
                    color: '#a78bfa',
                  }}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {history.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[88%] rounded-2xl px-4 py-3 relative group"
              style={msg.role === 'user' ? {
                background: 'linear-gradient(135deg, rgba(124,58,237,0.38), rgba(192,38,211,0.22))',
                border: '1px solid rgba(124,58,237,0.28)',
              } : {
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {msg.role === 'user' ? (
                <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--neo-text)' }}>
                  {msg.content}
                </p>
              ) : (
                <div
                  className="llm-result-display-prose text-sm"
                  dangerouslySetInnerHTML={{ __html: renderMessageContent(msg.content) }}
                />
              )}

              {/* Footer: timestamp + copy */}
              <div className="flex items-center justify-between mt-2 gap-2">
                <span className="text-[10px] opacity-40" style={{ color: 'var(--neo-muted)' }}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  onClick={() => handleCopyMessage(msg)}
                  className="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity p-0.5 rounded"
                  title="Copia"
                  style={{ color: 'var(--neo-muted)' }}
                >
                  {copiedId === msg.id ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div
              className="px-4 py-3 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex gap-1 items-center h-4">
                {[0, 150, 300].map(delay => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: 'var(--neo-muted)', animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Input area ── */}
      <div className="flex-shrink-0 mt-3">
        <div
          className="flex gap-2 items-end rounded-xl p-2"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              hasContext
                ? 'Chiedi qualcosa… (Invio per inviare, Shift+Invio per andare a capo)'
                : 'Trascrivi prima una sessione…'
            }
            disabled={disabled || !hasContext || isTyping}
            rows={4}
            className="flex-1 bg-transparent text-sm outline-none py-1 px-1"
            style={{
              color: 'var(--neo-text)',
              minHeight: '80px',
              maxHeight: '300px',
              resize: 'vertical',
            }}
          />
          <div className="flex-shrink-0 pb-0.5">
            {isTyping ? (
              <Button variant="danger" size="sm" onClick={handleStop} leftIcon={<StopIcon />}>
                Stop
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSend}
                disabled={!inputValue.trim() || !hasContext || disabled}
                leftIcon={<SendIcon />}
              >
                Invia
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
