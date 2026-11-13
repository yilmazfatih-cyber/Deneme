/**
 * TV Detay ve Bölümler ekranları. Dışa aktarım adları SABİT.
 *   TvDetail    /tv/baslik/:videoId            (isteğe bağlı ?tctx=)
 *   TvEpisodes  /tv/baslik/:videoId/bolumler
 *
 * Detay tam ekrandır (UX_SPEC §4, kural 5): sağda sola ve aşağı karartmalı büyük görsel; solda başlık, bilgi satırı
 * (eşleşme · yıl · yaş işareti + nedenleri · sezon/süre · kalite), özet, oyuncular; dikey eylem listesi (varsayılan
 * odak birincil eylemde); altında "Benzerleri" satırı — odak oraya inince sayfa yukarı kayar. Paket gerektiren
 * başlıkta birincil eylem "Paketi İncele"dir ve sakin bir pencere açar (tam ekran hata yok).
 * Bölümler: solda sezonlar, sağda bölüm listesi; odak devam edilecek bölümde açılır, OK oynatır.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { formatTctx } from '../../../../shared/tctx'
import { useGql } from '../../api/hooks'
import { logEvent } from '../../telemetry/logger'
import { FocusScope, useFocusable, useFocusEngine, useFocusWithin } from '../focus'
import { episodesPath, titlePath, watchPath } from '../shell'
import {
  TvActionList,
  TvBackground,
  TvButton,
  TvCard,
  TvDialog,
  TvProgress,
  TvScreen,
  TvSkeletonText,
  useScrollFocusedIntoView,
  type TvAction,
} from '../ui'
import { Lane } from '../home/Lane'
import { useLikeToggle, useMyListToggle } from './actions'
import {
  castLine,
  detailMeta,
  durationText,
  episodeLabel,
  episodePlay,
  isInProgress,
  primaryActionOf,
  qualityLabels,
  seasonLabel,
  startEpisodeOf,
  trailerOf,
  type CardVideoData,
  type DetailVideoData,
  type EpisodeData,
  type SeasonData,
} from './model'
import '../home/home.css'
import './detail.css'

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

const idParam = (raw: string | undefined): number | null => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/* ═════════════════════════════ Detay ═════════════════════════════ */

const PRIMARY_ID = 'detay:birincil'

export function TvDetail(): ReactElement {
  const id = idParam(useParams().videoId)
  const [params] = useSearchParams()
  const tctx = params.get('tctx')
  const q = useGql<{ video: DetailVideoData | null }, { videoId: number }>(
    'TvDetail',
    { videoId: id ?? 0 },
    // Oynatıcıdan dönünce "Devam Et" ve ilerleme tazelensin: her bağlanmada yeniden çekilir (eski veri ekranda kalır).
    { enabled: id !== null, ttlMs: 0 },
  )
  const video = q.data?.video ?? null
  if (video?.__typename === 'Episode' && video.parentShow)
    return <Navigate to={titlePath(video.parentShow.videoId)} replace />
  const screenId = `detay-${id ?? 'yok'}`
  return (
    <TvScreen id={screenId} title={video?.title ?? 'Detay'} padded={false} defaultFocus={PRIMARY_ID} className="tvd">
      {video ? (
        <DetailBody key={video.videoId} video={video} tctx={tctx} screenId={screenId} />
      ) : (
        <DetailPlaceholder failed={!!q.error || (!!q.data && !video) || id === null} onRetry={q.refetch} />
      )}
    </TvScreen>
  )
}

