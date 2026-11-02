/**
 * Cost arithmetic and formatting: usage × reference price → USD, USD → TL, Turkish number
 * formatting, per-million price lines, the reply footer and the ledger entry composer.
 * The provider's own cost figure always wins over an estimate; the real bill lives at the provider.
 */
import type { ChatResult, LedgerEntry, ModelInfo, ModelPricing } from './types.js'

export type CostSource = LedgerEntry['usdSource']

function finite(n: number | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

/** prompt × promptUsdPerToken + completion × completionUsdPerToken (+ requestUsd once); undefined without pricing. */
export function estimateUsd(
  usage: { promptTokens: number; completionTokens: number },
  pricing?: ModelPricing,
): number | undefined {
  if (!pricing) return undefined
  return (
    finite(usage.promptTokens) * finite(pricing.promptUsdPerToken) +
    finite(usage.completionTokens) * finite(pricing.completionUsdPerToken) +
    finite(pricing.requestUsd)
  )
}

/** Provider-reported cost first, then an estimate from the catalog price, else unknown (0). */
export function costOf(result: ChatResult, model?: ModelInfo): { usd: number; source: CostSource } {
  const usage = result.usage
  if (usage && typeof usage.costUsd === 'number' && Number.isFinite(usage.costUsd) && usage.costUsd >= 0) {
    return { usd: usage.costUsd, source: 'provider' }
  }
  if (usage && model?.pricing) {
    const usd = estimateUsd(usage, model.pricing)
    if (usd !== undefined) return { usd, source: 'estimate' }
  }
  return { usd: 0, source: 'unknown' }
}

export function tlOf(usd: number, rate?: number): number | undefined {
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(usd)) return undefined
  return usd * rate
}

const TL_FORMAT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "1.234,50 TL"; 0 → "0,00 TL"; tiny positive → "< 0,01 TL". */
export function formatTl(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  if (v === 0) return '0,00 TL'
  if (v > 0 && v < 0.005) return '< 0,01 TL'
  return `${TL_FORMAT.format(v)} TL`
}

/** "$0.0031" (4 decimals under 1), "$12.34" otherwise; 0 → "$0.00"; tiny positive → "< $0.0001". */
export function formatUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  if (v === 0) return '$0.00'
  if (v > 0 && v < 0.00005) return '< $0.0001'
  if (Math.abs(v) < 1) return `$${v.toFixed(4)}`
  return `$${v.toFixed(2)}`
}

/** Price-list style dollars: 2 decimals, 4 when the amount is under a cent. */
function formatUsdPrice(n: number): string {
  if (n > 0 && n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

/** "1M giriş 12,50 TL · 1M çıkış 50,00 TL" (or dollars without a rate), "ücretsiz", "fiyat bilinmiyor". */
export function formatPerMillion(pricing: ModelPricing | undefined, rate?: number): string {
  if (!pricing) return 'fiyat bilinmiyor'
  const input = finite(pricing.promptUsdPerToken) * 1_000_000
  const output = finite(pricing.completionUsdPerToken) * 1_000_000
  if (input === 0 && output === 0) return 'ücretsiz'
  const inTl = tlOf(input, rate)
  const outTl = tlOf(output, rate)
  if (inTl !== undefined && outTl !== undefined) return `1M giriş ${formatTl(inTl)} · 1M çıkış ${formatTl(outTl)}`
  return `1M giriş ${formatUsdPrice(input)} · 1M çıkış ${formatUsdPrice(output)}`
}

/** Italic footer appended to replies: "_≈ 0,12 TL · model_", "_≈ $0.0031 · model_" or "_maliyet bilinmiyor · model_". */
export function footerLine(e: Pick<LedgerEntry, 'model' | 'usd' | 'usdSource' | 'tl'>): string {
  if (e.usdSource === 'unknown') return `_maliyet bilinmiyor · ${e.model}_`
  if (e.tl !== undefined) return `_≈ ${formatTl(e.tl)} · ${e.model}_`
  return `_≈ ${formatUsd(e.usd)} · ${e.model}_`
}

/** Composes a ledger entry from a chat result, the catalog's model info and the current rate. */
export function ledgerEntry(input: {
  ts: number
  chatJid: string
  model: string
  result: ChatResult
  modelInfo?: ModelInfo
  rate?: number
}): LedgerEntry {
  const { usd, source } = costOf(input.result, input.modelInfo)
  const tl = tlOf(usd, input.rate)
  return {
    ts: input.ts,
    chatJid: input.chatJid,
    model: input.model,
    promptTokens: finite(input.result.usage?.promptTokens),
    completionTokens: finite(input.result.usage?.completionTokens),
    usd,
    usdSource: source,
    ...(tl !== undefined && input.rate !== undefined ? { rate: input.rate, tl } : {}),
  }
}
