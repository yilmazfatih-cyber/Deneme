/**
 * Mobil kabuk (< 900 px, UX_SPEC §3):
 *   Üst çubuk 56 px (+ güvenli alan): solda "‹Profil adı› için" (ana sayfa) ya da sayfa başlığı / logo; sağda
 *   TV'de izle · arama (→ /ara). Altında sayfanın hap sırası (<ShellPills>); aşağı kayınca haplar gizlenir,
 *   yukarı kayınca döner. Vitrinli sayfada en üstte saydam, kayınca koyu buzlu.
 *   Alt sekmeler 56 px + güvenli alan: Ana Sayfa · Canlı TV · Yeni ve Popüler · TV+'ım (profil avatarı); üstünde
 *   "Şu an TV'de" çubuğu yuvası (features/remote NowOnTvBar).
 *   Detay mobilde tam sayfadır: `?jbv=` gelirse /baslik/:id'ye çevrilir; /baslik sayfasında üst çubuk gizlidir.
 *   "Kaputun altı" yüzen başlatıcısı mobilde yalnız TV+'ım'da görünür (başka yerde içeriği örtmez); panel açıkken
 *   her yerde kalır. Diğer giriş: TV+'ım sayfası app `toggleDevtoolsPanel()` çağırabilir.
 */
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Avatar, cx, Icon, IconButton, Logo, useScrolled, type IconName } from '../ui'
import { DETAIL_PARAM, TCTX_PARAM } from './links'
import { RouteFrame } from './RouteFrame'
import { useSession } from './sessionStore'
import { ShellContextProvider, useShellController } from './shellContext'

const CastButton = lazy(() => import('../features/remote').then((m) => ({ default: m.CastButton })))
const NowOnTvBar = lazy(() => import('../features/remote').then((m) => ({ default: m.NowOnTvBar })))

interface Tab {
  label: string
  to: string
  icon: IconName | 'avatar'
  match: (pathname: string) => boolean
}

/** Alt sekmeler (sıra UX_SPEC §3). */
export const MOBILE_TABS: readonly Tab[] = [
  {
    label: 'Ana Sayfa',
    to: '/goz-at',
    icon: 'home',
    match: (p) => p === '/' || p.startsWith('/goz-at') || /^\/(tur|koleksiyon|kisi|baslik)\//.test(p),
  },
  { label: 'Canlı TV', to: '/canli', icon: 'live', match: (p) => p.startsWith('/canli') || p.startsWith('/rehber') },
  {
    label: 'Yeni ve Popüler',
    to: '/yeni-ve-populer',
    icon: 'newPopular',
    match: (p) => p.startsWith('/yeni-ve-populer'),
  },
  {
    label: "TV+'ım",
    to: '/tvplusim',
    icon: 'avatar',
    match: (p) => /^\/(tvplusim|listem|cihazlar|kumanda)(\/|$)/.test(p),
  },
]

/** Yola göre mobil üst çubuk başlığı; null → logo. */
function defaultTitle(pathname: string, profileName: string | null): string | null {
  if (pathname === '/goz-at') return profileName ? `${profileName} için` : null
  if (pathname.startsWith('/goz-at/diziler')) return 'Diziler'
  if (pathname.startsWith('/goz-at/filmler')) return 'Filmler'
  if (pathname.startsWith('/yeni-ve-populer')) return 'Yeni ve Popüler'
  if (pathname.startsWith('/canli')) return 'Canlı TV'
  if (pathname.startsWith('/rehber')) return 'Rehber'
  if (pathname.startsWith('/listem')) return 'Listem'
  if (pathname.startsWith('/tvplusim')) return "TV+'ım"
  if (pathname.startsWith('/ara')) return 'Ara'
  if (pathname.startsWith('/kumanda')) return 'Kumanda'
  if (pathname.startsWith('/cihazlar')) return 'Cihazlar'
  return null
}

/** Kayma yönü: aşağı kayarken haplar gizlenir (en üstte hep görünür). */
function usePillsHidden(): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const y = window.scrollY
        if (y < 60) setHidden(false)
        else if (y > last + 6) setHidden(true)
        else if (y < last - 6) setHidden(false)
        last = y
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])
  return hidden
}

