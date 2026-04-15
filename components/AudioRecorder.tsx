
import React, { useRef, useCallback, useState, useEffect, useImperativeHandle, useMemo } from 'react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useRecorderPlayer } from '../hooks/recorder/useRecorderPlayer';
import { useScreenshotHandler } from '../hooks/recorder/useScreenshotHandler';
import { AudioVisualizerCanvas } from './AudioVisualizerCanvas';
import { BubbleNotes } from './BubbleNotes';
import { RecorderPlayerUI } from './recorder/RecorderPlayerUI';
import { RecorderStatus } from './recorder/RecorderStatus';
import { RecorderActions } from './recorder/RecorderActions';
import { Input } from './common/Input';
import { RecordingState, BubbleNote, AudioRecorderRef, Emotion, EmotionEvent, AudioRecorderProps } from '../types';
import { saveBlobToFile } from '../utils/fileUtils';

const emotionColorStyles: Record<Emotion, string> = {
    'Joy': 'border-yellow-400 shadow-yellow-400/40', 'Surprise': 'border-orange-500 shadow-orange-500/40',
    'Anticipation': 'border-orange-400 shadow-orange-400/40', 'Trust': 'border-sky-400 shadow-sky-400/40',
    'Neutral': 'border-cyan-400 shadow-cyan-400/40', 'Sadness': 'border-blue-400 shadow-blue-400/40',
    'Fear': 'border-violet-500 shadow-violet-500/40', 'Disgust': 'border-lime-500 shadow-lime-500/40',
    'Anger': 'border-red-500 shadow-red-500/40', 'Unknown': 'border-gray-600 shadow-gray-600/30',
};

// Extended props to handle the split title
interface ExtendedAudioRecorderProps extends AudioRecorderProps {
    recordingTimestampSuffix: string;
    onRecordingTimestampSuffixChange: (t: string) => void;
}

