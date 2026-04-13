import { TranscriptionOutputFormat, SupportedLanguage } from "../types";

// ── Minimal ZIP creator (STORED method, no external deps) ─────────────────────

const buildCrc32Table = (): Uint32Array => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
};
const CRC32_TABLE = buildCrc32Table();

const crc32 = (data: Uint8Array): number => {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
};

const u16 = (v: DataView, o: number, n: number) => v.setUint16(o, n, true);
const u32 = (v: DataView, o: number, n: number) => v.setUint32(o, n, true);

export interface ZipEntry { name: string; content: string; }

export const createSessionZipBlob = (entries: ZipEntry[]): Blob => {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const dataBytes = enc.encode(entry.content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 + name)
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    u32(lv, 0,  0x04034B50); u16(lv, 4,  20); u16(lv, 6, 0); u16(lv, 8, 0);
    u16(lv, 10, dosTime);    u16(lv, 12, dosDate);
    u32(lv, 14, crc);        u32(lv, 18, size); u32(lv, 22, size);
    u16(lv, 26, nameBytes.length); u16(lv, 28, 0);
    lh.set(nameBytes, 30);
    parts.push(lh, dataBytes);

    // Central directory entry (46 + name)
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    u32(cv, 0,  0x02014B50); u16(cv, 4,  20); u16(cv, 6,  20); u16(cv, 8,  0);
    u16(cv, 10, 0);          u16(cv, 12, dosTime); u16(cv, 14, dosDate);
    u32(cv, 16, crc);        u32(cv, 20, size); u32(cv, 24, size);
    u16(cv, 28, nameBytes.length); u16(cv, 30, 0); u16(cv, 32, 0);
    u16(cv, 34, 0); u16(cv, 36, 0); u32(cv, 38, 0); u32(cv, 42, offset);
    ch.set(nameBytes, 46);
    centralDir.push(ch);

    offset += lh.length + dataBytes.length;
  }

  const cdSize = centralDir.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  u32(ev, 0,  0x06054B50); u16(ev, 4,  0); u16(ev, 6,  0);
  u16(ev, 8,  entries.length); u16(ev, 10, entries.length);
  u32(ev, 12, cdSize); u32(ev, 16, offset); u16(ev, 20, 0);

  return new Blob([...parts, ...centralDir, eocd], { type: 'application/zip' });
};

export const generateStandardMetadataHeader = (
  sourceTimestamp: Date | null,
  sourceFileName?: string,
  details?: {
    transcriptionLanguage?: SupportedLanguage;
    llmProcessingType?: string;
    outputFormat?: TranscriptionOutputFormat; // For specific format notes if needed
  }
): string => {
  let metadataHeader = "";
  if (sourceTimestamp) {
    const d = sourceTimestamp;
    const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    metadataHeader += `Source Timestamp: ${ts}\n`;
  }
  if (sourceFileName) {
    metadataHeader += `Original Source Filename: ${sourceFileName}\n`;
  }
  if (details?.transcriptionLanguage) {
      metadataHeader += `Language (Transcription/LLM): ${details.transcriptionLanguage}\n`;
  }
  if (details?.llmProcessingType) {
      metadataHeader += `LLM Processing Type: ${details.llmProcessingType}\n`;
  }
  if (details?.outputFormat) {
      metadataHeader += `Output Format: ${details.outputFormat.toUpperCase()}\n`;
  }
  
  const now = new Date();
  const fileGenTs = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  metadataHeader += `File Generated: ${fileGenTs}\n`;

  if (metadataHeader) {
    metadataHeader += `---\n`;
  }
  return metadataHeader;
};

