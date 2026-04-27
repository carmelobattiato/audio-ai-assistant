import { toWhisperLanguage } from '../utils/whisperLanguages';

export interface ProgressInfo {
  status: string;
  name?: string;
  file?: string;
  loaded?: number;
  total?: number;
}

type ProgressCallback = (info: ProgressInfo) => void;

class WhisperService {
  private worker: Worker | null = null;
  private _loadedModel: string | null = null;
  private pendingResolvers: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../workers/whisperWorker.ts', import.meta.url),
        { type: 'module' }
      );
      this.worker.onmessage = (e: MessageEvent) => this.handleMessage(e);
      this.worker.onerror = (e) => {
        const r = this.pendingResolvers.get('load') ?? this.pendingResolvers.get('transcribe');
        if (r) r.reject(new Error(e.message));
      };
    }
    return this.worker;
  }

  private handleMessage(e: MessageEvent) {
    const { type, text, error, model } = e.data;

    if (type === 'loaded') {
      this._loadedModel = model;
      this.pendingResolvers.get('load')?.resolve(null);
      this.pendingResolvers.delete('load');
    } else if (type === 'result') {
      this.pendingResolvers.get('transcribe')?.resolve(text);
      this.pendingResolvers.delete('transcribe');
    } else if (type === 'error') {
      const r = this.pendingResolvers.get('load') ?? this.pendingResolvers.get('transcribe');
      if (r) r.reject(new Error(error));
      this.pendingResolvers.delete('load');
      this.pendingResolvers.delete('transcribe');
    }
  }

  async loadModel(model: string, onProgress: ProgressCallback): Promise<void> {
    const worker = this.getWorker();

    const progressHandler = (e: MessageEvent) => {
      if (e.data.type === 'progress') onProgress(e.data.progress);
    };
    worker.addEventListener('message', progressHandler);

    try {
      await new Promise<unknown>((resolve, reject) => {
        this.pendingResolvers.set('load', { resolve, reject });
        worker.postMessage({ type: 'load', model });
      });
    } finally {
      worker.removeEventListener('message', progressHandler);
    }
  }

  async transcribe(audioBlob: Blob, language: string, signal?: AbortSignal, initialPrompt?: string): Promise<string> {
    const worker = this.getWorker();

    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } finally {
      audioCtx.close();
    }

    const mono = audioBuffer.numberOfChannels === 1
      ? audioBuffer.getChannelData(0)
      : downsampleToMono(audioBuffer);

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const float32 = new Float32Array(mono);

    return new Promise<string>((resolve, reject) => {
      if (signal) {
        signal.addEventListener('abort', () => {
          this.pendingResolvers.delete('transcribe');
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      }
      this.pendingResolvers.set('transcribe', {
        resolve: (v) => resolve(v as string),
        reject,
      });
      worker.postMessage(
        { type: 'transcribe', audioData: float32.buffer, language: toWhisperLanguage(language), initialPrompt },
        [float32.buffer]
      );
    });
  }

  isLoaded(): boolean {
    return this._loadedModel !== null;
  }

  loadedModel(): string | null {
    return this._loadedModel;
  }

  async checkModelCached(model: string): Promise<boolean> {
    if (!('caches' in window)) return false;
    try {
      const cache = await caches.open('transformers-cache');
      const keys = await cache.keys();
      // A model is considered cached if at least one of its ONNX files is present
      return keys.some(req => req.url.includes(model) && req.url.endsWith('.onnx'));
    } catch {
      return false;
    }
  }

  async deleteModel(model: string): Promise<void> {
    if (!('caches' in window)) return;
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    const matching = keys.filter(req => req.url.includes(model));
    await Promise.all(matching.map(req => cache.delete(req)));
    if (this._loadedModel === model) {
      this._loadedModel = null;
      // Terminate worker so it doesn't hold the model in memory
      this.worker?.terminate();
      this.worker = null;
    }
  }
}

function downsampleToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const result = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) result[i] += data[i];
  }
  for (let i = 0; i < length; i++) result[i] /= channels;
  return result;
}

export const whisperService = new WhisperService();
