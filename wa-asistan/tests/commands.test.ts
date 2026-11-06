import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config.js'
import { normalizeAllowPhone } from '../src/core/access.js'
import {
  COMMANDS,
  MAX_NOTES,
  MAX_REPLY_CHARS,
  effectiveBudget,
  effectiveFooter,
  helpText,
  parseCommand,
  runCommand,
} from '../src/core/commands.js'
import { normalizeToken } from '../src/core/text.js'
import type {
  AccessControl,
  AppContext,
  Catalog,
  ChatState,
  CostSummary,
  FxRate,
  FxService,
  InboundMessage,
  Ledger,
  ModelInfo,
  Settings,
  SettingsStore,
} from '../src/core/types.js'

// ---------------------------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------------------------

const HOUR = 3_600_000
/** 2 November 2026, 11:00 UTC. */
const NOW = Date.UTC(2026, 10, 2, 11, 0, 0)
const OWNER = 'me@s.whatsapp.net'
const STRANGER = '905559998877@s.whatsapp.net'

const GPT: ModelInfo = {
  id: 'openai/gpt-5-mini',
  name: 'OpenAI: GPT-5 Mini',
  contextLength: 400_000,
  inputModalities: ['text'],
  pricing: { promptUsdPerToken: 0.25 / 1e6, completionUsdPerToken: 2 / 1e6 },
}
const GEMINI: ModelInfo = {
  id: 'google/gemini-2.5-flash',
  name: 'Google: Gemini 2.5 Flash',
  contextLength: 1_048_576,
  inputModalities: ['text', 'image'],
  pricing: { promptUsdPerToken: 0.3 / 1e6, completionUsdPerToken: 2.5 / 1e6 },
}
const LLAMA_FREE: ModelInfo = {
  id: 'meta-llama/llama-3.3-70b-instruct:free',
  name: 'Meta: Llama 3.3 70B Instruct (free)',
  contextLength: 131_072,
  inputModalities: ['text'],
  pricing: { promptUsdPerToken: 0, completionUsdPerToken: 0 },
  free: true,
}
const MODELS = [GPT, GEMINI, LLAMA_FREE]
const ALIAS_TABLE: Record<string, string> = {
  hizli: GPT.id,
  gorsel: GEMINI.id,
  ucretsiz: LLAMA_FREE.id,
  eski: 'acme/retired-model',
}

class FakeCatalog implements Catalog {
  refreshCalls = 0
  refreshError: Error | undefined
  constructor(private models: ModelInfo[] = MODELS) {}
  all(): ModelInfo[] {
    return this.models
  }
  get(id: string): ModelInfo | undefined {
    return this.models.find((m) => m.id === id)
  }
  search(query: string, limit = 20): ModelInfo[] {
    const q = query.toLowerCase()
    return this.models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, limit)
  }
  resolve(query: string): ReturnType<Catalog['resolve']> {
    const q = query.trim().toLowerCase()
    const exact = this.models.find((m) => m.id.toLowerCase() === q)
    if (exact) return { kind: 'ok', model: exact }
    const alias = ALIAS_TABLE[q]
    const viaAlias = alias ? this.get(alias) : undefined
    if (viaAlias) return { kind: 'ok', model: viaAlias }
    const hits = this.search(q, 1000)
    if (hits.length === 1 && hits[0]) return { kind: 'ok', model: hits[0] }
    if (hits.length > 1) return { kind: 'ambiguous', candidates: hits }
    return { kind: 'none' }
  }
  featured(): Array<{ alias: string; model?: ModelInfo }> {
    return Object.entries(ALIAS_TABLE).map(([alias, id]) => {
      const model = this.get(id)
      return model ? { alias, model } : { alias }
    })
  }
  async refresh(): Promise<void> {
    this.refreshCalls++
    if (this.refreshError) throw this.refreshError
  }
  age(): number | undefined {
    return 5 * 60_000
  }
}

const zero = (): CostSummary => ({ count: 0, usd: 0, tl: 0, unknownCount: 0, byModel: [] })

interface LedgerData {
  today: CostSummary
  month: CostSummary
  all: CostSummary
}

const DEFAULT_LEDGER: LedgerData = {
  today: {
    count: 3,
    usd: 0.0123,
    tl: 0.51,
    unknownCount: 0,
    byModel: [{ model: GPT.id, count: 3, usd: 0.0123, tl: 0.51 }],
  },
  month: {
    count: 40,
    usd: 0.9,
    tl: 37.08,
    unknownCount: 2,
    byModel: [
      { model: 'm/cheap', count: 1, usd: 0.001, tl: 0.04 },
      { model: GPT.id, count: 20, usd: 0.4, tl: 16.48 },
      { model: GEMINI.id, count: 10, usd: 0.3, tl: 12.36 },
      { model: 'm/four', count: 4, usd: 0.05, tl: 2.06 },
      { model: 'm/five', count: 3, usd: 0.04, tl: 1.65 },
      { model: 'm/six', count: 2, usd: 0.1, tl: 4.12 },
    ],
  },
  all: { count: 120, usd: 2.5, tl: 103, unknownCount: 0, byModel: [] },
}

function fakeLedger(data: LedgerData = DEFAULT_LEDGER): Ledger {
  return {
    append: vi.fn(async () => {}),
    summary: vi.fn(async () => data.month),
    today: vi.fn(async () => data.today),
    month: vi.fn(async () => data.month),
    allTime: vi.fn(async () => data.all),
  }
}

interface FakeFx extends FxService {
  rate: ReturnType<typeof vi.fn<() => Promise<FxRate | undefined>>>
  setManual: ReturnType<typeof vi.fn<(rate: number) => Promise<FxRate>>>
  refresh: ReturnType<typeof vi.fn<() => Promise<FxRate | undefined>>>
}

function fakeFx(current: FxRate | undefined, refreshed?: FxRate): FakeFx {
  return {
    rate: vi.fn(async () => current),
    refresh: vi.fn(async () => refreshed),
    setManual: vi.fn(async (rate: number) => ({ rate, source: 'manual' as const, asOf: NOW })),
  }
}

