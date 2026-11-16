/**
 * Toplu sorgu dili: hazır analizlerin yanıtlamadığı sorular için küçük, güvenli bir "gruplandır ve özetle" aracı.
 *
 *   sorgu anlik --grup cihaz,plan --olc "n,oran(churn),ort(izleme_dk_28)" --nerede "kidem_gun>=30 & cihaz=TV"
 *   sorgu gun --grup "izleme_dk@0,10,60" --olc "n,kisi,oran(errors)" --sirala -n --limit 10
 *
 * Yalnız toplam döner: satır ya da kullanıcı düzeyi veri çıkmaz ve `kAnonim` eşiğinden az kullanıcılı gruplar
 * gizlenir. Ajan için amaç: ham veriyi görmeden, az çıktıyla yeni sorular sorabilmek.
 *
 * Ölçüler   n (satır) · kisi (tekil kullanıcı) · ort(k) · top(k) · oran(k) (k > 0 olan satır payı) · p50(k) · p90(k) ·
 *           min(k) · maks(k)
 * Gruplama  kategorik sütun adı · `k:4` (dört eşit dilim) · `k@0,1,5` (elle sınırlar)
 * Koşullar  `&` ile bağlanır: k=değer · k!=değer · k>3 · k>=3 · k<3 · k<=3 · k in (a|b)
 */
import { num, pct, table, type Col } from '../core/format'
import { quantileSorted } from '../core/stats'

export interface QueryColumn {
  name: string
  get: (row: number) => number
  /** Kategorik sütun: kod → ad */
  dict?: string[]
  /** Kısa açıklama (sütun listesinde gösterilir) */
  note?: string
}

export interface QueryTable {
  name: string
  rows: number
  cols: Map<string, QueryColumn>
  /** Satırın kullanıcısı (k-anonimlik ve `kisi` ölçüsü için); yoksa satır sayısı kullanılır */
  uid?: (row: number) => number
  note?: string
}

export interface QuerySpec {
  group: string[]
  measures: string[]
  where: string
  sort?: string
  limit?: number
}

interface Measure {
  label: string
  fn: 'n' | 'kisi' | 'ort' | 'top' | 'oran' | 'p50' | 'p90' | 'min' | 'maks'
  col: QueryColumn | null
}

interface Grouper {
  label: string
  /** Satır → grup kodu */
  code: (row: number) => number
  name: (code: number) => string
  /** Kodlar doğal sıralı mı (sayısal dilim) */
  ordered: boolean
}

interface Predicate {
  test: (row: number) => boolean
}

/** Ölçü adı karşılaştırması: küçük harf, Türkçe harfler ASCII'ye indirgenmiş (kişi = kisi, maks = MAKS). */
const asciiFold = (s: string): string =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')

/**
 * Kategorik değeri sözlükte bulur: önce birebir, sonra büyük/küçük harf duyarsız. Duyarsız karşılaştırma iki kuralla
 * yapılır: Türkçe (İstanbul = istanbul, Iğdır = ığdır; ISTANBUL ≠ İstanbul) ve düz ASCII (lab'ın kendi kodları:
 * MOBIL = mobil, DIGER = diger). Birden çok eşleşme belirsizdir (−2); hiç yoksa −1.
 */
function lookupValue(dict: readonly string[], text: string): number {
  const exact = dict.indexOf(text)
  if (exact >= 0) return exact
  const tr = text.toLocaleLowerCase('tr-TR')
  const en = text.toLowerCase()
  const hits: number[] = []
  dict.forEach((d, i) => {
    if (d.toLocaleLowerCase('tr-TR') === tr || d.toLowerCase() === en) hits.push(i)
  })
  return hits.length === 1 ? hits[0] : hits.length > 1 ? -2 : -1
}

const colOf = (t: QueryTable, name: string): QueryColumn => {
  const c = t.cols.get(name)
  if (!c) throw new Error(`'${t.name}' tablosunda '${name}' sütunu yok. Sütunlar: ${[...t.cols.keys()].join(', ')}`)
  return c
}

