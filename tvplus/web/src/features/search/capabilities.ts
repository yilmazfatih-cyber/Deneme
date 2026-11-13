/**
 * Arama yetenek bildirimi (Netflix Pinot `capabilitiesBySection`). TEK tablo hem sunucuya ne bildirdiğimizi
 * hem de neyi çizebildiğimizi belirler: bildirim bu tablodan kurulur, çizici de bu tablodaki adlarla aranır.
 * Çizici haritası (SearchPage.tsx) `Record<TreatmentName, …>` tipindedir: tabloya biçim eklenip çizici
 * yazılmazsa derleme kırılır — "bildirdiğim" ile "çizebildiğim" ayrışamaz.
 */

export type EntityKindName = 'VIDEO' | 'CHANNEL' | 'PROGRAM_AIRING' | 'PERSON' | 'GENERIC_CONTAINER'
export type SectionName = 'searchLive' | 'searchList' | 'searchGallery'

/** Bölüm tipi (__typename) → bildirimdeki bölüm adı */
export const SECTION_BY_TYPENAME: Record<string, SectionName> = {
  SearchLiveSection: 'searchLive',
  SearchListSection: 'searchList',
  SearchGallerySection: 'searchGallery',
}

export const TREATMENTS = {
  standardBoxshot: { kinds: ['VIDEO'], sections: ['searchGallery'] },
  standardSuggestion: { kinds: ['VIDEO'], sections: ['searchList'] },
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

const SECTION_ORDER: readonly SectionName[] = ['searchLive', 'searchList', 'searchGallery']

/**
 * Bildirimi kurar: yalnız açık türleri kapsayan biçimler, yalnız en az bir biçimi kalan bölümler.
 * Anahtar sırası sabittir (önbellek anahtarı bu nesneden türetilir).
 */
export function buildDeclaration(enabled: ReadonlySet<EntityKindName>): SearchPageCapabilities {
  const bySection: SearchPageCapabilities['capabilitiesBySection'] = {}
  for (const section of SECTION_ORDER) {
    const byTreatment: Partial<Record<TreatmentName, EntityTreatmentCapability>> = {}
    for (const name of TREATMENT_NAMES) {
      const t = TREATMENTS[name]
      if (!(t.sections as readonly SectionName[]).includes(section)) continue
      const kinds = (t.kinds as readonly EntityKindName[]).filter((k) => enabled.has(k))
      if (kinds.length) byTreatment[name] = { canHandleEntityKinds: kinds }
    }
    if (Object.keys(byTreatment).length) bySection[section] = { capabilitiesBySectionTreatment: { standard: { capabilitiesByEntityTreatment: byTreatment } } }
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
export function lookupTreatment(sectionTypename: string, treatment: string, declaration: SearchPageCapabilities): TreatmentName | null {
  const section = SECTION_BY_TYPENAME[sectionTypename]
  if (!section) return null
  if (!Object.prototype.hasOwnProperty.call(TREATMENTS, treatment)) return null
  const name = treatment as TreatmentName
  const declared = declaration.capabilitiesBySection[section]?.capabilitiesBySectionTreatment.standard.capabilitiesByEntityTreatment[name]
  return declared ? name : null
}

/* ───────────── Anahtar durumu (sessionStorage) ───────────── */

const STORAGE_KEY = 'tvp.search.kinds'

export function loadEnabledKinds(): Set<EntityKindName> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const list = JSON.parse(raw) as unknown
      if (Array.isArray(list)) return new Set(ALL_KINDS.filter((k) => list.includes(k)))
    }
  } catch {
    /* depolama yok ya da bozuk: varsayılan */
  }
  return new Set(ALL_KINDS)
}

export function saveEnabledKinds(kinds: ReadonlySet<EntityKindName>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ALL_KINDS.filter((k) => kinds.has(k))))
  } catch {
    /* depolama yok: yalnız bu sayfa ömrü boyunca geçerli */
  }
}
