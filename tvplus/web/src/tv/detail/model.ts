/**
 * TV Detay ve Bölümler ekranlarının saf parçaları (DOM yok; birim testi model.test.ts):
 * birincil eylem durum makinesi, bilgi satırı, kalite rozetleri, bölümler ekranının başlangıç bölümü.
 */
import { videoEntityId } from '../../../../shared/tctx'

/* ───────────── Tel biçimleri (TvDetail / TvEpisodes sorguları) ───────────── */

export interface ArtworkData {
  url: string
}
export interface AccessData {
  state: string
  reasonText: string | null
  requiredProduct?: string | null
  requiredProductName?: string | null
  cta?: string | null
}
export interface BookmarkData {
  positionSec: number
  runtimeSec: number | null
  progress: number
}

export interface CardVideoData {
  __typename: 'Movie' | 'Show' | 'Episode' | 'Supplemental'
  videoId: number
  unifiedEntityId: string
  title: string
  shortSynopsis: string
  displayRuntime: string
  latestYear: number | null
  isPlayable: boolean
  top10Rank: number | null
  watchStatus: string
  access: AccessData
  badge: { kind: string; text: string } | null
  boxart: ArtworkData | null
  storyArt: ArtworkData | null
  contentAdvisory: { certificationValue: string; maturityLevel: number } | null
  bookmark: BookmarkData | null
}

export interface DetailVideoData extends CardVideoData {
  synopsis: string
  contextualSynopsis: string
  runtimeSec: number | null
  isInPlaylist: boolean
  thumbRating: string
  playbackBadges: string[]
  billboard: ArtworkData | null
  genreTags: { genreId: number; name: string }[]
  contentAdvisory: { certificationValue: string; maturityLevel: number; boardName: string; reasons: string[] }
  textEvidence: { key: string; text: string }[]
  promoVideo: { viewableId: string; offset: number; sourceKind: string } | null
  matchScore?: number | null
  seasonCount?: number
  cast?: { personId: number; name: string }[]
  directors?: { personId: number; name: string }[]
  creators?: { personId: number; name: string }[]
  currentEpisode?: {
    videoId: number
    numberLabel: string
    title: string
    runtimeSec: number | null
    bookmark: BookmarkData | null
  } | null
  similars?: CardVideoData[]
  supplementalVideos?: { videoId: number; title: string; subType: string; isPlayable: boolean }[]
  parentShow?: { videoId: number }
}

export interface EpisodeData {
  videoId: number
  unifiedEntityId: string
  title: string
  number: number
  seasonNumber: number
  numberLabel: string
  synopsis: string
  runtimeSec: number | null
  displayRuntime: string
  isPlayable: boolean
  access: AccessData
  bookmark: BookmarkData | null
  still: ArtworkData | null
}

export interface SeasonData {
  seasonId: string
  number: number
  numberLabel: string
  title: string | null
  episodes: EpisodeData[]
}

/* ───────────── Yardımcılar ───────────── */

export const isInProgress = (bm: BookmarkData | null | undefined): boolean =>
  !!bm && bm.positionSec > 0 && bm.progress < 0.95

