/**
 * Ayarlar ekranı (/settings): hesap, çalışma alanı, görünüm, eşitleme, hakkında. Bölümler ayrı dosyalardadır.
 * Genişletme: yeni bölüm → `…Section.tsx` yazıp buraya ekleyin (sıra: en sık kullanılan üstte).
 */
import { router } from 'expo-router'
import { t } from '../../i18n/index.ts'
import { useSession } from '../../lib/session/context.ts'
import { useStore } from '../../lib/store/context.tsx'
import { AppText, Button, Card, Heading, Screen } from '../../ui/index.ts'
import { AboutSection } from './AboutSection.tsx'
import { AccountSection } from './AccountSection.tsx'
import { AppearanceSection } from './AppearanceSection.tsx'
import { SyncSection } from './SyncSection.tsx'

export function SettingsScreen() {
  const { db, workspace } = useStore()
  const { state } = useSession()
  return (
    <Screen title={t('settings.title')}>
      <AccountSection db={db} />
      <Card>
        <Heading level={2}>{t('workspace.title')}</Heading>
        <AppText>{t('workspace.currentNamed', { name: workspace.name })}</AppText>
        {state.status === 'account' ? (
          <Button
            label={t('workspace.change')}
            variant="secondary"
            icon="swap-horizontal"
            onPress={() => router.push('/workspaces')}
          />
        ) : (
          <AppText size="small" tone="muted">
            {t('workspace.localHint')}
          </AppText>
        )}
      </Card>
      <AppearanceSection />
      <SyncSection db={db} />
      <AboutSection />
    </Screen>
  )
}
