/**
 * Mobil başlık sayfası (`/baslik/:videoId`) — Netflix mobil detay ekranı, TV+ markasıyla. Kabuk üst çubuğu gizler.
 * Üstte 16:9 görsel/sessiz tanıtım (geri ve TV'de izle simgeleri), başlık, bilgi satırı, tam genişlik beyaz
 * "Oynat" / "Devam Et", TV'de İzle, özet ("devamı"), oyuncular, simge sırası (Listem · Beğen · Paylaş), sonra
 * sekmeler: Bölümler · Benzerleri · Fragmanlar · Hakkında.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useDocumentTitle, useShellOptions } from '../../app'
import { logEvent } from '../../telemetry/logger'
import {
  Button,
  ButtonLink,
  cx,
  ErrorState,
  Icon,
  RoundButton,
  Sheet,
  Skeleton,
  SkeletonText,
  Tabs,
  toast,
  type TabItem,
} from '../../ui'
import { useLikeToggle, useMyListToggle } from './actions'
import { useDetailQuery } from './data'
import {
  accessNoticeOf,
  actionInputOf,
  episodeStateOf,
  metaLineParts,
  metaOf,
  primaryActionOf,
  similarsOf,
  type MetaPart,
} from './model'
import {
  AboutBlock,
  AccessBanner,
  castTo,
  EpisodeList,
  ExtrasList,
  HeroMedia,
  notePlay,
  NotFoundNote,
  PeopleLine,
  peopleItems,
  PrimaryButton,
  ResumeLine,
  SimilarPosters,
  TopTen,
  useCastAvailable,
} from './parts'
import { useFreshAfterPlayback } from './sync'
import type { DetailVideo, InsightsData } from './types'
import './detail.css'

type TabId = 'bolumler' | 'benzerleri' | 'fragmanlar' | 'hakkinda'

const META_CLASS: Record<MetaPart['kind'], string | undefined> = {
  match: 'dt-match',
  new: 'ui-new',
  year: undefined,
  cert: 'tp-cert',
  duration: undefined,
  quality: 'dt-qbadge',
}

/** Geri: uygulama içinden gelindiyse geçmişte bir adım, doğrudan açıldıysa ana sayfa. */
function useBack(): () => void {
  const navigate = useNavigate()
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/goz-at', { replace: true })
  }
}

export function TitlePage(): ReactElement {
  useShellOptions({ topBar: false })
  useFreshAfterPlayback()
  const params = useParams()
  const { search } = useLocation()
  const tctx = new URLSearchParams(search).get('tctx')
  const videoId = Number(params.videoId)
  const q = useDetailQuery(videoId)
  const back = useBack()
  useDocumentTitle(q.video?.title)

  // Başka başlığa geçince sayfanın başına dön.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [videoId])

  if (q.notFound)
    return (
      <div className="tp tp--state">
        <TopButtons onBack={back} />
        <NotFoundNote
          action={
            <ButtonLink to="/goz-at" variant="secondary" icon="home">
              Ana Sayfaya Dön
            </ButtonLink>
          }
        />
      </div>
    )
  if (!q.video) {
    return (
      <div className="tp" aria-busy={!q.error}>
        <div className="tp-media-wrap">
          <Skeleton variant="block" className="tp-media-skel" />
          <TopButtons onBack={back} />
        </div>
        <div className="tp-main">
          {q.error && !q.loading ? (
            <ErrorState
              title="Bu sayfa yüklenemedi"
              message="Bağlantını kontrol et ve tekrar dene."
              onRetry={q.refetch}
            />
          ) : (
            <>
              <Skeleton variant="title" width="60%" />
              <Skeleton variant="block" height={44} />
              <SkeletonText lines={3} />
            </>
          )}
        </div>
      </div>
    )
  }
  return <TitleBody key={q.video.videoId} video={q.video} insights={q.insights} tctx={tctx} onBack={back} />
}

function TopButtons({ onBack, onCast }: { onBack: () => void; onCast?: (() => void) | null }): ReactElement {
  return (
    <div className="tp-topbtns">
      <RoundButton icon="back" label="Geri" variant="solid" onClick={onBack} />
      {onCast && <RoundButton icon="cast" label="TV'de İzle" variant="solid" onClick={onCast} />}
    </div>
  )
}

