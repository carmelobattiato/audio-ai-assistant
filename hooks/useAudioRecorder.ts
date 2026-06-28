
import { useState, useRef, useCallback, useEffect } from 'react';
import { RecordingState, UseAudioRecorderOptions, UseAudioRecorderResult } from '../types';
import { useRecorderTimer } from './recorder/useRecorderTimer';
import { useMediaStreams } from './recorder/useMediaStreams';
import { useAutoPauseLogic, AutoPauseState } from './recorder/useAutoPauseLogic';
import { useLiveTranscriptionLogic } from './recorder/useLiveTranscriptionLogic';

export type { AutoPauseState };

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

function selectSupportedMimeType(): string {
  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return PREFERRED_MIME_TYPES[0] ?? 'audio/webm';
}

/**
 * Hook orchestratore della registrazione audio.
 * Coordina i sotto-hook di `hooks/recorder/` (media streams, timer, auto-pause,
 * live transcription) e il `MediaRecorder`. Gestisce: registrazione mic + audio
 * di sistema, chunked recording (default 15 min), pause/resume, auto-stop, e
 * cleanup completo su stop e su unmount del component (stream, interval, live session).
 * @param options Settings, callback (`onChunkComplete`, `onRecordingStop`, …), flag chunk/realtime.
 * @returns Stato + comandi (`startRecording`, `stopRecording`, `pause/resume`, `forceNewChunk`, …) e i ref agli analyser per la visualizzazione.
 */
