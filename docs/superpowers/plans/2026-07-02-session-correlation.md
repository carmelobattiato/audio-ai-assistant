# Session Correlation System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select past calendar events to correlate with the current session, display those sessions as amber "Historical Event" bubbles in the BubbleNotes timeline, and inject their full content as a clearly-separated `[HISTORICAL CONTEXT]` block in AI analysis and chat.

**Architecture:** Three layers — (1) calendar multi-select in `NewCalendarView` saves `correlatedSessionIds[]` to the current session via `db.updateSessionIncremental`; (2) `NewHome.tsx` loads those sessions from IndexedDB after session load and builds synthetic `BubbleNote[]` with `type: 'historical-event'` that are merged into the live timeline; (3) both `MeetingChatPanel` and `LlmProcessor` receive the correlated sessions data and append a `[HISTORICAL CONTEXT]` block to their AI prompts, gated by a `useHistoricalContext` toggle.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, IndexedDB via `idb`, Google Gemini via `@google/genai`

## Global Constraints

- All GUI text (button labels, chips, placeholders, tooltips) must be in English
- No new DB schema migration needed — all new fields are optional and backward-compatible
- `npm run lint` (`tsc --noEmit`) must pass after each task
- Follow existing inline styling pattern (no new CSS files; use Tailwind + inline `style={}`)
- No new npm dependencies
- `type: 'historical-event'` BubbleNotes are synthetic (not persisted); constructed runtime from `correlatedSessionIds`

---

### Task 1: Data Layer — types.ts

**Files:**
- Modify: `types.ts:184-194` (BubbleNote interface)
- Modify: `types.ts:383-400` (SavedSessionData interface)

**Interfaces:**
- Produces: `BubbleNote.type` now accepts `'historical-event'`; `BubbleNote.historicalSessionId?: string`; `SavedSessionData.correlatedSessionIds?: string[]`; `SavedSessionData.useHistoricalContext?: boolean`

- [ ] **Step 1: Extend BubbleNote type**

In `types.ts` line 191, change:
```typescript
  type?: 'text' | 'screenshot' | 'auto-screenshot' | 'video' | 'audio';
  inlineDataParts?: Array<{ mimeType: string; data: string }>;
  documentMode?: DocumentProcessingMode;
```
to:
```typescript
  type?: 'text' | 'screenshot' | 'auto-screenshot' | 'video' | 'audio' | 'historical-event';
  historicalSessionId?: string;
  inlineDataParts?: Array<{ mimeType: string; data: string }>;
  documentMode?: DocumentProcessingMode;
```

- [ ] **Step 2: Extend SavedSessionData**

In `types.ts` after line 399 (`linkedCalendarEventSubject?: string;`), add:
```typescript
  correlatedSessionIds?: string[];
  useHistoricalContext?: boolean;
```

- [ ] **Step 3: Verify type-check**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add types.ts
git commit -m "feat(types): add historical-event bubble type and correlation fields to SavedSessionData"
```

---

### Task 2: Shared Util — bubbleNotesToText + correlationContext

**Files:**
- Modify: `utils/textUtils.ts` (export `bubbleNotesToText`)
- Create: `utils/correlationContext.ts`
- Modify: `components/MeetingChatPanel.tsx` (import from textUtils instead of local def)

**Interfaces:**
- Consumes: `BubbleNote[]`, `SavedSessionData[]` from Task 1
- Produces: `bubbleNotesToText(notes: BubbleNote[]): string` exported from `utils/textUtils.ts`; `buildCorrelatedSessionsContext(sessions: SavedSessionData[]): string` from `utils/correlationContext.ts`

- [ ] **Step 1: Export bubbleNotesToText from textUtils**

At the end of `utils/textUtils.ts`, add:
```typescript
export function bubbleNotesToText(notes: BubbleNote[]): string {
  return notes
    .filter(n => n.type !== 'historical-event')
    .map((n, i) => {
      const text = htmlToPlainText(n.contentHtml).trim();
      return text ? `Note ${i + 1} [${formatTime(n.recordingElapsedTime)}]: ${text}` : null;
    })
    .filter(Boolean)
    .join('\n\n');
}
```

Add the import at top of `utils/textUtils.ts`:
```typescript
import { BubbleNote } from '../types';
```

- [ ] **Step 2: Update MeetingChatPanel to import from textUtils**

In `components/MeetingChatPanel.tsx`:

1. Add `bubbleNotesToText` to the import from `../utils/textUtils`:
```typescript
import { htmlToPlainText, markdownToHtmlSimple, formatTime, bubbleNotesToText } from '../utils/textUtils';
```

2. Delete the local `bubbleNotesToText` function at lines 115–123 (the local definition).

- [ ] **Step 3: Create utils/correlationContext.ts**

```typescript
import { SavedSessionData } from '../types';
import { htmlToPlainText, formatTime, bubbleNotesToText } from './textUtils';

