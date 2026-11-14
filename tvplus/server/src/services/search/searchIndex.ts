/**
 * Arama dizini: her aranabilir varlık için bir belge (VIDEO, CHANNEL, PROGRAM_AIRING, PERSON, koleksiyon ve tür).
 * Tüm metin `norm()` ile düzleştirilir; "Şahsiyet" ile "sahsiyet" aynı belgeye düşer.
 * Saf işlev: aynı külliyat → aynı dizin.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import { CHANNEL_CATEGORIES, GENRES, MOODS, type GenreKey } from '../../../../shared/taxonomy'
import {
  airingEntityId,
  channelEntityId,
  collectionEntityId,
  genreEntityId,
  personEntityId,
  videoEntityId,
} from '../../../../shared/tctx'
import { norm } from '../../../../shared/text'
import type { AiringRecord } from '../../kernel/services'
import type { SearchCorpus } from './types'

/**
 * Alan türü ve ağırlığı. Ad alanları tam puanla, ikincil alanlar (anahtar kelime, kişi, tür) düşük ağırlıkla sayılır.
 * `synopsis` yalnız tam kelime / kelime başı eşleşmesi verir ve sözlüğe (yazım düzeltmesine) girmez.
 */
export type FieldKind = 'name' | 'alt' | 'keyword' | 'person' | 'genre' | 'mood' | 'category' | 'number' | 'synopsis'

export const FIELD_WEIGHTS: Record<FieldKind, number> = {
  name: 1,
  alt: 0.9,
  keyword: 0.6,
  person: 0.6,
  genre: 0.5,
  mood: 0.45,
  category: 0.5,
  number: 0.9,
  synopsis: 0.25,
}

/** Başlık eşleşmesi sayılan alanlar (BOXART); diğerleri bağlamsal görsel (STORY_ART) ister. */
export const TITLE_FIELDS: ReadonlySet<FieldKind> = new Set<FieldKind>(['name', 'alt'])

export interface IndexedField {
  kind: FieldKind
  /** norm() uygulanmış metin */
  text: string
  /** text'in kelimeleri (synopsis'te tekilleştirilmiş) */
  words: string[]
}

export type DocType = 'video' | 'channel' | 'airing' | 'person' | 'collection' | 'genre'

export interface VideoMeta {
  type: 'MOVIE' | 'SHOW'
  year: number
  genreIds: number[]
  addedAt: string
  title: string
}

export interface SearchDoc {
  /** unifiedEntityId, ör. 'Video:80010001' */
  key: string
  type: DocType
  displayString: string
  popularity: number
  fields: IndexedField[]
  /** Görünürlük için bağlı üst başlıklar (kişi/koleksiyon/tür: herhangi biri görünürse belge görünür) */
  titleIds: number[]
  videoId?: number
  video?: VideoMeta
  channelId?: number
  channelKids?: boolean
  channelNumber?: number
  channelFavorite?: boolean
  airing?: AiringRecord
  personId?: number
  collectionId?: number
  genreId?: number
}

export interface Vocabulary {
  /** kelime → kaç belgede geçtiği (aday sıralamasında eşitlik bozucu) */
  words: Map<string, number>
  /** ilk harf → kelimeler (düzeltme adayları yalnız aynı ilk harften seçilir) */
  byFirst: Map<string, string[]>
  /** ad alanlarında yan yana geçen kelime çiftleri: "kanal d" (boşluk onarımı için) */
  bigrams: Set<string>
}

export interface SearchIndex {
  docs: SearchDoc[]
  vocab: Vocabulary
  builtAt: Date
}

function field(kind: FieldKind, raw: string): IndexedField | null {
  const text = norm(raw)
  if (!text) return null
  const words = text.split(' ')
  return { kind, text, words: kind === 'synopsis' ? [...new Set(words)] : words }
}

function fields(list: [FieldKind, string | null | undefined][]): IndexedField[] {
  const out: IndexedField[] = []
  for (const [kind, raw] of list) {
    if (!raw) continue
    const f = field(kind, raw)
    if (f) out.push(f)
  }
  return out
}

function videoDoc(t: ContentTitle): SearchDoc {
  const list: [FieldKind, string | null | undefined][] = [
    ['name', t.title],
    ['alt', t.originalTitle && norm(t.originalTitle) !== norm(t.title) ? t.originalTitle : null],
  ]
  for (const k of t.keywords) list.push(['keyword', k])
  for (const p of [...t.cast, ...t.directors, ...t.creators]) list.push(['person', p])
  for (const g of t.genres) list.push(['genre', GENRES[g].name])
  for (const m of t.moods) list.push(['mood', MOODS[m].displayName])
  list.push(['synopsis', `${t.shortSynopsis} ${t.synopsis}`])
  return {
    key: videoEntityId(t.videoId),
    type: 'video',
    displayString: t.title,
    popularity: t.popularity,
    fields: fields(list),
    titleIds: [t.videoId],
    videoId: t.videoId,
    video: {
      type: t.type,
      year: t.year,
      genreIds: t.genres.map((g) => GENRES[g].genreId),
      addedAt: t.availability.addedAt,
      title: t.title,
    },
  }
}

