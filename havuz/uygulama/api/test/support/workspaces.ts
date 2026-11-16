/**
 * Çalışma alanı test yardımcıları: paylaşımlı alan aç, davetle üye ekle.
 *
 * Genişletme: sık tekrarlanan yeni bir kurulum adımı (ör. kayıt yaz) gerekirse buraya ekleyin.
 */
import { API_PATHS, type InviteRole } from '@uygulama/shared'
import type { SignedUpUser } from './client.ts'

export async function createShared(owner: SignedUpUser, name = 'Ev'): Promise<string> {
  const reply = await owner.client.post(API_PATHS.workspaces, { name })
  if (reply.status !== 201) throw new Error(`Alan açılamadı: ${JSON.stringify(reply.body)}`)
  return (reply.body as { workspace: { id: string } }).workspace.id
}

export async function invite(owner: SignedUpUser, workspaceId: string, role: InviteRole = 'editor'): Promise<string> {
  const reply = await owner.client.post(API_PATHS.invites(workspaceId), { role })
  if (reply.status !== 201) throw new Error(`Davet oluşturulamadı: ${JSON.stringify(reply.body)}`)
  return (reply.body as { invite: { token: string } }).invite.token
}

/** Sahip davet eder, kişi kabul eder. */
export async function addMember(
  owner: SignedUpUser,
  member: SignedUpUser,
  workspaceId: string,
  role: InviteRole = 'editor',
): Promise<void> {
  const token = await invite(owner, workspaceId, role)
  const reply = await member.client.post(API_PATHS.acceptInvite, { token })
  if (reply.status !== 200) throw new Error(`Davet kabul edilemedi: ${JSON.stringify(reply.body)}`)
}
