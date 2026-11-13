/** Oynatıcı ikonları — yollar DESIGN_SPEC §3'ten birebir (24×24, stroke 2). Hepsi dekoratif (aria-hidden). */
import type { ReactElement, ReactNode } from 'react'

function Svg({ size = 24, children }: { size?: number; children: ReactNode }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

type P = { size?: number }

export const IconPlay = ({ size }: P) => (
  <Svg size={size}>
    <path
      d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"
      fill="currentColor"
      stroke="none"
    />
  </Svg>
)
export const IconPause = ({ size }: P) => (
  <Svg size={size}>
    <path d="M8 5v14M16 5v14" />
  </Svg>
)
export const IconRestart = ({ size }: P) => (
  <Svg size={size}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </Svg>
)
export const IconBack10 = ({ size }: P) => (
  <Svg size={size}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <text x="12" y="15.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">
      10
    </text>
  </Svg>
)
export const IconFwd10 = ({ size }: P) => (
  <Svg size={size}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v5h-5" />
    <text x="12" y="15.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">
      10
    </text>
  </Svg>
)
export const IconVolume = ({ size }: P) => (
  <Svg size={size}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
  </Svg>
)
/** Sessiz: ses ikonunun hoparlör gövdesi + kapat ikonunun çaprazı (spec yollarından türetildi) */
export const IconMuted = ({ size }: P) => (
  <Svg size={size}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16 10l4 4M20 10l-4 4" />
  </Svg>
)
export const IconFullscreen = ({ size }: P) => (
  <Svg size={size}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
)
export const IconSubtitles = ({ size }: P) => (
  <Svg size={size}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 14h4M13 14h4M7 10h2M11 10h6" />
  </Svg>
)
export const IconSettings = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </Svg>
)
export const IconNextEpisode = ({ size }: P) => (
  <Svg size={size}>
    <path d="M5 5v14l10-7L5 5z" />
    <path d="M19 5v14" />
  </Svg>
)
export const IconEpisodes = ({ size }: P) => (
  <Svg size={size}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </Svg>
)
export const IconClose = ({ size }: P) => (
  <Svg size={size}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)
export const IconChevronLeft = ({ size }: P) => (
  <Svg size={size}>
    <path d="m15 6-6 6 6 6" />
  </Svg>
)
export const IconChevronRight = ({ size }: P) => (
  <Svg size={size}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
)
export const IconChevronDown = ({ size }: P) => (
  <Svg size={size}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)
export const IconCheck = ({ size }: P) => (
  <Svg size={size}>
    <path d="m5 12 5 5 9-10" />
  </Svg>
)
/** Ses parçası menüsü: ses ikonu */
export const IconAudio = IconVolume
/** Kaynak menüsü: "TV'de izle" ekranı ikonu (yayın kaynağı) */
export const IconSource = ({ size }: P) => (
  <Svg size={size}>
    <rect x="3" y="5" width="18" height="12" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Svg>
)
export const IconInfo = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.5" />
  </Svg>
)
