import DOMPurify from 'dompurify';

/**
 * Sanitizza HTML proveniente da contenuto non fidato (output LLM, trascrizioni,
 * file/documenti caricati) prima di iniettarlo nel DOM via dangerouslySetInnerHTML
 * o innerHTML. Rimuove script, handler inline (onerror/onclick), iframe, ecc.,
 * mantenendo i tag di formattazione usati dall'app (h1-h6, p, br, hr, liste,
 * tabelle, strong/em, code, span con class Tailwind).
 */
export const sanitizeHtml = (dirty: string): string => DOMPurify.sanitize(dirty);

/**
 * Escape dei caratteri HTML per interpolare testo non fidato (es. nomi file)
 * dentro template/stringhe HTML senza rischio di injection.
 */
export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
