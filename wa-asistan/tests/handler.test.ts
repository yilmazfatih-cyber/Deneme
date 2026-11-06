import pino, { type Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config.js'
import {
  DEDUP_TTL_MS,
  DOCUMENT_MAX_BYTES,
  EMPTY_REPLY,
  GENERIC_ERROR,
  IMAGE_MAX_BYTES,
  REPLY_CHUNK_CHARS,
  STOP_WAIT_MS,
  UNKNOWN_COMMAND,
  createHandler,
  llmNotice,
  type Handler,
} from '../src/core/handler.js'
import { summarize } from '../src/core/ledger.js'
import {
  LlmError,
  type AccessControl,
  type AppContext,
  type Catalog,
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
  type ChatState,
  type ChatStore,
  type ContentPart,
  type FxRate,
  type InboundMedia,
  type InboundMessage,
  type LedgerEntry,
  type Ledger,
  type LlmClient,
  type ModelInfo,
  type Sender,
  type Settings,
  type SettingsStore,
  type Transcriber,
} from '../src/core/types.js'

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

/** 2 November 2026, 11:00 UTC. */
const NOW = Date.UTC(2026, 10, 2, 11, 0, 0)
const SELF = '905320000001@s.whatsapp.net'
const FRIEND = '905551112233@s.whatsapp.net'
const STRANGER = '905559998877@s.whatsapp.net'
const GROUP = '120363012345678901@g.us'

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
const AUTO: ModelInfo = { id: 'openrouter/auto', name: 'Auto Router', inputModalities: ['text'] }
const MYSTERY: ModelInfo = { id: 'acme/mystery', name: 'Acme Mystery', inputModalities: ['text', 'image'] }
const MODELS = [GPT, GEMINI, AUTO, MYSTERY]

function must<T>(v: T | undefined | null): T {
  if (v === undefined || v === null) throw new Error('expected a value')
  return v
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = (ms = 15) => new Promise<void>((r) => setTimeout(r, ms))

/** A scripted model answer. 0.003 USD × 40 = 0.12 TL, the spec's footer example. */
const answer = (text: string, over: Partial<ChatResult> = {}): ChatResult => ({
  text,
  model: GPT.id,
  usage: { promptTokens: 120, completionTokens: 30, costUsd: 0.003 },
  finishReason: 'stop',
  ...over,
})

// ---------------------------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------------------------

class FakeSender implements Sender {
  /** ordered log of everything the handler did to the chat: `typing:on:<jid>`, `send:<jid>`, `typing:off:<jid>` */
  events: string[] = []
  sent: Array<{ chat: string; text: string; id: string }> = []
  failSend: Error | undefined
  failTyping = false
  private n = 0

  async sendText(chatJid: string, text: string): Promise<string> {
    this.events.push(`send:${chatJid}`)
    if (this.failSend) throw this.failSend
    const id = `BOT${++this.n}`
    this.sent.push({ chat: chatJid, text, id })
    return id
  }

  async typing(chatJid: string, on: boolean): Promise<void> {
    this.events.push(`typing:${on ? 'on' : 'off'}:${chatJid}`)
    if (this.failTyping) throw new Error('presence failed')
  }
}

type Step = ChatResult | Error | Promise<ChatResult> | ((req: ChatRequest) => ChatResult | Promise<ChatResult>)

class FakeLlm implements LlmClient {
  requests: ChatRequest[] = []
  script: Step[] = []
  fallback: ChatResult = answer('Merhaba! Nasıl yardımcı olabilirim?')

  async chat(req: ChatRequest): Promise<ChatResult> {
    this.requests.push(req)
    const step = this.script.shift() ?? this.fallback
    if (step instanceof Error) throw step
    if (typeof step === 'function') return step(req)
    return step
  }

  async listModels(): Promise<ModelInfo[]> {
    return []
  }
}

class FakeCatalog implements Catalog {
  constructor(private readonly models: ModelInfo[]) {}
  all(): ModelInfo[] {
    return this.models
  }
  get(id: string): ModelInfo | undefined {
    return this.models.find((m) => m.id === id)
  }
  search(): ModelInfo[] {
    return []
  }
  resolve(): ReturnType<Catalog['resolve']> {
    return { kind: 'none' }
  }
  featured(): Array<{ alias: string; model?: ModelInfo }> {
    return []
  }
  async refresh(): Promise<void> {}
  age(): number | undefined {
    return undefined
  }
}

class FakeLedger implements Ledger {
  entries: LedgerEntry[] = []
  failAppend = false
  async append(e: LedgerEntry): Promise<void> {
    if (this.failAppend) throw new Error('disk full')
    this.entries.push(e)
  }
  async summary() {
    return summarize(this.entries)
  }
  async today() {
    return summarize(this.entries)
  }
  async month() {
    return summarize(this.entries)
  }
  async allTime() {
    return summarize(this.entries)
  }
}

class MemoryStore implements ChatStore {
  states = new Map<string, ChatState>()
  saves: ChatState[] = []
  failLoad = false
  failSave = false

  async load(chatJid: string): Promise<ChatState> {
    if (this.failLoad) throw new Error('read error')
    const found = this.states.get(chatJid)
    return found ? structuredClone(found) : { chatJid, history: [], notes: [], updatedAt: 0 }
  }

  async save(state: ChatState): Promise<void> {
    if (this.failSave) throw new Error('write error')
    this.saves.push(structuredClone(state))
    this.states.set(state.chatJid, structuredClone(state))
  }

  seed(state: Partial<ChatState> & { chatJid: string }): void {
    this.states.set(state.chatJid, { history: [], notes: [], updatedAt: 1, ...state })
  }
}

class FakeAccess implements AccessControl {
  owners = new Set<string>([SELF])
  allowed = new Set<string>([FRIEND])
  added: string[] = []
  isOwner(jid: string): boolean {
    return this.owners.has(jid)
  }
  isAllowed(jid: string): boolean {
    return this.owners.has(jid) || this.allowed.has(jid)
  }
  list(): string[] {
    return [...this.allowed]
  }
  async add(phone: string): Promise<string> {
    const digits = phone.replace(/\D+/g, '')
    this.added.push(digits)
    this.allowed.add(`${digits}@s.whatsapp.net`)
    return digits
  }
  async remove(phone: string): Promise<boolean> {
    return this.allowed.delete(`${phone.replace(/\D+/g, '')}@s.whatsapp.net`)
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

interface HarnessOptions {
  env?: Record<string, string>
  stt?: Transcriber
  /** pass `null` for "no USD→TRY rate available" */
  rate?: FxRate | null
  settings?: Settings
}

interface Harness {
  handler: Handler
  ctx: AppContext
  clock: { now: number }
  sender: FakeSender
  llm: FakeLlm
  store: MemoryStore
  ledger: FakeLedger
  access: FakeAccess
  settings: SettingsStore
  fx: { rate: ReturnType<typeof vi.fn<() => Promise<FxRate | undefined>>> }
  log: Logger
  texts(): string[]
}

function harness(opts: HarnessOptions = {}): Harness {
  const config = loadConfig(
    { LLM_API_KEY: 'test-key', DEFAULT_MODEL: GPT.id, ...opts.env },
    '/tmp/wa-asistan-handler-test',
  )
  const clock = { now: NOW }
  const sender = new FakeSender()
  const llm = new FakeLlm()
  const store = new MemoryStore()
  const ledger = new FakeLedger()
  const access = new FakeAccess()
  const settings = memorySettings(opts.settings)
  const log = pino({ level: 'silent' })
  const rate: FxRate | undefined =
    opts.rate === null ? undefined : (opts.rate ?? { rate: 40, source: 'manual', asOf: NOW })
  const fx = { rate: vi.fn(async () => rate) }
  const ctx: AppContext = {
    config,
    llm,
    catalog: new FakeCatalog(MODELS),
    ...(opts.stt ? { stt: opts.stt } : {}),
    fx: {
      rate: fx.rate,
      refresh: async () => rate,
      setManual: async (r) => ({ rate: r, source: 'manual', asOf: NOW }),
    },
    ledger,
    store,
    access,
    settings,
    sender,
    log,
    now: () => clock.now,
    startedAt: NOW - 3_600_000,
  }
  return {
    handler: createHandler(ctx),
    ctx,
    clock,
    sender,
    llm,
    store,
    ledger,
    access,
    settings,
    fx,
    log,
    texts: () => sender.sent.map((s) => s.text),
  }
}

let seq = 0

/** The owner writing in the "message yourself" chat. */
function selfMsg(text: string, over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: `IN${++seq}`,
    chatJid: SELF,
    senderJid: SELF,
    fromMe: true,
    isSelfChat: true,
    isGroup: false,
    text,
    timestamp: NOW,
    ...over,
  }
}

/** A direct message from someone else. */
function dmMsg(text: string, from = FRIEND, over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: `IN${++seq}`,
    chatJid: from,
    senderJid: from,
    fromMe: false,
    isSelfChat: false,
    isGroup: false,
    text,
    timestamp: NOW,
    ...over,
  }
}

function media(
  kind: InboundMedia['kind'],
  mime: string,
  data: Buffer = Buffer.from('x'),
  over: Partial<InboundMedia> = {},
): InboundMedia {
  return { kind, mime, download: vi.fn(async () => data), ...over }
}

const downloads = (m: InboundMedia | undefined) => vi.mocked(must(m).download).mock.calls.length

const lastRequest = (h: Harness): ChatRequest => must(h.llm.requests[h.llm.requests.length - 1])

function userContent(req: ChatRequest): string | ContentPart[] {
  return must(req.messages[req.messages.length - 1]).content
}

const seedSpend = (h: Harness, tl: number, extra: Partial<LedgerEntry> = {}) =>
  h.ledger.entries.push({
    ts: NOW,
    chatJid: SELF,
    model: GPT.id,
    promptTokens: 1,
    completionTokens: 1,
    usd: tl / 40,
    usdSource: 'provider',
    rate: 40,
    tl,
    ...extra,
  })

// ---------------------------------------------------------------------------------------------
// Who gets an answer
// ---------------------------------------------------------------------------------------------

describe('handler: who gets an answer', () => {
  it('answers the owner in the self chat, writes the ledger entry and appends the footer', async () => {
    const h = harness()
    await h.handler.handle(selfMsg('Merhaba'))

    expect(h.llm.requests).toHaveLength(1)
    const req = lastRequest(h)
    expect(req.model).toBe(GPT.id)
    expect(req.maxTokens).toBe(h.ctx.config.maxOutputTokens)
    expect(req.messages[0]?.role).toBe('system')
    expect(String(req.messages[0]?.content)).toContain('Bugün:')
    expect(userContent(req)).toBe('Merhaba')

    expect(h.sender.sent).toEqual([
      {
        chat: SELF,
        text: 'Merhaba! Nasıl yardımcı olabilirim?\n\n_≈ 0,12 TL · openai/gpt-5-mini_',
        id: 'BOT1',
      },
    ])

    expect(h.ledger.entries).toHaveLength(1)
    const entry = must(h.ledger.entries[0])
    expect(entry).toMatchObject({
      ts: NOW,
      chatJid: SELF,
      model: GPT.id,
      promptTokens: 120,
      completionTokens: 30,
      usd: 0.003,
      usdSource: 'provider',
      rate: 40,
    })
    expect(entry.tl).toBeCloseTo(0.12, 10)
  })

  it('shows typing before the reply and clears it afterwards', async () => {
    const h = harness()
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.sender.events).toEqual([`typing:on:${SELF}`, `send:${SELF}`, `typing:off:${SELF}`])
  })

  it('persists the turn: user text and assistant text land in the chat history', async () => {
    const h = harness()
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.store.saves).toHaveLength(1)
    expect(h.store.saves[0]).toMatchObject({
      chatJid: SELF,
      updatedAt: NOW,
      history: [
        { role: 'user', content: 'Merhaba' },
        { role: 'assistant', content: 'Merhaba! Nasıl yardımcı olabilirim?' },
      ],
    })
  })

  it('ignores the id of a message the bot sent itself (echo), whether learned from noteSent or from sendText', async () => {
    const h = harness()
    h.handler.noteSent('WAID-1')
    await h.handler.handle(selfMsg('bot says this', { id: 'WAID-1' }))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.sender.events).toEqual([])

    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.llm.requests).toHaveLength(1)
    const sentId = must(h.sender.sent[0]).id
    await h.handler.handle(selfMsg('Merhaba! Nasıl yardımcı olabilirim?', { id: sentId }))
    expect(h.llm.requests).toHaveLength(1)
    expect(h.sender.sent).toHaveLength(1)
  })

  it('remembers the ids of every notice and chunk it sends, too', async () => {
    const h = harness()
    await h.handler.handle(selfMsg('/yardim'))
    const sentId = must(h.sender.sent[0]).id
    await h.handler.handle(selfMsg('echo of the help text', { id: sentId }))
    expect(h.sender.sent).toHaveLength(1)
  })

  it('ignores groups, even when the sender is allowed', async () => {
    const h = harness()
    await h.handler.handle(dmMsg('Merhaba', FRIEND, { chatJid: GROUP, isGroup: true }))
    await h.handler.handle(selfMsg('Merhaba', { chatJid: GROUP, isGroup: true, isSelfChat: false }))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.sender.events).toEqual([])
  })

  it('ignores a @g.us chat even when the message is not flagged as a group', async () => {
    const h = harness()
    await h.handler.handle(dmMsg('Merhaba', FRIEND, { chatJid: GROUP }))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.sender.events).toEqual([])
  })

  it('ignores status broadcasts and newsletters', async () => {
    const h = harness()
    await h.handler.handle(dmMsg('durum', FRIEND, { chatJid: 'status@broadcast' }))
    await h.handler.handle(dmMsg('haber', FRIEND, { chatJid: '120363000000000000@newsletter' }))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.sender.events).toEqual([])
  })

  it('never answers a stranger: no message, no typing, no model call; only a debug line', async () => {
    const h = harness()
    const debug = vi.spyOn(h.log, 'debug')
    await h.handler.handle(dmMsg('Merhaba, ben bir yabancıyım', STRANGER))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.sender.events).toEqual([])
    expect(h.ledger.entries).toHaveLength(0)
    expect(h.store.saves).toHaveLength(0)
    expect(debug).toHaveBeenCalled()
  })

  it('answers an allowlisted contact in their own chat and bills that chat', async () => {
    const h = harness()
    await h.handler.handle(dmMsg('Selam', FRIEND))
    expect(h.llm.requests).toHaveLength(1)
    expect(h.sender.sent.map((s) => s.chat)).toEqual([FRIEND])
    expect(must(h.ledger.entries[0]).chatJid).toBe(FRIEND)
    expect(h.store.states.get(FRIEND)?.history).toHaveLength(2)
    expect(h.store.states.has(SELF)).toBe(false)
  })

  it('ignores what the owner writes to other people', async () => {
    const h = harness()
    await h.handler.handle(dmMsg('Akşam görüşürüz', SELF, { chatJid: FRIEND, fromMe: true, isSelfChat: false }))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.sender.events).toEqual([])
  })

  it('ignores the self chat when REPLY_IN_SELF_CHAT is off', async () => {
    const h = harness({ env: { REPLY_IN_SELF_CHAT: 'false' } })
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.sender.events).toEqual([])
    // allowlisted DMs are unaffected
    await h.handler.handle(dmMsg('Selam'))
    expect(h.llm.requests).toHaveLength(1)
  })

  it('ignores an empty message without media', async () => {
    const h = harness()
    await h.handler.handle(selfMsg(''))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.sender.events).toEqual([])
  })

  it('processes a redelivered message only once, until the dedup window has passed', async () => {
    const h = harness()
    const m = selfMsg('Merhaba', { id: 'SAME' })
    await h.handler.handle(m)
    await h.handler.handle(m)
    expect(h.llm.requests).toHaveLength(1)
    expect(h.sender.sent).toHaveLength(1)

    h.clock.now += DEDUP_TTL_MS + 1
    await h.handler.handle(m)
    expect(h.llm.requests).toHaveLength(2)
  })

  it('dedups per chat: the same id in two chats is two messages', async () => {
    const h = harness()
    await h.handler.handle(selfMsg('bir', { id: 'X1' }))
    await h.handler.handle(dmMsg('iki', FRIEND, { id: 'X1' }))
    expect(h.llm.requests).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------------------------
// TRIGGER_PREFIX
// ---------------------------------------------------------------------------------------------

describe('handler: TRIGGER_PREFIX', () => {
  it('ignores messages without the prefix', async () => {
    const h = harness({ env: { TRIGGER_PREFIX: '!' } })
    await h.handler.handle(selfMsg('Merhaba'))
    await h.handler.handle(dmMsg('Selam'))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.sender.events).toEqual([])
  })

  it('strips the prefix (and the space after it) before the model sees the text', async () => {
    const h = harness({ env: { TRIGGER_PREFIX: '!' } })
    await h.handler.handle(selfMsg('!Merhaba'))
    await h.handler.handle(selfMsg('!   Nasılsın'))
    expect(h.llm.requests.map(userContent)).toEqual(['Merhaba', 'Nasılsın'])
    // the stored history has the stripped text, too
    expect(h.store.states.get(SELF)?.history[0]).toEqual({ role: 'user', content: 'Merhaba' })
  })

  it('matches a word prefix case-insensitively, Turkish casing included', async () => {
    const h = harness({ env: { TRIGGER_PREFIX: 'ışık' } })
    await h.handler.handle(selfMsg('IŞIK bugün hava nasıl'))
    expect(h.llm.requests.map(userContent)).toEqual(['bugün hava nasıl'])
  })

  it('still runs commands without the prefix, and never sends them to the model', async () => {
    const h = harness({ env: { TRIGGER_PREFIX: '!' } })
    await h.handler.handle(selfMsg('/yardim'))
    expect(h.llm.requests).toHaveLength(0)
    expect(must(h.sender.sent[0]).text).toContain('Komutlar')
  })

  it('treats a prefixed slash command as a command', async () => {
    const h = harness({ env: { TRIGGER_PREFIX: '!' } })
    await h.handler.handle(selfMsg('! /yardim'))
    expect(h.llm.requests).toHaveLength(0)
    expect(must(h.sender.sent[0]).text).toContain('Komutlar')
  })

  it('ignores a prefix-less caption on media, and a message that is only the prefix', async () => {
    const h = harness({ env: { TRIGGER_PREFIX: '!' } })
    await h.handler.handle(selfMsg('', { media: media('audio', 'audio/ogg') }))
    await h.handler.handle(selfMsg('!'))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.sender.events).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------

describe('handler: commands', () => {
  it('routes slash commands to the command layer and never calls the model', async () => {
    const h = harness()
    for (const text of ['/yardim', '/YARDİM', '/yardım', '/durum', '/maliyet', '/kur', '/not', '/modeller', '/model']) {
      await h.handler.handle(selfMsg(text))
    }
    expect(h.llm.requests).toHaveLength(0)
    expect(h.sender.sent).toHaveLength(9)
    expect(must(h.sender.sent[0]).text).toContain('Komutlar')
  })

  it('answers an unknown command with the one-line hint', async () => {
    const h = harness()
    await h.handler.handle(selfMsg('/foobar'))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.texts()).toEqual(['Bilinmeyen komut: /foobar. Komutlar için /yardim yaz.'])
    expect(UNKNOWN_COMMAND).toBe('Bilinmeyen komut. Komutlar için /yardim yaz.')
  })

  it('saves the state a command changed, and only then', async () => {
    const h = harness()
    h.store.seed({
      chatJid: SELF,
      history: [
        { role: 'user', content: 'eski soru' },
        { role: 'assistant', content: 'eski cevap' },
      ],
    })
    await h.handler.handle(selfMsg('/yardim'))
    expect(h.store.saves).toHaveLength(0)

    await h.handler.handle(selfMsg('/yeni'))
    expect(h.store.saves).toHaveLength(1)
    expect(must(h.store.saves[0]).history).toEqual([])
    expect(h.llm.requests).toHaveLength(0)
  })

  it('applies runtime settings through commands (/butce, /altbilgi) and the next turn honours them', async () => {
    const h = harness()
    await h.handler.handle(selfMsg('/altbilgi'))
    expect(h.settings.get().costFooter).toBe(false)
    await h.handler.handle(selfMsg('Merhaba'))
    expect(must(h.sender.sent[h.sender.sent.length - 1]).text).toBe('Merhaba! Nasıl yardımcı olabilirim?')

    await h.handler.handle(selfMsg('/butce 300'))
    expect(h.settings.get().monthlyBudgetTl).toBe(300)
  })

  it('lets an allowlisted contact use commands but refuses /izin for non-owners', async () => {
    const h = harness()
    await h.handler.handle(dmMsg('/yardim'))
    expect(must(h.sender.sent[0]).chat).toBe(FRIEND)
    await h.handler.handle(dmMsg('/izin ekle 905321234567'))
    expect(h.access.added).toEqual([])
    expect(h.sender.sent).toHaveLength(2)
    expect(h.llm.requests).toHaveLength(0)
  })

  it('lets the owner manage the allowlist from the self chat', async () => {
    const h = harness()
    await h.handler.handle(selfMsg('/izin ekle 905321234567'))
    expect(h.access.added).toEqual(['905321234567'])
  })

  it('runs commands even when the monthly budget is used up', async () => {
    const h = harness({ env: { MONTHLY_BUDGET_TL: '10' } })
    seedSpend(h, 50)
    await h.handler.handle(selfMsg('/maliyet'))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.sender.sent).toHaveLength(1)
    expect(must(h.sender.sent[0]).text).not.toContain('bütçe doldu')
  })

  it('does not bother the typing indicator for commands', async () => {
    const h = harness()
    await h.handler.handle(selfMsg('/yardim'))
    expect(h.sender.events).toEqual([`send:${SELF}`])
  })
})

// ---------------------------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------------------------

describe('handler: images', () => {
  it('replies with a notice and makes no model call when the model cannot see images', async () => {
    const h = harness()
    const m = media('image', 'image/jpeg')
    await h.handler.handle(selfMsg('Bu ne?', { media: m }))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.ledger.entries).toHaveLength(0)
    expect(h.store.saves).toHaveLength(0)
    expect(downloads(m)).toBe(0)
    const text = must(h.texts()[0])
    expect(text).toContain('resim okuyamıyor')
    expect(text).toContain(GPT.id)
    expect(text).toContain('/modeller')
  })

  it('also refuses when the selected model is not in the catalog (support cannot be verified)', async () => {
    const h = harness()
    h.store.seed({ chatJid: SELF, model: 'acme/unlisted' })
    await h.handler.handle(selfMsg('Bu ne?', { media: media('image', 'image/jpeg') }))
    expect(h.llm.requests).toHaveLength(0)
    expect(must(h.texts()[0])).toContain('doğrulayamadım')
  })

  it('sends a vision model the text plus an image_url data URL', async () => {
    const h = harness()
    h.store.seed({ chatJid: SELF, model: GEMINI.id })
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    await h.handler.handle(selfMsg('Bu ne?', { media: media('image', 'image/jpeg', bytes, { sizeBytes: 7 }) }))

    const req = lastRequest(h)
    expect(req.model).toBe(GEMINI.id)
    expect(userContent(req)).toEqual([
      { type: 'text', text: 'Bu ne?' },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${bytes.toString('base64')}` } },
    ])
    // the stored history keeps a placeholder instead of the picture
    expect(h.store.states.get(SELF)?.history[0]).toEqual({ role: 'user', content: 'Bu ne?\n[resim]' })
    expect(must(h.ledger.entries[0]).model).toBe(GPT.id) // the scripted answer says gpt, which the catalog knows
  })

  it('uses a default instruction for an image without caption and respects the declared mime type', async () => {
    const h = harness()
    h.store.seed({ chatJid: SELF, model: GEMINI.id })
    await h.handler.handle(selfMsg('', { media: media('image', 'image/png; charset=binary', Buffer.from('png')) }))
    const content = userContent(lastRequest(h)) as ContentPart[]
    expect(content[0]).toEqual({ type: 'text', text: 'Bu resmi incele.' })
    expect(content[1]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${Buffer.from('png').toString('base64')}` },
    })
  })

  it('refuses images over 5 MB, announced or actual, without a model call', async () => {
    const h = harness()
    h.store.seed({ chatJid: SELF, model: GEMINI.id })
    const announced = media('image', 'image/jpeg', Buffer.from('x'), { sizeBytes: IMAGE_MAX_BYTES + 1 })
    await h.handler.handle(selfMsg('', { media: announced }))
    expect(downloads(announced)).toBe(0)

    const actual = media('image', 'image/jpeg', Buffer.alloc(IMAGE_MAX_BYTES + 1))
    await h.handler.handle(selfMsg('', { media: actual }))
    expect(downloads(actual)).toBe(1)

    expect(h.llm.requests).toHaveLength(0)
    expect(h.texts()).toHaveLength(2)
    expect(h.texts().every((t) => t.includes('5 MB'))).toBe(true)
  })

  it('accepts an image of exactly 5 MB', async () => {
    const h = harness()
    h.store.seed({ chatJid: SELF, model: GEMINI.id })
    await h.handler.handle(selfMsg('', { media: media('image', 'image/jpeg', Buffer.alloc(IMAGE_MAX_BYTES)) }))
    expect(h.llm.requests).toHaveLength(1)
  })

  it('tells the user when the download fails, without blaming', async () => {
    const h = harness()
    h.store.seed({ chatJid: SELF, model: GEMINI.id })
    const broken = media('image', 'image/jpeg', Buffer.alloc(1), {
      download: vi.fn(async () => {
        throw new Error('media expired')
      }),
    })
    await h.handler.handle(selfMsg('', { media: broken }))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.texts()).toEqual(['Dosyayı indiremedim. Tekrar göndermeyi dene.'])
  })
})

