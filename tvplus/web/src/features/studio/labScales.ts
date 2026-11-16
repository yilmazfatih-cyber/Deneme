/**
 * Laboratuvar sayfalarının (Kayıp Analizi, Deney Laboratuvarı) saf yardımcıları: sonlu sayı süzgeci, aralık grafiği
 * eksenleri (logaritmik; aykırı değere dayanıklı doğrusal), p değeri / işaretli yüzde / puan / birimli değer biçimleri.
 * Birim testleri lab.test.ts.
 */
import { fmtDate, fmtDec, fmtInt, fmtPct, fmtRatio } from './format'
import { ticks } from './scales'

const DASH = '—'

/**
 * Sonlu sayı ya da null. Sonuç dosyalarında NaN ve ±∞ JSON'a `null` olarak yazılır (ör. kontrol değeri 0 iken göreli
 * fark); sözleşme türleri bunu göstermediği için sayılar çizilmeden önce buradan geçer.
 */
export function fin(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Çoklu karşılaştırma düzeltmeli p için anlamlılık eşiği */
export const ALPHA = 0.05
export const significant = (pAdj: number | null | undefined): boolean => {
  const p = fin(pAdj)
  return p !== null && p < ALPHA
}

/* ───────────── Aralık grafiği eksenleri ───────────── */

export interface AxisRow {
  value: number | null | undefined
  lo: number | null | undefined
  hi: number | null | undefined
}

export interface IntervalAxis {
  kind: 'log' | 'linear'
  min: number
  max: number
  /** Etkisizlik çizgisi: log eksende 1 (kat), doğrusal eksende 0 (fark) */
  reference: number
  ticks: number[]
  /** Değerin eksendeki konumu: 0 sol kenar, 1 sağ kenar. Eksen dışındaki değerler 0'ın altına ya da 1'in üstüne düşer. */
  pos: (v: number) => number
  /** Aykırı bir satır yüzünden eksen daraltıldı mı (dışarıda kalan uçlar grafikte okla gösterilir) */
  clipped: boolean
}

/** Sıralı olmayan dizide q. dilim (0–1), doğrusal ara değerle; boş dizi → 0. */
export function quantile(values: readonly number[], q: number): number {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return 0
  const i = Math.max(0, Math.min(1, q)) * (s.length - 1)
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo)
}

const LOG_STEPS = [1, 2, 5] as const
const LOG_STEPS_FINE = [1, 1.5, 2, 3, 5, 7] as const

function logTicks(min: number, max: number, steps: readonly number[]): number[] {
  const out: number[] = []
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    for (const m of steps) {
      const t = Number((m * 10 ** e).toPrecision(12))
      if (t >= min && t <= max) out.push(t)
    }
  }
  return out
}

/**
 * Oranlar (risk oranı gibi) için logaritmik eksen: tüm aralıkları ve etkisizlik çizgisini (1) kapsar, kenarlarda pay
 * bırakır; eksen değerleri 1–2–5 dizisindendir. Sıfır ya da negatif uçlar eksene girmez (grafikte kenarda kesilir).
 */
export function logAxis(rows: readonly AxisRow[], reference = 1): IntervalAxis {
  const vals = rows.flatMap((r) => [fin(r.value), fin(r.lo), fin(r.hi)]).filter((v): v is number => v !== null && v > 0)
  let lo = Math.min(reference, ...vals)
  let hi = Math.max(reference, ...vals)
  if (lo === hi) {
    lo = reference / 2
    hi = reference * 2
  }
  const pad = Math.max(1.08, (hi / lo) ** 0.05)
  const min = lo / pad
  const max = hi * pad
  let t = logTicks(min, max, LOG_STEPS)
  if (t.length < 3) t = logTicks(min, max, LOG_STEPS_FINE)
  const span = Math.log(max) - Math.log(min)
  return {
    kind: 'log',
    min,
    max,
    reference,
    ticks: t,
    pos: (v) => (v > 0 ? (Math.log(v) - Math.log(min)) / span : Number.NEGATIVE_INFINITY),
    clipped: false,
  }
}

/**
 * Farklar (göreli etki gibi) için doğrusal eksen. Tek bir aykırı satır ekseni ele geçirip öteki aralıkları okunmaz
 * kılmasın diye eksen, satır genişliklerinin %80'lik diliminin 2,5 katında kesilir (en az 4 satır varsa); kesilen
 * satırlar `clipped` ile bildirilir ve grafikte okla, değeri metin sütununda gösterilir. Etkisizlik çizgisi (0) hep içeridedir.
 */
export function linearAxis(rows: readonly AxisRow[], reference = 0, emptySpan = 0.01): IntervalAxis {
  const spans: [number, number][] = []
  for (const r of rows) {
    const vs = [fin(r.value), fin(r.lo), fin(r.hi)].filter((v): v is number => v !== null)
    if (vs.length) spans.push([Math.min(...vs), Math.max(...vs)])
  }
  const extents = spans.map(([a, b]) => Math.max(Math.abs(a - reference), Math.abs(b - reference)))
  const widest = Math.max(0, ...extents)
  let bound = widest
  if (extents.length >= 4) {
    const robust = 2.5 * quantile(extents, 0.8)
    if (robust > 0 && robust < widest) bound = robust
  }
  let min = Math.min(reference, ...spans.map(([a]) => Math.max(a, reference - bound)))
  let max = Math.max(reference, ...spans.map(([, b]) => Math.min(b, reference + bound)))
  if (min === max) {
    min -= emptySpan
    max += emptySpan
  }
  const pad = (max - min) * 0.06
  min -= pad
  max += pad
  const span = max - min
  return {
    kind: 'linear',
    min,
    max,
    reference,
    ticks: ticks(min, max, 5),
    pos: (v) => (v - min) / span,
    clipped: bound < widest,
  }
}

