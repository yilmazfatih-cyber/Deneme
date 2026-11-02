/**
 * Barkod / QR yardımcıları.
 *  - Üretim: `qrcode` paketi ile veri URL'si (etiket basımı için)
 *  - Okuma: önce tarayıcının yerel BarcodeDetector API'si, yoksa @zxing/browser
 * Kameradan okunan ham metin `onResult` ile iletilir; parti etiketleri `LOT:<partiNo>` biçimindedir.
 */
import QRCode from 'qrcode';

export const LOT_PREFIX = 'LOT:';

export function lotQrPayload(lotNo: string): string {
  return `${LOT_PREFIX}${lotNo}`;
}

export function parseLotPayload(raw: string): string | null {
  const t = raw.trim();
  return t.toUpperCase().startsWith(LOT_PREFIX) ? t.slice(LOT_PREFIX.length).trim() : null;
}

export async function qrDataUrl(text: string, size = 220): Promise<string> {
  return QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' });
}

// ---- Yerel BarcodeDetector (lib.dom'da yok) ----
interface DetectedBarcode {
  rawValue: string;
  format: string;
}
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

function nativeDetector(): BarcodeDetectorCtor | undefined {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return typeof w.BarcodeDetector === 'function' ? w.BarcodeDetector : undefined;
}

export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

function describeMediaError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Kamera izni verilmedi. Tarayıcı ayarlarından kamera erişimine izin verin.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Kamera bulunamadı. Barkodu aşağıdaki alana elle yazabilirsiniz.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Kamera başka bir uygulama tarafından kullanılıyor.';
    case 'OverconstrainedError':
      return 'Uygun kamera bulunamadı (arka kamera yok).';
    case 'SecurityError':
      return 'Kamera yalnızca HTTPS veya localhost üzerinde çalışır.';
    default:
      return `Kamera açılamadı: ${(err as Error)?.message ?? 'bilinmeyen hata'}`;
  }
}

export type StopScanner = () => void;

/**
 * Kamerayı video öğesine bağlar ve okunan her kodu `onResult` ile bildirir.
 * Aynı değer 1,5 s içinde yeniden okunursa tekrar bildirilmez.
 * Dönen fonksiyon taramayı ve kamerayı kapatır.
 */
export async function startScanner(video: HTMLVideoElement, onResult: (value: string, format: string) => void): Promise<StopScanner> {
  if (!cameraSupported()) throw new Error('Bu tarayıcıda kamera erişimi desteklenmiyor.');

  let lastValue = '';
  let lastAt = 0;
  const emit = (value: string, format: string) => {
    const now = Date.now();
    if (value === lastValue && now - lastAt < 1500) return;
    lastValue = value;
    lastAt = now;
    onResult(value, format);
  };

  const Native = nativeDetector();
  if (Native) {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (err) {
      throw new Error(describeMediaError(err), { cause: err });
    }
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    await video.play().catch(() => undefined);
    const detector = new Native({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'data_matrix'] });
    let running = true;
    const tick = async () => {
      if (!running) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          for (const c of codes) if (c.rawValue) emit(c.rawValue, c.format);
        }
      } catch {
        /* kare okunamadı — devam */
      }
      if (running) setTimeout(tick, 180);
    };
    void tick();
    return () => {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }

  // ZXing yedeği
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();
  try {
    const controls = await reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
      video,
      (result) => {
        if (result) emit(result.getText(), String(result.getBarcodeFormat()));
      },
    );
    return () => {
      controls.stop();
      video.srcObject = null;
    };
  } catch (err) {
    throw new Error(describeMediaError(err), { cause: err });
  }
}

/** Yazdırılabilir parti etiketi HTML'i (yeni pencerede açılır) */
export function labelHtml(opts: { qr: string; title: string; lotNo: string; quantity: string; location: string; extra?: string }): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Etiket ${esc(opts.lotNo)}</title>
<style>
  @page { size: 100mm 60mm; margin: 4mm; }
  body { font: 13px/1.35 system-ui, sans-serif; color: #000; margin: 0; }
  .label { display: flex; gap: 10px; align-items: center; width: 92mm; height: 52mm; border: 1px solid #000; padding: 4mm; box-sizing: border-box; }
  .label img { width: 40mm; height: 40mm; }
  .info { flex: 1; min-width: 0; }
  .info h1 { font-size: 15px; margin: 0 0 6px; line-height: 1.2; }
  .info .lot { font-family: ui-monospace, monospace; font-size: 17px; font-weight: 700; margin: 4px 0; }
  .info p { margin: 2px 0; }
  @media screen { body { padding: 20px; background: #eee; } .label { background: #fff; } }
</style></head><body>
<div class="label">
  <img src="${opts.qr}" alt="QR">
  <div class="info">
    <h1>${esc(opts.title)}</h1>
    <div class="lot">${esc(opts.lotNo)}</div>
    <p><b>Miktar:</b> ${esc(opts.quantity)}</p>
    <p><b>Konum:</b> ${esc(opts.location)}</p>
    ${opts.extra ? `<p>${esc(opts.extra)}</p>` : ''}
  </div>
</div>
<script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),200)})</script>
</body></html>`;
}

export function openPrintWindow(html: string): boolean {
  const w = window.open('', '_blank', 'width=720,height=480');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
