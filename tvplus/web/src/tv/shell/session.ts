/**
 * TV oturumu — web/src/api/session.ts üzerinde ince katman (web kabuğunun deposuna bağlı değil).
 * Giriş / çıkış / profil değişiminde yeni BootContext uygulanır ve istemci önbellekleri (Falcor, GraphQL) boşaltılır:
 * başka profilin verisi ekranda kalmaz.
 */
import { useSyncExternalStore } from 'react'
import { ROUTES } from '../../../../shared/constants'
import type { ApiError, BootContext } from '../../../../shared/types'
import { falcor } from '../../api/falcor'
import { queryCache } from '../../api/hooks'
import { applyBoot, loadBoot, onBootChange, peekBoot, refreshBoot, sessionHeaders } from '../../api/session'

const subscribe = (fn: () => void): (() => void) => {
  const off = onBootChange(() => fn())
  return () => {
    off()
  }
}

/** Geçerli açılış bağlamı (yüklenmediyse null); değişince yeniden çizer. */
export function useTvBoot(): BootContext | null {
  return useSyncExternalStore(subscribe, peekBoot, peekBoot)
}

let loading: Promise<BootContext> | null = null

/** Bağlam yoksa yükler (kabuk TvApp'i bağlamdan önce bağlarsa). Aynı anda tek istek. */
export function ensureBoot(): Promise<BootContext> {
  const b = peekBoot()
  if (b) return Promise.resolve(b)
  loading ??= loadBoot().then(
    (boot) => {
      if (boot.falcorCache) falcor.setCache(boot.falcorCache)
      return boot
    },
    (err: unknown) => {
      loading = null
      throw err
    },
  )
  return loading
}

/** Yeni bağlamı uygular ve önbellekleri boşaltır (Falcor tohumu yeniden ekilir). */
export function adoptBoot(boot: BootContext): BootContext {
  falcor.clear()
  if (boot.falcorCache) falcor.setCache(boot.falcorCache)
  queryCache.invalidate()
  return applyBoot(boot)
}

const isBoot = (b: unknown): b is BootContext =>
  typeof b === 'object' && b !== null && typeof (b as BootContext).membershipStatus === 'string'

async function postForBoot(path: string): Promise<BootContext> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { ...sessionHeaders(), 'content-type': 'application/json', accept: 'application/json' },
    body: '{}',
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
  const data: unknown = await res.json().catch(() => null)
  return adoptBoot(isBoot(data) ? data : await refreshBoot())
}

/** "Bu TV'de demo hesabıyla giriş yap": POST /api/login. */
export function loginDemo(): Promise<BootContext> {
  return postForBoot(ROUTES.LOGIN)
}

/** Çıkış: POST /api/logout. */
export function logout(): Promise<BootContext> {
  return postForBoot(ROUTES.LOGOUT)
}

/** TV girişi onaylandı: yoklama yanıtındaki bağlamı (yoksa sunucudakini) uygular. */
export async function adoptApprovedLogin(boot: BootContext | null): Promise<BootContext> {
  return adoptBoot(boot ?? (await refreshBoot()))
}
