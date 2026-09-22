
import { GoogleGenAI, GenerateContentResponse, GenerateContentParameters, Part, Content, FunctionDeclaration } from "@google/genai";

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

/**
 * Risolve il baseUrl da passare al client Gemini.
 * `apiBaseUrl` può puntare a un proxy OpenAI-compatibile (es. /v1/chat/completions)
 * che non parla il protocollo nativo Gemini: in quel caso va ignorato e si usa
 * l'endpoint Google diretto. Ogni chiamata che istanzia GoogleGenAI deve passare
 * da qui, altrimenti ignora silenziosamente il proxy configurato dall'utente.
 */
const resolveGeminiBaseUrl = (apiBaseUrl?: string, useOpenAiCompatibleProxy?: boolean): { baseUrl: string; ignored: boolean } => {
  const configured = apiBaseUrl?.trim() || '';
  const isOpenAiProxy =
    !!useOpenAiCompatibleProxy ||
    configured.includes('/chat/completions') ||
    configured.includes('/openai/');
  return { baseUrl: isOpenAiProxy ? '' : configured, ignored: isOpenAiProxy };
};

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
    
    const { provider, model, apiBaseUrl, enhanceWithWebSearch, maxRetries = 3, timeout = 600 } = llmSettings;
    loggingService.debug('LLM_CALL_START', `Starting LLM call to ${provider}`, { model, provider });
    await waitForRateLimit(llmSettings);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (signal?.aborted) throw new Error('Aborted');

            if (provider !== 'Google') return { text: `Error: Invalid provider.` };

            const apiKey = llmSettings.googleApiKey?.trim();
            if (!apiKey) return { text: 'Error: API Key non configurata. Salvala nelle Impostazioni.' };

            const { baseUrl, ignored } = resolveGeminiBaseUrl(apiBaseUrl, llmSettings.useOpenAiCompatibleProxy);

            if (ignored && apiBaseUrl) {
              // Non-Google proxy (LiteLLM, etc.): use OpenAI-compatible format
              const base = apiBaseUrl.trim().replace(/\/$/, '');
              const fullUrl = `${base}/v1/chat/completions`;
              const headers: HeadersInit = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
              const messages: { role: string; content: string }[] = [];
              if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
              messages.push({ role: 'user', content: typeof promptOrParts === 'string' ? promptOrParts : promptOrParts.map(partText).filter(Boolean).join('\n\n') });
              const response = await promiseWithTimeout(
                fetch(fullUrl, { method: 'POST', headers, body: JSON.stringify({ model, messages }), signal }),
                timeout * 1000,
              );
              if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                const msg = errorBody?.error?.message || response.statusText;
                loggingService.error('LLM_API_ERROR', `Proxy error: ${msg}`, { status: response.status });
                if (response.status === 429 && msg.toLowerCase().includes('quota')) {
                  return { text: `Error: Quota exceeded.` };
                }
                throw new Error(`[${response.status}] ${msg}`);
              }
              const responseData = await response.json();
              consecutiveErrors = 0;
              return {
                text: responseData.choices?.[0]?.message?.content || '',
                usageMetadata: responseData.usage
                  ? { inputTokens: responseData.usage.prompt_tokens, outputTokens: responseData.usage.completion_tokens, totalTokens: responseData.usage.total_tokens }
                  : undefined,
              };
            }

            const ai = new GoogleGenAI({
              apiKey,
              ...(baseUrl && { httpOptions: { baseUrl } }),
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

            loggingService.warn('LLM_CALL_ERROR', `LLM call to ${provider} failed: ${errorMsg}`, {
                model, provider, apiBaseUrl: apiBaseUrl || undefined, attempt, maxRetries, isQuotaError,
            });

            if (attempt === maxRetries || isQuotaError) {
                consecutiveErrors++;
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS_FOR_COOLDOWN) circuitBreakerTrippedUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
                loggingService.error('LLM_CALL_ERROR', `LLM call to ${provider} giving up: ${errorMsg}`, {
                    model, provider, apiBaseUrl: apiBaseUrl || undefined, attempt, isQuotaError, consecutiveErrors,
                });
                return { text: `Error from ${provider} API: ${errorMsg}` };
            }

            const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return { text: "Error: LLM failed after retries." };
  },

  /**
   * Genera un vettore embedding per un testo via Gemini text-embedding-004.
   * Solo provider Google. In errore ritorna null (non lancia).
   */
  embedContent: async (text: string, apiKey: string, apiBaseUrl?: string): Promise<number[] | null> => {
    if (!apiKey?.trim()) return null;
    try {
      const { baseUrl } = resolveGeminiBaseUrl(apiBaseUrl);
      const ai = new GoogleGenAI({
        apiKey: apiKey.trim(),
        ...(baseUrl && { httpOptions: { baseUrl } }),
      });
      const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
      });
      return response.embeddings?.[0]?.values ?? null;
    } catch (error: unknown) {
      loggingService.warn('EMBED_ERROR', 'embedContent failed', { error: String(error) });
      return null;
    }
  },

  /**
   * Chiama Gemini con function declarations (tool calling). Solo provider Google.
   * Ritorna il testo finale se il modello risponde con testo, oppure i functionCalls
   * che il chiamante deve eseguire e reinserire come functionResponse.
   */
  generateWithTools: async (
    contents: Content[],
    llmSettings: LlmSettings,
    systemInstruction: string,
    tools: FunctionDeclaration[],
    signal?: AbortSignal,
  ): Promise<{
    text?: string;
    functionCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    modelContent?: Content;
    usageMetadata?: { inputTokens: number; outputTokens: number };
  }> => {
    if (Date.now() < circuitBreakerTrippedUntil) {
      const timeLeft = Math.ceil((circuitBreakerTrippedUntil - Date.now()) / 1000);
      return { text: `Error: Circuit breaker attivo. Riprova tra ${timeLeft}s.` };
    }
    await waitForRateLimit(llmSettings);

    const apiKey = llmSettings.googleApiKey?.trim();
    if (!apiKey) return { text: 'Error: API Key non configurata. Salvala nelle Impostazioni.' };

    try {
      const { baseUrl, ignored } = resolveGeminiBaseUrl(llmSettings.apiBaseUrl, llmSettings.useOpenAiCompatibleProxy);
      if (ignored) {
        loggingService.warn('TOOLS_BASEURL_IGNORED', `apiBaseUrl "${llmSettings.apiBaseUrl}" non è compatibile con il function calling Gemini — verrà usato l'endpoint Google diretto`);
      }
      const ai = new GoogleGenAI({
        apiKey,
        ...(baseUrl && { httpOptions: { baseUrl } }),
      });
      const params: GenerateContentParameters = {
        model: llmSettings.model,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: tools }],
        },
      };
      const response: GenerateContentResponse = await promiseWithTimeout(
        ai.models.generateContent(params),
        (llmSettings.timeout ?? 30) * 1000,
        signal,
      );
      const usageMetadata = response.usageMetadata
        ? { inputTokens: response.usageMetadata.promptTokenCount ?? 0, outputTokens: response.usageMetadata.candidatesTokenCount ?? 0 }
        : undefined;
      const fCalls = response.functionCalls;
      if (fCalls && fCalls.length > 0) {
        const modelContent = response.candidates?.[0]?.content;
        return {
          functionCalls: fCalls.map(fc => ({ name: fc.name ?? '', args: fc.args ?? {} })),
          modelContent: modelContent as Content | undefined,
          usageMetadata,
        };
      }
      consecutiveErrors = 0;
      return { text: response.text || '', usageMetadata };
    } catch (error: unknown) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS_FOR_COOLDOWN) circuitBreakerTrippedUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
      const msg = error instanceof Error ? error.message : String(error);
      return { text: `Error: ${msg}` };
    }
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
    const model = llmSettings.model;
    await waitForRateLimit(llmSettings);
    if (provider !== 'Google') return { transcription: "Error: Google required for audio." };

    const audioDecodedBytes = Math.round(audioBase64.length * 0.75);
    const audioBase64Bytes = audioBase64.length;

    const configuredBaseUrl = llmSettings.apiBaseUrl?.trim() || '';
    const { baseUrl: effectiveBaseUrl, ignored: isOpenAiProxy } = resolveGeminiBaseUrl(configuredBaseUrl, llmSettings.useOpenAiCompatibleProxy);

    loggingService.debug('TRANSCRIPTION_GEMINI_START', `model=${model} audio=${(audioDecodedBytes / 1024 / 1024).toFixed(2)}MB base64=${(audioBase64Bytes / 1024 / 1024).toFixed(2)}MB`, {
        model,
        provider,
        mimeType,
        audioDecodedBytes,
        audioBase64Bytes,
        hasApiKey: !!llmSettings.googleApiKey?.trim(),
        configuredBaseUrl: configuredBaseUrl || '(default)',
        effectiveBaseUrl: effectiveBaseUrl || '(default)',
        baseUrlIgnored: isOpenAiProxy,
        maxRetries,
        timeout,
    });

    const buildTranscriptionPrompt = (): string => {
      const diarization = attemptDiarization
        ? `\nIdentifica e distingui tutti gli interlocutori presenti nell'audio. Per ogni intervento usa il formato "[Etichetta]: testo" su una nuova riga (es. "Speaker 1:", "Speaker 2:", o il nome/ruolo se menzionato, es. "Cliente:", "Marco:"). Ogni cambio di voce va su riga separata.${approximateSpeakerCount ? ` Presenti circa ${approximateSpeakerCount} persone.` : ' Rileva automaticamente il numero di voci.'}`
        : "";
      if (promptTemplate) {
        return promptTemplate
          .split('{{LANGUAGE}}').join(language)
          .split('{{DIARIZATION}}').join(diarization)
          .split('{{EXTRA}}').join(customInstruction || '');
      }
      return `Transcribe accurately in ${language}.${diarization} IMPORTANT: if the audio contains no recognizable human speech — silence, noise, background sounds, music, or unintelligible audio — you MUST respond with only the literal string: [chunk senza audio riconoscibile]. Never invent, guess, or hallucinate words. Only transcribe words you can clearly hear. ${customInstruction || ''}`;
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const apiKey = llmSettings.googleApiKey?.trim();
            const transcribePrompt = buildTranscriptionPrompt();

            if (isOpenAiProxy && configuredBaseUrl) {
              // Proxy path: send audio as multimodal image_url (LiteLLM converts to Gemini inlineData)
              const base = configuredBaseUrl.replace(/\/$/, '');
              const fullUrl = `${base}/v1/chat/completions`;
              const headers: HeadersInit = { 'Content-Type': 'application/json' };
              if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
              const proxyResponse = await promiseWithTimeout(
                fetch(fullUrl, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    model,
                    messages: [{
                      role: 'user',
                      content: [
                        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${audioBase64}` } },
                        { type: 'text', text: transcribePrompt },
                      ],
                    }],
                  }),
                  signal,
                }),
                timeout * 1000,
                signal,
              );
              if (!proxyResponse.ok) {
                const errBody = await proxyResponse.json().catch(() => ({}));
                const msg = errBody?.error?.message || proxyResponse.statusText;
                throw new Error(`[${proxyResponse.status}] ${msg}`);
              }
              const proxyData = await proxyResponse.json();
              consecutiveErrors = 0;
              return {
                transcription: proxyData.choices?.[0]?.message?.content || '',
                usageMetadata: proxyData.usage
                  ? { inputTokens: proxyData.usage.prompt_tokens, outputTokens: proxyData.usage.completion_tokens, totalTokens: proxyData.usage.total_tokens }
                  : undefined,
              };
            }

            const ai = new GoogleGenAI({
              apiKey,
              ...(effectiveBaseUrl && { httpOptions: { baseUrl: effectiveBaseUrl } }),
            });
            const response: GenerateContentResponse = await promiseWithTimeout(ai.models.generateContent({
                model,
                contents: { parts: [{ inlineData: { mimeType, data: audioBase64 } }, { text: transcribePrompt }] },
            }), timeout * 1000, signal);
            consecutiveErrors = 0;
            loggingService.debug('TRANSCRIPTION_GEMINI_SUCCESS', `attempt=${attempt} model=${model} audio=${(audioDecodedBytes / 1024 / 1024).toFixed(2)}MB`, {
                model,
                attempt,
                audioDecodedBytes,
                audioBase64Bytes,
            });
            return {
                transcription: response.text || "",
                usageMetadata: response.usageMetadata ? { inputTokens: response.usageMetadata.promptTokenCount ?? 0, outputTokens: response.usageMetadata.candidatesTokenCount ?? 0, totalTokens: response.usageMetadata.totalTokenCount ?? 0 } : undefined
            };
        } catch (error: unknown) {
            if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
            const errorMsg = error instanceof Error ? error.message : String(error);
            const isQuotaError = errorMsg.toLowerCase().includes('quota') || errorMsg.includes('429');
            const isFinal = attempt === maxRetries || isQuotaError;
            loggingService.error('TRANSCRIPTION_GEMINI_ERROR', errorMsg, {
                model,
                provider,
                attempt,
                maxRetries,
                isQuotaError,
                isFinal,
                errorName: error instanceof Error ? error.name : undefined,
                audioSizeBytes: Math.round(audioBase64.length * 0.75),
                mimeType,
            });
            if (isFinal) {
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
