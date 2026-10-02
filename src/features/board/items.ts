import { categoryById, content, symbolUrl, type Word } from '../../content'
import type { Fitz } from '../../content/schema'
import { db, type PersonalItem, type Settings } from '../../db'
import { capitalizeTr, lowerTr } from '../../lib/text'

/** Panoda gösterilen tek bir kart: hazır içerik ya da bakım verenin eklediği kişisel kart. */
export interface BoardItem {
  /** Pano içi kimlik: içerik kelimesi kimliği ya da kişisel kart kimliği */
  id: string
  word: string
  label: string
  category: string
  fitz: Fitz
  symbol?: string
  photo?: Blob
  audio?: Blob
  audioPath?: string
  forms: Record<string, string>
  /** Hazır cümle satırında gösterilecek cümleler (kalıp biçimleri + serbest cümleler) */
  phrases: string[]
  personal: boolean
  /** Kişisel kart hazır bir kartın yerine geçtiyse onun kimliği */
  replaces?: string
}

export function fitzOf(categoryId: string): Fitz {
  const c = categoryById.get(categoryId)
  if (!c) return 'nesneler'
  return c.fitz
}

function uniq(list: string[]): string[] {
  return [...new Set(list)]
}

export function fromWord(w: Word, settings?: Pick<Settings, 'figure'>): BoardItem {
  const symbol = w.symbolVariants && settings ? w.symbolVariants[settings.figure] : w.symbol
  return {
    id: w.id,
    word: w.word,
    label: capitalizeTr(w.word),
    category: w.category,
    fitz: fitzOf(w.category),
    symbol: symbolUrl(symbol),
    audioPath: w.audio,
    forms: w.forms,
    phrases: uniq([...Object.values(w.forms), ...w.phrases]),
    personal: false,
  }
}

export function fromPersonal(p: PersonalItem, replaced?: Word, settings?: Pick<Settings, 'figure'>): BoardItem {
  const sameWord = replaced && lowerTr(replaced.word) === lowerTr(p.word)
  const base = replaced ? fromWord(replaced, settings) : undefined
  return {
    id: replaced ? replaced.id : p.id,
    word: p.word,
    label: capitalizeTr(p.word),
    category: replaced?.category ?? p.category,
    fitz: fitzOf(replaced?.category ?? p.category),
    symbol: p.photo ? undefined : base?.symbol,
    photo: p.photo,
    audio: p.audio,
    audioPath: sameWord ? base?.audioPath : undefined,
    forms: sameWord ? (replaced?.forms ?? {}) : {},
    phrases: uniq([...p.phrases, ...(sameWord && base ? base.phrases : [])]),
    personal: true,
    replaces: replaced?.id,
  }
}

/**
 * Bir bölümdeki kartlar. Önce kişisel kartlar (eklenme sırasıyla), sonra hazır içerik.
 * Yerine geçen kişisel kart, hazır kartın konumunda durur: kas hafızası bozulmaz.
 */
export function itemsInCategory(categoryId: string, personal: PersonalItem[], settings?: Settings): BoardItem[] {
  const replacements = new Map(personal.filter((p) => p.replacesId).map((p) => [p.replacesId!, p]))
  const own = personal
    .filter((p) => !p.replacesId && p.category === categoryId)
    .map((p) => fromPersonal(p, undefined, settings))
  const stock = content.words
    .filter((w) => w.category === categoryId)
    .map((w) => {
      const r = replacements.get(w.id)
      return r ? fromPersonal(r, w, settings) : fromWord(w, settings)
    })
  return [...own, ...stock]
}

export function allItems(personal: PersonalItem[], settings?: Settings): BoardItem[] {
  const replacements = new Map(personal.filter((p) => p.replacesId).map((p) => [p.replacesId!, p]))
  const own = personal.filter((p) => !p.replacesId).map((p) => fromPersonal(p, undefined, settings))
  const stock = content.words.map((w) => {
    const r = replacements.get(w.id)
    return r ? fromPersonal(r, w, settings) : fromWord(w, settings)
  })
  return [...own, ...stock]
}

export function findItem(id: string, personal: PersonalItem[], settings?: Settings): BoardItem | undefined {
  return allItems(personal, settings).find((i) => i.id === id)
}

export async function recordUsage(wordId: string): Promise<void> {
  await db.usageEvents.add({ wordId, at: Date.now() })
}

export const FREQUENT_WINDOW_DAYS = 30

/** Son 30 günde en sık seçilen kartlar (en çok kullanılan önce). */
export async function frequentIds(limit: number, now = Date.now()): Promise<{ id: string; count: number }[]> {
  const since = now - FREQUENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const events = await db.usageEvents.where('at').above(since).toArray()
  const counts = new Map<string, number>()
  for (const e of events) counts.set(e.wordId, (counts.get(e.wordId) ?? 0) + 1)
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, limit)
}

export function gridDims(settings: Pick<Settings, 'grid' | 'layout'>): { cols: number; rows: number } {
  const [c, r] = settings.grid.split('x').map(Number) as [number, number]
  if (settings.layout === 'single') return { cols: 1, rows: Math.min(r, 4) }
  if (settings.layout === 'left-half') return { cols: Math.min(c, 2), rows: r }
  return { cols: c, rows: r }
}
