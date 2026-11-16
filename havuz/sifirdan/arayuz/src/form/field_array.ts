// Alan dizileri için yol yeniden eşleme: "telefonlar" dizisinden 1. öğe silinince "telefonlar.2.numara" alanının
// dokunuldu/hata bilgisi "telefonlar.1.numara"ya kaymalıdır. Bu dosya o kaydırmayı saf işlevlerle yapar.
// Ayrıca her dizi öğesine kalıcı bir anahtar (key) verilir: liste yeniden çizilirken giriş kutuları karışmasın.
// Genişletme: "araya ekle" (insert) için `insertMapping` yazıp form.ts'te `arrayInsert` olarak açın.

/** Eski indis → yeni indis (undefined: öğe silindi). */
export type IndexMapping = (oldIndex: number) => number | undefined

export function removeMapping(removed: number): IndexMapping {
  return (i) => (i < removed ? i : i === removed ? undefined : i - 1)
}

export function moveMapping(from: number, to: number, length: number): IndexMapping {
  const order = Array.from({ length }, (_, i) => i)
  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved as number)
  const target = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]))
  return (i) => target.get(i) ?? i
}

/**
 * `key` bu dizinin bir öğesine aitse yeni yolunu döndürür (öğe silindiyse undefined); ilgisizse null.
 * Örnek: remapPath('telefonlar.2.numara', 'telefonlar', removeMapping(1)) → 'telefonlar.1.numara'
 */
export function remapPath(key: string, arrayPath: string, mapping: IndexMapping): string | undefined | null {
  const prefix = arrayPath === '' ? '' : `${arrayPath}.`
  if (!key.startsWith(prefix)) return null
  const rest = key.slice(prefix.length)
  const dot = rest.indexOf('.')
  const head = dot === -1 ? rest : rest.slice(0, dot)
  if (!/^\d+$/.test(head)) return null
  const next = mapping(Number(head))
  if (next === undefined) return undefined
  return `${prefix}${next}${dot === -1 ? '' : rest.slice(dot)}`
}

/** Bir anahtar kümesindeki (Set ya da Map) tüm yolları eşler; silinen öğelerin kayıtları atılır. */
export function remapKeys<V>(
  entries: Map<string, V>,
  arrayPath: string,
  mapping: IndexMapping,
  onDrop?: (value: V) => void,
): Map<string, V> {
  const out = new Map<string, V>()
  for (const [key, value] of entries) {
    const next = remapPath(key, arrayPath, mapping)
    if (next === null) out.set(key, value)
    else if (next === undefined) onDrop?.(value)
    else out.set(next, value)
  }
  return out
}

/** Yol deseni eşleme: '*' bir dizi indisine uyar ('telefonlar.*.numara'). */
export function matchesPattern(pattern: string, path: string): boolean {
  const a = pattern.split('.')
  const b = path.split('.')
  return a.length === b.length && a.every((part, i) => part === b[i] || (part === '*' && /^\d+$/.test(b[i] ?? '')))
}