describe('handler: voice notes', () => {
  it('without STT: one-line notice, no download, no model call', async () => {
    const h = harness()
    const m = media('audio', 'audio/ogg; codecs=opus', Buffer.from('ogg'), { seconds: 4 })
    await h.handler.handle(selfMsg('', { media: m }))
    expect(h.llm.requests).toHaveLength(0)
    expect(downloads(m)).toBe(0)
    expect(h.texts()).toHaveLength(1)
    expect(must(h.texts()[0])).toContain('STT_BASE_URL')
  })

  it('with STT: transcribes, prefixes the transcript with a microphone and stores it in the history', async () => {
    const transcribe = vi.fn(async () => '  yarın saat üçte toplantı var  ')
    const h = harness({ stt: { transcribe } })
    const bytes = Buffer.from('ogg-bytes')
    await h.handler.handle(selfMsg('', { media: media('audio', 'audio/ogg; codecs=opus', bytes) }))
    expect(transcribe).toHaveBeenCalledWith(bytes, 'audio/ogg; codecs=opus')
    expect(userContent(lastRequest(h))).toBe('🎤 yarın saat üçte toplantı var')
    expect(h.store.states.get(SELF)?.history[0]).toEqual({
      role: 'user',
      content: '🎤 yarın saat üçte toplantı var',
    })
  })

  it('a failing or empty transcription becomes a notice, not a model call', async () => {
    const failing = harness({
      stt: {
        transcribe: async () => {
          throw new Error('stt down')
        },
      },
    })
    await failing.handler.handle(selfMsg('', { media: media('audio', 'audio/ogg') }))
    expect(failing.llm.requests).toHaveLength(0)
    expect(failing.texts()).toEqual(['Sesli mesaj yazıya çevrilemedi. Biraz sonra tekrar dene.'])

    const silent = harness({ stt: { transcribe: async () => '   ' } })
    await silent.handler.handle(selfMsg('', { media: media('audio', 'audio/ogg') }))
    expect(silent.llm.requests).toHaveLength(0)
    expect(silent.texts()).toEqual(['Sesli mesajda konuşma algılamadım. Tekrar dene.'])
  })
})

