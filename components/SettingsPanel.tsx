
import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { Select } from './common/Select';
import { Input } from './common/Input';
import { Checkbox } from './common/Checkbox';
import { AppSettings, CustomInstruction, SupportedLanguage, TranscriptionOutputFormat, ModelInfo, Theme } from '../types';
import { DEFAULT_SETTINGS, LLM_PROVIDERS } from '../constants';
import { loggingService } from '../services/loggingService';


const GEMINI_LIVE_MODELS = [
  { id: 'gemini-2.5-flash-native-audio-latest',        label: 'Gemini 2.5 Flash Native Audio (latest)' },
  { id: 'gemini-2.5-flash-native-audio-preview-12-2025', label: 'Gemini 2.5 Flash Native Audio Preview Dec' },
  { id: 'gemini-2.5-flash-native-audio-preview-09-2025', label: 'Gemini 2.5 Flash Native Audio Preview Sep' },
  { id: 'gemini-3.1-flash-live-preview',               label: 'Gemini 3.1 Flash Live Preview' },
];

import { LogsTab } from './settings/LogsTab';
import { CustomInstructionsTab } from './settings/CustomInstructionsTab';
import { SystemPromptsTab } from './settings/SystemPromptsTab';
import { Calendar2IntegrationTab } from './settings/Calendar2IntegrationTab';
import { StorageTab } from './settings/StorageTab';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (newSettings: AppSettings) => void;
  hasCustomApiKey: boolean;
  onSaveCustomApiKey: (key: string) => Promise<void>;
  onDeleteCustomApiKey: () => Promise<void>;
  initialTab?: string;
  onTestMeetingNotification?: () => void;
}

const TABS = [
  { id: 'appearance', label: 'General' },
  { id: 'llm', label: 'LLM Configuration' },
  { id: 'audio', label: 'Audio Recording' },
  { id: 'transcription', label: 'Transcription & Notes' },
  { id: 'custom-instructions', label: 'AI Rules' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'storage', label: 'Storage' },
  { id: 'logs', label: 'Logs & Monitoring' },
];

type ModelFunction = 'analysis' | 'transcription' | 'chat';

const ModelCombobox: React.FC<{
  label: string;
  hint: string;
  value: string;
  models: ModelInfo[];
  fn: ModelFunction;
  onChange: (modelName: string) => void;
}> = ({ label, hint, value, models, fn, onChange }) => {
  const selected = models.find(m => m.name === value);
  const isCustom = !selected;

  return (
    <div className="space-y-1.5">
      <div>
        <label className="block text-sm font-medium text-gray-200">{label}</label>
        <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        {models.map((m) => {
          const isRec = m.recommendedFor?.includes(fn);
          return (
            <option key={m.name} value={m.name}>
              {isRec ? '★ ' : ''}{m.name} — {m.cost}
            </option>
          );
        })}
        {isCustom && (
          <option value={value}>{value} (custom)</option>
        )}
      </select>
      {selected ? (
        <p className="text-[11px] text-gray-400 leading-snug">
          {selected.specialization} <span className="text-gray-500">· {selected.releaseDate}</span>
        </p>
      ) : (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="ID modello custom, es. gemini-2.5-pro-preview-05-06"
            className="flex-1 bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
          />
        </div>
      )}
    </div>
  );
};


