
import React from 'react';
import { TranscriptionSettings, SupportedLanguage, TranscriptionOutputFormat } from '../../types';
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
      <p className="text-[10px] text-blue-300 pl-6">When enabled, stopping a recording automatically triggers Transcription followed by AI Analysis (Write Minutes).</p>
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


<div className="p-3 bg-gray-700 rounded-lg space-y-3 border border-gray-600">
      <Checkbox 
        label="Real-time Live Transcript (Google Only)" 
        checked={settings.enableRealtimeTranscription ?? false}
        onChange={(e) => onChange('enableRealtimeTranscription', e.target.checked)}
      />
      <p className="text-[10px] text-gray-400 pl-6">Uses high-speed streaming for instant feedback during recording.</p>
    </div>

    <Checkbox 
      label="Auto-Screenshot during screen sharing" 
      checked={settings.autoScreenshotIntervalSeconds !== 0} 
      onChange={(e) => onChange('autoScreenshotIntervalSeconds', e.target.checked ? 60 : 0)} 
    />
  </div>
);
