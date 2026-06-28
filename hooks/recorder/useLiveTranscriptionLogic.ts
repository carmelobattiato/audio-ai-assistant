
import React, { useRef, useState, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { encode } from '../../utils/audioUtils';
import { loggingService } from '../../services/loggingService';

const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

export const useLiveTranscriptionLogic = (
  onTranscriptionUpdate: (text: string) => void,
  options?: { liveModel?: string; apiKey?: string },
) => {
  const [realtimeTranscription, setRealtimeTranscription] = useState('');
  const realtimeTranscriptAccumulatorRef = useRef('');
  const liveSessionPromiseRef = useRef<Promise<any> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
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

  const connectLiveSession = useCallback(async (
    context: AudioContext,
    micStream: MediaStream,
    isPausedRef: React.RefObject<boolean>,
  ) => {
    const apiKey = optionsRef.current?.apiKey?.trim() || process.env.API_KEY;
    if (!apiKey) throw new Error('API key not configured. Set it in Settings → LLM Configuration.');

    const model = optionsRef.current?.liveModel ?? DEFAULT_LIVE_MODEL;
    loggingService.info('LIVE_TRANS', `Connecting with model=${model}`);

    const ai = new GoogleGenAI({ apiKey });
    realtimeTranscriptAccumulatorRef.current = '';
    setRealtimeTranscription('');

    liveSessionPromiseRef.current = ai.live.connect({
      model,
      callbacks: {
        onopen: () => {
          loggingService.info('LIVE_TRANS', 'Session opened — wiring audio pipeline');
          micStreamSourceRef.current = context.createMediaStreamSource(micStream);
          scriptProcessorRef.current = context.createScriptProcessor(4096, 1, 1);

          let chunksSent = 0;
          scriptProcessorRef.current.onaudioprocess = (e) => {
            if (isPausedRef.current) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = (inputData[i] ?? 0) * 32768;

            const pcmBlob = {
              data: encode(new Uint8Array(int16.buffer)),
              mimeType: 'audio/pcm;rate=16000',
            };
            liveSessionPromiseRef.current?.then(session => {
              if (session && !isPausedRef.current) {
                session.sendRealtimeInput({ media: pcmBlob });
                chunksSent++;
                if (chunksSent === 1 || chunksSent % 50 === 0) {
                  loggingService.debug('LIVE_TRANS_AUDIO', `Sent ${chunksSent} audio chunks`);
                }
              }
            }).catch(err => loggingService.error('LIVE_TRANS_AUDIO', `Failed to send realtime audio: ${err}`));
          };

          micStreamSourceRef.current.connect(scriptProcessorRef.current);
          scriptProcessorRef.current.connect(context.destination);
        },
        onmessage: (msg: LiveServerMessage) => {
          loggingService.debug('LIVE_TRANS_MSG', 'Message received', { keys: Object.keys(msg) });

          const chunk = msg.serverContent?.inputTranscription;
          if (chunk) {
            const isFinal = (chunk as { isFinal?: boolean }).isFinal;
            loggingService.debug('LIVE_TRANS_TOKEN', `token="${chunk.text}" isFinal=${isFinal}`);
            if (isFinal) {
              realtimeTranscriptAccumulatorRef.current += chunk.text + ' ';
              setRealtimeTranscription(realtimeTranscriptAccumulatorRef.current);
              onTranscriptionUpdate(realtimeTranscriptAccumulatorRef.current);
            } else {
              setRealtimeTranscription(realtimeTranscriptAccumulatorRef.current + chunk.text);
            }
          }
        },
        onerror: (e: unknown) => {
          loggingService.error('LIVE_TRANS_ERROR', `SDK error: ${JSON.stringify(e)}`);
        },
        onclose: (e: unknown) => {
          loggingService.warn('LIVE_TRANS_CLOSE', `Session closed [model=${model}]: ${JSON.stringify(e)}`);
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
      },
    });

    await liveSessionPromiseRef.current;
  }, [onTranscriptionUpdate]);

  return {
    realtimeTranscription,
    setRealtimeTranscription,
    realtimeTranscriptAccumulatorRef,
    cleanupLiveSession,
    connectLiveSession,
  };
};
