
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Part } from "@google/genai";
import { llmService } from '../services/geminiService';
import { Button } from './common/Button';
import { Select } from './common/Select'; 
import { TextArea } from './common/TextArea'; 
import { LoadingModal } from './common/LoadingModal';
import { AppSettings, CustomInstruction, SystemPrompt, GroundingChunk, SupportedLanguage, TranscriptionOutputFormat, BubbleNote } from '../types';
import { resolvePrompt, getPromptText } from '../utils/promptUtils';
import { RichTextEditorModal } from './RichTextEditorModal';
import { EditIcon as EditPencilIcon, SaveIcon as CopyIcon, DownloadIcon } from '../constants'; 
import { formatTime, htmlToPlainText, parseHtmlForGeminiParts, markdownToHtmlSimple } from '../utils/textUtils';
import { saveTextToFile, generateStandardMetadataHeader } from '../utils/fileUtils';

interface LlmProcessorProps {
  sourceText: string; 
  bubbleNotes: BubbleNote[];
  onProcessingComplete: (processedText: string, type: string) => void; 
  currentLlmResult: string; 
  onLlmResultUpdate: (newHtmlContent: string, originalType: string) => void; 
  settings: AppSettings['llm'];
  transcriptionSettings: AppSettings['transcription'];
  transcriptionLanguage: SupportedLanguage;
  customInstructions?: CustomInstruction[];
  systemPrompts?: SystemPrompt[];
  meetingTitle?: string;
  meetingAttendees?: { name: string; email: string; type?: string }[];
  disabled?: boolean;
  audioDuration?: number; 
  audioRecordingStartTime?: Date | null; 
  audioFileName: string;
  recordingTitle: string;
  autoTrigger: number;
  isQuickProcessActive: boolean;
  onQuickProcessComplete: () => void;
  onProcessingError?: (err: string) => void;
  resultType?: string; // tipo del risultato caricato da sessione esistente
}

const DEFAULT_ACTIONS = [
  { key: 'default-custom-only', title: 'Use Only Custom Instructions' },
  { key: 'default-summary', title: 'Generate Summary' },
  { key: 'default-minutes-concise', title: 'Write Minutes (Concise - Email Style)' },
  { key: 'default-minutes-detailed', title: 'Write Minutes (Detailed - Email Style)' },
  { key: 'default-10points', title: 'List in 10 Brief Points' },
  { key: 'default-interview', title: 'Format as Interview/Dialogue' },
  { key: 'default-timeline', title: 'Create HTML Timeline Report' },
];

export interface LlmProcessorRef {
  stopProcessing: () => void;
}

