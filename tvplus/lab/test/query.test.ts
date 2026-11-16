/**
 * Toplu sorgu dili (lab/src/query/query.ts) elle kurulmuş küçük bir tabloda: gruplama (kategorik, eşit dilim, elle
 * sınır), her ölçü, koşullar, sıralama, satır bütçesi ve k-anonimlik. Tablo core/columns.ts ile diske yazılıp geri
 * okunur (TableBuilder → saveTable → loadTable); beklenen değerler testin içindeki düz döngülerle hesaplanır.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Dictionary, loadTable, saveTable, tableExists, tableMeta, TableBuilder, type Table } from '../src/core/columns'
import { quantile } from '../src/core/stats'
import { describeTable, runQuery, type QueryColumn, type QuerySpec, type QueryTable } from '../src/query/query'

const dir = mkdtempSync(join(tmpdir(), 'lab-sorgu-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const CIHAZ = ['bilinmiyor', 'TV', 'MOBIL', 'WEB']
const PLAN = ['bilinmiyor', 'aylik', 'yillik']
const SEHIR = ['bilinmiyor', 'İstanbul', 'Iğdır', 'Ankara']

interface Row {
  uid: number
  cihaz: number
  plan: number
  sehir: number
  dk: number
  hata: number
  puan: number
  bakiye: number
  süre_sn: number
}

/**
 * 12 kullanıcı, 24 satır: kullanıcı u'nun 1 + (u mod 3) satırı vardır.
 *   cihaz  u < 6 → TV (12 satır, 6 kişi) · 6–9 → MOBIL (7 satır, 4 kişi) · 10–11 → WEB (5 satır, 2 kişi)
 *   plan   çift u → aylik, tek u → yillik
 *   dk     10 u + k                         hata   (u + k) mod 3 = 0 ise 2, değilse 0
 *   puan   k = 0 satırlarında eksik (NaN), diğerlerinde 1.5 u
 *   bakiye (u − 5) × 10 − k (negatif değerler)
 */
const ROWS: Row[] = []
for (let u = 0; u < 12; u++)
  for (let k = 0; k < 1 + (u % 3); k++)
    ROWS.push({
      uid: u,
      cihaz: u < 6 ? 1 : u < 10 ? 2 : 3,
      plan: u % 2 === 0 ? 1 : 2,
      sehir: 1 + (u % 3),
      dk: 10 * u + k,
      hata: (u + k) % 3 === 0 ? 2 : 0,
      puan: k === 0 ? NaN : u * 1.5,
      bakiye: (u - 5) * 10 - k,
      süre_sn: (10 * u + k) * 60,
    })

let table: Table
let qt: QueryTable

function wrap(t: Table, withUid = true): QueryTable {
  const cols = new Map<string, QueryColumn>()
  for (const [name, arr] of Object.entries(t.cols)) {
    if (name === 'uid') continue
    cols.set(name, { name, get: (r) => arr[r], dict: t.dicts[name] })
  }
  const uid = t.cols.uid
  return { name: t.name, rows: t.rows, cols, uid: withUid ? (r) => uid[r] : undefined }
}

beforeAll(() => {
  const b = new TableBuilder(
    'deneme',
    [
      { name: 'uid', type: 'u32' },
      { name: 'cihaz', type: 'u8', dict: CIHAZ },
      { name: 'plan', type: 'u8', dict: PLAN },
      { name: 'sehir', type: 'u16', dict: SEHIR },
      { name: 'dk', type: 'f32' },
      { name: 'hata', type: 'u16' },
      { name: 'puan', type: 'f64' },
      { name: 'bakiye', type: 'i32' },
      { name: 'süre_sn', type: 'i32' },
    ],
    // Küçük başlangıç sığası: büyüme yolu da çalışsın
    16,
  )
  for (const row of ROWS) {
    const r = b.addRow()
    for (const [name, value] of Object.entries(row)) b.col(name)[r] = value
  }
  saveTable(dir, b.finish({ kaynak: 'elle' }))
  table = loadTable(dir, 'deneme')
  qt = wrap(table)
})

const q = (spec: Partial<QuerySpec>, k = 1, t: QueryTable = qt): ReturnType<typeof runQuery> =>
  runQuery(t, { group: [], measures: ['n'], where: '', ...spec }, k)

/** Satırları anahtara göre gruplar (başvuru). */
function groupRows(rows: readonly Row[], key: (r: Row) => string): Map<string, Row[]> {
  const out = new Map<string, Row[]>()
  for (const r of rows) {
    const k = key(r)
    const list = out.get(k) ?? []
    list.push(r)
    out.set(k, list)
  }
  return out
}
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)
const users = (rows: readonly Row[]): number => new Set(rows.map((r) => r.uid)).size
const byGroup = (r: ReturnType<typeof runQuery>): Map<string, (number | null)[]> =>
  new Map(r.rows.map((row) => [row.group.join('|'), row.values]))

