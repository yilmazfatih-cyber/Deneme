/**
 * "Kaputun altı" paneli: uygulamanın her mekaniğini kullanırken canlı gösterir.
 * Kapalıyken yalnızca küçük bir başlatıcı düğme vardır; panel kodu ilk açılışta yüklenir ve devbus'a
 * yalnızca açıkken abone olunur. Ctrl+. aç/kapat, Esc (panel içindeyken) kapatır.
 * Açık/kapalı durumu ve etkin sekme localStorage'da saklanır.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { devbus } from '../lib/devbus'
import './launcher.css'
import { startCollector } from './collector'
import { isTabId, type TabId } from './tabIds'

const Panel = lazy(() => import('./Panel'))

// Seyrek olayları uygulama açıldığından beri sakla (bkz. collector.ts).
startCollector()

const STORAGE_KEY = 'tvp.kaput.v1'
/** DESIGN_SPEC §3 "ayar" ikonu */
const GEAR =
  'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1'

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
          className={`kp-launcher${watch ? ' is-watch' : ''}`}
          onClick={() => setOpen(true)}
          aria-label="Kaputun altı panelini aç (Ctrl+.)"
          title="Kaputun altı (Ctrl+.)"
        >
          <svg
            className="kp-launcher-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={GEAR} />
          </svg>
          <span className="kp-launcher-label">{watch ? 'Kaput' : 'Kaputun altı'}</span>
          <span ref={dotRef} className="kp-launcher-dot" aria-hidden="true" />
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
