import { useEffect } from 'react';
import type React from 'react';
import { db } from '../utils/db';
import { loggingService } from '../services/loggingService';
import { PipelineStep } from '../types';
import type { SupportedLanguage, SavedSessionData, SavedSession } from '../types';

type DbUpdates = Partial<SavedSessionData> | { status?: SavedSession['status']; name?: string };
import {
  generateStandardMetadataHeader, generateAnalysisHtmlDocument, saveBlobToFile,
} from '../utils/fileUtils';
import type { ZipEntry } from '../utils/fileUtils';
import { htmlToPlainText } from '../utils/textUtils';
import { useSession } from '../contexts/SessionContext';
import { useUIState } from '../contexts/UIStateContext';
import { useSettings } from '../contexts/SettingsContext';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TranscriptionStatus {
  isTranscribing: boolean;
  transcriptionError: string | null;
}

interface PipelineData {
  audioRecordingStartTime: Date | null;
  audioFileName: string;
  language: SupportedLanguage;
  llmProcessingType: string;
  finalEffectiveTitle: string;
  transcribedText: string;
  llmProcessedText: string;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Hosts all side-effect logic for the audio-pipeline FSM.
 * Reads state from context (SessionContext, UIStateContext, SettingsContext) —
 * callers only need to pass in refs, transLogic status, and the DB helpers.
 */
export function usePipelineEffects(
  transLogic: TranscriptionStatus,
  wasTranscribingRef: React.MutableRefObject<boolean>,
  activeSessionIdRef: React.MutableRefObject<string | null>,
  isInitialLoadingRef: React.MutableRefObject<boolean>,
  pipelineDataRef: React.MutableRefObject<PipelineData>,
  scheduleDbUpdate: (data: DbUpdates) => void,
  flushDbUpdate: () => void,
  finalEffectiveTitle: string,
): void {
  const {
    pipelineStep, setPipelineStep,
    transcribedText, llmProcessedText, setLlmProcessedText, setLlmAutoTrigger,
    activeSourceText: _activeSourceText, setActiveSourceText,
    uploadedTextFileContent,
    audioRecordingStartTime, audioFileName, llmProcessingType,
    bubbleNotes, llmUsageHistory, llmResultsHistory,
    meetingChatHistory,
    fetchSessions,
  } = useSession();
  const { setAppUserMessage, setActiveRightTab } = useUIState();
  const { appSettings, isReady } = useSettings();

  // ── Sync pipelineDataRef every render (stale-closure guard for DOWNLOADING) ─
  // No deps array intentional — must run after every render.
  useEffect(() => {
    pipelineDataRef.current = {
      audioRecordingStartTime,
      audioFileName,
      language: appSettings.transcription.language,
      llmProcessingType,
      finalEffectiveTitle,
      transcribedText,
      llmProcessedText,
    };
  });

  // ── Batched DB writes ──────────────────────────────────────────────────────

  useEffect(() => { scheduleDbUpdate({ name: finalEffectiveTitle }); }, [finalEffectiveTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scheduleDbUpdate({ bubbleNotes, llmUsageHistory });
  }, [bubbleNotes, llmUsageHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scheduleDbUpdate({ transcribedText, llmProcessedText, llmProcessingType, llmResultsHistory });
  }, [transcribedText, llmProcessedText, llmProcessingType, llmResultsHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scheduleDbUpdate({ meetingChatHistory }); }, [meetingChatHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pipeline FSM ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (pipelineStep === PipelineStep.COMPLETED) {
      flushDbUpdate();
      if (activeSessionIdRef.current && !isInitialLoadingRef.current) {
        db.updateSessionIncremental(activeSessionIdRef.current, { status: 'Success' })
          .catch(err => loggingService.error('DB_UPDATE', 'Failed to set session status Success', { err: String(err) }));
      }
    }
  }, [pipelineStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pipelineStep !== PipelineStep.TRANSCRIBING) wasTranscribingRef.current = false;
  }, [pipelineStep]);

