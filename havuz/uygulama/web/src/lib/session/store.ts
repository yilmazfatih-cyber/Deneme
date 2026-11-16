/**
 * Oturum kaydı: bu tarayıcıda kimin giriş yaptığı. Kullanıcı veritabanlarından AYRI küçük bir IndexedDB
 * veritabanında durur; uygulama açılınca hangi kullanıcı veritabanının açılacağını buradan öğrenir.
 *
 * Belirteç kipinde (API başka kökende) oturum belirteci de burada saklanır. Bu, sayfaya sızan bir betiğin (XSS)
 * belirteci okuyabileceği anlamına gelir; çerez kipinde bu risk yoktur (ayrıntı: docs/KARARLAR.md).
 *
 * Genişletme: oturumla birlikte saklanacak yeni bir değer → `storedSessionSchema`'ya `.default(...)` ile ekleyin.
 */
import { userSchema } from '@uygulama/shared'
import Dexie, { type Table } from 'dexie'
import { z } from 'zod'
import { APP } from '../../app/config.ts'

export const storedSessionSchema = z.object({
  userId: z.string(),
  user: userSchema,
  /** Yalnız belirteç kipinde dolu. */
  token: z.string().nullable(),
  /** Sunucu oturumu geçersiz saydı (401): veri yerinde durur, eşitleme yeniden giriş yapılınca sürer. */
  expired: z.boolean().default(false),
  /** Girişin yapıldığı an (her girişte yeni eşitleme motoru kurulur). */
  since: z.string(),
})
export type StoredSession = z.infer<typeof storedSessionSchema>

interface KvRow {
  readonly key: string
  readonly value: unknown
}

class SessionDb extends Dexie {
  declare kv: Table<KvRow, string>
  constructor() {
    super(`${APP.id}.oturum`)
    this.version(1).stores({ kv: 'key' })
  }
}

let sessionDb: SessionDb | null = null
function getSessionDb(): SessionDb {
  sessionDb ??= new SessionDb()
  return sessionDb
}

/** API isteklerinin kullandığı güncel belirteç (oturum okunup yazıldıkça güncellenir). */
let currentToken: string | null = null
export function getToken(): string | null {
  return currentToken
}

export async function readSession(): Promise<StoredSession | null> {
  const row = await getSessionDb().kv.get('session')
  const parsed = storedSessionSchema.safeParse(row?.value)
  currentToken = parsed.success && !parsed.data.expired ? parsed.data.token : null
  return parsed.success ? parsed.data : null
}

export async function writeSession(session: StoredSession): Promise<void> {
  currentToken = session.expired ? null : session.token
  await getSessionDb().kv.put({ key: 'session', value: session })
}

export async function clearSession(): Promise<void> {
  currentToken = null
  await getSessionDb().kv.delete('session')
}

/** Karşılama ekranı bir kez geçildi mi ("hesapsız devam et" ya da giriş). */
export async function readWelcomeDone(): Promise<boolean> {
  return (await getSessionDb().kv.get('welcome'))?.value === true
}

export async function writeWelcomeDone(): Promise<void> {
  await getSessionDb().kv.put({ key: 'welcome', value: true })
}

/** Testler için: bağlantıyı kapatır (bir sonraki çağrı yeniden açar). */
export function closeSessionDb(): void {
  sessionDb?.close()
  sessionDb = null
  currentToken = null
}
