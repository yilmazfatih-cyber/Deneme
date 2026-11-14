/**
 * Kalıcılık: bellek içi dosya sisteminde `/data` (sunucunun dataDir'i) altındaki her değişiklik IndexedDB'ye yazılır;
 * açılışta hepsi geri yüklenir. Böylece oturum, profiller, Listem, yer imleri, izleme verisi ve eğitilmiş model
 * yenilemede korunur.
 *
 * İki ayrı veritabanı:
 *  - durum: küçük dosyalar (oturum, profiller, Listem, yer imleri, model). Değişiklik, onu yapan görev biterken yazılır
 *    (zamanlayıcı yok: worker arka plan işleriyle meşgulken zamanlayıcılar gecikir, sekme her an kapanabilir).
 *  - toplu: izleme olay günlükleri ve gömme önbelleği (onlarca MB). Gecikmeli ve parça parça yazılır.
 * Tarayıcı bir veritabanındaki yazımları sıraya dizer; ayrı veritabanları sayesinde açılışta yazılan büyük örnek veri,
 * kullanıcının az önceki değişikliğinin kaydını bekletmez.
 */
import { onChange, seedFile, snapshotFile } from '../node/fs'

export const DATA_ROOT = '/data'

const STATE = 'durum'
const BULK = 'toplu'
const KINDS = [STATE, BULK] as const
type Kind = (typeof KINDS)[number]
const DB_NAMES: Record<Kind, string> = { [STATE]: 'tvplus-durum', [BULK]: 'tvplus-toplu' }
const OBJECT_STORE = 'parcalar'
/**
 * Dosyalar en çok PART_BYTES'lık kayıtlara bölünür. Chrome büyük değerleri ayrı blob dosyaları olarak yazar ve
 * SharedWorker yazım sürerken kapatılınca (sekme yenilendi) tarayıcı süreci çökebiliyor; küçük kayıtlarda bu yol
 * hiç kullanılmaz. Anahtar: `<yol>\u0000<sıra (5 hane)>`.
 */
const PART_BYTES = 48 * 1024
const SEP = '\u0000'
const partKey = (path: string, i: number): string => `${path}${SEP}${String(i).padStart(5, '0')}`
const pathRange = (path: string): IDBKeyRange => IDBKeyRange.bound(`${path}${SEP}`, `${path}\u0001`, false, true)

const BULK_RE = /^\/data\/(viewing|embeddings)\//
const kindOf = (path: string): Kind => (BULK_RE.test(path) ? BULK : STATE)

const BULK_DEBOUNCE_MS = 400
const BULK_MAX_WAIT_MS = 2500
/** Toplu veri bu boyutta işlemlere bölünür (tek dev işlem tarayıcıyı uzun süre meşgul eder). */
const BULK_TX_BYTES = 8 * 1024 * 1024

interface Row {
  path: string
  bytes: Uint8Array
  mtimeMs: number
}

interface PartRow {
  k: string
  path: string
  i: number
  /** toplam parça sayısı */
  n: number
  bytes: Uint8Array
  mtimeMs: number
}

type Op = [string, 'write' | 'delete']

const dbs: Partial<Record<Kind, Promise<IDBDatabase | null>>> = {}

function openDb(kind: Kind): Promise<IDBDatabase | null> {
  dbs[kind] ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAMES[kind], 1)
    } catch {
      return resolve(null)
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(OBJECT_STORE))
        req.result.createObjectStore(OBJECT_STORE, { keyPath: 'k' })
    }
    req.onsuccess = () => resolve(req.result)
    // Gizli pencere / engellenmiş depolama: kalıcılık olmadan sürdür.
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbs[kind]
}

let report: ((msg: string) => void) | null = null

/** Yazım günlüğü (tanılama: `?gunluk` ile sayfa konsoluna düşer). */
export function onPersistLog(fn: (msg: string) => void): void {
  report = fn
}

/** Kayıtlı tüm dosyaları bellek içi dosya sistemine yükler. */
export async function restore(): Promise<{ files: number; bytes: number; available: boolean }> {
  let files = 0
  let bytes = 0
  let available = false
  await Promise.all(
    KINDS.map(async (kind) => {
      const db = await openDb(kind)
      if (!db) return
      available = true
      await new Promise<void>((resolve) => {
        const tx = db.transaction(OBJECT_STORE, 'readonly')
        const req = tx.objectStore(OBJECT_STORE).openCursor()
        // Anahtarlar sıralı gelir: bir dosyanın parçaları ardışıktır.
        let cur: { path: string; n: number; mtimeMs: number; parts: Uint8Array[] } | null = null
        const finish = () => {
          if (!cur) return
          if (cur.parts.length === cur.n && cur.path.startsWith(`${DATA_ROOT}/`)) {
            const total = cur.parts.reduce((a, p) => a + p.length, 0)
            const all = new Uint8Array(total)
            let off = 0
            for (const p of cur.parts) {
              all.set(p, off)
              off += p.length
            }
            seedFile(cur.path, all, cur.mtimeMs)
            files++
            bytes += total
          }
          cur = null
        }
        req.onsuccess = () => {
          const c = req.result
          if (!c) return finish()
          const row = c.value as PartRow
          if (!cur || cur.path !== row.path) {
            finish()
            cur = { path: row.path, n: row.n, mtimeMs: row.mtimeMs, parts: [] }
          }
          if (row.i === cur.parts.length) cur.parts.push(row.bytes)
          c.continue()
        }
        tx.oncomplete =
          tx.onerror =
          tx.onabort =
            () => {
              finish()
              resolve()
            }
      })
    }),
  )
  return { files, bytes, available }
}

