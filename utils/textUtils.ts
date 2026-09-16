
// utils/textUtils.ts
import { Part } from "@google/genai";
import { BubbleNote } from '../types';

/**
 * Counts the number of words in a given string.
 */
export const countWords = (text: string): number => {
  if (!text || text.trim() === "") return 0;
  return text.trim().split(/\s+/).length;
};

export const countCharacters = (text: string): number => {
  return text.length;
};

export const estimateTokens = (text: string): number => {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};

export const formatTime = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');
  if (hours > 0) {
    const paddedHours = String(hours).padStart(2, '0');
    return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${paddedMinutes}:${paddedSeconds}`;
};

export const getCurrentTimestampSuffix = (): string => {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = String(now.getFullYear()).slice(-2);
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${d}${m}${y}_${h}${min}`;
};

// ── LaTeX → HTML renderer (no external dependencies) ─────────────────────

function renderLatexExpr(expr: string): string {
  let s = expr;

  // \text{...} → literal content
  s = s.replace(/\\text\{([^}]*)\}/g, '$1');

  // \frac{N}{D} — 3 passes for up to 3 levels of nesting
  const fracPass = (str: string) =>
    str.replace(/\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\{((?:[^{}]|\{[^{}]*\})*)\}/g,
      '<span class="math-frac"><span class="math-num">$1</span><span class="math-den">$2</span></span>');
  s = fracPass(fracPass(fracPass(s)));

  // \sqrt{...}
  s = s.replace(/\\sqrt\{([^}]*)\}/g, '√($1)');

  // Superscripts/subscripts with braces
  s = s.replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>');
  s = s.replace(/_\{([^}]*)\}/g, '<sub>$1</sub>');

  // LaTeX commands → Unicode
  const cmdMap: Record<string, string> = {
    times: '×', ge: '≥', geq: '≥', le: '≤', leq: '≤', ne: '≠', neq: '≠',
    approx: '≈', cdot: '·', pm: '±', mp: '∓', infty: '∞',
    sum: '∑', int: '∫', prod: '∏', oint: '∮',
    to: '→', leftarrow: '←', rightarrow: '→', Rightarrow: '⇒', Leftarrow: '⇐',
    in: '∈', notin: '∉', subset: '⊂', supset: '⊃', cup: '∪', cap: '∩',
    partial: '∂', nabla: '∇', perp: '⊥',
    ldots: '…', cdots: '⋯', vdots: '⋮',
    circ: '°', degree: '°', '%': '%',
    forall: '∀', exists: '∃', emptyset: '∅', varnothing: '∅',
    // Greek lowercase
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
    zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ',
    lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
    rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
    phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    // Greek uppercase
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ',
    Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  };
  s = s.replace(/\\([a-zA-Z%]+)/g, (_, name) => cmdMap[name] ?? '');

  // Superscripts/subscripts without braces (single char/digit)
  s = s.replace(/\^([a-zA-Z0-9])/g, '<sup>$1</sup>');
  s = s.replace(/_([a-zA-Z0-9])/g, '<sub>$1</sub>');

  // Strip remaining LaTeX grouping braces
  s = s.replace(/[{}]/g, '');

  return s;
}

/**
 * Pre-processes LaTeX math ($...$, $$...$$) in markdown text, renders it to
 * HTML spans, then passes the result through markdownToHtmlSimple.
 * Replaces math with unique placeholders so the markdown renderer doesn't
 * mangle the formulas, then restores them after.
 */
export function renderLatexInMarkdown(text: string): string {
  if (!text) return '';
  const placeholders = new Map<string, string>();
  let idx = 0;

  // Block math $$...$$
  let processed = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    const key = `\x00MB${idx++}\x00`;
    placeholders.set(key, `<span class="math-block">${renderLatexExpr(expr.trim())}</span>`);
    return key;
  });

  // Inline math $...$  — require \, ^ or _ to distinguish from currency
  processed = processed.replace(/\$([^$\n]{1,400}?)\$/g, (match, expr) => {
    if (!/[\\^_]/.test(expr)) return match;
    const key = `\x00MI${idx++}\x00`;
    placeholders.set(key, `<span class="math-inline">${renderLatexExpr(expr.trim())}</span>`);
    return key;
  });

  let html = markdownToHtmlSimple(processed);

  placeholders.forEach((rendered, key) => {
    html = html.replaceAll(key, rendered);
  });
  return html;
}

/**
 * Robustly converts Markdown to HTML supporting nested lists and tables.
 */
