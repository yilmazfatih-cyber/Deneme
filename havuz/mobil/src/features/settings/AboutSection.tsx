/**
 * Ayarlar → Hakkında: uygulama adı, sürümü, kip (hesapsız / hesaplı), eşitleme protokolü ve gizlilik özeti.
 * Genişletme: gizlilik politikası bağlantısı eklenecekse (mağaza ister) expo-linking ile `Button` ekleyin.
 */
import { PROTOCOL_VERSION } from '@uygulama/shared'
import { t } from '../../i18n/index.ts'
import { APP_VERSION } from '../../config.ts'
import { useSession } from '../../lib/session/context.ts'
import { AppText, Card, Heading } from '../../ui/index.ts'

export function AboutSection() {
  const { state, apiEnabled } = useSession()
  const mode =
    state.status === 'account'
      ? t('settings.about.modeAccount', { email: state.session.user.email })
      : apiEnabled
        ? t('settings.about.modeGuest')
        : t('settings.about.modeLocalBuild')
  return (
    <Card>
      <Heading level={2}>{t('settings.about')}</Heading>
      <AppText>{t('settings.about.version', { app: t('app.name'), version: APP_VERSION })}</AppText>
      <AppText tone="muted">{mode}</AppText>
      <AppText size="small" tone="muted">
        {t('settings.about.protocol', { version: PROTOCOL_VERSION })}
      </AppText>
      <AppText size="small" tone="muted">
        {t('settings.about.privacy')}
      </AppText>
    </Card>
  )
}
