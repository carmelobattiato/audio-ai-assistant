import React, { useState, useRef, useEffect } from 'react';
import { NeoTooltip } from './NeoTooltip';
import { APP_TITLE, APP_VERSION } from '../../constants';
import appIcon from '../../img/AiRecordIco.png';

interface NeoNavButtonProps {
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
  iconPulse?: boolean;
}

const NeoNavButton: React.FC<NeoNavButtonProps> = ({ icon, label, tooltip, onClick, disabled, highlight, iconPulse }) => (
  <NeoTooltip text={tooltip}>
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
        transition-all duration-200 group
        ${disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:scale-105'
        }
      `}
      style={disabled ? { color: 'var(--neo-muted)' } : {
        background: highlight
          ? 'linear-gradient(135deg, rgba(124,58,237,0.5), rgba(192,38,211,0.3))'
          : 'var(--neo-card)',
        border: `1px solid ${highlight ? 'rgba(167,139,250,0.5)' : 'var(--neo-border)'}`,
        color: highlight ? 'white' : 'var(--neo-primary-l)',
        boxShadow: highlight ? '0 0 12px rgba(124,58,237,0.3)' : 'none',
      }}
    >
      <span
        className="flex-shrink-0"
        style={iconPulse ? { animation: 'caveman-cal-sync-pulse 1s ease-in-out infinite' } : undefined}
      >
        {icon}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  </NeoTooltip>
);

// Icons
const CalendarIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const SessionsIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);
const SaveIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);
const StatsIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
const SettingsIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

interface NeoTopbarProps {
  appUserMessage: string | null;
  isBusy: boolean;
  canSaveZip: boolean;
  statsDisabled: boolean;
  transcriptionLabel: string;
  analysisLabel: string;
  onManageSessions: () => void;
  onSaveAll: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  onOpenCalendar: () => void;
  onOpenNewCalendar: () => void;
  calendarSyncing?: boolean;
  notificationBell?: React.ReactNode;
}

const CalendarDeprecatedButton: React.FC<{
  onOpenCalendar: () => void;
  onOpenNewCalendar: () => void;
  disabled?: boolean;
  calendarSyncing?: boolean;
}> = ({ onOpenCalendar, onOpenNewCalendar, disabled, calendarSyncing }) => {
  const [showPopup, setShowPopup] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPopup) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowPopup(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopup]);

  return (
    <div ref={ref} className="relative">
      <NeoTooltip text="Outlook calendar (in dismissione)">
        <button
          onClick={() => !disabled && setShowPopup(p => !p)}
          disabled={disabled}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
          style={disabled ? { color: 'var(--neo-muted)', opacity: 0.4, cursor: 'not-allowed' } : {
            background: 'rgba(55,65,81,0.4)',
            border: '1px solid var(--neo-border)',
            color: 'var(--neo-muted)',
          }}
        >
          <CalendarIcon />
          <span style={calendarSyncing ? { animation: 'caveman-cal-sync-pulse 1.5s ease-in-out infinite' } : undefined}>
            Calendar
          </span>
        </button>
      </NeoTooltip>

      {showPopup && (
        <div
          className="absolute top-full mt-2 left-0 rounded-xl p-4 shadow-2xl z-50"
          style={{
            width: 280,
            background: '#1F2937',
            border: '1px solid rgba(245,158,11,0.4)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-start gap-2 mb-3">
            <span className="text-amber-400 text-base flex-shrink-0">⚠️</span>
            <div>
              <p className="text-xs font-semibold text-amber-300 mb-1">Funzione in dismissione</p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Questo calendario sarà rimosso nelle prossime versioni. Ti consigliamo di usare <strong className="text-purple-300">NewCalendar</strong>, la nuova versione integrata con le sessioni.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowPopup(false); onOpenNewCalendar(); }}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#C026D3)', color: 'white' }}
            >
              Apri NewCalendar
            </button>
            <button
              onClick={() => { setShowPopup(false); onOpenCalendar(); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-gray-700"
              style={{ color: '#9CA3AF', border: '1px solid #374151' }}
            >
              Usa il vecchio
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const NeoTopbar: React.FC<NeoTopbarProps> = ({
  appUserMessage, isBusy, canSaveZip, statsDisabled,
  transcriptionLabel, analysisLabel,
  onManageSessions, onSaveAll, onOpenStats, onOpenSettings,
  onOpenCalendar, onOpenNewCalendar, calendarSyncing, notificationBell,
}) => (
  <header
    className="sticky top-0 z-40 flex items-center justify-between px-5 py-3 neo-topbar-border"
    style={{
      background: 'var(--neo-overlay-bg)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--neo-border)',
      position: 'relative',
    }}
  >
    {/* Logo — left */}
    <div className="flex items-center gap-3 flex-shrink-0" style={{ minWidth: 0, flex: '1 1 0' }}>
      <img
        src={appIcon}
        alt="Audio AI Assistant"
        className="w-12 h-12 flex-shrink-0"
        style={{ borderRadius: '8px', objectFit: 'contain' }}
      />
      <div className="min-w-0">
        <h1
          className="text-base font-bold leading-none"
          style={{ background: 'linear-gradient(90deg, #A78BFA, #E879F9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          {APP_TITLE}
        </h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--neo-muted)' }}>Developed by Carmelo Battiato · v{APP_VERSION}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--neo-muted)', opacity: 0.75 }}>
          {transcriptionLabel === analysisLabel
            ? <>Transcription &amp; Analysis: <span style={{ color: 'var(--neo-primary-l)' }}>{analysisLabel}</span></>
            : <>Transcription: <span style={{ color: 'var(--neo-primary-l)' }}>{transcriptionLabel}</span>{' · '}Analysis: <span style={{ color: 'var(--neo-primary-l)' }}>{analysisLabel}</span></>
          }
        </p>
      </div>
    </div>

    {/* Nav buttons — center */}
    <nav className="flex items-center gap-1.5 flex-shrink-0">
      <NeoNavButton
        icon={<CalendarIcon />} label="NewCalendar" tooltip="NewCalendar — calendario con sessioni integrate"
        onClick={onOpenNewCalendar} disabled={isBusy} highlight
      />
      <CalendarDeprecatedButton
        onOpenCalendar={onOpenCalendar}
        onOpenNewCalendar={onOpenNewCalendar}
        disabled={isBusy}
        calendarSyncing={calendarSyncing}
      />
      <style>{`@keyframes caveman-cal-sync-pulse { 0%,100% { color: #ffffff; } 50% { color: #fb923c; } }`}</style>
      <NeoNavButton
        icon={<SessionsIcon />} label="Sessions" tooltip="Browse, restore or export your saved recording sessions"
        onClick={onManageSessions} disabled={isBusy} highlight
      />
      <NeoNavButton
        icon={<SaveIcon />} label="Export" tooltip="Export the current session as JSON (audio + transcript + notes + AI results)"
        onClick={onSaveAll} disabled={isBusy || !canSaveZip} highlight
      />
      <NeoNavButton
        icon={<StatsIcon />} label="Stats" tooltip="View word count, duration, token usage and coherence score"
        onClick={onOpenStats} disabled={isBusy || statsDisabled} highlight
      />
      <NeoNavButton
        icon={<SettingsIcon />} label="Settings" tooltip="Configure audio quality, AI model, transcription language and more"
        onClick={onOpenSettings} disabled={isBusy} highlight
      />

    </nav>

    {/* Status message — right */}
    <div className="flex justify-end items-center min-w-0 gap-2 px-2" style={{ flex: '1 1 0' }}>
      {notificationBell}
      {appUserMessage && (
        <p
          className="text-xs px-3 py-1 rounded-full truncate max-w-xs"
          style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#6EE7B7' }}
        >
          {appUserMessage}
        </p>
      )}
    </div>
  </header>
);