export function buildCorrelatedSessionsContext(sessions: SavedSessionData[]): string {
  if (!sessions.length) return '';

  const header =
    `\n\n---\n[HISTORICAL CONTEXT - CORRELATED SESSIONS]\n` +
    `The following sessions are PAST events. Use them for context ONLY. ` +
    `Do NOT confuse them with the current session.\n\n`;

  const blocks = sessions.map((s, i) => {
    const date = s.audioRecordingStartTime
      ? new Date(s.audioRecordingStartTime).toLocaleString('en-GB')
      : 'unknown date';
    const duration = s.audioDuration ? formatTime(s.audioDuration) : 'N/A';
    const lines: string[] = [
      `=== Session ${i + 1}: "${s.audioFileName}" | ${date} | Duration: ${duration} ===`,
      `TRANSCRIPT:\n${htmlToPlainText(s.transcribedText)}`,
    ];
    if (s.llmProcessedText) lines.push(`AI ANALYSIS:\n${htmlToPlainText(s.llmProcessedText)}`);
    if (s.bubbleNotes?.length) lines.push(`NOTES:\n${bubbleNotesToText(s.bubbleNotes)}`);
    return lines.join('\n\n');
  });

  return header + blocks.join('\n\n---\n\n') + '\n---\n';
}
```

- [ ] **Step 4: Verify type-check**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add utils/textUtils.ts utils/correlationContext.ts components/MeetingChatPanel.tsx
git commit -m "feat(utils): export bubbleNotesToText and add buildCorrelatedSessionsContext util"
```

---

### Task 3: HistoricalEventIcon + BubbleNotes rendering

**Files:**
- Create: `components/HistoricalEventIcon.tsx`
- Modify: `components/notes/NoteTimeline.tsx` (add render branch for `historical-event`)
- Modify: `components/BubbleNotes.tsx` (add `onRemoveHistoricalSession` prop)

**Interfaces:**
- Consumes: `BubbleNote` with `type === 'historical-event'` and `historicalSessionId` from Task 1
- Produces: `onRemoveHistoricalSession(sessionId: string): void` prop on `BubbleNotesProps`

- [ ] **Step 1: Create HistoricalEventIcon.tsx**

```tsx
import React from 'react';

interface HistoricalEventIconProps {
  className?: string;
}

export const HistoricalEventIcon: React.FC<HistoricalEventIconProps> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Open book */}
    <path d="M2 6.5C2 6.5 5 5 8 5c2 0 4 1 4 1s2-1 4-1c3 0 6 1.5 6 1.5V19s-3-1-6-1c-2 0-4 1-4 1s-2-1-4-1c-3 0-6 1-6 1V6.5z" />
    <path d="M12 6v14" />
    {/* Clock face */}
    <circle cx="7" cy="10" r="2.5" />
    <path d="M7 9v1.2l0.8 0.6" />
    {/* History arrow */}
    <path d="M5.5 13.5a4 4 0 0 0 2 1" />
    <path d="M5.5 13.5l-1 1.5" />
    <path d="M5.5 13.5l1.5.5" />
  </svg>
);
```

- [ ] **Step 2: Read NoteTimeline to understand current render structure**

Read `components/notes/NoteTimeline.tsx` to find where individual note cards are rendered before adding the historical-event branch.

- [ ] **Step 3: Add historical-event render branch to NoteTimeline**

In `components/notes/NoteTimeline.tsx`, locate where note items are rendered (the `.map()` that renders each `BubbleNote`).