/** Yüklenirken de odak kaybolmaz: birincil eylem aynı kimlikle yerinde durur. */
function DetailPlaceholder({ failed, onRetry }: { failed: boolean; onRetry: () => void }): ReactElement {
  return (
    <div className="tvd-page">
      <div className="tvd-info">
        {failed ? (
          <>
            <h1 className="tvd-title">Bu başlık açılamadı</h1>
            <p className="tvd-access">Bağlantını kontrol et ve tekrar dene.</p>
          </>
        ) : (
          <TvSkeletonText lines={4} width={40} />
        )}
      </div>
      <TvActionList
        id="detay-eylemler"
        className="tvd-actions"
        actions={[
          failed
            ? { id: PRIMARY_ID, label: 'Tekrar dene', icon: 'restart', onPress: onRetry }
            : { id: PRIMARY_ID, label: 'Oynat', icon: 'play', onPress: () => undefined, description: 'Yükleniyor' },
        ]}
      />
    </div>
  )
}

function DetailBody({
  video,
  tctx,
  screenId,
}: {
  video: DetailVideoData
  tctx: string | null
  screenId: string
}): ReactElement {
  const navigate = useNavigate()
  const engine = useFocusEngine()
  const primary = primaryActionOf(video)
  const meta = detailMeta(video)
  const quality = qualityLabels(video.playbackBadges)
  const cast = castLine(video)
  const trailer = trailerOf(video)
  const myList = useMyListToggle(video.videoId, video.isInPlaylist, tctx)
  const like = useLikeToggle(video.videoId, video.thumbRating, tctx)
  const [upsell, setUpsell] = useState(false)
  const similars = video.similars ?? []
  const similarsScope = `${screenId}:benzerleri`
  const isShow = video.__typename === 'Show'

  useLayoutEffect(() => {
    logEvent('impression', { videoId: video.videoId, context: 'detail', access: video.access.state, from: 'tv' }, tctx)
  }, [video.videoId, video.access.state, tctx])

  const play = (viewableId: string, positionSec: number | null, action: string, startOver = false): void => {
    logEvent('click', { videoId: video.videoId, viewableId, action, from: 'tv-detail' }, tctx)
    logEvent('playback.intent', { videoId: video.videoId, viewableId, from: 'tv-detail' }, tctx)
    navigate(watchPath(viewableId, { positionSec: startOver ? null : positionSec, startOver, tctx }))
  }

  const actions: TvAction[] = []
  if (primary.kind === 'play' || primary.kind === 'resume') {
    actions.push({
      id: PRIMARY_ID,
      label: primary.label,
      icon: 'play',
      onPress: () => play(primary.viewableId!, primary.positionSec, primary.kind),
    })
    if (primary.startOver)
      actions.push({
        id: 'detay:bastan',
        label: 'Baştan Başlat',
        icon: 'restart',
        onPress: () => play(primary.viewableId!, null, 'startOver', true),
      })
  } else if (primary.kind === 'upsell') {
    actions.push({ id: PRIMARY_ID, label: primary.label, icon: 'lock', onPress: () => setUpsell(true) })
  } else {
    actions.push({
      id: PRIMARY_ID,
      label: primary.label,
      icon: 'info',
      onPress: () => {
        if (!engine.focusScope(similarsScope)) setUpsell(true)
      },
    })
  }
  if (isShow)
    actions.push({
      id: 'detay:bolumler',
      label: 'Bölümler',
      icon: 'episodes',
      onPress: () => navigate(episodesPath(video.videoId)),
    })
  if (trailer)
    actions.push({ id: 'detay:fragman', label: 'Fragman', icon: 'movies', onPress: () => play(trailer, null, 'trailer') })
  actions.push({
    id: 'detay:listem',
    label: myList.on ? 'Listemde' : 'Listeme Ekle',
    icon: myList.on ? 'check' : 'plus',
    onPress: myList.toggle,
  })
  actions.push({
    id: 'detay:begen',
    label: like.on ? 'Beğendin' : 'Beğen',
    icon: 'like',
    onPress: like.toggle,
  })

  /* "Benzerleri"ne inince sayfa yukarı kayar */
  const inSimilars = useFocusWithin(similarsScope)
  const simRef = useRef<HTMLElement | null>(null)
  const [slide, setSlide] = useState(0)
  useLayoutEffect(() => {
    if (!inSimilars) {
      setSlide(0)
      return
    }
    const sim = simRef.current
    if (!sim) return
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    // Satır başlığı ekranın ~%40'ına gelsin (üstte görsel ve başlık görünür kalır).
    setSlide(Math.max(0, sim.offsetTop - 26 * rem))
  }, [inSimilars])

  const reasons = video.contentAdvisory.reasons.slice(0, 3).join(', ')

  return (
    <>
      <TvBackground src={video.billboard?.url ?? video.storyArt?.url ?? null} width="70%" height="100%" />
      <div
        className={cx('tvd-page', inSimilars && 'is-similars')}
        data-focus-track=""
        data-track-y={`${-slide}px`}
        style={{ transform: `translate3d(0, ${-slide}px, 0)` }}
      >
        <div className="tvd-info">
          <p className="tvd-eyebrow">{isShow ? 'DİZİ' : 'FİLM'}</p>
          <h1 className="tvd-title">{video.title}</h1>
          <p className="tvd-meta">
            {meta.match && <span className="tvb-match">{meta.match}</span>}
            {meta.parts[0] && <span>{meta.parts[0]}</span>}
            {meta.maturity && <span className="tvb-maturity">{meta.maturity}</span>}
            {meta.parts.slice(1).map((p) => (
              <span key={p}>{p}</span>
            ))}
            {quality.map((b) => (
              <span key={b} className="tvd-quality">
                {b}
              </span>
            ))}
          </p>
          {reasons && <p className="tvd-reasons">{reasons}</p>}
          {video.top10Rank ? (
            <p className="tvb-hero__rank">
              Bugün {isShow ? 'Dizilerde' : 'Filmlerde'} {video.top10Rank} Numara
            </p>
          ) : null}
          {primary.progressLine && (
            <div className="tvd-progress">
              {primary.progress !== null && <TvProgress value={primary.progress} className="tvd-progress__bar" />}
              <span>{primary.progressLine}</span>
            </div>
          )}
          <p className="tvd-synopsis">{video.synopsis || video.shortSynopsis}</p>
          {cast && <p className="tvd-cast">{cast}</p>}
          {primary.accessText && <p className="tvd-access">{primary.accessText}</p>}
        </div>
        <TvActionList id="detay-eylemler" className="tvd-actions" actions={actions} />
        {similars.length > 0 && (
          <section ref={simRef} className="tvd-similars" aria-label="Benzerleri">
            <Lane<CardVideoData>
              id={similarsScope}
              title="Benzerleri"
              length={similars.length}
              getItem={(i) => similars[i] ?? null}
              itemKey={(v) => String(v.videoId)}
              itemWidth={17}
              renderItem={(v, i, focusId) => (
                <TvCard
                  id={focusId}
                  imageUrl={v.storyArt?.url ?? v.boxart?.url}
                  title={v.title}
                  locked={v.access.state !== 'PLAYABLE'}
                  badge={v.badge && v.badge.kind !== 'LOCKED' && v.badge.kind !== 'TOP10' ? v.badge.text : null}
                  width={17}
                  onPress={() => {
                    const t = formatTctx({
                      row: 0,
                      rank: i,
                      rowId: `benzer_${video.videoId}`,
                      trackId: 0,
                      entityId: v.unifiedEntityId,
                    })
                    logEvent('click', { videoId: v.videoId, action: 'detail', from: 'tv-similars' }, t)
                    navigate(`${titlePath(v.videoId)}?tctx=${encodeURIComponent(t)}`)
                  }}
                />
              )}
            />
          </section>
        )}
      </div>
      {upsell && (
        <TvDialog
          id="detay-paket"
          title={primary.kind === 'upsell' ? 'Paketi İncele' : 'Şu an izlenemiyor'}
          message={
            <>
              <p>{primary.accessText}</p>
              {video.access.requiredProductName && (
                <p className="tvd-dialog-product">Gereken paket: {video.access.requiredProductName}</p>
              )}
            </>
          }
          onClose={() => setUpsell(false)}
          defaultFocus="detay-paket:tamam"
        >
          <div className="tv-dialog__actions">
            <TvButton id="detay-paket:tamam" label="Tamam" onPress={() => setUpsell(false)} />
          </div>
        </TvDialog>
      )}
    </>
  )
}

