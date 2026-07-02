import React from 'react';

interface HistoricalEventIconProps {
  className?: string;
}

export const HistoricalEventIcon: React.FC<HistoricalEventIconProps> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Open book */}
    <path d="M2 6.5C2 6.5 5 5 8 5c2 0 4 1 4 1s2-1 4-1c3 0 6 1.5 6 1.5V19s-3-1-6-1c-2 0-4 1-4 1s-2-1-4-1c-3 0-6 1-6 1V6.5z" />
    <path d="M12 6v14" />
    {/* Clock face */}
    <circle cx="7" cy="10" r="2.5" />
    <path d="M7 9v1.2l0.8 0.6" />
    {/* History arrow */}
    <path d="M5.5 13.5a4 4 0 0 0 2 1" />
    <path d="M5.5 13.5l-1 1.5" />
    <path d="M5.5 13.5l1.5.5" />
  </svg>
);
