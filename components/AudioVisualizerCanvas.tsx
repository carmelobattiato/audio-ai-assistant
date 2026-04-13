
import React, { useRef, useEffect } from 'react';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer';
import { formatTime } from '../utils/textUtils';
import { AutoPauseState } from '../hooks/useAudioRecorder';
import { Emotion, EmotionEvent } from '../types';

interface AudioVisualizerCanvasProps {
  micAnalyserNode: AnalyserNode | null;
  appAnalyserNode: AnalyserNode | null;
  isActive: boolean;
  audioBuffer?: AudioBuffer | null; 
  micAudioBuffer?: AudioBuffer | null; 
  appAudioBuffer?: AudioBuffer | null; 
  currentTime?: number;
  duration?: number;
  waveformColor?: string; 
  autoPauseEnabled?: boolean;
  autoPauseSensitivityDb?: number;
  autoPauseState?: AutoPauseState;
  onSeek?: (time: number) => void;
  currentEmotion?: Emotion;
  emotionHistory?: EmotionEvent[];
}

const STATIC_WAVEFORM_AMPLITUDE_SCALAR = 1.6;
const TIME_SCALE_HEIGHT = 20;
const TIME_SCALE_TICK_COLOR = 'rgb(156, 163, 175)'; // gray-400
const TIME_SCALE_TEXT_COLOR = 'rgb(209, 213, 219)'; // gray-300
const PROGRESS_BAR_COLOR = 'rgb(239, 68, 68)'; // red-500

const MIC_WAVEFORM_COLOR = 'rgb(59, 130, 246)'; // blue-500
const APP_WAVEFORM_COLOR = 'rgb(239, 68, 68)'; // red-500

export const AudioVisualizerCanvas: React.FC<AudioVisualizerCanvasProps> = ({
  micAnalyserNode,
  appAnalyserNode,
  isActive,
  audioBuffer,
  micAudioBuffer,
  appAudioBuffer,
  currentTime,
  duration,
  waveformColor,
  autoPauseEnabled,
  autoPauseSensitivityDb,
  autoPauseState,
  onSeek,
  currentEmotion,
  emotionHistory,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasStaticWaveform = !!audioBuffer || !!micAudioBuffer || !!appAudioBuffer;

  useAudioVisualizer(
    hasStaticWaveform ? null : micAnalyserNode,
    hasStaticWaveform ? null : appAnalyserNode,
    canvasRef,
    hasStaticWaveform ? false : isActive,
    hasStaticWaveform ? undefined : currentTime,
    hasStaticWaveform ? undefined : duration,
    autoPauseEnabled,
    autoPauseSensitivityDb,
    autoPauseState,
    currentEmotion,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStaticWaveform) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const waveformAreaHeight = canvasHeight - TIME_SCALE_HEIGHT;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const drawStaticWaveform = (buffer: AudioBuffer, color: string, centerY: number, height: number) => {
      const data = buffer.getChannelData(0);
      const samplesPerPixel = Math.max(1, Math.floor(data.length / canvasWidth));
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let i = 0; i < canvasWidth; i++) {
        const startIndex = i * samplesPerPixel;
        const endIndex = Math.min(startIndex + samplesPerPixel, data.length);
        if (startIndex >= data.length) break;

        let minPeak = 0;
        let maxPeak = 0;
        for (let j = startIndex; j < endIndex; j++) {
          if (data[j] < minPeak) minPeak = data[j];
          if (data[j] > maxPeak) maxPeak = data[j];
        }

        const y1 = centerY - (maxPeak * (height / 2) * STATIC_WAVEFORM_AMPLITUDE_SCALAR);
        const y2 = centerY - (minPeak * (height / 2) * STATIC_WAVEFORM_AMPLITUDE_SCALAR);

        ctx.moveTo(i, Math.max(centerY - (height/2), Math.min(centerY + (height/2), y1)));
        ctx.lineTo(i, Math.max(centerY - (height/2), Math.min(centerY + (height/2), y2)));
      }
      ctx.stroke();
    };

    const hasBoth = micAudioBuffer && appAudioBuffer;

    if (hasBoth && micAudioBuffer && appAudioBuffer) {
        const trackHeight = waveformAreaHeight / 2;
        drawStaticWaveform(micAudioBuffer, MIC_WAVEFORM_COLOR, trackHeight / 2, trackHeight);
        drawStaticWaveform(appAudioBuffer, APP_WAVEFORM_COLOR, trackHeight + (trackHeight / 2), trackHeight);
        
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.moveTo(0, trackHeight);
        ctx.lineTo(canvasWidth, trackHeight);
        ctx.stroke();
    } else if (audioBuffer) {
        drawStaticWaveform(audioBuffer, waveformColor || MIC_WAVEFORM_COLOR, waveformAreaHeight / 2, waveformAreaHeight);
    } else if (micAudioBuffer) {
        drawStaticWaveform(micAudioBuffer, MIC_WAVEFORM_COLOR, waveformAreaHeight / 2, waveformAreaHeight);
    } else if (appAudioBuffer) {
        drawStaticWaveform(appAudioBuffer, APP_WAVEFORM_COLOR, waveformAreaHeight / 2, waveformAreaHeight);
    }

    if (duration && duration > 0) {
      ctx.font = '10px Arial';
      ctx.fillStyle = TIME_SCALE_TEXT_COLOR;
      ctx.textAlign = 'center';
      const majorTickIntervalSeconds = Math.max(1, Math.floor(duration / 10 / 5) * 5);

      for (let t = 0; t <= duration; t += majorTickIntervalSeconds) {
        const xPos = (t / duration) * canvasWidth;
        ctx.fillStyle = TIME_SCALE_TICK_COLOR;
        ctx.fillRect(xPos - 0.5, waveformAreaHeight, 1, 5);
        ctx.fillText(formatTime(t), xPos, canvasHeight - 5);
      }
    }

    if (typeof currentTime === 'number' && duration && duration > 0) {
      const progressX = (currentTime / duration) * canvasWidth;
      ctx.fillStyle = PROGRESS_BAR_COLOR;
      ctx.fillRect(progressX - 1, 0, 2, waveformAreaHeight);
    }
  }, [audioBuffer, micAudioBuffer, appAudioBuffer, currentTime, duration, waveformColor, hasStaticWaveform]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || !duration || duration <= 0 || !hasStaticWaveform) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const clickedTime = (x / rect.width) * duration;
    onSeek(Math.max(0, Math.min(clickedTime, duration)));
  };

  const isAppAudioActive = (appAnalyserNode !== null) || (!!appAudioBuffer);

  return (
    <div className="relative w-full h-full">
      <canvas 
        ref={canvasRef} 
        width="300" 
        height="300" 
        className={`w-full h-full bg-transparent rounded-md ${onSeek && hasStaticWaveform ? 'cursor-pointer' : ''}`}
        aria-label="Audio waveform visualization"
        role="img"
        onClick={handleCanvasClick}
      />
      {/* Visual Legend */}
      <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
        <div className="flex items-center gap-2 bg-gray-900/60 px-2 py-0.5 rounded-md backdrop-blur-sm">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-[10px] font-bold text-blue-100 uppercase tracking-tighter">Microphone</span>
        </div>
        {isAppAudioActive && (
          <div className="flex items-center gap-2 bg-gray-900/60 px-2 py-0.5 rounded-md backdrop-blur-sm animate-pulse">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-[10px] font-bold text-red-100 uppercase tracking-tighter">System Audio</span>
          </div>
        )}
      </div>
    </div>
  );
};
