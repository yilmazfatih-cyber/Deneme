/**
 * Eşitleme kilidi: aynı kullanıcının iki sekmesi aynı veritabanını paylaşır; eşitleme turu aynı anda YALNIZ
 * bir sekmede koşar. Öteki sekme sırasını bekler (isteği kaybolmaz), sonra kendi turunu koşar.
 *
 *  - Tarayıcıda Web Locks varsa (bugünkü tarayıcıların hepsi) o kullanılır: sekme kapanırsa kilit kendiliğinden düşer.
 *  - Yoksa veritabanında süreli bir "kira" (lease) kaydı tutulur: IndexedDB işlemleri sekmeler arasında sıralı
 *    olduğu için aynı anda iki sekme kirayı alamaz; sekme çökerse kira süresi dolunca başkası alır.
 *
 * Kilit olmasa da veri bozulmaz (sunucu yinelenen gönderimi ayıklar, uzlaştırma `rev` ile korunur); kilit
 * gereksiz çift isteği ve nadir yarış durumlarını önler.
 *
 * Genişletme: süreleri değiştirmek için LEASE_MS / RETRY_MS; kira süresi, bir turun en uzun süresinden
 * (istek zaman aşımı + uygulama) uzun olmalıdır.
 */
import { uuidv7 } from '@uygulama/shared'
import type { AppDb } from '../store/db.ts'
import { getMeta, setMeta } from '../store/meta.ts'

export const LEASE_MS = 45_000
const RETRY_MS = 300

/** Bu sekmenin kimliği (yalnız kira kaydında kullanılır). */
const TAB_ID = uuidv7()

export interface LockOptions {
  /** `false` verilirse Web Locks yok sayılır (test için). */
  readonly useWebLocks?: boolean
  readonly owner?: string
  readonly now?: () => number
  readonly sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function acquireLease(db: AppDb, owner: string, now: number): Promise<boolean> {
  return db.transaction('rw', db.meta, async () => {
    const lease = await getMeta(db, 'syncLease')
    if (lease !== null && lease.owner !== owner && lease.until > now) return false
    await setMeta(db, 'syncLease', { owner, until: now + LEASE_MS })
    return true
  })
}

async function releaseLease(db: AppDb, owner: string): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const lease = await getMeta(db, 'syncLease')
    if (lease?.owner === owner) await setMeta(db, 'syncLease', null)
  })
}

async function withLease<T>(db: AppDb, task: () => Promise<T>, options: LockOptions): Promise<T> {
  const owner = options.owner ?? TAB_ID
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? defaultSleep
  // En kötü durumda (kirayı tutan sekme çöktü) kira süresi dolana dek beklenir.
  const deadline = now() + LEASE_MS + 5000
  while (!(await acquireLease(db, owner, now()))) {
    if (now() > deadline) throw new Error('Eşitleme kilidi alınamadı.')
    await sleep(RETRY_MS)
  }
  try {
    return await task()
  } finally {
    await releaseLease(db, owner)
  }
}

/** `task`'ı eşitleme kilidi altında koşturur; kilit başka sekmedeyse sırasını bekler. */
export async function withSyncLock<T>(db: AppDb, task: () => Promise<T>, options: LockOptions = {}): Promise<T> {
  const locks = options.useWebLocks === false ? undefined : (globalThis.navigator as Navigator | undefined)?.locks
  // `locks.request` geri çağrının sonucunu döndürür; DOM tipi bunu `Promise<any>` diye tanımlar.
  if (locks) return locks.request(`${db.name}.esitleme`, () => task()) as Promise<T>
  return withLease(db, task, options)
}
