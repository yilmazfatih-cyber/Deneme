/**
 * fark — iki şeyin farkı: dizi farkı (Myers algoritması; en kısa düzenleme), satır bazlı metin farkı ve GNU
 * biçiminde birleşik fark (unified diff), nesne farkı (derin, yol listesiyle), anahtarlı kayıt listesi farkı.
 *
 * Kullanım:
 *   diffLines('a\nb\nc', 'a\nB\nc')        // [{type:'equal',items:['a']},{type:'delete',items:['b']},{type:'insert',items:['B']},…]
 *   unifiedDiff(eski, yeni, { fromFile: 'eski.txt', toFile: 'yeni.txt' })   // "--- eski.txt\n+++ yeni.txt\n@@ -1,3 +1,3 @@…"
 *   diffObjects({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } })   // [{ path: ['b','c'], kind: 'changed', before: 2, after: 3 }]
 *   diffByKey(eskiListe, yeniListe, (k) => k.id)               // { added, removed, changed, unchanged }
 *
 * Sınırlar: Myers O((N+M)·D) zaman ve bellek kullanır (D = fark sayısı); on binlerce satırlık ve çok farklı iki
 * metinde yavaşlar. Diziler nesne farkında SIRAYLA (indeksle) karşılaştırılır; taşınan öğe "değişti" görünür
 * (taşınmayı görmek için diffByKey). Metin farkında satır sonları "\n"e çevrilir; "dosya sonunda satır sonu yok"
 * işareti yazılmaz.
 *
 * Genişletme: Yeni fark türü `diffSequences` üstüne kurulur; Python eşine (kutuphane/fark.py) aynı eşitlik
 * kuralıyla eklenir ki iki dil aynı farkı versin (vektorler/fark.json).
 */

export type DiffOp<T> = { type: 'equal' | 'delete' | 'insert'; items: T[] }

export interface ObjectChange {
  path: (string | number)[]
  kind: 'added' | 'removed' | 'changed'
  before?: unknown
  after?: unknown
}

/** Myers algoritmasıyla en kısa düzenleme betiği; ardışık aynı türdeki işlemler birleştirilir. */
export function diffSequences<T>(a: readonly T[], b: readonly T[], equals: (x: T, y: T) => boolean = Object.is): DiffOp<T>[] {
  const n = a.length
  const m = b.length
  const max = n + m
  const offset = max + 1
  let v = new Array<number>(2 * max + 3).fill(0)
  const trace: number[][] = []
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0))
      let x = down ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1
      let y = x - k
      while (x < n && y < m && equals(a[x] as T, b[y] as T)) {
        x += 1
        y += 1
      }
      v[offset + k] = x
      if (x >= n && y >= m) break outer
    }
    v = v.slice()
  }
  // Geriye doğru izleyerek işlemleri topla.
  const ops: { type: DiffOp<T>['type']; item: T }[] = []
  let x = n
  let y = m
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d] as number[]
    const k = x - y
    const down = k === -d || (k !== d && (vd[offset + k - 1] ?? 0) < (vd[offset + k + 1] ?? 0))
    const prevK = down ? k + 1 : k - 1
    const prevX = vd[offset + prevK] ?? 0
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', item: a[x - 1] as T })
      x -= 1
      y -= 1
    }
    if (d > 0) {
      if (down) ops.push({ type: 'insert', item: b[y - 1] as T })
      else ops.push({ type: 'delete', item: a[x - 1] as T })
      x = prevX
      y = prevY
    }
  }
  ops.reverse()
  const merged: DiffOp<T>[] = []
  for (const op of ops) {
    const last = merged[merged.length - 1]
    if (last !== undefined && last.type === op.type) last.items.push(op.item)
    else merged.push({ type: op.type, items: [op.item] })
  }
  return merged
}

function splitLines(text: string): string[] {
  if (text === '') return []
  const normalized = text.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  if (normalized.endsWith('\n')) lines.pop()
  return lines
}

/** Satır bazlı metin farkı. */
export function diffLines(a: string, b: string): DiffOp<string>[] {
  return diffSequences(splitLines(a), splitLines(b))
}