export const LlmProcessor = React.forwardRef<LlmProcessorRef, LlmProcessorProps>(({
  sourceText,
  bubbleNotes,
  onProcessingComplete,
  currentLlmResult, 
  onLlmResultUpdate,
  settings,
  transcriptionSettings,
  transcriptionLanguage,
  disabled,
  audioDuration,
  audioRecordingStartTime,
  audioFileName,
  recordingTitle,
  autoTrigger,
  isQuickProcessActive,
  onQuickProcessComplete,
  onProcessingError,
  resultType,
  customInstructions,
  systemPrompts,
  meetingTitle,
  meetingAttendees,
}, ref) => {
  const [customContext, setCustomContext] = useState<string>("");
  const [activeProcessingDisplayTitle, setActiveProcessingDisplayTitle] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [groundingChunks, setGroundingChunks] = useState<GroundingChunk[]>([]);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState<boolean>(false);
  const [selectedProcessingActionKey, setSelectedProcessingActionKey] = useState<string>('default-minutes-concise');
  const [copyButtonText, setCopyButtonText] = useState<string>("Copy Text");
  const lastProcessedAutoTrigger = useRef<number>(-1);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isWindows = navigator.userAgent.includes('Windows');

  const serializeBubbleNotesForGeminiLocal = useCallback((bubbles: BubbleNote[]) => {
    const allParts: Part[] = [];
    const imageMap = new Map<string, string>();
    
    if (!bubbles || bubbles.length === 0) return { parts: [], imageMap };
    
    allParts.push({ text: `\n\n--- SUPPLEMENTARY BUBBLE NOTES (INCLUDING SCREENSHOTS) ---\n` });
    bubbles.forEach((bubble, bIndex) => {
      const header = `\n[Note ${bIndex + 1} at recording time ${formatTime(bubble.recordingElapsedTime)}]:\n`;
      allParts.push({ text: header });
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = bubble.contentHtml;
      let iIndex = 0;
      
      const processNode = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent?.trim();
              if (text) allParts.push({ text: text + " " });
          } else if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              if (el.tagName.toLowerCase() === 'img') {
                  const src = el.getAttribute('src');
                  if (src?.startsWith('data:image/')) {
                      const ref = `IMAGE_REF_B${bIndex}_I${iIndex}`;
                      allParts.push({ text: `[${ref}]` });
                      const [header, data] = src.split(',');
                      const mimeType = header?.match(/:(.*?);/)?.[1] || 'image/png';
                      allParts.push({ inlineData: { mimeType, data } });
                      imageMap.set(ref, src);
                      iIndex++;
                  }
              } else {
                  el.childNodes.forEach(processNode);
              }
          }
      };
      tempDiv.childNodes.forEach(processNode);
      allParts.push({ text: `\n` });
    });
    allParts.push({ text: `\n--- END OF BUBBLE NOTES ---\n\n` });
    return { parts: allParts, imageMap };
  }, []);

  React.useImperativeHandle(ref, () => ({
    stopProcessing
  }));

  const stopProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsProcessing(false);
      setError("Processing cancelled by user.");
      if (isQuickProcessActive) onQuickProcessComplete();
    }
  }, [isQuickProcessActive, onQuickProcessComplete]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    // Resetta il titolo solo se non c'è un risultato pre-caricato (es. da sessione)
    if (!currentLlmResult) {
      setActiveProcessingDisplayTitle(null);
    }
    setError(null);
    setGroundingChunks([]);
    setCopyButtonText("Copy Text");
  }, [sourceText, bubbleNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ripristina il titolo quando viene caricato un risultato da sessione esistente
  useEffect(() => {
    if (currentLlmResult && resultType) {
      setActiveProcessingDisplayTitle(prev => prev ?? resultType);
    }
  }, [currentLlmResult, resultType]);

  useEffect(() => {
    setCopyButtonText("Copy Text");
  }, [currentLlmResult]);

  const executeAnalysis = useCallback(async () => {
    const currentActionTitle = DEFAULT_ACTIONS.find(a => a.key === selectedProcessingActionKey)?.title || "AI Report";
    const plainSourceText = sourceText.includes("<") ? htmlToPlainText(sourceText) : sourceText;
    
    setIsProcessing(true);
    setActiveProcessingDisplayTitle(currentActionTitle);
    setError(null);
    setGroundingChunks([]);
    abortControllerRef.current = new AbortController();

    let contextualInfo = `Informazioni di contesto:\n- Lingua: ${transcriptionLanguage}\n`;
    if (audioDuration) contextualInfo += `- Durata audio: ${formatTime(audioDuration)}\n`;
    if (audioRecordingStartTime) contextualInfo += `- Data: ${audioRecordingStartTime.toLocaleString()}\n`;
    contextualInfo += "---\n\n";

    const sysPromptTemplate = getPromptText(systemPrompts ?? [], 'llm-system');
    let systemInstruction = sysPromptTemplate
      ? resolvePrompt(sysPromptTemplate, { LANGUAGE: transcriptionLanguage })
      : `Sei un assistente esperto in verbali di riunione. Usa sempre la lingua ${transcriptionLanguage}. Presta particolare attenzione ai nomi dei partecipanti che possono essere indicati sia nella trascrizione che nelle "Bubble Notes" supplementari.`;
    const activeCustomInstructions = (customInstructions ?? []).filter(r => r.enabled);
    if (activeCustomInstructions.length > 0) {
      systemInstruction += `\n\nRegole personalizzate da applicare sempre:\n${activeCustomInstructions.map(r => `- ${r.text}`).join('\n')}`;
    }
    const extraCtx = customContext ? `\n\nIstruzioni aggiuntive: "${customContext}"` : "";
    const defaultCustomContextAddition = extraCtx;
    
    const formattedDate = audioRecordingStartTime 
      ? audioRecordingStartTime.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

    const allParts: Part[] = [];
    allParts.push({ text: contextualInfo });
    const { parts: bubbleParts, imageMap } = serializeBubbleNotesForGeminiLocal(bubbleNotes);
    if (plainSourceText) allParts.push({ text: `Trascrizione principale:\n"${plainSourceText}"\n\n` });
    if (bubbleParts.length > 0) allParts.push(...bubbleParts);
    
    const resolveAnalysis = (id: string, fallback: string) => {
      const tpl = getPromptText(systemPrompts ?? [], id);
      return tpl ? resolvePrompt(tpl, { DATE: formattedDate, EXTRA: defaultCustomContextAddition }) : fallback;
    };

    let prompt = "";
    switch (selectedProcessingActionKey) {
      case 'default-minutes-concise':
        prompt = resolveAnalysis('analysis-minutes-concise',
          `Crea un verbale di riunione CONCISO e PROFESSIONALE.
        FORMATO: Deve essere pronto per essere incollato in una MAIL.
        - Inizia ESATTAMENTE con: "Salve a tutti,\n\na voi la minuta dell'incontro Oggetto: [Inserisci Oggetto] avuto in Data: ${formattedDate},"
        - Poi scrivi: "Partecipanti: [Elenca i partecipanti trovati nella trascrizione o nelle bubble notes]"
        - Separatore: "---"
        - Sezioni (usa ###): Obiettivo della Riunione, Punti Trattati e Dati Emersi, Decisioni Prese.
        - Fondamentale: Per "Punti Trattati", usa elenchi puntati nidificati per mostrare la gerarchia dei concetti.
        - Fondamentale: Crea una sezione "### Azioni e Prossimi Passi (To-Do List)" formattata come una TABELLA MARKDOWN con colonne: | Azione | Responsabile | Scadenza |.
        - Chiudi con: "Saluti"${defaultCustomContextAddition}`);
        break;
      case 'default-minutes-detailed':
        prompt = resolveAnalysis('analysis-minutes-detailed',
          `Crea un verbale di riunione DETTAGLIATO e COMPLETO.
        FORMATO: Deve essere pronto per essere incollato in una MAIL o DOCUMENTO.
        - Inizia ESATTAMENTE con: "Salve a tutti,\n\na voi la minuta dell'incontro Oggetto: [Inserisci Oggetto] avuto in Data: ${formattedDate},"
        - Poi scrivi: "Partecipanti: [Elenca i partecipanti trovati nella trascrizione o nelle bubble notes]"
        - Separatore: "---"
        - Sezioni (usa ###): Obiettivo della Riunione, Punti Trattati e Dati Emersi, Decisioni Prese.
        - Fondamentale: Per "Punti Trattati", cattura ogni sfumatura e dettaglio tecnico, usando elenchi puntati nidificati in modo molto chiaro.
        - Fondamentale: Crea una sezione "### Azioni e Prossimi Passi (To-Do List)" formattata come una TABELLA MARKDOWN con colonne: | Azione | Responsabile | Scadenza |.
        - Chiudi con: "Saluti"${defaultCustomContextAddition}`);
        break;
      case 'default-summary':
        prompt = resolveAnalysis('analysis-summary', `Riassumi il contenuto in modo coinciso.${defaultCustomContextAddition}`);
        break;
      case 'default-10points':
        prompt = resolveAnalysis('analysis-10points', `Estrai esattamente 10 punti chiave numerati.${defaultCustomContextAddition}`);
        break;
      case 'default-timeline':
        prompt = resolveAnalysis('analysis-timeline',
          `Crea un report HTML timeline professionale e dettagliato.
        REQUISITI DI STILE:
        - Usa CSS inline. Tema scuro (background: #111827; color: #f3f4f6;).
        - Font sans-serif moderno (Inter, system-ui).
        - Timeline con linea verticale accentata (border-left: 2px solid #3b82f6).
        - Ogni evento della timeline deve avere: Orario, Speaker (se rilevabile), Contenuto.

        REQUISITI DI CONTENUTO:
        - Analizza la trascrizione e dividila in blocchi logici o temporali (es. ogni 2-3 minuti o per cambio argomento).
        - Identifica i vari interlocutori (Diarization) e usa etichette chiare (es. "Speaker A", "Intervistatore", o nomi se citati).
        - INTEGRAZIONE BUBBLE NOTES: Inserisci le Bubble Notes nei punti temporali corretti della timeline.
        - Per ogni Bubble Note, scrivi una versione RIVISTA, CHIARA e PROFESSIONALE del suo contenuto.
        - IMMAGINI: Se una Bubble Note contiene un'immagine (riferita come [IMAGE_REF_B#_I#]), inserisci ESATTAMENTE questo tag HTML: <img src="[IMAGE_REF_B#_I#]" style="max-width:100%; border-radius:12px; margin:15px 0; border: 1px solid #374151; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">.

        FORMATO OUTPUT:
        - Restituisci SOLO il codice HTML contenuto in un div con classe "timeline-report".
        - Non includere blocchi di codice markdown (\`\`\`html).
        - Assicurati che l'HTML sia ben strutturato e leggibile.${defaultCustomContextAddition}`);
        break;
      case 'default-interview':
        prompt = resolveAnalysis('analysis-interview', `Formatta come intervista/dialogo.${defaultCustomContextAddition}`);
        break;
      default:
        prompt = `Segui queste istruzioni: ${customContext}`;
    }
    allParts.push({ text: prompt });

    try {
      const { text: result, groundingMetadata } = await llmService.generateText(allParts, settings, systemInstruction, abortControllerRef.current?.signal);
      const isHtmlType = selectedProcessingActionKey === 'default-timeline';
      const cleanResult = result.replace(/^```html\n?/, '').replace(/\n?```$/, '').trim();
      let finalHtml = isHtmlType ? cleanResult : markdownToHtmlSimple(cleanResult);

      if (isHtmlType) {
        imageMap.forEach((src, ref) => {
          finalHtml = finalHtml.split(`[${ref}]`).join(src);
          finalHtml = finalHtml.split(ref).join(src);
        });
      }

      onProcessingComplete(finalHtml, currentActionTitle); 
      if (settings.enhanceWithWebSearch && groundingMetadata?.groundingChunks) setGroundingChunks(groundingMetadata.groundingChunks);
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || err.message === 'Aborted')) {
        const msg = "Processing cancelled by user.";
        setError(msg);
        if (onProcessingError) onProcessingError(msg);
      } else {
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(`Errore: ${errMsg}`);
        if (onProcessingError) onProcessingError(errMsg);
      }
    } finally {
      setIsProcessing(false);
      if (isQuickProcessActive) onQuickProcessComplete();
    }
  }, [selectedProcessingActionKey, sourceText, bubbleNotes, customContext, transcriptionLanguage, settings, onProcessingComplete, audioDuration, audioRecordingStartTime, isQuickProcessActive, onQuickProcessComplete]);

  // Effect to trigger automatically when autoTrigger changes (Smart Pipeline)
  useEffect(() => {
    if (autoTrigger > 0 && autoTrigger > lastProcessedAutoTrigger.current && sourceText && sourceText.trim().length > 0) {
        lastProcessedAutoTrigger.current = autoTrigger;
        executeAnalysis();
    }
  }, [autoTrigger, sourceText, executeAnalysis]);

  /**
   * Enhanced helper to create a version of the HTML with high-fidelity inline styles
   * to survive Email clients (Outlook/Gmail) and look professional.
   */
  // DO add comment above each fix.
  // Fix: Added return statement and logic for getRichClipboardHtml to fix line 189 error where a function was not returning a value.
  const getRichClipboardHtml = (html: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Heading styling - Proportional styling for email clients
    tempDiv.querySelectorAll('h1, h2, h3').forEach(h => {
        (h as HTMLElement).style.color = '#38bdf8';
        (h as HTMLElement).style.borderBottom = '1px solid #374151';
        (h as HTMLElement).style.paddingBottom = '8px';
        (h as HTMLElement).style.marginTop = '24px';
        (h as HTMLElement).style.fontFamily = 'sans-serif';
    });
    
    tempDiv.querySelectorAll('table').forEach(table => {
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.marginTop = '16px';
        table.style.marginBottom = '16px';
        table.style.color = '#e5e7eb';
    });
    
    tempDiv.querySelectorAll('th, td').forEach(cell => {
        (cell as HTMLElement).style.border = '1px solid #4b5563';
        (cell as HTMLElement).style.padding = '8px';
        (cell as HTMLElement).style.textAlign = 'left';
    });

    return tempDiv.innerHTML;
  };

  const handleCopyText = async () => {
    if (!currentLlmResult) return;
    try {
      const richHtml = getRichClipboardHtml(currentLlmResult);
      const plainText = htmlToPlainText(currentLlmResult);
      
      const blobHtml = new Blob([richHtml], { type: 'text/html' });
      const blobText = new Blob([plainText], { type: 'text/plain' });
      const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
      
      await navigator.clipboard.write(data);
      setCopyButtonText("Copied (Rich)!");
      setTimeout(() => setCopyButtonText("Copy Text"), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setCopyButtonText("Copy Failed");
      setTimeout(() => setCopyButtonText("Copy Text"), 2000);
    }
  };

  const handlePrepareEmail = () => {
    if (!currentLlmResult) return;
    const body = htmlToPlainText(currentLlmResult);
    const subject = meetingTitle?.trim() || recordingTitle;

    let toEmails = (meetingAttendees ?? [])
      .filter(a => a.email && (!a.type || a.type === 'required'))
      .map(a => a.email);
    let ccEmails = (meetingAttendees ?? [])
      .filter(a => a.email && a.type === 'optional')
      .map(a => a.email);

    // Fallback: extract emails from bubble notes when no structured attendees available
    if (toEmails.length === 0) {
      const emailRegex = /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g;
      const noteText = bubbleNotes.map(n => htmlToPlainText(n.contentHtml)).join(' ');
      toEmails = [...new Set(noteText.match(emailRegex) ?? [])];
    }

    // mailto: requires proper percent-encoding; URLSearchParams uses + for spaces which breaks Outlook
    const parts = [
      `subject=${encodeURIComponent(subject)}`,
      `body=${encodeURIComponent(body)}`,
    ];
    if (ccEmails.length > 0) parts.push(`cc=${encodeURIComponent(ccEmails.join(', '))}`);

    window.location.href = `mailto:${encodeURIComponent(toEmails.join(', '))}?${parts.join('&')}`;
  };

  const handleDownloadLlmResult = () => {
    if (currentLlmResult) {
        const typeSuffix = activeProcessingDisplayTitle ? activeProcessingDisplayTitle.replace(/\s+/g, '_').toLowerCase() : 'llm_result';
        const baseFileName = audioFileName ? `${audioFileName.split('.')[0]}_${typeSuffix}` : typeSuffix;
        const metadata = generateStandardMetadataHeader(
            audioRecordingStartTime ?? null,
            audioFileName,
            { llmProcessingType: activeProcessingDisplayTitle || 'Unknown', transcriptionLanguage }
        );
        const isHtmlType = selectedProcessingActionKey === 'default-timeline';
        const contentToSave = isHtmlType ? currentLlmResult : htmlToPlainText(currentLlmResult);
        const format = isHtmlType ? TranscriptionOutputFormat.HTML : TranscriptionOutputFormat.TXT;
        
        saveTextToFile(contentToSave, baseFileName, format, isHtmlType ? undefined : (metadata || undefined));
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg shadow-lg space-y-6">
      <h3 className="text-xl font-semibold text-sky-400">LLM Processing (Provider: {settings.provider} | Model: {settings.model})</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2">
            <Select
            label="Select Processing Action:"
            id="llmProcessingAction"
            options={DEFAULT_ACTIONS.map(a => ({ value: a.key, label: a.title }))}
            value={selectedProcessingActionKey}
            onChange={(e) => setSelectedProcessingActionKey(e.target.value)}
            disabled={isProcessing || disabled}
            />
        </div>
        <Button onClick={isProcessing ? stopProcessing : executeAnalysis} disabled={disabled || (!isProcessing && !sourceText)} variant={isProcessing ? "danger" : "primary"} className="w-full">
          {isProcessing ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
              Stop Processing
            </div>
          ) : "Process Text"}
        </Button>
      </div>

      <TextArea
        label="Custom Instructions / Context:"
        id="customContextInput"
        value={customContext}
        onChange={(e) => setCustomContext(e.target.value)}
        placeholder="e.g., Focus on financial aspects, or, Use a formal tone."
        disabled={isProcessing || disabled}
        rows={3}
      />

      {error && <p className="text-red-400 text-sm" role="alert">Error: {error}</p>}

      {currentLlmResult && !isProcessing && activeProcessingDisplayTitle && (
        <div className="space-y-2">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <label className="block text-sm font-medium text-gray-300">
              Result from {settings.provider} ({activeProcessingDisplayTitle}):
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDownloadLlmResult} variant="ghost" size="sm" leftIcon={<DownloadIcon className="w-4 h-4"/>}>Download</Button>
              <Button onClick={handleCopyText} variant="ghost" size="sm" leftIcon={<CopyIcon className="w-4 h-4"/>}>{copyButtonText}</Button>
              <Button onClick={() => setIsEditorModalOpen(true)} variant="ghost" size="sm" leftIcon={<EditPencilIcon className="w-4 h-4"/>}>Edit Result</Button>
              {isWindows && (
                <Button onClick={handlePrepareEmail} variant="ghost" size="sm">
                  ✉ Prepare Email
                </Button>
              )}
            </div>
          </div>
          <div
            id="llmResultOutputDisplay"
            className="llm-result-display-prose" 
            dangerouslySetInnerHTML={{ __html: currentLlmResult }} 
          />
          {groundingChunks.length > 0 && (
            <div className="mt-2 p-3 bg-gray-700 rounded">
              <h4 className="text-sm font-semibold text-gray-300 mb-1">Sources:</h4>
              <ul className="list-disc list-inside text-xs space-y-1">
                {groundingChunks.map((chunk, index) =>
                  chunk.web?.uri ? (
                    <li key={index}>
                      <a href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
                        {chunk.web.title || chunk.web.uri}
                      </a>
                    </li>
                  ) : null
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {isEditorModalOpen && (
        <RichTextEditorModal
          isOpen={isEditorModalOpen}
          onClose={() => setIsEditorModalOpen(false)}
          initialContent={currentLlmResult} 
          onSave={(h) => onLlmResultUpdate(h, activeProcessingDisplayTitle || 'AI Report')} 
          currentLanguage={transcriptionLanguage}
          llmSettings={settings}
        />
      )}
    </div>
  );
});