describe('kolon tablosu: yaz ve geri oku', () => {
  it('satır sayısı, sütun tipleri, değerler, sözlükler ve meta korunur', () => {
    expect(table.name).toBe('deneme')
    expect(table.rows).toBe(24)
    expect(table.meta).toEqual({ kaynak: 'elle' })
    expect(Object.keys(table.cols)).toEqual([
      'uid',
      'cihaz',
      'plan',
      'sehir',
      'dk',
      'hata',
      'puan',
      'bakiye',
      'süre_sn',
    ])
    expect(table.cols.uid).toBeInstanceOf(Uint32Array)
    expect(table.cols.cihaz).toBeInstanceOf(Uint8Array)
    expect(table.cols.sehir).toBeInstanceOf(Uint16Array)
    expect(table.cols.dk).toBeInstanceOf(Float32Array)
    expect(table.cols.puan).toBeInstanceOf(Float64Array)
    expect(table.cols.bakiye).toBeInstanceOf(Int32Array)
    expect(table.dicts).toEqual({ cihaz: CIHAZ, plan: PLAN, sehir: SEHIR })
    ROWS.forEach((row, r) => {
      for (const [name, value] of Object.entries(row)) {
        const got = table.cols[name][r]
        if (Number.isNaN(value)) expect(got).toBeNaN()
        else expect(got, `${name}[${r}]`).toBe(value)
      }
    })
    for (const arr of Object.values(table.cols)) expect(arr).toHaveLength(24)
  })

  it('yalnız istenen sütunlar okunabilir; meta ayrı okunur', () => {
    const part = loadTable(dir, 'deneme', ['dk', 'cihaz'])
    expect(Object.keys(part.cols).sort()).toEqual(['cihaz', 'dk'])
    expect(part.dicts).toEqual({ cihaz: CIHAZ })
    expect(part.rows).toBe(24)
    expect(tableExists(dir, 'deneme')).toBe(true)
    expect(tableExists(dir, 'yok')).toBe(false)
    const meta = tableMeta(dir, 'deneme')
    expect(meta?.rows).toBe(24)
    expect(meta?.columns.map((c) => `${c.name}:${c.type}`)).toEqual([
      'uid:u32',
      'cihaz:u8',
      'plan:u8',
      'sehir:u16',
      'dk:f32',
      'hata:u16',
      'puan:f64',
      'bakiye:i32',
      'süre_sn:i32',
    ])
    expect(meta?.columns.find((c) => c.name === 'plan')?.dict).toEqual(PLAN)
    expect(tableMeta(dir, 'yok')).toBeNull()
  })

  it('aynı adla yeniden yazmak eski sütunları bırakmaz', () => {
    const b = new TableBuilder('gecici', [
      { name: 'a', type: 'u8' },
      { name: 'b', type: 'f64' },
    ])
    for (let i = 0; i < 3; i++) b.col('a')[b.addRow()] = i
    saveTable(dir, b.finish())
    const b2 = new TableBuilder('gecici', [{ name: 'c', type: 'i32' }])
    b2.col('c')[b2.addRow()] = -7
    saveTable(dir, b2.finish())
    expect(existsSync(join(dir, 'gecici', 'a.bin'))).toBe(false)
    const t = loadTable(dir, 'gecici')
    expect(t.rows).toBe(1)
    expect([...t.cols.c]).toEqual([-7])
  })

  it('TableBuilder sığayı aşınca büyür ve değerleri korur; yeni satırlar 0 başlar', () => {
    const b = new TableBuilder('buyuk', [
      { name: 'i', type: 'u32' },
      { name: 'x', type: 'f64' },
      { name: 'bos', type: 'u16' },
    ])
    for (let i = 0; i < 5000; i++) {
      const r = b.addRow()
      expect(r).toBe(i)
      b.col('i')[r] = i
      b.col('x')[r] = i / 7
    }
    expect(b.rows).toBe(5000)
    const t = b.finish()
    expect(t.rows).toBe(5000)
    expect(t.cols.i).toHaveLength(5000)
    for (const i of [0, 1, 15, 16, 17, 1023, 1024, 4999]) {
      expect(t.cols.i[i]).toBe(i)
      expect(t.cols.x[i]).toBe(i / 7)
      expect(t.cols.bos[i]).toBe(0)
    }
  })

  it('Dictionary: kod 0 ayrılmıştır, sınır aşılınca 0 döner', () => {
    const d = new Dictionary('bilinmiyor', 4)
    expect(d.code('a')).toBe(1)
    expect(d.code('b')).toBe(2)
    expect(d.code('a')).toBe(1)
    expect(d.code('c')).toBe(3)
    // Sınır (4 değer: bilinmiyor + 3) doldu
    expect(d.code('d')).toBe(0)
    expect(d.lookup('b')).toBe(2)
    expect(d.lookup('yok')).toBe(0)
    expect(d.values).toEqual(['bilinmiyor', 'a', 'b', 'c'])
    expect(d.size).toBe(4)
    const again = new Dictionary('bilinmiyor', 10, d.values)
    expect(again.lookup('c')).toBe(3)
    expect(again.code('yeni')).toBe(4)
  })
})