describe('handler: documents and other media', () => {
  it('inlines a text document as a fenced block with its file name', async () => {
    const h = harness()
    const doc = media('document', 'text/plain', Buffer.from('satır1\nsatır2'), { fileName: 'notlar.txt' })
    await h.handler.handle(selfMsg('Özetle', { media: doc }))
    expect(userContent(lastRequest(h))).toBe('Özetle\n\nDosya notlar.txt:\n```\nsatır1\nsatır2\n```')
  })

  it('uses a default instruction when the document has no caption', async () => {
    const h = harness()
    const doc = media('document', 'text/plain', Buffer.from('merhaba'), { fileName: 'a.txt' })
    await h.handler.handle(selfMsg('', { media: doc }))
    expect(String(userContent(lastRequest(h)))).toMatch(/^Bu dosyayı incele\./)
  })

  it.each([
    ['application/json', 'veri.json'],
    ['application/octet-stream', 'README.MD'],
    ['application/octet-stream', 'tablo.csv'],
    ['text/csv', 'tablo'],
  ])('accepts %s / %s as text-like', async (mime, fileName) => {
    const h = harness()
    await h.handler.handle(selfMsg('', { media: media('document', mime, Buffer.from('a,b\n1,2'), { fileName }) }))
    expect(h.llm.requests).toHaveLength(1)
  })

  it('refuses a PDF with a notice and makes no model call', async () => {
    const h = harness()
    const pdf = media('document', 'application/pdf', Buffer.from('%PDF'), { fileName: 'fatura.pdf' })
    await h.handler.handle(selfMsg('Bunu oku', { media: pdf }))
    expect(h.llm.requests).toHaveLength(0)
    expect(downloads(pdf)).toBe(0)
    expect(h.texts()).toEqual(['Bu dosya türünü henüz okuyamıyorum. Metin, .md, .csv veya .json gönder.'])
  })

  it('refuses text documents over 200 KB, announced or actual', async () => {
    const h = harness()
    const announced = media('document', 'text/plain', Buffer.from('x'), {
      fileName: 'büyük.txt',
      sizeBytes: DOCUMENT_MAX_BYTES + 1,
    })
    await h.handler.handle(selfMsg('', { media: announced }))
    expect(downloads(announced)).toBe(0)
    const actual = media('document', 'text/plain', Buffer.alloc(DOCUMENT_MAX_BYTES + 1, 'a'), { fileName: 'b.txt' })
    await h.handler.handle(selfMsg('', { media: actual }))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.texts()).toHaveLength(2)
    expect(h.texts().every((t) => t.includes('200 KB'))).toBe(true)
  })

  it('accepts a document of exactly 200 KB', async () => {
    const h = harness()
    const doc = media('document', 'text/plain', Buffer.alloc(DOCUMENT_MAX_BYTES, 'a'), { fileName: 'tam.txt' })
    await h.handler.handle(selfMsg('', { media: doc }))
    expect(h.llm.requests).toHaveLength(1)
  })

  it('treats a binary body behind a text extension as unsupported, and an empty file as empty', async () => {
    const h = harness()
    await h.handler.handle(
      selfMsg('', { media: media('document', 'text/plain', Buffer.from([0x41, 0x00, 0x42]), { fileName: 'x.txt' }) }),
    )
    await h.handler.handle(
      selfMsg('', { media: media('document', 'text/plain', Buffer.from('  \n'), { fileName: 'y.txt' }) }),
    )
    expect(h.llm.requests).toHaveLength(0)
    expect(h.texts()).toEqual([
      'Bu dosya türünü henüz okuyamıyorum. Metin, .md, .csv veya .json gönder.',
      'Dosya boş görünüyor.',
    ])
  })

  it.each(['video', 'sticker'] as const)('answers a %s with a notice and makes no model call', async (kind) => {
    const h = harness()
    const m = media(kind, kind === 'video' ? 'video/mp4' : 'image/webp')
    await h.handler.handle(selfMsg('', { media: m }))
    expect(h.llm.requests).toHaveLength(0)
    expect(downloads(m)).toBe(0)
    expect(h.texts()).toEqual(['Video ve çıkartmaları henüz okuyamıyorum. Yazı ya da resim gönder.'])
  })

  it('prepends a quoted message to the prompt', async () => {
    const h = harness()
    await h.handler.handle(selfMsg('Bunu özetle', { quotedText: 'Toplantı perşembeye ertelendi.' }))
    expect(userContent(lastRequest(h))).toBe('Alıntı: "Toplantı perşembeye ertelendi."\nBunu özetle')
  })
})

