import React from 'react';

interface NeoCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  padding?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export const NeoCard: React.FC<NeoCardProps> = ({
  children,
  className = '',
  glow = false,
  padding = true,
  style,
  onClick,
}) => (
  <div
    onClick={onClick}
    className={`rounded-2xl border backdrop-blur-md transition-all duration-300 ${padding ? 'p-5' : ''} ${glow ? 'neo-recording-glow' : ''} ${onClick ? 'cursor-pointer hover:border-violet-400/50' : ''} ${className}`}
    style={{
      background: 'rgba(255,255,255,0.03)',
      borderColor: 'rgba(139,92,246,0.2)',
      ...style,
    }}
  >
    {children}
  </div>
);
