/**
 * Masaüstü detay penceresi (`?jbv=<videoId>`) — Netflix "Daha Fazla Bilgi" penceresi, TV+ markasıyla.
 * Kabuk `DetailModalOutlet`'i bir kez çizer; açık başlık `useDetailModal()` ile okunur. Pencere göz atma sayfasının
 * üstünde açılır, kendi içinde kayar; ✕ · Esc · dışarı tıklama kapatır (Modal). "Benzerleri" kartı pencerenin
 * içeriğini değiştirir ve başa kaydırır.
 *
 * Düzen (UX_SPEC §2 "Detay penceresi"): 16:9 görsel/sessiz tanıtım + başlık logosu + düğmeler → iki sütun bilgi →
 * Bölümler → Benzerleri → Fragmanlar ve Daha Fazlası → ‹Başlık› Hakkında.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDetailModal, useDocumentTitle } from '../../app'
import { logEvent } from '../../telemetry/logger'
import { cx, ErrorState, Icon, Modal, RoundButton, Skeleton, SkeletonText } from '../../ui'
import { useDetailQuery } from './data'
import { genrePath } from './links'
import {
  accessNoticeOf,
  actionInputOf,
  episodeStateOf,
  metaOf,
  primaryActionOf,
  similarsOf,
  type PrimaryAction,
} from './model'
import {
  AboutBlock,
  AccessBanner,
  castTo,
  EpisodeList,
  ExtrasList,
  HeroMedia,
  LikeButton,
  MaturityLine,
  MetaLine,
  MyListButton,
  notePlay,
  NotFoundNote,
  PeopleLine,
  peopleItems,
  PrimaryButton,
  ResumeLine,
  SeasonMenu,
  SimilarCards,
  TopTen,
  useCastAvailable,
} from './parts'
import { useFreshAfterPlayback } from './sync'
import type { DetailVideo, InsightsData } from './types'
import './detail.css'

/** "Benzerleri" ilk açılışta bu kadar kart gösterir; altındaki ⌄ ile tamamı. */
const SIMILARS_COLLAPSED = 9

export function DetailModalOutlet(): ReactElement {
  const { videoId, tctx, close } = useDetailModal()
  const open = videoId !== null
  // Kapanış animasyonu boyunca son başlık çizilmeye devam eder.
  const last = useRef<{ id: number; tctx: string | null } | null>(null)
  if (videoId !== null) last.current = { id: Number(videoId), tctx }
  const view = last.current
  const scrollRef = useRef<HTMLDivElement>(null)

  // Başka başlığa geçildi: başa kaydır, odağı pencereye al (tıklanan kart artık yok).
  const prevId = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (!open || !view) return
    if (prevId.current !== null && prevId.current !== view.id) {
      const layer = scrollRef.current
      layer?.scrollTo({ top: 0 })
      layer?.querySelector<HTMLElement>('.ui-modal')?.focus({ preventScroll: true })
    }
    prevId.current = view.id
  }, [open, view?.id])

  // Belge başlığı: pencere kapanınca arkadaki sayfanınki geri gelir.
  const savedTitle = useRef<string | null>(null)
  useEffect(() => {
    if (!open) return
    savedTitle.current = document.title
    return () => {
      if (savedTitle.current) document.title = savedTitle.current
    }
  }, [open])

  return (
    <Modal
      open={open}
      onClose={close}
      labelledBy={view ? `dm-title-${view.id}` : undefined}
      label="Başlık ayrıntıları"
      scrollRef={scrollRef}
      onExited={() => {
        prevId.current = null
      }}
      className="dm"
    >
      {view && <DetailWindow key={view.id} videoId={view.id} tctx={view.tctx} />}
    </Modal>
  )
}