// ---------------------------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------------------------

describe('handler: monthly budget', () => {
  it('stops before the model call once the month has reached the budget, and says how to change it', async () => {
    const h = harness({ env: { MONTHLY_BUDGET_TL: '100' } })
    seedSpend(h, 120)
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.llm.requests).toHaveLength(0)
    expect(h.ledger.entries).toHaveLength(1) // only the seeded one
    expect(h.store.saves).toHaveLength(0)
    const text = must(h.texts()[0])
    expect(text).toContain('Aylık bütçe doldu')
    expect(text).toContain('120,00 TL')
    expect(text).toContain('100,00 TL')
    expect(text).toContain('/butce <TL>')
    expect(h.sender.events).toEqual([`typing:on:${SELF}`, `send:${SELF}`, `typing:off:${SELF}`])
  })

  it('blocks at exactly the budget and lets a smaller spend through', async () => {
    const h = harness({ env: { MONTHLY_BUDGET_TL: '100' } })
    seedSpend(h, 100)
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.llm.requests).toHaveLength(0)

    const under = harness({ env: { MONTHLY_BUDGET_TL: '100' } })
    seedSpend(under, 99.99)
    await under.handler.handle(selfMsg('Merhaba'))
    expect(under.llm.requests).toHaveLength(1)
  })

  it('a budget set at runtime wins over the .env value, in both directions', async () => {
    const raised = harness({ env: { MONTHLY_BUDGET_TL: '100' }, settings: { monthlyBudgetTl: 500 } })
    seedSpend(raised, 120)
    await raised.handler.handle(selfMsg('Merhaba'))
    expect(raised.llm.requests).toHaveLength(1)

    const lowered = harness({ settings: { monthlyBudgetTl: 50 } })
    seedSpend(lowered, 60)
    await lowered.handler.handle(selfMsg('Merhaba'))
    expect(lowered.llm.requests).toHaveLength(0)
  })

  it('treats 0 as unlimited', async () => {
    const h = harness({ env: { MONTHLY_BUDGET_TL: '10' }, settings: { monthlyBudgetTl: 0 } })
    seedSpend(h, 5000)
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.llm.requests).toHaveLength(1)
  })

  it('counts spending that was recorded without a rate at today’s rate', async () => {
    const h = harness({ env: { MONTHLY_BUDGET_TL: '100' } })
    h.ledger.entries.push({
      ts: NOW,
      chatJid: SELF,
      model: GPT.id,
      promptTokens: 1,
      completionTokens: 1,
      usd: 3,
      usdSource: 'provider',
    })
    await h.handler.handle(selfMsg('Merhaba')) // 3 USD × 40 = 120 TL
    expect(h.llm.requests).toHaveLength(0)
    expect(must(h.texts()[0])).toContain('120,00 TL')
  })

  it('blocks the budget check before media is downloaded', async () => {
    const h = harness({ env: { MONTHLY_BUDGET_TL: '10' } })
    seedSpend(h, 50)
    const m = media('image', 'image/jpeg')
    await h.handler.handle(selfMsg('', { media: m }))
    expect(downloads(m)).toBe(0)
    expect(h.llm.requests).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------------------------
// Failures of the model
// ---------------------------------------------------------------------------------------------

describe('handler: model failures', () => {
  it.each([
    [429, 'Model yanıt vermedi (HTTP 429). Biraz sonra tekrar dene.'],
    [500, 'Model yanıt vermedi (HTTP 500). Biraz sonra tekrar dene.'],
    [401, 'Sağlayıcı anahtarı reddedildi; .env dosyasını kontrol et.'],
    [403, 'Sağlayıcı anahtarı reddedildi; .env dosyasını kontrol et.'],
    [402, 'Sağlayıcıda bakiye bitmiş görünüyor.'],
    [404, 'Model bulunamadı: openai/gpt-5-mini. Ara: /modeller <arama>'],
    [0, 'Model yanıt vermedi (bağlantı sorunu). Biraz sonra tekrar dene.'],
  ])('LlmError %i → one Turkish notice; nothing in the ledger, history untouched', async (status, expected) => {
    const h = harness()
    const history: ChatMessage[] = [
      { role: 'user', content: 'eski soru' },
      { role: 'assistant', content: 'eski cevap' },
    ]
    h.store.seed({ chatJid: SELF, history })
    h.llm.script.push(new LlmError('boom', status, 'detail'))
    await h.handler.handle(selfMsg('Merhaba'))

    expect(h.texts()).toEqual([expected])
    expect(h.ledger.entries).toHaveLength(0)
    expect(h.store.saves).toHaveLength(0)
    expect(h.store.states.get(SELF)?.history).toEqual(history)
    expect(h.sender.events).toEqual([`typing:on:${SELF}`, `send:${SELF}`, `typing:off:${SELF}`])
  })

  it('names the model the user selected in the 404 notice', async () => {
    const h = harness()
    h.store.seed({ chatJid: SELF, model: 'acme/retired' })
    h.llm.script.push(new LlmError('no such model', 404))
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.texts()).toEqual(['Model bulunamadı: acme/retired. Ara: /modeller <arama>'])
  })

  it('llmNotice never blames the user', () => {
    for (const status of [0, 400, 401, 402, 403, 404, 408, 429, 500, 502, 503]) {
      expect(llmNotice(new LlmError('x', status), 'm/x')).not.toMatch(/hata yaptın|suç|yanlış yaptın|❌|✗/i)
    }
  })

  it('any other error → generic Turkish notice and an error log; the typing indicator is cleared', async () => {
    const h = harness()
    const error = vi.spyOn(h.log, 'error')
    h.llm.script.push(new TypeError('boom'))
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.texts()).toEqual([GENERIC_ERROR])
    expect(error).toHaveBeenCalled()
    expect(h.ledger.entries).toHaveLength(0)
    expect(h.store.saves).toHaveLength(0)
    expect(h.sender.events.at(-1)).toBe(`send:${SELF}`)
    expect(h.sender.events).toContain(`typing:off:${SELF}`)
  })

  it('an empty model answer is reported, billed when tokens were used, and kept out of the history', async () => {
    const h = harness()
    h.llm.script.push(answer('   \n'))
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.texts()).toEqual([EMPTY_REPLY])
    expect(EMPTY_REPLY).toBe('Model boş yanıt döndü.')
    expect(h.ledger.entries).toHaveLength(1)
    expect(h.store.saves).toHaveLength(0)

    const noUsage = harness()
    noUsage.llm.script.push({ text: '', model: GPT.id })
    await noUsage.handler.handle(selfMsg('Merhaba'))
    expect(noUsage.texts()).toEqual([EMPTY_REPLY])
    expect(noUsage.ledger.entries).toHaveLength(0)
  })

  it('a reply that is nothing but a horizontal rule counts as empty', async () => {
    const h = harness()
    h.llm.script.push(answer('---'))
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.texts()).toEqual([EMPTY_REPLY])
  })
})

