// Uçtan uca: sahte sohbet uygulaması → HTTP webhook → Gateway → ajan → cevap. Ağ yalnızca 127.0.0.1.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createCliChannel, createFakeChatChannel, startFakeChatApp } from '../asama2_kanallar.js'
import { discoverSkills, formatSkillsForPrompt } from '../asama5_beceriler.js'
import { buildRegistry, createDemoModel, prepareWorkspace } from '../demo.js'
import { createGateway } from '../gateway.js'

const SIR = 'test-sirri'
let kok, app, gateway, op, cli

before(async () => {
  kok = await mkdtemp(join(tmpdir(), 'oc-gw-'))
  app = await startFakeChatApp({ secret: SIR })
  const { workspace, roots } = await prepareWorkspace(kok)
  const skills = [...(await discoverSkills(roots)).values()]
  cli = createCliChannel()
  gateway = await createGateway({
    token: 'tok',
    config: {
      session: { dmScope: 'per-channel-peer' },
      channels: { fakechat: { dmPolicy: 'pairing', allowFrom: ['patron'], groups: ['g1'], requireMention: true } },
    },
    channels: [cli, createFakeChatChannel({ apiBaseUrl: app.url, webhookSecret: SIR })],
    agents: { main: { workspace, model: createDemoModel() } },
    registry: buildRegistry([workspace, ...roots.map((r) => r.dir)]),
    skillsPrompt: async () => formatSkillsForPrompt(skills),
  }).start()
  app.webhookUrl = `${gateway.url}/channels/fakechat/webhook`
  op = await gateway.connectClient()
})
after(async () => {
  await gateway.stop()
  await app.close()
  await rm(kok, { recursive: true, force: true })
})

const yeniMesajlar = async (onceki, adet) => (await app.waitForMessages(onceki + adet)).slice(onceki)

test('yanlış webhook sırrı 401 alır ve hiçbir şey işlenmez', async () => {
  const durum = await app.userSays({ chatId: '1', fromId: '1', text: 'x', useSecret: 'yanlis-sir' })
  assert.equal(durum, 401)
  assert.equal(gateway.log.length, 0)
})

test('bilinmeyen kişi kod alır; operatör onaylayınca ajan cevap verir ve beceriyi okur', async () => {
  const n = app.outbox.length
  await app.userSays({ chatId: '42', fromId: '42', text: 'merhaba' })
  const [kodMesaji] = await yeniMesajlar(n, 1)
  const kod = /kodu ilet: ([A-Z2-9]{8})/.exec(kodMesaji.text)[1]
  assert.equal(gateway.runtime.transcripts.size, 0) // mesaj ajana ulaşmadı
  const onay = await op.request('pairing.approve', { channel: 'fakechat', code: kod })
  assert.deepEqual(onay.payload, { approved: true, senderId: '42' })
  await app.userSays({ chatId: '42', fromId: '42', text: 'Ankara hava nasıl?' })
  const [cevap] = await yeniMesajlar(n + 1, 1)
  assert.deepEqual(cevap, { chatId: '42', text: 'Ankara: 14°C, parçalı bulutlu.' })
  const kayit = gateway.runtime.transcripts.get('agent:main:fakechat:direct:42')
  assert.equal(kayit.find((m) => m.role === 'tool' && m.name === 'read') !== undefined, true) // önce SKILL.md okundu
  assert.ok(op.events.some((e) => e.event === 'agent' && e.payload.stream === 'tool'))
})

test('izin listesindeki kişi doğrudan konuşur; dış DM oturumunda tehlikeli araç reddedilir', async () => {
  const n = app.outbox.length
  await app.userSays({ chatId: '9', fromId: 'patron', text: 'ls çalıştır' })
  const [cevap] = await yeniMesajlar(n, 1)
  assert.match(cevap.text, /kullanılamayan araç: exec/)
  assert.equal((await cli.say('ls çalıştır')).text, 'Tamam: (sahte) ls çalıştırıldı') // ana oturum
})

test('grupta anılmadan cevap yok, anılınca grup oturumunda cevap; izinsiz grup engellenir', async () => {
  const n = app.outbox.length
  await app.userSays({ chatId: 'g1', chatType: 'group', fromId: '5', text: 'özet?' })
  await app.userSays({ chatId: 'g2', chatType: 'group', fromId: '5', text: '@claw özet' })
  await app.userSays({ chatId: 'g1', chatType: 'group', fromId: '5', text: '@claw özet' })
  const [cevap] = await yeniMesajlar(n, 1)
  assert.deepEqual(cevap, { chatId: 'g1', text: 'Özet: bugün 3 yeni mesaj, 1 toplantı.' })
  assert.ok(gateway.runtime.transcripts.has('agent:main:fakechat:group:g1'))
  assert.equal(gateway.runtime.transcripts.has('agent:main:fakechat:group:g2'), false)
})

test('kontrol düzlemi: send idempotent, agent yöntemi ana oturumda çalışır, node rolü kısıtlı', async () => {
  const n = app.outbox.length
  const istek = { channel: 'fakechat', to: '42', text: 'Toplantı 15:00', idempotencyKey: 'hatirlatma-1' }
  await op.request('send', istek)
  const tekrar = await op.request('send', istek)
  assert.equal(tekrar.replayed, true)
  await new Promise((r) => setTimeout(r, 100))
  assert.equal(app.outbox.length, n + 1) // tekrar eden istek ikinci mesaj göndermedi
  const ajan = await op.request('agent', { message: 'selam', idempotencyKey: 'a1' })
  assert.equal(ajan.payload.sessionKey, 'agent:main:main')
  const dugum = await gateway.connectClient({ role: 'node', name: 'telefon' })
  assert.equal((await dugum.request('send', istek)).error.code, 'FORBIDDEN')
  assert.deepEqual((await dugum.request('node.event', { kind: 'location', lat: 41 })).payload, { accepted: true })
  assert.ok(op.events.some((e) => e.event === 'node' && e.payload.from === 'telefon'))
})
