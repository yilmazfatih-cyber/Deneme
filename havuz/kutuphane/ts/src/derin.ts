/**
 * derin — derin eşitlik, derin kopya, derin birleştirme ve yol ile okuma/yazma. Döngüsel başvurulara, Date, RegExp,
 * Map, Set ve tipli dizilere dayanıklı; birleştirmede prototip kirletmeye (__proto__) karşı korumalı.
 *
 * Kullanım:
 *   deepEqual({ a: [1, { b: NaN }] }, { a: [1, { b: NaN }] })   // true (NaN kendine eşit sayılır)
 *   const kopya = deepClone(durum)                              // iç içe nesneler paylaşılmaz
 *   deepMerge(varsayilanAyar, kullaniciAyari)                   // yeni nesne; diziler varsayılan olarak değiştirilir
 *   getPath(ayar, 'sunucu.kapilar.0', 8080)                     // yoksa varsayılan
 *   setPath(durum, ['kullanici', 'ad'], 'Ayşe')                 // DEĞİŞTİRMEZ: yeni nesne döndürür
 *
 * Sınırlar: Sınıf örnekleri (Date/RegExp/Map/Set/tipli dizi dışındakiler) kopyalanmaz, başvurusu paylaşılır;
 * işlevler de öyle. deepEqual, sınıf örneklerinde prototipleri aynı olan nesnelerin alanlarını karşılaştırır.
 * Sembol anahtarlar ve getter/setter'lar dikkate alınmaz. +0 ile -0 eşit sayılır.
 *
 * Genişletme: Yeni bir tür desteği (ör. ArrayBuffer) üç işlevde de aynı sırayla bir `if` dalı olarak eklenir;
 * testine döngüsel durum da yazılır.
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}

/** Derin eşitlik. */
export function deepEqual(a: unknown, b: unknown): boolean {
  return equal(a, b, new Map())
}

function equal(a: unknown, b: unknown, seen: Map<object, object>): boolean {
  if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
  if (seen.get(a) === b) return true
  seen.set(a, b)
  if (a instanceof Date) return a.getTime() === (b as Date).getTime()
  if (a instanceof RegExp) return a.source === (b as RegExp).source && a.flags === (b as RegExp).flags
  if (ArrayBuffer.isView(a)) {
    const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
    const y = new Uint8Array(
      (b as ArrayBufferView).buffer,
      (b as ArrayBufferView).byteOffset,
      (b as ArrayBufferView).byteLength,
    )
    return x.length === y.length && x.every((value, i) => value === y[i])
  }
  if (a instanceof Map) {
    const other = b as Map<unknown, unknown>
    if (a.size !== other.size) return false
    for (const [key, value] of a) if (!other.has(key) || !equal(value, other.get(key), seen)) return false
    return true
  }
  if (a instanceof Set) {
    const other = b as Set<unknown>
    if (a.size !== other.size) return false
    for (const value of a) if (!other.has(value)) return false
    return true
  }
  if (Array.isArray(a)) {
    const other = b as unknown[]
    return a.length === other.length && a.every((value, i) => equal(value, other[i], seen))
  }
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  const recordA = a as Record<string, unknown>
  const recordB = b as Record<string, unknown>
  return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && equal(recordA[key], recordB[key], seen))
}

/** Derin kopya (döngüsel başvurular korunur). */
export function deepClone<T>(value: T): T {
  return clone(value, new Map()) as T
}

function clone(value: unknown, seen: Map<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)
  if (value instanceof Date) return new Date(value.getTime())
  if (value instanceof RegExp) return new RegExp(value.source, value.flags)
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return (value as unknown as Uint8Array).slice()
  }
  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>()
    seen.set(value, copy)
    for (const [k, v] of value) copy.set(clone(k, seen), clone(v, seen))
    return copy
  }
  if (value instanceof Set) {
    const copy = new Set<unknown>()
    seen.set(value, copy)
    for (const v of value) copy.add(clone(v, seen))
    return copy
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = []
    seen.set(value, copy)
    for (const item of value) copy.push(clone(item, seen))
    return copy
  }
  if (!isPlainObject(value)) return value // sınıf örneği: başvuru paylaşılır
  const copy: Record<string, unknown> = Object.create(Object.getPrototypeOf(value) as object | null) as Record<
    string,
    unknown
  >
  seen.set(value, copy)
  for (const [k, v] of Object.entries(value)) copy[k] = clone(v, seen)
  return copy
}

/**
 * Düz nesneleri derin birleştirir; YENİ nesne döner (girdiler değişmez). Sonraki kaynak öncekini ezer.
 * `arrays: 'replace'` (varsayılan) diziyi değiştirir, 'concat' uç uca ekler. __proto__/constructor/prototype atlanır.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
  options: { arrays?: 'replace' | 'concat' } = {},
): T {
  const result = deepClone(target) as Record<string, unknown>
  for (const [key, value] of Object.entries(source)) {
    if (FORBIDDEN_KEYS.has(key)) continue
    const current = result[key]
    if (isPlainObject(current) && isPlainObject(value)) result[key] = deepMerge(current, value, options)
    else if (Array.isArray(current) && Array.isArray(value) && options.arrays === 'concat') {
      result[key] = [...(current as unknown[]), ...(deepClone(value) as unknown[])]
    } else result[key] = deepClone(value)
  }
  return result as T
}

function toPath(path: string | readonly (string | number)[]): (string | number)[] {
  if (typeof path !== 'string') return [...path]
  return path === '' ? [] : path.split('.').map((part) => (/^(0|[1-9][0-9]*)$/.test(part) ? Number(part) : part))
}

/** Yoldaki değeri okur: getPath(o, 'a.b.0') ya da getPath(o, ['a', 'b', 0]). Yoksa `fallback`. */
export function getPath(value: unknown, path: string | readonly (string | number)[], fallback?: unknown): unknown {
  let current = value
  for (const part of toPath(path)) {
    if (current === null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
      return fallback
    }
    current = (current as Record<string | number, unknown>)[part]
  }
  return current
}

/** Yoldaki değeri yazılmış YENİ bir kopya döndürür; ara nesne/dizi yoksa oluşturulur (sayı anahtar → dizi). */
export function setPath<T>(value: T, path: string | readonly (string | number)[], newValue: unknown): T {
  const parts = toPath(path)
  if (parts.length === 0) return newValue as T
  const [head, ...rest] = parts as [string | number, ...(string | number)[]]
  if (typeof head === 'string' && FORBIDDEN_KEYS.has(head)) throw new TypeError(`"${head}" anahtarına yazılamaz.`)
  const container: Record<string | number, unknown> | unknown[] = Array.isArray(value)
    ? [...(value as unknown[])]
    : isPlainObject(value)
      ? { ...value }
      : typeof head === 'number'
        ? []
        : {}
  const child = (container as Record<string | number, unknown>)[head]
  ;(container as Record<string | number, unknown>)[head] = rest.length === 0 ? newValue : setPath(child, rest, newValue)
  return container as T
}

/** Nesneyi ve içindekileri dondurur (yanlışlıkla değiştirmeye karşı; geliştirme ortamında yararlı). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