// ---------------------------------------------------------------------------------------------
// Cost, history and the reply
// ---------------------------------------------------------------------------------------------

describe('handler: cost and ledger', () => {
  it('estimates from the catalog price when the provider reports no cost', async () => {
    const h = harness()
    h.llm.script.push(answer('Tamam.', { usage: { promptTokens: 1000, completionTokens: 500 } }))
    await h.handler.handle(selfMsg('Merhaba'))
    const entry = must(h.ledger.entries[0])
    expect(entry.usdSource).toBe('estimate')
    expect(entry.usd).toBeCloseTo(0.00125, 10) // 1000 × 0.25e-6 + 500 × 2e-6
    expect(entry.tl).toBeCloseTo(0.05, 10)
    expect(must(h.texts()[0])).toMatch(/_≈ 0,05 TL · openai\/gpt-5-mini_$/)
  })

  it('records unknown cost and says so in the footer', async () => {
    const h = harness()
    h.store.seed({ chatJid: SELF, model: MYSTERY.id })
    h.llm.script.push(answer('Tamam.', { model: MYSTERY.id, usage: { promptTokens: 10, completionTokens: 5 } }))
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.ledger.entries[0]).toMatchObject({ model: MYSTERY.id, usd: 0, usdSource: 'unknown' })
    expect(must(h.texts()[0])).toMatch(/_maliyet bilinmiyor · acme\/mystery_$/)
  })

  it('without a rate the footer shows dollars and the entry has no TL', async () => {
    const h = harness({ rate: null })
    await h.handler.handle(selfMsg('Merhaba'))
    const entry = must(h.ledger.entries[0])
    expect(entry.rate).toBeUndefined()
    expect(entry.tl).toBeUndefined()
    expect(must(h.texts()[0])).toMatch(/_≈ \$0\.0030 · openai\/gpt-5-mini_$/)
  })

  it('a failing rate service does not fail the turn', async () => {
    const h = harness()
    h.fx.rate.mockRejectedValue(new Error('network down'))
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.texts()).toHaveLength(1)
    expect(must(h.texts()[0])).toContain('_≈ $0.0030')
    expect(must(h.ledger.entries[0]).tl).toBeUndefined()
  })

  it('bills the model that really answered when it is in the catalog (router models)', async () => {
    const h = harness()
    h.store.seed({ chatJid: SELF, model: AUTO.id })
    h.llm.script.push(answer('Tamam.', { model: GEMINI.id, usage: { promptTokens: 1000, completionTokens: 0 } }))
    await h.handler.handle(selfMsg('Merhaba'))
    expect(lastRequest(h).model).toBe(AUTO.id)
    const entry = must(h.ledger.entries[0])
    expect(entry.model).toBe(GEMINI.id)
    expect(entry.usdSource).toBe('estimate')
    expect(entry.usd).toBeCloseTo(0.0003, 10) // gemini price, not the router's
    expect(must(h.texts()[0])).toContain(`· ${GEMINI.id}_`)
  })

  it('keeps the requested id when the provider reports a model name the catalog does not know', async () => {
    const h = harness()
    h.llm.script.push(answer('Tamam.', { model: 'gpt-5-mini-2026-01-01' }))
    await h.handler.handle(selfMsg('Merhaba'))
    expect(must(h.ledger.entries[0]).model).toBe(GPT.id)
  })

  it('footer: COST_FOOTER=false hides it, the runtime setting overrides the .env value both ways', async () => {
    const off = harness({ env: { COST_FOOTER: 'false' } })
    await off.handler.handle(selfMsg('Merhaba'))
    expect(off.texts()).toEqual(['Merhaba! Nasıl yardımcı olabilirim?'])

    const forcedOn = harness({ env: { COST_FOOTER: 'false' }, settings: { costFooter: true } })
    await forcedOn.handler.handle(selfMsg('Merhaba'))
    expect(must(forcedOn.texts()[0])).toContain('_≈ 0,12 TL')

    const forcedOff = harness({ settings: { costFooter: false } })
    await forcedOff.handler.handle(selfMsg('Merhaba'))
    expect(forcedOff.texts()).toEqual(['Merhaba! Nasıl yardımcı olabilirim?'])
    // the ledger is written regardless of the footer
    expect(forcedOff.ledger.entries).toHaveLength(1)
  })
})

