/**
 * Detay görünüm modeli — sorgu yanıtından ekranın ihtiyaç duyduğu her şey (saf; DOM yok, birim testi model.test.ts).
 *   primaryActionOf   birincil eylem: Oynat / Devam Et (+ Baştan Başlat) / Paketi İncele / izlenemiyor
 *   metaOf            bilgi satırı: eşleşme, Yeni, yıl, süre ya da sezon, yaş işareti, kalite, Top 10
 *   episodeStateOf    sezon seçici + bölüm satırları (sıradaki bölüm, ilerleme, kalan süre, kilit)
 *   similarsOf        "Benzerleri": gerekçeli liste varsa o, yoksa düz benzerler
 *   accessNoticeOf    erişim durumu bildirimi (sunucunun metni ve çağrısı; kırmızı hata yok)
 *   aboutOf           "‹Başlık› Hakkında" satırları
 */
import { formatEpisodeCode, formatRuntime, formatSeasons, formatTimeLeft } from '../../ui/format'
import { playPath } from './links'
import type {
  AccessData,
  BookmarkData,
  CardVideoData,
  DetailVideo,
  EpisodeData,
  InsightsData,
  MicrogenreData,
  PersonRef,
  SeasonData,
  SimilarCardData,
} from './types'

/* ───────────── Küçük yardımcılar ───────────── */

/** Yarım kalmış mı? (başlamış, bitmemiş) */
export function isInProgress(bm: Pick<BookmarkData, 'positionSec' | 'progress'> | null | undefined): boolean {
  return !!bm && bm.positionSec > 0 && bm.progress < 0.95
}

/** Kalan süre metni ("23 dk kaldı"); bilinmiyorsa null. */
export function remainingOf(bm: BookmarkData | null | undefined, runtimeSec?: number | null): string | null {
  if (!bm) return null
  const total = runtimeSec ?? bm.runtimeSec ?? null
  if (!total || total <= 0) return null
  return formatTimeLeft(total - bm.positionSec) || null
}

/** Oynatma rozetleri → kısa etiketler (tekrarsız, sabit sıra): 4K/HD · 5.1 · Altyazı */
export function qualityLabels(badges: readonly string[]): string[] {
  const out: string[] = []
  const has = (b: string) => badges.includes(b)
  if (has('VIDEO_ULTRA_HD')) out.push('4K')
  else if (has('VIDEO_HD')) out.push('HD')
  if (has('AUDIO_FIVE_DOT_ONE')) out.push('5.1')
  if (has('TEXT_SUBTITLES') || has('TEXT_CLOSED_CAPTIONS')) out.push('Altyazı')
  return out
}

const SOURCE_LABELS: Record<string, string> = {
  OWN_CDN: "TV+ CDN'i",
  YOUTUBE: 'YouTube',
  PROGRESSIVE: 'Tek dosya',
}

/** Kaynak türleri (ya da SOURCE_* rozetleri) → okunur adlar. */
export function sourceLabels(kinds: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of kinds) {
    const label = SOURCE_LABELS[raw.startsWith('SOURCE_') ? raw.slice(7) : raw]
    if (label && !out.includes(label)) out.push(label)
  }
  return out
}

/** Kartın tek satırlık kilit metni ("Sinema Paketi ile izlenir"); oynatılabiliyorsa null. */
export function lockedTextOf(access: Pick<AccessData, 'state' | 'reasonText'> | null | undefined): string | null {
  if (!access || access.state === 'PLAYABLE') return null
  return access.reasonText ?? 'Paketinde yok'
}

/** Eşleşme yüzdesi geçerliyse 0–100 tamsayı, değilse null. */
export function matchOf(score: number | null | undefined): number | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null
  const n = Math.round(score)
  return n >= 0 && n <= 100 ? n : null
}

export const matchLabel = (n: number) => `%${n} Eşleşme`

/* ───────────── Birincil eylem ───────────── */

export interface DetailActionInput {
  typename: CardVideoData['__typename']
  videoId: number
  access: Pick<AccessData, 'state' | 'reasonText' | 'requiredProduct' | 'requiredProductName' | 'cta'>
  bookmark: BookmarkData | null
  runtimeSec: number | null
  currentEpisode?: {
    videoId: number
    number?: number
    seasonNumber?: number
    runtimeSec?: number | null
    bookmark: BookmarkData | null
  } | null
  tctx: string | null
}

