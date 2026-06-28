import { useState, useCallback } from 'react';
import { AppError, classifyError } from '../types/errors';

/**
 * Gestisce errori async tipizzati. Espone `handleAsync` che esegue una fn,
 * classifica eccezioni in AppError e salva lo stato per retry/dismiss.
 *
 * @example
 * const { error, retry, dismiss, handleAsync } = useErrorHandler();
 * await handleAsync(() => transcribe(blob));
 */
export function useErrorHandler() {
  const [error, setError] = useState<AppError | null>(null);
  const [retryFn, setRetryFn] = useState<(() => void) | null>(null);

  const dismiss = useCallback(() => {
    setError(null);
    setRetryFn(null);
  }, []);

  const handleAsync = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      const result = await fn();
      setError(null);
      return result;
    } catch (err) {
      const appError = classifyError(err);
      if (appError.kind === 'abort') return null;
      setError(appError);
      if (appError.retryable) {
        setRetryFn(() => () => { void handleAsync(fn); });
      }
      return null;
    }
  }, []);

  return {
    error,
    retry: retryFn,
    dismiss,
    handleAsync,
    /** Imposta manualmente un AppError (utile quando l'errore viene da una stringa di servizio) */
    setError,
  };
}