function range(start: number, count: number): string {
  if (count === 1) return String(start)
  return `${count === 0 ? start - 1 : start},${count}`
}

/** GNU biçiminde birleşik fark (unified diff); fark yoksa boş metin. */
export function unifiedDiff(a: string, b: string, options: { context?: number; fromFile?: string; toFile?: string } = {}): string {
  const context = options.context ?? 3
  const lines: { tag: ' ' | '-' | '+'; text: string; aLine: number; bLine: number }[] = []
  let aLine = 1
  let bLine = 1
  for (const op of diffLines(a, b)) {
    for (const text of op.items) {
      const tag = op.type === 'equal' ? ' ' : op.type === 'delete' ? '-' : '+'
      lines.push({ tag, text, aLine, bLine })
      if (tag !== '+') aLine += 1
      if (tag !== '-') bLine += 1
    }
  }
  const changed = lines.map((line, i) => (line.tag !== ' ' ? i : -1)).filter((i) => i >= 0)
  if (changed.length === 0) return ''
  const out = [`--- ${options.fromFile ?? 'a'}`, `+++ ${options.toFile ?? 'b'}`]
  let i = 0
  while (i < changed.length) {
    const first = changed[i] as number
    let last = first
    while (i + 1 < changed.length && (changed[i + 1] as number) - last <= 2 * context + 1) last = changed[++i] as number
    i += 1
    const start = Math.max(0, first - context)
    const end = Math.min(lines.length, last + context + 1)
    const hunk = lines.slice(start, end)
    const aCount = hunk.filter((l) => l.tag !== '+').length
    const bCount = hunk.filter((l) => l.tag !== '-').length
    const head = hunk[0]
    const aStart = head?.aLine ?? 1
    const bStart = head?.bLine ?? 1
    out.push(`@@ -${range(aStart, aCount)} +${range(bStart, bCount)} @@`)
    for (const line of hunk) out.push(line.tag + line.text)
  }
  return `${out.join('\n')}\n`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function sameLeaf(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || (typeof a === 'number' && typeof b === 'number' && a === b)
}

/** Derin nesne farkı: yollarıyla eklenen, silinen, değişen alanlar. Diziler indeksle karşılaştırılır. */
export function diffObjects(before: unknown, after: unknown, path: (string | number)[] = []): ObjectChange[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const changes: ObjectChange[] = []
    for (const key of Object.keys(before)) {
      if (!(key in after)) changes.push({ path: [...path, key], kind: 'removed', before: before[key] })
      else changes.push(...diffObjects(before[key], after[key], [...path, key]))
    }
    for (const key of Object.keys(after)) {
      if (!(key in before)) changes.push({ path: [...path, key], kind: 'added', after: after[key] })
    }
    return changes
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const changes: ObjectChange[] = []
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      if (i >= after.length) changes.push({ path: [...path, i], kind: 'removed', before: before[i] })
      else if (i >= before.length) changes.push({ path: [...path, i], kind: 'added', after: after[i] })
      else changes.push(...diffObjects(before[i], after[i], [...path, i]))
    }
    return changes
  }
  return sameLeaf(before, after) ? [] : [{ path, kind: 'changed', before, after }]
}

/** Anahtarlı kayıt listelerinin farkı (ör. id'ye göre): eklenen, silinen, değişen (derin), değişmeyen. */
export function diffByKey<T>(
  before: readonly T[],
  after: readonly T[],
  key: (item: T) => string | number,
): { added: T[]; removed: T[]; changed: { before: T; after: T }[]; unchanged: T[] } {
  const oldMap = new Map(before.map((item) => [key(item), item]))
  const newKeys = new Set(after.map(key))
  const result = { added: [] as T[], removed: [] as T[], changed: [] as { before: T; after: T }[], unchanged: [] as T[] }
  for (const item of after) {
    const old = oldMap.get(key(item))
    if (old === undefined) result.added.push(item)
    else if (diffObjects(old, item).length > 0) result.changed.push({ before: old, after: item })
    else result.unchanged.push(item)
  }
  for (const item of before) if (!newKeys.has(key(item))) result.removed.push(item)
  return result
}
