
import React, {
  useState, useRef, useCallback, useEffect, useImperativeHandle, useMemo,
} from 'react';
import ReactDOM from 'react-dom';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { useRecorderPlayer } from '../../hooks/recorder/useRecorderPlayer';
import { useScreenshotHandler } from '../../hooks/recorder/useScreenshotHandler';
import { usePipWindow } from '../../hooks/usePipWindow';
import { AudioVisualizerCanvas } from '../AudioVisualizerCanvas';
import { FreqWaveform } from '../FreqWaveform';
import { PipRecordingWidget } from '../PipRecordingWidget';
import {
  RecordingState, AudioRecorderRef, AudioRecorderProps, PipelineStep,
} from '../../types';
import { formatTime } from '../../utils/textUtils';
import { saveBlobToFile } from '../../utils/fileUtils';
import { loggingService } from '../../services/loggingService';

// ─── Extended props (same as AudioRecorder.tsx) ───────────────────────────────
interface NeoRecordingPanelProps extends AudioRecorderProps {
  recordingTimestampSuffix: string;
  onRecordingTimestampSuffixChange: (t: string) => void;
  onElapsedTimeChange?: (t: number) => void;
  onRealtimeTranscriptionChange?: (text: string) => void;
}

// ─── Inline SVG icons ────────────────────────────────────────────────────────
const MicOnIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);
const MicOffIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
  </svg>
);
const HeadphonesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 18v-6a9 9 0 0118 0v6M3 18a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5zm16 0a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5z" />
  </svg>
);
const StopSquareIcon = () => (
  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
);
const PauseIcon = () => (
  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);
const PlayIcon = () => (
  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5.14v13.72a1 1 0 001.55.83l10-6.86a1 1 0 000-1.66l-10-6.86A1 1 0 008 5.14z" />
  </svg>
);
const RecordDotIcon = () => (
  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" />
  </svg>
);
const UploadIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);
const SaveIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);
const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

