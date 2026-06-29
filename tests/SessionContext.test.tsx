import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

vi.mock('@/utils/db', () => ({
  db: {
    getEncryptedApiKey: vi.fn().mockResolvedValue(null),
    getAllSessions: vi.fn().mockResolvedValue([{ id: 's1', name: 'Test', status: 'Success', createdAt: 0, data: {} }]),
    markCrashedSessions: vi.fn().mockResolvedValue(0),
    saveEncryptedApiKey: vi.fn(),
    deleteEncryptedApiKey: vi.fn(),
  },
}));
vi.mock('@/services/loggingService', () => ({ loggingService: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), setCorrelationId: vi.fn() } }));

import { SessionProvider, useSession } from '../contexts/SessionContext';
import { PipelineStep, CoherenceAssessmentStatus, RecordingState } from '../types';

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SessionProvider, null, children);
}

describe('SessionContext', () => {
  describe('resetSession', () => {
    it('clears all audio and content fields to defaults', () => {
      const { result } = renderHook(() => useSession(), { wrapper });

      // Populate some state first
      act(() => {
        result.current.setAudioBlob(new Blob(['data']));
        result.current.setAudioFileName('rec.webm');
        result.current.setTranscribedText('hello world');
        result.current.setLlmProcessedText('summary');
        result.current.setPipelineStep(PipelineStep.ANALYZING);
        result.current.setBubbleNotes([{ id: 'n1', contentHtml: '<p>note</p>', timestamp: 1, recordingElapsedTime: 0, isEditing: false, isProcessing: false }]);
      });

      act(() => { result.current.resetSession(); });

      expect(result.current.audioBlob).toBeNull();
      expect(result.current.audioFileName).toBe('');
      expect(result.current.transcribedText).toBe('');
      expect(result.current.llmProcessedText).toBe('');
      expect(result.current.pipelineStep).toBe(PipelineStep.IDLE);
      expect(result.current.bubbleNotes).toHaveLength(0);
      expect(result.current.coherenceStatus).toBe(CoherenceAssessmentStatus.IDLE);
      expect(result.current.recordingChunks).toHaveLength(0);
    });

    it('preserves bubbleNotes and recordingTitle when opts.preserveBubbleNotes = true', () => {
      const { result } = renderHook(() => useSession(), { wrapper });

      act(() => {
        result.current.setBubbleNotes([{ id: 'n1', contentHtml: '<p>keep</p>', timestamp: 1, recordingElapsedTime: 0, isEditing: false, isProcessing: false }]);
        result.current.setRecordingTitle('MyMeeting');
        result.current.setTranscribedText('some text');
      });

      act(() => { result.current.resetSession({ preserveBubbleNotes: true }); });

      expect(result.current.bubbleNotes).toHaveLength(1);
      expect(result.current.recordingTitle).toBe('MyMeeting');
      expect(result.current.transcribedText).toBe('');
    });
  });

  describe('addLlmUsageStat', () => {
    it('appends a stat with timestamp to llmUsageHistory', () => {
      const { result } = renderHook(() => useSession(), { wrapper });

      act(() => {
        result.current.addLlmUsageStat({ functionName: 'Test', inputTokens: 10, outputTokens: 5, model: 'gemini-x', provider: 'Google' });
      });

      expect(result.current.llmUsageHistory).toHaveLength(1);
      expect(result.current.llmUsageHistory[0].functionName).toBe('Test');
      expect(result.current.llmUsageHistory[0].inputTokens).toBe(10);
      expect(typeof result.current.llmUsageHistory[0].timestamp).toBe('number');
    });

    it('accumulates multiple stats', () => {
      const { result } = renderHook(() => useSession(), { wrapper });

      act(() => {
        result.current.addLlmUsageStat({ functionName: 'A', inputTokens: 1, outputTokens: 1, model: 'x', provider: 'Google' });
        result.current.addLlmUsageStat({ functionName: 'B', inputTokens: 2, outputTokens: 2, model: 'x', provider: 'Google' });
      });

      expect(result.current.llmUsageHistory).toHaveLength(2);
    });
  });

  describe('fetchSessions', () => {
    it('populates savedSessions from db', async () => {
      const { result } = renderHook(() => useSession(), { wrapper });

      await act(async () => { await result.current.fetchSessions(); });

      expect(result.current.savedSessions).toHaveLength(1);
      expect(result.current.savedSessions[0].id).toBe('s1');
    });
  });

  describe('recordingState default', () => {
    it('starts IDLE', () => {
      const { result } = renderHook(() => useSession(), { wrapper });
      expect(result.current.recordingState).toBe(RecordingState.IDLE);
    });
  });
});
