import { useState, useRef, useCallback } from 'react';

interface UseVideoRecorderOptions {
  displayStream: MediaStream | null;
  sessionTitle: string;
  elapsedTime: number;
  onChunkSaved: (filename: string, chunkIndex: number, elapsedMs: number) => void;
  chunkIntervalMs?: number;
  bitrateKbps?: number;
}

export const useVideoRecorder = ({
  displayStream,
  sessionTitle,
  elapsedTime,
  onChunkSaved,
  chunkIntervalMs = 60_000,
  bitrateKbps = 2500,
}: UseVideoRecorderOptions) => {
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkCountRef = useRef(0);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const ownedStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const elapsedRef = useRef(elapsedTime);
  elapsedRef.current = elapsedTime;

  const safeTitle = useRef(sessionTitle);
  safeTitle.current = sessionTitle.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').slice(0, 50) || 'Session';

  const stopVideo = useCallback(() => {
    if (videoTrackRef.current) {
      videoTrackRef.current.removeEventListener('ended', stopVideo as EventListener);
      videoTrackRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    if (ownedStreamRef.current) {
      ownedStreamRef.current.getTracks().forEach(t => t.stop());
      ownedStreamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setIsVideoRecording(false);
  }, []);

  const startRecordingOnStream = useCallback((stream: MediaStream) => {
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitrateKbps * 1000,
        audioBitsPerSecond: 128_000,
      });
    } catch (err) {
      console.warn('useVideoRecorder: MediaRecorder creation failed', err);
      return;
    }

    chunkCountRef.current = 0;
    setChunkCount(0);

    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      chunkCountRef.current += 1;
      const idx = chunkCountRef.current;
      const filename = `${safeTitle.current}_video${idx}.webm`;
      const url = URL.createObjectURL(e.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setChunkCount(idx);
      onChunkSaved(filename, idx, elapsedRef.current);
    };

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrackRef.current = videoTrack;
      videoTrack.addEventListener('ended', stopVideo as EventListener, { once: true });
    }

    recorder.start(chunkIntervalMs);
    recorderRef.current = recorder;
    setIsVideoRecording(true);
  }, [bitrateKbps, chunkIntervalMs, onChunkSaved, stopVideo]);

  const startVideo = useCallback(async () => {
    if (isVideoRecording) return;

    if (displayStream) {
      startRecordingOnStream(displayStream);
      return;
    }

    // Independent capture: screen + mix mic audio
    let screenStream: MediaStream;
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch {
      return; // user cancelled
    }
    ownedStreamRef.current = screenStream;

    // Try to capture mic and mix audio via AudioContext
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = micStream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();

      if (screenStream.getAudioTracks().length > 0) {
        ctx.createMediaStreamSource(new MediaStream(screenStream.getAudioTracks())).connect(dest);
      }
      ctx.createMediaStreamSource(micStream).connect(dest);

      const combined = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
      startRecordingOnStream(combined);
    } catch {
      // Mic unavailable — record screen audio only
      startRecordingOnStream(screenStream);
    }
  }, [displayStream, isVideoRecording, startRecordingOnStream]);

  return { isVideoRecording, chunkCount, startVideo, stopVideo };
};
