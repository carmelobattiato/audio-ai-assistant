
import { ModelInfo } from '../types';

export const APP_TITLE = "Audio AI Assistant";
export const APP_CREATOR = "Carmelo Battiato";
export const APP_VERSION = "1.65";
export const APP_BUILD_TIMESTAMP = "2025-06-28_00-00-00";

export const LLM_PROVIDERS: { [key: string]: { models: ModelInfo[]; needsBaseUrl?: boolean; docsUrl?: string, isCustom?: boolean } } = {
  'Google': {
    models: [
      { 
        name: 'gemini-3-pro-preview', 
        specialization: 'Massima Intelligenza: Ideale per minute complesse, sfumature nell\'audio e ragionamento profondo su immagini difficili.', 
        cost: 'In: $4.00 | Out: $18.00', 
        releaseDate: 'Feb 2025' 
      },
      { 
        name: 'gemini-3-flash-preview', 
        specialization: 'Velocità e Ragionamento: Ottimo bilanciamento. Più intelligente del 2.5 Flash ma molto veloce.', 
        cost: 'In: $0.50 | Out: $3.00', 
        releaseDate: 'Feb 2025' 
      },
      { 
        name: 'gemini-2.5-pro', 
        specialization: 'Ragionamento Robusto: Eccellente per compiti complessi se il Gem 3 costa troppo. Ottimo coding e analisi.', 
        cost: 'In: $2.50 | Out: $15.00', 
        releaseDate: 'Mar 2025' 
      },
      { 
        name: 'gemini-2.5-flash', 
        specialization: 'Economico / Alta Mole: Perfetto se hai ore di audio o migliaia di immagini da processare a basso costo.', 
        cost: 'In: $0.30 | Out: $2.50', 
        releaseDate: 'Mar 2025' 
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
export const MAX_SESSIONS = 5; // Updated Retention Policy
export const MAX_SESSION_SIZE_MB = 50;
export const DEBOUNCE_DELAY = 300;
export const MAX_FILE_SIZE_MB = 100;
