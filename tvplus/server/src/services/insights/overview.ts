/**
 * Stüdyo genel bakışı: her servisten sayımlar. Henüz dolmamış (iskelet) ya da hata veren servis tüm yanıtı düşürmez;
 * o bölüm boş/null döner.
 */
import type { StudioOverview } from '../../../../shared/intelligence'
import type { Services } from '../../kernel/services'

function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function computeOverview(s: Services): StudioOverview {
  const titles = attempt(() => s.catalog.allTitles(), [])
  const tagging: StudioOverview['tagging'] = {
    rubricVersion: attempt(() => s.tagging.vocabulary().version, '—'),
    consensus: 0,
    sampleOnly: 0,
    modelOnly: 0,
    untagged: 0,
    humanSheets: 0,
  }
  for (const t of titles) {
    const basis = attempt(() => s.tagging.effective(t.videoId).basis, 'NONE' as const)
    if (basis === 'CONSENSUS') tagging.consensus++
    else if (basis === 'SAMPLE') tagging.sampleOnly++
    else if (basis === 'MODEL') tagging.modelOnly++
    else tagging.untagged++
    tagging.humanSheets += attempt(() => s.tagging.sheets(t.videoId), []).filter((sh) => sh.source === 'TAGGER').length
  }
  return {
    catalog: {
      titles: titles.length,
      movies: titles.filter((t) => t.type === 'MOVIE').length,
      shows: titles.filter((t) => t.type === 'SHOW').length,
    },
    tagging,
    microgenres: attempt(() => s.microgenres.stats(), null),
    sources: attempt(() => s.viewing.sources(), []),
    audience: attempt(() => s.audience.run(), null),
    embeddings: attempt(() => s.embeddings.info(), null),
  }
}
