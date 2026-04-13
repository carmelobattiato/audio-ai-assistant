import React from 'react';

interface LoadingModalProps {
  isOpen: boolean;
  text: string;
}

export const LoadingModal: React.FC<LoadingModalProps> = ({ isOpen, text }) => {
  // This component is deprecated and has been replaced by the more integrated 
  // 'btn-loading-glow' effect on buttons. Returning null to ensure any
  // legacy imports do not break the application.
  return null;
};