/** Öğenin yüksekliğini kök CSS değişkenine yazar (içerik üst / alt boşluğu için). */
function useHeightVar(name: string): (el: HTMLElement | null) => void {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const root = document.documentElement
    if (!el) return
    const write = () => root.style.setProperty(name, `${el.offsetHeight}px`)
    write()
    const ro = new ResizeObserver(write)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty(name)
    }
  }, [el, name])
  return setEl
}

export function MobileShell(): ReactElement {
  const location = useLocation()
  const { pathname } = location
  const profile = useSession((s) => s.boot?.activeProfile ?? null)
  const { options, pillsRef, context } = useShellController('mobile')
  const scrolled = useScrolled(0)
  const pillsHidden = usePillsHidden()
  const topRef = useHeightVar('--app-top')
  const bottomRef = useHeightVar('--app-bottom')
  const mainRef = useRef<HTMLElement>(null)

  // "Kaputun altı" başlatıcısı mobilde içeriği örtmesin: yalnız TV+'ım sayfasında görünür (shell.css).
  useEffect(() => {
    const root = document.documentElement
    root.dataset.kaput = pathname.startsWith('/tvplusim') ? 'goster' : 'gizle'
    return () => {
      delete root.dataset.kaput
    }
  }, [pathname])

  // Masaüstü detay adresi mobilde tam sayfaya çevrilir.
  const params = new URLSearchParams(location.search)
  const jbv = params.get(DETAIL_PARAM)
  if (jbv) {
    const tctx = params.get(TCTX_PARAM)
    return (
      <Navigate
        to={`/baslik/${encodeURIComponent(jbv)}${tctx ? `?${TCTX_PARAM}=${encodeURIComponent(tctx)}` : ''}`}
        replace
      />
    )
  }

  const topBar = options.topBar ?? !pathname.startsWith('/baslik/')
  const title = options.mobileTitle !== undefined ? options.mobileTitle : defaultTitle(pathname, profile?.name ?? null)
  const transparent = options.fullBleed && !scrolled

  return (
    <ShellContextProvider value={context}>
      <div className={cx('app-mobile', !topBar && 'no-topbar')}>
        <header
          ref={topRef}
          className={cx('app-mtop', transparent ? 'is-clear' : 'is-solid', pillsHidden && 'pills-hidden')}
          hidden={!topBar}
        >
          <div className="app-mtop__bar">
            {title ? (
              <h1 className="app-mtop__title">{title}</h1>
            ) : (
              <Link to="/goz-at" className="app-mtop__logo" aria-label="TV+ Ana Sayfa">
                <Logo height={24} decorative />
              </Link>
            )}
            <div className="app-mtop__actions">
              <Suspense fallback={null}>
                <CastButton />
              </Suspense>
              <IconButton icon="search" label="Ara" to="/ara" />
            </div>
          </div>
          <div className="app-mtop__pills" ref={pillsRef} />
        </header>
        <main className="app-mmain" id="icerik" tabIndex={-1} ref={mainRef}>
          <RouteFrame>
            <Outlet />
          </RouteFrame>
        </main>
        <div className="app-mbottom" ref={bottomRef}>
          <Suspense fallback={null}>
            <NowOnTvBar />
          </Suspense>
          <nav className="app-tabs" aria-label="Ana gezinme">
            {MOBILE_TABS.map((t) => {
              const on = t.match(pathname)
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cx('app-tab', on && 'is-active')}
                  aria-current={on ? 'page' : undefined}
                >
                  {t.icon === 'avatar' ? (
                    <Avatar
                      src={profile?.avatarUrl}
                      name={profile?.name ?? 'TV+'}
                      size={24}
                      className="app-tab__avatar"
                    />
                  ) : (
                    <Icon name={t.icon} size={24} strokeWidth={on ? 2.4 : 1.8} />
                  )}
                  <span>{t.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
    </ShellContextProvider>
  )
}