describe('gruplama', () => {
  it('kategorik sütun: sözlük adlarıyla, satır sayısına göre azalan', () => {
    const r = q({ group: ['cihaz'], measures: ['n', 'kisi'] })
    expect(r.table).toBe('deneme')
    expect(r.headers).toEqual({ groups: ['cihaz'], measures: ['n', 'kişi'] })
    expect(r.rows).toEqual([
      { group: ['TV'], values: [12, 6], n: 12 },
      { group: ['MOBIL'], values: [7, 4], n: 7 },
      { group: ['WEB'], values: [5, 2], n: 5 },
    ])
    expect(r.matched).toBe(24)
    expect(r.hiddenGroups).toBe(0)
    expect(r.text.split('\n')).toEqual([
      'SORGU · deneme · eşleşen 24 / 24 satır',
      'cihaz   n  kişi',
      'TV     12     6',
      'MOBIL   7     4',
      'WEB     5     2',
    ])
  })

  it('grupsuz sorgu tek satır döner', () => {
    const r = q({ measures: ['n', 'kisi'] })
    expect(r.rows).toEqual([{ group: [], values: [24, 12], n: 24 }])
    // Ölçü verilmezse n
    expect(runQuery(qt, { group: ['plan'], measures: [], where: '' }, 1).headers.measures).toEqual(['n'])
  })

  it('birden çok sütun: her birleşim ayrı grup', () => {
    const r = q({ group: ['cihaz', 'plan'], measures: ['n', 'kisi'] })
    const expected = groupRows(ROWS, (x) => `${CIHAZ[x.cihaz]}|${PLAN[x.plan]}`)
    expect(r.rows).toHaveLength(expected.size)
    const got = byGroup(r)
    for (const [key, rows] of expected) expect(got.get(key), key).toEqual([rows.length, users(rows)])
    expect(sum(r.rows.map((x) => x.n))).toBe(24)
    expect(r.headers.groups).toEqual(['cihaz', 'plan'])
  })

  it('k:4 → dört eşit dilim; sınırlar eşleşen satırların çeyreklikleri, doğal sırada', () => {
    const r = q({ group: ['dk:4'], measures: ['n', 'kisi', 'min(dk)', 'maks(dk)'] })
    const dks = ROWS.map((x) => x.dk)
    const edges = [0.25, 0.5, 0.75].map((p) => quantile(dks, p))
    expect(edges).toEqual([28, 56, 84])
    expect(r.rows.map((x) => x.group[0])).toEqual(['≤ 28', '28–56', '56–84', '> 84'])
    // Dilim: (alt, üst] — sınır değeri alt dilimdedir
    const bucket = (v: number): number => edges.filter((e) => v > e).length
    r.rows.forEach((row, b) => {
      const rows = ROWS.filter((x) => bucket(x.dk) === b)
      expect(row.values).toEqual([
        rows.length,
        users(rows),
        Math.min(...rows.map((x) => x.dk)),
        Math.max(...rows.map((x) => x.dk)),
      ])
      expect(row.n).toBe(6)
    })
    expect(r.headers.groups).toEqual(['dk'])
  })

  it('dilim sayısı 2–20 arasına kırpılır; belirtilmeyen sayısal sütun 4 dilime bölünür', () => {
    expect(q({ group: ['dk:2'] }).rows.map((x) => x.n)).toEqual([12, 12])
    expect(q({ group: ['dk:1'] }).rows).toHaveLength(2)
    expect(q({ group: ['dk:3'] }).rows.map((x) => x.n)).toEqual([8, 8, 8])
    expect(q({ group: ['dk:50'] }).rows).toHaveLength(20)
    expect(q({ group: ['dk'] }).rows.map((x) => x.group[0])).toEqual(['≤ 28', '28–56', '56–84', '> 84'])
  })

  it('dilim sınırları koşuldan SONRA kalan satırlardan hesaplanır', () => {
    const r = q({ group: ['dk:2'], where: 'cihaz=TV' })
    const tv = ROWS.filter((x) => x.cihaz === 1).map((x) => x.dk)
    const med = quantile(tv, 0.5)
    expect(r.rows.map((x) => x.n)).toEqual([tv.filter((v) => v <= med).length, tv.filter((v) => v > med).length])
    expect(r.rows[0].group[0]).toBe(`≤ ${med}`)
  })

  it('yinelenen çeyreklikler tek sınıra iner; sabit sütun tek grup olur', () => {
    // hata yalnız 0 ve 2 değerlerini alır
    const r = q({ group: ['hata:4'], measures: ['n', 'min(hata)', 'maks(hata)'] })
    const groups = byGroup(r)
    expect(sum(r.rows.map((x) => x.n))).toBe(24)
    for (const values of groups.values()) expect(values[1]).toBe(values[2])
    expect(r.rows.length).toBe(2)
    const constant = q({ group: ['dk:4'], where: 'dk=30' })
    expect(constant.rows).toHaveLength(1)
    expect(constant.rows[0].n).toBe(1)
  })

  it('k@a,b → elle sınırlar: (−∞, a], (a, b], (b, ∞)', () => {
    const r = q({ group: ['dk@20,60'], measures: ['n', 'kisi', 'min(dk)', 'maks(dk)'] })
    expect(r.rows).toEqual([
      { group: ['≤ 20'], values: [4, 3, 0, 20], n: 4 },
      { group: ['20–60'], values: [9, 5, 21, 60], n: 9 },
      { group: ['> 60'], values: [11, 5, 70, 112], n: 11 },
    ])
    // Sıra bozuk verilse de sınırlar sıralanır; boşluklar önemsiz
    expect(q({ group: ['dk@60, 20'] }).rows.map((x) => [x.group[0], x.n])).toEqual([
      ['≤ 20', 4],
      ['20–60', 9],
      ['> 60', 11],
    ])
    expect(q({ group: ['dk@50'] }).rows.map((x) => [x.group[0], x.n])).toEqual([
      ['≤ 50', ROWS.filter((x) => x.dk <= 50).length],
      ['> 50', ROWS.filter((x) => x.dk > 50).length],
    ])
    // Negatif ve ondalık sınırlar
    expect(q({ group: ['bakiye@-20.5,0'] }).rows.map((x) => x.n)).toEqual([
      ROWS.filter((x) => x.bakiye <= -20.5).length,
      ROWS.filter((x) => x.bakiye > -20.5 && x.bakiye <= 0).length,
      ROWS.filter((x) => x.bakiye > 0).length,
    ])
  })

  it('kategorik sütun da sayısal dilimle birlikte gruplanabilir', () => {
    const r = q({ group: ['plan', 'dk@50'], measures: ['n'] })
    const expected = groupRows(ROWS, (x) => `${PLAN[x.plan]}|${x.dk <= 50 ? '≤ 50' : '> 50'}`)
    const got = byGroup(r)
    expect(got.size).toBe(expected.size)
    for (const [key, rows] of expected) expect(got.get(key), key).toEqual([rows.length])
  })

  it('Türkçe karakterli sütun adı gruplanır, ölçülür ve süzülür', () => {
    const r = q({ group: ['süre_sn@3000'], measures: ['n', 'ort(süre_sn)'], where: 'süre_sn>=600' })
    const kept = ROWS.filter((x) => x.süre_sn >= 600)
    expect(r.matched).toBe(kept.length)
    expect(r.rows.map((x) => x.n)).toEqual([
      kept.filter((x) => x.süre_sn <= 3000).length,
      kept.filter((x) => x.süre_sn > 3000).length,
    ])
    expect(r.headers).toEqual({ groups: ['süre_sn'], measures: ['n', 'ort(süre_sn)'] })
  })

  it('bilinmeyen sütun ve çok fazla grup anlaşılır hata verir', () => {
    expect(() => q({ group: ['yok'] })).toThrow(/'deneme' tablosunda 'yok' sütunu yok\. Sütunlar: cihaz, plan/)
    // 5000'den çok grup
    const n = 5200
    const codes = Uint16Array.from({ length: n }, (_, i) => i)
    const dict = Array.from({ length: n }, (_, i) => `d${i}`)
    const wide: QueryTable = {
      name: 'genis',
      rows: n,
      cols: new Map([['kod', { name: 'kod', get: (r) => codes[r], dict }]]),
    }
    expect(() => runQuery(wide, { group: ['kod'], measures: ['n'], where: '' }, 1)).toThrow(/Çok fazla grup/)
  })
})

