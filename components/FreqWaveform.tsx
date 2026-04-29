import React, { useRef, useEffect } from 'react';

interface FreqWaveformProps {
  micAnalyserNode: AnalyserNode | null;
  appAnalyserNode: AnalyserNode | null;
  isActive: boolean;
  hideLegend?: boolean;
}

export const FreqWaveform: React.FC<FreqWaveformProps> = ({
  micAnalyserNode, appAnalyserNode, isActive, hideLegend = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tick = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }

      const W = canvas.offsetWidth || canvas.width;
      const H = canvas.offsetHeight || canvas.height;
      canvas.width = W;
      canvas.height = H;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      const draw = (analyser: AnalyserNode, color: string, offsetY: number, trackH: number) => {
        const bufLen = analyser.frequencyBinCount;
        const data = new Uint8Array(bufLen);
        analyser.getByteFrequencyData(data);
        const barW = W / bufLen * 2.5;
        let x = 0;
        for (let i = 0; i < bufLen; i++) {
          const v = data[i] ?? 0;
          const bh = (v / 255) * trackH;
          const alpha = isActive ? 0.35 + v / 510 : 0.2;
          ctx.fillStyle = `rgba(${color},${alpha})`;
          ctx.fillRect(x, offsetY + trackH - bh, Math.max(1, barW - 1), bh);
          x += barW;
          if (x > W) break;
        }
      };

      const hasBoth = micAnalyserNode && appAnalyserNode;
      if (hasBoth) {
        const half = H / 2;
        draw(micAnalyserNode!, '139,92,246', 0, half);
        draw(appAnalyserNode!, '239,68,68', half, half);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, half); ctx.lineTo(W, half); ctx.stroke();
      } else if (micAnalyserNode) {
        draw(micAnalyserNode, '139,92,246', 0, H);
      } else if (appAnalyserNode) {
        draw(appAnalyserNode, '239,68,68', 0, H);
      } else {
        ctx.strokeStyle = 'rgba(139,92,246,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(12, H / 2);
        ctx.lineTo(W - 12, H / 2);
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [micAnalyserNode, appAnalyserNode, isActive]);

  const isAppAudioActive = appAnalyserNode !== null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {!hideLegend && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
          display: 'flex', flexDirection: 'row', gap: 8,
          pointerEvents: 'none',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(17,24,39,0.6)', padding: '2px 8px',
            borderRadius: 6, backdropFilter: 'blur(4px)',
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#8B5CF6', flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#C4B5FD', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Microphone</span>
          </div>
          {isAppAudioActive && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(17,24,39,0.6)', padding: '2px 8px',
              borderRadius: 6, backdropFilter: 'blur(4px)',
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#FECACA', textTransform: 'uppercase', letterSpacing: '0.05em' }}>System Audio</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
