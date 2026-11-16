/**
 * Yönetim sorguları: kullanıcı arama + imleçli sayfalama, ölçümler için sayımlar.
 *
 * Arama Türkçe harf duyarsızdır: `users.search_key` = foldTr(ad + e-posta); aranan metin de foldTr'den geçer
 * ("IŞIK" araması "ışık", "isik", "Işık" adlarını bulur). LIKE'ın özel karakterleri (% _ \) kaçışlanır.
 * Sayfalama `id` üzerindendir: UUIDv7 zaman sıralı olduğu için yeniden eskiye sıralanır, imleç son satırın kimliğidir.
 *
 * Genişletme: yeni bir süzgeç (ör. yalnız kapalı hesaplar) için `listUsers`'a koşul + parametre ekleyin.
 */
import { foldTr } from '@uygulama/shared'
import type { Db } from '../../db/database.ts'
import type { UserRow } from '../auth/userRepo.ts'

function likePattern(query: string): string {
  return `%${foldTr(query).replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

export function listUsers(db: Db, input: { query: string; cursor: string | null; limit: number }): UserRow[] {
  const pattern = input.query === '' ? null : likePattern(input.query)
  return db.all<UserRow>(
    `SELECT * FROM users
     WHERE (? IS NULL OR search_key LIKE ? ESCAPE '\\')
       AND (? IS NULL OR id < ?)
     ORDER BY id DESC
     LIMIT ?`,
    pattern,
    pattern,
    input.cursor,
    input.cursor,
    input.limit,
  )
}

export interface Counts {
  readonly users: number
  readonly disabledUsers: number
  readonly workspaces: number
  readonly records: number
  readonly deletedRecords: number
  readonly activeSessions: number
  readonly databaseBytes: number
}

/** Ölçüm ucu için sayımlar (yönetici ekranı). Büyük tablolarda count(*) tam tarama yapar; dakikada birkaç kez sorun değil. */
export function counts(db: Db, now: string): Counts {
  const count = (sql: string, ...params: string[]) => db.get<{ total: number }>(sql, ...params)?.total ?? 0
  const pages = db.get<{ page_count: number }>('PRAGMA page_count')?.page_count ?? 0
  const pageSize = db.get<{ page_size: number }>('PRAGMA page_size')?.page_size ?? 0
  return {
    users: count('SELECT count(*) AS total FROM users'),
    disabledUsers: count('SELECT count(*) AS total FROM users WHERE disabled = 1'),
    workspaces: count('SELECT count(*) AS total FROM workspaces'),
    records: count('SELECT count(*) AS total FROM records'),
    deletedRecords: count('SELECT count(*) AS total FROM records WHERE deleted = 1'),
    activeSessions: count('SELECT count(*) AS total FROM sessions WHERE expires_at > ?', now),
    databaseBytes: pages * pageSize,
  }
}