describe('handler: history and prompt', () => {
  it('carries earlier turns into the next request, in order', async () => {
    const h = harness()
    h.llm.script.push(answer('cevap 1'), answer('cevap 2'))
    await h.handler.handle(selfMsg('soru 1'))
    await h.handler.handle(selfMsg('soru 2'))
    const roles = lastRequest(h).messages.map((m) => `${m.role}:${typeof m.content === 'string' ? m.content : '…'}`)
    expect(roles.slice(1)).toEqual(['user:soru 1', 'assistant:cevap 1', 'user:soru 2'])
  })

  it('trims the stored history to MAX_HISTORY', async () => {
    const h = harness({ env: { MAX_HISTORY: '4' } })
    for (let i = 1; i <= 4; i++) {
      h.llm.script.push(answer(`cevap ${i}`))
      await h.handler.handle(selfMsg(`soru ${i}`))
    }
    const history = must(h.store.states.get(SELF)).history
    expect(history.map((m) => m.content)).toEqual(['soru 3', 'cevap 3', 'soru 4', 'cevap 4'])
    // and the request itself never carries more than MAX_HISTORY earlier messages
    expect(lastRequest(h).messages.length).toBeLessThanOrEqual(1 + 4 + 1)
  })

  it('uses the per-chat model, system prompt and notes', async () => {
    const h = harness()
    h.store.seed({
      chatJid: SELF,
      model: GEMINI.id,
      systemPrompt: 'Sen bir aşçısın.',
      notes: ['Kızım Ayşe 12 yaşında'],
    })
    await h.handler.handle(selfMsg('Merhaba'))
    const req = lastRequest(h)
    expect(req.model).toBe(GEMINI.id)
    const system = String(req.messages[0]?.content)
    expect(system).toContain('Sen bir aşçısın.')
    expect(system).toContain('• Kızım Ayşe 12 yaşında')
    expect(system).not.toContain(h.ctx.config.systemPrompt)
  })

  it('keeps the other fields of the chat state when saving the turn', async () => {
    const h = harness()
    h.store.seed({ chatJid: SELF, model: GEMINI.id, systemPrompt: 'Kısa yaz.', notes: ['not 1'] })
    await h.handler.handle(selfMsg('Merhaba'))
    expect(h.store.states.get(SELF)).toMatchObject({ model: GEMINI.id, systemPrompt: 'Kısa yaz.', notes: ['not 1'] })
  })
})

