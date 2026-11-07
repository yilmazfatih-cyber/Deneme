import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { ROLE_TEXT } from '../format'

interface NavItem {
  to: string
  label: string
  end?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

export const OPERATOR_NAV: NavGroup[] = [
  {
    title: 'İşlemler',
    items: [
      { to: '/operator', label: 'Genel bakış', end: true },
      { to: '/operator/dogrulama', label: 'Doğrulama kuyruğu' },
      { to: '/operator/numaralar', label: 'Numaralar' },
      { to: '/operator/marka', label: 'Marka onayı' },
    ],
  },
  {
    title: 'Güven',
    items: [
      { to: '/operator/itibar', label: 'İtibar' },
      { to: '/operator/itirazlar', label: 'İtirazlar' },
      { to: '/operator/sertifikalar', label: 'Sertifikalar' },
      { to: '/operator/sorgula', label: 'Arama sorgula' },
    ],
  },
  {
    title: 'Yönetim',
    items: [
      { to: '/operator/api-anahtarlari', label: 'API anahtarları' },
      { to: '/operator/kullanicilar', label: 'Kullanıcılar' },
      { to: '/operator/webhooklar', label: "Webhook'lar" },
      { to: '/operator/e-posta', label: 'E-posta kutusu' },
      { to: '/operator/denetim', label: 'Denetim kaydı' },
    ],
  },
]

export const ENTERPRISE_NAV: NavGroup[] = [
  {
    title: 'Kurumum',
    items: [
      { to: '/kurum', label: 'Şirketim', end: true },
      { to: '/kurum/numaralar', label: 'Numaralarım' },
      { to: '/kurum/marka', label: 'Markam' },
    ],
  },
  {
    title: 'Güven',
    items: [
      { to: '/kurum/itibar', label: 'İtibarım' },
      { to: '/kurum/itirazlar', label: 'İtirazlarım' },
      { to: '/kurum/sertifikalar', label: 'Sertifikalar' },
    ],
  },
  {
    title: 'Entegrasyon',
    items: [
      { to: '/kurum/api-anahtarlari', label: 'API anahtarları' },
      { to: '/kurum/webhooklar', label: "Webhook'lar" },
    ],
  },
]

export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="logo-bg" />
        <path
          d="M11 8.5c-1 0-2.5 1-2.5 2.6 0 6.7 5.7 12.4 12.4 12.4 1.6 0 2.6-1.5 2.6-2.5l-.4-1.4-3.6-1.4-1.7 1.8a9.5 9.5 0 0 1-5.4-5.4l1.8-1.7-1.4-3.6z"
          className="logo-fg"
        />
        <path d="M18 9.5l2 2 4-4" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="logo-check" />
      </svg>
      <span>Enumaracle</span>
    </span>
  )
}

export function Layout() {
  const { user, logout, isOperator } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const groups = isOperator ? OPERATOR_NAV : ENTERPRISE_NAV

  const onLogout = async () => {
    await logout()
    navigate('/giris', { replace: true })
  }

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        İçeriğe geç
      </a>
      <header className="topbar">
        <button
          type="button"
          className="btn-icon menu-toggle"
          aria-expanded={open}
          aria-controls="sidenav"
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">☰</span>
          <span className="sr-only">Menü</span>
        </button>
        <Logo />
        <span className="topbar-context">{isOperator ? 'Operatör portalı' : 'Kurumsal portal'}</span>
        <div className="topbar-user">
          <span className="user-meta">
            <span className="user-name">{user?.name || user?.email}</span>
            <span className="muted small">{user ? ROLE_TEXT[user.role] : ''}</span>
          </span>
          <button type="button" className="btn btn-small" onClick={onLogout}>
            Çıkış yap
          </button>
        </div>
      </header>
      <div className="body">
        <nav id="sidenav" className={`sidenav${open ? ' open' : ''}`} aria-label="Ana menü">
          {groups.map((g) => (
            <div key={g.title} className="nav-group">
              <p className="nav-title">{g.title}</p>
              <ul>
                {g.items.map((i) => (
                  <li key={i.to}>
                    <NavLink to={i.to} end={i.end} onClick={() => setOpen(false)}>
                      {i.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
