
import { useState, useRef, useEffect, useCallback } from 'react';
import { RecordingState, AudioSettings, AutoPauseState } from '../../types';

export type { AutoPauseState };

export const useAutoPauseLogic = (
  settings: AudioSettings,
  recordingState: RecordingState,
  isPaused: boolean,
  micAnalyserNode: AnalyserNode | null,
  appAnalyserNode: AnalyserNode | null,
  micTrack: MediaStreamTrack | null,
  onPause: () => void,
  onResume: () => void,
  onAutoStopNotify?: () => void,
  onAutoStop?: () => void,
) => {
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const [autoPauseState, setAutoPauseState] = useState<AutoPauseState>('inactive');
  const [autoPauseCountdown, setAutoPauseCountdown] = useState<number>(0);
  const [autoStopCountdown, setAutoStopCountdown] = useState<number>(0);
  const [isAutoStopWarning, setIsAutoStopWarning] = useState(false);
  const [isAutoStopNotified, setIsAutoStopNotified] = useState(false);

  const silenceStartTimestampRef = useRef<number | null>(null);
  const analysisFrameRef = useRef<number | null>(null);
  const autoNotifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const SILENCE_GRACE_PERIOD_MS = 2000;

  const clearAutoStopTimers = useCallback(() => {
    if (autoNotifyTimerRef.current) { clearTimeout(autoNotifyTimerRef.current); autoNotifyTimerRef.current = null; }
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null; }
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    setAutoStopCountdown(0);
    setIsAutoStopWarning(false);
    setIsAutoStopNotified(false);
  }, []);

  // Start auto-stop escalation timers when recording enters auto-paused state
  useEffect(() => {
    if (!isAutoPaused || !settings.enableAutoStop) {
      clearAutoStopTimers();
      return;
    }

    const notifyMs = settings.autoNotifyAfterPausedMinutes * 60 * 1000;
    const stopMs = settings.autoStopAfterPausedMinutes * 60 * 1000;
    const warningMs = settings.autoStopWarningSeconds * 1000;

    // Timer 1: notification at autoNotifyAfterPausedMinutes
    autoNotifyTimerRef.current = setTimeout(() => {
      setIsAutoStopNotified(true);
      onAutoStopNotify?.();

      // Timer 2: countdown warning at autoStopAfterPausedMinutes
      const remainingMs = Math.max(stopMs - notifyMs, 1000);
      autoStopTimerRef.current = setTimeout(() => {
        setIsAutoStopWarning(true);
        let remaining = settings.autoStopWarningSeconds;
        setAutoStopCountdown(remaining);
        countdownIntervalRef.current = setInterval(() => {
          remaining -= 1;
          setAutoStopCountdown(remaining);
          if (remaining <= 0) {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            setIsAutoStopWarning(false);
            setAutoStopCountdown(0);
            onAutoStop?.();
          }
        }, 1000);
      }, remainingMs - warningMs > 0 ? remainingMs - warningMs : 0);

      // Start countdown immediately if no time left after notify
      if (remainingMs <= warningMs) {
        if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
        setIsAutoStopWarning(true);
        let remaining = settings.autoStopWarningSeconds;
        setAutoStopCountdown(remaining);
        countdownIntervalRef.current = setInterval(() => {
          remaining -= 1;
          setAutoStopCountdown(remaining);
          if (remaining <= 0) {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            setIsAutoStopWarning(false);
            setAutoStopCountdown(0);
            onAutoStop?.();
          }
        }, 1000);
      }
    }, notifyMs);

    return () => clearAutoStopTimers();
  }, [isAutoPaused, settings.enableAutoStop, settings.autoNotifyAfterPausedMinutes, settings.autoStopAfterPausedMinutes, settings.autoStopWarningSeconds, clearAutoStopTimers, onAutoStopNotify, onAutoStop]);

  useEffect(() => {
    if (!settings.enableAutoPause || recordingState !== RecordingState.RECORDING || (isPaused && !isAutoPaused)) {
      if (analysisFrameRef.current) cancelAnimationFrame(analysisFrameRef.current);
      setAutoPauseState('inactive');
      silenceStartTimestampRef.current = null;
      return;
    }

    const hasMic = !!micAnalyserNode;
    const hasApp = !!appAnalyserNode;
    if (!hasMic && !hasApp) return;

    const micDataArray = hasMic ? new Uint8Array(micAnalyserNode!.frequencyBinCount) : null;
    const appDataArray = hasApp ? new Uint8Array(appAnalyserNode!.frequencyBinCount) : null;

    const analyze = () => {
      let maxPeak = 0;

      if (hasMic && micDataArray && !micTrack?.muted) {
        micAnalyserNode!.getByteTimeDomainData(micDataArray);
        for (let i = 0; i < micDataArray.length; i++) {
          const val = Math.abs((micDataArray[i] ?? 128) - 128);
          if (val > maxPeak) maxPeak = val;
        }
      }

      if (hasApp && appDataArray) {
        appAnalyserNode!.getByteTimeDomainData(appDataArray);
        for (let i = 0; i < appDataArray.length; i++) {
          const val = Math.abs((appDataArray[i] ?? 128) - 128);
          if (val > maxPeak) maxPeak = val;
        }
      }

      const db = maxPeak > 0 ? 20 * Math.log10(maxPeak / 128.0) : -100;

      if (db < settings.autoPauseSensitivityDb) {
        if (silenceStartTimestampRef.current === null) silenceStartTimestampRef.current = Date.now();
        const duration = Date.now() - silenceStartTimestampRef.current;
        const timeoutMs = settings.autoPauseTimeoutSeconds * 1000;

        if (duration >= timeoutMs) {
          if (!isAutoPaused) {
            setAutoPauseState('auto-paused');
            setIsAutoPaused(true);
            onPause();
          }
        } else if (duration >= SILENCE_GRACE_PERIOD_MS) {
          setAutoPauseState('warning');
          setAutoPauseCountdown(Math.ceil((timeoutMs - duration) / 1000));
        }
      } else {
        silenceStartTimestampRef.current = null;
        if (isAutoPaused) {
          setIsAutoPaused(false);
          onResume();
        } else if (autoPauseState !== 'listening') {
          setAutoPauseState('listening');
        }
      }
      analysisFrameRef.current = requestAnimationFrame(analyze);
    };

    analysisFrameRef.current = requestAnimationFrame(analyze);
    return () => { if (analysisFrameRef.current) cancelAnimationFrame(analysisFrameRef.current); };
  }, [settings, recordingState, isPaused, isAutoPaused, micAnalyserNode, appAnalyserNode, micTrack, onPause, onResume, autoPauseState]);

  return {
    isAutoPaused, setIsAutoPaused,
    autoPauseState, setAutoPauseState,
    autoPauseCountdown,
    autoStopCountdown,
    isAutoStopWarning,
    isAutoStopNotified,
  };
};