const dirty: Record<Kind, Map<string, Op[1]>> = { [STATE]: new Map(), [BULK]: new Map() }
const chain: Record<Kind, Promise<void>> = { [STATE]: Promise.resolve(), [BULK]: Promise.resolve() }
let stateQueued = false
let stateInflight = 0
let bulkTimer: ReturnType<typeof setTimeout> | null = null
let bulkFirstDirtyAt = 0
let warned = false

function schedule(kind: Kind): void {
  if (kind === STATE) {
    if (stateQueued) return
    stateQueued = true
    queueMicrotask(() => {
      stateQueued = false
      void flushKind(STATE)
    })
    return
  }
  const now = Date.now()
  if (!bulkFirstDirtyAt) bulkFirstDirtyAt = now
  if (bulkTimer) clearTimeout(bulkTimer)
  const wait = Math.max(0, Math.min(BULK_DEBOUNCE_MS, bulkFirstDirtyAt + BULK_MAX_WAIT_MS - now))
  bulkTimer = setTimeout(() => void flushKind(BULK), wait)
}

function flushKind(kind: Kind): Promise<void> {
  if (kind === BULK) {
    if (bulkTimer) clearTimeout(bulkTimer)
    bulkTimer = null
    bulkFirstDirtyAt = 0
  }
  const map = dirty[kind]
  if (!map.size) return chain[kind]
  const ops: Op[] = [...map]
  map.clear()
  if (kind === STATE) stateInflight++
  chain[kind] = chain[kind]
    .then(() => write(kind, ops))
    .finally(() => {
      if (kind === STATE) stateInflight--
    })
  return chain[kind]
}

/** Durum dosyalarında yazılmamış ya da yazılmakta olan değişiklik var mı? */
export function stateBusy(): boolean {
  return dirty[STATE].size > 0 || stateQueued || stateInflight > 0
}

/**
 * Bu ana dek yapılan durum değişiklikleri IndexedDB'ye işlenince çözülür. Önce bir makro görev beklenir: aynı görevde
 * sıraya giren yazımlar (mikro görevler) kuyruğa girmiş olur.
 */
export function whenStateSaved(): Promise<void> {
  return new Promise<void>((resolve) => {
    const ch = new MessageChannel()
    ch.port1.onmessage = () => {
      ch.port1.close()
      void chain[STATE].then(resolve, resolve)
    }
    ch.port2.postMessage(0)
  })
}

/** Bekleyen tüm değişiklikleri hemen yazar. */
export function flush(): Promise<void> {
  return Promise.all(KINDS.map((k) => flushKind(k))).then(() => undefined)
}

async function write(kind: Kind, ops: Op[]): Promise<void> {
  const db = await openDb(kind)
  if (!db) return
  // Dosya içerikleri şimdi alınır (yazım anındaki son hâl); büyük kümeler parçalara bölünür.
  const parts: { op: Op; row: Row | null }[][] = [[]]
  let size = 0
  for (const op of ops) {
    const snap = op[1] === 'write' ? snapshotFile(op[0]) : null
    const row = snap ? { path: op[0], bytes: snap.bytes, mtimeMs: snap.mtimeMs } : null
    const n = row?.bytes.length ?? 0
    if (kind === BULK && size + n > BULK_TX_BYTES && parts[parts.length - 1]!.length) {
      parts.push([])
      size = 0
    }
    parts[parts.length - 1]!.push({ op, row })
    size += n
  }
  for (const part of parts) await writePart(db, kind, part)
}

function writePart(db: IDBDatabase, kind: Kind, part: { op: Op; row: Row | null }[]): Promise<void> {
  return new Promise<void>((resolve) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(OBJECT_STORE, 'readwrite', { durability: kind === STATE ? 'default' : 'relaxed' })
    } catch (err) {
      console.warn('[TV+ arka uç] kalıcı yazım başlatılamadı', err)
      return resolve()
    }
    const store = tx.objectStore(OBJECT_STORE)
    let bytes = 0
    for (const { op, row } of part) {
      store.delete(pathRange(op[0]))
      if (!row) continue
      const n = Math.max(1, Math.ceil(row.bytes.length / PART_BYTES))
      for (let i = 0; i < n; i++) {
        const piece = row.bytes.slice(i * PART_BYTES, (i + 1) * PART_BYTES)
        store.put({
          k: partKey(row.path, i),
          path: row.path,
          i,
          n,
          bytes: piece,
          mtimeMs: row.mtimeMs,
        } satisfies PartRow)
      }
      bytes += row.bytes.length
    }
    const t0 = performance.now()
    tx.oncomplete = () => {
      report?.(
        `kalıcı yazım (${kind}): ${part.length} dosya, ${(bytes / 1024).toFixed(0)} KB, ${Math.round(performance.now() - t0)} ms`,
      )
      resolve()
    }
    tx.onabort = tx.onerror = () => {
      if (!warned) {
        warned = true
        console.warn('[TV+ arka uç] tarayıcı depolamasına yazılamadı (kota dolu ya da depolama kapalı)', tx.error)
      }
      // Yazılamayanlar bir sonraki fırsatta yeniden denenir.
      for (const { op } of part) if (!dirty[kind].has(op[0])) dirty[kind].set(op[0], op[1])
      resolve()
    }
  })
}

/** `/data` altındaki değişiklikleri izlemeye başlar. */
export function watch(): () => void {
  return onChange((path, change) => {
    if (!path.startsWith(`${DATA_ROOT}/`)) return
    const kind = kindOf(path)
    dirty[kind].set(path, change)
    schedule(kind)
  })
}
