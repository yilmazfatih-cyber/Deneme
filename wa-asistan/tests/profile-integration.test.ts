import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config.js'
import { createHandler, isPersonalExport, PERSONAL_EXPORT } from '../src/core/handler.js'
import type { AppContext, ChatMessage, ChatState, InboundMessage } from '../src/core/types.js'
import { ProfileStore } from '../src/profile/store.js'

const ME = '905321234567@s.whatsapp.net'
const FRIEND = '905551112233@s.whatsapp.net'

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-'))
  fs.writeFileSync(path.join(dir, 'aile.md'), '# Aile\n\n## Anne\nAnnemin adı Fatma, doğum günü 3 Mayıs.\n')
  const profile = new ProfileStore(dir, () => 0)
  const sent: Array<{ jid: string; text: string }> = []
  const calls: ChatMessage[][] = []
  const states = new Map<string, ChatState>()
  let id = 0
  const ctx: AppContext = {
    config: { ...loadConfig({ LLM_API_KEY: 'k' }, dir), costFooter: false },
    llm: {
      chat: vi.fn(async (req) => {
        calls.push(req.messages)
        return { text: 'tamam', model: req.model }
      }),
      listModels: async () => [],
    },
    catalog: {
      all: () => [],
      get: () => undefined,
      search: () => [],
      resolve: () => ({ kind: 'none' }),
      featured: () => [],
      refresh: async () => {},
      age: () => undefined,
    },
    fx: {
      rate: async () => undefined,
      refresh: async () => undefined,
      setManual: async (r) => ({ rate: r, source: 'manual', asOf: 0 }),
    },
    ledger: {
      append: async () => {},
      summary: async () => ({ count: 0, usd: 0, tl: 0, unknownCount: 0, byModel: [] }),
      today: async () => ({ count: 0, usd: 0, tl: 0, unknownCount: 0, byModel: [] }),
      month: async () => ({ count: 0, usd: 0, tl: 0, unknownCount: 0, byModel: [] }),
      allTime: async () => ({ count: 0, usd: 0, tl: 0, unknownCount: 0, byModel: [] }),
    },
    store: {
      load: async (chatJid) => states.get(chatJid) ?? { chatJid, history: [], notes: [], updatedAt: 0 },
      save: async (s) => void states.set(s.chatJid, s),
    },
    access: {
      isOwner: (j) => j === ME,
      isAllowed: (j) => j === ME || j === FRIEND,
      list: () => [],
      add: async (p) => p,
      remove: async () => false,
    },
    settings: { get: () => ({}), set: async (p) => p },
    profile,
    sender: { sendText: async (jid, text) => (sent.push({ jid, text }), `out-${++id}`), typing: async () => {} },
    log: pino({ level: 'silent' }),
    now: () => 1_800_000_000_000,
    startedAt: 0,
  }
  return { ctx, handler: createHandler(ctx), sent, calls, states, dir }
}

let n = 0
const msg = (over: Partial<InboundMessage>): InboundMessage => ({
  id: `in-${++n}`,
  chatJid: ME,
  senderJid: ME,
  fromMe: true,
  isSelfChat: true,
  isGroup: false,
  text: '',
  timestamp: 0,
  ...over,
})

const lastUser = (m: ChatMessage[]) => JSON.stringify(m.at(-1)?.content)

describe('personal profile in the chat turn', () => {
  it('gives the owner the matching profile chunk, in the request only', async () => {
    const t = setup()
    await t.handler.handle(msg({ text: 'Annemin doğum günü ne zaman?' }))
    expect(lastUser(t.calls[0]!)).toContain('Fatma')
    // history keeps only the original question
    expect(JSON.stringify(t.states.get(ME)?.history)).not.toContain('Fatma')
  })

  it('never gives the profile to an allowlisted contact', async () => {
    const t = setup()
    await t.handler.handle(
      msg({ chatJid: FRIEND, senderJid: FRIEND, fromMe: false, isSelfChat: false, text: 'Annenin adı ne?' }),
    )
    expect(t.calls).toHaveLength(1)
    expect(JSON.stringify(t.calls[0])).not.toContain('Fatma')
  })

  it('profile commands are owner-only and never call the model', async () => {
    const t = setup()
    await t.handler.handle(
      msg({ chatJid: FRIEND, senderJid: FRIEND, fromMe: false, isSelfChat: false, text: '/profil ara anne' }),
    )
    expect(t.sent.at(-1)?.text).toContain('yalnızca hesap sahibi')
    await t.handler.handle(msg({ text: '/hatirla Park yeri B2' }))
    expect(t.sent.at(-1)?.text).toMatch(/Kaydedildi \(1\)/)
    await t.handler.handle(msg({ text: '/hatirla TC 10000000146' }))
    expect(t.sent.at(-1)?.text).toContain('TC kimlik')
    await t.handler.handle(msg({ text: '/profil ara annemin adı' }))
    expect(t.sent.at(-1)?.text).toContain('Fatma')
    await t.handler.handle(msg({ text: '/unut 1' }))
    expect(t.sent.at(-1)?.text).toContain('Silindi')
    expect(t.calls).toHaveLength(0)
  })

  it('refuses contact and calendar exports without calling the model', async () => {
    const t = setup()
    const download = vi.fn(async () => Buffer.from('Name,Phone 1 - Value,E-mail 1 - Value\nAli,+90555,a@b.c\n'))
    for (const media of [
      { kind: 'document' as const, mime: 'text/vcard', fileName: 'kisiler.vcf', download },
      { kind: 'document' as const, mime: 'text/calendar', fileName: 'takvim.ics', download },
      { kind: 'document' as const, mime: 'text/csv', fileName: 'contacts.csv', download },
    ]) {
      await t.handler.handle(msg({ media }))
      expect(t.sent.at(-1)?.text).toBe(PERSONAL_EXPORT)
    }
    expect(t.calls).toHaveLength(0)
  })
})

describe('isPersonalExport', () => {
  it('lets ordinary text files through', () => {
    expect(isPersonalExport('not.txt', 'text/plain', 'alışveriş listesi')).toBe(false)
    expect(isPersonalExport('veri.csv', 'text/csv', 'tarih,tutar,kategori\n1,2,3')).toBe(false)
  })
  it('catches exports by type, extension or content', () => {
    expect(isPersonalExport(undefined, 'text/x-vcard')).toBe(true)
    expect(isPersonalExport('a.ICS', 'application/octet-stream')).toBe(true)
    expect(isPersonalExport('x.txt', 'text/plain', 'BEGIN:VCARD\nFN:Ali')).toBe(true)
  })
})
