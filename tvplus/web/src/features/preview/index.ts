/**
 * Önizleme (hover / uzun basış) ve keşif ekranlarının ortak parçaları.
 * Diğer ekranlar kartlarına aynı önizlemeyi şöyle bağlar:
 *   <PreviewScope>
 *     <PreviewTarget info={{ rowId, videoId, getRowVideoIds, tctx, title, imageUrl }}><PosterCard … /></PreviewTarget>
 *   </PreviewScope>
 */
export {
  PreviewScope,
  PreviewTarget,
  usePreviewTarget,
  HOVER_DELAY_MS,
  type PreviewTargetInfo,
  type PreviewTargetProps,
} from './PreviewScope'
export { usePlaylistToggle, useThumbToggle, type ToggleState } from './actions'
export {
  appPathOfHref,
  channelPlayPath,
  collectionPath,
  detailPath,
  genrePath,
  localTctx,
  personPath,
  playPath,
  withQuery,
} from './links'
export {
  badgeTextOf,
  isInProgress,
  joinMeta,
  lockedTextOf,
  playbackBadgeLabels,
  remainingText,
  sourceLabels,
} from './meta'
export { clearPreviews, requestRowPreview, usePreviewVideo } from './store'
export {
  flushPlaybackChanges,
  notePlaybackIntent,
  onMyListChanged,
  onRatingChanged,
  useFreshAfterPlayback,
} from './sync'
export type * from './types'
