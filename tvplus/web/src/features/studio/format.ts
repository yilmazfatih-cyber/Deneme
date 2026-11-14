/**
 * Stüdyo sayı ve tarih biçimleri (Türkçe): 1.497 · %12,4 · 0,618 · 3,2× · 13 Kas 2026 12:28.
 * Saf işlevler; birim testleri format.test.ts.
 */

const intFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0, useGrouping: 'always' })
const decFmts = new Map<number, Intl.NumberFormat>()

function decFmt(digits: number): Intl.NumberFormat {
  let f = decFmts.get(digits)
  if (!f) {
    f = new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: 'always',
    })
    decFmts.set(digits, f)
  }
  return f
}

const DASH = '—'
const ok = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

/** Tam sayı, binlik noktalı: 1497 → "1.497" */
export function fmtInt(n: number | null | undefined): string {
  return ok(n) ? intFmt.format(Math.round(n)) : DASH
}

/** Ondalık, virgüllü: (0.6178, 3) → "0,618" */
export function fmtDec(n: number | null | undefined, digits = 2): string {
  return ok(n) ? decFmt(digits).format(n) : DASH
}

/** 0–1 oranı yüzde olarak: (0.1244) → "%12,4" · (0.5, 0) → "%50" */
export function fmtPct(share: number | null | undefined, digits = 1): string {
  return ok(share) ? `%${decFmt(digits).format(share * 100)}` : DASH
}

/** Kat: 3.23 → "3,2×" */
export function fmtRatio(n: number | null | undefined, digits = 1): string {
  return ok(n) ? `${decFmt(digits).format(n)}×` : DASH
}

/** İşaretli ondalık (katkı çubukları): 0.42 → "+0,42" · −0.1 → "−0,10" */
export function fmtSigned(n: number | null | undefined, digits = 2): string {
  if (!ok(n)) return DASH
  const s = decFmt(digits).format(Math.abs(n))
  if (s === decFmt(digits).format(0)) return s
  return `${n < 0 ? '−' : '+'}${s}`
}

/** Saat: 16687.8 → "16.688 sa" */
export function fmtHours(h: number | null | undefined): string {
  return ok(h) ? `${fmtInt(h)} sa` : DASH
}

/** Saniye → "1:05" / "1:02:03" */
export function fmtClock(sec: number | null | undefined): string {
  if (!ok(sec) || sec < 0) return DASH
  const t = Math.floor(sec)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Süre (ms) → "850 ms" · "3,5 sn" · "2 dk 5 sn" */
export function fmtDuration(ms: number | null | undefined): string {
  if (!ok(ms) || ms < 0) return DASH
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${fmtDec(ms / 1000, 1)} sn`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return s ? `${m} dk ${s} sn` : `${m} dk`
}

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'] as const

function toDate(v: string | number | null | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Tarih (İstanbul saatine göre değil, tarayıcı saatine göre): "13 Kas 2026" */
export function fmtDate(v: string | number | null | undefined): string {
  const d = toDate(v)
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : DASH
}

/** Tarih ve saat: "13 Kas 2026 12:28" */
export function fmtDateTime(v: string | number | null | undefined): string {
  const d = toDate(v)
  if (!d) return DASH
  return `${fmtDate(v)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 'YYYY-MM' → "Kas 26" */
export function fmtMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  if (!m) return ym
  const idx = Number(m[2]) - 1
  return `${MONTHS[idx] ?? m[2]} ${m[1]!.slice(2)}`
}

/**
 * Sayıdan sonra gelen 3. tekil iyelik eki (Türkçe okunuşa göre): 17 → "si" (yedi-si), 55 → "i" (elli beş-i),
 * 40 → "ı" (kırk-ı), 100 → "ü" (yüz-ü). Yalnız tam sayılar için.
 */
export function possessiveSuffix(n: number): string {
  const v = Math.abs(Math.round(n))
  const ones = ['ı', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'] as const
  const tens = ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı'] as const
  if (v === 0) return 'ı'
  const d = v % 10
  if (d !== 0) return ones[d]!
  const t = Math.floor(v / 10) % 10
  if (t !== 0) return tens[t]!
  if (v % 1_000_000 === 0) return 'u' // milyon-u
  if (v % 1000 === 0) return 'i' // bin-i
  return 'ü' // yüz-ü
}

/** "%17'si" — yüzde tam sayıya yuvarlanır ve iyelik eki eklenir. */
export function pctWithSuffix(share: number): string {
  const p = Math.round(share * 100)
  return `%${p}'${possessiveSuffix(p)}`
}

/** Tekil/çoğul gerekmez (Türkçe): "3 başlık" — yalnız sayıyı biçimler. */
export function count(n: number | null | undefined, noun: string): string {
  return `${fmtInt(n)} ${noun}`
}
