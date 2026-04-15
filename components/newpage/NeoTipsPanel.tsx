import React, { useState, useEffect, useCallback } from 'react';

interface Tip {
  icon: string;
  title: string;
  body: string;
  tag?: string;
}

const TIPS: Tip[] = [
  {
    icon: '🔊',
    title: 'System Audio Capture',
    body: 'Share your screen with audio to capture Teams, Zoom or Meet calls. Click "Rec + Headphones", select "Entire Screen" and enable "Also share system audio" — the app mixes mic and system audio automatically.',
    tag: 'Pro tip',
  },
  {
    icon: '🎙️',
    title: 'Rec without headphones',
    body: 'If you use headphones but just want to record your mic quickly, click "Rec + Headphones" then hit "Rec without headphones" in the bottom-left of the dialog. Skips the screen-share step entirely.',
    tag: 'Shortcut',
  },
  {
    icon: '🗒️',
    title: 'Bubble Notes',
    body: 'Jot timestamped notes while recording with the Notes tab. Each bubble is stamped with the recording time. Great for tagging action items mid-meeting without interrupting the flow.',
    tag: 'Workflow',
  },
  {
    icon: '📅',
    title: 'Outlook Calendar — Day View',
    body: 'Click "Calendar" in the toolbar to open the Outlook day view. Meetings appear as colored blocks on a 24-hour timeline. Parallel meetings are shown side-by-side. Switch to List view for a compact overview.',
    tag: 'Windows only',
  },
  {
    icon: '✅',
    title: 'Meeting Response Status',
    body: 'The Calendar shows your acceptance status for each meeting: ✓ Accepted (green), ~ Tentative (amber), ★ Organizer (violet). Declined meetings appear grayed out.',
    tag: 'Calendar',
  },
  {
    icon: '💜',
    title: 'Open Teams Without Chrome',
    body: 'Tap "Teams + Rec" on any meeting in the Calendar to open the Teams desktop app directly via the msteams:// protocol — no browser tab opens, no context switch.',
    tag: 'Teams',
  },
  {
    icon: '💾',
    title: 'Sessions: Save & Restore',
    body: 'Up to 15 sessions are stored in your browser. Open the Sessions panel to restore a previous recording — audio, transcript, notes and AI analysis all come back exactly as you left them.',
    tag: 'Storage',
  },
  {
    icon: '📦',
    title: 'Export Your Session',
    body: 'Use "Export" to download a ZIP with audio, a styled HTML report, and CSV data. Perfect for sharing meeting minutes or archiving recordings.',
    tag: 'Export',
  },
  {
    icon: '⚡',
    title: 'Smart Pipeline',
    body: 'Enable the Smart Pipeline toggle before recording. When you stop, transcription and AI analysis run back-to-back automatically — your summary is ready by the time you grab a coffee.',
    tag: 'Automation',
  },
  {
    icon: '✨',
    title: 'Custom AI Analysis',
    body: 'In the AI Analysis tab, write your own prompt or pick a preset. Results can include action items, key decisions, sentiment, or any format you need — all saved per session.',
    tag: 'AI',
  },
  {
    icon: '📸',
    title: 'Auto Screenshot',
    body: 'Enable Auto-Shot in the Notes toolbar to capture your screen automatically at a set interval. Use the +/- arrows to adjust the countdown. Screenshots are embedded directly in the note at the exact recording timestamp.',
    tag: 'Notes',
  },
  {
    icon: '🔢',
    title: 'Chunked Recording',
    body: 'Long sessions are split into chunks (default: 15 min) and saved incrementally to IndexedDB. Even if the browser crashes mid-meeting, you lose at most one chunk — the rest is already safe.',
    tag: 'Reliability',
  },
  {
    icon: '🔇',
    title: 'Auto-Pause on Silence',
    body: 'Enable Auto-Pause in Settings to automatically suspend recording after a configurable period of silence. Keeps your transcript clean and avoids transcribing empty air.',
    tag: 'Settings',
  },
  {
    icon: '📊',
    title: 'Session Statistics',
    body: 'Click "Stats" in the topbar to see token usage, word count, estimated cost, audio duration, bitrate and a coherence score for the AI analysis. Useful for tracking long sessions.',
    tag: 'Analytics',
  },
  {
    icon: '🌐',
    title: 'Web Search in AI Analysis',
    body: 'When using Google Gemini models, enable "Web Search" in the AI Analysis tab. The model grounds its analysis with live search results and includes citations — great for fact-checking or enriching a transcript.',
    tag: 'AI',
  },
  {
    icon: '📋',
    title: 'Copy as Rich HTML',
    body: 'After an AI analysis, click the copy button to get the result as rich HTML — paste it directly into Outlook or Gmail and formatting, bullet lists and tables are preserved automatically.',
    tag: 'Export',
  },
  {
    icon: '🖊️',
    title: 'Edit Transcription Inline',
    body: 'The transcription panel is fully editable. Click any word to correct it before running AI analysis — fixes are saved to the session and included in every export.',
    tag: 'Workflow',
  },
];

const INTERVAL_MS = 6000;

export const NeoTipsPanel: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const [fading, setFading] = useState(false);

  const goTo = useCallback((next: number) => {
    setFading(true);
    setTimeout(() => {
      setCurrent(next);
      setFading(false);
    }, 220);
  }, []);

  const prev = useCallback(() => goTo((current - 1 + TIPS.length) % TIPS.length), [current, goTo]);
  const next = useCallback(() => goTo((current + 1) % TIPS.length), [current, goTo]);

  // Auto-advance
  useEffect(() => {
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setCurrent(c => (c + 1) % TIPS.length);
        setFading(false);
      }, 220);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const tip = TIPS[current];

  return (
    <div
      style={{
        background: 'var(--neo-card)',
        border: '1px solid var(--neo-border)',
        borderRadius: '14px',
        padding: '14px 16px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        userSelect: 'none',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--neo-primary-l)', opacity: 0.7 }}>
          Tips &amp; Features
        </span>
        {tip.tag && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '2px 7px',
            borderRadius: '999px',
            background: 'rgba(124,58,237,0.18)',
            border: '1px solid rgba(139,92,246,0.35)',
            color: 'var(--neo-primary-l)',
          }}>
            {tip.tag}
          </span>
        )}
      </div>

      {/* Tip content */}
      <div
        style={{
          opacity: fading ? 0 : 1,
          transition: 'opacity 0.22s ease',
          flex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: '1px' }}>{tip.icon}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--neo-text)', marginBottom: '4px', lineHeight: 1.3 }}>
              {tip.title}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--neo-muted)', lineHeight: 1.55 }}>
              {tip.body}
            </div>
          </div>
        </div>
      </div>

      {/* Footer: dots + nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          {TIPS.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              style={{
                width: i === current ? 16 : 6,
                height: 6,
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'width 0.25s ease, background 0.25s ease',
                background: i === current ? 'var(--neo-primary-l)' : 'rgba(139,92,246,0.25)',
              }}
              aria-label={`Go to tip ${i + 1}`}
            />
          ))}
        </div>

        {/* Prev / Next */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            { label: '‹', action: prev, ariaLabel: 'Previous tip' },
            { label: '›', action: next, ariaLabel: 'Next tip' },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.action}
              aria-label={btn.ariaLabel}
              style={{
                width: 22,
                height: 22,
                borderRadius: '6px',
                border: '1px solid var(--neo-border)',
                background: 'var(--neo-card)',
                color: 'var(--neo-primary-l)',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,58,237,0.25)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.6)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--neo-card)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--neo-border)';
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
