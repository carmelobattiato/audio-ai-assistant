import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { LoadingSpinner } from './common/LoadingSpinner';
import { BubbleNote, AppSettings } from '../types';
import { formatTime } from '../utils/textUtils';
import { sanitizeHtml } from '../utils/sanitize';
import { 
    FormatBoldIcon, 
    FormatItalicIcon, 
    FormatUnderlinedIcon, 
    FormatListBulletedIcon, 
    FormatListNumberedIcon 
} from '../constants';

interface BubbleNoteViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: BubbleNote | null;
  onSave: (updatedNote: BubbleNote) => void;
  onDelete: (noteId: string) => void;
  onGenerateSummary: (note: BubbleNote) => Promise<string | null>;
  llmSettings: AppSettings['llm'];
}

export const BubbleNoteViewerModal: React.FC<BubbleNoteViewerModalProps> = ({
  isOpen,
  onClose,
  note,
  onSave,
  onDelete,
  onGenerateSummary,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
  
  // State for summary workflow
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryPreviewHtml, setSummaryPreviewHtml] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [fullscreenImageSrc, setFullscreenImageSrc] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && note && editorRef.current) {
        editorRef.current.innerHTML = note.contentHtml;
        // Reset summary state when modal opens or note changes
        setIsSummarizing(false);
        setSummaryPreviewHtml(null);
        setSummaryError(null);

        // Add click listeners to images for fullscreen view
        const images = editorRef.current.querySelectorAll('img');
        images.forEach(img => {
            img.style.cursor = 'pointer';
            img.title = 'Click to view fullscreen';
            img.onclick = (e) => {
                e.stopPropagation(); // prevent modal click-away close
                setFullscreenImageSrc(img.src);
            };
        });
    }
  }, [isOpen, note]);

  const updateActiveFormats = useCallback(() => {
    const newActiveFormats: Record<string, boolean> = {};
    if (document.activeElement === editorRef.current) {
        ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'].forEach(command => {
            try { newActiveFormats[command] = document.queryCommandState(command); } 
            catch (e) { newActiveFormats[command] = false; }
        });
    }
    setActiveFormats(newActiveFormats);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && isOpen) {
      document.addEventListener('selectionchange', updateActiveFormats);
      editor.addEventListener('focus', updateActiveFormats);
      return () => {
        document.removeEventListener('selectionchange', updateActiveFormats);
        editor.removeEventListener('focus', updateActiveFormats);
      };
    }
  }, [isOpen, updateActiveFormats]);

  const applyFormat = (command: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand(command, false, undefined);
      updateActiveFormats();
    }
  };

  const handleSave = () => {
    if (note && editorRef.current) {
      onSave({ ...note, contentHtml: editorRef.current.innerHTML });
      onClose();
    }
  };

  const handleDelete = () => {
    if (note) onDelete(note.id);
  };
  
  const handleSummarize = async () => {
    if (!note || isSummarizing) return;
    setIsSummarizing(true);
    setSummaryPreviewHtml(null);
    setSummaryError(null);
    
    const summaryResult = await onGenerateSummary(note);
    if (summaryResult && !summaryResult.startsWith('Error:')) {
      setSummaryPreviewHtml(summaryResult);
    } else {
      setSummaryError(summaryResult || 'An unknown error occurred during summarization.');
    }
    setIsSummarizing(false);
  };

  const applySummary = () => {
    if (editorRef.current && summaryPreviewHtml) {
        editorRef.current.innerHTML = summaryPreviewHtml;
    }
    setSummaryPreviewHtml(null); // Hide preview after applying
  };

  const discardSummary = () => {
    setSummaryPreviewHtml(null);
    setSummaryError(null);
  };

  const toolbarButtons = [
    { icon: <FormatBoldIcon className="w-5 h-5"/>, command: 'bold', title: 'Bold' },
    { icon: <FormatItalicIcon className="w-5 h-5"/>, command: 'italic', title: 'Italic' },
    { icon: <FormatUnderlinedIcon className="w-5 h-5"/>, command: 'underline', title: 'Underline' },
    { icon: <FormatListBulletedIcon className="w-5 h-5"/>, command: 'insertUnorderedList', title: 'Bulleted List' },
    { icon: <FormatListNumberedIcon className="w-5 h-5"/>, command: 'insertOrderedList', title: 'Numbered List' },
  ];
  
  const modalFooter = (
    <div className="flex justify-between items-center w-full flex-wrap gap-2">
        <Button onClick={handleDelete} variant="danger" size="sm">
          Delete Note
        </Button>
        <div className="flex gap-2 flex-wrap">
            <Button onClick={handleSummarize} variant="secondary" size="sm" disabled={isSummarizing || !!summaryPreviewHtml}>
                {isSummarizing ? 'Summarizing...' : 'Summarize with AI'}
            </Button>
            <Button onClick={handleSave} variant="primary" size="sm">
                Save and Close
            </Button>
        </div>
    </div>
  );

  if (!note) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleSave}
        title={`Editing Note from ${formatTime(note.recordingElapsedTime)} (${new Date(note.timestamp).toLocaleString()})`}
        footer={modalFooter}
      >
        <div className="bubble-viewer-content">
          <div className="simple-editor-toolbar">
            {toolbarButtons.map(btn => (
              <button
                key={btn.command}
                onClick={() => applyFormat(btn.command)}
                title={btn.title}
                type="button"
                className={`p-1.5 ${activeFormats[btn.command] ? 'active' : ''}`}
              >
                {btn.icon}
              </button>
            ))}
          </div>
          <div
              ref={editorRef}
              contentEditable={!isSummarizing && !summaryPreviewHtml}
              className={`simple-editor-content ${isSummarizing || summaryPreviewHtml ? 'opacity-60 bg-gray-600' : ''}`}
              suppressContentEditableWarning={true}
          />
          {isSummarizing && (
            <div className="flex items-center justify-center p-4">
              <LoadingSpinner text="Analyzing note content..." size="md"/>
            </div>
          )}
          {summaryError && <p className="text-red-400 text-xs mt-2" role="alert">{summaryError}</p>}
          {summaryPreviewHtml && (
            <div className="summary-preview-container">
              <h4>Suggested Summary</h4>
              <div 
                className="summary-preview-content"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(summaryPreviewHtml) }}
              />
              <div className="summary-preview-actions">
                <Button onClick={discardSummary} variant="ghost" size="sm">Discard</Button>
                <Button onClick={applySummary} variant="secondary" size="sm">Apply</Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
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