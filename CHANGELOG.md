# Changelog

Ogni versione elenca solo le modifiche rilevanti. Stile minimale: una riga per punto, niente ridondanze.

---

## [Unreleased]

- `NoteEditor`: area testo +50% altezza (min 108px / max 270px), sfondo leggermente distinto
- `NoteStaticToolbar`: icone 2× (size 22), padding aumentato
- `NoteTimeline`: layout 5 nodi per riga boustrophedon, preview testo/thumbnail dentro la sfera (80px), S-curve SVG tratteggiata tra le righe
- `NoteTimelineItem`: sfera 80px con preview contenuto, popup hover con Open/Delete
- `NeoAudioGuideModal`: redesign completo — layout compatto, 3 step icon-led, nessun banner warning, nessun toggle mockup; footer 2 pulsanti allineati ("Solo mic" + "Condividi schermo")
- Bubble Notes redesign: timeline verticale, editor Tiptap v3, toolbar floating + statica, Lucide icons
- `useVideoRecorder`: registrazione schermo progressiva VP9 WebM su disco, chunk ogni 60s, zero IndexedDB
- `NoteActionsHeader`: icone Lucide, badge REC pulsante rosso con contatore chunk
- `BubbleNotes`: `NoteTimeline` + `NoteEditor` sostituiscono griglia `NoteBubble` e `NoteEditorToolbar`
- `displayStream` esposto via `AudioRecorderRef.getDisplayStream()` e passato a `BubbleNotes`
- Rimossi `NoteBubble.tsx` e `NoteEditorToolbar.tsx` (componenti legacy)
- Screenshot type tagging: auto-screenshot → `type: 'auto-screenshot'`, manuale → `type: 'screenshot'`

---

## [1.128] — 2026-06-29

- Fix notifiche meeting: `useCalendarSync` ora popola `calAppointments` anche da eventi extension v2; prima `useMeetingNotifications` riceveva array vuoto
- `useHeadphoneDetection`: nuovo hook — rileva cuffie cablate e Bluetooth via `enumerateDevices()` + listener `devicechange`
- `AudioSettings`: aggiunto campo `autoDetectHeadphones` (default `true`); toggle in Settings → Audio
- `NeoRecordingPanel`: pulsante "Mic only" e "+ System audio" fusi in un singolo "Record" smart — cuffie rilevate → guide modal System Audio, altrimenti mic only diretto
- `NeoRecordingPanel`: icona mic sempre verde (sinistra), icona cuffie a destra — verde se rilevate, grigio con diagonale rossa se assenti
- `NeoRecordingPanel`: rimosso banner testuale headphone detection e pulsante separato "+ System audio"

---

## [1.127] — 2026-06-29

- Rinominato "NewCalendar" → "Calendar" nella topbar e nel titolo del modal; "Calendar" (vecchio) → "Old Calendar"
- Rimosso pulsante "Calendar" (deprecated) dalla topbar; accesso a Old Calendar spostato nell'header del modal Calendar
- `NeoTopbar`: rimosso `CalendarDeprecatedButton`, prop `onOpenCalendar` e `calendarSyncing`; rimossi import `useState`/`useRef`/`useEffect` non più usati

---

## [1.126] — 2026-06-29

- Eliminata cartella `/extension/` (sorgente extension v1) e `scripts/build-extension.sh` (build v1)
- NewCalendar: due pill distinte — "Plugin attivo/offline" (viola/rosso) e "Outlook Live/offline/fetching/inattivo" (verde/rosso/giallo/grigio)
- Extension v2 `background.js`: scrive `cal-bridge-v2-outlook-state` e `cal-bridge-v2-ext-ts` in localStorage su ogni cambio di stato Outlook (ok/error/idle/fetching)
- `useCalBridgeV2`: legge `extensionOnline` (da `cal-bridge-v2-ext-ts` < 5min) e `outlookState` separati
- `useCalendarSync`: espone `calOutlookState` derivato dall'estensione; `calExtensionConnected` ora riflette solo presenza heartbeat reale
- NewCalendar: sync extension ora attende risposta reale (max 6s); timeout → errore; estensione offline → blocco immediato senza falso "Aggiornato!"
- NewCalendar: bottone sync mostra "Ultimo sync Xm/h/g fa" nello stato idle; "Offline" quando estensione disconnessa
- NewCalendar: rimossa sezione "Il mio calendario" dalla sidebar
- NewCalendar: `lastSyncAt` persistito da localStorage e aggiornato ad ogni sync riuscita (tutte le sorgenti)
- NewCalendar: keyword search estesa a tutti i campi evento (location, organizer, body, attendees) con normalizzazione NFD (diacritici insensibili)
- NewCalendar: pill "Riunioni trovate" mostrate sotto la barra di ricerca keyword — click naviga al giorno/evento; solo sorgenti extension supportano `calOutlookState`
- Fix: `apiKey` passato a `NewCalendarView` usa fallback `process.env.API_KEY` (env var) quando nessuna chiave custom è configurata
- Fix: `CalEventDetailPanel` — spostato early return `if (!event) return null` dopo tutti gli hook (`useId`, `useFocusTrap`) per rispettare rules of hooks; click su risultati ricerca calendar non causava più errore "Rendered more hooks"
- Rimosso "Cerca con AI" (semantic search) dal calendario: pulsante, `AiResultsPanel`, `useSemanticSearch`, prop `apiKey`/`llmModel`/`onAiSearchRequest` da `NewCalendarViewProps`; pill keyword e risultati riunioni sempre visibili durante ricerca

---

## [1.125] — 2026-06-28

- B1 Phase 1: `contexts/SettingsContext.tsx` — `useReducer` per `appSettings + hasCustomApiKey + isReady`; init asincrono (localStorage migrate + IndexedDB decrypt), sync tema, `saveCustomApiKey`/`deleteCustomApiKey`/`persistSettings` come callback stabili; `<SettingsProvider>` in `index.tsx`; `NewHome` usa `useSettings()` (rimossi `APP_SETTINGS_KEY`, init effect settings, theme effect, `handleSaveCustomApiKey`, `handleDeleteCustomApiKey`)
- B1 Phase 2: `contexts/UIStateContext.tsx` — 14 pezzi di stato UI estratti da `NewHome` (modal flags, `isBusy`, `appUserMessage`, `activeRightTab`, `leftWidthPct`, calendar flags); stessi nomi esposti via `useUIState()` → zero call-site changes in `NewHome`; `<UIStateProvider>` in `index.tsx`
- B1 Phase 3: `contexts/SessionContext.tsx` — 28 pezzi di stato sessione estratti da `NewHome` (audio, trascrizione, LLM, pipeline FSM, bubble notes, recording state, saved sessions); azioni composte `resetSession`, `fetchSessions`, `addLlmUsageStat`; `resetAllDataStates` in `NewHome` semplificato a 4 righe; `<SessionProvider>` in `index.tsx`
- B9 `hooks/usePipelineEffects.ts` — estratti da `NewHome` tutti i 10 `useEffect` del FSM pipeline (DB sync batched, transizioni IDLE/RECORDING/TRANSCRIBING/ANALYZING/DOWNLOADING/COMPLETED, ZIP worker, init crashed sessions, source text sync); `NewHome` 1270→1117 righe
- B2 espanso: `migrateSettings` esportata e testata (9 casi: defaults, preserva valori esistenti, language fallback, diarization fallback, systemPrompts merge/dedup, immutabilità input); `SessionContext` testata (6 casi: resetSession con/senza preserveBubbleNotes, addLlmUsageStat accumulo, fetchSessions, stato iniziale); `vitest.config.ts` ora include `.test.tsx`

---

## [1.124] — 2026-06-28

