/**
 * Künyeden otomatik etiket önerisi (MODEL fişi). Eğitilmiş bir model değildir: başlığın kendi alanlarından
 * (türler, ruh hâli etiketleri, anahtar kelimeler, RTÜK işareti ve gerekçeleri, süre, çocuk işareti, köken dili)
 * belgelenmiş, deterministik kurallarla bir BAŞLANGIÇ fişi kurar. İnsan fişi ya da örnek fiş varsa kullanılmaz.
 *
 * Kurallar:
 *  1. İçerik uyarıları (ADVISORY ölçekleri). Başlığın RTÜK gerekçeleri arasında ölçeğin gerekçesi varsa, ölçek o
 *     işareti gerektiren EN DÜŞÜK seviyeye konur (sözlükteki `advisory.ratings`). Aynı gerekçeyi paylaşan ölçeklerden
 *     türünde/ruh hâlinde dayanak bulunmayanlar bir seviye aşağı iner (dayanak yoksa ilk ölçek tam seviyede kalır).
 *     İşaret GENEL ise tüm uyarı ölçekleri 0'dır. Gerekçesi yazılmamış ölçekler boş (değerlendirilmedi) kalır.
 *  2. Ton, anlatı ve biçim ölçekleri: aşağıdaki SCALE_RULES tablosu (aynı ölçeğe birden çok kural uyarsa en yükseği).
 *  3. Yüzler: FACET_RULES tablosu (anahtar kelimeler Türkçe harf duyarsız, tam sözcük olarak eşlenir) ve süre kuralları.
 *     Bir yüzde `max`tan fazla değer çıkarsa tablodaki ilk kurallar kalır.
 * Sözlükte bulunmayan anahtara yazan kural sessizce atlanır (sözlük değişince kod kırılmaz).
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import { norm } from '../../../../shared/text'
import type { TagSheet } from '../../../../shared/tagging-schema'
import { RATING_RANK, type VocabIndex } from './vocabulary'

interface TitleView {
  genres: Set<string>
  moods: Set<string>
  /** Düzleştirilmiş anahtar kelimeler, başta ve sonda boşlukla: " ay ussu " */
  keywords: string[]
  kids: boolean
  type: ContentTitle['type']
  runtimeSec: number | null
  rating: ContentTitle['maturity']['rating']
  reasons: Set<string>
}

const view = (t: ContentTitle): TitleView => ({
  genres: new Set(t.genres),
  moods: new Set(t.moods),
  keywords: t.keywords.map((k) => ` ${norm(k)} `),
  kids: t.kids,
  type: t.type,
  runtimeSec: t.runtimeSec,
  rating: t.maturity.rating,
  reasons: new Set(t.maturity.reasons),
})

const anyOf = (set: Set<string>, keys: readonly string[]) => keys.some((k) => set.has(k))
/** Anahtar kelimelerden biri verilen sözcük(ler)i tam sözcük olarak içeriyor mu */
const kw = (v: TitleView, terms: readonly string[]) => v.keywords.some((k) => terms.some((t) => k.includes(` ${t} `)))

const NONFICTION = ['belgesel', 'doga-bilim', 'teknoloji', 'haber', 'yasam', 'tarih'] as const
const isNonfiction = (v: TitleView) =>
  anyOf(v.genres, NONFICTION) && !anyOf(v.genres, ['dram', 'komedi', 'animasyon', 'bilim-kurgu', 'fantastik'])

/** Uyarı ölçeğinde "türünde/ruh hâlinde dayanak" (kural 1). */
const ADVISORY_EVIDENCE: Record<string, (v: TitleView) => boolean> = {
  siddet: (v) => anyOf(v.genres, ['aksiyon', 'suc', 'macera', 'gerilim', 'korku']),
  kan: (v) => anyOf(v.genres, ['aksiyon', 'suc']),
  korku: (v) => anyOf(v.genres, ['korku', 'gerilim']) || anyOf(v.moods, ['karanlik', 'gerilimli']),
  cinsellik: (v) => anyOf(v.genres, ['romantik', 'dram']),
  argo: (v) => anyOf(v.genres, ['komedi', 'suc', 'dram']),
  'madde-kullanimi': (v) => anyOf(v.genres, ['suc', 'dram']),
}

