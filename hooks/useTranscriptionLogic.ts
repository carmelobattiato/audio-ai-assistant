
import { useState, useCallback, useRef } from 'react';
import { transcriptionService } from '../services/transcriptionService';
import { getAudioBlobDuration } from '../utils/audioUtils';
import { AppSettings, LlmUsageStats } from '../types';
import { getPromptText } from '../utils/promptUtils';
import { escapeHtml } from '../utils/sanitize';

interface QueuedFile {
  file: File;
  duration: number | null;
  transcribed?: boolean;
}

/**
 * Hook della pipeline di trascrizione. Gestisce la coda di blob/file audio e la
 * invia a Gemini STT via `transcriptionService`: enqueue, reorder/remove, avvio
 * manuale e automatico, trascrizione del singolo chunk, progress ed errori.
 * Gli handler sono `useCallback`-stabili (leggono i valori mutabili da un
 * `latestRef`) per non rompere la memoizzazione dei figli — vedi ASSESSMENT A6/A7.
 */
export const useTranscriptionLogic = (
  appSettings: AppSettings,
  audioBlob: Blob | null,
  audioFileName: string,
  audioRecordingStartTime: Date | null,
  transcribedText: string,
  setTranscribedText: (val: string | ((prev: string) => string)) => void,
  addLlmUsageStat: (stat: Omit<LlmUsageStats, 'timestamp'>) => void,
  setAppUserMessage: (msg: string) => void
) => {
  const [transcriptionQueue, setTranscriptionQueue] = useState<QueuedFile[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [transcriptionProgress, setTranscriptionProgress] = useState({ current: 0, total: 0, filename: '' });
  const [playbackFile, setPlaybackFile] = useState<QueuedFile | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isAnyTranscribingRef = useRef(false);
  const autoQueueRef = useRef<Array<{ blob: Blob; name: string }>>([]);
  const autoQueueRunningRef = useRef(false);
  const appSettingsRef = useRef(appSettings);
  appSettingsRef.current = appSettings;

  // Latest mutable inputs/state read by the stable callbacks below — kept in a
  // ref so handlers can be wrapped in useCallback (stable identity → consumers
  // can React.memo) without going stale.
  const latestRef = useRef({ audioBlob, audioFileName, audioRecordingStartTime, transcribedText, transcriptionQueue: [] as QueuedFile[], isTranscribing: false });
  latestRef.current.audioBlob = audioBlob;
  latestRef.current.audioFileName = audioFileName;
  latestRef.current.audioRecordingStartTime = audioRecordingStartTime;
  latestRef.current.transcribedText = transcribedText;
  latestRef.current.transcriptionQueue = transcriptionQueue;
  latestRef.current.isTranscribing = isTranscribing;

  const stopTranscription = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsTranscribing(false);
      setAppUserMessage("Transcription cancelled by user.");
    }
  }, [setAppUserMessage]);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (files.length > 0) {
      const newQueueItemsPromises = files.map(async (file) => {
        let duration: number | null = null;
        try {
          duration = await getAudioBlobDuration(file);
        } catch (e) {
          console.error(`Could not get duration for ${file.name}`, e);
        }
        return { file, duration };
      });

      const newQueueItems = await Promise.all(newQueueItemsPromises);
      setTranscriptionQueue(newQueueItems);
      setAppUserMessage(`${files.length} audio file(s) queued.`);
      return newQueueItems;
    }
    return [];
  }, [setAppUserMessage]);

  const processFilesInternal = useCallback(async (filesToProcess: QueuedFile[]) => {
    const pending = filesToProcess.filter(f => !f.transcribed);
    if (pending.length === 0) {
      setAppUserMessage("All chunks are already transcribed.");
      return;
    }
    if (isAnyTranscribingRef.current) return;
    isAnyTranscribingRef.current = true;
    setIsTranscribing(true);
    setTranscriptionError(null);
    setPlaybackFile(null);
    abortControllerRef.current = new AbortController();
    let accumulatedHtml = latestRef.current.transcribedText || "";
    let hasError = false;

    try {
      for (let i = 0; i < pending.length; i++) {
        const item = pending[i]!;
        const { file } = item;
        setTranscriptionProgress({ current: i + 1, total: pending.length, filename: file.name });
        try {
          const cfg = appSettingsRef.current;
          const tSettings = { ...cfg.transcription, fileName: file.name };
          const txPromptTpl = getPromptText(cfg.systemPrompts ?? [], 'transcription-main') || undefined;
          const { transcription: result, usageMetadata } = await transcriptionService.transcribe(file, tSettings, cfg.llm, abortControllerRef.current?.signal, txPromptTpl, cfg.customInstructions);

          if (usageMetadata) {
            addLlmUsageStat({
              functionName: `Transcribe File (${file.name})`,
              inputTokens: usageMetadata.inputTokens,
              outputTokens: usageMetadata.outputTokens,
              model: cfg.llm.model,
              provider: cfg.llm.provider,
            });
          }

          const headerHtml = `<br><hr class='my-4 border-gray-600'><br><h3>Transcription for: ${escapeHtml(file.name)}</h3><br>`;
          const isError = result.startsWith("Error:");
          const contentHtml = isError ? `<p class="text-red-400">${result}</p>` : result.replace(/\n/g, '<br />');
          if (isError) hasError = true;
          accumulatedHtml += headerHtml + contentHtml;
          setTranscribedText(accumulatedHtml);

          if (!isError) {
            setTranscriptionQueue(prev => prev.map(q => q.file.name === file.name ? { ...q, transcribed: true } : q));
          }
        } catch (e) {
          hasError = true;
          accumulatedHtml += `<br><hr class='my-4 border-gray-600'><br><h3>FAILED Transcription for: ${escapeHtml(file.name)}</h3><br>`;
          setTranscribedText(accumulatedHtml);
        }
      }
      if (hasError) setTranscriptionError("One or more files failed to transcribe.");
    } finally {
      setTranscriptionProgress({ current: 0, total: 0, filename: '' });
      setIsTranscribing(false);
      isAnyTranscribingRef.current = false;
      setAppUserMessage("Transcription complete.");
    }
  }, [addLlmUsageStat, setAppUserMessage, setTranscribedText]);

  const processSingleBlobInternal = useCallback(async (blob: Blob, fileName: string, mode: 'replace' | 'append') => {
    setIsTranscribing(true);
    setTranscriptionProgress({ current: 1, total: 1, filename: fileName });
    setTranscriptionError(null);
    abortControllerRef.current = new AbortController();
    
    if (mode === 'replace') setTranscribedText("");

    try {
      const cfg = appSettingsRef.current;
      const tSettings = { ...cfg.transcription, fileName: fileName };
      const txPromptTpl = getPromptText(cfg.systemPrompts ?? [], 'transcription-main') || undefined;
      const { transcription: result, usageMetadata } = await transcriptionService.transcribe(blob, tSettings, cfg.llm, abortControllerRef.current?.signal, txPromptTpl, cfg.customInstructions);

      if (usageMetadata) {
        addLlmUsageStat({
          functionName: 'Transcribe Recording',
          inputTokens: usageMetadata.inputTokens,
          outputTokens: usageMetadata.outputTokens,
          model: cfg.llm.model,
          provider: cfg.llm.provider,
        });
      }

      if (result.startsWith("Error:")) {
        setTranscriptionError(result);
      } else {
        let finalResult = result;
        const startTime = latestRef.current.audioRecordingStartTime;
        if (tSettings.includeDateTimeInText && startTime) {
          finalResult = `Transcription Date: ${startTime.toLocaleString()}\n\n---\n\n${result}`;
        }
        const resultAsHtml = finalResult.replace(/\n/g, '<br />');
        if (mode === 'append' && latestRef.current.transcribedText) {
          const separator = `<br><hr class='my-4 border-gray-600'><br><h3 class='text-sky-400'>Re-transcription (${new Date().toLocaleString()})</h3><br>`;
          setTranscribedText(prev => prev + separator + resultAsHtml);
        } else {
          setTranscribedText(resultAsHtml);
        }
      }
    } catch (err) {
      setTranscriptionError(`Failed: ${err}`);
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress({ current: 0, total: 0, filename: '' });
    }
  }, [addLlmUsageStat, setAppUserMessage, setTranscribedText]);

  const handleStartTranscription = useCallback(async (mode: 'replace' | 'append' = 'replace') => {
    const { transcriptionQueue: queue, audioBlob: blob, audioFileName: fileName } = latestRef.current;
    if (queue.length > 0) {
      await processFilesInternal(queue);
    } else if (blob) {
      await processSingleBlobInternal(blob, fileName, mode);
    }
  }, [processFilesInternal, processSingleBlobInternal]);

  const handleAutoStartTranscription = useCallback(async (files?: QueuedFile[], blob?: Blob, fileName?: string) => {
      if (files && files.length > 0) {
          await processFilesInternal(files);
      } else if (blob) {
          await processSingleBlobInternal(blob, fileName || "recording.webm", 'replace');
      }
  }, [processFilesInternal, processSingleBlobInternal]);

  const drainAutoQueue = useCallback(async () => {
    if (autoQueueRunningRef.current) return;
    // ponytail: pause + auto-resume on network restore; no retry loop needed
    if (!navigator.onLine) {
      const resume = () => { window.removeEventListener('online', resume); drainAutoQueue(); };
      window.addEventListener('online', resume);
      return;
    }
    autoQueueRunningRef.current = true;

    while (autoQueueRef.current.length > 0) {
      // Wait if a manual transcription is running
      while (isAnyTranscribingRef.current) {
        await new Promise(r => setTimeout(r, 500));
      }
      const item = autoQueueRef.current[0];
      if (!item) break;

      isAnyTranscribingRef.current = true;
      setIsTranscribing(true);
      setTranscriptionProgress({ current: 1, total: autoQueueRef.current.length, filename: item.name });
      setTranscriptionError(null);

      try {
        const cfg = appSettingsRef.current;
        const tSettings = { ...cfg.transcription, fileName: item.name };
        const txTpl = getPromptText(cfg.systemPrompts ?? [], 'transcription-main') || undefined;
        const { transcription: result, usageMetadata } = await transcriptionService.transcribe(
          item.blob, tSettings, cfg.llm, undefined, txTpl, cfg.customInstructions
        );
        if (usageMetadata) {
          addLlmUsageStat({
            functionName: `Transcribe Chunk (${item.name})`,
            inputTokens: usageMetadata.inputTokens,
            outputTokens: usageMetadata.outputTokens,
            model: cfg.llm.model,
            provider: cfg.llm.provider,
          });
        }
        if (!result.startsWith("Error:")) {
          const headerHtml = `<br><hr class='my-4 border-gray-600'><br><h3>Transcription for: ${item.name}</h3><br>`;
          setTranscribedText(prev => (typeof prev === 'string' ? prev : '') + headerHtml + result.replace(/\n/g, '<br />'));
          setTranscriptionQueue(prev => prev.map(q => q.file.name === item.name ? { ...q, transcribed: true } : q));
          setAppUserMessage(`Chunk "${item.name}" transcribed.`);
        } else {
          setTranscriptionError(result);
        }
      } catch (err) {
        setTranscriptionError(`Failed: ${err}`);
      } finally {
        autoQueueRef.current.shift();
        isAnyTranscribingRef.current = false;
        setIsTranscribing(false);
        setTranscriptionProgress({ current: 0, total: 0, filename: '' });
      }
    }

    autoQueueRunningRef.current = false;
  }, [addLlmUsageStat, setAppUserMessage]);

  const handleTranscribeChunkDirect = useCallback((blob: Blob, name: string) => {
    if (autoQueueRef.current.some(i => i.name === name)) return;
    autoQueueRef.current.push({ blob, name });
    drainAutoQueue();
  }, [drainAutoQueue]);

  const handleTranscribeSingleChunk = useCallback(async (index: number) => {
    const item = latestRef.current.transcriptionQueue[index];
    if (!item || latestRef.current.isTranscribing) return;
    setIsTranscribing(true);
    setTranscriptionProgress({ current: 1, total: 1, filename: item.file.name });
    setTranscriptionError(null);
    abortControllerRef.current = new AbortController();
    try {
      const cfg = appSettingsRef.current;
      const tSettings = { ...cfg.transcription, fileName: item.file.name };
      const txTpl = getPromptText(cfg.systemPrompts ?? [], 'transcription-main') || undefined;
      const { transcription: result, usageMetadata } = await transcriptionService.transcribe(
        item.file, tSettings, cfg.llm, abortControllerRef.current?.signal, txTpl, cfg.customInstructions
      );
      if (usageMetadata) {
        addLlmUsageStat({
          functionName: `Transcribe Chunk (${item.file.name})`,
          inputTokens: usageMetadata.inputTokens,
          outputTokens: usageMetadata.outputTokens,
          model: cfg.llm.model,
          provider: cfg.llm.provider,
        });
      }
      if (!result.startsWith("Error:")) {
        const headerHtml = `<br><hr class='my-4 border-gray-600'><br><h3>Transcription for: ${item.file.name}</h3><br>`;
        const contentHtml = result.replace(/\n/g, '<br />');
        setTranscribedText(prev => (typeof prev === 'string' ? prev : '') + headerHtml + contentHtml);
        setTranscriptionQueue(prev => prev.map((q, i) => i === index ? { ...q, transcribed: true } : q));
        setAppUserMessage(`Chunk "${item.file.name}" transcribed.`);
      } else {
        setTranscriptionError(result);
      }
    } catch (err) {
      setTranscriptionError(`Failed: ${err}`);
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress({ current: 0, total: 0, filename: '' });
    }
  }, [addLlmUsageStat, setAppUserMessage, setTranscribedText]);

  const renameQueueChunks = useCallback((titlePrefix: string): QueuedFile[] => {
    let renamed: QueuedFile[] = [];
    setTranscriptionQueue(prev => {
      renamed = prev.map((item, i) => {
        const ext = item.file.name.split('.').pop() || 'webm';
        const newName = `${titlePrefix}_segment_${(i + 1).toString().padStart(3, '0')}.${ext}`;
        return { ...item, file: new File([item.file], newName, { type: item.file.type }) };
      });
      return renamed;
    });
    return renamed;
  }, []);

  const addChunkToQueue = useCallback(async (blob: Blob, name: string) => {
    let duration: number | null = null;
    try { duration = await getAudioBlobDuration(blob); } catch { /* ignore */ }
    const file = new File([blob], name, { type: blob.type });
    setTranscriptionQueue(prev => {
      if (prev.some(q => q.file.name === name)) return prev;
      return [...prev, { file, duration }];
    });
  }, []);

  const handleReorderQueue = useCallback((sourceIndex: number, destinationIndex: number) => {
    setTranscriptionQueue(prev => {
      const newQueue = [...prev];
      if (destinationIndex < 0 || destinationIndex >= newQueue.length) return newQueue;
      const [removed] = newQueue.splice(sourceIndex, 1);
      if (removed) newQueue.splice(destinationIndex, 0, removed);
      return newQueue;
    });
  }, []);

  const handleRemoveFromQueue = useCallback((indexToRemove: number) => {
    setTranscriptionQueue(prev => prev.filter((_, index) => index !== indexToRemove));
  }, []);

  return {
    transcriptionQueue,
    setTranscriptionQueue,
    isTranscribing,
    transcriptionError,
    transcriptionProgress,
    handleFilesSelected,
    handleStartTranscription,
    handleAutoStartTranscription,
    handleReorderQueue,
    handleRemoveFromQueue,
    handleTranscribeSingleChunk,
    handleTranscribeChunkDirect,
    addChunkToQueue,
    renameQueueChunks,
    stopTranscription,
    playbackFile,
    setPlaybackFile
  };
};
