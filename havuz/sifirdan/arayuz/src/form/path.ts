// Alan yolları: "adres.il" ya da "telefonlar.0.numara" biçimindeki dizgileri parçalara çevirir; iç içe
// değerleri okur ve değişmez biçimde yazar (yalnız yol üzerindeki nesneler kopyalanır).
// Asıl kaynak: depo/immutable.ts'teki setIn ile aynı fikir; sistemler bağımsız kalsın diye burada kopyası var.
// Genişletme: köşeli ayraç sözdizimi ("telefonlar[0]") gerekirse `parsePath`'e ekleyin.

export type PathPart = string | number

export function parsePath(path: string): PathPart[] {
  if (path === '') return []
  return path.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part))
}

export function joinPath(parts: readonly PathPart[]): string {
  return parts.join('.')
}

export function getPath(value: unknown, path: string | readonly PathPart[]): unknown {
  const parts = typeof path === 'string' ? parsePath(path) : path
  let current = value
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<PathPart, unknown>)[part]
  }
  return current
}

export function setPath<T>(value: T, path: string | readonly PathPart[], next: unknown): T {
  const parts = typeof path === 'string' ? parsePath(path) : path
  if (parts.length === 0) return next as T
  const [head, ...rest] = parts as [PathPart, ...PathPart[]]
  const container =
    typeof value === 'object' && value !== null ? value : ((typeof head === 'number' ? [] : {}) as unknown as T)
  const child = (container as Record<PathPart, unknown>)[head]
  const copy = (Array.isArray(container) ? container.slice() : { ...container }) as Record<PathPart, unknown>
  copy[head] = setPath(child, rest, next)
  return copy as T
}

/** Yapısal eşitlik (dirty hesabı için): düz nesne, dizi ve ilkel değerler. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

/** Değerdeki tüm yaprak yollarını listeler (gönderimde "hepsine dokunuldu" işaretlemek için). */
export function leafPaths(value: unknown, prefix: PathPart[] = [], out: string[] = []): string[] {
  if (typeof value === 'object' && value !== null) {
    const entries = Array.isArray(value) ? value.map((v, i) => [i, v] as const) : Object.entries(value)
    if (entries.length === 0) out.push(joinPath(prefix))
    for (const [key, child] of entries) leafPaths(child, [...prefix, key], out)
  } else out.push(joinPath(prefix))
  return out
}
