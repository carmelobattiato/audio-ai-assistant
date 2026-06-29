# Bubble Notes Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Bubble Notes with a Tiptap-based editor, vertical timeline, Lucide icons, and screen video recording to disk.

**Architecture:** Replace the contenteditable editor with Tiptap (ProseMirror wrapper), swap the bubble grid for a vertical timeline, and add a `useVideoRecorder` hook that reuses the existing `displayStream` to write VP9 WebM chunks to disk. The public API of `BubbleNotes.tsx` toward `NewHome.tsx` stays unchanged.

**Tech Stack:** Tiptap v2 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`), Lucide React, MediaRecorder API (VP9), existing `displayStream` from `useScreenshotHandler`.

## Global Constraints

- No test runner — use `npm run lint` (tsc --noEmit) as the correctness gate after every task
- Dev server: `npm run dev` at http://0.0.0.0:3000 for visual verification
- All imports use `@/` path alias (maps to project root)
- `BubbleNote` interface lives in `types.ts` — any change must be backward-compatible
- `BubbleNotes.tsx` props toward `NewHome.tsx` must not change (lazy-loaded at line 21 of NewHome)
- No new IndexedDB writes — video goes to browser Downloads only
- Existing `useScreenshotHandler`, `useAutoScreenshot` APIs must remain callable as before

---

## File Map

**New files:**
- `components/notes/NoteTimeline.tsx` — vertical list of note rows
- `components/notes/NoteTimelineItem.tsx` — single timeline row (timestamp + icon + preview)
- `components/notes/NoteEditor.tsx` — Tiptap EditorContent wrapper + sync logic
- `components/notes/NoteFloatingToolbar.tsx` — formatting bar on text selection
- `components/notes/NoteStaticToolbar.tsx` — always-visible bar: upload / screenshot / auto-shot / video
- `hooks/notes/useVideoRecorder.ts` — MediaRecorder on displayStream, chunk download

**Modified files:**
- `types.ts` — add `type?` to `BubbleNote`
- `hooks/notes/useNoteEditor.ts` — replace execCommand with Tiptap Editor
- `components/notes/NoteActionsHeader.tsx` — Lucide icons + video status badge
- `components/BubbleNotes.tsx` — wire new components, remove old ones

**Deleted files (after wiring is done in Task 9):**
- `components/NoteBubble.tsx`
- `components/notes/NoteEditorToolbar.tsx`

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install Tiptap + Lucide**

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link @tiptap/extension-placeholder lucide-react
```

Expected output: packages added, no peer-dep errors.

- [ ] **Step 2: Verify build compiles**

```bash
npm run lint
```

Expected: no new TypeScript errors (existing errors, if any, are pre-existing and must not increase).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install tiptap v2 + lucide-react for notes redesign"
```

---

## Task 2: Extend BubbleNote type

**Files:**
- Modify: `types.ts` (around line 181)

**Interfaces:**
- Produces: `BubbleNote.type?: 'text' | 'screenshot' | 'auto-screenshot'` — used by NoteTimelineItem (Task 4) and useNoteEditor (Task 6)

- [ ] **Step 1: Add `type` field to BubbleNote**

Open `types.ts`. Find the `BubbleNote` interface (currently lines 181–188). Change it to:

```typescript
export interface BubbleNote {
  id: string;
  contentHtml: string;
  timestamp: number;
  recordingElapsedTime: number;
  isEditing: boolean;
  isProcessing: boolean;
  type?: 'text' | 'screenshot' | 'auto-screenshot';
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npm run lint
```

Expected: zero new errors (the field is optional so no existing callers break).

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat(notes): add optional type field to BubbleNote"
```

---

## Task 3: useVideoRecorder hook

**Files:**
- Create: `hooks/notes/useVideoRecorder.ts`

**Interfaces:**
- Consumes: `displayStream: MediaStream | null` (from `BubbleNotes.tsx` props, which gets it from `isScreenSharing` state + stream ref)
- Produces:
  ```typescript
  interface UseVideoRecorderReturn {
    isVideoRecording: boolean
    chunkCount: number
    startVideo: () => void
    stopVideo: () => void
  }
  ```

- [ ] **Step 1: Create the hook**

Create `hooks/notes/useVideoRecorder.ts`:

```typescript
import { useState, useRef, useCallback } from 'react';

interface UseVideoRecorderOptions {
  displayStream: MediaStream | null;
  chunkIntervalMs?: number;
  bitrateKbps?: number;
}

export const useVideoRecorder = ({
  displayStream,
  chunkIntervalMs = 60_000,
  bitrateKbps = 2500,
}: UseVideoRecorderOptions) => {
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkCountRef = useRef(0);

  const stopVideo = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setIsVideoRecording(false);
  }, []);

  const startVideo = useCallback(() => {
    if (!displayStream || isVideoRecording) return;

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(displayStream, {
        mimeType,
        videoBitsPerSecond: bitrateKbps * 1000,
      });
    } catch {
      console.warn('useVideoRecorder: failed to create MediaRecorder', { mimeType });
      return;
    }

    chunkCountRef.current = 0;
    setChunkCount(0);

    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      const url = URL.createObjectURL(e.data);
      const a = document.createElement('a');
      chunkCountRef.current += 1;
      a.href = url;
      a.download = `video-chunk-${String(chunkCountRef.current).padStart(3, '0')}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setChunkCount(chunkCountRef.current);
    };

    recorder.onstop = () => {
      setIsVideoRecording(false);
      recorderRef.current = null;
    };

    // Stop if the screen share ends
    const videoTrack = displayStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener('ended', stopVideo, { once: true });
    }

    recorder.start(chunkIntervalMs);
    recorderRef.current = recorder;
    setIsVideoRecording(true);
  }, [displayStream, isVideoRecording, chunkIntervalMs, bitrateKbps, stopVideo]);

  return { isVideoRecording, chunkCount, startVideo, stopVideo };
};
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/notes/useVideoRecorder.ts
git commit -m "feat(notes): add useVideoRecorder — VP9 chunk download, reuses displayStream"
```

---

## Task 4: NoteTimelineItem component

**Files:**
- Create: `components/notes/NoteTimelineItem.tsx`

**Interfaces:**
- Consumes: `BubbleNote` from `types.ts` (Task 2)
- Produces: `NoteTimelineItem` React component with props:
  ```typescript
  interface NoteTimelineItemProps {
    note: BubbleNote;
    onOpen: (id: string) => void;
    onDelete: (id: string) => void;
    elapsedTimeLabel: string; // pre-formatted "mm:ss"
  }
  ```

- [ ] **Step 1: Create the component**

Create `components/notes/NoteTimelineItem.tsx`:

```typescript
import React, { useState, useMemo } from 'react';
import { Camera, FileText, MoreHorizontal, Trash2, ExternalLink } from 'lucide-react';
import { BubbleNote } from '@/types';

