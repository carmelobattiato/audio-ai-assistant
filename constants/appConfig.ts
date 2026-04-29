
import { ModelInfo } from '../types';

export const APP_TITLE = "Audio AI Assistant";
export const APP_CREATOR = "Carmelo Battiato";
export const APP_VERSION = "1.91";
export const APP_BUILD_TIMESTAMP = "2025-06-28_00-00-00";

export const LLM_PROVIDERS: { [key: string]: { models: ModelInfo[]; needsBaseUrl?: boolean; docsUrl?: string, isCustom?: boolean } } = {
  'Google': {
    models: [
      {
        name: 'gemini-3-flash-preview',
        specialization: '★ Default consigliato — Velocità + intelligenza frontier: il miglior bilanciamento per analisi audio, riunioni e riassunti.',
        cost: 'In: $0.50 | Out: $3.00',
        releaseDate: 'Dic 2025',
      },
      {
        name: 'gemini-3.1-pro-preview',
        specialization: 'Massima qualità — SOTA reasoning con profondità e sfumature: sceglilo per analisi complesse, documenti densi o audio difficile.',
        cost: '≤200K In: $2.00 | Out: $12.00 / >200K In: $4.00 | Out: $18.00',
        releaseDate: 'Feb 2026',
      },
      {
        name: 'gemini-3.1-flash-lite-preview',
        specialization: 'Massima economia — Ideale per sessioni lunghe, trascrizioni in batch o uso ad alto volume con budget limitato.',
        cost: 'Testo/Video In: $0.25 | Out: $1.50 / Audio In: $0.50 | Out: $1.50',
        releaseDate: 'Feb 2026',
      },
      {
        name: 'gemini-2.5-pro',
        specialization: 'Ragionamento robusto (gen. precedente) — Ottimo per coding, analisi strutturata e ragionamento profondo a costo contenuto.',
        cost: '≤200K In: $1.25 | Out: $10.00 / >200K In: $2.50 | Out: $15.00',
        releaseDate: 'Giu 2025',
      },
      {
        name: 'gemini-2.5-flash',
        specialization: 'Versatile con context da 1M token — Ideale per sessioni molto lunghe o archivi audio estesi.',
        cost: 'In: $0.30 | Out: $2.50',
        releaseDate: 'Giu 2025',
      },
      {
        name: 'gemini-2.5-flash-lite',
        specialization: 'Ultra-economico — Sceglilo per trascrizioni semplici, lingua chiara e massima scalabilità a costo minimo.',
        cost: 'In: $0.10 | Out: $0.40',
        releaseDate: 'Lug 2025',
      },
      {
        name: 'gemini-2.0-flash',
        specialization: 'Gen 2 multimodale — Affidabile e veloce, buona scelta se i modelli più recenti non sono disponibili nella tua region.',
        cost: 'In: $0.10 | Out: $0.40',
        releaseDate: 'Feb 2025',
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

export const GEMINI_MODEL_TEXT = 'gemini-3-flash-preview';
export const MAX_SESSIONS = 15;
export const MAX_SESSION_SIZE_MB = 50;
export const DEBOUNCE_DELAY = 300;
export const MAX_FILE_SIZE_MB = 100;