export const useAudioRecorder = (options: UseAudioRecorderOptions): UseAudioRecorderResult => {
  const {
    settings, llmSettings,
    enableChunkedRecording, chunkIntervalSeconds, enableRealtimeTranscription,
    liveModel,
  } = options;

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingSessionIdRef = useRef<string | null>(null);
  const isStoppingRef = useRef(false);
  const isPausedRef = useRef(isPaused);
  const selectedMimeTypeRef = useRef<string>('');
  const chunkIndexRef = useRef(1);
  const chunkIntervalTimerRef = useRef<number | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const chunkIntervalSecondsRef = useRef<number>(chunkIntervalSeconds ?? 60);
  const elapsedTimeRef = useRef(0);
  const [chunkStartElapsedTime, setChunkStartElapsedTime] = useState(0);
  const chunkStartElapsedTimeRef = useRef(0);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  const { elapsedTime, setElapsedTime, startTimer, stopTimer, resetTimer } = useRecorderTimer();
  useEffect(() => { elapsedTimeRef.current = elapsedTime; }, [elapsedTime]);
  const streams = useMediaStreams(settings);
  
  const handlePauseAction = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      stopTimer();
      setIsPaused(true);
    }
  }, [stopTimer]);

  const handleResumeAction = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      startTimer();
      setIsPaused(false);
    }
  }, [startTimer]);

  const handleAutoStop = useCallback(() => {
    stopRecordingRef.current?.();
  }, []);

  const handleAutoStopNotify = useCallback(() => {
    optionsRef.current.onAutoStopNotify?.();
  }, []);

  const autoPause = useAutoPauseLogic(
    settings, recordingState, isPaused,
    streams.micAnalyserNodeRef.current,
    streams.appAudioAnalyserNodeRef.current,
    streams.micAudioTrackRef.current,
    handlePauseAction, handleResumeAction,
    handleAutoStopNotify, handleAutoStop,
  );

  const geminiApiKey = llmSettings?.googleApiKey?.trim() || process.env.API_KEY;
  const liveTrans = useLiveTranscriptionLogic((_text) => {}, { liveModel, apiKey: geminiApiKey });

  const cleanupAll = useCallback(() => {
    stopTimer();
    if (chunkIntervalTimerRef.current) clearInterval(chunkIntervalTimerRef.current);
    streams.cleanupStreams();
    liveTrans.cleanupLiveSession();
  }, [stopTimer, streams, liveTrans]);

  // Unmount cleanup: stop streams/interval/live session if component unmounts mid-recording.
  // Via ref so identity changes of cleanupAll don't tear down an active recording.
  const cleanupAllRef = useRef(cleanupAll);
  cleanupAllRef.current = cleanupAll;
  useEffect(() => () => { cleanupAllRef.current(); }, []);

  const restartChunkTimer = useCallback((intervalSeconds: number) => {
    if (chunkIntervalTimerRef.current) clearInterval(chunkIntervalTimerRef.current);
    chunkIntervalTimerRef.current = window.setInterval(() => {
      if (mediaRecorderRef.current?.state === 'recording' && !isPausedRef.current) {
        mediaRecorderRef.current.stop();
      }
    }, intervalSeconds * 1000);
  }, []);

  const forceNewChunk = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording' && !isPausedRef.current) {
      restartChunkTimer(chunkIntervalSecondsRef.current);
      mediaRecorderRef.current.stop();
    }
  }, [restartChunkTimer]);

  const createNewRecorder = useCallback((stream: MediaStream) => {
    const recorder = new MediaRecorder(stream, { 
      mimeType: selectedMimeTypeRef.current, 
      audioBitsPerSecond: settings.bitrate 
    });
    
    recorder.ondataavailable = (e) => { 
        if (e.data.size > 0) recordedChunksRef.current.push(e.data); 
    };
    
    recorder.onstop = () => {
      const finalBlob = new Blob(recordedChunksRef.current, { type: selectedMimeTypeRef.current });
      recordedChunksRef.current = [];
      
      const currentOptions = optionsRef.current;

      if (finalBlob.size > 0) {
        setAudioBlob(finalBlob);
        if (currentOptions.enableChunkedRecording && currentOptions.onChunkComplete) {
          currentOptions.onChunkComplete(finalBlob, chunkIndexRef.current);
          chunkIndexRef.current++;
        }
      }

      if (isStoppingRef.current) {
        cleanupAll();
        setRecordingState(RecordingState.STOPPED);
        setIsPaused(false);
        if (recordingSessionIdRef.current && currentOptions.onRecordingStop) {
          currentOptions.onRecordingStop(
            recordingSessionIdRef.current,
            !!currentOptions.enableChunkedRecording,
            liveTrans.realtimeTranscriptAccumulatorRef.current,
          );
        }
      } else if (currentOptions.enableChunkedRecording) {
        chunkStartElapsedTimeRef.current = elapsedTimeRef.current;
        setChunkStartElapsedTime(elapsedTimeRef.current);
        createNewRecorder(stream);
      }
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
  }, [settings.bitrate, cleanupAll, liveTrans]);

  useEffect(() => {
    chunkIntervalSecondsRef.current = chunkIntervalSeconds ?? 60;
    if (recordingState === RecordingState.RECORDING && enableChunkedRecording && chunkIntervalTimerRef.current !== null) {
      restartChunkTimer(chunkIntervalSecondsRef.current);
      if (mediaRecorderRef.current?.state === 'recording' && !isPausedRef.current) {
        chunkStartElapsedTimeRef.current = elapsedTimeRef.current;
        setChunkStartElapsedTime(elapsedTimeRef.current);
        mediaRecorderRef.current.stop();
      }
    }
  }, [chunkIntervalSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = useCallback(async (includeAppAudio: boolean) => {
    cleanupAll();
    setError(null);
    isStoppingRef.current = false;
    try {
      const { context, destination } = streams.setupAudioContext(enableRealtimeTranscription ? 16000 : undefined);
      const { micStream } = await streams.getMicStream(context, destination, includeAppAudio);
      
      if (enableRealtimeTranscription) await liveTrans.connectLiveSession(context, micStream, isPausedRef);
      
      if (includeAppAudio) {
        const appStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'monitor' },
          audio: true,
          systemAudio: 'include',
        } as DisplayMediaStreamOptions);
        streams.allStreamsRef.current.push(appStream);
        streams.setDisplayStream(appStream);
        if (appStream.getAudioTracks().length > 0) {
          const appSrc = context.createMediaStreamSource(new MediaStream(appStream.getAudioTracks()));
          streams.appAudioAnalyserNodeRef.current = context.createAnalyser();
          appSrc.connect(streams.appAudioAnalyserNodeRef.current);
          appSrc.connect(destination);
          streams.setIsAppAudioActive(true);
        }
        
        appStream.getTracks().forEach(track => {
            track.onended = () => {
                streams.setIsAppAudioActive(false);
                streams.updateMicEchoCancellation(false);
            };
        });
      }

      selectedMimeTypeRef.current = selectSupportedMimeType();
      recordingSessionIdRef.current = `${Date.now()}`;
      chunkIndexRef.current = 1;
      chunkStartElapsedTimeRef.current = 0;
      setChunkStartElapsedTime(0);
      createNewRecorder(destination.stream);

      if (enableChunkedRecording) {
        chunkIntervalSecondsRef.current = chunkIntervalSeconds ?? 60;
        restartChunkTimer(chunkIntervalSecondsRef.current);
      }

      setRecordingState(RecordingState.RECORDING);
      setElapsedTime(0);
      startTimer();
    } catch (err) {
      setError(`Start failed: ${err}`);
      cleanupAll();
    }
  }, [streams, liveTrans, settings, enableRealtimeTranscription, enableChunkedRecording, chunkIntervalSeconds, startTimer, createNewRecorder, cleanupAll, setElapsedTime, restartChunkTimer]);

  const stopRecording = useCallback(() => {
    isStoppingRef.current = true;
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === "recording" || mediaRecorderRef.current.state === "paused")) {
      mediaRecorderRef.current.stop();
    } else {
      cleanupAll();
      setRecordingState(RecordingState.STOPPED);
      setIsPaused(false);
    }
  }, [cleanupAll]);
  stopRecordingRef.current = stopRecording;

  const toggleMic = useCallback(() => {
    if (streams.micAudioTrackRef.current) {
      const state = !streams.micAudioTrackRef.current.enabled;
      streams.micAudioTrackRef.current.enabled = state;
      setIsMicEnabled(state);
    }
  }, [streams]);

  const addAppAudio = useCallback(async () => {
    if (streams.isAppAudioActive) return;
    try {
      const appStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' },
        audio: true,
        systemAudio: 'include',
      } as DisplayMediaStreamOptions);
      streams.allStreamsRef.current.push(appStream);
      streams.setDisplayStream(appStream);

      if (appStream.getAudioTracks().length > 0) {
        const context = streams.audioContextRef.current;
        const destination = streams.destinationNodeRef.current;
        if (context && destination) {
          const appSrc = context.createMediaStreamSource(new MediaStream(appStream.getAudioTracks()));
          streams.appAudioAnalyserNodeRef.current = context.createAnalyser();
          appSrc.connect(streams.appAudioAnalyserNodeRef.current);
          appSrc.connect(destination);
          streams.setIsAppAudioActive(true);
          streams.updateMicEchoCancellation(true);
          
          appStream.getTracks().forEach(track => {
            track.onended = () => {
                streams.setIsAppAudioActive(false);
                streams.updateMicEchoCancellation(false);
            };
          });
        }
      }
    } catch (err) {
      console.error("Failed to add app audio:", err);
    }
  }, [streams]);

  return {
    recordingState, startRecording, stopRecording,
    pauseRecording: handlePauseAction, resumeRecording: handleResumeAction,
    audioBlob, micAnalyserNodeRef: streams.micAnalyserNodeRef, 
    appAudioAnalyserNodeRef: streams.appAudioAnalyserNodeRef,
    resetRecording: () => { cleanupAll(); resetTimer(); setRecordingState(RecordingState.IDLE); },
    error, elapsedTime, isPaused, displayStream: streams.displayStream,
    getAudioSnapshot: async () => ({ mixedBlob: audioBlob, micBlob: null, appBlob: null, elapsedTime }),
    getRecordingSessionId: () => recordingSessionIdRef.current,
    isAutoPaused: autoPause.isAutoPaused, autoPauseState: autoPause.autoPauseState,
    autoPauseCountdown: autoPause.autoPauseCountdown,
    autoStopCountdown: autoPause.autoStopCountdown,
    isAutoStopWarning: autoPause.isAutoStopWarning,
    isAutoStopNotified: autoPause.isAutoStopNotified,
    realtimeTranscription: liveTrans.realtimeTranscription,
    addAppAudio,
    isAppAudioActive: streams.isAppAudioActive, isMicEnabled, toggleMic,
    forceNewChunk, chunkStartElapsedTime,
  };
};
