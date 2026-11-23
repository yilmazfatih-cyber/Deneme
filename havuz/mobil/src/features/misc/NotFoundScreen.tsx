/**
 * Bulunamayan adres (+not-found): eski bir bağlantı ya da yanlış yazılmış adres. Görevlere dönüş düğmesi.
 * Genişletme: gerekirse sık yanlış adresleri doğru ekrana yönlendirin (Redirect).
 */
import { router } from 'expo-router'
import { t } from '../../i18n/index.ts'
import { Button, EmptyState, Screen } from '../../ui/index.ts'

export function NotFoundScreen() {
  return (
    <Screen title={t('notFound.title')}>
      <EmptyState
        icon="alert-circle-outline"
        title={t('notFound.title')}
        message={t('notFound.message')}
        action={<Button label={t('notFound.home')} onPress={() => router.replace('/')} />}
      />
    </Screen>
  )
}
