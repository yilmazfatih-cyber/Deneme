/**
 * TV kabuğunun diğer TV ekranlarına açtığı yüzey.
 *   TvApp                     kabuk (index.tsx yeniden dışa aktarır)
 *   TV_PATHS, categoryPath, titlePath, episodesPath, watchPath, tvRedirectFor, deviceScreenOf   yollar
 *   registerTextTarget        arama ekranı telefon klavyesinden yazı almak için kaydolur
 *   createCommandRouter       kumanda komutu yönlendirici (test ve özel kullanım)
 *   useTvBoot, adoptBoot, loginDemo, logout   oturum
 *   useDeviceState, getPlayerRemote           cihaz istemcisi ve oynatıcı köprüsü
 *   canGoBack, previousPath, useTvBack        uygulama içi geçmiş (önceki TV yolu)
 *   TvPlaceholderScreen       yer tutucu ekran
 */
export { TvApp } from './TvApp'
export {
  categoryPath,
  deviceScreenOf,
  episodesPath,
  railSectionOf,
  titlePath,
  TV_PATHS,
  tvRedirectFor,
  watchPath,
  type TvCategory,
} from './routes'
export {
  createCommandRouter,
  playbackOf,
  registerTextTarget,
  TextTargetRegistry,
  textTargets,
  type CommandDeps,
  type CommandRouter,
  type PlayerRemoteLike,
  type TextTarget,
} from './commands'
export { adoptBoot, ensureBoot, loginDemo, logout, useTvBoot } from './session'
export { getPlayerRemote, useDeviceState } from './device'
export { canGoBack, previousPath, TvHistoryStack, tvHistory, useTvBack } from './history'
export { TvPlaceholderScreen } from './Placeholder'
