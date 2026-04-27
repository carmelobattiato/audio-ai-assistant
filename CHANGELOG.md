# Changelog

Ogni versione elenca solo le modifiche rilevanti. Stile minimale: una riga per punto, niente ridondanze.

---

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
