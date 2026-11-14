/**
 * Etiketleme servisinin çekirdeği (Fastify'dan bağımsız; testler doğrudan kurar).
 *
 * Fişler:
 *   insan (TAGGER) — sunucu deposunda; başlık başına birden çok etiketleyici; DRAFT → SUBMITTED → APPROVED
 *   örnek (SAMPLE) — content/tagging/sheets; başlık başına en çok bir tane
 *   model (MODEL)  — künyeden otomatik öneri (./suggest.ts); saklanmaz, istendiğinde kurulur
 * Geçerli etiketler: onaylı insan fişlerinin uzlaşısı → örnek fiş → model önerisi → boş.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { EffectiveTags, TaggingQueueItem, TitleTagging } from '../../../../shared/intelligence'
import type { TagSheet, TagVocabulary } from '../../../../shared/tagging-schema'
import { httpError } from '../../gateway/errors'
import type { TaggingService } from '../../kernel/intelligence'
import type { Store } from '../../kernel/store'
import { advisoryWarnings } from './advisory'
import { consensus } from './consensus'
import type { SheetInput } from './schemas'
import { suggestSheet } from './suggest'
import { checkSheetAgainstVocabulary, descriptorsOf, indexVocabulary, type VocabIndex } from './vocabulary'

export interface TaggingState {
  /** Yalnız insan fişleri (source: 'TAGGER') */
  sheets: TagSheet[]
}

export interface TaggingDeps {
  vocabulary: TagVocabulary
  sampleSheets: TagSheet[]
  store: Store<TaggingState>
  /** İstek anında katalog başlıkları (kayıt sırasında çağrılmaz) */
  titles: () => readonly ContentTitle[]
  getTitle: (titleId: number) => ContentTitle | null
  /** 'YYYY-MM-DD' */
  today: () => string
}

/** TaggingService + bu servisin kendi uçlarının kullandığı yöntemler. */
export interface TaggingCore extends TaggingService {
  index(): VocabIndex
  humanSheets(titleId: number): TagSheet[]
  sampleSheet(titleId: number): TagSheet | null
  modelSheet(titleId: number): TagSheet | null
  titleTagging(titleId: number): TitleTagging | null
  queue(): TaggingQueueItem[]
  putSheet(titleId: number, tagger: string, input: SheetInput): TagSheet
  approve(titleId: number, tagger: string): TagSheet
  remove(titleId: number, tagger: string): void
}

const BASIS_RANK: Record<EffectiveTags['basis'], number> = { NONE: 0, MODEL: 1, SAMPLE: 2, CONSENSUS: 3 }

