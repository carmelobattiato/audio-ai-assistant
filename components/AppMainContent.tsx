
import React, { useRef } from 'react';
import { AudioRecorder } from './AudioRecorder';
import { TranscriptionView } from './TranscriptionView';
import { LlmProcessor, LlmProcessorRef } from './LlmProcessor';
import { 
  AppSettings, 
  BubbleNote, 
  RecordingState, 
  AudioRecorderRef, 
  EmotionEvent, 
  LlmUsageStats, 
  TextFileContent,
  PipelineStep
} from '../types';
import { StopIcon } from '../constants';
import { Button } from './common/Button';

interface AppMainContentProps {
  audioRecorderRef: React.RefObject<AudioRecorderRef>;
  setRecordingState: (state: RecordingState) => void;
  handleRecordingComplete: any;
  handleChunkComplete: any;
  handleRecordingStop: any;
  handleFilesSelected: any;
  handleRecordingSessionStart: any;
  appSettings: AppSettings;
  isBusy: boolean;
  isTextModeActive: boolean;
  audioDuration: number;
  setAudioDuration: (d: number) => void;
  bubbleNotes: BubbleNote[];
  setBubbleNotes: (n: BubbleNote[]) => void;
  handleOpenBubbleNote: (id: string) => void;
  pendingNoteHtml: string;
  setPendingNoteHtml: (h: string) => void;
  playbackUrl: string | null;
  loadedAudioUrl: string | null;
  emotionHistory: EmotionEvent[];
  viewingBubbleNoteId: string | null;
  recordingTitle: string;
  setRecordingTitle: (t: string) => void;
  recordingTimestampSuffix: string;
  setRecordingTimestampSuffix: (t: string) => void;
  isAutoSaveEnabled: boolean;
  onToggleAutoSave: () => void;
  autoSaveCountdown: number;
  addLlmUsageStat: (s: LlmUsageStats) => void;
  resetAllDataStates: any;
  audioBlob: Blob | null;
  audioFileName: string;
  handleDiarizationSettingChange: any;
  audioRecordingStartTime: Date | null;
  handleTextFileProcessed: any;
  isAudioModeActive: boolean;
  uploadedTextFileContent: TextFileContent | null;
  activeSourceText: string;
  handleStartTranscription: any;
  onStopTranscription: () => void;
  isTranscribing: boolean;
  transcriptionError: string | null;
  setTranscribedText: (t: string) => void;
  transcriptionQueue: any[];
  handleReorderQueue: any;
  handleRemoveFromQueue: any;
  transcriptionProgress: any;
  handleSelectPlaybackFile: any;
  playbackFile: any;
  llmProcessedText: string;
  llmProcessingType: string;
  handleLlmProcessingComplete: any;
  handleLlmResultUpdateFromEditor: any;
  pipelineStep: PipelineStep;
  llmAutoTrigger: number;
  handleLlmProcessingError: (err: string) => void;
  autoPipelineEnabled: boolean;
  onToggleAutoPipeline: (val: boolean) => void;
  chunksCount: number;
}

