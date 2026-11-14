/**
 * Detay penceresi (masaüstü) ve başlık sayfası (mobil) için ortak parçalar:
 * görsel/tanıtım alanı, birincil eylem, kişisel eylem düğmeleri, erişim bildirimi, bölüm listesi, benzerleri,
 * fragmanlar ve "Hakkında". Veri biçimini model.ts hazırlar; burada yalnız çizim ve olaylar var.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { videoEntityId } from '../../../../shared/tctx'
import { useTitleHref } from '../../app'
import { isCastAvailable, requestCast, subscribeCastAvailable } from '../../devices/bridge'
import { PreviewPlayer, prefetchManifest } from '../../player'
import { logEvent } from '../../telemetry/logger'
import {
  AdvisoryBadge,
  Badge,
  Button,
  ButtonLink,
  cx,
  Icon,
  Menu,
  MenuItem,
  ProgressBar,
  RoundButton,
  toast,
  usePrefersReducedMotion,
} from '../../ui'
import { useLikeToggle, useMyListToggle } from './actions'
import { collectionPath, genrePath, localTctx, personPath, playPath } from './links'
import {
  aboutOf,
  attributionOf,
  lockedTextOf,
  matchLabel,
  type AccessNotice,
  type DetailMeta,
  type EpisodeRow,
  type EpisodeState,
  type PrimaryAction,
  type SimilarItem,
} from './model'
import { notePlaybackIntent } from './sync'
import type { CardVideoData, DetailVideo, MicrogenreData, PersonRef, PromoVideoData } from './types'

/* ───────────── Görsel + sessiz tanıtım ───────────── */

/** Tanıtım bir an sonra başlar (Netflix: görsel → ~2 sn → sessiz klip). */
const PROMO_DELAY_MS = 1800

/** YouTube oynatıcısının üstüne arayüz çizilmez (UX_SPEC §7 kural 10): o kaynakta görsel kalır. */
export const promoAllowed = (p: PromoVideoData | null | undefined): p is PromoVideoData =>
  !!p && p.sourceKind !== 'YOUTUBE'

