
import React from 'react';
import { TranscriptionSettings, TranscriptionOutputFormat } from '../../types';
import { Select } from '../common/Select';
import { Checkbox } from '../common/Checkbox';

interface TranscriptionTabProps {
  settings: TranscriptionSettings;
  llmProvider: string;
  onChange: (key: keyof TranscriptionSettings, value: any) => void;
}

export const TranscriptionTab: React.FC<TranscriptionTabProps> = ({ settings, onChange }) => (
  <div className="space-y-4">
    <div className="p-3 bg-blue-900 bg-opacity-20 rounded-lg border border-blue-800 space-y-3">
      <Checkbox
        label="Enable One-Click Auto Pipeline"
        checked={settings.enableAutoPipeline ?? true}
        onChange={(e) => onChange('enableAutoPipeline', e.target.checked)}
      />
      <p className="text-[10px] text-blue-300 pl-6">When enabled, stopping a recording automatically triggers the steps selected below.</p>

      {(settings.enableAutoPipeline ?? true) && (
        <div className="ml-6 mt-1 space-y-2 border-l border-blue-700 pl-3">
          <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wide">Smart Pipeline Steps</p>
          <div className="flex items-center gap-2 opacity-50 cursor-not-allowed">
            <input type="checkbox" checked readOnly className="accent-blue-400" />
            <span className="text-xs text-blue-300">Transcription</span>
            <span className="text-[10px] text-blue-500">(sempre attiva)</span>
          </div>
          <Checkbox
            label="AI Analysis (Write Minutes)"
            checked={settings.enableAutoAIAnalysis ?? false}
            onChange={(e) => onChange('enableAutoAIAnalysis', e.target.checked)}
          />
        </div>
      )}
    </div>

    <div className="grid grid-cols-2 gap-4">
      <Select
        label="Primary Language"
        options={[
          { value: 'Italian', label: 'Italian' },
          { value: 'English', label: 'English' },
        ]}
        value={settings.language}
        onChange={(e) => onChange('language', e.target.value)}
      />
      <Select
        label="Export Format"
        options={[
          { value: TranscriptionOutputFormat.TXT, label: 'Plain Text (.txt)' },
          { value: TranscriptionOutputFormat.SRT, label: 'Subtitles (.srt)' },
          { value: TranscriptionOutputFormat.CSV, label: 'Table (.csv)' },
        ]}
        value={settings.outputFormat}
        onChange={(e) => onChange('outputFormat', e.target.value)}
      />
    </div>

    <Checkbox
      label="Auto-Screenshot during screen sharing" 
      checked={settings.autoScreenshotIntervalSeconds !== 0} 
      onChange={(e) => onChange('autoScreenshotIntervalSeconds', e.target.checked ? 60 : 0)} 
    />
  </div>
);
