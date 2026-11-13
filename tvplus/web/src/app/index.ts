/**
 * anka — uygulama kabuğunun sayfalara açtığı araçlar:
 *   Oturum      useSession / useBoot / useActiveProfile (giriş, çıkış, switchProfile(guid, pin?), reloadBoot)
 *   Bağlantı    titleHref(videoId, tctx?) / useTitleHref() — masaüstünde `?jbv=` penceresi, mobilde /baslik/:id
 *               closeTitleHref, DETAIL_PARAM ('jbv'), TCTX_PARAM
 *   Detay       useDetailModal() — açık başlık (videoId, tctx) ve close() (features/detail DetailModalOutlet için)
 *   Kabuk       useShellOptions({ fullBleed, mobileTitle, topBar }) · <ShellPills> (mobil hap sırası)
 *               useShellFormFactor() · DESKTOP_NAV · MOBILE_TABS
 *   Sayfa       useDocumentTitle("Sintel") → "Sintel · TV+" · PagePlaceholder · PageSkeleton · RouteErrorBoundary
 *   Diğer       toggleDevtoolsPanel() — "Kaputun altı" panelini aç/kapat
 */
export { App } from './App'
export { toggleDevtoolsPanel } from './AvatarMenu'
export { DESKTOP_NAV, type NavEntry } from './DesktopShell'
export { useDetailModal, type DetailModalState } from './detailModal'
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
