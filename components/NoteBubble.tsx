import React, { useState, useEffect, useMemo } from 'react';
import { BubbleNote } from '../types';
import { formatTime, htmlToPlainText } from '../utils/textUtils';
import { DocumentTextIcon, CheckCircleIcon } from '../constants';

interface NoteBubbleProps {
    note: BubbleNote;
    onView: () => void;
    isActive: boolean;
    isSelectMode: boolean;
    isSelected: boolean;
    onToggleSelect: (noteId: string) => void;
}

export const NoteBubble: React.FC<NoteBubbleProps> = ({ note, onView, isActive, isSelectMode, isSelected, onToggleSelect }) => {
    const [showPreview, setShowPreview] = useState(false);
    const [isNew, setIsNew] = useState(true);

    useEffect(() => {
        // Animation is 3s * 2 iterations = 6s.
        const timer = setTimeout(() => {
            setIsNew(false);
        }, 6000); 
        return () => clearTimeout(timer);
    }, []);

    const { bubbleContent, hoverPreviewContent } = useMemo(() => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.contentHtml;

        const firstImage = tempDiv.querySelector('img');
        const plainText = htmlToPlainText(note.contentHtml).trim();

        let bubbleElement: React.ReactNode;
        if (firstImage) {
            bubbleElement = <div className="note-bubble-image-preview" style={{ backgroundImage: `url(${firstImage.src})` }}></div>;
        } else if (plainText) {
            bubbleElement = <div className="note-bubble-text-preview">{plainText}</div>;
        } else {
            bubbleElement = <DocumentTextIcon className="w-9 h-9 text-sky-300" />;
        }

        const hoverText = plainText.substring(0, 150) + (plainText.length > 150 ? '...' : '');
        const hoverElement = (
            <>
                {firstImage && <img src={firstImage.src} alt="Note preview" />}
                {hoverText && <div className={`preview-text ${firstImage ? 'mt-1' : ''}`}>{hoverText}</div>}
            </>
        );

        return { bubbleContent: bubbleElement, hoverPreviewContent: firstImage || hoverText ? hoverElement : null };
    }, [note.contentHtml]);

    if (!note) return null;
    
    const fullTimestampInfo = `Note at ${formatTime(note.recordingElapsedTime)} (${new Date(note.timestamp).toLocaleString()})\nClick to view & edit`;

    const handleClick = () => {
        if (isSelectMode) {
            onToggleSelect(note.id);
        } else {
            onView();
        }
    };

    const wrapperClasses = [
        'note-bubble-wrapper',
        isSelectMode ? 'is-in-select-mode' : '',
        isSelected ? 'is-selected' : '',
    ].filter(Boolean).join(' ');

    return (
        <div 
            className={wrapperClasses}
            onClick={handleClick}
            onMouseEnter={() => !isSelectMode && setShowPreview(true)}
            onMouseLeave={() => setShowPreview(false)}
            role="button"
            aria-label={isSelectMode ? `Select note at ${formatTime(note.recordingElapsedTime)}` : `View note at ${formatTime(note.recordingElapsedTime)}`}
            aria-pressed={isSelected}
        >
            <div className={`note-bubble-container ${isNew ? 'newly-created' : ''}`}>
                 <div
                    className={`note-bubble ${isActive ? 'is-active' : ''}`}
                    title={fullTimestampInfo}
                >
                    {bubbleContent}
                </div>
                 <div className="note-selection-overlay">
                    <CheckCircleIcon className="w-8 h-8 text-white" />
                </div>
            </div>
            <span className="note-bubble-timer">{formatTime(note.recordingElapsedTime)}</span>
           
            {showPreview && hoverPreviewContent && (
                <div className="note-preview-popup" aria-live="polite">
                    {hoverPreviewContent}
                </div>
            )}
        </div>
    );
};