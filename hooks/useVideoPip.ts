import { useState, useCallback, useRef, useEffect, MutableRefObject } from 'react';
import { PipelineStep } from '../types';
import { formatTime } from '../utils/textUtils';
import { loggingService } from '../services/loggingService';

export interface VideoPipState {
  isRecording: boolean;
  isPaused: boolean;
  isAutoPaused: boolean;
  elapsedTime: number;
  sessionTitle: string;
  pipelineStep: PipelineStep;
  micAnalyserNode: AnalyserNode | null;
  appAnalyserNode: AnalyserNode | null;
}

interface UseVideoPipOptions {
  mode: 'basic' | 'hybrid';
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onOpenFullPip?: () => void;
}

const isVideoSupported =
  typeof document !== 'undefined' && 'requestPictureInPicture' in document.createElement('video');

function drawFrame(
  canvas: HTMLCanvasElement,
  stateRef: MutableRefObject<VideoPipState>,
  mode: 'basic' | 'hybrid',
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const s = stateRef.current;
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  // Purple gradient top line
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#7C3AED');
  grad.addColorStop(0.5, '#C026D3');
  grad.addColorStop(1, '#7C3AED');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 2);

  // Waveform
  const waveTop = 40;
  const waveH = H - 70;

  if (s.micAnalyserNode && s.isRecording) {
    const bufLen = s.micAnalyserNode.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    s.micAnalyserNode.getByteFrequencyData(data);
    const barW = W / bufLen * 2.5;
    const active = !s.isPaused || s.isAutoPaused;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const bh = ((data[i] ?? 0) / 255) * waveH;
      const alpha = active ? 0.4 + (data[i] ?? 0) / 510 : 0.25;
      ctx.fillStyle = `rgba(139,92,246,${alpha})`;
      ctx.fillRect(x, waveTop + waveH - bh, Math.max(1, barW - 1), bh);
      x += barW;
      if (x > W) break;
    }
  } else {
    ctx.strokeStyle = 'rgba(139,92,246,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, waveTop + waveH / 2);
    ctx.lineTo(W - 16, waveTop + waveH / 2);
    ctx.stroke();
  }

  // Status dot
  const dotColor =
    s.isRecording && !s.isPaused ? '#EF4444'
    : s.isPaused || s.isAutoPaused ? '#F59E0B'
    : '#4B5563';
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(18, 22, 7, 0, Math.PI * 2);
  ctx.fill();

  // Timer
  if (s.isRecording) {
    ctx.fillStyle = '#EDE9FE';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(formatTime(s.elapsedTime), 34, 28);
  }

  // Title (top-right)
  const title = s.sessionTitle || 'Audio AI Assistant';
  ctx.fillStyle = 'rgba(196,181,253,0.6)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(title.length > 24 ? title.slice(0, 24) + '…' : title, W - 12, 28);

  // Status label (bottom)
  let statusText = 'Ready';
  let statusColor = '#6B7280';
  if (s.isAutoPaused) { statusText = 'Auto-paused'; statusColor = '#F59E0B'; }
  else if (s.isPaused) { statusText = 'Paused'; statusColor = '#FCD34D'; }
  else if (s.isRecording) { statusText = '● REC'; statusColor = '#EF4444'; }
  else if (s.pipelineStep === PipelineStep.TRANSCRIBING) { statusText = 'Transcribing…'; statusColor = '#60A5FA'; }
  else if (s.pipelineStep === PipelineStep.ANALYZING) { statusText = 'Analyzing…'; statusColor = '#A78BFA'; }
  else if (s.pipelineStep === PipelineStep.DOWNLOADING) { statusText = 'Processing…'; statusColor = '#34D399'; }

  ctx.textAlign = 'center';
  ctx.fillStyle = statusColor;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(statusText, W / 2, H - 10);

  // Mode badge (top-left corner, always visible)
  const badge = mode === 'hybrid' ? 'PiP 3  ⏮ Full widget' : 'PiP 2';
  const badgeBg = mode === 'hybrid' ? 'rgba(124,58,237,0.55)' : 'rgba(30,30,60,0.55)';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const badgeW = ctx.measureText(badge).width + 10;
  ctx.fillStyle = badgeBg;
  ctx.beginPath();
  (ctx as CanvasRenderingContext2D).roundRect?.(6, H - 26, badgeW, 18, 4) ?? ctx.fillRect(6, H - 26, badgeW, 18);
  ctx.fill();
  ctx.fillStyle = mode === 'hybrid' ? '#C4B5FD' : '#9CA3AF';
  ctx.fillText(badge, 11, H - 13);
}

