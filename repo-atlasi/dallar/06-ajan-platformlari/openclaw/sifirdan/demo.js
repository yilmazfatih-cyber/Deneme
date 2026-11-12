// Uçtan uca gösterim: sahte sohbet uygulaması ↔ webhook ↔ Gateway ↔ ajan. Ağ yalnızca 127.0.0.1, model sahte.
// Çalıştır: node demo.js

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCliChannel, createFakeChatChannel, startFakeChatApp } from './asama2_kanallar.js'
import { HEARTBEAT_TOKEN, ToolRegistry } from './asama4_ajan.js'
import { createReadTool, discoverSkills, formatSkillsForPrompt, isEligible } from './asama5_beceriler.js'
import { createGateway } from './gateway.js'

/** Kural tabanlı sahte model: katalogdan beceri konumunu bulur, okur, aracı çağırır, cevaplar. */
export function createDemoModel() {
  return {
    async complete({ system, messages }) {
      const last = messages.at(-1)
      const user = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
      if (last.role === 'tool') {
        const result = JSON.parse(last.content)
        if (last.name === 'read') {
          const city = /\p{Lu}\p{Ll}+/u.exec(user)?.[0] ?? 'İstanbul' // "Ankara'da" → "Ankara"
          return { toolCalls: [{ id: 't2', name: 'weather', args: { city } }] }
        }
        if (result.error) return { text: `Bunu yapamıyorum: ${result.error}` }
        if (last.name === 'weather') return { text: `${result.city}: ${result.tempC}°C, ${result.summary}.` }
        return { text: `Tamam: ${result.output}` }
      }
      if (/hava/i.test(user)) {
        const location = /<name>hava-durumu<\/name>\s*<description>[^<]*<\/description>\s*<location>([^<]+)</.exec(
          system,
        )?.[1]
        return { toolCalls: [{ id: 't1', name: 'read', args: { path: location } }] }
      }
      if (/çalıştır/i.test(user)) return { toolCalls: [{ id: 't3', name: 'exec', args: { command: 'ls' } }] }
      if (/kontrol/i.test(user)) return { text: HEARTBEAT_TOKEN } // izlenecek bir şey yok → sessiz
      if (/özet/i.test(user)) return { text: 'Özet: bugün 3 yeni mesaj, 1 toplantı.' }
      return { text: 'Merhaba! Nasıl yardımcı olabilirim?' }
    },
  }
}

export async function prepareWorkspace(root) {
  const workspace = join(root, 'workspace')
  const bundled = join(root, 'bundled-skills')
  await mkdir(join(workspace, 'skills', 'hava-durumu'), { recursive: true })
  await mkdir(join(bundled, 'hava-durumu'), { recursive: true })
  await mkdir(join(bundled, 'gizli-arac'), { recursive: true })
  await writeFile(join(workspace, 'AGENTS.md'), 'Kısa cevap ver. Emin değilsen sor.\n')
  await writeFile(join(workspace, 'SOUL.md'), 'Sakin, yardımsever ve Türkçe konuşan bir asistan.\n')
  const skill = (name, description, extra = '') =>
    `---\nname: ${name}\ndescription: ${description}\n${extra}---\n# ${name}\nweather aracını şehir adıyla çağır.\n`
  await writeFile(
    join(workspace, 'skills', 'hava-durumu', 'SKILL.md'),
    skill('hava-durumu', 'Hava durumu sorularını cevapla'),
  )
  await writeFile(join(bundled, 'hava-durumu', 'SKILL.md'), skill('hava-durumu', 'Paketle gelen eski sürüm'))
  await writeFile(
    join(bundled, 'gizli-arac', 'SKILL.md'),
    skill(
      'gizli-arac',
      'Kurulu olmayan bir CLI ister',
      'metadata: {"openclaw": {"requires": {"bins": ["olmayan-cli"]}}}\n',
    ),
  )
  return {
    workspace,
    roots: [
      { dir: join(workspace, 'skills'), source: 'workspace' },
      { dir: bundled, source: 'bundled' },
    ],
  }
}

