/**
 * Göz atma sayfaları:
 *   Diziler / Filmler (#/goz-at/diziler, #/goz-at/filmler) — `lolomoByCategory` satırları, o kategorinin vitrini,
 *     masaüstünde başlık + "Türler ▾", mobilde seçili hap + "Tüm Kategoriler".
 *   Tür (#/tur/:id) — sayısal kimlik tür (`Query.genre`), `mg_` ile başlayan mikro tür (`Query.microgenre`).
 *   Koleksiyon (#/koleksiyon/:id) · Kişi (#/kisi/:id).
 * Izgaralar: başlık + duyarlı ızgara — masaüstünde 16:9 kart + önizleme kartı, mobilde 2:3 afiş.
 * Bulunamayan kimlik ya da henüz hazır olmayan mikro tür sakin bir durum gösterir. Dışa aktarım adları SABİT.
 */
import type { ReactElement } from 'react'
import { useParams } from 'react-router-dom'
import { useDocumentTitle, useShellOptions, useTitleHref } from '../../app'
import { useGql } from '../../api/hooks'
import { useFormFactor } from '../../lib/formFactor'
import { logEvent } from '../../telemetry/logger'
import { Badge, ButtonLink, EmptyState, ErrorState, PosterCard, Skeleton, SkeletonGrid, TitleCard } from '../../ui'
import { BrowsePills, CategoryHeader, LolomoPage } from '../home'
import { cardBadgeOf } from '../home/lolomo'
import {
  localTctx,
  lockedTextOf,
  PreviewScope,
  PreviewTarget,
  useFreshAfterPlayback,
  type CardVideoData,
} from '../preview'
import { gridIdOf } from './grid'
import './browse.css'

/* ───────────── Diziler / Filmler ───────────── */

export function CategoryPage({ category }: { category: 'shows' | 'movies' }): ReactElement {
  const title = category === 'shows' ? 'Diziler' : 'Filmler'
  useShellOptions({ fullBleed: true, mobileTitle: title })
  useDocumentTitle(title)
  return (
    <>
      <BrowsePills category={category} />
      <LolomoPage
        key={category}
        category={category}
        title={title}
        header={<CategoryHeader category={category} title={title} />}
      />
    </>
  )
}

/* ───────────── Izgara sayfaları ───────────── */

interface CollectionData {
  collection: { collectionId: number; name: string; description: string; videos: CardVideoData[] } | null
}
interface PersonData {
  person: { personId: number; name: string; videos: CardVideoData[] } | null
}
interface GenreData {
  genre: { genreId: number; name: string; videos: CardVideoData[] } | null
}
interface MicrogenreData {
  microgenre: { id: string; name: string; size: number; videos: CardVideoData[] } | null
}

