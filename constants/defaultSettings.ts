
import { AppSettings, CustomInstruction, SystemPrompt, SupportedLanguage, TranscriptionQuality, TranscriptionOutputFormat, Theme } from '../types';
import { LLM_PROVIDERS } from './appConfig';

export const DEFAULT_AUDIO_SETTINGS: AppSettings['audio'] = {
  bitrate: 128000,
  channels: "mono",
  enableAutoPause: true,
  autoPauseTimeoutSeconds: 10,
  autoPauseSensitivityDb: -20,
  echoCancellation: false,
  autoManageEchoCancellation: true,
  echoCancellationStrength: "Standard",
  noiseSuppression: false,
  autoGainControl: true,
  waveformStyle: 'spectrum',
  enableAutoStop: true,
  autoNotifyAfterPausedMinutes: 5,
  autoStopAfterPausedMinutes: 15,
  autoStopWarningSeconds: 60,
};

export const DEFAULT_TRANSCRIPTION_SETTINGS: AppSettings['transcription'] = {
  language: "Italian" as SupportedLanguage,
  quality: TranscriptionQuality.LEVEL_3,
  outputFormat: TranscriptionOutputFormat.TXT,
  attemptSpeakerDiarization: true,
  approximateSpeakerCount: 0,
  includeDateTimeInText: false,
  enableAutoSave: false,
  autoSaveIntervalSeconds: 10,
  autoScreenshotIntervalSeconds: 60,
  enableChunkedRecording: true,
  chunkRecordingIntervalSeconds: 900, // Updated to 15 minutes (15 * 60)
  enableRealtimeTranscription: false,
  enableAutoPipeline: true,
  liveModel: 'gemini-2.5-flash-native-audio-latest',
  autoTranscribeChunks: true,
};

