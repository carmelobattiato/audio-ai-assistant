import React from 'react';
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
  pendingNoteHtml: _pendingNoteHtml,
  ...toolbarProps
}) => {
  // External content sync (screenshots, file uploads) is handled in useNoteEditor
  // via its own lastOwnHtmlRef. Do NOT sync here to avoid overwriting typed spaces.
  return (
    <div className="flex flex-col border-t border-white/8">
      <NoteFloatingToolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="note-editor-content px-3 py-2 min-h-[108px] max-h-[270px] overflow-y-auto text-sm text-gray-200 focus-within:outline-none bg-white/[0.04]"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            toolbarProps.onAddNote();
          }
        }}
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
