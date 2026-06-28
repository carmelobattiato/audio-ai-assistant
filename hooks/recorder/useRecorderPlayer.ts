
import { useState, useRef, useEffect, useCallback } from 'react';
import { loggingService } from '../../services/loggingService';

type AudioContextConstructor = typeof AudioContext;
declare global { interface Window { webkitAudioContext?: AudioContextConstructor } }

interface UseRecorderPlayerProps {
  finalAudioUrl: string | null;
  audioDuration: number | undefined;
  onAudioDurationChange?: (duration: number) => void;
}

export const useRecorderPlayer = ({ finalAudioUrl, onAudioDurationChange }: UseRecorderPlayerProps) => {
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [decodedAudioBuffer, setDecodedAudioBuffer] = useState<AudioBuffer | null>(null);
  const [currentPlayTime, setCurrentPlayTime] = useState<number>(0);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState<boolean>(false);

  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const playerAudioContextRef = useRef<AudioContext | null>(null);
  const playerMediaElementSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const playerAnalyserNodeRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!playerAudioContextRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext!;
      playerAudioContextRef.current = new Ctx();
      loggingService.debug('PLAYER', `AudioContext created, state=${playerAudioContextRef.current.state}`);
    }
  }, []);

  useEffect(() => {
    if (audioPlayerRef.current) audioPlayerRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (finalAudioUrl && audioPlayerRef.current && playerAudioContextRef.current) {
      const audioEl = audioPlayerRef.current;
      const context = playerAudioContextRef.current;
      loggingService.debug('PLAYER', `URL changed, wiring audio graph. ctx.state=${context.state}`);
      try {
        if (!playerMediaElementSourceRef.current) {
          playerMediaElementSourceRef.current = context.createMediaElementSource(audioEl);
          loggingService.debug('PLAYER', 'MediaElementSource created');
        } else {
          playerMediaElementSourceRef.current.disconnect();
          loggingService.debug('PLAYER', 'MediaElementSource disconnected (reuse)');
        }
        playerAnalyserNodeRef.current = context.createAnalyser();
        playerMediaElementSourceRef.current.connect(playerAnalyserNodeRef.current);
        playerAnalyserNodeRef.current.connect(context.destination);
      } catch (e) {
        loggingService.error('PLAYER', `Audio graph error: ${e}`);
      }

      const handleTimeUpdate = () => setCurrentPlayTime(audioEl.currentTime);
      audioEl.addEventListener('timeupdate', handleTimeUpdate);
      return () => audioEl.removeEventListener('timeupdate', handleTimeUpdate);
    }
    return undefined;
  }, [finalAudioUrl]);

  useEffect(() => {
    if (finalAudioUrl && playerAudioContextRef.current && finalAudioUrl.startsWith('blob:')) {
      const context = playerAudioContextRef.current;
      fetch(finalAudioUrl).then(r => r.arrayBuffer()).then(ab => {
        context.decodeAudioData(ab, (buffer) => {
          setDecodedAudioBuffer(buffer);
          if (onAudioDurationChange) onAudioDurationChange(buffer.duration);
          loggingService.debug('PLAYER', `Audio decoded, duration=${buffer.duration.toFixed(1)}s`);
        });
      }).catch((e) => loggingService.error('PLAYER', `Decode error: ${e}`));
    } else if (!finalAudioUrl) {
      setDecodedAudioBuffer(null);
      setCurrentPlayTime(0);
    }
  }, [finalAudioUrl, onAudioDurationChange]);

  const resumeAndPlay = useCallback(async (el: HTMLAudioElement) => {
    const context = playerAudioContextRef.current;
    loggingService.info('PLAYER', `play() called. ctx.state=${context?.state}, el.paused=${el.paused}, src=${el.src ? 'set' : 'empty'}`);
    if (context && context.state === 'suspended') {
      loggingService.info('PLAYER', 'Resuming suspended AudioContext...');
      await context.resume();
      loggingService.info('PLAYER', `AudioContext resumed, state=${context.state}`);
    }
    try {
      await el.play();
      loggingService.info('PLAYER', 'play() resolved OK');
    } catch (e) {
      loggingService.error('PLAYER', `play() rejected: ${e}`);
    }
  }, []);

  // Auto-play when a new external URL is loaded
  useEffect(() => {
    if (!finalAudioUrl) return;
    const el = audioPlayerRef.current;
    if (!el) return;
    loggingService.debug('PLAYER', `Waiting for canplay on new URL`);
    const onCanPlay = () => {
      loggingService.debug('PLAYER', 'canplay fired — auto-playing');
      resumeAndPlay(el);
      el.removeEventListener('canplay', onCanPlay);
    };
    el.addEventListener('canplay', onCanPlay);
    return () => el.removeEventListener('canplay', onCanPlay);
  }, [finalAudioUrl, resumeAndPlay]);

  const handleSeek = useCallback((time: number) => {
    if (audioPlayerRef.current) audioPlayerRef.current.currentTime = time;
  }, []);

  const handlePlayPause = useCallback(() => {
    const el = audioPlayerRef.current;
    if (!el) { loggingService.warn('PLAYER', 'handlePlayPause: audioPlayerRef is null'); return; }
    if (el.paused) resumeAndPlay(el);
    else { el.pause(); loggingService.info('PLAYER', 'pause() called'); }
  }, [resumeAndPlay]);

  const handleRewind = () => handleSeek(Math.max(0, (audioPlayerRef.current?.currentTime || 0) - 10));
  const handleForward = () => handleSeek((audioPlayerRef.current?.currentTime || 0) + 10);

  return {
    audioPlayerRef, playerAnalyserNodeRef,
    playbackSpeed, setPlaybackSpeed,
    volume, setVolume,
    decodedAudioBuffer, setDecodedAudioBuffer,
    currentPlayTime, setCurrentPlayTime,
    isPlayerPlaying, setIsPlayerPlaying,
    handleSeek, handlePlayPause, handleRewind, handleForward
  };
};
