import React, { useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';

interface NeoTooltipProps {
  text: string;
  children: React.ReactNode;
  className?: string;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  above: boolean;
}

const TOOLTIP_GAP = 10;         // px between trigger edge and tooltip
const EDGE_PADDING = 12;        // min distance from viewport edges
const THRESHOLD_TOP = 100;      // if trigger top < this, show below

export const NeoTooltip: React.FC<NeoTooltipProps> = ({ text, children, className = '' }) => {
  const [tip, setTip] = useState<TooltipState>({ visible: false, x: 0, y: 0, above: true });
  const triggerRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const above = r.top >= THRESHOLD_TOP;
    setTip({
      visible: true,
      x: Math.max(EDGE_PADDING, Math.min(window.innerWidth - EDGE_PADDING, r.left + r.width / 2)),
      y: above ? r.top - TOOLTIP_GAP : r.bottom + TOOLTIP_GAP,
      above,
    });
  }, []);

  const hide = useCallback(() => setTip(t => ({ ...t, visible: false })), []);

  return (
    <div ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} className={className}>
      {children}
      {tip.visible && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            left: tip.x,
            ...(tip.above
              ? { bottom: window.innerHeight - tip.y }
              : { top: tip.y }),
            transform: 'translateX(-50%)',
            zIndex: 999999,
            background: 'var(--neo-surface-solid, rgba(15,11,46,0.98))',
            border: '1px solid var(--neo-border, rgba(139,92,246,0.35))',
            color: 'var(--neo-text, #EDE9FE)',
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.5,
            padding: '6px 10px',
            borderRadius: 8,
            maxWidth: 260,
            minWidth: 80,
            textAlign: 'center',
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            animation: 'neo-tooltip-in 0.12s ease-out forwards',
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </div>
  );
};
