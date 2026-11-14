/**
 * Arama yetenek bildirimi (Netflix Pinot `capabilitiesBySection`). TEK tablo hem sunucuya ne bildirdiğimizi
 * hem de neyi çizebildiğimizi belirler: bildirim bu tablodan kurulur, sayfa da yalnız bu tablodaki biçimleri çizer
 * (`lookupTreatment` bildirmediğimiz biçimi atlar).
 *
 * Tahmin modelinin bölümü (`searchPredicted`) ayrı bir anahtardır: kapalıyken sunucu tahmini bölüm üretmez —
 * eski istemciler ("tahmin" bilmeyenler) bozulmadan çalışır.
 */

export type EntityKindName = 'VIDEO' | 'CHANNEL' | 'PROGRAM_AIRING' | 'PERSON' | 'GENERIC_CONTAINER'
export type SectionName = 'searchLive' | 'searchList' | 'searchGallery' | 'searchPredicted'

/** Bölüm tipi (__typename) → bildirimdeki bölüm adı */
export const SECTION_BY_TYPENAME: Record<string, SectionName> = {
  SearchLiveSection: 'searchLive',
  SearchListSection: 'searchList',
  SearchGallerySection: 'searchGallery',
  SearchPredictedSection: 'searchPredicted',
}

/**
 * Çizebildiğimiz biçimler. Başlık öneri listesi (`standardSuggestion`) bildirilmez: Netflix'teki gibi başlıklar
 * yalnız ızgarada görünür, yazarken öneri işini modelin tamamlamaları yapar.
 */
export const TREATMENTS = {
  standardBoxshot: { kinds: ['VIDEO'], sections: ['searchGallery', 'searchPredicted'] },
  standardChannelTile: { kinds: ['CHANNEL'], sections: ['searchLive'] },
  standardAiringRow: { kinds: ['PROGRAM_AIRING'], sections: ['searchLive'] },
  standardPersonChip: { kinds: ['PERSON'], sections: ['searchList'] },
  standardDestination: { kinds: ['GENERIC_CONTAINER'], sections: ['searchList'] },
} as const satisfies Record<string, { kinds: readonly EntityKindName[]; sections: readonly SectionName[] }>

export type TreatmentName = keyof typeof TREATMENTS
export const TREATMENT_NAMES = Object.keys(TREATMENTS) as TreatmentName[]

/** Geliştirici denetimindeki anahtarlar: kullanıcıya görünen ad + kapsadığı varlık türü. */
export const KIND_SWITCHES: readonly { kind: EntityKindName; label: string }[] = [
  { kind: 'VIDEO', label: 'Video' },
  { kind: 'CHANNEL', label: 'Kanal' },
  { kind: 'PROGRAM_AIRING', label: 'Yayın' },
  { kind: 'PERSON', label: 'Kişi' },
  { kind: 'GENERIC_CONTAINER', label: 'Koleksiyon / Tür' },
]

export const ALL_KINDS: readonly EntityKindName[] = KIND_SWITCHES.map((s) => s.kind)

export interface CapabilityChoice {
  kinds: ReadonlySet<EntityKindName>
  /** Tahmin modelinin bölümü (`searchPredicted`) */
  predicted: boolean
}

export interface EntityTreatmentCapability {
  canHandleEntityKinds: EntityKindName[]
}
export type SearchPageCapabilities = {
  capabilitiesBySection: Partial<
    Record<
      SectionName,
      {
        capabilitiesBySectionTreatment: {
          standard: { capabilitiesByEntityTreatment: Partial<Record<TreatmentName, EntityTreatmentCapability>> }
        }
      }
    >
  >
}

const SECTION_ORDER: readonly SectionName[] = ['searchLive', 'searchList', 'searchGallery', 'searchPredicted']

/**
 * Bildirimi kurar: yalnız açık türleri kapsayan biçimler, yalnız en az bir biçimi kalan bölümler.
 * Anahtar sırası sabittir (önbellek anahtarı bu nesneden türetilir).
 */
export function buildDeclaration(choice: CapabilityChoice): SearchPageCapabilities {
  const bySection: SearchPageCapabilities['capabilitiesBySection'] = {}
  for (const section of SECTION_ORDER) {
    if (section === 'searchPredicted' && !choice.predicted) continue
    const byTreatment: Partial<Record<TreatmentName, EntityTreatmentCapability>> = {}
    for (const name of TREATMENT_NAMES) {
      const t = TREATMENTS[name]
      if (!(t.sections as readonly SectionName[]).includes(section)) continue
      const kinds = (t.kinds as readonly EntityKindName[]).filter((k) => choice.kinds.has(k))
      if (kinds.length) byTreatment[name] = { canHandleEntityKinds: kinds }
    }
    if (Object.keys(byTreatment).length)
      bySection[section] = {
        capabilitiesBySectionTreatment: { standard: { capabilitiesByEntityTreatment: byTreatment } },
      }
  }
  return { capabilitiesBySection: bySection }
}

/** Bildirimin kısa imzası (önbellek anahtarı ve tanılama için): "searchLive:standardChannelTile+…|…" */
export function declarationSignature(d: SearchPageCapabilities): string {
  return SECTION_ORDER.filter((s) => d.capabilitiesBySection[s])
    .map((s) => {
      const t = d.capabilitiesBySection[s]!.capabilitiesBySectionTreatment.standard.capabilitiesByEntityTreatment
      return `${s}:${TREATMENT_NAMES.filter((n) => t[n]).join('+')}`
    })
    .join('|')
}

/**
 * Çizici araması: yanıt bu bölümde bu biçimi verdiyse çizebilir miyiz?
 * Bilinmeyen biçim, bilinmeyen bölüm ya da bildirmediğimiz bir biçim → null (sessizce atlanır).
 */
export function lookupTreatment(
  sectionTypename: string,
  treatment: string,
  declaration: SearchPageCapabilities,
): TreatmentName | null {
  const section = SECTION_BY_TYPENAME[sectionTypename]
  if (!section) return null
  if (!Object.prototype.hasOwnProperty.call(TREATMENTS, treatment)) return null
  const name = treatment as TreatmentName
  const declared =
    declaration.capabilitiesBySection[section]?.capabilitiesBySectionTreatment.standard.capabilitiesByEntityTreatment[
      name
    ]
  return declared ? name : null
}

/* ───────────── Anahtar durumu (sessionStorage) ───────────── */

const STORAGE_KEY = 'tvp.search.caps.v2'

export const DEFAULT_CHOICE: CapabilityChoice = { kinds: new Set(ALL_KINDS), predicted: true }

export function loadChoice(): CapabilityChoice {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const v = JSON.parse(raw) as { kinds?: unknown; predicted?: unknown }
      if (Array.isArray(v.kinds))
        return {
          kinds: new Set(ALL_KINDS.filter((k) => (v.kinds as unknown[]).includes(k))),
          predicted: v.predicted !== false,
        }
    }
  } catch {
    /* depolama yok ya da bozuk: varsayılan */
  }
  return DEFAULT_CHOICE
}

export function saveChoice(c: CapabilityChoice): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ kinds: ALL_KINDS.filter((k) => c.kinds.has(k)), predicted: c.predicted }),
    )
  } catch {
    /* depolama yok: yalnız bu sayfa ömrü boyunca geçerli */
  }
}
