/**
 * Yetenek pazarlığı (Netflix Pinot `capabilitiesBySection`). İstemci her bölüm ve her çizim biçimi için
 * hangi varlık türlerini çizebildiğini bildirir; sunucu yalnızca bildirilen bölümleri ve o bölümde
 * çizilebilen varlıkları döndürür. Böylece yeni bir tür eklemek eski istemciyi bozmaz.
 */
import type { SearchEntityKind, SearchPageCapabilitiesInput, SectionCapabilityName, TreatmentName } from './types'

/** Her çizim biçiminin çizdiği varlık türü. */
export const TREATMENT_KIND: Record<TreatmentName, SearchEntityKind> = {
  standardBoxshot: 'VIDEO',
  standardChannelTile: 'CHANNEL',
  standardAiringRow: 'PROGRAM_AIRING',
  standardPersonChip: 'PERSON',
  standardDestination: 'GENERIC_CONTAINER',
  standardSuggestion: 'VIDEO',
}

const TREATMENTS = Object.keys(TREATMENT_KIND) as TreatmentName[]
const SECTIONS: SectionCapabilityName[] = ['searchList', 'searchGallery', 'searchLive']

/** Bölüm adı → istemcinin o bölümde kullanabileceği çizim biçimleri. Bildirilmeyen bölüm haritada yoktur. */
export type NegotiatedCapabilities = Map<SectionCapabilityName, Set<TreatmentName>>

export function negotiateCapabilities(input: SearchPageCapabilitiesInput | null | undefined): NegotiatedCapabilities {
  const out: NegotiatedCapabilities = new Map()
  const bySection = input?.capabilitiesBySection
  if (!bySection) return out
  for (const section of SECTIONS) {
    const byTreatment = bySection[section]?.capabilitiesBySectionTreatment?.standard?.capabilitiesByEntityTreatment
    if (!byTreatment) continue
    const set = new Set<TreatmentName>()
    for (const t of TREATMENTS) {
      const kinds = byTreatment[t]?.canHandleEntityKinds
      if (kinds && kinds.includes(TREATMENT_KIND[t])) set.add(t)
    }
    out.set(section, set)
  }
  return out
}

export function canRender(
  caps: NegotiatedCapabilities,
  section: SectionCapabilityName,
  treatment: TreatmentName,
): boolean {
  return caps.get(section)?.has(treatment) ?? false
}

/** Bölüm bildirilmiş ve en az bir çizim biçimi kullanılabilir mi. */
export function hasSection(caps: NegotiatedCapabilities, section: SectionCapabilityName): boolean {
  return (caps.get(section)?.size ?? 0) > 0
}
