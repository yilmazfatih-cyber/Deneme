/**
 * TV+ tasarım sistemi v2 — "Netflix deneyimi, TV+ markası" (tek kaynak: docs/UX_SPEC.md).
 * Yeni kod yalnız buradan içe aktarır: `import { Slider, TitleCard, Billboard } from '../../ui'`.
 * Eski `web/src/design` (v1) geçiş boyunca derlenir ama yeni koddan içe aktarılmaz.
 *
 * Görsel QA: #/_ui (her bileşen, durumlarıyla, masaüstü ve mobil genişlikte).
 *
 * CSS sınıfları (sayfalara açık):
 *   Yazı      ui-page-title · ui-row-title · ui-hero-title · ui-body · ui-meta · ui-caption · ui-new ("Yeni" yeşil)
 *             ui-dotted (noktalı etiket listesi: <ul class="ui-dotted"><li>…)
 *   Yerleşim  ui-gutter (yatay kenar boşluğu: mobil 16 px, masaüstü %4) · ui-sr-only
 *             ui-billboard-rows (vitrinin altına binen satır kapsayıcısı)
 *             ui-desktop-only / ui-mobile-only (900 px kırılımı)
 *   Tokenlar  --bg --surface-1..3 --line --text-1..4 --accent --play-bg --btn-2 --live --positive --gutter
 *             --row-gap --card-gap --header-h --tabbar-h --safe-top --safe-bottom (tümü tokens.css)
 */
import './tokens.css'
import './base.css'

export { cx } from './cx'
export { Icon, ICON_NAMES, type IconName, type IconProps } from './Icon'
export { Logo } from './Logo'
export {
  Button,
  ButtonLink,
  buttonClass,
  IconButton,
  RoundButton,
  type ButtonLinkProps,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonProps,
  type RoundButtonProps,
  type RoundButtonSize,
  type RoundButtonVariant,
} from './Button'
export { PosterCard, RankNumber, TitleCard, type PosterCardProps, type TitleCardProps } from './Cards'
export { Slider, type SliderHandle, type SliderItemContext, type SliderProps } from './Slider'
export {
  clampPage,
  edgeOf,
  firstIndexOfPage,
  itemsPerPageFor,
  pageCount,
  pageOfIndex,
  pageToReveal,
  SLIDER_BREAKPOINTS,
  visibleRange,
  type IndexRange,
} from './sliderMath'
export {
  Billboard,
  BillboardImage,
  BillboardInfo,
  BillboardSide,
  MaturityStrip,
  MobileHero,
  TopTenLine,
  type BillboardInfoProps,
  type BillboardProps,
  type BillboardSideProps,
  type MobileHeroProps,
} from './Billboard'
export {
  dismissToast,
  Modal,
  Sheet,
  toast,
  ToastHost,
  Tooltip,
  type ModalProps,
  type SheetProps,
  type ToastKind,
  type ToastOptions,
} from './Overlay'
export {
  Dropdown,
  Menu,
  MenuItem,
  MenuSeparator,
  type MenuItemProps,
  type MenuProps,
  type MenuTriggerProps,
} from './Menu'
export {
  Pill,
  PillBar,
  PillClear,
  PinInput,
  Switch,
  Tabs,
  TextField,
  type PillProps,
  type PinInputProps,
  type SwitchProps,
  type TabItem,
  type TabsProps,
  type TextFieldProps,
} from './Controls'
export {
  AdvisoryBadge,
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  LiveTag,
  ProgressBar,
  Skeleton,
  SkeletonBillboard,
  SkeletonGrid,
  SkeletonSlider,
  SkeletonText,
  Spinner,
  type AdvisoryBadgeProps,
  type AvatarProps,
  type BadgeProps,
  type BadgeTone,
  type Certification,
  type EmptyStateProps,
  type ErrorStateProps,
  type ProgressBarProps,
  type SkeletonProps,
  type SkeletonVariant,
} from './Feedback'
export {
  formatClock,
  formatDayTime,
  formatEpisodeCode,
  formatLiveLine,
  formatMinutes,
  formatRemaining,
  formatRuntime,
  formatSeasons,
  formatTimeLeft,
  formatTimeRange,
  joinDot,
  liveProgress,
  minutesLeft,
  weekdayIndex,
  WEEKDAYS_SHORT,
  type DateInput,
} from './format'
export { useNow } from './useNow'
export {
  focusableIn,
  useBodyScrollLock,
  useBreakpointItems,
  useEscape,
  useFocusTrap,
  useMediaQuery,
  usePrefersReducedMotion,
  usePresence,
  useScrolled,
  type PresenceState,
} from './hooks'
