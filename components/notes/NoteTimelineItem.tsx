import React, { useState, useMemo } from 'react';
import { Camera, FileText, MoreHorizontal, Trash2, ExternalLink } from 'lucide-react';
import { BubbleNote } from '@/types';

interface NoteTimelineItemProps {
  note: BubbleNote;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  elapsedTimeLabel: string;
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
  elapsedTimeLabel,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const isScreenshot = note.type === 'screenshot' || note.type === 'auto-screenshot';
  const thumbnailSrc = useMemo(() => extractFirstImageSrc(note.contentHtml), [note.contentHtml]);
  const textPreview = useMemo(
    () => isScreenshot ? (note.type === 'auto-screenshot' ? 'Auto screenshot' : 'Screenshot') : stripHtmlAndTruncate(note.contentHtml),
    [note.contentHtml, note.type, isScreenshot]
  );

  return (
    <div
      className="note-timeline-item group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
      onClick={() => onOpen(note.id)}
    >
      {/* Timestamp */}
      <span className="text-xs font-mono text-gray-500 w-12 shrink-0 select-none">
        {elapsedTimeLabel}
      </span>

      {/* Type icon */}
      <span className="shrink-0 text-gray-400">
        {isScreenshot
          ? <Camera size={14} />
          : <FileText size={14} />
        }
      </span>

      {/* Thumbnail (screenshots only) */}
      {thumbnailSrc && (
        <img
          src={thumbnailSrc}
          alt=""
          loading="lazy"
          className="shrink-0 w-12 h-9 object-cover rounded border border-white/10"
        />
      )}

      {/* Text preview */}
      <span className="flex-1 text-sm text-gray-300 truncate select-none">
        {textPreview}
      </span>

      {/* Context menu */}
      <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white hover:bg-white/10"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Note options"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-6 z-10 bg-gray-800 border border-white/10 rounded-lg shadow-lg py-1 min-w-[120px]"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-200 hover:bg-white/10"
              onClick={() => { onOpen(note.id); setMenuOpen(false); }}
            >
              <ExternalLink size={12} /> Open
            </button>
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-400 hover:bg-white/10"
              onClick={() => { onDelete(note.id); setMenuOpen(false); }}
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
