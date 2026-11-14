/**
 * Netflix önizleme kartı (UX_SPEC §2 "Önizleme kartı"): `--surface-1`, gölgeli; üstte 16:9 görsel → 600 ms sonra
 * sessiz tanıtım; altta yuvarlak düğmeler (▶ beyaz · ＋/✓ Listem · beğen · sağda ⌄ "Daha fazla bilgi"), tek bilgi
 * satırı ("%97 Eşleşme" ya da "Yeni" yeşil · yaş işareti · "2 Sezon" / "1 sa 28 dk" · HD) ve noktayla ayrılmış üç etiket.
 * Konum ve büyüme: placement.ts (kartın kendi yerinden ~1.5×).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type Ref } from 'react'
import { useNavigate } from 'react-router-dom'
import { falcor } from '../../api/falcor'
import { titleHref } from '../../app'
import { PreviewPlayer } from '../../player'
import { logEvent } from '../../telemetry/logger'
import { AdvisoryBadge, Badge, RoundButton, Skeleton } from '../../ui'
import { usePlaylistToggle, useThumbToggle } from './actions'
import { playPath } from './links'
import { isInProgress, previewMeta } from './meta'
import { placePreview, type Box } from './placement'
import { CLOSE_MS } from './openState'
import type { PreviewTargetInfo } from './PreviewScope'
import { usePreviewVideo } from './store'
import { notePlaybackIntent } from './sync'
import type { MiniModalVideo } from './types'

const PROMO_DELAY_MS = 600
/** Bilgi alanı ölçülemeden önceki tahmini yükseklik (px) */
const BODY_ESTIMATE = 150

export interface PreviewCardProps {
  ref?: Ref<HTMLDivElement>
  info: PreviewTargetInfo
  anchor: HTMLElement
  closing: boolean
  onPointerEnter: () => void
  onPointerLeave: () => void
  onBlurOut: () => void
  /** refocus: odağı karta geri ver (klavye) */
  onClose: (refocus: boolean) => void
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function cssPx(el: Element, name: string, fallback: number): number {
  const v = parseFloat(getComputedStyle(el).getPropertyValue(name))
  return Number.isFinite(v) ? v : fallback
}

/** Kartın görsel kutusu: 16:9 kartta görsel, afişte (Top 10) kartın tamamı. */
function anchorBox(anchor: HTMLElement): Box {
  const media = anchor.querySelector<HTMLElement>('.ui-card__media') ?? anchor
  const r = media.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function PreviewCard({
  ref,
  info,
  anchor,
  closing,
  onPointerEnter,
  onPointerLeave,
  onBlurOut,
  onClose,
}: PreviewCardProps): ReactElement {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const { video, failed } = usePreviewVideo(info.videoId)
  const [entered, setEntered] = useState(false)
  const reduced = prefersReducedMotion()

  const setRefs = (el: HTMLDivElement | null) => {
    boxRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as { current: HTMLDivElement | null }).current = el
  }

  // Yerleşim: açılışta tutturulan kartın kutusu bir kez ölçülür (sayfa kayınca kart zaten kapanır).
  const box = useRef<Box | null>(null)
  if (!box.current) box.current = anchorBox(anchor)
  const place = () => {
    const el = boxRef.current
    if (!el || !box.current) return
    const root = document.documentElement
    const gutter = gutterPx(root)
    const p = placePreview({
      anchor: box.current,
      viewport: { width: root.clientWidth, height: window.innerHeight },
      bodyHeight: bodyRef.current?.offsetHeight ?? BODY_ESTIMATE,
      edge: info.edge ?? null,
      inset: { left: gutter, right: gutter, top: cssPx(root, '--header-h', 68) + 8, bottom: 8 },
    })
    el.style.left = `${p.left}px`
    el.style.top = `${p.top}px`
    el.style.width = `${p.width}px`
    el.style.setProperty('--pv-from', `translate(${p.from.x}px, ${p.from.y}px) scale(${p.from.scale})`)
    el.dataset.align = p.align
  }

  useLayoutEffect(() => {
    place()
    const body = bodyRef.current
    const ro = typeof ResizeObserver !== 'undefined' && body ? new ResizeObserver(() => place()) : null
    if (body) ro?.observe(body)
    return () => ro?.disconnect()
  }, [])

  // Büyüme: ilk karede başlangıç dönüşümü, sonraki karede kimlik dönüşümüne geçiş.
  useEffect(() => {
    if (reduced) {
      setEntered(true)
      return
    }
    let r2 = 0
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setEntered(true))
    })
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
    }
  }, [reduced])

  const state = closing ? 'is-closing' : entered ? 'is-open' : 'is-entering'

  return (
    <div
      ref={setRefs}
      className={`pv-card ${state}`}
      role="dialog"
      aria-label={`${info.title} önizlemesi`}
      style={{ transitionDuration: closing ? `${CLOSE_MS}ms` : undefined }}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') onPointerEnter()
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') onPointerLeave()
      }}
      onBlur={(e) => {
        const next = e.relatedTarget
        if (!(next instanceof Node) || (!boxRef.current?.contains(next) && !anchor.contains(next))) onBlurOut()
      }}
      onKeyDown={(e) => {
        // Klavye: Shift+Tab ilk düğmeden karta geri döner.
        if (e.key === 'Tab' && e.shiftKey) {
          const first = boxRef.current?.querySelector<HTMLElement>('button:not([disabled]), a[href]')
          if (first && document.activeElement === first) {
            e.preventDefault()
            onClose(true)
          }
        }
      }}
    >
      <PreviewMedia info={info} video={video} active={!closing} />
      <div ref={bodyRef} className="pv-body">
        {video ? (
          <PreviewBody video={video} info={info} onClose={onClose} />
        ) : failed ? (
          <PreviewFallback info={info} onClose={onClose} />
        ) : (
          <div className="pv-skel" role="status" aria-label="Yükleniyor">
            <div className="pv-actions">
              <Skeleton variant="circle" width="2.6em" height="2.6em" />
              <Skeleton variant="circle" width="2.6em" height="2.6em" />
              <Skeleton variant="circle" width="2.6em" height="2.6em" />
            </div>
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width="50%" />
          </div>
        )}
      </div>
    </div>
  )
}

