import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { transcriptionService } from '../services/transcriptionService';
import { llmService } from '../services/geminiService';
import { RecordingState } from '../types';
import { DEFAULT_SETTINGS } from '../constants/defaultSettings';
import { formatTime } from '../utils/textUtils';
import { APP_VERSION } from '../constants/appConfig';
import { PerformanceBadge } from '../components/PerformanceBadge';
import { db } from '../utils/db';

const APP_SETTINGS_KEY = 'audioAIAssistantSettings';

function loadSettings() {
  try {
    const stored = localStorage.getItem(APP_SETTINGS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (_) {}
  return DEFAULT_SETTINGS;
}

const LITE_AUDIO_SETTINGS = {
  ...DEFAULT_SETTINGS.audio,
  enableAutoPause: false,
  enableAutoStop: false,
};

interface ChunkEntry {
  blob: Blob;
  name: string;
  fromMain: boolean;
  transcribed?: boolean;
  duration?: number; // seconds
}

const getAudioDuration = (blob: Blob): Promise<number> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Math.round(audio.duration)); };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    audio.src = url;
  });

const formatDuration = (s: number): string =>
  s >= 60 ? `${Math.floor(s / 60)}m${(s % 60).toString().padStart(2, '0')}s` : `${s}s`;

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  root: {
    background: '#0f0f17',
    minHeight: '100vh',
    color: '#e2e8f0',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    fontSize: 13,
    padding: '16px 20px',
    boxSizing: 'border-box' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  badge: {
    background: 'rgba(124,58,237,0.25)',
    border: '1px solid rgba(139,92,246,0.4)',
    color: '#a78bfa',
    borderRadius: 99,
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  sessionBanner: {
    background: 'rgba(16,185,129,0.08)',
    border: '1px solid rgba(16,185,129,0.25)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 12,
    color: '#6EE7B7',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase' as const,
    color: 'rgba(226,232,240,0.3)',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(139,92,246,0.2)',
    borderRadius: 8,
    padding: '8px 12px',
    color: '#e2e8f0',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box' as const,
    marginBottom: 20,
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: '16px 20px',
    marginBottom: 14,
    textAlign: 'center' as const,
  },
  timer: {
    fontSize: 36,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.06em',
    color: '#f1f5f9',
    margin: '8px 0 20px',
  },
  btnRow: { display: 'flex', gap: 10, justifyContent: 'center' },
  btnRec: {
    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    border: 'none', borderRadius: 10, color: '#fff',
    padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  btnSecondary: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, color: '#94a3b8',
    padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  btnBack: {
    background: 'rgba(16,185,129,0.1)',
    border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: 8, color: '#6EE7B7',
    padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  chunkRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', borderRadius: 8, marginBottom: 6,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)', fontSize: 12,
  },
  btnSmall: {
    background: 'rgba(139,92,246,0.15)',
    border: '1px solid rgba(139,92,246,0.3)',
    borderRadius: 6, color: '#a78bfa',
    padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
  },
  btnTranscribeAll: {
    background: 'linear-gradient(135deg, #059669, #10b981)',
    border: 'none', borderRadius: 10, color: '#fff',
    padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    width: '100%', marginBottom: 12,
  },
  textarea: {
    width: '100%',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, color: 'rgba(226,232,240,0.8)',
    fontSize: 12, lineHeight: 1.6, padding: '10px 12px',
    resize: 'vertical' as const, outline: 'none', minHeight: 120,
    boxSizing: 'border-box' as const, fontFamily: 'inherit',
  },
  error: {
    color: '#ef4444', fontSize: 11, marginTop: 8,
    padding: '6px 10px', background: 'rgba(239,68,68,0.1)',
    borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)',
  },
  aiActionRow: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const },
  btnAi: {
    flex: '1 1 auto',
    background: 'rgba(124,58,237,0.15)',
    border: '1px solid rgba(139,92,246,0.35)',
    borderRadius: 8, color: '#a78bfa',
    padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', minWidth: 100,
  },
};

// ── Dot indicator ─────────────────────────────────────────────────────────────

