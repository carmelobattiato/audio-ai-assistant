import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
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
          if (width > MAX_DIMENSION) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }
        canvas.width = width;
        canvas.height = height;
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
      Underline,
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder:
          'Enter to add note. Shift+Enter for newline. Paste images or upload files (Img, Txt, HTML, DOCX, PPTX, PDF).',
      }),
    ],
    editable: isEditorEditable,
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      lastOwnHtmlRef.current = html;
      onPendingNoteHtmlChange(html);
    },
  });

  // Keep editable state in sync
  useEffect(() => {
    if (editor && editor.isEditable !== isEditorEditable) {
      editor.setEditable(isEditorEditable);
    }
  }, [editor, isEditorEditable]);

  const activeFormats: Record<string, boolean> = editor
    ? {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        insertUnorderedList: editor.isActive('bulletList'),
        insertOrderedList: editor.isActive('orderedList'),
      }
    : {};

  const applyFormat = useCallback(
    (command: string) => {
      if (!editor || !isEditorEditable) return;
      switch (command) {
        case 'bold':
          (editor.chain().focus() as any).toggleBold().run();
          break;
        case 'italic':
          (editor.chain().focus() as any).toggleItalic().run();
          break;
        case 'underline':
          (editor.chain().focus() as any).toggleUnderline().run();
          break;
        case 'insertUnorderedList':
          (editor.chain().focus() as any).toggleBulletList().run();
          break;
        case 'insertOrderedList':
          (editor.chain().focus() as any).toggleOrderedList().run();
          break;
        default:
          break;
      }
    },
    [editor, isEditorEditable]
  );

  const handleAddNote = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    const trimmed = html.replace(/<[^>]*>/g, '').trim();
    if (!trimmed && !html.includes('<img')) return;

    const isScreenshot = /^<p><img[^>]+><\/p>$/.test(html.trim()) || /^<img[^>]+>$/.test(html.trim());
    const newNote: BubbleNote = {
      id: `note_${Date.now()}_${Math.random()}`,
      contentHtml: html,
      timestamp: Date.now(),
      recordingElapsedTime: elapsedTime,
      isEditing: false,
      isProcessing: false,
      type: isScreenshot ? 'screenshot' : 'text',
    };
    onBubbleNotesChange([...bubbleNotes, newNote]);
    onPendingNoteHtmlChange('');
    loggingService.info('BUBBLE_NOTE_ADD', 'New bubble note added', { id: newNote.id, time: elapsedTime });
    editor.commands.clearContent(true);
  }, [editor, elapsedTime, bubbleNotes, onBubbleNotesChange, onPendingNoteHtmlChange]);

  const handleDownloadPendingContent = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    if (!html.replace(/<[^>]*>/g, '').trim()) return;
    const htmlContent = `<html><head><meta charset="utf-8"><title>Bubble Note Content</title></head><body style="font-family:sans-serif;padding:20px">${html}</body></html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    saveBlobToFile(blob, `current_note_draft_${Date.now()}.html`);
  }, [editor]);

  const handleFileSelect = useCallback(
    async (files: File[]) => {
      if (!editor) return;
      for (const file of files) {
        loggingService.info('BUBBLE_NOTE_FILE_PARSE_START', `Parsing file for bubble note: ${file.name}`, {
          type: file.type,
          size: file.size,
        });
        setParsingMessage(`Processing "${file.name}"...`);
        try {
          if (file.type.startsWith('image/')) {
            const dataUrl = await compressImage(file);
            editor.commands.insertContent(`<p><img src="${dataUrl}" alt="${file.name}" /></p>`);
          } else if (file.type === 'text/plain') {
            const text = await file.text();
            editor.commands.insertContent(`<p>${text.replace(/\n/g, '<br>')}</p>`);
          } else if (file.type === 'text/html' || file.name.endsWith('.html')) {
            const htmlContent = await file.text();
            editor.commands.insertContent(`<div><p><em>--- ${file.name} ---</em></p>${htmlContent}</div>`);
          } else if (file.name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
            const mammoth = (await import('mammoth')).default;
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.convertToHtml({ arrayBuffer });
            editor.commands.insertContent(`<div><p><em>--- ${file.name} ---</em></p>${result.value}</div>`);
          } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            const pdfjsModule = await import('pdfjs-dist');
            const pdfjs = (pdfjsModule as any).GlobalWorkerOptions
              ? pdfjsModule
              : ((pdfjsModule as any).default || pdfjsModule);
            if (!pdfjs.GlobalWorkerOptions) {
              throw new Error('PDF parser library loaded but GlobalWorkerOptions is missing.');
            }
            pdfjs.GlobalWorkerOptions.workerSrc = new URL(
              'pdfjs-dist/build/pdf.worker.min.mjs',
              import.meta.url
            ).href;
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items.map((item: any) => item.str).join(' ');
              fullText += `<p><strong>[Page ${i}]</strong> ${pageText}</p>`;
            }
            editor.commands.insertContent(`<div><p><em>--- ${file.name} ---</em></p>${fullText}</div>`);
          } else if (file.name.endsWith('.pptx') || file.type.includes('presentationml')) {
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(file);
            let pptText = '';
            let slideIndex = 1;
            while (true) {
              const slideFile = zip.file(`ppt/slides/slide${slideIndex}.xml`);
              if (!slideFile) break;
              const xmlContent = await slideFile.async('string');
              const matches = xmlContent.match(/<a:t>(.*?)<\/a:t>/g);
              if (matches) {
                const slideText = matches.map((m) => m.replace(/<\/?a:t>/g, '')).join(' ');
                pptText += `<p><strong>[Slide ${slideIndex}]</strong> ${slideText}</p>`;
              }
              slideIndex++;
            }
            if (pptText) {
              editor.commands.insertContent(`<div><p><em>--- ${file.name} ---</em></p>${pptText}</div>`);
            } else {
              setParsingMessage(`Could not extract text from PPTX "${file.name}".`);
            }
          } else {
            console.warn(`Unsupported file type: ${file.type}`);
            setParsingMessage(`Unsupported file type: ${file.name}`);
          }
          onPendingNoteHtmlChange(editor.getHTML());
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          loggingService.error('BUBBLE_NOTE_FILE_PARSE_ERROR', `Error parsing file: ${file.name}`, {
            error: errorMsg,
          });
          console.error('Error parsing file:', e);
          setParsingMessage(`Error parsing "${file.name}": ${errorMsg}`);
        }
      }
      setTimeout(() => setParsingMessage(null), 2000);
    },
    [editor, onPendingNoteHtmlChange]
  );

  return {
    editor,
    activeFormats,
    parsingMessage,
    setParsingMessage,
    applyFormat,
    handleAddNote,
    handleFileSelect,
    handleDownloadPendingContent,
    // Legacy compat stubs — callers that reference these won't break:
    inputRef: { current: null } as unknown as React.RefObject<HTMLDivElement>,
    updateActiveFormats: () => {},
    handlePaste: () => {},
  };
};
