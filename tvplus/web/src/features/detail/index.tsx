/**
 * Detay sayfası (#/detay/:videoId, isteğe bağlı ?tctx=) — yeni sistemden: gql('DetailModal').
 * Tek dolu birincil eylem (primaryAction.ts), ikinciller: Baştan başlat (yarım kaldıysa), Listeme ekle, Beğen.
 * Dizide sezon seçici + bölüm listesi; fragmanlar; "Benzerleri" ızgarası (önizlemeli); koleksiyonlar.
 * Bilinmeyen / bu profilde görünmeyen kimlik → sakin "bulunamadı" durumu ve geri dönüş yolu (boş ekran yok).
 * Dışa aktarım adı SABİT: DetailPage.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement, type Ref } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { formatRuntime } from '../../../../shared/text'
import { useDocumentTitle } from '../../app'
import { useGql } from '../../api/hooks'
import {
  AccessLock,
  AdvisoryBadge,
  Button,
  Chip,
  ErrorState,
  HScroll,
  Icon,
  IconButton,
  LandscapeCard,
  Page,
  PosterCard,
  ProgressBar,
  RowHeader,
  Sheet,
  Skeleton,
} from '../../design'
import { logEvent } from '../../telemetry/logger'
import {
  collectionPath,
  detailPath,
  genrePath,
  joinMeta,
  localTctx,
  lockedTextOf,
  notePlaybackIntent,
  personPath,
  playbackBadgeLabels,
  playPath,
  PreviewScope,
  PreviewTarget,
  remainingText,
  sourceLabels,
  useFreshAfterPlayback,
  usePlaylistToggle,
  useThumbToggle,
  type ArtworkData,
  type CardVideoData,
  type PromoVideoData,
  type ThumbRatingName,
} from '../preview'
import { primaryActionOf, type PrimaryAction } from './primaryAction'
import './detail.css'

interface PersonRef {
  personId: number
  name: string
}
interface EpisodeData extends CardVideoData {
  number: number
  seasonNumber: number
  synopsis?: string
  runtimeSec: number | null
  still?: ArtworkData
}
interface SeasonData {
  seasonId: string
  number: number
  numberLabel: string
  title: string | null
  episodes: EpisodeData[]
}
interface DetailVideo extends CardVideoData {
  synopsis: string
  contextualSynopsis: string
  runtimeSec: number | null
  isAvailable: boolean
  isInPlaylist: boolean
  playlistActions: string[]
  thumbRating: ThumbRatingName
  playbackBadges: string[]
  billboard: ArtworkData
  genreTags: { genreId: number; name: string }[]
  moodTags: { id: number; displayName: string; isMood: boolean }[]
  textEvidence: { key: string; text: string }[]
  license: { name: string; attribution: string; url: string | null } | null
  promoVideo: PromoVideoData | null
  originalTitle?: string | null
  cast?: PersonRef[]
  directors?: PersonRef[]
  creators?: PersonRef[]
  similars?: CardVideoData[]
  supplementalVideos?: (CardVideoData & { subType: string })[]
  collections?: { collectionId: number; name: string }[]
  seasonCount?: number
  episodeCount?: number
  currentEpisode?: EpisodeData
  seasons?: SeasonData[]
  number?: number
  seasonNumber?: number
}
interface DetailData {
  video: DetailVideo | null
}

export function DetailPage(): ReactElement {
  useFreshAfterPlayback()
  const params = useParams()
  const [sp] = useSearchParams()
  const tctx = sp.get('tctx')
  const videoId = Number(params.videoId)
  const valid = Number.isInteger(videoId) && videoId > 0
  const { data, error, loading, refetch } = useGql<DetailData, { videoId: number }>('DetailModal', { videoId }, { enabled: valid, ttlMs: 30_000 })
  const video = data?.video ?? null
  useDocumentTitle(video?.title)

  if (!valid || (data && !video)) return <NotFound />
  if (!video) {
    if (error && !loading) return <ErrorState size="page" title="Bu sayfa yüklenemedi" message="Bağlantını kontrol et ve tekrar dene." onRetry={refetch} />
    return <DetailSkeleton />
  }
  return (
    <PreviewScope>
      <DetailBody key={video.videoId} video={video} tctx={tctx} />
    </PreviewScope>
  )
}

function NotFound(): ReactElement {
  return (
    <Page title="Bu içerik bulunamadı">
      <div className="cn-gutter-x dt-notfound">
        <p className="cn-body">Kaldırılmış ya da bu profilde görünmüyor olabilir.</p>
        <Button to="/film-dizi" icon="home">
          Film &amp; Dizi'ye dön
        </Button>
      </div>
    </Page>
  )
}

function DetailSkeleton(): ReactElement {
  return (
    <div className="cn-page dt-page" aria-busy="true">
      <div className="dt-hero dt-hero--skel" />
      <div className="cn-gutter-x dt-skel">
        <Skeleton variant="title" width={280} />
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="40%" />
      </div>
    </div>
  )
}

/* ───────────── Gövde ───────────── */

