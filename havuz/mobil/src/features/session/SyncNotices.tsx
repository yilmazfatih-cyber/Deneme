/**
 * Eşitleme olaylarını kullanıcıya bildirir (toast): reddedilen değişiklik, erişimi kalkan alan, sunucunun yedeğe
 * dönmesi (karar Ayarlar'da), oturumun düşmesi, uygulamanın güncellenmesi gereği. Görünür bir şey çizmez.
 *
 * Genişletme: yeni bir SyncEvent türü (lib/sync/engine.ts) → aşağıdaki `switch`e dal ekleyin (TypeScript gösterir).
 */
import { router } from 'expo-router'
import { useEffect } from 'react'
import { t } from '../../i18n/index.ts'
import { useSession } from '../../lib/session/context.ts'
import { useToast } from '../../ui/index.ts'

export function SyncNotices() {
  const { subscribeSyncEvents } = useSession()
  const toast = useToast()
  useEffect(
    () =>
      subscribeSyncEvents((event) => {
        switch (event.type) {
          case 'rejected': {
            const first = event.rejections[0]
            const message =
              event.rejections.length === 1 && first
                ? t('sync.rejectedOne', { message: first.message })
                : t('sync.rejectedMany', { count: event.rejections.length })
            toast.show({ message, tone: 'error' })
            break
          }
          case 'dropped':
            for (const workspace of event.workspaces) {
              toast.show({ message: t('sync.dropped', { name: workspace.name }), tone: 'info' })
            }
            break
          case 'reset':
            toast.show({
              message: t('sync.reset.title'),
              tone: 'error',
              action: { label: t('sync.reset.decide'), onAction: () => router.push('/settings') },
            })
            break
          case 'unauthorized':
            toast.show({
              message: t('account.expiredBanner'),
              tone: 'error',
              action: { label: t('account.relogin'), onAction: () => router.push('/login') },
            })
            break
          case 'upgrade_required':
            toast.show({ message: t('sync.upgrade'), tone: 'error' })
            break
        }
      }),
    [subscribeSyncEvents, toast],
  )
  return null
}
