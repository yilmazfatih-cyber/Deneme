// Yönlendirici: adres değişince hangi sayfanın gösterileceğine karar verir. Geçiş hattı:
//   eşleştir → korumalar (sırayla, üstten alta) → yükleyiciler (paralel) → adresi işle → durumu yayınla → kaydır
// Yeni bir geçiş başlarsa öncekinin AbortSignal'i iptal edilir ve sonucu atılır ("superseded"): yavaş bir
// yükleyicinin, sonradan tıklanan sayfanın üstüne yazması böylece önlenir.
// Genişletme: geçiş öncesi/sonrası kancalar (ör. analitik) için `setState` çevresine bir dinleyici listesi ekleyin.
import {
  createMemoryHistory,
  locationToString,
  parsePath,
  type HistoryLocation,
  type RouterHistory,
} from './history.ts'
import { buildPath, joinPaths, splitPath, type Params } from './pattern.ts'
import { flattenRoutes, matchRoutes, type GuardResult, type RouteDef, type RouteMatch } from './routes.ts'
import { noScroll, type ScrollAdapter, type ScrollPosition } from './scroll.ts'

export const MAX_REDIRECTS = 10

export interface RouterState {
  location: HistoryLocation
  /** Kökten yaprağa eşleşen rotalar; boşsa sayfa bulunamadı. */
  matches: RouteMatch[]
  params: Params
  /** Yükleyici sonuçları: rota adı (yoksa sıra numarası) → veri. */
  data: Record<string, unknown>
  error: unknown
  status: 'idle' | 'loading'
  /** Yüklenmekte olan hedef (status 'loading' iken). */
  pending: string | undefined
}

export type NavigationOutcome = 'done' | 'cancelled' | 'redirected' | 'superseded' | 'error'

export interface RouterOptions {
  routes: RouteDef[]
  history?: RouterHistory
  scroll?: ScrollAdapter
}

export interface Router {
  readonly state: RouterState
  readonly history: RouterHistory
  subscribe(listener: (state: RouterState) => void): () => void
  navigate(to: string, options?: { replace?: boolean; state?: unknown }): Promise<NavigationOutcome>
  /** İlk geçişi yapar ve geri/ileri dinlemeye başlar. */
  start(): Promise<NavigationOutcome>
  stop(): void
  href(to: string): string
  /** Adlı rotanın yolunu üretir: `pathFor('kullanici', { id: '7' })`. */
  pathFor(name: string, params?: Params): string
  isActive(to: string, exact?: boolean): boolean
}

type Mode = 'push' | 'replace' | 'pop' | 'initial'

function collectNames(routes: readonly RouteDef[], parent = '/', out = new Map<string, string>()): Map<string, string> {
  for (const route of routes) {
    const full = joinPaths(parent, route.path)
    if (route.name) out.set(route.name, full)
    if (route.children) collectNames(route.children, full, out)
  }
  return out
}

export function createRouter(options: RouterOptions): Router {
  const branches = flattenRoutes(options.routes)
  const names = collectNames(options.routes)
  const history = options.history ?? createMemoryHistory()
  const scroll = options.scroll ?? noScroll
  const positions = new Map<string, ScrollPosition>()
  const listeners = new Set<(state: RouterState) => void>()
  let state: RouterState = {
    location: history.location(),
    matches: [],
    params: {},
    data: {},
    error: undefined,
    status: 'idle',
    pending: undefined,
  }
  let navigationId = 0
  let controller: AbortController | undefined
  let unlisten: (() => void) | undefined

  const publish = (next: RouterState) => {
    state = next
    for (const listener of [...listeners]) listener(state)
  }

  async function runGuards(matches: RouteMatch[], ctx: Parameters<NonNullable<RouteDef['guard']>>[0]) {
    for (const match of matches) {
      if (!match.route.guard) continue
      const result: GuardResult = await match.route.guard(ctx)
      if (result === false || typeof result === 'string') return result
    }
    return true
  }

  async function run(to: string, mode: Mode, userState: unknown, redirects: number): Promise<NavigationOutcome> {
    const id = ++navigationId
    controller?.abort()
    const ownController = new AbortController()
    controller = ownController
    const target = parsePath(to)
    const matches = matchRoutes(branches, target.pathname) ?? []
    const params = matches.at(-1)?.params ?? {}
    const ctx = {
      params,
      pathname: target.pathname,
      search: new URLSearchParams(target.search),
      signal: ownController.signal,
    }
    let error: unknown
    let verdict: GuardResult = true
    try {
      verdict = await runGuards(matches, { ...ctx, from: locationToString(state.location) })
    } catch (caught) {
      error = caught
    }
    if (id !== navigationId) return 'superseded'
    if (verdict === false) {
      if (mode === 'pop') history.replace(locationToString(state.location), state.location.state)
      return 'cancelled'
    }
    if (typeof verdict === 'string') {
      if (redirects >= MAX_REDIRECTS)
        throw new Error(`Yönlendirme döngüsü: ${MAX_REDIRECTS} kez üst üste yönlendirildi (son hedef "${verdict}").`)
      const outcome = await run(verdict, mode === 'push' ? 'push' : 'replace', undefined, redirects + 1)
      return outcome === 'done' ? 'redirected' : outcome
    }
    const data: Record<string, unknown> = {}
    if (error === undefined && matches.some((m) => m.route.loader)) {
      publish({ ...state, status: 'loading', pending: to })
      try {
        const results = await Promise.all(matches.map((m) => m.route.loader?.(ctx)))
        matches.forEach((m, i) => {
          if (m.route.loader) data[m.route.name ?? String(i)] = results[i]
        })
      } catch (caught) {
        error = caught
      }
      if (id !== navigationId) return 'superseded'
    }
    commit(to, mode, userState, { matches, params, data, error })
    return error === undefined ? 'done' : 'error'
  }

  function commit(
    to: string,
    mode: Mode,
    userState: unknown,
    result: Pick<RouterState, 'matches' | 'params' | 'data' | 'error'>,
  ) {
    positions.set(state.location.key, scroll.read())
    if (mode === 'push') history.push(to, userState)
    else if (mode === 'replace') history.replace(to, userState)
    const location = history.location()
    publish({ ...result, location, status: 'idle', pending: undefined })
    if (mode === 'initial') return
    const saved = positions.get(location.key)
    if (mode === 'pop' && saved) scroll.restore(saved)
    else if (location.hash.length > 1) scroll.toHash(decodeURIComponent(location.hash.slice(1)))
    else scroll.restore({ x: 0, y: 0 })
  }

  return {
    get state() {
      return state
    },
    history,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    navigate(to, navOptions = {}) {
      const same = locationToString(parsePath(to)) === locationToString(state.location)
      return run(to, navOptions.replace || same ? 'replace' : 'push', navOptions.state, 0)
    },
    start() {
      unlisten ??= history.listen((location) => void run(locationToString(location), 'pop', location.state, 0))
      return run(locationToString(history.location()), 'initial', history.location().state, 0)
    },
    stop() {
      unlisten?.()
      unlisten = undefined
      controller?.abort()
    },
    href: (to) => history.createHref(to),
    pathFor(name, params) {
      const pattern = names.get(name)
      if (!pattern) throw new Error(`"${name}" adlı rota yok. Rota tanımına \`name: '${name}'\` ekleyin.`)
      return buildPath(pattern, params)
    },
    isActive(to, exact = false) {
      const want = splitPath(parsePath(to).pathname)
      const have = splitPath(state.location.pathname)
      if (exact && want.length !== have.length) return false
      return want.every((part, i) => have[i] === part)
    },
  }
}
