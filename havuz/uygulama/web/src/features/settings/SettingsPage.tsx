/**
 * Ayarlar (/ayarlar): görünüm, veri (dışa/içe aktarma), eşitleme, depolama, hakkında; yöneticiye kullanıcı yönetimi.
 * Genişletme (yeni ayar): küçükse ilgili karta satır ekleyin; büyükse `…Card.tsx` yazıp buraya koyun.
 */
import { ShieldCheck } from 'lucide-react'
import { t } from '../../i18n/index.ts'
import { useSession } from '../../lib/session/context.ts'
import { ButtonLink, Card, PageHeader } from '../../ui/index.ts'
import { AboutCard, StorageCard } from './AboutCard.tsx'
import { AppearanceCard } from './AppearanceCard.tsx'
import { DataCard } from './DataCard.tsx'
import { SyncCard } from './SyncCard.tsx'

export function SettingsPage() {
  const { state } = useSession()
  const admin = state.status === 'account' && state.session.user.role === 'admin'
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="flex flex-col gap-5">
        <AppearanceCard />
        <SyncCard />
        <DataCard />
        <StorageCard />
        {admin && (
          <Card title={t('admin.title')} description={t('admin.description')}>
            <ButtonLink to="/yonetim" variant="secondary" icon={ShieldCheck}>
              {t('admin.open')}
            </ButtonLink>
          </Card>
        )}
        <AboutCard />
      </div>
    </>
  )
}
