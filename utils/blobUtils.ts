/**
 * Conversioni Blob ↔ data URL usate da export/import di sessioni e backup:
 * IndexedDB conserva i Blob nativi, ma JSON e ZIP trasportano solo testo.
 */

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });

export const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, b64] = dataUrl.split(',');
  const mime = header?.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const binary = atob(b64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};