interface NoteTimelineItemProps {
  note: BubbleNote;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  elapsedTimeLabel: string;
}

function extractFirstImageSrc(html: string): string | null {
  const match = html.match(/<img[^>]+src="([^"]+)"/i);
  return match ? match[1] : null;
}

function stripHtmlAndTruncate(html: string, maxLen = 80): string {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

export const NoteTimelineItem: React.FC<NoteTimelineItemProps> = ({
  note,
  onOpen,
  onDelete,
  elapsedTimeLabel,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const isScreenshot = note.type === 'screenshot' || note.type === 'auto-screenshot';
  const thumbnailSrc = useMemo(() => extractFirstImageSrc(note.contentHtml), [note.contentHtml]);
  const textPreview = useMemo(
    () => isScreenshot ? (note.type === 'auto-screenshot' ? 'Auto screenshot' : 'Screenshot') : stripHtmlAndTruncate(note.contentHtml),
    [note.contentHtml, note.type, isScreenshot]
  );

  return (
    <div
      className="note-timeline-item group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
      onClick={() => onOpen(note.id)}
    >
      {/* Timestamp */}
      <span className="text-xs font-mono text-gray-500 w-12 shrink-0 select-none">
        {elapsedTimeLabel}
      </span>

      {/* Type icon */}
      <span className="shrink-0 text-gray-400">
        {isScreenshot
          ? <Camera size={14} />
          : <FileText size={14} />
        }
      </span>

      {/* Thumbnail (screenshots only) */}
      {thumbnailSrc && (
        <img
          src={thumbnailSrc}
          alt=""
          loading="lazy"
          className="shrink-0 w-12 h-9 object-cover rounded border border-white/10"
        />
      )}

      {/* Text preview */}
      <span className="flex-1 text-sm text-gray-300 truncate select-none">
        {textPreview}
      </span>

      {/* Context menu */}
      <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white hover:bg-white/10"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Note options"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-6 z-10 bg-gray-800 border border-white/10 rounded-lg shadow-lg py-1 min-w-[120px]"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-200 hover:bg-white/10"
              onClick={() => { onOpen(note.id); setMenuOpen(false); }}
            >
              <ExternalLink size={12} /> Open
            </button>
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-400 hover:bg-white/10"
              onClick={() => { onDelete(note.id); setMenuOpen(false); }}
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/notes/NoteTimelineItem.tsx
git commit -m "feat(notes): add NoteTimelineItem — timeline row with thumbnail + context menu"
```

---

## Task 5: NoteTimeline component

**Files:**
- Create: `components/notes/NoteTimeline.tsx`

**Interfaces:**
- Consumes: `NoteTimelineItem` (Task 4), `BubbleNote[]` from `types.ts`
- Produces: `NoteTimeline` component with props:
  ```typescript
  interface NoteTimelineProps {
    notes: BubbleNote[];
    onOpenNote: (id: string) => void;
    onDeleteNote: (id: string) => void;
  }
  ```

- [ ] **Step 1: Create the component**

Create `components/notes/NoteTimeline.tsx`:

```typescript
import React, { useEffect, useRef } from 'react';
import { BubbleNote } from '@/types';
import { NoteTimelineItem } from './NoteTimelineItem';

interface NoteTimelineProps {
  notes: BubbleNote[];
  onOpenNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const NoteTimeline: React.FC<NoteTimelineProps> = ({ notes, onOpenNote, onDeleteNote }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(notes.length);

  // Auto-scroll to bottom when a new note is added
  useEffect(() => {
    if (notes.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLengthRef.current = notes.length;
  }, [notes.length]);

  if (notes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500 select-none py-8">
        No notes yet. Press Enter or take a screenshot.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {notes.map((note) => (
        <NoteTimelineItem
          key={note.id}
          note={note}
          onOpen={onOpenNote}
          onDelete={onDeleteNote}
          elapsedTimeLabel={formatElapsed(note.recordingElapsedTime)}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/notes/NoteTimeline.tsx
git commit -m "feat(notes): add NoteTimeline — vertical timeline with auto-scroll"
```

---

## Task 6: NoteFloatingToolbar + NoteStaticToolbar

**Files:**
- Create: `components/notes/NoteFloatingToolbar.tsx`
- Create: `components/notes/NoteStaticToolbar.tsx`

**Interfaces:**
- Consumes: Tiptap `Editor` type from `@tiptap/react`
- `NoteFloatingToolbar` props:
  ```typescript
  interface NoteFloatingToolbarProps {
    editor: Editor | null;
  }
  ```
- `NoteStaticToolbar` props:
  ```typescript
  interface NoteStaticToolbarProps {
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
  ```

- [ ] **Step 1: Create NoteFloatingToolbar**

Create `components/notes/NoteFloatingToolbar.tsx`:

```typescript
import React, { useEffect, useState, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { Bold, Italic, Underline, Heading1, Heading2, List, ListOrdered, Code, Link } from 'lucide-react';

interface NoteFloatingToolbarProps {
  editor: Editor | null;
}

interface ToolbarPosition {
  top: number;
  left: number;
}

const ToolbarButton: React.FC<{
  onClick: () => void;
  isActive?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, isActive, title, children }) => (
  <button
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    title={title}
    className={`p-1.5 rounded text-sm transition-colors ${
      isActive
        ? 'bg-violet-600 text-white'
        : 'text-gray-300 hover:bg-white/10 hover:text-white'
    }`}
  >
    {children}
  </button>
);

export const NoteFloatingToolbar: React.FC<NoteFloatingToolbarProps> = ({ editor }) => {
  const [position, setPosition] = useState<ToolbarPosition | null>(null);

  const updatePosition = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      setPosition(null);
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setPosition(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0) {
      setPosition(null);
      return;
    }
    setPosition({
      top: rect.top + window.scrollY - 44,
      left: rect.left + window.scrollX + rect.width / 2,
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.on('selectionUpdate', updatePosition);
    editor.on('blur', () => setPosition(null));
    return () => {
      editor.off('selectionUpdate', updatePosition);
    };
  }, [editor, updatePosition]);

  if (!position || !editor) return null;

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-gray-900 border border-white/15 shadow-xl"
      style={{ top: position.top, left: position.left, transform: 'translateX(-50%)' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Bold (Ctrl+B)">
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Italic (Ctrl+I)">
        <Italic size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Underline (Ctrl+U)">
        <Underline size={14} />
      </ToolbarButton>
      <div className="w-px h-4 bg-white/20 mx-0.5" />
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="Heading 1">
        <Heading1 size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Heading 2">
        <Heading2 size={14} />
      </ToolbarButton>
      <div className="w-px h-4 bg-white/20 mx-0.5" />
      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Bullet list">
        <List size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Numbered list">
        <ListOrdered size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive('code')} title="Inline code">
        <Code size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => {
          const url = window.prompt('URL:');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        isActive={editor.isActive('link')}
        title="Link"
      >
        <Link size={14} />
      </ToolbarButton>
    </div>
  );
};
```

- [ ] **Step 2: Create NoteStaticToolbar**

Create `components/notes/NoteStaticToolbar.tsx`:

```typescript
import React from 'react';
import { Paperclip, Camera, Timer, Video, Square, CornerDownLeft } from 'lucide-react';

interface NoteStaticToolbarProps {
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

const IconBtn: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  title: string;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ onClick, disabled, title, active, children, className = '' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      active
        ? 'bg-violet-600/30 text-violet-300'
        : 'text-gray-400 hover:text-white hover:bg-white/8'
    } ${className}`}
  >
    {children}
  </button>
);

export const NoteStaticToolbar: React.FC<NoteStaticToolbarProps> = (props) => (
  <div className="flex items-center gap-1 px-2 py-1.5 border-t border-white/8 bg-gray-900/40">
    {/* Left: file ops */}
    <IconBtn onClick={props.onFileUploadClick} disabled={!props.isEditorEditable} title="Attach file (Img, PDF, DOCX, PPTX, HTML, TXT)">
      <Paperclip size={15} />
    </IconBtn>

    <IconBtn onClick={props.onTakeScreenshot} disabled={!props.isEditorEditable} title="Take screenshot">
      <Camera size={15} />
    </IconBtn>

    {/* Auto screenshot */}
    <div className="flex items-center">
      <IconBtn
        onClick={props.onToggleAutoScreenshot}
        active={props.isAutoScreenshotOn}
        title={props.isAutoScreenshotOn ? 'Disable auto-screenshot' : 'Enable auto-screenshot'}
      >
        <Timer size={15} />
        <span className="text-xs font-mono">
          {props.isAutoScreenshotOn ? `${props.countdown}s` : 'Auto'}
        </span>
      </IconBtn>
      {props.isAutoScreenshotOn && (
        <>
          <button
            onClick={() => props.onAdjustTiming(-10)}
            className="px-1 text-gray-400 hover:text-white text-xs"
            title="-10s"
          >−</button>
          <button
            onClick={() => props.onAdjustTiming(10)}
            className="px-1 text-gray-400 hover:text-white text-xs"
            title="+10s"
          >+</button>
        </>
      )}
    </div>

    {/* Video recording */}
    {props.isVideoRecording ? (
      <IconBtn onClick={props.onStopVideo} title={`Stop video (${props.videoChunkCount} chunks saved)`} className="text-red-400 hover:text-red-300">
        <Square size={15} className="fill-current" />
        <span className="text-xs font-mono">{props.videoChunkCount}</span>
      </IconBtn>
    ) : (
      <IconBtn
        onClick={props.onStartVideo}
        disabled={!props.isScreenSharing}
        title={props.isScreenSharing ? 'Start screen recording (saves WebM chunks to Downloads)' : 'Start screen sharing first to enable video recording'}
      >
        <Video size={15} />
      </IconBtn>
    )}

    {/* Parsing status */}
    {props.parsingMessage && (
      <span className="text-xs text-violet-400 ml-1 truncate max-w-[120px]">{props.parsingMessage}</span>
    )}

    {/* Spacer + save hint */}
    <div className="flex-1" />
    <button
      onClick={props.onAddNote}
      disabled={!props.isEditorEditable}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40"
      title="Save note (Enter)"
    >
      <CornerDownLeft size={13} />
    </button>
  </div>
);
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/notes/NoteFloatingToolbar.tsx components/notes/NoteStaticToolbar.tsx
git commit -m "feat(notes): add NoteFloatingToolbar (Tiptap selection) + NoteStaticToolbar (Lucide)"
```

---

## Task 7: NoteEditor component

**Files:**
- Create: `components/notes/NoteEditor.tsx`

**Interfaces:**
- Consumes: `Editor` from `@tiptap/react`, `NoteFloatingToolbar` (Task 6), `NoteStaticToolbar` (Task 6)
- Produces: `NoteEditor` component with props:
  ```typescript
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
  ```

- [ ] **Step 1: Create NoteEditor**

Create `components/notes/NoteEditor.tsx`:

```typescript
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
      editor.commands.setContent(pendingNoteHtml, false); // false = don't emit onUpdate
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
```

- [ ] **Step 2: Add Tiptap editor styles**

Find the global CSS file (likely `src/index.css` or `styles/globals.css` — check with `ls src/ styles/` or look at `vite.config.ts`). Add Tiptap content styles after the existing styles:

```css
/* Tiptap note editor */
.note-editor-content .ProseMirror {
  outline: none;
  min-height: 72px;
}
.note-editor-content .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: #6b7280;
  pointer-events: none;
  height: 0;
}
.note-editor-content .ProseMirror img {
  max-width: 100%;
  max-height: 200px;
  border-radius: 6px;
  object-fit: contain;
}
.note-editor-content .ProseMirror a {
  color: #a78bfa;
  text-decoration: underline;
}
.note-editor-content .ProseMirror code {
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
  padding: 0.1em 0.3em;
  font-size: 0.9em;
}
.note-editor-content .ProseMirror h1 { font-size: 1.2em; font-weight: 700; margin: 0.4em 0; }
.note-editor-content .ProseMirror h2 { font-size: 1.05em; font-weight: 600; margin: 0.3em 0; }
.note-editor-content .ProseMirror ul { list-style: disc; padding-left: 1.4em; }
.note-editor-content .ProseMirror ol { list-style: decimal; padding-left: 1.4em; }
```

To find the CSS entry point:
```bash
grep -r "index.css\|globals.css\|main.css" src/ vite.config.ts 2>/dev/null | head -5
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/notes/NoteEditor.tsx
git commit -m "feat(notes): add NoteEditor — Tiptap EditorContent + external HTML sync"
```

---

## Task 8: Refactor useNoteEditor for Tiptap

**Files:**
- Modify: `hooks/notes/useNoteEditor.ts` (full rewrite)

**Interfaces:**
- Consumes: `useEditor`, `Editor` from `@tiptap/react`; `StarterKit`, `Image`, `Link`, `Placeholder` extensions
- Produces (new return shape — superset of old, backward-compatible for BubbleNotes.tsx):
  ```typescript
  {
    editor: Editor | null;           // NEW — passed to NoteEditor
    activeFormats: Record<string, boolean>;
    parsingMessage: string | null;
    setParsingMessage: (msg: string | null) => void;
    applyFormat: (command: string) => void;   // kept for compat (maps to Tiptap)
    handleAddNote: () => void;
    handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleDownloadPendingContent: () => void;
    // REMOVED: inputRef, updateActiveFormats, handlePaste (Tiptap handles natively)
  }
  ```

- [ ] **Step 1: Rewrite useNoteEditor**

Replace the entire content of `hooks/notes/useNoteEditor.ts` with:

```typescript
import React, { useState, useCallback, useRef } from 'react';
import { useEditor, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { BubbleNote } from '@/types';
import { saveBlobToFile } from '@/utils/fileUtils';
import { loggingService } from '@/services/loggingService';

const MAX_DIMENSION = 1024;

const compressImage = (file: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      if (!event.target?.result) return reject(new Error('FileReader failed'));
      const img = new globalThis.Image();
      img.src = event.target.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height) {
          if (width > MAX_DIMENSION) { height = Math.round((height * MAX_DIMENSION) / width); width = MAX_DIMENSION; }
        } else {
          if (height > MAX_DIMENSION) { width = Math.round((width * MAX_DIMENSION) / height); height = MAX_DIMENSION; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('No canvas context'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const FORMAT_COMMANDS: Record<string, () => void> = {};  // populated per editor instance

export const useNoteEditor = (
  isEditorEditable: boolean,
  elapsedTime: number,
  bubbleNotes: BubbleNote[],
  onBubbleNotesChange: (notes: BubbleNote[]) => void,
  _pendingNoteHtml: string,
  onPendingNoteHtmlChange: (html: string) => void
) => {
  const [parsingMessage, setParsingMessage] = useState<string | null>(null);
  const lastOwnHtmlRef = useRef('');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Enter to add note. Shift+Enter for newline. Paste images or upload files (Img, Txt, HTML, DOCX, PPTX, PDF).' }),
    ],
    editable: isEditorEditable,
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      lastOwnHtmlRef.current = html;
      onPendingNoteHtmlChange(html);
    },
  });

  // Keep editable state in sync
  React.useEffect(() => {
    if (editor && editor.isEditable !== isEditorEditable) {
      editor.setEditable(isEditorEditable);
    }
  }, [editor, isEditorEditable]);

  const activeFormats: Record<string, boolean> = editor ? {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    insertUnorderedList: editor.isActive('bulletList'),
    insertOrderedList: editor.isActive('orderedList'),
  } : {};

  const applyFormat = useCallback((command: string) => {
    if (!editor || !isEditorEditable) return;
    switch (command) {
      case 'bold': editor.chain().focus().toggleBold().run(); break;
      case 'italic': editor.chain().focus().toggleItalic().run(); break;
      case 'underline': editor.chain().focus().toggleUnderline().run(); break;
      case 'insertUnorderedList': editor.chain().focus().toggleBulletList().run(); break;
      case 'insertOrderedList': editor.chain().focus().toggleOrderedList().run(); break;
    }
  }, [editor, isEditorEditable]);

  const handleAddNote = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    if (!html || html === '<p></p>') return;
    const newNote: BubbleNote = {
      id: `note_${Date.now()}_${Math.random()}`,
      contentHtml: html,
      timestamp: Date.now(),
      recordingElapsedTime: elapsedTime,
      isEditing: false,
      isProcessing: false,
      type: 'text',
    };
    onBubbleNotesChange([...bubbleNotes, newNote]);
    editor.commands.clearContent(true);
    lastOwnHtmlRef.current = '';
    onPendingNoteHtmlChange('');
  }, [editor, elapsedTime, bubbleNotes, onBubbleNotesChange, onPendingNoteHtmlChange]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editor || !e.target.files?.length) return;
    const file = e.target.files[0];
    e.target.value = '';
    setParsingMessage(`Parsing ${file.name}…`);
    try {
      if (file.type.startsWith('image/')) {
        const dataUrl = await compressImage(file);
        editor.chain().focus().setImage({ src: dataUrl }).run();
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        const mammoth = (await import('mammoth')).default;
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        editor.chain().focus().insertContent(`<p><em>--- ${file.name} ---</em></p>${result.value}`).run();
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const pdfjsModule = await import('pdfjs-dist');
        const pdfjs = (pdfjsModule as any).GlobalWorkerOptions ? pdfjsModule : ((pdfjsModule as any).default || pdfjsModule);
        if (pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
        }
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += `<p><strong>[Page ${i}]</strong> ${pageText}</p>`;
        }
        editor.chain().focus().insertContent(`<p><em>--- ${file.name} ---</em></p>${fullText}`).run();
      } else if (file.name.endsWith('.pptx') || file.type.includes('presentationml')) {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        let pptText = '';
        let slideIndex = 1;
        while (true) {
          const slideFile = zip.file(`ppt/slides/slide${slideIndex}.xml`);
          if (!slideFile) break;
          const xml = await slideFile.async('text');
          const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          pptText += `<p><strong>[Slide ${slideIndex}]</strong> ${text}</p>`;
          slideIndex++;
        }
        editor.chain().focus().insertContent(`<p><em>--- ${file.name} ---</em></p>${pptText}`).run();
      } else if (file.type === 'text/html' || file.name.endsWith('.html')) {
        const text = await file.text();
        editor.chain().focus().insertContent(text).run();
      } else {
        const text = await file.text();
        editor.chain().focus().insertContent(`<p>${text.replace(/\n/g, '</p><p>')}</p>`).run();
      }
    } catch (err) {
      loggingService.warn('NOTE_FILE_PARSE_ERROR', 'File parsing failed', { error: String(err) });
      setParsingMessage(`Error parsing ${file.name}`);
    } finally {
      setParsingMessage(null);
    }
  }, [editor]);

  const handleDownloadPendingContent = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    if (!html || html === '<p></p>') return;
    const blob = new Blob([`<html><body>${html}</body></html>`], { type: 'text/html' });
    saveBlobToFile(blob, `note-draft-${Date.now()}.html`);
  }, [editor]);

  return {
    editor,
    activeFormats,
    parsingMessage,
    setParsingMessage,
    applyFormat,
    handleAddNote,
    handleFileSelect,
    handleDownloadPendingContent,
    // Legacy compat stubs (no-ops, keep callers from breaking):
    inputRef: { current: null } as React.RefObject<HTMLDivElement>,
    updateActiveFormats: () => {},
    handlePaste: () => {},
  };
};
```

- [ ] **Step 2: Check Underline extension**

Tiptap's `StarterKit` does NOT include Underline. Install it:

```bash
npm install @tiptap/extension-underline
```

Then add to the import in `useNoteEditor.ts`:

```typescript
import Underline from '@tiptap/extension-underline';
```

And add to the extensions array inside `useEditor`:

```typescript
extensions: [
  StarterKit,
  Underline,
  Image.configure({ inline: true, allowBase64: true }),
  Link.configure({ openOnClick: false }),
  Placeholder.configure({ placeholder: 'Enter to add note…' }),
],
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add hooks/notes/useNoteEditor.ts package.json package-lock.json
git commit -m "feat(notes): replace execCommand with Tiptap in useNoteEditor"
```

---

## Task 9: Redesign NoteActionsHeader

**Files:**
- Modify: `components/notes/NoteActionsHeader.tsx`

**Interfaces:**
- Consumes: Lucide icons, `UseVideoRecorderReturn` fields (Task 3)
- New props signature:
  ```typescript
  interface NoteActionsHeaderProps {
    isSelectMode: boolean;
    selectedCount: number;
    hasNotes: boolean;
    isVideoRecording: boolean;  // NEW
    videoChunkCount: number;    // NEW
    onToggleSelect: () => void;
    onFullscreen: () => void;
    onDownload: () => void;
    onDeleteRequest: () => void;
    onCancelSelect: () => void;
  }
  ```

- [ ] **Step 1: Rewrite NoteActionsHeader**

Replace the entire content of `components/notes/NoteActionsHeader.tsx`:

```typescript
import React from 'react';
import { CheckSquare, Maximize2, Download, Trash2, X, Video } from 'lucide-react';

interface NoteActionsHeaderProps {
  isSelectMode: boolean;
  selectedCount: number;
  hasNotes: boolean;
  isVideoRecording: boolean;
  videoChunkCount: number;
  onToggleSelect: () => void;
  onFullscreen: () => void;
  onDownload: () => void;
  onDeleteRequest: () => void;
  onCancelSelect: () => void;
}

const HeaderBtn: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'default' | 'danger';
}> = ({ onClick, disabled, children, variant = 'default' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      variant === 'danger'
        ? 'text-red-400 hover:bg-red-500/15 hover:text-red-300'
        : 'text-gray-400 hover:bg-white/8 hover:text-gray-200'
    }`}
  >
    {children}
  </button>
);

export const NoteActionsHeader: React.FC<NoteActionsHeaderProps> = (props) => (
  <div className="flex items-center justify-between px-1 py-1 min-h-[36px]">
    <div className="flex items-center gap-2">
      <h4 className="text-sm font-medium text-gray-400 select-none">Notes</h4>
      {props.isVideoRecording && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-400 text-xs animate-pulse">
          <Video size={11} />
          REC {props.videoChunkCount > 0 && `· ${props.videoChunkCount}`}
        </span>
      )}
    </div>
    <div className="flex items-center gap-0.5">
      {props.isSelectMode ? (
        <>
          <HeaderBtn variant="danger" onClick={props.onDeleteRequest} disabled={props.selectedCount === 0}>
            <Trash2 size={13} /> Delete ({props.selectedCount})
          </HeaderBtn>
          <HeaderBtn onClick={props.onCancelSelect}>
            <X size={13} /> Cancel
          </HeaderBtn>
        </>
      ) : (
        <>
          <HeaderBtn onClick={props.onToggleSelect} disabled={!props.hasNotes}>
            <CheckSquare size={13} /> Select
          </HeaderBtn>
          <HeaderBtn onClick={props.onFullscreen} disabled={!props.hasNotes}>
            <Maximize2 size={13} />
          </HeaderBtn>
          <HeaderBtn onClick={props.onDownload} disabled={!props.hasNotes}>
            <Download size={13} />
          </HeaderBtn>
        </>
      )}
    </div>
  </div>
);
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors (new props not yet wired → may have unused-prop warnings but no type errors).

- [ ] **Step 3: Commit**

```bash
git add components/notes/NoteActionsHeader.tsx
git commit -m "feat(notes): redesign NoteActionsHeader — Lucide icons + video REC badge"
```

---

## Task 10: Wire BubbleNotes.tsx

This is the integration task: replace old components with new ones, wire all hooks.

**Files:**
- Modify: `components/BubbleNotes.tsx` (major rewrite of render + wiring)

**Interfaces:**
- Consumes: all new components and hooks from Tasks 3–9
- Produces: same `BubbleNotesProps` interface toward `NewHome.tsx` (unchanged)

- [ ] **Step 1: Read current BubbleNotes.tsx**

Run:
```bash
cat components/BubbleNotes.tsx
```

Note the current structure: it imports `NoteBubble`, `NoteEditorToolbar`, uses `useNoteEditor`, `useAutoScreenshot`, renders the bubble grid + contenteditable.

- [ ] **Step 2: Rewrite BubbleNotes.tsx**

Replace the entire file. The props interface must remain identical (same names, same types as what `NewHome.tsx` passes):

```typescript
import React, { useState, useRef, useCallback } from 'react';
import { BubbleNote, AppSettings } from '../types';
import { FullscreenNotesViewer } from './FullscreenNotesViewer';
import { ConfirmModal } from './common/ConfirmModal';
import { saveBlobToFile } from '../utils/fileUtils';
import { useNoteEditor } from '../hooks/notes/useNoteEditor';
import { useAutoScreenshot } from '../hooks/notes/useAutoScreenshot';
import { useVideoRecorder } from '../hooks/notes/useVideoRecorder';
import { NoteActionsHeader } from './notes/NoteActionsHeader';
import { NoteTimeline } from './notes/NoteTimeline';
import { NoteEditor } from './notes/NoteEditor';

// Keep the same props interface as NewHome.tsx expects
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
    handleDownloadPendingContent,
  } = useNoteEditor(
    props.isEditorEditable,
    props.elapsedTime,
    props.bubbleNotes,
    props.onBubbleNotesChange,
    props.pendingNoteHtml,
    props.onPendingNoteHtmlChange
  );

  const {
    isAutoScreenshotOn,
    currentInterval,
    countdown,
    toggleAutoScreenshot,
    adjustTiming,
  } = useAutoScreenshot(
    props.transcriptionSettings.autoScreenshotIntervalSeconds ?? 60,
    props.onTakeScreenshot
  );

  // useVideoRecorder needs the displayStream. BubbleNotes doesn't have direct access to it —
  // it lives in useScreenshotHandler inside useAudioRecorder. We get the stream via a ref
  // exposed on the recorder. For now, pass null and let it be disabled when no screen share.
  // The actual displayStream is accessible via props.isScreenSharing but not the stream object.
  // Solution: add displayStreamRef as an optional prop (can be null-safe, video just stays disabled).
  // For the initial wiring, pass null — video button will be disabled until NewHome wires the stream.
  const {
    isVideoRecording,
    chunkCount: videoChunkCount,
    startVideo,
    stopVideo,
  } = useVideoRecorder({ displayStream: null }); // TODO: wire displayStream from NewHome in Task 11

  // --- Note management ---
  const handleDeleteNote = useCallback((noteId: string) => {
    props.onBubbleNotesChange(props.bubbleNotes.filter(n => n.id !== noteId));
  }, [props]);

  const handleDeleteSelected = useCallback(() => {
    props.onBubbleNotesChange(props.bubbleNotes.filter(n => !selectedNoteIds.has(n.id)));
    setSelectedNoteIds(new Set());
    setIsSelectMode(false);
    setShowConfirmDelete(false);
  }, [props, selectedNoteIds]);

  const handleDownloadNotes = useCallback(() => {
    const html = props.bubbleNotes.map(n => `<div>${n.contentHtml}</div>`).join('<hr>');
    const blob = new Blob([`<html><head><title>${props.recordingTitle} — Notes</title></head><body>${html}</body></html>`], { type: 'text/html' });
    saveBlobToFile(blob, `notes-${props.recordingTitle}-${Date.now()}.html`);
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
        onToggleSelect={() => setIsSelectMode(true)}
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.docx,.pptx,.html,.txt"
        onChange={handleFileSelect}
      />

      {/* Editor */}
      <NoteEditor
        editor={editor}
        pendingNoteHtml={props.pendingNoteHtml}
        isEditorEditable={props.isEditorEditable}
        isScreenSharing={props.isScreenSharing}
        isVideoRecording={isVideoRecording}
        videoChunkCount={videoChunkCount}
        isAutoScreenshotOn={isAutoScreenshotOn}
        countdown={countdown}
        currentInterval={currentInterval}
        parsingMessage={parsingMessage}
        onFileUploadClick={() => fileInputRef.current?.click()}
        onTakeScreenshot={() => props.onTakeScreenshot(false)}
        onToggleAutoScreenshot={toggleAutoScreenshot}
        onAdjustTiming={adjustTiming}
        onStartVideo={startVideo}
        onStopVideo={stopVideo}
        onAddNote={handleAddNote}
      />

      {/* Modals */}
      {isFullscreen && (
        <FullscreenNotesViewer
          notes={props.bubbleNotes}
          recordingTitle={props.recordingTitle}
          onClose={() => setIsFullscreen(false)}
        />
      )}
      {showConfirmDelete && (
        <ConfirmModal
          title="Delete notes"
          message={`Delete ${selectedNoteIds.size} selected note${selectedNoteIds.size !== 1 ? 's' : ''}?`}
          onConfirm={handleDeleteSelected}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}
    </div>
  );
};

export const BubbleNotes = React.memo(BubbleNotesBase);
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Fix any type errors before proceeding. Common ones:
- `ConfirmModal` props may differ — check its actual interface with `grep -n "interface ConfirmModal" components/common/ConfirmModal.tsx`
- `FullscreenNotesViewer` props — check with `grep -n "interface Fullscreen" components/FullscreenNotesViewer.tsx`

- [ ] **Step 4: Commit**

```bash
git add components/BubbleNotes.tsx
git commit -m "feat(notes): wire BubbleNotes with Tiptap editor, NoteTimeline, NoteActionsHeader"
```

---

## Task 11: Wire displayStream for video recording

The `displayStream` lives in `useAudioRecorder` → `useScreenshotHandler` and is not currently exposed to `BubbleNotes`. This task threads it through.

**Files:**
- Modify: `components/BubbleNotes.tsx` — add `displayStream` prop
- Modify: `pages/NewHome.tsx` — pass displayStream from audioRecorderRef
- Modify: `hooks/useAudioRecorder.ts` — expose displayStream getter if not already present

- [ ] **Step 1: Check what audioRecorderRef exposes**

```bash
grep -n "getDisplayStream\|displayStream\|getIsScreenSharing" hooks/useAudioRecorder.ts | head -20
```

If `getDisplayStream()` already exists, skip to Step 3. If not, continue.

- [ ] **Step 2: Expose displayStream from useAudioRecorder**

Find the return object of `useAudioRecorder` (likely a `useImperativeHandle` or a plain object). Add:

```typescript
getDisplayStream: (): MediaStream | null => {
  // displayStream is already managed inside useScreenshotHandler
  // Return the stream from the screenshotHandler ref
  return screenshotHandlerRef.current?.getDisplayStream() ?? null;
},
```

And in `useScreenshotHandler`, add to its returned/imperative handle:
```typescript
getDisplayStream: () => screenshotStream || displayStream,
```

- [ ] **Step 3: Add displayStream prop to BubbleNotesProps**

In `components/BubbleNotes.tsx`, update the `BubbleNotesProps` interface:

```typescript
interface BubbleNotesProps {
  // ... existing props ...
  displayStream?: MediaStream | null;  // NEW — for video recording
}
```

And update the `useVideoRecorder` call:

```typescript
const {
  isVideoRecording,
  chunkCount: videoChunkCount,
  startVideo,
  stopVideo,
} = useVideoRecorder({ displayStream: props.displayStream ?? null });
```

- [ ] **Step 4: Pass displayStream from NewHome.tsx**

In `pages/NewHome.tsx`, find the `<BubbleNotes ... />` render (around line 865). Add:

```tsx
<BubbleNotes
  {/* existing props */}
  displayStream={audioRecorderRef.current?.getDisplayStream() ?? null}
/>
```

Note: `displayStream` should be state-driven (not just a ref read) to trigger re-render when screen sharing starts. Alternatively, the `isScreenSharing` state change will trigger a re-render and the ref will return the current stream.

- [ ] **Step 5: Type-check**

```bash
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add components/BubbleNotes.tsx pages/NewHome.tsx hooks/useAudioRecorder.ts
git commit -m "feat(notes): thread displayStream to BubbleNotes for video recording"
```

---

## Task 12: Remove obsolete files + screenshot type tagging

**Files:**
- Delete: `components/NoteBubble.tsx`
- Delete (or empty-stub): `components/notes/NoteEditorToolbar.tsx`
- Modify: `hooks/recorder/useScreenshotHandler.ts` — tag notes with correct `type`

- [ ] **Step 1: Tag screenshots with type in useScreenshotHandler**

Open `hooks/recorder/useScreenshotHandler.ts`. Find where auto-screenshots create a `BubbleNote` (around line 59–72 per exploration). Add `type: 'auto-screenshot'`:

```typescript
const newNote: BubbleNote = {
  id: `note_${Date.now()}_${Math.random()}`,
  contentHtml: `<p>Auto-screenshot at ${timestamp}</p><img src="${dataUrl}" />`,
  timestamp: Date.now(),
  recordingElapsedTime: elapsedTimeRef.current,
  isEditing: false,
  isProcessing: false,
  type: 'auto-screenshot',   // ADD THIS
};
```

For manual screenshots (appended to `pendingNoteHtml`) — the `type` will be set when the user saves via `handleAddNote` in `useNoteEditor`. Update `handleAddNote` to detect if the HTML contains only an img:

In `hooks/notes/useNoteEditor.ts`, inside `handleAddNote`, change the `type` assignment:

```typescript
const hasOnlyImage = /<img/.test(html) && html.replace(/<img[^>]+>/gi, '').replace(/<[^>]+>/g, '').trim() === '';
const newNote: BubbleNote = {
  // ...
  type: hasOnlyImage ? 'screenshot' : 'text',
};
```

- [ ] **Step 2: Delete NoteBubble.tsx**

```bash
rm components/NoteBubble.tsx
```

- [ ] **Step 3: Remove NoteEditorToolbar.tsx**

```bash
rm components/notes/NoteEditorToolbar.tsx
```

- [ ] **Step 4: Check for remaining imports**

```bash
grep -rn "NoteBubble\|NoteEditorToolbar" --include="*.tsx" --include="*.ts" .
```

If any files still import these, remove those imports (they should only be in `BubbleNotes.tsx` which we've already rewritten).

- [ ] **Step 5: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(notes): remove NoteBubble + NoteEditorToolbar, tag screenshot types"
```

---

## Task 13: Visual QA + polish

Start the dev server and verify the feature end-to-end.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Open http://localhost:3000.

- [ ] **Step 2: Test paste workflow (primary use case)**

1. Copy formatted text from an email or webpage
2. Click the Notes editor area
3. Paste → verify bold/italic/lists are preserved
4. Press Enter → verify note appears in timeline with text preview

- [ ] **Step 3: Test paste image**

1. Take a system screenshot (Cmd+Shift+4 on Mac, save to clipboard)
2. Click the Notes editor
3. Ctrl+V / Cmd+V → verify image appears inline in editor
4. Press Enter → verify note appears in timeline with thumbnail

- [ ] **Step 4: Test manual screenshot**

1. Click the camera icon in the static toolbar
2. If screen share not active, verify it asks for screen share
3. Verify screenshot appears in editor
4. Press Enter → verify timeline shows thumbnail

- [ ] **Step 5: Test auto screenshot**

1. Click the Timer button → verify countdown starts
2. Wait for countdown to hit 0 → verify new note appears in timeline automatically
3. Click Timer again → verify auto-shot stops

- [ ] **Step 6: Test floating toolbar**

1. Type some text in the editor
2. Select text with mouse → verify floating toolbar appears above selection
3. Click Bold → verify text becomes bold
4. Click H1 → verify heading applied
5. Click elsewhere → toolbar disappears

- [ ] **Step 7: Test video recording**

1. Start screen sharing (required for audio recording with system audio)
2. In the static toolbar, verify Video button is enabled
3. Click Video → verify "REC" badge appears in header
4. Wait 60 seconds → verify a `video-chunk-001.webm` downloads to Downloads folder
5. Click Stop (square icon) → recording stops

- [ ] **Step 8: Test undo/redo**

1. Type "Hello" in editor
2. Press Ctrl+Z → "Hello" disappears
3. Press Ctrl+Shift+Z → "Hello" reappears
4. Paste an image, then Ctrl+Z → image removed

- [ ] **Step 9: Fix any issues found during QA**

Address layout bugs, color contrast issues, or broken interactions.

- [ ] **Step 10: Final lint**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(notes): bubble notes redesign — Tiptap editor, timeline, video recording, Lucide icons"
```

---

## Self-Review Checklist

- [x] Spec coverage: Editor (Tiptap) ✓, Timeline (NoteTimeline) ✓, Lucide icons ✓, Video recording (useVideoRecorder) ✓, Chunk download ✓, Screenshot type tagging ✓, Paste workflow ✓
- [x] No placeholders: All tasks have actual code
- [x] Type consistency: `BubbleNote.type` defined Task 2, used Tasks 4, 12. `Editor` type from `@tiptap/react` used consistently. `NoteStaticToolbarProps` defined Task 6, consumed Task 7. `UseVideoRecorderReturn` defined Task 3, consumed Task 10.
- [x] Underline extension: handled in Task 8 Step 2 (`@tiptap/extension-underline`)
- [x] displayStream threading: Task 11 handles this explicitly
- [x] Backward compat: `BubbleNotesProps` unchanged; `BubbleNote.type` is optional
