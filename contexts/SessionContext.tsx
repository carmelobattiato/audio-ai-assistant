import React, { createContext, useContext, useState, useCallback } from 'react';
import { db } from '../utils/db';
import { getCurrentTimestampSuffix } from '../utils/textUtils';
import type { Attendee } from '../components/OutlookCalendarModal';
import {
  CoherenceAssessmentStatus,
  RecordingState,
  PipelineStep,
} from '../types';
import type {
  TextFileContent,
  SavedSession,
  BubbleNote,
  LlmUsageStats,
  ProcessedResult,
  MeetingChatMessage,
} from '../types';

// ── State interface ────────────────────────────────────────────────────────────

interface SessionState {
  // Audio / recording
  audioBlob: Blob | null;
  audioFileName: string;
  audioDuration: number;
  audioRecordingStartTime: Date | null;
  uploadedTextFileContent: TextFileContent | null;
  recordingChunks: Blob[];
  recordingState: RecordingState;
  recordingTitle: string;
  recordingTimestampSuffix: string;
  isAutoSaveEnabled: boolean;
  autoSaveCountdown: number;
  recordingElapsedTime: number;
  isScreenSharing: boolean;
  meetingAttendees: Attendee[];
  // Session content
  bubbleNotes: BubbleNote[];
  pendingNoteHtml: string;
  transcribedText: string;
  activeSourceText: string;
  llmProcessedText: string;
  llmProcessingType: string;
  llmUsageHistory: LlmUsageStats[];
  llmResultsHistory: ProcessedResult[];
  meetingChatHistory: MeetingChatMessage[];
  coherenceAssessment: string | null;
  coherenceStatus: CoherenceAssessmentStatus;
  // Pipeline FSM
  pipelineStep: PipelineStep;
  llmAutoTrigger: number;
  // Persisted sessions list
  savedSessions: SavedSession[];
}

// ── Context value ─────────────────────────────────────────────────────────────

