import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FileChatStore,
  FileSettingsStore,
  atomicWriteJson,
  corruptName,
  readJson,
  readJsonSync,
  safeFileName,
} from '../src/store/files.js'
import type { ChatState } from '../src/core/types.js'

const FIXED_NOW = Date.UTC(2026, 2, 1, 12, 34, 56, 789)
const now = () => FIXED_NOW

let dir = ''

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-store-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('readJson / readJsonSync', () => {
  it('returns the fallback for a missing file', async () => {
    const file = path.join(dir, 'nope', 'x.json')
    await expect(readJson(file, { a: 1 })).resolves.toEqual({ a: 1 })
    expect(readJsonSync(file, 'yok')).toBe('yok')
  })

  it('parses a valid file', async () => {
    const file = path.join(dir, 'ok.json')
    fs.writeFileSync(file, JSON.stringify({ hello: 'dünya' }))
    await expect(readJson(file, null)).resolves.toEqual({ hello: 'dünya' })
    expect(readJsonSync(file, null)).toEqual({ hello: 'dünya' })
  })

  it('moves a corrupt file aside with a .bozuk-<timestamp> suffix and starts fresh', async () => {
    const file = path.join(dir, 'bad.json')
    fs.writeFileSync(file, '{"half": tru')
    await expect(readJson(file, { fresh: true }, { now })).resolves.toEqual({ fresh: true })
    expect(fs.existsSync(file)).toBe(false)
    const renamed = corruptName(file, FIXED_NOW)
    expect(renamed).toBe(`${file}.bozuk-20260301T123456Z`)
    expect(fs.readFileSync(renamed, 'utf8')).toBe('{"half": tru')
  })

  it('does the same synchronously', () => {
    const file = path.join(dir, 'bad-sync.json')
    fs.writeFileSync(file, '')
    expect(readJsonSync(file, 7, { now })).toBe(7)
    expect(fs.existsSync(file)).toBe(false)
    expect(fs.existsSync(corruptName(file, FIXED_NOW))).toBe(true)
  })
})

describe('atomicWriteJson', () => {
  it('creates parent directories and leaves no .tmp behind', async () => {
    const file = path.join(dir, 'a', 'b', 'c.json')
    await atomicWriteJson(file, { x: [1, 2], y: 'ş' })
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ x: [1, 2], y: 'ş' })
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)
    expect(fs.readFileSync(file, 'utf8').endsWith('\n')).toBe(true)
  })

  it('serializes concurrent writes to the same file; the last write wins', async () => {
    const file = path.join(dir, 'race.json')
    await Promise.all([1, 2, 3, 4, 5].map((n) => atomicWriteJson(file, { n })))
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ n: 5 })
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)
  })
})

describe('safeFileName', () => {
  it('keeps safe characters and replaces the rest', () => {
    expect(safeFileName('905321234567@s.whatsapp.net')).toBe('905321234567_s.whatsapp.net')
    expect(safeFileName('120363012345678901@g.us')).toBe('120363012345678901_g.us')
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
    expect(safeFileName('ışık')).toBe('___k')
  })

  it('is never empty', () => {
    expect(safeFileName('')).toBe('_')
    expect(safeFileName('@@@')).toBe('___')
  })
})