function fakeAccess(): AccessControl & { added: string[]; removed: string[] } {
  const allowed = new Set<string>()
  const added: string[] = []
  const removed: string[] = []
  return {
    added,
    removed,
    isOwner: (jid) => jid === OWNER,
    isAllowed: (jid) => jid === OWNER || allowed.has(jid.split('@')[0] ?? ''),
    list: () => [...allowed].sort(),
    add: vi.fn(async (phone: string) => {
      const digits = normalizeAllowPhone(phone)
      allowed.add(digits)
      added.push(digits)
      return digits
    }),
    remove: vi.fn(async (phone: string) => {
      const digits = phone.replace(/\D+/g, '')
      removed.push(digits)
      return allowed.delete(digits)
    }),
  }
}

function memorySettings(initial: Settings = {}): SettingsStore {
  let current: Settings = { ...initial }
  return {
    get: () => ({ ...current }),
    set: async (patch) => {
      current = { ...current, ...patch }
      return { ...current }
    },
  }
}

interface Harness {
  ctx: AppContext
  catalog: FakeCatalog
  fx: FakeFx
  access: ReturnType<typeof fakeAccess>
  settings: SettingsStore
  ledger: Ledger
  llm: { chat: ReturnType<typeof vi.fn>; listModels: ReturnType<typeof vi.fn> }
}

interface HarnessOptions {
  env?: Record<string, string>
  models?: ModelInfo[]
  /** pass `null` for "no rate available" */
  fxRate?: FxRate | null
  refreshed?: FxRate
  ledger?: LedgerData
  settings?: Settings
  startedAt?: number
}

function harness(opts: HarnessOptions = {}): Harness {
  const config = loadConfig({ LLM_API_KEY: 'test-key', DEFAULT_MODEL: GPT.id, ...opts.env }, '/tmp/wa-asistan-test')
  const catalog = new FakeCatalog(opts.models)
  const fx = fakeFx(
    opts.fxRate === null ? undefined : (opts.fxRate ?? { rate: 41.2, source: 'tcmb', asOf: NOW - 2 * HOUR }),
    opts.refreshed,
  )
  const access = fakeAccess()
  const settings = memorySettings(opts.settings)
  const ledger = fakeLedger(opts.ledger)
  const llm = {
    chat: vi.fn(async () => {
      throw new Error('commands must never call the model')
    }),
    listModels: vi.fn(async () => {
      throw new Error('commands must never call the model')
    }),
  }
  const ctx: AppContext = {
    config,
    llm,
    catalog,
    fx,
    ledger,
    store: { load: vi.fn(), save: vi.fn() } as unknown as AppContext['store'],
    access,
    settings,
    sender: { sendText: vi.fn(), typing: vi.fn() } as unknown as AppContext['sender'],
    log: pino({ level: 'silent' }),
    now: () => NOW,
    startedAt: opts.startedAt ?? NOW - (26 * 60 + 5) * 60_000,
  }
  return { ctx, catalog, fx, access, settings, ledger, llm }
}

const blankState = (over: Partial<ChatState> = {}): ChatState => ({
  chatJid: OWNER,
  history: [],
  notes: [],
  updatedAt: 1,
  ...over,
})

function message(text: string, senderJid = OWNER): InboundMessage {
  return {
    id: 'MSG1',
    chatJid: OWNER,
    senderJid,
    fromMe: senderJid === OWNER,
    isSelfChat: true,
    isGroup: false,
    text,
    timestamp: NOW,
  }
}

async function run(text: string, h: Harness = harness(), state: ChatState = blankState(), senderJid = OWNER) {
  const cmd = parseCommand(text)
  if (!cmd) throw new Error(`not a command: ${text}`)
  const out = await runCommand(cmd, message(text, senderJid), state, h.ctx)
  return { ...out, h, input: state }
}

// ---------------------------------------------------------------------------------------------
// parseCommand
// ---------------------------------------------------------------------------------------------

describe('parseCommand', () => {
  it('returns undefined for anything that does not start with a slash', () => {
    expect(parseCommand('merhaba')).toBeUndefined()
    expect(parseCommand('')).toBeUndefined()
    expect(parseCommand('   ')).toBeUndefined()
    expect(parseCommand('bak /model')).toBeUndefined()
    expect(parseCommand('1/2')).toBeUndefined()
  })

  it('returns exactly { name, args, raw }', () => {
    expect(parseCommand('/yardim')).toEqual({ name: 'yardim', args: '', raw: '/yardim' })
    expect(parseCommand('  /butce 300  ')).toEqual({ name: 'butce', args: '300', raw: '/butce 300' })
  })

  it('splits the command token from the arguments and keeps inner newlines of the arguments', () => {
    expect(parseCommand('/model   gpt  mini')?.args).toBe('gpt  mini')
    expect(parseCommand('/sistem Satır 1\nSatır 2')?.args).toBe('Satır 1\nSatır 2')
    expect(parseCommand('/not\nekle x')?.args).toBe('ekle x')
  })

  it.each([
    ['/yardım', 'yardim'],
    ['/YARDIM', 'yardim'],
    ['/Yardım', 'yardim'],
    ['/yardim', 'yardim'],
    ['/BÜTÇE 300', 'butce'],
    ['/bütçe', 'butce'],
    ['/Butce', 'butce'],
    ['/İZİN', 'izin'],
    ['/IZIN', 'izin'],
    ['/izin', 'izin'],
    ['/MODELLER', 'modeller'],
    ['/Modeller', 'modeller'],
    ['/ALTBİLGİ', 'altbilgi'],
  ])('normalizes %s to %s', (text, name) => {
    expect(parseCommand(text)?.name).toBe(name)
  })

  it.each([
    ['/help', 'yardim'],
    ['/?', 'yardim'],
    ['/models', 'modeller'],
    ['/reset', 'yeni'],
    ['/new', 'yeni'],
    ['/cost', 'maliyet'],
    ['/status', 'durum'],
  ])('maps the alias %s to %s', (text, name) => {
    expect(parseCommand(text)?.name).toBe(name)
  })

  it('maps every canonical name and every alias in the table', () => {
    for (const spec of COMMANDS) {
      expect(parseCommand(`/${spec.name}`)?.name).toBe(spec.name)
      for (const alias of spec.aliases) expect(parseCommand(`/${alias}`)?.name).toBe(spec.name)
    }
  })

  it('reports unknown commands with their arguments so the handler can answer with a hint', () => {
    expect(parseCommand('/foo bar')).toEqual({ name: 'unknown', args: 'bar', raw: '/foo bar' })
    expect(parseCommand('/')).toEqual({ name: 'unknown', args: '', raw: '/' })
    expect(parseCommand('/ model')?.name).toBe('unknown')
    expect(parseCommand('/yardim!')?.name).toBe('unknown')
  })
})

