/**
 * Kompakt metin çıktısı: lab'ın her komutu bunu kullanır. Amaç az yer tutan ama insanın da okuyabildiği tablolar:
 * sayılar kısaltılır (12.3K, 4.5M), oranlar yüzdeye çevrilir, satır sayısı bütçeyle sınırlanır ve kesildiği söylenir.
 * Ondalık ayırıcı noktadır (çıktıyı ajan da okur; JSON ile aynı yazım).
 */

/** Kısaltılmış sayı: 1234567 → 1.23M · 12345 → 12.3K · 123.4 → 123 · 12.34 → 12.3 · 0.01234 → 0.0123 */
export function num(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '–'
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞'
  const a = Math.abs(x)
  const sign = x < 0 ? '−' : ''
  if (a >= 1e9) return `${sign}${trim((a / 1e9).toPrecision(3))}Mr`
  if (a >= 1e6) return `${sign}${trim((a / 1e6).toPrecision(3))}M`
  if (a >= 1e4) return `${sign}${trim((a / 1e3).toPrecision(3))}K`
  if (Number.isInteger(x)) return `${sign}${a}`
  if (a >= 100) return `${sign}${a.toFixed(0)}`
  if (a >= 10) return `${sign}${trim(a.toFixed(1))}`
  if (a >= 1) return `${sign}${trim(a.toFixed(2))}`
  if (a === 0) return '0'
  return `${sign}${trim(a.toPrecision(3))}`
}
const trim = (s: string): string => (s.includes('.') && !s.includes('e') ? s.replace(/0+$/, '').replace(/\.$/, '') : s)

/** Oran → yüzde: 0.2345 → %23.5 */
export function pct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '–'
  return `%${trim((100 * x).toFixed(digits))}`
}
/** İşaretli yüzde puanı farkı: 0.021 → +2.1p */
export function pp(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '–'
  const v = 100 * x
  return `${v >= 0 ? '+' : '−'}${trim(Math.abs(v).toFixed(digits))}p`
}
/** İşaretli göreli değişim: 0.123 → +%12.3 */
export function rel(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '–'
  return `${x >= 0 ? '+' : '−'}%${trim(Math.abs(100 * x).toFixed(digits))}`
}
/** Çarpan: 2.31 → 2.31x */
export const times = (x: number | null | undefined): string =>
  x === null || x === undefined || Number.isNaN(x) ? '–' : `${trim(x.toFixed(x >= 10 ? 1 : 2))}x`
/** p değeri: 0.00003 → <0.001 */
export const pval = (p: number | null | undefined): string =>
  p === null || p === undefined || Number.isNaN(p) ? '–' : p < 0.001 ? '<0.001' : trim(p.toFixed(3))
/* ── Sayıya Türkçe ek ── */

interface Reading {
  /** Son hecenin ünlüsü */
  v: 'ı' | 'i' | 'u' | 'ü'
  /** Okunuş ünlüyle mi bitiyor (kaynaştırma harfi gerekir) */
  open?: boolean
  /** Okunuş sert ünsüzle mi bitiyor (-ten/-tan) */
  hard?: boolean
}
const DIGIT: Reading[] = [
  { v: 'ı' }, // sıfır
  { v: 'i' }, // bir
  { v: 'i', open: true }, // iki
  { v: 'ü', hard: true }, // üç
  { v: 'ü', hard: true }, // dört
  { v: 'i', hard: true }, // beş
  { v: 'ı', open: true }, // altı
  { v: 'i', open: true }, // yedi
  { v: 'i' }, // sekiz
  { v: 'u' }, // dokuz
]
const TENS: Reading[] = [
  { v: 'ı' },
  { v: 'u' }, // on
  { v: 'i', open: true }, // yirmi
  { v: 'u' }, // otuz
  { v: 'ı', hard: true }, // kırk
  { v: 'i', open: true }, // elli
  { v: 'ı', hard: true }, // altmış
  { v: 'i', hard: true }, // yetmiş
  { v: 'i' }, // seksen
  { v: 'ı' }, // doksan
]

/** Yazılı sayının (ör. "%15.3", "318", "12.3K") okunuşundaki son sözcük. */
function readingOf(text: string): Reading {
  const t = text.trim()
  if (/Mr$/.test(t)) return { v: 'ı' } // milyar
  if (/M$/.test(t)) return { v: 'u' } // milyon
  if (/K$/.test(t)) return { v: 'i' } // bin
  const digits = t.replace(/[^0-9]/g, '')
  if (!digits) return { v: 'i' }
  const last = Number(digits[digits.length - 1])
  // Ondalıklı sayıda ya da sıfırla bitmeyen tam sayıda son rakam okunur
  if (last !== 0 || /[.,]\d+$/.test(t.replace(/^[^0-9]*/, ''))) return DIGIT[last]
  const zeros = digits.length - digits.replace(/0+$/, '').length
  if (zeros === digits.length) return DIGIT[0]
  if (zeros === 1) return TENS[Number(digits[digits.length - 2])]
  if (zeros === 2) return { v: 'ü' } // yüz
  if (zeros <= 5) return { v: 'i' } // bin
  return { v: 'u' } // milyon
}

/**
 * Sayıya okunuşuna uygun ek: ek('%15.3', 'i') → "%15.3'ü" · ek('%27', 'i') → "%27'si" · ek('%39.9', 'de') →
 * "%39.9'unda" · ek('%90', 'e') → "%90'a" · ek('200', 'den') → "200'den".
 * i: iyelik/belirtme (-i, -si) · de: iyelik + bulunma (-inde, -sinde) · e: yönelme · den: ayrılma
 */
