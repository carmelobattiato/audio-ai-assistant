

export const blobToBase64 = (blob: Blob): Promise<string> => {
  console.log("audioUtils: Converting Blob to Base64. Blob type:", blob.type, "Blob size:", blob.size);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64String = reader.result.split(',')[1];
        if (base64String) {
          console.log("audioUtils: Blob converted to Base64 successfully.");
          resolve(base64String);
        } else {
          // If the result is just "data:" (empty data), it means the blob was likely empty or invalid
          if (reader.result === "data:") {
             console.error("audioUtils: Error splitting Base64 string from data URL. Result was 'data:', indicating empty or invalid blob data for base64 conversion.");
             reject(new Error("Empty or invalid blob data for base64 conversion."));
          } else {
            console.error("audioUtils: Error splitting Base64 string from data URL. Result was (first 100 chars):", reader.result.substring(0,100) + "...");
            reject(new Error("Error splitting Base64 string from data URL."));
          }
        }
      } else {
        console.error("audioUtils: FileReader result is not a string.");
        reject(new Error("FileReader result is not a string."));
      }
    };
    reader.onerror = (error) => {
      console.error("audioUtils: FileReader error.", error);
      reject(error);
    };
    reader.readAsDataURL(blob);
  });
};

export const getMimeTypeFromBlob = (blob: Blob): string => {
  const mimeType = blob.type || 'application/octet-stream';
  console.log(`audioUtils: Determined MimeType for blob. Original blob.type: "${blob.type}", Resolved MimeType: "${mimeType}"`);
  return mimeType;
}

export const mergeAudioBlobs = async (blob1: Blob, blob2: Blob): Promise<Blob> => {
  console.log(`audioUtils: Merging two blobs. Blob1 size: ${blob1.size}, Blob2 size: ${blob2.size}`);
  if (blob1.type !== blob2.type) {
    console.warn("audioUtils: Merging blobs of different types. The output will have the type of the first blob.", blob1.type, blob2.type);
  }

  const buffer1 = await blob1.arrayBuffer();
  const buffer2 = await blob2.arrayBuffer();

  const combinedBuffer = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  combinedBuffer.set(new Uint8Array(buffer1), 0);
  combinedBuffer.set(new Uint8Array(buffer2), buffer1.byteLength);

  const mergedBlob = new Blob([combinedBuffer.buffer], { type: blob1.type });
  console.log(`audioUtils: Merged blob created successfully. New size: ${mergedBlob.size}`);
  return mergedBlob;
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
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};
