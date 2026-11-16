/**
 * Depolama kalıcılığı (izin iste + kullanım) ve "Hakkında" (sürüm, çalışma kipi).
 */
import { HardDrive } from 'lucide-react'
import { useEffect, useState } from 'react'
import { APP } from '../../app/config.ts'
import { t } from '../../i18n/index.ts'
import { API_CONFIG, APP_VERSION } from '../../lib/env.ts'
import { useSession } from '../../lib/session/context.ts'
import { formatBytes, requestPersistence, storageStatus, type StorageStatus } from '../../lib/storage.ts'
import { Badge, Button, Card, useToast } from '../../ui/index.ts'

export function StorageCard() {
  const toast = useToast()
  const [status, setStatus] = useState<StorageStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void storageStatus().then((value) => !cancelled && setStatus(value))
    return () => {
      cancelled = true
    }
  }, [])

  const ask = async () => {
    const granted = await requestPersistence()
    setStatus(await storageStatus())
    toast.show({ message: t(granted ? 'settings.storage.granted' : 'settings.storage.denied') })
  }

  return (
    <Card title={t('settings.storage')} description={t('settings.storage.description')}>
      <div className="flex flex-col items-start gap-3">
        {status?.persisted === null || status === null ? (
          <p className="text-muted">{t('settings.storage.unsupported')}</p>
        ) : (
          <Badge tone={status.persisted ? 'ok' : 'warn'}>
            {t(status.persisted ? 'settings.storage.persistent' : 'settings.storage.temporary')}
          </Badge>
        )}
        {status?.usage != null && status.quota != null && (
          <p className="text-muted">
            {t('settings.storage.usage', { used: formatBytes(status.usage), quota: formatBytes(status.quota) })}
          </p>
        )}
        {status?.persisted === false && (
          <Button variant="secondary" icon={HardDrive} onClick={() => void ask()}>
            {t('settings.storage.request')}
          </Button>
        )}
      </div>
    </Card>
  )
}

export function AboutCard() {
  const { state } = useSession()
  const mode = !API_CONFIG.enabled
    ? t('settings.about.modeLocalBuild')
    : state.status === 'account'
      ? t('settings.about.modeAccount', { email: state.session.user.email })
      : t('settings.about.modeGuest')
  return (
    <Card title={t('settings.about')}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-muted">{t('settings.about.app')}</dt>
        <dd className="font-semibold">{APP.name}</dd>
        <dt className="text-muted">{t('settings.about.version')}</dt>
        <dd className="font-semibold tabular-nums">{APP_VERSION}</dd>
        <dt className="text-muted">{t('settings.about.mode')}</dt>
        <dd className="font-semibold break-words">{mode}</dd>
      </dl>
    </Card>
  )
}
