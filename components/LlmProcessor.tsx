
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Part } from "@google/genai";
import { llmService } from '../services/geminiService';
import { Button } from './common/Button';
import { Select } from './common/Select'; 
import { TextArea } from './common/TextArea'; 
import { AppSettings, CustomInstruction, SystemPrompt, GroundingChunk, SupportedLanguage, TranscriptionOutputFormat, BubbleNote, SavedSessionData } from '../types';
import { buildCorrelatedSessionsContext } from '../utils/correlationContext';
import { resolvePrompt, getPromptText } from '../utils/promptUtils';
import { RichTextEditorModal } from './RichTextEditorModal';
import { EditIcon as EditPencilIcon, SaveIcon as CopyIcon, DownloadIcon } from '../constants'; 
import { formatTime, htmlToPlainText, markdownToHtmlSimple } from '../utils/textUtils';
import { saveTextToFile, generateStandardMetadataHeader } from '../utils/fileUtils';
import { sanitizeHtml } from '../utils/sanitize';

interface LlmProcessorProps {
  sourceText: string; 
  bubbleNotes: BubbleNote[];
  onProcessingComplete: (processedText: string, type: string, usage?: { inputTokens: number; outputTokens: number }) => void;
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
  resultType?: string;
  correlatedSessionsData?: SavedSessionData[];
  useHistoricalContext?: boolean;
}

const DEFAULT_ACTIONS = [
  { key: 'default-custom-only', title: 'Use Only Custom Instructions' },
  { key: 'default-summary', title: 'Generate Summary' },
  { key: 'default-minutes-concise', title: 'Write Minutes (Concise - Email Style)' },
  { key: 'default-minutes-detailed', title: 'Write Minutes (Detailed - Email Style)' },
  { key: 'default-action-items', title: 'Extract Action Items & Decisions' },
  { key: 'default-10points', title: 'List in 10 Brief Points' },
  { key: 'default-interview', title: 'Format as Interview/Dialogue' },
  { key: 'default-timeline', title: 'Create HTML Timeline Report' },
];

const MEETING_TEMPLATES = [
  { key: 'technical', label: '🔧 Riunione Tecnica', analysisKey: 'default-action-items', context: 'Riunione tecnica con cliente. Focus su requisiti raccolti, decisioni architetturali e action item per la documentazione tecnica.' },
  { key: 'interview', label: '🎤 Colloquio', analysisKey: 'default-interview', context: 'Sessione di colloquio o intervista. Identifica domande poste, risposte e valutazioni emerse.' },
  { key: 'presentation', label: '📊 Presentazione', analysisKey: 'default-summary', context: 'Sessione di presentazione. Riassumi i punti chiave presentati e le domande del pubblico.' },
  { key: 'standup', label: '⚡ Standup', analysisKey: 'default-10points', context: 'Daily standup. Estrai: cosa è stato fatto, cosa si farà, eventuali blocchi.' },
];

export interface LlmProcessorRef {
  stopProcessing: () => void;
}

