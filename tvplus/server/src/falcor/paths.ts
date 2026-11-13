/**
 * Falcor yol kümeleri: ayrıştırma, doğrulama ve açma.
 * Anahtar kümesi = anahtar | aralık ({from,to} ya da {from,length}) | bunların dizisi.
 */
import type { FalcorKey, FalcorKeySet, FalcorPath, FalcorRange } from '../../../shared/types'

export class FalcorPathError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const MAX_RANGE = 100_000

function normalizeRange(o: Record<string, unknown>): FalcorRange {
  const from = o.from === undefined ? 0 : o.from
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 0) {
    throw new FalcorPathError('INVALID_PATH', 'Aralığın başlangıcı geçersiz.')
  }
  let to: unknown = o.to
  if (to === undefined && o.length !== undefined) {
    if (typeof o.length !== 'number' || !Number.isInteger(o.length) || o.length < 0) {
      throw new FalcorPathError('INVALID_PATH', 'Aralık uzunluğu geçersiz.')
    }
    to = from + o.length - 1
  }
  if (typeof to !== 'number' || !Number.isInteger(to)) throw new FalcorPathError('INVALID_PATH', 'Aralığın sonu geçersiz.')
  if (to - from > MAX_RANGE) throw new FalcorPathError('PATH_EXPANSION_LIMIT', 'Aralık çok geniş.')
  return { from, to }
}

function normalizeKey(k: unknown): FalcorKey | FalcorRange {
  if (typeof k === 'string') return k
  if (typeof k === 'number') {
    if (!Number.isFinite(k)) throw new FalcorPathError('INVALID_PATH', 'Sayı anahtarı geçersiz.')
    return k
  }
  if (typeof k === 'boolean') return String(k)
  if (k && typeof k === 'object' && !Array.isArray(k)) return normalizeRange(k as Record<string, unknown>)
  throw new FalcorPathError('INVALID_PATH', 'Yol anahtarı geçersiz.')
}

function normalizeKeySet(ks: unknown): FalcorKeySet {
  if (Array.isArray(ks)) {
    if (ks.length === 0) throw new FalcorPathError('INVALID_PATH', 'Boş anahtar kümesi.')
    return ks.map((k) => {
      if (Array.isArray(k)) throw new FalcorPathError('INVALID_PATH', 'İç içe anahtar kümesi desteklenmez.')
      return normalizeKey(k)
    })
  }
  return normalizeKey(ks)
}

/** Ham değeri (JSON'dan gelen) doğrulayıp normalleştirilmiş yol kümesine çevirir. */
export function normalizePathSet(raw: unknown): FalcorPath {
  if (!Array.isArray(raw) || raw.length === 0) throw new FalcorPathError('INVALID_PATH', 'Yol boş olmayan bir dizi olmalı.')
  if (raw.length > 32) throw new FalcorPathError('INVALID_PATH', 'Yol çok uzun.')
  return raw.map(normalizeKeySet)
}

/** `path=<JSON>` dizgesini ayrıştırır. */
export function parsePathString(s: string): FalcorPath {
  let raw: unknown
  try {
    raw = JSON.parse(s)
  } catch {
    throw new FalcorPathError('INVALID_PATH', 'Yol JSON olarak okunamadı.')
  }
  return normalizePathSet(raw)
}

const isRange = (k: FalcorKey | FalcorRange): k is FalcorRange => typeof k === 'object'

/** Bir anahtar kümesinin açılmış anahtarları (aralıklar tamsayılara açılır). */
export function expandKeySet(ks: FalcorKeySet): FalcorKey[] {
  const items = Array.isArray(ks) ? ks : [ks]
  const out: FalcorKey[] = []
  for (const k of items) {
    if (isRange(k)) {
      for (let i = k.from; i <= k.to; i++) out.push(i)
    } else out.push(k)
  }
  return out
}

function keySetSize(ks: FalcorKeySet): number {
  const items = Array.isArray(ks) ? ks : [ks]
  let n = 0
  for (const k of items) n += isRange(k) ? Math.max(0, k.to - k.from + 1) : 1
  return n
}

/** Yol kümesinin yaprak yol sayısı (açmadan hesaplanır). */
export function countLeafPaths(path: FalcorPath): number {
  let n = 1
  for (const ks of path) {
    n *= keySetSize(ks)
    if (n > Number.MAX_SAFE_INTEGER / 2) return Number.MAX_SAFE_INTEGER
  }
  return n
}

/** Yol kümelerini basit yollara açar; toplam `limit`'i aşarsa hata fırlatır. */
export function expandPathSets(paths: FalcorPath[], limit: number): FalcorKey[][] {
  let total = 0
  for (const p of paths) {
    total += countLeafPaths(p)
    if (total > limit) {
      throw new FalcorPathError('PATH_EXPANSION_LIMIT', `İstek çok fazla yol içeriyor (en çok ${limit}).`)
    }
  }
  const out: FalcorKey[][] = []
  for (const p of paths) {
    let acc: FalcorKey[][] = [[]]
    for (const ks of p) {
      const keys = expandKeySet(ks)
      const next: FalcorKey[][] = []
      for (const prefix of acc) for (const k of keys) next.push([...prefix, k])
      acc = next
    }
    out.push(...acc)
  }
  return out
}

/** Tamsayı anahtar mı (sayı ya da "12" gibi dizge)? */
export function asInteger(k: FalcorKey): number | null {
  if (typeof k === 'number') return Number.isInteger(k) ? k : null
  return /^(0|-?[1-9]\d{0,15})$/.test(k) ? Number(k) : null
}