function parseMeasure(t: QueryTable, text: string): Measure {
  const s = text.trim()
  if (s === 'n') return { label: 'n', fn: 'n', col: null }
  if (s === 'kisi' || s === 'kişi') return { label: 'kişi', fn: 'kisi', col: null }
  const m = /^(ort|top|oran|p50|p90|min|maks|max)\(([^)]+)\)$/.exec(s)
  if (!m) throw new Error(`Ölçü anlaşılamadı: '${s}'. Örnek: n, kisi, ort(izleme_dk), oran(churn), p50(kidem_gun)`)
  const fn = (m[1] === 'max' ? 'maks' : m[1]) as Measure['fn']
  return { label: `${fn}(${m[2].trim()})`, fn, col: colOf(t, m[2].trim()) }
}

function parseWhere(t: QueryTable, text: string): Predicate[] {
  const out: Predicate[] = []
  for (const part of text.split('&')) {
    const s = part.trim()
    if (!s) continue
    const inm = /^([\wçğıöşü]+)\s+in\s*\(([^)]*)\)$/i.exec(s)
    if (inm) {
      const c = colOf(t, inm[1])
      const set = new Set(inm[2].split('|').map((v) => valueOf(c, v.trim())))
      out.push({ test: (r) => set.has(c.get(r)) })
      continue
    }
    const m = /^([\wçğıöşü]+)\s*(>=|<=|!=|=|>|<)\s*(.+)$/.exec(s)
    if (!m) throw new Error(`Koşul anlaşılamadı: '${s}'. Örnek: kidem_gun>=30 & cihaz=TV & plan in (aylik|yillik)`)
    const c = colOf(t, m[1])
    const v = valueOf(c, m[3].trim())
    const op = m[2]
    out.push({
      test:
        op === '='
          ? (r) => c.get(r) === v
          : op === '!='
            ? (r) => c.get(r) !== v
            : op === '>'
              ? (r) => c.get(r) > v
              : op === '>='
                ? (r) => c.get(r) >= v
                : op === '<'
                  ? (r) => c.get(r) < v
                  : (r) => c.get(r) <= v,
    })
  }
  return out
}

function valueOf(c: QueryColumn, text: string): number {
  if (c.dict) {
    const i = lookupValue(c.dict, text)
    if (i === -2) throw new Error(`'${c.name}' sütununda '${text}' birden çok değere uyuyor; tam yazın.`)
    if (i < 0)
      throw new Error(`'${c.name}' sütununda '${text}' değeri yok. Değerler: ${c.dict.slice(0, 20).join(', ')}`)
    return i
  }
  const n = Number(text)
  if (!Number.isFinite(n)) throw new Error(`'${c.name}' sayısal bir sütun; '${text}' sayı değil.`)
  return n
}

function makeGrouper(t: QueryTable, text: string, keep: Uint8Array): Grouper {
  const s = text.trim()
  const edgesMatch = /^([\wçğıöşü]+)@(.+)$/.exec(s)
  const binsMatch = /^([\wçğıöşü]+):(\d+)$/.exec(s)
  const name = edgesMatch ? edgesMatch[1] : binsMatch ? binsMatch[1] : s
  const c = colOf(t, name)
  if (c.dict && !edgesMatch && !binsMatch)
    return { label: name, code: (r) => c.get(r), name: (k) => c.dict?.[k] ?? String(k), ordered: false }
  let edges: number[]
  if (edgesMatch)
    edges = edgesMatch[2]
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x))
  else {
    const parts = binsMatch ? Math.max(2, Math.min(20, Number(binsMatch[2]))) : 4
    const vals: number[] = []
    for (let r = 0; r < t.rows; r++) if (keep[r]) vals.push(c.get(r))
    const sorted = Float64Array.from(vals).sort()
    edges = []
    for (let k = 1; k < parts; k++) {
      const e = quantileSorted(sorted, k / parts)
      if (!edges.length || e > edges[edges.length - 1]) edges.push(e)
    }
  }
  edges.sort((a, b) => a - b)
  return {
    label: name,
    code: (r) => {
      const v = c.get(r)
      let b = 0
      while (b < edges.length && v > edges[b]) b++
      return b
    },
    name: (k) =>
      edges.length === 0
        ? 'hepsi'
        : k === 0
          ? `≤ ${num(edges[0])}`
          : k === edges.length
            ? `> ${num(edges[k - 1])}`
            : `${num(edges[k - 1])}–${num(edges[k])}`,
    ordered: true,
  }
}

