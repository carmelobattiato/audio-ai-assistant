# 🔍 Assessment — audio-ai-assistant

> React 19 + TypeScript · client-side · Gemini · IndexedDB
> Analisi prodotta con 3 agent paralleli (sicurezza/bug · performance · architettura).

---

## Sezione A — 10 Fix Performance / Sicurezza

### 🔴 Sicurezza (critici)

#### A1 · ~~CRITICO~~ → DECLASSATO (falso positivo) · Gemini API key nel bundle
- **File:** `vite.config.ts:440-443`
- **Stato:** non è un problema. Distribuzione = sorgente da GitHub. `.env` gitignored, key non nel repo. Utente che clona → `process.env.API_KEY` undefined → fallback su key utente (BYOK). Il `define` inietta una key solo se chi builda ha una `.env` locale — ed è la *sua*.
- **Residuo (cosmesi):** sostituire fallback `process.env.API_KEY` con messaggio chiaro "imposta key in Settings" — `geminiService.ts:129,186`, `useAudioRecorder.ts:91`, `useLiveTranscriptionLogic.ts:35`.

#### A2 · ~~CRITICO~~ → DECLASSATO (falso positivo) · Chiave cifratura in localStorage
- **File:** `utils/crypto.ts:12` (key `aaia_enc_key_v1`)
- **Stato:** non è un problema. localStorage e IndexedDB hanno identica protezione same-origin → chi accede a uno accede all'altro. La cifratura è offuscamento, non sicurezza reale. Cifratura vera richiederebbe passphrase utente (PBKDF2) — ROI basso, UX peggiore.

#### A3 · ~~ALTO~~ → BASSO · `/api/update/apply` (CSRF residuo)
- **File:** `vite.config.ts:310-409`
- **Stato:** middleware del **dev server** (`configureServer`) → non esiste in produzione. No command injection (spawn array, niente shell). Blast radius nullo (dev solo locale).
- **Hardening opzionale (1 riga):** `if (origin && !origin.startsWith('http://localhost')) { res.statusCode=403; res.end(); return; }`

#### A4 · ALTO · ✅ FIXED · XSS da output LLM renderizzato come HTML
> DOMPurify su tutti i `dangerouslySetInnerHTML` (`TranscriptionView`, `LlmProcessor`, `MeetingChatPanel`, `BubbleNoteViewerModal`). Sanitize `htmlContent` + escape metadati nell'export (`fileUtils`). Escape `file.name` (`useTranscriptionLogic`). Helper `utils/sanitize.ts`.

#### A5 · ALTO · ✅ FIXED · IndexedDB senza try/catch
> Helper `dbOp(label, fn)` in `utils/db.ts`: ogni metodo avvolge op in try/catch, logga `DB_ERROR` via `loggingService`, ri-lancia per propagare alla UI. Nessun fallimento silenzioso su quota exceeded / DB corrotto.

### 🟠 Performance

#### A6 · ALTO · ✅ FIXED · Re-render dell'intero albero ad ogni cambio di stato
> `React.memo` su 4 figli pesanti (`NeoRecordingPanel`, `BubbleNotes`, `TranscriptionView`, `LlmProcessor`). Handler inline estratti in `useCallback`, `customInstructions`/`systemPrompts` in `useMemo`.

#### A7 · ALTO · ✅ FIXED · Props inline (oggetti/funzioni nuove ogni render)
> Tutte le arrow/oggetti inline passati ai 4 figli memoizzati estratti in `useCallback`/`useMemo`. Handler di `useTranscriptionLogic` resi `useCallback`-stabili via `latestRef`.

#### A8 · ALTO · ✅ GIÀ FIXED · IndexedDB write storm
> `hooks/useBatchedDbUpdate.ts`: 4 `scheduleDbUpdate` coalescono in 1 write per finestra 500ms. Write critiche chiamano `flushDbUpdate()` immediato.

#### A9 · MEDIO · ✅ FIXED · Rate limiter O(n²) + array illimitato
> `geminiService.ts`: loop `shift()` ripetuti → conteggio scaduti + 1 `splice(0, expired)`.

