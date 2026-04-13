import React, { useState, useEffect, useRef } from 'react';
import { BubbleNote } from '../types';
import { formatTime } from '../utils/textUtils';

interface FullscreenNotesViewerProps {
  isOpen: boolean;
  onClose: () => void;
  notes: BubbleNote[];
  title: string;
}

export const FullscreenNotesViewer: React.FC<FullscreenNotesViewerProps> = ({ isOpen, onClose, notes, title }) => {
    const [fullscreenImageSrc, setFullscreenImageSrc] = useState<string | null>(null);
    const notesContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && notesContainerRef.current) {
            const images = notesContainerRef.current.querySelectorAll('img');
            images.forEach(img => {
                img.style.cursor = 'pointer';
                img.title = 'Click to view fullscreen';
                img.onclick = (e) => {
                    e.stopPropagation();
                    setFullscreenImageSrc(img.src);
                };
            });
        }
    }, [isOpen, notes]);

    if (!isOpen) return null;

    return (
        <>
            <div 
                className="fixed inset-0 bg-gray-900 bg-opacity-95 z-50 flex flex-col p-4 sm:p-8"
                style={{ animation: 'fullscreen-fade-in 0.3s ease-out' }}
                onClick={(e) => {
                    if ((e.target as HTMLElement).tagName !== 'IMG') {
                        onClose();
                    }
                }}
            >
                <header className="flex-shrink-0 flex items-center justify-between pb-4 mb-4 border-b border-gray-700">
                    <h2 className="text-2xl font-bold text-sky-400">{title ? `Notes for: ${title}` : 'All Notes'}</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                        aria-label="Close fullscreen viewer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>
                <main ref={notesContainerRef} className="flex-grow overflow-y-auto pr-4">
                    {notes.length === 0 ? (
                        <p className="text-gray-400">No notes have been added yet.</p>
                    ) : (
                        <div className="space-y-6">
                            {notes.map(note => (
                                <div key={note.id} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                                    <p className="text-sm font-mono text-sky-300 mb-2">
                                        Note at {formatTime(note.recordingElapsedTime)}
                                    </p>
                                    <div 
                                        className="bubble-viewer-content"
                                        dangerouslySetInnerHTML={{ __html: note.contentHtml }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>
            {fullscreenImageSrc && (
                <div 
                    className="fullscreen-image-overlay"
                    onClick={() => setFullscreenImageSrc(null)}
                >
                    <img 
                        src={fullscreenImageSrc} 
                        alt="Fullscreen view" 
                        className="fullscreen-image-content"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
};