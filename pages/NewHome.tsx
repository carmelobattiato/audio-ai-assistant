
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { db } from '../utils/db';
import { NeoRecordingPanel } from '../components/newpage/NeoRecordingPanel';
import { BubbleNotes } from '../components/BubbleNotes';
import { TranscriptionView } from '../components/TranscriptionView';
import { LlmProcessor, LlmProcessorRef } from '../components/LlmProcessor';
import { MeetingChatPanel } from '../components/MeetingChatPanel';
import { AppModals } from '../components/AppModals';
import { NeoTopbar } from '../components/newpage/NeoTopbar';
import { NeoPipelineBar } from '../components/newpage/NeoPipelineBar';
import { NeoTabs } from '../components/newpage/NeoTabs';
import { NeoTipsPanel } from '../components/newpage/NeoTipsPanel';
import { Attendee, OutlookAppointment } from '../components/OutlookCalendarModal';
import { NeoCalendarDayView } from '../components/newpage/NeoCalendarDayView';

import { useTranscriptionLogic } from '../hooks/useTranscriptionLogic';
import { useSessionLogic } from '../hooks/useSessionLogic';

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
  PipelineStep,
  MeetingChatMessage,
} from '../types';

import { DEFAULT_SETTINGS, APP_VERSION } from '../constants';
import {
  countCharacters, countWords, estimateTokens,
  htmlToPlainText, getCurrentTimestampSuffix,
} from '../utils/textUtils';
import {
  createSessionZipBlob, generateStandardMetadataHeader, generateAnalysisHtmlDocument, saveBlobToFile,
} from '../utils/fileUtils';
import { llmService } from '../services/geminiService';
import { loggingService } from '../services/loggingService';
import { useRecordingFavicon } from '../hooks/useRecordingFavicon';

const APP_SETTINGS_KEY = 'audioAIAssistantSettings';

const DocumentIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const NotesIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);
const SparklesIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);
const ChatIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

