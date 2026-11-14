/**
 * Arama yanıtı → TV sonuç bölümleri (saf; birim testi results.test.ts). Sıra modelin sırasıdır: sunucunun bölüm
 * ve öğe sırası korunur; çizemediğimiz öğeler atlanır. Her öğe, geri bildirim için sayfadaki genel sırasını taşır.
 */

export interface SearchVideo {
  __typename: string
  videoId: number
  unifiedEntityId: string
  title: string
  access: { state: string; reasonText: string | null }
  badge: { kind: string; text: string } | null
  storyArt: { url: string } | null
  boxart: { url: string } | null
}

export interface SearchChannel {
  channelId: number
  unifiedEntityId: string
  name: string
  number: number
  logo: { url: string } | null
  now: { title: string; startAt: string; endAt: string } | null
}

export interface SearchEntityData {
  unifiedEntityId: string
  kind: string
  displayString: string
  treatment: string
  predicted: boolean
  score: number | null
  reason: string | null
  explain: { name: string; value: number; weight: number; contribution: number }[] | null
  track: { tctx: string }
  contextualArtwork: { url: string } | null
  video: SearchVideo | null
  channel: SearchChannel | null
}

export interface SearchSectionData {
  __typename: string
  id: string
  displayString: string
  entities: SearchEntityData[]
}

export interface SearchPageData {
  searchTerm: string
  requestId: string
  trackId: number
  isFallback: boolean
  modelVersion: string
  correction: { mode: string; originalTerm: string; correctedTerm: string } | null
  sections: SearchSectionData[]
}

export interface ResultItem {
  key: string
  entityId: string
  /** Sayfadaki genel sıra (geri bildirimdeki `position`) */
  position: number
  title: string
  imageUrl: string | null
  /** Tahminle gelen kartın altındaki gerekçe ("Sana özel", "Sintel ile ilgili") */
  reason: string | null
  predicted: boolean
  tctx: string
  locked: boolean
  badge: string | null
  target: { kind: 'video'; videoId: number } | { kind: 'channel'; channelId: number }
  live: boolean
  progress: number | null
  score: number | null
  explain: SearchEntityData['explain']
}

export interface ResultSection {
  id: string
  title: string
  predicted: boolean
  items: ResultItem[]
}

const PREDICTED_TYPENAME = 'SearchPredictedSection'

function progressOf(startAt: string, endAt: string, now: number): number | null {
  const s = Date.parse(startAt)
  const e = Date.parse(endAt)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null
  return Math.min(1, Math.max(0, (now - s) / (e - s)))
}

/** Yanıtı bölümlere çevirir; boş bölümler atılır. Tahmin bölümü her zaman en sonda ve kendi başlığıyla. */
export function toSections(page: SearchPageData, now = Date.now()): ResultSection[] {
  const out: ResultSection[] = []
  let position = 0
  const ordered = [
    ...page.sections.filter((s) => s.__typename !== PREDICTED_TYPENAME),
    ...page.sections.filter((s) => s.__typename === PREDICTED_TYPENAME),
  ]
  for (const sec of ordered) {
    const predictedSection = sec.__typename === PREDICTED_TYPENAME
    const items: ResultItem[] = []
    for (const e of sec.entities) {
      const pos = position++
      if (e.video && (e.video.__typename === 'Movie' || e.video.__typename === 'Show')) {
        const v = e.video
        const locked = v.access.state !== 'PLAYABLE'
        items.push({
          key: `${sec.id}:${e.unifiedEntityId}`,
          entityId: e.unifiedEntityId,
          position: pos,
          title: v.title,
          imageUrl: v.storyArt?.url ?? e.contextualArtwork?.url ?? v.boxart?.url ?? null,
          reason: e.predicted || predictedSection ? (e.reason ?? null) : null,
          predicted: e.predicted || predictedSection,
          tctx: e.track.tctx,
          locked,
          badge: !locked && v.badge && v.badge.kind !== 'LOCKED' && v.badge.kind !== 'TOP10' ? v.badge.text : null,
          target: { kind: 'video', videoId: v.videoId },
          live: false,
          progress: null,
          score: e.score,
          explain: e.explain,
        })
      } else if (e.channel) {
        const c = e.channel
        items.push({
          key: `${sec.id}:${e.unifiedEntityId}`,
          entityId: e.unifiedEntityId,
          position: pos,
          title: c.name,
          imageUrl: e.contextualArtwork?.url ?? c.logo?.url ?? null,
          reason: c.now?.title ?? null,
          predicted: false,
          tctx: e.track.tctx,
          locked: false,
          badge: null,
          target: { kind: 'channel', channelId: c.channelId },
          live: true,
          progress: c.now ? progressOf(c.now.startAt, c.now.endAt, now) : null,
          score: e.score,
          explain: e.explain,
        })
      }
    }
    if (items.length) out.push({ id: sec.id, title: sec.displayString, predicted: predictedSection, items })
  }
  return out
}

/** devbus `predict` "sıralama" olayının gövdesi: ilk 5 sonucun puanı ve bileşenleri. */
export function rankingDetail(page: SearchPageData): {
  term: string
  modelVersion: string
  top: { id: string; score: number | null; explain: SearchEntityData['explain'] }[]
} {
  const top = page.sections
    .flatMap((s) => s.entities)
    .slice(0, 5)
    .map((e) => ({ id: e.unifiedEntityId, score: e.score, explain: e.explain }))
  return { term: page.searchTerm, modelVersion: page.modelVersion, top }
}
