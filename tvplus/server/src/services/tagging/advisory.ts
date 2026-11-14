/**
 * RTÜK denetimi: bir fişteki içerik uyarısı seviyesi, başlığın taşıdığı işaretten daha yükseğini ya da başlıkta
 * yazılmamış bir gerekçeyi gerektiriyorsa uyarı üretir. Karar vermez; işareti değiştirmek içerik ekibinin işidir.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import { MATURITY_REASONS } from '../../../../shared/taxonomy'
import type { TagSheet } from '../../../../shared/tagging-schema'
import { RATING_RANK, type VocabIndex } from './vocabulary'

export function advisoryWarnings(index: VocabIndex, title: ContentTitle, sheets: TagSheet[]): string[] {
  const out: string[] = []
  const titleRank = RATING_RANK[title.maturity.rating]
  for (const sheet of sheets) {
    if (sheet.source === 'MODEL') continue
    const who = sheet.tagger ? `"${sheet.tagger}" fişi` : sheet.source === 'SAMPLE' ? 'Örnek fiş' : 'Fiş'
    for (const s of index.vocabulary.scales) {
      const v = sheet.scales[s.key]
      if (!s.advisory || typeof v !== 'number') continue
      const implied = s.advisory.ratings[v]
      if (!implied) continue
      const label = s.levels[v]?.label ?? String(v)
      if (RATING_RANK[implied] > titleRank)
        out.push(
          `${who}: ${s.name} ${v} ("${label}") en az ${implied} işaretini gerektiriyor; başlık ${title.maturity.rating} işaretli.`,
        )
      else if (RATING_RANK[implied] > 0 && !title.maturity.reasons.includes(s.advisory.reason))
        out.push(
          `${who}: ${s.name} ${v} ("${label}") "${MATURITY_REASONS[s.advisory.reason]}" gerekçesini gerektiriyor; başlıkta bu gerekçe yok.`,
        )
    }
  }
  return out
}
