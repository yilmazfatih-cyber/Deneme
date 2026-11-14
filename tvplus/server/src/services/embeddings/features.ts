/**
 * Tek kipli özellik çıkarımı (saf işlevler): ham RGB karelerden görüntü özellikleri, iki kare arasından hareket
 * kestirimi, mono PCM'den ses özellikleri. Çekim çözümleme aracı (scripts/analyze-shots.ts) kullanır; sunucu bu
 * işlevleri çalışma anında çağırmaz (vektörler depodaki çözümleme dosyalarından kurulur).
 * Alanların anlamı: shared/shots-schema.ts.
 */
import {
  HIST_BINS,
  HIST_HUE_BINS,
  HIST_LIGHT_BINS,
  type AudioFeatures,
  type VisualFeatures,
} from '../../../../shared/shots-schema'

/** Ham kare: satır satır, piksel başına `channels` bayt (ilk üçü R, G, B). */
export interface RawFrame {
  data: Uint8Array
  width: number
  height: number
  channels: number
}

/** Sobel büyüklüğü (luma 0–1 ölçeğinde) bu eşiği aşan piksel "kenar" sayılır. */
export const EDGE_THRESHOLD = 0.35
/** Bu parlaklığın (HSV V) altındaki piksellerin doygunluğu 0 sayılır. */
export const DARK_V = 0.08
/** Hasler–Süsstrunk renklilik değerinin 0–1'e ölçeklenmesi (≈150 "çok renkli" sınırıdır). */
export const COLORFULNESS_SCALE = 150

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
/** Dosyaları küçük tutmak için yuvarlama (`digits` ondalık). */
export const round = (x: number, digits = 3) => {
  const f = 10 ** digits
  return Math.round(x * f) / f
}

/** Rec. 709 luma (0–1) dizisi. */
export function lumaOf(f: RawFrame): Float32Array {
  const n = f.width * f.height
  const out = new Float32Array(n)
  for (let p = 0, o = 0; p < n; p++, o += f.channels)
    out[p] = (0.2126 * f.data[o]! + 0.7152 * f.data[o + 1]! + 0.0722 * f.data[o + 2]!) / 255
  return out
}

/** Bir karenin görüntü özellikleri (`motion` null; hareket iki kareden ayrıca kestirilir). */
export function visualFeatures(f: RawFrame): VisualFeatures {
  const n = f.width * f.height
  if (n === 0) throw new Error('Boş kare')
  const hue = new Float64Array(HIST_HUE_BINS)
  const light = new Float64Array(HIST_LIGHT_BINS)
  let sumY = 0
  let sumY2 = 0
  let sumS = 0
  let sumRg = 0
  let sumRg2 = 0
  let sumYb = 0
  let sumYb2 = 0
  const luma = new Float32Array(n)
  for (let p = 0, o = 0; p < n; p++, o += f.channels) {
    const R = f.data[o]!
    const G = f.data[o + 1]!
    const B = f.data[o + 2]!
    const r = R / 255
    const g = G / 255
    const b = B / 255
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    luma[p] = y
    sumY += y
    sumY2 += y * y
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    // Çok karanlık piksellerde HSV doygunluğu gürültüdür (siyah karede 0.4'e çıkabilir): DARK_V altı 0 sayılır.
    sumS += max > DARK_V ? (max - min) / max : 0
    if (max > min) {
      const d = max - min
      let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      if (h < 0) h += 6
      // Ton kutusu ağırlığı renk yoğunluğudur (chroma = max − min): gri ve karanlık pikseller tona katkı vermez.
      hue[Math.min(HIST_HUE_BINS - 1, Math.floor((h / 6) * HIST_HUE_BINS))]! += d
    }
    light[Math.min(HIST_LIGHT_BINS - 1, Math.floor(y * HIST_LIGHT_BINS))]! += 1
    const rg = R - G
    const yb = 0.5 * (R + G) - B
    sumRg += rg
    sumRg2 += rg * rg
    sumYb += yb
    sumYb2 += yb * yb
  }
  const meanY = sumY / n
  const varY = Math.max(0, sumY2 / n - meanY * meanY)
  const mRg = sumRg / n
  const mYb = sumYb / n
  const sdRg = Math.sqrt(Math.max(0, sumRg2 / n - mRg * mRg))
  const sdYb = Math.sqrt(Math.max(0, sumYb2 / n - mYb * mYb))
  const colorful = Math.sqrt(sdRg * sdRg + sdYb * sdYb) + 0.3 * Math.sqrt(mRg * mRg + mYb * mYb)
  const hist: number[] = []
  for (const v of hue) hist.push(round(v / n))
  for (const v of light) hist.push(round(v / n))
  return {
    hist,
    bright: round(meanY),
    contrast: round(Math.sqrt(varY)),
    sat: round(sumS / n),
    colorful: round(clamp01(colorful / COLORFULNESS_SCALE)),
    edges: round(edgeDensity(luma, f.width, f.height)),
    motion: null,
  }
}

/** Sobel kenar yoğunluğu: iç piksellerde büyüklüğü EDGE_THRESHOLD'u aşanların oranı. */
export function edgeDensity(y: Float32Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 0
  let edges = 0
  for (let r = 1; r < h - 1; r++) {
    for (let c = 1; c < w - 1; c++) {
      const i = r * w + c
      const tl = y[i - w - 1]!
      const t = y[i - w]!
      const tr = y[i - w + 1]!
      const l = y[i - 1]!
      const rr = y[i + 1]!
      const bl = y[i + w - 1]!
      const b = y[i + w]!
      const br = y[i + w + 1]!
      const gx = tr + 2 * rr + br - tl - 2 * l - bl
      const gy = bl + 2 * b + br - tl - 2 * t - tr
      if (gx * gx + gy * gy > EDGE_THRESHOLD * EDGE_THRESHOLD) edges++
    }
  }
  return edges / ((w - 2) * (h - 2))
}