describe('ölçüler', () => {
  const MEASURES = ['n', 'kisi', 'ort(dk)', 'top(dk)', 'oran(hata)', 'p50(dk)', 'p90(dk)', 'min(dk)', 'maks(dk)']

  it('her ölçü, cihaz gruplarında düz döngü başvurusuyla aynı', () => {
    const r = q({ group: ['cihaz'], measures: MEASURES })
    expect(r.headers.measures).toEqual([
      'n',
      'kişi',
      'ort(dk)',
      'top(dk)',
      'oran(hata)',
      'p50(dk)',
      'p90(dk)',
      'min(dk)',
      'maks(dk)',
    ])
    const got = byGroup(r)
    for (const [name, rows] of groupRows(ROWS, (x) => CIHAZ[x.cihaz])) {
      const dk = rows.map((x) => x.dk)
      const values = got.get(name)
      expect(values, name).toBeDefined()
      const [n, kisi, ort, top, oran, p50, p90, min, maks] = values as number[]
      expect(n).toBe(rows.length)
      expect(kisi).toBe(users(rows))
      expect(ort).toBeCloseTo(sum(dk) / dk.length, 12)
      expect(top).toBe(sum(dk))
      expect(oran).toBeCloseTo(rows.filter((x) => x.hata > 0).length / rows.length, 12)
      expect(p50).toBeCloseTo(quantile(dk, 0.5), 12)
      expect(p90).toBeCloseTo(quantile(dk, 0.9), 12)
      expect(min).toBe(Math.min(...dk))
      expect(maks).toBe(Math.max(...dk))
    }
    // Elle doğrulanmış değerler (TV: dk 0, 10, 11, 20, 21, 22, 30, 40, 41, 50, 51, 52)
    expect(got.get('TV')).toEqual([12, 6, 29, 348, 4 / 12, 26, 50.9, 0, 52])
  })

  it('negatif değerler: min / maks / top / ort işaretle çalışır; oran yalnız pozitifleri sayar', () => {
    const r = q({
      measures: ['min(bakiye)', 'maks(bakiye)', 'top(bakiye)', 'ort(bakiye)', 'oran(bakiye)', 'p50(bakiye)'],
    })
    const v = ROWS.map((x) => x.bakiye)
    expect(r.rows[0].values).toEqual([
      Math.min(...v),
      Math.max(...v),
      sum(v),
      sum(v) / v.length,
      v.filter((x) => x > 0).length / v.length,
      quantile(v, 0.5),
    ])
    expect(r.rows[0].values[0]).toBe(-50)
    expect(r.rows[0].values[1]).toBe(60)
  })

  it('max() = maks(), kişi = kisi; boşluklar önemsiz', () => {
    const r = q({ group: ['plan'], measures: [' max( dk ) ', 'kişi', ' n '] })
    expect(r.headers.measures).toEqual(['maks(dk)', 'kişi', 'n'])
    const aylik = ROWS.filter((x) => x.plan === 1)
    expect(byGroup(r).get('aylik')).toEqual([Math.max(...aylik.map((x) => x.dk)), users(aylik), aylik.length])
  })

  it('kişi: tekil kullanıcı sayısı satır sayısından farklıdır; kullanıcı sütunu yoksa boş', () => {
    const r = q({ group: ['plan'], measures: ['n', 'kisi'] })
    for (const row of r.rows) expect(row.values[1]).toBeLessThan(row.values[0] ?? 0)
    expect(sum(r.rows.map((x) => x.values[1] ?? 0))).toBe(12)
    const noUid = q({ group: ['plan'], measures: ['n', 'kisi'] }, 1, wrap(table, false))
    for (const row of noUid.rows) expect(row.values[1]).toBeNull()
    expect(noUid.text).toMatch(/–/)
  })

  it('eksik (NaN) değerler top, min, maks ve yüzdeliklerde atlanır; oran satır payıdır', () => {
    const r = q({ measures: ['n', 'top(puan)', 'min(puan)', 'maks(puan)', 'p50(puan)', 'p90(puan)', 'oran(puan)'] })
    const valid = ROWS.map((x) => x.puan).filter((v) => !Number.isNaN(v))
    expect(valid).toHaveLength(12)
    const [n, top, min, maks, p50, p90, oran] = r.rows[0].values as number[]
    expect(n).toBe(24)
    expect(top).toBe(sum(valid))
    expect(min).toBe(Math.min(...valid))
    expect(maks).toBe(Math.max(...valid))
    expect(p50).toBeCloseTo(quantile(valid, 0.5), 12)
    expect(p90).toBeCloseTo(quantile(valid, 0.9), 12)
    // oran(k): k > 0 olan SATIR payı (eksik değer pozitif sayılmaz)
    expect(oran).toBe(valid.filter((v) => v > 0).length / 24)
    // Hiç geçerli değer yoksa ölçü boş kalır
    const none = q({ measures: ['min(puan)', 'maks(puan)', 'p50(puan)'], where: 'dk=0' })
    expect(none.rows[0].values).toEqual([null, null, null])
  })

  it('ort(): eksik (NaN) değerler ortalamaya girmez (payda yalnız geçerli değerler)', () => {
    // 12 geçerli puanın toplamı 111 → ortalama 9.25; eksik satırları 0 saymak (111 / 24 = 4.625) yanlıştır
    const valid = ROWS.map((x) => x.puan).filter((v) => !Number.isNaN(v))
    const r = q({ measures: ['ort(puan)', 'p50(puan)'] })
    expect(r.rows[0].values[0]).toBeCloseTo(sum(valid) / valid.length, 12)
  })

  it('anlaşılmayan ölçü ve bilinmeyen sütun hata verir', () => {
    expect(() => q({ measures: ['medyan(dk)'] })).toThrow(/Ölçü anlaşılamadı: 'medyan\(dk\)'/)
    expect(() => q({ measures: ['ort()'] })).toThrow(/Ölçü anlaşılamadı/)
    expect(() => q({ measures: ['ort(yok)'] })).toThrow(/'yok' sütunu yok/)
    expect(() => q({ measures: ['dk'] })).toThrow(/Ölçü anlaşılamadı/)
  })
})

