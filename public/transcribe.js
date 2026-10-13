// Transcrição local com Whisper (mesma abordagem do Combinator): roda no navegador,
// sem API e sem custo. O modelo baixa uma vez e fica no cache do navegador.
const REPO = 'onnx-community/whisper-base';
let pipePromise = null;

export const webgpu = () => typeof navigator !== 'undefined' && 'gpu' in navigator;

async function loadLib() {
  try { return await import('/vendor/transformers.min.js'); }
  catch { return await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js'); }
}

async function getPipe(onProgress) {
  if (pipePromise) return pipePromise;
  pipePromise = (async () => {
    const t = await loadLib();
    const device = webgpu() ? 'webgpu' : 'wasm';
    // fp32 no WebGPU (fp16 quebrava o modelo base no Combinator); q8 no CPU.
    const dtype = device === 'webgpu' ? 'fp32' : 'q8';
    return t.pipeline('automatic-speech-recognition', REPO, {
      device, dtype,
      progress_callback: (e) => {
        if (e?.status === 'progress' && e.total) onProgress?.(Math.round(e.progress ?? (e.loaded / e.total) * 100));
      },
    });
  })();
  try { return await pipePromise; } catch (e) { pipePromise = null; throw e; }
}

// Decodifica o áudio do vídeo e converte para 16 kHz mono, sem ffmpeg.
async function extractAudio(file) {
  const buf = await file.arrayBuffer();
  const ctx = new AudioContext();
  let decoded;
  try { decoded = await ctx.decodeAudioData(buf); }
  catch { throw new Error('Não consegui ler o áudio desse vídeo. Tente outro arquivo ou cole a transcrição.'); }
  finally { ctx.close(); }
  const frames = Math.ceil(decoded.duration * 16000);
  const off = new OfflineAudioContext(1, frames, 16000);
  const src = off.createBufferSource();
  src.buffer = decoded; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  const data = out.getChannelData(0);
  if (!data.length) throw new Error('Esse vídeo não tem áudio.');
  return data;
}

export async function transcrever(file, { onStage, onProgress } = {}) {
  onStage?.('Extraindo o áudio…');
  const audio = await extractAudio(file);
  onStage?.('Carregando o modelo (só demora na primeira vez)…');
  const pipe = await getPipe(onProgress);
  onStage?.('Transcrevendo…');
  const out = await pipe(audio, { chunk_length_s: 30, stride_length_s: 5, language: 'pt', task: 'transcribe', no_repeat_ngram_size: 3 });
  const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out?.text;
  return (text || '').replace(/\s+/g, ' ').trim();
}
