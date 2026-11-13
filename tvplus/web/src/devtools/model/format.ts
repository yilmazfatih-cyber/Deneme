/** Panelde kullanılan sayı/zaman biçimleri (Türkçe: ondalık virgül, binlik nokta, 24 saat). */

function dec(n: number, digits: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${dec(ms / 1000, 1)} sn`
}

export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${dec(n / 1024, n < 10 * 1024 ? 1 : 0)} KB`
  if (n < 1024 * 1024 * 1024) return `${dec(n / (1024 * 1024), 1)} MB`
  return `${dec(n / (1024 * 1024 * 1024), 2)} GB`
}

export function fmtKbps(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n >= 10_000) return `${dec(n / 1000, 1)} Mbps`
  return `${dec(Math.round(n), 0)} kbps`
}

/** Kısa hız: 1000 kbps üstü "8,0 Mbps" (dar kartlar için) */
export function fmtRate(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n >= 1000 ? `${dec(n / 1000, 1)} Mbps` : `${Math.round(n)} kbps`
}

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return dec(Math.round(n), 0)
}

export function fmtSec(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${dec(n, 1)} sn`
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}

/** 14:03:22 */
export function fmtClock(at: number): string {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 14:03:22.481 — akış satırları için */
export function fmtClockMs(at: number): string {
  return `${fmtClock(at)}.${pad(new Date(at).getMilliseconds(), 3)}`
}

/** Geri sayım: "45 sn", "11 dk 4 sn", "11 sa 59 dk", "2 gün 3 sa"; geçmişse "süresi doldu". */
export function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'süresi doldu'
  const s = Math.ceil(ms / 1000)
  if (s < 60) return `${s} sn`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} dk ${s % 60} sn`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} sa ${m % 60} dk`
  const d = Math.floor(h / 24)
  return `${d} gün ${h % 24} sa`
}

/** Uzun kimliği kısaltır: "3f50f3b3…" */
export function shortId(id: string | null | undefined, len = 8): string {
  if (!id) return '—'
  return id.length > len ? `${id.slice(0, len)}…` : id
}

/** JSON'u tek satırlık önizlemeye çevirir. */
export function preview(value: unknown, max = 80): string {
  let s: string
  try {
    s = JSON.stringify(value) ?? ''
  } catch {
    s = String(value)
  }
  if (s === '{}' || s === '') return '{}'
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
