/**
 * Kişi algılama — açık model: TensorFlow.js COCO-SSD (lite_mobilenet_v2).
 * Model ilk seferde (~6 MB) indirilir, Service Worker runtimeCaching ile sonra çevrimdışı çalışır.
 * Görüntü cihazdan dışarı çıkmaz; yalnızca kutu koordinatları döner.
 */
import type { ObjectDetection } from '@tensorflow-models/coco-ssd';

export interface PersonBox {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

export type DetectSource = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement;

let detector: ObjectDetection | null = null;
let loading: Promise<ObjectDetection> | null = null;

export const MIN_SCORE = 0.45;

export async function loadDetector(onProgress?: (step: string, ratio: number) => void): Promise<ObjectDetection> {
  if (detector) return detector;
  if (loading) return loading;
  loading = (async () => {
    try {
      onProgress?.('TensorFlow.js yükleniyor', 0.1);
      const tf = await import('@tensorflow/tfjs');
      try {
        await tf.setBackend('webgl');
        await tf.ready();
      } catch {
        await tf.setBackend('cpu');
        await tf.ready();
      }
      onProgress?.(`Arka uç: ${tf.getBackend()} · model indiriliyor`, 0.35);
      const cocoSsd = await import('@tensorflow-models/coco-ssd');
      const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      onProgress?.('Model hazır', 1);
      detector = model;
      return model;
    } catch (err) {
      loading = null;
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Kişi algılama modeli yüklenemedi. İlk kullanımda internet bağlantısı gerekir; sonra çevrimdışı çalışır. (${reason})`,
        { cause: err },
      );
    }
  })();
  return loading;
}

export function isDetectorReady(): boolean {
  return detector !== null;
}

export async function detectPeople(source: DetectSource, minScore = MIN_SCORE): Promise<PersonBox[]> {
  const model = await loadDetector();
  const preds = await model.detect(source, 20, minScore);
  return preds
    .filter((p) => p.class === 'person' && p.score >= minScore)
    .map((p) => ({ x: p.bbox[0], y: p.bbox[1], w: p.bbox[2], h: p.bbox[3], score: p.score }));
}
