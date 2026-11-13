/**
 * çini — TV+ tasarım sistemi (Netflix "Hawkins" karşılığı). Tek kaynak: docs/referans/DESIGN_SPEC.md.
 * Sayfalar yalnız bu dosyadan içe aktarır: `import { Row, PosterCard, ... } from '../../design'`.
 *
 * Yazı rolleri CSS sınıfıyla: cn-screen-title, cn-hero-title, cn-row-title, cn-card-title, cn-body, cn-meta.
 * Yerleşim: cn-gutter-x (yatay kenar boşluğu margin), cn-pad-x (padding), cn-sr-only. Görsel QA: #/_tasarim.
 */
import './tokens.css'
import './base.css'

export { cx } from './cx'
export { Icon, ICON_NAMES, type IconName, type IconProps } from './Icon'
export {
  Button,
  IconButton,
  TextButton,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonProps,
  type TextButtonProps,
} from './Button'
export { Chip, ModeSwitch, type AppMode, type ChipProps, type ModeSwitchProps } from './Chip'
export {
  HScroll,
  Page,
  Row,
  RowHeader,
  type HScrollProps,
  type RowHeaderProps,
  type RowProps,
  type VisibleRange,
} from './Row'
export {
  ChannelTile,
  LandscapeCard,
  LiveChannelCard,
  PosterCard,
  type ChannelTileProps,
  type LandscapeCardProps,
  type LiveChannelCardProps,
  type LiveWindow,
  type PosterCardProps,
} from './Cards'
export {
  AccessLock,
  AdvisoryBadge,
  Avatar,
  Badge,
  EmptyHint,
  ErrorState,
  LiveTag,
  ProgressBar,
  Skeleton,
  SkeletonRow,
  type AdvisoryBadgeProps,
  type AvatarProps,
  type BadgeText,
  type Certification,
  type ErrorStateProps,
  type ProgressBarProps,
  type SkeletonVariant,
} from './Feedback'
export { Sheet, ToastHost, dismissToast, toast, type SheetProps, type ToastKind } from './Overlay'
export {
  WEEKDAYS_SHORT,
  formatClock,
  formatDayTime,
  formatLiveLine,
  formatRemaining,
  formatTimeRange,
  liveProgress,
  minutesLeft,
  weekdayIndex,
  weekdayShort,
  type DateInput,
} from './time'
export { useNow } from './useNow'
