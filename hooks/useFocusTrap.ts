import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
  'input:not([disabled])', 'select:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Accessibilità per i dialog: quando `active` è true, intrappola il focus dentro
 * l'elemento referenziato (Tab/Shift+Tab ciclano), sposta il focus sul primo
 * elemento focusabile all'apertura, chiama `onEscape` alla pressione di Esc e
 * ripristina il focus all'elemento precedente alla chiusura.
 *
 * @param active Se il trap è attivo (tipicamente `isOpen` del modale).
 * @param onEscape Callback invocato su Escape (di solito `onClose`).
 * @returns ref da applicare al contenitore del dialog.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  active: boolean,
  onEscape?: () => void,
) {
  const containerRef = useRef<T>(null);
  // Ref keeps onEscape stable so the main effect only depends on `active`.
  // Without this, every new inline arrow passed as onEscape would re-run the
  // effect and call first.focus(), stealing focus from whatever the user typed.
  const onEscapeRef = useRef(onEscape);
  useEffect(() => { onEscapeRef.current = onEscape; });

  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true');

    // Focus the first focusable element (or the container itself) on open.
    const first = focusables()[0];
    (first ?? container).focus?.();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      const activeEl = document.activeElement;
      if (e.shiftKey && activeEl === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active]); // onEscape read via ref — no focus-steal on parent re-renders

  return containerRef;
}
