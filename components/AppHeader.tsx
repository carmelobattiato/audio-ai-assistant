
import React from 'react';
import { Button } from './common/Button';
import { 
  SettingsIcon, 
  StatsIcon, 
  DownloadIcon, 
  UploadIcon, 
  FolderIcon, 
  APP_TITLE 
} from '../constants';

interface AppHeaderProps {
  appUserMessage: string | null;
  isBusy: boolean;
  onManageSessions: () => void;
  onSaveAll: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  canSaveZip: boolean;
  statsDisabled: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  appUserMessage,
  isBusy,
  onManageSessions,
  onSaveAll,
  onOpenStats,
  onOpenSettings,
  canSaveZip,
  statsDisabled
}) => (
  <header className="w-full max-w-5xl mb-6 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
    <div>
      <h1 className="text-3xl sm:text-4xl font-bold text-sky-400 tracking-tight">{APP_TITLE}</h1>
      <p className="text-xs italic text-sky-300">Developed by Carmelo Battiato</p>
      <div className="h-6 mt-1">
        {appUserMessage && <p className="text-sm text-emerald-400" role="status">{appUserMessage}</p>}
      </div>
    </div>
    <div className="flex flex-wrap gap-2 sm:gap-3">
      <Button onClick={onManageSessions} variant="ghost" size="md" disabled={isBusy} leftIcon={<FolderIcon className="w-5 h-5"/>}>
        Sessions
      </Button>
      <Button onClick={onSaveAll} variant="ghost" size="md" disabled={isBusy || !canSaveZip} leftIcon={<DownloadIcon className="w-5 h-5"/>}>
        Save All
      </Button>
      <Button onClick={onOpenStats} variant="ghost" size="md" disabled={isBusy || statsDisabled} leftIcon={<StatsIcon className="w-5 h-5"/>}>
        Stats
      </Button>
      <Button onClick={onOpenSettings} variant="ghost" size="md" leftIcon={<SettingsIcon className="w-5 h-5"/>} disabled={isBusy}>
        Settings
      </Button>
    </div>
  </header>
);
