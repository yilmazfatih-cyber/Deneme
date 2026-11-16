/**
 * Sorgulanabilir tablolar: lab tabloları `QueryTable` arayüzüne sarılır. Türetilmiş sütunlar (dakika, churn etiketi)
 * ve kullanıcı boyutları eklenir. Takma kimlik sütunları (uid_hi / uid_lo) sorguya AÇILMAZ.
 */
import type { ChurnDefinition } from '../../../shared/lab'
import { labelUsers, loadChurnData, type ChurnData } from '../churn/data'
import { chooseDefinition } from '../churn/definition'
import { buildFrame, FEATURES } from '../churn/features'
import { loadTable, tableExists, type NumArray, type Table } from '../core/columns'
import type { Lab } from '../core/lab'
import type { QueryColumn, QueryTable } from './query'

export const QUERY_TABLES = ['anlik', 'kullanici', 'gun', 'oturum', 'baslik'] as const
export type QueryTableName = (typeof QUERY_TABLES)[number]

const HIDDEN = new Set([
  'uid_hi',
  'uid_lo',
  'day_from',
  'day_to',
  'sess_from',
  'sess_to',
  'fact_from',
  'fact_to',
  'uid',
  'tuple',
  'main_tid',
])

function wrap(t: Table, extra: QueryColumn[] = []): Map<string, QueryColumn> {
  const cols = new Map<string, QueryColumn>()
  for (const [name, arr] of Object.entries(t.cols)) {
    if (HIDDEN.has(name)) continue
    const a: NumArray = arr
    cols.set(name, { name, get: (r) => a[r], dict: t.dicts[name] })
  }
  for (const c of extra) cols.set(c.name, c)
  return cols
}

/** Kullanıcı boyutlarını (dim_*) satırın kullanıcısı üzerinden kategorik sütun olarak ekler. */
function userDims(d: ChurnData, uidOf: (row: number) => number): QueryColumn[] {
  const out: QueryColumn[] = []
  for (const [name, arr] of Object.entries(d.users.cols)) {
    if (!name.startsWith('dim_')) continue
    const a: NumArray = arr
    out.push({ name: name.slice(4), get: (r) => a[uidOf(r)], dict: d.users.dicts[name] })
  }
  return out
}

export function openQueryTable(lab: Lab, name: string, def?: ChurnDefinition): QueryTable {
  if (!(QUERY_TABLES as readonly string[]).includes(name))
    throw new Error(`Böyle bir tablo yok: ${name}. Tablolar: ${QUERY_TABLES.join(', ')}`)
  if (name === 'baslik') {
    if (!tableExists(lab.tableDir, 'baslik')) throw new Error('Tablolar kurulmamış. Önce: npm run lab -- kur')
    const t = loadTable(lab.tableDir, 'baslik')
    const watch = t.cols.watch_sec
    const plays = t.cols.plays
    const comp = t.cols.completions
    return {
      name,
      rows: t.rows,
      note: 'başlık başına satır (dizi bölümleri diziye toplanmış)',
      cols: wrap(t, [
        { name: 'izleme_saat', get: (r) => watch[r] / 3600 },
        { name: 'tamamlama', get: (r) => (plays[r] > 0 ? comp[r] / plays[r] : 0), note: 'tamamlama / oynatma' },
      ]),
    }
  }
  const d = loadChurnData(lab)
  const definition = def ?? chooseDefinition(d)
  if (name === 'kullanici') {
    const labels = labelUsers(d, definition.n, definition.activity)
    const watch = d.users.cols.watch_sec
    const cols = wrap(d.users, [
      {
        name: 'churn',
        get: (r) => labels.churned[r],
        note: `1 = pencere sonunda gitmiş (${definition.n} gün etkinlik yok)`,
      },
      { name: 'hic_etkin_degil', get: (r) => labels.never[r] },
      { name: 'izleme_dk', get: (r) => watch[r] / 60 },
      {
        name: 'omur_gun',
        get: (r) => (labels.first[r] >= 0 ? labels.last[r] - labels.first[r] + 1 : 0),
        note: 'ilk–son etkin gün arası',
      },
    ])
    // dim_* sütunları kısa adlarıyla da erişilir
    for (const c of userDims(d, (r) => r)) cols.set(c.name, c)
    for (const k of [...cols.keys()]) if (k.startsWith('dim_')) cols.delete(k)
    return { name, rows: d.n, cols, uid: (r) => r, note: 'kullanıcı başına satır' }
  }
  if (name === 'gun') {
    const uid = d.days.cols.uid
    const watch = d.days.cols.watch_sec
    const day = d.dDay
    const cols = wrap(d.days, [
      { name: 'izleme_dk', get: (r) => watch[r] / 60 },
      // 1970-01-01 Perşembe: (gün + 3) mod 7 → 0 = Pazartesi
      {
        name: 'haftanin_gunu',
        get: (r) => (((day[r] + 3) % 7) + 7) % 7,
        dict: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
      },
      { name: 'gun_no', get: (r) => day[r] - d.dayMin, note: 'pencere başından gün' },
      ...userDims(d, (r) => uid[r]),
    ])
    return { name, rows: d.days.rows, cols, uid: (r) => uid[r], note: 'kullanıcı × gün (olayı olan günler)' }
  }
  if (name === 'oturum') {
    const t = loadTable(lab.tableDir, 'oturum')
    const uid = t.cols.uid
    const watch = t.cols.watch_sec
    const start = t.cols.start_ts
    const tz = lab.settings.tzDakika * 60
    const cols = wrap(t, [
      { name: 'izleme_dk', get: (r) => watch[r] / 60 },
      {
        name: 'saat',
        get: (r) => Math.floor(((((start[r] + tz) % 86_400) + 86_400) % 86_400) / 3600),
        note: 'yerel başlangıç saati',
      },
      ...userDims(d, (r) => uid[r]),
    ])
    cols.delete('start_ts')
    return { name, rows: t.rows, cols, uid: (r) => uid[r], note: 'oturum başına satır' }
  }
  // anlik: churn modelinin özellik çerçevesi
  const frame = buildFrame(d, definition)
  const P = FEATURES.length
  const cols = new Map<string, QueryColumn>()
  FEATURES.forEach((f, j) => cols.set(f.key, { name: f.key, get: (r) => frame.X[r * P + j], note: f.label }))
  cols.set('churn', {
    name: 'churn',
    get: (r) => frame.y[r],
    note: `1 = sonraki ${definition.n} günde hiç etkin değil`,
  })
  cols.set('anlik_gun', {
    name: 'anlik_gun',
    get: (r) => frame.snap[r] - d.dayMin,
    note: 'anlık görüntünün pencere başından günü',
  })
  for (const c of frame.cats) cols.set(c.key, { name: c.key, get: (r) => c.codes[r], dict: c.dict })
  return {
    name,
    rows: frame.rows,
    cols,
    uid: (r) => frame.uid[r],
    note: `anlık görüntü × etkin kullanıcı (özellikler son ${frame.lookback} günden; churn = sonraki ${definition.n} gün)`,
  }
}
