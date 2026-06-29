
import { ModelInfo } from '../types';

export const APP_TITLE = "Audio AI Assistant";
export const APP_CREATOR = "Carmelo Battiato";
export const APP_VERSION = "1.132";
export const APP_BUILD_TIMESTAMP = "2025-06-28_00-00-00";

export const LLM_PROVIDERS: { [key: string]: { models: ModelInfo[]; needsBaseUrl?: boolean; docsUrl?: string, isCustom?: boolean } } = {
  'Google': {
    models: [
      {
        name: 'gemini-3.5-flash',
        specialization: 'Nuova generazione stabile — Flagship 2026, agentic, coding, multimodale. Migliore intelligenza su tutta la gamma Flash.',
        cost: 'In: $1.50 | Out: $9.00',
        releaseDate: '2026',
        recommendedFor: ['analysis', 'chat'],
      },
      {
        name: 'gemini-3-flash-preview',
        specialization: 'Frontier preview — Ottimo bilanciamento velocità/qualità per analisi riunioni, riassunti e chatbot.',
        cost: 'In: $0.50 | Out: $3.00',
        releaseDate: 'Dic 2025',
        recommendedFor: ['analysis', 'chat'],
      },
      {
        name: 'gemini-3.1-pro-preview',
        specialization: 'Massima qualità — SOTA reasoning: sceglilo per verbali molto dettagliati, analisi complesse o audio difficile.',
        cost: 'In: $2.00 | Out: $12.00',
        releaseDate: 'Feb 2026',
        recommendedFor: ['analysis'],
      },
      {
        name: 'gemini-3.1-flash-lite',
        specialization: 'Economico stabile — Ideale per trascrizioni in batch, sessioni lunghe o chatbot ad alto volume con budget limitato.',
        cost: 'In: $0.25 | Out: $1.50',
        releaseDate: 'Feb 2026',
        recommendedFor: ['transcription', 'chat'],
      },
      {
        name: 'gemini-2.5-pro',
        specialization: 'Reasoning avanzato — Analisi strutturata e ragionamento profondo a costo contenuto rispetto ai modelli Pro più recenti.',
        cost: '≤200K In: $1.25 | Out: $10.00 / >200K In: $2.50 | Out: $15.00',
        releaseDate: 'Giu 2025',
        recommendedFor: ['analysis'],
      },
      {
        name: 'gemini-2.5-flash',
        specialization: 'Veloce e audio-capable — Stabile, context 1M token, ottimo per trascrizioni audio e sessioni di registrazione estese.',
        cost: 'In: $0.30 | Out: $2.50',
        releaseDate: 'Giu 2025',
        recommendedFor: ['transcription'],
      },
      {
        name: 'gemini-2.5-flash-lite',
        specialization: 'Costo minimo — Per trascrizioni semplici, lingua chiara e massima scalabilità a volume elevato.',
        cost: 'In: $0.10 | Out: $0.40',
        releaseDate: 'Lug 2025',
        recommendedFor: ['transcription'],
      },
    ],
    docsUrl: 'https://ai.google.dev/docs',
  },
  'Custom OpenAI-compatible': {
    models: [],
    isCustom: true,
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
  },
};

export const MAX_SESSIONS = 15;
export const MAX_SESSION_SIZE_MB = 50;
export const DEBOUNCE_DELAY = 300;
export const MAX_FILE_SIZE_MB = 100;
