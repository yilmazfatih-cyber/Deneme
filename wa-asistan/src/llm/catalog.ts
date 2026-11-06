/**
 * Model catalog: the provider's live model list, cached on disk so the bot can resolve `/model` even when the
 * provider is unreachable. Alias resolution is tolerant on purpose: model ids change often, so built-in aliases
 * are lists of candidates and the first one present in the live list wins.
 */
import { atomicWriteJson, readJsonSync } from '../store/files.js'
import { normalizeToken } from '../core/text.js'
import type { Catalog, LlmClient, ModelInfo } from '../core/types.js'

interface CacheFile {
  fetchedAt: number
  models: ModelInfo[]
}

/** alias → candidate model ids, best first. `:free` is special-cased below. */
export const BUILTIN_ALIASES: Record<string, string[]> = {
  hizli: ['openai/gpt-5-mini', 'openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'anthropic/claude-haiku-4.5'],
  akilli: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5', 'google/gemini-2.5-pro'],
  ucuz: ['openai/gpt-4.1-nano', 'google/gemini-2.5-flash-lite', 'deepseek/deepseek-chat-v3.1'],
  otomatik: ['openrouter/auto'],
}
const FREE_ALIAS = 'ucretsiz'

export interface CatalogOptions {
  llm: Pick<LlmClient, 'listModels'>
  file: string
  /** user aliases (config) → model id */
  aliases?: Record<string, string>
  now?: () => number
}

const synthetic = (id: string): ModelInfo => ({ id, name: id, inputModalities: ['text'] })

export class ModelCatalog implements Catalog {
  private models: ModelInfo[]
  private fetchedAt: number | undefined
  private readonly now: () => number
  private readonly userAliases: Map<string, string>

  constructor(private readonly o: CatalogOptions) {
    this.now = o.now ?? Date.now
    const cached = readJsonSync<CacheFile | null>(o.file, null, { now: this.now })
    this.models = cached && Array.isArray(cached.models) ? cached.models : []
    this.fetchedAt = cached && typeof cached.fetchedAt === 'number' ? cached.fetchedAt : undefined
    this.userAliases = new Map(Object.entries(o.aliases ?? {}).map(([k, v]) => [normalizeToken(k), v]))
  }

  all(): ModelInfo[] {
    return this.models
  }

  get(id: string): ModelInfo | undefined {
    const want = id.trim().toLowerCase()
    return this.models.find((m) => m.id.toLowerCase() === want)
  }

  age(): number | undefined {
    return this.fetchedAt === undefined ? undefined : this.now() - this.fetchedAt
  }

  async refresh(): Promise<void> {
    const models = await this.o.llm.listModels()
    if (models.length === 0) throw new Error('Sağlayıcı boş model listesi döndürdü')
    models.sort((a, b) => a.id.localeCompare(b.id))
    this.models = models
    this.fetchedAt = this.now()
    await atomicWriteJson(this.o.file, { fetchedAt: this.fetchedAt, models } satisfies CacheFile)
  }

  search(query: string, limit = 15): ModelInfo[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return this.models.slice(0, limit)
    const q = query.trim().toLowerCase()
    const score = (m: ModelInfo): number => {
      const id = m.id.toLowerCase()
      const tail = id.slice(id.lastIndexOf('/') + 1)
      if (id === q) return 0
      if (tail === q) return 1
      if (id.startsWith(q) || tail.startsWith(q)) return 2
      return 3
    }
    return this.models
      .filter((m) => {
        const hay = `${m.id} ${m.name}`.toLowerCase()
        return words.every((w) => hay.includes(w))
      })
      .sort((a, b) => score(a) - score(b) || a.id.length - b.id.length || a.id.localeCompare(b.id))
      .slice(0, limit)
  }

  private firstPresent(ids: string[]): ModelInfo | undefined {
    for (const id of ids) {
      const hit = this.get(id)
      if (hit) return hit
    }
    return undefined
  }

  private aliasTarget(token: string): ModelInfo | undefined {
    const user = this.userAliases.get(token)
    if (user) return this.get(user) ?? (this.models.length === 0 || user.includes('/') ? synthetic(user) : undefined)
    if (token === FREE_ALIAS) return this.models.find((m) => m.free && m.inputModalities.includes('text'))
    const builtin = BUILTIN_ALIASES[token]
    if (builtin) {
      const hit = this.firstPresent(builtin)
      if (hit) return hit
      // `openrouter/auto` is a router, not always listed by /models
      if (token === 'otomatik') return synthetic('openrouter/auto')
    }
    return undefined
  }

  resolve(query: string): ReturnType<Catalog['resolve']> {
    const q = query.trim()
    if (!q) return { kind: 'none' }
    const exact = this.get(q)
    if (exact) return { kind: 'ok', model: exact }
    const alias = this.aliasTarget(normalizeToken(q))
    if (alias) return { kind: 'ok', model: alias }
    const hits = this.search(q, 50)
    if (hits.length === 1 && hits[0]) return { kind: 'ok', model: hits[0] }
    if (hits.length > 1) {
      // "gpt-4o" should pick openai/gpt-4o, not the whole gpt-4o family
      const lower = q.toLowerCase()
      const tails = hits.filter((m) => m.id.toLowerCase().slice(m.id.lastIndexOf('/') + 1) === lower)
      if (tails.length === 1 && tails[0]) return { kind: 'ok', model: tails[0] }
      return { kind: 'ambiguous', candidates: hits.slice(0, 10) }
    }
    // Catalog never fetched (offline first run): trust a full provider/model id instead of blocking the user.
    if (this.models.length === 0 && q.includes('/')) return { kind: 'ok', model: synthetic(q) }
    return { kind: 'none' }
  }

  featured(): Array<{ alias: string; model?: ModelInfo }> {
    const names = [...new Set([...this.userAliases.keys(), ...Object.keys(BUILTIN_ALIASES), FREE_ALIAS])]
    return names.map((alias) => {
      const model = this.aliasTarget(alias)
      return model ? { alias, model } : { alias }
    })
  }
}
