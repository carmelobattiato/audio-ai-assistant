
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { BubbleNote } from '../../types';
import { saveBlobToFile } from '../../utils/fileUtils';
import { loggingService } from '../../services/loggingService';

const MAX_DIMENSION = 1024;

const compressImage = (file: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      if (!event.target?.result) return reject(new Error("FileReader failed"));
      const img = new Image();
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
        if (!ctx) return reject(new Error("No canvas context"));
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
  pendingNoteHtml: string,
  onPendingNoteHtmlChange: (html: string) => void
) => {
  const inputRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
  const [parsingMessage, setParsingMessage] = useState<string | null>(null);

  const updateActiveFormats = useCallback(() => {
    const newActiveFormats: Record<string, boolean> = {};
    if (document.activeElement === inputRef.current) {
      ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'].forEach(command => {
        try { newActiveFormats[command] = document.queryCommandState(command); }
        catch (e) { newActiveFormats[command] = false; }
      });
    }
    setActiveFormats(newActiveFormats);
  }, []);

  const applyFormat = useCallback((command: string) => {
    if (inputRef.current && isEditorEditable) {
      inputRef.current.focus();
      document.execCommand(command, false, undefined);
      updateActiveFormats();
    }
  }, [isEditorEditable, updateActiveFormats]);

  const handleAddNote = useCallback(() => {
    if (!inputRef.current || !inputRef.current.innerHTML.trim() || inputRef.current.innerHTML.trim() === '<br>') return;
    const newNote: BubbleNote = {
      id: `note_${Date.now()}_${Math.random()}`,
      contentHtml: inputRef.current.innerHTML,
      timestamp: Date.now(),
      recordingElapsedTime: elapsedTime,
      isEditing: false,
      isProcessing: false,
    };
    onBubbleNotesChange([...bubbleNotes, newNote]);
    onPendingNoteHtmlChange('');
    loggingService.info('BUBBLE_NOTE_ADD', 'New bubble note added', { id: newNote.id, time: elapsedTime });
    if (inputRef.current) inputRef.current.innerHTML = '';
  }, [elapsedTime, bubbleNotes, onBubbleNotesChange, onPendingNoteHtmlChange]);

  const handleDownloadPendingContent = useCallback(() => {
      if (!inputRef.current || !inputRef.current.innerHTML.trim()) return;
      const htmlContent = `<html><head><meta charset="utf-8"><title>Bubble Note Content</title></head><body style="font-family:sans-serif;padding:20px">${inputRef.current.innerHTML}</body></html>`;
      const blob = new Blob([htmlContent], { type: 'text/html' });
      saveBlobToFile(blob, `current_note_draft_${Date.now()}.html`);
  }, []);

  const handlePaste = useCallback(async (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          try {
            const compressedDataUrl = await compressImage(blob);
            document.execCommand('insertHTML', false, `<img src="${compressedDataUrl}" alt="Pasted image" />`);
          } catch (e) { console.error(e); }
        }
      } else if (item.kind === 'string' && item.type === 'text/plain') {
        item.getAsString((s) => document.execCommand('insertText', false, s));
      } else if (item.kind === 'string' && item.type === 'text/html') {
        item.getAsString((s) => document.execCommand('insertHTML', false, s));
      }
    }
  }, []);

  const handleFileSelect = useCallback(async (files: File[]) => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    for (const file of files) {
      loggingService.info('BUBBLE_NOTE_FILE_PARSE_START', `Parsing file for bubble note: ${file.name}`, { type: file.type, size: file.size });
      setParsingMessage(`Processing "${file.name}"...`);
      try {
        if (file.type.startsWith('image/')) {
          const compressedDataUrl = await compressImage(file);
          document.execCommand('insertHTML', false, `<p><img src="${compressedDataUrl}" alt="${file.name}" /></p>`);
        } else if (file.type === 'text/plain') {
          const text = await file.text();
          document.execCommand('insertHTML', false, `<p>${text.replace(/\n/g, '<br>')}</p>`);
        } else if (file.type === 'text/html' || file.name.endsWith('.html')) {
          const htmlContent = await file.text();
          document.execCommand('insertHTML', false, `<div><p><em>--- ${file.name} ---</em></p>${htmlContent}</div>`);
        } else if (file.name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
          const mammoth = (await import('mammoth')).default;
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          document.execCommand('insertHTML', false, `<div><p><em>--- ${file.name} ---</em></p>${result.value}</div>`);
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            const pdfjsModule = await import('pdfjs-dist');
            
            // Fix: Robustly determine the object containing GlobalWorkerOptions.
            // Depending on how it's imported (ESM vs Bundled), it might be on 'default' or the module root.
            const pdfjs = pdfjsModule.GlobalWorkerOptions ? pdfjsModule : (pdfjsModule.default || pdfjsModule);

            if (!pdfjs.GlobalWorkerOptions) {
                throw new Error("PDF parser library loaded but GlobalWorkerOptions is missing. Cannot parse PDF.");
            }

            // Using cdnjs for the worker to avoid 'importScripts' failures often seen with esm.sh workers in browser
            pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            let fullText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                fullText += `<p><strong>[Page ${i}]</strong> ${pageText}</p>`;
            }
            document.execCommand('insertHTML', false, `<div><p><em>--- ${file.name} ---</em></p>${fullText}</div>`);
        } else if (file.name.endsWith('.pptx') || file.type.includes('presentationml')) {
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(file);
            let pptText = "";
            let slideIndex = 1;
            // Iterate over slide files in the ppt/slides directory
            while (true) {
                const slideFile = zip.file(`ppt/slides/slide${slideIndex}.xml`);
                if (!slideFile) break;
                const xmlContent = await slideFile.async("string");
                // Simple regex to extract text within <a:t> tags
                const matches = xmlContent.match(/<a:t>(.*?)<\/a:t>/g);
                if (matches) {
                    const slideText = matches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ');
                    pptText += `<p><strong>[Slide ${slideIndex}]</strong> ${slideText}</p>`;
                }
                slideIndex++;
            }
            if (pptText) {
                document.execCommand('insertHTML', false, `<div><p><em>--- ${file.name} ---</em></p>${pptText}</div>`);
            } else {
                setParsingMessage(`Could not extract text from PPTX "${file.name}".`);
            }
        } else {
            console.warn(`Unsupported file type: ${file.type}`);
            setParsingMessage(`Unsupported file type: ${file.name}`);
        }
        onPendingNoteHtmlChange(inputRef.current.innerHTML);
      } catch (e) { 
          const errorMsg = e instanceof Error ? e.message : String(e);
          loggingService.error('BUBBLE_NOTE_FILE_PARSE_ERROR', `Error parsing file: ${file.name}`, { error: errorMsg });
          console.error("Error parsing file:", e);
          setParsingMessage(`Error parsing "${file.name}": ${errorMsg}`);
      }
    }
    // Clear message after a short delay if it wasn't an error that should stick
    setTimeout(() => setParsingMessage(null), 2000);
  }, [onPendingNoteHtmlChange]);

  return { 
      inputRef, 
      activeFormats, 
      parsingMessage, 
      setParsingMessage, 
      applyFormat, 
      handleAddNote, 
      handlePaste, 
      handleFileSelect, 
      handleDownloadPendingContent, 
      updateActiveFormats 
  };
};