describe('koşullar (nerede)', () => {
  const count = (where: string): number => q({ where }).matched
  const expectRows = (where: string, pred: (r: Row) => boolean): void => {
    const r = q({ where, measures: ['n', 'top(dk)'] })
    const kept = ROWS.filter(pred)
    expect(r.matched, where).toBe(kept.length)
    if (kept.length) expect(r.rows[0].values, where).toEqual([kept.length, sum(kept.map((x) => x.dk))])
    else expect(r.rows).toEqual([])
  }

  it('karşılaştırma işleçleri', () => {
    expectRows('dk=30', (x) => x.dk === 30)
    expectRows('dk!=30', (x) => x.dk !== 30)
    expectRows('dk>30', (x) => x.dk > 30)
    expectRows('dk>=30', (x) => x.dk >= 30)
    expectRows('dk<30', (x) => x.dk < 30)
    expectRows('dk<=30', (x) => x.dk <= 30)
    expectRows('bakiye<-20', (x) => x.bakiye < -20)
    expectRows('bakiye >= -1.5', (x) => x.bakiye >= -1.5)
    expectRows('dk>1e3', () => false)
  })

  it('kategorik değerler adla verilir (Türkçe büyük/küçük harf kurallarıyla)', () => {
    expectRows('cihaz=TV', (x) => x.cihaz === 1)
    expectRows('cihaz=tv', (x) => x.cihaz === 1)
    expectRows('cihaz != MOBIL', (x) => x.cihaz !== 2)
    expectRows('cihaz=web', (x) => x.cihaz === 3)
    expectRows('sehir=istanbul', (x) => x.sehir === 1)
    expectRows('sehir=İSTANBUL', (x) => x.sehir === 1)
    expectRows('sehir=ığdır', (x) => x.sehir === 2)
    expectRows('sehir=ANKARA', (x) => x.sehir === 3)
    // 'ISTANBUL' Türkçede 'ıstanbul' olur: İstanbul ile eşleşmez
    expect(() => count('sehir=ISTANBUL')).toThrow(/'sehir' sütununda 'ISTANBUL' değeri yok/)
  })

  it("lab'ın kendi ASCII kodları da küçük harfle yazılabilir (cihaz=mobil → MOBIL)", () => {
    // Cihaz ve içerik sınıfı sözlükleri Türkçe karaktersiz büyük harftir (MOBIL, DIGER, FILM, DIZI, CANLI, KLIP).
    // Yalnız tr-TR küçültmesi 'MOBIL' → 'mobıl' yaptığı için kullanıcının yazdığı 'mobil' eşleşmiyor.
    expectRows('cihaz=mobil', (x) => x.cihaz === 2)
    expectRows('cihaz in (tv|Mobil)', (x) => x.cihaz === 1 || x.cihaz === 2)
  })

  it('in (a|b) ve & ile birleştirme', () => {
    expectRows('cihaz in (TV|web)', (x) => x.cihaz === 1 || x.cihaz === 3)
    expectRows('cihaz in (MOBIL)', (x) => x.cihaz === 2)
    expectRows('hata in (2)', (x) => x.hata === 2)
    expectRows('dk in (0|10|11|999)', (x) => [0, 10, 11].includes(x.dk))
    expectRows('dk>=30 & cihaz=tv', (x) => x.dk >= 30 && x.cihaz === 1)
    expectRows(
      'cihaz in (TV|web) & plan!=yillik & hata=0',
      (x) => (x.cihaz === 1 || x.cihaz === 3) && x.plan !== 2 && x.hata === 0,
    )
    expectRows(' dk > 10 &  dk < 50 & ', (x) => x.dk > 10 && x.dk < 50)
    // Boş koşul her satırı tutar; başlık koşulu yazar
    expect(count('')).toBe(24)
    expect(count('   ')).toBe(24)
    expect(q({ where: 'dk>=30 & cihaz=tv' }).text.split('\n')[0]).toBe(
      'SORGU · deneme · eşleşen 6 / 24 satır · koşul: dk>=30 & cihaz=tv',
    )
  })

  it('koşul gruplamadan önce uygulanır', () => {
    const r = q({ group: ['plan'], measures: ['n', 'ort(dk)'], where: 'dk>=30 & cihaz=tv' })
    const kept = ROWS.filter((x) => x.dk >= 30 && x.cihaz === 1)
    const got = byGroup(r)
    for (const [name, rows] of groupRows(kept, (x) => PLAN[x.plan])) {
      expect(got.get(name)?.[0]).toBe(rows.length)
      expect(got.get(name)?.[1]).toBeCloseTo(sum(rows.map((x) => x.dk)) / rows.length, 12)
    }
    expect(got.size).toBe(2)
  })

  it('anlaşılmayan koşul, bilinmeyen değer ve sayı olmayan değer hata verir', () => {
    expect(() => count('dk ~ 3')).toThrow(/Koşul anlaşılamadı: 'dk ~ 3'/)
    expect(() => count('dk')).toThrow(/Koşul anlaşılamadı/)
    expect(() => count('cihaz=konsol')).toThrow(
      /'cihaz' sütununda 'konsol' değeri yok\. Değerler: bilinmiyor, TV, MOBIL, WEB/,
    )
    expect(() => count('dk=çok')).toThrow(/'dk' sayısal bir sütun; 'çok' sayı değil/)
    expect(() => count('yok=1')).toThrow(/'yok' sütunu yok/)
    expect(() => count('cihaz in (TV|konsol)')).toThrow(/'konsol' değeri yok/)
  })
})

