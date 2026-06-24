import { useState, useEffect, useRef } from 'react';

export interface PerformanceStats {
  ramMb: number | null;
  fps: number | null;
}

// ponytail: single rAF loop per component instance, sampled every 2s
export function usePerformanceStats(): PerformanceStats {
  const [stats, setStats] = useState<PerformanceStats>({ ramMb: null, fps: null });
  const frameCountRef = useRef(0);
  const lastSampleRef  = useRef(performance.now());
  const rafRef         = useRef<number>(0);

  useEffect(() => {
    const loop = (now: number) => {
      frameCountRef.current++;
      const elapsed = now - lastSampleRef.current;
      if (elapsed >= 2000) {
        const fps = Math.round((frameCountRef.current / elapsed) * 1000);
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const ramMb = mem ? Math.round(mem.usedJSHeapSize / 1_048_576) : null;
        setStats({ fps, ramMb });
        frameCountRef.current = 0;
        lastSampleRef.current = now;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return stats;
}
