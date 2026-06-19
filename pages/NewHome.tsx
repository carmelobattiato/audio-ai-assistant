
import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { db } from '../utils/db';
// Always-visible shell components (load eagerly)
import { NeoRecordingPanel } from '../components/newpage/NeoRecordingPanel';
import { AppModals } from '../components/AppModals';
import { NeoTopbar } from '../components/newpage/NeoTopbar';
import { NeoPipelineBar } from '../components/newpage/NeoPipelineBar';
import { NeoTabs } from '../components/newpage/NeoTabs';
import { NeoTipsPanel } from '../components/newpage/NeoTipsPanel';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
// Type-only imports (no runtime cost)
import type { LlmProcessorRef } from '../components/LlmProcessor';
import type { Attendee, OutlookAppointment } from '../components/OutlookCalendarModal';
// Tab content — lazy-loaded on first render of each tab
const BubbleNotes       = lazy(() => import('../components/BubbleNotes').then(m => ({ default: m.BubbleNotes })));
const TranscriptionView = lazy(() => import('../components/TranscriptionView').then(m => ({ default: m.TranscriptionView })));
const LlmProcessor      = lazy(() => import('../components/LlmProcessor').then(m => ({ default: m.LlmProcessor as React.ComponentType<React.ComponentProps<typeof m.LlmProcessor>> })));
const MeetingChatPanel  = lazy(() => import('../components/MeetingChatPanel').then(m => ({ default: m.MeetingChatPanel })));
const NeoCalendarDayView = lazy(() => import('../components/newpage/NeoCalendarDayView').then(m => ({ default: m.NeoCalendarDayView })));

import { useTranscriptionLogic } from '../hooks/useTranscriptionLogic';
import { useSessionLogic } from '../hooks/useSessionLogic';
import { useMeetingNotifications } from '../hooks/useMeetingNotifications';
import { MeetingNotificationToasts } from '../components/MeetingNotificationToast';
import { MeetingNotificationBell } from '../components/MeetingNotificationBell';
import { useMeetingNotificationHistory } from '../hooks/useMeetingNotificationHistory';
import type { MeetingToastData } from '../utils/meetingUtils';
import type { MeetingNotificationRecord } from '../utils/db';

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
  LlmUsageStats,
  SavedSessionData,
  SupportedLanguage,
  ProcessedResult,
  PipelineStep,
  MeetingChatMessage,
} from '../types';

