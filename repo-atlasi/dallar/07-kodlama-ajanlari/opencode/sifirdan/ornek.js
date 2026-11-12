// Uçtan uca örnek: geçici bir klasörde mini ajanı çalıştırır.
//
//   node ornek.js                 → senaryolu sahte modelle (internet gerekmez)
//   MINI_SHAPE=openai-compatible MINI_BASE_URL=http://127.0.0.1:11434/v1 MINI_MODEL=qwen3 node ornek.js "görev"
//                                 → gerçek bir yerel modelle (ör. Ollama'nın OpenAI uyumlu ucu)
//
// İzin soruları terminalde sorulur: e = bir kez, h = her zaman, başka bir şey = reddet.
// Terminal yoksa (ör. çıktı bir dosyaya yönlendirildiyse) ya da --evet verildiyse "bir kez" sayılır.

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { createFakeProvider, createHttpProvider } from './asama1_saglayici.js'
import { defaultTools } from './asama2_araclar.js'
import { agents, createPermissionService } from './asama3_izinler.js'
import { runAgent } from './asama4_dongu.js'
import { createSessionStore } from './asama5_oturum.js'

const root = await mkdtemp(path.join(tmpdir(), 'mini-opencode-'))
await writeFile(path.join(root, 'selam.js'), "export const selam = (ad) => 'Merhaba ' + ad\n")

const provider = process.env.MINI_SHAPE
  ? createHttpProvider({
      shape: process.env.MINI_SHAPE,
      baseURL: process.env.MINI_BASE_URL,
      model: process.env.MINI_MODEL,
      apiKey: process.env.MINI_API_KEY,
    })
  : createFakeProvider([
      { text: 'Önce dosyaları bulayım.', toolCalls: [{ id: 'c1', name: 'glob', input: { pattern: '**/*.js' } }] },
      { toolCalls: [{ id: 'c2', name: 'read', input: { path: 'selam.js' } }] },
      {
        toolCalls: [
          {
            id: 'c3',
            name: 'edit',
            input: { path: 'selam.js', oldString: "'Merhaba ' + ad", newString: '`Merhaba ${ad}!`' },
          },
        ],
      },
      { text: 'selam.js içinde dize birleştirmeyi şablon dizesine çevirdim.' },
    ])

const args = process.argv.slice(2).filter((arg) => arg !== '--evet')
const interactive = process.stdin.isTTY && !process.argv.includes('--evet')
const terminal = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null
const permission = createPermissionService({
  rules: [...agents.build.rules, { action: 'edit', resource: '*', effect: 'ask' }],
  ask: async (request) => {
    const question = `İzin: ${request.action} ${request.resources.join(', ')} [e/h/r] `
    if (!terminal) {
      console.log(`${question}→ otomatik: bir kez`)
      return 'once'
    }
    const answer = await terminal.question(question)
    if (answer === 'e') return 'once'
    if (answer === 'h') return 'always'
    return { reply: 'reject' }
  },
})

// Oturum verisi çalışma alanının DIŞINDA durur: içeride olsaydı ajanın grep/glob araçları kendi konuşma
// kaydını bulur, write/edit onu bozabilirdi. opencode da veritabanını küresel veri klasöründe tutar
// (packages/core/src/database/database.ts).
const dataDir = await mkdtemp(path.join(tmpdir(), 'mini-opencode-veri-'))
const store = createSessionStore(path.join(dataDir, 'sessions'))
const session = await store.create({ agent: 'build' })
const result = await runAgent({
  provider,
  store,
  sessionID: session.id,
  prompt: args[0] ?? 'selam.js dosyasını şablon dizesi kullanacak şekilde düzenle',
  tools: defaultTools,
  agent: agents.build,
  permission,
  root,
  onEvent: (event) => {
    if (event.type === 'text') console.log(`model: ${event.text}`)
    if (event.type === 'tool-call') console.log(`araç → ${event.call.name} ${JSON.stringify(event.call.input)}`)
    if (event.type === 'tool-result') console.log(`araç ← ${event.result.output.split('\n')[0]}`)
  },
})
terminal?.close()
console.log(`\nbitti: ${result.finish}, ${result.steps} adım. Çalışma klasörü: ${root} · oturumlar: ${dataDir}`)