/* ═════════════════════════════ Bölümler ═════════════════════════════ */

interface EpisodesData {
  video: {
    __typename: string
    videoId: number
    title: string
    billboard: { url: string } | null
    currentEpisode?: { videoId: number; seasonNumber: number } | null
    seasons?: SeasonData[]
  } | null
}

const episodeFocusId = (episodeId: number): string => `bolumler:bolum:${episodeId}`

export function TvEpisodes(): ReactElement {
  const id = idParam(useParams().videoId)
  const q = useGql<EpisodesData, { videoId: number }>(
    'TvEpisodes',
    { videoId: id ?? 0 },
    { enabled: id !== null, ttlMs: 0 },
  )
  const video = q.data?.video ?? null
  const seasons = useMemo(() => video?.seasons ?? [], [video])
  const start = useMemo(() => startEpisodeOf(seasons, video?.currentEpisode?.videoId), [seasons, video])
  const screenId = `bolumler-${id ?? 'yok'}`
  const failed = !!q.error || (!!q.data && (!video || !seasons.length)) || id === null
  return (
    <TvScreen
      id={screenId}
      title={video ? `${video.title} bölümleri` : 'Bölümler'}
      padded={false}
      defaultFocus={start.episodeId !== null ? episodeFocusId(start.episodeId) : undefined}
      className="tve"
    >
      <TvBackground src={video?.billboard?.url ?? null} width="100%" height="100%" className="tve-bg" />
      <header className="tve-header">
        <p className="tvd-eyebrow">BÖLÜMLER</p>
        <h1 className="tve-title">{video?.title ?? ' '}</h1>
      </header>
      {video && seasons.length > 0 ? (
        <EpisodesBody
          key={video.videoId}
          showId={video.videoId}
          seasons={seasons}
          startSeason={start.seasonIndex}
          startEpisode={start.episodeId}
        />
      ) : (
        <div className="tve-cols">
          {failed ? (
            <div className="tve-empty">
              <p className="tvd-access">Bölümler şu an açılamadı.</p>
              <TvButton id="bolumler:tekrar" label="Tekrar dene" icon="restart" onPress={q.refetch} />
            </div>
          ) : (
            <>
              <div className="tve-seasons">
                <TvButton id="bolumler:yukleniyor" label="Sezon 1" variant="quiet" className="tve-season" />
              </div>
              <TvSkeletonText lines={6} width={60} />
            </>
          )}
        </div>
      )}
    </TvScreen>
  )
}

