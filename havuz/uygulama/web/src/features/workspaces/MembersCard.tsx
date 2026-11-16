/**
 * Alan üyeleri: ad, e-posta, rol. Sahip rolleri değiştirebilir ve üyeyi çıkarabilir (onaylı).
 * Üye listesi eşitlenmez; her açılışta sunucudan okunur (çevrimdışıyken bilgi iletisi görünür).
 */
import { INVITE_ROLES, type Member, type WorkspaceInfo, type WorkspaceRole } from '@uygulama/shared'
import { UserMinus } from 'lucide-react'
import { useState } from 'react'
import { t } from '../../i18n/index.ts'
import { errorMessage } from '../../lib/errors.ts'
import { useRemote } from '../../lib/useRemote.ts'
import { Badge, Button, Card, ConfirmDialog, IconButton, Select, Skeleton } from '../../ui/index.ts'
import { ROLE_LABELS } from './labels.ts'
import { useWorkspaceApi } from './useWorkspaceApi.ts'

export function MembersCard({ workspace }: { workspace: WorkspaceInfo }) {
  const { api, refresh, fail, userId } = useWorkspaceApi()
  const members = useRemote(api && `uyeler:${workspace.id}:${workspace.memberCount}`, () =>
    api ? api.members(workspace.id) : Promise.resolve({ members: [] }),
  )
  const [removing, setRemoving] = useState<Member | null>(null)
  const isOwner = workspace.role === 'owner'

  const changeRole = async (member: Member, role: WorkspaceRole) => {
    if (!api) return
    try {
      await api.updateMember(workspace.id, member.userId, { role })
      members.reload()
      await refresh()
    } catch (error) {
      fail(error)
    }
  }

  return (
    <Card title={t('workspace.members.title')} description={t('workspace.members.description')}>
      {members.loading && !members.data ? (
        <Skeleton lines={2} />
      ) : members.error && !members.data ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-muted">
            {errorMessage(members.error)}
          </p>
          <Button variant="secondary" onClick={members.reload}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {(members.data?.members ?? []).map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex min-w-[min(14rem,100%)] flex-1 flex-col">
                <span className="flex items-center gap-2 font-semibold">
                  <span className="truncate">{member.name}</span>
                  {member.userId === userId && <Badge>{t('workspace.members.you')}</Badge>}
                </span>
                <span className="truncate text-sm text-muted">{member.email}</span>
              </div>
              {isOwner && member.role !== 'owner' ? (
                <div className="flex items-center gap-1">
                  <label className="sr-only" htmlFor={`rol-${member.userId}`}>
                    {t('workspace.members.roleOf', { name: member.name })}
                  </label>
                  <Select
                    id={`rol-${member.userId}`}
                    value={member.role}
                    onChange={(event) => void changeRole(member, event.target.value as WorkspaceRole)}
                    className="w-auto"
                  >
                    {INVITE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {t(ROLE_LABELS[role])}
                      </option>
                    ))}
                  </Select>
                  <IconButton
                    icon={UserMinus}
                    label={t('workspace.members.remove', { name: member.name })}
                    onClick={() => setRemoving(member)}
                  />
                </div>
              ) : (
                <Badge tone={member.role === 'owner' ? 'accent' : 'neutral'}>{t(ROLE_LABELS[member.role])}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('workspace.members.removeTitle', { name: removing?.name ?? '' })}
        message={t('workspace.members.removeMessage')}
        confirmLabel={t('workspace.members.removeConfirm')}
        tone="danger"
        onConfirm={async () => {
          if (!api || !removing) return
          await api.removeMember(workspace.id, removing.userId)
          members.reload()
          await refresh()
        }}
      />
    </Card>
  )
}
