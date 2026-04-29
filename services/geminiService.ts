
import { GoogleGenAI, GenerateContentResponse, GenerateContentParameters, Part } from "@google/genai";

// Narrows a raw `Part` from the SDK to one that carries a text field
const partText = (p: Part): string | undefined => ('text' in p ? (p as { text: string }).text : undefined);
import { GroundingMetadata, LlmSettings, Emotion, EMOTION_LIST } from '../types';
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

  while (requestTimestamps.length > 0 && (requestTimestamps[0] ?? 0) < now - rateLimitWindowMs) {
    requestTimestamps.shift();
  }

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

export const llmService = {
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

  analyzeEmotion: async (audioBase64: string, mimeType: string, llmSettings: LlmSettings): Promise<{ emotion: Emotion, usageMetadata?: UsageMetadata }> => {
    if (llmSettings.provider === 'Custom OpenAI-compatible') return { emotion: 'Unknown' };
    try {
      const { text: result, usageMetadata } = await llmService.generateText(
        [{ inlineData: { mimeType, data: audioBase64 } }, { text: `Analyze emotion: ${EMOTION_LIST.join(', ')}. One word response.` }],
        { ...llmSettings, model: 'gemini-3-flash-preview', maxRetries: 1, timeout: 15 },
        "Analyze audio emotion. Response must be single word from list."
      );
      const found = EMOTION_LIST.find(e => result.toLowerCase().includes(e.toLowerCase()));
      return { emotion: found || 'Neutral', usageMetadata };
    } catch { return { emotion: 'Unknown' }; }
  },

  transcribeAudio: async (audioBase64: string, mimeType: string, language: string, llmSettings: LlmSettings, customInstruction?: string, attemptDiarization?: boolean, approximateSpeakerCount?: number, signal?: AbortSignal, promptTemplate?: string): Promise<{ transcription: string, usageMetadata?: UsageMetadata }> => {
    if (Date.now() < circuitBreakerTrippedUntil) return { transcription: "Error: Circuit breaker active." };
    const { provider, model, maxRetries = 3, timeout = 600 } = llmSettings;
    await waitForRateLimit(llmSettings);
    if (provider !== 'Google') return { transcription: "Error: Google required for audio." };
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const apiKey = llmSettings.googleApiKey?.trim() || process.env.API_KEY;
            const ai = new GoogleGenAI({
              apiKey,
              ...(llmSettings.apiBaseUrl?.trim() && { httpOptions: { baseUrl: llmSettings.apiBaseUrl.trim() } }),
            });
            let diarization = attemptDiarization ? `\nFormat as script with labels (e.g. Speaker 1:). ${approximateSpeakerCount ? `Approx ${approximateSpeakerCount} speakers.` : 'Auto-detect speakers.'}` : "";
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
