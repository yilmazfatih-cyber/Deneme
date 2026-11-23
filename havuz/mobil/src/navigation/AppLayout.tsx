/**
 * Uygulama içi yerleşim (src/app/(app)/_layout.tsx): karşılama geçilmediyse oraya yönlendirir; depo kapısıyla
 * (StoreGate) veritabanını ve seçili alanı verir; sekmeler + ayrıntı ekranları + giriş ekranları için iç yığın.
 *
 * Genişletme: yeni ayrıntı ekranı → src/app/(app)/<ad>.tsx; başlığı ekranın kendi `<Screen title>`'ından gelir.
 */
import { Redirect, Stack } from 'expo-router'
import { t } from '../i18n/index.ts'
import { StoreGate } from '../features/session/StoreGate.tsx'
import { useSession } from '../lib/session/context.ts'
import { Loading } from '../ui/index.ts'
import { useStackOptions } from './stackOptions.ts'

/** Derin bağlantıyla doğrudan bir ayrıntı ekranı açılsa da altında sekmeler olsun (geri tuşu çalışsın). */
export const unstable_settings = { anchor: '(tabs)' }

export function AppLayout() {
  const { state, welcomeDone } = useSession()
  const stackOptions = useStackOptions()
  if (state.status === 'loading') return <Loading label={t('common.loading')} />
  if (state.status === 'guest' && !welcomeDone) return <Redirect href="/welcome" />
  return (
    <StoreGate>
      <Stack screenOptions={stackOptions}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('nav.home') }} />
        <Stack.Screen name="workspaces" options={{ presentation: 'modal' }} />
      </Stack>
    </StoreGate>
  )
}
