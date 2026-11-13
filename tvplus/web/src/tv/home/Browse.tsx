/**
 * Göz atma ekranı (Ana Sayfa ve kategori ekranları ortak): üstte odaktaki başlık, altta satırlar.
 *
 *   - Satırlar Falcor'dan yol yol: önce özetler (3'erli gruplar, odak yaklaştıkça), sonra öğeler (10'ar 10'ar,
 *     satırda ilerledikçe). Satır bağlamı kart biçimini belirler (model.ts `cardKindOf`).
 *   - Odak hafızası (memory.ts): başlığa girip Geri'ye basınca aynı satırın aynı kartına dönülür.
 *   - OK: kart → detay (devam et kartı ve kanal doğrudan oynatır). İlk karttayken ← yan menüyü açar (kabuk).
 *   - Gösterim (impression) ve tıklama olayları tctx ile günlüğe yazılır.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FalcorPath } from '../../../../shared/types'
import { useGql } from '../../api/hooks'
import { prefetchManifest } from '../../player'
import { logEvent } from '../../telemetry/logger'
import { useFocusWithin } from '../focus'
import { titlePath, useTvBoot, watchPath } from '../shell'
import {
  formatRemaining,
  formatTimeRange,
  screenScopeId,
  TvCard,
  TvPosterCard,
  TvScreen,
  TvSkeletonRow,
} from '../ui'
import { Hero } from './Hero'
import { Lane } from './Lane'
import {
  browseMemory,
  rememberFocus,
  restoreFocusId,
  restoreIndex,
  rowScopeId,
  type BrowseMemory,
} from './memory'
import {
  HERO_LEAVES,
  heroOf,
  INITIAL_ROWS,
  ITEM_PAGE,
  itemsToLoad,
  mapChannel,
  mapRow,
  planRowItems,
  planRowSummaries,
  rootPath,
  rowsToLoad,
  type BrowseCategory,
  type CardVM,
  type ChannelData,
  type ChannelVM,
  type HeroVM,
  type RowNode,
  type RowVM,
  type VideoNode,
} from './model'
import { useFalcorPaths } from './falcorView'
import { useSettled } from './Hero'
import { RowsStack } from './RowsStack'
import './home.css'

/* ───────────── Ölçüler (rem) ───────────── */

const CARD_W = 19.5
const POSTER_W = 10.5
const RANKED_W = POSTER_W * 1.6
const CHANNEL_W = 19.5
const CAPTION_SPACE = 2.6
/** Odaktaki satırın üst kenarı: üst alan ekranın ~%52'si */
const ROWS_ANCHOR = '35rem'

/* ───────────── JSON erişimi ───────────── */

type Json = Record<string, unknown>
const obj = (v: unknown): Json | undefined => (v && typeof v === 'object' ? (v as Json) : undefined)

/** Kök (lolomo / lolomoByCategory[kategori]) düğümü */
function rootOf(json: unknown, category: BrowseCategory): Json | undefined {
  const j = obj(json)
  return category === 'home' ? obj(j?.lolomo) : obj(obj(j?.lolomoByCategory)?.[category])
}

interface ChannelsData {
  channels: ChannelData[]
}
interface MatchData {
  videos: ({ videoId: number; matchScore?: number | null } | null)[]
}

/* ───────────── Satır öğesi birliği ───────────── */

type LaneItem = { kind: 'video'; card: CardVM } | { kind: 'channel'; channel: ChannelVM }

interface DisplayRow {
  key: string
  vm: RowVM
  length: number
  items: (LaneItem | null)[]
}

/* ───────────── Ekran ───────────── */

export interface BrowseProps {
  /** Ekran kimliği (odak kapsamı ve hafıza) */
  screenId: string
  category: BrowseCategory
  /** Ekran okuyucu ve kategori başlığı */
  title: string
  showPageTitle?: boolean
}