describe('sıralama ve satır bütçesi', () => {
  it('ölçüye göre artan / azalan', () => {
    const names = (sort: string, measures = ['n', 'ort(dk)']): string[] =>
      q({ group: ['cihaz'], measures, sort }).rows.map((x) => x.group[0])
    expect(names('-n')).toEqual(['TV', 'MOBIL', 'WEB'])
    expect(names('n')).toEqual(['WEB', 'MOBIL', 'TV'])
    expect(names('+n')).toEqual(['WEB', 'MOBIL', 'TV'])
    expect(names('-ort(dk)')).toEqual(['WEB', 'MOBIL', 'TV'])
    expect(names('ort(dk)')).toEqual(['TV', 'MOBIL', 'WEB'])
    expect(names('-max(dk)', ['n', 'max(dk)'])).toEqual(['WEB', 'MOBIL', 'TV'])
    expect(names('-maks(dk)', ['n', 'maks(dk)'])).toEqual(['WEB', 'MOBIL', 'TV'])
    expect(names(' -n ')).toEqual(['TV', 'MOBIL', 'WEB'])
  })

  it('sıralama verilmezse: sayısal dilimde doğal sıra, değilse satır sayısına göre azalan', () => {
    expect(q({ group: ['dk@20,60'] }).rows.map((x) => x.group[0])).toEqual(['≤ 20', '20–60', '> 60'])
    // Dilim sıralaması istenirse ölçüye göre bozulabilir
    expect(q({ group: ['dk@20,60'], sort: '-n' }).rows.map((x) => x.group[0])).toEqual(['> 60', '20–60', '≤ 20'])
    const multi = q({ group: ['cihaz', 'plan'] }).rows.map((x) => x.n)
    expect(multi).toEqual([...multi].sort((a, b) => b - a))
  })

  it('ölçüler arasında olmayan sıralama anahtarı hata verir', () => {
    expect(() => q({ group: ['cihaz'], measures: ['n'], sort: '-ort(dk)' })).toThrow(
      /Sıralama ölçüsü 'ort\(dk\)' ölçüler arasında yok: n/,
    )
    expect(() => q({ group: ['cihaz'], measures: ['n'], sort: 'cihaz' })).toThrow(/Sıralama ölçüsü/)
  })

  it('kişi ölçüsüne göre sıralama: ölçü nasıl yazıldıysa sıralama anahtarı da öyle yazılabilir (kisi / kişi)', () => {
    const spec = { group: ['cihaz'], measures: ['kisi', 'n'] }
    expect(q({ ...spec, sort: 'kişi' }).rows.map((x) => x.group[0])).toEqual(['WEB', 'MOBIL', 'TV'])
    // Ölçü listesinde ASCII 'kisi' kabul ediliyor; aynı yazım sıralamada da çalışmalı
    expect(q({ ...spec, sort: '-kisi' }).rows.map((x) => x.group[0])).toEqual(['TV', 'MOBIL', 'WEB'])
  })

  it('limit yalnız metni kısaltır ve kesildiğini söyler; sonuç satırları tamdır', () => {
    const r = q({ group: ['cihaz', 'plan'], limit: 2 })
    const lines = r.text.split('\n')
    expect(lines).toHaveLength(5)
    expect(lines[4]).toBe('… +4 satır daha (--limit N)')
    expect(r.rows).toHaveLength(6)
    // Kesilen satırlar metinde yok
    expect(lines.slice(2, 4).join('\n')).not.toMatch(/WEB/)
    expect(q({ group: ['cihaz', 'plan'], limit: 6 }).text).not.toMatch(/satır daha/)
    // Varsayılan bütçe 20 satır
    const many = q({ group: ['dk:20'] })
    expect(many.rows).toHaveLength(20)
    expect(many.text).not.toMatch(/satır daha/)
    const more = q({ group: ['dk:20', 'plan'] })
    expect(more.rows.length).toBeGreaterThan(20)
    expect(more.text.split('\n')).toHaveLength(2 + 20 + 1)
    expect(more.text).toMatch(new RegExp(`… \\+${more.rows.length - 20} satır daha \\(--limit N\\)`))
  })
})

