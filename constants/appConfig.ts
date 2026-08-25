
import { ModelInfo } from '../types';

export const APP_TITLE = "Audio AI Assistant";
export const APP_CREATOR = "Carmelo Battiato";
export const APP_VERSION = "1.163";
export const APP_BUILD_TIMESTAMP = "2025-06-28_00-00-00";

export const LLM_PROVIDERS: { [key: string]: { models: ModelInfo[]; needsBaseUrl?: boolean; docsUrl?: string, isCustom?: boolean } } = {
  'Google': {
    models: [
      // ── Alias auto-aggiornanti ──────────────────────────────────────────────
      {
        name: 'gemini-flash-latest',
        specialization: 'Sempre aggiornato — punta automaticamente all\'ultimo Flash stabile (oggi: gemini-3.5-flash). Versione e costi possono cambiare con 2 settimane di preavviso.',
        cost: 'Prezzo del modello target (oggi: In: $0.30 | Out: $2.50)',
        releaseDate: 'Auto',
        recommendedFor: ['analysis', 'transcription', 'chat'],
      },
      {
        name: 'gemini-pro-latest',
        specialization: 'Sempre aggiornato — punta automaticamente all\'ultimo Pro stabile (oggi: gemini-3-pro-preview). Versione e costi possono cambiare con 2 settimane di preavviso.',
        cost: 'Prezzo del modello target (oggi: In: $2.00 | Out: $12.00)',
        releaseDate: 'Auto',
        recommendedFor: ['analysis'],
      },
      // ── Modelli fissi — generazione corrente ───────────────────────────────
      {
        name: 'gemini-3.7-flash',
        specialization: 'Più capace della gamma Flash — coding, agentic, multimodale. Pricing introduttivo fino al 31 dic 2026.',
        cost: 'In: $0.75 | Out: $3.75',
        releaseDate: '2026',
        recommendedFor: ['analysis', 'transcription', 'chat'],
      },
      {
        name: 'gemini-3.6-flash',
        specialization: 'Flash bilanciato — thinking integrato, multimodale, ottimo per analisi, trascrizione e chat. Pricing introduttivo fino al 31 dic 2026.',
        cost: 'In: $0.75 | Out: $3.75',
        releaseDate: '2026',
        recommendedFor: ['analysis', 'transcription', 'chat'],
      },
      {
        name: 'gemini-3.5-flash',
        specialization: 'Flagship 2026 — agentic, coding, multimodale. Migliore intelligenza su tutta la gamma Flash stabile.',
        cost: 'In: $0.30 | Out: $2.50',
        releaseDate: '2026',
        recommendedFor: ['analysis', 'chat'],
      },
      {
        name: 'gemini-3.5-flash-lite',
        specialization: 'Ultra-leggero serie 3.x — il più veloce ed economico della gamma stabile. Ideale per volumi alti con budget ridotto.',
        cost: 'In: $0.10 | Out: $0.60',
        releaseDate: '2026',
        recommendedFor: ['transcription', 'chat'],
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
        name: 'gemini-3-flash-preview',
        specialization: 'Preview prima generazione 3.x — buon bilanciamento velocità/qualità. Usa gemini-3.5-flash o superiore per nuovi progetti.',
        cost: 'In: $0.50 | Out: $3.00',
        releaseDate: 'Dic 2025',
        recommendedFor: ['analysis', 'chat'],
      },
      // ── Legacy — in scadenza ────────────────────────────────────────────────
      {
        name: 'gemini-2.5-pro',
        specialization: 'Reasoning avanzato — Analisi strutturata e ragionamento profondo. Accesso limitato ai nuovi utenti.',
        cost: '≤200K In: $1.25 | Out: $10.00 / >200K In: $2.50 | Out: $15.00',
        releaseDate: 'Giu 2025',
        recommendedFor: ['analysis'],
        eolDate: '16 ott 2026',
      },
      {
        name: 'gemini-2.5-flash',
        specialization: 'Veloce e audio-capable — Stabile, context 1M token. Usa gemini-3.5-flash per nuovi progetti.',
        cost: 'In: $0.30 | Out: $2.50',
        releaseDate: 'Giu 2025',
        recommendedFor: ['transcription'],
        eolDate: '16 ott 2026',
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

export const MAX_SESSIONS = 50;
export const MAX_SESSION_SIZE_MB = 50;
export const DEBOUNCE_DELAY = 300;
export const MAX_FILE_SIZE_MB = 100;

// ── Calendar sync window (single source of truth for all sync sources) ────────
export const CAL_SYNC_PAST_HOURS = 24;    // how far back to fetch/keep events
export const CAL_SYNC_FUTURE_DAYS = 7;    // how far ahead to fetch/keep events
export const CAL_AUDIO_RETENTION_DAYS = 10; // audio deleted after N days; transcriptions kept forever
