
import React, {
  useState, useRef, useCallback, useEffect, useImperativeHandle, useMemo,
} from 'react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { useRecorderPlayer } from '../../hooks/recorder/useRecorderPlayer';
import { useScreenshotHandler } from '../../hooks/recorder/useScreenshotHandler';
import { AudioVisualizerCanvas } from '../AudioVisualizerCanvas';
import {
  RecordingState, AudioRecorderRef, AudioRecorderProps, PipelineStep,
} from '../../types';
import { formatTime } from '../../utils/textUtils';
import { saveBlobToFile } from '../../utils/fileUtils';

// ─── Extended props (same as AudioRecorder.tsx) ───────────────────────────────
interface NeoRecordingPanelProps extends AudioRecorderProps {
  recordingTimestampSuffix: string;
  onRecordingTimestampSuffixChange: (t: string) => void;
  onElapsedTimeChange?: (t: number) => void;
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
    const [showGuide, setShowGuide] = useState(false);
    const [guideKey, setGuideKey] = useState(0);
    const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const elapsedTimeRef = useRef(0);

    const {
      recordingState, startRecording, stopRecording, pauseRecording, resumeRecording,
      isPaused, audioBlob, micAnalyserNodeRef, appAudioAnalyserNodeRef,
      resetRecording, error, elapsedTime, displayStream, getAudioSnapshot, getRecordingSessionId,
      isAutoPaused, autoPauseState, autoPauseCountdown, realtimeTranscription,
      currentEmotion, emotionHistory: recorderEmotionHistory,
      addAppAudio, isAppAudioActive, isMicEnabled, toggleMic,
    } = useAudioRecorder({
      settings: props.audioSettings,
      llmSettings: props.llmSettings,
      onChunkComplete: props.onChunkComplete,
      onRecordingStop: props.onRecordingStop,
      enableChunkedRecording: props.transcriptionSettings.enableChunkedRecording,
      chunkIntervalSeconds: props.transcriptionSettings.chunkRecordingIntervalSeconds,
      enableRealtimeTranscription: props.transcriptionSettings.enableRealtimeTranscription,
      onLlmUsage: props.onLlmUsage,
    });

