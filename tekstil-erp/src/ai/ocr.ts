/**
 * Görsel OCR — tesseract.js v7 (Apache-2.0, https://github.com/naptha/tesseract.js).
 * Tamamı tarayıcıda, WebAssembly ile çalışır. Dil verileri (tur, eng) ilk kullanımda
 * tesseract.js'in varsayılan tessdata CDN'inden indirilir ve Service Worker + tarayıcı
 * önbelleğinde tutulur; sonraki kullanımlar çevrimdışıdır. Görüntü hiçbir sunucuya gitmez.
 */
import { createWorker, type Worker } from 'tesseract.js';

export interface OcrWord {
  text: string;
  confidence: number;
}

export interface OcrResult {
  text: string;
  confidence: number; // 0..1
  words?: OcrWord[];
}

export type OcrProgress = (info: { status: string; progress: number }) => void;

let workerPromise: Promise<Worker> | null = null;
let workerLangs = '';
let progressListener: OcrProgress | undefined;

async function getWorker(langs: string): Promise<Worker> {
  if (workerPromise && workerLangs === langs) return workerPromise;
  if (workerPromise) {
    const old = await workerPromise;
    await old.terminate().catch(() => undefined);
  }
  workerLangs = langs;
  // Worker, WASM çekirdeği ve dil verileri uygulamayla birlikte sunulur (public/tesseract, public/tessdata);
  // böylece CDN erişimi olmayan / çevrimdışı ortamlarda da OCR çalışır.
  const base = typeof document !== 'undefined' ? document.baseURI : '/';
  workerPromise = createWorker(langs, 1, {
    workerPath: new URL('tesseract/worker.min.js', base).href,
    corePath: new URL('tesseract/', base).href,
    langPath: new URL('tessdata/', base).href,
    gzip: true,
    logger: (m) => progressListener?.({ status: translateStatus(m.status), progress: m.progress ?? 0 }),
  });
  return workerPromise;
}

function translateStatus(status: string): string {
  if (status.includes('loading tesseract core')) return 'OCR çekirdeği yükleniyor';
  if (status.includes('loading language')) return 'Dil verisi indiriliyor';
  if (status.includes('initializing')) return 'OCR başlatılıyor';
  if (status.includes('recognizing')) return 'Metin okunuyor';
  return status;
}

/** Görüntüyü canvas'a alır: gri ton + kontrast artırma; küçük görüntüleri 2× büyütür */
export async function preprocess(src: Blob | HTMLCanvasElement | HTMLImageElement): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap | HTMLCanvasElement | HTMLImageElement;
  if (src instanceof Blob) bitmap = await createImageBitmap(src);
  else bitmap = src;
  const w = 'width' in bitmap ? bitmap.width : 0;
  const h = 'height' in bitmap ? bitmap.height : 0;
  const scale = Math.max(w, h) < 1400 ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  // gri ton + ortalama etrafında kontrast
  let sum = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
    sum += g;
  }
  const mean = sum / n;
  const k = 1.35;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, (d[i] - mean) * k + mean));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function recognizeImage(
  file: Blob | HTMLCanvasElement,
  langs = 'tur+eng',
  onProgress?: OcrProgress,
): Promise<OcrResult> {
  progressListener = onProgress;
  const canvas = await preprocess(file);
  const worker = await getWorker(langs);
  await worker.setParameters({ preserve_interword_spaces: '1' });
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w of line.words ?? []) words.push({ text: w.text, confidence: w.confidence / 100 });
      }
    }
  }
  progressListener = undefined;
  return { text: data.text ?? '', confidence: (data.confidence ?? 0) / 100, words };
}

export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  const w = await workerPromise;
  workerPromise = null;
  workerLangs = '';
  await w.terminate().catch(() => undefined);
}
