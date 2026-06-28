
import { GoogleGenAI, GenerateContentResponse, GenerateContentParameters, Part } from "@google/genai";

// Narrows a raw `Part` from the SDK to one that carries a text field
const partText = (p: Part): string | undefined => ('text' in p ? (p as { text: string }).text : undefined);
import { GroundingMetadata, LlmSettings } from '../types';
import { loggingService } from './loggingService';

interface UsageMetadata {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface GenerateTextResult {
  text: string;
  groundingMetadata?: GroundingMetadata;
  usageMetadata?: UsageMetadata;
}

// --- API Reliability State ---
const requestTimestamps: number[] = [];
let consecutiveErrors = 0;
let circuitBreakerTrippedUntil = 0;

const MAX_CONSECUTIVE_ERRORS_FOR_COOLDOWN = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 120 * 1000;

class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

const promiseWithTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  signal?: AbortSignal,
): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`API call timed out after ${ms / 1000} seconds.`));
    }, ms);
    
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
      });
    }
  });
  return Promise.race([promise, timeoutPromise]);
};

const waitForRateLimit = async (settings: LlmSettings) => {
  const { rateLimitRequests = 15, rateLimitPeriodSeconds = 60 } = settings;
  const now = Date.now();
  const rateLimitWindowMs = rateLimitPeriodSeconds * 1000;

  // Drop expired timestamps in one splice (was: repeated O(n) shift in a loop)
  const cutoff = now - rateLimitWindowMs;
  let expired = 0;
  while (expired < requestTimestamps.length && (requestTimestamps[expired] ?? 0) < cutoff) expired++;
  if (expired > 0) requestTimestamps.splice(0, expired);

  if (requestTimestamps.length >= rateLimitRequests) {
    const oldestRequestTime = requestTimestamps[0] ?? now;
    const waitTime = oldestRequestTime + rateLimitWindowMs - now;
    if (waitTime > 0) {
      loggingService.warn('LLM_RATE_LIMIT_WAIT', `Rate limit reached. Waiting for ${Math.ceil(waitTime / 1000)}s.`, { waitTimeMs: waitTime });
      console.log(`LlmService: Rate limit reached. Waiting for ${Math.ceil(waitTime / 1000)}s.`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  requestTimestamps.push(Date.now());
};

/**
 * Unico gateway verso Gemini (e provider OpenAI-compatible).
 * Centralizza: rate limiting (sliding window), circuit breaker (3 errori
 * consecutivi → cooldown 120s), timeout abortabile, retry con backoff
 * esponenziale, e token tracking. Vedi ARCHITECTURE.md § "Affidabilità API".
 */
export const llmService = {
  /**
   * Genera testo da un prompt (string o `Part[]`).
   * @param promptOrParts Prompt testuale o parti multimodali.
   * @param llmSettings Provider, modello, chiavi, rate limit, timeout, retry.
   * @param systemInstruction Istruzione di sistema opzionale.
   * @param signal AbortSignal per cancellare la richiesta.
   * @returns Testo generato + grounding/usage metadata. In errore ritorna `{ text: "Error: …" }` (non lancia).
   */
  generateText: async (
    promptOrParts: string | Part[],
    llmSettings: LlmSettings,
    systemInstruction?: string,
    signal?: AbortSignal,
  ): Promise<GenerateTextResult> => {
     if (Date.now() < circuitBreakerTrippedUntil) {
        const timeLeft = Math.ceil((circuitBreakerTrippedUntil - Date.now()) / 1000);
        return { text: `Error: Circuit breaker active. Wait ${timeLeft}s.` };
    }
    
    const { provider, model, apiBaseUrl, customApiKey, enhanceWithWebSearch, maxRetries = 3, timeout = 600 } = llmSettings;
    loggingService.debug('LLM_CALL_START', `Starting LLM call to ${provider}`, { model, provider });
    await waitForRateLimit(llmSettings);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (signal?.aborted) throw new Error('Aborted');

            if (provider === 'Custom OpenAI-compatible') {
              if (!apiBaseUrl || !model) return { text: "Error: Custom provider config missing." };
              const fullUrl = apiBaseUrl.trim().endsWith('/') ? `${apiBaseUrl}chat/completions` : `${apiBaseUrl}/chat/completions`;
              const headers: HeadersInit = { 'Content-Type': 'application/json' };
              if (customApiKey) headers['Authorization'] = `Bearer ${customApiKey}`;

              const messages = [];
              if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
              messages.push({ role: 'user', content: typeof promptOrParts === 'string' ? promptOrParts : promptOrParts.map(partText).filter(Boolean).join('\n\n') });

              const response = await promiseWithTimeout(fetch(fullUrl, { method: 'POST', headers, body: JSON.stringify({ model, messages }), signal }), timeout * 1000);

              if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                const msg = errorBody?.error?.message || response.statusText;
                loggingService.error('LLM_API_ERROR', `Custom provider error: ${msg}`, { status: response.status, provider });
                if (response.status === 429 && msg.toLowerCase().includes('quota')) {
                    return { text: `Error: Quota exceeded (${provider}).` };
                }
                throw new Error(`[${response.status}] ${msg}`);
              }
              const responseData = await response.json();
              consecutiveErrors = 0;
              return { 
                text: responseData.choices?.[0]?.message?.content || "", 
                usageMetadata: responseData.usage ? { inputTokens: responseData.usage.prompt_tokens, outputTokens: responseData.usage.completion_tokens, totalTokens: responseData.usage.total_tokens } : undefined 
              };
            }
            
            if (provider !== 'Google') return { text: `Error: Invalid provider.` };

            const apiKey = llmSettings.googleApiKey?.trim() || process.env.API_KEY;
            if (!apiKey) return { text: `Error: API_KEY missing. Set it in LLM Configuration settings.` };

            const ai = new GoogleGenAI({
              apiKey,
              ...(apiBaseUrl?.trim() && { httpOptions: { baseUrl: apiBaseUrl.trim() } }),
            });
            const params: GenerateContentParameters = {
                model,
                contents: typeof promptOrParts === 'string' ? { parts: [{ text: promptOrParts }] } : { parts: promptOrParts },
                config: {
                    ...(systemInstruction && { systemInstruction }),
                    ...(enhanceWithWebSearch && { tools: [{ googleSearch: {} }] })
                },
            };
            
            const response: GenerateContentResponse = await promiseWithTimeout(ai.models.generateContent(params), timeout * 1000, signal);
            consecutiveErrors = 0;
            loggingService.info('LLM_CALL_SUCCESS', `LLM call to ${provider} succeeded`, { 
              model, 
              provider, 
              tokens: response.usageMetadata ? { input: response.usageMetadata.promptTokenCount, output: response.usageMetadata.candidatesTokenCount } : 'N/A' 
            });
            return { 
                text: response.text || "", 
                groundingMetadata: response.candidates?.[0]?.groundingMetadata,
                usageMetadata: response.usageMetadata ? { inputTokens: response.usageMetadata.promptTokenCount ?? 0, outputTokens: response.usageMetadata.candidatesTokenCount ?? 0, totalTokens: response.usageMetadata.totalTokenCount ?? 0 } : undefined
            };

        } catch (error: unknown) {
            if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;

            const errorMsg = error instanceof Error ? error.message : String(error);
            const isQuotaError = errorMsg.toLowerCase().includes('quota') || errorMsg.includes('429');

            if (attempt === maxRetries || isQuotaError) {
                consecutiveErrors++;
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS_FOR_COOLDOWN) circuitBreakerTrippedUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
                return { text: `Error from ${provider} API: ${errorMsg}` };
            }
            
            const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return { text: "Error: LLM failed after retries." };
  },

  /**
   * Trascrive audio (base64) via Gemini speech-to-text. Solo provider Google.
   * Supporta diarization (etichette speaker) e template prompt custom
   * (`{{LANGUAGE}}`/`{{DIARIZATION}}`/`{{EXTRA}}`). Stesse policy di affidabilità
   * di `generateText`. In errore ritorna `{ transcription: "Error: …" }` (non lancia).
   */
  transcribeAudio: async (audioBase64: string, mimeType: string, language: string, llmSettings: LlmSettings, customInstruction?: string, attemptDiarization?: boolean, approximateSpeakerCount?: number, signal?: AbortSignal, promptTemplate?: string): Promise<{ transcription: string, usageMetadata?: UsageMetadata }> => {
    if (Date.now() < circuitBreakerTrippedUntil) return { transcription: "Error: Circuit breaker active." };
    const { provider, maxRetries = 3, timeout = 600 } = llmSettings;
    const model = llmSettings.transcriptionModel ?? llmSettings.model;
    await waitForRateLimit(llmSettings);
    if (provider !== 'Google') return { transcription: "Error: Google required for audio." };
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const apiKey = llmSettings.googleApiKey?.trim() || process.env.API_KEY;
            const ai = new GoogleGenAI({
              apiKey,
              ...(llmSettings.apiBaseUrl?.trim() && { httpOptions: { baseUrl: llmSettings.apiBaseUrl.trim() } }),
            });
            let diarization = attemptDiarization
              ? `\nIdentifica e distingui tutti gli interlocutori presenti nell'audio. Per ogni intervento usa il formato "[Etichetta]: testo" su una nuova riga (es. "Speaker 1:", "Speaker 2:", o il nome/ruolo se menzionato, es. "Cliente:", "Marco:"). Ogni cambio di voce va su riga separata.${approximateSpeakerCount ? ` Presenti circa ${approximateSpeakerCount} persone.` : ' Rileva automaticamente il numero di voci.'}`
              : "";
            let transcribePrompt: string;
            if (promptTemplate) {
              // resolve {{LANGUAGE}}, {{DIARIZATION}}, {{EXTRA}} in user-edited template
              transcribePrompt = promptTemplate
                .split('{{LANGUAGE}}').join(language)
                .split('{{DIARIZATION}}').join(diarization)
                .split('{{EXTRA}}').join(customInstruction || '');
            } else {
              transcribePrompt = `Transcribe accurately in ${language}.${diarization} IMPORTANT: if the audio contains no recognizable human speech — silence, noise, background sounds, music, or unintelligible audio — you MUST respond with only the literal string: [chunk senza audio riconoscibile]. Never invent, guess, or hallucinate words. Only transcribe words you can clearly hear. ${customInstruction || ''}`;
            }
            const response: GenerateContentResponse = await promiseWithTimeout(ai.models.generateContent({
                model,
                contents: { parts: [{ inlineData: { mimeType, data: audioBase64 } }, { text: transcribePrompt }] },
            }), timeout * 1000, signal);
            consecutiveErrors = 0;
            return { 
                transcription: response.text || "", 
                usageMetadata: response.usageMetadata ? { inputTokens: response.usageMetadata.promptTokenCount ?? 0, outputTokens: response.usageMetadata.candidatesTokenCount ?? 0, totalTokens: response.usageMetadata.totalTokenCount ?? 0 } : undefined
            };
        } catch (error: unknown) {
            if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
            const errorMsg = error instanceof Error ? error.message : String(error);
            const isQuotaError = errorMsg.toLowerCase().includes('quota') || errorMsg.includes('429');
            if (attempt === maxRetries || isQuotaError) {
                consecutiveErrors++;
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS_FOR_COOLDOWN) circuitBreakerTrippedUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
                return { transcription: `Error: ${errorMsg}` };
            }
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
    }
    return { transcription: "Error: Transcription failed." };
  },
};