function DetailBody({ video, tctx }: { video: DetailVideo; tctx: string | null }): ReactElement {
  const action = primaryActionOf({
    typename: video.__typename,
    videoId: video.videoId,
    access: video.access,
    bookmark: video.bookmark,
    runtimeSec: video.runtimeSec,
    currentEpisode: video.currentEpisode
      ? { videoId: video.currentEpisode.videoId, numberLabel: video.currentEpisode.numberLabel, runtimeSec: video.currentEpisode.runtimeSec, bookmark: video.currentEpisode.bookmark }
      : null,
    tctx,
  })
  const [sheet, setSheet] = useState(false)
  const [onlyMine, setOnlyMine] = useState(false)
  const similarsRef = useRef<HTMLElement>(null)

  const goSimilars = (mine: boolean) => {
    setOnlyMine(mine)
    setSheet(false)
    requestAnimationFrame(() => similarsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  useEffect(() => {
    if (video.access.state !== 'PLAYABLE') logEvent('impression', { videoId: video.videoId, context: 'detail', access: video.access.state }, tctx)
  }, [video.videoId, video.access.state, tctx])

  return (
    <article className="cn-page dt-page" aria-labelledby="dt-title">
      <Hero video={video} action={action} tctx={tctx} onUpsell={() => setSheet(true)} onSimilars={() => goSimilars(false)} />
      <Info video={video} />
      {video.__typename === 'Show' && video.seasons && <Episodes video={video} tctx={tctx} />}
      <Extras video={video} tctx={tctx} />
      <Similars ref={similarsRef} video={video} onlyMine={onlyMine} onToggleMine={() => setOnlyMine((v) => !v)} />
      {!!video.collections?.length && (
        <section className="cn-gutter-x dt-section" aria-labelledby="dt-coll">
          <h2 className="cn-row-title" id="dt-coll">
            Koleksiyonlar
          </h2>
          <ul className="dt-links">
            {video.collections.map((c) => (
              <li key={c.collectionId}>
                <Link className="dt-link" to={collectionPath(c.collectionId)}>
                  {c.name}
                  <Icon name="chevronRight" size={18} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {action.kind === 'upsell' && (
        <Sheet
          open={sheet}
          onClose={() => setSheet(false)}
          title={action.productName ?? 'Paket'}
          actions={
            <Button block icon="chevronRight" onClick={() => goSimilars(true)}>
              Paketimde benzerleri
            </Button>
          }
        >
          {action.reasonText && <AccessLock text={action.reasonText} />}
          <p className="cn-body dt-sheet__text">
            {video.title} {action.productName ?? 'ek paket'} ile izlenir. Bu deneme sürümünde paket satın alınamaz.
          </p>
          <p className="cn-body dt-sheet__text">Paketindeki benzer içeriklere göz atabilirsin.</p>
        </Sheet>
      )}
    </article>
  )
}

/* ───────────── Üst bölüm ───────────── */

function Hero({ video, action, tctx, onUpsell, onSimilars }: { video: DetailVideo; action: PrimaryAction; tctx: string | null; onUpsell: () => void; onSimilars: () => void }): ReactElement {
  const list = usePlaylistToggle(video.videoId, video.isInPlaylist, tctx)
  const thumb = useThumbToggle(video.videoId, video.thumbRating, tctx)
  const art = video.billboard?.url ?? video.storyArt?.url ?? null
  const badges = playbackBadgeLabels(video.playbackBadges)
  const meta = joinMeta([video.latestYear, video.displayRuntime])
  const parent = video.__typename === 'Episode' ? video.parentShow : undefined

  const playClick = (playVideoId: number, kind: string) => {
    notePlaybackIntent(playVideoId, video.videoId)
    logEvent('click', { videoId: video.videoId, playVideoId, action: kind, from: 'detail' }, tctx)
  }

  let primary: ReactElement
  if (action.kind === 'play' || action.kind === 'resume') {
    primary = (
      <Button icon="play" to={action.to} onClick={() => playClick(action.playVideoId, action.kind)}>
        {action.label}
      </Button>
    )
  } else if (action.kind === 'upsell') {
    primary = (
      <Button icon="lock" onClick={onUpsell}>
        {action.label}
      </Button>
    )
  } else {
    primary = (
      <Button icon="chevronDown" onClick={onSimilars}>
        {action.label}
      </Button>
    )
  }

  return (
    <header className="dt-hero">
      <div className="dt-hero__media">
        {art && <img className="dt-hero__art" src={art} alt="" />}
        <span className="dt-hero__shade" aria-hidden="true" />
      </div>
      <div className="dt-hero__body">
        {parent && (
          <Link className="dt-parent" to={`/detay/${parent.videoId}`}>
            {parent.title}
          </Link>
        )}
        <h1 className="cn-hero-title dt-title" id="dt-title">
          {video.title}
        </h1>
        {video.originalTitle && video.originalTitle !== video.title && <p className="cn-meta">{video.originalTitle}</p>}
        <div className="dt-meta">
          {meta && <span className="dt-meta__text">{meta}</span>}
          <AdvisoryBadge certification={video.contentAdvisory.certificationValue} reasons={video.contentAdvisory.reasons ?? []} />
          {badges.map((b) => (
            <span key={b} className="dt-tag">
              {b}
            </span>
          ))}
        </div>
        {(action.kind === 'upsell' || action.kind === 'unavailable') && action.reasonText && <AccessLock text={action.reasonText} />}
        <div className="dt-actions">
          {primary}
          {action.kind === 'resume' && (
            <Button variant="secondary" icon="restart" to={action.restartTo} onClick={() => playClick(action.playVideoId, 'restart')}>
              Baştan başlat
            </Button>
          )}
          <Button variant="secondary" icon={list.on ? 'check' : 'plus'} onClick={list.toggle} aria-label={list.on ? 'Listemde, listeden çıkar' : 'Listeme ekle'}>
            {list.on ? 'Listemde' : 'Listeme ekle'}
          </Button>
          <IconButton icon="like" label="Beğen" pressed={thumb.on} onClick={thumb.toggle} className="pv-pressable" />
        </div>
        {(action.kind === 'play' || action.kind === 'resume') && action.hint && <p className="cn-meta dt-hint">{action.kind === 'play' ? `Sıradaki bölüm: ${action.hint}` : action.hint}</p>}
      </div>
    </header>
  )
}

/* ───────────── Bilgi ───────────── */

function People({ label, people }: { label: string; people: PersonRef[] | undefined }): ReactElement | null {
  if (!people?.length) return null
  return (
    <p className="dt-people">
      <span className="dt-people__label">{label}: </span>
      {people.map((p, i) => (
        <span key={p.personId}>
          {i > 0 && ', '}
          <Link className="dt-plink" to={personPath(p.personId)}>
            {p.name}
          </Link>
        </span>
      ))}
    </p>
  )
}

function Info({ video }: { video: DetailVideo }): ReactElement {
  const evidence = video.textEvidence.map((t) => t.text)
  const moods = video.moodTags.map((m) => m.displayName)
  const sources = sourceLabels(video.sourceKinds)
  return (
    <section className="cn-gutter-x dt-info" aria-label="Bilgi">
      <div className="dt-info__main">
        <p className="cn-body dt-synopsis">{video.contextualSynopsis || video.synopsis}</p>
        {evidence.length > 0 && <p className="dt-evidence">{evidence.join(' · ')}</p>}
        {video.genreTags.length > 0 && (
          <div className="dt-chips" aria-label="Türler">
            {video.genreTags.map((g) => (
              <Chip key={g.genreId} to={genrePath(g.genreId)}>
                {g.name}
              </Chip>
            ))}
          </div>
        )}
      </div>
      <div className="dt-info__side">
        <People label="Oyuncular" people={video.cast} />
        <People label="Yönetmen" people={video.directors} />
        <People label="Yaratıcılar" people={video.creators} />
        {moods.length > 0 && (
          <p className="dt-people">
            <span className="dt-people__label">Bu yapım: </span>
            {moods.join(', ')}
          </p>
        )}
        {video.license && (
          <p className="dt-license">
            {video.license.url ? (
              <a href={video.license.url} target="_blank" rel="noreferrer noopener">
                {joinMeta([video.license.name, video.license.attribution])}
              </a>
            ) : (
              joinMeta([video.license.name, video.license.attribution])
            )}
            {sources.length > 0 && <span className="dt-license__src">Kaynak: {sources.join(', ')}</span>}
          </p>
        )}
      </div>
    </section>
  )
}

/* ───────────── Bölümler ───────────── */

function Episodes({ video, tctx }: { video: DetailVideo; tctx: string | null }): ReactElement | null {
  const seasons = video.seasons ?? []
  const current = video.currentEpisode
  const [season, setSeason] = useState(() => current?.seasonNumber ?? seasons[0]?.number ?? 1)
  const shown = seasons.find((s) => s.number === season) ?? seasons[0]
  if (!shown) return null
  return (
    <section className="dt-section" aria-labelledby="dt-eps">
      <div className="cn-gutter-x dt-eps__head">
        <h2 className="cn-row-title" id="dt-eps">
          Bölümler
        </h2>
        {seasons.length > 1 ? (
          <div className="dt-chips" role="group" aria-label="Sezon">
            {seasons.map((s) => (
              <Chip key={s.seasonId} selected={s.number === shown.number} onClick={() => setSeason(s.number)}>
                {s.title ?? `${s.number}. Sezon`}
              </Chip>
            ))}
          </div>
        ) : (
          <span className="cn-meta">{shown.title ?? `${shown.number}. Sezon`}</span>
        )}
      </div>
      <ol className="cn-gutter-x dt-eps">
        {shown.episodes.map((ep) => (
          <EpisodeItem key={ep.videoId} ep={ep} current={ep.videoId === current?.videoId} tctx={tctx} parentId={video.videoId} />
        ))}
      </ol>
    </section>
  )
}

function EpisodeItem({ ep, current, tctx, parentId }: { ep: EpisodeData; current: boolean; tctx: string | null; parentId: number }): ReactElement {
  const playable = ep.access.state === 'PLAYABLE'
  const locked = lockedTextOf(ep.access)
  const runtime = formatRuntime(ep.runtimeSec)
  const left = ep.bookmark && ep.bookmark.progress > 0 && ep.bookmark.progress < 0.95 ? remainingText(ep.bookmark.positionSec, ep.runtimeSec) : null
  const label = ep.numberLabel ?? `B${ep.number}`
  const content = (
    <>
      <span className="dt-ep__media">
        {ep.still?.url ? <img src={ep.still.url} alt="" loading="lazy" /> : <span className="dt-ep__noimg">{label}</span>}
        {playable && (
          <span className="dt-ep__play" aria-hidden="true">
            <Icon name="play" size={20} />
          </span>
        )}
        {ep.bookmark && ep.bookmark.progress > 0 && <ProgressBar value={ep.bookmark.progress} label="İzleme ilerlemesi" className="dt-ep__progress" />}
      </span>
      <span className="dt-ep__text">
        <span className="dt-ep__top">
          <span className="dt-ep__label">{label}</span>
          {current && <span className="dt-ep__current">{left ? 'Kaldığın bölüm' : 'Sıradaki bölüm'}</span>}
        </span>
        <span className="cn-card-title dt-ep__title">{ep.title}</span>
        <span className="cn-meta">{locked ?? joinMeta([runtime, left])}</span>
        {ep.synopsis && ep.synopsis !== ep.title && <span className="dt-ep__syn">{ep.synopsis}</span>}
      </span>
    </>
  )
  return (
    <li className={current ? 'dt-ep dt-ep--current' : 'dt-ep'} aria-current={current ? 'true' : undefined}>
      {playable ? (
        <Link
          className="dt-ep__link"
          to={playPath(ep.videoId, tctx)}
          aria-label={`${label}, ${ep.title}, oynat${left ? `, ${left}` : ''}`}
          onClick={() => {
            notePlaybackIntent(ep.videoId, parentId)
            logEvent('click', { videoId: parentId, playVideoId: ep.videoId, action: 'play-episode', from: 'detail' }, tctx)
          }}
        >
          {content}
        </Link>
      ) : (
        <div className="dt-ep__link dt-ep__link--off">{content}</div>
      )}
    </li>
  )
}

/* ───────────── Fragmanlar ───────────── */

function Extras({ video, tctx }: { video: DetailVideo; tctx: string | null }): ReactElement | null {
  const items = video.supplementalVideos ?? []
  if (!items.length) return null
  return (
    <section className="cn-row" aria-labelledby="dt-extras">
      <RowHeader title="Fragmanlar ve ekler" id="dt-extras" />
      <HScroll labelledBy="dt-extras" scrollKey={`ekler:${video.videoId}`}>
        {items.map((s) => (
          <LandscapeCard
            key={s.videoId}
            title={s.title}
            imageUrl={s.storyArt?.url}
            meta={joinMeta([s.subType === 'TRAILER' ? 'Fragman' : s.subType === 'TEASER' ? 'Tanıtım' : 'Kamera arkası', s.displayRuntime])}
            lockedText={lockedTextOf(s.access)}
            to={s.access.state === 'PLAYABLE' ? playPath(s.videoId, tctx) : undefined}
            onClick={() => logEvent('click', { videoId: video.videoId, playVideoId: s.videoId, action: 'play-extra', from: 'detail' }, tctx)}
          />
        ))}
      </HScroll>
    </section>
  )
}

/* ───────────── Benzerleri ───────────── */

function Similars({ ref, video, onlyMine, onToggleMine }: { ref: Ref<HTMLElement>; video: DetailVideo; onlyMine: boolean; onToggleMine: () => void }): ReactElement | null {
  const all = video.similars ?? []
  const items = useMemo(() => (onlyMine ? all.filter((s) => s.access.state === 'PLAYABLE') : all), [all, onlyMine])
  if (!all.length) return null
  const rowId = `benzer_${video.videoId}`
  const ids = () => items.map((s) => s.videoId)
  return (
    <section ref={ref} id="benzerleri" className="dt-section" aria-labelledby="dt-sim">
      <div className="cn-gutter-x dt-eps__head">
        <h2 className="cn-row-title" id="dt-sim">
          Benzerleri
        </h2>
        <Chip selected={onlyMine} onClick={onToggleMine}>
          Yalnız paketimdekiler
        </Chip>
      </div>
      <ul className="cn-gutter-x dt-grid">
        {items.map((s, i) => {
          const t = localTctx(rowId, i, s.videoId)
          const locked = lockedTextOf(s.access)
          return (
            <li key={s.videoId}>
              <PreviewTarget info={{ rowId, videoId: s.videoId, getRowVideoIds: ids, tctx: t, title: s.title, imageUrl: s.storyArt?.url ?? s.boxart?.url }}>
                <PosterCard
                  size="fill"
                  showTitle
                  title={s.title}
                  imageUrl={s.boxart?.url}
                  lockedText={locked}
                  meta={joinMeta([s.latestYear, s.displayRuntime])}
                  to={detailPath(s.videoId, t)}
                  onClick={() => logEvent('click', { videoId: s.videoId, action: 'detail', from: 'similars' }, t)}
                />
              </PreviewTarget>
            </li>
          )
        })}
      </ul>
      {!items.length && <p className="cn-body cn-gutter-x">Paketinde benzer içerik şu an yok.</p>}
    </section>
  )
}