Add a branch for `type === 'historical-event'` that renders an amber card:
```tsx
if (note.type === 'historical-event') {
  return (
    <div
      key={note.id}
      className="flex gap-2 items-start"
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5"
        style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#FCD34D' }}
      >
        <HistoricalEventIcon className="w-4 h-4" />
      </div>

      {/* Card */}
      <div
        className="flex-1 rounded-xl px-3 py-2 text-xs"
        style={{
          background: 'rgba(120,53,15,0.25)',
          border: '1px solid rgba(245,158,11,0.3)',
          color: '#FDE68A',
        }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
            style={{ background: 'rgba(245,158,11,0.2)', color: '#FCD34D' }}
          >
            📅 Historical Event
          </span>
          {onRemoveHistoricalSession && note.historicalSessionId && (
            <button
              onClick={() => onRemoveHistoricalSession(note.historicalSessionId!)}
              className="text-amber-500 hover:text-amber-300 transition-colors"
              title="Remove correlation"
              aria-label="Remove correlated session"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div
          className="text-amber-100 leading-snug"
          dangerouslySetInnerHTML={{ __html: note.contentHtml }}
        />
      </div>
    </div>
  );
}
```

Add the import at top of `NoteTimeline.tsx`:
```typescript
import { HistoricalEventIcon } from '../HistoricalEventIcon';
```

Also pass `onRemoveHistoricalSession` as a prop to `NoteTimeline`. Check the existing `NoteTimelineProps` interface and add:
```typescript
onRemoveHistoricalSession?: (sessionId: string) => void;
```

- [ ] **Step 4: Add onRemoveHistoricalSession prop to BubbleNotesProps**

In `components/BubbleNotes.tsx`, add to `BubbleNotesProps` interface:
```typescript
onRemoveHistoricalSession?: (sessionId: string) => void;
```

Pass it through to `NoteTimeline`:
```tsx
<NoteTimeline
  // ...existing props...
  onRemoveHistoricalSession={props.onRemoveHistoricalSession}
/>
```

- [ ] **Step 5: Verify type-check**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/HistoricalEventIcon.tsx components/notes/NoteTimeline.tsx components/BubbleNotes.tsx
git commit -m "feat(ui): add HistoricalEventIcon and historical-event render branch in BubbleNotes timeline"
```

---

### Task 4: Calendar Multi-Select Mode

**Files:**
- Modify: `components/newcalendar/NewCalendarView.tsx`

**Interfaces:**
- Consumes: existing `NewCalendarViewProps` — add `currentSessionId?: string` and `onCorrelateEvents?: (sessionIds: string[]) => void`
- Produces: calls `onCorrelateEvents(linkedSessionIds)` with the IDs of sessions linked to selected events

- [ ] **Step 1: Add new props to NewCalendarViewProps**

In `NewCalendarView.tsx`, add to the `NewCalendarViewProps` interface:
```typescript
currentSessionId?: string;
onCorrelateEvents?: (sessionIds: string[]) => void;
```

- [ ] **Step 2: Add selection state**

At the top of the `NewCalendarView` component function body, add:
```typescript
const [isSelectionMode, setIsSelectionMode] = useState(false);
const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

const toggleEventSelection = useCallback((eventId: string) => {
  setSelectedEventIds(prev =>
    prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
  );
}, []);

