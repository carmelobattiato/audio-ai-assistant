
import React, { useRef, useState, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { encode } from '../../utils/audioUtils';

export const useLiveTranscriptionLogic = (onTranscriptionUpdate: (text: string) => void) => {
  const [realtimeTranscription, setRealtimeTranscription] = useState('');
  const realtimeTranscriptAccumulatorRef = useRef('');
  const liveSessionPromiseRef = useRef<Promise<any> | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const cleanupLiveSession = useCallback(() => {
    liveSessionPromiseRef.current?.then(session => session.close()).catch(() => {});
    liveSessionPromiseRef.current = null;
    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;
    micStreamSourceRef.current?.disconnect();
    micStreamSourceRef.current = null;
  }, []);

  // Fix: Added React to parameters for typing and updated model name
  const connectLiveSession = useCallback(async (context: AudioContext, micStream: MediaStream, isPausedRef: React.RefObject<boolean>) => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API_KEY not configured.");
    
    const ai = new GoogleGenAI({ apiKey });
    realtimeTranscriptAccumulatorRef.current = '';
    setRealtimeTranscription('');

    liveSessionPromiseRef.current = ai.live.connect({
      // Fix: Updated to recommended native audio model version
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          micStreamSourceRef.current = context.createMediaStreamSource(micStream);
          scriptProcessorRef.current = context.createScriptProcessor(4096, 1, 1);
          scriptProcessorRef.current.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            
            const pcmBlob = {
              data: encode(new Uint8Array(int16.buffer)),
              mimeType: 'audio/pcm;rate=16000',
            };
            liveSessionPromiseRef.current?.then(session => {
              if (session && !isPausedRef.current) session.sendRealtimeInput({ media: pcmBlob });
            });
          };
          micStreamSourceRef.current.connect(scriptProcessorRef.current);
          scriptProcessorRef.current.connect(context.destination);
        },
        onmessage: (msg: LiveServerMessage) => {
          const chunk = msg.serverContent?.inputTranscription;
          if (chunk) {
            if ((chunk as any).isFinal) {
              realtimeTranscriptAccumulatorRef.current += chunk.text + ' ';
              setRealtimeTranscription(realtimeTranscriptAccumulatorRef.current);
              onTranscriptionUpdate(realtimeTranscriptAccumulatorRef.current);
            } else {
              setRealtimeTranscription(realtimeTranscriptAccumulatorRef.current + chunk.text);
            }
          }
        },
        onerror: (e) => console.error('Live error:', e),
      },
      config: { responseModalities: [Modality.AUDIO], inputAudioTranscription: {} },
    });
  }, [onTranscriptionUpdate]);

  return { realtimeTranscription, setRealtimeTranscription, realtimeTranscriptAccumulatorRef, cleanupLiveSession, connectLiveSession };
};
