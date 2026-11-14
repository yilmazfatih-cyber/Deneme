/**
 * Video sunum alanları — GraphQL çözümleyicileri ve Falcor yolları aynı hesapları kullanır:
 * rozet, kart altı süre metni, önizleme klibi, oynatma rozetleri, etiketler, RTÜK işaretleri, yer imi görünümü.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import {
  GENRES,
  MATURITY,
  MATURITY_REASONS,
  MOODS,
  PLAYBACK_BADGES,
  type PlaybackBadge,
} from '../../../../shared/taxonomy'
import { formatRuntime, stableId } from '../../../../shared/text'
import type { Passport } from '../../kernel/context'
import type { AccessDecision, Services } from '../../kernel/services'
import { DAY_MS, parseLocalDate } from '../epg/time'
import { sourceKindOf, sourceKindsOf, type SourceKindName } from './sourceKind'

export const NEW_WINDOW_DAYS = 30
export const LEAVING_BADGE_DAYS = 7
export const CREDITS_BEFORE_END_SEC = 45

export type BadgeKind = 'NEW' | 'NEW_EPISODE' | 'EXCLUSIVE' | 'LEAVING_SOON' | 'TOP10' | 'LIVE' | 'LOCKED'
export interface BadgeView {
  kind: BadgeKind
  text: string
}
export interface BookmarkView {
  positionSec: number
  runtimeSec: number | null
  lastModified: string
  progress: number
}
export interface PromoView {
  viewableId: string
  computeId: string
  offset: number
  sourceKind: SourceKindName
}

type Svc = Partial<Services>

/** Oynatılacak yaprak: film kendisi; dizi devam edilecek (profil yoksa ilk) bölüm; bölüm/ek video kendisi */
export function leafOf(services: Svc, guid: string | null, videoId: number): number | null {
  const vi = services.catalog?.videoInfo(videoId)
  if (!vi) return null
  if (vi.kind !== 'SHOW') return videoId
  const cur = guid ? (services.progress?.currentEpisode(guid, videoId) ?? null) : null
  return cur ?? services.catalog!.episodeIds(videoId)[0] ?? null
}

/** İçerik süresi, yoksa oynatıcının öğrendiği süre; dizi için null */
export function runtimeOf(services: Svc, videoId: number): number | null {
  const p = services.catalog?.getPlayable(videoId)
  if (!p) return null
  return p.runtimeSec ?? services.progress?.learnedRuntime(videoId) ?? null
}

export function bookmarkOf(services: Svc, guid: string | null, videoId: number): BookmarkView | null {
  if (!guid) return null
  const leaf = leafOf(services, guid, videoId)
  if (leaf === null) return null
  const bm = services.progress?.getBookmark(guid, leaf)
  if (!bm) return null
  const runtimeSec = runtimeOf(services, leaf) ?? bm.runtimeSec
  const progress = runtimeSec && runtimeSec > 0 ? Math.min(1, Math.max(0, bm.positionSec / runtimeSec)) : 0
  return { positionSec: bm.positionSec, runtimeSec, lastModified: bm.lastModified, progress }
}

/** "1 sa 28 dk" · "2 Sezon" · "12 Bölüm" · "S1 B3 · 22 dk" */
export function displayRuntimeOf(services: Svc, videoId: number): string {
  const vi = services.catalog?.videoInfo(videoId)
  if (!vi) return ''
  if (vi.kind === 'SHOW') {
    const seasons = vi.title.seasons.length
    return seasons > 1 ? `${seasons} Sezon` : `${services.catalog!.episodeIds(videoId).length} Bölüm`
  }
  const rt = formatRuntime(runtimeOf(services, videoId))
  if (vi.episode) {
    const label = `S${vi.episode.seasonNumber} B${vi.episode.data.number}`
    return rt ? `${label} · ${rt}` : label
  }
  return rt
}

export function sourceKindsOfVideo(services: Svc, videoId: number): SourceKindName[] {
  const catalog = services.catalog
  const vi = catalog?.videoInfo(videoId)
  if (!catalog || !vi) return []
  const leaves =
    vi.kind === 'SHOW' || vi.kind === 'MOVIE'
      ? catalog.listPlayables(videoId).filter((p) => p.kind !== 'SUPPLEMENTAL')
      : [catalog.getPlayable(videoId)]
  return sourceKindsOf(leaves.flatMap((p) => p?.sources ?? []))
}

export function playbackBadgesOf(services: Svc, videoId: number): PlaybackBadge[] {
  const leaf = leafOf(services, null, videoId)
  const p = leaf !== null ? services.catalog?.getPlayable(leaf) : null
  if (!p) return []
  const out = new Set<PlaybackBadge>()
  for (const k of sourceKindsOf(p.sources)) out.add(`SOURCE_${k}`)
  for (const s of p.sources) {
    if ('timedText' in s) {
      if (s.timedText.some((t) => t.kind === 'SUBTITLES')) out.add('TEXT_SUBTITLES')
      if (s.timedText.some((t) => t.kind === 'CC')) out.add('TEXT_CLOSED_CAPTIONS')
    }
    if (s.type === 'DASH' && s.extraAudioManifest) out.add('AUDIO_FIVE_DOT_ONE')
  }
  let info: ReturnType<NonNullable<Services['playback']>['cachedStreamInfo']> = null
  try {
    info = services.playback?.cachedStreamInfo?.(p.videoId) ?? null
  } catch {
    info = null
  }
  if (info) {
    if (info.maxHeight >= 1440) out.add('VIDEO_ULTRA_HD')
    if (info.maxHeight >= 720) out.add('VIDEO_HD')
    else if (info.maxHeight > 0) out.add('VIDEO_SD')
    if (info.has51) out.add('AUDIO_FIVE_DOT_ONE')
    if (info.textLanguages.length) out.add('TEXT_SUBTITLES')
  }
  return PLAYBACK_BADGES.filter((b) => out.has(b))
}

