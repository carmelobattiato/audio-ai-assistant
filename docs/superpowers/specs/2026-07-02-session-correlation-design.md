# Session Correlation System — Design Spec

**Date:** 2026-07-02  
**Status:** Approved  

---

## Context

Users record multiple sessions over time (meetings, calls, interviews). The AI analysis and chatbot currently only see the current session. This feature lets users select past sessions from the calendar, correlate them to the current session, and inject their full content as clearly-separated historical context for AI/chat — without mixing past and present.

---

## Overview

Three integrated pieces:
1. **Calendar multi-select** — select past events to correlate
2. **Historical Event Bubbles** — correlated sessions appear as special BubbleNotes in the timeline
3. **AI Context Injection** — full historical context sent to Gemini in a separate block, with a user toggle

---

## 1. Data Layer

### `types.ts`

```typescript
// In SavedSessionData (line ~383)
correlatedSessionIds?: string[];    // IDs of past sessions correlated to this session
useHistoricalContext?: boolean;      // Toggle: include historical context in AI calls (default: true)

// In BubbleNote type union
type: 'screenshot' | 'auto-screenshot' | 'video' | 'audio' | ... | 'historical-event';

// New optional field in BubbleNote
historicalSessionId?: string;  // References SavedSession.id when type === 'historical-event'
```

**No DB migration needed** — `updateSessionIncremental()` supports partial updates. Both fields are optional → backward-compatible.

---

## 2. Calendar Multi-Select Mode

**File:** `components/newcalendar/NewCalendarView.tsx`

### New state
```typescript
const [isSelectionMode, setIsSelectionMode] = useState(false);
const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
```

### Toolbar change
Add toggle button **"Seleziona"** (icon: `CheckSquare`) to the existing calendar toolbar. Activates selection mode.

### Event rendering in selection mode
- All events show a checkbox overlay (top-left corner)
- Events WITH `linkedSessionId`: checkable, normal opacity
- Events WITHOUT `linkedSessionId`: checkable, warning badge `⚠ Nessuna registrazione` — still selectable but action bar shows warning count

### Bottom action bar (fixed, glass-morphism)
Appears when ≥1 event selected, overlays calendar bottom:
```
[🔗 3 sessioni selezionate (1 senza registrazione)]  [Annulla]  [Correla alla sessione corrente ▶]
```

On confirm:
1. Filter `selectedEventIds` to those with `linkedSessionId`
2. Call `db.updateSessionIncremental(currentSessionId, { correlatedSessionIds: linkedIds })`
3. Exit selection mode, refresh correlation bubbles

---

## 3. Historical Event Bubbles

**No dedicated panel.** Correlated sessions surface as special BubbleNotes in the existing timeline.

### Construction (runtime, not persisted)
`NewHome.tsx` loads correlated sessions from DB when session loads:
```typescript
const correlatedSessions = await Promise.all(
  (sessionData.correlatedSessionIds ?? []).map(id => db.getSessionById(id))
);
```

Converts to synthetic `BubbleNote[]` with `type: 'historical-event'`:
```typescript
{
  id: `historical-${session.id}`,
  type: 'historical-event',
  contentHtml: `<b>${session.title}</b> — ${formatDate(session.audioRecordingStartTime)}`,
  timestamp: session.audioRecordingStartTime.toISOString(),
  historicalSessionId: session.id,
  // ...other BubbleNote required fields with sensible defaults
}
```

These synthetic notes are merged with real `bubbleNotes[]` → sorted by `timestamp` → displayed chronologically.

### Visual design

**Icon:** Custom SVG component `HistoricalEventIcon` — open book with clock face overlay + backward arrow (matching provided reference image, outline style).

**Card style:**
- Border: `amber-500` / sepia tone to visually distinguish from present-day notes
- Background: `amber-50` (light) / `amber-950` (dark mode)
- Label chip: `📅 Evento Storico`
- Content: session title, date (absolute), duration, 2-line preview of LLM analysis
- Read-only — no edit button, no timestamp edit
- **X button**: removes from `correlatedSessionIds` and removes synthetic note
- **Expand button**: opens modal with full transcript + analysis of historical session

**BubbleNotes.tsx changes:**
- Add rendering branch for `type === 'historical-event'`
- Render `HistoricalEventIcon` instead of camera/mic/note icons
- Apply amber styling
- Pass `onRemoveHistoricalSession` callback for X button

---

## 4. AI Context Injection