export function Browse({ screenId, category, title, showPageTitle }: BrowseProps): ReactElement {
  const navigate = useNavigate()
  const guid = useTvBoot()?.activeProfile?.guid ?? ''
  const memKey = `${guid}|${screenId}`
  // Hafıza bağlanma anında okunur: satır ve kart pencereleri kaldığı yerden çizilir.
  const [mem0] = useState<BrowseMemory>(() => browseMemory.get(memKey))
  const memRef = useRef(mem0)
  const saveMem = useCallback(
    (next: BrowseMemory) => {
      memRef.current = next
      browseMemory.set(memKey, next)
    },
    [memKey],
  )

  const [loadedRows, setLoadedRows] = useState(() => Math.max(INITIAL_ROWS, mem0.loadedRows))
  const [loadedItems, setLoadedItems] = useState<Record<string, number>>(() => mem0.loadedItems)

  /* 1. Özet → satır sayısı */
  const root = rootPath(category)
  const top = useFalcorPaths<Json>([[...root, 'summary']])
  const total = (obj(rootOf(top.json, category)?.summary)?.length as number | undefined) ?? null

  /* 2. Satır özetleri */
  const rowCount = total === null ? 0 : Math.min(loadedRows, total)
  const summaries = useFalcorPaths<Json>(planRowSummaries(category, rowCount))
  const summaryRoot = rootOf(summaries.json, category)

  /* 3. Satır öğeleri */
  const itemPaths: FalcorPath[] = []
  for (let r = 0; r < rowCount; r++) {
    const s = obj(obj(summaryRoot?.[String(r)])?.summary) as RowNode['summary'] | undefined
    if (!s) continue
    const vm = mapRow({ summary: s }, r, 0)
    if (!vm) continue
    const count = loadedItems[s.id] ?? Math.min(ITEM_PAGE, s.length)
    itemPaths.push(...planRowItems(category, r, vm.kind, count))
  }
  const items = useFalcorPaths<Json>(itemPaths)
  const itemsRoot = rootOf(items.json, category)

  /* Canlı TV köprüsü: kanal kartları (yalnız satır varsa) */
  const hasBridge = useMemo(() => {
    for (let r = 0; r < rowCount; r++) {
      const s = obj(obj(summaryRoot?.[String(r)])?.summary)
      if (s?.context === 'bridge') return true
    }
    return false
  }, [summaryRoot, rowCount])
  const channelsQ = useGql<ChannelsData>('TvBridgeChannels', undefined, { enabled: hasBridge, ttlMs: 60_000 })
  // Kanal verisi geldikçe yeniden kurulur; ilerleme o anın saatine göre (dakikalık doğruluk yeter).
  const channels = useMemo(() => {
    const now = Date.now()
    return (channelsQ.data?.channels ?? []).slice(0, 16).map((c) => mapChannel(c, now))
  }, [channelsQ.data])

  /* Satır görünüm modelleri */
  const rows: DisplayRow[] = useMemo(() => {
    const out: DisplayRow[] = []
    for (let r = 0; r < rowCount; r++) {
      const s = obj(obj(summaryRoot?.[String(r)])?.summary) as RowNode['summary'] | undefined
      if (!s) continue
      const node: RowNode = { ...(obj(itemsRoot?.[String(r)]) as RowNode | undefined), summary: s }
      const count = loadedItems[s.id] ?? Math.min(ITEM_PAGE, s.length)
      const vm = mapRow(node, r, count)
      if (!vm) continue
      if (vm.kind === 'channel') {
        if (!channels.length) continue
        out.push({
          key: vm.listId,
          vm,
          length: channels.length,
          items: channels.map((channel) => ({ kind: 'channel', channel })),
        })
        continue
      }
      if (vm.length === 0) continue
      const list: (LaneItem | null)[] = []
      for (let i = 0; i < vm.length; i++) {
        const card = vm.items[i] ?? null
        list.push(card ? { kind: 'video', card } : null)
      }
      // Hiç öğesi gelmemiş satır henüz çizilmez (odaklanamaz iskelet satırı yerine alttaki iskelet).
      if (!list.some(Boolean)) continue
      out.push({ key: vm.listId, vm, length: vm.length, items: list })
    }
    return out
  }, [rowCount, summaryRoot, itemsRoot, loadedItems, channels])

  const stillLoading = total === null || rowCount < total || summaries.missing > 0

  /* Odak durumu */
  const [focus, setFocus] = useState<{ listId: string; index: number } | null>(() =>
    mem0.rowListId ? { listId: mem0.rowListId, index: mem0.lanes[mem0.rowListId]?.index ?? 0 } : null,
  )
  const focusRow = focus ? rows.findIndex((r) => r.key === focus.listId) : -1
  const focusedRow = focusRow >= 0 ? rows[focusRow] : undefined
  const focusedItem = focusedRow && focus ? (focusedRow.items[focus.index] ?? null) : null

  const onFocusCard = useCallback(
    (row: DisplayRow, index: number) => {
      setFocus((f) => (f && f.listId === row.key && f.index === index ? f : { listId: row.key, index }))
      const item = row.items[index]
      const key = item ? (item.kind === 'video' ? item.card.key : item.channel.key) : null
      let next = rememberFocus(memRef.current, row.key, row.vm.rowIndex, index, key)
      if (row.vm.kind !== 'channel') {
        const loaded = loadedItems[row.key] ?? Math.min(ITEM_PAGE, row.vm.length)
        const want = itemsToLoad(index, loaded, row.vm.length)
        if (want !== loaded) {
          setLoadedItems((li) => ({ ...li, [row.key]: want }))
          next = { ...next, loadedItems: { ...next.loadedItems, [row.key]: want } }
        }
      }
      const rowsWant = total === null ? loadedRows : rowsToLoad(row.vm.rowIndex, loadedRows, total)
      if (rowsWant !== loadedRows) setLoadedRows(rowsWant)
      saveMem({ ...next, loadedRows: Math.max(rowsWant, next.loadedRows) })
    },
    [loadedItems, loadedRows, total, saveMem],
  )

  /* Gösterimler: satırda yeni görünen sıralar bir kez */
  const seen = useRef(new Set<string>())
  useEffect(() => {
    if (!focusedRow || !focus) return
    const fresh: number[] = []
    const entityIds: string[] = []
    const visible = focusedRow.vm.kind === 'poster' ? 7 : 6
    for (let i = focus.index; i < Math.min(focusedRow.length, focus.index + visible); i++) {
      const k = `${focusedRow.key}:${i}`
      const it = focusedRow.items[i]
      if (!it || seen.current.has(k)) continue
      seen.current.add(k)
      fresh.push(i)
      entityIds.push(it.kind === 'video' ? it.card.entityId : it.channel.entityId)
    }
    if (!fresh.length) return
    const firstItem = focusedRow.items[fresh[0]!]
    logEvent(
      'impression',
      {
        listId: focusedRow.key,
        context: focusedRow.vm.context,
        row: focusedRow.vm.rowIndex,
        trackId: focusedRow.vm.trackId,
        ranks: `${fresh[0]}-${fresh[fresh.length - 1]}`,
        entityIds,
        screen: screenId,
      },
      firstItem?.kind === 'video' ? firstItem.card.tctx : null,
    )
  }, [focusedRow, focus, screenId])

  /* Üst alan: odaktaki başlığın yaprakları (odak yerleşince; satırın yakın öğeleri de önden) */
  const settledFocus = useSettled(focus && focusedRow ? `${focusRow}|${focus.index}` : null, 140)
  const heroPaths: FalcorPath[] = []
  if (settledFocus && focusedRow && focusedRow.vm.kind !== 'channel') {
    const [, idx] = settledFocus.split('|').map(Number)
    const i = idx ?? 0
    const to = Math.min(focusedRow.length - 1, i + 3)
    const from = Math.max(0, i - 1)
    if (to >= from) heroPaths.push([...root, focusedRow.vm.rowIndex, { from, to }, [...HERO_LEAVES]])
  }
  const heroData = useFalcorPaths<Json>(heroPaths)
  const heroRoot = rootOf(heroData.json, category)

  /* Eşleşme yüzdesi: odaktaki satırın yüklü başlıkları için tek GraphQL isteği */
  const settledRowKey = useSettled(focusedRow?.vm.kind === 'channel' ? null : (focusedRow?.key ?? null), 300)
  const matchIds = useMemo(() => {
    const row = rows.find((r) => r.key === settledRowKey)
    if (!row) return []
    return row.items.flatMap((it) => (it?.kind === 'video' ? [it.card.videoId] : [])).slice(0, 40)
  }, [rows, settledRowKey])
  const matchQ = useGql<MatchData, { videoIds: number[] }>(
    'TvMatchScores',
    { videoIds: matchIds },
    { enabled: matchIds.length > 0, ttlMs: 5 * 60_000 },
  )
  const matchScores = useMemo(() => {
    const m = new Map<number, number | null>()
    for (const v of matchQ.data?.videos ?? []) if (v) m.set(v.videoId, v.matchScore ?? null)
    return m
  }, [matchQ.data])

  const hero: HeroVM | null = useMemo(() => {
    if (!focusedItem || !focusedRow || !focus) return null
    if (focusedItem.kind === 'channel') return channelHero(focusedItem.channel)
    const node = obj(obj(heroRoot?.[String(focusedRow.vm.rowIndex)])?.[String(focus.index)]) as
      | VideoNode
      | undefined
    const sameVideo = node?.summary?.id === focusedItem.card.videoId ? node : undefined
    return heroOf(focusedItem.card, sameVideo, matchScores.get(focusedItem.card.videoId))
  }, [focusedItem, focusedRow, focus, heroRoot, matchScores])

  /* Önizleme yalnız odak bu ekrandayken */
  const screenFocused = useFocusWithin(screenScopeId(screenId))

  /* Devam et: ilk öğenin manifesti önden hazırlanır (OK'ta anında başlasın) */
  const resumeFirst = rows.find((r) => r.vm.kind === 'resume')?.items[0]
  const resumePlay = resumeFirst?.kind === 'video' ? (resumeFirst.card.play?.viewableId ?? null) : null
  useEffect(() => {
    if (resumePlay) void prefetchManifest(resumePlay)
  }, [resumePlay])

  /* Eylemler */
  const openVideo = useCallback(
    (row: DisplayRow, card: CardVM) => {
      const play = row.vm.kind === 'resume' ? card.play : null
      logEvent(
        'click',
        {
          videoId: card.videoId,
          listId: row.key,
          context: row.vm.context,
          row: row.vm.rowIndex,
          rank: card.index,
          action: play ? 'play' : 'detail',
          screen: screenId,
        },
        card.tctx,
      )
      if (play) {
        logEvent('playback.intent', { videoId: card.videoId, viewableId: play.viewableId, from: screenId }, card.tctx)
        navigate(watchPath(play.viewableId, { positionSec: play.positionSec, tctx: card.tctx }))
      } else {
        navigate(`${titlePath(card.videoId)}?tctx=${encodeURIComponent(card.tctx)}`)
      }
    },
    [navigate, screenId],
  )
  const openChannel = useCallback(
    (row: DisplayRow, ch: ChannelVM) => {
      logEvent('click', {
        channelId: ch.channelId,
        listId: row.key,
        context: 'bridge',
        row: row.vm.rowIndex,
        action: 'play',
        screen: screenId,
      })
      navigate(watchPath(`Channel:${ch.channelId}`))
    },
    [navigate, screenId],
  )

  /* Açılış odağı: hafızadaki kart, yoksa ilk satırın ilk kartı */
  const restoreId = restoreFocusId(mem0, screenId)
  const initialRowIndex = Math.max(
    0,
    rows.findIndex((r) => r.key === mem0.rowListId),
  )

  const laneNodes = rows.map((row, ri) => {
    const keys = row.items.map((it) => (it ? (it.kind === 'video' ? it.card.key : it.channel.key) : null))
    const initialIndex = restoreIndex(mem0, row.key, keys, row.length)
    const scope = rowScopeId(screenId, row.key)
    const kind = row.vm.kind
    const poster = kind === 'poster'
    const width = poster ? RANKED_W : kind === 'channel' ? CHANNEL_W : CARD_W
    const aspect = poster ? RANKED_W / (POSTER_W * 1.5) : 16 / 9
    return {
      key: row.key,
      node: (
        <Lane<LaneItem>
          id={scope}
          title={row.vm.title}
          aside={row.vm.reason ? `Ortak: ${row.vm.reason}` : null}
          length={row.length}
          getItem={(i) => row.items[i] ?? null}
          itemKey={(it) => (it.kind === 'video' ? it.card.key : it.channel.key)}
          itemWidth={width}
          aspect={aspect}
          captionSpace={kind === 'resume' || kind === 'channel' ? CAPTION_SPACE : 0}
          skeletonRatio={poster ? '1.6 / 1.5' : '16 / 9'}
          initialIndex={initialIndex}
          onFocusIndex={(i) => onFocusCard(row, i)}
          renderItem={(it, i, focusId) =>
            it.kind === 'channel' ? (
              <TvCard
                id={focusId}
                imageUrl={it.channel.imageUrl}
                title={it.channel.name}
                live
                locked={it.channel.locked}
                progress={it.channel.progress}
                caption={joinCaption(it.channel)}
                overlay={
                  it.channel.logoUrl ? <img className="tvb-channel-logo" src={it.channel.logoUrl} alt="" /> : null
                }
                width={CHANNEL_W}
                onPress={() => openChannel(row, it.channel)}
              />
            ) : poster ? (
              <TvPosterCard
                id={focusId}
                imageUrl={it.card.imageUrl}
                title={it.card.title}
                rank={it.card.rank}
                width={POSTER_W}
                autoFocus={!restoreId && ri === 0 && i === 0}
                onPress={() => openVideo(row, it.card)}
              />
            ) : (
              <TvCard
                id={focusId}
                imageUrl={it.card.imageUrl}
                title={it.card.title}
                badge={it.card.badge}
                locked={it.card.locked}
                progress={kind === 'resume' ? (it.card.progress ?? 0) : null}
                caption={kind === 'resume' ? it.card.caption : null}
                width={CARD_W}
                autoFocus={!restoreId && ri === 0 && i === 0}
                onPress={() => openVideo(row, it.card)}
              />
            )
          }
        />
      ),
    }
  })

  return (
    <TvScreen id={screenId} title={title} padded={false} defaultFocus={restoreId ?? undefined} className="tvb">
      <Hero hero={hero} active={screenFocused} pageTitle={showPageTitle ? title : undefined} />
      {rows.length > 0 ? (
        <RowsStackLazy
          id={`${screenId}:satirlar`}
          rows={laneNodes}
          initialIndex={initialRowIndex}
          loading={stillLoading}
        />
      ) : (
        <div className="tvb-rows-loading">
          {top.missing === 0 && total === 0 ? (
            <p className="tvb-empty">Burada şimdilik bir şey yok.</p>
          ) : (
            <TvSkeletonRow cards={6} />
          )}
        </div>
      )}
    </TvScreen>
  )
}

