/**
 * TV ikonları — web ikon setiyle aynı çizgi dili (24×24, çizgi 2, yuvarlak uç). Boyut rem cinsinden verilir.
 * `title` verilirse ikon anlamlıdır (role="img"); verilmezse dekoratiftir.
 */
import type { ReactElement, ReactNode } from 'react'

const PATHS = {
  play: (
    <path
      d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"
      fill="currentColor"
      stroke="none"
    />
  ),
  pause: <path d="M8 5v14M16 5v14" />,
  restart: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  ),
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  /** Canlı TV: yayın simgeli ekran */
  live: (
    <>
      <rect x="2.5" y="7" width="19" height="13" rx="2" />
      <path d="m8 3 4 4 4-4" />
    </>
  ),
  /** Diziler: üst üste bölümler */
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
  /** Yeni ve Popüler: alev */
  newPopular: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z" />,
  /** Listem */
  list: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  guide: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 4v16" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 5 5 9-10" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  like: <path d="M7 11v9H4v-9h3zM7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 17 20H7" />,
  episodes: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  /** Sil (tuş takımı) */
  backspace: (
    <>
      <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
      <path d="m12 9 6 6M18 9l-6 6" />
    </>
  ),
  remote: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="3" />
      <path d="M12 6v.01M12 11v.01M10 15h4" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  cast: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  tv: (
    <>
      <rect x="2.5" y="5" width="19" height="13" rx="2" />
      <path d="M8 21h8" />
    </>
  ),
  laptop: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 19h20" />
    </>
  ),
  signOut: (
    <>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  subtitles: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 14h4M13 14h4M7 10h2M11 10h6" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type TvIconName = keyof typeof PATHS
export const TV_ICON_NAMES = Object.keys(PATHS) as TvIconName[]

export interface TvIconProps {
  name: TvIconName
  /** rem; varsayılan 2 */
  size?: number
  title?: string
  className?: string
}

export function TvIcon({ name, size = 2, title, className }: TvIconProps): ReactElement {
  const a11y = title
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': true as const, focusable: 'false' as const }
  return (
    <svg
      className={className ? `tv-icon ${className}` : 'tv-icon'}
      style={{ width: `${size}rem`, height: `${size}rem` }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
    >
      {PATHS[name]}
    </svg>
  )
}
