/**
 * İkon seti v2 — 24×24, çizgi 2, yuvarlak uç ve birleşim (v1 yollarıyla aynı dil; Netflix arayüz ikonlarının
 * karşılıkları). `title` verilirse ikon anlamlıdır (role="img"); verilmezse dekoratiftir (aria-hidden).
 * Yeni ikon gerekiyorsa bu dosyaya aynı çizgi diliyle eklenir; galeri (#/_ui) tümünü listeler.
 */
import type { ReactElement, ReactNode } from 'react'
import { cx } from './cx'

const TEN = (
  <text x="12" y="15.6" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">
    10
  </text>
)
const FILLED = { fill: 'currentColor', stroke: 'none' } as const

const PATHS = {
  /* ───── Oynatma ───── */
  play: <path d="M7 4.8v14.4a1 1 0 0 0 1.52.85l11.3-7.2a1 1 0 0 0 0-1.7L8.52 3.95A1 1 0 0 0 7 4.8z" {...FILLED} />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" {...FILLED} />
      <rect x="14" y="4" width="4" height="16" rx="1" {...FILLED} />
    </>
  ),
  startOver: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3" />
      <path d="M3.5 4v5h5" />
    </>
  ),
  back10: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3" />
      <path d="M3.5 4v5h5" />
      {TEN}
    </>
  ),
  forward10: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3" />
      <path d="M20.5 4v5h-5" />
      {TEN}
    </>
  ),
  nextEpisode: (
    <>
      <path d="M5 5.5v13l10-6.5L5 5.5z" {...FILLED} />
      <path d="M19 5v14" />
    </>
  ),
  episodes: (
    <>
      <rect x="3" y="6" width="14" height="13" rx="1.5" />
      <path d="M7 3h13a1 1 0 0 1 1 1v11" />
    </>
  ),
  subtitles: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 14h4M13 14h4M7 10h2M11 10h6" />
    </>
  ),
  speed: (
    <>
      <path d="M4.2 17a9 9 0 1 1 15.6 0" />
      <path d="m12 13 4-5" />
      <circle cx="12" cy="13" r="1.2" {...FILLED} />
    </>
  ),
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  exitFullscreen: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  volume: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </>
  ),

  /* ───── Eylem ───── */
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <circle cx="12" cy="7.6" r="1.1" {...FILLED} />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  thumbsUp: (
    <path d="M7 10.5V20H4a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1h3zm0 0 3.8-6.6a1.6 1.6 0 0 1 2.9 1.2L13 9.5h5.3a2 2 0 0 1 2 2.4l-1.3 6.5a2 2 0 0 1-2 1.6H7" />
  ),
  thumbsDown: (
    <path d="M17 13.5V4h3a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-3zm0 0-3.8 6.6a1.6 1.6 0 0 1-2.9-1.2l.7-4.4H5.7a2 2 0 0 1-2-2.4L5 5.6A2 2 0 0 1 7 4h10" />
  ),
  share: (
    <>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  /** Kanallarım / favori: çizgi yıldız (dolu hali `starFilled`) */
  star: <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />,
  starFilled: (
    <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="currentColor" />
  ),
  /** Ekran klavyesi "sil" */
  backspace: (
    <>
      <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
      <path d="m12 9 6 6M18 9l-6 6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.8-4.8" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5" r="1.6" {...FILLED} />
      <circle cx="12" cy="12" r="1.6" {...FILLED} />
      <circle cx="12" cy="19" r="1.6" {...FILLED} />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9.5a6 6 0 1 1 12 0c0 5.5 2 7 2 7H4s2-1.5 2-7" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
      <circle cx="12" cy="17" r="1" {...FILLED} />
    </>
  ),

  /* ───── Yön ───── */
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  chevronUp: <path d="m5 15 7-7 7 7" />,
  back: <path d="M20 12H5M11 5l-7 7 7 7" />,
  /** Dolu küçük üçgen (avatar oku, "Türler ▾") */
  caret: <path d="M6 9.5h12l-6 6.5-6-6.5z" {...FILLED} />,

  /* ───── Gezinme ───── */
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  /** Canlı TV: yayın dalgalı anten */
  live: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="m8 3 4 5 4-5" />
      <circle cx="12" cy="14" r="2" {...FILLED} />
    </>
  ),
  /** "Yeni ve Popüler" işareti — alevsiz: dört köşeli parıltı */
  newPopular: (
    <>
      <path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5z" />
      <path d="M19 16.5c.25 1.7 1.05 2.5 2.75 2.75-1.7.25-2.5 1.05-2.75 2.75-.25-1.7-1.05-2.5-2.75-2.75 1.7-.25 2.5-1.05 2.75-2.75z" />
    </>
  ),
  guide: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 4v16" />
    </>
  ),
  /** Diziler: eski tip TV */
  shows: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M6 5h12M8.5 2h7" />
    </>
  ),
  /** Filmler: film şeridi */
  movies: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </>
  ),
  /** TV+'ım sekmesi (indirme yerine kişi) */
  user: (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4 20.5c1.2-3.6 4.2-5.5 8-5.5s6.8 1.9 8 5.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c1-3.2 3.5-5 6.5-5s5.5 1.8 6.5 5" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 15.3c1.7.6 3 2.2 3.5 4.7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),

  /* ───── Cihazlar ───── */
  /** "TV'de izle" (yansıtma) */
  cast: (
    <>
      <path d="M3 9V6.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M3 13a6 6 0 0 1 6 6M3 16.5A2.5 2.5 0 0 1 5.5 19" />
      <circle cx="3.2" cy="19" r=".9" {...FILLED} />
    </>
  ),
  tv: (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  laptop: (
    <>
      <rect x="4.5" y="5" width="15" height="10" rx="1.5" />
      <path d="M2.5 19h19" />
    </>
  ),
  remote: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="3" />
      <circle cx="12" cy="8" r="2" />
      <path d="M10 14h.01M14 14h.01M10 17.5h.01M14 17.5h.01" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 14h.01M18 14h.01M9 14h6" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h.01M18 14h2" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS
export const ICON_NAMES = Object.keys(PATHS) as IconName[]

export interface IconProps {
  name: IconName
  /** px; varsayılan 24 */
  size?: number
  /** Verilirse ikon ekran okuyucuya bu adla okunur. */
  title?: string
  className?: string
  /** Çizgi kalınlığı; varsayılan 2 */
  strokeWidth?: number
}

export function Icon({ name, size = 24, title, className, strokeWidth = 2 }: IconProps): ReactElement {
  const a11y = title
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': true as const, focusable: 'false' as const }
  return (
    <svg
      className={cx('ui-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
    >
      {PATHS[name]}
    </svg>
  )
}
