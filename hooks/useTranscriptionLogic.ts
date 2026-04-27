
import { useState, useCallback, useRef, useEffect } from 'react';
import { transcriptionService } from '../services/transcriptionService';
import { getAudioBlobDuration } from '../utils/audioUtils';
import { AppSettings, RecordingState, LlmUsageStats } from '../types';

interface QueuedFile {
  file: File;
  duration: number | null;
  transcribed?: boolean;
}

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

  const stopTranscription = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsTranscribing(false);
      setAppUserMessage("Transcription cancelled by user.");
    }
  }, [setAppUserMessage]);

  const handleFilesSelected = async (files: File[]) => {
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
  };

  const processFilesInternal = async (filesToProcess: QueuedFile[]) => {
    const pending = filesToProcess.filter(f => !f.transcribed);
    if (pending.length === 0) return;
    if (isAnyTranscribingRef.current) return;
    isAnyTranscribingRef.current = true;
    setIsTranscribing(true);
    setTranscriptionError(null);
    setPlaybackFile(null);
    abortControllerRef.current = new AbortController();
    let accumulatedHtml = "";
    let hasError = false;

    try {
      for (let i = 0; i < pending.length; i++) {
        const item = pending[i];
        const { file } = item;
        setTranscriptionProgress({ current: i + 1, total: pending.length, filename: file.name });
        try {
          const tSettings = { ...appSettings.transcription, fileName: file.name };
          const { transcription: result, usageMetadata } = await transcriptionService.transcribe(file, tSettings, appSettings.llm, abortControllerRef.current?.signal);
          
          if (usageMetadata) {
            addLlmUsageStat({
              functionName: `Transcribe File (${file.name})`,
              inputTokens: usageMetadata.inputTokens,
              outputTokens: usageMetadata.outputTokens,
              model: appSettings.llm.model,
              provider: appSettings.llm.provider,
            });
          }
          
          const headerHtml = `<br><hr class='my-4 border-gray-600'><br><h3>Transcription for: ${file.name}</h3><br>`;
          const contentHtml = result.startsWith("Error:") ? `<p class="text-red-400">${result}</p>` : result.replace(/\n/g, '<br />');
          if (result.startsWith("Error:")) hasError = true;
          accumulatedHtml += headerHtml + contentHtml;
          
          // Update UI progressively
          setTranscribedText(accumulatedHtml);
        } catch (e) {
          hasError = true;
          accumulatedHtml += `<br><hr class='my-4 border-gray-600'><br><h3>FAILED Transcription for: ${file.name}</h3><br>`;
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
  };

  const processSingleBlobInternal = async (blob: Blob, fileName: string, mode: 'replace' | 'append') => {
    setIsTranscribing(true);
    setTranscriptionProgress({ current: 1, total: 1, filename: fileName });
    setTranscriptionError(null);
    abortControllerRef.current = new AbortController();
    
    if (mode === 'replace') setTranscribedText("");
    
    try {
      const tSettings = { ...appSettings.transcription, fileName: fileName };
      const { transcription: result, usageMetadata } = await transcriptionService.transcribe(blob, tSettings, appSettings.llm, abortControllerRef.current?.signal);
      
      if (usageMetadata) {
        addLlmUsageStat({
          functionName: 'Transcribe Recording',
          inputTokens: usageMetadata.inputTokens,
          outputTokens: usageMetadata.outputTokens,
          model: appSettings.llm.model,
          provider: appSettings.llm.provider,
        });
      }
      
      if (result.startsWith("Error:")) {
        setTranscriptionError(result);
      } else {
        let finalResult = result;
        if (tSettings.includeDateTimeInText && audioRecordingStartTime) {
          finalResult = `Transcription Date: ${audioRecordingStartTime.toLocaleString()}\n\n---\n\n${result}`;
        }
        const resultAsHtml = finalResult.replace(/\n/g, '<br />');
        if (mode === 'append' && transcribedText) {
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
  };

  const handleStartTranscription = async (mode: 'replace' | 'append' = 'replace') => {
    if (transcriptionQueue.length > 0) {
      await processFilesInternal(transcriptionQueue);
    } else if (audioBlob) {
      await processSingleBlobInternal(audioBlob, audioFileName, mode);
    }
  };

  const handleAutoStartTranscription = async (files?: QueuedFile[], blob?: Blob, fileName?: string) => {
      if (files && files.length > 0) {
          await processFilesInternal(files);
      } else if (blob) {
          await processSingleBlobInternal(blob, fileName || "recording.webm", 'replace');
      }
  };

  const drainAutoQueue = useCallback(async () => {
    if (autoQueueRunningRef.current) return;
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
        const { transcription: result, usageMetadata } = await transcriptionService.transcribe(
          item.blob, tSettings, cfg.llm
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

  const handleTranscribeSingleChunk = async (index: number) => {
    const item = transcriptionQueue[index];
    if (!item || isTranscribing) return;
    setIsTranscribing(true);
    setTranscriptionProgress({ current: 1, total: 1, filename: item.file.name });
    setTranscriptionError(null);
    abortControllerRef.current = new AbortController();
    try {
      const tSettings = { ...appSettings.transcription, fileName: item.file.name };
      const { transcription: result, usageMetadata } = await transcriptionService.transcribe(
        item.file, tSettings, appSettings.llm, abortControllerRef.current?.signal
      );
      if (usageMetadata) {
        addLlmUsageStat({
          functionName: `Transcribe Chunk (${item.file.name})`,
          inputTokens: usageMetadata.inputTokens,
          outputTokens: usageMetadata.outputTokens,
          model: appSettings.llm.model,
          provider: appSettings.llm.provider,
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
  };

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

  const handleReorderQueue = (sourceIndex: number, destinationIndex: number) => {
    setTranscriptionQueue(prev => {
      const newQueue = [...prev];
      if (destinationIndex < 0 || destinationIndex >= newQueue.length) return newQueue;
      const [removed] = newQueue.splice(sourceIndex, 1);
      newQueue.splice(destinationIndex, 0, removed);
      return newQueue;
    });
  };

  const handleRemoveFromQueue = (indexToRemove: number) => {
    setTranscriptionQueue(prev => prev.filter((_, index) => index !== indexToRemove));
  };

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
