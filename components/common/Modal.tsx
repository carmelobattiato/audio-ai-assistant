import React, { useId } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Tailwind max-width class, e.g. "max-w-5xl". Defaults to "max-w-2xl". */
  maxWidth?: string;
  /** Tailwind z-index class, e.g. "z-[60]". Defaults to "z-50". */
  zIndex?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, maxWidth, zIndex }) => {
  const titleId = useId();
  const containerRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 ${zIndex ?? 'z-50'} transition-opacity duration-300 ease-in-out`}
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-gray-800 rounded-lg shadow-xl w-full ${maxWidth ?? 'max-w-2xl'} max-h-[90vh] flex flex-col overflow-hidden transform transition-all duration-300 ease-in-out scale-95 group-hover:scale-100`}
        onClick={(e) => e.stopPropagation()} // Prevent click inside modal from closing it
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 id={titleId} className="text-xl font-semibold text-sky-400">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          {children}
        </div>
        {footer && (
          <div className="p-4 border-t border-gray-700 bg-gray-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
