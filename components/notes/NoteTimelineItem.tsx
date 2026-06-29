import React, { useState, useMemo } from 'react';
import { Camera, FileText, FileImage, File, Film, Mic, CheckCircle, Trash2, ExternalLink, Check } from 'lucide-react';
import { BubbleNote } from '@/types';

interface NoteTimelineItemProps {
  note: BubbleNote;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  elapsedLabel: string;
  popupLeft: boolean;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
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
}) => {
  const [hovered, setHovered] = useState(false);

  const isScreenshot = note.type === 'screenshot' || note.type === 'auto-screenshot';
  const isVideo = note.type === 'video';
  const isAudio = note.type === 'audio';
  const thumbnailSrc = useMemo(() => extractFirstImageSrc(note.contentHtml), [note.contentHtml]);
  const textContent = useMemo(() => stripHtml(note.contentHtml), [note.contentHtml]);
  const videoFilename = useMemo(() => extractVideoFilename(note.contentHtml), [note.contentHtml]);
  const audioFilename = useMemo(() => extractAudioFilename(note.contentHtml), [note.contentHtml]);
  const audioTranscribed = useMemo(() => isAudioTranscribed(note.contentHtml), [note.contentHtml]);
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
            audioTranscribed
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
              {audioFilename.replace(/^.*_segment_/, 'seg_') || textContent.slice(0, 30)}
            </p>
            <span className="text-[7px] font-mono text-white/40 leading-none">
              {audioTranscribed ? '✓ ok' : '⏳'}
            </span>
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
