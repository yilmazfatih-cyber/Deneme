// Kalıcılık: durumu (ya da seçilen bir parçasını) depolamaya (varsayılan localStorage) sürüm numarasıyla yazar;
// açılışta okur, gerekiyorsa göç (migration) işlevleriyle eski sürümü yeniye çevirir ve doğrular.
// Depolamadan gelen veri dış veridir: bozuk JSON, yanlış biçim, gelecekteki bir sürüm ya da eksik göç
// uygulamayı çökertmez; sebebiyle birlikte "yüklenemedi" döner ve varsayılan durumla devam edilir.
// Yazma gecikmelidir (art arda değişiklikler tek yazmada birleşir); kota dolarsa hata `onError`'a gider.
// Genişletme: yeni sürüm = `version`'ı bir artırın ve `migrations[yeniSürüm]` işlevini ekleyin (testini de).
import type { Store } from './store.ts'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface PersistOptions<S, P = S> {
  key: string
  version: number
  storage?: StorageLike
  /** migrations[n]: (n-1). sürümdeki veriyi n. sürüme çevirir. */
  migrations?: Record<number, (old: unknown) => unknown>
  /** Okunan (ve göç ettirilen) verinin biçimini doğrular. */
  validate: (value: unknown) => value is P
  /** Durumun hangi parçası yazılsın (varsayılan: tamamı). */
  select?: (state: S) => P
  delayMs?: number
  schedule?: (fn: () => void, ms: number) => () => void
  onError?: (error: unknown) => void
}

export type LoadResult<P> =
  | { ok: true; value: P; migratedFrom: number | undefined }
  | {
      ok: false
      reason: 'yok' | 'bozuk' | 'gelecek-surum' | 'goc-eksik' | 'gecersiz' | 'erisilemiyor'
      detail?: string
    }

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined // bazı gizli kiplerde localStorage'a dokunmak bile hata atar
  }
}

export function loadPersisted<S, P = S>(options: PersistOptions<S, P>): LoadResult<P> {
  const storage = options.storage ?? defaultStorage()
  if (!storage) return { ok: false, reason: 'erisilemiyor' }
  let raw: string | null
  try {
    raw = storage.getItem(options.key)
  } catch (error) {
    return { ok: false, reason: 'erisilemiyor', detail: String(error) }
  }
  if (raw === null) return { ok: false, reason: 'yok' }
  let envelope: unknown
  try {
    envelope = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'bozuk', detail: 'JSON çözümlenemedi' }
  }
  const { v, durum } = (envelope ?? {}) as { v?: unknown; durum?: unknown }
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0)
    return { ok: false, reason: 'bozuk', detail: 'sürüm alanı yok' }
  if (v > options.version)
    return { ok: false, reason: 'gelecek-surum', detail: `kayıt ${v}, uygulama ${options.version}` }
  let value = durum
  for (let next = v + 1; next <= options.version; next++) {
    const migrate = options.migrations?.[next]
    if (!migrate) return { ok: false, reason: 'goc-eksik', detail: `${next - 1} → ${next} göçü tanımlı değil` }
    value = migrate(value)
  }
  if (!options.validate(value)) return { ok: false, reason: 'gecersiz', detail: 'doğrulama başarısız' }
  return { ok: true, value, migratedFrom: v < options.version ? v : undefined }
}

export interface PersistController {
  /** Bekleyen yazmayı hemen yapar (ör. sayfa kapanırken). */
  flush(): void
  stop(): void
}

/** Depoya abone olur; durum değiştikçe (gecikmeli) yazar. Gelecek sürüm kaydının üstüne yazmaz. */
export function persist<S, P = S>(store: Store<S>, options: PersistOptions<S, P>): PersistController {
  const storage = options.storage ?? defaultStorage()
  const select = options.select ?? ((state: S) => state as unknown as P)
  const schedule =
    options.schedule ??
    ((fn: () => void, ms: number) => {
      const handle = setTimeout(fn, ms)
      return () => clearTimeout(handle)
    })
  const blocked = loadPersisted(options)
  const readOnly = !blocked.ok && blocked.reason === 'gelecek-surum'
  let lastWritten: P | undefined
  let cancel: (() => void) | undefined

  const write = () => {
    cancel = undefined
    const value = select(store.getState())
    if (!storage || readOnly || Object.is(value, lastWritten)) return
    try {
      storage.setItem(options.key, JSON.stringify({ v: options.version, durum: value }))
      lastWritten = value
    } catch (error) {
      options.onError?.(error)
    }
  }
  if (readOnly) options.onError?.(new Error('Kayıt daha yeni bir uygulama sürümüne ait; üzerine yazılmayacak.'))
  const unsubscribe = store.subscribe(() => {
    if (cancel) return
    cancel = schedule(write, options.delayMs ?? 100)
  })
  return {
    flush() {
      cancel?.()
      write()
    },
    stop() {
      cancel?.()
      cancel = undefined
      unsubscribe()
    },
  }
}