function DetailWindow({ videoId, tctx }: { videoId: number; tctx: string | null }): ReactElement {
  useFreshAfterPlayback()
  const q = useDetailQuery(videoId)
  useDocumentTitle(q.video?.title)

  if (q.notFound)
    return (
      <div className="dm-pad">
        <span id={`dm-title-${videoId}`} className="ui-sr-only">
          Bu içerik bulunamadı
        </span>
        <NotFoundNote />
      </div>
    )
  if (!q.video) {
    if (q.error && !q.loading)
      return (
        <div className="dm-pad" id={`dm-title-${videoId}`}>
          <ErrorState
            title="Bu pencere yüklenemedi"
            message="Bağlantını kontrol et ve tekrar dene."
            onRetry={q.refetch}
          />
        </div>
      )
    return <DetailSkeleton id={videoId} />
  }
  return <DetailBody video={q.video} insights={q.insights} tctx={tctx} />
}

function DetailSkeleton({ id }: { id: number }): ReactElement {
  return (
    <div aria-busy="true">
      <span id={`dm-title-${id}`} className="ui-sr-only">
        Yükleniyor
      </span>
      <div className="dm-hero dm-hero--skel">
        <Skeleton variant="block" className="dm-hero__skel" />
      </div>
      <div className="dm-body">
        <div className="dm-info">
          <div>
            <Skeleton variant="text" width="45%" />
            <SkeletonText lines={4} />
          </div>
          <SkeletonText lines={3} />
        </div>
      </div>
    </div>
  )
}

