import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Role } from '../shared/labels.ts'
import { api, storageGet, storageSet, useApi } from './lib.ts'

export type Me = {
  user: { id: number; name: string; email: string | null; phone: string | null; role: Role }
  org: { id: number; name: string }
  sites: { id: number; name: string; kind: string; district: string | null; city: string | null }[]
  units: { id: number; no: string; block: string | null; site_name: string; site_id: number; role: string }[]
  ai: { engine: 'claude' | 'kural'; model: string | null; maskPii: boolean }
  demo: boolean
  payments: { enabled: boolean; provider: string }
}

type AuthCtx = { me: Me | null; loading: boolean; refresh: () => void; logout: () => Promise<void> }
const Auth = createContext<AuthCtx>({ me: null, loading: true, refresh: () => {}, logout: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, error, loading, reload } = useApi<Me>('/auth/me')
  useEffect(() => {
    const onExpired = () => reload()
    window.addEventListener('kahya:oturum', onExpired)
    return () => window.removeEventListener('kahya:oturum', onExpired)
  }, [reload])
  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => null)
    reload()
  }, [reload])
  const value = useMemo(
    () => ({ me: error ? null : (data ?? null), loading: loading && !data && !error, refresh: reload, logout }),
    [data, error, loading, reload, logout],
  )
  return <Auth.Provider value={value}>{children}</Auth.Provider>
}

export const useAuth = () => useContext(Auth)

type SiteCtx = {
  siteId: number | null
  setSiteId: (id: number) => void
  sites: Me['sites']
  site: Me['sites'][number] | null
}
const Site = createContext<SiteCtx>({ siteId: null, setSiteId: () => {}, sites: [], site: null })

export function SiteProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth()
  const sites = useMemo(() => me?.sites ?? [], [me])
  const [chosen, setChosen] = useState<number | null>(() => Number(storageGet('kahya:site')) || null)
  const siteId = sites.some((s) => s.id === chosen) ? chosen : (sites[0]?.id ?? null)
  const setSiteId = useCallback((id: number) => {
    setChosen(id)
    storageSet('kahya:site', String(id))
  }, [])
  const value = useMemo(
    () => ({ siteId, setSiteId, sites, site: sites.find((s) => s.id === siteId) ?? null }),
    [siteId, setSiteId, sites],
  )
  return <Site.Provider value={value}>{children}</Site.Provider>
}

export const useSite = () => useContext(Site)

type Toast = { id: number; text: string; tone: 'ok' | 'bad' }
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'bad') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const push = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 6000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'bad' ? 'bad' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

/** Bir işlemi çalıştırır; hata olursa bildirim gösterir. Çalışırken `busy` true döner. */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string | ((r: T) => string)): Promise<T | undefined> => {
      setBusy(true)
      try {
        const r = await fn()
        if (success) toast(typeof success === 'function' ? success(r) : success)
        return r
      } catch (e) {
        toast((e as Error).message, 'bad')
        return undefined
      } finally {
        setBusy(false)
      }
    },
    [toast],
  )
  return { busy, run }
}