const exitSelectionMode = useCallback(() => {
  setIsSelectionMode(false);
  setSelectedEventIds([]);
}, []);
```

- [ ] **Step 3: Add "Select" toggle button to the toolbar**

In the top toolbar JSX (around line 364, in the `<div className="flex items-center justify-between gap-3 px-4 py-2.5 ...">` block), add a "Select" button before the right cluster. Place it between the navigation block and the right cluster:

```tsx
{/* Correlate select toggle — only when a session is active */}
{currentSessionId && onCorrelateEvents && (
  <button
    onClick={() => { setIsSelectionMode(v => !v); setSelectedEventIds([]); }}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
    style={isSelectionMode
      ? { background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.5)', color: '#FCD34D' }
      : { background: 'rgba(55,65,81,0.8)', border: '1px solid #374151', color: '#9CA3AF' }
    }
    title={isSelectionMode ? 'Cancel selection' : 'Select events to correlate'}
  >
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
    {isSelectionMode ? 'Cancel' : 'Select'}
  </button>
)}
```

- [ ] **Step 4: Pass isSelectionMode + toggleEventSelection to child views**

`NewCalMonthView`, `NewCalWeekView`, `NewCalWorkWeekView` each receive `onEventClick`. In selection mode, clicking an event should toggle selection instead. Add props to all three:

```typescript
// Add to each view's props
isSelectionMode?: boolean;
selectedEventIds?: string[];
onToggleEventSelection?: (eventId: string) => void;
```

In `NewCalendarView.tsx`, update all three view usages:
```tsx
<NewCalMonthView
  // ...existing props...
  isSelectionMode={isSelectionMode}
  selectedEventIds={selectedEventIds}
  onToggleEventSelection={toggleEventSelection}
