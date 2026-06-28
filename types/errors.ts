export type AppErrorKind =
  | 'network'
  | 'quota'
  | 'timeout'
  | 'abort'
  | 'permission'
  | 'unknown';

export interface AppError {
  kind: AppErrorKind;
  message: string;
  /** Raw cause, for logging */
  cause?: unknown;
  /** Whether a retry makes sense */
  retryable: boolean;
}

/** Classifica un'eccezione generica in AppError. */
export function classifyError(err: unknown): AppError {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.message === 'Aborted') {
      return { kind: 'abort', message: 'Operazione annullata.', cause: err, retryable: false };
    }
    if (err.name === 'TimeoutError' || err.message.toLowerCase().includes('timed out')) {
      return { kind: 'timeout', message: 'Timeout della richiesta API.', cause: err, retryable: true };
    }
    const msg = err.message.toLowerCase();
    if (msg.includes('quota') || msg.includes('429') || msg.includes('resource_exhausted')) {
      return { kind: 'quota', message: 'Quota API esaurita. Riprova tra qualche minuto.', cause: err, retryable: true };
    }
    if (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network') ||
      msg.includes('load failed')
    ) {
      return { kind: 'network', message: 'Errore di rete. Verifica la connessione.', cause: err, retryable: true };
    }
    if (msg.includes('permission') || msg.includes('notallowederror')) {
      return { kind: 'permission', message: 'Permesso negato (microfono/schermo).', cause: err, retryable: false };
    }
    return { kind: 'unknown', message: err.message, cause: err, retryable: false };
  }
  return { kind: 'unknown', message: String(err), cause: err, retryable: false };
}

/** Converte una stringa "Error: …" restituita da geminiService in AppError. */
export function classifyServiceErrorString(text: string): AppError | null {
  if (!text.startsWith('Error:')) return null;
  const body = text.slice(7).toLowerCase();
  if (body.includes('quota') || body.includes('429')) {
    return { kind: 'quota', message: text, retryable: true };
  }
  if (body.includes('timed out') || body.includes('timeout')) {
    return { kind: 'timeout', message: text, retryable: true };
  }
  if (body.includes('circuit breaker')) {
    return { kind: 'quota', message: text, retryable: true };
  }
  return { kind: 'unknown', message: text, retryable: false };
}