function TitleBody({
  video,
  insights,
  tctx,
  onBack,
}: {
  video: DetailVideo
  insights: InsightsData['video']
  tctx: string | null
  onBack: () => void
}): ReactElement {
  const navigate = useNavigate()
  const castAvailable = useCastAvailable()
  const action = primaryActionOf(actionInputOf(video, tctx))
  const meta = metaOf(video, insights?.matchScore)
  const notice = accessNoticeOf(video.access)
  const playable = action.kind === 'play' || action.kind === 'resume'
  const isShow = video.__typename === 'Show'
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [moreSynopsis, setMoreSynopsis] = useState(false)
  const [upsellOpen, setUpsellOpen] = useState(false)
  const [seasonSheet, setSeasonSheet] = useState(false)
  const [season, setSeason] = useState<number | null>(null)
  const tabsRef = useRef<HTMLDivElement>(null)

  const episodes = useMemo(
    () => (isShow ? episodeStateOf(video.seasons ?? [], video.currentEpisode, season) : null),
    [isShow, video, season],
  )
  const similars = useMemo(
    () => similarsOf(video.videoId, video.similars, insights),
    [video.videoId, video.similars, insights],
  )
  const extras = video.supplementalVideos ?? []
  const tabs: TabItem[] = [
    ...(episodes ? [{ id: 'bolumler', label: 'Bölümler' }] : []),
    ...(similars.length ? [{ id: 'benzerleri', label: 'Benzerleri' }] : []),
    ...(extras.length ? [{ id: 'fragmanlar', label: 'Fragmanlar' }] : []),
    { id: 'hakkinda', label: 'Hakkında' },
  ]
  const [chosenTab, setTab] = useState<TabId>((tabs[0]?.id as TabId) ?? 'hakkinda')
  const tab: TabId = tabs.some((t) => t.id === chosenTab) ? chosenTab : ((tabs[0]?.id as TabId) ?? 'hakkinda')

  useEffect(() => {
    logEvent('impression', { videoId: video.videoId, context: 'title-page', access: video.access.state }, tctx)
  }, [video.videoId, video.access.state, tctx])

  const showSimilars = () => {
    setTab('benzerleri')
    requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const synopsis = video.contextualSynopsis || video.synopsis
  const parts = metaLineParts(meta)
  const panelId = (id: string) => `tp-panel-${id}`

  return (
    <article className="tp" aria-labelledby="tp-title">
      <div className="tp-media-wrap">
        <HeroMedia
          image={video.storyArt?.url ?? video.billboard?.url ?? null}
          promo={video.promoVideo}
          muted={muted}
          onPlayingChange={setPlaying}
          className="tp-media"
        />
        <TopButtons onBack={onBack} onCast={castAvailable && playable ? () => castTo(video, action, tctx) : null} />
        {playing && (
          <RoundButton
            icon={muted ? 'mute' : 'volume'}
            label={muted ? 'Sesi Aç' : 'Sesi Kapat'}
            variant="solid"
            size="sm"
            className="tp-mute"
            onClick={() => setMuted((m) => !m)}
          />
        )}
      </div>

      <div className="tp-main">
        {video.parentShow && (
          <Link className="tp-parent" to={`/baslik/${video.parentShow.videoId}`}>
            {video.parentShow.title}
          </Link>
        )}
        <h1 className="tp-title" id="tp-title">
          {video.title}
        </h1>
        <p className="tp-meta">
          {parts.map((p) => (
            <span key={p.kind} className={META_CLASS[p.kind]}>
              {p.text}
            </span>
          ))}
        </p>
        <TopTen meta={meta} />

        {notice ? (
          <AccessBanner
            notice={notice}
            title={video.title}
            productName={action.kind === 'upsell' ? action.productName : null}
            expanded={upsellOpen}
            onToggle={() => setUpsellOpen((v) => !v)}
            onSimilars={showSimilars}
            hideCta
            className="tp-access"
          />
        ) : null}

        <div className="tp-buttons">
          <PrimaryButton video={video} action={action} tctx={tctx} block onUpsell={() => setUpsellOpen((v) => !v)} />
          {castAvailable && playable && (
            <Button block variant="secondary" icon="cast" onClick={() => castTo(video, action, tctx)}>
              TV'de İzle
            </Button>
          )}
        </div>
        <ResumeLine action={action} />

        <p className={cx('tp-synopsis', !moreSynopsis && 'is-clamped')}>{synopsis}</p>
        {!moreSynopsis && synopsis.length > 140 && (
          <button type="button" className="tp-more" onClick={() => setMoreSynopsis(true)}>
            devamı
          </button>
        )}
        <PeopleLine label="Oyuncular" items={peopleItems(video.cast)} onMore={() => setTab('hakkinda')} />
        <PeopleLine label="Yönetmen" items={peopleItems(video.directors)} max={2} />

        <IconRow
          video={video}
          tctx={tctx}
          restart={action.kind === 'resume' ? action : null}
          onRestart={(to, id) => {
            notePlay(video, id, 'restart', tctx)
            navigate(to)
          }}
        />
      </div>

      <div className="tp-tabs" ref={tabsRef}>
        <Tabs
          items={tabs}
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          label="Başlık bölümleri"
          panelIdFor={panelId}
        />
        <div className="tp-panel" role="tabpanel" id={panelId(tab)} aria-label={tabs.find((t) => t.id === tab)?.label}>
          {tab === 'bolumler' && episodes && (
            <>
              {episodes.showPicker ? (
                <button type="button" className="tp-season" onClick={() => setSeasonSheet(true)}>
                  {episodes.selectedLabel}
                  <Icon name="chevronDown" size={18} />
                </button>
              ) : (
                <p className="tp-season tp-season--static">{episodes.selectedLabel}</p>
              )}
              <EpisodeList rows={episodes.episodes} parentId={video.videoId} tctx={tctx} variant="mobile" />
              <Sheet open={seasonSheet} onClose={() => setSeasonSheet(false)} title="Sezon seç">
                <ul className="tp-seasons">
                  {episodes.seasons.map((s) => (
                    <li key={s.number}>
                      <button
                        type="button"
                        className={cx('tp-seasons__item', s.number === episodes.selected && 'is-current')}
                        aria-current={s.number === episodes.selected ? 'true' : undefined}
                        onClick={() => {
                          setSeason(s.number)
                          setSeasonSheet(false)
                        }}
                      >
                        <span>{s.label}</span>
                        <span className="tp-seasons__count">{s.episodeCount} Bölüm</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Sheet>
            </>
          )}
          {tab === 'benzerleri' && <SimilarPosters items={similars} sourceId={video.videoId} />}
          {tab === 'fragmanlar' && <ExtrasList items={extras} parentId={video.videoId} tctx={tctx} />}
          {tab === 'hakkinda' && (
            <AboutBlock
              video={video}
              meta={meta}
              microgenres={insights?.microgenres}
              headingId="tp-about"
              showHeading
            />
          )}
        </div>
      </div>
    </article>
  )
}

function IconRow({
  video,
  tctx,
  restart,
  onRestart,
}: {
  video: DetailVideo
  tctx: string | null
  restart: { restartTo: string; playVideoId: number } | null
  onRestart: (to: string, playVideoId: number) => void
}): ReactElement {
  const list = useMyListToggle(video.videoId, video.isInPlaylist, tctx)
  const like = useLikeToggle(video.videoId, video.thumbRating, tctx)
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/baslik/${video.videoId}`
    logEvent('click', { videoId: video.videoId, action: 'share', from: 'title-page' }, tctx)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `${video.title} · TV+`, url })
        return
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast('Bağlantı kopyalandı')
    } catch {
      toast('Bağlantı kopyalanamadı')
    }
  }
  return (
    <div className="tp-iconrow">
      {restart && (
        <button type="button" className="tp-icon" onClick={() => onRestart(restart.restartTo, restart.playVideoId)}>
          <Icon name="startOver" size={24} />
          <span>Baştan Başlat</span>
        </button>
      )}
      <button type="button" className="tp-icon" aria-pressed={list.on} onClick={list.toggle}>
        <Icon name={list.on ? 'check' : 'plus'} size={24} />
        <span>Listem</span>
      </button>
      <button type="button" className={cx('tp-icon', like.on && 'is-on')} aria-pressed={like.on} onClick={like.toggle}>
        <Icon name="thumbsUp" size={24} />
        <span>{like.on ? 'Beğendin' : 'Beğen'}</span>
      </button>
      <button type="button" className="tp-icon" onClick={() => void share()}>
        <Icon name="share" size={24} />
        <span>Paylaş</span>
      </button>
    </div>
  )
}