export function markdownToHtmlSimple(markdownText: string): string {
  if (!markdownText || typeof markdownText !== 'string') return '';

  let lines = markdownText.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let listStack: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  const closeLists = () => {
    while (listStack.length > 0) {
      html += `</${listStack.pop()}>`;
    }
  };

  const flushTable = () => {
    if (!inTable) return;
    if (tableRows.length > 0) {
      html += '<div class="overflow-x-auto my-4"><table>';
      let hasHeader = false;
      tableRows.forEach((row, idx) => {
        if (row.match(/^\s*\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)*\|?\s*$/)) {
          hasHeader = true;
          return;
        }
        const cells = row.split('|').filter((c, i, a) => {
            if (i === 0 && c.trim() === '') return false;
            if (i === a.length - 1 && c.trim() === '') return false;
            return true;
        });
        const tag = (idx === 0 && tableRows.length > 1) || (!hasHeader && idx === 0) ? 'th' : 'td';
        html += `<tr>${cells.map(c => `<${tag}>${markdownToHtmlInline(c.trim())}</${tag}>`).join('')}</tr>`;
      });
      html += '</table></div>';
    }
    tableRows = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    // Table detection
    if (trimmed.startsWith('|') || (trimmed.includes('|') && lines[i+1]?.trim().startsWith('|--'))) {
      if (!inTable) {
        closeLists();
        inTable = true;
      }
      tableRows.push(trimmed);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // List detection
    const listMatch = line.match(/^(\s*)([\*\-\+]|\d+\.)\s+(.*)/);
    if (listMatch) {
      const indent = (listMatch[1] ?? '').length;
      const type = (listMatch[2] ?? '').match(/\d/) ? 'ol' : 'ul';
      const content = listMatch[3] ?? '';
      const level = Math.floor(indent / 2);

      while (listStack.length > level + 1) {
        html += `</${listStack.pop()}>`;
      }
      if (listStack.length <= level) {
        html += `<${type}>`;
        listStack.push(type);
      }

      html += `<li>${markdownToHtmlInline(content)}</li>`;
      continue;
    } else {
      closeLists();
    }

    if (trimmed.startsWith('#')) {
      const hMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
      if (hMatch) {
        const level = (hMatch[1] ?? '').length;
        html += `<h${level}>${markdownToHtmlInline(hMatch[2] ?? '')}</h${level}>`;
        continue;
      }
    }

    if (trimmed === '---') {
      html += '<hr class="my-4 border-gray-600">';
      continue;
    }

    if (trimmed.length > 0) {
      html += `<p>${markdownToHtmlInline(trimmed)}</p>`;
    }
  }

  closeLists();
  flushTable();
  return html;
}

function markdownToHtmlInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

export function htmlToPlainText(html: string): string {
  if (!html) return "";
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  tempDiv.querySelectorAll('hr').forEach(hr => {
    hr.replaceWith(document.createTextNode('\n\n---\n\n'));
  });
  tempDiv.querySelectorAll('br').forEach(br => {
    br.replaceWith(document.createTextNode('\n'));
  });
  tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
    const text = h.textContent?.trim() ?? '';
    h.replaceWith(document.createTextNode(`\n\n${text}\n`));
  });
  tempDiv.querySelectorAll('p').forEach(p => {
    p.innerHTML = `\n${p.innerHTML}\n`;
  });
  tempDiv.querySelectorAll('li').forEach(li => {
    const parent = li.parentElement;
    const isOrdered = parent?.tagName === 'OL';
    const prefix = isOrdered ? '  • ' : '  - ';
    li.innerHTML = `${prefix}${li.innerHTML}\n`;
  });
  tempDiv.querySelectorAll('tr').forEach(tr => {
    tr.innerHTML = `\n| ${Array.from(tr.querySelectorAll('td, th')).map(c => c.textContent?.trim()).join(' | ')} |`;
  });

  const raw = tempDiv.textContent || tempDiv.innerText || "";
  return raw.replace(/\n{3,}/g, '\n\n').trim();
}

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

export const parseHtmlForGeminiParts = (htmlString: string): Part[] => {
  if (!htmlString) return [];
  const parts: Part[] = [];
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlString;

  function processNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        const lastPart = parts[parts.length - 1];
        if (lastPart && 'text' in lastPart) {
          lastPart.text += ` ${text}`;
        } else {
          parts.push({ text });
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName.toLowerCase() === 'img') {
        const src = el.getAttribute('src');
        if (src?.startsWith('data:image/')) {
          const [header, data] = src.split(',');
          const mimeType = header?.match(/:(.*?);/)?.[1] || 'image/png';
          parts.push({ inlineData: { mimeType, data } });
        }
      } else {
        el.childNodes.forEach(processNode);
      }
    }
  }
  tempDiv.childNodes.forEach(processNode);
  return parts;
};