/** Külliyattan dizini kurar. */
export function buildSearchIndex(corpus: SearchCorpus, now: Date = new Date()): SearchIndex {
  const docs: SearchDoc[] = []
  const popById = new Map<number, number>()
  for (const t of corpus.titles) {
    popById.set(t.videoId, t.popularity)
    docs.push(videoDoc(t))
  }
  const maxPop = (ids: number[]) => ids.reduce((m, id) => Math.max(m, popById.get(id) ?? 0), 0)

  for (const c of corpus.channels) {
    docs.push({
      key: channelEntityId(c.channelId),
      type: 'channel',
      displayString: c.name,
      // Kanallar arasında: favori ("Kanallarım") önde, sonra küçük kumanda numarası.
      popularity: 50 + (c.favorite ? 10 : 0) - Math.min(c.number, 999) / 1000,
      fields: fields([
        ['name', c.name],
        ['number', String(c.number)],
        ['category', CHANNEL_CATEGORIES[c.category]],
        ['synopsis', c.description],
      ]),
      titleIds: [],
      channelId: c.channelId,
      channelKids: c.kids,
      channelNumber: c.number,
      channelFavorite: c.favorite,
    })
  }

  const channelById = new Map(corpus.channels.map((c) => [c.channelId, c]))
  for (const a of corpus.airings) {
    const ch = channelById.get(a.channelId)
    if (!ch) continue
    docs.push({
      key: airingEntityId(a.airingId),
      type: 'airing',
      displayString: a.title,
      popularity: 50 + (ch.favorite ? 10 : 0),
      fields: fields([
        ['name', a.title],
        ['synopsis', a.synopsis],
      ]),
      titleIds: a.videoId ? [a.videoId] : [],
      channelId: a.channelId,
      channelKids: ch.kids,
      airing: a,
    })
  }

  for (const p of corpus.people) {
    docs.push({
      key: personEntityId(p.personId),
      type: 'person',
      displayString: p.name,
      popularity: maxPop(p.videoIds),
      fields: fields([['name', p.name]]),
      titleIds: p.videoIds,
      personId: p.personId,
    })
  }

  for (const c of corpus.collections) {
    docs.push({
      key: collectionEntityId(c.collectionId),
      type: 'collection',
      displayString: c.name,
      popularity: maxPop(c.videoIds),
      fields: fields([
        ['name', c.name],
        ['synopsis', c.description],
      ]),
      titleIds: c.videoIds,
      collectionId: c.collectionId,
    })
  }

  for (const key of Object.keys(GENRES) as GenreKey[]) {
    const g = GENRES[key]
    const ids = corpus.titles.filter((t) => t.genres.includes(key)).map((t) => t.videoId)
    if (ids.length === 0) continue
    docs.push({
      key: genreEntityId(g.genreId),
      type: 'genre',
      displayString: g.name,
      popularity: maxPop(ids),
      fields: fields([['name', g.name]]),
      titleIds: ids,
      genreId: g.genreId,
    })
  }

  return { docs, vocab: buildVocabulary(docs), builtAt: now }
}

const BIGRAM_FIELDS: ReadonlySet<FieldKind> = new Set<FieldKind>(['name', 'alt', 'keyword', 'person'])

export function buildVocabulary(docs: SearchDoc[]): Vocabulary {
  const words = new Map<string, number>()
  const bigrams = new Set<string>()
  for (const d of docs) {
    const seen = new Set<string>()
    for (const f of d.fields) {
      if (f.kind === 'synopsis' || f.kind === 'number') continue
      for (const w of f.words) seen.add(w)
      if (BIGRAM_FIELDS.has(f.kind))
        for (let i = 1; i < f.words.length; i++) bigrams.add(`${f.words[i - 1]} ${f.words[i]}`)
    }
    for (const w of seen) words.set(w, (words.get(w) ?? 0) + 1)
  }
  const byFirst = new Map<string, string[]>()
  for (const w of words.keys()) {
    const first = w[0]
    if (!first) continue
    const list = byFirst.get(first)
    if (list) list.push(w)
    else byFirst.set(first, [w])
  }
  return { words, byFirst, bigrams }
}
