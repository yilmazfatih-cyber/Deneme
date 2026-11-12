import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CommandRegistry, CommandService } from '../asama2_komutlar.js'
import { ExtensionHost } from '../asama3_eklenti_sunucusu.js'
import { eklentileriTara, varsayilanNoktalar } from '../asama4_katki_noktalari.js'
import { tezgahKur } from '../tezgah.js'

const ORNEKLER = fileURLToPath(new URL('../ornek-eklentiler', import.meta.url))
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-vscode-'))
after(() => fs.rmSync(gecici, { recursive: true, force: true }))

/** Test için geçici bir CommonJS eklentisi yazar. */
function eklentiYaz(kok, ad, kod, contributes = {}, activationEvents = []) {
  const dizin = path.join(kok, ad)
  fs.mkdirSync(dizin, { recursive: true })
  const manifest = {
    name: ad,
    publisher: 'test',
    version: '1.0.0',
    main: './extension.js',
    activationEvents,
    contributes,
  }
  fs.writeFileSync(path.join(dizin, 'package.json'), JSON.stringify(manifest))
  fs.writeFileSync(path.join(dizin, 'extension.js'), kod)
}

async function hostKur(kok) {
  const { eklentiler } = eklentileriTara(kok, varsayilanNoktalar())
  const kayit = new CommandRegistry()
  /** @type {ExtensionHost} */
  let host
  const komutlar = new CommandService(kayit, { activateByEvent: (o) => host.activateByEvent(o) })
  host = new ExtensionHost({ eklentiler, kayit, komutlar })
  await host.start()
  return { host, kayit, komutlar }
}

test('tezgâh: palet bildirimden dolar, eklenti ilk kullanımda yüklenir ve belgeyi değiştirir', async () => {
  const t = await tezgahKur({ eklentiKoku: ORNEKLER, metin: 'istanbul ve izmir' })
  try {
    assert.deepEqual(t.taramaHatalari, [])
    const palet = t.palet()
    assert.ok(palet.some((p) => p.etiket === 'Metin: Belgeyi Büyük Harfe Çevir' && p.kisayol === 'ctrl+k ctrl+u'))
    assert.equal(t.host.activationEventIsDone('onCommand:metin.buyukHarf'), false, 'henüz yüklenmedi')

    await t.dagitici.dispatch('ctrl+k')
    const r = await t.dagitici.dispatch('ctrl+u')
    assert.equal(r.durum, 'çalıştı: metin.buyukHarf')
    assert.equal(t.tampon.getValue(), 'İSTANBUL VE İZMİR', 'Türkçe büyük harf: i → İ')
    assert.equal(t.host.activationEventIsDone('onCommand:metin.buyukHarf'), true)
    assert.ok(t.host.mesajlar.some((m) => m.seviye === 'bilgi' && m.eklenti === 'atlas.buyuk-harf'))
  } finally {
    await t.kapat()
  }
})

test('tezgâh: salt okunur editörde kısayol çalışmaz (when)', async () => {
  const t = await tezgahKur({ eklentiKoku: ORNEKLER, metin: 'abc' })
  try {
    t.baglam.set('editorReadonly', true)
    await t.dagitici.dispatch('ctrl+k')
    await t.dagitici.dispatch('ctrl+u')
    assert.equal(t.tampon.getValue(), 'abc')
  } finally {
    await t.kapat()
  }
})

test('bozuk eklenti ana tarafı ve diğer eklentileri etkilemez', async () => {
  const t = await tezgahKur({ eklentiKoku: ORNEKLER, metin: 'ı' })
  try {
    await assert.rejects(t.komutlar.executeCommand('hatali.calis'), /bulunamadı/)
    assert.ok(t.host.mesajlar.some((m) => m.seviye === 'hata' && /Bilerek bozuldum/.test(m.metin)))
    assert.equal(await t.komutlar.executeCommand('metin.buyukHarf'), 'I')
  } finally {
    await t.kapat()
  }
})

test('yoğun çalışan eklenti ana iş parçacığını dondurmaz', async () => {
  const kok = path.join(gecici, 'yogun')
  eklentiYaz(
    kok,
    'yogun',
    `const vscode = require('vscode')
exports.activate = (c) => c.subscriptions.push(vscode.commands.registerCommand('yogun.hesapla', () => {
  const bitis = Date.now() + 300
  let n = 0
  while (Date.now() < bitis) n++
  return n > 0
}))`,
    { commands: [{ command: 'yogun.hesapla', title: 'Yoğun Hesap' }] },
  )
  const { host, komutlar } = await hostKur(kok)
  try {
    let tik = 0
    const sayac = setInterval(() => tik++, 20)
    const sonuc = await komutlar.executeCommand('yogun.hesapla')
    clearInterval(sayac)
    assert.equal(sonuc, true)
    assert.ok(tik >= 5, `ana iş parçacığı bu sırada ${tik} kez tıkladı`)
  } finally {
    await host.stop()
  }
})

test('eklenti sunucusu çökerse bekleyen çağrılar reddedilir, ana taraf ayakta kalır', async () => {
  const kok = path.join(gecici, 'cokme')
  eklentiYaz(
    kok,
    'cokertici',
    `const vscode = require('vscode')
exports.activate = (c) => c.subscriptions.push(vscode.commands.registerCommand('cok.simdi', () => process.exit(3)))`,
    { commands: [{ command: 'cok.simdi', title: 'Çök' }] },
  )
  const { host, komutlar } = await hostKur(kok)
  await assert.rejects(komutlar.executeCommand('cok.simdi'), /Eklenti sunucusu kapandı/)
  assert.equal(host.durum, 'coktu')
  assert.equal(host.cikisKodu, 3)
  assert.ok(host.mesajlar.some((m) => /beklenmedik/.test(m.metin)))
  await host.stop()
})

test('"*" etkinleştirme olayı açılışta yükler; eklentiler birbirinin komutunu çağırabilir', async () => {
  const kok = path.join(gecici, 'yildiz')
  eklentiYaz(
    kok,
    'saglayici',
    `const vscode = require('vscode')
exports.activate = (c) => c.subscriptions.push(vscode.commands.registerCommand('saglayici.kare', (x) => x * x))`,
    {},
    ['*'],
  )
  eklentiYaz(
    kok,
    'tuketici',
    `const vscode = require('vscode')
exports.activate = (c) => c.subscriptions.push(vscode.commands.registerCommand('tuketici.hesap', async () => {
  return (await vscode.commands.executeCommand('saglayici.kare', 7)) + 1
}))`,
    { commands: [{ command: 'tuketici.hesap', title: 'Hesap' }] },
  )
  const { host, kayit, komutlar } = await hostKur(kok)
  try {
    assert.ok(kayit.getCommand('saglayici.kare'), "'*' eklentisi açılışta komutunu kaydetti")
    assert.equal(await komutlar.executeCommand('tuketici.hesap'), 50)
  } finally {
    await host.stop()
  }
})