function EpisodesBody({
  showId,
  seasons,
  startSeason,
  startEpisode,
}: {
  showId: number
  seasons: SeasonData[]
  startSeason: number
  startEpisode: number | null
}): ReactElement {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(startSeason)
  const season = seasons[selected] ?? seasons[0]!
  const play = (ep: EpisodeData): void => {
    const target = episodePlay(ep)
    if (!target) return
    const t = formatTctx({ row: 0, rank: ep.number - 1, rowId: `bolumler_${showId}`, trackId: 0, entityId: ep.unifiedEntityId })
    logEvent('click', { videoId: ep.videoId, showId, action: 'play', from: 'tv-episodes' }, t)
    logEvent('playback.intent', { videoId: ep.videoId, viewableId: target.viewableId, from: 'tv-episodes' }, t)
    navigate(watchPath(target.viewableId, { positionSec: target.positionSec, tctx: t }))
  }
  return (
    <div className="tve-cols">
      <FocusScope id={`bolumler:${showId}:sezonlar`} orientation="vertical">
        <div className="tve-seasons" role="tablist" aria-label="Sezonlar">
          {seasons.map((s, i) => (
            <SeasonItem
              key={s.seasonId}
              id={`bolumler:sezon:${s.number}`}
              season={s}
              selected={i === selected}
              onSelect={() => setSelected(i)}
            />
          ))}
        </div>
      </FocusScope>
      <EpisodeList
        key={season.seasonId}
        scopeId={`bolumler:${showId}:sezon:${season.number}`}
        season={season}
        defaultEpisode={season.episodes.some((e) => e.videoId === startEpisode) ? startEpisode : null}
        onPlay={play}
      />
    </div>
  )
}

