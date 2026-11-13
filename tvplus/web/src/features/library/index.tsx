/**
 * Kitaplığım (#/kitaplik) — gql('Library'): "Listem", "İzlemeye devam", "Beğendiklerim", "Kanallarım".
 * Boş sekme yalnızca TEK satır yardım metni gösterir (DESIGN_SPEC §5 kural 5). Seçili sekme ?sekme= ile saklanır.
 * Dışa aktarım adı SABİT: LibraryPage.
 */
import { useRef, type KeyboardEvent, type ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useGql } from '../../api/hooks'
import { ChannelTile, cx, EmptyHint, ErrorState, LandscapeCard, LiveChannelCard, Page, PosterCard, Skeleton } from '../../design'
import { logEvent } from '../../telemetry/logger'
import {
  channelPlayPath,
  detailPath,
  isInProgress,
  joinMeta,
  localTctx,
  lockedTextOf,
  notePlaybackIntent,
  playPath,
  PreviewScope,
  PreviewTarget,
  remainingText,
  useFreshAfterPlayback,
  type AccessData,
  type ArtworkData,
  type CardVideoData,
} from '../preview'
import './library.css'

interface ContinueVideo extends CardVideoData {
  currentEpisode?: {
    videoId: number
    numberLabel: string
    title: string
    runtimeSec: number | null
    bookmark: { positionSec: number; runtimeSec: number | null; progress: number } | null
  }
}
interface AiringBrief {
  airingId: string
  title: string
  startAt: string
  endAt: string
  liveState: string
}
interface ChannelData {
  channelId: number
  name: string
  number: number
  logo: ArtworkData
  access: AccessData
  now: AiringBrief | null
}
interface LibraryData {
  library: {
    myList: CardVideoData[]
    continueWatching: ContinueVideo[]
    liked: CardVideoData[]
    favoriteChannels: ChannelData[]
  }
}

type TabKey = 'listem' | 'devam' | 'begendiklerim' | 'kanallarim'
const TABS: { key: TabKey; label: string; empty: string }[] = [
  { key: 'listem', label: 'Listem', empty: 'Listene eklediğin film ve diziler burada durur.' },
  { key: 'devam', label: 'İzlemeye devam', empty: 'Yarım bıraktığın içerikler burada görünür.' },
  { key: 'begendiklerim', label: 'Beğendiklerim', empty: 'Beğendiğin içerikler burada toplanır.' },
  { key: 'kanallarim', label: 'Kanallarım', empty: 'Favori kanalların burada görünür.' },
]

export function LibraryPage(): ReactElement {
  useFreshAfterPlayback()
  const [sp, setSp] = useSearchParams()
  const raw = sp.get('sekme')
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : 'listem'
  const { data, error, loading, refetch } = useGql<LibraryData>('Library', {}, { ttlMs: 15_000 })
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const select = (key: TabKey) => setSp(key === 'listem' ? {} : { sekme: key }, { replace: true })
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.key === tab)
    const n = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
    select(TABS[n]!.key)
    tabRefs.current[n]?.focus()
  }

  const lib = data?.library
  const current = TABS.find((t) => t.key === tab)!

  let body: ReactElement
  if (!lib) {
    body =
      error && !loading ? (
        <ErrorState title="Kitaplığın yüklenemedi" onRetry={refetch} />
      ) : (
        <div className="lb-grid lb-grid--poster cn-gutter-x" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} variant="poster" />
          ))}
        </div>
      )
  } else if (tab === 'listem') {
    body = lib.myList.length ? <PosterGrid rowId="kitaplik_listem" items={lib.myList} /> : <EmptyHint>{current.empty}</EmptyHint>
  } else if (tab === 'begendiklerim') {
    body = lib.liked.length ? <PosterGrid rowId="kitaplik_begenilen" items={lib.liked} /> : <EmptyHint>{current.empty}</EmptyHint>
  } else if (tab === 'devam') {
    body = lib.continueWatching.length ? <ContinueGrid items={lib.continueWatching} /> : <EmptyHint>{current.empty}</EmptyHint>
  } else {
    body = lib.favoriteChannels.length ? <ChannelGrid items={lib.favoriteChannels} /> : <EmptyHint>{current.empty}</EmptyHint>
  }

  return (
    <PreviewScope>
      <Page title="Kitaplığım">
        <div className="lb-tabs cn-pad-x" role="tablist" aria-label="Kitaplık bölümleri" onKeyDown={onKey}>
          {TABS.map((t, i) => {
            const on = t.key === tab
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[i] = el
                }}
                type="button"
                role="tab"
                id={`lb-tab-${t.key}`}
                aria-selected={on}
                aria-controls="lb-panel"
                tabIndex={on ? 0 : -1}
                className={cx('cn-chip', on && 'cn-chip--selected', 'lb-tab')}
                onClick={() => select(t.key)}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        <div id="lb-panel" role="tabpanel" aria-labelledby={`lb-tab-${tab}`} className="lb-panel">
          {body}
        </div>
      </Page>
    </PreviewScope>
  )
}

