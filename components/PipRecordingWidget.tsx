import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AutoPauseState, PipelineStep, WaveformStyle } from '../types';
import { formatTime } from '../utils/textUtils';
import { FreqWaveform } from './FreqWaveform';
import { AudioVisualizerCanvas } from './AudioVisualizerCanvas';

interface PipRecordingWidgetProps {
  isRecording: boolean;
  isPaused: boolean;
  isAutoPaused: boolean;
  autoPauseState: AutoPauseState;
  pipelineStep: PipelineStep;
  elapsedTime: number;
  sessionTitle: string;
  chunksCount: number;
  micAnalyserNode: AnalyserNode | null;
  appAnalyserNode: AnalyserNode | null;
  isMicEnabled: boolean;
  isAppAudioActive: boolean;
  waveformStyle: WaveformStyle;
  onAddBubbleNote: (html: string) => void;
  onStartMicOnly: () => void;
  onStartWithScreenAudio: () => void;
  onToggleMic: () => void;
  onAddAppAudio: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onScreenshot: () => void;
  onClose: () => void;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const sz = 23;

const MicOnIcon = () => (
  <svg width={sz} height={sz} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);
const MicOffIcon = () => (
  <svg width={sz} height={sz} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
  </svg>
);
const HeadphonesIcon = () => (
  <svg width={sz} height={sz} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 18v-6a9 9 0 0118 0v6M3 18a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5zm16 0a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5z" />
  </svg>
);
const PauseIcon = () => (
  <svg width={sz} height={sz} fill="currentColor" viewBox="0 0 24 24">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);
const PlayIcon = () => (
  <svg width={sz} height={sz} fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5.14v13.72a1 1 0 001.55.83l10-6.86a1 1 0 000-1.66l-10-6.86A1 1 0 008 5.14z" />
  </svg>
);
const StopIcon = () => (
  <svg width={sz} height={sz} fill="currentColor" viewBox="0 0 24 24">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
);
const CameraIcon = () => (
  <svg width={sz} height={sz} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);
const SendIcon = () => (
  <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);
const SpinnerIcon = () => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"
    style={{ animation: 'pip-spin 1s linear infinite' }}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path fill="currentColor" opacity="0.8" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// ── Control button ────────────────────────────────────────────────────────────

const BTN_SIZE = 62;

const Btn: React.FC<{
  onClick: () => void;
  title: string;
  color: string;
  active?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, color, active = true, pulse = false, children }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: BTN_SIZE, height: BTN_SIZE,
      borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', border: 'none', outline: 'none', flexShrink: 0,
      background: active ? `rgba(${color},0.22)` : 'rgba(255,255,255,0.06)',
      color: active ? `rgb(${color})` : 'rgba(255,255,255,0.3)',
      boxShadow: active && !pulse ? `0 0 12px rgba(${color},0.28)` : 'none',
      animation: pulse ? 'pip-stop-pulse 2s ease-in-out infinite' : 'none',
      transition: 'transform 0.12s, background 0.15s',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; }}
    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
  >
    {children}
  </button>
);

// ── Pipeline labels ───────────────────────────────────────────────────────────

const PIPELINE_LABELS: Partial<Record<PipelineStep, string>> = {
  [PipelineStep.TRANSCRIBING]: 'Trascrizione in corso…',
  [PipelineStep.ANALYZING]: 'Analisi in corso…',
  [PipelineStep.DOWNLOADING]: 'Download in corso…',
};

// ── BubbleNote textarea ───────────────────────────────────────────────────────

