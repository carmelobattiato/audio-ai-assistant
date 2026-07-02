import React, { useState, useMemo } from 'react';
import { Camera, FileText, FileImage, File, Film, Mic, CheckCircle, Trash2, ExternalLink, Check, Play, Square } from 'lucide-react';
import { BubbleNote } from '@/types';
import { HistoricalEventIcon } from '@/components/HistoricalEventIcon';

interface NoteTimelineItemProps {
  note: BubbleNote;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  elapsedLabel: string;
  popupLeft: boolean;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onPlayAudio?: (filename: string) => void;
  currentlyPlayingAudioFilename?: string | null;
  onRemoveHistoricalSession?: (sessionId: string) => void;
}

function extractFirstImageSrc(html: string): string | null {
  const match = html.match(/<img[^>]+src="([^"]+)"/i);
  return match ? match[1] ?? null : null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractAudioFilename(html: string): string {
  const match = html.match(/data-audio-filename="([^"]+)"/);
  return match ? (match[1] ?? '') : '';
}

function isAudioTranscribed(html: string): boolean {
  return /data-transcribed="true"/.test(html);
}

function isAudioLiveRecording(html: string): boolean {
  return /data-audio-status="recording"/.test(html);
}

function detectNoteIcon(note: BubbleNote) {
  if (note.type === 'audio') return Mic;
  if (note.type === 'video') return Film;
  if (note.type === 'screenshot' || note.type === 'auto-screenshot') return Camera;
  const html = note.contentHtml;
  if (/\.pdf\s*---/i.test(html)) return FileText;
  if (/\.docx\s*---/i.test(html) || /\.html\s*---/i.test(html)) return FileText;
  if (/\.pptx\s*---/i.test(html)) return File;
  if (/<img /i.test(html)) return FileImage;
  return FileText;
}

function extractVideoFilename(html: string): string {
  const match = html.match(/data-video-filename="([^"]+)"/);
  return match ? (match[1] ?? '') : '';
}

