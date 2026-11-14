/**
 * devbus `detail` alanları `Record<string, unknown>` olarak gelir; bu yardımcılar alanları güvenle okur.
 * Yanlış tipte alan bir istisna değil, yalnızca "yok" sayılır — panel hiçbir yayıncıyı düşürmez.
 */
export type Detail = Record<string, unknown> | undefined

export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

export function str(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

export function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

export function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function field(d: Detail, key: string): unknown {
  return d ? d[key] : undefined
}

/** Saniye mi milisaniye mi belli olmayan zaman damgasını epoch ms'ye çevirir. */
export function toEpochMs(v: unknown): number | null {
  const n = num(v)
  if (n === null) return null
  return n < 1e12 ? n * 1000 : n
}

/** Diziyi en fazla `max` öğeye kırpar (sondakileri tutar). */
export function keepLast<T>(list: T[], max: number): T[] {
  return list.length > max ? list.slice(list.length - max) : list
}
