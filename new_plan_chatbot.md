Ready for review
Select text to add comments on the plan
Plan: Chatbot Dual Mode — Sessione + Archivio Storico
Context
Il chatbot attuale risponde solo sul contesto della sessione corrente (trascritto, AI Analysis, bubble notes passati come props). L'utente vuole aggiungere una seconda modalità "Archivio" che interroga tutte le sessioni storiche in IndexedDB, abilitando query come "quante sessioni totali?", "sessioni sull'AI nell'ultimo mese", "appuntamenti con Mario Rossi".

Approccio
Un toggle pill nell'header del panel (Sessione | Archivio) cambia la modalità. In modalità Archivio:

MeetingChatPanel carica tutte le sessioni via db.getAllSessions() direttamente
Costruisce un system prompt diverso con i dati storici aggregati
Usa una archiveChatHistory separata (non inquina la history della sessione corrente)
Il tab Chat diventa usabile anche senza sessione corrente
Architettura: scelte chiave
Dove gestire il toggle: stato locale in MeetingChatPanel — il componente chiama già db indirettamente (chat viene salvata in DB). Caricare le sessioni direttamente qui evita di sporcare NewHome.tsx.

Cosa mettere nel prompt storico: per ogni sessione (max 15):

Metadati: id, name, timestamp (formattato), audioDuration, status, linkedCalendarEventSubject
transcribedText (testo plain, no HTML)
llmProcessedText (AI Analysis)
bubbleNotes (solo campo .content in text — no immagini/blob)
NO audioBlob, chunks, inlineDataParts (binary escluso)
Con max 15 sessioni e trascritti medi, rientra nel context window di Gemini Flash 2.5.

Token safety: se il testo storico supera 400k chars (stima conservativa), troncare i trascritti a 2000 char/sessione e aggiungere nota nel prompt.

Files da modificare
components/MeetingChatPanel.tsx — principale
Aggiungere import { db } from '@/utils/db' (già usato altrove nel progetto)
Stato locale:
const [chatMode, setChatMode] = useState<'session' | 'archive'>('session')
const [archiveChatHistory, setArchiveChatHistory] = useState<MeetingChatMessage[]>([])
const [allSessionsData, setAllSessionsData] = useState<SavedSession[] | null>(null)
const [isLoadingArchive, setIsLoadingArchive] = useState(false)
useEffect su chatMode === 'archive' → chiama db.getAllSessions() → setta allSessionsData
Toggle UI nell'header del panel (pill: "Sessione" / "Archivio") — visibile sempre
Funzione buildArchiveSystemPrompt(sessions) → stringa con metadati + testi di tutte le sessioni
Nella funzione handleSend:
Se chatMode === 'archive': usa archiveChatHistory, prompt archivio, nessun sessionContext
Se chatMode === 'session': comportamento invariato
Placeholder textarea: "Cerca in tutte le sessioni..." in archive mode
Empty state: in archive mode mostra "Interroga il tuo archivio storico" anche senza sessione corrente
Export chat: distinguere i due history
pages/NewHome.tsx — minimo
Nessuna modifica strutturale necessaria. Il toggle è self-contained in MeetingChatPanel.
Nuovo helper (inline in MeetingChatPanel, non file separato)
function buildArchiveSystemPrompt(sessions: SavedSession[]): string {
  const items = sessions.map(s => {
    const date = new Date(s.timestamp).toLocaleDateString('it-IT', { dateStyle: 'full' })
    const dur = `${Math.round((s.data.audioDuration ?? 0) / 60)} min`
    const notes = (s.data.bubbleNotes ?? [])
      .map(n => stripHtml(n.content))
      .filter(Boolean)
      .join(' | ')
    return [
      `## Sessione: "${s.name}" (ID: ${s.id})`,
      `Data: ${date} | Durata: ${dur} | Stato: ${s.status}`,
      s.data.linkedCalendarEventSubject ? `Evento calendario: ${s.data.linkedCalendarEventSubject}` : '',
      s.data.transcribedText ? `Trascritto:\n${truncate(s.data.transcribedText, 3000)}` : '(nessun trascritto)',
      s.data.llmProcessedText ? `AI Analysis:\n${truncate(s.data.llmProcessedText, 1500)}` : '',
      notes ? `Note utente: ${notes}` : '',
    ].filter(Boolean).join('\n')
  })
  return `Sei un assistente AI con accesso all'archivio storico di ${sessions.length} sessioni di registrazione...
${items.join('\n\n---\n\n')}`
}
stripHtml e truncate già esistono o sono 3 righe inline.

System prompt differenziale
Archivio (nuovo):

Sei un assistente AI con accesso all'archivio storico completo di N sessioni di registrazione.
Puoi rispondere a domande statistiche, cercare informazioni specifiche, confrontare sessioni.
Rispondi sempre nella lingua dell'utente. Usa solo i dati forniti.
Data di oggi: [data corrente iniettata runtime].
[dati sessioni]
Sessione (invariato): usa chatSystemInstruction esistente.

UI del toggle
Pill compatta nell'header del panel, a destra dell'icona chat:

[💬 Sessione] [🗂 Archivio]
In archive mode: badge "N sessioni" small
Loading spinner mentre carica dal DB
Se allSessionsData è []: messaggio "Nessuna sessione salvata"
Verification
npm run lint — zero errori TypeScript
Aprire app: toggle visibile nella tab Chat
Senza sessione corrente → Archivio funziona, Sessione mostra empty state normale
Con sessione corrente → entrambe le modalità funzionano
Inviare query archivio: "quante sessioni hai?" → risposta corretta
Query con data: "sessioni dell'ultimo mese" → filtra correttamente
Verificare che meetingChatHistory (sessione) non venga modificata in archive mode
Navigare tra sessioni salvate → history archivio persiste (stato locale panel)