function PosterGrid({ rowId, items }: { rowId: string; items: CardVideoData[] }): ReactElement {
  const ids = () => items.map((v) => v.videoId)
  return (
    <ul className="lb-grid lb-grid--poster cn-gutter-x">
      {items.map((v, i) => {
        const t = localTctx(rowId, i, v.videoId)
        return (
          <li key={v.videoId}>
            <PreviewTarget info={{ rowId, videoId: v.videoId, getRowVideoIds: ids, tctx: t, title: v.title, imageUrl: v.storyArt?.url ?? v.boxart?.url }}>
              <PosterCard
                size="fill"
                showTitle
                title={v.title}
                imageUrl={v.boxart?.url}
                lockedText={lockedTextOf(v.access)}
                meta={joinMeta([v.latestYear, v.displayRuntime])}
                to={detailPath(v.videoId, t)}
                onClick={() => logEvent('click', { videoId: v.videoId, action: 'detail', from: rowId }, t)}
              />
            </PreviewTarget>
          </li>
        )
      })}
    </ul>
  )
}

/** İzlemeye devam: tek dokunuş kaldığı yerden (dizide sıradaki bölüm). */
function ContinueGrid({ items }: { items: ContinueVideo[] }): ReactElement {
  const rowId = 'kitaplik_devam'
  const ids = () => items.map((v) => v.videoId)
  return (
    <ul className="lb-grid lb-grid--land cn-gutter-x">
      {items.map((v, i) => {
        const t = localTctx(rowId, i, v.videoId)
        const ep = v.__typename === 'Show' ? v.currentEpisode : undefined
        const playId = v.__typename === 'Show' ? (ep?.videoId ?? null) : v.videoId
        const bm = ep ? ep.bookmark : v.bookmark
        const runtime = ep ? (ep.runtimeSec ?? bm?.runtimeSec) : bm?.runtimeSec
        const left = isInProgress(bm) ? remainingText(bm!.positionSec, runtime) : null
        const label = ep?.numberLabel ?? (v.__typename === 'Episode' ? v.numberLabel : null)
        const playable = v.access.state === 'PLAYABLE' && playId !== null
        return (
          <li key={v.videoId}>
            <PreviewTarget info={{ rowId, videoId: v.videoId, getRowVideoIds: ids, tctx: t, title: v.title, imageUrl: v.storyArt?.url }}>
              <LandscapeCard
                size="fill"
                title={v.__typename === 'Episode' && v.parentShow ? v.parentShow.title : v.title}
                imageUrl={v.storyArt?.url}
                progress={bm?.progress ?? null}
                meta={joinMeta([label, left ?? v.displayRuntime])}
                lockedText={lockedTextOf(v.access)}
                to={playable ? playPath(playId, t) : detailPath(v.videoId, t)}
                onClick={() => {
                  if (playable) notePlaybackIntent(playId, v.videoId)
                  logEvent('click', { videoId: v.videoId, action: playable ? 'resume' : 'detail', from: rowId }, t)
                }}
              />
            </PreviewTarget>
          </li>
        )
      })}
    </ul>
  )
}

function ChannelGrid({ items }: { items: ChannelData[] }): ReactElement {
  return (
    <ul className="lb-grid lb-grid--land cn-gutter-x">
      {items.map((c) => {
        const locked = lockedTextOf(c.access)
        const onClick = () => logEvent('click', { channelId: c.channelId, action: 'play', from: 'kitaplik_kanallar' })
        return (
          <li key={c.channelId}>
            {c.now ? (
              <LiveChannelCard
                size="fill"
                channelName={c.name}
                channelLogoUrl={c.logo?.url}
                programmeTitle={c.now.title}
                start={c.now.startAt}
                end={c.now.endAt}
                lockedText={locked}
                to={channelPlayPath(c.channelId)}
                onClick={onClick}
              />
            ) : (
              <a className="lb-channel" href={`#${channelPlayPath(c.channelId)}`} onClick={onClick}>
                <ChannelTile name={c.name} logoUrl={c.logo?.url} />
                <span className="lb-channel__text">
                  <span className="cn-card-title">{c.name}</span>
                  <span className="cn-meta">{locked ?? 'Şu an yayın akışı yok'}</span>
                </span>
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
