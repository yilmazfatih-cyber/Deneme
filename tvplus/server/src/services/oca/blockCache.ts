/**
 * OCA disk önbelleği: kökenden çekilen baytlar hizalı bloklar (256 KiB) halinde
 * <dataDir>/oca-cache/<o>/<v>-<blok>.blk altında tutulur. Tüm düğümler aynı önbelleği paylaşır
 * (gerçekte her OCA kendi diskine sahiptir; burada tek makinede benzetim yapıyoruz).
 * Toplam boyut LRU ile sınırlıdır; aynı bloğa eşzamanlı istekler tek köken isteğinde birleşir.
 */
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const BLOCK_SIZE = 256 * 1024
export const DEFAULT_CACHE_CAP = 1.5 * 1024 * 1024 * 1024

export interface BlockCacheOptions {
  dir: string
  capBytes?: number
  blockSize?: number
}

/** Ardışık blok dizisini kökenden çeken işlev: [start, end] dahil bayt aralığı. */
export type RangeFetcher = (start: number, end: number) => Promise<Buffer>

export interface EnsureResult {
  /** istenen blokların içeriği, sırayla */
  blocks: Buffer[]
  /** önbellekte bulunan blok sayısı */
  hits: number
  /** kökenden çekilen blok sayısı */
  misses: number
}

export interface BlockCache {
  readonly blockSize: number
  /** [first, last] bloklarını getirir; eksikleri `fetcher` ile tamamlar (fetcher null ise eksik → hata). */
  ensure(o: string, v: number, size: number, first: number, last: number, fetcher: RangeFetcher | null): Promise<EnsureResult>
  /** Bloklar önbellekte mi (çevrimdışı karar için)? */
  has(o: string, v: number, first: number, last: number): boolean
  stats(): { bytes: number; blocks: number; capBytes: number }
}

export class CacheMissError extends Error {
  constructor() {
    super('Blok önbellekte yok ve kökene çıkılamıyor')
    this.name = 'CacheMissError'
  }
}

interface Entry {
  file: string
  bytes: number
}

export function createBlockCache(opts: BlockCacheOptions): BlockCache {
  const blockSize = opts.blockSize ?? BLOCK_SIZE
  const capBytes = opts.capBytes ?? DEFAULT_CACHE_CAP
  const dir = opts.dir
  mkdirSync(dir, { recursive: true })

  /** Ekleme sırası = LRU sırası (erişimde silinip yeniden eklenir). */
  const index = new Map<string, Entry>()
  let total = 0
  const inflight = new Map<string, Promise<Buffer>>()

  // Açılışta diskteki blokları en eski erişimden başlayarak dizine al.
  try {
    const found: { key: string; file: string; bytes: number; mtime: number }[] = []
    for (const o of readdirSync(dir)) {
      const sub = join(dir, o)
      let names: string[]
      try {
        names = readdirSync(sub)
      } catch {
        continue
      }
      for (const name of names) {
        const m = /^(\d+)-(\d+)\.blk$/.exec(name)
        if (!m) continue
        const file = join(sub, name)
        const st = statSync(file)
        found.push({ key: `${o}/${m[1]}/${m[2]}`, file, bytes: st.size, mtime: st.mtimeMs })
      }
    }
    found.sort((a, b) => a.mtime - b.mtime)
    for (const f of found) {
      index.set(f.key, { file: f.file, bytes: f.bytes })
      total += f.bytes
    }
  } catch {
    /* boş önbellek */
  }

  const keyOf = (o: string, v: number, i: number) => `${o}/${v}/${i}`
  const fileOf = (o: string, v: number, i: number) => join(dir, o, `${v}-${i}.blk`)

  function touch(key: string, e: Entry) {
    index.delete(key)
    index.set(key, e)
  }

  async function evict() {
    while (total > capBytes && index.size > 0) {
      const first = index.entries().next().value
      if (!first) break
      const [key, e] = first
      index.delete(key)
      total -= e.bytes
      await rm(e.file, { force: true }).catch(() => undefined)
    }
  }

  async function store(o: string, v: number, i: number, data: Buffer) {
    const key = keyOf(o, v, i)
    const file = fileOf(o, v, i)
    mkdirSync(join(dir, o), { recursive: true })
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    await writeFile(tmp, data)
    await rename(tmp, file)
    const prev = index.get(key)
    if (prev) total -= prev.bytes
    index.set(key, { file, bytes: data.length })
    total += data.length
    await evict()
  }

  async function readBlock(o: string, v: number, i: number): Promise<Buffer | null> {
    const key = keyOf(o, v, i)
    const e = index.get(key)
    if (!e) return null
    try {
      const data = await readFile(e.file)
      touch(key, e)
      return data
    } catch {
      index.delete(key)
      total -= e.bytes
      return null
    }
  }

  return {
    blockSize,
    has(o, v, first, last) {
      for (let i = first; i <= last; i++) {
        const key = keyOf(o, v, i)
        if (!index.has(key) && !inflight.has(key)) return false
      }
      return true
    },
    async ensure(o, v, size, first, last, fetcher) {
      const result: (Buffer | Promise<Buffer>)[] = []
      let hits = 0
      let misses = 0
      // Önce önbellekte olanlar; eksikler ardışık koşular halinde tek istekte çekilir.
      const missing: number[] = []
      for (let i = first; i <= last; i++) {
        const key = keyOf(o, v, i)
        const pending = inflight.get(key)
        if (pending) {
          result[i - first] = pending
          hits++
          continue
        }
        const cached = await readBlock(o, v, i)
        if (cached) {
          result[i - first] = cached
          hits++
        } else {
          missing.push(i)
        }
      }
      if (missing.length > 0) {
        if (!fetcher) throw new CacheMissError()
        // ardışık koşulara böl
        const runs: [number, number][] = []
        for (const i of missing) {
          const last = runs[runs.length - 1]
          if (last && last[1] === i - 1) last[1] = i
          else runs.push([i, i])
        }
        for (const [a, b] of runs) {
          const start = a * blockSize
          const end = Math.min((b + 1) * blockSize, size) - 1
          const run = fetcher(start, end)
          for (let i = a; i <= b; i++) {
            const key = keyOf(o, v, i)
            const p = run.then(async (buf) => {
              const off = (i - a) * blockSize
              const data = Buffer.from(buf.subarray(off, Math.min(off + blockSize, buf.length)))
              await store(o, v, i, data)
              return data
            })
            const tracked = p.finally(() => inflight.delete(key))
            tracked.catch(() => undefined)
            inflight.set(key, tracked)
            result[i - first] = tracked
            misses++
          }
        }
      }
      const blocks = await Promise.all(result)
      return { blocks, hits, misses }
    },
    stats: () => ({ bytes: total, blocks: index.size, capBytes }),
  }
}
