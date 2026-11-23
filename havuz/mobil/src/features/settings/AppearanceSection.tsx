/**
 * Ayarlar → Görünüm: tema (sistem / açık / koyu). Seçim cihaz ayarlarında saklanır, hemen uygulanır.
 * Yazı boyutu telefonun kendi ayarından gelir (Erişilebilirlik → Yazı boyutu); uygulama ona uyar.
 *
 * Genişletme: yeni bir görünüm ayarı → deviceStore.ts'e alan, SessionApi'ye yöntem, burada denetim.
 */
import { t, type MessageKey } from '../../i18n/index.ts'
import { useSession } from '../../lib/session/context.ts'
import { AppText, Card, ChoiceGroup, Heading, THEME_CHOICES, type ThemeChoice } from '../../ui/index.ts'

const THEME_LABELS: Record<ThemeChoice, MessageKey> = {
  system: 'settings.theme.system',
  light: 'settings.theme.light',
  dark: 'settings.theme.dark',
}

export function AppearanceSection() {
  const { theme, setTheme } = useSession()
  return (
    <Card>
      <Heading level={2}>{t('settings.appearance')}</Heading>
      <ChoiceGroup
        label={t('settings.theme')}
        value={theme}
        onChange={(choice) => void setTheme(choice)}
        options={THEME_CHOICES.map((value) => ({ value, label: t(THEME_LABELS[value]) }))}
      />
      <AppText size="small" tone="muted">
        {t('settings.fontHint')}
      </AppText>
    </Card>
  )
}
