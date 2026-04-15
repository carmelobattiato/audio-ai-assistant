
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { db } from './utils/db';
import { AppHeader } from './components/AppHeader';
import { AppMainContent } from './components/AppMainContent';
import { AppModals } from './components/AppModals';
import { useTranscriptionLogic } from './hooks/useTranscriptionLogic';
import { useSessionLogic } from './hooks/useSessionLogic';
import { 
  AppSettings, 
  TextFileContent, 
  AppStatistics, 
  CoherenceAssessmentStatus, 
  SavedSession, 
  Theme, 
  BubbleNote, 
  RecordingState, 
  AudioRecorderRef, 
  EmotionEvent, 
  LlmUsageStats, 
  ProcessedResult,
  PipelineStep
} from './types';
import { DEFAULT_SETTINGS, APP_VERSION, APP_CREATOR } from './constants';
import { countCharacters, countWords, estimateTokens, markdownToHtmlSimple, htmlToPlainText, getCurrentTimestampSuffix } from './utils/textUtils';
import { createSessionZipBlob, generateStandardMetadataHeader, saveBlobToFile } from './utils/fileUtils';
import { llmService } from './services/geminiService';
import { loggingService } from './services/loggingService';

const APP_SETTINGS_LOCAL_STORAGE_KEY = 'audioAIAssistantSettings';

