import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { ROLES } from '../../shared/labels.ts'
import { useAuth, useSite } from '../context.tsx'
import { useApi } from '../lib.ts'
import { EngineBadge } from './ui.tsx'

type Counts = { kpis: { pendingApprovals: number; inboxNew: number; openTickets: number } }

const SECTIONS: { title: string; links: { to: string; label: string; count?: keyof Counts['kpis'] }[] }[] = [
  {
    title: 'Operasyon',
    links: [
      { to: '/', label: 'Pano' },
      { to: '/gelen-kutusu', label: 'Gelen kutusu', count: 'inboxNew' },
      { to: '/onaylar', label: 'Yapay zekâ onayları', count: 'pendingApprovals' },
      { to: '/talepler', label: 'Arıza ve talepler', count: 'openTickets' },
    ],
  },
  {
    title: 'Finans',
    links: [
      { to: '/finans', label: 'Aidat ve tahsilat' },
      { to: '/daireler', label: 'Bağımsız bölümler' },
      { to: '/kisiler', label: 'Sakinler' },
    ],
  },
  {
    title: 'Yönetim',
    links: [
      { to: '/duyurular', label: 'Duyurular' },
      { to: '/genel-kurul', label: 'Genel kurul' },
      { to: '/kontroller', label: 'Periyodik kontroller' },
      { to: '/belgeler', label: 'Belgeler ve asistan' },
      { to: '/tedarikciler', label: 'Tedarikçiler' },
    ],
  },
  {
    title: 'Sistem',
    links: [
      { to: '/ice-aktar', label: 'Portföy devri (içe aktar)' },
      { to: '/ayarlar', label: 'Ayarlar' },
    ],
  },
]

export function Layout() {
  const { me, logout } = useAuth()
  const { siteId, setSiteId, sites } = useSite()
  const [open, setOpen] = useState(false)
  const { data } = useApi<Counts>('/y/dashboard')
  if (!me) return null
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <img src="/icon.svg" alt="" />
          <div>
            Kâhya
            <small className="muted">{me.org.name}</small>
          </div>
        </div>
        <nav className="nav" aria-label="Ana menü">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <div className="nav-section">{s.title}</div>
              {s.links.map((l) => {
                const n = l.count ? data?.kpis[l.count] : 0
                return (
                  <NavLink key={l.to} to={l.to} end={l.to === '/'}>
                    <span>{l.label}</span>
                    {n ? <span className="count">{n}</span> : null}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn small menu-toggle" onClick={() => setOpen((o) => !o)} aria-label="Menüyü aç">
            ☰
          </button>
          <label className="row" style={{ gap: 6 }}>
            <span className="muted hide-mobile" style={{ fontSize: '0.85rem' }}>
              Site
            </span>
            <select
              value={siteId ?? ''}
              onChange={(e) => setSiteId(Number(e.target.value))}
              style={{ maxWidth: 260 }}
              aria-label="Site seçimi"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <span className="spacer" />
          <span className="hide-mobile">
            <EngineBadge engine={me.ai.engine} model={me.ai.model} />
          </span>
          {me.demo && (
            <span className="badge warn hide-mobile" title="Demo modu: giriş kodları ekranda, ödemeler test">
              Demo
            </span>
          )}
          <span className="hide-mobile" style={{ fontSize: '0.9rem' }}>
            {me.user.name} <span className="muted">· {ROLES[me.user.role]}</span>
          </span>
          <button className="btn small" onClick={() => void logout()}>
            Çıkış
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function PortalLayout() {
  const { me, logout } = useAuth()
  if (!me) return null
  const links = [
    { to: '/portal', label: 'Özet', ico: '🏠' },
    { to: '/portal/talepler', label: 'Talepler', ico: '🛠' },
    { to: '/portal/asistan', label: 'Asistan', ico: '💬' },
    { to: '/portal/duyurular', label: 'Duyurular', ico: '📣' },
    { to: '/portal/gizlilik', label: 'Hesabım', ico: '👤' },
  ]
  return (
    <div className="portal">
      <header className="portal-head">
        <div className="brand" style={{ padding: 0 }}>
          <img src="/icon.svg" alt="" />
          <div>
            Kâhya
            <small className="muted">{me.org.name}</small>
          </div>
        </div>
        <button className="btn small" onClick={() => void logout()}>
          Çıkış
        </button>
      </header>
      <Outlet />
      <nav className="portal-nav" aria-label="Sakin menüsü">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === '/portal'}>
            <span className="ico" aria-hidden>
              {l.ico}
            </span>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
