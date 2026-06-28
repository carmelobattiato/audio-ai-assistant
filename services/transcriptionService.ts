


import { llmService } from './geminiService';
import { blobToBase64, getMimeTypeFromBlob } from '../utils/audioUtils';
import { TranscriptionSettings, AppSettings, CustomInstruction } from '../types';

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
    console.log(`transcriptionService: Starting transcription. Language: ${language}, Diarization: ${attemptSpeakerDiarization}, Approx Speakers: ${approximateSpeakerCount}, FileName: ${fileName}`);
    try {
      const audioBase64 = await blobToBase64(audioBlob);
      let mimeTypeForApi = getMimeTypeFromBlob(audioBlob);
      const lcFileName = (fileName || "").toLowerCase();

      // If MIME type is generic or doesn't specify codecs (common for uploads),
      // try to infer a more specific one from the filename for the API call.
      if (lcFileName && (mimeTypeForApi === 'application/octet-stream' || !mimeTypeForApi.includes('codecs='))) {
        let preferredMimeType = mimeTypeForApi; // Default to original if no match
        if (lcFileName.endsWith('.webm')) {
            preferredMimeType = 'audio/webm;codecs=opus';
        } else if (lcFileName.endsWith('.mp3')) {
            preferredMimeType = 'audio/mpeg';
        } else if (lcFileName.endsWith('.wav')) {
            preferredMimeType = 'audio/wav';
        } else if (lcFileName.endsWith('.ogg')) {
            // Ogg can contain Opus or Vorbis. Opus is a good modern default.
            preferredMimeType = 'audio/ogg;codecs=opus'; 
        } else if (lcFileName.endsWith('.m4a') || lcFileName.endsWith('.aac')) {
             preferredMimeType = 'audio/aac'; // Though m4a is a container, often AAC
        } else if (lcFileName.endsWith('.flac')) {
             preferredMimeType = 'audio/flac';
        }
        
        if (preferredMimeType !== mimeTypeForApi) {
            console.log(`transcriptionService: Original MIME type was "${mimeTypeForApi}" for file "${fileName}". Overriding to "${preferredMimeType}" for Gemini API call based on extension.`);
            mimeTypeForApi = preferredMimeType;
        } else {
            console.log(`transcriptionService: Original MIME type "${mimeTypeForApi}" for file "${fileName}" kept as no specific override rule matched or it already contained codec info.`);
        }
      }
      
      console.log(`transcriptionService: Audio Blob info - MimeType for API: ${mimeTypeForApi}, Size: ${audioBlob.size} bytes`);

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
      console.log("transcriptionService: Transcription received, length:", transcription.length);
      return { transcription, usageMetadata };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn("transcriptionService: Transcription was cancelled by the user.");
        return { transcription: "Error: Transcription was cancelled." };
      }
      console.error("transcriptionService: Error during transcription process:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { transcription: `Transcription failed: ${errorMessage}` };
    }
  },
};