export function ek(text: string, kind: 'i' | 'de' | 'e' | 'den'): string {
  const r = readingOf(text)
  const wide = r.v === 'ı' || r.v === 'u' ? 'a' : 'e'
  switch (kind) {
    case 'i':
      return `${text}'${r.open ? 's' : ''}${r.v}`
    case 'de':
      return `${text}'${r.open ? 's' : ''}${r.v}nd${wide}`
    case 'e':
      return `${text}'${r.open ? 'y' : ''}${wide}`
    case 'den':
      return `${text}'${r.hard ? 't' : 'd'}${wide}n`
  }
}

/** Güven aralığı: [lo, hi] biçimleyiciyle */
export const ci = (lo: number, hi: number, f: (x: number) => string = num): string => `[${f(lo)}, ${f(hi)}]`

export type Fmt = 'n' | 'pct' | 'pp' | 'rel' | 'x' | 'p' | 's'
export interface Col<T = Record<string, unknown>> {
  /** Başlık */
  h: string
  /** Değer: alan adı ya da işlev */
  v: (keyof T & string) | ((row: T) => unknown)
  f?: Fmt | ((value: unknown, row: T) => string)
  /** Metin sütunları sola, sayılar sağa yaslanır; elle geçersiz kılmak için */
  align?: 'l' | 'r'
  /** En çok bu kadar karakter (uzun metin … ile kesilir) */
  max?: number
}

function cell<T>(row: T, c: Col<T>): string {
  const raw = typeof c.v === 'function' ? c.v(row) : (row as Record<string, unknown>)[c.v]
  let s: string
  if (typeof c.f === 'function') s = c.f(raw, row)
  else if (raw === null || raw === undefined) s = '–'
  else if (typeof raw === 'string') s = raw
  else if (typeof raw === 'boolean') s = raw ? 'evet' : 'hayır'
  else {
    const x = raw as number
    s =
      c.f === 'pct'
        ? pct(x)
        : c.f === 'pp'
          ? pp(x)
          : c.f === 'rel'
            ? rel(x)
            : c.f === 'x'
              ? times(x)
              : c.f === 'p'
                ? pval(x)
                : num(x)
  }
  if (c.max && s.length > c.max) s = `${s.slice(0, Math.max(1, c.max - 1))}…`
  return s
}

export interface TableOpts {
  /** En çok bu kadar satır yazılır; fazlası "+N satır daha" notuyla kesilir */
  limit?: number
  /** Kesilince gösterilecek ipucu, ör. '--limit 50' */
  more?: string
  indent?: string
}

/** Hizalı düz metin tablo. */
export function table<T>(rows: readonly T[], cols: readonly Col<T>[], opts: TableOpts = {}): string {
  const limit = opts.limit ?? rows.length
  const shown = rows.slice(0, limit)
  const cells = shown.map((r) => cols.map((c) => cell(r, c)))
  const width = cols.map((c, i) => Math.max(c.h.length, ...cells.map((r) => r[i].length)))
  const right = cols.map((c, i) => {
    if (c.align) return c.align === 'r'
    if (c.f && c.f !== 's' && typeof c.f !== 'function') return true
    // Biçimleyicisiz sütun: hücrelerin çoğu sayıya benziyorsa sağa yasla
    const numeric = cells.filter((r) => /^[−+%\-\d.,<∞–]+[KMxp]?r?$/.test(r[i])).length
    return cells.length > 0 && numeric >= cells.length * 0.8
  })
  const indent = opts.indent ?? ''
  const line = (parts: string[]) =>
    indent +
    parts
      .map((s, i) => (right[i] ? s.padStart(width[i]) : i === parts.length - 1 ? s : s.padEnd(width[i])))
      .join('  ')
      .trimEnd()
  const out = [line(cols.map((c) => c.h)), ...cells.map(line)]
  if (rows.length > shown.length)
    out.push(`${indent}… +${rows.length - shown.length} satır daha${opts.more ? ` (${opts.more})` : ''}`)
  return out.join('\n')
}

/** "anahtar: değer · anahtar: değer" tek satır özet. */
export function kv(pairs: Record<string, string | number | null | undefined>): string {
  return Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? num(v) : v}`)
    .join(' · ')
}

/** Metni satır bütçesine sığdırır. */
export function clip(text: string, maxLines: number, more = ''): string {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return text
  return [...lines.slice(0, maxLines), `… +${lines.length - maxLines} satır daha${more ? ` (${more})` : ''}`].join('\n')
}

/** Gün numarası (epoch günü, yerel) → 'YYYY-AA-GG' */
export function dayStr(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10)
}
/** 'YYYY-AA-GG' → gün numarası */
export function dayNum(iso: string): number {
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(t)) throw new Error(`Geçersiz tarih: ${iso} (beklenen YYYY-AA-GG)`)
  return Math.floor(t / 86_400_000)
}

/** Küçük yatay çubuk (metin grafik): değer 0–1 → '▇▇▇▇░░' */
export function bar(share: number, width = 10): string {
  const n = Math.max(0, Math.min(width, Math.round(share * width)))
  return '▇'.repeat(n) + '·'.repeat(width - n)
}

/** Kıvılcım çizgisi: sayı dizisi → '▁▂▄▆█' */
export function spark(values: readonly number[]): string {
  const ticks = '▁▂▃▄▅▆▇█'
  const finite = values.filter((v) => Number.isFinite(v))
  if (!finite.length) return ''
  const lo = Math.min(...finite)
  const hi = Math.max(...finite)
  return values
    .map((v) => (Number.isFinite(v) ? ticks[hi > lo ? Math.round(((v - lo) / (hi - lo)) * 7) : 3] : ' '))
    .join('')
}
