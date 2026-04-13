
import { useCallback } from 'react';
import { Part } from "@google/genai";
import { BubbleNote, SupportedLanguage, TranscriptionSettings } from '../../types';
import { formatTime, parseHtmlForGeminiParts } from '../../utils/textUtils';

export const usePromptBuilder = () => {
  const serializeNotes = useCallback((bubbles: BubbleNote[]): Part[] => {
    const parts: Part[] = [];
    if (!bubbles.length) return [];
    parts.push({ text: `\n\n--- SUPPLEMENTARY BUBBLE NOTES ---\n` });
    bubbles.forEach((b, i) => {
      parts.push({ text: `\n[Note ${i + 1} at ${formatTime(b.recordingElapsedTime)}]:\n` });
      parts.push(...parseHtmlForGeminiParts(b.contentHtml));
    });
    parts.push({ text: `\n--- END OF BUBBLE NOTES ---\n\n` });
    return parts;
  }, []);

  const buildBaseContext = useCallback((lang: SupportedLanguage, duration: number, start: Date | null, trans: TranscriptionSettings) => {
    let ctx = `Contextual Info:\n- Language: ${lang}\n`;
    if (duration > 0) ctx += `- Duration: ${formatTime(duration)}\n`;
    if (start) ctx += `- Date: ${start.toLocaleString()}\n`;
    ctx += `- Diarization: ${trans.attemptSpeakerDiarization ? 'Yes' : 'No'}\n---\n\n`;
    return ctx;
  }, []);

  return { serializeNotes, buildBaseContext };
};
