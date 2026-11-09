// Serbest metinden (EFT açıklaması, WhatsApp mesajı) blok ve daire numarası çıkarır; banka hareketini
// bağımsız bölüme eşler. Kurallar: blok+daire deseni, gönderen adı (daire sakinleri), tutar = beklenen aidat/borç.
import { fold, nameParts } from './text.ts'

export type UnitHint = { block: string | null; unit: string | null }

/** "A Blok" → "a", "Lale Blok" → "lale", "B" → "b" */
export function blockKey(name: string): string {
  return fold(name)
    .replace(/\bblok\w*\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Metindeki blok/daire ipucu. Örnekler: "A Blok Daire 5", "A blk D:5", "A-5", "A/12", "B2 blok no 14",
 * "daire 7", "D.7", "kapı no 3", "5 nolu daire".
 */
export function extractUnitHint(text: string, blockKeys: string[] = []): UnitHint {
  const t = ` ${fold(text)} `
  const known = new Set(blockKeys)
  let m =
    /\b([a-z]{1,8}\d?|\d{1,2})\s*[-.]?\s*blo?k?\w*\.?\s*(?:,|-)?\s*(?:daire|dair|d|no|kapi no|kapi)?\s*[:.\-/]?\s*(\d{1,4})\b/.exec(
      t,
    )
  if (m && /blo?k/.test(m[0])) return { block: m[1]!, unit: m[2]! }
  m = /\b([a-z]\d?)\s*[-/]\s*(\d{1,4})\b/.exec(t)
  if (m && (known.size === 0 || known.has(m[1]!))) return { block: m[1]!, unit: m[2]! }
  m = /\b(?:daire|dair|d|no|kapi no|ic kapi no)\s*[:.]?\s*(\d{1,4})\b/.exec(t)
  if (m) {
    const blk = /\b([a-z]\d?)\s*blo?k/.exec(t)
    return { block: blk ? blk[1]! : null, unit: m[1]! }
  }
  m = /\b(\d{1,4})\s*(?:nolu|no'lu|numarali)\s*(?:daire|bagimsiz bolum)/.exec(t)
  if (m) return { block: null, unit: m[1]! }
  if (known.size > 0) {
    m = /\b([a-z])(\d{1,3})\b/.exec(t)
    if (m && known.has(m[1]!)) return { block: m[1]!, unit: m[2]! }
  }
  return { block: null, unit: null }
}

export type MatchUnit = {
  id: number
  block: string | null
  no: string
  names: string[]
  /** Beklenen tutarlar: aylık aidat, toplam borç vb. (kuruş) */
  expected: number[]
}

export type MatchResult = {
  unitId: number | null
  confidence: number
  reason: string
  candidates: { unitId: number; score: number }[]
}

export function matchTransaction(description: string, amount: number, units: MatchUnit[]): MatchResult {
  const keys = [...new Set(units.map((u) => (u.block ? blockKey(u.block) : '')).filter(Boolean))]
  const hint = extractUnitHint(description, keys)
  const folded = ` ${fold(description).replace(/[^a-z0-9]+/g, ' ')} `
  const scored = units.map((u) => {
    let score = 0
    const why: string[] = []
    if (hint.unit && hint.unit === u.no.replace(/^0+/, '')) {
      const bk = u.block ? blockKey(u.block) : null
      if (hint.block && bk && hint.block === bk) {
        score += 0.6
        why.push(`blok/daire: ${u.block} ${u.no}`)
      } else if (!hint.block && (!bk || keys.length <= 1)) {
        score += 0.5
        why.push(`daire no: ${u.no}`)
      } else if (!hint.block) {
        score += 0.25
        why.push(`daire no (blok belirsiz): ${u.no}`)
      }
    }
    let bestName = 0
    for (const name of u.names) {
      const parts = nameParts(name)
      if (parts.length === 0) continue
      const hits = parts.filter((p) => p.length >= 3 && folded.includes(` ${p} `))
      const surname = parts[parts.length - 1]!
      if (hits.length === parts.length) bestName = Math.max(bestName, 0.5)
      else if (hits.includes(surname) && hits.length >= 1) bestName = Math.max(bestName, 0.25)
    }
    if (bestName > 0) {
      score += bestName
      why.push(bestName >= 0.5 ? 'gönderen adı eşleşti' : 'soyadı eşleşti')
    }
    if (score > 0 && u.expected.includes(amount)) {
      score += 0.15
      why.push('tutar beklenenle aynı')
    }
    return { unitId: u.id, score: Math.min(1, score), why }
  })
  const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best) return { unitId: null, confidence: 0, reason: 'Eşleşme bulunamadı', candidates: [] }
  const second = ranked[1]
  // Yakın iki aday varsa güven düşer; kullanıcı onayı gerekir.
  const confidence = second && second.score >= best.score - 0.1 ? Math.min(best.score, 0.4) : best.score
  return {
    unitId: best.unitId,
    confidence: Math.round(confidence * 100) / 100,
    reason:
      second && second.score >= best.score - 0.1 ? `Birden çok aday: ${best.why.join(', ')}` : best.why.join(', '),
    candidates: ranked.slice(0, 5).map((r) => ({ unitId: r.unitId, score: r.score })),
  }
}

/** Mesajdaki ipucuyla birimi bulur (WhatsApp/SMS). */
export function findUnitByHint(
  hint: UnitHint,
  units: { id: number; block: string | null; no: string }[],
): { id: number; block: string | null; no: string } | null {
  if (!hint.unit) return null
  const candidates = units.filter((u) => u.no.replace(/^0+/, '') === hint.unit)
  if (hint.block) {
    const exact = candidates.filter((u) => u.block && blockKey(u.block) === hint.block)
    if (exact.length === 1) return exact[0]!
  }
  return candidates.length === 1 ? candidates[0]! : null
}
