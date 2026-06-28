# Architecture — audio-ai-assistant

App **client-side-only** (React 19 + TypeScript, no backend). Registra audio, trascrive via Google Gemini, esegue analisi LLM, esporta. Persistenza interamente in IndexedDB.

> Vedi anche: [`CLAUDE.md`](./CLAUDE.md) (guida operativa) · [`docs/DB_SCHEMA.md`](./docs/DB_SCHEMA.md) (schema DB) · [`ASSESSMENT.md`](./ASSESSMENT.md) (audit).

## Entry point

```
index.tsx
  └─ <ErrorBoundary variant="global">
       └─ <NewHome />          ← pages/NewHome.tsx (~1860 righe, god-component)
```

Non esiste `App.tsx`. Tutto il coordinamento sta in `pages/NewHome.tsx`: ~100 `useState`, nessun Redux/Context, props e callback drillati ai figli.

## Pipeline dati

```
Mic + System Audio (WebRTC getUserMedia / getDisplayMedia)
      │
      ▼
MediaRecorder ── chunk (default 15 min) ──► blob
      │
      ▼
IndexedDB  (store `sessions`, recovery su reload)
      │
      ▼
Gemini API  ──► speech-to-text (trascrizione)
      │
      ▼
Gemini API  ──► analisi LLM (prompt custom)
      │
      ▼
Export  (HTML / SRT / CSV / ZIP)
```

## Layer principali

### Audio recording
- [`hooks/useAudioRecorder.ts`](./hooks/useAudioRecorder.ts) — orchestratore: stato recording, chunk, stop/pause, cleanup su unmount.
- [`hooks/recorder/`](./hooks/recorder/):
  - `useMediaStreams` — cattura mic + display audio, AudioContext, mixing, echo cancellation.
  - `useRecorderTimer` — tempo trascorso.
  - `useAutoPauseLogic` — auto-pause su silenzio + auto-stop con countdown.
  - `useLiveTranscriptionLogic` — sessione live Gemini (streaming) opzionale.
  - `useScreenshotHandler` / `useRecorderPlayer`.

### Gemini / LLM
- [`services/geminiService.ts`](./services/geminiService.ts) — **unico gateway** verso Gemini. `llmService.generateText` + `transcribeAudio`. Include: rate limiter (sliding window, default 15 req/60s), circuit breaker (3 errori consecutivi → cooldown 2 min), timeout, retry con backoff esponenziale, token tracking.
- [`services/transcriptionService.ts`](./services/transcriptionService.ts) — wrapper trascrizione: rilevamento MIME per browser/OS, base64, diarization.

### Transcription pipeline
- [`hooks/useTranscriptionLogic.ts`](./hooks/useTranscriptionLogic.ts) — coda blob → Gemini STT, gestione queue (reorder/remove), trascrizione singolo chunk. Handler `useCallback`-stabili via `latestRef` (no stale closure).

### Persistenza
- [`utils/db.ts`](./utils/db.ts) — wrapper IndexedDB (`idb`). Vedi [`docs/DB_SCHEMA.md`](./docs/DB_SCHEMA.md). Ogni op avvolta in `dbOp()` (log + re-throw).
- [`hooks/useBatchedDbUpdate.ts`](./hooks/useBatchedDbUpdate.ts) — coalesce le write (name/notes/transcript/chat) in 1 timer condiviso (500ms) per evitare write storm; `flush()` immediato per write critiche.

### Logging
- [`services/loggingService.ts`](./services/loggingService.ts) — singleton. Buffer locale (max 500), batch verso "remote appender" (simulato), handler globali `onerror`/`onunhandledrejection`, correlation/session id. Metodi `trace/debug/info/warn/error`.

### Export
- [`utils/fileUtils.ts`](./utils/fileUtils.ts) — genera SRT, CSV, HTML stilizzato, ZIP. Output LLM sanitizzato (DOMPurify) prima del render/export.

### Calendario / meeting
- `useCalBridgeV2`, `useMeetingNotifications`, `services/icsService.ts`, store `calendarEvents` + `meetingNotifications`.

### Ricerca semantica
- `useSemanticSearch` + store `sessionEmbeddings` (vettori embedding).

## State management

Tutto lo stato vive in `NewHome.tsx` via `useState` + custom hook (`useSessionLogic`, `useTranscriptionLogic`, …). Nessun Context/Redux. Props drilling verso i 4 figli pesanti, memoizzati con `React.memo`: `NeoRecordingPanel`, `TranscriptionView`, `LlmProcessor`, `BubbleNotes`.

## Affidabilità API (geminiService)

| Meccanismo | Comportamento |
|------------|---------------|
| Rate limiter | Sliding window timestamp; default 15 req / 60s (configurabile in Settings). Attende se superato. |
| Circuit breaker | 3 errori consecutivi → cooldown 120s; le chiamate ritornano subito un errore. |
| Timeout | `promiseWithTimeout` (default 600s), abortabile via `AbortSignal`. |
| Retry | Fino a `maxRetries` (default 3), backoff esponenziale + jitter. Salta retry su errori di quota (429). |
| Token tracking | Input/output/total per chiamata, restituiti in `usageMetadata`. |

## Default

- Lingua trascrizione: **Italiano**.
- Modello LLM default: `gemini-3-flash-preview` (fallback in `constants/defaultSettings.ts`).
- Provider: Google (BYOK — API key utente) o Custom OpenAI-compatible.

## Vincoli

- `MAX_SESSIONS = 15`, `MAX_SESSION_SIZE_MB = 50`, `MAX_FILE_SIZE_MB = 100` (`constants/appConfig.ts`).
- Storage IndexedDB soggetto a quota browser → `dbOp` propaga gli errori di quota alla UI.
- `npm run lint` (`tsc --noEmit`) è l'unico check di correttezza (nessun test runner configurato).
