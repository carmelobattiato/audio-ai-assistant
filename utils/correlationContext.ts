import { SavedSessionData } from '../types';
import { htmlToPlainText, formatTime, bubbleNotesToText } from './textUtils';

export function buildCorrelatedSessionsContext(sessions: SavedSessionData[]): string {
  if (!sessions.length) return '';

  const header =
    `\n\n---\n[HISTORICAL CONTEXT - CORRELATED SESSIONS]\n` +
    `The following sessions are PAST events. Use them for context ONLY. ` +
    `Do NOT confuse them with the current session.\n\n`;

  const blocks = sessions.map((s, i) => {
    const date = s.audioRecordingStartTime
      ? new Date(s.audioRecordingStartTime).toLocaleString('en-GB')
      : 'unknown date';
    const duration = s.audioDuration ? formatTime(s.audioDuration) : 'N/A';
    const lines: string[] = [
      `=== Session ${i + 1}: "${s.audioFileName}" | ${date} | Duration: ${duration} ===`,
      `TRANSCRIPT:\n${htmlToPlainText(s.transcribedText)}`,
    ];
    if (s.llmProcessedText) lines.push(`AI ANALYSIS:\n${htmlToPlainText(s.llmProcessedText)}`);
    if (s.bubbleNotes?.length) lines.push(`NOTES:\n${bubbleNotesToText(s.bubbleNotes)}`);
    return lines.join('\n\n');
  });

  return header + blocks.join('\n\n---\n\n') + '\n---\n';
}
