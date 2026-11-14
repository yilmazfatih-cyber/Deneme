/**
 * Kumanda boştayken "TV'de Aç": telefondan tek dokunuşla kaldığın içeriği ya da bir canlı kanalı TV'de başlatır.
 * TV'de bir şey oynamıyorken kumanda yalnız yön tuşu değildir; telefon TV için bir başlatıcıya dönüşür.
 *   İzlemeye Devam Et  → kaldığı yerden (yer imi sunucuda; konum gönderilmez, TV kendi yer iminden sürdürür)
 *   Listem             → devam edilecek bir şey yoksa
 *   Canlı TV           → o an yayındaki programla birlikte kanallar
 */
import { useEffect, useState, type ReactElement } from 'react'
import { useGql } from '../../api/hooks'
import { buzz, send } from '../../devices/actions'
import { loadChannels, type ChannelBrief } from '../../player/ui/metadata'
import { logEvent } from '../../telemetry/logger'
import { Icon, toast } from '../../ui'
import { lockedTextOf, remainingOf } from '../detail/model'
import type { CardVideoData, ContinueVideoData, LibraryData } from '../detail/types'

const MAX_TITLES = 8
const MAX_CHANNELS = 8

interface TitleTile {
  key: string
  viewableId: string
  title: string
  caption: string | null
  art: string | null
  progress: number | null
}

function titleTiles(data: LibraryData | undefined): { heading: string; tiles: TitleTile[] } {
  const lib = data?.library
  const playable = (v: CardVideoData) => v.isPlayable && !lockedTextOf(v.access)
  const cont = (lib?.continueWatching ?? []).filter(playable)
  if (cont.length) {
    return {
      heading: 'İzlemeye Devam Et',
      tiles: cont.slice(0, MAX_TITLES).map((v: ContinueVideoData) => {
        const ep = v.currentEpisode
        const bm = ep?.bookmark ?? v.bookmark
        const left = remainingOf(bm, ep?.runtimeSec)
        return {
          key: `c${v.videoId}`,
          viewableId: `Video:${ep?.videoId ?? v.videoId}`,
          title: v.title,
          caption: [ep?.numberLabel, left].filter(Boolean).join(' · ') || null,
          art: v.storyArt?.url ?? v.boxart?.url ?? null,
          progress: bm && bm.positionSec > 0 ? bm.progress : null,
        }
      }),
    }
  }
  const list = (lib?.myList ?? []).filter(playable)
  return {
    heading: 'Listem',
    tiles: list.slice(0, MAX_TITLES).map((v) => ({
      key: `l${v.videoId}`,
      viewableId: `Video:${v.videoId}`,
      title: v.title,
      caption: v.displayRuntime || null,
      art: v.storyArt?.url ?? v.boxart?.url ?? null,
      progress: null,
    })),
  }
}

export function OpenOnTv({ deviceId, tvName }: { deviceId: string; tvName: string }): ReactElement | null {
  const { data } = useGql<LibraryData>('Library', {}, { ttlMs: 30_000 })
  const [channels, setChannels] = useState<ChannelBrief[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadChannels().then(
      (c) => {
        if (alive) setChannels(c.slice(0, MAX_CHANNELS))
      },
      () => {
        /* kanal listesi gelmezse bölüm yalnız başlıklarla çizilir */
      },
    )
    return () => {
      alive = false
    }
  }, [])

  const { heading, tiles } = titleTiles(data)
  if (!tiles.length && !channels.length) return null

  const open = (viewableId: string, label: string) => {
    if (busy) return
    buzz()
    setBusy(viewableId)
    logEvent('click', { surface: 'kumanda', action: 'tvde-ac', entityId: viewableId })
    send(deviceId, { type: 'CAST', viewableId }).then(
      (r) => {
        setBusy(null)
        if (r === 'delivered') toast(`${label} ${tvName} üzerinde açılıyor`, { kind: 'success' })
        else toast(`${tvName} yanıt vermedi. TV'de TV+ açık mı?`, { kind: 'error' })
      },
      () => {
        setBusy(null)
        toast(`${tvName} yanıt vermedi. TV'de TV+ açık mı?`, { kind: 'error' })
      },
    )
  }

  return (
    <section className="rm-open" aria-label="TV'de Aç">
      <h2 className="rm-open__title">
        <Icon name="cast" size={18} />
        TV'de Aç
      </h2>

      {tiles.length ? (
        <>
          <h3 className="rm-open__sub">{heading}</h3>
          <ul className="rm-open__row">
            {tiles.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  className="rm-tile"
                  aria-label={`${t.title}${t.caption ? `, ${t.caption}` : ''}: TV'de aç`}
                  aria-busy={busy === t.viewableId}
                  onClick={() => open(t.viewableId, t.title)}
                >
                  <span className="rm-tile__art">
                    {t.art ? <img src={t.art} alt="" loading="lazy" /> : null}
                    <span className="rm-tile__play" aria-hidden="true">
                      <Icon name="play" size={18} />
                    </span>
                    {t.progress !== null ? (
                      <span className="rm-tile__bar" aria-hidden="true">
                        <span style={{ width: `${Math.round(Math.min(1, Math.max(0, t.progress)) * 100)}%` }} />
                      </span>
                    ) : null}
                  </span>
                  <span className="rm-tile__name">{t.title}</span>
                  {t.caption ? <span className="rm-tile__cap">{t.caption}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {channels.length ? (
        <>
          <h3 className="rm-open__sub">Canlı TV</h3>
          <ul className="rm-open__row rm-open__row--channels">
            {channels.map((ch) => {
              const id = `Channel:${ch.channelId}`
              return (
                <li key={ch.channelId}>
                  <button
                    type="button"
                    className="rm-chan"
                    aria-label={`${ch.number} ${ch.name}${ch.now ? `, şimdi ${ch.now.title}` : ''}: TV'de aç`}
                    aria-busy={busy === id}
                    onClick={() => open(id, ch.name)}
                  >
                    <span className="rm-chan__logo">
                      {ch.logo?.url ? <img src={ch.logo.url} alt="" loading="lazy" /> : <span>{ch.number}</span>}
                    </span>
                    <span className="rm-chan__text">
                      <span className="rm-chan__name">{ch.name}</span>
                      <span className="rm-chan__now">{ch.now?.title ?? 'Canlı yayın'}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </section>
  )
}