describe('handler: the reply', () => {
  it('converts Markdown to WhatsApp formatting', async () => {
    const h = harness({ env: { COST_FOOTER: 'false' } })
    h.llm.script.push(answer('**Önemli:** ilacı *yemekten sonra* al.\n\n- bir\n- iki'))
    await h.handler.handle(selfMsg('Merhaba'))
    const text = must(h.texts()[0])
    expect(text).toContain('*Önemli:*')
    expect(text).not.toContain('**')
  })

  it('splits a long reply into pieces of at most 3500 characters; the footer is only on the last piece', async () => {
    const h = harness()
    const paragraphs = Array.from({ length: 40 }, (_, i) => `Paragraf-${String(i).padStart(2, '0')} ${'a'.repeat(280)}`)
    h.llm.script.push(answer(paragraphs.join('\n\n')))
    await h.handler.handle(selfMsg('Uzun yaz'))

    const texts = h.texts()
    expect(texts.length).toBeGreaterThanOrEqual(3)
    for (const t of texts) expect(t.length).toBeLessThanOrEqual(REPLY_CHUNK_CHARS)
    const footer = '_≈ 0,12 TL · openai/gpt-5-mini_'
    expect(texts.filter((t) => t.includes('_≈')).length).toBe(1)
    expect(must(texts[texts.length - 1]).endsWith(footer)).toBe(true)
    for (const t of texts.slice(0, -1)) expect(t).not.toContain(footer)
    // nothing lost, nothing duplicated
    const all = texts.join('\n\n')
    for (const p of paragraphs) expect(all.split(p.slice(0, 11)).length - 1).toBe(1)
    // pieces went out in order, back to back, with the typing indicator around them
    expect(h.sender.events).toEqual([`typing:on:${SELF}`, ...texts.map(() => `send:${SELF}`), `typing:off:${SELF}`])
  })

  it('without a footer the pieces use the full 3500 characters', async () => {
    const h = harness({ env: { COST_FOOTER: 'false' } })
    h.llm.script.push(answer(Array.from({ length: 30 }, () => 'b'.repeat(300)).join('\n\n')))
    await h.handler.handle(selfMsg('Uzun yaz'))
    expect(h.texts().length).toBeGreaterThanOrEqual(3)
    for (const t of h.texts()) expect(t.length).toBeLessThanOrEqual(REPLY_CHUNK_CHARS)
  })

  it('records the id of every piece so none of the echoes is answered', async () => {
    const h = harness()
    h.llm.script.push(answer(Array.from({ length: 30 }, () => 'c'.repeat(300)).join('\n\n')))
    await h.handler.handle(selfMsg('Uzun yaz'))
    const requests = h.llm.requests.length
    for (const s of h.sender.sent) await h.handler.handle(selfMsg(s.text, { id: s.id }))
    expect(h.llm.requests).toHaveLength(requests)
  })
})

// ---------------------------------------------------------------------------------------------
// Ordering and concurrency
// ---------------------------------------------------------------------------------------------

