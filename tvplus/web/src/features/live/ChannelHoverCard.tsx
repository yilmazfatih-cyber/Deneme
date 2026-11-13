/**
 * Kanal önizleme kartı (masaüstü): kanal kartının üzerinde 500 ms beklenince kart yerinde ~1.5× büyür (300 ms,
 * Netflix eğrisi). Üstte şimdiki yayının görseli (kendi CDN'imizdeki kanalda 600 ms sonra sessiz canlı görüntü),
 * altta yuvarlak düğmeler — ▶ Canlı İzle (beyaz) · ☆ Kanallarım · TV'de İzle · sağda ⌄ Rehberde gör — ardından
 * şimdiki program + kalan süre + ilerleme, sıradaki program + "Hatırlat", kanal bilgisi ve örnek akış etiketi.
 * Kart sayfa kayınca kapanır; fareyle karttan önizlemeye geçilebilir.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { PreviewPlayer } from '../../player'
import { logEvent } from '../../telemetry/logger'
import {
  Button,
  cx,
  formatClock,
  formatLiveLine,
  LiveTag,
  liveProgress,
  ProgressBar,
  RoundButton,
  usePrefersReducedMotion,
} from '../../ui'
import {
  castChannel,
  rememberChannel,
  setReminder,
  toggleFavorite,
  useCastAvailable,
  useFavorite,
  useReminder,
} from './actions'
import { liveWatchPath, lockText } from './airing'
import { placeHoverCard, type HoverPlacement } from './hoverPlacement'
import { currentAiring, previewable, upcomingAiring, type ChannelEntry } from './liveRows'
import { ChannelLogo, LockLine, SampleNote, StarIcon } from './parts'

const PREVIEW_DELAY_MS = 600
const HEADER_H = 68

export interface HoverTarget {
  entry: ChannelEntry
  anchor: HTMLElement
  edge: 'left' | 'right' | null
}

export function ChannelHoverCard({
  target,
  now,
  onPointerEnter,
  onPointerLeave,
  onClose,
}: {
  target: HoverTarget
  now: number
  onPointerEnter: () => void
  onPointerLeave: () => void
  onClose: () => void
}): ReactElement {
  const { entry, anchor, edge } = target
  const ch = entry.channel
  const tctx = entry.track.tctx
  const navigate = useNavigate()
  const reduced = usePrefersReducedMotion()
  const castable = useCastAvailable()
  const fav = useFavorite(ch.channelId, ch.isFavorite)
  const air = currentAiring(ch, now)
  const next = upcomingAiring(ch, now)
  const reminder = useReminder(next?.airingId ?? '', next?.hasReminder)
  const lock = lockText(ch.access)
  const boxRef = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<HoverPlacement | null>(null)
  const [grown, setGrown] = useState(reduced)
  const [preview, setPreview] = useState<'off' | 'trying' | 'on'>('off')

  // Yerleşim: önce ölçülür (bilgi alanının gerçek yüksekliği), sonra kartın kendi yerinden büyür.
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const r = anchor.getBoundingClientRect()
    const width = Math.max(r.width * 1.5, 320)
    box.style.width = `${width}px`
    const body = box.querySelector<HTMLElement>('.lv-hc__body')?.offsetHeight ?? 180
    setPlace(
      placeHoverCard({
        anchor: { left: r.left, top: r.top, width: r.width, height: r.height },
        viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
        bodyHeight: body,
        edge,
        topInset: HEADER_H,
      }),
    )
  }, [anchor, edge])

  useEffect(() => {
    if (!place || grown) return
    let f2 = 0
    const f1 = requestAnimationFrame(() => {
      f2 = requestAnimationFrame(() => setGrown(true))
    })
    return () => {
      cancelAnimationFrame(f1)
      cancelAnimationFrame(f2)
    }
  }, [place, grown])

  // Kendi CDN'imizdeki kanalda 600 ms sonra sessiz canlı görüntü.
  useEffect(() => {
    if (!previewable(ch) || reduced) return
    const t = window.setTimeout(() => setPreview('trying'), PREVIEW_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [ch, reduced])

  // Sayfa kayınca (Netflix gibi) kapanır.
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('scroll', close, { passive: true })
    return () => window.removeEventListener('scroll', close)
  }, [onClose])

  useEffect(() => {
    logEvent('focus', { surface: 'canli', action: 'onizleme', entityId: entry.track.entityId }, tctx)
  }, [entry.track.entityId, tctx])

  const watch = () => {
    logEvent('click', { surface: 'canli', action: 'canli', entityId: entry.track.entityId, via: 'onizleme' }, tctx)
    rememberChannel(ch.channelId)
    navigate(liveWatchPath(ch.channelId, tctx))
  }

  const style: CSSProperties = place
    ? {
        left: place.left,
        top: place.top,
        width: place.width,
        transformOrigin: `${place.originX}px ${place.originY}px`,
        transform: grown ? 'none' : `scale(${place.scale})`,
      }
    : { visibility: 'hidden' }

  return createPortal(
    <div
      ref={boxRef}
      className={cx('lv-hc', grown && 'is-grown')}
      style={style}
      role="group"
      aria-label={`${ch.name} önizlemesi`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="lv-hc__media">
        {air?.art?.url || air?.card?.url ? (
          <img className="lv-hc__img" src={air.art?.url ?? air.card?.url} alt="" />
        ) : (
          <span className="lv-hc__img ui-art-fallback">
            <span>{ch.name}</span>
          </span>
        )}
        {preview !== 'off' && (
          <div className={cx('lv-hc__clip', preview === 'on' && 'is-on')} aria-hidden="true">
            <PreviewPlayer
              viewableId={`Channel:${ch.channelId}`}
              offsetSec={0}
              onPlaying={() => setPreview('on')}
              onError={() => setPreview('off')}
            />
          </div>
        )}
        <ChannelLogo url={ch.logo.url} name={ch.name} size={44} className="lv-hc__logo" />
        {air && <LiveTag className="lv-hc__live" />}
      </div>
      <div className="lv-hc__body">
        <div className="lv-hc__buttons">
          {lock ? null : <RoundButton icon="play" variant="play" label="Canlı İzle" onClick={watch} />}
          <button
            type="button"
            className={cx('ui-round ui-round--outline ui-round--md lv-hc__fav', fav.on && 'is-on')}
            aria-pressed={fav.on}
            aria-label={fav.on ? 'Kanallarımdan çıkar' : 'Kanallarıma ekle'}
            title={fav.on ? 'Kanallarımdan çıkar' : 'Kanallarıma ekle'}
            onClick={() => toggleFavorite({ ...ch }, 'canli', tctx)}
          >
            <StarIcon filled={fav.on} size={20} />
          </button>
          {castable && !lock && (
            <RoundButton
              icon="cast"
              label="TV'de İzle"
              onClick={() =>
                castChannel({ channelId: ch.channelId, name: ch.name, programme: air?.title }, 'canli', tctx)
              }
            />
          )}
          <span className="lv-hc__spacer" />
          <RoundButton
            icon="chevronDown"
            label="Rehberde gör"
            onClick={() => {
              logEvent('click', { surface: 'canli', action: 'rehber', entityId: entry.track.entityId }, tctx)
              navigate(`/rehber?kanal=${ch.channelId}`)
            }}
          />
        </div>
        {air ? (
          <>
            <p className="lv-hc__title">{air.title}</p>
            <p className="lv-hc__meta">{formatLiveLine(air.startAt, air.endAt, now)}</p>
            <ProgressBar value={liveProgress(air.startAt, air.endAt, now)} label="Yayın ilerlemesi" />
          </>
        ) : (
          <p className="lv-hc__meta">Yayın bilgisi yok</p>
        )}
        {lock && <LockLine text={lock} />}
        {next && (
          <div className="lv-hc__next">
            <span className="lv-hc__nexttext">
              <span className="lv-hc__nextwhen">Sonra · {formatClock(next.startAt)}</span>
              <span className="lv-hc__nexttitle">{next.title}</span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              icon={reminder.on ? 'check' : 'bell'}
              aria-pressed={reminder.on}
              aria-label={reminder.on ? `${next.title}: Hatırlatmayı Kaldır` : `${next.title}: Hatırlat`}
              className="lv-hc__remind"
              onClick={() => setReminder({ ...next, hasReminder: next.hasReminder }, 'canli', tctx)}
            >
              Hatırlat
            </Button>
          </div>
        )}
        <p className="lv-hc__foot">
          <span>
            {ch.number} · {ch.name}
          </span>
          <span>{ch.categoryName}</span>
          {ch.isHd && <span className="lv-hc__hd">HD</span>}
          {ch.isSampleSchedule && <SampleNote />}
        </p>
      </div>
    </div>,
    document.body,
  )
}