export const NewHome: React.FC = () => {
  // ── State (identical to App.tsx) ──────────────────────────────────────────
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('');
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [audioRecordingStartTime, setAudioRecordingStartTime] = useState<Date | null>(null);
  const [uploadedTextFileContent, setUploadedTextFileContent] = useState<TextFileContent | null>(null);
  const [bubbleNotes, setBubbleNotes] = useState<BubbleNote[]>([]);
  const [pendingNoteHtml, setPendingNoteHtml] = useState<string>('');
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [activeSourceText, setActiveSourceText] = useState<string>('');
  const [llmProcessedText, setLlmProcessedText] = useState<string>('');
  const [llmProcessingType, setLlmProcessingType] = useState<string>('');
  const [llmUsageHistory, setLlmUsageHistory] = useState<LlmUsageStats[]>([]);
  const [llmResultsHistory, setLlmResultsHistory] = useState<ProcessedResult[]>([]);
  const [meetingChatHistory, setMeetingChatHistory] = useState<MeetingChatMessage[]>([]);
  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [recordingTitle, setRecordingTitle] = useState<string>('');
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
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const isInitialLoadingRef = useRef(false);
  const recordingChunksRef = useRef<Blob[]>([]);
  const audioRecorderRef = useRef<AudioRecorderRef>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const llmProcessorRef = useRef<LlmProcessorRef>(null);

  // ── New UI state ──────────────────────────────────────────────────────────
  const [activeRightTab, setActiveRightTab] = useState<string>('notes');
  const [recordingElapsedTime, setRecordingElapsedTime] = useState<number>(0);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);

  // ── Calendar background-sync state ───────────────────────────────────────
  const [calAppointments, setCalAppointments] = useState<OutlookAppointment[]>([]);
  const [calBridgeAvailable, setCalBridgeAvailable] = useState<boolean | null>(null);
  const [calError, setCalError] = useState<string | null>(null);
  const [calRefreshing, setCalRefreshing] = useState(false);
  const [meetingAttendees, setMeetingAttendees] = useState<Attendee[]>([]);

  const [leftWidthPct, setLeftWidthPct] = useState<number>(28);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const finalEffectiveTitle = useMemo(() => {
    const base = recordingTitle.trim() || 'Session';
    return `${base}_${recordingTimestampSuffix}`;
  }, [recordingTitle, recordingTimestampSuffix]);

  const appStatistics = useMemo<AppStatistics>(() => ({
    audioDetails: audioBlob ? {
      format: audioBlob.type, duration: audioDuration, size: audioBlob.size,
      channels: appSettings.audio.channels, bitrate: appSettings.audio.bitrate,
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
    llmUsageHistory,
    recordingTimestamp: audioRecordingStartTime?.toLocaleString(),
  }), [audioBlob, audioDuration, appSettings.audio, activeSourceText, llmProcessedText, llmUsageHistory, audioRecordingStartTime]);

  // ── Callbacks (identical to App.tsx) ─────────────────────────────────────
  const addLlmUsageStat = useCallback((stat: Omit<LlmUsageStats, 'timestamp'>) => {
    setLlmUsageHistory(prev => [...prev, { ...stat, timestamp: Date.now() }]);
  }, []);

  const fetchSessions = useCallback(async () => {
    const sessions = await db.getAllSessions();
    setSavedSessions(sessions);
  }, []);

  const handleRecordingStateChange = useCallback((state: RecordingState) => {
    setRecordingState(state);
    loggingService.info('RECORDING_STATE_CHANGE', `Recording state changed to ${state}`, { state });
    if (state === RecordingState.RECORDING) {
      setPipelineStep(PipelineStep.RECORDING);
      const jobId = crypto.randomUUID();
      loggingService.setCorrelationId(jobId);
      loggingService.info('PIPELINE_START', 'Recording started', { jobId });
    }
  }, []);

  const resetAllDataStates = useCallback(async (opts?: any) => {
    setAudioBlob(null); setAudioFileName(''); setAudioDuration(0); setAudioRecordingStartTime(null);
    setUploadedTextFileContent(null); setTranscribedText(''); setActiveSourceText('');
    if (!opts?.preserveBubbleNotes) {
      setBubbleNotes([]);
      setRecordingTitle('');
      setRecordingTimestampSuffix(getCurrentTimestampSuffix());
    }
    setLlmProcessedText(''); setLlmProcessingType(''); setLlmUsageHistory([]); setLlmResultsHistory([]);
    setMeetingChatHistory([]);
    setEmotionHistory([]); setAppUserMessage(null);
    setCoherenceAssessment(null); setCoherenceStatus(CoherenceAssessmentStatus.IDLE);
    setPipelineStep(PipelineStep.IDLE);
    setRecordingChunks([]);
    recordingChunksRef.current = [];
    activeSessionIdRef.current = null;
  }, []);

  const handleOutlookImport = useCallback((title: string, noteHtml: string, attendees: Attendee[] = []) => {
    setRecordingTitle(title);
    setMeetingAttendees(attendees);
    const newNote: BubbleNote = {
      id: `n_outlook_${Date.now()}`, contentHtml: noteHtml,
      timestamp: Date.now(), recordingElapsedTime: 0, isEditing: false, isProcessing: false,
    };
    setBubbleNotes(prev => [newNote, ...prev]);
    setAppUserMessage(`📅 Meeting "${title}" imported from Outlook`);
    setTimeout(() => setAppUserMessage(null), 4000);
  }, []);

  const handleOutlookOpenTeams = useCallback((title: string, noteHtml: string, teamsUrl: string, attendees: Attendee[] = []) => {
    handleOutlookImport(title, noteHtml, attendees);
    // Open Teams desktop app directly via msteams:// protocol — avoids Chrome opening the Teams web page
    const msteamsUrl = teamsUrl.replace(/^https:\/\/teams\.microsoft\.com/, 'msteams://teams.microsoft.com');
    const a = document.createElement('a');
    a.href = msteamsUrl;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setIsCalendarOpen(false);
    setTimeout(() => audioRecorderRef.current?.triggerSystemAudioGuide(), 150);
  }, [handleOutlookImport]);

  const handleGenerateSummaryForBubble = useCallback(async (note: BubbleNote) => {
    const plain = htmlToPlainText(note.contentHtml);
    if (!plain.trim()) return null;
    try {
      const { text, usageMetadata } = await llmService.generateText(plain, appSettings.llm, 'Summarize note concisely.');
      if (usageMetadata) addLlmUsageStat({ functionName: 'Bubble Summary', inputTokens: usageMetadata.inputTokens, outputTokens: usageMetadata.outputTokens, model: appSettings.llm.model, provider: appSettings.llm.provider });
      return text;
    } catch (e) { return `Error: ${e}`; }
  }, [appSettings.llm, addLlmUsageStat]);

  const handleAssessCoherence = useCallback(async () => {
    if (!activeSourceText) return;
    setCoherenceStatus(CoherenceAssessmentStatus.LOADING);
    try {
      const { text, usageMetadata } = await llmService.generateText(htmlToPlainText(activeSourceText), appSettings.llm, 'Analyze coherence briefly.');
      setCoherenceAssessment(text); setCoherenceStatus(CoherenceAssessmentStatus.SUCCESS);
      if (usageMetadata) addLlmUsageStat({ functionName: 'Coherence', inputTokens: usageMetadata.inputTokens, outputTokens: usageMetadata.outputTokens, model: appSettings.llm.model, provider: appSettings.llm.provider });
    } catch { setCoherenceStatus(CoherenceAssessmentStatus.ERROR); }
  }, [activeSourceText, appSettings.llm, addLlmUsageStat]);

  const handleLlmProcessingComplete = useCallback((text: string, type: string, usage?: any) => {
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
  }, [pipelineStep]);

  // ── Animated favicon while recording ──────────────────────────────────────
  useRecordingFavicon(recordingState === RecordingState.RECORDING);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const transLogic = useTranscriptionLogic(
    appSettings, audioBlob, audioFileName, audioRecordingStartTime,
    transcribedText, setTranscribedText, addLlmUsageStat, setAppUserMessage,
  );

  const sessLogic = useSessionLogic(
    audioBlob, audioFileName, finalEffectiveTitle, activeSourceText, bubbleNotes,
    llmResultsHistory, llmProcessedText, llmProcessingType, llmUsageHistory,
    setIsBusy, setAppUserMessage, fetchSessions,
  );

  // ── handleLoadChunksToQueue ───────────────────────────────────────────────
  const handleLoadChunksToQueue = useCallback(async (chunks: Blob[]) => {
    if (chunks.length === 0) return;
    const files = chunks.map((blob, i) => {
      const ext = blob.type.split('/')[1]?.split(';')[0] || 'webm';
      return new File([blob], `${finalEffectiveTitle}_segment_${i + 1}.${ext}`, { type: blob.type });
    });
    const loadedQueueItems = await transLogic.handleFilesSelected(files);
    setRecordingChunks([]);
    recordingChunksRef.current = [];
    setShowLoadChunksModal(false);
    setAppUserMessage('Segments loaded into queue.');
    return loadedQueueItems;
  }, [transLogic, finalEffectiveTitle]);

  // ── handleLoadSession ─────────────────────────────────────────────────────
  const handleLoadSession = useCallback(async (sessionId: string) => {
    setIsBusy(true); setAppUserMessage('Loading session...');
    isInitialLoadingRef.current = true;
    try {
      const session = await db.getSessionById(sessionId);
      if (session) {
        const { data } = session;
        await resetAllDataStates();
        setAudioBlob(data.audioBlob || null);
        setAudioFileName(data.audioFileName || (data.chunks?.length ? session.name : ''));
        setAudioDuration(data.audioDuration);
        setAudioRecordingStartTime(data.audioRecordingStartTime);
        setBubbleNotes(data.bubbleNotes || []);
        setTranscribedText(data.transcribedText || '');
        setUploadedTextFileContent(data.uploadedTextFileContent || null);
        setLlmProcessedText(data.llmProcessedText || '');
        setLlmProcessingType(data.llmProcessingType || '');
        setEmotionHistory(data.emotionHistory || []);
        setLlmUsageHistory(data.llmUsageHistory || []);
        setLlmResultsHistory(data.llmResultsHistory || []);
        setMeetingChatHistory(data.meetingChatHistory || []);
        setAppSettings(data.settings);
        if (data.chunks && data.chunks.length > 0) {
          setRecordingChunks(data.chunks);
          recordingChunksRef.current = data.chunks;
          const files = data.chunks.map((blob, i) => {
            const ext = blob.type.split('/')[1]?.split(';')[0] || 'webm';
            return new File([blob], `${session.name}_segment_${i + 1}.${ext}`, { type: blob.type });
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
      console.error('Load Session Error:', e);
      setAppUserMessage('Error loading session.');
    } finally {
      setIsBusy(false);
      setTimeout(() => { isInitialLoadingRef.current = false; }, 500);
    }
  }, [resetAllDataStates, transLogic]);

  // ── Effects (identical to App.tsx) ───────────────────────────────────────
  useEffect(() => {
    if (activeSessionIdRef.current && !isInitialLoadingRef.current) {
      db.updateSessionIncremental(activeSessionIdRef.current, { name: finalEffectiveTitle });
    }
  }, [finalEffectiveTitle]);

  useEffect(() => {
    if (activeSessionIdRef.current && recordingState === RecordingState.RECORDING && !isInitialLoadingRef.current) {
      db.updateSessionIncremental(activeSessionIdRef.current, { bubbleNotes, emotionHistory, llmUsageHistory });
    }
  }, [bubbleNotes, emotionHistory, llmUsageHistory, recordingState]);

  useEffect(() => {
    if (activeSessionIdRef.current && !isInitialLoadingRef.current) {
      db.updateSessionIncremental(activeSessionIdRef.current, { transcribedText, llmProcessedText, llmProcessingType, llmResultsHistory });
      if (pipelineStep === PipelineStep.COMPLETED) {
        db.updateSessionIncremental(activeSessionIdRef.current, { status: 'Success' });
      }
    }
  }, [transcribedText, llmProcessedText, llmProcessingType, llmResultsHistory, pipelineStep]);

  useEffect(() => {
    if (activeSessionIdRef.current && !isInitialLoadingRef.current) {
      db.updateSessionIncremental(activeSessionIdRef.current, { meetingChatHistory });
    }
  }, [meetingChatHistory]);

  useEffect(() => {
    if (pipelineStep !== PipelineStep.TRANSCRIBING) wasTranscribingRef.current = false;
  }, [pipelineStep]);

  useEffect(() => {
    if (transLogic.isTranscribing) wasTranscribingRef.current = true;
  }, [transLogic.isTranscribing]);

  useEffect(() => {
    if (pipelineStep === PipelineStep.TRANSCRIBING && !transLogic.isTranscribing && wasTranscribingRef.current) {
      const timer = setTimeout(() => {
        wasTranscribingRef.current = false;
        if (transLogic.transcriptionError) {
          loggingService.error('PIPELINE_ERROR', `Transcription failed: ${transLogic.transcriptionError}`);
          setPipelineStep(PipelineStep.ERROR);
          if (activeSessionIdRef.current) db.updateSessionIncremental(activeSessionIdRef.current, { status: 'Failed' });
          setAppUserMessage(`Pipeline failed: ${transLogic.transcriptionError}`);
        } else if (transcribedText && transcribedText.trim().length > 0) {
          setLlmProcessedText('');
          setPipelineStep(PipelineStep.ANALYZING);
          setLlmAutoTrigger(prev => prev + 1);
          setActiveRightTab('analysis'); // Auto-switch to analysis tab
        } else {
          setPipelineStep(PipelineStep.IDLE);
          setAppUserMessage('Transcription completed but no text was found.');
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [transLogic.isTranscribing, transLogic.transcriptionError, transcribedText, pipelineStep]);

  useEffect(() => {
    if (pipelineStep === PipelineStep.ANALYZING && llmProcessedText && llmProcessedText.trim().length > 0) {
      if (llmProcessedText.toLowerCase().includes('error from') || llmProcessedText.toLowerCase().includes('failed')) {
        setPipelineStep(PipelineStep.ERROR);
        if (activeSessionIdRef.current) db.updateSessionIncremental(activeSessionIdRef.current, { status: 'Failed' });
        setAppUserMessage('Pipeline failed at AI Analysis step.');
      } else {
        setPipelineStep(PipelineStep.DOWNLOADING);
        setAppUserMessage('AI Analysis completed. Preparing session download...');
      }
    }
  }, [llmProcessedText, pipelineStep]);

  useEffect(() => {
    if (pipelineStep !== PipelineStep.DOWNLOADING) return;
    try {
      const meta = generateStandardMetadataHeader(audioRecordingStartTime, audioFileName, {
        transcriptionLanguage: appSettings.transcription.language,
        llmProcessingType,
      });
      const analysisHtml = generateAnalysisHtmlDocument(llmProcessedText, {
        title: finalEffectiveTitle,
        sourceTimestamp: audioRecordingStartTime,
        sourceFileName: audioFileName,
        llmProcessingType,
        transcriptionLanguage: appSettings.transcription.language,
      });
      const zipBlob = createSessionZipBlob([
        { name: `${finalEffectiveTitle}_transcription.txt`, content: meta + htmlToPlainText(transcribedText) },
        { name: `${finalEffectiveTitle}_ai_analysis.txt`,   content: meta + htmlToPlainText(llmProcessedText) },
        { name: `${finalEffectiveTitle}_ai_analysis.html`,  content: analysisHtml },
      ]);
      saveBlobToFile(zipBlob, `${finalEffectiveTitle}_session.zip`);
    } catch (e) { console.error('Session ZIP creation failed:', e); }
    finally {
      setPipelineStep(PipelineStep.COMPLETED);
      setAppUserMessage('Processing Pipeline Completed.');
    }
  }, [pipelineStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const init = async () => {
      loggingService.info('APP_INIT', 'NewHome initializing', { version: APP_VERSION });
      const stored = localStorage.getItem(APP_SETTINGS_KEY);
      if (stored) setAppSettings(JSON.parse(stored));
      const crashed = await db.markCrashedSessions();
      if (crashed > 0) {
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

  // ── Stop handler ──────────────────────────────────────────────────────────
  const handleStopCurrentOperation = useCallback(() => {
    if (pipelineStep === PipelineStep.TRANSCRIBING) {
      transLogic.stopTranscription();
    } else if (pipelineStep === PipelineStep.ANALYZING) {
      llmProcessorRef.current?.stopProcessing();
    }
  }, [pipelineStep, transLogic]);

  // ── Shared AudioRecorder callbacks ────────────────────────────────────────
  const handleRecordingComplete = useCallback((blob: Blob, name: string, start: Date | null, emo: EmotionEvent[]) => {
    setAudioBlob(blob); setAudioFileName(name);
    if (start) setAudioRecordingStartTime(start);
    setEmotionHistory(emo || []);
    const updates: any = { audioBlob: blob, audioFileName: name };
    if (start) updates.audioRecordingStartTime = start;
    if (activeSessionIdRef.current) db.updateSessionIncremental(activeSessionIdRef.current, updates);
    if (appSettings.transcription.enableAutoPipeline && !appSettings.transcription.enableChunkedRecording) {
      setTranscribedText(''); setLlmProcessedText('');
      setPipelineStep(PipelineStep.TRANSCRIBING);
      transLogic.handleAutoStartTranscription(undefined, blob, name);
      setActiveRightTab('transcript'); // Auto-switch to transcript tab
    }
  }, [appSettings.transcription, transLogic]);

  const handleChunkComplete = useCallback((chunk: Blob) => {
    recordingChunksRef.current.push(chunk);
    setRecordingChunks(p => {
      const next = [...p, chunk];
      if (activeSessionIdRef.current) {
        db.updateSessionIncremental(activeSessionIdRef.current, { chunks: next });
      }
      return next;
    });
  }, []);

  const handleRecordingStop = useCallback(async (id: string, wasChunked: boolean, transcript: string | null, emo: EmotionEvent[]) => {
    let finalTranscript = transcribedText;
    if (transcript) { finalTranscript = transcript.replace(/\n/g, '<br />'); setTranscribedText(finalTranscript); }
    if (emo) setEmotionHistory(emo);

    const finalUpdates = {
      status: 'Success' as const,
      bubbleNotes,
      emotionHistory: emo || emotionHistory,
      llmUsageHistory,
      transcribedText: finalTranscript,
      chunks: recordingChunksRef.current,
    };

    if (wasChunked) {
      if (appSettings.transcription.enableAutoPipeline) {
        setTranscribedText(''); setLlmProcessedText('');
        setPipelineStep(PipelineStep.TRANSCRIBING);
        setActiveRightTab('transcript');
        const chunksToProcess = [...recordingChunksRef.current];
        handleLoadChunksToQueue(chunksToProcess).then(loadedItems => {
          if (activeSessionIdRef.current) db.updateSessionIncremental(activeSessionIdRef.current, finalUpdates);
          if (loadedItems && loadedItems.length > 0) transLogic.handleAutoStartTranscription(loadedItems);
          else setPipelineStep(PipelineStep.IDLE);
        });
      } else {
        if (activeSessionIdRef.current) db.updateSessionIncremental(activeSessionIdRef.current, finalUpdates);
        handleLoadChunksToQueue([...recordingChunksRef.current]);
        setPipelineStep(PipelineStep.IDLE);
      }
    } else if (appSettings.transcription.enableAutoPipeline) {
      if (activeSessionIdRef.current) db.updateSessionIncremental(activeSessionIdRef.current, finalUpdates);
    } else {
      if (activeSessionIdRef.current) db.updateSessionIncremental(activeSessionIdRef.current, finalUpdates);
      setPipelineStep(PipelineStep.IDLE);
    }
  }, [transcribedText, bubbleNotes, emotionHistory, llmUsageHistory, appSettings.transcription, transLogic, handleLoadChunksToQueue]);

  const handleRecordingSessionStart = useCallback(async () => {
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
        audioBlob: null, chunks: [], audioFileName: '', audioDuration: 0,
        audioRecordingStartTime: new Date(),
        bubbleNotes: pendingNoteHtml.trim()
          ? [{ id: `n${Date.now()}`, contentHtml: pendingNoteHtml, timestamp: Date.now(), recordingElapsedTime: 0, isEditing: false, isProcessing: false }]
          : [],
        transcribedText: '', uploadedTextFileContent: null,
        llmProcessedText: '', llmProcessingType: '',
        settings: appSettings, emotionHistory: [], llmUsageHistory: [], llmResultsHistory: [],
      },
    };
    await db.saveSession(initialSession);
    if (pendingNoteHtml.trim()) {
      setBubbleNotes(initialSession.data.bubbleNotes);
      setPendingNoteHtml('');
    }
  }, [resetAllDataStates, finalEffectiveTitle, pendingNoteHtml, appSettings]);

  // ── Right tabs definition ─────────────────────────────────────────────────
  const rightTabs = [
    { id: 'notes',      label: 'Notes', icon: <NotesIcon />,
      badge: bubbleNotes.length > 0 ? String(bubbleNotes.length) : undefined },
    { id: 'transcript', label: 'Transcript', icon: <DocumentIcon /> },
    { id: 'analysis',   label: 'AI Analysis', icon: <SparklesIcon />,
      badge: llmProcessedText ? '✓' : undefined },
    { id: 'chat',       label: 'Chat', icon: <ChatIcon />,
      badge: meetingChatHistory.length > 0 ? String(meetingChatHistory.length) : undefined },
  ];

  // ── Calendar background sync ──────────────────────────────────────────────
  const fetchCalendarData = useCallback(async () => {
    setCalRefreshing(true);
    try {
      const statusRes = await fetch('/api/outlook/status', { signal: AbortSignal.timeout(3000) });
      if (!statusRes.ok) throw new Error('Bridge non risponde');
      const statusData = await statusRes.json();
      if (statusData.status !== 'ok') throw new Error(statusData.message ?? 'Outlook non disponibile');
      setCalBridgeAvailable(true);
      const res = await fetch('/api/outlook/appointments/today');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCalAppointments(data.appointments ?? []);
      setCalError(null);
    } catch (e: unknown) {
      setCalBridgeAvailable(false);
      setCalError((e as Error).message ?? 'Errore di connessione');
    } finally {
      setCalRefreshing(false);
    }
  }, []);

  // Fetch once silently on page load
  useEffect(() => { fetchCalendarData(); }, [fetchCalendarData]);

  // Refresh in background every time the calendar is opened
  useEffect(() => { if (isCalendarOpen) fetchCalendarData(); }, [isCalendarOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Divider drag handler ──────────────────────────────────────────────────
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const container = mainContentRef.current;
    if (!container) return;

    const onMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !container) return;
      const rect = container.getBoundingClientRect();
      const newPct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftWidthPct(Math.min(55, Math.max(15, newPct)));
    };
    const onUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="neo-ctx flex flex-col"
      style={{ background: 'var(--neo-bg)', minHeight: '100vh', color: 'var(--neo-text)', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Topbar */}
      <NeoTopbar
        appUserMessage={appUserMessage}
        isBusy={isBusy}
        canSaveZip={!!activeSessionIdRef.current}
        statsDisabled={!audioBlob && !activeSourceText && bubbleNotes.length === 0}
        onManageSessions={() => { fetchSessions(); setShowLoadSessionModal(true); }}
        onSaveAll={() => { if (activeSessionIdRef.current) sessLogic.handleExportSessionJson(activeSessionIdRef.current); }}
        onOpenStats={() => setIsStatisticsModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenCalendar={() => setIsCalendarOpen(true)}
      />

      {/* Pipeline bar */}
      <NeoPipelineBar
        pipelineStep={pipelineStep}
        onStop={handleStopCurrentOperation}
      />

      {/* Main content: two-column layout */}
      <div
        ref={mainContentRef}
        className="flex p-4 flex-1"
        style={{ minHeight: 0, gap: 0 }}
      >
        {/* LEFT COLUMN: Tips (top) + Recording (centered) */}
        <div
          className="flex-shrink-0 flex flex-col"
          style={{ width: `${leftWidthPct}%`, minWidth: '180px', gap: '10px', paddingRight: '8px' }}
        >
          {/* Tips panel — top of left column */}
          <div style={{ flexShrink: 0 }}>
            <NeoTipsPanel />
          </div>

          {/* Recording panel — below tips */}
          <div className="flex-1 overflow-y-auto flex flex-col" style={{ minHeight: 0 }}>
            <div className="pb-2">
            <NeoRecordingPanel
            ref={audioRecorderRef}
            onRecordingStateChange={handleRecordingStateChange}
            onRecordingComplete={handleRecordingComplete}
            onChunkComplete={handleChunkComplete}
            onRecordingStop={handleRecordingStop}
            onFilesSelected={transLogic.handleFilesSelected}
            onRecordingSessionStart={handleRecordingSessionStart}
            audioSettings={appSettings.audio}
            transcriptionSettings={appSettings.transcription}
            llmSettings={appSettings.llm}
            disabled={isBusy || !!uploadedTextFileContent}
            onAudioDurationChange={setAudioDuration}
            audioDuration={audioDuration}
            bubbleNotes={bubbleNotes}
            onBubbleNotesChange={setBubbleNotes}
            onOpenBubbleNote={setViewingBubbleNoteId}
            pendingNoteHtml={pendingNoteHtml}
            onPendingNoteHtmlChange={setPendingNoteHtml}
            externalAudioUrl={null}
            emotionHistory={emotionHistory}
            viewingBubbleNoteId={viewingBubbleNoteId}
            recordingTitle={recordingTitle}
            onRecordingTitleChange={setRecordingTitle}
            recordingTimestampSuffix={recordingTimestampSuffix}
            onRecordingTimestampSuffixChange={setRecordingTimestampSuffix}
            isAutoSaveEnabled={isAutoSaveEnabled}
            onToggleAutoSave={() => setIsAutoSaveEnabled(!isAutoSaveEnabled)}
            autoSaveCountdown={autoSaveCountdown}
            autoSaveInterval={appSettings.transcription.autoSaveIntervalSeconds ?? 10}
            onReset={async () => { await resetAllDataStates(); audioRecorderRef.current?.resetRecording(); }}
            onLlmUsage={addLlmUsageStat}
            pipelineStep={pipelineStep}
            autoPipelineEnabled={appSettings.transcription.enableAutoPipeline ?? true}
            onToggleAutoPipeline={(val: boolean) => setAppSettings(p => ({ ...p, transcription: { ...p.transcription, enableAutoPipeline: val } }))}
            chunksCount={recordingChunks.length}
            onElapsedTimeChange={setRecordingElapsedTime}
          />
            </div>
          </div>
        </div>

        {/* DIVIDER — draggable */}
        <div
          onMouseDown={handleDividerMouseDown}
          style={{
            width: '10px',
            flexShrink: 0,
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
          title="Drag to resize panels"
        >
          <div style={{
            width: '3px',
            height: '48px',
            borderRadius: '999px',
            background: 'var(--neo-border)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--neo-primary-l)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--neo-border)'; }}
          />
        </div>

        {/* RIGHT COLUMN: Transcript + Analysis (tabbed) */}
        <div
          className="flex-1 min-w-0 overflow-hidden flex flex-col"
          style={{
            background: 'var(--neo-card)',
            border: '1px solid var(--neo-border)',
            borderRadius: '16px',
            padding: '20px',
          }}
        >
          <NeoTabs
            tabs={rightTabs}
            activeTab={activeRightTab}
            onTabChange={setActiveRightTab}
            className="h-full"
          >
            {/* Tab 0: Notes */}
            <BubbleNotes
              isEditorEditable={!isBusy}
              isRecordingCurrentlyActive={recordingState === RecordingState.RECORDING}
              isScreenSharing={isScreenSharing}
              isRecordingSessionActive={recordingState !== RecordingState.IDLE}
              elapsedTime={recordingElapsedTime}
              bubbleNotes={bubbleNotes}
              onBubbleNotesChange={setBubbleNotes}
              onOpenBubbleNote={setViewingBubbleNoteId}
              onTakeScreenshot={(isAuto: boolean) => { audioRecorderRef.current?.handleTakeScreenshot(isAuto); setIsScreenSharing(audioRecorderRef.current?.getIsScreenSharing() ?? false); }}
              llmSettings={appSettings.llm}
              transcriptionSettings={appSettings.transcription}
              pendingNoteHtml={pendingNoteHtml}
              onPendingNoteHtmlChange={setPendingNoteHtml}
              viewingBubbleNoteId={viewingBubbleNoteId}
              recordingTitle={finalEffectiveTitle}
            />

            {/* Tab 1: Transcript */}
            <TranscriptionView
              audioBlob={audioBlob}
              audioFileName={audioFileName}
              recordingTitle={finalEffectiveTitle}
              settings={appSettings.transcription}
              llmSettings={appSettings.llm}
              disabled={isBusy}
              onDiarizationSettingChange={(v: boolean) => setAppSettings(p => ({ ...p, transcription: { ...p.transcription, attemptSpeakerDiarization: v } }))}
              audioRecordingStartTime={audioRecordingStartTime}
              onTextFileProcessed={setUploadedTextFileContent}
              isAudioModeActive={!!audioBlob || recordingChunks.length > 0}
              isTextModeActive={!!uploadedTextFileContent}
              uploadedTextFileContentForDisplay={uploadedTextFileContent}
              activeSourceText={activeSourceText}
              onTranscribe={transLogic.handleStartTranscription}
              onStopTranscription={transLogic.stopTranscription}
              isTranscribing={transLogic.isTranscribing}
              transcriptionError={transLogic.transcriptionError}
              onTranscriptionChange={setTranscribedText}
              transcriptionQueue={transLogic.transcriptionQueue}
              onReorderQueue={transLogic.handleReorderQueue}
              onRemoveFromQueue={transLogic.handleRemoveFromQueue}
              transcriptionProgress={transLogic.transcriptionProgress}
              onSelectPlaybackFile={transLogic.setPlaybackFile}
              currentlyPlayingFile={transLogic.playbackFile?.file ?? null}
              isRealtimeTranscriptAvailable={!!(appSettings.transcription.enableRealtimeTranscription && activeSourceText && audioBlob)}
            />

            {/* Tab 2: AI Analysis */}
            <LlmProcessor
              ref={llmProcessorRef}
              sourceText={activeSourceText}
              bubbleNotes={bubbleNotes}
              onProcessingComplete={handleLlmProcessingComplete}
              currentLlmResult={llmProcessedText}
              onLlmResultUpdate={(h: string) => setLlmProcessedText(h)}
              settings={appSettings.llm}
              transcriptionSettings={appSettings.transcription}
              transcriptionLanguage={appSettings.transcription.language}
              customInstructions={appSettings.customInstructions ?? []}
              meetingTitle={recordingTitle}
              meetingAttendees={meetingAttendees}
              disabled={isBusy}
              audioDuration={audioBlob ? audioDuration : undefined}
              audioRecordingStartTime={audioRecordingStartTime}
              audioFileName={audioFileName}
              recordingTitle={finalEffectiveTitle}
              autoTrigger={llmAutoTrigger}
              isQuickProcessActive={pipelineStep === PipelineStep.ANALYZING}
              onQuickProcessComplete={() => {}}
              onProcessingError={handleLlmProcessingError}
              resultType={llmProcessingType}
            />

            {/* Tab 3: Chat with the Meeting Session */}
            <MeetingChatPanel
              sessionContext={{
                transcription: activeSourceText,
                llmResult: llmProcessedText,
                sessionTitle: finalEffectiveTitle,
                audioDuration: audioBlob ? audioDuration : undefined,
                audioRecordingStartTime: audioRecordingStartTime,
              }}
              llmSettings={appSettings.llm}
              history={meetingChatHistory}
              onHistoryChange={setMeetingChatHistory}
              onLlmUsage={(stats) => setLlmUsageHistory(prev => [...prev, stats])}
              disabled={isBusy}
            />
          </NeoTabs>
        </div>
      </div>

      {/* Modals (reused unchanged) */}
      <AppModals
        isSettingsOpen={isSettingsOpen} setIsSettingsOpen={setIsSettingsOpen}
        appSettings={appSettings}
        handleSettingsChange={(s: AppSettings) => { setAppSettings(s); localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(s)); }}
        isStatisticsModalOpen={isStatisticsModalOpen} setIsStatisticsModalOpen={setIsStatisticsModalOpen}
        appStatistics={appStatistics}
        coherenceAssessment={coherenceAssessment} coherenceStatus={coherenceStatus}
        showLoadSessionModal={showLoadSessionModal} setShowLoadSessionModal={setShowLoadSessionModal}
        savedSessions={savedSessions}
        handleLoadSession={handleLoadSession}
        handleDeleteSession={sessLogic.handleDeleteSession}
        handleExportSessionJson={sessLogic.handleExportSessionJson}
        handleImportSessionJson={sessLogic.handleImportSessionJson}
        showLoadChunksModal={showLoadChunksModal} setShowLoadChunksModal={setShowLoadChunksModal}
        recordingChunksCount={recordingChunks.length}
        handleLoadChunksToQueue={() => handleLoadChunksToQueue(recordingChunks)}
        viewingBubbleNote={bubbleNotes.find(n => n.id === viewingBubbleNoteId) || null}
        handleCloseBubbleNoteViewer={() => setViewingBubbleNoteId(null)}
        handleUpdateBubbleNote={(un: BubbleNote) => setBubbleNotes(p => p.map(n => n.id === un.id ? un : n))}
        handleDeleteBubbleNote={(id: string) => setBubbleNotes(p => p.filter(n => n.id !== id))}
        handleGenerateSummaryForBubble={handleGenerateSummaryForBubble}
        handleAssessCoherence={handleAssessCoherence}
      />

      <NeoCalendarDayView
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        onImport={handleOutlookImport}
        onOpenTeamsAndRecord={handleOutlookOpenTeams}
        externalAppointments={calAppointments}
        externalBridgeAvailable={calBridgeAvailable}
        externalError={calError}
        isBackgroundRefreshing={calRefreshing}
        onRequestRefresh={fetchCalendarData}
      />

    </div>
  );
};
