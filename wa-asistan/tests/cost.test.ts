import { describe, expect, it } from 'vitest'
import {
  costOf,
  estimateUsd,
  footerLine,
  formatPerMillion,
  formatTl,
  formatUsd,
  ledgerEntry,
  tlOf,
} from '../src/core/cost.js'
import type { ChatResult, ModelInfo, ModelPricing } from '../src/core/types.js'

const pricing: ModelPricing = { promptUsdPerToken: 0.3 / 1e6, completionUsdPerToken: 1.2 / 1e6 }
const model: ModelInfo = { id: 'openai/gpt-5-mini', name: 'GPT-5 mini', inputModalities: ['text'], pricing }
const usage = { promptTokens: 1000, completionTokens: 500 }

describe('estimateUsd', () => {
  it('is undefined without pricing', () => {
    expect(estimateUsd(usage)).toBeUndefined()
  })

  it('multiplies tokens by per-token prices', () => {
    expect(estimateUsd(usage, pricing)).toBeCloseTo(0.0003 + 0.0006, 10)
  })

  it('adds requestUsd once and treats missing token counts as zero', () => {
    expect(estimateUsd(usage, { ...pricing, requestUsd: 0.01 })).toBeCloseTo(0.0109, 10)
    expect(estimateUsd({ promptTokens: Number.NaN, completionTokens: 10 }, pricing)).toBeCloseTo(0.000012, 12)
  })
})

describe('costOf', () => {
  it('prefers the provider cost when reported', () => {
    const r: ChatResult = { text: 'x', model: model.id, usage: { ...usage, costUsd: 0.0042 } }
    expect(costOf(r, model)).toEqual({ usd: 0.0042, source: 'provider' })
    expect(costOf({ ...r, usage: { ...usage, costUsd: 0 } }, model)).toEqual({ usd: 0, source: 'provider' })
  })

  it('estimates from the catalog price when the provider gives nothing usable', () => {
    const r: ChatResult = { text: 'x', model: model.id, usage }
    expect(costOf(r, model)).toEqual({ usd: estimateUsd(usage, pricing), source: 'estimate' })
    expect(costOf({ ...r, usage: { ...usage, costUsd: -1 } }, model).source).toBe('estimate')
    expect(costOf({ ...r, usage: { ...usage, costUsd: Number.NaN } }, model).source).toBe('estimate')
  })

  it('is unknown without usage or without pricing', () => {
    expect(costOf({ text: 'x', model: model.id }, model)).toEqual({ usd: 0, source: 'unknown' })
    expect(costOf({ text: 'x', model: 'm', usage }, { id: 'm', name: 'm', inputModalities: ['text'] })).toEqual({
      usd: 0,
      source: 'unknown',
    })
    expect(costOf({ text: 'x', model: 'm', usage })).toEqual({ usd: 0, source: 'unknown' })
  })
})

describe('tlOf', () => {
  it('converts with a positive finite rate only', () => {
    expect(tlOf(0.5, 41.2)).toBeCloseTo(20.6, 10)
    expect(tlOf(0.5)).toBeUndefined()
    expect(tlOf(0.5, 0)).toBeUndefined()
    expect(tlOf(0.5, Number.NaN)).toBeUndefined()
    expect(tlOf(Number.NaN, 41)).toBeUndefined()
  })
})

describe('formatTl', () => {
  it('uses Turkish grouping and decimals', () => {
    expect(formatTl(1234.5)).toBe('1.234,50 TL')
    expect(formatTl(1234567.891)).toBe('1.234.567,89 TL')
    expect(formatTl(0.12)).toBe('0,12 TL')
    expect(formatTl(0)).toBe('0,00 TL')
  })

  it('shows tiny amounts as "< 0,01 TL"', () => {
    expect(formatTl(0.004)).toBe('< 0,01 TL')
    expect(formatTl(0.0000001)).toBe('< 0,01 TL')
    expect(formatTl(0.006)).toBe('0,01 TL')
    expect(formatTl(Number.NaN)).toBe('0,00 TL')
  })
})