// ─── System Audio Guide Modal (2026 design) ───────────────────────────────────
const NeoAudioGuideModal: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
  onStartWithoutHeadphones: () => void;
}> = ({ onConfirm, onCancel, onStartWithoutHeadphones }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: 'var(--neo-overlay-bg)', backdropFilter: 'blur(20px)' }}
    onClick={onCancel}
  >
    <div
      className="relative w-full max-w-md rounded-2xl overflow-hidden"
      style={{
        background: 'var(--neo-surface-solid)',
        border: '1px solid rgba(139,92,246,0.35)',
        boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 40px rgba(124,58,237,0.2)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Gradient top bar */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, #7C3AED, #C026D3, #7C3AED)' }} />

      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.4), rgba(192,38,211,0.3))', border: '1px solid rgba(139,92,246,0.4)' }}
          >
            <HeadphonesIcon />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: '#EDE9FE' }}>Recording with headphones</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--neo-muted)' }}>Enable system audio capture</p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--neo-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--neo-text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--neo-muted)')}
        >
          ✕
        </button>
      </div>

      {/* Warning */}
      <div className="mx-6 mb-4 px-4 py-3 rounded-xl flex items-start gap-3"
        style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
        <span className="text-amber-400 mt-0.5 flex-shrink-0">⚠</span>
        <p className="text-xs leading-relaxed" style={{ color: '#FCD34D' }}>
          Headphones prevent the microphone from capturing PC audio.
          Share your screen with <strong>system audio enabled</strong> to record meetings.
        </p>
      </div>

      {/* Steps */}
      <div className="px-6 pb-2 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--neo-muted)' }}>
          In the browser screen-share dialog
        </p>

        {[
          {
            n: '1', color: '#7C3AED',
            title: 'Select the Entire Screen tab — click Screen 1',
            desc: 'Stay on Entire Screen — do not switch to "Chrome Tab". Only "Entire Screen" captures Teams, Meet, Zoom…',
          },
          {
            n: '2', color: '#10B981',
            title: 'Enable "Also share system audio"',
            desc: 'Find the toggle at the bottom of the dialog and turn it ON.',
            warning: 'If you see "Also share tab audio" instead, you are on the wrong tab — go back and select Entire Screen.',
          },
          { n: '3', color: '#7C3AED', title: 'Click Share', desc: 'Recording starts automatically.' },
        ].map(step => (
          <div key={step.n} className="flex items-start gap-3">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold text-white"
              style={{ background: step.color, boxShadow: `0 0 10px ${step.color}60` }}
            >
              {step.n}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: step.n === '2' ? 'var(--neo-success)' : 'var(--neo-text)' }}>{step.title}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--neo-muted)' }}>{step.desc}</p>
              {step.warning && (
                <p className="text-xs mt-1.5 px-2 py-1 rounded-lg" style={{ background: 'rgba(245,158,11,0.1)', color: '#FCD34D' }}>
                  ⚠ {step.warning}
                </p>
              )}
              {/* Toggle mockup for step 2 */}
              {step.n === '2' && (
                <div className="mt-2 px-3 py-2 rounded-lg flex items-center justify-between text-xs"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ color: '#C4B5FD' }}>Also share system audio</span>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-5 rounded-full relative" style={{ background: '#10B981', boxShadow: '0 0 8px rgba(16,185,129,0.5)' }}>
                      <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5 shadow-md" />
                    </div>
                    <span className="font-bold" style={{ color: '#6EE7B7' }}>ON</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 flex items-center justify-between gap-3 mt-2"
        style={{ borderTop: '1px solid var(--neo-border)' }}>
        {/* Left: start mic-only without opening screen share */}
        <button
          onClick={onStartWithoutHeadphones}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all hover:scale-105"
          style={{ color: 'var(--neo-muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.2)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--neo-text)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--neo-muted)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.2)'; }}
          title="Start with microphone only — no system audio"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          Rec without headphones
        </button>
        {/* Right: cancel / confirm */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg transition-colors"
            style={{ color: 'var(--neo-muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.2)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--neo-text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--neo-muted)')}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #C026D3)', boxShadow: '0 0 20px rgba(124,58,237,0.4)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 10l4.553-2.069A1 1 0 0121 8.847v6.306a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            Open screen share
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
export const NeoRecordingPanel = React.forwardRef<AudioRecorderRef, NeoRecordingPanelProps>(
  (props, ref) => {
    const [showAutoStopNotification, setShowAutoStopNotification] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [guideKey, setGuideKey] = useState(0);
    const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const elapsedTimeRef = useRef(0);
    const liveScrollRef = useRef<HTMLDivElement>(null);

    const {
      recordingState, startRecording, stopRecording, pauseRecording, resumeRecording,
      isPaused, audioBlob, micAnalyserNodeRef, appAudioAnalyserNodeRef,
      resetRecording, error, elapsedTime, displayStream, getAudioSnapshot, getRecordingSessionId,
      isAutoPaused, autoPauseState, autoPauseCountdown,
      autoStopCountdown, isAutoStopWarning, isAutoStopNotified,
      realtimeTranscription,
      addAppAudio, isAppAudioActive, isMicEnabled, toggleMic,
      forceNewChunk, chunkStartElapsedTime,
    } = useAudioRecorder({
      settings: props.audioSettings,
      llmSettings: props.llmSettings,
      onChunkComplete: props.onChunkComplete,
      onRecordingStop: props.onRecordingStop,
      enableChunkedRecording: props.transcriptionSettings.enableChunkedRecording,
      chunkIntervalSeconds: props.transcriptionSettings.chunkRecordingIntervalSeconds,
      enableRealtimeTranscription: props.transcriptionSettings.enableRealtimeTranscription,
      liveModel: props.transcriptionSettings.liveModel,
      onLlmUsage: props.onLlmUsage,
      onAutoStopNotify: () => setShowAutoStopNotification(true),
    });

    useEffect(() => {
      if (!isAutoStopNotified) setShowAutoStopNotification(false);
    }, [isAutoStopNotified]);

    useEffect(() => {
      elapsedTimeRef.current = elapsedTime;
      props.onElapsedTimeChange?.(elapsedTime);
    }, [elapsedTime]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      props.onRealtimeTranscriptionChange?.(realtimeTranscription);
    }, [realtimeTranscription]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      if (liveScrollRef.current) {
        liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
      }
    }, [realtimeTranscription]);

    const finalAudioUrl = props.externalAudioUrl || localAudioUrl;
    const player = useRecorderPlayer({
      finalAudioUrl,
      audioDuration: props.audioDuration,
      onAudioDurationChange: props.onAudioDurationChange,
    });

    const screenshots = useScreenshotHandler(
      displayStream,
      props.bubbleNotes,
      props.onBubbleNotesChange,
      props.pendingNoteHtml,
      props.onPendingNoteHtmlChange,
      elapsedTimeRef,
    );

    const pip = usePipWindow();

    const fullTitle = useMemo(() => {
      const base = props.recordingTitle.trim() || 'Session';
      return `${base}_${props.recordingTimestampSuffix}`;
    }, [props.recordingTitle, props.recordingTimestampSuffix]);

    // ── Expose AudioRecorderRef ──────────────────────────────────────────────
    const startMicOnlyRef = useRef<() => void>(() => {});
    const continueRecordingRef = useRef<() => void>(() => {});

    useImperativeHandle(ref, () => ({
      getAudioSnapshot,
      resetRecording,
      getRecordingSessionId,
      triggerSystemAudioGuide: () => setGuideKey(k => k + 1),
      handleTakeScreenshot: screenshots.handleTakeScreenshot,
      getIsScreenSharing: () => !!(displayStream || screenshots.screenshotStream),
      startMicOnly: () => startMicOnlyRef.current(),
      continueRecording: () => continueRecordingRef.current(),
    }), [getAudioSnapshot, resetRecording, getRecordingSessionId, screenshots.handleTakeScreenshot, displayStream, screenshots.screenshotStream]);

    useEffect(() => {
      if (guideKey > 0) setShowGuide(true);
    }, [guideKey]);

    // ── Audio blob effects ───────────────────────────────────────────────────
    useEffect(() => {
      if (recordingState === RecordingState.STOPPED && audioBlob && !props.transcriptionSettings.enableChunkedRecording) {
        const ext = audioBlob.type.split('/')[1]?.split(';')[0] || 'webm';
        props.onRecordingComplete(audioBlob, `${fullTitle}.${ext}`, null);
      }
    }, [recordingState, audioBlob, props.transcriptionSettings.enableChunkedRecording, fullTitle]);

    useEffect(() => {
      if (audioBlob && !props.transcriptionSettings.enableChunkedRecording) {
        const url = URL.createObjectURL(audioBlob);
        setLocalAudioUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    }, [audioBlob, props.transcriptionSettings.enableChunkedRecording]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleStartMicOnly = useCallback(async () => {
      const res = await props.onRecordingSessionStart();
      if (res === false) return;
      startRecording(false);
    }, [props.onRecordingSessionStart, startRecording]);

    startMicOnlyRef.current = handleStartMicOnly;
    // continueRecording: start mic without session reset (used by Load & Continue flow)
    continueRecordingRef.current = () => startRecording(false);

    const handleStartWithHeadphones = useCallback(() => setShowGuide(true), []);

    const handleConfirmGuide = useCallback(async () => {
      setShowGuide(false);
      const res = await props.onRecordingSessionStart();
      if (res === false) return;
      startRecording(true);
    }, [props.onRecordingSessionStart, startRecording]);

    const handleStartWithoutHeadphones = useCallback(async () => {
      setShowGuide(false);
      const res = await props.onRecordingSessionStart();
      if (res === false) return;
      startRecording(false);
    }, [props.onRecordingSessionStart, startRecording]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const AUDIO_EXT = /\.(webm|ogg|oga|opus|mp3|m4a|mp4|aac|wav|wave|flac|amr|3gp|3gpp|mka)$/i;
      const all = Array.from(e.target.files ?? []);
      loggingService.info('UPLOAD', 'File picker returned', { count: all.length, files: all.map(f => ({ name: f.name, type: f.type, size: f.size })) });
      const files = all.filter((f: File) =>
        f.type.startsWith('audio/') ||
        f.type === 'video/webm' || f.type === 'video/ogg' || f.type === 'video/mp4' ||
        AUDIO_EXT.test(f.name)
      );
      const rejected = all.filter(f => !files.includes(f));
      if (rejected.length) {
        loggingService.warn('UPLOAD', 'Files rejected by MIME/extension filter', { files: rejected.map(f => ({ name: f.name, type: f.type, size: f.size })) });
      }
      if (files.length) {
        loggingService.info('UPLOAD', 'Forwarding files to pipeline', { files: files.map(f => ({ name: f.name, type: f.type, size: f.size })) });
        props.onFilesSelected(files);
      } else if (all.length) {
        loggingService.error('UPLOAD', 'No accepted files after filter — upload aborted', { files: all.map(f => ({ name: f.name, type: f.type })) });
        alert(`Unsupported file format: ${all.map(f => f.name).join(', ')}`);
      }
      e.target.value = '';
    };

    // ── Derived state ────────────────────────────────────────────────────────
    const isRecording = recordingState === RecordingState.RECORDING;
    const isStartMode = recordingState !== RecordingState.RECORDING;
    const isFinalizing = props.pipelineStep &&
      props.pipelineStep !== PipelineStep.IDLE &&
      props.pipelineStep !== PipelineStep.RECORDING &&
      props.pipelineStep !== PipelineStep.COMPLETED;

    const chunkInterval = props.transcriptionSettings.chunkRecordingIntervalSeconds || 1800;
    const chunkCountdown = Math.max(1, chunkInterval - (elapsedTime - chunkStartElapsedTime));

    // ── Recording state visuals ──────────────────────────────────────────────
    const vizGlow = isRecording && !isPaused
      ? '0 0 40px rgba(239,68,68,0.35), 0 0 80px rgba(239,68,68,0.1)'
      : isRecording && isPaused
        ? '0 0 30px rgba(245,158,11,0.3)'
        : '0 0 20px rgba(124,58,237,0.15)';

    const vizBorder = isRecording && !isPaused
      ? 'rgba(239,68,68,0.5)'
      : isRecording && isPaused
        ? 'rgba(245,158,11,0.4)'
        : 'rgba(139,92,246,0.2)';

    // Primary button config — RESUME only for manual pause; auto-pause keeps STOP
    const primaryBtn = isStartMode ? null : (isPaused && !isAutoPaused)
      ? { icon: <PlayIcon />, label: 'RESUME', bg: 'linear-gradient(135deg, #D97706, #F59E0B)', glow: 'rgba(217,119,6,0.55)', action: resumeRecording }
      : { icon: <StopSquareIcon />, label: 'STOP', bg: 'linear-gradient(135deg, #DC2626, #EF4444)', glow: 'rgba(220,38,38,0.55)', action: stopRecording, pulse: !isAutoPaused };

    const showSave = !!audioBlob && !props.transcriptionSettings.enableChunkedRecording;

    return (
      <>
        {showGuide && (
          <NeoAudioGuideModal
            onConfirm={handleConfirmGuide}
            onCancel={() => setShowGuide(false)}
            onStartWithoutHeadphones={handleStartWithoutHeadphones}
          />
        )}

        <div className="flex flex-col gap-5" style={{ color: 'var(--neo-text)' }}>

          {/* ── SESSION HEADER ─────────────────────────────────────────────── */}
          <div>
            {/* Label */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
                style={{
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(192,38,211,0.2))',
                  border: '1px solid rgba(139,92,246,0.4)',
                  color: '#A78BFA',
                  boxShadow: '0 0 12px rgba(124,58,237,0.2)',
                }}
              >
                {isRecording ? (isPaused ? '⏸ Paused' : '⏺ Recording') : '🎙 Recording Studio'}
              </div>

              {isRecording && !isPaused && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[11px] font-mono font-bold text-red-400">{formatTime(elapsedTime)}</span>
                </div>
              )}
              {isRecording && isPaused && (
                <span className="text-[11px] font-mono font-bold text-amber-400">{formatTime(elapsedTime)}</span>
              )}
            </div>

            {/* Session name */}
            <input
              value={props.recordingTitle}
              onChange={e => props.onRecordingTitleChange(e.target.value)}
              placeholder="Session name..."
              disabled={!!props.disabled}
              className="w-full bg-transparent outline-none text-lg font-semibold"
              style={{
                border: 'none',
                borderBottom: '1px solid var(--neo-border)',
                color: 'var(--neo-text)',
                paddingBottom: '6px',
                letterSpacing: '-0.01em',
                caretColor: '#A78BFA',
              }}
            />
            {/* Filename preview */}
            <p className="text-[11px] mt-1.5 font-mono truncate" style={{ color: 'var(--neo-muted)' }}>
              {fullTitle}.webm
            </p>
          </div>

          {/* ── VISUALIZER HERO ───────────────────────────────────────────── */}
          <div
            className="rounded-2xl overflow-hidden transition-all duration-500 relative"
            style={{
              border: `1px solid ${vizBorder}`,
              boxShadow: vizGlow,
              background: 'var(--neo-visualizer-bg)',
            }}
          >
            {/* Animated gradient overlay behind canvas */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: isRecording && !isPaused
                  ? 'radial-gradient(ellipse at center bottom, rgba(220,38,38,0.08) 0%, transparent 70%)'
                  : 'radial-gradient(ellipse at center bottom, rgba(124,58,237,0.08) 0%, transparent 70%)',
                transition: 'background 0.5s',
              }}
            />
            <div style={{ height: 200 }}>
              {(props.audioSettings.waveformStyle ?? 'spectrum') === 'spectrum' && isRecording ? (
                <FreqWaveform
                  micAnalyserNode={micAnalyserNodeRef.current}
                  appAnalyserNode={appAudioAnalyserNodeRef.current}
                  isActive={!isPaused || isAutoPaused}
                />
              ) : (
                <AudioVisualizerCanvas
                  micAnalyserNode={isRecording ? micAnalyserNodeRef.current : (player.isPlayerPlaying ? player.playerAnalyserNodeRef.current : null)}
                  appAnalyserNode={isRecording ? appAudioAnalyserNodeRef.current : null}
                  isActive={isRecording ? (!isPaused || isAutoPaused) : player.isPlayerPlaying}
                  audioBuffer={player.decodedAudioBuffer}
                  currentTime={isRecording ? undefined : player.currentPlayTime}
                  duration={isRecording ? undefined : (props.audioDuration || 0)}
                  autoPauseEnabled={props.audioSettings.enableAutoPause}
                  autoPauseSensitivityDb={props.audioSettings.autoPauseSensitivityDb}
                  autoPauseState={autoPauseState}
                  onSeek={player.decodedAudioBuffer ? player.handleSeek : undefined}
                />
              )}
            </div>

            {/* Large timer overlay when recording */}
            {isRecording && (
              <div
                className="absolute bottom-0 left-0 right-0 flex items-end justify-center pb-3 pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}
              >
                <span
                  className="font-mono font-bold tracking-widest"
                  style={{
                    fontSize: 28,
                    color: isPaused ? '#FCD34D' : '#FF4444',
                    textShadow: `0 0 20px ${isPaused ? 'rgba(252,211,77,0.7)' : 'rgba(255,68,68,0.7)'}`,
                    letterSpacing: '0.08em',
                  }}
                >
                  {formatTime(elapsedTime)}
                </span>
              </div>
            )}
          </div>

          {/* ── PLAYER CONTROLS (when external audio loaded, not recording) ── */}
          {!isRecording && finalAudioUrl && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(139,92,246,0.3)' }}
            >
              <button
                onClick={player.handleRewind}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-all hover:scale-110"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#A78BFA' }}
                title="Indietro 10s"
              >⏮</button>
              <button
                onClick={player.handlePlayPause}
                disabled={player.isPlayerPlaying}
                className="w-8 h-8 flex items-center justify-center rounded-full text-sm transition-all hover:scale-110 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #C026D3)', color: 'white', boxShadow: '0 0 10px rgba(124,58,237,0.4)' }}
                title="Play"
              >▶</button>
              <button
                onClick={() => { player.audioPlayerRef.current?.pause(); loggingService.info('PLAYER', 'pause button clicked'); }}
                disabled={!player.isPlayerPlaying}
                className="w-8 h-8 flex items-center justify-center rounded-full text-sm transition-all hover:scale-110 disabled:opacity-40"
                style={{ background: 'rgba(139,92,246,0.25)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.4)' }}
                title="Pausa"
              >⏸</button>
              <button
                onClick={props.onStopPlayback}
                className="w-8 h-8 flex items-center justify-center rounded-full text-sm transition-all hover:scale-110"
                style={{ background: 'rgba(239,68,68,0.2)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.35)' }}
                title="Stop"
              >⏹</button>
              <button
                onClick={player.handleForward}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-all hover:scale-110"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#A78BFA' }}
                title="Avanti 10s"
              >⏭</button>
              <span className="font-mono text-xs ml-1" style={{ color: '#C4B5FD' }}>
                {formatTime(player.currentPlayTime)} / {formatTime(props.audioDuration || 0)}
              </span>
            </div>
          )}

          {/* ── PRIMARY CONTROLS ──────────────────────────────────────────── */}
          <div>
            {isStartMode ? (
              /* Start mode: three buttons */
              <div className="flex gap-3">
                <button
                  onClick={handleStartMicOnly}
                  disabled={!!props.disabled || !!isFinalizing}
                  className="flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.4), rgba(109,40,217,0.3))',
                    border: '1px solid rgba(139,92,246,0.45)',
                    color: 'var(--neo-text)',
                    boxShadow: '0 4px 20px rgba(124,58,237,0.2)',
                  }}
                  title="Record with microphone only — system audio not captured"
                >
                  <MicOnIcon />
                  <span>Mic only</span>
                </button>
                <button
                  onClick={handleStartWithHeadphones}
                  disabled={!!props.disabled || !!isFinalizing}
                  className="flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg, rgba(192,38,211,0.4), rgba(124,58,237,0.3))',
                    border: '1px solid rgba(192,38,211,0.5)',
                    color: 'var(--neo-text)',
                    boxShadow: '0 4px 20px rgba(192,38,211,0.2)',
                  }}
                  title="Opens system audio capture — required for Teams / Zoom / Meet recording"
                >
                  <HeadphonesIcon />
                  <span>+ System audio</span>
                </button>
                {pip.isSupported && (
                  <button
                    onClick={() => pip.isOpen ? pip.closePip() : pip.openPip()}
                    disabled={!!props.disabled || !!isFinalizing}
                    className="flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: pip.isOpen
                        ? 'linear-gradient(135deg, rgba(124,58,237,0.5), rgba(139,92,246,0.4))'
                        : 'linear-gradient(135deg, rgba(109,40,217,0.3), rgba(124,58,237,0.2))',
                      border: `1px solid ${pip.isOpen ? 'rgba(139,92,246,0.6)' : 'rgba(139,92,246,0.3)'}`,
                      color: pip.isOpen ? '#C4B5FD' : 'var(--neo-text)',
                      boxShadow: pip.isOpen ? '0 4px 20px rgba(124,58,237,0.35)' : '0 4px 20px rgba(124,58,237,0.1)',
                    }}
                    title={pip.isOpen ? 'Chiudi floating widget' : 'Apri floating widget (sempre in primo piano)'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="15" rx="2" />
                      <rect x="13" y="10" width="7" height="6" rx="1" fill="currentColor" strokeWidth="0" />
                    </svg>
                    <span>{pip.isOpen ? 'PiP ✓' : 'PiP'}</span>
                  </button>
                )}
              </div>
            ) : (
              /* Recording mode: mic | big button | headphones */
              <div className="flex items-center justify-between gap-4">
                {/* Mic toggle */}
                <button
                  onClick={toggleMic}
                  disabled={!!props.disabled}
                  className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                  style={{
                    background: isMicEnabled ? 'rgba(139,92,246,0.2)' : 'rgba(239,68,68,0.2)',
                    border: `1px solid ${isMicEnabled ? 'rgba(139,92,246,0.4)' : 'rgba(239,68,68,0.5)'}`,
                    color: isMicEnabled ? '#A78BFA' : '#FCA5A5',
                  }}
                  title={isMicEnabled ? 'Click to mute microphone' : 'Click to unmute microphone'}
                >
                  {isMicEnabled ? <MicOnIcon /> : <MicOffIcon />}
                </button>

                {/* Big primary button */}
                <button
                  onClick={primaryBtn?.action}
                  disabled={!!props.disabled}
                  className="w-20 h-20 rounded-full flex flex-col items-center justify-center gap-0.5 transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-40"
                  style={{
                    background: primaryBtn?.bg,
                    boxShadow: `0 0 30px ${primaryBtn?.glow}, 0 8px 20px rgba(0,0,0,0.3)`,
                    animation: primaryBtn?.pulse ? 'neo-pulse-glow 2s ease-in-out infinite' : 'none',
                    color: 'white',
                  }}
                >
                  {primaryBtn?.icon}
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-80">{primaryBtn?.label}</span>
                </button>

                {/* App audio / headphones toggle */}
                <button
                  onClick={isAppAudioActive ? undefined : addAppAudio}
                  disabled={!!props.disabled || isAppAudioActive}
                  className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 disabled:cursor-default"
                  style={{
                    background: isAppAudioActive ? 'rgba(16,185,129,0.2)' : 'rgba(139,92,246,0.15)',
                    border: `1px solid ${isAppAudioActive ? 'rgba(16,185,129,0.5)' : 'rgba(139,92,246,0.3)'}`,
                    color: isAppAudioActive ? '#6EE7B7' : '#A78BFA',
                    boxShadow: isAppAudioActive ? '0 0 12px rgba(16,185,129,0.3)' : 'none',
                  }}
                  title={isAppAudioActive ? 'System audio active' : 'Add system audio mid-recording'}
                >
                  <HeadphonesIcon />
                </button>

                {/* PiP toggle — visible during recording */}
                {pip.isSupported && (
                  <button
                    onClick={() => pip.isOpen ? pip.closePip() : pip.openPip()}
                    disabled={!!props.disabled}
                    className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                    style={{
                      background: pip.isOpen ? 'rgba(124,58,237,0.35)' : 'rgba(109,40,217,0.15)',
                      border: `1px solid ${pip.isOpen ? 'rgba(139,92,246,0.6)' : 'rgba(139,92,246,0.3)'}`,
                      color: pip.isOpen ? '#C4B5FD' : '#A78BFA',
                      boxShadow: pip.isOpen ? '0 0 12px rgba(124,58,237,0.4)' : 'none',
                    }}
                    title={pip.isOpen ? 'Chiudi floating widget' : 'Apri floating widget (sempre in primo piano)'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="15" rx="2" />
                      <rect x="13" y="10" width="7" height="6" rx="1" fill="currentColor" strokeWidth="0" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Pause / countdown / Resume when recording */}
            {isRecording && (!isPaused || isAutoPaused) && (
              <button
                onClick={isAutoPaused ? resumeRecording : pauseRecording}
                disabled={!!props.disabled}
                className="w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-all hover:scale-[1.01]"
                style={{
                  background: isAutoPaused
                    ? 'rgba(16,185,129,0.1)'
                    : autoPauseState === 'warning'
                    ? 'rgba(245,158,11,0.08)'
                    : 'rgba(255,255,255,0.04)',
                  border: isAutoPaused
                    ? '1px solid rgba(16,185,129,0.35)'
                    : autoPauseState === 'warning'
                    ? '1px solid rgba(245,158,11,0.35)'
                    : '1px solid rgba(139,92,246,0.2)',
                  color: isAutoPaused
                    ? '#6EE7B7'
                    : autoPauseState === 'warning'
                    ? '#FCD34D'
                    : 'var(--neo-muted)',
                }}
              >
                {isAutoPaused ? (
                  <><PlayIcon />Resume</>
                ) : autoPauseState === 'warning' ? (
                  <><PauseIcon />Pausa in {autoPauseCountdown}s…</>
                ) : (
                  <><PauseIcon />Pause</>
                )}
              </button>
            )}
          </div>

          {/* ── AUTO PAUSE STATUS ────────────────────────────────────────── */}
          {isRecording && props.audioSettings.enableAutoPause && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
              {autoPauseState === 'listening' && (
                <><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span style={{ color: '#6EE7B7' }}>Audio rilevato</span></>
              )}
              {autoPauseState === 'warning' && (
                <><div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span style={{ color: '#FCD34D' }}>Silenzio — pausa in {autoPauseCountdown}s…</span></>
              )}
              {autoPauseState === 'auto-paused' && (
                <><div className="w-2 h-2 rounded-full bg-red-400" />
                  <span style={{ color: '#FCA5A5' }}>Auto-paused — in ascolto per riprendere…</span></>
              )}
            </div>
          )}

          {/* ── AUTO-STOP NOTIFICATION (5 min silence) ───────────────────── */}
          {isRecording && showAutoStopNotification && !isAutoStopWarning && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.4)' }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#FB923C' }} />
              <span className="flex-1" style={{ color: '#FED7AA' }}>Registrazione attiva — nessun audio rilevato da {props.audioSettings.autoNotifyAfterPausedMinutes} minuti</span>
              <button
                onClick={stopRecording}
                className="px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80 flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.5)', color: '#FCA5A5' }}
              >Stop</button>
              <button
                onClick={() => setShowAutoStopNotification(false)}
                className="text-[10px] opacity-50 hover:opacity-80 flex-shrink-0"
                style={{ color: '#FED7AA' }}
                title="Chiudi"
              >✕</button>
            </div>
          )}

          {/* ── AUTO-STOP COUNTDOWN BANNER (15 min silence) ──────────────── */}
          {isRecording && isAutoStopWarning && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.5)' }}>
              <div className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ background: '#EF4444' }} />
              <span className="flex-1" style={{ color: '#FCA5A5' }}>Nessun audio rilevato — registrazione si ferma in <strong>{autoStopCountdown}s</strong></span>
              <button
                onClick={resumeRecording}
                className="px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80 flex-shrink-0"
                style={{ background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(139,92,246,0.5)', color: '#C4B5FD' }}
              >Continua a registrare</button>
            </div>
          )}

          {/* ── SMART PIPELINE + CHUNK INFO ──────────────────────────────── */}
          <div className="flex flex-wrap gap-2">
            {/* Smart Pipeline toggle */}
            <div
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium flex-1 min-w-0"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}
              title="Auto-run Transcription + AI Analysis when recording stops"
            >
              <button
                onClick={() => props.onToggleAutoPipeline(!props.autoPipelineEnabled)}
                className="w-10 h-5 rounded-full relative transition-all duration-300 flex-shrink-0"
                style={{
                  background: props.autoPipelineEnabled
                    ? 'linear-gradient(135deg, #7C3AED, #C026D3)'
                    : 'rgba(255,255,255,0.1)',
                  boxShadow: props.autoPipelineEnabled ? '0 0 10px rgba(124,58,237,0.4)' : 'none',
                }}
              >
                <div
                  className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all duration-300 shadow"
                  style={{ left: props.autoPipelineEnabled ? 'calc(100% - 18px)' : '2px' }}
                />
              </button>
              <span style={{ color: 'var(--neo-muted)' }}>Smart Pipeline</span>
            </div>

            {/* DB-Sync countdown — click to force an immediate chunk save */}
            {isRecording && props.transcriptionSettings.enableChunkedRecording && (
              <button
                onClick={forceNewChunk}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'rgba(124,58,237,0.12)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  cursor: 'pointer',
                }}
                title="Forza il salvataggio del chunk corrente ora"
              >
                <span className="font-mono" style={{ color: '#A78BFA' }}>DB {formatTime(chunkCountdown)}</span>
                {props.chunksCount > 0 && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'rgba(16,185,129,0.2)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.3)' }}
                  >
                    {props.chunksCount} saved
                  </span>
                )}
              </button>
            )}
          </div>


          {/* ── PIPELINE STATUS ───────────────────────────────────────────── */}
          {isFinalizing && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs animate-pulse"
              style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA' }}
            >
              <div className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
              Finalizing pipeline…
            </div>
          )}

          {/* ── BOTTOM ACTIONS ────────────────────────────────────────────── */}
          <div
            className="flex items-center gap-2 flex-wrap pt-3"
            style={{ borderTop: '1px solid var(--neo-border)' }}
          >
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!!props.disabled || isRecording || !!isFinalizing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(139,92,246,0.2)', color: 'var(--neo-muted)' }}
              title="Upload an audio file to transcribe"
            >
              <UploadIcon /> Upload
            </button>
            {showSave && (
              <button
                onClick={() => audioBlob && saveBlobToFile(audioBlob, `${fullTitle}.${audioBlob.type.split('/')[1]?.split(';')[0] || 'webm'}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#6EE7B7' }}
                title="Save recorded audio to disk"
              >
                <SaveIcon /> Save audio
              </button>
            )}
            <button
              onClick={() => window.open(window.location.href, '_blank')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 ml-auto"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#A5B4FC' }}
              title="Open a new clean session in a new tab"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h6"/></svg>
              New session
            </button>
            <button
              onClick={async () => { await props.onReset(); resetRecording(); }}
              disabled={!!props.disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 disabled:opacity-40"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}
              title="Reset everything — clears recording, transcript and AI results"
            >
              <TrashIcon /> Reset
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </p>
          )}

          {/* Hidden file input */}
          <input ref={fileInputRef} type="file" accept="audio/*,video/webm,video/ogg,video/mp4,.webm,.ogg,.oga,.opus,.mp3,.m4a,.mp4,.aac,.wav,.wave,.flac,.amr,.3gp,.3gpp,.mka" multiple className="hidden" onChange={handleFileChange} />
          {finalAudioUrl && (
            <audio ref={player.audioPlayerRef} src={finalAudioUrl}
              onPlay={() => player.setIsPlayerPlaying(true)}
              onPause={() => player.setIsPlayerPlaying(false)}
              onEnded={() => player.setIsPlayerPlaying(false)}
              className="hidden"
            />
          )}
        </div>

        {pip.mountEl && ReactDOM.createPortal(
          <PipRecordingWidget
            isRecording={isRecording}
            isPaused={isPaused}
            isAutoPaused={isAutoPaused}
            autoPauseState={autoPauseState}
            pipelineStep={props.pipelineStep ?? PipelineStep.IDLE}
            elapsedTime={elapsedTime}
            sessionTitle={props.recordingTitle}
            chunksCount={props.chunksCount}
            micAnalyserNode={isRecording ? micAnalyserNodeRef.current : null}
            appAnalyserNode={isRecording ? appAudioAnalyserNodeRef.current : null}
            isMicEnabled={isMicEnabled}
            isAppAudioActive={isAppAudioActive}
            waveformStyle={props.audioSettings.waveformStyle ?? 'spectrum'}
            onAddBubbleNote={(html: string) => {
              const note = {
                id: `pip_${Date.now()}`,
                contentHtml: html,
                timestamp: Date.now(),
                recordingElapsedTime: elapsedTime,
                isEditing: false,
                isProcessing: false,
              };
              props.onBubbleNotesChange([...props.bubbleNotes, note]);
            }}
            onStartMicOnly={handleStartMicOnly}
            onStartWithScreenAudio={handleConfirmGuide}
            onToggleMic={toggleMic}
            onAddAppAudio={addAppAudio}
            onPause={pauseRecording}
            onResume={resumeRecording}
            onStop={stopRecording}
            onScreenshot={() => screenshots.handleTakeScreenshot(true)}
            onClose={pip.closePip}
          />,
          pip.mountEl
        )}
      </>
    );
  },
);

NeoRecordingPanel.displayName = 'NeoRecordingPanel';