export function createTaggingCore(deps: TaggingDeps): TaggingCore {
  const index = indexVocabulary(deps.vocabulary)
  const vocabulary = deps.vocabulary
  const samples = new Map<number, TagSheet>(deps.sampleSheets.map((s) => [s.titleId, s]))
  const bootDate = deps.today()
  let revision = 1
  const effectiveCache = new Map<number, EffectiveTags>()
  const modelCache = new WeakMap<ContentTitle, TagSheet>()

  const bump = () => {
    revision++
    effectiveCache.clear()
  }

  const humanSheets = (titleId: number): TagSheet[] =>
    deps.store
      .get()
      .sheets.filter((s) => s.titleId === titleId)
      .sort((a, b) => (a.tagger ?? '').localeCompare(b.tagger ?? ''))

  const modelSheet = (titleId: number): TagSheet | null => {
    const title = deps.getTitle(titleId)
    if (!title) return null
    let s = modelCache.get(title)
    if (!s) modelCache.set(title, (s = suggestSheet(index, title, bootDate)))
    return s
  }

  /** Fişten (örnek ya da model) geçerli etiket: yalnız sözlükte karşılığı olan anahtar ve değerler. */
  const fromSheet = (titleId: number, basis: 'SAMPLE' | 'MODEL', sheet: TagSheet): EffectiveTags => {
    const scales: Record<string, number> = {}
    for (const s of vocabulary.scales) {
      const v = sheet.scales[s.key]
      if (typeof v === 'number') scales[s.key] = v
    }
    const facets: Record<string, string[]> = {}
    for (const { facet, values } of index.facets.values()) {
      const vals = (sheet.facets[facet.key] ?? []).filter((v) => values.has(v)).slice(0, facet.max)
      if (vals.length) facets[facet.key] = vals
    }
    return {
      titleId,
      rubricVersion: vocabulary.version,
      basis,
      sheetCount: 0,
      agreement: null,
      scales,
      facets,
      descriptors: descriptorsOf(index, scales),
    }
  }

  const effective = (titleId: number): EffectiveTags => {
    const hit = effectiveCache.get(titleId)
    if (hit) return hit
    let out: EffectiveTags
    const approved = humanSheets(titleId).filter((s) => s.status === 'APPROVED')
    const sample = samples.get(titleId)
    if (approved.length > 0) {
      const c = consensus(index, approved)
      out = {
        titleId,
        rubricVersion: vocabulary.version,
        basis: 'CONSENSUS',
        sheetCount: approved.length,
        agreement: c.agreement,
        scales: c.scales,
        facets: c.facets,
        descriptors: descriptorsOf(index, c.scales),
      }
    } else if (sample) out = fromSheet(titleId, 'SAMPLE', sample)
    else {
      const model = modelSheet(titleId)
      out = model
        ? fromSheet(titleId, 'MODEL', model)
        : {
            titleId,
            rubricVersion: vocabulary.version,
            basis: 'NONE',
            sheetCount: 0,
            agreement: null,
            scales: {},
            facets: {},
            descriptors: [],
          }
    }
    effectiveCache.set(titleId, out)
    return out
  }

  const sheets = (titleId: number): TagSheet[] => {
    const out = humanSheets(titleId)
    const sample = samples.get(titleId)
    if (sample) out.push(sample)
    const model = modelSheet(titleId)
    if (model) out.push(model)
    return out
  }

  const requireTitle = (titleId: number): ContentTitle => {
    const t = deps.getTitle(titleId)
    if (!t) throw httpError(404, 'TITLE_NOT_FOUND', `${titleId} kimlikli başlık katalogda yok.`)
    return t
  }

  const findHuman = (titleId: number, tagger: string): TagSheet | undefined =>
    deps.store.get().sheets.find((s) => s.titleId === titleId && s.tagger === tagger)

  return {
    vocabulary: () => vocabulary,
    effective,
    sheets,
    revision: () => revision,
    index: () => index,
    humanSheets,
    sampleSheet: (titleId) => samples.get(titleId) ?? null,
    modelSheet,

    titleTagging(titleId) {
      const title = deps.getTitle(titleId)
      if (!title) return null
      const all = sheets(titleId)
      return {
        titleId,
        title: title.title,
        effective: effective(titleId),
        sheets: all,
        advisoryWarnings: advisoryWarnings(index, title, all),
      }
    },

    queue() {
      const items: TaggingQueueItem[] = deps.titles().map((t) => {
        const humans = humanSheets(t.videoId)
        return {
          titleId: t.videoId,
          title: t.title,
          type: t.type,
          basis: effective(t.videoId).basis,
          humanSheets: humans.length,
          pendingReview: humans.some((s) => s.status === 'SUBMITTED'),
        }
      })
      // Etiketsizler (model önerisi ya da hiçbiri) ve yalnız örnek fişi olanlar önce; aynı düzeyde onay bekleyen önce.
      return items.sort(
        (a, b) =>
          BASIS_RANK[a.basis] - BASIS_RANK[b.basis] ||
          Number(b.pendingReview) - Number(a.pendingReview) ||
          a.humanSheets - b.humanSheets ||
          a.title.localeCompare(b.title, 'tr'),
      )
    },

    putSheet(titleId, tagger, input) {
      requireTitle(titleId)
      const problems = checkSheetAgainstVocabulary(index, input)
      if (problems.length > 0) {
        const p = problems[0]!
        throw httpError(
          400,
          'INVALID_SHEET',
          `${p.path}: ${p.message}${problems.length > 1 ? ` (+${problems.length - 1} sorun daha)` : ''}`,
        )
      }
      const status = input.status ?? 'SUBMITTED'
      if (status === 'SUBMITTED' && !input.watched)
        throw httpError(
          400,
          'NOT_WATCHED',
          'Gönderilen fişte yapımın tamamı izlenmiş olmalı (watched: true); izlemeyi bitirmediyseniz taslak kaydedin.',
        )
      const scales: Record<string, number | null> = {}
      for (const s of vocabulary.scales) scales[s.key] = input.scales[s.key] ?? null
      const facets: Record<string, string[]> = {}
      for (const f of vocabulary.facets) {
        const vals = input.facets[f.key]
        if (vals && vals.length) facets[f.key] = [...vals]
      }
      const sheet: TagSheet = {
        titleId,
        rubricVersion: vocabulary.version,
        source: 'TAGGER',
        tagger,
        status,
        watched: input.watched,
        taggedAt: deps.today(),
        scales,
        facets,
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      }
      deps.store.update((s) => {
        s.sheets = s.sheets.filter((x) => !(x.titleId === titleId && x.tagger === tagger))
        s.sheets.push(sheet)
      })
      bump()
      return sheet
    },

    approve(titleId, tagger) {
      requireTitle(titleId)
      const sheet = findHuman(titleId, tagger)
      if (!sheet) throw httpError(404, 'SHEET_NOT_FOUND', `"${tagger}" için bu başlıkta fiş yok.`)
      if (sheet.status === 'APPROVED') return sheet
      if (sheet.status === 'DRAFT')
        throw httpError(409, 'SHEET_IS_DRAFT', 'Taslak fiş onaylanamaz; önce etiketleyici fişi göndermeli.')
      deps.store.update(() => {
        sheet.status = 'APPROVED'
      })
      bump()
      return sheet
    },

    remove(titleId, tagger) {
      requireTitle(titleId)
      if (!findHuman(titleId, tagger)) throw httpError(404, 'SHEET_NOT_FOUND', `"${tagger}" için bu başlıkta fiş yok.`)
      deps.store.update((s) => {
        s.sheets = s.sheets.filter((x) => !(x.titleId === titleId && x.tagger === tagger))
      })
      bump()
    },
  }
}