/**
 * Hareket kestirimi: iki karenin (aynı boyut) luma farkının mutlak ortalaması, 0–1.
 * Kaba bir ölçüdür: kamera hareketini, nesne hareketini ve ışık değişimini ayırt etmez.
 */
export function motionEstimate(a: RawFrame, b: RawFrame): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error('Kare boyutları farklı')
  const ya = lumaOf(a)
  const yb = lumaOf(b)
  let s = 0
  for (let i = 0; i < ya.length; i++) s += Math.abs(ya[i]! - yb[i]!)
  return round(clamp01(s / ya.length))
}

/** Birden çok karenin özelliklerinin ortalaması (çekimin orta kareleri). */
export function averageVisual(list: VisualFeatures[], motion: number | null): VisualFeatures {
  if (list.length === 0) throw new Error('Kare yok')
  const n = list.length
  const avg = (pick: (v: VisualFeatures) => number) => round(list.reduce((s, v) => s + pick(v), 0) / n)
  const hist = Array.from({ length: HIST_BINS }, (_, k) => avg((v) => v.hist[k] ?? 0))
  return {
    hist,
    bright: avg((v) => v.bright),
    contrast: avg((v) => v.contrast),
    sat: avg((v) => v.sat),
    colorful: avg((v) => v.colorful),
    edges: avg((v) => v.edges),
    motion: motion === null ? null : round(motion),
  }
}

/* ───────────── Ses ───────────── */

/** Pencere uzunluğu (örnek): 16 kHz'te 32 ms; FFT için 2'nin kuvveti. */
export const AUDIO_WINDOW = 512
/** Bu RMS düzeyinin (dBFS) altındaki pencere sessiz sayılır. */
export const SILENCE_DBFS = -45
const DB_FLOOR = -90

const dbfs = (meanSquare: number) => (meanSquare > 0 ? Math.max(DB_FLOOR, 10 * Math.log10(meanSquare)) : DB_FLOOR)

let hannCache: Float64Array | null = null
const hann = () => {
  if (hannCache) return hannCache
  const w = new Float64Array(AUDIO_WINDOW)
  for (let i = 0; i < AUDIO_WINDOW; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (AUDIO_WINDOW - 1))
  hannCache = w
  return w
}

/** Yerinde, radix-2 FFT (re, im uzunluğu 2'nin kuvveti). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]!
      re[i] = re[j]!
      re[j] = tr
      const ti = im[i]!
      im[i] = im[j]!
      im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const xr = re[b]! * cr - im[b]! * ci
        const xi = re[b]! * ci + im[b]! * cr
        re[b] = re[a]! - xr
        im[b] = im[a]! - xi
        re[a] = re[a]! + xr
        im[a] = im[a]! + xi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

/** Tek pencerenin spektral ağırlık merkezi (Hz); enerji yoksa 0. */
export function spectralCentroid(frame: Float32Array, start: number, sampleRate: number): number {
  const re = new Float64Array(AUDIO_WINDOW)
  const im = new Float64Array(AUDIO_WINDOW)
  const w = hann()
  for (let i = 0; i < AUDIO_WINDOW; i++) re[i] = (frame[start + i] ?? 0) * w[i]!
  fft(re, im)
  let num = 0
  let den = 0
  for (let k = 1; k <= AUDIO_WINDOW / 2; k++) {
    const mag = Math.sqrt(re[k]! * re[k]! + im[k]! * im[k]!)
    num += mag * ((k * sampleRate) / AUDIO_WINDOW)
    den += mag
  }
  return den > 0 ? num / den : 0
}

/**
 * Mono PCM (−1…1) parçasının ses özellikleri. Parça bir pencereden kısaysa tek (sıfırla doldurulmuş) pencere sayılır.
 */
export function audioFeatures(pcm: Float32Array, sampleRate: number): AudioFeatures {
  const windows = Math.max(1, Math.floor(pcm.length / AUDIO_WINDOW))
  let totalSq = 0
  let silent = 0
  let crossings = 0
  let centroidSum = 0
  let voiced = 0
  for (let wi = 0; wi < windows; wi++) {
    const start = wi * AUDIO_WINDOW
    let sq = 0
    for (let i = 0; i < AUDIO_WINDOW; i++) {
      const x = pcm[start + i] ?? 0
      sq += x * x
    }
    totalSq += sq
    if (dbfs(sq / AUDIO_WINDOW) < SILENCE_DBFS) silent++
    else {
      centroidSum += spectralCentroid(pcm, start, sampleRate)
      voiced++
    }
  }
  const len = Math.min(pcm.length, windows * AUDIO_WINDOW)
  for (let i = 1; i < len; i++) if (pcm[i - 1]! >= 0 !== pcm[i]! >= 0) crossings++
  return {
    loud: round(dbfs(totalSq / (windows * AUDIO_WINDOW)), 1),
    silence: round(silent / windows),
    zcr: round(len > 1 ? crossings / (len - 1) : 0, 4),
    centroid: Math.round(Math.min(8000, voiced ? centroidSum / voiced : 0)),
  }
}