interface ScaleRule {
  scale: string
  value: number
  why: string
  when: (v: TitleView) => boolean
}

export const SCALE_RULES: readonly ScaleRule[] = [
  { scale: 'romantizm', value: 4, why: 'tür romantik', when: (v) => v.genres.has('romantik') },
  { scale: 'mizah', value: 4, why: 'tür komedi', when: (v) => v.genres.has('komedi') },
  {
    scale: 'mizah',
    value: 3,
    why: 'ruh hâli esprili/eğlenceli/absürt',
    when: (v) => anyOf(v.moods, ['esprili', 'eglenceli', 'absurt']),
  },
  { scale: 'gerilim', value: 4, why: 'tür gerilim', when: (v) => v.genres.has('gerilim') },
  { scale: 'gerilim', value: 3, why: 'tür korku', when: (v) => v.genres.has('korku') },
  {
    scale: 'gerilim',
    value: 3,
    why: 'ruh hâli gerilimli/heyecanlı',
    when: (v) => anyOf(v.moods, ['gerilimli', 'heyecanli']),
  },
  { scale: 'duygusallik', value: 4, why: 'ruh hâli duygusal', when: (v) => v.moods.has('duygusal') },
  { scale: 'duygusallik', value: 3, why: 'ruh hâli iç ısıtan', when: (v) => v.moods.has('ic-isitan') },
  { scale: 'karanlik-ton', value: 4, why: 'ruh hâli karanlık', when: (v) => v.moods.has('karanlik') },
  { scale: 'karanlik-ton', value: 3, why: 'tür korku', when: (v) => v.genres.has('korku') },
  { scale: 'tempo', value: 1, why: 'ruh hâli sakin', when: (v) => v.moods.has('sakin') },
  { scale: 'tempo', value: 4, why: 'ruh hâli heyecanlı', when: (v) => v.moods.has('heyecanli') },
  { scale: 'tempo', value: 4, why: 'tür aksiyon', when: (v) => v.genres.has('aksiyon') },
  { scale: 'karmasiklik', value: 4, why: 'ruh hâli düşündürücü', when: (v) => v.moods.has('dusundurucu') },
  { scale: 'gorsellik', value: 4, why: 'nitelik göz alıcı / 4K', when: (v) => anyOf(v.moods, ['goz-alici', '4k']) },
  {
    scale: 'ogreticilik',
    value: 4,
    why: 'tür doğa ve bilim / teknoloji',
    when: (v) => anyOf(v.genres, ['doga-bilim', 'teknoloji']),
  },
  { scale: 'ogreticilik', value: 3, why: 'tür belgesel / tarih', when: (v) => anyOf(v.genres, ['belgesel', 'tarih']) },
]

interface FacetRule {
  facet: string
  value: string
  why: string
  when: (v: TitleView) => boolean
}

const kwRule = (facet: string, value: string, terms: readonly string[], extra?: (v: TitleView) => boolean): FacetRule => ({
  facet,
  value,
  why: `anahtar kelime (${terms.slice(0, 3).join(', ')}${terms.length > 3 ? '…' : ''})`,
  when: (v) => kw(v, terms) && (!extra || extra(v)),
})
const moodRule = (facet: string, value: string, mood: string): FacetRule => ({
  facet,
  value,
  why: `ruh hâli ${mood}`,
  when: (v) => v.moods.has(mood),
})

