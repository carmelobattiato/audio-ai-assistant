
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './common/Button';
import { Modal } from './common/Modal';
import {
  SaveIcon, EditIcon, UploadIcon, StopIcon, ArrowUpIcon, ArrowDownIcon, PlayIcon, TrashIcon, DownloadIcon,
  FormatBoldIcon, FormatItalicIcon, FormatUnderlinedIcon, FormatListBulletedIcon, FormatListNumberedIcon,
} from '../constants';
import { saveTextToFile, parseTextFile, generateStandardMetadataHeader, saveBlobToFile } from '../utils/fileUtils';
import { TranscriptionSettings, TextFileContent, AppSettings } from '../types';

const TOOLBAR_COMMANDS = ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'];
const TOOLBAR_BUTTONS = [
  { icon: <FormatBoldIcon className="w-5 h-5"/>, command: 'bold', title: 'Bold' },
  { icon: <FormatItalicIcon className="w-5 h-5"/>, command: 'italic', title: 'Italic' },
  { icon: <FormatUnderlinedIcon className="w-5 h-5"/>, command: 'underline', title: 'Underline' },
  { icon: <FormatListBulletedIcon className="w-5 h-5"/>, command: 'insertUnorderedList', title: 'Bulleted List' },
  { icon: <FormatListNumberedIcon className="w-5 h-5"/>, command: 'insertOrderedList', title: 'Numbered List' },
];

interface QueuedFile {
    file: File;
    duration: number | null;
    transcribed?: boolean;
}

interface TranscriptionViewProps {
  audioBlob: Blob | null;
  audioFileName: string;
  recordingTitle: string;
  settings: TranscriptionSettings;
  llmSettings: AppSettings['llm'];
  disabled?: boolean;
  onDiarizationSettingChange: (value: boolean) => void;
  audioRecordingStartTime: Date | null;
  onTextFileProcessed: (fileContent: TextFileContent) => void;
  isAudioModeActive: boolean;
  isTextModeActive: boolean;
  uploadedTextFileContentForDisplay: TextFileContent | null;
  activeSourceText: string;
  onTranscribe: (mode: 'replace' | 'append') => void;
  onStopTranscription: () => void;
  isTranscribing: boolean;
  transcriptionError: string | null;
  onTranscriptionChange: (newText: string) => void;
  transcriptionQueue: QueuedFile[];
  onReorderQueue: (sourceIndex: number, destinationIndex: number) => void;
  onRemoveFromQueue: (index: number) => void;
  transcriptionProgress: { current: number; total: number; filename: string };
  onSelectPlaybackFile: (item: QueuedFile | null) => void;
  currentlyPlayingFile: File | null;
  onTranscribeChunk: (index: number, mode: 'replace' | 'append') => void;
}