  useEffect(() => {
    if (transLogic.isTranscribing) {
      wasTranscribingRef.current = true;
      loggingService.debug('PIPELINE', `isTranscribing→true (step=${pipelineStep})`);
    } else {
      loggingService.debug('PIPELINE', `isTranscribing→false (step=${pipelineStep}, wasTranscribing=${wasTranscribingRef.current})`);
    }
  }, [transLogic.isTranscribing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loggingService.info('PIPELINE', `Step changed → ${pipelineStep}`, {
      autoPipeline: appSettings.transcription.enableAutoPipeline,
      chunked: appSettings.transcription.enableChunkedRecording,
      autoTranscribeChunks: appSettings.transcription.autoTranscribeChunks,
    });
  }, [pipelineStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pipelineStep === PipelineStep.TRANSCRIBING && !transLogic.isTranscribing && wasTranscribingRef.current) {
      const timer = setTimeout(() => {
        wasTranscribingRef.current = false;
        loggingService.debug('PIPELINE', `Transcription done check: error=${transLogic.transcriptionError}, textLen=${transcribedText?.length ?? 0}`);
        if (transLogic.transcriptionError) {
          loggingService.error('PIPELINE_ERROR', `Transcription failed: ${transLogic.transcriptionError}`);
          setPipelineStep(PipelineStep.ERROR);
          if (activeSessionIdRef.current) db.updateSessionIncremental(activeSessionIdRef.current, { status: 'Failed' })
            .catch(err => loggingService.error('DB_UPDATE', 'Failed to set session status Failed (transcription)', { err: String(err) }));
          setAppUserMessage(`Pipeline failed: ${transLogic.transcriptionError}`);
        } else if (transcribedText && transcribedText.trim().length > 0) {
          loggingService.info('PIPELINE', 'Transcription OK → starting ANALYZING');
          setLlmProcessedText('');
          setPipelineStep(PipelineStep.ANALYZING);
          setLlmAutoTrigger(prev => prev + 1);
          setActiveRightTab('analysis');
        } else {
          loggingService.warn('PIPELINE', 'Transcription done but no text found → IDLE');
          setPipelineStep(PipelineStep.IDLE);
          setAppUserMessage('Transcription completed but no text was found.');
        }
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [transLogic.isTranscribing, transLogic.transcriptionError, transcribedText, pipelineStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pipelineStep === PipelineStep.ANALYZING && llmProcessedText && llmProcessedText.trim().length > 0) {
      loggingService.debug('PIPELINE', `LLM output received (len=${llmProcessedText.length}), checking for errors`);
      if (llmProcessedText.toLowerCase().includes('error from') || llmProcessedText.toLowerCase().includes('failed')) {
        loggingService.error('PIPELINE_ERROR', 'LLM analysis returned error string');
        setPipelineStep(PipelineStep.ERROR);
        if (activeSessionIdRef.current) db.updateSessionIncremental(activeSessionIdRef.current, { status: 'Failed' })
          .catch(err => loggingService.error('DB_UPDATE', 'Failed to set session status Failed (analysis)', { err: String(err) }));
        setAppUserMessage('Pipeline failed at AI Analysis step.');
      } else {
        loggingService.info('PIPELINE', 'LLM analysis OK → DOWNLOADING');
        setPipelineStep(PipelineStep.DOWNLOADING);
        setAppUserMessage('AI Analysis completed. Preparing session download...');
      }
    }
  }, [llmProcessedText, pipelineStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pipelineStep !== PipelineStep.DOWNLOADING) return;
    const { audioRecordingStartTime: recStart, audioFileName: recFile, language,
            llmProcessingType: procType, finalEffectiveTitle: title,
            transcribedText: transcript, llmProcessedText: analysis } = pipelineDataRef.current;

    loggingService.info('PIPELINE', 'Creating session ZIP via Web Worker');

    const meta = generateStandardMetadataHeader(recStart, recFile, { transcriptionLanguage: language, llmProcessingType: procType });
    const analysisHtml = generateAnalysisHtmlDocument(analysis, {
      title, sourceTimestamp: recStart, sourceFileName: recFile, llmProcessingType: procType, transcriptionLanguage: language,
    });
    const entries: ZipEntry[] = [
      { name: `${title}_transcription.txt`, content: meta + htmlToPlainText(transcript) },
      { name: `${title}_ai_analysis.txt`,   content: meta + htmlToPlainText(analysis) },
      { name: `${title}_ai_analysis.html`,  content: analysisHtml },
    ];

    const worker = new Worker(new URL('../workers/zipWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ blob?: Blob; fileName?: string; error?: string }>) => {
      worker.terminate();
      if (e.data.blob) {
        saveBlobToFile(e.data.blob, `${title}_session.zip`);
      } else {
        loggingService.error('PIPELINE', 'ZIP worker failed', { err: e.data.error });
      }
      setPipelineStep(PipelineStep.COMPLETED);
      setAppUserMessage('Processing Pipeline Completed.');
    };
    worker.onerror = (err) => {
      worker.terminate();
      loggingService.error('PIPELINE', 'ZIP worker error', { err: err.message });
      setPipelineStep(PipelineStep.COMPLETED);
    };
    worker.postMessage({ entries, fileName: `${title}_session.zip` });

    return () => worker.terminate();
  }, [pipelineStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Init (once settings ready) ─────────────────────────────────────────────
  useEffect(() => {
    if (!isReady) return;
    (async () => {
      const crashed = await db.markCrashedSessions();
      if (crashed > 0) {
        setAppUserMessage(`${crashed} interrupted session(s) detected and recovered.`);
      }
      fetchSessions();
    })();
  }, [isReady]); // eslint-disable-line react-hooks/exhaustive-deps — one-time on ready

  // ── Active source text sync ────────────────────────────────────────────────
  useEffect(() => {
    if (uploadedTextFileContent?.textContent) {
      setActiveSourceText(uploadedTextFileContent.textContent.replace(/\n/g, '<br />'));
    } else {
      setActiveSourceText(transcribedText);
    }
  }, [uploadedTextFileContent, transcribedText]); // eslint-disable-line react-hooks/exhaustive-deps
}