const idParam = (raw: string | undefined): number | null => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** #/koleksiyon/:collectionId */
export function CollectionPage(): ReactElement {
  const id = idParam(useParams().collectionId)
  const q = useGql<CollectionData, { collectionId: number }>(
    'CollectionPage',
    { collectionId: id ?? 0 },
    { enabled: id !== null, ttlMs: 5 * 60_000 },
  )
  const c = q.data?.collection
  return (
    <GridView
      rowId={`koleksiyon_${id}`}
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
  const q = useGql<PersonData, { personId: number }>(
    'PersonPage',
    { personId: id ?? 0 },
    { enabled: id !== null, ttlMs: 5 * 60_000 },
  )
  const p = q.data?.person
  return (
    <GridView
      rowId={`kisi_${id}`}
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

/** #/tur/:genreId — sayısal kimlik tür, `mg_…` mikro tür. */
export function GenrePage(): ReactElement {
  const id = gridIdOf(useParams().genreId)
  return id.kind === 'microgenre' ? (
    <MicrogenreGrid id={id.id} />
  ) : (
    <GenreGrid id={id.kind === 'genre' ? id.id : null} />
  )
}

function GenreGrid({ id }: { id: number | null }): ReactElement {
  const q = useGql<GenreData, { genreId: number }>(
    'GenrePage',
    { genreId: id ?? 0 },
    { enabled: id !== null, ttlMs: 5 * 60_000 },
  )
  const g = q.data?.genre
  return (
    <GridView
      rowId={`tur_${id}`}
      title={g?.name}
      videos={g?.videos}
      notFound={id === null || (!!q.data && !g)}
      loading={q.loading}
      error={q.error}
      onRetry={q.refetch}
    />
  )
}

/**
 * Mikro tür: sunucu tarafı henüz hazır değilse (alan yok / hata) hata değil, sakin bir "yakında" durumu gösterilir.
 */
function MicrogenreGrid({ id }: { id: string }): ReactElement {
  const q = useGql<MicrogenreData, { id: string }>('MicrogenrePage', { id }, { ttlMs: 5 * 60_000 })
  const m = q.data?.microgenre
  // Sunucu alanı henüz yoksa / hata verirse "hazırlanıyor"; alan var ama kimlik yoksa "bulunamadı".
  const unavailable = !!q.error && !q.data
  return (
    <GridView
      rowId={`mt_${id}`}
      title={m?.name}
      videos={m?.videos}
      notFound={!!q.data && !m}
      unavailable={unavailable}
      loading={q.loading}
      error={null}
      onRetry={q.refetch}
    />
  )
}

interface GridViewProps {
  rowId: string
  title?: string
  description?: string
  videos?: CardVideoData[]
  notFound: boolean
  /** Sayfa var ama içeriği şu an gösterilemiyor (ör. mikro türler henüz hazır değil) */
  unavailable?: boolean
  loading: boolean
  error: Error | null
  onRetry: () => void
}

function GridView({
  rowId,
  title,
  description,
  videos,
  notFound,
  unavailable,
  loading,
  error,
  onRetry,
}: GridViewProps): ReactElement {
  useFreshAfterPlayback()
  useShellOptions({ mobileTitle: title ?? null })
  useDocumentTitle(title)
  const mobile = useFormFactor() === 'mobile'
  const href = useTitleHref()

  if (notFound || unavailable) {
    return (
      <div className="br-page">
        <EmptyState
          icon={notFound ? 'search' : 'grid'}
          title={notFound ? 'Bu sayfa bulunamadı' : 'Bu kategori hazırlanıyor'}
          message={
            notFound
              ? 'Aradığın liste kaldırılmış ya da bu profilde görünmüyor olabilir.'
              : 'Biraz sonra yeniden bak. Bu arada Ana Sayfa’daki satırlara göz atabilirsin.'
          }
          action={
            <ButtonLink variant="secondary" icon="home" to="/goz-at">
              Ana Sayfa
            </ButtonLink>
          }
        />
      </div>
    )
  }
  if (!videos) {
    if (error && !loading)
      return (
        <div className="br-page">
          <ErrorState
            size="page"
            title="Bu sayfa yüklenemedi"
            message="Bağlantını kontrol et ve tekrar dene."
            onRetry={onRetry}
          />
        </div>
      )
    return (
      <div className="br-page" aria-busy="true">
        <div className="ui-gutter br-head">
          <Skeleton variant="title" width={260} height={34} />
        </div>
        <SkeletonGrid count={mobile ? 12 : 18} className="br-skel" />
      </div>
    )
  }
  const ids = () => videos.map((v) => v.videoId)
  return (
    <PreviewScope>
      <div className="br-page">
        <header className="ui-gutter br-head">
          <h1 className="ui-page-title br-title">{title}</h1>
          {description && <p className="ui-body br-desc">{description}</p>}
        </header>
        {videos.length === 0 ? (
          <EmptyState
            icon="grid"
            title="Şu an burada izlenecek bir şey yok"
            message="Yeni başlıklar geldikçe burada görünecek."
          />
        ) : (
          <ul className={`ui-gutter br-grid${mobile ? ' br-grid--poster' : ''}`} aria-label={title}>
            {videos.map((v, i) => (
              <li key={v.videoId} className="br-grid__cell">
                <GridCard video={v} index={i} rowId={rowId} mobile={mobile} href={href} rowIds={ids} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PreviewScope>
  )
}

function GridCard({
  video: v,
  index,
  rowId,
  mobile,
  href,
  rowIds,
}: {
  video: CardVideoData
  index: number
  rowId: string
  mobile: boolean
  href: (id: number, tctx?: string | null) => string
  rowIds: () => number[]
}): ReactElement {
  const t = localTctx(rowId, index, v.videoId)
  const locked = lockedTextOf(v.access)
  const b = cardBadgeOf(v.badge, !!locked)
  const badge = b ? <Badge tone={b.tone}>{b.tone === 'lock' ? undefined : b.text}</Badge> : undefined
  const common = {
    title: v.title,
    badge,
    to: href(v.videoId, t),
    'aria-label': locked ? `${v.title}, ${locked}` : undefined,
    onClick: () => logEvent('click', { videoId: v.videoId, action: 'detail', from: rowId }, t),
  }
  if (mobile) return <PosterCard {...common} image={v.boxart?.url} />
  return (
    <PreviewTarget
      info={{
        rowId,
        videoId: v.videoId,
        getRowVideoIds: rowIds,
        tctx: t,
        title: v.title,
        imageUrl: v.storyArt?.url ?? v.boxart?.url,
      }}
    >
      <TitleCard {...common} image={v.storyArt?.url} />
    </PreviewTarget>
  )
}
