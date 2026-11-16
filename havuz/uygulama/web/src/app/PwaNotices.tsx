/**
 * PWA bildirimleri: "Yeni sürüm hazır · Yenile" ve ilk kurulumdan sonra "artık internetsiz de açılır".
 * Durum lib/pwa.ts'ten gelir (yalnız derlenmiş sürümde servis çalışanı vardır).
 */
import { useEffect } from 'react'
import { t } from '../i18n/index.ts'
import { applyUpdate, dismissUpdate, usePwaState } from '../lib/pwa.ts'
import { useToast } from '../ui/index.ts'

export function PwaNotices() {
  const { needRefresh, offlineReady } = usePwaState()
  const toast = useToast()

  useEffect(() => {
    if (!needRefresh) return
    toast.show({
      key: 'pwa-surum',
      message: t('pwa.updateReady'),
      durationMs: null,
      action: {
        label: t('common.reload'),
        onAction: async () => {
          dismissUpdate()
          await applyUpdate()
        },
      },
    })
  }, [needRefresh, toast])

  useEffect(() => {
    if (offlineReady) toast.show({ key: 'pwa-hazir', message: t('pwa.offlineReady'), tone: 'success' })
  }, [offlineReady, toast])

  return null
}
