/**
 * Giriş/kayıt sonrası nereye gidileceği. `?next=` yalnız uygulama içi yol olabilir (açık yönlendirme olmasın diye).
 * Bu cihazda hesapsız yazılmış kayıt varsa önce "hesabıma taşı" adımı açılır.
 */
import { countLocalRecords, totalCount } from '../../lib/session/migrate.ts'
import { LOCAL_DB_NAME, openDb, userDbName } from '../../lib/store/db.ts'
import { getMeta } from '../../lib/store/meta.ts'

export const DEFAULT_NEXT = '/gorevler'

/** Yalnız `/` ile başlayan (ve `//` ile başlamayan) yolları kabul eder. */
export function safeNext(value: string | null | undefined, fallback: string = DEFAULT_NEXT): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  return value
}

/**
 * Giriş sonrası hedef yol. Kullanıcı bu öneriyi daha önce "Şimdi değil" diye kapattıysa yeniden sorulmaz
 * (Ayarlar → Veri'den yine taşınabilir).
 */
export async function nextAfterLogin(next: string, userId: string): Promise<string> {
  const counts = await countLocalRecords(openDb(LOCAL_DB_NAME))
  if (totalCount(counts) === 0) return next
  if (await getMeta(openDb(userDbName(userId)), 'migrationDismissed')) return next
  return `/hesaba-tasi?next=${encodeURIComponent(next)}`
}

/** Bir yolu `next` parametresiyle giriş/kayıt sayfasına taşır. */
export function withNext(path: string, next: string): string {
  return next === DEFAULT_NEXT ? path : `${path}?next=${encodeURIComponent(next)}`
}