export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen, onClose, settings, onSettingsChange,
  hasCustomApiKey, onSaveCustomApiKey, onDeleteCustomApiKey,
  initialTab, onTestMeetingNotification,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(() => {
    const validLiveIds = GEMINI_LIVE_MODELS.map(m => m.id);
    const savedModel = settings.transcription.liveModel;
    const liveModel = savedModel && validLiveIds.includes(savedModel)
      ? savedModel
      : (GEMINI_LIVE_MODELS[0]?.id ?? '');
    return { ...settings, transcription: { ...settings.transcription, liveModel } };
  });
  const [activeTab, setActiveTab] = useState(initialTab ?? TABS[0]?.id ?? '');

  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
  }, [isOpen, initialTab]);
  const [aiRulesSubTab, setAiRulesSubTab] = useState<'user' | 'system'>('user');

  // Update state
  type UpdateStatus = 'idle' | 'checking' | 'ready' | 'updating' | 'done' | 'error';
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<{ localVersion: string; remoteVersion: string; hasUpdate: boolean; releaseUrl: string } | null>(null);
  const [updateLog, setUpdateLog] = useState<string[]>([]);

  // Live model fetch + test state
  const [fetchedLiveModels, setFetchedLiveModels] = useState<{ id: string; label: string }[]>([]);
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [testResults, setTestResults] = useState<Record<string, 'testing' | 'ok' | 'fail' | 'timeout'>>({});
  const [isTesting, setIsTesting] = useState(false);

  const liveApiKey = localSettings.llm.googleApiKey?.trim() || process.env.API_KEY || '';
  const displayedLiveModels = fetchedLiveModels.length > 0 ? fetchedLiveModels : GEMINI_LIVE_MODELS;

  const fetchLiveModels = useCallback(async () => {
    if (!liveApiKey) { loggingService.warn('LIVE_MODELS_FETCH', 'No API key'); return; }
    setFetchStatus('loading');
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${liveApiKey}&pageSize=200`);
      const data = await res.json();
      interface GeminiApiModel { name: string; displayName?: string; supportedGenerationMethods?: string[] }
      const all: GeminiApiModel[] = data.models ?? [];

      // Log all models + their methods for debugging
      loggingService.debug('LIVE_MODELS_FETCH', `Total models from API: ${all.length}`);
      all.forEach(m => loggingService.debug('LIVE_MODELS_FETCH', `  ${m.name}`, { methods: m.supportedGenerationMethods }));

      // Filter: name contains 'live' OR any method contains 'bidi'/'bidirectional'
      const models: { id: string; label: string }[] = all
        .filter((m) => {
          const name: string = (m.name ?? '').toLowerCase();
          const methods: string[] = m.supportedGenerationMethods ?? [];
          return name.includes('live') || methods.some((mt: string) => mt.toLowerCase().includes('bidi'));
        })
        .map((m) => ({ id: m.name.replace('models/', ''), label: m.displayName ?? m.name }));

      loggingService.debug('LIVE_MODELS_FETCH', `Live-compatible models: ${models.length}`, { ids: models.map(m => m.id) });
      setFetchedLiveModels(models);
      setFetchStatus('done');
      if (models.length > 0 && !models.find(m => m.id === localSettings.transcription.liveModel)) {
        setLocalSettings(prev => ({ ...prev, transcription: { ...prev.transcription, liveModel: models[0]!.id } }));
      }
    } catch (err) {
      loggingService.warn('LIVE_MODELS_FETCH', `Error: ${err}`);
      setFetchStatus('error');
    }
  }, [liveApiKey, localSettings.transcription.liveModel]);

  const testSingleModel = (modelId: string, apiKey: string): Promise<'ok' | 'fail' | 'timeout'> =>
    new Promise((resolve) => {
      const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      let settled = false;
      const settle = (r: 'ok' | 'fail' | 'timeout') => { if (!settled) { settled = true; resolve(r); } };
      const timer = window.setTimeout(() => { try { ws.close(); } catch {} settle('timeout'); }, 4000);
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        loggingService.debug('LIVE_MODEL_TEST', `${modelId}: connected, sending setup`);
        ws.send(JSON.stringify({ setup: { model: `models/${modelId}`, generation_config: { response_modalities: ['audio', 'text'] } } }));
      };
      ws.onmessage = async (e) => {
        try {
          const txt = e.data instanceof Blob ? await e.data.text() : e.data;
          const parsed = JSON.parse(txt);
          loggingService.debug('LIVE_MODEL_TEST', `${modelId}: message received`, { keys: Object.keys(parsed) });
          if (parsed?.setupComplete) { clearTimeout(timer); try { ws.close(); } catch {} settle('ok'); }
        } catch {}
      };
      ws.onclose = (e) => {
        clearTimeout(timer);
        loggingService.debug('LIVE_MODEL_TEST', `${modelId}: closed code=${e.code} reason="${e.reason}"`);
        settle(e.code === 1000 || e.code === 1001 ? 'ok' : 'fail');
      };
      ws.onerror = (_e) => {
        clearTimeout(timer);
        loggingService.warn('LIVE_MODEL_TEST', `${modelId}: onerror`);
        settle('fail');
      };
    });

  const testAllLiveModels = useCallback(async () => {
    if (!liveApiKey || isTesting) return;
    const models = displayedLiveModels;
    setIsTesting(true);
    setTestResults({});
    loggingService.debug('LIVE_MODEL_TEST', `Testing ${models.length} models...`);
    for (const m of models) {
      setTestResults(prev => ({ ...prev, [m.id]: 'testing' }));
      loggingService.debug('LIVE_MODEL_TEST', `Testing ${m.id}...`);
      const result = await testSingleModel(m.id, liveApiKey);
      setTestResults(prev => ({ ...prev, [m.id]: result }));
      loggingService.debug('LIVE_MODEL_TEST', `${m.id} → ${result}`);
    }
    setIsTesting(false);
    loggingService.debug('LIVE_MODEL_TEST', 'Test complete', { results: Object.fromEntries(models.map(m => [m.id, '?'])) });
  }, [liveApiKey, isTesting, displayedLiveModels]);

  // API key UI state
  const [showSystemKey, setShowSystemKey] = useState(false);
  const [showCustomKey, setShowCustomKey] = useState(false);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const systemKey: string = (process.env.API_KEY as string) || '';
  const systemKeyPresent = !!systemKey;
  const systemKeyPreview = systemKey
    ? `${systemKey.slice(0, 6)}${'•'.repeat(16)}${systemKey.slice(-4)}`
    : '';

  useEffect(() => {
    if (isOpen) {
      const s: AppSettings = structuredClone(settings);
      setLocalSettings(s);
      setCustomKeyInput(
        settings.llm.apiKeySource === 'custom' ? settings.llm.googleApiKey || '' : ''
      );
      setShowSystemKey(false);
      setShowCustomKey(false);
      setKeyFeedback(null);
    }
  }, [isOpen, settings]);

  const handleSaveKey = async () => {
    if (!customKeyInput.trim()) return;
    setIsSavingKey(true);
    setKeyFeedback(null);
    try {
      await onSaveCustomApiKey(customKeyInput.trim());
      setKeyFeedback({ type: 'ok', msg: 'Chiave salvata nel DB (cifrata).' });
      // Ensure source is set to custom in localSettings
      setLocalSettings(prev => ({
        ...prev,
        llm: { ...prev.llm, apiKeySource: 'custom' },
      }));
    } catch {
      setKeyFeedback({ type: 'err', msg: 'Errore nel salvataggio.' });
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleDeleteKey = async () => {
    setKeyFeedback(null);
    try {
      await onDeleteCustomApiKey();
      setCustomKeyInput('');
      setKeyFeedback({ type: 'ok', msg: 'Chiave personalizzata eliminata.' });
      setLocalSettings(prev => ({
        ...prev,
        llm: { ...prev.llm, apiKeySource: 'system' },
      }));
    } catch {
      setKeyFeedback({ type: 'err', msg: 'Errore durante l\'eliminazione.' });
    }
  };

  const handleLocalGenericChange = <T extends keyof AppSettings, K extends keyof AppSettings[T]>(
    category: T,
    key: K,
    value: AppSettings[T][K]
  ) => {
    setLocalSettings(prev => {
      const categorySettings = prev[category] || DEFAULT_SETTINGS[category];
      return {
        ...prev,
        [category]: {
          ...categorySettings,
          [key]: value,
        },
      };
    });
  };

  const handleLocalLlmChange = <K extends keyof AppSettings['llm']>(
    key: K,
    value: AppSettings['llm'][K]
  ) => {
    handleLocalGenericChange('llm', key, value);
  };

  const handleLocalProviderChange = (newProvider: string) => {
    setLocalSettings(prev => ({
      ...prev,
      llm: {
        ...prev.llm,
        provider: newProvider,
        model: LLM_PROVIDERS[newProvider]?.models[0]?.name || '',
      },
    }));
  };
  


  const handleSaveChanges = () => {
    onSettingsChange(localSettings);
    onClose();
  };

  const resetToDefaults = () => {
    setLocalSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  };

  const bitrateOptions = [
    { value: 64000, label: "64 kbps" },
    { value: 96000, label: "96 kbps" },
    { value: 128000, label: "128 kbps (Default)" },
    { value: 192000, label: "192 kbps" },
    { value: 256000, label: "256 kbps" },
  ];

  const channelOptions = [
    { value: "mono", label: "Mono" },
    { value: "stereo", label: "Stereo" },
  ];
  
  const themeOptions = [
      { value: Theme.DARK, label: 'Dark Mode (Default)' },
      { value: Theme.LIGHT, label: 'Light Mode' },
      { value: Theme.DARK_GREY, label: 'Dark Grey Mode' },
  ];

const languageOptions = (["Italian", "English"] as SupportedLanguage[]).map(l => ({ value: l, label: l }));
  const outputFormatOptions = Object.values(TranscriptionOutputFormat).map(f => ({ value: f, label: f.toUpperCase() }));

  const providerOptions = Object.keys(LLM_PROVIDERS).map(p => ({ value: p, label: p }));
  const currentProviderInfo = LLM_PROVIDERS[localSettings.llm.provider];
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Application Settings" maxWidth="max-w-4xl">
       <div className="border-b border-gray-700">
        <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors duration-200
                ${activeTab === tab.id
                  ? 'border-sky-400 text-sky-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                }
              `}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="pt-5 space-y-6">
        {activeTab === 'appearance' && (
          <section className="space-y-4">
            <div className="space-y-4 p-3 bg-gray-700 rounded-md">
              <Select
                  label="Color Theme:"
                  id="appearanceTheme"
                  options={themeOptions}
                  value={localSettings.appearance?.theme || Theme.DARK}
                  onChange={(e) => handleLocalGenericChange('appearance', 'theme', e.target.value as Theme)}
              />
            </div>

            <div className="space-y-3 p-3 bg-gray-700 rounded-md">
              <h3 className="text-sm font-semibold text-sky-300">Meeting notifications</h3>
              <p className="text-xs text-gray-400">
                Mostra una notifica del browser N minuti prima dell'inizio di una call, con relazione AI sul contenuto e indicazione del tuo ruolo (organizzatore / required / optional).
              </p>

              <Checkbox
                label="Enable pre-call browser notifications"
                id="meetingNotificationsEnabled"
                checked={localSettings.appearance?.meetingNotificationsEnabled ?? true}
                onChange={(e) => handleLocalGenericChange('appearance', 'meetingNotificationsEnabled', e.target.checked)}
              />

              <Input
                label="Your email (per matching To / CC)"
                id="userEmail"
                type="email"
                placeholder="name@company.com"
                value={localSettings.appearance?.userEmail ?? ''}
                onChange={(e) => handleLocalGenericChange('appearance', 'userEmail', e.target.value.trim())}
              />

              <Input
                label="Lead time (minutes before the call)"
                id="meetingNotificationLeadMinutes"
                type="number"
                min={1}
                max={30}
                value={localSettings.appearance?.meetingNotificationLeadMinutes ?? 10}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  handleLocalGenericChange('appearance', 'meetingNotificationLeadMinutes', Number.isFinite(n) ? Math.min(30, Math.max(1, n)) : 10);
                }}
              />

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onTestMeetingNotification?.()}
                  className="text-xs px-3 py-1 rounded-md bg-sky-600 hover:bg-sky-500 text-white"
                >
                  Test notification
                </button>
                <span className="text-[11px] text-gray-400">
                  Le notifiche compaiono in-app (toast in alto a destra), nessun permesso browser/OS richiesto.
                </span>
              </div>
            </div>

            {/* ── Aggiornamento App ── */}
            <div className="space-y-3 p-3 bg-gray-700 rounded-md">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-sky-300">Aggiornamento App</h3>
                {updateInfo && (
                  <span className="text-xs text-gray-400">
                    Locale: <span className="text-gray-200">v{updateInfo.localVersion}</span>
                    {updateInfo.hasUpdate
                      ? <> → <span className="text-amber-400">v{updateInfo.remoteVersion} disponibile</span></>
                      : <span className="text-green-400"> · aggiornato</span>}
                  </span>
                )}
              </div>

              <Input
                label="Repository GitHub"
                id="githubRepoUrl"
                type="url"
                placeholder="https://github.com/owner/repo"
                value={localSettings.appearance?.githubRepoUrl ?? ''}
                onChange={(e) => handleLocalGenericChange('appearance', 'githubRepoUrl', e.target.value.trim())}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!localSettings.appearance?.githubRepoUrl || updateStatus === 'checking' || updateStatus === 'updating'}
                  onClick={async () => {
                    setUpdateStatus('checking');
                    setUpdateLog([]);
                    setUpdateInfo(null);
                    try {
                      const r = await fetch(`/api/update/check?repo=${encodeURIComponent(localSettings.appearance?.githubRepoUrl || '')}`);
                      const data = await r.json();
                      if (data.error) throw new Error(data.error);
                      setUpdateInfo(data);
                      setUpdateStatus(data.hasUpdate ? 'ready' : 'idle');
                    } catch (e: any) {
                      setUpdateLog([`Errore: ${e.message}`]);
                      setUpdateStatus('error');
                    }
                  }}
                  className="text-xs px-3 py-1 rounded-md bg-gray-500 hover:bg-gray-400 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {updateStatus === 'checking' ? 'Verifica…' : 'Verifica aggiornamenti'}
                </button>

                {updateInfo && updateStatus !== 'checking' && updateStatus !== 'done' && (() => {
                  const isReady = updateStatus === 'ready';
                  const isUpdating = updateStatus === 'updating';
                  const applyUpdate = async () => {
                    setUpdateStatus('updating');
                    setUpdateLog([]);
                    try {
                      const res = await fetch('/api/update/apply', { method: 'POST' });
                      const reader = res.body!.getReader();
                      const dec = new TextDecoder();
                      let buf = '';
                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buf += dec.decode(value, { stream: true });
                        const lines = buf.split('\n');
                        buf = lines.pop() ?? '';
                        for (const line of lines) {
                          if (!line.trim()) continue;
                          try {
                            const ev = JSON.parse(line);
                            const label = ev.msg || `[${ev.step}] ${ev.status || ev.action || ''}`;
                            setUpdateLog(l => [...l, label]);
                            if (ev.step === 'complete') {
                              setUpdateStatus('done');
                              if (ev.action === 'reload') setTimeout(() => window.location.reload(), 1500);
                            }
                            if (ev.step === 'error') setUpdateStatus('error');
                          } catch {}
                        }
                      }
                    } catch (e: any) {
                      setUpdateLog(l => [...l, `Errore: ${e.message}`]);
                      setUpdateStatus('error');
                    }
                  };
                  return (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={applyUpdate}
                      className={`text-xs px-3 py-1 rounded-md text-white disabled:opacity-40 ${isReady ? 'bg-amber-600 hover:bg-amber-500' : 'bg-gray-500 hover:bg-gray-400'}`}
                    >
                      {isUpdating ? 'Aggiornamento…' : isReady ? 'Applica aggiornamento' : 'Forza aggiornamento'}
                    </button>
                  );
                })()}
              </div>

              {updateLog.length > 0 && (
                <pre className="text-xs text-gray-400 bg-gray-800 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {updateLog.join('\n')}
                </pre>
              )}

              {updateStatus === 'done' && (
                <p className="text-xs text-green-400">Aggiornamento completo. Ricarico la pagina…</p>
              )}
            </div>
          </section>
        )}
        
        {activeTab === 'llm' && (
          <section>
           <div className="space-y-4 p-3 bg-gray-700 rounded-md">
              <Select
                label="LLM Provider:"
                id="llmProvider"
                options={providerOptions}
                value={localSettings.llm.provider}
                onChange={(e) => handleLocalProviderChange(e.target.value)}
              />
              {currentProviderInfo?.isCustom ? (
                <div className="space-y-4 border-t border-gray-600 pt-4 mt-4">
                  <Input
                    label="Model Name:"
                    id="customModelName"
                    type="text"
                    value={localSettings.llm.model}
                    onChange={(e) => handleLocalLlmChange('model', e.target.value)}
                    placeholder="e.g., mistral-7b-v0.1"
                    required
                  />
                  <Input
                    label="Base URL:"
                    id="llmApiBaseUrl"
                    type="text"
                    value={localSettings.llm.apiBaseUrl}
                    onChange={(e) => handleLocalLlmChange('apiBaseUrl', e.target.value)}
                    placeholder="e.g., http://localhost:11434/v1"
                    required
                  />
                  <Input
                    label="API Key (Optional):"
                    id="llmCustomApiKey"
                    type="password"
                    value={localSettings.llm.customApiKey || ''}
                    onChange={(e) => handleLocalLlmChange('customApiKey', e.target.value)}
                    placeholder="Enter your API key, if applicable"
                  />
                </div>
              ) : (
                <>
                  {/* ── API Key Management ───────────────────────────────── */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-300">Google API Key:</label>

                    {/* System key row */}
                    <div className="p-3 bg-gray-800 rounded-md border border-gray-600">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-gray-400">Chiave di sistema (.env)</span>
                          <div className="relative group">
                            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-gray-600 text-gray-300 text-[10px] font-bold cursor-default select-none">i</span>
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 hidden group-hover:block w-72 p-2.5 bg-gray-900 border border-gray-600 rounded-md shadow-xl text-left pointer-events-none">
                              <p className="text-xs font-semibold text-gray-200 mb-1.5">Sorgente chiave di sistema</p>
                              <p className="text-[11px] text-gray-400 mb-1">Variabile d'ambiente letta all'avvio del dev server:</p>
                              <code className="block text-[11px] text-sky-300 bg-gray-800 px-2 py-1 rounded mb-2">GEMINI_API_KEY</code>
                              <p className="text-[11px] text-gray-400 mb-1">File da creare/modificare nella cartella radice del progetto:</p>
                              <code className="block text-[11px] text-emerald-300 bg-gray-800 px-2 py-1 rounded mb-2">.env</code>
                              <p className="text-[11px] text-gray-500">Formato: <span className="text-gray-300">GEMINI_API_KEY=la_tua_chiave</span></p>
                              <p className="text-[11px] text-gray-500 mt-1">Configurato in <span className="text-gray-300">vite.config.ts</span> via <span className="text-gray-300">loadEnv(mode, '.', '')</span>. Richiede il riavvio del server dopo ogni modifica.</p>
                            </div>
                          </div>
                        </div>
                        {systemKeyPresent
                          ? <span className="text-xs text-emerald-400">✓ Configurata</span>
                          : <span className="text-xs text-yellow-500">⚠ Non configurata</span>}
                      </div>
                      {systemKeyPresent && (
                        <div className="flex gap-2 items-center mt-1">
                          <code className="flex-1 text-xs font-mono text-gray-300 tracking-wider truncate">
                            {showSystemKey ? systemKey : systemKeyPreview}
                          </code>
                          <button
                            type="button"
                            onClick={() => setShowSystemKey(v => !v)}
                            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 bg-gray-700 rounded border border-gray-600"
                            title={showSystemKey ? 'Nascondi' : 'Mostra'}
                          >
                            {showSystemKey ? '🙈' : '👁'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Source selector */}
                    <div className="flex gap-6">
                      {(['system', 'custom'] as const).map((src) => (
                        <label key={src} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="radio"
                            name="apiKeySource"
                            value={src}
                            checked={(localSettings.llm.apiKeySource ?? 'system') === src}
                            onChange={() => handleLocalLlmChange('apiKeySource', src)}
                            className="accent-sky-500"
                          />
                          <span className="text-sm text-gray-300">
                            {src === 'system' ? 'Usa chiave di sistema' : 'Usa chiave personalizzata (cifrata nel DB)'}
                          </span>
                        </label>
                      ))}
                    </div>

                    {/* Custom key section */}
                    {(localSettings.llm.apiKeySource ?? 'system') === 'custom' && (
                      <div className="p-3 bg-gray-800 rounded-md border border-gray-600 space-y-3">
                        {/* Saved key status */}
                        <div className="flex items-center justify-between">
                          {hasCustomApiKey
                            ? <span className="text-xs text-emerald-400">✓ Chiave personalizzata salvata nel DB</span>
                            : <span className="text-xs text-yellow-500">⚠ Nessuna chiave personalizzata salvata</span>}
                          {hasCustomApiKey && (
                            <button
                              type="button"
                              onClick={handleDeleteKey}
                              className="text-xs text-red-400 hover:text-red-300 underline"
                            >
                              Elimina dal DB
                            </button>
                          )}
                        </div>

                        {/* Input + save */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            {hasCustomApiKey ? 'Aggiorna chiave:' : 'Inserisci chiave API:'}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type={showCustomKey ? 'text' : 'password'}
                              value={customKeyInput}
                              onChange={(e) => setCustomKeyInput(e.target.value)}
                              placeholder="Incolla la chiave API Google…"
                              autoComplete="off"
                              className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setShowCustomKey(v => !v)}
                              className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 bg-gray-700 rounded border border-gray-600"
                              title={showCustomKey ? 'Nascondi' : 'Mostra'}
                            >
                              {showCustomKey ? '🙈' : '👁'}
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveKey}
                              disabled={!customKeyInput.trim() || isSavingKey}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded border border-sky-700"
                            >
                              {isSavingKey ? '…' : 'Salva nel DB'}
                            </button>
                          </div>
                        </div>

                        {/* Feedback */}
                        {keyFeedback && (
                          <p className={`text-xs ${keyFeedback.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {keyFeedback.type === 'ok' ? '✓' : '✗'} {keyFeedback.msg}
                          </p>
                        )}
                      </div>
                    )}

                    {keyFeedback && (localSettings.llm.apiKeySource ?? 'system') !== 'custom' && (
                      <p className={`text-xs ${keyFeedback.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {keyFeedback.type === 'ok' ? '✓' : '✗'} {keyFeedback.msg}
                      </p>
                    )}
                  </div>

                  {/* Base URL */}
                  <Input
                    label="API Base URL:"
                    id="googleApiBaseUrl"
                    type="text"
                    value={localSettings.llm.apiBaseUrl || ''}
                    onChange={(e) => handleLocalLlmChange('apiBaseUrl', e.target.value)}
                    placeholder="https://generativelanguage.googleapis.com"
                  />

                  {/* Per-function model selectors */}
                  <div className="space-y-4 border-t border-gray-600 pt-4">
                    <ModelCombobox
                      label="AI Analysis Model"
                      hint="Write Minutes, Summary, Bullet Points, Coherence — operazioni di analisi LLM"
                      value={localSettings.llm.model}
                      models={currentProviderInfo?.models || []}
                      fn="analysis"
                      onChange={(v) => handleLocalLlmChange('model', v)}
                    />
                    <ModelCombobox
                      label="Transcription Model"
                      hint="Audio-to-text dei chunk registrati — trascrizione audio"
                      value={localSettings.llm.transcriptionModel ?? localSettings.llm.model}
                      models={currentProviderInfo?.models || []}
                      fn="transcription"
                      onChange={(v) => handleLocalLlmChange('transcriptionModel', v)}
                    />
                    <ModelCombobox
                      label="Chatbot Model"
                      hint="Meeting chat assistant — conversazione contestuale sulla sessione"
                      value={localSettings.llm.chatModel ?? localSettings.llm.model}
                      models={currentProviderInfo?.models || []}
                      fn="chat"
                      onChange={(v) => handleLocalLlmChange('chatModel', v)}
                    />
                  </div>
                </>
              )}

              <Checkbox
                label="Enhance results with web search & sources (Google Only)"
                id="llmEnhanceWithWebSearch"
                checked={localSettings.llm.enhanceWithWebSearch}
                onChange={(e) => handleLocalLlmChange('enhanceWithWebSearch', e.target.checked)}
                disabled={localSettings.llm.provider !== 'Google'}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                    label="API Max Retries:"
                    id="llmMaxRetries"
                    type="number"
                    min="0"
                    max="10"
                    value={localSettings.llm.maxRetries ?? 3}
                    onChange={(e) => handleLocalLlmChange('maxRetries', parseInt(e.target.value, 10) || 0)}
                />
                <Input
                    label="API Timeout (seconds):"
                    id="llmTimeout"
                    type="number"
                    min="10"
                    max="600"
                    value={localSettings.llm.timeout ?? 600}
                    onChange={(e) => handleLocalLlmChange('timeout', parseInt(e.target.value, 10) || 10)}
                />
              </div>
          </div>
        </section>
        )}

        {activeTab === 'audio' && (
          <section>
            <div className="space-y-4 p-3 bg-gray-700 rounded-md">
              <Select
                label="Bitrate:"
                id="audioBitrate"
                options={bitrateOptions}
                value={localSettings.audio.bitrate}
                onChange={(e) => handleLocalGenericChange('audio', 'bitrate', parseInt(e.target.value))}
              />
              <Select
                label="Channels:"
                id="audioChannels"
                options={channelOptions}
                value={localSettings.audio.channels}
                onChange={(e) => handleLocalGenericChange('audio', 'channels', e.target.value as "mono" | "stereo")}
              />
              <div className="pt-4 mt-4 border-t border-gray-600">
                <h4 className="text-md font-semibold text-sky-400 mb-3">Microphone Hardware Filters</h4>
                
                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-600 mb-3 space-y-3">
                    <Checkbox
                        label="Auto-manage Echo Cancellation"
                        id="audioAutoManageAEC"
                        checked={localSettings.audio.autoManageEchoCancellation}
                        onChange={(e) => handleLocalGenericChange('audio', 'autoManageEchoCancellation', e.target.checked)}
                        title="OFF per forzare manualmente l'Echo Cancellation."
                    />
                    <p className="text-[10px] text-gray-400 leading-tight">
                        Se attivo, l'Echo Cancellation si abilita solo quando condividi l'Audio di Sistema. Se disattivo, puoi forzarlo come preferisci qui sotto.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className={localSettings.audio.autoManageEchoCancellation ? "opacity-50" : ""}>
                    <Checkbox
                        label="Echo Cancellation"
                        id="audioEchoCancellation"
                        checked={localSettings.audio.echoCancellation}
                        onChange={(e) => handleLocalGenericChange('audio', 'echoCancellation', e.target.checked)}
                        disabled={localSettings.audio.autoManageEchoCancellation}
                        title={localSettings.audio.autoManageEchoCancellation ? "Gestito automaticamente (disattiva Auto-manage per cambiare)" : "Forza Echo Cancellation ON/OFF"}
                    />
                  </div>
                  <Checkbox
                    label="Noise Suppression"
                    id="audioNoiseSuppression"
                    checked={localSettings.audio.noiseSuppression}
                    onChange={(e) => handleLocalGenericChange('audio', 'noiseSuppression', e.target.checked)}
                  />
                  <Checkbox
                    label="Auto Gain Control"
                    id="audioAutoGainControl"
                    checked={localSettings.audio.autoGainControl}
                    onChange={(e) => handleLocalGenericChange('audio', 'autoGainControl', e.target.checked)}
                  />
                </div>
              </div>
              <div className="pt-4 mt-4 border-t border-gray-600">
                <h4 className="text-md font-semibold text-gray-200 mb-2">Waveform Style</h4>
                <p className="text-[10px] text-gray-400 mb-3 leading-tight">
                  Applied to both the main recording screen and the PiP widget.
                </p>
                <div className="flex gap-3">
                  {([
                    { value: 'spectrum', label: 'Spectrum Analyzer', desc: 'Frequency bars — shows spectral content' },
                    { value: 'oscilloscope', label: 'Oscilloscope', desc: 'Waveform line — shows audio shape over time' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleLocalGenericChange('audio', 'waveformStyle', opt.value)}
                      className="flex-1 flex flex-col gap-1 px-3 py-2.5 rounded-xl text-left transition-all"
                      style={{
                        background: (localSettings.audio.waveformStyle ?? 'spectrum') === opt.value
                          ? 'rgba(124,58,237,0.22)'
                          : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${(localSettings.audio.waveformStyle ?? 'spectrum') === opt.value
                          ? 'rgba(139,92,246,0.55)'
                          : 'rgba(255,255,255,0.1)'}`,
                      }}
                    >
                      <span className="text-sm font-semibold" style={{
                        color: (localSettings.audio.waveformStyle ?? 'spectrum') === opt.value ? '#C4B5FD' : '#9CA3AF',
                      }}>{opt.label}</span>
                      <span className="text-[10px] text-gray-500 leading-tight">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
               <Checkbox
                label="Enable Chunked Recording"
                id="transcriptionEnableChunkedRecording"
                checked={localSettings.transcription.enableChunkedRecording ?? false}
                onChange={(e) => handleLocalGenericChange('transcription', 'enableChunkedRecording', e.target.checked)}
              />
               <Input
                label="Chunk Interval (seconds):"
                id="transcriptionChunkInterval"
                type="number"
                min="5"
                max="3600"
                value={localSettings.transcription.chunkRecordingIntervalSeconds ?? 10}
                onChange={(e) => handleLocalGenericChange('transcription', 'chunkRecordingIntervalSeconds', parseInt(e.target.value, 10) || 10)}
                className="w-full sm:w-1/2"
                disabled={!(localSettings.transcription.enableChunkedRecording ?? false)}
              />
              <Checkbox
                label="Trascrivi automaticamente ogni chunk salvato"
                id="transcriptionAutoTranscribeChunks"
                checked={localSettings.transcription.autoTranscribeChunks ?? true}
                onChange={(e) => handleLocalGenericChange('transcription', 'autoTranscribeChunks', e.target.checked)}
                disabled={!(localSettings.transcription.enableChunkedRecording ?? false)}
              />
              <div className="pt-4 mt-4 border-t border-gray-600">
                <h4 className="text-md font-semibold text-gray-200 mb-2">Auto-Pause on Silence</h4>
                <Checkbox
                    label="Enable Auto-Pause"
                    id="audioEnableAutoPause"
                    checked={localSettings.audio.enableAutoPause ?? false}
                    onChange={(e) => handleLocalGenericChange('audio', 'enableAutoPause', e.target.checked)}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                    <Input
                        label="Silence Duration (sec):"
                        id="audioAutoPauseTimeout"
                        type="number"
                        min="10"
                        max="600"
                        value={localSettings.audio.autoPauseTimeoutSeconds ?? 180}
                        onChange={(e) => handleLocalGenericChange('audio', 'autoPauseTimeoutSeconds', parseInt(e.target.value, 10) || 180)}
                        disabled={!localSettings.audio.enableAutoPause}
                    />
                    <div>
                      <Input
                          label="Resume Sensitivity (dBFS):"
                          id="audioAutoPauseSensitivity"
                          type="number"
                          min="-100"
                          max="0"
                          value={localSettings.audio.autoPauseSensitivityDb ?? -50}
                          onChange={(e) => handleLocalGenericChange('audio', 'autoPauseSensitivityDb', parseInt(e.target.value, 10) || -50)}
                          disabled={!localSettings.audio.enableAutoPause}
                      />
                    </div>
                </div>
              </div>

              {/* Auto-Stop on Prolonged Silence */}
              {localSettings.audio.enableAutoPause && (
                <div className="pt-3 border-t border-gray-600 space-y-3">
                  <h4 className="text-md font-semibold text-gray-200 mb-2">Auto-Stop after Prolonged Silence</h4>
                  <Checkbox
                    label="Enable Auto-Stop"
                    id="audioEnableAutoStop"
                    checked={localSettings.audio.enableAutoStop ?? true}
                    onChange={(e) => handleLocalGenericChange('audio', 'enableAutoStop', e.target.checked)}
                  />
                  {(localSettings.audio.enableAutoStop ?? true) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                      <Input
                        label="Notify after (min):"
                        id="audioAutoNotifyMin"
                        type="number"
                        min="1"
                        max="60"
                        value={localSettings.audio.autoNotifyAfterPausedMinutes ?? 5}
                        onChange={(e) => handleLocalGenericChange('audio', 'autoNotifyAfterPausedMinutes', parseInt(e.target.value, 10) || 5)}
                      />
                      <Input
                        label="Stop after (min):"
                        id="audioAutoStopMin"
                        type="number"
                        min="1"
                        max="120"
                        value={localSettings.audio.autoStopAfterPausedMinutes ?? 15}
                        onChange={(e) => handleLocalGenericChange('audio', 'autoStopAfterPausedMinutes', parseInt(e.target.value, 10) || 15)}
                      />
                      <Input
                        label="Warning countdown (sec):"
                        id="audioAutoStopWarnSec"
                        type="number"
                        min="10"
                        max="300"
                        value={localSettings.audio.autoStopWarningSeconds ?? 60}
                        onChange={(e) => handleLocalGenericChange('audio', 'autoStopWarningSeconds', parseInt(e.target.value, 10) || 60)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'transcription' && (
          <section>
            <div className="space-y-4 p-3 bg-gray-700 rounded-md">

              <Checkbox
                label="Enable Real-time Transcription (Live, Gemini)"
                id="transcriptionEnableRealtime"
                checked={localSettings.transcription.enableRealtimeTranscription ?? false}
                onChange={(e) => handleLocalGenericChange('transcription', 'enableRealtimeTranscription', e.target.checked)}
              />

              {/* Live model selector */}
              {(localSettings.transcription.enableRealtimeTranscription ?? false) && (
                <div className="space-y-2">
                  <Select
                    label="Live Transcription Model:"
                    id="liveModel"
                    options={displayedLiveModels.map(m => ({
                      value: m.id,
                      label: m.id + (testResults[m.id] === 'ok' ? ' ✓' : testResults[m.id] === 'fail' ? ' ✗' : testResults[m.id] === 'testing' ? ' …' : testResults[m.id] === 'timeout' ? ' ?' : ''),
                    }))}
                    value={localSettings.transcription.liveModel ?? displayedLiveModels[0]?.id ?? ''}
                    onChange={(e) => handleLocalGenericChange('transcription', 'liveModel', e.target.value)}
                  />
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={fetchLiveModels}
                      disabled={!liveApiKey || fetchStatus === 'loading'}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#C4B5FD' }}
                    >
                      {fetchStatus === 'loading' ? 'Fetching…' : fetchStatus === 'done' ? `✓ ${fetchedLiveModels.length} models found` : fetchStatus === 'error' ? '✗ Fetch error' : 'Fetch models from API'}
                    </button>
                    <button
                      onClick={testAllLiveModels}
                      disabled={!liveApiKey || isTesting}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#6EE7B7' }}
                    >
                      {isTesting ? 'Testing…' : 'Test all models'}
                    </button>
                  </div>
                  {Object.keys(testResults).length > 0 && (
                    <div className="rounded-lg p-2 text-xs space-y-1" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--neo-border)' }}>
                      {displayedLiveModels.map(m => {
                        const r = testResults[m.id];
                        if (!r) return null;
                        const color = r === 'ok' ? '#6EE7B7' : r === 'fail' ? '#F87171' : r === 'testing' ? '#FCD34D' : '#94A3B8';
                        const icon = r === 'ok' ? '✓' : r === 'fail' ? '✗' : r === 'testing' ? '…' : '?';
                        return (
                          <div key={m.id} className="flex justify-between items-center">
                            <span style={{ color: 'var(--neo-muted)' }} className="truncate mr-2">{m.id}</span>
                            <span style={{ color, flexShrink: 0 }}>{icon} {r}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <Select
                label="Language:"
                id="transcriptionLanguage"
                options={languageOptions}
                value={localSettings.transcription.language}
                onChange={(e) => handleLocalGenericChange('transcription', 'language', e.target.value as SupportedLanguage)}
              />
<Select
                label="Output Format (for saving):"
                id="transcriptionOutputFormat"
                options={outputFormatOptions}
                value={localSettings.transcription.outputFormat}
                onChange={(e) => handleLocalGenericChange('transcription', 'outputFormat', e.target.value as TranscriptionOutputFormat)}
              />
               <Checkbox
                label="Attempt Speaker Diarization (Experimental)"
                id="transcriptionAttemptSpeakerDiarization"
                checked={localSettings.transcription.attemptSpeakerDiarization}
                onChange={(e) => handleLocalGenericChange('transcription', 'attemptSpeakerDiarization', e.target.checked)}
                disabled={localSettings.llm.provider !== 'Google'}
              />
              <Checkbox
                label="Include Date & Time in Text"
                id="transcriptionIncludeDateTimeInText"
                checked={localSettings.transcription.includeDateTimeInText ?? false}
                onChange={(e) => handleLocalGenericChange('transcription', 'includeDateTimeInText', e.target.checked)}
              />
               <Checkbox
                label="Enable Auto-Save"
                id="transcriptionEnableAutoSave"
                checked={localSettings.transcription.enableAutoSave ?? true}
                onChange={(e) => handleLocalGenericChange('transcription', 'enableAutoSave', e.target.checked)}
              />
            </div>
          </section>
        )}

        {activeTab === 'custom-instructions' && (
          <section className="space-y-4">
            {/* Sub-tab switcher */}
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--neo-border)' }}>
              {(['user', 'system'] as const).map(sub => (
                <button
                  key={sub}
                  onClick={() => setAiRulesSubTab(sub)}
                  className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all"
                  style={aiRulesSubTab === sub ? {
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.5), rgba(192,38,211,0.3))',
                    color: '#fff',
                    boxShadow: '0 0 12px rgba(124,58,237,0.2)',
                  } : { color: 'var(--neo-muted)' }}
                >
                  {sub === 'user' ? '👤 User Rules' : '⚙️ System Prompts'}
                </button>
              ))}
            </div>

            {aiRulesSubTab === 'user' && (
              <div className="p-3 bg-gray-700 rounded-md">
                <CustomInstructionsTab
                  instructions={localSettings.customInstructions ?? []}
                  onChange={(instructions: CustomInstruction[]) =>
                    setLocalSettings(prev => ({ ...prev, customInstructions: instructions }))
                  }
                />
              </div>
            )}

            {aiRulesSubTab === 'system' && (
              <div className="p-3 rounded-md" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <SystemPromptsTab
                  prompts={localSettings.systemPrompts ?? []}
                  onChange={(prompts) => setLocalSettings(prev => ({ ...prev, systemPrompts: prompts }))}
                />
              </div>
            )}
          </section>
        )}

        {activeTab === 'integrations' && (
          <section>
            <Calendar2IntegrationTab />
          </section>
        )}

        {activeTab === 'storage' && (
          <section>
            <StorageTab />
          </section>
        )}

        {activeTab === 'logs' && (
          <section>
            <LogsTab />
          </section>
        )}
      </div>

      <div className="mt-8 flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3">
        <Button onClick={resetToDefaults} variant="ghost" className="w-full sm:w-auto">Reset to Defaults</Button>
        <Button onClick={handleSaveChanges} variant="primary" className="w-full sm:w-auto">Done</Button>
      </div>
    </Modal>
  );
};
