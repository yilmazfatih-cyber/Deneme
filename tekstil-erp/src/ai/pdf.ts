/**
 * PDF okuma — pdf.js (Mozilla, Apache-2.0, https://github.com/mozilla/pdf.js) ile tarayıcıda.
 * Metin katmanı varsa doğrudan alınır; taranmış (resim) sayfalar canvas'a çizilip tesseract ile OCR edilir.
 */
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { recognizeImage, type OcrProgress } from './ocr';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfExtractOptions {
  ocrFallback?: boolean;
  langs?: string;
  onProgress?: OcrProgress;
  maxPages?: number;
}

export interface PdfExtractResult {
  text: string;
  pages: number;
  usedOcr: boolean;
  confidence: number; // 0..1 (metin katmanı = 0.95; OCR sayfaları kendi güvenleriyle ağırlıklı)
  thumbnailDataUrl?: string;
}

function itemsToText(items: TextItem[]): string {
  // Satırları y koordinatına göre grupla, soldan sağa sırala
  const rows = new Map<number, TextItem[]>();
  for (const it of items) {
    if (!it.str) continue;
    const y = Math.round(it.transform[5] / 3) * 3;
    rows.set(y, [...(rows.get(y) ?? []), it]);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) =>
      row
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((r) => r.str)
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

export async function extractPdf(file: Blob, opts: PdfExtractOptions = {}): Promise<PdfExtractResult> {
  const { ocrFallback = true, langs = 'tur+eng', onProgress, maxPages = 30 } = opts;
  const data = new Uint8Array(await file.arrayBuffer());
  const task = getDocument({ data });
  const doc = await task.promise;
  const pageCount = Math.min(doc.numPages, maxPages);
  const parts: string[] = [];
  let usedOcr = false;
  let confSum = 0;
  let thumbnailDataUrl: string | undefined;

  for (let p = 1; p <= pageCount; p++) {
    onProgress?.({ status: `Sayfa ${p}/${pageCount} okunuyor`, progress: (p - 1) / pageCount });
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let text = itemsToText(content.items.filter((i): i is TextItem => 'str' in i));
    let conf = 0.95;

    if (p === 1 || (text.trim().length < 40 && ocrFallback)) {
      const scale = text.trim().length < 40 && ocrFallback ? 2 : 0.5;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      if (p === 1) thumbnailDataUrl = makeThumb(canvas, 240);
      if (text.trim().length < 40 && ocrFallback) {
        usedOcr = true;
        const ocr = await recognizeImage(canvas, langs, (info) =>
          onProgress?.({ status: `Sayfa ${p}: ${info.status}`, progress: (p - 1 + info.progress) / pageCount }),
        );
        text = ocr.text;
        conf = ocr.confidence;
      }
    }
    confSum += conf;
    parts.push(text);
  }
  onProgress?.({ status: 'Tamamlandı', progress: 1 });
  await task.destroy();
  return {
    text: parts.join('\n\n'),
    pages: doc.numPages,
    usedOcr,
    confidence: pageCount ? confSum / pageCount : 0,
    thumbnailDataUrl,
  };
}

export function makeThumb(source: HTMLCanvasElement | HTMLImageElement, maxW: number): string {
  const w = source.width;
  const h = source.height;
  const scale = Math.min(1, maxW / w);
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}
