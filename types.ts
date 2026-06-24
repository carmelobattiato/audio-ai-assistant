
// types.ts
import React from 'react';

export type AutoPauseState = 'inactive' | 'listening' | 'warning' | 'auto-paused';

export interface ProcessedResult {
  id: string;
  type: string;
  contentHtml: string;
  timestamp: number;
}

export enum RecordingState {
  IDLE = "IDLE",
  RECORDING = "RECORDING",
  STOPPED = "STOPPED",
  PROCESSING = "PROCESSING",
}

export enum PipelineStep {
  IDLE = "IDLE",
  RECORDING = "RECORDING",
  TRANSCRIBING = "TRANSCRIBING",
  ANALYZING = "ANALYZING",
  DOWNLOADING = "DOWNLOADING",
  COMPLETED = "COMPLETED",
  ERROR = "ERROR"
}

export type SessionStatus = 'In Progress' | 'Success' | 'Failed' | 'Interrupted';

export interface AudioRecorderRef {
  getAudioSnapshot: () => Promise<{
    mixedBlob: Blob | null;
    micBlob: Blob | null;
    appBlob: Blob | null;
    elapsedTime: number;
  }>;
  resetRecording: () => void;
  getRecordingSessionId: () => string | null;
  triggerSystemAudioGuide: () => void;
  handleTakeScreenshot: (isAutomatic: boolean) => void;
  getIsScreenSharing: () => boolean;
  startMicOnly: () => void;
  continueRecording: () => void;
}

export interface AudioRecorderProps {
  audioSettings: AudioSettings;
  transcriptionSettings: TranscriptionSettings;
  llmSettings: LlmSettings;
  onRecordingStateChange: (state: RecordingState) => void;
  onRecordingComplete: (blob: Blob, filename: string, startTime: Date | null) => void;
  onChunkComplete?: (chunk: Blob, chunkIndex: number) => void;
  onRecordingStop?: (sessionId: string, wasChunked: boolean, finalTranscript?: string | null) => void | Promise<void>;
  onFilesSelected: (files: File[]) => void;
  onRecordingSessionStart: () => void | Promise<boolean | void>;
  disabled?: boolean;
  onAudioDurationChange: (duration: number) => void;
  audioDuration: number;
  bubbleNotes: BubbleNote[];
  onBubbleNotesChange: (notes: BubbleNote[]) => void;
  onOpenBubbleNote: (noteId: string) => void;
  pendingNoteHtml: string;
  onPendingNoteHtmlChange: (html: string) => void;
  externalAudioUrl: string | null;
  onStopPlayback?: () => void;
  viewingBubbleNoteId?: string | null;
  recordingTitle: string;
  onRecordingTitleChange: (title: string) => void;
  isAutoSaveEnabled: boolean;
  onToggleAutoSave: () => void;
  autoSaveCountdown: number;
  autoSaveInterval: number;
  onReset: () => void;
  onLlmUsage?: (stats: LlmUsageStats) => void;
  pipelineStep?: PipelineStep;
  autoPipelineEnabled: boolean;
  onToggleAutoPipeline: (val: boolean) => void;
  chunksCount: number; // Counter for UI
}

export interface UseAudioRecorderOptions {
  settings: AudioSettings;
  llmSettings: LlmSettings;
  onChunkComplete?: (chunk: Blob, chunkIndex: number) => void;
  onRecordingStop?: (sessionId: string, wasChunked: boolean, finalTranscript?: string | null) => void | Promise<void>;
  onAutoStopNotify?: () => void;
  enableChunkedRecording?: boolean;
  chunkIntervalSeconds?: number;
  enableRealtimeTranscription?: boolean;
  liveModel?: string;
  onLlmUsage?: (stats: LlmUsageStats) => void;
  onAutoSave?: (recorderState: Readonly<UseAudioRecorderResult>, componentState: { includeAppAudio: boolean }) => void;
  initialState?: Partial<UseAudioRecorderResult>;
}

