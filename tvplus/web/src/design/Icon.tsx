/**
 * İkonlar — DESIGN_SPEC §3'teki yolların aynısı (24×24, çizgi 2, yuvarlak uç).
 * `title` verilirse ikon anlamlıdır (role="img"); verilmezse dekoratiftir (aria-hidden).
 */
import type { ReactElement, ReactNode } from 'react'

const TEN = (
  <text x="12" y="15.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">
    10
  </text>
)

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
  guide: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 4v16" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  library: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 5 5 9-10" />,
  cast: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  record: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  share: (
    <>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </>
  ),
  like: <path d="M7 11v9H4v-9h3zM7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 17 20H7" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  subtitles: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 14h4M13 14h4M7 10h2M11 10h6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  ),
  back10: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      {TEN}
    </>
  ),
  forward10: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
      {TEN}
    </>
  ),
  volume: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  nextEpisode: (
    <>
      <path d="M5 5v14l10-7L5 5z" />
      <path d="M19 5v14" />
    </>
  ),
  episodes: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  remote: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="3" />
      <path d="M12 6v.01M12 11v.01M10 15h4" />
    </>
  ),
  /** Spesifikasyonda yok; yetki kilidi (AccessLock) için aynı çizgi diliyle eklendi. */
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
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
}

export function Icon({ name, size = 24, title, className }: IconProps): ReactElement {
  const a11y = title
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': true as const, focusable: 'false' as const }
  return (
    <svg
      className={className ? `cn-icon ${className}` : 'cn-icon'}
      width={size}
      height={size}
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
