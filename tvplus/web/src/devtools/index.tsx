/**
 * "Kaputun altı" paneli: uygulamanın her mekaniğini kullanırken canlı gösterir.
 * Kapalıyken yalnızca küçük bir başlatıcı düğme vardır; panel kodu ilk açılışta yüklenir ve devbus'a
 * yalnızca açıkken abone olunur. Ctrl+. aç/kapat, Esc (panel içindeyken) kapatır.
 * Açık/kapalı durumu ve etkin sekme localStorage'da saklanır.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { devbus } from '../lib/devbus'
import './launcher.css'
import { isTabId, type TabId } from './tabIds'

const Panel = lazy(() => import('./Panel'))

const STORAGE_KEY = 'tvp.kaput.v1'

interface Persisted {
  open: boolean
  tab: TabId
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<Persisted>
      return { open: v.open === true, tab: isTabId(v.tab) ? v.tab : 'hat' }
    }
  } catch {
    /* gizli pencere / engelli depolama: varsayılanla devam */
  }
  return { open: false, tab: 'hat' }
}

function save(p: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* yok say */
  }
}

function isWatchRoute(): boolean {
  return typeof location !== 'undefined' && location.hash.startsWith('#/izle/')
}

export function DevtoolsPanel(): ReactElement {
  const [state, setState] = useState<Persisted>(load)
  const [watch, setWatch] = useState(isWatchRoute)
  const panelRef = useRef<HTMLElement | null>(null)
  const launcherRef = useRef<HTMLButtonElement | null>(null)
  const dotRef = useRef<HTMLSpanElement | null>(null)
  const focusOnOpen = useRef(false)

  useEffect(() => save(state), [state])

  const setOpen = useCallback((open: boolean, byUser = true) => {
    focusOnOpen.current = open && byUser
    setState((s) => ({ ...s, open }))
  }, [])
  const setTab = useCallback((tab: TabId) => setState((s) => ({ ...s, tab })), [])

  // Klavye: Ctrl+. (Mac'te Cmd+.) aç/kapat; Esc odak paneldeyken kapatır.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '.' && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault()
        setState((s) => {
          focusOnOpen.current = !s.open
          return { ...s, open: !s.open }
        })
        return
      }
      if (e.key === 'Escape' && panelRef.current?.contains(document.activeElement)) {
        e.preventDefault()
        setOpen(false)
        window.setTimeout(() => launcherRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  // İzleme sayfasında panel videonun ortasını kapatmaz (daha alçak alt sayfa / dar çekmece).
  useEffect(() => {
    const onHash = () => setWatch(isWatchRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Kapalıyken etkinlik nabzı: React çizimi yok, yalnızca noktanın sınıfı değişir.
  useEffect(() => {
    if (state.open) return
    let timer: number | null = null
    const unsubscribe = devbus.subscribe(() => {
      const dot = dotRef.current
      if (!dot || timer !== null) return
      dot.classList.add('is-on')
      timer = window.setTimeout(() => {
        timer = null
        dot.classList.remove('is-on')
      }, 1200)
    })
    return () => {
      unsubscribe()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [state.open])

  // Kullanıcı açtıysa odağı panele taşı (açılışta kendiliğinden açılınca odak çalınmaz).
  useEffect(() => {
    if (!state.open || !focusOnOpen.current) return
    let tries = 0
    const t = window.setInterval(() => {
      if (panelRef.current || ++tries > 20) {
        window.clearInterval(t)
        panelRef.current?.focus()
        focusOnOpen.current = false
      }
    }, 50)
    return () => window.clearInterval(t)
  }, [state.open])

  return (
    <>
      {!state.open && (
        <button
          ref={launcherRef}
          type="button"
          className="kp-launcher"
          onClick={() => setOpen(true)}
          aria-label="Kaputun altı panelini aç (Ctrl+.)"
        >
          <span ref={dotRef} className="kp-launcher-dot" aria-hidden="true" />
          Kaputun altı
        </button>
      )}
      {state.open && (
        <Suspense fallback={null}>
          <Panel
            tab={state.tab}
            onTab={setTab}
            onClose={() => {
              setOpen(false)
              window.setTimeout(() => launcherRef.current?.focus(), 0)
            }}
            watch={watch}
            panelRef={panelRef}
          />
        </Suspense>
      )}
    </>
  )
}
