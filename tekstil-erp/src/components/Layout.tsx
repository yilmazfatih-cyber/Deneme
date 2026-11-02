import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

type Item = { to: string; label: string; icon: string };
const groups: { title: string; items: Item[] }[] = [
  {
    title: 'Genel',
    items: [{ to: '/', label: 'Gösterge paneli', icon: 'M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z' }],
  },
  {
    title: 'Üretim ve stok',
    items: [
      { to: '/urunler', label: 'Ürünler', icon: 'M21 16V8l-9-5-9 5v8l9 5zM12 3v18M3 8l9 5 9-5' },
      { to: '/uretim', label: 'Üretim takibi', icon: 'M4 6h16M4 12h16M4 18h10' },
      { to: '/stok', label: 'Stok ve barkod', icon: 'M3 5h2v14H3zm4 0h1v14H7zm3 0h2v14h-2zm4 0h1v14h-1zm3 0h3v14h-3z' },
    ],
  },
  {
    title: 'Satış',
    items: [
      { to: '/musteriler', label: 'Müşteriler', icon: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zm-12 9a8 8 0 0 1 16 0' },
      { to: '/siparisler', label: 'Siparişler', icon: 'M6 2h12l2 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6zM4 6h16M9 10a3 3 0 0 0 6 0' },
      { to: '/kamera', label: 'Kamera analizi', icon: 'M23 7l-7 5 7 5zM1 5h15v14H1z' },
    ],
  },
  {
    title: 'Finans ve AI',
    items: [
      { to: '/finans', label: 'Finans (AI)', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
      { to: '/belgeler', label: 'Belgeler ve OCR', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8' },
      { to: '/asistan', label: 'AI asistan', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
      { to: '/ayarlar', label: 'Ayarlar', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
    ],
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Ana menü">
        <div className="brand">
          <img src="./icons/icon.svg" alt="" />
          <div>
            <strong>Tekstil AI ERP</strong>
            <small>Çevrimdışı · cihazda AI</small>
          </div>
        </div>
        <nav className="nav">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="nav-group">{g.title}</div>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.to === '/'} onClick={() => setOpen(false)}>
                  <Icon d={it.icon} />
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <button className="btn sm" onClick={() => setOpen((o) => !o)} aria-label="Menüyü aç">
            ☰
          </button>
          <strong>Tekstil AI ERP</strong>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
