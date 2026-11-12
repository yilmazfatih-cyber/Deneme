import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { createFakeProvider, ProviderError, textMessage } from '../asama1_saglayici.js'
import { defaultTools } from '../asama2_araclar.js'
import { agents, createPermissionService } from '../asama3_izinler.js'
import { isContextOverflow, isRetryable, MAX_STEPS_PROMPT, runAgent } from '../asama4_dongu.js'
import { createSessionStore } from '../asama5_oturum.js'

let root
let dataDir
let store

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mini-dongu-'))
  await writeFile(path.join(root, 'selam.js'), "export const selam = 'Merhaba'\n")
  // Oturum deposu çalışma alanının dışında: ajanın araçları kendi kaydını görmesin.
  dataDir = await mkdtemp(path.join(tmpdir(), 'mini-dongu-veri-'))
  store = createSessionStore(path.join(dataDir, 'sessions'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
})

async function run(provider, extra = {}) {
  const session = await store.create()
  const events = []
  const result = await runAgent({
    provider,
    store,
    sessionID: session.id,
    prompt: 'selam.js içindeki metni değiştir',
    tools: defaultTools,
    agent: agents.build,
    permission: createPermissionService({ rules: agents.build.rules, ask: async () => 'once' }),
    root,
    retryDelayMs: 0,
    onEvent: (event) => events.push(event),
    ...extra,
  })
  return { result, events, session: await store.get(session.id) }
}

test('oku → düzenle → bitir: dosya değişir, geçmiş diske yazılır', async () => {
  const provider = createFakeProvider([
    { text: 'Okuyorum.', toolCalls: [{ id: 'c1', name: 'read', input: { path: 'selam.js' } }] },
    { toolCalls: [{ id: 'c2', name: 'edit', input: { path: 'selam.js', oldString: 'Merhaba', newString: 'Selam' } }] },
    { text: 'Tamamlandı.' },
  ])
  const { result, events, session } = await run(provider)
  assert.deepEqual(result, { finish: 'stop', text: 'Tamamlandı.', steps: 3 })
  assert.equal(await readFile(path.join(root, 'selam.js'), 'utf8'), "export const selam = 'Selam'\n")
  assert.deepEqual(
    session.messages.map((message) => message.role),
    ['user', 'assistant', 'tool', 'assistant', 'tool', 'assistant'],
  )
  // İkinci istek, ilk aracın sonucunu görmeli (geçmiş diskten yeniden okundu).
  assert.equal(provider.calls[1].messages.at(-1).parts[0].output, "1: export const selam = 'Merhaba'\n2: ")
  assert.ok(session.usage.input > 0)
  assert.deepEqual(
    events.filter((event) => event.type === 'step-start').map((event) => event.step),
    [1, 2, 3],
  )
})

test('araç hataları modele isError=true sonuç olarak döner, döngü sürer', async () => {
  const provider = createFakeProvider([
    {
      toolCalls: [
        { id: 'c1', name: 'edit', input: { path: 'selam.js', oldString: 'olmayan', newString: 'x' } },
        { id: 'c2', name: 'ucan_halı', input: {} },
        { id: 'c3', name: 'read', input: {} },
      ],
    },
    { text: 'Hataları gördüm.' },
  ])
  const { result } = await run(provider)
  assert.equal(result.finish, 'stop')
  const results = provider.calls[1].messages.at(-1).parts
  assert.ok(results.every((part) => part.isError))
  assert.match(results[0].output, /oldString bulunamadı/)
  assert.match(results[1].output, /adında kullanılabilir bir araç yok/)
  assert.match(results[2].output, /Zorunlu argüman eksik: path/)
})

test('kullanıcı reddederse tur durur; kalan çağrılar çalışmaz ama sonuç alır', async () => {
  const provider = createFakeProvider([
    {
      toolCalls: [
        { id: 'c1', name: 'bash', input: { command: 'rm -rf selam.js' } },
        { id: 'c2', name: 'write', input: { path: 'yeni.txt', content: 'x' } },
      ],
    },
  ])
  const permission = createPermissionService({ rules: agents.build.rules, ask: async () => ({ reply: 'reject' }) })
  const { result, session } = await run(provider, { permission })
  assert.equal(result.finish, 'rejected')
  assert.equal(await readFile(path.join(root, 'selam.js'), 'utf8'), "export const selam = 'Merhaba'\n")
  const parts = session.messages.at(-1).parts
  assert.equal(parts.length, 2)
  assert.match(parts[1].output, /çalıştırılmadı/)
})

test('açıklamalı ret modele düzeltme olarak gider ve döngü sürer', async () => {
  const provider = createFakeProvider([
    { toolCalls: [{ id: 'c1', name: 'bash', input: { command: 'rm -rf dist' } }] },
    { text: 'Anladım, silmiyorum.' },
  ])
  const permission = createPermissionService({
    rules: agents.build.rules,
    ask: async () => ({ reply: 'reject', message: 'silme, sadece listele' }),
  })
  const { result } = await run(provider, { permission })
  assert.equal(result.finish, 'stop')
  assert.match(provider.calls[1].messages.at(-1).parts[0].output, /silme, sadece listele/)
})

