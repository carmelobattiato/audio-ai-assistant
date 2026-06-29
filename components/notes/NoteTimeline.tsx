import React, { useEffect, useRef, useState } from 'react';
import { BubbleNote } from '@/types';
import { NoteTimelineItem } from './NoteTimelineItem';

interface NoteTimelineProps {
  notes: BubbleNote[];
  onOpenNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  isSelectMode?: boolean;
  selectedNoteIds?: Set<string>;
  onToggleSelectNote?: (id: string) => void;
}

const NODES_PER_ROW = 4;
const ROW_H = 160;   // px per row
const NODE_D = 120;  // node diameter (50% bigger than 80)
const NODE_R = NODE_D / 2;
const PAD_TOP = 20;
const PAD_BOTTOM = 20;

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Returns x in 0-100 viewBox units
function nodeX(i: number): number {
  const row = Math.floor(i / NODES_PER_ROW);
  const col = i % NODES_PER_ROW;
  const colPos = row % 2 === 0 ? col : (NODES_PER_ROW - 1 - col);
  return (colPos + 0.5) / NODES_PER_ROW * 100;
}

// Returns y in absolute px
function nodeY(i: number): number {
  const row = Math.floor(i / NODES_PER_ROW);
  return PAD_TOP + row * ROW_H + NODE_R;
}

function buildPath(i: number): string {
  const x1 = nodeX(i);     const y1 = nodeY(i);
  const x2 = nodeX(i + 1); const y2 = nodeY(i + 1);
  const sameRow = Math.floor(i / NODES_PER_ROW) === Math.floor((i + 1) / NODES_PER_ROW);
  if (sameRow) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

export const NoteTimeline: React.FC<NoteTimelineProps> = ({ notes, onOpenNote, onDeleteNote, isSelectMode, selectedNoteIds, onToggleSelectNote }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(notes.length);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    if (notes.length > prevLengthRef.current) {
      containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
    }
    prevLengthRef.current = notes.length;
  }, [notes.length]);

  if (notes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500 select-none py-8">
        No notes yet. Press Enter or take a screenshot.
      </div>
    );
  }

  const numRows = Math.ceil(notes.length / NODES_PER_ROW);
  const totalH = PAD_TOP + numRows * ROW_H + PAD_BOTTOM;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto min-h-0">
      <div className="relative w-full" style={{ height: totalH }}>

        {/* SVG connectors */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height={totalH}
          viewBox={`0 0 100 ${totalH}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {notes.slice(0, -1).map((_, i) => (
            <path
              key={i}
              d={buildPath(i)}
              fill="none"
              stroke="#7c3aed"
              strokeOpacity="0.55"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Nodes — wrapper carries z-index so popup beats siblings */}
        {notes.map((note, i) => {
          const xPct = nodeX(i);
          const cy = nodeY(i);
          const popupLeft = xPct > 50;
          return (
            <div
              key={note.id}
              className="absolute"
              style={{
                left: `${xPct}%`,
                top: cy,
                transform: 'translate(-50%, -50%)',
                zIndex: hoveredIdx === i ? 50 : 1,
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <NoteTimelineItem
                note={note}
                onOpen={onOpenNote}
                onDelete={onDeleteNote}
                elapsedLabel={formatElapsed(note.recordingElapsedTime)}
                popupLeft={popupLeft}
                isSelectMode={isSelectMode}
                isSelected={selectedNoteIds?.has(note.id)}
                onToggleSelect={onToggleSelectNote}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
