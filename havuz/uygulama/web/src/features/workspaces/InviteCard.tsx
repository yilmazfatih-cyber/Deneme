/**
 * Davet bağlantısı: rol seç → bağlantı oluştur → kopyala ya da (destekleniyorsa) cihazın paylaş menüsüyle gönder.
 * Bağlantı tek kullanımlıktır ve süresi vardır; sunucu yalnız özetini saklar.
 * Adres `shared`daki `webUrl` + `WEB_ROUTES.invite` ile kurulur: …/#/davet?token=…
 */
import { INVITE_ROLES, WEB_ROUTES, webUrl, type Invite, type InviteRole, type WorkspaceInfo } from '@uygulama/shared'
import { Copy, Link2, Share2 } from 'lucide-react'
import { useState } from 'react'
import { t } from '../../i18n/index.ts'
import { formatDateTime } from '../../lib/date.ts'
import { Button, Card, Input, SelectField } from '../../ui/index.ts'
import { ROLE_HINTS, ROLE_LABELS } from './labels.ts'
import { useWorkspaceApi } from './useWorkspaceApi.ts'

/** Uygulamanın kök adresi (alt klasörde yayında da doğru): https://ornek.app/alt/ */
export function appBaseUrl(): string {
  return `${location.origin}${location.pathname}`
}

export function InviteCard({ workspace }: { workspace: WorkspaceInfo }) {
  const { api, fail, toast } = useWorkspaceApi()
  const [role, setRole] = useState<InviteRole>('editor')
  const [invite, setInvite] = useState<Invite | null>(null)
  const [busy, setBusy] = useState(false)
  const link = invite ? webUrl(appBaseUrl(), WEB_ROUTES.invite, { token: invite.token }) : ''
  const canShare = typeof navigator.share === 'function'

  const create = async () => {
    if (!api) return
    setBusy(true)
    try {
      setInvite((await api.createInvite(workspace.id, { role })).invite)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast.show({ message: t('invite.copied'), tone: 'success' })
    } catch {
      toast.show({ message: t('invite.copyFailed'), tone: 'error' })
    }
  }

  const share = async () => {
    try {
      await navigator.share({ title: t('invite.shareTitle', { name: workspace.name }), url: link })
    } catch {
      // Kullanıcı paylaşımı kapattı: yapılacak bir şey yok.
    }
  }

  return (
    <Card title={t('invite.title')} description={t('invite.description')}>
      <div className="flex flex-col gap-4">
        <SelectField
          label={t('invite.role')}
          hint={t(ROLE_HINTS[role])}
          value={role}
          onChange={(event) => {
            setRole(event.target.value as InviteRole)
            setInvite(null)
          }}
        >
          {INVITE_ROLES.map((value) => (
            <option key={value} value={value}>
              {t(ROLE_LABELS[value])}
            </option>
          ))}
        </SelectField>
        {invite ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4">
            <label htmlFor="davet-baglantisi" className="text-sm font-semibold">
              {t('invite.link')}
            </label>
            <Input id="davet-baglantisi" readOnly value={link} onFocus={(event) => event.target.select()} />
            <p className="text-sm text-muted">
              {t('invite.expires', { when: formatDateTime(invite.expiresAt), role: t(ROLE_LABELS[invite.role]) })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button icon={Copy} onClick={() => void copy()}>
                {t('invite.copy')}
              </Button>
              {canShare && (
                <Button variant="secondary" icon={Share2} onClick={() => void share()}>
                  {t('invite.share')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Button variant="secondary" icon={Link2} loading={busy} onClick={() => void create()}>
            {t('invite.create')}
          </Button>
        )}
      </div>
    </Card>
  )
}
