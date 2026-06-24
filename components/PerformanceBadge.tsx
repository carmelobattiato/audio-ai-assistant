import React from 'react';
import { usePerformanceStats } from '../hooks/usePerformanceStats';

interface PerformanceBadgeProps {
  style?: React.CSSProperties;
}

export const PerformanceBadge: React.FC<PerformanceBadgeProps> = ({ style }) => {
  const { ramMb, fps } = usePerformanceStats();

  const fpsColor =
    fps === null ? '#64748b' :
    fps > 45    ? '#10b981' :
    fps > 25    ? '#f59e0b' :
                  '#ef4444';

  return (
    <span
      title="Utilizzo memoria JS (Chrome only) e FPS rendering — proxy del carico CPU"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#64748b',
        cursor: 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span>⚙</span>
      <span>{ramMb !== null ? `${ramMb} MB` : 'MB n/a'}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span style={{ color: fpsColor }}>{fps !== null ? `${fps} fps` : '— fps'}</span>
    </span>
  );
};
