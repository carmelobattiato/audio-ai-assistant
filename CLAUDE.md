# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Changelog

`CHANGELOG.md` è il file di riferimento per tutte le modifiche. **Aggiornarlo è obbligatorio** prima di ogni commit, nella sezione della versione corrente.

Stile richiesto:
- Una riga per punto, inizia con verbo all'infinito o sostantivo
- Niente frasi lunghe, niente aggettivi superflui, niente "aggiunto/migliorato" generico
- Solo ciò che cambia il comportamento per l'utente o la struttura del codice
- Il blocco dell'ultima versione viene usato automaticamente come corpo del messaggio di commit da `github_push.sh`

Esempio corretto:
```
- Cifratura AES-GCM per la chiave API in IndexedDB
- Fix countdown auto-pause: il tasto mostra `Pausa in Ns…` durante warning
```

Esempio da evitare:
```
- Migliorata l'esperienza utente nella gestione delle chiavi API con una nuova UI molto più intuitiva
- Risolto un problema che causava un comportamento non corretto durante l'auto-pause
```

## Commands

```bash
npm run dev       # Start dev server at http://0.0.0.0:3000
npm run build     # Production build (outputs to dist/)
npm run preview   # Serve production build locally
npm run lint      # TypeScript type-checking (tsc --noEmit)
```

No test runner is configured. Type-checking (`npm run lint`) is the primary correctness check.

## Environment

The app requires a Google Gemini API key. Set it in a `.env` file:

```
GEMINI_API_KEY=your_key_here
```

Vite exposes this to the frontend via `import.meta.env.VITE_GEMINI_API_KEY` (or via the `GEMINI_API_KEY` alias in `vite.config.ts`).

## Architecture

This is a **client-side-only React 19 + TypeScript** app (no backend server) that records audio, transcribes it via Google Gemini, and runs LLM analysis on the results. All persistence is in **IndexedDB** (browser storage); no server-side database.

### Data Flow

```
Mic + System Audio
      ↓
  MediaRecorder (WebRTC)
      ↓ 15-min chunks (blobs)
  IndexedDB session storage
      ↓
  Gemini API → speech-to-text transcription
      ↓
  Gemini API → LLM analysis (custom prompts)
      ↓
  Export (HTML / SRT / CSV / ZIP)
```

### State Management

All state lives in `App.tsx` (~565 lines). There is no Redux or Context API — props and callbacks are drilled down. `App.tsx` coordinates the major async pipelines: recording → transcription queue → LLM processing.

### Key Layers

**Audio Recording** (`hooks/useAudioRecorder.ts`, `hooks/useMediaStreams.ts`)
- Captures mic + display audio via WebRTC `MediaRecorder`
- Supports chunked recording (default 15-min chunks), auto-pause on silence, and real-time emotion detection

**Gemini Service** (`services/geminiService.ts` / `services/llmService.ts`)
- All Gemini API calls go through a single service with rate limiting, a circuit breaker (3 consecutive errors → 2-min cooldown), timeout handling, and retry logic
- Tracks token counts (input/output) per call

**Transcription Pipeline** (`services/transcriptionService.ts`, `hooks/useTranscriptionLogic.ts`)
- Queues audio blobs and sends them to Gemini speech-to-text
- Handles MIME type detection per browser/OS

**Session Persistence** (`utils/db.ts`)
- IndexedDB via `idb` library; max 5 sessions (oldest auto-deleted)
- Sessions are marked **Interrupted** on app reload if they were In Progress, allowing recovery

**Export** (`utils/fileUtils.ts`)
- Generates SRT (subtitles), CSV, styled HTML reports, and ZIP archives containing all of the above

### Path Alias

`@/` maps to the project root (configured in `tsconfig.json` and `vite.config.ts`). Use it for all internal imports.

### Default Language & Model

- Transcription language defaults to **Italian**
- LLM model defaults to `gemini-3-flash-preview` (with fallbacks in `constants/defaultSettings.ts`)

### Notable Constraints

- Max session storage: 50 MB per session; max file upload: 100 MB
- Max 5 saved sessions in IndexedDB
- Rate limit default: 15 Gemini requests per 60 seconds (configurable in Settings)
