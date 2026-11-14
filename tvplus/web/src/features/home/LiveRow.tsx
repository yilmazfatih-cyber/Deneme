/**
 * Canlı TV köprüsü (lolomo `bridge` bağlamı): kanal kartları — 16:9 yayın görseli, sol üstte kanal logosu, altta
 * ilerleme ve "CANLI · Program · 42 dk kaldı" (UX_SPEC §2 "Canlı TV", §7 kural 4). Kart tek dokunuşta kanalı açar.
 * Satır görünüme yaklaşınca GraphQL `HomeLiveRow` ile dolar (Falcor öğesi yoktur).
 */
import { useEffect, useRef, type ReactElement } from 'react'
import { useGql } from '../../api/hooks'
import { logEvent } from '../../telemetry/logger'
import {
  Badge,
  ErrorState,
  formatRemaining,
  liveProgress,
  LiveTag,
  SkeletonSlider,
  Slider,
  TitleCard,
  useNow,
} from '../../ui'
import { channelPlayPath } from '../preview'
import type { ListSummary } from './lolomo'

interface Art {
  url: string
}
interface Airing {
  title: string
  startAt: string
  endAt: string
  artwork?: Art | null
}
export interface LiveChannel {
  channelId: number
  unifiedEntityId: string
  name: string
  number: number
  logo: Art
  access: { state: string; reasonText: string | null }
  now: Airing | null
}
interface LiveRowData {
  channels: LiveChannel[]
}

/** Önce şu an yayında olanlar, sonra numara sırası; en çok 20 kanal. */
export function liveRowChannels(channels: readonly LiveChannel[], nowMs: number): LiveChannel[] {
  const onAir = (c: LiveChannel) =>
    !!c.now && Date.parse(c.now.startAt) <= nowMs && Date.parse(c.now.endAt) > nowMs ? 0 : 1
  return [...channels].sort((a, b) => onAir(a) - onAir(b) || a.number - b.number).slice(0, 20)
}

export function LiveRow({
  summary,
  rowIndex,
  enabled,
}: {
  summary: ListSummary
  rowIndex: number
  /** Satır görünüme yaklaştı: veriyi iste */
  enabled: boolean
}): ReactElement | null {
  const q = useGql<LiveRowData>('HomeLiveRow', {}, { enabled, ttlMs: 60_000 })
  const now = useNow()
  const logged = useRef(false)
  const channels = q.data ? liveRowChannels(q.data.channels, now) : []

  useEffect(() => {
    if (logged.current || !channels.length) return
    logged.current = true
    logEvent('impression', {
      listId: summary.id,
      context: 'bridge',
      row: rowIndex,
      trackId: summary.trackId,
      ranks: `0-${Math.min(channels.length, 6) - 1}`,
      entityIds: channels.slice(0, 6).map((c) => c.unifiedEntityId),
    })
  }, [channels.length, summary.id, summary.trackId, rowIndex])

  if (q.error && !q.data)
    return (
      <section className="gz-row gz-row--error" aria-label={summary.displayName}>
        <h2 className="ui-row-title ui-gutter gz-row__title">{summary.displayName || 'Canlı TV'}</h2>
        <div className="ui-gutter">
          <ErrorState title="Kanallar yüklenemedi" onRetry={q.refetch} />
        </div>
      </section>
    )
  if (!q.data) return <SkeletonSlider className="gz-row-skel" />
  if (!channels.length) return null

  return (
    <section className="gz-row gz-row--live" data-context="bridge" data-row={rowIndex}>
      <Slider
        title={summary.displayName || 'Canlı TV'}
        moreHref="/canli"
        items={channels}
        getKey={(c) => c.channelId}
        mobileItemWidth={240}
        renderItem={(c, ctx) => {
          const a = c.now
          const locked = c.access.state !== 'PLAYABLE'
          const progress = a ? liveProgress(a.startAt, a.endAt, now) : null
          const left = a ? formatRemaining(a.endAt, now) : null
          return (
            <TitleCard
              title={a ? `${c.name}: ${a.title}` : c.name}
              image={a?.artwork?.url}
              channelLogo={locked ? null : c.logo.url}
              channelName={c.name}
              badge={locked ? <Badge tone="lock" /> : undefined}
              progress={progress}
              caption={
                <span className="gz-live-caption">
                  <LiveTag />
                  <span className="gz-live-caption__text">
                    {[a?.title ?? c.name, left].filter(Boolean).join(' · ')}
                  </span>
                </span>
              }
              to={locked ? '/canli' : channelPlayPath(c.channelId)}
              tabIndex={ctx.tabIndex}
              aria-label={[c.name, 'canlı', a?.title, left, locked ? c.access.reasonText : null]
                .filter(Boolean)
                .join(', ')}
              onClick={() =>
                logEvent('click', {
                  channelId: c.channelId,
                  listId: summary.id,
                  context: 'bridge',
                  action: locked ? 'mode' : 'watch',
                  from: 'lolomo',
                })
              }
            />
          )
        }}
      />
    </section>
  )
}
