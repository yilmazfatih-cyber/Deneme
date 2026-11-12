// Aşama 4 testleri: araç döngüsü, oturuma göre araç politikası, oturum şeritleri, sessiz cevap, önyükleme dosyaları.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  AgentRuntime,
  createScriptedModel,
  isSilentReply,
  resolveToolPolicy,
  runAgentLoop,
  SessionLanes,
  ToolRegistry,
} from '../asama4_ajan.js'

const kayit = () =>
  new ToolRegistry()
    .register({ name: 'topla', description: '', parameters: {}, execute: async ({ a, b }) => ({ sonuc: a + b }) })
    .register({ name: 'exec', description: '', parameters: {}, dangerous: true, execute: async () => ({ ok: true }) })

test('araç sonucu modele döner, araç çağrısı bitince döngü durur', async () => {
  const model = createScriptedModel([
    { toolCalls: [{ id: 't1', name: 'topla', args: { a: 2, b: 40 } }] },
    { text: '42' },
  ])
  const messages = [{ role: 'user', content: 'topla' }]
  const sonuc = await runAgentLoop({ model, system: 's', messages, registry: kayit(), policy: { deny: new Set() } })
  assert.deepEqual(sonuc, { text: '42', turns: 2 })
  assert.equal(model.requests[1].messages.at(-1).content, '{"sonuc":42}')
  assert.deepEqual(
    model.requests[0].tools.map((t) => t.name),
    ['topla', 'exec'],
  )
})

test('ana oturum dışında tehlikeli araç ne gösterilir ne çalışır', async () => {
  const registry = kayit()
  const grup = resolveToolPolicy({ registry, agentId: 'main', sessionKey: 'agent:main:telegram:group:1' })
  assert.deepEqual([...grup.deny], ['exec'])
  assert.equal(resolveToolPolicy({ registry, agentId: 'main', sessionKey: 'agent:main:main' }).deny.size, 0)
  assert.equal(
    resolveToolPolicy({ registry, agentId: 'main', sessionKey: 'agent:main:main', sandboxMode: 'all' }).restricted,
    true,
  )
  const model = createScriptedModel([{ toolCalls: [{ id: 't1', name: 'exec', args: {} }] }, { text: 'tamam' }])
  const messages = [{ role: 'user', content: 'çalıştır' }]
  await runAgentLoop({ model, system: 's', messages, registry, policy: grup })
  assert.deepEqual(
    model.requests[0].tools.map((t) => t.name),
    ['topla'],
  )
  assert.match(messages[2].content, /kullanılamayan araç: exec/) // model yine de isterse yürütmede reddedilir
})

test('araç hatası ve tur sınırı', async () => {
  const registry = new ToolRegistry().register({
    name: 'bozuk',
    description: '',
    parameters: {},
    execute: async () => {
      throw new Error('patladı')
    },
  })
  const model = createScriptedModel(Array(5).fill({ toolCalls: [{ id: 't', name: 'bozuk', args: {} }] }))
  const messages = []
  const sonuc = await runAgentLoop({ model, system: 's', messages, registry, policy: { deny: new Set() }, maxTurns: 2 })
  assert.equal(sonuc.text, '(tur sınırına ulaşıldı)')
  assert.match(messages[1].content, /bozuk başarısız: patladı/)
})

test('aynı oturumun turları sıralanır, farklı oturumlar beklemez', async () => {
  const lanes = new SessionLanes()
  const sira = []
  const bekle = (ms) => new Promise((r) => setTimeout(r, ms))
  await Promise.all([
    lanes.run('a', async () => {
      await bekle(30)
      sira.push('a1')
    }),
    lanes.run('a', async () => sira.push('a2')),
    lanes.run('b', async () => sira.push('b1')),
  ])
  assert.deepEqual(sira, ['b1', 'a1', 'a2'])
  assert.equal(
    await lanes
      .run('a', async () => {
        throw new Error('x')
      })
      .catch((e) => e.message),
    'x',
  )
  assert.equal(await lanes.run('a', async () => 'devam'), 'devam') // hata şeridi kilitlemez
})

test('sessiz cevap belirteçleri', () => {
  assert.equal(isSilentReply(' no_reply '), true)
  assert.equal(isSilentReply('HEARTBEAT_OK'), true)
  assert.equal(isSilentReply('NO_REPLY ama bir şey daha'), false)
})

test('çalışma zamanı: önyükleme dosyaları istemde, konuşma oturum başına tutulur', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'oc-ws-'))
  try {
    await writeFile(join(workspace, 'SOUL.md'), 'Kısa ve nazik ol.')
    const model = createScriptedModel([{ text: 'bir' }, { text: 'iki' }, { text: 'NO_REPLY' }])
    const runtime = new AgentRuntime({
      agents: { main: { workspace, model } },
      registry: kayit(),
      skillsPrompt: async () => '<available_skills>',
    })
    await runtime.runTurn({ agentId: 'main', sessionKey: 'agent:main:main', text: 'selam' })
    await runtime.runTurn({ agentId: 'main', sessionKey: 'agent:main:main', text: 'nasılsın' })
    const sessiz = await runtime.runTurn({ agentId: 'main', sessionKey: 'agent:main:x:group:1', text: 'grup' })
    assert.match(model.requests[0].system, /## SOUL\.md\nKısa ve nazik ol\./)
    assert.match(model.requests[0].system, /<available_skills>/)
    assert.equal(model.requests[1].messages.length, 3) // selam, bir, nasılsın
    assert.equal(model.requests[2].messages.length, 1) // başka oturum, temiz geçmiş
    assert.deepEqual([sessiz.silent, sessiz.sandboxed], [true, true])
    runtime.resetSession('agent:main:main')
    assert.equal(runtime.transcripts.has('agent:main:main'), false)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
