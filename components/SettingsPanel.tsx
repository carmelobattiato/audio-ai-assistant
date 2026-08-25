
import React, { useState, useEffect } from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { Select } from './common/Select';
import { Input } from './common/Input';
import { Checkbox } from './common/Checkbox';
import { AppSettings, CustomInstruction, SupportedLanguage, TranscriptionOutputFormat, ModelInfo, Theme } from '../types';
import { DEFAULT_SETTINGS, LLM_PROVIDERS } from '../constants';

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

const ModelCombobox: React.FC<{
  label: string;
  hint: string;
  value: string;
  models: ModelInfo[];
  onChange: (modelName: string) => void;
}> = ({ label, hint, value, models, onChange }) => {
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
        {models.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name} — {m.cost}{m.eolDate ? ` ⚠ EOL ${m.eolDate}` : ''}
          </option>
        ))}
        {isCustom && (
          <option value={value}>{value} (custom)</option>
        )}
      </select>
      {selected ? (
        <p className="text-[11px] text-gray-400 leading-snug">
          {selected.specialization} <span className="text-gray-500">· {selected.releaseDate}</span>
          {selected.eolDate && (
            <span className="text-amber-400 ml-1">· ⚠ Fine supporto: {selected.eolDate}</span>
          )}
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
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
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

  // API key UI state
  const [showCustomKey, setShowCustomKey] = useState(false);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Snapshot settings only when the modal opens, not on every parent re-render.
    // If settings changed while open the user's in-progress edits must not be lost.
    const s: AppSettings = structuredClone(settings);
    setLocalSettings(s);
    setCustomKeyInput(settings.llm.googleApiKey || '');
    setShowCustomKey(false);
    setKeyFeedback(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // intentionally omits `settings` — snapshot on open only

  const handleSaveKey = async () => {
    if (!customKeyInput.trim()) return;
    setIsSavingKey(true);
    setKeyFeedback(null);
    try {
      await onSaveCustomApiKey(customKeyInput.trim());
      setKeyFeedback({ type: 'ok', msg: 'Chiave salvata nel DB (cifrata).' });
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
      setKeyFeedback({ type: 'ok', msg: 'Chiave eliminata dal DB.' });
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

                    <div className="p-3 bg-gray-800 rounded-md border border-gray-600 space-y-3">
                      {/* Saved key status */}
                      <div className="flex items-center justify-between">
                        {hasCustomApiKey
                          ? <span className="text-xs text-emerald-400">✓ Chiave salvata nel DB (cifrata)</span>
                          : <span className="text-xs text-yellow-500">⚠ Nessuna chiave configurata</span>}
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

                      {keyFeedback && (
                        <p className={`text-xs ${keyFeedback.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {keyFeedback.type === 'ok' ? '✓' : '✗'} {keyFeedback.msg}
                        </p>
                      )}
                    </div>
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

                  {/* Modello LLM unico per tutte le funzioni */}
                  <div className="space-y-4 border-t border-gray-600 pt-4">
                    <ModelCombobox
                      label="Modello LLM"
                      hint="Modello unico per analisi, trascrizione e chatbot"
                      value={localSettings.llm.model}
                      models={currentProviderInfo?.models || []}
                      onChange={(v) => handleLocalLlmChange('model', v)}
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
                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-600 mb-3">
                  <Checkbox
                    label="Auto-detect cuffie e suggerisci System Audio"
                    id="audioAutoDetectHeadphones"
                    checked={localSettings.audio.autoDetectHeadphones ?? true}
                    onChange={(e) => handleLocalGenericChange('audio', 'autoDetectHeadphones', e.target.checked)}
                    title="Rileva automaticamente cuffie (cablate e Bluetooth) e apre il flusso System Audio al click su Rec"
                  />
                  <p className="text-[10px] text-gray-400 leading-tight mt-1">
                    Quando cuffie rilevate, Rec avvia automaticamente con System Audio (cattura partecipanti Teams).
                  </p>
                </div>
              </div>

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

              {/* Smart Pipeline */}
              <div className="rounded-lg border border-blue-800 bg-blue-900 bg-opacity-20 p-3 space-y-2 mt-2">
                <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide">Smart Pipeline</p>
                <p className="text-[10px] text-blue-400">Choose what to run automatically when the recording stops.</p>
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2 opacity-50 cursor-not-allowed select-none">
                    <input type="checkbox" checked readOnly className="accent-blue-400 pointer-events-none" />
                    <span className="text-xs text-blue-300">Transcription</span>
                    <span className="text-[10px] text-blue-500">(always on)</span>
                  </div>
                  <Checkbox
                    label="AI Analysis (Write Minutes)"
                    id="pipelineEnableAutoAIAnalysis"
                    checked={localSettings.transcription.enableAutoAIAnalysis ?? false}
                    onChange={(e) => handleLocalGenericChange('transcription', 'enableAutoAIAnalysis', e.target.checked)}
                  />
                  <Checkbox
                    label="Download session ZIP"
                    id="pipelineEnableAutoDownload"
                    checked={localSettings.transcription.enableAutoDownload ?? false}
                    onChange={(e) => handleLocalGenericChange('transcription', 'enableAutoDownload', e.target.checked)}
                  />
                </div>
              </div>

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
