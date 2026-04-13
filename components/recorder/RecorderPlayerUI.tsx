
import React from 'react';
import { Button } from '../common/Button';
import { PlayIcon, PauseIcon, RewindIcon, ForwardIcon } from '../../constants';
import { formatTime } from '../../utils/textUtils';

interface RecorderPlayerUIProps {
  audioPlayerRef: React.RefObject<HTMLAudioElement>;
  currentPlayTime: number;
  audioDuration: number;
  isPlayerPlaying: boolean;
  playbackSpeed: number;
  volume: number;
  onRewind: () => void;
  onForward: () => void;
  onPlaybackSpeedChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
}

export const RecorderPlayerUI: React.FC<RecorderPlayerUIProps> = (props) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-2 text-sm text-gray-300 px-1">
      <span>{formatTime(props.currentPlayTime)}</span>
      <input 
        type="range" min="0" max={props.audioDuration || 0} value={props.currentPlayTime} 
        onChange={(e) => { if (props.audioPlayerRef.current) props.audioPlayerRef.current.currentTime = parseFloat(e.target.value); }} 
        className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50" 
        disabled={props.disabled}
      />
      <span>{formatTime(props.audioDuration || 0)}</span>
    </div>
    <div className="flex items-center justify-center gap-2 flex-wrap">
      <Button onClick={props.onRewind} size="sm" variant="ghost" disabled={props.disabled} leftIcon={<RewindIcon className="w-5 h-5" />} />
      {props.isPlayerPlaying ? (
        <Button onClick={() => props.audioPlayerRef.current?.pause()} size="sm" variant="secondary" disabled={props.disabled} leftIcon={<PauseIcon className="w-5 h-5" />}>Pause</Button>
      ) : (
        <Button onClick={() => props.audioPlayerRef.current?.play()} size="sm" variant="secondary" disabled={props.disabled} leftIcon={<PlayIcon className="w-5 h-5" />}>Play</Button>
      )}
      <Button onClick={props.onForward} size="sm" variant="ghost" disabled={props.disabled} leftIcon={<ForwardIcon className="w-5 h-5" />} />
      <div className="flex items-center gap-4 ml-2 flex-wrap justify-center">
        <div className="flex items-center gap-1 text-xs">
          <label className="text-gray-400">Speed:</label>
          <input type="range" min="0.5" max="2.0" step="0.1" value={props.playbackSpeed} onChange={props.onPlaybackSpeedChange} className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500" />
          <span className="text-gray-300 w-8 text-right">{props.playbackSpeed.toFixed(1)}x</span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <label className="text-gray-400">Vol:</label>
          <input type="range" min="0" max="1" step="0.01" value={props.volume} onChange={props.onVolumeChange} className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500" />
          <span className="text-gray-300 w-9 text-right">{Math.round(props.volume * 100)}%</span>
        </div>
      </div>
    </div>
  </div>
);
