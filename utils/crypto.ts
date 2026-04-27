
const CRYPTO_KEY_STORAGE = 'aaia_enc_key_v1';

async function getOrCreateKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(CRYPTO_KEY_STORAGE);
  if (stored) {
    const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem(CRYPTO_KEY_STORAGE, btoa(String.fromCharCode(...new Uint8Array(exported))));
  return key;
}

export interface EncryptedBlob {
  iv: string;
  data: string;
}

export async function encryptString(plaintext: string): Promise<EncryptedBlob> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  };
}

export async function decryptString(blob: EncryptedBlob): Promise<string> {
  const key = await getOrCreateKey();
  const iv = Uint8Array.from(atob(blob.iv), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(blob.data), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}
