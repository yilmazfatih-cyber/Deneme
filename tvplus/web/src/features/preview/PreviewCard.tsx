/**
 * Yüzen önizleme kartı: 16:9 görsel (≈600 ms sonra sessiz tanıtım klibi), eylem satırı, meta satırı, etiketler.
 * Konum: tutturulduğu kartın ortasında, görünür alanın içinde (üst çubuğun altında, alt gezinmenin üstünde).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { AccessLock, AdvisoryBadge, Button, Icon, IconButton, Skeleton } from '../../design'
import { PreviewPlayer } from '../../player'
import { logEvent } from '../../telemetry/logger'
import { usePlaylistToggle, useThumbToggle } from './actions'
import { detailPath, playPath } from './links'
import { isInProgress, joinMeta, playbackBadgeLabels, remainingText, sourceLabels } from './meta'
import type { PreviewTargetInfo } from './PreviewScope'
import { usePreviewVideo } from './store'
import { notePlaybackIntent } from './sync'
import type { MiniModalVideo } from './types'

const PROMO_DELAY_MS = 600
const MAX_W = 380 // ortam alanı ≥ 356×200: YouTube gömmesinin en küçük oynatıcı boyutu
const EDGE = 8

export interface PreviewCardProps {
  ref?: Ref<HTMLDivElement>
  info: PreviewTargetInfo
  anchor: HTMLElement
  via: 'hover' | 'focus' | 'touch'
  onPointerEnter: () => void
  onPointerLeave: () => void
  onBlurOut: () => void
  onClose: () => void
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function cssPx(name: string, fallback: number): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(v) ? v : fallback
}

/** Kartın konumu: tutturulan öğenin ortası, görünür alana kıstırılmış. */
function place(el: HTMLDivElement, anchor: HTMLElement): void {
  const r = anchor.getBoundingClientRect()
  const vw = document.documentElement.clientWidth
  const vh = window.innerHeight
  const w = Math.min(MAX_W, vw - EDGE * 2)
  el.style.width = `${w}px`
  const h = el.offsetHeight
  const top0 = cssPx('--topbar-h', 56) + EDGE
  const bottom0 = vh - cssPx('--bottomnav-h', 0) - EDGE
  const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - w / 2), vw - w - EDGE)
  const top = Math.min(Math.max(top0, r.top + r.height / 2 - h / 2), Math.max(top0, bottom0 - h))
  el.style.left = `${Math.round(left)}px`
  el.style.top = `${Math.round(top)}px`
}

export function PreviewCard({
  ref,
  info,
  anchor,
  onPointerEnter,
  onPointerLeave,
  onBlurOut,
  onClose,
}: PreviewCardProps): ReactElement {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const { video, failed } = usePreviewVideo(info.videoId)

  const setRefs = (el: HTMLDivElement | null) => {
    boxRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as { current: HTMLDivElement | null }).current = el
  }

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    place(el, anchor)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => place(el, anchor)) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [anchor, video])

  return (
    <div
      ref={setRefs}
      className="pv-card"
      role="dialog"
      aria-label={`${info.title} önizlemesi`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onBlur={(e) => {
        const next = e.relatedTarget
        if (!(next instanceof Node) || (!boxRef.current?.contains(next) && !anchor.contains(next))) onBlurOut()
      }}
    >
      <PreviewMedia info={info} video={video} />
      {video ? (
        <PreviewBody video={video} info={info} onClose={onClose} />
      ) : (
        <div className="pv-body">
          <p className="pv-title">{info.title}</p>
          {failed ? (
            <div className="pv-actions">
              <Button size="md" to={detailPath(info.videoId, info.tctx)} icon="info">
                Detay
              </Button>
              <span className="cn-meta">Önizleme şu an açılamadı</span>
            </div>
          ) : (
            <div className="pv-skel" aria-label="Yükleniyor" role="status">
              <Skeleton variant="text" width="70%" />
              <Skeleton variant="text" width="45%" />
            </div>
          )}
        </div>
      )}
      <IconButton className="pv-close" icon="close" label="Önizlemeyi kapat" size={36} overImage onClick={onClose} />
    </div>
  )
}