const LlmProcessorBase = React.forwardRef<LlmProcessorRef, LlmProcessorProps>(({
  sourceText,
  bubbleNotes,
  onProcessingComplete,
  currentLlmResult, 
  onLlmResultUpdate,
  settings,
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
  correlatedSessionsData,
  useHistoricalContext = true,
}, ref) => {
  const [customContext, setCustomContext] = useState<string>("");
  const [activeProcessingDisplayTitle, setActiveProcessingDisplayTitle] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [groundingChunks, setGroundingChunks] = useState<GroundingChunk[]>([]);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState<boolean>(false);
  const [selectedProcessingActionKey, setSelectedProcessingActionKey] = useState<string>('default-minutes-concise');
  const [selectedMeetingTemplate, setSelectedMeetingTemplate] = useState<string>('');
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
      if (bubble.inlineDataParts && bubble.inlineDataParts.length > 0) {
        allParts.push({ text: `[Documento allegato: ${bubble.inlineDataParts.length} parte/i (${bubble.documentMode ?? 'text'})]` });
        for (const part of bubble.inlineDataParts) {
          allParts.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
        }
      }
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
    if (useHistoricalContext && correlatedSessionsData?.length) {
      contextualInfo = buildCorrelatedSessionsContext(correlatedSessionsData) + '\n\n' + contextualInfo;
    }

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
          `Crea una minuta di riunione BREVE e PRONTA PER L'INVIO via email. Massimo 250 parole nel corpo, escludendo intestazione e tabella azioni.
        - Inizia ESATTAMENTE con: "Salve a tutti,\n\na voi la minuta dell'incontro Oggetto: [deduci l'oggetto dal contenuto della trascrizione] avuto in Data: ${formattedDate},"
        - Poi scrivi: "Partecipanti: [elenca i partecipanti trovati nella trascrizione o nelle bubble notes]"
        - Separatore: "---"
        - ### Obiettivo: una riga.
        - ### Punti chiave: massimo 5 bullet sintetici (una riga ciascuno, no sotto-bullet).
        - ### Decisioni: elenco puntato solo delle decisioni definitive.
        - ### To-Do: tabella markdown | Azione | Responsabile | Scadenza |
        - Chiudi con: "Saluti"${defaultCustomContextAddition}`);
        break;
      case 'default-minutes-detailed':
        prompt = resolveAnalysis('analysis-minutes-detailed',
          `Crea un verbale di riunione COMPLETO E APPROFONDITO, adatto come documento di riferimento tecnico.
        - Inizia ESATTAMENTE con: "Salve a tutti,\n\na voi la minuta dell'incontro Oggetto: [deduci l'oggetto dal contenuto della trascrizione] avuto in Data: ${formattedDate},"
        - Poi scrivi: "Partecipanti: [elenca i partecipanti con ruolo se desumibile dalla trascrizione]"
        - Separatore: "---"
        - ### Obiettivo della Riunione: 2-3 righe di contesto e scopo.
        - ### Punti Trattati e Dati Emersi: per ogni macro-argomento un sotto-titolo #### con elenchi nidificati. Cattura ogni dettaglio tecnico, dato, cifra, vincolo o requisito menzionato.
        - ### Decisioni Prese: elenco con il razionale di ogni decisione se emergente dalla discussione.
        - ### Elementi di Rischio o Attenzione: problemi, dubbi, dipendenze critiche emerse.
        - ### To-Do e Prossimi Passi: tabella markdown | Azione | Responsabile | Scadenza | Note |
        - Chiudi con: "Saluti"${defaultCustomContextAddition}`);
        break;
      case 'default-summary':
        prompt = resolveAnalysis('analysis-summary',
          `Produci un sommario professionale della riunione.
- **Contesto**: una riga su chi si è incontrato e perché.
- **Punti principali**: 3-5 bullet con i temi discussi e i dati chiave emersi.
- **Decisioni**: elenco delle decisioni prese (ometti se nessuna).
- **Azioni**: elenco sintetico degli action items (ometti se nessuno).
Tono neutro e professionale. Massimo 150 parole.${defaultCustomContextAddition}`);
        break;
      case 'default-10points':
        prompt = resolveAnalysis('analysis-10points',
          `Estrai esattamente 10 punti chiave dalla riunione. Ordina per importanza decrescente, non per ordine cronologico. Ogni punto deve essere autonomo e comprensibile senza leggere gli altri — evita riferimenti come "come detto sopra". Usa frasi complete e concise.${defaultCustomContextAddition}`);
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
      case 'default-action-items':
        prompt = resolveAnalysis('analysis-action-items',
          `Analizza la trascrizione ed estrai le informazioni operative in italiano.

## ✅ Action Items
Tabella markdown con le azioni concrete emerse. Se responsabile o scadenza non sono menzionati scrivi "—".
| Azione | Responsabile | Scadenza |
|--------|-------------|---------|

## 🟡 Decisioni Prese
Elenco puntato delle decisioni definitive prese durante la riunione.

## ❓ Punti Aperti
Questioni rimaste in sospeso o da chiarire in un prossimo step.

## 📋 Prossimi Passi Consigliati
Sequenza logica di azioni raccomandate per dare seguito alla riunione.

Se una sezione è vuota scrivi "Nessuno."${defaultCustomContextAddition}`);
        break;
      case 'default-interview':
        prompt = resolveAnalysis('analysis-interview', `Formatta come intervista/dialogo.${defaultCustomContextAddition}`);
        break;
      default:
        prompt = `Segui queste istruzioni: ${customContext}`;
    }
    allParts.push({ text: prompt });

    try {
      const { text: result, groundingMetadata, usageMetadata } = await llmService.generateText(allParts, settings, systemInstruction, abortControllerRef.current?.signal);
      const isHtmlType = selectedProcessingActionKey === 'default-timeline';
      const cleanResult = result.replace(/^```html\n?/, '').replace(/\n?```$/, '').trim();
      let finalHtml = isHtmlType ? cleanResult : markdownToHtmlSimple(cleanResult);

      if (isHtmlType) {
        imageMap.forEach((src, ref) => {
          finalHtml = finalHtml.split(`[${ref}]`).join(src);
          finalHtml = finalHtml.split(ref).join(src);
        });
      }

      onProcessingComplete(finalHtml, currentActionTitle, usageMetadata ? { inputTokens: usageMetadata.inputTokens, outputTokens: usageMetadata.outputTokens } : undefined);
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
    
    // Email clients render on a white background, so use dark text + light borders.
    // (The in-app dark theme uses light text — that does NOT carry over to Outlook/Gmail.)
    tempDiv.querySelectorAll('table').forEach(table => {
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.marginTop = '16px';
        table.style.marginBottom = '16px';
        table.style.color = '#111827';
        table.style.fontFamily = 'sans-serif';
        table.style.fontSize = '14px';
    });

    tempDiv.querySelectorAll('th').forEach(cell => {
        (cell as HTMLElement).style.border = '1px solid #d1d5db';
        (cell as HTMLElement).style.padding = '8px 10px';
        (cell as HTMLElement).style.textAlign = 'left';
        (cell as HTMLElement).style.backgroundColor = '#f3f4f6';
        (cell as HTMLElement).style.color = '#111827';
        (cell as HTMLElement).style.fontWeight = '600';
    });

    tempDiv.querySelectorAll('td').forEach(cell => {
        (cell as HTMLElement).style.border = '1px solid #d1d5db';
        (cell as HTMLElement).style.padding = '8px 10px';
        (cell as HTMLElement).style.textAlign = 'left';
        (cell as HTMLElement).style.color = '#111827';
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

  const handlePrepareEmail = async () => {
    if (!currentLlmResult) return;
    const subject = meetingTitle?.trim() || recordingTitle;
    const richHtml = getRichClipboardHtml(currentLlmResult);

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

    // Preferred path: Outlook COM bridge (Windows). Preserves HTML formatting from "Copy Text"
    // and uses ';' as recipient separator (Outlook's native convention).
    try {
      const resp = await fetch('/api/outlook/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toEmails, cc: ccEmails, subject, htmlBody: richHtml }),
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data?.ok) return;
      }
    } catch {
      // bridge unavailable, fall back to mailto
    }

    // Fallback: mailto. RFC 6068 specifies ',' between addresses, but user requested ';' (Outlook
    // convention). Outlook on Windows accepts both; webmail clients typically expect ','. We honor
    // the explicit user preference here.
    const body = htmlToPlainText(currentLlmResult);
    const parts = [
      `subject=${encodeURIComponent(subject)}`,
      `body=${encodeURIComponent(body)}`,
    ];
    if (ccEmails.length > 0) parts.push(`cc=${encodeURIComponent(ccEmails.join('; '))}`);

    window.location.href = `mailto:${encodeURIComponent(toEmails.join('; '))}?${parts.join('&')}`;
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
      
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Tipo riunione</p>
        <div className="flex flex-wrap gap-2">
          {MEETING_TEMPLATES.map(t => (
            <button
              key={t.key}
              onClick={() => {
                const isActive = selectedMeetingTemplate === t.key;
                setSelectedMeetingTemplate(isActive ? '' : t.key);
                if (!isActive) {
                  setSelectedProcessingActionKey(t.analysisKey);
                  setCustomContext(t.context);
                }
              }}
              disabled={isProcessing || disabled}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                selectedMeetingTemplate === t.key
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-gray-700/60 border-gray-600 text-gray-300 hover:border-sky-600 hover:text-sky-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

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
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Stop Processing
            </span>
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
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentLlmResult) }}
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
LlmProcessorBase.displayName = 'LlmProcessor';
export const LlmProcessor = React.memo(LlmProcessorBase);