#### A10 · MEDIO · ✅ FIXED · Memory leak: stream / blob URL / interval
> `useAudioRecorder`: cleanup su unmount (mic stream, interval chunk, live session). Blob URL già revocati in `fileUtils.ts` e `NeoRecordingPanel.tsx`.

---

## Sezione B — 10 Migliorie (architettura / qualità)

| # | Miglioria | Stato | Note |
|---|-----------|-------|------|
| B1 | **Stato centralizzato → Context + `useReducer`** | ✅ FIXED | `SettingsContext` (useReducer, init async, crypto), `UIStateContext` (14 campi UI), `SessionContext` (28 campi sessione + azioni composte). `NewHome` 1843→1117 righe. |
| B2 | **Infrastruttura test** (Vitest + RTL + happy-dom) | ✅ FIXED | `vitest.config.ts`. Test `geminiService` (rate limiter, circuit breaker). Test `useTranscriptionLogic` (coda, flusso, errori, XSS escape, stop). |
| B3 | **TS strict** — `noUnusedLocals/Parameters`, `noImplicitReturns`, riduzione `as any` | ✅ FIXED | `tsconfig.json`. Rimossi 5 `as any`. Rimosso dead code in ~18 file. Rimasti 0 errori lint. |
| B4 | **Consolidare service layer** — gateway LLM unico | 🔲 TODO | Overlap gemini/transcription/llm ancora presente. `LlmRequest/Response/Error` contratto unificato. Effort ~15h. |
| B5 | **Error boundary + errori async tipizzati** | ✅ FIXED | `types/errors.ts`: `AppError` discriminated union + `classifyError`. `hooks/useErrorHandler.ts`. `useTranscriptionLogic`: catch tipizzati. |
| B6 | **Layer i18n** — stringhe IT hardcoded | 🔲 TODO | 57 componenti, `language` controlla solo trascrizione. `useI18n` + dizionario `it/en`. Effort ~20h. |
| B7 | **JSDoc + `ARCHITECTURE.md`** | ✅ FIXED | `ARCHITECTURE.md` (entry point, pipeline, layer, affidabilità API). JSDoc su `geminiService`, `transcriptionService`, `loggingService`, `useAudioRecorder`, `useTranscriptionLogic`. |
| B8 | **Accessibilità** | ✅ FIXED | `common/Modal`: `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap + Esc. `useFocusTrap` hook. Timer `role="timer"` + `aria-live`. Sweep `aria-label` su 8 bottoni icon-only. Modali custom (`OutlookCalendarModal`, `FullscreenNotesViewer`, `CalEventDetailPanel`). |
| B9 | **Split `NewHome.tsx`** | 🔷 PARZIALE | Estratti: `useCalendarSync`, `useMeetingFlow`, `usePipelineEffects` (FSM, DB sync, ZIP worker). `NewHome` 1843→1117 righe. Ancora da estrarre: `useRecordingHandlers` (~180 righe, bassa priorità — valore principalmente estetico). |
| B10 | **Doc/fix schema IndexedDB** | ✅ FIXED | `docs/DB_SCHEMA.md`. `CLAUDE.md` aggiornato (god-component → `NewHome.tsx`, `MAX_SESSIONS` 5→15). |

---

## ⚡ Quick wins

| # | Task | Stato |
|---|------|-------|
| 1 | Fix `MAX_SESSIONS` 15 vs 5 in `CLAUDE.md` | ✅ |
| 2 | `appStatistics`: `TextEncoder().encode().length` invece di `new Blob([text]).size` | ✅ |
| 3 | Estrarre callback inline in `useCallback` (`NewHome.tsx:1510-1663`) | ✅ |
| 4 | Rate limiter pointer-based (`geminiService.ts`) | ✅ |
| 5 | `key` lista coda: da `name-index` a `name+size` (`TranscriptionView.tsx`) | ✅ |
| 6 | `.catch()` su promise fire-and-forget (`useLiveTranscriptionLogic.ts`) | ✅ |

---

## Priorità residua

1. **B4** (service layer) — elimina bug da duplicazione logica, valore architetturale reale.
2. **B6** (i18n) — se l'app deve supportare più lingue nell'UI.
3. **B9 resto** (`useRecordingHandlers`) — bassa priorità, valore principalmente estetico.
4. **A1/A2 residui** (cosmesi fallback API key) — opzionali.