interface PlayableAction {
  /** Oynatılacak video (dizide bölüm) */
  playVideoId: number
  to: string
  /** Dizide bölüm kodu "S1:B3"; filmde null */
  episodeCode: string | null
}

export type PrimaryAction =
  | (PlayableAction & { kind: 'play'; label: 'Oynat'; restartTo: null; progress: null; remaining: null })
  | (PlayableAction & {
      kind: 'resume'
      label: 'Devam Et'
      restartTo: string
      progress: number
      remaining: string | null
    })
  | { kind: 'upsell'; label: 'Paketi İncele'; productName: string | null; reasonText: string | null }
  | { kind: 'unavailable'; label: null; reasonText: string | null }

export function primaryActionOf(input: DetailActionInput): PrimaryAction {
  const { access } = input
  if (access.state === 'UPSELL') {
    return {
      kind: 'upsell',
      label: 'Paketi İncele',
      productName: access.requiredProductName ?? access.requiredProduct ?? null,
      reasonText: access.reasonText,
    }
  }
  if (access.state !== 'PLAYABLE') return { kind: 'unavailable', label: null, reasonText: access.reasonText }

  const isShow = input.typename === 'Show'
  const ep = isShow ? (input.currentEpisode ?? null) : null
  if (isShow && !ep) return { kind: 'unavailable', label: null, reasonText: 'Bu dizinin bölümü henüz yok' }
  const playVideoId = ep ? ep.videoId : input.videoId
  const bm = ep ? ep.bookmark : input.bookmark
  const runtime = ep ? (ep.runtimeSec ?? null) : input.runtimeSec
  const episodeCode = ep && ep.seasonNumber && ep.number ? formatEpisodeCode(ep.seasonNumber, ep.number) : null
  const to = playPath(playVideoId, input.tctx)

  if (bm && isInProgress(bm)) {
    return {
      kind: 'resume',
      label: 'Devam Et',
      playVideoId,
      to,
      episodeCode,
      restartTo: playPath(playVideoId, input.tctx, { fromStart: true }),
      progress: bm.progress,
      remaining: remainingOf(bm, runtime),
    }
  }
  return {
    kind: 'play',
    label: 'Oynat',
    playVideoId,
    to,
    episodeCode,
    restartTo: null,
    progress: null,
    remaining: null,
  }
}

/** Ham videodan eylem girdisi */
export function actionInputOf(video: DetailVideo, tctx: string | null): DetailActionInput {
  const ep = video.currentEpisode
  return {
    typename: video.__typename,
    videoId: video.videoId,
    access: video.access,
    bookmark: video.bookmark,
    runtimeSec: video.runtimeSec,
    currentEpisode: ep
      ? {
          videoId: ep.videoId,
          number: ep.number,
          seasonNumber: ep.seasonNumber,
          runtimeSec: ep.runtimeSec,
          bookmark: ep.bookmark,
        }
      : null,
    tctx,
  }
}

/* ───────────── Bilgi satırı ───────────── */

export interface DetailMeta {
  match: number | null
  isNew: boolean
  year: number | null
  /** "1 sa 28 dk" · "2 Sezon" · "3 Bölüm" */
  duration: string
  certification: string
  reasons: string[]
  quality: string[]
  top10: { rank: number; category: 'Filmlerde' | 'Dizilerde' } | null
}

export function metaOf(
  video: Pick<
    DetailVideo,
    | '__typename'
    | 'latestYear'
    | 'runtimeSec'
    | 'displayRuntime'
    | 'seasonCount'
    | 'episodeCount'
    | 'contentAdvisory'
    | 'playbackBadges'
    | 'badge'
    | 'top10Rank'
  >,
  matchScore?: number | null,
): DetailMeta {
  const isShow = video.__typename === 'Show'
  let duration = ''
  if (isShow) {
    duration =
      (video.seasonCount ?? 0) > 1 || !video.episodeCount
        ? formatSeasons(video.seasonCount)
        : `${video.episodeCount} Bölüm`
  } else {
    duration = formatRuntime(video.runtimeSec) || video.displayRuntime
  }
  const rank = video.top10Rank
  return {
    match: matchOf(matchScore),
    isNew: video.badge?.kind === 'NEW' || video.badge?.kind === 'NEW_EPISODE',
    year: video.latestYear,
    duration,
    certification: video.contentAdvisory.certificationValue,
    reasons: video.contentAdvisory.reasons ?? [],
    quality: qualityLabels(video.playbackBadges),
    top10: rank && rank >= 1 && rank <= 10 ? { rank, category: isShow ? 'Dizilerde' : 'Filmlerde' } : null,
  }
}

