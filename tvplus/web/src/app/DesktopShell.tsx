/**
 * Masaüstü kabuğu (≥ 900 px, UX_SPEC §2 "Üst menü"):
 *   Sabit 68 px üst menü, yatay boşluk %4. En üstte saydam (yukarıdan karartma), sayfa kayınca `--bg` dolgu.
 *   Sol: TV+ logosu · Ana Sayfa · Canlı TV · Diziler · Filmler · Yeni ve Popüler · Listem (dar ekranda "Göz At ▾").
 *   Sağ: arama · TV'de izle · bildirim zili · avatar menüsü.
 *   İçerik menünün altından başlar; vitrinle başlayan sayfalar (`useShellOptions({ fullBleed: true })`) menünün
 *   altına uzanır (Netflix). Detay penceresi `?jbv=` ile bu kabuğun içinde açılır. Altta sakin bir alt bilgi.
 */
import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { NotificationBell } from '../features/notifications'
import { cx, Icon, Logo, Menu, MenuItem, useScrolled } from '../ui'
import { AvatarMenu, toggleDevtoolsPanel } from './AvatarMenu'
import { DETAIL_PARAM } from './links'
import { markDetailOpenedInApp } from './detailModal'
import { HeaderSearch } from './HeaderSearch'
import { activeDesktopNav, DESKTOP_NAV } from './nav'
import { RouteFrame } from './RouteFrame'
import { ShellContextProvider, useShellController } from './shellContext'

const CastButton = lazy(() => import('../features/remote').then((m) => ({ default: m.CastButton })))
const DetailModalOutlet = lazy(() => import('../features/detail').then((m) => ({ default: m.DetailModalOutlet })))

function PrimaryNav(): ReactElement {
  const { pathname } = useLocation()
  const current = activeDesktopNav(pathname)
  return (
    <>
      <nav className="app-nav" aria-label="Bölümler">
        <ul>
          {DESKTOP_NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                className={() => cx('app-nav__link', n === current && 'is-active')}
                aria-current={n === current ? 'page' : undefined}
              >
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {/* Dar masaüstünde (Netflix < 1100): "Göz At ▾" açılır menüsü */}
      <Menu
        label="Bölümler"
        align="start"
        openOnHover
        className="app-nav-compact"
        trigger={({ 'data-open': _open, ...p }) => (
          <button {...p} className="app-nav-compact__btn">
            Göz At
            <Icon name="caret" size={16} />
          </button>
        )}
      >
        {DESKTOP_NAV.map((n) => (
          <MenuItem key={n.to} to={n.to} current={n === current}>
            {n.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

function Footer(): ReactElement {
  return (
    <footer className="app-footer">
      <ul className="app-footer__links">
        <li>
          <Link to="/cihazlar">Cihazlar</Link>
        </li>
        <li>
          <Link to="/bagla">TV'ye Bağlan</Link>
        </li>
        <li>
          <Link to="/vitrin">Cihaz vitrini</Link>
        </li>
        <li>
          <button type="button" onClick={toggleDevtoolsPanel}>
            Kaputun altı
          </button>
        </li>
        <li>
          <Link to="/_ui">Tasarım sistemi</Link>
        </li>
      </ul>
      <p className="app-footer__note">
        TV+ öğretici bir prototiptir. Gerçek hesap, ödeme ya da kişisel bilgi kullanılmaz.
      </p>
    </footer>
  )
}

/** `?jbv=` görülünce detay penceresi modülünü yükler; bir kez yüklendikten sonra kapanış animasyonu için kalır. */
function DetailModalHost(): ReactElement | null {
  const location = useLocation()
  const navType = useNavigationType()
  const jbv = new URLSearchParams(location.search).get(DETAIL_PARAM)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!jbv) return
    setLoaded(true)
    if (navType === 'PUSH') markDetailOpenedInApp(location.key)
  }, [jbv, navType, location.key])
  if (!loaded && !jbv) return null
  return (
    <Suspense fallback={null}>
      <DetailModalOutlet />
    </Suspense>
  )
}

export function DesktopShell(): ReactElement {
  const scrolled = useScrolled(0)
  const { options, context } = useShellController('desktop')
  return (
    <ShellContextProvider value={context}>
      <div className={cx('app-desktop', options.fullBleed && 'is-bleed')}>
        <a
          className="app-skip"
          href="#icerik"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById('icerik')?.focus()
          }}
        >
          İçeriğe geç
        </a>
        <header className={cx('app-header', scrolled && 'is-solid')}>
          <Link to="/goz-at" className="app-header__logo" aria-label="TV+ Ana Sayfa">
            <Logo height={26} decorative />
          </Link>
          <PrimaryNav />
          <div className="app-header__right">
            <HeaderSearch />
            <Suspense fallback={null}>
              <CastButton />
            </Suspense>
            <div className="app-header__bell">
              <NotificationBell />
            </div>
            <AvatarMenu />
          </div>
        </header>
        <main className="app-main" id="icerik" tabIndex={-1}>
          <RouteFrame>
            <Outlet />
          </RouteFrame>
        </main>
        <Footer />
        <DetailModalHost />
      </div>
    </ShellContextProvider>
  )
}
