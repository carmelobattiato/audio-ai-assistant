import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AppSettings } from '@/types';

const transcribe = vi.fn();
vi.mock('@/services/transcriptionService', () => ({
  transcriptionService: { transcribe: (...a: unknown[]) => transcribe(...a) },
}));
vi.mock('@/utils/audioUtils', () => ({
  getAudioBlobDuration: vi.fn().mockResolvedValue(42),
}));

import { useTranscriptionLogic } from '@/hooks/useTranscriptionLogic';

const appSettings = {
  transcription: { fileName: '', includeDateTimeInText: false },
  llm: { provider: 'Google', model: 'gemini-x' },
  systemPrompts: [],
  customInstructions: [],
} as unknown as AppSettings;

type Setup = {
  setTranscribedText: ReturnType<typeof vi.fn>;
  addLlmUsageStat: ReturnType<typeof vi.fn>;
  setAppUserMessage: ReturnType<typeof vi.fn>;
  transcribedText: string;
};

function setup(over: Partial<Setup> = {}) {
  const m: Setup = {
    setTranscribedText: vi.fn(),
    addLlmUsageStat: vi.fn(),
    setAppUserMessage: vi.fn(),
    transcribedText: '',
    ...over,
  };
  const blob = new Blob(['x'], { type: 'audio/webm' });
  const hook = renderHook(() =>
    useTranscriptionLogic(
      appSettings,
      blob,
      'rec.webm',
      null,
      m.transcribedText,
      m.setTranscribedText,
      m.addLlmUsageStat,
      m.setAppUserMessage,
    ),
  );
  return { hook, m };
}

const file = (name: string) => new File(['a'], name, { type: 'audio/webm' });

beforeEach(() => {
  transcribe.mockReset();
  transcribe.mockResolvedValue({
    transcription: 'hello world',
    usageMetadata: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  });
});

describe('queue management', () => {
  it('handleFilesSelected enqueues with computed duration', async () => {
    const { hook, m } = setup();
    let ret: unknown;
    await act(async () => { ret = await hook.result.current.handleFilesSelected([file('a.webm')]); });
    expect(hook.result.current.transcriptionQueue).toHaveLength(1);
    expect(hook.result.current.transcriptionQueue[0]!.duration).toBe(42);
    expect(ret).toHaveLength(1);
    expect(m.setAppUserMessage).toHaveBeenCalledWith('1 audio file(s) queued.');
  });

  it('addChunkToQueue dedupes by name', async () => {
    const { hook } = setup();
    const blob = new Blob(['x'], { type: 'audio/webm' });
    await act(async () => { await hook.result.current.addChunkToQueue(blob, 'c1.webm'); });
    await act(async () => { await hook.result.current.addChunkToQueue(blob, 'c1.webm'); });
    expect(hook.result.current.transcriptionQueue).toHaveLength(1);
  });

  it('reorder and remove mutate the queue', async () => {
    const { hook } = setup();
    await act(async () => { await hook.result.current.handleFilesSelected([file('a.webm'), file('b.webm'), file('c.webm')]); });
    act(() => { hook.result.current.handleReorderQueue(0, 2); });
    expect(hook.result.current.transcriptionQueue.map(q => q.file.name)).toEqual(['b.webm', 'c.webm', 'a.webm']);
    act(() => { hook.result.current.handleRemoveFromQueue(1); });
    expect(hook.result.current.transcriptionQueue.map(q => q.file.name)).toEqual(['b.webm', 'a.webm']);
  });

  it('renameQueueChunks renames preserving extension and order', async () => {
    const { hook } = setup();
    await act(async () => { await hook.result.current.handleFilesSelected([file('x.mp3'), file('y.mp3')]); });
    act(() => { hook.result.current.renameQueueChunks('Meeting'); });
    expect(hook.result.current.transcriptionQueue.map(q => q.file.name))
      .toEqual(['Meeting_segment_001.mp3', 'Meeting_segment_002.mp3']);
  });
});

describe('transcription flow', () => {
  it('processes the queue: writes text, records usage, marks transcribed', async () => {
    const { hook, m } = setup();
    await act(async () => { await hook.result.current.handleFilesSelected([file('a.webm')]); });
    await act(async () => { await hook.result.current.handleStartTranscription(); });

    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(m.addLlmUsageStat).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 10, outputTokens: 5 }));
    const written = m.setTranscribedText.mock.calls.at(-1)![0] as string;
    expect(written).toContain('hello world');
    expect(written).toContain('a.webm');
    expect(hook.result.current.transcriptionQueue[0]!.transcribed).toBe(true);
    expect(hook.result.current.isTranscribing).toBe(false);
  });

  it('surfaces an "Error:" result as transcriptionError on single chunk', async () => {
    transcribe.mockResolvedValue({ transcription: 'Error: quota', usageMetadata: undefined });
    const { hook } = setup();
    await act(async () => { await hook.result.current.handleFilesSelected([file('a.webm')]); });
    await act(async () => { await hook.result.current.handleTranscribeSingleChunk(0); });
    expect(hook.result.current.transcriptionError).toBe('Error: quota');
    expect(hook.result.current.transcriptionQueue[0]!.transcribed).toBeUndefined();
  });

  it('escapes the filename in the transcription header (XSS guard)', async () => {
    const { hook, m } = setup();
    await act(async () => { await hook.result.current.handleFilesSelected([file('<img src=x>.webm')]); });
    await act(async () => { await hook.result.current.handleStartTranscription(); });
    const written = m.setTranscribedText.mock.calls.at(-1)![0] as string;
    expect(written).toContain('&lt;img');
    expect(written).not.toContain('<img src=x>');
  });

  it('stopTranscription aborts and notifies', async () => {
    const { hook, m } = setup();
    // start a never-resolving transcription so the controller is live
    transcribe.mockImplementation(() => new Promise(() => {}));
    await act(async () => { await hook.result.current.handleFilesSelected([file('a.webm')]); });
    act(() => { void hook.result.current.handleStartTranscription(); });
    act(() => { hook.result.current.stopTranscription(); });
    expect(m.setAppUserMessage).toHaveBeenCalledWith('Transcription cancelled by user.');
  });
});