test('adım sınırında araçlar kapanır ve özet istenir', async () => {
  const provider = createFakeProvider((request) =>
    request.toolChoice === 'none'
      ? { text: 'Sınıra ulaştım, kalan iş: X.' }
      : { toolCalls: [{ id: `g${Math.random()}`, name: 'glob', input: { pattern: '*.js' } }] },
  )
  const { result } = await run(provider, { maxSteps: 3 })
  assert.equal(result.finish, 'max-steps')
  assert.equal(provider.calls.length, 3)
  const last = provider.calls[2]
  assert.equal(last.toolChoice, 'none')
  assert.equal(last.tools.length, defaultTools.length) // tanımlar önbellek öneki için yerinde kalır
  assert.equal(last.messages.at(-1).parts[0].text, MAX_STEPS_PROMPT)
})

test('plan ajanı: tümüyle yasak araçlar modele gösterilmez', async () => {
  const provider = createFakeProvider([{ text: 'Plan: önce testleri yaz.' }])
  const session = await store.create({ agent: 'plan' })
  await runAgent({
    provider,
    store,
    sessionID: session.id,
    prompt: 'planla',
    tools: defaultTools,
    agent: agents.plan,
    permission: createPermissionService({ rules: agents.plan.rules }),
    root,
  })
  const names = provider.calls[0].tools.map((tool) => tool.name)
  assert.ok(!names.includes('edit') && !names.includes('write'))
  assert.ok(names.includes('read') && names.includes('bash'))
})

test('geçici sağlayıcı hatasında yeniden dener', async () => {
  const provider = createFakeProvider((_request, index) =>
    index === 0 ? new ProviderError('meşgul', 503, '') : { text: 'ikinci denemede oldu' },
  )
  const { result, events } = await run(provider)
  assert.equal(result.text, 'ikinci denemede oldu')
  assert.equal(events.filter((event) => event.type === 'retry').length, 1)
})

test('503 "context deadline exceeded" taşma değildir: sıkıştırma yok, yeniden deneme var', async () => {
  assert.equal(isContextOverflow(new ProviderError('x', 400, 'prompt is too long: 210000 tokens')), true)
  assert.equal(isContextOverflow(new ProviderError('x', 413, '')), true)
  assert.equal(isContextOverflow(new ProviderError('x', 401, 'invalid x-api-key in request context')), false)
  const busy = new ProviderError('meşgul', 503, 'context deadline exceeded')
  assert.equal(isContextOverflow(busy), false)
  assert.equal(isRetryable(busy), true)
  const provider = createFakeProvider((_request, index) => (index === 0 ? busy : { text: 'tamam' }))
  const { result, events } = await run(provider)
  assert.equal(result.text, 'tamam')
  assert.ok(events.some((event) => event.type === 'retry'))
  assert.ok(!events.some((event) => event.type === 'compaction'))
})

test('boş asistan yanıtı geçmişe yazılmaz', async () => {
  // Tek adımlık sınırda model yine araç ister: çağrılar atılır, geriye boş bir mesaj kalmamalı.
  const provider = createFakeProvider(() => ({ toolCalls: [{ id: 'g1', name: 'glob', input: { pattern: '*' } }] }))
  const { result, session } = await run(provider, { maxSteps: 1 })
  assert.equal(result.finish, 'max-steps')
  assert.ok(session.messages.every((message) => message.parts.length > 0))
})

test('çökme sonrası: sonucu yazılmamış araç çağrısı "kesildi" sonucuyla kapanır', async () => {
  // Süreç araç çalışırken ölmüş gibi: asistanın araç çağrısı kayıtlı, sonucu yok.
  const session = await store.create()
  session.messages.push(textMessage('user', 'dosyaları bul'), {
    role: 'assistant',
    parts: [{ type: 'tool-call', id: 'c1', name: 'glob', input: { pattern: '*' } }],
  })
  await store.save(session)
  const provider = createFakeProvider([{ text: 'Kaldığım yerden sürdürüyorum.' }])
  await runAgent({
    provider,
    store,
    sessionID: session.id,
    prompt: 'devam et',
    tools: defaultTools,
    agent: agents.build,
    permission: createPermissionService({ rules: agents.build.rules }),
    root,
  })
  const sent = provider.calls[0].messages
  assert.deepEqual(
    sent.map((message) => message.role),
    ['user', 'assistant', 'tool', 'user'],
  )
  assert.match(sent[2].parts[0].output, /kesildi/)
})

test('oturum kaydı çalışma alanının dışında: grep ajanın kendi geçmişini bulmaz', async () => {
  // Araç argümanları araç çalışmadan önce diske yazılır; kayıt içerideyse grep deseni orada "bulurdu".
  const provider = createFakeProvider([
    { toolCalls: [{ id: 'g1', name: 'grep', input: { pattern: 'BENZERSIZ_DESEN_42' } }] },
    { text: 'Bulunamadı.' },
  ])
  await run(provider)
  assert.equal(provider.calls[1].messages.at(-1).parts[0].output, 'Eşleşme yok')
})
