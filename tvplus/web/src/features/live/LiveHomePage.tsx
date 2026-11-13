/**
 * Canlı TV ana sayfası (#/canli): GraphQL `LivePage` — istemci çizebildiği satır tiplerini ve varlık türlerini
 * BİLDİRİR; sunucu bilinmeyeni yollamaz, yine de gelen tanınmayan tip/tür sessizce atlanır.
 * İlerleme ve kalan süre istemcide akar (useNow); program sınırı geçince ya da bir satırın ttlSec süresi
 * dolunca sayfa TEK sorguyla yeniden çekilir, bu sırada eski veri ekranda kalır.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { useGql, queryCache } from '../../api/hooks'
import { gql } from '../../api/graphql'
import {
  Button,
  ErrorState,
  HScroll,
  Icon,
  IconButton,
  LandscapeCard,
  LiveChannelCard,
  LiveTag,
  Page,
  ProgressBar,
  RowHeader,
  SkeletonRow,
  Skeleton,
  ChannelTile,
  toast,
  useNow,
  type VisibleRange,
} from '../../design'
import { devbus } from '../../lib/devbus'
import { PreviewPlayer, prefetchManifest } from '../../player'
import { logEvent } from '../../telemetry/logger'
import { airingAction, catchupOpen, liveWatchPath, lockText, timeStateOf } from './airing'
import {
  asAiring,
  asChannel,
  catchupMeta,
  LIVE_CAPABILITIES,
  liveStatus,
  neighbourChannelIds,
  renderableRows,
  rowHasSampleSchedule,
  rowsNeedingRefetch,
  tonightMeta,
  type RenderableRow,
} from './liveLogic'
import { AccessSheet, AiringSheet, useWide, type AiringSheetTarget } from './shared'
import type { AiringData, ChannelData, LivePageData, RowItemData } from './types'
import './live.css'

const PREVIEW_DELAY_MS = 1500
const VARIABLES = { capabilities: LIVE_CAPABILITIES }

interface LockTarget {
  title: string
  reason: string
}

/* ───────────── Gösterim izleme ───────────── */

function useImpressions(pageId: string | undefined) {
  const seen = useRef(new Set<string>())
  useEffect(() => {
    seen.current = new Set()
  }, [pageId])
  return useCallback((row: RenderableRow, items: RowItemData[]) => {
    for (const it of items) {
      const k = `${row.rowId}|${it.track.entityId}`
      if (seen.current.has(k)) continue
      seen.current.add(k)
      logEvent('impression', { surface: 'canli', rowType: row.type, rowId: row.rowId, entityId: it.track.entityId }, it.track.tctx)
    }
  }, [])
}

/* ───────────── Kahraman ───────────── */