    useEffect(() => {
      elapsedTimeRef.current = elapsedTime;
      props.onElapsedTimeChange?.(elapsedTime);
    }, [elapsedTime]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const fullTitle = useMemo(() => {
      const base = props.recordingTitle.trim() || 'Session';
      return `${base}_${props.recordingTimestampSuffix}`;
    }, [props.recordingTitle, props.recordingTimestampSuffix]);

    // ── Expose AudioRecorderRef ──────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      getAudioSnapshot,
      resetRecording,
      getRecordingSessionId,
      triggerSystemAudioGuide: () => setGuideKey(k => k + 1),
      handleTakeScreenshot: screenshots.handleTakeScreenshot,
      getIsScreenSharing: () => !!(displayStream || screenshots.screenshotStream),
    }), [getAudioSnapshot, resetRecording, getRecordingSessionId, screenshots.handleTakeScreenshot, displayStream, screenshots.screenshotStream]);

    useEffect(() => {
      if (guideKey > 0) setShowGuide(true);
    }, [guideKey]);

    // ── Audio blob effects ───────────────────────────────────────────────────
    useEffect(() => {
      if (recordingState === RecordingState.STOPPED && audioBlob && !props.transcriptionSettings.enableChunkedRecording) {
        const ext = audioBlob.type.split('/')[1]?.split(';')[0] || 'webm';
        props.onRecordingComplete(audioBlob, `${fullTitle}.${ext}`, null, recorderEmotionHistory);
      }
    }, [recordingState, audioBlob, props.transcriptionSettings.enableChunkedRecording, fullTitle, recorderEmotionHistory]);

    useEffect(() => {
      if (audioBlob && !props.transcriptionSettings.enableChunkedRecording) {
        const url = URL.createObjectURL(audioBlob);
        setLocalAudioUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    }, [audioBlob, props.transcriptionSettings.enableChunkedRecording]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleStartMicOnly = useCallback(() => {
      props.onRecordingSessionStart();
      startRecording(false);
    }, [props.onRecordingSessionStart, startRecording]);

    const handleStartWithHeadphones = useCallback(() => setShowGuide(true), []);

    const handleConfirmGuide = useCallback(() => {
      setShowGuide(false);
      props.onRecordingSessionStart();
      startRecording(true);
    }, [props.onRecordingSessionStart, startRecording]);

    const handleStartWithoutHeadphones = useCallback(() => {
      setShowGuide(false);
      props.onRecordingSessionStart();
      startRecording(false);
    }, [props.onRecordingSessionStart, startRecording]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []).filter((f: File) => f.type.startsWith('audio/'));
      if (files.length) props.onFilesSelected(files);
    };

    // ── Derived state ────────────────────────────────────────────────────────
    const isRecording = recordingState === RecordingState.RECORDING;
    const isStartMode = recordingState !== RecordingState.RECORDING;
    const isFinalizing = props.pipelineStep &&
      props.pipelineStep !== PipelineStep.IDLE &&
      props.pipelineStep !== PipelineStep.RECORDING &&
      props.pipelineStep !== PipelineStep.COMPLETED;

    const chunkInterval = props.transcriptionSettings.chunkRecordingIntervalSeconds || 1800;
    const chunkCountdown = chunkInterval - (elapsedTime % chunkInterval);

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

    // Primary button config
    const primaryBtn = isStartMode ? null : isPaused
      ? { icon: <PlayIcon />, label: 'RESUME', bg: 'linear-gradient(135deg, #D97706, #F59E0B)', glow: 'rgba(217,119,6,0.55)', action: resumeRecording }
      : { icon: <StopSquareIcon />, label: 'STOP', bg: 'linear-gradient(135deg, #DC2626, #EF4444)', glow: 'rgba(220,38,38,0.55)', action: stopRecording, pulse: true };

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
                currentEmotion={currentEmotion}
                emotionHistory={props.emotionHistory}
              />
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

          {/* ── PRIMARY CONTROLS ──────────────────────────────────────────── */}
          <div>
            {isStartMode ? (
              /* Start mode: two buttons */
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
                  <span>+ Screen audio</span>
                </button>
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
              </div>
            )}

            {/* Pause / Resume when recording */}
            {isRecording && !isPaused && (
              <button
                onClick={pauseRecording}
                disabled={!!props.disabled}
                className="w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-all hover:scale-[1.01]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(139,92,246,0.2)',
                  color: 'var(--neo-muted)',
                }}
              >
                <PauseIcon />
                Pause
              </button>
            )}
          </div>

          {/* ── AUTO PAUSE STATUS ────────────────────────────────────────── */}
          {isRecording && props.audioSettings.enableAutoPause && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.15)' }}>
              {autoPauseState === 'sound' && (
                <><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span style={{ color: '#6EE7B7' }}>Sound detected</span></>
              )}
              {autoPauseState === 'countdown' && (
                <><div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span style={{ color: '#FCD34D' }}>Silence — pausing in {autoPauseCountdown}s…</span></>
              )}
              {autoPauseState === 'paused' && (
                <><div className="w-2 h-2 rounded-full bg-red-400" />
                  <span style={{ color: '#FCA5A5' }}>Auto-paused — listening to resume…</span></>
              )}
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

            {/* DB-Sync countdown */}
            {isRecording && props.transcriptionSettings.enableChunkedRecording && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
                style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}
                title="Time until current audio chunk is persisted to IndexedDB"
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
              </div>
            )}
          </div>

          {/* ── LIVE TRANSCRIPTION STRIP ─────────────────────────────────── */}
          {props.transcriptionSettings.enableRealtimeTranscription && isRecording && realtimeTranscription && (
            <div
              className="px-3 py-2 rounded-xl text-xs leading-relaxed max-h-20 overflow-y-auto"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(139,92,246,0.15)',
                color: '#C4B5FD',
              }}
            >
              <span className="font-bold uppercase tracking-wider text-[10px] block mb-1" style={{ color: 'var(--neo-muted)' }}>
                Live Transcript
              </span>
              <span>{realtimeTranscription}</span>
              {!isPaused && <span className="inline-block w-0.5 h-3 bg-violet-400 ml-0.5 animate-pulse" />}
            </div>
          )}

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
              onClick={async () => { await props.onReset(); resetRecording(); }}
              disabled={!!props.disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 disabled:opacity-40 ml-auto"
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
          <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handleFileChange} />
          {finalAudioUrl && (
            <audio ref={player.audioPlayerRef} src={finalAudioUrl}
              onPlay={() => player.setIsPlayerPlaying(true)}
              onPause={() => player.setIsPlayerPlaying(false)}
              onEnded={() => player.setIsPlayerPlaying(false)}
              className="hidden"
            />
          )}
        </div>
      </>
    );
  },
);

NeoRecordingPanel.displayName = 'NeoRecordingPanel';