const TranscriptionViewBase: React.FC<TranscriptionViewProps> = ({
  audioBlob,
  audioFileName,
  recordingTitle,
  settings,
  disabled,
  audioRecordingStartTime,
  onTextFileProcessed,
  isAudioModeActive,
  isTextModeActive,
  uploadedTextFileContentForDisplay,
  activeSourceText,
  onTranscribe,
  onStopTranscription,
  isTranscribing,
  transcriptionError,
  onTranscriptionChange,
  transcriptionQueue,
  onReorderQueue,
  onRemoveFromQueue,
  transcriptionProgress,
  onSelectPlaybackFile,
  currentlyPlayingFile,
  onTranscribeChunk,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const textFileInputRef = useRef<HTMLInputElement>(null);
  const [isLoadingTextFile, setIsLoadingTextFile] = useState<boolean>(false);
  const [userMessageTextUpload, setUserMessageTextUpload] = useState<string | null>(null);
  const [uploadConfirmModalOpen, setUploadConfirmModalOpen] = useState<boolean>(false);
  const [pendingTextFile, setPendingTextFile] = useState<TextFileContent | null>(null);
  const [isRetranscribeModalOpen, setIsRetranscribeModalOpen] = useState(false);
  const [pendingChunkRetranscribeIndex, setPendingChunkRetranscribeIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isTextModeActive) {
        setUserMessageTextUpload(null);
    }
  }, [isTextModeActive]);

  const handleSaveTranscription = () => {
    if (activeSourceText) {
      // Prioritize recordingTitle, then audioFileName, then fallback
      const nameSeed = recordingTitle.trim() || (audioFileName ? (audioFileName.split('.')[0] ?? 'transcription') : 'transcription');
      const safeBaseName = nameSeed.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const baseFileName = `${safeBaseName}_transcription`;

      const metadataHeader = generateStandardMetadataHeader(
        audioRecordingStartTime,
        audioFileName || "Multiple Files",
        { transcriptionLanguage: settings.language, outputFormat: settings.outputFormat }
      );
      saveTextToFile(activeSourceText, baseFileName, settings.outputFormat, metadataHeader || undefined);
    }
  };

  const updateActiveFormats = useCallback(() => {
    const newActiveFormats: Record<string, boolean> = {};
    if (document.activeElement === editorRef.current) {
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
    if (editorRef.current && editorRef.current.innerHTML !== activeSourceText) {
      editorRef.current.innerHTML = activeSourceText || '';
    }
  }, [activeSourceText]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return undefined;
    const handleSelectionChange = () => updateActiveFormats();
    document.addEventListener('selectionchange', handleSelectionChange);
    editor.addEventListener('focus', updateActiveFormats);
    editor.addEventListener('keyup', updateActiveFormats);
    editor.addEventListener('mouseup', updateActiveFormats);
    editor.addEventListener('click', updateActiveFormats);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      editor.removeEventListener('focus', updateActiveFormats);
      editor.removeEventListener('keyup', updateActiveFormats);
      editor.removeEventListener('mouseup', updateActiveFormats);
      editor.removeEventListener('click', updateActiveFormats);
    };
  }, [updateActiveFormats]);

  const applyFormat = (command: string, value?: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand(command, false, value);
      updateActiveFormats();
    }
  };

  const handleSaveEditedTranscription = () => {
    if (editorRef.current) {
      onTranscriptionChange(editorRef.current.innerHTML);
    }
    setIsEditing(false);
  };

  const handleToggleEditMode = () => {
    if (isEditing) {
      handleSaveEditedTranscription();
    } else {
      setIsEditing(true);
      requestAnimationFrame(() => editorRef.current?.focus());
    }
  };

  const handleTextFileUploadClick = () => {
    textFileInputRef.current?.click();
  };

  const handleTextFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUserMessageTextUpload(`Processing "${file.name}"...`);
      setIsLoadingTextFile(true);

      const parsedResult = await parseTextFile(file);
      
      if (parsedResult.error) {
        setUserMessageTextUpload(`Error processing "${file.name}": ${parsedResult.error}`);
        onTextFileProcessed(parsedResult);
      } else if (parsedResult.textContent === null) {
        setUserMessageTextUpload(`Could not extract text from "${file.name}". This format might not be fully supported.`);
        onTextFileProcessed(parsedResult);
      } else {
        if (activeSourceText && parsedResult.textContent) {
          setPendingTextFile(parsedResult);
          setUploadConfirmModalOpen(true);
        } else {
          setUserMessageTextUpload(`Successfully processed "${file.name}". Content is ready for LLM.`);
          onTextFileProcessed(parsedResult);
        }
      }
      setIsLoadingTextFile(false);
    }
    if (event.target) event.target.value = '';
  };

  const handleConfirmReplace = () => {
    if (pendingTextFile) {
      setUserMessageTextUpload(`Replaced content with "${pendingTextFile.name}".`);
      onTextFileProcessed(pendingTextFile);
    }
    setUploadConfirmModalOpen(false);
    setPendingTextFile(null);
  };

  const handleConfirmAppend = () => {
    if (pendingTextFile?.textContent && activeSourceText) {
      const newName = `Combined: (${uploadedTextFileContentForDisplay?.name || audioFileName || 'Previous Source'}) and ${pendingTextFile.name}`;
      const combinedText = `${activeSourceText}\n\n---\n[Appended Content from ${pendingTextFile.name} on ${new Date(pendingTextFile.uploadTime ?? Date.now()).toLocaleString()}]\n---\n\n${pendingTextFile.textContent}`;
      
      const appendedContent: TextFileContent = {
        ...pendingTextFile,
        name: newName,
        textContent: combinedText,
      };
      setUserMessageTextUpload(`Appended content from "${pendingTextFile.name}".`);
      onTextFileProcessed(appendedContent);
    }
    setUploadConfirmModalOpen(false);
    setPendingTextFile(null);
  };

  const handleCancelUploadConfirm = () => {
    setUserMessageTextUpload(`Upload of "${pendingTextFile?.name}" cancelled.`);
    setUploadConfirmModalOpen(false);
    setPendingTextFile(null);
  };

  const handleTranscribeClick = () => {
    if (isTranscribing) {
      onStopTranscription();
      return;
    }
    if (activeSourceText && isAudioModeActive && transcriptionQueue.length === 0) {
        setIsRetranscribeModalOpen(true);
    } else {
        onTranscribe('replace');
    }
  };

  const handleConfirmRetranscribe = (mode: 'replace' | 'append') => {
    setIsRetranscribeModalOpen(false);
    onTranscribe(mode);
  };

  const canTranscribe = audioBlob !== null || transcriptionQueue.length > 0;
  let transcribeButtonText = "Transcribe Audio";
  let transcribeButtonTitle = "No audio recorded or files queued for transcription.";

  if (isTranscribing) {
    if (transcriptionProgress.total > 1) {
      transcribeButtonText = `Transcribing ${transcriptionProgress.current}/${transcriptionProgress.total}: ${transcriptionProgress.filename}...`;
      transcribeButtonTitle = `Transcription in progress for file ${transcriptionProgress.filename}`;
    } else {
      transcribeButtonText = `Transcribing...`;
      transcribeButtonTitle = `Transcription in progress for ${audioFileName}`;
    }
  } else if (transcriptionQueue.length > 0) {
    transcribeButtonText = `Transcribe ${transcriptionQueue.length} File(s)`;
    transcribeButtonTitle = `Start transcribing all ${transcriptionQueue.length} files in the queue.`;
  } else if (audioBlob) {
    transcribeButtonText = `Transcribe ${settings.language} Audio`;
    transcribeButtonTitle = `Start transcribing the recorded audio.`;
  }
  
  const showTranscriptionArea = isTranscribing || activeSourceText || isTextModeActive;

  return (
    <div className="p-4 bg-gray-800 rounded-lg shadow-lg space-y-4">
      <h3 className="text-xl font-semibold text-sky-400">Input Source & Transcription</h3>
      
      {transcriptionQueue.length > 0 && (
        <div className="my-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-md font-semibold text-gray-300">Transcription Order</h4>
          </div>
          <ul className="space-y-2 bg-gray-700 p-3 rounded-md max-h-48 overflow-y-auto">
            {transcriptionQueue.map((item, index) => {
              const isPlaying = currentlyPlayingFile === item.file;
              return (
              <li key={`${item.file.name}-${item.file.size}`} className={`flex items-center justify-between p-2 rounded-md gap-2 transition-colors ${isPlaying ? 'bg-blue-900 bg-opacity-50' : 'bg-gray-800'}`}>
                <div className="flex items-center gap-3 min-w-0 flex-grow">
                   <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectPlaybackFile(isPlaying ? null : item)}
                      title={isPlaying ? "Stop playback" : "Play this segment"}
                    >
                      {isPlaying ? <StopIcon className="w-5 h-5 text-red-400" /> : <PlayIcon className="w-5 h-5" />}
                    </Button>
                  <span className="font-mono text-gray-400 flex-shrink-0">{index + 1}.</span>
                  <span className={`text-sm truncate ${item.transcribed ? 'text-green-400 line-through opacity-60' : 'text-gray-200'}`} title={item.file.name}>
                    {item.file.name}
                  </span>
                  {item.duration !== null && (
                    <span className="text-sky-300 text-xs font-mono flex-shrink-0">
                      ({item.duration.toFixed(1)}s)
                    </span>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => saveBlobToFile(item.file, item.file.name)} title="Download this chunk">
                    <DownloadIcon className="w-5 h-5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => {
                    if (item.transcribed) {
                      setPendingChunkRetranscribeIndex(index);
                    } else {
                      onTranscribeChunk(index, 'append');
                    }
                  }} disabled={isTranscribing} title={item.transcribed ? 'Re-transcribe this chunk (already transcribed)' : 'Transcribe this chunk'}>
                    <span className={`text-xs font-bold ${item.transcribed ? 'text-green-400' : 'text-sky-400'}`}>T</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onReorderQueue(index, index - 1)} disabled={index === 0} title="Move up">
                    <ArrowUpIcon className="w-5 h-5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onReorderQueue(index, index + 1)} disabled={index === transcriptionQueue.length - 1} title="Move down">
                    <ArrowDownIcon className="w-5 h-5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onRemoveFromQueue(index)} title="Remove from queue">
                    <TrashIcon className="w-5 h-5 text-red-500 hover:text-red-400 transition-colors" />
                  </Button>
                </div>
              </li>
            )})}
          </ul>
        </div>
      )}

      {transcriptionError && <p className="text-red-400 text-sm">Audio Transcription Error: {transcriptionError}</p>}

      <div className={`sticky top-0 z-10 bg-gray-800 border border-gray-700 flex flex-wrap items-center justify-between gap-2 p-1.5 ${showTranscriptionArea ? 'rounded-t-lg border-b-0' : 'rounded-lg'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
              onClick={handleTranscribeClick}
              disabled={disabled || (!isTranscribing && !canTranscribe)}
              variant={isTranscribing ? "danger" : "primary"}
              size="sm"
              leftIcon={isTranscribing ? <StopIcon className="w-4 h-4"/> : null}
              title={transcribeButtonTitle}
          >
              {isTranscribing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Stop Transcription
                </span>
              ) : transcribeButtonText}
          </Button>

          <Button
              onClick={handleTextFileUploadClick}
              variant="primary"
              size="sm"
              leftIcon={<UploadIcon className="w-4 h-4" />}
              isLoading={isLoadingTextFile}
              disabled={disabled || isTranscribing}
              title="Upload a text document"
          >
              {isLoadingTextFile ? "Processing File..." : "Upload Text Document"}
          </Button>
          <input
            type="file"
            ref={textFileInputRef}
            onChange={handleTextFileChange}
            accept=".txt,.csv,.html,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,text/html,application/pdf"
            className="hidden"
            aria-hidden="true"
          />

        </div>
        {showTranscriptionArea && (
          <div className="flex items-center gap-2">
            {isEditing && (
              <div className="simple-editor-toolbar flex items-center gap-0.5">
                {TOOLBAR_BUTTONS.map(btn => (
                  <button
                    key={btn.command}
                    onClick={() => applyFormat(btn.command)}
                    title={btn.title}
                    type="button"
                    disabled={disabled || isTranscribing}
                    className={`p-1.5 ${activeFormats[btn.command] ? 'active' : ''}`}
                    aria-pressed={!!activeFormats[btn.command]}
                  >
                    {btn.icon}
                  </button>
                ))}
              </div>
            )}
            {activeSourceText && !isTranscribing && (
              <Button
                  onClick={handleSaveTranscription}
                  variant="secondary"
                  size="sm"
                  leftIcon={<SaveIcon className="w-4 h-4"/>}
                  disabled={disabled}
              >
                  Download Transcription as {settings.outputFormat.toUpperCase()}
              </Button>
            )}
            <Button
              onClick={handleToggleEditMode}
              variant="primary"
              size="sm"
              leftIcon={isEditing ? <SaveIcon className="w-4 h-4"/> : <EditIcon className="w-4 h-4"/>}
              disabled={disabled || isTranscribing}
            >
              {isEditing ? 'Save Changes' : 'Edit Mode'}
            </Button>
          </div>
        )}
      </div>
      {showTranscriptionArea ? (
        <div
          id="transcriptionDisplay"
          ref={editorRef}
          contentEditable={isEditing && !disabled && !isTranscribing}
          suppressContentEditableWarning={true}
          aria-live="polite"
          aria-label="Transcription Result"
          className={`llm-result-display-prose simple-editor-content border border-t-0 border-gray-700 rounded-b-lg focus:ring-blue-500 focus:border-blue-500 ${isTranscribing || disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          style={{ minHeight: '60vh', maxHeight: '70vh', overflowY: 'auto' }}
        />
      ) : (
        <p className="text-gray-500 text-center py-10">
            Please record audio, upload an audio file, or upload a text document to begin.
            {userMessageTextUpload && <span className={`block mt-2 text-sm ${userMessageTextUpload.startsWith("Error") ? 'text-red-400' : 'text-sky-300'}`}>{userMessageTextUpload}</span>}
        </p>
      )}

      <Modal
        isOpen={pendingChunkRetranscribeIndex !== null}
        onClose={() => setPendingChunkRetranscribeIndex(null)}
        title="Ri-trascrivi chunk"
        footer={
          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <Button onClick={() => setPendingChunkRetranscribeIndex(null)} variant="ghost">Annulla</Button>
            <Button onClick={() => {
              if (pendingChunkRetranscribeIndex !== null) onTranscribeChunk(pendingChunkRetranscribeIndex, 'append');
              setPendingChunkRetranscribeIndex(null);
            }} variant="secondary">Aggiungi in coda</Button>
            <Button onClick={() => {
              if (pendingChunkRetranscribeIndex !== null) onTranscribeChunk(pendingChunkRetranscribeIndex, 'replace');
              setPendingChunkRetranscribeIndex(null);
            }} variant="primary">Sostituisci</Button>
          </div>
        }
      >
        <p className="text-gray-300">
          Questo chunk è già stato trascritto. Vuoi <strong>sostituire</strong> la trascrizione precedente nella stessa posizione, o <strong>aggiungere</strong> la nuova trascrizione in coda?
        </p>
      </Modal>

      <Modal
        isOpen={isRetranscribeModalOpen}
        onClose={() => setIsRetranscribeModalOpen(false)}
        title="Re-transcribe Audio"
        footer={
          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <Button onClick={() => setIsRetranscribeModalOpen(false)} variant="ghost">Cancel</Button>
            <Button onClick={() => handleConfirmRetranscribe('append')} variant="secondary">Append</Button>
            <Button onClick={() => handleConfirmRetranscribe('replace')} variant="primary">Replace</Button>
          </div>
        }
      >
        <p className="text-gray-300">
          An audio transcription already exists. How would you like to proceed with the new transcription?
        </p>
      </Modal>

      {uploadConfirmModalOpen && pendingTextFile && (
        <Modal
          isOpen={uploadConfirmModalOpen}
          onClose={handleCancelUploadConfirm}
          title="Existing Content Action"
          footer={
            <div className="flex flex-col sm:flex-row justify-end gap-2">
              <Button onClick={handleCancelUploadConfirm} variant="ghost">Cancel</Button>
              <Button onClick={handleConfirmAppend} variant="secondary">Append to Current</Button>
              <Button onClick={handleConfirmReplace} variant="primary">Replace Current</Button>
            </div>
          }
        >
          <p className="text-gray-300">
            There is existing text content. How would you like to handle the content of the uploaded file 
            <strong className="text-sky-400"> "{pendingTextFile.name}"</strong>?
          </p>
        </Modal>
      )}
    </div>
  );
};
export const TranscriptionView = React.memo(TranscriptionViewBase);
