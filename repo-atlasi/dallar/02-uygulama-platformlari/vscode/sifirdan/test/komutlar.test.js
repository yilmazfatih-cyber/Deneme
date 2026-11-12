import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CommandRegistry,
  CommandService,
  ContextKeyService,
  KeybindingDispatcher,
  KeybindingResolver,
  evaluateWhen,
  normalizeChord,
  parseWhen,
} from '../asama2_komutlar.js'

function baglam(degerler) {
  const b = new ContextKeyService()
  for (const [k, v] of Object.entries(degerler)) b.set(k, v)
  return b
}

test('komut kaydı: gölgeleme ve dispose ile geri alma', async () => {
  const kayit = new CommandRegistry()
  const servis = new CommandService(kayit)
  kayit.registerCommand('selam', () => 'eski')
  const yeni = kayit.registerCommand('selam', () => 'yeni')
  assert.equal(await servis.executeCommand('selam'), 'yeni')
  yeni.dispose()
  assert.equal(await servis.executeCommand('selam'), 'eski')
  await assert.rejects(servis.executeCommand('yok'), /bulunamadı/)
})

test('kayıtlı olmayan komut önce onCommand: olayını tetikler', async () => {
  const kayit = new CommandRegistry()
  const olaylar = []
  const servis = new CommandService(kayit, {
    activateByEvent: async (olay) => {
      olaylar.push(olay)
      kayit.registerCommand('gec.yuklenen', (x) => x * 2)
    },
  })
  assert.equal(await servis.executeCommand('gec.yuklenen', 21), 42)
  assert.deepEqual(olaylar, ['onCommand:gec.yuklenen'])
})

test('when: öncelik && > || ve ! terime bağlanır', () => {
  const b = baglam({ a: true, b: false, c: true })
  assert.equal(evaluateWhen(parseWhen('a && b || c'), b), true)
  assert.equal(evaluateWhen(parseWhen('a && (b || !c)'), b), false)
  assert.equal(evaluateWhen(parseWhen('!b && a'), b), true)
  // Ayırt edici değerler: doğru gruplama (a && b) || c → true; yanlış gruplama a && (b || c) → false.
  assert.equal(evaluateWhen(parseWhen('a && b || c'), baglam({ a: false, b: false, c: true })), true)
  assert.deepEqual(parseWhen('a && b || c'), {
    tur: 'or',
    parcalar: [
      {
        tur: 'and',
        parcalar: [
          { tur: 'tanimli', anahtar: 'a' },
          { tur: 'tanimli', anahtar: 'b' },
        ],
      },
      { tur: 'tanimli', anahtar: 'c' },
    ],
  })
  assert.deepEqual(parseWhen('a || b && c'), {
    tur: 'or',
    parcalar: [
      { tur: 'tanimli', anahtar: 'a' },
      {
        tur: 'and',
        parcalar: [
          { tur: 'tanimli', anahtar: 'b' },
          { tur: 'tanimli', anahtar: 'c' },
        ],
      },
    ],
  })
})

test('when: eşitlik, regex, sayısal karşılaştırma, in / not in', () => {
  const b = baglam({
    resourceExtname: '.md',
    editorLangId: 'markdown',
    'config.editor.tabSize': 4,
    acikDosya: 'notlar.md',
    favoriler: ['notlar.md', 'plan.md'],
  })
  assert.equal(evaluateWhen(parseWhen("editorLangId == 'markdown'"), b), true)
  assert.equal(evaluateWhen(parseWhen('editorLangId != markdown'), b), false)
  assert.equal(evaluateWhen(parseWhen('resourceExtname =~ /\\.(md|txt)$/'), b), true)
  assert.equal(evaluateWhen(parseWhen('config.editor.tabSize == 4'), b), true, 'gevşek eşitlik: 4 == "4"')
  assert.equal(evaluateWhen(parseWhen('config.editor.tabSize >= 2 && config.editor.tabSize < 8'), b), true)
  assert.equal(evaluateWhen(parseWhen('acikDosya in favoriler'), b), true)
  assert.equal(evaluateWhen(parseWhen('acikDosya not in favoriler'), b), false)
})

test('when: sözdizimi hataları açık mesaj verir', () => {
  assert.throws(() => parseWhen('a && '), /Anahtar bekleniyordu/)
  assert.throws(() => parseWhen('(a || b'), /'\)' bekleniyordu/)
  assert.throws(() => parseWhen('a b'), /Fazladan jeton/)
})

test('kapsamlı bağlam üst bağlama düşer', () => {
  const pencere = baglam({ tema: 'koyu', editorTextFocus: false })
  const editor = pencere.createScoped()
  editor.set('editorTextFocus', true)
  assert.equal(editor.get('tema'), 'koyu')
  assert.equal(editor.get('editorTextFocus'), true)
  assert.equal(pencere.get('editorTextFocus'), false)
})

test('akor normalizasyonu', () => {
  assert.equal(normalizeChord('Shift+Ctrl+P'), 'ctrl+shift+p')
  assert.throws(() => normalizeChord('ctrl+shift'), /Geçersiz akor/)
})

test('tuş çözümleme: iki akorlu kısayol, when filtresi, kullanıcının üstünlüğü, "-komut" silme', () => {
  const varsayilan = [
    { key: 'ctrl+k ctrl+c', command: 'yorumEkle', when: 'editorTextFocus' },
    { key: 'ctrl+k ctrl+u', command: 'yorumKaldir', when: 'editorTextFocus' },
    { key: 'ctrl+s', command: 'kaydet' },
    { key: 'f2', command: 'yenidenAdlandir', when: 'editorHasRenameProvider' },
  ]
  const kullanici = [{ key: 'ctrl+s', command: 'hepsiniKaydet' }, { command: '-yorumKaldir' }]
  const r = new KeybindingResolver(varsayilan, kullanici)
  const b = baglam({ editorTextFocus: true })
  assert.deepEqual(r.resolve(b, [], 'ctrl+k'), { tur: 'devami-bekleniyor' })
  assert.deepEqual(r.resolve(b, ['ctrl+k'], 'ctrl+c'), { tur: 'bulundu', commandId: 'yorumEkle', args: undefined })
  assert.deepEqual(r.resolve(b, ['ctrl+k'], 'ctrl+u'), { tur: 'yok' }, 'kullanıcı silmiş')
  assert.equal(r.resolve(b, [], 'ctrl+s').commandId, 'hepsiniKaydet', 'son kaydedilen kazanır')
  assert.deepEqual(r.resolve(b, [], 'f2'), { tur: 'yok' }, 'when tutmuyor')
  assert.deepEqual(r.resolve(baglam({}), [], 'ctrl+k'), { tur: 'yok' }, 'odak yokken akor başlamaz')
  assert.equal(r.lookupKeybinding('yorumEkle'), 'ctrl+k ctrl+c')
})

test('dağıtıcı akor durumunu tutar ve komutu çalıştırır', async () => {
  const kayit = new CommandRegistry()
  const calisanlar = []
  kayit.registerCommand('yorumEkle', () => calisanlar.push('yorum'))
  const r = new KeybindingResolver([{ key: 'ctrl+k ctrl+c', command: 'yorumEkle' }])
  const d = new KeybindingDispatcher(r, new CommandService(kayit), baglam({}))
  assert.match((await d.dispatch('ctrl+k')).durum, /bekleniyor/)
  assert.equal((await d.dispatch('ctrl+c')).durum, 'çalıştı: yorumEkle')
  assert.equal((await d.dispatch('ctrl+c')).durum, 'eşleşme yok', 'akor sıfırlandı')
  assert.deepEqual(calisanlar, ['yorum'])
})
