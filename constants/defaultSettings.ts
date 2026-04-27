
import { AppSettings, CustomInstruction, SupportedLanguage, TranscriptionQuality, TranscriptionOutputFormat, Theme } from '../types';
import { LLM_PROVIDERS } from './appConfig';

export const DEFAULT_AUDIO_SETTINGS: AppSettings['audio'] = {
  bitrate: 128000,
  channels: "mono",
  enableAutoPause: true,
  autoPauseTimeoutSeconds: 10,
  autoPauseSensitivityDb: -20,
  enableEmotionAnalysis: false,
  echoCancellation: false, 
  autoManageEchoCancellation: true,
  echoCancellationStrength: "Standard",
  noiseSuppression: false, 
  autoGainControl: true,
};

export const DEFAULT_TRANSCRIPTION_SETTINGS: AppSettings['transcription'] = {
  language: "Italian" as SupportedLanguage,
  quality: TranscriptionQuality.LEVEL_3,
  outputFormat: TranscriptionOutputFormat.TXT,
  attemptSpeakerDiarization: false,
  approximateSpeakerCount: 0,
  includeDateTimeInText: false,
  enableAutoSave: false,
  autoSaveIntervalSeconds: 10,
  autoScreenshotIntervalSeconds: 60,
  enableChunkedRecording: true,
  chunkRecordingIntervalSeconds: 900, // Updated to 15 minutes (15 * 60)
  enableRealtimeTranscription: false,
  enableAutoPipeline: true,
  transcriptionEngine: 'gemini' as const,
  whisperModel: 'Xenova/whisper-tiny',
  liveModel: 'gemini-2.5-flash-native-audio-latest',
};

export const DEFAULT_LLM_SETTINGS: AppSettings['llm'] = {
  provider: 'Google',
  model: 'gemini-3-flash-preview',
  apiBaseUrl: '',
  customApiKey: '',
  customPromptInstruction: "Follow the user's custom instructions precisely.",
  enhanceWithWebSearch: false,
  maxRetries: 3,
  timeout: 600,
  rateLimitRequests: 15,
  rateLimitPeriodSeconds: 60,
  apiKeySource: 'system',
};

export const DEFAULT_APPEARANCE_SETTINGS: AppSettings['appearance'] = {
  theme: Theme.DARK,
};

export const DEFAULT_CUSTOM_INSTRUCTIONS: CustomInstruction[] = [];

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: DEFAULT_APPEARANCE_SETTINGS,
  audio: DEFAULT_AUDIO_SETTINGS,
  transcription: DEFAULT_TRANSCRIPTION_SETTINGS,
  llm: DEFAULT_LLM_SETTINGS,
  customInstructions: DEFAULT_CUSTOM_INSTRUCTIONS,
};
