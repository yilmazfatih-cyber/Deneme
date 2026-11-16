/**
 * Yayından sonra açık kalmış eski bir sayfa, sunucuda artık olmayan bir parça (chunk) dosyasını isterse Vite
 * `vite:preloadError` olayını yayar ve sayfa yarım kalır. Bir kez yenilemek yeni sürümü getirir.
 * Sonsuz yenileme döngüsü olmasın diye bir oturumda yalnız BİR kez yenilenir; ikinci hatada olay engellenmez ve hata
 * sınırına (ErrorBoundary) ulaşır.
 *
 * Kullanım: main.tsx açılışta bir kez `installPreloadRecovery()` çağırır.
 * Genişletme: yenilemeden önce kullanıcıya bir bildirim göstermek gerekirse `onRecover` seçeneğine işlev verin.
 */

export const PRELOAD_RELOAD_KEY = 'uygulama:preload-yenilendi'

interface RecoveryTarget {
  addEventListener(type: 'vite:preloadError', listener: (event: Event) => void): void
  readonly location: { reload(): void }
  readonly sessionStorage: Pick<Storage, 'getItem' | 'setItem'>
}

function alreadyReloaded(storage: RecoveryTarget['sessionStorage']): boolean {
  try {
    return storage.getItem(PRELOAD_RELOAD_KEY) === '1'
  } catch {
    return true // depolama kapalıysa (gizli pencere vb.) döngü riskine girmeyiz: yenilemeyiz
  }
}

export function installPreloadRecovery(
  target: RecoveryTarget = window,
  options: { readonly onRecover?: () => void } = {},
): void {
  target.addEventListener('vite:preloadError', (event) => {
    if (alreadyReloaded(target.sessionStorage)) return
    try {
      target.sessionStorage.setItem(PRELOAD_RELOAD_KEY, '1')
    } catch {
      return
    }
    event.preventDefault()
    options.onRecover?.()
    target.location.reload()
  })
}