/** `--gutter` px (masaüstünde 4vw). */
function gutterPx(root: HTMLElement): number {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--gutter)'
  root.appendChild(probe)
  const w = probe.getBoundingClientRect().width
  probe.remove()
  return Number.isFinite(w) && w > 0 ? w : 16
}

/** 16:9 görsel + başlık logosu + gecikmeli sessiz tanıtım (hata olursa sessizce görselde kalır). */
function PreviewMedia({
  info,
  video,
  active,
}: {
  info: PreviewTargetInfo
  video: MiniModalVideo | null
  active: boolean
}): ReactElement {
  const still = video?.storyArt?.url ?? info.imageUrl ?? null
  const promo = video?.access.state === 'PLAYABLE' ? video.promoVideo : null
  const logo = video?.titleLogo?.url ?? null
  const [armed, setArmed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [broken, setBroken] = useState(false)
  const [muted, setMuted] = useState(true)
  const [logoFailed, setLogoFailed] = useState(false)

  useEffect(() => {
    if (!promo || !active || prefersReducedMotion()) return
    const t = window.setTimeout(() => setArmed(true), PROMO_DELAY_MS)
    return () => clearTimeout(t)
  }, [promo, active])

  const live = promo && armed && active && !broken
  return (
    <div className="pv-media">
      {still ? (
        <img className="pv-media__still" src={still} alt="" draggable={false} />
      ) : (
        <span className="pv-media__empty ui-art-fallback">
          <span>{info.title}</span>
        </span>
      )}
      {live && (
        <div className={playing ? 'pv-media__clip is-on' : 'pv-media__clip'}>
          <PreviewPlayer
            viewableId={promo.viewableId}
            offsetSec={promo.offset}
            muted={muted}
            onPlaying={() => setPlaying(true)}
            onError={() => setBroken(true)}
          />
        </div>
      )}
      <span className="pv-media__shade" aria-hidden="true" />
      <div className="pv-media__title">
        {logo && !logoFailed ? (
          <img className="pv-media__logo" src={logo} alt={info.title} onError={() => setLogoFailed(true)} />
        ) : (
          <span className="pv-media__name">{info.title}</span>
        )}
      </div>
      {live && playing && (
        <RoundButton
          className="pv-media__mute"
          size="sm"
          icon={muted ? 'mute' : 'volume'}
          label={muted ? 'Sesi aç' : 'Sesi kapat'}
          onClick={() => setMuted((m) => !m)}
        />
      )}
    </div>
  )
}

function PreviewFallback({ info, onClose }: { info: PreviewTargetInfo; onClose: (r: boolean) => void }) {
  const navigate = useNavigate()
  return (
    <>
      <div className="pv-actions">
        <span className="pv-spacer" />
        <RoundButton
          icon="chevronDown"
          label="Daha fazla bilgi"
          onClick={() => {
            logEvent('click', { videoId: info.videoId, action: 'detail', from: 'preview' }, info.tctx)
            onClose(false)
            navigate(titleHref(info.videoId, info.tctx))
          }}
        />
      </div>
      <p className="pv-note">Ayrıntılar şu an yüklenemedi.</p>
    </>
  )
}

function PreviewBody({
  video,
  info,
  onClose,
}: {
  video: MiniModalVideo
  info: PreviewTargetInfo
  onClose: (refocus: boolean) => void
}): ReactElement {
  const navigate = useNavigate()
  const list = usePlaylistToggle(video.videoId, video.isInPlaylist, info.tctx)
  const thumb = useThumbToggle(video.videoId, video.thumbRating, info.tctx)
  const playable = video.access.state === 'PLAYABLE'
  const isShow = video.__typename === 'Show'
  const ep = isShow ? video.currentEpisode : undefined
  const playId = isShow ? (ep?.videoId ?? null) : video.videoId
  const bm = isShow ? (ep?.bookmark ?? null) : video.bookmark
  const resume = isInProgress(bm)
  // Falcor önbelleğindeki yapraklar (satırla birlikte gelmişse): `tags` ve `matchScore`; yoksa GraphQL karşılıkları.
  const leaf = falcor.peek<{ videos?: Record<string, { tags?: unknown; matchScore?: unknown }> }>([
    'videos',
    video.videoId,
    ['tags', 'matchScore'],
  ]).json.videos?.[String(video.videoId)]
  const meta = previewMeta(typeof leaf?.matchScore === 'number' ? { ...video, matchScore: leaf.matchScore } : video)
  const cached = leaf?.tags
  const tags = (
    Array.isArray(cached) && cached.every((t) => typeof t === 'string')
      ? (cached as string[])
      : video.textEvidence.map((t) => t.text)
  )
    .filter(Boolean)
    .slice(0, 3)

  const openDetail = () => {
    logEvent('click', { videoId: video.videoId, action: 'detail', from: 'preview' }, info.tctx)
    onClose(false)
    navigate(titleHref(video.videoId, info.tctx))
  }

  return (
    <>
      <div className="pv-actions">
        {playable && playId !== null ? (
          <RoundButton
            variant="play"
            icon="play"
            label={resume ? `${video.title}: Devam Et` : `${video.title}: Oynat`}
            title={resume ? 'Devam Et' : 'Oynat'}
            onClick={() => {
              notePlaybackIntent(playId, video.videoId)
              logEvent(
                'click',
                { videoId: video.videoId, action: resume ? 'resume' : 'play', from: 'preview' },
                info.tctx,
              )
              onClose(false)
              navigate(playPath(playId, info.tctx))
            }}
          />
        ) : (
          <RoundButton variant="play" icon="lock" label="Paketi İncele" onClick={openDetail} />
        )}
        <RoundButton
          icon={list.on ? 'check' : 'plus'}
          label={list.on ? 'Listemde' : 'Listeme Ekle'}
          aria-pressed={list.on}
          onClick={list.toggle}
        />
        <RoundButton
          icon="thumbsUp"
          label="Beğen"
          aria-pressed={thumb.on}
          className={thumb.on ? 'is-on' : undefined}
          onClick={thumb.toggle}
        />
        <span className="pv-spacer" />
        <RoundButton icon="chevronDown" label="Daha fazla bilgi" onClick={openDetail} />
      </div>
      <div className="pv-meta">
        {meta.match ? (
          <span className="pv-match">{meta.match}</span>
        ) : (
          meta.isNew && <span className="ui-new">Yeni</span>
        )}
        <AdvisoryBadge
          certification={video.contentAdvisory.certificationValue}
          reasons={video.contentAdvisory.reasons ?? []}
        />
        {meta.length && <span className="pv-meta__text">{meta.length}</span>}
        {meta.quality && <span className="pv-quality">{meta.quality}</span>}
        {!playable && <Badge tone="lock">{video.access.requiredProductName ?? 'Pakette'}</Badge>}
      </div>
      {tags.length > 0 && (
        <ul className="ui-dotted pv-tags" aria-label="Etiketler">
          {tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </>
  )
}
