import { useEffect, useRef } from 'react';

const SIZE       = 32;
const BAR_COUNT  = 8;
const FPS        = 14;
const FRAME_MS   = 1000 / FPS;
const BG_COLOR   = '#0F0B2E';
const BAR_COLOR  = '#EF4444';   // red-500
const GLOW_COLOR = 'rgba(239,68,68,0.6)';

/**
 * Swaps the browser-tab favicon to a canvas-animated red waveform while recording.
 *
 * Strategy: inject a NEW <link rel="icon"> at the end of <head>.
 * Browsers always use the LAST matching icon link, so this naturally overrides
 * all existing static favicon elements without touching them.
 * On stop, the injected element is removed and the originals take over again.
 */
export function useRecordingFavicon(isRecording: boolean): void {
  const rafRef         = useRef<number | null>(null);
  const lastFrameRef   = useRef<number>(0);
  const phaseRef       = useRef<number>(0);
  const dynamicLink    = useRef<HTMLLinkElement | null>(null);
  const canvas         = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isRecording) {
      // Stop animation and remove the injected link — originals take over
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      dynamicLink.current?.remove();
      dynamicLink.current = null;
      return;
    }

    // Create off-screen canvas once
    if (!canvas.current) {
      canvas.current = document.createElement('canvas');
      canvas.current.width  = SIZE;
      canvas.current.height = SIZE;
    }
    const ctx = canvas.current.getContext('2d');
    if (!ctx) return;

    // Inject a new <link> at the END of <head> — takes precedence over earlier links
    const link = document.createElement('link');
    link.rel  = 'icon';
    link.type = 'image/png';
    link.sizes = '32x32';
    document.head.appendChild(link);
    dynamicLink.current = link;

    const barW  = 2;
    const totalBarsW = BAR_COUNT * barW;
    const totalGaps  = SIZE - totalBarsW;
    const gap        = totalGaps / (BAR_COUNT + 1);
    const minH = 3;
    const maxH = SIZE - 6;

    const drawFrame = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Dark circular background
      ctx.fillStyle = BG_COLOR;
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
      ctx.fill();

      // Clip to circle so bars don't overflow
      ctx.save();
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 0.5, 0, Math.PI * 2);
      ctx.clip();

      ctx.shadowColor = GLOW_COLOR;
      ctx.shadowBlur  = 5;
      ctx.fillStyle   = BAR_COLOR;

      for (let i = 0; i < BAR_COUNT; i++) {
        const amp = Math.sin(phaseRef.current + i * 0.8) * 0.5 + 0.5;
        const h   = minH + amp * (maxH - minH);
        const x   = gap + i * (barW + gap);
        const y   = (SIZE - h) / 2;
        const r   = Math.min(barW / 2, 1.5);

        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.arcTo(x + barW, y,       x + barW, y + r,     r);
        ctx.lineTo(x + barW, y + h - r);
        ctx.arcTo(x + barW, y + h,   x + barW - r, y + h, r);
        ctx.lineTo(x + r,   y + h);
        ctx.arcTo(x,        y + h,   x, y + h - r,        r);
        ctx.lineTo(x,       y + r);
        ctx.arcTo(x,        y,       x + r, y,             r);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();

      // Push data URL to the injected link
      link.href = canvas.current!.toDataURL('image/png');
    };

    const tick = (ts: number) => {
      if (ts - lastFrameRef.current >= FRAME_MS) {
        lastFrameRef.current = ts;
        phaseRef.current += 0.28;
        drawFrame();
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      link.remove();
      dynamicLink.current = null;
    };
  }, [isRecording]);
}