export interface MetaPart {
  kind: 'match' | 'new' | 'year' | 'cert' | 'duration' | 'quality'
  text: string
}

/** Mobil tek satır: "%92 Eşleşme · Yeni · 2010 · 13+ · 15 dk · HD" (yaş işareti ve HD kutu olarak çizilir). */
export function metaLineParts(meta: DetailMeta): MetaPart[] {
  const out: MetaPart[] = []
  if (meta.match !== null) out.push({ kind: 'match', text: matchLabel(meta.match) })
  if (meta.isNew) out.push({ kind: 'new', text: 'Yeni' })
  if (meta.year) out.push({ kind: 'year', text: String(meta.year) })
  if (meta.certification)
    out.push({ kind: 'cert', text: meta.certification === 'Genel İzleyici' ? 'Genel' : meta.certification })
  if (meta.duration) out.push({ kind: 'duration', text: meta.duration })
  const hd = meta.quality.find((q) => q === '4K' || q === 'HD')
  if (hd) out.push({ kind: 'quality', text: hd })
  return out
}

/* ───────────── Bölümler ───────────── */

export interface EpisodeRow {
  videoId: number
  number: number
  title: string
  synopsis: string
  runtime: string
  image: string | null
  progress: number | null
  remaining: string | null
  isCurrent: boolean
  playable: boolean
  lockedText: string | null
  code: string
}

export interface EpisodeState {
  seasons: { number: number; label: string; episodeCount: number }[]
  selected: number
  selectedLabel: string
  showPicker: boolean
  episodes: EpisodeRow[]
}

export const seasonLabel = (s: Pick<SeasonData, 'number' | 'title'>) => s.title || `Sezon ${s.number}`

export function episodeStateOf(
  seasons: readonly SeasonData[],
  current: Pick<EpisodeData, 'videoId' | 'seasonNumber'> | null | undefined,
  selectedSeason?: number | null,
): EpisodeState | null {
  if (!seasons.length) return null
  const fallback = seasons.find((s) => s.number === current?.seasonNumber) ?? seasons[0]!
  const season = seasons.find((s) => s.number === selectedSeason) ?? fallback
  return {
    seasons: seasons.map((s) => ({ number: s.number, label: seasonLabel(s), episodeCount: s.episodes.length })),
    selected: season.number,
    selectedLabel: seasonLabel(season),
    showPicker: seasons.length > 1,
    episodes: season.episodes.map((ep) => {
      const bm = ep.bookmark
      const started = !!bm && bm.positionSec > 0
      return {
        videoId: ep.videoId,
        number: ep.number,
        title: ep.title,
        synopsis: ep.synopsis && ep.synopsis !== ep.title ? ep.synopsis : ep.shortSynopsis || '',
        runtime: formatRuntime(ep.runtimeSec),
        image: ep.still?.url ?? ep.storyArt?.url ?? null,
        progress: started ? Math.min(1, Math.max(0, bm!.progress)) : null,
        remaining: started && isInProgress(bm) ? remainingOf(bm, ep.runtimeSec) : null,
        isCurrent: ep.videoId === current?.videoId,
        playable: ep.access.state === 'PLAYABLE',
        lockedText: lockedTextOf(ep.access),
        code: formatEpisodeCode(ep.seasonNumber, ep.number),
      }
    }),
  }
}

/* ───────────── Benzerleri ───────────── */

export interface SimilarItem {
  video: SimilarCardData
  reason: string | null
  match: number | null
}

