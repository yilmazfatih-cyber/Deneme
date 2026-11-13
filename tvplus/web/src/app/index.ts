/**
 * anka — uygulama kabuğunun sayfalara açtığı araçlar:
 *   Oturum      useSession / useBoot / useActiveProfile (giriş, çıkış, switchProfile(guid, pin?), reloadBoot)
 *   Bağlantı    titleHref(videoId, tctx?) / useTitleHref() — masaüstünde `?jbv=` penceresi, mobilde /baslik/:id
 *               closeTitleHref, DETAIL_PARAM ('jbv'), TCTX_PARAM
 *   Detay       useDetailModal() — açık başlık (videoId, tctx), close(), switchTo(videoId, tctx?) (pencerede geçiş)
 *   Kabuk       useShellOptions({ fullBleed, mobileTitle, topBar, keepScroll }) · <ShellPills> (mobil hap sırası)
 *               useShellFormFactor() · DESKTOP_NAV · MOBILE_TABS
 *   Sayfa       useDocumentTitle("Sintel") → "Sintel · TV+" · PagePlaceholder · PageSkeleton · RouteErrorBoundary
 *   Kaputun altı toggleDevtoolsPanel() · isDevtoolsOpen() · subscribeDevtools(fn) · useDevtoolsOpen()
 */
export { App } from './App'
export { toggleDevtoolsPanel } from './AvatarMenu'
export { activeDesktopNav, DESKTOP_NAV, type NavEntry } from './nav'
export { switchTitleHref, useDetailModal, type DetailModalState } from './detailModal'
export { isDevtoolsOpen, subscribeDevtools, useDevtoolsOpen } from './devtoolsState'
export { accessOf, decideAccess, type Access, type GuardDecision } from './guards'
export {
  buildTitleHref,
  closeTitleHref,
  DETAIL_PARAM,
  TCTX_PARAM,
  titleHref,
  useTitleHref,
  type LocationLike,
} from './links'
export { MOBILE_TABS } from './MobileShell'
export { PagePlaceholder } from './PagePlaceholder'
export { titleForPath, useDocumentTitle } from './RouteEffects'
export { PageSkeleton, RouteErrorBoundary, RouteFrame } from './RouteFrame'
export {
  useActiveProfile,
  useBoot,
  useSession,
  type SessionState,
  type SessionStatus,
  type SwitchProfileResult,
} from './sessionStore'
export { ShellPills, useShellFormFactor, useShellOptions, type ShellOptions } from './shellContext'
