/**
 * Listem (`/listem`) — Netflix "Listem" ızgarası: başlık + kartlar, en yeni eklenen önce (sunucu sırası).
 * Masaüstünde 16:9 kartlar (satır kuralındaki sütun sayısı), mobilde 3 sütun dikey afiş. Kart detayı açar
 * (masaüstünde `?jbv=` penceresi, mobilde /baslik/:id). ✓ ile listeden çıkarılan kart yerinde kaybolur ve
 * "Geri al" ile geri gelir; detay penceresinden yapılan değişiklik de ızgaraya hemen yansır.
 * Dışa aktarım adı SABİT: MyListPage.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { useDocumentTitle, useShellFormFactor, useTitleHref } from '../../app'
import { useGql } from '../../api/hooks'
import { logEvent } from '../../telemetry/logger'
import {
  Badge,
  ButtonLink,
  EmptyState,
  ErrorState,
  PosterCard,
  RoundButton,
  SkeletonGrid,
  TitleCard,
  toast,
} from '../../ui'
import { setInMyList } from '../detail/actions'
import { localTctx } from '../detail/links'
import { lockedTextOf } from '../detail/model'
import { useFreshAfterPlayback } from '../detail/sync'
import type { CardVideoData, LibraryData } from '../detail/types'
import './library.css'

const ROW_ID = 'listem'

export function MyListPage(): ReactElement {
  useFreshAfterPlayback()
  useDocumentTitle('Listem')
  const mobile = useShellFormFactor() === 'mobile'
  const { data, error, loading, refetch } = useGql<LibraryData>('Library', {}, { ttlMs: 15_000 })
  // Yerinde çıkarılanlar (sunucu yeniden yanıtlayana kadar gizli)
  const [removed, setRemoved] = useState<ReadonlySet<number>>(() => new Set())
  // Sunucu yanıtı çıkarılanı artık içermiyorsa gizleme kaydı düşer (başka yerden yeniden eklenirse görünür).
  useEffect(() => {
    const ids = new Set((data?.library.myList ?? []).map((v) => v.videoId))
    setRemoved((s) => {
      const next = new Set([...s].filter((id) => ids.has(id)))
      return next.size === s.size ? s : next
    })
  }, [data])
  const items = useMemo(() => (data?.library.myList ?? []).filter((v) => !removed.has(v.videoId)), [data, removed])

  const remove = (v: CardVideoData, tctx: string) => {
    setRemoved((s) => new Set(s).add(v.videoId))
    logEvent('click', { videoId: v.videoId, action: 'remove-from-list', from: 'my-list' }, tctx)
    void setInMyList(v.videoId, false, tctx).then((ok) => {
      if (!ok) {
        setRemoved((s) => without(s, v.videoId))
        return
      }
      toast(`${v.title} listenden çıkarıldı`, {
        action: {
          label: 'Geri al',
          onClick: () => {
            void setInMyList(v.videoId, true, tctx).then((back) => {
              if (back) setRemoved((s) => without(s, v.videoId))
            })
          },
        },
      })
    })
  }

  let body: ReactElement
  if (!data) {
    body =
      error && !loading ? (
        <ErrorState title="Listen yüklenemedi" message="Bağlantını kontrol et ve tekrar dene." onRetry={refetch} />
      ) : (
        <SkeletonGrid count={mobile ? 9 : 12} className="ml-skel" />
      )
  } else if (!items.length) {
    body = (
      <EmptyState
        icon="plus"
        title="Listen şimdilik boş"
        message="Sonra izlemek istediklerini ＋ ile buraya ekle."
        action={
          <ButtonLink to="/goz-at" variant="play" icon="home">
            Ana Sayfaya Git
          </ButtonLink>
        }
        className="ml-empty"
      />
    )
  } else {
    body = <Grid items={items} mobile={mobile} onRemove={remove} />
  }

  return (
    <div className="ml-page">
      <h1 className="ui-page-title ml-title ui-gutter">Listem</h1>
      {body}
    </div>
  )
}

function without(set: ReadonlySet<number>, id: number): ReadonlySet<number> {
  const next = new Set(set)
  next.delete(id)
  return next
}

function Grid({
  items,
  mobile,
  onRemove,
}: {
  items: CardVideoData[]
  mobile: boolean
  onRemove: (v: CardVideoData, tctx: string) => void
}): ReactElement {
  const href = useTitleHref()
  return (
    <ul
      className={mobile ? 'ml-grid ml-grid--poster ui-gutter' : 'ml-grid ui-gutter'}
      aria-label="Listendeki başlıklar"
    >
      {items.map((v, i) => {
        const tctx = localTctx(ROW_ID, i, v.videoId)
        const locked = lockedTextOf(v.access)
        const badge = locked ? (
          <Badge tone="lock" />
        ) : v.badge && v.badge.kind !== 'TOP10' ? (
          <Badge>{v.badge.text}</Badge>
        ) : null
        const label = [v.title, locked].filter(Boolean).join(', ')
        const open = () => logEvent('click', { videoId: v.videoId, action: 'detail', from: 'my-list' }, tctx)
        return (
          <li key={v.videoId} className="ml-item">
            {mobile ? (
              <PosterCard
                title={v.title}
                image={v.boxart?.url}
                badge={badge}
                progress={v.bookmark && v.bookmark.positionSec > 0 ? v.bookmark.progress : null}
                to={href(v.videoId, tctx)}
                onClick={open}
                aria-label={label}
              />
            ) : (
              <TitleCard
                title={v.title}
                image={v.storyArt?.url}
                badge={badge}
                progress={v.bookmark && v.bookmark.positionSec > 0 ? v.bookmark.progress : null}
                to={href(v.videoId, tctx)}
                onClick={open}
                aria-label={label}
              />
            )}
            <RoundButton
              icon="check"
              label={`${v.title}, listemden çıkar`}
              title="Listemden Çıkar"
              size="sm"
              variant="solid"
              aria-pressed
              className="ml-remove"
              onClick={() => onRemove(v, tctx)}
            />
          </li>
        )
      })}
    </ul>
  )
}