/** Gerekçeli liste (görünmeyen katman) geldiyse o; yoksa düz benzerler. Başlığın kendisi listeden çıkar. */
export function similarsOf(
  videoId: number,
  plain: readonly SimilarCardData[] | null | undefined,
  insights: InsightsData['video'] | null | undefined,
): SimilarItem[] {
  const withReason = insights?.similarsWithReason ?? []
  const items: SimilarItem[] = withReason.length
    ? withReason.map((s) => ({ video: s.video, reason: s.reason ?? null, match: matchOf(s.video.matchScore) }))
    : (plain ?? []).map((v) => ({ video: v, reason: null, match: matchOf(v.matchScore) }))
  const seen = new Set<number>([videoId])
  return items.filter((s) => {
    if (seen.has(s.video.videoId)) return false
    seen.add(s.video.videoId)
    return true
  })
}

/* ───────────── Erişim bildirimi ───────────── */

export interface AccessNotice {
  state: AccessData['state']
  text: string
  /** Sunucunun çağrısı ("Paketi incele"); yoksa benzerlerine yönlendirilir */
  cta: string
  kind: 'upsell' | 'unavailable'
}

const DEFAULT_REASON: Record<string, string> = {
  UPSELL: 'Bu içerik ek paketle izlenir',
  OUT_OF_WINDOW: 'Bu içeriğin yayın süresi doldu',
  DEVICE_RESTRICTED: 'Bu içerik bu cihazda izlenemiyor',
  BLOCKED: 'Bu içerik şu an izlenemiyor',
}

export function accessNoticeOf(access: AccessData): AccessNotice | null {
  if (access.state === 'PLAYABLE') return null
  const upsell = access.state === 'UPSELL'
  return {
    state: access.state,
    text: access.reasonText || DEFAULT_REASON[access.state] || DEFAULT_REASON.BLOCKED!,
    cta: access.cta || (upsell ? 'Paketi İncele' : 'Benzerlerine Göz At'),
    kind: upsell ? 'upsell' : 'unavailable',
  }
}

/* ───────────── Kişiler ve hakkında ───────────── */

/** Kısa liste: ilk `max` kişi + daha fazlası var mı (sağ sütun "Oyuncular: A, B, C, daha fazlası"). */
export function shortList<T>(items: readonly T[] | null | undefined, max = 3): { shown: T[]; more: boolean } {
  const list = items ?? []
  return { shown: list.slice(0, max), more: list.length > max }
}

export interface AboutRow {
  label: string
  items: { text: string; to?: string; href?: string }[]
}

export function aboutOf(
  video: DetailVideo,
  microgenres: readonly MicrogenreData[] | null | undefined,
  links: {
    person: (id: number) => string
    genre: (id: number | string) => string
    collection: (id: number) => string
  },
): AboutRow[] {
  const people = (label: string, list: PersonRef[] | undefined): AboutRow | null =>
    list?.length ? { label, items: list.map((p) => ({ text: p.name, to: links.person(p.personId) })) } : null
  const rows: (AboutRow | null)[] = [
    people('Yönetmen', video.directors),
    people('Yaratıcılar', video.creators),
    people('Oyuncular', video.cast),
    video.genreTags.length
      ? { label: 'Türler', items: video.genreTags.map((g) => ({ text: g.name, to: links.genre(g.genreId) })) }
      : null,
    microgenres?.length
      ? {
          label: 'Kategoriler',
          items: microgenres.filter((m) => m.layer === 'VISIBLE').map((m) => ({ text: m.name, to: links.genre(m.id) })),
        }
      : null,
    video.moodTags.length ? { label: 'Bu içerik', items: video.moodTags.map((m) => ({ text: m.displayName })) } : null,
    video.collections?.length
      ? {
          label: 'Koleksiyonlar',
          items: video.collections.map((c) => ({ text: c.name, to: links.collection(c.collectionId) })),
        }
      : null,
  ]
  return rows.filter((r): r is AboutRow => !!r && r.items.length > 0)
}

/** Lisans ve kaynak satırı (örnek katalog için zorunlu). */
export function attributionOf(video: Pick<DetailVideo, 'license' | 'sourceKinds' | 'playbackBadges'>): {
  license: string | null
  url: string | null
  sources: string[]
} {
  const lic = video.license
  const license = lic ? [lic.name, lic.attribution].filter(Boolean).join(' · ') : null
  return {
    license,
    url: lic?.url ?? null,
    sources: sourceLabels([...video.sourceKinds, ...video.playbackBadges.filter((b) => b.startsWith('SOURCE_'))]),
  }
}