const NoteInput: React.FC<{ onSubmit: (html: string) => void }> = ({ onSubmit }) => {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const readImageFromClipboard = useCallback((item: DataTransferItem) => {
    const file = item.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) setImages(prev => [...prev, dataUrl]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    Array.from(e.clipboardData.items).forEach(item => {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        readImageFromClipboard(item);
      }
    });
  }, [readImageFromClipboard]);

  const handleSubmit = useCallback(() => {
    if (!text.trim() && images.length === 0) return;
    const textHtml = text.trim()
      ? `<p>${text.trim().replace(/\n/g, '<br>')}</p>`
      : '';
    const imagesHtml = images.map(src => `<img src="${src}" style="max-width:100%" />`).join('');
    onSubmit(textHtml + imagesHtml);
    setText('');
    setImages([]);
  }, [text, images, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const removeImage = (idx: number) =>
    setImages(prev => prev.filter((_, i) => i !== idx));

  const hasContent = text.trim().length > 0 || images.length > 0;

  return (
    <div style={{
      flexShrink: 0,
      margin: '0 8px 6px',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(139,92,246,0.25)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* Immagini incollate */}
      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 6px 0' }}>
          {images.map((src, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={src} style={{ height: 36, width: 'auto', borderRadius: 4, objectFit: 'cover' }} />
              <button
                onClick={() => removeImage(i)}
                style={{
                  position: 'absolute', top: -4, right: -4,
                  width: 14, height: 14, borderRadius: '50%',
                  background: '#EF4444', border: 'none', cursor: 'pointer',
                  color: '#fff', fontSize: 9, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder="Area Bubble Notes"
          rows={4}
          style={{
            flex: 1, resize: 'none', border: 'none', outline: 'none',
            background: 'transparent', color: '#EDE9FE',
            fontSize: 11, lineHeight: 1.45,
            padding: '6px 4px 6px 8px',
            fontFamily: 'system-ui, sans-serif',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!hasContent}
          style={{
            flexShrink: 0, width: 28, height: 28, margin: '0 4px 4px 0',
            borderRadius: '50%', border: 'none', cursor: hasContent ? 'pointer' : 'default',
            background: hasContent ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.06)',
            color: hasContent ? '#E9D5FF' : 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          title="Salva nota (Invio)"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

export const PipRecordingWidget: React.FC<PipRecordingWidgetProps> = ({
  isRecording, isPaused, isAutoPaused, autoPauseState, pipelineStep,
  elapsedTime, sessionTitle, chunksCount,
  micAnalyserNode, appAnalyserNode, isMicEnabled, isAppAudioActive, waveformStyle,
  onAddBubbleNote, onStartMicOnly, onStartWithScreenAudio,
  onToggleMic, onAddAppAudio, onPause, onResume,
  onStop, onScreenshot, onClose,
}) => {
  const isActive = isRecording && (!isPaused || isAutoPaused);
  const dotColor = isRecording
    ? (isPaused || isAutoPaused ? '#FCD34D' : '#EF4444')
    : '#4B5563';
  const pipelineLabel = PIPELINE_LABELS[pipelineStep];

  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#000',
      display: 'flex', flexDirection: 'column',
      color: '#EDE9FE', fontFamily: 'system-ui, sans-serif',
      userSelect: 'none', position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes pip-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes pip-spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pip-stop-pulse {
          0%,100% { box-shadow: 0 0 12px rgba(239,68,68,0.35), 0 6px 16px rgba(0,0,0,0.3); }
          50%     { box-shadow: 0 0 32px rgba(239,68,68,0.85), 0 0 60px rgba(239,68,68,0.35), 0 6px 16px rgba(0,0,0,0.3); }
        }
        .pip-textarea::placeholder { color: rgba(167,139,250,0.35); }
      `}</style>

      {/* ── CLOSE BUTTON ─────────────────────────────────────────────── */}
      <button
        onClick={onClose}
        title="Chiudi widget"
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 10,
          width: 26, height: 26, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', cursor: 'pointer',
          background: 'rgba(0,0,0,0.55)',
          color: 'rgba(255,255,255,0.65)',
          fontSize: 12, lineHeight: 1,
          backdropFilter: 'blur(4px)',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.7)';
          (e.currentTarget as HTMLButtonElement).style.color = '#fff';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.55)';
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.65)';
        }}
      >✕</button>

      {/* ── STATUS BAR ───────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, height: 24,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 38px 0 10px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
        pointerEvents: 'none',
      }}>
        <span style={{
          flex: 1, fontSize: 9, color: '#6B5FA0',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
        }}>
          {sessionTitle}
        </span>
        {isRecording && chunksCount > 0 && (
          <span style={{ fontSize: 9, color: '#4B5563', flexShrink: 0 }}>{chunksCount}ch</span>
        )}
      </div>

      {/* ── WAVEFORM ─────────────────────────────────────────────────── */}
      <div style={{ flex: 2.5, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {waveformStyle === 'oscilloscope' ? (
          <AudioVisualizerCanvas
            micAnalyserNode={micAnalyserNode}
            appAnalyserNode={appAnalyserNode}
            isActive={isActive}
          />
        ) : (
          <FreqWaveform
            micAnalyserNode={micAnalyserNode}
            appAnalyserNode={appAnalyserNode}
            isActive={isActive}
          />
        )}
        {/* Large timer overlay — bottom-center of waveform */}
        {isRecording && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
            paddingBottom: 6, pointerEvents: 'none',
            background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)',
          }}>
            <span style={{
              fontFamily: 'monospace', fontWeight: 700,
              fontSize: 26, letterSpacing: '0.08em',
              color: isPaused ? '#FCD34D' : '#FF4444',
              textShadow: `0 0 18px ${isPaused ? 'rgba(252,211,77,0.7)' : 'rgba(255,68,68,0.7)'}`,
            }}>
              {formatTime(elapsedTime)}
            </span>
          </div>
        )}
      </div>

      {/* ── NOTE INPUT ───────────────────────────────────────────────── */}
      <NoteInput onSubmit={html => {
        onAddBubbleNote(html);
      }} />

      {/* ── CONTROLS ─────────────────────────────────────────────────── */}
      <div style={{
        flex: 3, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: '6px 12px 10px',
      }}>
        {isRecording ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Btn onClick={onToggleMic} title={isMicEnabled ? 'Silenzia microfono' : 'Riattiva microfono'}
                color="167,139,250" active={isMicEnabled}>
                {isMicEnabled ? <MicOnIcon /> : <MicOffIcon />}
              </Btn>
              <Btn onClick={onAddAppAudio}
                title={isAppAudioActive ? 'Audio sistema attivo' : 'Aggiungi audio sistema'}
                color={isAppAudioActive ? '52,211,153' : '139,92,246'}>
                <HeadphonesIcon />
              </Btn>
              <Btn
                onClick={isPaused || isAutoPaused ? onResume : onPause}
                title={isPaused || isAutoPaused ? 'Riprendi' : 'Pausa'}
                color="251,191,36">
                {isPaused || isAutoPaused ? <PlayIcon /> : <PauseIcon />}
              </Btn>
              <Btn onClick={onStop} title="Stop registrazione" color="239,68,68"
                pulse={!isPaused && !isAutoPaused}>
                <StopIcon />
              </Btn>
              <Btn onClick={onScreenshot} title="Screenshot → BubbleNote" color="52,211,153">
                <CameraIcon />
              </Btn>
            </div>
            {autoPauseState !== 'listening' && (
              <span style={{ fontSize: 10, color: '#FCD34D' }}>
                {autoPauseState === 'warning' ? '⚠ Pausa automatica in arrivo…' : '⏸ Auto-paused'}
              </span>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 240, padding: '0 4px' }}>
            {pipelineLabel ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: '#A78BFA', fontSize: 12 }}>
                <SpinnerIcon />
                {pipelineLabel}
              </div>
            ) : (
              <>
                <button
                  onClick={onStartMicOnly}
                  style={{
                    width: '100%', padding: '10px 14px',
                    borderRadius: 10, border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    background: 'linear-gradient(135deg, #7C3AED, #9333EA)',
                    color: '#fff', fontSize: 13, fontWeight: 600,
                    boxShadow: '0 0 16px rgba(124,58,237,0.4)',
                    transition: 'transform 0.12s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                >
                  <MicOnIcon /> Mic only
                </button>
                <button
                  onClick={onStartWithScreenAudio}
                  style={{
                    width: '100%', padding: '10px 14px',
                    borderRadius: 10, border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    background: 'linear-gradient(135deg, #6D28D9, #7C3AED)',
                    color: '#E9D5FF', fontSize: 13, fontWeight: 600,
                    boxShadow: '0 0 16px rgba(109,40,217,0.3)',
                    transition: 'transform 0.12s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                >
                  <HeadphonesIcon /> + Screen audio
                </button>
                {pipelineStep === PipelineStep.COMPLETED && (
                  <span style={{ fontSize: 10, color: '#6B7280', textAlign: 'center' }}>✓ Sessione completata</span>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
