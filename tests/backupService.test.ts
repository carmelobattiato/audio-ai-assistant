import { describe, it, expect } from 'vitest';
import { createSessionZipBlob, parseStoredZip } from '../utils/fileUtils';
import { blobToDataUrl, dataUrlToBlob } from '../utils/blobUtils';

describe('backup ZIP roundtrip', () => {
  it('preserves non-ASCII JSON content', async () => {
    const payload = JSON.stringify({ nome: 'Riunione perché — àèìòù 😀', n: 42 });
    const zip = createSessionZipBlob([
      { name: 'manifest.json', content: '{"formatVersion":1}' },
      { name: 'sessions/abc.json', content: payload },
    ]);
    const entries = parseStoredZip(await zip.arrayBuffer());

    expect(entries.map(e => e.name)).toEqual(['manifest.json', 'sessions/abc.json']);
    expect(entries[1]!.content).toBe(payload);
  });

  it('roundtrips a binary blob through base64', async () => {
    const bytes = new Uint8Array(512);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256;
    const original = new Blob([bytes], { type: 'audio/webm' });

    const restored = dataUrlToBlob(await blobToDataUrl(original));

    expect(restored.type).toBe('audio/webm');
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(bytes);
  });

  it('survives an audio blob embedded in a zipped session JSON', async () => {
    const bytes = new Uint8Array([0, 1, 250, 128, 255, 65, 10, 13]);
    const dataUrl = await blobToDataUrl(new Blob([bytes], { type: 'audio/webm' }));
    const content = JSON.stringify({ id: 's1', data: { audioBlobBase64: dataUrl } });

    const entries = parseStoredZip(await createSessionZipBlob([{ name: 'sessions/s1.json', content }]).arrayBuffer());
    const parsed = JSON.parse(entries[0]!.content) as { data: { audioBlobBase64: string } };
    const restored = dataUrlToBlob(parsed.data.audioBlobBase64);

    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(bytes);
  });
});
