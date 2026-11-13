/**
 * Bugünün Top 10'u: puan = popülerlik + 25·ln(1 + son 24 saatteki oynatma) + günlük küçük kararlı titreşim.
 * Oynatma sayıları olay servisinden gelir (anahtar olaydaki videoId; bölümler üst başlığa toplanır).
 */
import { stableId } from '../../../../shared/text'
import type { ProfileRecord } from '../../kernel/context'
import type { Services } from '../../kernel/services'
import { dayKey } from '../epg/time'

export const TOP10_PLAY_WEIGHT = 25
export const TOP10_SIZE = 10

/** Gün + başlık için [0, 2) aralığında kararlı titreşim */
export const dailyJitter = (day: string, titleId: number) => (stableId(`top10|${day}|${titleId}`) % 1000) / 500

function playsByTitle(services: Partial<Services>): Map<number, number> {
  const out = new Map<number, number>()
  let counts: Map<number, number>
  try {
    counts = services.events?.playCounts(24) ?? new Map()
  } catch {
    counts = new Map()
  }
  for (const [videoId, n] of counts) {
    const titleId = services.catalog?.titleOf(videoId)?.videoId
    if (titleId !== undefined) out.set(titleId, (out.get(titleId) ?? 0) + n)
  }
  return out
}

/** Tüm başlıkların Top 10 sırası (süzgeçsiz), puan azalan */
export function top10Scores(services: Partial<Services>, now: Date): { titleId: number; score: number }[] {
  const catalog = services.catalog
  if (!catalog) return []
  const plays = playsByTitle(services)
  const day = dayKey(now)
  return catalog
    .allTitles()
    .map((t) => ({
      titleId: t.videoId,
      score: t.popularity + TOP10_PLAY_WEIGHT * Math.log(1 + (plays.get(t.videoId) ?? 0)) + dailyJitter(day, t.videoId),
    }))
    .sort((a, b) => b.score - a.score || a.titleId - b.titleId)
}

/** Bu profilin göreceği Top 10 (görünürlük süzgecinden sonra ilk 10) */
export function top10ForProfile(services: Partial<Services>, profile: ProfileRecord | null, now: Date): number[] {
  const catalog = services.catalog
  if (!catalog) return []
  return top10Scores(services, now)
    .filter((x) => catalog.isVisibleTo(profile, x.titleId))
    .slice(0, TOP10_SIZE)
    .map((x) => x.titleId)
}

/** 1–10 ya da null (yalnız film/dizi kimlikleri sıralanır) */
export function top10Rank(services: Partial<Services>, videoId: number, profile: ProfileRecord | null, now: Date, cached?: number[]): number | null {
  const list = cached ?? top10ForProfile(services, profile, now)
  const i = list.indexOf(videoId)
  return i >= 0 ? i + 1 : null
}