export interface UseAudioRecorderResult {
  recordingState: RecordingState;
  startRecording: (includeAppAudio: boolean) => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  audioBlob: Blob | null;
  micAnalyserNodeRef: React.MutableRefObject<AnalyserNode | null>;
  appAudioAnalyserNodeRef: React.MutableRefObject<AnalyserNode | null>;
  resetRecording: () => void;
  error: string | null;
  elapsedTime: number;
  isPaused: boolean;
  displayStream: MediaStream | null;
  getAudioSnapshot: () => Promise<{ mixedBlob: Blob | null; micBlob: Blob | null; appBlob: Blob | null; elapsedTime: number }>;
  getRecordingSessionId: () => string | null;
  isAutoPaused: boolean;
  autoPauseState: AutoPauseState;
  autoPauseCountdown: number;
  autoStopCountdown: number;
  isAutoStopWarning: boolean;
  isAutoStopNotified: boolean;
  realtimeTranscription: string;
  addAppAudio: () => Promise<void>;
  isAppAudioActive: boolean;
  isMicEnabled: boolean;
  toggleMic: () => void;
  forceNewChunk: () => void;
  chunkStartElapsedTime: number;
}

export enum TranscriptionQuality {
  LEVEL_1 = "Level 1 (Fastest, Basic)",
  LEVEL_2 = "Level 2 (Faster, Good)",
  LEVEL_3 = "Level 3 (Balanced)",
  LEVEL_4 = "Level 4 (Better, Detailed)",
  LEVEL_5 = "Level 5 (Best, Slower)",
}

export type SupportedLanguage = "English" | "Italian";

export enum TranscriptionOutputFormat {
  TXT = "txt",
  SRT = "srt",
  CSV = "csv",
  HTML = "html",
}

export type EchoStrength = "Standard" | "Enhanced" | "Aggressive" | "Ultra (Voice Calibrated)";

export type WaveformStyle = 'spectrum' | 'oscilloscope';

export interface AudioSettings {
  bitrate: number;
  channels: "mono" | "stereo";
  enableAutoPause: boolean;
  autoPauseTimeoutSeconds: number;
  autoPauseSensitivityDb: number;
  echoCancellation: boolean;
  autoManageEchoCancellation: boolean;
  echoCancellationStrength: EchoStrength;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  waveformStyle?: WaveformStyle;
  enableAutoStop: boolean;
  autoNotifyAfterPausedMinutes: number;
  autoStopAfterPausedMinutes: number;
  autoStopWarningSeconds: number;
}

export interface TranscriptionSettings {
  language: SupportedLanguage;
  quality: TranscriptionQuality;
  outputFormat: TranscriptionOutputFormat;
  attemptSpeakerDiarization: boolean;
  approximateSpeakerCount: number;
  fileName?: string; 
  includeDateTimeInText?: boolean;
  enableAutoSave?: boolean;
  autoSaveIntervalSeconds?: number;
  autoScreenshotIntervalSeconds?: number;
  enableChunkedRecording?: boolean;
  chunkRecordingIntervalSeconds?: number;
  enableRealtimeTranscription?: boolean;
  enableAutoPipeline?: boolean;
  liveModel?: string;
  autoTranscribeChunks?: boolean;
}

export interface BubbleNote {
  id: string;
  contentHtml: string;
  timestamp: number; 
  recordingElapsedTime: number; 
  isEditing: boolean;
  isProcessing: boolean;
}

export interface ModelInfo {
  name: string;
  specialization: string;
  cost: string;
  releaseDate: string;
  recommendedFor?: ('analysis' | 'transcription' | 'chat')[];
}

export interface LlmSettings {
  provider: string;
  model: string;
  transcriptionModel?: string;
  chatModel?: string;
  apiBaseUrl: string;
  customApiKey?: string;
  /** Resolved in-memory only — never persisted to localStorage. */
  googleApiKey?: string;
  customPromptInstruction: string;
  enhanceWithWebSearch: boolean;
  maxRetries?: number;
  timeout?: number;
  rateLimitRequests?: number;
  rateLimitPeriodSeconds?: number;
  /** 'system' = use process.env.API_KEY; 'custom' = use key encrypted in IndexedDB. */
  apiKeySource?: 'system' | 'custom';
}

export enum Theme {
  DARK = 'dark',
  LIGHT = 'light',
  DARK_GREY = 'dark-grey',
}

export enum LogLevel {
  TRACE = 'TRACE',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  event: string;
  message: string;
  appVersion: string;
  env: string;
  route: string;
  correlationId: string;
  sessionId: string;
  userIdHash?: string;
  feature?: string;
  step?: string;
  durationMs?: number;
  errorCode?: string;
  httpStatus?: number;
  retryCount?: number;
  device: {
    browser: string;
    os: string;
  };
  network: {
    online: boolean;
    effectiveType?: string;
  };
  context?: Record<string, unknown>;
}

