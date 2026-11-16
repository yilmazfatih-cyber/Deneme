/**
 * Kullanıcı yönetimi (/yonetim; yalnız `admin` rolü): kullanıcılar sayfa sayfa listelenir; hesap kapatılıp
 * açılabilir, yönetici rolü verilip alınabilir. Yetki sunucuda denetlenir; bu sayfa yalnız arayüzdür.
 */
import { ROLES, type AdminUser, type Role } from '@uygulama/shared'
import { useEffect, useState } from 'react'
import { t, type MessageKey } from '../../i18n/index.ts'
import { formatDateTime } from '../../lib/date.ts'
import { errorMessage } from '../../lib/errors.ts'
import { useSession } from '../../lib/session/context.ts'
import { Badge, Button, PageHeader, Select, Skeleton, Switch, useToast } from '../../ui/index.ts'
import { MetricsCard } from './MetricsCard.tsx'

const ROLE_NAMES: Record<Role, MessageKey> = { user: 'admin.role.user', admin: 'admin.role.admin' }

export function AdminUsersPage() {
  const { api, state } = useSession()
  const toast = useToast()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const selfId = state.status === 'account' ? state.session.userId : null

  const load = async (from: string | null) => {
    if (!api) return
    setBusy(true)
    try {
      const page = await api.adminUsers(from)
      setUsers((current) => [...(from ? (current ?? []) : []), ...page.users])
      setCursor(page.nextCursor)
      setError(null)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!api) return
    let cancelled = false
    api.adminUsers(null).then(
      (page) => {
        if (cancelled) return
        setUsers(page.users)
        setCursor(page.nextCursor)
      },
      (reason: unknown) => !cancelled && setError(errorMessage(reason)),
    )
    return () => {
      cancelled = true
    }
  }, [api])

  const change = async (user: AdminUser, patch: { disabled?: boolean; role?: Role }) => {
    if (!api) return
    try {
      const { user: updated } = await api.adminUpdateUser(user.id, patch)
      setUsers((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? null)
      toast.show({ message: t('common.saved'), tone: 'success' })
    } catch (reason) {
      toast.show({ message: errorMessage(reason), tone: 'error' })
    }
  }

  return (
    <>
      <PageHeader
        title={t('admin.title')}
        description={t('admin.description')}
        back={{ to: '/ayarlar', label: t('settings.title') }}
      />
      <div className="mb-5">
        <MetricsCard />
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-danger">
          {error}
        </p>
      )}
      {users === null ? (
        !error && <Skeleton lines={4} />
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((user) => (
            <li key={user.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{user.name}</span>
                <span className="text-muted">{user.email}</span>
                {user.disabled && <Badge tone="danger">{t('admin.disabled')}</Badge>}
              </div>
              <p className="text-sm text-muted">
                {t('admin.lastSeen', { when: user.lastSeenAt ? formatDateTime(user.lastSeenAt) : t('admin.never') })}
              </p>
              {user.id !== selfId && (
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{t('admin.role')}</span>
                    <Select
                      value={user.role}
                      onChange={(event) => void change(user, { role: event.target.value as Role })}
                      className="w-auto"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {t(ROLE_NAMES[role])}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Switch
                    label={t('admin.active')}
                    checked={!user.disabled}
                    onChange={(active) => void change(user, { disabled: !active })}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <Button variant="secondary" className="mt-4" loading={busy} onClick={() => void load(cursor)}>
          {t('admin.more')}
        </Button>
      )}
    </>
  )
}
