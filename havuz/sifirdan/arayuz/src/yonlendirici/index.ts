// yonlendirici — istemci yönlendiricisi: desen eşleme, iç içe rotalar, hash/History/bellek kipi,
// korumalar ve yükleyiciler, kaydırma konumu, bağlantı yakalama. Tek giriş noktası budur.
// Ayrıntılı anlatım: README.md.
// Genişletme: yeni parça ayrı dosyada yazılıp buradan dışa aktarılır.
export { buildPath, expandPattern, matchSegments, splitPath, type Params } from './pattern.ts'
export {
  flattenRoutes,
  matchRoutes,
  type GuardResult,
  type NavigationContext,
  type RouteDef,
  type RouteMatch,
} from './routes.ts'
export {
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
  locationToString,
  parsePath,
  type HistoryLocation,
  type RouterHistory,
} from './history.ts'
export {
  createRouter,
  MAX_REDIRECTS,
  type NavigationOutcome,
  type Router,
  type RouterOptions,
  type RouterState,
} from './router.ts'
export { noScroll, windowScroll, type ScrollAdapter, type ScrollPosition } from './scroll.ts'
export { interceptLinks, routeFromAnchor } from './links.ts'
export { renderRoutes, type View, type ViewContext } from './dom_view.ts'
export { routerSignal } from './signal_adapter.ts'
