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

  const stopVideo = useCallback(() => {
    // Remove listener from the tracked video track before clearing it
    if (videoTrackRef.current) {
      videoTrackRef.current.removeEventListener('ended', stopVideo);
      videoTrackRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setIsVideoRecording(false);
  }, []);

  const startVideo = useCallback(() => {
    if (!displayStream || isVideoRecording) return;

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(displayStream, {
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

    // setIsVideoRecording(false) is handled synchronously by stopVideo; no need to duplicate here
    recorder.onstop = () => {};

    // Stop if the screen share ends — remove any lingering listener from a previous track first
    const videoTrack = displayStream.getVideoTracks()[0];
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
  }, [displayStream, isVideoRecording, chunkIntervalMs, bitrateKbps, stopVideo]);

  return { isVideoRecording, chunkCount, startVideo, stopVideo };
};
