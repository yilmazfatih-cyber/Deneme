// Uçtan uca örnek: `node ornek.js` — taban + etkileşimli paket + bir yama ile mini harness'ı kurar,
// senaryolu modelle bir tur çalıştırır, sonra arayüz satırlarını ve eklenti durumlarını yazdırır.

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fakeLlm, fsTools } from './asama3_harness.js'
import { applyLayers, baseBundle, compose, dumpConfig, interactiveBundle } from './asama4_profil.js'

const root = await mkdtemp(path.join(tmpdir(), 'mini-dsh-ornek-'))
const rows = applyLayers(baseBundle, interactiveBundle, [
  // Kullanıcı yaması: arayüz ilk onay sorusuna "allow" desin.
  { id: 'ui', config: { answers: ['allow'] } },
])
console.log('--- dump-config ---')
console.log(dumpConfig(rows))

const { app } = compose(rows)
// Dışarıdan eklenen iki eklenti: sahte model bağdaştırıcısı ve dosya araçları.
app.ctx.plugin(fakeLlm, {
  responses: [
    {
      text: 'Notu yazıyorum.',
      toolCalls: [{ id: 't1', name: 'write_file', args: { path: 'not.md', content: 'merhaba' } }],
    },
    { toolCalls: [{ id: 't2', name: 'read_file', args: { path: 'not.md' } }] },
    { text: 'not.md oluşturuldu ve içeriği doğrulandı.' },
  ],
})
app.ctx.plugin(fsTools, { root })
console.log('\n--- eklenti durumları ---')
for (const item of app.report()) console.log(`${item.state.padEnd(8)} ${item.name}`)

// Araç sonuçlarını izleyen bağımsız bir gözlemci eklenti: kimse onu bilmez, olaylar bağlar.
app.ctx.plugin((ctx) =>
  ctx.on('tools/result', (call, result) => console.log(`[gözlemci] ${call.name}: ${result.content}`)),
)

console.log('\n--- tur ---')
const result = await app.ctx.agentLoop.run('oturum-1', 'not.md dosyasına merhaba yaz ve kontrol et')
console.log(`\n--- arayüz satırları (${result.steps} adım, ${result.reason}) ---`)
console.log(app.ctx.ui.lines.join('\n'))