/** Süre: 5280 → "1 sa 28 dk"; 2580 → "43 dk" */
export function durationText(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null
  const min = Math.max(1, Math.round(sec / 60))
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} dk`
  return m ? `${h} sa ${m} dk` : `${h} sa`
}

export function remainingText(bm: BookmarkData | null | undefined, runtimeSec?: number | null): string | null {
  const total = bm?.runtimeSec ?? runtimeSec ?? null
  if (!bm || !total || total <= bm.positionSec) return null
  return `${durationText(total - bm.positionSec)} kaldı`
}

/** "S1 B3" → "S1:B3" */
export const episodeLabel = (numberLabel: string): string => numberLabel.replace(/^S(\d+)\s*B(\d+)$/, 'S$1:B$2')

/** Oynatma rozetleri → kısa etiketler (tekrarsız, sabit sıra) */
export function qualityLabels(badges: readonly string[]): string[] {
  const out: string[] = []
  if (badges.includes('VIDEO_ULTRA_HD')) out.push('4K')
  else if (badges.includes('VIDEO_HD')) out.push('HD')
  if (badges.includes('AUDIO_FIVE_DOT_ONE')) out.push('5.1')
  if (badges.includes('TEXT_SUBTITLES') || badges.includes('TEXT_CLOSED_CAPTIONS')) out.push('Altyazı')
  return out
}

/* ───────────── Birincil eylem ───────────── */

export type PrimaryKind = 'resume' | 'play' | 'upsell' | 'unavailable'

export interface PrimaryAction {
  kind: PrimaryKind
  /** Düğme yazısı (UX_SPEC §6: Oynat · Devam Et · Paketi İncele · Benzerlerini Gör) */
  label: string
  /** Oynatılacak kimlik (dizide devam edilecek bölüm) */
  viewableId: string | null
  positionSec: number | null
  /** "Baştan Başlat" gösterilsin mi */
  startOver: boolean
  /** Düğmenin altındaki ilerleme satırı: "S1:B3 · Bölüm adı · 23 dk kaldı" */
  progressLine: string | null
  progress: number | null
  /** Oynatılamıyorsa sunucunun sakin açıklaması */
  accessText: string | null
}

/** Detay ekranının birincil eylemi (saf). */
export function primaryActionOf(v: DetailVideoData): PrimaryAction {
  const state = v.access.state
  if (state !== 'PLAYABLE') {
    const text =
      v.access.reasonText ?? (state === 'UPSELL' ? 'Bu başlık paketinde yok.' : 'Bu başlık şu an izlenemiyor.')
    return {
      kind: state === 'UPSELL' ? 'upsell' : 'unavailable',
      label: state === 'UPSELL' ? 'Paketi İncele' : 'Benzerlerini Gör',
      viewableId: null,
      positionSec: null,
      startOver: false,
      progressLine: null,
      progress: null,
      accessText: text,
    }
  }
  if (v.__typename === 'Show' && v.currentEpisode) {
    const ep = v.currentEpisode
    const resume = isInProgress(ep.bookmark)
    const started = resume || v.watchStatus === 'STARTED'
    return {
      kind: resume ? 'resume' : 'play',
      label: resume ? 'Devam Et' : 'Oynat',
      viewableId: videoEntityId(ep.videoId),
      positionSec: resume ? (ep.bookmark?.positionSec ?? null) : null,
      startOver: resume,
      progressLine: started
        ? [episodeLabel(ep.numberLabel), ep.title, resume ? remainingText(ep.bookmark, ep.runtimeSec) : null]
            .filter(Boolean)
            .join(' · ')
        : null,
      progress: resume ? (ep.bookmark?.progress ?? null) : null,
      accessText: null,
    }
  }
  const resume = isInProgress(v.bookmark)
  return {
    kind: resume ? 'resume' : 'play',
    label: resume ? 'Devam Et' : 'Oynat',
    viewableId: videoEntityId(v.videoId),
    positionSec: resume ? (v.bookmark?.positionSec ?? null) : null,
    startOver: resume,
    progressLine: resume ? remainingText(v.bookmark, v.runtimeSec) : null,
    progress: resume ? (v.bookmark?.progress ?? null) : null,
    accessText: null,
  }
}

/** Fragman: önce TRAILER, sonra TEASER ek videosu; yoksa tanıtım klibi. */
export function trailerOf(v: DetailVideoData): string | null {
  const supp = v.supplementalVideos ?? []
  const pick =
    supp.find((s) => s.subType === 'TRAILER' && s.isPlayable) ??
    supp.find((s) => s.subType === 'TEASER' && s.isPlayable)
  if (pick) return videoEntityId(pick.videoId)
  return null
}

/** Bilgi satırının parçaları (eşleşme ayrı, yeşil) */
export function detailMeta(v: DetailVideoData): { match: string | null; parts: string[]; maturity: string | null } {
  const runtime =
    v.__typename === 'Show'
      ? v.seasonCount
        ? `${v.seasonCount} Sezon`
        : null
      : (durationText(v.runtimeSec) ?? v.displayRuntime ?? null)
  return {
    match: typeof v.matchScore === 'number' ? `%${v.matchScore} Eşleşme` : null,
    parts: [v.latestYear ? String(v.latestYear) : null, runtime].filter((x): x is string => !!x),
    maturity: v.contentAdvisory?.certificationValue ?? null,
  }
}

/** "Oyuncular: A, B, C" (en çok 4 ad) */
export function castLine(v: DetailVideoData): string | null {
  const names = (v.cast ?? []).slice(0, 4).map((p) => p.name)
  if (names.length) return `Oyuncular: ${names.join(', ')}`
  const makers = (v.directors ?? v.creators ?? []).slice(0, 2).map((p) => p.name)
  if (makers.length) return `${v.__typename === 'Show' ? 'Yaratıcı' : 'Yönetmen'}: ${makers.join(', ')}`
  return null
}

/* ───────────── Bölümler ───────────── */

/** Bölümler ekranı açılınca: devam edilecek bölümün sezonu ve bölümü; yoksa ilk sezonun ilk bölümü. */
export function startEpisodeOf(
  seasons: readonly SeasonData[],
  currentEpisodeId: number | null | undefined,
): { seasonIndex: number; episodeId: number | null } {
  if (currentEpisodeId !== null && currentEpisodeId !== undefined) {
    for (let s = 0; s < seasons.length; s++) {
      if (seasons[s]!.episodes.some((e) => e.videoId === currentEpisodeId))
        return { seasonIndex: s, episodeId: currentEpisodeId }
    }
  }
  const first = seasons.findIndex((s) => s.episodes.length > 0)
  if (first < 0) return { seasonIndex: 0, episodeId: null }
  return { seasonIndex: first, episodeId: seasons[first]!.episodes[0]!.videoId }
}

/** Bölüm oynatma hedefi: yarım kaldıysa kaldığı yerden. */
export function episodePlay(ep: EpisodeData): { viewableId: string; positionSec: number | null } | null {
  if (!ep.isPlayable || ep.access.state !== 'PLAYABLE') return null
  return {
    viewableId: videoEntityId(ep.videoId),
    positionSec: isInProgress(ep.bookmark) ? ep.bookmark!.positionSec : null,
  }
}

/** Sezon düğmesinin yazısı: "Sezon 1" (sezon adı ayrı satırda) */
export const seasonLabel = (s: SeasonData): string => `Sezon ${s.number}`
