
import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { db } from '../utils/db';
// Always-visible shell components (load eagerly)
import { NeoRecordingPanel } from '../components/newpage/NeoRecordingPanel';
import { AppModals } from '../components/AppModals';
import { NeoTopbar } from '../components/newpage/NeoTopbar';
import { useIsOnline } from '../hooks/useIsOnline';
import { useCalendarSync } from '../hooks/useCalendarSync';
import { useMeetingFlow } from '../hooks/useMeetingFlow';
import { NeoPipelineBar } from '../components/newpage/NeoPipelineBar';
import { NeoTabs } from '../components/newpage/NeoTabs';
import { NeoTipsPanel } from '../components/newpage/NeoTipsPanel';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
// Type-only imports (no runtime cost)
import type { LlmProcessorRef } from '../components/LlmProcessor';
import type { Attendee } from '../components/OutlookCalendarModal';
// Tab content — lazy-loaded on first render of each tab
const BubbleNotes       = lazy(() => import('../components/BubbleNotes').then(m => ({ default: m.BubbleNotes })));
const TranscriptionView = lazy(() => import('../components/TranscriptionView').then(m => ({ default: m.TranscriptionView })));
const LlmProcessor      = lazy(() => import('../components/LlmProcessor').then(m => ({ default: m.LlmProcessor as React.ComponentType<React.ComponentProps<typeof m.LlmProcessor>> })));
const MeetingChatPanel  = lazy(() => import('../components/MeetingChatPanel').then(m => ({ default: m.MeetingChatPanel })));
const NeoCalendarDayView = lazy(() => import('../components/newpage/NeoCalendarDayView').then(m => ({ default: m.NeoCalendarDayView })));
const NewCalendarView = lazy(() => import('../components/newcalendar/NewCalendarView').then(m => ({ default: m.NewCalendarView })));

import { useTranscriptionLogic } from '../hooks/useTranscriptionLogic';
import { useSessionLogic } from '../hooks/useSessionLogic';
import { MeetingNotificationToasts } from '../components/MeetingNotificationToast';
import { MeetingNotificationBell } from '../components/MeetingNotificationBell';

import {
  AppStatistics,
  CoherenceAssessmentStatus,
  SavedSession,
  BubbleNote,
  RecordingState,
  AudioRecorderRef,
  LlmUsageStats,
  SavedSessionData,
  SupportedLanguage,
  PipelineStep,
} from '../types';