/>
```
(same for `NewCalWeekView` and `NewCalWorkWeekView`)

In each view component, add the checkbox overlay when `isSelectionMode` is true:
- On each event element, add `onClick={isSelectionMode ? () => onToggleEventSelection?.(event.id) : () => onEventClick(event)}`
- When `isSelectionMode` is true, render a checkbox in the top-left corner of the event chip:
```tsx
{isSelectionMode && (
  <span
    className="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded flex items-center justify-center"
    style={selectedEventIds?.includes(event.id)
      ? { background: '#F59E0B', border: '1px solid #D97706' }
      : { background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245,158,11,0.4)' }
    }
  >
    {selectedEventIds?.includes(event.id) && (
      <svg className="w-2 h-2 text-black" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    )}
  </span>
)}
```

Events without `linkedSessionId` show a warning badge when selected:
```tsx
{isSelectionMode && selectedEventIds?.includes(event.id) && !event.linkedSessionId && (
  <span className="absolute top-0 right-0 text-[8px] bg-amber-900 text-amber-300 px-1 rounded">⚠ No recording</span>
)}
```

- [ ] **Step 5: Add bottom action bar**

Below the main calendar content area (just before the closing `</div>` of the component), add:

```tsx
{/* ── Correlate action bar ─────────────────────────────────────── */}
{isSelectionMode && selectedEventIds.length > 0 && (
  <div
    className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3"
    style={{
      borderTop: '1px solid rgba(245,158,11,0.3)',
      background: 'rgba(120,53,15,0.4)',
      backdropFilter: 'blur(8px)',
    }}
  >
    <span className="text-xs font-medium" style={{ color: '#FCD34D' }}>
      🔗 {selectedEventIds.length} event{selectedEventIds.length !== 1 ? 's' : ''} selected
      {(() => {
        const withoutSession = selectedEventIds.filter(id =>
          !events.find(e => e.id === id)?.linkedSessionId
        ).length;
        return withoutSession > 0
          ? ` (${withoutSession} without recording)`
          : '';
      })()}
    </span>
    <div className="flex gap-2">
      <button
        onClick={exitSelectionMode}
        className="px-3 py-1.5 text-xs rounded-lg transition-colors"
        style={{ background: 'rgba(55,65,81,0.8)', border: '1px solid #374151', color: '#9CA3AF' }}
      >
        Cancel
      </button>
      <button
        onClick={() => {
          const linkedIds = selectedEventIds
            .map(eid => events.find(e => e.id === eid)?.linkedSessionId)
            .filter((id): id is string => Boolean(id));
          onCorrelateEvents?.(linkedIds);
          exitSelectionMode();
        }}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all hover:scale-[1.02]"
        style={{ background: 'rgba(245,158,11,0.25)', border: '1px solid rgba(245,158,11,0.5)', color: '#FCD34D' }}
      >
        Correlate with current session ▶
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify type-check**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/newcalendar/
git commit -m "feat(calendar): add multi-select mode and correlate action bar"
```

---

### Task 5: NewHome.tsx — Wire Correlation State

**Files:**
- Modify: `pages/NewHome.tsx`

**Interfaces:**
- Consumes: `db.updateSessionIncremental`, `db.getSessionById`; `buildCorrelatedSessionsContext` from Task 2; `SavedSessionData` with `correlatedSessionIds` from Task 1
- Produces: `correlatedSessions: Array<{id:string; data:SavedSessionData}>` state; `useHistoricalContext: boolean` state; passes `correlatedSessions.map(s=>s.data)` to `LlmProcessor` and `MeetingChatPanel`

- [ ] **Step 1: Add state for correlated sessions**

In `NewHome.tsx`, add near the other session-related state declarations:
```typescript
// Each entry pairs the DB session ID with its loaded data so synthetic BubbleNotes can reference the correct ID
const [correlatedSessions, setCorrelatedSessions] = useState<Array<{ id: string; data: SavedSessionData }>>([]);
const [useHistoricalContext, setUseHistoricalContext] = useState(true);
```

- [ ] **Step 2: Load correlated sessions after handleLoadSession**

Inside `handleLoadSession` (around line 355), after setting all data from `data`, add:
```typescript
// Load correlated sessions for historical context
if (data.correlatedSessionIds?.length) {
  const loaded = await Promise.all(
    data.correlatedSessionIds.map(id => db.getSessionById(id))
  );
  setCorrelatedSessions(
    loaded
      .filter((s): s is SavedSession => Boolean(s))
      .map(s => ({ id: s.id, data: s.data }))
  );
} else {
  setCorrelatedSessions([]);
}
setUseHistoricalContext(data.useHistoricalContext ?? true);
```

- [ ] **Step 3: Add handleCorrelateEvents callback**

```typescript
const handleCorrelateEvents = useCallback(async (sessionIds: string[]) => {
  if (!activeSessionIdRef.current) return;
  await db.updateSessionIncremental(activeSessionIdRef.current, { correlatedSessionIds: sessionIds });
  const loaded = await Promise.all(sessionIds.map(id => db.getSessionById(id)));
  setCorrelatedSessions(
    loaded
      .filter((s): s is SavedSession => Boolean(s))
      .map(s => ({ id: s.id, data: s.data }))
  );
  setAppUserMessage(`${sessionIds.length} session${sessionIds.length !== 1 ? 's' : ''} correlated.`);
}, []);
```

- [ ] **Step 4: Add handleToggleHistoricalContext callback**

```typescript
const handleToggleHistoricalContext = useCallback(async (enabled: boolean) => {
  setUseHistoricalContext(enabled);
  if (activeSessionIdRef.current) {
    await db.updateSessionIncremental(activeSessionIdRef.current, { useHistoricalContext: enabled });
  }
}, []);
```

- [ ] **Step 5: Build synthetic historical BubbleNotes and merge into bubbleNotes**

This is the key step that makes historical sessions appear in the BubbleNotes timeline.

Add a memoized derivation of the combined notes array:
```typescript
const allBubbleNotes = useMemo((): BubbleNote[] => {
  const historicalNotes: BubbleNote[] = correlatedSessions.map(({ id, data: s }) => ({
    id: `historical-${id}`,
    type: 'historical-event' as const,
    historicalSessionId: id,
    contentHtml: `<b>${s.audioFileName}</b><br/><span style="opacity:0.7">${
      s.audioRecordingStartTime
        ? new Date(s.audioRecordingStartTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Unknown date'
    } · ${s.audioDuration ? formatTime(s.audioDuration) : 'N/A'}</span>${
      s.llmProcessedText
        ? `<br/><span style="opacity:0.6;font-size:0.85em">${htmlToPlainText(s.llmProcessedText).slice(0, 120)}…</span>`
        : ''
    }`,
    timestamp: s.audioRecordingStartTime
      ? new Date(s.audioRecordingStartTime).getTime()
      : 0,
    recordingElapsedTime: 0,
    isEditing: false,
    isProcessing: false,
  }));

  return [...historicalNotes, ...bubbleNotes].sort((a, b) => {
    const ta = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
    const tb = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
    return ta - tb;
  });
}, [correlatedSessions, bubbleNotes]);
```

Add imports at the top if not present:
```typescript
import { htmlToPlainText, formatTime } from '../utils/textUtils';
```

- [ ] **Step 6: Add handleRemoveHistoricalSession callback**

```typescript
const handleRemoveHistoricalSession = useCallback(async (sessionId: string) => {
  if (!activeSessionIdRef.current) return;
  const updated = correlatedSessions
    .filter(s => s.id !== sessionId)
    .map(s => s.id);
  await db.updateSessionIncremental(activeSessionIdRef.current, { correlatedSessionIds: updated });
  setCorrelatedSessions(prev => prev.filter(s => s.id !== sessionId));
}, [correlatedSessions]);
```

- [ ] **Step 7: Pass allBubbleNotes to BubbleNotes component and onRemoveHistoricalSession**

Find where `BubbleNotes` is rendered and update:
```tsx
<BubbleNotes
  // ...existing props...
  bubbleNotes={allBubbleNotes}          // was: bubbleNotes
  onRemoveHistoricalSession={handleRemoveHistoricalSession}
/>
```

Note: `onBubbleNotesChange` must still only update the real `bubbleNotes` state (not the merged array), so keep `onBubbleNotesChange={setBubbleNotes}` as is.

- [ ] **Step 8: Wire NewCalendarView**

In the `<NewCalendarView ...>` JSX (around line 1119), add:
```tsx
currentSessionId={activeSessionIdRef.current ?? undefined}
onCorrelateEvents={handleCorrelateEvents}
```

- [ ] **Step 9: Add "Use historical context" toggle near AI tab controls**

Find a suitable location near the LlmProcessor or the tabs header. Add a small toggle:
```tsx
{correlatedSessions.length > 0 && (
  <div className="flex items-center gap-2 px-3 py-1" style={{ borderBottom: '1px solid #374151' }}>
    <span className="text-[11px] text-gray-400">🕰 Use historical context</span>
    <button
      onClick={() => handleToggleHistoricalContext(!useHistoricalContext)}
      className="relative inline-flex h-4 w-7 rounded-full transition-colors flex-shrink-0"
      style={{ background: useHistoricalContext ? '#8B5CF6' : '#374151' }}
      aria-label="Toggle historical context"
      title={useHistoricalContext ? 'Historical context enabled' : 'Historical context disabled'}
    >
      <span
        className="inline-block w-3 h-3 rounded-full bg-white shadow transition-transform mt-0.5"
        style={{ transform: useHistoricalContext ? 'translateX(14px)' : 'translateX(2px)' }}
      />
    </button>
    <span className="text-[11px]" style={{ color: '#6B7280' }}>
      {correlatedSessions.length} correlated session{correlatedSessions.length !== 1 ? 's' : ''}
    </span>
  </div>
)}
```

- [ ] **Step 10: Verify type-check**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add pages/NewHome.tsx
git commit -m "feat(home): wire correlation state, synthetic historical bubbles, and calendar integration"
```

---

### Task 6: AI Context Injection — MeetingChatPanel + LlmProcessor

**Files:**
- Modify: `components/MeetingChatPanel.tsx`
- Modify: `components/LlmProcessor.tsx`

**Interfaces:**
- Consumes: `buildCorrelatedSessionsContext` from Task 2; `SavedSessionData[]` from Task 5 via new props
- Produces: system prompts and contextual info blocks contain `[HISTORICAL CONTEXT]` section when toggle is on

- [ ] **Step 1: Add props to MeetingChatPanel**

In `MeetingChatPanelProps` interface (find the `interface MeetingChatPanelProps` definition), add:
```typescript
correlatedSessionsData?: SavedSessionData[];  // pass as: correlatedSessions.map(s => s.data)
useHistoricalContext?: boolean;
```

Add imports:
```typescript
import { MeetingChatMessage, AppSettings, LlmUsageStats, BubbleNote, CustomInstruction, SavedSessionData } from '../types';
import { buildCorrelatedSessionsContext } from '../utils/correlationContext';
```

- [ ] **Step 2: Inject historical context in buildSystemPrompt**

In `buildSystemPrompt()` (line 215), after the closing template literal that builds the current system prompt, append:
```typescript
const buildSystemPrompt = useCallback((): string => {
  // ...existing code unchanged...
  let prompt = `${baseInstructions}${rulesSection}

MEETING METADATA:
- Title: ${sessionTitle}
- Date: ${dateStr}
- Duration: ${durationStr}

FULL TRANSCRIPT:
${plainTranscript || '(no transcript available)'}

${plainAnalysis ? `AI ANALYSIS:\n${plainAnalysis}` : ''}

${notesText ? `BUBBLE NOTES (timestamped notes taken during the session):\n${notesText}` : ''}`;

  if (useHistoricalContext && correlatedSessionsData?.length) {
    prompt += buildCorrelatedSessionsContext(correlatedSessionsData);
  }

  return prompt;
}, [sessionContext, chatSystemInstruction, customInstructions, correlatedSessionsData, useHistoricalContext]);
```

Note: the existing `return` statement becomes `let prompt = ...` with the historical block appended conditionally.

- [ ] **Step 3: Pass new props from NewHome.tsx to MeetingChatPanel**

In `NewHome.tsx`, update the `<MeetingChatPanel ...>` JSX:
```tsx
<MeetingChatPanel
  // ...existing props...
  correlatedSessionsData={correlatedSessions.map(s => s.data)}
  useHistoricalContext={useHistoricalContext}
/>
```

- [ ] **Step 4: Add props to LlmProcessor**

In `LlmProcessorProps` interface, add:
```typescript
correlatedSessionsData?: SavedSessionData[];  // pass as: correlatedSessions.map(s => s.data)
useHistoricalContext?: boolean;
```

Add imports:
```typescript
import { AppSettings, CustomInstruction, SystemPrompt, GroundingChunk, SupportedLanguage, TranscriptionOutputFormat, BubbleNote, SavedSessionData } from '../types';
import { buildCorrelatedSessionsContext } from '../utils/correlationContext';
```

- [ ] **Step 5: Inject historical context in executeAnalysis**

In `executeAnalysis()` (line 193), after:
```typescript
let contextualInfo = `Informazioni di contesto:\n- Lingua: ${transcriptionLanguage}\n`;
if (audioDuration) contextualInfo += `- Durata audio: ${formatTime(audioDuration)}\n`;
if (audioRecordingStartTime) contextualInfo += `- Data: ${audioRecordingStartTime.toLocaleString()}\n`;
contextualInfo += "---\n\n";
```

Add:
```typescript
if (useHistoricalContext && correlatedSessionsData?.length) {
  contextualInfo = buildCorrelatedSessionsContext(correlatedSessionsData) + '\n\n' + contextualInfo;
}
```

- [ ] **Step 6: Pass new props from NewHome.tsx to LlmProcessor**

In `NewHome.tsx`, update the `<LlmProcessor ...>` JSX:
```tsx
<LlmProcessor
  // ...existing props...
  correlatedSessionsData={correlatedSessions.map(s => s.data)}
  useHistoricalContext={useHistoricalContext}
/>
```

- [ ] **Step 7: Final type-check**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add components/MeetingChatPanel.tsx components/LlmProcessor.tsx pages/NewHome.tsx
git commit -m "feat(ai): inject historical context into chat and AI analysis prompts"
```

---

## Verification Checklist

Run through these manually after all tasks complete:

1. **Calendar selection mode**: Open calendar → "Select" button appears in toolbar (only when session is active) → click it → event checkboxes appear → select 2 events (one with linked session, one without) → action bar shows `"2 events selected (1 without recording)"` → click "Correlate with current session" → bar closes → DB updated
2. **Historical bubbles appear**: After correlation, BubbleNotes timeline shows amber cards with book+clock icon, sorted chronologically before current-session notes
3. **Bubble content**: Card shows title, date, duration and 120-char analysis preview
4. **Remove correlation**: Click X on historical bubble → bubble disappears, `correlatedSessionIds` updated in DB
5. **Historical context toggle**: `"🕰 Use historical context"` toggle appears (only when ≥1 correlated session) → toggle OFF → send chat message → system prompt must NOT contain `[HISTORICAL CONTEXT]` block
6. **Toggle ON**: Turn toggle back ON → run AI analysis → result should reference past session info without confusing it with current transcript
7. **Reload persistence**: Reload page, load same session → correlated sessions still shown, toggle state restored
8. **Type check**: `npm run lint` passes with no errors
9. **Zero regression**: BubbleNotes with `type !== 'historical-event'` behave identically to before
