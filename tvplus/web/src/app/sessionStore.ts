/**
 * Oturum deposu (zustand) — api/session.ts üzerinde: açılış bağlamı, giriş / çıkış / profil değişimi.
 * Her eylem yeni BootContext'i uygular, istemci önbelleklerini (Falcor modeli, sorgu önbelleği) boşaltır ve yönlendirir.
 * Bu üründe kimlik formu yoktur: giriş, demo hesabını açan gövdesiz bir POST'tur.
 *
 * Profil değişimi kilitli profiller için PIN taşır: `deviceClient.switchProfile(guid, pin)` (hazırsa), değilse
 * POST /api/profiles/switch { guid, pin }. Sonuç bir nesnedir; PIN ekranı hatayı kendisi gösterir.
 * Gidilmek istenen adres (korumaların hatırladığı) giriş ve profil seçiminden sonra açılır.
 */
import { create } from 'zustand'
import { ROUTES } from '../../../shared/constants'
import type { BootContext } from '../../../shared/types'
import { falcor } from '../api/falcor'
import { queryCache } from '../api/hooks'
import { applyBoot, loadBoot, onBootChange, refreshBoot } from '../api/session'
import { deviceClient } from '../devices/client'
import { devbus } from '../lib/devbus'
import { toast } from '../ui'
import { errorCode, requestJson, withRestFallback } from './deviceApi'
import { afterLoginTarget, afterProfileTarget, WELCOME_PATH } from './access'
import {
  EMPTY_PIN_STATE,
  pinLockMessage,
  pinLockRemainingSec,
  registerPinFailure,
  type PinAttemptState,
} from './pinLock'

export type SessionStatus = 'loading' | 'ready' | 'error'
type NavigateFn = (to: string, opts?: { replace?: boolean }) => void

export type SwitchProfileResult =
  | { ok: true; boot: BootContext }
  | {
      ok: false
      /** PIN_REQUIRED: PIN sorulmalı · PIN_INVALID: yanlış · PIN_LOCKED: çok deneme · ERROR: başka hata */
      code: 'PIN_REQUIRED' | 'PIN_INVALID' | 'PIN_LOCKED' | 'ERROR'
      /** Kullanıcıya gösterilecek kısa metin */
      message: string
      /** PIN_LOCKED: kalan bekleme (sn) */
      retryAfterSec?: number
    }

export interface SessionState {
  status: SessionStatus
  boot: BootContext | null
  /** Açılış bağlamı alınamadıysa nedeni */
  error: string | null
  /** Giriş / çıkış / profil değişimi sürüyor */
  busy: boolean
  /** Açılış bağlamını yükler (uygulama başında bir kez). */
  init: () => Promise<void>
  /** POST /api/login → hatırlanan adrese ya da profil kapısına gider. */
  login: () => Promise<BootContext | null>
  /** POST /api/logout → cihaz akışı kapanır, karşılamaya dönülür. */
  logout: () => Promise<BootContext | null>
  /**
   * Profil değiştirir. Başarılıysa önbellekler boşalır ve (navigate ≠ false) hatırlanan adrese / ana sayfaya gidilir.
   * Kilitli profilde PIN verilmezse { ok:false, code:'PIN_REQUIRED' } döner.
   */
  switchProfile: (guid: string, pin?: string, opts?: { navigate?: boolean }) => Promise<SwitchProfileResult>
  /** Profil eklendi / düzenlendi / silindi: açılış bağlamını yeniden alır (profil listesi, etkin profil). */
  reloadBoot: () => Promise<BootContext | null>
}

let navigate: NavigateFn | null = null
let initPromise: Promise<void> | null = null

/** Kabuk, yönlendiriciyi depoya bağlar (eylemler sonrası yönlendirme için). */
export function setSessionNavigator(fn: NavigateFn | null): void {
  navigate = fn
}

/* ───────────── Dönüş adresi ───────────── */

const NEXT_KEY = 'tvp.sonra'

/** Korumalar: girişten / profil seçiminden sonra açılacak adresi hatırla. */
export function rememberNextPath(path: string | null): void {
  try {
    if (path) sessionStorage.setItem(NEXT_KEY, path)
    else sessionStorage.removeItem(NEXT_KEY)
  } catch {
    /* depolama yok: dönüş adresi hatırlanmaz */
  }
}
export function peekNextPath(): string | null {
  try {
    return sessionStorage.getItem(NEXT_KEY)
  } catch {
    return null
  }
}
/**
 * Girişin az önce belirlediği hedef. Oturum bağlamı uygulanınca karşılama sayfasının koruması da yeniden çizilir ve
 * yönlendirir; ikisi aynı adrese gitsin diye koruma bunu okur (yoksa /bagla?kod=… gibi hatırlanan adres ezilirdi).
 */
let loginTarget: string | null = null
export function peekLoginTarget(): string | null {
  return loginTarget
}

function takeNextPath(): string | null {
  const v = peekNextPath()
  rememberNextPath(null)
  return v
}

/* ───────────── Yardımcılar ───────────── */

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

const pinAttempts = new Map<string, PinAttemptState>()

