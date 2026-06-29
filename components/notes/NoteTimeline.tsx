import React, { useEffect, useRef } from 'react';
import { BubbleNote } from '@/types';
import { NoteTimelineItem } from './NoteTimelineItem';

interface NoteTimelineProps {
  notes: BubbleNote[];
  onOpenNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
}

const ROW_H = 104;
const NODE_R = 28;
const PAD_TOP = 20;
const X_LEFT = 22;
const X_RIGHT = 78;

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const NoteTimeline: React.FC<NoteTimelineProps> = ({ notes, onOpenNote, onDeleteNote }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(notes.length);

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

  const totalH = PAD_TOP + notes.length * ROW_H + 32;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto min-h-0">
      <div className="relative w-full" style={{ height: totalH }}>

        {/* SVG snake connectors */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height={totalH}
          viewBox={`0 0 100 ${totalH}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="snake-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {notes.slice(0, -1).map((_, i) => {
            const x1p = i % 2 === 0 ? X_LEFT : X_RIGHT;
            const x2p = i % 2 === 0 ? X_RIGHT : X_LEFT;
            const cy1 = PAD_TOP + i * ROW_H + NODE_R;
            const cy2 = PAD_TOP + (i + 1) * ROW_H + NODE_R;
            const midY = (cy1 + cy2) / 2;
            return (
              <path
                key={i}
                d={`M ${x1p} ${cy1} C ${x1p} ${midY}, ${x2p} ${midY}, ${x2p} ${cy2}`}
                fill="none"
                stroke="url(#snake-grad)"
                strokeWidth="2"
                strokeDasharray="5 4"
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {notes.map((note, i) => {
          const xPct = i % 2 === 0 ? X_LEFT : X_RIGHT;
          return (
            <div
              key={note.id}
              className="absolute"
              style={{
                left: `calc(${xPct}% - ${NODE_R}px)`,
                top: PAD_TOP + i * ROW_H,
              }}
            >
              <NoteTimelineItem
                note={note}
                onOpen={onOpenNote}
                onDelete={onDeleteNote}
                elapsedLabel={formatElapsed(note.recordingElapsedTime)}
                popupSide={i % 2 === 0 ? 'right' : 'left'}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
