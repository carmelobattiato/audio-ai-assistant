# Changelog

Ogni versione elenca solo le modifiche rilevanti. Stile minimale: una riga per punto, niente ridondanze.

---

## [Unreleased]

---

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
