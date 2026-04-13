
import { useState, useRef, useEffect, useCallback } from 'react';

interface UseRecorderPlayerProps {
  finalAudioUrl: string | null;
  audioDuration: number | undefined;
  onAudioDurationChange?: (duration: number) => void;
}

export const useRecorderPlayer = ({ finalAudioUrl, audioDuration, onAudioDurationChange }: UseRecorderPlayerProps) => {
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
      playerAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }, []);

  useEffect(() => {
    if (audioPlayerRef.current) audioPlayerRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (finalAudioUrl && audioPlayerRef.current && playerAudioContextRef.current) {
      const audioEl = audioPlayerRef.current;
      const context = playerAudioContextRef.current;
      try {
        if (!playerMediaElementSourceRef.current) {
          playerMediaElementSourceRef.current = context.createMediaElementSource(audioEl);
        } else {
          playerMediaElementSourceRef.current.disconnect();
        }
        playerAnalyserNodeRef.current = context.createAnalyser();
        playerMediaElementSourceRef.current.connect(playerAnalyserNodeRef.current);
        playerAnalyserNodeRef.current.connect(context.destination);
      } catch (e) {
        console.error("Player audio graph error:", e);
      }

      const handleTimeUpdate = () => setCurrentPlayTime(audioEl.currentTime);
      audioEl.addEventListener('timeupdate', handleTimeUpdate);
      return () => audioEl.removeEventListener('timeupdate', handleTimeUpdate);
    }
  }, [finalAudioUrl]);

  useEffect(() => {
    if (finalAudioUrl && playerAudioContextRef.current && finalAudioUrl.startsWith('blob:')) {
      const context = playerAudioContextRef.current;
      fetch(finalAudioUrl).then(r => r.arrayBuffer()).then(ab => {
        context.decodeAudioData(ab, (buffer) => {
          setDecodedAudioBuffer(buffer);
          if (onAudioDurationChange) onAudioDurationChange(buffer.duration);
        });
      }).catch(() => {});
    } else if (!finalAudioUrl) {
      setDecodedAudioBuffer(null);
      setCurrentPlayTime(0);
    }
  }, [finalAudioUrl, onAudioDurationChange]);

  const handleSeek = useCallback((time: number) => {
    if (audioPlayerRef.current) audioPlayerRef.current.currentTime = time;
  }, []);

  const handleRewind = () => handleSeek(Math.max(0, (audioPlayerRef.current?.currentTime || 0) - 10));
  const handleForward = () => handleSeek((audioPlayerRef.current?.currentTime || 0) + 10);

  return {
    audioPlayerRef, playerAnalyserNodeRef,
    playbackSpeed, setPlaybackSpeed,
    volume, setVolume,
    decodedAudioBuffer, setDecodedAudioBuffer,
    currentPlayTime, setCurrentPlayTime,
    isPlayerPlaying, setIsPlayerPlaying,
    handleSeek, handleRewind, handleForward
  };
};