import {
  countCharacters, countWords, estimateTokens,
  htmlToPlainText,
} from '../utils/textUtils';
import { llmService } from '../services/geminiService';
import { loggingService } from '../services/loggingService';
import { useRecordingFavicon } from '../hooks/useRecordingFavicon';
import { useBatchedDbUpdate } from '../hooks/useBatchedDbUpdate';
import { useSettings } from '../contexts/SettingsContext';
import { useUIState } from '../contexts/UIStateContext';
import { useSession } from '../contexts/SessionContext';
import { usePipelineEffects } from '../hooks/usePipelineEffects';

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
  const { appSettings, hasCustomApiKey, setAppSettings, patchSettings, persistSettings, saveCustomApiKey, deleteCustomApiKey } = useSettings();
  const {
    isSettingsOpen, settingsInitialTab, isStatisticsModalOpen,
    showLoadSessionModal, sessionToPreview, showLoadChunksModal,
    startChoiceModal, viewingBubbleNoteId, isBusy, appUserMessage,
    isCalendarOpen, isNewCalendarOpen, activeRightTab, leftWidthPct,
    setIsSettingsOpen, setSettingsInitialTab, setIsStatisticsModalOpen,
    setShowLoadSessionModal, setSessionToPreview, setShowLoadChunksModal,
    setStartChoiceModal, setViewingBubbleNoteId, setIsBusy, setAppUserMessage,
    setIsCalendarOpen, setIsNewCalendarOpen, setActiveRightTab, setLeftWidthPct,
  } = useUIState();
  // ── Session state (via SessionContext) ────────────────────────────────────
  const {
    audioBlob, setAudioBlob, audioFileName, setAudioFileName,
    audioDuration, setAudioDuration, audioRecordingStartTime, setAudioRecordingStartTime,
    uploadedTextFileContent, setUploadedTextFileContent, recordingChunks, setRecordingChunks,
    recordingState, setRecordingState, recordingTitle, setRecordingTitle,
    recordingTimestampSuffix, setRecordingTimestampSuffix,
    isAutoSaveEnabled, setIsAutoSaveEnabled, autoSaveCountdown,
    recordingElapsedTime, setRecordingElapsedTime, isScreenSharing, setIsScreenSharing,
    meetingAttendees, setMeetingAttendees,
    bubbleNotes, setBubbleNotes, pendingNoteHtml, setPendingNoteHtml,
    transcribedText, setTranscribedText, activeSourceText,
    llmProcessedText, setLlmProcessedText, llmProcessingType, setLlmProcessingType,
    llmUsageHistory, setLlmUsageHistory, setLlmResultsHistory,
    meetingChatHistory, setMeetingChatHistory,
    coherenceAssessment, setCoherenceAssessment, coherenceStatus, setCoherenceStatus,
    pipelineStep, setPipelineStep, llmAutoTrigger,
    savedSessions,
    resetSession, fetchSessions, addLlmUsageStat,
  } = useSession();
  const wasTranscribingRef = useRef(false);
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
  const pendingLinkAppointmentRef = useRef<{ id: string; subject: string } | null>(null);

  const isOnline = useIsOnline();

  // ── Calendar sync ───────────────────────────────────────────────────────
  const {
    calAppointments, calBridgeAvailable, calError, calRefreshing,
    calExtensionConnected, calOutlookState, calSource, calendarEventsDb, setCalendarEventsDb, lastSyncAt,
    fetchCalendarData,
  } = useCalendarSync({ isCalendarOpen, isNewCalendarOpen });


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
      size: new TextEncoder().encode(activeSourceText).length,
    } : null,
    llmResultStats: llmProcessedText ? {
      characterCount: countCharacters(llmProcessedText),
      wordCount: countWords(llmProcessedText),
      estimatedTokenCount: estimateTokens(llmProcessedText),
      size: new TextEncoder().encode(llmProcessedText).length,
    } : null,
    llmUsageHistory,
    recordingTimestamp: audioRecordingStartTime?.toLocaleString(),
  }), [audioBlob, audioDuration, appSettings.audio, activeSourceText, llmProcessedText, llmUsageHistory, audioRecordingStartTime]);

  // Stable sub-objects for NeoRecordingPanel — prevent re-renders when unrelated settings change
  const audioSettings = useMemo(() => appSettings.audio, [appSettings.audio]);
  const transcriptionSettings = useMemo(() => appSettings.transcription, [appSettings.transcription]);
  const llmSettings = useMemo(() => appSettings.llm, [appSettings.llm]);

  // ── Callbacks ─────────────────────────────────────────────────────────────
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
    resetSession(opts);
    setAppUserMessage(null);
    recordingChunksRef.current = [];
    clearTranscriptionQueueRef.current();
    activeSessionIdRef.current = null;
  }, [resetSession]);

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
    // Store appointment reference for auto-link when recording session starts
    const matchedApt = calAppointments.find(apt => apt.subject === title);
    if (matchedApt) {
      pendingLinkAppointmentRef.current = { id: matchedApt.id, subject: matchedApt.subject };
    }
  }, [calAppointments]);

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

  const handleLinkSessionToEvent = useCallback(async (eventId: string, sessionId: string) => {
    const event = calendarEventsDb.find(e => e.id === eventId);
    await db.linkSessionToEvent(eventId, sessionId, event?.subject);
    const updated = await db.getAllCalendarEvents();
    setCalendarEventsDb(updated);
  }, [calendarEventsDb]);

  const handleUnlinkSessionFromEvent = useCallback(async (eventId: string) => {
    await db.unlinkSessionFromEvent(eventId);
    const updated = await db.getAllCalendarEvents();
    setCalendarEventsDb(updated);
  }, []);

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

  // ── Pipeline effects (FSM, DB sync, init) ────────────────────────────────
  usePipelineEffects(
    transLogic,
    wasTranscribingRef,
    activeSessionIdRef,
    isInitialLoadingRef,
    pipelineDataRef,
    scheduleDbUpdate,
    flushDbUpdate,
    finalEffectiveTitle,
  );

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

  const handleRecordingStop = useCallback(async (_id: string, wasChunked: boolean, transcript?: string | null) => {
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
    try {
      await db.saveSession(initialSession);
    } catch (e) {
      loggingService.error('RECORDING', 'Failed to persist new session', { error: String(e) });
      activeSessionIdRef.current = null;
      setPipelineStep(PipelineStep.IDLE);
      setAppUserMessage('Impossibile salvare la sessione (memoria piena o DB non disponibile). Libera spazio in Impostazioni → Storage.');
      if (appUserMessageTimerRef.current) clearTimeout(appUserMessageTimerRef.current);
      appUserMessageTimerRef.current = setTimeout(() => setAppUserMessage(null), 6000);
      return false;
    }
    // Auto-link: se si parte da un evento calendario, collegalo alla sessione corrente
    if (pendingLinkAppointmentRef.current) {
      const { id: aptId, subject: aptSubject } = pendingLinkAppointmentRef.current;
      db.linkSessionToEvent(aptId, newSessionId, aptSubject).catch(console.error);
      pendingLinkAppointmentRef.current = null;
    }
    if (pendingNoteHtml.trim()) {
      setBubbleNotes(initialSession.data.bubbleNotes);
      setPendingNoteHtml('');
    }
    return true;
  }, [resetAllDataStates, finalEffectiveTitle, pendingNoteHtml, appSettings, transcribedText, llmProcessedText, audioBlob, transLogic.transcriptionQueue.length]);

  // ── Stable handlers/props for memoized heavy children (A6/A7) ──────────────
  const handleStopPlayback = useCallback(() => transLogic.setPlaybackFile(null), [transLogic.setPlaybackFile]);
  const handleToggleAutoSave = useCallback(() => setIsAutoSaveEnabled(p => !p), []);
  const handleReset = useCallback(async () => { await resetAllDataStates(); audioRecorderRef.current?.resetRecording(); }, [resetAllDataStates]);
  const handleToggleAutoPipeline = useCallback((val: boolean) => patchSettings({ transcription: { ...appSettings.transcription, enableAutoPipeline: val } }), [appSettings.transcription, patchSettings]);
  const handleTakeScreenshot = useCallback((isAuto: boolean) => { audioRecorderRef.current?.handleTakeScreenshot(isAuto); setIsScreenSharing(audioRecorderRef.current?.getIsScreenSharing() ?? false); }, []);
  const handleDiarizationSettingChange = useCallback((v: boolean) => patchSettings({ transcription: { ...appSettings.transcription, attemptSpeakerDiarization: v } }), [appSettings.transcription, patchSettings]);
  const noop = useCallback(() => {}, []);
  const customInstructionsStable = useMemo(() => appSettings.customInstructions ?? [], [appSettings.customInstructions]);
  const systemPromptsStable = useMemo(() => appSettings.systemPrompts ?? [], [appSettings.systemPrompts]);

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
  // ── Meeting notifications + auto-start ───────────────────────────────────
  const {
    meetingToasts, meetingHistory, deleteMeetingHistoryItem, clearAllMeetingHistory,
    handleToastDismiss, handleToastSnooze, handleToastOpen,
    handleTestMeetingNotification, handleStartSessionForMeeting, handleStartSessionFromToast,
    pendingAutoStart, autoStartCountdownMs, handleAutoStartNow, handleAutoStartCancel,
    scheduleAutoStart,
  } = useMeetingFlow({ calAppointments, appSettings, audioRecorderRef, setIsCalendarOpen, handleOutlookImport });


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
      {/* Offline banner */}
      {!isOnline && (
        <div className="px-4 py-1.5 text-center text-xs" style={{ background: 'rgba(120,53,15,0.85)', borderBottom: '1px solid rgba(217,119,6,0.4)', color: '#fcd34d' }}>
          Modalità offline — Registrazione attiva · Trascrizione ripresa automaticamente al ripristino della connessione
        </div>
      )}
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
        onOpenNewCalendar={() => setIsNewCalendarOpen(true)}
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
            onStopPlayback={handleStopPlayback}
            viewingBubbleNoteId={viewingBubbleNoteId}
            recordingTitle={recordingTitle}
            onRecordingTitleChange={setRecordingTitle}
            recordingTimestampSuffix={recordingTimestampSuffix}
            onRecordingTimestampSuffixChange={setRecordingTimestampSuffix}
            isAutoSaveEnabled={isAutoSaveEnabled}
            onToggleAutoSave={handleToggleAutoSave}
            autoSaveCountdown={autoSaveCountdown}
            autoSaveInterval={appSettings.transcription.autoSaveIntervalSeconds ?? 10}
            onReset={handleReset}
            onLlmUsage={addLlmUsageStat}
            pipelineStep={pipelineStep}
            autoPipelineEnabled={appSettings.transcription.enableAutoPipeline ?? true}
            onToggleAutoPipeline={handleToggleAutoPipeline}
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
              onTakeScreenshot={handleTakeScreenshot}
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
              onDiarizationSettingChange={handleDiarizationSettingChange}
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
              customInstructions={customInstructionsStable}
              systemPrompts={systemPromptsStable}
              meetingTitle={recordingTitle}
              meetingAttendees={meetingAttendees}
              disabled={isBusy}
              audioDuration={audioBlob ? audioDuration : undefined}
              audioRecordingStartTime={audioRecordingStartTime}
              audioFileName={audioFileName}
              recordingTitle={finalEffectiveTitle}
              autoTrigger={llmAutoTrigger}
              isQuickProcessActive={pipelineStep === PipelineStep.ANALYZING}
              onQuickProcessComplete={noop}
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
              llmSettings={{ ...appSettings.llm, model: appSettings.llm.chatModel ?? appSettings.llm.model }}
              chatSystemInstruction={appSettings.systemPrompts?.find(p => p.id === 'chat-system')?.text}
              customInstructions={appSettings.customInstructions}
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
        onSaveCustomApiKey={saveCustomApiKey}
        onDeleteCustomApiKey={deleteCustomApiKey}
        handleSettingsChange={persistSettings}
        isStatisticsModalOpen={isStatisticsModalOpen} setIsStatisticsModalOpen={setIsStatisticsModalOpen}
        appStatistics={appStatistics}
        coherenceAssessment={coherenceAssessment} coherenceStatus={coherenceStatus}
        showLoadSessionModal={showLoadSessionModal} setShowLoadSessionModal={(v) => { setShowLoadSessionModal(v); if (!v) setSessionToPreview(undefined); }}
        savedSessions={savedSessions}
        initialViewSessionId={sessionToPreview}
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

      {isNewCalendarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="flex flex-col rounded-xl overflow-hidden shadow-2xl" style={{ width: '75vw', height: '75vh', background: 'rgb(17,24,39)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(17,24,39,0.95)' }}>
            <span className="text-sm font-semibold text-purple-300">NewCalendar</span>
            <button
              onClick={() => setIsNewCalendarOpen(false)}
              className="text-gray-400 hover:text-white transition-colors p-1 rounded"
              title="Chiudi"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-400">Caricamento…</div>}>
              <NewCalendarView
                events={calendarEventsDb}
                sessions={savedSessions}
                onLinkSession={handleLinkSessionToEvent}
                onUnlinkSession={handleUnlinkSessionFromEvent}
                onOpenSession={(sessionId) => {
                  setSessionToPreview(sessionId);
                  setShowLoadSessionModal(true);
                }}
                onLoadInfo={(eventId, title, noteHtml, attendees) => {
                  setIsNewCalendarOpen(false);
                  handleOutlookImport(title, noteHtml, attendees);
                  pendingLinkAppointmentRef.current = { id: eventId, subject: title };
                }}
                onLoadAndSchedule={(eventId, title, noteHtml, attendees, startIso) => {
                  setIsNewCalendarOpen(false);
                  handleOutlookImport(title, noteHtml, attendees);
                  pendingLinkAppointmentRef.current = { id: eventId, subject: title };
                  const startMs = new Date(startIso).getTime();
                  if (Number.isFinite(startMs)) scheduleAutoStart(startMs, title);
                }}
                onOpenTeamsAndRecord={(eventId, title, noteHtml, teamsUrl, attendees) => {
                  setIsNewCalendarOpen(false);
                  pendingLinkAppointmentRef.current = { id: eventId, subject: title };
                  handleOutlookOpenTeams(title, noteHtml, teamsUrl, attendees);
                }}
                onSync={() => fetchCalendarData(true, true)}
                isSyncing={calRefreshing}
                syncError={calError}
                calSource={calSource}
                calExtensionConnected={calExtensionConnected}
                calOutlookState={calOutlookState}
                lastSyncAt={lastSyncAt}
              />
            </Suspense>
          </div>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
      <NeoCalendarDayView
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        onImport={handleOutlookImport}
        onImportAndSchedule={(title, noteHtml, attendees, startIso, subject) => {
          handleOutlookImport(title, noteHtml, attendees);
          const startMs = new Date(startIso).getTime();
          if (Number.isFinite(startMs)) scheduleAutoStart(startMs, subject);
        }}
        onOpenTeamsAndRecord={handleOutlookOpenTeams}
        externalAppointments={calAppointments}
        externalBridgeAvailable={calBridgeAvailable}
        externalError={calError}
        isBackgroundRefreshing={calRefreshing}
        onRequestRefresh={() => fetchCalendarData(true)}
        extensionConnected={calExtensionConnected}
        calSource={calSource}
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
