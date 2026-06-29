import React, { useState, useMemo } from 'react';
import { Camera, FileText, Trash2, ExternalLink } from 'lucide-react';
import { BubbleNote } from '@/types';

interface NoteTimelineItemProps {
  note: BubbleNote;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  elapsedLabel: string;
  popupLeft: boolean;
}

function extractFirstImageSrc(html: string): string | null {
  const match = html.match(/<img[^>]+src="([^"]+)"/i);
  return match ? match[1] ?? null : null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export const NoteTimelineItem: React.FC<NoteTimelineItemProps> = ({
  note,
  onOpen,
  onDelete,
  elapsedLabel,
  popupLeft,
}) => {
  const [hovered, setHovered] = useState(false);

  const isScreenshot = note.type === 'screenshot' || note.type === 'auto-screenshot';
  const thumbnailSrc = useMemo(() => extractFirstImageSrc(note.contentHtml), [note.contentHtml]);
  const textContent = useMemo(() => stripHtml(note.contentHtml), [note.contentHtml]);

  return (
    <div
      className="relative note-timeline-item"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Sphere — 80×80 circle with content inside */}
      <button
        className="w-20 h-20 rounded-full flex flex-col items-center justify-center overflow-hidden relative
                   ring-2 ring-violet-500/30 hover:ring-violet-400/70
                   shadow-[0_0_14px_rgba(124,58,237,0.4)]
                   transition-all duration-150 hover:scale-110 focus:outline-none cursor-pointer"
        onClick={() => onOpen(note.id)}
        aria-label={`Open note at ${elapsedLabel}`}
        style={{ padding: 0 }}
      >
        {isScreenshot && thumbnailSrc ? (
          /* Screenshot: fill circle with thumbnail */
          <>
            <img
              src={thumbnailSrc}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover rounded-full"
            />
            {/* Dark overlay for readability */}
            <div className="absolute inset-0 rounded-full bg-black/30" />
            <div className="relative z-10 flex flex-col items-center gap-0.5 px-1">
              <Camera size={13} className="text-white/90 shrink-0" />
              <span className="text-[7px] font-mono text-white/80 leading-none">{elapsedLabel}</span>
            </div>
          </>
        ) : (
          /* Text note: gradient bg + text preview */
          <div className="w-full h-full rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex flex-col items-center justify-center px-2 py-2 gap-0.5">
            <FileText size={12} className="text-white/80 shrink-0" />
            <p className="text-[7.5px] text-white/80 text-center leading-tight line-clamp-2 break-words w-full">
              {textContent.slice(0, 40)}
            </p>
            <span className="text-[6.5px] font-mono text-white/50 leading-none">{elapsedLabel}</span>
          </div>
        )}
      </button>

      {/* Hover popup */}
      {hovered && (
        <div
          className={[
            'absolute top-1/2 -translate-y-1/2 z-20',
            popupLeft ? 'right-[88px]' : 'left-[88px]',
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
