
import { AppSettings, CustomInstruction, SystemPrompt, SupportedLanguage, TranscriptionQuality, TranscriptionOutputFormat, Theme } from '../types';
import { LLM_PROVIDERS } from './appConfig';

export const DEFAULT_AUDIO_SETTINGS: AppSettings['audio'] = {
  bitrate: 128000,
  channels: "mono",
  enableAutoPause: true,
  autoPauseTimeoutSeconds: 10,
  autoPauseSensitivityDb: -20,
  enableEmotionAnalysis: false,
  echoCancellation: false,
  autoManageEchoCancellation: true,
  echoCancellationStrength: "Standard",
  noiseSuppression: false,
  autoGainControl: true,
  waveformStyle: 'spectrum',
};

export const DEFAULT_TRANSCRIPTION_SETTINGS: AppSettings['transcription'] = {
  language: "Italian" as SupportedLanguage,
  quality: TranscriptionQuality.LEVEL_3,
  outputFormat: TranscriptionOutputFormat.TXT,
  attemptSpeakerDiarization: false,
  approximateSpeakerCount: 0,
  includeDateTimeInText: false,
  enableAutoSave: false,
  autoSaveIntervalSeconds: 10,
  autoScreenshotIntervalSeconds: 60,
  enableChunkedRecording: true,
  chunkRecordingIntervalSeconds: 900, // Updated to 15 minutes (15 * 60)
  enableRealtimeTranscription: false,
  enableAutoPipeline: true,
  transcriptionEngine: 'gemini' as const,
  whisperModel: 'Xenova/whisper-tiny',
  liveModel: 'gemini-2.5-flash-native-audio-latest',
  autoTranscribeChunks: true,
};

export const DEFAULT_LLM_SETTINGS: AppSettings['llm'] = {
  provider: 'Google',
  model: 'gemini-3-flash-preview',
  apiBaseUrl: '',
  customApiKey: '',
  customPromptInstruction: "Follow the user's custom instructions precisely.",
  enhanceWithWebSearch: false,
  maxRetries: 3,
  timeout: 600,
  rateLimitRequests: 15,
  rateLimitPeriodSeconds: 60,
  apiKeySource: 'system',
};

export const DEFAULT_APPEARANCE_SETTINGS: AppSettings['appearance'] = {
  theme: Theme.DARK,
};

export const DEFAULT_CUSTOM_INSTRUCTIONS: CustomInstruction[] = [];

// ── System Prompts ─────────────────────────────────────────────────────────────
// Placeholders: {{LANGUAGE}}, {{DATE}}, {{DIARIZATION}}, {{EXTRA}}
// {{EXTRA}} is replaced with the user's additional context string (if any)
// {{DATE}} is replaced with the formatted meeting date
// {{LANGUAGE}} is replaced with the selected transcription language

function mkSysPrompt(
  id: string, name: string, description: string,
  category: SystemPrompt['category'], text: string,
): SystemPrompt {
  return { id, name, description, category, text, defaultText: text };
}

