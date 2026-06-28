import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LlmSettings } from '@/types';

// loggingService touches window/crypto/setInterval — stub it out for unit tests.
vi.mock('@/services/loggingService', () => ({
  loggingService: {
    trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  },
}));

// Module-level state (requestTimestamps, consecutiveErrors, circuitBreakerTrippedUntil)
// lives in the module. Re-import fresh per test for isolation.
async function freshService() {
  vi.resetModules();
  return (await import('@/services/geminiService')).llmService;
}

const customSettings = (over: Partial<LlmSettings> = {}): LlmSettings => ({
  provider: 'Custom OpenAI-compatible',
  model: 'gpt-x',
  apiBaseUrl: 'https://api.example.com/v1',
  customApiKey: 'k',
  customPromptInstruction: '',
  enhanceWithWebSearch: false,
  maxRetries: 0,
  timeout: 30,
  rateLimitRequests: 15,
  rateLimitPeriodSeconds: 60,
  ...over,
});

const okFetch = () =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'hi' } }] }),
  });

const failFetch = () =>
  vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    statusText: 'Server Error',
    json: async () => ({}),
  });

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('llmService.generateText — happy path', () => {
  it('returns text and usage on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      }),
    }));
    const svc = await freshService();
    const res = await svc.generateText('prompt', customSettings());
    expect(res.text).toBe('hello');
    expect(res.usageMetadata).toEqual({ inputTokens: 5, outputTokens: 3, totalTokens: 8 });
  });
});

describe('llmService — circuit breaker', () => {
  it('trips after 3 consecutive errors and blocks the 4th call', async () => {
    vi.stubGlobal('fetch', failFetch());
    const svc = await freshService();
    const s = customSettings();

    for (let i = 0; i < 3; i++) {
      const r = await svc.generateText('p', s);
      expect(r.text).toMatch(/Error from Custom/);
    }
    // 4th call short-circuits before hitting fetch
    const blocked = await svc.generateText('p', s);
    expect(blocked.text).toMatch(/Circuit breaker active/);
  });

  it('resets consecutive error count after a success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'e', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'e', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) })
      .mockResolvedValue({ ok: false, status: 500, statusText: 'e', json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const svc = await freshService();
    const s = customSettings();

    await svc.generateText('p', s); // err 1
    await svc.generateText('p', s); // err 2
    await svc.generateText('p', s); // success → reset
    await svc.generateText('p', s); // err 1 again
    await svc.generateText('p', s); // err 2 again
    // breaker NOT tripped yet (count is 2, not 3)
    const r = await svc.generateText('p', s);
    expect(r.text).not.toMatch(/Circuit breaker/);
  });
});

describe('llmService — rate limiter', () => {
  it('waits when the request window is full, then proceeds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.stubGlobal('fetch', okFetch());
    const svc = await freshService();
    const s = customSettings({ rateLimitRequests: 2, rateLimitPeriodSeconds: 60 });

    await svc.generateText('p', s);
    await svc.generateText('p', s);

    // 3rd should block on a 60s setTimeout
    const pending = svc.generateText('p', s);
    let settled = false;
    pending.then(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(59_000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(2_000);
    await pending;
    expect(settled).toBe(true);
  });

  it('does not wait while under the limit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.stubGlobal('fetch', okFetch());
    const svc = await freshService();
    const s = customSettings({ rateLimitRequests: 5, rateLimitPeriodSeconds: 60 });

    const start = Date.now();
    await svc.generateText('p', s);
    await svc.generateText('p', s);
    expect(Date.now() - start).toBe(0);
  });
});

describe('llmService — config guards', () => {
  it('errors when custom provider misses baseUrl/model', async () => {
    const svc = await freshService();
    const res = await svc.generateText('p', customSettings({ apiBaseUrl: '' }));
    expect(res.text).toMatch(/Custom provider config missing/);
  });

  it('transcribeAudio rejects non-Google provider', async () => {
    const svc = await freshService();
    const res = await svc.transcribeAudio('AAAA', 'audio/webm', 'Italian', customSettings());
    expect(res.transcription).toMatch(/Google required/);
  });
});