export const saveTextToFile = (
  text: string, 
  filename: string, 
  format: TranscriptionOutputFormat = TranscriptionOutputFormat.TXT,
  metadataHeader?: string
): void => {
  console.log(`fileUtils: Saving text to file: ${filename}, Format: ${format}`);
  let blobContent = text;
  let mimeType = 'text/plain;charset=utf-8';
  let effectiveFilename = filename; // Base filename provided, extension will be added/replaced

  switch (format) {
    case TranscriptionOutputFormat.SRT:
      blobContent = generateSrtContent(text); 
      mimeType = 'application/x-subrip;charset=utf-8';
      effectiveFilename = filename.replace(/\.[^/.]+$/, "") + ".srt";
      break;
    case TranscriptionOutputFormat.CSV:
      blobContent = generateCsvContent(text); 
      mimeType = 'text/csv;charset=utf-8';
      effectiveFilename = filename.replace(/\.[^/.]+$/, "") + ".csv";
      break;
    case TranscriptionOutputFormat.HTML:
      blobContent = text;
      mimeType = 'text/html;charset=utf-8';
      effectiveFilename = filename.replace(/\.[^/.]+$/, "") + ".html";
      break;
    case TranscriptionOutputFormat.TXT:
    default:
      effectiveFilename = filename.replace(/\.[^/.]+$/, "") + ".txt";
      break;
  }

  let finalContent = blobContent;
  if (metadataHeader) {
    const separator = (blobContent.startsWith("\n") || metadataHeader.endsWith("\n\n") || metadataHeader.endsWith("---\n")) ? "" : "\n";
    finalContent = metadataHeader + separator + blobContent;
    console.log(`fileUtils: Prepended metadata header to ${effectiveFilename}. Header length: ${metadataHeader.length}`);
  }


  try {
    const blob = new Blob([finalContent], { type: mimeType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = effectiveFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    console.log(`fileUtils: File ${effectiveFilename} save initiated.`);
  } catch (error) {
    console.error(`fileUtils: Error saving file ${effectiveFilename}:`, error);
    alert(`Error saving file: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const saveBlobToFile = (blob: Blob, filename: string): void => {
  console.log(`fileUtils: Saving blob to file: ${filename}, Type: ${blob.type}, Size: ${blob.size}`);
  try {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    console.log(`fileUtils: Blob file ${filename} save initiated.`);
  } catch (error) {
    console.error(`fileUtils: Error saving blob file ${filename}:`, error);
    alert(`Error saving file: ${error instanceof Error ? error.message : String(error)}`);
  }
};


const generateSrtContent = (text: string): string => {
  console.log("fileUtils: Generating basic SRT content.");
  const lines = text.split('\n').filter(line => line.trim() !== '');
  let srtContent = "";
  let startTime = 0; // seconds
  const segmentDuration = 5; // seconds per segment (dummy duration)

  lines.forEach((line, index) => {
    const start = formatSrtTime(startTime);
    const end = formatSrtTime(startTime + segmentDuration);
    srtContent += `${index + 1}\n`;
    srtContent += `${start} --> ${end}\n`;
    srtContent += `${line}\n\n`;
    startTime += segmentDuration;
  });
  console.log("fileUtils: Basic SRT content generated. Note: Timestamps are sequential and not based on actual audio timing.");
  return srtContent;
};

const formatSrtTime = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds % 1) * 1000); 
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
};

const generateCsvContent = (text: string): string => {
  console.log("fileUtils: Generating CSV content.");
  const paragraphs = text.split('\n').filter(line => line.trim() !== '');
  if (paragraphs.length === 0) return '""'; 
  
  const csvRows = paragraphs.map(p => `"${p.replace(/"/g, '""')}"`);
  console.log("fileUtils: CSV content generated with each paragraph as a row.");
  return csvRows.join('\n');
};


export const parseTextFile = async (file: File): Promise<{ name: string, type: string, textContent: string | null, error?: string, uploadTime: Date }> => {
  console.log(`fileUtils: Parsing text file. Name: ${file.name}, Type: ${file.type}`);
  const uploadTime = new Date(); 
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let textContent = e.target?.result as string;
        if (file.type === 'text/html') {
          const parser = new DOMParser();
          const doc = parser.parseFromString(textContent, 'text/html');
          textContent = doc.body.textContent || "";
          console.log("fileUtils: HTML file parsed, text content extracted.");
        } else if (file.type === 'text/csv') {
          console.log("fileUtils: CSV file loaded as text.");
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          console.warn("fileUtils: PDF file selected. Direct client-side text extraction from PDF is complex and not fully implemented. Displaying a message.");
          resolve({ name: file.name, type: file.type, textContent: null, error: "Full PDF text extraction is not supported. Please convert to .txt or copy-paste content.", uploadTime });
          return;
        } else if (file.type.startsWith('application/vnd.openxmlformats-officedocument.wordprocessingml.document') || file.name.endsWith('.docx') || file.type === 'application/msword' || file.name.endsWith('.doc')) {
          console.warn("fileUtils: Word document selected. Direct client-side text extraction from DOC/DOCX is complex and not fully implemented. Displaying a message.");
          resolve({ name: file.name, type: file.type, textContent: null, error: "Full DOC/DOCX text extraction is not supported. Please convert to .txt or copy-paste content.", uploadTime });
          return;
        }
        console.log(`fileUtils: File ${file.name} parsed successfully as text.`);
        resolve({ name: file.name, type: file.type, textContent, uploadTime });
      } catch (err) {
        console.error("fileUtils: Error parsing file:", err);
        resolve({ name: file.name, type: file.type, textContent: null, error: `Error reading file: ${err instanceof Error ? err.message : String(err)}`, uploadTime });
      }
    };
    reader.onerror = (err) => {
      console.error("fileUtils: FileReader error:", err);
      resolve({ name: file.name, type: file.type, textContent: null, error: `FileReader error: ${err}`, uploadTime });
    };
    reader.readAsText(file);
  });
};