export const DEFAULT_SYSTEM_PROMPTS: SystemPrompt[] = [
  mkSysPrompt(
    'transcription-main',
    'Transcription Prompt',
    'Main instruction sent to the LLM when transcribing audio chunks.',
    'transcription',
    `Transcribe accurately in {{LANGUAGE}}.{{DIARIZATION}} IMPORTANT: if the audio contains no recognizable human speech — silence, noise, background sounds, music, or unintelligible audio — you MUST respond with only the literal string: [chunk senza audio riconoscibile]. Never invent, guess, or hallucinate words. Only transcribe words you can clearly hear. {{EXTRA}}`,
  ),
  mkSysPrompt(
    'llm-system',
    'LLM System Role',
    'Base system instruction that defines the AI assistant role for all analysis tasks.',
    'system',
    `Sei un assistente esperto in verbali di riunione. Usa sempre la lingua {{LANGUAGE}}. Presta particolare attenzione ai nomi dei partecipanti che possono essere indicati sia nella trascrizione che nelle "Bubble Notes" supplementari.`,
  ),
  mkSysPrompt(
    'analysis-minutes-concise',
    'Meeting Minutes (Concise)',
    'Prompt for generating a concise, email-ready meeting minutes document.',
    'analysis',
    `Crea un verbale di riunione CONCISO e PROFESSIONALE.
        FORMATO: Deve essere pronto per essere incollato in una MAIL.
        - Inizia ESATTAMENTE con: "Salve a tutti,\\n\\na voi la minuta dell'incontro Oggetto: [Inserisci Oggetto] avuto in Data: {{DATE}},"
        - Poi scrivi: "Partecipanti: [Elenca i partecipanti trovati nella trascrizione o nelle bubble notes]"
        - Separatore: "---"
        - Sezioni (usa ###): Obiettivo della Riunione, Punti Trattati e Dati Emersi, Decisioni Prese.
        - Fondamentale: Per "Punti Trattati", usa elenchi puntati nidificati per mostrare la gerarchia dei concetti.
        - Fondamentale: Crea una sezione "### Azioni e Prossimi Passi (To-Do List)" formattata come una TABELLA MARKDOWN con colonne: | Azione | Responsabile | Scadenza |.
        - Chiudi con: "Saluti"{{EXTRA}}`,
  ),
  mkSysPrompt(
    'analysis-minutes-detailed',
    'Meeting Minutes (Detailed)',
    'Prompt for generating a detailed, comprehensive meeting minutes document.',
    'analysis',
    `Crea un verbale di riunione DETTAGLIATO e COMPLETO.
        FORMATO: Deve essere pronto per essere incollato in una MAIL o DOCUMENTO.
        - Inizia ESATTAMENTE con: "Salve a tutti,\\n\\na voi la minuta dell'incontro Oggetto: [Inserisci Oggetto] avuto in Data: {{DATE}},"
        - Poi scrivi: "Partecipanti: [Elenca i partecipanti trovati nella trascrizione o nelle bubble notes]"
        - Separatore: "---"
        - Sezioni (usa ###): Obiettivo della Riunione, Punti Trattati e Dati Emersi, Decisioni Prese.
        - Fondamentale: Per "Punti Trattati", cattura ogni sfumatura e dettaglio tecnico, usando elenchi puntati nidificati in modo molto chiaro.
        - Fondamentale: Crea una sezione "### Azioni e Prossimi Passi (To-Do List)" formattata come una TABELLA MARKDOWN con colonne: | Azione | Responsabile | Scadenza |.
        - Chiudi con: "Saluti"{{EXTRA}}`,
  ),
  mkSysPrompt(
    'analysis-summary',
    'Summary',
    'Prompt for generating a concise summary of the meeting content.',
    'analysis',
    `Riassumi il contenuto in modo coinciso.{{EXTRA}}`,
  ),
  mkSysPrompt(
    'analysis-10points',
    '10 Key Points',
    'Prompt for extracting exactly 10 numbered key points from the meeting.',
    'analysis',
    `Estrai esattamente 10 punti chiave numerati.{{EXTRA}}`,
  ),
  mkSysPrompt(
    'analysis-timeline',
    'HTML Timeline Report',
    'Prompt for generating a professional dark-themed HTML timeline report.',
    'analysis',
    `Crea un report HTML timeline professionale e dettagliato.
        REQUISITI DI STILE:
        - Usa CSS inline. Tema scuro (background: #111827; color: #f3f4f6;).
        - Font sans-serif moderno (Inter, system-ui).
        - Timeline con linea verticale accentata (border-left: 2px solid #3b82f6).
        - Ogni evento della timeline deve avere: Orario, Speaker (se rilevabile), Contenuto.

        REQUISITI DI CONTENUTO:
        - Analizza la trascrizione e dividila in blocchi logici o temporali (es. ogni 2-3 minuti o per cambio argomento).
        - Identifica i vari interlocutori (Diarization) e usa etichette chiare (es. "Speaker A", "Intervistatore", o nomi se citati).
        - INTEGRAZIONE BUBBLE NOTES: Inserisci le Bubble Notes nei punti temporali corretti della timeline.
        - Per ogni Bubble Note, scrivi una versione RIVISTA, CHIARA e PROFESSIONALE del suo contenuto.
        - IMMAGINI: Se una Bubble Note contiene un'immagine (riferita come [IMAGE_REF_B#_I#]), inserisci ESATTAMENTE questo tag HTML: <img src="[IMAGE_REF_B#_I#]" style="max-width:100%; border-radius:12px; margin:15px 0; border: 1px solid #374151; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">.

        FORMATO OUTPUT:
        - Restituisci SOLO il codice HTML contenuto in un div con classe "timeline-report".
        - Non includere blocchi di codice markdown (\`\`\`html).
        - Assicurati che l'HTML sia ben strutturato e leggibile.{{EXTRA}}`,
  ),
  mkSysPrompt(
    'analysis-interview',
    'Interview / Dialogue Format',
    'Prompt for reformatting the transcript as an interview or dialogue.',
    'analysis',
    `Formatta come intervista/dialogo.{{EXTRA}}`,
  ),
];

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: DEFAULT_APPEARANCE_SETTINGS,
  audio: DEFAULT_AUDIO_SETTINGS,
  transcription: DEFAULT_TRANSCRIPTION_SETTINGS,
  llm: DEFAULT_LLM_SETTINGS,
  customInstructions: DEFAULT_CUSTOM_INSTRUCTIONS,
  systemPrompts: DEFAULT_SYSTEM_PROMPTS,
};
