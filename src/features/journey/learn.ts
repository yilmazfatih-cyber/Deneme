import { content, symbolUrl, wordById, type Word } from '../../content'
import type { PersonalItem, Settings } from '../../db'
import { speak } from '../../lib/speech'
import { capitalizeTr, upperTr } from '../../lib/text'

/** Yolculukta çalışılan bir kelime (hazır içerik ya da kişisel kart). */
export interface LearnItem {
  id: string
  word: string
  label: string
  category: string
  symbol?: string
  photo?: Blob
  audio?: Blob
  audioPath?: string
  syllables: string[]
  cues: { semantic: string[]; sentence: string[]; firstSound: string }
  personal: boolean
}

export function firstSoundOf(word: string): string {
  return `${upperTr(word.charAt(0))}…`
}

/** Kişisel kartlarda hece bilgisi yok; kelimenin kendisi tek parça sayılır. */
function syllablesOf(word: string): string[] {
  return [word]
}

export function fromContentWord(w: Word, settings?: Pick<Settings, 'figure'>, replacement?: PersonalItem): LearnItem {
  const symbol = w.symbolVariants && settings ? w.symbolVariants[settings.figure] : w.symbol
  return {
    id: w.id,
    word: replacement?.word ?? w.word,
    label: capitalizeTr(replacement?.word ?? w.word),
    category: w.category,
    symbol: replacement?.photo ? undefined : symbolUrl(symbol),
    photo: replacement?.photo,
    audio: replacement?.audio,
    audioPath: w.audio,
    syllables: replacement && replacement.word !== w.word ? syllablesOf(replacement.word) : w.syllables,
    cues: {
      semantic: replacement?.semanticCue ? [replacement.semanticCue] : w.cues.semantic,
      sentence: replacement?.sentenceCue ? [replacement.sentenceCue] : w.cues.sentence,
      firstSound: replacement ? firstSoundOf(replacement.word) : w.cues.firstSound,
    },
    personal: !!replacement,
  }
}

export function fromPersonalItem(p: PersonalItem): LearnItem {
  return {
    id: p.id,
    word: p.word,
    label: capitalizeTr(p.word),
    category: p.category,
    photo: p.photo,
    audio: p.audio,
    syllables: syllablesOf(p.word),
    cues: {
      semantic: p.semanticCue ? [p.semanticCue] : [],
      sentence: p.sentenceCue?.includes('…') ? [p.sentenceCue] : [],
      firstSound: firstSoundOf(p.word),
    },
    personal: true,
  }
}

export function stopsInOrder(settings: Pick<Settings, 'stopOrder'>) {
  const stops = content.journey.stops
  if (!settings.stopOrder?.length) return stops
  const order = new Map(settings.stopOrder.map((id, i) => [id, i]))
  return [...stops].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
}

/**
 * Hedef kelimeler, öncelik sırasıyla:
 *  1. Panodan eklenen kelimeler ve kişisel kartlar (önce kişisel)
 *  2. Durakların kelimeleri, durak sırasıyla
 */
export function targetItems(settings: Settings, personal: PersonalItem[]): LearnItem[] {
  const replacements = new Map(personal.filter((p) => p.replacesId).map((p) => [p.replacesId!, p]))
  const personalById = new Map(personal.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const out: LearnItem[] = []
  const push = (item: LearnItem | undefined) => {
    if (item && !seen.has(item.id)) {
      seen.add(item.id)
      out.push(item)
    }
  }
  const resolve = (id: string): LearnItem | undefined => {
    const w = wordById.get(id)
    if (w) return fromContentWord(w, settings, replacements.get(id))
    const p = personalById.get(id)
    return p ? fromPersonalItem(p) : undefined
  }

  const stops = stopsInOrder(settings)
  const stopCategories = new Set(stops.flatMap((s) => s.personalCategories))
  for (const p of personal) {
    if (p.replacesId) push(resolve(p.replacesId))
    else if (stopCategories.has(p.category)) push(fromPersonalItem(p))
  }
  for (const id of settings.extraWords) push(resolve(id))
  for (const stop of stops) for (const id of stop.words) push(resolve(id))
  return out
}

export function stopOfWord(id: string): string | undefined {
  return content.journey.stops.find((s) => s.words.includes(id))?.id
}

/** Kelimeyi öncelik sırasıyla seslendirir: aile/kendi kaydı, hazır ses dosyası, cihaz sesi. */
export function speakItem(item: LearnItem): Promise<void> {
  return speak(item.word, { blob: item.audio, audioPath: item.audioPath })
}
