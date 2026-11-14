/**
 * Dış içerik kimliğini katalogla eşler. Sıra eşleme dosyasından gelir (varsayılan):
 *   externalIds[<ad alanı>] → sayısal videoId (film, dizi, bölüm, ek video) → slug → normalleştirilmiş başlık adı.
 * Bölüm ve ek videolar üst başlığa (titleId) bağlanır; `videoId` oynatılan yaprağı tutar (dizi kimliği gelirse null).
 * Ad eşlemesinde iki başlık aynı ada iniyorsa o ad belirsiz sayılır ve eşlenmez.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { TitleMatchStep } from '../../../../shared/mixpanel-mapping'

export interface ResolvedTitle {
  titleId: number
  videoId: number | null
}

export interface TitleResolver {
  /** Kimliği verilen sırayla eşler; bulunamazsa null */
  resolve(value: string, order: readonly TitleMatchStep[], namespace: string): ResolvedTitle | null
  /** Yalnız ada göre eşleme (contentTitle özelliği) */
  resolveName(name: string): ResolvedTitle | null
  /** Sayısal videoId → üst başlık + yaprak */
  byVideoId(videoId: number): ResolvedTitle | null
}

/** Ad normalleştirme: Türkçe küçük harf, aksan/şapka silinir, harf-rakam dışı her şey tek boşluk. */
export function normalizeTitle(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const AMBIGUOUS: ResolvedTitle = { titleId: -1, videoId: null }

export function createTitleResolver(titles: readonly ContentTitle[]): TitleResolver {
  const byVid = new Map<number, ResolvedTitle>()
  const bySlug = new Map<string, ResolvedTitle>()
  const byName = new Map<string, ResolvedTitle>()
  const byExt = new Map<string, ResolvedTitle>()

  const addName = (name: string | undefined, r: ResolvedTitle) => {
    if (!name) return
    const k = normalizeTitle(name)
    if (!k) return
    const prev = byName.get(k)
    if (prev && prev.titleId !== r.titleId) byName.set(k, AMBIGUOUS)
    else if (!prev) byName.set(k, r)
  }

  for (const t of titles) {
    const self: ResolvedTitle = { titleId: t.videoId, videoId: t.type === 'MOVIE' ? t.videoId : null }
    byVid.set(t.videoId, self)
    bySlug.set(t.slug, self)
    addName(t.title, self)
    addName(t.originalTitle, self)
    for (const [ns, id] of Object.entries(t.externalIds ?? {})) byExt.set(`${ns}\u0000${id}`, self)
    for (const s of t.seasons)
      for (const e of s.episodes) byVid.set(e.videoId, { titleId: t.videoId, videoId: e.videoId })
    for (const s of t.supplementals) byVid.set(s.videoId, { titleId: t.videoId, videoId: s.videoId })
  }

  const ok = (r: ResolvedTitle | undefined): ResolvedTitle | null => (r && r !== AMBIGUOUS ? r : null)
  let cache = new Map<string, ResolvedTitle | null>()

  function lookup(value: string, step: TitleMatchStep, namespace: string): ResolvedTitle | null {
    switch (step) {
      case 'externalId':
        return ok(byExt.get(`${namespace}\u0000${value}`))
      case 'videoId':
        return /^\d{1,15}$/.test(value) ? ok(byVid.get(Number(value))) : null
      case 'slug':
        return ok(bySlug.get(value.toLowerCase()))
      case 'title':
        return ok(byName.get(normalizeTitle(value)))
    }
  }

  return {
    resolve(raw, order, namespace) {
      const value = raw.trim()
      if (!value) return null
      const key = `${namespace}\u0000${order.join(',')}\u0000${value}`
      const hit = cache.get(key)
      if (hit !== undefined) return hit
      let r: ResolvedTitle | null = null
      for (const step of order) {
        r = lookup(value, step, namespace)
        if (r) break
      }
      if (cache.size > 100_000) cache = new Map()
      cache.set(key, r)
      return r
    },
    resolveName: (name) => ok(byName.get(normalizeTitle(name))),
    byVideoId: (videoId) => ok(byVid.get(videoId)),
  }
}

/**
 * İlgi puanının referans süresi (sn): film için künye süresi; dizi için birkaç bölümlük süre
 * (ortalama bölüm süresi × min(3, bölüm sayısı)). Künyede süre yoksa olaylarda görülen süre, o da yoksa 30 dk.
 */
export const DEFAULT_REFERENCE_SEC = 1800
export const SERIES_REFERENCE_EPISODES = 3

export function referenceSeconds(title: ContentTitle | null, observed: (videoId: number) => number | null): number {
  if (!title) return DEFAULT_REFERENCE_SEC
  if (title.type === 'MOVIE') return title.runtimeSec ?? observed(title.videoId) ?? DEFAULT_REFERENCE_SEC
  const eps = title.seasons.flatMap((s) => s.episodes)
  const known = eps.map((e) => e.runtimeSec ?? observed(e.videoId)).filter((x): x is number => x !== null && x > 0)
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : DEFAULT_REFERENCE_SEC
  return avg * Math.max(1, Math.min(SERIES_REFERENCE_EPISODES, eps.length))
}
