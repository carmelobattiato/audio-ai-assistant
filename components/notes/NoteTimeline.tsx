import React, { useEffect, useRef, useState } from 'react';
import { BubbleNote } from '@/types';
import { NoteTimelineItem } from './NoteTimelineItem';

// Evaluate position along connector i at param t (0-1)
// Returns {x: percent 0-100, y: px} matching the SVG viewBox coordinate system
function evalConnectorPos(i: number, t: number): { x: number; y: number } {
  const x1 = nodeX(i), y1 = nodeY(i);
  const x2 = nodeX(i + 1), y2 = nodeY(i + 1);
  const sameRow = Math.floor(i / NODES_PER_ROW) === Math.floor((i + 1) / NODES_PER_ROW);
  if (sameRow) return { x: x1 + t * (x2 - x1), y: y1 };
  const midY = (y1 + y2) / 2;
  const mt = 1 - t;
  return {
    x: mt*mt*mt*x1 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x2,
    y: mt*mt*mt*y1 + 3*mt*mt*t*midY + 3*mt*t*t*midY + t*t*t*y2,
  };
}

interface NoteTimelineProps {
  notes: BubbleNote[];
  onOpenNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  isSelectMode?: boolean;
  selectedNoteIds?: Set<string>;
  onToggleSelectNote?: (id: string) => void;
  onPlayAudio?: (filename: string) => void;
  currentlyPlayingAudioFilename?: string | null;
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

export const NoteTimeline: React.FC<NoteTimelineProps> = ({ notes, onOpenNote, onDeleteNote, isSelectMode, selectedNoteIds, onToggleSelectNote, onPlayAudio, currentlyPlayingAudioFilename }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(notes.length);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Pulse Trail animation refs (imperative, no re-render)
  const particleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ringRefs     = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef       = useRef<number>(0);
  const animRef      = useRef<{
    particles: Array<{ t: number; pausing: number; connIdx: number; startConn: number }>;
    rings:     Array<{ t: number; active: boolean }>;
  } | null>(null);

  useEffect(() => {
    if (notes.length < 2) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const nConn    = notes.length - 1;
    const nNodes   = notes.length;
    const MAX_P    = 4;
    const poolSize = Math.min(nConn, MAX_P);
    const STAGGER  = 0.42;

    animRef.current = {
      particles: Array.from({ length: poolSize }, (_, i) => ({
        t: 0, pausing: -(i * STAGGER),
        connIdx: i,   // connector currently being traveled
        startConn: i, // original lane for wrap-around
      })),
      rings: Array.from({ length: nNodes }, () => ({ t: 0, active: false })),
    };

    let lastTs: number | null = null;

    function triggerRing(idx: number) {
      if (!animRef.current) return;
      const r = animRef.current.rings[idx];
      if (r) { r.active = true; r.t = 0; }
    }
    triggerRing(0); // first node fires immediately

    function tick(ts: number) {
      if (!animRef.current) return;
      if (!lastTs) lastTs = ts;
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      const { particles, rings } = animRef.current;
      const cw = containerRef.current?.offsetWidth ?? 300;

      // Particles
      particles.forEach((p, pi) => {
        const el = particleRefs.current[pi];
        if (p.pausing < 0) {          // stagger delay (negative = waiting to start)
          p.pausing += dt;
          if (el) el.style.opacity = '0';
          return;
        }
        if (p.pausing > 0) {          // end-of-path pause → advance to next lane
          p.pausing -= dt;
          if (el) el.style.opacity = '0';
          if (p.pausing <= 0) {
            p.pausing = 0;
            p.t = 0;
            const next = p.connIdx + MAX_P;
            p.connIdx = next < nConn ? next : p.startConn; // wrap back to original lane
          }
          return;
        }
        p.t += dt / 2.0;
        if (p.t >= 1) { p.t = 1; p.pausing = 0.38; triggerRing(p.connIdx + 1); }
        if (!el) return;
        const { x, y } = evalConnectorPos(p.connIdx, p.t);
        const xPx = x / 100 * cw;
        const fade = Math.min(p.t / 0.08, 1) * Math.min((1 - p.t) / 0.08, 1);
        el.style.transform = `translate(${xPx - 4}px, ${y - 4}px)`;
        el.style.opacity   = String(Math.max(0, fade) * 0.92);
      });

      // Rings
      rings.forEach((ring, i) => {
        const el = ringRefs.current[i];
        if (!el || !ring.active) return;
        ring.t += dt / 1.2;
        if (ring.t >= 1) {
          ring.active = false;
          el.style.opacity   = '0';
          el.style.transform = 'translate(-50%,-50%) scale(1)';
          return;
        }
        const ease  = 1 - Math.pow(1 - ring.t, 3);
        el.style.opacity   = String((1 - ring.t) * 0.72);
        el.style.transform = `translate(-50%,-50%) scale(${1 + ease * 0.308})`;
      });

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); animRef.current = null; };
  }, [notes.length]);

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

        {/* Particles — pool of max 4, cycle through all connectors */}
        {Array.from({ length: Math.min(notes.length - 1, 4) }, (_, i) => (
          <div
            key={`pt-${i}`}
            ref={el => { particleRefs.current[i] = el; }}
            className="absolute pointer-events-none rounded-full"
            style={{
              width: 8, height: 8,
              left: 0, top: 0,
              background: '#6ee7b7',
              boxShadow: '0 0 6px 3px rgba(52,211,153,0.55)',
              opacity: 0,
              willChange: 'transform, opacity',
            }}
          />
        ))}

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
              {/* Cascade ring */}
              <div
                ref={el => { ringRefs.current[i] = el; }}
                className="absolute pointer-events-none rounded-full"
                style={{
                  width: NODE_D, height: NODE_D,
                  left: '50%', top: '50%',
                  transform: 'translate(-50%,-50%) scale(1)',
                  border: '1.5px solid #34d399',
                  opacity: 0,
                  willChange: 'transform, opacity',
                }}
              />
              <NoteTimelineItem
                note={note}
                onOpen={onOpenNote}
                onDelete={onDeleteNote}
                elapsedLabel={formatElapsed(note.recordingElapsedTime)}
                popupLeft={popupLeft}
                isSelectMode={isSelectMode}
                isSelected={selectedNoteIds?.has(note.id)}
                onToggleSelect={onToggleSelectNote}
                onPlayAudio={onPlayAudio}
                currentlyPlayingAudioFilename={currentlyPlayingAudioFilename}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
