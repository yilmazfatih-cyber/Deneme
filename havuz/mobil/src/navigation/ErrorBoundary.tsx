/**
 * Ekran hata sınırı (Expo Router): bir ekran çizilirken hata olursa İngilizce varsayılan yerine bu Türkçe ekran
 * çıkar; "Yeniden dene" ekranı yeniden çizer. Veriler yerel veritabanında güvendedir.
 *
 * Genişletme: hatayı bir izleme hizmetine (ör. Sentry) göndermek isterseniz `useEffect` içine ekleyin.
 */
import type { ErrorBoundaryProps } from 'expo-router'
import { useEffect } from 'react'
import { t } from '../i18n/index.ts'
import { AppText, Button, Screen } from '../ui/index.ts'

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('Ekran hatası:', error)
  }, [error])
  return (
    <Screen title={t('error.crashTitle')} heading edges={['top', 'bottom']}>
      <AppText tone="muted">{t('error.crashMessage')}</AppText>
      <Button label={t('common.retry')} onPress={() => void retry()} />
    </Screen>
  )
}