describe('k-anonimlik', () => {
  it('eşik TEKİL KULLANICI sayısına uygulanır: 5 satırı ama 2 kullanıcısı olan grup k = 3 ile gizlenir', () => {
    const r = q({ group: ['cihaz'], measures: ['n', 'kisi', 'top(bakiye)', 'maks(dk)'] }, 3)
    expect(r.rows).toEqual([
      { group: ['TV'], values: [12, 6, -268, 52], n: 12 },
      { group: ['MOBIL'], values: [7, 4, 176, 90], n: 7 },
    ])
    expect(r.hiddenGroups).toBe(1)
    const lines = r.text.split('\n')
    expect(lines[lines.length - 1]).toBe('1 grup gizlendi (3 kullanıcıdan az: k-anonimlik)')
    // Gizlenen grubun adı ve toplamları (WEB: top(bakiye) = 276, maks(dk) = 112) çıktının hiçbir yerinde yok
    const web = ROWS.filter((x) => x.cihaz === 3)
    expect(web).toHaveLength(5)
    expect(sum(web.map((x) => x.bakiye))).toBe(276)
    const dump = `${r.text}\n${JSON.stringify(r.rows)}`
    expect(dump).not.toMatch(/WEB/)
    expect(dump).not.toMatch(/276/)
    expect(dump).not.toMatch(/112/)
  })

  it('gösterilen her grup en az k kullanıcı içerir (her eşikte)', () => {
    for (const k of [1, 2, 3, 4, 5, 6, 7, 12, 13]) {
      const r = q({ group: ['cihaz'], measures: ['kisi', 'n'] }, k)
      for (const row of r.rows) expect(row.values[0]).toBeGreaterThanOrEqual(k)
      const expected = [...groupRows(ROWS, (x) => CIHAZ[x.cihaz]).values()].filter((rows) => users(rows) >= k).length
      expect(r.rows).toHaveLength(expected)
      expect(r.hiddenGroups).toBe(3 - expected)
      if (expected === 3) expect(r.text).not.toMatch(/gizlendi/)
      else expect(r.text).toMatch(new RegExp(`${3 - expected} grup gizlendi \\(${k} kullanıcıdan az: k-anonimlik\\)`))
    }
  })

  it('çok düzeyli gruplamada küçük hücreler gizlenir', () => {
    const r = q({ group: ['cihaz', 'plan'], measures: ['n', 'kisi'] }, 3)
    const cells = groupRows(ROWS, (x) => `${CIHAZ[x.cihaz]}|${PLAN[x.plan]}`)
    const visible = [...cells].filter(([, rows]) => users(rows) >= 3).map(([key]) => key)
    expect(r.rows.map((x) => x.group.join('|')).sort()).toEqual(visible.sort())
    expect(r.hiddenGroups).toBe(cells.size - visible.length)
    expect(visible).toEqual(['TV|aylik', 'TV|yillik'])
  })

  it('koşul eşiğin altında kullanıcı bırakırsa hiçbir değer dönmez', () => {
    // dk ≥ 100 → yalnız 2 kullanıcının 5 satırı
    const r = q({ measures: ['n', 'ort(dk)', 'maks(dk)'], where: 'dk>=100' }, 3)
    expect(r.rows).toEqual([])
    expect(r.hiddenGroups).toBe(1)
    expect(r.text).toMatch(/1 grup gizlendi/)
    const lines = r.text.split('\n')
    // Başlık ve sütun adları dışında veri satırı yok
    expect(lines).toHaveLength(3)
    expect(lines[1].trim()).toBe('n  ort(dk)  maks(dk)')
  })

  it('kullanıcı sütunu olmayan tabloda eşik satır sayısına uygulanır', () => {
    const r = q({ group: ['cihaz'], measures: ['n'] }, 6, wrap(table, false))
    expect(r.rows.map((x) => x.group[0])).toEqual(['TV', 'MOBIL'])
    expect(r.hiddenGroups).toBe(1)
  })

  it('eşik 1 iken hiçbir grup gizlenmez', () => {
    const r = q({ group: ['cihaz', 'plan', 'sehir'] }, 1)
    expect(r.hiddenGroups).toBe(0)
    expect(sum(r.rows.map((x) => x.n))).toBe(24)
  })
})

describe('tablo özeti', () => {
  it('describeTable kategorik ve sayısal sütunları ayırır, bilinmiyor değerini listelemez', () => {
    const lines = describeTable({ ...qt, note: 'deneme notu' }).split('\n')
    expect(lines[0]).toBe('TABLO · deneme · 24 satır · deneme notu')
    expect(lines[1]).toBe('kategorik: cihaz (TV|MOBIL|WEB), plan (aylik|yillik), sehir (İstanbul|Iğdır|Ankara)')
    expect(lines[2]).toBe('sayısal: dk, hata, puan, bakiye, süre_sn')
    // Kullanıcı sütunu sorguya açılmaz
    expect(lines.join('\n')).not.toMatch(/uid/)
  })
})