- Accessibilità modali: `common/Modal` ora con `role="dialog"`, `aria-modal`, `aria-labelledby` (titolo), focus trap e chiusura con Esc → copre tutti i modali condivisi (`ConfirmModal` incluso)
- Hook `useFocusTrap` (ciclo Tab/Shift+Tab, focus iniziale, Esc, ripristino focus all'unmount) + test
- Timer registrazione: `role="timer"` + `aria-live="polite"` per screen reader (`NeoRecordingPanel`)
- Rimosso `console.log` di debug in `common/Modal`
- Accessibilità modali custom (`OutlookCalendarModal`, `FullscreenNotesViewer`, `CalEventDetailPanel`): `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap + Esc; ARIA additivo su `NeoAudioGuideModal`
- Sweep `aria-label` su 8 bottoni icon-only senza nome accessibile (`CorrectionChat`, `PipRecordingWidget`, `NewCalendarView`, `NeoCalendarDayView`)
- Quick win: `appStatistics` usa `TextEncoder().encode().length` invece di `new Blob([text]).size` (no alloc) — `NewHome`
- Quick win: `key` lista coda da `name-index` a `name+size` — `TranscriptionView`
- Quick win: `.catch` su invio audio realtime fire-and-forget — `useLiveTranscriptionLogic`
- `types/errors.ts`: `AppError` discriminated union (kind: network/quota/timeout/abort/permission/unknown) + `classifyError(e)` + `classifyServiceErrorString`
- `hooks/useErrorHandler.ts`: `handleAsync` wrapper con state `{error, retry, dismiss}` per errori async tipizzati
- `useTranscriptionLogic`: catch nei 4 hotspot usano `classifyError` → errore tipizzato loggato + abort ignorato silenziosamente
- `transcriptionService`: re-throw AbortError (ora `classifyError` lo vede correttamente); `console.*` → `loggingService`
- B9 split `NewHome.tsx` 1863→1411 righe: estratti `hooks/useCalendarSync.ts` (sincronizzazione calendario, BroadcastChannel, ICS, throttle cross-tab) e `hooks/useMeetingFlow.ts` (toast notifiche meeting, auto-start countdown)

---

## [1.123] — 2026-06-28

- Infrastruttura test: Vitest + happy-dom (`vitest.config.ts`, script `test`/`test:watch`)
- Test `geminiService`: rate limiter (attesa a finestra piena, no attesa sotto soglia), circuit breaker (trip dopo 3 errori, reset dopo successo), guardie config
- Isolamento stato modulo nei test via `vi.resetModules()` + import dinamico; `loggingService` mockato
- Test `useTranscriptionLogic` (React Testing Library + `renderHook`): coda (enqueue/dedup/reorder/remove/rename), flusso trascrizione (scrittura testo, usage stat, mark transcribed), errore `Error:` → `transcriptionError`, escape filename nell'header (XSS), `stopTranscription` (abort + notifica)
- TS strict: abilitati `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- Rimossi 5 `as any` (tipizzazione `webkitAudioContext`, `navigator.connection`, `inputTranscription.isFinal`, import JSON sessione)
- Rimosso dead code (import/var/param morti) in ~18 file; `useEffect` con `return undefined` esplicito sui path mancanti

---

## [1.122] — 2026-06-28

- Docs: `ARCHITECTURE.md` (entry point, pipeline, layer, affidabilità API) e `docs/DB_SCHEMA.md` (schema IndexedDB)
- Docs: JSDoc su `geminiService`, `transcriptionService`, `loggingService`, `useAudioRecorder`, `useTranscriptionLogic`
- Fix `CLAUDE.md` obsoleto: god-component `NewHome.tsx` (non `App.tsx`), `MAX_SESSIONS` 15 (non 5)
- `useAudioRecorder`: cleanup su unmount (mic stream, interval chunk, live session) per evitare leak se il component smonta durante la registrazione

---

## [1.121] — 2026-06-28

- Perf re-render: `React.memo` su `NeoRecordingPanel`, `BubbleNotes`, `TranscriptionView`, `LlmProcessor`
- `NewHome`: handler inline (stop playback, toggle auto-save/auto-pipeline, reset, screenshot, diarization) estratti in `useCallback`; `customInstructions`/`systemPrompts` in `useMemo`
- `useTranscriptionLogic`: handler resi `useCallback`-stabili via `latestRef` (identità stabile per le memo, no stale closure)
- `geminiService`: rate limiter pulisce i timestamp scaduti con 1 `splice` invece di `shift` ripetuti

---

## [1.120] — 2026-06-28

- Sanitizzazione XSS via DOMPurify su output LLM/trascrizioni renderizzati con `dangerouslySetInnerHTML` (`TranscriptionView`, `LlmProcessor`, `MeetingChatPanel`, `BubbleNoteViewerModal`)
- Sanitizzazione `htmlContent` e escape metadati (titolo, nome file) nell'export HTML (`fileUtils`)
- Escape `file.name` negli header di trascrizione (`useTranscriptionLogic`)
- Helper `utils/sanitize.ts` (`sanitizeHtml`, `escapeHtml`)
- Fix vulnerabilità dipendenze: `vite` 6.4.2→6.4.3, `protobufjs` 7.6.1→7.6.4 (`npm audit fix`)
- Error handling IndexedDB: helper `dbOp` avvolge ogni op di `utils/db.ts` in try/catch, logga `DB_ERROR` via `loggingService` e propaga l'errore alla UI (no fallimenti silenziosi su quota exceeded / DB corrotto)
- `NewHome`: `saveSession` di avvio registrazione protetto — su errore DB annulla la sessione e mostra messaggio utente invece di avviare una registrazione fantasma

---

## [1.119] — 2026-06-24

- Rimosso `TranscriptionQuality` enum e campo `quality` da `TranscriptionSettings` — era solo variazione di prompt, nessun effetto reale su velocità o modello
- `transcriptionService`: prompt accuratezza massima sempre fisso (era condizionale su LEVEL_5)
- `SettingsPanel`, `TranscriptionTab`: rimosso selector "Quality Level"
- `README.md`: redesign visivo — hero section con badge shields.io, emoji per sezioni, tabelle stack con badge, sezioni collassabili (Project Structure, Changelog, Technical Notes), footer

---

## [1.118] — 2026-06-24

- Settings > General: card "Aggiornamento App" con verifica versione remota via `raw.githubusercontent.com` e apply via `git fetch + reset --hard`
- Tasto "Forza aggiornamento" sempre visibile dopo verifica, anche se già aggiornato
- URL repository configurabile (default `https://github.com/carmelobattiato/audio-ai-assistant`), gestione raw URL automatica lato server
- `AppearanceSettings`: aggiunto campo `githubRepoUrl`
- `NewHome`: migrazione `appearance` aggiunta al merge dei defaults (fix campi nuovi non applicati da localStorage)
- `vite.config.ts`: `updatePlugin` — endpoint `GET /api/update/check` e `POST /api/update/apply` con NDJSON streaming
- `github.sh --pull-force`: mostra repo, branch e ultimi 5 commit remoti prima di chiedere conferma

---

## [1.117] — 2026-06-24



- `Calendar2IntegrationTab`: rimosso pulsante download v1, rimane solo v2.11
- `Calendar2IntegrationTab`: label bottone aggiornata a `v2.11 · Scarica .zip`, tooltip allineato
- `Calendar2IntegrationTab`: guida installazione aggiornata — riferimento a `calendar-bridge-v2.zip` (era `calendar-extension.zip`)
- Rimosso `public/calendar-extension.zip` (plugin v1 deprecato)



- Extension v2.11: bump versione in manifest, popup, content-outlook.js
- Extension v2.11: zip `public/calendar-bridge-v2.zip` ricostruito con file v2.11

- Extension v2.10: fix HTTP 400 su direct call — `x-owa-canary` CSRF token ora letto dal cookie e incluso nel POST `GetCalendarView`
- Extension v2.10: `captureCtx` cattura `x-owa-canary` dalle request intercettate; fallback `document.cookie` (MAIN world, stessa origine)
- Extension v2.10: consumer `outlook.live.com` invia MSAuth1.0 — auth header ora incluso nel direct call anche per consumer
- Extension v2.10: rimosso branch GET_IDLE per 400/401 — tutti gli errori HTTP ora loggati come GET_ERROR con dettaglio canary/auth
- Extension v2.9: fix root cause 0 eventi — consumer (outlook.live.com) ora usa direct call POST `/owa/0/service.svc` con cookie auth invece di aspettare GetCalendarView passivo (Apollo SSR lo elimina)
- Extension v2.9: `maybeDirect()` non salta più consumer — trigger su `capturedServiceUrl` (non su `capturedAuth` assente nel consumer)
- Extension v2.9: `DO_SYNC` per consumer imposta `capturedServiceUrl=/owa/0/service.svc` e chiama `maybeDirect()` invece di inviare `GET_IDLE`
- Extension v2.9: fetch override chiama `maybeDirect()` al primo service.svc catturato

- Extension v2.8: `reloadOutlookTab` apre `outlook.live.com/calendar` se nessuna tab trovata invece di fallire silenziosamente
- Extension v2.8: Sincronizza attende 8s (era 4s) per dare tempo a Outlook di caricare e fare GetCalendarView
- Extension v2.8: `V2_RELOAD_OUTLOOK` risponde con `{ found }` — popup mostra "Apertura Outlook…" vs "Attendo eventi…"
- Extension v2.8: log circolare 30 voci in background (`v2_log`) — traccia ogni EVENTS_RECEIVED, PUSH_OK/FAIL, ALARM, GET_ERROR, GET_IDLE, RELOAD_OUTLOOK, SYNC_NOW
- Extension v2.8: debug log include sezione `[ATTIVITÀ BACKGROUND]` con timestamp ISO e dettaglio per ogni evento
- Extension v2.8: fix versione hardcoded nel debug log (era v2.7)

- Fix NewCalendar: sync filter usa `end >= now` — eventi in corso non spariscono al loro orario di inizio
- Fix `deleteStaleCalendarEvents`: retention corretta — 24h da `end` (no sessione), 10gg se sessione orfana; confronto ms elimina bug UTC/local
- Fix `deleteStaleCalendarEvents`: eventi collegati a sessione ancora esistente non vengono mai eliminati automaticamente

---

## [1.116] — 2026-06-21




- Extension v2.4: tasto `i` accanto a GET Outlook e POST App — pannello dettaglio con stato, timestamp, messaggio errore, URL, timeout
- Extension v2.4: `content-outlook.js` passa `reason` nell'errore (`HTTP 400`, `Failed to fetch`, ecc.) via `__CAL_V2_GET_ERROR__`
- Extension v2.4: `background.js` salva `v2_getError` in storage; azzerato al successo
---

## [1.115] — 2026-06-21

- Extension Calendar Bridge v2.4: popup redesign con sezione Operazioni — dot GET/POST colorati (arancio=in corso, verde=ok, rosso=errore)
- Extension v2.4: `background.js` state machine GET (`v2_getState`) e POST (`v2_postState`) con timestamp
- Extension v2.4: `V2_SYNC_NOW` imposta `getState=fetching` prima di iniettare; `CAL_V2_EVENTS` imposta `getState=ok`
- Extension v2.4: `pushToApp` imposta `postState=sending` prima di `scripting.executeScript`, poi `ok`/`error` sul risultato
- Extension v2.4: `content-outlook.js` invia `__CAL_V2_GET_ERROR__` su fallimento HTTP o catch del direct call
- Extension v2.4: `content-bridge.js` rilancia `CAL_V2_GET_ERROR` a background.js
- Extension v2.4: lista eventi scrollabile (max 140px) con subject, day, time range, badge Teams
- Extension v2.4: tasto `{ }` mostra/nasconde textarea JSON con array eventi raw
- Extension v2.4: bottoni rinominati "Forza Sync" vs "Ricarica Outlook" con tooltip esplicativi
- Extension v2.4: timeout guard popup — `fetching` > 30s visualizzato come `error`

---

## [1.114] — 2026-06-21


- NewCalendar: "Apri Sessione" apre Session Details modal invece di caricare nel main — calendar rimane aperto in background
- NewCalendar: risultati ricerca keyword e AI aprono Session Details modal (non caricano la sessione)
- Session Details modal: z-index elevato (`z-[60]`) — rimane sopra NewCalendar overlay (`z-50`)
- `LoadSessionModal`: prop `initialViewSessionId` — apre direttamente la vista dettaglio su sessione specifica
- Pulsante NewCalendar spostato nell'header accanto a Calendar; pulsante Calendar grigio con popup deprecazione
- Popup deprecazione Calendar: avvisa dismissione imminente, offre "Apri NewCalendar" o "Usa il vecchio"
- NewCalendar: vista default cambiata da Mese a Giorno
- NewCalendar toolbar: orologio live HH:MM:SS, pill sorgente (Outlook Live/ICS/COM) con stato connessione
- NewCalendar: pulsante Sincronizza con stati arancione/verde/rosso (syncing/success/error) e minimum display 800ms
- Sincronizza: dopo sync `calAppointments` aggiorna `calendarEventsDb` immediatamente senza riaprire NewCalendar
- Extension Calendar Bridge v1.1: versione visibile nel popup
- Extension: intervallo auto-sync configurabile dal popup (default 1 min, era 15 min)
- Extension: alarm `resync` usa valore salvato in storage, ricreato via messaggio `SET_SYNC_INTERVAL`
- App: auto-refresh calendario ogni 1 min (era 15 min)

---

## [1.113] — 2026-06-21


- NewCalendar: bottoni "Load Info", "Load & Schedule", "Teams + Rec" nel pannello dettaglio evento — stessa funzionalità del calendario esistente
- Extension Calendar Bridge v6: intercetta le chiamate uscenti di Outlook Live e ne estende il range a 7 giorni; rimosso Authorization header per endpoint consumer (`/published/`), ora usa cookie-based auth
- `CalendarEventRecord`: aggiunti campi `body?` e `responseStatus?`; sincronizzati dal mapping `OutlookAppointment` → IndexedDB


- NewCalendar: nuovo calendario integrato con sessioni audio — bottone accanto al Calendar esistente
- NewCalendar: viste mensile, settimanale, workdays, giornaliera stile Outlook con mini-calendario laterale navigabile
- NewCalendar: vista mensile — griglia 7×5 (lun-dom), pill evento con badge 🎙 verde per sessioni collegate
- NewCalendar: vista settimanale/workdays — time-grid con overlap layout, linea ora corrente, badge sessione
- NewCalendar: pannello dettaglio evento — metadata, Teams link, sezione "Registrazione" con link/unlink sessione
- NewCalendar: collegamento automatico sessione↔evento al lancio registrazione da un evento calendario
- NewCalendar: collegamento manuale dal pannello dettaglio evento con dropdown sessioni filtrate per data
- NewCalendar: ricerca keyword real-time su soggetto eventi e contenuto sessioni
- NewCalendar: ricerca AI semantica tramite Gemini embeddings (`text-embedding-004`) con indicizzazione lazy e cosine similarity
- IndexedDB v8: nuovi store `calendarEvents` (con indici `by-start`, `by-session`) e `sessionEmbeddings`
- Retention automatica: audio blob eliminati dopo 10 giorni all'apertura di NewCalendar; eventi senza sessione rimossi il giorno successivo
- Sync calendari Outlook/ICS/Extension → store locale per range [oggi, oggi+7gg]
- Settings → nuova tab Storage: breakdown MB (audio/testo/embeddings), tabella sessioni con scadenza audio, slider bulk delete con preview MB liberabili
- `types.ts`: nuovi tipi `CalendarEventRecord`, `SessionEmbedding`, `StorageStats`, `Attendee`

---

## [1.112] — 2026-06-20


- Diarizzazione speaker: `attemptSpeakerDiarization` attivato per default — tutte le nuove trascrizioni identificano gli interlocutori
- Diarizzazione: prompt aggiornato in italiano con formato `[Etichetta]: testo` per ogni cambio voce
- Extension `content-outlook.js`: fix "Direct call failed: Failed to fetch" — cattura l'URL reale di `service.svc` dai request intercettati (fetch + XHR) invece di usare `/owa/service.svc` hardcoded
- Nuovo tipo analisi LLM "Extract Action Items & Decisions": tabella action items, decisioni, punti aperti, prossimi passi
- Ricerca full-text cross-sessione nel modale sessioni: filtra per nome, trascrizione e analisi
- Template tipo riunione in LlmProcessor: pill selector (Riunione Tecnica / Colloquio / Presentazione / Standup) pre-configura analisi e contesto
- Prompt trascrizione: aggiunta istruzione per preservare termini tecnici, acronimi e nomi propri inalterati
- System role LLM: ampliato con contesto IT/consulting, preservazione terminologia inglese, accuratezza > parafrasi
- Minuta concisa: riscritta per essere davvero breve (max 250 parole), oggetto dedotto automaticamente dalla trascrizione
- Minuta dettagliata: differenziata dalla concisa — sezioni ####  per macro-argomento, razionale decisioni, rischi, colonna Note nella to-do
- Summary: strutturato in 4 sezioni (contesto, punti, decisioni, azioni) invece di riga singola
- 10 punti chiave: ordinati per importanza decrescente, ogni punto autonomo
- Intervista/dialogo: aggiunto formato strutturato con etichette speaker e separatori tematici
- Chat assistant: aggiunto contesto IT/consulting, gestione action items impliciti, bozza documenti nello stile della minuta

---

## [1.111] — 2026-06-20


- Offline lite mode: Tailwind CDN (`cdn.tailwindcss.com`) sostituito con copia locale `public/tailwind.min.js` — UI funziona anche senza connessione al boot
- Rimossa `importmap` esm.sh da `index.html` (ridondante con Vite build)
- Rimosso link a `/index.css` inesistente da `index.html`
- `usePipWindow.ts`: PiP window usa `/tailwind.min.js` locale invece di CDN
- `useIsOnline` hook: rileva `navigator.onLine` + eventi `online`/`offline`
- Banner "Modalità offline" in `NewHome.tsx`: visibile quando rete assente, scompare al ripristino
- Coda trascrizione pausa automaticamente offline, riprende sull'evento `online`

---

## [1.110] — 2026-06-20

- Extension v5: strategia **direct OWA call** — cattura token `MSAuth1.0` e timezone da `window.fetch` intercettato, poi chiama `GetCalendarView` direttamente dal main thread con `DistinguishedFolderId: "calendar"`; elimina dipendenza dal Web Worker Outlook (non iniettabile)
- Extension: delay 800ms prima del direct call per attendere `GetTimeZone`; retry automatico se il primo call usa UTC e il timezone arriva dopo
- Extension: range fetch cambiato da Mon-Sun a **solo oggi** — comportamento coerente con COM bridge e ICS (no overlap di giorni multipli nella griglia oraria)
- Extension: fix risposta OWA con `Body.Items = []` — era `null`, ora restituisce `{events: [], fmt: 'OWA'}` senza bloccare il flusso
- Extension popup: countdown **"Prossimo auto-sync"** (MM:SS da 15:00) sostituisce timestamp "Nfa" per ultimo rilevamento e ultima sincronizzazione
- Extension popup: "Sincronizza ora" invia `TRIGGER_RESYNC` (re-fetch da Outlook) + `SYNC_NOW` (re-broadcast cache immediato) invece di solo cache
- Extension `background.js`: `CALENDAR_SYNC` non sovrascrive `calendarData` con array vuoto — aggiorna solo `outlookSeenAt`; previene cancellazione dati validi da risposte `service.svc` intermedie
- Extension `background.js`: nuovo handler `TRIGGER_RESYNC` — inietta `window.postMessage(__CAL_BRIDGE_RESYNC__)` nel tab Outlook via `scripting.executeScript` world MAIN
- Extension `content-outlook.js`: listener `__CAL_BRIDGE_RESYNC__` — resetta `directCallDone` e ritriggera `doDirectGetCalendarView` su richiesta dell'app
- Extension `content-app.js` (nuovo): content script su `localhost/*` e `127.0.0.1/*` — fa da bridge tra BroadcastChannel `calendar-sync-v1` e `chrome.runtime.sendMessage(TRIGGER_RESYNC)`
- Extension `manifest.json`: aggiunto content script `content-app.js` su pattern `http://localhost:*/*` e `http://127.0.0.1:*/*`
- Calendar header: indicatore sorgente connessione — pill verde "Outlook Live" (extension), giallo "ICS Feed", viola "Outlook COM" con dot colorato
- `NewHome.tsx`: `calExtensionConnected` ora driven da polling localStorage ogni 5s con stale threshold 90s — il badge torna grigio 90s dopo la disinstallazione del plugin
- `NewHome.tsx`: stato `calSource` sincronizzato da localStorage ogni 5s — aggiornamento automatico se l'utente cambia sorgente in Settings
- `NewHome.tsx`: tasto "Aggiorna" nel calendario posta `{type: 'request-sync'}` su BroadcastChannel quando sorgente è extension

---

## [1.109] — 2026-06-20

- Calendar: nuova sorgente **Browser Extension** affiancata a Windows COM e ICS feed — legge il calendario da Outlook Live già aperto nel browser senza policy tenant, OAuth o installazioni Azure
- Extension Chrome/Edge (Manifest V3) in `extension/`: due content script — `content-outlook.js` (world: MAIN) intercetta `window.fetch` Outlook, `content-bridge.js` (ISOLATED) fa da relay via `window.postMessage` → `chrome.runtime.sendMessage` (fix: MAIN world non ha accesso a `chrome.runtime`); background propagaga dati via `BroadcastChannel('calendar-sync-v1')` con `chrome.scripting.executeScript`
- Extension popup: 4 sezioni stato (Outlook Live connesso + timestamp, riunioni rilevate, App AI Assistant rilevata + timestamp, riunioni sincronizzate), pulsante "Sincronizza ora", pulsante "Ricarica" tab Outlook, campo App URL con salvataggio automatico (debounce 600ms, nessun pulsante "Salva" manuale)
- `npm run build:ext` → `public/calendar-extension.zip` (12 KB, pronto per "Carica estensione non pacchettizzata")
- Settings → Integrations: terza opzione radio "Browser Extension" con badge connessione live (heartbeat 30s via localStorage), pulsante download .zip, guida installazione 7 passi
- Fix: migrazione settings al caricamento — `audio` e `llm` mergiati con defaults per garantire che nuovi campi (es. `enableAutoStop`) non risultino `undefined` da settings pre-esistenti in localStorage
- Timer pausa: status auto-pause mostra "Auto-paused da M:SS — in ascolto per riprendere…" con contatore secondi

---

## [1.108] — 2026-06-20

- Auto-stop registrazione dopo silenzio prolungato: notifica toast con pulsante Stop a 5 min, banner countdown + auto-stop a 15 min (configurabili in Settings → Audio Recording)
- `useAutoPauseLogic`: 2 timer scalabili (notify + stop) con countdown; attivati quando la registrazione è in auto-pause
- Settings → Audio Recording: sezione "Auto-Stop after Prolonged Silence" con toggle e 3 parametri (notify min, stop min, warning sec)

---

## [1.107] — 2026-06-20

- LLM Configuration: modelli separati per AI Analysis, Trascrizione audio e Chatbot (`transcriptionModel`, `chatModel` in LlmSettings)
- LLM Configuration: combobox con info costo sostituisce la tabella di selezione modelli
- Lista modelli Google aggiornata con pricing giugno 2026 (aggiunti `gemini-3.5-flash`, `gemini-3.1-flash-lite` stabili; rimosso `gemini-2.0-flash`; aggiunto campo `recommendedFor` per funzione)
- Default Analysis/Transcription/Chat: `gemini-2.5-flash-lite` per tutti e tre
- AI-Rules: aggiunto prompt `chat-system` (Meeting Chat) — editabile in Settings → AI Rules; categoria `'chat'` in `SystemPrompt`
- Meeting Chat: `buildSystemPrompt` usa prompt da settings se presente, fallback all'hardcoded
- Custom Rules: iniettate in AI Analysis (era già), Trascrizione e Chatbot — tutte le funzioni LLM ora ricevono le regole attive

---

## [1.106] — 2026-06-19

- Rimosso Whisper locale: `workers/whisperWorker.ts`, `services/whisperService.ts`, `utils/whisperLanguages.ts`, `hooks/recorder/useWhisperLiveLogic.ts` eliminati
- Rimossa Emotion Analysis: `hooks/recorder/useEmotionAnalysisLogic.ts` eliminato, `analyzeEmotion` da `geminiService`, `EmotionEvent`/`Emotion`/`EMOTION_LIST` da types
- Waveform throttled a 25fps in `FreqWaveform.tsx` e `useAudioVisualizer.ts` — riduce CPU draw loop da 60fps
- Rimossi da types: `transcriptionEngine`, `whisperModel`, `realtimeLanguage`, `enableEmotionAnalysis`, `currentEmotion`, `emotionHistory` da AudioRecorderProps/UseAudioRecorderResult/AudioSettings
- `transcriptionLabel` semplificato — mostra direttamente `appSettings.llm.model`
- Dependency `@huggingface/transformers` non più usata (rimovibile da package.json)

---

## [1.105] — 2026-06-19

- Performance: `handleChunkComplete`, `handleRecordingComplete`, `handleRecordingStop` ora usano `scheduleDbUpdate`+`flushDbUpdate` invece di `db.updateSessionIncremental` diretto — elimina write storm su IndexedDB durante registrazione
- Performance: split effect con 5 dipendenze in 2 distinti — DB save non si triggerava a ogni cambio `pipelineStep`
- Performance: `rightTabs` memoizzato con `useMemo` — evita re-render di NeoTabs a ogni render del parent
- Rimossi file morti: `UserManagementPanel.tsx`, `LoadingModal.tsx` (deprecato), `usePromptBuilder.ts` (zero caller)
- Rimossi simboli morti: `AppConfig` (interfaccia vuota), `roleLabel` da meetingUtils, import `LoadingModal` in LlmProcessor
- Rimosse 5 icone non usate da MediaIcons: `MicrophoneOnIcon`, `MicrophoneOffIcon`, `RewindIcon`, `ForwardIcon`, `DesktopComputerIcon`
- Shrink `audioUtils`: rimossi console.log verbosi da `blobToBase64`/`getMimeTypeFromBlob`/`mergeAudioBlobs`
- Shrink `generateStandardMetadataHeader`: da 28 a 14 righe via array filter/join

---

## [1.104] — 2026-05-25

- eliminato fallback su ps1 e gestito controllo requisiti per npm


## [1.103] — 2026-05-22

- Aggiornamento


## [1.102] — 2026-05-22

- `setup_and_run.ps1`: fallback WSL quando npm non è installato su Windows — rileva `npm.cmd` → `npm` → WSL; install e dev server avviati via `wsl bash -c`; `Wait-AppReady` usa `localhost` invece di `127.0.0.1` in modalità WSL
- Calendar: doppio click su un appuntamento (vista giornaliera e lista) apre la modale "Show Info"
- Calendar: nuovo bottone "Load & Schedule" (Show Info modal + quick bar) — carica info riunione nella sessione corrente e arma il countdown auto-record fino all'orario di inizio, senza aprire una nuova tab
- Notification bell dropdown: testi tradotti in inglese — "Today's notifications", "Open Calendar", "No notifications yet.", "Start session", tooltip
- Notification card condivisa (toast + panel): "Recent", "Ended", "From:", "You're the organizer / Required (To) / Optional (CC)"
- Notification toast: bottoni "Open Calendar" / "Start session" (era italiano)
- Calendar Show Info modal: bottone "Close" (era "Chiudi")


## [1.101] — 2026-05-14

- ### Calendar sync — dedup multi-tab e meno rumore log
- Throttle 60s spostato da `useRef` a `localStorage['calendar:lastFetch']` → sopravvive a remount di NewHome (React.StrictMode in dev + nuove tab aperte da `?startMeeting=`) e a riavvii rapidi del componente
- Lock cross-tab `localStorage['calendar:fetching']` con TTL 120s → quando una tab sta fetching, le altre saltano; il TTL evita deadlock se una tab crasha mid-fetch
- `BroadcastChannel('calendar-sync-v1')`: la tab che fetcha propaga la lista appuntamenti a tutte le peer tabs → una sola chiamata al COM bridge per tutto il browser invece di una per tab
- In-flight guard intra-tab (`calInFlightRef`) → secondi trigger ravvicinati (focus + visibilitychange + open-modal nello stesso tick) coalescono invece di doppiare il fetch
- `CALENDAR_APPOINTMENTS_DETAIL` logga solo quando l'hash `id|start|end|meetingStatus|isCanceled` cambia rispetto al fetch precedente — prima emetteva un payload da N appuntamenti ad ogni fetch (ogni 15 min) anche se nulla cambiava


## [1.100] — 2026-05-14

- ### Meeting pre-call notifications
- Notifica in-app N minuti prima di ogni call del calendar (default 10, configurabile 1-30 min) con relazione AI breve generata al volo da Gemini su `body`/`subject` + ruolo utente (organizer / required / optional) dedotto dal match `userEmail` ↔ `attendees`
- Toast in-app (top-right, slide-in animato) usato al posto di Notification API browser — bypassa group policy aziendali che bloccano notifiche OS-level
- Chime audio al fire via Web Audio API (sine 880→1320 Hz, no asset esterno)
- Persistenza in IndexedDB (store `meetingNotifications`, DB v7) con TTL 24h e prune automatico al mount
- Multi-tab: scheduler attivo su ogni scheda ma la chiamata LLM avviene **una sola volta** — claim atomico via `tryClaimMeetingNotification` (add-if-absent); altre tab attendono via `BroadcastChannel('meeting-notifications-v1')` + polling DB
- Stable id `${subject_normalized}::${startIso}` per dedup robusto — gli id posizionali del bridge Outlook si rinumerano ad ogni refresh e causavano rifire spurio a 5/0 min
- Snooze 2m / 5m: rimuove il toast e lo ripianifica con id univoco (sopravvive al re-render dell'hook); altri trigger non richiesti
- Bell icon nella topbar: badge con count, dropdown con elenco notifiche del giorno
- Bell dropdown: ordine **più recente in alto** (badge "RECENTE" sulla prima), orari `HH:MM–HH:MM` per ogni notifica, riunioni terminate (end < now) con sfondo grigio + opacità + badge "TERMINATA" e bottone "Avvia sessione" nascosto
- Bell dropdown: × per riga (elimina singola) + "Clear all" in header con conferma
- Componente condiviso `MeetingNotificationCard` — toast e bell rendono la stessa card (stesso accent stripe colorato per ruolo, layout, stili), differiscono solo per `variant: 'toast' | 'panel'` e set di bottoni
- Bottone toast "Avvia sessione" (sostituisce "Join Teams"): apre nuova scheda con `?startMeeting=<id>` precaricato → carica meeting dal DB, popola titolo + bubble note (organizer/summary/body), mostra banner countdown in alto; al T-0 chiama `audioRecorderRef.startMicOnly()` (registrazione mic-only)
- Banner countdown: bottoni "Avvia ora" (manuale prima del T-0) e "Annulla" (disabilita auto-start); il countdown parte solo nella tab target (URL param), non in quella di origine
- Settings: tab `Appearance` rinominato `General`; nuova sezione "Meeting notifications" con toggle on/off, campo `Your email` (per matching To/CC), lead time 1-30 min, bottone "Test notification" che genera un toast di prova in-app
- Skip notifica per appuntamenti `isCanceled` o passati; fallback metadata-only se Gemini fallisce
- Log diagnostici `[meeting-notif]` in console: claim/wait, scheduler armato, ogni appuntamento schedulato con delay
- `hooks/useMeetingNotifications.ts` + `hooks/useMeetingNotificationHistory.ts` + `utils/meetingUtils.ts` (`computeRole`, `MeetingToastData`)
- ### Calendar sync
- Throttle 60s su auto-fetch (focus/visibilitychange) per evitare storming del COM bridge ad ogni alt-tab; il tick scheduled di 15 min bypassa il throttle
- ### Prepare Email
- Separatore destinatari `;` (convenzione Outlook) al posto di `,`
- Bridge Outlook COM su Windows — apre la finestra di composizione con `HTMLBody` preservando la formattazione di "Copy Text" (heading, tabelle, stili inline); fallback `mailto:` su altri OS
- `vite.config.ts`: nuovo endpoint POST `/api/outlook/email` (payload JSON via stdin base64 → `Outlook.Application.CreateItem(0).Display()`)
- Tabelle leggibili su sfondo bianco — testo `#111827`, bordi `#d1d5db`, header background `#f3f4f6` (prima usava grigio chiaro pensato per dark theme)


## [1.99] — 2026-05-14

- Calendar background sync: auto-refresh ogni 15 minuti
- Calendar background sync: refresh anche su `window focus` e `document visibilitychange` (tab torna visibile)
- Calendar topbar icon: lampeggia arancione → bianco durante il sync (spinner-like), torna bianco fissa a sync completato


## [1.98] — 2026-05-14

- Calendar: nuova modalità sorgente **ICS feed** affiancata al Windows COM bridge esistente — abilita calendar Outlook cross-platform su Mac/Linux/Windows senza Azure AD, OAuth o installazioni
- Settings → Integrations: scelta sorgente (Windows COM / ICS feed) con radio toggle; su sistemi non-Windows l'opzione COM è disabilitata, su Windows è preselezionata di default
- Settings → Integrations: istruzioni step-by-step per pubblicare ICS da outlook.office.com (o outlook.live.com), input URL, bottone "Test fetch"
- Settings → Integrations: disclaimer dedicato — la pubblicazione del calendario è controllata dal tenant admin Microsoft 365; se l'opzione "Publish a calendar" è assente o disattivata, è policy lato server e non dipende dall'applicazione
- Calendar bottone topbar: un'unica entry, la sorgente viene letta da `localStorage['calendar:source']` (default `'windows'`)
- Calendar error panel: su sistemi non-Windows mostra bottone "Configure ICS feed →" che apre direttamente Settings sulla tab Integrations (chiude il modal calendar)
- Calendar error panel: rimosso `navigator.platform` raw (es. `MacIntel`) dall'OS display, ora mostra solo nome friendly (`macOS`, `Linux`, `Windows`)
- ICS path: filtra eventi alla data odierna locale, mappa a `OutlookAppointment` (attendees come stringhe, Teams URL estratto via regex dal body, isCancelled/isRecurring preservati) — l'UI esistente di `NeoCalendarDayView` funziona invariata
- `services/icsService.ts`: parser ICS RFC5545 (line unfolding, escape, DTSTART/DTEND UTC+floating+all-day, TZID con mapping `Greenwich Standard Time`/`GMT`/`UTC`→UTC, RRULE→isRecurring, STATUS→isCancelled, ORGANIZER/ATTENDEE/LOCATION/DESCRIPTION); fetch diretto con fallback proxy dev
- `services/icsService.ts`: helper `loadCalendarSource/saveCalendarSource` (default `'windows'`)
- `vite.config.ts`: nuovo middleware `/api/ics` proxy server-side dell'URL ICS (aggira CORS, solo https)
- `SettingsPanel`: nuova prop `initialTab` per aprire una tab specifica all'apertura del pannello; `AppModals` propaga `settingsInitialTab`
- Tipo `IcsAppointment` in types.ts: id, subject, start/end ISO, location, description, organizer, attendees, isCancelled, isRecurring
- Tipo `Calendar2Settings` in types.ts: icsUrl persistito in `localStorage['calendar2:ics']`
- Logging: nuovi eventi `ICS_FETCH_OK/ERROR`, `ICS_DIRECT_FAILED`
- Fix calendar day-key: usa data LOCALE (`getFullYear/getMonth/getDate`) invece di `toISOString` UTC — eliminava il bug "evento non visibile oggi" in fusi orari con offset positivo
- Limiti noti ICS: read-only, refresh latency 1-3h gestita da Microsoft, attendees senza email, Teams URL solo se presente nel body, molti tenant aziendali disabilitano la pubblicazione
- Fix Upload file: `.webm` (e altri container marcati `video/*` da Windows) venivano scartati in silenzio — filtro MIME esteso ad `audio/*`, `video/webm|ogg|mp4` e fallback per estensione (`.webm .ogg .opus .mp3 .m4a .wav .flac .aac .mka .amr .3gp`)
- Upload: log dettagliati in Settings → Logs — `UPLOAD / File picker returned`, `UPLOAD / Forwarding files to pipeline`, `UPLOAD / Files rejected` (warn), `UPLOAD / No accepted files` (error)
- Upload: reset di `input.value` dopo selezione — ricaricare lo stesso file ora ritrigghera `onChange`
- Upload: `accept` dell'input allargato così il file picker non pre-filtra i container ambigui
- Upload: alert utente se nessun file passa il filtro
- Fix tasto T in coda chunk: rimane cliccabile anche dopo trascrizione completata (re-force consentito); tooltip "Re-transcribe this chunk (already transcribed)"
- Fix "Transcribe X File(s)" bulk: non sovrascrive più le trascrizioni precedenti (parte da `transcribedText` corrente invece che da `""`)
- Fix "Transcribe X File(s)" bulk: marca `transcribed: true` sui chunk processati → diventano verdi/barrati in coda
- "Transcribe X File(s)" bulk: messaggio "All chunks are already transcribed." se non c'è nulla da fare
- Modal "Sessione esistente" alla pressione di Rec con dati già presenti (trascrizione/analisi/audio/chunk in coda): 3 scelte — Aggiungi alla sessione / Nuova sessione / Annulla
- "Aggiungi alla sessione": mantiene `transcribedText`, `llmProcessedText`, bubble notes, coda chunk; riattiva pipeline RECORDING sullo stesso `activeSessionId` e segna lo status come `In Progress`
- "Annulla": il flusso di start abortisce senza toccare i dati né avviare `MediaRecorder`
- `onRecordingSessionStart` ora restituisce `Promise<boolean | void>` — il pannello attende e salta `startRecording` su `false`
- Logging RECORDING: `User cancelled new recording` (info), `Appending new recording to existing session` (info), `Failed to mark session In Progress on append` (error)
- Fix append-mode chunk naming: `chunkIndexOffsetRef` traccia l'offset globale dei segmenti — i nuovi chunk partono da `existingQueue.length + 1` invece di collidere con i nomi `_segment_001…` già in coda (che venivano scartati dal dedup di `addChunkToQueue`)
- Fix append-mode non-chunked: la nuova registrazione singola viene accodata come segmento (`addChunkToQueue` + auto-transcribe se Smart Pipeline ON) invece di sovrascrivere `audioBlob` e azzerare `transcribedText`/`llmProcessedText`
- Modal "Existing session" e relativi pulsanti tradotti in inglese (Append to session / New session / Cancel)
- Alert upload tradotto in inglese ("Unsupported file format: …")


## [1.97] — 2026-05-11

- Fix Calendar: bug critico Restrict filter su locale Italiano — `MM/dd/yyyy` veniva interpretato come `dd/MM/yyyy` (es. `05/11/2026` letto come 5 novembre invece di 11 maggio), restituendo appuntamenti del giorno sbagliato
- Calendar filter: `$today.ToString('d')` usa il formato data della cultura corrente (locale-aware), risolve il bug e ripristina tutti gli appuntamenti del giorno
- Calendar performance: tempo di caricamento da ~42s a ~1-8s (eliminata iterazione di 108 occorrenze sbagliate)
- Bridge PowerShell: lookup attendee ottimizzato — `r.Address` come fast path, fallback a `GetExchangeUser().PrimarySmtpAddress` solo per legacy EX DN
- Bridge PowerShell: nuovi campi `meetingStatus`, `isCanceled`, `isRecurring` per ogni appuntamento
- Bridge PowerShell: appuntamenti che falliscono la lettura ora finiscono in `skipped[]` con error/step invece di sparire silenziosamente
- Bridge PowerShell: timings dettagliati (`comInit`, `restrict`, `loop`, `attendees`, `total`) inclusi nella response
- Logging frontend: `CALENDAR_LOADED` mostra `totalSeen`, `skippedCount`, `filter`, `timings`, `canceledCount`, `recurringCount`
- Logging frontend: `CALENDAR_SKIPPED` (warn) emesso quando il bridge salta appuntamenti
- Logging frontend: `CALENDAR_APPOINTMENTS_DETAIL` (debug) elenca id/subject/start/end/organizer/responseStatus/meetingStatus/isCanceled/isRecurring per ogni appuntamento
- `tools/outlook_diag.py`: script Python standalone (pywin32) per diagnosi Outlook COM senza la sovrastruttura applicativa — 6 strategie a confronto (current_app, msdn_order, locale_fixed, no_recurrence, advanced_search, full_scan) con timing e diff tra strategie
- Tipo `OutlookAppointment`: aggiunti campi `meetingStatus`, `isCanceled`, `isRecurring`; nuova interfaccia `SkippedAppointment`


## [1.96] — 2026-05-05

- Calendar "Load Info": incluse le note riunione (`body`) nel testo importato nella sessione
- Reset: svuota anche la coda chunk nel tab Transcript (transcriptionQueue azzerata)
- Pulsante "New session": apre una nuova scheda del browser sulla stessa URL (sessione pulita)
- Default language: migrazione imposta "Italian" se non presente nelle settings salvate


## [1.95] — 2026-05-05


## [1.94] — 2026-04-30

- PiP widget: Document Picture-in-Picture always-on-top (Chrome 116+); bottone nella riga start + bottone circolare durante la registrazione (accanto alle cuffie)
- PiP widget: controlli Mute, Cuffie (system audio), Pause/Resume, Stop (pulse rosso), Screenshot → BubbleNote
- PiP widget: textarea "Area Bubble Notes" con supporto paste screenshot → crea BubbleNote direttamente
- PiP widget: pulsanti "Mic only" / "+ System audio" in idle per avviare registrazione dal widget
- PiP widget: timer grande sovrimpresso sulla waveform (stile schermata principale), rimossi dot REC e timer dalla status bar
- PiP widget: Stop button pulsa in rosso durante la registrazione (stesso effetto del pulsante principale)
- Waveform style: impostazione in Settings → Audio Recording — "Spectrum Analyzer" (barre frequenze, default) e "Oscilloscope" (forma d'onda); applicata a schermata principale e PiP
- Spectrum Analyzer: legenda Microphone (viola) + System Audio (rosso) orizzontale, stessa grafica dell'oscilloscopio
- Legenda waveform: layout orizzontale in entrambi gli stili; colore Microphone aggiornato a viola (coerente con le barre); System Audio non lampeggia più
- `FreqWaveform`: nuovo componente condiviso (`components/FreqWaveform.tsx`) — canvas RAF, `getByteFrequencyData`, split mic/app
- AudioVisualizerCanvas: prop `hideLegend` per nascondere badge; legenda resa orizzontale
- "+ Screen audio" rinominato "+ System audio" nei tasti start mode
- Export TXT: conversione HTML → testo pulito (`<br>`→newline, `<hr>`→`---`, `<h3>`→intestazione, tag rimossi)


---

## [1.92] — 2026-04-29

- github_push.sh rinominato in github.sh
- github.sh: aggiunto parametro --pull-force — scarica il remoto e sovrascrive il locale con conferma esplicita ("si")


## [1.91] — 2026-04-29

- Settings → AI Rules: sub-tab switcher "👤 User Rules" / "⚙️ System Prompts"
- SystemPromptsTab: elenco prompt di sistema raggruppati per categoria (Transcription, System Role, AI Analysis)
- Ogni prompt: collapse/expand, textarea mono editabile, badge "modified" se diverso dal default
- Pulsante "↺ Restore Default" per ripristinare il prompt originale (defaultText immutabile)
- Disclaimer rosso in testa al pannello — editing può compromettere il funzionamento
- Riferimento placeholder: {{LANGUAGE}}, {{DATE}}, {{DIARIZATION}}, {{EXTRA}} con descrizione
- SystemPrompt type in types.ts con campi id, name, description, category, text, defaultText
- DEFAULT_SYSTEM_PROMPTS in constants/defaultSettings.ts: 8 prompt (transcription-main, llm-system, 6 analysis)
- resolvePrompt / getPromptText in utils/promptUtils.ts
- LlmProcessor: prop systemPrompts, risolve system role e tutti i prompt analysis via resolvePrompt con {{DATE}} e {{EXTRA}}
- geminiService.transcribeAudio: param opzionale promptTemplate, sostituisce {{LANGUAGE}} {{DIARIZATION}} {{EXTRA}}
- transcriptionService.transcribe: param opzionale transcriptionPromptTemplate passato a geminiService
- useTranscriptionLogic: legge 'transcription-main' da appSettings.systemPrompts e lo passa a tutti i call transcribe
- NewHome init: migrazione automatica — se systemPrompts mancanti nelle settings salvate, aggiunge i default; merge di nuovi prompt aggiunti in versioni future


## [1.90] — 2026-04-29

- Tab Transcript: badge con contatore chunk trascritti/caricati (es. "2/3"), visibile solo quando la coda non è vuota
- Calendar error panel: testo in inglese, mostra il motivo dell'errore e l'OS rilevato (client + server platform)
- Se OS non è Windows: messaggio esplicito "This feature requires Windows" nell'UI e nell'errore
- Pulsante "Riprova" rinominato "Retry" e wrappato con isRetry=true per distinguere tentativi manuali
- loggingService: WARN CALENDAR_BRIDGE_ERROR con motivo + platform a ogni fallimento del bridge
- loggingService: DEBUG CALENDAR_BRIDGE_ERROR_DETAIL con contesto completo (statusData, piattaforme, isRetry)
- loggingService: INFO CALENDAR_RETRY tracciato al click su Retry (sia path esterno che interno)
- loggingService: WARN/DEBUG CALENDAR_APPOINTMENTS_ERROR se l'endpoint appointments restituisce errore
- loggingService: DEBUG CALENDAR_LOADED con count appointment al successo
- vite.config.ts: messaggio errore /appointments/today in inglese con platform inclusa


## [1.89] — 2026-04-28

- DB countdown trasformato in button: clic forza il salvataggio immediato del chunk corrente e resetta il timer al nuovo intervallo
- Fix chunk interval: cambiare "Chunk Interval (seconds)" durante la registrazione ora aggiorna il timer reale (non solo il countdown visivo) e forza un nuovo chunk
- Countdown calcolato da chunkStartElapsedTime invece di elapsedTime % interval — sincronizzato con il timer effettivo


## [1.88] — 2026-04-28

- LoadSessionModal: "Load & Rec" rinominato "Continue" — carica sessione e riprende la registrazione senza reset (continueRecording via ref, status→In Progress, pipelineStep→RECORDING)
- Fix BubbleNotes non salvate: rimosso guard recordingState===RECORDING dal useEffect scheduleDbUpdate — le note vengono ora scritte su DB in qualsiasi stato


## [1.87] — 2026-04-28

- Fix reload pagina durante github_push.sh: NeoTopbar legge APP_VERSION da appConfig (elimina stringa hardcoded); github_push.sh non tocca più NeoTopbar.tsx
- vite.config.ts: server.watch.ignored per constants/appConfig.ts, CHANGELOG.md, README.md — i file modificati dallo script non triggerano hot reload


## [1.86] — 2026-04-28

- LoadSessionModal: pulsante "Load & Rec" — carica sessione e avvia immediatamente la registrazione microfono
- AudioRecorderRef: esposto startMicOnly() via useImperativeHandle per avvio registrazione programmatico
- NewHome: handleLoadAndRecord — attende il caricamento sessione poi invoca startMicOnly() con delay 150ms


## [1.85] — 2026-04-28

- MeetingChatPanel: contesto esteso alle BubbleNote (testo con timestamp incluso nel system prompt)
- MeetingChatPanel: rilevamento immagini nelle BubbleNote con banner di scelta "analizza immagini / solo testo"
- MeetingChatPanel: invio immagini come Part[] multimodale a Gemini se l'utente acconsente
- MeetingChatPanel: hasContext aggiornato — presenza di BubbleNote abilita il chat anche senza trascrizione


## [1.84] — 2026-04-28

- Web Worker per export ZIP: createSessionZipBlob eseguito in workers/zipWorker.ts via Vite new URL pattern; main thread non si blocca su sessioni grandi
- Lazy loading: BubbleNotes, TranscriptionView, LlmProcessor, MeetingChatPanel, NeoCalendarDayView caricati con React.lazy + Suspense — riduce bundle iniziale
- Refactor any REFACTOR: catch (error: unknown) con narrowing instanceof Error in geminiService; GeminiApiModel interface in SettingsPanel; ChromeMediaTrackConstraints elimina 6 cast goog*; ImageCapture shim tipizzato; webkitAudioContext via global declare
- partText() helper in geminiService: elimina (p as any).text con narrowing 'text' in p
- noUncheckedIndexedAccess abilitato in tsconfig.json; fix array[i] e obj[key] in 15 file (AudioVisualizerCanvas, textUtils, fileUtils, db, geminiService, whisperService, hooks recorder, ecc.)
- useBatchedDbUpdate: nuovo hook che accumula le scritture IndexedDB per 500ms e le fonde in una sola (riduce write storm durante pipeline da 4 write concorrenti a 1)
- useEffect DB writes in NewHome: refactored da 4 effect separati a scheduleDbUpdate; status 'Success' continua ad essere scritto immediatamente via flushDbUpdate
- pipelineDataRef: ref aggiornato ad ogni render che cattura audioFileName, language, llmProcessedText ecc. — elimina la stale closure nel useEffect DOWNLOADING
- Fix useEffect DOWNLOADING: rimosso eslint-disable-line, sostituiti 7 valori stale con pipelineDataRef.current; console.error sostituito con loggingService.error
- useMemo per appSettings.audio/transcription/llm: le tre sub-prop passate a NeoRecordingPanel sono ora stabili per reference — evita re-render del pannello di registrazione quando cambiano impostazioni non correlate
- Fix race condition fetchCalendarData: aggiunta fetchCalendarData alle deps dell'useEffect; rimosso eslint-disable-line


## [1.83] — 2026-04-28

- ErrorBoundary globale (avvolge NewHome in index.tsx) + boundary inline per LlmProcessor; log degli errori React via loggingService; fallback UI con tasto Riprova/Ricarica
- Fix setTimeout memory leak: appUserMessageTimerRef e systemAudioGuideTimerRef per cleanup corretto; useEffect di unmount che cancella entrambi i timer
- db.updateSessionIncremental: aggiunto .catch() con loggingService.error a tutte le 9 call fire-and-forget (errori IndexedDB ora visibili in log invece di sparire silenziosamente)


## [1.82] — 2026-04-28

- TypeScript strict mode abilitato (strict, noImplicitAny, strictNullChecks, strictFunctionTypes, useUnknownInCatchVariables)
- Installati @types/react e @types/react-dom (mancavano, causavano type resolution implicita)
- Fix 7 errori di compilazione emersi da strict: RefObject<HTMLCanvasElement | null>, Date | null | undefined, callback parameter variance, token count nullability in geminiService
- Fix 19 any QUICK_FIX: AutoPauseState esportato da types.ts; autoPauseState, onAutoSave, initialState tipizzati in UseAudioRecorderOptions/Result; context?: Record<string, unknown> in loggingService e LogEntry; flushTimer: ReturnType<typeof setInterval>; db.ts upgrade tx tipizzato, updates as any sostituito con narrowing; opts/usage/updates tipizzati in NewHome; ToolbarBtn props inline in NoteEditorToolbar


## [1.81] — 2026-04-28

- Tips panel: altezza fissa (196px, body testo limitato a 4 righe) — non sposta più il pannello di registrazione
- Player audio: fix play non partiva (AudioContext suspended → resume prima di play()); controlli separati ▶ ⏸ ⏹ con logging PLAYER
- Player audio: caricamento traccia da coda Transcribe (externalAudioUrl collegato a playbackFile)
- Chunk recording: ogni chunk salvato su DB appare automaticamente nella coda Transcribe con nome sessione corretto
- Chunk recording: tasto T per trascrivere singolo chunk (verde se già trascritto, barrato il nome)
- Chunk recording: coda auto-trascrizione sequenziale (nessun chunk droppato se arriva durante trascrizione precedente)
- Chunk recording: opzione Settings "Trascrivi automaticamente ogni chunk salvato" (default ON)
- Chunk recording: allo stop, trascrizione continua automaticamente sui chunk rimanenti
- Chunk recording: fix doppia trascrizione (side effect fuori dallo state updater; dedup per nome nella coda)
- Prompt trascrizione: istruzione esplicita per restituire `[chunk senza audio riconoscibile]` in assenza di parlato
- Smart Pipeline: fix mancata attivazione in modalità chunked (pipelineStep→TRANSCRIBING allo stop)
- Smart Pipeline: logging dettagliato di ogni fase (PIPELINE) con flag attivi e transizioni di stato
- Live transcription: ripristino approccio SDK `@google/genai` (WebSocket raw rimosso); API key da settings con fallback env


## [1.80] — 2026-04-27

- Live Transcript: area di testo persistente e scorrevole (max 200px) che accumula tutto il testo riconosciuto senza perdere le parole precedenti
- Live Transcript: testo visibile anche dopo lo stop della registrazione
- Live Transcript: aggiornamento in tempo reale di `activeSourceText` → il chatbot può interrogare il testo già durante la registrazione
- Live Transcript: skip automatico della trascrizione audio post-registrazione quando il motore live è attivo


## [1.79] — 2026-04-27

- Trascrizione locale offline via Whisper (Transformers.js, WebAssembly): scelta modello, download con progress bar, cache browser, eliminazione modello
- Settings → Transcription: selettore motore (LLM configurato / Whisper locale), rilevamento automatico modelli già scaricati
- Auto-caricamento modello Whisper da cache browser alla prima trascrizione (senza ri-download)
- Topbar: indicatore "Transcription & Analysis: model" (unificato se stesso modello, separato se Whisper)
- Fix `github_push.sh`: awk multi-riga su macOS (usato ENVIRON invece di -v), sezione [Unreleased] come sorgente commit default
- Fix `backup.sh`: `stat -f%z` cross-platform (macOS/Linux)


## [1.77] — 2026-04-27

- Gestione chiave API Google cifrata con AES-GCM (Web Crypto API) in IndexedDB; scelta tra chiave di sistema (.env) e chiave personalizzata nel pannello Settings
- Tooltip "i" in Settings mostra path della variabile d'ambiente (`GEMINI_API_KEY` in `.env`, configurato via `vite.config.ts`)
- Auto-pause: il tasto rettangolare mostra countdown `Pausa in Ns…` durante warning e diventa `Resume` dopo l'auto-pausa; il tasto Stop rimane sempre rosso
- Fix bug stati auto-pause nella status bar (i valori `'sound'/'countdown'/'paused'` non matchavano mai i valori reali del hook)
- Script `setup_and_run.sh` per Linux/macOS con stesse funzionalità del `.ps1` Windows (start/stop/status/restart/reinstall)
- Fix `github_push.sh`: emoji nel remote URL corrompeva l'URL; backslash spurio in `strip_token` sed
- Bump automatico della versione minor ad ogni commit tramite `github_push.sh` (aggiorna `appConfig.ts`, `NeoTopbar.tsx`, `README.md`, `CHANGELOG.md`)
- Fix 10 vulnerabilità npm: `mammoth` 1.8→1.12, `pdfjs-dist` 3.11→5.6; worker PDF migrato da CDN a bundle locale

---

## [1.76] — 2026-04-24

- Settings → AI Rules: tab per regole prompt persistenti (nome, testo, toggle attiva/disattiva); iniettate nel `systemInstruction` ad ogni analisi
- Pulsante ✉ Prepare Email (solo Windows): apre client mail con draft pre-compilato da titolo sessione + testo analisi AI
- `OutlookAppointment.Attendee` esteso con campo `type: 'required' | 'optional'`; propagazione attendees da calendario a `LlmProcessor`

---

## [1.75] — 2026-04-10

- LLM Configuration: API key custom, base URL custom, nome modello editabile in Settings
- Nuovi modelli Gemini nella tabella selezione (`gemini-3-flash-preview`, `gemini-3-pro-preview`)
- Neo Calendar Day View: layout parallelo riunioni (connected-component grouping, fino a 10 colonne dinamiche)
- Teams + Rec: apertura via `msteams://` per evitare Chrome che apre il web client
- Intervallo auto-screenshot configurabile in Settings
- Export ZIP migliorato: include HTML analisi AI

---
