import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createFakeProvider, ProviderError, textMessage } from '../asama1_saglayici.js'
import { agents, createPermissionService } from '../asama3_izinler.js'
import { runAgent } from '../asama4_dongu.js'
import { createSessionStore } from '../asama5_oturum.js'
import {
  compactSession,
  needsCompaction,
  splitForCompaction,
  SUMMARY_SYSTEM,
  SUMMARY_TEMPLATE,
} from '../asama6_sikistirma.js'

const big = (text) => text.repeat(400) // ~100 token

function history() {
  return [
    textMessage('user', big('istek ')),
    { role: 'assistant', parts: [{ type: 'tool-call', id: 'c1', name: 'read', input: { path: 'a.js' } }] },
    { role: 'tool', parts: [{ type: 'tool-result', id: 'c1', name: 'read', output: big('kod '), isError: false }] },
    { role: 'assistant', parts: [{ type: 'text', text: big('yanıt ') }] },
    textMessage('user', 'son soru'),
  ]
}

test('eşik: tahmin, sınır eksi pay değerini aşınca sıkıştır', () => {
  assert.ok(needsCompaction(history(), { contextLimit: 300, reserve: 50 }))
  assert.ok(!needsCompaction(history(), { contextLimit: 10_000, reserve: 50 }))
})

test('bölme: kuyruk asla araç sonucuyla başlamaz', () => {
  const messages = history()
  const { head, tail } = splitForCompaction(messages, 1)
  assert.equal(head.length + tail.length, messages.length)
  for (let keep = 1; keep < 1000; keep += 7) {
    const split = splitForCompaction(messages, keep)
    assert.notEqual(split.tail[0]?.role, 'tool')
  }
})

test('compactSession: baş kısım özetle değişir, kuyruk aynen kalır', async () => {
  const provider = createFakeProvider([{ text: '## Amaç\na.js okundu.' }])
  const session = { messages: history(), compactions: 0 }
  const result = await compactSession(session, { provider, keepTokens: 5 })
  assert.equal(result.status, 'completed')
  assert.equal(session.compactions, 1)
  assert.equal(session.messages[0].summary, true)
  assert.match(session.messages[0].parts[0].text, /a\.js okundu/)
  assert.equal(session.messages.at(-1).parts[0].text, 'son soru')
  const sent = provider.calls[0]
  assert.equal(sent.tools.length, 0)
  assert.ok(sent.messages[0].parts[0].text.includes(SUMMARY_TEMPLATE))
  assert.ok(sent.messages[0].parts[0].text.includes('→ read {"path":"a.js"}'))
})

test('döngü bütçe aşılınca önce sıkıştırır, sonra adımı çalıştırır', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mini-sikistirma-'))
  try {
    const store = createSessionStore(path.join(root, 'sessions'))
    const session = await store.create()
    session.messages = history()
    await store.save(session)
    const provider = createFakeProvider((request) =>
      request.system === SUMMARY_SYSTEM ? { text: 'ÖZET' } : { text: 'Devam ediyorum.' },
    )
    const events = []
    const result = await runAgent({
      provider,
      store,
      sessionID: session.id,
      prompt: 'devam et',
      tools: [],
      agent: agents.build,
      permission: createPermissionService({ rules: agents.build.rules }),
      root,
      contextLimit: 300,
      reserve: 50,
      keepTokens: 20,
      onEvent: (event) => events.push(event),
    })
    assert.equal(result.text, 'Devam ediyorum.')
    assert.equal(events[0].type, 'compaction')
    const saved = await store.get(session.id)
    assert.equal(saved.compactions, 1)
    assert.match(provider.calls[1].messages[0].parts[0].text, /ÖZET/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('sağlayıcı "bağlam çok uzun" derse sıkıştırıp aynı adımı yeniden dener', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mini-tasma-'))
  try {
    const store = createSessionStore(path.join(root, 'sessions'))
    const session = await store.create()
    session.messages = history()
    await store.save(session)
    let overflowed = false
    const provider = createFakeProvider((request) => {
      if (request.system === SUMMARY_SYSTEM) return { text: 'kısa özet' }
      if (!overflowed) {
        overflowed = true
        return new ProviderError('çok uzun', 400, 'maximum context length exceeded')
      }
      return { text: 'Sığdı.' }
    })
    const events = []
    const result = await runAgent({
      provider,
      store,
      sessionID: session.id,
      prompt: 'devam',
      tools: [],
      agent: agents.build,
      permission: createPermissionService({ rules: agents.build.rules }),
      root,
      keepTokens: 10,
      onEvent: (event) => events.push(event),
    })
    assert.equal(result.text, 'Sığdı.')
    assert.ok(events.some((event) => event.type === 'compaction' && event.reason === 'overflow'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
