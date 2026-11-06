import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ModelCatalog } from '../src/llm/catalog.js'
import type { ModelInfo } from '../src/core/types.js'

const m = (id: string, extra: Partial<ModelInfo> = {}): ModelInfo => ({
  id,
  name: id,
  inputModalities: ['text'],
  ...extra,
})

const MODELS: ModelInfo[] = [
  m('openai/gpt-4o'),
  m('openai/gpt-4o-mini'),
  m('openai/gpt-5-mini'),
  m('anthropic/claude-sonnet-4.5', { name: 'Anthropic: Claude Sonnet 4.5', inputModalities: ['text', 'image'] }),
  m('google/gemini-2.5-flash'),
  m('meta-llama/llama-3.3-70b-instruct:free', { free: true }),
  m('deepseek/deepseek-chat-v3.1'),
]

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cat-')), 'catalog.json')
const fake = (models: ModelInfo[] = MODELS) => ({ listModels: async () => structuredClone(models) })

async function loaded(aliases?: Record<string, string>, f = file()) {
  const c = new ModelCatalog({ llm: fake(), file: f, ...(aliases ? { aliases } : {}) })
  await c.refresh()
  return c
}

describe('ModelCatalog', () => {
  it('refresh persists and a new instance reads the cache', async () => {
    const f = file()
    await loaded(undefined, f)
    const again = new ModelCatalog({
      llm: {
        listModels: async () => {
          throw new Error('çevrimdışı')
        },
      },
      file: f,
    })
    expect(again.all()).toHaveLength(MODELS.length)
    expect(again.age()).toBeGreaterThanOrEqual(0)
  })

  it('age is undefined before any fetch; an empty list is an error', async () => {
    const c = new ModelCatalog({ llm: fake([]), file: file() })
    expect(c.age()).toBeUndefined()
    await expect(c.refresh()).rejects.toThrow()
  })

  it('searches id and name, case-insensitively, best match first', async () => {
    const c = await loaded()
    expect(c.search('GPT-4O').map((x) => x.id)).toEqual(['openai/gpt-4o', 'openai/gpt-4o-mini'])
    expect(c.search('sonnet')[0]?.id).toBe('anthropic/claude-sonnet-4.5')
    expect(c.search('claude sonnet')).toHaveLength(1)
    expect(c.search('yok böyle')).toEqual([])
    expect(c.search('o', 3)).toHaveLength(3)
  })

  describe('resolve', () => {
    it('exact id, case-insensitive', async () => {
      const r = (await loaded()).resolve('OpenAI/GPT-4o')
      expect(r).toMatchObject({ kind: 'ok', model: { id: 'openai/gpt-4o' } })
    })
    it('unique substring', async () => {
      expect((await loaded()).resolve('deepseek')).toMatchObject({
        kind: 'ok',
        model: { id: 'deepseek/deepseek-chat-v3.1' },
      })
    })
    it('picks the model whose name equals the query when the family also matches', async () => {
      expect((await loaded()).resolve('gpt-4o')).toMatchObject({ kind: 'ok', model: { id: 'openai/gpt-4o' } })
    })
    it('ambiguous returns candidates', async () => {
      const r = (await loaded()).resolve('mini')
      expect(r.kind).toBe('ambiguous')
      if (r.kind === 'ambiguous')
        expect(r.candidates.map((x) => x.id).sort()).toEqual([
          'google/gemini-2.5-flash',
          'openai/gpt-4o-mini',
          'openai/gpt-5-mini',
        ])
    })
    it('none for unknown and for empty input', async () => {
      const c = await loaded()
      expect(c.resolve('olmayan-model')).toEqual({ kind: 'none' })
      expect(c.resolve('   ')).toEqual({ kind: 'none' })
    })
    it('built-in aliases pick the first candidate present in the live list', async () => {
      const c = await loaded()
      expect(c.resolve('hizli')).toMatchObject({ kind: 'ok', model: { id: 'openai/gpt-5-mini' } })
      expect(c.resolve('Akıllı')).toMatchObject({ kind: 'ok', model: { id: 'anthropic/claude-sonnet-4.5' } })
      expect(c.resolve('ücretsiz')).toMatchObject({
        kind: 'ok',
        model: { id: 'meta-llama/llama-3.3-70b-instruct:free' },
      })
    })
    it('otomatik always resolves, even if /models does not list the router', async () => {
      expect((await loaded()).resolve('otomatik')).toMatchObject({ kind: 'ok', model: { id: 'openrouter/auto' } })
    })
    it('user aliases win over built-ins', async () => {
      const c = await loaded({ Hızlı: 'google/gemini-2.5-flash' })
      expect(c.resolve('hizli')).toMatchObject({ kind: 'ok', model: { id: 'google/gemini-2.5-flash' } })
    })
    it('before the first fetch a full provider/model id is trusted, a bare word is not', () => {
      const c = new ModelCatalog({ llm: fake(), file: file() })
      expect(c.resolve('openai/gpt-5')).toMatchObject({ kind: 'ok', model: { id: 'openai/gpt-5' } })
      expect(c.resolve('gpt')).toEqual({ kind: 'none' })
    })
  })

  it('featured lists every alias, with the model when resolvable', async () => {
    const c = await loaded({ benim: 'deepseek/deepseek-chat-v3.1' })
    const f = c.featured()
    expect(f.map((x) => x.alias)).toEqual(
      expect.arrayContaining(['benim', 'hizli', 'akilli', 'ucuz', 'otomatik', 'ucretsiz']),
    )
    expect(f.find((x) => x.alias === 'benim')?.model?.id).toBe('deepseek/deepseek-chat-v3.1')
    expect(f.find((x) => x.alias === 'ucuz')?.model?.id).toBe('deepseek/deepseek-chat-v3.1')
  })
})
