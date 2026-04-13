
import React, { useState, useEffect } from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { Select } from './common/Select';
import { Input } from './common/Input'; 
import { Checkbox } from './common/Checkbox'; 
import { AppSettings, TranscriptionQuality, SupportedLanguage, TranscriptionOutputFormat, ModelInfo, Theme } from '../types';
import { DEFAULT_SETTINGS, LLM_PROVIDERS } from '../constants';

import { LogsTab } from './settings/LogsTab';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (newSettings: AppSettings) => void;
}

const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'llm', label: 'LLM Configuration' },
  { id: 'audio', label: 'Audio Recording' },
  { id: 'transcription', label: 'Transcription & Notes' },
  { id: 'logs', label: 'Logs & Monitoring' },
];

const ModelSelectionTable: React.FC<{
  models: ModelInfo[];
  selectedModel: string;
  onSelectModel: (modelName: string) => void;
}> = ({ models, selectedModel, onSelectModel }) => {
  if (models.length === 0) {
    return <p className="text-gray-400 text-sm">No models available for this provider.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-left text-gray-300">
        <thead className="bg-gray-700 text-xs text-gray-400 uppercase">
          <tr>
            <th scope="col" className="px-4 py-2">Model Name</th>
            <th scope="col" className="px-4 py-2">Specialization</th>
            <th scope="col" className="px-4 py-2">Cost (USD/1k tokens)</th>
            <th scope="col" className="px-4 py-2">Release Date</th>
            <th scope="col" className="px-4 py-2 text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.name} className={`border-b border-gray-700 ${model.name === selectedModel ? 'bg-emerald-900 bg-opacity-50' : 'hover:bg-gray-700'}`}>
              <td className="px-4 py-2 font-medium">{model.name}</td>
              <td className="px-4 py-2">{model.specialization}</td>
              <td className="px-4 py-2">{model.cost}</td>
              <td className="px-4 py-2">{model.releaseDate}</td>
              <td className="px-4 py-2 text-center">
                <Button
                  size="sm"
                  variant={model.name === selectedModel ? 'secondary' : 'primary'}
                  onClick={() => onSelectModel(model.name)}
                  disabled={model.name === selectedModel}
                >
                  {model.name === selectedModel ? 'Selected' : 'Select'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};


export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, settings, onSettingsChange }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(JSON.parse(JSON.stringify(settings)));
    }
  }, [isOpen, settings]);

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
  
  const handleModelSelect = (modelName: string) => {
    setLocalSettings(prev => ({
        ...prev,
        llm: {
            ...prev.llm,
            model: modelName
        }
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

  const transcriptionQualityOptions = Object.values(TranscriptionQuality).map(q => ({ value: q, label: q }));
  const languageOptions = (["Italian", "English"] as SupportedLanguage[]).map(l => ({ value: l, label: l }));
  const outputFormatOptions = Object.values(TranscriptionOutputFormat).map(f => ({ value: f, label: f.toUpperCase() }));

  const providerOptions = Object.keys(LLM_PROVIDERS).map(p => ({ value: p, label: p }));
  const currentProviderInfo = LLM_PROVIDERS[localSettings.llm.provider];
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Application Settings">
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
          <section>
            <div className="space-y-4 p-3 bg-gray-700 rounded-md">
            <Select
                label="Color Theme:"
                id="appearanceTheme"
                options={themeOptions}
                value={localSettings.appearance?.theme || Theme.DARK}
                onChange={(e) => handleLocalGenericChange('appearance', 'theme', e.target.value as Theme)}
            />
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
                  <label className="block text-sm font-medium text-gray-300 mb-1">Select Model:</label>
                  <ModelSelectionTable
                    models={currentProviderInfo?.models || []}
                    selectedModel={localSettings.llm.model}
                    onSelectModel={handleModelSelect}
                  />
                  <div className="text-xs text-sky-300 p-1.5 bg-sky-900 bg-opacity-30 rounded-md">
                      The API Key is configured by the system and does not need to be set here.
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
            </div>
          </section>
        )}

        {activeTab === 'transcription' && (
          <section>
            <div className="space-y-4 p-3 bg-gray-700 rounded-md">
              <Checkbox
                label="Enable Real-time Transcription (Live)"
                id="transcriptionEnableRealtime"
                checked={localSettings.transcription.enableRealtimeTranscription ?? false}
                onChange={(e) => handleLocalGenericChange('transcription', 'enableRealtimeTranscription', e.target.checked)}
              />
              <Select
                label="Language:"
                id="transcriptionLanguage"
                options={languageOptions}
                value={localSettings.transcription.language}
                onChange={(e) => handleLocalGenericChange('transcription', 'language', e.target.value as SupportedLanguage)}
              />
              <Select
                label="Quality Level (Google Only):"
                id="transcriptionQuality"
                options={transcriptionQualityOptions}
                value={localSettings.transcription.quality}
                onChange={(e) => handleLocalGenericChange('transcription', 'quality', e.target.value as TranscriptionQuality)}
                disabled={localSettings.llm.provider !== 'Google'}
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
