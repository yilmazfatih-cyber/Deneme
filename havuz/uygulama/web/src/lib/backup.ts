/**
 * JSON yedek: geçerli çalışma alanındaki kayıtları dosyaya yazar ve dosyadan geri yükler.
 * İçe aktarma ÖNCE plan çıkarır (kaç kayıt yeni, kaçı değişecek, hangileri geçersiz); kullanıcı onaylarsa uygular.
 * Her kayıt varlık şemasıyla doğrulanır; geçersiz olanlar atlanır ve özetle bildirilir. Silme yapılmaz.
 *
 * Genişletme: biçim değişirse `version`'ı artırın ve eski sürümü okuyan dalı koruyun.
 */
import { ENTITIES, getEntity, idSchema, jsonEqual, type JsonObject } from '@uygulama/shared'
import { z } from 'zod'
import { APP } from '../app/config.ts'
import type { AppDb } from './store/db.ts'
import { listRows, writeRecords, type BatchWrite } from './store/records.ts'

export const BACKUP_FORMAT = `${APP.id}/yedek`

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(1),
  exportedAt: z.string(),
  collections: z.record(z.string(), z.array(z.object({ id: z.unknown(), data: z.unknown() }))),
})

export interface Backup {
  readonly format: string
  readonly version: 1
  readonly exportedAt: string
  readonly collections: Record<string, { id: string; data: JsonObject }[]>
}

/** Alandaki silinmemiş kayıtların yedeği. */
export async function exportWorkspace(db: AppDb, workspaceId: string, now: Date = new Date()): Promise<Backup> {
  const collections: Backup['collections'] = {}
  for (const collection of Object.keys(ENTITIES)) {
    const rows = await listRows(db, workspaceId, collection)
    collections[collection] = rows
      .filter((row) => !row.view.deleted)
      .map((row) => ({ id: row.id, data: row.view.data }))
  }
  return { format: BACKUP_FORMAT, version: 1, exportedAt: now.toISOString(), collections }
}

export interface ImportProblem {
  readonly collection: string
  readonly index: number
  readonly message: string
}

export interface ImportPlan {
  readonly writes: BatchWrite[]
  /** Koleksiyon → yeni / güncellenecek / aynı kayıt sayısı. */
  readonly summary: Record<string, { added: number; updated: number; unchanged: number }>
  readonly problems: ImportProblem[]
}

export type ImportCheck =
  { readonly ok: true; readonly plan: ImportPlan } | { readonly ok: false; readonly reason: 'format' }

/** Dosya içeriğini doğrular ve plan çıkarır; veritabanına YAZMAZ. */
export async function planImport(db: AppDb, workspaceId: string, raw: unknown): Promise<ImportCheck> {
  const parsed = backupSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: 'format' }
  const writes: BatchWrite[] = []
  const summary: ImportPlan['summary'] = {}
  const problems: ImportProblem[] = []
  for (const [collection, items] of Object.entries(parsed.data.collections)) {
    const entity = getEntity(collection)
    if (!entity) {
      problems.push({ collection, index: -1, message: 'unknown_collection' })
      continue
    }
    const existing = new Map((await listRows(db, workspaceId, collection)).map((row) => [row.id, row]))
    const counts = { added: 0, updated: 0, unchanged: 0 }
    items.forEach((item, index) => {
      const id = idSchema.safeParse(item.id)
      const data = entity.schema.safeParse(item.data)
      if (!id.success || !data.success) {
        problems.push({ collection, index, message: data.error?.issues[0]?.message ?? 'Geçersiz kimlik' })
        return
      }
      const before = existing.get(id.data)
      if (before && !before.view.deleted && jsonEqual(before.view.data, data.data)) counts.unchanged += 1
      else {
        if (before) counts.updated += 1
        else counts.added += 1
        writes.push({ recordId: id.data, intent: { op: 'put', collection, data: data.data } })
      }
    })
    summary[collection] = counts
  }
  return { ok: true, plan: { writes, summary, problems } }
}

/** Onaylanan planı tek işlemde uygular; yazılan kayıt sayısını döndürür. */
export async function applyImport(db: AppDb, workspaceId: string, plan: ImportPlan): Promise<number> {
  return writeRecords(db, workspaceId, plan.writes)
}

/** Nesneyi JSON dosyası olarak indirir. */
export function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