export const DEFAULT_LLM_SETTINGS: AppSettings['llm'] = {
  provider: 'Google',
  model: 'gemini-2.5-flash-lite',
  transcriptionModel: 'gemini-2.5-flash-lite',
  chatModel: 'gemini-2.5-flash-lite',
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
  userEmail: '',
  meetingNotificationsEnabled: true,
  meetingNotificationLeadMinutes: 10,
  githubRepoUrl: 'https://github.com/carmelobattiato/audio-ai-assistant',
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
    `Transcribe accurately in {{LANGUAGE}}.{{DIARIZATION}} Preserve technical terms, acronyms, product names, and proper nouns exactly as spoken — do not translate or paraphrase them. IMPORTANT: if the audio contains no recognizable human speech — silence, noise, background sounds, music, or unintelligible audio — you MUST respond with only the literal string: [chunk senza audio riconoscibile]. Never invent, guess, or hallucinate words. Only transcribe words you can clearly hear. {{EXTRA}}`,
  ),
  mkSysPrompt(
    'llm-system',
    'LLM System Role',
    'Base system instruction that defines the AI assistant role for all analysis tasks.',
    'system',
    `Sei un assistente esperto in documentazione tecnica e verbali di riunione, con competenze nel settore IT e consulting. Usa sempre la lingua {{LANGUAGE}} per l'output, ma preserva i termini tecnici inglesi (es. API, sprint, backlog, deploy, microservices) nella loro forma originale senza tradurli. Privilegia sempre l'accuratezza rispetto alla parafrasi. Presta particolare attenzione ai nomi dei partecipanti che possono essere indicati sia nella trascrizione che nelle "Bubble Notes" supplementari.`,
  ),
  mkSysPrompt(
    'analysis-minutes-concise',
    'Meeting Minutes (Concise)',
    'Prompt for generating a concise, email-ready meeting minutes document.',
    'analysis',
    `Crea una minuta di riunione BREVE e PRONTA PER L'INVIO via email. Massimo 250 parole nel corpo, escludendo intestazione e tabella azioni.
        - Inizia ESATTAMENTE con: "Salve a tutti,\\n\\na voi la minuta dell'incontro Oggetto: [deduci l'oggetto dal contenuto della trascrizione] avuto in Data: {{DATE}},"
        - Poi scrivi: "Partecipanti: [elenca i partecipanti trovati nella trascrizione o nelle bubble notes]"
        - Separatore: "---"
        - ### Obiettivo: una riga.
        - ### Punti chiave: massimo 5 bullet sintetici (una riga ciascuno, no sotto-bullet).
        - ### Decisioni: elenco puntato solo delle decisioni definitive.
        - ### To-Do: tabella markdown | Azione | Responsabile | Scadenza |
        - Chiudi con: "Saluti"{{EXTRA}}`,
  ),
  mkSysPrompt(
    'analysis-minutes-detailed',
    'Meeting Minutes (Detailed)',
    'Prompt for generating a detailed, comprehensive meeting minutes document.',
    'analysis',
    `Crea un verbale di riunione COMPLETO E APPROFONDITO, adatto come documento di riferimento tecnico.
        - Inizia ESATTAMENTE con: "Salve a tutti,\\n\\na voi la minuta dell'incontro Oggetto: [deduci l'oggetto dal contenuto della trascrizione] avuto in Data: {{DATE}},"
        - Poi scrivi: "Partecipanti: [elenca i partecipanti con ruolo se desumibile dalla trascrizione]"
        - Separatore: "---"
        - ### Obiettivo della Riunione: 2-3 righe di contesto e scopo.
        - ### Punti Trattati e Dati Emersi: per ogni macro-argomento discusso, un sotto-titolo #### con elenchi puntati nidificati. Cattura ogni dettaglio tecnico, dato, cifra, vincolo o requisito menzionato.
        - ### Decisioni Prese: elenco con il razionale di ogni decisione se emergente dalla discussione.
        - ### Elementi di Rischio o Attenzione: problemi, dubbi, dipendenze critiche emerse.
        - ### To-Do e Prossimi Passi: tabella markdown | Azione | Responsabile | Scadenza | Note |
        - Chiudi con: "Saluti"{{EXTRA}}`,
  ),
  mkSysPrompt(
    'analysis-summary',
    'Summary',
    'Prompt for generating a concise summary of the meeting content.',
    'analysis',
    `Produci un sommario professionale della riunione in {{LANGUAGE}}.
- **Contesto**: una riga su chi si è incontrato e perché.
- **Punti principali**: 3-5 bullet con i temi discussi e i dati chiave emersi.
- **Decisioni**: elenco delle decisioni prese (ometti se nessuna).
- **Azioni**: elenco sintetico degli action items (ometti se nessuno).
Tono neutro e professionale. Massimo 150 parole.{{EXTRA}}`,
  ),
  mkSysPrompt(
    'analysis-10points',
    '10 Key Points',
    'Prompt for extracting exactly 10 numbered key points from the meeting.',
    'analysis',
    `Estrai esattamente 10 punti chiave dalla riunione. Ordina per importanza decrescente, non per ordine cronologico. Ogni punto deve essere autonomo e comprensibile senza leggere gli altri — evita riferimenti come "come detto sopra" o "il punto precedente". Usa frasi complete e concise.{{EXTRA}}`,
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
    `Riformatta la trascrizione come intervista o dialogo strutturato.
- Usa etichette speaker chiare: **Nome/Ruolo:** oppure **Intervistatore:** / **Candidato:** se il contesto lo suggerisce.
- Ogni intervento su un blocco separato. Non accorpare turni diversi.
- Preserva il phrasing originale — non parafrasare, solo formattare.
- Se emergono macro-argomenti distinti, inserisci un separatore tematico (### Argomento).
- Mantieni eventuali termini tecnici inalterati.{{EXTRA}}`,
  ),
  mkSysPrompt(
    'analysis-action-items',
    'Action Items & Decisions',
    'Extracts todos, decisions, open questions and next steps from the meeting.',
    'analysis',
    `Analizza la trascrizione ed estrai le informazioni operative in italiano.

## ✅ Action Items
Tabella markdown con le azioni concrete emerse. Se responsabile o scadenza non sono menzionati scrivi "—".
| Azione | Responsabile | Scadenza |
|--------|-------------|---------|

## 🟡 Decisioni Prese
Elenco puntato delle decisioni definitive prese durante la riunione.

## ❓ Punti Aperti
Questioni rimaste in sospeso o da chiarire in un prossimo step.

## 📋 Prossimi Passi Consigliati
Sequenza logica di azioni raccomandate per dare seguito alla riunione.

Se una sezione è vuota scrivi "Nessuno."{{EXTRA}}`,
  ),
  mkSysPrompt(
    'chat-system',
    'Chat Assistant Instructions',
    'Behaviour rules injected into the Meeting Chat assistant system prompt. The meeting transcript, AI analysis, and bubble notes are always included automatically.',
    'chat',
    `You are a meeting intelligence assistant with full access to the transcript, AI analysis, and notes of a recorded session. The context is typically IT or consulting: technical meetings, client interviews, or project discussions.

INSTRUCTIONS:
- Answer questions directly and concisely, referencing actual content from the meeting
- The Bubble Notes are first-person notes taken by the user during the session; treat them as high-priority context
- Preserve technical terms (API, sprint, backlog, microservices, etc.) in their original form — never translate them
- Use markdown for formatting (headings, bold, lists, tables)
- For tabular data always use markdown tables
- For data visualizations use a chart code block with this exact JSON format:
  \`\`\`chart
  {"type":"bar","title":"Chart Title","labels":["A","B","C"],"values":[10,25,15],"unit":"%"}
  \`\`\`
- When asked to draft a document (email, minutes, technical spec), write in a professional Italian style consistent with the meeting minutes format
- When asked for action items, also include implicit ones (things expressed as "dobbiamo", "bisogna", "dovresti")
- Always respond in the same language as the transcript
- Be precise and factual; never invent content not present in the meeting`,
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
