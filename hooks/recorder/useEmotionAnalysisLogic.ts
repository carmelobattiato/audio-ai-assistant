
import { useState, useRef, useCallback } from 'react';
import { Emotion, EmotionEvent, LlmSettings, LlmUsageStats } from '../../types';
import { blobToBase64 } from '../../utils/audioUtils';
import { llmService } from '../../services/geminiService';

export const useEmotionAnalysisLogic = (
  llmSettings: LlmSettings,
  onLlmUsage?: (stats: LlmUsageStats) => void
) => {
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>('Neutral');
  const emotionHistoryRef = useRef<EmotionEvent[]>([]);
  const emotionRecorderRef = useRef<MediaRecorder | null>(null);
  const emotionChunksRef = useRef<Blob[]>([]);
  const emotionIntervalRef = useRef<number | null>(null);

  const handleEmotionSnippet = useCallback(async (blob: Blob, elapsedTime: number, mimeType: string) => {
    const base64 = await blobToBase64(blob);
    const { emotion, usageMetadata } = await llmService.analyzeEmotion(base64, mimeType, llmSettings);

    if (usageMetadata && onLlmUsage) {
      onLlmUsage({
        functionName: 'Emotion Analysis',
        inputTokens: usageMetadata.inputTokens,
        outputTokens: usageMetadata.outputTokens,
        model: 'gemini-2.5-flash',
        provider: llmSettings.provider,
        timestamp: Date.now(),
      });
    }

    if (emotion !== 'Unknown') {
      setCurrentEmotion(emotion);
      emotionHistoryRef.current.push({ emotion, timestamp: elapsedTime });
    }
  }, [llmSettings, onLlmUsage]);

  const stopEmotionAnalysis = useCallback(() => {
    if (emotionIntervalRef.current) clearInterval(emotionIntervalRef.current);
    emotionIntervalRef.current = null;
    emotionRecorderRef.current?.stop();
    emotionRecorderRef.current = null;
  }, []);

  return { 
    currentEmotion, setCurrentEmotion, 
    emotionHistoryRef, emotionRecorderRef, emotionChunksRef, 
    emotionIntervalRef, stopEmotionAnalysis, handleEmotionSnippet 
  };
};