export function buildRegistry(allowedRoots) {
  return new ToolRegistry()
    .register(createReadTool(allowedRoots))
    .register({
      name: 'weather',
      description: 'Şehir için (sahte) hava durumu.',
      parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
      execute: async ({ city }) => ({ city, tempC: 14, summary: 'parçalı bulutlu' }),
    })
    .register({
      name: 'exec',
      description: 'Kabuk komutu çalıştır (tehlikeli).',
      dangerous: true,
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
      execute: async ({ command }) => ({ output: `(sahte) ${command} çalıştırıldı` }),
    })
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'openclaw-mini-'))
  const secret = 'webhook-sirri'
  let clock = Date.parse('2026-11-09T08:00:00Z')
  const app = await startFakeChatApp({ secret })
  const { workspace, roots } = await prepareWorkspace(root)
  const skills = [...(await discoverSkills(roots)).values()].filter((s) => isEligible(s))
  const cli = createCliChannel()
  const gateway = await createGateway({
    token: 'operator-token',
    now: () => clock,
    config: {
      defaultAgentId: 'main',
      session: { dmScope: 'per-channel-peer' },
      channels: { fakechat: { dmPolicy: 'pairing', groups: ['grup-1'], requireMention: true } },
    },
    channels: [cli, createFakeChatChannel({ apiBaseUrl: app.url, webhookSecret: secret })],
    agents: { main: { workspace, model: createDemoModel() } },
    registry: buildRegistry([workspace, ...roots.map((r) => r.dir)]),
    skillsPrompt: async () => formatSkillsForPrompt(skills),
  }).start()
  app.webhookUrl = `${gateway.url}/channels/fakechat/webhook`
  const operator = await gateway.connectClient({ name: 'cli' })
  let shown = 0
  const show = (title) => {
    console.log(`\n=== ${title} ===`)
    for (const m of app.outbox.slice(shown)) console.log(`  → ${m.chatId}: ${m.text.replaceAll('\n', ' ')}`)
    shown = app.outbox.length
  }

  console.log('Uygun beceriler:', skills.map((s) => `${s.name} (${s.source})`).join(', '))
  await app.userSays({ chatId: '42', fromId: '42', fromName: 'Ayşe', text: 'merhaba' })
  await app.waitForMessages(1)
  show('1) Bilinmeyen kişi → eşleştirme kodu')
  const [pending] = (await operator.request('pairing.list', { channel: 'fakechat' })).payload
  console.log(
    'Operatör onayı:',
    (await operator.request('pairing.approve', { channel: 'fakechat', code: pending.code })).payload,
  )

  await app.userSays({ chatId: '42', fromId: '42', text: "İstanbul'da hava nasıl?" })
  await app.userSays({ chatId: '42', fromId: '42', text: 'şunu çalıştır: rm -rf /' })
  await app.userSays({ chatId: 'grup-1', chatType: 'group', fromId: '7', text: 'bugün ne var?' })
  await app.userSays({ chatId: 'grup-1', chatType: 'group', fromId: '7', text: '@claw özet geç' })
  await app.waitForMessages(4)
  show('2) Beceri okundu, tehlikeli araç ana oturum dışında reddedildi, grupta yalnızca anılınca cevap')

  console.log('\nCLI (ana oturum) tehlikeli aracı kullanabilir:', (await cli.say('ls çalıştır')).text)
  gateway.cron.add({
    name: 'gunluk-ozet',
    schedule: { kind: 'every', every: '1h' },
    message: 'Günün özetini çıkar',
    delivery: { channel: 'fakechat', to: '42' },
  })
  gateway.cron.add({
    name: 'nabiz',
    schedule: { kind: 'every', every: '30m' },
    message: 'Gelen kutusunu kontrol et',
    delivery: { channel: 'fakechat', to: '42' },
  })
  clock += 60 * 60 * 1000
  const runs = await gateway.cron.tick()
  console.log('Otomasyon koşuları:', runs.map((r) => `${r.sessionKey} teslim=${r.delivered}`).join(' | '))
  await app.waitForMessages(5)
  show('3) Zamanlanmış özet teslim edildi (HEARTBEAT_OK sessiz kaldı)')
  console.log(
    `\nKontrol düzlemi olay sayısı: ${operator.events.length}; günlük:`,
    gateway.log.map((l) => l.outcome).join(', '),
  )

  await gateway.stop()
  await app.close()
  await rm(root, { recursive: true, force: true })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
