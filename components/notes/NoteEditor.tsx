import React, { useEffect, useRef } from 'react';
import { EditorContent, Editor } from '@tiptap/react';
import { NoteFloatingToolbar } from './NoteFloatingToolbar';
import { NoteStaticToolbar } from './NoteStaticToolbar';

interface NoteEditorProps {
  editor: Editor | null;
  pendingNoteHtml: string;
  isEditorEditable: boolean;
  isScreenSharing: boolean;
  isVideoRecording: boolean;
  videoChunkCount: number;
  isAutoScreenshotOn: boolean;
  countdown: number;
  currentInterval: number;
  parsingMessage: string | null;
  onFileUploadClick: () => void;
  onTakeScreenshot: () => void;
  onToggleAutoScreenshot: () => void;
  onAdjustTiming: (amount: number) => void;
  onStartVideo: () => void;
  onStopVideo: () => void;
  onAddNote: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  editor,
  pendingNoteHtml,
  ...toolbarProps
}) => {
  // Sync external pendingNoteHtml changes (e.g., screenshots from useScreenshotHandler)
  // into the Tiptap editor. We track what we last set ourselves to avoid feedback loops.
  const lastOwnHtmlRef = useRef(pendingNoteHtml);

  useEffect(() => {
    if (!editor) return;
    // If the external HTML differs from what we last emitted, it's an external change (screenshot).
    if (pendingNoteHtml !== lastOwnHtmlRef.current) {
      lastOwnHtmlRef.current = pendingNoteHtml;
      editor.commands.setContent(pendingNoteHtml, { emitUpdate: false }); // don't emit onUpdate
    }
  }, [pendingNoteHtml, editor]);

  // When the editor updates from our own typing, record what we emitted.
  // This is wired via onUpdate in useNoteEditor (Task 8).
  // We expose a setter so useNoteEditor can keep lastOwnHtmlRef in sync.
  // Simpler: NoteEditor just watches pendingNoteHtml and the editor's own HTML.

  return (
    <div className="flex flex-col border-t border-white/8">
      <NoteFloatingToolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="note-editor-content px-3 py-2 min-h-[72px] max-h-[180px] overflow-y-auto text-sm text-gray-200 focus-within:outline-none"
      />
      <NoteStaticToolbar
        isEditorEditable={toolbarProps.isEditorEditable}
        isScreenSharing={toolbarProps.isScreenSharing}
        isVideoRecording={toolbarProps.isVideoRecording}
        videoChunkCount={toolbarProps.videoChunkCount}
        isAutoScreenshotOn={toolbarProps.isAutoScreenshotOn}
        countdown={toolbarProps.countdown}
        currentInterval={toolbarProps.currentInterval}
        parsingMessage={toolbarProps.parsingMessage}
        onFileUploadClick={toolbarProps.onFileUploadClick}
        onTakeScreenshot={toolbarProps.onTakeScreenshot}
        onToggleAutoScreenshot={toolbarProps.onToggleAutoScreenshot}
        onAdjustTiming={toolbarProps.onAdjustTiming}
        onStartVideo={toolbarProps.onStartVideo}
        onStopVideo={toolbarProps.onStopVideo}
        onAddNote={toolbarProps.onAddNote}
      />
    </div>
  );
};