/* ───────────── Yardımcılar ───────────── */

function joinCaption(ch: ChannelVM): string {
  return [ch.number ? `${ch.number}` : null, ch.program ?? ch.name].filter(Boolean).join(' · ')
}

function channelHero(ch: ChannelVM): HeroVM {
  const meta: string[] = []
  if (ch.startAt && ch.endAt) {
    meta.push(formatTimeRange(ch.startAt, ch.endAt))
    const left = (Date.parse(ch.endAt) - Date.now()) / 1000
    if (left > 0) meta.push(formatRemaining(left))
  }
  return {
    key: ch.key,
    eyebrow: `CANLI TV · ${ch.name.toLocaleUpperCase('tr-TR')}`,
    title: ch.program ?? ch.name,
    match: null,
    meta,
    maturity: null,
    rankLine: null,
    synopsis: ch.synopsis,
    tags: [],
    artUrl: ch.imageUrl,
    promo: null,
  }
}

function RowsStackLazy({
  id,
  rows,
  initialIndex,
  loading,
}: {
  id: string
  rows: { key: string; node: ReactElement }[]
  initialIndex: number
  loading: boolean
}): ReactElement {
  const all = loading
    ? [...rows, { key: '__iskelet', node: <TvSkeletonRow cards={6} /> }]
    : rows
  return <RowsStack id={id} rows={all} anchor={ROWS_ANCHOR} initialIndex={initialIndex} />
}