function LiveHero({ channel, item, onLocked }: { channel: ChannelData; item: RowItemData; onLocked: (t: LockTarget) => void }): ReactElement {
  const now = useNow()
  const wide = useWide()
  const [preview, setPreview] = useState<'idle' | 'trying' | 'playing' | 'failed'>('idle')
  const air = channel.now
  const lock = lockText(channel.access)
  const tctx = item.track.tctx

  // Web'de ~1,5 sn sonra sessiz canlı görüntü dene; başlamazsa durağan görselde sessizce kal.
  useEffect(() => {
    setPreview('idle')
    if (!wide || lock) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setTimeout(() => setPreview('trying'), PREVIEW_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [channel.channelId, wide, lock])

  const click = (action: string) => logEvent('click', { surface: 'canli', rowType: 'LIVE_HERO', action, entityId: item.track.entityId }, tctx)
  const status = air ? liveStatus(air.startAt, air.endAt, now) : null
  const art = air?.art?.url

  return (
    <section className="lv-hero" aria-label={`Şimdi ${channel.name} kanalında`}>
      <div className="lv-hero__media">
        {art ? <img className="lv-hero__img" src={art} alt="" /> : <span className="lv-hero__img lv-hero__img--empty" />}
        {(preview === 'trying' || preview === 'playing') && (
          <div className={preview === 'playing' ? 'lv-hero__preview lv-hero__preview--on' : 'lv-hero__preview'} aria-hidden="true">
            <PreviewPlayer viewableId={`Channel:${channel.channelId}`} offsetSec={0} onPlaying={() => setPreview('playing')} onError={() => setPreview('failed')} />
          </div>
        )}
        <span className="lv-hero__scrim" aria-hidden="true" />
        <LiveTag overlay className="lv-hero__tag" />
      </div>
      <div className="lv-hero__body">
        <div className="lv-hero__channel">
          <ChannelTile name={channel.name} logoUrl={channel.logo.url} />
          <span className="lv-hero__chname">
            <span className="cn-card-title">{channel.name}</span>
            <span className="cn-meta">Kanal {channel.number}</span>
          </span>
        </div>
        <h1 className="cn-hero-title lv-hero__title">{air?.title ?? channel.name}</h1>
        {air && status && (
          <>
            <p className="lv-hero__time">{status.line}</p>
            <ProgressBar value={status.progress} label="Yayın ilerlemesi" className="lv-hero__progress" />
          </>
        )}
        {channel.next && (
          <p className="cn-meta lv-hero__next">
            Sırada: {channel.next.title} · {tonightMeta(channel.next, now)}
          </p>
        )}
        <div className="lv-hero__actions">
          {lock ? (
            <Button icon="lock" onClick={() => onLocked({ title: channel.name, reason: lock })}>
              Neden izleyemiyorum
            </Button>
          ) : (
            <Button icon="play" to={liveWatchPath(channel.channelId, tctx)} onClick={() => click('canli')}>
              Canlı izle
            </Button>
          )}
          {!lock && air?.startOver ? (
            <Button variant="secondary" icon="restart" overImage to={liveWatchPath(channel.channelId, tctx, true)} onClick={() => click('bastan')}>
              Baştan başlat
            </Button>
          ) : (
            <Button variant="secondary" icon="guide" overImage to="/rehber" onClick={() => click('rehber')}>
              Rehber
            </Button>
          )}
        </div>
        {channel.isSampleSchedule && <p className="cn-meta lv-hero__note">Örnek yayın akışı</p>}
      </div>
    </section>
  )
}

/* ───────────── Kartlar ───────────── */

function ChannelCardItem({
  channel,
  item,
  favorite,
  onToggleFavorite,
  onLocked,
}: {
  channel: ChannelData
  item: RowItemData
  favorite: boolean
  onToggleFavorite: (ch: ChannelData) => void
  onLocked: (t: LockTarget) => void
}): ReactElement {
  const lock = lockText(channel.access)
  const air = channel.now
  const click = () => logEvent('click', { surface: 'canli', rowType: 'CHANNEL_ROW', action: lock ? 'kilit' : 'canli', entityId: item.track.entityId }, item.track.tctx)
  return (
    <div className="lv-chcard">
      {air ? (
        <LiveChannelCard
          channelName={channel.name}
          channelLogoUrl={channel.logo.url}
          programmeTitle={air.title}
          start={air.startAt}
          end={air.endAt}
          lockedText={lock}
          to={lock ? undefined : liveWatchPath(channel.channelId, item.track.tctx)}
          onClick={
            lock
              ? () => {
                  click()
                  onLocked({ title: channel.name, reason: lock })
                }
              : click
          }
        />
      ) : (
        <div className="cn-card cn-livecard lv-chcard__empty">
          <span className="cn-livecard__top">
            <ChannelTile name={channel.name} logoUrl={channel.logo.url} />
            <span className="cn-livecard__text">
              <span className="cn-card-title">{channel.name}</span>
              <span className="cn-meta">Yayın bilgisi yok</span>
            </span>
          </span>
        </div>
      )}
      <IconButton
        className="lv-chcard__fav"
        size={36}
        icon={favorite ? 'check' : 'plus'}
        label={favorite ? `${channel.name}: Kanallarımdan çıkar` : `${channel.name}: Kanallarıma ekle`}
        pressed={favorite}
        onClick={() => onToggleFavorite(channel)}
      />
    </div>
  )
}

function TonightCard({ airing, item, onOpen }: { airing: AiringData; item: RowItemData; onOpen: (t: AiringSheetTarget) => void }): ReactElement {
  const now = useNow()
  const state = timeStateOf(airing.startAt, airing.endAt, now)
  const lock = lockText(airing.access)
  const live = state === 'LIVE' && !lock
  const label = `${airing.channel.name}, ${airing.title}, ${live ? liveStatus(airing.startAt, airing.endAt, now).line : tonightMeta(airing, now)}`
  return (
    <div className="lv-airing">
      <LandscapeCard
        title={airing.title}
        imageUrl={airing.art?.url}
        live={state === 'LIVE' ? { start: airing.startAt, end: airing.endAt } : null}
        meta={tonightMeta(airing, now)}
        lockedText={lock}
        ariaLabel={label}
        to={live ? liveWatchPath(airing.channel.channelId, item.track.tctx) : undefined}
        onClick={(e) => {
          logEvent('click', { surface: 'canli', rowType: 'TONIGHT_ROW', action: live ? 'canli' : 'ayrinti', entityId: item.track.entityId }, item.track.tctx)
          if (live) return
          e.preventDefault()
          onOpen({ airing, channel: airing.channel, tctx: item.track.tctx, surface: 'canli' })
        }}
      />
      <ChannelTile className="lv-airing__logo" name={airing.channel.name} logoUrl={airing.channel.logo.url} size={40} />
    </div>
  )
}

function CatchupCard({ airing, item, onOpen }: { airing: AiringData; item: RowItemData; onOpen: (t: AiringSheetTarget) => void }): ReactElement {
  const now = useNow()
  const action = airingAction(airing, airing.channel.channelId, now, item.track.tctx)
  const playable = action.kind === 'catchup'
  const meta = catchupOpen(airing, now) ? catchupMeta(airing, now) : 'Tekrar izlenemiyor'
  return (
    <div className="lv-airing">
      <LandscapeCard
        title={airing.title}
        imageUrl={airing.art?.url}
        meta={meta}
        lockedText={action.kind === 'locked' ? action.reason : null}
        ariaLabel={`${airing.channel.name}, ${airing.title}, ${meta}${playable ? ', baştan izle' : ''}`}
        to={playable ? action.primary.to : undefined}
        onClick={(e) => {
          logEvent('click', { surface: 'canli', rowType: 'CATCHUP_ROW', action: playable ? 'geri-al' : 'ayrinti', entityId: item.track.entityId }, item.track.tctx)
          if (playable) return
          e.preventDefault()
          onOpen({ airing, channel: airing.channel, tctx: item.track.tctx, surface: 'canli' })
        }}
      />
      <ChannelTile className="lv-airing__logo" name={airing.channel.name} logoUrl={airing.channel.logo.url} size={40} />
    </div>
  )
}

function Bridge({ row }: { row: RenderableRow }): ReactElement {
  const to = row.bridgeTo === 'canli' ? '/canli' : '/film-dizi'
  return (
    <Link
      to={to}
      className="lv-bridge cn-gutter-x"
      onClick={() => logEvent('click', { surface: 'canli', rowType: 'BRIDGE', rowId: row.rowId, to }, null)}
    >
      <span className="lv-bridge__icon" aria-hidden="true">
        <Icon name="play" size={20} />
      </span>
      <span className="lv-bridge__text">
        <span className="cn-card-title">{row.title ?? 'Film & Dizi'}</span>
        <span className="cn-meta">Filmlere ve dizilere geç</span>
      </span>
      <Icon name="chevronRight" size={20} />
    </Link>
  )
}

/* ───────────── Satır ───────────── */

function LiveRow({ row, onVisible, children }: { row: RenderableRow; onVisible: (row: RenderableRow, items: RowItemData[]) => void; children: ReactElement[] }): ReactElement {
  const id = `lv-row-${row.rowId}`
  const onRange = (r: VisibleRange) => {
    if (r.first < 0) return
    onVisible(row, row.items.slice(r.first, r.last + 1))
  }
  return (
    <section className="cn-row lv-row" aria-labelledby={id}>
      <RowHeader title={row.title ?? ''} id={id} to={row.type === 'CHANNEL_ROW' || row.type === 'TONIGHT_ROW' ? '/rehber' : undefined} actionLabel="Rehber" />
      {rowHasSampleSchedule(row) && <p className="cn-meta cn-gutter-x lv-row__note">Bazı kanallarda örnek yayın akışı</p>}
      <HScroll labelledBy={id} scrollKey={`canli:${row.rowId}`} onVisibleRangeChange={onRange}>
        {children}
      </HScroll>
    </section>
  )
}

/* ───────────── Sayfa ───────────── */

function LiveSkeleton(): ReactElement {
  return (
    <Page className="lv-page">
      <div className="lv-hero lv-hero--skeleton" role="status" aria-label="Yükleniyor">
        <Skeleton variant="landscape" className="lv-hero__skel" />
      </div>
      <SkeletonRow variant="landscape" count={6} />
      <SkeletonRow variant="landscape" count={6} />
    </Page>
  )
}

export function LiveHomePage(): ReactElement {
  const { data, error, loading, refetch } = useGql<LivePageData, typeof VARIABLES>('LivePage', VARIABLES, { ttlMs: 60_000 })
  const now = useNow()
  const page = data?.livePage
  const rows = useMemo(() => renderableRows(page?.rows ?? []), [page])
  const fetchedAt = page ? Date.parse(page.serverTime) : 0
  const [sheet, setSheet] = useState<AiringSheetTarget | null>(null)
  const [locked, setLocked] = useState<LockTarget | null>(null)
  const [favOverride, setFavOverride] = useState<Map<number, boolean>>(new Map())
  const onVisible = useImpressions(page?.id)

  // Program sınırı ya da satır ttl'i geçtiyse tek sorguyla yeniden çek (eski veri ekranda kalır).
  useEffect(() => {
    if (!page || loading) return
    const due = rowsNeedingRefetch(page.rows, fetchedAt, Date.now())
    if (due.length) {
      devbus.emit('cache', 'Canlı TV: yeniden çek', { key: 'LivePage', rows: due, ageMs: Date.now() - fetchedAt })
      refetch()
    }
  }, [now, page, loading, fetchedAt, refetch])

  // Sunucu verisi iyimser değeri yakalayınca geçersiz kılmayı bırak.
  useEffect(() => {
    if (!page || favOverride.size === 0) return
    const next = new Map(favOverride)
    for (const r of page.rows)
      for (const it of r.items) {
        const ch = asChannel(it)
        if (ch && next.get(ch.channelId) === ch.isFavorite) next.delete(ch.channelId)
      }
    if (next.size !== favOverride.size) setFavOverride(next)
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  const hero = rows.find((r) => r.type === 'LIVE_HERO')
  const heroItem = hero?.items[0]
  const heroChannel = heroItem ? asChannel(heroItem) : null

  // Komşu kanal ön hazırlığı: kahraman + kanal sırasındaki sonraki iki kanal.
  const channelOrder = useMemo(() => {
    const lists = rows.filter((r) => r.type === 'CHANNEL_ROW').map((r) => r.items.map(asChannel).filter((c): c is ChannelData => !!c).map((c) => c.channelId))
    return lists.sort((a, b) => b.length - a.length)[0] ?? []
  }, [rows])
  const heroId = heroChannel?.channelId
  useEffect(() => {
    if (heroId === undefined) return
    const ids = [heroId, ...neighbourChannelIds(channelOrder, heroId, 2)]
    for (const id of ids) {
      devbus.emit('prefetch', 'komşu kanal', { viewableId: `Channel:${id}`, hero: id === heroId })
      void prefetchManifest(`Channel:${id}`)
    }
  }, [heroId, channelOrder.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (heroItem) onVisible(hero!, [heroItem])
  }, [heroItem, hero, onVisible])

  const isFavorite = (ch: ChannelData) => favOverride.get(ch.channelId) ?? ch.isFavorite
  const toggleFavorite = (ch: ChannelData) => {
    const next = !isFavorite(ch)
    setFavOverride((m) => new Map(m).set(ch.channelId, next))
    logEvent('click', { surface: 'canli', action: next ? 'kanal-ekle' : 'kanal-cikar', entityId: ch.unifiedEntityId }, null)
    gql<{ toggleFavoriteChannel: { channelId: number; isFavorite: boolean } }, { channelId: number }>('ToggleFavoriteChannel', { channelId: ch.channelId }).then(
      (res) => {
        const fav = res.toggleFavoriteChannel.isFavorite
        setFavOverride((m) => new Map(m).set(ch.channelId, fav))
        toast(fav ? `${ch.name} Kanallarım'a eklendi` : `${ch.name} Kanallarım'dan çıkarıldı`, { kind: 'ok' })
        queryCache.invalidate('Library')
        refetch()
      },
      () => {
        setFavOverride((m) => {
          const copy = new Map(m)
          copy.delete(ch.channelId)
          return copy
        })
        toast('Kanal listesi güncellenemedi. Tekrar dene.')
      },
    )
  }

  if (!page && error) {
    return (
      <Page className="lv-page">
        <ErrorState size="page" title="Canlı TV yüklenemedi" onRetry={refetch} />
      </Page>
    )
  }
  if (!page) return <LiveSkeleton />

  return (
    <Page className="lv-page">
      <h1 className="cn-sr-only">Canlı TV</h1>
      {rows.map((row) => {
        switch (row.type) {
          case 'LIVE_HERO':
            return heroChannel && heroItem ? <LiveHero key={row.rowId} channel={heroChannel} item={heroItem} onLocked={setLocked} /> : null
          case 'CHANNEL_ROW':
            return (
              <LiveRow key={row.rowId} row={row} onVisible={onVisible}>
                {row.items.flatMap((it) => {
                  const ch = asChannel(it)
                  return ch ? [<ChannelCardItem key={it.track.entityId} channel={ch} item={it} favorite={isFavorite(ch)} onToggleFavorite={toggleFavorite} onLocked={setLocked} />] : []
                })}
              </LiveRow>
            )
          case 'TONIGHT_ROW':
            return (
              <LiveRow key={row.rowId} row={row} onVisible={onVisible}>
                {row.items.flatMap((it) => {
                  const a = asAiring(it)
                  return a ? [<TonightCard key={it.track.entityId} airing={a} item={it} onOpen={setSheet} />] : []
                })}
              </LiveRow>
            )
          case 'CATCHUP_ROW':
            return (
              <LiveRow key={row.rowId} row={row} onVisible={onVisible}>
                {row.items.flatMap((it) => {
                  const a = asAiring(it)
                  return a ? [<CatchupCard key={it.track.entityId} airing={a} item={it} onOpen={setSheet} />] : []
                })}
              </LiveRow>
            )
          case 'BRIDGE':
            return <Bridge key={row.rowId} row={row} />
        }
      })}
      <AiringSheet target={sheet} onClose={() => setSheet(null)} />
      <AccessSheet title={locked?.title ?? null} reason={locked?.reason ?? ''} onClose={() => setLocked(null)} />
    </Page>
  )
}
