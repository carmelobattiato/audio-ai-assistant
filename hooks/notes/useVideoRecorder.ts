import { useState, useRef, useCallback } from 'react';

interface UseVideoRecorderOptions {
  displayStream: MediaStream | null;
  chunkIntervalMs?: number;
  bitrateKbps?: number;
}

export const useVideoRecorder = ({
  displayStream,
  chunkIntervalMs = 60_000,
  bitrateKbps = 2500,
}: UseVideoRecorderOptions) => {
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkCountRef = useRef(0);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  // owned stream: acquired independently when no displayStream is provided
  const ownedStreamRef = useRef<MediaStream | null>(null);

  const stopVideo = useCallback(() => {
    if (videoTrackRef.current) {
      videoTrackRef.current.removeEventListener('ended', stopVideo);
      videoTrackRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    // Stop and release any independently acquired stream
    if (ownedStreamRef.current) {
      ownedStreamRef.current.getTracks().forEach(t => t.stop());
      ownedStreamRef.current = null;
    }
    setIsVideoRecording(false);
  }, []);

  const startRecordingOnStream = useCallback((stream: MediaStream) => {
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitrateKbps * 1000,
      });
    } catch {
      console.warn('useVideoRecorder: failed to create MediaRecorder', { mimeType });
      return;
    }

    chunkCountRef.current = 0;
    setChunkCount(0);

    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      const url = URL.createObjectURL(e.data);
      const a = document.createElement('a');
      chunkCountRef.current += 1;
      a.href = url;
      a.download = `video-chunk-${String(chunkCountRef.current).padStart(3, '0')}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setChunkCount(chunkCountRef.current);
    };

    recorder.onstop = () => {};

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      if (videoTrackRef.current && videoTrackRef.current !== videoTrack) {
        videoTrackRef.current.removeEventListener('ended', stopVideo);
      }
      videoTrackRef.current = videoTrack;
      videoTrack.addEventListener('ended', stopVideo, { once: true });
    }

    recorder.start(chunkIntervalMs);
    recorderRef.current = recorder;
    setIsVideoRecording(true);
  }, [bitrateKbps, chunkIntervalMs, stopVideo]);

  const startVideo = useCallback(async () => {
    if (isVideoRecording) return;

    if (displayStream) {
      startRecordingOnStream(displayStream);
      return;
    }

    // No existing display stream — request screen capture independently
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      ownedStreamRef.current = stream;
      startRecordingOnStream(stream);
    } catch {
      // User cancelled or permission denied — silently ignore
    }
  }, [displayStream, isVideoRecording, startRecordingOnStream]);

  return { isVideoRecording, chunkCount, startVideo, stopVideo };
};
