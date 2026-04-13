
// utils/textUtils.ts
import { Part } from "@google/genai";

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
    const line = lines[i];
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
      const indent = listMatch[1].length;
      const type = listMatch[2].match(/\d/) ? 'ol' : 'ul';
      const content = listMatch[3];
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
        const level = hMatch[1].length;
        html += `<h${level}>${markdownToHtmlInline(hMatch[2])}</h${level}>`;
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

  tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
    h.innerHTML = `\n\n${h.innerHTML.toUpperCase()}\n`;
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

  return tempDiv.textContent || tempDiv.innerText || "";
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
          const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
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
