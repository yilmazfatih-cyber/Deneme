/**
 * Vitrin senaryolarının tarayıcı ortamı: API istekleri çerçevenin sanal cihaz adını taşır (x-tvplus-vd), çerçeveler
 * aynı kökten açıldığı için konumları ve DOM'ları okunabilir.
 */
import { CLIENT, HEADERS, ROUTES } from '../../../../shared/constants'
import type { ProfilesResponse } from '../../../../shared/devices'
import type { BootContext } from '../../../../shared/types'
import type { FrameId, FrameMedia, ShowcaseEnv } from './scenarios'

const FORM: Record<FrameId, string> = { tv: 'tv', web: 'web', telefon: 'mobil' }
export const HOME_ROUTE: Record<FrameId, string> = { tv: '/tv', web: '/', telefon: '/' }

let reloads = 0

/** Çerçeve adresi: ?vd=<ad>&cihaz=<biçim>[&y=<n>]#<yol> — `fresh` yeniden yüklemeyi zorlar. */
export function frameUrl(id: FrameId, route: string, fresh = false): string {
  const q = new URLSearchParams({ vd: id, cihaz: FORM[id] })
  if (fresh) q.set('y', String(++reloads))
  return `/?${q.toString()}#${route}`
}

async function api<T>(vd: FrameId, method: string, path: string, body?: unknown, authURL?: string | null): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    [HEADERS.VIRTUAL_DEVICE]: vd,
    [HEADERS.CLIENT_TYPE]: CLIENT.TYPE,
  }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (authURL) headers[HEADERS.AUTH_URL] = authURL
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const boot = (vd: FrameId) => api<BootContext>(vd, 'GET', ROUTES.BOOT)

export function createBrowserEnv(frames: () => Partial<Record<FrameId, HTMLIFrameElement | null>>): ShowcaseEnv {
  const win = (id: FrameId): Window | null => frames()[id]?.contentWindow ?? null
  const doc = (id: FrameId): Document | null => {
    try {
      return frames()[id]?.contentDocument ?? null
    } catch {
      return null
    }
  }
  return {
    async session(vd) {
      const b = await boot(vd)
      return { member: b.membershipStatus === 'CURRENT_MEMBER', profileGuid: b.activeProfile?.guid ?? null }
    },
    async login(vd) {
      await api(vd, 'POST', ROUTES.LOGIN, {})
    },
    async logout(vd) {
      await api(vd, 'POST', ROUTES.LOGOUT, {})
    },
    async pickProfile(vd) {
      const b = await boot(vd)
      const { profiles } = await api<ProfilesResponse>(vd, 'GET', ROUTES.PROFILES)
      const p = profiles.find((x) => !x.isLocked && !x.isKids) ?? profiles.find((x) => !x.isLocked)
      if (!p) throw new Error('Kilitsiz profil yok')
      await api(vd, 'POST', ROUTES.PROFILE_SWITCH, { guid: p.guid }, b.authURL)
      return p.guid
    },
    async approveTv(by, userCode, profileGuid) {
      const b = await boot(by)
      await api(
        by,
        'POST',
        `${ROUTES.TV_LOGIN}/approve`,
        profileGuid ? { userCode, profileGuid } : { userCode },
        b.authURL,
      )
    },
    open(id, route) {
      const f = frames()[id]
      if (f) f.src = frameUrl(id, route, true)
    },
    go(id, route) {
      const w = win(id)
      if (w) w.location.hash = `#${route}`
    },
    route(id) {
      try {
        const h = win(id)?.location.hash ?? ''
        return h.startsWith('#') ? decodeURIComponent(h.slice(1)) : null
      } catch {
        return null
      }
    },
    text(id, selector) {
      const el = doc(id)?.querySelector(selector)
      return el ? (el.textContent ?? '') : null
    },
    click(id, selector) {
      const el = doc(id)?.querySelector(selector)
      if (!el || !('click' in el)) return false
      ;(el as HTMLElement).click()
      return true
    },
    media(id): FrameMedia | null {
      const v = doc(id)?.querySelector('video')
      if (!v) return null
      return { playing: !v.paused && !v.ended && v.readyState >= 2, time: v.currentTime }
    },
    sleep: (ms) => new Promise((r) => window.setTimeout(r, ms)),
    now: () => Date.now(),
  }
}
