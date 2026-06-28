# 🔍 Assessment — audio-ai-assistant

> React 19 + TypeScript · client-side · Gemini · IndexedDB
> Analisi prodotta con 3 agent paralleli (sicurezza/bug · performance · architettura).
> **Solo report — nessuna modifica al codice.**

> [!WARNING]
> **`CLAUDE.md` obsoleto.** Dice *"App.tsx ~565 righe / max 5 sessioni"*. Reale: il god-component è `pages/NewHome.tsx (~1843 righe)` e `MAX_SESSIONS = 15` in `appConfig.ts:71`. Da allineare (vedi Miglioria #10).

---

## Sezione A — 10 Fix Performance / Sicurezza

### 🔴 Sicurezza (critici)

#### A1 · ~~CRITICO~~ → DECLASSATO (falso positivo) · Gemini API key nel bundle
- **File:** `vite.config.ts:440-443`
- **Stato:** **non è un problema.** Distribuzione = sorgente da GitHub. `.env` è gitignored, key non nel repo. Utente che clona → `process.env.API_KEY` undefined → fallback automatico su key utente (`googleApiKey`, BYOK già attivo). Il `define` inietta una key solo se chi builda ha una `.env` locale — ed è la *sua*.
- **Vale solo se:** si distribuisce un `dist/` già buildato con propria `.env` (hosting/zip). Non è il caso qui.
- **Residuo (cosmesi):** sostituire fallback `process.env.API_KEY` con messaggio chiaro "imposta key in Settings" — `geminiService.ts:129,186`, `useAudioRecorder.ts:91`, `useLiveTranscriptionLogic.ts:35`.

#### A2 · ~~CRITICO~~ → DECLASSATO (falso positivo) · Chiave cifratura in localStorage
- **File:** `utils/crypto.ts:12` (key `aaia_enc_key_v1`)
- **Stato:** **non è un problema** sotto stesso ragionamento di A1. Dato cifrato = API key *dell'utente* nel *suo* browser; chiave di cifratura nello stesso `localStorage`. localStorage e IndexedDB hanno identica protezione same-origin → chi accede a uno accede all'altro. La cifratura è offuscamento, non ferma attaccanti reali (altro sito già bloccato da same-origin; XSS/malware leggono entrambi). Innocuo, si lascia com'è.
- **Vale solo se:** scenario multi-utente / key condivisa (non il caso). Cifratura vera richiederebbe passphrase utente (PBKDF2, `extractable:false`) — ROI basso, UX peggiore.

#### A3 · ~~CRITICO~~ → BASSO · `/api/update/apply` (CSRF residuo)
- **File:** `vite.config.ts:310-409`
- **Stato:** molto ridimensionato. È middleware del **dev server** (`configureServer`) → **non esiste in produzione**. No command injection (`spawn('git', array)`, niente shell, args hardcoded). `repoUrl` mai passato a git. `reset --hard origin/main` punta al remote locale, non attaccabile. Dev server usato **solo in locale, niente rete** → blast radius nullo.
- **Residuo (teorico, minimo):** CSRF — sito malevolo potrebbe POST a `localhost:3000/api/update/apply` mentre il dev server è attivo, forzando reset del checkout (perdita lavoro non committato).
- **Hardening opzionale (1 riga):** check origin nel POST handler — `if (origin && !origin.startsWith('http://localhost')) { res.statusCode=403; res.end(); return; }`

#### A4 · ALTO · ✅ FIXED · XSS da output LLM renderizzato come HTML
> **Risolto.** DOMPurify su tutti i `dangerouslySetInnerHTML` (`TranscriptionView:352`, `LlmProcessor:578`, `MeetingChatPanel:519`, `BubbleNoteViewerModal:197`), sanitize `htmlContent` + escape metadati nell'export (`fileUtils`), escape `file.name` (`useTranscriptionLogic`). Helper `utils/sanitize.ts`. `npm run lint` verde. Script `setup_and_run.ps1`/`build-extension*.sh` non richiedono modifiche (usano `npm install`, prende dompurify da `package.json`).

- **File:** `hooks/useTranscriptionLogic.ts:100-104` (anche `:155,228,277`), `components/TranscriptionView.tsx:352` (`dangerouslySetInnerHTML`), `utils/fileUtils.ts:254`, `utils/textUtils.ts:162-195` (`innerHTML`)
- **Problema:** output Gemini iniettato in HTML senza sanitizzazione (`result.replace(/\n/g,'<br/>')`). Prompt injection → stored XSS negli export HTML.
- **Fix:** sanitizzare ogni output LLM con **DOMPurify** prima del render; `textContent` dove possibile; escape di titoli/filename nei template.

#### A5 · ALTO · ✅ FIXED · IndexedDB senza try/catch
> **Risolto.** Helper `dbOp(label, fn)` in `utils/db.ts`: ogni metodo (~26) avvolge le op `put/get/delete/tx.done` in try/catch, logga su `loggingService.error('DB_ERROR', …)` con nome+messaggio errore, e ri-lancia per propagare alla UI. Nessun fallimento silenzioso su quota exceeded / DB corrotto. Nessun ciclo di import (loggingService non importa db). `npm run lint` verde.

- **File:** `utils/db.ts:106-167` (`saveSession`, `updateSessionIncremental`, `cleanupOldSessions`)
- **Problema:** operazioni `put/get/tx.done` non protette → su quota exceeded / DB corrotto l'errore è unhandled, fallimento silenzioso.
- **Fix:** wrap try/catch su tutte le op DB, log via `loggingService`, propagare errore alla UI.

### 🟠 Performance

#### A6 · ALTO · Re-render dell'intero albero ad ogni cambio di stato
- **File:** `pages/NewHome.tsx` (~102 `useState`)
- **Problema:** ogni `setX` ri-renderizza tutto il sottoalbero; figli (`NeoRecordingPanel`, `TranscriptionView`, `LlmProcessor`, `BubbleNotes`) ricevono decine di props, quasi nessun `React.memo`.
- **Fix:** `React.memo` sui 4 figli pesanti + stabilizzare le props (vedi A7). Lungo termine: Context/useReducer (Miglioria #1).
- **Guadagno stimato:** -60/70% render per interazione.

#### A7 · ALTO · Props inline (oggetti/funzioni nuove ogni render)
- **File:** `pages/NewHome.tsx:1510,1513,1517,1598,1630,1663`
- **Problema:** arrow function e object literal inline → nuova reference ogni render, annulla qualsiasi `React.memo`.
- **Fix:** estrarre in `useCallback`; oggetti settings in `useMemo` (es. `llmSettingsForChat`).

#### A8 · ALTO · IndexedDB write storm
- **File:** `pages/NewHome.tsx:481-505`
- **Problema:** 4 `useEffect`→`scheduleDbUpdate` separati (title, bubbleNotes, transcript, chat) → burst di scritture ogni 500ms; `db.ts:148-167` ri-serializza l'intera sessione (con blob audio) ad ogni scrittura.
- **Fix:** consolidare in 1 update batched (oggetto `useMemo`), debounce 1000ms per edit non critici, scrivere solo i campi cambiati.
- **Guadagno stimato:** -50% latenza DB.

#### A9 · MEDIO · Rate limiter O(n²) + array illimitato
- **File:** `services/geminiService.ts:56-76`
- **Problema:** `requestTimestamps.shift()` in while loop (`shift` è O(n)) e array senza cap.
- **Fix:** approccio pointer-based (avanza indice oldest, conta `length - oldest`), compattazione periodica.
- **Guadagno stimato:** cleanup da O(n²) → ~O(1).

#### A10 · MEDIO · Memory leak: stream / blob URL / interval
- **File:** `hooks/useAudioRecorder.ts:174-226` (mic stream non chiuso se `getDisplayMedia` fallisce), `:103` (interval chunk non pulito su unmount); `services/loggingService.ts:46` (`setInterval` mai cleared, nessun `destroy()`); blob URL non sempre revocati (`fileUtils.ts:307-312`, `NeoRecordingPanel.tsx:357-359`)
- **Fix:** cleanup immediato per-stream in catch; `clearInterval` in cleanup di unmount; metodo `destroy()` su loggingService; `URL.revokeObjectURL` in try/finally.

---

## Sezione B — 10 Migliorie (architettura / qualità)

| # | Miglioria | Valore | Effort | File principali |
|---|-----------|--------|--------|-----------------|
| B1 | **Stato centralizzato → Context + `useReducer`** — elimina prop-drilling, ~50 `useState` in `NewHome`, stato come discriminated union (`idle/recording/transcribing/analyzing/error`) | ALTO | ALTO (~50h) | `pages/NewHome.tsx`, +`contexts/AppStateContext.tsx` |
| B2 | **Infrastruttura test** — oggi solo `tsc --noEmit`, nessun runner. Vitest + RTL + happy-dom; coprire `geminiService` (rate limiter, circuit breaker), `useTranscriptionLogic` | ALTO | MED-ALTO (~30h) | +`vitest.config.ts`, `package.json` |
| B3 | **TS strict** — rimuovere 7× `as any` (es. `(window as any).AudioContext`, `(navigator as any).connection`); aggiungere `noUnusedLocals/Parameters`, `noImplicitReturns`, `exactOptionalPropertyTypes` | MEDIO | MEDIO (~12h) | `tsconfig.json`, `services/*`, `hooks/*` |
| B4 | **Consolidare service layer** — gateway LLM unico con contratto `LlmRequest/Response/Error`; rate-limit + circuit breaker + token tracking in un posto; eliminare overlap gemini/transcription/llm | MEDIO | MEDIO (~15h) | `services/geminiService.ts`, `transcriptionService.ts` |
| B5 | **Error boundary + errori async** — `ErrorBoundary` cattura solo render; errori async persi in `catch{ setAppUserMessage }`. `useErrorHandler` con `AppError` tipizzato + retry UI | MEDIO | MEDIO (~18h) | `components/ErrorBoundary.tsx`, +`hooks/useErrorHandler.ts` |
| B6 | **Layer i18n** — stringhe IT hardcoded in 57 componenti; `language` controlla solo trascrizione. `useI18n` + dizionario `it/en` | LOW-MED | MEDIO (~20h) | +`i18n/messages.ts` |
| B7 | **JSDoc + `ARCHITECTURE.md`** — hook/service senza doc; aggiungere diagramma flusso stato, schema DB, pipeline export | MEDIO | BASSO (~10h) | `services/*`, `hooks/*`, +`ARCHITECTURE.md` |
| B8 | **Accessibilità** — solo 27 attr ARIA su 57 componenti; aggiungere `aria-label` ai controlli, `aria-live` al timer, `role="dialog"`+focus trap ai modali, keyboard nav | MEDIO | MEDIO (~15h) | 20+ componenti |
| B9 | **Split `NewHome.tsx`** — 1843 righe → estrarre `useSessionManagement`, `useAiPipeline`, `useCalendarIntegration` + sub-componenti `RecordingLayout`, `ExportPanel` | MEDIO | MEDIO (~18h) | `pages/NewHome.tsx` |
| B10 | **Doc/fix schema IndexedDB** — commentare indici, +`docs/DB_SCHEMA.md`, **correggere `CLAUDE.md` obsoleto + incoerenza `MAX_SESSIONS` (15 in `appConfig.ts:71` vs "5" nei docs)** | BASSO | BASSO (~7h) | `utils/db.ts`, `appConfig.ts`, `CLAUDE.md` |

---

## ⚡ Quick wins (< 2h ciascuno)

1. Fix `MAX_SESSIONS` 15 vs 5 (`appConfig.ts:71` ↔ `CLAUDE.md`) — 5 min.
2. `appStatistics`: `new Blob([text]).size` → `new TextEncoder().encode(text).length` (no alloc) — `NewHome.tsx:210,216`.
3. Estrarre callback inline in `useCallback` — `NewHome.tsx:1510-1663`.
4. Rate limiter pointer-based — `geminiService.ts:56-76`.
5. `key` lista coda: da `name-index` a `name+size` — `TranscriptionView.tsx:236`.
6. `.catch()` sulle promise fire-and-forget — `useLiveTranscriptionLogic.ts:64-72`.

---

## Priorità d'azione (raccomandata)

1. **Subito (sicurezza):** A1, A2, A3, A4 — esposizione key + XSS + endpoint update.
2. **Sprint perf:** A6, A7, A8 (poi A9, A10).
3. **Fondamenta:** B1 (Context/reducer) + B2 (test) — abilitano il resto.
4. **Resto:** B3–B10.