import { DEFAULT_SETTINGS, DEFAULT_SYSTEM_PROMPTS, APP_VERSION } from '../constants';
import {
  countCharacters, countWords, estimateTokens,
  htmlToPlainText, getCurrentTimestampSuffix,
} from '../utils/textUtils';
import {
  generateStandardMetadataHeader, generateAnalysisHtmlDocument, saveBlobToFile,
} from '../utils/fileUtils';
import type { ZipEntry } from '../utils/fileUtils';
import { llmService } from '../services/geminiService';
import { loggingService } from '../services/loggingService';
import { useRecordingFavicon } from '../hooks/useRecordingFavicon';
import { useBatchedDbUpdate } from '../hooks/useBatchedDbUpdate';
import { encryptString, decryptString } from '../utils/crypto';

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
  const [hasCustomApiKey, setHasCustomApiKey] = useState(false);
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
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>(PipelineStep.IDLE);
  const [llmAutoTrigger, setLlmAutoTrigger] = useState<number>(0);
  const wasTranscribingRef = useRef(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
  const [isStatisticsModalOpen, setIsStatisticsModalOpen] = useState(false);
  const [showLoadSessionModal, setShowLoadSessionModal] = useState(false);
  const [showLoadChunksModal, setShowLoadChunksModal] = useState(false);
  const [startChoiceModal, setStartChoiceModal] = useState<{
    resolve: (mode: 'new' | 'append' | 'cancel') => void;
  } | null>(null);
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
  const chunkIndexOffsetRef = useRef<number>(0);
  const appendModeRef = useRef<boolean>(false);
  const finalEffectiveTitleRef = useRef<string>('Session');
  const audioRecorderRef = useRef<AudioRecorderRef>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const llmProcessorRef = useRef<LlmProcessorRef>(null);
  const hasLiveTranscriptRef = useRef(false);
  const clearTranscriptionQueueRef = useRef<() => void>(() => {});

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
  const appUserMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const systemAudioGuideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pipelineDataRef = useRef({
    audioRecordingStartTime: null as Date | null,
    audioFileName: '',
    language: 'Italian' as SupportedLanguage,
    llmProcessingType: '',
    finalEffectiveTitle: '',
    transcribedText: '',
    llmProcessedText: '',
  });

  const { schedule: scheduleDbUpdate, flush: flushDbUpdate } = useBatchedDbUpdate(activeSessionIdRef, isInitialLoadingRef);

  // ── Derived ───────────────────────────────────────────────────────────────
  const finalEffectiveTitle = useMemo(() => {
    const base = recordingTitle.trim() || 'Session';
    const title = `${base}_${recordingTimestampSuffix}`;
    finalEffectiveTitleRef.current = title;
    return title;
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

  // Stable sub-objects for NeoRecordingPanel — prevent re-renders when unrelated settings change
  const audioSettings = useMemo(() => appSettings.audio, [appSettings.audio]);
  const transcriptionSettings = useMemo(() => appSettings.transcription, [appSettings.transcription]);
  const llmSettings = useMemo(() => appSettings.llm, [appSettings.llm]);

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

  const handleRealtimeTranscriptionChange = useCallback((text: string) => {
    if (!text) return;
    setTranscribedText(text.replace(/\n/g, '<br />'));
    if (!hasLiveTranscriptRef.current) {
      hasLiveTranscriptRef.current = true;
      setActiveRightTab('transcript');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (appUserMessageTimerRef.current) clearTimeout(appUserMessageTimerRef.current);
      if (systemAudioGuideTimerRef.current) clearTimeout(systemAudioGuideTimerRef.current);
    };
  }, []);

  const resetAllDataStates = useCallback(async (opts?: { preserveBubbleNotes?: boolean }) => {
    setAudioBlob(null); setAudioFileName(''); setAudioDuration(0); setAudioRecordingStartTime(null);
    setUploadedTextFileContent(null); setTranscribedText(''); setActiveSourceText('');
    if (!opts?.preserveBubbleNotes) {
      setBubbleNotes([]);
      setRecordingTitle('');
      setRecordingTimestampSuffix(getCurrentTimestampSuffix());
    }
    setLlmProcessedText(''); setLlmProcessingType(''); setLlmUsageHistory([]); setLlmResultsHistory([]);
    setMeetingChatHistory([]);
    setAppUserMessage(null);
    setCoherenceAssessment(null); setCoherenceStatus(CoherenceAssessmentStatus.IDLE);
    setPipelineStep(PipelineStep.IDLE);
    setRecordingChunks([]);
    recordingChunksRef.current = [];
    clearTranscriptionQueueRef.current();
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
    if (appUserMessageTimerRef.current) clearTimeout(appUserMessageTimerRef.current);
    appUserMessageTimerRef.current = setTimeout(() => setAppUserMessage(null), 4000);
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
    if (systemAudioGuideTimerRef.current) clearTimeout(systemAudioGuideTimerRef.current);
    systemAudioGuideTimerRef.current = setTimeout(() => audioRecorderRef.current?.triggerSystemAudioGuide(), 150);
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

  const handleLlmProcessingComplete = useCallback((text: string, type: string, usage?: Pick<LlmUsageStats, 'inputTokens' | 'outputTokens' | 'timestamp'>) => {
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
  clearTranscriptionQueueRef.current = () => transLogic.setTranscriptionQueue([]);

  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!transLogic.playbackFile) { setPlaybackUrl(null); return; }
    const url = URL.createObjectURL(transLogic.playbackFile.file);
    setPlaybackUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [transLogic.playbackFile]);

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
          const timePart = parts[parts.length - 1] ?? '';
          const datePart = parts[parts.length - 2] ?? '';
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

  const handleLoadAndRecord = useCallback(async (sessionId: string) => {
    await handleLoadSession(sessionId);
    // Mark existing session In Progress and start recording without resetting any data
    if (activeSessionIdRef.current) {
      await db.updateSessionIncremental(activeSessionIdRef.current, { status: 'In Progress' });
    }
    setPipelineStep(PipelineStep.RECORDING);
    setTimeout(() => { audioRecorderRef.current?.continueRecording(); }, 150);
  }, [handleLoadSession]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Keep pipelineDataRef in sync so the DOWNLOADING effect always reads fresh values
  // without capturing stale closures (no deps = runs after every render)
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

  // Batched DB writes — individual state changes are coalesced into one write per 500ms
  useEffect(() => { scheduleDbUpdate({ name: finalEffectiveTitle }); }, [finalEffectiveTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scheduleDbUpdate({ bubbleNotes, llmUsageHistory });
  }, [bubbleNotes, llmUsageHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scheduleDbUpdate({ transcribedText, llmProcessedText, llmProcessingType, llmResultsHistory });
  }, [transcribedText, llmProcessedText, llmProcessingType, llmResultsHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pipelineStep === PipelineStep.COMPLETED) {
      flushDbUpdate();
      if (activeSessionIdRef.current && !isInitialLoadingRef.current) {
        db.updateSessionIncremental(activeSessionIdRef.current, { status: 'Success' })
          .catch(err => loggingService.error('DB_UPDATE', 'Failed to set session status Success', { err: String(err) }));
      }
    }
  }, [pipelineStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scheduleDbUpdate({ meetingChatHistory }); }, [meetingChatHistory]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [transLogic.isTranscribing]);

  useEffect(() => {
    loggingService.info('PIPELINE', `Step changed → ${pipelineStep}`, {
      autoPipeline: appSettings.transcription.enableAutoPipeline,
      chunked: appSettings.transcription.enableChunkedRecording,
      autoTranscribeChunks: appSettings.transcription.autoTranscribeChunks,
    });
  }, [pipelineStep]);

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
  }, [transLogic.isTranscribing, transLogic.transcriptionError, transcribedText, pipelineStep]);

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
  }, [llmProcessedText, pipelineStep]);

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
  }, [pipelineStep]);

  useEffect(() => {
    const init = async () => {
      loggingService.info('APP_INIT', 'NewHome initializing', { version: APP_VERSION });
      const stored = localStorage.getItem(APP_SETTINGS_KEY);
      let settings: AppSettings = stored ? JSON.parse(stored) : DEFAULT_SETTINGS;

      // Migrate: ensure transcription language defaults to Italian
      if (!settings.transcription?.language) {
        settings = { ...settings, transcription: { ...settings.transcription, language: 'Italian' } };
      }

      // Migrate: add systemPrompts if missing from old saved settings
      if (!settings.systemPrompts || settings.systemPrompts.length === 0) {
        settings = { ...settings, systemPrompts: DEFAULT_SYSTEM_PROMPTS };
      } else {
        // Merge: add any new prompts that didn't exist in the saved settings
        const savedIds = new Set(settings.systemPrompts.map((p) => p.id));
        const newDefaults = DEFAULT_SYSTEM_PROMPTS.filter((p) => !savedIds.has(p.id));
        if (newDefaults.length > 0) {
          settings = { ...settings, systemPrompts: [...settings.systemPrompts, ...newDefaults] };
        }
      }

      // Resolve encrypted API key from IndexedDB
      const encrypted = await db.getEncryptedApiKey();
      setHasCustomApiKey(!!encrypted);
      if (settings.llm?.apiKeySource === 'custom' && encrypted) {
        try {
          const decrypted = await decryptString(encrypted);
          settings = { ...settings, llm: { ...settings.llm, googleApiKey: decrypted } };
        } catch {
          loggingService.warn('API_KEY', 'Failed to decrypt custom API key — falling back to system');
        }
      }

      setAppSettings(settings);
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

  const handleSaveCustomApiKey = useCallback(async (key: string) => {
    const blob = await encryptString(key);
    await db.saveEncryptedApiKey(blob);
    setHasCustomApiKey(true);
    // Update resolved key in memory
    setAppSettings(prev => ({
      ...prev,
      llm: { ...prev.llm, googleApiKey: key, apiKeySource: 'custom' },
    }));
    const toSave = { ...appSettings, llm: { ...appSettings.llm, googleApiKey: undefined, apiKeySource: 'custom' } };
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(toSave));
  }, [appSettings]);

  const handleDeleteCustomApiKey = useCallback(async () => {
    await db.deleteEncryptedApiKey();
    setHasCustomApiKey(false);
    setAppSettings(prev => ({
      ...prev,
      llm: { ...prev.llm, googleApiKey: undefined, apiKeySource: 'system' },
    }));
    const toSave = { ...appSettings, llm: { ...appSettings.llm, googleApiKey: undefined, apiKeySource: 'system' } };
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(toSave));
  }, [appSettings]);

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
  const handleRecordingComplete = useCallback((blob: Blob, name: string, start: Date | null) => {
    if (appendModeRef.current && !appSettings.transcription.enableChunkedRecording) {
      // Append a non-chunked recording as an extra segment in the transcription queue
      const ext = blob.type.split('/')[1]?.split(';')[0] || 'webm';
      const segName = `${finalEffectiveTitleRef.current}_segment_${(chunkIndexOffsetRef.current + 1).toString().padStart(3, '0')}.${ext}`;
      chunkIndexOffsetRef.current += 1;
      loggingService.info('PIPELINE', 'handleRecordingComplete (append mode, non-chunked) → queued as segment', { segName });
      transLogic.addChunkToQueue(blob, segName);
      const smartPipelineActive = appSettings.transcription.enableAutoPipeline ?? true;
      if (smartPipelineActive && appSettings.transcription.autoTranscribeChunks !== false) {
        transLogic.handleTranscribeChunkDirect(blob, segName);
        setActiveRightTab('transcript');
        setPipelineStep(PipelineStep.TRANSCRIBING);
      } else {
        setPipelineStep(PipelineStep.IDLE);
      }
      return;
    }
    setAudioBlob(blob); setAudioFileName(name);
    if (start) setAudioRecordingStartTime(start);
    const updates: Partial<SavedSessionData> = { audioBlob: blob, audioFileName: name };
    if (start) updates.audioRecordingStartTime = start;
    scheduleDbUpdate(updates);
    flushDbUpdate();
    loggingService.info('PIPELINE', 'handleRecordingComplete', {
      name, autoPipeline: appSettings.transcription.enableAutoPipeline,
      chunked: appSettings.transcription.enableChunkedRecording, realtime: appSettings.transcription.enableRealtimeTranscription,
    });
    if (appSettings.transcription.enableRealtimeTranscription) {
      loggingService.info('PIPELINE', 'Realtime mode → skipping transcription, IDLE');
      setPipelineStep(PipelineStep.IDLE);
    } else if (appSettings.transcription.enableAutoPipeline && !appSettings.transcription.enableChunkedRecording) {
      loggingService.info('PIPELINE', 'Non-chunked + autoPipeline → TRANSCRIBING');
      setTranscribedText(''); setLlmProcessedText('');
      setPipelineStep(PipelineStep.TRANSCRIBING);
      transLogic.handleAutoStartTranscription(undefined, blob, name);
      setActiveRightTab('transcript');
    } else {
      loggingService.info('PIPELINE', 'No pipeline action in handleRecordingComplete (chunked or pipeline off)');
    }
  }, [appSettings.transcription, transLogic]);

  const handleChunkComplete = useCallback((chunk: Blob) => {
    recordingChunksRef.current.push(chunk);
    const chunkIndex = chunkIndexOffsetRef.current + recordingChunksRef.current.length;
    const ext = chunk.type.split('/')[1]?.split(';')[0] || 'webm';
    const chunkName = `${finalEffectiveTitleRef.current}_segment_${chunkIndex.toString().padStart(3, '0')}.${ext}`;

    scheduleDbUpdate({ chunks: recordingChunksRef.current });
    setRecordingChunks(p => [...p, chunk]);

    const smartPipelineActive = appSettings.transcription.enableAutoPipeline ?? true;
    const shouldAutoTranscribe = smartPipelineActive && appSettings.transcription.autoTranscribeChunks !== false;
    loggingService.debug('PIPELINE', `Chunk saved: ${chunkName}`, { autoTranscribe: shouldAutoTranscribe, smartPipeline: smartPipelineActive });
    transLogic.addChunkToQueue(chunk, chunkName);
    if (shouldAutoTranscribe) {
      transLogic.handleTranscribeChunkDirect(chunk, chunkName);
    }
  }, [transLogic.addChunkToQueue, transLogic.handleTranscribeChunkDirect, appSettings.transcription.autoTranscribeChunks, appSettings.transcription.enableAutoPipeline]);

  const handleRecordingStop = useCallback(async (id: string, wasChunked: boolean, transcript?: string | null) => {
    let finalTranscript = transcribedText;
    if (transcript) { finalTranscript = transcript.replace(/\n/g, '<br />'); setTranscribedText(finalTranscript); }

    const finalUpdates = {
      status: 'Success' as const,
      bubbleNotes,
      llmUsageHistory,
      transcribedText: finalTranscript,
      chunks: recordingChunksRef.current,
    };

    if (wasChunked) {
      setRecordingChunks([]);
      recordingChunksRef.current = [];
      scheduleDbUpdate(finalUpdates);
      flushDbUpdate();
      setShowLoadChunksModal(false);
      loggingService.info('PIPELINE', 'handleRecordingStop: chunked', {
        autoPipeline: appSettings.transcription.enableAutoPipeline,
        autoTranscribeChunks: appSettings.transcription.autoTranscribeChunks,
        queueLen: transLogic.transcriptionQueue.length,
      });
      if (appSettings.transcription.enableAutoPipeline) {
        loggingService.info('PIPELINE', 'Chunked + autoPipeline → TRANSCRIBING (draining auto-queue)');
        setActiveRightTab('transcript');
        setPipelineStep(PipelineStep.TRANSCRIBING);
      }
    } else if (appSettings.transcription.enableAutoPipeline) {
      scheduleDbUpdate(finalUpdates);
      flushDbUpdate();
    } else {
      scheduleDbUpdate(finalUpdates);
      flushDbUpdate();
      setPipelineStep(PipelineStep.IDLE);
    }
  }, [transcribedText, bubbleNotes, llmUsageHistory, appSettings.transcription, transLogic, finalEffectiveTitle]);

  const handleRecordingSessionStart = useCallback(async (): Promise<boolean> => {
    const hasExistingData =
      !!transcribedText ||
      !!llmProcessedText ||
      !!audioBlob ||
      transLogic.transcriptionQueue.length > 0;

    let mode: 'new' | 'append' | 'cancel' = 'new';
    if (hasExistingData) {
      mode = await new Promise<'new' | 'append' | 'cancel'>(resolve => {
        setStartChoiceModal({ resolve });
      });
      setStartChoiceModal(null);
    }

    if (mode === 'cancel') {
      loggingService.info('RECORDING', 'User cancelled new recording (existing session data)');
      return false;
    }

    if (mode === 'append') {
      loggingService.info('RECORDING', 'Appending new recording to existing session', {
        sessionId: activeSessionIdRef.current,
        existingQueueLen: transLogic.transcriptionQueue.length,
      });
      hasLiveTranscriptRef.current = false;
      appendModeRef.current = true;
      chunkIndexOffsetRef.current = transLogic.transcriptionQueue.length;
      recordingChunksRef.current = [];
      setRecordingChunks([]);
      setPipelineStep(PipelineStep.RECORDING);
      const sid = activeSessionIdRef.current;
      if (sid) {
        try {
          await db.updateSessionIncremental(sid, { status: 'In Progress' });
        } catch (e) {
          loggingService.error('RECORDING', 'Failed to mark session In Progress on append', { error: String(e) });
        }
      }
      return true;
    }

    hasLiveTranscriptRef.current = false;
    appendModeRef.current = false;
    chunkIndexOffsetRef.current = 0;
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
        settings: appSettings, llmUsageHistory: [], llmResultsHistory: [],
      },
    };
    await db.saveSession(initialSession);
    if (pendingNoteHtml.trim()) {
      setBubbleNotes(initialSession.data.bubbleNotes);
      setPendingNoteHtml('');
    }
    return true;
  }, [resetAllDataStates, finalEffectiveTitle, pendingNoteHtml, appSettings, transcribedText, llmProcessedText, audioBlob, transLogic.transcriptionQueue.length]);

  // ── Right tabs definition ─────────────────────────────────────────────────
  const rightTabs = useMemo(() => [
    { id: 'notes',      label: 'Notes', icon: <NotesIcon />,
      badge: bubbleNotes.length > 0 ? String(bubbleNotes.length) : undefined },
    { id: 'transcript', label: 'Transcript', icon: <DocumentIcon />,
      badge: transLogic.transcriptionQueue.length > 0
        ? `${transLogic.transcriptionQueue.filter(q => q.transcribed).length}/${transLogic.transcriptionQueue.length}`
        : undefined },
    { id: 'analysis',   label: 'AI Analysis', icon: <SparklesIcon />,
      badge: llmProcessedText ? '✓' : undefined },
    { id: 'chat',       label: 'Chat', icon: <ChatIcon />,
      badge: meetingChatHistory.length > 0 ? String(meetingChatHistory.length) : undefined },
  ], [bubbleNotes.length, transLogic.transcriptionQueue, llmProcessedText, meetingChatHistory.length]);

  // ── Calendar background sync ──────────────────────────────────────────────
  // Throttle: skip auto-fetches that fire within 60s of the previous fetch.
  // Throttle timestamp lives in localStorage so it survives component remounts
  // AND is shared across browser tabs (the meeting-notification feature opens
  // extra tabs via ?startMeeting=…, each running its own NewHome).
  // User-initiated retries (isRetry=true) and the scheduled 15-min tick bypass throttle.
  // Cross-tab lock with TTL prevents two tabs from hitting the COM bridge at once;
  // BroadcastChannel propagates the appointment list to peer tabs.
  const CAL_LAST_KEY = 'calendar:lastFetch';
  const CAL_LOCK_KEY = 'calendar:fetching';
  const CAL_LOCK_TTL = 120_000;
  const CAL_BC = 'calendar-sync-v1';
  const calBcRef = useRef<BroadcastChannel | null>(null);
  const calInFlightRef = useRef(false);
  const calLastDetailHashRef = useRef<string>('');

  useEffect(() => {
    const bc = new BroadcastChannel(CAL_BC);
    calBcRef.current = bc;
    bc.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'appointments' && Array.isArray(msg.appointments)) {
        setCalAppointments(msg.appointments);
        setCalBridgeAvailable(true);
        setCalError(null);
      }
    };
    return () => { bc.close(); calBcRef.current = null; };
  }, []);

  const fetchCalendarData = useCallback(async (isRetry = false, bypassThrottle = false) => {
    if (calInFlightRef.current) return; // in-tab coalescing
    const now = Date.now();
    const lastStr = localStorage.getItem(CAL_LAST_KEY);
    const last = lastStr ? parseInt(lastStr, 10) : 0;
    if (!isRetry && !bypassThrottle && Number.isFinite(last) && (now - last) < 60_000) {
      return;
    }
    // Cross-tab lock with TTL (auto-expires in case a tab crashed mid-fetch)
    const lockStr = localStorage.getItem(CAL_LOCK_KEY);
    if (!isRetry && lockStr) {
      const lockTs = parseInt(lockStr, 10);
      if (Number.isFinite(lockTs) && (now - lockTs) < CAL_LOCK_TTL) {
        return;
      }
    }
    localStorage.setItem(CAL_LAST_KEY, String(now));
    localStorage.setItem(CAL_LOCK_KEY, String(now));
    calInFlightRef.current = true;
    setCalRefreshing(true);
    if (isRetry) {
      loggingService.info('CALENDAR_RETRY', 'User triggered calendar data retry', {
        platform: navigator.platform,
      });
    }

    const { loadCalendarSource, loadIcsConfig, fetchIcs } = await import('../services/icsService');
    const source = loadCalendarSource();

    if (source === 'ics') {
      try {
        const cfg = loadIcsConfig();
        if (!cfg?.icsUrl) {
          throw new Error('ICS feed not configured. Open Settings → Integrations and paste the published Outlook ICS URL.');
        }
        const events = await fetchIcs(cfg.icsUrl);
        // Filter to today (LOCAL date) and map to OutlookAppointment shape
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const todayKey = `${yyyy}-${mm}-${dd}`;
        const teamsRe = /https:\/\/teams\.microsoft\.com\/l\/[^\s<>"']+/;
        const mapped: OutlookAppointment[] = events
          .filter(ev => {
            if (!ev.start) return false;
            const d = new Date(ev.start);
            const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return k === todayKey;
          })
          .sort((a, b) => a.start.localeCompare(b.start))
          .map(ev => ({
            id: ev.id,
            subject: ev.subject,
            start: ev.start,
            end: ev.end,
            location: ev.location || '',
            body: ev.description || '',
            attendees: (ev.attendees || []).map(name => ({ name, email: '' })),
            organizer: ev.organizer || '',
            onlineMeetingUrl: ev.description?.match(teamsRe)?.[0],
            isCanceled: ev.isCancelled,
            isRecurring: ev.isRecurring,
          }));
        setCalBridgeAvailable(true);
        setCalAppointments(mapped);
        setCalError(null);
        loggingService.debug('CALENDAR_LOADED', `Loaded ${mapped.length} appointments via ICS feed`, {
          count: mapped.length, source: 'ics', isRetry,
        });
        calBcRef.current?.postMessage({ type: 'appointments', appointments: mapped });
      } catch (e: unknown) {
        setCalBridgeAvailable(false);
        setCalError((e as Error).message ?? 'ICS fetch error');
        loggingService.warn('CALENDAR_BRIDGE_ERROR', String((e as Error).message), { source: 'ics', isRetry });
      } finally {
        localStorage.removeItem(CAL_LOCK_KEY);
        calInFlightRef.current = false;
        setCalRefreshing(false);
      }
      return;
    }

    try {
      const statusRes = await fetch('/api/outlook/status', { signal: AbortSignal.timeout(3000) });
      if (!statusRes.ok) {
        const reason = `Outlook Bridge unreachable (HTTP ${statusRes.status})`;
        loggingService.warn('CALENDAR_BRIDGE_ERROR', reason, { httpStatus: statusRes.status, isRetry, platform: navigator.platform });
        loggingService.debug('CALENDAR_BRIDGE_ERROR_DETAIL', 'Status endpoint returned non-OK response', {
          url: '/api/outlook/status', httpStatus: statusRes.status, isRetry, platform: navigator.platform,
        });
        throw new Error(reason);
      }
      const statusData = await statusRes.json();
      if (statusData.status !== 'ok') {
        const serverPlatform: string = statusData.platform ?? '';
        const isNonWindows = serverPlatform !== '' && serverPlatform !== 'win32';
        const reason = isNonWindows
          ? `Outlook Bridge is not available on ${serverPlatform}. This feature requires Windows.`
          : (statusData.message ?? 'Outlook Bridge unavailable');
        loggingService.warn('CALENDAR_BRIDGE_ERROR', reason, { serverPlatform, isNonWindows, isRetry, bridgeStatus: statusData.status });
        loggingService.debug('CALENDAR_BRIDGE_ERROR_DETAIL', 'Bridge status check failed', {
          statusData, serverPlatform, isNonWindows, isRetry, clientPlatform: navigator.platform,
        });
        throw new Error(reason);
      }
      setCalBridgeAvailable(true);
      const res = await fetch('/api/outlook/appointments/today');
      const data = await res.json();
      if (data.error) {
        loggingService.warn('CALENDAR_APPOINTMENTS_ERROR', data.error, { isRetry });
        loggingService.debug('CALENDAR_APPOINTMENTS_ERROR_DETAIL', 'Appointments endpoint returned error', { data, isRetry });
        throw new Error(data.error);
      }
      const apptList = data.appointments ?? [];
      const skippedList = data.skipped ?? [];
      setCalAppointments(apptList);
      setCalError(null);
      loggingService.debug('CALENDAR_LOADED', `Loaded ${apptList.length} appointments (seen ${data.totalSeen ?? '?'}, skipped ${skippedList.length}) in ${data.timings?.total ?? '?'}ms`, {
        count: apptList.length,
        skippedCount: skippedList.length,
        totalSeen: data.totalSeen,
        filter: data.filter,
        timings: data.timings,
        canceledCount: apptList.filter((a: any) => a.isCanceled).length,
        recurringCount: apptList.filter((a: any) => a.isRecurring).length,
        isRetry,
      });
      if (skippedList.length > 0) {
        loggingService.warn('CALENDAR_SKIPPED', `${skippedList.length} appointments skipped by bridge`, { skipped: skippedList });
      }
      // Detail log only when the appointment set changes (id+start+end+meetingStatus
      // hash) — otherwise we'd write a 21-event payload every 15 min for no signal.
      const detailEntries = apptList.map((a: any) => ({
        id: a.id, subject: a.subject, start: a.start, end: a.end,
        organizer: a.organizer, responseStatus: a.responseStatus,
        meetingStatus: a.meetingStatus, isCanceled: a.isCanceled, isRecurring: a.isRecurring,
        hasTeamsUrl: !!a.onlineMeetingUrl, attendees: a.attendees?.length ?? 0,
      }));
      const detailHash = detailEntries.map((e: any) => `${e.id}|${e.start}|${e.end}|${e.meetingStatus}|${e.isCanceled}`).join('::');
      if (detailHash !== calLastDetailHashRef.current) {
        calLastDetailHashRef.current = detailHash;
        loggingService.debug('CALENDAR_APPOINTMENTS_DETAIL', 'Appointment summary (changed)', {
          appointments: detailEntries,
        });
      }
      calBcRef.current?.postMessage({ type: 'appointments', appointments: apptList });
    } catch (e: unknown) {
      setCalBridgeAvailable(false);
      setCalError((e as Error).message ?? 'Connection error');
    } finally {
      localStorage.removeItem(CAL_LOCK_KEY);
      calInFlightRef.current = false;
      setCalRefreshing(false);
    }
  }, []);

  // Fetch once silently on page load
  useEffect(() => { fetchCalendarData(); }, [fetchCalendarData]);

  // Refresh in background every time the calendar is opened
  useEffect(() => { if (isCalendarOpen) fetchCalendarData(); }, [isCalendarOpen, fetchCalendarData]);

  // Auto-refresh every 15 min (bypasses throttle) + opportunistic refresh on
  // window/tab focus or visibility (throttled to once per 60s to avoid storming
  // the COM bridge when the user alt-tabs frequently).
  useEffect(() => {
    const intervalId = window.setInterval(() => { fetchCalendarData(false, true); }, 15 * 60 * 1000);
    const onFocus = () => { fetchCalendarData(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchCalendarData(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchCalendarData]);

  // Pre-call in-app toast notifications (10 min before each meeting by default).
  // Toggleable in Settings → General. Generates an AI summary via Gemini at fire time.
  // In-app toasts are used instead of the browser Notification API to bypass corporate
  // group policies that block OS-level notifications.
  const [meetingToasts, setMeetingToasts] = useState<MeetingToastData[]>([]);

  const playMeetingChime = useCallback(() => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.45);
    } catch { /* audio not available */ }
  }, []);

  const handleMeetingTrigger = useCallback((data: MeetingToastData) => {
    setMeetingToasts(prev => (prev.some(t => t.id === data.id) ? prev : [...prev, data]));
    playMeetingChime();
  }, [playMeetingChime]);

  const handleToastDismiss = useCallback((id: string) => {
    setMeetingToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleToastSnooze = useCallback((id: string, minutes: number) => {
    setMeetingToasts(prev => {
      const t = prev.find(x => x.id === id);
      if (t) {
        const snoozed: MeetingToastData = { ...t, id: `${t.apptId}::snooze::${Date.now()}` };
        window.setTimeout(() => {
          setMeetingToasts(cur => (cur.some(c => c.id === snoozed.id) ? cur : [...cur, snoozed]));
          playMeetingChime();
        }, minutes * 60_000);
      }
      return prev.filter(x => x.id !== id);
    });
  }, [playMeetingChime]);

  const handleToastOpen = useCallback((_t: MeetingToastData) => {
    setIsCalendarOpen(true);
  }, []);

  const handleTestMeetingNotification = useCallback(() => {
    const now = new Date();
    const start = new Date(now.getTime() + 10 * 60_000);
    const fake: MeetingToastData = {
      id: `test::${Date.now()}`,
      apptId: 'test',
      subject: 'Test meeting · review demo',
      organizer: appSettings.appearance?.userEmail || 'you@company.com',
      startIso: start.toISOString(),
      minutesToStart: 10,
      role: 'required',
      summary: 'Questa è una notifica di prova. La call simulata richiede una breve presentazione dei progressi: PREPARA 2-3 slide sullo stato attuale, poi sarà discussione aperta.',
    };
    setMeetingToasts(prev => [...prev, fake]);
    playMeetingChime();
  }, [appSettings.appearance, playMeetingChime]);

  useMeetingNotifications({
    appointments: calAppointments,
    enabled: appSettings.appearance?.meetingNotificationsEnabled ?? true,
    leadMinutes: appSettings.appearance?.meetingNotificationLeadMinutes ?? 10,
    userEmail: appSettings.appearance?.userEmail ?? '',
    llmSettings: appSettings.llm,
    onTrigger: handleMeetingTrigger,
  });

  // Notification history (bell icon dropdown) — backed by IndexedDB, 1-day TTL
  const { records: meetingHistory, deleteOne: deleteMeetingHistoryItem, clearAll: clearAllMeetingHistory } = useMeetingNotificationHistory();

  // Opens a new browser tab pre-loaded for a given meeting; the new tab parses
  // the URL params on mount and prepares the session (title + countdown auto-start).
  const handleStartSessionForMeeting = useCallback((rec: Pick<MeetingNotificationRecord, 'apptId' | 'date'>) => {
    const u = new URL(window.location.href);
    u.searchParams.set('startMeeting', `${rec.apptId}::${rec.date}`);
    window.open(u.toString(), '_blank', 'noopener');
  }, []);

  const handleStartSessionFromToast = useCallback((toast: MeetingToastData) => {
    const date = toast.startIso ? new Date(toast.startIso) : new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    handleStartSessionForMeeting({ apptId: toast.apptId, date: `${y}-${m}-${d}` });
  }, [handleStartSessionForMeeting]);

  // URL param: ?startMeeting=<recordId> — auto-load meeting context + countdown
  const [pendingAutoStart, setPendingAutoStart] = useState<{ startMs: number; subject: string } | null>(null);
  const pendingAutoStartLoadedRef = useRef(false);
  useEffect(() => {
    if (pendingAutoStartLoadedRef.current) return;
    pendingAutoStartLoadedRef.current = true;
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get('startMeeting');
    if (!id) return;
    (async () => {
      const rec = await db.getMeetingNotification(id);
      if (!rec) {
        console.warn('[auto-start] meeting record not found for', id);
        return;
      }
      const bodyHtml = rec.body ? `<p><strong>${rec.subject}</strong></p><p>Organizer: ${rec.organizer}</p>${rec.summary ? `<hr><p>${rec.summary}</p>` : ''}${rec.body ? `<hr><p>${rec.body.replace(/\n/g, '<br>')}</p>` : ''}` : `<p><strong>${rec.subject}</strong></p><p>Organizer: ${rec.organizer}</p>`;
      handleOutlookImport(rec.subject, bodyHtml, []);
      setPendingAutoStart({ startMs: new Date(rec.startIso).getTime(), subject: rec.subject });
      console.info('[auto-start] loaded meeting "%s", auto-record at %s', rec.subject, rec.startIso);
    })();
  }, []);

  // Countdown banner state — recomputed each second
  const [autoStartCountdownMs, setAutoStartCountdownMs] = useState<number | null>(null);
  useEffect(() => {
    if (!pendingAutoStart) { setAutoStartCountdownMs(null); return; }
    const tick = () => setAutoStartCountdownMs(pendingAutoStart.startMs - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [pendingAutoStart]);

  // Trigger the recording at meeting start time (or immediately if start already passed
  // when user lands on the page)
  const autoStartFiredRef = useRef(false);
  useEffect(() => {
    if (!pendingAutoStart) return;
    if (autoStartFiredRef.current) return;
    const delay = Math.max(0, pendingAutoStart.startMs - Date.now());
    const id = window.setTimeout(() => {
      if (autoStartFiredRef.current) return;
      autoStartFiredRef.current = true;
      try {
        audioRecorderRef.current?.startMicOnly?.();
      } catch (err) {
        console.warn('[auto-start] startMicOnly failed', err);
      }
    }, delay);
    return () => window.clearTimeout(id);
  }, [pendingAutoStart]);

  const handleAutoStartNow = useCallback(() => {
    if (autoStartFiredRef.current) return;
    autoStartFiredRef.current = true;
    try { audioRecorderRef.current?.startMicOnly?.(); } catch { /* noop */ }
    setPendingAutoStart(null);
  }, []);

  const handleAutoStartCancel = useCallback(() => {
    setPendingAutoStart(null);
    autoStartFiredRef.current = true; // prevent the deferred timer from firing
  }, []);

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
      {/* Auto-start countdown banner */}
      {pendingAutoStart && autoStartCountdownMs !== null && (
        <div
          className="px-4 py-2 flex items-center justify-between gap-3 text-sm"
          style={{
            background: 'linear-gradient(90deg, rgba(16,185,129,0.18), rgba(124,58,237,0.18))',
            borderBottom: '1px solid rgba(167,139,250,0.4)',
            color: '#f1f5f9',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span style={{ fontSize: '18px' }}>⏱️</span>
            <span className="truncate">
              {autoStartCountdownMs > 0 ? (
                <>
                  Auto-record di <strong>{pendingAutoStart.subject}</strong> tra{' '}
                  <strong>
                    {String(Math.floor(autoStartCountdownMs / 60000)).padStart(2, '0')}:
                    {String(Math.floor((autoStartCountdownMs / 1000) % 60)).padStart(2, '0')}
                  </strong>
                </>
              ) : (
                <>Auto-record in avvio…</>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleAutoStartNow}
              className="text-xs px-3 py-1 rounded font-medium"
              style={{ background: 'rgba(16,185,129,0.4)', border: '1px solid rgba(16,185,129,0.6)', color: 'white' }}
            >
              Avvia ora
            </button>
            <button
              type="button"
              onClick={handleAutoStartCancel}
              className="text-xs px-3 py-1 rounded font-medium"
              style={{ background: 'rgba(75,85,99,0.5)', color: '#e5e7eb' }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Topbar */}
      <NeoTopbar
        appUserMessage={appUserMessage}
        isBusy={isBusy}
        canSaveZip={!!activeSessionIdRef.current}
        statsDisabled={!audioBlob && !activeSourceText && bubbleNotes.length === 0}
        transcriptionLabel={appSettings.llm.model}
        analysisLabel={appSettings.llm.model}
        onManageSessions={() => { fetchSessions(); setShowLoadSessionModal(true); }}
        onSaveAll={() => { if (activeSessionIdRef.current) sessLogic.handleExportSessionJson(activeSessionIdRef.current); }}
        onOpenStats={() => setIsStatisticsModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenCalendar={() => setIsCalendarOpen(true)}
        calendarSyncing={calRefreshing}
        notificationBell={
          <MeetingNotificationBell
            records={meetingHistory}
            onOpenCalendar={() => setIsCalendarOpen(true)}
            onStartSessionForMeeting={handleStartSessionForMeeting}
            onDelete={(id) => { void deleteMeetingHistoryItem(id); }}
            onClearAll={() => { void clearAllMeetingHistory(); }}
          />
        }
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
            audioSettings={audioSettings}
            transcriptionSettings={transcriptionSettings}
            llmSettings={llmSettings}
            disabled={isBusy || !!uploadedTextFileContent}
            onAudioDurationChange={setAudioDuration}
            audioDuration={audioDuration}
            bubbleNotes={bubbleNotes}
            onBubbleNotesChange={setBubbleNotes}
            onOpenBubbleNote={setViewingBubbleNoteId}
            pendingNoteHtml={pendingNoteHtml}
            onPendingNoteHtmlChange={setPendingNoteHtml}
            externalAudioUrl={playbackUrl}
            onStopPlayback={() => transLogic.setPlaybackFile(null)}
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
            onRealtimeTranscriptionChange={handleRealtimeTranscriptionChange}
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
            <Suspense fallback={<div style={{ padding: '1rem', color: '#64748b', fontSize: '0.8rem' }}>Caricamento…</div>}>
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
            </Suspense>

            {/* Tab 1: Transcript */}
            <Suspense fallback={<div style={{ padding: '1rem', color: '#64748b', fontSize: '0.8rem' }}>Caricamento…</div>}>
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
              onTranscribeChunk={transLogic.handleTranscribeSingleChunk}
              transcriptionProgress={transLogic.transcriptionProgress}
              onSelectPlaybackFile={transLogic.setPlaybackFile}
              currentlyPlayingFile={transLogic.playbackFile?.file ?? null}
              isRealtimeTranscriptAvailable={!!(appSettings.transcription.enableRealtimeTranscription && activeSourceText && audioBlob)}
            />
            </Suspense>

            {/* Tab 2: AI Analysis */}
            <ErrorBoundary variant="inline" label="LlmProcessor">
            <Suspense fallback={<div style={{ padding: '1rem', color: '#64748b', fontSize: '0.8rem' }}>Caricamento…</div>}>
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
              systemPrompts={appSettings.systemPrompts ?? []}
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
            </Suspense>
            </ErrorBoundary>

            {/* Tab 3: Chat with the Meeting Session */}
            <Suspense fallback={<div style={{ padding: '1rem', color: '#64748b', fontSize: '0.8rem' }}>Caricamento…</div>}>
            <MeetingChatPanel
              sessionContext={{
                transcription: activeSourceText,
                llmResult: llmProcessedText,
                sessionTitle: finalEffectiveTitle,
                audioDuration: audioBlob ? audioDuration : undefined,
                audioRecordingStartTime: audioRecordingStartTime,
                bubbleNotes: bubbleNotes,
              }}
              llmSettings={appSettings.llm}
              history={meetingChatHistory}
              onHistoryChange={setMeetingChatHistory}
              onLlmUsage={(stats) => setLlmUsageHistory(prev => [...prev, stats])}
              disabled={isBusy}
            />
            </Suspense>
          </NeoTabs>
        </div>
      </div>

      {/* Modal: scelta nuova registrazione vs append a sessione esistente */}
      <Modal
        isOpen={!!startChoiceModal}
        onClose={() => startChoiceModal?.resolve('cancel')}
        title="Existing session"
        footer={
          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <Button onClick={() => startChoiceModal?.resolve('cancel')} variant="ghost">Cancel</Button>
            <Button onClick={() => startChoiceModal?.resolve('new')} variant="danger">New session</Button>
            <Button onClick={() => startChoiceModal?.resolve('append')} variant="primary">Append to session</Button>
          </div>
        }
      >
        <p className="text-gray-300">
          This session already contains a transcript / AI analysis / recording.<br />
          What do you want to do with the new recording?
        </p>
        <ul className="text-sm text-gray-400 list-disc pl-5 space-y-1">
          <li><strong className="text-sky-400">Append to session</strong>: keeps the current transcript, AI analysis, bubble notes and queued chunks. The new recording is appended.</li>
          <li><strong className="text-red-400">New session</strong>: discards current data and creates an empty session.</li>
        </ul>
      </Modal>

      <MeetingNotificationToasts
        toasts={meetingToasts}
        onDismiss={handleToastDismiss}
        onSnooze={handleToastSnooze}
        onOpen={handleToastOpen}
        onStartSession={handleStartSessionFromToast}
      />

      {/* Modals (reused unchanged) */}
      <AppModals
        isSettingsOpen={isSettingsOpen} setIsSettingsOpen={(v) => { setIsSettingsOpen(v); if (!v) setSettingsInitialTab(undefined); }}
        settingsInitialTab={settingsInitialTab}
        onTestMeetingNotification={handleTestMeetingNotification}
        appSettings={appSettings}
        hasCustomApiKey={hasCustomApiKey}
        onSaveCustomApiKey={handleSaveCustomApiKey}
        onDeleteCustomApiKey={handleDeleteCustomApiKey}
        handleSettingsChange={async (s: AppSettings) => {
          // Resolve API key for in-memory state
          let resolved = { ...s };
          if (s.llm?.apiKeySource === 'custom') {
            const encrypted = await db.getEncryptedApiKey();
            if (encrypted) {
              try {
                const decrypted = await decryptString(encrypted);
                resolved = { ...s, llm: { ...s.llm, googleApiKey: decrypted } };
              } catch { /* keep googleApiKey undefined */ }
            }
          } else {
            resolved = { ...s, llm: { ...s.llm, googleApiKey: undefined } };
          }
          setAppSettings(resolved);
          // Never persist raw key to localStorage
          const toSave = { ...resolved, llm: { ...resolved.llm, googleApiKey: undefined } };
          localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(toSave));
        }}
        isStatisticsModalOpen={isStatisticsModalOpen} setIsStatisticsModalOpen={setIsStatisticsModalOpen}
        appStatistics={appStatistics}
        coherenceAssessment={coherenceAssessment} coherenceStatus={coherenceStatus}
        showLoadSessionModal={showLoadSessionModal} setShowLoadSessionModal={setShowLoadSessionModal}
        savedSessions={savedSessions}
        handleLoadSession={handleLoadSession}
        handleLoadAndRecord={handleLoadAndRecord}
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

      <Suspense fallback={null}>
      <NeoCalendarDayView
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        onImport={handleOutlookImport}
        onImportAndSchedule={(title, noteHtml, attendees, startIso, subject) => {
          handleOutlookImport(title, noteHtml, attendees);
          const startMs = new Date(startIso).getTime();
          if (!Number.isFinite(startMs)) return;
          autoStartFiredRef.current = false;
          setPendingAutoStart({ startMs, subject });
        }}
        onOpenTeamsAndRecord={handleOutlookOpenTeams}
        externalAppointments={calAppointments}
        externalBridgeAvailable={calBridgeAvailable}
        externalError={calError}
        isBackgroundRefreshing={calRefreshing}
        onRequestRefresh={() => fetchCalendarData(true)}
        onConfigureIcs={() => {
          setIsCalendarOpen(false);
          setSettingsInitialTab('integrations');
          setIsSettingsOpen(true);
        }}
      />
      </Suspense>

    </div>
  );
};