/** 16:9 görsel + gecikmeli sessiz klip (hata olursa sessizce görselde kalır). */
function PreviewMedia({ info, video }: { info: PreviewTargetInfo; video: MiniModalVideo | null }): ReactElement {
  const still = video?.storyArt?.url ?? info.imageUrl ?? null
  const promo = video?.access.state === 'PLAYABLE' ? video.promoVideo : null
  const [armed, setArmed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    if (!promo || prefersReducedMotion()) return
    const t = window.setTimeout(() => setArmed(true), PROMO_DELAY_MS)
    return () => clearTimeout(t)
  }, [promo])

  return (
    <div className="pv-media">
      {still ? (
        <img className="pv-media__still" src={still} alt="" />
      ) : (
        <span className="pv-media__empty">{info.title}</span>
      )}
      {promo && armed && !broken && (
        <div className={playing ? 'pv-media__clip pv-media__clip--on' : 'pv-media__clip'}>
          <PreviewPlayer
            viewableId={promo.viewableId}
            offsetSec={promo.offset}
            muted
            onPlaying={() => setPlaying(true)}
            onError={() => setBroken(true)}
          />
        </div>
      )}
    </div>
  )
}

function PreviewBody({
  video,
  info,
  onClose,
}: {
  video: MiniModalVideo
  info: PreviewTargetInfo
  onClose: () => void
}): ReactElement {
  const list = usePlaylistToggle(video.videoId, video.isInPlaylist, info.tctx)
  const thumb = useThumbToggle(video.videoId, video.thumbRating, info.tctx)
  const playable = video.access.state === 'PLAYABLE'
  const isShow = video.__typename === 'Show'
  const ep = isShow ? video.currentEpisode : undefined
  const playId = isShow ? (ep?.videoId ?? null) : video.videoId
  const bm = isShow ? (ep?.bookmark ?? null) : video.bookmark
  const resume = isInProgress(bm)
  const detail = detailPath(video.videoId, info.tctx)
  const badges = playbackBadgeLabels(video.playbackBadges)
  const sources = sourceLabels(video.sourceKinds.length ? video.sourceKinds : video.playbackBadges)
  const tags = video.textEvidence.map((t) => t.text).filter(Boolean)
  const epLine = ep
    ? joinMeta([ep.numberLabel, ep.title, resume ? remainingText(ep.bookmark?.positionSec, ep.runtimeSec) : null])
    : null
  const movieLeft =
    !isShow && resume
      ? remainingText(video.bookmark?.positionSec, video.bookmark?.runtimeSec ?? video.runtimeSec)
      : null

  return (
    <div className="pv-body">
      <p className="pv-title">{video.title}</p>
      <div className="pv-actions">
        {playable && playId !== null ? (
          <Link
            className="pv-play"
            to={playPath(playId, info.tctx)}
            aria-label={resume ? `${video.title}: Devam et` : `${video.title}: İzle`}
            title={resume ? 'Devam et' : 'İzle'}
            onClick={() => {
              notePlaybackIntent(playId, video.videoId)
              logEvent('click', { videoId: video.videoId, action: 'play', from: 'preview' }, info.tctx)
            }}
          >
            <Icon name="play" size={24} />
          </Link>
        ) : (
          <Button
            size="md"
            to={detail}
            icon="info"
            onClick={() => logEvent('click', { videoId: video.videoId, action: 'detail', from: 'preview' }, info.tctx)}
          >
            Detay
          </Button>
        )}
        <IconButton
          icon={list.on ? 'check' : 'plus'}
          label={list.on ? 'Listemde' : 'Listeme ekle'}
          pressed={list.on}
          onClick={list.toggle}
        />
        <IconButton
          icon="like"
          label="Beğen"
          pressed={thumb.on}
          onClick={thumb.toggle}
          className={thumb.on ? 'pv-on' : undefined}
        />
        <span className="pv-spacer" />
        {playable && (
          <IconButton
            icon="chevronDown"
            label="Detay"
            to={detail}
            onClick={() => {
              logEvent('click', { videoId: video.videoId, action: 'detail', from: 'preview' }, info.tctx)
              onClose()
            }}
          />
        )}
      </div>
      {!playable && video.access.reasonText && <AccessLock text={video.access.reasonText} />}
      {epLine && <p className="cn-meta pv-line">{epLine}</p>}
      {movieLeft && <p className="cn-meta pv-line">{movieLeft}</p>}
      <div className="pv-meta">
        <AdvisoryBadge
          certification={video.contentAdvisory.certificationValue}
          reasons={video.contentAdvisory.reasons ?? []}
        />
        {video.displayRuntime && <span className="pv-meta__text">{video.displayRuntime}</span>}
        {badges.map((b) => (
          <span key={b} className="pv-tag">
            {b}
          </span>
        ))}
        {sources.length > 0 && <span className="pv-meta__text">{sources.join(', ')}</span>}
      </div>
      {tags.length > 0 && <p className="pv-evidence">{tags.join(' · ')}</p>}
    </div>
  )
}
