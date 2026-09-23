<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=200&section=header&text=Audio%20AI%20Assistant&fontSize=50&fontColor=fff&animation=twinkling&fontAlignY=35&desc=Record%20·%20Transcribe%20·%20Analyse%20—%20zero%20server&descAlignY=55&descSize=18" width="100%"/>

<br/>

[![Version](https://img.shields.io/badge/version-1.178-6366f1?style=for-the-badge&logo=github)](CHANGELOG.md)
[![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Gemini](https://img.shields.io/badge/Gemini_API-Google-4285f4?style=for-the-badge&logo=google&logoColor=white)](https://aistudio.google.com)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge)](LICENSE)

<br/>

> **Fully in-browser AI meeting assistant.** Records mic + system audio, transcribes via Gemini STT, runs LLM analysis — no server, no tracking, all data stays in your browser.

<br/>

```
┌─────────────────────────────────────────────────────────────────┐
│  🎙️  Mic + System Audio                                         │
│       │                                                         │
│       ▼                                                         │
│  🔄  MediaRecorder  ──►  IndexedDB  ──►  Gemini STT             │
│                                               │                 │
│                                               ▼                 │
│  📊  Export (ZIP/HTML/SRT/CSV)  ◄──  Gemini LLM Analysis        │
└─────────────────────────────────────────────────────────────────┘
```

</div>

---

## ⚡ At a Glance

<table>
<tr>
<td width="25%" align="center">

### 🎙️ Recording
Mic + System Audio  
Chunked auto-save  
Live waveform  
Silence detection  
Emotion detection

</td>
<td width="25%" align="center">

### 📝 Transcription
Gemini STT  
Italian / English  
Queue pipeline  
SRT · CSV · HTML  
Editable output

</td>
<td width="25%" align="center">

### 🤖 AI Analysis
7 analysis modes  
Web search grounding  
Custom system prompts  
Rich HTML results  
Token tracking

</td>
<td width="25%" align="center">

### 💬 Chat
Multi-turn context  
Note images support  
12-turn history  
Inline SVG charts  
Markdown export

</td>
</tr>
</table>

---

## 🚀 Installazione

### 🪟 Windows — installazione guidata (consigliata)

> Per chi non usa il terminale. Tutto automatico con un doppio clic.

**Passo 1 — Scarica l'app**

Clicca **[Download ZIP](https://github.com/carmelobattiato/audio-ai-assistant/archive/refs/heads/main.zip)**, estrai la cartella dove vuoi (es. `C:\Audio-AI-Assistant\`).

**Passo 2 — Ottieni la chiave API Gemini**

La chiave è gratuita. Puoi ottenerla su [aistudio.google.com/apikey](https://aistudio.google.com/apikey), oppure richiedila al tuo responsabile IT.

**Passo 3 — Avvia l'installazione**

Fai **doppio clic** su `Installa_Windows.bat` nella cartella estratta.  
Lo script ti guida passo dopo passo: inserisce la chiave API, installa Node.js se mancante, crea l'icona sul Desktop e avvia l'app nel browser.

**Avvii successivi:** doppio clic sull'icona `Audio AI Assistant` sul Desktop.

---

### 🖥️ macOS / Linux

<details>
<summary>Espandi istruzioni macOS / Linux</summary>

```bash
# Clona il repository
git clone https://github.com/carmelobattiato/audio-ai-assistant
cd audio-ai-assistant

# Imposta la chiave API
echo "GEMINI_API_KEY=la_tua_chiave_qui" > .env

# Installa, crea icona Desktop e avvia
bash setup_and_run.sh install
# → http://127.0.0.1:8090

# Comandi successivi
bash setup_and_run.sh open      # apri nel browser (avvia se spento)
bash setup_and_run.sh stop      # ferma il server
bash setup_and_run.sh status    # verifica stato
bash setup_and_run.sh restart   # riavvia
```

> Senza git: scarica il [ZIP](https://github.com/carmelobattiato/audio-ai-assistant/archive/refs/heads/main.zip) ed estrai.

</details>

### 🪟 Windows (PowerShell avanzato)

<details>
<summary>Espandi istruzioni PowerShell</summary>

```powershell
# Prima installazione (installa deps, crea icona Desktop, avvia)
.\setup_and_run.ps1 install

# Avvii successivi
.\setup_and_run.ps1 open        # apri nel browser (avvia se spento)
.\setup_and_run.ps1 stop        # ferma il server
.\setup_and_run.ps1 status      # verifica stato
.\setup_and_run.ps1 restart     # riavvia

# Porta personalizzata
.\setup_and_run.ps1 install -Port 3000
# → http://127.0.0.1:8090
```

</details>

> 🔑 Chiave API Gemini gratuita: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

---

## 🧠 How It Works

```mermaid
flowchart LR
    A[🎙️ Microphone] --> MIX
    B[🔊 System Audio] --> MIX
    MIX([AudioContext\nMixer]) --> MR[MediaRecorder\nWebM/Opus]
    MR -->|"chunk\nevery 15 min"| IDB[(IndexedDB\nSession Store)]
    IDB --> Q[Transcription\nQueue]
    Q --> STT[Gemini\nSpeech-to-Text]
    STT --> T[📄 Editable\nTranscript]
    T --> LLM[Gemini\nLLM Analysis]
    LLM --> R[📊 Rich HTML\nResult]
    R --> EXP[📦 Export\nZIP/HTML/SRT/CSV]

    style MIX fill:#6366f1,color:#fff
    style STT fill:#4285f4,color:#fff
    style LLM fill:#4285f4,color:#fff
    style IDB fill:#f97316,color:#fff
```

---

## 🏗️ Architecture

<details open>
<summary><b>📦 Tech Stack</b></summary>

<br/>

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React 19 + TypeScript 5 | Concurrent rendering, strict types |
| **Build** | Vite 6 (OXC bundler) | Sub-second HMR, fast builds |
| **AI / Speech** | Google Gemini API v1 | Multimodal STT + LLM in one SDK |
| **Persistence** | IndexedDB via `idb` v8 | Zero-server, up to 50 MB/session |
| **Document parsing** | `mammoth` + `pdfjs-dist` | DOCX/PDF import for notes |
| **Calendar** | COM/ICS/Extension | Three parallel sources |
| **State** | Props + callbacks | No Redux, no Context — simple by design |

> **Zero backend.** The only outbound calls are to `generativelanguage.googleapis.com`.

</details>

<details>
<summary><b>🔌 Gemini API Resilience Pipeline</b></summary>

<br/>

```mermaid
sequenceDiagram
    participant UI
    participant GeminiService
    participant RateLimit
    participant CircuitBreaker
    participant GeminiAPI

    UI->>GeminiService: transcribe(audioBlob)
    GeminiService->>RateLimit: acquire slot (≤15 req/60s)
    RateLimit-->>GeminiService: ✓ ok
    GeminiService->>CircuitBreaker: check state
    CircuitBreaker-->>GeminiService: CLOSED (healthy)
    GeminiService->>GeminiAPI: POST /generateContent
    GeminiAPI-->>GeminiService: text + token counts
    GeminiService-->>UI: transcript string

    note over CircuitBreaker: 3 consecutive errors →<br/>open circuit for 2 min
```

`geminiService.ts` implements:

| Guard | Config | Behaviour |
|-------|--------|-----------|
| **Rate limiter** | 15 req / 60 s | Sliding window, configurable |
| **Circuit breaker** | 3 errors → open | Resets after 2 min cooldown |
| **Retry** | Exponential back-off | Transient failures only |
| **Token tracking** | Per call | Input + output logged |

</details>

<details>
<summary><b>🗺️ Component Map</b></summary>

<br/>

```mermaid
graph TD
    subgraph "Page Roots"
        APP["App.tsx\n(Classic UI)"]
        NH["NewHome.tsx\n(Neo UI)"]
    end

    subgraph "Hooks"
        UAR["useAudioRecorder\nMediaRecorder + chunking"]
        UTL["useTranscriptionLogic\nqueue + pipeline"]
        USL["useSessionLogic\nIndexedDB CRUD"]
        URF["useRecordingFavicon\nanimated tab icon"]
        UAV["useAudioVisualizer\ncanvas waveform"]
    end

    subgraph "Services"
        GEM["geminiService.ts\nrate limit · circuit breaker"]
        TRANS["transcriptionService.ts"]
        LOG["loggingService.ts"]
    end

    subgraph "Neo UI"
        NL["NeoLayout"] --> NTB["NeoTopbar"]
        NL --> NRP["NeoRecordingPanel"]
        NL --> NWP["NeoWorkspacePanel"]
        NRP --> UAV
        NTB --> NCD["NeoCalendarDayView"]
    end

    APP & NH --> UAR & UTL & USL
    NH --> URF & NL
    UAR --> GEM
    UTL --> TRANS --> GEM
    USL --> DB[(IndexedDB)]
```

</details>

<details>
<summary><b>♻️ Session Lifecycle</b></summary>

<br/>

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Recording : ▶ Start
    Recording --> Paused : ⏸ Pause / silence
    Paused --> Recording : ▶ Resume
    Recording --> Idle : ⏹ Stop
    Idle --> Transcribing : 📝 Transcribe
    Transcribing --> Transcribed : Gemini STT ✓
    Transcribed --> Analyzing : 🤖 Run analysis
    Analyzing --> Complete : LLM ✓
    Complete --> Idle : 🔄 Reset

    Recording --> Interrupted : 💥 Browser crash
    Interrupted --> Idle : 🔁 Auto-recover
```

</details>

---

## 🎙️ Recording Engine

```
Audio Sources          Processing              Storage
──────────────         ──────────────          ──────────────
🎤 Microphone    ──►   AudioContext Mixer  ──► IndexedDB
🔊 System Audio  ──►   MediaRecorder       ──► (chunked blobs)
                       WebM / Opus              max 50 MB
```

| Feature | Detail |
|---------|--------|
| **Chunked recording** | Auto-save every N min (default 15) — safe for long sessions |
| **Auto-pause on silence** | Configurable threshold + timeout |
| **Emotion detection** | Real-time dominant emotion with color overlay |
| **Live transcription** | Streaming transcript during recording |
| **Audio quality** | 64 / 96 / **128** / 192 / 256 kbps · Mono/Stereo · Noise suppression |
| **Headphones mode** | Screen-share guide to capture system audio via `getDisplayMedia` |
| **Animated favicon** | Canvas-rendered red waveform in browser tab (32×32, 8 bars, 14 fps) |

---

## 🤖 AI Models

<table>
<tr>
<th>Model</th>
<th>Speed</th>
<th>Quality</th>
<th>Use for</th>
</tr>
<tr>
<td><code>gemini-3.8-flash</code> ⭐ default</td>
<td>🟢 Fast</td>
<td>🟢 High</td>
<td>Transcription + analysis (recommended)</td>
</tr>
<tr>
<td><code>gemini-flash-latest</code></td>
<td>🟢 Fast</td>
<td>🟢 High</td>
<td>Auto-updated alias — always latest Flash</td>
</tr>
<tr>
<td><code>gemini-3.1-pro-preview</code></td>
<td>🟡 Medium</td>
<td>🟢 Best</td>
<td>Detailed minutes, complex analysis</td>
</tr>
<tr>
<td><code>gemini-2.5-flash</code> ⚠️ EOL ott 2026</td>
<td>🟢 Fast</td>
<td>🟡 Good</td>
<td>Legacy — prefer gemini-3.8-flash</td>
</tr>
<tr>
<td>OpenAI-compatible proxy</td>
<td>—</td>
<td>—</td>
<td>LiteLLM, gateway aziendale, local model</td>
</tr>
</table>

### Analysis Modes

```
┌─────────────────────────────────────────────────────────┐
│  1. Custom instructions only                            │
│  2. Generate summary                                    │
│  3. Concise minutes  (email-ready)                      │
│  4. Detailed minutes (full coverage)                    │
│  5. 10 key points   (bullet list)                       │
│  6. Interview / dialogue format                         │
│  7. HTML report with timeline ◄── includes Bubble Notes │
└─────────────────────────────────────────────────────────┘
```

---

## 📅 Outlook Calendar Bridge

Three parallel sources — pick the one that fits your setup:

```mermaid
sequenceDiagram
    participant App

    Note over App: Source 1 — Windows COM
    App->>PowerShell: GET /api/outlook/appointments
    PowerShell->>OutlookCOM: GetDefaultFolder(9).Items
    OutlookCOM-->>App: attendees · Teams URL · responseStatus

    Note over App: Source 2 — ICS Feed (cross-platform)
    App->>App: fetch ICS URL → parse RFC5545 → filter today

    Note over App: Source 3 — Browser Extension v3
    App->>Extension: BroadcastChannel listen
    Extension->>OutlookLive: REST API Bearer JWT
    OutlookLive-->>App: CalendarView events
```

| Source | Platform | Latency | Data richness |
|--------|----------|---------|---------------|
| **Windows COM** | Windows only | Real-time | ★★★ Attendees, Teams URL, body |
| **ICS Feed** | Cross-platform | 1–3 h | ★★ Title, time, location |
| **Extension v3** | Chrome / Edge | ~30 s | ★★★ Full calendar data |

<details>
<summary>🔧 Extension Setup (v3)</summary>

1. Settings → Integrations → Browser Extension → download `calendar-bridge-v3.zip`
2. Extract → `chrome://extensions` → Developer mode → **Load unpacked**
3. Open `outlook.live.com/calendar` or `outlook.cloud.microsoft`
4. Wait ~30 s → badge **"Outlook ● Connessa"** appears

</details>

---

## 💾 Session Management

```
┌────────────────────────────────────────────────────────────────┐
│                      Session  (IndexedDB)                      │
│                                                                │
│  📁 audio chunks    📝 transcript    🤖 LLM results            │
│  📌 bubble notes    💬 chat history  📊 statistics             │
│                                                                │
│  Max: 50 sessions · 50 MB each · auto-purge oldest            │
└────────────────────────────────────────────────────────────────┘
```

| Operation | Description |
|-----------|-------------|
| **Save** | Snapshot current session to IndexedDB |
| **Load** | Restore any saved session |
| **Continue** | Load + immediately resume recording |
| **Merge** | Combine two sessions into one |
| **Recover** | Auto-detect & recover crashed/interrupted sessions |
| **Import/Export** | JSON file for cross-device transfer |

---

## 📤 Export Formats

<table>
<tr>
<td align="center">📦<br/><b>ZIP</b><br/>Full archive</td>
<td align="center">🌐<br/><b>HTML</b><br/>Formatted report</td>
<td align="center">📋<br/><b>SRT</b><br/>Subtitles</td>
<td align="center">📊<br/><b>CSV</b><br/>Structured data</td>
<td align="center">📄<br/><b>TXT</b><br/>Plain transcript</td>
<td align="center">💬<br/><b>MD</b><br/>Chat export</td>
</tr>
</table>

---

## 📊 Statistics & Monitoring

```
Per-session telemetry
────────────────────────────────────────────
  🪙 Token usage      input / output per API call
  📝 Text stats       chars · words · estimated tokens · size
  🎵 Audio details    format · duration · bitrate · channels
  🎯 Coherence score  LLM analysis quality metric
  📋 Operation log    configurable level (Settings → Log & Monitoring)
```

---

## 🗂️ Project Structure

<details>
<summary>📁 Full file tree</summary>

```
audio-ai-assistant/
│
├── App.tsx                      # Classic UI root — all state, no Redux/Context
├── pages/
│   └── NewHome.tsx              # Neo UI root — mirrors App.tsx hooks
│
├── components/
│   ├── common/                  # Modal, ConfirmModal — shared primitives
│   ├── recorder/                # RecorderActions, RecorderStatus
│   ├── settings/                # Settings tab sub-components
│   ├── llm/                     # LLM provider selector, result renderer
│   ├── notes/                   # NoteBubble, screenshot toolbar
│   ├── newpage/                 # Neo UI shell
│   │   ├── NeoLayout.tsx
│   │   ├── NeoTopbar.tsx
│   │   ├── NeoRecordingPanel.tsx
│   │   ├── NeoWorkspacePanel.tsx
│   │   ├── NeoCalendarDayView.tsx
│   │   └── NeoTipsPanel.tsx
│   ├── AudioRecorder.tsx
│   ├── TranscriptionView.tsx
│   ├── LlmProcessor.tsx
│   ├── MeetingChatPanel.tsx
│   ├── BubbleNotes.tsx
│   ├── SettingsPanel.tsx
│   └── OutlookCalendarModal.tsx
│
├── hooks/
│   ├── useAudioRecorder.ts      # MediaRecorder + chunking + silence detection
│   ├── useAudioVisualizer.ts    # Canvas waveform renderer
│   ├── useTranscriptionLogic.ts # Queue + Smart Pipeline
│   ├── useSessionLogic.ts       # IndexedDB save/load/merge
│   └── useRecordingFavicon.ts   # Animated tab favicon
│
├── services/
│   ├── geminiService.ts         # Rate limiter + circuit breaker + retry
│   ├── transcriptionService.ts
│   └── loggingService.ts
│
├── utils/
│   ├── db.ts                    # IndexedDB CRUD (idb library)
│   ├── fileUtils.ts             # ZIP, SRT, HTML, CSV export
│   ├── audioUtils.ts
│   └── textUtils.ts
│
├── constants/
│   └── defaultSettings.ts       # Default model, language, rate limits
│
├── types.ts                     # Shared TypeScript interfaces
├── vite.config.ts               # Vite config + Outlook PowerShell bridge plugin
└── index.html                   # CSS variables (--neo-*), tooltip system
```

</details>

---

## 🛠️ Scripts & Deployment

| Script | Platform | Comandi |
|--------|----------|---------|
| `Installa_Windows.bat` | Windows | Doppio clic — guida installazione completa per non tecnici |
| `Start.bat` | Windows | Doppio clic — avvio rapido (dopo prima installazione) |
| `setup_and_run.ps1` | Windows | `install` · `open` · `stop` · `status` · `restart` · `uninstall` |
| `setup_and_run.sh` | macOS / Linux | `install` · `open` · `stop` · `status` · `restart` · `autostart-enable` |
| `scripts/github.sh` | macOS / Linux | `push` · `--pull-force` (sovrascrive locale da remoto) |
| `backup.sh` | macOS / Linux | Backup locale con report dimensioni |

---

## 📋 Ultime modifiche

### v1.178 — 2026-09-22

- Checkbox "Proxy OpenAI-compatible" in LLM Configuration: attiva formato `/v1/chat/completions` per proxy LiteLLM; disattivo usa Gemini SDK nativo
- `Installa_Windows.bat`: installer doppio clic per utenti non tecnici — guida chiave API, auto-install Node.js, avvio app
- `setup_and_run.ps1`: auto-installazione Node.js via winget se mancante
- `setup_and_run.sh`: controllo dipendenze con auto-install via brew / apt / dnf / pacman

> Storico completo in [CHANGELOG.md](CHANGELOG.md)

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=100&section=footer" width="100%"/>

**Built with ❤️ by [Carmelo Battiato](https://github.com/carmelobattiato)**

Powered by **Google Gemini** · No server · No tracking · All data stays in your browser

[![GitHub](https://img.shields.io/badge/GitHub-carmelobattiato-181717?style=for-the-badge&logo=github)](https://github.com/carmelobattiato/audio-ai-assistant)
[![Issues](https://img.shields.io/badge/Issues-report_a_bug-ef4444?style=for-the-badge&logo=github)](https://github.com/carmelobattiato/audio-ai-assistant/issues)

</div>
