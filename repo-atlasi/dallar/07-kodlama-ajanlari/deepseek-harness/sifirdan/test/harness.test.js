import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { State } from '../asama2_baglam.js'
import { fakeLlm, fsTools } from '../asama3_harness.js'
import {
  applyLayers,
  baseBundle,
  catalog,
  compose,
  dumpConfig,
  headlessBundle,
  interactiveBundle,
} from '../asama4_profil.js'

let root
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mini-dsh-'))
})
afterEach(async () => rm(root, { recursive: true, force: true }))

const writeThenRead = () => [
  { text: 'Yazıyorum.', toolCalls: [{ id: 't1', name: 'write_file', args: { path: 'not.md', content: 'dsh' } }] },
  { toolCalls: [{ id: 't2', name: 'read_file', args: { path: 'not.md' } }] },
  { text: 'Dosyada "dsh" yazıyor.' },
]

function build(layers, responses, requests = []) {
  const rows = applyLayers(...layers)
  const { app, fibers } = compose(rows)
  const adapter = app.ctx.plugin(fakeLlm, { responses, requests })
  app.ctx.plugin(fsTools, { root })
  return { app, fibers, rows, requests, adapter }
}

test('etkileşimli profil: sor → arayüz onaylar → yaz, oku, bitir', async () => {
  const { app, requests } = build(
    [baseBundle, interactiveBundle, [{ id: 'ui', config: { answers: ['allow'] } }]],
    writeThenRead(),
  )
  const result = await app.ctx.agentLoop.run('s1', 'not.md dosyasına dsh yaz ve doğrula')
  assert.deepEqual(result, { reason: 'stop', steps: 3 })
  assert.equal(await readFile(path.join(root, 'not.md'), 'utf8'), 'dsh')

  const types = app.ctx.sessions.events('s1').map((event) => event.type)
  assert.deepEqual(types.slice(0, 6), [
    'turn/start',
    'user/message',
    'step/start',
    'assistant/message',
    'tool/call',
    'tool/result',
  ])
  assert.equal(types.at(-1), 'turn/end')
  // Model geçmişi günlükten türetildi: ikinci istek, ilk aracın sonucunu içeriyor.
  assert.deepEqual(requests[1].messages.at(-1), {
    role: 'tool',
    id: 't1',
    name: 'write_file',
    content: 'not.md yazıldı',
    isError: false,
  })
  assert.ok(app.ctx.ui.lines.includes('onay? write_file → allow'))
  assert.ok(app.ctx.ui.lines.some((line) => line.endsWith('turn/end')))
})

test('başsız profil: onay servisi yok, "ask" yerine "deny"; model hatayı görür', async () => {
  const { app, requests, rows } = build(
    [baseBundle, headlessBundle],
    [
      { toolCalls: [{ id: 't1', name: 'write_file', args: { path: 'x', content: 'y' } }] },
      { text: 'Yazma iznim yok.' },
    ],
  )
  assert.match(dumpConfig(rows), /# approval: dsh-approval/)
  assert.equal(app.ctx.approval, undefined)
  await app.ctx.agentLoop.run('s2', 'yaz')
  const result = requests[1].messages.at(-1)
  assert.equal(result.isError, true)
  assert.match(result.content, /yasaklıyor/)
})

test('hat: kök dışı yol ve bilinmeyen araç isError olur; post-execute sonucu düzeltebilir', async () => {
  const { app, requests } = build(
    [baseBundle, [{ id: 'permission', config: { default: 'allow' } }]],
    [
      {
        toolCalls: [
          { id: 'a', name: 'read_file', args: { path: '../../etc/passwd' } },
          { id: 'b', name: 'uçan_halı', args: {} },
        ],
      },
      { text: 'tamam' },
    ],
  )
  app.ctx.plugin((ctx) =>
    ctx.on('tools/post-execute', async (call, result, next) => {
      const value = await next()
      return value.isError ? { ...value, content: `[düzeltildi] ${value.content}` } : value
    }),
  )
  await app.ctx.agentLoop.run('s3', 'dene')
  const [first, second] = requests[1].messages.slice(-2)
  assert.match(first.content, /^\[düzeltildi\] Kök dışı yol/)
  assert.match(second.content, /adında araç yok/)
})

test('sıcak değiştirme: servis kalkınca bağımlılar PENDING olur, dönünce kendiliğinden geri gelir', async () => {
  const { app, fibers, adapter } = build(
    [baseBundle, [{ id: 'permission', config: { default: 'allow' } }]],
    [{ text: 'bir' }],
  )
  const loop = fibers.get('agent-loop')
  assert.equal(loop.state, State.ACTIVE)
  await fibers.get('llm').dispose()
  assert.equal(loop.state, State.PENDING)
  assert.equal(adapter.state, State.PENDING) // bağdaştırıcı da ctx.llm'e bağımlıydı
  assert.equal(app.ctx.agentLoop, undefined)

  app.ctx.plugin(catalog['dsh-llm']) // servis geri geldi: bekleyenler yeniden yüklenir
  assert.equal(loop.state, State.ACTIVE)
  assert.equal(adapter.state, State.ACTIVE)
  await app.ctx.agentLoop.run('s4', 'selam')
  assert.equal(app.ctx.sessions.deriveMessages('s4').at(-1).text, 'bir')

  // Bağdaştırıcıyı değiştir: eskisini kaldır, yenisini tak; döngü hiç değişmez.
  await adapter.dispose()
  await assert.rejects(app.ctx.agentLoop.run('s5', 'selam'), /bağdaştırıcısı yok/)
  app.ctx.plugin(fakeLlm, { responses: [{ text: 'yeni modelden merhaba' }] })
  await app.ctx.agentLoop.run('s6', 'selam')
  assert.equal(app.ctx.sessions.deriveMessages('s6').at(-1).text, 'yeni modelden merhaba')
})

test('agent/turn-stopping: bir eklenti metin döndürürse tur o metinle sürer', async () => {
  const { app } = build([baseBundle], [{ text: 'ilk cevap' }, { text: 'kontrol ettim' }])
  let asked = false
  app.ctx.plugin((ctx) =>
    ctx.on('agent/turn-stopping', async () => {
      if (asked) return undefined
      asked = true
      return 'Testleri de çalıştırdın mı?'
    }),
  )
  const result = await app.ctx.agentLoop.run('s5', 'başla')
  assert.equal(result.steps, 2)
  const synthetic = app.ctx.sessions.events('s5').find((event) => event.data.synthetic)
  assert.equal(synthetic.data.text, 'Testleri de çalıştırdın mı?')
})

test("katmanlar: yama config'i bütünüyle değiştirir; bilinmeyen satır yüksek sesle hata verir", () => {
  const rows = applyLayers(baseBundle, [{ id: 'permission', config: { default: 'allow' } }])
  assert.deepEqual(rows.find((row) => row.id === 'permission').config, { default: 'allow' })
  assert.throws(() => applyLayers(baseBundle, [{ id: 'yok', disabled: true }]), /bilinmeyen satırı/)
  assert.throws(() => applyLayers(baseBundle, baseBundle), /tekrarlandı/)
  assert.throws(() => compose([{ id: 'x', name: 'dsh-olmayan' }]), /Katalogda yok/)
})
