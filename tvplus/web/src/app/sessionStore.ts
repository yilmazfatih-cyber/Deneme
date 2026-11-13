/**
 * Oturum deposu (zustand) — api/session.ts üzerinde: açılış bağlamı, giriş/çıkış, profil değişimi.
 * Her eylem yeni BootContext'i alır, istemci önbelleklerini (Falcor modeli, sorgu önbelleği) boşaltır ve yönlendirir.
 * Bu üründe kimlik formu yoktur: giriş, demo hesabını açan gövdesiz bir POST'tur.
 */
import { create } from 'zustand'
import { ROUTES } from '../../../shared/constants'
import type { ApiError, BootContext } from '../../../shared/types'
import { falcor } from '../api/falcor'
import { queryCache } from '../api/hooks'
import { applyBoot, loadBoot, onBootChange, refreshBoot, sessionHeaders } from '../api/session'
import { toast } from '../design'
import { devbus } from '../lib/devbus'
import { lastModePath } from './mode'

export type SessionStatus = 'loading' | 'ready' | 'error'
type NavigateFn = (to: string, opts?: { replace?: boolean }) => void

export interface SessionState {
  status: SessionStatus
  boot: BootContext | null
  /** Açılış bağlamı alınamadıysa nedeni */
  error: string | null
  /** Giriş / çıkış / profil değişimi sürüyor */
  busy: boolean
  /** Açılış bağlamını yükler (uygulama başında bir kez). */
  init: () => Promise<void>
  /** POST /api/login → üye olur, profil kapısına gider. */
  login: () => Promise<BootContext | null>
  /** POST /api/logout → karşılama sayfasına döner. */
  logout: () => Promise<BootContext | null>
  /** POST /api/profiles/switch { guid } → son kullanılan moda gider. */
  switchProfile: (guid: string) => Promise<BootContext | null>
}

let navigate: NavigateFn | null = null
let initPromise: Promise<void> | null = null
/** Kabuk, yönlendiriciyi depoya bağlar (eylemler sonrası yönlendirme için). */
export function setSessionNavigator(fn: NavigateFn | null): void {
  navigate = fn
}

/** Falcor modeli + sorgu önbelleği: başka profilin verisi ekranda kalmaz. Boot tohumu yeniden ekilir. */
function resetClientCaches(boot: BootContext): void {
  falcor.clear()
  if (boot.falcorCache) falcor.setCache(boot.falcorCache)
  queryCache.invalidate()
}

const isBoot = (b: unknown): b is BootContext =>
  typeof b === 'object' &&
  b !== null &&
  typeof (b as BootContext).membershipStatus === 'string' &&
  Array.isArray((b as BootContext).profiles)

/** POST; yanıt gövdesi yeni BootContext'tir (değilse null). */
async function post(path: string, body: object): Promise<BootContext | null> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { ...sessionHeaders(), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `${res.status}`
    try {
      message = ((await res.json()) as ApiError).error?.message ?? message
    } catch {
      /* gövde JSON değil */
    }
    throw new Error(message)
  }
  try {
    const data: unknown = await res.json()
    return isBoot(data) ? data : null
  } catch {
    return null
  }
}

export const useSession = create<SessionState>()((set, get) => {
  /**
   * Eylem iskeleti: POST → yanıttaki BootContext'i uygula (applyBoot; oturum başlıkları da güncellenir)
   * → önbellekleri boşalt → yönlendir. Yanıt beklenen biçimde değilse yedek olarak GET /api/boot.
   */
  const act = async (
    label: string,
    path: string,
    body: object,
    failText: string,
    target: (b: BootContext) => string,
  ): Promise<BootContext | null> => {
    if (get().busy) return null
    set({ busy: true })
    const t0 = performance.now()
    try {
      const fromPost = await post(path, body)
      const boot = fromPost ? applyBoot(fromPost) : await refreshBoot()
      resetClientCaches(boot)
      set({ boot, busy: false, status: 'ready', error: null })
      devbus.emit(
        'session',
        label,
        { membershipStatus: boot.membershipStatus, profile: boot.activeProfile?.guid ?? null },
        { ms: performance.now() - t0 },
      )
      navigate?.(target(boot), { replace: true })
      return boot
    } catch (err) {
      set({ busy: false })
      devbus.emit('session', `${label} başarısız`, { error: String(err) }, { ms: performance.now() - t0, ok: false })
      toast(failText)
      return null
    }
  }

  return {
    status: 'loading',
    boot: null,
    error: null,
    busy: false,

    init: () => {
      // StrictMode çift çağrısında tek istek; hata sonrası "Tekrar dene" yeniden yükler.
      if (initPromise && get().status !== 'error') return initPromise
      set({ status: 'loading', error: null })
      initPromise = (async () => {
        try {
          const boot = await loadBoot()
          if (boot.falcorCache) falcor.setCache(boot.falcorCache)
          set({ boot, status: 'ready' })
        } catch (err) {
          set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
        }
      })()
      return initPromise
    },

    login: () =>
      act('giriş', ROUTES.LOGIN, {}, 'Giriş yapılamadı. Tekrar dene.', (b) =>
        b.activeProfile ? lastModePath() : '/profiller',
      ),

    logout: () => act('çıkış', ROUTES.LOGOUT, {}, 'Çıkış yapılamadı. Tekrar dene.', () => '/karsilama'),

    switchProfile: (guid) =>
      act('profil değişimi', ROUTES.PROFILE_SWITCH, { guid }, 'Profil değiştirilemedi. Tekrar dene.', () =>
        lastModePath(),
      ),
  }
})

// Bağlam başka bir yerden yenilenirse (ör. oynatıcı, bildirim) depo da güncellenir.
onBootChange((boot) => {
  if (useSession.getState().boot !== boot) useSession.setState({ boot, status: 'ready' })
})

/** Kısayollar */
export const useBoot = () => useSession((s) => s.boot)
export const useActiveProfile = () => useSession((s) => s.boot?.activeProfile ?? null)
