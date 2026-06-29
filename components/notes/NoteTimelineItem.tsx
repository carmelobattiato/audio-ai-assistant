import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Camera, FileText, Trash2, ExternalLink } from 'lucide-react';
import { BubbleNote } from '@/types';

interface NoteTimelineItemProps {
  note: BubbleNote;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  elapsedLabel: string;
  popupSide: 'left' | 'right';
}

function extractFirstImageSrc(html: string): string | null {
  const match = html.match(/<img[^>]+src="([^"]+)"/i);
  return match ? match[1] ?? null : null;
}

function stripHtmlAndTruncate(html: string, maxLen = 80): string {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

export const NoteTimelineItem: React.FC<NoteTimelineItemProps> = ({
  note,
  onOpen,
  onDelete,
  elapsedLabel,
  popupSide,
}) => {
  const [hovered, setHovered] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const isScreenshot = note.type === 'screenshot' || note.type === 'auto-screenshot';
  const thumbnailSrc = useMemo(() => extractFirstImageSrc(note.contentHtml), [note.contentHtml]);
  const textPreview = useMemo(
    () =>
      isScreenshot
        ? note.type === 'auto-screenshot' ? 'Auto screenshot' : 'Screenshot'
        : stripHtmlAndTruncate(note.contentHtml),
    [note.contentHtml, note.type, isScreenshot]
  );

  // Close popup on outside click
  useEffect(() => {
    if (!hovered) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setHovered(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [hovered]);

  return (
    <div
      className="relative note-timeline-item"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Circle node */}
      <button
        className="w-14 h-14 rounded-full flex flex-col items-center justify-center gap-0.5
                   bg-gradient-to-br from-violet-600 to-indigo-700
                   ring-2 ring-violet-500/30 hover:ring-violet-400/60
                   shadow-[0_0_14px_rgba(124,58,237,0.45)]
                   transition-all duration-150 hover:scale-110 focus:outline-none cursor-pointer select-none"
        onClick={() => onOpen(note.id)}
        aria-label={`Open note at ${elapsedLabel}`}
      >
        <span className="text-white/90">
          {isScreenshot ? <Camera size={18} /> : <FileText size={18} />}
        </span>
        <span className="text-[9px] font-mono text-white/60 leading-none">
          {elapsedLabel}
        </span>
      </button>

      {/* Hover popup */}
      {hovered && (
        <div
          ref={popupRef}
          className={[
            'absolute top-1/2 -translate-y-1/2 z-20',
            popupSide === 'right' ? 'left-[60px]' : 'right-[60px]',
            'w-48 rounded-xl px-3 py-2',
            'bg-gray-900/95 border border-white/10 shadow-xl backdrop-blur-sm',
          ].join(' ')}
        >
          <p className="text-xs text-gray-300 leading-snug mb-2 line-clamp-3">
            {textPreview}
          </p>
          {thumbnailSrc && (
            <img
              src={thumbnailSrc}
              alt=""
              loading="lazy"
              className="w-full rounded object-cover max-h-20 mb-2"
            />
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
