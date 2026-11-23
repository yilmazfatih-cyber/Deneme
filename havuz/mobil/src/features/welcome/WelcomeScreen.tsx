/**
 * Karşılama ekranı (/welcome): ilk açılışta. Üç yol: hesapsız devam et (veri yalnız telefonda), giriş yap, hesap
 * oluştur. API ayarlı değilse (API_URL=none) yalnız "Başla" görünür.
 *
 * Genişletme: tanıtım adımları eklenecekse bu ekranı bölmeyin; yeni bir ekran açıp buradan geçin.
 */
import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { t } from '../../i18n/index.ts'
import { useSession } from '../../lib/session/context.ts'
import { AppText, Button, Icon, Screen, SPACE, useTheme } from '../../ui/index.ts'

const POINTS = ['welcome.point.offline', 'welcome.point.sync', 'welcome.point.private'] as const

export function WelcomeScreen() {
  const { apiEnabled, finishWelcome } = useSession()
  const { colors } = useTheme()
  const footer = (
    <>
      {apiEnabled ? (
        <>
          <Button label={t('welcome.register')} onPress={() => router.push('/register')} />
          <Button label={t('welcome.login')} variant="secondary" onPress={() => router.push('/login')} />
        </>
      ) : null}
      <Button
        label={apiEnabled ? t('welcome.continueLocal') : t('welcome.start')}
        variant={apiEnabled ? 'ghost' : 'primary'}
        onPress={() =>
          void finishWelcome().then(() => {
            router.replace('/tasks')
          })
        }
      />
    </>
  )
  return (
    <Screen title={t('welcome.title', { app: t('app.name') })} heading edges={['top', 'bottom']} footer={footer}>
      <AppText size="large" tone="muted">
        {t('welcome.description')}
      </AppText>
      <View style={styles.points}>
        {POINTS.map((key) => (
          <View key={key} style={styles.point}>
            <Icon name="checkmark-circle" color={colors.success} />
            <AppText style={styles.grow}>{t(key)}</AppText>
          </View>
        ))}
      </View>
      {apiEnabled ? (
        <AppText size="small" tone="muted">
          {t('welcome.localHint')}
        </AppText>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  points: { gap: SPACE.md },
  point: { flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start' },
  grow: { flex: 1 },
})
