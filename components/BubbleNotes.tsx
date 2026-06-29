
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

    const noteItems = props.bubbleNotes.map((n, idx) => {
      const isScreenshot = n.type === 'screenshot' || n.type === 'auto-screenshot';
      const typeLabel = isScreenshot ? '📷 Screenshot' : '📝 Note';
      const timeLabel = formatTime(n.recordingElapsedTime);
      return `
        <div class="note-item">
          <div class="note-connector${idx === 0 ? ' first' : ''}"></div>
          <div class="note-dot ${isScreenshot ? 'dot-screenshot' : 'dot-text'}">
            <span class="dot-index">${idx + 1}</span>
          </div>
          <div class="note-card">
            <div class="note-meta">
              <span class="note-type">${typeLabel}</span>
              <span class="note-time">⏱ ${timeLabel}</span>
            </div>
            <div class="note-content">${n.contentHtml}</div>
          </div>
        </div>`;
    }).join('');

    const safeTitle = props.recordingTitle.replace(/[<>"&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c] ?? c));
    const exportDate = new Date().toLocaleString();

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} — Note</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f1a;color:#e2e8f0;padding:40px 20px;min-height:100vh}
  .page{max-width:720px;margin:0 auto}
  header{margin-bottom:40px;border-bottom:1px solid #2d2d4e;padding-bottom:24px}
  h1{font-size:1.6rem;font-weight:700;color:#a78bfa;margin-bottom:6px}
  .meta{font-size:0.8rem;color:#64748b}
  .timeline{position:relative;padding-left:60px}
  .note-item{position:relative;margin-bottom:32px}
  .note-connector{position:absolute;left:-31px;top:-32px;width:2px;height:calc(100% + 32px);background:linear-gradient(to bottom,#7c3aed55,#4f46e555);border-left:2px dashed #7c3aed55}
  .note-connector.first{top:0;height:100%}
  .note-dot{position:absolute;left:-42px;top:0;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;z-index:1}
  .dot-text{background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;box-shadow:0 0 12px #7c3aed66}
  .dot-screenshot{background:linear-gradient(135deg,#0ea5e9,#7c3aed);color:#fff;box-shadow:0 0 12px #0ea5e966}
  .note-card{background:#1e1e2e;border:1px solid #2d2d4e;border-radius:12px;padding:16px;margin-left:4px}
  .note-meta{display:flex;align-items:center;gap:12px;margin-bottom:12px;font-size:0.75rem}
  .note-type{color:#a78bfa;font-weight:600}
  .note-time{color:#64748b;font-family:monospace}
  .note-content{font-size:0.875rem;line-height:1.6;color:#cbd5e1}
  .note-content img{max-width:100%;border-radius:8px;margin:8px 0;display:block}
  .note-content p{margin-bottom:8px}
  .note-content em{color:#94a3b8}
  footer{margin-top:48px;padding-top:16px;border-top:1px solid #2d2d4e;font-size:0.75rem;color:#374151;text-align:center}
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>${safeTitle}</h1>
    <div class="meta">Esportato il ${exportDate} · ${props.bubbleNotes.length} note</div>
  </header>
  <div class="timeline">${noteItems}</div>
  <footer>Generato da Audio AI Assistant</footer>
</div>
</body>
</html>`;

    const safeName = props.recordingTitle.replace(/[^a-zA-Z0-9_\-À-ÿ ]/g, '').replace(/\s+/g, '_').slice(0, 60) || 'Session';
    // octet-stream: browser honors link.download filename instead of using blob UUID
    saveBlobToFile(new Blob([html], { type: 'application/octet-stream' }), `${safeName}_note.html`);
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
        isSelectMode={isSelectMode}
        selectedNoteIds={selectedNoteIds}
        onToggleSelectNote={(id) => setSelectedNoteIds(prev => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
        })}
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
