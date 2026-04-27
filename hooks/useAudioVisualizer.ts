
import React, { useEffect, useRef } from 'react';
import { formatTime } from '../utils/textUtils';
import { AutoPauseState } from './useAudioRecorder';
import { Emotion } from '../types';

const MIC_WAVEFORM_COLOR = 'rgb(59, 130, 246)'; // Blue-500
const APP_WAVEFORM_COLOR = 'rgb(239, 68, 68)'; // Red-500
const IDLE_LINE_COLOR = 'rgb(107, 114, 128)'; // gray-500
const TIME_SCALE_HEIGHT_LIVE = 20; // px
const TIME_SCALE_TICK_COLOR_LIVE = 'rgb(156, 163, 175)'; // gray-400
const TIME_SCALE_TEXT_COLOR_LIVE = 'rgb(209, 213, 219)'; // gray-300
const PROGRESS_BAR_COLOR_LIVE = 'rgb(239, 68, 68)'; // red-500

export const useAudioVisualizer = (
  micAnalyserNode: AnalyserNode | null,
  appAnalyserNode: AnalyserNode | null,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  isActive: boolean,
  currentTimeForLive?: number,
  durationForLive?: number,
  autoPauseEnabled?: boolean,
  autoPauseSensitivityDb?: number,
  autoPauseState?: AutoPauseState,
  currentEmotion?: Emotion,
): void => {
  const animationFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const waveformAreaHeight = canvasHeight - TIME_SCALE_HEIGHT_LIVE;

    const isAnyAnalyserActive = (micAnalyserNode || appAnalyserNode) && isActive;

    if (!isAnyAnalyserActive) {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.strokeStyle = IDLE_LINE_COLOR;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, waveformAreaHeight / 2);
      context.lineTo(canvasWidth, waveformAreaHeight / 2);
      context.stroke();
      context.fillStyle = TIME_SCALE_TICK_COLOR_LIVE;
      context.fillRect(0, waveformAreaHeight, canvasWidth, 1);
      return;
    }

    const micBufferLength = micAnalyserNode?.frequencyBinCount;
    const appBufferLength = appAnalyserNode?.frequencyBinCount;
    const micDataArray = micBufferLength ? new Uint8Array(micBufferLength) : null;
    const appDataArray = appBufferLength ? new Uint8Array(appBufferLength) : null;

    const drawWaveform = (analyser: AnalyserNode, dataArray: Uint8Array, color: string, centerY: number, height: number) => {
      analyser.getByteTimeDomainData(dataArray);
      context.lineWidth = 2;
      context.strokeStyle = color;
      context.beginPath();
      const sliceWidth = (canvasWidth * 1.0) / dataArray.length;
      let x = 0;
      const amplitudeScalar = 0.8;

      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = centerY - ((v - 1) * (height / 2) * amplitudeScalar);
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
        x += sliceWidth;
      }
      context.stroke();
    };

    const drawThresholdBar = (centerY: number, height: number) => {
      if (!autoPauseEnabled || typeof autoPauseSensitivityDb !== 'number') return;
      const amplitudeThreshold = Math.pow(10, autoPauseSensitivityDb / 20);
      const barHeight = amplitudeThreshold * height;
      const barY = centerY - (barHeight / 2);

      let barColor = 'rgba(74, 222, 128, 0.2)'; // faint green
      if (autoPauseState === 'warning') barColor = 'rgba(249, 115, 22, 0.3)';
      else if (autoPauseState === 'auto-paused') barColor = 'rgba(248, 113, 113, 0.3)';

      context.fillStyle = barColor;
      context.fillRect(0, barY, canvasWidth, barHeight);
    };

    const drawTimeScaleAndProgress = () => {
        context.fillStyle = TIME_SCALE_TICK_COLOR_LIVE;
        context.fillRect(0, waveformAreaHeight, canvasWidth, 1);
        
        if(currentTimeForLive !== undefined && durationForLive !== undefined && durationForLive > 0) {
            context.font = '12px Arial';
            context.fillStyle = TIME_SCALE_TEXT_COLOR_LIVE;
            context.textAlign = 'left';
            context.fillText(formatTime(currentTimeForLive), 5, canvasHeight - 5);
            
            const progressX = (currentTimeForLive / durationForLive) * canvasWidth;
            context.fillStyle = PROGRESS_BAR_COLOR_LIVE;
            context.fillRect(progressX, 0, 2, waveformAreaHeight);
        }
    };

    const render = () => {
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      
      const hasBoth = micAnalyserNode && appAnalyserNode;
      
      if (hasBoth) {
          // Split view
          const trackHeight = waveformAreaHeight / 2;
          
          // Thresholds for both tracks
          drawThresholdBar(trackHeight / 2, trackHeight);
          drawThresholdBar(trackHeight + (trackHeight / 2), trackHeight);

          // Mic track (Top)
          if (micAnalyserNode && micDataArray) {
              drawWaveform(micAnalyserNode, micDataArray, MIC_WAVEFORM_COLOR, trackHeight / 2, trackHeight);
          }
          // App track (Bottom)
          if (appAnalyserNode && appDataArray) {
              drawWaveform(appAnalyserNode, appDataArray, APP_WAVEFORM_COLOR, trackHeight + (trackHeight / 2), trackHeight);
          }
          
          // Separator
          context.strokeStyle = 'rgba(255,255,255,0.1)';
          context.beginPath();
          context.moveTo(0, trackHeight);
          context.lineTo(canvasWidth, trackHeight);
          context.stroke();
      } else {
          // Full view
          drawThresholdBar(waveformAreaHeight / 2, waveformAreaHeight);
          
          if (micAnalyserNode && micDataArray) {
              drawWaveform(micAnalyserNode, micDataArray, MIC_WAVEFORM_COLOR, waveformAreaHeight / 2, waveformAreaHeight);
          } else if (appAnalyserNode && appDataArray) {
              drawWaveform(appAnalyserNode, appDataArray, APP_WAVEFORM_COLOR, waveformAreaHeight / 2, waveformAreaHeight);
          }
      }
      
      drawTimeScaleAndProgress();
      animationFrameIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [micAnalyserNode, appAnalyserNode, canvasRef, isActive, currentTimeForLive, durationForLive, autoPauseEnabled, autoPauseSensitivityDb, autoPauseState, currentEmotion]);
};
