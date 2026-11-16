// Değişmezlik yardımcıları (yapısal paylaşım): bir yolun ucundaki değeri değiştirirken yalnız o yol üzerindeki
// nesneler kopyalanır; geri kalan her dal eski referansıyla paylaşılır. Değer zaten aynıysa nesnenin kendisi döner.
//   setIn({ a: { b: 1 }, c: { d: 2 } }, ['a', 'b'], 5) → { a: { b: 5 }, c: <aynı c nesnesi> }
// Genişletme: Map/Set desteği için `shallowCopy` ve `readKey`'e dal ekleyin.

export type Path = readonly (string | number)[]
type Container = Record<string | number, unknown> | unknown[]

function shallowCopy(value: Container): Container {
  return Array.isArray(value) ? value.slice() : { ...value }
}

function readKey(container: unknown, key: string | number): unknown {
  if (typeof container !== 'object' || container === null) return undefined
  return (container as Record<string | number, unknown>)[key]
}

export function getIn(value: unknown, path: Path): unknown {
  return path.reduce<unknown>((current, key) => readKey(current, key), value)
}

export function setIn<T>(value: T, path: Path, next: unknown): T {
  if (path.length === 0) return next as T
  const [key, ...rest] = path as [string | number, ...(string | number)[]]
  const container: Container =
    typeof value === 'object' && value !== null ? (value as Container) : typeof key === 'number' ? [] : {}
  const child = readKey(container, key)
  const updated = setIn(child, rest, next)
  if (Object.is(updated, child) && Object.prototype.hasOwnProperty.call(container, key)) return value
  const copy = shallowCopy(container) as Record<string | number, unknown>
  copy[key] = updated
  return copy as T
}

export function updateIn<T>(value: T, path: Path, fn: (current: unknown) => unknown): T {
  return setIn(value, path, fn(getIn(value, path)))
}

/** Yolun ucundaki alanı (ya da dizi öğesini) siler; yol yoksa aynı değer döner. */
export function removeIn<T>(value: T, path: Path): T {
  if (path.length === 0) return value
  const parentPath = path.slice(0, -1)
  const key = path[path.length - 1] as string | number
  const parent = getIn(value, parentPath)
  if (typeof parent !== 'object' || parent === null || !Object.prototype.hasOwnProperty.call(parent, key)) return value
  let copy: Container
  if (Array.isArray(parent)) copy = parent.filter((_, i) => i !== Number(key))
  else {
    const { [key]: _removed, ...rest } = parent as Record<string | number, unknown>
    copy = rest
  }
  return setIn(value, parentPath, copy)
}

/** Nesneyi ve tüm iç nesnelerini dondurur (yerinde değiştirme denemesi katı kipte TypeError atar). */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
  return value
}
