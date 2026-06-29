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
      <ToolbarButton onClick={() => (editor.chain().focus() as any).toggleBold().run()} isActive={editor.isActive('bold')} title="Bold (Ctrl+B)">
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => (editor.chain().focus() as any).toggleItalic().run()} isActive={editor.isActive('italic')} title="Italic (Ctrl+I)">
        <Italic size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => (editor.chain().focus() as any).toggleUnderline().run()} isActive={editor.isActive('underline')} title="Underline (Ctrl+U)">
        <Underline size={14} />
      </ToolbarButton>
      <div className="w-px h-4 bg-white/20 mx-0.5" />
      <ToolbarButton onClick={() => (editor.chain().focus() as any).toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="Heading 1">
        <Heading1 size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => (editor.chain().focus() as any).toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Heading 2">
        <Heading2 size={14} />
      </ToolbarButton>
      <div className="w-px h-4 bg-white/20 mx-0.5" />
      <ToolbarButton onClick={() => (editor.chain().focus() as any).toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Bullet list">
        <List size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => (editor.chain().focus() as any).toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Numbered list">
        <ListOrdered size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => (editor.chain().focus() as any).toggleCode().run()} isActive={editor.isActive('code')} title="Inline code">
        <Code size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => {
          const url = window.prompt('URL:');
          if (url) (editor.chain().focus() as any).setLink({ href: url }).run();
        }}
        isActive={editor.isActive('link')}
        title="Link"
      >
        <Link size={14} />
      </ToolbarButton>
    </div>
  );
};
