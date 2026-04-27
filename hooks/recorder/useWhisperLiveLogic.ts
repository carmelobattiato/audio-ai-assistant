
import React, { useRef, useState, useCallback } from 'react';
import { whisperService } from '../../services/whisperService';
import { toWhisperLanguage } from '../../utils/whisperLanguages';
import { loggingService } from '../../services/loggingService';

const CHUNK_INTERVAL_MS = 12000;
const INITIAL_PROMPT_MAX_CHARS = 150;

interface WhisperLiveOptions {
  whisperModel?: string;
  language?: string;
}

export const useWhisperLiveLogic = (
  onTranscriptionUpdate: (text: string) => void,
  options?: WhisperLiveOptions,
) => {
  const [realtimeTranscription, setRealtimeTranscription] = useState('');
  const realtimeTranscriptAccumulatorRef = useRef('');
  const activeRef = useRef(false);
  const chunkTimerRef = useRef<number | null>(null);
  const mimeTypeRef = useRef('');
  const micStreamRef = useRef<MediaStream | null>(null);
  const isPausedRefLocal = useRef<React.RefObject<boolean> | null>(null);
  const languageRef = useRef('italian');
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const stopChunkTimer = useCallback(() => {
    if (chunkTimerRef.current !== null) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
  }, []);

  // Records one self-contained 5-second WebM chunk, transcribes it, then schedules the next
  const recordOneChunk = useCallback(() => {
    if (!activeRef.current || !micStreamRef.current) return;

    const stream = micStreamRef.current;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
    } catch (err) {
      loggingService.warn('WHISPER_LIVE', `Cannot create recorder: ${err}`);
      return;
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    recorder.onstop = async () => {
      if (!activeRef.current) return;

      // Start next chunk IMMEDIATELY — no wait for transcription to avoid audio gaps
      if (!isPausedRefLocal.current?.current) {
        recordOneChunk();
      } else {
        // Paused: defer next chunk until resumed check
        chunkTimerRef.current = window.setTimeout(recordOneChunk, CHUNK_INTERVAL_MS);
      }

      if (isPausedRefLocal.current?.current) return;

      const blob = new Blob(chunks, { type: mimeTypeRef.current });
      if (blob.size < 1000) return;

      try {
        const acc = realtimeTranscriptAccumulatorRef.current;
        const initialPrompt = acc.length > 0
          ? acc.slice(-INITIAL_PROMPT_MAX_CHARS).replace(/\n/g, ' ').trim()
          : undefined;

        loggingService.debug('WHISPER_LIVE', 'Transcribing chunk', { size: blob.size, language: languageRef.current, promptLen: initialPrompt?.length ?? 0 });
        const text = await whisperService.transcribe(blob, languageRef.current, undefined, initialPrompt);
        if (text && !text.startsWith('Error:') && !text.startsWith('Whisper error:') && text.trim()) {
          realtimeTranscriptAccumulatorRef.current += text.trim() + '\n';
          setRealtimeTranscription(realtimeTranscriptAccumulatorRef.current);
          onTranscriptionUpdate(realtimeTranscriptAccumulatorRef.current);
          loggingService.debug('WHISPER_LIVE', 'Appended', { text: text.slice(0, 80) });
        }
      } catch (err) {
        loggingService.warn('WHISPER_LIVE_CHUNK', `Error: ${err}`);
      }
    };

    recorder.start();
    // Stop after CHUNK_INTERVAL_MS to get a complete self-contained file
    chunkTimerRef.current = window.setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, CHUNK_INTERVAL_MS);
  }, [onTranscriptionUpdate]);

  const cleanupLiveSession = useCallback(() => {
    activeRef.current = false;
    stopChunkTimer();
    micStreamRef.current = null;
    isPausedRefLocal.current = null;
  }, [stopChunkTimer]);

  const connectLiveSession = useCallback(async (
    _context: AudioContext,
    micStream: MediaStream,
    isPausedRef: React.RefObject<boolean>,
  ) => {
    realtimeTranscriptAccumulatorRef.current = '';
    setRealtimeTranscription('');

    const rawModel = optionsRef.current?.whisperModel ?? 'Xenova/whisper-tiny';
    const whisperModel = rawModel.replace('openai/whisper-', 'Xenova/whisper-');
    languageRef.current = toWhisperLanguage(optionsRef.current?.language ?? 'Italian');

    if (!whisperService.isLoaded()) {
      const cached = await whisperService.checkModelCached(whisperModel);
      if (!cached) {
        loggingService.warn('WHISPER_LIVE', 'Model not cached');
        setRealtimeTranscription('⚠ Whisper model not downloaded. Go to Settings → Transcription to download it.');
        return;
      }
      loggingService.debug('WHISPER_LIVE', 'Auto-loading from cache', { whisperModel });
      await whisperService.loadModel(whisperModel, () => {});
    }

    const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    mimeTypeRef.current = PREFERRED.find(m => MediaRecorder.isTypeSupported(m)) ?? PREFERRED[0] ?? 'audio/webm';

    micStreamRef.current = micStream;
    isPausedRefLocal.current = isPausedRef;
    activeRef.current = true;

    loggingService.debug('WHISPER_LIVE', 'Starting chunked recording', { whisperModel, language: languageRef.current, chunkMs: CHUNK_INTERVAL_MS });
    recordOneChunk();
  }, [recordOneChunk]);

  return {
    realtimeTranscription,
    setRealtimeTranscription,
    realtimeTranscriptAccumulatorRef,
    cleanupLiveSession,
    connectLiveSession,
  };
};