export const AudioRecorder = React.forwardRef<AudioRecorderRef, ExtendedAudioRecorderProps>((props, ref) => {
  const {
    recordingState, startRecording, stopRecording, pauseRecording, resumeRecording,
    isPaused, audioBlob, micAnalyserNodeRef, appAudioAnalyserNodeRef,
    resetRecording, error, elapsedTime, displayStream, getAudioSnapshot, getRecordingSessionId,
    isAutoPaused, autoPauseState, autoPauseCountdown, realtimeTranscription,
    currentEmotion, emotionHistory: recorderEmotionHistory, addAppAudio, isAppAudioActive, isMicEnabled, toggleMic,
  } = useAudioRecorder({ 
    settings: props.audioSettings, llmSettings: props.llmSettings, onChunkComplete: props.onChunkComplete,
    onRecordingStop: props.onRecordingStop, enableChunkedRecording: props.transcriptionSettings.enableChunkedRecording,
    chunkIntervalSeconds: props.transcriptionSettings.chunkRecordingIntervalSeconds,
    enableRealtimeTranscription: props.transcriptionSettings.enableRealtimeTranscription, onLlmUsage: props.onLlmUsage,
  });

  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);
  const finalAudioUrl = props.externalAudioUrl || localAudioUrl;
  const elapsedTimeRef = useRef(elapsedTime);
  useEffect(() => { elapsedTimeRef.current = elapsedTime; }, [elapsedTime]);

  const player = useRecorderPlayer({ 
    finalAudioUrl, audioDuration: props.audioDuration, onAudioDurationChange: props.onAudioDurationChange 
  });
  
  const screenshots = useScreenshotHandler(
    displayStream, props.bubbleNotes, props.onBubbleNotesChange, 
    props.pendingNoteHtml, props.onPendingNoteHtmlChange, elapsedTimeRef
  );

  const [currentFileName, setCurrentFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [guideKey, setGuideKey] = useState(0);
  useImperativeHandle(ref, () => ({
    getAudioSnapshot,
    resetRecording,
    getRecordingSessionId,
    triggerSystemAudioGuide: () => setGuideKey(k => k + 1),
  }), [getAudioSnapshot, resetRecording, getRecordingSessionId]);

  // Combined title for internal usage and preview
  const fullTitle = useMemo(() => {
    const base = props.recordingTitle.trim() || "Session";
    return `${base}_${props.recordingTimestampSuffix}`;
  }, [props.recordingTitle, props.recordingTimestampSuffix]);

  // Effect to call onRecordingComplete when recording stops and blob is ready
  useEffect(() => {
    if (recordingState === RecordingState.STOPPED && audioBlob && !props.transcriptionSettings.enableChunkedRecording) {
      const ext = audioBlob.type.split('/')[1]?.split(';')[0] || 'webm';
      const fileName = `${fullTitle}.${ext}`;
      props.onRecordingComplete(audioBlob, fileName, null, recorderEmotionHistory);
    }
  }, [recordingState, audioBlob, props.transcriptionSettings.enableChunkedRecording, fullTitle, recorderEmotionHistory]);

  useEffect(() => {
    if (audioBlob && !props.transcriptionSettings.enableChunkedRecording) {
      const url = URL.createObjectURL(audioBlob);
      setLocalAudioUrl(url);
      const ext = audioBlob.type.split('/')[1]?.split(';')[0] || 'webm';
      setCurrentFileName(`${fullTitle}.${ext}`);
      return () => URL.revokeObjectURL(url);
    }
  }, [audioBlob, props.transcriptionSettings.enableChunkedRecording, fullTitle]);

  const handleStartFlow = (app: boolean) => {
    props.onRecordingSessionStart();
    startRecording(app);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = (Array.from(e.target.files || []) as File[]).filter(f => f.type.startsWith('audio/'));
    if (files.length) props.onFilesSelected(files);
  };

  const emotionGlow = recordingState === RecordingState.RECORDING && !isPaused && props.audioSettings.enableEmotionAnalysis 
    ? `border-2 shadow-lg rounded-lg ${emotionColorStyles[currentEmotion]}` : 'border-2 border-transparent';

  const chunkInterval = props.transcriptionSettings.chunkRecordingIntervalSeconds || 1800;
  const currentChunkCountdown = chunkInterval - (elapsedTime % chunkInterval);

  return (
    <div className={`p-4 bg-gray-800 rounded-lg shadow-lg space-y-4 transition-all duration-500 ${emotionGlow}`}>
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-sky-400">Audio Input</h3>
        {recordingState === RecordingState.RECORDING && !isPaused && props.audioSettings.enableEmotionAnalysis && <div className="text-sm font-medium text-gray-300 capitalize">Tone: {currentEmotion}</div>}
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input 
            label="Session Name:" 
            id="recordingTitle" 
            value={props.recordingTitle} 
            onChange={(e) => props.onRecordingTitleChange(e.target.value)} 
            placeholder="e.g., Marketing Meeting (Leave blank for default)"
            disabled={props.disabled} 
          />
          <Input 
            label="Date/Time Suffix:" 
            id="recordingTimestampSuffix" 
            value={props.recordingTimestampSuffix} 
            onChange={(e) => props.onRecordingTimestampSuffixChange(e.target.value)} 
            disabled={props.disabled} 
          />
        </div>
        <div className="bg-gray-900/50 p-2 rounded border border-gray-700 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-400 font-bold uppercase tracking-wider">Output Filename Preview:</span>
          <span className="text-sky-300 font-mono break-all">{fullTitle}.zip / .txt / .webm</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-3">
          <div className="w-full aspect-square rounded-md bg-gray-900/50">
            <AudioVisualizerCanvas
              micAnalyserNode={recordingState === RecordingState.RECORDING ? micAnalyserNodeRef.current : (player.isPlayerPlaying ? player.playerAnalyserNodeRef.current : null)}
              appAnalyserNode={recordingState === RecordingState.RECORDING ? appAudioAnalyserNodeRef.current : null}
              isActive={recordingState === RecordingState.RECORDING ? (!isPaused || isAutoPaused) : player.isPlayerPlaying}
              audioBuffer={player.decodedAudioBuffer} currentTime={recordingState === RecordingState.RECORDING ? elapsedTime : player.currentPlayTime}
              duration={recordingState === RecordingState.RECORDING ? elapsedTime : (props.audioDuration || 0)}
              autoPauseEnabled={props.audioSettings.enableAutoPause} autoPauseSensitivityDb={props.audioSettings.autoPauseSensitivityDb}
              autoPauseState={autoPauseState} onSeek={player.decodedAudioBuffer ? player.handleSeek : undefined}
              currentEmotion={currentEmotion} emotionHistory={props.emotionHistory}
            />
          </div>
          {finalAudioUrl && (
            <>
              <audio ref={player.audioPlayerRef} src={finalAudioUrl} onPlay={() => player.setIsPlayerPlaying(true)} onPause={() => player.setIsPlayerPlaying(false)} onEnded={() => player.setIsPlayerPlaying(false)} className="hidden" />
              <RecorderPlayerUI 
                {...player} 
                audioDuration={props.audioDuration || 0} 
                disabled={!finalAudioUrl} 
                onPlaybackSpeedChange={(e) => { const s = parseFloat(e.target.value); player.setPlaybackSpeed(s); if (player.audioPlayerRef.current) player.audioPlayerRef.current.playbackRate = s; }} 
                onVolumeChange={(e) => player.setVolume(parseFloat(e.target.value))}
                onRewind={player.handleRewind}
                onForward={player.handleForward}
              />
            </>
          )}
        </div>

        <div className="md:col-span-2">
          <BubbleNotes 
            isEditorEditable={!props.disabled} isRecordingCurrentlyActive={recordingState === RecordingState.RECORDING && !isPaused}
            isScreenSharing={!!displayStream || !!screenshots.screenshotStream} isRecordingSessionActive={recordingState === RecordingState.RECORDING}
            elapsedTime={elapsedTime} bubbleNotes={props.bubbleNotes} onBubbleNotesChange={props.onBubbleNotesChange}
            onOpenBubbleNote={props.onOpenBubbleNote} onTakeScreenshot={screenshots.handleTakeScreenshot}
            llmSettings={props.llmSettings} transcriptionSettings={props.transcriptionSettings}
            pendingNoteHtml={props.pendingNoteHtml} onPendingNoteHtmlChange={props.onPendingNoteHtmlChange}
            viewingBubbleNoteId={props.viewingBubbleNoteId} recordingTitle={fullTitle}
          />
        </div>
      </div>

      <RecorderStatus 
        recordingState={recordingState} isPaused={isPaused} 
        enableRealtimeTranscription={!!props.transcriptionSettings.enableRealtimeTranscription} realtimeTranscription={realtimeTranscription}
        enableAutoPause={props.audioSettings.enableAutoPause} autoPauseState={autoPauseState} autoPauseCountdown={autoPauseCountdown}
        enableChunkedRecording={!!props.transcriptionSettings.enableChunkedRecording} chunkCountdown={currentChunkCountdown}
      />

      <RecorderActions 
        isStartMode={recordingState !== RecordingState.RECORDING} disabled={!!props.disabled}
        recordingState={recordingState} elapsedTime={elapsedTime} isPaused={isPaused} isAutoPaused={isAutoPaused}
        isAppAudioActive={isAppAudioActive} isMicEnabled={isMicEnabled} isAutoSaveEnabled={props.isAutoSaveEnabled}
        autoSaveCountdown={props.autoSaveCountdown} onStart={handleStartFlow} onStop={stopRecording} onPause={pauseRecording}
        onResume={resumeRecording} onToggleMic={toggleMic} onAddAppAudio={addAppAudio} onUpload={() => fileInputRef.current?.click()}
        onToggleAutoSave={props.onToggleAutoSave} onSaveFile={() => audioBlob && saveBlobToFile(audioBlob, currentFileName)}
        onReset={props.onReset} showSaveButton={!!audioBlob && !props.transcriptionSettings.enableChunkedRecording}
        chunkCountdown={currentChunkCountdown} enableChunked={!!props.transcriptionSettings.enableChunkedRecording}
        pipelineStep={props.pipelineStep}
        autoPipelineEnabled={props.autoPipelineEnabled}
        onToggleAutoPipeline={props.onToggleAutoPipeline}
        chunksCount={props.chunksCount}
        forceShowSystemAudioGuide={guideKey}
      />
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="audio/*" className="hidden" multiple />
      {error && <p className="text-sm text-red-400">Error: {error}</p>}
    </div>
  );
});
