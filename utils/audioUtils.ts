

export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') { reject(new Error('FileReader result is not a string')); return; }
      const base64 = reader.result.split(',')[1];
      if (!base64) { reject(new Error('Empty or invalid blob data for base64 conversion')); return; }
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export const getMimeTypeFromBlob = (blob: Blob): string =>
  blob.type || 'application/octet-stream';

export const mergeAudioBlobs = async (blob1: Blob, blob2: Blob): Promise<Blob> => {
  const [buffer1, buffer2] = await Promise.all([blob1.arrayBuffer(), blob2.arrayBuffer()]);
  const combined = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  combined.set(new Uint8Array(buffer1), 0);
  combined.set(new Uint8Array(buffer2), buffer1.byteLength);
  return new Blob([combined.buffer], { type: blob1.type });
};

export const getAudioBlobDuration = (blob: Blob): Promise<number> => {
  return new Promise((resolve, reject) => {
      const audio = document.createElement('audio');
      const objectUrl = URL.createObjectURL(blob);
      audio.addEventListener('loadedmetadata', () => {
          URL.revokeObjectURL(objectUrl);
          resolve(audio.duration);
      });
      audio.addEventListener('error', (e) => {
          URL.revokeObjectURL(objectUrl);
          const errorMessage = (e.target as HTMLAudioElement)?.error?.message || 'Unknown error loading audio metadata';
          reject(new Error(errorMessage));
      });
      audio.src = objectUrl;
      audio.load();
  });
};

/**
 * Encodes raw audio bytes (as a Uint8Array) into a base64 string.
 * Required for sending audio data to the Gemini Live API.
 */
export const encode = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
};