export const FACET_RULES: readonly FacetRule[] = [
  /* biçim */
  { facet: 'bicim', value: 'sessiz', why: 'tür sessiz sinema', when: (v) => v.genres.has('sessiz-sinema') },
  kwRule('bicim', 'kamera-arkasi', ['yapim sureci', 'kamera arkasi']),
  kwRule('bicim', 'soylesi', ['soylesi', 'roportaj']),
  kwRule('bicim', 'mini-dizi', ['mini dizi'], (v) => v.type === 'SHOW'),
  {
    facet: 'bicim',
    value: 'kisa-film',
    why: 'film, 40 dk\'dan kısa ya da tür kısa film',
    when: (v) => v.type === 'MOVIE' && (v.genres.has('kisa-film') || (v.runtimeSec !== null && v.runtimeSec < 2400)),
  },
  {
    facet: 'bicim',
    value: 'orta-metraj',
    why: 'film, 40–59 dk',
    when: (v) => v.type === 'MOVIE' && !v.genres.has('kisa-film') && v.runtimeSec !== null && v.runtimeSec >= 2400 && v.runtimeSec < 3600,
  },
  {
    facet: 'bicim',
    value: 'uzun-metraj',
    why: 'film, 60 dk ve üzeri',
    when: (v) => v.type === 'MOVIE' && v.runtimeSec !== null && v.runtimeSec >= 3600,
  },
  { facet: 'bicim', value: 'belgesel-dizi', why: 'belgesel dizi', when: (v) => v.type === 'SHOW' && v.genres.has('belgesel') },
  { facet: 'bicim', value: 'belgesel-film', why: 'belgesel film', when: (v) => v.type === 'MOVIE' && v.genres.has('belgesel') },
  /* yaş grubu */
  { facet: 'yas-grubu', value: 'cocuk', why: 'çocuk işareti', when: (v) => v.kids },
  moodRule('yas-grubu', 'aile', 'aile-boyu'),
  { facet: 'yas-grubu', value: 'yetiskin', why: 'RTÜK 18+', when: (v) => v.rating === '18+' },
  /* kaynak */
  {
    facet: 'kaynak',
    value: 'gercek-olay',
    why: 'nitelik gerçek hikâye (kurgu yapım)',
    when: (v) => v.moods.has('gercek-hikaye') && !isNonfiction(v),
  },
  /* konu */
  kwRule('konu', 'uzay-kesfi', [
    'nasa',
    'artemis ii',
    'ay ussu',
    'ay inis araci',
    'uzay gorevi',
    'uzay yolculugu',
    'roket',
    'gezici arac',
    'gezegen savunmasi',
    'asteroit',
  ]),
  kwRule('konu', 'astronomi', ['evren', 'astronomi', 'kozmoloji', 'kara delik', 'teleskop', 'yildiz tozu']),
  kwRule('konu', 'fizik', ['fizik', 'ozel gorelilik', 'gorelilik']),
  kwRule('konu', 'zihin', ['hafiza', 'ogrenme', 'zihin', 'beyin', 'unutma', 'algi']),
  kwRule('konu', 'saglik', ['saglik', 'ilac', 'norobilim']),
  kwRule('konu', 'hayvanlar', ['hayvanlar', 'evcil hayvan', 'hayvan']),
  kwRule('konu', 'muhendislik', ['muhendislik', 'jet motoru']),
  kwRule('konu', 'yemek', ['yemek', 'mutfak', 'lezzet', 'yemek kulturu']),
  kwRule('konu', 'seyahat', ['seyahat', 'gezi']),
  kwRule('konu', 'muzik-tarihi', ['muzik tarihi', 'antik muzik', 'beste', 'nevbe']),
  kwRule('konu', 'arkeoloji', ['arkeoloji', 'antik miras', 'antik cag']),
  kwRule('konu', 'osmanli-tarihi', ['osmanli']),
  kwRule('konu', 'sinema', ['sinema tarihi', 'turk sinemasi', 'sinema']),
  kwRule('konu', 'edebiyat', ['edebiyat', 'turk edebiyati', 'yazar', 'kitap']),
  kwRule('konu', 'dayanisma', ['iyilik', 'dayanisma', 'gonulluluk']),
  kwRule('konu', 'kultur-mirasi', ['miras', 'kultur rotasi', 'kultur']),
  kwRule('konu', 'insan-hikayeleri', ['insan hikayeleri', 'portre']),
  kwRule('konu', 'egitim', ['egitim', 'egitim tarihi', 'sultani okullar']),
  kwRule('konu', 'sosyal-medya', ['sosyal medya']),
  kwRule('konu', 'aile', ['aile'], (v) => !v.kids),
  /* mekân */
  kwRule('mekan', 'kirsal', ['koy']),
  kwRule('mekan', 'anadolu', ['anadolu']),
  kwRule('mekan', 'karadeniz', ['karadeniz']),
  /* ek sıfatlar: ruh hâli ve nitelik etiketlerinin karşılığı */
  moodRule('ek-sifatlar', 'kult', 'kult-klasik'),
  moodRule('ek-sifatlar', 'odullu', 'odullu'),
  moodRule('ek-sifatlar', 'elestirmen', 'elestirmen-begenisi'),
  moodRule('ek-sifatlar', 'ic-isitan', 'ic-isitan'),
  moodRule('ek-sifatlar', 'nostaljik', 'nostaljik'),
  moodRule('ek-sifatlar', 'absurt', 'absurt'),
  moodRule('ek-sifatlar', 'ilham-verici', 'ilham'),
  moodRule('ek-sifatlar', 'dinlendirici', 'sakin'),
  moodRule('ek-sifatlar', 'diyalogsuz', 'sozsuz'),
  moodRule('ek-sifatlar', 'eglenceli', 'eglenceli'),
]