export const NoteTimelineItem: React.FC<NoteTimelineItemProps> = ({
  note,
  onOpen,
  onDelete,
  elapsedLabel,
  popupLeft,
  isSelectMode = false,
  isSelected = false,
  onToggleSelect,
  onPlayAudio,
  currentlyPlayingAudioFilename,
  onRemoveHistoricalSession,
}) => {
  const [hovered, setHovered] = useState(false);

  // Early return for historical-event notes
  if (note.type === 'historical-event') {
    const sessionId = note.historicalSessionId ?? note.id.replace(/^hist_/, '');
    const textPreview = stripHtml(note.contentHtml).slice(0, 100);
    return (
      <div
        className="relative note-timeline-item"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Amber node dot */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'rgba(245,158,11,0.15)',
            border: '2px solid rgba(245,158,11,0.35)',
            color: '#FCD34D',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            cursor: 'default',
          }}
        >
          <HistoricalEventIcon className="w-7 h-7" />
          <span style={{ fontSize: 9, fontFamily: 'monospace', opacity: 0.8 }}>{elapsedLabel}</span>
        </div>

        {/* Hover popup */}
        {hovered && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 50,
              ...(popupLeft ? { right: 132 } : { left: 132 }),
              width: 220,
              borderRadius: 12,
              padding: '10px 12px',
              background: 'rgba(120,53,15,0.25)',
              border: '1px solid rgba(245,158,11,0.3)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            {/* Chip */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 600,
                background: 'rgba(245,158,11,0.2)',
                color: '#FCD34D',
                marginBottom: 6,
              }}
            >
              📅 Historical Event
            </span>

            {/* Title */}
            <p style={{ fontSize: 12, fontWeight: 600, color: '#FDE68A', marginBottom: 4, lineHeight: 1.3 }}>
              {note.historicalSessionId ?? 'Historical Session'}
            </p>

            {/* Date */}
            {note.timestamp > 0 && (
              <p style={{ fontSize: 10, color: '#FCD34D', opacity: 0.7, marginBottom: 4, fontFamily: 'monospace' }}>
                {new Date(note.timestamp).toLocaleString()}
              </p>
            )}

            {/* Preview text */}
            {textPreview && (
              <p style={{ fontSize: 11, color: '#FDE68A', opacity: 0.8, lineHeight: 1.4, marginBottom: 8 }}>
                {textPreview}{textPreview.length >= 100 ? '…' : ''}
              </p>
            )}

            {/* X button */}
            {onRemoveHistoricalSession && (
              <button
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#FCD34D',
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.25)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.1)')}
                onClick={(e) => { e.stopPropagation(); onRemoveHistoricalSession(sessionId); }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const isScreenshot = note.type === 'screenshot' || note.type === 'auto-screenshot';
  const isVideo = note.type === 'video';
  const isAudio = note.type === 'audio';
  const thumbnailSrc = useMemo(() => extractFirstImageSrc(note.contentHtml), [note.contentHtml]);
  const textContent = useMemo(() => stripHtml(note.contentHtml), [note.contentHtml]);
  const videoFilename = useMemo(() => extractVideoFilename(note.contentHtml), [note.contentHtml]);
  const audioFilename = useMemo(() => extractAudioFilename(note.contentHtml), [note.contentHtml]);
  const audioTranscribed = useMemo(() => isAudioTranscribed(note.contentHtml), [note.contentHtml]);
  const audioLive = useMemo(() => isAudioLiveRecording(note.contentHtml), [note.contentHtml]);
  const IconComponent = useMemo(() => detectNoteIcon(note), [note]);

  const handleClick = () => {
    if (isSelectMode) {
      onToggleSelect?.(note.id);
    } else {
      onOpen(note.id);
    }
  };

  return (
    <div
      className="relative note-timeline-item"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Sphere — 120×120 circle with content inside */}
      <button
        className={[
          'w-[120px] h-[120px] rounded-full flex flex-col items-center justify-center overflow-hidden relative',
          'transition-all duration-150 hover:scale-110 focus:outline-none cursor-pointer',
          isSelected
            ? 'ring-4 ring-violet-400 shadow-[0_0_22px_rgba(124,58,237,0.7)]'
            : 'ring-2 ring-violet-500/30 hover:ring-violet-400/70 shadow-[0_0_18px_rgba(124,58,237,0.4)]',
        ].join(' ')}
        onClick={handleClick}
        aria-label={isSelectMode ? `Select note at ${elapsedLabel}` : `Open note at ${elapsedLabel}`}
        style={{ padding: 0 }}
      >
        {isAudio ? (
          <div className={[
            'w-full h-full rounded-full flex flex-col items-center justify-center px-3 py-3 gap-1',
            audioLive
              ? 'bg-gradient-to-br from-red-600 to-rose-700 animate-pulse'
              : audioTranscribed
                ? 'bg-gradient-to-br from-teal-600 to-cyan-700'
                : 'bg-gradient-to-br from-blue-700 to-indigo-800',
          ].join(' ')}>
            <div className="relative">
              <Mic size={20} className="text-white/90 shrink-0" />
              {audioTranscribed && (
                <CheckCircle size={10} className="text-teal-300 absolute -top-1 -right-1" />
              )}
            </div>
            <p className="text-[7.5px] text-white/75 text-center leading-tight line-clamp-2 break-all w-full">
              {audioLive ? '⏺ REC' : (audioFilename.replace(/^.*_segment_/, 'seg_') || textContent.slice(0, 30))}
            </p>
            {!audioLive && audioFilename && onPlayAudio ? (
              <button
                className={[
                  'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[7px] font-semibold transition-colors',
                  currentlyPlayingAudioFilename === audioFilename
                    ? 'bg-white/30 text-white'
                    : 'bg-white/10 hover:bg-white/25 text-white/70 hover:text-white',
                ].join(' ')}
                onClick={(e) => { e.stopPropagation(); onPlayAudio(audioFilename); }}
                title={currentlyPlayingAudioFilename === audioFilename ? 'Stop' : 'Play'}
              >
                {currentlyPlayingAudioFilename === audioFilename
                  ? <><Square size={7} fill="currentColor" /> stop</>
                  : <><Play size={7} fill="currentColor" /> play</>
                }
              </button>
            ) : (
              <span className="text-[7px] font-mono text-white/40 leading-none">
                {audioLive ? 'live' : audioTranscribed ? '✓ ok' : '⏳'}
              </span>
            )}
          </div>
        ) : isVideo ? (
          <div className="w-full h-full rounded-full bg-gradient-to-br from-red-600/80 to-violet-700 flex flex-col items-center justify-center px-3 py-3 gap-1">
            <Film size={20} className="text-white/90 shrink-0" />
            <p className="text-[8px] text-white/75 text-center leading-tight line-clamp-2 break-all w-full">
              {videoFilename || textContent.slice(0, 40)}
            </p>
            <span className="text-[8px] font-mono text-white/50 leading-none">{elapsedLabel}</span>
          </div>
        ) : isScreenshot && thumbnailSrc ? (
          <>
            <img
              src={thumbnailSrc}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover rounded-full"
            />
            <div className="absolute inset-0 rounded-full bg-black/30" />
            <div className="relative z-10 flex flex-col items-center gap-1 px-1">
              <IconComponent size={18} className="text-white/90 shrink-0" />
              <span className="text-[9px] font-mono text-white/80 leading-none">{elapsedLabel}</span>
            </div>
          </>
        ) : (
          <div className="w-full h-full rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex flex-col items-center justify-center px-3 py-3 gap-1">
            <IconComponent size={16} className="text-white/80 shrink-0" />
            <p className="text-[9px] text-white/80 text-center leading-tight line-clamp-3 break-words w-full">
              {textContent.slice(0, 55)}
            </p>
            <span className="text-[8px] font-mono text-white/50 leading-none">{elapsedLabel}</span>
          </div>
        )}

        {/* Selection checkmark overlay */}
        {isSelectMode && (
          <div className={[
            'absolute inset-0 rounded-full flex items-center justify-center transition-colors',
            isSelected ? 'bg-violet-500/40' : 'bg-black/0 hover:bg-black/20',
          ].join(' ')}>
            {isSelected && (
              <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center shadow-lg">
                <Check size={18} className="text-white" strokeWidth={3} />
              </div>
            )}
          </div>
        )}
      </button>

      {/* Hover popup — only outside select mode */}
      {hovered && !isSelectMode && (
        <div
          className={[
            'absolute top-1/2 -translate-y-1/2 z-50',
            popupLeft ? 'right-[132px]' : 'left-[132px]',
            'w-52 rounded-xl px-3 py-2',
            'bg-gray-900/95 border border-white/10 shadow-xl backdrop-blur-sm',
          ].join(' ')}
        >
          {thumbnailSrc && (
            <img
              src={thumbnailSrc}
              alt=""
              loading="lazy"
              className="w-full rounded-lg object-cover max-h-24 mb-2"
            />
          )}
          {textContent && (
            <p className="text-xs text-gray-300 leading-snug mb-2 line-clamp-4">
              {textContent.slice(0, 120)}{textContent.length > 120 ? '…' : ''}
            </p>
          )}
          <div className="flex gap-1.5 pt-1 border-t border-white/10">
            <button
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs text-gray-200 bg-white/5 hover:bg-white/15 transition-colors"
              onClick={(e) => { e.stopPropagation(); onOpen(note.id); }}
            >
              <ExternalLink size={11} /> Open
            </button>
            <button
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs text-red-400 bg-white/5 hover:bg-red-500/20 transition-colors"
              onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
            >
              <Trash2 size={11} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
