
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from './common/Button';
import { MeetingChatMessage, AppSettings, LlmUsageStats, BubbleNote, CustomInstruction, SavedSessionData } from '../types';
import { buildCorrelatedSessionsContext } from '../utils/correlationContext';
import { llmService } from '../services/geminiService';
import { htmlToPlainText, renderLatexInMarkdown, markdownToHtmlSimple, formatTime, bubbleNotesToText } from '../utils/textUtils';
import { sanitizeHtml } from '../utils/sanitize';
import type { Part } from '@google/genai';
import { useArchiveIndex } from '../hooks/useArchiveIndex';
import { runArchiveQuery } from '../utils/archiveFunctionCallFlow';
import type { SessionSummary } from '../utils/archiveTools';

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

const DownloadIcon = ({ className }: { className?: string } = {}) => (
  <svg className={className ?? 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

const EditPencilIcon = ({ className }: { className?: string }) => (
  <svg className={className ?? 'w-3.5 h-3.5'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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
    return renderLatexInMarkdown(seg);
  }).join('');
}

// ── BubbleNote helpers ─────────────────────────────────────────────────────


function extractNoteImages(notes: BubbleNote[]): Array<{ mimeType: string; data: string }> {
  const result: Array<{ mimeType: string; data: string }> = [];
  const regex = /src="data:([^;]+);base64,([^"]+)"/g;
  for (const note of notes) {
    let m: RegExpExecArray | null;
    const rx = new RegExp(regex.source, 'g');
    while ((m = rx.exec(note.contentHtml)) !== null) {
      result.push({ mimeType: m[1] ?? 'image/png', data: m[2] ?? '' });
    }
    if (note.inlineDataParts) {
      for (const part of note.inlineDataParts) {
        result.push({ mimeType: part.mimeType, data: part.data });
      }
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
    llmResultTitle?: string;
    sessionTitle: string;
    audioDuration?: number;
    audioRecordingStartTime?: Date | null;
    bubbleNotes?: BubbleNote[];
  };
  llmSettings: AppSettings['llm'];
  chatSystemInstruction?: string;
  customInstructions?: CustomInstruction[];
  history: MeetingChatMessage[];
  onHistoryChange: (history: MeetingChatMessage[]) => void;
  onLlmUsage?: (stats: LlmUsageStats) => void;
  disabled?: boolean;
  correlatedSessionsData?: SavedSessionData[];
  useHistoricalContext?: boolean;
  userEmail?: string;
  externalChatMode?: 'session' | 'archive';
  onExternalChatModeChange?: (mode: 'session' | 'archive') => void;
  onAnalysisEdit?: (newHtml: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export const MeetingChatPanel: React.FC<MeetingChatPanelProps> = ({
  sessionContext,
  llmSettings,
  chatSystemInstruction,
  customInstructions,
  history,
  onHistoryChange,
  onLlmUsage,
  disabled = false,
  correlatedSessionsData,
  useHistoricalContext = true,
  userEmail,
  externalChatMode,
  onExternalChatModeChange,
  onAnalysisEdit,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [internalChatMode, setInternalChatMode] = useState<'session' | 'archive'>('session');
  const chatMode: 'session' | 'archive' = externalChatMode ?? internalChatMode;
  const setChatMode = (m: 'session' | 'archive') => {
    setInternalChatMode(m);
    onExternalChatModeChange?.(m);
  };
  const [archiveChatHistory, setArchiveChatHistory] = useState<MeetingChatMessage[]>([]);
  const [pendingCandidates, setPendingCandidates] = useState<SessionSummary[] | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [isTyping, setIsTyping] = useState(false);

  const archiveIndex = useArchiveIndex(userEmail);
  const activeHistory = chatMode === 'session' ? history : archiveChatHistory;
  const candidatesResolveRef = useRef<((ids: string[] | null) => void) | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAnalysis, setCopiedAnalysis] = useState(false);
  const [analysisEditMode, setAnalysisEditMode] = useState(false);
  const [analysisEditContent, setAnalysisEditContent] = useState('');
  const [imageDecision, setImageDecision] = useState<'with-images' | 'text-only' | null>(null);
  const [pendingImages, setPendingImages] = useState<{ mimeType: string; data: string; previewUrl: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const baseInstructions = chatSystemInstruction ?? `You are a meeting assistant. Answer only based on the transcript, AI analysis, and notes provided. Always respond in the same language as the transcript. Never invent content not present in the meeting. Bubble Notes are first-person notes from the user — treat them as high-priority context. For data visualizations use exactly this format:
\`\`\`chart
{"type":"bar","title":"...","labels":[...],"values":[...],"unit":"..."}
\`\`\``;

    const activeRules = (customInstructions ?? []).filter(r => r.enabled);
    const rulesSection = activeRules.length > 0
      ? `\n\nREGOLE PERSONALIZZATE (applicare sempre):\n${activeRules.map(r => `- ${r.text}`).join('\n')}`
      : '';

    let prompt = `${baseInstructions}${rulesSection}

MEETING METADATA:
- Title: ${sessionTitle}
- Date: ${dateStr}
- Duration: ${durationStr}

FULL TRANSCRIPT:
${plainTranscript || '(no transcript available)'}

${plainAnalysis ? `AI ANALYSIS:\n${plainAnalysis}` : ''}

${notesText ? `BUBBLE NOTES (timestamped notes taken during the session):\n${notesText}` : ''}`;

    if (useHistoricalContext && correlatedSessionsData?.length) {
      prompt += buildCorrelatedSessionsContext(correlatedSessionsData);
    }

    return prompt;
  }, [sessionContext, chatSystemInstruction, customInstructions, correlatedSessionsData, useHistoricalContext]);

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
    if ((!text && pendingImages.length === 0) || isTyping) return;
    if (chatMode === 'session' && !hasContext) return;

    // ── Archive mode — function calling loop ────────────────────────────────
    if (chatMode === 'archive') {
      const userMsg: MeetingChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      const newArchiveHistory = [...archiveChatHistory, userMsg];
      setArchiveChatHistory(newArchiveHistory);
      setInputValue('');
      setIsTyping(true);
      setPendingCandidates(null);
      abortRef.current = new AbortController();

      try {
        // Resolve pending candidates from human-in-loop (returns selected IDs or null)
        const resolveRef: { resolve: ((ids: string[] | null) => void) | null } = { resolve: null };
        const pendingSelectionPromise = new Promise<string[] | null>(res => { resolveRef.resolve = res; });

        const onCandidates = (candidates: SessionSummary[]): Promise<string[] | null> => {
          // pendingQuery not needed — text is captured in closure
          setPendingCandidates(candidates);
          setSelectedCandidateIds(new Set(candidates.map(c => c.id)));
          setArchiveChatHistory(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `🔍 Ho trovato **${candidates.length} sessioni** pertinenti. Seleziona quelle da analizzare qui sotto.`,
            timestamp: Date.now(),
          }]);
          // Store resolve so handleAnalyzeCandidates can call it
          candidatesResolveRef.current = resolveRef.resolve;
          return pendingSelectionPromise;
        };

        const result = await runArchiveQuery(
          text,
          llmSettings,
          archiveChatHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          onCandidates,
          abortRef.current.signal,
        );

        if (onLlmUsage) {
          onLlmUsage({
            functionName: 'Archive Chat',
            inputTokens: result.usageInputTokens,
            outputTokens: result.usageOutputTokens,
            model: llmSettings.model,
            provider: llmSettings.provider,
            timestamp: Date.now(),
          });
        }

        setArchiveChatHistory(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.text,
          timestamp: Date.now(),
        }]);
        setPendingCandidates(null);
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name !== 'AbortError') {
          setArchiveChatHistory(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `⚠️ Errore archivio: ${e?.message || 'Errore sconosciuto.'}`,
            timestamp: Date.now(),
          }]);
        }
        setPendingCandidates(null);
      } finally {
        setIsTyping(false);
        abortRef.current = null;
        candidatesResolveRef.current = null;
      }
      return;
    }

    // ── Session mode ──────────────────────────────────────────────────────────
    const effectiveText = text || 'Analizza le immagini allegate.';
    const userMsg: MeetingChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: effectiveText,
      timestamp: Date.now(),
      ...(pendingImages.length > 0 && {
        attachedImages: pendingImages.map(({ mimeType, previewUrl }) => ({ mimeType, previewUrl })),
      }),
    };

    const newHistory = [...history, userMsg];
    onHistoryChange(newHistory);
    setInputValue('');
    const imagesToSend = pendingImages;
    setPendingImages([]);
    setIsTyping(true);
    abortRef.current = new AbortController();

    try {
      const systemPrompt = buildSystemPrompt();
      const promptText = buildPrompt(effectiveText);

      const userImageParts: Part[] = imagesToSend.map(img => ({
        inlineData: { mimeType: img.mimeType, data: img.data },
      }));
      const noteImageParts: Part[] = imageDecision === 'with-images' && noteImages.length > 0
        ? noteImages.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))
        : [];
      const allImageParts = [...noteImageParts, ...userImageParts];

      const promptOrParts: string | Part[] = allImageParts.length > 0
        ? [{ text: promptText }, ...allImageParts]
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
  }, [inputValue, isTyping, chatMode, hasContext, history, archiveChatHistory, onHistoryChange, buildSystemPrompt, buildPrompt, llmSettings, onLlmUsage, archiveIndex, pendingImages, noteImages, imageDecision]);

  const handleStop = useCallback(() => {
    // If waiting for candidate selection, unblock the Promise first
    candidatesResolveRef.current?.(null);
    candidatesResolveRef.current = null;
    setPendingCandidates(null);
    abortRef.current?.abort();
    setIsTyping(false);
  }, []);

  const handleClear = useCallback(() => {
    if (isTyping) handleStop();
    if (chatMode === 'archive') {
      setArchiveChatHistory([]);
      setPendingCandidates(null);
    } else {
      onHistoryChange([]);
    }
  }, [isTyping, handleStop, chatMode, onHistoryChange]);

  const handleCopyAnalysis = useCallback(async () => {
    if (!sessionContext.llmResult) return;
    try {
      await navigator.clipboard.writeText(htmlToPlainText(sessionContext.llmResult));
      setCopiedAnalysis(true);
      setTimeout(() => setCopiedAnalysis(false), 2000);
    } catch {
      // ignore
    }
  }, [sessionContext.llmResult]);

  const handleCopyMessage = useCallback(async (msg: MeetingChatMessage) => {
    const html = sanitizeHtml(renderMessageContent(msg.content));
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([htmlToPlainText(html)], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(htmlToPlainText(html));
    }
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleAnalyzeCandidates = useCallback(() => {
    if (!pendingCandidates || selectedCandidateIds.size === 0) return;
    const selectedIds = Array.from(selectedCandidateIds);
    setPendingCandidates(null);
    // Resume the runArchiveQuery loop with the selected session IDs
    candidatesResolveRef.current?.(selectedIds);
    candidatesResolveRef.current = null;
  }, [pendingCandidates, selectedCandidateIds]);

  const handleExportMarkdown = useCallback(() => {
    if (activeHistory.length === 0) return;
    const { sessionTitle } = sessionContext;
    const title = chatMode === 'archive' ? 'Chat Archivio' : `Chat: ${sessionTitle}`;
    const lines: string[] = [
      `# ${title}`,
      `_Esportato il ${new Date().toLocaleString()}_`,
      '',
      ...activeHistory.flatMap(m => [
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
    a.download = chatMode === 'archive' ? `archivio_chat.md` : `${sessionTitle}_chat.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeHistory, chatMode, sessionContext]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addImagesFromFiles = useCallback((files: File[]) => {
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const commaIdx = dataUrl.indexOf(',');
        const header = dataUrl.slice(0, commaIdx);
        const data = dataUrl.slice(commaIdx + 1);
        const mimeType = header.match(/:(.*?);/)?.[1] ?? file.type;
        setPendingImages(prev => [...prev, { mimeType, data, previewUrl: dataUrl }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handlePasteImage = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItems = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    e.preventDefault();
    addImagesFromFiles(imageItems.map(i => i.getAsFile()).filter((f): f is File => f !== null));
  }, [addImagesFromFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    addImagesFromFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  }, [addImagesFromFiles]);

  const handleRemovePendingImage = useCallback((idx: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleQuickAction = (action: string) => {
    setInputValue(action);
    textareaRef.current?.focus();
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-2">
        {/* Mode toggle pill — hidden when controlled externally (toggle is in LlmProcessor header) */}
        <div className="flex rounded-full overflow-hidden border flex-shrink-0" style={{ borderColor: 'var(--neo-border)', fontSize: 11, display: externalChatMode !== undefined ? 'none' : undefined }}>
          <button
            onClick={() => { setChatMode('session'); setPendingCandidates(null); }}
            className="px-3 py-1 transition-colors"
            style={{
              background: chatMode === 'session' ? 'var(--neo-accent)' : 'transparent',
              color: chatMode === 'session' ? '#fff' : 'var(--neo-muted)',
              fontWeight: chatMode === 'session' ? 600 : 400,
            }}
          >
            💬 Sessione
          </button>
          <button
            onClick={() => { setChatMode('archive'); setPendingCandidates(null); }}
            className="px-3 py-1 transition-colors"
            style={{
              background: chatMode === 'archive' ? 'var(--neo-accent)' : 'transparent',
              color: chatMode === 'archive' ? '#fff' : 'var(--neo-muted)',
              fontWeight: chatMode === 'archive' ? 600 : 400,
            }}
          >
            🗂 Archivio
            {archiveIndex.isReady && (
              <span className="ml-1 opacity-70">· {archiveIndex.stats.total}</span>
            )}
            {archiveIndex.isIndexing && (
              <span className="ml-1 opacity-70 animate-pulse">⏳</span>
            )}
          </button>
        </div>

        {activeHistory.length > 0 && (
          <span className="text-xs truncate" style={{ color: 'var(--neo-muted)' }}>
            {activeHistory.length} messaggio{activeHistory.length !== 1 ? 'i' : ''}
          </span>
        )}

        {activeHistory.length > 0 && (
          <div className="flex gap-1 flex-shrink-0">
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

        {/* Empty state — context available but no messages yet (session mode) */}
        {chatMode === 'session' && hasContext && history.length === 0 && !isTyping && (imageDecision !== null || !hasNoteImages) && (
          <div className="flex flex-col items-center py-6 gap-3">
            <div style={{
              width: 64, height: 64, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(192,38,211,0.15))',
              border: '1px solid rgba(167,139,250,0.25)', boxShadow: '0 0 30px rgba(124,58,237,0.15)', fontSize: 30,
            }}>🤖</div>
            <div className="text-center">
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--neo-text)' }}>Trascrizione caricata e pronta</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--neo-muted)' }}>
                Premi "Analizza" per generare l'analisi AI<br />oppure fai una domanda direttamente
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center pt-1">
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action}
                  onClick={() => handleQuickAction(action)}
                  className="text-xs px-3 py-1.5 rounded-full transition-all hover:opacity-90 active:scale-95"
                  style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.28)', color: '#a78bfa' }}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state — archive mode */}
        {chatMode === 'archive' && archiveChatHistory.length === 0 && !isTyping && (
          <div className="py-8 text-center">
            <div className="text-4xl mb-3">🗂</div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--neo-text)' }}>
              Interroga il tuo archivio storico
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--neo-muted)' }}>
              {archiveIndex.isReady
                ? `${archiveIndex.stats.total} sessioni disponibili · ${archiveIndex.stats.withTranscript} con trascritto`
                : 'Caricamento archivio…'}
            </p>
            {archiveIndex.isReady && (
              <div className="flex flex-wrap gap-2 justify-center">
                {['Quante sessioni hai?', 'Sessioni dell\'ultima settimana', 'Riunioni mandatory questa settimana', 'Di cosa si è parlato di più?'].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInputValue(q); }}
                    className="text-xs px-3 py-1.5 rounded-full transition-all hover:opacity-90 active:scale-95"
                    style={{
                      background: 'rgba(56,189,248,0.10)',
                      border: '1px solid rgba(56,189,248,0.25)',
                      color: '#38bdf8',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Analysis result card (shown only when llmResultTitle is provided = compact/unified mode) */}
        {sessionContext.llmResultTitle && sessionContext.llmResult && chatMode === 'session' && (
          <div
            className="rounded-xl mb-2 overflow-hidden flex-shrink-0"
            style={{ border: '1px solid rgba(139,92,246,0.30)', background: 'rgba(255,255,255,0.03)' }}
          >
            {/* Card header */}
            <div
              className="flex items-center gap-2 px-3 py-1.5"
              style={{ borderBottom: '1px solid rgba(139,92,246,0.18)', background: 'rgba(124,58,237,0.10)' }}
            >
              <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--neo-primary-l)' }}>
                🤖 AI Analysis — {sessionContext.llmResultTitle}
              </span>
              {/* Download .md */}
              <button
                onClick={() => {
                  const text = htmlToPlainText(sessionContext.llmResult);
                  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${sessionContext.sessionTitle.replace(/[^a-z0-9]/gi, '_')}_analisi.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="opacity-50 hover:opacity-100 transition-opacity p-0.5 rounded"
                title="Scarica come .md"
                style={{ color: 'var(--neo-muted)' }}
              >
                <DownloadIcon className="w-3.5 h-3.5" />
              </button>
              {/* Edit / Save */}
              {onAnalysisEdit && (
                analysisEditMode ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        onAnalysisEdit(markdownToHtmlSimple(analysisEditContent));
                        setAnalysisEditMode(false);
                      }}
                      className="text-[10px] px-2 py-0.5 rounded font-semibold"
                      style={{ background: 'rgba(34,197,94,0.20)', color: '#86EFAC', border: '1px solid rgba(34,197,94,0.35)' }}
                    >
                      Salva
                    </button>
                    <button
                      onClick={() => setAnalysisEditMode(false)}
                      className="text-[10px] px-2 py-0.5 rounded"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--neo-muted)', border: '1px solid rgba(255,255,255,0.10)' }}
                    >
                      Annulla
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAnalysisEditContent(htmlToPlainText(sessionContext.llmResult)); setAnalysisEditMode(true); }}
                    className="opacity-50 hover:opacity-100 transition-opacity p-0.5 rounded"
                    title="Modifica testo"
                    style={{ color: 'var(--neo-muted)' }}
                  >
                    <EditPencilIcon className="w-3.5 h-3.5" />
                  </button>
                )
              )}
              {/* Copy */}
              <button
                onClick={handleCopyAnalysis}
                className="opacity-50 hover:opacity-100 transition-opacity p-0.5 rounded"
                title="Copia analisi"
                style={{ color: 'var(--neo-muted)' }}
              >
                {copiedAnalysis ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
            {/* Card body */}
            {analysisEditMode ? (
              <textarea
                value={analysisEditContent}
                onChange={e => setAnalysisEditContent(e.target.value)}
                className="w-full text-sm p-3 outline-none"
                style={{
                  background: 'rgba(255,255,255,0.02)', color: 'var(--neo-text)',
                  fontFamily: 'inherit', resize: 'vertical', minHeight: '200px', maxHeight: '400px',
                  border: 'none', borderTop: '1px solid rgba(139,92,246,0.20)',
                }}
              />
            ) : (
              <div
                className="llm-result-display-prose text-sm p-3 overflow-y-auto"
                style={{ maxHeight: '260px' }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(sessionContext.llmResult) }}
              />
            )}
          </div>
        )}

        {/* Chat messages */}
        {activeHistory.map(msg => (
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
                <div>
                  {msg.attachedImages && msg.attachedImages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {msg.attachedImages.map((img, idx) => (
                        <img
                          key={idx}
                          src={img.previewUrl}
                          alt=""
                          className="w-14 h-14 object-cover rounded-lg"
                          style={{ border: '1px solid rgba(139,92,246,0.35)' }}
                        />
                      ))}
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--neo-text)' }}>
                    {msg.content}
                  </p>
                </div>
              ) : (
                <div
                  className="llm-result-display-prose text-sm"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMessageContent(msg.content)) }}
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
        {isTyping && !pendingCandidates && (
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

        {/* Candidate selection — human-in-loop per archive mode */}
        {pendingCandidates && (
          <div className="mt-3 rounded-xl p-3" style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.18)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: '#38bdf8' }}>
              Seleziona le sessioni da analizzare:
            </p>
            <div className="flex flex-col gap-1.5 mb-3">
              {pendingCandidates.map(c => {
                const checked = selectedCandidateIds.has(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-start gap-2 cursor-pointer rounded-lg px-2 py-1.5 transition-colors"
                    style={{ background: checked ? 'rgba(56,189,248,0.10)' : 'transparent' }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedCandidateIds(prev => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        });
                      }}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <span className="text-xs" style={{ color: 'var(--neo-text)' }}>
                      <strong>{c.name}</strong>
                      <span className="ml-1.5 opacity-60">{c.date}</span>
                      {c.matchSnippet && (
                        <span className="ml-1.5 opacity-50">· {c.matchSnippet.slice(0, 60)}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleAnalyzeCandidates}
                disabled={selectedCandidateIds.size === 0}
              >
                Analizza selezionate ({selectedCandidateIds.size})
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPendingCandidates(null)}>
                Annulla
              </Button>
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
          <div className="flex-1 flex flex-col min-w-0">
            {/* Pending image thumbnails */}
            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-1 pt-1 pb-0.5">
                {pendingImages.map((img, idx) => (
                  <div key={idx} className="relative flex-shrink-0">
                    <img
                      src={img.previewUrl}
                      alt=""
                      className="w-12 h-12 object-cover rounded-lg"
                      style={{ border: '1px solid rgba(139,92,246,0.4)' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePendingImage(idx)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white text-xs leading-none"
                      style={{ background: 'rgba(239,68,68,0.9)', fontSize: '10px' }}
                      aria-label="Rimuovi immagine"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePasteImage}
              placeholder={
                chatMode === 'archive'
                  ? 'Cerca nell\'archivio… (es. "AI con Mario Rossi la scorsa settimana")'
                  : hasContext
                    ? 'Chiedi qualcosa… (Invio per inviare, Shift+Invio per andare a capo)'
                    : 'Trascrivi prima una sessione…'
              }
              disabled={disabled || (chatMode === 'session' && !hasContext) || isTyping}
              rows={4}
              className="flex-1 bg-transparent text-sm outline-none py-1 px-1"
              style={{
                color: 'var(--neo-text)',
                minHeight: '80px',
                maxHeight: '300px',
                resize: 'vertical',
              }}
            />
          </div>
          <div className="flex-shrink-0 pb-0.5 flex flex-col gap-1 items-center">
            {/* Download chat .md */}
            {activeHistory.length > 0 && (
              <button
                type="button"
                onClick={handleExportMarkdown}
                disabled={disabled}
                className="p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--neo-muted)' }}
                title="Scarica chat come .md"
              >
                <DownloadIcon className="w-4 h-4" />
              </button>
            )}
            {/* Attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isTyping}
              className="p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--neo-muted)' }}
              title="Allega immagine"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              aria-hidden="true"
            />
            {isTyping ? (
              <Button variant="danger" size="sm" onClick={handleStop} leftIcon={<StopIcon />}>
                Stop
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSend}
                disabled={(!inputValue.trim() && pendingImages.length === 0) || !hasContext || disabled}
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