/**
 * Başlığın künyesinden MODEL fişi kurar. `taggedAt` yalnız üst bilgidir; değerler aynı künyeyle her seferinde aynıdır.
 */
export function suggestSheet(index: VocabIndex, title: ContentTitle, taggedAt: string): TagSheet {
  const v = view(title)
  const scales: Record<string, number | null> = {}
  for (const s of index.vocabulary.scales) scales[s.key] = null
  const why: string[] = []

  // 1. içerik uyarıları
  const byReason = new Map<string, string[]>()
  for (const s of index.vocabulary.scales)
    if (s.advisory) byReason.set(s.advisory.reason, [...(byReason.get(s.advisory.reason) ?? []), s.key])
  const rank = RATING_RANK[v.rating]
  for (const [reason, keys] of byReason) {
    if (v.rating === 'GENEL') {
      for (const k of keys) scales[k] = 0
      continue
    }
    if (!v.reasons.has(reason)) continue
    const evidence = keys.map((k) => ADVISORY_EVIDENCE[k]?.(v) ?? false)
    const anyEvidence = evidence.some(Boolean)
    keys.forEach((k, i) => {
      const s = index.scales.get(k)!
      const ratings = s.advisory!.ratings
      let level = ratings.findIndex((r) => RATING_RANK[r] >= rank)
      if (level < 0) level = ratings.length - 1
      const full = evidence[i] || (!anyEvidence && i === 0)
      scales[k] = full ? level : Math.max(0, level - 1)
    })
    why.push(`RTÜK ${v.rating} (${reason}) → uyarı ölçekleri`)
  }
  if (v.rating === 'GENEL') why.push('RTÜK GENEL → uyarı ölçekleri 0')

  // 2. ton, anlatı, biçim
  for (const r of SCALE_RULES) {
    if (!index.scales.has(r.scale) || !r.when(v)) continue
    const cur = scales[r.scale]
    if (cur === null || cur === undefined || r.value > cur) scales[r.scale] = r.value
    why.push(`${r.why} → ${r.scale} ${r.value}`)
  }

  // 3. yüzler
  const facets: Record<string, string[]> = {}
  for (const r of FACET_RULES) {
    const f = index.facets.get(r.facet)
    if (!f || !f.values.has(r.value) || !r.when(v)) continue
    const list = (facets[r.facet] ??= [])
    if (list.includes(r.value) || list.length >= f.facet.max) continue
    list.push(r.value)
    why.push(`${r.why} → ${r.facet}: ${r.value}`)
  }

  const notes = `Künyeden otomatik öneri; yalnız başlangıç noktasıdır. Dayanak: ${why.join('; ')}.`
  return {
    titleId: title.videoId,
    rubricVersion: index.vocabulary.version,
    source: 'MODEL',
    tagger: null,
    status: 'DRAFT',
    watched: false,
    taggedAt,
    scales,
    facets,
    notes: notes.length > 2000 ? `${notes.slice(0, 1997)}…` : notes,
  }
}
