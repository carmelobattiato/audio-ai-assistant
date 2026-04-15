
import React, { useState } from 'react';
import { BubbleNote, AppSettings } from '../types';
import { NoteBubble } from './NoteBubble';
import { FullscreenNotesViewer } from './FullscreenNotesViewer';
import { ConfirmModal } from './common/ConfirmModal';
import { saveBlobToFile } from '../utils/fileUtils';
import { formatTime } from '../utils/textUtils';
import { useNoteEditor } from '../hooks/notes/useNoteEditor';
import { useAutoScreenshot } from '../hooks/notes/useAutoScreenshot';
import { NoteEditorToolbar } from './notes/NoteEditorToolbar';
import { NoteActionsHeader } from './notes/NoteActionsHeader';
import { loggingService } from '../services/loggingService';

interface BubbleNotesProps {
  isEditorEditable: boolean;
  isRecordingCurrentlyActive: boolean;
  isScreenSharing: boolean;
  isRecordingSessionActive: boolean;
  elapsedTime: number;
  bubbleNotes: BubbleNote[];
  onBubbleNotesChange: (notes: BubbleNote[]) => void;
  onOpenBubbleNote: (noteId: string) => void;
  onTakeScreenshot: (isAutomatic: boolean) => void;
  llmSettings: AppSettings['llm'];
  transcriptionSettings: AppSettings['transcription'];
  pendingNoteHtml: string;
  onPendingNoteHtmlChange: (html: string) => void;
  viewingBubbleNoteId?: string | null;
  recordingTitle: string;
}

export const BubbleNotes: React.FC<BubbleNotesProps> = (props) => {
  const editor = useNoteEditor(
    props.isEditorEditable, props.elapsedTime, props.bubbleNotes, props.onBubbleNotesChange,
    props.pendingNoteHtml, props.onPendingNoteHtmlChange
  );
  
  const handleTakeScreenshotLogged = React.useCallback((isAuto: boolean) => {
    loggingService.info('SCREENSHOT_TAKE', `${isAuto ? 'Auto' : 'Manual'} screenshot requested`, { isAuto, isScreenSharing: props.isScreenSharing });
    props.onTakeScreenshot(isAuto);
  }, [props.onTakeScreenshot, props.isScreenSharing]);

  const autoShot = useAutoScreenshot(
    props.isRecordingCurrentlyActive, props.isScreenSharing,
    props.transcriptionSettings.autoScreenshotIntervalSeconds ?? 60, handleTakeScreenshotLogged
  );

  const toggleAutoScreenshotLogged = React.useCallback(() => {
    loggingService.info('SCREENSHOT_AUTOSHOT_TOGGLE', `Auto-shot toggled`, { currentlyOn: autoShot.isAutoScreenshotOn, isScreenSharing: props.isScreenSharing });
    autoShot.toggleAutoScreenshot();
  }, [autoShot, props.isScreenSharing]);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDownloadNotes = () => {
    if (props.bubbleNotes.length === 0) return;
    loggingService.info('BUBBLE_NOTES_EXPORT', 'Exporting bubble notes to HTML', { count: props.bubbleNotes.length });
    const notesHtml = props.bubbleNotes.map(n => `<div class="note"><h3>Time: ${formatTime(n.recordingElapsedTime)}</h3>${n.contentHtml}</div>`).join('');
    const blob = new Blob([`<html><body style="font-family:sans-serif;padding:20px"><h1>${props.recordingTitle}</h1>${notesHtml}</body></html>`], { type: 'text/html' });
    saveBlobToFile(blob, `notes_${props.recordingTitle.replace(/\s+/g, '_')}.html`);
  };

  const toggleSelection = (id: string) => {
    setSelectedNoteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <NoteActionsHeader 
        isSelectMode={isSelectMode} hasNotes={props.bubbleNotes.length > 0} selectedCount={selectedNoteIds.size}
        onToggleSelect={() => { setIsSelectMode(true); setSelectedNoteIds(new Set()); }}
        onFullscreen={() => setIsFullscreen(true)} onDownload={handleDownloadNotes}
        onCancelSelect={() => setIsSelectMode(false)} onDeleteRequest={() => setShowConfirmDelete(true)}
      />

      {props.bubbleNotes.length > 0 && (
        <div className="bubble-notes-container">
          {props.bubbleNotes.map(note => (
            <NoteBubble key={note.id} note={note} onView={() => props.onOpenBubbleNote(note.id)} isActive={note.id === props.viewingBubbleNoteId} isSelectMode={isSelectMode} isSelected={selectedNoteIds.has(note.id)} onToggleSelect={toggleSelection} />
          ))}
        </div>
      )}

      <div className="live-note-editor-wrapper">
        <NoteEditorToolbar
          {...autoShot}
          toggleAutoScreenshot={toggleAutoScreenshotLogged}
          isEditorEditable={props.isEditorEditable} isRecordingSessionActive={props.isRecordingSessionActive}
          activeFormats={editor.activeFormats} applyFormat={editor.applyFormat} onFileUploadClick={() => fileInputRef.current?.click()}
          onDownloadPendingClick={editor.handleDownloadPendingContent}
          onTakeScreenshot={handleTakeScreenshotLogged} isScreenSharing={props.isScreenSharing}
        />
        <div
          ref={editor.inputRef} contentEditable={props.isEditorEditable} suppressContentEditableWarning={true}
          onInput={(e) => props.onPendingNoteHtmlChange(e.currentTarget.innerHTML)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editor.handleAddNote(); } }}
          onPaste={editor.handlePaste} className="simple-editor-content focus:ring-blue-500 focus:border-blue-500"
        />
        <input 
            type="file" 
            ref={fileInputRef} 
            multiple 
            accept="image/*,text/plain,text/html,.docx,.doc,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pdf,application/pdf"
            className="hidden" 
            onChange={(e) => e.target.files && editor.handleFileSelect(Array.from(e.target.files))} 
        />
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-[10px] text-gray-500">
        <p>Enter to add note. Shift+Enter for newline. Paste images or upload files (Img, Txt, HTML, DOCX, PPTX, PDF).</p>
        {editor.parsingMessage && <p className="text-sky-300 animate-pulse">{editor.parsingMessage}</p>}
      </div>

      <FullscreenNotesViewer isOpen={isFullscreen} onClose={() => setIsFullscreen(false)} notes={props.bubbleNotes} title={props.recordingTitle} />
      <ConfirmModal isOpen={showConfirmDelete} onClose={() => setShowConfirmDelete(false)} title="Delete Notes" confirmText={`Delete ${selectedNoteIds.size}`} onConfirm={() => { 
        loggingService.info('BUBBLE_NOTES_DELETE', `Deleting ${selectedNoteIds.size} notes`, { ids: Array.from(selectedNoteIds) });
        props.onBubbleNotesChange(props.bubbleNotes.filter(n => !selectedNoteIds.has(n.id))); 
        setIsSelectMode(false); 
        setShowConfirmDelete(false); 
      }}>
        <p>Permanently delete {selectedNoteIds.size} notes?</p>
      </ConfirmModal>
    </div>
  );
};
