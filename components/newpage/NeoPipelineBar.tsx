import React from 'react';
import { PipelineStep } from '../../types';
import { StopIcon } from '../../constants';

interface NeoPipelineBarProps {
  pipelineStep: PipelineStep;
  onStop: () => void;
}

const STEPS = [
  { key: PipelineStep.RECORDING,   label: 'Recording',   icon: '⏺' },
  { key: PipelineStep.TRANSCRIBING, label: 'Transcribing', icon: '📝' },
  { key: PipelineStep.ANALYZING,   label: 'AI Analysis',  icon: '✨' },
  { key: PipelineStep.DOWNLOADING, label: 'Packaging',    icon: '📦' },
  { key: PipelineStep.COMPLETED,   label: 'Done',         icon: '✅' },
];

export const NeoPipelineBar: React.FC<NeoPipelineBarProps> = ({ pipelineStep, onStop }) => {
  if (pipelineStep === PipelineStep.IDLE) return null;

  const currentIndex = STEPS.findIndex(s => s.key === pipelineStep);
  const showStop = pipelineStep === PipelineStep.TRANSCRIBING || pipelineStep === PipelineStep.ANALYZING;

  const getStepStyle = (stepKey: PipelineStep, i: number) => {
    if (pipelineStep === PipelineStep.COMPLETED && stepKey === PipelineStep.COMPLETED) {
      return { bg: 'rgba(16,185,129,0.25)', border: 'rgba(16,185,129,0.5)', text: '#6EE7B7', glow: false };
    }
    if (stepKey === pipelineStep) {
      return { bg: 'rgba(124,58,237,0.4)', border: 'rgba(167,139,250,0.7)', text: '#EDE9FE', glow: true };
    }
    if (i < currentIndex) {
      return { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', text: '#6EE7B7', glow: false };
    }
    return { bg: 'var(--neo-card)', border: 'var(--neo-border)', text: 'var(--neo-muted)', glow: false };
  };

  return (
    <div
      className="flex items-center justify-center gap-3 px-6 py-3 flex-wrap"
      style={{ borderBottom: '1px solid var(--neo-border)', background: 'var(--neo-overlay-dim)' }}
    >
      {STEPS.map((step, i) => {
        const style = getStepStyle(step.key, i);
        return (
          <React.Fragment key={step.key}>
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider transition-all duration-300 ${style.glow ? 'animate-pulse' : ''}`}
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
                color: style.text,
                boxShadow: style.glow ? '0 0 14px rgba(124,58,237,0.5)' : 'none',
              }}
            >
              <span>{step.icon}</span>
              <span>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="h-px w-5" style={{ background: 'linear-gradient(90deg, rgba(124,58,237,0.4), rgba(192,38,211,0.2))' }} />
            )}
          </React.Fragment>
        );
      })}

      {showStop && (
        <button
          onClick={onStop}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ml-2 transition-all hover:scale-105"
          style={{
            background: 'rgba(239,68,68,0.2)',
            border: '1px solid rgba(239,68,68,0.5)',
            color: '#FCA5A5',
          }}
        >
          <StopIcon className="w-3 h-3" />
          Stop
        </button>
      )}
    </div>
  );
};
