import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { db } from '../utils/db';
import { encryptString, decryptString } from '../utils/crypto';
import { loggingService } from '../services/loggingService';
import type { AppSettings } from '../types';
import { Theme } from '../types';
import { DEFAULT_SETTINGS, DEFAULT_SYSTEM_PROMPTS, APP_VERSION } from '../constants';

const APP_SETTINGS_KEY = 'audioAIAssistantSettings';

// ── State ─────────────────────────────────────────────────────────────────────

interface SettingsState {
  appSettings: AppSettings;
  hasCustomApiKey: boolean;
  isReady: boolean;
}

const initialState: SettingsState = {
  appSettings: DEFAULT_SETTINGS,
  hasCustomApiKey: false,
  isReady: false,
};

// ── Reducer ───────────────────────────────────────────────────────────────────

type SettingsAction =
  | { type: 'INIT'; appSettings: AppSettings; hasCustomApiKey: boolean }
  | { type: 'SET_SETTINGS'; appSettings: AppSettings }
  | { type: 'PATCH_SETTINGS'; patch: Partial<AppSettings> }
  | { type: 'SET_HAS_CUSTOM_API_KEY'; hasKey: boolean }
  | { type: 'APPLY_CUSTOM_KEY'; key: string }
  | { type: 'REMOVE_CUSTOM_KEY' };

function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'INIT':
      return { appSettings: action.appSettings, hasCustomApiKey: action.hasCustomApiKey, isReady: true };
    case 'SET_SETTINGS':
      return { ...state, appSettings: action.appSettings };
    case 'PATCH_SETTINGS':
      return { ...state, appSettings: { ...state.appSettings, ...action.patch } };
    case 'SET_HAS_CUSTOM_API_KEY':
      return { ...state, hasCustomApiKey: action.hasKey };
    case 'APPLY_CUSTOM_KEY':
      return {
        ...state,
        hasCustomApiKey: true,
        appSettings: { ...state.appSettings, llm: { ...state.appSettings.llm, googleApiKey: action.key, apiKeySource: 'custom' } },
      };
    case 'REMOVE_CUSTOM_KEY':
      return {
        ...state,
        hasCustomApiKey: false,
        appSettings: { ...state.appSettings, llm: { ...state.appSettings.llm, googleApiKey: undefined, apiKeySource: 'system' } },
      };
    default:
      return state;
  }
}

// ── Context value ─────────────────────────────────────────────────────────────

interface SettingsCtxValue extends SettingsState {
  /** Replace the full settings object (does NOT persist to localStorage). */
  setAppSettings: (settings: AppSettings) => void;
  /** Shallow-merge a partial update (does NOT persist to localStorage). */
  patchSettings: (patch: Partial<AppSettings>) => void;
  /**
   * Settings-modal save path: decrypt custom key if needed, update state,
   * and persist sanitised settings to localStorage.
   */
  persistSettings: (settings: AppSettings) => Promise<void>;
  saveCustomApiKey: (key: string) => Promise<void>;
  deleteCustomApiKey: () => Promise<void>;
}

const SettingsContext = createContext<SettingsCtxValue | null>(null);

// ── Migration ─────────────────────────────────────────────────────────────────

export function migrateSettings(raw: Partial<AppSettings>): AppSettings {
  let s: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    appearance: { ...DEFAULT_SETTINGS.appearance, ...raw.appearance },
    audio: { ...DEFAULT_SETTINGS.audio, ...raw.audio },
    llm: { ...DEFAULT_SETTINGS.llm, ...raw.llm },
    transcription: { ...DEFAULT_SETTINGS.transcription, ...raw.transcription },
  };

  if (!s.transcription?.language) {
    s = { ...s, transcription: { ...s.transcription, language: 'Italian' } };
  }

  if (!s.transcription.attemptSpeakerDiarization) {
    s = { ...s, transcription: { ...s.transcription, attemptSpeakerDiarization: true } };
  }

  if (!s.systemPrompts || s.systemPrompts.length === 0) {
    s = { ...s, systemPrompts: DEFAULT_SYSTEM_PROMPTS };
  } else {
    const savedIds = new Set(s.systemPrompts.map(p => p.id));
    const newDefaults = DEFAULT_SYSTEM_PROMPTS.filter(p => !savedIds.has(p.id));
    if (newDefaults.length > 0) {
      s = { ...s, systemPrompts: [...s.systemPrompts, ...newDefaults] };
    }
  }
  return s;
}