interface GroupAcc {
  codes: number[]
  n: number
  users: Set<number>
  usersFull: boolean
  sum: Float64Array
  /** Ölçü başına geçerli (NaN olmayan) değer sayısı */
  cnt: Float64Array
  pos: Float64Array
  min: Float64Array
  max: Float64Array
  values: (number[] | null)[]
}

export interface QueryResult {
  table: string
  rows: { group: string[]; values: (number | null)[]; n: number }[]
  headers: { groups: string[]; measures: string[] }
  matched: number
  hiddenGroups: number
  text: string
}

export function runQuery(t: QueryTable, spec: QuerySpec, kAnon: number): QueryResult {
  const measures = (spec.measures.length ? spec.measures : ['n']).map((m) => parseMeasure(t, m))
  const preds = parseWhere(t, spec.where)
  const keep = new Uint8Array(t.rows)
  let matched = 0
  for (let r = 0; r < t.rows; r++) {
    let ok = true
    for (const p of preds) {
      if (!p.test(r)) {
        ok = false
        break
      }
    }
    if (ok) {
      keep[r] = 1
      matched++
    }
  }
  const groupers = spec.group.filter((g) => g.trim()).map((g) => makeGrouper(t, g, keep))
  const M = measures.length
  const groups = new Map<string, GroupAcc>()
  const codes = new Array<number>(groupers.length)
  const DISTINCT_CAP = 200_000
  for (let r = 0; r < t.rows; r++) {
    if (!keep[r]) continue
    for (let g = 0; g < groupers.length; g++) codes[g] = groupers[g].code(r)
    const key = codes.join('|')
    let acc = groups.get(key)
    if (!acc) {
      if (groups.size >= 5000) throw new Error('Çok fazla grup (> 5000). Daha az ya da daha kaba gruplayın.')
      acc = {
        codes: [...codes],
        n: 0,
        users: new Set(),
        usersFull: false,
        sum: new Float64Array(M),
        cnt: new Float64Array(M),
        pos: new Float64Array(M),
        min: new Float64Array(M).fill(Infinity),
        max: new Float64Array(M).fill(-Infinity),
        values: measures.map((m) => (m.fn === 'p50' || m.fn === 'p90' ? [] : null)),
      }
      groups.set(key, acc)
    }
    acc.n++
    if (t.uid && !acc.usersFull) {
      acc.users.add(t.uid(r))
      if (acc.users.size >= DISTINCT_CAP) acc.usersFull = true
    }
    for (let m = 0; m < M; m++) {
      const c = measures[m].col
      if (!c) continue
      const v = c.get(r)
      if (!(v === v)) continue
      acc.sum[m] += v
      acc.cnt[m]++
      if (v > 0) acc.pos[m]++
      if (v < acc.min[m]) acc.min[m] = v
      if (v > acc.max[m]) acc.max[m] = v
      const vals = acc.values[m]
      if (vals && vals.length < 200_000) vals.push(v)
    }
  }
  let hidden = 0
  const rows: QueryResult['rows'] = []
  for (const acc of groups.values()) {
    const people = t.uid ? acc.users.size : acc.n
    if (people < kAnon) {
      hidden++
      continue
    }
    const values = measures.map((m, k): number | null => {
      switch (m.fn) {
        case 'n':
          return acc.n
        case 'kisi':
          return t.uid ? acc.users.size : null
        // Eksik (NaN) değerler ortalamaya girmez: payda yalnız geçerli değerlerdir
        case 'ort':
          return acc.cnt[k] ? acc.sum[k] / acc.cnt[k] : null
        case 'top':
          return acc.sum[k]
        // oran(k): k > 0 olan SATIR payı (eksik değer pozitif sayılmaz)
        case 'oran':
          return acc.n ? acc.pos[k] / acc.n : null
        case 'min':
          return Number.isFinite(acc.min[k]) ? acc.min[k] : null
        case 'maks':
          return Number.isFinite(acc.max[k]) ? acc.max[k] : null
        default: {
          const vals = acc.values[k]
          if (!vals || !vals.length) return null
          return quantileSorted(Float64Array.from(vals).sort(), m.fn === 'p50' ? 0.5 : 0.9)
        }
      }
    })
    rows.push({ group: acc.codes.map((c, g) => groupers[g].name(c)), values, n: acc.n })
  }
  // Sıralama: istenen ölçü; yoksa sayısal dilimde doğal sıra, değilse n azalan
  const sortKey = spec.sort?.trim()
  if (sortKey) {
    const desc = sortKey.startsWith('-')
    const label = sortKey.replace(/^[-+]/, '')
    const want = asciiFold(label.replace(/\s+/g, '').replace(/^max\(/, 'maks('))
    const k = measures.findIndex((m) => asciiFold(m.label) === want)
    if (k < 0)
      throw new Error(`Sıralama ölçüsü '${label}' ölçüler arasında yok: ${measures.map((m) => m.label).join(', ')}`)
    rows.sort((a, b) => ((a.values[k] ?? -Infinity) - (b.values[k] ?? -Infinity)) * (desc ? -1 : 1))
  } else if (groupers.length === 1 && groupers[0].ordered) {
    const order = new Map([...groups.values()].map((a) => [groupers[0].name(a.codes[0]), a.codes[0]]))
    rows.sort((a, b) => (order.get(a.group[0]) ?? 0) - (order.get(b.group[0]) ?? 0))
  } else rows.sort((a, b) => b.n - a.n)

  const cols: Col<QueryResult['rows'][number]>[] = [
    ...groupers.map((g, i): Col<QueryResult['rows'][number]> => ({ h: g.label, v: (r) => r.group[i], max: 40 })),
    ...measures.map((m, i): Col<QueryResult['rows'][number]> => ({
      h: m.label,
      v: (r) => r.values[i],
      f: m.fn === 'oran' ? (v) => (v === null ? '–' : pct(v as number)) : (v) => (v === null ? '–' : num(v as number)),
      align: 'r',
    })),
  ]
  const lines = [
    `SORGU · ${t.name} · eşleşen ${num(matched)} / ${num(t.rows)} satır${spec.where.trim() ? ` · koşul: ${spec.where.trim()}` : ''}`,
    table(rows, cols, { limit: spec.limit ?? 20, more: '--limit N' }),
  ]
  if (hidden) lines.push(`${hidden} grup gizlendi (${kAnon} kullanıcıdan az: k-anonimlik)`)
  return {
    table: t.name,
    rows,
    headers: { groups: groupers.map((g) => g.label), measures: measures.map((m) => m.label) },
    matched,
    hiddenGroups: hidden,
    text: lines.join('\n'),
  }
}

/** Tablonun sütun listesi (kompakt). */
export function describeTable(t: QueryTable): string {
  const cats: string[] = []
  const nums: string[] = []
  for (const c of t.cols.values()) {
    if (c.dict)
      cats.push(
        `${c.name} (${c.dict.length <= 8 ? c.dict.slice(c.dict[0] === 'bilinmiyor' ? 1 : 0).join('|') : `${c.dict.length} değer`})`,
      )
    else nums.push(c.note ? `${c.name} (${c.note})` : c.name)
  }
  return [
    `TABLO · ${t.name} · ${num(t.rows)} satır${t.note ? ` · ${t.note}` : ''}`,
    `kategorik: ${cats.join(', ') || '–'}`,
    `sayısal: ${nums.join(', ') || '–'}`,
  ].join('\n')
}
