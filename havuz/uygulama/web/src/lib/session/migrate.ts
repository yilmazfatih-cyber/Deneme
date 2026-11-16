/**
 * "Bu cihazdaki kayıtları hesabıma taşı": hesapsız kullanırken yazılan kayıtlar, giriş yapılınca kullanıcının
 * kişisel alanına `put` olarak aktarılır ve sonra hesapsız veritabanından silinir.
 *
 * Kimlikler korunur (görevin `listId` bağı kopmasın diye). İşlem iki ayrı veritabanına dokunduğu için tek işlem
 * olamaz; sıra bu yüzden "önce hedefe yaz, sonra kaynağı sil"dir. Arada kesilirse yeniden çalıştırmak güvenlidir:
 * aynı kimlik + aynı veri ikinci kez değişiklik yaratmaz.
 *
 * Genişletme: yalnız silinmemiş kayıtlar taşınır; çöp kutusunu da taşımak isterseniz `live` süzgecini kaldırıp
 * silinmişler için ayrıca `delete` yazın.
 */
import { ENTITIES, LOCAL_WORKSPACE_ID, type CollectionName } from '@uygulama/shared'
import type { AppDb } from '../store/db.ts'
import { listRows, writeRecords, type BatchWrite } from '../store/records.ts'

export type LocalCounts = Partial<Record<CollectionName, number>>

/** Hesapsız alandaki (silinmemiş) kayıt sayıları; hiç kayıt yoksa boş nesne. */
export async function countLocalRecords(localDb: AppDb): Promise<LocalCounts> {
  const counts: LocalCounts = {}
  for (const collection of Object.keys(ENTITIES) as CollectionName[]) {
    const live = (await listRows(localDb, LOCAL_WORKSPACE_ID, collection)).filter((row) => !row.view.deleted)
    if (live.length > 0) counts[collection] = live.length
  }
  return counts
}

export function totalCount(counts: LocalCounts): number {
  return Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0)
}

/** Kayıtları taşır; taşınan kayıt sayısını döndürür. */
export async function migrateLocalToAccount(
  localDb: AppDb,
  userDb: AppDb,
  personalWorkspaceId: string,
  now: Date = new Date(),
): Promise<number> {
  const writes: BatchWrite[] = []
  for (const collection of Object.keys(ENTITIES)) {
    for (const row of await listRows(localDb, LOCAL_WORKSPACE_ID, collection)) {
      if (row.view.deleted) continue
      writes.push({ recordId: row.id, intent: { op: 'put', collection, data: row.view.data } })
    }
  }
  if (writes.length > 0) await writeRecords(userDb, personalWorkspaceId, writes, { now })
  await localDb.records.clear()
  return writes.length
}
