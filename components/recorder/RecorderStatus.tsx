
import React from 'react';
import { PauseIcon, TimeIcon } from '../../constants';
import { formatTime } from '../../utils/textUtils';
import { RecordingState } from '../../types';

interface RecorderStatusProps {
  recordingState: RecordingState;
  isPaused: boolean;
  enableRealtimeTranscription: boolean;
  realtimeTranscription: string;
  enableAutoPause: boolean;
  autoPauseState: string;
  autoPauseCountdown: number;
  enableChunkedRecording: boolean;
  chunkCountdown: number;
}

export const RecorderStatus: React.FC<RecorderStatusProps> = (props) => (
  <div className="space-y-4">
    {props.enableRealtimeTranscription && props.recordingState === RecordingState.RECORDING && (
      <div className="p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-inner">
        <h4 className="text-sm font-semibold text-sky-300 mb-2">Live Transcription</h4>
        <p className="text-sm text-gray-200 font-mono whitespace-pre-wrap min-h-[60px] max-h-48 overflow-y-auto">
          {props.realtimeTranscription}
          {!props.isPaused && <span className="inline-block w-2 h-4 bg-gray-200 animate-pulse ml-1 align-bottom"></span>}
        </p>
      </div>
    )}

    {props.recordingState === RecordingState.RECORDING && props.enableAutoPause && (
      <div className="h-6 text-center text-sm font-medium flex items-center justify-center">
        {props.autoPauseState === 'listening' && <p className="text-emerald-400 flex items-center"><span className="animate-pulse mr-2 h-3 w-3 rounded-full bg-emerald-400" />Sound Detected</p>}
        {props.autoPauseState === 'warning' && <p className="text-amber-400">Silence detected. Pausing in {props.autoPauseCountdown}s...</p>}
        {props.autoPauseState === 'auto-paused' && <p className="text-red-400 flex items-center"><PauseIcon className="mr-1.5 h-4 w-4" />Auto-paused. Listening to resume...</p>}
      </div>
    )}
  </div>
);