export function useVideoPip(
  stateRef: MutableRefObject<VideoPipState>,
  options: UseVideoPipOptions,
) {
  const [isOpen, setIsOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const cleanup = useCallback(() => {
    stopLoop();
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
      } catch (_) { /* ignore */ }
    }
    const video = videoRef.current;
    if (video) {
      const stream = video.srcObject as MediaStream | null;
      stream?.getTracks().forEach(t => t.stop());
      video.srcObject = null;
      video.remove();
      videoRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.remove();
      canvasRef.current = null;
    }
  }, [stopLoop]);

  const openPip = useCallback(async () => {
    const tag = `VIDEO_PIP_${options.mode.toUpperCase()}`;
    loggingService.info(tag, `openPip called`, { mode: options.mode, isVideoSupported, alreadyOpen: !!videoRef.current });

    if (!isVideoSupported) {
      loggingService.warn(tag, 'requestPictureInPicture not supported in this browser');
      return;
    }
    if (videoRef.current) {
      loggingService.warn(tag, 'openPip: already open, ignoring');
      return;
    }

    // Canvas (offscreen source — display:none is fine for canvas)
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 180;
    canvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;pointer-events:none;';
    document.body.appendChild(canvas);
    canvasRef.current = canvas;
    loggingService.debug(tag, 'canvas created and appended');

    // Draw first frame immediately so the stream has content
    drawFrame(canvas, stateRef, options.mode);
    loggingService.debug(tag, 'first frame drawn');

    // Video must NOT be display:none — use off-screen positioning instead
    const video = document.createElement('video');
    video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    document.body.appendChild(video);
    videoRef.current = video;
    loggingService.debug(tag, 'video element created and appended');

    // Wire canvas stream to video
    let stream: MediaStream;
    try {
      stream = canvas.captureStream(30);
      loggingService.debug(tag, 'captureStream ok', { tracks: stream.getVideoTracks().length });
    } catch (e) {
      loggingService.error(tag, 'captureStream failed', { error: String(e) });
      cleanup();
      return;
    }

    video.srcObject = stream;

    // Wait for metadata so requestPictureInPicture has valid dimensions
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('loadedmetadata timeout')), 3000);
      video.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
      video.onerror = (e) => { clearTimeout(timer); reject(new Error(`video error: ${String(e)}`)); };
      video.play().catch(e => { clearTimeout(timer); reject(new Error(`play() failed: ${String(e)}`)); });
    }).catch(e => {
      loggingService.error(tag, 'video init failed', { error: String(e) });
      cleanup();
      throw e;
    });

    loggingService.debug(tag, 'video playing, readyState', { readyState: video.readyState, videoWidth: video.videoWidth, videoHeight: video.videoHeight });

    // Media Session
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: stateRef.current.sessionTitle || 'Audio AI Assistant',
          artist: 'Audio AI Assistant',
        });
        navigator.mediaSession.setActionHandler('play', () => optionsRef.current.onResume());
        navigator.mediaSession.setActionHandler('pause', () => optionsRef.current.onPause());
        navigator.mediaSession.setActionHandler('stop', () => optionsRef.current.onStop());
        if (optionsRef.current.mode === 'hybrid') {
          navigator.mediaSession.setActionHandler('previoustrack', () => optionsRef.current.onOpenFullPip?.());
        }
        loggingService.debug(tag, 'mediaSession handlers set');
      } catch (e) {
        loggingService.warn(tag, 'mediaSession setup failed', { error: String(e) });
      }
    } else {
      loggingService.warn(tag, 'mediaSession not available');
    }

    // Start RAF draw loop — also syncs mediaSession.playbackState each frame
    const tick = () => {
      const c = canvasRef.current;
      if (!c) return;
      drawFrame(c, stateRef, optionsRef.current.mode);
      // Keep mediaSession in sync so Chrome shows correct play/pause btn
      if ('mediaSession' in navigator) {
        const paused = stateRef.current.isPaused || stateRef.current.isAutoPaused;
        const active = stateRef.current.isRecording;
        navigator.mediaSession.playbackState = active
          ? (paused ? 'paused' : 'playing')
          : 'none';
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    loggingService.debug(tag, 'RAF loop started');

    // Request PiP — must still be within user gesture activation
    try {
      await video.requestPictureInPicture();
      loggingService.info(tag, 'requestPictureInPicture succeeded');
    } catch (e) {
      loggingService.error(tag, 'requestPictureInPicture failed', { error: String(e), readyState: video.readyState });
      cleanup();
      return;
    }

    setIsOpen(true);

    video.addEventListener('leavepictureinpicture', () => {
      loggingService.info(tag, 'leavepictureinpicture — cleaning up');
      setIsOpen(false);
      cleanup();
    }, { once: true });
  }, [stateRef, options.mode, cleanup]);

  const closePip = useCallback(async () => {
    const tag = `VIDEO_PIP_${options.mode.toUpperCase()}`;
    loggingService.info(tag, 'closePip called');
    const video = videoRef.current;
    if (video && document.pictureInPictureElement === video) {
      await document.exitPictureInPicture().catch(e =>
        loggingService.warn(tag, 'exitPictureInPicture failed', { error: String(e) })
      );
    } else {
      setIsOpen(false);
      cleanup();
    }
  }, [options.mode, cleanup]);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return {
    isSupported: isVideoSupported,
    isOpen,
    openPip,
    closePip,
  };
}
