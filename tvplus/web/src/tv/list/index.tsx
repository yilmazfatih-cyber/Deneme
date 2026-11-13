/**
 * TV Listem ekranı. Dışa aktarım adı SABİT.
 *   TvMyList  /tv/listem
 * Profilin listesi 4 sütunlu 16:9 ızgarada (yeni eklenen önce, sunucu sırası). Üstte odaktaki başlığın adı ve kısa
 * bilgisi. Liste boşsa sakin bir açıklama ve Ana Sayfa'ya dönüş. OK → detay.
 */
import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatTctx } from '../../../../shared/tctx'
import { useGql } from '../../api/hooks'
import { logEvent } from '../../telemetry/logger'
import { TV_PATHS, titlePath } from '../shell'
import { TvButton, TvCard, TvGrid, TvIcon, TvScreen, TvSkeletonCard } from '../ui'
import './list.css'

interface ListVideo {
  __typename: string
  videoId: number
  unifiedEntityId: string
  title: string
  displayRuntime: string
  latestYear: number | null
  access: { state: string }
  badge: { kind: string; text: string } | null
  storyArt: { url: string } | null
  boxart: { url: string } | null
  contentAdvisory: { certificationValue: string } | null
}

const SCREEN_ID = 'listem'
const cardId = (videoId: number): string => `listem:kart:${videoId}`

export function TvMyList(): ReactElement {
  const navigate = useNavigate()
  const q = useGql<{ library: { myList: ListVideo[] } }>('TvMyList', undefined, { ttlMs: 0 })
  const list = q.data?.library.myList ?? null
  const [focused, setFocused] = useState<ListVideo | null>(null)
  const current = focused && list?.some((v) => v.videoId === focused.videoId) ? focused : (list?.[0] ?? null)

  const open = (v: ListVideo, i: number): void => {
    const tctx = formatTctx({ row: 0, rank: i, rowId: 'listem', trackId: 0, entityId: v.unifiedEntityId })
    logEvent('click', { videoId: v.videoId, action: 'detail', from: 'tv-mylist' }, tctx)
    navigate(`${titlePath(v.videoId)}?tctx=${encodeURIComponent(tctx)}`)
  }

  return (
    <TvScreen
      id={SCREEN_ID}
      title="Listem"
      defaultFocus={list?.[0] ? cardId(list[0].videoId) : 'listem:ana-sayfa'}
      className="tvl"
    >
      <header className="tvl-header">
        <h1 className="tv-heading tvl-title">Listem</h1>
        {list && list.length > 0 && (
          <p className="tvl-count">
            {list.length} başlık
            {current && (
              <>
                <span className="tvl-sep" aria-hidden="true">
                  ·
                </span>
                <span className="tvl-focus">{current.title}</span>
                {[current.latestYear, current.displayRuntime].filter(Boolean).map((m) => (
                  <span key={String(m)} className="tvl-meta">
                    {m}
                  </span>
                ))}
              </>
            )}
          </p>
        )}
      </header>
      {list === null ? (
        q.error ? (
          <div className="tvl-empty">
            <p className="tvl-empty__title">Listen şu an açılamadı</p>
            <p className="tvl-empty__text">Bağlantını kontrol et ve tekrar dene.</p>
            <TvButton id="listem:tekrar" label="Tekrar dene" icon="restart" onPress={q.refetch} />
          </div>
        ) : (
          <div className="tvl-grid tvl-grid--skel" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <TvSkeletonCard key={i} width={23} />
            ))}
          </div>
        )
      ) : list.length === 0 ? (
        <div className="tvl-empty">
          <span className="tvl-empty__icon" aria-hidden="true">
            <TvIcon name="plus" size={3} />
          </span>
          <p className="tvl-empty__title">Listende henüz bir şey yok</p>
          <p className="tvl-empty__text">Bir başlığın detayında "Listeme Ekle"yi seç, burada görünsün.</p>
          <TvButton id="listem:ana-sayfa" label="Ana Sayfa'ya git" icon="home" onPress={() => navigate(TV_PATHS.home)} />
        </div>
      ) : (
        <TvGrid id="listem:izgara" columns={4} gap={1.4} label="Listem" className="tvl-grid">
          {list.map((v, i) => {
            const locked = v.access.state !== 'PLAYABLE'
            return (
              <TvCard
                key={v.videoId}
                id={cardId(v.videoId)}
                imageUrl={v.storyArt?.url ?? v.boxart?.url}
                title={v.title}
                locked={locked}
                badge={!locked && v.badge && v.badge.kind !== 'LOCKED' && v.badge.kind !== 'TOP10' ? v.badge.text : null}
                width="100%"
                onFocus={() => setFocused(v)}
                onPress={() => open(v, i)}
              />
            )
          })}
        </TvGrid>
      )}
    </TvScreen>
  )
}
