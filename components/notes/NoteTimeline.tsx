import React, { useEffect, useRef } from 'react';
import { BubbleNote } from '@/types';
import { NoteTimelineItem } from './NoteTimelineItem';

interface NoteTimelineProps {
  notes: BubbleNote[];
  onOpenNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const NoteTimeline: React.FC<NoteTimelineProps> = ({ notes, onOpenNote, onDeleteNote }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(notes.length);

  // Auto-scroll to bottom when a new note is added
  useEffect(() => {
    if (notes.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {notes.map((note) => (
        <NoteTimelineItem
          key={note.id}
          note={note}
          onOpen={onOpenNote}
          onDelete={onDeleteNote}
          elapsedTimeLabel={formatElapsed(note.recordingElapsedTime)}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
