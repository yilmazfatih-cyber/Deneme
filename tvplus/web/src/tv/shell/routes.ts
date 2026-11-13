/**
 * TV yol tablosu ve saf yol yardımcıları (testli: routes.test.ts). Kök /tv; web yolları TV karşılığına yönlenir.
 */
import type { DeviceScreen } from '../../../../shared/devices'

export const TV_PATHS = {
  home: '/tv',
  login: '/tv/giris',
  profiles: '/tv/profiller',
  search: '/tv/ara',
  live: '/tv/canli',
  guide: '/tv/rehber',
  myList: '/tv/listem',
  settings: '/tv/ayarlar',
  remote: '/tv/kumanda',
  uiDemo: '/tv/_ui',
} as const

export type TvCategory = 'shows' | 'movies' | 'newPopular'

export const categoryPath = (c: TvCategory): string => `/tv/kategori/${c}`
export const titlePath = (videoId: string | number): string => `/tv/baslik/${videoId}`
export const episodesPath = (videoId: string | number): string => `/tv/baslik/${videoId}/bolumler`

/** Oynatma yolu: /tv/izle/<id>?konum=<sn>&baslat=bastan&tctx=… */
export function watchPath(
  viewableId: string,
  opts: { positionSec?: number | null; startOver?: boolean; tctx?: string | null } = {},
): string {
  const q = new URLSearchParams()
  if (opts.positionSec !== undefined && opts.positionSec !== null && opts.positionSec > 0)
    q.set('konum', String(Math.floor(opts.positionSec)))
  if (opts.startOver) q.set('baslat', 'bastan')
  if (opts.tctx) q.set('tctx', opts.tctx)
  const s = q.toString()
  return `/tv/izle/${encodeURIComponent(viewableId).replace(/%3A/gi, ':')}${s ? `?${s}` : ''}`
}

/**
 * /tv dışındaki bir yolun TV karşılığı: `/` ve `/goz-at` → `/tv`, `/izle/:id` → `/tv/izle/:id` (sorgu korunur),
 * `/canli` → `/tv/canli`, `/ara` → `/tv/ara`; ayrıca `/rehber`, `/listem`, `/baslik/:id`; gerisi → `/tv`.
 */
export function tvRedirectFor(pathname: string, search = ''): string {
  const p = pathname.replace(/\/+$/, '') || '/'
  const watch = /^\/izle\/([^/]+)$/.exec(p)
  if (watch) return `/tv/izle/${watch[1]}${search}`
  const title = /^\/baslik\/([^/]+)$/.exec(p)
  if (title) return `/tv/baslik/${title[1]}`
  switch (p) {
    case '/canli':
      return TV_PATHS.live
    case '/rehber':
      return TV_PATHS.guide
    case '/listem':
      return TV_PATHS.myList
    case '/ara':
      return TV_PATHS.search
    default:
      return TV_PATHS.home
  }
}

/** Kumanda arayüzü için bu cihazın ekranı. */
export function deviceScreenOf(pathname: string): DeviceScreen {
  if (pathname === '/tv' || pathname === '/tv/' || pathname.startsWith('/tv/kategori/') || pathname === '/tv/listem')
    return 'home'
  if (pathname.startsWith('/tv/baslik/')) return 'detail'
  if (pathname.startsWith('/tv/ara')) return 'search'
  if (pathname.startsWith('/tv/canli')) return 'live'
  if (pathname.startsWith('/tv/rehber')) return 'guide'
  if (pathname.startsWith('/tv/izle/')) return 'player'
  if (pathname.startsWith('/tv/giris')) return 'login'
  if (pathname.startsWith('/tv/profiller')) return 'profiles'
  return 'other'
}

/** Yan menünün hangi öğesi etkin (yol → öğe kimliği). */
export function railSectionOf(pathname: string): string | null {
  if (pathname === '/tv' || pathname === '/tv/') return 'ana'
  if (pathname.startsWith('/tv/ara')) return 'ara'
  if (pathname.startsWith('/tv/canli') || pathname.startsWith('/tv/rehber')) return 'canli'
  if (pathname === '/tv/kategori/shows') return 'diziler'
  if (pathname === '/tv/kategori/movies') return 'filmler'
  if (pathname === '/tv/kategori/newPopular') return 'yeni'
  if (pathname.startsWith('/tv/listem')) return 'listem'
  if (pathname.startsWith('/tv/ayarlar') || pathname.startsWith('/tv/kumanda')) return 'ayarlar'
  return null
}
