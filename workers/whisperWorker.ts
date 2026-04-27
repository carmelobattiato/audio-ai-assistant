import { pipeline, env, AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loadedModel: string | null = null;

self.onmessage = async (event: MessageEvent) => {
  const { type, model, audioData, language } = event.data;

  if (type === 'load') {
    try {
      if (loadedModel === model && asr !== null) {
        self.postMessage({ type: 'loaded', model });
        return;
      }
      asr = null;
      loadedModel = null;

      asr = await pipeline('automatic-speech-recognition', model, {
        // fp32 = standard ONNX files, no quantization — avoids NBits/q4 ONNX RT Web incompatibility
        dtype: 'fp32',
        device: 'wasm',
        progress_callback: (progress: { status: string; name?: string; file?: string; loaded?: number; total?: number }) => {
          self.postMessage({ type: 'progress', progress });
        },
      }) as AutomaticSpeechRecognitionPipeline;

      loadedModel = model;
      self.postMessage({ type: 'loaded', model });
    } catch (err) {
      self.postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (type === 'transcribe') {
    if (!asr) {
      self.postMessage({ type: 'error', error: 'Model not loaded' });
      return;
    }
    try {
      const audio = new Float32Array(audioData);
      const result = await asr(audio, {
        language: language ?? 'italian',
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      });
      const text = Array.isArray(result)
        ? result.map((r: { text: string }) => r.text).join(' ')
        : (result as { text: string }).text;
      self.postMessage({ type: 'result', text: text.trim() });
    } catch (err) {
      self.postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }
};
