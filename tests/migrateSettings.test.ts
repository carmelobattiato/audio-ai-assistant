import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// Block IndexedDB (opened at module load in db.ts → SettingsContext)
vi.mock('@/utils/db', () => ({
  db: {
    getEncryptedApiKey: vi.fn().mockResolvedValue(null),
    saveEncryptedApiKey: vi.fn(),
    deleteEncryptedApiKey: vi.fn(),
    markCrashedSessions: vi.fn().mockResolvedValue(0),
    getAllSessions: vi.fn().mockResolvedValue([]),
  },
}));

import { migrateSettings } from '../contexts/SettingsContext';
import { DEFAULT_SETTINGS, DEFAULT_SYSTEM_PROMPTS } from '../constants';

describe('migrateSettings', () => {
  it('fills all missing top-level sections from DEFAULT_SETTINGS', () => {
    const result = migrateSettings({});
    expect(result.appearance).toEqual(DEFAULT_SETTINGS.appearance);
    expect(result.audio).toEqual(DEFAULT_SETTINGS.audio);
    expect(result.llm).toEqual(DEFAULT_SETTINGS.llm);
  });

  it('preserves existing values and only fills missing fields', () => {
    const result = migrateSettings({ transcription: { ...DEFAULT_SETTINGS.transcription, language: 'English' } });
    expect(result.transcription.language).toBe('English');
    // other fields intact
    expect(result.appearance).toEqual(DEFAULT_SETTINGS.appearance);
  });

  it('defaults transcription.language to Italian when missing', () => {
    const { language: _lang, ...transcriptionWithoutLanguage } = DEFAULT_SETTINGS.transcription;
    const result = migrateSettings({ transcription: transcriptionWithoutLanguage as never });
    expect(result.transcription.language).toBe('Italian');
  });

  it('does not overwrite existing language when present', () => {
    const result = migrateSettings({ transcription: { ...DEFAULT_SETTINGS.transcription, language: 'English' } });
    expect(result.transcription.language).toBe('English');
  });

  it('defaults attemptSpeakerDiarization to true when falsy', () => {
    const result = migrateSettings({ transcription: { ...DEFAULT_SETTINGS.transcription, attemptSpeakerDiarization: false } });
    // false is falsy → gets default true
    expect(result.transcription.attemptSpeakerDiarization).toBe(true);
  });

  it('uses DEFAULT_SYSTEM_PROMPTS when systemPrompts is empty', () => {
    const result = migrateSettings({ systemPrompts: [] });
    expect(result.systemPrompts).toEqual(DEFAULT_SYSTEM_PROMPTS);
  });

  it('uses DEFAULT_SYSTEM_PROMPTS when systemPrompts is missing', () => {
    const result = migrateSettings({});
    expect(result.systemPrompts).toEqual(DEFAULT_SYSTEM_PROMPTS);
  });

  it('preserves existing prompts and appends new defaults not present', () => {
    const customPrompt = { id: 'custom-1', name: 'Custom', description: '', category: 'analysis' as const, prompt: 'do thing' };
    // Pick first default to "already have it", exclude the rest
    const firstDefault = DEFAULT_SYSTEM_PROMPTS[0];
    const result = migrateSettings({ systemPrompts: [customPrompt, firstDefault] });
    // custom prompt preserved
    expect(result.systemPrompts.find(p => p.id === 'custom-1')).toBeDefined();
    // first default not duplicated
    expect(result.systemPrompts.filter(p => p.id === firstDefault.id)).toHaveLength(1);
    // remaining defaults appended
    const remainingDefaultIds = DEFAULT_SYSTEM_PROMPTS.slice(1).map(p => p.id);
    for (const id of remainingDefaultIds) {
      expect(result.systemPrompts.find(p => p.id === id)).toBeDefined();
    }
  });

  it('does not mutate the input object', () => {
    const raw = { transcription: { ...DEFAULT_SETTINGS.transcription } };
    const rawCopy = JSON.parse(JSON.stringify(raw));
    migrateSettings(raw);
    expect(raw).toEqual(rawCopy);
  });
});
