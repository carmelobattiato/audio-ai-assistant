import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { LoadingSpinner } from './common/LoadingSpinner';
import { llmService } from '../services/geminiService';
import { SupportedLanguage, AppSettings } from '../types';
import { 
    FormatBoldIcon, 
    FormatItalicIcon, 
    FormatUnderlinedIcon, 
    FormatListBulletedIcon, 
    FormatListNumberedIcon 
} from '../constants';

interface RichTextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent: string; // Can be plain text or HTML
  onSave: (newContent: string) => void;
  currentLanguage: SupportedLanguage;
  llmSettings: AppSettings['llm'];
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  command: string;
  value?: string;
  title: string;
}

const TOOLBAR_COMMANDS = ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'];

export const RichTextEditorModal: React.FC<RichTextEditorModalProps> = ({
  isOpen,
  onClose,
  initialContent,
  onSave,
  currentLanguage,
  llmSettings
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [reprocessInstruction, setReprocessInstruction] = useState<string>('');
  const [isReprocessing, setIsReprocessing] = useState<boolean>(false);
  const [reprocessError, setReprocessError] = useState<string | null>(null);
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});

  const updateActiveFormats = useCallback(() => {
    const newActiveFormats: Record<string, boolean> = {};
    if (document.activeElement === editorRef.current) { // Only update if editor is focused
        TOOLBAR_COMMANDS.forEach(command => {
            try {
                newActiveFormats[command] = document.queryCommandState(command);
            } catch (e) {
                console.warn(`Error querying command state for ${command}:`, e);
                newActiveFormats[command] = false;
            }
        });
    }
    setActiveFormats(newActiveFormats);
  }, []);

  useEffect(() => {
    if (isOpen && editorRef.current) {
      console.log("RichTextEditorModal: Opened. Setting initial content. Length:", initialContent.length);
      editorRef.current.innerHTML = initialContent;
      setReprocessInstruction('');
      setIsReprocessing(false);
      setReprocessError(null);
      // Slight delay to ensure editor is ready for focus and selection checks
      setTimeout(() => {
        editorRef.current?.focus();
        updateActiveFormats();
      }, 0);
    }
  }, [isOpen, initialContent, updateActiveFormats]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && isOpen) {
      // More robust event handling for selection changes
      const handleSelectionChange = () => updateActiveFormats();
      document.addEventListener('selectionchange', handleSelectionChange);
      editor.addEventListener('focus', updateActiveFormats);
      editor.addEventListener('keyup', updateActiveFormats);
      editor.addEventListener('mouseup', updateActiveFormats);
      editor.addEventListener('click', updateActiveFormats); // Added click as well

      return () => {
        document.removeEventListener('selectionchange', handleSelectionChange);
        editor.removeEventListener('focus', updateActiveFormats);
        editor.removeEventListener('keyup', updateActiveFormats);
        editor.removeEventListener('mouseup', updateActiveFormats);
        editor.removeEventListener('click', updateActiveFormats);
      };
    }
  }, [isOpen, updateActiveFormats]);


  const applyFormat = (command: string, value?: string) => {
    if (editorRef.current) {
      editorRef.current.focus(); 
      document.execCommand(command, false, value);
      updateActiveFormats(); // Update active formats after applying one
    }
  };

  const handleSave = () => {
    if (editorRef.current) {
      const newContent = editorRef.current.innerHTML;
      console.log("RichTextEditorModal: Saving content. Length:", newContent.length);
      onSave(newContent);
      onClose();
    }
  };

  const handleReprocessSelection = async () => {
    if (!editorRef.current || !reprocessInstruction) {
      setReprocessError("Please select text in the editor and provide an instruction.");
      return;
    }
    editorRef.current.focus();
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setReprocessError("No text selected in the editor.");
      return;
    }

    const selectedText = selection.toString();
    if (!selectedText.trim()) {
      setReprocessError("Selected text is empty or whitespace.");
      return;
    }

    console.log(`RichTextEditorModal: Reprocessing selection. Instruction: "${reprocessInstruction}", Selected text: "${selectedText.substring(0, 50)}..."`);
    setIsReprocessing(true);
    setReprocessError(null);

    try {
      const systemInstruction = `You are a text editing assistant. Modify the provided text based on the user's instruction. Output only the modified text content, maintaining the original language which is ${currentLanguage}. Try to return plain text or simple HTML that fits the modification.`;
      const prompt = `User instruction: "${reprocessInstruction}"\n\nSelected text to modify (language: ${currentLanguage}):\n"${selectedText}"\n\nReturn ONLY the modified text based on the instruction.`;
      
      const { text: modifiedText } = await llmService.generateText(prompt, llmSettings, systemInstruction);

      if (modifiedText) {
        if(modifiedText.startsWith("Error:")) {
            setReprocessError(modifiedText);
        } else {
            console.log("RichTextEditorModal: Reprocessed text received. Length:", modifiedText.length);
            document.execCommand('insertHTML', false, modifiedText);
        }
      } else {
        console.log("RichTextEditorModal: Reprocessed text is empty.");
      }
      updateActiveFormats();
    } catch (err) {
      console.error("RichTextEditorModal: Error reprocessing text:", err);
      const message = err instanceof Error ? err.message : String(err);
      setReprocessError(`Error reprocessing: ${message}`);
    } finally {
      setIsReprocessing(false);
    }
  };


  const toolbarButtons: ToolbarButtonProps[] = [
    { icon: <FormatBoldIcon className="w-5 h-5"/>, command: 'bold', title: 'Bold' },
    { icon: <FormatItalicIcon className="w-5 h-5"/>, command: 'italic', title: 'Italic' },
    { icon: <FormatUnderlinedIcon className="w-5 h-5"/>, command: 'underline', title: 'Underline' },
    { icon: <FormatListBulletedIcon className="w-5 h-5"/>, command: 'insertUnorderedList', title: 'Bulleted List' },
    { icon: <FormatListNumberedIcon className="w-5 h-5"/>, command: 'insertOrderedList', title: 'Numbered List' },
  ];

  const modalFooter = (
    <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex-grow">
            <Input
                id="reprocessInstruction"
                type="text"
                placeholder={`e.g., "summarize this", "correct grammar", "translate to ${currentLanguage === 'Italian' ? 'English' : 'Italian'}"`}
                value={reprocessInstruction}
                onChange={(e) => setReprocessInstruction(e.target.value)}
                disabled={isReprocessing}
                aria-label="Instruction for reprocessing selected text"
                className="w-full"
            />
        </div>
        <div className="flex-shrink-0">
            <Button onClick={handleReprocessSelection} variant="secondary" disabled={isReprocessing || !reprocessInstruction.trim()}>
                {isReprocessing ? 'Reprocessing...' : 'Reprocess Selected Text'}
            </Button>
        </div>
        <div className="flex-shrink-0">
            <Button onClick={handleSave} variant="primary">Save Changes</Button>
        </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Content" footer={modalFooter}>
      <div className="simple-editor-toolbar">
        {toolbarButtons.map(btn => (
          <button
            key={btn.command}
            onClick={() => applyFormat(btn.command, btn.value)}
            title={btn.title}
            type="button"
            className={`p-1.5 ${activeFormats[btn.command] ? 'active' : ''}`}
            aria-pressed={activeFormats[btn.command]}
          >
            {btn.icon}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable={true}
        className="simple-editor-content focus:ring-blue-500 focus:border-blue-500"
        suppressContentEditableWarning={true}
        style={{ minHeight: '250px', maxHeight: '50vh', overflowY: 'auto' }}
        aria-label="Rich text editor content"
      />
      {isReprocessing && <LoadingSpinner text="Reprocessing selection with LLM..." size="sm" />}
      {reprocessError && <p className="text-red-400 text-xs mt-2" role="alert">{reprocessError}</p>}
       <p className="text-xs text-gray-400 mt-2">
        Tip: Select text in the editor above, type an instruction (e.g., "make this more formal", "fix typos", "explain this simply"), and click "Reprocess Selected Text".
      </p>
    </Modal>
  );
};
