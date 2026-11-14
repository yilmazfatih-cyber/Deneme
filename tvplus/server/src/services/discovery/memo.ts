/** İstek ömürlü önbellek: aynı istekte lolomo / Top 10 bir kez hesaplanır. */
const perRequest = new WeakMap<object, Map<string, unknown>>()

export function requestCache(owner: object): Map<string, unknown> {
  let m = perRequest.get(owner)
  if (!m) perRequest.set(owner, (m = new Map()))
  return m
}

export function memo<T>(cache: Map<string, unknown> | null | undefined, key: string, fn: () => T): T {
  if (!cache) return fn()
  if (cache.has(key)) return cache.get(key) as T
  const v = fn()
  cache.set(key, v)
  return v
}
