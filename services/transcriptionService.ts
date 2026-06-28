


import { llmService } from './geminiService';
import { blobToBase64, getMimeTypeFromBlob } from '../utils/audioUtils';
import { TranscriptionSettings, AppSettings, CustomInstruction } from '../types';
import { loggingService } from './loggingService';

/**
 * Wrapper di trascrizione sopra `llmService.transcribeAudio`. Si occupa di:
 * conversione blob→base64, rilevamento/normalizzazione del MIME type per
 * browser/OS (inferito dal nome file se generico), risoluzione del template
 * prompt e delle istruzioni custom, diarization. Delega affidabilità/retry al gateway.
 */
export const transcriptionService = {
  /**
   * @param audioBlob Blob audio da trascrivere.
   * @param settings Lingua, diarization, numero speaker, nome file.
   * @param llmSettings Config provider/modello (BYOK).
   * @param signal AbortSignal opzionale.
   * @returns Testo trascritto + usage metadata (token).
   */
  transcribe: async (
    audioBlob: Blob,
    settings: TranscriptionSettings,
    llmSettings: AppSettings['llm'],
    signal?: AbortSignal,
    transcriptionPromptTemplate?: string,
    customInstructions?: CustomInstruction[],
  ): Promise<{ transcription: string, usageMetadata?: { inputTokens: number, outputTokens: number, totalTokens: number } }> => {
    const { language, attemptSpeakerDiarization, approximateSpeakerCount, fileName } = settings;
    loggingService.info('TRANSCRIPTION_START', `lang=${language} diarization=${String(attemptSpeakerDiarization)} file=${fileName}`);
    try {
      const audioBase64 = await blobToBase64(audioBlob);
      let mimeTypeForApi = getMimeTypeFromBlob(audioBlob);
      const lcFileName = (fileName || "").toLowerCase();

      if (lcFileName && (mimeTypeForApi === 'application/octet-stream' || !mimeTypeForApi.includes('codecs='))) {
        let preferredMimeType = mimeTypeForApi;
        if (lcFileName.endsWith('.webm')) {
            preferredMimeType = 'audio/webm;codecs=opus';
        } else if (lcFileName.endsWith('.mp3')) {
            preferredMimeType = 'audio/mpeg';
        } else if (lcFileName.endsWith('.wav')) {
            preferredMimeType = 'audio/wav';
        } else if (lcFileName.endsWith('.ogg')) {
            preferredMimeType = 'audio/ogg;codecs=opus';
        } else if (lcFileName.endsWith('.m4a') || lcFileName.endsWith('.aac')) {
            preferredMimeType = 'audio/aac';
        } else if (lcFileName.endsWith('.flac')) {
            preferredMimeType = 'audio/flac';
        }
        if (preferredMimeType !== mimeTypeForApi) {
            loggingService.info('TRANSCRIPTION_MIME_OVERRIDE', `${mimeTypeForApi} → ${preferredMimeType} (${fileName})`);
            mimeTypeForApi = preferredMimeType;
        }
      }

      let customInstruction = "Please provide the most accurate transcription possible, paying close attention to detail.";
      const activeRules = (customInstructions ?? []).filter(r => r.enabled);
      if (activeRules.length > 0) {
        customInstruction += `\n\nRegole personalizzate:\n${activeRules.map(r => `- ${r.text}`).join('\n')}`;
      }

      const { transcription, usageMetadata } = await llmService.transcribeAudio(
        audioBase64,
        mimeTypeForApi,
        language,
        llmSettings,
        customInstruction,
        attemptSpeakerDiarization,
        approximateSpeakerCount,
        signal,
        transcriptionPromptTemplate,
      );
      return { transcription, usageMetadata };
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Aborted')) {
        throw error;
      }
      loggingService.error('TRANSCRIPTION_ERROR', error instanceof Error ? error.message : String(error));
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { transcription: `Error: ${errorMessage}` };
    }
  },
};