export function HeroMedia({
  image,
  promo,
  muted,
  onPlayingChange,
  className,
  children,
}: {
  image: string | null
  promo: PromoVideoData | null
  muted: boolean
  onPlayingChange: (playing: boolean) => void
  className?: string
  children?: ReactNode
}): ReactElement {
  const reduced = usePrefersReducedMotion()
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const cb = useRef(onPlayingChange)
  cb.current = onPlayingChange
  const allowed = promoAllowed(promo) && !reduced && !failed

  useEffect(() => {
    if (!allowed) return
    const t = window.setTimeout(() => setStarted(true), PROMO_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [allowed])
  useEffect(() => cb.current(playing && !failed), [playing, failed])

  return (
    <div className={cx('dt-media', playing && !failed && 'is-playing', className)}>
      {image && !imgFailed ? (
        <img className="dt-media__img" src={image} alt="" draggable={false} onError={() => setImgFailed(true)} />
      ) : (
        <span className="dt-media__img dt-media__img--empty" aria-hidden="true" />
      )}
      {allowed && started && promo && (
        <div className="dt-media__video" aria-hidden="true">
          <PreviewPlayer
            viewableId={promo.viewableId}
            offsetSec={promo.offset}
            muted={muted}
            onPlaying={() => setPlaying(true)}
            onError={() => setFailed(true)}
          />
        </div>
      )}
      <span className="dt-media__shade" aria-hidden="true" />
      {children}
    </div>
  )
}

/* ───────────── TV'de İzle ───────────── */

export function useCastAvailable(): boolean {
  return useSyncExternalStore(subscribeCastAvailable, isCastAvailable, () => false)
}

export function castTo(video: DetailVideo, action: PrimaryAction, tctx: string | null): void {
  if (action.kind !== 'play' && action.kind !== 'resume') return
  const bm = video.__typename === 'Show' ? video.currentEpisode?.bookmark : video.bookmark
  const ok = requestCast({
    viewableId: videoEntityId(action.playVideoId),
    positionSec: action.kind === 'resume' ? bm?.positionSec : undefined,
    tctx: tctx ?? undefined,
    title: video.title,
  })
  logEvent('click', { videoId: video.videoId, playVideoId: action.playVideoId, action: 'cast', from: 'detail' }, tctx)
  if (!ok) toast("Şu an TV'ye bağlanılamıyor. Biraz sonra tekrar dene.")
}

/* ───────────── Birincil eylem ───────────── */

/** Oynat bağlantısına basıldı: olay günlüğü + dönüşte tazeleme. */
export function notePlay(video: Pick<DetailVideo, 'videoId'>, playVideoId: number, kind: string, tctx: string | null) {
  notePlaybackIntent(playVideoId, video.videoId)
  logEvent('click', { videoId: video.videoId, playVideoId, action: kind, from: 'detail' }, tctx)
  logEvent('playback.intent', { videoId: playVideoId, from: 'detail' }, tctx)
}

/** Beyaz "▶ Oynat" / "▶ Devam Et  S1:B3"; paket gerekiyorsa "Paketi İncele". İzlenemiyorsa null. */
export function PrimaryButton({
  video,
  action,
  tctx,
  size = 'md',
  block,
  onUpsell,
}: {
  video: DetailVideo
  action: PrimaryAction
  tctx: string | null
  size?: 'md' | 'lg'
  block?: boolean
  onUpsell: () => void
}): ReactElement | null {
  useEffect(() => {
    // Netflix: pencere açılınca birincil oynatmanın manifesti ön hazırlanır.
    if (action.kind === 'play' || action.kind === 'resume') void prefetchManifest(videoEntityId(action.playVideoId))
  }, [action.kind, action.kind === 'play' || action.kind === 'resume' ? action.playVideoId : 0])

  if (action.kind === 'play' || action.kind === 'resume') {
    return (
      <ButtonLink
        variant="play"
        size={size}
        block={block}
        icon="play"
        to={action.to}
        className="dt-play"
        aria-label={[action.label, video.title, action.episodeCode].filter(Boolean).join(', ')}
        onClick={() => notePlay(video, action.playVideoId, action.kind, tctx)}
      >
        {action.label}
        {action.episodeCode && <span className="dt-play__code">{action.episodeCode}</span>}
      </ButtonLink>
    )
  }
  if (action.kind === 'upsell') {
    return (
      <Button variant="play" size={size} block={block} icon="lock" onClick={onUpsell}>
        {action.label}
      </Button>
    )
  }
  return null
}

/** Devam eden izlemede ilerleme çubuğu + "S1:B3 · 23 dk kaldı". */
export function ResumeLine({ action }: { action: PrimaryAction }): ReactElement | null {
  if (action.kind !== 'resume') return null
  const text = [action.episodeCode, action.remaining].filter(Boolean).join(' · ')
  return (
    <div className="dt-resume">
      <ProgressBar value={action.progress} className="dt-resume__bar" />
      {text && <span className="dt-resume__text">{text}</span>}
    </div>
  )
}

/* ───────────── Kişisel eylemler ───────────── */

export function MyListButton({
  videoId,
  inList,
  tctx,
  size = 'md',
}: {
  videoId: number
  inList: boolean
  tctx: string | null
  size?: 'sm' | 'md' | 'lg'
}): ReactElement {
  const list = useMyListToggle(videoId, inList, tctx)
  return (
    <RoundButton
      icon={list.on ? 'check' : 'plus'}
      label={list.on ? 'Listemden Çıkar' : 'Listeme Ekle'}
      size={size}
      aria-pressed={list.on}
      onClick={list.toggle}
    />
  )
}

export function LikeButton({
  video,
  tctx,
  size = 'md',
}: {
  video: DetailVideo
  tctx: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const like = useLikeToggle(video.videoId, video.thumbRating, tctx)
  return (
    <RoundButton
      icon="thumbsUp"
      label={like.on ? 'Beğendin' : 'Beğen'}
      size={size}
      aria-pressed={like.on}
      className={cx('dt-like', like.on && 'is-on')}
      onClick={like.toggle}
    />
  )
}

/* ───────────── Bilgi satırı ───────────── */

export function MetaLine({ meta, className }: { meta: DetailMeta; className?: string }): ReactElement {
  return (
    <div className={cx('dt-metaline', className)}>
      {meta.match !== null && <span className="dt-match">{matchLabel(meta.match)}</span>}
      {meta.isNew && <span className="ui-new">Yeni</span>}
      {meta.year && <span>{meta.year}</span>}
      {meta.duration && <span>{meta.duration}</span>}
      {meta.quality.map((q) => (
        <span key={q} className="dt-qbadge">
          {q}
        </span>
      ))}
    </div>
  )
}

export function MaturityLine({ meta }: { meta: DetailMeta }): ReactElement | null {
  if (!meta.certification) return null
  return (
    <div className="dt-maturity">
      <AdvisoryBadge certification={meta.certification} reasons={meta.reasons} />
      {meta.reasons.length > 0 && <span className="dt-maturity__reasons">{meta.reasons.join(', ')}</span>}
    </div>
  )
}

export function TopTen({ meta }: { meta: DetailMeta }): ReactElement | null {
  if (!meta.top10) return null
  return (
    <p className="dt-top10">
      <Badge tone="top10" />
      <span>
        Bugün {meta.top10.category} {meta.top10.rank} Numara
      </span>
    </p>
  )
}

/** "Oyuncular: A, B, C, daha fazlası" — bağlantılı kısa liste. `onMore` verilirse "daha fazlası" ona gider. */
export function PeopleLine({
  label,
  items,
  max = 3,
  onMore,
}: {
  label: string
  items: { key: string | number; text: string; to?: string }[]
  max?: number
  onMore?: () => void
}): ReactElement | null {
  if (!items.length) return null
  const shown = items.slice(0, max)
  const more = items.length > max
  return (
    <p className="dt-people">
      <span className="dt-people__label">{label}: </span>
      {shown.map((p, i) => (
        <span key={p.key}>
          {p.to ? (
            <Link className="dt-plink" to={p.to}>
              {p.text}
            </Link>
          ) : (
            p.text
          )}
          {(i < shown.length - 1 || more) && ', '}
        </span>
      ))}
      {more &&
        (onMore ? (
          <button type="button" className="dt-plink dt-more" onClick={onMore}>
            daha fazlası
          </button>
        ) : (
          <span>daha fazlası</span>
        ))}
    </p>
  )
}

export const peopleItems = (list: PersonRef[] | undefined) =>
  (list ?? []).map((p) => ({ key: p.personId, text: p.name, to: personPath(p.personId) }))

/* ───────────── Erişim bildirimi ───────────── */

export function AccessBanner({
  notice,
  title,
  productName,
  expanded,
  onToggle,
  onSimilars,
  hideCta,
  className,
}: {
  /** Birincil düğme zaten aynı işi yapıyorsa (mobil "Paketi İncele") bildirimin kendi düğmesi çizilmez */
  hideCta?: boolean
  notice: AccessNotice
  title: string
  productName: string | null
  expanded: boolean
  onToggle: () => void
  onSimilars: () => void
  className?: string
}): ReactElement {
  const upsell = notice.kind === 'upsell'
  return (
    <section className={cx('dt-access', className)} aria-label="Erişim bilgisi">
      <div className="dt-access__head">
        <Icon name="lock" size={22} className="dt-access__icon" />
        <p className="dt-access__text">{notice.text}</p>
        {hideCta && upsell ? null : upsell ? (
          <Button size="sm" variant="secondary" aria-expanded={expanded} onClick={onToggle}>
            {notice.cta}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={onSimilars}>
            Benzerlerine Göz At
          </Button>
        )}
      </div>
      {upsell && expanded && (
        <div className="dt-access__more">
          <p>
            {title}, {productName ?? 'ek paket'} ile izlenir. Bu deneme sürümünde paket satın alınamaz.
          </p>
          <p>Paketindeki benzer içeriklere göz atabilirsin.</p>
          <Button size="sm" variant="secondary" icon="chevronDown" onClick={onSimilars}>
            Benzerlerine Göz At
          </Button>
        </div>
      )}
    </section>
  )
}

/* ───────────── Bölümler ───────────── */

export function SeasonMenu({
  state,
  onSelect,
}: {
  state: EpisodeState
  onSelect: (season: number) => void
}): ReactElement {
  if (!state.showPicker) return <span className="dt-season-static">{state.selectedLabel}</span>
  return (
    <Menu
      label="Sezon seç"
      align="end"
      arrow={false}
      className="dt-season-menu"
      trigger={({ 'data-open': _open, ...p }) => (
        <button {...p} className="dt-season-trigger">
          {state.selectedLabel}
          <Icon name="caret" size={18} />
        </button>
      )}
    >
      {state.seasons.map((s) => (
        <MenuItem key={s.number} current={s.number === state.selected} onSelect={() => onSelect(s.number)}>
          {s.label} <span className="dt-season-count">({s.episodeCount} Bölüm)</span>
        </MenuItem>
      ))}
    </Menu>
  )
}

export function EpisodeList({
  rows,
  parentId,
  tctx,
  variant,
}: {
  rows: EpisodeRow[]
  parentId: number
  tctx: string | null
  variant: 'desktop' | 'mobile'
}): ReactElement {
  return (
    <ol className={cx('dt-eps', `dt-eps--${variant}`)}>
      {rows.map((ep) => (
        <EpisodeItem key={ep.videoId} ep={ep} parentId={parentId} tctx={tctx} variant={variant} />
      ))}
    </ol>
  )
}

function EpisodeItem({
  ep,
  parentId,
  tctx,
  variant,
}: {
  ep: EpisodeRow
  parentId: number
  tctx: string | null
  variant: 'desktop' | 'mobile'
}): ReactElement {
  const thumb = (
    <span className="dt-ep__thumb">
      {ep.image ? <img src={ep.image} alt="" loading="lazy" /> : <span className="dt-ep__noimg" />}
      {ep.playable && (
        <span className="dt-ep__play" aria-hidden="true">
          <Icon name="play" size={variant === 'mobile' ? 18 : 22} />
        </span>
      )}
      {ep.progress !== null && <ProgressBar value={ep.progress} className="dt-ep__progress" />}
    </span>
  )
  const status = ep.lockedText ?? ep.remaining
  const content =
    variant === 'desktop' ? (
      <>
        <span className="dt-ep__num" aria-hidden="true">
          {ep.number}
        </span>
        {thumb}
        <span className="dt-ep__text">
          <span className="dt-ep__top">
            <span className="dt-ep__title">{ep.title}</span>
            {ep.runtime && <span className="dt-ep__runtime">{ep.runtime}</span>}
          </span>
          {ep.synopsis && <span className="dt-ep__syn">{ep.synopsis}</span>}
          {status && <span className="dt-ep__status">{status}</span>}
        </span>
      </>
    ) : (
      <>
        <span className="dt-ep__head">
          {thumb}
          <span className="dt-ep__text">
            <span className="dt-ep__title">
              {ep.number}. {ep.title}
            </span>
            <span className="dt-ep__runtime">{[ep.runtime, status].filter(Boolean).join(' · ')}</span>
          </span>
        </span>
        {ep.synopsis && <span className="dt-ep__syn">{ep.synopsis}</span>}
      </>
    )
  const label = [`${ep.number}. bölüm, ${ep.title}`, ep.playable ? 'oynat' : ep.lockedText, ep.remaining]
    .filter(Boolean)
    .join(', ')
  return (
    <li className={cx('dt-ep', ep.isCurrent && 'is-current')} aria-current={ep.isCurrent ? 'true' : undefined}>
      {ep.playable ? (
        <Link
          className="dt-ep__link"
          to={playPath(ep.videoId, tctx)}
          aria-label={label}
          onClick={() => {
            notePlaybackIntent(ep.videoId, parentId)
            logEvent(
              'click',
              { videoId: parentId, playVideoId: ep.videoId, action: 'play-episode', from: 'detail' },
              tctx,
            )
          }}
        >
          {content}
        </Link>
      ) : (
        <div className="dt-ep__link is-off" aria-label={label}>
          {content}
        </div>
      )}
    </li>
  )
}

/* ───────────── Benzerleri ───────────── */

/** Masaüstü: 3 sütun kart (görsel + süre, eşleşme · yaş · yıl, ＋, özet, gerekçe). Kart penceredeki başlığı değiştirir. */
export function SimilarCards({ items, sourceId }: { items: SimilarItem[]; sourceId: number }): ReactElement {
  const href = useTitleHref()
  const rowId = `benzer_${sourceId}`
  return (
    <ul className="dt-simgrid">
      {items.map((s, i) => {
        const v = s.video
        const t = localTctx(rowId, i, v.videoId)
        const locked = lockedTextOf(v.access)
        const open = () => {
          logEvent('click', { videoId: v.videoId, action: 'detail', from: 'similars', reason: s.reason }, t)
        }
        return (
          <li key={v.videoId} className="dt-sim">
            <Link
              className="dt-sim__media"
              to={href(v.videoId, t)}
              replace
              onClick={open}
              aria-label={[v.title, locked].filter(Boolean).join(', ')}
            >
              {v.storyArt?.url ? (
                <img src={v.storyArt.url} alt="" loading="lazy" />
              ) : (
                <span className="ui-art-fallback">
                  <span>{v.title}</span>
                </span>
              )}
              {v.displayRuntime && <span className="dt-sim__dur">{v.displayRuntime}</span>}
              {locked && (
                <span className="dt-sim__lock">
                  <Badge tone="lock" />
                </span>
              )}
              <span className="dt-sim__play" aria-hidden="true">
                <Icon name="play" size={28} />
              </span>
            </Link>
            <div className="dt-sim__body">
              <div className="dt-sim__top">
                <div className="dt-sim__meta">
                  {s.match !== null && <span className="dt-match">{matchLabel(s.match)}</span>}
                  <span className="dt-sim__line">
                    <AdvisoryBadge certification={v.contentAdvisory.certificationValue} />
                    {v.latestYear && <span>{v.latestYear}</span>}
                  </span>
                </div>
                <MyListButton videoId={v.videoId} inList={!!v.isInPlaylist} tctx={t} />
              </div>
              <Link className="dt-sim__title" to={href(v.videoId, t)} replace onClick={open} tabIndex={-1}>
                {v.title}
              </Link>
              {v.shortSynopsis && <p className="dt-sim__syn">{v.shortSynopsis}</p>}
              {s.reason && <p className="dt-sim__reason">{s.reason}</p>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Mobil: 3 sütun afiş. */
export function SimilarPosters({ items, sourceId }: { items: SimilarItem[]; sourceId: number }): ReactElement {
  const href = useTitleHref()
  const rowId = `benzer_${sourceId}`
  return (
    <ul className="dt-posters">
      {items.map((s, i) => {
        const v = s.video
        const t = localTctx(rowId, i, v.videoId)
        const locked = lockedTextOf(v.access)
        return (
          <li key={v.videoId}>
            <Link
              to={href(v.videoId, t)}
              className="dt-poster"
              aria-label={[v.title, s.reason, locked].filter(Boolean).join(', ')}
              onClick={() =>
                logEvent('click', { videoId: v.videoId, action: 'detail', from: 'similars', reason: s.reason }, t)
              }
            >
              {v.boxart?.url ? (
                <img src={v.boxart.url} alt="" loading="lazy" />
              ) : (
                <span className="ui-art-fallback">
                  <span>{v.title}</span>
                </span>
              )}
              {locked && (
                <span className="dt-poster__lock">
                  <Badge tone="lock" />
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/* ───────────── Fragmanlar ───────────── */

const SUBTYPE: Record<string, string> = { TRAILER: 'Fragman', TEASER: 'Tanıtım', BEHIND_THE_SCENES: 'Kamera Arkası' }

export function ExtrasList({
  items,
  parentId,
  tctx,
}: {
  items: (CardVideoData & { subType: string })[]
  parentId: number
  tctx: string | null
}): ReactElement {
  return (
    <ul className="dt-extras">
      {items.map((s) => {
        const playable = s.access.state === 'PLAYABLE'
        const body = (
          <>
            <span className="dt-extra__media">
              {s.storyArt?.url ? <img src={s.storyArt.url} alt="" loading="lazy" /> : <span className="dt-ep__noimg" />}
              {playable && (
                <span className="dt-extra__play" aria-hidden="true">
                  <Icon name="play" size={22} />
                </span>
              )}
            </span>
            <span className="dt-extra__title">{s.title}</span>
            <span className="dt-extra__kind">
              {[SUBTYPE[s.subType] ?? 'Ek video', s.displayRuntime, lockedTextOf(s.access)].filter(Boolean).join(' · ')}
            </span>
          </>
        )
        return (
          <li key={s.videoId} className="dt-extra">
            {playable ? (
              <Link
                to={playPath(s.videoId, tctx)}
                className="dt-extra__link"
                onClick={() => {
                  notePlaybackIntent(s.videoId, parentId)
                  logEvent(
                    'click',
                    { videoId: parentId, playVideoId: s.videoId, action: 'play-extra', from: 'detail' },
                    tctx,
                  )
                }}
              >
                {body}
              </Link>
            ) : (
              <div className="dt-extra__link is-off">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* ───────────── Hakkında ───────────── */

export function AboutBlock({
  video,
  meta,
  microgenres,
  headingId,
  showHeading = true,
}: {
  video: DetailVideo
  meta: DetailMeta
  microgenres: MicrogenreData[] | null | undefined
  headingId: string
  showHeading?: boolean
}): ReactElement {
  const rows = aboutOf(video, microgenres, { person: personPath, genre: genrePath, collection: collectionPath })
  const attr = attributionOf(video)
  return (
    <section className="dt-about" aria-labelledby={headingId}>
      <h3 className={cx('dt-about__title', !showHeading && 'ui-sr-only')} id={headingId}>
        <strong>{video.title}</strong> Hakkında
      </h3>
      {video.originalTitle && video.originalTitle !== video.title && (
        <p className="dt-about__row">
          <span className="dt-people__label">Özgün adı: </span>
          {video.originalTitle}
        </p>
      )}
      {rows.map((r) => (
        <p key={r.label} className="dt-about__row">
          <span className="dt-people__label">{r.label}: </span>
          {r.items.map((it, i) => (
            <span key={`${it.text}-${i}`}>
              {it.to ? (
                <Link className="dt-plink" to={it.to}>
                  {it.text}
                </Link>
              ) : (
                it.text
              )}
              {i < r.items.length - 1 && ', '}
            </span>
          ))}
        </p>
      ))}
      {meta.certification && (
        <div className="dt-about__row dt-about__rating">
          <span className="dt-people__label">Yaş sınırı: </span>
          <AdvisoryBadge certification={meta.certification} reasons={meta.reasons} />
          <span>
            {[meta.reasons.join(', '), video.contentAdvisory.boardName].filter(Boolean).join(' · ') || 'Her yaşa uygun'}
          </span>
        </div>
      )}
      {(attr.license || attr.sources.length > 0) && (
        <p className="dt-about__row dt-about__license">
          <span className="dt-people__label">Kaynak ve lisans: </span>
          {attr.license &&
            (attr.url ? (
              <a className="dt-plink" href={attr.url} target="_blank" rel="noreferrer noopener">
                {attr.license}
              </a>
            ) : (
              <span>{attr.license}</span>
            ))}
          {attr.sources.length > 0 && (
            <span className="dt-about__src">
              {attr.license ? ' · ' : ''}Yayın kaynağı: {attr.sources.join(', ')}
            </span>
          )}
        </p>
      )}
    </section>
  )
}

/* ───────────── Yükleniyor / bulunamadı ───────────── */

export function NotFoundNote({ action }: { action?: ReactNode }): ReactElement {
  return (
    <div className="dt-notfound">
      <h2 className="dt-notfound__title">Bu içerik bulunamadı</h2>
      <p className="ui-body">Kaldırılmış ya da bu profilde görünmüyor olabilir.</p>
      {action}
    </div>
  )
}