describe('formatUsd', () => {
  it('uses four decimals under a dollar and two above', () => {
    expect(formatUsd(0.0031)).toBe('$0.0031')
    expect(formatUsd(0.00314159)).toBe('$0.0031')
    expect(formatUsd(12.34)).toBe('$12.34')
    expect(formatUsd(1)).toBe('$1.00')
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(0.00001)).toBe('< $0.0001')
  })
})

describe('formatPerMillion', () => {
  it('shows TL with a rate and dollars without', () => {
    expect(formatPerMillion(pricing, 41.666666)).toBe('1M giriş 12,50 TL · 1M çıkış 50,00 TL')
    expect(formatPerMillion(pricing)).toBe('1M giriş $0.30 · 1M çıkış $1.20')
  })

  it('handles free and unknown pricing', () => {
    expect(formatPerMillion({ promptUsdPerToken: 0, completionUsdPerToken: 0 })).toBe('ücretsiz')
    expect(formatPerMillion({ promptUsdPerToken: 0, completionUsdPerToken: 0 }, 41)).toBe('ücretsiz')
    expect(formatPerMillion(undefined)).toBe('fiyat bilinmiyor')
    expect(formatPerMillion(undefined, 41)).toBe('fiyat bilinmiyor')
  })

  it('keeps sub-cent dollar prices readable', () => {
    expect(formatPerMillion({ promptUsdPerToken: 0.005 / 1e6, completionUsdPerToken: 2 / 1e6 })).toBe(
      '1M giriş $0.0050 · 1M çıkış $2.00',
    )
  })
})

describe('footerLine', () => {
  it('prefers TL, then USD, and says when the cost is unknown', () => {
    expect(footerLine({ model: 'openai/gpt-5-mini', usd: 0.003, usdSource: 'estimate', tl: 0.1236 })).toBe(
      '_≈ 0,12 TL · openai/gpt-5-mini_',
    )
    expect(footerLine({ model: 'm', usd: 0.0031, usdSource: 'provider' })).toBe('_≈ $0.0031 · m_')
    expect(footerLine({ model: 'm', usd: 0, usdSource: 'unknown', tl: 0 })).toBe('_maliyet bilinmiyor · m_')
    expect(footerLine({ model: 'm', usd: 0.001, usdSource: 'estimate', tl: 0.001 })).toBe('_≈ < 0,01 TL · m_')
  })
})

describe('ledgerEntry', () => {
  it('composes a full entry with rate and TL', () => {
    const result: ChatResult = { text: 'x', model: model.id, usage: { ...usage, costUsd: 0.002 } }
    const e = ledgerEntry({
      ts: 1_700_000_000_000,
      chatJid: '905551112233@s.whatsapp.net',
      model: model.id,
      result,
      modelInfo: model,
      rate: 40,
    })
    expect(e).toEqual({
      ts: 1_700_000_000_000,
      chatJid: '905551112233@s.whatsapp.net',
      model: model.id,
      promptTokens: 1000,
      completionTokens: 500,
      usd: 0.002,
      usdSource: 'provider',
      rate: 40,
      tl: 0.08,
    })
  })

  it('estimates when the provider is silent and omits rate/tl without a rate', () => {
    const result: ChatResult = { text: 'x', model: model.id, usage }
    const e = ledgerEntry({ ts: 1, chatJid: 'c', model: model.id, result, modelInfo: model })
    expect(e.usdSource).toBe('estimate')
    expect(e.usd).toBeCloseTo(0.0009, 10)
    expect('rate' in e).toBe(false)
    expect('tl' in e).toBe(false)
  })

  it('records unknown cost with zero tokens when usage is missing', () => {
    const e = ledgerEntry({ ts: 1, chatJid: 'c', model: 'm', result: { text: 'x', model: 'm' }, rate: 40 })
    expect(e).toMatchObject({ promptTokens: 0, completionTokens: 0, usd: 0, usdSource: 'unknown', rate: 40, tl: 0 })
  })
})
