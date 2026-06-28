# IndexedDB Schema — `AudioAIAssistantDB`

Riferimento per la persistenza client-side. Tutto sta nel browser (no backend).
Implementazione: [`utils/db.ts`](../utils/db.ts) via la libreria [`idb`](https://github.com/jakearchibald/idb).

- **DB name:** `AudioAIAssistantDB`
- **Versione corrente:** `8` (`DB_VERSION` in `utils/db.ts`)
- **Upgrade:** funzione `upgrade()` idempotente — crea gli store/indici mancanti ad ogni bump di versione (incl. migrazione retroattiva dell'indice `by-timestamp` su `sessions`).

## Object stores

| Store | keyPath | Indici | Valore | Scopo |
|-------|---------|--------|--------|-------|
| `sessions` | `id` | `by-timestamp` → `timestamp` | `SavedSession` | Registrazioni salvate (audio blob/chunks, trascrizione, output LLM, note, chat). Retention `MAX_SESSIONS`. |
| `inProgressSessions` | `id` | — | `InProgressSessionData` | Stato sessione in corso, per recovery dopo crash/reload. |
| `appSecrets` | `id` | — | `SecretRecord` (`EncryptedBlob` + `id`) | API key Google cifrata (record unico `googleApiKey`). |
| `meetingNotifications` | `id` | `by-expiresAt` → `expiresAt` | `MeetingNotificationRecord` | Notifiche meeting con dedup cross-tab + history 1 giorno. `id` = `${apptId}::${YYYY-MM-DD}`. |
| `calendarEvents` | `id` | `by-start` → `start`, `by-session` → `linkedSessionId` | `CalendarEventRecord` | Eventi calendario sincronizzati, link bidirezionale a sessione. |
| `sessionEmbeddings` | `sessionId` | — | `SessionEmbedding` | Vettori embedding per ricerca semantica. |

## Retention / cleanup

- **`sessions`:** `cleanupOldSessions()` (chiamata da `saveSession`) tiene le `MAX_SESSIONS` più recenti per `timestamp`; elimina le più vecchie.
  - Limiti: `MAX_SESSIONS = 15`, `MAX_SESSION_SIZE_MB = 50` (`constants/appConfig.ts`).
- **`meetingNotifications`:** `pruneExpiredMeetingNotifications()` elimina dove `expiresAt <= now` (default `generatedAt + 24h`).
- **`calendarEvents`:** `deleteStaleCalendarEvents()` — senza sessione collegata: 24h dopo fine evento; con sessione collegata: solo se la sessione non esiste più **e** 10 giorni dopo fine.
- **Retention manuale (Settings → Storage):** `deleteAudioOlderThan(days)` (svuota solo audio), `deleteSessionsOlderThan(days)` (elimina record).

## Note di concorrenza

- `tryClaimMeetingNotification()`: insert-if-absent atomico (tx `readwrite` + `get`/`add`) per evitare che più tab generino lo stesso summary LLM.
- `linkSessionToEvent()`/`unlinkSessionFromEvent()`: aggiornano **entrambi** i record (evento + sessione) per mantenere il link coerente.
- `upsertCalendarEvents()`: preserva `linkedSessionId` esistente — la sync non deve rompere i link.

## Error handling

Ogni metodo è avvolto in `dbOp(label, fn)`: logga i fallimenti (quota exceeded, DB corrotto, upgrade bloccato) via `loggingService.error('DB_ERROR', …)` e **ri-lancia** per propagare alla UI. Nessun fallimento silenzioso.

## Limite noto

`updateSessionIncremental()` riscrive l'intero record sessione (inclusi i blob audio) ad ogni `put` — IndexedDB non supporta update parziale. Evitarlo richiederebbe uno store audio separato (vedi Sezione B dell'assessment).
