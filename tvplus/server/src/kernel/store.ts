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
      if (!timer) {
        timer = setTimeout(flush, 400)
        timer.unref()
      }
    },
    flush,
  }
}
