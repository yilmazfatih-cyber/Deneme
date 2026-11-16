/**
 * Churn analizlerinin ortak veri erişimi: tablolar belleğe bir kez alınır; etkinlik tanımına göre kullanıcı başına
 * etkin gün dizileri, churn etiketi ve gün düzeyi boyutlar buradan türetilir.
 */
import { join } from 'node:path'
import type { ChurnDefinition, LabDataStatus } from '../../../shared/lab'
import { loadTable, tableExists, type Table } from '../core/columns'
import { dayStr } from '../core/format'
import { readJson, type Lab } from '../core/lab'
import type { BuildMeta } from '../data/build'

export interface TupleFile {
  dimNames: string[]
  dimValues: string[][]
  tuples: number[][]
}

export interface ChurnData {
  meta: BuildMeta
  users: Table
  days: Table
  tuples: TupleFile
  /** Kullanıcı sayısı */
  n: number
  /** Veri penceresi (yerel gün numaraları, dahil) */
  dayMin: number
  dayMax: number
  // Sık kullanılan sütunlar
  dayFrom: Uint32Array
  dayTo: Uint32Array
  dDay: Int32Array
  dActive: Uint8Array
  dSessions: Uint16Array
}

export function loadMeta(lab: Lab): BuildMeta | null {
  return readJson<BuildMeta>(join(lab.tableDir, 'meta.json'))
}

export function statusOf(meta: BuildMeta): LabDataStatus {
  return {
    ready: true,
    synthetic: meta.synthetic,
    sample: meta.sample,
    users: meta.users,
    events: meta.events,
    userDays: meta.userDays,
    sessions: meta.sessions,
    titles: meta.titles,
    from: dayStr(meta.dayMin),
    to: dayStr(meta.dayMax),
    days: meta.dayMax - meta.dayMin + 1,
    dataRev: meta.dataRev,
    builtAt: meta.builtAt,
    dims: meta.dimNames,
    kinds: meta.kinds,
  }
}

export function loadChurnData(lab: Lab): ChurnData {
  const meta = loadMeta(lab)
  if (!meta || !tableExists(lab.tableDir, 'kullanici') || !tableExists(lab.tableDir, 'gun'))
    throw new Error('Tablolar kurulmamış. Önce: npm run lab -- kur (veri yoksa: npm run lab -- demo)')
  const users = loadTable(lab.tableDir, 'kullanici')
  const days = loadTable(lab.tableDir, 'gun')
  const tuples = readJson<TupleFile>(join(lab.tableDir, 'demet.json')) ?? { dimNames: [], dimValues: [], tuples: [[]] }
  return {
    meta,
    users,
    days,
    tuples,
    n: users.rows,
    dayMin: meta.dayMin,
    dayMax: meta.dayMax,
    dayFrom: users.cols.day_from as Uint32Array,
    dayTo: users.cols.day_to as Uint32Array,
    dDay: days.cols.day as Int32Array,
    dActive: days.cols.active as Uint8Array,
    dSessions: days.cols.sessions as Uint16Array,
  }
}

export type Activity = ChurnDefinition['activity']

/** Gün satırı bu etkinlik tanımına göre etkin mi */
export function isActiveRow(d: ChurnData, row: number, activity: Activity): boolean {
  return activity === 'izleme' ? d.dActive[row] === 1 : d.dSessions[row] > 0
}

export interface Labels {
  /** Kullanıcının ilk ve son etkin günü (−1 → hiç etkin olmadı) */
  first: Int32Array
  last: Int32Array
  /** 1: churn etti (son etkin günden beri ≥ n gün ve pencere bunu görmeye yetiyor) */
  churned: Uint8Array
  /** 1: hiç etkin günü yok */
  never: Uint8Array
  activeDays: Uint16Array
}

/** Pencere sonundaki durum etiketi. */
export function labelUsers(d: ChurnData, n: number, activity: Activity): Labels {
  const first = new Int32Array(d.n).fill(-1)
  const last = new Int32Array(d.n).fill(-1)
  const churned = new Uint8Array(d.n)
  const never = new Uint8Array(d.n)
  const activeDays = new Uint16Array(d.n)
  for (let u = 0; u < d.n; u++) {
    let cnt = 0
    for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
      if (!isActiveRow(d, r, activity)) continue
      if (first[u] < 0) first[u] = d.dDay[r]
      last[u] = d.dDay[r]
      cnt++
    }
    activeDays[u] = Math.min(65_535, cnt)
    if (cnt === 0) never[u] = 1
    else if (d.dayMax - last[u] >= n) churned[u] = 1
  }
  return { first, last, churned, never, activeDays }
}

/** Boyut demetinden bir boyutun kodu. */
export function dimCode(d: ChurnData, tuple: number, dim: number): number {
  const t = d.tuples.tuples[tuple]
  return t ? (t[dim] ?? 0) : 0
}
