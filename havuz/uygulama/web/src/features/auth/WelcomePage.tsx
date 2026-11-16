/**
 * Karşılama (/hos-geldiniz): ilk açılışta üç seçenek — hesap oluştur, giriş yap, hesapsız devam et.
 * Hesapsız derlemede (`VITE_API_URL=none`) bu ekran hiç gösterilmez.
 */
import { CloudCheck, Smartphone, Users } from 'lucide-react'
import { APP } from '../../app/config.ts'
import { t } from '../../i18n/index.ts'
import { ButtonLink } from '../../ui/index.ts'
import { AuthLayout } from './AuthLayout.tsx'
import { ContinueWithoutAccount } from './ContinueWithoutAccount.tsx'

const POINTS = [
  { icon: Smartphone, key: 'welcome.point.offline' },
  { icon: CloudCheck, key: 'welcome.point.sync' },
  { icon: Users, key: 'welcome.point.share' },
] as const

export function WelcomePage() {
  return (
    <AuthLayout title={t('welcome.title', { app: APP.name })} description={t('welcome.description')}>
      <ul className="mb-7 flex flex-col gap-3">
        {POINTS.map(({ icon: Icon, key }) => (
          <li key={key} className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
              <Icon aria-hidden size={20} />
            </span>
            <span className="pt-1.5">{t(key)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <ButtonLink to="/kayit" block>
          {t('welcome.register')}
        </ButtonLink>
        <ButtonLink to="/giris" variant="secondary" block>
          {t('welcome.login')}
        </ButtonLink>
        <ContinueWithoutAccount />
        <p className="mt-1 text-center text-sm text-muted">{t('welcome.localHint')}</p>
      </div>
    </AuthLayout>
  )
}