describe('FileChatStore', () => {
  const jid = '905321234567@s.whatsapp.net'

  it('returns a fresh state with the injected clock when nothing is stored', async () => {
    const store = new FileChatStore(dir, { persist: true, now })
    const state = await store.load(jid)
    expect(state).toEqual({ chatJid: jid, history: [], notes: [], updatedAt: FIXED_NOW })
    expect(fs.existsSync(path.join(dir, 'chats'))).toBe(false)
  })

  it('persists to <dir>/chats/<safe>.json and reloads in a new instance', async () => {
    const store = new FileChatStore(dir, { persist: true, now })
    const state: ChatState = {
      chatJid: jid,
      model: 'openai/gpt-5-mini',
      systemPrompt: 'Kısa yaz.',
      history: [
        { role: 'user', content: 'merhaba' },
        { role: 'assistant', content: 'Merhaba, nasıl yardımcı olayım?' },
      ],
      notes: ['Torunun adı Ali.'],
      updatedAt: FIXED_NOW + 1,
    }
    await store.save(state)
    const file = path.join(dir, 'chats', '905321234567_s.whatsapp.net.json')
    expect(fs.existsSync(file)).toBe(true)

    const again = new FileChatStore(dir, { persist: true, now })
    await expect(again.load(jid)).resolves.toEqual(state)
  })

  it('keeps state in memory only when persist is false', async () => {
    const store = new FileChatStore(dir, { persist: false, now })
    const state = await store.load(jid)
    state.history.push({ role: 'user', content: 'selam' })
    await store.save(state)
    expect(fs.existsSync(path.join(dir, 'chats'))).toBe(false)
    expect((await store.load(jid)).history).toHaveLength(1)

    const again = new FileChatStore(dir, { persist: false, now })
    expect((await again.load(jid)).history).toHaveLength(0)
  })

  it('clones on load and save so callers cannot mutate the cache', async () => {
    const store = new FileChatStore(dir, { persist: false, now })
    const a = await store.load(jid)
    a.history.push({ role: 'user', content: 'gizli' })
    a.notes.push('not')
    const b = await store.load(jid)
    expect(b.history).toHaveLength(0)
    expect(b.notes).toHaveLength(0)

    await store.save(a)
    a.history.push({ role: 'assistant', content: 'sonradan' })
    const c = await store.load(jid)
    expect(c.history).toHaveLength(1)
    expect(c).not.toBe(a)
  })

  it('starts fresh when the chat file is corrupt and moves it aside', async () => {
    const chats = path.join(dir, 'chats')
    fs.mkdirSync(chats, { recursive: true })
    const file = path.join(chats, '905321234567_s.whatsapp.net.json')
    fs.writeFileSync(file, '{ bozuk')
    const store = new FileChatStore(dir, { persist: true, now })
    const state = await store.load(jid)
    expect(state).toEqual({ chatJid: jid, history: [], notes: [], updatedAt: FIXED_NOW })
    expect(fs.existsSync(file)).toBe(false)
    expect(fs.existsSync(corruptName(file, FIXED_NOW))).toBe(true)
  })

  it('repairs a file with the wrong shape instead of crashing', async () => {
    const chats = path.join(dir, 'chats')
    fs.mkdirSync(chats, { recursive: true })
    fs.writeFileSync(
      path.join(chats, '905321234567_s.whatsapp.net.json'),
      JSON.stringify({ history: 'x', notes: [1, 'a'] }),
    )
    const store = new FileChatStore(dir, { persist: true, now })
    const state = await store.load(jid)
    expect(state.history).toEqual([])
    expect(state.notes).toEqual(['a'])
    expect(state.chatJid).toBe(jid)
    expect(state.model).toBeUndefined()
  })
})

describe('FileSettingsStore', () => {
  it('starts from initial values when there is no file', () => {
    const store = new FileSettingsStore(path.join(dir, 'settings.json'), { monthlyBudgetTl: 500, costFooter: true })
    expect(store.get()).toEqual({ monthlyBudgetTl: 500, costFooter: true })
  })

  it('merges, persists atomically and returns the merged settings', async () => {
    const file = path.join(dir, 'deep', 'settings.json')
    const store = new FileSettingsStore(file, { monthlyBudgetTl: 0, costFooter: true })
    const merged = await store.set({ monthlyBudgetTl: 750 })
    expect(merged).toEqual({ monthlyBudgetTl: 750, costFooter: true })
    expect(store.get()).toEqual({ monthlyBudgetTl: 750, costFooter: true })
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ monthlyBudgetTl: 750, costFooter: true })
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)

    const again = new FileSettingsStore(file, { monthlyBudgetTl: 0, costFooter: false })
    expect(again.get()).toEqual({ monthlyBudgetTl: 750, costFooter: true })
  })

  it('lets the file win over initial values and get() returns a copy', async () => {
    const file = path.join(dir, 'settings.json')
    fs.writeFileSync(file, JSON.stringify({ costFooter: false }))
    const store = new FileSettingsStore(file, { monthlyBudgetTl: 100, costFooter: true })
    expect(store.get()).toEqual({ monthlyBudgetTl: 100, costFooter: false })
    const copy = store.get()
    copy.monthlyBudgetTl = 999
    expect(store.get().monthlyBudgetTl).toBe(100)
    await store.set({ monthlyBudgetTl: undefined })
    expect(store.get()).toEqual({ costFooter: false })
  })

  it('falls back to initial values when the file is corrupt', () => {
    const file = path.join(dir, 'settings.json')
    fs.writeFileSync(file, 'not json')
    const store = new FileSettingsStore(file, { costFooter: true })
    expect(store.get()).toEqual({ costFooter: true })
    expect(fs.existsSync(file)).toBe(false)
    expect(fs.readdirSync(dir).some((n) => n.startsWith('settings.json.bozuk-'))).toBe(true)
  })
})
