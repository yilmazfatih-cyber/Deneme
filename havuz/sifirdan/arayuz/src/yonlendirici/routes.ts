// Rota ağacı ve eşleştirme: iç içe rotalar kökten yaprağa "dallara" açılır; her dalın birleşik deseni ve
// puanı vardır. Bir yol için tüm dallar denenir, en yüksek puanlı dal seçilir ve kökten yaprağa eşleşme
// zinciri döner (üst düzen + alt sayfa birlikte çizilebilsin diye).
// Genişletme: rota tanımına yeni alan (ör. `title`) eklemek için `RouteDef`'e alan ekleyin; eşleştirme değişmez.
import { expandPattern, joinPaths, matchSegments, scoreSegments, type Params, type Segment } from './pattern.ts'

export interface NavigationContext {
  params: Params
  pathname: string
  search: URLSearchParams
  signal: AbortSignal
}

/** Koruma sonucu: true/undefined → geç, false → iptal, dizgi → oraya yönlendir. */
export type GuardResult = boolean | string | undefined | void

export interface RouteDef {
  path: string
  /** Görünüm seçimi ve bağlantı üretimi için benzersiz ad. */
  name?: string
  children?: RouteDef[]
  /** Sayfa açılmadan önce veri yükler; sonuç `state.data[ad]` içinde durur. */
  loader?: (ctx: NavigationContext) => unknown
  /** Sayfaya girişe izin verir, reddeder ya da başka yola yönlendirir. */
  guard?: (ctx: NavigationContext & { from: string }) => GuardResult | Promise<GuardResult>
  meta?: Record<string, unknown>
}

export interface RouteMatch {
  route: RouteDef
  params: Params
}

interface Branch {
  chain: RouteDef[]
  segments: Segment[]
  score: number
  order: number
}

/** Rota ağacını dallara açar ve puana göre sıralar (eşitlikte tanım sırası). */
export function flattenRoutes(routes: readonly RouteDef[]): Branch[] {
  const branches: Branch[] = []
  const walk = (list: readonly RouteDef[], parentPath: string, parentChain: RouteDef[]) => {
    for (const route of list) {
      const fullPath = joinPaths(parentPath, route.path)
      const chain = [...parentChain, route]
      if (route.children && route.children.length > 0) walk(route.children, fullPath, chain)
      for (const segments of expandPattern(fullPath)) {
        branches.push({ chain, segments, score: scoreSegments(segments), order: branches.length })
      }
    }
  }
  walk(routes, '/', [])
  return branches.sort((a, b) => b.score - a.score || a.order - b.order)
}

/** Yola uyan en iyi dalın kökten yaprağa eşleşme zinciri; uyan yoksa null. */
export function matchRoutes(branches: readonly Branch[], pathname: string): RouteMatch[] | null {
  for (const branch of branches) {
    const params = matchSegments(branch.segments, pathname)
    if (params) return branch.chain.map((route) => ({ route, params }))
  }
  return null
}