/** Eksen değerlerinin yüzde olarak tam yazılması için gereken ondalık basamak: 0,025 adım → 1 (%2,5). */
export function pctTickDigits(values: readonly number[]): number {
  for (const d of [0, 1, 2]) {
    if (values.every((v) => Math.abs(v * 100 * 10 ** d - Math.round(v * 100 * 10 ** d)) < 1e-6)) return d
  }
  return 2
}

/* ───────────── Biçimler ───────────── */

/** p değeri: 0,34 · 0,012 · < 0,001 */
export function fmtP(p: number | null | undefined): string {
  const v = fin(p)
  if (v === null) return DASH
  if (v < 0.001) return '< 0,001'
  return fmtDec(v, v < 0.1 ? 3 : 2)
}

/** Ondalık sayı; eksi işareti tipografik, sıfıra yuvarlanan değer işaretsiz: −0.0004 → "0,000" · −0.002 → "−0,002" */
export function fmtPlain(v: number | null | undefined, digits = 2): string {
  const x = fin(v)
  if (x === null) return DASH
  const s = fmtDec(Math.abs(x), digits)
  return x < 0 && s !== fmtDec(0, digits) ? `−${s}` : s
}

/** Kat (risk oranı, kaldıraç): 4.153 → "4,15×" · 13.51 → "13,5×" */
export function fmtTimes(v: number | null | undefined): string {
  const x = fin(v)
  if (x === null) return DASH
  return fmtRatio(x, Math.abs(x) >= 10 ? 1 : 2)
}

/** Logaritmik eksen değeri: 0,5× · 1× · 20× */
export function fmtTimesTick(v: number): string {
  return fmtRatio(v, v >= 1 ? (Number.isInteger(v) ? 0 : 1) : v >= 0.1 ? 1 : 2)
}

/** İşaretli yüzde (göreli fark): 0.0085 → "+%0,85" · −0.467 → "−%46,7" · 0 → "%0". Küçük farklarda iki basamak. */
export function fmtSignedPct(v: number | null | undefined, digits?: number): string {
  const x = fin(v)
  if (x === null) return DASH
  const d = digits ?? (Math.abs(x) < 0.1 ? 2 : 1)
  const s = fmtPct(Math.abs(x), d)
  if (s === fmtPct(0, d)) return '%0'
  return `${x < 0 ? '−' : '+'}${s}`
}

/** Yüzde puanı farkı (oran ölçülerinde mutlak fark): 0.0122 → "+1,22 puan" */
export function fmtPoints(v: number | null | undefined, digits = 2): string {
  const x = fin(v)
  if (x === null) return DASH
  const s = fmtDec(Math.abs(x) * 100, digits)
  if (s === fmtDec(0, digits)) return `${s} puan`
  return `${x < 0 ? '−' : '+'}${s} puan`
}

export type LabUnit = 'oran' | 'sayı' | 'dk'

/** Ölçü değeri, birimine göre: oran → %19,1 (küçük oranlarda %1,49) · dk → 262,4 dk · sayı → 4,19 */
export function fmtUnit(v: number | null | undefined, unit: LabUnit): string {
  const x = fin(v)
  if (x === null) return DASH
  if (unit === 'oran') return fmtPct(x, Math.abs(x) < 0.1 ? 2 : 1)
  if (unit === 'dk') return `${fmtDec(x, 1)} dk`
  const a = Math.abs(x)
  return a >= 1000 ? fmtInt(x) : fmtDec(x, a >= 100 ? 1 : a >= 0.1 || a === 0 ? 2 : 3)
}

/**
 * Ölçü farkı, birimine göre: oran → "+1,22 puan" · dk → "+4,2 dk" · sayı → "+0,05". `scale` verilirse basamak sayısı
 * ona göre seçilir (bir satırdaki fark ve aralık uçları aynı basamakla yazılsın diye en büyük mutlak değer verilir).
 */
export function fmtUnitDiff(v: number | null | undefined, unit: LabUnit, scale?: number): string {
  const x = fin(v)
  if (x === null) return DASH
  if (unit === 'oran') return fmtPoints(x)
  const a = Math.abs(x)
  const ref = Math.abs(fin(scale) ?? x)
  const digits = unit === 'dk' ? 1 : ref >= 100 ? 1 : ref >= 0.1 || ref === 0 ? 2 : 3
  const s = fmtDec(a, digits)
  const body = s === fmtDec(0, digits) ? s : `${x < 0 ? '−' : '+'}${s}`
  return unit === 'dk' ? `${body} dk` : body
}

/** Aralık metni: "[3,55; 4,85]" (ondalık virgülle karışmasın diye noktalı virgül) */
export function fmtInterval(
  lo: number | null | undefined,
  hi: number | null | undefined,
  fmt: (v: number) => string,
): string {
  const a = fin(lo)
  const b = fin(hi)
  return a === null || b === null ? '' : `[${fmt(a)}; ${fmt(b)}]`
}

/** 'YYYY-AA-GG' (yerel gün) → "14 Tem 2026". Saat dilimi günü kaydırmasın diye yerel öğlen olarak okunur. */
export function fmtDay(ymd: string | null | undefined): string {
  return ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? fmtDate(`${ymd}T12:00:00`) : (ymd ?? DASH)
}

/** Bilgi değerinin (BD) sözlü karşılığı: < 0,02 zayıf · 0,02–0,1 orta · > 0,1 güçlü */
export function ivStrength(iv: number | null | undefined): 'zayıf' | 'orta' | 'güçlü' | null {
  const x = fin(iv)
  if (x === null) return null
  return x < 0.02 ? 'zayıf' : x <= 0.1 ? 'orta' : 'güçlü'
}
