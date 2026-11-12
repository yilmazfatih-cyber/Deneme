import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  bildirimiDogrula,
  eklentileriTara,
  etkinlestirmeOlaylari,
  katkilariDagit,
  varsayilanNoktalar,
} from '../asama4_katki_noktalari.js'

const ORNEKLER = fileURLToPath(new URL('../ornek-eklentiler', import.meta.url))

test('örnek eklentiler hatasız taranır; kod çalıştırılmadan katkılar okunur', () => {
  const noktalar = varsayilanNoktalar()
  const { eklentiler, hatalar } = eklentileriTara(ORNEKLER, noktalar)
  assert.deepEqual(hatalar, [])
  assert.deepEqual(
    eklentiler.map((e) => e.id),
    ['atlas.buyuk-harf', 'atlas.hatali'],
  )
  const komutlar = []
  noktalar.setHandler('commands', (katkilar) => {
    for (const k of katkilar) komutlar.push(...k.deger.map((c) => `${k.eklenti}:${c.command}`))
  })
  katkilariDagit(eklentiler, noktalar)
  assert.deepEqual(komutlar, ['atlas.buyuk-harf:metin.buyukHarf', 'atlas.hatali:hatali.calis'])
})

test('komut katkısı örtük onCommand: olayı üretir; main yoksa olay yoktur', () => {
  const noktalar = varsayilanNoktalar()
  const manifest = {
    name: 'x',
    publisher: 'p',
    version: '1.0.0',
    main: './e.js',
    activationEvents: ['onLanguage:markdown'],
    contributes: { commands: [{ command: 'x.bir', title: 'Bir' }] },
  }
  assert.deepEqual(etkinlestirmeOlaylari(manifest, noktalar), ['onLanguage:markdown', 'onCommand:x.bir'])
  assert.deepEqual(etkinlestirmeOlaylari({ ...manifest, main: undefined }, noktalar), [])
})

test('bildirim doğrulama hataları', () => {
  const noktalar = varsayilanNoktalar()
  const { hatalar } = bildirimiDogrula(
    {
      name: 'Buyuk Harf',
      publisher: 'p',
      contributes: {
        commands: [{ command: 'a' }],
        keybindings: [{ command: 'a', key: 'ctrl+', when: 'a &&' }],
        configuration: { properties: { 'a.b': { type: 'number', default: 'iki' } } },
        renkler: {},
      },
    },
    noktalar,
  )
  const metin = hatalar.join('\n')
  assert.match(metin, /"version" alanı zorunlu/)
  assert.match(metin, /"name" küçük harf/)
  assert.match(metin, /'a' için "title" zorunlu/)
  assert.match(metin, /geçersiz tuş 'ctrl\+'/)
  assert.match(metin, /geçersiz when 'a &&'/)
  assert.match(metin, /'a.b' varsayılanı number değil/)
  assert.match(metin, /bilinmeyen katkı noktası 'renkler'/)
})