interface SessionCtxValue extends SessionState {
  setAudioBlob: (v: Blob | null) => void;
  setAudioFileName: (v: string) => void;
  setAudioDuration: (v: number) => void;
  setAudioRecordingStartTime: (v: Date | null) => void;
  setUploadedTextFileContent: (v: TextFileContent | null) => void;
  setRecordingChunks: React.Dispatch<React.SetStateAction<Blob[]>>;
  setRecordingState: (v: RecordingState) => void;
  setRecordingTitle: (v: string) => void;
  setRecordingTimestampSuffix: (v: string) => void;
  setIsAutoSaveEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoSaveCountdown: (v: number) => void;
  setRecordingElapsedTime: (v: number) => void;
  setIsScreenSharing: (v: boolean) => void;
  setMeetingAttendees: (v: Attendee[]) => void;
  setBubbleNotes: React.Dispatch<React.SetStateAction<BubbleNote[]>>;
  setPendingNoteHtml: (v: string) => void;
  setTranscribedText: React.Dispatch<React.SetStateAction<string>>;
  setActiveSourceText: (v: string) => void;
  setLlmProcessedText: (v: string) => void;
  setLlmProcessingType: (v: string) => void;
  setLlmUsageHistory: React.Dispatch<React.SetStateAction<LlmUsageStats[]>>;
  setLlmResultsHistory: React.Dispatch<React.SetStateAction<ProcessedResult[]>>;
  setMeetingChatHistory: React.Dispatch<React.SetStateAction<MeetingChatMessage[]>>;
  setCoherenceAssessment: (v: string | null) => void;
  setCoherenceStatus: (v: CoherenceAssessmentStatus) => void;
  setPipelineStep: (v: PipelineStep) => void;
  setLlmAutoTrigger: React.Dispatch<React.SetStateAction<number>>;
  setSavedSessions: (v: SavedSession[]) => void;
  // Compound actions
  resetSession: (opts?: { preserveBubbleNotes?: boolean }) => void;
  fetchSessions: () => Promise<void>;
  addLlmUsageStat: (stat: Omit<LlmUsageStats, 'timestamp'>) => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const SessionContext = createContext<SessionCtxValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('');
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [audioRecordingStartTime, setAudioRecordingStartTime] = useState<Date | null>(null);
  const [uploadedTextFileContent, setUploadedTextFileContent] = useState<TextFileContent | null>(null);
  const [recordingChunks, setRecordingChunks] = useState<Blob[]>([]);
  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [recordingTitle, setRecordingTitle] = useState<string>('');
  const [recordingTimestampSuffix, setRecordingTimestampSuffix] = useState<string>(getCurrentTimestampSuffix());
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(false);
  const [autoSaveCountdown, setAutoSaveCountdown] = useState(10);
  const [recordingElapsedTime, setRecordingElapsedTime] = useState<number>(0);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [meetingAttendees, setMeetingAttendees] = useState<Attendee[]>([]);
  const [bubbleNotes, setBubbleNotes] = useState<BubbleNote[]>([]);
  const [pendingNoteHtml, setPendingNoteHtml] = useState<string>('');
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [activeSourceText, setActiveSourceText] = useState<string>('');
  const [llmProcessedText, setLlmProcessedText] = useState<string>('');
  const [llmProcessingType, setLlmProcessingType] = useState<string>('');
  const [llmUsageHistory, setLlmUsageHistory] = useState<LlmUsageStats[]>([]);
  const [llmResultsHistory, setLlmResultsHistory] = useState<ProcessedResult[]>([]);
  const [meetingChatHistory, setMeetingChatHistory] = useState<MeetingChatMessage[]>([]);
  const [coherenceAssessment, setCoherenceAssessment] = useState<string | null>(null);
  const [coherenceStatus, setCoherenceStatus] = useState<CoherenceAssessmentStatus>(CoherenceAssessmentStatus.IDLE);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>(PipelineStep.IDLE);
  const [llmAutoTrigger, setLlmAutoTrigger] = useState<number>(0);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);

  const resetSession = useCallback((opts?: { preserveBubbleNotes?: boolean }) => {
    setAudioBlob(null);
    setAudioFileName('');
    setAudioDuration(0);
    setAudioRecordingStartTime(null);
    setUploadedTextFileContent(null);
    setTranscribedText('');
    setActiveSourceText('');
    if (!opts?.preserveBubbleNotes) {
      setBubbleNotes([]);
      setRecordingTitle('');
      setRecordingTimestampSuffix(getCurrentTimestampSuffix());
    }
    setLlmProcessedText('');
    setLlmProcessingType('');
    setLlmUsageHistory([]);
    setLlmResultsHistory([]);
    setMeetingChatHistory([]);
    setCoherenceAssessment(null);
    setCoherenceStatus(CoherenceAssessmentStatus.IDLE);
    setPipelineStep(PipelineStep.IDLE);
    setRecordingChunks([]);
  }, []);

  const fetchSessions = useCallback(async () => {
    const sessions = await db.getAllSessions();
    setSavedSessions(sessions);
  }, []);

  const addLlmUsageStat = useCallback((stat: Omit<LlmUsageStats, 'timestamp'>) => {
    setLlmUsageHistory(prev => [...prev, { ...stat, timestamp: Date.now() }]);
  }, []);

  return (
    <SessionContext.Provider value={{
      audioBlob, audioFileName, audioDuration, audioRecordingStartTime,
      uploadedTextFileContent, recordingChunks,
      recordingState, recordingTitle, recordingTimestampSuffix,
      isAutoSaveEnabled, autoSaveCountdown, recordingElapsedTime, isScreenSharing, meetingAttendees,
      bubbleNotes, pendingNoteHtml, transcribedText, activeSourceText,
      llmProcessedText, llmProcessingType, llmUsageHistory, llmResultsHistory,
      meetingChatHistory, coherenceAssessment, coherenceStatus,
      pipelineStep, llmAutoTrigger, savedSessions,
      setAudioBlob, setAudioFileName, setAudioDuration, setAudioRecordingStartTime,
      setUploadedTextFileContent, setRecordingChunks,
      setRecordingState, setRecordingTitle, setRecordingTimestampSuffix,
      setIsAutoSaveEnabled, setAutoSaveCountdown, setRecordingElapsedTime, setIsScreenSharing, setMeetingAttendees,
      setBubbleNotes, setPendingNoteHtml, setTranscribedText, setActiveSourceText,
      setLlmProcessedText, setLlmProcessingType, setLlmUsageHistory, setLlmResultsHistory,
      setMeetingChatHistory, setCoherenceAssessment, setCoherenceStatus,
      setPipelineStep, setLlmAutoTrigger, setSavedSessions,
      resetSession, fetchSessions, addLlmUsageStat,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useSession(): SessionCtxValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
