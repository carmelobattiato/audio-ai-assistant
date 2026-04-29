


import { llmService } from './geminiService';
import { whisperService } from './whisperService';
import { blobToBase64, getMimeTypeFromBlob } from '../utils/audioUtils';
import { TranscriptionQuality, SupportedLanguage, TranscriptionSettings, AppSettings } from '../types';

export const transcriptionService = {
  transcribe: async (
    audioBlob: Blob,
    settings: TranscriptionSettings, // Pass full TranscriptionSettings
    llmSettings: AppSettings['llm'], // Pass LLM settings for provider/key info
    signal?: AbortSignal,
    transcriptionPromptTemplate?: string,
  ): Promise<{ transcription: string, usageMetadata?: { inputTokens: number, outputTokens: number, totalTokens: number } }> => {
    if (settings.transcriptionEngine === 'whisper') {
      const model = (settings.whisperModel ?? 'Xenova/whisper-tiny')
        .replace('openai/whisper-', 'Xenova/whisper-');
      console.log(`transcriptionService: Using local Whisper engine (${model}).`);
      try {
        // If not in memory yet, auto-load from browser cache before transcribing
        if (!whisperService.isLoaded()) {
          const cached = await whisperService.checkModelCached(model);
          if (!cached) {
            return { transcription: 'Whisper model not downloaded. Go to Settings → Transcription to download it.' };
          }
          console.log('transcriptionService: Loading Whisper model from cache…');
          await whisperService.loadModel(model, () => {});
        }
        const text = await whisperService.transcribe(audioBlob, settings.language, signal);
        return { transcription: text };
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return { transcription: 'Error: Transcription was cancelled.' };
        return { transcription: `Whisper error: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    const { language, quality, attemptSpeakerDiarization, approximateSpeakerCount, fileName } = settings;
    console.log(`transcriptionService: Starting transcription. Language: ${language}, Quality: ${quality}, Diarization: ${attemptSpeakerDiarization}, Approx Speakers: ${approximateSpeakerCount}, FileName: ${fileName}`);
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

      let customInstruction = "";
      if (quality === TranscriptionQuality.LEVEL_5) {
        customInstruction = "Please provide the most accurate transcription possible, paying close attention to detail.";
      } else if (quality === TranscriptionQuality.LEVEL_1) {
        customInstruction = "Provide a quick transcription, prioritizing speed over absolute accuracy.";
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