function DetailBody({
  video,
  insights,
  tctx,
}: {
  video: DetailVideo
  insights: InsightsData['video']
  tctx: string | null
}): ReactElement {
  const navigate = useNavigate()
  const castAvailable = useCastAvailable()
  const action: PrimaryAction = primaryActionOf(actionInputOf(video, tctx))
  const meta = metaOf(video, insights?.matchScore)
  const notice = accessNoticeOf(video.access)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [upsellOpen, setUpsellOpen] = useState(false)
  const [season, setSeason] = useState<number | null>(null)
  const [allSimilars, setAllSimilars] = useState(false)
  const similarsRef = useRef<HTMLElement>(null)
  const aboutRef = useRef<HTMLDivElement>(null)
  const accessRef = useRef<HTMLDivElement>(null)

  const episodes = useMemo(
    () => (video.__typename === 'Show' ? episodeStateOf(video.seasons ?? [], video.currentEpisode, season) : null),
    [video, season],
  )
  const similars = useMemo(
    () => similarsOf(video.videoId, video.similars, insights),
    [video.videoId, video.similars, insights],
  )
  const extras = video.supplementalVideos ?? []
  const shownSimilars = allSimilars ? similars : similars.slice(0, SIMILARS_COLLAPSED)

  useEffect(() => {
    logEvent('impression', { videoId: video.videoId, context: 'detail-modal', access: video.access.state }, tctx)
  }, [video.videoId, video.access.state, tctx])

  const scrollTo = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const playable = action.kind === 'play' || action.kind === 'resume'
  const logo = video.titleLogo?.url ?? null
  const [logoFailed, setLogoFailed] = useState(false)
  const titleId = `dm-title-${video.videoId}`

  return (
    <article className="dm-article">
      <div className="dm-hero">
        <HeroMedia
          image={video.billboard?.url ?? video.storyArt?.url ?? null}
          promo={video.promoVideo}
          muted={muted}
          onPlayingChange={setPlaying}
        />
        <div className="dm-hero__info">
          <h2 className={cx('dm-title', logo && !logoFailed && 'has-logo')} id={titleId}>
            {logo && !logoFailed ? (
              <img src={logo} alt={video.title} onError={() => setLogoFailed(true)} />
            ) : (
              video.title
            )}
          </h2>
          {video.parentShow && <p className="dm-parent">{video.parentShow.title}</p>}
          <ResumeLine action={action} />
          <div className="dm-actions">
            <PrimaryButton
              video={video}
              action={action}
              tctx={tctx}
              size="lg"
              onUpsell={() => {
                setUpsellOpen(true)
                scrollTo(accessRef.current)
              }}
            />
            {action.kind === 'resume' && (
              <RoundButton
                icon="startOver"
                label="Baştan Başlat"
                size="lg"
                onClick={() => {
                  notePlay(video, action.playVideoId, 'restart', tctx)
                  navigate(action.restartTo)
                }}
              />
            )}
            <MyListButton videoId={video.videoId} inList={video.isInPlaylist} tctx={tctx} size="lg" />
            <LikeButton video={video} tctx={tctx} size="lg" />
            {castAvailable && playable && (
              <RoundButton icon="cast" label="TV'de İzle" size="lg" onClick={() => castTo(video, action, tctx)} />
            )}
          </div>
        </div>
        {playing && (
          <RoundButton
            icon={muted ? 'mute' : 'volume'}
            label={muted ? 'Sesi Aç' : 'Sesi Kapat'}
            size="lg"
            className="dm-mute"
            onClick={() => setMuted((m) => !m)}
          />
        )}
      </div>

      <div className="dm-body">
        {notice && (
          <div ref={accessRef} className="dm-access-wrap">
            <AccessBanner
              notice={notice}
              title={video.title}
              productName={action.kind === 'upsell' ? action.productName : null}
              expanded={upsellOpen}
              onToggle={() => setUpsellOpen((v) => !v)}
              onSimilars={() => scrollTo(similarsRef.current)}
            />
          </div>
        )}

        <div className="dm-info">
          <div className="dm-info__left">
            <MetaLine meta={meta} />
            <MaturityLine meta={meta} />
            <TopTen meta={meta} />
            <p className="dm-synopsis">{video.contextualSynopsis || video.synopsis}</p>
          </div>
          <div className="dm-info__right">
            <PeopleLine label="Oyuncular" items={peopleItems(video.cast)} onMore={() => scrollTo(aboutRef.current)} />
            <PeopleLine
              label="Türler"
              items={video.genreTags.map((g) => ({ key: g.genreId, text: g.name, to: genrePath(g.genreId) }))}
              onMore={() => scrollTo(aboutRef.current)}
            />
            <PeopleLine
              label="Bu içerik"
              items={video.moodTags.map((m) => ({ key: m.id, text: m.displayName }))}
              onMore={() => scrollTo(aboutRef.current)}
            />
          </div>
        </div>

        {episodes && (
          <section className="dm-section" aria-labelledby={`dm-eps-${video.videoId}`}>
            <div className="dm-section__head">
              <h3 className="dm-section__title" id={`dm-eps-${video.videoId}`}>
                Bölümler
              </h3>
              <SeasonMenu state={episodes} onSelect={setSeason} />
            </div>
            {episodes.showPicker && <p className="dm-season-name">{episodes.selectedLabel}</p>}
            <EpisodeList rows={episodes.episodes} parentId={video.videoId} tctx={tctx} variant="desktop" />
          </section>
        )}

        {similars.length > 0 && (
          <section ref={similarsRef} className="dm-section" aria-labelledby={`dm-sim-${video.videoId}`}>
            <h3 className="dm-section__title" id={`dm-sim-${video.videoId}`}>
              Benzerleri
            </h3>
            <SimilarCards items={shownSimilars} sourceId={video.videoId} />
            {similars.length > SIMILARS_COLLAPSED && (
              <div className={cx('dm-expand', allSimilars && 'is-open')}>
                <RoundButton
                  icon={allSimilars ? 'chevronUp' : 'chevronDown'}
                  label={allSimilars ? 'Daha az göster' : 'Daha fazla göster'}
                  aria-expanded={allSimilars}
                  onClick={() => setAllSimilars((v) => !v)}
                />
              </div>
            )}
          </section>
        )}

        {extras.length > 0 && (
          <section className="dm-section" aria-labelledby={`dm-ext-${video.videoId}`}>
            <h3 className="dm-section__title" id={`dm-ext-${video.videoId}`}>
              Fragmanlar ve Daha Fazlası
            </h3>
            <ExtrasList items={extras} parentId={video.videoId} tctx={tctx} />
          </section>
        )}

        <div ref={aboutRef} className="dm-section dm-section--about">
          <AboutBlock
            video={video}
            meta={meta}
            microgenres={insights?.microgenres}
            headingId={`dm-about-${video.videoId}`}
          />
        </div>
        {!playable && action.kind === 'unavailable' && !notice && (
          <p className="ui-meta">
            <Icon name="info" size={16} /> {action.reasonText}
          </p>
        )}
      </div>
    </article>
  )
}