function SeasonItem({
  id,
  season,
  selected,
  onSelect,
}: {
  id: string
  season: SeasonData
  selected: boolean
  onSelect: () => void
}): ReactElement {
  // Odak sezona gelince bölüm listesi o sezona geçer (Netflix TV gibi); OK da aynı işi yapar.
  const { ref, focused } = useFocusable<HTMLDivElement>({ id, onFocus: onSelect, onEnter: onSelect })
  return (
    <div
      ref={ref}
      role="tab"
      aria-selected={selected}
      aria-label={`${seasonLabel(season)}, ${season.episodes.length} bölüm`}
      className={cx('tve-season', selected && 'is-selected', focused && 'is-focused')}
    >
      <span className="tve-season__label">{seasonLabel(season)}</span>
      <span className="tve-season__count">{season.episodes.length} bölüm</span>
    </div>
  )
}

function EpisodeList({
  scopeId,
  season,
  defaultEpisode,
  onPlay,
}: {
  scopeId: string
  season: SeasonData
  defaultEpisode: number | null
  onPlay: (ep: EpisodeData) => void
}): ReactElement {
  const listRef = useRef<HTMLDivElement | null>(null)
  useScrollFocusedIntoView(listRef, 64)
  return (
    <FocusScope
      id={scopeId}
      orientation="vertical"
      defaultFocus={defaultEpisode !== null ? episodeFocusId(defaultEpisode) : undefined}
    >
      <div ref={listRef} className="tve-list" role="list" aria-label={seasonLabel(season)}>
        {season.episodes.map((ep) => (
          <EpisodeItem key={ep.videoId} ep={ep} autoFocus={ep.videoId === defaultEpisode} onPlay={() => onPlay(ep)} />
        ))}
      </div>
    </FocusScope>
  )
}

function EpisodeItem({ ep, autoFocus, onPlay }: { ep: EpisodeData; autoFocus: boolean; onPlay: () => void }): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({ id: episodeFocusId(ep.videoId), onEnter: onPlay, autoFocus })
  const locked = ep.access.state !== 'PLAYABLE'
  const runtime = durationText(ep.runtimeSec ?? ep.bookmark?.runtimeSec) ?? ep.displayRuntime
  const progress = ep.bookmark && ep.bookmark.positionSec > 0 ? ep.bookmark.progress : null
  const label = [
    `${ep.number}. ${ep.title}`,
    runtime,
    isInProgress(ep.bookmark) ? 'yarım kaldı' : null,
    locked ? (ep.access.reasonText ?? 'izlenemiyor') : null,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <div ref={ref} role="listitem" aria-label={label} className={cx('tve-ep', focused && 'is-focused')}>
      <span className="tve-ep__num" aria-hidden="true">
        {ep.number}
      </span>
      <div className="tve-ep__thumb">
        {ep.still?.url && <img src={ep.still.url} alt="" decoding="async" />}
        {progress !== null && <TvProgress value={progress} className="tve-ep__progress" />}
      </div>
      <div className="tve-ep__text">
        <p className="tve-ep__title">
          <span>
            {ep.number}. {ep.title}
          </span>
          <span className="tve-ep__runtime">{runtime}</span>
        </p>
        <p className="tve-ep__label">{episodeLabel(ep.numberLabel)}</p>
        <p className="tve-ep__synopsis">{locked ? (ep.access.reasonText ?? ep.synopsis) : ep.synopsis}</p>
      </div>
    </div>
  )
}
