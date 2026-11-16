/**
 * Çalışma alanı YETKİ KURALLARI (tek yer). Servisler "yapabilir mi?" sorusunu yalnız buradaki işlevlerle sorar.
 *
 *   işlem                         sahip  düzenleyen  izleyici   not
 *   alanı görmek, üyeleri listele   ✓        ✓          ✓
 *   kayıt yazmak (eşitleme)         ✓        ✓          ✗       shared → canWrite
 *   yeniden adlandırmak             ✓        ✗          ✗
 *   silmek                          ✓        ✗          ✗       kişisel alan silinemez
 *   davet oluşturmak                ✓        ✗          ✗       kişisel alan paylaşılamaz
 *   rol değiştirmek, üye çıkarmak   ✓        ✗          ✗       son sahip düşürülemez
 *   kendi isteğiyle ayrılmak        ✓*       ✓          ✓       *başka sahip varsa; kişisel alandan ayrılınmaz
 *
 * Üye olmayan biri için alan "yok" sayılır (404): başkasının alanının varlığı bile sızmaz.
 * Her kuralın olumsuz testi: test/modules/workspaces.test.ts ve test/security.test.ts.
 *
 * Genişletme: yeni kural için TARIFLER.md → "Yeni yetki kuralı ekle": buraya `assertX` işlevi, tabloya satır,
 * servise çağrı, teste "yetkisiz kişi denediğinde 403/404" senaryosu.
 */
import { AppError, type WorkspaceRole } from '@uygulama/shared'
import type { Db } from '../../db/database.ts'
import { MESSAGES } from '../../messages.ts'
import { countOwners, findRole, findWorkspace, type WorkspaceRow } from './repo.ts'

export interface Membership {
  readonly workspace: WorkspaceRow
  readonly role: WorkspaceRole
}

/** Kullanıcı alanın üyesi mi? Değilse (ya da alan yoksa) 404 — varlık sızmasın. */
export function requireMembership(db: Db, workspaceId: string, userId: string): Membership {
  const workspace = findWorkspace(db, workspaceId)
  const role = workspace ? findRole(db, workspaceId, userId) : undefined
  if (!workspace || !role) throw new AppError('not_found', MESSAGES.workspaceNotFound)
  return { workspace, role }
}

export function assertOwner(membership: Membership): void {
  if (membership.role !== 'owner') throw new AppError('forbidden', MESSAGES.ownerOnly)
}

export function assertCanRename(membership: Membership): void {
  assertOwner(membership)
}

export function assertCanDelete(membership: Membership): void {
  assertOwner(membership)
  if (membership.workspace.kind === 'personal') throw new AppError('forbidden', MESSAGES.personalNotDeletable)
}

export function assertCanInvite(membership: Membership): void {
  assertOwner(membership)
  if (membership.workspace.kind === 'personal') throw new AppError('forbidden', MESSAGES.personalNotShareable)
}

export function assertCanManageMembers(membership: Membership): void {
  assertOwner(membership)
}

/** Bir sahibin rolü düşürülecek ya da sahip çıkarılacaksa: başka sahip kalmalı. */
export function assertNotLastOwner(db: Db, workspaceId: string, targetRole: WorkspaceRole): void {
  if (targetRole === 'owner' && countOwners(db, workspaceId) <= 1) throw new AppError('forbidden', MESSAGES.lastOwner)
}

export function assertCanLeave(db: Db, membership: Membership): void {
  if (membership.workspace.kind === 'personal') throw new AppError('forbidden', MESSAGES.personalNotLeavable)
  assertNotLastOwner(db, membership.workspace.id, membership.role)
}
