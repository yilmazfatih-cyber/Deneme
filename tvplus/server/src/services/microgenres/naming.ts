/**
 * Mikro tür adı: sözlükteki hazır ifadeler `naming.order` sırasıyla dizilir, çekirdek türün çoğul adı sonda gelir.
 * Kod hiçbir ek üretmez; tüm Türkçe biçimler sözlükte hazırdır:
 *   "Uzay Keşfi Hakkında" + "Düşündürücü" + "Belgeseller"
 *   kişi yuvasında türün tamlama biçimi: "Buster Keaton" + "Komedileri" / "Komedi Filmleri"
 * Sıfat çiftinde önce "ek sıfatlar" yüzünün değeri, sonra ölçek niteleyicisi gelir ("Kült Karanlık …").
 */
import type { MicrogenreDefinition } from '../../../../shared/intelligence'
import { norm } from '../../../../shared/text'
import type { VocabIndex } from '../tagging/vocabulary'
import type { Quality } from './qualities'

export function genreNoun(index: VocabIndex, core: string, type: MicrogenreDefinition['type'], person: boolean): string {
  const n = index.vocabulary.naming.genreNouns[core]
  if (!n) return core
  if (type === 'MOVIE') return person ? (n.compoundMovie ?? n.movie) : n.movie
  if (type === 'SHOW') return person ? (n.compoundShow ?? n.show) : n.show
  return person ? (n.compound ?? n.mixed) : n.mixed
}

export function orderQualities(index: VocabIndex, quals: readonly Quality[]): Quality[] {
  const pos = (q: Quality) => index.slotOrder.get(q.slot) ?? 99
  return [...quals].sort((a, b) => pos(a) - pos(b) || a.rank - b.rank || a.id - b.id)
}

export function nameOf(
  index: VocabIndex,
  core: string,
  type: MicrogenreDefinition['type'],
  quals: readonly Quality[],
): string {
  const ordered = orderQualities(index, quals)
  const noun = genreNoun(index, core, type, ordered.some((q) => q.slot === 'PERSON'))
  return [...ordered.map((q) => q.phrase), noun].join(' ')
}

/** Adın kalıp sözcükleri: kök yinelemesi sayılmaz. */
const FRAME_WORDS = new Set([
  've',
  'icin',
  'hakkinda',
  'gecen',
  'uyarlanan',
  'anlatan',
  'filmler',
  'filmleri',
  'diziler',
  'dizileri',
  'yapimlar',
  'yapimlari',
  'yapimi',
  'programlar',
  'programlari',
])
const contentWords = (folded: string) => folded.split(' ').filter((w) => w.length >= 4 && !FRAME_WORDS.has(w))
/** İki sözcük aynı kökten mi: ilk min(5, uzunluklar) harf aynı ("tarihi" ~ "tarih", "aileyi" ~ "aile") */
const sameStem = (a: string, b: string) => {
  const n = Math.min(5, a.length, b.length)
  return a.slice(0, n) === b.slice(0, n)
}

/**
 * Bu çekirdek türle ada giremeyecek nitelik kimlikleri:
 *  - türün `implied` listesindekiler ("Komik Komediler" oluşmasın),
 *  - ifadesindeki bir sözcük tür adındaki bir sözcükle aynı kökten olanlar
 *    ("Müzik Tarihi Hakkında Tarih Yapımları", "Çocuk Kahramanlı Çocuk ve Aile Filmleri" oluşmasın).
 */
export function excludedForCore(index: VocabIndex, core: string, quals: readonly Quality[]): Set<number> {
  const n = index.vocabulary.naming.genreNouns[core]
  const out = new Set<number>()
  if (!n) return out
  const implied = new Set(n.implied ?? [])
  const nounWords = [...new Set([n.movie, n.show, n.mixed].flatMap((x) => contentWords(norm(x))))]
  for (const q of quals) {
    if (q.slot === 'PERSON') continue
    if (implied.has(`${q.slot}:${q.key}`) || contentWords(q.folded).some((w) => nounWords.some((u) => sameStem(w, u))))
      out.add(q.id)
  }
  return out
}
