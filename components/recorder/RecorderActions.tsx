
import React from 'react';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import { 
  RecordIcon, StopIcon, UploadIcon, TrashIcon, DownloadIcon, 
  PauseIcon, HeadphonesIcon, MicrophoneOnIcon, MicrophoneOffIcon, TimeIcon, FolderIcon
} from '../../constants';
import { formatTime } from '../../utils/textUtils';
import { RecordingState, PipelineStep } from '../../types';

interface RecorderActionsProps {
  isStartMode: boolean;
  disabled: boolean;
  recordingState: RecordingState;
  elapsedTime: number;
  isPaused: boolean;
  isAutoPaused: boolean;
  isAppAudioActive: boolean;
  isMicEnabled: boolean;
  isAutoSaveEnabled: boolean;
  autoSaveCountdown: number;
  onStart: (app: boolean) => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onToggleMic: () => void;
  onAddAppAudio: () => void;
  onUpload: () => void;
  onToggleAutoSave: () => void;
  onSaveFile: () => void;
  onReset: () => void;
  showSaveButton: boolean;
  chunkCountdown: number;
  enableChunked: boolean;
  pipelineStep?: PipelineStep;
  autoPipelineEnabled: boolean;
  onToggleAutoPipeline: (val: boolean) => void;
  chunksCount: number;
}

export const RecorderActions: React.FC<RecorderActionsProps> = (props) => {
  const isFinalizing = props.pipelineStep && 
                       props.pipelineStep !== PipelineStep.IDLE && 
                       props.pipelineStep !== PipelineStep.RECORDING && 
                       props.pipelineStep !== PipelineStep.COMPLETED;

  const autoSaveTooltip = "EMERGENCY PERSISTENCE: Salva note e trascrizione nel database IndexedDB. Utile per crash gravi.";
  const chunkCountdownTooltip = "PROSSIMO CHUNK (1 min): Tempo rimanente prima che il segmento audio attuale venga persistito su disco IndexedDB.";
  const smartPipelineTooltip = "SMART PIPELINE: Automatizza Trascrizione + Analisi al termine della registrazione.";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-start items-center flex-wrap">
        <div className="flex items-center gap-3">
          {props.isStartMode ? (
            <div className="inline-flex rounded-lg shadow-md flex-grow sm:flex-grow-0">
              <Button onClick={() => props.onStart(false)} variant="primary" leftIcon={<RecordIcon className="w-5 h-5" />} disabled={props.disabled || isFinalizing} className="rounded-r-none flex-grow">Start Recording</Button>
              <Button onClick={() => props.onStart(true)} variant="primary" disabled={props.disabled || isFinalizing} className="rounded-l-none border-l border-blue-500 px-3" title="Incl. System Audio"><HeadphonesIcon className="w-5 h-5" /></Button>
            </div>
          ) : (
            <div className="inline-flex rounded-lg shadow-md flex-grow sm:flex-grow-0">
              <Button onClick={props.onStop} variant="danger" isGlowing={props.recordingState === RecordingState.RECORDING && !props.isPaused} leftIcon={<StopIcon className="w-5 h-5" />} disabled={props.disabled} className="rounded-r-none flex-grow">
                  {isFinalizing ? "Finalizing Pipeline..." : `Stop (${formatTime(props.elapsedTime)})`}
              </Button>
              <Button onClick={props.onAddAppAudio} variant="secondary" disabled={props.disabled || props.isAppAudioActive} className="rounded-none border-l border-gray-500 px-3"><HeadphonesIcon className={`w-5 h-5 ${props.isAppAudioActive ? 'text-emerald-400' : ''}`} /></Button>
              <Button onClick={props.onToggleMic} variant="secondary" disabled={props.disabled} className="rounded-l-none border-l border-gray-500 px-3">{props.isMicEnabled ? <MicrophoneOnIcon className="w-5 h-5" /> : <MicrophoneOffIcon className="w-5 h-5 text-red-400" />}</Button>
            </div>
          )}

          {!isFinalizing && (
            <div 
              className="flex items-center bg-gray-700/50 px-3 py-2 rounded-lg border border-gray-600 transition-all hover:bg-gray-700 has-custom-tooltip"
              data-tooltip={smartPipelineTooltip}
            >
              <Checkbox 
                id="quick-auto-pipeline"
                label="Smart Pipeline"
                checked={props.autoPipelineEnabled}
                onChange={(e) => props.onToggleAutoPipeline(e.target.checked)}
                className="text-sky-300 font-semibold text-xs"
              />
            </div>
          )}
        </div>

        {props.recordingState === RecordingState.RECORDING && props.enableChunked && (
          <div className="flex gap-2 items-center">
            <div 
                className="flex items-center gap-2 text-sm text-sky-300 font-medium p-2 bg-gray-700 rounded-lg has-custom-tooltip animate-pulse"
                data-tooltip={chunkCountdownTooltip}
            >
                <TimeIcon className="w-5 h-5"/>
                <span className="font-mono">DB-Sync: {formatTime(props.chunkCountdown)}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-900/30 text-emerald-400 rounded-lg border border-emerald-800 text-xs font-bold">
                <FolderIcon className="w-4 h-4" />
                <span>{props.chunksCount} CHUNKS SAVED</span>
            </div>
          </div>
        )}

        {props.recordingState === RecordingState.RECORDING && !props.isPaused && <Button onClick={props.onPause} variant="secondary" leftIcon={<PauseIcon className="w-5 h-5" />} disabled={props.disabled}>Pause</Button>}
        {props.recordingState === RecordingState.RECORDING && props.isPaused && <Button onClick={props.onResume} variant="primary" leftIcon={<RecordIcon className="w-5 h-5" />} disabled={props.disabled}>{props.isAutoPaused ? 'Resume (Auto)' : 'Resume'}</Button>}
        
        <Button onClick={props.onUpload} variant="primary" leftIcon={<UploadIcon className="w-5 h-5" />} disabled={props.disabled || !props.isStartMode || isFinalizing}>Upload File</Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-start items-center flex-wrap border-t border-gray-700 pt-4">
        {props.showSaveButton && <Button onClick={props.onSaveFile} variant="ghost" size="sm" leftIcon={<DownloadIcon className="w-5 h-5" />}>Save Audio</Button>}
        <Button onClick={props.onReset} variant="ghost" size="sm" leftIcon={<TrashIcon className="w-5 h-5" />} disabled={props.disabled}>Reset Everything</Button>
      </div>
    </div>
  );
};
