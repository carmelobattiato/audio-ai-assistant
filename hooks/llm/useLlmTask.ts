
import { useState, useCallback, useRef } from 'react';
import { Part } from "@google/genai";
import { llmService } from '../../services/geminiService';
import { LlmSettings } from '../../types';

export const useLlmTask = (settings: LlmSettings) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopTask = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsProcessing(false);
    }
  }, []);

  const executeTask = useCallback(async (parts: Part[] | string, system: string) => {
    setIsProcessing(true);
    setError(null);
    abortControllerRef.current = new AbortController();
    try {
      const res = await llmService.generateText(parts, settings, system, abortControllerRef.current.signal);
      if (res.text.startsWith("Error:")) {
        setError(res.text);
        return null;
      }
      setUsage(res.usageMetadata);
      return res;
    } catch (e: any) {
      if (e.name === 'AbortError' || e.message === 'Aborted') {
        setError("Analysis cancelled by user.");
      } else {
        setError(e.message || String(e));
      }
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [settings]);

  return { isProcessing, setIsProcessing, error, setError, usage, executeTask, stopTask };
};