describe('handler: ordering', () => {
  it('processes two messages of the same chat strictly in order', async () => {
    const h = harness()
    const first = deferred<ChatResult>()
    h.llm.script.push(first.promise, answer('cevap 2'))

    const p1 = h.handler.handle(selfMsg('birinci'))
    const p2 = h.handler.handle(selfMsg('ikinci'))
    await vi.waitFor(() => expect(h.llm.requests).toHaveLength(1))
    await tick()
    expect(h.llm.requests).toHaveLength(1) // the second one waits for the first

    first.resolve(answer('cevap 1'))
    await Promise.all([p1, p2])

    expect(h.llm.requests).toHaveLength(2)
    expect(h.texts().map((t) => t.split('\n')[0])).toEqual(['cevap 1', 'cevap 2'])
    // the second request already contains the first exchange
    expect(
      lastRequest(h)
        .messages.slice(1)
        .map((m) => m.content),
    ).toEqual(['birinci', 'cevap 1', 'ikinci'])
    expect(h.sender.events).toEqual([
      `typing:on:${SELF}`,
      `send:${SELF}`,
      `typing:off:${SELF}`,
      `typing:on:${SELF}`,
      `send:${SELF}`,
      `typing:off:${SELF}`,
    ])
  })

  it('runs different chats in parallel', async () => {
    const h = harness()
    const slow = deferred<ChatResult>()
    h.llm.script.push(slow.promise, answer('hızlı cevap'))

    const pSlow = h.handler.handle(selfMsg('yavaş'))
    await vi.waitFor(() => expect(h.llm.requests).toHaveLength(1))
    await h.handler.handle(dmMsg('hızlı')) // completes while the first chat is still waiting
    expect(h.sender.sent.map((s) => s.chat)).toEqual([FRIEND])

    slow.resolve(answer('yavaş cevap'))
    await pSlow
    expect(h.sender.sent.map((s) => s.chat)).toEqual([FRIEND, SELF])
  })

  it('a command queued behind a chat turn sees the state that turn saved', async () => {
    const h = harness()
    const first = deferred<ChatResult>()
    h.llm.script.push(first.promise)
    const p1 = h.handler.handle(selfMsg('soru'))
    const p2 = h.handler.handle(selfMsg('/yeni'))
    await vi.waitFor(() => expect(h.llm.requests).toHaveLength(1))
    first.resolve(answer('cevap'))
    await Promise.all([p1, p2])
    expect(must(h.store.states.get(SELF)).history).toEqual([])
    expect(h.store.saves).toHaveLength(2)
  })

  it('a failing message does not block the ones behind it', async () => {
    const h = harness()
    h.llm.script.push(new TypeError('boom'), answer('sağlam cevap'))
    await Promise.all([h.handler.handle(selfMsg('bir')), h.handler.handle(selfMsg('iki'))])
    expect(h.texts()[0]).toBe(GENERIC_ERROR)
    expect(must(h.texts()[1])).toContain('sağlam cevap')
  })
})

// ---------------------------------------------------------------------------------------------
// Failures around the model: handle() must never throw
// ---------------------------------------------------------------------------------------------

describe('handler: robustness', () => {
  it('survives a sender that throws: handle() resolves, state is already saved, one notice is attempted', async () => {
    const h = harness()
    const error = vi.spyOn(h.log, 'error')
    h.sender.failSend = new Error('socket closed')
    await expect(h.handler.handle(selfMsg('Merhaba'))).resolves.toBeUndefined()

    expect(h.llm.requests).toHaveLength(1)
    expect(h.ledger.entries).toHaveLength(1) // the answer was paid for, so it is recorded
    expect(h.store.saves).toHaveLength(1)
    expect(error).toHaveBeenCalled()
    // reply attempt, typing cleared, one (also failing) notice: no retry loop
    expect(h.sender.events).toEqual([`typing:on:${SELF}`, `send:${SELF}`, `typing:off:${SELF}`, `send:${SELF}`])
  })

  it('sends the notice when only the first attempt fails', async () => {
    const h = harness()
    let calls = 0
    const original = h.sender.sendText.bind(h.sender)
    h.sender.sendText = async (chat, text) => {
      if (++calls === 1) throw new Error('flaky')
      return original(chat, text)
    }
    await expect(h.handler.handle(selfMsg('Merhaba'))).resolves.toBeUndefined()
    expect(h.texts()).toEqual([GENERIC_ERROR])
  })

  it('survives a failing typing indicator', async () => {
    const h = harness()
    h.sender.failTyping = true
    await expect(h.handler.handle(selfMsg('Merhaba'))).resolves.toBeUndefined()
    expect(h.texts()).toHaveLength(1)
  })

  it('survives a chat store that cannot be read: one generic notice', async () => {
    const h = harness()
    h.store.failLoad = true
    await expect(h.handler.handle(selfMsg('Merhaba'))).resolves.toBeUndefined()
    expect(h.texts()).toEqual([GENERIC_ERROR])
    expect(h.llm.requests).toHaveLength(0)
  })

  it('still delivers the answer when the ledger or the chat store cannot be written', async () => {
    const h = harness()
    h.ledger.failAppend = true
    h.store.failSave = true
    await expect(h.handler.handle(selfMsg('Merhaba'))).resolves.toBeUndefined()
    expect(h.texts()).toEqual(['Merhaba! Nasıl yardımcı olabilirim?\n\n_≈ 0,12 TL · openai/gpt-5-mini_'])
  })

  it('survives a failing command (service error) without crashing', async () => {
    const h = harness()
    h.store.failLoad = true
    await expect(h.handler.handle(selfMsg('/yeni'))).resolves.toBeUndefined()
    expect(h.texts()).toEqual([GENERIC_ERROR])
  })
})

// ---------------------------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------------------------

describe('handler: stop and owner jids', () => {
  it('stop() resolves at once when nothing is in flight', async () => {
    const h = harness()
    await expect(h.handler.stop()).resolves.toBeUndefined()
  })

  it('stop() waits for the message in flight, then the handler accepts nothing new', async () => {
    const h = harness()
    const pending = deferred<ChatResult>()
    h.llm.script.push(pending.promise)
    const p = h.handler.handle(selfMsg('Merhaba'))
    await vi.waitFor(() => expect(h.llm.requests).toHaveLength(1))

    let stopped = false
    const stopping = h.handler.stop().then(() => {
      stopped = true
    })
    await tick()
    expect(stopped).toBe(false)

    pending.resolve(answer('geç ama geldi'))
    await Promise.all([p, stopping])
    expect(stopped).toBe(true)
    expect(must(h.texts()[0])).toContain('geç ama geldi')

    await h.handler.handle(selfMsg('Yeni mesaj'))
    expect(h.llm.requests).toHaveLength(1)
  })

  it('stop() gives up after the wait limit when the model never answers', async () => {
    vi.useFakeTimers()
    try {
      const h = harness()
      const warn = vi.spyOn(h.log, 'warn')
      h.llm.script.push(new Promise<ChatResult>(() => {}))
      void h.handler.handle(selfMsg('Merhaba'))
      await vi.advanceTimersByTimeAsync(1)
      expect(h.llm.requests).toHaveLength(1)

      let stopped = false
      const stopping = h.handler.stop().then(() => {
        stopped = true
      })
      await vi.advanceTimersByTimeAsync(STOP_WAIT_MS - 1)
      expect(stopped).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await stopping
      expect(stopped).toBe(true)
      expect(warn).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('setOwnerJids forwards normalized jids to an access control that accepts them', () => {
    const h = harness()
    const addOwnerJid = vi.fn()
    Object.assign(h.access, { addOwnerJid })
    h.handler.setOwnerJids(['905320000001:12@s.whatsapp.net', '123456789012345@lid', ''])
    expect(addOwnerJid.mock.calls.map((c) => c[0])).toEqual([SELF, '123456789012345@lid'])
  })

  it('setOwnerJids is harmless for an access control without addOwnerJid', () => {
    const h = harness()
    expect(() => h.handler.setOwnerJids([SELF])).not.toThrow()
  })
})
