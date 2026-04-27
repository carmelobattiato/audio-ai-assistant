
import { useState, useRef, useCallback } from 'react';
import { AudioSettings } from '../../types';

// Chrome-proprietary constraints not in the standard MediaTrackConstraints spec
interface ChromeMediaTrackConstraints extends MediaTrackConstraints {
  googEchoCancellation?: boolean;
  googAutoGainControl?: boolean;
  googNoiseSuppression?: boolean;
  googHighpassFilter?: boolean;
  googAudioMirroring?: boolean;
}

type AudioContextConstructor = typeof AudioContext;
declare global { interface Window { webkitAudioContext?: AudioContextConstructor } }

export const useMediaStreams = (settings: AudioSettings) => {
  const [displayStream, setDisplayStream] = useState<MediaStream | null>(null);
  const [isAppAudioActive, setIsAppAudioActive] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micAnalyserNodeRef = useRef<AnalyserNode | null>(null);
  const appAudioAnalyserNodeRef = useRef<AnalyserNode | null>(null);
  const allStreamsRef = useRef<MediaStream[]>([]);
  const micAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  const cleanupStreams = useCallback(() => {
    allStreamsRef.current.forEach(stream => stream.getTracks().forEach(track => track.stop()));
    allStreamsRef.current = [];
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    destinationNodeRef.current = null;
    setDisplayStream(null);
    setIsAppAudioActive(false);
  }, []);

  const setupAudioContext = useCallback((sampleRate?: number) => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const Ctx = window.AudioContext || window.webkitAudioContext!;
      audioContextRef.current = new Ctx({ sampleRate });
    }
    destinationNodeRef.current = audioContextRef.current.createMediaStreamDestination();
    return { context: audioContextRef.current, destination: destinationNodeRef.current };
  }, []);

  /**
   * Updates mic constraints dynamically. Respects manual forcing if auto-manage is disabled.
   */
  const updateMicEchoCancellation = useCallback(async (isSystemAudioNowActive: boolean) => {
    if (micAudioTrackRef.current) {
      const shouldEnableAEC = settings.autoManageEchoCancellation 
        ? isSystemAudioNowActive 
        : settings.echoCancellation;

      console.log(`MediaStreams: Updating Echo Cancellation. Auto-manage: ${settings.autoManageEchoCancellation}, Should Enable: ${shouldEnableAEC}`);
      
      const constraints: ChromeMediaTrackConstraints = {
        echoCancellation: shouldEnableAEC,
        noiseSuppression: shouldEnableAEC ? true : settings.noiseSuppression,
        autoGainControl: shouldEnableAEC ? true : settings.autoGainControl,
      };

      if (shouldEnableAEC) {
          constraints.googEchoCancellation = true;
          constraints.googAutoGainControl = true;
          constraints.googNoiseSuppression = true;
          constraints.googHighpassFilter = true;
      }

      try {
        await micAudioTrackRef.current.applyConstraints(constraints);
      } catch (e) {
        console.warn("MediaStreams: Could not apply dynamic constraints to mic track", e);
      }
    }
  }, [settings.autoManageEchoCancellation, settings.echoCancellation, settings.noiseSuppression, settings.autoGainControl]);

  const getMicStream = useCallback(async (context: AudioContext, destination: MediaStreamAudioDestinationNode, includeAppAudio: boolean) => {
    // If auto-manage is ON, enable AEC if system audio is requested.
    // If auto-manage is OFF, use the fixed settings value (user forced).
    const useAEC = settings.autoManageEchoCancellation 
        ? includeAppAudio 
        : settings.echoCancellation;

    console.log("MediaStreams: Requesting mic. Auto-manage:", settings.autoManageEchoCancellation, "Forced AEC:", settings.echoCancellation, "Final AEC decision:", useAEC);
    
    const constraints: ChromeMediaTrackConstraints = {
        channelCount: settings.channels === 'stereo' ? 2 : 1,
        echoCancellation: useAEC,
        noiseSuppression: useAEC ? true : settings.noiseSuppression,
        autoGainControl: useAEC ? true : settings.autoGainControl,
    };

    if (useAEC) {
        constraints.googEchoCancellation = true;
        constraints.googAutoGainControl = true;
        constraints.googNoiseSuppression = true;
        constraints.googHighpassFilter = true;
        constraints.googAudioMirroring = false;
    }

    const micStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    allStreamsRef.current.push(micStream);
    const micTrack = micStream.getAudioTracks()[0] ?? null;
    micAudioTrackRef.current = micTrack;
    
    const micSource = context.createMediaStreamSource(micStream);
    micAnalyserNodeRef.current = context.createAnalyser();
    micSource.connect(micAnalyserNodeRef.current);
    micSource.connect(destination);
    
    return { micStream, micSource, micTrack };
  }, [settings.autoManageEchoCancellation, settings.echoCancellation, settings.channels, settings.noiseSuppression, settings.autoGainControl]);

  return {
    displayStream, setDisplayStream,
    isAppAudioActive, setIsAppAudioActive,
    audioContextRef, destinationNodeRef,
    micAnalyserNodeRef, appAudioAnalyserNodeRef,
    allStreamsRef, micAudioTrackRef,
    cleanupStreams, setupAudioContext, getMicStream,
    updateMicEchoCancellation
  };
};
