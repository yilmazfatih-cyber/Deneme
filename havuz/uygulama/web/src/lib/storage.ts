/**
 * Depolama kalıcılığı: tarayıcı yer daralınca site verisini silebilir; "kalıcı depolama" izni bunu önler.
 * Ayarlar → Veri ekranı durumu gösterir ve izni ister.
 *
 * Genişletme: başka bir depolama bilgisi gerekirse `StorageStatus`'a alan ekleyin.
 */
export interface StorageStatus {
  /** Kalıcı mı; tarayıcı desteklemiyorsa `null`. */
  readonly persisted: boolean | null
  /** Kullanılan / ayrılan bayt; bilinmiyorsa `null`. */
  readonly usage: number | null
  readonly quota: number | null
}

function manager(): StorageManager | undefined {
  return (globalThis.navigator as Navigator | undefined)?.storage
}

export async function storageStatus(): Promise<StorageStatus> {
  const storage = manager()
  if (!storage) return { persisted: null, usage: null, quota: null }
  const persisted = typeof storage.persisted === 'function' ? await storage.persisted() : null
  const estimate = typeof storage.estimate === 'function' ? await storage.estimate() : {}
  return { persisted, usage: estimate.usage ?? null, quota: estimate.quota ?? null }
}

/** Kalıcı depolama ister. Tarayıcı izin verirse `true`; desteklemiyorsa `null`. */
export async function requestPersistence(): Promise<boolean | null> {
  const storage = manager()
  if (!storage || typeof storage.persist !== 'function') return null
  return storage.persist()
}

/** Baytı okunur biçime çevirir: "1,2 MB". */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${units[unit]}`
}
