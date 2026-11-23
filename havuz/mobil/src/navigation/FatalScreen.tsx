/**
 * Uygulamayı durduran hata ekranı: yerel veritabanı açılamadı ya da şema bu sürümden yeni (güncelleme gerekir).
 * Veri SİLİNMEZ; kullanıcıya ne yapacağı söylenir. Ayrıntı yalnız geliştirme günlüğüne yazılır.
 *
 * Genişletme: belirli bir hata türüne özel ileti → `messageFor` içine dal.
 */
import { useEffect } from 'react'
import { t } from '../i18n/index.ts'
import { SchemaTooNewError } from '../lib/store/schema.ts'
import { AppText, Banner, Screen } from '../ui/index.ts'

function messageFor(error: Error): string {
  return error instanceof SchemaTooNewError ? t('fatal.schemaTooNew') : t('fatal.message')
}

export function FatalScreen({ error }: { error: Error }) {
  useEffect(() => {
    console.error('Uygulama açılamadı:', error)
  }, [error])
  return (
    <Screen title={t('fatal.title')} heading edges={['top', 'bottom']}>
      <Banner tone="danger" message={messageFor(error)} />
      <AppText tone="muted">{t('fatal.hint')}</AppText>
    </Screen>
  )
}