### New util: `utils/correlationContext.ts`

```typescript
export function buildCorrelatedSessionsContext(sessions: SavedSessionData[]): string {
  if (!sessions.length) return '';
  
  const header = `\n\n---\n[CONTESTO STORICO - SESSIONI CORRELATE]\n` +
    `Le sessioni seguenti sono PASSATE. Usale per contestualizzare, NON confonderle con la sessione attuale.\n\n`;
  
  const blocks = sessions.map((s, i) => {
    const date = s.audioRecordingStartTime?.toLocaleString('it-IT') ?? 'data sconosciuta';
    const duration = s.audioDuration ? formatTime(s.audioDuration) : 'N/A';
    return [
      `=== Sessione ${i+1}: "${s.audioFileName}" | ${date} | Durata: ${duration} ===`,
      `TRASCRIZIONE:\n${htmlToPlainText(s.transcribedText)}`,
      s.llmProcessedText ? `ANALISI AI:\n${htmlToPlainText(s.llmProcessedText)}` : '',
      s.bubbleNotes?.length ? `NOTE:\n${bubbleNotesToText(s.bubbleNotes)}` : '',
    ].filter(Boolean).join('\n\n');
  });
  
  return header + blocks.join('\n\n---\n\n') + '\n---\n';
}
```

### Toggle UI

In the session header area (near AI Analysis / Chat controls), add a small switch:
```
[🕰 Usa contesto storico]  ●○
```

State stored in `SavedSessionData.useHistoricalContext` (default: `true`).  
Persisted via `updateSessionIncremental`.

### `MeetingChatPanel.tsx`

New prop: `correlatedSessionsData?: SavedSessionData[]`  
New prop: `useHistoricalContext?: boolean`

In `buildSystemPrompt()`:
```typescript
if (useHistoricalContext && correlatedSessionsData?.length) {
  systemPrompt += buildCorrelatedSessionsContext(correlatedSessionsData);
}
```

### `LlmProcessor.tsx`

New prop: `correlatedSessionsData?: SavedSessionData[]`  
New prop: `useHistoricalContext?: boolean`

In `executeAnalysis()`, prepend to `contextualInfo`:
```typescript
if (useHistoricalContext && correlatedSessionsData?.length) {
  contextualInfo = buildCorrelatedSessionsContext(correlatedSessionsData) + '\n\n' + contextualInfo;
}
```

### `NewHome.tsx`

- Load `correlatedSessionsData` after `handleLoadSession()`
- Pass to both `MeetingChatPanel` and `LlmProcessor`
- Handle `useHistoricalContext` toggle → `updateSessionIncremental`

---

## 5. Component Map

| New/Modified | File | Change |
|---|---|---|
| Modified | `types.ts` | Add `correlatedSessionIds`, `useHistoricalContext` to `SavedSessionData`; `'historical-event'` + `historicalSessionId` to `BubbleNote` |
| Modified | `components/newcalendar/NewCalendarView.tsx` | Selection mode, checkboxes, action bar |
| Modified | `components/BubbleNotes.tsx` | Render branch for `historical-event`, amber styling, `HistoricalEventIcon` |
| New | `components/HistoricalEventIcon.tsx` | SVG icon: open book + clock + backward arrow |
| New | `utils/correlationContext.ts` | `buildCorrelatedSessionsContext()` util |
| Modified | `components/MeetingChatPanel.tsx` | New props, inject historical context in `buildSystemPrompt()` |
| Modified | `components/LlmProcessor.tsx` | New props, inject historical context in `executeAnalysis()` |
| Modified | `pages/NewHome.tsx` | Load correlated sessions, pass to children, handle toggle |

---

## 6. Verification

1. **Calendar selection**: Open calendar → click "Seleziona" → checkboxes appear → select 2 events (1 with session, 1 without) → action bar shows warning → confirm → session reloads
2. **Historical bubbles**: After correlation, BubbleNotes timeline shows historical event cards with amber styling and book+clock icon, sorted before current-session notes
3. **Remove correlation**: Click X on historical bubble → disappears from timeline, `correlatedSessionIds` updated in DB
4. **Chat context**: Open chat → toggle "Usa contesto storico" ON → send message → verify system prompt includes `[CONTESTO STORICO]` block
5. **AI analysis**: Run AI analysis → result references historical context without confusing it with current transcript
6. **Toggle OFF**: Disable toggle → AI calls proceed without historical block
7. **Type check**: `npm run lint` passes with no errors