function saveToLocalStorage(settings: AppSettings): void {
  const toSave = { ...settings, llm: { ...settings.llm, googleApiKey: undefined } };
  localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(toSave));
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(settingsReducer, initialState);
  // Ref so async callbacks can read latest settings without stale closure
  const settingsRef = useRef(state.appSettings);
  useEffect(() => { settingsRef.current = state.appSettings; }, [state.appSettings]);

  // Async init: load + migrate from localStorage, decrypt API key from IndexedDB
  useEffect(() => {
    (async () => {
      loggingService.info('APP_INIT', 'NewHome initializing', { version: APP_VERSION });
      const stored = localStorage.getItem(APP_SETTINGS_KEY);
      const raw: Partial<AppSettings> = stored ? (JSON.parse(stored) as Partial<AppSettings>) : {};
      let settings = migrateSettings(raw);

      const encrypted = await db.getEncryptedApiKey();
      const hasKey = !!encrypted;
      if (settings.llm?.apiKeySource === 'custom' && encrypted) {
        try {
          const decrypted = await decryptString(encrypted);
          settings = { ...settings, llm: { ...settings.llm, googleApiKey: decrypted } };
        } catch {
          loggingService.warn('API_KEY', 'Failed to decrypt custom API key — falling back to system');
        }
      }

      dispatch({ type: 'INIT', appSettings: settings, hasCustomApiKey: hasKey });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — one-time init

  // Sync theme to document.body.className
  useEffect(() => {
    document.body.className = `theme-${state.appSettings.appearance?.theme || Theme.DARK}`;
  }, [state.appSettings.appearance?.theme]);

  const setAppSettings = useCallback((settings: AppSettings) => {
    dispatch({ type: 'SET_SETTINGS', appSettings: settings });
  }, []);

  const patchSettings = useCallback((patch: Partial<AppSettings>) => {
    dispatch({ type: 'PATCH_SETTINGS', patch });
  }, []);

  const persistSettings = useCallback(async (raw: AppSettings) => {
    let resolved = { ...raw };
    if (raw.llm?.apiKeySource === 'custom') {
      const encrypted = await db.getEncryptedApiKey();
      if (encrypted) {
        try {
          const decrypted = await decryptString(encrypted);
          resolved = { ...raw, llm: { ...raw.llm, googleApiKey: decrypted } };
        } catch { /* keep googleApiKey undefined */ }
      }
    } else {
      resolved = { ...raw, llm: { ...raw.llm, googleApiKey: undefined } };
    }
    dispatch({ type: 'SET_SETTINGS', appSettings: resolved });
    saveToLocalStorage(resolved);
  }, []);

  const saveCustomApiKey = useCallback(async (key: string) => {
    const blob = await encryptString(key);
    await db.saveEncryptedApiKey(blob);
    dispatch({ type: 'APPLY_CUSTOM_KEY', key });
    const toSave = { ...settingsRef.current, llm: { ...settingsRef.current.llm, googleApiKey: undefined, apiKeySource: 'custom' as const } };
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(toSave));
  }, []);

  const deleteCustomApiKey = useCallback(async () => {
    await db.deleteEncryptedApiKey();
    dispatch({ type: 'REMOVE_CUSTOM_KEY' });
    const toSave = { ...settingsRef.current, llm: { ...settingsRef.current.llm, googleApiKey: undefined, apiKeySource: 'system' as const } };
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(toSave));
  }, []);

  return (
    <SettingsContext.Provider value={{
      ...state,
      setAppSettings,
      patchSettings,
      persistSettings,
      saveCustomApiKey,
      deleteCustomApiKey,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSettings(): SettingsCtxValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
