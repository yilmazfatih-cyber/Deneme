/**
 * Açılış bağlamı ve oturum başlıkları. Sunucu bağlamı ilk HTML'e gömer (<script id="tvp-boot">);
 * geliştirmede (Vite) gömülemediği için GET /api/boot ile alınır.
 */
import { CLIENT, HEADERS, ROUTES } from '../../../shared/constants'
import type { BootContext } from '../../../shared/types'
import { devbus } from '../lib/devbus'

let boot: BootContext | null = null
const listeners = new Set<(b: BootContext) => void>()

export function currentBoot(): BootContext {
  if (!boot) throw new Error('Açılış bağlamı henüz yüklenmedi')
  return boot
}
export function peekBoot(): BootContext | null {
  return boot
}
export function onBootChange(fn: (b: BootContext) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function setBoot(b: BootContext): BootContext {
  boot = b
  for (const l of listeners) l(b)
  return b
}

/** İlk yükleme: gömülü bağlam varsa onu kullanır, yoksa sunucudan ister. */
export async function loadBoot(): Promise<BootContext> {
  const el = document.getElementById('tvp-boot')
  if (el?.textContent) {
    try {
      const b = JSON.parse(el.textContent) as BootContext
      devbus.emit('session', 'açılış bağlamı (HTML içinden)', { esn: b.esn, membershipStatus: b.membershipStatus, falcorCache: !!b.falcorCache })
      return setBoot(b)
    } catch {
      /* bozuksa sunucudan al */
    }
  }
  return refreshBoot()
}

/** Giriş / profil değişimi sonrası bağlamı yeniler. */
export async function refreshBoot(): Promise<BootContext> {
  const t0 = performance.now()
  const res = await fetch(ROUTES.BOOT, { credentials: 'same-origin', headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`Açılış bağlamı alınamadı (${res.status})`)
  const b = (await res.json()) as BootContext
  devbus.emit('session', 'açılış bağlamı (GET /api/boot)', { esn: b.esn, membershipStatus: b.membershipStatus, traceId: res.headers.get(HEADERS.TRACE_ID) }, { ms: performance.now() - t0 })
  return setBoot(b)
}

/** Her API isteğine eklenen kimlik başlıkları (Netflix x-netflix.* karşılıkları). */
export function sessionHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    [HEADERS.CLIENT_TYPE]: CLIENT.TYPE,
    [HEADERS.UI_FLAVOR]: CLIENT.TYPE,
    [HEADERS.DESIGN_VERSION]: CLIENT.DESIGN_VERSION,
  }
  if (boot) {
    h[HEADERS.ESN] = boot.esn
    if (boot.activeProfile) h[HEADERS.PROFILE_GUID] = boot.activeProfile.guid
    if (boot.authURL) h[HEADERS.AUTH_URL] = boot.authURL
  }
  return h
}