export const AppMainContent: React.FC<AppMainContentProps> = (props) => {
  const llmProcessorRef = useRef<LlmProcessorRef>(null);

  const handleStopCurrentOperation = () => {
    if (props.pipelineStep === PipelineStep.TRANSCRIBING) {
      props.onStopTranscription();
    } else if (props.pipelineStep === PipelineStep.ANALYZING) {
      llmProcessorRef.current?.stopProcessing();
    }
  };

  const steps = [
    { key: PipelineStep.RECORDING,   label: 'Recording' },
    { key: PipelineStep.TRANSCRIBING, label: 'Transcribing' },
    { key: PipelineStep.ANALYZING,   label: 'AI Analysis' },
    { key: PipelineStep.DOWNLOADING, label: 'Download Session' },
    { key: PipelineStep.COMPLETED,   label: 'Completed' }
  ];

  const getStatusColor = (s: PipelineStep) => {
    if (props.pipelineStep === PipelineStep.COMPLETED && s === PipelineStep.COMPLETED) return 'bg-emerald-500 text-white';
    if (props.pipelineStep === s) return 'bg-sky-500 text-white animate-pulse';
    const index = steps.findIndex(x => x.key === s);
    const currentIndex = steps.findIndex(x => x.key === props.pipelineStep);
    return index < currentIndex ? 'bg-emerald-900 text-emerald-100' : 'bg-gray-700 text-gray-500';
  };

  const showStopButton = (props.pipelineStep === PipelineStep.TRANSCRIBING || props.pipelineStep === PipelineStep.ANALYZING);

  return (
    <main className="w-full max-w-5xl space-y-6 sm:space-y-8">
      {props.pipelineStep !== PipelineStep.IDLE && (
        <div className="w-full flex flex-col items-center gap-4 mb-4 bg-gray-800/50 p-4 rounded-xl border border-gray-700">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {steps.map((s, i) => (
              <React.Fragment key={s.key}>
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${getStatusColor(s.key)}`}>
                  {s.label}
                </div>
                {i < steps.length - 1 && <div className="h-0.5 w-4 bg-gray-700"></div>}
              </React.Fragment>
            ))}
          </div>
          
          {showStopButton && (
            <Button 
              variant="danger" 
              size="sm" 
              onClick={handleStopCurrentOperation}
              leftIcon={<StopIcon className="w-4 h-4" />}
              className="animate-bounce shadow-lg shadow-red-500/20"
            >
              Stop Current Operation
            </Button>
          )}
        </div>
      )}
      
      <AudioRecorder 
        ref={props.audioRecorderRef}
        onRecordingStateChange={props.setRecordingState}
        onRecordingComplete={props.handleRecordingComplete}
        onChunkComplete={props.handleChunkComplete}
        onRecordingStop={props.handleRecordingStop}
        onFilesSelected={props.handleFilesSelected}
        onRecordingSessionStart={props.handleRecordingSessionStart}
        audioSettings={props.appSettings.audio}
        transcriptionSettings={props.appSettings.transcription}
        llmSettings={props.appSettings.llm}
        disabled={props.isBusy || props.isTextModeActive} 
        onAudioDurationChange={props.setAudioDuration}
        audioDuration={props.audioDuration}
        bubbleNotes={props.bubbleNotes}
        onBubbleNotesChange={props.setBubbleNotes}
        onOpenBubbleNote={props.handleOpenBubbleNote}
        pendingNoteHtml={props.pendingNoteHtml}
        onPendingNoteHtmlChange={props.setPendingNoteHtml}
        externalAudioUrl={props.playbackUrl || props.loadedAudioUrl}
        emotionHistory={props.emotionHistory}
        viewingBubbleNoteId={props.viewingBubbleNoteId}
        recordingTitle={props.recordingTitle}
        onRecordingTitleChange={props.setRecordingTitle}
        recordingTimestampSuffix={props.recordingTimestampSuffix}
        onRecordingTimestampSuffixChange={props.setRecordingTimestampSuffix}
        isAutoSaveEnabled={props.isAutoSaveEnabled}
        onToggleAutoSave={props.onToggleAutoSave}
        autoSaveCountdown={props.autoSaveCountdown}
        autoSaveInterval={props.appSettings.transcription.autoSaveIntervalSeconds ?? 10}
        onReset={async () => { await props.resetAllDataStates(); props.audioRecorderRef.current?.resetRecording(); }}
        onLlmUsage={props.addLlmUsageStat}
        pipelineStep={props.pipelineStep}
        autoPipelineEnabled={props.autoPipelineEnabled}
        onToggleAutoPipeline={props.onToggleAutoPipeline}
        chunksCount={props.chunksCount}
    />
    <TranscriptionView
        audioBlob={props.audioBlob}
        audioFileName={props.audioFileName}
        recordingTitle={props.recordingTitle.trim() ? `${props.recordingTitle}_${props.recordingTimestampSuffix}` : `Session_${props.recordingTimestampSuffix}`}
        settings={props.appSettings.transcription} 
        llmSettings={props.appSettings.llm}
        disabled={props.isBusy}
        onDiarizationSettingChange={props.handleDiarizationSettingChange}
        audioRecordingStartTime={props.audioRecordingStartTime}
        onTextFileProcessed={props.handleTextFileProcessed} 
        isAudioModeActive={props.isAudioModeActive} 
        isTextModeActive={props.isTextModeActive} 
        uploadedTextFileContentForDisplay={props.uploadedTextFileContent} 
        activeSourceText={props.activeSourceText}
        onTranscribe={props.handleStartTranscription}
        onStopTranscription={props.onStopTranscription}
        isTranscribing={props.isTranscribing}
        transcriptionError={props.transcriptionError}
        onTranscriptionChange={props.setTranscribedText}
        transcriptionQueue={props.transcriptionQueue}
        onReorderQueue={props.handleReorderQueue}
        onRemoveFromQueue={props.handleRemoveFromQueue}
        transcriptionProgress={props.transcriptionProgress}
        onSelectPlaybackFile={props.handleSelectPlaybackFile}
        currentlyPlayingFile={props.playbackFile?.file ?? null}
        isRealtimeTranscriptAvailable={!!(props.appSettings.transcription.enableRealtimeTranscription && props.activeSourceText && props.audioBlob)}
    />
    
    <LlmProcessor
        ref={llmProcessorRef}
        sourceText={props.activeSourceText} 
        bubbleNotes={props.bubbleNotes} 
        onProcessingComplete={props.handleLlmProcessingComplete} 
        currentLlmResult={props.llmProcessedText} 
        onLlmResultUpdate={props.handleLlmResultUpdateFromEditor} 
        settings={props.appSettings.llm}
        transcriptionSettings={props.appSettings.transcription}
        transcriptionLanguage={props.appSettings.transcription.language}
        customInstructions={props.appSettings.customInstructions ?? []}
        disabled={props.isBusy}
        audioDuration={props.audioBlob ? props.audioDuration : undefined}
        audioRecordingStartTime={props.audioRecordingStartTime}
        audioFileName={props.audioFileName}
        recordingTitle={props.recordingTitle.trim() ? `${props.recordingTitle}_${props.recordingTimestampSuffix}` : `Session_${props.recordingTimestampSuffix}`}
        autoTrigger={props.llmAutoTrigger}
        isQuickProcessActive={props.pipelineStep === PipelineStep.ANALYZING}
        onQuickProcessComplete={() => {}}
        onProcessingError={props.handleLlmProcessingError}
        resultType={props.llmProcessingType}
    />
  </main>
  );
};
