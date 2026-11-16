/**
 * Giriş/kayıt sonrası nereye gidileceği. `?next=` yalnız uygulama içi yol olabilir (açık yönlendirme olmasın diye).
 * Bu cihazda hesapsız yazılmış kayıt varsa önce "hesabıma taşı" adımı açılır.
 */
import { countLocalRecords, totalCount } from '../../lib/session/migrate.ts'
import { LOCAL_DB_NAME, openDb } from '../../lib/store/db.ts'

export const DEFAULT_NEXT = '/gorevler'

/** Yalnız `/` ile başlayan (ve `//` ile başlamayan) yolları kabul eder. */
export function safeNext(value: string | null | undefined, fallback: string = DEFAULT_NEXT): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  return value
}

/** Giriş sonrası hedef yol. */
export async function nextAfterLogin(next: string): Promise<string> {
  const counts = await countLocalRecords(openDb(LOCAL_DB_NAME))
  if (totalCount(counts) > 0) return `/hesaba-tasi?next=${encodeURIComponent(next)}`
  return next
}

/** Bir yolu `next` parametresiyle giriş/kayıt sayfasına taşır. */
export function withNext(path: string, next: string): string {
  return next === DEFAULT_NEXT ? path : `${path}?next=${encodeURIComponent(next)}`
}
