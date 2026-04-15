
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

const CalendarSyncIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

interface AppHeaderProps {
  appUserMessage: string | null;
  isBusy: boolean;
  onManageSessions: () => void;
  onSaveAll: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  onOpenOutlookCalendar: () => void;
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
  onOpenOutlookCalendar,
  canSaveZip,
  statsDisabled
}) => (
  <header className="w-full max-w-5xl mb-6 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
    <div>
      <h1 className="text-3xl sm:text-4xl font-bold text-sky-400 tracking-tight">{APP_TITLE}</h1>
      <p className="text-xs italic text-sky-300">Developed by Carmelo Battiato v.1.72</p>
      <div className="h-6 mt-1">
        {appUserMessage && <p className="text-sm text-emerald-400" role="status">{appUserMessage}</p>}
      </div>
    </div>
    <div className="flex flex-wrap gap-2 sm:gap-3">
      <Button onClick={onOpenOutlookCalendar} variant="ghost" size="md" disabled={isBusy} leftIcon={<CalendarSyncIcon className="w-5 h-5"/>}>
        Sync Calendar
      </Button>
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
      <a
        href="/"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '8px 16px', borderRadius: '8px', fontSize: '14px',
          fontWeight: 600, textDecoration: 'none',
          background: 'rgba(124,58,237,0.15)',
          border: '1px solid rgba(139,92,246,0.4)',
          color: '#A78BFA',
          transition: 'background 0.2s, color 0.2s',
        }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = 'rgba(124,58,237,0.4)'; el.style.color = '#fff'; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = 'rgba(124,58,237,0.15)'; el.style.color = '#A78BFA'; }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        New UI
      </a>
    </div>
  </header>
);
