/**
 * TV arayüz ilkelleri (10-foot). Hepsi odak motoruyla (../focus) çalışır; yalnız yön tuşları + OK + Geri yeter.
 * Stil: ./tv.css (bu dosya içe aktarınca yüklenir). Ölçüler rem (1 rem = ekran genişliği / 120).
 */
import './tv.css'

export { TvScreen, TvScreenEdgeProvider, screenScopeId, type TvScreenProps } from './TvScreen'
export { TvActionList, TvButton, TvKeypad, type TvAction, type TvButtonProps, type TvKeypadProps } from './controls'
export {
  TvAvatar,
  TvCard,
  TvLiveTag,
  TvPosterCard,
  TvProgress,
  TvSkeletonCard,
  TvSkeletonRow,
  TvSkeletonText,
  type TvCardProps,
  type TvPosterCardProps,
} from './cards'
export {
  clampIndex,
  rowWindow,
  TvRow,
  TvRowsViewport,
  useFocusedIndexWithin,
  type TvRowProps,
  type TvRowsViewportProps,
} from './rows'
export { TvGrid, TvList, useScrollFocusedIntoView, type TvGridProps, type TvListProps } from './lists'
export {
  openRail,
  railItemId,
  TvRail,
  TV_RAIL_SCOPE,
  type TvRailItem,
  type TvRailProfile,
  type TvRailProps,
} from './TvRail'
export { TvDialog, TvToastHost, tvToast, type TvDialogProps, type TvToastItem } from './overlays'
export { TvBackground, type TvBackgroundProps } from './TvBackground'
export { TV_ICON_NAMES, TvIcon, type TvIconName, type TvIconProps } from './icons'
export {
  displayAddress,
  formatClock,
  formatCountdown,
  formatDuration,
  formatRemaining,
  formatTimeRange,
  formatUserCode,
  useNow,
} from './format'