export interface AppearanceSettings {
  theme: Theme;
  userEmail: string;
  meetingNotificationsEnabled: boolean;
  meetingNotificationLeadMinutes: number;
  githubRepoUrl: string;
}

export interface CustomInstruction {
  id: string;
  name: string;
  text: string;
  enabled: boolean;
}

export interface SystemPrompt {
  id: string;
  name: string;
  description: string;
  category: 'transcription' | 'analysis' | 'system' | 'chat';
  text: string;
  defaultText: string;
}

export interface AppSettings {
  appearance: AppearanceSettings;
  audio: AudioSettings;
  transcription: TranscriptionSettings;
  llm: LlmSettings;
  customInstructions: CustomInstruction[];
  systemPrompts: SystemPrompt[];
}

export interface GroundingChunkWeb {
  uri?: string;
  title?: string;
}

export interface GroundingChunk {
  web?: GroundingChunkWeb;
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  searchQueries?: string[];
}

export interface TextFileContent {
  name: string;
  type: string;
  textContent: string | null;
  error?: string;
  uploadTime?: Date; 
}

export interface AudioDetails {
  format: string;
  duration: number;
  size: number;
  sampleRate?: number; 
  channels: "mono" | "stereo";
  bitrate: number; 
}

export interface TextStats {
  characterCount: number;
  wordCount: number;
  estimatedTokenCount: number;
  size: number; 
}

export interface LlmUsageStats {
  functionName: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  timestamp: number;
}

export interface AppStatistics {
  audioDetails: AudioDetails | null;
  transcriptionStats: TextStats | null;
  llmResultStats: TextStats | null;
  llmUsageHistory?: LlmUsageStats[];
  participantCount?: string | number; 
  overallCoherence?: string; 
  recordingTimestamp?: string; 
}

export enum CoherenceAssessmentStatus {
  IDLE = "IDLE",
  LOADING = "LOADING",
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
}

export interface CustomQuickAction {
  id: string;
  title: string;
  promptTemplate: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: number;
    target?: 'transcription' | 'llm_result';
}

export interface MeetingChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface SavedSessionData {
  audioBlob: Blob | null;
  chunks?: Blob[]; // Added for real-time saving
  audioFileName: string;
  audioDuration: number;
  audioRecordingStartTime: Date | null;
  bubbleNotes: BubbleNote[];
  transcribedText: string;
  uploadedTextFileContent: TextFileContent | null;
  llmProcessedText: string;
  llmProcessingType: string;
  settings: AppSettings;
  llmUsageHistory?: LlmUsageStats[];
  llmResultsHistory?: ProcessedResult[];
  meetingChatHistory?: MeetingChatMessage[];
  linkedCalendarEventId?: string;
  linkedCalendarEventSubject?: string;
}

export interface SavedSession {
  id: string; 
  name: string;
  timestamp: number;
  status: SessionStatus; // Added
  totalSizeMb: number; // Added
  data: SavedSessionData;
}

export interface InProgressSessionData {
  id: 'in_progress'; 
  data: {
    recordingSessionId: string;
    elapsedTime: number;
    recordingTitle: string;
    bubbleNotes: BubbleNote[];
    pendingNoteHtml: string;
    recordingStartTime: Date | null;
    includeAppAudio: boolean;
    mimeType: string;
    settings: AppSettings;
  }
}

export interface IcsAppointment {
  id: string;
  subject: string;
  start: string; // ISO
  end: string;
  location?: string;
  description?: string;
  organizer?: string;
  attendees?: string[];
  isCancelled?: boolean;
  isRecurring?: boolean;
}

export interface Calendar2Settings {
  icsUrl: string;
}

export interface Attendee {
  name: string;
  email: string;
  type?: 'required' | 'optional';
}

export interface CalendarEventRecord {
  id: string;
  subject: string;
  start: string;                 // ISO 8601
  end: string;
  location?: string;
  organizer?: string;
  attendees?: Attendee[];
  onlineMeetingUrl?: string;
  body?: string;
  responseStatus?: string;
  source: 'windows' | 'ics' | 'extension';
  linkedSessionId?: string;      // FK → sessions.id
  createdAt: number;             // epoch ms (per cleanup)
}

export interface SessionEmbedding {
  sessionId: string;
  vector: number[];
  textSnippet: string;
  generatedAt: number;
}

export interface StorageStats {
  totalMb: number;
  audioMb: number;
  textMb: number;
  embeddingsMb: number;
  sessionCount: number;
  sessionWithAudioCount: number;
  calendarEventCount: number;
}

