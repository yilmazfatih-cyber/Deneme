/**
 * Uygulama kabuğu (DESIGN_SPEC §2 "Web üst menü", "Üst bar (mobil)", "Alt gezinme (mobil)").
 *  Web (≥ 900): opak sabit üst çubuk 72 — logo · Geçiş · Rehber, Çocuk · boşluk · arama · zil · avatar menüsü.
 *  Mobil (< 900): üst çubuk 56 — logo · zil · avatar; sabit alt gezinme 64; mod sayfalarında tam genişlik Geçiş.
 * İçerik her zaman çubuğun ALTINDAN başlar (üst üste binmez), en çok 1440 px.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Icon, ModeSwitch, type AppMode, type IconName } from '../design'
import { NotificationBell } from '../features/notifications'
import { SearchBox } from '../features/search'
import { getLastMode, lastModePath, MODE_PATHS, modeOfPath } from './mode'
import { RouteFrame } from './RouteFrame'
import { useSession } from './sessionStore'
import './shell.css'

function Logo(): ReactElement {
  return (
    <Link to="/" className="tvp-logo" aria-label="TV+ ana sayfa">
      <img src="/brand/logo.png" alt="" />
    </Link>
  )
}

/** Geçerli mod: mod sayfasındaysa o, değilse son kullanılan. */
function useCurrentMode(): AppMode {
  const { pathname } = useLocation()
  return modeOfPath(pathname) ?? getLastMode()
}

function ShellModeSwitch({ className }: { className: string }): ReactElement {
  const navigate = useNavigate()
  const mode = useCurrentMode()
  return <ModeSwitch className={className} value={mode} onChange={(m) => navigate(MODE_PATHS[m])} />
}

/* ───────────── Avatar menüsü ───────────── */

function AvatarMenu(): ReactElement | null {
  const boot = useSession((s) => s.boot)
  const switchProfile = useSession((s) => s.switchProfile)
  const logout = useSession((s) => s.logout)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const active = boot?.activeProfile
  if (!active) return null

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }
  const onMenuKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]
      next?.focus()
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div className="tvp-avatarmenu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="tvp-avatarmenu__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Profil: ${active.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar src={active.avatarUrl} name={active.name} size={40} className="tvp-avatarmenu__avatar" />
      </button>
      {open && (
        <ul className="tvp-menu" role="menu" aria-label="Profil menüsü" ref={menuRef} onKeyDown={onMenuKey}>
          {boot.profiles.map((p) => (
            <li key={p.guid} role="none">
              <button
                type="button"
                role="menuitem"
                className="tvp-menu__item"
                aria-current={p.guid === active.guid ? 'true' : undefined}
                onClick={() => {
                  close(false)
                  if (p.guid !== active.guid) void switchProfile(p.guid)
                }}
              >
                <Avatar src={p.avatarUrl} name={p.name} size={32} />
                <span className="tvp-menu__label">{p.name}</span>
                {p.guid === active.guid && <Icon name="check" size={20} title="Etkin profil" />}
              </button>
            </li>
          ))}
          <li role="separator" className="tvp-menu__sep" />
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="tvp-menu__item"
              onClick={() => {
                close(false)
                navigate('/profiller')
              }}
            >
              <span className="tvp-menu__label">Profilleri gör</span>
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="tvp-menu__item"
              onClick={() => {
                close(false)
                void logout()
              }}
            >
              <span className="tvp-menu__label">Çıkış</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

/* ───────────── Üst çubuk ───────────── */

function TopBar(): ReactElement {
  return (
    <header className="tvp-topbar">
      <div className="tvp-topbar__inner">
        <Logo />
        <ShellModeSwitch className="tvp-topbar__mode tvp-web-only" />
        <nav className="tvp-topbar__links tvp-web-only" aria-label="Bölümler">
          <NavLink to="/rehber" className="tvp-topbar__link">
            Rehber
          </NavLink>
          <NavLink to="/tur/783" className="tvp-topbar__link">
            Çocuk
          </NavLink>
        </nav>
        <span className="tvp-topbar__spacer" />
        <SearchBox className="tvp-web-only" />
        <div className="tvp-topbar__actions">
          <NotificationBell />
          <AvatarMenu />
        </div>
      </div>
    </header>
  )
}

/* ───────────── Alt gezinme (mobil) ───────────── */

interface Tab {
  label: string
  icon: IconName
  to: string
  match: (pathname: string) => boolean
}

function BottomNav(): ReactElement {
  const { pathname } = useLocation()
  const tabs: Tab[] = [
    { label: 'Ana Sayfa', icon: 'home', to: lastModePath(), match: (p) => p === '/' || modeOfPath(p) !== null },
    { label: 'Rehber', icon: 'guide', to: '/rehber', match: (p) => p.startsWith('/rehber') },
    { label: 'Ara', icon: 'search', to: '/ara', match: (p) => p.startsWith('/ara') },
    { label: 'Kitaplığım', icon: 'library', to: '/kitaplik', match: (p) => p.startsWith('/kitaplik') },
  ]
  return (
    <nav className="tvp-bottomnav" aria-label="Ana gezinme">
      {tabs.map((t) => {
        const on = t.match(pathname)
        return (
          <Link key={t.label} to={t.to} className="tvp-bottomnav__tab" aria-current={on ? 'page' : undefined}>
            <Icon name={t.icon} size={24} />
            <span>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/* ───────────── Kabuk ───────────── */

export function Shell(): ReactElement {
  const { pathname } = useLocation()
  const onModePage = modeOfPath(pathname) !== null
  return (
    <div className="tvp-shell">
      <a
        className="tvp-skip"
        href="#icerik"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('icerik')?.focus()
        }}
      >
        İçeriğe geç
      </a>
      <TopBar />
      <main className="tvp-main" id="icerik" tabIndex={-1}>
        <div className="tvp-main__inner">
          {onModePage && (
            <div className="tvp-modebar tvp-mobile-only">
              <ShellModeSwitch className="" />
            </div>
          )}
          <RouteFrame>
            <Outlet />
          </RouteFrame>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
