/**
 * Göz atma sayfaları: koleksiyon (#/koleksiyon/:collectionId), kişi (#/kisi/:personId), tür (#/tur/:genreId).
 * Başlık + isteğe bağlı açıklama + duyarlı afiş ızgarası (afiş altında başlık + tek meta satırı), önizlemeli.
 * Bulunamayan kimlik sakin bir durum ve geri dönüş yolu gösterir. Dışa aktarım adları SABİT.
 */
import type { ReactElement } from 'react'
import { useParams } from 'react-router-dom'
import { useDocumentTitle } from '../../app'
import { useGql } from '../../api/hooks'
import { Button, EmptyHint, ErrorState, Page, PosterCard, Skeleton } from '../../design'
import { logEvent } from '../../telemetry/logger'
import { detailPath, joinMeta, localTctx, lockedTextOf, PreviewScope, PreviewTarget, useFreshAfterPlayback, type CardVideoData } from '../preview'
import './browse.css'

interface CollectionData {
  collection: { collectionId: number; name: string; description: string; videos: CardVideoData[] } | null
}
interface PersonData {
  person: { personId: number; name: string; videos: CardVideoData[] } | null
}
interface GenreData {
  genre: { genreId: number; name: string; videos: CardVideoData[] } | null
}

const idParam = (raw: string | undefined): number | null => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** #/koleksiyon/:collectionId */
export function CollectionPage(): ReactElement {
  const id = idParam(useParams().collectionId)
  const q = useGql<CollectionData, { collectionId: number }>('CollectionPage', { collectionId: id ?? 0 }, { enabled: id !== null, ttlMs: 5 * 60_000 })
  const c = q.data?.collection
  return (
    <BrowseView
      kind="koleksiyon"
      id={id}
      title={c?.name}
      description={c?.description}
      videos={c?.videos}
      notFound={id === null || (!!q.data && !c)}
      loading={q.loading}
      error={q.error}
      onRetry={q.refetch}
    />
  )
}

/** #/kisi/:personId */
export function PersonPage(): ReactElement {
  const id = idParam(useParams().personId)
  const q = useGql<PersonData, { personId: number }>('PersonPage', { personId: id ?? 0 }, { enabled: id !== null, ttlMs: 5 * 60_000 })
  const p = q.data?.person
  return (
    <BrowseView
      kind="kisi"
      id={id}
      title={p?.name}
      description={p ? 'Oynadığı ya da emeği geçen yapımlar' : undefined}
      videos={p?.videos}
      notFound={id === null || (!!q.data && !p)}
      loading={q.loading}
      error={q.error}
      onRetry={q.refetch}
    />
  )
}

/** #/tur/:genreId ("Çocuk" bağlantısı #/tur/783) */
export function GenrePage(): ReactElement {
  const id = idParam(useParams().genreId)
  const q = useGql<GenreData, { genreId: number }>('GenrePage', { genreId: id ?? 0 }, { enabled: id !== null, ttlMs: 5 * 60_000 })
  const g = q.data?.genre
  return (
    <BrowseView
      kind="tur"
      id={id}
      title={g?.name}
      videos={g?.videos}
      notFound={id === null || (!!q.data && !g)}
      loading={q.loading}
      error={q.error}
      onRetry={q.refetch}
    />
  )
}

interface BrowseViewProps {
  kind: 'koleksiyon' | 'kisi' | 'tur'
  id: number | null
  title?: string
  description?: string
  videos?: CardVideoData[]
  notFound: boolean
  loading: boolean
  error: Error | null
  onRetry: () => void
}

function BrowseView({ kind, id, title, description, videos, notFound, loading, error, onRetry }: BrowseViewProps): ReactElement {
  useFreshAfterPlayback()
  useDocumentTitle(title)
  if (notFound) {
    return (
      <Page title="Bu sayfa bulunamadı">
        <div className="cn-gutter-x br-notfound">
          <p className="cn-body">Aradığın liste kaldırılmış ya da bu profilde görünmüyor olabilir.</p>
          <Button to="/film-dizi" icon="home">
            Film &amp; Dizi'ye dön
          </Button>
        </div>
      </Page>
    )
  }
  if (!videos) {
    if (error && !loading) return <ErrorState size="page" title="Bu sayfa yüklenemedi" message="Bağlantını kontrol et ve tekrar dene." onRetry={onRetry} />
    return (
      <div className="cn-page" aria-busy="true">
        <span className="cn-gutter-x">
          <Skeleton variant="title" width={240} />
        </span>
        <div className="br-grid cn-gutter-x">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} variant="poster" />
          ))}
        </div>
      </div>
    )
  }
  const rowId = `${kind}_${id}`
  const ids = () => videos.map((v) => v.videoId)
  return (
    <PreviewScope>
      <Page title={title}>
        {description && <p className="cn-body cn-gutter-x br-desc">{description}</p>}
        {videos.length === 0 ? (
          <EmptyHint>Bu listede şu an izlenebilecek bir şey yok.</EmptyHint>
        ) : (
          <ul className="br-grid cn-gutter-x" aria-label={title}>
            {videos.map((v, i) => {
              const t = localTctx(rowId, i, v.videoId)
              const locked = lockedTextOf(v.access)
              return (
                <li key={v.videoId}>
                  <PreviewTarget info={{ rowId, videoId: v.videoId, getRowVideoIds: ids, tctx: t, title: v.title, imageUrl: v.storyArt?.url ?? v.boxart?.url }}>
                    <PosterCard
                      size="fill"
                      showTitle
                      title={v.title}
                      imageUrl={v.boxart?.url}
                      badge={!locked && v.badge && v.badge.kind !== 'LOCKED' ? v.badge.text : null}
                      lockedText={locked}
                      meta={joinMeta([v.latestYear, v.displayRuntime])}
                      to={detailPath(v.videoId, t)}
                      onClick={() => logEvent('click', { videoId: v.videoId, action: 'detail', from: rowId }, t)}
                    />
                  </PreviewTarget>
                </li>
              )
            })}
          </ul>
        )}
      </Page>
    </PreviewScope>
  )
}
