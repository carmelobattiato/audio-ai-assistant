
import React, { useState, useRef, useCallback } from 'react';
import { BubbleNote, AppSettings } from '../types';
import { FullscreenNotesViewer } from './FullscreenNotesViewer';
import { ConfirmModal } from './common/ConfirmModal';
import { saveBlobToFile } from '../utils/fileUtils';
import { formatTime } from '../utils/textUtils';
import { useNoteEditor } from '../hooks/notes/useNoteEditor';
import { useAutoScreenshot } from '../hooks/notes/useAutoScreenshot';
import { useVideoRecorder } from '../hooks/notes/useVideoRecorder';
import { NoteActionsHeader } from './notes/NoteActionsHeader';
import { NoteTimeline } from './notes/NoteTimeline';
import { NoteEditor } from './notes/NoteEditor';
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
  displayStream?: MediaStream | null;
}

const BubbleNotesBase: React.FC<BubbleNotesProps> = (props) => {
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Hooks ---
  const {
    editor,
    parsingMessage,
    handleAddNote,
    handleFileSelect,
  } = useNoteEditor(
    props.isEditorEditable,
    props.elapsedTime,
    props.bubbleNotes,
    props.onBubbleNotesChange,
    props.pendingNoteHtml,
    props.onPendingNoteHtmlChange,
  );

  const handleTakeScreenshotLogged = useCallback((isAuto: boolean) => {
    loggingService.info('SCREENSHOT_TAKE', `${isAuto ? 'Auto' : 'Manual'} screenshot requested`, { isAuto, isScreenSharing: props.isScreenSharing });
    props.onTakeScreenshot(isAuto);
  }, [props.onTakeScreenshot, props.isScreenSharing]);

  const autoShot = useAutoScreenshot(
    props.isRecordingCurrentlyActive,
    props.isScreenSharing,
    props.transcriptionSettings.autoScreenshotIntervalSeconds ?? 60,
    handleTakeScreenshotLogged,
  );

  const toggleAutoScreenshotLogged = useCallback(() => {
    loggingService.info('SCREENSHOT_AUTOSHOT_TOGGLE', `Auto-shot toggled`, { currentlyOn: autoShot.isAutoScreenshotOn, isScreenSharing: props.isScreenSharing });
    autoShot.toggleAutoScreenshot();
  }, [autoShot, props.isScreenSharing]);

  const {
    isVideoRecording,
    chunkCount: videoChunkCount,
    startVideo,
    stopVideo,
  } = useVideoRecorder({ displayStream: props.displayStream ?? null });

  // --- Note management ---
  const handleDeleteNote = useCallback((noteId: string) => {
    props.onBubbleNotesChange(props.bubbleNotes.filter(n => n.id !== noteId));
  }, [props.bubbleNotes, props.onBubbleNotesChange]);

  const handleDeleteSelected = useCallback(() => {
    loggingService.info('BUBBLE_NOTES_DELETE', `Deleting ${selectedNoteIds.size} notes`, { ids: Array.from(selectedNoteIds) });
    props.onBubbleNotesChange(props.bubbleNotes.filter(n => !selectedNoteIds.has(n.id)));
    setSelectedNoteIds(new Set());
    setIsSelectMode(false);
    setShowConfirmDelete(false);
  }, [props.bubbleNotes, props.onBubbleNotesChange, selectedNoteIds]);

  const handleDownloadNotes = useCallback(() => {
    if (props.bubbleNotes.length === 0) return;
    loggingService.info('BUBBLE_NOTES_EXPORT', 'Exporting bubble notes to HTML', { count: props.bubbleNotes.length });
    const notesHtml = props.bubbleNotes.map(n => `<div class="note"><h3>Time: ${formatTime(n.recordingElapsedTime)}</h3>${n.contentHtml}</div>`).join('');
    const blob = new Blob([`<html><body style="font-family:sans-serif;padding:20px"><h1>${props.recordingTitle}</h1>${notesHtml}</body></html>`], { type: 'text/html' });
    saveBlobToFile(blob, `notes_${props.recordingTitle.replace(/\s+/g, '_')}.html`);
  }, [props.bubbleNotes, props.recordingTitle]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <NoteActionsHeader
        isSelectMode={isSelectMode}
        selectedCount={selectedNoteIds.size}
        hasNotes={props.bubbleNotes.length > 0}
        isVideoRecording={isVideoRecording}
        videoChunkCount={videoChunkCount}
        onToggleSelect={() => { setIsSelectMode(true); setSelectedNoteIds(new Set()); }}
        onFullscreen={() => setIsFullscreen(true)}
        onDownload={handleDownloadNotes}
        onDeleteRequest={() => setShowConfirmDelete(true)}
        onCancelSelect={() => { setIsSelectMode(false); setSelectedNoteIds(new Set()); }}
      />

      {/* Timeline */}
      <NoteTimeline
        notes={props.bubbleNotes}
        onOpenNote={props.onOpenBubbleNote}
        onDeleteNote={handleDeleteNote}
      />

      {/* Editor */}
      <NoteEditor
        editor={editor}
        pendingNoteHtml={props.pendingNoteHtml}
        isEditorEditable={props.isEditorEditable}
        isScreenSharing={props.isScreenSharing}
        isVideoRecording={isVideoRecording}
        videoChunkCount={videoChunkCount}
        isAutoScreenshotOn={autoShot.isAutoScreenshotOn}
        countdown={autoShot.countdown}
        currentInterval={autoShot.currentInterval}
        parsingMessage={parsingMessage}
        onFileUploadClick={() => fileInputRef.current?.click()}
        onTakeScreenshot={() => handleTakeScreenshotLogged(false)}
        onToggleAutoScreenshot={toggleAutoScreenshotLogged}
        onAdjustTiming={autoShot.adjustTiming}
        onStartVideo={startVideo}
        onStopVideo={stopVideo}
        onAddNote={handleAddNote}
      />

      {/* Hidden file input for NoteEditor file upload */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,text/plain,text/html,.docx,.doc,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pdf,application/pdf"
        onChange={(e) => e.target.files && handleFileSelect(Array.from(e.target.files))}
      />

      {/* Modals */}
      {isFullscreen && (
        <FullscreenNotesViewer
          isOpen={isFullscreen}
          onClose={() => setIsFullscreen(false)}
          notes={props.bubbleNotes}
          title={props.recordingTitle}
        />
      )}
      {showConfirmDelete && (
        <ConfirmModal
          isOpen={showConfirmDelete}
          onClose={() => setShowConfirmDelete(false)}
          title="Delete Notes"
          confirmText={`Delete ${selectedNoteIds.size}`}
          onConfirm={handleDeleteSelected}
        >
          <p>Permanently delete {selectedNoteIds.size} notes?</p>
        </ConfirmModal>
      )}
    </div>
  );
};

export const BubbleNotes = React.memo(BubbleNotesBase);