export const App: React.FC = () => {
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>("");
  const [audioDuration, setAudioDuration] = useState<number>(0); 
  const [audioRecordingStartTime, setAudioRecordingStartTime] = useState<Date | null>(null);
  const [uploadedTextFileContent, setUploadedTextFileContent] = useState<TextFileContent | null>(null);
  const [bubbleNotes, setBubbleNotes] = useState<BubbleNote[]>([]); 
  const [pendingNoteHtml, setPendingNoteHtml] = useState<string>('');
  const [transcribedText, setTranscribedText] = useState<string>(""); 
  const [activeSourceText, setActiveSourceText] = useState<string>(""); 
  const [llmProcessedText, setLlmProcessedText] = useState<string>(""); 
  const [llmProcessingType, setLlmProcessingType] = useState<string>(""); 
  const [llmUsageHistory, setLlmUsageHistory] = useState<LlmUsageStats[]>([]);
  const [llmResultsHistory, setLlmResultsHistory] = useState<ProcessedResult[]>([]);
  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [recordingTitle, setRecordingTitle] = useState<string>("");
  const [recordingTimestampSuffix, setRecordingTimestampSuffix] = useState<string>(getCurrentTimestampSuffix());
  const [emotionHistory, setEmotionHistory] = useState<EmotionEvent[]>([]);

  const [pipelineStep, setPipelineStep] = useState<PipelineStep>(PipelineStep.IDLE);
  const [llmAutoTrigger, setLlmAutoTrigger] = useState<number>(0);
  const wasTranscribingRef = useRef(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStatisticsModalOpen, setIsStatisticsModalOpen] = useState(false);
  const [showLoadSessionModal, setShowLoadSessionModal] = useState(false);
  const [showLoadChunksModal, setShowLoadChunksModal] = useState(false);
  const [viewingBubbleNoteId, setViewingBubbleNoteId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [appUserMessage, setAppUserMessage] = useState<string | null>(null);
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(false);
  const [autoSaveCountdown, setAutoSaveCountdown] = useState(10);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [recordingChunks, setRecordingChunks] = useState<Blob[]>([]);
  const [coherenceAssessment, setCoherenceAssessment] = useState<string | null>(null);
  const [coherenceStatus, setCoherenceStatus] = useState<CoherenceAssessmentStatus>(CoherenceAssessmentStatus.IDLE);
  const [isOutlookModalOpen, setIsOutlookModalOpen] = useState(false);

  const isInitialLoadingRef = useRef(false);
  const recordingChunksRef = useRef<Blob[]>([]);
  const audioRecorderRef = useRef<AudioRecorderRef>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const handleRecordingStateChange = useCallback((state: RecordingState) => {
    setRecordingState(state);
    loggingService.info('RECORDING_STATE_CHANGE', `Recording state changed to ${state}`, { state });
    if (state === RecordingState.RECORDING) {
        setPipelineStep(PipelineStep.RECORDING);
        const jobId = crypto.randomUUID();
        loggingService.setCorrelationId(jobId);
        loggingService.info('PIPELINE_START', 'Recording started, new job ID generated', { jobId });
    }
  }, []);

  const appStatistics = useMemo<AppStatistics>(() => {
    return {
      audioDetails: audioBlob ? {
        format: audioBlob.type,
        duration: audioDuration,
        size: audioBlob.size,
        channels: appSettings.audio.channels,
        bitrate: appSettings.audio.bitrate,
      } : null,
      transcriptionStats: activeSourceText ? {
        characterCount: countCharacters(activeSourceText),
        wordCount: countWords(activeSourceText),
        estimatedTokenCount: estimateTokens(activeSourceText),
        size: new Blob([activeSourceText]).size,
      } : null,
      llmResultStats: llmProcessedText ? {
        characterCount: countCharacters(llmProcessedText),
        wordCount: countWords(llmProcessedText),
        estimatedTokenCount: estimateTokens(llmProcessedText),
        size: new Blob([llmProcessedText]).size,
      } : null,
      llmUsageHistory: llmUsageHistory,
      recordingTimestamp: audioRecordingStartTime?.toLocaleString(),
    };
  }, [audioBlob, audioDuration, appSettings.audio.channels, appSettings.audio.bitrate, activeSourceText, llmProcessedText, llmUsageHistory, audioRecordingStartTime]);

  const addLlmUsageStat = useCallback((stat: Omit<LlmUsageStats, 'timestamp'>) => {
    setLlmUsageHistory(prev => [...prev, { ...stat, timestamp: Date.now() }]);
  }, []);

  const handleOutlookImport = useCallback((title: string, noteHtml: string) => {
    setRecordingTitle(title);
    const newNote: BubbleNote = {
      id: `n_outlook_${Date.now()}`,
      contentHtml: noteHtml,
      timestamp: Date.now(),
      recordingElapsedTime: 0,
      isEditing: false,
      isProcessing: false,
    };
    setBubbleNotes(prev => [newNote, ...prev]);
    setAppUserMessage(`📅 Riunione "${title}" importata da Outlook`);
    setTimeout(() => setAppUserMessage(null), 4000);
  }, []);

  const fetchSessions = useCallback(async () => {
    const sessions = await db.getAllSessions();
    setSavedSessions(sessions);
  }, []);

  const finalEffectiveTitle = useMemo(() => {
    const base = recordingTitle.trim() || "Session";
    return `${base}_${recordingTimestampSuffix}`;
  }, [recordingTitle, recordingTimestampSuffix]);

  const resetAllDataStates = useCallback(async (opts?: any) => {
    setAudioBlob(null); setAudioFileName(""); setAudioDuration(0); setAudioRecordingStartTime(null);
    setUploadedTextFileContent(null); setTranscribedText(""); setActiveSourceText("");
    if (!opts?.preserveBubbleNotes) {
        setBubbleNotes([]);
        setRecordingTitle("");
        setRecordingTimestampSuffix(getCurrentTimestampSuffix());
    }
    setLlmProcessedText(""); setLlmProcessingType(""); setLlmUsageHistory([]); setLlmResultsHistory([]);
    setEmotionHistory([]); setAppUserMessage(null);
    setCoherenceAssessment(null); setCoherenceStatus(CoherenceAssessmentStatus.IDLE);
    setPipelineStep(PipelineStep.IDLE);
    setRecordingChunks([]);
    recordingChunksRef.current = [];
    activeSessionIdRef.current = null;
  }, []);

  // Sync title changes to DB
  useEffect(() => {
    if (activeSessionIdRef.current && !isInitialLoadingRef.current) {
        db.updateSessionIncremental(activeSessionIdRef.current, { name: finalEffectiveTitle });
    }
  }, [finalEffectiveTitle]);

  // Sync bubble notes and emotions during recording
  useEffect(() => {
    if (activeSessionIdRef.current && recordingState === RecordingState.RECORDING && !isInitialLoadingRef.current) {
        db.updateSessionIncremental(activeSessionIdRef.current, { 
            bubbleNotes,
            emotionHistory,
            llmUsageHistory
        });
    }
  }, [bubbleNotes, emotionHistory, llmUsageHistory, recordingState]);

  // Sync transcription and LLM results to DB
  useEffect(() => {
    if (activeSessionIdRef.current && !isInitialLoadingRef.current) {
        db.updateSessionIncremental(activeSessionIdRef.current, { 
            transcribedText,
            llmProcessedText,
            llmProcessingType,
            llmResultsHistory
        });
        
        if (pipelineStep === PipelineStep.COMPLETED) {
            db.updateSessionIncremental(activeSessionIdRef.current, { status: 'Success' });
        }
    }
  }, [transcribedText, llmProcessedText, llmProcessingType, llmResultsHistory, pipelineStep]);

  const transLogic = useTranscriptionLogic(
    appSettings, audioBlob, audioFileName, audioRecordingStartTime, 
    transcribedText, setTranscribedText, addLlmUsageStat, setAppUserMessage
  );

  const sessLogic = useSessionLogic(
    audioBlob, audioFileName, finalEffectiveTitle, activeSourceText, bubbleNotes, 
    llmResultsHistory, llmProcessedText, llmProcessingType, llmUsageHistory,
    setIsBusy, setAppUserMessage, fetchSessions
  );

  useEffect(() => {
    if (pipelineStep !== PipelineStep.TRANSCRIBING) {
      wasTranscribingRef.current = false;
    }
  }, [pipelineStep]);

  useEffect(() => {
    if (transLogic.isTranscribing) {
      wasTranscribingRef.current = true;
    }
  }, [transLogic.isTranscribing]);

  useEffect(() => {
    if (pipelineStep === PipelineStep.TRANSCRIBING && !transLogic.isTranscribing && wasTranscribingRef.current) {
      // Small timeout to ensure state updates have propagated
      const timer = setTimeout(() => {
        wasTranscribingRef.current = false;
        // If we have an explicit error from the transcription logic
        if (transLogic.transcriptionError) {
            loggingService.error('PIPELINE_ERROR', `Transcription failed: ${transLogic.transcriptionError}`, { step: 'TRANSCRIBING' });
            setPipelineStep(PipelineStep.ERROR);
            if (activeSessionIdRef.current) db.updateSessionIncremental(activeSessionIdRef.current, { status: 'Failed' });
            setAppUserMessage(`Pipeline failed: ${transLogic.transcriptionError}`);
        } else if (transcribedText && transcribedText.trim().length > 0) {
            loggingService.info('PIPELINE_STEP_COMPLETE', 'Transcription completed successfully', { step: 'TRANSCRIBING', textLength: transcribedText.length });
            // Proceed to analysis if we have text
            setLlmProcessedText("");
            setPipelineStep(PipelineStep.ANALYZING);
            setLlmAutoTrigger(prev => prev + 1);
        } else {
            loggingService.warn('PIPELINE_STEP_EMPTY', 'Transcription completed but no text was found.', { step: 'TRANSCRIBING' });
            // No text found after transcription
            setPipelineStep(PipelineStep.IDLE);
            setAppUserMessage("Transcription completed but no text was found.");
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [transLogic.isTranscribing, transLogic.transcriptionError, transcribedText, pipelineStep, setAppUserMessage]);

  useEffect(() => {
    if (pipelineStep === PipelineStep.ANALYZING && llmProcessedText && llmProcessedText.trim().length > 0) {
      if (llmProcessedText.toLowerCase().includes("error from") || llmProcessedText.toLowerCase().includes("failed")) {
          setPipelineStep(PipelineStep.ERROR);
          if (activeSessionIdRef.current) db.updateSessionIncremental(activeSessionIdRef.current, { status: 'Failed' });
          setAppUserMessage("Pipeline failed at AI Analysis step.");
      } else {
          setPipelineStep(PipelineStep.DOWNLOADING);
          setAppUserMessage("AI Analysis completed. Preparing session download...");
      }
    }
  }, [llmProcessedText, pipelineStep, setAppUserMessage]);

  useEffect(() => {
    if (pipelineStep !== PipelineStep.DOWNLOADING) return;
    try {
      const sessionName = finalEffectiveTitle;
      const meta = generateStandardMetadataHeader(audioRecordingStartTime, audioFileName, {
        transcriptionLanguage: appSettings.transcription.language,
        llmProcessingType: llmProcessingType,
      });
      const zipBlob = createSessionZipBlob([
        { name: `${sessionName}_transcription.txt`, content: meta + htmlToPlainText(transcribedText) },
        { name: `${sessionName}_ai_analysis.txt`,   content: meta + htmlToPlainText(llmProcessedText) },
      ]);
      saveBlobToFile(zipBlob, `${sessionName}_session.zip`);
    } catch (e) {
      console.error('Session ZIP creation failed:', e);
    } finally {
      setPipelineStep(PipelineStep.COMPLETED);
      setAppUserMessage("Processing Pipeline Completed.");
    }
  }, [pipelineStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pipelineStep === PipelineStep.COMPLETED && appSettings.transcription.enableAutoPipeline) {
        setAppUserMessage("Processing complete.");
    }
  }, [pipelineStep, appSettings.transcription.enableAutoPipeline, setAppUserMessage]);

  useEffect(() => {
    const init = async () => {
        loggingService.info('APP_INIT', 'Application initializing', { version: APP_VERSION });
        const stored = localStorage.getItem(APP_SETTINGS_LOCAL_STORAGE_KEY);
        if (stored) setAppSettings(JSON.parse(stored));
        const crashed = await db.markCrashedSessions();
        if (crashed > 0) {
          loggingService.warn('SESSION_RECOVERY', `${crashed} interrupted session(s) detected and recovered.`);
          setAppUserMessage(`${crashed} interrupted session(s) detected and recovered.`);
        }
        fetchSessions();
    };
    init();
  }, [fetchSessions]);

  useEffect(() => {
    document.body.className = `theme-${appSettings.appearance?.theme || Theme.DARK}`;
  }, [appSettings.appearance?.theme]);

  useEffect(() => {
    if (uploadedTextFileContent?.textContent) {
      setActiveSourceText(uploadedTextFileContent.textContent.replace(/\n/g, '<br />'));
    } else {
      setActiveSourceText(transcribedText);
    }
  }, [uploadedTextFileContent, transcribedText]);

  const handleLoadChunksToQueue = useCallback(async (chunks: Blob[]) => {
    if (chunks.length === 0) return;
    const files = chunks.map((blob, i) => {
      const ext = blob.type.split('/')[1]?.split(';')[0] || 'webm';
      const fileName = `${finalEffectiveTitle}_segment_${i + 1}.${ext}`;
      return new File([blob], fileName, { type: blob.type });
    });
    const loadedQueueItems = await transLogic.handleFilesSelected(files);
    setRecordingChunks([]);
    recordingChunksRef.current = [];
    setShowLoadChunksModal(false);
    setAppUserMessage("Segments loaded into queue.");
    return loadedQueueItems;
  }, [transLogic, finalEffectiveTitle]);

  const handleLoadSession = useCallback(async (sessionId: string) => {
    setIsBusy(true); setAppUserMessage("Loading session...");
    isInitialLoadingRef.current = true; 
    try {
      const session = await db.getSessionById(sessionId);
      if (session) {
        const { data } = session; 
        await resetAllDataStates();
        
        setAudioBlob(data.audioBlob || null);
        // Per sessioni chunked audioFileName può essere vuoto: deriva dal nome sessione
        setAudioFileName(data.audioFileName || (data.chunks?.length ? session.name : ""));
        setAudioDuration(data.audioDuration);
        setAudioRecordingStartTime(data.audioRecordingStartTime); 
        
        setBubbleNotes(data.bubbleNotes || []);
        setTranscribedText(data.transcribedText || ""); 
        setUploadedTextFileContent(data.uploadedTextFileContent || null);
        setLlmProcessedText(data.llmProcessedText || ""); 
        setLlmProcessingType(data.llmProcessingType || "");
        setEmotionHistory(data.emotionHistory || []); 
        setLlmUsageHistory(data.llmUsageHistory || []);
        setLlmResultsHistory(data.llmResultsHistory || []); 
        setAppSettings(data.settings);
        
        if (data.chunks && data.chunks.length > 0) {
            setRecordingChunks(data.chunks);
            recordingChunksRef.current = data.chunks;
            const files = data.chunks.map((blob, i) => {
              const ext = blob.type.split('/')[1]?.split(';')[0] || 'webm';
              const fn = `${session.name}_segment_${i + 1}.${ext}`;
              return new File([blob], fn, { type: blob.type });
            });
            await transLogic.handleFilesSelected(files);
        }

        const parts = session.name.split('_');
        if (parts.length >= 2) {
            const timePart = parts[parts.length - 1]; 
            const datePart = parts[parts.length - 2];
            if (datePart.match(/^\d{6}$/) && timePart.match(/^\d{4}$/)) {
                setRecordingTimestampSuffix(`${datePart}_${timePart}`);
                setRecordingTitle(parts.slice(0, -2).join('_'));
            } else { setRecordingTitle(session.name); }
        } else { setRecordingTitle(session.name); }
        
        activeSessionIdRef.current = session.id;
        setShowLoadSessionModal(false); 
        setAppUserMessage(`Session "${session.name}" loaded.`);
      }
    } catch (e) { 
        console.error("Load Session Error:", e);
        setAppUserMessage("Error loading session."); 
    } finally { 
        setIsBusy(false); 
        setTimeout(() => { isInitialLoadingRef.current = false; }, 500); 
    }
  }, [resetAllDataStates, setAppUserMessage, transLogic]);

  const handleGenerateSummaryForBubble = useCallback(async (note: BubbleNote) => {
    const plain = htmlToPlainText(note.contentHtml); if (!plain.trim()) return null;
    try {
      const { text, usageMetadata } = await llmService.generateText(plain, appSettings.llm, "Summarize note concisely.");
      if (usageMetadata) addLlmUsageStat({ functionName: 'Bubble Summary', inputTokens: usageMetadata.inputTokens, outputTokens: usageMetadata.outputTokens, model: appSettings.llm.model, provider: appSettings.llm.provider });
      return text;
    } catch (e) { return `Error: ${e}`; }
  }, [appSettings.llm, addLlmUsageStat]);

  const handleAssessCoherence = useCallback(async () => {
    if (!activeSourceText) return;
    setCoherenceStatus(CoherenceAssessmentStatus.LOADING);
    try {
      const { text, usageMetadata } = await llmService.generateText(htmlToPlainText(activeSourceText), appSettings.llm, "Analyze coherence briefly.");
      setCoherenceAssessment(text); setCoherenceStatus(CoherenceAssessmentStatus.SUCCESS);
      if (usageMetadata) addLlmUsageStat({ functionName: 'Coherence', inputTokens: usageMetadata.inputTokens, outputTokens: usageMetadata.outputTokens, model: appSettings.llm.model, provider: appSettings.llm.provider });
    } catch { setCoherenceStatus(CoherenceAssessmentStatus.ERROR); }
  }, [activeSourceText, appSettings.llm, addLlmUsageStat]);

  const handleLlmProcessingComplete = useCallback((text: string, type: string, usage?: any) => {
    // text is already converted to HTML in LlmProcessor
    setLlmProcessedText(text); setLlmProcessingType(type);
    setLlmResultsHistory(prev => [...prev, { id: Date.now().toString(), type, contentHtml: text, timestamp: Date.now() }]);
    if (usage) addLlmUsageStat({ ...usage, functionName: type, model: appSettings.llm.model, provider: appSettings.llm.provider });
  }, [appSettings.llm, addLlmUsageStat]);

  const handleLlmProcessingError = useCallback((err: string) => {
    if (pipelineStep === PipelineStep.ANALYZING) {
      setPipelineStep(PipelineStep.ERROR);
      if (activeSessionIdRef.current) db.updateSessionIncremental(activeSessionIdRef.current, { status: 'Failed' });
      setAppUserMessage(`AI Analysis failed: ${err}`);
    }
  }, [pipelineStep, setAppUserMessage]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 sm:p-6 md:p-8">
      <AppHeader
        appUserMessage={appUserMessage} isBusy={isBusy}
        onManageSessions={() => { fetchSessions(); setShowLoadSessionModal(true); }}
        onSaveAll={() => {
            if (activeSessionIdRef.current) {
                sessLogic.handleExportSessionJson(activeSessionIdRef.current);
            }
        }} onOpenStats={() => setIsStatisticsModalOpen(true)} onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenOutlookCalendar={() => setIsOutlookModalOpen(true)}
        canSaveZip={!!activeSessionIdRef.current} statsDisabled={!audioBlob && !activeSourceText && bubbleNotes.length === 0}
      />
      <AppMainContent 
        {...transLogic} audioRecorderRef={audioRecorderRef} setRecordingState={handleRecordingStateChange}
        handleRecordingComplete={(blob: any, name: any, start: any, emo: any) => {
          setAudioBlob(blob); setAudioFileName(name); 
          if (start) setAudioRecordingStartTime(start);
          setEmotionHistory(emo || []);
          const updates: any = { audioBlob: blob, audioFileName: name };
          if (start) updates.audioRecordingStartTime = start;
          if (activeSessionIdRef.current) {
              db.updateSessionIncremental(activeSessionIdRef.current, updates);
          }
          if (appSettings.transcription.enableAutoPipeline && !appSettings.transcription.enableChunkedRecording) {
              setTranscribedText("");
              setLlmProcessedText("");
              setPipelineStep(PipelineStep.TRANSCRIBING); 
              transLogic.handleAutoStartTranscription(undefined, blob, name);
          }
        }}
        handleChunkComplete={(chunk: any) => {
            recordingChunksRef.current.push(chunk);
            setRecordingChunks(p => {
                const next = [...p, chunk];
                if (activeSessionIdRef.current) {
                    db.updateSessionIncremental(activeSessionIdRef.current, { chunks: next });
                }
                return next;
            });
        }}
        handleRecordingStop={async (id: any, wasChunked: any, transcript: any, emo: any) => {
          let finalTranscript = transcribedText;
          if (transcript) {
             finalTranscript = transcript.replace(/\n/g, '<br />');
             setTranscribedText(finalTranscript);
          }
          if (emo) setEmotionHistory(emo);
          
          const finalUpdates = {
              status: 'Success' as const,
              bubbleNotes: bubbleNotes,
              emotionHistory: emo || emotionHistory,
              llmUsageHistory: llmUsageHistory,
              transcribedText: finalTranscript,
              chunks: recordingChunksRef.current 
          };

          if (wasChunked) {
              if (appSettings.transcription.enableAutoPipeline) {
                  setTranscribedText("");
                  setLlmProcessedText("");
                  setPipelineStep(PipelineStep.TRANSCRIBING);
                  const chunksToProcess = [...recordingChunksRef.current];
                  handleLoadChunksToQueue(chunksToProcess).then(loadedItems => {
                      if (activeSessionIdRef.current) {
                          db.updateSessionIncremental(activeSessionIdRef.current, finalUpdates);
                      }
                      if (loadedItems && loadedItems.length > 0) {
                          transLogic.handleAutoStartTranscription(loadedItems);
                      } else {
                          setPipelineStep(PipelineStep.IDLE);
                      }
                  });
              } else {
                  // Smart Pipeline OFF: carica i chunk in coda senza avviare la trascrizione
                  if (activeSessionIdRef.current) {
                      db.updateSessionIncremental(activeSessionIdRef.current, finalUpdates);
                  }
                  handleLoadChunksToQueue([...recordingChunksRef.current]);
                  setPipelineStep(PipelineStep.IDLE);
              }
          } else if (appSettings.transcription.enableAutoPipeline) {
              // Non-chunked pipeline is handled by handleRecordingComplete
              if (activeSessionIdRef.current) {
                  db.updateSessionIncremental(activeSessionIdRef.current, finalUpdates);
              }
          } else { 
              if (activeSessionIdRef.current) {
                  db.updateSessionIncremental(activeSessionIdRef.current, finalUpdates);
              }
              setPipelineStep(PipelineStep.IDLE); 
          }
        }}
        handleRecordingSessionStart={async () => {
          await resetAllDataStates({ preserveBubbleNotes: true }); 
          setPipelineStep(PipelineStep.RECORDING);
          const newSessionId = `s_${Date.now()}`;
          activeSessionIdRef.current = newSessionId;
          const initialSession: SavedSession = {
              id: newSessionId,
              name: finalEffectiveTitle,
              timestamp: Date.now(),
              status: 'In Progress',
              totalSizeMb: 0,
              data: {
                  audioBlob: null,
                  chunks: [],
                  audioFileName: "",
                  audioDuration: 0,
                  audioRecordingStartTime: new Date(),
                  bubbleNotes: pendingNoteHtml.trim() ? [{ id: `n${Date.now()}`, contentHtml: pendingNoteHtml, timestamp: Date.now(), recordingElapsedTime: 0, isEditing: false, isProcessing: false }] : [],
                  transcribedText: "",
                  uploadedTextFileContent: null,
                  llmProcessedText: "",
                  llmProcessingType: "",
                  settings: appSettings,
                  emotionHistory: [],
                  llmUsageHistory: [],
                  llmResultsHistory: []
              }
          };
          await db.saveSession(initialSession);
          if (pendingNoteHtml.trim()) {
            setBubbleNotes(initialSession.data.bubbleNotes);
            setPendingNoteHtml('');
          }
        }}
        appSettings={appSettings} isBusy={isBusy} isTextModeActive={!!uploadedTextFileContent}
        audioDuration={audioDuration} setAudioDuration={setAudioDuration} bubbleNotes={bubbleNotes} setBubbleNotes={setBubbleNotes}
        handleOpenBubbleNote={setViewingBubbleNoteId} pendingNoteHtml={pendingNoteHtml} setPendingNoteHtml={setPendingNoteHtml}
        playbackUrl={null} loadedAudioUrl={null} emotionHistory={emotionHistory} viewingBubbleNoteId={viewingBubbleNoteId}
        recordingTitle={recordingTitle} setRecordingTitle={setRecordingTitle} 
        recordingTimestampSuffix={recordingTimestampSuffix} setRecordingTimestampSuffix={setRecordingTimestampSuffix}
        isAutoSaveEnabled={isAutoSaveEnabled}
        onToggleAutoSave={() => setIsAutoSaveEnabled(!isAutoSaveEnabled)} autoSaveCountdown={autoSaveCountdown}
        addLlmUsageStat={addLlmUsageStat} resetAllDataStates={resetAllDataStates} audioBlob={audioBlob} audioFileName={audioFileName}
        handleDiarizationSettingChange={(v: boolean) => setAppSettings(p => ({...p, transcription: {...p.transcription, attemptSpeakerDiarization: v}}))}
        audioRecordingStartTime={audioRecordingStartTime} handleTextFileProcessed={setUploadedTextFileContent}
        isAudioModeActive={!!audioBlob || recordingChunks.length > 0} uploadedTextFileContent={uploadedTextFileContent} activeSourceText={activeSourceText}
        handleStartTranscription={transLogic.handleStartTranscription}
        onStopTranscription={transLogic.stopTranscription}
        isTranscribing={transLogic.isTranscribing} transcriptionError={transLogic.transcriptionError} setTranscribedText={setTranscribedText}
        llmProcessedText={llmProcessedText} llmProcessingType={llmProcessingType} handleLlmProcessingComplete={handleLlmProcessingComplete} handleLlmResultUpdateFromEditor={(h: any) => setLlmProcessedText(h)}
        handleSelectPlaybackFile={transLogic.setPlaybackFile} pipelineStep={pipelineStep} llmAutoTrigger={llmAutoTrigger}
        handleLlmProcessingError={handleLlmProcessingError}
        autoPipelineEnabled={appSettings.transcription.enableAutoPipeline ?? true} onToggleAutoPipeline={(val: boolean) => setAppSettings(p => ({...p, transcription: {...p.transcription, enableAutoPipeline: val}}))}
        chunksCount={recordingChunks.length}
      />
      <AppModals 
        isSettingsOpen={isSettingsOpen} setIsSettingsOpen={setIsSettingsOpen} appSettings={appSettings} handleSettingsChange={(s: any) => { setAppSettings(s); localStorage.setItem(APP_SETTINGS_LOCAL_STORAGE_KEY, JSON.stringify(s)); }}
        isStatisticsModalOpen={isStatisticsModalOpen} setIsStatisticsModalOpen={setIsStatisticsModalOpen} appStatistics={appStatistics}
        coherenceAssessment={coherenceAssessment} coherenceStatus={coherenceStatus} showLoadSessionModal={showLoadSessionModal} setShowLoadSessionModal={setShowLoadSessionModal}
        savedSessions={savedSessions} handleLoadSession={handleLoadSession} handleDeleteSession={sessLogic.handleDeleteSession} 
        handleExportSessionJson={sessLogic.handleExportSessionJson} handleImportSessionJson={sessLogic.handleImportSessionJson}
        showLoadChunksModal={showLoadChunksModal} setShowLoadChunksModal={setShowLoadChunksModal}
        recordingChunksCount={recordingChunks.length} handleLoadChunksToQueue={() => handleLoadChunksToQueue(recordingChunks)}
        viewingBubbleNote={bubbleNotes.find(n => n.id === viewingBubbleNoteId) || null} handleCloseBubbleNoteViewer={() => setViewingBubbleNoteId(null)}
        handleUpdateBubbleNote={(un: any) => setBubbleNotes(p => p.map(n => n.id === un.id ? un : n))} handleDeleteBubbleNote={(id: any) => setBubbleNotes(p => p.filter(n => n.id !== id))}
        handleGenerateSummaryForBubble={handleGenerateSummaryForBubble} handleAssessCoherence={handleAssessCoherence}
        isOutlookModalOpen={isOutlookModalOpen} setIsOutlookModalOpen={setIsOutlookModalOpen}
        handleOutlookImport={handleOutlookImport}
      />
    </div>
  );
};
