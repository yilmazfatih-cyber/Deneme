// Uçtan uca gösteri: `node demo.js`
// Tezgâhı kurar, komut paletini yazdırır, "ctrl+k ctrl+u" akorunu basar ve eklentinin
// tembel yüklenip belgeyi değiştirdiğini gösterir.

import { fileURLToPath } from 'node:url'
import { tezgahKur } from './tezgah.js'

const eklentiKoku = fileURLToPath(new URL('./ornek-eklentiler', import.meta.url))
const t = await tezgahKur({ eklentiKoku, metin: 'istanbul ve izmir\nırmak ılık' })

console.log('Tarama hataları :', t.taramaHatalari.length ? t.taramaHatalari : 'yok')
console.log('Komut paleti    :')
for (const p of t.palet()) console.log(`  - ${p.etiket}${p.kisayol ? `  [${p.kisayol}]` : ''}  (${p.eklenti})`)
console.log('Etkin mi?       :', t.host.activationEventIsDone('onCommand:metin.buyukHarf'))

console.log('ctrl+k          :', (await t.dagitici.dispatch('ctrl+k')).durum)
const r = await t.dagitici.dispatch('ctrl+u')
console.log('ctrl+u          :', r.durum)
console.log('Belge           :', JSON.stringify(t.tampon.getValue()))
console.log('Etkin mi?       :', t.host.activationEventIsDone('onCommand:metin.buyukHarf'))

try {
  await t.komutlar.executeCommand('hatali.calis')
} catch (e) {
  console.log('Bozuk eklenti   :', e.message)
}
console.log('Mesajlar        :')
for (const m of t.host.mesajlar) console.log(`  [${m.seviye}] ${m.metin}${m.eklenti ? ` (${m.eklenti})` : ''}`)
await t.kapat()
