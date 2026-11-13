/**
 * Yayın akışı (EPG). İki kaynak:
 *   · Şablon kanallar: content/epg.json'daki günlük şablon her gün aynı yerel saatlerde tekrar eder.
 *   · LINEAR kanallar: çalma listesindeki katalog videoları, sabit bir çapadan (2026-01-01 yerel gece yarısı)
 *     başlayarak süreleri boyunca kesintisiz döngüyle yayınlanır; konum duvar saatinden hesaplanır.
 * Akış bugünden 7 gün geri ile 2 gün ileri arasında üretilir (geri al penceresi + yaklaşan yayınlar).
 * Yayın kimliği: `${channelId}-${YYYYMMDD}-${HHMM}` (yerel başlangıç; aynı dakikada çakışırsa `-2`, `-3` eki).
 */
import type { ContentChannel } from '../../../../shared/content-schema'
import type { AiringRecord, EpgService, Services } from '../../kernel/services'
import { compactDate, compactTime, DAY_MS, dayNumberFromCompact, localDayNumber, localMidnight, parseLocalDate } from './time'

/** Geri al penceresi ve akış aralığı */
export const CATCHUP_DAYS = 7
export const PAST_DAYS = 7
export const FUTURE_DAYS = 2
/** LINEAR döngüsünün çapası: 2026-01-01 00:00 İstanbul */
export const LINEAR_ANCHOR = parseLocalDate('2026-01-01')!
/** Süresi bilinmeyen çalma listesi öğesi için varsayılan */
const DEFAULT_LINEAR_RUNTIME_SEC = 30 * 60

export interface EpgServiceImpl extends EpgService {
  /** Testler için saat değiştirme */
  setClock(clock: () => Date): void
}

interface LinearItem {
  videoId: number
  durationMs: number
  title: string
  synopsis: string
}

