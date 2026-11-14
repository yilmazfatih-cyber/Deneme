import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppConfig } from './config'

/**
 * Küçük kalıcı durum deposu: dataDir/<ad>.json. Bellekte tutulur, değişince gecikmeli ve atomik yazılır.
 * Prototip ölçeği için yeterlidir; gerçek sistemde bunun yerini veritabanı alır.
 */
export interface Store<T> {
  get(): T
  /** Durumu yerinde değiştirir ve kaydı zamanlar. */
  update(fn: (state: T) => void): void
  flush(): void
}

/** Zamanlanmış ama henüz yazılmamış depolar. */
const pending = new Set<() => void>()

/**
 * Bekleyen gecikmeli yazımları hemen yapar. Tarayıcı kipinde (static-host) sekme kapanırken çağrılır: worker
 * kapanmadan önce son değişiklikler diske (oradan IndexedDB'ye) iner.
 */
export function flushPendingStores(): void {
  for (const flush of [...pending]) flush()
}

export function createStore<T>(config: AppConfig, name: string, initial: () => T): Store<T> {
  const file = join(config.dataDir, `${name}.json`)
  let state: T
  try {
    state = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : initial()
  } catch {
    state = initial()
  }
  let timer: NodeJS.Timeout | null = null
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    pending.delete(flush)
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(state))
    renameSync(tmp, file)
  }
  return {
    get: () => state,
    update(fn) {
      fn(state)
      if (config.isTest) return
      if (config.staticHost) {
        // Tarayıcı kipi: sekme her an kapanabilir ve arka plan işleri zamanlayıcıları geciktirebilir; aynı görevdeki
        // değişiklikler toplanıp görev biterken yazılır (bellek içi dosya sistemi, oradan IndexedDB).
        if (!pending.has(flush)) {
          pending.add(flush)
          queueMicrotask(() => {
            if (pending.has(flush)) flush()
          })
        }
        return
      }
      if (!timer) {
        timer = setTimeout(flush, 400)
        timer.unref()
        pending.add(flush)
      }
    },
    flush,
  }
}