describe('COMMANDS and helpText', () => {
  it('lists the fifteen commands with their aliases', () => {
    expect(COMMANDS.map((c) => c.name)).toEqual([
      'yardim',
      'model',
      'modeller',
      'yeni',
      'sistem',
      'not',
      'maliyet',
      'butce',
      'kur',
      'durum',
      'izin',
      'altbilgi',
      'profil',
      'hatirla',
      'unut',
    ])
    const by = Object.fromEntries(COMMANDS.map((c) => [c.name, c.aliases]))
    expect(by.yardim).toEqual(['help', '?'])
    expect(by.modeller).toEqual(['models'])
    expect(by.yeni).toEqual(['reset', 'new'])
    expect(by.maliyet).toEqual(['cost'])
    expect(by.butce).toEqual(['bütçe'])
    expect(by.durum).toEqual(['status'])
  })

  it('has no alias collisions after normalization', () => {
    const seen = new Map<string, string>()
    for (const c of COMMANDS) {
      for (const token of [c.name, ...c.aliases].map(normalizeToken)) {
        const owner = seen.get(token)
        if (owner !== undefined) expect(owner).toBe(c.name)
        seen.set(token, c.name)
      }
    }
  })

  it('gives every command a one-line Turkish description and a runnable example', () => {
    for (const c of COMMANDS) {
      expect(c.description.trim()).not.toBe('')
      expect(c.description).not.toContain('\n')
      expect(parseCommand(`/${c.example}`)?.name).toBe(c.name)
    }
  })

  it('help is compact: one line per command with an example, no Markdown headers', () => {
    const text = helpText()
    const lines = text.split('\n')
    expect(lines[0]).toBe('*Komutlar*')
    for (const c of COMMANDS) expect(lines.some((l) => l.startsWith(`/${c.example} — `))).toBe(true)
    expect(lines.filter((l) => l.startsWith('/'))).toHaveLength(COMMANDS.length)
    expect(text.length).toBeLessThanOrEqual(MAX_REPLY_CHARS)
    expect(lines.some((l) => l.startsWith('#'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------
// runCommand
// ---------------------------------------------------------------------------------------------

describe('/yardim and unknown commands', () => {
  it('answers with the help text and leaves the state alone', async () => {
    const { reply, state, input } = await run('/yardim')
    expect(reply).toBe(helpText())
    expect(state).toBe(input)
  })

  it('answers an unknown command with one line pointing to /yardim', async () => {
    const { reply, state, input } = await run('/foo bar')
    expect(reply).toContain('/foo')
    expect(reply).toContain('/yardim')
    expect(reply.split('\n')).toHaveLength(1)
    expect(state).toBe(input)
  })

  it('answers a bare slash with a hint too', async () => {
    expect((await run('/')).reply).toContain('/yardim')
  })

  it('clips a very long unknown command token', async () => {
    const { reply } = await run(`/${'x'.repeat(500)}`)
    expect(reply.length).toBeLessThan(150)
  })
})

describe('/model', () => {
  it('shows the current model: id, price in TL per 1M, context, no image line for text-only', async () => {
    const { reply, state, input } = await run('/model')
    expect(reply).toContain('openai/gpt-5-mini')
    expect(reply).toContain('(varsayılan)')
    expect(reply).toContain('1M giriş 10,30 TL · 1M çıkış 82,40 TL') // 0.25 × 41.2 and 2 × 41.2
    expect(reply).toContain('Bağlam: 400.000 token')
    expect(reply).not.toContain('resim görebilir')
    expect(state).toBe(input)
  })

  it('shows the chat model, with image support', async () => {
    const { reply } = await run('/model', harness(), blankState({ model: GEMINI.id }))
    expect(reply).toContain('google/gemini-2.5-flash')
    expect(reply).not.toContain('(varsayılan)')
    expect(reply).toContain('1M giriş 12,36 TL · 1M çıkış 103,00 TL')
    expect(reply).toContain('🖼 resim görebilir')
  })

  it('shows prices in dollars when there is no rate', async () => {
    const { reply } = await run('/model', harness({ fxRate: null }))
    expect(reply).toContain('1M giriş $0.25 · 1M çıkış $2.00')
    expect(reply).not.toContain('TL')
  })

  it('says so when the current model is not in the catalog', async () => {
    const { reply } = await run('/model', harness(), blankState({ model: 'acme/unknown' }))
    expect(reply).toContain('acme/unknown')
    expect(reply).toContain('Katalogda bulunamadı')
  })

  it('sets state.model on an exact id and reports id, price, context', async () => {
    const { reply, state, input } = await run('/model google/gemini-2.5-flash')
    expect(state.model).toBe(GEMINI.id)
    expect(state.updatedAt).toBe(NOW)
    expect(input.model).toBeUndefined() // the input state is not mutated
    expect(reply).toContain('google/gemini-2.5-flash')
    expect(reply).toContain('1M giriş 12,36 TL')
    expect(reply).toContain('1.048.576 token')
    expect(reply).toContain('🖼 resim görebilir')
  })

  it('resolves aliases and unique substrings through the catalog', async () => {
    expect((await run('/model hizli')).state.model).toBe(GPT.id)
    expect((await run('/model llama')).state.model).toBe(LLAMA_FREE.id)
  })

  it('shows "ücretsiz" for a free model', async () => {
    const { reply, state } = await run('/model ucretsiz')
    expect(state.model).toBe(LLAMA_FREE.id)
    expect(reply).toContain('ücretsiz')
  })

  it('pins the choice even when it equals the default, and says so on a repeat', async () => {
    const first = await run('/model openai/gpt-5-mini')
    expect(first.state.model).toBe(GPT.id)
    const again = await run('/model openai/gpt-5-mini', first.h, first.state)
    expect(again.reply).toContain('zaten seçili')
    expect(again.state).toBe(first.state)
  })

  it('lists candidates with short prices when the query is ambiguous and changes nothing', async () => {
    const { reply, state, input } = await run('/model mini')
    expect(state).toBe(input)
    expect(reply).toContain('birden çok model')
    expect(reply).toContain('• openai/gpt-5-mini — 10,30 / 82,40 TL')
    expect(reply).toContain('• google/gemini-2.5-flash — 12,36 / 103,00 TL')
    expect(reply).toContain('belirgin')
  })

  it('shows at most 10 ambiguous candidates and counts the rest', async () => {
    const many = Array.from({ length: 14 }, (_, i): ModelInfo => ({
      id: `acme/model-${i}`,
      name: `Model ${i}`,
      inputModalities: ['text'],
    }))
    const { reply } = await run('/model model', harness({ models: many }))
    expect(reply.split('\n').filter((l) => l.startsWith('• '))).toHaveLength(10)
    expect(reply).toContain('4 model daha')
    expect(reply).toContain('fiyat yok')
  })

  it('suggests /modeller <arama> when nothing matches', async () => {
    const { reply, state, input } = await run('/model zzz-yok')
    expect(reply).toContain('bulunamadı')
    expect(reply).toContain('/modeller <arama>')
    expect(state).toBe(input)
  })

  it('suggests refreshing the list when the catalog is empty', async () => {
    const { reply } = await run('/model gpt', harness({ models: [] }))
    expect(reply).toContain('/modeller yenile')
  })

  it.each(['/model varsayilan', '/model varsayılan', '/model VARSAYILAN'])('"%s" clears state.model', async (text) => {
    const { reply, state } = await run(text, harness(), blankState({ model: GEMINI.id }))
    expect('model' in state).toBe(false)
    expect(reply).toContain('varsayılan')
    expect(reply).toContain('openai/gpt-5-mini')
  })
})

describe('/modeller', () => {
  it('lists the featured aliases with their model and price, "yok" when unresolved, and the total', async () => {
    const { reply } = await run('/modeller')
    expect(reply).toContain('• hizli → openai/gpt-5-mini — 10,30 / 82,40 TL')
    expect(reply).toContain('• gorsel → google/gemini-2.5-flash — 12,36 / 103,00 TL')
    expect(reply).toContain('• ucretsiz → meta-llama/llama-3.3-70b-instruct:free — ücretsiz')
    expect(reply).toContain('• eski → yok')
    expect(reply).toContain('Toplam 3 model. Ara: /modeller <kelime>')
  })

  it('/modeller yenile refreshes the catalog and reports the count', async () => {
    const h = harness()
    const { reply } = await run('/modeller yenile', h)
    expect(h.catalog.refreshCalls).toBe(1)
    expect(reply).toContain('Liste yenilendi: 3 model')
  })

  it('a failed refresh gets a calm notice and keeps the state', async () => {
    const h = harness()
    h.catalog.refreshError = new Error('ağ yok')
    const { reply, state, input } = await run('/modeller yenile', h)
    expect(reply).toContain('yenilenemedi')
    expect(reply).toContain('ağ yok')
    expect(state).toBe(input)
  })

  it('searches by a keyword and lists matches one per line', async () => {
    const { reply } = await run('/modeller gemini')
    const lines = reply.split('\n')
    expect(lines[0]).toContain('"gemini"')
    expect(lines[0]).toContain('1 sonuç')
    expect(lines.filter((l) => l.startsWith('• '))).toEqual(['• google/gemini-2.5-flash — 12,36 / 103,00 TL'])
    expect(reply).toContain('/model <ad>')
  })

  it('says so when a search has no match', async () => {
    const { reply } = await run('/modeller yokboyle')
    expect(reply).toContain('bulunamadı')
    expect(reply).toContain('/modeller yenile')
  })

  it('shows at most 15 matches and points to a narrower search', async () => {
    const many = Array.from({ length: 22 }, (_, i): ModelInfo => ({
      id: `meta-llama/llama-3.3-70b-instruct-${i}:free`,
      name: `Llama ${i}`,
      inputModalities: ['text'],
      pricing: { promptUsdPerToken: 0.9 / 1e6, completionUsdPerToken: 0.9 / 1e6 },
    }))
    const { reply } = await run('/modeller llama', harness({ models: many }))
    expect(reply.split('\n').filter((l) => l.startsWith('• '))).toHaveLength(15)
    expect(reply).toContain('ilk 15')
    expect(reply).toContain('aramayı daralt')
    expect(reply.length).toBeLessThanOrEqual(MAX_REPLY_CHARS)
  })

  it('never changes the chat state', async () => {
    for (const text of ['/modeller', '/modeller gpt', '/modeller yenile']) {
      const { state, input } = await run(text)
      expect(state).toBe(input)
    }
  })
})

describe('/yeni', () => {
  it('clears the history and keeps model, system prompt and notes', async () => {
    const before = blankState({
      model: GEMINI.id,
      systemPrompt: 'Kısa yaz.',
      notes: ['Eşim Ali'],
      history: [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
        { role: 'assistant', content: 'd' },
      ],
    })
    const { reply, state } = await run('/yeni', harness(), before)
    expect(state.history).toEqual([])
    expect(state.model).toBe(GEMINI.id)
    expect(state.systemPrompt).toBe('Kısa yaz.')
    expect(state.notes).toEqual(['Eşim Ali'])
    expect(state.updatedAt).toBe(NOW)
    expect(before.history).toHaveLength(4)
    expect(reply).toContain('sıfırlandı')
    expect(reply).toContain('4 mesaj')
  })

  it('works through its aliases and is a no-op on an empty history', async () => {
    const { reply, state, input } = await run('/reset')
    expect(reply).toContain('zaten boş')
    expect(state).toBe(input)
    const cleared = await run('/new', harness(), blankState({ history: [{ role: 'user', content: 'x' }] }))
    expect(cleared.state.history).toEqual([])
  })
})

describe('/sistem', () => {
  it('shows the default system prompt', async () => {
    const h = harness({ env: { SYSTEM_PROMPT: 'Sen kısa yanıt veren bir asistansın.' } })
    const { reply, state, input } = await run('/sistem', h)
    expect(reply).toContain('varsayılan')
    expect(reply).toContain('Sen kısa yanıt veren bir asistansın.')
    expect(reply).toContain('/sistem sil')
    expect(state).toBe(input)
  })

  it('sets a per-chat prompt and shows it afterwards', async () => {
    const set = await run('/sistem Hep nazik ol.\nİkinci satır.')
    expect(set.state.systemPrompt).toBe('Hep nazik ol.\nİkinci satır.')
    expect(set.reply).toContain('güncellendi')
    const shown = await run('/sistem', set.h, set.state)
    expect(shown.reply).toContain('bu sohbete özel')
    expect(shown.reply).toContain('Hep nazik ol.')
  })

  it.each(['/sistem sil', '/sistem SİL', '/sistem varsayilan'])('"%s" resets to the default', async (text) => {
    const { reply, state } = await run(text, harness(), blankState({ systemPrompt: 'Özel.' }))
    expect('systemPrompt' in state).toBe(false)
    expect(reply).toContain('varsayılana döndü')
  })

  it('refuses an enormous prompt', async () => {
    const { reply, state, input } = await run(`/sistem ${'söz '.repeat(2000)}`)
    expect(reply).toContain('çok uzun')
    expect(state).toBe(input)
  })

  it('clips the echo of a long prompt so the reply stays short', async () => {
    const { reply } = await run(`/sistem ${'söz '.repeat(900)}`)
    expect(reply.length).toBeLessThan(500)
  })
})

describe('/not', () => {
  it('lists an empty note book with a hint', async () => {
    const { reply } = await run('/not')
    expect(reply).toContain('Not yok')
    expect(reply).toContain('/not ekle')
  })

  it('adds a note, shows it numbered, and does not mutate the input state', async () => {
    const added = await run('/not ekle Kızım Ayşe 12 yaşında')
    expect(added.state.notes).toEqual(['Kızım Ayşe 12 yaşında'])
    expect(added.input.notes).toEqual([])
    expect(added.reply).toContain('Not eklendi (1)')
    const list = await run('/not', added.h, added.state)
    expect(list.reply).toContain('1. Kızım Ayşe 12 yaşında')
    expect(list.reply).toContain('/not sil')
    expect(list.state).toBe(added.state)
  })

  it('flattens a multi-line note into one line', async () => {
    const { state } = await run('/not ekle ilk satır\nikinci   satır')
    expect(state.notes).toEqual(['ilk satır ikinci satır'])
  })

  it('"/not ekle" without text explains how', async () => {
    const { reply, state, input } = await run('/not ekle')
    expect(reply).toContain('boş')
    expect(state).toBe(input)
  })

  it.each([
    'şifrem: hunter2abc',
    'Banka PIN kodum 4821dir',
    'sk-proj-abcdefghijklmnopqrstuvwx',
    'kart 4111 1111 1111 1111',
  ])('refuses to save a secret: %s', async (secret) => {
    const { reply, state, input } = await run(`/not ekle ${secret}`)
    expect(state).toBe(input)
    expect(state.notes).toEqual([])
    expect(reply).toContain('Kaydetmedim')
    expect(reply).toMatch(/şifre|anahtar/)
    expect(reply).not.toContain(secret)
  })

  it('accepts an ordinary note that merely mentions the word', async () => {
    const { state } = await run('/not ekle Wi-Fi şifresini kimseyle paylaşma')
    expect(state.notes).toHaveLength(1)
  })

  it('removes a note by its number', async () => {
    const start = blankState({ notes: ['bir', 'iki', 'üç'] })
    const { reply, state } = await run('/not sil 2', harness(), start)
    expect(state.notes).toEqual(['bir', 'üç'])
    expect(reply).toContain('Not silindi: iki')
    expect(start.notes).toEqual(['bir', 'iki', 'üç'])
  })

  it.each(['/not sil', '/not sil 0', '/not sil 9', '/not sil abc', '/not sil 1.5'])(
    'asks for a valid number on "%s"',
    async (text) => {
      const { reply, state, input } = await run(text, harness(), blankState({ notes: ['bir', 'iki'] }))
      expect(reply).toContain('Hangi not?')
      expect(reply).toContain('1 ile 2')
      expect(state).toBe(input)
    },
  )

  it('says there is nothing to delete on an empty list', async () => {
    expect((await run('/not sil 1')).reply).toContain('Silinecek not yok')
  })

  it('caps the number of notes and the length of one note', async () => {
    const full = blankState({ notes: Array.from({ length: MAX_NOTES }, (_, i) => `not ${i}`) })
    const capped = await run('/not ekle bir tane daha', harness(), full)
    expect(capped.reply).toContain(`En fazla ${MAX_NOTES} not`)
    expect(capped.state).toBe(full)
    const long = await run(`/not ekle ${'kelime '.repeat(100)}`)
    expect(long.reply).toContain('çok uzun')
    expect(long.state.notes).toEqual([])
  })

  it('keeps even a full note list inside the reply limit', async () => {
    const notes = Array.from({ length: MAX_NOTES }, (_, i) => `${i} ${'uzun not metni '.repeat(30)}`.slice(0, 480))
    const { reply } = await run('/not', harness(), blankState({ notes }))
    expect(reply.length).toBeLessThanOrEqual(MAX_REPLY_CHARS)
    expect(reply).toContain(`${MAX_NOTES}. `)
  })

  it('explains the usage for an unknown sub-command', async () => {
    expect((await run('/not bir şey')).reply).toContain('Kullanım')
  })
})

describe('/maliyet', () => {
  it('shows today, this month and all time with TL and dollars, counts, the rate and the closing line', async () => {
    const { reply, state, input } = await run('/maliyet')
    const lines = reply.split('\n')
    expect(lines).toContain('Bugün: 0,51 TL ($0.0123) · 3 mesaj')
    expect(lines).toContain('Bu ay: 37,08 TL ($0.9000) · 40 mesaj (2 mesajın maliyeti bilinmiyor)')
    expect(lines).toContain('Toplam: 103,00 TL ($2.50) · 120 mesaj')
    expect(reply).toContain('Kullanılan kur: 1 $ = 41,20 TL (TCMB)')
    expect(lines.at(-1)).toBe('Rakamlar yaklaşıktır; kesin tutar sağlayıcı panelinde.')
    expect(state).toBe(input)
  })

  it('lists the top five models of the month, biggest first', async () => {
    const { reply } = await run('/maliyet')
    const lines = reply.split('\n')
    const start = lines.indexOf('Bu ayın modelleri:')
    expect(start).toBeGreaterThan(0)
    const models = lines.slice(start + 1, start + 6)
    expect(models.map((l) => l.split(' — ')[0])).toEqual([
      `• ${GPT.id}`,
      `• ${GEMINI.id}`,
      '• m/six',
      '• m/four',
      '• m/five',
    ])
    expect(models[0]).toBe(`• ${GPT.id} — 16,48 TL ($0.4000) · 20 mesaj`)
    expect(reply).not.toContain('m/cheap')
  })

  it('shows dollars only and says so when there is no rate', async () => {
    const { reply } = await run('/maliyet', harness({ fxRate: null }))
    expect(reply).toContain('Bugün: $0.0123 · 3 mesaj')
    expect(reply).toContain('Toplam: $2.50 · 120 mesaj')
    expect(reply).toContain('kur yok, yalnızca $')
    expect(reply).not.toMatch(/\d TL/)
    expect(reply.split('\n').at(-1)).toBe('Rakamlar yaklaşıktır; kesin tutar sağlayıcı panelinde.')
  })

  it('names the rate source', async () => {
    const h = harness({ fxRate: { rate: 40, source: 'manual', asOf: NOW } })
    expect((await run('/maliyet', h)).reply).toContain('Kullanılan kur: 1 $ = 40,00 TL (elle)')
  })

  it('handles an empty ledger', async () => {
    const empty = { today: zero(), month: zero(), all: zero() }
    const { reply } = await run('/maliyet', harness({ ledger: empty }))
    expect(reply).toContain('Bugün: 0,00 TL ($0.00) · 0 mesaj')
    expect(reply).not.toContain('Bu ayın modelleri')
  })

  it('converts at the current rate when the ledger holds dollars without any TL figure', async () => {
    const unrated = { today: zero(), month: { ...zero(), count: 1, usd: 1 }, all: zero() }
    const { reply } = await run('/maliyet', harness({ ledger: unrated }))
    expect(reply).toContain('Bu ay: 41,20 TL ($1.00) · 1 mesaj')
  })

  it('works through /cost and stays within the reply limit', async () => {
    const { reply } = await run('/cost')
    expect(reply).toContain('*Maliyet*')
    expect(reply.length).toBeLessThanOrEqual(MAX_REPLY_CHARS)
  })
})

describe('/butce', () => {
  it('shows "sınırsız" when no budget is set', async () => {
    const { reply, state, input } = await run('/butce')
    expect(reply).toContain('Aylık bütçe: sınırsız')
    expect(reply).toContain('Bu ay: 37,08 TL')
    expect(reply).toContain('/butce 300')
    expect(state).toBe(input)
  })

  it('shows spend against the budget: percentage and what is left', async () => {
    const { reply } = await run('/butce', harness({ settings: { monthlyBudgetTl: 300 } }))
    expect(reply).toContain('Aylık bütçe: 300,00 TL')
    expect(reply).toContain('Bu ay: 37,08 TL (%12)')
    expect(reply).toContain('Kalan: 262,92 TL')
  })

  it('says the budget is used up once the month reaches it', async () => {
    const { reply } = await run('/butce', harness({ settings: { monthlyBudgetTl: 37.08 } }))
    expect(reply).toContain('Bütçe doldu')
    expect(reply).not.toContain('Kalan')
  })

  it('falls back to the .env budget until a runtime budget is set', async () => {
    const h = harness({ env: { MONTHLY_BUDGET_TL: '100' } })
    expect(effectiveBudget(h.ctx)).toBe(100)
    expect((await run('/butce', h)).reply).toContain('Aylık bütçe: 100,00 TL')
    await h.settings.set({ monthlyBudgetTl: 0 })
    expect(effectiveBudget(h.ctx)).toBe(0)
  })

  it.each([
    ['/butce 500', 500],
    ['/butce 1.500', 1500],
    ['/butce 250,50', 250.5],
    ['/butce 300 TL', 300],
    ['/butce ₺400', 400],
    ['/butce 1.250,75', 1250.75],
    ['/butce 0', 0],
  ])('"%s" stores %s in the settings', async (text, expected) => {
    const h = harness()
    const { reply, state, input } = await run(text, h)
    expect(h.settings.get().monthlyBudgetTl).toBe(expected)
    expect(reply).toContain(expected === 0 ? 'sınırsız' : 'ayarlandı')
    expect(state).toBe(input) // the budget lives in settings, not in the chat
  })

  it.each(['/butce sil', '/butce sınırsız'])('"%s" removes the limit', async (text) => {
    const h = harness({ settings: { monthlyBudgetTl: 300 } })
    const { reply } = await run(text, h)
    expect(h.settings.get().monthlyBudgetTl).toBe(0)
    expect(reply).toContain('sınırsız')
  })

  it.each(['/butce abc', '/butce -5', '/butce 1,2,3', '/butce 12abc'])(
    'refuses "%s" and keeps the old value',
    async (text) => {
      const h = harness({ settings: { monthlyBudgetTl: 300 } })
      const { reply } = await run(text, h)
      expect(reply).toContain('sayı olmalı')
      expect(h.settings.get().monthlyBudgetTl).toBe(300)
    },
  )

  it('reports the new budget against this month right away', async () => {
    const { reply } = await run('/butce 30')
    expect(reply).toContain('Aylık bütçe ayarlandı: 30,00 TL.')
    expect(reply).toContain('Bütçe doldu')
  })
})

describe('/kur', () => {
  it('shows the rate, its source and its age in hours', async () => {
    const { reply, state, input } = await run('/kur')
    expect(reply).toContain('1 $ = 41,20 TL')
    expect(reply).toContain('Kaynak: TCMB')
    expect(reply).toContain('2 saat önce')
    expect(state).toBe(input)
  })

  it.each([
    ['tcmb', 'TCMB'],
    ['frankfurter', 'frankfurter'],
    ['erapi', 'er-api'],
    ['manual', 'elle'],
    ['cache', 'önbellek'],
  ] as const)('labels the source %s as %s', async (source, label) => {
    const h = harness({ fxRate: { rate: 40, source, asOf: NOW - 3 * HOUR } })
    expect((await run('/kur', h)).reply).toContain(`Kaynak: ${label} · 3 saat önce`)
  })

  it('shows fractional hours and treats a very fresh rate as under an hour', async () => {
    const half = harness({ fxRate: { rate: 40, source: 'tcmb', asOf: NOW - 2.5 * HOUR } })
    expect((await run('/kur', half)).reply).toContain('2,5 saat önce')
    const fresh = harness({ fxRate: { rate: 40, source: 'tcmb', asOf: NOW - 10 * 60_000 } })
    expect((await run('/kur', fresh)).reply).toContain('bir saatten yeni')
  })

  it('offers a manual rate when none could be fetched', async () => {
    const { reply } = await run('/kur', harness({ fxRate: null }))
    expect(reply).toContain('Kur alınamadı')
    expect(reply).toContain('/kur 41.2')
  })

  it.each([
    ['/kur 41.2', 41.2],
    ['/kur 41,2', 41.2],
    ['/kur 42', 42],
  ])('"%s" sets the manual rate to %s', async (text, expected) => {
    const h = harness()
    const { reply } = await run(text, h)
    expect(h.fx.setManual).toHaveBeenCalledWith(expected)
    expect(reply).toContain('elle ayarlandı')
    expect(reply).toContain(`1 $ = ${expected === 42 ? '42,00' : '41,20'} TL`)
  })

  it.each(['/kur abc', '/kur 0', '/kur -3', '/kur 1,2,3'])(
    'refuses "%s" without touching the service',
    async (text) => {
      const h = harness()
      const { reply } = await run(text, h)
      expect(reply).toContain('pozitif bir sayı')
      expect(h.fx.setManual).not.toHaveBeenCalled()
    },
  )

  it.each(['/kur guncelle', '/kur güncelle', '/kur GÜNCELLE'])('"%s" refreshes the rate', async (text) => {
    const h = harness({ refreshed: { rate: 42.5, source: 'frankfurter', asOf: NOW } })
    const { reply } = await run(text, h)
    expect(h.fx.refresh).toHaveBeenCalledTimes(1)
    expect(reply).toContain('Kur yenilendi')
    expect(reply).toContain('1 $ = 42,50 TL')
    expect(reply).toContain('Kaynak: frankfurter')
  })

  it('says so, calmly, when the refresh finds nothing', async () => {
    const h = harness({ refreshed: undefined })
    const { reply } = await run('/kur guncelle', h)
    expect(reply).toContain('yenilenemedi')
    expect(reply).toContain('/kur 41.2')
  })

  it('treats a throwing refresh like an empty one', async () => {
    const h = harness()
    h.fx.refresh.mockRejectedValueOnce(new Error('boom'))
    expect((await run('/kur guncelle', h)).reply).toContain('yenilenemedi')
  })
})

describe('/durum', () => {
  it('summarizes provider, model, history, notes, rate, budget, footer and uptime', async () => {
    const start = blankState({
      notes: ['Eşim Ali'],
      history: [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ],
    })
    const { reply, state } = await run('/durum', harness(), start)
    expect(reply).toContain('Sağlayıcı: openrouter (openrouter.ai)')
    expect(reply).toContain('Model: openai/gpt-5-mini (varsayılan)')
    expect(reply).toContain('Geçmiş: 2 mesaj · Not: 1')
    expect(reply).toContain('Katalog: 3 model')
    expect(reply).toContain('Kur: 1 $ = 41,20 TL (TCMB)')
    expect(reply).toContain('Bütçe: sınırsız · bu ay 37,08 TL')
    expect(reply).toContain('Altbilgi: açık')
    expect(reply).toContain('Çalışma süresi: 1 gün 2 saat')
    expect(state).toBe(start)
  })

  it('shows the chat model without "(varsayılan)"', async () => {
    const { reply } = await run('/status', harness(), blankState({ model: GEMINI.id }))
    expect(reply).toContain('Model: google/gemini-2.5-flash\n')
  })

  it('shows budget use, and when it is used up', async () => {
    const open = await run('/durum', harness({ settings: { monthlyBudgetTl: 300 } }))
    expect(open.reply).toContain('Bütçe: bu ay 37,08 TL / 300,00 TL')
    expect(open.reply).not.toContain('doldu')
    const spent = await run('/durum', harness({ settings: { monthlyBudgetTl: 20 } }))
    expect(spent.reply).toContain('Bütçe: bu ay 37,08 TL / 20,00 TL · doldu')
  })

  it('has a line for a missing rate, a closed footer and a short uptime', async () => {
    const h = harness({ fxRate: null, settings: { costFooter: false }, startedAt: NOW - 5 * 60_000 })
    const { reply } = await run('/durum', h)
    expect(reply).toContain('Kur: yok (yalnızca $)')
    expect(reply).toContain('Altbilgi: kapalı')
    expect(reply).toContain('Çalışma süresi: 5 dk')
  })

  it('formats hours of uptime', async () => {
    const h = harness({ startedAt: NOW - (3 * 60 + 7) * 60_000 })
    expect((await run('/durum', h)).reply).toContain('Çalışma süresi: 3 saat 7 dk')
  })
})

describe('/izin', () => {
  it('is for the owner only', async () => {
    const h = harness()
    for (const text of ['/izin', '/izin ekle 905321234567', '/izin sil 905321234567']) {
      const { reply, state, input } = await run(text, h, blankState(), STRANGER)
      expect(reply).toBe('Bu komut yalnızca hesap sahibi için.')
      expect(state).toBe(input)
    }
    expect(h.access.add).not.toHaveBeenCalled()
    expect(h.access.remove).not.toHaveBeenCalled()
  })

  it('lists nobody at first, then the numbers that were added', async () => {
    const h = harness()
    expect((await run('/izin', h)).reply).toContain('İzinli numara yok')
    await run('/izin ekle 905321234567', h)
    await run('/izin ekle 905441112233', h)
    const { reply } = await run('/izin', h)
    expect(reply).toContain('• 905321234567')
    expect(reply).toContain('• 905441112233')
    expect(reply).toContain('/izin sil')
  })

  it('adds a number typed the way people type it', async () => {
    const h = harness()
    const { reply } = await run('/izin ekle +90 (532) 123 45 67', h)
    expect(h.access.added).toEqual(['905321234567'])
    expect(reply).toContain('Eklendi: 905321234567')
  })

  it('shows the access module message for a bad number', async () => {
    const h = harness()
    const { reply } = await run('/izin ekle 12', h)
    expect(reply).toContain('Numara ülke koduyla')
    expect(h.access.added).toEqual([])
  })

  it('removes a number, and says so when it was not on the list', async () => {
    const h = harness()
    await run('/izin ekle 905321234567', h)
    const done = await run('/izin sil +90 532 123 45 67', h)
    expect(done.reply).toContain('Silindi: 905321234567')
    const missing = await run('/izin sil 905321234567', h)
    expect(missing.reply).toContain('listede yok')
  })

  it('explains the usage when the number is missing or the sub-command is unknown', async () => {
    const h = harness()
    for (const text of ['/izin ekle', '/izin sil', '/izin sil abc', '/izin bilmem']) {
      expect((await run(text, h)).reply).toContain('Kullanım: /izin')
    }
    expect(h.access.remove).not.toHaveBeenCalled()
  })

  it('keeps a long allow list inside the reply limit', async () => {
    const h = harness()
    for (let i = 0; i < 200; i++) await h.access.add(`90532${String(1000000 + i)}`)
    const { reply } = await run('/izin', h)
    expect(reply.length).toBeLessThanOrEqual(MAX_REPLY_CHARS)
    expect(reply.endsWith('…')).toBe(true)
  })
})

describe('/altbilgi', () => {
  it('toggles the cost footer, starting from the .env value', async () => {
    const h = harness()
    expect(effectiveFooter(h.ctx)).toBe(true)
    const off = await run('/altbilgi', h)
    expect(h.settings.get().costFooter).toBe(false)
    expect(off.reply).toContain('kapalı')
    const on = await run('/altbilgi', h)
    expect(h.settings.get().costFooter).toBe(true)
    expect(on.reply).toContain('açık')
  })

  it('starts from a footer that .env switched off', async () => {
    const h = harness({ env: { COST_FOOTER: 'false' } })
    expect(effectiveFooter(h.ctx)).toBe(false)
    await run('/altbilgi', h)
    expect(h.settings.get().costFooter).toBe(true)
  })

  it.each([
    ['/altbilgi aç', true],
    ['/altbilgi ac', true],
    ['/altbilgi kapat', false],
    ['/altbilgi KAPALI', false],
  ])('"%s" sets the footer explicitly', async (text, expected) => {
    const h = harness({ settings: { costFooter: !expected } })
    await run(text, h)
    expect(h.settings.get().costFooter).toBe(expected)
  })

  it('does not touch the chat state', async () => {
    const { state, input } = await run('/altbilgi')
    expect(state).toBe(input)
  })
})

describe('all commands', () => {
  const samples = [
    '/yardim',
    '/model',
    '/model hizli',
    '/model mini',
    '/modeller',
    '/modeller gpt',
    '/modeller yenile',
    '/yeni',
    '/sistem',
    '/sistem Kısa yaz',
    '/not',
    '/not ekle Merhaba',
    '/maliyet',
    '/butce',
    '/butce 100',
    '/kur',
    '/kur 40',
    '/kur guncelle',
    '/durum',
    '/izin',
    '/altbilgi',
    '/bilinmeyen',
  ]

  it('never call the model, answer in Turkish within the reply limit, and use no Markdown headers or red marks', async () => {
    const h = harness({ refreshed: { rate: 42, source: 'tcmb', asOf: NOW } })
    for (const text of samples) {
      const { reply } = await run(text, h)
      expect(reply.trim(), text).not.toBe('')
      expect(reply.length, text).toBeLessThanOrEqual(MAX_REPLY_CHARS)
      expect(
        reply.split('\n').some((l) => /^#{1,6}\s/.test(l)),
        text,
      ).toBe(false)
      expect(reply, text).not.toMatch(/[❌✖✗]/u)
    }
    expect(h.llm.chat).not.toHaveBeenCalled()
    expect(h.llm.listModels).not.toHaveBeenCalled()
  })

  it('turn a failing service into a calm notice instead of throwing', async () => {
    const h = harness()
    ;(h.ledger.today as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('disk dolu'))
    const { reply, state, input } = await run('/maliyet', h)
    expect(reply).toContain('çalışmadı')
    expect(reply).not.toContain('disk dolu')
    expect(state).toBe(input)
  })

  it('treat a failing rate service as "no rate" instead of failing', async () => {
    const h = harness()
    h.fx.rate.mockRejectedValue(new Error('offline'))
    const { reply } = await run('/maliyet', h)
    expect(reply).toContain('kur yok, yalnızca $')
  })
})
