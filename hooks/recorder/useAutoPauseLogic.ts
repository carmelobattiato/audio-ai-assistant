
import { useState, useRef, useEffect, useCallback } from 'react';
import { RecordingState, AudioSettings, AutoPauseState } from '../../types';

export type { AutoPauseState };

export const useAutoPauseLogic = (
  settings: AudioSettings,
  recordingState: RecordingState,
  isPaused: boolean,
  micAnalyserNode: AnalyserNode | null,
  appAnalyserNode: AnalyserNode | null, // Aggiunto supporto per audio di sistema
  micTrack: MediaStreamTrack | null,
  onPause: () => void,
  onResume: () => void
) => {
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const [autoPauseState, setAutoPauseState] = useState<AutoPauseState>('inactive');
  const [autoPauseCountdown, setAutoPauseCountdown] = useState<number>(0);
  
  const silenceStartTimestampRef = useRef<number | null>(null);
  const analysisFrameRef = useRef<number | null>(null);
  const SILENCE_GRACE_PERIOD_MS = 2000;

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

      // Analisi Microfono
      if (hasMic && micDataArray && !micTrack?.muted) {
        micAnalyserNode!.getByteTimeDomainData(micDataArray);
        for (let i = 0; i < micDataArray.length; i++) {
          const val = Math.abs((micDataArray[i] ?? 128) - 128);
          if (val > maxPeak) maxPeak = val;
        }
      }

      // Analisi Audio di Sistema (se attivo)
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
          // Riprendi se viene rilevato suono su uno qualunque dei canali non mutati
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

  return { isAutoPaused, setIsAutoPaused, autoPauseState, setAutoPauseState, autoPauseCountdown };
};