export const useSession = create<SessionState>()((set, get) => {
  /** Yeni bağlamı uygula + önbellekleri boşalt + depoyu güncelle. */
  const adopt = (boot: BootContext): BootContext => {
    applyBoot(boot)
    resetClientCaches(boot)
    set({ boot, status: 'ready', error: null })
    return boot
  }

  const postBoot = async (path: string, body: object): Promise<BootContext> => {
    const data = await requestJson<unknown>('POST', path, body)
    return isBoot(data) ? data : refreshBoot()
  }

  return {
    status: 'loading',
    boot: null,
    error: null,
    busy: false,

    init: () => {
      // StrictMode çift çağrısında tek istek; hata sonrası "Tekrar Dene" yeniden yükler.
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

    login: async () => {
      if (get().busy) return null
      set({ busy: true })
      const t0 = performance.now()
      try {
        const raw = await postBoot(ROUTES.LOGIN, {})
        // Hedef, bağlam uygulanmadan ÖNCE belirlenir: koruma yeniden çizildiğinde aynı adresi görsün.
        const next = peekNextPath()
        const target = afterLoginTarget(raw, next)
        loginTarget = target
        if (target === next) rememberNextPath(null)
        const boot = adopt(raw)
        devbus.emit('session', 'giriş', { membershipStatus: boot.membershipStatus }, { ms: performance.now() - t0 })
        navigate?.(target, { replace: true })
        window.setTimeout(() => {
          if (loginTarget === target) loginTarget = null
        }, 2000)
        return boot
      } catch (err) {
        devbus.emit('session', 'giriş başarısız', { error: String(err) }, { ms: performance.now() - t0, ok: false })
        toast('Giriş yapılamadı. Tekrar dene.', { kind: 'error' })
        return null
      } finally {
        set({ busy: false })
      }
    },

    logout: async () => {
      if (get().busy) return null
      set({ busy: true })
      const t0 = performance.now()
      try {
        try {
          deviceClient.stop()
        } catch {
          /* cihaz akışı zaten kapalı */
        }
        const boot = adopt(await postBoot(ROUTES.LOGOUT, {}))
        rememberNextPath(null)
        pinAttempts.clear()
        devbus.emit('session', 'çıkış', {}, { ms: performance.now() - t0 })
        navigate?.(WELCOME_PATH, { replace: true })
        return boot
      } catch (err) {
        devbus.emit('session', 'çıkış başarısız', { error: String(err) }, { ms: performance.now() - t0, ok: false })
        toast('Çıkış yapılamadı. Tekrar dene.', { kind: 'error' })
        return null
      } finally {
        set({ busy: false })
      }
    },

    switchProfile: async (guid, pin, opts) => {
      if (get().busy) return { ok: false, code: 'ERROR', message: 'Bir işlem sürüyor.' }
      const attempts = pinAttempts.get(guid) ?? EMPTY_PIN_STATE
      const wait = pinLockRemainingSec(attempts, Date.now())
      if (pin !== undefined && wait > 0)
        return { ok: false, code: 'PIN_LOCKED', message: pinLockMessage(wait), retryAfterSec: wait }

      set({ busy: true })
      const t0 = performance.now()
      try {
        const raw = await withRestFallback(
          () => deviceClient.switchProfile(guid, pin),
          () => postBoot(ROUTES.PROFILE_SWITCH, pin !== undefined ? { guid, pin } : { guid }),
        )
        pinAttempts.delete(guid)
        const boot = adopt(raw)
        devbus.emit(
          'session',
          'profil değişimi',
          { profile: guid, pin: pin !== undefined },
          { ms: performance.now() - t0 },
        )
        if (opts?.navigate !== false) navigate?.(afterProfileTarget(takeNextPath()), { replace: true })
        return { ok: true, boot }
      } catch (err) {
        const code = errorCode(err)
        devbus.emit(
          'session',
          'profil değişimi başarısız',
          { profile: guid, code },
          { ms: performance.now() - t0, ok: false },
        )
        if (code === 'PIN_REQUIRED') return { ok: false, code, message: 'Bu profil kilitli. PIN gir.' }
        if (code === 'PIN_INVALID') {
          const next = registerPinFailure(attempts, Date.now())
          pinAttempts.set(guid, next)
          const locked = pinLockRemainingSec(next, Date.now())
          if (locked > 0)
            return { ok: false, code: 'PIN_LOCKED', message: pinLockMessage(locked), retryAfterSec: locked }
          return { ok: false, code, message: 'PIN eşleşmedi. Tekrar dene.' }
        }
        if (code === 'PIN_LOCKED' || code === 'HTTP_429') {
          // Sunucunun kendi bekleme süresi iletide ("… 41 sn sonra …"); okunamazsa 60 sn.
          const sec = Number(/(\d+)\s*sn/.exec(err instanceof Error ? err.message : '')?.[1] ?? 60)
          pinAttempts.set(guid, { failures: 0, lockedUntil: Date.now() + sec * 1000 })
          return { ok: false, code: 'PIN_LOCKED', message: pinLockMessage(sec), retryAfterSec: sec }
        }
        return { ok: false, code: 'ERROR', message: 'Profil açılamadı. Tekrar dene.' }
      } finally {
        set({ busy: false })
      }
    },

    reloadBoot: async () => {
      try {
        const boot = await refreshBoot()
        set({ boot, status: 'ready', error: null })
        return boot
      } catch (err) {
        devbus.emit('session', 'bağlam yenilenemedi', { error: String(err) }, { ok: false })
        return null
      }
    },
  }
})

// Bağlam başka bir yerden yenilenirse (ör. oynatıcı, cihaz istemcisi, bildirim) depo da güncellenir.
onBootChange((boot) => {
  if (useSession.getState().boot !== boot) useSession.setState({ boot, status: 'ready' })
})

/** Kısayollar */
export const useBoot = () => useSession((s) => s.boot)
export const useActiveProfile = () => useSession((s) => s.boot?.activeProfile ?? null)