export function createEpgService(services: () => Partial<Services>, initialClock: () => Date = () => new Date()): EpgServiceImpl {
  let clock = initialClock
  /** gün önbelleği: `${channelId}:${dayNumber}:${imza}` → o gün BAŞLAYAN yayınlar */
  const dayCache = new Map<string, AiringRecord[]>()

  const catalog = () => services().catalog ?? null

  function linearItems(ch: ContentChannel): LinearItem[] {
    if (ch.source.type !== 'LINEAR') return []
    const cat = catalog()
    if (!cat) return []
    const items: LinearItem[] = []
    for (const id of ch.source.playlist) {
      const vi = cat.videoInfo(id)
      if (!vi) continue
      const leaves = vi.kind === 'SHOW' ? cat.episodeIds(id) : [id]
      for (const leaf of leaves) {
        const p = cat.getPlayable(leaf)
        if (!p) continue
        const sec = p.runtimeSec ?? services().progress?.learnedRuntime(leaf) ?? DEFAULT_LINEAR_RUNTIME_SEC
        const lv = cat.videoInfo(leaf)
        items.push({
          videoId: leaf,
          durationMs: Math.max(1, sec) * 1000,
          title: p.displayTitle,
          synopsis: lv?.episode?.data.synopsis ?? lv?.supplemental?.synopsis ?? lv?.title.shortSynopsis ?? '',
        })
      }
    }
    return items
  }

  /** Bir kanalın bir yerel günde başlayan yayınları (sıralı) */
  function dayAirings(ch: ContentChannel, day: number): AiringRecord[] {
    const linear = ch.source.type === 'LINEAR' ? linearItems(ch) : null
    const signature = linear ? linear.map((i) => `${i.videoId}/${i.durationMs}`).join(',') : 'tpl'
    const key = `${ch.channelId}:${day}:${signature}`
    const hit = dayCache.get(key)
    if (hit) return hit
    if (dayCache.size > 4000) dayCache.clear()

    const dayStart = localMidnight(day).getTime()
    const dayEnd = dayStart + DAY_MS
    const out: AiringRecord[] = []
    const used = new Map<string, number>()
    const makeId = (start: Date) => {
      const base = `${ch.channelId}-${compactDate(start)}-${compactTime(start)}`
      const n = (used.get(base) ?? 0) + 1
      used.set(base, n)
      return n === 1 ? base : `${base}-${n}`
    }

    if (linear) {
      const cycle = linear.reduce((s, i) => s + i.durationMs, 0)
      if (cycle > 0) {
        const anchor = LINEAR_ANCHOR.getTime()
        let t = anchor + Math.floor((dayStart - anchor) / cycle) * cycle
        let i = 0
        while (t < dayEnd) {
          const item = linear[i]!
          if (t >= dayStart) {
            const start = new Date(t)
            out.push({
              airingId: makeId(start),
              channelId: ch.channelId,
              title: item.title,
              synopsis: item.synopsis,
              kind: 'film',
              startAt: start,
              endAt: new Date(t + item.durationMs),
              videoId: item.videoId,
              isSample: false,
            })
          }
          t += item.durationMs
          i = (i + 1) % linear.length
        }
      }
    } else {
      const tpl = catalog()
        ?.epgTemplates()
        .find((x) => x.channelId === ch.channelId)
      if (tpl) {
        const programs = [...tpl.programs].sort((a, b) => a.start.localeCompare(b.start))
        for (const p of programs) {
          const [hh, mm] = p.start.split(':').map(Number) as [number, number]
          const start = new Date(dayStart + (hh * 60 + mm) * 60_000)
          out.push({
            airingId: makeId(start),
            channelId: ch.channelId,
            title: p.title,
            synopsis: p.synopsis,
            kind: p.kind,
            startAt: start,
            endAt: new Date(start.getTime() + p.durationMin * 60_000),
            videoId: p.videoId ?? null,
            isSample: tpl.isSample,
          })
        }
      }
    }
    dayCache.set(key, out)
    return out
  }

  /** Akış penceresindeki gün aralığı */
  const windowDays = () => {
    const today = localDayNumber(clock())
    return { first: today - PAST_DAYS, last: today + FUTURE_DAYS }
  }

  function airings(channelId: number, from: Date, to: Date): AiringRecord[] {
    const ch = catalog()?.getChannel(channelId)
    if (!ch || !(to.getTime() > from.getTime())) return []
    const w = windowDays()
    // Önceki gün başlayıp gece yarısını aşan yayınlar için bir gün geriden başla
    const firstDay = Math.max(w.first, localDayNumber(from) - 1)
    const lastDay = Math.min(w.last, localDayNumber(to))
    const out: AiringRecord[] = []
    for (let d = firstDay; d <= lastDay; d++) {
      for (const a of dayAirings(ch, d)) {
        if (a.startAt.getTime() < to.getTime() && a.endAt.getTime() > from.getTime()) out.push(a)
      }
    }
    return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
  }

  function currentAiring(channelId: number, at?: Date): AiringRecord | null {
    const t = at ?? clock()
    return airings(channelId, t, new Date(t.getTime() + 1)).find((a) => a.startAt <= t && a.endAt > t) ?? null
  }

  return {
    now: () => clock(),
    setClock(c) {
      clock = c
    },
    isLinear: (channelId) => catalog()?.getChannel(channelId)?.source.type === 'LINEAR',
    airings,
    currentAiring,
    getAiring(airingId: string): AiringRecord | null {
      const m = /^(\d+)-(\d{8})-(\d{4})(?:-\d+)?$/.exec(airingId)
      if (!m) return null
      const ch = catalog()?.getChannel(Number(m[1]))
      const day = dayNumberFromCompact(m[2]!)
      if (!ch || day === null) return null
      const w = windowDays()
      if (day < w.first || day > w.last) return null
      return dayAirings(ch, day).find((a) => a.airingId === airingId) ?? null
    },
    linearPosition(channelId: number, at?: Date) {
      const ch = catalog()?.getChannel(channelId)
      if (!ch || ch.source.type !== 'LINEAR') return null
      const t = at ?? clock()
      const airing = currentAiring(channelId, t)
      if (!airing || airing.videoId === null) return null
      return { airing, videoId: airing.videoId, offsetSec: Math.floor((t.getTime() - airing.startAt.getTime()) / 1000) }
    },
  }
}

/** Yayının canlı durumu (saat verilir) */
export function liveStateOf(a: AiringRecord, now: Date): 'UPCOMING' | 'LIVE' | 'ENDED' {
  if (now.getTime() < a.startAt.getTime()) return 'UPCOMING'
  if (now.getTime() < a.endAt.getTime()) return 'LIVE'
  return 'ENDED'
}

/** Baştan başlat / geri al uygunluğu: LINEAR kanal ya da katalog karşılığı olan yayın */
export function replayable(a: AiringRecord, isLinear: boolean): boolean {
  return isLinear || a.videoId !== null
}

export function catchupOf(a: AiringRecord, now: Date, isLinear: boolean): { available: boolean; until: Date | null } {
  if (!replayable(a, isLinear)) return { available: false, until: null }
  const until = new Date(a.endAt.getTime() + CATCHUP_DAYS * DAY_MS)
  const ended = a.endAt.getTime() <= now.getTime()
  return { available: ended && now.getTime() <= until.getTime(), until }
}