export function contentAdvisoryOf(t: ContentTitle) {
  const m = MATURITY[t.maturity.rating]
  return {
    certificationValue: m.certificationValue,
    maturityLevel: m.maturityLevel,
    boardName: 'RTÜK',
    reasons: t.maturity.reasons.map((r) => MATURITY_REASONS[r]),
  }
}

/** BOB: en çok 3 kısa etiket (önce duygu) · ODP: tüm ruh hali/nitelik + tür etiketleri */
export function textEvidenceOf(t: ContentTitle, uiContext: 'BOB' | 'ODP'): { key: string; text: string }[] {
  const moods = [...t.moods].sort((a, b) => Number(MOODS[b].isMood) - Number(MOODS[a].isMood))
  const all = [
    ...moods.map((m) => ({ key: `mood-${MOODS[m].id}`, text: MOODS[m].displayName })),
    ...t.genres.map((g) => ({ key: `genre-${GENRES[g].genreId}`, text: GENRES[g].name })),
  ]
  return uiContext === 'BOB' ? all.slice(0, 3) : all
}

export function moodTagsOf(t: ContentTitle) {
  return t.moods.map((m) => ({ id: MOODS[m].id, displayName: MOODS[m].displayName, isMood: MOODS[m].isMood }))
}

/** Önizleme klibi: yalnız oynatılabilir başlıkta. Ofset: promo.offsetSec, yoksa 60 (yalnız YouTube ise 30). */
export function promoVideoOf(services: Svc, videoId: number, access: AccessDecision): PromoView | null {
  if (access.state !== 'PLAYABLE') return null
  const catalog = services.catalog
  const vi = catalog?.videoInfo(videoId)
  if (!catalog || !vi) return null
  const first =
    vi.kind === 'MOVIE' || vi.kind === 'SHOW'
      ? catalog.listPlayables(videoId).find((p) => p.kind !== 'SUPPLEMENTAL')
      : catalog.getPlayable(videoId)
  if (!first || first.sources.length === 0) return null
  const kinds = sourceKindsOfVideo(services, videoId)
  const youtubeOnly = kinds.length > 0 && kinds.every((k) => k === 'YOUTUBE')
  const promo = vi.kind === 'SUPPLEMENTAL' ? null : vi.title.promo
  const offset = promo?.offsetSec ?? (youtubeOnly ? 30 : 60)
  return {
    viewableId: `Video:${first.videoId}`,
    computeId: `c${stableId(`promo|${first.videoId}|${offset}`).toString(16)}`,
    offset,
    sourceKind: sourceKindOf(promo?.source ?? first.sources[0]!),
  }
}

/** Kartın tek rozeti. Öncelik: LOCKED > LEAVING_SOON > NEW_EPISODE > NEW > EXCLUSIVE */
export function badgeOf(
  services: Svc,
  passport: Passport,
  videoId: number,
  access: AccessDecision,
  now: Date,
): BadgeView | null {
  if (access.state === 'UPSELL') return { kind: 'LOCKED', text: access.requiredProductName ?? 'Paket' }
  const vi = services.catalog?.videoInfo(videoId)
  if (!vi || (vi.kind !== 'MOVIE' && vi.kind !== 'SHOW')) return null
  const t = vi.title
  const leaving = parseLocalDate(t.availability.leavingAt)
  if (leaving && leaving.getTime() > now.getTime()) {
    const days = Math.ceil((leaving.getTime() - now.getTime()) / DAY_MS)
    if (days <= LEAVING_BADGE_DAYS) return { kind: 'LEAVING_SOON', text: `Son ${days} gün` }
  }
  const added = parseLocalDate(t.availability.addedAt)
  const isNew =
    !!added && added.getTime() <= now.getTime() && now.getTime() - added.getTime() <= NEW_WINDOW_DAYS * DAY_MS
  if (isNew) {
    const guid = passport.profile?.guid
    // Yaklaşım: bölüm düzeyinde eklenme tarihi yok; izlemeye başlanmış dizi yakında güncellendiyse "Yeni bölüm"
    if (
      vi.kind === 'SHOW' &&
      guid &&
      services.progress &&
      services.progress.watchStatus(guid, videoId) !== 'NEVER_WATCHED'
    ) {
      return { kind: 'NEW_EPISODE', text: 'Yeni bölüm' }
    }
    return { kind: 'NEW', text: 'Yeni' }
  }
  if (t.availability.exclusive) return { kind: 'EXCLUSIVE', text: "Sadece TV+'ta" }
  return null
}

/** Jenerik başlangıcı: süre biliniyorsa sondan 45 sn önce */
export function creditsOffsetOf(runtimeSec: number | null): number | null {
  return runtimeSec && runtimeSec > CREDITS_BEFORE_END_SEC ? runtimeSec - CREDITS_BEFORE_END_SEC : null
}

/** Dizide sıradaki bölüm (sezonlar arası); son bölümse null */
export function nextEpisodeOf(services: Svc, episodeId: number): number | null {
  const vi = services.catalog?.videoInfo(episodeId)
  if (!vi?.episode) return null
  return services.catalog!.episodeIds(vi.title.videoId)[vi.episode.index + 1] ?? null
}
