# Changelog

Ogni versione elenca solo le modifiche rilevanti. Stile minimale: una riga per punto, niente ridondanze.

---

## [Unreleased]

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
