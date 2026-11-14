/**
 * Mikro tür servisinin çekirdeği: üretimi tembel yapar ve önbellekte tutar. Etiketlerin `revision()` sayacı, sözlük
 * ya da katalog başlık listesi değişince ilk istekte yeniden üretir ve kendi `revision()` sayacını artırır.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { Microgenre, MicrogenreList, MicrogenreStats } from '../../../../shared/intelligence'
import type { MicrogenreSlot, TagVocabulary } from '../../../../shared/tagging-schema'
import { norm } from '../../../../shared/text'
import type { MicrogenreService, TaggingService } from '../../kernel/intelligence'
import { indexVocabulary } from '../tagging/vocabulary'
import { generateMicrogenres, type Generation } from './generate'
import { similarTitles, type SimilarTitle } from './similarity'

export const DEFAULT_MIN_TITLES = 2

export interface MicrogenreDeps {
  tagging: () => TaggingService
  titles: () => readonly ContentTitle[]
  minTitles?: number
  now?: () => Date
}

export interface ListQuery {
  core?: string
  slot?: MicrogenreSlot
  q?: string
  layer?: Microgenre['layer']
  minSize?: number
  first: number
  offset: number
}

export interface MicrogenreCore extends MicrogenreService {
  list(q: ListQuery): MicrogenreList
  /** Son üretim (gerekirse yeniden üretir) */
  generation(): Generation
}

export function createMicrogenreCore(deps: MicrogenreDeps): MicrogenreCore {
  const minTitles = deps.minTitles ?? DEFAULT_MIN_TITLES
  let state: {
    tagRev: number
    vocabulary: TagVocabulary
    titles: readonly ContentTitle[]
    count: number
    gen: Generation
  } | null = null
  let revision = 0
  let similarCache = new Map<number, SimilarTitle[]>()
  let foldedNames: Map<string, string> | null = null

  const current = (): Generation => {
    const tagging = deps.tagging()
    const titles = deps.titles()
    const tagRev = tagging.revision()
    const vocabulary = tagging.vocabulary()
    if (
      state &&
      state.tagRev === tagRev &&
      state.vocabulary === vocabulary &&
      state.titles === titles &&
      state.count === titles.length
    )
      return state.gen
    const gen = generateMicrogenres({
      index: indexVocabulary(vocabulary),
      titles: titles.map((title) => ({ title, tags: tagging.effective(title.videoId) })),
      minTitles,
      now: deps.now,
    })
    state = { tagRev, vocabulary, titles, count: titles.length, gen }
    revision++
    similarCache = new Map()
    foldedNames = null
    return gen
  }

  const stats = (): MicrogenreStats => current().stats

  return {
    generation: current,
    all: () => current().items,
    get: (id) => current().byId.get(id) ?? null,
    ofTitle: (titleId) => current().byTitle.get(titleId) ?? [],
    similarTitles(titleId, limit) {
      const gen = current()
      let hit = similarCache.get(titleId)
      if (!hit) similarCache.set(titleId, (hit = similarTitles(gen, titleId, 200)))
      return hit.slice(0, Math.max(0, limit))
    },
    stats,
    revision() {
      current()
      return revision
    },
    list(q) {
      const gen = current()
      const folded = (foldedNames ??= new Map(gen.items.map((m) => [m.id, norm(m.name)])))
      const needle = q.q ? norm(q.q) : ''
      const items = gen.items.filter(
        (m) =>
          (!q.core || m.definition.core === q.core) &&
          (!q.slot || m.definition.slots.some((s) => s.slot === q.slot)) &&
          (!q.layer || m.layer === q.layer) &&
          (q.minSize === undefined || m.size >= q.minSize) &&
          (!needle || folded.get(m.id)!.includes(needle)),
      )
      return { stats: gen.stats, total: items.length, items: items.slice(q.offset, q.offset + q.first) }
    },
  }
}
