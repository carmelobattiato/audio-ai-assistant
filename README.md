# Audio AI Assistant — v.1.70

Applicazione web locale per la **registrazione audio**, **trascrizione automatica** tramite Google Gemini e **analisi con LLM**. Pensata per registrare riunioni, interviste e meeting Teams/Zoom, anche in presenza di cuffie.

Sviluppata da **Carmelo Battiato**.

---

## Avvio rapido (Windows)

Lo script `setup_and_run.ps1` gestisce l'intero ciclo di vita dell'applicazione: installazione dipendenze, avvio in background, stop e reinstallazione.

### Prerequisiti

- **Node.js** (v18 o superiore) — [nodejs.org](https://nodejs.org)
- **Google Gemini API Key** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- File `.env.local` nella cartella del progetto con:
  ```
  GEMINI_API_KEY=la_tua_chiave_api
  ```

### Comandi disponibili

Aprire PowerShell nella cartella del progetto ed eseguire:

```powershell
# Avvia l'applicazione in background (installa le dipendenze al primo avvio)
.\setup_and_run.ps1 start

# Ferma il servizio
.\setup_and_run.ps1 stop

# Controlla lo stato del servizio e l'URL di accesso
.\setup_and_run.ps1 status

# Reinstalla da zero (elimina node_modules e riesegue l'installazione)
.\setup_and_run.ps1 reinstall
```

Al primo `start` lo script installa automaticamente le dipendenze npm e copia il collegamento sul Desktop.

L'app sarà accessibile su: **http://127.0.0.1:8090**

Per usare una porta diversa: `.\setup_and_run.ps1 start -Port 3000`

### Avvio alternativo (terminale)

```bash
npm install
npm run dev       # dev server su http://localhost:5173
npm run build     # build di produzione
npm run lint      # type-checking TypeScript
```

---

## Registrazione audio e System Audio

### Senza cuffie

Il microfono cattura sia la voce locale che l'audio degli altoparlanti (le voci degli altri partecipanti al meeting). La registrazione funziona automaticamente senza configurazioni aggiuntive.

### Con cuffie — perché attivare "System Audio"

Quando si usano le cuffie, il microfono non sente l'audio proveniente dagli altoparlanti. Di conseguenza, senza System Audio attivo, la registrazione cattura **solo la propria voce** e perde completamente le voci degli altri partecipanti (ad es. in Teams, Zoom, Meet).

Per registrare correttamente anche l'audio remoto:

1. Fare clic sul pulsante **"Incl. System Audio"** prima di avviare la registrazione
2. Windows mostrerà una finestra di dialogo per la condivisione schermo: selezionare la finestra o l'intero schermo e confermare
3. L'app catturerà l'audio di sistema (tutto ciò che viene riprodotto sul PC) insieme al microfono

> **Nota:** quando System Audio è attivo, l'eco cancellation viene gestita automaticamente per evitare interferenze tra microfono e audio di sistema.

---

## Funzionalità principali

### Registrazione

- Avvio/Pausa/Ripresa della registrazione
- Visualizzatore waveform in tempo reale
- **Registrazione a segmenti** (chunk): salvataggio automatico ogni N minuti (default 15) per evitare perdite di dati in sessioni lunghe
- **Auto-pausa sul silenzio**: pausa automatica dopo N secondi di silenzio, con soglia configurabile
- **Analisi emozioni in tempo reale**: rileva l'emozione dominante nell'audio (gioia, tristezza, rabbia, sorpresa, ecc.) con visualizzazione cromatica
- **Trascrizione in tempo reale** durante la registrazione (modalità live)
- Import di file audio già registrati per la trascrizione

**Impostazioni qualità audio:**
- Bitrate: 64 / 96 / 128 (default) / 192 / 256 kbps
- Canali: Mono (default) / Stereo
- Filtri microfono: noise suppression, echo cancellation, auto gain control

---

### Trascrizione

Alimentata da Google Gemini (Speech-to-Text multimodale).

- **Lingua:** Italiano (default) o Inglese
- **Qualità:** 5 livelli (da "Veloce/Base" a "Migliore/Lento")
- **Speaker diarization** (sperimentale): identifica i diversi interlocutori con numero approssimativo di partecipanti configurabile
- **Formato output:** TXT, SRT, CSV, HTML
- Coda di trascrizione con gestione di più file in sequenza
- **Smart Pipeline**: al termine della registrazione avvia automaticamente trascrizione → analisi LLM

---

### Analisi LLM

Elabora il testo trascritto con Google Gemini.

**Azioni disponibili:**

| Azione | Descrizione |
|--------|-------------|
| Solo istruzioni personalizzate | Applica solo il prompt custom inserito dall'utente |
| Genera riassunto | Sintesi del contenuto |
| Verbale conciso (stile email) | Verbale breve pronto per l'invio |
| Verbale dettagliato (stile email) | Verbale completo con tutti i punti trattati |
| 10 punti chiave | Lista dei concetti principali |
| Formato intervista/dialogo | Riformatta il testo come trascrizione dialogica |
| Report HTML con timeline | Report formattato con timeline, speaker e note integrate |

- **Modelli selezionabili:** `gemini-3-flash-preview` (default), `gemini-3-pro-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`
- **Provider personalizzato:** supporto a qualsiasi endpoint compatibile OpenAI con modello e URL configurabili
- **Web search** (Google only): arricchisce l'analisi con fonti web, con citazioni
- Istruzioni personalizzate per ogni elaborazione
- Editor rich text per modificare i risultati
- Copia risultato negli appunti come HTML ricco (compatibile con Outlook/Gmail)

---

### Note a bolle (Bubble Notes)

Sistema di annotazioni contestuali sincronizzate con la registrazione.

- Editor rich text con formattazione completa (grassetto, corsivo, colori, liste, link, immagini)
- Timestamp automatico legato al momento della registrazione
- **Screenshot integrati**: inserimento manuale o automatico a intervalli configurabili
- Import di immagini, documenti, PDF e presentazioni nelle note
- Le note vengono incorporate automaticamente nell'analisi LLM (es. report HTML con timeline)
- Visualizzatore fullscreen
- Export delle note come file HTML

---

### Gestione sessioni

- Salvataggio di fino a **5 sessioni** in IndexedDB (storage locale del browser, nessun server)
- Ogni sessione contiene: audio, chunk, trascrizione, risultati LLM, note, statistiche
- Operazioni: salva, carica, unisci sessioni, sovrascrivi
- Ripristino automatico delle sessioni interrotte in modo anomalo
- Dimensione massima per sessione: 50 MB

---

### Export

| Formato | Contenuto |
|---------|-----------|
| ZIP | Archivio completo con audio, trascrizione, risultati e note |
| TXT | Testo trascritto con intestazione metadati opzionale |
| SRT | Sottotitoli (compatibile con video editor e player) |
| CSV | Dati strutturati |
| HTML | Output formattato pronto per la stampa o condivisione |

---

### Statistiche e monitoraggio

- Conteggio token (input/output) per ogni chiamata API
- Statistiche testo: caratteri, parole, token stimati, dimensione
- Dettagli audio: formato, durata, bitrate, canali
- Log delle operazioni con ID di correlazione (tab "Log & Monitoraggio" nelle impostazioni)

---

### Temi UI

- Scuro (default)
- Chiaro
- Grigio scuro

---

## Architettura

Applicazione **client-side only** (React 19 + TypeScript + Vite). Nessun backend, nessun database server. Tutto il dato viene salvato nel browser (IndexedDB). Le uniche chiamate di rete sono verso le API Google Gemini.