const RecDot: React.FC<{ state: RecordingState; isPaused: boolean }> = ({ state, isPaused }) => {
  const isRec = state === RecordingState.RECORDING && !isPaused;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
      <div style={{
        width: 12, height: 12, borderRadius: '50%',
        background: isRec ? '#ef4444' : isPaused ? '#f97316' : '#374151',
        boxShadow: isRec ? '0 0 0 4px rgba(239,68,68,0.2)' : 'none',
        animation: isRec ? 'litePulse 1.2s ease-in-out infinite' : 'none',
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 11, color: isRec ? '#fca5a5' : isPaused ? '#fdba74' : '#64748b', fontWeight: 600 }}>
        {isRec ? 'REC' : isPaused ? 'IN PAUSA' : state === RecordingState.STOPPED ? 'TERMINATO' : 'PRONTO'}
      </span>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

export const LiteHome: React.FC = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session');
  const autoStart = urlParams.get('autostart') === '1';

  const stored = loadSettings();
  const llmSettings = stored?.llm ?? DEFAULT_SETTINGS.llm;
  const transcriptionSettings = {
    ...DEFAULT_SETTINGS.transcription,
    enableChunkedRecording: false,
    enableRealtimeTranscription: false,
    enableAutoPipeline: false,
    language: stored?.transcription?.language ?? 'Italian',
  };

  // ── State ──────────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('Registrazione ' + new Date().toLocaleDateString('it-IT'));
  const [existingChunks, setExistingChunks] = useState<ChunkEntry[]>([]);
  const [newChunks, setNewChunks] = useState<ChunkEntry[]>([]);
  const [fullTranscript, setFullTranscript] = useState('');
  const [isTranscribingAll, setIsTranscribingAll] = useState(false);
  const [transcribingIdx, setTranscribingIdx] = useState<number | null>(null);
  const [aiResult, setAiResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const existingChunksRef = useRef<ChunkEntry[]>([]);
  const newChunksRef = useRef<ChunkEntry[]>([]);
  const titleRef = useRef(title);
  // startRecording will be wired after useAudioRecorder
  const startRecordingRef = useRef<((includeApp: boolean) => Promise<void>) | null>(null);

  useEffect(() => { existingChunksRef.current = existingChunks; }, [existingChunks]);
  useEffect(() => { newChunksRef.current = newChunks; }, [newChunks]);
  useEffect(() => { titleRef.current = title; }, [title]);

  // ── Chunk complete: save to DB ─────────────────────────────────────────────
  const onChunkComplete = useCallback(async (blob: Blob, index: number) => {
    const ext = blob.type.split('/')[1]?.split(';')[0] || 'webm';
    const name = `${titleRef.current}_seg${(existingChunksRef.current.length + index).toString().padStart(3, '0')}.${ext}`;
    const duration = await getAudioDuration(blob);
    const entry: ChunkEntry = { blob, name, fromMain: false, duration };
    setNewChunks(prev => [...prev, entry]);
    if (sessionId) {
      const allBlobs = [
        ...existingChunksRef.current.map(c => c.blob),
        ...newChunksRef.current.map(c => c.blob),
        blob,
      ];
      await db.updateSessionIncremental(sessionId, { chunks: allBlobs }).catch(console.error);
    }
  }, [sessionId]);

  // ── Audio recorder ─────────────────────────────────────────────────────────
  const {
    recordingState, startRecording, stopRecording, pauseRecording, resumeRecording,
    elapsedTime, isPaused, error, resetRecording, forceNewChunk,
  } = useAudioRecorder({
    settings: LITE_AUDIO_SETTINGS,
    llmSettings,
    enableChunkedRecording: true,
    chunkIntervalSeconds: 900,
    enableRealtimeTranscription: false,
    onChunkComplete,
  });

  // Keep ref current so it can be called from the async init
  useEffect(() => { startRecordingRef.current = startRecording; }, [startRecording]);

  // ── Mount: load session + BroadcastChannel handshake ──────────────────────
  useEffect(() => {
    const bc = new BroadcastChannel('audio-lite-handshake');

    const init = async () => {
      if (sessionId) {
        try {
          const session = await db.getSessionById(sessionId);
          if (session) {
            const name = session.name;
            setTitle(name);
            const blobs = session.data.chunks ?? [];
            const buildEntries = async (blobList: Blob[]): Promise<ChunkEntry[]> =>
              Promise.all(blobList.map(async (blob, i) => ({
                blob,
                name: `${name}_seg${(i + 1).toString().padStart(3, '0')}.webm`,
                fromMain: true,
                duration: await getAudioDuration(blob),
              })));
            if (blobs.length > 0) {
              setExistingChunks(await buildEntries(blobs));
            } else {
              // DB write potrebbe non essere ancora completata: retry in background
              setTimeout(async () => {
                const s2 = await db.getSessionById(sessionId!);
                const b2 = s2?.data.chunks ?? [];
                if (b2.length > 0) setExistingChunks(await buildEntries(b2));
              }, 2500);
            }
          }
        } catch (e) {
          console.error('[LiteHome] session load failed', e);
        }
      }

      // Notifica main window (senza aspettare il retry)
      bc.postMessage('lite-ready');
      bc.close();

      // Auto-start: avvia registrazione se richiesto dal main window
      if (autoStart) {
        // Piccolo delay per assicurarsi che startRecordingRef sia stato aggiornato
        await new Promise(r => setTimeout(r, 200));
        try {
          await startRecordingRef.current?.(false);
        } catch (e) {
          console.error('[LiteHome] auto-start failed', e);
        }
      }
    };

    init();
    return () => { try { bc.close(); } catch (_) {} };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────────
  const isIdle = recordingState === RecordingState.IDLE;
  const isRecording = recordingState === RecordingState.RECORDING;
  const isStopped = recordingState === RecordingState.STOPPED;
  const allChunks = [...existingChunks, ...newChunks];

  const handleStart = useCallback(() => { startRecording(false); }, [startRecording]);

  // ── Transcription ──────────────────────────────────────────────────────────
  const transcribeOne = useCallback(async (entry: ChunkEntry, globalIdx: number, total: number): Promise<string> => {
    setTranscribingIdx(globalIdx);
    try {
      const { transcription } = await transcriptionService.transcribe(
        entry.blob,
        { ...transcriptionSettings, fileName: entry.name },
        llmSettings,
      );
      if (entry.fromMain) {
        setExistingChunks(prev => prev.map((c, i) =>
          i === globalIdx ? { ...c, transcribed: true } : c
        ));
      } else {
        const localIdx = globalIdx - existingChunksRef.current.length;
        setNewChunks(prev => prev.map((c, i) =>
          i === localIdx ? { ...c, transcribed: true } : c
        ));
      }
      return `\n\n--- ${entry.name} (${globalIdx + 1}/${total}) ---\n${transcription}`;
    } catch (e) {
      return `\n\n--- ${entry.name} ---\n[ERRORE: ${e instanceof Error ? e.message : String(e)}]`;
    }
  }, [transcriptionSettings, llmSettings]);

  const handleTranscribeAll = useCallback(async () => {
    if (allChunks.length === 0) return;
    setIsTranscribingAll(true);
    setFullTranscript('');
    let acc = '';
    for (let i = 0; i < allChunks.length; i++) {
      const part = await transcribeOne(allChunks[i]!, i, allChunks.length);
      acc += part;
      setFullTranscript(acc.trim());
    }
    setTranscribingIdx(null);
    setIsTranscribingAll(false);
    if (sessionId) {
      await db.updateSessionIncremental(sessionId, { transcribedText: acc.trim() }).catch(console.error);
    }
  }, [allChunks, transcribeOne, sessionId]);

  const handleTranscribeSingle = useCallback(async (entry: ChunkEntry, i: number) => {
    const part = await transcribeOne(entry, i, allChunks.length);
    setFullTranscript(prev => (prev ? prev + part : part.trimStart()));
    setTranscribingIdx(null);
  }, [transcribeOne, allChunks.length]);

  const handleAnalyze = useCallback(async (type: 'minuta' | 'punti' | 'summary') => {
    if (!fullTranscript) return;
    setIsAnalyzing(true); setAnalyzeError(null); setAiResult('');
    const prompts: Record<typeof type, string> = {
      minuta:  'Genera una minuta concisa (max 250 parole). Indica: oggetto, partecipanti, decisioni, azioni, punti aperti.\n\nTRASCRIZIONE:\n',
      punti:   'Elenca i 10 punti chiave più importanti, ordinati per rilevanza decrescente. Un punto per riga.\n\nTRASCRIZIONE:\n',
      summary: 'Riassumi in 4-6 frasi il contenuto, catturando tema principale e conclusioni.\n\nTRASCRIZIONE:\n',
    };
    try {
      const { text } = await llmService.generateText(prompts[type] + fullTranscript, llmSettings);
      setAiResult(text);
    } catch (e: unknown) {
      setAnalyzeError(e instanceof Error ? e.message : 'Errore analisi AI');
    } finally {
      setIsAnalyzing(false);
    }
  }, [fullTranscript, llmSettings]);

  // ── Back to Normal Mode ────────────────────────────────────────────────────
  const handleBackToNormal = useCallback(async () => {
    if (isRecording) {
      forceNewChunk();
      await new Promise(r => setTimeout(r, 800));
    }
    const url = sessionId ? `/?continue=${sessionId}` : '/';
    window.open(url, '_blank', 'width=1280,height=900,resizable=yes');
    window.close();
  }, [isRecording, forceNewChunk, sessionId]);

  const handleReset = useCallback(() => {
    resetRecording();
    setNewChunks([]);
    setFullTranscript('');
    setAiResult('');
    setAnalyzeError(null);
  }, [resetRecording]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `@keyframes litePulse { 0%,100%{opacity:1} 50%{opacity:.4} }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>🎙</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>Audio AI Assistant</span>
          <span style={S.badge}>⚡ Super Light · v{APP_VERSION}</span>
          <PerformanceBadge />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sessionId && (
            <button style={S.btnBack} onClick={handleBackToNormal}>↩ Normal Mode</button>
          )}
          <button style={{ ...S.btnSecondary, fontSize: 11, padding: '6px 12px' }} onClick={() => window.close()}>
            ✕ Chiudi
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* Session banner */}
        {sessionId && existingChunks.length > 0 && (
          <div style={S.sessionBanner}>
            <span>📂</span>
            <span>
              <strong>{title}</strong>
              {' · '}{existingChunks.length} chunk dalla finestra principale
              {(() => {
                const tot = existingChunks.reduce((a, c) => a + (c.duration ?? 0), 0);
                return tot > 0 ? ` · ${formatDuration(tot)} registrati` : null;
              })()}
            </span>
          </div>
        )}

        {/* Title input */}
        <div style={S.label}>Nome sessione</div>
        <input
          style={S.input}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Titolo registrazione…"
          disabled={isRecording}
        />

        {/* Recording card */}
        <div style={S.card}>
          <RecDot state={recordingState} isPaused={isPaused} />
          <div style={S.timer}>{formatTime(elapsedTime)}</div>
          <div style={S.btnRow}>
            {isIdle && !isStopped && (
              <button style={S.btnRec} onClick={handleStart}>● Avvia registrazione</button>
            )}
            {isRecording && !isPaused && (
              <>
                <button style={S.btnSecondary} onClick={pauseRecording}>⏸ Pausa</button>
                <button style={{ ...S.btnSecondary, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={stopRecording}>■ Stop</button>
              </>
            )}
            {isRecording && isPaused && (
              <>
                <button style={S.btnRec} onClick={resumeRecording}>▶ Riprendi</button>
                <button style={{ ...S.btnSecondary, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={stopRecording}>■ Stop</button>
              </>
            )}
            {isStopped && (
              <button style={{ ...S.btnSecondary, fontSize: 12 }} onClick={handleReset}>↺ Nuova registrazione</button>
            )}
          </div>
          {error && <div style={S.error}>{error}</div>}
        </div>

        {/* Chunk list — visibile durante e dopo la registrazione */}
        {allChunks.length > 0 && (
          <div style={{ ...S.card, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
              <div>
                <span style={S.label}>Chunk audio — {allChunks.length} segmenti</span>
                {(() => {
                  const totalSec = allChunks.reduce((acc, c) => acc + (c.duration ?? 0), 0);
                  return totalSec > 0 ? (
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 6 }}>
                      totale {formatDuration(totalSec)}
                    </span>
                  ) : null;
                })()}
              </div>
              {isStopped && (
                <button style={{ ...S.btnTranscribeAll, width: 'auto', marginBottom: 0, padding: '7px 18px', fontSize: 12 }} onClick={handleTranscribeAll} disabled={isTranscribingAll}>
                  {isTranscribingAll
                    ? `Trascrizione ${transcribingIdx !== null ? transcribingIdx + 1 : ''}/${allChunks.length}…`
                    : 'Trascrivi tutti'}
                </button>
              )}
            </div>
            {allChunks.map((chunk, i) => (
              <div key={i} style={S.chunkRow}>
                {/* Numero sequenziale */}
                <span style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  background: chunk.fromMain ? 'rgba(100,116,139,0.2)' : 'rgba(139,92,246,0.2)',
                  color: chunk.fromMain ? '#64748b' : '#a78bfa',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800,
                }}>
                  {i + 1}
                </span>
                {/* Fonte */}
                <span style={{ fontSize: 12, flexShrink: 0 }} title={chunk.fromMain ? 'Dalla finestra principale' : 'Da Super Light'}>
                  {chunk.fromMain ? '🖥' : '⚡'}
                </span>
                {/* Nome (troncato) */}
                <span style={{ flex: 1, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                  {chunk.name}
                </span>
                {/* Durata */}
                {chunk.duration != null && chunk.duration > 0 ? (
                  <span style={{ color: '#475569', fontSize: 11, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {formatDuration(chunk.duration)}
                  </span>
                ) : (
                  <span style={{ color: '#374151', fontSize: 10, flexShrink: 0 }}>…</span>
                )}
                {/* Azioni */}
                {chunk.transcribed ? (
                  <span style={{ color: '#10b981', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</span>
                ) : transcribingIdx === i ? (
                  <span style={{ color: '#a78bfa', fontSize: 11, flexShrink: 0 }}>⏳</span>
                ) : (
                  isStopped && (
                    <button
                      style={S.btnSmall}
                      onClick={() => handleTranscribeSingle(chunk, i)}
                      disabled={isTranscribingAll || transcribingIdx !== null}
                    >
                      Trascrivi
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}

        {/* Transcript */}
        {fullTranscript && (
          <div style={{ ...S.card, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={S.label}>Trascrizione</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={S.btnSmall} onClick={() => navigator.clipboard.writeText(fullTranscript)}>Copia</button>
                <button style={S.btnSmall} onClick={() => {
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(new Blob([fullTranscript], { type: 'text/plain' }));
                  a.download = (title || 'trascrizione') + '.txt';
                  a.click();
                }}>.txt</button>
              </div>
            </div>
            <textarea style={S.textarea} value={fullTranscript} onChange={e => setFullTranscript(e.target.value)} rows={8} />

            <div style={{ ...S.label, marginBottom: 8, marginTop: 16 }}>Analisi AI</div>
            <div style={S.aiActionRow}>
              <button style={S.btnAi} disabled={isAnalyzing} onClick={() => handleAnalyze('minuta')}>📋 Minuta</button>
              <button style={S.btnAi} disabled={isAnalyzing} onClick={() => handleAnalyze('punti')}>🔑 10 punti</button>
              <button style={S.btnAi} disabled={isAnalyzing} onClick={() => handleAnalyze('summary')}>📝 Summary</button>
            </div>
            {isAnalyzing && <div style={{ color: '#a78bfa', fontSize: 12, marginBottom: 8 }}>Analisi in corso…</div>}
            {analyzeError && <div style={S.error}>{analyzeError}</div>}
            {aiResult && (
              <>
                <textarea style={{ ...S.textarea, minHeight: 140, color: '#e2e8f0' }} value={aiResult} onChange={e => setAiResult(e.target.value)} rows={8} />
                <button style={{ ...S.btnSmall, marginTop: 6 }} onClick={() => navigator.clipboard.writeText(aiResult)}>Copia analisi</button>
              </>
            )}
          </div>
        )}

        <p style={{ fontSize: 10, color: 'rgba(226,232,240,0.2)', textAlign: 'center', marginTop: 8 }}>
          Super Light — auto-pausa e live transcription disabilitati · chunk sincronizzati su IndexedDB
        </p>
      </div>
    </div>
  );
};
