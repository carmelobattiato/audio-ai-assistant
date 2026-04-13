
import { useState, useCallback, useRef, useEffect } from 'react';
import { transcriptionService } from '../services/transcriptionService';
import { getAudioBlobDuration } from '../utils/audioUtils';
import { AppSettings, RecordingState, LlmUsageStats } from '../types';

interface QueuedFile {
  file: File;
  duration: number | null;
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
    setIsTranscribing(true);
    setTranscriptionError(null);
    setPlaybackFile(null);
    abortControllerRef.current = new AbortController();
    let accumulatedHtml = "";
    let hasError = false;
    
    try {
      for (let i = 0; i < filesToProcess.length; i++) {
        const { file } = filesToProcess[i];
        setTranscriptionProgress({ current: i + 1, total: filesToProcess.length, filename: file.name });
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
    stopTranscription,
    playbackFile,
    setPlaybackFile
  };
};
