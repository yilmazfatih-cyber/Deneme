// İşletme projesi (yıllık bütçe) → bağımsız bölüm başına aylık aidat.
// KMK m.20: aksine anlaşma yoksa kapıcı/kaloriferci/bahçıvan/bekçi giderleri EŞİT, sigorta, ortak yerlerin bakım,
// koruma, onarım ve işletme giderleri ARSA PAYI oranında paylaşılır. Yönetim planı başka bir dağıtım öngörebilir (m²).
import { roundTo, splitByWeights } from './money.ts'

export type BudgetLineInput = { id?: number; name: string; category: string; annual_amount: number; method: string }
export type BudgetUnit = { id: number; land_share: number; area_m2: number | null; label?: string }

export type UnitShare = {
  unitId: number
  /** Yıllık pay (kuruş, yuvarlamasız). */
  annual: number
  /** Aylık aidat (yuvarlanmış). */
  monthly: number
  byMethod: Record<string, number>
}

export function weightsFor(method: string, units: BudgetUnit[]): number[] {
  if (method === 'esit') return units.map(() => 1)
  if (method === 'm2') {
    const w = units.map((u) => u.area_m2 ?? 0)
    if (w.some((x) => x <= 0)) throw new Error('m² dağıtımı için tüm bağımsız bölümlerin alanı girilmeli')
    return w
  }
  return units.map((u) => u.land_share)
}

/**
 * Her bütçe kalemini kendi dağıtım anahtarıyla bölüştürür, aylık aidatı `roundStep` katına yuvarlar
 * (100 = tam lira, 1 = kuruş). Toplamdaki yuvarlama farkı `roundingDiff` olarak raporlanır.
 */
export function computeAidat(lines: BudgetLineInput[], units: BudgetUnit[], months: number, roundStep = 100) {
  if (units.length === 0) throw new Error('Bağımsız bölüm yok')
  if (months < 1) throw new Error('Ay sayısı en az 1 olmalı')
  const shares: UnitShare[] = units.map((u) => ({ unitId: u.id, annual: 0, monthly: 0, byMethod: {} }))
  for (const line of lines) {
    if (line.annual_amount <= 0) continue
    const parts = splitByWeights(line.annual_amount, weightsFor(line.method, units))
    parts.forEach((p, i) => {
      const s = shares[i]!
      s.annual += p
      s.byMethod[line.method] = (s.byMethod[line.method] ?? 0) + p
    })
  }
  for (const s of shares) s.monthly = roundTo(s.annual / months, roundStep)
  const budgetTotal = lines.reduce((a, l) => a + Math.max(0, l.annual_amount), 0)
  const collectedTotal = shares.reduce((a, s) => a + s.monthly * months, 0)
  return { shares, budgetTotal, collectedTotal, roundingDiff: collectedTotal - budgetTotal }
}

/** Bir defalık ek toplamayı (ör. çatı onarımı) seçilen anahtarla dağıtır; toplam kuruşu kuruşuna korunur. */
export function splitExtra(total: number, method: string, units: BudgetUnit[]): { unitId: number; amount: number }[] {
  return splitByWeights(total, weightsFor(method, units)).map((amount, i) => ({ unitId: units[i]!.id, amount }))
}
