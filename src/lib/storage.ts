/**
 * Kalıcı depolama ve ana ekrana ekleme.
 * Safari uzun süre açılmayan sitelerin verisini silebilir; ana ekrandan açılan ve
 * kalıcı depolama izni alan uygulamanın verisi daha güvendedir.
 */

export async function requestPersistence(): Promise<boolean | undefined> {
  if (!navigator.storage?.persist) return undefined
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return undefined
  }
}

export async function isPersisted(): Promise<boolean | undefined> {
  if (!navigator.storage?.persisted) return undefined
  try {
    return await navigator.storage.persisted()
  } catch {
    return undefined
  }
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredInstall: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredInstall = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
}

export function canPromptInstall(): boolean {
  return deferredInstall !== null
}

export function onInstallAvailable(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredInstall) return false
  await deferredInstall.prompt()
  const choice = await deferredInstall.userChoice
  deferredInstall = null
  return choice.outcome === 'accepted'
}
